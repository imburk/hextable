// The feedback report (docs/specs/feedback.md) is built only from what this client showed or sent. The client imports the rules as ./shared,
// so the test lays the two side by side in a temporary folder, as tracker.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'feedback-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { createRecorder, actionArgs, buildReport, fitReport, gather, hashCode, REPORT_MAX, LOG_LINES, ACTIONS } = await import(pathToFileURL(join(tmp, 'feedback.js')));
const { REPORT } = await import(pathToFileURL(join(here, '../../server/src/feedback.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const FACTS = { build: 'state-v1', mode: 'solo', role: 'dm', renderer: 'gl', theme: 'classic', grid: 'hex', viewport: { w: 390, h: 844 }, touch: true, ua: 'UA', lang: 'en', fight: { on: false }, character: null, map: 'valley' };

test("the log keeps the last 30 shown lines, as shown, and never talk", () => {
  const rec = createRecorder();
  for (let i = 0; i < 40; i++) rec.shown([`line ${i}`, '', 'combat']);
  rec.shown(['Someone: “a secret plan”', '', 'talk']);
  rec.shown(null);
  const log = rec.log();
  assert.equal(log.length, LOG_LINES);
  assert.equal(log[0], 'line 10');
  assert.equal(log.at(-1), 'line 39');
  assert.ok(!log.some((l) => /secret/.test(l)));
});

test("an action keeps only its type and short ids, words and numbers; typed text and documents are dropped", () => {
  assert.deepEqual(actionArgs({ type: 'move', actor: 'pc1', to: { q: 1, r: -2, z: 0 }, name: 'Gandalf the Grey', text: 'hello there', map: { levels: [] } }), { actor: 'pc1', to: { q: 1, r: -2, z: 0 } });
  assert.deepEqual(actionArgs({ type: 'cast', actor: 'pc1', spell: 'fire-bolt', targets: ['m1', 'm2'], note: 'x' }), { actor: 'pc1', spell: 'fire-bolt', targets: ['m1', 'm2'] });
  assert.deepEqual(actionArgs({ type: 'say', text: 'a typed sentence', actor: 'a name with spaces' }), {});
  const rec = createRecorder();
  for (let i = 0; i < 20; i++) rec.sent({ type: 'endTurn', actor: `pc${i}` });
  assert.equal(rec.actions().length, ACTIONS);
  assert.equal(rec.sent({ type: 'a typed type' }).type, 'other');
});

test("a report passes the server's allow-list, with and without context, and is cut to fit 24 KB oldest first", () => {
  const rec = createRecorder();
  for (let i = 0; i < 30; i++) rec.shown([`${i} ${'€'.repeat(299)}`, '', 'combat']);      // three bytes a letter: 30 long lines are far over the cap
  for (let i = 0; i < 15; i++) rec.sent({ type: 'move', actor: 'pc1', to: { q: i, r: i } });
  rec.error('Oops', 'app.js:12');
  const full = buildReport({ comment: 'x'.repeat(2000), kind: 'bug', include: true }, FACTS, rec, 'abcdef012345');
  assert.equal(REPORT(full), null);
  assert.ok(new TextEncoder().encode(JSON.stringify(full)).length <= REPORT_MAX);
  assert.ok(full.context.log.length < 30);
  assert.ok(full.context.log.at(-1).startsWith('29 '), 'the newest lines are kept');
  const bare = buildReport({ comment: ' hi ', kind: 'idea', include: false }, FACTS, rec, null);
  assert.equal(bare.context, undefined);
  assert.equal(bare.comment, 'hi');
  assert.equal(REPORT(bare), null);
  assert.equal(fitReport({ ...bare }).comment, 'hi');
});

test("what is gathered from a player's own view holds no seed, no names of people and no table code", async () => {
  const S = view(newGame(7), { role: 'player', userId: 'pat' });
  const fighter = Object.values(S.entities).find((e) => e.kind === 'pc');
  const T = { solo: false, you: { role: 'player', userId: 'pat', name: 'Patricia Secretname', code: 'ABC123' } };
  const win = { innerWidth: 390, innerHeight: 844, navigator: { userAgent: 'UA', maxTouchPoints: 1 }, document: { documentElement: { lang: 'en-GB' }, querySelector: () => null } };
  const f = gather(() => ({ S, T, selId: fighter.id, themeId: 'classic', renderer: 'gl', mine: () => true }), win);
  assert.equal(f.mode, 'table'); assert.equal(f.role, 'player'); assert.equal(f.touch, true);
  assert.equal(f.character.cls, fighter.cls); assert.equal(f.character.level, fighter.level);
  const table = await hashCode(f.code);
  assert.match(table, /^[0-9a-f]{12}$/);
  assert.notEqual(table, 'ABC123');
  const { code, ...rest } = f;
  const r = buildReport({ comment: 'hello', kind: 'bug', include: true }, rest, createRecorder(), table);
  assert.equal(REPORT(r), null);
  const text = JSON.stringify(r);
  for (const bad of ['Patricia', 'Secretname', 'ABC123', 'pat', 'rng', 'seed', fighter.name]) assert.ok(!text.includes(bad), `the report holds ${bad}`);
});

test("whose turn it is, as the viewer sees it: mine, someone else's or unseen", () => {
  const base = { entities: { a: { id: 'a', kind: 'pc' } }, map: { id: 'valley' } };
  const f = (slot) => gather(() => ({ S: { ...base, encounter: { round: 2, turn: 0, order: [slot] } }, T: { solo: true, you: { role: 'dm' } }, selId: 'a', themeId: 'classic', renderer: 'gl', mine: (e) => e?.id === 'a' }), { innerWidth: 1, innerHeight: 1, navigator: {}, document: { querySelector: () => null } }).fight;
  assert.deepEqual(f({ id: 'a' }), { on: true, round: 2, turn: 'mine' });
  assert.equal(f({ id: 'b' }).turn, 'other');
  assert.equal(f({ someone: true }).turn, 'unseen');
});

test("the build stamp reads aloud in local time, and the report's build token is short", async () => {
  const { buildLine, buildId, validStamp } = await import(pathToFileURL(join(tmp, 'feedback.js')));
  const b = { commit: 'c1d5069abcdef', when: '2026-11-15T11:13:26Z', pr: 354, source: 'pages' };
  assert.equal(buildLine(b, 'UTC'), 'Build 15 Nov 2026, 11:13 (after change #354, c1d5069)');
  assert.equal(buildLine(b, 'Asia/Tokyo'), 'Build 15 Nov 2026, 20:13 (after change #354, c1d5069)');
  assert.equal(buildLine({ commit: 'c1d5069', when: '2026-11-15T11:13:26Z' }, 'UTC'), 'Build 15 Nov 2026, 11:13 (c1d5069)');
  assert.equal(buildLine({ commit: 'c1d5069' }), 'Build (c1d5069)');
  assert.equal(buildLine({ commit: 'no', when: 'never' }), '');
  assert.equal(buildLine(null), '');
  assert.equal(buildId(b), 'c1d5069 2026-11-15T11:13:26Z #354');
  assert.equal(validStamp({ nothing: 1 }), false);
  const r = buildReport({ comment: 'x', kind: 'bug', include: false }, { ...FACTS, build: buildId(b) }, createRecorder(), null);
  assert.equal(REPORT(r), null);
});
