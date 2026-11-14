// Zones: an area that stays for a lasting effect's duration and works on a creature that enters
// it, or starts or ends its turn there (Moonbeam, Spirit Guardians, Web).
//
// A zone is `fx.zone` on a lasting effect (durations.js), made when the spell is cast:
//   { area, on: ['enter' | 'turnStart' | 'turnEnd'], once: 'turn'?, follows: id?,
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
import { effectsOf, thisTurn, turnKey } from './durations.js';
import { FT, footprint, gap, rise, sizeOf } from './space.js';

export const zonesOf = (s) => effectsOf(s).filter((fx) => fx.zone);

// Is creature `t` inside this zone now? Spared creatures and the dead never are.
export function holds(s, fx, t) {
  const z = fx.zone;
  if (!t || t.dead || z.spare.includes(t.id)) return false;
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

// A creature's turn starts or ends: the zones it is in that work then go off.
export function turnInZones(s, ev, kit, e, when) {
  for (const fx of zonesOf(s)) if (fx.zone.on.includes(when) && holds(s, fx, e)) trigger(s, ev, kit, fx, e, when);
}

// One zone goes off on one creature, at most once a turn if it says so. Returns whether it did.
function trigger(s, ev, kit, fx, t, why, pre = () => {}) {
  const z = fx.zone, now = turnKey(s);
  if (z.once === 'turn' && now !== null && thisTurn(s, z.last[t.id])) return false;
  if (now !== null) z.last[t.id] = now;
  if (s.stack?.length) { (s.zoneQueue ??= []).push({ fx: fx.id, id: t.id, why }); return true; }
  pre();
  fire(s, ev, kit, fx, t, why);
  return true;
}
function fire(s, ev, kit, fx, t, why) {
  ev.push({ type: 'zone', fx: fx.id, name: fx.name, id: t.id, why });
  begin(s, { steps: structuredClone(fx.zone.steps), actor: fx.source, targets: [t.id], src: { ...structuredClone(fx.zone.src), fx: fx.id } });
  run(s, ev, kit);
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
