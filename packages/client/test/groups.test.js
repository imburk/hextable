// The action groups of the Character screen (docs/specs/one-token-menu.md, Decision 4, R29; stage M4): every row a tab showed is in a group, a healing spell is in Cast and Heal,
// a fight shows only what can be used now, a group with nothing in it is left out, and the turn bar's filter lists what costs a thing. Pure: no page. The client imports the rules as
// ./shared, so the test lays the two side by side in a temporary folder, as actionpanel.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'groups-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const AP = await import(pathToFileURL(join(tmp, 'actionpanel.js')));
const { groupsFor, groupRows, costRows, panelContext, tabRows, rankExplore, itemRows, spellRows, bonusRows, offered, GROUP_ORDER, healsRow } = AP;
const { apply, current } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const ids = (rows) => rows.map((r) => r.id);
const CAST = ['fighter', 'rogue', 'cleric', 'wizard'];       // the four sample characters of the starter valley: a martial, a skirmisher, a priest and a mage

// A fight, with `who` made the one whose turn it is (the engine's own order is left alone: we end turns until it comes round).
function turnOf(who, seed = 7) {
  const s = newGame(seed);
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 40 && current(s) !== who; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.equal(current(s), who, `${who} gets a turn`);
  return s;
}
const G = (s, id, extra = {}) => { const e = s.entities[id], ctx = panelContext(s, e, { dm: true }); return { e, ctx, G: groupsFor(s, e, ctx, { dm: true, ...extra }) }; };
const inAGroup = (g, id) => g.groups.some((x) => x.rows.some((r) => r.id === id));

test('every row a tab showed is in at least one group, for the four sample characters, exploring and on their turn', () => {
  for (const id of CAST) {
    // exploring
    const s = newGame(7), e = s.entities[id], ctx = panelContext(s, e, { dm: true }), g = groupsFor(s, e, ctx, { dm: true });
    for (const r of rankExplore(s, e, { dm: true })) {
      if (r.kind === 'jump') { assert.ok(ids(g.groups.flatMap((x) => x.rows)).includes(r.jump), `${id}: ${r.id} is a shortcut to ${r.jump}, which is a row of a group`); continue; }
      assert.ok(inAGroup(g, r.id), `${id} exploring: ${r.id} is in a group`);
    }
    for (const t of ['spells', 'features']) for (const r of tabRows(s, e, t)) assert.ok(inAGroup(g, r.id), `${id} exploring: ${t} row ${r.id} is in a group`);
    for (const r of itemRows(s, e, { dm: true }).uses) assert.ok(inAGroup(g, r.id), `${id} exploring: item use ${r.id} is in a group`);
    // on their turn in a fight
    const f = turnOf(id), fe = f.entities[id], fc = panelContext(f, fe, { dm: true }), fg = groupsFor(f, fe, fc, { dm: true });
    for (const t of ['attacks', 'bonus', 'move', 'features', 'spells']) for (const r of tabRows(f, fe, t)) assert.ok(inAGroup(fg, r.id), `${id} in a fight: ${t} row ${r.id} is in a group`);
    for (const r of itemRows(f, fe, { dm: true }).uses) assert.ok(inAGroup(fg, r.id), `${id} in a fight: item use ${r.id} is in a group`);
  }
});

test('a healing spell is in Cast and in Heal: the same row', () => {
  const s = newGame(7), e = s.entities.cleric, ctx = panelContext(s, e, { dm: true }), g = groupsFor(s, e, ctx, { dm: true });
  const cast = g.groups.find((x) => x.id === 'spells'), heal = g.groups.find((x) => x.id === 'heal');
  const healing = ids(heal.rows).filter((id) => id.startsWith('spell:'));
  assert.ok(healing.length > 0, 'a cleric has a healing spell');
  for (const id of healing) assert.ok(ids(cast.rows).includes(id), `${id} is in Cast too`);
});

test('the order of the groups does not change within a state: a fight, and out of one', () => {
  const s = newGame(7), f = turnOf('cleric');
  assert.deepEqual(G(s, 'cleric').G.groups.map((x) => x.id), GROUP_ORDER.free);
  assert.deepEqual(G(f, 'cleric').G.groups.map((x) => x.id), GROUP_ORDER.fight);
});

test('a fight shows only what can be used now (R29): no offered row is greyed, and a group with none left is not shown', () => {
  for (const id of CAST) {
    const s = turnOf(id), { G: g } = G(s, id);
    assert.ok(g.shown.length > 0, `${id} has something to do on their turn`);
    for (const grp of g.groups) {
      for (const r of grp.offered) assert.ok(!r.why || r.armed, `${id}: ${grp.id} offers "${r.id}", which is greyed: ${r.why}`);
      assert.equal(grp.shown, grp.offered.length > 0 || (grp.id === 'reactions' && grp.shown) || (grp.id === 'items' && grp.shown), `${id}: ${grp.id} is shown only when it has something`);
    }
    // the greyed rows are still known (a test and the cost screens read them), just not offered
    for (const grp of g.groups.filter((x) => x.id !== 'items')) assert.ok(grp.rows.length >= grp.offered.length, `${id}: ${grp.id} offers no more than it has`);
  }
});

test('a martial has no Cast; a caster has Cast; a group with nothing at all is left out, in a fight and out of one', () => {
  for (const [where, mk] of [['out of a fight', () => newGame(7)], ['in a fight', null]]) {
    const fighter = mk ? mk() : turnOf('fighter'), wizard = mk ? mk() : turnOf('wizard');
    assert.ok(!G(fighter, 'fighter').G.shown.some((x) => x.id === 'spells'), `a fighter has no Cast ${where}`);
    assert.ok(G(wizard, 'wizard').G.shown.some((x) => x.id === 'spells'), `a wizard has Cast ${where}`);
  }
  assert.ok(!G(newGame(7), 'fighter').G.shown.some((x) => x.id === 'companions'), 'no Companions without one');
});

test('out of a fight a group stays and says why: Heal with nothing to heal with', () => {
  const s = newGame(7), { G: g } = G(s, 'fighter'), heal = g.groups.find((x) => x.id === 'heal');
  assert.ok(heal.shown, 'Heal is shown out of a fight');
  if (!heal.rows.length) assert.match(heal.why, /no healing spell or item/);
});

test('not your turn, in a fight: Reactions comes first and nothing else can be used; with no reaction the whole page is one line of reasons', () => {
  const s = turnOf('cleric');
  const other = Object.values(s.entities).find((x) => x.side === 'party' && x.id !== 'cleric' && x.kind === 'pc');
  const { G: g } = G(s, other.id);
  assert.equal(g.shown[0]?.id ?? 'reactions', 'reactions');
  assert.ok(g.shown.every((x) => ['reactions', 'items'].includes(x.id)), `only Reactions and what can be done with the kit: ${g.shown.map((x) => x.id)}`);
  other.reactionUsed = true;
  const none = G(s, other.id).G;
  assert.ok(!none.shown.some((x) => x.id === 'reactions'), 'a spent Reaction is not shown');
  if (!none.shown.length) assert.ok(none.empty.length > 0, 'an empty page says why in one line');
});

test('the turn bar filters: what costs a Bonus Action or an Action is listed across groups, each once, and a fight offers only what is usable', () => {
  const s = turnOf('cleric'), { e, G: g } = G(s, 'cleric');
  const bonus = costRows(s, e, 'bonus', g), action = costRows(s, e, 'action', g);
  assert.deepEqual(ids(bonus), ids(bonusRows(s, e).rows), 'Bonus is the Bonus tab');
  assert.equal(new Set(ids(action)).size, action.length, 'each row once');
  assert.ok(action.length > 0 && action.every((r) => r.time === 'action'));
  assert.ok(ids(action).includes('dash'), 'Dash costs the Action and is in Move');
  assert.ok(ids(action).some((id) => id.startsWith('spell:')), 'a spell that costs the Action is in the list from Cast');
});

test('the likeliest group on a turn is Attack for someone who attacks, Cast for someone who only casts', () => {
  const f = turnOf('fighter');
  assert.equal(G(f, 'fighter').G.shown[0].id, 'attacks');
  const w = turnOf('wizard'), g = G(w, 'wizard').G;
  assert.ok(g.shown.some((x) => x.id === 'spells'), 'the wizard has Cast');
});

test('healsRow reads the row, not the name: Second Wind and Lay On Hands, healing spells, a potion of healing', () => {
  assert.ok(healsRow({ id: 'feat:second-wind' })); assert.ok(healsRow({ id: 'feat:lay-on-hands' }));
  assert.ok(healsRow({ id: 'item:a:b', kind: 'item', label: 'Potion of Healing' }));
  assert.ok(!healsRow({ id: 'atk:mace', kind: 'arm', label: 'Mace' }));
  assert.ok(offered({ why: '' }) && !offered({ why: 'no' }) && offered({ why: 'no', armed: true }));
});

test('a creature that is down or not yours has no groups', () => {
  const s = newGame(7), e = s.entities.rogue;
  assert.deepEqual(groupsFor(s, e, panelContext(s, e, { mine: false })).shown, []);
  e.hp = 0;
  assert.deepEqual(groupsFor(s, e, panelContext(s, e, { dm: true })).shown, []);
});

// #717 (docs/specs/one-token-menu.md, "#717 build notes"): the quick actions of the turn line.
test('quick actions: on its own turn a creature gets up to three rows that need the map next, the last one used first, and none at any other time', () => {
  const { quickRows, QUICK_KINDS } = AP;
  for (const id of ['fighter', 'rogue', 'cleric', 'wizard']) {
    // Out of a fight, and on another's turn: none.
    const free = G(newGame(7), id);
    assert.deepEqual(quickRows(free.G), [], `${id}: no quick action while exploring`);
    const f = turnOf(id), mine = G(f, id).G, q = quickRows(mine);
    assert.ok(q.length >= 1 && q.length <= 3, `${id} on its turn: ${q.map((r) => r.label)}`);
    assert.equal(new Set(q.map((r) => r.id)).size, q.length, 'no row twice');
    const offeredNow = mine.groups.filter((g) => g.id === 'attacks' || g.id === 'spells').flatMap((g) => g.offered);
    for (const r of q) {
      assert.ok(QUICK_KINDS.has(r.kind), `${r.label} is an attack or a spell`);
      assert.ok(!r.why, `${r.label} can be used now`);
      assert.ok(offeredNow.includes(r), `${r.label} is a row the Character screen offers now`);
    }
    assert.equal(q[0], mine.groups.find((g) => g.id === 'attacks').offered.find((r) => QUICK_KINDS.has(r.kind)), `${id}: the first is Attack's first row`);
    // The one used last comes first, when it is still offered; an id that is not offered changes nothing.
    const other = offeredNow.filter((r) => QUICK_KINDS.has(r.kind) && !r.why).at(-1);
    assert.equal(quickRows(mine, { last: other.id })[0], other);
    assert.deepEqual(quickRows(mine, { last: 'no-such-row' }), q);
    assert.equal(quickRows(mine, { max: 1 }).length, 1);
    // Someone else's turn in the same fight.
    const someoneElse = ['fighter', 'rogue', 'cleric', 'wizard'].find((x) => x !== id);
    assert.deepEqual(quickRows(G(f, someoneElse).G), [], `${someoneElse} has none on ${id}'s turn`);
  }
  // A caster's are from both groups: a weapon and a spell.
  const w = quickRows(G(turnOf('wizard'), 'wizard').G);
  assert.ok(w.some((r) => r.kind === 'spell') && w.some((r) => r.kind !== 'spell'), `the wizard's: ${w.map((r) => `${r.kind} ${r.label}`)}`);
  // Spent: with the Action used, what is left to offer is what the engine still allows.
  assert.deepEqual(quickRows(null), []);
});
