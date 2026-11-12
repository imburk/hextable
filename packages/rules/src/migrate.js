// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// It renames content ids, which moved from camelCase to kebab-case when content became packs,
// and brings a version 1 state to version 2.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

export const VERSION = 2;

export function migrate(state) {
  if (!state || typeof state !== 'object' || !state.entities) return state;
  // Version 2: a condition is a record ({ source, level, ... }), no longer just `true`.
  for (const e of Object.values(state.entities)) {
    for (const [id, v] of Object.entries(e.cond ?? {})) { if (v === true) e.cond[id] = {}; else if (!v) delete e.cond[id]; }
  }
  if (!(state.version >= VERSION)) state.version = VERSION;
  for (const e of Object.values(state.entities)) {
    if (Array.isArray(e.spells)) e.spells = e.spells.map((id) => SPELL_IDS[id] ?? id);
    if (MONSTER_IDS[e.tpl]) e.tpl = MONSTER_IDS[e.tpl];
  }
  for (const entry of state.timeline ?? []) if (SPELL_IDS[entry.spell]) entry.spell = SPELL_IDS[entry.spell];
  return state;
}
