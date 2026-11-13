// Vision: what the party can see now, and what it remembers of places it has seen.
//
//   partyView(state)    -> { rule, creatures, objects, sight, seen }   cached; rebuilt only when it can have changed
//   unknown(state, e)   -> may the players not be told of this creature?
//   remember(state)     -> adds what the party sees now to map.seen (the engine calls it after every action)
//
// The table rule `sight` says how much of this is used: 'rooms' (the default: regions as they are
// revealed, everything in them; this file is not consulted), 'los' (creatures and things only while
// someone in the party has a line of sight to them) or 'light' (as los, through canSee: light,
// senses and conditions count, and places never lit for the party are not sent).
// The party sees as one: the union of what its members see. Pure: no I/O, and the caches are kept
// beside the state, never in it. Design: docs/specs/sight.md, decision 6.
import * as H from './hex.js';
import { FT, concealed, gap, regionAt, shown } from './space.js';
import { barriers, objectDef, objectHexes, objectSegment } from './walls.js';
import { canSee, coverOf, inView, inViewOf, lightAt, lightSources } from './sight.js';
import { has } from './modifiers.js';

export const SIGHT_RULES = ['rooms', 'los', 'light'];
export const sightRule = (s) => s?.settings?.sight ?? 'rooms';
// How far, in hexes, the party's eyes are followed across tiles to find the places in view. Creatures
// and things are judged directly, at any distance.
export const FLOOD_HEXES = 40;

const up = (e) => !e.dead && e.hp > 0;
const eyesOf = (s) => Object.values(s.entities).filter((e) => e.side === 'party' && up(e));
const placeOf = (level, h) => { const t = level.tiles[H.col(h)]; return t ? { q: h.q, r: h.r, z: level.z + (t.h ?? 0) } : null; };

// ---------- places in sight ----------
// Every tile some line of sight from `eye` reaches, found by spreading out from it across tiles
// and testing each with inView (sight.js): a tile is looked past only if it is itself in view, or
// right beside the eye. Keyed `level|q,r` -> { level, q, r, z }. Kept per map and position until a
// wall, door or the map changes. This can miss a tile seen only through a gap no wider than a
// sliver; it never includes one out of sight.
const floods = new WeakMap();
export function tilesInSight(map, eye) {
  const B = barriers(map);
  let had = floods.get(map);
  if (!had || had.sig !== B.sig || had.at.size > 256) floods.set(map, had = { sig: B.sig, at: new Map() });
  const k = `${eye.q},${eye.r},${eye.z}`;
  let out = had.at.get(k);
  if (out) return out;
  out = new Map();
  const tried = new Set(), queue = [];
  const push = (level, q, r) => {
    const key = `${level.id}|${q},${r}`, t = level.tiles[`${q},${r}`];
    if (!t || tried.has(key)) return;
    tried.add(key);
    queue.push({ key, level: level.id, q, r, z: level.z + (t.h ?? 0) });
  };
  const around = (q, r) => { for (const l of map.levels) { push(l, q, r); for (const n of H.neighbors({ q, r })) push(l, n.q, n.r); } };
  around(eye.q, eye.r);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i], d = H.dist(eye, n);
    if (d > FLOOD_HEXES) continue;
    const seen = inView(map, eye, n);
    if (seen) out.set(n.key, { level: n.level, q: n.q, r: n.r, z: n.z });
    if (seen || d <= 1) around(n.q, n.r);
  }
  had.at.set(k, out);
  return out;
}

// Can this creature make out a place (not a creature): by line of sight and, under the light rule,
// light and senses. Blindsight in range needs no light and no line past a curtain, only no total cover.
export function seesPlace(s, v, pos, rule, sources) {
  if (rule !== 'light') return inViewOf(s.map, v, pos);
  const d = gap(s, v.pos, pos) * FT, sn = v.senses ?? {};
  if ((sn.blindsight ?? 0) >= d && coverOf(s, v, { pos }) !== 'total') return true;
  if (has(v, 'blinded') || !inViewOf(s.map, v, pos)) return false;
  if ((sn.truesight ?? 0) >= d || (sn.darkvision ?? 0) >= d) return true;
  return lightAt(s, pos, sources) !== 'dark';
}

// ---------- the party's view ----------
// Everything partyView depends on, as text: if this is the same, so is the answer.
function signature(s, rule) {
  const m = s.map, parts = [rule, barriers(m).sig, m.levels.map((l) => `${l.id}:${l.z}:${l.light ?? ''}:${Object.keys(l.tiles).length}`).join(),
    m.regions.map((r) => `${r.id}:${r.level}:${r.revealed ? 1 : 0}:${r.light ?? ''}:${r.hexes.length}`).join(), s.settings?.vertical ?? '',
    (s.effects ?? []).filter((fx) => fx.terrain?.obscured).map((fx) => fx.id).join()];        // a spell's fog (terrain.js)
  for (const e of Object.values(s.entities)) {
    const cond = Object.keys(e.cond ?? {}).filter((k) => e.cond[k]).sort().join('+');
    parts.push(`${e.id}:${e.side}:${e.pos.q},${e.pos.r},${e.pos.z}:${e.size ?? ''}:${e.dead ? 1 : 0}${e.hp > 0 ? 1 : 0}${e.hidden ? 1 : 0}${e.hiding ? 1 : 0}:${cond}:${JSON.stringify(e.senses ?? {})}:${e.light ? `${e.light.bright}/${e.light.dim}` : ''}`);
  }
  return parts.join('|');
}
const ROOMS = Object.freeze({ rule: 'rooms', n: 0 });
let serial = 0;                 // each new answer gets a number, so that what is built from it can tell it is new
const views = new WeakMap();
// { rule, creatures: Set of ids the party can see, objects: Set of ids of things in view now,
//   sight: Map of the tiles in someone's line of sight, seen: Map of the tiles someone can make out }
// For 'rooms', just { rule }.
export function partyView(s) {
  const rule = sightRule(s);
  if (rule === 'rooms') return ROOMS;
  const sig = signature(s, rule), had = views.get(s);
  if (had && had.sig === sig && had.map === s.map) return had.pv;
  const map = s.map, eyes = eyesOf(s), sources = rule === 'light' ? lightSources(s) : null;
  const creatures = new Set();
  for (const c of Object.values(s.entities)) {
    if (c.side === 'party' || concealed(map, c)) continue;
    if (eyes.some((v) => (rule === 'los' ? inViewOf(map, v, c) : canSee(s, v, c, { sources }) !== 'no'))) creatures.add(c.id);
  }
  const sight = new Map(), seen = new Map();
  for (const v of eyes) {
    for (const [k, t] of tilesInSight(map, v.pos)) {
      sight.set(k, t);
      if (!seen.has(k) && (rule === 'los' || seesPlace(s, v, t, rule, sources))) seen.set(k, t);
    }
  }
  // Blindsight perceives places beside it that no line of sight reaches (past a curtain, in a cloud).
  if (rule === 'light') for (const v of eyes) {
    const b = v.senses?.blindsight ?? 0;
    if (!b) continue;
    for (const h of H.range(v.pos, Math.floor(b / FT))) for (const l of map.levels) {
      const p = placeOf(l, h), k = `${l.id}|${H.col(h)}`;
      if (p && !seen.has(k) && seesPlace(s, v, p, rule, sources)) seen.set(k, { level: l.id, ...p });
    }
  }
  // A thing is in view when a tile it touches is made out (a door: a tile on either side).
  const objects = new Set();
  for (const o of map.objects) if (objectHexes(o).some((h) => seen.has(`${o.level}|${H.col(h)}`) && shown(map, o.level, h))) objects.add(o.id);
  const pv = { rule, n: ++serial, creatures, objects, sight, seen };
  views.set(s, { sig, map, pv });
  return pv;
}

// May the players not be told of this creature? The DM hid it, it is hiding, it is somewhere not
// revealed, or (under the los and light rules) nobody in the party can see it.
export const unknown = (s, e) => !!e && e.side !== 'party' && (concealed(s.map, e) || (sightRule(s) !== 'rooms' && !partyView(s).creatures.has(e.id)));

// ---------- memory ----------
// map.seen = { tiles: { [level]: ["q,r", ...] }, objects: { [id]: state } }: the tiles the party has
// made out, and each thing as it was when last seen. It only grows, except when the DM clears it
// (the `forget` map edit). Kept in the game state so that it survives a reload and is the same for all.
const sets = new WeakMap();
export function memoryOf(map) {
  const m = map.seen;
  if (!m) return { tiles: new Map(), objects: {} };
  let had = sets.get(m);
  const n = Object.values(m.tiles ?? {}).reduce((a, l) => a + l.length, 0);
  if (!had || had.n !== n) sets.set(m, had = { n, tiles: new Map(Object.entries(m.tiles ?? {}).map(([l, cols]) => [l, new Set(cols)])) });
  return { tiles: had.tiles, objects: m.objects ?? {} };
}
// May players be sent this tile? Its region (if any) is revealed and, under the light rule, the party has made it out.
export function tileSent(s, levelId, h, rule = sightRule(s)) {
  if (!shown(s.map, levelId, h)) return false;
  return rule !== 'light' || !!memoryOf(s.map).tiles.get(levelId)?.has(H.col(h));
}
export function remember(s) {
  const rule = sightRule(s);
  if (rule === 'rooms') return;
  const pv = partyView(s), map = s.map;
  map.seen ??= { tiles: {}, objects: {} };
  map.seen.tiles ??= {}; map.seen.objects ??= {};
  const mem = memoryOf(map);
  for (const t of pv.seen.values()) {
    if (!shown(map, t.level, t)) continue;
    if (mem.tiles.get(t.level)?.has(H.col(t))) continue;
    (map.seen.tiles[t.level] ??= []).push(H.col(t));
    if (!mem.tiles.has(t.level)) mem.tiles.set(t.level, new Set());
    mem.tiles.get(t.level).add(H.col(t));
  }
  const kept = sets.get(map.seen);
  if (kept) kept.n = Object.values(map.seen.tiles).reduce((a, l) => a + l.length, 0);       // the sets were added to in step
  for (const o of map.objects) {
    if (pv.objects.has(o.id)) { map.seen.objects[o.id] = o.state; continue; }
    // A door is part of the room it stands in: once a tile beside it is sent, it is known as it stands then.
    if (map.seen.objects[o.id] === undefined && objectSegment(o) && objectHexes(o).some((h) => map.levels.find((l) => l.id === o.level)?.tiles[H.col(h)] && tileSent(s, o.level, h, rule))) map.seen.objects[o.id] = o.state;
  }
}
// The regions any of these party members has a line of sight into, and the ones they stand in.
export function regionsInSight(s, who) {
  const found = new Set(), map = s.map;
  for (const e of who) {
    if (e.side !== 'party' || e.dead) continue;
    for (const t of tilesInSight(map, e.pos).values()) { const r = regionAt(map, t.level, t); if (r && !r.revealed) found.add(r); }
  }
  return found;
}

// May players name this thing (to use it)? Under los and light: only if they are sent it, as it is
// in view or as remembered, and not in a hidden state.
export function objectKnown(s, o) {
  const pv = partyView(s), st = pv.objects.has(o.id) ? o.state : memoryOf(s.map).objects[o.id];
  return st !== undefined && !objectDef(o)?.states[st]?.hidden && objectHexes(o).some((h) => !!s.map.levels.find((l) => l.id === o.level)?.tiles[H.col(h)] && tileSent(s, o.level, h));
}
