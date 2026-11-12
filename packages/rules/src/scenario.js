// Starter world: a small valley with a pond, woods, a ruin, a goblin camp and four heroes.
import * as H from './hex.js';
import { makeEntity } from './engine.js';
import { MONSTERS, PREGENS } from './content/index.js';

const hash = (q, r, seed) => {
  let h = (q * 374761393 + r * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function newGame(seed = 7) {
  const tiles = {};
  const smooth = (h) => (hash(h.q, h.r, seed) + H.neighbors(h).reduce((a, n) => a + hash(n.q, n.r, seed), 0)) / 7;
  for (const h of H.range({ q: 0, r: 0 }, 13)) {
    const n = smooth(h), j = hash(h.q, h.r, seed + 1);
    let t = n > 0.56 ? 'forest' : j > 0.965 ? 'rock' : 'grass';
    tiles[H.key(h)] = { t, h: 0.45 + n * 0.7 + (t === 'rock' ? 0.8 : 0) };
  }
  const set = (hexes, t, h) => { for (const x of hexes) if (tiles[H.key(x)]) tiles[H.key(x)] = { t, h }; };
  set(H.range({ q: -3, r: 7 }, 2), 'water', 0.25);
  set(H.range({ q: 0, r: -9 }, 2), 'stone', 0.9);
  set([{ q: -1, r: -8 }, { q: 2, r: -10 }, { q: 1, r: -11 }], 'rock', 1.9);
  const flat = (h) => { if (tiles[H.key(h)]) tiles[H.key(h)] = { t: 'grass', h: 0.6 }; };

  const s = {
    version: 1, rng: seed | 0, seq: 0, clock: 8 * 60, map: { radius: 13, tiles },
    entities: {}, encounter: null, timeline: [], settings: { autoEngage: true },
  };
  const add = (tpl, over) => { flat(over.pos); s.entities[over.id] = makeEntity(tpl, over); };
  const colors = { fighter: '#c8553d', rogue: '#4a7c59', cleric: '#d9a441', wizard: '#5b6fb5' };
  [['fighter', -6, 2], ['rogue', -7, 3], ['cleric', -7, 2], ['wizard', -8, 3]].forEach(([k, q, r]) =>
    add(PREGENS[k], { id: k, kind: 'pc', side: 'party', pos: { q, r }, look: { color: colors[k] } }));
  [['goblin-warrior', 4, -1], ['goblin-warrior', 5, -2], ['goblin-warrior', 5, 0], ['wolf', 6, -1], ['skeleton', 0, -9], ['skeleton', 1, -10]].forEach(([k, q, r], i) => {
    const n = Object.values(s.entities).filter((o) => o.tpl === k).length + 1;
    add(MONSTERS[k], { id: `m${i + 1}`, tpl: k, name: `${MONSTERS[k].name} ${n}`, pos: { q, r } });
  });
  s.seq = 10;
  s.timeline.push(
    { t: 0, type: 'chronicle', title: 'The old watchtower falls', text: 'A generation ago the watchtower north of the valley was abandoned. Its dead do not rest.', tags: ['ruin', 'history'] },
    { t: 7 * 60, type: 'chronicle', title: 'Goblins raid the east road', text: 'A goblin band with a tamed wolf took a merchant cart at dawn and camped east of the pond.', tags: ['goblins'] },
  );
  return s;
}
