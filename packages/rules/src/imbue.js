// A weapon changed by a spell or a feature for a while (docs/specs/on-hit.md, Decision 8, stage O4): Shillelagh, Magic Weapon, Sacred Weapon.
//
// The `imbue` step puts a part on a creature's lasting effect: { target, imbue: { weapon, name, abil?, die?, plus?, attackAdd?, types? } }, where
// `weapon` is the key of one of its weapon attack records (the record's id without `-two-handed` or `-thrown`). While the part lasts, every attack
// record of that weapon is read through `armed` (the `attack` action, an Opportunity Attack, a Retaliation, and the screens that show a weapon's
// numbers), so they all see the same weapon. Pure: this file reads the game and changes nothing, so the client may import it.
//
// derive.js bakes what this needs onto a weapon's records: `die` (the dice the record's damage rolls), `plus` (a magic item's bonus), `magic` (it is a
// magic item) and `trained` (its wielder is proficient). A record made before that has no `die`: it is not changed, and the DM is told when the effect
// is made (docs/specs/on-hit.md, question Q8), until its next remake.
import { CONTENT } from './content/index.js';

const mod = (n) => Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const dice = (d, n) => (n ? `${d}${signed(n)}` : d);
// The average of a die (or dice), to tell which of two is the bigger.
const average = (d) => { const m = /^(\d+)d(\d+)$/.exec(d); return m ? +m[1] * (+m[2] + 1) / 2 : /^\d+$/.test(d) ? +d : 0; };

// A weapon attack record is one derive.js made from a weapon: it names it (`weapon`). An Unarmed Strike and a spell attack name none.
export const isWeapon = (atk) => !!atk && typeof atk.weapon === 'string' && !atk.spell;
// The key a weapon's records share: `quarterstaff` for `quarterstaff`, `quarterstaff-two-handed` and `quarterstaff-thrown`.
export const weaponKey = (atk) => String(atk?.id ?? '').replace(/-(two-handed|thrown)$/, '');
// Was this record made with what `armed` needs (derive.js)?
export const baked = (atk) => typeof atk?.die === 'string';

// The lasting parts of this creature's weapons: [{ fx, p }].
export function imbuesOn(s, e) {
  const out = [];
  for (const fx of s?.effects ?? []) for (const p of fx.parts ?? []) if (p.imbue && !p.ended && p.target === e?.id) out.push({ fx, p });
  return out;
}

// The damage a record's dice roll, apart from the flat number added to them (the ability modifier and any magic bonus).
const flatOf = (atk) => {
  if (/^\d+$/.test(atk.die)) return Number(atk.damage) - Number(atk.die);
  const m = /([+-]\d+)$/.exec(atk.damage);
  return m ? Number(m[1]) : 0;
};
// What `spec.attackAdd` is for this creature: a number, or `{ mod, min }` (an ability modifier, at least `min`).
export const addOf = (e, x) => (typeof x === 'number' ? x : x && typeof x === 'object' && typeof x.mod === 'string' ? Math.max(x.min ?? -Infinity, mod(e?.abil?.[x.mod])) : 0);

// The record as it stands while this creature's imbued weapons are in force: a new record, or the same one when nothing changes it.
//   abil      the better of the record's own ability and the spell's replaces it in the attack and damage rolls (Shillelagh: "you can use");
//   die       the weapon's die becomes it, unless the record's own (a Monk's Martial Arts die) is bigger;
//   plus      added to the attack and damage rolls, and the weapon counts as magic (Magic Weapon);
//   attackAdd added to the attack rolls only (Sacred Weapon: Charisma, at least +1);
//   types     the record may deal one of these instead of its own: `alt`, from which the attack takes the type that hurts the target most.
export function armed(s, e, atk, skip = null) {
  if (!isWeapon(atk) || !baked(atk)) return atk;
  const key = weaponKey(atk), on = imbuesOn(s, e).filter((x) => !skip?.(x)).map((x) => x.p.imbue).filter((i) => i.weapon === key);
  if (!on.length) return atk;
  const was = mod(e.abil?.[atk.abil]);
  let now = was, die = atk.die, plus = 0, add = 0;
  const alt = [], names = [];
  for (const i of on) {
    if (i.abil && e.abil && mod(e.abil[i.abil]) > now) now = mod(e.abil[i.abil]);
    if (i.die && average(i.die) >= average(die)) die = i.die;
    plus += i.plus ?? 0;
    add += addOf(e, i.attackAdd);
    for (const t of i.types ?? []) if (t !== atk.dtype && !alt.includes(t)) alt.push(t);
    if (!names.includes(i.name)) names.push(i.name);
  }
  const flat = flatOf(atk) + (now - was) + plus;
  return {
    ...atk,
    bonus: atk.bonus + (now - was) + plus + add,
    damage: /^\d+$/.test(die) ? signed(+die + flat) : dice(die, flat),
    ...(alt.length ? { alt } : {}),
    ...(plus > 0 ? { magic: true } : {}),
    imbued: names,
  };
}

// The weapon attack records a spell or feature's `imbue` may be put on, one for each weapon (its first record, as derive.js makes them):
// those that fit its `weapons`, `melee` (a Melee weapon, whichever way it is used) and `nonmagical` (as it stands now). Each is [record, why-not or ''].
// `skip` leaves out the parts it says yes to: the caster's own earlier cast, which this one replaces, does not make the weapon magic.
export function weaponsFor(s, e, spec, skip = null) {
  const seen = new Set(), out = [];
  for (const a of e?.attacks ?? []) {
    if (!isWeapon(a)) continue;
    const key = weaponKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    const w = CONTENT.weapons[a.weapon], now = armed(s, e, a, skip);
    let why = '';
    if (spec.weapons && !spec.weapons.includes(a.weapon)) why = `not a ${spec.weapons.map((id) => CONTENT.weapons[id]?.name ?? id).join(' or ')}`;
    else if (spec.melee && w?.kind !== 'melee') why = 'not a Melee weapon';
    else if (spec.nonmagical && now.magic) why = 'already a magic weapon';
    out.push([a, why]);
  }
  return out;
}
// Of those, the ones that fit.
export const fitting = (s, e, spec) => weaponsFor(s, e, spec).filter(([, why]) => !why).map(([a]) => a);
