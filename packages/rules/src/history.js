// Undo and redo for the DM.
//
//   const h = createHistory({ limit: 30 });
//   const before = mark(state);                // just before apply()
//   const res = apply(state, action, ctx);
//   if (res.ok && undoable(action)) h.record(before, state, describeStep(action, res.events, before, state));
//   h.undo(state)  -> { state, label, shown } or null     (state is changed in place and returned)
//   h.redo(state)  -> the same, the other way
//   h.list()       -> labels of what can be undone, newest first; h.listRedo() likewise
//   h.track(action, events, before, state)    // after a recorded action: keeps or drops the pins
//   h.rewind(state, 'fight' | 'rest') -> { state, label, shown } or null      (one undoable step)
//   h.pins()       -> { fight, rest }: whether each can be gone back to
//
// Each step is kept as a reverse patch: the changes that turn the state after an action back into
// the state before it, down to the dice seed, the clock, the order of keys and the timeline entries
// the action added. Undoing gives back exactly the JSON the game had, so the same action taken
// again rolls the same dice. The history is not part of the game state: it is never saved with the
// game and never sent to players. Pure: no network, no clock, no randomness.
import { viewEvents, classify, seenName } from './view.js';
import { learnShops } from './shopids.js';

export const UNDO_LIMIT = 30;
export const UNDO_BYTES = 8 * 1024 * 1024;       // per game, both lists together

// Lobby changes are who sits where, not the game: they are never undone.
const LOBBY = new Set(['claim', 'release', 'ping', 'offer', 'decline']);      // a ping changes nothing to take back
export const undoable = (action) => !LOBBY.has(action?.type);

// What a state looked like, cheaply enough to take before every action. The timeline only ever
// grows, so only its length is kept; its place among the keys is kept with a null.
// The imported market packs (`markets`; docs/specs/shops.md) are held by reference, not copied: no action changes them in place (the
// `market` action puts a new list in whole, engine/trade.js), so the copy of before stays true, and a step that did not touch them finds
// the very same list after and costs nothing to compare. Up to 20 packs of 128 KB would otherwise be copied before every action.
export function mark(state) {
  const keep = Object.hasOwn(state, 'markets') && state.markets !== null && typeof state.markets === 'object';
  const tree = structuredClone({ ...state, timeline: null, ...(keep ? { markets: null } : {}) });
  if (keep) tree.markets = state.markets;
  return { tree, tl: state.timeline?.length ?? 0 };
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
      // The market packs (`markets`) are an atom: put back whole, never edited item by item, since `mark()` and the pins share the list
      // with the state by reference and nothing may change it in place (docs/specs/shops.md, build notes P3).
      else if (!same(a[k], b[k])) { if (!path.length && k === 'markets') ops.push({ p: [k], v: b[k] }); else changes(a[k], b[k], [...path, k], ops); }
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

// Pins (docs/specs/table-ui.md, Decision 1): a whole copy of the state, as mark() takes it, from just
// before a fight began and from just after the last rest, so the DM can go back further than the undo
// list reaches. They share the byte budget but are never trimmed to make room; steps are.
const PIN_KINDS = ['fight', 'rest'];
const isPin = (p) => isObj(p) && isObj(p.tree) && Number.isInteger(p.tl) && p.tl >= 0 && isObj(p.tree.entities) && Number.isInteger(p.tree.version);
const pinOf = (m) => ({ tree: m.tree, tl: m.tl, bytes: JSON.stringify(m.tree).length });
export const REWIND_LABELS = { fight: 'The table went back to the start of the fight', rest: 'The table went back to the last rest' };

export function createHistory({ limit = UNDO_LIMIT, maxBytes = UNDO_BYTES } = {}) {
  let undos = [], redos = [], pins = { fight: null, rest: null };
  const bytes = () => [...undos, ...redos].reduce((n, s) => n + s.bytes, 0) + PIN_KINDS.reduce((n, k) => n + (pins[k]?.bytes ?? 0), 0);
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
    clear() { undos = []; redos = []; pins = { fight: null, rest: null }; },
    // After an action that was recorded: a fight that began pins the state from before the action
    // (`before`, its mark); a rest pins the state after it and drops the fight pin; a new map drops both. Going to a place
    // of a world (`loadMap { node }` and the travel actions) drops neither: the place left is kept in the state, so a
    // rewind to the last rest crosses it like anything else (docs/specs/travel.md, Decision 11).
    // Taking an action back with undo leaves the pins as they are.
    track(action, events, before, after) {
      // Returns whether the pins changed, so a caller that keeps them elsewhere knows to write them.
      const was = pins;
      if (action?.type === 'loadMap' && action.node === undefined) pins = { fight: null, rest: null };
      else {
        const started = events.some((e) => e.type === 'encounterStart'), rested = events.some((e) => e.type === 'rest');
        if (!started && !rested) return false;
        pins = { ...pins };
        if (started) pins.fight = pinOf(before && 'tree' in before && 'tl' in before ? before : mark(before));
        if (rested) { pins.rest = pinOf(mark(after)); pins.fight = null; }
      }
      trim();
      return pins.fight !== was.fight || pins.rest !== was.rest;
    },
    pins: () => ({ fight: !!pins.fight, rest: !!pins.rest }),
    // Put the state back as it was at a pin, as one undoable step. Kept from now, not from the pin:
    // the dice stream (`rng`, so the same choices do not roll the same results), the id counter
    // (`seq`, so a fight fought again has a new id), the timeline (the record keeps what happened,
    // the lost fight too) and who holds which character (as undo never changes it).
    rewind(state, kind) {
      const p = pins[kind];
      if (!p) return null;
      const before = mark(state), was = state, tl = state.timeline;
      const keep = Object.hasOwn(p.tree, 'markets') && p.tree.markets !== null && typeof p.tree.markets === 'object';
      const tree = structuredClone(keep ? { ...p.tree, markets: null } : p.tree), owners = {};
      if (keep) tree.markets = p.tree.markets;                 // the market list as pinned, shared and never edited (see mark)
      for (const [id, e] of Object.entries(was.entities ?? {})) owners[id] = { owner: e.owner, ownerName: e.ownerName };
      const rng = state.rng, seq = state.seq, fights = state.fightSeq, shopSeq = state.shopSeq, aliases = state.shopAlias;
      for (const k of Object.keys(state)) delete state[k];
      for (const [k, v] of Object.entries(tree)) state[k] = k === 'timeline' ? tl : v;
      state.rng = rng;
      if (Number.isInteger(seq)) state.seq = Math.max(seq, state.seq ?? 0);
      if (Number.isInteger(shopSeq)) state.shopSeq = Math.max(shopSeq, state.shopSeq ?? 0);                      // a shop opened again has a new id
      if (Array.isArray(aliases) && aliases.length > (state.shopAlias?.length ?? 0)) state.shopAlias = [...aliases];      // a number given never comes to mean another shop
      learnShops(state);                                                                                          // a pin from before version 29 has no list: the shops shown are numbered now
      if (Number.isInteger(fights)) state.fightSeq = Math.max(fights, state.fightSeq ?? 0);      // a fight fought again has a new number too
      for (const [id, e] of Object.entries(state.entities)) {
        if (!owners[id]) continue;
        for (const k of ['owner', 'ownerName']) { if (owners[id][k] === undefined) delete e[k]; else e[k] = owners[id][k]; }
      }
      const label = REWIND_LABELS[kind];
      this.record(before, state, { label, shown: label });
      return { state, label, shown: label };
    },
    // The whole history as plain JSON, to be kept beside the game it belongs to.
    dump: () => ({ v: 2, undos, redos, pins: { fight: pins.fight && { tree: pins.fight.tree, tl: pins.fight.tl }, rest: pins.rest && { tree: pins.rest.tree, tl: pins.rest.tl } } }),
    // Take a dump back. Returns false, and leaves the history empty, if it is not a history this
    // module wrote. The limits apply as they do to a live history. A dump from before pins (v 1) has none.
    restore(data) {
      undos = []; redos = []; pins = { fight: null, rest: null };
      if (!isObj(data) || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.undos) || !Array.isArray(data.redos)) return false;
      if (![...data.undos, ...data.redos].every(isStep)) return false;
      const saved = data.v === 2 && isObj(data.pins) ? data.pins : {};
      if (PIN_KINDS.some((k) => saved[k] !== undefined && saved[k] !== null && !isPin(saved[k]))) return false;
      undos = data.undos.map(rebuild); redos = data.redos.map(rebuild);
      for (const k of PIN_KINDS) if (saved[k]) pins[k] = pinOf(saved[k]);
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
const ACTS = { dash: 'took the Dash action', disengage: 'took the Disengage action', dodge: 'took the Dodge action', secondWind: 'used Second Wind', reactions: 'set standing instructions for reactions', hitChoices: 'set standing instructions for what to do after a hit',
  endTurn: 'ended their turn', use: 'used something', check: 'made a check', search: 'searched', setSpeed: 'had their speed changed',
  editCharacter: 'was edited', setSize: 'changed size', give: 'had their gear changed', setHp: 'had their hit points set', harm: 'took damage', mend: 'was healed', setAc: 'had their Armor Class set',
  condition: 'had a condition changed', place: 'was placed', remove: 'was removed', setLight: 'had their light changed', hide: 'tried to hide',
  feature: 'used a feature', stand: 'stood up', shortRest: 'took a Short Rest', setSheet: 'had their sheet set', rollHp: 'rolled Hit Points', rerollHp: 'rolled a Hit Point die again', rollAbilityScores: 'rolled ability scores', rerollAbilityScore: 'rolled an ability score again', levelUp: 'levelled up', equip: 'put on or took off an item', shield: 'put a Shield away or took it up', attune: 'chose an item to attune to',
  forgoMove: 'gave up their movement', drop: 'dropped something', pickUp: 'picked something up', escape: 'tried to escape a grapple' };

// How a formation reads in a step's label (engine/world.js, SHAPES).
const SHAPE_WORDS = { column: 'in single file', pairs: 'two abreast', line: 'four across', wedge: 'in a wedge', held: 'as they stand' };

export function describeStep(action, events, before, after) {
  const prior = before?.tree ?? before;
  // A familiar in a pocket dimension (stage C5c) is in its master's record, not among the creatures.
  const pocketed = (st, id) => { const m = st?.entities?.[action.actor]; return m?.pocket && Object.hasOwn(m.pocket, id) ? m.pocket[id] : null; };
  const find = (id) => after.entities[id] ?? prior?.entities?.[id] ?? pocketed(after, id) ?? pocketed(prior, id);
  const real = (id) => find(id)?.name ?? 'Someone';
  // Players are told a creature's name as they see it: one not of the party in a form is the Beast (view.js, seenName).
  const seen = (id) => { const e = find(id); return e ? seenName(e) : 'Someone'; };
  const ev = (type) => events.find((e) => e.type === type);
  if (action.type === 'react') {
    // An answer to a reaction carries on the action that waited for it, and is named after that.
    const p = prior?.pending;
    if (!p) return finish('A reaction was answered');
    const inner = describeStep(p.action, events, { tree: { ...prior, pending: undefined } }, after);
    return { label: `${inner.label} (after ${real(p.ask.reactor)}'s reaction)`, shown: inner.shown && `${inner.shown}, after a reaction` };
  }
  const text = phrase(real), shown = phrase(seen);
  return finish({ label: typeof text === 'string' ? text : text.label, shown: typeof shown === 'string' ? shown : shown.shown });

  // The creatures of a move, by name. For players (`party`), only those of the party they know of, before the move or after
  // it (view.js, classify: one now in a parked place is in neither, and is not named); none of those: null, and players are
  // told nothing of the step (review of #580, L2).
  function shownIds(ids) {
    return (Array.isArray(ids) ? ids : []).filter((id) => find(id)?.side === 'party' && (classify(after, id) === 'open' || (prior?.entities && classify(prior, id) === 'open')));
  }
  function names(ids, name, party = false) {
    const list = (party ? shownIds(ids) : Array.isArray(ids) ? ids : []).map(name);
    if (!list.length) return party ? null : 'Nobody';
    return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  }
  function told(who, words) { return who === null ? null : `${who} ${words}`; }
  // A shop by the action's id, as it is after the step or was before it (closed, it is only in the state before).
  function shopName() {
    const id = events.find((e) => typeof e.shop === 'string')?.shop ?? action.shop;      // the events carry the shop's own id; a player's action, the number they were given
    const sh = (after.shops ?? []).find((x) => x.id === id) ?? (prior?.shops ?? []).find((x) => x.id === id);
    return sh?.name ?? 'A shop';
  }
  function place(e) { return e?.name ?? 'a place'; }

  function phrase(name) {
  const a = action, who = name(a.actor);
  let label;
  switch (a.type) {
    case 'move': label = `${who} moved`; break;
    case 'shield': label = ev('shield')?.on === false ? 'Shield away' : 'Shield up'; break;
    // An Unarmed Strike's Grapple and Shove options are named for what they are (docs/specs/grapple-shove.md).
    case 'attack': label = `${who} ${a.option === 'grapple' ? 'grappled' : a.option === 'shove' ? 'shoved' : 'attacked'} ${name(a.target)}`; break;
    case 'letGo': label = `${who} let go of ${name(a.target)}`; break;
    case 'cast': {
      // Its own cast, not a reaction cast against it (Counterspell). A spell that was countered
      // is named only for the DM: players are told whose spell failed, not which.
      const own = events.find((e) => e.type === 'cast' && e.actor === a.actor && !e.reaction), lost = ev('countered');
      if (lost) { label = { label: `${who}'s ${lost.name} was countered`, shown: `${who}'s spell was countered` }; break; }
      label = `${who} cast ${own?.name ?? 'a spell'}`; break;
    }
    case 'spawn': label = `${name(ev('spawned')?.id)} was added`; break;
    case 'addCharacter': label = `${name(ev('spawned')?.id ?? ev('placed')?.id)} joined the party`; break;
    case 'reveal': label = `${who} was ${a.hidden ? 'hidden' : 'revealed'}`; break;
    case 'revealRegion': label = `${(after.map.regions.find((r) => r.id === a.region) ?? {}).name ?? 'A place'} was ${a.revealed === false ? 'hidden' : 'revealed'}`; break;
    case 'setObject': label = 'Something on the map was changed'; break;
    case 'refresh': label = 'Refreshed from sheet'; break;
    case 'mapEdit': label = 'The map was edited'; break;
    case 'loadMap': label = a.node === undefined ? 'A new map was loaded' : { label: `${names(ev('arrived')?.ids, name)} went to ${place(ev('arrived'))}`, shown: told(names(ev('arrived')?.ids, name, true), 'moved on') }; break;
    // Places of a world (docs/specs/travel.md, W2). A place is named for the DM only: players are told who went, never where.
    case 'enter': label = { label: `${names(ev('arrived')?.ids, name)} went into ${place(ev('arrived'))}`, shown: told(names(ev('arrived')?.ids, name, true), 'went in') }; break;
    case 'leave': label = { label: `${names(ev('arrived')?.ids, name)} went out to ${place(ev('arrived'))}`, shown: told(names(ev('arrived')?.ids, name, true), 'went out') }; break;
    case 'goTo': label = { label: `The table cut to ${place(ev('cut'))}`, shown: 'The table cut to another place' }; break;
    case 'forgetPlace': label = { label: `${place(ev('placeForgotten'))} was let go`, shown: null }; break;
    case 'keepPlace': label = { label: `${place(ev('placeKept'))} was kept as it was left`, shown: null }; break;
    case 'resetPlace': label = { label: `${place(ev('placeReset'))} was put back as prepared`, shown: null }; break;
    case 'nodeAdd': label = { label: `A place was added: ${place(ev('nodeAdded'))}`, shown: null }; break;
    case 'startEncounter': label = 'The fight began'; break;
    case 'endEncounter': label = 'The fight was ended'; break;
    case 'endEffect': label = 'A lasting effect was ended'; break;
    case 'rest': label = 'The long rest'; break;
    case 'advanceTime': label = `${a.minutes} minutes passed`; break;
    case 'chronicle': label = `Chronicle: ${String(a.title ?? '').trim().slice(0, 40)}`; break;
    case 'setting': label = 'A table rule was changed'; break;
    case 'setPacks': label = { label: "The table's homebrew packs were set", shown: null }; break;
    case 'worldIndex': label = { label: 'A world was loaded', shown: null }; break;     // the server's, recording the DM's world pack (travel W3); players are told nothing, and no world id or name is in the label     // the DM's; players are told nothing, and no pack id is in the label
    case 'conclusion': label = a.publish ? 'The rewards were given out' : a.skip ? 'The rewards were skipped' : 'The rewards were changed'; break;
    // A called save (docs/specs/prompts.md): the DM's, and players are told nothing of the step (the save events say what they may know).
    case 'save': label = { label: `A ${a.ability ?? ''} saving throw was called`.replace('  ', ' '), shown: null }; break;
    case 'act': label = `${who} used ${after.entities[a.actor]?.actions?.find((x) => x.id === a.action)?.name ?? prior?.entities?.[a.actor]?.actions?.find((x) => x.id === a.action)?.name ?? 'an action'}`; break;
    case 'joinFight': { const ids = events.filter((e) => e.type === 'joined').map((e) => e.id); label = ids.length ? `${who} brought ${names(ids, name)} into the fight` : `${who} tried to bring the others into the fight`; break; }
    case 'follow': label = a.leader === null || a.leader === undefined ? `${who} stopped following` : `${who} started following ${name(a.leader)}`; break;
    case 'partyFollow': label = `The party fell in behind ${name(a.leader)}${SHAPE_WORDS[a.shape] ? ` ${SHAPE_WORDS[a.shape]}` : ''}`; break;
    case 'formation': label = a.slots ? `The places behind ${name(a.leader)} were changed` : `The party walks behind ${name(a.leader)} ${SHAPE_WORDS[a.shape] ?? 'in a formation'}`; break;
    case 'marchingOrder': label = 'The marching order was set'; break;
    // Handouts and notes name no creature. Their titles and words are left out: a step is shown to
    // players who may not hold that handout.
    case 'handout': label = ev('handout')?.edited ? 'A handout was changed' : 'A handout was made'; break;
    case 'showHandout': label = 'A handout was shown'; break;
    case 'hideHandout': label = 'A handout was taken back'; break;
    case 'removeHandout': label = 'A handout was removed'; break;
    case 'todoDone': label = { label: a.all === true ? 'Every to-do card was done' : 'A to-do card was done', shown: null }; break;     // the DM's alone (todo.js)
    // Shops (docs/specs/shops.md, Decision 9). The DM's steps are the DM's: players are told nothing of them, and no label shown to a
    // player names a shop, a line or a price (a player the shop is not shown to hears the step too; the gear and coins events say what
    // changed hands to those who may know).
    case 'market': label = { label: a.remove !== undefined ? `A market was removed: ${ev('market')?.name ?? 'a market'}` : `A market was imported: ${ev('market')?.name ?? 'a market'}`, shown: null }; break;
    case 'openShop': label = { label: `${shopName()} was opened`, shown: null }; break;
    case 'shopEdit': label = { label: `${shopName()} was changed`, shown: null }; break;
    case 'showShop': label = { label: a.to === 'none' ? `The DM hid ${shopName()} from everyone` : a.to === 'all' ? `The DM showed ${shopName()} to everyone` : `The DM showed ${shopName()} to some players`, shown: null }; break;
    case 'revealGoods': label = { label: `${ev('goodsRevealed')?.name ?? 'Something'} was ${a.hide === true ? 'hidden again' : 'revealed'} at ${shopName()}`, shown: null }; break;
    case 'closeShop': label = { label: `${shopName()} was closed`, shown: null }; break;
    case 'quote': { const q = ev('quoted'); label = { label: q?.withdrawn ? `The offer to ${name(a.for)} was withdrawn` : `${shopName()} quoted ${name(a.for)} ${q?.price ?? '?'} CP for ${q?.name ?? 'something'}`, shown: null }; break; }
    case 'buy': {
      const b = ev('bought'), j = ev('jointOpened');
      label = b ? { label: `${who} bought ${b.qty > 1 ? `${b.name} x${b.qty}` : b.name}${b.payers ? ' with help' : ''}`, shown: `${who} bought something` }
        : j ? { label: `${who} began buying ${j.name} with help`, shown: `${who} began a purchase with help` }
          : { label: `${who} called off a purchase with help`, shown: `${who} called off a purchase` };
      break;
    }
    case 'chipIn': label = { label: a.share ? `${who} pledged ${a.share} CP towards a purchase` : `${who} took back a pledge`, shown: `${who} changed a pledge` }; break;
    case 'sell': { const x = ev('sold'); label = { label: `${who} sold ${x ? (x.qty > 1 ? `${x.name} x${x.qty}` : x.name) : 'something'}`, shown: `${who} sold something` }; break; }
    case 'take': {
      const x = ev('took');
      label = a.split !== undefined ? { label: `The DM shared out ${shopName()}`, shown: 'Coins were shared out' }
        : { label: `${who} took ${x?.coins ? 'coins' : x?.name ?? 'something'} from ${shopName()}`, shown: `${who} took something` };
      break;
    }
    // Scenes. A label never holds what was said, nor anything of an NPC but whether they came or went.
    case 'scene': label = ev('sceneEdit') ? 'The scene was changed' : `A scene began: ${String(ev('sceneStart')?.title ?? '').slice(0, 40)}`; break;
    case 'endScene': label = 'The scene ended'; break;
    case 'sceneNpc': { const c = ev('sceneNpc')?.change; label = c === 'added' ? `${ev('sceneNpc').name} joined the scene` : c === 'removed' ? `${ev('sceneNpc').name} left the scene` : 'Someone in the scene was changed'; break; }
    case 'ping': label = 'A spot was pointed out'; break;
    case 'say': { const e = ev('say'); label = e?.as === null ? 'Something was said out of character' : `${e?.name ?? 'Someone'} spoke`; break; }
    case 'askCheck': label = 'A check was asked for'; break;
    case 'sceneChronicle': label = `Chronicle: ${String(a.title ?? '').trim().slice(0, 40)}`; break;
    case 'claim': label = `${name(a.entity)} was taken by ${a.userName ?? 'a player'}`; break;
    // An offered character is the DM's business until it is let in: players are told nothing of an offer or a refusal, and of an admission only what `claim` says.
    case 'offer': label = { label: `${ev('offered')?.name ?? 'A character'} was offered`, shown: null }; break;
    case 'decline': label = { label: 'An offered character was declined', shown: null }; break;
    case 'admit': label = `${real(ev('admitted')?.id)} was admitted to the table`; break;
    case 'release': label = `${name(a.entity)} was given up by their player`; break;
    case 'note': label = 'A note was sent'; break;
    // Stepping away (E20). Players are told of a party creature's; of another's only that the order changed.
    case 'stepAway': case 'stepBack': {
      const back = a.type === 'stepBack', asked = ev('away')?.asked || ev('back')?.asked;
      const text = back ? (asked ? `${who} took back asking to step away` : `${who} came back`) : asked ? `${who} asked to step away` : `${who} stepped away`;
      label = classify(after, a.actor) === 'open' ? text : { label: `${who} was ${back ? 'brought back' : 'set aside'}`, shown: 'The turn order was changed' };
      break;
    }
    // Items between creatures (E17): never what was handed over; the gear events say that to those who may know.
    case 'pass': label = `${who} handed something to ${name(a.to)}`; break;
    // Companions (docs/specs/companions.md). Players are told only of the party's own (the events say so).
    case 'bond': label = a.to === null || a.to === undefined ? `${who} was freed from ${name(ev('unbonded')?.from)}` : `${who} became ${name(a.to)}'s companion`; break;
    case 'companionOrder': label = `${name(a.id)} will act ${a.order === 'before' ? 'before' : 'after'} ${who}`; break;
    case 'command': { const n = Array.isArray(a.ids) ? a.ids.length : 0; label = n === 1 ? `${who} commanded ${name(a.ids[0])}` : `${who} commanded ${n} companions`; break; }
    // The pocket dimension (stage C5c): a familiar sent there, sent away for good, or brought back; a summon dismissed.
    case 'dismiss': label = ev('pocketed') ? `${who} dismissed ${name(a.id)} to a pocket dimension` : `${who} dismissed ${name(a.id)}${a.forever === true ? ' forever' : ''}`; break;
    case 'recall': label = `${who} called ${name(a.id)} back`; break;
    // Riding (stage C6a).
    case 'mount': label = `${who} mounted ${name(a.mount)}`; break;
    case 'place': if (a.node !== undefined) { const r = ev('relocated'), ids = r?.ids ?? []; label = { label: `${names(ids, name)} ${ids.length === 1 ? 'was' : 'were'} placed at ${place(r)}`, shown: told(names(ids, name, true), shownIds(ids).length === 1 ? 'was placed' : 'were placed') }; break; }
      label = `${who} ${ACTS.place}`; break;
    case 'dismount': label = `${who} dismounted`; break;
    case 'companion': label = a.auto ? `${who} was left to the engine to play` : `${who} waits for its player again`; break;
    default: label = ACTS[a.type] ? `${who} ${ACTS[a.type]}` : `${a.type} (an action)`;
  }
  return label;
  }

  function finish(label) {
  const a = action;
  const named = ['actor', 'target', 'entity', ...(a.type === 'pass' || a.type === 'bond' ? ['to'] : []), ...(a.type === 'mount' ? ['mount'] : [])].map((k) => a[k]).filter((id) => typeof id === 'string');      // `pass` names its taker in `to`, `bond` the master
  // A companion that vanished in this step where the party could see it is one players knew of (view.js, viewEvents).
  const gone = new Set(events.filter((e) => (e.type === 'vanished' || e.type === 'pocketed') && e.seen === true).map((e) => e.id));
  const known = named.every((id) => gone.has(id) || classify(after, id) !== 'hidden');
  // Heard by some player: by any, or by the one who runs a homebrew creature the step is about (an event stamped `hb`, engine.js), who
  // is told what no other player is.
  const runners = [...new Set(events.flatMap((e) => (e.hb ? Object.values(e.hb) : [])).filter((u) => typeof u === 'string'))];
  const heard = [{ role: 'player' }, ...runners.map((userId) => ({ role: 'player', userId }))].some((v) => viewEvents(events, after, v).length > 0);
  const { label: text, shown } = typeof label === 'string' ? { label, shown: label } : label;
  // An action that stopped to ask about a reaction did nothing yet: players are told nothing of it.
  const asked = events.find((e) => e.type === 'reactionAsked');
  if (asked) return { label: `${text} (waiting for ${real(asked.id)}'s reaction)`, shown: null };
  return { label: text, shown: known && heard ? shown : null };
  }
}
