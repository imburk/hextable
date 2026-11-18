// Grapple, Shove, Escape and Let go at the table (docs/specs/grapple-shove.md, "Client controls" and the G7 build notes; issue #486).
//
// The top of this file is pure: it reads a state (a full state or a player's view) and returns plain data, so a test can drive it with no
// page. Nothing here decides a rule. A row is greyed by the engine's own checks (`handsFull`, `blocked`) or, for a target, by `dry(action)`
// (app.js: the engine's answer to an action on a copy of the state this screen holds); what a tap sends is the action the engine documents
// (`attack` with `option`, `shove` and `grab`; `escape`; `letGo`) and a refusal is shown in the engine's words.
//
// What a player is sent (hidden-information.md, Decision 9 of the spec): a creature it can see shows `heldBy`, the ids of its grapplers, a
// grappler it does not know of as 'someone'; its own party's records carry the holds themselves, with the escape DC only when the grappler
// is the party's. So a row or a line here says what it was sent and no more.
import { blocked, checkBonus, current, inFight } from './shared/engine.js';
import { handsFull, isUnarmed } from './shared/weapons.js';
import { mod } from './shared/derive.js';
import { CHIP } from './features.js';
import { shownName } from './tracker.js';
import { grapplePairs } from './three-build.js';

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const SKILL = { athletics: ['Athletics', 'Strength'], acrobatics: ['Acrobatics', 'Dexterity'] };

// ---------- who holds whom ----------
// The grapplers of `t`, as this screen was sent them: [{ by, name, known, with?, range?, escape?, escapeDis? }]. A record with `holds` (the DM's
// screen, or a party member's own) has the holds; one the view sent as a seen creature has only `heldBy`. A Grappled condition with neither is
// one the DM put on: no grapplers, and the condition shows by itself.
export function holdsOn(S, t) {
  const holds = t?.cond?.grappled?.holds;
  const list = Array.isArray(holds) ? holds : Array.isArray(t?.heldBy) ? t.heldBy.map((by) => ({ by })) : [];
  return list.map((h) => {
    const g = S?.entities?.[h.by];
    return { ...h, known: !!g, name: g ? shownName(S, g) : 'someone' };
  });
}
// The creatures `e` holds, as this screen was sent them: [{ t, hold }]. `hold` is the hold when the record has it, else { by: e.id }.
export function holdingOf(S, e) {
  const out = [];
  for (const t of Object.values(S?.entities ?? {})) {
    if (t.id === e?.id || t.dead) continue;
    const hold = holdsOn(S, t).find((h) => h.by === e?.id);
    if (hold) out.push({ t, hold });
  }
  return out;
}
// Every hold on the table this screen was sent: [{ by, t }], both ends in the state (three-build.js draws them on the map).
export { grapplePairs };

// ---------- what the condition says ----------
// The pill's words: "Grappled by Ogre", "Grappled by Ogre (escape DC 13)". More than one grappler: "Grappled by Ogre and Kraken". A Grappled
// condition with no holds is just "Grappled".
export function heldText(S, t) {
  const hs = holdsOn(S, t);
  if (!hs.length) return 'Grappled';
  const names = hs.map((h) => h.name), who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const dcs = hs.filter((h) => Number.isInteger(h.escape));
  return `Grappled by ${who}${dcs.length ? ` (escape DC ${dcs.length === 1 ? dcs[0].escape : dcs.map((h) => h.escape).join(', ')})` : ''}`;
}
// The lines of the small card the pill opens, in place of "Until the DM removes it" when the engine keeps the hold.
export function howHeldEnds(S, t) {
  const hs = holdsOn(S, t);
  if (!hs.length) return [];
  const lines = [];
  for (const h of hs) {
    lines.push(`${h.name === 'someone' ? 'Someone you cannot see' : h.name} holds ${t.name}${Number.isInteger(h.escape) ? `: escape DC ${h.escape}` : ''}${Number.isInteger(h.range) ? `, within ${h.range} ft` : ''}.`);
  }
  lines.push('It ends when the one holding lets go, is Incapacitated, or ends up out of reach; or when the held creature uses its action on a Strength (Athletics) or Dexterity (Acrobatics) check that meets the escape DC.');
  return lines;
}

// ---------- Escape and Let go ----------
// The rows for a creature that is held (Escape, once for each skill and each hold) and one that holds (Let go of each). `escape` rows cost the action
// in a fight and nothing outside one; the engine refuses when it is not the creature's turn or the action is spent, and the row says so. `letGo` is free:
// no action, no turn needed, in a fight or out of one.
export function holdRows(S, e) {
  const out = { escape: [], letGo: [] };
  if (!e || e.dead) return out;
  const fight = !!S.encounter && inFight(S, e.id), mine = holdsOn(S, e);
  const real = mine.filter((h) => h.known), many = mine.length > 1;
  // A hold of the DM's own (a Grappled condition with no holds) has no escape DC in the game: the DM ends it, so there is no row.
  if (Array.isArray(e.cond?.grappled?.holds) && e.cond.grappled.holds.length) {
    for (const h of e.cond.grappled.holds) {
      const g = holdsOn(S, e).find((x) => x.by === h.by);
      if (many && !g.known) continue;                                  // the engine can't be told which of several holds is meant by one the party does not know of
      for (const skill of ['athletics', 'acrobatics']) {
        const [skillName, abil] = SKILL[skill], bonus = checkBonus(e, { skill });
        out.escape.push({ id: `escape:${h.by}:${skill}`, kind: 'send', label: `Escape${many ? ` from ${g.name}` : ''} (${skillName})`,
          sub: `${abil} check ${signed(bonus)}${Number.isInteger(h.escape) ? ` vs DC ${h.escape}` : ''} · frees ${e.name}${many ? ` from ${g.name}` : ''} on a success`,
          chip: fight ? CHIP.action : CHIP.free, time: fight ? 'action' : null, why: fight ? blocked(S, e, 'action') : blocked(S, e, null), grapple: 'escape',
          send: { type: 'escape', actor: e.id, skill, ...(many && g.known ? { from: h.by } : {}) } });
      }
    }
  }
  void real;
  for (const { t } of holdingOf(S, e)) {
    out.letGo.push({ id: `letgo:${t.id}`, kind: 'send', label: `Let go of ${shownName(S, t)}`, sub: 'No action needed, at any time', chip: CHIP.free, time: null, why: '', grapple: 'letGo',
      send: { type: 'letGo', actor: e.id, target: t.id } });
  }
  return out;
}

// ---------- the Unarmed Strike's options ----------
// The Damage option is the Unarmed Strike's own row. These are the rows that arm the same attack with another option (`attack` with `option`, `shove`,
// `grab`): Grapple, Shove (push it away, or knock it Prone, chosen now, as the engine takes it), and with the Grappler feat, Punch and Grab. `base` is the
// attack's own row (its time, chip and reason); `mode` the mode the panel is in. A refusal that does not depend on the target is the row's `why`; the target's
// size is the engine's to say when it is tapped (`targetRefusals`).
const DC = (e, a) => (Number.isInteger(a.dc) ? a.dc : 8 + mod(e.abil[a.abil ?? 'str']) + (e.prof ?? 0));
export const hasGrab = (e) => (e.feats ?? []).some((f) => f.id === 'feat-grappler');
export function strikeRows(S, e, a, base, mode = null) {
  if (!isUnarmed(a) || !e?.abil) return [];
  const dc = DC(e, a), save = `Strength or Dexterity save, DC ${dc}`;
  const armed = (opt, extra) => !!mode && mode.kind === 'attack' && mode.id === a.id && mode.extra?.option === opt && mode.extra?.shove === extra?.shove && !!mode.extra?.grab === !!extra?.grab;
  const hands = handsFull(S, e, a, true);
  const mk = (key, label, sub, extra, why) => ({ id: `strike:${a.id}:${key}`, kind: 'arm', label, sub, why: base.why || why || '', chip: base.chip, time: base.time, grapple: key,
    armed: armed(extra.option, extra), arm: { kind: 'attack', id: a.id }, mode: { kind: 'attack', id: a.id, label, extra } });
  const rows = [
    mk('grapple', 'Grapple', `${save} or Grappled: held, Speed 0. Needs a free hand`, { option: 'grapple' }, hands),
    mk('push', 'Shove away', `${save} or pushed 5 ft away`, { option: 'shove', shove: 'push' }, ''),
    mk('prone', 'Shove Prone', `${save} or knocked Prone`, { option: 'shove', shove: 'prone' }, ''),
  ];
  if (hasGrab(e)) {
    const used = !!S.encounter?.flags?.[`grab:${e.id}`];
    rows.push(mk('grab', 'Punch and Grab', `${base.sub ? `${base.sub.split(' · ').slice(0, 2).join(' · ')} · ` : ''}and Grapple on a hit, once a turn`, { grab: true },
      hands || (S.encounter && current(S) === e.id && used ? 'Punch and Grab is used once a turn, and it has been used this turn.' : '')));
    rows[rows.length - 1].armed = !!mode && mode.kind === 'attack' && mode.id === a.id && !!mode.extra?.grab;
  }
  return rows;
}

// Who a Grapple, Shove or grab could be sent at, and why not: `dry(action)` is the engine's own answer ('' = it would be accepted). Returns
// [{ id, why }] for the creatures `ids` (the targets in reach), so a refusal of size shows before the attack is sent. A target the engine
// accepts, or one a copy of the state can't judge (a player's view holds no dice), has no reason.
export function targetRefusals(S, e, attack, extra, ids, dry) {
  if (!extra || (extra.option === undefined && !extra.grab)) return [];
  return ids.map((id) => ({ id, why: dry({ type: 'attack', actor: e.id, target: id, attack, ...extra }) })).filter((r) => r.why);
}

// ---------- a grappler dragging what it holds: the move preview ----------
// What the engine charges for a walk is read from the holds on the creatures it holds (`moveOptions`, `dragExtra`). A player's view has a hold on a
// creature of its own party only; a foe it holds is a seen record with `heldBy` and a Grappled condition and nothing else. So that the preview
// charges what the engine will, a hold the view names is laid on the creature it holds as an Unarmed Strike's (5 ft, `hand`). Only what was sent is
// used: a held creature the player does not see (hiding, in the dark) is not known to this screen and is not in the preview (DEBT T73). Returns `S`
// itself when there is nothing to add.
export function previewState(S, e) {
  let out = null;
  for (const { t, hold } of holdingOf(S, e)) {
    if (Array.isArray(t.cond?.grappled?.holds)) continue;
    out ??= { ...S, entities: { ...S.entities } };
    out.entities[t.id] = { ...t, cond: { ...t.cond, grappled: { source: e.id, holds: [{ by: e.id, with: 'hand', escape: hold.escape ?? 0, range: hold.range ?? 5 }] } } };
  }
  return out ?? S;
}

// ---------- the log ----------
// The log's words for the events of a hold: [text, class] or null. `n` names a creature the way the log does.
export function holdWords(ev, n) {
  switch (ev.type) {
    case 'strikeOption': return [ev.option === 'shove' ? `${n(ev.actor)} tries to shove ${n(ev.target)} ${ev.shove === 'prone' ? 'to the ground' : 'back 5 feet'}.` : `${n(ev.actor)} tries to grab ${n(ev.target)}.`];
    case 'hold': return [`${ev.by === 'someone' ? 'Someone' : n(ev.by)} holds ${n(ev.id)} too.`];
    case 'holdEnd': return [`${n(ev.id)} is no longer held by ${n(ev.by)}${HOLD_END[ev.why] ?? ''}.`, 'good'];
    default: return null;
  }
}
// How a hold ended, as the engine's `why` says it.
export const HOLD_END = { escaped: ': broke free', released: ': let go', incapacitated: ': Incapacitated', distance: ': too far apart', gone: ': gone' };
// The words for a condition that ended with a hold (`condEnd` with `cond: 'grappled'` and `by`).
export const heldEndText = (ev, n) => `${n(ev.id)} is no longer Grappled${ev.by !== undefined ? ` by ${n(ev.by)}` : ''}${HOLD_END[ev.why] ?? ''}.`;
// A note the engine sends: the creature's own name needs no prefix when the text begins with it, and a full stop is not doubled.
export function noteText(ev, n) {
  const who = n(ev.id), t = String(ev.text ?? '');
  return `${t.startsWith(who) ? '' : `${who}: `}${t}${/[.!?]$/.test(t) ? '' : '.'}`;
}
