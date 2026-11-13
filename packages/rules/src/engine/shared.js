// The engine's basics, used by every other part of it (engine.js): constants, who a creature is
// and who controls it, refusing an action, rolling dice, and stopping an action to ask a player.
import { faceSum, negate, roll } from '../rng.js';
import { FT } from '../space.js';
import { coverOf, inSight } from '../sight.js';
import { bounded, incapacitatedBy, modifiers } from '../modifiers.js';

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
export const control = (e, ctx) =>
  ctx.role === 'dm' || (e.owner && e.owner === ctx.userId) || fail(`${e.name} isn't yours to control.`);
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

// ---------- damage, healing, attacks ----------

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
  if (!t.owner || !RUN?.canPause) return null;
  throw new Pause({ reactor: t.id, ...q, options });
}
// A DM's creature whose instruction is to ask: the DM alone is told, and decides by hand.
export function tellDM(t, r, what, ev) {
  ev.push({ type: 'manual', actor: t.id, name: r.name, partial: true,
    text: `${what} ${t.name}'s instruction for ${r.name} is to ask the DM: if it takes it, the DM applies it and marks its Reaction used.` });
}

// A die added to a D20 Test that failed (`onFail` modifiers: a Bardic Inspiration die on the
// creature, `d20`; Peerless Skill, `attack.roll`, paid from a feature's uses only if it succeeds).
// Used only where it could turn the failure (`short`, how much the roll fell short, is no more
// than the dice can make), as a player would; the first that fits is rolled. Returns
// { add, name, dice, success } or null.
export const diceMax = (d) => { const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(d); return m ? +m[1] * +m[2] + (+m[3] || 0) : 0; };

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
export const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

