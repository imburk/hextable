// Hit choices (docs/specs/on-hit.md, Decisions 1, 2 and 5): what a creature may do because its attack just hit.
//
// Stage O1 has one kind: a spell cast right after the hit, as a Bonus Action, whose damage joins the attack's (Divine Smite). A spell is one when its
// data has `hit: { with }` (content/schema.js). What a creature may choose is worked out here from its record; the engine (engine/resolve.js,
// `hitChoicesAt`, `castOnHit`) offers it at the hit, checks it and pays for it.
//
// Each choice has a standing instruction, kept on the creature as `hitChoices: { [choice id]: when }` and set by the `hitChoices` action by whoever
// controls it, at any time. The choice id is the spell id. `ask`: the player is asked at the hit (the action stops, as it does for a reaction
// prompt: engine/shared.js `ask`); for a creature no player controls, the DM is told and nothing is taken. `crit`: taken without asking on a
// Critical Hit only. `always`: taken on every hit it fits. `never`: not offered. Taken without asking means the lowest slot, or the free use of a
// feature that casts it without one (Paladin's Smite) while one is left. The default is `ask` for a creature a player controls and `never` for
// any other, so a DM's creature never stops: the DM names a choice ahead on its attack or sets an instruction.
//
// Pure: no I/O, no randomness.
import { SPELLS, CONTENT } from './content/index.js';
import { isUnarmed } from './weapons.js';
import { isWeapon } from './imbue.js';
import { ownerOf } from './engine/shared.js';

export const HIT_OPTIONS = ['ask', 'crit', 'always', 'never'];
export const HIT_WHEN = { ask: 'Ask', crit: 'Only on a Critical Hit', always: 'Always', never: 'Never' };

// What an attack must be for a `hit.with` of a spell (Decision 2). The ones the spec lists for later stages (`monk`, `flurry`, `pact`, `this`) fit nothing yet.
// A Melee weapon is one by the weapon's kind, so a thrown handaxe counts (DEBT C11); an Unarmed Strike is a melee attack made with the body.
export function fitsHit(withKind, atk) {
  if (!atk || atk.spell) return false;
  if (withKind === 'melee') return isUnarmed(atk) || (isWeapon(atk) ? CONTENT.weapons[atk.weapon]?.kind === 'melee' || atk.type === 'melee' : atk.type === 'melee');
  if (withKind === 'weapon') return !isUnarmed(atk) && (isWeapon(atk) || atk.type === 'melee' || atk.type === 'ranged');
  return false;
}

const spellOf = (id) => (typeof id === 'string' && Object.hasOwn(SPELLS, id) ? SPELLS[id] : null);

// The features of `e` that cast a spell of the hit kind without a slot, for one of their uses (Paladin's Smite): [{ feat, spell }].
export function freeHitCasts(e) {
  const out = [];
  for (const f of e.feats ?? []) for (const id of f.freeCast?.spells ?? []) if (spellOf(id)?.def.hit && !f.freeCast.cost) out.push({ feat: f, spell: SPELLS[id] });
  return out;
}

// Every spell `e` could cast after a hit: the ones it knows and the ones a feature of its casts.
export function hitSpellsOf(e) {
  const out = [], seen = new Set();
  for (const id of [...(e.spells ?? []), ...freeHitCasts(e).map((x) => x.spell.id)]) {
    const sp = spellOf(id);
    if (sp?.def.hit && !seen.has(id)) { seen.add(id); out.push(sp); }
  }
  return out;
}

// What a creature can choose at a hit: [{ id, name, kind, spell, options }] (the same shape as reactions.js, reactionsOf).
export const hitChoicesOf = (e) => hitSpellsOf(e).map((sp) => ({ id: sp.id, name: sp.name, kind: 'spell', spell: sp.id, options: HIT_OPTIONS }));

// The instruction for a choice: what was set, or the default (`ask` for a creature a player controls, else `never`).
export const hitInstruction = (s, e, c) => {
  const w = e.hitChoices?.[c.id];
  return HIT_OPTIONS.includes(w) ? w : ownerOf(s, e) ? 'ask' : 'never';
};

// Could any creature a player controls stop an action to ask at a hit? Read by `mayAsk` (reactions.js), so the engine takes a copy of the game
// before an action only when something could wait (docs/specs/on-hit.md, Decision 5; DEBT T55 gives the cost of a copy).
export const mayAskHit = (s) => Object.values(s.entities).some((e) => !e.dead && !e.object && hitSpellsOf(e).some((sp) => hitInstruction(s, e, { id: sp.id }) === 'ask') && ownerOf(s, e));

// Check a `hitChoices` action's settings against what the creature has. Returns an error text, or null.
export function checkHitChoices(e, set) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) return 'Say which choices to set: { choice: when }.';
  const keys = Object.keys(set);
  if (!keys.length || keys.length > 20) return 'Say which choices to set: { choice: when }.';
  const mine = hitChoicesOf(e);
  for (const k of keys) {
    const c = mine.find((x) => x.id === k);
    if (!c) return `${e.name} has nothing to choose after a hit called ${String(k).slice(0, 40)}.`;
    if (!c.options.includes(set[k])) return `${c.name} can be set to ${c.options.join(', ')}.`;
  }
  return null;
}
