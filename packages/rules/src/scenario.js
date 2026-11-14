// Starter world: a small valley with a pond, woods, a ruin, a goblin camp and four heroes.
import * as H from './hex.js';
import { makeEntity } from './engine.js';
import { MONSTERS, PREGENS } from './content/index.js';
import { derive, validate } from './derive.js';
import { VERSION } from './migrate.js';
import { newMap } from './map.js';
import { HEX, SQUARE } from './grid.js';

const hash = (q, r, seed) => {
  let h = (q * 374761393 + r * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Who stands in the valley's party and where, for up to PARTY_MAX heroes: the four starter spots, then two beside them.
export const PARTY_MAX = 6;
const PARTY_SPOTS = [[-6, 2], [-7, 3], [-7, 2], [-8, 3], [-8, 2], [-6, 3]];
const STARTERS = ['fighter', 'rogue', 'cleric', 'wizard'];
const COLORS = { fighter: '#c8553d', rogue: '#4a7c59', cleric: '#d9a441', wizard: '#5b6fb5' };

// `opts.party` is the heroes of a new game, 1 to PARTY_MAX of them, each `{ pregen: 'fighter' }` (a starter hero by its id, once at most)
// or `{ sheet }` (a build sheet, derive.js: it must pass `validate`). A bad party throws and nothing is made. Without it the party is the
// four starters, exactly as before. A built hero is `pc1`, `pc2`...; its sheet is kept on it, as `setSheet` keeps it.
export function partyProblems(party) {
  if (!Array.isArray(party) || party.length < 1 || party.length > PARTY_MAX) return [`A party is 1 to ${PARTY_MAX} characters.`];
  const bad = [], seen = new Set();
  party.forEach((p, i) => {
    const who = `Character ${i + 1}`;
    if (p?.pregen !== undefined) {
      if (!STARTERS.includes(p.pregen)) bad.push(`${who}: there is no starter character "${p.pregen}".`);
      else if (seen.has(p.pregen)) bad.push(`${who}: the ${p.pregen} is already in the party.`);
      seen.add(p.pregen);
    } else if (p?.sheet) {
      const v = validate(p.sheet);
      if (v.length) bad.push(`${who}: ${v[0]}`);
    } else bad.push(`${who}: neither a starter nor a sheet.`);
  });
  return bad;
}

export function newGame(seed = 7, opts = {}) {
  if (opts?.party !== undefined) { const bad = partyProblems(opts.party); if (bad.length) throw new Error(bad[0]); }
  if (opts?.grid === 'square') return squareValley(newGame(seed, { party: opts.party }));
  const tiles = {};
  const smooth = (h) => (hash(h.q, h.r, seed) + H.neighbors(h).reduce((a, n) => a + hash(n.q, n.r, seed), 0)) / 7;
  for (const h of H.range({ q: 0, r: 0 }, 13)) {
    const n = smooth(h), j = hash(h.q, h.r, seed + 1);
    let t = n > 0.56 ? 'forest' : j > 0.965 ? 'rock' : 'grass';
    tiles[H.key(h)] = { t, lift: 0.45 + n * 0.7 + (t === 'rock' ? 0.8 : 0) };   // `lift` is for looks only; the valley is flat by the rules
  }
  const set = (hexes, t, lift) => { for (const x of hexes) if (tiles[H.key(x)]) tiles[H.key(x)] = { t, lift }; };
  set(H.range({ q: -3, r: 7 }, 2), 'water', 0.25);
  set(H.range({ q: 0, r: -9 }, 2), 'stone', 0.9);
  set([{ q: -1, r: -8 }, { q: 2, r: -10 }, { q: 1, r: -11 }], 'rock', 1.9);
  const flat = (h) => { if (tiles[H.key(h)]) tiles[H.key(h)] = { t: 'grass', lift: 0.6 }; };

  const s = {
    version: VERSION, rng: seed | 0, seq: 0, clock: 8 * 60, 
    map: newMap({ id: 'valley', name: 'The valley', levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], starts: [{ q: -6, r: 2 }] }),
    entities: {}, encounter: null, conclusion: null, scene: null, effects: [], handouts: [], timeline: [], settings: { sight: 'rooms', autoEngage: true, passiveFind: 'off', vertical: 'max', climbing: 'on', cover: 'on', creatureCover: 'on', engageRange: 10, unseenTurns: 'say', diceThrow: 'auto', pace: 'wait', conclusion: 'dm', xpShare: 'split' },
  };
  const add = (tpl, over) => { flat(over.pos); s.entities[over.id] = makeEntity(tpl, over); };
  (opts?.party ?? STARTERS.map((pregen) => ({ pregen }))).forEach((p, i) => {
    const [q, r] = PARTY_SPOTS[i], pos = { q, r, z: 0 };
    if (p.pregen) return add(PREGENS[p.pregen], { id: p.pregen, kind: 'pc', side: 'party', pos, look: { color: COLORS[p.pregen] } });
    add(derive(p.sheet).record, { id: `pc${i + 1}`, kind: 'pc', side: 'party', pos });
    s.entities[`pc${i + 1}`].sheet = structuredClone(p.sheet);
  });
  [['goblin-warrior', 4, -1], ['goblin-warrior', 5, -2], ['goblin-warrior', 5, 0], ['wolf', 6, -1], ['skeleton', 0, -9], ['skeleton', 1, -10]].forEach(([k, q, r], i) => {
    const n = Object.values(s.entities).filter((o) => o.tpl === k).length + 1;
    add(MONSTERS[k], { id: `m${i + 1}`, tpl: k, name: `${MONSTERS[k].name} ${n}`, pos: { q, r, z: 0 } });
  });
  s.seq = 10;
  s.timeline.push(
    { t: 0, type: 'chronicle', title: 'The old watchtower falls', text: 'A generation ago the watchtower north of the valley was abandoned. Its dead do not rest.', tags: ['ruin', 'history'] },
    { t: 7 * 60, type: 'chronicle', title: 'Goblins raid the east road', text: 'A goblin band with a tamed wolf took a merchant cart at dawn and camped east of the pond.', tags: ['goblins'] },
  );
  return s;
}

// The same valley on squares (docs/specs/square-grid.md, Decision 7 and row S12). It is made from the
// hex valley of the same seed, so it is the same place: every square takes the terrain that lies under
// its centre on the hex valley, and every creature stands on the square that holds its hex's centre
// (the next free one if two would share). The heroes, the foes, their numbers, the clock, the settings
// and the chronicle are the hex valley's own, and the dice are the same seed. The hex valley itself is
// not touched: `newGame(seed)` is what it always was.
function squareValley(hexGame) {
  const s = hexGame, hexTiles = s.map.levels[0].tiles, tiles = {};
  const R = 14;                                                 // the valley is 13 hexes (65 ft) from its middle
  for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
    const [x, y] = SQUARE.center({ q, r }), t = hexTiles[H.col(HEX.cell(x, y))];
    if (t) tiles[`${q},${r}`] = { t: t.t, lift: t.lift };
  }
  const taken = new Set();
  const squareOf = (pos) => {
    const [x, y] = HEX.center(pos), want = SQUARE.cell(x, y);
    const near = [want, ...SQUARE.range(want, 2).sort((a, b) => SQUARE.dist(want, a) - SQUARE.dist(want, b) || Math.hypot(a.q - x / 5, a.r - y / 5) - Math.hypot(b.q - x / 5, b.r - y / 5))];
    const at = near.find((c) => tiles[`${c.q},${c.r}`] && !taken.has(`${c.q},${c.r}`));
    taken.add(`${at.q},${at.r}`);
    return at;
  };
  for (const e of Object.values(s.entities)) {                  // in the order the hex valley placed them, heroes first
    const at = squareOf(e.pos);
    e.pos = { q: at.q, r: at.r, z: 0 };
    tiles[`${at.q},${at.r}`] = { t: 'grass', lift: 0.6 };       // the same trampled ground the hex valley gives each creature
  }
  const start = Object.values(s.entities).find((e) => e.kind === 'pc').pos;   // the first hero, as the hex valley placed them
  s.map = newMap({ id: 'valley-squares', name: 'The valley', grid: 'square', levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], starts: [{ q: start.q, r: start.r }] });
  return s;
}
