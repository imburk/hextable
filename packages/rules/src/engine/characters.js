// Characters and their gear (engine.js): addCharacter, editCharacter, setSheet, levelUp, setSpeed,
// setSize, give, equip, attune.
import { gridOf, col, parse } from '../grid.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { FT, ground, landing, overlapAt, STEP_MAX } from '../space.js';
import { SIZES } from '../content/sizes.js';
import { barriers } from '../walls.js';
import { attuneMax, attuneProblem, classesOf, derive, heldItems, itemName, levelOf, validate } from '../derive.js';
import { control, ent, fail, inFight, living } from './shared.js';
import { fitsOn, joinEncounter, lookAround } from './world.js';
import { donned, landItem, makeEntity, newProblems, remake, resheet } from './sheets.js';

export const handlers = {
  // Give a creature a way of moving, or take it away. { type: 'setSpeed', actor, mode, feet, hover? }
  setSpeed(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change how a creature moves.');
    const e = ent(s, a.actor);
    ['walk', 'climb', 'swim', 'fly', 'burrow'].includes(a.mode) || fail('Unknown way of moving.');
    (Number.isInteger(a.feet) && a.feet >= 0 && a.feet <= 300 && a.feet % FT === 0) || fail('A Speed is a multiple of 5 feet.');
    if (a.mode === 'walk') e.speed = a.feet; else if (a.feet) e.speeds[a.mode] = a.feet; else delete e.speeds[a.mode];
    if (a.mode === 'fly') { if (a.hover && a.feet) e.hover = true; else delete e.hover; }
    ev.push({ type: 'speed', id: e.id, mode: a.mode, feet: a.feet });
  },
  // Add a character typed in by hand. { type: 'addCharacter', record, at? }
  // The record is a finished sheet (see lintRecord in content/schema.js). It joins the party
  // beside whoever is already there, or at `at`.
  addCharacter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add a character.');
    const problems = lintRecord(a.record, { spells: SPELLS });
    problems.length === 0 || fail(`That character can't be added. ${problems[0]}`);
    Object.values(s.entities).filter((e) => e.kind === 'pc').length < 12 || fail('A table holds twelve characters at most.');
    const body = { size: a.record.size ?? 'medium' }, B = barriers(s.map);
    const near = a.at ?? Object.values(s.entities).find((e) => e.side === 'party' && !e.dead)?.pos ?? s.map.starts[0] ?? parse(Object.keys(s.map.levels[0].tiles)[0]);
    const centre = landing(s.map, near, near.z ?? 0) || fail("There's nowhere there to stand.");
    let spot = null;
    const G = gridOf(s.map);
    for (let n = 0; n < 8 && !spot; n++) for (const h of G.range(centre, n)) {
      const p = G.dist(h, centre) === n ? landing(s.map, h, centre.z) : null;
      if (!spot && p && Math.abs(p.z - centre.z) <= STEP_MAX && TILES[ground(s.map, p).tile.t].cost < Infinity && !B.solid(ground(s.map, p).level.id, p) &&
          fitsOn(s.map, body, p, B) && !living(s).some((o) => overlapAt(o, o.pos, body, p, gridOf(s.map)))) spot = p;
    }
    spot || fail('There is no room for another character there.');
    const id = `pc${++s.seq}`;
    s.entities[id] = makeEntity(a.record, { id, kind: 'pc', side: 'party', pos: spot });
    ev.push({ type: 'spawned', id });
    lookAround(s, ev, [s.entities[id]]);
    if (s.encounter?.arena[col(spot)]) joinEncounter(s, s.entities[id], ev);
  },
  // Replace a character's sheet with a corrected one, keeping who plays it, where it stands and
  // how hurt it is. { type: 'editCharacter', actor, record }
  editCharacter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a character.');
    const e = ent(s, a.actor);
    e.kind === 'pc' || fail(`${e.name} is not a character.`);
    const problems = lintRecord(a.record, { spells: SPELLS });
    problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
    const body = { size: a.record.size ?? 'medium' };
    (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${body.size} there.`);
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} growing.`);
    const fresh = makeEntity(a.record, { id: e.id, kind: 'pc', side: e.side, pos: e.pos, owner: e.owner, ownerName: e.ownerName });
    const lost = e.maxHp - e.hp;
    Object.assign(fresh, { hp: Math.max(e.hp > 0 ? 1 : 0, fresh.maxHp - lost), cond: e.cond, death: e.death, dead: e.dead, reactionUsed: e.reactionUsed, ...(e.reactions ? { reactions: e.reactions } : {}) });
    for (const [l, n] of Object.entries(fresh.slots)) fresh.slots[l] = Math.min(n, Math.max(0, n - ((e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0))));      // slots already spent stay spent
    if (e.look && !a.record.look) fresh.look = e.look;
    s.entities[e.id] = fresh;
    ev.push({ type: 'edited', id: e.id });
    donned(s, fresh, ev);
  },
  // A character built from class and level (derive.js). { type: 'setSheet', sheet, actor?, at? }
  // Without `actor` it joins the party as addCharacter does; with one, that character is made
  // again from the new sheet, keeping who plays it, where it stands, the damage it has taken, its
  // conditions, and what it has spent: uses of features, spell slots, Hit Point Dice. The sheet is
  // kept on the creature, so it can be made again. A hand-typed record has no sheet and is untouched.
  setSheet(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a character.');
    const problems = validate(a.sheet);
    problems.length === 0 || fail(`That sheet can't be played yet. ${problems[0]}`);
    const { record } = derive(a.sheet), sheet = structuredClone(a.sheet);
    if (a.actor === undefined) {
      handlers.addCharacter(s, { record, ...(a.at ? { at: a.at } : {}) }, ctx, ev);
      s.entities[ev.findLast((x) => x.type === 'spawned').id].sheet = sheet;
      return;
    }
    remake(s, ent(s, a.actor), record, sheet, ev);
  },
  // Up one level, outside a fight: one more level in a class it has, or level 1 in a new class
  // (Multiclassing), whose prerequisites validate() checks. { type: 'levelUp', actor, sheet }
  levelUp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can level a character up.');
    const e = ent(s, a.actor);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't level up in the middle of a fight.`);
    (a.sheet && typeof a.sheet === 'object' && !Array.isArray(a.sheet)) || fail('Send the new sheet.');
    const was = classesOf(e.sheet), now = Array.isArray(a.sheet.classes) ? classesOf(a.sheet) : null;
    if (!now) {
      (a.sheet.class === was[0].c?.id && was.length === 1) || fail(was.length > 1 ? `${e.name} has several classes; the new sheet lists them all.` : 'Levelling up keeps the class, or adds one: list both classes to take a level in a new one.');
      (a.sheet.level === e.sheet.level + 1) || fail(`${e.name} is level ${e.sheet.level}; the new sheet must be level ${e.sheet.level + 1}.`);
    } else {
      // The classes it had, in the same order, with one level more in one of them or a new class at level 1 at the end.
      const ids = (l) => l.map((k) => k.c?.id);
      const same = now.length >= was.length && now.length <= was.length + 1 && ids(was).every((id, i) => ids(now)[i] === id);
      same || fail(`Levelling up keeps ${e.name}'s classes in the order taken: ${ids(was).join(', ')}, and may add one at the end.`);
      const more = now.map((k, i) => k.level - (was[i]?.level ?? 0));
      (more.every((n) => n >= 0) && more.reduce((x, y) => x + y, 0) === 1 && (now.length === was.length || now[now.length - 1].level === 1))
        || fail(`${e.name} gains one level: one more in one class, or level 1 in a new one.`);
    }
    const problems = validate(a.sheet);
    problems.length === 0 || fail(`That sheet can't be played yet. ${problems[0]}`);
    remake(s, e, derive(a.sheet).record, structuredClone(a.sheet), ev);
    ev.push({ type: 'std', id: e.id, action: `reached level ${levelOf(a.sheet)}` });
  },
  // Change how big a creature is. { type: 'setSize', actor, size }
  setSize(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a creature\'s size.');
    const e = ent(s, a.actor);
    Object.hasOwn(SIZES, a.size) || fail('Unknown size.');
    const body = { size: a.size };
    (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${a.size} there.`);
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} growing.`);
    e.size = a.size;
    ev.push({ type: 'size', id: e.id, size: a.size });
  },
  // Hand a creature an item, or take one away. { type: 'give', actor, item, take?, base?, damageType?, spell? }
  // `item` is a name (kept in `gear`, as before) or the id of a magic item of the pack. A pack item given to a
  // built character joins its sheet's `items` (carried, not worn), with `base`, `damageType` (the sheet's `type`) or `spell` where the item
  // asks for one; a character typed in by hand has no sheet, so it gets the item's name in `gear` only. To take a
  // magic item back, name its key on the sheet ("i1").
  give(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out items.');
    const e = ent(s, a.actor), item = String(a.item ?? '').trim();
    (item && item.length <= 80) || fail('Name the item.');
    const held = e.sheet && Array.isArray(e.sheet.items) ? e.sheet.items.find((x) => x?.id === item) : null;
    if (a.take && held) {
      const sheet = structuredClone(e.sheet);
      sheet.items = sheet.items.filter((x) => x.id !== item);
      if (sheet.attuning?.item === item) delete sheet.attuning;
      if (!sheet.items.length) delete sheet.items;
      resheet(s, e, sheet, ev);
      return ev.push({ type: 'gear', id: e.id, item: itemName(CONTENT.items[held.item], held), key: held.id, pack: held.item, why: 'dm', taken: true });
    }
    if (!a.take && Object.hasOwn(CONTENT.items, item)) {
      const def = CONTENT.items[item], spec = { item, ...(a.base !== undefined ? { base: a.base } : {}), ...(a.damageType !== undefined ? { type: a.damageType } : {}), ...(a.spell !== undefined ? { spell: a.spell } : {}) };
      if (e.sheet) {
        const x = landItem(s, e, [spec], ev)[0];
        return ev.push({ type: 'gear', id: e.id, item: itemName(def, x), key: x.id, pack: item, why: 'dm' });
      }
      const name = itemName(def, spec);
      e.gear.push(name);
      return ev.push({ type: 'gear', id: e.id, item: name, pack: item, why: 'dm', nameOnly: true });
    }
    (a.base === undefined && a.damageType === undefined && a.spell === undefined) || fail(`"${item}" is not a magic item of the pack.`);
    if (a.take) {
      const i = e.gear.findIndex((g) => String(g).toLowerCase() === item.toLowerCase());
      i >= 0 || fail(`${e.name} has no ${item}.`);
      e.gear.splice(i, 1);
    } else e.gear.push(item);
    ev.push({ type: 'gear', id: e.id, item, why: 'dm', ...(a.take ? { taken: true } : {}) });
  },
  // Put on or take off a magic item: armour donned, a Shield or weapon held, a ring worn, an Ioun Stone sent to
  // orbit. { type: 'equip', actor, item: key on the sheet, on?: true | false } By its controller or the DM, outside a
  // fight (donning and doffing take longer than a turn here; drawing a weapon in a fight is not built).
  equip(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't change what they wear in the middle of a fight.`);
    const on = a.on ?? true;
    typeof on === 'boolean' || fail('On is true or false.');
    const sheet = structuredClone(e.sheet), x = (sheet.items ?? []).find((y) => y.id === a.item) || fail(`${e.name} has no such item.`);
    const def = CONTENT.items[x.item];
    def.wear !== 'carried' || fail(`${def.name} works from ${e.name}'s person; there is nothing to put on.`);
    (x.equipped === true) !== on || fail(`${itemName(def, x)} is already ${on ? 'worn' : 'off'}.`);
    if (on) x.equipped = true; else delete x.equipped;
    resheet(s, e, sheet, ev);
    ev.push({ type: 'equip', id: e.id, key: x.id, item: itemName(def, x), on });
  },
  // Attune to a magic item, or end an Attunement, during the next Short Rest (SRD "Attunement": a Short Rest
  // focused on only that item). { type: 'attune', actor, item: key | null, end?: true } By its controller or the DM,
  // outside a fight; `item: null` changes its mind. It happens at the end of the next shortRest it takes.
  attune(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't attune to an item in the middle of a fight.`);
    const sheet = structuredClone(e.sheet);
    if (a.item === null) {
      sheet.attuning || fail(`${e.name} is not attuning to anything.`);
      delete sheet.attuning;
    } else {
      const x = (sheet.items ?? []).find((y) => y.id === a.item) || fail(`${e.name} has no such item.`), def = CONTENT.items[x.item];
      (a.end === undefined || typeof a.end === 'boolean') || fail('End is true or false.');
      if (a.end) x.attuned === true || fail(`${e.name} is not attuned to ${itemName(def, x)}.`);
      else {
        x.attuned !== true || fail(`${e.name} is already attuned to ${itemName(def, x)}.`);
        const why = attuneProblem(sheet, def); !why || fail(why);
        heldItems(sheet).filter((y) => y.x.attuned === true).length < attuneMax(sheet) || fail(`${e.name} is attuned to ${attuneMax(sheet)} items already: end one first.`);
        !heldItems(sheet).some((y) => y.x.attuned === true && y.x.item === x.item) || fail(`${e.name} is attuned to another ${def.name} already.`);
      }
      sheet.attuning = { item: x.id, ...(a.end ? { end: true } : {}) };
    }
    const problems = newProblems(e.sheet, sheet);
    problems.length === 0 || fail(problems[0]);
    e.sheet = sheet;
    ev.push({ type: 'attuning', id: e.id, ...(sheet.attuning ? { key: sheet.attuning.item, item: itemName(CONTENT.items[sheet.items.find((y) => y.id === sheet.attuning.item).item], sheet.items.find((y) => y.id === sheet.attuning.item)), ...(sheet.attuning.end ? { end: true } : {}) } : { cleared: true }) });
  },
};

