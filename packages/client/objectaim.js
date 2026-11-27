// Aiming a spell at a map object (issue #811, DEBT W59 (1)): Knock. Pure: plain data in, plain data out; it decides no rule.
// The engine's `aimObject` is the one that refuses a cast. This only says what to offer: the objects in the player's OWN view (`S.map.objects` is what the table sent:
// nothing hidden is in it) that stand within the spell's range in a clear line and are of a kind the spell works on (an object whose definition has an `unlock` use).
import { gridOf, col as cellCol, key as cellKey } from './shared/grid.js';
import { FT, clear, objectName } from './shared/engine.js';
import { objectDef, objectHexes } from './shared/walls.js';
import { measure } from './shared/space.js';
import { rangeAt } from './shared/effects.js';

export const OBJECT_USE = 'unlock';
export const isObjectAim = (sp) => sp?.aim === 'object';
const fits = (o) => !!objectDef(o)?.use?.some((u) => u.id === OBJECT_USE);

// The objects `e` could aim `sp` at: [{ id, name, state, feet, near, hexes }], nearest first. `hexes` are the object's cells (keys) on the map, `near` the nearest of them.
export function objectsFor(S, e, sp) {
  if (!S?.map || !e?.pos || !isObjectAim(sp) || e.cond?.blinded) return [];
  const range = rangeAt(sp.def, e.level), G = gridOf(S.map), m = measure(S, G), out = [];
  for (const o of S.map.objects ?? []) {
    if (!fits(o)) continue;
    const level = S.map.levels.find((l) => l.id === o.level);
    const cells = level ? objectHexes(o, G).filter((h) => level.tiles[cellCol(h)]).sort((a, b) => m(a, e.pos) - m(b, e.pos)) : [];
    const near = cells[0];
    if (!near) continue;
    const feet = m(near, e.pos) * FT;
    if (!(feet <= range) || !clear(S, e.pos, { q: near.q, r: near.r, z: level.z + (level.tiles[cellCol(near)].h ?? 0) })) continue;
    out.push({ id: o.id, name: objectName(o), state: objectDef(o).states[o.state]?.name ?? o.state, feet, near: { q: near.q, r: near.r }, hexes: cells.map(cellKey) });
  }
  return out.sort((a, b) => a.feet - b.feet || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : 1));
}

// The offered object a tap on `hex` means: one that covers the hex; failing that the nearest whose cells are within one hex of the tap (a door is a thin thing, a thumb is not). null if none.
export function objectAt(S, offers, hex) {
  if (!hex || !offers.length) return null;
  const k = cellKey({ q: hex.q, r: hex.r }), on = offers.find((o) => o.hexes.includes(k));
  if (on) return on.id;
  const G = gridOf(S.map), close = offers.map((o) => [Math.min(...o.hexes.map((h) => { const [q, r] = h.split(',').map(Number); return G.dist({ q, r }, hex); })), o]).filter(([d]) => d <= 1).sort((a, b) => a[0] - b[0]);
  return close[0]?.[1].id ?? null;
}

// The choices for the sheet's list (confirm.js option shape): the way to pick when a tap on the map is awkward.
export const objectOptions = (offers, chosen) => offers.map((o) => ({ value: o.id, label: o.name, sub: `${o.state}, ${o.feet} ft`, on: o.id === chosen, why: '' }));

export const objectWords = (name, offers, chosen) => {
  if (!offers.length) return `${name}: nothing to aim at within reach`;
  const c = offers.find((o) => o.id === chosen);
  return c ? `${name}: the ${c.name.toLowerCase()} (${c.state}, ${c.feet} ft). Tap another to swap it, then tap the die` : `${name}: tap ${offers.length === 1 ? 'the lit object' : 'one of the lit objects'}, then the die`;
};
// What a spell row says when there is nothing to aim at (the Spells tab).
export const noObjectWhy = (S, e, sp) => (isObjectAim(sp) && !objectsFor(S, e, sp).length ? `Nothing within ${rangeAt(sp.def, e.level)} ft that it works on.` : '');
