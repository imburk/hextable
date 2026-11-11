// Sending only what changed.
//
// The server remembers, per connection, what it last sent and sends the difference. The
// client applies each difference to its copy. Both ends use this file, so they cannot
// disagree about the format. Pure: no network, no clock. Design: docs/specs/hidden-information.md
//
// A patch is an object:
//   entities: { id: record | null }   changed or new creatures; null means gone
//   gone:     [key, ...]              top-level fields that no longer exist
//   within:   { encounter: {...} }    fields that changed inside the fight still going on
//   any other key                     a top-level field's new value (encounter, clock, ...)
//
// The fight gets field-level treatment because it changes on every action (whose turn, what
// they have left) while its biggest part, the list of locked hexes, never changes once set.
//
// Change is detected by comparing JSON text, record by record. At this scale that is
// cheaper and much harder to get wrong than tracking every mutation in the rules engine.

// What was sent, in a form that is quick to compare against later.
export function snapshot(state) {
  const top = {}, entities = {};
  for (const [k, v] of Object.entries(state)) if (k !== 'entities' && v !== undefined) top[k] = JSON.stringify(v);
  for (const [id, e] of Object.entries(state.entities)) entities[id] = JSON.stringify(e);
  const fight = state.encounter ? Object.fromEntries(Object.entries(state.encounter).map(([k, v]) => [k, JSON.stringify(v)])) : null;
  return { top, entities, fight };
}

// The patch that turns the state behind snapshot `prev` into `state` (whose snapshot is `next`).
export function diff(prev, next, state) {
  const patch = {};
  for (const k of Object.keys(next.top)) if (prev.top[k] !== next.top[k]) patch[k] = state[k];
  // Same fight as before, with the same set of fields: send just the fields that moved.
  const a = prev.fight, b = next.fight;
  if ('encounter' in patch && a && b && a.id === b.id && Object.keys(a).every((k) => k in b)) {
    delete patch.encounter;
    patch.within = { encounter: Object.fromEntries(Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => [k, state.encounter[k]])) };
  }
  const gone = Object.keys(prev.top).filter((k) => !(k in next.top));
  if (gone.length) patch.gone = gone;
  const entities = {};
  for (const id of Object.keys(next.entities)) if (prev.entities[id] !== next.entities[id]) entities[id] = state.entities[id];
  for (const id of Object.keys(prev.entities)) if (!(id in next.entities)) entities[id] = null;
  if (Object.keys(entities).length) patch.entities = entities;
  return patch;
}

export function applyPatch(state, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'entities') {
      for (const [id, e] of Object.entries(v)) { if (e === null) delete state.entities[id]; else state.entities[id] = e; }
    } else if (k === 'gone') {
      for (const key of v) delete state[key];
    } else if (k === 'within') {
      for (const [key, fields] of Object.entries(v)) Object.assign(state[key], fields);
    } else state[k] = v;
  }
  return state;
}

// The receiving end. Feed it every `update` message; it returns { state, events } to show, or
// null when the message could not be used. Updates are numbered per table: if one goes missing,
// the receiver asks for the whole state again (requestSync) and ignores patches until it arrives.
export function createReceiver(requestSync) {
  let state = null, seq = null, waiting = false;
  return {
    get state() { return state; },
    receive(msg) {
      if (msg.state) {                                  // a full state always wins
        state = msg.state; seq = msg.seq; waiting = false;
        return { state, events: msg.events || [] };
      }
      if (waiting) return null;
      if (state && msg.patch && msg.seq === seq + 1) {
        applyPatch(state, msg.patch); seq = msg.seq;
        return { state, events: msg.events || [] };
      }
      waiting = true;
      requestSync();
      return null;
    },
  };
}
