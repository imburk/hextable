// Undo and redo for the DM.
//
//   const h = createHistory({ limit: 30 });
//   const before = mark(state);                // just before apply()
//   const res = apply(state, action, ctx);
//   if (res.ok && undoable(action)) h.record(before, state, describeStep(action, res.events, before, state));
//   h.undo(state)  -> { state, label, shown } or null     (state is changed in place and returned)
//   h.redo(state)  -> the same, the other way
//   h.list()       -> labels of what can be undone, newest first; h.listRedo() likewise
//
// Each step is kept as a reverse patch: the changes that turn the state after an action back into
// the state before it, down to the dice seed, the clock, the order of keys and the timeline entries
// the action added. Undoing gives back exactly the JSON the game had, so the same action taken
// again rolls the same dice. The history is not part of the game state: it is never saved with the
// game and never sent to players. Pure: no network, no clock, no randomness.
import { viewEvents, classify } from './view.js';

export const UNDO_LIMIT = 30;
export const UNDO_BYTES = 8 * 1024 * 1024;       // per game, both lists together

// Lobby changes are who sits where, not the game: they are never undone.
const LOBBY = new Set(['claim', 'release']);
export const undoable = (action) => !LOBBY.has(action?.type);

// What a state looked like, cheaply enough to take before every action. The timeline only ever
// grows, so only its length is kept; its place among the keys is kept with a null.
export function mark(state) {
  return { tree: structuredClone({ ...state, timeline: null }), tl: state.timeline?.length ?? 0 };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// The changes that turn `a` into `b`, as a list of { p: path, v } (set), { p, d: 1 } (delete) and
// { p, o: keys } (put an object's keys back in this order). Objects are followed key by key and
// arrays of the same length item by item; anything else is replaced whole. Values come from `b`,
// which is always a private copy here. The timeline at the top is left to the caller.
function changes(a, b, path = [], ops = []) {
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    for (const k of kb) {
      if (!path.length && k === 'timeline') continue;
      if (!Object.hasOwn(a, k)) ops.push({ p: [...path, k], v: b[k] });
      else if (!same(a[k], b[k])) changes(a[k], b[k], [...path, k], ops);
    }
    for (const k of ka) if (!Object.hasOwn(b, k)) ops.push({ p: [...path, k], d: 1 });
    const after = [...ka.filter((k) => Object.hasOwn(b, k)), ...kb.filter((k) => !Object.hasOwn(a, k))];
    if (after.some((k, i) => k !== kb[i])) ops.push({ p: path, o: kb });
  } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) changes(a[i], b[i], [...path, i], ops);
  } else ops.push({ p: path, v: b });
  return ops;
}

const at = (root, path) => path.reduce((o, k) => o[k], root);
function applyChanges(state, ops) {
  for (const op of ops) {
    if (op.o) {
      const o = at(state, op.p), was = { ...o };
      for (const k of Object.keys(o)) delete o[k];
      for (const k of op.o) o[k] = was[k];
      continue;
    }
    const parent = at(state, op.p.slice(0, -1)), k = op.p.at(-1);
    if (op.d) delete parent[k]; else parent[k] = op.v;
  }
}

// A step's timeline part is a list of splices { at, remove, insert } applied in order (older steps,
// and those saved by older servers, hold a single splice instead of a list).
const splicesOf = (tl) => (Array.isArray(tl) ? tl : [tl]);

// Apply a step and return the step that takes it back.
function flip(state, step) {
  const before = mark(state);
  applyChanges(state, step.ops);
  const back = [];
  for (const { at: i, remove, insert } of splicesOf(step.tl)) {
    const removed = state.timeline ? state.timeline.splice(i, remove, ...insert) : [];
    back.unshift({ at: i, remove: insert.length, insert: removed });      // undone in the opposite order
  }
  const undo = { label: step.label, shown: step.shown, ops: changes(state, before.tree), tl: back.length === 1 ? back[0] : back };
  undo.bytes = JSON.stringify(undo).length;
  return undo;
}

// Reading a history back from a file. Anything that is not exactly the shape this module writes is
// refused whole, so that a damaged file can never leave a step that breaks when it is undone.
const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
const isStep = (s) => isObj(s) && typeof s.label === 'string' && (s.shown === null || typeof s.shown === 'string')
  && Array.isArray(s.ops) && s.ops.every((o) => isObj(o) && Array.isArray(o.p) && o.p.every((k) => (typeof k === 'string' && !BAD_KEY.has(k)) || Number.isInteger(k))
    && ('d' in o || 'o' in o || 'v' in o) && (!('o' in o) || (Array.isArray(o.o) && o.o.every((k) => typeof k === 'string' && !BAD_KEY.has(k)))))
  && splicesOf(s.tl).length > 0 && splicesOf(s.tl).every((t) => isObj(t) && Number.isInteger(t.at) && t.at >= 0 && Number.isInteger(t.remove) && t.remove >= 0 && Array.isArray(t.insert));
const rebuild = (s) => { const step = { label: s.label, shown: s.shown, ops: s.ops, tl: Array.isArray(s.tl) ? s.tl.map((t) => ({ at: t.at, remove: t.remove, insert: t.insert })) : { at: s.tl.at, remove: s.tl.remove, insert: s.tl.insert } }; step.bytes = JSON.stringify(step).length; return step; };

export function createHistory({ limit = UNDO_LIMIT, maxBytes = UNDO_BYTES } = {}) {
  let undos = [], redos = [];
  const bytes = () => [...undos, ...redos].reduce((n, s) => n + s.bytes, 0);
  const trim = () => { while (undos.length && (undos.length > limit || bytes() > maxBytes)) undos.shift(); };
  const step = (list, other, state) => {
    const s = list.pop();
    if (!s) return null;
    other.push(flip(state, s));
    trim();
    return { state, label: s.label, shown: s.shown };
  };
  return {
    // `before` is mark(state) taken before the action, or a whole copy of that state.
    // `label` is a string, or { label, shown } where `shown` is what players may be told (null: nothing).
    // `dropped` is what capTimeline took out of the timeline after the action (see timeline.js): those
    // entries are kept in the step, so that undoing it puts the timeline back exactly as it was.
    record(before, after, label, dropped = []) {
      const m = before && 'tree' in before && 'tl' in before ? before : mark(before);
      const { label: text, shown } = typeof label === 'string' ? { label, shown: label } : label;
      const added = (after.timeline?.length ?? 0) + dropped.length - m.tl;     // as it was before anything was dropped
      const last = { at: m.tl, remove: Math.max(0, added), insert: [] };
      // Undoing runs the action backwards: first the dropped entries go back where they were (lowest
      // place first), then the ones the action added come off the end.
      const tl = dropped.length ? [...dropped.map((d) => ({ at: d.i, remove: 0, insert: [d.e] })), last] : last;
      const s = { label: text, shown: shown ?? null, ops: changes(after, m.tree), tl };
      s.bytes = JSON.stringify(s).length;
      undos.push(s); redos = [];
      trim();
    },
    undo: (state) => step(undos, redos, state),
    redo: (state) => step(redos, undos, state),
    list: () => undos.map((s) => s.label).reverse(),
    listRedo: () => redos.map((s) => s.label).reverse(),
    clear() { undos = []; redos = []; },
    // The whole history as plain JSON, to be kept beside the game it belongs to.
    dump: () => ({ v: 1, undos, redos }),
    // Take a dump back. Returns false, and leaves the history empty, if it is not a history this
    // module wrote. The limits apply as they do to a live history.
    restore(data) {
      undos = []; redos = [];
      if (!isObj(data) || data.v !== 1 || !Array.isArray(data.undos) || !Array.isArray(data.redos)) return false;
      if (![...data.undos, ...data.redos].every(isStep)) return false;
      undos = data.undos.map(rebuild); redos = data.redos.map(rebuild);
      trim();
      return true;
    },
    get bytes() { return bytes(); },
  };
}

// ---------- labels ----------
// A step is named in plain words from the action and what it did. Players are told only about
// steps they could see: every creature the action names must be one they know of, and at least
// one event must have reached them. Otherwise `shown` is null and they are told nothing.
const ACTS = { dash: 'took the Dash action', disengage: 'took the Disengage action', dodge: 'took the Dodge action', secondWind: 'used Second Wind', reactions: 'set standing instructions for reactions',
  endTurn: 'ended their turn', use: 'used something', check: 'made a check', search: 'searched', setSpeed: 'had their speed changed',
  editCharacter: 'was edited', setSize: 'changed size', give: 'had their gear changed', setHp: 'had their hit points set', harm: 'took damage', mend: 'was healed',
  condition: 'had a condition changed', place: 'was placed', remove: 'was removed', setLight: 'had their light changed', hide: 'tried to hide',
  feature: 'used a feature', shortRest: 'took a Short Rest', setSheet: 'had their sheet set', levelUp: 'levelled up' };

export function describeStep(action, events, before, after) {
  const prior = before?.tree ?? before;
  const name = (id) => after.entities[id]?.name ?? prior?.entities?.[id]?.name ?? 'Someone';
  const ev = (type) => events.find((e) => e.type === type);
  const a = action, who = name(a.actor);
  let label;
  switch (a.type) {
    case 'move': label = `${who} moved`; break;
    case 'attack': label = `${who} attacked ${name(a.target)}`; break;
    case 'cast': {
      // Its own cast, not a reaction cast against it (Counterspell). A spell that was countered
      // is named only for the DM: players are told whose spell failed, not which.
      const own = events.find((e) => e.type === 'cast' && e.actor === a.actor && !e.reaction), lost = ev('countered');
      if (lost) { label = { label: `${who}'s ${lost.name} was countered`, shown: `${who}'s spell was countered` }; break; }
      label = `${who} cast ${own?.name ?? 'a spell'}`; break;
    }
    // An answer to a reaction carries on the action that waited for it, and is named after that.
    case 'react': {
      const p = prior?.pending;
      if (!p) { label = 'A reaction was answered'; break; }
      const inner = describeStep(p.action, events, { tree: { ...prior, pending: undefined } }, after);
      return { label: `${inner.label} (after ${name(p.ask.reactor)}'s reaction)`, shown: inner.shown && `${inner.shown}, after a reaction` };
    }
    case 'spawn': label = `${name(ev('spawned')?.id)} was added`; break;
    case 'addCharacter': label = `${name(ev('spawned')?.id ?? ev('placed')?.id)} joined the party`; break;
    case 'reveal': label = `${who} was ${a.hidden ? 'hidden' : 'revealed'}`; break;
    case 'revealRegion': label = `${(after.map.regions.find((r) => r.id === a.region) ?? {}).name ?? 'A place'} was ${a.revealed === false ? 'hidden' : 'revealed'}`; break;
    case 'setObject': label = 'Something on the map was changed'; break;
    case 'mapEdit': label = 'The map was edited'; break;
    case 'loadMap': label = 'A new map was loaded'; break;
    case 'startEncounter': label = 'The fight began'; break;
    case 'endEncounter': label = 'The fight was ended'; break;
    case 'endEffect': label = 'A lasting effect was ended'; break;
    case 'rest': label = 'The long rest'; break;
    case 'advanceTime': label = `${a.minutes} minutes passed`; break;
    case 'chronicle': label = `Chronicle: ${String(a.title ?? '').trim().slice(0, 40)}`; break;
    case 'setting': label = 'A table rule was changed'; break;
    case 'act': label = `${who} used ${after.entities[a.actor]?.actions?.find((x) => x.id === a.action)?.name ?? prior?.entities?.[a.actor]?.actions?.find((x) => x.id === a.action)?.name ?? 'an action'}`; break;
    case 'follow': label = a.leader === null || a.leader === undefined ? `${who} stopped following` : `${who} started following ${name(a.leader)}`; break;
    case 'partyFollow': label = `The party fell in behind ${name(a.leader)}`; break;
    case 'marchingOrder': label = 'The marching order was set'; break;
    // Handouts and notes name no creature. Their titles and words are left out: a step is shown to
    // players who may not hold that handout.
    case 'handout': label = ev('handout')?.edited ? 'A handout was changed' : 'A handout was made'; break;
    case 'showHandout': label = 'A handout was shown'; break;
    case 'hideHandout': label = 'A handout was taken back'; break;
    case 'removeHandout': label = 'A handout was removed'; break;
    // Scenes. A label never holds what was said, nor anything of an NPC but whether they came or went.
    case 'scene': label = ev('sceneEdit') ? 'The scene was changed' : `A scene began: ${String(ev('sceneStart')?.title ?? '').slice(0, 40)}`; break;
    case 'endScene': label = 'The scene ended'; break;
    case 'sceneNpc': { const c = ev('sceneNpc')?.change; label = c === 'added' ? `${ev('sceneNpc').name} joined the scene` : c === 'removed' ? `${ev('sceneNpc').name} left the scene` : 'Someone in the scene was changed'; break; }
    case 'say': { const e = ev('say'); label = e?.as === null ? 'Something was said out of character' : `${e?.name ?? 'Someone'} spoke`; break; }
    case 'askCheck': label = 'A check was asked for'; break;
    case 'sceneChronicle': label = `Chronicle: ${String(a.title ?? '').trim().slice(0, 40)}`; break;
    case 'claim': label = `${name(a.entity)} was taken by ${a.userName ?? 'a player'}`; break;
    case 'release': label = `${name(a.entity)} was given up by their player`; break;
    case 'note': label = 'A note was sent'; break;
    default: label = ACTS[a.type] ? `${who} ${ACTS[a.type]}` : `${a.type} (an action)`;
  }
  const named = ['actor', 'target', 'entity'].map((k) => a[k]).filter((id) => typeof id === 'string');
  const known = named.every((id) => classify(after, id) !== 'hidden');
  const seen = viewEvents(events, after, { role: 'player' }).length > 0;
  const { label: text, shown } = typeof label === 'string' ? { label, shown: label } : label;
  // An action that stopped to ask about a reaction did nothing yet: players are told nothing of it.
  const asked = events.find((e) => e.type === 'reactionAsked');
  if (asked) return { label: `${text} (waiting for ${name(asked.id)}'s reaction)`, shown: null };
  return { label: text, shown: known && seen ? shown : null };
}
