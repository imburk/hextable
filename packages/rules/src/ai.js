// Monster brain. Returns the next action for a creature on its turn.
// This is the seam for smarter agents: anything that reads state and returns
// an action (a script, an LLM-driven DM, an AI character) plugs in the same way.
//
// It is called again after each action until it ends the turn. It is simple and deterministic:
// the same state always gives the same answer. Whoever calls it ends the turn if the engine
// refuses what it returns, so a refusal can never loop.
import { moveOptions, holdsOf, current, up, hostile, inFight, unblocked, FT, fromPool, actionSpent, partRefusal, areaTargets, aimArea, castAbilOf, dying, mod, hideProblem, ownerOf, awayHow, commandedNow, steering, opportunityAttack } from './engine.js';
import { attackRefusal, spareStrike, steadiest } from './weapons.js';
import { SPELLS } from './content/index.js';
import { actionProfile, scaleSteps, stepKind, targetCount, walk } from './effects.js';
import { incapacitatedBy } from './modifiers.js';
import { apart, apartAt, ground } from './space.js';
import { canSee, hiddenFrom } from './sight.js';
import { unknown } from './vision.js';

// Does this creature know where that one is? Not if it is hiding from it, unless Tremorsense
// pinpoints it: both on the ground and within range (it is still unseen, so attacks at it have Disadvantage).
export function aware(s, e, o) {
  if (!hiddenFrom(o, e)) return true;
  const t = e.senses?.tremorsense ?? 0;
  return t > 0 && apart(s, e, o) * FT <= t && !!ground(s.map, e.pos) && !!ground(s.map, o.pos);
}

export function aiStep(s, id, opts) {
  const e = s.entities[id], end = { type: 'endTurn', actor: id };
  // While an action waits for a player's reaction (reactions.js) nothing else can happen: no move,
  // not even ending the turn. The answer, from the player or the DM, carries the table on.
  if (!e || current(s) !== id || s.pending) return null;
  // A companion (a creature with a `bond`) is played by the companion brain (below). Everything after this line is the
  // monster AI as it was before the brain, for every creature with no bond (companions-brain-replay.test.js).
  if (e.bond) return companionStep(s, id, opts);
  // Dropped to 0 in its own turn (an Opportunity Attack on its way): its turn ends, as the brain ends a companion's,
  // instead of waiting for the DM (DEBT W24). A character at 0 is its player's and is not played here.
  // A stand-in (a character set aside under `standIn`, ai-casting.md Decision 1) is played here, so for it too the turn ends.
  if (!up(e)) return e.kind === 'pc' && awayHow(s, e) !== 'standIn' ? null : end;
  // A mount its rider steers moves on its rider's turn and can only Dash, Disengage or Dodge (engine/shared.js,
  // control): on a turn of its own (its rider got back on after its place) it is offered nothing it would be refused,
  // and its turn ends (DEBT W24).
  if (steering(s, e)) return end;
  // A party creature acts only on what the party knows (ai-casting.md, Decision 2): it reads the copy the companion brain reads,
  // with the creatures the party is not told of left out. A foe reads the true state, as it always has (`knownTo` returns `s`).
  const k = knownTo(s, e);
  // It does not act on creatures it has not found.
  const foes = Object.values(k.entities).filter((o) => up(o) && hostile(o, e) && inFight(k, o.id) && aware(k, e, o));
  // One whose stat block has Stealth may open the fight by hiding, if it is somewhere it can.
  const b = k.encounter.budget;
  if (k.encounter.round === 1 && !e.hiding && e.skillBonus?.stealth !== undefined && (e.features?.nimbleEscape ? b.bonus > 0 : b.action > 0) && !hideProblem(k, e)) return { type: 'hide', actor: id };
  if (!foes.length) return end;
  return e.actions ? withActions(k, e, foes) : withAttacks(k, e, foes);
}

// A creature held by someone, with nothing it can hit from where it stands and no one of its own held, takes the Escape action
// (docs/specs/grapple-shove.md, Decision 8; SRD "Grappling": the held creature uses its action for a Strength (Athletics) or Dexterity
// (Acrobatics) check against the escape DC). `canHit`: it has an attack or an area that reaches a foe now, so it fights as it does
// without a hold (its attacks on anyone but the grappler have Disadvantage by the Grappled condition, and it does not weigh that). A
// hold with no escape DC in the game (the DM's) cannot be escaped by the engine, so it is left to the DM and the creature fights on.
// With more than one hold it escapes the one with the lowest DC; `skill` is left out, so the engine takes the better of the two.
// It never releases a creature it holds: nothing here sends `letGo`.
function escaping(s, e, canHit) {
  if (canHit || holdsOf(s, e).length || s.encounter?.budget.action < 1) return null;
  const holds = (e.cond.grappled?.holds ?? []).filter((h) => Number.isInteger(h.escape));
  if (!holds.length) return null;
  const easiest = holds.reduce((a, h) => (h.escape < a.escape ? h : a));
  return { type: 'escape', actor: e.id, from: easiest.by };
}

// Ties between foes at one distance break by the lower Hit Points for a monster, as ever. A party creature never reads a foe's
// Hit Points (players are not sent them: ai-casting.md, Decision 2): it breaks them by id.
const byHp = (e, x, y) => (e.side === 'party' ? 0 : x.hp - y.hp);

// Move to the spot that brings it nearest to any foe, if that is nearer than where it stands.
function approach(s, e, foes) {
  const near = (pos) => Math.min(...foes.map((f) => apartAt(s, e, pos, f, f.pos)));       // between the nearest parts of the two, whatever their size
  let best = null;
  for (const [k, v] of moveOptions(s, e)) {
    if (!v.canStop) continue;
    const nd = near(v.h);
    if (!best || nd < best.nd || (nd === best.nd && v.cost < best.cost)) best = { k, nd, cost: v.cost, h: v.h };
  }
  return best && best.nd < near(e.pos) ? { type: 'move', actor: e.id, to: best.h } : null;
}

// A creature that plays from its actions (one made from a pack monster).
// `lim.noAttack`: a companion that can't attack (`bond.noAttack`, companions.md C1) is offered no action with an attack
// roll and no Multiattack (the engine would refuse them). Absent for a monster, so nothing changes for one.
// Each action with its profile, leaving out one the engine cannot profile (a creature target with neither reach nor range): it is
// skipped, never thrown, so the creature plays on with what it can do (#421).
function profiled(actions) {
  const out = [];
  for (const def of actions) { try { out.push({ def, p: actionProfile(def) }); } catch (err) { if (!(err instanceof TypeError)) throw err; } }
  return out;
}
function withActions(s, e, foes, lim = {}) {
  const id = e.id, end = { type: 'endTurn', actor: id }, b = s.encounter.budget;
  // Nearest first, then the most hurt, then by id, so the order never depends on anything else.
  const order = [...foes].sort((x, y) => apart(s, e, x) - apart(s, e, y) || byHp(e, x, y) || (x.id < y.id ? -1 : 1));
  const all = profiled(e.actions).filter((x) => x.p.harmful && !actionSpent(e, x.def) && (x.p.time === 'action' || b.bonus > 0) && !(lim.noAttack && rolled(x.p)));
  const reaches = (x, t) => x.p.aim === 'creature' && apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t) && !partRefusal(s, e, x.def, [t]);
  const act = (x, extra) => ({ type: 'act', actor: id, action: x.def.id, ...extra });
  // The best attack it can make right now among `list`: at the nearest foe it can reach, melee
  // if that reaches, else ranged, else anything aimed at one creature.
  const strike = (list) => {
    for (const t of order) {
      const pick = list.find((x) => x.p.roll === 'melee' && reaches(x, t)) ?? list.find((x) => x.p.roll === 'ranged' && reaches(x, t)) ?? list.find((x) => reaches(x, t));
      if (pick) return act(pick, { target: t.id });
    }
    return null;
  };
  // Where to aim an area so that it catches the most foes and none of its own side (itself included).
  const aim = (x) => {
    let best = null;
    const spots = x.p.area.shape === 'emanation' ? [null] : order.map((t) => t.pos);
    const most = x.def.target.area.choose;
    for (const hex of spots) {
      let caught = areaTargets(s, e, x.def, hex);
      if (!caught) continue;
      // An area that lets it choose (`choose`): it picks up to that many of the foes caught, the nearest first and then the most hurt (the
      // order it strikes in), and no ally is hurt however many stand in it. Without `choose` every one caught is hit, so it aims where none is an ally.
      if (most) caught = order.filter((t) => caught.includes(t) && up(t) && inFight(s, t.id)).slice(0, most);
      else if (caught.some((t) => !hostile(t, e))) continue;
      const n = caught.filter((t) => up(t) && inFight(s, t.id)).length;
      if (n && (!best || n > best.n)) best = { n, extra: { ...(hex ? { hex: { q: hex.q, r: hex.r, z: hex.z } } : {}), ...(most ? { targets: caught.map((t) => t.id) } : {}) } };
    }
    return best;
  };
  const areas = all.filter((x) => x.p.aim === 'area').map((x) => ({ x, at: aim(x) })).filter((z) => z.at).sort((p, q) => q.at.n - p.at.n);
  const meleeIn = (list) => list.some((x) => x.p.roll === 'melee');
  // A creature with a melee attack that reaches nobody yet walks in before it shoots.
  const closeIn = (list) => (meleeIn(list) && b.move >= FT && !order.some((t) => list.some((x) => x.p.roll === 'melee' && reaches(x, t))) ? approach(s, e, foes) : null);

  // In the middle of a Multiattack: make the next attack, moving first if nothing reaches.
  if (b.attacks) {
    const left = all.filter((x) => fromPool(b, x.def.id));
    const mv = closeIn(left);
    if (mv) return mv;
    const hit = strike(left.filter((x) => x.p.aim === 'creature'));
    if (hit) return hit;
    const area = areas.find((z) => left.includes(z.x));
    if (area) return act(area.x, area.at.extra);
    return end;                                      // whatever is left cannot reach anyone: it is lost
  }
  // A Bonus Action (a gaze, a nimbus) when it would catch two or more; then the turn goes on.
  const quick = areas.find((z) => z.x.p.time === 'bonus' && z.at.n >= 2);
  if (quick) return act(quick.x, quick.at.extra);
  if (b.action < 1) return end;
  const main = (list) => list.filter((x) => x.p.time === 'action');
  // Held, and nothing to hit from here: it gets out (escaping).
  const freed = escaping(s, e, order.some((t) => main(all).some((x) => x.p.aim === 'creature' && reaches(x, t))) || areas.some((z) => z.x.p.time === 'action'));
  if (freed) return freed;

  // A breath weapon or the like, when it would catch two or more.
  const big = areas.find((z) => z.x.p.time === 'action') ?? null;
  if (big?.at.n >= 2) return act(big.x, big.at.extra);
  const weapons = main(all).filter((x) => x.p.aim === 'creature' && (x.p.roll === 'melee' || x.p.roll === 'ranged'));
  const multi = lim.noAttack ? null : e.actions.find((def) => def.multiattack);
  if (multi) {
    const parts = main(all).filter((x) => actionProfile(multi).lists.some((l) => l.some((en) => (Array.isArray(en.action) ? en.action : [en.action]).includes(x.def.id))));
    const mv = closeIn(parts);
    if (mv) return mv;
    if (strike(parts.filter((x) => x.p.aim === 'creature'))) return { type: 'act', actor: id, action: multi.id };
  }
  const mv = closeIn(weapons);
  if (mv) return mv;
  const hit = strike(weapons);
  if (hit) return hit;
  // Nothing else reaches: an area that catches one, or a save aimed at one creature.
  if (big) return act(big.x, big.at.extra);
  const other = strike(main(all).filter((x) => x.p.aim === 'creature'));
  if (other) return other;
  if (meleeIn(weapons) && b.move < FT) return { type: 'dash', actor: id };
  return end;
}

// A creature with flat attack records only (a monster from a game saved without its template, a built character).
// A built spellcaster casts first (casterStep, below); what it does not cast, it plays as any creature with attacks does.
// `lim.noAttack`: a companion that can't attack casts only spells with no attack roll and otherwise ends its turn.
function withAttacks(s, e, foes, lim = {}) {
  const id = e.id, end = { type: 'endTurn', actor: id }, b = s.encounter.budget;
  const cast = casterStep(s, e, foes, lim);
  if (cast) return cast;
  if (lim.noAttack) return end;
  const open = (t) => unblocked(s, e, t);                    // no wall or shut door in the way
  const target = foes.reduce((a, f) => (apart(s, e, f) < apart(s, e, a) || (apart(s, e, f) === apart(s, e, a) && (e.side === 'party' ? f.id < a.id : f.hp < a.hp)) ? f : a));
  // Only an attack the engine would allow now (weapons.js: Two-Handed beside a Shield, a Loading weapon already fired this action).
  const allowed = (a) => !attackRefusal(s, e, a, fromPool(b, a.id));
  // The Unarmed Strike every built character has (derive.js) is only a last resort (weapons.js, spareStrike).
  const spare = (a) => spareStrike(e, a);
  // Among its allowed attacks of a kind, not a Heavy weapon it swings with Disadvantage if another will do (weapons.js, steadiest).
  let melee = steadiest(e, e.attacks.filter((a) => a.type === 'melee' && !spare(a) && allowed(a))), ranged = steadiest(e, e.attacks.filter((a) => a.type === 'ranged' && allowed(a)));
  const d = apart(s, e, target);
  // With none, it punches a foe beside it (and does not walk in to punch: that is the Dodge it took before).
  if (!melee && !ranged && d <= 1 && open(target)) melee = e.attacks.find((a) => spare(a) && allowed(a));
  const can = b.action > 0 || !!b.attacks;
  // A party spellcaster that has cast this turn does not walk toward foes afterwards: it keeps the range it cast from (ai-casting.md, amendment 2).
  const flags = s.encounter.flags ?? {}, cast1 = e.side === 'party' && !!e.spells?.length && !!(flags.slot || flags[`magic:${id}`]);
  // Held, with nothing to hit from here: it gets out (escaping).
  if (b.action > 0 && !b.attacks) {
    const freed = escaping(s, e, !!(melee && d <= 1 && open(target)) || !!(ranged && d * FT <= ranged.range[1] && open(target)));
    if (freed) return freed;
  }
  // Attacks it has but may not make now (a Shield and nothing but a Two-Handed weapon): it takes the Dodge action rather than lose the turn.
  if (b.action > 0 && !b.attacks && !melee && !ranged && e.attacks.some((a) => !spare(a)) && !e.cond?.dodging) return { type: 'dodge', actor: id };
  if (can && melee && d <= 1 && open(target)) return { type: 'attack', actor: id, target: target.id, attack: melee.id };
  if (melee && d > 1 && b.move >= FT && !cast1) { const mv = approach(s, e, foes); if (mv) return mv; }
  if (can && ranged && d * FT <= ranged.range[1] && open(target)) return { type: 'attack', actor: id, target: target.id, attack: ranged.id };
  if (b.action > 0 && melee && d > 1 && b.move < FT && !cast1) return { type: 'dash', actor: id };
  return end;
}

// ---------- a built spellcaster's spells (docs/specs/ai-casting.md, stage AC1) ----------
// A built character the AI plays (a creature with `spells` and no `actions`) casts its damage and healing spells before it
// attacks with a weapon. Everything here is the AI's choice, not an SRD rule, so it is a rule of the spec: see the spec's
// Decisions 3 to 7. It reads the state it is given (for a party creature, the copy of `knownTo`) and never writes to it. It
// uses no die, no clock and no number the players are not sent (no monster Armor Class, save bonus or Hit Points): every
// attack roll lands 0.65 of the time, a save fails 0.5 of the time, whoever the target is, so the same state gives the same
// answer and a choice says nothing a player could not have known.
const SHAPE = new WeakMap();
const HIT = 0.65, DISADV = HIT * HIT;                           // an attack roll lands; the same with Disadvantage (ai-casting.md, Decision 4)
const FAIL = 0.5, FAIL_HALF = 0.75;                             // a save that does nothing on a success; one that still halves the damage
const refusal = (err) => err?.constructor?.name === 'RuleError';  // what aimArea throws for an area it cannot lay out
const idOrder = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
// The average of "NdM+k" (or "k"): NaN for anything else.
function avgOf(dice) {
  if (typeof dice !== 'string') return NaN;
  const m = /^(?:(\d+)d(\d+))?([+-]?\d+)?$/.exec(dice);
  if (!m || (m[1] === undefined && m[3] === undefined)) return NaN;
  return (m[1] ? (+m[1] * (+m[2] + 1)) / 2 : 0) + (m[3] ? +m[3] : 0);
}
// What one creature is worth to a spell's steps: the expected damage, or for healing the expected Hit Points regained
// (before they are capped at what the target is missing). `hit` is the chance of an attack roll landing (it depends on
// the attack's kind), `heal` what the caster's spellcasting modifier adds to a healing roll.
function worth(steps, hit, heal) {
  let t = 0;
  for (const st of steps ?? []) {
    if ('damage' in st) t += avgOf(st.damage) * (st.times ?? 1);
    else if ('heal' in st) t += avgOf(st.heal) + (st.addMod ? heal : 0);
    else if ('attack' in st) { const p = hit(st.attack); t += p * worth(st.onHit, hit, heal) + (1 - p) * worth(st.onMiss, hit, heal); }
    else if ('save' in st) { const f = st.half ? FAIL_HALF : FAIL; t += f * worth(st.onFail, hit, heal) + (1 - FAIL) * worth(st.onSuccess, hit, heal); }
  }
  return t;
}
// What a spell is to the casting AI: { kind: 'damage' | 'heal', attack } or null if the AI does not cast it
// (Decision 3). Worked out from the spell's data, so a homebrew spell of the same shape joins.
function castShape(sp) {
  if (SHAPE.has(sp)) return SHAPE.get(sp);
  let out = null;
  const d = sp.def;
  if (d && sp.turn && sp.time !== 'reaction' && (sp.aim === 'creature' || sp.aim === 'area') && !d.choice && !d.zone && !d.terrain && !sp.summon && !sp.teleport && !d.concentration) {
    let plain = true, dmg = false, heal = false, attack = false;
    walk(d.effects, (st) => {
      const kind = stepKind(st);
      if (!['attack', 'save', 'damage', 'heal', 'modifier', 'condition', 'move'].includes(kind)) plain = false;
      if (kind === 'damage') dmg = true;
      if (kind === 'heal') heal = true;
      if (kind === 'attack') attack = true;
    });
    if (plain && dmg !== heal && (dmg ? sp.harmful : !sp.harmful) && Number.isFinite(worth(d.effects, () => HIT, 0))) out = { kind: dmg ? 'damage' : 'heal', attack };
  }
  SHAPE.set(sp, out);
  return out;
}
// Does the casting AI cast this spell, and as damage or healing? ('damage', 'heal' or null; the tests print the list from the pack.)
export const aiCastable = (sp) => castShape(sp)?.kind ?? null;

// One action of a built spellcaster's turn, or null if it has none to cast (then `withAttacks` plays on: a weapon, a move, the end
// of its turn). The order is Decision 5: (1) a creature of its side at 0 Hit Points; (2) one badly hurt, in a hard fight; (3) the best
// damage, paying for a slot only where the spec says.
export function casterStep(s, e, foes, lim = {}) {
  const enc = s.encounter, b = enc?.budget, id = e.id;
  // Not in a fight, in the middle of an Attack action, or nothing left to cast with.
  if (!enc || !b || b.attacks || (b.action < 1 && b.bonus < 1)) return null;
  if (!e.spells?.length || e.actions || e.form || incapacitatedBy(e) || (s.effects ?? []).some((fx) => fx.source === id && fx.noSpells)) return null;
  const flags = enc.flags ?? {};
  const known = [];
  e.spells.forEach((sid, i) => {
    const sp = Object.hasOwn(SPELLS, sid) ? SPELLS[sid] : null, sh = sp && castShape(sp);
    if (sh && !(lim.noAttack && sh.attack)) known.push({ sp, i, kind: sh.kind });
  });
  if (!known.length) return null;

  // What it reads of its own side: Hit Points are in every party creature's open record.
  const mine = Object.values(s.entities).filter((o) => !o.dead && !hostile(o, e) && inFight(s, o.id));
  const upMine = mine.filter(up), downMine = mine.filter((o) => !up(o) && o.id !== id);
  const missing = (o) => o.maxHp - o.hp, badly = (o) => up(o) && o.hp * 4 <= o.maxHp;
  // A hard fight (amendment 1 to Decision 5): the foes able to act outnumber the creatures of its side able to act, or one of its side is
  // at 0 Hit Points or at a quarter or less.
  const able = (o) => !incapacitatedBy(o);
  const hard = foes.filter(able).length > upMine.filter(able).length || downMine.length > 0 || upMine.some(badly);
  const near = (x, y) => apart(s, e, x) - apart(s, e, y) || idOrder(x, y);
  const order = [...foes].sort(near);
  const rank = new Map(order.map((t, i) => [t.id, i]));
  // A ranged spell attack made while an enemy that sees the caster and is not Incapacitated is within 5 feet has Disadvantage (SRD, 2059-2066).
  // For a party creature, what the party can know: the foe's senses are a stat block it is not sent, so it assumes a foe beside it sees
  // (unless it is Blinded, which the party sees). A foe's creature reads the engine's own test.
  const sees = (o) => (e.side === 'party' ? !o.cond?.blinded : canSee(s, o, e) !== 'no');
  const close = Object.values(s.entities).some((o) => up(o) && hostile(o, e) && !incapacitatedBy(o) && apart(s, o, e) <= 1 && sees(o));
  const hit = (kind) => (kind === 'ranged' && close ? DISADV : HIT);

  // Slots. One slot a turn (the engine's rule), the lowest that can cast the spell, and one kept back for a downed ally by a caster that
  // knows a healing spell: `keep` is true for every cast but the first step's.
  const left = (l) => e.slots?.[l] ?? 0;
  const mends = known.filter((x) => x.kind === 'heal' && x.sp.level > 0).map((x) => x.sp.level);
  const keepFrom = mends.length ? Math.min(...mends) : null;
  const pool = () => { let n = 0; for (let l = keepFrom; l <= 9; l++) n += left(l); return n; };
  const slotFor = (sp, keep) => {
    if (sp.level === 0) return 0;
    if (flags.slot) return null;
    for (let l = sp.level; l <= 9; l++) if (left(l) > 0) return keep && keepFrom !== null && l >= keepFrom && pool() < 2 ? null : l;
    return null;
  };
  const usable = (x) => (x.sp.time === 'action' ? b.action > 0 && !(flags[`surge:${id}`] && flags[`magic:${id}`]) : b.bonus > 0);
  const cast = (x, slot, fields) => ({ type: 'cast', actor: id, spell: x.sp.id, ...(slot > x.sp.level ? { slot } : {}), ...fields });
  // Can the spell, cast from `from`, reach this creature: in range, nothing solid between, and seen.
  const reaches = (sp, t, from = e, harmful = true) => !t.dead && inFight(s, t.id) && (t.id === from.id ? !harmful : apart(s, from, t) * FT <= sp.range && unblocked(s, from, t) && canSee(s, from, t) !== 'no');
  const caught = (sp, hex) => { try { return aimArea(s, e, sp.name, sp.area, sp.range, hex).targets; } catch (err) { if (refusal(err)) return null; throw err; } };
  const perTarget = (sp, slot) => worth(scaleSteps(sp.def, e.level, sp.level > 0 ? slot : 0).steps, hit, mod(e.abil?.[castAbilOf(e, sp.id)] ?? 10));
  const hex = (t) => ({ q: t.pos.q, r: t.pos.r, z: t.pos.z });
  const targeting = (ids) => (ids.length === 1 ? { target: ids[0] } : { targets: ids });

  // A damage spell as the caster would cast it at `slot`: its best aim and what that is worth, or null if nothing can be aimed at.
  const damaging = (x, slot, from = e) => {
    const sp = x.sp, most = targetCount(sp.def, e.level, Math.max(slot, sp.level)), p = perTarget(sp, slot);
    const pick = (hits, first, fields, several) => ({ x, slot, score: hits * p, hits, several, first, action: cast(x, slot, fields) });
    if (sp.aim === 'creature') {
      const ins = order.filter((t) => reaches(sp, t, from));
      if (!ins.length) return null;
      // Rays, darts and beams all go at the first foe in order (Decision 4).
      if (sp.repeat) return { ...pick(1, rank.get(ins[0].id), targeting(Array(most).fill(ins[0].id)), false), score: most * p };
      if (most === 1) return pick(1, rank.get(ins[0].id), { target: ins[0].id }, false);
      let best = null;
      for (const first of ins) {
        const list = [first, ...ins.filter((t) => t !== first && (!sp.within || apart(s, first, t) * FT <= sp.within))].slice(0, most);
        if (!best || list.length > best.length) best = list;
      }
      return pick(best.length, rank.get(best[0].id), targeting(best.map((t) => t.id)), true);
    }
    // An area: the spot that catches the most foes and none of its own side, a spell with `choose` picking foes only.
    let best = null;
    for (const t0 of sp.area.shape === 'emanation' ? [null] : order) {
      const at = t0 ? hex(t0) : undefined, got = caught(sp, at);
      if (!got) continue;
      if (!sp.area.choose && got.some((t) => !hostile(t, e))) continue;
      const foesIn = (sp.area.choose ? order.filter((t) => got.includes(t)) : got).filter((t) => up(t) && inFight(s, t.id));
      const picked = sp.area.choose ? foesIn.slice(0, most) : foesIn;
      if (picked.length && (!best || picked.length > best.hits)) best = { hits: picked.length, first: t0 ? rank.get(t0.id) : 0, fields: { ...(at ? { hex: at } : {}), ...(sp.area.choose ? { targets: picked.map((t) => t.id) } : {}) } };
    }
    return best && pick(best.hits, best.first, best.fields, true);
  };

  // A healing spell cast at `slot`, one that includes `anchor` (a creature that must be healed) if given: what it is worth, capped
  // at what each creature is missing.
  const healing = (x, slot, anchor = null) => {
    const sp = x.sp, most = targetCount(sp.def, e.level, Math.max(slot, sp.level)), p = perTarget(sp, slot);
    const value = (t) => Math.min(p, missing(t));
    const best = (list) => [...list].sort((a, c) => value(c) - value(a) || idOrder(a, c));
    const done = (list, fields) => ({ x, slot, score: list.reduce((n, t) => n + value(t), 0), first: 0, action: cast(x, slot, fields) });
    if (sp.aim === 'creature') {
      const able = mine.filter((t) => missing(t) > 0 && reaches(sp, t, e, false));
      if (anchor && !able.includes(anchor)) return null;
      const first = anchor ?? best(able)[0];
      if (!first) return null;
      const list = [first, ...best(able.filter((t) => t !== first && (!sp.within || apart(s, first, t) * FT <= sp.within)))].slice(0, most);
      return done(list, targeting(list.map((t) => t.id)));
    }
    let top = null;
    for (const t of [...mine].filter((o) => missing(o) > 0).sort(near)) {
      if (anchor && t !== anchor) continue;
      const got = caught(sp, sp.area.shape === 'emanation' ? undefined : hex(t));
      if (!got || !got.includes(t) || (!sp.area.choose && got.some((o) => hostile(o, e)))) continue;
      const list = best(got.filter((o) => !hostile(o, e) && missing(o) > 0 && inFight(s, o.id)));
      const chosen = sp.area.choose ? [t, ...list.filter((o) => o !== t)].slice(0, most) : list;
      const o = done(chosen, { ...(sp.area.shape === 'emanation' ? {} : { hex: hex(t) }), ...(sp.area.choose ? { targets: chosen.map((c) => c.id) } : {}) });
      if (!top || o.score > top.score) top = o;
    }
    return top;
  };
  // The cheapest way: the lowest slot, then the spell's place in `spells`.
  const cheaper = (a, c) => a.slot - c.slot || a.x.i - c.x.i;
  const heal = (time, keep, anchor) => {
    const out = [];
    for (const x of known) {
      if (x.kind !== 'heal' || x.sp.time !== time || !usable(x)) continue;
      const slot = slotFor(x.sp, keep), o = slot === null ? null : healing(x, slot, anchor);
      if (o) out.push(o);
    }
    return out.sort(cheaper)[0] ?? null;
  };

  // 1. A creature of its side at 0 Hit Points, dying first, then Stable, the nearest first: a Bonus Action spell that reaches it, else an
  // action spell that reaches it, else a step to within Touch for an action spell that needs it. This may spend the slot kept back.
  const downed = downMine.sort((x, y) => (dying(x) ? 0 : 1) - (dying(y) ? 0 : 1) || near(x, y));
  for (const t of downed) { const o = heal('bonus', false, t) ?? heal('action', false, t); if (o) return o.action; }
  if (b.action > 0 && b.move >= FT && downed.length) {
    for (const t of downed) {
      const touch = known.filter((x) => x.kind === 'heal' && x.sp.time === 'action' && x.sp.aim === 'creature' && usable(x) && x.sp.range <= FT && slotFor(x.sp, false) !== null).sort((a, c) => a.sp.level - c.sp.level || a.i - c.i)[0];
      if (!touch) break;
      let go = null;
      for (const [, v] of moveOptions(s, e)) {
        if (!v.canStop || (v.h.q === e.pos.q && v.h.r === e.pos.r && (v.h.z ?? 0) === (e.pos.z ?? 0))) continue;
        const there = { ...e, pos: v.h };
        if (apartAt(s, e, v.h, t, t.pos) * FT <= touch.sp.range && unblocked(s, there, t) && canSee(s, there, t) !== 'no' && (!go || v.cost < go.cost)) go = { cost: v.cost, h: v.h };
      }
      if (go) return { type: 'move', actor: id, to: go.h };
    }
  }

  // The best damage for the action, as step 3 would choose it: { pick (a cast or a move, or null for the weapon or nothing), score, unreached }.
  // `unreached`: a cantrip it could cast but with no foe in its reach from where it stands.
  let chosen = null, stops = null;
  const plan = () => {
    if (chosen) return chosen;
    const free = [], paid = [], unreached = [];
    for (const x of known) {
      if (x.kind !== 'damage' || !usable(x)) continue;
      const slot = slotFor(x.sp, true);
      if (slot === null) continue;
      const o = damaging(x, slot);
      if (!o) { if (slot === 0 && x.sp.aim === 'creature') unreached.push(x); continue; }
      (slot === 0 ? free : paid).push(o);
    }
    const weapon = weaponScore();
    // A cantrip out of reach of every foe is cast from the nearest place it reaches from, not by walking up to them (amendment 2): the
    // place in reach this turn that keeps the most distance from the foes, then the cheapest. No such place, and it does not walk in.
    if (unreached.length && b.move >= FT) {
      stops ??= [...moveOptions(s, e)].filter(([, v]) => v.canStop && !(v.h.q === e.pos.q && v.h.r === e.pos.r && (v.h.z ?? 0) === (e.pos.z ?? 0)));
      for (const x of unreached) {
        let go = null;
        for (const [, v] of stops) {
          const o = damaging(x, 0, { ...e, pos: v.h });
          if (!o) continue;
          const far = Math.min(...order.map((f) => apartAt(s, e, v.h, f, f.pos)));
          if (!go || far > go.far || (far === go.far && v.cost < go.cost)) go = { o, far, cost: v.cost, h: v.h };
        }
        if (go) free.push({ ...go.o, action: { type: 'move', actor: id, to: go.h } });
      }
    }
    const bestFree = Math.max(weapon, ...free.map((o) => o.score));
    const order3 = (a, c) => c.score - a.score || a.slot - c.slot || (a.x.sp.time === 'bonus' ? 0 : 1) - (c.x.sp.time === 'bonus' ? 0 : 1) || a.x.i - c.x.i || a.first - c.first;
    // A slot is spent only on what is worth twice the best free option, and in a fight that is not hard only on an area or several targets
    // that catch two foes or more (Decision 5 as amended): of those, the lowest slot level whose score is within a quarter of the best.
    const worthy = paid.filter((o) => o.score >= 2 * bestFree && (hard || (o.several && o.hits >= 2))).sort(order3);
    const top = worthy.length ? worthy.filter((o) => o.score >= 0.75 * worthy[0].score).sort((a, c) => a.slot - c.slot || order3(a, c))[0] : [...free].sort(order3)[0];
    chosen = top && top.score > weapon ? { pick: top, score: top.score, unreached } : { pick: null, score: weapon, unreached };
    return chosen;
  };
  // What the best weapon attack `withAttacks` would make now is worth: 0.65 of its average damage, for each attack the Attack action
  // gives (the same with Disadvantage for a ranged one with an enemy within 5 feet). A melee one counts if a foe is beside it or a
  // step would put it there. Spare Unarmed Strike is only a last resort, so it counts for nothing.
  function weaponScore() {
    if (b.action < 1 || lim.noAttack) return 0;
    const allowed = (a) => !attackRefusal(s, e, a, fromPool(b, a.id)), atks = e.attacks ?? [], times = 1 + (e.features?.extraAttack ?? 0);
    const melee = steadiest(e, atks.filter((a) => a.type === 'melee' && !spareStrike(e, a) && allowed(a)));
    const ranged = steadiest(e, atks.filter((a) => a.type === 'ranged' && allowed(a)));
    let w = 0;
    const value = (a, p) => { const v = p * avgOf(a.damage) * times; return Number.isFinite(v) ? v : 0; };
    if (melee && (order.some((t) => apart(s, e, t) <= 1 && unblocked(s, e, t)) || closeIn())) w = value(melee, HIT);
    if (ranged && order.some((t) => apart(s, e, t) * FT <= (ranged.range?.[1] ?? 0) && unblocked(s, e, t))) w = Math.max(w, value(ranged, hit('ranged')));
    return w;
  }
  const closeIn = () => {
    if (b.move < FT) return false;
    for (const [, v] of moveOptions(s, e)) if (v.canStop && order.some((t) => apartAt(s, e, v.h, t, t.pos) <= 1)) return true;
    return false;
  };

  // 2. A creature of its side badly hurt, in a hard fight: a Bonus Action spell, else an action spell if it heals more than the best damage is worth.
  if (hard) {
    const sick = upMine.filter(badly).sort((x, y) => x.hp * y.maxHp - y.hp * x.maxHp || near(x, y));
    for (const t of sick) { const o = heal('bonus', true, t); if (o) return o.action; }
    for (const t of sick) { const o = heal('action', true, t); if (o && o.score > plan().score) return o.action; }
  }

  // 3. The action.
  const p = plan();
  if (p.pick) return p.pick.action;
  if (p.score > 0) return null;                                     // the weapon is the best: withAttacks makes it
  // A cantrip it could cast with no foe in its reach, and no place in reach this turn to cast it from: it ends its turn rather than walk into melee.
  if (p.unreached.length && b.action > 0) return { type: 'endTurn', actor: id };
  return null;
}

// ---------- the companion brain (docs/specs/companions.md, Decision 9; stage C7) ----------
// What a companion does when nobody steers it. It reads the state and returns an ordinary action, sent by whoever calls
// it (the DM's auto-play) through apply() like any other: it never changes the state. It is deterministic: the same
// state gives the same answer (no dice; ties broken by distance, cost, then the order moveOptions lists places in).
//
// SRD 5.2.1 (reference/srd52/srd52-flow.txt):
//   Animate Dead (24057-24062), Create Undead (25686-25690): "If you issue no commands, the creature takes the Dodge
//     action and moves only to avoid harm. Once given an order, the creature continues to follow it until its task is
//     complete." Animate Objects (24101-24103): "If you issue no commands, the creature takes the Dodge action and moves
//     only to avoid harm."
//   Summon Dragon (31262-31266), Giant Insect (27436-27440): "It obeys your verbal commands (no action required by you).
//     If you don't issue any, it takes the Dodge action and uses its movement to avoid danger."
//   Find Familiar (26789-26790): "Your familiar acts independently of you, but it obeys your commands."
//   Find Steed (26844-26846): "If you have the Incapacitated condition, the steed takes its turn immediately after yours
//     and acts independently, focusing on protecting you."
//   Mounted Combat (2122-2124): "an independent mount ... retains its place in the Initiative order and moves and acts
//     as it likes."
//   Incapacitated (33653-33656): "You can't take any action, Bonus Action, or Reaction. ... Speechless. You can't speak."
//
// Who plays a companion's turn, `brainMode(s, e, opts)`:
//   'player'  its player does (the master's player, there and able to command it): the brain waits (null);
//   'dm'      the DM does, by hand: a standing order (the brain does not guess what "guard the door" means), or a turn
//             the DM's own master commanded, or a commanded turn whose player is not there to play it;
//   'guard'   it takes the Dodge action and moves only to avoid harm: a creature under `orders: 'command'` with no
//             command and no standing order (the lock), or a summon or animated object whose master can't speak;
//   'protect' Find Steed whose master is Incapacitated (or down) and who is not steering it;
//   'free'    played as the monster AI plays a creature, against its foes only, never with an attack for `noAttack`
//             (with nothing else to do, such a one guards): `bond.auto`, a companion nobody plays (the master is the
//             DM's, or its player left), one whose master's player is offline (`opts.offline(userId)`, the client's
//             lobby) or has stepped away (E20), and a familiar or pet whose master is Incapacitated.
// A foe's companion never takes its master into account where the party does not know of the master: it plays as an
// unbonded creature would (no 'protect', no 'guard' for a master who can't speak, no leash), so that what the party
// sees it do says nothing of a hidden master.
const QUIET = new Set(['summon', 'object']);                           // "If you don't issue any [commands], it takes the Dodge action"
const masterOf = (s, e) => (typeof e.bond?.to === 'string' && Object.hasOwn(s.entities, e.bond.to) ? s.entities[e.bond.to] : null);
const riderOn = (s, e) => { const r = typeof e.rider === 'string' && Object.hasOwn(s.entities, e.rider) ? s.entities[e.rider] : null; return r?.riding?.on === e.id ? r : null; };
// Is nobody there to play this creature's player's part: its player offline (`opts.offline`, the client's lobby) or
// stepped away (E20, as the table rule says of `x`)?
const absent = (s, who, x, opts) => !!who && ((typeof opts.offline === 'function' && opts.offline(who) === true) || (!!x && !!awayHow(s, x)));
export function brainMode(s, e, opts = {}) {
  const b = e?.bond;
  if (!b) return null;
  const m = masterOf(s, e), who = ownerOf(s, e);
  const knowsMaster = !!m && (e.side === 'party' || !unknown(s, m));
  const cant = knowsMaster && (!up(m) || !!incapacitatedBy(m));                     // it can give no commands: down, dead, or Incapacitated (Speechless)
  const gone = absent(s, who, m, opts);
  let mode;
  if (b.orders === 'command') {
    if (commandedNow(s, e)) mode = who && !gone ? 'player' : 'dm';
    else if (typeof b.standing === 'string' && b.standing) mode = 'dm';
    else mode = 'guard';
  } else if (b.source === 'find-steed' && cant && !steering(s, e)) mode = 'protect';
  else if (b.auto !== true && who && !gone && !cant) mode = 'player';
  // SRD Summon Dragon, Giant Insect ("If you don't issue any, it takes the Dodge action and uses its movement to avoid
  // danger") and Animate Objects ("If you issue no commands, the creature takes the Dodge action and moves only to avoid
  // harm"): with nobody to give a command (its master can't speak, or its player is not there) it Dodges. Played by the
  // DM (no player) or let go to the brain (`auto`), the commands are the DM's or the brain's: it fights.
  else mode = (cant || gone) && QUIET.has(b.kind) ? 'guard' : 'free';
  if (mode === 'player' || mode === 'dm') return mode;
  // A controlled mount its rider can steer (on its own turn: the rider recovered after the mount's place) moves and acts
  // only as its rider directs (SRD Mounted Combat: "It moves on your turn as you direct it, and it has only three action
  // options"): the brain leaves it where it stands and takes the Dodge action (review of #368, M1).
  if (steering(s, e)) return 'hold';
  // A creature carrying a rider who is away, offline or helpless (down or Incapacitated) does not carry it into danger:
  // it takes the Dodge action and stays where it is, as the table rule for a stepped-away creature has it (E20 `dodge`:
  // "it takes the Dodge action on its turn and stays where it is"), for the one it carries (review of #368, M3). Find
  // Steed's 'protect' already stays under a rider.
  const r = riderOn(s, e);
  if (r && mode !== 'protect' && (!up(r) || !!incapacitatedBy(r) || !!awayHow(s, r) || absent(s, ownerOf(s, r), null, opts))) return 'hold';
  return mode;
}
// Does the DM's auto-play play this creature's turn? Every monster with no bond, as before; a companion when the brain
// plays it (not when it waits for its player or for the DM's hand); a character (`kind: 'pc'`) only while it is set aside
// under `standIn` (ai-casting.md, Decision 1; DEBT T20 (1)): one not set aside is its player's or the DM's by hand, one set
// aside under another `how` is passed over by the engine, and a player who is merely offline is not a reason (E20: a lost
// link "must never act by itself"). The client asks this and nothing else (app.js, idled()).
export function autoPlays(s, id, opts) {
  const e = s?.entities?.[id];
  if (!e) return false;
  if (e.kind === 'pc') return awayHow(s, e) === 'standIn';
  if (!e.bond) return true;
  const m = brainMode(s, e, opts);
  return m === 'guard' || m === 'protect' || m === 'free' || m === 'hold';
}
// What it knows: a party companion acts only on what the party knows (hidden-information.md): creatures the players are
// not told of are not in the state it reads, so it neither steps away from one nor is kept off its space (a move onto
// it is stopped and reveals it, by the engine's own rule). A foe's companion knows what the monster AI knows.
function knownTo(s, e) {
  if (e.side !== 'party') return s;
  // What it holds is known to it, whoever else knows of that (its drag is worked out from what is true).
  const mine = new Set(holdsOf(s, e).map((x) => x.t.id));
  return { ...s, entities: Object.fromEntries(Object.entries(s.entities).filter(([, o]) => !unknown(s, o) || mine.has(o.id))) };
}
export function companionStep(s, id, opts = {}) {
  const e = s.entities[id];
  if (!e || !e.bond || current(s) !== id || s.pending) return null;
  const mode = brainMode(s, e, opts);
  if (mode !== 'guard' && mode !== 'protect' && mode !== 'free' && mode !== 'hold') return null;
  // Dropped in its own turn (an Opportunity Attack as it stepped away): its turn is over (review of #368, L3).
  if (!up(e)) return { type: 'endTurn', actor: id };
  if (mode === 'hold') return s.encounter.budget.action > 0 && !e.cond?.dodging && !incapacitatedBy(e) ? { type: 'dodge', actor: id } : { type: 'endTurn', actor: id };
  const k = knownTo(s, e), m = masterOf(s, e);
  const foes = Object.values(k.entities).filter((o) => up(o) && hostile(o, e) && inFight(k, o.id) && aware(k, e, o));
  const leash = typeof e.bond.leash === 'number' && m && (e.side === 'party' || !unknown(s, m)) ? { m, feet: e.bond.leash } : null;
  // A creature it holds goes where it goes (docs/specs/grapple-shove.md, Decision 6): stepping away from it is no escape, so it is
  // not a foe to step away from. Read from the true state: it knows what it holds. It still walks, paying the cost, for any other.
  const held = new Set(holdsOf(s, e).map((x) => x.t.id)), others = foes.filter((f) => !held.has(f.id));
  if (mode === 'guard') return guard(k, e, others, leash);
  if (mode === 'protect') return protect(k, e, m, foes);
  // 'free': as a monster plays, but never an attack for one that can't attack.
  const end = { type: 'endTurn', actor: id }, b = k.encounter.budget, noAttack = e.bond.noAttack === true;
  if (k.encounter.round === 1 && !e.hiding && e.skillBonus?.stealth !== undefined && (e.features?.nimbleEscape ? b.bonus > 0 : b.action > 0) && !hideProblem(k, e)) return { type: 'hide', actor: id };
  if (!foes.length) return end;
  const a = e.actions ? withActions(k, e, foes, { noAttack }) : withAttacks(k, e, foes, { noAttack });
  return noAttack && a.type === 'endTurn' ? guard(k, e, others, leash) : a;
}
const rolled = (p) => p.roll === 'melee' || p.roll === 'ranged' || p.aim === 'multi';

// The Dodge action, then away from any foe within 5 feet, then the end of its turn. "Moves only to avoid harm" (Animate
// Dead, 24057-24059; Animate Objects, 24101-24103; Create Undead, 25688-25690) and "uses its movement to avoid danger"
// (Summon Dragon, 31264-31266; Giant Insect, 27438-27440): it moves only while a foe it knows of stands within 5 feet of
// it, and only where the move itself is no harm. Leaving a foe's reach is: "If you move heedlessly past your foes, you put
// yourself in danger by provoking an Opportunity Attack" (Opportunity Attacks, 2085). So it steps away only where no foe
// it would leave, or pass, could make one: a foe with no melee attack to make it with, one Incapacitated, or one that
// can't see it (2094: "a creature that you can see"). Whether a foe's Reaction is spent is not read: the party is not
// told that of a creature not its own (table-ui.md, Decision 3, the tracker), so a party companion may not act on it
// (re-review of #368, N4). Where a step is no harm it goes to the cheapest place out of 5 feet of every foe it knows of
// (then the farthest from them, then the order moveOptions lists places in); where none is, it stays and Dodges. It
// never goes past its leash (it would vanish).
function guard(s, e, foes, leash) {
  const id = e.id, b = s.encounter.budget, end = { type: 'endTurn', actor: id };
  if (b.action > 0 && !e.cond?.dodging && !incapacitatedBy(e)) return { type: 'dodge', actor: id };
  if (!foes.some((f) => apart(s, e, f) <= 1)) return end;
  const threats = foes.filter((f) => opportunityAttack(f, s) && !incapacitatedBy(f) && canSee(s, f, e) !== 'no');
  const safe = (pos) => !threats.some((f) => apartAt(s, e, pos, f, f.pos) <= 1);
  if (!safe(e.pos)) return end;                                     // any step away from it would provoke
  const near = (pos) => Math.min(...foes.map((f) => apartAt(s, e, pos, f, f.pos)));
  const reach = moveOptions(s, e);
  const wayIsSafe = (v) => { for (let x = v; x; x = x.prev !== undefined && x.prev !== null ? reach.get(x.prev) : null) if (!safe(x.h)) return false; return true; };
  let best = null;
  for (const [, v] of reach) {
    if (!v.canStop || (leash && apartAt(s, e, v.h, leash.m, leash.m.pos) * FT > leash.feet)) continue;
    const d = near(v.h);
    if (d > 1 && (!best || v.cost < best.cost || (v.cost === best.cost && d > best.d)) && wayIsSafe(v)) best = { d, cost: v.cost, h: v.h };
  }
  return best ? { type: 'move', actor: id, to: best.h } : end;
}

// Find Steed with its master Incapacitated: to its master's side if it is not there, placed to reach a foe beside her if
// it can; then an attack on a foe within 5 feet of its master (the nearest to it, then the most hurt, then by id); with
// none, the Dodge action. A steed carrying anyone (its master, or another rider) does not move: it would only carry
// them about.
function protect(s, e, m, foes) {
  const id = e.id, b = s.encounter.budget, end = { type: 'endTurn', actor: id };
  const close = foes.filter((f) => apart(s, m, f) <= 1).sort((x, y) => apart(s, e, x) - apart(s, e, y) || byHp(e, x, y) || (x.id < y.id ? -1 : 1));
  const moves = profiled(e.actions ?? []).filter((x) => x.p.harmful && x.p.time === 'action' && x.p.aim === 'creature' && !actionSpent(e, x.def));
  const reach = Math.max(FT, ...moves.filter((x) => x.p.roll === 'melee').map((x) => x.p.far));
  if (b.action > 0) {
    for (const t of close) {
      const x = moves.find((x) => x.p.roll === 'melee' && apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t)) ?? moves.find((x) => apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t));
      if (x) return { type: 'act', actor: id, action: x.def.id, target: t.id };
      const w = !e.actions && steadiest(e, (e.attacks ?? []).filter((a) => !attackRefusal(s, e, a, fromPool(b, a.id)) && (a.type === 'melee' ? apart(s, e, t) <= 1 : apart(s, e, t) * FT <= (a.range?.[1] ?? 0)) && unblocked(s, e, t)));
      if (w) return { type: 'attack', actor: id, target: t.id, attack: w.id };
    }
  }
  if (!riderOn(s, e) && b.move >= FT) {
    const score = (pos) => [apartAt(s, e, pos, m, m.pos) <= 1 ? 0 : 1, close.some((f) => apartAt(s, e, pos, f, f.pos) * FT <= reach) ? 0 : 1, apartAt(s, e, pos, m, m.pos)];
    const less = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    const here = score(e.pos);
    let best = null;
    for (const [, v] of moveOptions(s, e)) {
      if (!v.canStop) continue;
      const sc = score(v.h);
      if (less(sc, here) < 0 && (!best || less(sc, best.sc) < 0 || (less(sc, best.sc) === 0 && v.cost < best.cost))) best = { sc, cost: v.cost, h: v.h };
    }
    if (best) return { type: 'move', actor: id, to: best.h };
  }
  if (b.action > 0 && !e.cond?.dodging) return { type: 'dodge', actor: id };
  return end;
}
