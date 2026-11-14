// Reads a Universal VTT map (.dd2vtt, .df2vtt, .uvtt) and returns a Hextable map document.
// Pure: no I/O, no randomness, no dependencies. Design: docs/specs/maps-and-objects.md, "Import a file".
//
// The format (field list from Arkenforge's Universal VTT description): positions and sizes are in grid
// squares, `rotation` is in radians, `resolution` is { map_origin, map_size, pixels_per_grid },
// `line_of_sight` and `objects_line_of_sight` are lists of polylines of {x,y}, `portals` each have
// position, bounds (two points), rotation, closed, freestanding, and `image` is a base64 PNG or WEBP.
// A square is 5 feet, so every coordinate is multiplied by 5.
//
// Two grids (docs/specs/square-grid.md, Decision 9, task S11). Without `options.grid` (or with `'square'`) the importer lays the file on
// squares, the grid it was drawn on: one square of the map is one square of the picture, with nothing for
// the DM to align; it is the default. `options.grid: 'hex'` is the hex import as it was, lights not read.
//
// On squares a grid line of the file is the side of a square: the map's squares are centred on multiples of
// 5 feet (their corners on 2.5 + 5k), so every point of the file is moved half a square (2.5 ft) north and
// west, and so is the picture's corner. Walls, doors and the picture move together and stay where they were
// drawn against each other.
//
// Hostile files: the text is capped, so are the lines, points, portals and lights read, the size and origin
// of the map, and the squares or hexes made. Every refusal is a UvttError with a plain message and nothing
// else is thrown. Memory and time are in proportion to the file, which the editor already caps.
import { HEX, SQUARE, col } from './grid.js';
import { FT } from './space.js';
import { MAP_LIMITS, lintMap, newMap } from './map.js';

const S3 = Math.sqrt(3);                                // for the count of hexes a picture needs
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const pt = (p) => p && typeof p === 'object' && ok(p.x) && ok(p.y);
const round = (v) => Math.round(v * 1000) / 1000;
const feet = (p) => [round(p.x * FT), round(p.y * FT)];
const reach = (a) => a.every((v) => Math.abs(v) <= LIMIT.feet);       // a point the map can hold
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const LIMIT = { text: 64e6, lines: 50000, points: 200000, portals: 20000, lights: 20000, side: 20000, feet: 100000 };
export class UvttError extends Error {}
const fail = (m) => { throw new UvttError(m); };

const collinear = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <= 1e-6 * (1 + Math.hypot(c[0] - a[0], c[1] - a[1]));
// Joins consecutive segments that continue in a straight line (same kind, end meets start).
function merge(walls) {
  const out = [];
  for (const w of walls) {
    const last = out[out.length - 1];
    if (last && last.kind === w.kind && last.b[0] === w.a[0] && last.b[1] === w.a[1] && collinear(last.a, last.b, w.b)) last.b = w.b;
    else out.push({ ...w, a: [...w.a], b: [...w.b] });
  }
  return out;
}

// The picture, kept out of the map document: its data URL, size in feet and corner. Null, with a note, if the
// file has none or it is not base64 (it goes into a data: address, so nothing else may pass).
function pictureOf(doc, res, size, origin, notes) {
  if (!(typeof doc.image === 'string' && doc.image)) { notes.push('The file has no image, so there is no background picture.'); return null; }
  const raw = doc.image.slice(0, 200).startsWith('data:') ? doc.image.slice(doc.image.indexOf(',') + 1) : doc.image;
  if (raw.length < 12 || raw.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) { notes.push('The file\'s image is not valid base64 PNG or WEBP data, so there is no background picture.'); return null; }
  const mime = raw.startsWith('UklGR') ? 'image/webp' : 'image/png';
  return { url: `data:${mime};base64,${raw}`, mime, size, origin, pixelsPerGrid: ok(res.pixels_per_grid) && res.pixels_per_grid > 0 ? res.pixels_per_grid : null };
}

export function importUvtt(json, options = {}) {
  try { return read(json, options && typeof options === 'object' ? options : {}); }
  catch (err) {
    if (err instanceof UvttError) throw err;
    throw new UvttError('That file could not be read as a Universal VTT map.');
  }
}

// Turns polylines into wall segments, point by point through `conv` (file squares to map feet), counting
// what it leaves out.
function tracer(conv) {
  const T = { segs: [], skippedLines: 0, degenerate: 0 };
  T.trace = (lines, kind) => {
    for (const line of lines) {
      if (!Array.isArray(line) || line.length < 2 || !line.every(pt)) { T.skippedLines++; continue; }
      for (let i = 1; i < line.length; i++) {
        const a = conv(line[i - 1]), b = conv(line[i]);
        if (!reach(a) || !reach(b)) { T.skippedLines++; continue; }
        if (a[0] === b[0] && a[1] === b[1]) { T.degenerate++; continue; }
        T.segs.push({ level: 'ground', a, b, kind });
      }
    }
  };
  return T;
}
// The segments as map walls: over the limit, straight runs are joined first. Notes what it did.
function finishWalls(T, notes) {
  let walls = T.segs;
  if (walls.length > MAP_LIMITS.walls) {
    const before = walls.length;
    walls = merge(walls);
    notes.push(`There were ${before} wall segments, over the limit of ${MAP_LIMITS.walls}, so straight runs were joined: ${walls.length} remain.`);
    if (walls.length > MAP_LIMITS.walls) notes.push(`That is still more than the limit of ${MAP_LIMITS.walls}. The map will not load until some walls are removed or the source map is simplified.`);
  }
  walls = walls.map((w, i) => ({ id: `w${i + 1}`, level: w.level, a: w.a, b: w.b, kind: w.kind }));
  if (T.skippedLines) notes.push(`Skipped ${plural(T.skippedLines, 'wall line')} that had fewer than two valid points.`);
  if (T.degenerate) notes.push(`Skipped ${plural(T.degenerate, 'wall segment')} of no length.`);
  return walls;
}

// The size of a PNG or WEBP picture in pixels from the first bytes of its base64, or null.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function pictureSize(raw) {
  const bytes = [];
  let acc = 0, bits = 0;
  for (const ch of raw.slice(0, 48)) {
    const v = B64.indexOf(ch);
    if (v < 0) break;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
  }
  const u32 = (i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const tag = (i, t) => t.split('').every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes.length >= 24 && bytes[0] === 0x89 && tag(1, 'PNG') && tag(12, 'IHDR')) return [u32(16), u32(20)];
  if (bytes.length >= 30 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    if (tag(12, 'VP8 ')) return [(bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff];
    if (tag(12, 'VP8L')) { const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24); return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1]; }
    if (tag(12, 'VP8X')) return [(bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1, (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1];
  }
  return null;
}

function read(json, options) {
  let doc = json;
  if (typeof doc === 'string' && doc.length > LIMIT.text) fail(`This file is too big to be a map: it is over ${Math.round(LIMIT.text / 1e6)} million characters.`);
  if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch { fail('This is not a Universal VTT file: it is not valid JSON.'); } }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('This is not a Universal VTT file: expected a JSON object.');
  const res = doc.resolution;
  if (!res || typeof res !== 'object') fail('This is not a Universal VTT file: it has no "resolution" section.');
  if (!pt(res.map_size) || res.map_size.x <= 0 || res.map_size.y <= 0) fail('This is not a Universal VTT file: "resolution.map_size" must give a width and height in squares.');
  if (res.map_origin !== undefined && !pt(res.map_origin)) fail('"resolution.map_origin" is not a point.');
  if (!Array.isArray(doc.line_of_sight)) fail('This is not a Universal VTT file: it has no "line_of_sight" list.');
  if (doc.portals !== undefined && !Array.isArray(doc.portals)) fail('"portals" must be a list.');
  if (doc.objects_line_of_sight !== undefined && !Array.isArray(doc.objects_line_of_sight)) fail('"objects_line_of_sight" must be a list.');
  if (doc.lights !== undefined && !Array.isArray(doc.lights)) fail('"lights" must be a list.');
  // Bounds on hostile input, before anything is looped over.
  if (res.map_size.x > LIMIT.side || res.map_size.y > LIMIT.side) fail(`This map is ${res.map_size.x} by ${res.map_size.y} squares; the most a side can be is ${LIMIT.side}.`);
  if (res.map_origin && (Math.abs(res.map_origin.x) > LIMIT.side || Math.abs(res.map_origin.y) > LIMIT.side)) fail('"resolution.map_origin" is too far from the start of the map.');
  const lineLists = [doc.line_of_sight, doc.objects_line_of_sight ?? []];
  if (lineLists[0].length + lineLists[1].length > LIMIT.lines) fail(`This file has more than ${LIMIT.lines} wall lines.`);
  let pointCount = 0;
  for (const list of lineLists) for (const line of list) if (Array.isArray(line)) pointCount += line.length;
  if (pointCount > LIMIT.points) fail(`This file has more than ${LIMIT.points} wall points.`);
  if ((doc.portals?.length ?? 0) > LIMIT.portals) fail(`This file has more than ${LIMIT.portals} doors.`);
  if (options.grid !== 'hex') return readSquares(doc, res, options);
  const G = HEX;

  const notes = [];
  const origin = res.map_origin ? [res.map_origin.x * FT, res.map_origin.y * FT] : [0, 0];
  const widthFt = res.map_size.x * FT, heightFt = res.map_size.y * FT;

  // Walls: every polyline becomes segments between consecutive points.
  const T = tracer(feet);
  T.trace(doc.line_of_sight, 'wall');
  const wallCount = T.segs.length;
  T.trace(doc.objects_line_of_sight ?? [], 'rail');      // furniture, pillars: they stop movement, not sight
  const railCount = T.segs.length - wallCount;
  const walls = finishWalls(T, notes);

  // Tiles: every hex whose centre lies on the image, plus the ring just outside so edge walls have floor beside them.
  const x0 = origin[0], y0 = origin[1], x1 = x0 + widthFt, y1 = y0 + heightFt, pad = FT / 2;
  const maxTiles = MAP_LIMITS.tiles;
  const approx = (widthFt * heightFt) / (FT * FT * S3 / 2);
  if (approx > maxTiles * 1.1) fail(`This map is ${res.map_size.x} by ${res.map_size.y} squares, which needs about ${Math.round(approx)} hexes; the limit is ${maxTiles}.`);
  const tiles = {};
  for (const h of G.cellsIn(x0 - pad, y0 - pad, x1 + pad, y1 + pad)) tiles[col(h)] = { t: 'stone' };
  if (Object.keys(tiles).length > maxTiles) fail(`This map needs more than ${maxTiles} hexes.`);

  // Doors: a portal is a door standing on its own line, in the hex nearest its middle.
  const objects = [];
  let badPortals = 0, freestanding = 0, added = 0;
  for (const p of doc.portals ?? []) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.bounds) || p.bounds.length < 2 || !p.bounds.slice(0, 2).every(pt)) { badPortals++; continue; }
    const a = feet(p.bounds[0]), b = feet(p.bounds[1]);
    if (a[0] === b[0] && a[1] === b[1]) { badPortals++; continue; }
    const mid = pt(p.position) ? feet(p.position) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const at = G.cell(mid[0], mid[1]);
    if (!tiles[col(at)]) { tiles[col(at)] = { t: 'stone' }; added++; }
    if (p.freestanding) freestanding++;
    objects.push({ id: `d${objects.length + 1}`, def: 'door-wooden', level: 'ground', at, seg: { a, b }, state: p.closed === false ? 'open' : 'closed' });
  }
  if (objects.length > MAP_LIMITS.objects) fail(`This map has more than ${MAP_LIMITS.objects} doors.`);

  const map = newMap({
    id: options.id ?? 'uvtt-import', name: options.name ?? 'Imported map',
    levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], walls, objects,
  });

  // Image: kept out of the map document.
  const image = pictureOf(doc, res, [widthFt, heightFt], origin, notes);

  const open = objects.filter((o) => o.state === 'open').length;
  notes.unshift(`Read ${res.map_size.x} by ${res.map_size.y} squares as ${widthFt} by ${heightFt} feet: ${plural(wallCount, 'wall segment')} from line of sight, ${plural(objects.length, 'door')} (${open} open), ${Object.keys(tiles).length} stone hexes.`);
  if (railCount) notes.push(`${plural(railCount, 'segment')} from objects_line_of_sight became low walls (rails): they stop movement but not sight.`);
  if (badPortals) notes.push(`Skipped ${plural(badPortals, 'portal')} without two usable end points.`);
  if (freestanding) notes.push(`${plural(freestanding, 'door')} marked freestanding (not set in a wall); they are doors here all the same, so check them.`);
  if (added) notes.push(`Added ${plural(added, 'hex')} so a door has floor under it.`);
  if (origin[0] || origin[1]) notes.push(`The map origin is not 0,0 (${origin[0]}, ${origin[1]} feet). Wall positions were taken as given; check the image lines up.`);
  if (Array.isArray(doc.lights) && doc.lights.length) notes.push(`Ignored ${plural(doc.lights.length, 'light')}: lights are not imported.`);
  else notes.push('Lights are not imported.');
  notes.push('Hexes and squares never line up exactly, so a wall may cut a hex edge at an angle; a step is blocked if a wall crosses the line between two hex centres. Every hex is plain stone; walls decide where creatures can go.');
  notes.push('Doors are closed or open as the file says and every door is a plain wooden door. Open the map in the editor to check doors, windows and secret doors before play.');

  const bad = lintMap(map);
  if (bad.length) notes.push(...bad.map((m) => `Problem: ${m}`));
  return { map, notes, image };
}

// ---------- squares ----------
const SHIFT = FT / 2;                                   // a grid line of the file is a side of a square, which is 2.5 ft from a centre
const TOL = 0.01;                                       // feet: how close to a square's side a door must lie to stand on it
const near = (p, q) => Math.abs(p[0] - q[0]) <= TOL && Math.abs(p[1] - q[1]) <= TOL;

// The side of a square a portal's two ends lie on, as { at, edge } (edge 0 east, 3 south), or null if they lie
// on anything else: the square editor stores a door that is exactly one side the same way.
function sideOf(a, b) {
  const cand = [];
  if (Math.abs(a[0] - b[0]) <= TOL) cand.push({ q: (a[0] - SHIFT) / FT, r: Math.round(((a[1] + b[1]) / 2) / FT), e: 0 });   // up and down: the east side of the square to its west
  if (Math.abs(a[1] - b[1]) <= TOL) cand.push({ q: Math.round(((a[0] + b[0]) / 2) / FT), r: (a[1] - SHIFT) / FT, e: 3 });   // across: the south side of the square to its north
  for (const c of cand) {
    const at = { q: Math.round(c.q), r: Math.round(c.r) };
    if (Math.abs(c.q - at.q) > TOL / FT || Math.abs(c.r - at.r) > TOL / FT) continue;
    const [s0, s1] = SQUARE.edgeSegment(at, c.e);
    if ((near(a, s0) && near(b, s1)) || (near(a, s1) && near(b, s0))) return { at, edge: c.e };
  }
  return null;
}

function readSquares(doc, res, options) {
  const G = SQUARE, notes = [], nw = res.map_size.x, nh = res.map_size.y;
  const conv = (p) => [round(p.x * FT - SHIFT), round(p.y * FT - SHIFT)];
  const origin = res.map_origin ? conv(res.map_origin) : [-SHIFT, -SHIFT];
  const widthFt = nw * FT, heightFt = nh * FT;

  const T = tracer(conv);
  T.trace(doc.line_of_sight, 'wall');
  const wallCount = T.segs.length;
  T.trace(doc.objects_line_of_sight ?? [], 'rail');
  const railCount = T.segs.length - wallCount;
  const walls = finishWalls(T, notes);

  // Floor: a stone tile on every square that lies wholly on the picture (as the editor's Fill floor does).
  if (Math.ceil(nw) * Math.ceil(nh) > MAP_LIMITS.tiles * 1.1) fail(`This map is ${nw} by ${nh} squares, which is about ${Math.ceil(nw) * Math.ceil(nh)} squares; the limit is ${MAP_LIMITS.tiles}.`);
  const tiles = {}, inset = SHIFT - 0.01;
  for (const h of G.cellsIn(origin[0] + inset, origin[1] + inset, origin[0] + widthFt - inset, origin[1] + heightFt - inset)) tiles[col(h)] = { t: 'stone' };
  if (Object.keys(tiles).length > MAP_LIMITS.tiles) fail(`This map needs more than ${MAP_LIMITS.tiles} squares.`);

  // Doors: a portal that is exactly one side of a square is a door on that side, standing on a tile of the
  // floor (the one it is set in, or the one beside it); any other is a door on its own line in the square nearest its middle.
  const objects = [];
  let badPortals = 0, freestanding = 0, added = 0, onSide = 0;
  for (const p of doc.portals ?? []) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.bounds) || p.bounds.length < 2 || !p.bounds.slice(0, 2).every(pt)) { badPortals++; continue; }
    const a = conv(p.bounds[0]), b = conv(p.bounds[1]);
    if ((a[0] === b[0] && a[1] === b[1]) || !reach(a) || !reach(b)) { badPortals++; continue; }
    const state = p.closed === false ? 'open' : 'closed', side = sideOf(a, b);
    let door;
    if (side) {
      const to = { q: side.at.q + G.DIRS[side.edge][0], r: side.at.r + G.DIRS[side.edge][1] };
      const [on, edge] = tiles[col(side.at)] || !tiles[col(to)] ? [side.at, side.edge] : [to, G.edgeOf(to, side.at)];
      if (!tiles[col(on)]) { tiles[col(on)] = { t: 'stone' }; added++; }
      door = { at: on, edge };
      onSide++;
    } else {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], at = G.cell(mid[0], mid[1]);
      if (!tiles[col(at)]) { tiles[col(at)] = { t: 'stone' }; added++; }
      door = { at, seg: { a, b } };
    }
    if (p.freestanding) freestanding++;
    objects.push({ id: `d${objects.length + 1}`, def: 'door-wooden', level: 'ground', ...door, state });
  }
  if (objects.length > MAP_LIMITS.objects) fail(`This map has more than ${MAP_LIMITS.objects} doors.`);

  // Lights: the map holds no free light, only things that burn in a square, so each light becomes a lit brazier in the
  // square it stands in (one to a square). Its range, colour and shadows are the brazier's, not the file's.
  const lights = Array.isArray(doc.lights) ? doc.lights : [];
  let lit = 0, lostLights = 0;
  const lightSquares = new Set();
  for (const l of lights) {
    const at = l && typeof l === 'object' && pt(l.position) ? conv(l.position) : null;
    if (!at || !reach(at)) { lostLights++; continue; }
    const h = G.cell(at[0], at[1]);
    if (!tiles[col(h)]) { lostLights++; continue; }
    if (lightSquares.has(col(h))) continue;
    lightSquares.add(col(h));
    if (objects.length >= MAP_LIMITS.objects) { lostLights++; continue; }
    objects.push({ id: `l${++lit}`, def: 'brazier', level: 'ground', at: h, state: 'lit', name: 'Light' });
  }

  const map = newMap({
    id: options.id ?? 'uvtt-import', name: options.name ?? 'Imported map', grid: 'square',
    levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], walls, objects,
  });

  const image = pictureOf(doc, res, [widthFt, heightFt], origin, notes);
  let coincide = !!image;
  if (image) {
    const px = pictureSize(image.url.slice(image.url.indexOf(',') + 1)), ppg = image.pixelsPerGrid;
    if (px && ppg && (Math.abs(px[0] / ppg - nw) > 0.5 || Math.abs(px[1] / ppg - nh) > 0.5)) notes.push(`The picture is ${px[0]} by ${px[1]} pixels, which at ${ppg} pixels a square is ${round(px[0] / ppg)} by ${round(px[1] / ppg)} squares, not the ${nw} by ${nh} the file says. It is stretched to the ${nw} by ${nh}, so its grid may not line up with the map's squares: check it, and use Align to the picture's grid if it does not.`), coincide = false;
    if (!ppg) notes.push('The file gives no usable pixels per square, so the picture is spread over the map_size as given.');
  }

  const open = objects.filter((o) => o.state === 'open' && o.def === 'door-wooden').length, doors = objects.length - lit;
  notes.unshift(`Read ${nw} by ${nh} squares as a square map of ${widthFt} by ${heightFt} feet: ${plural(wallCount, 'wall segment')} from line of sight, ${plural(doors, 'door')} (${open} open; ${onSide} on a square side, ${doors - onSide} on a line), ${plural(lit, 'light')}, ${Object.keys(tiles).length} stone squares.`);
  if (railCount) notes.push(`${plural(railCount, 'segment')} from objects_line_of_sight became low walls (rails): they stop movement but not sight.`);
  if (badPortals) notes.push(`Skipped ${plural(badPortals, 'portal')} without two usable end points.`);
  if (freestanding) notes.push(`${plural(freestanding, 'door')} marked freestanding (not set in a wall); they are doors here all the same, so check them.`);
  if (added) notes.push(`Added ${plural(added, 'square')} so a door has floor under it.`);
  if (lit) notes.push(`${plural(lit, 'light')} became ${lit === 1 ? 'a lit brazier' : 'lit braziers'}, one in the square each stands in. The map has no free-standing light, so the file's range, colour and shadow settings were left out: a brazier lights 20 feet bright and 20 dim.`);
  if (lights.length > lit) {
    const dup = lights.length - lit - lostLights;
    notes.push(`Left out ${plural(lights.length - lit, 'light')}: ${[lostLights && `${lostLights} with no usable position or outside the floor`, dup && `${dup} in a square that already had one`].filter(Boolean).join(' and ')}.`);
  }
  const off = [(origin[0] + SHIFT) / FT, (origin[1] + SHIFT) / FT];
  if (!off.some((v) => Math.abs(v - Math.round(v)) > 0.001) && coincide) notes.push('The picture\'s grid lines are the map\'s square sides, so the picture, walls, doors and squares coincide and nothing needs aligning.');
  if (off.some((v) => Math.abs(v - Math.round(v)) > 0.001)) notes.push(`The map origin is ${res.map_origin.x}, ${res.map_origin.y} squares, which is not a whole number: the picture's grid lines fall ${round(((off[0] % 1) + 1) % 1 * FT)} and ${round(((off[1] % 1) + 1) % 1 * FT)} feet inside the map's square sides. Use Align to the picture's grid.`);
  else if (off[0] || off[1]) notes.push(`The map origin is ${res.map_origin.x}, ${res.map_origin.y} squares: the picture starts there and the walls were taken as given.`);
  notes.push('Left out: the file\'s ambient light and baked lighting, and the rotation of each door. Doors are closed or open as the file says and every door is a plain wooden door; every square is plain stone and walls decide where creatures can go. Open the map in the editor to check doors, windows and secret doors before play.');

  const bad = lintMap(map);
  if (bad.length) notes.push(...bad.map((m) => `Problem: ${m}`));
  return { map, notes, image };
}
