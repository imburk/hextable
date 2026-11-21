// Casting a levelled spell with a higher slot (issue #604): which slots may pay for it, which is the default, and what each one adds.
// Preview only. The engine checks `cast.slot` (engine/casting.js) and scales the spell (scaleSteps, targetCount); this module only reads
// the same data to say it in words, with the same helpers, so what the menu promises is what the engine does.
import { targetCount } from './shared/effects.js';
import { slotLevels, higherText } from './classes.js';

// The slot levels that may pay for the spell, lowest first (the creature's `slots`, a Warlock's being Pact Magic's: one level). A cantrip needs none.
export const slotChoices = (e, sp) => (sp && sp.level > 0 ? slotLevels(e, sp.level) : []);
// The level cast at when nothing was chosen: the lowest slot left that is at least the spell's level (null: none left, and the engine says so).
export const defaultSlot = (e, sp) => slotChoices(e, sp)[0] ?? null;
// The slot to send: the chosen one if it may still pay, else the default.
export const slotFor = (e, sp, chosen) => (slotChoices(e, sp).includes(chosen) ? chosen : defaultSlot(e, sp));
// What a creature or a dart is called when a higher slot adds one.
const NOUN = { 'magic-missile': 'dart', 'scorching-ray': 'ray' };
// The damage type of the first step that deals damage: the words say '+1d6 fire', not '+1d6 damage'.
function damageType(steps) {
  let found = null;
  const walk = (x) => {
    if (found || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if ('damage' in x && typeof x.type === 'string') { found = x.type; return; }
    Object.values(x).forEach(walk);
  };
  walk(steps);
  return found;
}
// What casting at `level` adds to the spell's own level, in words ('' when it adds nothing the data says).
export function addsText(sp, e, level) {
  const k = level - sp.level, by = sp.def.higher?.slot;
  if (!(k > 0) || !by) return '';
  const { targets, ...rest } = by;
  const parts = [];
  const grown = higherText(rest, k);
  const type = damageType(sp.def.effects);
  if (grown) parts.push(type ? grown.replace(/(\+\d+(?:d\d+)?) damage\b(?! roll)/, `$1 ${type}`) : grown);
  if (targets) {
    const n = targetCount(sp.def, e.level, level) - targetCount(sp.def, e.level, sp.level), noun = NOUN[sp.id] ?? (sp.repeat ? 'ray' : 'target');
    parts.push(`+${n} ${noun}${n === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}
// The menu: one row for each level that may pay, or null when there is nothing to choose (one level, or none, or no level adds anything).
// { levels: [{ level, left, adds, label }], def } with `def` the default level.
export function slotMenu(e, sp) {
  const levels = slotChoices(e, sp);
  if (levels.length < 2) return null;
  const rows = levels.map((level) => {
    const adds = addsText(sp, e, level);
    return { level, left: e.slots[level], adds, label: `Level ${level} (${e.slots[level]} left)${adds ? ` · ${adds}` : ''}` };
  });
  if (!rows.some((r) => r.adds)) return null;
  return { levels: rows, def: levels[0] };
}
