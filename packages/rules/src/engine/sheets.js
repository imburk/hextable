// Making creatures from templates and character sheets, and remaking one when its sheet changes
// (engine.js).
import { MONSTER_ACTIONS, SPELLS } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { ground, overlapAt } from '../space.js';
import { xpFor } from '../rewards.js';
import { barriers } from '../walls.js';
import { derive, validate } from '../derive.js';
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
export function resheet(s, e, sheet, ev) {
  const problems = validate(sheet);
  problems.length === 0 || fail(`That can't be done. ${problems[0]}`);
  remake(s, e, derive(sheet).record, sheet, ev);
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
export function remake(s, e, record, sheet, ev) {
  !e.form || fail(`${e.name} is in the form of a ${e.form.name}. Leave the form first.`);
  e.kind === 'pc' || fail(`${e.name} is not a character.`);
  const problems = lintRecord(record, { spells: SPELLS });
  problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
  const body = { size: record.size ?? 'medium' };
  (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${body.size} there.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos)) || fail(`Someone is in the way of ${e.name} growing.`);
  const fresh = makeEntity(record, { id: e.id, kind: 'pc', side: e.side, pos: e.pos, owner: e.owner, ownerName: e.ownerName });
  const lost = e.maxHp - e.hp;
  fresh.hp = Math.max(e.hp > 0 ? 1 : 0, fresh.maxHp - lost);
  for (const k of ['cond', 'death', 'dead', 'reactionUsed', 'reactions', 'tempHp', 'tempFx', 'follow', 'march', 'light', 'hiding', 'hidden', 'look']) if (e[k] !== undefined && (k !== 'look' || !record.look)) fresh[k] = e[k];
  for (const [l, n] of Object.entries(fresh.slots)) fresh.slots[l] = Math.min(n, Math.max(0, n - ((e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0))));      // slots spent stay spent
  for (const f of fresh.feats ?? []) {                                    // so do uses of features
    const was = featOf(e, f.id);
    if (f.uses && was?.uses) fresh.uses[f.id] = Math.max(0, f.uses.max - Math.max(0, was.uses.max - (e.uses[f.id] ?? 0)));
    if (f.relentless && e.uses?.[f.id] !== undefined) fresh.uses[f.id] = e.uses[f.id];      // Relentless Rage's uses since the last rest
    if (f.overchannel && e.uses?.[f.id] !== undefined) fresh.uses[f.id] = e.uses[f.id];     // Overchannel's uses since the last Long Rest
  }
  if (fresh.hitDie && e.hd !== undefined) fresh.hd = Math.max(0, fresh.level - Math.max(0, (e.level ?? 0) - e.hd));
  // Hit Dice of several sizes: what was spent of each size stays spent.
  if (fresh.hdBy && e.hd !== undefined) {
    const had = e.hitDice ?? (e.hitDie ? { [e.hitDie]: e.level } : {}), left = e.hdBy ?? (e.hitDie ? { [e.hitDie]: e.hd } : {});
    for (const d of Object.keys(fresh.hdBy)) fresh.hdBy[d] = Math.max(0, fresh.hitDice[d] - Math.max(0, (had[d] ?? 0) - (left[d] ?? 0)));
    fresh.hd = Object.values(fresh.hdBy).reduce((a, b) => a + b, 0);
  }
  fresh.xp = Math.max(e.xp ?? 0, fresh.xp ?? 0);                     // XP earned is kept; a level given by hand starts at least at its threshold
  // Gear handed over in play (give, loot) is kept, unless the new sheet changes the gear list itself.
  if (Array.isArray(e.gear) && JSON.stringify(sheet.gear ?? []) === JSON.stringify(e.sheet?.gear ?? [])) fresh.gear = [...e.gear];
  fresh.sheet = sheet;
  s.entities[e.id] = fresh;
  ev.push({ type: 'edited', id: e.id });
  donned(s, fresh, ev);
}

