// Aiming the space of a teleport or of a chosen-space move (issue #912, DEBT T115 (1)): Misty Step, Dimension Door, Telekinesis (the target's new space, once #911 lands).
// The engine takes the space in the `cast` action's `hex`. Pure: plain data in, plain data out; it decides no rule. Which spaces are offered is the engine's own answer to
// a cast with that space on a copy of the state (`try`, the client's `dry` in app.js), each space tried once; the engine's words are shown for a space it refuses.
import { gridOf, key as cellKey } from './shared/grid.js';
import { FT } from './shared/engine.js';
import { hasColumn } from './shared/space.js';

// More spaces than this are not tried one by one (Dimension Door's 500 ft is thousands): the aim lights nothing and a tap on a space is judged when it is made.
export const MAX_TRIES = 300;

// What a spell asks for: { kind: 'teleport', feet, see } (the caster goes), { kind: 'chosen', feet } (the target is put there, up to `feet` from it), or null.
// `chosen` is a number of feet (or { feet }); it is undefined until #911 lands, and anything else is no ask.
export function destOf(sp) {
  const t = sp?.teleport?.feet, c = sp?.chosen, cf = typeof c === 'number' ? c : c?.feet;
  if (Number.isFinite(t) && t > 0) return { kind: 'teleport', feet: t, see: !!sp.teleport.see };
  if (Number.isFinite(cf) && cf > 0) return { kind: 'chosen', feet: cf };
  return null;
}
// Whether the space is asked now: a spell on the caster (or none) asks at once; one on a creature asks once its creature is chosen.
export const askNow = (sp, picked) => !!destOf(sp) && (sp.aim === 'self' || sp.aim === 'none' || (picked?.length ?? 0) > 0);
// The spot the distance is measured from: the caster for a teleport, the chosen creature for a chosen space.
export const originOf = (S, e, d, targetId) => (d?.kind === 'chosen' ? S.entities[targetId]?.pos : e?.pos) ?? null;

// The spaces within `feet` of `origin` that stand on the map, nearest first, or null when there are more than MAX_TRIES of them.
export function candidates(S, origin, feet) {
  if (!S?.map || !origin) return [];
  const G = gridOf(S.map), n = Math.ceil(feet / FT);
  if (n > 40) return null;
  const out = G.range(origin, n).filter((h) => hasColumn(S.map, h) && cellKey(h) !== cellKey(origin) && G.dist(h, origin) * FT <= feet);
  return out.length > MAX_TRIES ? null : out.sort((a, b) => G.dist(a, origin) - G.dist(b, origin));
}
// The spaces the engine would accept: [{ q, r }] lit; `tried` is false when there were too many to try (nothing is lit then); `why` is the first refusal's words when none is accepted.
// `ask(hex)` is the engine's refusal for a cast naming that space ('' if it would take it).
export function offered(S, origin, feet, ask) {
  const list = candidates(S, origin, feet);
  if (!list) return { lit: [], tried: false, why: '' };
  const lit = []; let why = '';
  for (const h of list) { const w = ask(h); if (!w) lit.push({ q: h.q, r: h.r }); else why ||= w; }
  return { lit, tried: true, why: lit.length ? '' : why };
}

// The words of the aim bar. `chosen` is the space already tapped (the die waits), `who` the creature a chosen space moves.
export function destWords(name, d, { chosen = false, who = '', tried = true, none = '' } = {}) {
  if (chosen) return `${name}: to the marked space. Tap another to change it, or tap the die`;
  if (tried && none) return `${name}: no space within reach. ${none}`;
  if (d.kind === 'chosen') return `${name}: tap where it puts ${who || 'the creature'}, up to ${d.feet} ft from it`;
  return `${name}: tap where you go, up to ${d.feet} ft${d.see ? ', a space you can see' : ''}`;
}
