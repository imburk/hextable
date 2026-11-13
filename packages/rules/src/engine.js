// Rules engine. Pure game logic: no rendering, no network, no clock but the in-world one.
//
//   apply(state, action, ctx) -> { ok, error?, events }
//
// Everything that happens in the game goes through apply(). The engine validates the
// action against the rules, mutates state, and returns events. Renderers turn events
// into numbers or animations; the server broadcasts them; the timeline records them;
// an AI DM or AI character is just another caller of apply().
import * as H from './hex.js';
import { CONTENT, MONSTERS, TILES } from './content/index.js';
import { effectsOf, endEffect } from './durations.js';
import { FT, ground, landing, overlapAt, regionAt, STEP_MAX, under } from './space.js';
import { LIGHTS } from './content/lights.js';
import { EDITS, lintMap } from './map.js';
import { handoutActions } from './handouts.js';
import { fightEndsScene, sceneActions } from './scenes.js';
import { remember, SIGHT_RULES, sightRule, unknown } from './vision.js';
import { barriers, objectDef } from './walls.js';
import { mayAsk, opportunityAttack, WHILE_WAITING } from './reactions.js';
import { conditionDef, immuneTo } from './modifiers.js';
import { ARENA_RADIUS, control, ent, fail, inFight, living, Pause, RuleError, RUN, setRun, up } from './engine/shared.js';
import { airspace, aloft, fitsOn, joinEncounter, lookAround, objectName, objectOf, reveal, revealRegion, setObject, unfollow, unhide } from './engine/world.js';
import { condition, heal } from './engine/rolls.js';
import { makeEntity } from './engine/sheets.js';
import { checkEnd, damage, endEncounter, fall, startEncounter } from './engine/resolve.js';
import { watch } from './engine/features.js';
import { handlers as movement } from './engine/movement.js';
import { handlers as attacks } from './engine/attacks.js';
import { handlers as casting } from './engine/casting.js';
import { handlers as features } from './engine/features.js';
import { handlers as characters } from './engine/characters.js';
import { handlers as rests } from './engine/rests.js';
// What the engine exports lives in engine/ by domain (see CLAUDE.md, Engine layout); importers
// keep importing it from here.
export { ARENA_RADIUS, blocked, castAbilOf, clear, current, dying, EXPLORE_BUDGET, fallen, featOf, FLY_CEILING, hostile, inFight, living, mod, spellStats, unblocked, up } from './engine/shared.js';
export { aloft, areaHexes, areaTargets, CATCH_UP, creatureType, moveOptions, NOTICE_FEET, objectName, objectShown, SEARCH_FEET, targetsFor } from './engine/world.js';
export { checkBonus, passive, rollMode } from './engine/rolls.js';
export { makeEntity } from './engine/sheets.js';
export { ENGAGE_RANGE } from './engine/movement.js';
export { actionSpent, attacksLeft, fromPool } from './engine/attacks.js';
export { teleportSpot } from './engine/casting.js';
export { HIDE_DC, hideProblem, usesFor } from './engine/features.js';

export { FT };                       // feet per hex
export { opportunityAttack };

const handlers = {
  ...movement,
  ...attacks,
  ...casting,
  ...features,
  ...characters,
  ...rests,
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

  // ----- table management -----
  claim(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    if (ctx.role !== 'dm') {
      (e.kind === 'pc' && !e.owner) || fail(`${e.name} is already taken.`);
      a.user === ctx.userId || fail('You can only claim a character for yourself.');
      !Object.values(s.entities).some((o) => o.owner === ctx.userId) || fail('You already have a character.');
    }
    e.owner = a.user || null; e.ownerName = a.userName || null;
    ev.push({ type: 'claimed', id: e.id, userName: e.ownerName });
  },
  // Hand a character back so someone else can play it. Players can release their own; the DM, anyone's.
  release(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    e.owner || fail(`Nobody is playing ${e.name}.`);
    ctx.role === 'dm' || e.owner === ctx.userId || fail(`${e.name} isn't yours to give up.`);
    e.owner = null; e.ownerName = null;
    ev.push({ type: 'released', id: e.id });
  },

  // ----- DM only -----
  startEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call for initiative.');
    !s.encounter || fail('A fight is already under way.');
    startEncounter(s, a.center, ev, a.radius || ARENA_RADIUS);
  },
  endEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can end the fight.');
    s.encounter || fail('There is no fight to end.');
    endEncounter(s, ev, 'ended');
  },
  spawn(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add creatures.');
    const tpl = MONSTERS[a.monster] || fail('Unknown monster.');
    const at = landing(s.map, a.at);
    (at && TILES[ground(s.map, at).tile.t].cost < Infinity) || fail("A creature can't stand there.");
    const body = { size: tpl.size };
    fitsOn(s.map, body, at, barriers(s.map)) || fail(`There isn't room for something ${tpl.size} there.`);
    !living(s).some((o) => overlapAt(o, o.pos, body, at)) || fail('That hex is occupied.');
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster).length + 1;
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: at, ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[H.col(at)]) joinEncounter(s, s.entities[id], ev);
  },
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    const e = ent(s, a.actor);
    // On the nearest floor, or exactly where asked if a height is given and there is room there (in the air, say).
    const to = (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z)) || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to)) || fail('That hex is occupied.');
    e.pos = to;
    ev.push({ type: 'placed', id: e.id, to });
    lookAround(s, ev, [e]);
    if (s.encounter?.arena[H.col(to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
  },
  // Show a region to the players, or take it back. { type: 'revealRegion', region, revealed: true|false }
  revealRegion(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can reveal a place.');
    const r = s.map.regions.find((x) => x.id === a.region) || fail('No such region.');
    if (a.revealed === false) {
      r.revealed || fail(`${r.name} isn't revealed.`);
      !living(s).some((e) => e.side === 'party' && regionAt(s.map, under(s.map, e.pos)?.level.id, e.pos) === r) || fail(`Someone from the party is in ${r.name}.`);
      !s.encounter || fail("A place can't be hidden in the middle of a fight.");
      r.revealed = false;
      ev.push({ type: 'regionHidden', region: r.id });
    } else {
      !r.revealed || fail(`${r.name} is already revealed.`);
      revealRegion(s, r, ev);
    }
  },
  // Put an object into one of its states. { type: 'setObject', object, state }
  setObject(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set objects.');
    const o = objectOf(s, a.object);
    Object.hasOwn(objectDef(o).states, a.state) || fail(`The ${objectName(o).toLowerCase()} has no such state.`);
    o.state !== a.state || fail(`The ${objectName(o).toLowerCase()} is already ${objectDef(o).states[a.state].name}.`);
    setObject(s, o, a.state, ev);
  },
  // Change the map in play: tiles, levels, walls, objects. { type: 'mapEdit', ops: [{ op, ... }] }
  // The changes are made to a copy and the copy is checked whole, so a bad edit changes nothing.
  mapEdit(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    (Array.isArray(a.ops) && a.ops.length > 0 && a.ops.length <= 2000) || fail('Nothing to change.');
    const map = structuredClone(s.map);
    for (const op of a.ops) {
      const edit = (op && Object.hasOwn(EDITS, op.op) && EDITS[op.op]) || fail(`Unknown map change: ${op?.op}`);
      const problem = edit(map, op);
      if (problem) fail(problem);
    }
    const problems = lintMap(map);
    problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
    const B = barriers(map);
    for (const e of living(s)) {                         // a floor may give way under someone, but there must be something to land on
      const sf = under(map, e.pos);
      (sf && !(sf.z === e.pos.z && B.solid(sf.level.id, e.pos))) || fail(`${e.name} would be left with nowhere to stand.`);
    }
    s.map = map;
    ev.push({ type: 'mapEdit', count: a.ops.length });
    lookAround(s, ev);
  },
  // Take a creature out of the game. { type: 'remove', actor }
  remove(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can remove a creature.');
    const e = ent(s, a.actor);
    !inFight(s, e.id) || fail(`${e.name} is in the fight. End the fight first.`);
    for (const fx of [...effectsOf(s)]) if (fx.source === e.id || fx.parts.some((p) => p.target === e.id)) endEffect(s, ev, fx, `${e.name} left`);
    ev.push({ type: 'removed', id: e.id, name: e.name });
    for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
    delete s.entities[e.id];
  },
  // Hand a creature a light to carry, or take it away. { type: 'setLight', actor, item } with an item
  // from content/lights.js (a torch, a lamp), or { light: { bright, dim } } in feet; `item: null` puts it out.
  setLight(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out light.');
    const e = ent(s, a.actor);
    if (a.item === null || a.light === null) {
      e.light || fail(`${e.name} carries no light.`);
      delete e.light;
      return ev.push({ type: 'light', id: e.id, bright: 0, dim: 0 });
    }
    const item = a.item === undefined ? null : (typeof a.item === 'string' && Object.hasOwn(LIGHTS, a.item) && a.item) || fail('Unknown light.');
    const l = item ? LIGHTS[item] : a.light ?? fail('Name a light or give its radii.');
    const feet = (n) => Number.isInteger(n) && n >= 0 && n <= 600 && n % FT === 0;
    (l && typeof l === 'object' && feet(l.bright) && feet(l.dim) && l.bright + l.dim > 0) || fail('A light is Bright and Dim radii in feet, multiples of 5.');
    e.light = { bright: l.bright, dim: l.dim, ...(item ? { item } : {}) };
    ev.push({ type: 'light', id: e.id, bright: l.bright, dim: l.dim, ...(item ? { item, name: LIGHTS[item].name } : {}) });
  },
  // Play on a different map. The party is set down at its start; the creatures of the old
  // place stay behind with it. { type: 'loadMap', map }
  loadMap(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    !s.encounter || fail("The map can't change in the middle of a fight.");
    const problems = lintMap(a.map);
    problems.length === 0 || fail(`That map can't be used. ${problems[0]}`);
    const map = structuredClone(a.map);
    const walkable = (p) => p && TILES[ground(map, p).tile.t].cost < Infinity;
    const first = map.starts[0] ?? H.parse(Object.keys(map.levels[0].tiles)[0]);
    const start = landing(map, first, first.z ?? 0);
    const party = Object.values(s.entities).filter((e) => e.side === 'party'), spots = [], taken = new Set();
    const take = (p) => { spots.push(p); taken.add(H.key(p)); };
    // The map's starts in order, each where a creature can stand (walkable ground, nothing solid on
    // it, not taken); then, for anyone left, the spiral out from the first start, as before.
    const B = barriers(map);
    for (const st of map.starts) {
      if (spots.length >= party.length) break;
      const p = landing(map, st, st.z ?? 0), level = p && ground(map, p)?.level;
      if (walkable(p) && level && !B.solid(level.id, p) && !taken.has(H.key(p))) take(p);
    }
    for (let n = 0; n < 12 && spots.length < party.length; n++) {
      for (const h of H.range(start, n)) {
        const p = H.dist(h, start) === n ? landing(map, h, start.z) : null;
        if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < party.length && !taken.has(H.key(p))) take(p);
      }
    }
    spots.length === party.length || fail("That map has no room for the party at its start.");
    const leaving = new Set(Object.values(s.entities).filter((e) => e.side !== 'party').map((e) => e.id));
    for (const fx of [...effectsOf(s)]) if (leaving.has(fx.source) || fx.parts.some((p) => leaving.has(p.target))) endEffect(s, ev, fx, 'the party moved on');
    for (const id of leaving) delete s.entities[id];
    s.map = map;
    party.forEach((e, i) => { e.pos = spots[i]; });
    ev.push({ type: 'map', map: map.id, name: map.name });
    lookAround(s, ev);
  },
  // Hide a creature from the players, or show it to them. { type: 'reveal', actor, hidden: true|false }
  reveal(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hide or reveal creatures.');
    const e = ent(s, a.actor);
    if (a.hidden) {
      e.side !== 'party' || fail("A party member can't be hidden from the party.");
      !e.hidden || fail(`${e.name} is already hidden.`);
      !inFight(s, e.id) || fail(`${e.name} is in the fight and can't be hidden.`);
      e.hidden = true;
      ev.push({ type: 'concealed', id: e.id });
    } else {
      (e.hidden || e.hiding) || fail(`${e.name} isn't hidden.`);
      unhide(s, e, ev, 'noise');                                         // one that took the Hide action made itself heard
      reveal(s, e, ev);
    }
  },
  // Put a condition on a creature or take it off. { type: 'condition', actor, condition, on: true|false, level? }
  condition(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set conditions.');
    const e = ent(s, a.actor), def = conditionDef(a.condition);
    (def && CONTENT.conditions[a.condition]) || fail('Unknown condition.');
    if (a.on === false) {
      e.cond[a.condition] || fail(`${e.name} isn't ${def.name}.`);
      delete e.cond[a.condition];
      ev.push({ type: 'condEnd', id: e.id, cond: a.condition });
      return;
    }
    up(e) || fail(`${e.name} is down.`);
    !immuneTo(s, e, a.condition) || fail(`${e.name} is immune to ${def.name}.`);
    const level = def.levels ? Math.max(1, Math.min(def.levels, a.level | 0 || 1)) : undefined;
    if (e.cond[a.condition]) {
      (def.levels && e.cond[a.condition].level !== level) || fail(`${e.name} is already ${def.name}.`);
      e.cond[a.condition].level = level;
      ev.push({ type: 'cond', id: e.id, cond: a.condition, level });
      return;
    }
    condition(s, e, a.condition, ev, null, null, level);
  },
  setHp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set Hit Points.');
    const e = ent(s, a.actor), hp = Math.max(0, Math.min(e.maxHp, a.hp | 0));
    if (hp > e.hp) { e.dead = false; delete e.remains; heal(s, e, hp - e.hp, ev); } else if (hp < e.hp) damage(s, e, e.hp - hp, 'untyped', ev, { raw: true });
    checkEnd(s, ev);
  },
  // The DM's damage and healing, by the rules: Resistance and the like, Temporary Hit Points first, Concentration, death saves.
  harm(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can do damage this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Damage must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead.`);
    damage(s, e, n, a.dtype ?? 'untyped', ev);
    checkEnd(s, ev);
  },
  mend(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can heal this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Healing must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead; healing does not bring back the dead.`);
    heal(s, e, n, ev);
  },
  // Handouts and notes to one player: handout, showHandout, hideHandout, removeHandout, note (handouts.js).
  ...handoutActions(fail),
  // Scenes: scene, endScene, sceneNpc, say, askCheck, sceneChronicle (scenes.js).
  ...sceneActions(fail),
  setting(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    Object.hasOwn(SETTINGS, a.key) || fail('Unknown setting.');
    SETTINGS[a.key].includes(a.value) || fail(`That setting can be: ${SETTINGS[a.key].join(', ')}.`);
    s.settings[a.key] = a.value;
  },
};

// Every action type the engine handles (history.js is tested to have a label for each).
export const ACTION_TYPES = Object.keys(handlers);

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

// Table rules the DM can switch, and what each may be set to.
export const SETTINGS = { sight: SIGHT_RULES, autoEngage: [true, false], passiveFind: ['off', 'traps', 'all'], vertical: ['max', 'sum', 'true'], climbing: ['on', 'off'], cover: ['on', 'off'], creatureCover: ['on', 'off'], engageRange: [10, 30, 60], unseenTurns: ['say', 'quiet'], diceThrow: ['auto', 'throw'], pace: ['wait', 'flow', 'instant'],
  // Who reviews the rewards of a fight (rewards.js): the DM first, nobody (published at once), or none are made.
  conclusion: ['dm', 'auto', 'off'], xpShare: ['split', 'full'] };

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
  const h = handlers[action.type] || fail(`Unknown action: ${action.type}`);
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

