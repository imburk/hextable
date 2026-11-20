// What the players know of the atlas (docs/specs/travel.md, Decisions 4, 5 and 12; build row W4). Pure: nothing here
// reads a clock or a die, and what is worked out changes nothing but `s.known`.
//
//   s.known: absent | { world, nodes: [id], pins: { [node]: [pin id] }, entries: { [node]: [entry id] }, routes: [id] }
//
// The places, pins, entries and routes a table's players have been told of, each list in the order they were first
// known. A player is never sent the pack's ids: a place is `pl1`, `pl2`, ... by its place in `known.nodes`, a pin of a
// known place `pin1`, ... by its place in that place's list, an entry `ent1`, ... likewise and a route `rt1`, ...; so what
// they are sent says nothing of a place they do not know, not even how many there are (a scene numbers its own the same
// way, scenes.js). The lists only grow, so an id once given means the same thing for as long as the world stays; a different
// world (another id) starts them again. It is the engine's own record, kept in the state beside the world's index (undo,
// saving and a table export carry it): `learn` runs after every action (engine.js), and the DM's `showPlace` and
// `showRoute` (engine/atlas.js) add to it. A table with no world has none, and the view of a table with none is the
// view it always had.
//
// A place is known when a party creature is in it (the place in play or a parked one) or has been, or the DM showed it,
// and so is each place above it. A pin is known when it leads to a known place, when a party creature stands at it, or
// when the DM showed it. An entry of a known battle place is known when a party creature arrived by it, when it is a
// gate, a dock or a circle whose cells the party has seen, or when the DM showed it. A route is known when the DM showed
// it (and, from W6, when the party travelled it), and is sent only between known places.
import { tileSent } from './vision.js';

const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.hasOwn(o, k);
const isRec = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export const SEEN_ENTRY_KINDS = ['gate', 'dock', 'circle'];
// The prefixes of the ids a player is given.
export const PLAYER_ID = { node: 'pl', pin: 'pin', entry: 'ent', route: 'rt' };

const nodeOf = (s, id) => (own(s.world?.nodes, id) ? s.world.nodes[id] : null);
export const hasWorld = (s) => isRec(s?.world) && isRec(s.world.nodes) && Object.keys(s.world.nodes).length > 0;

// The record, made fresh for the world the table has now (and again for a different world than the one it had).
function record(s) {
  const k = s.known;
  if (isRec(k) && k.world === (s.world.id ?? null) && Array.isArray(k.nodes) && isRec(k.pins) && isRec(k.entries) && Array.isArray(k.routes)) return k;
  return (s.known = { world: s.world.id ?? null, nodes: [], pins: {}, entries: {}, routes: [] });
}
const add = (list, id) => { if (!list.includes(id)) list.push(id); };
const addTo = (map, key, id) => { if (!own(map, key)) map[key] = []; add(map[key], id); };

// A place and the places above it, the top one first. A loop or a place the index lacks stops it.
function lineOf(s, id) {
  const out = [];
  for (let at = id, n = 0; typeof at === 'string' && nodeOf(s, at) && !out.includes(at) && n < 64; at = nodeOf(s, at).parent, n++) out.unshift(at);
  return out;
}
export function knowPlace(s, id) {
  if (!hasWorld(s) || !nodeOf(s, id)) return false;
  const k = record(s);
  for (const x of lineOf(s, id)) add(k.nodes, x);
  return true;
}

// Every party creature and the place it is in: the place in play's, then each parked place's.
export function* partyAt(s) {
  const here = typeof s.place === 'string' ? s.place : null;
  for (const e of Object.values(s.entities ?? {})) if (e.side === 'party') yield [e, here];
  for (const [id, rec] of Object.entries(s.parked ?? {})) for (const e of Object.values(rec?.entities ?? {})) if (e.side === 'party') yield [e, id];
}

// Run after every action (engine.js). Adds what has become known; never takes anything away.
export function learn(s) {
  if (!hasWorld(s)) return;
  if (!isRec(s.known) && ![...partyAt(s)].some(([, where]) => where !== null && nodeOf(s, where))) return;      // nothing known yet, and nothing to learn: the table keeps no record
  const k = record(s), standing = new Map();                    // standing: place -> the pins a party creature stands at
  for (const [e, where] of partyAt(s)) {
    if (where === null || !knowPlace(s, where)) continue;
    const pin = own(s.world.at, e.id) ? s.world.at[e.id] : null;
    if (pin) standing.set(where, [...(standing.get(where) ?? []), pin]);
  }
  for (const id of [...k.nodes]) {
    const n = nodeOf(s, id);
    for (const p of Array.isArray(n?.pins) ? n.pins : []) {
      if (isRec(p) && typeof p.id === 'string' && ((typeof p.to === 'string' && k.nodes.includes(p.to)) || (standing.get(id) ?? []).includes(p.id))) addTo(k.pins, id, p.id);
    }
  }
  // The entry a party creature arrived by (the engine's own note of the last, `world.came`), and the gates, docks and
  // circles of the place in play whose cells the party has seen.
  for (const id of k.nodes) {
    const came = own(s.world.came, id) ? s.world.came[id] : null;
    if (typeof came === 'string' && (nodeOf(s, id)?.entries ?? []).some((en) => en.id === came)) addTo(k.entries, id, came);
  }
  const at = typeof s.place === 'string' ? s.place : null;
  if (at !== null && k.nodes.includes(at) && Array.isArray(s.map?.entries) && Array.isArray(s.map?.starts)) {
    for (const en of s.map.entries) {
      if (!SEEN_ENTRY_KINDS.includes(en.kind) || (k.entries[at] ?? []).includes(en.id) || !(nodeOf(s, at)?.entries ?? []).some((x) => x.id === en.id)) continue;
      if (s.map.starts.some((st) => st.entry === en.id && tileSent(s, st.level, { q: st.q, r: st.r }))) addTo(k.entries, at, en.id);
    }
  }
}

// ---------- the DM shows ----------
// `showPlace`: a place (and those above it), a pin of a place, or an entry of a place. Returns a sentence when it cannot.
export function showPlace(s, { node, pin, entry }) {
  if (!hasWorld(s)) return 'This table has no world.';
  const n = nodeOf(s, node);
  if (!n) return `There is no place "${String(node).slice(0, 60)}" in this world.`;
  if (pin !== undefined && entry !== undefined) return 'Show a pin or an entry, not both.';
  if (pin !== undefined && !(typeof pin === 'string' && (n.pins ?? []).some((p) => p.id === pin))) return `${n.name ?? 'That place'} has no pin "${String(pin).slice(0, 60)}".`;
  if (entry !== undefined && !(typeof entry === 'string' && (n.entries ?? []).some((en) => en.id === entry))) return `${n.name ?? 'That place'} has no entry "${String(entry).slice(0, 60)}".`;
  knowPlace(s, node);
  const k = record(s);
  if (pin !== undefined) addTo(k.pins, node, pin);
  if (entry !== undefined) addTo(k.entries, node, entry);
  return null;
}
export function showRoute(s, { route }) {
  if (!hasWorld(s)) return 'This table has no world.';
  const r = (s.world.routes ?? []).find((x) => isRec(x) && x.id === route);
  if (!r) return `There is no route "${String(route).slice(0, 60)}" in this world.`;
  add(record(s).routes, r.id);
  return null;
}

// ---------- the ids a player is given ----------
const numbered = (list, id, prefix) => { const i = list.indexOf(id); return i < 0 ? null : `${prefix}${i + 1}`; };
const fromNumber = (list, text, prefix) => {
  if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
  const digits = text.slice(prefix.length);
  if (!/^[1-9][0-9]{0,4}$/.test(digits)) return null;
  const id = list[Number(digits) - 1];
  return typeof id === 'string' ? id : null;
};
export const knownOf = (s) => (hasWorld(s) && isRec(s.known) && s.known.world === (s.world.id ?? null) && Array.isArray(s.known.nodes) && isRec(s.known.pins) && isRec(s.known.entries) && Array.isArray(s.known.routes) ? s.known : null);

// The id a player is given for a place of the world, or null if they were not given one.
export const playerNode = (s, id) => { const k = knownOf(s); return k ? numbered(k.nodes, id, PLAYER_ID.node) : null; };
// The place a player's id names, or null (for an id they were not given, a guessed one and the pack's own).
export const realNode = (s, text) => { const k = knownOf(s), id = k ? fromNumber(k.nodes, text, PLAYER_ID.node) : null; return id && nodeOf(s, id) ? id : null; };
export const realPin = (s, node, text) => {
  const k = knownOf(s), id = k && own(k.pins, node) ? fromNumber(k.pins[node], text, PLAYER_ID.pin) : null;
  return id && (nodeOf(s, node)?.pins ?? []).some((p) => p.id === id) ? id : null;
};
export const realEntry = (s, node, text) => {
  const k = knownOf(s), id = k && own(k.entries, node) ? fromNumber(k.entries[node], text, PLAYER_ID.entry) : null;
  return id && (nodeOf(s, node)?.entries ?? []).some((en) => en.id === id) ? id : null;
};
export const playerPin = (s, node, id) => { const k = knownOf(s); return k && own(k.pins, node) ? numbered(k.pins[node], id, PLAYER_ID.pin) : null; };
export const playerEntry = (s, node, id) => { const k = knownOf(s); return k && own(k.entries, node) ? numbered(k.entries[node], id, PLAYER_ID.entry) : null; };
export const playerRoute = (s, id) => { const k = knownOf(s); return k ? numbered(k.routes, id, PLAYER_ID.route) : null; };

// The actions whose fields name a place, a pin or an entry (Decision 10: `enter`, `jump`, a teleport `cast`), and the DM's
// that carry the same words. A player who sends one is answered as for a place that does not exist unless the id is one
// they were given.
export const PLACE_ACTIONS = ['enter', 'leave', 'jump', 'goTo', 'loadMap', 'place', 'cast', 'showPlace', 'showRoute', 'forgetPlace', 'keepPlace', 'resetPlace', 'nodeAdd'];
export const NO_SUCH_PLACE = 'There is no such place.';

// A player's action with the ids they were given turned into the world's own. `bad` (the engine's `fail`) is called, in one
// sentence, for an id that is nothing to them, whichever it is: a pack's id, a guessed one, one of another place. A copy:
// the action given is not changed. With no world, or an action with no such field, the action itself.
export function translate(s, action, bad) {
  if (!hasWorld(s) || !PLACE_ACTIONS.includes(action?.type)) return action;
  const out = { ...action };
  let node = null;
  if (out.node !== undefined && out.node !== null) {
    node = realNode(s, out.node);
    if (node === null) bad(NO_SUCH_PLACE);
    out.node = node;
  }
  // A pin is one of the place in play's (`enter`, `jump`) or of the place named (`place`); an entry is one of the place named.
  const at = node ?? (typeof s.place === 'string' ? s.place : null);
  if (out.pin !== undefined && out.pin !== null) {
    const p = at === null ? null : realPin(s, at, out.pin);
    if (p === null) bad(NO_SUCH_PLACE);
    out.pin = p;
  }
  if (out.entry !== undefined && out.entry !== null) {
    const en = at === null ? null : realEntry(s, at, out.entry);
    if (en === null) bad(NO_SUCH_PLACE);
    out.entry = en;
  }
  if (out.route !== undefined && out.route !== null) {
    const k = knownOf(s), id = k ? fromNumber(k.routes, out.route, PLAYER_ID.route) : null;
    if (id === null) bad(NO_SUCH_PLACE);
    out.route = id;
  }
  return out;
}
