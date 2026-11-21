// Rules engine. Pure game logic: no rendering, no network, no clock but the in-world one.
//
//   apply(state, action, ctx) -> { ok, error?, events }
//
// Everything that happens in the game goes through apply(). The engine validates the
// action against the rules, mutates state, and returns events. Renderers turn events
// into numbers or animations; the server broadcasts them; the timeline records them;
// an AI DM or AI character is just another caller of apply().
import { FT, ground, under } from './space.js';
import { fightEndsScene } from './scenes.js';
import { remember, sightRule, unknown } from './vision.js';
import { mayAsk, opportunityAttack, WHILE_WAITING } from './reactions.js';
import { control, controllerOf, current, fail, homebrewBlock, homebrewCreatures, homebrewSources, ownerOf, Pause, RuleError, RUN, setRun } from './engine/shared.js';
import { aloft, lookAround, mayBeHeavy } from './engine/world.js';
import { checkEvents, startWork, stopWork, WorkLimit } from './effects.js';
import { checkEnd, fall, NotBattleMap, settleBonds, settleHolds } from './engine/resolve.js';
import { NO_WALK, staleCheck } from './places.js';
import { learn, translate } from './known.js';
import { learnShops, translateShops } from './shopids.js';
import { watch } from './engine/features.js';
import { handlers as movement } from './engine/movement.js';
import { handlers as attacks } from './engine/attacks.js';
import { handlers as casting } from './engine/casting.js';
import { handlers as features } from './engine/features.js';
import { handlers as characters } from './engine/characters.js';
import { handlers as rests } from './engine/rests.js';
import { handlers as dm } from './engine/dm.js';
import { handlers as companions } from './engine/companions.js';
import { handlers as travel } from './engine/travel.js';
import { handlers as trade, settleShops } from './engine/trade.js';
// What the engine exports lives in engine/ by domain (see CLAUDE.md, Engine layout); importers
// keep importing it from here.
export { ARENA_RADIUS, blocked, castAbilOf, clear, commandedNow, current, dying, EXPLORE_BUDGET, fallen, featOf, controllerOf, FLY_CEILING, hbId, homebrewBlock, hostile, inFight, living, mod, ownerOf, spellStats, steering, unblocked, up } from './engine/shared.js';
export { BOND_KINDS, BOND_MAX } from './engine/companions.js';   // companions (docs/specs/companions.md, C1)
export { vanish } from './engine/resolve.js';
export { presetSlots, SHAPES, SLOT_MAX, slotsFor, validFormation, validSlot } from './engine/world.js';   // formations (#303)
export { aimArea, aloft, areaHexes, areaTargets, CATCH_UP, contentName, creatureType, holdsOf, isPile, moveOptions, nearObject, NOTICE_FEET, objectName, objectShown, openContents, PILE_MAX, pileContents, pileOpen, SEARCH_FEET, targetsFor } from './engine/world.js';
export { GEAR_MAX, HAND_FEET, interactionOf, passTargets, pickUpsFor } from './engine/characters.js';
export { checkBonus, passive, rollMode } from './engine/rolls.js';
export { makeEntity } from './engine/sheets.js';
export { ENGAGE_RANGE } from './engine/movement.js';
export { actionSpent, attacksLeft, fromPool, partRefusal } from './engine/attacks.js';
export { teleportSpot } from './engine/casting.js';
export { HIDE_DC, hideProblem, itemUsesFor, scrollStats, usesFor } from './engine/features.js';
export { SETTINGS, SETTING_TEXT } from './engine/dm.js';
export { DAWN, dawnsBetween } from './engine/rests.js';
export { AWAY, awayHow, NOT_BATTLE } from './engine/resolve.js';
export { TRAVEL_LIMITS } from './places.js';             // places of a world (docs/specs/travel.md, W2)
export { lineName, marketEnv, marketOfShop, placeProblem, TRADE_LIMITS } from './engine/trade.js';     // purses and shops (docs/specs/shops.md, P3)

export { FT };                       // feet per hex
export { opportunityAttack };

// Every action's handler, from the domain modules in engine/ (CLAUDE.md, Engine layout). An action
// type is defined in one module only: if two defined it, the later spread would win silently.
const handlers = buildHandlers([movement, attacks, casting, features, characters, rests, dm, companions, travel, trade, {
  // { type: 'react', prompt, take: reactionId | null, slot? }: the answer to the reaction an action
  // is waiting on (`pending`; reactions.js). Given by the reacting creature's controller or the DM
  // (the DM's answer overrides). `prompt` is the number it was asked under, so an answer to an
  // older question is refused. `take: null` declines. `slot` picks the spell slot, from those offered.
  // The waiting action then runs again from where it began, with this answer and those before it,
  // and its events are this action's (it may stop again to ask another).
  react(s, a, ctx, ev) {
    const p = s.pending || fail('No reaction is waiting for an answer.');
    a.prompt === p.n || fail('That question has already been answered.');
    const t = s.entities[p.ask.reactor] || fail('No such creature.');
    control(s, t, ctx);
    let answer = { reactor: t.id, take: null };
    if (a.take !== null && a.take !== undefined) {
      const o = p.ask.options.find((x) => x.reaction === a.take) || fail(`${t.name} can't answer with that.`);
      if (a.slot !== undefined) (o.slots?.includes(a.slot)) || fail(o.slots ? `${o.name} can be cast with a level ${o.slots.join(', ')} slot.` : `${o.name} uses no spell slot.`);
      answer = { reactor: t.id, take: o.reaction, ...(a.slot !== undefined ? { slot: a.slot } : {}) };
    } else if (a.slot !== undefined) fail('A slot is chosen only with a reaction to take.');
    const { action, ctx: was, answers } = p;
    delete s.pending;
    ev.push({ type: 'reactionAnswered', id: t.id, n: p.n, take: answer.take, by: ctx.role === 'dm' ? 'dm' : 'player' });
    Object.assign(RUN, { action, ctx: was, answers: [...answers, answer], i: 0 });
    dispatch(s, action, was, ev);
  },
}], ['movement', 'attacks', 'casting', 'features', 'characters', 'rests', 'dm', 'companions', 'travel', 'trade', 'engine']);

// Builds the table of handlers, a Map keyed by action type: a lookup can then never find what every
// object has (`toString`, `constructor`, `__proto__`). Throws, naming both modules, if two modules
// define the same action type, so the later one cannot win silently.
export function buildHandlers(modules, names = modules.map((_, i) => `module ${i}`)) {
  const table = new Map(), from = new Map();
  modules.forEach((m, i) => {
    for (const [type, h] of Object.entries(m)) {
      if (table.has(type)) throw new Error(`Action "${type}" is defined in both ${from.get(type)} and ${names[i]}; an action type belongs to one module.`);
      table.set(type, h);
      from.set(type, names[i]);
    }
  });
  return table;
}

// Every action type the engine handles (history.js is tested to have a label for each).
export const ACTION_TYPES = [...handlers.keys()];

// Whatever has nothing under it and no way to stay up, falls. Run after every action, so that a
// flyer knocked Prone, a floor that gives way and a creature set down in mid-air all come out the same.
function gravity(s, ev) {
  let any = false;
  for (const e of Object.values(s.entities)) {
    if (ground(s.map, e.pos) || aloft(s, e)) continue;
    const sf = under(s.map, e.pos);
    if (!sf) continue;                                   // nothing below at all: the DM's to sort out
    const feet = e.pos.z - sf.z;
    e.pos = { q: e.pos.q, r: e.pos.r, z: sf.z };
    if (e.dead) continue;
    any = true;
    fall(s, e, feet, ev);
    lookAround(s, ev, [e]);
  }
  if (any) checkEnd(s, ev);
}

// After every action under the los and light rules: whatever region the party now has in sight is
// revealed, and what it makes out is remembered (vision.js).
function look(s, ev) {
  if (sightRule(s) === 'rooms') return;
  lookAround(s, ev);
  remember(s);
}

// The fields of an action that name creatures, one id or a list of them. (`follow`'s `leader` is
// not one: its handler gives one answer for a creature that is not there and one not in the party. `deliver` is a cast's
// familiar, stage C5c; `dismiss` and `recall` look at their `id` in companions.js, as `companionOrder` does.)
const CREATURE_FIELDS = ['actor', 'target', 'entity', 'targets', 'spare', 'ids', 'order', 'deliver', 'who'];

// Run one action's handler. Also how a waiting action is run again when its reaction is answered.
function dispatch(s, action, ctx, ev) {
  // To anyone but the DM a hidden creature does not exist. Answering "it's 40 ft away" or
  // "it isn't yours" to a guessed id would confirm that it does.
  // So every creature id a player sends, in any field that names creatures, must be one the party
  // knows of, and one that is not gets the very answer an id that is nothing gets, before anything
  // else is looked at (issue #136). tests/hidden-ids.test.js walks every field every handler reads.
  if (ctx.role !== 'dm') {
    for (const k of CREATURE_FIELDS) {
      if (k === 'order' && (action?.type === 'companionOrder' || action?.type === 'command')) continue;    // there `order` is 'before' or 'after', or a command's words, not creatures; companionOrder's `id` is looked at in companions.js
      const v = action?.[k];
      // A field that names creatures is an id or a flat list of ids, or it is not there (undefined or null). Anything else (a number, an object, a list inside a list,
      // a list with a non-id in it) is refused as an id that is nothing, before a handler can coerce it: `s.entities[['m15']]` is `s.entities.m15` (review of #532, H1).
      if (v === undefined || v === null) continue;
      const ids = Array.isArray(v) ? v : [v];
      if (!ids.every((id) => typeof id === 'string')) fail('No such creature.');
      for (const id of ids) {
        const e = Object.hasOwn(s.entities, id) ? s.entities[id] : null;
        if (!e || unknown(s, e)) fail('No such creature.');
      }
    }
  }
  // Only a string type that is in the table is an action; anything else (no action, no type, a type
  // that is not a string, `toString`) is refused as unknown.
  // The places, pins and entries a player names are the ids they were given (known.js); each is turned into the world's own
  // here, and one that is nothing to them is refused as a place that does not exist, before the handler looks at anything.
  // The same for a shop: a player names it by the number it was given (shopids.js); any other id is refused as "No such shop.".
  if (ctx.role !== 'dm') action = translateShops(s, translate(s, action, fail), fail, ctx);
  const type = action?.type;
  const h = (typeof type === 'string' && handlers.get(type)) || fail(`Unknown action: ${typeof type === 'object' && type !== null ? 'not a name' : typeof type === 'symbol' ? type.toString() : String(type)}`);
  // Nobody walks on a holding map (docs/specs/travel.md, Decision 1): on a navigation or scene node a group stands at a pin,
  // and moves between pins and places, never by cells. Refused for everyone alike, before anything is looked at, so the
  // answer never depends on what is near: a walk that would have met a foe the party cannot see is refused in the same
  // words as any other (review of #580, M1).
  if (type === 'move' && s.map?.holding) fail(NO_WALK);
  // While an action waits for a reaction, nothing that could change how it comes out may happen.
  if (s.pending && !WHILE_WAITING.has(action.type)) fail('The table is waiting for a reaction to be answered.');
  h(s, action, ctx, ev);
}

// A copy of the game to put back if the action stops to ask (or a resumed one is refused). The
// timeline is left out: nothing is added to it until the action is done.
//
// The terrain (`map.levels`: every tile, and `map.walls`) is the bulk of a big map, and play never changes it in place: only the DM's
// `mapEdit` and `loadMap` change it, and they work on a copy and put it in whole (engine/dm.js). So for every other action it is held by
// reference, not copied, and a restore puts the very same object back; the copy then costs what the creatures and the rest of the map
// cost, not the size of the map. What play does change in the map (`objects`, `regions`, `seen`, `starts`) is copied as ever.
// TERRAIN_ACTIONS is the list of the actions that may change the terrain; `apply-restore.test.js` shows that no other action type does
// (it plays every type with the terrain frozen). A new action that edits tiles or walls in place MUST be added here.
// The maps of parked places (docs/specs/travel.md, Decision 5) are never changed in place by any action (a reset puts a
// new map in whole), so their terrain is held by reference for every action, as the map in play's is.
export const TERRAIN_ACTIONS = new Set(['mapEdit', 'loadMap', 'enter', 'leave', 'goTo']);      // the last three put another place's map in play (engine/travel.js)
const BY_REFERENCE = ['levels', 'walls'];
const isMap = (m) => !!m && typeof m === 'object' && !Array.isArray(m);
const lighten = (m) => { const rest = {}; for (const k of Object.keys(m)) if (!BY_REFERENCE.includes(k)) rest[k] = m[k]; return rest; };
const refill = (m, copy) => { const map = {}; for (const k of Object.keys(m)) map[k] = BY_REFERENCE.includes(k) ? m[k] : copy[k]; return map; };      // the same keys in the same order
function freeze(s, terrain = true) {
  const m = s.map;
  const parked = isMap(s.parked) ? Object.entries(s.parked).filter(([, r]) => isMap(r) && isMap(r.map)) : [];
  const light = parked.length ? Object.fromEntries(Object.entries(s.parked).map(([k, r]) => [k, isMap(r) && isMap(r.map) ? { ...r, map: lighten(r.map) } : r])) : null;
  // The imported market packs (`markets`, up to 20 of 128 KB; docs/specs/shops.md) are never changed in place either: `market` puts a new
  // list in whole (engine/trade.js). So they too are held by reference, in their place among the keys.
  const keepMarkets = Object.hasOwn(s, 'markets') && s.markets !== null && typeof s.markets === 'object';
  const top = { ...s, timeline: null, ...(light ? { parked: light } : {}), ...(keepMarkets ? { markets: null } : {}) };
  const whole = terrain || !isMap(m);
  const copy = structuredClone(whole ? top : { ...top, map: lighten(m) });
  if (keepMarkets) copy.markets = s.markets;
  if (!whole) copy.map = refill(m, copy.map);
  for (const [k, r] of parked) copy.parked[k].map = refill(r.map, copy.parked[k].map);
  return copy;
}
// The copy for this action: whole where the action may change the terrain (a `react` re-plays the action it answers).
const copyFor = (s, action) => freeze(s, TERRAIN_ACTIONS.has(action?.type) || (action?.type === 'react' && TERRAIN_ACTIONS.has(s.pending?.action?.type)));
function thaw(s, snap) {
  const tl = s.timeline;
  for (const k of Object.keys(s)) delete s[k];
  for (const k of Object.keys(snap)) s[k] = k === 'timeline' ? tl : snap[k];
}
// A refusal (a RuleError out of the handler) puts the game back by mending it IN PLACE: whatever the refused action left changed is set back to
// what the copy holds, and every object that was not changed stays the very same object. A refusal is the commonest way an action ends, and what
// holds a creature or a list (a test, a view) keeps holding it, as it did while a refusal changed nothing. This keeps identity only for objects
// the handler did not replace: one it swapped for another (or added, or removed) comes back as the copy's object. `thaw`, which swaps whole
// objects, is still what a throw that is not a refusal, a question, the work ceiling (`overWork`) and `NotBattleMap` use.
// Same key order as the copy, so the game's JSON is identical. Terrain held by reference in the copy is the same object and is skipped.
// Aliasing: a handler may leave one live object at two paths (`a.pos = b.pos`) and then refuse. Mending it in place at the first path would
// write one creature's values into the other's, so an object already mended once (`seen`) is replaced by the copy's own object at its second path.
const plain = (x) => x !== null && typeof x === 'object' && (Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype);
// A write only where it differs (unchanged terrain may be frozen, apply-terrain.test.js); an own `__proto__` key is defined, never assigned.
const put = (o, k, v) => {
  if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else if (o[k] !== v) o[k] = v;
};
function back(t, c, seen) {
  if (t === c) return t;
  if (!plain(t) || !plain(c) || Array.isArray(t) !== Array.isArray(c) || seen.has(t)) return c;
  seen.add(t);
  if (Array.isArray(c)) { if (t.length !== c.length) t.length = c.length; for (let i = 0; i < c.length; i++) put(t, i, back(t[i], c[i], seen)); return t; }
  const tk = Object.keys(t), ck = Object.keys(c);
  if (tk.length === ck.length && tk.every((k, i) => k === ck[i])) { for (const k of ck) put(t, k, back(t[k], c[k], seen)); return t; }
  const old = new Map(tk.map((k) => [k, t[k]]));          // the keys differ: take them all off and put them back in the copy's order
  for (const k of tk) delete t[k];
  for (const k of ck) { const v = back(old.get(k), c[k], seen); if (k === '__proto__') put(t, k, v); else t[k] = v; }
  return t;
}
// The copy has no timeline (apply() does not restore it), so the game's own is kept; a game with no `timeline` key gets none.
export function mend(s, snap) {      // exported for refusal-mend.test.js only
  const c = { ...snap };
  if (Object.hasOwn(s, 'timeline')) c.timeline = s.timeline; else delete c.timeline;
  back(s, c, new WeakSet());
}

// The work count is switched off however the action ends, a throw included.
//
// A caller must not hold a reference into the state (`s.entities`, `s.map`, one creature ...) across an `apply()`: when an action throws
// something that is not a rule refusal, or stops to ask, or meets the work ceiling, the game is put back by replacing the top-level
// values of `s` with the copy, so those are new objects afterwards (as they already were for `act`, `cast` and the actions that might ask).
// Hold `s` itself and read through it each time. (The solo transport keeps only `state`; the server only `table.state`: neither holds more.)
// The homebrew creatures as the action found them, for `record`: one that leaves the state during the action (a summon that
// goes down, a form that ends) is named by events of the same action, and is no longer there to be asked afterwards.
let BEFORE = null, BEFORE_SRC = null;
export function apply(s, action, ctx = { role: 'dm' }) {
  const outer = BEFORE, outerSrc = BEFORE_SRC;
  BEFORE = homebrewCreatures(s); BEFORE_SRC = homebrewSources(s);
  try { return applyInner(s, action, ctx); } finally { BEFORE = outer; BEFORE_SRC = outerSrc; stopWork(); }
}
function applyInner(s, action, ctx) {
  let ev = [];
  const was = current(s);
  // A copy is taken only when the action could stop to ask a player (reactions.js, mayAsk), or
  // when it answers one: the rest of the time nothing can pause and this costs nothing.
  // It is also taken for one that could meet the work ceiling (effects.js, WORK), so that it can be refused cleanly.
  const asks = !!s.pending || action?.type === 'react' || mayAsk(s);
  const heavy = mayBeHeavy(s, action ?? {});            // true: a cast or action that may meet the ceiling; 'copy': a use whose work is not read from here
  const snap = asks || heavy ? copyFor(s, action) : null;
  // Any handler may throw something that is not a rule refusal (a TypeError, a bad dice expression met in content, a state a bug or an
  // old save left wrong) after it has changed things; the game is then put back as it was (below, and for the settle phase after it) and the
  // error goes on up (#421 for `act` and `cast`, #425 for every action). So a copy is kept for every action a handler exists for (an
  // unknown action changes nothing). `freeze` costs about 1.4 ms at 70 creatures (docs/DEBT.md, T55).
  const net = snap ?? (handlers.has(action?.type) ? copyFor(s, action) : null);
  const tlLen = s.timeline?.length;
  // `record` (inside `overWork` and the pause too) writes the timeline: a plain throw from it takes the game back as well (#425, review Low 4).
  const safe = (fn) => { try { return fn(); } catch (err) { throw err instanceof RuleError ? err : restoreAfter(s, net, tlLen, err); } };
  setRun({ action, ctx: { role: ctx.role, ...(typeof ctx.userId === 'string' ? { userId: ctx.userId } : {}) }, answers: [], i: 0, canPause: !!snap });
  startWork();
  try {
    dispatch(s, action, ctx, ev);
    checkEvents(ev);
  } catch (err) {
    stopWork();
    delete s.stack;                                  // never leave half an effect behind
    if (err instanceof WorkLimit) return safe(() => overWork(s, snap, err, ev, action, was));
    // A fight called while the table is on a navigation or scene node (engine/resolve.js, NotBattleMap): refused, and
    // the game put back as it was before the action, whatever the action had done on the way (docs/specs/travel.md, Decision 7).
    if (err instanceof NotBattleMap) {
      if (net) thaw(s, net);
      setRun(null);
      return { ok: false, error: err.message, events: [] };
    }
    if (err instanceof Pause) {
      // Stop and ask: the game goes back to how it was before the action (the dice seed too), and
      // keeps the action, the answers given so far and the question. Only the player asked and
      // the DM are told (view.js).
      thaw(s, snap);
      const t = s.entities[err.ask.reactor];
      s.asked = (s.asked ?? 0) + 1;
      s.pending = { n: s.asked, action: structuredClone(RUN.action), ctx: { ...RUN.ctx }, answers: structuredClone(RUN.answers), ask: structuredClone(err.ask) };
      ev = [{ type: 'reactionAsked', id: t.id, n: s.asked, to: ownerOf(s, t), ask: structuredClone(err.ask) }];
      setRun(null);
      return safe(() => record(s, ev));
    }
    // Every way an action can fail puts the game back from the copy taken above, a rule refusal too: a refused action changes nothing,
    // however the handler got there (review R3, #617; engine/casting.js once set a flag before it refused). A refusal of an answer to a
    // reaction question restores the copy taken for it, so the question is left waiting, as it was. A non-refusal throw goes on up: a bug is not hidden.
    // `net` is only null for an action no handler exists for, which changes nothing.
    if (net) { if (err instanceof RuleError) mend(s, net); else thaw(s, net); }
    setRun(null);
    if (err instanceof RuleError) return { ok: false, error: err.message, events: [] };
    throw err;
  }
  setRun(null);
  // A companion that has dropped to 0, lost its master or strayed past its leash leaves the map (resolve.js, settleBonds);
  // a grapple whose grappler is gone, Incapacitated or out of range ends (settleHolds).
  // A joint purchase that can no longer be paid ends (engine/trade.js, settleShops: a fight, a buyer out of the shop area, stock gone).
  try { gravity(s, ev); settleBonds(s, ev); settleHolds(s, ev); watch(s, ev); look(s, ev); staleCheck(s, ev); settleShops(s, ev); learn(s); learnShops(s); checkEvents(ev); } catch (err) {
    if (err instanceof NotBattleMap) { stopWork(); delete s.stack; if (net) thaw(s, net); return { ok: false, error: err.message, events: [] }; }
    if (err instanceof WorkLimit) { stopWork(); delete s.stack; return safe(() => overWork(s, snap, err, ev, action, was)); }
    // A refusal here is not a refusal of the action: the handler is done and has changed the game. Letting it pass would leave that half-applied
    // and tell nobody, so the game goes back as it was and it is thrown as a crash (the server answers "couldn't make sense"; review R3, L4).
    stopWork(); delete s.stack;
    throw restoreAfter(s, net, tlLen, err instanceof RuleError ? new Error(`The settle phase refused an action that had been applied: ${err.message}`) : err);
  }
  stopWork();
  try {
    fightEndsScene(s, ev);                         // a fight, however it began, ends a scene
    return record(s, ev);
  } catch (err) { throw err instanceof RuleError ? err : restoreAfter(s, net, tlLen, err); }
}

// A throw that is not a rule refusal, after the handler is done: the game goes back to the copy taken before the action, and
// whatever `record` had already put on the timeline is taken off. Gives the error back, to be thrown again.
function restoreAfter(s, net, tlLen, err) {
  if (net) { thaw(s, net); if (Array.isArray(s.timeline) && tlLen !== undefined) s.timeline.length = tlLen; }
  return err;
}

// An action ran into the work ceiling (effects.js, WORK). With the copy taken before it, the game goes back to how it
// was and the action is refused with a sentence: nothing changed, as with any refused action. Without one (the action
// was not seen to be heavy) the engine cannot undo what it did, and does not pretend: what was done stays done, and
// a `manual` event says what was not applied, for the DM.
const words = (id) => String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const nameOf = (s, id) => (typeof id === 'string' && Object.hasOwn(s.entities, id) ? s.entities[id].name : null);
function overWork(s, snap, err, ev, action, was) {
  setRun(null);
  if (snap && action?.type === 'react') {
    // The answer to a reaction question re-ran the action and it met the ceiling. No answer could ever succeed, so the
    // question goes with the action: the game is as it was before the action began (the question's number aside), and the DM is told.
    thaw(s, snap);
    const orig = s.pending?.action ?? {};
    delete s.pending;
    const what = typeof orig.spell === 'string' ? words(orig.spell) : typeof orig.action === 'string' ? words(orig.action) : err.what ?? 'The action';
    const who = nameOf(s, orig.actor);
    const actor = typeof orig.actor === 'string' && Object.hasOwn(s.entities, orig.actor) ? orig.actor : null;
    return record(s, [{ type: 'manual', actor, name: what, text: `${what}${who ? `, cast by ${who},` : ''} would ${err.limit} in one action, which is more than the engine allows. It was not applied at all, and the question it was waiting on is closed: nothing changed, and the table can go on.` }]);
  }
  const name = err.what ?? (typeof action?.spell === 'string' ? words(action.spell) : typeof action?.action === 'string' ? words(action.action) : 'An action');
  if (snap) { thaw(s, snap); return { ok: false, error: `${name} would ${err.limit} in one action, which is more than the engine allows. Nothing was done.`, events: [] }; }
  const actor = typeof action?.actor === 'string' && Object.hasOwn(s.entities, action.actor) ? action.actor : null;
  const type = action?.type, round = s.encounter?.round ?? null, now = current(s);
  // What happened, said as it was: where the turn stands now, and whose part was left out.
  const on = nameOf(s, err.who);
  const left = type === 'endTurn' ? (now !== was ? ` The turn passed to ${nameOf(s, now) ?? 'the next creature'}.` : ' The turn did not end: the DM ends it again when the rest is applied.')
    : type === 'move' || type === 'dash' ? ' The move was not finished: the creature stands where it stopped.' : '';
  const part = on ? `its effect on ${on} was not applied` : 'the rest of it was not applied';
  const first = !s.timeline.slice(-400).some((x) => x.type === 'manual' && x.stop && x.stop.name === name && x.stop.round === round);
  const text = `${name} would ${err.limit} in one action, which is more than the engine allows. The engine stopped it there. What it had done by then (${ev.length} events, listed above) stays done; ${part}, and the DM applies it.${left}${first && round !== null && type === 'endTurn' ? ` Until this round ends it stops the same way for each creature it reaches, and this is the only such note for ${name} this round; the creature each time is the one whose turn it was.` : ''}`;
  const note = { type: 'manual', actor, name, text, stop: { name, round } };
  return record(s, first || type !== 'endTurn' ? [...ev, note] : [...ev]);
}

// An event that names a creature that carries a homebrew block (in any field, at any depth) is stamped `hb: { [id]: the user who ran it | null }`,
// as the action left the game (as it found it, for one that is gone by then). What a player is told of that event is settled by the stamp,
// never by the creature as it is later, when it may be gone or out of its form (view.js, viewEvents; #457). An event with no stamp names
// no such creature: a game could not have one before #457. The stamp is never sent to a player.
function stampHomebrew(s, ev) {
  // An effect made in this action by a creature with a homebrew block is told who runs it now (`hbSrc.by`; null: the DM's).
  for (const fx of s.effects ?? []) if (fx.hbSrc && fx.hbSrc.by === undefined) fx.hbSrc.by = s.entities[fx.hbSrc.id] ? controllerOf(s, s.entities[fx.hbSrc.id]) : (BEFORE?.get(fx.hbSrc.id) ?? null);
  const now = homebrewCreatures(s), fromFx = homebrewSources(s);
  if (!now && !BEFORE && !fromFx && !BEFORE_SRC) return;
  const who = new Map([...(BEFORE ?? []), ...(now ?? [])]);
  // The source of a lasting effect, as found before the action or after it (the effect may have ended in it).
  const sources = new Map([...(BEFORE_SRC ?? []), ...(fromFx ?? [])]);
  for (const e of ev) {
    const hb = {}, stack = [e];
    let n = 0;
    for (; stack.length && n < 2000; n++) {
      const x = stack.pop();
      if (typeof x === 'string') { if (who.has(x)) hb[x] = who.get(x); continue; }
      if (x === null || typeof x !== 'object') continue;
      for (const [k, v] of Object.entries(x)) if (k !== 'hb') { if (who.has(k)) hb[k] = who.get(k); stack.push(v); }
    }
    // An event too large to be read through (a start of fight with hundreds in the order) is stamped with every such creature there is:
    // the safe side, since a stamp only ever makes an event less told.
    if (stack.length) for (const [id, who1] of who) hb[id] = who1;
    // A save of such an effect names its source (`src`), which may be on the map and no longer carry the block, or gone: stamped for that
    // event alone, as the one who ran it then, so that the rest of what names a creature that lost the block stays as it was told.
    if (e.type === 'save' && typeof e.src === 'string' && hb[e.src] === undefined && sources.has(e.src)) hb[e.src] = sources.get(e.src);
    if (Object.keys(hb).length) e.hb = hb;
  }
}

// The record keeps, with each entry, the creatures the party did not know of when it happened,
// so that reading the record later never tells players about what they could not see then.
function record(s, ev) {
  stampHomebrew(s, ev);
  const unseen = (x) => typeof x === 'string' && unknown(s, s.entities[x]);
  for (const e of ev) {
    if (e.type === 'moved' || e.type === 'ping') continue;       // a ping is seen once by those at the table and kept nowhere (docs/specs/table-ui.md, Ping)
    const ids = [e.id, e.actor, e.target, e.by, e.src, e.against, ...(Array.isArray(e.targets) ? e.targets : []), ...(Array.isArray(e.order) ? e.order.map((o) => o.id) : [])].filter(unseen);
    // A copy all through: an event may hold an object of the state itself (`placed` its creature's `pos`), and
    // an entry sharing it would change with it; undo and redo, which put the state back field by field, then
    // could not give the record back as it was (#320).
    // An event may carry its own `unseen` already (E23: the creatures the party did not know of while a spell was cast,
    // before the fight's start revealed them; casting.js): both are kept (fix round 1 of #373, L1).
    const all = [...new Set([...(Array.isArray(e.unseen) ? e.unseen : []), ...ids])];
    s.timeline.push(structuredClone({ t: s.clock, ...e, ...(all.length ? { unseen: all } : {}) }));
  }
  return { ok: true, events: ev };
}

// ---------- the timeline: what an AI DM or AI character reads ----------

export function clockText(minutes) {
  const day = Math.floor(minutes / 1440) + 1, m = Math.floor(minutes % 1440);
  return `Day ${day}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// recall(state, {since, until, types, about, tags, limit}) -> matching timeline entries, oldest first.
export function recall(s, { since = -Infinity, until = Infinity, types, about, tags, limit = 200 } = {}) {
  return s.timeline.filter((e) =>
    e.t >= since && e.t <= until &&
    (!types || types.includes(e.type)) &&
    (!about || [e.id, e.actor, e.target].includes(about)) &&
    (!tags || (e.tags || []).some((t) => tags.includes(t)))).slice(-limit);
}

