// Class features and ability checks (engine.js): secondWind, feature (with Font of Magic and
// Wild Shape), use (objects), check, search and hide, and watching for hidden creatures.
import { gridOf, col } from '../grid.js';
import { d20Faces, die, roll } from '../rng.js';
import { CONTENT, MONSTER_ACTIONS, MONSTERS } from '../content/index.js';
import { ABILITIES, SKILLS } from '../content/schema.js';
import { begin, sharedRolls, walk as walkSteps } from '../effects.js';
import { leaveForm, takeForm } from '../forms.js';
import { breakConcentration, effectsOf, endEffect, startEffect, turnKey, useUp } from '../durations.js';
import { apart, FT, ground, overlapAt, STEP_MAX } from '../space.js';
import { canSee, coverOf, hiddenFrom, sees } from '../sight.js';
import { barriers, distToSegment, objectDef, objectSegment } from '../walls.js';
import { conditionName, conditionPhrase, incapacitatedBy, modifiers, speedOf } from '../modifiers.js';
import { able, actTime, control, current, ent, fail, featOf, fleetFree, hostile, inFight, living, mod, need, rollDice, spellStats, up, walled } from './shared.js';
import { instruction, reactionsOf } from '../reactions.js';
import { aimAction, findable, findDC, fitsOn, objectName, objectOf, objectShown, SEARCH_FEET, setObject, unhide } from './world.js';
import { boundEffect, checkBonus, heal, passive, settle, tempHp } from './rolls.js';
import { checkEnd, objectEffects, resolve } from './resolve.js';

// Close enough to use it: beside a door's line, or on or next to a thing's hex, on its level.
function nearObject(s, e, o) {
  const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[col(o.at)]?.h ?? 0);
  if (!ground(s.map, e.pos) || Math.abs(e.pos.z - z) > STEP_MAX) return false;
  const seg = objectSegment(o), G = gridOf(s.map);
  return seg ? distToSegment(G.center(e.pos), seg) <= FT + 1e-9 : G.dist(e.pos, o.at) <= 1;     // within 5 ft
}
const hasKey = (e, key) => e.gear.some((g) => String(g).toLowerCase() === key.toLowerCase());

// What this creature could do right now with the objects in reach: [{ object, name, verb, label, time, why }].
export function usesFor(s, e) {
  const out = [];
  if (!e || !up(e)) return out;
  for (const o of s.map.objects) {
    if (!nearObject(s, e, o) || !objectShown(s.map, o)) continue;
    for (const u of objectDef(o).use) {
      if (!u.from.includes(o.state) || (u.key && !o.key)) continue;         // a door with no lock offers no locking
      let why = '';
      const stopped = incapacitatedBy(e);
      if (stopped) why = `${e.name} is ${stopped} and can't act.`;
      else if (s.encounter && inFight(s, e.id)) {
        if (current(s) !== e.id) why = `It isn't ${e.name}'s turn.`;
        else if (!(u.time === 'free' && !s.encounter.flags.interact) && s.encounter.budget.action < 1) why = `${e.name} has already used an action this turn.`;
      }
      if (!why && u.key && !hasKey(e, o.key)) why = `${e.name} doesn't have the key.`;
      out.push({ object: o.id, name: objectName(o), verb: u.id, label: u.name, time: u.time, why });
    }
  }
  return out;
}

// ---------- hiding (the SRD's Hide action) ----------
// `hiding: { dc }` is a creature that took the Hide action: it has the Invisible condition against
// its enemies (sight.js, hiddenFrom), and `dc` is its Stealth total, the DC to find it. By the SRD it
// stops being hidden when it makes an attack roll, casts a spell with a Verbal component, makes a
// sound louder than a whisper (the DM's call, by the `reveal` action) or an enemy finds it.
// Design: docs/specs/sight.md, decision 5.
export const HIDE_DC = 15;
// Why this creature can't take the Hide action where it is ('' if it can). The SRD: it must be
// Heavily Obscured or behind Three-Quarters or Total Cover, and out of any enemy's line of sight.
// It is judged against the enemies it can see itself ("if you can see a creature, you can discern
// whether it can see you"); one it cannot see, but that sees it, finds it at once (spotter).
export function hideProblem(s, e) {
  if (e.hiding) return `${e.name} is already hidden.`;
  for (const o of living(s)) {
    if (!up(o) || !hostile(o, e) || canSee(s, e, o) === 'no') continue;
    const cover = coverOf(s, o, e);
    if (cover === 'threeQuarters' || cover === 'total') continue;
    const w = sees(s, o, e, { ignoreHiding: true });
    if (w.see !== 'no') return `${o.name} can see ${e.name}.`;
    if (w.why !== 'dark' && w.why !== 'out of sight' && w.why !== 'obscured') return `${e.name} is neither Heavily Obscured nor behind cover from ${o.name}.`;
  }
  return '';
}
// An enemy that can see this creature where it stands, not counting its hiding, with less than Three-Quarters Cover.
const spotter = (s, e) => living(s).find((o) => up(o) && hostile(o, e) && canSee(s, o, e, { ignoreHiding: true }) !== 'no' && !['threeQuarters', 'total'].includes(coverOf(s, o, e))) ?? null;
// After every action: an enemy that can see a hiding creature anyway (Blindsight, Truesight) has
// found it, and with the table rule passiveFind 'all' so has one whose passive Perception meets
// its DC and that has it in view; Lightly Obscured (Dim Light) costs that 5.
export function watch(s, ev) {
  initiativeFeatures(s, ev);
  for (const h of living(s)) {
    if (!h.hiding) continue;
    for (const o of living(s)) {
      if (!up(o) || !hostile(o, h)) continue;
      if (canSee(s, o, h) !== 'no') { unhide(s, h, ev, 'found', o); break; }
      if (s.settings.passiveFind !== 'all') continue;
      const w = canSee(s, o, h, { ignoreHiding: true });
      if (w !== 'no' && passive(s, o, 'perception', w === 'dim' ? ['dim light'] : []) >= h.hiding.dc) { unhide(s, h, ev, 'found', o); break; }
    }
  }
}
// After an action in which creatures rolled Initiative (a fight began, or they joined one): their
// features used on rolling Initiative (`initiative`: Persistent Rage, Uncanny Metabolism, Perfect
// Focus). Each gives back uses of the feature it names (all, or `upTo` so many) and, with `heal`,
// Hit Points. One with uses of its own spends one, only when it gives something back, and only by its
// standing instruction (reactions.js: `always`, the default, or `never`). `unless`: not if that one
// was used now. Those with uses go first.
function initiativeFeatures(s, ev) {
  const ids = [];
  for (const x of ev) { if (x.type === 'encounterStart') ids.push(...x.order.map((o) => o.id)); else if (x.type === 'joined') ids.push(x.id); }
  for (const id of ids) {
    const e = s.entities[id];
    if (!e?.feats || e.dead) continue;
    const used = new Set(), mine = reactionsOf(e);
    for (const f of e.feats.filter((x) => x.initiative).sort((a, b) => !!b.uses - !!a.uses)) {
      const x = f.initiative, pool = featOf(e, x.regain);
      if (!pool?.uses || (x.unless && used.has(x.unless))) continue;
      if (f.uses && ((e.uses[f.id] ?? 0) < 1 || instruction(e, mine.find((r) => r.id === f.id)) === 'never')) continue;
      const have = e.uses[pool.id] ?? 0, to = Math.max(have, Math.min(pool.uses.max, x.upTo ?? pool.uses.max));
      const hurt = !!x.heal && !e.dead && e.hp < e.maxHp;
      if (to <= have && !hurt) continue;                                 // nothing to give back: the use is kept
      e.uses[pool.id] = to;
      if (f.uses) e.uses[f.id]--;
      used.add(f.id);
      ev.push({ type: 'std', id: e.id, action: `${f.name}: ${pool.name} ${to - have ? `+${to - have} (${to})` : 'already full'}` });
      if (hurt) { const r = roll(s, x.heal); heal(s, e, Math.min(r.total, e.maxHp - Math.max(0, e.hp)), ev, { ...r, by: e.id }); }
    }
  }
}

// `dimToo` also works out the total with Disadvantage for Dim Light from the same dice, as `dimTotal`
// (Search uses it for what it can see only dimly); it is not part of what is shown.
function abilityCheck(s, e, what, dimToo = false) {
  const ability = what.ability ?? SKILLS[what.skill];
  // Whether the check uses one of its skill or tool proficiencies (Reliable Talent); a monster's listed skill bonus counts as one.
  const proficient = !!((what.skill && (e.skills?.includes(what.skill) || e.skillBonus?.[what.skill] !== undefined)) || (what.tool && e.tools?.includes(what.tool)));
  const m = modifiers(s, e, 'check', { target: e, ability, proficient, ...(what.skill ? { skill: what.skill } : {}) }, ''), bonus = checkBonus(e, what) + m.add;
  if (m.autoFail) return { roll: 0, total: 0, bonus };
  // SRD Tool Proficiency: proficient with the tool and in the skill used with it gives Advantage too.
  if (what.tool && what.skill && e.tools?.includes(what.tool) && e.skills?.includes(what.skill)) m.advantage = [...m.advantage, 'tool and skill'];
  const mode = m.advantage.length && !m.disadvantage.length ? 'adv' : m.disadvantage.length && !m.advantage.length ? 'dis' : 'normal';
  const dimMode = !dimToo ? 'normal' : m.advantage.length ? 'normal' : 'dis';
  // Reliable Talent: each d20 under its `floor` counts as it.
  const lift = (d) => (d !== null && m.floor !== null ? Math.max(d, m.floor) : d), raw1 = die(s, 20), raw2 = mode === 'normal' && dimMode === 'normal' ? null : die(s, 20);
  const r1 = lift(raw1), r2 = lift(raw2), floored = m.floor !== null && (raw1 < m.floor || (raw2 !== null && raw2 < m.floor));
  const pickOf = (md) => (md === 'adv' ? Math.max(r1, r2) : md === 'dis' ? Math.min(r1, r2) : r1), r = pickOf(mode);
  const more = rollDice(s, m.dice);
  if (m.used.length) useUp(s, [], m.used);
  // The dice are the faces rolled; `roll` is the d20 as it counts, and `floor.was` what it showed.
  const shown = pickOf(mode) === r1 ? raw1 : raw2;
  return { roll: r, total: r + bonus + more.total, bonus, dice: [...d20Faces(raw1, mode === 'normal' ? null : raw2, shown), ...more.dice], ...(floored ? { floor: { name: m.floorBy, value: m.floor, was: shown } } : {}), ...(mode === 'normal' ? {} : { rolls: [r1, r2], mode, why: mode === 'adv' ? m.advantage : m.disadvantage }), ...(more.extra.length ? { extra: more.extra } : {}),
    ...(dimToo ? { dimTotal: pickOf(dimMode) + bonus + more.total } : {}) };
}
const slug = (x) => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hasTool = (e, tool) => e.gear.some((g) => slug(g) === tool);
const toolName = (tool) => (tool === 'thieves-tools' ? "Thieves' Tools" : tool.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));

export const handlers = {
  secondWind(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.uses.secondWind > 0 || fail(`${e.name} has no uses of Second Wind left.`);
    need(s, e, 'bonus');
    e.hp < e.maxHp || fail(`${e.name} is already at full Hit Points.`);
    if (s.encounter) s.encounter.budget.bonus--;
    e.uses.secondWind--;
    ev.push({ type: 'std', id: e.id, action: 'Second Wind' });
    const r = roll(s, `1d10+${e.level}`);
    heal(s, e, r.total, ev, { ...r, by: e.id });
  },
  // Use a feature of a built character (derive.js): { type: 'feature', actor, feature, target? |
  // targets? | hex?, amount? }. What it does is its data: effect steps (on the effect runner, a
  // lasting effect if it has a duration), an extra action or attacks (`gain`), or a pool of healing
  // (`pool`, `amount` from it). A feature with uses and no action of its own is spent, and its text
  // goes to the DM, who applies it. Costs: the action or Bonus Action, and a use of its own or of
  // another feature (`cost`).
  feature(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const f = featOf(e, a.feature) || fail(`${e.name} has no such feature.`);
    // A screen that does not yet send the choice a feature needs (a mode, a form, a slot to make or
    // spend) still spends what it costs and hands the rest to the DM, as before these were built.
    if (f.exchange && (a.make !== undefined || a.spend !== undefined)) return exchange(s, e, f, a, ev);
    // A feature that casts a spell (Divine Intervention) is used by casting: `cast` with `via`.
    (!f.freeCast || f.action) || fail(`${f.name} casts a spell: cast the spell through it (cast with via "${f.id}").`);
    // A feature used on rolling Initiative (Persistent Rage) is spent then, never by hand.
    (!f.initiative || f.action) || fail(`${f.name} is used when ${e.name} rolls Initiative.`);
    const act = f.action ?? (f.uses ? { time: 'free', target: { self: true }, effects: [{ manual: `${f.name}: ${f.text}` }] } : null);
    act || fail(`${f.name} is always on; there is nothing to use.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    act.time !== 'reaction' || fail(f.reaction ? `${f.name} is a Reaction, taken by ${e.name}'s standing instruction for it.` : `${f.name} is a Reaction. The engine does not take that reaction yet; the DM applies it.`);
    if (act.form && (a.form !== undefined || e.form)) return shapeShift(s, e, f, act, a, ev);
    const enc = s.encounter, fighting = !!enc && inFight(s, e.id), time = act.time === 'free' ? null : act.time;
    if (act.unless === 'heavy' && e.armour === 'heavy') fail(`${e.name} can't use ${f.name} while wearing Heavy armor.`);
    // A feature that only takes other actions (Patient Defense below level 10) does nothing outside a fight.
    if (act.acts && !fighting && !(act.effects ?? []).length) fail(`${f.name} only matters in a fight.`);
    // A Rage already going is extended by its Bonus Action, without spending a use.
    const live = act.renew ? effectsOf(s).find((fx) => fx.source === e.id && fx.feature === f.id) : null;
    if (live) {
      fighting || fail(`${e.name}'s ${f.name} is already going.`);
      // Persistent Rage: it lasts without being extended, so there is nothing to extend.
      live.parts.some((p) => !p.ended && p.ends?.on === 'turnEnd') || fail(`${e.name}'s ${f.name} is already going, and lasts without being extended.`);
      need(s, e, time);
      enc.budget[time]--;
      const now = turnKey(s);
      for (const p of live.parts) if (!p.ended && p.ends?.on === 'turnEnd') p.born = now;
      return ev.push({ type: 'std', id: e.id, action: `${f.name} (extended)` });
    }
    let res = act.cost?.resource ?? (f.uses ? f.id : null), n = act.cost?.n ?? 1;
    // `orCost`: with none of its own uses left, it may be paid for from another pool instead
    // (Dragon Wings for 3 Sorcery Points; Innate Sorcery for 2 with Sorcery Incarnate).
    if (res && !act.pool && (e.uses[res] ?? 0) < n && act.orCost && (e.uses[act.orCost.resource] ?? 0) >= act.orCost.n) { res = act.orCost.resource; n = act.orCost.n; }
    // `orSlot` (Hurl Through Hell): with its use spent, a Pact Magic slot of the level `a.slot` names restores it.
    let slotPaid = null;
    if (act.orSlot && a.slot !== undefined) {
      (e.uses[res] ?? 0) < n || fail(`${e.name} has a use of ${f.name} left; a spell slot restores it only once it is spent.`);
      (e.pact && Number.isInteger(a.slot) && (e.slots?.[a.slot] ?? 0) > 0) || fail(`${e.name} has no Pact Magic slot of level ${a.slot} to spend.`);
      slotPaid = a.slot; res = null;
    } else if (a.slot !== undefined) fail(`${f.name} is not paid for with a spell slot.`);
    if (res && !act.pool) (e.uses[res] ?? 0) >= n || fail(`${e.name} has no uses of ${featOf(e, res)?.name ?? res} left.${act.orSlot && e.pact ? ' A Pact Magic slot can restore it: name the slot.' : ''}`);
    // Fleet Step: Step of the Wind right after another Bonus Action, without one of its own.
    const free = time === 'bonus' && fighting && fleetFree(s, e, f.id);
    if (time && fighting) need(s, e, free ? null : time);
    if ((act.gain || act.firstAttack) && !(fighting && current(s) === e.id)) fail(`${f.name} is used on ${e.name}'s turn in a fight.`);
    if (act.firstAttack) {
      !enc.flags[`attacked:${e.id}`] || fail(`${f.name} is decided before the first attack roll of the turn.`);
      !enc.flags[`${f.id}:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
    }
    if (act.gain?.action) !enc.flags[`surge:${e.id}`] || fail(`${f.name} can be used once a turn.`);
    if (act.gain?.attacks && enc.budget.bonusAttacks) fail(`${e.name} already has those attacks to make.`);
    // A pool of healing (Lay On Hands): `amount` Hit Points from what is left, to a creature in
    // reach; and with `cure`, conditions to remove from it at the pool's cost each (`a.cure`, a list).
    let poolTarget = null, amount = 0, cures = [];
    if (act.pool) {
      poolTarget = ent(s, a.target ?? e.id);
      !poolTarget.dead || fail(`${poolTarget.name} is dead.`);
      if (poolTarget.id !== e.id) { apart(s, e, poolTarget) * FT <= (act.target.creature.reach ?? 5) || fail(`${poolTarget.name} is out of reach.`); walled(s, e, poolTarget); }
      if (a.cure !== undefined) {
        (Array.isArray(a.cure) && a.cure.length && new Set(a.cure).size === a.cure.length) || fail(`Name the conditions ${f.name} removes.`);
        for (const c of a.cure) {
          act.cure?.conditions.includes(c) || fail(`${f.name} can't remove ${conditionName(c)}.`);
          poolTarget.cond[c] || fail(`${poolTarget.name} ${conditionPhrase(c).replace(/^is /, 'is not ').replace(/^has /, 'does not have ')}.`);
        }
        cures = a.cure;
      }
      amount = a.amount ?? 0;
      (Number.isInteger(amount) && amount >= 0 && (amount > 0 || cures.length)) || fail(`Say how many Hit Points ${f.name} restores.`);
      const cost = amount + cures.length * (act.cure?.cost ?? 0);
      cost <= (e.uses[res] ?? 0) || fail(`${f.name} has ${e.uses[res] ?? 0} Hit Points left.`);
    }
    // A feature with `modes` does one of several things, named by `a.mode` (Divine Spark: heal, or radiant or necrotic harm).
    const mode = act.modes && a.mode !== undefined ? act.modes.find((m) => m.id === a.mode) || fail(`Choose what ${f.name} does: ${act.modes.map((m) => m.name).join(', ')}.`) : null;
    const byHand = (act.modes && !mode) || act.form ? [{ manual: `${f.name}: ${f.text} (No choice was sent, so the DM applies it.)` }] : null;
    const aimed = act.gain || act.pool ? null : aimAction(s, e, { name: f.name, target: act.target, effects: byHand ?? (mode ? mode.effects : act.effects) }, a);
    if (aimed?.targets && fighting) for (const t of aimed.targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    // `after: 'hit'` (Hurl Through Hell): on a creature this one hit with an attack roll this turn, once a turn.
    if (act.after === 'hit') {
      fighting || fail(`${f.name} follows a hit in a fight.`);
      for (const t of aimed.targets ?? []) enc.flags[`hit:${e.id}:${t.id}`] || fail(`${f.name} follows a hit: ${e.name} has not hit ${t.name} with an attack roll this turn.`);
      !enc.flags[`after:${f.id}:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
    }
    // A die handed to another creature to spend later (Bardic Inspiration: "A creature can have only one
    // Bardic Inspiration die at a time"): not to one that still holds one from this feature, whoever gave it.
    const gives = act.duration && (act.effects ?? []).some((st) => st.modifier?.uses !== undefined);
    if (gives && aimed?.targets) for (const t of aimed.targets) {
      const holds = effectsOf(s).some((fx) => fx.feature === f.id && fx.parts.some((p) => p.target === t.id && !p.ended && p.modifier?.uses !== undefined));
      !holds || fail(`${t.name} already has a ${f.name} die.`);
    }

    // Paid for: from here it happens.
    if (time && fighting) { if (free) enc.flags[`fleet:${e.id}`] = true; else enc.budget[time]--; if (time === 'bonus') enc.flags[`used:${f.id}:${e.id}`] = true; }
    if (res) e.uses[res] -= act.pool ? amount + cures.length * (act.cure?.cost ?? 0) : n;
    if (slotPaid !== null) { e.slots[slotPaid]--; ev.push({ type: 'std', id: e.id, action: `${f.name}: restored with a level ${slotPaid} Pact Magic slot` }); }
    if (act.after === 'hit') enc.flags[`after:${f.id}:${e.id}`] = true;
    if (act.firstAttack) enc.flags[`${f.id}:${e.id}`] = true;
    if (act.pool) {
      ev.push({ type: 'std', id: e.id, action: f.name });
      for (const c of cures) { delete poolTarget.cond[c]; ev.push({ type: 'condEnd', id: poolTarget.id, cond: c }); }
      return amount > 0 ? heal(s, poolTarget, Math.min(amount, poolTarget.maxHp - Math.max(0, poolTarget.hp)), ev) : undefined;
    }
    if (act.gain?.action) {                                             // Action Surge: one more action, not a Magic action
      enc.budget.action++; enc.flags[`surge:${e.id}`] = true;
      return ev.push({ type: 'std', id: e.id, action: f.name });
    }
    if (act.gain?.attacks) {                                            // Flurry of Blows: so many attacks with one attack
      enc.budget.bonusAttacks = { with: act.gain.attacks.with, left: act.gain.attacks.n };
      return ev.push({ type: 'std', id: e.id, action: f.name });
    }
    // Movement that comes with starting this feature in a fight (Instinctive Pounce with Rage): half its Speed.
    const pounce = fighting && (e.feats ?? []).find((x) => x.moveWith?.of === f.id);
    const feet = pounce ? Math.floor(speedOf(s, e) / 2 / FT) * FT : 0;
    if (feet > 0) {                                                     // at Speed 0 there is nothing to add or to say
      enc.budget.move += feet;
      ev.push({ type: 'std', id: e.id, action: `${pounce.name} (${feet} ft)` });
    }
    if (act.noSpells) breakConcentration(s, ev, e.id, `${e.name} entered ${f.name}`);
    // Actions the feature's action also takes (Patient Defense: Disengage and Dodge; Step of the Wind: Disengage and Dash).
    if (fighting) for (const x of act.acts ?? []) {
      if (x === 'dodge') e.cond.dodging = {};
      else if (x === 'disengage') e.cond.disengaged = {};
      else if (x === 'dash') { enc.budget.move += speedOf(s, e); enc.budget.dashes = (enc.budget.dashes | 0) + 1; }
    }
    const steps = structuredClone(byHand ?? (mode ? mode.effects : act.effects)), targets = aimed.targets;
    if (!steps.length) return ev.push({ type: 'std', id: e.id, action: f.name });     // nothing more (Patient Defense below level 10)
    let fx = null;
    if (act.duration && act.duration !== 'instant') {
      fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: act.duration });
      Object.assign(fx, { feature: f.id, ...(act.renew ? { renew: true } : {}), ...(act.noSpells ? { noSpells: true } : {}), ...(act.endsWhenIncapacitated ? { fragile: true } : act.endsOn ? { fragile: act.endsOn } : {}) });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: (targets ?? []).map((t) => t.id) });
    } else fx = boundEffect(s, f.name, e.id, steps);
    if (!('attack' in steps[0])) ev.push({ type: 'std', id: e.id, action: f.name });
    const st = e.castAbil ? spellStats(e, s) : null;
    // A feature's own save DC (Intimidating Presence: 8 + Strength + Proficiency) is also the DC of a
    // save that ends what it did; a feature whose save has none uses the spell save DC.
    let own;
    walkSteps(steps, (x) => { if (own === undefined && 'save' in x && typeof x.dc === 'number') own = x.dc; });
    begin(s, { steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
      src: { name: f.name, ...(st ? { dc: st.dc, attack: st.attack } : {}), ...(own !== undefined ? { dc: own } : {}), healMod: mod(e.abil[e.castAbil] ?? 10), ...(fx ? { fx: fx.id } : {}) },
      // Damage an area feature deals is rolled once for everyone in it (Sear Undead), as a spell's is.
      shared: aimed.hexes ? sharedRolls(s, steps) : null });
    resolve(s, ev);
    if (fx?.bound) settle(s, ev, fx, targets ?? []);
    checkEnd(s, ev);
  },

  // Do something with an object in reach: open a door, pull a lever. { type: 'use', actor, object, verb }
  use(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const o = objectOf(s, a.object, ctx), def = objectDef(o), name = objectName(o), the = `The ${name.toLowerCase()}`;
    const u = def.use.find((x) => x.id === a.verb) || fail(`${the} can't be used that way.`);
    nearObject(s, e, o) || fail(`${e.name} is too far from the ${name.toLowerCase()}.`);
    u.from.includes(o.state) || fail(`${the} is ${def.states[o.state].name}.`);
    if (u.key) {
      o.key || fail(`${the} has no lock.`);
      hasKey(e, o.key) || fail(`${e.name} doesn't have the key.`);
    }
    if (u.check?.tool) hasTool(e, u.check.tool) || fail(`${e.name} needs ${toolName(u.check.tool)} for that.`);
    // In a fight the first thing handled on a turn is free; anything more, or anything slow, takes the action.
    if (s.encounter && inFight(s, e.id)) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      if (u.time === 'free' && !s.encounter.flags.interact) s.encounter.flags.interact = true;
      else { need(s, e, 'action'); s.encounter.budget.action--; }
    }
    if (u.check) {
      const c = u.check, dc = o.dc?.[u.id] ?? c.dc, r = abilityCheck(s, e, c);
      ev.push({ type: 'check', id: e.id, ability: c.ability, ...(c.skill ? { skill: c.skill } : {}), ...(c.tool ? { tool: c.tool } : {}), ...r, dc, success: r.total >= dc, what: `${u.name}: ${name}` });
      if (r.total < dc) return;
    }
    if (u.to) setObject(s, o, u.to, ev, e, u.id);
    if (u.effects) objectEffects(s, o, u.effects, [e], ev);
  },

  // Roll an ability check. { type: 'check', actor, skill | ability, dc? } Only the DM may set a DC,
  // and players are told neither the DC nor whether the roll met it: the DM says what happens.
  check(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    const skill = a.skill === undefined ? null : (Object.hasOwn(SKILLS, a.skill) && a.skill) || fail('Unknown skill.');
    const ability = skill ? SKILLS[skill] : (ABILITIES.includes(a.ability) && a.ability) || fail('Name a skill or an ability.');
    if (a.dc !== undefined) {
      ctx.role === 'dm' || fail('Only the DM sets a DC.');
      (Number.isInteger(a.dc) && a.dc > 0 && a.dc <= 40) || fail('A DC is a whole number from 1 to 40.');
    }
    const r = abilityCheck(s, e, { ability, skill });
    ev.push({ type: 'check', id: e.id, ability, ...(skill ? { skill } : {}), ...r, ...(a.dc !== undefined ? { dc: a.dc, success: r.total >= a.dc, secret: true } : {}) });
  },
  // The Search action: one Wisdom (Perception) check against everything hidden within 15 feet, and
  // against every enemy hiding where the searcher could see it but for its hiding (its Stealth total
  // is the DC; in Dim Light the check has Disadvantage). { type: 'search', actor }
  search(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (s.encounter && inFight(s, e.id)) { need(s, e, 'action'); s.encounter.budget.action--; }
    const hiders = living(s).filter((o) => hiddenFrom(o, e)).map((o) => ({ o, w: canSee(s, e, o, { ignoreHiding: true }) })).filter((x) => x.w !== 'no');
    const r = abilityCheck(s, e, { skill: 'perception' }, hiders.some((x) => x.w === 'dim')), dimTotal = r.dimTotal;
    delete r.dimTotal;
    const found = s.map.objects.filter((o) => findable(s, e, o, SEARCH_FEET) && findDC(o) <= r.total);
    const spotted = hiders.filter((x) => (x.w === 'dim' ? dimTotal : r.total) >= x.o.hiding.dc).map((x) => x.o);
    ev.push({ type: 'check', id: e.id, ability: 'wis', skill: 'perception', ...r, search: true, found: found.length + spotted.length });
    for (const o of found) setObject(s, o, objectDef(o).find.to, ev);
    for (const o of spotted) unhide(s, o, ev, 'found', e);
  },
  // The Hide action: a DC 15 Dexterity (Stealth) check, taken where no enemy it can see can see it.
  // A creature with Nimble Escape takes it as a Bonus Action. { type: 'hide', actor }
  hide(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const why = hideProblem(s, e);
    if (why) fail(why);
    if (s.encounter && inFight(s, e.id)) { const time = actTime(e, 'hide', a); need(s, e, time); s.encounter.budget[time]--; }
    const r = abilityCheck(s, e, { skill: 'stealth' }), success = r.total >= HIDE_DC;
    ev.push({ type: 'check', id: e.id, ability: 'dex', skill: 'stealth', ...r, hide: true, success });
    if (!success) return;
    e.hiding = { dc: r.total };
    ev.push({ type: 'hid', id: e.id });
    const o = spotter(s, e);
    if (o) unhide(s, e, ev, 'found', o);                                // an enemy it could not see was watching all along
  },
};

// A pool of points traded with spell slots (Font of Magic: `exchange: { costs, minLevel }`, by slot
// level). { type: 'feature', actor, feature, make: level } makes a slot of that level as a Bonus
// Action for its cost in points, if the creature's level reaches the table's; a made slot is gone
// at the next Long Rest (slots come back to their maximum). { ..., spend: level } spends a slot of
// that level for as many points, with no action, never above the pool's maximum.
function exchange(s, e, f, a, ev) {
  up(e) || fail(`${e.name} is down.`);
  able(e);
  const x = f.exchange, have = e.uses[f.id] ?? 0, fighting = !!s.encounter && inFight(s, e.id);
  if (a.make !== undefined) {
    const cost = x.costs[a.make] ?? fail(`${f.name} makes spell slots of level 1 to ${Object.keys(x.costs).length}.`);
    e.level >= x.minLevel[a.make] || fail(`${f.name} makes a level ${a.make} slot from level ${x.minLevel[a.make]}.`);
    have >= cost || fail(`A level ${a.make} slot costs ${cost} points; ${e.name} has ${have}.`);
    if (fighting) need(s, e, 'bonus');
    if (fighting) s.encounter.budget.bonus--;
    e.uses[f.id] -= cost;
    e.slots[a.make] = (e.slots[a.make] ?? 0) + 1;
    return ev.push({ type: 'std', id: e.id, action: `${f.name}: a level ${a.make} spell slot` });
  }
  if (a.spend !== undefined) {
    (Number.isInteger(a.spend) && (e.slots?.[a.spend] ?? 0) > 0) || fail(`${e.name} has no level ${a.spend} spell slot to spend.`);
    have + a.spend <= f.uses.max || fail(`${e.name} can't have more than ${f.uses.max} points.`);
    e.slots[a.spend]--;
    e.uses[f.id] += a.spend;
    return ev.push({ type: 'std', id: e.id, action: `${f.name}: ${a.spend} point${a.spend === 1 ? '' : 's'} from a spell slot` });
  }
  fail(`Say whether ${f.name} makes a spell slot (make) or spends one (spend).`);
}

// A feature that lays a form over its creature (Wild Shape; forms.js): { type: 'feature', actor,
// feature, form: monster id } takes that form for one use, ending any form it is in; with no `form`,
// it leaves the one it is in, for its time and no use. The form lasts `hours` hours and ends early
// if the creature is Incapacitated or drops to 0 Hit Points (a fragile effect), or if the effect is ended.
const crText = (cr) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] ?? String(cr);
function shapeShift(s, e, f, act, a, ev) {
  const enc = s.encounter, fighting = !!enc && inFight(s, e.id), time = act.time === 'free' ? null : act.time;
  const holding = e.form ? effectsOf(s).find((x) => x.id === e.form.fx) : null;
  if (a.form === undefined || a.form === null) {
    e.form || fail(`Choose a form for ${f.name}.`);
    if (time && fighting) { need(s, e, time); enc.budget[time]--; }
    if (holding) return endEffect(s, ev, holding, `${e.name} left the form`);
    leaveForm(e);
    return ev.push({ type: 'form', id: e.id, form: null });
  }
  const F = act.form, m = typeof a.form === 'string' ? CONTENT.monsters[a.form] : null, tpl = m && MONSTERS[a.form];
  tpl || fail('No such creature.');
  F.types.includes(m.type) || fail(`${f.name} takes the form of a ${F.types.join(' or ')}; the ${m.name} is not one.`);
  m.cr <= F.maxCr || fail(`At ${e.name}'s level ${f.name} takes forms of Challenge Rating ${crText(F.maxCr)} or lower; the ${m.name} is ${crText(m.cr)}.`);
  (!m.speed.fly || F.fly) || fail(`At ${e.name}'s level ${f.name} can't take a form with a Fly Speed.`);
  (e.uses[f.id] ?? 0) >= 1 || fail(`${e.name} has no uses of ${f.name} left.`);
  if (time && fighting) need(s, e, time);
  const body = { size: tpl.size };
  (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for a ${m.name} there.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} becoming a ${m.name}.`);

  // Paid for: from here it happens.
  if (time && fighting) enc.budget[time]--;
  e.uses[f.id]--;
  if (holding) endEffect(s, ev, holding, `${e.name} took another form`);
  else if (e.form) leaveForm(e);
  const fx = startEffect(s, { name: `${f.name} (${m.name})`, spell: null, source: e.id, conc: false, duration: `${F.hours} hour${F.hours === 1 ? '' : 's'}` });
  Object.assign(fx, { feature: f.id, fragile: true });
  fx.parts.push({ target: e.id, form: true });
  const was = e.size;
  takeForm(e, a.form, m.name, tpl, MONSTER_ACTIONS[a.form] ?? [], fx.id);
  ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: [e.id] });
  ev.push({ type: 'form', id: e.id, form: a.form, name: m.name });
  if (e.size !== was) ev.push({ type: 'size', id: e.id, size: e.size });
  if (F.tempHp) tempHp(s, e, F.tempHp, ev);
}

