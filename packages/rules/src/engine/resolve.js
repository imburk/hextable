// The engine's machinery for what actions do (engine.js): the attack roll, damage, falls, pushes
// and teleports, reactions that answer them, the kit lent to the effect runner (effects.js), and how
// a fight starts, passes from turn to turn and ends.
import { gridOf, col } from '../grid.js';
import { d20Faces, die, roll } from '../rng.js';
import { CONTENT, MONSTERS, SPELLS, summonTemplate, TILES } from '../content/index.js';
import { DAMAGE_TYPES } from '../content/schema.js';
import { begin, CUBE_AIM_MAX, run, scaleSteps, sharedRolls, walk as walkSteps } from '../effects.js';
import { breakConcentration, concentrationCheck, concentrationLost, damaged, effectsOf, endEffect, fightOver, holds, restamp, ROUND, roundStarted, startEffect, turnEnded, turnKey, turnStarted, useUp } from '../durations.js';
import { apart, concealed, footprint, FT, ground, hasColumn, landing, overlapAt, paired, STEP_FREE, STEP_MAX, surfaces, under, unseenAt } from '../space.js';
import { raised, seenName, sightRule, unknown } from '../vision.js';
import { concludeFight } from '../rewards.js';
import { entered, flushZones, snapshot, turnInZones } from '../zones.js';
import { canSee, COVER, coverOf, inViewOf } from '../sight.js';
import { barriers, objectDef } from '../walls.js';
import { LIGHTS } from '../content/lights.js';
import { SIZES } from '../content/sizes.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { conditionName, incapacitated, judge, modifiers, speedOf } from '../modifiers.js';
import { ARENA_RADIUS, ask, castAbilOf, current, ownerOf, dying, fail, fighters, hostile, inFight, living, mod, mountOf, partyOf, pocketOf, riderOf, rollDice, rolledOf, spellStats, steering, tellDM, together, turnBudget, up } from './shared.js';
import { aloft, below, creatureType, carry, catchUp, riderLanding, cornerFree, fightPlace, fitsOn, followMasters, initiativeSort, joinEncounter, joinLead, lookAround, sideOf, tieOf, nearestFree, objectActor, objectName, objectStep, objectZ, isPile, ownCount, pileAt, pileId, reveal, rollInit, roomAt, showPlace, unfollow, unhide } from './world.js';
import { acOf, passive, attackTypes, boundEffect, condition, cure, dealt, deathSave, heal, kill, modifier, recharge, renew, rerollSave, rescue, rollMode, savingThrow, settle, slotsFor, spellOffer, tempHp } from './rolls.js';
import { makeEntity, tryLand } from './sheets.js';
import { handsFull, heavyWeak, steadiest } from '../weapons.js';

// ---------- objects, falls, pushes and teleports (the effect steps that move things) ----------

// Run a list of effect steps that come from a thing on the map against some creatures.
export function objectEffects(s, o, steps, targets, ev) {
  if (!targets.length) return;
  begin(s, { steps, actor: null, targets: targets.map((t) => t.id), shared: targets.length > 1 ? sharedRolls(s, steps) : null,
    src: { name: objectName(o), object: o.id, dc: o.dc?.save ?? objectDef(o).dc?.save ?? 10, range: 1000 } });
  resolve(s, ev);
}
// Falling: 1d6 Bludgeoning for every 10 feet, 20d6 at most, and Prone on landing unless it took no damage.
// `feet` is a number, or "surface" (docs/specs/maps-and-objects.md: "the target drops a number of feet, or to the next
// surface"): it drops to the surface under it, as the gravity pass would put it, by the height between. Already standing
// on a surface it does not fall. A creature riding or ridden is the DM's: it would part the pair.
export function fall(s, t, feet, ev) {
  if (feet === 'surface') {
    const said = (text, manual) => ev.push(manual ? { type: 'manual', actor: null, name: 'Falling', partial: true, text } : { type: 'note', id: t.id, text });
    if (ground(s.map, t.pos)) return said(`${t.name} is standing on a surface, so it does not fall`);
    if (aloft(s, t) && !t.dead) return said(`${t.name} is flying or hovering by its own Speed, so by the SRD's Flying rule it does not fall: a flying creature falls only if it has the Incapacitated or Prone condition or its Fly Speed is reduced to 0, unless it can hover. The engine leaves ${t.name} where it is; if the effect should bring it down, the DM moves it down and works out the fall (1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt).`, true);
    if (t.riding || t.rider) return said(`${t.name} is to fall to the surface below, but it is riding or being ridden, and the engine would part the pair. The DM moves ${t.name} down and works out the fall: 1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt.`, true);
    const sf = under(s.map, t.pos);
    if (!sf) return said(`${t.name} is to fall to the surface below, but the engine finds no surface under it. The DM places ${t.name} and works out the fall.`, true);
    feet = (t.pos.z ?? 0) - sf.z;
    t.pos = { q: t.pos.q, r: t.pos.r, z: sf.z };
    if (t.dead) { ev.push({ type: 'fell', id: t.id, feet }); return lookAround(s, ev, [t]); }          // a body comes down with no damage, as the gravity pass puts it
    fall(s, t, feet, ev);
    return lookAround(s, ev, [t]);
  }
  const dice = Math.min(20, Math.floor(feet / 10));
  ev.push({ type: 'fell', id: t.id, feet });
  if (!dice) return;
  const mark = ev.length;
  const r = roll(s, `${dice}d6`);
  damage(s, t, [{ amount: r.total, type: 'bludgeoning', dice: r.dice, bonus: r.bonus }], null, ev);
  if (ev.slice(mark).some((x) => x.type === 'damage' && x.amount > 0)) condition(s, t, 'prone', ev);
}
// Forced movement: shove a creature so many feet straight away from a point, or toward it. It
// stops at a wall, a drop, or anything in the way. It provokes nothing and sets nothing off.
// On squares each step costs what the table's diagonal rule says (`diagonals`; no last square on
// what is left, as there is for a creature's own move), and every part of a big creature must
// cross no wall and pass no corner, as when it walks.
// A ridden pair (stage C6b): a push or pull of the mount is an effect moving it against its will, so its rider makes the
// DC 10 Dexterity save before the first step (SRD 5.2.1 "Falling Off", 2126-2131): on a success it is carried along, on a
// failure it falls off Prone beside where the mount stood and the mount goes on alone. The push is not changed by the
// fall: it is worked out with the rider out of the way, and the rider then lands within 5 ft of where the mount stood,
// in a space the mount did not go to (fix round 1 of #363, M2). A push of the rider itself the
// SRD gives no rule for (it is not the mount that is moved): the engine does not move it, and the DM is told.
function push(s, t, feet, dir, from, ev) {
  if (mountOf(s, t)) {
    ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${t.name} would be ${dir === 'toward' ? 'pulled' : 'pushed'} ${feet} ft while riding ${mountOf(s, t).name}. The SRD has no rule for a rider moved off its mount this way, so the engine leaves ${t.name} riding: the DM moves ${t.name} (dismount, then place) if it should go.` });
    return;
  }
  const B = barriers(s.map), G = gridOf(s.map), path = [], sign = dir === 'toward' ? -1 : 1, o = G.toWorld(from);
  const r0 = riderOf(s, t), was = { ...t.pos };
  let rider = r0, asked = false, fallen = null;
  const square = G.kind === 'square', rule = s.settings.diagonals ?? 'real';
  let left = feet, odd = false;
  const stride = (a, b) => (!square || !G.beside(a, b).length ? FT : rule === 'real' ? FT * Math.SQRT2 : rule === 'alternate' && odd ? 2 * FT : FT);
  for (let i = 0; square ? left > 0 : i < Math.floor(feet / FT); i++) {
    const here = ground(s.map, t.pos), d0 = G.dist(t.pos, from), w = G.toWorld(t.pos);
    if (!here) break;
    let best = null;
    for (const n of G.neighbors(t.pos)) {
      if (G.dist(n, from) !== d0 + sign || (inFight(s, t.id) && !s.encounter.arena[col(n)])) continue;
      const sf = surfaces(s.map, n).find((x) => Math.abs(x.z - t.pos.z) <= STEP_FREE);
      if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, n) || B.blocked(here.level.id, t.pos, n) || (sf.level !== here.level && B.blocked(sf.level.id, t.pos, n))) continue;
      const h = { q: n.q, r: n.r, z: sf.z };
      if (living(s).some((c) => c.id !== t.id && c.id !== r0?.id && overlapAt(c, c.pos, t, h, G)) || !fitsOn(s.map, t, h, B)) continue;
      if (square && below(left, stride(t.pos, n))) continue;                                                              // not enough of the push left for this step
      if (square && !footprint(t, t.pos, G).every((f, j) => { const g = footprint(t, h, G)[j]; return !B.blocked(here.level.id, f, g) && cornerFree(s.map, G, B, f, g, t.pos.z); })) continue;     // every part: no wall, no corner
      const nw = G.toWorld(n), straight = ((nw.x - w.x) * (w.x - o.x) + (nw.z - w.z) * (w.z - o.z)) * sign;       // most nearly straight along the line from the source
      if (!best || straight > best.straight + 1e-9) best = { h, straight };
    }
    if (!best) break;
    // The save is made once a step is found (the effect is about to move it).
    if (rider && !asked) { asked = true; if (!staysOn(s, rider, ev)) { fallen = rider; rider = null; } }
    if (square) { const d = G.beside(t.pos, best.h).length > 0; left -= stride(t.pos, best.h); if (d) odd = !odd; }
    const zonesBefore = snapshot(s);
    t.pos = best.h; path.push(best.h);
    if (rider) carry(s, t);
    entered(s, ev, KIT, zonesBefore);                                    // pushed into a zone: it goes off once this effect is done
  }
  if (!path.length) return;
  ev.push({ type: 'moved', id: t.id, path, forced: true });
  if (rider) ev.push({ type: 'moved', id: rider.id, path: path.map((h) => ({ ...h })), forced: true });
  lookAround(s, ev, rider ? [t, rider] : [t]);
  if (fallen && !putOff(s, fallen, t, dir === 'toward' ? 'pulled' : 'pushed', ev, true, was)) {
    carry(s, t);                                                         // nowhere to land: it stays on, carried along
    ev.push({ type: 'moved', id: fallen.id, path: path.map((h) => ({ ...h })), forced: true });
  }
}
// The effect step: `t` goes to `to` (from teleportSpot). Returns false if it could not go, which
// runs the step's `blocked` steps instead when it has them.
function teleport(s, t, step, to, ev) {
  // One of a riding pair teleports alone, so the ride ends (stage C6b; teleportApart).
  if (mountOf(s, t) || riderOf(s, t)) {
    const body = mountOf(s, t) ? { ...t, riding: undefined } : t, G = gridOf(s.map);
    if (step.blocked && living(s).some((o) => o.id !== t.id && !paired(o, t) && overlapAt(o, o.pos, body, to, G))) return false;
  }
  const parted = teleportApart(s, t, ev);
  if (parted) { const went = teleport(s, t, step, to, ev); parted(); return went; }
  const G = gridOf(s.map), taken = (pos) => living(s).some((o) => o.id !== t.id && overlapAt(o, o.pos, t, pos, G));
  let at = to;
  if (taken(at)) {
    if (step.blocked) return false;
    // Something it did not know of stands there: the nearest unoccupied space instead (the SRD
    // lets it choose; the engine takes the nearest, the first found on each ring).
    at = null;
    for (let n = 1; n <= 6 && !at; n++) for (const h of G.range(to, n).filter((x) => G.dist(x, to) === n)) {
      const p = landing(s.map, h, to.z);
      if (p && Math.abs(p.z - to.z) <= STEP_MAX && !roomAt(s, t, p) && !taken(p)) { at = p; break; }
    }
    if (!at) { ev.push({ type: 'manual', actor: t.id, name: 'Teleport', text: `${t.name} cannot arrive where it meant to, and the engine found no unoccupied space near it. The DM places it.` }); return true; }
  }
  const zonesBefore = snapshot(s);
  t.pos = { ...at };
  if (t.follow && !inFight(s, t.id)) unfollow(s, t, ev);
  ev.push({ type: 'moved', id: t.id, path: [{ ...at }], teleport: true });
  entered(s, ev, KIT, zonesBefore);                                     // a zone it lands in works on it once this effect is done
  // A thing on the floor that goes off when stepped on (a pressure plate): the engine does not run
  // it from inside a spell, so the DM is told.
  for (const o of s.map.objects) {
    const def = objectDef(o);
    if (def.triggers?.some((x) => x.on === 'enter' && x.from.includes(o.state)) && Math.abs(objectZ(s, o) - at.z) <= STEP_MAX && footprint(t, at, G).some((f) => G.dist(f, o.at) === 0))
      ev.push({ type: 'manual', actor: t.id, name: objectName(o), partial: true, text: `${t.name} teleported onto ${objectName(o)}. Whether it goes off is the DM's call.` });
  }
  lookAround(s, ev, [t]);
  if (s.encounter?.arena[col(at)] && !inFight(s, t.id) && !t.dead) joinEncounter(s, t, ev);
  return true;
}

// ---------- encounters (joining one, rollInit and fightPlace are in world.js) ----------

// `opts` (E23, a hostile cast that lands first; casting.js): `keep`, the creatures whose Reaction, taken during that cast,
// stays spent until their first turn; `owed`, what a caster's first turn goes without ({ [id]: { time, slot, spell } }).
export function startEncounter(s, center, ev, radius = ARENA_RADIUS, walked = null, opts = null) {
  const arena = {}, G = gridOf(s.map);
  for (const h of G.range(center, radius)) if (hasColumn(s.map, h)) arena[col(h)] = 1;    // a fight locks whole columns, every level
  catchUp(s, arena, walked, ev);                         // those walking with the party are with it
  // Whatever is somewhere the party has not seen stays out of it until that place is revealed.
  const who = living(s).filter((e) => arena[col(e.pos)] && (e.side === 'party' || !unseenAt(s.map, e.pos)));
  if (!who.length) fail('Nobody is close enough to fight here.');
  for (const e of who) { if (!opts?.keep?.has(e.id)) e.reactionUsed = false; reveal(s, e, ev); }   // nobody fights unseen
  s.encounter = {
    id: ++s.seq, center, radius, arena, round: 1, turn: -1, budget: null, flags: {},
    order: null, where: fightPlace(s, center), ...(opts?.owed ? { owed: structuredClone(opts.owed) } : {}),
  };
  // Each rolls, in the order the creatures are kept, but a companion whose turn is its master's and whose master
  // is in the fight: it takes the master's count, straight after it (Decision 3). One whose master is not here rolls.
  // Only where the party knows of both: else it rolls as an unbonded creature would (world.js, joinLead).
  // Straight after it, or straight before it where its master's player chose that (`bond.order`, A1): the start of
  // a fight is a round's start, so a choice waiting in `orderNext` is taken up first.
  takeUpOrders(s);
  const faces = {}, ids = new Set(who.map((e) => e.id)), m0 = who.filter((e) => !e.bond).map((e) => ({ id: e.id }));
  const behind = (e) => (ids.has(e.bond?.to) && !s.entities[e.bond.to].bond ? joinLead(s, m0, e)?.id ?? null : null);
  const slots = who.map((e) => (behind(e) ? { id: e.id, init: null, dex: e.abil.dex, [sideOf(e)]: behind(e) } : rollInit(s, e, faces)));
  for (const o of slots) if (tieOf(o)) o.init = slots.find((x) => x.id === tieOf(o)).init;
  s.encounter.order = initiativeSort(slots);
  ev.push({ type: 'encounterStart', fight: s.encounter.id, where: s.encounter.where, center, radius, order: s.encounter.order.map((o) => ({ ...o, ...faces[o.id] })) });
  for (const e of who) if (!behind(e)) ownCount(s, e, m0, ev);
  advanceTurn(s, ev);
}

// Start a fight big enough to hold both the attacker and a distant target.
export function engage(s, e, t, ev, walked = null, opts = null) {
  const G = gridOf(s.map), a = G.toWorld(e.pos), b = G.toWorld(t.pos), d = apart(s, e, t);
  startEncounter(s, G.fromWorld((a.x + b.x) / 2, (a.z + b.z) / 2), ev, Math.max(ARENA_RADIUS, Math.ceil(d / 2) + 1), walked, opts);
}

export function endEncounter(s, ev, result) {
  for (const e of fighters(s)) {
    delete e.cond.dodging; delete e.cond.disengaged; e.reactionUsed = false;
    if (up(e)) delete e.cond.prone;                       // nothing stops you standing once the fight is over
  }
  // Stepping away is for a fight: whoever was set aside, or asked to be, is back when it ends.
  for (const e of Object.values(s.entities)) if (e.away) { delete e.away; ev.push({ type: 'back', id: e.id, why: 'fightOver' }); }
  ev.push({ type: 'encounterEnd', result, rounds: s.encounter.round, fight: s.encounter.id });
  fightOver(s, ev);
  concludeFight(s, ev, result, s.encounter, fighters(s), tryLand);      // XP and loot for a fight won or ended (rewards.js)
  s.encounter = null;
}

export function checkEnd(s, ev) {
  if (!s.encounter) return;
  const f = fighters(s);
  // A party lying at 0 Hit Points is down, not beaten: the fight goes on while anyone is still rolling.
  const foes = f.some((e) => e.side === 'foe' && up(e)), party = partyOf(f).some((e) => up(e) || dying(e));
  if (!foes || !party) endEncounter(s, ev, !foes ? 'victory' : 'defeat');
}

export function advanceTurn(s, ev) {
  const enc = s.encounter;
  settleOrder(s);
  // `idle` counts turns nobody can take (the dead, the down); two laps of them end the fight in a
  // stalemate. `auto` counts turns the engine settles for creatures set aside (stepping away, below):
  // after a whole lap of them nobody is present, so the next turn starts as any turn does and waits for the DM.
  let auto = 0;
  for (let idle = 0; idle < enc.order.length * 2 + 2;) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += ROUND; newRound(s); roundStarted(s, ev); }
    const e = s.entities[enc.order[enc.turn].id];
    if (e && !e.dead && e.riding) mountOwed(s, e);
    if (!e || e.dead) { idle++; continue; }
    // A controlled mount has no turn of its own while it is ridden: it moves and acts on its rider's (stage C6a). Its
    // place is passed by when it has had its turn's worth this round, or when the rider steering it is still to come.
    if (enc.rode?.[e.id] === enc.round || riderToCome(s, e)) { idle++; continue; }
    if (e.hp <= 0) {
      if (!e.cond.stable) { deathSave(s, e, ev); checkEnd(s, ev); if (!s.encounter) return; }   // the last of the party may have died or become Stable
      if (e.hp <= 0) { idle++; continue; }
    }
    const how = auto < enc.order.length ? awayHow(s, e) : null, late = enc.moved?.[e.id];
    if (late?.turn && late.round === enc.round) {                       // a turn set aside part-way through goes on where it stopped
      enc.budget = late.turn.budget; enc.flags = late.turn.flags;
      delete late.turn;
      ev.push({ type: 'turn', id: e.id, round: enc.round });
      ev.push({ type: 'awayTurn', id: e.id, how: 'resumed', round: enc.round });
    } else if (how === 'hold') {                                         // its turn passes untaken; it may take it later this round
      auto++;
      enc.held = { ...(enc.held ?? {}), [e.id]: enc.round };
      ev.push({ type: 'awayTurn', id: e.id, how, round: enc.round });
      continue;
    } else if ((how === 'end' || how === 'endKeep') && late?.round !== enc.round && presentAfter(s, enc.turn)) {
      auto++;
      const i = enc.turn;
      moveToEnd(s, e.id, how === 'endKeep', null, ev);
      enc.turn = i - 1;                                                  // the next creature is now where it stood
      continue;
    } else beginTurn(s, e, ev);
    if (!how) return;
    if (how === 'standIn') { ev.push({ type: 'awayTurn', id: e.id, how, round: enc.round }); return; }
    // Set aside under `dodge`, or under `end`/`endKeep` with nowhere later to go: it takes the Dodge
    // action and stays where it is, and its turn ends.
    auto++;
    if (!awayTurn(s, e, ev)) return;
  }
  endEncounter(s, ev, 'stalemate');
}

// The start of a creature's turn: what ends then ends, its budget, its Reaction back, a recharge,
// standing up from Prone.
function beginTurn(s, e, ev) {
  const enc = s.encounter;
  enc.flags = {};
  const prompt = takeCommand(s, e);                                    // a commanded creature's turn is its master's player's (A2)
  turnStarted(s, ev, e, KIT);                                          // what ends "at the start of its turn" ends before it acts
  turnInZones(s, ev, KIT, e, 'turnStart');                            // a zone it starts its turn in (Web)
  const speed = speedOf(s, e), can = incapacitated(e) ? 0 : 1;        // an incapacitated creature gets its turn but cannot act
  enc.budget = { move: speed, action: can, bonus: can, dashes: 0 };     // `move` is walking feet left; other ways of moving are worked out from it
  e.reactionUsed = false;
  delete e.cond.dodging;
  ev.push({ type: 'turn', id: e.id, round: enc.round });
  // E23 with CAST_TAKES_FIRST_ACTION (casting.js): the hostile cast that started the fight was this turn's action (or
  // Bonus Action) and its one spell slot.
  const owed = enc.owed?.[e.id];
  if (owed) {
    delete enc.owed[e.id];
    if (!Object.keys(enc.owed).length) delete enc.owed;
    if (enc.budget[owed.time] > 0) enc.budget[owed.time]--;
    if (owed.time === 'action') enc.flags[`magic:${e.id}`] = true;
    if (owed.slot) enc.flags.slot = true;
    ev.push({ type: 'note', id: e.id, text: `${e.name} cast ${owed.spell} as the fight began: that was this turn's ${owed.time === 'bonus' ? 'Bonus Action' : 'action'}.` });
  }
  if (prompt) ev.push(prompt);
  recharge(s, e, ev);
  mountTurnStarts(s, e, ev);
  // A ridden mount on its own turn: its turn's worth for the round (M1). So too one that could be a controlled mount (a
  // trained animal, a steed) and is ridden by no one now: mounted later this round and then put off its rider, it is
  // seated again (dismountOrder) and must not take a second turn (stage C6b).
  if (riderOf(s, e) || mountable(e)) (enc.rode ??= {})[e.id] = enc.round;
  if (e.cond.prone && speed > 0) {                                     // with a Speed of 0 it stays down
    delete e.cond.prone;
    enc.budget.move -= Math.floor(speed / 2 / FT) * FT;
    ev.push({ type: 'stood', id: e.id });
  }
}

// A command (`command`, companions.js; Decision 6, amendment A2) is for the commanded creature's next turn: at the
// start of that turn it is stamped with it (`commanded.turn`), and for that turn `ownerOf` gives the master's player
// (shared.js). Spent once that turn is over: the start of its next turn clears it, as it does a command given in
// another fight or outside one (`at` not of this fight), so a command never carries into a later fight. Returns the
// prompt for the master's player ("Brenna's Zombie is yours this turn."), or null when the master has no player.
function takeCommand(s, e) {
  const b = e.bond, c = b?.commanded;
  if (b?.orders !== 'command' || !c || typeof c !== 'object') return null;
  const key = turnKey(s), fight = typeof c.at === 'string' ? c.at.slice(0, c.at.indexOf(':')) : null;
  if (c.turn === key) return null;
  if (c.turn !== undefined || fight !== String(s.encounter.id)) { b.commanded = null; return null; }
  c.turn = key;
  const m = s.entities[b.to], to = ownerOf(s, m);
  if (!to) return null;
  const text = `${e.name.startsWith(`${m.name}'s `) ? e.name : `${m.name}'s ${e.name}`} is yours this turn.`;
  return { type: 'commandedTurn', id: e.id, by: m.id, to, ...(c.order ? { order: c.order } : {}), text };
}

// The end of the current creature's turn, after what its player chose (endTurn, attacks.js, or a
// turn played for a creature set aside). `pick`: the condition its Self-Restoration ends, if it was
// given. False if the fight ended.
export function finishTurn(s, e, ev, pick = undefined) {
  const sc = (e.feats ?? []).find((f) => f.selfCure), can = sc ? sc.selfCure.conditions.filter((c) => e.cond[c]) : [];
  delete e.cond.disengaged;
  // Stealth Attack: still hidden after its attack only if it ends the turn behind Three-Quarters or
  // Total Cover from every enemy that is up.
  if (s.encounter.flags[`stealth:${e.id}`] && e.hiding && living(s).some((o) => up(o) && hostile(o, e) && !['threeQuarters', 'total'].includes(coverOf(s, o, e)))) unhide(s, e, ev, 'attack');
  if (can.length) {
    const c = pick ?? (can.length === 1 ? can[0] : null);
    if (c) { ev.push({ type: 'std', id: e.id, action: sc.name }); cure(s, e, [c], ev); }
    else ev.push({ type: 'manual', actor: e.id, name: sc.name, text: `${e.name} is ${can.map(conditionName).join(' and ')}. ${sc.name} ends one of them at the end of its turn, its player's choice; none was sent, so the DM removes the one the player picks.` });
  }
  turnInZones(s, ev, KIT, e, 'turnEnd');                              // a zone it ends its turn in (Moonbeam, Spirit Guardians)
  // A controlled mount's turn is its rider's (stage C6a): its Disengage ends, and what ends at the end of its turn ends.
  const m = ridden(s, e);
  if (m) { delete m.cond.disengaged; turnInZones(s, ev, KIT, m, 'turnEnd'); }
  checkEnd(s, ev);
  if (!s.encounter) return false;
  turnEnded(s, ev, e, KIT);
  if (m && s.encounter && Object.hasOwn(s.entities, m.id)) turnEnded(s, ev, m, KIT);
  return !!s.encounter;
}

// ---------- riding (docs/specs/companions.md, Decision 8; stage C6a) ----------

// A controlled mount's Dash, Disengage or Dodge (stage C6a; SRD "Controlling a Mount": its only three action options):
// on its rider's turn, from its own action (`budget.mount`), never the rider's and never as a Bonus Action. Its Dash adds
// its Speed to its own movement; its Disengage lasts the rest of the turn; its Dodge until the start of its next turn,
// which is its rider's (mountTurnStarts). Used by movement.js (dash, disengage) and attacks.js (dodge).
export function mountAct(s, m, a, what, ev) {
  const r = steering(s, m);
  !a.bonus || fail(`A controlled mount's ${what} takes its action.`);
  inFight(s, m.id) || fail(`${m.name} is outside the battle.`);
  const bud = turnBudget(s, m) || fail(`${m.name} acts on ${r.name}'s turn.`);
  up(m) || fail(`${m.name} is down.`);
  const by = incapacitated(m);
  !by || fail(`${m.name} is ${by} and can't act.`);
  bud.action >= 1 || fail(`${m.name} has already used its action this turn.`);
  bud.action--;
  if (what === 'Dash') { bud.move += speedOf(s, m); bud.dashes = (bud.dashes | 0) + 1; } else if (what === 'Dodge') m.cond.dodging = {}; else m.cond.disengaged = {};
  ev.push({ type: 'std', id: m.id, action: what });
}

// The controlled mount this creature rides in the fight going on, or null.
const ridden = (s, r) => { const m = r?.riding?.controlled ? mountOf(s, r) : null; return m && steering(s, m) === r && inFight(s, m.id) ? m : null; };
// Is this a controlled mount whose rider, steering it, has its turn still to come this round? Its own place is then
// passed by: its turn's worth is on its rider's turn. One whose rider's turn has gone by without giving it its worth
// (the rider was down or Incapacitated then) takes its own turn (fix round 2, M1).
const riderToCome = (s, m) => {
  const r = steering(s, m), enc = s.encounter;
  return !!r && inFight(s, r.id) && enc.order.findIndex((o) => o.id === r.id) > enc.turn;
};
// The rider's place has come round and it can't steer its controlled mount now (down, Incapacitated): a mount that has
// not had its turn's worth this round and whose own place has gone by (passed by, waiting for its rider) is seated
// straight behind its rider, so that it takes its own turn this round (fix round 2, M1). Nobody else's place moves.
function mountOwed(s, r) {
  const enc = s.encounter, m = r.riding?.controlled ? mountOf(s, r) : null;
  if (!m || m.dead || steering(s, m) === r || enc.rode?.[m.id] === enc.round || enc.moved?.[m.id]) return;
  const mi = enc.order.findIndex((o) => o.id === m.id), ri = enc.order.findIndex((o) => o.id === r.id);
  if (mi < 0 || ri < 0 || mi > ri) return;
  const [o] = enc.order.splice(mi, 1);
  enc.order.splice(enc.order.findIndex((x) => x.id === r.id) + 1, 0, o);
  enc.turn = enc.order.findIndex((x) => x.id === r.id);
}
// The owner's question (re-review of #350, M2; open): a controlled mount mounted after it has had its turn this round,
// its own or on another rider's. true: it carries its new rider but gets no more this round, one turn's worth a round
// (fix round 1, M1). false: it moves and acts again, as the SRD's "A controlled mount can move and act even on the turn
// that you mount it" reads with no exception. Either answer is this one constant (riding.test.js tests both).
export const MOUNT_ONCE_A_ROUND = true;
// What a controlled mount has on its rider's turn (`budget.mount`): its Speed, and one action, for Dash, Disengage
// or Dodge ("it has only three action options during that turn"). None if it is Incapacitated.
export const mountBudget = (s, m) => ({ move: speedOf(s, m), action: incapacitated(m) ? 0 : 1, dashes: 0 });
// One turn's worth a round for a mount, however many riders it has in the round (fix round 1, M1): a mount that has had
// its turn this round, its own (its place in the order is behind the turn going on, so it has come: settleOrder keeps
// that true) or on a rider's (`enc.rode`), gets nothing more this round. Mounted after that it carries its rider but
// moves and acts again only on its rider's next turn.
export function mountHadTurn(s, m) {
  const enc = s.encounter;
  if (!enc) return false;
  if (enc.rode?.[m.id] === enc.round) return true;
  const i = enc.order.findIndex((o) => o.id === m.id);
  return i >= 0 && i < enc.turn;
}
// The turn's worth a controlled mount has on its rider's turn: its budget, marking the round as its turn's (`enc.rode`),
// or none if it has had its turn this round.
export function mountTurnBudget(s, m, once = MOUNT_ONCE_A_ROUND) {
  const enc = s.encounter;
  if (once && mountHadTurn(s, m)) return { move: 0, action: 0, dashes: 0 };
  (enc.rode ??= {})[m.id] = enc.round;
  return mountBudget(s, m);
}
// The rider's turn begins: so does its controlled mount's, which "moves on your turn". What ends at the start of the
// mount's turn ends, a zone it starts in works on it, its Reaction comes back, a recharge, and its budget.
function mountTurnStarts(s, r, ev) {
  const m = ridden(s, r);
  if (!m) return;
  turnStarted(s, ev, m, KIT);
  turnInZones(s, ev, KIT, m, 'turnStart');
  if (!s.encounter || !Object.hasOwn(s.entities, m.id) || steering(s, m) !== r) return;
  const enc = s.encounter;
  if (enc.rode?.[m.id] === enc.round) { enc.budget.mount = { move: 0, action: 0, dashes: 0 }; return; }   // it had its turn this round (M1)
  m.reactionUsed = false;
  delete m.cond.dodging;
  recharge(s, m, ev);
  (enc.rode ??= {})[m.id] = enc.round;
  enc.budget.mount = mountBudget(s, m);
  // Standing up from Prone costs half its Speed, as at the start of any creature's turn (fix round 1, L4). Whether its
  // rider falls off is C6b's (the DM is told, settleRiders).
  const speed = speedOf(s, m);
  if (m.cond.prone && speed > 0) {
    delete m.cond.prone;
    enc.budget.mount.move -= Math.floor(speed / 2 / FT) * FT;
    ev.push({ type: 'stood', id: m.id });
  }
}
// A controlled mount's rider got down (or the pair came apart) in the fight: "The Initiative of a controlled mount
// changes to match yours when you mount it", so its place is now straight behind its rider (and the rider's `after`
// companions), on the rider's count, unless its bond ties it to its master (Decision 3, A1: the bond keeps its place).
// A mount that has had its turn's worth this round (`enc.rode`) takes no other. One that has not (its rider's turn went
// by while it could not steer, and the DM took it down) still takes its turn this round: if the place behind its rider
// has gone by, it is seated straight behind the creature whose turn it is (fix round 2, M1).
export function dismountOrder(s, m, r) {
  const enc = s.encounter;
  if (!enc) return;
  const cur = enc.turn >= 0 ? current(s) : null;
  const ri = enc.order.findIndex((o) => o.id === r.id), o = enc.order.find((x) => x.id === m.id);
  if (!o || ri < 0 || enc.moved?.[m.id] || enc.moved?.[r.id]) return;
  if (cur === m.id) return;                                         // its own turn is going on: it keeps its place (C6b)
  const had = enc.rode?.[m.id] === enc.round, mi = enc.order.indexOf(o);
  if (tieOf(o) && (had || mi > enc.turn)) return;                   // the bond keeps its place (A1)
  if (!had && mi > enc.turn && ri < enc.turn) return;               // its own place is still to come: it takes its turn there
  enc.order.splice(mi, 1);
  let i = enc.order.findIndex((x) => x.id === r.id);
  if (!had && i < enc.order.findIndex((x) => x.id === cur)) i = enc.order.findIndex((x) => x.id === cur);
  const lead = enc.order[i].id;
  while (i + 1 < enc.order.length && enc.order[i + 1].after === lead) i++;
  if (lead === r.id) o.init = enc.order.find((x) => x.id === r.id).init;
  enc.order.splice(i + 1, 0, o);
  if (cur) enc.turn = enc.order.findIndex((x) => x.id === cur);
}
// ---------- falling off, and the pair moved (stage C6b; SRD 5.2.1 "Falling Off", 2126-2133) ----------
// "If an effect is about to move your mount against its will while you're on it, you must succeed on a DC 10 Dexterity
// saving throw or fall off, landing with the Prone condition in an unoccupied space within 5 feet of the mount. While
// mounted, you must make the same save if you're knocked Prone or the mount is."
export const RIDE_DC = 10;
// Could this creature be a controlled mount (a trained animal, a steed; Decision 8)? Only such a mount's place in the order moves.
const mountable = (e) => (CONTENT.monsters[e.tpl]?.mount === 'trained' && !e.form) || e.bond?.mount === 'controlled';
// The ride ends: the two fields go, a controlled mount takes its place in the order back (dismountOrder), the rider's
// turn loses the mount's budget. Then `dismounted` (at where the rider is now, which the caller has set).
function unride(s, r, m) {
  const controlled = r.riding?.controlled === true;
  delete r.riding;
  if (m && m.rider === r.id) delete m.rider;
  if (m && controlled && s.encounter && inFight(s, m.id) && !m.dead) dismountOrder(s, m, r);
  if (s.encounter?.budget?.mount && current(s) === r.id) delete s.encounter.budget.mount;
}
const offEvent = (r, id, why, more = {}) => ({ type: 'dismounted', id: r.id, mount: id, at: { q: r.pos.q, r: r.pos.r, z: r.pos.z ?? 0 }, why, ...more });
// A creature left with nothing under it falls now, as the gravity pass after every action would make it (engine.js):
// a rider whose flying mount vanished, teleported away or was moved off from under it.
function drop(s, e, ev) {
  if (ground(s.map, e.pos) || aloft(s, e)) return;
  const sf = under(s.map, e.pos);
  if (!sf) return;
  const feet = e.pos.z - sf.z;
  e.pos = { q: e.pos.q, r: e.pos.r, z: sf.z };
  if (e.dead) return;                                                  // a body comes down with it, as the gravity pass puts it (no damage)
  fall(s, e, feet, ev);
  lookAround(s, ev, [e]);
  checkEnd(s, ev);
}
// The rider's DC 10 Dexterity save against falling off. True if it stays on.
function staysOn(s, r, ev) {
  const { used, ...sv } = savingThrow(s, r, 'dex', RIDE_DC, null, null, null, null, ev);
  ev.push({ type: 'save', id: r.id, abil: 'dex', dc: RIDE_DC, ...sv, against: 'Falling Off' });
  useUp(s, ev, used ?? []);
  return sv.success;
}
// The rider comes off: into the unoccupied space within 5 ft of its mount nearest it, chosen by what its side knows
// (world.js, riderLanding). A space held by a creature the party did not know of: the rider finds it, as a move onto
// it would (revealed, unhidden), and the next space is chosen with it known. `prone`: it lands Prone (falling off);
// otherwise it is set down on its feet (it no longer fits on its mount). False, with the DM told, if there is no space:
// it stays on.
function putOff(s, r, m, why, ev, prone, from = null) {
  let spot = riderLanding(s, r, m, null, from);
  for (let n = 0; spot?.lurker && n < 50; n++) { reveal(s, spot.lurker, ev); unhide(s, spot.lurker, ev, 'found', r); spot = riderLanding(s, r, m, null, from); }
  // In the air (a flying mount) there is nothing within 5 ft to land on: it comes off where it is and falls, as from a
  // flying mount that vanishes (fix round 1 of #363, M3): the fall's damage, and Prone, by the gravity pass's own rules.
  if (!spot && prone && !ground(s.map, m.pos)) {
    unride(s, r, m);
    ev.push(offEvent(r, m.id, why, { fell: true }));
    if (up(r)) condition(s, r, 'prone', ev); else r.cond.prone = {};
    drop(s, r, ev);
    return true;
  }
  if (!spot) {
    ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${r.name} ${prone ? 'falls off' : 'can no longer ride'} ${m.name}, but there is no unoccupied space within 5 ft of ${m.name} for ${r.name} to land in, so ${r.name} stays on. The DM places ${r.name}${prone ? ' (Prone)' : ''} if room is made.` });
    return false;
  }
  const zonesBefore = snapshot(s);
  unride(s, r, m);
  r.pos = { ...spot.p };
  ev.push(offEvent(r, m.id, why, prone ? { fell: true } : {}));
  if (prone) { if (up(r)) condition(s, r, 'prone', ev); else r.cond.prone = {}; }
  entered(s, ev, KIT, zonesBefore);
  lookAround(s, ev, [r]);
  return true;
}
// One creature of a pair teleports (SRD 5.2.1 "Teleportation", 34458-34461: "If you're touching another creature when
// you teleport, that creature doesn't teleport with you unless the teleportation effect says otherwise."), so the ride
// ends. Called before it goes; `after` is run once it has, and says where the rider is.
export function teleportApart(s, t, ev) {
  const m = mountOf(s, t), r = m ? t : riderOf(s, t);
  if (!r) return null;
  const mount = m ?? t;
  unride(s, r, mount);
  return () => { ev.push(offEvent(r, mount.id, 'teleport')); if (r !== t) drop(s, r, ev); };
}
// After every action (from settleBonds): the pairs are kept whole, and what the SRD says about falling off is done.
// - A mount gone (vanished, dismissed, removed) or dead: its rider is down from it where it stands (`gone`), and falls
//   if that is in the air (a flying mount's rider).
// - The two not on one anchor (the DM set one down elsewhere): the ride ends (`apart`) and the DM is told; a rider left
//   in the air falls.
// - A rider or mount knocked Prone ("While mounted, you must make the same save if you're knocked Prone or the mount
//   is"): the DC 10 Dexterity save once (`riding.told` until neither is Prone); on a failure the rider falls off, Prone
//   (`fell`, why `prone`). A rider at 0 Hit Points is Unconscious and Prone, so it fails the save and falls.
// - A rider no longer smaller than its mount (one grew or shrank): it can't be carried any more (SRD 2101-2103: "at
//   least one size larger"), so it is set down beside it, on its feet (why `size`).
// The rider's footprint follows the mount's size.
export function settleRiders(s, ev) {
  for (const e of Object.values(s.entities)) if (e.riding) settleRide(s, e, ev);
  for (const m of Object.values(s.entities)) if (m.rider !== undefined && !(typeof m.rider === 'string' && s.entities[m.rider]?.riding?.on === m.id)) delete m.rider;
}
const rank = (x) => Object.keys(SIZES).indexOf(SIZES[x.size] ? x.size : 'medium');
export function settleRide(s, e, ev) {
  if (!e.riding) return;
  const id = e.riding.on, m = typeof id === 'string' && Object.hasOwn(s.entities, id) ? s.entities[id] : null;
  const whole = !!m && m.rider === e.id && !m.vanished && !m.dead && !e.dead && !e.vanished;
  const split = whole && (m.pos.q !== e.pos.q || m.pos.r !== e.pos.r || (m.pos.z ?? 0) !== (e.pos.z ?? 0));
  if (!whole || split) {
    unride(s, e, m);
    ev.push(offEvent(e, id, split ? 'apart' : 'gone'));
    if (split) ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${e.name} and ${m.name} were set down apart, so ${e.name} is no longer riding. If ${e.name} should have stayed on, the DM mounts ${e.name} again.` });
    drop(s, e, ev);
    return;
  }
  if (e.riding.size !== m.size && SIZES[m.size]) e.riding.size = m.size;
  // Bonded to take commands while ridden: no longer a controlled mount (fix round 1, M3), so the ride says so.
  if (e.riding.controlled && m.bond?.orders === 'command') {
    e.riding.controlled = false;
    if (s.encounter?.budget?.mount && current(s) === e.id) delete s.encounter.budget.mount;
  }
  if (rank(m) < rank(e) + 1) { if (!e.riding.cramped) { if (!putOff(s, e, m, 'size', ev, false)) e.riding.cramped = true; } return; }
  if (e.riding.cramped) delete e.riding.cramped;
  // `told` says which knock-downs have been saved against: 'r' the rider's, 'm' the mount's (true, from C6a saves: both).
  // A new one, of the other, is saved against again (fix round 1 of #363, L2).
  const now = `${e.cond?.prone ? 'r' : ''}${m.cond?.prone ? 'm' : ''}`, had = e.riding.told === true ? 'rm' : typeof e.riding.told === 'string' ? e.riding.told : '';
  if ([...now].some((c) => !had.includes(c))) {
    e.riding.told = now;
    if (!staysOn(s, e, ev)) putOff(s, e, m, 'prone', ev, true);
  } else if (!now && e.riding.told !== undefined) delete e.riding.told;
  else if (now && e.riding.told !== true && now !== had) e.riding.told = now;
}

// ---------- stepping away (docs/specs/table-ui.md, "E20: stepping away") ----------
// A table convenience the SRD has no rule for (it has no "delay your turn"): a creature whose player
// has stepped away (a break, a phone call, a lost connection) is set aside in the turn order, and the
// table rule `away` says what becomes of its turns while it is (SETTING_TEXT.away, dm.js):
//   dodge    (the default) it takes the Dodge action on its turn and stays where it is;
//   end      its turn moves to the end of the round, its place given back next round;
//   endKeep  the same, and it keeps the place at the end;
//   hold     its turn passes untaken; back within the round, it takes it after the turn going on;
//   standIn  a stand-in plays it (the client's monster AI, ai.js; the engine plays nothing itself).
// A creature moved to the end that is still away there, or that has no one present after it, takes
// the Dodge action. The engine never sets anyone aside by itself: only the DM or the creature's player.
export const AWAY = ['dodge', 'end', 'endKeep', 'hold', 'standIn'];
// What is done with this creature's turns now: one of AWAY, or null if it is present (or has only asked to step away).
export const awayHow = (s, e) => (e?.away && !e.away.asked ? e.away.how : null);

// Is anyone after this place in the order who will take a turn of their own?
export function presentAfter(s, i) {
  return s.encounter.order.slice(i + 1).some((o) => { const x = s.entities[o.id]; return x && up(x) && !awayHow(s, x); });
}

// Put a creature's turn at the end of this round's order. `turn`: the budget and flags of a turn
// set aside part-way through, to go on with there.
export function moveToEnd(s, id, keep, turn, ev) {
  const enc = s.encounter, moved = (enc.moved ??= {});
  const n = Math.max(0, ...Object.values(moved).map((m) => m.n ?? 0)) + 1;
  moved[id] = { n, keep, round: enc.round, ...(turn ? { turn } : {}) };
  ev.push({ type: 'turnMoved', id, to: 'end', keep, round: enc.round });
  settleOrder(s);
}

// Bring a creature whose turn was held this round back in, to take that turn after the one going on.
export function heldBack(s, e, ev) {
  const enc = s.encounter, cur = current(s);
  if (!enc || enc.held?.[e.id] !== enc.round || cur === e.id || !cur) return;
  delete enc.held[e.id];
  (enc.moved ??= {})[e.id] = { after: cur, keep: false, round: enc.round };
  ev.push({ type: 'turnMoved', id: e.id, to: 'next', round: enc.round });
  settleOrder(s);
}

// Lay the order out again from who was moved where: everyone else in the order as it stands, a creature
// taken back in after another just after it, then those moved to the end, first moved first. The turn stays
// with the creature whose turn it is. A creature joining the fight is put in without moving anyone
// (insertSlot, world.js), before those moved to the end; the order is sorted whole only at the start of a
// fight and at a round start that gives a place back (newRound, below), and this then puts the moved ones back.
export function settleOrder(s) {
  const enc = s.encounter, moved = enc?.moved;
  if (!moved) return;
  // A stamp from before state version 22 names a place in the order (durations.js, thisTurn): name it by
  // its creature before the places move, so it still means that creature's turn after.
  for (const fx of effectsOf(s)) {
    for (const p of fx.parts) if (p.born !== undefined) p.born = restamp(enc, p.born);
    if (fx.zone?.last) for (const k of Object.keys(fx.zone.last)) fx.zone.last[k] = restamp(enc, fx.zone.last[k]);
  }
  const cur = enc.turn >= 0 ? current(s) : null;
  for (const id of Object.keys(moved)) if (!enc.order.some((o) => o.id === id)) delete moved[id];
  // A creature taken back in after another (heldBack: `after`) is seated once, when it comes back, and from then
  // on stays where it stands for the rest of the round (`placed`): seating it again behind its anchor on every
  // later turn would carry it with the anchor when a companion's place changes (a bond, a free), past creatures
  // that have had their turn, and give them a second one (review of #317, round 2, B1 and B2).
  // A creature taken back in while the creature whose turn it is was moved to the end of the round (`end`,
  // `endKeep`) is seated straight behind it in that end block, as one moved there right after it: seated in
  // initiative order it would sit behind the turn, among those who have had theirs, and lose its own (#320).
  // Every creature that is up and stays up acts once a round: those before the turn have acted, those after
  // it have not, so a creature brought back in goes after the turn and nobody already past it moves.
  const atEnd = (id) => moved[id] && !moved[id].after && !moved[id].placed && enc.order.some((o) => o.id === id);
  // An anchor that is itself waiting to be seated (two records of the old form, from a save) is seated first.
  const back = [], waiting = enc.order.filter((x) => moved[x.id]?.after);
  while (waiting.length) {
    const i = Math.max(0, waiting.findIndex((o) => !waiting.some((w) => w.id === moved[o.id].after)));
    back.push(...waiting.splice(i, 1));
  }
  for (const o of back) {
    // Behind the creature it was taken back in after, wherever the turn is: a record of the old form is kept all
    // round with the creature seated straight behind its anchor, so an anchor that has had its turn means the
    // creature has had its own too, or is taking it. Only if the anchor is gone is it seated behind the creature
    // whose turn it is, and if it is that creature itself, it stays where it stands.
    const gone = !enc.order.some((x) => x.id === moved[o.id].after);
    const anchor = !gone ? moved[o.id].after : cur !== o.id ? cur : null;
    if (!anchor) { delete moved[o.id].after; moved[o.id].placed = true; continue; }
    if (atEnd(anchor)) {
      const n = moved[anchor].n;
      for (const m of Object.values(moved)) if (m.n > n) m.n++;
      moved[o.id] = { n: n + 1, keep: false, round: moved[o.id].round };
      continue;
    }
    moved[o.id].after = anchor;
  }
  const rest = enc.order.filter((o) => !moved[o.id] || moved[o.id].placed);
  for (const o of back.filter((x) => moved[x.id].after)) {
    let at = rest.findIndex((x) => x.id === moved[o.id].after);
    // Behind the companions that take their turn straight after that creature's (or after its master's, if it is
    // one), not between them (review of #317, L4).
    // A creature taken back in after a companion that acts before its master (A1) goes behind that master's whole
    // group, the master and its `after` companions too, so the group is not split.
    const lead = at < 0 ? null : tieOf(rest[at]) ?? rest[at].id;
    while (at >= 0 && rest[at + 1] && (tieOf(rest[at + 1]) === lead || rest[at + 1].id === lead)) at++;
    rest.splice(at < 0 ? rest.length : at + 1, 0, o);
    delete moved[o.id].after;
    moved[o.id].placed = true;
  }
  const ends = enc.order.filter((x) => moved[x.id] && !moved[x.id].after && !moved[x.id].placed).sort((a, b) => moved[a.id].n - moved[b.id].n);
  enc.order = [...rest, ...ends];
  if (cur) enc.turn = enc.order.findIndex((o) => o.id === cur);
  if (!Object.keys(moved).length) delete enc.moved;
}

// A new round: turns held last round are gone (a creature has one turn a round), and every place
// moved for one round only is given back (initiative order, as `initiativeSort` keeps it).
function newRound(s) {
  const enc = s.encounter;
  delete enc.held;
  delete enc.rode;                                     // a mount got down from last round has its turns again (stage C6a)
  takeUpOrders(s);                                     // a before or after choice made last round takes effect now (A1)
  // A companion whose place behind its master could not change in the middle of the last round (bonded or
  // freed then, or a master who joined after it) takes it now (followMasters, world.js).
  if (followMasters(s, false)) enc.turn = 0;
  if (!enc.moved) return;
  let back = false;
  for (const [id, m] of Object.entries(enc.moved)) {
    delete m.turn;
    if (!m.keep || m.after || m.placed) { delete enc.moved[id]; back = true; }
  }
  if (back) { initiativeSort(enc.order); enc.turn = 0; }
  settleOrder(s);
  enc.turn = 0;
  // A companion whose master (or itself) was set aside last round only, and so could not change sides above, does so
  // now that the place is given back: nobody has had a turn in this round yet.
  followMasters(s, false);
  enc.turn = 0;
}
// A before or after choice for a companion (`companionOrder`, companions.js; A1) is kept in `bond.orderNext` while a
// fight goes on and taken up here, at a round's start, never in the middle of one: moving a companion round a master
// who is mid-turn could give it a second turn or take its turn away. Every bond, in the fight or not: one that joins
// later this round joins by the round's choice.
function takeUpOrders(s) {
  for (const e of Object.values(s.entities)) {
    if (!e.bond?.orderNext) continue;
    if (steering(s, e)) continue;                      // a ridden steed has no place of its own: its choice waits (A1, C6a)
    e.bond.order = e.bond.orderNext;
    delete e.bond.orderNext;
  }
}

// The turn of a creature set aside, played for it: the Dodge action if it can still take an action,
// and it stays where it is. Ends the turn. False if the fight ended.
export function awayTurn(s, e, ev) {
  const b = s.encounter.budget;
  if (b.action > 0 && !incapacitated(e)) {
    b.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  }
  ev.push({ type: 'awayTurn', id: e.id, how: 'dodge', round: s.encounter.round });
  return finishTurn(s, e, ev);
}

// ---------- damage and attacks ----------

// `amount` is a number of `dtype` damage, or a list of { amount, type } parts that land together
// (one hit that does slashing and fire): each part is resisted on its own and logged on its own,
// but the creature takes them as one instance of damage, so a dying creature fails one death
// save for it (two on a critical hit), and Concentration is tested once, against the total.
// Temporary Hit Points are lost first (SRD); `raw` (the DM setting Hit Points) leaves them alone.
// `cut` is a reaction that cuts this damage (Uncanny Dodge: { half }, Deflect Attacks: { less }),
// taken with the other adjustments, before Resistance (SRD "Order of Application").
// `pierce`: the damage ignores Resistance and Immunity (Overchannel's Necrotic damage to its caster).
export function damage(s, t, amount, dtype, ev, { crit = false, raw = false, cut = null, pierce = false } = {}) {
  const parts = Array.isArray(amount) ? amount : [{ amount, type: dtype }];
  const m = modifiers(s, t, 'damage.taken', { target: t });
  // A Reaction that gives Resistance to the damage being taken (Superior Hunter's Defense): the type it resists now.
  const braced = pierce || raw ? null : braceAgainst(s, t, parts, m, ev);     // not a DM setting Hit Points (`raw`)
  const dying = t.hp <= 0, before = t.hp;
  // Amounts added to or taken off the damage (the Resistance cantrip's 1d4) come first, then
  // Resistance and Vulnerability (SRD "Order of Application"). Each applies once to the
  // instance, on its first part of a type it names; one marked `once` at most once a turn.
  const adjust = parts.map(() => 0), noted = parts.map(() => []);
  for (const x of m.taken) {
    const i = parts.findIndex((p) => p.amount > 0 && (!x.types || x.types.includes(p.type)));
    if (i < 0) continue;
    const flag = `once:${x.key}`;
    if (x.once && s.encounter?.flags[flag]) continue;
    if (x.once && s.encounter) s.encounter.flags[flag] = true;
    const r = typeof x.value === 'string' ? rollDice(s, [{ dice: x.value, name: x.name }]).total : x.value;
    adjust[i] += r; noted[i].push({ name: x.name, ...(typeof x.value === 'string' ? { dice: x.value } : {}), roll: r });
  }
  const base = parts.map((p, i) => Math.max(0, p.amount + adjust[i]));
  if (cut) {
    const all = base.reduce((a, n) => a + n, 0);
    let less = cut.half ? all - Math.floor(all / 2) : Math.min(all, cut.less);
    for (let i = 0; i < base.length && less > 0; i++) { const n = Math.min(base[i], less); base[i] -= n; less -= n; if (n) noted[i].push({ name: cut.name, roll: -n }); }
  }
  let total = 0, lost = 0;
  for (const [pi, p] of parts.entries()) {
    const applies = (fromModifiers, own) => fromModifiers === true || fromModifiers.includes(p.type) || own.includes(p.type);
    // SRD order: Resistance (halved, rounded down), then Vulnerability (doubled); each counts once.
    const resisted = !pierce && (applies(m.resist, t.resist) || p.type === braced), vulnerable = applies(m.vulnerable, t.vuln);
    let n = base[pi];
    if (!pierce && applies(m.immune, t.immune)) n = 0;
    else { if (resisted) n = Math.floor(n / 2); if (vulnerable) n *= 2; }
    const ref = cut ? base[pi] : p.amount;                 // after a reaction's cut, Resistance is judged against what was left
    const note = n === 0 && ref > 0 ? 'immune' : resisted && vulnerable && ref > 0 ? 'resisted and vulnerable' : n < ref ? 'resisted' : n > ref ? 'vulnerable' : undefined;
    total += n;
    const soak = raw ? 0 : Math.min(t.tempHp ?? 0, n);
    if (soak) t.tempHp -= soak;
    lost += n - soak;
    if (!dying) t.hp = Math.max(0, t.hp - (n - soak));
    ev.push({ type: 'damage', target: t.id, amount: n, dtype: p.type, hp: dying ? 0 : t.hp, note, ...(noted[pi].length ? { adjusted: noted[pi] } : {}), ...(soak ? { temp: soak, tempHp: t.tempHp } : {}), ...rolledOf(p, n) });
  }
  if (t.tempFx && !(t.tempHp > 0)) delete t.tempFx;
  if (total > 0) damaged(s, ev, t, parts.find((p) => typeof p.by === 'string')?.by ?? null, KIT);      // "until it takes any damage" (Turn Undead); a save on damage (Dominate Monster)
  // Relentless Rage: dropping to 0 Hit Points without dying outright while raging, a Constitution save keeps it up.
  if (!dying && t.hp <= 0 && lost - before < t.maxHp) relentless(s, t, ev);
  if (dying) {                                            // already dying
    if (total > 0) { t.death.f += crit ? 2 : 1; delete t.cond.stable; if (t.death.f >= 3 || total >= t.maxHp) t.dead = true; }   // as much as the maximum kills outright
    if (t.dead) ev.push({ type: 'died', id: t.id });
    return;
  }
  if (t.hp > 0) {
    if (!(total > 0)) return undefined;
    const kept = concentrationCheck(s, ev, t, total, KIT);
    // Taking damage from a creature it can see may set off a reaction (Hellish Rebuke).
    const by = parts.find((p) => typeof p.by === 'string')?.by;
    if (by) reactAgainst(s, t, s.entities[by], 'damaged', ev, `${t.name} takes damage from ${s.entities[by]?.name ?? 'someone'}.`);
    return kept;
  }
  if (t.kind === 'pc' && lost - before < t.maxHp) {       // otherwise: instant death from massive damage
    t.cond.unconscious = {}; t.cond.prone = {}; t.death = { s: 0, f: 0 };
    ev.push({ type: 'down', id: t.id });
  } else { t.dead = true; ev.push({ type: 'died', id: t.id }); }
  concentrationLost(s, ev, t, `${t.name} went down`);
}

// A feature reaction `{ on: 'damaged', resist: true }` (Superior Hunter's Defense): when its creature
// takes damage it may take its Reaction for Resistance to that damage, and to any other of that type
// until the end of the current turn (a part that ends then, `ends.who`). Not for a type it already
// resists or is immune to; damage of several types at once is the player's pick, so the DM is told and
// nothing is spent. Its instruction decides (always, never, or ask its player). Returns the type, or null.
function braceAgainst(s, t, parts, m, ev) {
  if (t.object || !canReact(t)) return null;
  const r = reactionsOf(t).find((x) => x.kind === 'feature' && x.on === 'damaged' && x.reaction.resist);
  if (!r) return null;
  const w = instruction(t, r);
  if (w === 'never') return null;
  const has = (list, own, ty) => list === true || list.includes(ty) || (own ?? []).includes(ty);
  // Only damage of a type (the DM's untyped damage is none), and not a type it already resists or is immune to.
  const all = [...new Set(parts.filter((p) => p.amount > 0).map((p) => p.type))];
  if (!all.length || !all.every((ty) => DAMAGE_TYPES.includes(ty))) return null;
  const types = all.filter((ty) => !has(m.resist, t.resist, ty) && !has(m.immune, t.immune, ty));
  if (!types.length) return null;
  if (types.length > 1) {
    ev.push({ type: 'manual', actor: t.id, name: r.name, partial: true, text: `${t.name} takes ${types.join(' and ')} damage at once. ${r.name} gives Resistance to one type the player picks; if taken, the DM applies it and marks the Reaction used.` });
    return null;
  }
  if (w === 'ask') {
    const a = ask(s, t, { trigger: 'damaged', dtype: types[0] }, [{ reaction: r.id, name: r.name }]);
    if (a === null) { tellDM(t, r, `${t.name} takes ${types[0]} damage.`, ev); return null; }
    if (a.take !== r.id) return null;
  }
  t.reactionUsed = true;
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'damaged', dtype: types[0] });
  if (s.encounter) {
    const fx = startEffect(s, { name: r.name, spell: null, source: t.id, conc: false, duration: 'special' });
    fx.bound = true;
    fx.parts.push({ target: t.id, modifier: { on: 'damage.taken', op: 'resist', types: [types[0]] }, ends: { on: 'turnEnd', who: current(s) } });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: t.id, conc: false, lasts: 'until the end of the current turn', targets: [t.id] });
  }
  return types[0];
}

// When a creature hits one with `afterHit` (Multiattack Defense) with an attack roll, the attacker gets
// that modifier against it until the end of the current turn, once a turn.
function afterHit(s, e, t, ev) {
  if (!s.encounter || e.object || t.object) return;
  for (const f of t.feats ?? []) {
    if (!f.afterHit) continue;
    const now = current(s);
    if (effectsOf(s).some((fx) => fx.feature === f.id && fx.source === t.id && fx.parts.some((p) => !p.ended && p.target === e.id && p.ends?.who === now))) continue;
    const fx = startEffect(s, { name: f.name, spell: null, source: t.id, conc: false, duration: 'special' });
    Object.assign(fx, { bound: true, feature: f.id });
    fx.parts.push({ target: e.id, modifier: structuredClone(f.afterHit.modifier), against: t.id, ends: { on: 'turnEnd', who: now } });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: t.id, conc: false, lasts: 'until the end of the current turn', targets: [e.id] });
  }
}

// A creature with `relentless` (Relentless Rage) has dropped to 0 Hit Points while the feature it
// names has its effect going: a Constitution save, DC `dc` plus `step` for each use since its last
// rest (counted in its `uses` under the feature's id; rests.js clears it), and on a success its Hit
// Points become `hp`.
function relentless(s, t, ev) {
  const f = (t.feats ?? []).find((x) => x.relentless);
  if (!f || !effectsOf(s).some((fx) => fx.source === t.id && fx.feature === f.relentless.while)) return;
  const r = f.relentless, n = t.uses?.[f.id] ?? 0, dc = r.dc + r.step * n;
  (t.uses ??= {})[f.id] = n + 1;
  const { used, ...sv } = savingThrow(s, t, 'con', dc, null, null, null, null, ev);
  ev.push({ type: 'save', id: t.id, abil: 'con', dc, ...sv, against: f.name });
  useUp(s, ev, used ?? []);
  if (!sv.success) return;
  t.hp = Math.min(t.maxHp, r.hp);
  ev.push({ type: 'std', id: t.id, action: f.name });
  ev.push({ type: 'heal', target: t.id, amount: t.hp, hp: t.hp });
}

// A creature that missed with an attack roll and has `missed` (Studied Attacks) gains its modifier
// against that target, on a lasting effect bound to it, until `ends` (in a fight: there are no turns
// outside one, and an attack roll starts one).
function studied(s, e, t, ev) {
  if (!s.encounter || e.object) return;
  for (const f of e.feats ?? []) {
    if (!f.missed) continue;
    const fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: 'special' });
    fx.bound = true;
    fx.parts.push({ target: e.id, modifier: structuredClone(f.missed.modifier), against: t.id, ends: { ...f.missed.ends }, born: turnKey(s) });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: 'until its parts end', targets: [e.id] });
  }
}

// Heavy lives in weapons.js (the AI asks it too); re-exported here for the importers that had it from this module.
export { heavyWeak };

// The d20 part of an attack: roll, compare with Armor Class, record it. Returns { hit, crit, mode }.
// `forgo`: the attacker gives up any Advantage on this roll (Brutal Strike).
// `keepHidden`: the attack does not end its hiding yet (Stealth Attack; resolveAttack decides).
// `atk.via`: a touch spell its caster's familiar delivers (casting.js, `deliver`; stage C5c). The caster makes the
// attack roll, with its own bonus, conditions and senses, but the touch is made from the familiar's space: distance,
// cover and what can be seen are worked out as if the caster stood there with the familiar's size.
function rollToHit(s, e, t, atk, ev, extra = {}, { forgo = false, keepHidden = false } = {}) {
  // An attack with no bonus the engine can read (a spell attack in a creature's action has none: #421) is not rolled: a total that is not a
  // number would be neither a hit nor a miss. The DM is told, and nothing is spent or changed but the attack itself.
  if (!Number.isFinite(atk.bonus)) {
    ev.push({ type: 'manual', actor: e.id, name: atk.name, partial: true, text: `${atk.name} has no attack bonus the engine can use, so the roll was not made. The DM rolls it and says whether it hits ${t.name}.` });
    return { hit: false, crit: false, mode: 'normal' };
  }
  const v = typeof atk.via === 'string' && Object.hasOwn(s.entities, atk.via) ? s.entities[atk.via] : null;
  const from = v ? { ...e, pos: v.pos, size: v.size } : e;
  let { mode, adv, dis, add, dice, crit: sureCrit, used } = rollMode(s, from, t, extra.opportunity ? { ...atk, opportunity: true } : atk);
  const heavy = heavyWeak(from, atk);
  if (heavy) { dis = [...dis, heavy]; mode = adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal'; }
  if (forgo && mode === 'adv') { mode = 'normal'; adv = []; }
  if (!keepHidden) unhide(s, e, ev, 'attack');                                           // an attack roll gives away where it is, hit or miss
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, dice);
  const bonus = atk.bonus + add + more.total;
  // Cover adds to Armor Class: 2 for half, 5 for three-quarters.
  const cover = e.object ? 'none' : coverOf(s, from, t, v ? living(s).filter((o) => o !== v && o !== e) : living(s)), ac = acOf(s, t) + (COVER[cover] ?? 0);
  // Improved Critical: a weapon attack scores a Critical Hit, and so hits, on a lower roll (`critOn`).
  const critRoll = nat === 20 || (!atk.spell && e.critOn && nat >= e.critOn);
  let hit = nat !== 1 && (critRoll || nat + bonus >= ac), ac2 = ac, cut = null;
  // A die that may turn a miss into a hit (Bardic Inspiration, Peerless Skill); never a natural 1.
  const lift = !hit && nat !== 1 ? rescue(s, e, 'attack.roll', ac - (nat + bonus), ev) : null;
  if (lift?.success) hit = true;
  const lifted = lift?.add ?? 0;
  // The target may react to being hit (reactions.js): Shield raises its Armor Class against this
  // very attack, so the roll is compared again; Uncanny Dodge and Deflect Attacks cut the damage.
  if (hit) {
    const r = reactToHit(s, t, e, atk, { total: nat + bonus + lifted, ac, critRoll }, ev);
    if (r?.ac) { ac2 = acOf(s, t) + (COVER[cover] ?? 0); hit = critRoll || nat + bonus + lifted >= ac2; }
    if (r?.acAdd) { ac2 = ac + r.acAdd; hit = critRoll || nat + bonus + lifted >= ac2; }
    if (r?.cut) cut = r.cut;
  }
  const crit = hit && (critRoll || sureCrit);
  ev.push({ type: 'attack', actor: e.id, target: t.id, name: atk.name, rolls: r2 ? [r1, r2] : [r1], nat,
    total: nat + bonus + lifted, ac: ac2, mode, why: mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...(lift ? { rescued: { name: lift.name, dice: lift.dice, add: lift.add } } : {}), ...(cover !== 'none' ? { cover } : {}), ...(more.extra.length ? { extra: more.extra } : {}),
    dice: [...d20Faces(r1, r2, nat), ...more.dice], bonus: atk.bonus + add, ...extra });
  useUp(s, ev, used);
  if (!hit) studied(s, e, t, ev);
  else afterHit(s, e, t, ev);
  if (s.encounter) s.encounter.flags[`attacked:${e.id}`] = true;           // Reckless Attack is decided before the first attack roll of a turn
  if (hit && s.encounter && !e.object) s.encounter.flags[`hit:${e.id}:${t.id}`] = true;     // a feature that follows a hit this turn (Hurl Through Hell)
  renew(s, e, t);
  return { hit, crit, mode, ...(cut ? { cut } : {}) };
}

// ---------- reactions (asking a player is ask() in shared.js) ----------

// Can `t` see `e` for a reaction whose trigger says "that you can see" (Counterspell: "when you see a creature ... casting a
// spell"; Hellish Rebuke: "a creature that you can see"; Uncanny Dodge: "an attacker that you can see"; the Opportunity
// Attack: "a creature that you can see leaves your reach", SRD 2093-2094)? Its senses must find it (`canSee`), and a
// party creature never sees a creature the party does not know of: one the DM has hidden, one hiding, one in a place not
// yet revealed, or under `los`/`light` one nobody in the party sees (vision.js `unknown`; fix round 1 of #373, M1). A
// creature is never asked, and never reacts, against what its side does not know is there.
export const seesFor = (s, t, e) => !!e && !e.object && canSee(s, t, e) !== 'no' && !(t.side === 'party' && unknown(s, e));
// A party creature whose own senses find a creature that is hiding from it (Blindsight within range sees it whatever it
// does; Truesight sees the Invisible, and hiding is the Invisible condition against its enemies: sight.js) can see it,
// though the party is not yet told of it. It may then react to it (#374, B1; the re-review of #373, L1). Only hiding
// gives way: a creature the DM has hidden, one somewhere not revealed, or one nobody in the party would see once it
// stopped hiding (`los`, `light`, read as vision.js partyView reads them) stays unknown, and nobody in the party reacts
// to it. Asked of a copy: the state is not touched (fix round 1 of #378, L2).
function foundBySense(s, t, e) {
  if (!e || e.object || t.side !== 'party' || !e.hiding || e.hidden || canSee(s, t, e) === 'no') return false;
  const shadow = { ...e, hiding: undefined };
  if (concealed(s.map, shadow)) return false;
  const rule = sightRule(s);
  if (rule === 'rooms') return true;
  const eyes = Object.values(s.entities).filter((v) => v.side === 'party' && up(v)).map(raised), at = raised(shadow);
  return eyes.some((v) => (rule === 'los' ? inViewOf(s.map, v, at) : canSee(s, v, at) !== 'no'));
}
// May `t` react to `e` by a trigger that says "that you can see": it sees it and its side knows of it (`seesFor`), or
// its own senses find it (above). Offering or asking needs nothing more: a question about a creature the party is not
// told of names nobody (no `by`). The finding itself is made only when the reaction is taken (`findFor`), so a
// reaction set to `never` and one asked and declined send every player the same (fix round 1 of #378, M1).
export const sensesFor = (s, t, e) => seesFor(s, t, e) || foundBySense(s, t, e);
// The events of the action so far that name a creature.
const NAMED = (x, id) => [x.id, x.actor, x.target, x.by, x.against, x.source, ...(Array.isArray(x.targets) ? x.targets : [])].includes(id);
// `t` takes a reaction against `e`, which its own senses found: `e` stops hiding (`unhidden`, why `found`, by `t`) just
// before the reaction, so the party is told first. What happened earlier in the action happened while the party did not
// know of `e`, and stays told so: each earlier event naming it carries it in `unseen` (as an E23 cast marks its own,
// casting.js; apply()'s record keeps the mark). Returns what was done, for `unfind`, or null when nothing was.
export function findFor(s, t, e, ev) {
  if (seesFor(s, t, e) || !foundBySense(s, t, e)) return null;
  const marked = [], dc = e.hiding.dc;
  for (const x of ev) {
    if (!x || !NAMED(x, e.id) || (Array.isArray(x.unseen) && x.unseen.includes(e.id))) continue;
    x.unseen = [...(Array.isArray(x.unseen) ? x.unseen : []), e.id];
    marked.push(x);
  }
  unhide(s, e, ev, 'found', t);
  return { e, dc, marked };
}
// A finding made by a reaction inside an attack or a cast. In a fight the creature does not move again before the action
// ends, so whether the end would have found it anyway is asked now (unfind). Outside a fight the only attack or harmful
// spell that reaches a reaction is an E23 cast (casting.js, landThenFight), which marks what the party did not know of
// while it was cast whatever happens after: the marks stay, as that cast would have made them.
function settleFound(s, found) { if (found && s.encounter) unfind(s, found); }
// Would the end of the action have found this creature anyway, had it still been hiding (features.js `watch`: an enemy
// that sees it, or, with the table rule passiveFind 'all', one whose passive Perception meets its DC and that has it in
// view)? Then the events before the finding are told as the end of the action would have told them: the marks go.
export function unfind(s, found) {
  if (!found) return;
  const h = { ...found.e, hiding: { dc: found.dc } };
  const anyway = living(s).some((o) => {
    if (!up(o) || !hostile(o, h)) return false;
    if (canSee(s, o, h) !== 'no') return true;
    if (s.settings.passiveFind !== 'all') return false;
    const w = canSee(s, o, h, { ignoreHiding: true });
    return w !== 'no' && passive(s, o, 'perception', w === 'dim' ? ['dim light'] : []) >= found.dc;
  });
  if (!anyway) return;
  for (const x of found.marked) {
    x.unseen = x.unseen.filter((id) => id !== found.e.id);
    if (!x.unseen.length) delete x.unseen;
  }
}

// Cast a spell as a Reaction: the Reaction and a slot are spent (the lowest it can use, unless
// its player chose), and its steps run at once on `targets` (the caster, or the creature that set
// it off), inside whatever action set it off (on the effect stack, above the frames already there,
// which carry on afterwards). Returns the source its steps ran with: a Counterspell that worked
// marks it `countered`.
export function castReaction(s, e, sp, slot, trigger, against, ev, targets = [e.id]) {
  e.reactionUsed = true;
  if (slot > 0) {
    e.slots[slot]--;
    if (s.encounter) { if (current(s) === e.id) s.encounter.flags.slot = true; else s.encounter.flags[`slot:${e.id}`] = true; }
  }
  ev.push({ type: 'reaction', id: e.id, reaction: sp.id, name: sp.name, trigger, ...(against ? { against } : {}) });
  if (sp.def.components?.includes('v')) unhide(s, e, ev, 'spell');
  ev.push({ type: 'cast', actor: e.id, spell: sp.id, name: sp.name, hexes: null, targets: [...targets], reaction: true, ...(slot > sp.level ? { slot } : {}) });
  const { steps, unscaled } = scaleSteps(sp.def, e.level, slot || sp.level);
  let fx = null;
  if (sp.def.duration !== 'instant') {
    fx = startEffect(s, { name: sp.name, spell: sp.id, source: e.id, conc: sp.def.concentration, duration: sp.def.duration });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [...targets] });
  }
  const st = spellStats(e, s, sp.id), depth = s.stack?.length ?? 0;
  const src = { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[castAbilOf(e, sp.id)] ?? 10), ...(fx ? { fx: fx.id } : {}), ...(trigger === 'cast' ? { counters: true } : {}) };
  begin(s, { steps, actor: e.id, targets: [...targets], src });
  run(s, ev, KIT, depth);
  if (sp.def.tier !== 'auto') ev.push({ type: 'manual', actor: e.id, name: sp.name, text: sp.def.text, partial: true });
  if (unscaled) ev.push({ type: 'manual', actor: e.id, name: sp.name, partial: true, text: `Cast with a level ${slot} slot. The engine could not add ${unscaled}; the DM does.` });
  return src;
}

// `t` was hit by `e`'s attack roll. Its reactions for a hit that its instructions let fire and it
// can take now are gathered. If any says `ask`, a player is asked which (if any) to take, with
// the roll and its Armor Class; otherwise the first is taken, as in part 1. Returns { ac: true }
// if its Armor Class may have changed (Shield), { acAdd } to add to it against this attack only
// (Parry), { cut } to cut the attack's damage, or null.
function reactToHit(s, t, e, atk, roll_, ev) {
  if (!canReact(t) || t.object) return null;
  const offers = [];
  for (const r of reactionsOf(t)) {
    if (r.on !== 'hit') continue;
    const w = instruction(t, r);
    if (w === 'never') continue;
    let o, slots = null;
    if (r.kind === 'spell') {
      slots = slotsFor(s, t, SPELLS[r.id]);
      if (!slots.length) continue;
      o = spellOffer(r, slots, r.ac ? { ac: r.ac } : {});
    } else if (r.kind === 'trait') {
      if (r.attack && atk.type !== r.attack) continue;                                  // Parry: "a melee attack roll"
      o = { reaction: r.id, name: r.name, ac: r.ac };
    } else if (r.kind === 'feature') {
      const x = r.reaction;
      if (x.seen && !sensesFor(s, t, e)) continue;                                      // "an attacker that you can see"
      if (x.types && !attackTypes(atk).some((d) => x.types.includes(d))) continue;      // Deflect Attacks: Bludgeoning, Piercing or Slashing
      o = { reaction: r.id, name: r.name };
    } else continue;
    if (w === 'miss' && (roll_.critRoll || roll_.total >= roll_.ac + (r.ac ?? 0))) continue;     // it would hit anyway
    offers.push({ r, w, o, slots });
  }
  let chosen = offers.find((x) => x.w !== 'ask') ?? null, slot;
  if (offers.some((x) => x.w === 'ask')) {
    const seen = seesFor(s, t, e);
    // An attacker the party does not know of is not named, nor is its weapon (#374, B2; the re-review of #373, L2): the
    // total and the Armor Class are what the answer turns on.
    const a = ask(s, t, { trigger: 'hit', ...(seen ? { by: e.id, attack: atk.name } : {}), total: roll_.total, ac: roll_.ac, ...(roll_.critRoll ? { crit: true } : {}) }, offers.map((x) => x.o));
    if (a === null) for (const x of offers) { if (x.w === 'ask') tellDM(t, x.r, `${t.name} is hit by ${e.object ? 'a trap' : e.name}'s attack.`, ev); }
    else { chosen = offers.find((x) => x.r.id === a.take) ?? null; slot = a.slot; }
  }
  if (!chosen) return null;
  if (chosen.r.kind === 'feature' && chosen.r.reaction.seen) settleFound(s, findFor(s, t, e, ev));    // taken against a foe its senses found: the party is told first
  const { r } = chosen, against = e.object ? {} : { against: e.id };
  if (r.kind === 'spell') {
    castReaction(s, t, SPELLS[r.id], slot ?? chosen.slots[0], 'hit', e.object ? null : e.id, ev);
    return { ac: true };
  }
  t.reactionUsed = true;
  if (r.kind === 'trait') {
    ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'hit', ...against });
    if (r.manual) ev.push({ type: 'manual', actor: t.id, name: r.name, text: r.manual, partial: true });
    return { acAdd: r.ac };
  }
  const x = r.reaction;
  let cut;
  if (x.cut === 'half') cut = { half: true, name: r.name };
  else { const rr = roll(s, x.cut.dice); cut = { less: Math.max(0, rr.total), name: r.name, dice: rr.dice, bonus: rr.bonus }; }
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'hit', ...against, ...(cut.less !== undefined ? { amount: cut.less, dice: cut.dice, bonus: cut.bonus, by: t.id } : {}) });
  if (r.tier !== 'auto') ev.push({ type: 'manual', actor: t.id, name: r.name, text: r.text, partial: true });
  return { cut: cut.half ? { half: true, name: r.name } : { less: cut.less, name: r.name } };
}

// A reaction spell whose trigger is another creature (`cast`: Counterspell; `damaged`: Hellish
// Rebuke) that `t` would take now against `e`: hostile, within the spell's range, seen, and with a
// slot to cast it with. Its instruction decides, or its player when it says `ask`. Casts it and
// returns its source (see castReaction), or returns null.
export function reactAgainst(s, t, e, on, ev, why) {
  if (!canReact(t) || t.object || !e || e.object || e.id === t.id || !hostile(t, e) || !up(e)) return null;
  for (const r of reactionsOf(t)) {
    if (r.on !== on) continue;
    if (r.kind === 'feature' && r.reaction.attack) { if (strikeBack(s, t, e, r, ev, why)) return {}; continue; }
    if (r.kind !== 'spell') continue;
    const w = instruction(t, r);
    if (w === 'never') continue;
    const sp = SPELLS[r.id], slots = slotsFor(s, t, sp);
    if (!slots.length || apart(s, t, e) * FT > (typeof sp.range === 'number' ? sp.range : 0) || !sensesFor(s, t, e)) continue;
    let slot = slots[0];
    if (w === 'ask') {
      // A creature the party is not told of is not named in the question (fix round 1 of #378, L3).
      const a = ask(s, t, { trigger: on, ...(seesFor(s, t, e) ? { by: e.id } : {}) }, [spellOffer(r, slots)]);
      if (a === null) { tellDM(t, r, why, ev); continue; }
      if (a.take !== r.id) return null;
      slot = a.slot ?? slot;
    }
    settleFound(s, findFor(s, t, e, ev));                                               // taken against a foe its senses found: the party is told first
    return castReaction(s, t, sp, slot, on, e.id, ev, [e.id]);
  }
  return null;
}

// A feature reaction that answers damage with a melee attack (Retaliation: `{ on: 'damaged', attack:
// 'melee', within }`): `t` took damage from `e`, within `within` feet. Its instruction decides, or its
// player when it says `ask`. It attacks with its first melee attack, as an Opportunity Attack is made (weapons.js, steadiest: not a Heavy one it is weak with, if another will do).
// Returns true if it was taken.
function strikeBack(s, t, e, r, ev, why) {
  const x = r.reaction, atk = steadiest(t, (t.attacks ?? []).filter((a) => a.type === 'melee' && !handsFull(s, t, a)));       // one it may make (weapons.js)
  if (!atk || t.actions || apart(s, t, e) * FT > x.within) return false;
  if (atk.reach !== undefined && apart(s, t, e) * FT > atk.reach) return false;
  const w = instruction(t, r);
  if (w === 'never') return false;
  if (w === 'ask') {
    const a = ask(s, t, { trigger: 'damaged', by: e.id }, [{ reaction: r.id, name: r.name }]);
    if (a === null) { tellDM(t, r, why, ev); return false; }
    if (a.take !== r.id) return false;
  }
  t.reactionUsed = true;
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'damaged', against: e.id });
  resolveAttack(s, t, e, atk, ev, { reaction: r.id });
  return true;
}

// A weapon attack by a creature whose attacks are still flat records (monsters and
// hand-entered characters). Spells resolve through effect steps instead.
// `brutal`: a Brutal Strike option chosen for this attack ({ id, name, dice, effects, unique? },
// attacks.js, brutalFor): Advantage is given up, and a hit deals `dice` more and then runs the option.
// `cunning`: Cunning Strike options chosen for this attack (attacks.js, cunningFor): their cost in Sneak
// Attack dice is taken off before the dice are rolled, and their steps run after the damage, only if
// Sneak Attack is dealt. One that keeps its creature hidden (Stealth Attack) holds off the attack's
// unhiding to the end of the turn (attacks.js, endTurn); if it is not paid for, the attack unhides it.
export function resolveAttack(s, e, t, atk, ev, extra = {}, { brutal = null, cunning = null } = {}) {
  const keepHidden = !!e.hiding && !!cunning?.some((o) => o.keepHidden);
  const { hit, crit, mode, cut } = rollToHit(s, e, t, atk, ev, extra, { forgo: !!brutal, keepHidden });
  if (!hit) { if (keepHidden) unhide(s, e, ev, 'attack'); return; }
  const rs = [roll(s, atk.damage, { crit })];
  const notes = [];
  if (brutal) { rs.push(roll(s, brutal.dice, { crit })); notes.push(`Brutal Strike: ${brutal.name}`); }
  if (atk.bonusOnAdv && mode === 'adv') rs.push(roll(s, atk.bonusOnAdv, { crit }));
  const sneakKey = `sneak:${e.id}`;
  let paid = null;
  if (e.features.sneak && !atk.spell && (atk.finesse || atk.type === 'ranged') && !s.encounter?.flags[sneakKey] && mode !== 'dis') {
    const flank = living(s).some((o) => o.id !== e.id && up(o) && !incapacitated(o) && hostile(o, t) && apart(s, o, t) <= 1);     // an ally who is not Incapacitated
    if (mode === 'adv' || flank) {
      // Cunning Strike: the dice its effects cost are taken off before the roll.
      const cost = (cunning ?? []).reduce((a, o) => a + o.cost, 0), m = /^(\d+)d(\d+)$/.exec(e.features.sneak);
      rs.push(roll(s, cost && m ? `${+m[1] - cost}d${m[2]}` : e.features.sneak, { crit }));   // cunningFor leaves at least one die
      if (s.encounter) s.encounter.flags[sneakKey] = true;
      notes.push('Sneak Attack', ...(cunning ?? []).map((o) => `Cunning Strike: ${o.name}`));
      paid = cunning;
    }
  }
  if (cunning && !paid) notes.push('No Sneak Attack, so no Cunning Strike');
  if (keepHidden) { if (paid && s.encounter) s.encounter.flags[`stealth:${e.id}`] = true; else unhide(s, e, ev, 'attack'); }
  if (notes.length) ev.push({ type: 'note', id: e.id, text: notes.join(', ') });
  const r = together(...rs);
  damage(s, t, dealt(s, e, t, [{ amount: r.total, type: atk.dtype, dice: r.dice, bonus: r.bonus, by: e.id }], { hit: true, weapon: !atk.spell, ranged: atk.type === 'ranged', ...(atk.abil ? { str: atk.abil === 'str' } : {}) }, crit), null, ev, { crit, ...(cut ? { cut } : {}) });
  if (atk.onHit === 'prone') condition(s, t, 'prone', ev);
  if (brutal && !t.dead) strikeEffect(s, e, t, brutal, ev);
  for (const o of paid ?? []) if (o.effects && !t.dead) strikeEffect(s, e, t, o, ev);
}

// What a choice made for a hit does to its target after the damage (a Brutal Strike option): its
// steps, on a lasting effect bound to its parts when they have an ending. `unique`: an earlier one
// of the same option on that target, from anyone, ends first ("only the most recent one").
// With `duration` (a Cunning Strike's Poison), its steps hang on a lasting effect of that length, dropped
// if they put nothing on the target. The DC of a save that ends what it did is its own save's.
export function strikeEffect(s, e, t, o, ev) {
  if (o.unique) for (const fx of [...effectsOf(s)]) if (fx.option === o.id && fx.parts.some((p) => p.target === t.id && !p.ended)) endEffect(s, ev, fx, `a new ${o.name}`);
  const steps = structuredClone(o.effects);
  let fx = null, dc;
  walkSteps(steps, (x) => { if (dc === undefined && 'save' in x && typeof x.dc === 'number') dc = x.dc; });
  if (o.duration) {
    fx = startEffect(s, { name: o.name, spell: null, source: e.id, conc: false, duration: o.duration });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: [t.id] });
  } else fx = boundEffect(s, o.name, e.id, steps);
  if (fx) fx.option = o.id;
  const depth = s.stack?.length ?? 0;
  begin(s, { steps, actor: e.id, targets: [t.id], src: { name: o.name, ...(dc !== undefined ? { dc } : {}), ...(fx ? { fx: fx.id } : {}) } });
  if (depth) run(s, ev, KIT, depth); else resolve(s, ev);
  if (fx?.bound) settle(s, ev, fx, [t]);
  else if (fx && !fx.parts.length) endEffect(s, ev, fx, 'it took no hold');
}

// A creature's action has no save DC of its own (a spell has the caster's): a condition or a modifier it puts on that ends on a
// repeated save is rolled against the entry's `ends.dc` if it has one, else the DC of the save that put it on (the SRD's "repeats
// the save": the same DC). Written on the action's own copy of its steps, so the entry is not changed. The innermost save wins.
function endingsTakeSaveDc(steps) {
  const saves = [];
  walkSteps(steps, (st) => { if ('save' in st && Number.isInteger(st.dc)) saves.push(st); });
  for (const sv of saves.reverse()) walkSteps([sv], (st) => { if (st.ends?.on === 'save' && st.ends.dc === undefined) st.ends.dc = sv.dc; });
}

// Run an action's effect steps against its targets. Costs are the caller's. `tag` marks the
// attack event (an Opportunity Attack).
export function runAction(s, e, def, targets, hexes, origin, ev, tag = null) {
  showPlace(s, e, ev);
  for (const t of targets ?? []) if (t.id !== e.id) { if (def.target.creature) showPlace(s, t, ev); else reveal(s, t, ev); }
  const c = def.target.creature;
  // An attack roll says what it is in its own event; anything else (a breath, a gaze) is announced.
  if (!('attack' in def.effects[0])) ev.push({ type: 'act', actor: e.id, action: def.id, name: def.name, hexes, targets: (targets ?? []).map((t) => t.id) });
  const steps = structuredClone(def.effects), fx = boundEffect(s, def.name, e.id, steps);
  endingsTakeSaveDc(steps);
  begin(s, {
    steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
    src: { name: def.name, ...(c ? { reach: c.reach, rangeBand: c.range, range: c.range?.[1] ?? c.reach } : {}), ...(origin ? { origin } : {}), ...(tag ? { tag } : {}), ...(fx ? { fx: fx.id } : {}) },
    shared: def.target.area && targets ? sharedRolls(s, def.effects) : null,
  });
  resolve(s, ev);
  if (fx) settle(s, ev, fx, targets ?? []);
}

// ---------- companions leaving the map (docs/specs/companions.md, Decision 4) ----------

// What a bonded creature carried stays where it was (SRD Find Familiar: "leaves behind anything it was
// wearing or carrying"): its gear by name, and any magic items on a sheet, go onto the pile in its cell
// (or a new one), past PILE_MAX if need be, so nothing is lost and nothing is made twice. With nothing
// at all under it, the DM is told what it carried.
// One the party did not know of leaves them as `drop` does for such a creature: on a pile of its own, marked
// `by` it (world.js, pileOpen), and `left`, since it is gone and the party can never come to know of it:
// `seePiles` keeps such a pile the DM's (they open it, with the map editor, when the party finds it), and so
// every pile it dropped unseen before. Players are told nothing: their view is as if it had simply died
// unseen with nothing on it (review of #313, M1).
function leaveGear(s, e, ev, unseen, went = 'vanished') {
  if (unseen) for (const o of s.map.objects) if (isPile(o) && o.by === e.id) o.left = true;
  const items = [...(Array.isArray(e.gear) ? e.gear : []).map((g) => ({ name: String(g) })),
    ...(Array.isArray(e.sheet?.items) ? e.sheet.items : []).filter((x) => x && typeof x === 'object').map(({ id: _k, equipped: _q, attuned: _a, ...spec }) => spec)];
  if (!items.length) return;
  const sf = under(s.map, e.pos);
  if (!sf) {
    ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true, text: `${e.name} ${went} with nothing under it. What it carried is the DM's to place: ${items.map((x) => x.name ?? CONTENT.items[x.item]?.name ?? x.item).join(', ')}.` });
    return;
  }
  const by = unseen ? e.id : null;
  let o = pileAt(s, sf.level.id, e.pos, by);
  const placed = !o;
  if (!o) {
    o = { id: pileId(s, sf.level.id, e.pos, by), def: 'pile', level: sf.level.id, at: { q: e.pos.q, r: e.pos.r }, state: CONTENT.objects.pile.initial, contents: [], ...(by ? { by, left: true } : {}) };
    s.map.objects.push(o);
  }
  if (!Array.isArray(o.contents)) o.contents = [];
  for (const x of items) {
    let n = 1;
    while (o.contents.some((y) => y?.id === `c${n}`)) n++;
    o.contents.push({ id: `c${n}`, ...x });
  }
  // Seen by the party, `seen` lets the line reach them though the creature is gone (view.js, `object`).
  ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'drop', ...(placed ? { placed: true } : {}) });
  if (unseen) ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true,
    text: `${e.name} ${went} where the party could not see it. What it carried (${items.map((x) => x.name ?? CONTENT.items[x.item]?.name ?? x.item).join(', ')}) lies in ${o.id}, which only you see: when the party finds it, open it to them with the map editor: the pile without \`by\` or \`left\`, and with the id of the cell's own pile (\`pile-<level>-<q>_<r>\`, no \`-h\`), or onto that pile if there is one.` });
}

// What a companion the party could see leaves undone ends with it. A part on it, or one that was to end with
// a turn of its (`ends.who`: "until the end of its next turn"), ends: that turn will not come (review of #313,
// L7). A condition it put on another with no lasting effect behind it: a grapple ends, since there is nobody
// left to hold on (SRD Grappled); any other loses the name of a creature that is no longer there, and the DM
// is told it is theirs to end (L3).
function settleSeen(s, e, ev, went = 'vanished') {
  const name = e.name, its = (p) => !p.ended && (p.target === e.id || p.ends?.who === e.id);
  for (const fx of [...effectsOf(s)]) {
    if (fx.source === e.id) { endEffect(s, ev, fx, `${name} ${went}`); continue; }
    const on = fx.parts.filter(its);
    if (!on.length) continue;
    if (fx.parts.every((p) => p.ended || its(p))) endEffect(s, ev, fx, `${name} ${went}`);
    else useUp(s, ev, on);
  }
  for (const x of Object.values(s.entities)) {
    if (x.id === e.id || !x.cond) continue;
    for (const [c, v] of Object.entries(x.cond)) {
      if (v?.source !== e.id || v.effect !== undefined) continue;
      if (c === 'grappled') { delete x.cond[c]; ev.push({ type: 'condEnd', id: x.id, cond: c }); continue; }
      delete v.source;
      ev.push({ type: 'manual', actor: null, name, partial: true, text: `${x.name} is still ${conditionName(c)} from ${name}, which has ${went === 'vanished' ? 'vanished' : 'gone'}. Whether that ends is the DM's.` });
    }
  }
}
// A bonded creature leaves the map: `why` is 'hp0' (it dropped to 0 Hit Points and its bond says it
// vanishes), 'ended' (the lasting effect that kept it ended), 'master' (its master died), 'rest' (its master
// finished a Long Rest, rests.js), 'leash' (it ended too far from its master), 'dismissed', and in a later
// stage 'replaced'. What it was concentrating on and its own lasting effects
// end; a part of another's effect that was on it ends (the effect too, if nothing else was left of it);
// it leaves the fight order (its own turn, if it is going on, passes); what it carried stays behind; the
// record goes. `vanished { id, name, why }` carries `seen` when the party knew of it just before and
// `party` when it was the party's, since view.js can no longer look it up (hidden-information.md).
export function vanish(s, e, why, ev) {
  const seen = !unknown(s, e), party = e.side === 'party', name = e.name;
  if (!seen) return vanishUnseen(s, e, why, ev);
  const shown = seenName(e);                          // what players were shown of it, for the fight's rewards (A3)
  settleSeen(s, e, ev);
  for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
  if (e.follow) unfollow(s, e, ev);
  leaveGear(s, e, ev, false);
  const enc = s.encounter;
  let theirs = false;
  if (enc) {
    const i = enc.order.findIndex((o) => o.id === e.id);
    if (i >= 0) {
      theirs = i === enc.turn;
      enc.order.splice(i, 1);
      if (i <= enc.turn) enc.turn--;                  // its own turn: the one before stands, and the turn passes below
      if (enc.moved) { delete enc.moved[e.id]; if (!Object.keys(enc.moved).length) delete enc.moved; }
      if (enc.held) delete enc.held[e.id];
      // A foe that took part counts toward the fight's XP as any foe does (companions.md, amendment A3): its record
      // goes, so the fight keeps what the conclusion needs of it (rewards.js, concludeFight). Only a creature the
      // party saw vanish comes here; one it could not see stays as a husk in the order (vanishUnseen) and counts there.
      if (e.side === 'foe') (enc.gone ??= []).push({ id: e.id, name, shown, tpl: e.tpl ?? null });
    }
    // Flags that name it (`hit:<id>:<target>`, `attacked:<id>`) go with it: once it is gone nothing can tell
    // whether players may know of it (view.js filters flags by the creatures there are; review of #313, L2).
    for (const k of Object.keys(enc.flags ?? {})) if (k.split(':').includes(e.id)) delete enc.flags[k];
  }
  // The last foe of a fight to fall vanishes after the fight's conclusion is made (settleBonds runs after the
  // action): marked there, so the card names it as it names a corpse (review of #330, M1).
  const due = !enc && s.conclusion && !s.conclusion.published ? s.conclusion.foes.find((f) => f.id === e.id && !f.gone) : null;
  if (due) Object.assign(due, { gone: true, shown });
  delete s.entities[e.id];
  ev.push({ type: 'vanished', id: e.id, name, why, seen: true, ...(party ? { party: true } : {}) });
  if (why === 'hp0' && e.bond?.kind === 'object')
    ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} reverts to the object it was. The damage that took it past 0 carries over to that object: the DM's to apply.` });
  if (!s.encounter) return;
  checkEnd(s, ev);
  if (s.encounter && theirs) advanceTurn(s, ev);
}

// A companion the party could not see (round 3 of the review of #313, N2). Taking its record away would
// change what it did as an unseen creature's death never does: a zone it left would lose its caster and stop
// working, conditions and effects would point at nothing, its turn would pass at once. So it stays in the
// state as what such a death leaves: dead, at 0 Hit Points, hidden by the DM's switch for good (`vanished`
// marks it: `reveal` refuses it, settleBonds passes it by), in the fight order as the dead are (skipped, and
// its turn, if it is going on, waits for the DM as a dead creature's does). Only what it carried leaves it,
// onto a pile players are not sent (leaveGear). Everything it did goes on as after any death; the DM is told
// what is left, to end by hand, and may `remove` the record when nothing of it is needed.
function vanishUnseen(s, e, why, ev) {
  const name = e.name, left = [], kind = e.bond?.kind;
  // The husk is no one's companion: it does not count toward its master's companions (BOND_MAX, and a master
  // can't itself be bonded while it has any), and it is what any unseen death leaves (review of #313, round 4, L2).
  delete e.bond;
  leaveGear(s, e, ev, true);
  e.gear = [];
  if (Array.isArray(e.sheet?.items)) { e.sheet.items = []; delete e.sheet.attuning; }
  if (!e.dead) { e.hp = 0; e.dead = true; concentrationLost(s, ev, e, `${name} vanished`); }      // gone, not killed: no `died`
  e.hidden = true;
  e.vanished = why;
  for (const fx of effectsOf(s)) {
    if (fx.source === e.id) left.push(`${fx.name} (its own)`);
    else if (fx.parts.some((p) => !p.ended && (p.target === e.id || p.ends?.who === e.id))) left.push(`${fx.name} (a part on it, or ending with its turn)`);
  }
  for (const x of Object.values(s.entities)) for (const [c, v] of Object.entries(x.cond ?? {})) if (x.id !== e.id && v?.source === e.id) left.push(`${x.name} is ${conditionName(c)} from it`);
  ev.push({ type: 'vanished', id: e.id, name, why });
  ev.push({ type: 'manual', actor: null, name, partial: true,
    text: `${name} vanished where the party could not see it. So that the party learns nothing it could not, its record stays, dead and hidden, and what it did goes on as after a death${left.length ? `: ${left.join('; ')}` : ''}. End what should end (endEffect, condition) when the party could know, and remove ${name} when nothing of it is needed.${inFight(s, e.id) ? ` If this fight is won, ${name} counts toward its XP as any death does, unless you untick it.` : ''}` });
  if (why === 'hp0' && kind === 'object')
    ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} reverts to the object it was. The damage that took it past 0 carries over to that object: the DM's to apply.` });
  checkEnd(s, ev);
}

// After every action (engine.js, apply): a companion at 0 Hit Points whose bond says it vanishes, one
// kept by a lasting effect that no longer holds it (its `summon` part ended, or the effect did: durations.js,
// holds), one whose bond ends when its master dies and whose master is dead, and one farther than its leash
// from its master, leave the map (vanish). In the order the creatures are kept, so it replays exactly.
export function settleBonds(s, ev) {
  settleRiders(s, ev);
  const n = ev.length;
  for (const e of Object.values(s.entities).filter((x) => x.bond)) {
    if (!Object.hasOwn(s.entities, e.id) || e.vanished) continue;      // gone already (vanishUnseen)
    const b = e.bond, m = typeof b.to === 'string' && Object.hasOwn(s.entities, b.to) ? s.entities[b.to] : null;
    if ((e.dead || e.hp <= 0) && b.at0 === 'vanish') vanish(s, e, 'hp0', ev);
    else if (b.fx && !holds(s, e)) { if (b.lapse === 'foe') lapse(s, e, m, ev); else vanish(s, e, 'ended', ev); }
    else if (m?.dead && Array.isArray(b.ends) && b.ends.includes('masterDies')) vanish(s, e, 'master', ev);
    else if (m && !e.dead && Number.isFinite(b.leash) && apart(s, e, m) * FT > b.leash) vanish(s, e, 'leash', ev);
  }
  // A mount that vanished just now (a Find Steed whose master died with someone else on it) leaves its rider down where
  // it stands in this same action, not at the next one (found by the C7 stress loop: the ride was half a pair between).
  if (ev.slice(n).some((x) => x.type === 'vanished')) settleRiders(s, ev);
  // A companion whose place behind its master can now be taken (its master joined, or came to be known to the
  // party) takes it, if that is safe in the middle of the round (world.js, followMasters).
  followMasters(s, true);
}

// The 24 hours of control of a creature raised from a corpse ran out (Decision 7; owner's question 5; stage C5b): the
// bond ends, the creature stays where it is, and it "stops obeying any command you've given it": no longer its
// master's, a foe the DM plays. That happens in the middle of a fight too (the SRD gives it no choice), where it keeps
// its place in the order. The DM is told (`manual`, the DM's alone); the party's own caster's player is told that it
// no longer obeys, which they would know (the control is the caster's own); nothing reaches players of a foe's. One
// that is dead by then is only freed: a corpse has nothing to obey.
function lapse(s, e, m, ev) {
  const from = e.bond.to, src = SPELLS[e.bond.source]?.name ?? 'the spell', was = e.side, mine = !!m && m.side === 'party';
  delete e.bond;
  ev.push({ type: 'unbonded', id: e.id, from, why: 'lapsed' });
  if (e.dead) return;
  if (was !== 'foe') {
    if (e.follow) unfollow(s, e, ev);
    for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
    e.side = 'foe';
  }
  const who = m?.name ?? 'its master';
  if (mine) ev.push({ type: 'manual', actor: m.id, name: src, text: `${e.name} no longer obeys ${who}: ${src}'s 24 hours of control are over.` });
  ev.push({ type: 'manual', actor: null, name: src, partial: true,
    text: `${e.name} is no longer under ${who}'s control: ${src}'s 24 hours ran out without the spell being cast on it again. It obeys no command and ${was === 'foe' ? 'is the DM\'s to play as it likes' : 'has joined the foes, the DM\'s to play'}.` });
  // A new foe in a fight going on: whether the fight still stands is settled now, not at the next action. (A party
  // creature that is not a character does not keep the party standing, partyOf, so this can only keep a fight going.)
  checkEnd(s, ev);
}

// ---------- the summon step (docs/specs/companions.md, Decision 2; stage C3) ----------

// How many creatures a step's `count` (or `reassert`) gives at spell level `slot`: a whole number, or { slot, base, above }.
export const summonCount = (c, slot) => (c === undefined ? 1 : Number.isInteger(c) ? c : (c.base ?? 0) + c.slot * (slot - (c.above ?? 0)));
// What `on: 'corpse'` works on (Decision 7; both SRD spells that raise corpses, Animate Dead and Create Undead, say the
// same): the corpse of a Medium or Small Humanoid. Control lasts 24 hours.
export const CORPSE = { sizes: ['small', 'medium'], type: 'humanoid', control: '24 hours' };

// What a summon step makes, for its master `m` and the choices `pick` ({ variant?, type?, form? }) at spell level
// `slot` with the master's numbers `caster`: { tplId, record, type, name }. The cast checked all of it.
export function summonMade(step, pick, slot, caster) {
  if (step.forms !== undefined) {
    const m = CONTENT.monsters[pick.form];
    return { tplId: pick.form, record: MONSTERS[pick.form], type: pick.type ?? m.type, name: m.name };
  }
  if (CONTENT.summons[step.summon]) {
    const t = summonTemplate(step.summon, { slot, caster, ...(pick.variant !== undefined ? { variant: pick.variant } : {}), ...(pick.type !== undefined ? { type: pick.type } : {}) });
    return { tplId: step.summon, record: t.record, type: t.type, name: t.name };
  }
  const m = CONTENT.monsters[step.summon];
  return { tplId: step.summon, record: MONSTERS[step.summon], type: pick.type ?? m.type, name: m.name };
}
// `over` (Phantom Steed's Speed 100): its speeds replaced on the made record.
function overRecord(record, over) {
  if (!over?.speed) return record;
  const r = structuredClone(record);
  for (const [k, v] of Object.entries(over.speed)) { if (k === 'walk') r.speed = v; else (r.speeds ??= {})[k] = v; }
  return r;
}
// A summon cast with no `summon` field (engine/casting.js, summonFor; #332): nothing is made. The DM is told what
// this casting would make and with which numbers (each choice of the block baked at this level with the master's
// numbers, as the step would bake it), where it may go and how to add it. That line is the DM's alone (`partial`): the
// numbers are the block's. The player's own line says only that the DM adds what it summons (#331 review, M1/M2).
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const or = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
function summonHandOver(s, m, step, src, ev) {
  const { slot, caster, count } = src.summon, block = !!CONTENT.summons[step.summon], def = SPELLS[src.spell]?.def;
  const cap = (w) => `${w[0].toUpperCase()}${w.slice(1)}`;
  // The numbers `spawn` gives: a block baked for this casting, or the pack monster as it is (`over`, a Speed the spell
  // replaces, is not something `spawn` or any DM tool sets, so it is said apart).
  const core = (made) => {
    const r = made.record, moves = Object.entries(r.speeds ?? {}).map(([k, v]) => `${cap(k)} ${v} ft.`);
    return `${made.name} (AC ${r.ac}, ${r.hp} Hit Points, Speed ${[`${r.speed} ft.`, ...moves].join(', ')}`;
  };
  let what, over = '', single = false;
  if (step.forms !== undefined) {
    what = Array.isArray(step.forms) ? or(step.forms.map((f) => CONTENT.monsters[f]?.name ?? f)) : `any ${step.forms.type} of Challenge Rating ${step.forms.cr}`;
  } else {
    // Picks that bake to the same numbers are listed once, with every size or creature type they cover (Draconic
    // Spirit's five breath types; Animated Object's Tiny, Small and Medium; the steed's three creature types).
    const groups = new Map();
    for (const variant of step.variants ?? [undefined]) for (const type of (block ? step.types : null) ?? [undefined]) {
      const pick = { ...(variant !== undefined ? { variant } : {}), ...(type !== undefined ? { type } : {}) };
      const made = summonMade(step, pick, slot, caster), key = core(made), g = groups.get(key) ?? { sizes: [], types: [] };
      if (!g.sizes.includes(made.record.size)) g.sizes.push(made.record.size);
      if (type !== undefined) g.types.push(type);
      groups.set(key, g);
    }
    what = or([...groups].map(([key, g]) => `${key.replace(' (AC', g.types.length ? ` as a ${or(g.types)} (AC` : ' (AC')}, ${or(g.sizes.map(cap))})`));
    single = groups.size === 1 && !!step.variants;
    const o = step.over?.speed;
    if (o && !block) over = ` The spell gives it Speed ${or(Object.entries(o).map(([k, v]) => `${k === 'walk' ? '' : `${k} `}${v} ft.`))}, which \`spawn\` does not set: the DM notes that by hand.`;
  }
  const choose = step.forms !== undefined || step.variants || (block && step.types);
  const objects = step.summon === 'animated-object';
  const types = step.types && !block ? `, of a creature type the caster picks (${or(step.types)}; \`spawn\` takes no creature type for a pack monster, so the DM notes the type by hand)` : '';
  const picked = single ? ` The caster's pick (${or(step.variants)}) changes none of these numbers; it is in the block's text.` : '';
  const numbers = block ? ` Its numbers are baked from ${m.name}'s: spell attack ${signed(caster.attack)}, spell save DC ${caster.dc}, Proficiency Bonus ${signed(caster.pb)}.${picked}` : '';
  const spawn = block ? `spawn with monster ${step.summon}, slot ${slot}${step.variants ? ', the variant' : ''}${step.types ? ', kind (its creature type)' : ''} and caster ${m.id}`
    : `spawn with the monster${step.forms !== undefined ? ' picked' : ` ${step.summon}`}`;
  const rest = (def?.effects ?? []).some((x) => !('summon' in x) && !('manual' in x)) ? ` The rest of ${src.name} that needs no creature, such as a Resistance it gives ${m.name}, was applied as usual.` : '';
  const tier = def && def.tier !== 'auto' ? ` ${def.text}` : '';
  const adds = objects ? `up to ${Math.max(caster.mod, 0)} objects (a Large counts as two, a Huge as three), of the size the caster picks`
    : count === 1 ? `the creature${choose ? ' the caster picks' : ''}` : `${count} creatures${choose ? ', of the kind the caster picks' : ''}`;
  const b = step.bond ?? {};
  // One per master (C5c): what the casting does to the one the master has, which the cast with picks would have done.
  const olds = (src.summon.had ?? []).map((id) => s.entities[id]?.name ?? m.pocket?.[id]?.name ?? id);
  const had = !olds.length ? '' : step.one === 'reform'
    ? ` ${m.name} already has ${olds[0]}: by the spell it takes the new form instead, where it is. The cast with \`summon: { form, type }\` (no space) does that; or the DM edits it.`
    : ` ${m.name} already has ${or(olds)}: by the spell the new one replaces it. The cast with picks does that; by hand the DM removes the old one.`;
  // Players are told only that the DM has something to add: no numbers, and nothing that says a creature exists.
  // (A hidden caster's line is dropped by the view, as any manual line of a creature the party does not know of.)
  ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name}: the DM adds what it summons.` });
  ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true,
    text: `${src.name} was cast at level ${slot} with nothing picked for the engine to summon, so it made nothing. The DM adds ${adds}: ${what}${types}.${over}${numbers}`
      + ` ${count === 1 && !objects ? 'It goes' : 'Each goes'} in an unoccupied space within ${src.range} ft. that ${m.name} can see (inside the arena in a fight). The DM's ${spawn} makes ${count === 1 && !objects ? 'it' : 'each'}; bond ${count === 1 && !objects ? 'it' : 'each'} to ${m.name} as ${an(b.kind ?? 'companion')}${b.turn ? ` with turn ${b.turn}` : ''}.`
      + `${src.fx ? ` A creature added so is not kept by the spell: the DM removes it when ${src.name} ends.` : ''}${had}${rest}${tier}` });
}

// Make the creatures `src.summon` names (checked when the spell was cast, engine/casting.js): each an ordinary
// creature from the baked block or the pack monster, on its master's side, with a bond to it. One made by a
// spell that lasts is a part of that spell's lasting effect (`{ target, summon: true }`), so ending the effect
// ends it (settleBonds). A foe's is named as the DM's `spawn` names a creature ("Giant Wasp 2"), so its name
// says nothing of its master; the party's is "Ven's Giant Wasp". It joins a fight going on if it stands in the
// arena, as a spawned creature does, straight after a master the party knows of (world.js, joinEncounter).
// `summoned { id, by, kind, fx? }`: players get it as `spawned` unless they know of its master (view.js).
function summon(s, m, step, src, ev) {
  const pick = src.summon;
  if (!pick) return ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name} names no spaces for the engine to summon into. The DM adds the creature.` });
  if (step.on === 'corpse') return pick.ids ? raise(s, m, step, src, ev) : corpseHandOver(m, step, src, ev);
  if (pick.reform) return reform(s, m, step, src, ev);
  if (!pick.at) return summonHandOver(s, m, step, src, ev);
  const made = summonMade(step, pick, pick.slot, pick.caster), record = overRecord(made.record, step.over);
  const fx = src.fx ? effectsOf(s).find((x) => x.id === src.fx) ?? null : null;
  const b = step.bond;
  // One per master (`one: 'replace'`, Find Steed): the one the master had goes first, so its space is free for the new one.
  for (const id of pick.replace ?? []) if (Object.hasOwn(s.entities, id)) vanish(s, s.entities[id], 'replaced', ev);
  for (const want of pick.at) {
    const at = nearestFree(s, { size: record.size }, want);
    // Both lines are the DM's alone (`partial`): a player caster must not be told a creature it does not know of is there.
    if (!at) { ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `The space named for ${src.name} is taken by a creature ${m.name} did not know of, and the engine found no unoccupied space near it, so nothing appeared. The DM places the creature (the player has not been told why).` }); continue; }
    if (at !== want) ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `A creature ${m.name} did not know of stands in the space named for ${src.name}, so the creature appeared in the nearest unoccupied space.` });
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === made.tplId && (!CONTENT.summons[made.tplId] || o.name?.startsWith(`${made.name} `))).length + 1;
    const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx ? fx.id : null, turn: b.turn, orders: b.orders ?? 'free', at0: b.at0, ends: [...(b.ends ?? [])],
      ...(b.range !== undefined ? { range: b.range } : {}), ...(b.leash ? { leash: b.leash } : {}), ...(b.noAttack ? { noAttack: true } : {}), ...(b.mount ? { mount: b.mount } : {}), slot: pick.slot, commanded: null, auto: false };
    const e = makeEntity(record, { id, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: at, side: m.side, ...(made.type ? { type: made.type } : {}), bond });
    s.entities[id] = e;
    if (fx) fx.parts.push({ target: id, summon: true });
    ev.push({ type: 'summoned', id, by: m.id, kind: b.kind, ...(fx ? { fx: fx.id } : {}) });
    if (e.side === 'party') lookAround(s, ev, [e]);                 // what a party member sees, the party sees
    if (s.encounter?.arena[col(at)]) joinEncounter(s, e, ev);
  }
}

// ---------- one per master, and the pocket dimension (Decisions 2 and 6; stage C5c) ----------

// The creatures a step with `one` acts on: master `m`'s companions of the step's kind made by this same spell, on the map
// (and, for `reform`, in its pocket dimension: a familiar there is still the master's). The SRD's "you can't have more
// than one familiar at a time" and "if you already have a steed from this spell" (Find Familiar, Find Steed).
export function oneOf(s, m, step, spell) {
  if (!step?.one) return [];
  const mine = (x) => x?.bond?.to === m.id && x.bond.kind === step.bond?.kind && x.bond.source === spell && !x.vanished;
  return [...Object.values(s.entities).filter(mine), ...(step.one === 'reform' ? pocketOf(m).filter(mine) : [])];
}
// What a familiar keeps when it takes a new form (`reform`): where it is and what is going on with it. The rest is the new
// form's statistics, Hit Points at the new form's maximum ("the familiar has the statistics of the chosen form").
const KEPT_ON_REFORM = ['cond', 'reactionUsed', 'gear', 'hidden', 'hiding', 'follow', 'light', 'look', 'away'];
// Find Familiar cast while the master has a familiar (`one: 'reform'`; SRD "One Familiar Only": "you instead cause it to
// adopt a new eligible form"): the same creature, same id, where it is (on the map, or in the pocket dimension), takes the
// form and creature type picked. It is made again from the new form's block, so its statistics and Hit Points (at the
// form's maximum) are the new form's; its place, conditions, Reaction, what it carries, its light and look, whether it is
// hidden or hiding and whom it follows stay, as does its place in a fight. `reformed { id, by, form, name, pocket? }`.
function reform(s, m, step, src, ev) {
  const pick = src.summon, id = pick.reform, inPocket = !Object.hasOwn(s.entities, id);
  const old = inPocket ? m.pocket[id] : s.entities[id];
  const made = summonMade(step, pick, pick.slot, pick.caster), record = overRecord(made.record, step.over), b = step.bond;
  const fx = src.fx ? effectsOf(s).find((x) => x.id === src.fx) ?? null : null;
  const n = Object.values(s.entities).filter((o) => o.id !== id && o.tpl === made.tplId).length + 1;
  const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx ? fx.id : null, turn: b.turn, orders: b.orders ?? 'free', at0: b.at0, ends: [...(b.ends ?? [])],
    ...(b.range !== undefined ? { range: b.range } : {}), ...(b.leash ? { leash: b.leash } : {}), ...(b.noAttack ? { noAttack: true } : {}), ...(b.mount ? { mount: b.mount } : {}), slot: pick.slot, commanded: null, auto: old.bond?.auto === true };
  const e = makeEntity(record, { id, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: { ...old.pos }, side: old.side, ...(made.type ? { type: made.type } : {}), bond });
  for (const k of KEPT_ON_REFORM) if (old[k] !== undefined) e[k] = structuredClone(old[k]);
  if (old.bond?.order !== undefined) e.bond.order = old.bond.order;
  if (inPocket) m.pocket[id] = e; else s.entities[id] = e;
  if (fx) fx.parts.push({ target: id, summon: true });
  ev.push({ type: 'reformed', id, by: m.id, form: made.tplId, name: e.name, ...(inPocket ? { pocket: true } : {}) });
}

// Take a creature out of the fight's order, as a vanish does (it is no longer on the map). True if it was its own turn.
function outOfOrder(s, e) {
  const enc = s.encounter;
  if (!enc) return false;
  const i = enc.order.findIndex((o) => o.id === e.id);
  let theirs = false;
  if (i >= 0) {
    theirs = i === enc.turn;
    enc.order.splice(i, 1);
    if (i <= enc.turn) enc.turn--;
    if (enc.moved) { delete enc.moved[e.id]; if (!Object.keys(enc.moved).length) delete enc.moved; }
    if (enc.held) delete enc.held[e.id];
  }
  for (const k of Object.keys(enc.flags ?? {})) if (k.split(':').includes(e.id)) delete enc.flags[k];
  return theirs;
}
// What the familiar loses as it goes into the pocket dimension: nobody holds it there, it is not lying down, and what it
// did with its turn is over.
const LEFT_IN_POCKET = ['grappled', 'prone', 'dodging', 'disengaged'];
// A familiar dismissed to its master's pocket dimension (companions.js, `dismiss`; Decision 6): it leaves the map. What it
// wore or carried stays in its space (SRD: "Whenever the familiar ... disappears into the pocket dimension, it leaves behind
// in its space anything it was wearing or carrying"; leaveGear). What it did that lasts ends, and what was on it, as for a
// creature that vanished (settleSeen); those following it stop; it leaves the fight's order. Its record, with its Hit Points,
// goes to `m.pocket[id]`, out of `state.entities`, so nothing on the map, in sight or in the fight sees it. `pocketed { id, by,
// name, seen?, party? }`: `seen` when the party knew of it just before, as `vanished` says it (view.js).
export function pocket(s, m, e, ev) {
  const seen = !unknown(s, e), party = e.side === 'party', name = e.name;
  settleSeen(s, e, ev, 'went to a pocket dimension');
  for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
  if (e.follow) unfollow(s, e, ev);
  const lit = e.light?.item && LIGHTS[e.light.item] ? LIGHTS[e.light.item].name : null;
  if (lit) e.gear = [...(Array.isArray(e.gear) ? e.gear : []), lit];
  else if (e.light) ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} carried a light (${e.light.bright} ft bright, ${e.light.dim} ft dim) that is no named item. It went to a pocket dimension without it: the DM sets the light down in its space if it should go on shining.` });
  leaveGear(s, e, ev, !seen, 'went to a pocket dimension');
  e.gear = [];
  if (Array.isArray(e.sheet?.items)) { e.sheet.items = []; delete e.sheet.attuning; }
  for (const c of LEFT_IN_POCKET) if (e.cond) delete e.cond[c];
  delete e.hiding; delete e.away;
  // A light it carried is one of the things it carried: it stays too (leaveGear puts a torch or lamp by name on the pile).
  delete e.light;
  const fought = inFight(s, e.id), theirs = outOfOrder(s, e);
  // A foe the party saw leave a fight counts toward its XP as one that vanished does (A3); back in the fight's order before
  // the end, it is counted there and not twice (rewards.js, concludeFight).
  if (fought && seen && e.side === 'foe' && !(s.encounter.gone ?? []).some((g) => g.id === e.id)) (s.encounter.gone ??= []).push({ id: e.id, name, shown: seenName(e), tpl: e.tpl ?? null });
  delete s.entities[e.id];
  if (!m.pocket || typeof m.pocket !== 'object' || Array.isArray(m.pocket)) m.pocket = {};
  m.pocket[e.id] = e;
  ev.push({ type: 'pocketed', id: e.id, by: m.id, name, ...(seen ? { seen: true } : {}), ...(party ? { party: true } : {}) });
  if (!s.encounter) return;
  checkEnd(s, ev);
  if (s.encounter && theirs) advanceTurn(s, ev);
}
// A familiar brought back from the pocket dimension (companions.js, `recall`) to `at`, checked there: the same record, id
// and Hit Points. A party one looks around (what it sees, the party sees); in the arena of a fight going on it joins it as
// any creature that arrives does (world.js, joinEncounter, with the C2 rules: a familiar rolls its own Initiative).
// `recalled { id, by, at }`; players who do not know of the master are told what a creature the DM adds tells them (view.js).
export function unpocket(s, m, id, at, ev) {
  const e = m.pocket[id];
  delete m.pocket[id];
  if (!Object.keys(m.pocket).length) delete m.pocket;
  e.pos = { q: at.q, r: at.r, z: at.z ?? 0 };
  s.entities[id] = e;
  ev.push({ type: 'recalled', id, by: m.id, at: { ...e.pos } });
  if (e.side === 'party') lookAround(s, ev, [e]);
  if (s.encounter?.arena[col(e.pos)]) joinEncounter(s, e, ev);
  // Back in the fight it went from, it is one of the fight's creatures again, not one that left it (A3; review of #343, L6).
  const enc = s.encounter;
  if (enc?.gone && inFight(s, id)) { enc.gone = enc.gone.filter((g) => g.id !== id); if (!enc.gone.length) delete enc.gone; }
}
// A familiar in the pocket dimension dismissed forever: its record goes. Nothing of it is on the map, so nothing else ends.
export function unpocketForever(s, m, id, ev) {
  const e = m.pocket[id], party = e.side === 'party';
  delete m.pocket[id];
  if (!Object.keys(m.pocket).length) delete m.pocket;
  // Players know of it only where they know of its master's pocket: the party's own (view.js).
  ev.push({ type: 'vanished', id, name: e.name, why: 'dismissed', ...(party ? { seen: true, party: true } : {}), pocket: true });
}

// ---------- corpses (Decision 7; stage C5b, #340) ----------

// Its 24 hours of control, a lasting effect of its own for each creature (so ending one, by the DM's `remove` or a
// vanish, frees no other), held by a `bond` part (durations.js, holds): when it ends, settleBonds frees it (lapse).
function control24(s, m, src, id) {
  const fx = startEffect(s, { name: src.name, spell: src.spell, source: m.id, conc: false, duration: CORPSE.control });
  fx.parts.push({ target: id, bond: true });
  return fx;
}
// The corpses `src.summon.ids` names rise, or the master's own creatures of this spell are kept under control for
// another 24 hours (checked when the spell was cast, engine/casting.js, corpsesFor). A corpse leaves as the DM's
// `remove` takes a creature (`removed`, with `seen` and `party` for view.js; what was still on it ends as for a seen
// vanish; its companions are freed; what it carried stays in its space, as a vanish leaves it), and the step's
// creature is made in its space (the nearest unoccupied one if a creature stands there now), named as a summon is:
// "Ven's Zombie" for the party, "Zombie 2" for a foe, so its name says nothing of the corpse or of a master.
// Players who do not know of the master are sent `spawned` as for any creature the DM adds (view.js).
function raise(s, m, step, src, ev) {
  const pick = src.summon, b = step.bond, made = summonMade(step, {}, pick.slot, pick.caster);
  if (!pick.raise) {
    for (const id of pick.ids) {
      const t = s.entities[id], old = effectsOf(s).find((x) => x.id === t.bond.fx);
      const fx = control24(s, m, src, id);
      t.bond.fx = fx.id;
      if (old) endEffect(s, ev, old, `${m.name} renewed it`);
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: m.id, conc: false, lasts: fx.lasts, targets: [id] });
      ev.push({ type: 'reasserted', id, by: m.id, fx: fx.id });
    }
    return;
  }
  for (const id of pick.ids) {
    const t = s.entities[id], at0 = { ...t.pos }, seen = !unknown(s, t);
    // As the DM's `remove` does, and what was still on it ends as for a creature that vanished where the party saw it.
    settleSeen(s, t, ev, 'is gone');
    for (const x of Object.values(s.entities)) if (x.bond?.to === t.id) { delete x.bond; ev.push({ type: 'unbonded', id: x.id, from: t.id }); }
    // A familiar in the dead master's pocket dimension (stage C5c) has nowhere to come back to: the master is no more. It
    // goes, as dismissed forever, and the DM is told (the SRD says nothing of it; the DM may `spawn` it again).
    for (const x of pocketOf(t)) {
      ev.push({ type: 'vanished', id: x.id, name: x.name, why: 'master', ...(t.side === 'party' ? { seen: true, party: true } : {}), pocket: true });
      ev.push({ type: 'manual', actor: null, name: x.name, partial: true, text: `${x.name} was in ${t.name}'s pocket dimension when ${t.name}'s corpse rose, so it is gone with its master's record. The SRD says nothing of this; the DM may spawn it again.` });
    }
    leaveGear(s, t, ev, !seen, 'rose as undead');
    // On a fight's card that is not yet published it is named as one the party saw go (A3), if it did.
    const due = !s.encounter && s.conclusion && !s.conclusion.published ? s.conclusion.foes.find((f) => f.id === t.id && !f.gone) : null;
    if (due && seen) Object.assign(due, { gone: true, shown: seenName(t) });
    ev.push({ type: 'removed', id: t.id, name: t.name, ...(seen ? { seen: true } : {}), ...(t.side === 'party' ? { party: true } : {}) });
    for (const x of Object.values(s.entities)) if (x.follow === t.id) unfollow(s, x, ev);
    delete s.entities[t.id];
    const at = nearestFree(s, { size: made.record.size }, at0);
    if (!at) { ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `${t.name}'s corpse rose, but the engine found no unoccupied space near it for the ${made.name}, so nothing appeared. The DM places it (the player has not been told why).` }); continue; }
    if (at.q !== at0.q || at.r !== at0.r) ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `A creature stands where ${t.name}'s corpse lay, so the ${made.name} rose in the nearest unoccupied space.` });
    const nid = `m${++s.seq}`;
    const fx = control24(s, m, src, nid);
    const n = Object.values(s.entities).filter((o) => o.tpl === made.tplId).length + 1;
    const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx.id, turn: b.turn, orders: b.orders, range: b.range, at0: b.at0, ends: [...(b.ends ?? [])],
      lapse: 'foe', slot: pick.slot, commanded: null, auto: false };
    const e = makeEntity(made.record, { id: nid, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: at, side: m.side, bond });
    s.entities[nid] = e;
    ev.push({ type: 'summoned', id: nid, by: m.id, kind: b.kind, fx: fx.id, corpse: t.id });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: m.id, conc: false, lasts: fx.lasts, targets: [nid] });
    if (e.side === 'party') lookAround(s, ev, [e]);
    if (s.encounter?.arena[col(at)]) joinEncounter(s, e, ev);
  }
}
// A corpse spell cast with no `summon` field (#332, as summonHandOver): nothing changes. The DM is told what this
// casting could have done, with the creature's numbers, and how to do it by hand; players are told only that the DM
// applies it, with no number and nothing that says a corpse or a creature exists.
function corpseHandOver(m, step, src, ev) {
  const { slot, caster, count, reassert } = src.summon, def = SPELLS[src.spell]?.def, b = step.bond ?? {};
  const made = summonMade(step, {}, slot, caster), r = made.record;
  const moves = Object.entries(r.speeds ?? {}).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v} ft.`);
  const stat = `${made.name} (AC ${r.ac}, ${r.hp} Hit Points, Speed ${[`${r.speed} ft.`, ...moves].join(', ')})`;
  const corpses = count === 1 ? 'the corpse of a Medium or Small Humanoid' : `up to ${count} corpses of Medium or Small Humanoids`;
  ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name}: the DM applies it.` });
  ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true,
    text: `${src.name} was cast at level ${slot} with no corpse or creature named for the engine, so it changed nothing. It could have raised ${corpses} within ${src.range} ft. of ${m.name}, each as a ${stat}, or kept up to ${reassert} of the creatures ${m.name} made with ${src.name} under control for another 24 hours.`
      + ` By hand: remove each corpse, spawn the monster ${step.summon} in its space, and bond it to ${m.name} as undead with orders command. A creature bonded so has no command range (the spell's is ${b.range} ft.) and its 24 hours are not timed: when they run out, free it (bond with to: null) and play it as a foe.${def && def.tier !== 'auto' ? ` ${def.text}` : ''}` });
}

// ---------- actions ----------

// Run the effect stack to the end, then whatever zones went off while it ran (zones.js).
export function resolve(s, ev) { run(s, ev, KIT); flushZones(s, ev, KIT); }

// The engine's machinery, lent to the effect runner (effects.js) so it need not know our internals.
// Evasion (a built character's `evasion`): only while it is not Incapacitated.
const evades = (t) => !t.object && !incapacitated(t) && (t.feats ?? []).some((f) => f.evasion);

// Why a spell's area was handed to the DM, where it is one the engine will not place: a cube of more than 1,000 feet (effects.js, aimable).
function whyNobody(src) {
  const area = typeof src.spell === 'string' && Object.hasOwn(SPELLS, src.spell) ? SPELLS[src.spell].def.target?.area : null;
  return area?.shape === 'cube' && area.size > CUBE_AIM_MAX ? 'Its area is a cube of more than 1,000 feet, which the engine does not place. The DM places the area, picks the creatures it catches and applies the effect. ' : '';
}
export const KIT = { creatureType, whyNobody, evades, rollToHit, savingThrow, rerollSave, damage, dealt, heal, tempHp, condition, modifier, judge, objectActor, objectStep, fall, push, reveal, renew, teleport, cure, kill, breakConcentration, summon };

