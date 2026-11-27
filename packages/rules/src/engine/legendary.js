// Legendary actions (docs/specs/legendary.md; stage L1b: the window). After a turn is taken, the table stops for a moment, but only if a
// legendary creature could act: `s.encounter.between = { after, round, offered, done }` while it is open. Nobody has a turn then (engine.js
// refuses everything not in BETWEEN_OK, reactions.js), and the next turn begins when every offered creature has been skipped or the DM closes it.
//
// The window is opened from `advanceTurn` (resolve.js, `HOOKS.window`) and closed here by calling `advanceTurn` again: it goes on from where it
// stopped. This module is above resolve.js (it plays turns), so resolve.js reaches the opener through a hook this module sets when it loads.
// It is part of `s.encounter`, so undo and redo (history.js) put it back with nothing more.
//
// Built here: `legendary { actor, skip: true }`, `legendary { done: true }` and `legendarySet`. Taking an option (`option`) is stage L1c.
import { ent, control, fail, up } from './shared.js';
import { advanceTurn, HOOKS } from './resolve.js';
import { actionSpent } from './attacks.js';
import { incapacitatedBy } from '../modifiers.js';
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

const SET_KEYS = ['acts', 'resisted', 'lair', 'show'];

export const handlers = {
  // { type: 'legendary', actor, skip: true }: the creature passes for this window. { type: 'legendary', done: true }: the DM closes it, which skips
  // whoever is left. Taking an option (`option`, stage L1c) is not built yet.
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
    if (a.skip !== true) fail(a.option !== undefined ? 'The engine does not take a legendary action yet: skip it, and the DM plays it by hand.' : 'Say what to do: skip, or done to close the window.');
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
