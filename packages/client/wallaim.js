// Aiming a wall and rolling a sphere (issue #795, DEBT W46). Pure: plain data in, plain data out; it decides no rule.
// A wall is a spell whose area is a placed Line (Wall of Fire, Wall of Thorns, Blade Barrier). The first tap puts it down; a second, on another space, names the space
// it runs toward (`toward` in the `cast`); the same space again casts. The preview is the engine's own `areaHexes(S, e, sp, aim, toward)`, called by the screen.
// A sphere that can roll (Flaming Sphere, `zone.move`) is rolled with `moveZone`: one tap on its control in the Bonus tab, one tap on the map.
import { SPELLS } from './shared/content/index.js';
import { key as cellKey } from './shared/grid.js';
import { speedOf } from './shared/modifiers.js';
import { CHOICES } from './shared/content/schema.js';

export const isWall = (sp) => !!sp?.area?.placed;
const same = (a, b) => !!a && !!b && cellKey(a) === cellKey(b);

// What a tap does while a wall is being aimed. `st` is { aim, toward }; returns { aim, toward, cast }.
// Nothing placed: the tap places it. On the placed spot: casts across (the default), or, if a direction was named, drops that direction (skip). On a space already named: casts that way.
// Anywhere else: names the way it runs.
export function wallTap(st, hex) {
  if (!st.aim) return { aim: hex, toward: null, cast: false };
  if (same(hex, st.aim)) return { aim: st.aim, toward: null, cast: !st.toward };
  if (st.toward && same(hex, st.toward)) return { aim: st.aim, toward: st.toward, cast: true };
  return { aim: st.aim, toward: { q: hex.q, r: hex.r }, cast: false };
}
// The direction to preview and send: the one chosen, else the one a mouse hovers over; never the spot itself.
export const wallToward = (st) => { const t = st.toward ?? st.hoverTo ?? null; return t && !same(t, st.aim) ? { q: t.q, r: t.r } : null; };
// What the cast carries: `toward` only when one was named.
export const towardArg = (st) => { const t = st.toward && !same(st.toward, st.aim) ? st.toward : null; return t ? { toward: { q: t.q, r: t.r } } : {}; };
export const wallWords = (name, st, caught) => {
  const hit = `${name} catches ${caught.length ? caught.join(', ') : 'nobody'}`;
  return st.toward ? `${hit}. Tap that space again to cast, tap the wall's spot to go straight across, or another space to turn it`
    : `${hit}. Tap another space for the way it runs, or this spot again to cast it straight across`;
};

// A lasting zone of the creature's that can be rolled: [{ id, name, feet, pack }]. The view does not send a zone's shape, so it is read from the spell's own entry.
// `pack` (Conjure Animals, `zone.with: 'move'`): not rolled with a Bonus Action but moved when its caster moves (the Move tab).
export function rollers(S, e) {
  const out = [];
  for (const fx of S?.effects ?? []) {
    const z = fx.source === e?.id ? SPELLS[fx.spell]?.def?.zone : null;
    if (z?.move) out.push({ id: fx.id, name: fx.name, feet: z.move, ...(z.with === 'move' ? { pack: true } : {}) });
  }
  return out;
}
export const rollMode = (r) => ({ kind: 'roll', effect: r.id, name: r.name, ...(r.pack ? { pack: true } : {}) });
export const rollWords = (name, feet, pack = false) => (pack ? `${name}: tap the new space within ${feet} ft` : `${name}: tap the space it rolls to (up to ${feet} ft)`);
export const rollAct = (actor, mode, to) => ({ type: 'moveZone', actor, to: { q: to.q, r: to.r }, effect: mode.effect });
// Whether a pack's caster has moved this turn, so the Move tab offers the pack (the engine's own rule, engine/casting.js `movePack`): in a fight, on its own turn, with 5 ft or more of its movement spent;
// outside a fight the distance is the only limit. The engine still has the last word (and its refusal is shown as it is).
export function packReady(S, e) {
  const enc = S?.encounter;
  if (!enc?.budget || !(enc.order ?? []).some((o) => o.id === e?.id)) return true;
  if (enc.order[enc.turn]?.id !== e.id) return false;
  return speedOf(S, e) * (1 + (enc.budget.dashes | 0)) - enc.budget.move >= 5;
}

// Magic Circle (the cast's `choice` is a list of kinds, `reverse` a toggle). The sheet keeps both on the armed mode.
export const isWard = (sp) => sp?.def?.choice?.of === 'ward';
export const wardKinds = (sp) => (isWard(sp) ? sp.def.choice.from ?? CHOICES.ward : null);
export const wardToggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
// What the cast carries: the kinds in the table's order, and `reverse` only when it is on.
export const wardArg = (sp, mode) => { const all = wardKinds(sp) ?? [], on = (mode.wards ?? []).filter((v) => all.includes(v)); return { choice: all.filter((v) => on.includes(v)), ...(mode.reverse ? { reverse: true } : {}) }; };
export const wardWords = (sp, mode) => (wardArg(sp, mode).choice.length ? null : `${sp.name}: choose at least one kind of creature, then tap the die`);
export const wardOptions = (kinds, on) => kinds.map((v) => ({ value: v, label: v.replace(/^./, (c) => c.toUpperCase()), sub: '', on: on.includes(v), why: '' }));
export const reverseOptions = (on) => [{ value: 'reverse', label: 'Reverse it (trap them inside)', sub: '', on: !!on, why: '' }];
