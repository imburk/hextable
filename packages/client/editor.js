// The DM's map editor, paint mode: a UI over the engine's `mapEdit` and `loadMap` actions. It never
// changes the map itself: every edit is sent as an action, and the engine checks the whole map
// before taking it. Design: docs/specs/maps-and-objects.md, "Putting a place into the game".
import * as H from './shared/hex.js';
import { TILES } from './shared/content/terrain.js';
import { CONTENT } from './shared/content/index.js';
import { WALL_KINDS, edgeSegment, objectHexes } from './shared/walls.js';
import { newMap, lintMap, migrateMap } from './shared/map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOOLS = { paint: 'Paint', erase: 'Erase', wall: 'Walls', object: 'Doors & things', region: 'Rooms', start: 'Start', level: 'Levels', file: 'Map file' };
const HINTS = {
  paint: 'Tap hexes to paint them, empty ones too.',
  erase: 'Tap a tile to remove it, with any door or thing on it.',
  wall: 'Tap two neighbouring hexes to wall the edge between them. Do it again to take the wall away.',
  door: 'Tap two neighbouring hexes to put the door on the edge between them. Again to remove it.',
  thing: 'Tap a hex to put it there. Tap it again to remove it.',
  ladder: 'Tap where it stands, then where it leads (switch level between taps if it goes up or down).',
  region: 'Pick or name a room, then tap hexes to add them to it or take them out. Wall it in uses the kind chosen under Walls.',
  start: 'Tap the hex where the party starts.',
  level: 'Add a level above or below, or pick which one to edit at the top.',
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
    this.refresh();
  }
  stop() {
    if (!this.on) return;
    this.on = false; this.pending = null;
    this.R.onPoint = null;
    document.body.classList.remove('editing'); $('editor').hidden = true;
    if (this.S) this.refresh();
  }
  // How high to draw floors while editing: the level being edited and those below it.
  ceiling() { return this.showAll ? Infinity : this.level().z + 4; }
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
    this.#options($('ed-region'), [['', '+ New room'], ...rooms.map((r) => [r.id, `${r.name} (${r.hexes.length})`])], this.region);
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
    this.R.inset = $('editor').offsetHeight * 0.85;
  }

  // ---------- taps ----------
  #tap(px, py) {
    if (!this.S) return;
    const l = this.level(), h = this.R.planeHex(px, py, l.z);
    if (!h) return;
    const k = H.col(h), tile = l.tiles[k], map = this.S.map, area = H.range(h, this.brush);
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
        <div class="ed-row" data-for="wall" id="ed-kinds">${Object.keys(WALL_KINDS).map((k) => `<button type="button" data-k="${k}">${k[0].toUpperCase()}${k.slice(1)}</button>`).join('')}</div>
        <div class="ed-row" data-for="wall"><button type="button" id="ed-outline">Wall around this level</button></div>
        <div class="ed-row" data-for="object"><select id="ed-def" aria-label="What to place">${objs}</select></div>
        <div class="ed-row" data-for="region"><select id="ed-region" aria-label="Room"></select><input id="ed-rname" maxlength="40" placeholder="Room name" autocomplete="off"></div>
        <div class="ed-row" data-for="region"><button type="button" id="ed-wallin">Wall it in</button><button type="button" id="ed-unregion">Delete room</button></div>
        <form class="ed-row" data-for="level" id="ed-addlevel"><input id="ed-lname" maxlength="40" placeholder="New level name" autocomplete="off"><input id="ed-lfeet" type="number" step="5" value="10" aria-label="Height in feet" class="feet"><button type="submit">Add level</button></form>
        <div class="ed-row" data-for="level"><button type="button" id="ed-unlevel">Delete this level</button><label class="check"><input type="checkbox" id="ed-all"> Show levels above</label></div>
        <div class="ed-row" data-for="file"><button type="button" id="ed-new">New blank map</button><button type="button" id="ed-export">Export map</button><button type="button" id="ed-import">Import map</button><input type="file" id="ed-file" accept=".json,application/json" hidden></div>
      </div>
      <p id="ed-hint"></p>`;
    const again = () => this.refresh();
    $('ed-done').onclick = () => this.stop();
    $('ed-level').onchange = (ev) => { this.levelId = ev.target.value; again(); };     // a ladder's second tap may be on another level
    $('ed-tools').onclick = (ev) => { const b = ev.target.closest('[data-tool]'); if (b) { this.tool = b.dataset.tool; this.pending = null; again(); } };
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
