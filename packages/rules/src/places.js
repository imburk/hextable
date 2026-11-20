// Places: the nodes of a world's atlas as the game state keeps them, the place in play and the parked ones
// (docs/specs/travel.md, Decisions 1 and 5; build row W2). Pure: what is worked out here changes nothing but
// what it is handed; the actions that move the table between places are in engine/travel.js.
//
//   s.world:  null | { id, version, hash, root, nodes: { [id]: node }, routes, tables, came? }
//             node: { id, kind: 'nav' | 'map' | 'scene' | 'vessel', name?, scale?, parent?, pins?, entries?, terrain?, added? }
//             (the index of the world the DM imported, W3; a node made in play by `nodeAdd` carries `added: true`).
//             `came` is the engine's own note of the entry the party last arrived by at each battle node, for a reset;
//             `at` is the pin each creature on a navigation node stands at, `{ [creature id]: pin id }`: the spec's `e.pin`,
//             kept here and not on the creature because a party creature's record is sent to players whole, and a pin's
//             id is the DM's (Decision 12: players are sent pins renumbered, W4).
//   s.place:  null | the id of the node in play (null: the map in play is not a place of a world)
//   s.parked: { [id]: { map, entities, effects, scene, encounter: null, pending: null, since, kept, stale } }
//             (and `sinceOf: { [creature id]: clock }` for a creature there that was parked from another time than `since`)
//   s.journey: null (journeys are W6)
//
// A table that has never used a world has `world: null, place: null, parked: {}, journey: null` (or, made by
// `newGame`, none of the four): everything here reads an absent field as empty.
import { gridOf, key, parse } from './grid.js';
import { ground, landing, STEP_MAX } from './space.js';
import { TILES } from './content/terrain.js';
import { barriers } from './walls.js';

// staleDays: a parked battle place goes stale this long after it was parked or last kept (the owner, 15 November);
// parked: how many battle places may be parked at once; nodes, depth, name: the limits of a node made in play, the
// same as an imported world's (WORLD_LIMITS, W3) **(design choice)**.
export const TRAVEL_LIMITS = { staleDays: 10, staleMinutes: 10 * 1440, parked: 16, nodes: 300, depth: 8, name: 60 };
export const NODE_KINDS = ['nav', 'map', 'scene', 'vessel'];
export const STALE_CHOICES = ['keep', 'reset', 'edit'];
export const CAP_TEXT = 'Sixteen places hold changes. Let one of them go back to how the world pack has it.';
const EPS = 1e-6;                                         // the clock counts rounds as 0.1 of a minute

export const isBattle = (node) => node?.kind === 'map' || node?.kind === 'vessel';
const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.hasOwn(o, k);
export const nodeOf = (s, id) => (own(s.world?.nodes, id) ? s.world.nodes[id] : null);
export const parkedOf = (s, id) => (own(s.parked, id) ? s.parked[id] : null);
// A parked record that holds a battle map (a holding map never goes stale, and is not counted toward the cap).
export const battleRecord = (rec) => !!rec?.map && !rec.map.holding;
export const parkedBattles = (s) => Object.values(s.parked ?? {}).filter(battleRecord).length;

const words = (id) => String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
// What a place is called in a sentence to the DM: its name in the index, or its map's, or its id in words.
export function placeName(s, id) {
  const n = nodeOf(s, id), rec = parkedOf(s, id);
  return n?.name ?? (battleRecord(rec) ? rec.map.name : null) ?? (s.place === id && s.map && !s.map.holding ? s.map.name : null) ?? words(id);
}

// The pin a creature stands at on a navigation node (null: none), and setting it (null takes it away).
export const pinOf = (s, id) => (own(s.world?.at, id) ? s.world.at[id] : null);
export function setPin(s, id, pin) {
  if (pin) ((s.world ??= emptyWorld()).at ??= {})[id] = pin;
  else if (own(s.world?.at, id)) delete s.world.at[id];
}
export const emptyWorld = () => ({ id: null, version: null, hash: null, root: null, nodes: {}, routes: [], tables: [] });
// A parked record, in the shape V2 will need (Decision 5).
export const newRecord = (map, since, { entities = {}, effects = [], scene = null } = {}) =>
  ({ map, entities, effects, scene, encounter: null, pending: null, since, kept: null, stale: null });

// How many levels a node is below the top of the atlas (a node with no parent is 1). A loop counts as too deep.
export function depthOf(s, id) {
  let n = 0;
  for (let at = id, seen = new Set(); at !== null && at !== undefined; at = nodeOf(s, at)?.parent ?? null) {
    if (seen.has(at) || ++n > 64) return Infinity;
    seen.add(at);
  }
  return n;
}

// An id for a node made in play, from its name: lower-case kebab, `-2` and on for a clash (Decision 13).
export function nodeIdFor(s, name) {
  const base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'place';
  const taken = (id) => !!nodeOf(s, id) || !!parkedOf(s, id) || ['__proto__', 'constructor', 'prototype'].includes(id);
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}

// ---------- stale places (Decision 5) ----------
// The minutes since a parked place was parked or last kept, whichever is later.
export const leftFor = (s, rec) => s.clock - Math.max(rec.since ?? s.clock, rec.kept ?? -Infinity);
export const daysLeft = (s, rec) => Math.floor((leftFor(s, rec) + EPS) / 1440);
// Run wherever the clock may have moved (engine.js runs it after every action): every parked battle place that has
// crossed the line is marked, and the DM, only the DM, is told once (`placeStale`; view.js sends players no such
// event). Nothing resets by itself: the DM chooses (keepPlace, resetPlace, or `stale` on going there).
export function staleCheck(s, ev) {
  for (const [id, rec] of Object.entries(s.parked ?? {})) {
    if (!battleRecord(rec) || (rec.stale !== null && rec.stale !== undefined)) continue;
    if (leftFor(s, rec) + EPS < TRAVEL_LIMITS.staleMinutes) continue;
    rec.stale = s.clock;
    ev.push({ type: 'placeStale', node: id, name: placeName(s, id), days: daysLeft(s, rec) });
  }
}
export const staleQuestion = (s, id, rec) =>
  `${placeName(s, id)} has been left for ${daysLeft(s, rec)} days. Keep it as it was, put it back as prepared, or edit it first (stale: keep, reset or edit).`;

// ---------- arrivals (Decision 3) ----------
// Party creatures in marching order (byMarch), "so the column comes through the gate in the order it walked". `partyFollow`
// numbers the followers and not their leader, who walks at the head: one that leads a column and has no place in the order
// of its own comes first. `all` is every creature of the place they leave, to find who leads (engine/dm.js, W1).
export function marchOrder(list, all = list) {
  const led = new Set(all.map((e) => e.follow).filter(Boolean));
  const rank = (e) => e.march ?? (led.has(e.id) && !e.follow ? -1 : Infinity);
  return [...list].sort((x, y) => (rank(x) - rank(y)) || 0);
}

// Where `count` creatures arriving on `map` are set down: { spots } in order, or { problem } as a sentence. With `entry`
// (an entry id), on that entry's starts in order, a start nobody can stand on passed over; without, on the starts that
// belong to no entry (or, if every start has one, the first entry's); then, for anyone left, the spiral out from the first
// start. `taken` is the positions (`key`) already filled by creatures there. Moved here from engine/dm.js (W1) unchanged
// in what it gives, so that a plain `loadMap` sets the party down exactly as before.
export function arrivalSpots(map, count, entryId = null, taken = new Set()) {
  const entries = map.entries ?? [];
  const entry = entryId === null || entryId === undefined ? null : entries.find((en) => en.id === entryId) ?? null;
  if ((entryId ?? null) !== null && !entry) return { problem: `That map has no entry "${entryId}".` };
  const walkable = (p) => p && TILES[ground(map, p).tile.t].cost < Infinity;
  // A start's height (P18): its own `z`, else its level's, else the ground's.
  const zOf = (st) => st.z ?? map.levels.find((l) => l.id === st.level)?.z ?? 0;
  const mine = entry ? map.starts.filter((st) => st.entry === entry.id)
    : map.starts.some((st) => st.entry === undefined) ? map.starts.filter((st) => st.entry === undefined)
    : map.starts.filter((st) => st.entry === entries[0]?.id);
  const first = mine[0] ?? parse(Object.keys(map.levels[0].tiles)[0]);
  const start = landing(map, first, zOf(first));
  const spots = [], used = new Set(taken);
  const take = (p) => { spots.push(p); used.add(key(p)); };
  const B = barriers(map), G = gridOf(map);
  const standing = (st) => { const p = landing(map, st, zOf(st)), level = p && ground(map, p)?.level; return walkable(p) && level && !B.solid(level.id, p) ? p : null; };
  if (entry && !mine.some(standing)) return { problem: `Nobody can stand at ${entry.name}.` };
  for (const st of mine) {
    if (spots.length >= count) break;
    const p = standing(st);
    if (p && !used.has(key(p))) take(p);
  }
  for (let n = 0; n < 12 && spots.length < count; n++) {
    for (const h of G.range(start, n)) {
      const p = G.dist(h, start) === n ? landing(map, h, start.z) : null;
      if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < count && !used.has(key(p))) take(p);
    }
  }
  return spots.length === count ? { spots } : { problem: 'That map has no room for the party at its start.' };
}

// ---------- who goes, and what goes with them (Decision 5, "What goes and what stays") ----------
// The creatures that go when `ids` go from a place whose creatures are `here`: a creature bonded to one that goes goes
// with its master (a companion; a familiar in a pocket is in its master's record already), and a mount with its rider
// and a rider with its mount. Returns { ids } or { problem }: a companion named without its master is refused.
export function goingWith(here, ids) {
  const set = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const x of Object.values(here)) {
      const add = (id) => { if (typeof id === 'string' && own(here, id) && !set.has(id)) { set.add(id); grew = true; } };
      if (set.has(x.id)) { add(x.riding?.on); add(x.rider); } else if (x.bond && set.has(x.bond.to)) add(x.id);
    }
  }
  for (const id of set) {
    const m = here[id].bond?.to;
    if (typeof m === 'string' && own(here, m) && !set.has(m)) return { problem: `${here[id].name} goes with ${here[m].name}.` };
  }
  return { ids: set };
}

// What becomes of a lasting effect of a place when `movers` leave it ('go', 'stay' or 'end'). `here` is the creatures of
// the place. An effect goes with the movers when every creature it involves (its source and the targets of its parts not
// yet ended) goes, and a zone that follows a mover goes with it (Spirit Guardians); it stays when none of them goes, and a
// zone or changed ground laid on the place's cells (E8) stays even if its source goes, unless the source concentrates on
// it (Concentration cannot be kept across places: the source's next spell would not end it) or a creature still held by
// one of its parts goes. Anything else spans two places and ends, "the party moved on", as `loadMap` does today.
export function effectFate(fx, movers, here) {
  const live = (fx.parts ?? []).filter((p) => !p.ended).map((p) => p.target);
  const ids = [...new Set([fx.source, ...live])].filter((id) => own(here, id));
  const going = ids.filter((id) => movers.has(id));
  if (!going.length) return 'stay';
  const laid = !!fx.terrain || (!!fx.zone && !fx.zone.follows);
  if (laid) return live.some((t) => movers.has(t)) || (fx.conc && movers.has(fx.source)) ? 'end' : 'stay';
  return going.length === ids.length ? 'go' : 'end';
}
