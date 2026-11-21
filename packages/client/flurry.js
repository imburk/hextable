// Attacks a feature grants (Flurry of Blows) and what a tap on a foe does with them (issue #614). Pure: the engine decides what
// is allowed (`budget.bonusAttacks = { with, left }`, `budget.attacks`); this file only chooses what the client sends and says.
import { fromPool } from './shared/engine.js';

// The feature that grants attacks, by its name in a `std` event.
const grantOf = (e, name) => (e?.feats ?? []).find((f) => f.name === name && f.action?.gain?.attacks);
// What the engine granted this creature this turn: { with, left } or null.
export const granted = (S, e) => {
  const g = S.encounter?.budget?.bonusAttacks;
  return g && g.left > 0 && e?.attacks?.some((a) => a.id === g.with) ? g : null;
};
const reaches = (x, d) => (x.type === 'melee' ? d <= (x.reach ?? 5) : !!x.range && d <= x.range[1] && d > 5);
const reachesLoose = (x, d) => x.type === 'ranged' && !!x.range && d <= x.range[1];

// The attack a tap on a foe `d` feet away makes: the armed one; the granted one while some are left; one the Attack action's pool still
// allows; then the first that reaches (a melee attack in reach, a ranged one beyond 5 ft, a ranged one at all). null: nothing reaches.
export function tapAttack(S, e, d, armedId = null) {
  const list = e.attacks ?? [], b = S.encounter?.budget, g = granted(S, e);
  if (armedId && list.some((a) => a.id === armedId)) return armedId;
  const tiers = [
    list.filter((a) => g && a.id === g.with),
    list.filter((a) => b?.attacks && !(g && a.id === g.with) && a.time !== 'bonus' && fromPool(b, a.id)),
    list,
  ];
  for (const ok of [reaches, reachesLoose]) for (const t of tiers) { const a = t.find((x) => ok(x, d)); if (a) return a.id; }
  return null;
}

// After an update, should the granted attack be armed? Yes when the feature was just used, or one of its strikes was just made.
export function rearm(S, e, events) {
  const g = e && granted(S, e);
  if (!g || S.encounter?.order?.[S.encounter.turn]?.id !== e.id) return null;
  const used = events.some((ev) => (ev.type === 'std' && ev.id === e.id && grantOf(e, ev.action)) || (ev.type === 'attack' && ev.actor === e.id && !ev.opportunity && ev.name === e.attacks.find((a) => a.id === g.with)?.name));
  if (!used) return null;
  const f = (e.feats ?? []).find((x) => x.action?.gain?.attacks?.with === g.with);
  return { kind: 'attack', id: g.with, flurry: true, name: f?.name ?? 'Bonus attacks' };
}

// "Flurry of Blows: 2 Unarmed Strikes. Tap a foe."
export function hintOf(S, e, mode) {
  const g = granted(S, e), a = e.attacks.find((x) => x.id === mode.id);
  return g ? `${mode.name}: ${g.left} ${a.name}${g.left === 1 ? '' : 's'}. Tap a foe.` : '';
}

// The log line and toast for the use of such a feature: "Flurry of Blows: 1 Focus Point spent (3 left)". '' for any other event.
export function spentWords(e, ev) {
  const f = ev.type === 'std' && e && grantOf(e, ev.action);
  if (!f) return '';
  const c = f.action.cost;
  if (!c?.resource) return `${f.name}.`;
  const pool = (e.feats ?? []).find((x) => x.id === c.resource), n = c.n ?? 1, name = /focus/i.test(pool?.name ?? '') ? 'Focus Point' : pool?.name ?? 'use';
  return `${f.name}: ${n} ${name}${n === 1 ? '' : 's'} spent (${e.uses?.[c.resource] ?? 0} left).`;
}
