// The map document: one self-contained JSON description of a place. A table's game state holds
// its own copy. Design: docs/specs/maps-and-objects.md
import { TILES } from './content/terrain.js';

export const MAP_FORMAT = 1;
export const MAP_LIMITS = { levels: 40, tiles: 20000, walls: 5000, objects: 2000, regions: 500 };

export const newMap = (over = {}) => ({
  format: MAP_FORMAT, id: 'map', name: 'Untitled map', hexFeet: 5,
  levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: {} }],
  walls: [], objects: [], regions: [], starts: [], ...over,
});

// Brings a map document from an older format up to date. Safe to run on any document.
export function migrateMap(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (!doc.levels && doc.tiles) {                       // before format 1: one sheet, heights for looks only
    const tiles = {};
    for (const [k, t] of Object.entries(doc.tiles)) tiles[k] = { t: t.t, ...(typeof t.h === 'number' ? { lift: t.h } : {}) };
    doc = { ...newMap({ id: 'valley', name: 'The valley' }), levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }] };
  }
  for (const k of ['walls', 'objects', 'regions', 'starts']) if (!Array.isArray(doc[k])) doc[k] = [];
  doc.format = MAP_FORMAT;
  return doc;
}

const COL = /^-?\d+,-?\d+$/;
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
  if (doc.hexFeet !== 5) bad.push('A hex must be 5 feet.');
  if (!Array.isArray(doc.levels) || !doc.levels.length) return [...bad, 'It has no levels.'];
  if (doc.levels.length > MAP_LIMITS.levels) bad.push(`It has more than ${MAP_LIMITS.levels} levels.`);
  const ids = new Set();
  let count = 0;
  for (const l of doc.levels) {
    if (!l || typeof l !== 'object') { bad.push('A level is not a record.'); continue; }
    if (!text(l.id) || ids.has(l.id)) bad.push(`Level id "${l.id}" is missing or used twice.`);
    ids.add(l.id);
    if (!num(l.z)) bad.push(`Level "${l.id}" has no height.`);
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
  if (!bad.length) for (const check of extra) bad.push(...check(doc));
  return bad;
}
