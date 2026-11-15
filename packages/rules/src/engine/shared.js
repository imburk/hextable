// The engine's basics, used by every other part of it (engine.js): constants, who a creature is
// and who controls it, refusing an action, rolling dice, and stopping an action to ask a player.
import { faceSum, negate, roll } from '../rng.js';
import { FT } from '../space.js';
import { coverOf, inSight } from '../sight.js';
import { bounded, incapacitatedBy, modifiers } from '../modifiers.js';
import { SUMMON_MOST } from '../content/schema.js';
import { turnKey } from '../durations.js';

export const ARENA_RADIUS = 6;       // hexes locked around the start of a fight
export const EXPLORE_BUDGET = 300;   // feet per tap while free roaming
export const FLY_CEILING = 40;       // how far above the highest floor (or itself) the engine looks for a flyer's routes, in feet
export const mod = (score) => Math.floor((score - 10) / 2);

export class RuleError extends Error {}
export const fail = (msg) => { throw new RuleError(msg); };

export const up = (e) => !e.dead && e.hp > 0;
export const hostile = (a, b) => a.side !== b.side;
export const living = (s) => Object.values(s.entities).filter((e) => !e.dead);
export const inFight = (s, id) => !!s.encounter && s.encounter.order.some((o) => o.id === id);
export const current = (s) => (s.encounter ? s.encounter.order[s.encounter.turn]?.id ?? null : null);
// A spellcaster's spell attack bonus and save DC, with what modifiers change about them when the
// game state is given (`spell.attack`, `spell.dc`). With `spell`, the ability of the class that
// prepares it (a character with several classes: `spellAbil`).
export const castAbilOf = (e, spell) => e.spellAbil?.[spell] ?? e.castAbil;
export const spellStats = (e, s = null, spell = null) => {
  const m = e.prof + mod(e.abil[castAbilOf(e, spell)] ?? 10);
  if (!s) return { attack: m, dc: 8 + m };
  const a = modifiers(s, e, 'spell.attack', {}, ''), d = modifiers(s, e, 'spell.dc', {}, '');
  return { attack: bounded(a, m + a.add), dc: bounded(d, 8 + m + d.add) };
};
export const ent = (s, id) => s.entities[id] || fail('No such creature.');
// Who plays a creature: its own player, or for a companion (a creature with a `bond`; engine/companions.js,
// docs/specs/companions.md, Decision 1) its master's player. A bonded creature has no `owner` of its own, so
// a player still owns one creature, and a familiar goes to the DM and back with its master. null: the DM's.
//
// A companion that takes commands (`orders: 'command'`: Animate Dead, Create Undead, Animate Objects; Decision 6 and
// amendment A2) is its master's player's in a fight only on a turn its master commanded with a Bonus Action
// (`commanded`, stamped with that turn by resolve.js, beginTurn); on any other turn, and off its turns, it is the
// DM's, who plays it on its standing order or, with none, as the lock below allows. Outside a fight (or outside the
// fight going on) it is its master's player's, as any companion (Decision 6: it moves as any party member).
export const ownerOf = (s, e) => {
  if (!e) return null;
  if (e.owner) return e.owner;
  const to = e.bond?.to;
  const who = (typeof to === 'string' && Object.hasOwn(s?.entities ?? {}, to) && s.entities[to].owner) || null;
  if (who && e.bond.orders === 'command' && s?.encounter && inFight(s, e.id) && !commandedNow(s, e)) return null;
  return who;
};
// Is this its turn, and did its master command it for this turn? (A2.) `commanded.turn` is the turn the command was
// taken up for, set at the start of the creature's first turn after the command (resolve.js, takeCommand).
export const commandedNow = (s, e) => {
  const c = e?.bond?.orders === 'command' ? e.bond.commanded : null;
  return !!c && typeof c === 'object' && !!s?.encounter && current(s) === e.id && typeof c.turn === 'string' && c.turn === turnKey(s);
};
// The lock (Decision 6): a commanded creature with no order standing and no command for this turn "takes the Dodge
// action and moves only to avoid harm". Whoever plays it (the DM, or the companion brain for the DM) may send only
// these for it; the rest are what a creature's player or the DM set about it, or answer, not things it does. Whether
// a move avoids harm is the DM's; `follow` (and stopping) is moving, as for any party member outside a fight (Decision 6).
// Outside the fight going on, a command given there (`at: null`) lifts it too. Only the acting creature (`actor`) is
// locked: a locked creature named as the leader of a `partyFollow` or `formation` is not doing anything itself.
const UNLOCKED = new Set(['move', 'dodge', 'endTurn', 'stand', 'follow', 'reactions', 'companion', 'react', 'stepAway', 'stepBack']);
export function commandLock(s, e) {
  const b = e?.bond;
  if (b?.orders !== 'command' || (typeof b.standing === 'string' && b.standing)) return false;
  if (s?.encounter && inFight(s, e.id)) return !commandedNow(s, e);
  return !(b.commanded && typeof b.commanded === 'object' && b.commanded.at === null);
}
export const control = (s, e, ctx) => {
  const type = RUN?.action?.type, acting = typeof type === 'string' && RUN.action.actor === e.id;
  if (ctx.role !== 'dm') {
    const who = ownerOf(s, e), r = steering(s, e);
    // A controlled mount "moves on your turn as you direct it": its rider's player sends its moves, Dash and Disengage.
    (!!who && who === ctx.userId) || (acting && DIRECTED.has(type) && !!r && ownerOf(s, r) === ctx.userId) || fail(`${e.name} isn't yours to control.`);
  }
  if (acting && !UNLOCKED.has(type) && commandLock(s, e)) fail(`${e.name} has no command to follow, so it only takes the Dodge action and moves to avoid harm.`);
  if (acting && steering(s, e)) {
    if (type === 'dodge') fail(`A controlled mount's Dodge is not in the engine yet: the DM gives ${e.name} the Dodge by hand.`);
    RIDDEN.has(type) || fail('A controlled mount can only Dash, Disengage or Dodge.');
  }
  return true;
};

// ---------- riding (docs/specs/companions.md, Decision 8; stage C6a) ----------
// A rider carries `riding: { on: mountId, controlled, size }` and its mount `rider: riderId`; one rider per mount.
// `size` is the mount's, so that space.js can give the rider the mount's footprint without the game state.
// The rider of this mount, if the pair is whole (both records there, each naming the other), else null.
export const riderOf = (s, m) => {
  const id = m?.rider, r = typeof id === 'string' && Object.hasOwn(s?.entities ?? {}, id) ? s.entities[id] : null;
  return r && r.riding?.on === m.id ? r : null;
};
// The mount this creature rides, if the pair is whole, else null.
export const mountOf = (s, r) => {
  const id = r?.riding?.on, m = typeof id === 'string' && Object.hasOwn(s?.entities ?? {}, id) ? s.entities[id] : null;
  return m && m.rider === r.id ? m : null;
};
// The rider steering this mount: a rider that controls it (SRD "Controlling a Mount": it moves on its rider's turn
// as the rider directs and has only Dash, Disengage and Dodge), or null for a mount nobody rides or an independent one.
export const steering = (s, m) => { const r = riderOf(s, m); return r?.riding.controlled === true ? r : null; };
// What a controlled mount may be sent, by its rider's player (DIRECTED) or by anyone who may play it (RIDDEN): its moves,
// Dash and Disengage, and its Dodge (only to be told it is not built: attacks.js spends the rider's action for it), and,
// by whoever plays it, what is set about it or answered for it.
const DIRECTED = new Set(['move', 'dash', 'disengage', 'dodge']);
const RIDDEN = new Set(['move', 'dash', 'disengage', 'reactions', 'companion', 'react', 'stepAway', 'stepBack']);
// Whose turn a creature moves on, and from which budget, in the fight going on: its own turn and `budget`, or, for a
// controlled mount, its rider's turn and `budget.mount`. Null when it is not its turn to move (or there is no fight).
export function turnBudget(s, e) {
  const enc = s?.encounter;
  if (!enc || !enc.budget) return null;
  const r = steering(s, e);
  if (r) return current(s) === r.id && enc.budget.mount && typeof enc.budget.mount === 'object' ? enc.budget.mount : null;
  return current(s) === e.id ? enc.budget : null;
}
export const fighters = (s) => (s.encounter ? s.encounter.order.map((o) => s.entities[o.id]).filter(Boolean) : []);
export const ft = (hexes) => `${hexes * FT} ft`;
export const featOf = (e, id) => (e.feats ?? []).find((f) => f.id === id) ?? null;

// Is there nothing solid between two positions? A wall or a shut door stops attacks, spells and
// notice. This is the straight line between hex centres; cover and light come with the sight spec.
export function clear(s, a, b) { return inSight(s.map, a, b); }
// Between two creatures: is any part of one in the clear from any part of the other?
export function unblocked(s, a, b) { return coverOf(s, a, b) !== 'total'; }
export const walled = (s, e, t) => unblocked(s, e, t) || fail(`There is a wall between ${e.name} and ${t.name}.`);

// Dying: at 0 Hit Points, not dead and not Stable, so still rolling Death Saving Throws.
export const dying = (e) => !e.dead && e.hp <= 0 && !e.cond?.stable;
// The party's characters (not companions or summons on its side); a fight with none of them counts its whole side.
export const partyOf = (list) => { const pcs = list.filter((e) => e.side === 'party' && e.kind === 'pc'); return pcs.length ? pcs : list.filter((e) => e.side === 'party'); };
// The party has fallen (docs/specs/table-ui.md, Decision 1). In a fight: no party character is up and none is
// dying. Outside one, where nobody rolls Death Saving Throws: no party character is up. A table with no
// party characters has not fallen.
export function fallen(s) {
  const pcs = Object.values(s.entities).filter((e) => e.side === 'party' && e.kind === 'pc');
  if (!pcs.length) return false;
  return s.encounter ? !partyOf(fighters(s)).some((e) => up(e) || dying(e)) : !pcs.some(up);
}

// ---------- dice ----------

// Roll the dice that modifiers add to a roll (Bless's 1d4, Bane's -1d4). Returns the total and,
// for the roll's event, what was rolled for what: [{ name, dice, roll }].
export function rollDice(s, list) {
  let total = 0;
  const extra = [], dice = [];
  for (const d of list) {
    const neg = d.dice.startsWith('-'), rr = roll(s, d.dice.replace(/^[+-]/, '')), r = rr.total * (neg ? -1 : 1);
    total += r;
    extra.push({ name: d.name, dice: d.dice, roll: r });
    dice.push(...(neg ? negate(rr.dice) : rr.dice));
  }
  return { total, extra, dice };
}

// The faces of a roll for its event (docs/specs/dice.md): `dice` and `bonus`, `rolled` where the
// number they add up to is not the event's amount (halved, resisted, clamped), and `by`, who rolled.
export function rolledOf(r, amount) {
  if (!r?.dice) return {};
  const rolled = faceSum(r.dice) + (r.bonus ?? 0);
  return { dice: r.dice, bonus: r.bonus ?? 0, ...(rolled !== amount ? { rolled } : {}), ...(r.by !== undefined ? { by: r.by } : {}) };
}
// Several rolls that add up to one number, as one: { total, dice, bonus }.
export function together(...rs) {
  return { total: rs.reduce((a, r) => a + r.total, 0), dice: rs.flatMap((r) => r.dice ?? []), bonus: rs.reduce((a, r) => a + (r.bonus ?? 0), 0) };
}

// ---------- reactions (reactions.js; docs/specs/rules-expansion.md, Decision 4) ----------

// Asking a player in the moment (stage B). An action that comes to a reaction whose instruction is
// `ask`, of a creature a player controls, stops: apply() puts the state back as it was before the
// action, keeps the action in `pending` with the answers given so far, and tells that player.
// Their answer (the `react` action) runs the same action again from the same state, so the same
// dice fall the same way; at each point where it asked before, the answer is read instead. Nothing
// waits inside a JavaScript call, so a waiting table can be saved, sent, undone and replayed.
export class Pause { constructor(ask) { this.ask = ask; } }
export let RUN = null;     // while apply() runs: { action, ctx, answers, i, canPause }
export const setRun = (run) => { RUN = run; };

// The answer at this point of the action, { reactor, take, slot? } (`take` null: declined), or
// null for a creature the DM controls (the caller tells the DM, and nothing waits). Otherwise
// stops the action to ask. `q` is what the asked player is told; `options` what they may take.
export function ask(s, t, q, options) {
  if (RUN && RUN.i < RUN.answers.length) {
    const a = RUN.answers[RUN.i++];
    // An answer that does not fit what is asked here (the same state asks the same, so it never
    // should) declines rather than taking something nobody chose.
    const o = a.reactor === t.id && options.find((x) => x.reaction === a.take);
    return o && (a.slot === undefined || o.slots?.includes(a.slot)) ? a : { reactor: t.id, take: null };
  }
  if (!ownerOf(s, t) || !RUN?.canPause) return null;
  throw new Pause({ reactor: t.id, ...q, options });
}
// A DM's creature whose instruction is to ask: the DM alone is told, and decides by hand.
export function tellDM(t, r, what, ev) {
  ev.push({ type: 'manual', actor: t.id, name: r.name, partial: true,
    text: `${what} ${t.name}'s instruction for ${r.name} is to ask the DM: if it takes it, the DM applies it and marks its Reaction used.` });
}

// ---------- whether a creature can act ----------

// Why this creature can't take an action/bonus action right now ('' if it can).
export function blocked(s, e, time = 'action') {
  if (!up(e)) return `${e.name} is down.`;
  const stopped = incapacitatedBy(e);
  if (stopped) return `${e.name} is ${stopped} and can't act.`;
  if (!s.encounter) return '';
  if (!inFight(s, e.id)) return `${e.name} is outside the battle. Move into the arena to join.`;
  if (current(s) !== e.id) return `It isn't ${e.name}'s turn.`;
  if (time && s.encounter.budget[time] < 1) return `${e.name} has already used ${time === 'bonus' ? 'a Bonus Action' : 'an action'} this turn.`;
  return '';
}
export const need = (s, e, time) => { const why = blocked(s, e, time); if (why) fail(why); };
// Refuse if a condition stops this creature acting at all, in or out of a fight.
export const able = (e) => { const by = incapacitatedBy(e); if (by) fail(`${e.name} is ${by} and can't act.`); };

// Which part of a turn Dash, Disengage or Hide takes: a Bonus Action when asked for (`a.bonus`) by a
// creature that may (Cunning Action, `bonusActs`); Nimble Escape makes Disengage and Hide one always.
export function actTime(e, kind, a) {
  const nimble = !!e.features?.nimbleEscape && kind !== 'dash';
  if (a.bonus) { (nimble || e.bonusActs?.includes(kind)) || fail(`${e.name} can't take that as a Bonus Action.`); return 'bonus'; }
  return nimble ? 'bonus' : 'action';
}
// Fleet Step (`fleet: { of }`): the feature it names (Step of the Wind) taken without a Bonus Action,
// on the creature's turn in a fight, once a turn, after a Bonus Action that was not that feature.
// `used:<feature>:<id>` marks that feature taken with a Bonus Action this turn.
export const fleetOf = (e) => { const f = (e.feats ?? []).find((x) => x.fleet); return f && featOf(e, f.fleet.of) ? f.fleet.of : null; };
export function fleetFree(s, e, id) {
  const enc = s.encounter;
  if (!enc || current(s) !== e.id || enc.budget.bonus > 0 || fleetOf(e) !== id) return false;
  return !enc.flags[`used:${id}:${e.id}`] && !enc.flags[`fleet:${e.id}`];
}
export const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

// ---------- companions (docs/specs/companions.md) ----------

// At most this many creatures bonded to one master, however they were bonded: the DM's `bond` and a spell's
// `summon` (companions.js, casting.js) alike (owner's question 7; amendment A4). It is the number the content linter lets one
// summon step make (schema.js, SUMMON_MOST), so no step makes more than a master may have.
export const BOND_MAX = SUMMON_MOST;
// A husk left by an unseen vanish (resolve.js, vanishUnseen) has no bond; one kept from before stage C2 is passed by too.
export const companionsOf = (s, id) => Object.values(s.entities).filter((x) => x.bond?.to === id && !x.vanished);
// Refused, with the one text for it, unless master `m` has room for `n` more companions. A dead companion does not count
// (any kind: a Zombie or a pet that dies keeps its bond, `at0: 'dies'`, so the DM can bring it back with `setHp`; review
// of #341). Only the cap skips them: they are still `m`'s companions everywhere else.
// A familiar in its master's pocket dimension (stage C5c) still counts: it is still the master's, only not on the map.
export function roomForCompanions(s, m, n = 1) {
  companionsOf(s, m.id).filter((x) => !x.dead).length + pocketOf(m).length + n <= BOND_MAX || fail(`${m.name} can have at most ${BOND_MAX} companions.`);
}
// The familiars a master has dismissed to a pocket dimension (Decision 6; stage C5c): out of `state.entities`, kept
// on the master as `pocket = { [id]: record }`, so nothing on the map, in sight or in the fight sees them. Only the
// master's own keys, in the order they were put there.
export const pocketOf = (m) => (m?.pocket && typeof m.pocket === 'object' && !Array.isArray(m.pocket) ? Object.keys(m.pocket).map((k) => m.pocket[k]) : []);
