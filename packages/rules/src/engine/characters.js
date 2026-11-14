// Characters and their gear (engine.js): addCharacter, editCharacter, setSheet, levelUp, setSpeed,
// setSize, give, equip, attune; and items between creatures (E17): pass, drop, pickUp.
import { gridOf, col, parse } from '../grid.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { apart, FT, ground, landing, overlapAt, STEP_MAX, under } from '../space.js';
import { LIGHTS } from '../content/lights.js';
import { incapacitatedBy } from '../modifiers.js';
import { unknown } from '../vision.js';
import { SIZES } from '../content/sizes.js';
import { barriers } from '../walls.js';
import { attuneMax, attuneProblem, classesOf, derive, heldItems, itemName, levelOf, validate } from '../derive.js';
import { able, control, current, ent, fail, hostile, inFight, living, need, RuleError, up, walled } from './shared.js';
import { contentName, fitsOn, isPile, joinEncounter, lookAround, nearObject, objectName, objectOf, objectShown, pileAt, pileContents, PILE_MAX } from './world.js';
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


// ---------- items between creatures (E17; docs/specs/table-ui.md, T6g) ----------
// `pass` hands an item to a creature on the same side within 5 ft, `drop` lays it on the ground under the creature
// (a `pile`, world.js), `pickUp` takes from a pile in reach. `item` is what `give` takes: the key of a magic item on
// a built character's sheet ("i1"), or a name in its gear (any case). Each is one `gear` event per side, with `why`
// (`pass`, `drop`, `pickup`) and `with` (the other creature) or `object` (the pile). In a fight each is an object
// interaction on the creature's own turn: the first a turn is free, any more takes the Utilize action (SRD
// "Interacting with Things"). Everything is checked before anything changes.
export const GEAR_MAX = 60;          // names a creature carries (derive.js holds a sheet's gear list to 60 as well)
export const HAND_FEET = 5;          // pass: to a creature within 5 feet

// What `item` names on this creature. Refused if it has none, or if the item is in use: worn or held (taken off first
// with `equip`, which is outside a fight). A magic item comes with what it is made of (`spec`: the sheet entry without
// its key, `equipped` or `attuned`) and whether the creature is attuned to it or about to attune to it.
function holding(e, item) {
  const named = typeof item === 'string' ? item.trim() : '';
  (named && named.length <= 80) || fail('Name the item.');
  const x = e.sheet && Array.isArray(e.sheet.items) ? e.sheet.items.find((y) => y?.id === named) : null;
  if (x && Object.hasOwn(CONTENT.items, x.item)) {
    const def = CONTENT.items[x.item], name = itemName(def, x);
    x.equipped !== true || fail(`${e.name} has ${name} on. Take it off first (that is done outside a fight).`);
    const { id: _key, equipped: _on, attuned: _att, ...spec } = x;
    return { key: x.id, name, pack: x.item, spec, attuned: x.attuned === true, attuning: e.sheet.attuning?.item === x.id };
  }
  const i = e.gear.findIndex((g) => String(g).toLowerCase() === named.toLowerCase());
  i >= 0 || fail(`${e.name} has no ${named}.`);
  return { name: String(e.gear[i]), index: i };
}
// Is this name in its gear the light it carries (setLight with a torch, a lamp), and the only one of that name? Then
// the light goes with it.
const LIGHT_NAME = (id) => LIGHTS[id]?.name.replace(/ \(.*\)$/, '').toLowerCase();
const carriesLit = (e, h) => h.index !== undefined && !!e.light?.item && LIGHT_NAME(e.light.item) === h.name.toLowerCase() &&
  e.gear.filter((g) => String(g).toLowerCase() === h.name.toLowerCase()).length === 1;

// Why this creature can't handle an object right now ('' if it can), and what it would cost: null outside a fight
// (or for a creature not in it), 'free' for the first object interaction of its turn, 'action' (Utilize) after.
export function interactionOf(s, e) {
  if (!up(e)) return { why: `${e.name} is down.`, time: null };
  const by = incapacitatedBy(e);
  if (by) return { why: `${e.name} is ${by} and can't act.`, time: null };
  if (!s.encounter || !inFight(s, e.id)) return { why: '', time: null };
  if (current(s) !== e.id) return { why: `It isn't ${e.name}'s turn.`, time: null };
  if (!s.encounter.flags.interact) return { why: '', time: 'free' };
  return { why: s.encounter.budget.action < 1 ? `${e.name} has already handled one thing this turn and used an action.` : '', time: 'action' };
}
function interaction(s, e) {
  const { why, time } = interactionOf(s, e);
  if (why) fail(why);
  if (time === 'action') need(s, e, 'action');
  return time;
}
const pay = (s, time) => { if (time === 'free') s.encounter.flags.interact = true; else if (time === 'action') s.encounter.budget.action--; };

// Run `fn`; if it is refused part way (a sheet that can't take the item), these creatures and the events are put
// back as they were, so a refused action changes nothing.
function together(s, ev, ids, fn) {
  const was = ids.map((id) => [id, structuredClone(s.entities[id])]), n = ev.length;
  try { return fn(); } catch (err) {
    if (err instanceof RuleError) { for (const [id, e] of was) s.entities[id] = e; ev.length = n; }
    throw err;
  }
}
// Take the item off the creature: a name out of its gear, a magic item off its sheet (its Attunement and an attuning
// that named it end with it, as the sheet no longer holds it), the character made again from the sheet.
function takeOut(s, id, h, ev) {
  const e = s.entities[id];
  if (h.key === undefined) return void e.gear.splice(h.index, 1);
  const sheet = structuredClone(e.sheet);
  sheet.items = sheet.items.filter((y) => y.id !== h.key);
  if (sheet.attuning?.item === h.key) delete sheet.attuning;
  if (!sheet.items.length) delete sheet.items;
  resheet(s, e, sheet, ev);
}
// Put things on a creature: magic items onto a built character's sheet (carried, each with a new key), anything else,
// and magic items for a creature with no sheet, as names in its gear. Returns, for each, { key? } or { nameOnly? }.
function putIn(s, id, things, ev) {
  const e = s.entities[id], toSheet = things.filter((x) => x.spec && e.sheet);
  const keys = toSheet.length ? landItem(s, e, toSheet.map((x) => x.spec), ev).map((x) => x.id) : [];
  const now = s.entities[id];
  return things.map((x) => {
    if (x.spec && now.sheet) return { key: keys.shift() };
    now.gear.push(x.name);
    return x.spec ? { nameOnly: true } : {};
  });
}
const roomFor = (e, things) => {
  const names = things.filter((x) => !(x.spec && e.sheet)).length;
  e.gear.length + names <= GEAR_MAX || fail(`${e.name} carries ${GEAR_MAX} things by name already.`);
};
const gearEv = (id, h, why, more) => ({ type: 'gear', id, item: h.name, ...(h.pack ? { pack: h.pack } : {}), why, ...more });
// An attuning (the next Short Rest's) that named the item ends with it: said as `attune` with `item: null` says it.
function leaves(s, e, h, ev) {
  if (h.attuning) ev.push({ type: 'attuning', id: e.id, cleared: true });
}

// What this creature could hand over, and to whom: [{ id, name, why }] for each creature on its side within 5 ft,
// with why not ('' if it can), and the time the next object interaction takes (interactionOf).
export function passTargets(s, e) {
  if (!e) return [];
  const { why, time } = interactionOf(s, e);
  return living(s).filter((t) => t.id !== e.id && !hostile(e, t) && apart(s, e, t) * FT <= HAND_FEET).map((t) => {
    const no = why || (!up(t) || incapacitatedBy(t) ? `${t.name} is ${incapacitatedBy(t) ?? 'down'} and can't take it.` : '');
    let wall = '';
    if (!no) try { walled(s, e, t); } catch (err) { if (!(err instanceof RuleError)) throw err; wall = err.message; }
    return { id: t.id, name: t.name, why: no || wall, time };
  });
}
// The piles in reach with something in them, as `usesFor` finds objects (a player's client passes its own view, which
// holds only the piles it may know of): [{ object, name, items: [{ id, name, pack? }], why, time }].
export function pickUpsFor(s, e) {
  if (!e) return [];
  const { why, time } = interactionOf(s, e);
  return s.map.objects.filter((o) => isPile(o) && objectShown(s.map, o) && nearObject(s, e, o) && pileContents(o).length).map((o) => ({
    object: o.id, name: objectName(o), items: pileContents(o).map((x) => ({ id: x.id, name: contentName(x), ...(x.item !== undefined ? { pack: x.item } : {}) })), why, time,
  }));
}

Object.assign(handlers, {
  // Hand an item to a creature on the same side within 5 ft (a party member, for a player's character).
  // { type: 'pass', actor, item, to } By the actor's controller or the DM. The one taking it must be up and able to.
  pass(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    // A creature the party does not know of is, to a player, a creature that is not there (as in dispatch).
    typeof a.to === 'string' || fail('Name who to hand it to.');
    const t = Object.hasOwn(s.entities, a.to) ? s.entities[a.to] : null;
    (t && (ctx.role === 'dm' || !unknown(s, t))) || fail('No such creature.');
    t.id !== e.id || fail(`${e.name} already holds it.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const h = holding(e, a.item);
    !hostile(e, t) || fail(`${t.name} is not on ${e.name}'s side.`);
    !t.dead || fail(`${t.name} is dead.`);
    (up(t) && !incapacitatedBy(t)) || fail(`${t.name} is ${incapacitatedBy(t) ?? 'down'} and can't take it.`);
    apart(s, e, t) * FT <= HAND_FEET || fail(`${t.name} is more than ${HAND_FEET} feet away.`);
    walled(s, e, t);
    const lit = carriesLit(e, h);
    !lit || !t.light || fail(`${t.name} already carries a light.`);
    const thing = { name: h.name, ...(h.spec ? { spec: h.spec } : {}) };
    roomFor(t, [thing]);
    const time = interaction(s, e);
    const [got] = together(s, ev, [e.id, t.id], () => { takeOut(s, e.id, h, ev); return putIn(s, t.id, [thing], ev); });
    pay(s, time);
    ev.push(gearEv(e.id, h, 'pass', { ...(h.key ? { key: h.key } : {}), with: t.id, taken: true, ...(h.attuned ? { unattuned: true } : {}) }));
    leaves(s, e, h, ev);
    ev.push(gearEv(t.id, h, 'pass', { ...got, with: e.id }));
    if (lit) {
      const giver = s.entities[e.id], taker = s.entities[t.id];
      taker.light = giver.light; delete giver.light;
      ev.push({ type: 'light', id: giver.id, bright: 0, dim: 0 });
      ev.push({ type: 'light', id: taker.id, bright: taker.light.bright, dim: taker.light.dim, item: taker.light.item, name: LIGHTS[taker.light.item].name });
    }
  },
  // Put an item down where the creature is: onto the pile in its cell, or a new pile there (on the surface under it,
  // if it is in the air). { type: 'drop', actor, item }
  drop(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const h = holding(e, a.item);
    const sf = under(s.map, e.pos) || fail(`There is nothing under ${e.name} for it to land on.`);
    const there = pileAt(s, sf.level.id, e.pos);
    !there || (Array.isArray(there.contents) ? there.contents.length : 0) < PILE_MAX || fail(`${PILE_MAX} things lie there already.`);
    const lit = carriesLit(e, h);
    const time = interaction(s, e);
    together(s, ev, [e.id], () => takeOut(s, e.id, h, ev));
    pay(s, time);
    let o = there;
    if (!o) {
      let id;
      do id = `pile${++s.seq}`; while (s.map.objects.some((x) => x.id === id));
      o = { id, def: 'pile', level: sf.level.id, at: { q: e.pos.q, r: e.pos.r }, state: CONTENT.objects.pile.initial, contents: [] };
      s.map.objects.push(o);
    }
    if (!Array.isArray(o.contents)) o.contents = [];
    let n = 1;
    while (o.contents.some((x) => x?.id === `c${n}`)) n++;
    o.contents.push(h.spec ? { id: `c${n}`, ...h.spec } : { id: `c${n}`, name: h.name });
    ev.push(gearEv(e.id, h, 'drop', { ...(h.key ? { key: h.key } : {}), object: o.id, taken: true, ...(h.attuned ? { unattuned: true } : {}) }));
    leaves(s, e, h, ev);
    ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'drop', ...(there ? {} : { placed: true }) });
    if (lit) {
      const now = s.entities[e.id];
      delete now.light;
      ev.push({ type: 'light', id: now.id, bright: 0, dim: 0 });
      ev.push({ type: 'manual', actor: now.id, name: h.name, partial: true,
        text: `${now.name} dropped a lit ${h.name}. It burns on where it fell, but a pile gives no light in the engine: the DM decides what it lights (a campfire or brazier object, or setLight on a creature).` });
    }
  },
  // Take from a pile in reach. { type: 'pickUp', actor, object, item? } `item` is the id of one thing in the pile
  // (`contents[].id`); without it, everything there, which in a fight is allowed only for a pile of one thing (each
  // is an object interaction). A pile left empty goes from the map.
  pickUp(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const o = objectOf(s, a.object, ctx), name = objectName(o).toLowerCase();
    isPile(o) || fail(`The ${name} is not something to pick up.`);
    nearObject(s, e, o) || fail(`${e.name} is too far from the ${name}.`);
    const list = pileContents(o);
    list.length || fail('There is nothing there to pick up.');
    let take;
    if (a.item === undefined) {
      (list.length === 1 || !(s.encounter && inFight(s, e.id))) || fail('Name one thing to pick up: in a fight each thing is an object interaction.');
      take = list;
    } else take = [list.find((x) => x.id === a.item) || fail('That is not there.')];
    const things = take.map((x) => { const { id: _id, ...spec } = x; return { id: x.id, name: contentName(x), ...(x.item !== undefined ? { spec, pack: x.item } : {}) }; });
    roomFor(e, things);
    const time = interaction(s, e);
    const got = together(s, ev, [e.id], () => putIn(s, e.id, things, ev));
    pay(s, time);
    const gone = new Set(take.map((x) => x.id));
    o.contents = o.contents.filter((x) => !(x && gone.has(x.id)));
    const empty = !pileContents(o).length;
    things.forEach((x, i) => ev.push(gearEv(e.id, x, 'pickup', { ...got[i], object: o.id })));
    ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'pickup', ...(empty ? { gone: true } : {}) });
    if (empty) {
      s.map.objects.splice(s.map.objects.indexOf(o), 1);
      if (s.map.seen?.objects) delete s.map.seen.objects[o.id];
    }
  },
});
