// Views: what a given person at the table is allowed to know.
//
//   view(state, viewer)                -> a state safe to send to that viewer
//   viewEvents(events, state, viewer)  -> the events that viewer may see, redacted
//
// `viewer` is { role, userId }, the same shape apply() takes as ctx. The DM gets
// the state and events untouched. Everyone else gets a copy built field by field
// from allow lists, so anything not listed here is never sent: a field added to
// the game state later stays private until someone lists it.
//
// The engine never reads a view and never produces one. Design: docs/specs/hidden-information.md
import * as H from './hex.js';
import { conditionDef, visibleConditions } from './modifiers.js';
import { concealed, shown } from './space.js';
import { barriers, center, objectBlocks, objectDef, objectHexes, objectSegment } from './walls.js';

const isDM = (viewer) => viewer?.role === 'dm';

// How a viewer may know a creature: 'open' (full record), 'seen' (what you could
// tell by looking) or 'hidden' (not at all). A missing creature counts as hidden.
export function classify(state, id) {
  const e = state.entities[id];
  if (!e) return 'hidden';
  if (e.side === 'party') return 'open';
  return concealed(state.map, e) ? 'hidden' : 'seen';      // hidden by the DM, or somewhere not yet seen
}

export const healthOf = (e) =>
  e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy';
const seenHp = (e) => (!e.dead && e.hp > 0 ? 1 : 0);      // keeps up(e) true or false without the number


function seenRecord(e) {
  const cond = {};
  for (const c of visibleConditions(e)) cond[c] = true;         // which conditions show is decided by their data
  return {
    id: e.id, name: e.name, kind: e.kind, side: e.side, tpl: e.tpl, size: e.size,
    pos: { q: e.pos.q, r: e.pos.r, z: e.pos.z }, look: e.look ? structuredClone(e.look) : undefined,
    dead: !!e.dead, hp: seenHp(e), health: healthOf(e), cond,
  };
}

function viewEncounter(state) {
  const enc = state.encounter;
  if (!enc) return null;
  const currentId = enc.order[enc.turn]?.id ?? null;
  const order = [];
  for (const o of enc.order) {
    const c = classify(state, o.id);
    if (c === 'open') order.push({ id: o.id, init: o.init, dex: o.dex });
    else if (c === 'seen') order.push({ id: o.id });
  }
  const activeOpen = currentId !== null && classify(state, currentId) === 'open';
  return {
    id: enc.id, center: { q: enc.center.q, r: enc.center.r }, radius: enc.radius,
    arena: Object.fromEntries(Object.keys(enc.arena).filter((k) => shownMap(state.map).cols.has(k)).map((k) => [k, 1])), round: enc.round,
    turn: order.findIndex((o) => o.id === currentId),
    // What the active creature has left is its own business unless it is one of ours.
    // Zeros, not null, so the engine's helpers run on a view without special cases.
    budget: activeOpen ? { ...enc.budget } : { move: 0, action: 0, bonus: 0 },
    flags: { ...enc.flags },
    order,
  };
}

export function view(state, viewer) {
  if (isDM(viewer)) return state;
  const entities = {};
  for (const [id, e] of Object.entries(state.entities)) {
    const c = classify(state, id);
    if (c === 'open') entities[id] = structuredClone(e);
    else if (c === 'seen') entities[id] = seenRecord(e);
  }
  return {
    // No `seq`: it counts creatures as they are added, so it would tick when the DM adds a hidden one.
    version: state.version, clock: state.clock,
    settings: structuredClone(state.settings),
    map: structuredClone(shownMap(state.map).doc),
    entities,
    encounter: viewEncounter(state),
    effects: viewEffects(state),
  };
}

// ---------- the map ----------
// Players are sent the hexes of revealed regions and of no region, the stretches of wall beside
// those hexes, the objects that touch them, and the regions already revealed. Nothing else: an
// unrevealed room is simply absent. Built once and kept until the map or what is revealed changes.
const REACH = 5 / Math.sqrt(3) + 0.02;           // a hex's corner, in feet from its centre
// The stretches of a wall that lie within REACH of any of these hex centres.
export function clipWall(w, centres) {
  const [ax, ay] = w.a, dx = w.b[0] - ax, dy = w.b[1] - ay, len2 = dx * dx + dy * dy, spans = [];
  for (const [cx, cy] of centres) {
    const fx = ax - cx, fy = ay - cy;
    if (!len2) { if (fx * fx + fy * fy <= REACH * REACH) spans.push([0, 1]); continue; }
    const b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * len2 * (fx * fx + fy * fy - REACH * REACH);
    if (disc < 0) continue;
    const root = Math.sqrt(disc), t0 = Math.max(0, (-b - root) / (2 * len2)), t1 = Math.min(1, (-b + root) / (2 * len2));
    if (t0 <= t1) spans.push([t0, t1]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const sp of spans) { const last = merged.at(-1); if (last && sp[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], sp[1]); else merged.push([...sp]); }
  const whole = merged.length === 1 && merged[0][0] === 0 && merged[0][1] === 1;
  return merged.map(([t0, t1], i) => ({ id: whole ? w.id : `${w.id}~${i}`, level: w.level, kind: w.kind, a: [ax + dx * t0, ay + dy * t0], b: [ax + dx * t1, ay + dy * t1] }));
}
const hiddenState = (o) => !!objectDef(o)?.states[o.state]?.hidden;
const mapCache = new WeakMap();
function shownMap(map) {
  const sig = `${barriers(map).sig}|${map.regions.map((r) => `${r.id}:${r.revealed ? 1 : 0}:${r.hexes.length}`).join()}|${map.levels.map((l) => Object.keys(l.tiles).length).join()}`;
  const had = mapCache.get(map);
  if (had?.sig === sig) return had;
  const cols = new Set(), levels = [], centres = new Map();
  for (const l of map.levels) {
    const tiles = {}, cs = [];
    for (const k in l.tiles) { const h = H.parse(k); if (shown(map, l.id, h)) { tiles[k] = { ...l.tiles[k] }; cols.add(k); cs.push(center(h)); } }
    if (cs.length) { levels.push({ id: l.id, name: l.name, z: l.z, tiles }); centres.set(l.id, cs); }     // a level with nothing shown is not mentioned
  }
  const has = (levelId, h) => !!levels.find((l) => l.id === levelId)?.tiles[H.col(h)];
  const doc = {
    format: map.format, id: map.id, name: map.name, hexFeet: map.hexFeet, levels,
    // An undiscovered door is sent as the wall it passes for. Walls are sorted and renumbered so
    // that nothing about a wall's name or place in the list says which one is not a wall.
    walls: [...map.walls, ...map.objects.filter((o) => hiddenState(o) && objectSegment(o) && objectBlocks(o, 'move') && objectBlocks(o, 'sight'))
      .map((o) => ({ id: o.id, level: o.level, kind: 'wall', a: objectSegment(o)[0], b: objectSegment(o)[1] }))]
      .flatMap((w) => (centres.has(w.level) ? clipWall(w, centres.get(w.level)) : []))
      .sort((p, q) => p.a[0] - q.a[0] || p.a[1] - q.a[1] || p.b[0] - q.b[0] || p.b[1] - q.b[1] || (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0))
      .map((w, i) => ({ ...w, id: `w${i}` })),
    // Objects in a hidden state are not sent at all. Never a DC, and never what an object is wired to.
    objects: map.objects.filter((o) => !hiddenState(o) && objectHexes(o).some((h) => has(o.level, h))).map(({ dc, links, ...o }) => structuredClone(o)),
    regions: map.regions.filter((r) => r.revealed).map((r) => ({ id: r.id, name: r.name, level: r.level, hexes: [...r.hexes], revealed: true })),
    starts: [],
  };
  const out = { sig, doc, cols };
  mapCache.set(map, out);
  return out;
}

// A lasting effect is sent to players if it comes from, or sits on, one of their own. Of what
// it does they see everything on their own characters and, on other creatures, only the
// conditions they could see by looking.
function viewEffects(state) {
  const out = [];
  for (const fx of state.effects ?? []) {
    const src = classify(state, fx.source);
    if (src !== 'open' && !fx.parts.some((p) => classify(state, p.target) === 'open')) continue;
    const parts = [];
    for (const p of fx.parts) {
      const c = classify(state, p.target);
      if (c === 'open') parts.push(structuredClone(p));
      else if (c === 'seen' && p.cond && conditionDef(p.cond)?.visible) parts.push({ target: p.target, cond: p.cond, ...(p.ended ? { ended: true } : {}) });
    }
    out.push({ id: fx.id, name: fx.name, spell: fx.spell, ...(src === 'hidden' ? {} : { source: fx.source }), conc: fx.conc, lasts: fx.lasts,
      until: fx.until ? { ...fx.until } : null, parts });
  }
  return out;
}

// ---------- events ----------

const pick = (ev, keys) => {
  const out = {};
  for (const k of keys) if (ev[k] !== undefined) out[k] = ev[k];
  return out;
};

// Event types a player receives unchanged. A type not named in this file is dropped.
const AS_IS = new Set(['moved', 'turn', 'stood', 'std', 'note', 'down', 'died', 'claimed', 'released',
  'rest', 'time', 'encounterEnd', 'spawned', 'placed', 'deathSave', 'revealed', 'map', 'region', 'fell', 'speed', 'size', 'edited']);

export function viewEvents(events, state, viewer) {
  if (isDM(viewer)) return events;
  const cls = (id) => classify(state, id);
  const kept = [];
  // Timeline entries are events with the in-world time `t` added; the time survives redaction.
  const out = { push(e) { if (this.ev.t !== undefined) e.t = this.ev.t; kept.push(e); }, ev: null };
  let caster = null;                       // who cast the spell that the following saves answer
  for (const ev of events) {
    out.ev = ev;
    if (ev.type === 'cast') caster = ev.actor;
    if ([ev.id, ev.actor, ev.target].some((id) => id !== undefined && id !== null && cls(id) === 'hidden')) continue;      // a null actor is a thing on the map, not a creature

    switch (ev.type) {
      case 'attack': {
        const targetOpen = cls(ev.target) === 'open';
        if (cls(ev.actor) === 'open') {
          const e = structuredClone(ev);
          if (!targetOpen) delete e.ac;
          out.push(e);
        } else {
          out.push(pick(ev, ['type', 'actor', 'target', 'name', 'hit', 'crit', 'mode', 'why', 'opportunity', ...(targetOpen ? ['ac'] : [])]));
        }
        break;
      }
      case 'damage':
      case 'heal': {
        const e = pick(ev, ['type', 'target', 'amount', 'dtype', 'note', 'hp']);
        if (cls(ev.target) === 'seen') { const t = state.entities[ev.target]; e.hp = ev.hp > 0 ? 1 : 0; e.health = healthOf(t); }
        out.push(e);
        break;
      }
      case 'save':
        if (cls(ev.id) === 'open') out.push(structuredClone(ev));
        else out.push(pick(ev, ['type', 'id', 'abil', 'success', ...(caster !== null && cls(caster) === 'open' ? ['dc'] : [])]));
        break;
      case 'cast':
        out.push({ ...pick(ev, ['type', 'actor', 'spell', 'name', 'slot']),
          hexes: ev.hexes ? ev.hexes.map((h) => ({ q: h.q, r: h.r })) : ev.hexes,
          targets: (ev.targets || []).filter((id) => cls(id) !== 'hidden') });
        break;
      case 'encounterStart':
        out.push({ type: ev.type, center: ev.center, radius: ev.radius,
          order: ev.order.filter((o) => cls(o.id) !== 'hidden').map((o) => (cls(o.id) === 'open' ? { ...o } : { id: o.id })) });
        break;
      case 'joined':
        out.push(cls(ev.id) === 'open' ? { ...ev } : { type: ev.type, id: ev.id });
        break;
      case 'cond':
      case 'condEnd':                                  // gaining or losing a condition, if it is one you could see
        if (cls(ev.id) === 'open' || conditionDef(ev.cond)?.visible) out.push(structuredClone(ev));
        break;
      case 'effectStart':
      case 'effectEnd': {                              // a lasting effect that involves one of ours
        const targets = (ev.targets || []).filter((id) => cls(id) !== 'hidden');
        if (cls(ev.source) === 'open' || targets.some((id) => cls(id) === 'open')) out.push({ ...pick(ev, ['type', 'fx', 'name', 'source', 'conc', 'lasts', 'why']), targets });
        break;
      }
      case 'concentration':
        if (cls(ev.id) === 'open') out.push(structuredClone(ev));
        break;
      case 'manual':                                   // what the DM must apply by hand
        // Everyone sees what a spell does when the engine cannot apply it. Notes about what
        // the engine left out of a spell it did apply are for the DM alone.
        if (!ev.partial) out.push(pick(ev, ['type', 'actor', 'name', 'text']));
        break;
      case 'check':                                    // a check by one of ours: the roll, never the DC; the outcome only where it will show anyway
        if (cls(ev.id) === 'open') { const e = structuredClone(ev); delete e.dc; if (e.secret) delete e.success; out.push(e); }
        break;
      case 'noticed':
      case 'triggered':
      case 'object':                                   // something on the map changed state or went off, if they can see it
        if (shownMap(state.map).doc.objects.some((o) => o.id === ev.object)) out.push(structuredClone(ev));
        break;
      case 'chronicle':
        if (ev.public === true) out.push(structuredClone(ev));
        break;
      default:
        if (AS_IS.has(ev.type)) out.push(structuredClone(ev));
    }
  }
  // A creature is introduced before anything is said about it.
  return [...kept.filter((e) => e.type === 'revealed'), ...kept.filter((e) => e.type !== 'revealed')];
}
