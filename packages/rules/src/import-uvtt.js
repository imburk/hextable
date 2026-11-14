// Reads a Universal VTT map (.dd2vtt, .df2vtt, .uvtt) and returns a Hextable map document.
// Pure: no I/O, no randomness, no dependencies. Design: docs/specs/maps-and-objects.md, "Import a file".
//
// The format (field list from Arkenforge's Universal VTT description): positions and sizes are in grid
// squares, `rotation` is in radians, `resolution` is { map_origin, map_size, pixels_per_grid },
// `line_of_sight` and `objects_line_of_sight` are lists of polylines of {x,y}, `portals` each have
// position, bounds (two points), rotation, closed, freestanding, and `image` is a base64 PNG or WEBP.
// A square is 5 feet, so every coordinate is multiplied by 5. Lights are not read.
import { HEX, col } from './grid.js';
import { FT } from './space.js';
import { MAP_LIMITS, lintMap, newMap } from './map.js';

const G = HEX;                                          // the grid the file is laid on (hexes until task S11)
const S3 = Math.sqrt(3);                                // for the count of hexes a picture needs
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const pt = (p) => p && typeof p === 'object' && ok(p.x) && ok(p.y);
const round = (v) => Math.round(v * 1000) / 1000;
const feet = (p) => [round(p.x * FT), round(p.y * FT)];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

export function importUvtt(json, options = {}) {
  let doc = json;
  if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch { fail('This is not a Universal VTT file: it is not valid JSON.'); } }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('This is not a Universal VTT file: expected a JSON object.');
  const res = doc.resolution;
  if (!res || typeof res !== 'object') fail('This is not a Universal VTT file: it has no "resolution" section.');
  if (!pt(res.map_size) || res.map_size.x <= 0 || res.map_size.y <= 0) fail('This is not a Universal VTT file: "resolution.map_size" must give a width and height in squares.');
  if (res.map_origin !== undefined && !pt(res.map_origin)) fail('"resolution.map_origin" is not a point.');
  if (!Array.isArray(doc.line_of_sight)) fail('This is not a Universal VTT file: it has no "line_of_sight" list.');
  if (doc.portals !== undefined && !Array.isArray(doc.portals)) fail('"portals" must be a list.');
  if (doc.objects_line_of_sight !== undefined && !Array.isArray(doc.objects_line_of_sight)) fail('"objects_line_of_sight" must be a list.');

  const notes = [];
  const origin = res.map_origin ? [res.map_origin.x * FT, res.map_origin.y * FT] : [0, 0];
  const widthFt = res.map_size.x * FT, heightFt = res.map_size.y * FT;

  // Walls: every polyline becomes segments between consecutive points.
  let skippedLines = 0, degenerate = 0;
  const segs = [];
  const trace = (lines, kind) => {
    for (const line of lines) {
      if (!Array.isArray(line) || line.length < 2 || !line.every(pt)) { skippedLines++; continue; }
      for (let i = 1; i < line.length; i++) {
        const a = feet(line[i - 1]), b = feet(line[i]);
        if (a[0] === b[0] && a[1] === b[1]) { degenerate++; continue; }
        segs.push({ level: 'ground', a, b, kind });
      }
    }
  };
  trace(doc.line_of_sight, 'wall');
  const wallCount = segs.length;
  trace(doc.objects_line_of_sight ?? [], 'rail');      // furniture, pillars: they stop movement, not sight
  const railCount = segs.length - wallCount;
  let walls = segs;
  if (walls.length > MAP_LIMITS.walls) {
    const before = walls.length;
    walls = merge(walls);
    notes.push(`There were ${before} wall segments, over the limit of ${MAP_LIMITS.walls}, so straight runs were joined: ${walls.length} remain.`);
    if (walls.length > MAP_LIMITS.walls) notes.push(`That is still more than the limit of ${MAP_LIMITS.walls}. The map will not load until some walls are removed or the source map is simplified.`);
  }
  walls = walls.map((w, i) => ({ id: `w${i + 1}`, level: w.level, a: w.a, b: w.b, kind: w.kind }));
  if (skippedLines) notes.push(`Skipped ${plural(skippedLines, 'wall line')} that had fewer than two valid points.`);
  if (degenerate) notes.push(`Skipped ${plural(degenerate, 'wall segment')} of no length.`);

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
  let image = null;
  if (typeof doc.image === 'string' && doc.image) {
    const raw = doc.image.replace(/^data:[^,]*,/, '');
    const mime = raw.startsWith('UklGR') ? 'image/webp' : 'image/png';
    image = { url: `data:${mime};base64,${raw}`, mime, size: [widthFt, heightFt], origin: origin, pixelsPerGrid: ok(res.pixels_per_grid) ? res.pixels_per_grid : null };
  } else notes.push('The file has no image, so there is no background picture.');

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
