// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// So far it only renames content ids, which moved from camelCase to kebab-case when content
// became packs. The move to state version 2 (task R3 of the rules expansion spec) extends it.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

export function migrate(state) {
  if (!state || typeof state !== 'object' || !state.entities) return state;
  for (const e of Object.values(state.entities)) {
    if (Array.isArray(e.spells)) e.spells = e.spells.map((id) => SPELL_IDS[id] ?? id);
    if (MONSTER_IDS[e.tpl]) e.tpl = MONSTER_IDS[e.tpl];
  }
  for (const entry of state.timeline ?? []) if (SPELL_IDS[entry.spell]) entry.spell = SPELL_IDS[entry.spell];
  return state;
}
