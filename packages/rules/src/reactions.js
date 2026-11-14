// Reactions (docs/specs/rules-expansion.md, Decision 4: stage A, standing instructions; stage B,
// prompts).
//
// A creature has one Reaction a round: spent when it is used, back at the start of its own turn
// (engine.js, advanceTurn), and not usable while it is Incapacitated or down. What it can react
// with is worked out here from its record: the Opportunity Attack (any creature with a melee
// attack), spells whose data has a `reaction` trigger, built features that grant one, and a pack
// monster's traits that carry one (Parry).
//
// Each reaction carries a standing instruction, set in advance by whoever controls the creature
// (the `reactions` action) and kept on the creature as `reactions`: { [reaction id]: when }. The
// engine reads it at the trigger. `always`, `never` and `miss` resolve inside the action that set
// the trigger off. `ask` stops that action for a creature a player controls: the engine keeps it
// waiting in the game state (`pending`), tells that player (view.js, viewPrompt), and carries on
// when the player or the DM answers with the `react` action (engine.js). For one of the DM's own
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
// Shield's "targeted by Magic Missile" is the spell's `blocks` list, checked when a spell is cast.
// Pure: no I/O, no randomness here.
import { CONTENT, SPELLS } from './content/index.js';
import { incapacitated } from './modifiers.js';

export const OPPORTUNITY = 'opportunity-attack';
// What an instruction can say. `miss`: only when the reaction would turn the hit into a miss
// (for one that adds to Armor Class). `ask`: a player is asked in the moment; for the DM's own
// creatures the DM is told and decides by hand.
export const WHEN = {
  always: 'Always', never: 'Never', miss: 'Only if it turns the hit into a miss', ask: 'Ask',
};

// Actions the table may still take while an action waits for a reaction: the answer itself, and
// what changes nothing the waiting action could depend on (talk, notes, handouts, seats).
export const WHILE_WAITING = new Set(['react', 'say', 'note', 'claim', 'release', 'handout', 'showHandout', 'hideHandout', 'removeHandout', 'askCheck']);

// What a creature makes an Opportunity Attack with: its first melee attack action, or for a
// creature with flat attack records, its first melee attack.
export function opportunityAttack(o) {
  if (o.actions) return o.actions.find((a) => !a.multiattack && a.target?.creature?.reach && a.effects[0]?.attack === 'melee') ?? null;
  return (o.attacks ?? []).find((a) => a.type === 'melee') ?? null;
}

// How much a spell's own steps add to Armor Class (Shield: 5), or 0.
function acGain(def) {
  return (def.effects ?? []).reduce((n, st) => n + (st.modifier?.on === 'ac' && st.modifier.op === 'add' && typeof st.modifier.value === 'number' ? st.modifier.value : 0), 0);
}

// Every reaction this creature has, in the order the engine considers them at a trigger:
// { id, name, kind: 'attack' | 'spell' | 'feature' | 'trait', on, options, dflt, ... }. The default
// for a reaction that spends a spell slot is `never`, so nothing is spent that nobody chose to
// spend; one that costs only the Reaction is `always`, as the Opportunity Attack always was, but
// one that only adds to Armor Class (Parry) is `miss`, so the Reaction is not thrown away on a hit
// it cannot turn. Reactions that add to Armor Class come before those that cut damage.
export function reactionsOf(e) {
  const out = [];
  if (opportunityAttack(e)) out.push({ id: OPPORTUNITY, name: 'Opportunity Attack', kind: 'attack', on: 'leave', options: ['always', 'never', 'ask'], dflt: 'always' });
  for (const id of e.spells ?? []) {
    const sp = SPELLS[id], r = sp?.def.reaction;
    if (!r) continue;
    const ac = acGain(sp.def);
    out.push({ id, name: sp.name, kind: 'spell', on: r.on, options: ['never', ...(ac ? ['miss'] : []), 'always', 'ask'], dflt: 'never', ac, ...(r.blocks ? { blocks: [...r.blocks] } : {}) });
  }
  for (const t of CONTENT.monsters[e.tpl]?.traits ?? []) {
    const r = t.reaction;
    if (!r) continue;
    out.push({ id: t.id, name: t.name, kind: 'trait', on: r.on, options: ['never', 'miss', 'always', 'ask'], dflt: 'miss', ac: r.ac, ...(r.attack ? { attack: r.attack } : {}), ...(r.manual ? { manual: r.manual } : {}) });
  }
  // Not Reactions, but choices made in advance the same way (#224): a feature used on rolling
  // Initiative (Persistent Rage, Uncanny Metabolism) is taken by instruction, `always` or `never`.
  // `free`: it does not spend the Reaction, and no trigger above looks at it.
  for (const f of e.feats ?? []) if (f.initiative && f.uses) out.push({ id: f.id, name: f.name, kind: 'free', on: 'initiative', options: ['never', 'always'], dflt: 'always' });
  // A failed save rolled again for a use (Indomitable, Disciplined Survivor), likewise.
  for (const f of e.feats ?? []) if (f.reroll) out.push({ id: f.id, name: f.name, kind: 'free', on: 'reroll', options: ['never', 'always'], dflt: 'always' });
  for (const f of e.feats ?? []) {
    if (!f.reaction) continue;
    // A reroll of an ally's failed save (Countercharm) is taken by instruction only: no prompt is built for it.
    out.push({ id: f.id, name: f.name, kind: 'feature', on: f.reaction.on, options: f.reaction.on === 'saveFailed' ? ['never', 'always'] : ['never', 'always', 'ask'], dflt: 'always', reaction: f.reaction, tier: f.tier, text: f.text });
  }
  return out;
}

// The instruction a creature has for a reaction: what was set, or the default.
export const instruction = (e, r) => {
  const w = e.reactions?.[r.id];
  return r.options.includes(w) ? w : r.dflt;
};

// Can it take a Reaction now? Not if it has used one since its turn began, is down or dead, or
// has a condition that stops reactions (Incapacitated, and what includes it: SRD "Inactive").
export const canReact = (e) => !!e && !e.dead && e.hp > 0 && !e.reactionUsed && !incapacitated(e);

// Could anything at this table stop an action to ask a player? Only a creature a player controls
// with a standing instruction of `ask`. The engine takes a copy of the state before an action
// only then (engine.js, apply), so the rest of the time asking costs nothing.
export const mayAsk = (s) => Object.values(s.entities).some((e) => e.owner && e.reactions && Object.values(e.reactions).includes('ask'));

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
