// My characters, the pure part (issue #308): the limits, the file and how a file that fails is refused, the list's operations, storage that
// throws, and the party the lobby builds for newGame. The client imports the rules as ./shared, so the test lays the two side by side in a
// temporary folder, as actionpanel.test.js does. The characters are invented and use only SRD content.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'mychars-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const M = await import(pathToFileURL(join(tmp, 'mycharacters.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));

const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const fighter = (name, over = {}) => ({ name, class: 'fighter', level: 3, subclass: 'champion', abilities: A, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, ...over });
const base = fighter('Tessa');
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('the sheet used here passes validate (the tests below rest on it)', () => assert.deepEqual(M.sheetProblems(base), []));

test('limits are one object and sheetProblems applies them on top of validate', () => {
  assert.deepEqual([M.LIMITS.partyMin, M.LIMITS.partyMax, M.LIMITS.levelMin, M.LIMITS.levelMax, M.LIMITS.saved], [1, 6, 1, 20, 20]);
  assert.match(M.sheetProblems(fighter('X', { level: 21 }))[0], /level/i);
  assert.match(M.sheetProblems(fighter(''))[0], /name/);
  assert.match(M.sheetProblems(fighter('X', { spells: ['not-an-srd-spell'] }))[0], /spell|not/i);
  assert.match(M.sheetProblems(fighter('X', { homebrew: true }))[0], /not something a sheet has/);
});

test('a file made here reads back whole, and its text round-trips', () => {
  const f = M.makeFile(base, { how: 'built' });
  assert.equal(f.format, 'hextable-character'); assert.equal(f.v, 1); assert.match(f.cid, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(f.born, { level: 3, how: 'built', by: 'self' }); assert.deepEqual([f.blocks, f.keys, f.parked], [[], {}, []]);
  const r = M.parseFile(M.fileText(f));
  assert.ok(r.ok, r.problems.join()); assert.deepEqual(r.file, f);
  assert.match(M.fileName(f), /^tessa\.hextable-character\.json$/);
  assert.equal(M.fileName(M.makeFile(fighter('Ünï ../x'))), 'n-x.hextable-character.json');
  assert.notEqual(M.newCid(), M.newCid());
});

test('a file that fails says why and gives no file', () => {
  const f = M.makeFile(base), put = (o) => M.parseFile(JSON.stringify({ ...f, ...o }));
  const bad = (r, re) => { assert.equal(r.ok, false); assert.equal(r.file, null); assert.match(r.problems.join(' | '), re); };
  bad(M.parseFile('nope'), /not JSON/);
  bad(M.parseFile('[1]'), /one record/);
  bad(M.parseFile(42), /not a text file/);
  bad(put({ format: 'x' }), /not a Hextable character file/);
  bad(put({ v: 2 }), /version 1/);
  bad(put({ extra: 1 }), /field it should not: "extra"/);
  bad(put({ cid: 'short' }), /cid/);
  bad(put({ cid: 'a b c d e f g h i j k l m' }), /cid/);
  bad(put({ sheet: undefined }), /no sheet/);
  bad(put({ sheet: { ...base, level: 40 } }), /cannot be played/);
  bad(put({ sheet: { ...base, spells: ['wish-of-the-owner'] } }), /cannot be played/);
  bad(put({ born: { level: 0, how: 'built', by: 'self' } }), /born/);
  bad(put({ born: { level: 3, how: 'magic', by: 'self' } }), /born/);
  bad(put({ edits: [{ at: 'yesterday', fields: ['spells'] }] }), /edits/);
  bad(put({ edits: [{ at: '2026-11-14', fields: ['spells with values: x'] }] }), /edits/);
  bad(put({ edits: 'many' }), /edits/);
  bad(M.parseFile(JSON.stringify({ ...f, pad: 'x'.repeat(M.LIMITS.fileBytes) })), /KB/);
  assert.match(put({ extra: 1, cid: 'x' }).problems.join('|'), /extra[\s\S]*cid/);          // every problem is listed, not only the first
});

test('what a file claims beyond the sheet is not carried: blocks and keys are dropped with a note, "by table" counts as the player\'s', () => {
  const f = M.makeFile(base), r = M.parseFile(JSON.stringify({ ...f, blocks: [{ sig: 'x' }], keys: { k: 'v' }, parked: [{ kind: 'spell', id: 'x', name: 'x' }], needs: { homebrew: [{ id: 'x' }] }, born: { level: 3, how: 'table', by: 'table' }, edits: [{ at: '2026-11-14', fields: ['spells'] }] }));
  assert.ok(r.ok);
  assert.deepEqual([r.file.blocks, r.file.keys, r.file.parked, r.file.needs.homebrew], [[], {}, [], []]);
  assert.equal(r.file.born.by, 'self'); assert.equal(r.notes.length, 2);
  assert.deepEqual(r.file.edits, [{ at: '2026-11-14', fields: ['spells'] }]);
});

test('the list: add, refuse a second of the same id, refuse past the limit, rename, edit, duplicate, remove; the old list is never changed', () => {
  const day = '2026-11-14';
  let list = [];
  const a = M.addFile(list, M.makeFile(base)); assert.ok(a.ok); assert.equal(list.length, 0); list = a.list;
  assert.match(M.addFile(list, list[0]).error, /already in My characters/);
  const renamed = M.renameFile(list, list[0].cid, '  Tessa the Bold ', day);
  assert.equal(renamed.list[0].sheet.name, 'Tessa the Bold'); assert.deepEqual(renamed.list[0].edits, [{ at: day, fields: ['name'] }]); assert.equal(list[0].sheet.name, 'Tessa');
  assert.match(M.renameFile(list, list[0].cid, '   ').error, /name/);
  assert.equal(M.renameFile(list, list[0].cid, 'Tessa').list, list);                                          // no change, no record
  const edited = M.editFile(renamed.list, list[0].cid, { ...renamed.list[0].sheet, skills: ['athletics', 'survival'] }, day);
  assert.deepEqual(edited.list[0].edits.map((e) => e.fields), [['name'], ['skills']]);
  assert.equal(JSON.stringify(edited.list[0].edits).includes('survival'), false);                              // names, never values
  assert.equal(M.editFile(edited.list, list[0].cid, edited.list[0].sheet, day).list[0].edits.length, 2);        // saved unchanged: no new entry
  assert.match(M.editFile(list, list[0].cid, { ...base, level: 99 }).error, /level/i);
  const copy = M.duplicateFile(edited.list, list[0].cid);
  assert.equal(copy.list.length, 2); assert.notEqual(copy.list[1].cid, copy.list[0].cid); assert.equal(copy.list[1].sheet.name, 'Tessa the Bold (copy)'); assert.deepEqual(copy.list[1].edits, []);
  assert.equal(copy.list[1].sheet.name.length <= 40, true);
  assert.equal(M.duplicateFile(edited.list, list[0].cid).list[1].born.level, 3);
  assert.equal(M.removeFile(copy.list, copy.list[1].cid).list.length, 1);
  let big = []; for (let i = 0; i < M.LIMITS.saved; i++) big = M.addFile(big, M.makeFile(fighter(`H${i}`))).list;
  assert.match(M.addFile(big, M.makeFile(base)).error, /holds 20/); assert.match(M.duplicateFile(big, big[0].cid).error, /holds 20/);
  assert.match(M.renameFile(list, 'nope', 'x').error, /not in the list/);
});

test('storage: empty, throwing, corrupt and half-bad are all survived; entries are checked as files are', () => {
  assert.deepEqual(M.loadList(mem()), { list: [], error: '' });
  assert.match(M.loadList({ getItem() { throw new Error('blocked'); } }).error, /would not let the page read/);
  assert.match(M.loadList(mem({ [M.KEY]: '{oops' })).error, /could not be read/);
  assert.match(M.loadList(mem({ [M.KEY]: '{"a":1}' })).error, /could not be read/);
  const good = M.makeFile(base), evil = { ...M.makeFile(base), cid: 'EEEEEEEEEEEEEEEEEEEEEE', sheet: { ...base, level: 99 } };
  const r = M.loadList(mem({ [M.KEY]: JSON.stringify([good, evil, good, 7, null]) }));
  assert.deepEqual(r.list, [good]); assert.match(r.error, /4 saved characters could not be read/);
  const s = mem();
  assert.deepEqual(M.saveList([good], s), { ok: true }); assert.deepEqual(M.loadList(s).list, [good]);
  assert.match(M.saveList([good], { setItem() { throw new Error('quota'); } }).error, /full or blocked/);
});

test('the party: picks become newGame\'s party, and every disallowed pick says why', () => {
  const list = M.addFile([], M.makeFile(base)).list, mine = `mine:${list[0].cid}`;
  assert.deepEqual(M.starters().map((s) => s.id), ['fighter', 'rogue', 'cleric', 'wizard']);
  const ok = M.buildParty(['starter:rogue', mine], list);
  assert.deepEqual(ok.problems, []); assert.deepEqual(ok.party, [{ pregen: 'rogue' }, { sheet: base }]);
  assert.notEqual(ok.party[1].sheet, list[0].sheet);                                      // a copy: the game cannot reach the list
  const g = newGame(3, { party: ok.party }); assert.deepEqual(Object.values(g.entities).filter((e) => e.kind === 'pc').map((e) => e.name), ['Pip', 'Tessa']);
  assert.match(M.buildParty([], list).problems[0], /1 to 6/);
  assert.match(M.buildParty(Array(7).fill('starter:fighter'), list).problems[0], /1 to 6/);
  assert.match(M.buildParty(['starter:rogue', 'starter:rogue'], list).problems.join(), /Already chosen/);
  assert.match(M.buildParty([mine, mine], list).problems.join(), /Already chosen/);
  assert.match(M.buildParty(['mine:gone'], list).problems[0], /Character 1: .*not in My characters/);
  assert.match(M.buildParty([''], list).problems[0], /Choose a character/);
  assert.match(M.buildParty(['starter:paladin'], list).problems[0], /not in this version/);
  const broken = [{ ...list[0], sheet: { ...base, level: 30 } }];
  assert.match(M.buildParty([`mine:${broken[0].cid}`], broken).problems[0], /level/i);
  assert.equal(M.buildParty([`mine:${broken[0].cid}`], broken).party, null);
  assert.equal(M.defaultPick(['starter:fighter', 'starter:rogue', 'starter:cleric', 'starter:wizard'], list), mine);
  assert.equal(M.defaultPick(['starter:fighter', 'starter:rogue', 'starter:cleric', 'starter:wizard', mine], list), '');
  assert.equal(M.defaultPick([], list), 'starter:fighter');
});
