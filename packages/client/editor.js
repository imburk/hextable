// The DM's map editor, paint mode: a UI over the engine's `mapEdit` and `loadMap` actions. It never
// changes the map itself: every edit is sent as an action, and the engine checks the whole map
// before taking it. Design: docs/specs/maps-and-objects.md, "Putting a place into the game".
import * as Gr from './shared/grid.js';
import { TILES } from './shared/content/terrain.js';
import { CONTENT } from './shared/content/index.js';
import { WALL_KINDS, barriers, objectHexes, objectSegment } from './shared/walls.js';
import { newMap, lintMap, migrateMap } from './shared/map.js';
import { UvttError, importUvtt } from './shared/import-uvtt.js';
import { STOCK_MAPS } from './shared/content/maps/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOOLS = { paint: 'Paint', erase: 'Erase', wall: 'Walls', trace: 'Trace', object: 'Doors & things', region: 'Rooms', height: 'Height', props: 'Properties', start: 'Start', level: 'Levels', file: 'Map file' };
const HINTS = {
  paint: 'Tap or drag across hexes to paint them, empty ones too.',
  erase: 'Tap or drag across tiles to remove them, with any door or thing on them.',
  wall: 'Tap two neighbouring hexes to wall the edge between them. Do it again to take the wall away.',
  trace_wall: 'Tap points along a wall on the picture. Tap the last point again, or Done, to finish the line. Tap the first point to close a room.',
  trace_door: 'Tap the two ends of a door. Leave a gap in the wall for it, then tap across the gap.',
  trace_edit: 'Tap a wall or door to pick it, then Delete. Drag a red end to move it (walls that meet there move together). Amber bars are hex steps a wall stops.',
  door: 'Tap two neighbouring hexes to put the door on the edge between them. Again to remove it.',
  thing: 'Tap a hex to put it there. Tap it again to remove it.',
  ladder: 'Tap where it stands, then where it leads (switch level between taps if it goes up or down).',
  region: 'Pick or name a room, then tap or drag across hexes to add them to it or take them out. Wall it in uses the kind chosen under Walls.',
  height: 'Tap a tile to raise or lower it by 2.5 ft. A rise of up to 2.5 ft per hex walks freely, up to 5 ft is Difficult Terrain, more is a climb.',
  stairs: 'Tap the hex at the bottom, then the hex at the top, in a straight line. The tiles between become even steps. They can be on different levels.',
  props: 'Tap a door or thing to set its state, name, key, DCs and links.',
  start: 'Tap the hex where the party starts.',
  level: 'Add a level above or below, or pick which one to edit at the top. A background picture is the floor of its level: set its scale, then trace the walls over it.',
  file: 'Start a blank map or one of the stock maps, save this one to a file, or open one. Import reads a Universal VTT file (.dd2vtt, .df2vtt, .uvtt) from a map maker: its picture, walls, doors and lights, on squares or on hexes.',
};
// What differs on squares: the words (hex, hexes) are the grid's own, and a few hints say something else.
const SQUARE_HINTS = {
  wall: 'Tap two neighbouring squares to wall the side between them. Do it again to take the wall away. To follow a picture, use Trace.',
  trace_wall: 'Tap points along a wall on the picture: they snap to the grid\'s corners and sides, and to wall ends already there. Tap the last point again, or Done, to finish the line. Tap the first point to close a room.',
  trace_door: 'Tap the two ends of a door: along one side of a square, from corner to corner. Leave a gap in the wall for it.',
  stairs: 'Tap the square at the bottom, then the square at the top, in a straight line: along a row, a column or a diagonal. The tiles between become even steps. They can be on different levels.',
  level: 'Add a level above or below, or pick which one to edit at the top. A background picture is the floor of its level: Align it to its grid, then trace the walls over it.',
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
const fresh = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
const sameSeg = (w, [a, b]) => (same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a));

export class Editor {
  get G() { return Gr.gridOf(this.S.map); }      // the grid of the map being edited
  // ctx: { R, act, toast, state(), isDM(), refresh() }
  constructor(ctx) {
    Object.assign(this, ctx);
    const tell = ctx.toast;
    this.toast = (m, quiet) => tell(this.say(m), quiet);
    this.on = false;
    this.tool = 'paint'; this.terrain = 'stone'; this.brush = 0; this.kind = 'wall';
    this.def = Object.keys(CONTENT.objects)[0]; this.region = ''; this.levelId = null; this.showAll = false;
    this.pending = null;          // the first hex of a two-tap edit: { q, r, level }
    this.armed = null;            // a button that needs a second tap
    this.tmode = 'wall'; this.tdef = Object.values(CONTENT.objects).find((o) => o.kind === 'door')?.id; this.snap = 1;
    this.traceLine = []; this.sel = null; this.endDrag = null; this.barSig = '';      // the trace tool: a line being drawn, the wall picked, an end being dragged
    this.scaling = null;          // the scale tool: { pts: [[x, y], ...] } in map feet, two taps on the picture
    this.hmode = 'up'; this.lastH = null; this.props = null; this.stroke = null; this.areaOver = null;   // height tool, properties form, a drag in progress
    this.#build();
    $('dm-edit').onclick = () => this.start();
  }

  get S() { return this.state(); }
  // A sentence in the grid's words: "hex" and "hexes" become "square" and "squares" on a square map.
  say(text) { const w = this.G.word; return this.G.kind === 'hex' ? text : String(text).replace(/\bhexes\b/g, w.many).replace(/\bhex\b/g, w.one); }
  hint(key) { return this.say((this.G.kind === 'square' && SQUARE_HINTS[key]) || HINTS[key]); }
  level() {
    const ls = this.S.map.levels;
    return ls.find((l) => l.id === this.levelId) ?? ls.find((l) => l.z === 0) ?? ls[0];
  }
  start() {
    if (!this.S || !this.isDM()) return;
    this.on = true; this.pending = null;
    $('dm').hidden = true;
    this.R.onPoint = (x, y) => this.#tap(x, y);
    this.R.onDrag = this.#drag();
    this.refresh();
  }
  stop() {
    if (!this.on) return;
    this.on = false; this.pending = null;
    this.R.onPoint = null; this.R.onDrag = null; this.stroke = null; this.props = null; this.scaling = null; this.traceLine = []; this.sel = null; this.endDrag = null; this.uvtt = null; this.uvttSrc = null; this.R.setPins([]); this.R.setBars([]); this.pinSig = ''; this.barSig = '';
    document.body.classList.remove('editing'); $('editor').hidden = true; this.#heightNums();
    if (this.S) this.refresh();
  }
  // How high to draw floors while editing: the level being edited and those below it.
  ceiling() {
    if (this.showAll) return Infinity;
    const l = this.level(), top = Math.max(0, ...Object.values(l.tiles).map((t) => t.h ?? 0));       // stairs and slopes on this level stay in view
    const above = this.S.map.levels.filter((x) => x.z > l.z).map((x) => x.z);
    return Math.min(l.z + Math.max(4, top), ...above.map((z) => z - 0.5));
  }
  // What to light up on the map: the room being drawn, the start, and the first hex of a two-tap edit.
  marks() {
    const l = this.level(), at = (k) => { const h = Gr.parse(k); return Gr.key({ ...h, z: l.z + (l.tiles[k]?.h ?? 0) }); };
    const move = [], area = [];
    if (this.tool === 'region') { const r = this.S.map.regions.find((x) => x.id === this.region); if (r) move.push(...r.hexes.map(at)); }
    if (this.tool === 'start') for (const s of this.S.map.starts) area.push(Gr.key({ q: s.q, r: s.r, z: s.z ?? 0 }));
    if (this.pending) {
      const pl = this.S.map.levels.find((x) => x.id === this.pending.level) ?? l, k = Gr.col(this.pending);
      area.push(Gr.key({ ...this.pending, z: pl.z + (pl.tiles[k]?.h ?? 0) }));
    }
    for (const h of this.#strokeArea()) area.push(Gr.key({ ...h, z: l.z + (l.tiles[Gr.col(h)]?.h ?? 0) }));
    return { move, area };
  }

  // Called on every refresh of the table UI.
  sync() {
    if (this.on && (!this.S || !this.isDM())) return this.stop();
    document.body.classList.toggle('editing', this.on);
    $('editor').hidden = !this.on;
    if (!this.on) return;
    const map = this.S.map, l = this.level(), kind = this.G.kind;
    if (this.snapFor !== kind) { this.snapFor = kind; this.snap = kind === 'square' ? 'grid' : 1; }       // squares snap to the grid unless the DM rounds by feet instead
    this.levelId = l.id;
    this.#options($('ed-level'), [...map.levels].sort((a, b) => b.z - a.z).map((x) => [x.id, `${x.name} (${x.z} ft)`]), l.id);
    const rooms = map.regions.filter((r) => r.level === l.id);
    if (this.region && !map.regions.some((r) => r.id === this.region)) this.region = '';
    this.#options($('ed-region'), [['', '+ New room'], ...rooms.map((r) => [r.id, `${r.name} (${r.hexes.length})${r.revealed ? ' · shown' : ''}`])], this.region);
    const room = map.regions.find((r) => r.id === this.region);
    if (room && document.activeElement !== $('ed-rname')) $('ed-rname').value = room.name;
    $('ed-wallin').disabled = $('ed-unregion').disabled = $('ed-rlight').disabled = !room;
    if (document.activeElement !== $('ed-rlight')) $('ed-rlight').value = room?.light ?? '';
    if (document.activeElement !== $('ed-llight')) $('ed-llight').value = l.light ?? 'bright';
    $('ed-unlevel').disabled = map.levels.length < 2;
    for (const b of $('ed-tools').children) b.classList.toggle('sel', b.dataset.tool === this.tool);
    for (const b of $('ed-terrain').children) b.classList.toggle('sel', b.dataset.t === this.terrain);
    for (const b of $('ed-kinds').children) b.classList.toggle('sel', b.dataset.k === this.kind);
    for (const b of $('ed-brush').children) { b.classList.toggle('sel', +b.dataset.b === this.brush); b.textContent = kind === 'square' ? ['1 square', '3 by 3'][+b.dataset.b] : ['1 hex', '7 hexes'][+b.dataset.b]; }
    $('ed-grid').textContent = kind === 'square' ? 'Grid: squares' : 'Grid: hexes';
    $('ed-gridnote').textContent = `This map is on ${kind === 'square' ? 'squares' : 'hexes'}, and the editor keeps it so. For the other grid, start a new map.`;
    for (const p of $('ed-opts').children) p.hidden = !p.dataset.for.split(' ').includes(this.tool);
    $('ed-notes').hidden = this.tool !== 'file' || !this.uvtt;
    const d = CONTENT.objects[this.def];
    const hint = this.tool === 'object' ? (d.kind === 'door' ? 'door' : d.connects ? 'ladder' : 'thing') : this.tool;
    $('ed-hint').textContent = this.pending ? (this.tool === 'object' && d.connects ? 'Now tap where it leads.' : this.say('Now tap a neighbouring hex.')) : this.hint(hint);
    this.#syncMore(room);
    this.#syncBackground(l);
    this.#syncTrace(l);
    this.R.inset = $('editor').offsetHeight * 0.85;
  }

  // ---------- taps ----------
  #tap(px, py) {
    if (!this.S) return;
    if (this.scaling && this.tool === 'level') return this.#scaleTap(px, py);
    if (this.tool === 'trace') return this.#traceTap(px, py);
    const l = this.level(), h = this.R.planeHex(px, py, l.z);
    if (!h) return;
    const k = Gr.col(h), tile = l.tiles[k], map = this.S.map, area = this.areaOver ?? this.G.range(h, this.brush);
    switch (this.tool) {
      case 'paint': {
        const ops = area.filter((x) => l.tiles[Gr.col(x)]?.t !== this.terrain).map((at) => ({ op: 'tile', level: l.id, at, tile: { ...(l.tiles[Gr.col(at)] ?? {}), t: this.terrain } }));
        return ops.length && this.edit(ops);
      }
      case 'erase': {
        const gone = new Set(area.map(Gr.col).filter((c) => l.tiles[c]));
        if (!gone.size) return;
        const ops = map.objects.filter((o) => o.level === l.id && objectHexes(o, this.G).some((x) => gone.has(Gr.col(x)))).map((o) => ({ op: 'unobject', id: o.id }));
        const left = (s) => !gone.has(Gr.col(s)) || map.levels.some((x) => x.id !== l.id && x.tiles[Gr.col(s)]);
        if (!map.starts.every(left)) ops.push({ op: 'starts', starts: map.starts.filter(left) });
        for (const c of gone) ops.push({ op: 'tile', level: l.id, at: Gr.parse(c), tile: null });
        return this.edit(ops);
      }
      case 'wall': return this.#pair(h, (a, e) => {
        const seg = this.G.edgeSegment(a, e), had = map.walls.find((w) => w.level === l.id && sameSeg(w, seg));
        return [had ? { op: 'unwall', id: had.id } : { op: 'wall', wall: { level: l.id, a: seg[0], b: seg[1], kind: this.kind } }];
      });
      case 'object': {
        const def = CONTENT.objects[this.def];
        if (def.kind === 'door') return this.#pair(h, (a, e) => {
          const b = { q: a.q + this.G.DIRS[e][0], r: a.r + this.G.DIRS[e][1] }, seg = this.G.edgeSegment(a, e);
          const had = map.objects.find((o) => o.level === l.id && Number.isInteger(o.edge) && sameSeg({ a: this.G.edgeSegment(o.at, o.edge)[0], b: this.G.edgeSegment(o.at, o.edge)[1] }, seg));
          if (had) return [{ op: 'unobject', id: had.id }];
          const [at, edge] = l.tiles[Gr.col(a)] || !l.tiles[Gr.col(b)] ? [a, e] : [b, this.G.edgeOf(b, a)];      // a door stands on a tile of its level
          return [...map.walls.filter((w) => w.level === l.id && sameSeg(w, seg)).map((w) => ({ op: 'unwall', id: w.id })),
            { op: 'object', object: { def: this.def, level: l.id, at: { q: at.q, r: at.r }, edge } }];
        });
        if (def.connects) {
          if (!this.pending) { this.pending = { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
          const p = this.pending; this.pending = null;
          if (p.level === l.id && p.q === h.q && p.r === h.r) return this.refresh();
          return this.edit([{ op: 'object', object: { def: this.def, level: p.level, at: { q: p.q, r: p.r }, to: { q: h.q, r: h.r, z: l.z + (tile?.h ?? 0) } } }]);
        }
        const here = map.objects.filter((o) => o.level === l.id && o.edge === undefined && !o.seg && o.at.q === h.q && o.at.r === h.r);
        return this.edit(here.length ? here.map((o) => ({ op: 'unobject', id: o.id })) : [{ op: 'object', object: { def: this.def, level: l.id, at: { q: h.q, r: h.r } } }]);
      }
      case 'region': {
        const room = map.regions.find((r) => r.id === this.region);
        const keys = area.map(Gr.col).filter((c) => l.tiles[c]);
        if (!keys.length) return this.toast('Rooms are made of tiles. Paint the floor first.');
        if (!room) {
          const name = $('ed-rname').value.trim();
          if (!name) return this.toast('Name the room first.');
          this.region = fresh(`r-${slug(name)}`, new Set(map.regions.map((r) => r.id)));
          return this.edit([{ op: 'region', region: { id: this.region, name, level: l.id, hexes: keys } }]);
        }
        const hexes = room.hexes.includes(k) ? room.hexes.filter((c) => !keys.includes(c)) : [...new Set([...room.hexes, ...keys])];
        return this.edit([hexes.length ? { op: 'region', region: { ...room, hexes } } : { op: 'unregion', id: room.id }]);
      }
      case 'height': return this.hmode === 'stairs' ? this.#stairsTap(h) : this.#heightTap(h, l);
      case 'props': return this.#propsTap(h, l);
      case 'start':
        if (!tile) return this.toast('The party needs a floor to start on.');
        return this.edit([{ op: 'starts', starts: [{ q: h.q, r: h.r, z: l.z + (tile.h ?? 0) }] }]);
      default: return this.toast(this.hint(this.tool));
    }
  }
  // A two-tap edit on the edge between neighbouring hexes. make(first, edge) returns the ops.
  #pair(h, make) {
    const p = this.pending, l = this.level();
    if (!p || p.level !== l.id || (p.q === h.q && p.r === h.r)) { this.pending = p && p.q === h.q && p.r === h.r ? null : { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
    const e = this.G.edgeOf(p, h);
    if (e < 0) { this.pending = { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
    this.pending = null;
    this.edit(make({ q: p.q, r: p.r }, e));
  }
  edit(ops) {
    if (ops.length > 2000) return this.toast('That is too many changes at once.');
    this.act({ type: 'mapEdit', ops });
    this.refresh();
  }

  // Walls on every edge between a hex in `inside` and one not in it, where there is no wall or door yet.
  #wallAround(inside) {
    const l = this.level(), map = this.S.map, ops = [], done = [];
    const taken = (seg) => done.some((s) => sameSeg({ a: s[0], b: s[1] }, seg)) || map.walls.some((w) => w.level === l.id && sameSeg(w, seg)) ||
      map.objects.some((o) => o.level === l.id && Number.isInteger(o.edge) && sameSeg({ a: this.G.edgeSegment(o.at, o.edge)[0], b: this.G.edgeSegment(o.at, o.edge)[1] }, seg));
    for (const c of inside) {
      const h = Gr.parse(c);
      this.G.DIRS.slice(0, this.G.EDGES).forEach(([dq, dr], e) => {
        if (inside.has(Gr.col({ q: h.q + dq, r: h.r + dr }))) return;
        const seg = this.G.edgeSegment(h, e);
        if (taken(seg)) return;
        done.push(seg); ops.push({ op: 'wall', wall: { level: l.id, a: seg[0], b: seg[1], kind: this.kind } });
      });
    }
    if (!ops.length) return this.toast('It is walled in already.', true);
    this.edit(ops);
  }

  // ---------- drag to paint, erase and mark rooms ----------
  // One stroke is one mapEdit: the hexes crossed are gathered while the finger or mouse moves, and
  // the usual tap code for the tool runs once when it lifts, over all of them.
  #strokeArea() {
    if (!this.stroke) return [];
    const seen = new Map();
    for (const c of this.stroke.hexes.values()) for (const x of this.G.range(c, this.brush)) seen.set(Gr.col(x), x);
    return [...seen.values()];
  }
  #drag() {
    const add = (x, y) => {
      const h = this.R.planeHex(x, y, this.level().z);
      if (!h || this.stroke.hexes.has(Gr.col(h))) return false;
      this.stroke.hexes.set(Gr.col(h), h); return true;
    };
    const show = () => this.R.setHighlights(this.marks());
    return {
      down: (x, y, ev) => {
        if (this.on && this.tool === 'trace' && this.tmode === 'edit' && ev.button !== 2 && !ev.shiftKey) return this.#endDown(x, y);
        if (!this.on || !['paint', 'erase', 'region'].includes(this.tool) || ev.button === 2 || ev.shiftKey) return false;
        this.stroke = { hexes: new Map(), from: [x, y], last: [x, y] };
        add(x, y); return true;
      },
      move: (x, y) => {
        if (this.endDrag) return this.#endMove(x, y);
        if (!this.stroke) return;
        const [x0, y0] = this.stroke.last, n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 6));
        let more = false;
        for (let i = 1; i <= n; i++) more = add(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n) || more;
        this.stroke.last = [x, y];
        if (more) show();
      },
      end: () => {
        if (this.endDrag) return this.#endUp();
        const st = this.stroke; this.stroke = null;
        if (!st) return;
        this.areaOver = this.#strokeAreaOf(st);
        try { this.#tap(...st.from); } finally { this.areaOver = null; }
        show();
      },
      cancel: () => { this.stroke = null; this.endDrag = null; show(); this.refresh(); },
    };
  }
  #strokeAreaOf(st) { const was = this.stroke; this.stroke = st; const a = this.#strokeArea(); this.stroke = was; return a; }

  // ---------- tile height ----------
  // While the Height tool is active every tile of the level shows its height (feet above the level) as a
  // small number, kept over its tile by a frame loop that runs only then.
  #heightNums() {
    const want = this.on && this.tool === 'height' && !!this.S;
    if (!want) { cancelAnimationFrame(this.hRaf); this.hRaf = 0; this.hBox?.remove(); this.hBox = null; this.hKey = ''; return; }
    if (!this.hBox) { this.hBox = document.createElement('div'); this.hBox.id = 'ed-hnums'; $('labels').append(this.hBox); }
    const l = this.level(), tiles = Object.entries(l.tiles).slice(0, 600), sig = `${l.id}|${tiles.map(([k, t]) => `${k}:${t.h ?? 0}`).join(',')}`;
    if (sig !== this.hKey) {
      this.hKey = sig; this.hBox.textContent = '';
      this.hItems = tiles.map(([k, t]) => { const e = document.createElement('i'); e.textContent = String(t.h ?? 0); if (t.h) e.className = t.h > 0 ? 'up' : 'down'; this.hBox.append(e); return { e, hex: { ...Gr.parse(k), z: l.z + (t.h ?? 0) } }; });
    }
    if (this.hRaf) return;
    const tick = () => {
      if (!this.hBox) return void (this.hRaf = 0);
      for (const { e, hex } of this.hItems) { const p = this.R.screenOf(hex); e.style.display = p ? '' : 'none'; if (p) e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; }
      this.hRaf = requestAnimationFrame(tick);
    };
    this.hRaf = requestAnimationFrame(tick);
  }
  static STEP = 2.5;
  #heightTap(h, l) {
    const tile = l.tiles[Gr.col(h)];
    if (!tile) return this.toast('Heights belong to tiles. Paint the floor first.');
    const cur = tile.h ?? 0, to = Math.max(-30, Math.min(60, cur + (this.hmode === 'down' ? -Editor.STEP : Editor.STEP)));
    this.lastH = { level: l.id, q: h.q, r: h.r };
    if (to === cur) return this.toast(`That is as ${to < 0 ? 'low' : 'high'} as a tile goes.`, true);
    const next = { ...tile, h: to };
    if (!to) delete next.h;
    this.edit([{ op: 'tile', level: l.id, at: { q: h.q, r: h.r }, tile: next }]);
  }
  // Tap the foot of the stairs, then the top, in a straight line: the hexes between take even steps.
  #stairsTap(h) {
    const l = this.level(), p = this.pending, map = this.S.map;
    const here = (lv, c) => lv.tiles[Gr.col(c)];
    if (!here(l, h)) return this.toast('Stairs run between tiles. Paint the floor first.');
    if (!p || (p.q === h.q && p.r === h.r && p.level === l.id)) { this.pending = p ? null : { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
    this.pending = null;
    const pl = map.levels.find((x) => x.id === p.level);
    if (!pl || !here(pl, p)) return this.refresh();
    const za = pl.z + (here(pl, p).h ?? 0), zb = l.z + (here(l, h).h ?? 0);
    const run = this.G.straight(p, h), n = this.G.dist(p, h);
    if (!run) return this.toast(this.G.kind === 'square' ? 'Stairs need a straight line of squares: along a row, a column or a diagonal.' : 'Stairs need a straight line of hexes: along one of the three grid directions.');
    if (n < 2) return this.toast('Pick two hexes with at least one between them.');
    if (za === zb) return this.toast('Both ends are the same height, so there is nothing to climb. Raise the top first.');
    const base = za <= zb ? pl : l, foot = za <= zb ? p : h, ops = [];
    const rounded = (z) => Math.round(z / Editor.STEP) * Editor.STEP;
    let worst = 0, prev = za;
    for (let i = 1; i < n; i++) {
      const at = run[i], z = rounded(za + (zb - za) * i / n);
      worst = Math.max(worst, Math.abs(z - prev)); prev = z;
      const off = z - base.z, old = base.tiles[Gr.col(at)] ?? { t: here(base, foot).t };
      const tile = { ...old, h: off }; if (!off) delete tile.h;
      ops.push({ op: 'tile', level: base.id, at, tile });
    }
    worst = Math.max(worst, Math.abs(zb - prev));
    this.edit(ops);
    if (worst > 5) this.toast(`Each step rises ${worst} ft: that is a climb, not stairs. Add hexes or lower the top.`);
    else if (worst > 2.5) this.toast(`Each step rises ${worst} ft: walkable, but Difficult Terrain.`, true);
  }

  // ---------- object properties ----------
  #objectsAt(h, l) {
    const k = Gr.col(h);
    return this.S.map.objects.filter((o) => o.level === l.id && objectHexes(o, this.G).some((x) => Gr.col(x) === k));
  }
  #propsTap(h, l) {
    const P = this.props, map = this.S.map;
    if (P?.pick === 'to') {
      const t = l.tiles[Gr.col(h)];
      if (!t) return this.toast('It has to lead to a tile.');
      this.#readForm(); P.draft.to = { q: h.q, r: h.r, z: l.z + (t.h ?? 0) }; P.pick = null; return this.#renderForm();
    }
    const found = this.#objectsAt(h, l);
    if (P?.pick === 'link') {
      const o = found.find((x) => x.id !== P.id);
      if (!o) return this.toast('Tap another door or thing to link to.');
      this.#readForm(); P.target = o.id; P.pick = null; return this.#renderForm();
    }
    if (!found.length) return this.toast('There is no door or thing on that hex.', true);
    const o = found.find((x) => x.id === P?.id) ? found[(found.findIndex((x) => x.id === P.id) + 1) % found.length] : found[0];   // tapping again on a crowded hex steps through what is there
    this.props = { id: o.id, draft: structuredClone(o), pick: null, target: null };
    this.#renderForm();
  }
  #readForm() {
    const P = this.props, f = $('ed-form');
    if (!P || !f.elements.state) return;
    const d = P.draft, v = (n) => f.elements[n]?.value.trim() ?? '';
    d.state = f.elements.state.value; d.name = v('name'); d.key = v('key');
    d.dc = {};
    for (const el of f.querySelectorAll('[data-dc]')) if (el.value.trim() !== '') d.dc[el.dataset.dc] = Number(el.value);
    P.when = f.elements.when?.value; P.sets = f.elements.sets?.value;
  }
  #renderForm() {
    const f = $('ed-form'), P = this.props, map = this.S.map;
    const o = P && map.objects.find((x) => x.id === P.id);
    if (!o) { this.props = null; f.innerHTML = ''; return this.refresh(); }
    const def = CONTENT.objects[o.def], d = P.draft, opts = (obj, sel) => Object.entries(obj).map(([k, st]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(st.name)}</option>`).join('');
    const target = P.target && map.objects.find((x) => x.id === P.target), tdef = target && CONTENT.objects[target.def];
    const label = (x) => `${CONTENT.objects[x.def].name}${x.name ? ` "${x.name}"` : ''} (${x.id})`;
    // A light source (brazier, campfire) has a state that gives light and one that does not: one button flips between them.
    const lampOn = Object.keys(def.states).find((k) => def.states[k].light), lampOff = Object.keys(def.states).find((k) => !def.states[k].light && !def.states[k].hidden);
    const lamp = lampOn && lampOff ? { on: lampOn, off: lampOff } : null;
    const dcs = [];
    if (def.dc?.find !== undefined || def.find || Object.values(def.states).some((st) => st.hidden)) dcs.push(['find', 'Find DC', def.dc?.find]);
    if (JSON.stringify(def).includes('"save"')) dcs.push(['save', 'Save DC', def.dc?.save]);
    for (const u of def.use ?? []) if (u.check) dcs.push([u.id, `${u.name} DC`, u.check.dc]);
    for (const k of Object.keys(d.dc ?? {})) if (!dcs.some((x) => x[0] === k)) dcs.push([k, `${k} DC`, undefined]);
    const usesKey = (def.use ?? []).some((u) => u.key);
    const links = (d.links ?? []).map((lk, i) => {
      const to = map.objects.find((x) => x.id === lk.object);
      return `<li><span>When ${esc(def.states[lk.when]?.name ?? lk.when)}: ${esc(to ? label(to) : lk.object)} goes ${esc(CONTENT.objects[to?.def]?.states[lk.sets]?.name ?? lk.sets)}</span><button type="button" data-unlink="${i}" aria-label="Remove link">Remove</button></li>`;
    }).join('');
    f.innerHTML = `
      <strong>${esc(label(o))}</strong>
      <label>Starts <select name="state">${opts(def.states, d.state)}</select></label>
      ${lamp ? `<div class="ed-line"><span>Light source: ${d.state === lamp.on ? 'lit' : 'unlit'}</span><button type="button" id="ed-lit">${d.state === lamp.on ? 'Put it out' : 'Light it'}</button></div>` : ''}
      <label>Name <input name="name" maxlength="40" value="${esc(d.name ?? '')}" placeholder="shown to the DM" autocomplete="off"></label>
      ${usesKey ? `<label>Key <input name="key" maxlength="40" value="${esc(d.key ?? '')}" placeholder="name of the item that fits" autocomplete="off"></label>` : ''}
      ${dcs.length ? `<div class="ed-dcs">${dcs.map(([k, t, dflt]) => `<label>${esc(t)} <input type="number" inputmode="numeric" min="1" max="40" step="1" data-dc="${esc(k)}" value="${d.dc?.[k] ?? ''}" placeholder="${dflt ?? ''}"></label>`).join('')}</div>` : ''}
      ${def.connects ? `<div class="ed-line"><span>Leads to ${d.to ? `${d.to.q},${d.to.r} at ${d.to.z} ft` : 'nowhere yet'}</span><button type="button" id="ed-pickto"${P.pick === 'to' ? ' class="sel"' : ''}>${P.pick === 'to' ? 'Tap a tile now' : 'Pick the place'}</button></div>` : ''}
      <div class="ed-links"><span>Links</span><ul>${links || '<li class="none">None. Linking makes another object change when this one does.</li>'}</ul>
        <div class="ed-line"><span>${target ? esc(label(target)) : 'Nothing picked'}</span><button type="button" id="ed-picklink"${P.pick === 'link' ? ' class="sel"' : ''}>${P.pick === 'link' ? 'Tap an object now' : 'Pick an object'}</button></div>
        ${target ? `<div class="ed-line"><label>When this is <select name="when">${opts(def.states, P.when)}</select></label><label>it puts that <select name="sets">${opts(tdef.states, P.sets)}</select></label><button type="button" id="ed-addlink">Add link</button></div>` : ''}
      </div>
      <div class="ed-line"><button type="submit" class="go">Save</button><button type="button" id="ed-closeform">Close</button></div>`;
    if (lamp) f.querySelector('#ed-lit').onclick = () => { this.#readForm(); d.state = d.state === lamp.on ? lamp.off : lamp.on; this.#renderForm(); };
    f.querySelector('#ed-closeform').onclick = () => { this.props = null; f.innerHTML = ''; this.refresh(); };
    for (const b of f.querySelectorAll('[data-unlink]')) b.onclick = () => { this.#readForm(); d.links.splice(+b.dataset.unlink, 1); if (!d.links.length) delete d.links; this.#renderForm(); };
    const pick = (what) => () => { this.#readForm(); P.pick = P.pick === what ? null : what; this.#renderForm(); };
    f.querySelector('#ed-picklink').onclick = pick('link');
    if (def.connects) f.querySelector('#ed-pickto').onclick = pick('to');
    if (target) f.querySelector('#ed-addlink').onclick = () => {
      this.#readForm();
      (d.links ??= []).push({ object: target.id, when: P.when, sets: P.sets });
      P.target = null; this.#renderForm();
    };
    f.scrollIntoView?.({ block: 'nearest' });
    this.refresh();
  }
  #saveForm() {
    const P = this.props;
    if (!P) return;
    this.#readForm();
    const d = P.draft, bad = Object.entries(d.dc ?? {}).find(([, n]) => !Number.isInteger(n) || n < 1 || n > 40);
    if (bad) return this.toast('A DC is a whole number from 1 to 40.');
    const o = { ...d };
    for (const k of ['name', 'key']) if (!o[k]) delete o[k];
    if (!Object.keys(o.dc ?? {}).length) delete o.dc;
    if (!o.links?.length) delete o.links;
    this.edit([{ op: 'object', object: o }]);
  }

  // ---------- the pieces of the toolbar that the first editor left out ----------
  #buildMore() {
    const opts = $('ed-opts');
    opts.insertAdjacentHTML('beforeend', `
      <div class="ed-row" data-for="region"><span id="ed-rstate"></span><button type="button" id="ed-reveal">Show to players</button></div>
      <div class="ed-row" data-for="height" id="ed-hmode"><button type="button" data-hm="up">Raise 2.5 ft</button><button type="button" data-hm="down">Lower 2.5 ft</button><button type="button" data-hm="stairs">Stairs</button></div>
      <div class="ed-row" data-for="height" id="ed-hread"></div>
      <form class="ed-form" data-for="props" id="ed-form" novalidate></form>`);
    $('ed-hmode').onclick = (ev) => { const b = ev.target.closest('[data-hm]'); if (b) { this.hmode = b.dataset.hm; this.pending = null; this.refresh(); } };
    $('ed-form').onsubmit = (ev) => { ev.preventDefault(); this.#saveForm(); };
    $('ed-reveal').onclick = () => {
      const room = this.S.map.regions.find((r) => r.id === this.region);
      if (room) { this.act({ type: 'revealRegion', region: room.id, revealed: !room.revealed }); this.refresh(); }
    };
  }
  #syncMore(room) {
    $('ed-reveal').disabled = !room;
    $('ed-reveal').textContent = room?.revealed ? 'Hide it again' : 'Show to players';
    $('ed-rstate').textContent = room ? (room.revealed ? 'Players can see this room.' : 'Hidden from players.') : 'Name a room to start one.';
    for (const b of $('ed-hmode').children) b.classList.toggle('sel', b.dataset.hm === this.hmode);
    const lv = this.lastH && this.S.map.levels.find((x) => x.id === this.lastH.level), t = lv?.tiles[`${this.lastH.q},${this.lastH.r}`];
    $('ed-hread').textContent = t ? `Tile ${this.lastH.q},${this.lastH.r}: ${t.h ?? 0} ft above its level, ${lv.z + (t.h ?? 0)} ft up in all` : 'Height: tap a tile to see it here.';
    if (this.tool !== 'props' && this.props) { this.props = null; $('ed-form').innerHTML = ''; }
    else if (this.props && !this.S.map.objects.some((o) => o.id === this.props.id)) { this.props = null; $('ed-form').innerHTML = ''; }
    if (this.tool === 'height' && this.hmode === 'stairs') $('ed-hint').textContent = this.pending ? this.say('Now tap the hex at the top of the stairs.') : this.hint('stairs');
    else if (this.tool === 'height') $('ed-hint').textContent = this.hint('height');
    this.#heightNums();
    if (this.tool === 'props') $('ed-hint').textContent = this.props?.pick === 'to' ? 'Tap the tile it leads to (change level first if it goes up or down).' : this.props?.pick === 'link' ? 'Tap the other object.' : this.hint('props');
  }

  // ---------- trace: walls and doors drawn over the picture ----------
  // Walls are free line segments in feet, so nothing here snaps to hexes. Every gesture is one mapEdit.
  #pieces(l) {         // everything on this level that is a line: walls and traced doors
    const map = this.S.map, out = [];
    for (const w of map.walls) if (w.level === l.id) out.push({ type: 'wall', id: w.id, a: w.a, b: w.b, item: w });
    for (const o of map.objects) { const seg = o.level === l.id && (o.seg || Number.isInteger(o.edge)) && objectSegment(o, this.G); if (seg) out.push({ type: 'object', id: o.id, a: seg[0], b: seg[1], item: o }); }
    return out;
  }
  #px(p, l) { return this.R.screenPoint(p[0], p[1], l.z); }
  #near(p, l, px, py, r = 20) { const s = this.#px(p, l); return !!s && Math.hypot(s.x - px, s.y - py) <= r; }
  // A tapped point on the floor, pulled to a nearby wall end (so corners meet) or rounded to the snap step.
  #snapPoint(p, l, px, py, skip = () => false) {
    let best = null, bd = 18;
    const ends = [...this.#pieces(l).filter((x) => !skip(x)).flatMap((x) => [x.a, x.b]), ...this.traceLine];
    for (const e of ends) { const s = this.#px(e, l); if (!s) continue; const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = e; } }
    if (best) return [...best];
    if (this.snap === 'grid' && this.G.kind === 'square') return this.#gridSnap(p, l, px, py);
    const k = Number(this.snap) || 0.01;
    return [Math.round(p[0] / k) * k, Math.round(p[1] / k) * k].map((n) => Math.round(n * 100) / 100);
  }
  // On squares: a point near a corner goes to the corner (the grid's lines cross at 2.5 ft plus a multiple of 5);
  // near a side it goes onto the side's line, and along it to a multiple of 2.5 ft (a corner or the middle of a side);
  // anywhere else it is rounded to 1 ft.
  #gridSnap(p, l, px, py) {
    const g = (v) => 2.5 + 5 * Math.round((v - 2.5) / 5), r2 = (n) => Math.round(n * 100) / 100, far = (q) => { const s = this.#px(q, l); return s ? Math.hypot(s.x - px, s.y - py) : Infinity; };
    const corner = [g(p[0]), g(p[1])], onX = [g(p[0]), Math.round(p[1] / 2.5) * 2.5], onY = [Math.round(p[0] / 2.5) * 2.5, g(p[1])];
    if (far(corner) <= 16) return corner;
    const dx = far([g(p[0]), p[1]]), dy = far([p[0], g(p[1])]);
    if (Math.min(dx, dy) <= 14) return dx <= dy ? onX : onY;
    return [r2(Math.round(p[0])), r2(Math.round(p[1]))];
  }
  #traceTap(px, py) {
    const l = this.level();
    if (!l.image) return this.toast('Set a background picture first (Levels tool).');
    const p = this.R.planePoint(px, py, l.z);
    if (!p) return;
    if (this.tmode === 'edit') return this.#pickPiece(px, py, l);
    const q = this.#snapPoint(p, l, px, py), line = this.traceLine;
    if (this.tmode === 'door') {
      if (!line.length) { line.push(q); return this.refresh(); }
      return this.#placeDoor(l, line.pop(), q);
    }
    if (line.length && this.#near(line.at(-1), l, px, py)) return this.#finishLine();
    if (line.length > 2 && this.#near(line[0], l, px, py)) { line.push([...line[0]]); return this.#finishLine(); }
    line.push(q);
    this.refresh();
  }
  #finishLine() {
    const l = this.level(), line = this.traceLine, ops = [];
    for (let i = 1; i < line.length; i++) if (Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) >= 0.5) ops.push({ op: 'wall', wall: { level: l.id, a: line[i - 1], b: line[i], kind: this.kind } });
    this.traceLine = [];
    if (!ops.length) { this.refresh(); return this.toast('A wall needs two points apart.', true); }
    this.edit(ops);
  }
  // The hex a traced door belongs to is the one nearest its middle; it needs a floor tile, so one is added if it is missing.
  #doorAt(mid, l) { const at = this.G.cell(mid[0], mid[1]); return { at: { q: at.q, r: at.r }, tile: l.tiles[Gr.col(at)] ? null : { op: 'tile', level: l.id, at: { q: at.q, r: at.r }, tile: { t: 'stone' } } }; }
  // What a traced door stands on: on squares, a line that is exactly one side of a square is that side (`edge`, as a door placed by
  // tapping squares); any other line stays a line (`seg`).
  #doorPlace(a, b, l) {
    if (this.G.kind === 'square') {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cand = [];
      if (same([a[0], 0], [b[0], 0])) cand.push({ q: (a[0] - 2.5) / 5, r: Math.round(mid[1] / 5), e: 0 });                 // a line up and down: the east side of the square to its west
      if (same([0, a[1]], [0, b[1]])) cand.push({ q: Math.round(mid[0] / 5), r: (a[1] - 2.5) / 5, e: 3 });                 // a line across: the south side of the square to its north
      for (const c of cand) {
        const at = { q: Math.round(c.q), r: Math.round(c.r) };
        if (Math.abs(c.q - at.q) > 1e-6 || Math.abs(c.r - at.r) > 1e-6) continue;
        const side = this.G.edgeSegment(at, c.e);
        if (!sameSeg({ a: a, b: b }, side)) continue;
        const to = { q: at.q + this.G.DIRS[c.e][0], r: at.r + this.G.DIRS[c.e][1] }, has = (h) => l.tiles[Gr.col(h)];
        const [on, edge] = has(at) || !has(to) ? [at, c.e] : [to, this.G.edgeOf(to, at)];       // a door stands on a tile of its level
        return { at: on, edge, tile: has(on) ? null : { op: 'tile', level: l.id, at: on, tile: { t: 'stone' } } };
      }
    }
    const { at, tile } = this.#doorAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l);
    return { at, seg: { a, b }, tile };
  }
  #placeDoor(l, a, b) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { this.refresh(); return this.toast('A door needs two points at least 1 ft apart.', true); }
    const { tile, ...where } = this.#doorPlace(a, b, l);
    this.edit([...(tile ? [tile] : []), { op: 'object', object: { def: this.tdef, level: l.id, ...where } }]);
  }
  #pickPiece(px, py, l) {
    let best = null, bd = 18;
    for (const x of this.#pieces(l)) {
      const a = this.#px(x.a, l), b = this.#px(x.b, l); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len)) : 0;
      const d = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
      if (d < bd) { bd = d; best = x; }
    }
    this.sel = best && { type: best.type, id: best.id };
    this.refresh();
    if (!best) this.toast('No wall or door there.', true);
  }
  #selected(l) { return this.sel && this.#pieces(l).find((x) => x.type === this.sel.type && x.id === this.sel.id); }
  // Dragging a wall end: every piece that meets at that point moves with it.
  #endDown(px, py) {
    const l = this.level(), p = this.R.planePoint(px, py, l.z);
    if (!l.image || !p) return false;
    const sel = this.#selected(l);
    let best = null, bd = 22;
    for (const x of this.#pieces(l)) for (const end of ['a', 'b']) {
      const s = this.#px(x[end], l); if (!s) continue;
      const d = Math.hypot(s.x - px, s.y - py) - (sel && x.id === sel.id && x.type === sel.type ? 4 : 0);       // a tie goes to the picked piece
      if (d < bd) { bd = d; best = x[end]; }
    }
    if (!best) return false;
    const same = (q) => Math.abs(q[0] - best[0]) < 1e-6 && Math.abs(q[1] - best[1]) < 1e-6;
    const members = this.#pieces(l).flatMap((x) => ['a', 'b'].filter((e) => same(x[e])).map((end) => ({ ...x, end })));
    this.endDrag = { from: [px, py], to: null, members, start: best, moved: false };
    return true;
  }
  #endMove(px, py) {
    const d = this.endDrag, l = this.level(), p = this.R.planePoint(px, py, l.z);
    if (!d || !p) return;
    if (!d.moved && Math.hypot(px - d.from[0], py - d.from[1]) < 8) return;
    d.moved = true;
    d.to = this.#snapPoint(p, l, px, py, (x) => d.members.some((m) => m.type === x.type && m.id === x.id));
    const m = d.members[0];
    this.R.setPins([m[m.end === 'a' ? 'b' : 'a'], d.to], l.z);
  }
  #endUp() {
    const d = this.endDrag; this.endDrag = null;
    const l = this.level();
    if (!d.moved || !d.to) { this.#pickPiece(...d.from, l); return; }
    const ops = [];
    for (const m of d.members) {
      const a = m.end === 'a' ? d.to : m.a, b = m.end === 'b' ? d.to : m.b;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) { this.refresh(); return this.toast('That would make it too short.', true); }
      if (m.type === 'wall') ops.push({ op: 'wall', wall: { ...m.item, a, b } });
      else { const { tile, ...where } = this.#doorPlace(a, b, l), { edge, seg, ...rest } = m.item; if (tile) ops.push(tile); ops.push({ op: 'object', object: { ...rest, ...where } }); }
    }
    this.sel = { type: d.members[0].type, id: d.members[0].id };
    this.edit(ops);
  }
  #deleteSelected() {
    const x = this.#selected(this.level());
    if (!x) return;
    this.sel = null;
    this.edit([x.type === 'wall' ? { op: 'unwall', id: x.id } : { op: 'unobject', id: x.id }]);
  }
  // Lay stone on every hex whose centre is inside the picture and has no tile yet: one edit.
  #fillFloor() {
    const l = this.level(), img = l.image;
    if (!img) return this.toast('Set a background picture first (Levels tool).');
    const [ox, oy] = img.origin, [fw, fh] = img.feet, ops = [], sq = this.G.kind === 'square', m = sq ? 2.5 - 0.01 : 0;
    // On squares: every square that lies wholly on the picture (its centre is 2.5 ft in from the picture's edge), so a margin round the grid stays bare.
    for (const { q, r } of this.G.cellsIn(ox + m, oy + m, ox + fw - m, oy + fh - m)) if (!l.tiles[Gr.col({ q, r })]) ops.push({ op: 'tile', level: l.id, at: { q, r }, tile: { t: 'stone' } });
    if (!ops.length) return this.toast(sq ? 'Every square on the picture has a floor already.' : 'Every hex under the picture has a floor already.', true);
    if (ops.length > 2000) return this.toast(`That needs ${ops.length} hexes and one edit takes at most 2000. Shrink the picture's scale or paint the floor in parts.`);
    this.edit(ops);
    this.toast(`Laid ${ops.length} stone hexes.`, true);
  }
  #buildTrace() {
    const doors = Object.values(CONTENT.objects).filter((o) => o.kind === 'door');
    $('ed-opts').insertAdjacentHTML('beforeend', `
      <div class="ed-row" data-for="trace" id="ed-tmodes"><button type="button" data-tmode="wall">Wall</button><button type="button" data-tmode="door">Door</button><button type="button" data-tmode="edit">Edit</button></div>
      <div class="ed-row" data-for="trace" data-tm="door"><select id="ed-tdef" aria-label="Which door">${doors.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></div>
      <div class="ed-row" data-for="trace" id="ed-tbtns">
        <select id="ed-snap" aria-label="Round points to" data-tm="wall door"></select>
        <button type="button" id="ed-tdone" data-tm="wall">Done</button><button type="button" id="ed-tback" data-tm="wall door">Back</button>
        <button type="button" id="ed-tdel" data-tm="edit">Delete</button>
        <button type="button" id="ed-fill">Fill floor</button><span id="ed-tread"></span></div>`);
    $('ed-tmodes').onclick = (ev) => { const b = ev.target.closest('[data-tmode]'); if (b) { this.tmode = b.dataset.tmode; this.traceLine = []; this.sel = null; this.refresh(); } };
    $('ed-tdef').onchange = (ev) => { this.tdef = ev.target.value; this.traceLine = []; this.refresh(); };
    $('ed-snap').onchange = (ev) => { this.snap = ev.target.value === 'grid' ? 'grid' : Number(ev.target.value); };
    $('ed-tdone').onclick = () => this.#finishLine();
    $('ed-tback').onclick = () => { this.traceLine.pop(); this.refresh(); };
    $('ed-tdel').onclick = () => this.#deleteSelected();
    $('ed-fill').onclick = () => this.#fillFloor();
  }
  #syncTrace(l) {
    const on = this.tool === 'trace';
    if (on) {
      for (const el of $('ed-opts').querySelectorAll('[data-tm]')) el.hidden = !el.dataset.tm.split(' ').includes(this.tmode);
      for (const b of $('ed-tmodes').children) b.classList.toggle('sel', b.dataset.tmode === this.tmode);
      $('ed-tdef').value = this.tdef;
      const sq = this.G.kind === 'square', rounds = [['0', 'No rounding'], ['1', 'Round to 1 ft'], ['2.5', 'Round to 2.5 ft'], ['5', 'Round to 5 ft']];
      this.#options($('ed-snap'), sq ? [['grid', 'Snap to the grid'], ...rounds] : rounds, String(this.snap));
      if (this.sel && !this.#selected(l)) this.sel = null;
      $('ed-tdone').disabled = this.traceLine.length < 2; $('ed-tback').disabled = !this.traceLine.length;
      $('ed-tdel').disabled = !this.sel;
      $('ed-fill').disabled = !l.image;
      const x = this.#selected(l);
      $('ed-tread').textContent = x ? `${x.type === 'wall' ? x.item.kind : CONTENT.objects[x.item.def]?.name}, ${Math.round(Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]) * 10) / 10} ft` : '';
      $('ed-hint').textContent = !l.image ? 'Trace works over a picture. Set one under Levels first.' : this.pending ? $('ed-hint').textContent : this.hint(`trace_${this.tmode}`);
    }
    // The marks on the floor: the line being drawn or the piece picked; amber bars where a wall stops a step.
    let pins = [];
    if (this.scaling) pins = this.scaling.pts;
    else if (on) { const x = this.#selected(l); pins = this.tmode === 'edit' ? (x ? [x.a, x.b] : []) : this.traceLine; }
    const bars = on && l.image ? this.#stepBars(l) : [];
    const sig = JSON.stringify([pins, l.z, this.endDrag?.to]);
    if (this.on && sig !== this.pinSig && !this.endDrag) { this.pinSig = sig; this.R.setPins(pins, l.z); }
    const bsig = `${l.id}|${l.z}|${bars.length}|${bars[0]}|${bars.at(-1)}`;
    if (this.on && bsig !== this.barSig) { this.barSig = bsig; this.R.setBars(bars, l.z); }
  }
  // Every step between neighbouring tiles of the level that a wall or shut door stops.
  #stepBars(l) {
    const map = this.S.map, key = `${barriers(map).sig}|${l.id}|${Object.keys(l.tiles).length}`;
    if (this.barCache?.key === key) return this.barCache.bars;
    const B = barriers(map), bars = [];
    for (const k of Object.keys(l.tiles)) {
      const h = Gr.parse(k);
      for (let e = 0; e < this.G.EDGES / 2; e++) {
        const n = { q: h.q + this.G.DIRS[e][0], r: h.r + this.G.DIRS[e][1] };
        if (!l.tiles[Gr.col(n)] || !B.blocked(l.id, h, n, 'move')) continue;
        bars.push([...this.G.center(h), ...this.G.center(n)]);
      }
    }
    this.barCache = { key, bars };
    return bars;
  }

  // ---------- a level's background picture ----------
  // The picture is an asset (the table's file store, or this browser's in solo play) named by
  // `level.image: { asset, feet: [w, h], origin: [x, y] }`. Every change is one `level` edit.
  #buildBackground() {
    $('ed-opts').insertAdjacentHTML('beforeend', `
      <div class="ed-row" data-for="level" id="ed-bg"><span id="ed-bgstate"></span>
        <button type="button" id="ed-setbg">Set background</button><select id="ed-bgpick" aria-label="Use a picture already uploaded"></select>
        <input type="file" id="ed-bgfile" accept="image/png,image/jpeg,image/webp" hidden></div>
      <div class="ed-row" data-for="level" id="ed-bgscale"><button type="button" id="ed-scale">Set scale</button>
        <span id="ed-scalehint"></span>
        <span id="ed-scaleask" hidden><input id="ed-dist" type="number" inputmode="decimal" min="0.1" step="any" class="feet" aria-label="Distance between the two points in feet" placeholder="feet"> ft
          <button type="button" id="ed-scaleok">Apply</button></span></div>
      <div class="ed-row" data-for="level" id="ed-bgalign"><button type="button" id="ed-align">Align to grid</button>
        <span id="ed-alignhint"></span>
        <span id="ed-alignask" hidden>across <input id="ed-acols" type="number" inputmode="numeric" min="0" step="1" value="1" class="feet" aria-label="Squares between the two points, across"> down <input id="ed-arows" type="number" inputmode="numeric" min="0" step="1" value="1" class="feet" aria-label="Squares between the two points, down">
          <button type="button" id="ed-alignok">Apply</button></span></div>
      <div class="ed-row" data-for="level" id="ed-bgpix"><label class="check">Pixels a square <input id="ed-ppsq" type="number" inputmode="decimal" min="4" step="any" class="feet" placeholder="140" aria-label="Pixels across one square of the picture"></label>
        <button type="button" id="ed-ppsqok">Use</button><button type="button" id="ed-lines">Find the lines</button></div>
      <div class="ed-row" data-for="level" id="ed-bgnudge"><span>Nudge</span>
        <button type="button" data-nudge="left" aria-label="Nudge left">&larr;</button><button type="button" data-nudge="up" aria-label="Nudge up">&uarr;</button><button type="button" data-nudge="down" aria-label="Nudge down">&darr;</button><button type="button" data-nudge="right" aria-label="Nudge right">&rarr;</button>
        <select id="ed-nudgestep" aria-label="How far"><option value="1">1 ft</option><option value="5">5 ft</option><option value="0.25">3 in</option><option value="0.05">0.05 ft</option></select>
        <button type="button" id="ed-clearbg">Clear background</button></div>`);
    $('ed-setbg').onclick = () => $('ed-bgfile').click();
    $('ed-bgfile').onchange = async (ev) => {
      const f = ev.target.files[0]; ev.target.value = '';
      const store = this.assets?.();
      if (!f) return;
      if (!store) return this.toast('There is nowhere to keep the picture.');
      try { await this.#useAsset((await store.upload(f)).id); this.#listPictures(); } catch (err) { this.toast(err.message); }
    };
    $('ed-bgpick').onchange = async (ev) => { const id = ev.target.value; ev.target.value = ''; if (id) try { await this.#useAsset(id); } catch (err) { this.toast(err.message); } };
    $('ed-scale').onclick = () => { this.scaling = this.scaling ? null : { pts: [] }; this.pending = null; this.refresh(); };
    $('ed-scaleok').onclick = () => this.#applyScale();
    $('ed-align').onclick = () => { this.scaling = this.scaling ? null : { pts: [], align: true }; this.pending = null; this.refresh(); };
    $('ed-alignok').onclick = () => this.#applyAlign();
    $('ed-ppsqok').onclick = () => this.#applyPixels();
    $('ed-lines').onclick = () => this.#findLines();
    $('ed-dist').onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); this.#applyScale(); } };
    $('ed-bgnudge').onclick = (ev) => { const b = ev.target.closest('[data-nudge]'); if (b) this.#nudge(b.dataset.nudge); };
    $('ed-clearbg').onclick = (ev) => this.#sure(ev.currentTarget, () => { this.scaling = null; this.edit([{ op: 'level', level: { id: this.level().id, image: null } }]); });
  }
  // The pictures already in the store, to pick from (a handout's picture, an earlier upload).
  async #listPictures() {
    const store = this.assets?.(), sel = $('ed-bgpick');
    let list = [];
    try { list = store ? (await store.list()).assets.filter((a) => a.kind === 'image') : []; } catch { /* a player's table, or no store: only upload is offered */ }
    sel.innerHTML = `<option value="">Use an uploaded picture…</option>${list.map((a) => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('')}`;
    sel.hidden = !list.length;
  }
  // Lay the picture on the level, centred on the middle of the map, at 70 pixels to a 5 ft square until the DM sets the scale.
  async #useAsset(id) {
    const store = this.assets();
    const img = new Image();
    img.src = await store.url(id);
    await img.decode().catch(() => { throw new Error('That picture could not be read.'); });
    const fw = Math.max(5, Math.min(90000, Math.round((img.naturalWidth / 70) * 5 * 100) / 100)), fh = Math.max(5, Math.min(90000, Math.round((img.naturalHeight / 70) * 5 * 100) / 100));
    this.scaling = null;
    this.edit([{ op: 'level', level: { id: this.level().id, image: { asset: id, feet: [fw, fh], origin: [Math.round((-fw / 2) * 100) / 100, Math.round((-fh / 2) * 100) / 100] } } }]);
    this.toast('Background set. Use Set scale to match it to the grid.', true);
  }
  #scaleTap(px, py) {
    const l = this.level(), p = this.R.planePoint(px, py, l.z);
    if (!p) return;
    if (this.scaling.pts.length >= 2) this.scaling.pts = [];
    this.scaling.pts.push(p);
    $('ed-dist').value = '';
    this.refresh();
    if (this.scaling.pts.length === 2) $('ed-dist').focus?.({ preventScroll: true });
  }
  #applyScale() {
    const l = this.level(), img = l.image, pts = this.scaling?.pts ?? [];
    if (!img || pts.length < 2) return;
    const [p, q] = pts, gap = Math.hypot(q[0] - p[0], q[1] - p[1]), want = Number($('ed-dist').value);
    if (!(want > 0)) return this.toast('Type the distance between the two points, in feet.');
    if (gap < 0.5) return this.toast('Those two points are too close together. Tap two points far apart.');
    const k = want / gap, r2 = (n) => Math.round(n * 100) / 100, feet = [r2(img.feet[0] * k), r2(img.feet[1] * k)];
    if (feet.some((n) => !(n >= 1 && n <= 100000))) return this.toast('That would make the picture too big or too small.');
    const origin = [r2(p[0] + (img.origin[0] - p[0]) * k), r2(p[1] + (img.origin[1] - p[1]) * k)];     // the first point stays where it is
    this.scaling = null;
    this.edit([{ op: 'level', level: { id: l.id, image: { ...img, feet, origin } } }]);
    this.toast(`The picture is now ${feet[0]} by ${feet[1]} ft.`, true);
  }
  // ---------- align a picture's square grid to the map's ----------
  // The map's squares have corners at 2.5 ft plus a multiple of 5 (a square is centred on 5q, 5r). Three ways to put a picture's
  // drawn squares on them: Align (two corners and how many squares apart), Use (pixels to a square) and Find the lines (read the
  // picture's own lines). Each ends as one `level` edit that sets the picture's `feet` and `origin`.
  static GRID = (v) => 2.5 + 5 * Math.round((v - 2.5) / 5);
  #r3 = (n) => Math.round(n * 1000) / 1000;
  async #pictureData(img, cap = 3000) {
    const store = this.assets?.();
    if (!store) throw new Error('There is nowhere to read the picture from.');
    const el = new Image();
    el.src = await store.url(img.asset);
    await el.decode().catch(() => { throw new Error('That picture could not be read.'); });
    const w0 = el.naturalWidth, h0 = el.naturalHeight, sc = Math.min(1, cap / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(el, 0, 0, w, h);
    return { w0, h0, w, h, rgba: g.getImageData(0, 0, w, h).data };
  }
  // Where the lines of a grid lie in a picture, given roughly how many pixels a square is across (`want`, within 12%). Looks at
  // how strongly the picture changes along each row and column, folds that at every period near `want`, and keeps the period and
  // the place where the lines stack up best. Returns the period and the first line (picture pixels, both axes), or null.
  static LINES(pic, want) {
    const { w, h, rgba } = pic, lum = new Float32Array(w * h);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = 0.3 * rgba[j] + 0.59 * rgba[j + 1] + 0.11 * rgba[j + 2];
    const cx = new Float64Array(w), cy = new Float64Array(h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      cx[x] += Math.abs(lum[i + 1] - lum[i - 1]); cy[y] += Math.abs(lum[i + w] - lum[i - w]);
    }
    const smooth = (c) => { const o = new Float64Array(c.length), k = 2; for (let i = 0; i < c.length; i++) { let t = 0, n = 0; for (let d = -k; d <= k; d++) if (c[i + d] !== undefined) { t += c[i + d]; n++; } o[i] = t / n; } return o; };
    const axis = (raw) => {
      const c = smooth(raw), L = c.length, mean = c.reduce((a, b) => a + b, 0) / L;
      const at = (pos) => { const f = pos - 0.5, i = Math.floor(f); if (i < 0 || i + 1 >= L) return 0; const t = f - i; return c[i] * (1 - t) + c[i + 1] * t; };
      const score = (p, ph) => { let t = 0, n = 0; for (let x = ph; x < L; x += p) { t += at(x); n++; } return n ? t / n : 0; };
      let best = { s: -1 };
      for (let p = want * 0.88; p <= want * 1.12; p += Math.max(0.05, want * 0.0007)) for (let ph = 0; ph < p; ph += 0.5) { const s = score(p, ph); if (s > best.s) best = { s, p, ph }; }
      const c0 = best;
      for (let p = c0.p - 0.15; p <= c0.p + 0.15; p += 0.01) for (let ph = c0.ph - 0.6; ph <= c0.ph + 0.6; ph += 0.05) { const q = ((ph % p) + p) % p, s = score(p, q); if (s > best.s) best = { s, p, ph: q }; }
      return { ...best, ratio: best.s / (mean || 1) };
    };
    const X = axis(cx), Y = axis(cy);
    if (X.ratio < 2 || Y.ratio < 2 || Math.abs(X.p - Y.p) > 0.01 * Math.max(X.p, Y.p)) return null;       // no clear lines, or two different spacings
    return { p: (X.p + Y.p) / 2, x: X.ph, y: Y.ph, ratio: Math.min(X.ratio, Y.ratio) };
  }
  // The picture with its scale set so a square of the picture is a square of the map, and its first lines moved onto the nearest
  // lines of the map. `pxPerSquare` is in the picture's own pixels; `line` is where a vertical and a horizontal line are.
  #fitted(img, pic, pxPerSquare, line) {
    const f = 5 / pxPerSquare, feet = [pic.w0 * f, pic.h0 * f];
    const near = (o, ph) => Editor.GRID(o + ph * f) - ph * f;          // the origin that puts the picture's line at `ph` on the grid, nearest to where the picture is
    return { ...img, feet: feet.map(this.#r3), origin: [this.#r3(near(img.origin[0], line[0])), this.#r3(near(img.origin[1], line[1]))] };
  }
  async #applyAlign() {
    const l = this.level(), img = l.image, pts = this.scaling?.pts ?? [];
    if (!img || pts.length < 2 || this.busy) return;
    const [p, q] = pts, cols = Number($('ed-acols').value), rows = Number($('ed-arows').value), dx = Math.abs(q[0] - p[0]), dy = Math.abs(q[1] - p[1]);
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 0 || rows < 0 || cols + rows === 0) return this.toast('Type how many squares apart the two corners are, across and down: whole numbers.');
    if ((cols && dx < 1) || (rows && dy < 1) || (!cols && dx > 2.5) || (!rows && dy > 2.5)) return this.toast('The counts do not fit the two corners you tapped. Tap the corners again.');
    if (cols && rows && Math.abs((5 * cols) / dx / ((5 * rows) / dy) - 1) > 0.2) return this.toast('Across and down do not agree with the picture: check the counts, or tap the corners again.');
    const k = (5 * (cols + rows)) / ((cols ? dx : 0) + (rows ? dy : 0));
    const feet = img.feet.map((n) => n * k);
    if (feet.some((n) => !(n >= 5 && n <= 100000))) return this.toast('That would make the picture too big or too small.');
    // After the scale the first tap is still where it was; it is a corner, so it goes onto the nearest corner of the map.
    let next = { ...img, feet: feet.map(this.#r3), origin: [0, 1].map((c) => this.#r3(p[c] + (img.origin[c] - p[c]) * k + Editor.GRID(p[c]) - p[c])) }, said = 'Aligned by the two corners.';
    this.busy = true; this.refresh();
    try { const r = await this.#refine(next); if (r) { next = r.img; said = r.said; } else said += ' The picture\'s own lines were not clear enough to fit finer: nudge it if it is off.'; }
    catch (err) { said += ` (${err.message})`; }
    finally { this.busy = false; }
    this.scaling = null;
    this.edit([{ op: 'level', level: { id: l.id, image: next } }]);
    this.toast(said, true);
  }
  // Reads the picture's lines near its current scale and fits to them: { img, said } or null.
  async #refine(img) {
    const pic = await this.#pictureData(img), want = pic.w / (img.feet[0] / 5);        // pixels (of the read copy) a square is now
    const L = Editor.LINES(pic, want);
    if (!L) return null;
    const back = pic.w0 / pic.w, ppsq = L.p * back;
    return { img: this.#fitted(img, pic, ppsq, [L.x * back, L.y * back]), said: `Aligned to the picture's lines: ${Math.round(ppsq * 100) / 100} pixels a square.` };
  }
  async #findLines() {
    const l = this.level(), img = l.image;
    if (!img || this.busy) return;
    this.busy = true; this.refresh();
    try {
      const r = await this.#refine(img);
      if (!r) return this.toast('Could not find clear grid lines near this scale. Use Align to grid, or type the pixels a square, then nudge.');
      this.edit([{ op: 'level', level: { id: l.id, image: r.img } }]);
      this.toast(r.said, true);
    } catch (err) { this.toast(err.message); }
    finally { this.busy = false; this.refresh(); }
  }
  // The pixels a square takes in the picture are known (a map maker says "140 pixels to a square"): the scale is then exact.
  async #applyPixels() {
    const l = this.level(), img = l.image, ppsq = Number($('ed-ppsq').value);
    if (!img || this.busy) return;
    if (!(ppsq >= 4 && ppsq <= 2000)) return this.toast('Type how many pixels across one square is in the picture, 4 or more.');
    this.busy = true; this.refresh();
    try {
      const pic = await this.#pictureData(img, 64), f = 5 / ppsq, feet = [pic.w0 * f, pic.h0 * f];
      if (feet.some((n) => !(n >= 5 && n <= 100000))) throw new Error('That would make the picture too big or too small.');
      // The picture's middle stays where it is; Find the lines or the nudge buttons then put the lines on the squares.
      const mid = [0, 1].map((c) => img.origin[c] + img.feet[c] / 2);
      let next = { ...img, feet: feet.map(this.#r3), origin: [0, 1].map((c) => this.#r3(mid[c] - feet[c] / 2)) }, said = `Scale set: ${ppsq} pixels a square.`;
      try { const r = await this.#refine(next); if (r) { next = r.img; said = r.said; } else said += ' Use Find the lines or nudge the picture onto the squares.'; } catch { /* the scale is set; the lines are for the DM */ }
      this.edit([{ op: 'level', level: { id: l.id, image: next } }]);
      this.toast(said, true);
    } catch (err) { this.toast(err.message); }
    finally { this.busy = false; this.refresh(); }
  }
  #nudge(dir) {
    const l = this.level(), img = l.image;
    if (!img) return;
    const step = Number($('ed-nudgestep').value) || 1, ax = this.R.screenAxes(), s = { left: [ax.right, -1], right: [ax.right, 1], up: [ax.up, 1], down: [ax.up, -1] }[dir];
    const origin = [Math.round((img.origin[0] + s[0][0] * s[1] * step) * 100) / 100, Math.round((img.origin[1] + s[0][1] * s[1] * step) * 100) / 100];
    this.edit([{ op: 'level', level: { id: l.id, image: { ...img, origin } } }]);
  }
  #syncBackground(l) {
    const img = l.image;
    $('ed-bgstate').textContent = img ? `Picture ${img.feet[0]} by ${img.feet[1]} ft${this.R.hasPicture(l.id) ? '' : ' (not loaded)'}` : 'No background picture.';
    $('ed-setbg').textContent = img ? 'Change background' : 'Set background';
    const sq = this.G.kind === 'square';
    $('ed-bgscale').hidden = sq || this.tool !== 'level'; $('ed-bgalign').hidden = $('ed-bgpix').hidden = !sq || this.tool !== 'level';       // squares are aligned to the picture's grid; hexes are scaled by a distance
    for (const id of ['ed-scale', 'ed-clearbg', 'ed-align', 'ed-ppsqok', 'ed-lines']) $(id).disabled = !img || (this.busy && id !== 'ed-clearbg');
    $('ed-align').classList.toggle('sel', !!this.scaling?.align); $('ed-scale').classList.toggle('sel', !!this.scaling && !this.scaling.align);
    for (const b of $('ed-bgnudge').querySelectorAll('[data-nudge]')) b.disabled = !img;
    if (!img) this.scaling = null;
    const n = this.scaling?.pts.length ?? 0, al = !!this.scaling?.align;
    $('ed-scalehint').textContent = this.scaling && !al ? (n < 2 ? `Tap ${n ? 'the second' : 'the first'} point of a distance you know.` : 'Type the distance between them.') : '';
    $('ed-scaleask').hidden = n < 2 || al;
    $('ed-alignhint').textContent = al ? (n < 2 ? `Tap ${n ? 'the second' : 'the first'} corner.` : 'Type how many squares apart they are.') : '';
    $('ed-alignask').hidden = n < 2 || !al;
    if (this.tool === 'level' && this.scaling) $('ed-hint').textContent = al
      ? (n < 2 ? 'Tap a corner of a square on the picture, where two of its lines cross. Then tap another corner as far from it as you can (the far end of the grid is best).' : 'Type how many squares apart the corners are, across and down, and Apply. The editor then fits its squares to the picture.')
      : (n < 2 ? 'Tap two points on the picture that are a known distance apart (the ends of a 30 ft room, say).' : 'Now type how many feet apart they are, and Apply.');
    else if (this.tool === 'level' && sq && img) $('ed-hint').textContent = 'Align to grid: tap two corners of the picture\'s squares. Or type its pixels a square and Use, then Find the lines. Nudge to finish by eye.';
  }

  // ---------- map files ----------
  // A blank map on the grid the DM picked: 7 hexes across, or a block of 7 by 7 squares.
  blank(grid = 'hex') {
    const tiles = {}, G = Gr.gridOf({ grid });
    for (const h of grid === 'square' ? G.cellsIn(-15, -15, 15, 15) : G.range({ q: 0, r: 0 }, 3)) tiles[Gr.col(h)] = { t: 'stone' };
    this.levelId = 'ground'; this.region = ''; this.pending = null; this.sel = null; this.traceLine = [];
    this.act({ type: 'loadMap', map: newMap({ id: 'new-map', name: 'New map', grid, levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], starts: [{ q: 0, r: 0, z: 0 }] }) });
    this.refresh();
  }
  // Play on one of the stock maps (content/maps): the same `loadMap` action as any other map.
  stock(id) {
    const m = STOCK_MAPS.find((x) => x.id === id);
    if (!m) return;
    this.levelId = null; this.region = ''; this.pending = null; this.sel = null;
    this.act({ type: 'loadMap', map: structuredClone(m.map) });
    this.refresh();
  }
  export() {
    const map = this.S.map, url = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${slug(map.id || map.name)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async import(file) {
    if (!file) return;
    if (file.size > 8e6) return this.toast('That file is too big to be a map.');
    let doc;
    try { doc = migrateMap(JSON.parse(await file.text())); } catch { return this.toast('That file is not a map: it is not JSON.'); }
    const bad = lintMap(doc);
    if (bad.length) return this.toast(`That map can't be used. ${bad[0]}`);
    this.levelId = null; this.region = ''; this.pending = null;
    this.act({ type: 'loadMap', map: doc });
    this.refresh();
  }

  // ---------- Universal VTT ----------
  // Read the file and show what the importer made of it (its notes) before anything replaces the map.
  async importUvtt(file) {
    if (!file) return;
    if (file.size > 60e6) return this.toast('That file is too big to be a map.');
    const text = await file.text(), base = String(file.name ?? '').replace(/\.[^.]*$/, '');
    // Squares are what these files are drawn on, so they are the default; hexes stay an option. Nothing changes until Load.
    this.#readUvtt('square', { text, name: base.slice(0, 60) || undefined, id: slug(base) });
  }
  // Run the importer on the file already read, on the grid asked for. A file that cannot be read changes nothing: the dialog
  // that was open stays as it was.
  #readUvtt(grid, fresh) {
    const src = fresh || this.uvttSrc;
    let res;
    try { res = importUvtt(src.text, { grid, name: src.name, id: src.id }); }
    catch (err) {
      if (!fresh) this.#renderNotes();                    // the dialog stays as it was, with its own grid chosen
      return this.toast(err instanceof UvttError ? err.message : 'That file could not be read as a Universal VTT map.');
    }
    this.uvttSrc = src; this.uvtt = res; this.uvttGrid = grid; this.tool = 'file';
    this.#renderNotes();
    this.refresh();
  }
  #renderNotes() {
    const box = $('ed-notes'), u = this.uvtt;
    if (!u) { box.hidden = true; box.innerHTML = ''; return; }
    const bad = lintMap(u.map), g = this.uvttGrid;
    box.hidden = false;
    box.innerHTML = `<strong>${esc(u.map.name)}</strong>
      <div class="ed-row" role="radiogroup" aria-label="Grid"><label><input type="radio" name="ed-uvtt-grid" value="square"${g === 'square' ? ' checked' : ''}> Squares</label> <label><input type="radio" name="ed-uvtt-grid" value="hex"${g === 'hex' ? ' checked' : ''}> Hexes</label></div>
      <div class="ed-row"><button type="button" class="go" id="ed-uvtt-load"${bad.length ? ' disabled' : ''}>Load this map</button>${u.image ? '<button type="button" id="ed-uvtt-bare">Load without the picture</button>' : ''}<button type="button" id="ed-uvtt-cancel">Cancel</button></div>
      ${bad.length ? `<p class="bad">This map cannot be loaded: ${esc(bad[0])}</p>` : ''}
      <ul>${u.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    box.scrollIntoView?.({ block: 'nearest' });
    for (const r of box.querySelectorAll('input[name="ed-uvtt-grid"]')) r.onchange = () => { if (r.checked && r.value !== this.uvttGrid) this.#readUvtt(r.value, false); };
    $('ed-uvtt-cancel').onclick = () => { this.uvtt = null; this.uvttSrc = null; this.#renderNotes(); this.refresh(); };
    $('ed-uvtt-load').onclick = () => this.#loadUvtt(true);
    if (u.image) $('ed-uvtt-bare').onclick = () => this.#loadUvtt(false);
  }
  async #loadUvtt(withPicture) {
    const u = this.uvtt, store = this.assets?.();
    if (!u) return;
    const map = structuredClone(u.map);
    $('ed-uvtt-load').disabled = true;
    if (withPicture && u.image) {
      try {
        if (!store) throw new Error('There is nowhere to keep the picture.');
        const rec = await store.upload(await this.#fitPicture(u.image, store));
        map.levels[0].image = { asset: rec.id, feet: u.image.size, origin: u.image.origin };
      } catch (err) { $('ed-uvtt-load').disabled = false; return this.toast(`The picture could not be saved: ${err.message}`); }
    }
    this.uvtt = null; this.uvttSrc = null; this.#renderNotes();
    this.levelId = null; this.region = ''; this.pending = null; this.traceLine = []; this.sel = null;
    this.tool = 'trace'; this.tmode = 'edit';
    this.act({ type: 'loadMap', map });
    this.refresh();
    this.toast(`Map loaded. Check the walls and doors, and fill the floor if ${map.grid === 'square' ? 'squares' : 'hexes'} are missing.`, true);
  }
  // The picture as a File the store will take. One too big for the store is shrunk and saved as WebP.
  async #fitPicture(image, store) {
    const raw = atob(image.url.slice(image.url.indexOf(',') + 1)), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const limit = (await store.list()).limits.file, ext = image.mime === 'image/webp' ? 'webp' : 'png';
    let blob = new Blob([bytes], { type: image.mime });
    if (blob.size <= limit) return new File([blob], `map.${ext}`, { type: image.mime });
    const bmp = await createImageBitmap(blob).catch(() => { throw new Error('the picture could not be read.'); });
    for (let k = 1; k > 0.1; k *= 0.75) {
      const cv = document.createElement('canvas'), top = Math.min(1, 4096 / Math.max(bmp.width, bmp.height)) * k;
      cv.width = Math.max(1, Math.round(bmp.width * top)); cv.height = Math.max(1, Math.round(bmp.height * top));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      blob = await new Promise((res) => cv.toBlob(res, 'image/webp', 0.85));
      if (blob?.type === 'image/webp' && blob.size <= limit * 0.95) return new File([blob], 'map.webp', { type: 'image/webp' });
    }
    throw new Error('the picture is too big to keep, even shrunk.');
  }

  // ---------- the toolbar ----------
  #options(sel, list, value) {
    const sig = JSON.stringify(list);
    if (sel.dataset.sig !== sig) { sel.dataset.sig = sig; sel.innerHTML = list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join(''); }
    sel.value = value;
  }
  // A button that asks for a second tap before it does something that can't be undone.
  #sure(btn, run) {
    if (this.armed !== btn) {
      if (this.armed) this.armed.classList.remove('sure'), (this.armed.textContent = this.armed.dataset.label);
      this.armed = btn; btn.dataset.label = btn.textContent; btn.textContent = 'Tap again to do it'; btn.classList.add('sure');
      clearTimeout(this.armedTimer);
      this.armedTimer = setTimeout(() => { btn.classList.remove('sure'); btn.textContent = btn.dataset.label; this.armed = null; }, 3000);
      return;
    }
    clearTimeout(this.armedTimer); btn.classList.remove('sure'); btn.textContent = btn.dataset.label; this.armed = null;
    run();
  }
  #build() {
    const bar = $('editor');
    const objs = Object.values(CONTENT.objects).map((o) => `<option value="${esc(o.id)}">${esc(o.name)}${o.kind === 'door' ? ' (on an edge)' : ''}</option>`).join('');
    bar.innerHTML = `
      <div class="ed-head"><strong>Map editor</strong><select id="ed-level" aria-label="Level being edited"></select><button type="button" id="ed-undo" disabled>Undo</button><button type="button" id="ed-done">Done</button></div>
      <p class="ed-sub" id="ed-grid"></p>
      <div class="ed-row" id="ed-tools">${Object.entries(TOOLS).map(([k, t]) => `<button type="button" data-tool="${k}">${t}</button>`).join('')}</div>
      <div id="ed-opts">
        <div class="ed-row" data-for="paint" id="ed-terrain">${Object.keys(TILES).map((t) => `<button type="button" data-t="${t}"><i class="sw sw-${t}"></i>${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}</div>
        <div class="ed-row" data-for="paint erase region" id="ed-brush"><button type="button" data-b="0">1 hex</button><button type="button" data-b="1">7 hexes</button></div>
        <div class="ed-row" data-for="wall trace" data-tm="wall" id="ed-kinds">${Object.keys(WALL_KINDS).map((k) => `<button type="button" data-k="${k}">${k[0].toUpperCase()}${k.slice(1)}</button>`).join('')}</div>
        <div class="ed-row" data-for="wall"><button type="button" id="ed-outline">Wall around this level</button></div>
        <div class="ed-row" data-for="object"><select id="ed-def" aria-label="What to place">${objs}</select></div>
        <div class="ed-row" data-for="region"><select id="ed-region" aria-label="Room"></select><input id="ed-rname" maxlength="40" placeholder="Room name" autocomplete="off"></div>
        <div class="ed-row" data-for="region"><label class="check">Light <select id="ed-rlight" aria-label="Light in this room"><option value="">Same as the level</option><option value="bright">Bright</option><option value="dim">Dim</option><option value="dark">Dark</option></select></label></div>
        <div class="ed-row" data-for="region"><button type="button" id="ed-wallin">Wall it in</button><button type="button" id="ed-unregion">Delete room</button></div>
        <form class="ed-row" data-for="level" id="ed-addlevel"><input id="ed-lname" maxlength="40" placeholder="New level name" autocomplete="off"><input id="ed-lfeet" type="number" step="5" value="10" aria-label="Height in feet" class="feet"><button type="submit">Add level</button></form>
        <div class="ed-row" data-for="level"><label class="check">Light <select id="ed-llight" aria-label="Light on this level"><option value="bright">Bright (daylight, a lit hall)</option><option value="dim">Dim (dusk, moonlight)</option><option value="dark">Dark (a cave at night)</option></select></label></div>
        <div class="ed-row" data-for="level"><button type="button" id="ed-unlevel">Delete this level</button><label class="check"><input type="checkbox" id="ed-all"> Show levels above</label></div>
        <div class="ed-row" data-for="file"><button type="button" id="ed-new-square">New square map</button><button type="button" id="ed-new-hex">New hex map</button><button type="button" id="ed-export">Export map</button><button type="button" id="ed-import">Import map</button><input type="file" id="ed-file" accept=".json,application/json" hidden>
          <button type="button" id="ed-uvtt">Import Universal VTT</button><input type="file" id="ed-uvttfile" accept=".dd2vtt,.df2vtt,.uvtt,.json" hidden></div>
        <div class="ed-row" data-for="file"><select id="ed-stock" aria-label="Stock map">${STOCK_MAPS.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select><button type="button" id="ed-stockgo">Start on this map</button></div>
        <p class="ed-sub" data-for="file" id="ed-stocktext"></p>
        <p class="ed-sub" data-for="file" id="ed-gridnote"></p>
        <div class="ed-notes" data-for="file" id="ed-notes" hidden></div>
      </div>
      <p id="ed-hint"></p>`;
    this.#buildMore();
    this.#buildBackground();
    this.#buildTrace();
    const again = () => this.refresh();
    $('ed-done').onclick = () => this.stop();
    $('ed-level').onchange = (ev) => { this.levelId = ev.target.value; this.scaling = null; this.traceLine = []; this.sel = null; again(); };     // a ladder's second tap may be on another level
    $('ed-tools').onclick = (ev) => { const b = ev.target.closest('[data-tool]'); if (b) { this.tool = b.dataset.tool; this.pending = null; this.scaling = null; this.traceLine = []; this.sel = null; if (this.tool === 'level') this.#listPictures(); again(); } };
    $('ed-terrain').onclick = (ev) => { const b = ev.target.closest('[data-t]'); if (b) { this.terrain = b.dataset.t; again(); } };
    $('ed-brush').onclick = (ev) => { const b = ev.target.closest('[data-b]'); if (b) { this.brush = +b.dataset.b; again(); } };
    $('ed-kinds').onclick = (ev) => { const b = ev.target.closest('[data-k]'); if (b) { this.kind = b.dataset.k; again(); } };
    $('ed-outline').onclick = () => this.#wallAround(new Set(Object.keys(this.level().tiles)));
    $('ed-def').onchange = (ev) => { this.def = ev.target.value; this.pending = null; again(); };
    $('ed-region').onchange = (ev) => { this.region = ev.target.value; if (!this.region) $('ed-rname').value = ''; again(); };
    $('ed-rname').onchange = (ev) => {
      const room = this.S.map.regions.find((r) => r.id === this.region), name = ev.target.value.trim();
      if (room && name && name !== room.name) this.edit([{ op: 'region', region: { ...room, name } }]);
    };
    // Ambient light: the same map edits as the DM panel's Sight and light (`light: null` on a level is bright again; a room that says nothing takes its level's).
    $('ed-llight').onchange = (ev) => this.edit([{ op: 'level', level: { id: this.level().id, light: ev.target.value === 'bright' ? null : ev.target.value } }]);
    $('ed-rlight').onchange = (ev) => {
      const room = this.S.map.regions.find((r) => r.id === this.region); if (!room) return;
      const { light, ...rest } = room;
      this.edit([{ op: 'region', region: ev.target.value ? { ...rest, light: ev.target.value } : rest }]);
    };
    $('ed-wallin').onclick = () => { const room = this.S.map.regions.find((r) => r.id === this.region); if (room) this.#wallAround(new Set(room.hexes)); };
    $('ed-unregion').onclick = (ev) => this.#sure(ev.currentTarget, () => { this.edit([{ op: 'unregion', id: this.region }]); this.region = ''; });
    $('ed-addlevel').onsubmit = (ev) => {
      ev.preventDefault();
      const name = $('ed-lname').value.trim(), z = Number($('ed-lfeet').value), map = this.S.map;
      if (!name) return this.toast('Name the level first.');
      if (!Number.isFinite(z) || z % 5) return this.toast('A level\'s height is a multiple of 5 feet.');
      if (map.levels.some((l) => l.z === z)) return this.toast(`There is a level at ${z} ft already.`);
      const id = fresh(slug(name), new Set(map.levels.map((l) => l.id)));
      this.levelId = id; $('ed-lname').value = '';
      this.edit([{ op: 'level', level: { id, name, z } }]);
    };
    $('ed-unlevel').onclick = (ev) => this.#sure(ev.currentTarget, () => { const id = this.level().id; this.levelId = null; this.edit([{ op: 'unlevel', id }]); });
    $('ed-all').onchange = (ev) => { this.showAll = ev.target.checked; again(); };
    for (const g of ['square', 'hex']) $(`ed-new-${g}`).onclick = (ev) => this.#sure(ev.currentTarget, () => this.blank(g));
    const stockText = () => { $('ed-stocktext').textContent = STOCK_MAPS.find((m) => m.id === $('ed-stock').value)?.text ?? ''; };
    $('ed-stock').onchange = stockText; stockText();
    $('ed-stockgo').onclick = (ev) => this.#sure(ev.currentTarget, () => this.stock($('ed-stock').value));
    $('ed-export').onclick = () => this.export();
    $('ed-import').onclick = () => $('ed-file').click();
    $('ed-uvtt').onclick = () => $('ed-uvttfile').click();
    $('ed-uvttfile').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; this.importUvtt(f); };
    $('ed-file').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; this.import(f); };
  }
}
