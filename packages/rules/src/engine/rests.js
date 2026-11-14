// Rests, time and rewards (engine.js): rest, shortRest, advanceTime, chronicle, and the rewards of
// a fight (rewards.js).
import { roll } from '../rng.js';
import { CONTENT, SPELLS } from '../content/index.js';
import { lintRecord } from '../content/schema.js';
import { tick } from '../durations.js';
import { rewardActions } from '../rewards.js';
import { attuneProblem, derive, itemName } from '../derive.js';
import { ent, fail, featOf, mod } from './shared.js';
import { heal } from './rolls.js';
import { newProblems, remake, tryLand } from './sheets.js';

// ---------- dawn (DEBT C14, #284) ----------
// The world clock counts minutes from midnight of the first day (scenario.js starts it at 08:00); dawn is
// taken as 06:00 each day. Whenever a rest or advanceTime carries the clock past one or more dawns, every
// magic item on a built character's sheet with `charges.regain` regains that roll of charges for each dawn,
// up to its most (SRD item descriptions: "regains 1d6 + 1 expended charges daily at dawn"). An item with
// charges and no `regain` (the Chime of Opening's ten uses) gets none back. The clock moving in a fight
// (rounds) is not watched, and "once a dawn" uses are not tracked; the DM is told of those
// held (a `manual` for the DM alone).
export const DAWN = 6 * 60;
export const dawnsBetween = (from, to) => Math.max(0, Math.floor((to - DAWN) / 1440) - Math.floor((from - DAWN) / 1440));
function dawn(s, from, ev) {
  const n = dawnsBetween(from, s.clock);
  if (!n) return;
  const daily = [];
  for (const e of Object.values(s.entities)) {
    for (const x of Array.isArray(e.sheet?.items) ? e.sheet.items : []) {
      const def = CONTENT.items[x?.item];
      if (!def) continue;
      if (/once a dawn|until the next dawn/i.test(def.text) && !def.charges) daily.push(`${e.name}'s ${itemName(def, x)}`);
      const c = def.charges;
      if (!c?.regain || x.charges === undefined || x.charges >= c.max) continue;
      const was = x.charges, rolls = [];
      for (let i = 0; i < n && x.charges < c.max; i++) {
        const r = roll(s, c.regain);
        rolls.push(r);
        x.charges = Math.min(c.max, x.charges + r.total);
      }
      const now = x.charges;
      ev.push({ type: 'recharged', id: e.id, key: x.id, item: itemName(def, x), pack: def.id, gained: now - was, charges: now, max: c.max,
        dice: c.regain, rolls: rolls.map((r) => r.total) });
    }
  }
  if (daily.length) ev.push({ type: 'manual', actor: null, name: 'Dawn', partial: true,
    text: `Dawn${n > 1 ? ` (${n} of them)` : ''}: uses that come back once a dawn are the DM's to restore, as the engine does not track them: ${daily.join(', ')}.` });
}

export const handlers = {
  rest(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call a rest.');
    !s.encounter || fail("You can't rest in the middle of a fight.");
    // SRD Long Rest: all Hit Points back, Exhaustion down one level, features recharge. The dead stay
    // dead, other conditions stay, and a creature at 0 Hit Points can't start one. Temporary Hit
    // Points end. The party rests; `ids` names who rests instead (the DM resting monsters too),
    // and a monster's uses per day and spent recharges come back.
    let who = Object.values(s.entities).filter((x) => x.side === 'party' && !x.dead);
    if (a.ids !== undefined) {
      (Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 500) || fail('Name who rests.');
      who = [...new Set(a.ids)].map((id) => ent(s, id)).filter((x) => !x.dead);
    }
    for (const e of who) {
      if (e.hp <= 0) {
        if (e.cond.stable) heal(s, e, 1, ev);                               // a Stable creature regains 1 HP after 1d4 hours
        else ev.push({ type: 'manual', actor: e.id, name: 'Long Rest', text: `${e.name} is dying at 0 Hit Points and can't take a Long Rest. The DM settles its Death Saving Throws.` });
        continue;
      }
      Object.assign(e, { hp: e.maxHp, death: { s: 0, f: 0 }, slots: { ...e.slotsMax } });
      e.uses.secondWind = e.features.secondWind || 0;
      for (const f of e.feats ?? []) if (f.uses) e.uses[f.id] = f.uses.max;   // every feature with uses
      for (const f of e.feats ?? []) if (f.relentless) delete e.uses[f.id];   // Relentless Rage's DC is 10 again
      for (const f of e.feats ?? []) if (f.overchannel) delete e.uses[f.id];  // Overchannel is free again
      if (e.hitDie) e.hd = e.level;                                        // and all spent Hit Point Dice
      if (e.hitDice) e.hdBy = { ...e.hitDice };
      if (e.tempHp) { e.tempHp = 0; delete e.tempFx; }
      delete e.charges; delete e.spent;                                    // a monster's daily uses and spent recharges
      const ex = e.cond.exhaustion;
      if (ex && (ex.level ?? 1) > 1) { ex.level = (ex.level ?? 1) - 1; ev.push({ type: 'cond', id: e.id, cond: 'exhaustion', level: ex.level }); }
      else if (ex) { delete e.cond.exhaustion; ev.push({ type: 'condEnd', id: e.id, cond: 'exhaustion' }); }
    }
    const from = s.clock;
    s.clock += 480;
    ev.push({ type: 'rest' });
    dawn(s, from, ev);
    tick(s, ev);
  },
  // SRD Short Rest: an hour. { type: 'shortRest', ids?, spend?: { id: n }, recover?: { id: [slot levels] } }
  // Each who rests (the party when `ids` is not given) can spend Hit Point Dice (`spend`): each rolls
  // the die + Constitution modifier, at least 1. Features that come back on a Short Rest do; those
  // that come back on a Long Rest with some back on a Short Rest regain those; Pact Magic slots come
  // back; and a feature that recovers spell slots on a Short Rest (Arcane Recovery) takes `recover`.
  shortRest(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call a rest.');
    !s.encounter || fail("You can't rest in the middle of a fight.");
    let who = Object.values(s.entities).filter((x) => x.side === 'party' && !x.dead);
    if (a.ids !== undefined) {
      (Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 500) || fail('Name who rests.');
      who = [...new Set(a.ids)].map((id) => ent(s, id)).filter((x) => !x.dead);
    }
    const spend = a.spend ?? {}, recover = a.recover ?? {};
    (spend && typeof spend === 'object' && recover && typeof recover === 'object') || fail('Say how many Hit Point Dice each spends.');
    // Everything is checked before anything changes.
    for (const [id, n] of Object.entries(spend)) {
      const e = ent(s, id);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      (Number.isInteger(n) && n >= 0) || fail('Spend a whole number of Hit Point Dice.');
      n <= (e.hd ?? 0) || fail(`${e.name} has ${e.hd ?? 0} Hit Point Dice left.`);
      e.hp > 0 || fail(`${e.name} is at 0 Hit Points and can't take a Short Rest.`);
    }
    // `restore`: those who use a feature that gives points back on a Short Rest (Sorcerous Restoration:
    // `restore: { of, max }`), regaining what was spent up to its most, for one of its uses.
    const restore = a.restore ?? [];
    Array.isArray(restore) || fail('Name who restores points.');
    new Set(restore).size === restore.length || fail('Name each creature that restores points once.');
    const refills = restore.map((id) => {
      const e = ent(s, id), f = (e.feats ?? []).find((x) => x.restore && (e.uses[x.id] ?? 0) > 0);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      f || fail(`${e.name} has nothing that restores points now.`);
      return { e, f };
    });
    const plans = [];
    for (const [id, levels] of Object.entries(recover)) {
      const e = ent(s, id), f = (e.feats ?? []).find((x) => x.recover && (e.uses[x.id] ?? 0) > 0);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      f || fail(`${e.name} has nothing that recovers spell slots now.`);
      (Array.isArray(levels) && levels.length > 0 && levels.every((l) => Number.isInteger(l) && l >= 1 && l <= f.recover.max)) || fail(`${f.name} recovers slots of level 1 to ${f.recover.max}.`);
      const most = Math.ceil(e.level / 2), total = levels.reduce((t, l) => t + l, 0);
      total <= most || fail(`${f.name} recovers ${most} levels of slots at most; that is ${total}.`);
      for (const l of new Set(levels)) levels.filter((x) => x === l).length <= (e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0) || fail(`${e.name} hasn't spent that many level ${l} slots.`);
      plans.push({ e, f, levels });
    }
    for (const e of who) {
      if (e.hp <= 0) { ev.push({ type: 'manual', actor: e.id, name: 'Short Rest', text: `${e.name} is at 0 Hit Points and can't take a Short Rest.` }); continue; }
      for (let i = 0; i < (spend[e.id] ?? 0); i++) {
        e.hd--;
        // Of Hit Dice of several sizes, the largest left first: the one a player would spend.
        const size = e.hdBy ? Math.max(...Object.keys(e.hdBy).filter((d) => e.hdBy[d] > 0).map(Number)) : e.hitDie;
        if (e.hdBy) e.hdBy[size]--;
        const r = roll(s, `1d${size}`);
        heal(s, e, Math.max(1, r.total + mod(e.abil.con)), ev, { dice: r.dice, bonus: mod(e.abil.con), by: e.id });
      }
      for (const f of e.feats ?? []) {
        if (f.relentless) delete e.uses[f.id];                              // Relentless Rage's DC is 10 again
        if (!f.uses) continue;
        if (f.uses.recharge === 'short') e.uses[f.id] = f.uses.max;
        else if (f.uses.short) e.uses[f.id] = Math.min(f.uses.max, (e.uses[f.id] ?? 0) + f.uses.short);
      }
      if (e.features?.secondWind && !e.feats) e.uses.secondWind = Math.min(e.features.secondWind, (e.uses.secondWind ?? 0) + 1);   // SRD: one use back
      if (e.pact) e.slots = { ...e.slotsMax };
      // Tireless: Exhaustion, if any, decreases by 1.
      const ex = e.cond.exhaustion;
      if (ex && (e.feats ?? []).some((f) => f.restExhaustion === 'short')) {
        if ((ex.level ?? 1) > 1) { ex.level = (ex.level ?? 1) - 1; ev.push({ type: 'cond', id: e.id, cond: 'exhaustion', level: ex.level }); }
        else { delete e.cond.exhaustion; ev.push({ type: 'condEnd', id: e.id, cond: 'exhaustion' }); }
      }
    }
    for (const { e, f, levels } of plans) {
      e.uses[f.id]--;
      for (const l of levels) e.slots[l]++;
      ev.push({ type: 'std', id: e.id, action: `${f.name} (${levels.map((l) => `level ${l}`).join(', ')})` });
    }
    for (const { e, f } of refills) {
      const pool = featOf(e, f.restore.of), gain = pool ? Math.min(f.restore.max, pool.uses.max - (e.uses[pool.id] ?? 0)) : 0;
      e.uses[f.id]--;
      if (pool) e.uses[pool.id] = (e.uses[pool.id] ?? 0) + gain;
      ev.push({ type: 'std', id: e.id, action: `${f.name} (${gain} point${gain === 1 ? '' : 's'})` });
    }
    // Attunement (SRD): each resting character with an item it chose to attune to (or end its Attunement to) at
    // this rest. Worked out on a copy first; one that cannot be made (a fourth item, a second copy, a prerequisite
    // not met, at 0 Hit Points, in a form) fails with the reason and changes nothing.
    for (const e of who) {
      const at = e.sheet?.attuning;
      if (!at) continue;
      const sheet = structuredClone(e.sheet), x = (sheet.items ?? []).find((y) => y.id === at.item);
      delete sheet.attuning;
      if (!x) { e.sheet = sheet; continue; }
      const def = CONTENT.items[x.item], name = itemName(def, x);
      if (at.end) delete x.attuned; else x.attuned = true;
      const why = e.hp <= 0 ? `${e.name} is at 0 Hit Points.` : e.form ? `${e.name} is in a form.` : (at.end ? null : attuneProblem(sheet, def))
        ?? newProblems(e.sheet, sheet)[0] ?? lintRecord(derive(sheet).record, { spells: SPELLS })[0] ?? null;
      if (why) { delete e.sheet.attuning; ev.push({ type: 'attuned', id: e.id, key: x.id, item: name, ...(at.end ? { end: true } : {}), failed: why }); continue; }
      remake(s, e, derive(sheet).record, sheet, ev);
      ev.push({ type: 'attuned', id: e.id, key: x.id, item: name, ...(at.end ? { end: true } : {}) });
    }
    const from = s.clock;
    s.clock += 60;
    ev.push({ type: 'rest', short: true });
    dawn(s, from, ev);
    tick(s, ev);
  },
  advanceTime(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can advance time.');
    !s.encounter || fail('Time moves in rounds during a fight.');
    a.minutes > 0 || fail('Time only moves forward.');
    const from = s.clock;
    s.clock += a.minutes;
    ev.push({ type: 'time', minutes: a.minutes });
    dawn(s, from, ev);
    tick(s, ev);
  },
  chronicle(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can write to the chronicle.');
    String(a.title || '').trim() || fail('Give the event a title.');
    ev.push({ type: 'chronicle', title: String(a.title).trim(), text: a.text || '', tags: a.tags || [] });
  },
  // Rewards at the end of a fight: conclusion { edit | publish | skip } (rewards.js).
  ...rewardActions(fail, tryLand),
};

