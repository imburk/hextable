// A lasting zone is tinted by the first kind of damage it deals (#842): a player's zone carries `look`, the DM's and a solo table's its `steps`. Both draw the same.
// Laid out beside the rules as costtints.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'zonelook-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { THEMES } = await imp('themes.js');
const B = await imp('three-build.js');
const { newGame } = await imp('shared/scenario.js');
const { view } = await imp('shared/view.js');

const base = { area: [], range: [], targets: [], allies: [], selected: null, turn: null, move: [] };
const draw = (s) => Array.from(B.buildOverlay({ state: s, hl: base, theme: THEMES.classic }).d);
const withZone = (zone) => { const s = newGame(7), c = s.entities.fighter.pos; return { ...s, effects: [{ id: 'fx1', name: 'Z', spell: 'z', source: 'fighter', conc: true, lasts: '1 minute', until: null, parts: [], zone: { area: { shape: 'sphere', size: 5 }, hexes: [`${c.q + 1},${c.r}`, `${c.q + 2},${c.r}`], origin: { q: c.q + 1, r: c.r, z: 0 }, ...zone } }] }; };

test('a zone is tinted by its `look` where it has one, and by the damage in its steps where it has those', () => {
  const steps = [{ save: 'dex', dc: 14, onFail: [{ damage: '2d8', type: 'fire' }] }];
  const fire = draw(withZone({ steps })), fireLook = draw(withZone({ look: 'fire' })), cold = draw(withZone({ look: 'cold' })), none = draw(withZone({ look: 'neutral' }));
  assert.deepEqual(fireLook, fire, 'a player\'s `look` draws what the DM\'s steps draw');
  assert.notDeepEqual(cold, fireLook);
  assert.notDeepEqual(none, fireLook);
  assert.deepEqual(draw(withZone({ look: 'nonsense' })), none, 'a look the theme has no tint for is drawn neutral, not a crash');
});

test('a zone as a player is sent it is drawn', () => {
  const s = newGame(7), c = s.entities.fighter.pos;
  s.entities.fighter.owner = 'pat';
  s.effects = [{ id: 'fx1', name: 'Moonbeam', spell: 'moonbeam', source: 'fighter', conc: true, lasts: '1 minute', until: null, parts: [],
    zone: { area: { shape: 'cylinder', size: 5, height: 40 }, on: ['enter'], hexes: [`${c.q + 1},${c.r}`], origin: { q: c.q + 1, r: c.r, z: 0 }, spare: [], steps: [{ damage: '2d10', type: 'radiant' }], src: { dc: 15 }, last: {} } }];
  const sent = view(s, { role: 'player', userId: 'pat' });
  assert.ok(sent.effects[0].zone && !sent.effects[0].zone.steps && sent.effects[0].zone.look === 'radiant');
  const empty = draw({ ...s, effects: [] });
  assert.ok(draw(sent).length > empty.length, 'the zone is drawn from what a player is sent');
});
