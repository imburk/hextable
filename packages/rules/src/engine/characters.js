// Characters and their gear (engine.js): addCharacter, editCharacter, setSheet, levelUp, setSpeed,
// setSize, give, equip, attune; and items between creatures (E17): pass, drop, pickUp.
import { gridOf, col, parse } from '../grid.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { apart, FT, ground, landing, overlapAt, STEP_MAX, under } from '../space.js';
import { LIGHTS } from '../content/lights.js';
import { incapacitatedBy } from '../modifiers.js';
import { partyView, sightRule, unknown } from '../vision.js';
import { SIZES } from '../content/sizes.js';
import { barriers } from '../walls.js';
import { attuneMax, attuneProblem, classesOf, derive, heldItems, itemName, levelOf, shieldEntry, validate } from '../derive.js';
import { able, control, current, ent, fail, hostile, hpOpts, inFight, living, need, RuleError, up, walled } from './shared.js';
import { contentName, fitsOn, isPile, joinEncounter, lookAround, nearObject, objectName, objectOf, objectShown, openContents, pileAt, pileContents, pileId, PILE_MAX } from './world.js';
import { cure } from './rolls.js';
import { carryPlay, donned, landItem, makeEntity, newProblems, noteSpeed, putSpeed, refreshOne, remake, resheet, tellMissing } from './sheets.js';
import { handHolds } from '../weapons.js';
import { rollScore, rollScores, mayReroll, tableRule, topThree } from '../scores.js';
import { cleanPurse, COINS } from '../market.js';
import { isRolled, levelsOwed, levelOfEntry, lowRule, rollLevel, rollsFor, sameRolls } from '../hitpoints.js';
import { mod } from '../derive.js';

const COIN_MOST = 10_000_000;        // coins of one kind a purse holds (docs/specs/shops.md, Decision 4)

// A Shield needs a hand: one holding a creature in each (docs/specs/grapple-shove.md, Decision 4) has none.
function freeHandForShield(s, e) {
  const held = handHolds(s, e);
  if (held.length >= 2) fail(`${e.name} has no hand free for a Shield: it is holding ${held.map((t) => t.name).join(' and ')}. Let go first (letGo).`);
}

// Who is rolling ability scores: a member by their user id, the DM by theirs (or 'dm' where there is none, as in a game on one device).
// `scoreRolls['#seq']` counts the roll events (a stable number, unlike a place in the capped timeline): a sheet's `at` names the event by it.
const SEQ = '#seq';
// Ids that are no one's: the counter's key and names that would reach the record's prototype.
const NOBODY = new Set([SEQ, '__proto__', 'constructor', 'prototype']);
const isRec = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// A user's own record (never one inherited, never the counter).
const own = (s, who) => (isRec(s.scoreRolls) && !NOBODY.has(who) && Object.hasOwn(s.scoreRolls, who) ? s.scoreRolls[who] : undefined);
// The next event number. A counter that is missing or is not a whole number from 0 up (a save made by hand, or before it was kept) is rebuilt as the
// number of records kept, so the numbers go on from there; it is written only here, after every check has passed.
const nextSeq = (s) => {
  const r = s.scoreRolls, c = r[SEQ];
  r[SEQ] = (Number.isSafeInteger(c) && c >= 0 ? c : Object.keys(r).filter((k) => k !== SEQ).length) + 1;
  return r[SEQ];
};
// A recorded roll that has the shape the actions read (six sets of four dice, each die 1 to 6), else a plain refusal.
const dice4 = (d) => { if (!Array.isArray(d) || d.length !== 4) return false; for (let i = 0; i < 4; i++) if (!Number.isInteger(d[i]) || d[i] < 1 || d[i] > 6) return false; return true; };
const sound = (x) => {
  if (!isRec(x) || !Array.isArray(x.sets) || x.sets.length !== 6) return false;
  for (let i = 0; i < 6; i++) { const q = x.sets[i]; if (!isRec(q) || !dice4(q.dice) || (q.again !== undefined && !dice4(q.again))) return false; }
  return true;
};
const roller = (ctx) => ctx.role === 'dm' ? (typeof ctx.userId === 'string' && ctx.userId ? ctx.userId : 'dm') : (typeof ctx.userId === 'string' && ctx.userId ? ctx.userId : fail('Only someone at the table can roll ability scores.'));

// ---------- rolled Hit Points (hitpoints.js, #638) ----------
// The rolls on a sheet are written here and nowhere else. `rollInto` rolls the levels that `pick(classIndex, entryIndex, classLevel)` names and that have no roll
// yet, from the game's seed, onto `sheet.hpRolls`, and returns what was rolled for the log. It changes `sheet` and the rng only.
function rollInto(s, sheet, pick) {
  const ks = classesOf(sheet), rule = lowRule(s.settings), done = [], con = mod(derive(sheet).record.abil.con);
  ks.forEach((k, i) => {
    const n = levelsOwed(k.level, i === 0), list = rollsFor(sheet, k.c.id, n);
    for (let j = 0; j < n; j++) {
      if (list[j] !== null || !pick(i, j, levelOfEntry(j, i === 0))) continue;
      const r = rollLevel(s, k.c.hitDie, rule);
      list[j] = r.value;
      done.push({ class: k.c.id, className: k.c.name, level: levelOfEntry(j, i === 0), die: k.c.hitDie, dice: r.dice, value: r.value, hp: Math.max(1, r.value + con) });
    }
    if (list.some((v) => v !== null)) (sheet.hpRolls ??= {})[k.c.id] = list;
  });
  return { done, con };
}
// A sheet sent by a client keeps the rolls the character has, exactly: it may not add or change one. (A level the sheet no longer has loses its roll.)
// A sheet that sends none keeps them. Returns the sheet with the character's own rolls.
function keepRolls(e, sheet) {
  const ks = classesOf(sheet), held = e?.sheet;
  if (sheet.hpRolls !== undefined && !sameRolls(sheet, held ?? {}, ks)) fail('Hit Point rolls are made by the game at the table and cannot be changed by a sheet. Leave them as they are.');
  const out = structuredClone(sheet);
  delete out.hpRolls;
  ks.forEach((k, i) => { const n = levelsOwed(k.level, i === 0), list = rollsFor(held, k.c?.id, n); if (list.some((v) => v !== null)) (out.hpRolls ??= {})[k.c.id] = list; });
  return out;
}
const hpEvent = (type, e, ctx, done, con, more = {}) => ({ type, id: e.id, name: e.name, by: ctx.userId ?? 'dm', con, levels: done, total: done.reduce((n, x) => n + x.hp, 0), ...more });

export const handlers = {
  // Roll the six ability scores from the game's seed (docs/specs/ability-scores.md): four d6 each, the lowest die set aside. { type: 'rollAbilityScores' }
  // A member rolls once; the DM may roll a fresh set. What was rolled is kept in `scoreRolls` for the table rule's rerolls, and the event is told to the
  // DM and the roller only (view.js). `at` is the event's number from a counter kept in `scoreRolls`, so a sheet can name it for good.
  // { type: 'rollAbilityScores', for? }: `for` is a member's user id and only the DM may give it: the DM rolls a fresh set for that member, in place of
  // whatever they have (how a record that is damaged, or a roll the member should not be held to, is put right). It is told to that member and the DM.
  rollAbilityScores(s, a, ctx, ev) {
    let who = roller(ctx);
    if (a.for !== undefined) {
      ctx.role === 'dm' || fail('Only the DM can roll ability scores for someone else.');
      (typeof a.for === 'string' && a.for && a.for.length <= 100) || fail('Whose scores? Give their user id.');
      who = a.for;
    }
    NOBODY.has(who) && fail('Only someone at the table can roll ability scores.');
    (ctx.role === 'dm' || own(s, who) === undefined) || fail('You have already rolled your ability scores at this table.');
    const { sets } = rollScores(s);
    if (!isRec(s.scoreRolls)) s.scoreRolls = {};
    const at = nextSeq(s);                                                    // before the record is written: a counter rebuilt counts the records already kept
    s.scoreRolls[who] = { sets: sets.map((x) => ({ dice: x.faces })) };
    ev.push({ type: 'scoresRolled', by: who, sets: sets.map((x) => ({ dice: x.dice, total: x.total })), at });
  },
  // Roll one of those scores again, once, if the table's rule allows it (settings `scoreReroll`, `scoreRerollBelow`, `scoreRerollResult`).
  // { type: 'rerollAbilityScore', index } with index 0 to 5, the score's place in the roll.
  rerollAbilityScore(s, a, ctx, ev) {
    const who = roller(ctx), mine = own(s, who);
    mine !== undefined || fail('Roll your ability scores first.');
    sound(mine) || fail('The roll kept for you is damaged; ask the DM to roll your scores for you.');
    (Number.isInteger(a.index) && a.index >= 0 && a.index < mine.sets.length) || fail('Which score? It is 0 to 5, in the order rolled.');
    const set = mine.sets[a.index], rule = tableRule(s.settings), first = topThree(set.dice);
    if (!mayReroll(set, rule)) {
      fail(set.again ? 'That score has been rolled again already.' : rule.reroll === 'none' ? 'This table does not allow a score to be rolled again.'
        : `This table allows a score below ${rule.below} to be rolled again; this one is ${first}.`);
    }
    const r = rollScore(s);
    set.again = r.faces;
    const old = rule.result === 'higher' && first > r.total;
    ev.push({ type: 'scoreRerolled', by: who, index: a.index, from: { dice: set.dice.map((value, i) => ({ sides: 6, value, ...(i === set.dice.indexOf(Math.min(...set.dice)) ? { drop: true } : {}) })), total: first },
      to: { dice: r.dice, total: r.total }, stands: old ? 'old' : 'new', total: old ? first : r.total, at: nextSeq(s) });
  },
  // Roll the Hit Points of a character's levels that have not been rolled (a table that began rolling after the character was made, an imported character).
  // { type: 'rollHp', actor }: the DM for any character, a player for a character they run; at a rolled table, out of a fight. One tap rolls every level still
  // to roll, with the game's seed; the event `hpRolled` is told to everyone, with each die.
  rollHp(s, a, ctx, ev) {
    const e = ent(s, a.actor);
    e.kind === 'pc' || fail(`${e.name} is not a character.`);
    control(s, e, ctx);
    isRolled(s.settings) || fail('This table uses the fixed Hit Point value. The DM can change that in the table settings.');
    e.sheet || fail(`${e.name} was typed in by hand: there is no sheet to keep rolls on.`);
    !inFight(s, e.id) || fail(`${e.name} can't roll Hit Points in the middle of a fight.`);
    !e.form || fail(`${e.name} is in the form of a ${e.form.name}. Leave the form first.`);
    const sheet = structuredClone(e.sheet), rng0 = structuredClone(s.rng);
    validate(sheet).length === 0 || fail(`${e.name}'s sheet can't be played as it is.`);
    try {
      const { done, con } = rollInto(s, sheet, () => true);
      done.length || fail(`${e.name} has no Hit Point levels left to roll.`);
      remake(s, e, derive(sheet, hpOpts(s)).record, sheet, ev);
      ev.push(hpEvent('hpRolled', e, ctx, done, con, { why: 'pending' }));
    } catch (err) { s.rng = rng0; throw err; }
  },
  // Roll one level's Hit Points again, as the DM's ruling. { type: 'rerollHp', actor, class, level } with the class id and the class level (2 or more in the
  // first class). It replaces that level's roll under the table's rule; the log says from what to what.
  rerollHp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can have a Hit Point roll made again.');
    const e = ent(s, a.actor);
    e.kind === 'pc' || fail(`${e.name} is not a character.`);
    isRolled(s.settings) || fail('This table uses the fixed Hit Point value.');
    e.sheet || fail(`${e.name} was typed in by hand: there is no sheet to keep rolls on.`);
    !inFight(s, e.id) || fail(`${e.name} can't roll Hit Points in the middle of a fight.`);
    !e.form || fail(`${e.name} is in the form of a ${e.form.name}. Leave the form first.`);
    const sheet = structuredClone(e.sheet), ks = classesOf(sheet), i = ks.findIndex((k) => k.c?.id === a.class);
    i >= 0 || fail('Which class? Give its id.');
    const j = a.level - (i === 0 ? 2 : 1), n = levelsOwed(ks[i].level, i === 0);
    (Number.isInteger(a.level) && j >= 0 && j < n) || fail(`${ks[i].c.name} has levels ${i === 0 ? 2 : 1} to ${ks[i].level} that add Hit Points.`);
    const was = rollsFor(sheet, a.class, n)[j];
    was !== null || fail(`That level has not been rolled yet; roll it with rollHp.`);
    const rng0 = structuredClone(s.rng);
    try {
      sheet.hpRolls[a.class][j] = null;
      const { done, con } = rollInto(s, sheet, (x, y) => x === i && y === j);
      remake(s, e, derive(sheet, hpOpts(s)).record, sheet, ev);
      ev.push(hpEvent('hpRerolled', e, ctx, done, con, { from: was }));
    } catch (err) { s.rng = rng0; throw err; }
  },
  // Give a creature a way of moving, or take it away. { type: 'setSpeed', actor, mode, feet, hover? }
  setSpeed(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change how a creature moves.');
    const e = ent(s, a.actor);
    ['walk', 'climb', 'swim', 'fly', 'burrow'].includes(a.mode) || fail('Unknown way of moving.');
    (Number.isInteger(a.feet) && a.feet >= 0 && a.feet <= 300 && a.feet % FT === 0) || fail('A Speed is a multiple of 5 feet.');
    putSpeed(e, a.mode, a.feet, a.hover);
    if (!e.form) noteSpeed(e, a.mode, a.feet, a.hover);          // (in a form the new numbers end with the form, as the old ones do) what the DM set is recorded (`speedSet`), so a remake from the sheet keeps it
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
    // The creature itself at its new size (`...e`: its id and its ride), so the other half of a ridden pair is never in
    // its way (space.js, `paired`; DEBT W13).
    const body = { ...e, size: a.record.size ?? 'medium' };
    (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${body.size} there.`);
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} growing.`);
    const fresh = makeEntity(a.record, { id: e.id, kind: 'pc', side: e.side, pos: e.pos, owner: e.owner, ownerName: e.ownerName });
    // What play has done to it stays, by the one list `remake` keeps too (sheets.js, `carryPlay`; DEBT C17). A record typed in has no sheet.
    carryPlay(e, fresh, a.record);
    s.entities[e.id] = fresh;
    // The record the DM typed wins over old play state: a condition it is now immune to ends as a cure ends it (`condEnd`; the part
    // of a lasting effect that held it is ended too).
    cure(s, fresh, a.record.conditionImmune ?? [], ev);
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
    if (a.actor === undefined) {
      // A new character: rolls that came with the sheet were not made at this table and are not kept. At a rolled table the game rolls every level after the first.
      const sheet = structuredClone(a.sheet);
      delete sheet.hpRolls;
      const rng0 = structuredClone(s.rng);
      try {
        const rolled = isRolled(s.settings) ? rollInto(s, sheet, () => true) : { done: [], con: 0 };
        handlers.addCharacter(s, { record: derive(sheet, hpOpts(s)).record, ...(a.at ? { at: a.at } : {}) }, ctx, ev);
        const made = s.entities[ev.findLast((x) => x.type === 'spawned').id];
        made.sheet = sheet;
        if (rolled.done.length) ev.push(hpEvent('hpRolled', made, ctx, rolled.done, rolled.con, { why: 'built' }));
        tellMissing(ev, made, sheet);
      } catch (err) { s.rng = rng0; throw err; }
      return;
    }
    const e = ent(s, a.actor), sheet = keepRolls(e, a.sheet);
    remake(s, e, derive(sheet, hpOpts(s)).record, sheet, ev);
  },
  // Make a character again from its own stored sheet, so one saved before a content change picks up what the content
  // gained (Wild Companion, Unarmed Strike, the pact forms...). Play state stays, as `setSheet` keeps it (`remake`).
  // { type: 'refresh', actor? }. With `actor`, that character; refused, nothing changes, when it has no sheet (typed in
  // by hand), is in a form, or its sheet no longer validates. Without, every party character with a sheet; one that
  // can't be is skipped with a DM-only `manual` event, and each remake is all or nothing. In a fight or out of one.
  refresh(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can refresh a character.');
    if (a.actor !== undefined) {
      typeof a.actor === 'string' || fail('Name the character to refresh.');
      refreshOne(s, ent(s, a.actor), ev); return;
    }
    Object.values(s.entities).some((e) => e.kind === 'pc' && e.side === 'party' && e.sheet) || fail('No party character has a sheet to refresh from.');
    for (const e of Object.values(s.entities)) {
      if (e.kind !== 'pc' || e.side !== 'party' || !e.sheet) continue;
      const mark = ev.length;
      try { refreshOne(s, e, ev); } catch (err) {
        if (!(err instanceof RuleError)) throw err;
        ev.length = mark;
        ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true, text: `Not refreshed from its sheet. ${err.message}` });      // `partial`: for the DM alone (view.js), a sheet's problem is not the table's
      }
    }
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
    // The levels it has already keep their rolls; at a rolled table the game rolls the one it gains, with the table's seed.
    const sheet = keepRolls(e, a.sheet), rng0 = structuredClone(s.rng);
    try {
      const rolled = isRolled(s.settings) ? rollInto(s, sheet, (i, j) => (now ? (now[i].level - (was[i]?.level ?? 0)) === 1 && j === levelsOwed(now[i].level, i === 0) - 1 : j === levelsOwed(sheet.level, true) - 1)) : { done: [], con: 0 };
      remake(s, e, derive(sheet, hpOpts(s)).record, sheet, ev);
      if (rolled.done.length) ev.push(hpEvent('hpRolled', e, ctx, rolled.done, rolled.con, { why: 'levelUp' }));
    } catch (err) { s.rng = rng0; throw err; }
    ev.push({ type: 'std', id: e.id, action: `reached level ${levelOf(sheet)}` });
  },
  // Change how big a creature is. { type: 'setSize', actor, size }
  setSize(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a creature\'s size.');
    const e = ent(s, a.actor);
    Object.hasOwn(SIZES, a.size) || fail('Unknown size.');
    // The creature itself at its new size (`...e`: its id and its ride), so the other half of a ridden pair is never in
    // its way (space.js, `paired`; DEBT W13).
    const body = { ...e, size: a.size };
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
  // { type: 'give', actor, coins: { gp: 35 }, take? } hands coins over or takes them away (docs/specs/shops.md, Decision 4): `e.coins`, only
  // the kinds held, each kind at most 10,000,000; taking more than the purse holds of a kind is refused. Event `coins { why: 'dm' }`.
  give(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out items.');
    if (a.coins !== undefined) {
      const e = ent(s, a.actor);
      a.item === undefined || fail('Give coins or an item, one at a time.');
      const want = cleanPurse(a.coins), had = cleanPurse(e.coins) ?? {};
      (want && isRec(a.coins) && Object.keys(want).length && COINS.every((k) => (want[k] ?? 0) <= COIN_MOST)) || fail(`Name the coins: up to ${COIN_MOST.toLocaleString('en')} of each of cp, sp, ep, gp and pp.`);
      const next = { ...had };
      for (const k of Object.keys(want)) {
        if (a.take) { want[k] <= (had[k] ?? 0) || fail(`${e.name} has no ${want[k].toLocaleString('en')} ${k.toUpperCase()} to take.`); next[k] -= want[k]; if (!next[k]) delete next[k]; }
        else { next[k] = (next[k] ?? 0) + want[k]; next[k] <= COIN_MOST || fail(`A purse holds at most ${COIN_MOST.toLocaleString('en')} coins of a kind.`); }
      }
      if (Object.keys(next).length) e.coins = next; else delete e.coins;
      return ev.push({ type: 'coins', id: e.id, coins: { ...next }, why: 'dm', ...(a.take ? { taken: want } : { given: want }) });
    }
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
    const e = ent(s, a.actor); control(s, e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't change what they wear in the middle of a fight.`);
    const on = a.on ?? true;
    typeof on === 'boolean' || fail('On is true or false.');
    const sheet = structuredClone(e.sheet), x = (sheet.items ?? []).find((y) => y.id === a.item) || fail(`${e.name} has no such item.`);
    const def = CONTENT.items[x.item];
    def.wear !== 'carried' || fail(`${def.name} works from ${e.name}'s person; there is nothing to put on.`);
    (x.equipped === true) !== on || fail(`${itemName(def, x)} is already ${on ? 'worn' : 'off'}.`);
    if (on && def.wear === 'shield') freeHandForShield(s, e);
    if (on) x.equipped = true; else delete x.equipped;
    resheet(s, e, sheet, ev);
    ev.push({ type: 'equip', id: e.id, key: x.id, item: itemName(def, x), on });
  },
  // Put a Shield away or take it up (SRD "Armor": "Shield (Utilize Action to Don or Doff)"). { type: 'shield', actor, on: true | false,
  // item? } By its controller or the DM, for a built character. In a fight it takes the creature's action (Utilize) on its own turn;
  // outside one it is free. A Shield of the sheet (`shield: true` or a Shield id) put away is `shieldStowed: true` beside it: carried, not held,
  // no Armor Class from it and a hand free; a magic Shield item toggles its `equipped` (an Attunement stays). `item` names which
  // magic Shield to take up when the character carries more than one. The creature is made again from the sheet, as `equip` does.
  shield(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    typeof a.on === 'boolean' || fail('On is true or false.');
    typeof e.sheet.shield !== 'string' || shieldEntry(e.sheet) || fail("That Shield's entry is not loaded at this table.");
    (a.item === undefined || typeof a.item === 'string') || fail('Item is the key of a magic Shield on the sheet.');
    const fight = !!s.encounter && inFight(s, e.id);
    if (fight) need(s, e, 'action');
    else { up(e) || fail(`${e.name} is down.`); able(e); }
    const sheet = structuredClone(e.sheet), on = a.on;
    const items = (sheet.items ?? []).filter((y) => CONTENT.items[y?.item]?.wear === 'shield');
    const plain = sheet.shield === true || typeof sheet.shield === 'string', held = items.find((y) => y.equipped === true) ?? (plain && sheet.shieldStowed !== true ? 'plain' : null);
    let name = 'Shield', key;
    if (!on) {
      held || fail(plain || items.length ? `${e.name} has no Shield in hand.` : `${e.name} has no Shield.`);
      if (held === 'plain') sheet.shieldStowed = true;
      else { delete held.equipped; name = itemName(CONTENT.items[held.item], held); key = held.id; }
    } else {
      !held || fail(`${e.name} already holds a Shield.`);
      freeHandForShield(s, e);
      plain || items.length || fail(`${e.name} has no Shield.`);
      if (a.item !== undefined) items.some((y) => y.id === a.item) || fail(`${e.name} has no such Shield.`);
      if (plain && sheet.shieldStowed === true && a.item === undefined) delete sheet.shieldStowed;
      else {
        const y = a.item !== undefined ? items.find((z) => z.id === a.item) : items[0];
        y || fail(`${e.name} has no Shield to take up.`);
        y.equipped = true; name = itemName(CONTENT.items[y.item], y); key = y.id;
      }
    }
    resheet(s, e, sheet, ev);
    if (fight) s.encounter.budget.action--;
    ev.push({ type: 'shield', id: e.id, on, ...(key !== undefined ? { key, item: name } : {}) });
  },
  // Attune to a magic item, or end an Attunement, during the next Short Rest (SRD "Attunement": a Short Rest
  // focused on only that item). { type: 'attune', actor, item: key | null, end?: true } By its controller or the DM,
  // outside a fight; `item: null` changes its mind. It happens at the end of the next shortRest it takes.
  attune(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
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
// Does the party see this pile now, and something on it it may know of? Recorded on its events as `seen`, so that they
// still reach players once the pile has gone from the map (view.js).
const seesPile = (s, o) => objectShown(s.map, o) && (sightRule(s) === 'rooms' || partyView(s).objects.has(o.id)) && openContents(o).length > 0;
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
// With `dm: true` (the DM's screen, on the whole state) every pile in reach, those players are not shown and those
// dropped unseen (`unseen: true`) too.
export function pickUpsFor(s, e, { dm = false } = {}) {
  if (!e) return [];
  const { why, time } = interactionOf(s, e);
  const list = (o) => (dm ? pileContents(o) : openContents(o));
  return s.map.objects.filter((o) => isPile(o) && (dm || objectShown(s.map, o)) && nearObject(s, e, o) && list(o).length).map((o) => ({
    object: o.id, name: objectName(o), items: list(o).map((x) => ({ id: x.id, name: contentName(x), ...(x.item !== undefined ? { pack: x.item } : {}) })), why, time,
    ...(o.by !== undefined ? { unseen: true } : {}),
  }));
}

Object.assign(handlers, {
  // Hand an item to a creature on the same side within 5 ft (a party member, for a player's character).
  // { type: 'pass', actor, item, to } By the actor's controller or the DM. The one taking it must be up and able to.
  pass(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
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
    const e = ent(s, a.actor); control(s, e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const h = holding(e, a.item);
    const sf = under(s.map, e.pos) || fail(`There is nothing under ${e.name} for it to land on.`);
    // Dropped by a creature the party does not know of: onto a pile of its own, which players are not told of until
    // they know who (seePiles); a drop the party may know of never meets it, so nothing about it shows.
    const unseen = unknown(s, e), by = unseen ? e.id : null;
    const there = pileAt(s, sf.level.id, e.pos, by);
    !there || (Array.isArray(there.contents) ? there.contents.length : 0) < PILE_MAX || fail(`${PILE_MAX} things lie there already.`);
    const lit = carriesLit(e, h);
    const time = interaction(s, e);
    together(s, ev, [e.id], () => takeOut(s, e.id, h, ev));
    pay(s, time);
    let o = there;
    if (!o) {
      o = { id: pileId(s, sf.level.id, e.pos, by), def: 'pile', level: sf.level.id, at: { q: e.pos.q, r: e.pos.r }, state: CONTENT.objects.pile.initial, contents: [], ...(by ? { by } : {}) };
      s.map.objects.push(o);
    }
    if (!Array.isArray(o.contents)) o.contents = [];
    let n = 1;
    while (o.contents.some((x) => x?.id === `c${n}`)) n++;
    o.contents.push({ id: `c${n}`, ...(h.spec ? h.spec : { name: h.name }) });
    const seen = !unseen && seesPile(s, o);
    ev.push(gearEv(e.id, h, 'drop', { ...(h.key ? { key: h.key } : {}), object: o.id, taken: true, ...(h.attuned ? { unattuned: true } : {}), ...(seen ? { seen: true } : {}) }));
    leaves(s, e, h, ev);
    ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'drop', ...(there ? {} : { placed: true }), ...(seen ? { seen: true } : {}) });
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
    const e = ent(s, a.actor); control(s, e, ctx);
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
    // Could the party see the pile before this? Then they are told of it even if it is gone after (view.js reads
    // `seen`, since the pile is no longer on the map to look at).
    const seen = seesPile(s, o);
    const gone = new Set(take.map((x) => x.id));
    o.contents = o.contents.filter((x) => !(x && gone.has(x.id)));
    const empty = !pileContents(o).length;
    things.forEach((x, i) => ev.push(gearEv(e.id, x, 'pickup', { ...got[i], object: o.id, ...(empty && seen ? { seen: true } : {}) })));
    ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'pickup', ...(empty ? { gone: true, ...(seen ? { seen: true } : {}) } : {}) });
    if (empty) {
      s.map.objects.splice(s.map.objects.indexOf(o), 1);
      if (s.map.seen?.objects) delete s.map.seen.objects[o.id];
    }
  },
});
