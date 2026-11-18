// The tracker's rows (docs/specs/table-ui.md, Decision 3) are drawn from a view, so what a player's tracker can show is what the view
// holds. The client imports the rules as ./shared (where the build puts them), so the test lays the two side by side in a temporary
// folder and loads that copy, as floors.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'tracker-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { trackerRows, rowHTML, turnLine } = await import(pathToFileURL(join(tmp, 'tracker.js')));
const { apply, current } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' }, PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The valley, Pat plays the fighter, the party sees by light, and a goblin that is invisible to them is in the fight.
function fight() {
  const s = newGame(7);
  ok(apply(s, { type: 'claim', entity: 'fighter', user: 'pat', userName: 'pat' }, PAT));
  ok(apply(s, { type: 'setting', key: 'sight', value: 'light' }, DM));
  const foe = Object.values(s.entities).find((e) => e.side === 'foe');
  const ghost = s.entities[ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: foe.pos.q + 1, r: foe.pos.r }, name: 'Secretgoblin' }, DM)).events[0].id];
  ok(apply(s, { type: 'condition', actor: ghost.id, condition: 'invisible' }, DM));
  ok(apply(s, { type: 'place', actor: 'fighter', to: { q: foe.pos.q - 1, r: foe.pos.r } }, DM));
  ok(apply(s, { type: 'startEncounter', center: foe.pos }, DM));
  return { s, ghost };
}
const rowsOf = (S, opts) => trackerRows(S, opts).map((r) => rowHTML(S, r, { mine: (e) => e.owner === 'pat', ...opts }));

test("the DM's rows are the whole order, with initiative for everyone and the exact health", () => {
  const { s, ghost } = fight();
  const items = trackerRows(s, { dm: true });
  assert.deepEqual(items.map((r) => r.e.id), s.encounter.order.map((o) => o.id));
  assert.ok(items.some((r) => r.e.id === ghost.id));
  assert.deepEqual(items.map((r) => r.init), s.encounter.order.map((o) => o.init));
  assert.equal(items.filter((r) => r.now).length, 1);
  assert.equal(items.find((r) => r.now).e.id, current(s));
  const goblin = text(rowHTML(s, items.find((r) => r.e.id === ghost.id), { dm: true, mine: () => true }));
  assert.match(goblin, new RegExp(`${ghost.maxHp} / ${ghost.maxHp}`));
});

test('a player is shown nothing the view did not send: no unseen creature, no number for a foe, no initiative but their own side', () => {
  const { s, ghost } = fight();
  const V = view(s, PAT);
  assert.equal(V.entities[ghost.id], undefined, 'the view does not send the invisible goblin');
  const html = rowsOf(V).join('\n');
  assert.ok(!html.includes(ghost.id) && !html.includes('Secretgoblin'));
  const items = trackerRows(V);
  for (const r of items) {
    if (r.unseen) continue;
    const row = text(rowHTML(V, r, { mine: (e) => e.owner === 'pat' }));
    if (r.e.side === 'foe') {
      assert.equal(r.init, undefined, 'no initiative number for a foe');
      assert.ok(/(Healthy|Bloodied|Down|Dead)/.test(row) && !/\d+ \/ \d+/.test(row), `a word for a foe's health: ${row}`);
    } else {
      assert.equal(typeof r.init, 'number', 'the party\'s own initiative is sent');
      assert.match(row, /\d+ \/ \d+/);
    }
  }
});

test("an unseen creature's turn is one ghost row that names no one, is not a button, and is the turn", () => {
  const { s, ghost } = fight();
  for (let i = 0; i < 20 && current(s) !== ghost.id; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.equal(current(s), ghost.id);
  const V = view(s, PAT), items = trackerRows(V);
  const ghosts = items.filter((r) => r.unseen);
  assert.equal(ghosts.length, 1);
  assert.equal(items.filter((r) => r.now).length, 1);
  assert.ok(ghosts[0].now);
  const html = rowHTML(V, ghosts[0], {});
  assert.match(html, /Something moves unseen/);
  assert.ok(!/<button|data-id|data-do/.test(html), 'not tappable, and holds no id');
  assert.equal(turnLine(V), 'Something moves unseen');
  assert.equal(items.length, V.encounter.order.length);
  // The table rule "quiet": no slot and so no row, and nothing said.
  ok(apply(s, { type: 'setting', key: 'unseenTurns', value: 'quiet' }, DM));
  const Q = view(s, PAT);
  assert.ok(!trackerRows(Q).some((r) => r.unseen));
  assert.equal(turnLine(Q), '');
});

test('Reaction used and Dying are shown for what the view holds only: the party\'s own, never a foe\'s', () => {
  const { s } = fight();
  const mine = s.entities.fighter;
  mine.reactionUsed = true;
  const foe = Object.values(s.entities).find((e) => e.side === 'foe' && e.id !== undefined && s.encounter.order.some((o) => o.id === e.id));
  foe.reactionUsed = true;
  const V = view(s, PAT);
  assert.equal(V.entities[foe.id].reactionUsed, undefined, 'the view does not say whether a foe used its reaction');
  const row = (S, id, opts = {}) => text(rowHTML(S, { e: S.entities[id], now: false }, { mine: opts.dm ? () => true : (e) => e.owner === 'pat', ...opts }));
  assert.match(row(V, 'fighter'), /Reaction used/);
  assert.doesNotMatch(row(V, foe.id), /Reaction used/);
  assert.match(row(s, foe.id, { dm: true }), /Reaction used/, 'the DM has the whole record');
  mine.hp = 0; mine.death = { s: 1, f: 0 };
  assert.match(row(view(s, PAT), 'fighter'), /Dying 1✓ 0✗/);
  mine.cond.stable = true;
  assert.match(row(view(s, PAT), 'fighter'), /Stable/);
});

test('conditions and concentration show as the view sends them, and outside a fight the party is listed', () => {
  const { s } = fight();
  ok(apply(s, { type: 'endEncounter' }, DM));
  assert.deepEqual(trackerRows(s, { dm: false }).map((r) => r.e.side), ['party', 'party', 'party', 'party']);
  assert.equal(turnLine(s), '');
  ok(apply(s, { type: 'condition', actor: 'fighter', condition: 'prone' }, DM));
  assert.match(text(rowHTML(s, { e: s.entities.fighter }, { mine: () => true })), /Prone/);
});

test("the DM's rows carry each player's connection dot (issue #246); a player's rows carry none", () => {
  const { s } = fight(), S = view(s, DM), item = trackerRows(S, { dm: true }).find((r) => r.e?.id === 'fighter');
  const link = (e) => (e.id === 'fighter' ? { state: 'lost', text: 'Reconnecting, attempt 3', who: 'Pat' } : null);
  const dm = rowHTML(S, item, { dm: true, link });
  assert.match(dm, /aria-label="Pat: Connection lost\. Reconnecting, attempt 3"/);
  assert.match(dm, /ld-word[^>]*>Lost/);
  assert.doesNotMatch(rowHTML(S, item, { dm: false, link }), /class="ld /);
  assert.doesNotMatch(rowHTML(S, trackerRows(S, { dm: true }).find((r) => r.e && r.e.id !== 'fighter'), { dm: true, link }), /class="ld /);
});

test('a ridden pair in a fight: the mount stands after its rider, says whom it carries, and a player is told of neither half the view hides', () => {
  const s = newGame(5), f = s.entities.fighter.pos;
  ok(apply(s, { type: 'spawn', monster: 'warhorse', at: { q: f.q + 1, r: f.r } }, DM));
  const horse = Object.keys(s.entities).at(-1);
  ok(apply(s, { type: 'bond', actor: horse, to: 'fighter', kind: 'steed', turn: 'after' }, DM));
  ok(apply(s, { type: 'mount', actor: 'fighter', mount: horse }, DM));
  const put = (tpl, near, min = 3, skip = []) => { for (let dq = -6; dq <= 6; dq++) for (let dr = -6; dr <= 6; dr++) { const at = { q: near.q + dq, r: near.r + dr }; if (skip.some((k) => k.q === at.q && k.r === at.r) || Math.abs(dq) + Math.abs(dr) < min) continue; if (apply(structuredClone(s), { type: 'spawn', monster: tpl, at }, DM).ok) { ok(apply(s, { type: 'spawn', monster: tpl, at }, DM)); return [Object.keys(s.entities).at(-1), at]; } } throw new Error('no room'); };
  const [g, gAt] = put('warhorse', f);
  const [gob] = put('goblin-warrior', gAt, 1);
  ok(apply(s, { type: 'mount', actor: gob, mount: g }, DM));
  ok(apply(s, { type: 'startEncounter', center: f, radius: 40 }, DM));
  const S = view(s, DM), rows = trackerRows(S, { dm: true }).filter((r) => r.e), at = rows.findIndex((r) => r.e.id === 'fighter');
  assert.equal(rows[at + 1].e.id, horse);
  assert.match(text(rowHTML(S, rows[at], { dm: true })), /Riding Warhorse/);
  assert.match(text(rowHTML(S, rows[at + 1], { dm: true })), /Carrying Brenna/);
  // a foe pair: seen together the rows say so; with the rider hidden the mount's row does not say it carries one, and with the mount hidden the rider's does not say it rides
  const show = (edit) => { const c = structuredClone(s); edit(c); return view(c, PAT); };
  const P0 = show(() => {});
  assert.equal(P0.entities[gob]?.riding?.on, g);
  assert.match(text(rowHTML(P0, { e: P0.entities[g] }, {})), /Carrying Goblin/);
  const P1 = show((c) => { c.entities[gob].hidden = true; });
  assert.equal(P1.entities[gob], undefined);
  assert.equal(P1.entities[g].rider, undefined);
  assert.doesNotMatch(text(rowHTML(P1, { e: P1.entities[g] }, {})), /Carrying/);
  const P2 = show((c) => { c.entities[g].hidden = true; });
  assert.equal(P2.entities[g], undefined);
  assert.equal(P2.entities[gob].riding, undefined);
  assert.doesNotMatch(text(rowHTML(P2, { e: P2.entities[gob] }, {})), /Riding/);
});

// #457: another player is sent a homebrew companion as a seen record that keeps its side (view.js, forViewer): no numbers, no master.
// The tracker must draw it as a party creature with a word for its health, and the turn line must name it, without a failure.
test("a party creature a player is sent as a seen record (a homebrew companion that is not theirs) is drawn, with words and no numbers", () => {
  const s = newGame(7);
  ok(apply(s, { type: 'claim', entity: 'fighter', user: 'pat', userName: 'pat' }, PAT));
  const id = ok(apply(s, { type: 'spawn', monster: 'wolf', at: { q: -5, r: 2 }, name: 'Ember wolfling' }, DM)).events[0].id;
  Object.assign(s.entities[id], { tpl: 'hb-ember-folk-wolfling', side: 'party', bond: { to: 'fighter', kind: 'familiar', orders: 'free' } });
  ok(apply(s, { type: 'startEncounter', center: { q: -5, r: 2 } }, DM));
  const BO = { role: 'player', userId: 'bo' };
  const theirs = view(s, BO), mine = view(s, PAT);
  assert.equal(theirs.entities[id].abil, undefined);
  assert.ok(mine.entities[id].abil);
  const draw = (S, who) => trackerRows(S, {}).filter((r) => r.e?.id === id).map((r) => rowHTML(S, r, { mine: (e) => e.owner === who }));
  const rows = draw(theirs, 'bo');
  assert.equal(rows.length, 1, 'it is in their tracker');
  assert.match(text(rows[0]), /Ember wolfling/);
  assert.doesNotMatch(text(rows[0]), /\d+ \/ \d+/, 'no hit point numbers');
  assert.match(text(draw(mine, 'pat')[0]), /\d+ \/ \d+/, 'its controller has them');
  // Every creature's turn can be named from the seen record.
  const S = structuredClone(theirs);
  S.encounter.turn = S.encounter.order.findIndex((o) => o.id === id);
  assert.match(turnLine(S), /Ember wolfling's turn/);
});
