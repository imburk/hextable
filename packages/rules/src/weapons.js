// Weapon properties the engine holds an attack to (issue #435): one place that says "may this creature make this attack now, and if
// not, why", shared by the `attack` handler (engine/attacks.js), the Opportunity Attack and Retaliation (reactions.js) and the
// monster AI (ai.js), so they cannot disagree. Only an attack that names its weapon (`atk.weapon`, a built character's) has
// properties: a monster's stat-block attack is the creature's own and is held to none.
import { CONTENT } from './content/index.js';

const weaponOf = (atk) => (typeof atk?.weapon === 'string' ? CONTENT.weapons[atk.weapon] ?? null : null);
export const isLoading = (atk) => !!weaponOf(atk)?.properties?.includes('loading');

// Is this creature riding? With the game state, the pair must be whole (as shared.js mountOf says); without it (a list of a
// creature's reactions), a rider's own record is taken at its word.
const riding = (s, e) => {
  if (!e.riding?.on) return false;
  if (!s) return true;
  const m = Object.hasOwn(s.entities ?? {}, e.riding.on) ? s.entities[e.riding.on] : null;
  return !!m && m.rider === e.id;
};

// Two-Handed (SRD "Weapons", Properties): "A Two-Handed weapon requires two hands when you attack with it." The sheet records a
// Shield (`shield`) and not what each hand holds, so only a Shield is checked; another weapon in hand is the DM's. A Lance
// (`twoHandedUnlessMounted`) is one-handed while its wielder rides. Returns the reason, or ''.
export function handsFull(s, e, atk) {
  const w = weaponOf(atk);
  if (!w?.properties?.includes('two-handed') || !e.shield) return '';
  if (w.twoHandedUnlessMounted && riding(s, e)) return '';
  return `${atk.name} is a Two-Handed weapon and needs both hands, and ${e.name} carries a Shield, which only the DM can change in a fight (out of a fight ${e.name} can unequip it).`;
}

// Loading (SRD "Weapons", Properties): "You can fire only one piece of ammunition from a Loading weapon when you use an action,
// a Bonus Action, or a Reaction to fire it, regardless of the number of attacks you can normally make." `budget.loaded` lists
// the Loading attacks fired in this turn's action (`action:<id>`) and Bonus Action (`bonus:<id>`); a new action clears its own.
// A Reaction is one a round, so it needs nothing. When the Attack action's other attacks are left but another action is
// available (Action Surge), a Loading weapon already fired may be fired in that new action: `freshAction` says so.
export const freshAction = (b) => b?.action > 0 && b.attacks?.length === 1 && b.attacks[0].length === 1 && b.attacks[0][0].action === null;
const loadedAgain = (b, atk, pooled) => isLoading(atk) && !!b?.loaded?.includes(`${atk.time === 'bonus' ? 'bonus' : 'action'}:${atk.id}`) && (atk.time === 'bonus' || (pooled && !freshAction(b)));

// Why `e` may not make `atk` now, or ''. `pooled`: it would be one of the attacks an Attack action or Multiattack left (fromPool).
export function attackRefusal(s, e, atk, pooled = false) {
  const hands = handsFull(s, e, atk);
  if (hands) return hands;
  if (loadedAgain(s.encounter?.budget, atk, pooled)) return `${atk.name} is a Loading weapon: it fires one piece of ammunition each time ${e.name} uses ${atk.time === 'bonus' ? 'a Bonus Action' : 'an action'}, however many attacks ${e.name} can make. Attack with something else, or end the turn.`;
  return '';
}

// Heavy (SRD "Weapons", Properties): "You have Disadvantage on attack rolls with a Heavy weapon if it's a Melee weapon and your
// Strength score isn't at least 13 or if it's a Ranged weapon and your Dexterity score isn't at least 13." It goes by the weapon's
// own kind, not by how it is used (a thrown Melee weapon is still a Melee weapon). Only an attack that names its weapon (`atk.weapon`,
// a built character's) has one: a monster's stat-block attack is the creature's own and names none. Returns the reason, or ''.
export function heavyWeak(e, atk) {
  const w = weaponOf(atk);
  if (!w?.properties?.includes('heavy')) return '';
  const abil = w.kind === 'ranged' ? 'dex' : 'str', score = e.abil?.[abil];
  return Number.isFinite(score) && score < 13 ? `Heavy weapon, ${abil === 'str' ? 'Strength' : 'Dexterity'} ${score}` : '';
}

// The Unarmed Strike every built character has (derive.js) is only a last resort: with any allowed weapon attack the choice is
// exactly what it was without it. A Monk, or a sheet that lists it, had it before: that one is a weapon attack.
export const spareStrike = (e, a) => a.id === 'unarmed-strike' && !e.sheet?.weapons?.includes('unarmed-strike') && !e.attacks?.some((x) => x.id === 'unarmed-strike-bonus');

// Among attacks a creature may make (in its own order), the one it takes: the first, unless that swings a Heavy weapon with
// Disadvantage and another allowed weapon attack does not, then the first of those. The spare Unarmed Strike is not another weapon
// to prefer: a character with only a Heavy weapon still swings it. Returns the first when none is better, undefined for none.
export const steadiest = (e, list) => list.find((a) => !heavyWeak(e, a) && !spareStrike(e, a)) ?? list[0];
