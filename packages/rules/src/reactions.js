// Reactions, stage A: standing instructions (docs/specs/rules-expansion.md, Decision 4).
//
// A creature has one Reaction a round: spent when it is used, back at the start of its own turn
// (engine.js, advanceTurn), and not usable while it is Incapacitated or down. What it can react
// with is worked out here from its record: the Opportunity Attack (any creature with a melee
// attack), spells whose data has a `reaction` trigger, and built features that grant one.
//
// Nothing pauses. Each reaction carries a standing instruction, set in advance by whoever
// controls the creature (the `reactions` action) and kept on the creature as `reactions`:
// { [reaction id]: when }. The engine reads it at the trigger and resolves inside the action that
// set the trigger off. An instruction is private to the creature's controller and the DM
// (view.js strips it from what everyone else is sent).
//
// Triggers (REACTION_TRIGGERS in content/schema.js):
//   leave  a creature it can see leaves its reach (the Opportunity Attack; built in, no data)
//   hit    it is hit by an attack roll (Shield, Uncanny Dodge, Deflect Attacks)
// Shield's "targeted by Magic Missile" is the spell's `blocks` list, checked when a spell is cast.
// Pure: no I/O, no randomness here.
import { SPELLS } from './content/index.js';
import { incapacitated } from './modifiers.js';

export const OPPORTUNITY = 'opportunity-attack';
// What an instruction can say. `miss`: only when the reaction would turn the hit into a miss
// (for one that adds to Armor Class). `ask`: the engine does not take it and tells the DM, who
// decides and applies it by hand.
export const WHEN = {
  always: 'Always', never: 'Never', miss: 'Only if it turns the hit into a miss', ask: 'Ask the DM',
};

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
// { id, name, kind: 'attack' | 'spell' | 'feature', on, options, dflt, ... }. The default for a
// reaction that spends a spell slot is `never`, so nothing is spent that nobody chose to spend;
// one that costs only the Reaction is `always`, as the Opportunity Attack always was.
export function reactionsOf(e) {
  const out = [];
  if (opportunityAttack(e)) out.push({ id: OPPORTUNITY, name: 'Opportunity Attack', kind: 'attack', on: 'leave', options: ['always', 'never', 'ask'], dflt: 'always' });
  for (const id of e.spells ?? []) {
    const sp = SPELLS[id], r = sp?.def.reaction;
    if (!r) continue;
    const ac = acGain(sp.def);
    out.push({ id, name: sp.name, kind: 'spell', on: r.on, options: ['never', ...(ac ? ['miss'] : []), 'always'], dflt: 'never', ac, ...(r.blocks ? { blocks: [...r.blocks] } : {}) });
  }
  for (const f of e.feats ?? []) {
    if (!f.reaction) continue;
    out.push({ id: f.id, name: f.name, kind: 'feature', on: f.reaction.on, options: ['never', 'always'], dflt: 'always', reaction: f.reaction, tier: f.tier, text: f.text });
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
