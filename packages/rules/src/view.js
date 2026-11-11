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

const isDM = (viewer) => viewer?.role === 'dm';

// How a viewer may know a creature: 'open' (full record), 'seen' (what you could
// tell by looking) or 'hidden' (not at all). A missing creature counts as hidden.
export function classify(state, id) {
  const e = state.entities[id];
  if (!e) return 'hidden';
  if (e.side === 'party') return 'open';
  return e.hidden ? 'hidden' : 'seen';
}

export const healthOf = (e) =>
  e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy';
const seenHp = (e) => (!e.dead && e.hp > 0 ? 1 : 0);      // keeps up(e) true or false without the number

const VISIBLE_CONDITIONS = ['prone', 'unconscious', 'dodging'];

function seenRecord(e) {
  const cond = {};
  for (const c of VISIBLE_CONDITIONS) if (e.cond?.[c]) cond[c] = true;
  return {
    id: e.id, name: e.name, kind: e.kind, side: e.side, tpl: e.tpl,
    pos: { q: e.pos.q, r: e.pos.r }, look: e.look ? structuredClone(e.look) : undefined,
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
    arena: { ...enc.arena }, round: enc.round,
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
    version: state.version, seq: state.seq, clock: state.clock,
    settings: structuredClone(state.settings),
    map: structuredClone(state.map),
    entities,
    encounter: viewEncounter(state),
  };
}

// ---------- events ----------

const pick = (ev, keys) => {
  const out = {};
  for (const k of keys) if (ev[k] !== undefined) out[k] = ev[k];
  return out;
};

// Event types a player receives unchanged. A type not named in this file is dropped.
const AS_IS = new Set(['moved', 'turn', 'stood', 'cond', 'std', 'note', 'down', 'died', 'claimed', 'released',
  'rest', 'time', 'encounterEnd', 'spawned', 'placed', 'deathSave', 'revealed']);

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
    if ([ev.id, ev.actor, ev.target].some((id) => id !== undefined && cls(id) === 'hidden')) continue;

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
        out.push({ ...pick(ev, ['type', 'actor', 'spell', 'name']),
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
