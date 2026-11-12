// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// It renames content ids, which moved from camelCase to kebab-case when content became packs,
// and brings an older state up to the current version.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

import { migrateMap } from './map.js';

export const VERSION = 3;

export function migrate(state) {
  if (!state || typeof state !== 'object' || !state.entities) return state;
  // Version 2: a condition is a record ({ source, level, ... }), no longer just `true`.
  for (const e of Object.values(state.entities)) {
    for (const [id, v] of Object.entries(e.cond ?? {})) { if (v === true) e.cond[id] = {}; else if (!v) delete e.cond[id]; }
  }
  // Version 3: the map is a document with levels, and every position carries a height.
  if (state.map) state.map = migrateMap(state.map);
  for (const e of Object.values(state.entities)) if (e.pos && e.pos.z === undefined) e.pos.z = 0;
  if (!(state.version >= VERSION)) state.version = VERSION;
  for (const e of Object.values(state.entities)) {
    if (Array.isArray(e.spells)) e.spells = e.spells.map((id) => SPELL_IDS[id] ?? id);
    if (MONSTER_IDS[e.tpl]) e.tpl = MONSTER_IDS[e.tpl];
  }
  for (const entry of state.timeline ?? []) if (SPELL_IDS[entry.spell]) entry.spell = SPELL_IDS[entry.spell];
  return state;
}
