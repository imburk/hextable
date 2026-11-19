// A feature that asks for a skill or a tool (addition C of docs/specs/homebrew-subclasses.md, DEBT T96, issue #543): the chooser row it gets, the options the card offers, the action the
// card sends (`choice: '<id>'`, which the engine takes), and what the sheet and the panel's skill rows show while the proficiency is lent. The panels draw from the pure parts tested here
// (classes.js, actionpanel.js); the smoke pass `homebrew` drives the card itself. The subclass is invented for this test (the Order of the Quill, a pack "quill-folk").
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as classes.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'choice-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const C = await import(pathToFileURL(join(tmp, 'classes.js')));
const AP = await import(pathToFileURL(join(tmp, 'actionpanel.js')));
const F = await import(pathToFileURL(join(tmp, 'features.js')));
const { apply, makeEntity, passive } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { derive } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));
const { loadPack, overlayOf, using } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));

const DM = { role: 'dm', userId: 'dm' };
const PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// ---------- the invented pack ----------
const P = 'quill-folk', hb = (n) => `hb-${P}-${n}`;
const doc = (lists) => ({ format: 'hextable-pack', v: 1, pack: { id: P, name: 'Quill Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for a test.' }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), level, tier: 'auto', checked: false, text: `The ${id}, in the pack's own words.`, grants, ...more });
const lend = (scope) => ({ modifier: { on: 'check', op: 'proficient', scope } });
const act = (steps, more = {}) => ({ action: { time: 'action', target: { self: true }, duration: '10 minutes', effects: steps, ...more } });
const ORDER = { id: hb('order-of-the-quill'), name: 'Order of the Quill', class: 'cleric', source: `homebrew:${P}`, checked: false, text: 'Scribes of a hushed archive.', features: [
  // any skill, for Channel Divinity; a tool of two; a skill of four; two modes that each lend the chosen skill; a skill at a spell slot of level 1 or higher; a fixed skill (no choice)
  feature('quill-any', 3, act([lend({ skill: 'chosen' })], { cost: { resource: 'channel-divinity' }, choice: { of: 'skill' } })),
  feature('quill-tool', 3, act([lend({ tool: 'chosen' })], { choice: { of: 'tool', from: ['thieves-tools', 'herbalism-kit'] } }), { uses: { max: 2, recharge: 'long' } }),
  feature('quill-four', 3, act([lend({ skill: 'chosen' })], { choice: { of: 'skill', from: ['arcana', 'history', 'nature', 'religion'] } }), { uses: { max: 3, recharge: 'long' } }),
  feature('quill-modes', 3, { action: { time: 'action', target: { self: true }, duration: '10 minutes', choice: { of: 'skill', from: ['arcana', 'history'] },
    modes: [{ id: 'quick', name: 'Quick', effects: [lend({ skill: 'chosen' })] }, { id: 'slow', name: 'Slow', effects: [lend({ skill: 'chosen' })] }] } }, { uses: { max: 3, recharge: 'long' } }),
  feature('quill-slot', 3, act([lend({ skill: 'chosen' })], { cost: { slot: 1 }, choice: { of: 'skill', from: ['arcana', 'history'] } })),
  feature('quill-fixed', 3, act([lend({ skill: 'history' })], { duration: '1 hour' }), { uses: { max: 1, recharge: 'long' } }),
] };
const built = loadPack(doc({ subclasses: [ORDER] })); assert.ok(built.ok, (built.problems ?? []).join('; '));
const ON = overlayOf([built.pack]);
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
// Level 5, Proficiency Bonus +3; Intelligence 12 is +1, so Arcana is +1 and +4 with the proficiency; History is its own, +4.
const SHEET = { name: 'Ilse', class: 'cleric', level: 5, subclass: hb('order-of-the-quill'), abilities: A, skills: ['religion', 'history'], choices: { 'divine-order': 'protector' },
  armour: 'chain-mail', shield: true, weapons: ['mace'], spells: ['guidance', 'sacred-flame', 'spare-the-dying', 'bless', 'cure-wounds'], gear: ["Thieves' Tools"] };
function field() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(SHEET).record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(SHEET);
  ok(apply(s, { type: 'claim', entity: 'hero', user: 'pat', userName: 'Pat' }, PAT));
  return s;
}
const within = (fn) => using(ON, () => fn(field()));
const rowsOf = (s) => Object.fromEntries(C.chooserButtons(s, s.entities.hero).map((b) => [b.feature, b]));
const feat = (s, n) => s.entities.hero.feats.find((f) => f.id === hb(n));
const use = (s, n, more = {}) => apply(s, { type: 'feature', actor: 'hero', feature: hb(n), ...more }, PAT);

test('a feature with `choice` has a chooser row, as a feature with modes does: it is no longer a plain bar button, and its line says what it asks and what is left', () => {
  within((s) => {
    const rows = rowsOf(s);
    for (const n of ['quill-any', 'quill-tool', 'quill-four']) assert.equal(rows[hb(n)].kind, 'choice', n);
    assert.equal(rows[hb('quill-modes')].kind, 'modes', 'modes keep their chooser; it asks for the pick as well');
    assert.equal(rows[hb('quill-slot')].kind, 'slot', 'a slot cost keeps its chooser; it asks for the pick as well');
    assert.equal(rows[hb('quill-fixed')], undefined, 'a feature with no `choice` is a plain button, as before');
    assert.equal(rows[hb('quill-any')].sub, 'Action · choose a skill · 2 Channel divinity left');
    assert.equal(rows[hb('quill-tool')].sub, 'Action · choose a tool · 2 left');
    for (const n of ['quill-any', 'quill-tool', 'quill-four', 'quill-modes', 'quill-slot']) assert.ok(C.needsChoice(feat(s, n)), n);
    // the plain bar no longer lists them (a click would send no choice); the fixed one stays there
    const bar = F.featureButtons(s, s.entities.hero).map((b) => b.feature);
    assert.deepEqual(bar.filter((id) => id.startsWith(`hb-${P}`)), [hb('quill-fixed')]);
    // the Features tab has one row for each, a chooser
    const tab = Object.fromEntries(AP.featureRows(s, s.entities.hero).map((r) => [r.feature, r]));
    for (const n of ['quill-any', 'quill-tool', 'quill-four', 'quill-modes', 'quill-slot']) assert.equal(tab[hb(n)].kind, 'chooser', n);
    assert.equal(tab[hb('quill-fixed')].kind, 'send');
  });
});

test('a feature with no uses left says why in the engine\'s words, with the pick still to make', () => {
  within((s) => {
    s.entities.hero.uses[hb('quill-tool')] = 0;
    assert.match(rowsOf(s)[hb('quill-tool')].why, /has no uses of Quill tool left/);
    s.entities.hero.uses['channel-divinity'] = 0;
    assert.match(rowsOf(s)[hb('quill-any')].why, /has no uses of Quill any left/);
  });
});

test('the options: every skill with no list (a menu), the list when there is one, and a tool from its list; each says what it would be', () => {
  within((s) => {
    const e = s.entities.hero, any = feat(s, 'quill-any').action.choice, four = feat(s, 'quill-four').action.choice, tool = feat(s, 'quill-tool').action.choice;
    assert.equal(C.choiceList(any).length, 18);
    assert.deepEqual(C.choiceList(four), ['arcana', 'history', 'nature', 'religion']);
    assert.deepEqual(C.choiceList(tool), ['thieves-tools', 'herbalism-kit']);
    assert.equal(C.choiceOption(e, four, 'arcana').text, 'Arcana +1, +4 with it');
    assert.equal(C.choiceOption(e, four, 'history').text, 'History +4 (already proficient)');
    assert.equal(C.choiceOption(e, tool, 'thieves-tools').text, 'Thieves tools');
    assert.equal(C.choiceOption(e, tool, 'herbalism-kit').own, false);
  });
});

test('what the card sends is what the engine takes: `choice: "arcana"` on the `feature` action lends Arcana, and the skill buttons, Search and the sheet show it', () => {
  within((s) => {
    const e = s.entities.hero, four = feat(s, 'quill-four').action.choice;
    // before: Arcana +1, no lent proficiency anywhere
    assert.equal(C.skillBonus(s, e, 'arcana'), 1); assert.equal(C.isLent(s, e, 'arcana'), false); assert.deepEqual(C.lentList(s, e), []);
    const send = { type: 'feature', actor: 'hero', feature: hb('quill-four'), choice: C.choiceList(four)[0] };
    const r = ok(apply(s, send, PAT));
    assert.ok(r.events.some((x) => x.type === 'effectStart'));
    assert.equal(r.events.some((x) => x.type === 'manual'), false, 'nothing is handed to the DM: the pick was sent');
    for (const seen of [s, view(s, PAT)]) {
      const me = seen.entities.hero;
      assert.equal(C.skillBonus(seen, me, 'arcana'), 4, 'the Proficiency Bonus once');
      assert.equal(C.isLent(seen, me, 'arcana'), true);
      assert.equal(C.isLent(seen, me, 'history'), false, 'a skill it has of its own is not shown as lent');
      assert.equal(C.skillBonus(seen, me, 'history'), 4, 'and takes nothing more');
      assert.equal(C.skillBonus(seen, me, 'nature'), 1, 'a skill not lent is as it was (Intelligence 12)');
      assert.deepEqual(C.lentList(seen, me).map(({ name, skill, tool }) => ({ name, skill, tool })), [{ name: 'Quill four', skill: 'arcana', tool: undefined }]);
      assert.match(C.lentList(seen, me)[0].lasts, /10 minutes/);
    }
    // the engine's own passive score reads the same
    assert.equal(passive(s, e, 'arcana'), 10 + 4);
    // the panel's Search and Hide rows read it (Perception is lent next)
    const search = (st) => AP.moveRows(st, st.entities.hero).find((x) => x.id === 'search').sub;
    assert.match(search(s), /Perception \+3 /);
    ok(apply(s, { type: 'feature', actor: 'hero', feature: hb('quill-any'), choice: 'perception' }, PAT));
    assert.match(search(s), /Perception \+6 /, 'Wisdom 16 is +3 and the Proficiency Bonus is +3');
    assert.match(search(view(s, PAT)), /Perception \+6 /);
    const hide = (st) => AP.moveRows(st, st.entities.hero).find((x) => x.id === 'hide').sub;
    assert.match(hide(s), /Stealth \+2 /);
    ok(apply(s, { type: 'endEffect', actor: 'hero', effect: s.effects.find((x) => x.name === 'Quill any').id }, PAT));
    assert.match(search(s), /Perception \+3 /, 'ended: as it was'); assert.equal(C.lentList(s, e).length, 1);
  });
});

test('a tool lent is listed by the sheet\'s line; every refusal of the engine is its own sentence and changes nothing', () => {
  within((s) => {
    const e = s.entities.hero;
    ok(apply(s, { type: 'feature', actor: 'hero', feature: hb('quill-tool'), choice: 'herbalism-kit' }, PAT));
    assert.deepEqual(C.lentList(s, e).map((x) => [x.tool, x.skill]), [['herbalism-kit', undefined]]);
    for (const skill of ['arcana', 'history', 'nature']) assert.equal(C.isLent(s, e, skill), false, 'a tool lends nothing to a skill');
    // what a card could send wrong: the engine refuses, and the use is not spent
    const before = JSON.stringify(s);
    assert.equal(use(s, 'quill-four', { choice: 'stealth' }).ok, false);
    assert.equal(use(s, 'quill-tool', { choice: 'lockpicks' }).ok, false);
    assert.equal(JSON.stringify(s), before, 'a refused use changes nothing');
  });
});

test('modes and a slot cost carry the pick too: `choice` beside `mode`, and beside `slot`', () => {
  within((s) => {
    const e = s.entities.hero;
    const r = ok(apply(s, { type: 'feature', actor: 'hero', feature: hb('quill-modes'), mode: 'quick', choice: 'arcana' }, PAT));
    assert.equal(r.events.some((x) => x.type === 'manual'), false);
    assert.equal(C.isLent(s, e, 'arcana'), true);
    const slots = e.slots[1];
    ok(apply(s, { type: 'feature', actor: 'hero', feature: hb('quill-slot'), slot: 1, choice: 'history' }, PAT));
    assert.equal(e.slots[1], slots - 1);
    assert.deepEqual(C.slotLevels(e, 1).includes(1), true);
  });
});

test('with no pick sent, the use is spent and the DM is told (the card does not allow it, so this is the engine\'s safety net, not a path)', () => {
  within((s) => {
    const r = ok(use(s, 'quill-four'));
    assert.ok(r.events.some((x) => x.type === 'manual' && /ask which skill/.test(x.text)));
    assert.deepEqual(C.lentList(s, s.entities.hero), []);
  });
});

test('an SRD-only sheet is as it was: no lent list, the skill bonus is the engine\'s own, and no row asks for a choice', () => {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.abil && x.skills);
  assert.deepEqual(C.lentList(s, e), []);
  for (const k of ['arcana', 'perception', 'stealth']) assert.equal(C.isLent(s, e, k), false);
  assert.equal(C.chooserButtons(s, e).some((b) => b.kind === 'choice'), false);
});
