// Adventure modules, stage A1 (docs/specs/adventure-module.md, Decisions 2 to 5; build row A1): the format of a module,
// its limits, its budget, its migration, its strict linter, its canonical form and the JSON form tests and tools read.
//
//   ADVENTURE_LIMITS                      every cap, in one constant (the zip's own caps are the wrapper's, modulezip.js)
//   budget({ manifest, data }, limits)    sentences: what is over a limit, not plain data, or hides what it says (pass 2)
//   migrateAdventure({ manifest, data })  brings an older format up to date; a newer one is left for the linter to refuse
//   lintAdventure(unpacked, opts)         the budget, then the strict lint (pass 3): { ok, problems, more, unsupported, ... }
//   canonical({ manifest, data })         the string the module's hash is taken over (Decision 4); the caller hashes it
//   readAdventureJson(input, opts)        the JSON form (Decision 1): { ok, problems, unpacked } with the pictures checked (pass 4)
//   placeIn(map, region, bodies, taken)   where creatures set down in a region stand, with no dice (Decision 3)
//   refusal(result, n)                    the first ten problems and "and 14 more.", as the spec words a refusal
//
// Pure: no I/O, no clock, no randomness, never a zip and never a picture's bytes except through the JSON form. Nothing
// here changes the engine; it reads the engine's own tables (SETTINGS, the sheet check, the map linter, the placing
// tests of `spawn`) and adds nothing to them. Sections that need something not built yet (the atlas, markets and stores,
// homebrew packs) are recognised and reported as "not in this game yet", never dropped quietly.
import { canonical as canonicalJson } from './content/packs.js';
import { CONTENT, TILES } from './content/index.js';
import { AMBIENT } from './content/lights.js';
import { lintMap, migrateMap } from './map.js';
import { PILE_MAX, SETTINGS } from './engine.js';
import { validate } from './derive.js';
import { col, gridOf, parse } from './grid.js';
import { footprint, ground, landing, overlapAt } from './space.js';
import { barriers } from './walls.js';
import { fitsOn } from './engine/world.js';

export const ADVENTURE_FORMAT = 'hextable-adventure';
export const ADVENTURE_V = 1;
export const ADVENTURE_JSON_FORMAT = 'hextable-adventure-json';

const MB = 1024 * 1024;
// The caps (Decision 5, "The caps"). The zip's caps (file, entries, ratio, time) are the wrapper's `ZIP_LIMITS`. Those below
// the table are this build's: ids 40 letters (the alias's cap, Decision 11), `by` and `attribution` 200 and 500 letters,
// `srd` 1,000, a string anywhere 8,000 letters (the licence text, the longest) and a key 200, nesting 16, 100 problems kept.
export const ADVENTURE_LIMITS = Object.freeze({
  manifestBytes: 128 * 1024, dataBytes: 4 * MB,
  maps: 60, mapBytes: MB,
  pictures: 300, pictureBytes: 5 * MB, picturesBytes: 90 * MB,
  encounters: 200, creatures: 40, creaturesTotal: 1000,
  npcs: 200, scenes: 100, handouts: 200, notes: 500, links: 20, pregens: 8,
  name: 60, title: 80,
  text: 2000, blurb: 500, weather: 500, licenceText: 8000,
  id: 40, by: 200, attribution: 500, srd: 1000, present: 20,
  depth: 16, string: 8000, key: 200, problems: 100,
});

// The SRD's attribution sentence exactly as reference/srd52/README.md has it (Decision 9): a module that says it is SRD-only
// carries this in `licence.srd`.
export const SRD_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{64}$/;
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
// A control character, or a line or paragraph separator, or a direction override (U+202A to U+202E, U+2066 to U+2069):
// no name may display reversed or break a line (Decision 5, pass 2). A line feed (only) is allowed in the long texts.
const HIDING = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const TEXT_KEYS = new Set(['readAloud', 'notes', 'dm', 'roleplay', 'tactics', 'text', 'weather', 'blurb', 'attribution', 'srd']);
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SECTIONS = ['settings', 'start', 'links', 'maps', 'world', 'markets', 'shops', 'homebrew', 'encounters', 'npcs', 'scenes', 'handouts', 'notes', 'pregens'];
// Not in this game yet: read, named in the report, and the module is added without them.
const LATER = { world: 'the atlas', markets: 'markets', shops: 'stores', homebrew: 'a homebrew pack' };
// Settings a module may preset that `SETTINGS` does not hold yet (docs/specs/portable-characters.md, Decision 5).
const MODULE_SETTINGS = { characters: ['new', 'own-trusted', 'own'], takeaway: ['everything', 'level-only', 'nothing'] };
const KEYS = {
  manifest: ['format', 'v', 'module', 'needs', 'data', 'pictures'],
  module: ['id', 'title', 'version', 'by', 'blurb', 'kind', 'level', 'party', 'length', 'content', 'licence', 'made'],
  needs: ['rules', 'grid', 'homebrew'],
  homebrew: ['id', 'version', 'hash'],
  licence: ['name', 'attribution', 'srd', 'text'],
  dataRef: ['file', 'bytes', 'sha256'],
  picture: ['file', 'mime', 'bytes', 'sha256'],
  data: SECTIONS,
  start: ['map', 'entry', 'node', 'clock', 'light', 'weather', 'scene', 'stage'],
  link: ['to', 'text', 'from', 'node'],
  encounter: ['id', 'name', 'map', 'region', 'creatures', 'budget', 'tactics', 'stage'],
  creature: ['monster', 'count', 'at', 'hidden', 'name'],
  budget: ['difficulty', 'level', 'size'],
  npc: ['id', 'name', 'monster', 'portrait', 'roleplay', 'scenes'],
  scene: ['id', 'title', 'image', 'present', 'notes', 'readAloud'],
  handout: ['id', 'title', 'text', 'asset'],
  note: ['id', 'at', 'title', 'readAloud', 'dm'],
  pregen: ['id', 'sheet'],
};

const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const plain = (x) => { const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };
const own = (o, k) => isRec(o) && typeof k === 'string' && Object.hasOwn(o, k);
const letters = (s) => [...s].length;
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const quote = (s) => (typeof s === 'string' ? `"${s.length > 60 ? `${s.slice(0, 60)}...` : s}"` : `<${s === null ? 'null' : Array.isArray(s) ? 'list' : typeof s}>`);
const idOk = (s) => typeof s === 'string' && ID.test(s) && s.length <= ADVENTURE_LIMITS.id;
const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// UTF-8 bytes of a string as JSON writes it.
function jsonBytes(s) {
  const j = JSON.stringify(s);
  let n = 0;
  for (let i = 0; i < j.length; i++) {
    const c = j.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < j.length && j.charCodeAt(i + 1) >= 0xdc00 && j.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; } else n += 3;
  }
  return n;
}

// ---------- pass 2: the budget ----------
// One walk with an explicit stack for each document, on the document as given (a copy of a nesting bomb would overflow the
// stack), never recursive and never building a path until it has something to say: depth 16, no key `__proto__`,
// `constructor` or `prototype`, no control character or direction override, nothing that is not plain data, no list with
// gaps, and at most `manifestBytes` / `dataBytes` of JSON (it stops counting past them). Counts of sections and lengths of
// fields are the linter's, which names them. Returns at most 20 sentences; [] when both documents are within the budget.
export function budget(unpacked, limits = ADVENTURE_LIMITS) {
  const L = { ...ADVENTURE_LIMITS, ...limits }, problems = [];
  const say = (m) => { if (problems.length < 20) problems.push(m); };
  if (!isRec(unpacked)) return ['module: It is not a module: it is a manifest and its data.'];
  for (const [name, doc, most] of [['manifest', unpacked.manifest, L.manifestBytes], ['data', unpacked.data, L.dataBytes]]) walk(name, doc, most);
  return problems;

  function walk(name, doc, most) {
    if (!isRec(doc) || !plain(doc)) { say(`${name}: It is not a JSON object.`); return; }
    const where = (node) => { const p = []; for (let n = node; n && n.key !== undefined; n = n.up) p.push(n.key); return p.length ? p.reverse().join('/') : name; };
    let bytes = 0;
    const stack = [[doc, 1, { key: undefined, up: null }]];
    while (stack.length) {
      const [v, depth, node] = stack.pop();
      if (v === undefined) { bytes += 4; continue; }
      if (v === null || typeof v === 'boolean') { bytes += v === false ? 5 : 4; continue; }
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) say(`${where(node)}: A number JSON cannot hold.`);
        bytes += String(v).length;
      } else if (typeof v === 'string') {
        bytes += jsonBytes(v);
        const n = v.length > 2 * L.string ? Infinity : letters(v);          // a letter is at most two units: no spreading a huge string
        if (n > L.string) say(`${where(node)}: The text is ${n === Infinity ? `over ${thousands(L.string)} letters long` : `${thousands(n)} letters long`}; the most is ${thousands(L.string)}.`);
        else if (HIDING.test(TEXT_KEYS.has(node.key) ? v.replace(/[\n\r\t]/g, '') : v)) say(`${where(node)}: The text has a control character or a direction override; text is plain text (a line break or tab only in a long text).`);
      } else if (typeof v !== 'object') {
        say(`${where(node)}: ${typeof v === 'function' ? 'A function' : `A ${typeof v}`} is not data; a module is data only.`);
      } else if (!Array.isArray(v) && !plain(v)) {
        say(`${where(node)}: Something here is not plain data (only objects, lists, text, numbers, true, false and null).`);
      } else if (depth > L.depth) {
        say(`${where(node)}: It nests deeper than ${L.depth} levels.`);
      } else if (Array.isArray(v)) {
        // Each element is at least two bytes of JSON, so a length the room cannot hold is refused before it is walked.
        if (bytes + 2 * v.length > most + 2) { bytes = most + 1; break; }
        if (Object.keys(v).length !== v.length) { say(`${where(node)}: A list has gaps in it; a list is a run of values.`); continue; }
        bytes += 2 + Math.max(0, v.length - 1);
        for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], depth + 1, { key: i, up: node }]);
      } else {
        const keys = Object.keys(v).filter((k) => v[k] !== undefined);
        bytes += 2 + Math.max(0, keys.length - 1);
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i];
          bytes += jsonBytes(k) + 1;
          if (BAD_KEYS.includes(k)) { say(`${where(node)}: It has a key "${k}", which no module may have.`); continue; }
          if (k.length > 2 * L.key || letters(k) > L.key) { say(`${where(node)}: A key is too long; the most is ${L.key} letters.`); continue; }
          if (HIDING.test(k)) { say(`${where(node)}: A key has a character that cannot be shown or that hides what it says.`); continue; }
          stack.push([v[k], depth + 1, { key: k, up: node }]);
        }
      }
      if (bytes > most) break;
    }
    if (bytes > most) say(`${name}: It is over ${thousands(most)} bytes as JSON; the most is ${thousands(most)}${name === 'manifest' ? '' : ' (the body of adventure.json)'}.`);
  }
}

// ---------- migration ----------
// Brings a module from an older format up to date. There is one format so far, so this brings each map document up
// to date (`migrateMap`, on a copy) and nothing else. Safe to run any number of times; a module of a newer `v` is left
// as it is, so the linter refuses it by its version ("This module is format 2; this game reads format 1. Update the game.").
export function migrateAdventure(unpacked) {
  if (!isRec(unpacked) || !isRec(unpacked.manifest) || !isRec(unpacked.data)) return unpacked;
  if (typeof unpacked.manifest.v === 'number' && unpacked.manifest.v > ADVENTURE_V) return unpacked;
  const maps = unpacked.data.maps;
  if (!isRec(maps)) return unpacked;
  // fromEntries defines each key as an own property, so a key `__proto__` can never reach a prototype.
  const out = Object.fromEntries(Object.keys(maps).map((k) => { try { return [k, isRec(maps[k]) ? migrateMap(structuredClone(maps[k])) : maps[k]]; } catch { return [k, maps[k]]; } }));
  return { ...unpacked, data: { ...unpacked.data, maps: out } };
}

// ---------- identity ----------
// The string a module's hash is taken over (Decision 4): the canonical JSON (keys sorted, no spaces) of { manifest, data }
// with the manifest's `data.sha256` and `data.bytes` left out, since those describe the data file's own bytes. The pictures'
// bytes are not in it (the manifest lists their hashes), so a full and a lean copy give one string; zip details are not in
// the unpacked form at all. Call it on a module that passed `lintAdventure` (it throws on what is not plain data).
export function canonical({ manifest, data }) {
  const m = isRec(manifest) && isRec(manifest.data) ? { ...manifest, data: Object.fromEntries(Object.entries(manifest.data).filter(([k]) => k !== 'sha256' && k !== 'bytes')) } : manifest;
  return canonicalJson({ manifest: m, data });
}

// ---------- placing creatures ----------
// What is worked out about one map while creatures are placed on it: its barriers, and for each region and size which of
// the region's cells a creature can stand on (found lazily, cell by cell, and kept). It lives for one `lintAdventure` call
// or one `placeIn` call and no longer, so an edited map is never read through a stale copy.
const newPlacing = (map) => ({ B: barriers(map), stand: new Map() });
// Where a creature of this body could stand with its anchor on this cell (a level's cell): the floor in that column
// nearest the level's own surface, standable and with room for its whole footprint, as `spawn` checks it
// (engine/world.js, placeCreature; the tests here are the same ones). Null if it cannot. It does not look at who stands there.
function standAt(map, B, body, level, h) {
  const tile = level.tiles[col(h)];
  if (!tile) return null;
  const to = landing(map, { q: h.q, r: h.r, z: level.z + (tile.h ?? 0) });
  const g = to && ground(map, to);
  if (!g || TILES[g.tile.t].cost === Infinity) return null;
  return fitsOn(map, body, to, B) ? to : null;
}
function placeWith(P, map, region, bodies, taken) {
  const r = (Array.isArray(map?.regions) ? map.regions : []).find((x) => x && x.id === region);
  if (!r) return { ok: false, error: `Region ${quote(region)} is not a region of this map.`, placed: 0 };
  const level = map.levels.find((l) => l.id === r.level), G = gridOf(map);
  // Every body has an id: `overlapAt` treats two creatures with none as a riding pair sharing a space.
  const there = taken.map((t, i) => ({ id: `t${i}`, size: t.size, pos: t.pos })), at = [];
  const next = new Map();                         // size -> where to go on looking: what failed for a size still fails for it
  for (const body of bodies) {
    const ck = `${region}|${body.size}`;
    let memo = P.stand.get(ck);
    if (!memo) P.stand.set(ck, memo = []);
    const mine = { id: 'new', size: body.size };
    let i = next.get(body.size) ?? 0, found = null;
    for (; i < r.hexes.length; i++) {
      if (memo[i] === undefined) memo[i] = standAt(map, P.B, body, level, parse(r.hexes[i]));
      if (memo[i] && !there.some((o) => overlapAt(o, o.pos, mine, memo[i], G))) { found = memo[i]; break; }
    }
    if (!found) return { ok: false, error: `The region ${quote(region)} has room for ${at.length} of the ${bodies.length} creatures; the rest would not fit.`, placed: at.length };
    next.set(body.size, i + 1);
    at.push(found);
    there.push({ id: `p${there.length}`, size: body.size, pos: found });
  }
  return { ok: true, at };
}
// Sets down `bodies` (each `{ size }`) on the cells of a region, in the order of the region's cell list, each at the first
// cell where it can stand and nobody (of `taken`, `{ size, pos }`, or set down before it) is in its way: no dice, so the
// same module places the same way every time. Returns { ok: true, at: [position...] } or { ok: false, error, placed }:
// too few cells is a problem to report, never a quiet move. Works out everything afresh from the map as given.
export function placeIn(map, region, bodies, taken = []) {
  return placeWith(newPlacing(map), map, region, bodies, taken);
}
// One creature on one cell of a level.
function placeAt(P, map, level, h, body, taken) {
  const to = standAt(map, P.B, body, level, h), G = gridOf(map);
  if (!to) return { ok: false, error: `Nothing of that size can stand at ${h.q},${h.r} on level ${quote(level.id)}.` };
  if (taken.some((o, i) => overlapAt({ id: `t${i}`, ...o }, o.pos, { id: 'new', ...body }, to, G))) return { ok: false, error: `The cell ${h.q},${h.r} is taken by another creature of the same encounter.` };
  return { ok: true, at: [to] };
}

// The map document's own fields (map.js: lintMap, EDITS, migrateMap; the stock maps): a closed list at every level, so
// a map cannot carry what no map has (hostile case 11), and heights and points within a range a map can stand in.
const MAP_KEYS = {
  map: ['format', 'id', 'name', 'grid', 'cellFeet', 'levels', 'walls', 'objects', 'regions', 'starts', 'entries', 'areas', 'seen', 'holding'],
  level: ['id', 'name', 'z', 'tiles', 'image', 'light'], tile: ['t', 'h', 'lift'],
  wall: ['id', 'level', 'a', 'b', 'kind'],
  // `contents` is a pile's loot (a pile the DM placed); `by` and `left` are a pile's play record, which a module never holds.
  object: ['id', 'def', 'level', 'at', 'state', 'edge', 'seg', 'key', 'name', 'links', 'to', 'dc', 'contents'], link: ['object', 'when', 'sets'],
  region: ['id', 'name', 'level', 'hexes', 'revealed', 'light'], start: ['level', 'q', 'r', 'z', 'entry'],
  entry: ['id', 'name', 'kind', 'object'], area: ['id', 'name', 'level', 'hexes'],
};
const PILE_KEYS = ['id', 'name', 'item', 'base', 'type', 'spell', 'charges'];     // engine/world.js, what a pile holds
function mapShape(doc) {
  const bad = [], say = (m) => { if (bad.length < 20) bad.push(m); };
  const keys = (o, list, what) => { if (isRec(o)) for (const k of Object.keys(o)) if (!list.includes(k)) say(`${what} has "${k}", which a map does not have there.`); };
  const far = (n, what) => { if (typeof n === 'number' && Math.abs(n) > 100000) say(`${what} is out of range; heights and points are within 100,000 feet.`); };
  const each = (v) => (Array.isArray(v) ? v : []);
  keys(doc, MAP_KEYS.map, 'The map');
  for (const l of each(doc.levels)) {
    if (!isRec(l)) continue;
    keys(l, MAP_KEYS.level, `Level ${quote(l.id)}`); far(l.z, `Level ${quote(l.id)}'s height`);
    if (isRec(l.tiles)) for (const [k, t] of Object.entries(l.tiles)) { keys(t, MAP_KEYS.tile, `The tile at ${quote(k)}`); if (isRec(t)) { far(t.h, `The tile at ${quote(k)}'s height`); far(t.lift, `The tile at ${quote(k)}'s lift`); } }
  }
  for (const w of each(doc.walls)) if (isRec(w)) { keys(w, MAP_KEYS.wall, `Wall ${quote(w.id)}`); for (const p of [w.a, w.b]) each(p).forEach((n) => far(n, `Wall ${quote(w.id)}`)); }
  for (const o of each(doc.objects)) {
    if (!isRec(o)) continue;
    keys(o, MAP_KEYS.object, `Object ${quote(o.id)}`);
    if (isRec(o.seg)) { keys(o.seg, ['a', 'b'], `Object ${quote(o.id)}'s line`); for (const p of [o.seg.a, o.seg.b]) each(p).forEach((n) => far(n, `Object ${quote(o.id)}'s line`)); }
    for (const l of each(o.links)) keys(l, MAP_KEYS.link, `A link of object ${quote(o.id)}`);
    for (const p of [o.at, o.to]) if (isRec(p)) for (const k of ['q', 'r', 'z']) far(p[k], `Object ${quote(o.id)}'s place`);
    for (const p of [o.at, o.to]) keys(p, ['q', 'r', 'z'], `Object ${quote(o.id)}'s place`);
    if (o.contents !== undefined) {
      if (!Array.isArray(o.contents) || o.contents.length > PILE_MAX) say(`Object ${quote(o.id)}'s contents are a list of at most ${PILE_MAX} things.`);
      else for (const c of o.contents) keys(c, PILE_KEYS, `A thing in object ${quote(o.id)}`);
    }
  }
  for (const r of each(doc.regions)) keys(r, MAP_KEYS.region, `Region ${quote(r?.id)}`);
  for (const st of each(doc.starts)) { keys(st, MAP_KEYS.start, 'A start'); if (isRec(st)) far(st.z, 'A start\'s height'); }
  for (const en of each(doc.entries)) keys(en, MAP_KEYS.entry, `Entry ${quote(en?.id)}`);
  for (const a of each(doc.areas)) keys(a, MAP_KEYS.area, `Shop area ${quote(a?.id)}`);
  if (isRec(doc.seen)) keys(doc.seen, ['tiles', 'objects'], 'What the party has seen');
  return bad;
}

// ---------- the linter ----------
// What this build can say a module needs and a table has. `content.monster(id)` returns the pack's record for a monster
// the table has (default: the SRD's), `grids` the grids the table draws (default both), `found` the asset ids of the
// pictures the module came with (the wrapper's list; the JSON form's reader gives it too); a module without them in
// hand is a lean copy of it. Returns:
//   { ok, problems, more, unsupported: [{ section, sentence }], missing: [asset ids], unused: [asset ids],
//     encounters: { [id]: { xp, creatures, standIns } } }
// `ok` means nothing refuses the module. `problems` holds at most `limits.problems` sentences, `more` how many were left out.
export function lintAdventure(unpacked, opts = {}) {
  const out = { ok: false, problems: [], more: 0, unsupported: [], missing: [], unused: [], encounters: {} };
  try { return lintInner(unpacked, opts, out); } catch {
    // Whatever slipped past the checks (a value of a kind no field holds) is one refusal, never a throw.
    out.problems.push('module: Something in it is not what its field should hold, so it cannot be read as a module.');
    out.ok = false;
    return out;
  }
}
function lintInner(unpacked, opts, out) {
  const L = { ...ADVENTURE_LIMITS, ...(opts.limits ?? {}) };
  const say = (path, msg) => { if (out.problems.length < L.problems) out.problems.push(path ? `${path}: ${msg}` : msg); else out.more++; };
  const done = () => { out.ok = out.problems.length === 0; return out; };
  const fromBudget = budget(unpacked, L);
  if (fromBudget.length) { for (const p of fromBudget) say('', p); return done(); }
  const rawManifest = unpacked.manifest;
  if (typeof rawManifest.v === 'number' && rawManifest.v > ADVENTURE_V) { say('v', `This module is format ${rawManifest.v}; this game reads format ${ADVENTURE_V}. Update the game.`); return done(); }
  if (rawManifest.format !== ADVENTURE_FORMAT) { say('format', `It is not an adventure module: its format must be "${ADVENTURE_FORMAT}".`); return done(); }
  if (rawManifest.v !== ADVENTURE_V) { say('v', `The format version is ${JSON.stringify(rawManifest.v)}; this game reads ${ADVENTURE_V}.`); return done(); }
  const { manifest, data } = migrateAdventure(unpacked);
  const content = opts.content ?? { monster: (id) => (typeof id === 'string' && Object.hasOwn(CONTENT.monsters, id) ? CONTENT.monsters[id] : null) };
  const grids = opts.grids ?? ['hex', 'square'];
  const found = Array.isArray(opts.found) ? opts.found : Array.isArray(unpacked.found) ? unpacked.found : [];

  // Helpers over one value. Each says what is wrong and returns whether it was right.
  const closed = (o, keys, path) => { for (const k of Object.keys(o)) if (!keys.includes(k)) say(path, `"${k}" is not a field a module has here.`); };
  const str = (path, v, max, { required = true, label = 'text' } = {}) => {
    if (v === undefined && !required) return true;
    if (typeof v !== 'string' || (required && !v.trim())) { say(path, `needs ${label}.`); return false; }
    if (letters(v) > max) { say(path, `is ${thousands(letters(v))} letters long; the most is ${thousands(max)}.`); return false; }
    return true;
  };
  const list = (path, v, most, what) => {
    if (!Array.isArray(v)) { say(path, `must be a list.`); return null; }
    if (v.length > most) { say(path, `has ${thousands(v.length)} ${what}; the most is ${thousands(most)}.`); return null; }
    return v;
  };
  const idOf = (rec, i) => (isRec(rec) && idOk(rec.id) ? rec.id : String(i));

  // ---- the manifest
  closed(manifest, KEYS.manifest, '');
  const mod = manifest.module;
  if (!isRec(mod)) say('module', 'is missing: the module says what it is.');
  else {
    closed(mod, KEYS.module, 'module');
    if (!idOk(mod.id)) say('module/id', `must be lower-case letters and digits joined by single hyphens, at most ${L.id} letters.`);
    str('module/title', mod.title, L.title, { label: 'a title' });
    if (!whole(mod.version, 1, 1e6)) say('module/version', 'must be a whole number of 1 or more.');
    str('module/by', mod.by, L.by, { label: 'the author\'s words' });
    str('module/blurb', mod.blurb, L.blurb, { required: false });
    if (!['one-shot', 'campaign'].includes(mod.kind)) say('module/kind', 'must be "one-shot" or "campaign".');
    if (mod.level !== undefined) {
      const v = mod.level;
      if (!isRec(v)) say('module/level', 'must be { start, min, max }.');
      else {
        closed(v, ['start', 'min', 'max'], 'module/level');
        const ok = ['start', 'min', 'max'].every((k) => whole(v[k], 1, 20));
        if (!ok) say('module/level', 'start, min and max are character levels, 1 to 20.');
        else if (!(v.min <= v.start && v.start <= v.max)) say('module/level', 'must have min at most start, and start at most max.');
      }
    }
    if (mod.party !== undefined) {
      const v = mod.party;
      if (!isRec(v)) say('module/party', 'must be { min, max }.');
      else {
        closed(v, ['min', 'max'], 'module/party');
        if (!whole(v.min, 1, 12) || !whole(v.max, 1, 12) || v.min > v.max) say('module/party', 'min and max are party sizes, 1 to 12, with min at most max.');
      }
    }
    if (mod.length !== undefined) {
      const v = mod.length;
      if (!isRec(v)) say('module/length', 'must be { sessions, hours }.');
      else {
        closed(v, ['sessions', 'hours'], 'module/length');
        if (!whole(v.sessions, 1, 1000) || typeof v.hours !== 'number' || !(v.hours > 0 && v.hours <= 10000)) say('module/length', 'sessions is a whole number and hours a positive number.');
      }
    }
    if (!['srd-only', 'private'].includes(mod.content)) say('module/content', 'must be "srd-only" or "private".');
    if (typeof mod.made !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(mod.made) || Number.isNaN(Date.parse(`${mod.made}T00:00:00Z`)) || new Date(`${mod.made}T00:00:00Z`).toISOString().slice(0, 10) !== mod.made) say('module/made', 'must be a date written year-month-day.');
    const lic = mod.licence;
    if (!isRec(lic)) say('module/licence', 'is missing: a module declares its licence.');
    else {
      closed(lic, KEYS.licence, 'module/licence');
      if (typeof lic.name !== 'string' || !/^[A-Za-z0-9.+-]{1,40}$/.test(lic.name)) say('module/licence/name', 'must be an SPDX id such as CC-BY-4.0, or "all-rights-reserved", or "other".');
      str('module/licence/attribution', lic.attribution, L.attribution, { label: 'the credit the author asks for' });
      str('module/licence/srd', lic.srd, L.srd, { required: mod.content === 'srd-only', label: 'the SRD\'s attribution sentence' });
      if (mod.content === 'srd-only' && typeof lic.srd === 'string' && lic.srd !== SRD_ATTRIBUTION) say('module/licence/srd', 'is not the SRD\'s attribution sentence exactly as the game has it.');
      str('module/licence/text', lic.text, L.licenceText, { required: lic.name === 'other', label: 'the licence\'s text' });
    }
  }
  const needs = manifest.needs;
  if (!isRec(needs)) say('needs', 'is missing: the module says what a table must have.');
  else {
    closed(needs, KEYS.needs, 'needs');
    if (needs.rules !== 'srd-5.2.1') say('needs/rules', `must be "srd-5.2.1"; this game plays that.`);
    if (!['hex', 'square', 'both'].includes(needs.grid)) say('needs/grid', 'must be "hex", "square" or "both".');
    else if (!(needs.grid === 'both' ? grids.length > 0 && ['hex', 'square'].every((g) => grids.includes(g)) : grids.includes(needs.grid))) say('needs/grid', `this table does not draw ${needs.grid === 'both' ? 'both' : needs.grid} maps.`);
    const hb = needs.homebrew;
    if (hb !== undefined) {
      const l = list('needs/homebrew', hb, 4, 'packs');
      if (l) {
        l.forEach((p, i) => {
          if (!isRec(p)) { say(`needs/homebrew/${i}`, 'must be { id, version, hash }.'); return; }
          closed(p, KEYS.homebrew, `needs/homebrew/${i}`);
        });
        if (l.length) say('needs/homebrew', 'this module needs homebrew packs, which are not in this game yet.');
      }
    }
    if (mod?.content === 'srd-only' && isRec(data) && data.homebrew !== undefined) say('homebrew', 'a module that says it is SRD-only carries no homebrew pack.');
  }
  const ref = manifest.data;
  if (!isRec(ref)) say('data', 'is missing: the manifest names the data file.');
  else {
    closed(ref, KEYS.dataRef, 'data');
    if (ref.file !== 'adventure.json') say('data/file', 'must be "adventure.json".');
    if (!whole(ref.bytes, 0, L.dataBytes)) say('data/bytes', `must be a whole number of bytes, at most ${thousands(L.dataBytes)}.`);
    if (typeof ref.sha256 !== 'string' || !SHA.test(ref.sha256)) say('data/sha256', 'must be 64 hex digits (lower case).');
  }

  // ---- the picture list
  const pictures = isRec(manifest.pictures) ? manifest.pictures : null;
  const assets = new Set();
  if (!pictures) say('pictures', 'is missing: the manifest lists every picture ({} for none).');
  else {
    const ids = Object.keys(pictures);
    if (ids.length > L.pictures) say('pictures', `has ${thousands(ids.length)} pictures; the most is ${L.pictures}.`);
    else {
      let total = 0;
      const files = new Set();
      for (const id of ids) {
        const p = pictures[id], path = `pictures/${idOk(id) ? id : quote(id)}`;
        if (!idOk(id)) { say(path, `a picture's id is lower-case letters and digits joined by single hyphens, at most ${L.id} letters.`); continue; }
        if (!isRec(p)) { say(path, 'must be { file, mime, bytes, sha256 }.'); continue; }
        assets.add(id);
        closed(p, KEYS.picture, path);
        if (typeof p.file !== 'string' || !/^pictures\/[a-z0-9_-][a-z0-9_.-]*$/.test(p.file) || p.file.length > 100) say(path, `its file must be "pictures/" and a name of a-z, 0-9, "-", "_" and ".", at most 100 letters in all.`);
        else if (files.has(p.file)) say(path, `its file ${quote(p.file)} is the file of another picture.`);
        else files.add(p.file);
        if (!PICTURE_TYPES.includes(p.mime)) say(path, `its type must be ${PICTURE_TYPES.join(', ')}.`);
        if (!whole(p.bytes, 1, L.pictureBytes)) say(path, `its size must be a whole number of bytes, 1 to ${thousands(L.pictureBytes)}.`);
        else total += p.bytes;
        if (typeof p.sha256 !== 'string' || !SHA.test(p.sha256)) say(path, 'its fingerprint (sha256) must be 64 hex digits (lower case).');
      }
      if (total > L.picturesBytes) say('pictures', `take ${thousands(total)} bytes in all; the most is ${thousands(L.picturesBytes)}.`);
    }
  }
  for (const id of found) if (typeof id === 'string' && !assets.has(id)) say(`pictures/${idOk(id) ? id : quote(id)}`, 'the module holds a picture the picture list does not name.');
  out.missing = [...assets].filter((id) => !found.includes(id));
  const used = new Set();
  const picture = (path, v) => {
    if (v === undefined) return;
    if (typeof v !== 'string' || !assets.has(v)) say(path, `no picture ${quote(v)} in the picture list.`);
    else used.add(v);
  };

  // ---- the data
  if (!isRec(data)) { say('', 'The module has no data.'); return done(); }
  closed(data, KEYS.data, '');
  for (const [section, what] of Object.entries(LATER)) {
    if (data[section] === undefined) continue;
    const v = data[section], okShape = section === 'world' ? isRec(v) : Array.isArray(v);
    if (!okShape) { say(section, section === 'world' ? 'must be an object.' : 'must be a list.'); continue; }
    out.unsupported.push({ section, sentence: `${section}: ${what} is not in this game yet; the module is added without it.` });
  }

  // settings: SETTINGS keys and values, and the three a module may preset for admission.
  if (data.settings !== undefined) {
    if (!isRec(data.settings)) say('settings', 'must be an object of table settings.');
    else {
      for (const [k, v] of Object.entries(data.settings)) {
        const choices = Object.hasOwn(SETTINGS, k) ? SETTINGS[k] : Object.hasOwn(MODULE_SETTINGS, k) ? MODULE_SETTINGS[k] : null;
        if (k === 'level') {
          const ok = whole(v, 1, 20) || (isRec(v) && Object.keys(v).every((x) => x === 'min' || x === 'max') && whole(v.min, 1, 20) && whole(v.max, 1, 20) && v.min <= v.max);
          if (!ok) say('settings/level', 'must be a character level 1 to 20, or { min, max }.');
        } else if (!choices) say(`settings/${k}`, 'is not a table setting; a module cannot set it.');
        else if (!choices.includes(v)) say(`settings/${k}`, `can be ${choices.join(', ')}.`);
      }
    }
  }

  // maps: each a map document, linted by the map linter, on a grid the module says it needs.
  const maps = new Map();                          // id -> { doc, levels: Set, regions: Map, entries: Set }
  if (data.maps === undefined) say('maps', 'is missing: a module has at least one map.');
  else if (!isRec(data.maps)) say('maps', 'must be an object of map documents by id.');
  else {
    const ids = Object.keys(data.maps);
    if (ids.length > L.maps) say('maps', `has ${ids.length} maps; the most is ${L.maps}.`);
    else {
      if (!ids.length) say('maps', 'is empty: a module has at least one map.');
      for (const id of ids) {
        const path = `maps/${idOk(id) ? id : quote(id)}`, m = data.maps[id];
        if (!idOk(id)) { say(path, `a map's id is lower-case letters and digits joined by single hyphens, at most ${L.id} letters.`); continue; }
        if (!isRec(m)) { say(path, 'is not a map document.'); continue; }
        let size = 0;
        try { size = new TextEncoder().encode(JSON.stringify(m)).length; } catch { say(path, 'is not a map document.'); continue; }
        if (size > L.mapBytes) { say(path, `is ${thousands(size)} bytes as JSON; the most for a map is ${thousands(L.mapBytes)}.`); continue; }
        let doc;
        try { doc = migrateMap(structuredClone(m)); } catch { say(path, 'is not a map document.'); continue; }
        if (doc?.holding) say(path, 'is marked as a holding map, which is the engine\'s own.');
        // A level's background names a picture of the module (its asset id), which the table's store gives an id on import.
        for (const l of Array.isArray(doc?.levels) ? doc.levels : []) {
          if (!isRec(l) || l.image === undefined) continue;
          if (isRec(l.image) && typeof l.image.asset === 'string' && assets.has(l.image.asset)) { used.add(l.image.asset); l.image = { ...l.image, asset: 'module-picture' }; }
          else say(`${path}`, `level ${quote(l.id)} has a background that names no picture of the module.`);
        }
        let problems;
        try { problems = [...lintMap(doc), ...mapShape(doc)]; } catch { say(path, 'is not a map document.'); continue; }
        for (const p of problems.slice(0, 5)) say(path, p);
        if (problems.length > 5) say(path, `and ${problems.length - 5} more problems with this map.`);
        if (problems.length) continue;
        if (needs?.grid && needs.grid !== 'both' && ['hex', 'square'].includes(needs.grid) && doc.grid !== needs.grid) say(path, `is drawn on ${doc.grid === 'hex' ? 'hexes' : 'squares'}, and the module says it needs ${needs.grid === 'hex' ? 'hexes' : 'squares'}.`);
        maps.set(id, { doc, levels: new Set(doc.levels.map((l) => l.id)), regions: new Map(doc.regions.map((r) => [r.id, r])), entries: new Set((doc.entries ?? []).map((e) => e.id)) });
      }
    }
  }

  // npcs and scenes are checked together (each names the other); ids first.
  const npcs = data.npcs === undefined ? [] : list('npcs', data.npcs, L.npcs, 'NPCs') ?? [];
  const scenes = data.scenes === undefined ? [] : list('scenes', data.scenes, L.scenes, 'scenes') ?? [];
  const taken = (section, items) => {
    const seen = new Set();
    items.forEach((x, i) => {
      if (!isRec(x)) { say(`${section}/${i}`, 'is not a record.'); return; }
      if (!idOk(x.id)) say(`${section}/${i}`, `needs an id: lower-case letters and digits joined by single hyphens, at most ${L.id} letters.`);
      else if (seen.has(x.id)) say(`${section}/${x.id}`, 'its id is used twice.');
      else seen.add(x.id);
    });
    return seen;
  };
  const npcIds = taken('npcs', npcs), sceneIds = taken('scenes', scenes);
  const monsterOk = (path, id) => {
    if (typeof id !== 'string' || !content.monster(id)) { say(path, `no such monster ${quote(id)}.`); return false; }
    return true;
  };

  // encounters
  const encounters = data.encounters === undefined ? [] : list('encounters', data.encounters, L.encounters, 'encounters') ?? [];
  const encIds = taken('encounters', encounters);
  let creaturesTotal = 0;                         // placing stops once this is over the cap: no work past what a module may hold
  encounters.forEach((e, i) => {
    if (!isRec(e)) return;
    const path = `encounters/${idOf(e, i)}`;
    closed(e, KEYS.encounter, path);
    str(`${path}/name`, e.name, L.name, { label: 'a name' });
    str(`${path}/tactics`, e.tactics, L.text, { required: false });
    if (e.stage !== undefined && !['start', 'dm'].includes(e.stage)) say(`${path}/stage`, 'must be "start" or "dm".');
    const m = typeof e.map === 'string' && own(data.maps, e.map) ? maps.get(e.map) : null;
    if (typeof e.map !== 'string' || !own(data.maps, e.map)) say(`${path}/map`, `the map ${quote(e.map)} is not in this module.`);
    if (e.region !== undefined) {
      if (typeof e.region !== 'string') say(`${path}/region`, 'must be the id of a region.');
      else if (m && !m.regions.has(e.region)) say(`${path}/region`, `Region ${quote(e.region)} is not a region of this map.`);
    }
    if (e.budget !== undefined) {
      if (!isRec(e.budget)) say(`${path}/budget`, 'must be { difficulty, level, size }.');
      else {
        closed(e.budget, KEYS.budget, `${path}/budget`);
        if (!['low', 'moderate', 'high'].includes(e.budget.difficulty)) say(`${path}/budget`, 'difficulty must be low, moderate or high.');
        if (!whole(e.budget.level, 1, 20) || !whole(e.budget.size, 1, 12)) say(`${path}/budget`, 'level is a character level, 1 to 20, and size a party size, 1 to 12.');
      }
    }
    const cs = list(`${path}/creatures`, e.creatures, L.creatures, 'creatures');
    if (!cs) return;
    if (!cs.length) say(`${path}/creatures`, 'is empty: an encounter has creatures.');
    let count = 0, xp = 0, ok = true;
    const standIns = [], bodies = [];                // the bodies of this encounter, to place together
    cs.forEach((c, j) => {
      const cp = `${path}/creatures/${j}`;
      if (!isRec(c)) { say(cp, 'must be { monster, count, at }.'); ok = false; return; }
      closed(c, KEYS.creature, cp);
      const known = monsterOk(cp, c.monster);
      const n = c.count === undefined ? 1 : c.count;
      if (!whole(n, 1, L.creatures)) { say(cp, `its count is a whole number, 1 to ${L.creatures}.`); ok = false; return; }
      count += n;
      if (c.hidden !== undefined && typeof c.hidden !== 'boolean') say(cp, 'hidden must be true or false.');
      if (c.name !== undefined) { str(`${cp}/name`, c.name, L.name, { label: 'a name' }); if (known) standIns.push({ monster: c.monster, name: c.name }); }
      if (!known) ok = false;
      const rec = known ? content.monster(c.monster) : null;
      if (rec && typeof rec.xp === 'number') xp += rec.xp * n;
      // where they stand: a cell, or a region
      const at = c.at;
      if (!isRec(at)) { say(`${cp}/at`, 'must be a cell { level, q, r } or a region { region }.'); ok = false; return; }
      if (at.region !== undefined) {
        closed(at, ['region'], `${cp}/at`);
        if (typeof at.region !== 'string') { say(`${cp}/at`, 'region must be the id of a region.'); ok = false; return; }
        if (m && !m.regions.has(at.region)) { say(`${cp}/at`, `Region ${quote(at.region)} is not a region of this map.`); ok = false; return; }
        bodies.push({ cp, region: at.region, size: rec?.size ?? 'medium', n, known });
      } else {
        closed(at, ['level', 'q', 'r'], `${cp}/at`);
        if (!Number.isInteger(at.q) || !Number.isInteger(at.r) || (at.level !== undefined && typeof at.level !== 'string')) { say(`${cp}/at`, 'a cell is { level, q, r }, with whole numbers for q and r.'); ok = false; return; }
        if (n !== 1) { say(`${cp}/at`, 'a cell holds one creature; use a region for a group.'); ok = false; return; }
        if (m) {
          const levels = at.level === undefined ? m.doc.levels : m.doc.levels.filter((l) => l.id === at.level);
          if (at.level !== undefined && !levels.length) { say(`${cp}/at`, `Level ${quote(at.level)} is not a level of this map.`); ok = false; return; }
          const level = levels.find((l) => l.tiles[col(at)]);
          if (!level) { say(`${cp}/at`, `There is no ground at ${at.q},${at.r}.`); ok = false; return; }
          bodies.push({ cp, cell: at, level, size: rec?.size ?? 'medium', n: 1, known });
        }
      }
    });
    if (count > L.creatures) { say(`${path}/creatures`, `holds ${count} creatures; the most for an encounter is ${L.creatures}.`); return; }
    creaturesTotal += count;
    const over = creaturesTotal > L.creaturesTotal;
    out.encounters[idOf(e, i)] = { xp, creatures: count, standIns };
    // Placing them, as `stage` will: all or none, never moved quietly.
    if (!ok || !m || over) return;
    const set = [], P = (m.P ??= newPlacing(m.doc));
    for (const b of bodies) {
      if (!b.known) continue;
      const body = Array.from({ length: b.n }, () => ({ size: b.size }));
      const r = b.region !== undefined ? placeWith(P, m.doc, b.region, body, set) : placeAt(P, m.doc, b.level, b.cell, body[0], set);
      if (!r.ok) { say(`${b.cp}/at`, r.error); break; }
      r.at.forEach((pos) => set.push({ size: b.size, pos }));
    }
  });
  if (creaturesTotal > L.creaturesTotal) say('encounters', `hold ${thousands(creaturesTotal)} creatures in all; the most is ${thousands(L.creaturesTotal)}.`);

  // npcs
  npcs.forEach((n, i) => {
    if (!isRec(n)) return;
    const path = `npcs/${idOf(n, i)}`;
    closed(n, KEYS.npc, path);
    str(`${path}/name`, n.name, L.name, { label: 'a name' });
    str(`${path}/roleplay`, n.roleplay, L.text, { required: false });
    if (n.monster !== undefined) monsterOk(`${path}/monster`, n.monster);
    picture(`${path}/portrait`, n.portrait);
    if (n.scenes !== undefined) {
      const l = list(`${path}/scenes`, n.scenes, L.scenes, 'scenes');
      if (l) l.forEach((s, j) => { if (typeof s !== 'string' || !sceneIds.has(s)) say(`${path}/scenes/${j}`, `the scene ${quote(s)} is not in this module.`); });
    }
  });

  // scenes
  scenes.forEach((sc, i) => {
    if (!isRec(sc)) return;
    const path = `scenes/${idOf(sc, i)}`;
    closed(sc, KEYS.scene, path);
    str(`${path}/title`, sc.title, L.title, { label: 'a title' });
    str(`${path}/notes`, sc.notes, L.text, { required: false });
    str(`${path}/readAloud`, sc.readAloud, L.text, { required: false });
    picture(`${path}/image`, sc.image);
    if (sc.present !== undefined) {
      const l = list(`${path}/present`, sc.present, L.present, 'people');
      if (l) {
        const seen = new Set();
        l.forEach((p, j) => {
          if (typeof p !== 'string' || !npcIds.has(p)) say(`${path}/present/${j}`, `the person ${quote(p)} is not an NPC of this module.`);
          else if (seen.has(p)) say(`${path}/present/${j}`, `${quote(p)} is listed twice.`);
          else seen.add(p);
        });
      }
    }
  });

  // handouts
  const handouts = data.handouts === undefined ? [] : list('handouts', data.handouts, L.handouts, 'handouts') ?? [];
  taken('handouts', handouts);
  handouts.forEach((h, i) => {
    if (!isRec(h)) return;
    const path = `handouts/${idOf(h, i)}`;
    closed(h, KEYS.handout, path);
    str(`${path}/title`, h.title, L.title, { label: 'a title' });
    str(`${path}/text`, h.text, L.text, { required: false });
    picture(`${path}/asset`, h.asset);
    if (!(typeof h.text === 'string' && h.text.trim()) && h.asset === undefined) say(path, 'needs a picture or some text.');
  });

  // notes: DM-only, tied to a place on a map
  const notes = data.notes === undefined ? [] : list('notes', data.notes, L.notes, 'notes') ?? [];
  taken('notes', notes);
  notes.forEach((n, i) => {
    if (!isRec(n)) return;
    const path = `notes/${idOf(n, i)}`;
    closed(n, KEYS.note, path);
    str(`${path}/title`, n.title, L.title, { label: 'a title' });
    str(`${path}/readAloud`, n.readAloud, L.text, { required: false });
    str(`${path}/dm`, n.dm, L.text, { required: false });
    const at = n.at;
    if (!isRec(at)) say(`${path}/at`, 'must be { map, region }.');
    else {
      closed(at, ['map', 'region'], `${path}/at`);
      if (typeof at.map !== 'string' || !own(data.maps, at.map)) say(`${path}/at`, `the map ${quote(at.map)} is not in this module.`);
      else if (maps.has(at.map) && (typeof at.region !== 'string' || !maps.get(at.map).regions.has(at.region))) say(`${path}/at`, `Region ${quote(at.region)} is not a region of this map.`);
    }
  });

  // pregens: sheets the engine's own check accepts
  const pregens = data.pregens === undefined ? [] : list('pregens', data.pregens, L.pregens, 'heroes') ?? [];
  taken('pregens', pregens);
  pregens.forEach((p, i) => {
    if (!isRec(p)) return;
    const path = `pregens/${idOf(p, i)}`;
    closed(p, KEYS.pregen, path);
    let bad;
    try { bad = validate(p.sheet); } catch { bad = ['It is not a sheet.']; }
    for (const b of bad.slice(0, 3)) say(`${path}/sheet`, b);
  });

  // links: the id of a module that may follow (it need not resolve: that module may never be added)
  if (data.links !== undefined) {
    const l = list('links', data.links, L.links, 'links');
    if (l) l.forEach((k, i) => {
      const path = `links/${i}`;
      if (!isRec(k)) { say(path, 'must be { to, text }.'); return; }
      closed(k, KEYS.link, path);
      // `from` and `node` make a link a route between two atlases (A11): read, named, not used yet.
      for (const f of ['from', 'node']) if (k[f] !== undefined) {
        if (!idOk(k[f])) say(`${path}/${f}`, 'must be the id of a place: lower-case letters and digits joined by single hyphens.');
        else if (!out.unsupported.some((x) => x.section === 'links/atlas')) out.unsupported.push({ section: 'links/atlas', sentence: 'links: a link that names places ("from" and "node") needs the atlas, which is not in this game yet; the link is kept as words for the DM.' });
      }
      if (!idOk(k.to)) say(`${path}/to`, `must be the id of a module: lower-case letters and digits joined by single hyphens, at most ${L.id} letters (no "/").`);
      str(`${path}/text`, k.text, L.text, { label: 'the words for the hook' });
    });
  }

  // start: a map and where the party stands, with the clock and light, the first scene and the encounters placed at once
  const st = data.start;
  if (!isRec(st)) say('start', 'is missing: a module says where it starts.');
  else {
    closed(st, KEYS.start, 'start');
    const m = typeof st.map === 'string' && own(data.maps, st.map) ? maps.get(st.map) : null;
    if (typeof st.map !== 'string' || !own(data.maps, st.map)) say('start', `the map ${quote(st.map)} is not in this module.`);
    else if (m) {
      if (st.entry !== undefined && !m.entries.has(st.entry)) say('start', `the entry ${quote(st.entry)} is not an entry of the map ${quote(st.map)}.`);
      else if (st.entry === undefined && !m.doc.starts.length) say('start', `the map ${quote(st.map)} has no starts for the party to stand on.`);
    }
    if (st.node !== undefined) out.unsupported.push({ section: 'start/node', sentence: 'start/node: the atlas is not in this game yet; the module starts on its map.' });
    if (st.clock !== undefined && !whole(st.clock, 0, 1000000)) say('start/clock', 'must be a whole number of minutes, 0 to 1,000,000.');
    str('start/weather', st.weather, L.weather, { required: false });
    if (st.light !== undefined) {
      if (!isRec(st.light)) say('start/light', 'must be an object of light by level.');
      else for (const [lv, v] of Object.entries(st.light)) {
        if (m && !m.levels.has(lv)) say(`start/light/${lv}`, `the level ${quote(lv)} is not a level of the map ${quote(st.map)}.`);
        else if (!AMBIENT.includes(v)) say(`start/light/${lv}`, `can be ${AMBIENT.join(', ')}.`);
      }
    }
    if (st.scene !== undefined && (typeof st.scene !== 'string' || !sceneIds.has(st.scene))) say('start/scene', `the scene ${quote(st.scene)} is not in this module.`);
    if (st.stage !== undefined) {
      const l = list('start/stage', st.stage, L.encounters, 'encounters');
      if (l) {
        const seen = new Set();
        l.forEach((x, i) => {
          if (typeof x !== 'string' || !encIds.has(x)) say(`start/stage/${i}`, `the encounter ${quote(x)} is not in this module.`);
          else if (seen.has(x)) say(`start/stage/${i}`, `${quote(x)} is listed twice.`);
          else seen.add(x);
        });
      }
    }
  }

  out.unused = [...assets].filter((id) => !used.has(id));
  return done();
}

// What a refusal says: the first `n` problems, then "and 14 more." (Decision 5, "Refusals").
export function refusal(result, n = 10) {
  const all = result.problems ?? [], more = all.length - Math.min(n, all.length) + (result.more ?? 0);
  return [...all.slice(0, n), ...(more > 0 ? [`and ${more} more.`] : [])];
}

// ---------- pass 4: the JSON form, and the pictures as they are read ----------
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const B64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// The bytes of base64 text (pure: no atob, no Buffer), or null for text that is not base64.
function bytesOf(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !B64.test(text)) return null;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const d = (k) => Math.max(0, B64_DIGITS.indexOf(text[i + k]));
    const n = (d(0) << 18) | (d(1) << 12) | (d(2) << 6) | d(3);
    for (const b of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) if (o < out.length) out[o++] = b;
  }
  return out;
}
// What the first bytes of a picture say it is (PNG, JPEG or WebP, the three the asset stores keep: `sniff` in
// packages/server/src/assets.js), or null. An SVG or an HTML page is none of them.
export function pictureType(b) {
  if (!(b instanceof Uint8Array) || b.length < 16) return null;
  const s = (x, y) => String.fromCharCode(...b.subarray(x, y));
  if (b[0] === 0x89 && s(1, 4) === 'PNG' && s(4, 8) === '\r\n\x1a\n' && s(12, 16) === 'IHDR') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] >= 0xc0) return 'image/jpeg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP' && /^VP8[ LX]$/.test(s(12, 16))) return 'image/webp';
  return null;
}
// Reads the JSON form, `{ format: 'hextable-adventure-json', v: 1, manifest, data, pictures?: { [assetId]: base64 } }`,
// given as text or as a parsed value. Pictures present are checked against the manifest: the declared size, the type
// their bytes show, and (when `opts.sha256(bytes)` is given, the caller's hash, hex) the fingerprint. One that is not the
// file the manifest names is refused with its id. Returns { ok, problems, unpacked: { manifest, data, found, pictures } };
// the module itself is then linted (`lintAdventure`). Pictures left out make a lean copy.
export function readAdventureJson(input, opts = {}) {
  const bad = [];
  let doc = input;
  if (typeof input === 'string') { try { doc = JSON.parse(input); } catch { return { ok: false, problems: ['It is not JSON.'], unpacked: null }; } }
  if (!isRec(doc)) return { ok: false, problems: ['It is not an adventure module in JSON form: it is a JSON object.'], unpacked: null };
  if (doc.format !== ADVENTURE_JSON_FORMAT) return { ok: false, problems: [`format: It is not an adventure module in JSON form: its format must be "${ADVENTURE_JSON_FORMAT}".`], unpacked: null };
  if (typeof doc.v === 'number' && doc.v > ADVENTURE_V) return { ok: false, problems: [`v: This module is format ${doc.v}; this game reads format ${ADVENTURE_V}. Update the game.`], unpacked: null };
  if (doc.v !== ADVENTURE_V) return { ok: false, problems: [`v: The format version is ${JSON.stringify(doc.v)}; this game reads ${ADVENTURE_V}.`], unpacked: null };
  for (const k of Object.keys(doc)) if (!['format', 'v', 'manifest', 'data', 'pictures'].includes(k)) bad.push(`${k}: "${k}" is not a field the JSON form has.`);
  if (!isRec(doc.manifest) || !isRec(doc.data)) bad.push('manifest: The JSON form holds a manifest and the data, both objects.');
  if (doc.pictures !== undefined && !isRec(doc.pictures)) bad.push('pictures: must be an object of base64 pictures by asset id.');
  if (bad.length) return { ok: false, problems: bad, unpacked: null };
  const listed = isRec(doc.manifest.pictures) ? doc.manifest.pictures : {};
  const pictures = {}, found = [], notices = [];
  let more = 0;
  const say = (m) => { if (bad.length < ADVENTURE_LIMITS.problems) bad.push(m); else more++; };
  for (const id of Object.keys(doc.pictures ?? {})) {
    const path = `pictures/${idOk(id) ? id : quote(id)}`, entry = own(listed, id) ? listed[id] : null;
    if (!entry || !isRec(entry)) { say(`${path}: the module holds a picture the picture list does not name.`); continue; }
    const text = doc.pictures[id];
    if (typeof text !== 'string' || text.length % 4 !== 0 || !B64.test(text)) { say(`${path}: the picture is not base64.`); continue; }
    // The size is checked on the text before anything is decoded: a picture is at most as long as its manifest line says.
    if (!whole(entry.bytes, 1, ADVENTURE_LIMITS.pictureBytes) || text.length !== Math.ceil(entry.bytes / 3) * 4) { say(`${path}: the picture is not the file the module names (its size differs).`); continue; }
    const b = bytesOf(text);
    if (!b || b.length !== entry.bytes) { say(`${path}: the picture is not the file the module names (its size differs).`); continue; }
    const type = pictureType(b);
    if (!type) { say(`${path}: the picture is not a PNG, JPEG or WebP picture.`); continue; }
    if (type !== entry.mime) { say(`${path}: the picture is ${type}, not the ${entry.mime} the module names.`); continue; }
    if (typeof opts.sha256 === 'function' && opts.sha256(b) !== entry.sha256) { say(`${path}: the picture is not the file the module names (its fingerprint differs).`); continue; }
    pictures[id] = b;
    found.push(id);
  }
  if (found.length && typeof opts.sha256 !== 'function') notices.push('pictures: no hash was given, so the pictures\' fingerprints were not checked.');
  if (more) bad.push(`and ${more} more.`);
  return { ok: bad.length === 0, problems: bad, notices, unpacked: { manifest: doc.manifest, data: doc.data, found, pictures } };
}

// Where a creature's footprint lies, for a caller that wants to draw or count it (the same cells `spawn` would fill).
export const footprintAt = (map, body, pos) => footprint(body, pos, gridOf(map));
