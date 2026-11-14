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
import { control, fail, Pause, RuleError, RUN, setRun } from './engine/shared.js';
import { aloft, lookAround } from './engine/world.js';
import { checkEnd, fall } from './engine/resolve.js';
import { watch } from './engine/features.js';
import { handlers as movement } from './engine/movement.js';
import { handlers as attacks } from './engine/attacks.js';
import { handlers as casting } from './engine/casting.js';
import { handlers as features } from './engine/features.js';
import { handlers as characters } from './engine/characters.js';
import { handlers as rests } from './engine/rests.js';
import { handlers as dm } from './engine/dm.js';
// What the engine exports lives in engine/ by domain (see CLAUDE.md, Engine layout); importers
// keep importing it from here.
export { ARENA_RADIUS, blocked, castAbilOf, clear, current, dying, EXPLORE_BUDGET, fallen, featOf, FLY_CEILING, hostile, inFight, living, mod, spellStats, unblocked, up } from './engine/shared.js';
export { aloft, areaHexes, areaTargets, CATCH_UP, contentName, creatureType, isPile, moveOptions, nearObject, NOTICE_FEET, objectName, objectShown, openContents, PILE_MAX, pileContents, pileOpen, SEARCH_FEET, targetsFor } from './engine/world.js';
export { GEAR_MAX, HAND_FEET, interactionOf, passTargets, pickUpsFor } from './engine/characters.js';
export { checkBonus, passive, rollMode } from './engine/rolls.js';
export { makeEntity } from './engine/sheets.js';
export { ENGAGE_RANGE } from './engine/movement.js';
export { actionSpent, attacksLeft, fromPool } from './engine/attacks.js';
export { teleportSpot } from './engine/casting.js';
export { HIDE_DC, hideProblem, itemUsesFor, scrollStats, usesFor } from './engine/features.js';
export { SETTINGS, SETTING_TEXT } from './engine/dm.js';
export { DAWN, dawnsBetween } from './engine/rests.js';
export { AWAY, awayHow } from './engine/resolve.js';

export { FT };                       // feet per hex
export { opportunityAttack };

// Every action's handler, from the domain modules in engine/ (CLAUDE.md, Engine layout). An action
// type is defined in one module only: if two defined it, the later spread would win silently.
const handlers = buildHandlers([movement, attacks, casting, features, characters, rests, dm, {
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
    control(t, ctx);
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
}], ['movement', 'attacks', 'casting', 'features', 'characters', 'rests', 'dm', 'engine']);

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
// not one: its handler gives one answer for a creature that is not there and one not in the party.)
const CREATURE_FIELDS = ['actor', 'target', 'entity', 'targets', 'spare', 'ids', 'order'];

// Run one action's handler. Also how a waiting action is run again when its reaction is answered.
function dispatch(s, action, ctx, ev) {
  // To anyone but the DM a hidden creature does not exist. Answering "it's 40 ft away" or
  // "it isn't yours" to a guessed id would confirm that it does.
  // So every creature id a player sends, in any field that names creatures, must be one the party
  // knows of, and one that is not gets the very answer an id that is nothing gets, before anything
  // else is looked at (issue #136). tests/hidden-ids.test.js walks every field every handler reads.
  if (ctx.role !== 'dm') {
    for (const k of CREATURE_FIELDS) {
      const v = action?.[k];
      for (const id of Array.isArray(v) ? v : [v]) {
        if (typeof id !== 'string') continue;
        const e = Object.hasOwn(s.entities, id) ? s.entities[id] : null;
        if (!e || unknown(s, e)) fail('No such creature.');
      }
    }
  }
  // Only a string type that is in the table is an action; anything else (no action, no type, a type
  // that is not a string, `toString`) is refused as unknown.
  const type = action?.type;
  const h = (typeof type === 'string' && handlers.get(type)) || fail(`Unknown action: ${typeof type === 'object' && type !== null ? 'not a name' : typeof type === 'symbol' ? type.toString() : String(type)}`);
  // While an action waits for a reaction, nothing that could change how it comes out may happen.
  if (s.pending && !WHILE_WAITING.has(action.type)) fail('The table is waiting for a reaction to be answered.');
  h(s, action, ctx, ev);
}

// A copy of the game to put back if the action stops to ask (or a resumed one is refused). The
// timeline is left out: nothing is added to it until the action is done.
const freeze = (s) => structuredClone({ ...s, timeline: null });
function thaw(s, snap) {
  const tl = s.timeline;
  for (const k of Object.keys(s)) delete s[k];
  for (const k of Object.keys(snap)) s[k] = k === 'timeline' ? tl : snap[k];
}

export function apply(s, action, ctx = { role: 'dm' }) {
  let ev = [];
  // A copy is taken only when the action could stop to ask a player (reactions.js, mayAsk), or
  // when it answers one: the rest of the time nothing can pause and this costs nothing.
  const snap = s.pending || action?.type === 'react' || mayAsk(s) ? freeze(s) : null;
  setRun({ action, ctx: { role: ctx.role, ...(typeof ctx.userId === 'string' ? { userId: ctx.userId } : {}) }, answers: [], i: 0, canPause: !!snap });
  try {
    dispatch(s, action, ctx, ev);
  } catch (err) {
    delete s.stack;                                  // never leave half an effect behind
    if (err instanceof Pause) {
      // Stop and ask: the game goes back to how it was before the action (the dice seed too), and
      // keeps the action, the answers given so far and the question. Only the player asked and
      // the DM are told (view.js).
      thaw(s, snap);
      const t = s.entities[err.ask.reactor];
      s.asked = (s.asked ?? 0) + 1;
      s.pending = { n: s.asked, action: structuredClone(RUN.action), ctx: { ...RUN.ctx }, answers: structuredClone(RUN.answers), ask: structuredClone(err.ask) };
      ev = [{ type: 'reactionAsked', id: t.id, n: s.asked, to: t.owner, ask: structuredClone(err.ask) }];
      setRun(null);
      return record(s, ev);
    }
    if (snap) thaw(s, snap);                         // a refused answer leaves the question waiting, as it was
    setRun(null);
    if (err instanceof RuleError) return { ok: false, error: err.message, events: [] };
    throw err;
  }
  setRun(null);
  try { gravity(s, ev); watch(s, ev); look(s, ev); } catch (err) { if (!(err instanceof RuleError)) throw err; }
  fightEndsScene(s, ev);                           // a fight, however it began, ends a scene
  return record(s, ev);
}

// The record keeps, with each entry, the creatures the party did not know of when it happened,
// so that reading the record later never tells players about what they could not see then.
function record(s, ev) {
  const unseen = (x) => typeof x === 'string' && unknown(s, s.entities[x]);
  for (const e of ev) {
    if (e.type === 'moved') continue;
    const ids = [e.id, e.actor, e.target, e.by, e.against, ...(Array.isArray(e.targets) ? e.targets : []), ...(Array.isArray(e.order) ? e.order.map((o) => o.id) : [])].filter(unseen);
    s.timeline.push({ t: s.clock, ...e, ...(ids.length ? { unseen: [...new Set(ids)] } : {}) });
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

