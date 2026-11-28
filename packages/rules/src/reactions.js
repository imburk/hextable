// Reactions (docs/specs/rules-expansion.md, Decision 4: stage A, standing instructions; stage B,
// prompts).
//
// A creature has one Reaction a round: spent when it is used, back at the start of its own turn
// (engine/resolve.js, advanceTurn), and not usable while it is Incapacitated or down. What it can react
// with is worked out here from its record: the Opportunity Attack (any creature with a melee
// attack), spells whose data has a `reaction` trigger, built features that grant one, and a pack
// monster's traits that carry one (Parry).
//
// Each reaction carries a standing instruction, set in advance by whoever controls the creature
// (the `reactions` action) and kept on the creature as `reactions`: { [reaction id]: when }. The
// engine reads it at the trigger. `always`, `never` and `miss` resolve inside the action that set
// the trigger off. `ask` stops that action for a creature a player controls: the engine keeps it
// waiting in the game state (`pending`), tells that player (view.js, viewPrompt), and carries on
// when the player or the DM answers with the `react` action (engine.js, the react handler). For one of the DM's own
// creatures `ask` hands the moment to the DM with a `manual` event and nothing waits, so monster
// turns and the AI never stop on themselves. An instruction is private to the creature's
// controller and the DM (view.js strips it from what everyone else is sent).
//
// Triggers (REACTION_TRIGGERS in content/schema.js):
//   leave    a creature it can see leaves its reach (the Opportunity Attack; built in, no data)
//   hit      it is hit by an attack roll (Shield, Uncanny Dodge, Deflect Attacks, Parry)
//   cast     it sees a hostile creature within the spell's range casting a spell (Counterspell)
//   damaged  it takes damage from a hostile creature it can see within the spell's range (Hellish Rebuke)
//   saveFailed  it or an ally within range fails a save against an effect that would apply one of
//            some conditions (Countercharm: rolled again with Advantage; by instruction only)
//   attacks  a hostile creature under a lasting effect the holder's feature made makes an attack (#537, addition I of docs/specs/homebrew-subclasses.md:
//            `reaction: { on: 'attacks', of, attack: 'melee' }`, Soul of Vengeance); one melee weapon attack against it, before its roll (engine/attacks.js, `reactToAttacker`)
//   familiarDamaged  its familiar takes damage (Investment of the Chain Master: Resistance to it; #464, from `invest.ward`)
// Shield's "targeted by Magic Missile" is the spell's `blocks` list, checked when a spell is cast.
// Pure: no I/O, no randomness here.
import { CONTENT, SPELLS } from './content/index.js';
import { handsFull, isUnarmed, steadiest } from './weapons.js';
import { incapacitated } from './modifiers.js';
import { SIZES } from './content/schema.js';
import { ownerOf, resistLeft } from './engine/shared.js';
import { mayAskHit } from './hitchoices.js';

export const OPPORTUNITY = 'opportunity-attack';
// The answer to an Opportunity Attack prompt that Grapples with the Unarmed Strike instead of making its damage (stage G6 of
// docs/specs/grapple-shove.md, Decision 10). Only an answer, like OPPORTUNITY_RIDER (engine/movement.js): there is no standing
// instruction for it, so it is offered only to a creature whose instruction for the Opportunity Attack is `ask`.
export const OPPORTUNITY_GRAPPLE = 'opportunity-attack-grapple';
// What an instruction can say. `miss`: only when the reaction would turn the hit into a miss
// (for one that adds to Armor Class). `ask`: a player is asked in the moment; for the DM's own
// creatures the DM is told and decides by hand.
export const WHEN = {
  always: 'Always', never: 'Never', miss: 'Only if it turns the hit into a miss', ask: 'Ask',
  // Legendary Resistance (docs/specs/legendary.md, Decision 6): spent by itself only when failing the save would change something for its creature.
  matters: 'Only if the failure matters',
};
// The instruction for Legendary Resistance is kept in `e.reactions` under this id, as any other (engine/rolls.js, resistFailure, reads it).
export const RESISTANCE = 'legendary-resistance';

// Actions the table may still take while an action waits for a reaction: the answer itself, and
// what changes nothing the waiting action could depend on (talk, notes, handouts, seats).
export const WHILE_WAITING = new Set(['react', 'say', 'ping', 'note', 'claim', 'release', 'handout', 'showHandout', 'hideHandout', 'removeHandout', 'askCheck']);

// Actions the table may take while a window for legendary actions is open (docs/specs/legendary.md, Decision 3): nobody has a turn, so only what
// changes nothing about whose turn it is. What waits for a reaction is allowed too (a legendary action may ask), and the DM may end the fight.
export const BETWEEN_OK = new Set([...WHILE_WAITING, 'legendary', 'legendarySet', 'reactions', 'harm', 'mend', 'setHp', 'condition', 'setAc', 'place', 'save', 'todoDone', 'endEncounter']);

// Addition H of docs/specs/homebrew-subclasses.md: the feature of `o` that lets it move after its Opportunity Attack hits (`triggers.opportunityHit`), or null.
// What it gives is feet of movement, kept on the fight's turn flags as `rmove:<creature>` until the next turn begins (engine/movement.js).
export const OWED_MOVE = 'rmove';
export const afterOpportunity = (o) => (o?.feats ?? []).find((f) => f.triggers?.opportunityHit?.move === 'half') ?? null;

// What a creature makes an Opportunity Attack with: its first melee attack action, or for a
// creature with flat attack records, its first melee attack.
// A companion that can't attack (`bond.noAttack`, a familiar) has none, so nobody walking away from it is threatened.
// With the game state `s`, a melee attack the creature may make (weapons.js: a Two-Handed weapon beside a Shield is not one); without it,
// the list of reactions says what the creature has.
export function opportunityAttack(o, s = null) {
  return opportunityAttacks(o, s)[0] ?? null;
}
// Every melee attack the creature could make as an Opportunity Attack, the one it prefers first: for a creature that plays from actions, its
// melee attack actions in order (the walk takes the first whose part is not full: engine/movement.js, DEBT T74); for one with flat
// records, the one `steadiest` picks.
export function opportunityAttacks(o, s = null) {
  if (o.bond?.noAttack) return [];
  if (o.actions) return o.actions.filter((a) => !a.multiattack && a.target?.creature?.reach && a.effects[0]?.attack === 'melee');
  const a = steadiest(o, (o.attacks ?? []).filter((x) => x.type === 'melee' && !handsFull(s, o, x)), s);
  return a ? [a] : [];
}

// The Unarmed Strike `o` may Grapple `t` with as its Opportunity Attack (SRD "Opportunity Attacks": "a weapon or an Unarmed Strike";
// "Unarmed Strike", Grapple: no more than one size larger, a hand free), or null. A creature that plays from actions (a pack monster)
// has no Unarmed Strike (docs/specs/grapple-shove.md, Q5), and one that already holds `t` has nothing to grab. Offered only where the
// engine would take it, so a refusal never tells a player anything about `t`: a target immune to Grappled is not left out.
export function grappleInstead(s, o, t, named = true) {
  if (!s?.entities || o.bond?.noAttack || o.actions || t.dead) return null;
  const strikes = (o.attacks ?? []).filter((a) => a.type === 'melee' && isUnarmed(a));
  const atk = strikes.find((a) => a.id === 'unarmed-strike') ?? strikes[0];
  if (!atk || handsFull(s, o, atk, true)) return null;
  // A mover the question does not name (one only its senses found) is offered it whatever its size, so the list tells nothing of it; if
  // it is too big when the answer comes, the Grapple is refused then, with the Reaction spent (engine/movement.js).
  if (named && SIZES.indexOf(t.size ?? 'medium') > SIZES.indexOf(o.size ?? 'medium') + 1) return null;
  return (t.cond?.grappled?.holds ?? []).some((h) => h.by === o.id) ? null : atk;
}

// How much a spell's own steps add to Armor Class (Shield: 5), or 0.
function acGain(def) {
  return (def.effects ?? []).reduce((n, st) => n + (st.modifier?.on === 'ac' && st.modifier.op === 'add' && typeof st.modifier.value === 'number' ? st.modifier.value : 0), 0);
}

// Addition I: is `c` under a lasting effect that `holder` made with its feature `of`? The effect is the holder's own, from that feature, and still holds something on `c`: a part
// put on it, or a part put on the holder against it only (a modifier `against: 'target'`). Reads the state without touching it (`effectsOf` would make the list).
export function underEffect(s, holder, of, c) {
  if (!c || !holder || c.id === holder.id) return false;
  return (s.effects ?? []).some((fx) => fx.source === holder.id && fx.feature === of && (fx.parts ?? []).some((p) => !p.ended && (p.target === c.id || p.against === c.id)));
}

// Every reaction this creature has, in the order the engine considers them at a trigger:
// { id, name, kind: 'attack' | 'spell' | 'feature' | 'trait', on, options, dflt, ... }. The default
// for a reaction that spends a spell slot is `never`, so nothing is spent that nobody chose to
// spend; one that costs only the Reaction is `always`, as the Opportunity Attack always was, but
// one that only adds to Armor Class (Parry) is `miss`, so the Reaction is not thrown away on a hit
// it cannot turn. Reactions that add to Armor Class come before those that cut damage.
export function reactionsOf(e) {
  const out = [];
  // A companion that can't attack (a familiar) makes no Opportunity Attack and no attack as a Reaction.
  const strikes = !e.bond?.noAttack;
  if (opportunityAttack(e)) out.push({ id: OPPORTUNITY, name: 'Opportunity Attack', kind: 'attack', on: 'leave', options: ['always', 'never', 'ask'], dflt: 'always' });
  for (const id of e.spells ?? []) {
    const sp = SPELLS[id], r = sp?.def.reaction;
    if (!r) continue;
    const ac = acGain(sp.def);
    out.push({ id, name: sp.name, kind: 'spell', on: r.on, options: ['never', ...(ac ? ['miss'] : []), 'always', 'ask'], dflt: 'never', ac, ...(r.blocks ? { blocks: [...r.blocks] } : {}) });
  }
  for (const t of CONTENT.monsters[e.tpl]?.traits ?? []) {
    const r = t.reaction;
    if (!r || (r.attack && !strikes)) continue;
    out.push({ id: t.id, name: t.name, kind: 'trait', on: r.on, options: ['never', 'miss', 'always', 'ask'], dflt: 'miss', ac: r.ac, ...(r.attack ? { attack: r.attack } : {}), ...(r.manual ? { manual: r.manual } : {}) });
  }
  // Not Reactions, but choices made in advance the same way (#224): a feature used on rolling
  // Initiative (Persistent Rage, Uncanny Metabolism) is taken by instruction, `always` or `never`.
  // `free`: it does not spend the Reaction, and no trigger above looks at it. Each spends a use or a
  // Focus Point, so, like a reaction that spends a spell slot (Shield), it is `never` until its
  // player says otherwise.
  for (const f of e.feats ?? []) if (f.initiative && f.uses) out.push({ id: f.id, name: f.name, kind: 'free', on: 'initiative', options: ['never', 'always'], dflt: 'never' });
  // A failed save rolled again for a use (Indomitable, Disciplined Survivor), likewise.
  for (const f of e.feats ?? []) if (f.reroll) out.push({ id: f.id, name: f.name, kind: 'free', on: 'reroll', options: ['never', 'always'], dflt: 'never' });
  // Legendary Resistance (a creature with a `legendary.resistance` block): a choice made in advance, not a Reaction (`free`), taken at a failed save while a use is left.
  // `matters` is the starting value; `ask` is applied as `manual` note until the question is built (docs/specs/legendary.md, stage L2b).
  if (e.legendary?.resistance) out.push({ id: RESISTANCE, name: 'Legendary Resistance', kind: 'free', on: 'save', options: ['matters', 'ask', 'always', 'never'], dflt: 'matters' });
  for (const f of e.feats ?? []) {
    if (!f.reaction) continue;
    // A reroll of an ally's failed save (Countercharm) is taken by instruction only: no prompt is built for it.
    out.push({ id: f.id, name: f.name, kind: 'feature', on: f.reaction.on, options: f.reaction.on === 'saveFailed' ? ['never', 'always'] : ['never', 'always', 'ask'], dflt: 'always', reaction: f.reaction, tier: f.tier, text: f.text });
  }
  // Investment of the Chain Master's Resistance (`invest.ward`; docs/specs/companions.md, C9c): its master's Reaction when its
  // familiar made by `spell` takes damage (engine/resolve.js, wardFor). It costs only the Reaction, but a familiar is hit nearly every
  // round, so for a master a player runs the default is `ask` (`dfltPlayer`), not `always`: the Reaction is not spent on every scratch
  // unasked (review of #467, 1). The DM's masters keep `always`, so their turns never stop. Nothing is stored for the default.
  for (const f of e.feats ?? []) {
    if (!f.invest?.ward) continue;
    out.push({ id: f.id, name: f.name, kind: 'feature', on: 'familiarDamaged', spell: f.invest.spell, options: ['never', 'always', 'ask'], dflt: 'always', dfltPlayer: 'ask', reaction: { on: 'familiarDamaged', resist: true }, tier: f.tier, text: f.text });
  }
  return out;
}

// The instruction a creature has for a reaction: what was set, or the default.
// The default of a reaction for this creature: `dfltPlayer` where one is given and a player runs it (ownerOf), else `dflt`. Without
// the game state `s` (or a reaction with no `dfltPlayer`) it is `dflt`.
export const defaultOf = (r, s = null, e = null) => (r.dfltPlayer && s && e && ownerOf(s, e) ? r.dfltPlayer : r.dflt);
// The instruction a creature has for a reaction: what was set, or the default (worked out from `s` where it depends on who runs it).
export const instruction = (e, r, s = null) => {
  const w = e.reactions?.[r.id];
  return r.options.includes(w) ? w : defaultOf(r, s, e);
};

// Can it take a Reaction now? Not if it has used one since its turn began, is down or dead, or
// has a condition that stops reactions (Incapacitated, and what includes it: SRD "Inactive").
export const canReact = (e) => !!e && !e.dead && e.hp > 0 && !e.reactionUsed && !incapacitated(e);

// Could anything at this table stop an action to ask a player? Only a creature a player controls
// with a standing instruction of `ask`. The engine takes a copy of the state before an action
// only then (engine.js, apply), so the rest of the time asking costs nothing.
// A companion is asked through its master's player (ownerOf).
// A default of `ask` counts too (Investment of the Chain Master's Resistance for a master a player runs: `dfltPlayer`), read from the
// feature itself so that this stays cheap; no other reaction has a default of `ask`.
// Legendary Resistance (docs/specs/legendary.md, Decision 6): while the table setting is on, a creature in play with a use left that is set to `ask`, or to `matters` (which asks
// when it cannot tell), could stop an action to ask the DM, so a copy is taken. With the setting off this is false at once: no extra copy, nothing changes.
export const mayAskLegendary = (s) => s.settings?.legendaryResistance !== false && Object.values(s.entities).some((e) => !e.dead && e.legendary?.resistance && resistLeft(e) > 0
  && !['always', 'never'].includes(e.reactions?.[RESISTANCE]));
export const mayAsk = (s) => mayAskHit(s) || mayAskLegendary(s) || Object.values(s.entities).some((e) => ((e.reactions && Object.values(e.reactions).includes('ask'))
  || (e.feats ?? []).some((f) => f.invest?.ward && !e.reactions?.[f.id])) && ownerOf(s, e));

// Check a `reactions` action's settings against what the creature has. Returns an error text, or null.
export function checkInstructions(e, set) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) return 'Say which reactions to set: { reaction: when }.';
  const keys = Object.keys(set);
  if (!keys.length || keys.length > 20) return 'Say which reactions to set: { reaction: when }.';
  const mine = reactionsOf(e);
  for (const k of keys) {
    const r = mine.find((x) => x.id === k);
    if (!r) return `${e.name} has no reaction called ${String(k).slice(0, 40)}.`;
    if (!r.options.includes(set[k])) return `${r.name} can be set to ${r.options.join(', ')}.`;
  }
  return null;
}

// Is a waiting reaction's record whole? (migrate.js, and nothing else trusts a saved one.)
export function validPending(p) {
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  return isObj(p) && Number.isInteger(p.n) && isObj(p.action) && typeof p.action.type === 'string' && isObj(p.ctx) && typeof p.ctx.role === 'string'
    && Array.isArray(p.answers) && p.answers.every(isObj) && isObj(p.ask) && typeof p.ask.reactor === 'string' && typeof p.ask.trigger === 'string'
    && Array.isArray(p.ask.options) && p.ask.options.length > 0 && p.ask.options.every((o) => isObj(o) && typeof o.reaction === 'string');
}
