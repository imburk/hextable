// The map document: one self-contained JSON description of a place. A table's game state holds
// its own copy. Design: docs/specs/maps-and-objects.md
import { col, gridOf } from './grid.js';
import { TILES } from './content/terrain.js';
import { CONTENT } from './content/index.js';
import { WALL_KINDS } from './walls.js';
import { AMBIENT } from './content/lights.js';

// Format 2 (docs/specs/square-grid.md, Decision 3): the map says which grid it is drawn on, `grid`
// 'hex' or 'square', and how many feet a cell is, `cellFeet` (format 1 called it `hexFeet`). A build
// that reads format 1 refuses a format 2 document rather than reading a square map as hexes.
export const MAP_FORMAT = 2;
export const GRIDS = ['hex', 'square'];
export const MAP_LIMITS = { levels: 40, tiles: 20000, walls: 5000, objects: 2000, regions: 500 };

export const newMap = (over = {}) => ({
  format: MAP_FORMAT, id: 'map', name: 'Untitled map', grid: 'hex', cellFeet: 5,
  levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: {} }],
  walls: [], objects: [], regions: [], starts: [], ...over,
});

// Brings a map document from an older format up to date. Safe to run on any document, any number of
// times. A document of a newer format than this build reads is left as it is, so that the linter
// refuses it by its format instead of this function stamping it as one it can read.
export function migrateMap(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  if (typeof doc.format === 'number' && doc.format > MAP_FORMAT) return doc;
  if (!doc.levels && doc.tiles) {                       // before format 1: one sheet, heights for looks only
    const tiles = {};
    for (const [k, t] of Object.entries(doc.tiles)) tiles[k] = { t: t.t, ...(typeof t.h === 'number' ? { lift: t.h } : {}) };
    doc = { ...newMap({ id: 'valley', name: 'The valley' }), levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }] };
  }
  for (const k of ['walls', 'objects', 'regions', 'starts']) if (!Array.isArray(doc[k])) doc[k] = [];
  // Format 1 to 2: every format 1 map is on hexes; `hexFeet` becomes `cellFeet` (the linter still
  // insists on 5). The header keeps its order: format, id, name, grid, cellFeet, then the rest.
  // A format 1 document's own `grid` or `cellFeet`, if it had any, meant nothing to the build that
  // played it, so they are not read.
  if (doc.format !== MAP_FORMAT) {
    const { format, id, name, hexFeet, grid, cellFeet, ...rest } = doc;
    doc = { format: MAP_FORMAT, ...(id !== undefined && { id }), ...(name !== undefined && { name }), grid: 'hex', ...(hexFeet !== undefined && { cellFeet: hexFeet }), ...rest };
  }
  return doc;
}

const COL = /^-?\d+,-?\d+$/;
// An asset id: what the table server (or the browser, in solo play) gave an uploaded file.
export const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;
// A picture laid under a level: which asset, how many feet wide and deep it covers, and where its
// top-left corner sits, in the same feet as walls. Returns a sentence if it is not that.
export function imageProblem(img, where) {
  if (!img || typeof img !== 'object' || Array.isArray(img)) return `${where} has a background that is not a record.`;
  if (Object.keys(img).some((k) => !['asset', 'feet', 'origin'].includes(k))) return `${where} has a background with something other than asset, feet and origin.`;
  if (typeof img.asset !== 'string' || !ASSET_ID.test(img.asset)) return `${where} has a background that names no file.`;
  const pair = (p, pos) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000 && (!pos || n > 0));
  if (!pair(img.feet, true)) return `${where} has a background whose size is not two positive numbers of feet.`;
  if (!pair(img.origin, false)) return `${where} has a background whose corner is not two numbers.`;
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;

// What is wrong with a map document, as a list of sentences. Empty means it can be played.
// Later parts of the spec (walls, objects, regions) add their own checks through `extra`.
export function lintMap(doc, extra = []) {
  const bad = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['It is not a map document.'];
  if (doc.format !== MAP_FORMAT) bad.push(`Its format is ${doc.format}; this game reads format ${MAP_FORMAT}.`);
  if (!text(doc.id)) bad.push('It has no id.');
  if (!text(doc.name)) bad.push('It has no name.');
  if (doc.grid === 'square') bad.push('Square maps come in a later version.');            // until task S6
  else if (!GRIDS.includes(doc.grid)) bad.push(`Its grid is "${doc.grid}"; it can be ${GRIDS.join(' or ')}.`);
  const G = gridOf(doc);
  if (doc.cellFeet !== 5) bad.push(`A ${G.word.one} must be 5 feet.`);
  if (!Array.isArray(doc.levels) || !doc.levels.length) return [...bad, 'It has no levels.'];
  if (doc.levels.length > MAP_LIMITS.levels) bad.push(`It has more than ${MAP_LIMITS.levels} levels.`);
  const ids = new Set();
  let count = 0;
  for (const l of doc.levels) {
    if (!l || typeof l !== 'object') { bad.push('A level is not a record.'); continue; }
    if (!text(l.id) || ids.has(l.id)) bad.push(`Level id "${l.id}" is missing or used twice.`);
    ids.add(l.id);
    if (!num(l.z)) bad.push(`Level "${l.id}" has no height.`);
    if (l.image !== undefined) { const p = imageProblem(l.image, `Level "${l.id}"`); if (p) bad.push(p); }
    if (l.light !== undefined && !AMBIENT.includes(l.light)) bad.push(`Level "${l.id}" has light "${l.light}"; it can be ${AMBIENT.join(', ')}.`);
    if (!l.tiles || typeof l.tiles !== 'object' || Array.isArray(l.tiles)) { bad.push(`Level "${l.id}" has no tiles.`); continue; }
    for (const [k, t] of Object.entries(l.tiles)) {
      count++;
      if (!COL.test(k)) { bad.push(`Level "${l.id}" has a tile at "${k}", which is not a hex.`); break; }
      if (!t || !Object.hasOwn(TILES, t.t)) { bad.push(`The tile at ${k} on "${l.id}" has unknown terrain "${t?.t}".`); break; }
      if ((t.h !== undefined && !num(t.h)) || (t.lift !== undefined && !num(t.lift))) { bad.push(`The tile at ${k} on "${l.id}" has a height that is not a number.`); break; }
    }
  }
  if (count === 0) bad.push('It has no tiles.');
  if (count > MAP_LIMITS.tiles) bad.push(`It has more than ${MAP_LIMITS.tiles} tiles.`);
  for (const k of ['walls', 'objects', 'regions', 'starts']) {
    if (!Array.isArray(doc[k])) bad.push(`"${k}" must be a list.`);
    else if (MAP_LIMITS[k] && doc[k].length > MAP_LIMITS[k]) bad.push(`It has more than ${MAP_LIMITS[k]} ${k}.`);
  }
  for (const st of Array.isArray(doc.starts) ? doc.starts : []) {
    if (!st || !Number.isInteger(st.q) || !Number.isInteger(st.r)) bad.push('A start is not a hex.');
    else if (!doc.levels.some((l) => l.tiles?.[`${st.q},${st.r}`])) bad.push(`The start at ${st.q},${st.r} has nothing to stand on.`);
  }
  if (bad.length) return bad;
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(num);
  const used = new Set();
  const fresh = (id, what) => { if (!text(id) || used.has(id)) bad.push(`${what} id "${id}" is missing or used twice.`); used.add(id); };
  for (const w of doc.walls) {
    if (!w || typeof w !== 'object') { bad.push('A wall is not a record.'); continue; }
    fresh(w.id, 'Wall');
    if (!ids.has(w.level)) bad.push(`Wall "${w.id}" is on a level that does not exist.`);
    if (!point(w.a) || !point(w.b)) bad.push(`Wall "${w.id}" needs two points.`);
    if (!Object.hasOwn(WALL_KINDS, w.kind)) bad.push(`Wall "${w.id}" has unknown kind "${w.kind}".`);
  }
  for (const o of doc.objects) {
    if (!o || typeof o !== 'object') { bad.push('An object is not a record.'); continue; }
    fresh(o.id, 'Object');
    const def = Object.hasOwn(CONTENT.objects, o.def) ? CONTENT.objects[o.def] : null, level = doc.levels.find((l) => l.id === o.level);
    if (!def) { bad.push(`Object "${o.id}" is of unknown kind "${o.def}".`); continue; }
    if (!level) { bad.push(`Object "${o.id}" is on a level that does not exist.`); continue; }
    if (!o.at || !Number.isInteger(o.at.q) || !Number.isInteger(o.at.r) || !level.tiles[col(o.at)]) bad.push(`Object "${o.id}" is not on a hex of its level.`);
    if (!Object.hasOwn(def.states, o.state)) bad.push(`Object "${o.id}" is in a state its kind does not have: "${o.state}".`);
    if (o.edge !== undefined && !(Number.isInteger(o.edge) && o.edge >= 0 && o.edge < G.EDGES)) bad.push(`Object "${o.id}" has an edge that is not 0 to ${G.EDGES - 1}.`);
    if (o.seg !== undefined && !(o.seg && point(o.seg.a) && point(o.seg.b))) bad.push(`Object "${o.id}" has a line that is not two points.`);
    if (def.kind === 'door' && o.edge === undefined && o.seg === undefined) bad.push(`Door "${o.id}" needs a hex edge or a line to stand on.`);
    if (def.kind !== 'door' && (o.edge !== undefined || o.seg !== undefined)) bad.push(`Object "${o.id}" stands in a hex, not on an edge.`);
    if (o.key !== undefined && !text(o.key)) bad.push(`Object "${o.id}" has a key that is not a name.`);
    if (o.name !== undefined && !text(o.name)) bad.push(`Object "${o.id}" has a name that is not text.`);
    for (const l of o.links ?? []) {
      const other = doc.objects.find((x) => x && x.id === l?.object), odef = other && Object.hasOwn(CONTENT.objects, other.def) ? CONTENT.objects[other.def] : null;
      if (!odef || other.id === o.id) bad.push(`Object "${o.id}" is linked to something that is not on the map.`);
      else if (!Object.hasOwn(def.states, l.when) || !Object.hasOwn(odef.states, l.sets)) bad.push(`Object "${o.id}" has a link naming a state that does not exist.`);
    }
    if (o.links !== undefined && !Array.isArray(o.links)) bad.push(`Object "${o.id}": links must be a list.`);
    if (o.to !== undefined && !(def.connects && o.to && Number.isInteger(o.to.q) && Number.isInteger(o.to.r) && doc.levels.some((l) => l.tiles?.[col(o.to)]))) bad.push(`Object "${o.id}" leads to a place that is not on the map, or is not something that joins places.`);
    if (def.connects && o.to === undefined) bad.push(`Object "${o.id}" joins two places and needs \`to\`.`);
    if (o.dc !== undefined && !(o.dc && typeof o.dc === 'object' && Object.values(o.dc).every((n) => Number.isInteger(n) && n > 0 && n <= 40))) bad.push(`Object "${o.id}" has DCs that are not whole numbers.`);
  }
  const taken = new Set();
  for (const r of doc.regions) {
    if (!r || typeof r !== 'object') { bad.push('A region is not a record.'); continue; }
    fresh(r.id, 'Region');
    if (!text(r.name)) bad.push(`Region "${r.id}" has no name.`);
    const level = doc.levels.find((l) => l.id === r.level);
    if (!level) { bad.push(`Region "${r.id}" is on a level that does not exist.`); continue; }
    if (!Array.isArray(r.hexes) || !r.hexes.length) { bad.push(`Region "${r.id}" has no hexes.`); continue; }
    for (const k of r.hexes) {
      if (typeof k !== 'string' || !COL.test(k) || !level.tiles[k]) { bad.push(`Region "${r.id}" includes "${k}", which is not a hex of its level.`); break; }
      if (taken.has(`${r.level}|${k}`)) { bad.push(`Hex ${k} is in two regions.`); break; }
      taken.add(`${r.level}|${k}`);
    }
    if (r.revealed !== undefined && typeof r.revealed !== 'boolean') bad.push(`Region "${r.id}": revealed must be true or false.`);
    if (r.light !== undefined && !AMBIENT.includes(r.light)) bad.push(`Region "${r.id}" has light "${r.light}"; it can be ${AMBIENT.join(', ')}.`);
  }
  // What the party has seen (docs/specs/sight.md, decision 6): tiles per level, and things as last seen.
  if (doc.seen !== undefined) {
    const sn = doc.seen, okTiles = sn && typeof sn === 'object' && !Array.isArray(sn) && (sn.tiles === undefined || (sn.tiles && typeof sn.tiles === 'object' && Object.entries(sn.tiles).every(([l, cols]) => ids.has(l) && Array.isArray(cols) && cols.length <= MAP_LIMITS.tiles && cols.every((k) => typeof k === 'string' && COL.test(k)))));
    const okObjects = okTiles && (sn.objects === undefined || (sn.objects && typeof sn.objects === 'object' && Object.values(sn.objects).every((v) => typeof v === 'string')));
    if (!okTiles || !okObjects) bad.push('What the party has seen is not a record of tiles by level and of things by state.');
  }
  for (const check of extra) bad.push(...check(doc));
  return bad;
}

// ---------- editing ----------
// One change to a map document. Returns a sentence if the change makes no sense, otherwise
// nothing. The caller lints the whole document afterwards, so an edit can never leave a map
// that cannot be played.
const nextId = (list, prefix) => {
  let n = 0;
  for (const x of list) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id ?? ''); if (m) n = Math.max(n, +m[1]); }
  return `${prefix}${n + 1}`;
};
const put = (list, item) => { const i = list.findIndex((x) => x.id === item.id); if (i < 0) list.push(item); else list[i] = item; };
const drop = (list, id, what) => { const i = list.findIndex((x) => x.id === id); if (i < 0) return `There is no ${what} "${id}".`; list.splice(i, 1); };
export const EDITS = {
  tile(map, { level, at, tile }) {
    const l = map.levels.find((x) => x.id === level);
    if (!l || !at) return 'A tile needs a level and a hex.';
    if (tile) l.tiles[col(at)] = structuredClone(tile);
    else {
      delete l.tiles[col(at)];
      for (const r of map.regions) if (r.level === level) r.hexes = r.hexes.filter((k) => k !== col(at));
      map.regions = map.regions.filter((r) => r.hexes.length);
    }
  },
  level(map, { level }) {
    if (!level || typeof level !== 'object') return 'A level needs a record.';
    const had = map.levels.find((x) => x.id === level.id);
    // `image: null` takes a level's background away; leaving `image` out keeps what it had.
    const image = level.image === null ? undefined : level.image !== undefined ? structuredClone(level.image) : had?.image;
    // Light likewise: `light: null` goes back to the default (bright); leaving it out keeps what it had.
    const light = level.light === null ? undefined : level.light !== undefined ? level.light : had?.light;
    if (had) {
      Object.assign(had, { name: level.name ?? had.name, z: level.z ?? had.z });
      if (image === undefined) delete had.image; else had.image = image;
      if (light === undefined) delete had.light; else had.light = light;
    } else map.levels.push({ id: level.id, name: level.name ?? level.id, z: level.z, tiles: structuredClone(level.tiles ?? {}), ...(image !== undefined && { image }), ...(light !== undefined && { light }) });
  },
  unlevel(map, { id }) {
    if (map.levels.length < 2) return 'A map needs one level or more.';
    map.walls = map.walls.filter((w) => w.level !== id);
    map.objects = map.objects.filter((o) => o.level !== id);
    map.regions = map.regions.filter((r) => r.level !== id);
    return drop(map.levels, id, 'level');
  },
  wall(map, { wall }) {
    if (!wall || typeof wall !== 'object') return 'A wall needs a record.';
    put(map.walls, { kind: 'wall', ...structuredClone(wall), id: wall.id ?? nextId(map.walls, 'w') });
  },
  unwall: (map, { id }) => drop(map.walls, id, 'wall'),
  object(map, { object }) {
    if (!object || typeof object !== 'object') return 'An object needs a record.';
    const def = Object.hasOwn(CONTENT.objects, object.def) ? CONTENT.objects[object.def] : null;
    put(map.objects, { ...structuredClone(object), id: object.id ?? nextId(map.objects, 'o'), state: object.state ?? def?.initial });
  },
  unobject: (map, { id }) => drop(map.objects, id, 'object'),
  // A region claims its hexes: any other region on that level gives them up.
  region(map, { region }) {
    if (!region || typeof region !== 'object' || !Array.isArray(region.hexes)) return 'A region needs a record with hexes.';
    const id = region.id ?? nextId(map.regions, 'r'), mine = new Set(region.hexes);
    for (const r of map.regions) if (r.id !== id && r.level === region.level) r.hexes = r.hexes.filter((k) => !mine.has(k));
    map.regions = map.regions.filter((r) => r.id === id || r.hexes.length);
    put(map.regions, { ...structuredClone(region), id, name: region.name ?? id });
  },
  unregion: (map, { id }) => drop(map.regions, id, 'region'),
  starts(map, { starts }) { map.starts = structuredClone(starts ?? []); },
  // The DM clears what the party remembers of the place, on one level or all of it.
  forget(map, { level }) {
    if (!map.seen) return;
    if (level === undefined) { delete map.seen; return; }
    if (!map.levels.some((l) => l.id === level)) return `There is no level "${level}".`;
    delete map.seen.tiles?.[level];
    for (const o of map.objects) if (o.level === level) delete map.seen.objects?.[o.id];
  },
};
