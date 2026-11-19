// Making creatures from templates and character sheets, and remaking one when its sheet changes
// (engine.js).
import { CONTENT, MONSTER_ACTIONS, SPELLS } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { gridOf } from '../grid.js';
import { ground, overlapAt } from '../space.js';
import { xpFor } from '../rewards.js';
import { barriers } from '../walls.js';
import { classesOf, derive, missingOf, validate } from '../derive.js';
import { fail, featOf, living, RuleError } from './shared.js';
import { fitsOn } from './world.js';
import { effectsOf, endEffect } from '../durations.js';

// A creature now in Heavy armor (its sheet or record changed) ends what it can't keep up in it: a
// feature's lasting effect whose action is `unless: 'heavy'` (Rage: "it ends early if you don Heavy armor").
export function donned(s, e, ev) {
  if (e.armour !== 'heavy') return;
  for (const fx of [...effectsOf(s)]) if (fx.source === e.id && fx.feature && featOf(e, fx.feature)?.action?.unless === 'heavy') endEffect(s, ev, fx, `${e.name} donned Heavy armor`);
}

export function makeEntity(tpl, over = {}) {
  const t = structuredClone(tpl);
  // A creature made from a pack monster carries its own copy of the monster's actions.
  if (!t.actions && over.tpl && MONSTER_ACTIONS[over.tpl]) t.actions = structuredClone(MONSTER_ACTIONS[over.tpl]);
  if (over.pos && over.pos.z === undefined) over = { ...over, pos: { ...over.pos, z: 0 } };
  return {
    kind: 'npc', side: 'foe', owner: null, level: 0, size: 'medium', speeds: {}, senses: {}, saveProf: [], saveBonus: {}, skills: [], expertise: [], tools: [], skillBonus: {}, features: {}, attacks: [], spells: [],
    slots: {}, resist: [], vuln: [], immune: [], gear: [], ...t,
    maxHp: t.hp, slotsMax: { ...(t.slots || {}) }, uses: { secondWind: t.features?.secondWind || 0, ...featureUses(t) },
    ...(t.hitDie ? { hd: t.level } : {}),
    ...(t.hitDice ? { hdBy: { ...t.hitDice } } : {}),                 // Hit Dice of several sizes, left of each (several classes)
    cond: {}, death: { s: 0, f: 0 }, dead: false, reactionUsed: false, ...over,
    // A party character's Experience Points: the total its level starts at, unless it has its own.
    ...((over.kind ?? t.kind) === 'pc' ? { xp: Number.isInteger(over.xp ?? t.xp) ? (over.xp ?? t.xp) : xpFor(over.level ?? t.level ?? 1) } : {}),
  };
}
// A built character's features with uses (Rage, Second Wind, Channel Divinity) start full. Kept in
// `uses` by feature id, beside the hand-typed record's `secondWind`.
const featureUses = (t) => Object.fromEntries((t.feats ?? []).filter((f) => f.uses).map((f) => [f.id, f.uses.max]));

// Make a character again from a new record, carrying over what play has done to it. Validates
// everything before it changes anything.
// A built character's sheet changed by an item (given, worn, attuned): checked whole, then the character is made
// again from it. Refused, nothing changes.
// A problem the sheet already had before the change (a choice a later version of the rules added: Fiendish
// Resilience on a warlock saved before #232) does not stop a change that has nothing to do with it.
export const newProblems = (before, sheet) => { const had = new Set(before ? validate(before) : []); return validate(sheet).filter((p) => !had.has(p)); };
export function resheet(s, e, sheet, ev) {
  const problems = newProblems(e.sheet, sheet);
  problems.length === 0 || fail(`That can't be done. ${problems[0]}`);
  remake(s, e, derive(sheet).record, sheet, ev);
}
// A character made again from the sheet it already has (`refresh`): the sheet is checked whole, and a problem it has is named.
// Unlike `resheet`, a problem the sheet had all along is not let through: the point is a sheet that plays as it is now.
export function refreshOne(s, e, ev) {
  e.kind === 'pc' || fail(`${e.name} is not a character.`);
  e.sheet || fail(`${e.name} was typed in by hand and has no sheet to refresh from.`);
  !e.form || fail(`${e.name} is in the form of a ${e.form.name}. Leave the form first.`);
  // A stored sheet is old data and may be malformed in ways `validate` does not expect: any throw is a problem with the sheet.
  let sheet, problems, record;
  try { sheet = structuredClone(e.sheet); problems = validate(sheet); if (problems.length === 0) record = derive(sheet).record; }
  catch (err) { fail(`Its sheet could not be read: ${err instanceof Error ? err.message : String(err)}`); }
  problems.length === 0 || fail(`${e.name}'s sheet can't be played as it is. ${problems[0]}`);
  remake(s, e, record, sheet, ev);
}
// Magic items of the pack onto a built character's sheet, carried and not worn, each with the next free key ("i3").
// Returns the sheet entries. Refused (a variant missing, too many items), nothing changes.
export function landItem(s, e, specs, ev) {
  const sheet = structuredClone(e.sheet), list = sheet.items ?? [], used = new Set(list.map((x) => x.id)), out = [];
  let n = 1;
  for (const spec of specs) {
    while (used.has(`i${n}`)) n++;
    const x = { id: `i${n}`, ...spec };
    used.add(x.id); list.push(x); out.push(x);
  }
  sheet.items = list;
  resheet(s, e, sheet, ev);
  return out;
}
// For loot (rewards.js): the items land on the sheet, or, if the sheet cannot take them, nothing changes and null is returned.
export function tryLand(s, e, specs, ev) {
  if (!e.sheet) return null;
  try { return landItem(s, e, specs, ev); } catch (err) { if (err instanceof RuleError) return null; throw err; }
}
// A Speed the DM sets (`setSpeed`), written onto a creature: the one rule, used when the DM sets it and again when a
// creature is remade from its sheet (docs/specs/rules-expansion.md; DEBT T65). A way of moving at 0 is taken away.
export const WAYS = ['walk', 'climb', 'swim', 'fly', 'burrow'];
export function putSpeed(e, mode, feet, hover) {
  if (mode === 'walk') e.speed = feet; else if (feet) e.speeds[mode] = feet; else delete e.speeds[mode];
  if (mode === 'fly') { if (hover && feet) e.hover = true; else delete e.hover; }
}
// Record what the DM set in `e.speedSet` ({ walk?, climb?, swim?, fly?, burrow?: feet (0: taken away), hover?: true }), one
// key per way of moving. Set back to exactly what its sheet gives, the key goes; an empty record is deleted. A creature with
// no sheet keeps the record as set. Called after `putSpeed`; nothing is inferred from anything but the sheet's own numbers.
// A stored record kept to what a record may hold: the five ways with feet a multiple of 5 from 0 to 300, and `hover: true`.
// Anything else (not a plain object, bad entries) is dropped.
const cleanSpeedSet = (rec) => {
  const out = {};
  if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
    for (const m of WAYS) if (Number.isInteger(rec[m]) && rec[m] >= 0 && rec[m] <= 300 && rec[m] % 5 === 0) out[m] = rec[m];
    if (rec.hover === true) out.hover = true;
  }
  return out;
};
export function noteSpeed(e, mode, feet, hover) {
  let base = null;
  if (e.sheet) { try { base = derive(e.sheet).record; } catch { base = null; } }      // no baseline (a sheet that will not derive): the grant is kept
  const rec = cleanSpeedSet(e.speedSet);
  const sheetFeet = base ? (mode === 'walk' ? base.speed : base.speeds?.[mode] ?? 0) : null;
  if (feet === sheetFeet) delete rec[mode]; else rec[mode] = feet;
  if (mode === 'fly') { if (hover && feet) rec.hover = true; else delete rec.hover; }
  if (Object.keys(rec).length) e.speedSet = rec; else delete e.speedSet;
}
// The record laid again over a creature just made from its sheet. Only well-formed entries are applied and kept.
function regrant(fresh, rec) {
  const out = cleanSpeedSet(rec);
  for (const m of WAYS) if (out[m] !== undefined) putSpeed(fresh, m, out[m], out.hover === true);
  if (out.hover && fresh.speeds.fly) fresh.hover = true;
  if (Object.keys(out).length) fresh.speedSet = out;
}
// For `editCharacter`: the part of a creature's `speedSet` still wanted by the record typed in. A creature typed in by hand keeps no
// record of what it was made with, so what it has now (its record and the grant together) stands for it.
function untouchedGrants(e, record) {
  const rec = cleanSpeedSet(e.speedSet), out = {};
  const now = (x, m) => (m === 'walk' ? x.speed : x.speeds?.[m]) ?? 0;
  for (const m of WAYS) if (rec[m] !== undefined && now(record, m) === now(e, m)) out[m] = rec[m];
  if (rec.hover && out.fly !== undefined) out.hover = true;
  return out;
}
// The play state of a creature that its sheet or record does not hold, carried from the creature `e` onto `fresh`, the same
// creature made again (DEBT C17). ONE list, for every remake: `remake` below (a sheet changed, a level, a rest, `refresh`)
// and `editCharacter` (a record typed in). A new kind of play state is added here and nowhere else.
// `sheet` is the new sheet, or undefined for a hand-typed record (it has no sheet, and its own gear stands).
// The spent uses of the features of a homebrew subclass whose pack is not loaded (homebrew-subclasses.md, Decision 4). Such a feature is not on the
// record, so its count waits on the creature: `usesAway: { <subclass id>: { <feature id>: spent } }`, written only while that subclass is missing.
// When it is loaded again, the features of that same subclass come back with `max - spent` uses (not below 0) and the entry is deleted. A Long
// Rest clears `usesAway` (rests.js): the uses would have recharged. A feature is the missing subclass's when its id and the subclass id share the
// longest pack prefix ("hb-<pack>-"), so a feature of another subclass, even of a pack whose id begins with this one's, is not touched.
const sharedPrefix = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; const cut = a.slice(0, n).lastIndexOf('-'); return cut >= 0 ? a.slice(0, cut + 1) : ''; };
function keepAway(e, fresh, sheet) {
  if (!sheet) return;
  const gone = missingOf(sheet).map((m) => m.id), had = e.usesAway ?? {}, out = {};
  for (const id of gone) if (had[id]) out[id] = { ...had[id] };
  // What the old record had that the new one lacks (its pack just went away): the spent count of each, to the missing subclass whose id shares most of its prefix.
  const now = new Set((fresh.feats ?? []).map((f) => f.id));
  for (const f of e.feats ?? []) {
    if (!f.uses || !f.id.startsWith('hb-') || now.has(f.id)) continue;
    const best = gone.map((id) => [id, sharedPrefix(id, f.id).length]).filter(([, n]) => n >= 5);
    const top = Math.max(0, ...best.map(([, n]) => n));
    for (const [id, n] of best) if (n === top) (out[id] ??= {})[f.id] = Math.max(0, f.uses.max - Math.max(0, e.uses?.[f.id] ?? 0));
  }
  // A subclass that is loaded again, and still the sheet's: the features of that same subclass take back what was spent. An entry for a subclass the
  // sheet no longer names (or that is not loaded and not missing) is dropped, and a feature of another subclass is never touched, whatever its id.
  for (const [id, spent] of Object.entries(had)) {
    if (gone.includes(id) || !classesOf(sheet).some((k) => k.subclass === id) || !Object.hasOwn(CONTENT.subclasses, id)) continue;
    const own = new Set(CONTENT.subclasses[id].features.flatMap((f) => [f.id, ...(f.options ?? []).map((o) => `${f.id}-${o.id}`)]));
    for (const f of fresh.feats ?? []) if (f.uses && own.has(f.id) && Object.hasOwn(spent, f.id)) fresh.uses[f.id] = Math.max(0, f.uses.max - spent[f.id]);
  }
  if (Object.keys(out).length) fresh.usesAway = out;
}
export function carryPlay(e, fresh, record, sheet) {
  // A creature at 0 Hit Points, or dead, stays at 0 (and `dead` is carried below): a new maximum does not stand it up. One above 0 keeps
  // its damage, and at least 1.
  const lost = e.maxHp - e.hp;
  fresh.hp = e.hp > 0 && !e.dead ? Math.max(1, fresh.maxHp - lost) : 0;
  // `riding` and `rider` (companions.md, Decision 8): a creature remade on its mount (or under its rider) rides on (DEBT W13).
  for (const k of ['cond', 'death', 'dead', 'reactionUsed', 'reactions', 'tempHp', 'tempFx', 'follow', 'march', 'light', 'hiding', 'hidden', 'look', 'riding', 'rider', 'stealthNoted', 'away', 'vanished']) if (e[k] !== undefined && (k !== 'look' || !record.look)) fresh[k] = e[k];
  for (const [l, n] of Object.entries(fresh.slots)) fresh.slots[l] = Math.min(n, Math.max(0, n - ((e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0))));      // slots spent stay spent
  for (const f of fresh.feats ?? []) {                                    // so do uses of features
    const was = featOf(e, f.id);
    if (f.uses && was?.uses) fresh.uses[f.id] = Math.max(0, f.uses.max - Math.max(0, was.uses.max - (e.uses[f.id] ?? 0)));
    if (f.relentless && e.uses?.[f.id] !== undefined) fresh.uses[f.id] = e.uses[f.id];      // Relentless Rage's uses since the last rest
    if (f.overchannel && e.uses?.[f.id] !== undefined) fresh.uses[f.id] = e.uses[f.id];     // Overchannel's uses since the last Long Rest
  }
  keepAway(e, fresh, sheet);
  if (fresh.hitDie && e.hd !== undefined) fresh.hd = Math.max(0, fresh.level - Math.max(0, (e.level ?? 0) - e.hd));
  // Hit Dice of several sizes: what was spent of each size stays spent.
  if (fresh.hdBy && e.hd !== undefined) {
    const had = e.hitDice ?? (e.hitDie ? { [e.hitDie]: e.level } : {}), left = e.hdBy ?? (e.hitDie ? { [e.hitDie]: e.hd } : {});
    for (const d of Object.keys(fresh.hdBy)) fresh.hdBy[d] = Math.max(0, fresh.hitDice[d] - Math.max(0, (had[d] ?? 0) - (left[d] ?? 0)));
    fresh.hd = Object.values(fresh.hdBy).reduce((a, b) => a + b, 0);
  }
  // XP earned is kept; a level given by hand starts at least at its threshold. A record typed in with a LOWER level than the
  // creature had is the DM's word: its XP is the record's own.
  if (sheet !== undefined || (record.level ?? 0) >= (e.level ?? 0)) fresh.xp = Math.max(e.xp ?? 0, fresh.xp ?? 0);
  // Gear handed over in play (give, loot) is kept, unless the new sheet changes the gear list itself.
  // A hand-typed record (`sheet` undefined, `editCharacter`) is the DM's word on the gear: it stands.
  if (sheet && Array.isArray(e.gear) && JSON.stringify(sheet.gear ?? []) === JSON.stringify(e.sheet?.gear ?? [])) fresh.gear = [...e.gear];
  // What the DM set with `setSpeed` is laid over what the sheet gives (a creature with no record is made exactly as before).
  // A record typed in wins: a grant stays only for a way of moving where the record's Speed is what the creature has now (the form sends
  // back what it shows, so an untouched Speed keeps the grant; a Speed the DM typed differently drops it).
  if (e.speedSet !== undefined) regrant(fresh, sheet !== undefined ? e.speedSet : untouchedGrants(e, record));
  // A familiar in its pocket dimension (companions.md, stage C5c) is still this creature's: it comes with it, and only that.
  delete fresh.pocket;
  if (e.pocket !== undefined) fresh.pocket = e.pocket;
}
// A character made from a sheet that names a homebrew subclass whose pack is not loaded here keeps the id and plays without its features and
// spells (homebrew-subclasses.md, Decision 4). Told to the DM alone (`partial`), at every making of it from the sheet, a new character's too.
export function tellMissing(ev, e, sheet) {
  for (const m of sheet ? missingOf(sheet) : []) ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true, text: `${e.name}: its subclass "${m.id}" is not loaded at this table, so its subclass features and spells are absent until its pack is added again.` });
}
export function remake(s, e, record, sheet, ev) {
  !e.form || fail(`${e.name} is in the form of a ${e.form.name}. Leave the form first.`);
  e.kind === 'pc' || fail(`${e.name} is not a character.`);
  const problems = lintRecord(record, { spells: SPELLS });
  problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
  // The creature itself at its new size (`...e`: its id and its ride), so the other half of a ridden pair is never in
  // its way (space.js, `paired`; DEBT W13).
  const body = { ...e, size: record.size ?? 'medium' };
  (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${body.size} there.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} growing.`);
  const fresh = makeEntity(record, { id: e.id, kind: 'pc', side: e.side, pos: e.pos, owner: e.owner, ownerName: e.ownerName });
  carryPlay(e, fresh, record, sheet);
  fresh.sheet = sheet;
  s.entities[e.id] = fresh;
  ev.push({ type: 'edited', id: e.id });
  donned(s, fresh, ev);
  tellMissing(ev, fresh, sheet);
}

