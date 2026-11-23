// Heights a flyer can end a move at, as data (docs/specs/fly-swim-control.md, stage C1). Pure: no DOM and no renderer, so Node tests it.
// Everything here is read from the engine's own search (`moveOptions`): a height is offered only if the engine has a place to stop at
// it now. The column and the plane (C2) are drawn from what `heightsOf` returns; the feet left are the engine's own formula, copied
// (`waysLeft`), and a test pins that every stop the engine reports is within it.
import { aloft, current, EXPLORE_BUDGET, FLY_CEILING, FT, inFight, moveOptions, steering, up } from './shared/engine.js';
import { incapacitatedBy, speedOf } from './shared/modifiers.js';
import { ground, surfaces, under } from './shared/space.js';
import { key as cellKey } from './shared/grid.js';

// The creature whose feet a move of `e` spends: its mount, if it rides one (the engine moves the mount).
const moverOf = (S, e) => { const m = e?.riding ? S.entities[e.riding.on] : null; return m && m.rider === e.id && !m.riding ? m : e; };
// The turn's budget a creature moves from in a fight, or null when it may not move now (the engine's `turnBudget`).
function budgetOf(S, e) {
  const enc = S.encounter;
  if (!enc?.budget) return null;
  if (current(S) === e.id) return enc.budget;
  const r = steering(S, e);
  return r && current(S) === r.id && enc.budget.mount && typeof enc.budget.mount === 'object' ? enc.budget.mount : null;
}

// The feet each way of moving has left now: { walk, climb, fly } as the engine counts them (they can be below zero: a creature that
// flew farther than its walking Speed has less than none of walking left), `fighting`, `flying` (it can stay up), and `turn` (false in
// a fight when it is not its turn: nothing can be spent). Out of a fight a tap may go as far as the engine's free-roaming limit.
export function waysLeft(S, e) {
  const who = moverOf(S, e), walk = who && up(who) ? speedOf(S, who) : 0, flying = !!who && aloft(S, who), flySpeed = flying ? speedOf(S, who, 'fly') : 0, climbSpeed = who ? speedOf(S, who, 'climb') : 0;
  const fighting = !!who && inFight(S, who.id), bud = fighting ? budgetOf(S, who) : null;
  if (!who || !up(who) || (fighting && !bud)) return { walk: 0, climb: 0, fly: 0, fighting, flying, turn: false };
  const left = (speed) => (fighting ? bud.move + (speed - walk) * (1 + (bud.dashes | 0)) : EXPLORE_BUDGET);
  return { walk: left(walk), climb: left(climbSpeed > 0 ? climbSpeed : walk), fly: flying ? (fighting ? left(flySpeed) : Math.max(60, flySpeed)) : 0, fighting, flying, turn: true };
}
// Feet for words: never below nothing.
export const feet = (n) => Math.max(0, Math.round(n));

// Whether `e` has a way to fly at all (a Fly Speed, its own or lent), and if it cannot use it now, why, in the menu's words.
// { has, can, why }. `name` is how the screen names the creature.
export function flyState(S, e, name = e?.name ?? 'It') {
  const who = moverOf(S, e);
  if (!who || who.dead) return { has: false, can: false, why: '' };
  const has = speedOf(S, who, 'fly') > 0;
  if (!has) return { has: false, can: false, why: '' };
  if (!up(who)) return { has, can: false, why: `Can't fly: ${name} is down.` };
  if (!aloft(S, who)) {
    const by = incapacitatedBy(who);
    return { has, can: false, why: who.cond?.prone ? `Can't fly: ${name} is Prone. Stand up first.` : by ? `Can't fly: ${name} is ${by}.` : `Can't fly: ${name} can't stay up.` };
  }
  if (inFight(S, who.id) && !budgetOf(S, who)) return { has, can: false, why: 'Waiting for your turn.' };
  return { has, can: true, why: '' };
}

// The heights `e` can end a move at now, lowest first, each with the places at it:
// { can, z0 (the floor under it, in feet), here (its own height above that floor), left (waysLeft), capped (the top is as high as the
//   engine searches), heights: [{ z, ft (above z0), ground (the bottom block: the walking reach and every place to land), here (the
//   creature is at it), stand (a floor is at this height somewhere: a roof, a ledge), up (the feet to that height in its own
//   column: straight up or down, or the way round a floor that is between; null when it cannot get there), cells: [{ key, h, cost, floor }] cheapest first }], gaps: [{ z, ft }] heights with nothing
//   between two that have something }.
// `reach` is the engine's search when the caller has it already (the app looks through `previewState`); it is never changed.
export function heightsOf(S, e, { reach = null } = {}) {
  const who = moverOf(S, e), out = { can: false, z0: 0, here: 0, left: waysLeft(S, e), capped: false, heights: [], gaps: [] };
  if (!who || !up(who) || !aloft(S, who)) return out;
  const base = under(S.map, who.pos), z0 = base ? base.z : who.pos.z ?? 0, zNow = who.pos.z ?? 0;
  out.z0 = z0; out.here = zNow - z0;
  const rows = new Map(), rowAt = (z) => { let r = rows.get(z); if (!r) rows.set(z, (r = { z, ft: z - z0, ground: z === z0, here: z === zNow, stand: z === z0, up: null, cells: [] })); return r; };
  const all = reach ?? moveOptions(S, who), bottom = rowAt(z0);
  rowAt(zNow);                                                  // where it is now is always a block, with or without a place beside it
  const onLattice = (z) => Math.abs(((z - zNow) / FT) - Math.round((z - zNow) / FT)) < 1e-9;
  for (const [key, v] of all) {
    const z = v.h.z ?? 0, own = v.h.q === who.pos.q && v.h.r === who.pos.r;
    if (own && z !== zNow && (z === z0 || (z > z0 && onLattice(z)))) rowAt(z).up = v.cost;
    if (!v.canStop) continue;
    const floor = !!ground(S.map, { q: v.h.q, r: v.h.r, z }), cell = { key, h: v.h, cost: v.cost, floor };
    // The bottom block is the walking reach: every floor it could stop on, at whatever height, and the air level with its own floor.
    if (floor || z === z0) bottom.cells.push(cell);
    if (z > z0 && onLattice(z)) { const r = rowAt(z); r.cells.push(cell); if (floor) r.stand = true; }
  }
  for (const sf of surfaces(S.map, who.pos)) if (rows.has(sf.z)) rows.get(sf.z).stand = true;
  const list = [...rows.values()].filter((r) => r.cells.length || r.here).sort((a, b) => a.z - b.z);
  for (const r of list) r.cells.sort((a, b) => a.cost - b.cost || (a.key < b.key ? -1 : 1));
  out.heights = list; out.can = list.some((r) => r.cells.length);
  // A height with nothing at it between two that have something is a gap (drawn as a faint outline, so the column does not look broken).
  const have = new Set(list.map((r) => r.z)), top = list.at(-1).z, k0 = Math.floor((z0 - zNow) / FT) + 1;
  for (let z = zNow + k0 * FT; z < top; z += FT) if (!have.has(z)) out.gaps.push({ z, ft: z - z0 });
  const ceiling = Math.max(...S.map.levels.map((l) => l.z), zNow) + FLY_CEILING;
  out.capped = top + FT > ceiling;
  return out;
}

// ---------- the pick ----------
// The height chosen for the next move is kept only while nothing has changed under it: { id, z, stamp }. The stamp is where the
// creature is and whose turn it is, so a move, a fall, a landing or a turn change makes it stale; so does losing the flight.
export const pickStamp = (S, e) => `${cellKey(e.pos)}|${e.pos.z ?? 0}|${S.encounter ? `${S.encounter.id ?? 0}:${S.encounter.round}:${S.encounter.turn}` : 'free'}`;
export const makePick = (S, e, z) => ({ id: e.id, z, stamp: pickStamp(S, e) });
// The pick if it still stands for `e` among the heights `H`, else null.
export function livePick(pick, S, e, H) {
  if (!pick || !e || pick.id !== e.id || !H?.heights.length) return null;
  if (pick.stamp !== pickStamp(S, e)) return null;
  return H.heights.some((r) => r.z === pick.z) ? pick : null;
}
// The block a move would go to: the live pick's, else the one the creature is at (so keeping its height costs no choosing).
export function rowOf(H, pick) {
  if (!H?.heights.length) return null;
  return (pick && H.heights.find((r) => r.z === pick.z)) || H.heights.find((r) => r.here) || H.heights[0];
}
// One block higher or lower than `row` that has a place to go, or null at the end of the column. `dir` +1 or -1.
export function stepRow(H, row, dir) {
  const list = H?.heights.filter((r) => r.cells.length || r === row) ?? [], i = list.indexOf(row);
  return i < 0 ? null : list[i + dir] ?? null;
}
// The place at `row` in the column of `hex` (a tap lands on the floor under the place meant), or null.
export const cellAt = (row, hex) => (row && hex ? row.cells.find((c) => c.h.q === hex.q && c.h.r === hex.r && (!row.ground || hex.z === undefined || (c.h.z ?? 0) === (hex.z ?? 0))) ?? row.cells.find((c) => c.h.q === hex.q && c.h.r === hex.r) ?? null : null);
// Whether a place of the engine's search belongs to a block: the bottom block takes every floor and the air level with its own, any other only its own height.
export const inRow = (map, row, h) => !row || (row.ground ? !!ground(map, { q: h.q, r: h.r, z: h.z ?? 0 }) || (h.z ?? 0) === row.z : (h.z ?? 0) === row.z);

// ---------- the column and the plane, as highlights (C2) ----------
// What the renderer draws for the column: the blocks of `H` on the creature's own cell, with the picked one (`row`), the one it is at,
// and `hover` (a block the pointer is over, or null). `color` is the creature's own colour ('#rrggbb'), for the block it is at.
export function columnHl(e, H, row, { hover = null, color = null } = {}) {
  return { at: { q: e.pos.q, r: e.pos.r }, z0: H.z0, color,
    blocks: H.heights.map((r) => ({ z: r.z, ft: r.ft, ground: r.ground, here: r.here, stand: r.stand && !r.ground, picked: r === row, hover: r.z === hover, empty: !r.cells.length })),
    gaps: H.gaps.map((g) => ({ z: g.z, ft: g.ft })) };
}
// What lies under a place in the air: the floor's height, or null where there is none; `bad` names what matters if the flight ends there.
export function below(map, h) {
  const sf = under(map, { q: h.q, r: h.r, z: (h.z ?? 0) });
  if (!sf) return { z: null, drop: null, bad: 'nothing below' };
  return { z: sf.z, drop: (h.z ?? 0) - sf.z, bad: sf.tile.t === 'water' ? 'water below' : '' };
}
// The third of the reach a cost falls in: 0 the nearest, 1 the middle, 2 the farthest (C3 shades by it). `most` is the feet the way has.
export const band = (cost, most) => (!(most > 0) ? 0 : cost <= most / 3 + 1e-9 ? 0 : cost <= (2 * most) / 3 + 1e-9 ? 1 : 2);
// The feet a place's cost is counted against: flying for the air, the larger of the ways for a floor.
const mostOf = (H, c) => (c.floor ? Math.max(H.left.walk, H.left.climb, H.left.fly) : H.left.fly);
// What the renderer draws for the plane: the places of `row`, each with its third of the reach; `faint` for a preview; `point` the key
// of the place pointed at (a line runs down from it to the floor under it).
export function planeHl(map, H, row, { faint = false, point = null } = {}) {
  if (!row) return null;
  const cells = row.cells.map((c) => ({ key: c.key, h: c.h, floor: c.floor, cost: c.cost, band: band(c.cost, mostOf(H, c)) }));
  const p = point ? row.cells.find((c) => c.key === point) : null;
  return { z: row.z, ground: row.ground, faint, cells, point: p && !p.floor ? { h: p.h, ...below(map, p.h) } : p ? { h: p.h, z: p.h.z ?? 0, drop: 0, bad: '' } : null };
}

// ---------- words ----------
// What is left, in the menu's words. In a fight the ways are named, because the engine spends them together; out of one a tap goes as far as it goes.
export function leftWords(H) {
  const l = H.left;
  return l.fighting ? `${feet(l.fly)} ft of flying left, ${feet(l.walk)} of walking.` : `Up to ${feet(l.fly)} ft a move.`;
}
// The one line under the column: where it is, what is picked and what that costs.
export function stateLine(H, row) {
  if (!row) return '';
  const top = H.capped && row === H.heights.at(-1) ? ` ${row.ft} ft is as high as the table's search goes here.` : '';
  if (row.here) return `${row.ground ? 'On the ground' : `Flying at ${row.ft} ft`}. ${leftWords(H)}${row.ground ? ' Pick a height.' : ''}${top}`;
  const way = row.z > H.z0 + H.here ? 'up' : 'down';
  const cost = row.up === null ? `No way straight ${way}.` : `Straight ${way} costs ${row.up} ft.`;
  const after = row.up !== null && H.left.fighting ? ` ${feet(H.left.fly - row.up)} ft of flying left.` : '';
  return `${row.ground ? 'Ground' : `${row.ft} ft up`}. ${cost}${after}${top}`;
}
// A place's number: what it costs and what is left after it ("35 ft, 25 left"); out of a fight only the cost.
export function cellWords(H, c) {
  if (!c) return '';
  const most = c.floor ? Math.max(H.left.walk, H.left.climb, H.left.fly) : H.left.fly;
  return H.left.fighting ? `${c.cost} ft, ${feet(most - c.cost)} left` : `${c.cost} ft`;
}
