// Tides: water that rises and falls (docs/specs/fly-swim-control.md, stage E3). A water level is a change of tiles, kept reversible: a cell
// the water covers becomes a `water` tile that remembers what it was (`dry`, a copy), and a cell the water leaves goes back to it.
// `setSurface` is the pure arithmetic of one cell; `waterChange` is the DM's action (a change now, or a tide that moves each round of a
// fight); `stepTides` is what a new round does to the tides. Everything here works on a copy of the terrain and puts it in whole, as
// `mapEdit` does (the engine holds the terrain by reference for a restore, so a tile is never written in place).
import { WATER_DEPTH, TILES, depthOk } from './content/terrain.js';
import { col, gridOf } from './grid.js';
import { footprint, FT, ground } from './space.js';

const COL = /^-?\d+,-?\d+$/;
export const MAX_TIDES = 16;                     // tides running at once
export const MAX_CELLS = 5000;                   // cells one change or one tide may name

const feet = (n) => Number.isInteger(n) && n % FT === 0;
const copy = (t) => structuredClone(t);
const strip = (t) => { const { dry, ...rest } = t; return rest; };

// The height of a tile's top: the surface of a water tile, the floor of any other (`h` is feet above its level).
export const topOf = (level, tile) => level.z + (tile.h ?? 0);
// The tile as it was before any water change: the one kept on it, or itself.
export const dryOf = (tile) => (tile.dry ? copy(tile.dry) : copy(strip(tile)));
// The floor a cell has when no water stands on it: the top of its dry tile, or the bed of it if it was water.
export function floorOf(level, tile) {
  const dry = tile.dry ?? tile;
  return dry.t === 'water' ? topOf(level, dry) - (dry.depth ?? 0) : topOf(level, dry);
}

// The new tiles for some cells of a level when the water stands at `surface` feet (absolute, a multiple of 5), as { tiles: { key: tile } },
// or { problem } in words. A cell whose floor is below the surface becomes water as deep as the difference (`WATER_DEPTH`); one whose floor
// is at or above it is its dry tile again (no `dry` key); a dry tile that was water, with the surface at or below its bed, becomes the bed
// itself (`opts.bed`, a terrain type, default stone): the Sluice Gallery drained. The first dry tile is kept: a cell changed twice
// returns to what it was before the first change.
export function setSurface(map, levelId, cells, surface, opts = {}) {
  const level = map?.levels?.find((l) => l.id === levelId);
  if (!level) return { problem: `There is no level "${levelId}".` };
  if (!Number.isInteger(surface) || !feet(surface)) return { problem: 'A water surface is a height in feet, a multiple of 5.' };
  const bed = opts.bed ?? 'stone';
  if (typeof bed !== 'string' || !Object.hasOwn(TILES, bed) || bed === 'water') return { problem: `"${bed}" is not ground a bed can be.` };
  const tiles = {};
  for (const key of cells) {
    const tile = level.tiles[key];
    if (!tile) return { problem: `There is no tile at ${key} on "${levelId}".` };
    const dry = dryOf(tile);
    if (dry.t === 'water' && !depthOk(dry.depth)) return { problem: `The water at ${key} has no depth to give a bed.` };
    const floor = floorOf(level, tile);
    if (surface > floor) {
      const depth = surface - floor;
      if (!depthOk(depth)) return { problem: depth > WATER_DEPTH.max ? `The water at ${key} would be ${depth} feet deep; the deepest is ${WATER_DEPTH.max}.` : `The water at ${key} would be ${depth} feet deep; a depth is a multiple of ${WATER_DEPTH.step}.` };
      tiles[key] = { t: 'water', h: surface - level.z, depth, dry };
    } else if (dry.t === 'water') tiles[key] = { t: bed, h: floor - level.z, dry };
    else tiles[key] = dry;
  }
  return { tiles };
}

// The cells of a change as a list of keys, from `cells` or a `region`; and its level. A sentence if it makes no sense.
function aim(map, a) {
  let level = a.level, cells = a.cells;
  if (a.region !== undefined) {
    if (cells !== undefined) return 'Name cells or a region, not both.';
    const r = typeof a.region === 'string' && map.regions.find((x) => x.id === a.region);
    if (!r) return 'There is no such region.';
    if (level !== undefined && level !== r.level) return `That region is on "${r.level}", not "${level}".`;
    level = r.level; cells = r.hexes;
  }
  if (typeof level !== 'string' || !map.levels.some((l) => l.id === level)) return 'Name a level of the map.';
  if (!Array.isArray(cells) || !cells.length) return 'Name the cells the water is to change (or a region).';
  if (cells.length > MAX_CELLS) return `That is more than ${MAX_CELLS} cells.`;
  const l = map.levels.find((x) => x.id === level);
  for (const k of cells) {
    if (typeof k !== 'string' || !COL.test(k)) return 'A cell is written "q,r".';
    if (!l.tiles[k]) return `There is no tile at ${k} on "${level}".`;
  }
  return { level, cells: [...new Set(cells)] };
}

// Move creatures with the water. `from` and `to` are the maps before and after. A creature on a cell the water now covers is lifted to the new
// surface; one under the old surface stays where it is; a creature at the old surface comes down with the water, and one under it that is now above
// it is at the new surface (no fall damage either way: the water carries it). A big creature is judged by its whole footprint and goes to the highest
// new surface under it, if its anchor is held up there (the gravity pass would drop it from anywhere else): otherwise it stays.
function carry(s, from, to, levelId, changed, ev) {
  const lo = from.levels.find((l) => l.id === levelId), ln = to.levels.find((l) => l.id === levelId), G = gridOf(to);
  const moved = new Map();
  const mounted = (e) => typeof e.riding?.on === 'string' && Object.hasOwn(s.entities, e.riding.on);
  for (const e of Object.values(s.entities)) {
    if (!e?.pos || mounted(e)) continue;
    const z = e.pos.z ?? 0, up = [], down = [];
    for (const c of footprint(e, e.pos, G)) {
      const k = col(c);
      if (!changed.has(k)) continue;
      const was = lo.tiles[k], now = ln.tiles[k], wasTop = topOf(lo, was), nowTop = topOf(ln, now);
      const inside = was.t === 'water' && depthOk(was.depth) ? z >= wasTop - was.depth && z <= wasTop : z === wasTop;
      if (!inside) continue;
      if (nowTop > wasTop) { if (z === wasTop) up.push(nowTop); }
      else if (nowTop < wasTop && z > nowTop) down.push(nowTop);
    }
    const next = up.length ? Math.max(...up) : down.length ? Math.max(...down) : z;
    if (next === z || !ground(to, { q: e.pos.q, r: e.pos.r, z: next })) continue;
    e.pos = { q: e.pos.q, r: e.pos.r, z: next };
    moved.set(e.id, e.pos);
    ev.push({ type: 'moved', id: e.id, path: [{ ...e.pos }], water: true });
  }
  for (const r of Object.values(s.entities)) {                       // a rider goes where its mount went
    const at = mounted(r) ? moved.get(r.riding.on) : null;
    if (!at) continue;
    r.pos = { ...at };
    ev.push({ type: 'moved', id: r.id, path: [{ ...at }], water: true });
  }
}

// Put the water of some cells at the given surfaces ({ key: surface }). Returns a sentence if it cannot be done, else the number of cells that changed
// (the terrain and the creatures are changed only then).
function flood(s, levelId, surfaces, bed, ev, extra = {}) {
  const groups = new Map();
  for (const [k, z] of Object.entries(surfaces)) { if (!groups.has(z)) groups.set(z, []); groups.get(z).push(k); }
  const level = s.map.levels.find((l) => l.id === levelId), next = {};
  for (const [z, keys] of groups) {
    const r = setSurface(s.map, levelId, keys, z, { bed });
    if (r.problem) return r.problem;
    Object.assign(next, r.tiles);
  }
  const changed = new Set(Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(level.tiles[k])));
  if (!changed.size) return 0;
  const tiles = { ...level.tiles };
  for (const k of changed) tiles[k] = next[k];
  const from = s.map;
  s.map = { ...from, levels: from.levels.map((l) => (l.id === levelId ? { ...l, tiles } : l)) };
  ev.push({ type: 'water', level: levelId, cells: changed.size, ...extra });
  carry(s, from, s.map, levelId, changed, ev);
  return changed.size;
}

const nextTide = (list) => `T${list.reduce((n, t) => Math.max(n, Number(/^T(\d+)$/.exec(t.id)?.[1] ?? 0)), 0) + 1}`;

// The DM's `water` action (engine/dm.js). { level, cells | region, surface | by, bed?, rise?: { by, to } } or { tide, stop: true }.
// Returns a sentence if it is refused (and has changed nothing), else null. A tide is kept in `s.tides` as
// `{ id, map, level, cells, by, to, at }`: `at` is where its water stands now, `map` the map it belongs to.
export function waterChange(s, a, ev) {
  if (s.map?.holding) return 'This is not a battle map: there is no water to change here.';
  if (a.tide !== undefined || a.stop !== undefined) {
    if (typeof a.tide !== 'string' || a.stop !== true) return 'To stop a tide name it and say stop: true.';
    const i = (s.tides ?? []).findIndex((t) => t.id === a.tide);
    if (i < 0) return 'There is no such tide.';
    const [gone] = s.tides.splice(i, 1);
    if (!s.tides.length) delete s.tides;
    ev.push({ type: 'water', tide: gone.id, stop: true, level: gone.level });
    return null;
  }
  const where = aim(s.map, a);
  if (typeof where === 'string') return where;
  const { level: levelId, cells } = where, level = s.map.levels.find((l) => l.id === levelId);
  if (a.surface !== undefined && a.by !== undefined) return 'Give a surface or a change, not both.';
  if (a.surface === undefined && a.by === undefined && a.rise === undefined) return 'Give a surface, a change, or a tide to set.';
  if (a.by !== undefined && a.rise !== undefined) return 'A tide starts from a surface: give surface with rise, not by.';
  if (a.surface !== undefined && !feet(a.surface)) return 'A water surface is a height in feet, a multiple of 5.';
  if (a.by !== undefined && (!feet(a.by) || a.by === 0)) return 'A change is a number of feet, a multiple of 5, not 0.';
  if (a.bed !== undefined && (typeof a.bed !== 'string' || !Object.hasOwn(TILES, a.bed) || a.bed === 'water')) return `"${a.bed}" is not ground a bed can be.`;
  let rise = null;
  if (a.rise !== undefined) {
    const r = a.rise;
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some((k) => k !== 'by' && k !== 'to')) return 'A tide is { by, to }, in feet.';
    if (!feet(r.by) || r.by === 0 || !feet(r.to)) return 'A tide moves by feet and stops at feet, multiples of 5; it cannot move by 0.';
    if ((s.tides ?? []).length >= MAX_TIDES) return `There are ${MAX_TIDES} tides already.`;
    rise = r;
  }
  const waters = cells.map((k) => level.tiles[k]).filter((t) => t.t === 'water' && depthOk(t.depth));
  // Where the tide's water stands to begin with: the surface given, else the highest water on its cells, else the lowest floor (no water yet).
  const at = a.surface !== undefined ? a.surface
    : waters.length ? Math.max(...waters.map((t) => topOf(level, t)))
    : Math.min(...cells.map((k) => floorOf(level, level.tiles[k])));
  if (rise && (rise.by > 0 ? at >= rise.to : at <= rise.to)) return `The water is already at ${at} feet; a tide that moves by ${rise.by} cannot reach ${rise.to}.`;
  if (a.surface !== undefined || a.by !== undefined) {
    const to = {};
    for (const k of cells) to[k] = a.surface !== undefined ? a.surface : topOf(level, level.tiles[k]) + a.by;
    const r = flood(s, levelId, to, a.bed, ev);
    if (typeof r === 'string') return r;
    if (r === 0 && !rise) return 'The water is already there.';
  }
  if (rise) {
    (s.tides ??= []).push({ id: nextTide(s.tides), map: s.map.id, level: levelId, cells, by: rise.by, to: rise.to, at, ...(a.bed !== undefined ? { bed: a.bed } : {}) });
    ev.push({ type: 'water', tide: s.tides.at(-1).id, level: levelId, set: true, by: rise.by, to: rise.to, at });
  }
  return null;
}

// A new round of a fight (engine/resolve.js): every tide moves by its step, to where it stops, and one that has reached its end is removed. A tide whose
// map is not the one in play waits (outside a fight nothing moves: DEBT). A tide that cannot go on (the water would be deeper than the deepest) stops.
export function stepTides(s, ev) {
  if (!Array.isArray(s.tides)) return;
  for (const t of [...s.tides]) {
    if (t.map !== s.map?.id || !s.map.levels.some((l) => l.id === t.level)) continue;
    const at = t.by > 0 ? Math.min(t.at + t.by, t.to) : Math.max(t.at + t.by, t.to);
    const to = Object.fromEntries(t.cells.map((k) => [k, at]));
    const tiles = s.map.levels.find((l) => l.id === t.level).tiles;
    const r = t.cells.every((k) => tiles[k]) ? flood(s, t.level, to, t.bed, ev, { tide: t.id, surface: at }) : 'The tide has no map to run on.';
    const done = typeof r === 'string' || at === t.to;
    if (typeof r === 'string') ev.push({ type: 'water', tide: t.id, stop: true, level: t.level, why: r });
    t.at = at;
    if (done) s.tides.splice(s.tides.indexOf(t), 1);
  }
  if (!s.tides.length) delete s.tides;
}
