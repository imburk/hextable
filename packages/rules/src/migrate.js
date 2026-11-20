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
import { validFormation } from './engine/world.js';
import { SIZES } from './content/sizes.js';
import { copyPacks, packsProblem } from './content/packs.js';

export const VERSION = 27;

export function migrate(state) {
  if (!state || typeof state !== 'object' || !state.entities) return state;
  // The places parked in a world (version 26; docs/specs/travel.md, Decision 5) hold creatures, lasting effects and a map
  // of their own: every step below that brings creatures, effects or a map up to date is run on each of them as on the
  // place in play, from the same version (review of #580, M3). A record that is not whole is dropped, and the DM told in
  // the record (a `manual` for the DM alone): nothing of a place goes without the DM hearing of it.
  if (state.parked !== undefined) {
    const lost = [];
    if (!isRec(state.parked)) { if (state.parked !== null) lost.push('(the list of parked places)'); state.parked = {}; }
    for (const [k, r] of Object.entries(state.parked)) {
      if (!(isRec(r) && isRec(r.map) && isRec(r.entities) && Object.values(r.entities).every(isRec) && (r.effects === undefined || Array.isArray(r.effects)) && Number.isFinite(r.since))) { delete state.parked[k]; lost.push(k); continue; }
      const place = { version: state.version, entities: r.entities, effects: r.effects ?? [], encounter: null, map: r.map };
      migrate(place);
      Object.assign(r, { map: place.map, entities: place.entities, effects: place.effects });
    }
    if (lost.length && Array.isArray(state.timeline)) {
      state.timeline.push({ t: Number.isFinite(state.clock) ? state.clock : 0, type: 'manual', actor: null, name: 'Places', partial: true,
        text: `A saved place could not be read and was let go when this table was loaded: ${lost.join(', ')}. What was there (its map, creatures and lasting effects) is gone; the place is built again from the world pack next time.` });
    }
  }
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
  // Version 23: companions (docs/specs/companions.md, stage C1). A creature may carry `bond` (its master and
  // how it is kept); none before. Nothing changes: the version is raised so that an older server refuses a
  // table with companions rather than load it and drop what it does not know.
  // Riding (docs/specs/companions.md, Decision 8; stage C6a): `riding` on a rider, `rider` on its mount, a fight's
  // `budget.mount` and `rode`. No version of its own (all optional; absent means none, so a table saved before plays
  // as it did): see the C6a build notes for why the version is not raised. A pair that is not whole (one half
  // missing, or not naming the other, or riding in a ring) is dropped, both halves, so nothing reads half a ride.
  {
    const ents = state.entities, has = (id) => typeof id === 'string' && Object.hasOwn(ents, id);
    for (const e of Object.values(ents)) {
      const r = e.riding;
      const whole = r && typeof r === 'object' && !Array.isArray(r) && has(r.on) && r.on !== e.id && ents[r.on].rider === e.id && !ents[r.on].riding && e.rider === undefined && typeof r.controlled === 'boolean';
      if (r !== undefined && !whole) delete e.riding;
      else if (whole && (typeof r.size !== 'string' || !SIZES[r.size])) r.size = SIZES[ents[r.on].size] ? ents[r.on].size : 'medium';
    }
    for (const m of Object.values(ents)) if (m.rider !== undefined && !(has(m.rider) && ents[m.rider].riding?.on === m.id)) delete m.rider;
    const enc = state.encounter;
    if (enc && typeof enc === 'object') {
      const b = enc.budget?.mount;
      if (b !== undefined && !(b && typeof b === 'object' && Number.isFinite(b.move) && Number.isInteger(b.action))) delete enc.budget.mount;
      if (enc.rode !== undefined && !(enc.rode && typeof enc.rode === 'object' && !Array.isArray(enc.rode))) delete enc.rode;
    }
  }
  // Version 24: which homebrew packs the game needs (docs/specs/homebrew.md, Decision 3; `state.packs` is
  // `[{ id, version, hash }]`, never pack data). A table saved before then needs none. One that is not whole is
  // dropped, which is none, so nothing reads half a list; the server holds the packs and sets this list again.
  // A state already at version 24 with no `packs` at all (one made by `newGame`, which does not set it) is left as it is: reading code
  // takes an absent list as none, and a state that is migrated again stays byte for byte the same.
  if (!(state.version >= 24) || Object.hasOwn(state, 'packs')) state.packs = Array.isArray(state.packs) && packsProblem(state.packs) === null ? copyPacks(state.packs) : [];
  // Version 25: the ability scores a member has rolled, `{ [userId]: { sets: [{ dice, again? }] } }` (docs/specs/ability-scores.md); a table saved before has none.
  if (!(state.version >= 25) || state.scoreRolls === undefined) state.scoreRolls = state.scoreRolls && typeof state.scoreRolls === 'object' && !Array.isArray(state.scoreRolls) ? state.scoreRolls : {};
  // Version 26: places of a world (docs/specs/travel.md, Decisions 2, 5 and 11; row W2). `world` (the index of the world the
  // DM imported, or null), `place` (the node in play, or null), `parked` (the places left as they were) and `journey`
  // (W6). A table saved before then has none: `world: null, place: null, parked: {}, journey: null`, and plays as it did.
  // A state already at version 26 without them (one made by `newGame`, which does not set them) is left as it is, as for
  // `packs`: reading code takes an absent field as empty. One that is not whole is put back to empty, so nothing reads half
  // a place: a world that is not a record, a place that names no node of it, a parked record without its map and creatures.
  if (!(state.version >= 26)) Object.assign(state, { world: state.world ?? null, place: state.place ?? null, parked: state.parked ?? {}, journey: state.journey ?? null });
  if (state.world !== undefined && !(state.world === null || (isRec(state.world) && isRec(state.world.nodes)))) state.world = null;
  if (state.place !== undefined && !(state.place === null || (typeof state.place === 'string' && isRec(state.world?.nodes) && Object.hasOwn(state.world.nodes, state.place)))) state.place = null;
  // Version 27: the table rule `strikeFirst` (docs/specs/table-ui.md, E23 as amended by #585): 'off' (the SRD's way;
  // absent means off), 'casts' or 'all'. A table saved before then had a DM's hostile cast at the party land first while
  // `autoEngage` was on, and nothing else: it gets 'casts' (which still asks for `autoEngage` on, as before), or 'off'
  // where `autoEngage` was off, so it plays exactly as it did. An unset `autoEngage` counts as on, as the table's rules
  // are shown (settings.js). A state already at version 27 (one made by `newGame`, which does not set it) is left as it is.
  if (!(state.version >= 27) && state.settings && typeof state.settings === 'object') state.settings.strikeFirst = state.settings.autoEngage !== false ? 'casts' : 'off';
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

const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// A conclusion as rewards.js makes it, in every part a later action or view reads.
function validConclusion(c) {
  if (c === null) return true;
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  return obj(c) && Number.isInteger(c.fight) && typeof c.published === 'boolean' && Array.isArray(c.foes) && c.foes.every((f) => obj(f) && typeof f.id === 'string' && Number.isInteger(f.xp) && typeof f.counts === 'boolean')
    && Array.isArray(c.party) && c.party.every((id) => typeof id === 'string') && obj(c.xp) && Array.isArray(c.xp.bonus) && obj(c.xp.per) && Array.isArray(c.xp.fixed)
    && Array.isArray(c.loot) && c.loot.every((l) => obj(l) && typeof l.id === 'string' && typeof l.name === 'string' && Number.isInteger(l.qty)) && Number.isInteger(c.next);
}
