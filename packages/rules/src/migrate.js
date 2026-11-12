// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// It renames content ids, which moved from camelCase to kebab-case when content became packs,
// and brings an older state up to the current version.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

import { migrateMap } from './map.js';
import { MONSTERS, PREGENS } from './content/index.js';

export const VERSION = 6;

export function migrate(state) {
  if (!state || typeof state !== 'object' || !state.entities) return state;
  // Version 2: a condition is a record ({ source, level, ... }), no longer just `true`.
  for (const e of Object.values(state.entities)) {
    for (const [id, v] of Object.entries(e.cond ?? {})) { if (v === true) e.cond[id] = {}; else if (!v) delete e.cond[id]; }
  }
  // Version 3: the map is a document with levels, and every position carries a height.
  if (state.map) state.map = migrateMap(state.map);
  for (const e of Object.values(state.entities)) if (e.pos && e.pos.z === undefined) e.pos.z = 0;
  // Version 4: creatures have skills and tools, and there is a table rule for noticing things in passing.
  for (const e of Object.values(state.entities)) {
    const from = e.skills === undefined && e.kind === 'pc' ? PREGENS[e.id] : null;      // a pregenerated character gets the skills it was given
    e.skills ??= [...(from?.skills ?? [])]; e.expertise ??= [...(from?.expertise ?? [])]; e.tools ??= [...(from?.tools ?? [])]; e.skillBonus ??= {};
  }
  if (state.settings) state.settings.passiveFind ??= 'off';
  // Version 5: ways of moving other than walking, and table rules for height.
  for (const e of Object.values(state.entities)) e.speeds ??= {};
  if (state.settings) { state.settings.vertical ??= 'max'; state.settings.climbing ??= 'on'; }
  // Version 6: creatures have a size.
  for (const e of Object.values(state.entities)) e.size ??= MONSTERS[e.tpl]?.size ?? 'medium';
  if (!(state.version >= VERSION)) state.version = VERSION;
  for (const e of Object.values(state.entities)) {
    if (Array.isArray(e.spells)) e.spells = e.spells.map((id) => SPELL_IDS[id] ?? id);
    if (MONSTER_IDS[e.tpl]) e.tpl = MONSTER_IDS[e.tpl];
  }
  for (const entry of state.timeline ?? []) if (SPELL_IDS[entry.spell]) entry.spell = SPELL_IDS[entry.spell];
  return state;
}
