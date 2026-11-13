// Brings a saved game up to date. Safe to run on any state, any number of times.
//
// It renames content ids, which moved from camelCase to kebab-case when content became packs,
// and brings an older state up to the current version.
const SPELL_IDS = { fireBolt: 'fire-bolt', sacredFlame: 'sacred-flame', magicMissile: 'magic-missile',
  burningHands: 'burning-hands', cureWounds: 'cure-wounds', healingWord: 'healing-word' };
const MONSTER_IDS = { goblin: 'goblin-warrior' };

import { migrateMap } from './map.js';
import { MONSTERS, MONSTER_ACTIONS, PREGENS } from './content/index.js';
import { validPending } from './reactions.js';
import { leaveForm, validForm } from './forms.js';

export const VERSION = 18;

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
  // The table rule for how the picture is paced (docs/specs/renderer.md, Decision 3). Presentation
  // only, read by clients; no version of its own: a table saved before it waits for the picture.
  if (state.settings) state.settings.pace ??= 'wait';
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
  // Version 15: an action may wait for a player's answer about a reaction (`pending`, with the
  // count of questions asked so far, `asked`). A table saved before then has none. One that is not
  // whole is dropped, and the table simply is not waiting: the action it held never happened.
  if (state.pending !== undefined && !validPending(state.pending)) delete state.pending;
  if (state.asked !== undefined && !(Number.isInteger(state.asked) && state.asked >= 0)) delete state.asked;
  // Version 16: `rng` may be a keyed generator, { key, n } (rng.js). An integer seed is kept as it
  // is and rolls as it always did, so the game replays exactly; the rules cannot make a key, so the
  // table server gives a table a new one when it loads it (packages/server/src/tables.js).
  // Version 17: a creature may be in a form (Wild Shape; forms.js), `form` on it, held by a lasting
  // effect. A table saved before then has none. One that is not whole, or whose effect is gone,
  // is put back as far as it can be and dropped.
  for (const e of Object.values(state.entities)) {
    if (e.form === undefined) continue;
    if (!validForm(e.form)) { delete e.form; continue; }
    if (!(state.effects ?? []).some((fx) => fx.id === e.form.fx)) leaveForm(e);
  }
  // Version 18: a character may have several classes (derive.js, `classes` on its sheet and record),
  // with Hit Dice of several sizes (`hitDice` on the record, `hdBy` left of each). A table saved
  // before then has none; a creature with `hitDice` and no `hdBy` (or a broken one) gets one that
  // agrees with its `hd`, the largest dice counted as spent first.
  for (const e of Object.values(state.entities)) {
    if (!e.hitDice || typeof e.hitDice !== 'object') { delete e.hdBy; continue; }
    const sizes = Object.keys(e.hitDice).map(Number).sort((a, b) => b - a);
    const whole = e.hdBy && typeof e.hdBy === 'object' && sizes.every((d) => Number.isInteger(e.hdBy[d]) && e.hdBy[d] >= 0 && e.hdBy[d] <= e.hitDice[d]);
    if (whole && Object.values(e.hdBy).reduce((a, b) => a + b, 0) === e.hd) continue;
    let spent = Math.max(0, (e.level ?? 0) - (e.hd ?? e.level ?? 0));
    e.hdBy = {};
    for (const d of sizes) { const n = Math.min(spent, e.hitDice[d]); e.hdBy[d] = e.hitDice[d] - n; spent -= n; }
    e.hd = Object.values(e.hdBy).reduce((a, b) => a + b, 0);
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
