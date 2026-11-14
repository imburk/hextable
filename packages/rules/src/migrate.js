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
import { xpFor } from './rewards.js';
import { restamp } from './durations.js';
import { validFormation } from './engine.js';

export const VERSION = 22;

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
  // Version 19: Experience Points and the rewards of a fight (rewards.js). Each party character
  // without XP gets the total its level starts at; a table saved before then has no conclusion, and
  // one that is not whole is dropped. Two table rules: who reviews rewards, and how XP is shared.
  for (const e of Object.values(state.entities)) if (e.kind === 'pc' && !(Number.isInteger(e.xp) && e.xp >= 0)) e.xp = xpFor(e.level ?? 1);
  if (state.conclusion === undefined || !validConclusion(state.conclusion)) state.conclusion = null;
  if (state.settings) { state.settings.conclusion ??= 'dm'; state.settings.xpShare ??= 'split'; }
  // Version 20: a built character's sheet may hold magic items (`items`) and the one it will attune to at its next
  // Short Rest (`attuning`; derive.js). A table saved before then has none, so its characters play as they did. An
  // `attuning` that names no item on the sheet is dropped.
  for (const e of Object.values(state.entities)) {
    const sh = e.sheet;
    if (!sh || typeof sh !== 'object' || sh.attuning === undefined) continue;
    if (!(Array.isArray(sh.items) && sh.items.some((x) => x?.id === sh.attuning?.item))) delete sh.attuning;
  }
  // Version 21: map format 2 (docs/specs/square-grid.md, Decisions 3 and 4). The map says its grid:
  // `migrateMap` above (run on every load since version 3) gives a format 1 map `grid: 'hex'` and
  // renames `hexFeet` to `cellFeet`. Nothing else changes: every position, key, region, arena and
  // area is a hex one already, and plays as it did.
  // Version 22: a turn is named by its fight, its round and whose turn it is, no longer by its place in the
  // order (durations.js, turnKey; stepping away, #300). The stamps of the fight going on (when a lasting
  // effect's part was made, when a zone last worked on each creature) are named by the creature at that
  // place in the order as it stands. Stamps of other fights are never compared again and are left.
  for (const fx of Array.isArray(state.effects) ? state.effects : []) {
    for (const p of Array.isArray(fx?.parts) ? fx.parts : []) if (p && p.born !== undefined) p.born = restamp(state.encounter, p.born);
    if (fx?.zone?.last && typeof fx.zone.last === 'object') for (const k of Object.keys(fx.zone.last)) fx.zone.last[k] = restamp(state.encounter, fx.zone.last[k]);
  }
  // A leader's formation (#303), `formation` on a party member: no version of its own, as a table
  // saved before then has none, and a leader without one walks its followers as the column, as
  // they always walked. One that is not whole is dropped, which is the column again.
  for (const e of Object.values(state.entities)) if (e.formation !== undefined && !validFormation(e.formation)) delete e.formation;
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

// A conclusion as rewards.js makes it, in every part a later action or view reads.
function validConclusion(c) {
  if (c === null) return true;
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  return obj(c) && Number.isInteger(c.fight) && typeof c.published === 'boolean' && Array.isArray(c.foes) && c.foes.every((f) => obj(f) && typeof f.id === 'string' && Number.isInteger(f.xp) && typeof f.counts === 'boolean')
    && Array.isArray(c.party) && c.party.every((id) => typeof id === 'string') && obj(c.xp) && Array.isArray(c.xp.bonus) && obj(c.xp.per) && Array.isArray(c.xp.fixed)
    && Array.isArray(c.loot) && c.loot.every((l) => obj(l) && typeof l.id === 'string' && typeof l.name === 'string' && Number.isInteger(l.qty)) && Number.isInteger(c.next);
}
