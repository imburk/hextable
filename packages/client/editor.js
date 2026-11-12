// The DM's map editor, paint mode: a UI over the engine's `mapEdit` and `loadMap` actions. It never
// changes the map itself: every edit is sent as an action, and the engine checks the whole map
// before taking it. Design: docs/specs/maps-and-objects.md, "Putting a place into the game".
import * as H from './shared/hex.js';
import { TILES } from './shared/content/terrain.js';
import { CONTENT } from './shared/content/index.js';
import { WALL_KINDS, barriers, center, edgeSegment, objectHexes, objectSegment } from './shared/walls.js';
import { FT } from './shared/space.js';
import { newMap, lintMap, migrateMap } from './shared/map.js';

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
  file: 'Start a blank map, save this one to a file, or open one.',
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
const fresh = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
const sameSeg = (w, [a, b]) => (same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a));
const edgeOf = (a, b) => H.DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);

export class Editor {
  // ctx: { R, act, toast, state(), isDM(), refresh() }
  constructor(ctx) {
    Object.assign(this, ctx);
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
    this.R.onPoint = null; this.R.onDrag = null; this.stroke = null; this.props = null; this.scaling = null; this.traceLine = []; this.sel = null; this.endDrag = null; this.R.setPins([]); this.R.setBars([]); this.pinSig = ''; this.barSig = '';
    document.body.classList.remove('editing'); $('editor').hidden = true;
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
    const l = this.level(), at = (k) => { const h = H.parse(k); return H.key({ ...h, z: l.z + (l.tiles[k]?.h ?? 0) }); };
    const move = [], area = [];
    if (this.tool === 'region') { const r = this.S.map.regions.find((x) => x.id === this.region); if (r) move.push(...r.hexes.map(at)); }
    if (this.tool === 'start') for (const s of this.S.map.starts) area.push(H.key({ q: s.q, r: s.r, z: s.z ?? 0 }));
    if (this.pending) {
      const pl = this.S.map.levels.find((x) => x.id === this.pending.level) ?? l, k = H.col(this.pending);
      area.push(H.key({ ...this.pending, z: pl.z + (pl.tiles[k]?.h ?? 0) }));
    }
    for (const h of this.#strokeArea()) area.push(H.key({ ...h, z: l.z + (l.tiles[H.col(h)]?.h ?? 0) }));
    return { move, area };
  }

  // Called on every refresh of the table UI.
  sync() {
    if (this.on && (!this.S || !this.isDM())) return this.stop();
    document.body.classList.toggle('editing', this.on);
    $('editor').hidden = !this.on;
    if (!this.on) return;
    const map = this.S.map, l = this.level();
    this.levelId = l.id;
    this.#options($('ed-level'), [...map.levels].sort((a, b) => b.z - a.z).map((x) => [x.id, `${x.name} (${x.z} ft)`]), l.id);
    const rooms = map.regions.filter((r) => r.level === l.id);
    if (this.region && !map.regions.some((r) => r.id === this.region)) this.region = '';
    this.#options($('ed-region'), [['', '+ New room'], ...rooms.map((r) => [r.id, `${r.name} (${r.hexes.length})${r.revealed ? ' · shown' : ''}`])], this.region);
    const room = map.regions.find((r) => r.id === this.region);
    if (room && document.activeElement !== $('ed-rname')) $('ed-rname').value = room.name;
    $('ed-wallin').disabled = $('ed-unregion').disabled = !room;
    $('ed-unlevel').disabled = map.levels.length < 2;
    for (const b of $('ed-tools').children) b.classList.toggle('sel', b.dataset.tool === this.tool);
    for (const b of $('ed-terrain').children) b.classList.toggle('sel', b.dataset.t === this.terrain);
    for (const b of $('ed-kinds').children) b.classList.toggle('sel', b.dataset.k === this.kind);
    for (const b of $('ed-brush').children) b.classList.toggle('sel', +b.dataset.b === this.brush);
    for (const p of $('ed-opts').children) p.hidden = !p.dataset.for.split(' ').includes(this.tool);
    const d = CONTENT.objects[this.def];
    const hint = this.tool === 'object' ? (d.kind === 'door' ? 'door' : d.connects ? 'ladder' : 'thing') : this.tool;
    $('ed-hint').textContent = this.pending ? (this.tool === 'object' && d.connects ? 'Now tap where it leads.' : 'Now tap a neighbouring hex.') : HINTS[hint];
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
    const k = H.col(h), tile = l.tiles[k], map = this.S.map, area = this.areaOver ?? H.range(h, this.brush);
    switch (this.tool) {
      case 'paint': {
        const ops = area.filter((x) => l.tiles[H.col(x)]?.t !== this.terrain).map((at) => ({ op: 'tile', level: l.id, at, tile: { ...(l.tiles[H.col(at)] ?? {}), t: this.terrain } }));
        return ops.length && this.edit(ops);
      }
      case 'erase': {
        const gone = new Set(area.map(H.col).filter((c) => l.tiles[c]));
        if (!gone.size) return;
        const ops = map.objects.filter((o) => o.level === l.id && objectHexes(o).some((x) => gone.has(H.col(x)))).map((o) => ({ op: 'unobject', id: o.id }));
        const left = (s) => !gone.has(H.col(s)) || map.levels.some((x) => x.id !== l.id && x.tiles[H.col(s)]);
        if (!map.starts.every(left)) ops.push({ op: 'starts', starts: map.starts.filter(left) });
        for (const c of gone) ops.push({ op: 'tile', level: l.id, at: H.parse(c), tile: null });
        return this.edit(ops);
      }
      case 'wall': return this.#pair(h, (a, e) => {
        const seg = edgeSegment(a, e), had = map.walls.find((w) => w.level === l.id && sameSeg(w, seg));
        return [had ? { op: 'unwall', id: had.id } : { op: 'wall', wall: { level: l.id, a: seg[0], b: seg[1], kind: this.kind } }];
      });
      case 'object': {
        const def = CONTENT.objects[this.def];
        if (def.kind === 'door') return this.#pair(h, (a, e) => {
          const b = { q: a.q + H.DIRS[e][0], r: a.r + H.DIRS[e][1] }, seg = edgeSegment(a, e);
          const had = map.objects.find((o) => o.level === l.id && Number.isInteger(o.edge) && sameSeg({ a: edgeSegment(o.at, o.edge)[0], b: edgeSegment(o.at, o.edge)[1] }, seg));
          if (had) return [{ op: 'unobject', id: had.id }];
          const [at, edge] = l.tiles[H.col(a)] || !l.tiles[H.col(b)] ? [a, e] : [b, (e + 3) % 6];      // a door stands on a tile of its level
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
        const keys = area.map(H.col).filter((c) => l.tiles[c]);
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
      default: return this.toast(HINTS[this.tool]);
    }
  }
  // A two-tap edit on the edge between neighbouring hexes. make(first, edge) returns the ops.
  #pair(h, make) {
    const p = this.pending, l = this.level();
    if (!p || p.level !== l.id || (p.q === h.q && p.r === h.r)) { this.pending = p && p.q === h.q && p.r === h.r ? null : { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
    const e = edgeOf(p, h);
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
      map.objects.some((o) => o.level === l.id && Number.isInteger(o.edge) && sameSeg({ a: edgeSegment(o.at, o.edge)[0], b: edgeSegment(o.at, o.edge)[1] }, seg));
    for (const c of inside) {
      const h = H.parse(c);
      H.DIRS.forEach(([dq, dr], e) => {
        if (inside.has(H.col({ q: h.q + dq, r: h.r + dr }))) return;
        const seg = edgeSegment(h, e);
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
    for (const c of this.stroke.hexes.values()) for (const x of H.range(c, this.brush)) seen.set(H.col(x), x);
    return [...seen.values()];
  }
  #drag() {
    const add = (x, y) => {
      const h = this.R.planeHex(x, y, this.level().z);
      if (!h || this.stroke.hexes.has(H.col(h))) return false;
      this.stroke.hexes.set(H.col(h), h); return true;
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
  static STEP = 2.5;
  #heightTap(h, l) {
    const tile = l.tiles[H.col(h)];
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
    const here = (lv, c) => lv.tiles[H.col(c)];
    if (!here(l, h)) return this.toast('Stairs run between tiles. Paint the floor first.');
    if (!p || (p.q === h.q && p.r === h.r && p.level === l.id)) { this.pending = p ? null : { q: h.q, r: h.r, level: l.id }; return this.refresh(); }
    this.pending = null;
    const pl = map.levels.find((x) => x.id === p.level);
    if (!pl || !here(pl, p)) return this.refresh();
    const za = pl.z + (here(pl, p).h ?? 0), zb = l.z + (here(l, h).h ?? 0);
    const dq = h.q - p.q, dr = h.r - p.r, n = H.dist(p, h);
    if (!(dq === 0 || dr === 0 || dq + dr === 0)) return this.toast('Stairs need a straight line of hexes: along one of the three grid directions.');
    if (n < 2) return this.toast('Pick two hexes with at least one between them.');
    if (za === zb) return this.toast('Both ends are the same height, so there is nothing to climb. Raise the top first.');
    const base = za <= zb ? pl : l, foot = za <= zb ? p : h, ops = [];
    const rounded = (z) => Math.round(z / Editor.STEP) * Editor.STEP;
    let worst = 0, prev = za;
    for (let i = 1; i < n; i++) {
      const at = { q: p.q + Math.sign(dq) * i, r: p.r + Math.sign(dr) * i }, z = rounded(za + (zb - za) * i / n);
      worst = Math.max(worst, Math.abs(z - prev)); prev = z;
      const off = z - base.z, old = base.tiles[H.col(at)] ?? { t: here(base, foot).t };
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
    const k = H.col(h);
    return this.S.map.objects.filter((o) => o.level === l.id && objectHexes(o).some((x) => H.col(x) === k));
  }
  #propsTap(h, l) {
    const P = this.props, map = this.S.map;
    if (P?.pick === 'to') {
      const t = l.tiles[H.col(h)];
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
      <label>Name <input name="name" maxlength="40" value="${esc(d.name ?? '')}" placeholder="shown to the DM" autocomplete="off"></label>
      ${usesKey ? `<label>Key <input name="key" maxlength="40" value="${esc(d.key ?? '')}" placeholder="name of the item that fits" autocomplete="off"></label>` : ''}
      ${dcs.length ? `<div class="ed-dcs">${dcs.map(([k, t, dflt]) => `<label>${esc(t)} <input type="number" inputmode="numeric" min="1" max="40" step="1" data-dc="${esc(k)}" value="${d.dc?.[k] ?? ''}" placeholder="${dflt ?? ''}"></label>`).join('')}</div>` : ''}
      ${def.connects ? `<div class="ed-line"><span>Leads to ${d.to ? `${d.to.q},${d.to.r} at ${d.to.z} ft` : 'nowhere yet'}</span><button type="button" id="ed-pickto"${P.pick === 'to' ? ' class="sel"' : ''}>${P.pick === 'to' ? 'Tap a tile now' : 'Pick the place'}</button></div>` : ''}
      <div class="ed-links"><span>Links</span><ul>${links || '<li class="none">None. Linking makes another object change when this one does.</li>'}</ul>
        <div class="ed-line"><span>${target ? esc(label(target)) : 'Nothing picked'}</span><button type="button" id="ed-picklink"${P.pick === 'link' ? ' class="sel"' : ''}>${P.pick === 'link' ? 'Tap an object now' : 'Pick an object'}</button></div>
        ${target ? `<div class="ed-line"><label>When this is <select name="when">${opts(def.states, P.when)}</select></label><label>it puts that <select name="sets">${opts(tdef.states, P.sets)}</select></label><button type="button" id="ed-addlink">Add link</button></div>` : ''}
      </div>
      <div class="ed-line"><button type="submit" class="go">Save</button><button type="button" id="ed-closeform">Close</button></div>`;
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
    if (this.tool === 'height' && this.hmode === 'stairs') $('ed-hint').textContent = this.pending ? 'Now tap the hex at the top of the stairs.' : HINTS.stairs;
    else if (this.tool === 'height') $('ed-hint').textContent = HINTS.height;
    if (this.tool === 'props') $('ed-hint').textContent = this.props?.pick === 'to' ? 'Tap the tile it leads to (change level first if it goes up or down).' : this.props?.pick === 'link' ? 'Tap the other object.' : HINTS.props;
  }

  // ---------- trace: walls and doors drawn over the picture ----------
  // Walls are free line segments in feet, so nothing here snaps to hexes. Every gesture is one mapEdit.
  #pieces(l) {         // everything on this level that is a line: walls and traced doors
    const map = this.S.map, out = [];
    for (const w of map.walls) if (w.level === l.id) out.push({ type: 'wall', id: w.id, a: w.a, b: w.b, item: w });
    for (const o of map.objects) { const seg = o.level === l.id && o.seg && objectSegment(o); if (seg) out.push({ type: 'object', id: o.id, a: seg[0], b: seg[1], item: o }); }
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
    const k = this.snap || 0.01;
    return [Math.round(p[0] / k) * k, Math.round(p[1] / k) * k].map((n) => Math.round(n * 100) / 100);
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
  #doorAt(mid, l) { const at = H.fromWorld(mid[0], mid[1], FT / Math.sqrt(3)); return { at: { q: at.q, r: at.r }, tile: l.tiles[H.col(at)] ? null : { op: 'tile', level: l.id, at: { q: at.q, r: at.r }, tile: { t: 'stone' } } }; }
  #placeDoor(l, a, b) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { this.refresh(); return this.toast('A door needs two points at least 1 ft apart.', true); }
    const { at, tile } = this.#doorAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l);
    this.edit([...(tile ? [tile] : []), { op: 'object', object: { def: this.tdef, level: l.id, at, seg: { a, b } } }]);
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
      else { const { at, tile } = this.#doorAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l); if (tile) ops.push(tile); ops.push({ op: 'object', object: { ...m.item, at, seg: { a, b } } }); }
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
    const [ox, oy] = img.origin, [fw, fh] = img.feet, row = (FT * Math.sqrt(3)) / 2, ops = [];
    for (let r = Math.ceil(oy / row); r * row <= oy + fh; r++) {
      for (let q = Math.ceil(ox / FT - r / 2); ; q++) {
        const [cx, cy] = center({ q, r });
        if (cx > ox + fw) break;
        if (cx >= ox && cy >= oy && cy <= oy + fh && !l.tiles[H.col({ q, r })]) ops.push({ op: 'tile', level: l.id, at: { q, r }, tile: { t: 'stone' } });
      }
    }
    if (!ops.length) return this.toast('Every hex under the picture has a floor already.', true);
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
        <select id="ed-snap" aria-label="Round points to" data-tm="wall door"><option value="0">No rounding</option><option value="1" selected>Round to 1 ft</option><option value="2.5">Round to 2.5 ft</option><option value="5">Round to 5 ft</option></select>
        <button type="button" id="ed-tdone" data-tm="wall">Done</button><button type="button" id="ed-tback" data-tm="wall door">Back</button>
        <button type="button" id="ed-tdel" data-tm="edit">Delete</button>
        <button type="button" id="ed-fill">Fill floor</button><span id="ed-tread"></span></div>`);
    $('ed-tmodes').onclick = (ev) => { const b = ev.target.closest('[data-tmode]'); if (b) { this.tmode = b.dataset.tmode; this.traceLine = []; this.sel = null; this.refresh(); } };
    $('ed-tdef').onchange = (ev) => { this.tdef = ev.target.value; this.traceLine = []; this.refresh(); };
    $('ed-snap').onchange = (ev) => { this.snap = Number(ev.target.value); };
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
      if (this.sel && !this.#selected(l)) this.sel = null;
      $('ed-tdone').disabled = this.traceLine.length < 2; $('ed-tback').disabled = !this.traceLine.length;
      $('ed-tdel').disabled = !this.sel;
      $('ed-fill').disabled = !l.image;
      const x = this.#selected(l);
      $('ed-tread').textContent = x ? `${x.type === 'wall' ? x.item.kind : CONTENT.objects[x.item.def]?.name}, ${Math.round(Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]) * 10) / 10} ft` : '';
      $('ed-hint').textContent = !l.image ? 'Trace works over a picture. Set one under Levels first.' : this.pending ? $('ed-hint').textContent : HINTS[`trace_${this.tmode}`];
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
      const h = H.parse(k);
      for (let e = 0; e < 3; e++) {
        const n = { q: h.q + H.DIRS[e][0], r: h.r + H.DIRS[e][1] };
        if (!l.tiles[H.col(n)] || !B.blocked(l.id, h, n, 'move')) continue;
        bars.push([...center(h), ...center(n)]);
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
      <div class="ed-row" data-for="level" id="ed-bgnudge"><span>Nudge</span>
        <button type="button" data-nudge="left" aria-label="Nudge left">&larr;</button><button type="button" data-nudge="up" aria-label="Nudge up">&uarr;</button><button type="button" data-nudge="down" aria-label="Nudge down">&darr;</button><button type="button" data-nudge="right" aria-label="Nudge right">&rarr;</button>
        <select id="ed-nudgestep" aria-label="How far"><option value="1">1 ft</option><option value="5">5 ft</option><option value="0.25">3 in</option></select>
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
    for (const id of ['ed-scale', 'ed-clearbg']) $(id).disabled = !img;
    for (const b of $('ed-bgnudge').querySelectorAll('[data-nudge]')) b.disabled = !img;
    if (!img) this.scaling = null;
    $('ed-scale').classList.toggle('sel', !!this.scaling);
    const n = this.scaling?.pts.length ?? 0;
    $('ed-scalehint').textContent = this.scaling ? (n < 2 ? `Tap ${n ? 'the second' : 'the first'} point of a distance you know.` : 'Type the distance between them.') : '';
    $('ed-scaleask').hidden = n < 2;
    if (this.tool === 'level' && this.scaling) $('ed-hint').textContent = n < 2 ? 'Tap two points on the picture that are a known distance apart (the ends of a 30 ft room, say).' : 'Now type how many feet apart they are, and Apply.';
  }

  // ---------- map files ----------
  blank() {
    const tiles = {};
    for (const h of H.range({ q: 0, r: 0 }, 3)) tiles[H.col(h)] = { t: 'stone' };
    this.levelId = 'ground'; this.region = ''; this.pending = null;
    this.act({ type: 'loadMap', map: newMap({ id: 'new-map', name: 'New map', levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }], starts: [{ q: 0, r: 0, z: 0 }] }) });
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
      <div class="ed-row" id="ed-tools">${Object.entries(TOOLS).map(([k, t]) => `<button type="button" data-tool="${k}">${t}</button>`).join('')}</div>
      <div id="ed-opts">
        <div class="ed-row" data-for="paint" id="ed-terrain">${Object.keys(TILES).map((t) => `<button type="button" data-t="${t}"><i class="sw sw-${t}"></i>${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}</div>
        <div class="ed-row" data-for="paint erase region" id="ed-brush"><button type="button" data-b="0">1 hex</button><button type="button" data-b="1">7 hexes</button></div>
        <div class="ed-row" data-for="wall trace" data-tm="wall" id="ed-kinds">${Object.keys(WALL_KINDS).map((k) => `<button type="button" data-k="${k}">${k[0].toUpperCase()}${k.slice(1)}</button>`).join('')}</div>
        <div class="ed-row" data-for="wall"><button type="button" id="ed-outline">Wall around this level</button></div>
        <div class="ed-row" data-for="object"><select id="ed-def" aria-label="What to place">${objs}</select></div>
        <div class="ed-row" data-for="region"><select id="ed-region" aria-label="Room"></select><input id="ed-rname" maxlength="40" placeholder="Room name" autocomplete="off"></div>
        <div class="ed-row" data-for="region"><button type="button" id="ed-wallin">Wall it in</button><button type="button" id="ed-unregion">Delete room</button></div>
        <form class="ed-row" data-for="level" id="ed-addlevel"><input id="ed-lname" maxlength="40" placeholder="New level name" autocomplete="off"><input id="ed-lfeet" type="number" step="5" value="10" aria-label="Height in feet" class="feet"><button type="submit">Add level</button></form>
        <div class="ed-row" data-for="level"><button type="button" id="ed-unlevel">Delete this level</button><label class="check"><input type="checkbox" id="ed-all"> Show levels above</label></div>
        <div class="ed-row" data-for="file"><button type="button" id="ed-new">New blank map</button><button type="button" id="ed-export">Export map</button><button type="button" id="ed-import">Import map</button><input type="file" id="ed-file" accept=".json,application/json" hidden></div>
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
    $('ed-new').onclick = (ev) => this.#sure(ev.currentTarget, () => this.blank());
    $('ed-export').onclick = () => this.export();
    $('ed-import').onclick = () => $('ed-file').click();
    $('ed-file').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; this.import(f); };
  }
}
