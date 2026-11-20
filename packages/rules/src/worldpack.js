// The world pack (docs/specs/travel.md, Decision 2; build row W3): the DM's atlas, made once outside the game (or
// written back from the atlas editor, W5b) and imported into any number of tables. It is kept beside the game state,
// never in it, as homebrew packs are; the state keeps only its index (`s.world`, places.js), recorded by the engine
// action `worldIndex` (engine/travel.js), which the table server and the solo transport send, never a client.
//
//   WORLD_LIMITS                         the limits, in one constant
//   budgetWorld(doc)                     sentences: what is over a limit or not plain data (runs first, iteratively, on the document as given)
//   lintWorld(doc, { monster })          sentences: what is wrong with a pack that is within the budget
//   loadWorld(input, opts)               { ok, pack, hash } or { ok: false, problems }: the budget, a plain copy, the lint, the hash
//   storedWorld(pack, ids)               the pack as a table keeps it: picture bytes out, references rewritten to the store's ids
//   indexOf(stored, hash)                the index the state keeps: no maps, no pictures
//   indexProblem(index)                  the sentence a `worldIndex` action's index is refused with, or null
//   needsMap(state, action) / fillMap(state, action, stored)   which pack map an action needs, and the action with it put in
//   assetBytesOf(data)                   the bytes of an embedded picture (base64), for the transport that uploads them
//
// Pure: no I/O, no clock, no randomness. Nothing here reads the table record: the transport hands it in.
import { lintMap, migrateMap, MAP_LIMITS, ENTRY_KINDS } from './map.js';
import { canonical, sha256 } from './content/packs.js';
import { MONSTERS } from './content/index.js';
import { STOCK_MAPS } from './content/maps/index.js';

// The limits **(design choice)** (Decision 2): 4 MB as JSON, pictures included; 300 places; 60 battle maps; 100 pins a
// place; 500 routes; 50 encounter tables of up to 100 rows; places nest 8 deep; names 60 letters; texts 1,500 letters.
// The rest are this build's: other strings 200 letters (a map document's own strings are at most 200, lintMap), 50
// pictures (the table server keeps at most 200 files a table, and solo play 50), JSON nesting 24 (a map document is 7 deep
// and sits 3 deep in the pack), 20 foes a row, 20 battle maps bound to one place or pin and 20 wayside maps a route.
export const WORLD_LIMITS = Object.freeze({
  bytes: 4 * 1024 * 1024, nodes: 300, maps: 60, pins: 100, routes: 500, tables: 50, rows: 100, depth: 8,
  name: 60, text: 1500, string: 200, assets: 50, nesting: 24, foes: 20, battle: 20, wayside: 20,
});
export const WORLD_FORMAT = 'hextable-world';
export const NAV_SCALES = ['world', 'region', 'city', 'district', 'site'];
export const SCALES = [...NAV_SCALES, 'tactical'];
export const WORLD_KINDS = ['nav', 'map', 'scene', 'vessel'];
export const ROUTE_MODES = ['foot', 'mount', 'wagon', 'boat', 'fly', 'custom'];
export const ENCOUNTER_ROLLS = ['engine', 'open', 'dm'];
// The keys of the SRD 5.2 Travel Terrain table ("Travel Terrain", Gameplay Toolbox). W5's travelrules.js holds their numbers.
export const TRAVEL_TERRAIN = ['arctic', 'coastal', 'desert', 'forest', 'grassland', 'hill', 'mountain', 'swamp', 'underdark', 'urban', 'waterborne'];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
// Characters no key, name or text may hold: control characters (a line break only in `text`), invisible and
// direction-changing ones, separators other than the space, private use, unassigned code points and lone surrogates (the
// homebrew budget's rule, content/schema.js).
const CONTROL = /(?! )[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}͏￼឴឵ᅟᅠㅤﾠ⠀᠋-᠍︀-️\u{e0100}-\u{e01ef}]/u;
const CONTROL_NL = /(?![ \n])[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}͏￼឴឵ᅟᅠㅤﾠ⠀᠋-᠍︀-️\u{e0100}-\u{e01ef}]/u;
const plainObject = (x) => { const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };
const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isRec(o) && typeof k === 'string' && Object.hasOwn(o, k);
const letters = (s) => [...s].length;
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const quote = (s) => `"${String(s).length > 60 ? `${String(s).slice(0, 60)}...` : String(s)}"`;
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

// ---------- the budget ----------
// One walk with an explicit stack, on the document as given (before it is copied: a copy of a nesting bomb would overflow
// the stack), bounded by WORLD_LIMITS: at most `bytes` of JSON (it stops counting past them), no prototype-looking key, no
// control character, nothing that is not plain data, no list with gaps. A string's length: a picture's `data` is bounded
// by the bytes alone; a `text` by `text`; a `name` outside the maps by `name`; anything else, keys included, by `string`.
// Returns plain sentences, [] when the document is within every limit. At most 20 are said.
export function budgetWorld(doc, limits = WORLD_LIMITS) {
  const L = { ...WORLD_LIMITS, ...limits }, problems = [];
  const say = (m) => { if (problems.length < 20) problems.push(m); };
  if (!isRec(doc) || !plainObject(doc)) return ['It is not a world pack: a world pack is a JSON object.'];
  let bytes = 0;
  const stack = [[doc, 1, '', null, null]];       // [value, nesting, path, key, area: null | 'maps' | 'assets']
  while (stack.length) {
    const [v, lv, path, key, area] = stack.pop();
    const at = path ? ` at ${path}` : '';
    if (v === undefined) { bytes += 4; continue; }
    if (v === null || typeof v === 'boolean') { bytes += v === false ? 5 : 4; continue; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) say(`A number${at} is not one JSON can hold.`);
      bytes += String(v).length;
    } else if (typeof v === 'string') {
      bytes += jsonBytes(v);
      const picture = area === 'assets' && key === 'data';
      const most = picture ? Infinity : key === 'text' ? L.text : key === 'name' && area !== 'maps' ? L.name : L.string;
      const n = picture ? 0 : letters(v);
      if (n > most) say(`${key === 'name' ? 'The name' : key === 'text' ? 'The text' : 'A piece of text'}${at} is ${thousands(n)} letters long; the most is ${thousands(most)}.`);
      if ((key === 'text' ? CONTROL_NL : CONTROL).test(v)) say(`The text${at} has a control character, or an invisible or direction-changing one (a line break only in a \`text\`): text is plain text.`);
    } else if (typeof v !== 'object') {
      say(`${typeof v === 'function' ? 'A function' : `A ${typeof v}`}${at} is not data: a world pack is data only.`);
    } else if (!Array.isArray(v) && !plainObject(v)) {
      say(`Something${at} is not plain data (only objects, lists, text, numbers, true, false and null).`);
    } else if (lv > L.nesting) {
      say(`It nests deeper than ${L.nesting} levels${at}.`);
    } else if (Array.isArray(v)) {
      // Measured before it is walked: each element is at least two bytes of JSON, so a length the room cannot hold is
      // refused at once (an in-memory list can be `new Array(1e9)`).
      if (bytes + 2 * v.length > L.bytes + 2) { bytes = L.bytes + 1; break; }
      if (Object.keys(v).length !== v.length) { say(`A list${at} has gaps in it; a list is a run of values.`); continue; }
      bytes += 2 + Math.max(0, v.length - 1);
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], lv + 1, `${path}[${i}]`, key, area]);
    } else {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      bytes += 2 + Math.max(0, keys.length - 1);
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i], p = path ? `${path}.${k}` : k;
        bytes += jsonBytes(k) + 1;
        if (BAD_KEYS.includes(k)) { say(`It has a key "${k}"${at}, which no world pack may have.`); continue; }
        if (letters(k) > L.string) { say(`A key${at} is ${thousands(letters(k))} letters long; the most is ${thousands(L.string)}.`); continue; }
        if (CONTROL.test(k)) { say(`A key${at} has a character that cannot be shown or that hides what it says.`); continue; }
        stack.push([v[k], lv + 1, p, k, lv === 1 && (k === 'maps' || k === 'assets') ? k : area]);
      }
    }
    if (bytes > L.bytes) break;
  }
  if (bytes > L.bytes) say(`It is over ${thousands(L.bytes)} bytes as JSON, pictures included; the most for a world pack is ${thousands(L.bytes)} (${L.bytes / 1048576} MB).`);
  return problems;
}

// ---------- pictures ----------
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const B64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// The bytes of base64 text (pure: no atob, no Buffer). Returns null for text that is not base64.
export function assetBytesOf(data) {
  if (typeof data !== 'string' || data.length % 4 !== 0 || !B64.test(data)) return null;
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((data.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < data.length; i += 4) {
    const n = (B64_DIGITS.indexOf(data[i]) << 18) | (B64_DIGITS.indexOf(data[i + 1]) << 12) | ((Math.max(0, B64_DIGITS.indexOf(data[i + 2])) & 63) << 6) | (Math.max(0, B64_DIGITS.indexOf(data[i + 3])) & 63);
    for (const b of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) if (o < out.length) out[o++] = b;
  }
  return out;
}
// What the first bytes of a picture say it is (PNG, JPEG or WebP, the three the asset store keeps), or null.
function pictureType(data) {
  const head = assetBytesOf(typeof data === 'string' ? data.slice(0, 24) : '');
  if (!head || head.length < 16) return null;
  const s = (a, b) => String.fromCharCode(...head.subarray(a, b));
  if (head[0] === 0x89 && s(1, 4) === 'PNG' && s(12, 16) === 'IHDR') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------- the linter ----------
const KEYS = {
  pack: ['format', 'v', 'world', 'nodes', 'routes', 'tables', 'maps', 'assets'],
  world: ['id', 'name', 'version', 'root'],
  nav: ['id', 'kind', 'scale', 'name', 'parent', 'image', 'size', 'miles', 'feet', 'pins', 'terrain', 'battle'],
  map: ['id', 'kind', 'scale', 'name', 'parent', 'map', 'terrain', 'battle'],
  scene: ['id', 'kind', 'scale', 'name', 'parent', 'image', 'terrain'],
  vessel: ['id', 'kind', 'scale', 'name', 'parent', 'map', 'vessel', 'terrain', 'battle'],
  pin: ['id', 'at', 'name', 'to', 'entry', 'battle'],
  route: ['id', 'name', 'node', 'from', 'to', 'back', 'mode', 'miles', 'hours', 'minutes', 'mph', 'terrain', 'road', 'encounters', 'wayside', 'aboard', 'current', 'hoursPerDay'],
  end: ['node', 'pin', 'entry'],
  encounters: ['table', 'every', 'roll'],
  table: ['id', 'name', 'die', 'rows'],
  row: ['range', 'text', 'foes', 'scene'],
  foe: ['monster', 'count'],
  asset: ['kind', 'data', 'name'],
};
const DIE = /^([1-9]\d?)?d([1-9]\d{0,2})$/;
const COUNT = /^([1-9]\d?)d([1-9]\d{0,2})([+-]\d{1,3})?$/;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const posNum = (v, hi) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= hi;
const named = (v, most) => typeof v === 'string' && v.trim().length > 0 && letters(v) <= most;
const STOCK_IDS = new Set(STOCK_MAPS.map((m) => m.id));
const PLACEHOLDER = 'world-pack-picture';            // a valid asset id (map.js ASSET_ID) a pack picture's key stands for while a map is linted
const defaultMonster = (id) => Object.hasOwn(MONSTERS, id);

// What is wrong with a world pack that is within the budget, as plain sentences ([] when nothing is). `monster(id)` says
// whether a monster id is one the table has (the SRD's, or the table's homebrew `hb-` ids: the caller lends the table's
// packs to the content lookups, content/registry.js `using`, and the default reads them).
export function lintWorld(doc, { monster = defaultMonster } = {}) {
  const bad = [];
  const say = (m) => { if (bad.length < 40) bad.push(m); };
  if (!isRec(doc)) return ['It is not a world pack: a world pack is a JSON object.'];
  const extra = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) say(`${where} has "${k}", which a world pack does not use there.`); };
  if (doc.format !== WORLD_FORMAT || doc.v !== 1) say(`It is not a world pack: its format must be "${WORLD_FORMAT}", v 1.`);
  extra(doc, KEYS.pack, 'The pack');
  const w = doc.world;
  if (!isRec(w)) return [...bad, 'It has no "world": its id, name, version and root.'];
  extra(w, KEYS.world, 'The world');
  if (typeof w.id !== 'string' || !ID.test(w.id) || w.id.length > 60) say('The world needs an id: lower-case letters and digits joined by single hyphens.');
  if (!named(w.name, WORLD_LIMITS.name)) say(`The world needs a name of 1 to ${WORLD_LIMITS.name} letters.`);
  if (!Number.isInteger(w.version) || w.version < 1 || w.version > 1e6) say('The world needs a version: a whole number of 1 or more.');
  for (const k of ['nodes', 'routes', 'tables']) if (doc[k] !== undefined && !Array.isArray(doc[k])) say(`"${k}" must be a list.`);
  for (const k of ['maps', 'assets']) if (doc[k] !== undefined && !isRec(doc[k])) say(`"${k}" must be an object of ${k === 'maps' ? 'map documents' : 'pictures'} by id.`);
  if (bad.length) return bad;
  const nodes = doc.nodes ?? [], routes = doc.routes ?? [], tables = doc.tables ?? [], maps = doc.maps ?? {}, assets = doc.assets ?? {};
  if (nodes.length > WORLD_LIMITS.nodes) say(`It has ${thousands(nodes.length)} places; a world has at most ${WORLD_LIMITS.nodes}.`);
  if (routes.length > WORLD_LIMITS.routes) say(`It has ${thousands(routes.length)} routes; a world has at most ${WORLD_LIMITS.routes}.`);
  if (tables.length > WORLD_LIMITS.tables) say(`It has ${tables.length} encounter tables; a world has at most ${WORLD_LIMITS.tables}.`);
  if (Object.keys(maps).length > WORLD_LIMITS.maps) say(`It has ${Object.keys(maps).length} battle maps; a world has at most ${WORLD_LIMITS.maps}.`);
  if (Object.keys(assets).length > WORLD_LIMITS.assets) say(`It has ${Object.keys(assets).length} pictures; a world has at most ${WORLD_LIMITS.assets}.`);
  if (bad.length) return bad;
  const used = { assets: new Set(), maps: new Set() };

  // Pictures: { kind: 'image', data: base64 of a PNG, JPEG or WebP, name? }.
  for (const [k, a] of Object.entries(assets)) {
    const where = `Picture ${quote(k)}`;
    if (!ID.test(k)) say(`${where}: a picture's id is lower-case letters and digits joined by single hyphens.`);
    if (!isRec(a)) { say(`${where} is not a record.`); continue; }
    extra(a, KEYS.asset, where);
    if (a.kind !== 'image') say(`${where}: its kind must be "image".`);
    if (a.name !== undefined && !named(a.name, WORLD_LIMITS.name)) say(`${where} has a name that is not 1 to ${WORLD_LIMITS.name} letters.`);
    if (typeof a.data !== 'string' || a.data.length % 4 !== 0 || !B64.test(a.data)) say(`${where}: its data is not base64.`);
    else if (!pictureType(a.data)) say(`${where} is not a PNG, JPEG or WebP picture.`);
  }
  const picture = (ref, where) => {
    if (ref === undefined) return;
    if (typeof ref !== 'string' || !own(assets, ref)) say(`${where} names a picture the pack does not have: ${quote(ref)}.`);
    else used.assets.add(ref);
  };

  // Battle maps: full map documents, brought up to date and linted as `loadMap` lints one. A level's background names a
  // picture of the pack (its key), which the table's store gives an id on import.
  const entriesOf = {};                                      // map key -> Set of entry ids
  for (const [k, m] of Object.entries(maps)) {
    const where = `Battle map ${quote(k)}`;
    if (!ID.test(k)) say(`${where}: a map's id is lower-case letters and digits joined by single hyphens.`);
    if (!isRec(m)) { say(`${where} is not a map document.`); continue; }
    let doc2;
    try { doc2 = migrateMap(structuredClone(m)); } catch { say(`${where} is not a map document.`); continue; }
    if (doc2?.holding) say(`${where} is marked as a holding map, which is the engine's own.`);
    for (const l of Array.isArray(doc2?.levels) ? doc2.levels : []) {
      if (!isRec(l) || l.image === undefined) continue;
      if (isRec(l.image) && typeof l.image.asset === 'string' && own(assets, l.image.asset)) { used.assets.add(l.image.asset); l.image = { ...l.image, asset: PLACEHOLDER }; }
      else say(`${where}: level ${quote(l.id)} has a background that names no picture of the pack.`);
    }
    const problems = lintMap(doc2);
    if (problems.length) { say(`${where} can't be used. ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`); continue; }
    entriesOf[k] = new Set((doc2.entries ?? []).map((en) => en.id));
  }
  const mapRef = (ref, where) => {
    if (typeof ref !== 'string' || !own(maps, ref)) { say(`${where} names a battle map the pack does not have: ${quote(ref)}.`); return false; }
    used.maps.add(ref);
    return true;
  };
  const battleList = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > WORLD_LIMITS.battle) { say(`${where}: "battle" is a list of at most ${WORLD_LIMITS.battle} battle maps of the pack.`); return; }
    for (const ref of list) mapRef(ref, `${where}'s "battle"`);
  };

  // Places.
  const byId = new Map();
  for (const n of nodes) {
    if (!isRec(n)) { say('A place is not a record.'); continue; }
    if (typeof n.id !== 'string' || !ID.test(n.id) || n.id.length > 60) { say(`A place ${n.name ? `(${quote(n.name)}) ` : ''}has no id: lower-case letters and digits joined by single hyphens.`); continue; }
    if (byId.has(n.id)) { say(`Place id ${quote(n.id)} is used twice.`); continue; }
    byId.set(n.id, n);
  }
  const pinIds = new Set(), pinsOf = new Map();
  for (const n of byId.values()) {
    const where = `Place ${quote(n.id)}`;
    if (!WORLD_KINDS.includes(n.kind)) { say(`${where} has kind ${quote(n.kind)}; it can be ${WORLD_KINDS.join(', ')}.`); continue; }
    extra(n, KEYS[n.kind], where);
    if (n.parent !== undefined && !(typeof n.parent === 'string' && byId.has(n.parent))) say(`${where} is under a place that is not in the pack: ${quote(n.parent)}.`);
    if (n.name !== undefined && !named(n.name, WORLD_LIMITS.name)) say(`${where} has a name that is not 1 to ${WORLD_LIMITS.name} letters.`);
    if (n.terrain !== undefined && !TRAVEL_TERRAIN.includes(n.terrain)) say(`${where} has terrain ${quote(n.terrain)}; it can be ${TRAVEL_TERRAIN.join(', ')}.`);
    if (n.kind === 'nav') {
      if (!NAV_SCALES.includes(n.scale)) say(`${where} is a navigation map, and its scale must be ${NAV_SCALES.join(', ')}.`);
      if (!named(n.name, WORLD_LIMITS.name)) say(`${where} needs a name of 1 to ${WORLD_LIMITS.name} letters.`);
      if (n.image === undefined) say(`${where} is a navigation map, and needs its picture ("image").`);
      picture(n.image, where);
      const sizeOk = Array.isArray(n.size) && n.size.length === 2 && n.size.every((x) => Number.isInteger(x) && x > 0 && x <= 50000);
      if (!sizeOk) say(`${where} needs the size of its picture in pixels: two whole numbers.`);
      if (n.miles !== undefined && n.feet !== undefined) say(`${where} gives its scale in miles and in feet; give one.`);
      if (n.miles !== undefined && !posNum(n.miles, 10000)) say(`${where}: "miles" (per 100 pixels) must be a number above 0.`);
      if (n.feet !== undefined && !posNum(n.feet, 100000)) say(`${where}: "feet" (per 100 pixels) must be a number above 0.`);
      battleList(n.battle, where);
      if (n.pins !== undefined && !Array.isArray(n.pins)) { say(`${where}: "pins" must be a list.`); continue; }
      const pins = n.pins ?? [];
      if (pins.length > WORLD_LIMITS.pins) say(`${where} has ${pins.length} pins; a place has at most ${WORLD_LIMITS.pins}.`);
      pinsOf.set(n.id, new Set());
      for (const p of pins.slice(0, WORLD_LIMITS.pins)) {
        if (!isRec(p)) { say(`${where} has a pin that is not a record.`); continue; }
        const pw = `Pin ${quote(p.id)} of ${quote(n.id)}`;
        extra(p, KEYS.pin, pw);
        if (typeof p.id !== 'string' || !ID.test(p.id) || p.id.length > 60) { say(`${where} has a pin with no id.`); continue; }
        if (pinIds.has(p.id)) say(`Pin id ${quote(p.id)} is used twice.`);
        pinIds.add(p.id); pinsOf.get(n.id).add(p.id);
        if (!named(p.name, WORLD_LIMITS.name)) say(`${pw} needs a name of 1 to ${WORLD_LIMITS.name} letters.`);
        const inside = Array.isArray(p.at) && p.at.length === 2 && p.at.every((x) => num(x, 0, 50000)) && (!sizeOk || (p.at[0] <= n.size[0] && p.at[1] <= n.size[1]));
        if (!inside) say(`${pw} is not on its picture: "at" is two numbers of pixels inside its size.`);
        battleList(p.battle, pw);
        if (p.to !== undefined && !(typeof p.to === 'string' && byId.has(p.to))) say(`${pw} leads to a place that is not in the pack: ${quote(p.to)}.`);
        if (p.to === n.id) say(`${pw} leads to its own place.`);
        if (p.entry !== undefined) {
          const t = byId.get(p.to);
          if (p.to === undefined) say(`${pw} names an entry but leads nowhere.`);
          else if (t && (t.kind === 'map' || t.kind === 'vessel') && own(entriesOf, t.map) && !entriesOf[t.map].has(p.entry)) say(`${pw} names an entry that ${quote(p.to)}'s map does not have: ${quote(p.entry)}.`);
          else if (t && t.kind !== 'map' && t.kind !== 'vessel') say(`${pw} names an entry, but ${quote(p.to)} is not a battle map.`);
        }
      }
    } else if (n.kind === 'map' || n.kind === 'vessel') {
      if (n.scale !== undefined && n.scale !== 'tactical') say(`${where} is a battle map, and its scale is "tactical" (5-foot cells).`);
      mapRef(n.map, where);
      battleList(n.battle, where);
      if (n.kind === 'vessel' && !(typeof n.vessel === 'string' && ID.test(n.vessel))) say(`${where} is a vessel, and names its kind of vessel ("vessel").`);
    } else {
      if (n.scale !== undefined && !SCALES.includes(n.scale)) say(`${where} has scale ${quote(n.scale)}; it can be ${SCALES.join(', ')}.`);
      if (!named(n.name, WORLD_LIMITS.name)) say(`${where} needs a name of 1 to ${WORLD_LIMITS.name} letters.`);
      picture(n.image, where);
    }
  }
  // The tree: one root, with no parent; every other place under one; no loops; 8 deep at most.
  const root = byId.get(w.root);
  if (typeof w.root !== 'string' || !root) say(`The world's root is not a place of the pack: ${quote(w.root)}.`);
  else if (root.parent !== undefined) say(`The root, ${quote(w.root)}, is under another place; the root is the top.`);
  for (const n of byId.values()) {
    if (n.id !== w.root && n.parent === undefined) say(`Place ${quote(n.id)} is under no place; every place but the root has a "parent".`);
    let depth = 0;
    for (let at = n, seen = new Set(); at; at = typeof at.parent === 'string' ? byId.get(at.parent) : null) {
      if (seen.has(at.id)) { depth = Infinity; break; }
      seen.add(at.id); depth++;
    }
    if (depth === Infinity) say(`Place ${quote(n.id)} is inside itself: its parents go round in a loop.`);
    else if (depth > WORLD_LIMITS.depth) say(`Place ${quote(n.id)} is ${depth} deep; places nest ${WORLD_LIMITS.depth} deep at most.`);
  }
  const battleNode = (id) => { const t = byId.get(id); return t && (t.kind === 'map' || t.kind === 'vessel') ? t : null; };

  // Encounter tables.
  const tableIds = new Set();
  for (const t of tables) {
    if (!isRec(t)) { say('An encounter table is not a record.'); continue; }
    const where = `Encounter table ${quote(t.id)}`;
    extra(t, KEYS.table, where);
    if (typeof t.id !== 'string' || !ID.test(t.id)) { say('An encounter table has no id.'); continue; }
    if (tableIds.has(t.id)) say(`Encounter table id ${quote(t.id)} is used twice.`);
    tableIds.add(t.id);
    if (!named(t.name, WORLD_LIMITS.name)) say(`${where} needs a name of 1 to ${WORLD_LIMITS.name} letters.`);
    const die = typeof t.die === 'string' ? DIE.exec(t.die) : null;
    if (!die) { say(`${where} needs a die to roll, such as "1d20" or "2d6".`); continue; }
    const lo = Number(die[1] ?? 1), hi = lo * Number(die[2]);
    if (!Array.isArray(t.rows) || !t.rows.length) { say(`${where} has no rows.`); continue; }
    if (t.rows.length > WORLD_LIMITS.rows) say(`${where} has ${t.rows.length} rows; a table has at most ${WORLD_LIMITS.rows}.`);
    const taken = [];
    t.rows.slice(0, WORLD_LIMITS.rows).forEach((r, i) => {
      const rw = `${where}, row ${i + 1}`;
      if (!isRec(r)) { say(`${rw} is not a record.`); return; }
      extra(r, KEYS.row, rw);
      const ok = Array.isArray(r.range) && r.range.length === 2 && r.range.every(Number.isInteger) && r.range[0] <= r.range[1];
      if (!ok) say(`${rw}: "range" is two whole numbers, low then high.`);
      else if (r.range[0] < lo || r.range[1] > hi) say(`${rw}: ${r.range[0]} to ${r.range[1]} is not inside what ${t.die} rolls (${lo} to ${hi}).`);
      else if (taken.some(([a, b]) => r.range[0] <= b && a <= r.range[1])) say(`${rw}: its range overlaps another row's.`);
      else taken.push(r.range);
      if (r.text !== undefined && !named(r.text, WORLD_LIMITS.text)) say(`${rw}: its text is not 1 to ${thousands(WORLD_LIMITS.text)} letters.`);
      if (r.scene !== undefined && typeof r.scene !== 'boolean') say(`${rw}: "scene" is true or false.`);
      if (r.foes === undefined) return;
      if (!Array.isArray(r.foes) || !r.foes.length || r.foes.length > WORLD_LIMITS.foes) { say(`${rw}: "foes" is a list of 1 to ${WORLD_LIMITS.foes} monsters.`); return; }
      for (const f of r.foes) {
        if (!isRec(f)) { say(`${rw} has a foe that is not a record.`); continue; }
        extra(f, KEYS.foe, `${rw}'s foe`);
        if (typeof f.monster !== 'string' || !ID.test(f.monster) || !monster(f.monster)) say(`${rw} names a monster that is not in the game's content or the table's homebrew: ${quote(f.monster)}.`);
        if (!((Number.isInteger(f.count) && f.count >= 1 && f.count <= 50) || (typeof f.count === 'string' && COUNT.test(f.count)))) say(`${rw}: a foe's "count" is a whole number from 1 to 50 or dice, such as "1d4+1".`);
      }
    });
  }

  // Routes.
  const routeIds = new Set();
  const end = (e, where, word) => {
    if (typeof e === 'string') { if (!byId.has(e)) say(`${where} ${word} a place that is not in the pack: ${quote(e)}.`); return; }
    if (!isRec(e)) { say(`${where}: its "${word === 'goes to' ? 'to' : word === 'starts at' ? 'from' : 'back'}" is a place's id, or { node, pin } or { node, entry }.`); return; }
    extra(e, KEYS.end, where);
    const n = typeof e.node === 'string' ? byId.get(e.node) : null;
    if (!n) { say(`${where} ${word} a place that is not in the pack: ${quote(e.node)}.`); return; }
    if (e.pin !== undefined && e.entry !== undefined) say(`${where} names a pin and an entry at one end; name one.`);
    if (e.pin !== undefined && !(n.kind === 'nav' && pinsOf.get(n.id)?.has(e.pin))) say(`${where} ${word} a pin that ${quote(n.id)} does not have: ${quote(e.pin)}.`);
    if (e.entry !== undefined && !(battleNode(n.id) && own(entriesOf, n.map) && entriesOf[n.map].has(e.entry))) say(`${where} ${word} an entry that ${quote(n.id)} does not have: ${quote(e.entry)}.`);
  };
  for (const r of routes) {
    if (!isRec(r)) { say('A route is not a record.'); continue; }
    const where = `Route ${quote(r.id)}`;
    extra(r, KEYS.route, where);
    if (typeof r.id !== 'string' || !ID.test(r.id)) { say('A route has no id.'); continue; }
    if (routeIds.has(r.id)) say(`Route id ${quote(r.id)} is used twice.`);
    routeIds.add(r.id);
    if (r.name !== undefined && !named(r.name, WORLD_LIMITS.name)) say(`${where} has a name that is not 1 to ${WORLD_LIMITS.name} letters.`);
    if (!ROUTE_MODES.includes(r.mode)) say(`${where} has mode ${quote(r.mode)}; it can be ${ROUTE_MODES.join(', ')}.`);
    if (r.node !== undefined) {
      // Between two pins of one navigation map: `from` and `to` are its pins' ids.
      const n = typeof r.node === 'string' ? byId.get(r.node) : null;
      if (!n || n.kind !== 'nav') say(`${where} is on a place that is not a navigation map of the pack: ${quote(r.node)}.`);
      else for (const [k, word] of [['from', 'starts at'], ['to', 'goes to']]) if (!(typeof r[k] === 'string' && pinsOf.get(n.id)?.has(r[k]))) say(`${where} ${word} a pin that ${quote(n.id)} does not have: ${quote(r[k])}.`);
      if (r.back !== undefined) say(`${where} is between two pins, and goes both ways already: it has no "back".`);
    } else {
      end(r.from, where, 'starts at');
      end(r.to, where, 'goes to');
      if (r.back !== undefined) end(r.back, where, 'comes back to');
    }
    for (const [k, hi] of [['miles', 100000], ['hours', 10000], ['minutes', 100000], ['mph', 1000]]) if (r[k] !== undefined && !posNum(r[k], hi)) say(`${where}: "${k}" must be a number above 0.`);
    const given = ['miles', 'hours', 'minutes'].filter((k) => r[k] !== undefined);
    if (given.length > 1) say(`${where} gives ${given.join(' and ')}; give one of miles, hours or minutes.`);
    if (r.mode === 'custom' && r.mph === undefined && !given.some((k) => k !== 'miles')) say(`${where} is a custom route, and gives its speed ("mph") or its time ("hours" or "minutes").`);
    if (!given.length && r.mph === undefined) {
      const n = typeof r.node === 'string' ? byId.get(r.node) : null;
      if (!n || (n.miles === undefined && n.feet === undefined)) say(`${where} gives no miles, hours or minutes, and is not between two pins of a map with a scale: give one.`);
    }
    if (r.terrain !== undefined && !TRAVEL_TERRAIN.includes(r.terrain)) say(`${where} has terrain ${quote(r.terrain)}; it can be ${TRAVEL_TERRAIN.join(', ')}.`);
    if (r.road !== undefined && typeof r.road !== 'boolean') say(`${where}: "road" is true or false.`);
    if (r.current !== undefined && !num(r.current, 0, 50)) say(`${where}: "current" is a number of miles an hour, 0 to 50.`);
    if (r.hoursPerDay !== undefined && !num(r.hoursPerDay, 1, 24)) say(`${where}: "hoursPerDay" is a number of hours from 1 to 24.`);
    if (r.aboard !== undefined && byId.get(r.aboard)?.kind !== 'vessel') say(`${where} is taken aboard a place that is not a vessel of the pack: ${quote(r.aboard)}.`);
    if (r.encounters !== undefined) {
      const e = r.encounters;
      if (!isRec(e)) say(`${where}: "encounters" is { table, every, roll }.`);
      else {
        extra(e, KEYS.encounters, `${where}'s encounters`);
        if (!(typeof e.table === 'string' && tableIds.has(e.table))) say(`${where} names an encounter table the pack does not have: ${quote(e.table)}.`);
        if (!(Number.isInteger(e.every) && e.every >= 1 && e.every <= 10080)) say(`${where}: encounters come "every" so many minutes, a whole number from 1 to 10,080.`);
        if (e.roll !== undefined && !ENCOUNTER_ROLLS.includes(e.roll)) say(`${where}: encounters are rolled by ${ENCOUNTER_ROLLS.join(', ')}, or "roll" is left out for no checks.`);
      }
    }
    if (r.wayside !== undefined) {
      if (!Array.isArray(r.wayside) || r.wayside.length > WORLD_LIMITS.wayside) say(`${where}: "wayside" is a list of at most ${WORLD_LIMITS.wayside} battle maps.`);
      else for (const ref of r.wayside) {
        if (typeof ref === 'string' && own(maps, ref)) used.maps.add(ref);
        else if (!(typeof ref === 'string' && STOCK_IDS.has(ref))) say(`${where}'s wayside names a map that is neither the pack's nor a stock map: ${quote(ref)}.`);
      }
    }
  }
  for (const k of Object.keys(assets)) if (!used.assets.has(k)) say(`Picture ${quote(k)} is used by no place and no map; leave it out.`);
  return bad;
}

// ---------- loading ----------
// Checks a world pack (a JSON text or the parsed object): the budget on what was given, then a plain copy, then the lint.
// Returns { ok: true, pack, hash } (the plain copy, and the SHA-256 of its canonical JSON) or { ok: false, problems }.
export function loadWorld(input, opts = {}) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > 2 * WORLD_LIMITS.bytes) return { ok: false, problems: [`It is over ${thousands(WORLD_LIMITS.bytes)} bytes as JSON; the most for a world pack is ${thousands(WORLD_LIMITS.bytes)}.`] };
    try { data = JSON.parse(input); } catch (err) { return { ok: false, problems: [`It is not JSON (${String(err.message).slice(0, 120)}).`] }; }
  }
  const over = budgetWorld(data);
  if (over.length) return { ok: false, problems: over };
  try { data = structuredClone(data); } catch { return { ok: false, problems: ['It is not plain data.'] }; }
  let problems;
  try { problems = lintWorld(data, opts); } catch (err) { problems = [`It could not be checked (${String(err?.message).slice(0, 120)}).`]; }
  if (problems.length) return { ok: false, problems };
  let hash;
  try { hash = sha256(canonical(data)); } catch { return { ok: false, problems: ['It could not be hashed: it is not plain data.'] }; }
  return { ok: true, pack: data, hash };
}

// The pack as a table keeps it (`table.world.data`, Decision 2): the bytes of its pictures are in the table's asset store,
// so `assets` is left out, and every reference to a picture (a place's `image`, a level's background) is rewritten to
// the store's id, `ids[key]`. Maps are brought up to date (migrateMap) so the fill puts the same document in every time.
export function storedWorld(pack, ids) {
  const out = structuredClone(pack);
  delete out.assets;
  const swap = (k) => (own(ids, k) ? ids[k] : k);
  for (const n of out.nodes ?? []) if (typeof n.image === 'string') n.image = swap(n.image);
  for (const [k, m] of Object.entries(out.maps ?? {})) {
    const doc = migrateMap(m);
    for (const l of doc.levels ?? []) if (isRec(l.image) && typeof l.image.asset === 'string') l.image.asset = swap(l.image.asset);
    out.maps[k] = doc;
  }
  return out;
}

// ---------- the index ----------
// What the state keeps of a world (`s.world`, places.js): its id, name, version, hash and root, its places by id, its
// routes and tables. No maps and no pictures: a battle place carries its map's key (`map`, for the fill) and the list of
// its map's entries (`entries`, so the engine can check an arrival without the map); a place with no name takes its map's.
export function indexOf(stored, hash) {
  const maps = stored.maps ?? {};
  const nodes = {};
  for (const n of stored.nodes ?? []) {
    const x = { id: n.id, kind: n.kind };
    const m = (n.kind === 'map' || n.kind === 'vessel') && own(maps, n.map) ? maps[n.map] : null;
    const name = n.name ?? m?.name;
    if (name !== undefined) x.name = name;
    x.scale = n.scale ?? (m ? 'tactical' : undefined);
    if (x.scale === undefined) delete x.scale;
    for (const k of ['parent', 'image', 'size', 'miles', 'feet', 'terrain', 'battle', 'map', 'vessel']) if (n[k] !== undefined) x[k] = structuredClone(n[k]);
    if (n.kind === 'nav') x.pins = structuredClone(n.pins ?? []);
    if (m) x.entries = (m.entries ?? []).map((en) => ({ id: en.id, name: en.name, kind: en.kind }));
    nodes[n.id] = x;
  }
  return { id: stored.world.id, name: stored.world.name, version: stored.world.version, hash, root: stored.world.root,
    nodes, routes: structuredClone(stored.routes ?? []), tables: structuredClone(stored.tables ?? []) };
}

// The sentence an index sent with `worldIndex` is refused with, or null. The server and the solo transport build it from
// a pack that passed the linter, so this is a second look at its shape, within the same limits: the engine never trusts
// what an action carries.
export function indexProblem(ix) {
  if (!isRec(ix)) return 'The index of a world is a record.';
  if (typeof ix.id !== 'string' || !ID.test(ix.id)) return 'The index of a world has no id.';
  if (!named(ix.name, WORLD_LIMITS.name)) return 'The index of a world has no name.';
  if (!Number.isInteger(ix.version) || ix.version < 1) return 'The index of a world has no version.';
  if (typeof ix.hash !== 'string' || !/^[0-9a-f]{64}$/.test(ix.hash)) return 'The index of a world has no hash.';
  if (!isRec(ix.nodes) || !Array.isArray(ix.routes) || !Array.isArray(ix.tables)) return 'The index of a world holds its places, routes and tables.';
  const ids = Object.keys(ix.nodes);
  if (ids.length > WORLD_LIMITS.nodes) return `A world has at most ${WORLD_LIMITS.nodes} places.`;
  if (ix.routes.length > WORLD_LIMITS.routes) return `A world has at most ${WORLD_LIMITS.routes} routes.`;
  if (ix.tables.length > WORLD_LIMITS.tables) return `A world has at most ${WORLD_LIMITS.tables} encounter tables.`;
  if (!own(ix.nodes, ix.root)) return 'The root of the world is not one of its places.';
  for (const id of ids) {
    const n = ix.nodes[id];
    if (!ID.test(id) || !isRec(n) || n.id !== id || !WORLD_KINDS.includes(n.kind)) return `Place "${id.slice(0, 60)}" of the index is not a place.`;
    if (n.parent !== undefined && !own(ix.nodes, n.parent)) return `Place "${id}" is under a place the index does not have.`;
    if (n.pins !== undefined && !(Array.isArray(n.pins) && n.pins.length <= WORLD_LIMITS.pins && n.pins.every((p) => isRec(p) && typeof p.id === 'string' && (p.to === undefined || own(ix.nodes, p.to))))) return `Place "${id}" has pins that are not pins.`;
    if (n.entries !== undefined && !(Array.isArray(n.entries) && n.entries.length <= MAP_LIMITS.entries && n.entries.every((en) => isRec(en) && typeof en.id === 'string' && ENTRY_KINDS.includes(en.kind)))) return `Place "${id}" has entries that are not entries.`;
    if (n.added !== undefined || n.gone !== undefined || n.edited !== undefined) return `Place "${id}" carries a mark only the table makes.`;
    let depth = 0;
    for (let at = id, seen = new Set(); at !== undefined; at = ix.nodes[at].parent) {
      if (seen.has(at) || ++depth > WORLD_LIMITS.depth) return `Place "${id}" nests more than ${WORLD_LIMITS.depth} deep.`;
      seen.add(at);
    }
  }
  return null;
}

// ---------- the fill (Decision 2, "How a battle map reaches the engine") ----------
// The actions that may enter a battle place for the first time, or put one back as prepared, and so carry its map in
// `a.map`. W6 adds `journey` and W8 a Teleport `cast` here.
export const FILLED = ['enter', 'leave', 'loadMap', 'goTo', 'resetPlace'];
const isBattle = (n) => n?.kind === 'map' || n?.kind === 'vessel';
const nodeIn = (s, id) => (own(s?.world?.nodes, id) ? s.world.nodes[id] : null);
// The place an action goes to, by the state: the pin's place (enter), the place above (leave), or the one it names.
function targetOf(s, a) {
  if (a.type === 'enter') {
    const here = nodeIn(s, s.place), pin = Array.isArray(here?.pins) ? here.pins.find((p) => isRec(p) && p.id === a.pin) : null;
    return typeof pin?.to === 'string' ? pin.to : null;
  }
  if (a.type === 'leave') { const p = nodeIn(s, s.place)?.parent; return typeof p === 'string' ? p : null; }
  if (a.type === 'loadMap') return typeof a.node === 'string' ? a.node : null;
  return typeof a.node === 'string' ? a.node : null;
}
// Which map of the stored pack the action needs: { touch: false } for an action the fill does not look at (a plain
// `loadMap` with no node, anything else); otherwise { touch: true, node, key } where `key` is the pack map to put in, or
// null when none is needed (the place is in play or kept, or the pack has none for it). A place made at the table
// (`added`) is not the pack's: the DM's own map stays.
export function needsMap(s, a, stored) {
  if (!isRec(a) || !FILLED.includes(a.type) || (a.type === 'loadMap' && a.node === undefined)) return { touch: false };
  const to = targetOf(s, a), node = nodeIn(s, to);
  if (node?.added) return { touch: false };
  const reset = a.type === 'resetPlace' || a.stale === 'reset';
  const kept = own(s.parked, to) || (to !== null && to === s.place);
  const packNode = Array.isArray(stored?.nodes) ? stored.nodes.find((n) => isRec(n) && n.id === to) : null;
  const key = isBattle(node) && !node.gone && isBattle(packNode) && own(stored?.maps, packNode.map) && (reset || !kept) ? packNode.map : null;
  return { touch: true, node: to, key };
}
// The action with the pack's map in it: a `map` the client put in is dropped first, then the pack's put in where needed.
// A new object: the action given is not changed.
export function fillMap(s, a, stored) {
  const need = needsMap(s, a, stored);
  if (!need.touch) return a;
  const { map, ...rest } = a;
  return need.key ? { ...rest, map: structuredClone(stored.maps[need.key]) } : rest;
}

// What the DM is told of a world they imported: its name, version and how much it holds.
export function worldSummary(index, stored) {
  return { id: index.id, name: index.name, version: index.version, hash: index.hash, nodes: Object.keys(index.nodes).length,
    maps: Object.keys(stored?.maps ?? {}).length, routes: index.routes.length, tables: index.tables.length };
}
