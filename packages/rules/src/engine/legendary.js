// Legendary actions (docs/specs/legendary.md; stage L1b: the window). After a turn is taken, the table stops for a moment, but only if a
// legendary creature could act: `s.encounter.between = { after, round, offered, done }` while it is open. Nobody has a turn then (engine.js
// refuses everything not in BETWEEN_OK, reactions.js), and the next turn begins when every offered creature has been skipped or the DM closes it.
//
// The window is opened from `advanceTurn` (resolve.js, `HOOKS.window`) and closed here by calling `advanceTurn` again: it goes on from where it
// stopped. This module is above resolve.js (it plays turns), so resolve.js reaches the opener through a hook this module sets when it loads.
// It is part of `s.encounter`, so undo and redo (history.js) put it back with nothing more.
//
// Built here: `legendary { actor, skip: true }`, `legendary { done: true }`, `legendarySet` and (stage L1c) `legendary { actor, option, ... }`, which takes an option:
// it pays the uses, walks the move part by the engine's own walk from a budget of its own (movement.js `legendaryMove`), and runs the creature's own action
// (attacks.js `legendaryAct`, the way `act` aims and runs it, without spending a turn's action).
import { able, ent, control, fail, spot, up } from './shared.js';
import { advanceTurn, HOOKS } from './resolve.js';
import { actionSpent, aimRefusal, legendaryAct } from './attacks.js';
import { legendaryMove, legendaryStop } from './movement.js';
import { FT } from '../space.js';
import { incapacitatedBy, speedOf } from '../modifiers.js';
import { unknown } from '../vision.js';

export const BETWEEN_REFUSAL = 'Between turns: the DM is deciding on legendary actions.';

// What it may spend in all: its uses, or the lair's when the DM has marked it in its lair; Legendary Resistance likewise (Decision 2).
export const usesMax = (e) => (e.legend?.lair && e.legendary?.lair?.uses) || e.legendary?.actions?.uses || 0;
export const usesLeft = (e) => Math.max(0, usesMax(e) - (e.legend?.acts ?? 0));
export const resistMax = (e) => (e.legend?.lair && e.legendary?.lair?.resistance) || e.legendary?.resistance?.day || 0;

// Could `e` take a legendary action now? Up, able, not set aside, a use left that pays for an option the engine would not refuse for its own
// reasons: not barred by `again`, its `use` actions not spent, and something it is aimed at, a foe that is up (reach and the move are
// checked when an option is taken, L1c, and refuse it then).
function couldAct(s, e) {
  if (!e || !e.legendary?.actions || !up(e) || e.away || incapacitatedBy(e)) return false;
  if (unknown(s, e)) return false;                     // one the party does not know of is offered no window: the table never waits for what it cannot see (Decision 3)
  const left = usesLeft(e);
  if (left < 1) return false;
  const foes = Object.values(s.entities).some((o) => !o.object && up(o) && o.side !== e.side && !o.melded);
  return e.legendary.actions.options.some((o) => {
    if ((o.cost ?? 1) > left || e.legend?.again?.[o.id]) return false;
    if (o.use?.length && !o.use.some((id) => { const def = (e.actions ?? []).find((x) => x.id === id); return def && !actionSpent(e, def); })) return false;
    return !(o.use || o.target || o.effects) || foes;
  });
}

// Who is offered after `after`'s turn, in the order their own turns come next (wrapping round the order), never `after` itself.
export function offeredAfter(s, after) {
  const enc = s.encounter, n = enc.order.length, from = enc.order.findIndex((o) => o.id === after);
  const out = [];
  for (let i = 1; i < n; i++) {
    const id = enc.order[(from + i + n) % n].id;
    if (!out.includes(id) && id !== after && couldAct(s, s.entities[id])) out.push(id);
  }
  return out;
}

// Opens the window after `after`'s turn, if anyone is offered. True: it is open and the table waits; false: nothing was done at all.
function openWindow(s, ev, after) {
  if (s.settings?.legendaryWindows !== true) return false;      // off until the DM's screen for it exists (stage L4): the table plays as it always did
  const enc = s.encounter, offered = offeredAfter(s, after);
  if (!offered.length) return false;
  enc.between = { after, round: enc.round, offered, done: [] };
  ev.push({ type: 'legendaryWindow', after, offered: [...offered] });
  return true;
}
HOOKS.window = openWindow;

// Who still stands in the window: an offered creature that was dropped, died or left in the meantime is taken off it.
const stillOffered = (s, id) => { const e = s.entities[id]; return !!e && up(e) && !e.away && !incapacitatedBy(e) && !unknown(s, e); };

// Closes the window and begins the next turn: `advanceTurn` goes on from where it stopped.
function close(s, ev) {
  delete s.encounter.between;
  advanceTurn(s, ev);
}
// After one is skipped (or taken): those no longer there are taken off, and the window closes when nobody is left to ask.
function settle(s, ev) {
  const w = s.encounter.between;
  w.offered = w.offered.filter((id) => w.done.includes(id) || stillOffered(s, id));
  if (w.offered.every((id) => w.done.includes(id))) close(s, ev);
}

// Run after every action (engine.js): a creature offered in an open window that was dropped, killed, made Incapacitated or taken from the map by what the
// DM did meanwhile (BETWEEN_OK) leaves it, and when nobody is left to ask the window closes and the next turn begins, as `done` does.
export function settleWindow(s, ev) {
  if (s.encounter?.between) settle(s, ev);
}

// What the engine tells of an option's part it could not go on with: the DM's, as a `manual` for a foe, a note for the party's own.
const tell = (e, name, text) => ({ type: 'manual', actor: e.id, name, partial: true, text });

// Takes one option (Decision 5): everything is checked first, and a refusal (a RuleError, which `apply` puts back from its copy) changes nothing. A question put to a
// player (an Opportunity Attack on the move) stops the whole action, which then runs again from the copy taken before it, so the uses are spent once.
function take(s, a, ctx, ev, w, e) {
  typeof a.option === 'string' || fail('Say which option: its id.');
  w.offered.includes(e.id) || fail(`${e.name} is not offered a legendary action now.`);
  w.done.includes(e.id) && fail(`${e.name} has already taken a legendary action after this turn.`);
  const opt = (e.legendary?.actions?.options ?? []).find((o) => o.id === a.option) || fail(`${e.name} has no legendary action called that.`);
  up(e) || fail(`${e.name} is down.`);
  able(e);
  const cost = opt.cost ?? 1, left = usesLeft(e);
  if (left < 1) fail(`${e.name} has no legendary action left this round.`);
  if (cost > left) fail(`${opt.name} costs ${cost} legendary actions and ${e.name} has ${left} left this round.`);
  if (opt.again && e.legend?.again?.[opt.id]) fail(`${opt.name} can't be taken again until the start of ${e.name}'s next turn.`);
  // What it runs: one of its own actions (`pick` where the option names two), or the option's own steps made into an action.
  let def = null;
  if (opt.use?.length) {
    const ids = opt.use, named = ids.map((id) => (e.actions ?? []).find((x) => x.id === id)).filter(Boolean);
    if (a.pick !== undefined && !(typeof a.pick === 'string' && ids.includes(a.pick))) fail(`${opt.name} uses ${named.map((x) => x.name).join(' or ')}: pick one of them.`);
    let id = a.pick;
    if (id === undefined) {
      const usable = named.filter((x) => !actionSpent(e, x));
      if (named.length === 1) id = named[0].id; else if (usable.length === 1) id = usable[0].id;
      else fail(`${opt.name} uses ${named.map((x) => x.name).join(' or ')}: say which with \`pick\`.`);
    }
    def = (e.actions ?? []).find((x) => x.id === id && !x.multiattack) || fail(`${e.name} has no ${id} to use.`);
    const why = actionSpent(e, def);
    if (why) fail(why);
  } else {
    a.pick === undefined || fail(`${opt.name} has nothing to pick.`);
    if (opt.effects) def = { id: opt.id, name: opt.name, target: opt.target ?? { self: true }, effects: opt.effects };
  }
  // The move part: a budget of its own (half or full of the Speed it moves in), checked before anything moves.
  const mv = opt.move;
  let bud = null, stop = null;
  if (a.to !== undefined) {
    mv || fail(`${opt.name} has no move.`);
    spot(a.to, 'where to move');
    const speed = speedOf(s, e, mv.mode ?? 'walk');
    speed > 0 || fail(`${e.name} has no ${mv.mode ?? 'walking'} Speed to move with.`);
    const feet = mv.speed === 'full' ? speed : Math.floor(speed / 2 / FT) * FT;
    bud = { move: feet, dashes: 0, diagonals: 0, out: true, ...(mv.provokes === false ? { free: true } : {}) };
    if (!mv.after) stop = legendaryStop(s, e, bud, a.to);
  }
  // The aim is judged from where the move ends (from where it stands now for a move that comes after), before anything changes.
  if (def) {
    const was = e.pos;
    if (stop) e.pos = { ...stop };
    let why;
    try { why = aimRefusal(s, e, def, a, ctx); } finally { e.pos = was; }
    if (why) fail(why);
  } else {
    (a.target === undefined && a.targets === undefined && a.hex === undefined) || fail(`${opt.name} is not aimed at anything.`);
  }

  // Paid, then done.
  const legend = (e.legend ??= { acts: 0, resisted: 0, again: {}, lair: false, show: false });
  legend.acts += cost;
  if (opt.again) legend.again[opt.id] = true;
  w.done.push(e.id);
  ev.push({ type: 'legendary', actor: e.id, option: opt.id, name: opt.name, after: w.after });
  const able_ = () => !!s.encounter && up(e) && !incapacitatedBy(e);
  const stopped = (what) => { if (s.encounter) ev.push(tell(e, opt.name, `${e.name} can't go on with ${opt.name}: ${what}. The legendary action stays spent.`)); };
  const walkIt = () => { legendaryMove(s, { actor: e.id, to: a.to }, ctx, ev, bud); };
  const mover = bud !== null;
  if (mover && !mv.after) {
    walkIt();
    if (!able_()) return stopped('it is down or can no longer act');
  }
  if (def) {
    const arrived = !mover || mv.after || (stop && e.pos.q === stop.q && e.pos.r === stop.r && (e.pos.z ?? 0) === (stop.z ?? 0));
    if (arrived) legendaryAct(s, e, def, a, ev, ctx);
    else {
      const why = aimRefusal(s, e, def, a, ctx);
      if (why) ev.push(tell(e, opt.name, `${e.name} stopped short, so ${def.name} was not made: ${why}`));
      else legendaryAct(s, e, def, a, ev, ctx);
    }
    if (!able_()) return stopped('it is down or can no longer act');
  }
  if (opt.manual) {
    const alone = !def && !mover;
    ev.push({ type: 'manual', actor: e.id, name: opt.name, ...(alone ? {} : { partial: true }), text: opt.manual });
  }
  if (mover && mv.after) {
    walkIt();
    if (!able_()) return stopped('it is down or can no longer act');
  }
}

const SET_KEYS = ['acts', 'resisted', 'lair', 'show'];

export const handlers = {
  // { type: 'legendary', actor, skip: true }: the creature passes for this window. { type: 'legendary', done: true }: the DM closes it, which skips
  // whoever is left. { type: 'legendary', actor, option, to?, target?, targets?, hex?, pick? }: the creature takes an option (`take`, above).
  legendary(s, a, ctx, ev) {
    const w = s.encounter?.between || fail('No creature is choosing a legendary action now.');
    if (a.done !== undefined) {
      a.done === true || fail('`done` is true or left out.');
      ctx.role === 'dm' || fail('Only the DM can close the window.');
      for (const id of w.offered) if (!w.done.includes(id)) ev.push({ type: 'legendarySkip', actor: id });
      close(s, ev);
      return;
    }
    const e = ent(s, a.actor); control(s, e, ctx);
    if (a.option !== undefined) {
      a.skip === undefined || fail('Take an option or skip, not both.');
      take(s, a, ctx, ev, w, e);
      if (!s.encounter?.between) return;               // the fight ended on the way, and the window with it
      if (!stillOffered(s, e.id)) { w.offered = w.offered.filter((id) => id !== e.id); w.done = w.done.filter((id) => id !== e.id); }     // dropped or made Incapacitated mid-option: it leaves the window
      settle(s, ev);
      return;
    }
    if (a.skip !== true) fail('Say what to do: an option, skip, or done to close the window.');
    w.offered.includes(e.id) || fail(`${e.name} is not offered a legendary action now.`);
    w.done.includes(e.id) && fail(`${e.name} has already taken a legendary action after this turn.`);
    w.done.push(e.id);
    ev.push({ type: 'legendarySkip', actor: e.id });
    settle(s, ev);
  },
  // { type: 'legendarySet', actor, set: { acts?, resisted?, lair?, show? } }: the DM's adjustments (Decision 2). `acts` and `resisted` are what is
  // spent, as the state keeps them (0 to the most it may spend), so that marking the lair moves nothing that was spent. DM only, in a fight or not.
  legendarySet(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a creature\'s legendary actions.');
    const e = ent(s, a.actor);
    (e.legendary && e.legend) || fail(`${e.name} has no legendary actions or resistance.`);
    const set = a.set;
    (set && typeof set === 'object' && !Array.isArray(set) && Object.keys(set).length) || fail('Say what to set: acts, resisted, lair or show.');
    for (const k of Object.keys(set)) SET_KEYS.includes(k) || fail(`${k} is not something to set: acts, resisted, lair or show.`);
    const lair = set.lair ?? e.legend.lair;
    const max = (lair && e.legendary.lair?.uses) || e.legendary.actions?.uses || 0, rmax = (lair && e.legendary.lair?.resistance) || e.legendary.resistance?.day || 0;
    if (set.acts !== undefined) (Number.isInteger(set.acts) && set.acts >= 0 && set.acts <= max) || fail(`${e.name} has spent from 0 to ${max} legendary actions.`);
    if (set.resisted !== undefined) (Number.isInteger(set.resisted) && set.resisted >= 0 && set.resisted <= rmax) || fail(`${e.name} has spent from 0 to ${rmax} uses of Legendary Resistance.`);
    for (const k of ['lair', 'show']) if (set[k] !== undefined && typeof set[k] !== 'boolean') fail(`${k} is true or false.`);
    for (const k of SET_KEYS) if (set[k] !== undefined) e.legend[k] = set[k];
    ev.push({ type: 'legendarySet', id: e.id, set: { ...set } });
  },
};
