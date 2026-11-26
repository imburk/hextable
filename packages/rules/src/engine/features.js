// Class features and ability checks (engine.js): secondWind, feature (with Font of Magic and
// Wild Shape), use (objects, and magic items: E18), check, search and hide, and watching for hidden creatures.
import { gridOf, col } from '../grid.js';
import { d20Faces, die, roll } from '../rng.js';
import { CONTENT, MONSTER_ACTIONS, MONSTERS, SPELLS } from '../content/index.js';
import { ABILITIES, nearProblem, nearRun, rolledProblem, SKILLS } from '../content/schema.js';
import { begin, scaleSteps, sharedRolls, walk as walkSteps } from '../effects.js';
import { leaveForm, takeForm } from '../forms.js';
import { breakConcentration, effectsOf, endEffect, startEffect, tick, turnKey, useUp } from '../durations.js';
import { apart, FT, ground, overlapAt } from '../space.js';
import { canSee, coverOf, hiddenFrom, sees } from '../sight.js';
import { barriers, objectDef } from '../walls.js';
import { conditionName, conditionPhrase, incapacitatedBy, modifiers, speedOf } from '../modifiers.js';
import { able, actTime, castAbilOf, control, current, dying, ent, fail, featOf, fleetFree, hostile, inFight, living, mod, need, rollDice, RuleError, spellStats, up, walled } from './shared.js';
import { instruction, reactionsOf } from '../reactions.js';
import { unknown } from '../vision.js';
import { dawn } from './rests.js';
import { aimAction, findable, findDC, fitsOn, nearObject, objectName, objectOf, objectShown, SEARCH_FEET, seePiles, setObject, unhide } from './world.js';
import { abilityCheck, boundEffect, checkBonus, checkSit, GRANTS, grantOf, deathSavesOver, heal, passive, settle, stabilise, tempHp } from './rolls.js';
import { checkEnd, confusedOnly, endHold, objectEffects, resolve } from './resolve.js';
import { classesOf, itemActive, itemName } from '../derive.js';
import { resheet } from './sheets.js';
import { castFromItem } from './casting.js';
import { startZone } from '../zones.js';

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
// After every action: piles' unseen marks (seePiles), and an enemy that can see a hiding creature anyway (Blindsight, Truesight) has
// found it, and with the table rule passiveFind 'all' so has one whose passive Perception meets
// its DC and that has it in view; Lightly Obscured (Dim Light) costs that 5.
export function watch(s, ev) {
  initiativeFeatures(s, ev);
  seePiles(s);                                   // things dropped unseen, once the party knows who dropped them (world.js)
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

// Of Athletics and Acrobatics, the one `e` has the better chance with to escape `hold` (docs/specs/grapple-shove.md, Decision 5),
// judged as abilityCheck judges a check, without rolling: no automatic failure first, then Advantage over neither over
// Disadvantage, then the higher bonus, then Athletics.
function escapeSkill(s, e, hold) {
  let best = null;
  for (const skill of ['athletics', 'acrobatics']) {
    const ability = SKILLS[skill], proficient = !!(e.skills?.includes(skill) || e.skillBonus?.[skill] !== undefined);
    const m = modifiers(s, e, 'check', checkSit(e, { skill, escape: true }, ability, proficient), '');
    const adv = m.advantage.length > 0, dis = m.disadvantage.length > 0 || !!hold.escapeDis;
    const rank = [m.autoFail ? 0 : 1, adv && !dis ? 2 : dis && !adv ? 0 : 1, checkBonus(e, { skill }, m.lent) + m.add];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) best = { skill, rank };
  }
  return best.skill;
}
// A hand-typed character (no sheet: the four starters) lists what it carries in `gear`, and the engine cannot tell worn
// from carried. If that lists armour with Disadvantage on Stealth, the DM is told on the check, to apply it if it is worn.
function stealthGearNote(e, ev) {
  if (e.sheet || e.tpl || e.stealthNoted || !Array.isArray(e.gear)) return;
  const suit = e.gear.map((g) => CONTENT.armour[slug(g)]).find((a) => a?.stealth === 'disadvantage');
  if (suit) e.stealthNoted = true;      // told once for the creature, for the whole game
  if (suit) ev.push({ type: 'manual', actor: e.id, name: 'Stealth', partial: true, text: `${e.name}'s gear lists ${suit.name}, which gives Disadvantage on Dexterity (Stealth) checks while worn. The engine cannot tell worn from carried for a character with no sheet, so it rolled one die: if ${e.name} wears it, the DM rolls with Disadvantage.` });
}
const slug = (x) => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hasTool = (e, tool) => e.gear.some((g) => slug(g) === tool);
const toolName = (tool) => (tool === 'thieves-tools' ? "Thieves' Tools" : tool.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));

export const handlers = {
  secondWind(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
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
  // `via` is not from the action: the `attack` handler (attacks.js) passes `{ weapon }` when a feature with `withAttack` is used with the Attack action.
  feature(s, a, ctx, ev, via = null) {
    const e = ent(s, a.actor); control(s, e, ctx);
    confusedOnly(s, e, 'use a feature');
    const f = featOf(e, a.feature) || fail(`${e.name} has no such feature.`);
    // A screen that does not yet send the choice a feature needs (a mode, a form, a slot to make or
    // spend) still spends what it costs and hands the rest to the DM, as before these were built.
    if (f.exchange && (a.make !== undefined || a.spend !== undefined)) return exchange(s, e, f, a, ev);
    // A feature that swaps one thing for another (Font of Inspiration, Wild Resurgence) is used by naming the swap.
    if (f.swap) return swap(s, e, f, a, ev);
    // A feature that casts a spell (Divine Intervention) is used by casting: `cast` with `via`.
    (!f.freeCast || f.action) || fail(`${f.name} casts a spell: cast the spell through it (cast with via "${f.id}").`);
    // A feature used on rolling Initiative (Persistent Rage) is spent then, never by hand.
    (!f.initiative || f.action) || fail(`${f.name} is used when ${e.name} rolls Initiative.`);
    const act = f.action ?? (f.uses ? { time: 'free', target: { self: true }, effects: [{ manual: `${f.name}: ${f.text}` }] } : null);
    act || fail(`${f.name} is always on; there is nothing to use.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    // `withAttack` (docs/specs/on-hit.md, Decision 8): used when its creature takes the Attack action, by naming it on the attack (`use`), never by itself.
    !act.withAttack || via?.withAttack || fail(`${f.name} is used when ${e.name} takes the Attack action: name it on the attack (use: "${f.id}").`);
    !via || act.withAttack || fail(`${f.name} is not used with the Attack action.`);
    act.time !== 'reaction' || fail(f.reaction ? `${f.name} is a Reaction, taken by ${e.name}'s standing instruction for it.` : `${f.name} is a Reaction. The engine does not take that reaction yet; the DM applies it.`);
    if (act.form && (a.form !== undefined || e.form)) return shapeShift(s, e, f, act, a, ev);
    const enc = s.encounter, fighting = !!enc && inFight(s, e.id), time = act.time === 'free' ? null : act.time;
    // `after` follows a hit on the creature the action is aimed at; a pool of healing or an extra action has none (the gate says so; data that skipped it is refused here, before anything is paid).
    if (act.after !== undefined && (act.gain || act.pool)) fail(`${f.name} follows a hit on the creature it is aimed at, but its data also gives ${act.pool ? 'a pool of healing' : 'an extra action'}, which has no creature to have hit. The DM can apply it.`);
    if (act.unless === 'heavy' && e.armour === 'heavy') fail(`${e.name} can't use ${f.name} while wearing Heavy armor.`);
    // `inForm` (addition J of docs/specs/homebrew-subclasses.md): only while in a form the feature it names gave (Wild Shape), checked before anything is paid.
    if (act.inForm !== undefined) {
      (typeof act.inForm === 'string' && act.inForm && !act.form && act.time !== 'reaction') || fail(`${f.name} cannot be used: its data for "while in a form" is wrong (it names the feature that gave the form, on an action that does not take a form itself). The DM can apply it.`);
      const into = e.form ? effectsOf(s).find((x) => x.id === e.form.fx) : null;
      (into && into.feature === act.inForm) || fail(`${f.name} is used while ${e.name} is in a ${featOf(e, act.inForm)?.name ?? act.inForm} form${e.form ? ` (the ${e.form.name} form is from something else)` : ''}.`);
    }
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
    // A feature with `modes` does one of several things, named by `a.mode` (Divine Spark: heal, or radiant or necrotic harm).
    const mode = act.modes && a.mode !== undefined ? act.modes.find((m) => m.id === a.mode) || fail(`Choose what ${f.name} does: ${act.modes.map((m) => m.name).join(', ')}.`) : null;
    // A mode may have a price of its own (`cost: { resource, n? }`, the pool it spends in place of the action's) or none (`free`; addition G of docs/specs/homebrew-subclasses.md).
    // It is the mode's price alone: `orCost` and `orSlot` are the action's own, so an action that has them and a mode with its own price is refused here (the gate says so too), before anything is paid.
    const noCost = mode?.free === true, modeCost = mode?.cost;
    if (modeCost !== undefined && !(modeCost && typeof modeCost.resource === 'string' && modeCost.resource && (modeCost.n === undefined || (Number.isInteger(modeCost.n) && modeCost.n > 0)))) fail(`${f.name} cannot be used: the price of its ${mode.name} mode is not a pool and a number of uses. The DM can apply it.`);
    if ((noCost || modeCost) && (act.orCost || act.orSlot)) fail(`${f.name} cannot be used: its ${mode.name} mode has a price of its own (or none), and the action also has orCost or orSlot, which are about the action's own price. The DM can apply it.`);
    if (noCost && modeCost !== undefined) fail(`${f.name} cannot be used: its ${mode.name} mode is both free and priced. The DM can apply it.`);
    let res = noCost ? null : modeCost ? modeCost.resource : act.cost?.resource ?? (f.uses ? f.id : null), n = noCost ? 0 : modeCost ? modeCost.n ?? 1 : act.cost?.n ?? 1;
    // `orCost`: with none of its own uses left, it may be paid for from another pool instead
    // (Dragon Wings for 3 Sorcery Points; Innate Sorcery for 2 with Sorcery Incarnate).
    if (res && !act.pool && (e.uses[res] ?? 0) < n && act.orCost && (e.uses[act.orCost.resource] ?? 0) >= act.orCost.n) { res = act.orCost.resource; n = act.orCost.n; }
    // `orSlot` (Hurl Through Hell; any caster, addition E of docs/specs/homebrew-subclasses.md): with its use spent, a spell slot of the level `a.slot`
    // names restores it (a Pact Magic slot, for a Warlock: its slots are Pact Magic's). `cost.slot` is another thing: a slot that pays for the action (below).
    let slotPaid = null;
    const hasSlots = Object.values(e.slots ?? {}).some((n) => n > 0), slotWord = e.pact ? 'Pact Magic' : 'spell';
    if (act.orSlot && a.slot !== undefined) {
      (e.uses[res] ?? 0) < n || fail(`${e.name} has a use of ${f.name} left; a spell slot restores it only once it is spent.`);
      (Number.isInteger(a.slot) && (e.slots?.[a.slot] ?? 0) > 0) || fail(`${e.name} has no ${slotWord} slot of level ${a.slot} to spend.`);
      slotPaid = a.slot; res = null;
    } else if (a.slot !== undefined && act.cost?.slot === undefined) fail(`${f.name} is not paid for with a spell slot.`);
    if (res && !act.pool) (e.uses[res] ?? 0) >= n || fail(`${e.name} has no uses of ${featOf(e, res)?.name ?? res} left.${act.orSlot && (e.pact || hasSlots) ? ` A ${slotWord} slot can restore it: name the slot.` : ''}`);
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
    // `choice` (addition C of docs/specs/homebrew-subclasses.md): a skill or a tool the holder names when using the feature (`a.choice`, a string), which the action's modifier steps that say
    // "chosen" take (`scope: { skill: 'chosen' }`, `{ tool: 'chosen' }`). Checked here with the rest, before anything is paid. With none sent, as with no mode, the use is spent
    // and the DM is handed the rest (below): a screen that does not yet offer the choice still works the way it did. A choice sent to an action that makes none is refused.
    const wants = act.choice, mine = [...(act.modes ? act.modes.flatMap((m) => m?.effects ?? []) : act.effects ?? [])];
    let chosenHere = null;
    if (wants !== undefined) {
      (wants && typeof wants === 'object' && ['skill', 'tool'].includes(wants.of) && (wants.from === undefined ? wants.of === 'skill' : Array.isArray(wants.from) && wants.from.length > 1) && !act.form && !act.gain && !act.pool && !act.renew && !act.zone && (Array.isArray(act.effects) || Array.isArray(act.modes)))
        || fail(`${f.name} cannot be used: its data for the choice made when it is used is wrong (a skill or a tool, on an action with plain steps). The DM can apply it.`);
      if (a.choice !== undefined) {
        const what = wants.of === 'skill' ? 'skill' : 'tool', names = wants.from ?? (wants.of === 'skill' ? Object.keys(SKILLS) : null);
        (typeof a.choice === 'string' && (wants.of === 'skill' ? Object.hasOwn(SKILLS, a.choice) : /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.choice) && a.choice.length <= 40))
          || fail(`${f.name} asks for ${what === 'skill' ? 'a skill' : 'a tool'}: ${what === 'skill' ? 'name a skill, such as arcana' : 'name a tool by its id, such as thieves-tools'}.`);
        !names || names.includes(a.choice) || fail(`${f.name} lends proficiency with ${names.length > 6 ? `a ${what}` : `one of ${names.join(', ')}`}; ${a.choice} is not one.`);
        chosenHere = a.choice;
      }
    } else {
      a.choice === undefined || fail(`${f.name} makes no choice of a skill or a tool.`);
      let lost = false;
      walkSteps(mine, (st) => { if (st?.modifier?.scope?.skill === 'chosen' || st?.modifier?.scope?.tool === 'chosen') lost = true; });
      !lost || fail(`${f.name} cannot be used: a step takes a chosen skill or tool, but its action makes no choice. The DM can apply it.`);
    }
    // A proficiency lent for a time is the holder's: an action aimed at another creature that lends one is not played (the gate says so; data that skipped it is refused here).
    let lendsHere = false;
    walkSteps(mine, (st) => { if (st?.modifier?.op === 'proficient') lendsHere = true; });
    if (lendsHere && act.target?.self !== true) fail(`${f.name} cannot be used: it lends proficiency to a creature other than its holder, which the engine does not do. The DM can apply it.`);
    // What the DM is handed says what is missing: no mode named, or no skill or tool sent. With no skill or tool sent, the use is spent and no effect is started (it would hold nothing).
    const noMode = !!act.modes && !mode, noPick = wants !== undefined && chosenHere === null;
    const forDm = noPick && !noMode
      ? `${f.name}: ask which ${wants.of}${Array.isArray(wants.from) ? ` (${wants.from.join(', ')})` : ''} it is for, then ${lendsHere ? 'apply proficiency in it' : `apply what ${f.name} does with it`}${act.duration && act.duration !== 'instant' ? ` for ${act.duration}` : ''}. (The use is spent; no ${wants.of} was sent, so the DM applies it.)`
      : noMode && wants !== undefined ? `${f.name}: ${f.text} (No mode was named, so the DM applies it${noPick ? `; ask which ${wants.of} too` : ''}.)`
      : `${f.name}: ${f.text} (No choice was sent, so the DM applies it.)`;
    const byHand = noMode || act.form || noPick ? [{ manual: forDm }] : null;
    // `near` (addition G of docs/specs/homebrew-subclasses.md), on the action's target or on the mode's: a second creature within that many feet of the first target takes the
    // damage steps the action begins with, the roll shared. It is named as a second id in `targets` (`target` alone is the first creature only), so the creature ids a player
    // sends are checked as they always are (engine.js, CREATURE_FIELDS). The first creature is the action's target as ever: `aimAction` is asked about it alone.
    const nearFeet = act.gain || act.pool || act.form ? undefined : mode?.target?.near ?? act.target?.near;
    let ask = a, nearId = null;
    if (nearFeet !== undefined) {
      (Number.isInteger(nearFeet) && nearFeet >= 5 && nearFeet <= 60 && nearFeet % 5 === 0 && act.target?.creature && typeof act.target.creature === 'object' && (act.target.creature.count ?? 1) === 1 && !act.target.creature.within && !act.target.creature.repeat) || fail(`${f.name} cannot be used: its data for a second target near the first is wrong (near is 5 to 60 feet, a multiple of 5, on an action aimed at one creature). The DM can apply it.`);
      const ids = a.targets !== undefined ? a.targets : a.target !== undefined ? [a.target] : [];
      // An id is a string and a list of ids is flat: a player's are checked before any handler runs (engine.js, dispatch), and this answers the same for anyone else (a list inside a list is `s.entities[['m15']]`).
      if (Array.isArray(ids) && !ids.every((id) => typeof id === 'string')) fail('No such creature.');
      if (Array.isArray(ids) && ids.length > 2) fail(`${f.name} reaches a creature and one more within ${nearFeet} ft of it.`);
      if (Array.isArray(ids) && ids.length === 2) { nearId = ids[1]; ask = { ...a, targets: [ids[0]] }; }
    }
    // No mode named on an action whose modes may aim a second creature: the DM is handed it (`byHand`), and a second creature cannot be named.
    if (act.modes && !mode && !act.pool && !act.gain && !act.form && act.modes.some((m) => m?.target?.near !== undefined) && (a.targets?.length ?? 0) > 1) fail(`Choose what ${f.name} does before naming a second creature: ${act.modes.map((m) => m.name).join(', ')}.`);
    const aimed = act.gain || act.pool ? null : aimAction(s, e, { name: f.name, target: act.target, effects: byHand ?? (mode ? mode.effects : act.effects) }, ask);
    if (aimed?.targets && fighting) for (const t of aimed.targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    let near = null;
    if (nearId !== null) {
      byHand && fail(`Choose what ${f.name} does before naming a second creature: ${act.modes.map((m) => m.name).join(', ')}.`);
      near = ent(s, nearId);
      const first = aimed.targets[0];
      !near.dead || fail(`${near.name} is dead.`);
      near.id !== e.id || fail(`${f.name} needs a second creature other than ${e.name}.`);
      near.id !== first.id || fail(`${f.name} can't target the same creature twice.`);
      if (fighting) inFight(s, near.id) || fail(`${near.name} is outside the battle.`);
      apart(s, first, near) * FT <= nearFeet || fail(`${near.name} is more than ${nearFeet} ft from ${first.name}.`);
      const problem = nearProblem(mode ? mode.effects : act.effects);
      if (problem) fail(`${f.name} cannot be used: its data is wrong (${problem}). The DM can apply it.`);
    }
    // `after: 'hit'` (Hurl Through Hell): on a creature this one hit with an attack roll this turn, once a turn.
    if (act.after === 'hit') {
      fighting || fail(`${f.name} follows a hit in a fight.`);
      for (const t of aimed?.targets ?? []) enc.flags[`hit:${e.id}:${t.id}`] || fail(`${f.name} follows a hit: ${e.name} has not hit ${t.name} with an attack roll this turn.`);
      !enc.flags[`after:${f.id}:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
    }
    // `after: 'weaponHit'` (addition F of docs/specs/homebrew-subclasses.md): the same, after a hit with a weapon (`whit:` is set where the attack is rolled,
    // resolve.js `rollToHit`, for a weapon attack only: not a spell attack, not an Unarmed Strike). The use is the one a hit's is (`after:`), once a turn.
    if (act.after === 'weaponHit') {
      fighting || fail(`${f.name} follows a hit with a weapon in a fight.`);
      for (const t of aimed?.targets ?? []) enc.flags[`whit:${e.id}:${t.id}`] || fail(`${f.name} follows a hit with a weapon: ${e.name} has not hit ${t.name} with a weapon this turn.`);
      !enc.flags[`after:${f.id}:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
    }
    // A modifier of `{ rolled: true }` takes the number of the damage step just before it, and is for one target and not under an attack roll (the gate says so;
    // data that skipped the gate is refused here, before anything is paid).
    {
      const problem = rolledProblem(act.modes ? mode?.effects : act.effects);
      if (problem) fail(`${f.name} cannot be used: its data is wrong (${problem}). The DM can apply it.`);
      let rolls = false;
      walkSteps(act.modes ? mode?.effects ?? [] : act.effects ?? [], (st) => { if (st?.modifier?.value && typeof st.modifier.value === 'object' && 'rolled' in st.modifier.value) rolls = true; });
      if (rolls && (aimed?.targets?.length ?? 1) > 1) fail(`${f.name} cannot be used: it adds a number rolled to one creature's damage, and it reaches ${aimed.targets.length} creatures, which would each roll their own. The DM can apply it.`);
    }
    // A die handed to another creature to spend later (Bardic Inspiration: "A creature can have only one
    // Bardic Inspiration die at a time"): not to one that still holds one from this feature, whoever gave it.
    const gives = act.duration && (act.effects ?? []).some((st) => st.modifier?.uses !== undefined);
    if (gives && aimed?.targets) for (const t of aimed.targets) {
      const holds = effectsOf(s).some((fx) => fx.feature === f.id && fx.parts.some((p) => p.target === t.id && !p.ended && p.modifier?.uses !== undefined));
      !holds || fail(`${t.name} already has a ${f.name} die.`);
    }

    // A zone (addition D of docs/specs/homebrew-subclasses.md): the action's Emanation stays for its duration and moves with the holder, and its
    // steps go off on a creature that enters it or starts or ends its turn there (zones.js), as a spell's zone does. One at a time for a holder.
    const zoneDef = act.zone;
    if (zoneDef) {
      (act.duration && act.duration !== 'instant' && act.target?.area && Array.isArray(act.effects)) || fail(`${f.name} makes an area that lasts, but its data gives no duration, area or effects to lay out. The DM can apply it.`);
      (Array.isArray(zoneDef.on) && zoneDef.on.length) || fail(`${f.name} makes an area that lasts, but its zone does not say when it goes off (\`zone.on\`). The DM can apply it.`);
      effectsOf(s).some((fx) => fx.source === e.id && fx.feature === f.id && fx.zone) && fail(`${e.name}'s ${f.name} is already going: end it first to use it again.`);
      // As for a spell's zone, the user may name creatures it leaves alone (`a.spare`), where the zone says it spares.
      if (a.spare !== undefined) {
        zoneDef.spare || fail(`${f.name} spares nobody by choice.`);
        (Array.isArray(a.spare) && a.spare.length <= 100 && a.spare.every((id) => typeof id === 'string' && s.entities[id])) || fail('Name the creatures it spares.');
      }
    }

    // `cost.slot` (addition E of docs/specs/homebrew-subclasses.md): a spell slot pays for the action too, of the level `a.slot` names, which is the action's lowest or higher, as
    // a spell's is. With no level named, the lowest level at or above the action's that the creature has a slot of: a Warlock's one slot level is Pact Magic's, a multiclass
    // caster's levels are the table's, and both are the creature's `slots` (`cast` reads the same). Checked here, with the rest, before anything is paid.
    let slotSpent = null;
    const lowest = act.cost?.slot;
    if (lowest !== undefined) {
      (Array.isArray(act.effects) && act.effects.length && !act.modes && !act.form && !act.pool && !act.gain && !act.renew && !act.orSlot) || fail(`${f.name} costs a spell slot, but its data gives no plain steps for the slot to pay for. The DM can apply it.`);
      const left = Object.entries(e.slots ?? {}).filter(([l, n]) => +l >= lowest && n > 0).map(([l]) => +l).sort((x, y) => x - y);
      const slot = a.slot ?? left[0];
      if (slot === undefined) fail(`${e.name} has no spell slot of level ${lowest} or higher left for ${f.name}.`);
      (Number.isInteger(slot) && slot >= lowest && slot <= 9) || fail(`${f.name} needs a spell slot of level ${lowest} or higher.`);
      (e.slots?.[slot] ?? 0) > 0 || fail(left.length ? `${e.name} has no level ${slot} spell slots left.` : `${e.name} has no spell slot of level ${lowest} or higher left for ${f.name}.`);
      slotSpent = slot;
    }

    // Paid for: from here it happens.
    if (time && fighting) { if (free) enc.flags[`fleet:${e.id}`] = true; else enc.budget[time]--; if (time === 'bonus') enc.flags[`used:${f.id}:${e.id}`] = true; }
    if (res) e.uses[res] -= act.pool ? amount + cures.length * (act.cure?.cost ?? 0) : n;
    if (slotPaid !== null) { e.slots[slotPaid]--; ev.push({ type: 'std', id: e.id, action: `${f.name}: restored with a level ${slotPaid} ${slotWord} slot` }); }
    if (slotSpent !== null) { e.slots[slotSpent]--; ev.push({ type: 'std', id: e.id, action: `${f.name}: spent a level ${slotSpent} ${slotWord} slot` }); }
    if (act.after === 'hit' || act.after === 'weaponHit') enc.flags[`after:${f.id}:${e.id}`] = true;
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
    let steps = structuredClone(byHand ?? (mode ? mode.effects : act.effects));
    if (chosenHere !== null) walkSteps(steps, (st) => { const sc = st?.modifier?.scope; if (sc?.skill === 'chosen') sc.skill = chosenHere; if (sc?.tool === 'chosen') sc.tool = chosenHere; });
    const targets = aimed.targets;
    // The slot grows the steps as a higher slot grows a spell's (`scaleSteps`): what `cost.higher` adds for each level above the lowest. What it cannot add, the DM is told.
    if (slotSpent !== null && act.cost.higher) {
      const grown = scaleSteps({ level: lowest, effects: steps, higher: { slot: act.cost.higher } }, e.level, slotSpent);
      steps = grown.steps;
      if (grown.unscaled) ev.push({ type: 'manual', actor: e.id, name: f.name, partial: true, text: `Used with a level ${slotSpent} slot. The engine could not add ${grown.unscaled}; the DM does.` });
    }
    if (!steps.length) return ev.push({ type: 'std', id: e.id, action: f.name });     // nothing more (Patient Defense below level 10)
    let fx = null;
    if (act.duration && act.duration !== 'instant' && !(byHand && wants !== undefined)) {
      fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: act.duration });
      // A zone's effect also ends when its holder dies or drops to 0 Hit Points or falls Unconscious (`fragile`: durations.js), whatever else the action says:
      // a zone that follows a creature that is gone must not wait to come back with it. Incapacitated ends it only where the action says so.
      Object.assign(fx, { feature: f.id, ...(act.renew ? { renew: true } : {}), ...(act.noSpells ? { noSpells: true } : {}), ...(act.endsWhenIncapacitated ? { fragile: true } : act.endsOn ? { fragile: act.endsOn } : zoneDef ? { fragile: 'unconscious' } : {}) });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: (targets ?? []).map((t) => t.id) });
    } else fx = boundEffect(s, f.name, e.id, steps);
    if (!('attack' in steps[0])) ev.push({ type: 'std', id: e.id, action: f.name });
    const st = e.castAbil ? spellStats(e, s) : null;
    // A feature's own save DC (Intimidating Presence: 8 + Strength + Proficiency) is also the DC of a
    // save that ends what it did; a feature whose save has none uses the spell save DC.
    let own;
    walkSteps(steps, (x) => { if (own === undefined && 'save' in x && typeof x.dc === 'number') own = x.dc; });
    const src = { name: f.name, ...(st ? { dc: st.dc, attack: st.attack } : {}), ...(own !== undefined ? { dc: own } : {}), healMod: mod(e.abil[e.castAbil] ?? 10), ...(via?.weapon ? { weapon: via.weapon } : {}) };
    // The zone is made as a spell's is (zones.js startZone); unless it says `atCast`, nobody is affected as it appears.
    const hit = zoneDef && fx ? startZone(s, fx, { def: zoneDef, area: act.target.area, holder: e, hexes: aimed.hexes, origin: aimed.origin, spare: a.spare ?? [], steps, src }, targets) : targets;
    // A second creature near the first (`near`) takes the leading damage steps, rolled once for the two of them: the roll is made here and both read it (`shared`), so the
    // first creature's own steps after it (a `{ rolled: true }` modifier on the holder, a push) see the same number, and are done for the first creature alone. The second
    // creature's steps are pushed first, so the first creature's go first (the stack runs the last pushed).
    let sharedNear = null;
    if (near) {
      const lead = nearRun(steps);
      sharedNear = sharedRolls(s, steps.slice(0, lead));
      begin(s, { steps: steps.slice(0, lead), actor: e.id, targets: [near.id], src: { ...src, ...(fx ? { fx: fx.id } : {}) }, shared: sharedNear });
    }
    begin(s, { steps, actor: e.id, targets: hit === null ? null : hit.map((t) => t.id),
      src: { ...src, ...(fx ? { fx: fx.id } : {}) },
      // Damage an area feature deals is rolled once for everyone in it (Sear Undead), as a spell's is.
      shared: sharedNear ?? (aimed.hexes ? sharedRolls(s, steps) : null) });
    resolve(s, ev);
    if (fx?.bound) settle(s, ev, fx, targets ?? []);
    checkEnd(s, ev);
  },

  // Do something with an object in reach: open a door, pull a lever. { type: 'use', actor, object, verb }
  // With `item` instead of `object`, use a magic item the creature has (useItem, below).
  use(s, a, ctx, ev) {
    if (a.item !== undefined) return useItem(s, a, ctx, ev);
    const e = ent(s, a.actor); control(s, e, ctx);
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
    const e = ent(s, a.actor); control(s, e, ctx);
    up(e) || fail(`${e.name} is down.`);
    const skill = a.skill === undefined ? null : (Object.hasOwn(SKILLS, a.skill) && a.skill) || fail('Unknown skill.');
    const ability = skill ? SKILLS[skill] : (ABILITIES.includes(a.ability) && a.ability) || fail('Name a skill or an ability.');
    if (a.dc !== undefined) {
      ctx.role === 'dm' || fail('Only the DM sets a DC.');
      (Number.isInteger(a.dc) && a.dc > 0 && a.dc <= 40) || fail('A DC is a whole number from 1 to 40.');
    }
    const grant = grantOf(a, ctx), r = abilityCheck(s, e, { ability, skill }, false, grant === 'disadvantage' ? [GRANTS.disadvantage] : [], grant === 'advantage' ? [GRANTS.advantage] : []);
    ev.push({ type: 'check', id: e.id, ability, ...(skill ? { skill } : {}), ...r, ...(a.dc !== undefined ? { dc: a.dc, success: r.total >= a.dc, secret: true } : {}) });
    if (skill === 'stealth') stealthGearNote(e, ev);
  },
  // Stabilizing a creature (SRD "Stabilizing a Character": "You can take the Help action to try to stabilize a creature with 0 Hit Points,
  // which requires a successful DC 10 Wisdom (Medicine) check"): { type: 'stabilize', actor, target }. Within 5 feet and not behind a wall. In a fight it
  // takes the actor's action on its turn; out of one it costs nothing. A success makes the target Stable (as Spare the Dying does); a failure changes nothing
  // and may be tried again. Any creature may try, trained or not. A target that is not dying (up, Stable, dead) is refused before anything is rolled.
  stabilize(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const t = typeof a.target === 'string' && Object.hasOwn(s.entities, a.target) ? s.entities[a.target] : fail('No such creature.');
    ctx.role === 'dm' || (!unknown(s, t) && canSee(s, e, t) !== 'no') || fail('No such creature.');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    t.id !== e.id || fail(`${e.name} can't stabilize itself.`);
    if (t.dead) fail(`${t.name} is dead.`);
    if (t.hp > 0) fail(`${t.name} is not at 0 Hit Points.`);
    if (!dying(t)) fail(`${t.name} is Stable already.`);
    walled(s, e, t);
    apart(s, e, t) * FT <= 5 || fail(`${t.name} is out of reach: stabilizing is done within 5 feet.`);
    if (s.encounter && inFight(s, e.id)) { need(s, e, 'action'); s.encounter.budget.action--; }
    const r = abilityCheck(s, e, { skill: 'medicine' }), success = r.total >= 10;
    ev.push({ type: 'check', id: e.id, ability: 'wis', skill: 'medicine', ...r, dc: 10, success, stabilize: t.id });
    if (success) stabilise(s, t, ev, { actor: e.id, src: { name: 'Stabilize' } });
    // Out of a fight an attempt takes a round (6 seconds) of game time, so a failure is not free: the other dying creatures (and the target, if it failed) roll a save.
    if (!(s.encounter && inFight(s, e.id))) {
      deathSavesOver(s, 0.1, ev);
      const from = s.clock;
      s.clock += 0.1;
      ev.push({ type: 'time', minutes: 0.1 });
      dawn(s, from, ev);
      tick(s, ev);
    }
  },
  // Escaping a grapple (SRD "Grappling", Ending a Grapple; docs/specs/grapple-shove.md, Decision 5):
  // { type: 'escape', actor, from?: grapplerId, skill?: 'athletics' | 'acrobatics' }. A Strength (Athletics) or Dexterity
  // (Acrobatics) check against the hold's escape DC, which in a fight takes the actor's action ("use its action"); out of one it
  // costs nothing. `from` may be left out when one creature holds it; `skill` left out, the engine takes the one with the better
  // chance, as for the Grapple's save. Disadvantage from the hold's `escapeDis` (a mimic's); a `check` modifier with the tag
  // `check.escape` (Powerful Build) applies. A Grappled condition with no holds (the DM's, or a game saved before) has no escape DC.
  escape(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const g = e.cond.grappled || fail(`${e.name} isn't Grappled.`);
    Array.isArray(g.holds) || fail('This grapple has no escape DC in the game; the DM ends it.');
    const hold = a.from === undefined ? (g.holds.length === 1 ? g.holds[0] : fail(`${e.name} is held by more than one creature: say which grapple to escape (from).`))
      : g.holds.find((h) => h.by === a.from) || fail(`${e.name} isn't held by that creature.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    (a.skill === undefined || a.skill === 'athletics' || a.skill === 'acrobatics') || fail('An escape is a Strength (Athletics) or Dexterity (Acrobatics) check.');
    Number.isInteger(hold.escape) || fail('This grapple has no escape DC in the game; the DM ends it.');
    const fighting = !!s.encounter && inFight(s, e.id);
    if (fighting) { current(s) === e.id || fail(`It isn't ${e.name}'s turn.`); need(s, e, 'action'); }
    const skill = a.skill ?? escapeSkill(s, e, hold);
    if (fighting) s.encounter.budget.action--;
    const r = abilityCheck(s, e, { skill, escape: true }, false, hold.escapeDis ? ['escape at Disadvantage'] : []);
    const success = r.total >= hold.escape;
    ev.push({ type: 'check', id: e.id, ability: SKILLS[skill], skill, ...r, escape: hold.by, dc: hold.escape, success });
    if (success) endHold(s, e, hold.by, 'escaped', ev);
  },
  // Letting go (SRD: "the grappler can release the target at any time (no action required)"): { type: 'letGo', actor, target }.
  // No action and no turn needed, in a fight or out of one. Also how a creature frees a hand. The spec's name, `release`, is
  // already the lobby's action that gives a character up (engine/dm.js), and two actions must not share a name.
  letGo(s, a, ctx, ev) {
    const e = ent(s, a.actor), t = ent(s, a.target); control(s, e, ctx);
    (t.cond.grappled?.holds ?? []).some((h) => h.by === e.id) || fail(`${e.name} isn't grappling ${t.name}.`);
    endHold(s, t, e.id, 'released', ev);
  },
  // The Search action: one Wisdom (Perception) check against everything hidden within 15 feet, and
  // against every enemy hiding where the searcher could see it but for its hiding (its Stealth total
  // is the DC; in Dim Light the check has Disadvantage). { type: 'search', actor }
  search(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    confusedOnly(s, e, 'Search');
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
    const e = ent(s, a.actor); control(s, e, ctx);
    confusedOnly(s, e, 'Hide');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const why = hideProblem(s, e);
    if (why) fail(why);
    if (s.encounter && inFight(s, e.id)) { const time = actTime(e, 'hide', a); need(s, e, time); s.encounter.budget[time]--; }
    const r = abilityCheck(s, e, { skill: 'stealth' }), success = r.total >= HIDE_DC;
    ev.push({ type: 'check', id: e.id, ability: 'dex', skill: 'stealth', ...r, hide: true, success });
    stealthGearNote(e, ev);
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

// A feature that gives one thing for another, with no action (Font of Inspiration, Wild Resurgence): `swap` is a list of
// { id, give, get, onlyEmpty?, per? } (docs/specs/rules-expansion.md, "Font of Inspiration and Wild Resurgence"). `give` and
// `get` are a spell slot ({ slot: true } to give, one of the creature's choosing by `slot: level`; { slot: level } to get) or
// a pool ({ resource: feature id, n? }). `onlyEmpty`: only when the pool it gets has none left. `per: 'turn'`: once on each
// of the creature's own turns; `per: 'use'`: for one use of the feature itself, which comes back as its `uses` say.
// { type: 'feature', actor, feature, swap: id, slot?: level of the slot given }. Everything is checked before anything is paid.
function swap(s, e, f, a, ev) {
  up(e) || fail(`${e.name} is down.`);
  able(e);
  const list = f.swap, x = list.find((w) => w.id === a.swap) || fail(`Say which swap ${f.name} makes: ${list.map((w) => w.id).join(', ')}.`);
  const pool = (r) => featOf(e, r.resource) || fail(`${e.name} has no ${r.resource} to swap.`);
  const key = turnKey(s);
  if (x.per === 'turn' && s.encounter && inFight(s, e.id)) current(s) === e.id || fail(`${f.name} is used on ${e.name}'s own turn.`);
  if (x.per === 'turn' && key && e.swapped?.[f.id] === key) fail(`${e.name} has already used ${f.name} this turn.`);
  if (x.per === 'use') (e.uses[f.id] ?? 0) > 0 || fail(`${e.name} has no uses of ${f.name} left; they come back on a Long Rest.`);
  let level = null, n = 1;
  if (x.give.slot) {
    level = a.slot;
    (Number.isInteger(level) && level >= 1 && (e.slots?.[level] ?? 0) > 0) || fail(`Name a spell slot ${e.name} has to give up (slot: its level).`);
  } else {
    const p = pool(x.give); n = x.give.n ?? 1;
    (e.uses[p.id] ?? 0) >= n || fail(`${e.name} has no use of ${p.name} to give up.`);
  }
  if (x.get.resource !== undefined) {
    const p = pool(x.get), got = x.get.n ?? 1;
    if (x.onlyEmpty && (e.uses[p.id] ?? 0) > 0) fail(`${f.name}: ${e.name} still has uses of ${p.name}.`);
    (e.uses[p.id] ?? 0) + got <= p.uses.max || fail(`${e.name} has all its uses of ${p.name}.`);
  }
  // Paid for: from here it happens.
  if (x.per === 'use') e.uses[f.id]--;
  if (x.per === 'turn' && key) (e.swapped ??= {})[f.id] = key;
  if (level !== null) e.slots[level]--; else e.uses[featOf(e, x.give.resource).id] -= n;
  if (x.get.resource !== undefined) e.uses[featOf(e, x.get.resource).id] += x.get.n ?? 1;
  else e.slots[x.get.slot] = (e.slots[x.get.slot] ?? 0) + 1;
  // Outside a fight there are no turns to count: the limit is the DM's to judge.
  if (x.per === 'turn' && !key) ev.push({ type: 'manual', actor: e.id, name: f.name, partial: true, text: `${f.name} may be used once on each of ${e.name}'s turns. There is no turn outside a fight, so the engine cannot count them: the DM judges that limit here.` });
  const gave = level !== null ? `a level ${level} spell slot` : `${n} use of ${featOf(e, x.give.resource).name}`;
  const got = x.get.resource !== undefined ? `${x.get.n ?? 1} use of ${featOf(e, x.get.resource).name}` : `a level ${x.get.slot} spell slot`;
  ev.push({ type: 'std', id: e.id, action: `${f.name}: ${gave} for ${got}` });
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
  // A form a subclass names (`form.forms`, addition J) is allowed whatever its type and rating; any other is of a type the feature takes (`types`, with those a subclass added),
  // within its rating: the feature's own, or the rating a subclass gave an added type alone (`form.typeMaxCr`).
  if (!F.forms?.includes(a.form)) {
    const named = (F.forms ?? []).map((id) => `the ${CONTENT.monsters[id]?.name ?? id}`);
    F.types.includes(m.type) || fail(`${f.name} takes the form of a ${F.types.join(' or ')}${named.length ? `, or of ${named.join(', ')}` : ''}; the ${m.name} is not one.`);
    const cap = F.typeMaxCr?.[m.type];
    if (cap === undefined) m.cr <= F.maxCr || fail(`At ${e.name}'s level ${f.name} takes forms of Challenge Rating ${crText(F.maxCr)} or lower; the ${m.name} is ${crText(m.cr)}.`);
    else m.cr <= cap || fail(`At ${e.name}'s level ${f.name} takes ${m.type} forms of Challenge Rating ${crText(cap)} or lower; the ${m.name} is ${crText(m.cr)}.`);
  }
  (!m.speed.fly || F.fly) || fail(`At ${e.name}'s level ${f.name} can't take a form with a Fly Speed.`);
  // What the form costs: a use of the feature itself, or what a subclass's `formOf` priced it at (derive.js: `form.cost`, for the types and the named forms it added, or for all).
  const price = F.cost && ((!F.cost.types && !F.cost.forms) || F.cost.types?.includes(m.type) || F.cost.forms?.includes(a.form)) ? { res: F.cost.resource, n: F.cost.n ?? 1 } : { res: f.id, n: 1 };
  const pool = featOf(e, price.res)?.name ?? price.res;
  (e.uses[price.res] ?? 0) >= price.n || fail(price.res === f.id && price.n === 1 ? `${e.name} has no uses of ${f.name} left.`
    : `${e.name} has ${e.uses[price.res] ?? 0} use${(e.uses[price.res] ?? 0) === 1 ? '' : 's'} of ${pool} left; the form of ${/^[aeiou]/i.test(m.name) ? 'an' : 'a'} ${m.name} costs ${price.n}.`);
  if (time && fighting) need(s, e, time);
  // The creature itself at its new size (`...e`: its id and its ride), so the other half of a ridden pair is never in
  // its way (space.js, `paired`; DEBT W13).
  const body = { ...e, size: tpl.size };
  (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for a ${m.name} there.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos, gridOf(s.map))) || fail(`Someone is in the way of ${e.name} becoming a ${m.name}.`);

  // Paid for: from here it happens.
  if (time && fighting) enc.budget[time]--;
  e.uses[price.res] -= price.n;
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


// ---------- using a magic item (docs/specs/table-ui.md, E18; DEBT C14) ----------
// { type: 'use', actor, item: key on the sheet ("i3"), which?: the use (0 for the first of the item's `activate`),
//   target? } By its controller or the DM. The item must be worn or held where its magic works, and attuned if
// it needs it (SRD "Attunement"). A use takes its `time` in a fight, on the creature's own turn (an `action` use
// is a Magic action: SRD "Activating a Magic Item"); spends `cost` charges (an item's charges are its sheet entry's
// `charges`, full when not set); and a `consumed` item is gone once used (SRD "Consumable Items").
// What it does:
//   effects   run on the effect runner, as a feature's steps are. A potion works on its drinker: the user, or
//             `target`, a creature within 5 feet it is administered to (SRD "Potions": a Bonus Action either way).
//   spell     a spell cast from the item, through the cast path (casting.js, castFromItem; #284): SRD "Spells
//             Cast from Items": no slot, no components, its lowest level, its own casting time, the user's own
//             spellcasting ability unless the item gives a DC (+0 and the Proficiency Bonus for a user with none).
//             The action takes the spell's aim as `cast` does (`target`, `targets`, `hex`, `choice`, `spare`),
//             and `level` where extra charges raise it (`upTo`: one charge a level past the use's own, Wand of
//             Magic Missiles, Staff of Healing's Cure Wounds). A use with `self` targets only its user.
//   A Spell Scroll (an item with variant "spell") is read at its spell's casting time, by a creature whose class
//   spell list has the spell (otherwise it is unintelligible: refused); a spell above the level it can cast takes an
//   ability check with its spellcasting ability against DC 10 + the spell's level, and on a failure the spell
//   is lost with the scroll (SRD "Spell Scroll"). Its save DC and attack bonus come from the spell's level. It
//   keeps the spell's Verbal and Somatic components (only Material ones go), so it can be countered (and is then
//   kept, as an interrupted reading) and its Verbal component gives a hiding reader away.
// Events: `item { id, key, item, pack, use, target?, charges?, max?, consumed? }`, a `gear` with `why: 'used'`
// and `taken` for a consumed item (a scroll: once it is cast or has faded), then the effects' or the spell's own events.
const SCROLL_STATS = [[2, 13, 5], [4, 15, 7], [6, 17, 9], [8, 18, 10], [9, 19, 11]];      // SRD Spell Scroll: up to this level, save DC, attack bonus
export const scrollStats = (level) => { const [, dc, attack] = SCROLL_STATS.find(([n]) => level <= n); return { dc, attack }; };
const POTION_REACH = 5;                                                                     // administered to a creature within reach
// What an item asks of whoever holds it to work, as words: "held", "worn".
const wornWord = (def) => (def.wear === 'weapon' || def.wear === 'shield' ? 'held' : 'worn');
// The highest level of spell the creature can cast with its own slots (0: cantrips at most).
const castLevel = (e) => Math.max(0, ...Object.entries(e.slotsMax ?? {}).filter(([, n]) => n > 0).map(([l]) => Number(l)));
// The default name of a use, for the client and the log.
function useLabel(def, u, x) {
  if (u.name) return u.name;
  if (def.variant === 'spell') return `Read: ${CONTENT.spells[x.spell]?.name ?? 'the spell'}`;
  if (u.spell) return `Cast ${CONTENT.spells[u.spell]?.name ?? u.spell}`;
  return def.category === 'potion' ? 'Drink' : 'Use';
}

// Checks one use of an item, changing nothing. Returns what using it takes, or refuses.
function planItem(s, e, a) {
  e.sheet || fail(`${e.name} was typed in by hand, so holds pack items by name only. Build a sheet for them first.`);
  a.object === undefined || fail('Use an object or an item, not both.');
  const x = typeof a.item === 'string' && Array.isArray(e.sheet.items) ? e.sheet.items.find((y) => y?.id === a.item) : null;
  x || fail(`${e.name} has no such item.`);
  const def = CONTENT.items[x.item] || fail(`${e.name} has no such item.`), name = itemName(def, x);
  (def.activate ?? []).length || fail(`${name} has nothing to use; its magic works while it is ${wornWord(def)}.`);
  const which = a.which ?? 0;
  (Number.isInteger(which) && which >= 0 && which < def.activate.length) || fail(`${name} has ${def.activate.length === 1 ? 'one use' : `uses 0 to ${def.activate.length - 1}`}.`);
  const u = def.activate[which], label = useLabel(def, u, x);
  up(e) || fail(`${e.name} is down.`);
  able(e);
  itemActive({ x, def }) || fail(def.wear !== 'carried' && x.equipped !== true ? `${name} must be ${wornWord(def)} to be used.` : `${e.name} must be attuned to ${name} to use it.`);
  // A Spell Scroll: the spell on it, and its casting time.
  let spell = null, time = u.time;
  if (def.variant === 'spell') {
    const sp = SPELLS[x.spell] || fail(`${name} holds no spell the engine knows.`);
    classesOf(e.sheet).some((k) => k.c?.casting && (sp.def.classes ?? []).includes(k.c.id)) || fail(`${sp.name} is not on ${e.name}'s spell list, so the scroll is unintelligible to them.`);
    sp.time !== 'reaction' || fail(`${sp.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    (sp.turn || !s.encounter) || fail(`${sp.name} takes longer than a turn to cast, so it can't be read during a fight.`);
    spell = sp; time = sp.time;
  } else if (u.spell) {
    spell = SPELLS[u.spell] || fail(`${name} casts a spell the engine does not know.`);
    spell.time !== 'reaction' || fail(`${spell.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    time = spell.time;                                   // a spell from an item takes its normal casting time
  }
  time !== 'reaction' || fail(`${label} is a Reaction. The engine does not take that reaction yet; the DM applies it.`);
  // The spell's level: the use's own (the spell's lowest, a scroll's spell's), or more for more charges (`upTo`).
  const base = spell ? (def.variant === 'spell' ? spell.level : u.level ?? spell.level) : 0;
  let level = base;
  if (a.level !== undefined) {
    (spell && u.upTo) || fail(`${label} is cast at one level only.`);
    (Number.isInteger(a.level) && a.level >= base && a.level <= u.upTo) || fail(`${label} is cast at level ${base} to ${u.upTo}.`);
    level = a.level;
  }
  // Charges: one more a level past its own.
  const max = def.charges?.max, have = def.charges ? x.charges ?? max : null, cost = (u.cost ?? 0) + (level - base);
  if (cost) have >= cost || fail(`${name} has ${have} charge${have === 1 ? '' : 's'} left; ${label}${level > base ? ` at level ${level}` : ''} takes ${cost}.`);
  // Who it works on: a potion on its drinker; a spell on whom the spell is aimed at (the cast path checks it);
  // anything else on its user (or as its steps say, through the DM).
  let target = e;
  if (!spell && a.target !== undefined && a.target !== e.id) {
    def.category === 'potion' || fail(`${label} works on ${e.name}; it is not given to another.`);
    target = ent(s, a.target);
    !target.dead || fail(`${target.name} is dead.`);
    apart(s, e, target) * FT <= POTION_REACH || fail(`${target.name} is out of reach.`);
    walled(s, e, target);
  }
  // In a fight: on its own turn, for the time it takes. An action use is a Magic action, which the extra
  // action from Action Surge can't be (as for casting a spell).
  const enc = s.encounter, fighting = !!enc && inFight(s, e.id), spend = time === 'free' ? null : time;
  if (fighting) {
    need(s, e, spend);
    if (spend === 'action' && enc.flags[`surge:${e.id}`] && enc.flags[`magic:${e.id}`]) fail('The extra action from Action Surge can\'t be used for a Magic action.');
    if (target !== e) inFight(s, target.id) || fail(`${target.name} is outside the battle.`);
  }
  return { x, def, u, which, name, label, spell, level, time: spend, fighting, have, max, cost, target };
}

// What a creature could do with its items right now, for the client's Items tab: one row a use, with `why` it
// can't ('' if it can). [{ key, item, pack, which, label, time, cost, charges, max, consumed, spell, reach, why }]
export function itemUsesFor(s, e) {
  const out = [];
  if (!e?.sheet || !Array.isArray(e.sheet.items)) return out;
  for (const x of e.sheet.items) {
    const def = CONTENT.items[x?.item];
    if (!def?.activate) continue;
    def.activate.forEach((u, which) => {
      let why = '';
      try { planItem(s, e, { item: x.id, which }); } catch (err) { if (!(err instanceof RuleError)) throw err; why = err.message; }
      const sp = def.variant === 'spell' ? SPELLS[x.spell] : u.spell ? SPELLS[u.spell] : null;
      out.push({ key: x.id, item: itemName(def, x), pack: def.id, which, label: useLabel(def, u, x), time: sp ? sp.time : u.time,
        cost: u.cost ?? 0, ...(def.charges ? { charges: x.charges ?? def.charges.max, max: def.charges.max } : {}), ...(u.consumed ? { consumed: true } : {}),
        ...(sp ? { spell: sp.id, level: def.variant === 'spell' ? sp.level : u.level ?? sp.level, ...(u.upTo ? { upTo: u.upTo } : {}), ...(u.self ? { self: true } : {}) } : {}),
        reach: def.category === 'potion' ? POTION_REACH : 0, why });
    });
  }
  return out;
}

function useItem(s, a, ctx, ev) {
  const e0 = ent(s, a.actor); control(s, e0, ctx);
  const p = planItem(s, e0, a), { def, u, name, label, spell } = p;
  if (spell) return itemSpell(s, a, ctx, ev, p);
  // A consumed item that gives its holder something (none in the pack does today) is taken off the sheet by
  // making the character again, checked before anything is spent; any other is simply taken off.
  const remakes = u.consumed && !!(def.grants || def.bonus || def.base || def.wear === 'shield');
  const takeOut = () => {
    const sheet = structuredClone(s.entities[e0.id].sheet);
    sheet.items = sheet.items.filter((y) => y.id !== p.x.id);
    if (sheet.attuning?.item === p.x.id) delete sheet.attuning;
    if (!sheet.items.length) delete sheet.items;
    if (remakes) resheet(s, s.entities[e0.id], sheet, ev); else s.entities[e0.id].sheet = sheet;
  };
  if (remakes) takeOut();
  const e = s.entities[e0.id], target = p.target === e0 ? e : p.target;

  // Paid for: from here it happens.
  if (p.fighting && p.time) { s.encounter.budget[p.time]--; if (p.time === 'action') s.encounter.flags[`magic:${e.id}`] = true; }
  let left;
  if (p.cost) { const x = e.sheet.items.find((y) => y.id === p.x.id); x.charges = left = p.have - p.cost; }
  ev.push({ type: 'item', id: e.id, key: p.x.id, item: name, pack: def.id, use: label, ...(target !== e ? { target: target.id } : {}),
    ...(left !== undefined ? { charges: left, max: p.max } : {}), ...(u.consumed ? { consumed: true } : {}) });
  if (left === 0) lastCharge(e, name, ev);
  if (u.consumed) {
    if (!remakes) takeOut();
    ev.push({ type: 'gear', id: e.id, item: name, key: p.x.id, pack: def.id, why: 'used', taken: true });
  }

  // Its effect steps, on the runner.
  const steps = structuredClone(u.effects);
  const fx = boundEffect(s, name, e.id, steps);
  begin(s, { steps, actor: e.id, targets: [target.id], src: { name, healMod: 0, ...(fx ? { fx: fx.id } : {}) } });
  resolve(s, ev);
  if (fx?.bound) settle(s, ev, fx, [target]);
  checkEnd(s, ev);
}

const lastCharge = (e, name, ev) => ev.push({ type: 'manual', actor: e.id, name, partial: true,
  text: `${name} has no charges left. What spending the last one does, if anything, is in its description (often a d20 roll that can destroy it): the DM settles it.` });

// A spell cast from an item (planned by planItem), through the cast path: the action's aim (`target`,
// `targets`, `hex`, `choice`, `spare`) goes to `cast` as it is. Its save DC and attack bonus: a scroll's
// from the spell's level, else the item's DC if it gives one, else the user's own spellcasting ability (+0 and
// the Proficiency Bonus for a user with none); a heal's "spellcasting ability modifier" likewise (+0 for none).
function itemSpell(s, a, ctx, ev, p) {
  const { def, u, name, label, spell, x } = p, id = a.actor, scroll = def.variant === 'spell';
  const e0 = s.entities[id];
  const own = e0.castAbil ? spellStats(e0, s, spell.id) : { dc: 8 + (e0.prof ?? 0), attack: e0.prof ?? 0 };
  const st = scroll ? scrollStats(spell.level) : { dc: u.dc ?? own.dc, attack: own.attack };
  const base = scroll ? spell.level : u.level ?? spell.level;
  const { type: _t, item: _i, which: _w, level: _l, ...aim } = a;
  const comps = scroll ? (spell.def.components ?? []).filter((c) => c !== 'm') : [];
  castFromItem(s, { ...aim, type: 'cast', actor: id, spell: spell.id }, ctx, ev, {
    name, level: p.level, dc: st.dc, attack: st.attack, comps, ...(u.self ? { self: true } : {}),
    healMod: e0.castAbil ? mod(e0.abil[castAbilOf(e0, spell.id)] ?? 10) : 0,
    spend(e) {
      let left;
      if (p.cost) { const y = e.sheet.items.find((z) => z.id === x.id); y.charges = left = p.have - p.cost; }
      ev.push({ type: 'item', id: e.id, key: x.id, item: name, pack: def.id, use: label, ...(p.level !== base ? { level: p.level } : {}),
        ...(left !== undefined ? { charges: left, max: p.max } : {}) });
      if (left === 0) lastCharge(e, name, ev);
    },
    // A Spell Scroll of a spell above what its reader can cast: an ability check first; on a failure it fades.
    ...(scroll && spell.level > castLevel(e0) ? { check(e) {
      const ability = classesOf(e.sheet).filter((k) => k.c?.casting && (spell.def.classes ?? []).includes(k.c.id)).map((k) => k.c.casting.ability)
        .sort((m, n) => mod(e.abil[n] ?? 10) - mod(e.abil[m] ?? 10))[0];
      const dc = 10 + spell.level, r = abilityCheck(s, e, { ability });
      ev.push({ type: 'check', id: e.id, ability, ...r, dc, success: r.total >= dc, what: `${name}: casting a level ${spell.level} spell` });
      if (r.total < dc) ev.push({ type: 'std', id: e.id, action: `${name}: the spell fades from the scroll` });
      return r.total >= dc;
    } } : {}),
    // A consumed item (a scroll) goes once the spell is cast or has faded.
    ...(u.consumed ? { done(e) {
      const sheet = e.sheet;
      sheet.items = sheet.items.filter((y) => y.id !== x.id);
      if (sheet.attuning?.item === x.id) delete sheet.attuning;
      if (!sheet.items.length) delete sheet.items;
      ev.push({ type: 'gear', id: e.id, item: name, key: x.id, pack: def.id, why: 'used', taken: true });
    } } : {}),
  });
}
