// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// It renames content ids, which moved from camelCase to kebab-case when content became packs,
// and brings an older state up to the current version.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

import { migrateMap } from './map.js';
import { MONSTERS, MONSTER_ACTIONS, PREGENS } from './content/index.js';

export const VERSION = 14;

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
  // Version 7: table rules for cover.
  if (state.settings) { state.settings.cover ??= 'on'; state.settings.creatureCover ??= 'on'; }
  // Version 6: creatures have a size.
  for (const e of Object.values(state.entities)) e.size ??= MONSTERS[e.tpl]?.size ?? 'medium';
  // Version 8: creatures have senses (darkvision and the like), taken from their template if they have one.
  for (const e of Object.values(state.entities)) e.senses ??= structuredClone(MONSTERS[e.tpl]?.senses ?? {});
  // Version 9: a table rule for how close the party comes to an enemy before a fight starts.
  if (state.settings) state.settings.engageRange ??= 10;
  // The table rule for what players are sent by sight (no version of its own: 'rooms' is how it always was).
  if (state.settings) state.settings.sight ??= 'rooms';
  // And for what players are told when a creature they cannot see takes its turn (view.js).
  if (state.settings) state.settings.unseenTurns ??= 'say';
  // Version 12: the table rule for who throws the dice (docs/specs/dice.md).
  if (state.settings) state.settings.diceThrow ??= 'auto';
  // Handouts (no version of their own: a state without them simply has none yet).
  if (!Array.isArray(state.handouts)) state.handouts = [];
  // Version 13: scenes (scenes.js). A table saved before them has none, open or prepared.
  if (state.scene === undefined) state.scene = null;
  // Version 14: standing instructions for reactions (reactions.js), `reactions` on a creature,
  // { [reaction id]: when }. A table saved before them has none, which means every default; one
  // that is not a record of words is dropped.
  for (const e of Object.values(state.entities)) {
    if (e.reactions === undefined) continue;
    if (!e.reactions || typeof e.reactions !== 'object' || Array.isArray(e.reactions) || !Object.values(e.reactions).every((w) => typeof w === 'string')) delete e.reactions;
  }
  if (!(state.version >= VERSION)) state.version = VERSION;
  for (const e of Object.values(state.entities)) {
    if (Array.isArray(e.spells)) e.spells = e.spells.map((id) => SPELL_IDS[id] ?? id);
    if (MONSTER_IDS[e.tpl]) e.tpl = MONSTER_IDS[e.tpl];
  }
  for (const entry of state.timeline ?? []) if (SPELL_IDS[entry.spell]) entry.spell = SPELL_IDS[entry.spell];
  // Version 10: a creature made from a pack monster plays from its actions (Multiattack, breath
  // weapons, saves), carried on the creature. One saved before then takes them from its template.
  for (const e of Object.values(state.entities)) if (!e.actions && MONSTER_ACTIONS[e.tpl]) e.actions = structuredClone(MONSTER_ACTIONS[e.tpl]);
  // Also version 10: condition immunities, from the template.
  for (const e of Object.values(state.entities)) if (!e.conditionImmune && MONSTERS[e.tpl]?.conditionImmune) e.conditionImmune = [...MONSTERS[e.tpl].conditionImmune];
  // Version 11: a monster's saving throw bonuses, from the template.
  for (const e of Object.values(state.entities)) e.saveBonus ??= structuredClone(MONSTERS[e.tpl]?.saveBonus ?? {});
  // Also version 11: a monster's Initiative modifier, from the template (only where the SRD gives one).
  for (const e of Object.values(state.entities)) if (e.initBonus === undefined && MONSTERS[e.tpl]?.initBonus !== undefined) e.initBonus = MONSTERS[e.tpl].initBonus;
  return state;
}
