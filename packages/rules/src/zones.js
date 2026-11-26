// Zones: an area that stays for a lasting effect's duration and works on a creature that enters
// it, or starts or ends its turn there (Moonbeam, Spirit Guardians, Web).
//
// A zone is `fx.zone` on a lasting effect (durations.js), made when the spell is cast, or when a subclass feature's action that carries one is used:
//   { area, on: ['enter' | 'step' | 'turnStart' | 'turnEnd'], once: 'turn' | 'enter'?, follows: id?, near?,
//     hexes: [col keys]?, origin, spare: [ids], steps, src, last: { id: turnKey } }
// `follows` names the creature an Emanation moves with (Spirit Guardians); otherwise the zone
// keeps the hexes it was laid out on. `steps` are the spell's own effect steps, scaled and with
// the caster's choices made, run against one creature at a time with `src` (the caster's DC and
// the like, as they were when it was cast). The zone ends when its effect does, and whatever its
// steps put on a creature is a part of that effect, so it ends then too.
//
// A zone that goes off while another effect is half resolved (a creature pushed into it by a
// Thunderwave) waits in `s.zoneQueue` until that one is done, so the effect stack is never run
// from inside itself. Design: docs/specs/rules-expansion.md, build notes.
import { gridOf, col, boxOf, squareAround } from './grid.js';
import { begin, run } from './effects.js';
import { effectsOf, endEffect, thisTurn, turnKey } from './durations.js';
import { FT, footprint, gap, ground, rise, sizeOf } from './space.js';

export const zonesOf = (s) => effectsOf(s).filter((fx) => fx.zone);

// Make the zone of a lasting effect just started: by a spell (engine/casting.js builds the same record inline) or by a feature's action
// (engine/features.js, addition D of docs/specs/homebrew-subclasses.md). `def` is the `zone` of the spell or the action (`on`, `once`,
// `atCast`); `area` its area as laid out; `holder` the creature that cast or used it; `hexes` and `origin` where it was laid out (an
// Emanation keeps none: it follows `holder`); `steps` the steps as they are to run, scaled and with the choices made; `src` what they
// run with (the DC, the attack, the name). `caught` are the creatures the area caught as it appeared. Returns those it goes off on now:
// everyone caught that is not spared, if `atCast`, else nobody. A creature it goes off on now has had its turn's one go.
export function startZone(s, fx, { def, area, holder, hexes, origin, spare = [], steps, src }, caught) {
  fx.zone = { area: { ...area }, on: [...def.on], ...(def.once ? { once: def.once } : {}),
    ...(area.shape === 'emanation' ? { follows: holder.id } : { hexes: hexes.map(col), origin: { ...(origin ?? holder.pos) } }),
    spare, steps: structuredClone(steps), src, last: {} };
  const hit = def.atCast ? caught.filter((t) => !spare.includes(t.id)) : [];
  const now = turnKey(s);
  if (now !== null) for (const t of hit) fx.zone.last[t.id] = now;     // "only once per turn": appearing counts
  return hit;
}

// Is creature `t` inside this zone now? Spared creatures and the dead never are.
export function holds(s, fx, t) {
  const z = fx.zone;
  if (!t || t.dead || t.melded || z.spare.includes(t.id)) return false;      // merged with stone (Meld into Stone): in no zone
  const n = z.area.size / FT, G = gridOf(s.map);
  // On squares (docs/specs/square-grid.md, S7): an Emanation is laid out afresh round its creature's
  // whole space by the table rule `areaFill`, as engine/world.js lays it out when it is cast, and a
  // creature is in a zone by any of its squares; heights as on hexes, from the zone's origin.
  if (G.kind === 'square') {
    if (z.follows) {
      const c = s.entities[z.follows];
      if (!c || c.dead || c.id === t.id) return false;
      const keys = new Set(squareAround(boxOf(footprint(c, c.pos, G)), n, s.settings?.areaFill ?? 'round').map(col));
      return footprint(t, t.pos, G).some((f) => keys.has(col(f))) && rise(t.pos.z - c.pos.z) <= n;
    }
    if (z.area.shape === 'sphere') {
      const keys = new Set(z.hexes);
      return footprint(t, t.pos, G).some((f) => keys.has(col(f))) && rise(t.pos.z - z.origin.z) <= n;
    }
  }
  if (z.follows) {
    const c = s.entities[z.follows];
    if (!c || c.dead || c.id === t.id) return false;
    return footprint(t, t.pos, gridOf(s.map)).some((f) => gridOf(s.map).dist(f, c.pos) <= n) && gap(s, c.pos, t.pos) <= n;
  }
  const keys = new Set(z.hexes);
  if (!footprint(t, t.pos, gridOf(s.map)).some((f) => keys.has(col(f)))) return false;
  const o = z.origin, shape = z.area.shape, tall = z.area.height ?? z.area.size;
  if (shape === 'cylinder') return t.pos.z > o.z - FT / 2 && t.pos.z <= o.z + tall;
  if (shape === 'cube') return t.pos.z < o.z + z.area.size && t.pos.z + sizeOf(t).height > o.z;
  if (shape === 'sphere') return gap(s, o, t.pos) <= n;
  if (shape === 'line' && z.area.placed) return t.pos.z < o.z + (z.area.height ?? FT) && t.pos.z + sizeOf(t).height > o.z;      // a wall stands from the surface up `height` feet
  return true;
}

// Which zones hold each living creature now: { id: Set(fx ids) }. Taken before something moves,
// to compare with after.
export function snapshot(s) {
  const zones = zonesOf(s);
  if (!zones.length) return null;
  const out = {};
  for (const t of Object.values(s.entities)) if (!t.dead) out[t.id] = new Set(zones.filter((fx) => holds(s, fx, t)).map((fx) => fx.id));
  return out;
}

// After a move: every creature now in a zone it was not in before has entered it (whether it
// moved, or the zone moved onto it). Returns the ids of the creatures a zone went off on.
export function entered(s, ev, kit, before, pre = () => {}) {
  if (!before) return [];
  const hit = [];
  for (const fx of zonesOf(s)) {
    if (!fx.zone.on.includes('enter')) continue;
    for (const t of Object.values(s.entities)) {
      if (t.dead || before[t.id]?.has(fx.id) || !holds(s, fx, t)) continue;
      if (trigger(s, ev, kit, fx, t, 'enter', pre)) hit.push(t.id);
    }
  }
  return hit;
}

// A creature has just taken one 5-foot step on the ground, walking or forced: every `step` zone it now stands in goes off on it (Spike Growth: "2d4 Piercing damage for
// every 5 feet it travels", into or within the area). A creature that is off the ground (its height is on no surface of its column: it is flying) touches nothing; one that has a Fly Speed but stands on the ground is hurt like anyone. Returns whether any went off.
export function stepped(s, ev, kit, t, pre = () => {}) {
  let hit = false;
  if (!ground(s.map, t.pos)) return false;
  for (const fx of zonesOf(s)) if (fx.zone.on.includes('step') && holds(s, fx, t) && trigger(s, ev, kit, fx, t, 'step', pre)) hit = true;
  return hit;
}

// A creature's turn starts or ends: the zones it is in that work then go off.
export function turnInZones(s, ev, kit, e, when) {
  for (const fx of zonesOf(s)) if (fx.zone.on.includes(when) && holds(s, fx, e)) trigger(s, ev, kit, fx, e, when);
}

// One zone goes off on one creature, at most once a turn if it says so. Returns whether it did.
function trigger(s, ev, kit, fx, t, why, pre = () => {}) {
  const z = fx.zone, now = turnKey(s);
  // A zone limited to some creature types (`area.types`, Turn Undead's kind) leaves a creature of another type alone, as aimArea does for
  // those caught when it is cast (the same test, with the same creatureType, which the kit lends); it is not counted as having gone off.
  if (z.area?.types && !z.area.types.includes(kit.creatureType(t))) return false;
  if (z.once === 'turn' && now !== null && thisTurn(s, z.last[t.id])) return false;
  // `once: 'enter'` (Wall of Fire: "when it enters the wall for the first time on a turn or ends its turn there"): only entering is held to the one go; the end of a turn is its own.
  if (z.once === 'enter' && why === 'enter') {
    if (now !== null && thisTurn(s, z.last[`${t.id}/enter`])) return false;
    if (now !== null) z.last[`${t.id}/enter`] = now;
  } else if (now !== null && z.once !== 'enter') z.last[t.id] = now;
  if (s.stack?.length) { (s.zoneQueue ??= []).push({ fx: fx.id, id: t.id, why }); return true; }
  pre();
  fire(s, ev, kit, fx, t, why);
  return true;
}
function fire(s, ev, kit, fx, t, why) {
  ev.push({ type: 'zone', fx: fx.id, name: fx.name, id: t.id, why });
  const from = ev.length;
  begin(s, { steps: structuredClone(fx.zone.steps), actor: fx.source, targets: [t.id], src: { ...structuredClone(fx.zone.src), fx: fx.id } });
  run(s, ev, kit);
  // A zone with a `budget` (Guardian of Faith) is used up by the damage its steps deal: what its source dealt to this creature now is added, and at the budget the effect ends.
  if (fx.zone.budget && effectsOf(s).includes(fx)) {
    fx.zone.spent = (fx.zone.spent ?? 0) + ev.slice(from).filter((e) => e.type === 'damage' && e.by === fx.source).reduce((n, e) => n + (e.amount ?? 0), 0);
    if (fx.zone.spent >= fx.zone.budget) endEffect(s, ev, fx, `it dealt ${fx.zone.budget} damage`);
  }
}

// The zone is rolled to a new place (Flaming Sphere: "you can move the sphere up to 30 feet ... If you move the sphere into a creature's space, that creature makes the save against
// the sphere"): it keeps its steps and what each creature has had of it, and has new hexes and a new origin. `met` is the creature whose space it rolled into, if any: it goes off on
// that creature at once (outside the once-a-turn count: it is the moving that does it, not the creature's own turn).
export function shiftZone(s, ev, kit, fx, { hexes, origin }, met = null) {
  fx.zone.hexes = hexes.map(col);
  fx.zone.origin = { ...origin };
  if (met && !met.dead) fire(s, ev, kit, fx, met, 'rolled');
}

// Run what waited for the effect stack to empty.
export function flushZones(s, ev, kit) {
  while (s.zoneQueue?.length) {
    const { fx: id, id: who, why } = s.zoneQueue.shift();
    const fx = zonesOf(s).find((x) => x.id === id), t = s.entities[who];
    if (fx && t && !t.dead) fire(s, ev, kit, fx, t, why);
  }
  delete s.zoneQueue;
}
