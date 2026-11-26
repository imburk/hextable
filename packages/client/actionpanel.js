// (Stage M4 of docs/specs/one-token-menu.md moved this panel into the Character screen of the menu and took the dock away: the tabs became the action groups, `groupsFor` below.)
// The action panel (docs/specs/table-ui.md, Decision 6, task T3): the card at the foot of the screen. Its head (name, Sheet, End turn),
// Hit Point bar and status line (with a small card on how each condition or lasting effect ends), and tabs chosen by what the
// table is doing, `panelContext(S, e)`. Built here: Explore (outside a fight, ranked by `rankExplore`), Attacks, Spells, Bonus, Move,
// Features, Items (gear, a Use row for each use of an item, Give... and Drop, what lies on the ground in reach, the light), Reactions (on another's turn) and Down.
//
// The top of this file is pure: it reads a state (a full state or a player's view) and the engine's own helpers, and returns
// plain data, so a test can drive it with no page. `initActionPanel` below is the only part that touches the page. Nothing here
// decides a rule: what can be done, and why not, is `usesFor`, `blocked`, `hideProblem` and `reactionsOf`; a tap sends the same
// action the bar sends.
import { gridOf, col as cellCol } from './shared/grid.js';
import { acShown, unblocked, inFight, current, up, blocked, targetsFor, usesFor, itemUsesFor, hideProblem, passTargets, pickUpsFor, interactionOf, clockText, mod, aloft, FT, fromPool, attacksLeft, actionSpent } from './shared/engine.js';
import { actionProfile, rangeAt } from './shared/effects.js';
import { armed } from './shared/imbue.js';
import { heldItems, itemName, attuneMax, attuneProblem } from './shared/derive.js';
import { LIGHTS } from './shared/content/lights.js';
import { reactionsOf, canReact, WHEN } from './shared/reactions.js';
import { conditionName, conditionDef } from './shared/modifiers.js';
import { SPELLS, MONSTERS, CONTENT, rollLabel } from './shared/content/index.js';
import { lightAt } from './shared/sight.js';
import { under, apart } from './shared/space.js';
import { reactionsHtml, bindReactions, reactionRows } from './reactionsheet.js';
import { noObjectWhy } from './objectaim.js';
import { noWallWhy } from './wallpick.js';
import { gridPlan } from './accordion.js';
import { featureRows as baseFeatureRows, CHIP } from './features.js';
import { strikeChoices, slotAim, slotSub, skillBonus } from './classes.js';
import { slotChoices } from './upcast.js';
import { shownName } from './tracker.js';
import { levelUpChip } from './levelup.js';
import { classTitle } from './buildsheet.js';
import { initSpellCards, spellAttrs } from './spellcard.js';
import { formationWhy, leads, shapeLabel, currentShape } from './formation.js';
import { rollers, rollMode } from './wallaim.js';
import { leapState } from './leapui.js';
import { strikeRows, holdRows, heldText, howHeldEnds } from './grapple.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------- which tabs, when ----------
export const TAB_LABEL = { explore: 'Explore', attacks: 'Attacks', spells: 'Spells', bonus: 'Bonus', move: 'Move', features: 'Features', items: 'Items', reactions: 'Reactions', down: 'Down' };
// The tabs that have rows today.
export const BUILT = new Set(['explore', 'reactions', 'down', 'attacks', 'spells', 'bonus', 'move', 'features', 'items']);

// Whether the Reactions tab is available for `e` now, and if not why, in words. A question waiting for this creature makes it
// active whatever else is true: `S.prompt` is what a player is sent, `S.pending` what the DM is sent.
export function reactionState(S, e, { dm = false } = {}) {
  const q = dm ? S.pending?.ask : S.prompt;
  const pending = !!q && !q.waiting && q.reactor === e.id;
  // A `free` instruction (Persistent Rage, Indomitable...) is not a Reaction: it does not make the Reaction usable, but it is on this tab (`free` counts them).
  const real = reactionsOf(e).filter((r) => r.kind !== 'free'), free = reactionsOf(e).length - real.length;
  const why = !real.length ? `${e.name} has no reactions.` : e.reactionUsed ? 'Reaction used this round.' : !canReact(e) ? `${e.name} can't take a reaction now.` : '';
  return { ok: !why, why, pending, free };
}

// The panel is a function of the state and the selected creature. `mine`: the viewer controls `e` (the DM controls all).
// Whether a turn opens on Spells although the creature has attacks (issue 678). The rule: a character (not a monster, and not a creature in a form such as
// Wild Shape, which opens on Attacks) opens on Spells when it can cast something worth casting and has no weapon worth using; otherwise Attacks.
// "A weapon worth using" is a weapon attack that hits for 5.5 or more on average (WEAPON_WORTH: a Mace with a +2 modifier, a Rapier, a Greatsword). Unarmed Strike (with its
// Bonus Action twin, Grapple and Shove, which are rows of it), improvised weapons and the d4 and d6 weapons a wizard carries (a Dagger, a Quarterstaff, also two-handed) are not: a
// wizard's cantrip beats them and grows with level. So a cleric with a mace and a paladin with a greatsword open on Attacks, a wizard with a dagger on Spells.
// "Something worth casting" is a spell that can be cast on this creature's turn at all (`time: 'action'`) and either a cantrip whose roll is an attack or a
// saving throw, or a levelled spell with a slot left. The action economy is left out on purpose (a spent Action does not flip the tab), and `initActionPanel` keeps
// the tab a turn opened on, so it does not move under the player when the last slot goes. A tab the player picked wins over all of this.
export const WEAPON_WORTH = 5.5;
const damageAvg = (d) => {
  const m = /^\s*(?:(\d+)d(\d+))?\s*([+-]\s*\d+)?\s*$/.exec(String(d ?? ''));
  return m ? (m[1] ? (+m[1] * (+m[2] + 1)) / 2 : 0) + (m[3] ? +m[3].replace(/\s/g, '') : 0) : 0;
};
export function opensOnSpells(S, e) {
  if (e.form || e.actions || !e.spells?.length) return false;
  if ((e.attacks ?? []).some((a) => !/^unarmed-strike|-two-handed$/.test(a.id) && !/improvised/i.test(`${a.id} ${a.name}`) && damageAvg(a.damage) >= WEAPON_WORTH)) return false;
  return e.spells.some((id) => {
    const sp = SPELLS[id];
    if (!sp || sp.time !== 'action') return false;
    return sp.level > 0 ? slotChoices(e, sp).length > 0 : sp.roll === 'attack' || /^save:/.test(sp.roll ?? '');
  });
}

// Returns { situation, tabs: [{ id, label, built, ... }], default } with every tab the spec names; the shell draws the built ones.
export function panelContext(S, e, { mine = true, dm = false } = {}) {
  if (!e) return { situation: 'none', tabs: [], default: null };
  const tab = (id, extra = {}) => ({ id, label: TAB_LABEL[id], built: BUILT.has(id), ...extra });
  if (!mine) return { situation: 'watch', tabs: [], default: null };
  if (e.dead || !up(e)) return { situation: 'down', tabs: [tab('down')], default: 'down' };
  const fight = !!S.encounter && inFight(S, e.id);
  if (!fight) return { situation: 'explore', tabs: ['explore', 'spells', 'features', 'items'].map((id) => tab(id)), default: 'explore' };
  if (current(S) === e.id) {
    const armed = attackRows(S, e).length > 0;
    return { situation: 'turn', tabs: ['attacks', 'spells', 'bonus', 'move', 'features', 'items'].map((id) => tab(id)), default: armed && !opensOnSpells(S, e) ? 'attacks' : 'spells' };
  }
  const r = reactionState(S, e, { dm });
  return { situation: 'wait', tabs: ['reactions', 'spells', 'features', 'items'].map((id) => tab(id, id === 'reactions' ? { ok: r.ok, why: r.why, pending: r.pending, free: r.free } : { why: 'It isn\'t your turn.' })), default: 'reactions' };
}

// The tabs the shell draws: the built ones in the spec's order. `has` says which tabs have anything in them: Attacks, Spells, Features and Items are left out when
// empty (a wizard has no attack; a monster no features); Bonus and Move are always there on your turn, and a Bonus tab with nothing available says why.
export function visibleTabs(ctx, { spells = true, attacks = true, features = true, items = true } = {}) {
  const out = [];
  for (const t of ctx.tabs) {
    if (!t.built) continue;
    if ((t.id === 'attacks' && !attacks) || (t.id === 'spells' && !spells) || (t.id === 'features' && !features) || (t.id === 'items' && !items)) continue;
    out.push(t);
  }
  return out;
}

// Which tab is open. `pref`: 'auto' (the spec's default) or 'remember' (the last tab used in this situation). `last`: { [situation]: tab id }.
export function defaultTab(ctx, tabs, { pref = 'auto', last = {} } = {}) {
  const has = (id) => tabs.some((t) => t.id === id);
  if (pref === 'remember' && has(last[ctx.situation])) return last[ctx.situation];
  if (ctx.situation === 'wait') {
    const r = ctx.tabs.find((t) => t.id === 'reactions');
    if (r && (r.ok || r.pending) && has('reactions')) return 'reactions';
    if (has(last.wait)) return last.wait;
  }
  if (has(ctx.default)) return ctx.default;
  return has('spells') ? 'spells' : tabs[0]?.id ?? null;
}

// ---------- the Explore tab ----------
// The nearest other living party member: whom Follow picks if nobody is tapped.
export function nearestAlly(S, e) {
  const G = gridOf(S.map);
  return Object.values(S.entities).filter((x) => x.id !== e.id && x.side === 'party' && !x.dead)
    .sort((a, b) => G.dist(a.pos, e.pos) - G.dist(b.pos, e.pos))[0] ?? null;
}
// Why a spell cannot be cast now, in the engine's words ('' if it can).
export function spellWhy(S, e, sp) {
  return blocked(S, e, sp.time) || (sp.level > 0 && !slotChoices(e, sp).length && `${e.name} has no level ${sp.level} spell slots left.`) ||
    (sp.level > 0 && S.encounter?.flags.slot && 'Only one spell slot can be spent per turn.') || '';
}
// Features and spells that give Hit Points back, found by what the record says.
const HEAL_FEATS = ['second-wind', 'lay-on-hands'];
const hurt = (e) => e.maxHp > 0 && e.hp > 0 && e.hp <= e.maxHp / 2;
const dimHere = (S, e) => {
  if (S.settings?.sight !== 'light') return false;
  if (S.sight?.rule === 'light') return !!S.sight.light?.[under(S.map, e.pos)?.level]?.[cellCol(e.pos)];       // a player is sent which tiles are not Bright
  try { return lightAt(S, e.pos) !== 'bright'; } catch { return false; }
};
// Whether a party member is under half or has spent spell slots: the DM's rests are then worth offering first.
const wearyParty = (S) => Object.values(S.entities).some((x) => x.side === 'party' && x.kind === 'pc' && !x.dead && (hurt(x) || x.hp <= 0 || Object.keys(x.slotsMax ?? {}).some((l) => (x.slots?.[l] ?? 0) < x.slotsMax[l])));

// What to offer outside a fight, most likely first (Decision 6). Rows: { id, kind, label, sub, why, send?, ... }. `kind` says what a tap does:
// an action to send (`send`), `follow` (arm a tap on a party member), `jump` (go to a row of another tab), `ritual`, `shortRest`, `check`.
// The first four are drawn as large buttons, the rest under "More". Inputs: `dm`; `mode` (follow armed); `found`: a `noticed` or
// `triggered` event came in the last two updates.
export function rankExplore(S, e, { dm = false, mode = null, found = false } = {}) {
  const enc = S.encounter, row = (r) => ({ sub: '', why: '', ...r });
  // 1. Objects in reach: those that can be done first.
  const uses = usesFor(S, e).map((u) => row({ id: `use:${u.object}:${u.verb}`, kind: 'use', label: u.label,
    sub: `${u.name}${enc ? (u.time === 'free' ? ' · free once a turn' : ' · Action') : ''}`, why: u.why, send: { type: 'use', actor: e.id, object: u.object, verb: u.verb } }));
  const objects = [...uses.filter((u) => !u.why), ...uses.filter((u) => u.why)];
  // 1b. A hold: breaking free (nothing is spent outside a fight) and letting go come first, since a held creature can't walk.
  const holds = holdRows(S, e), hold = [...holds.escape, ...holds.letGo].map((r) => row(r));
  // 2. Following. "Lead the party" is for whoever controls `e` (a player for their own creature, the DM for anyone; this panel is only ever
  // drawn for a creature the viewer controls), and "Formation..." while someone follows `e` (formation.js).
  const follows = []; let formationRow = null;
  if (!inFight(S, e.id) && e.side === 'party') {
    const leader = e.follow && S.entities[e.follow];
    if (leader) follows.push(row({ id: 'stopFollow', kind: 'send', label: 'Stop following', sub: `Following ${leader.name}`, send: { type: 'follow', actor: e.id, leader: null } }));
    else {
      const armed = mode?.kind === 'follow', near = nearestAlly(S, e);
      follows.push(row({ id: 'follow', kind: 'follow', armed, label: armed ? 'Follow nearest' : 'Follow', sub: armed ? (near ? `${near.name} · or tap someone` : 'Tap a party member') : 'Walk behind someone',
        why: near ? '' : 'Nobody else in the party to follow.', send: near ? { type: 'follow', actor: e.id, leader: near.id } : null }));
    }
    if (!enc) {
      const why = formationWhy(S, e, { dm: true, mine: true });
      if (leads(S, e)) follows.push(formationRow = row({ id: 'formation', kind: 'formation', label: 'Formation…', sub: `Now: ${shapeLabel(currentShape(e))}`, why }));
      follows.push(row({ id: 'lead', kind: 'lead', label: 'Lead the party', sub: 'Everyone follows; then pick how', why, send: { type: 'partyFollow', leader: e.id } }));
    }
  }
  // 3. Hurt: the healing this creature can do now, as shortcuts to its rows in Spells and Features, and the DM's rests.
  const aid = [];
  if (hurt(e)) {
    for (const id of e.spells ?? []) {
      const sp = SPELLS[id];
      if (sp?.heals && !spellWhy(S, e, sp)) aid.push(row({ id: `heal:${id}`, kind: 'jump', label: sp.name, sub: `${sp.level ? 'Slot' : 'Cantrip'}${sp.time === 'bonus' ? ' · Bonus' : ''} · heals`, jump: `spell:${id}`, jumpTab: 'spells' }));
    }
    for (const f of e.feats ?? []) {
      if (!HEAL_FEATS.includes(f.id)) continue;
      const left = f.uses ? (e.uses?.[f.id] ?? 0) : null;
      if (blocked(S, e, f.action?.time === 'free' ? null : f.action?.time ?? 'action') || (left !== null && left < 1)) continue;
      aid.push(row({ id: `heal:${f.id}`, kind: 'jump', label: f.name, sub: `${left === null ? '' : `${left} left · `}heals`, jump: `feat:${f.id}`, jumpTab: 'features' }));
    }
    if (e.features?.secondWind && !(e.feats ?? []).some((f) => f.id === 'second-wind') && e.uses?.secondWind > 0 && !blocked(S, e, 'bonus'))
      aid.push(row({ id: 'heal:secondWind', kind: 'jump', label: 'Second Wind', sub: `${e.uses.secondWind} left · heals`, jump: 'feat:secondWind', jumpTab: 'features' }));
  }
  const rests = dm && !enc ? [
    row({ id: 'shortRest', kind: 'shortRest', label: 'Short rest…', sub: 'Choose who spends Hit Point Dice' }),
    row({ id: 'longRest', kind: 'send', label: 'Long rest', sub: 'The party', send: { type: 'rest' } })] : [];
  const weary = wearyParty(S);
  // 5. Search is always offered. Where nothing else finds things it is in the top four; where passive Perception does part of the work it drops below.
  const search = row({ id: 'search', kind: 'send', label: 'Search', sub: `${enc ? 'Action · ' : ''}Perception ${signed(skillBonus(S, e, 'perception'))} · secret doors, traps, things hiding · 15 ft`,
    why: blocked(S, e, 'action'), send: { type: 'search', actor: e.id } });
  // 6. Light, when the party sees by light and it is not Bright here and this creature carries none.
  const dark = !e.light && dimHere(S, e) ? [row({ id: 'light', kind: 'send', label: 'Light a torch', sub: 'It is not bright here', why: dm ? '' : 'Only the DM hands out light.', send: { type: 'setLight', actor: e.id, item: 'torch' } })] : [];
  // 7. Hide, with the engine's reason when it cannot be done.
  const hideTime = e.features?.nimbleEscape ? 'bonus' : 'action';
  const hide = e.hiding ? row({ id: 'hide', kind: 'none', armed: true, label: 'Hidden', sub: `Stealth ${e.hiding.dc} to find`, why: 'Already hidden: an attack, a spoken spell or a noise gives it away.' })
    : row({ id: 'hide', kind: 'send', label: 'Hide', sub: `${enc ? (hideTime === 'bonus' ? 'Bonus · ' : 'Action · ') : ''}Stealth ${signed(skillBonus(S, e, 'stealth'))} · DC 15`,
      why: (enc && inFight(S, e.id) ? blocked(S, e, hideTime) : '') || hideProblem(S, e), send: { type: 'hide', actor: e.id } });
  // 8. Rituals: cast like any spell today (ritual casting is an engine item, E15).
  const rituals = (e.spells ?? []).filter((id) => SPELLS[id]?.def.ritual).map((id) => {
    const sp = SPELLS[id], armed = mode?.kind === 'spell' && mode.id === id;
    return row({ id: `ritual:${id}`, kind: 'ritual', spell: id, armed, label: sp.name, sub: `Ritual · ${sp.level ? 'Slot' : 'Cantrip'}`, roll: sp.roll ?? null, why: spellWhy(S, e, sp) });
  });
  // 9. A check, from the sheet's skills.
  const check = row({ id: 'check', kind: 'check', label: 'Check…', sub: 'Skills, on the sheet' });

  const head = [...hold, ...objects], tail = [...dark, hide, ...rituals, check];
  // A hurt creature's healing comes before Formation...: the party follows its first hero from the start of a solo game, so Formation... is
  // there from the first turn and would push the healing under More (#671).
  const base = aid.length && formationRow ? [...follows.filter((r) => r !== formationRow), ...aid, formationRow, ...(weary ? rests : [])] : [...follows, ...aid, ...(weary ? rests : [])];
  let list;
  if (found) list = [...head, search, ...base, ...tail];                                  // something was just found or sprung: Search moves up
  else if ((S.settings?.passiveFind ?? 'off') === 'off') {
    const top = [...head, ...base]; top.splice(Math.min(top.length, 3), 0, search); list = [...top, ...tail];
  } else list = [...head, ...base, search, ...tail];
  if (found) { const i = list.indexOf(search); if (i > 3) { list.splice(i, 1); list.splice(3, 0, search); } }
  if (!weary) list.push(...rests);
  return list.map((r, i) => ({ ...r, grid: i < 4 }));
}

// ---------- what the martial classes added (#230, DEBT T19) ----------
// The Features rows of features.js, with three things the record says and that file does not: the Focus Point versions of Patient Defense and Step of the Wind (a feature
// with `action.acts` paid from another feature's pool: what it spends and what it does, greyed when the pool is empty), a feature that works through a standing instruction
// (Persistent Rage, Indomitable...: what it is set to now, and that it does nothing until set), and a use that another pool can pay for (Intimidating Presence).
const ACT_NAME = { dash: 'Dash', disengage: 'Disengage', dodge: 'Dodge', hide: 'Hide', search: 'Search' };
export function featureRows(S, e, { mode = null } = {}) {
  const rows = baseFeatureRows(S, e, { mode }), free = reactionRows(S, e).filter((r) => r.kind === 'free');
  return rows.map((r) => {
    const f = (e.feats ?? []).find((x) => `feat:${x.id}` === r.id);
    if (!f) return r;
    const a = f.action, fr = free.find((x) => x.id === f.id);
    // A feature that only heals its user (Second Wind of a built Fighter) is greyed at full Hit Points, as the hand-typed Second Wind was: the engine would spend the use for nothing.
    if (!r.why && r.kind === 'send' && a?.target?.self && a.effects?.length && a.effects.every((x) => x.heal !== undefined) && e.hp >= e.maxHp) return { ...r, why: `${e.name} is at full Hit Points.` };
    // A feature that costs a spell slot (`cost.slot`): the row says so, with the lowest level and what a higher slot adds (the chooser of classes.js lets the player pick the level).
    if (r.kind === 'chooser' && slotAim(f)) return { ...r, sub: slotSub(e, f) };
    if (fr && r.kind === 'none') {
      return { ...r, chip: 'Not a Reaction', sub: `Standing instruction: ${WHEN[fr.now] ?? fr.now}${fr.now === 'always' ? '' : '. Does nothing until set to Always'}. Set it on the Sheet or the Reactions tab` };
    }
    if (a?.acts && a.cost?.resource && !f.uses) {
      const pool = (e.feats ?? []).find((x) => x.id === a.cost.resource), n = a.cost.n ?? 1, left = e.uses?.[a.cost.resource] ?? 0;
      const sub = `Spend ${n} ${/focus/i.test(pool?.name ?? '') ? 'Focus Point' : pool?.name ?? 'point'}${n === 1 ? '' : 's'}: ${a.acts.map((x) => ACT_NAME[x] ?? x).join(' and ')}. The free version is a Bonus Action row of its own`;
      return { ...r, sub, why: r.why || (left < n ? `${e.name} has no uses of ${pool?.name ?? a.cost.resource} left.` : '') };
    }
    return r;
  });
}

// Brutal Strike and Cunning Strike (`attack.brutal`, `attack.cunning`): the row after an attack that can take them. It opens the card of classes.js where the choice is made and the
// attack armed with it; `why` is the attack's own reason, else the choices' reasons when none can be made now.
function strikeRow(S, e, a, base, mode) {
  const ch = strikeChoices(S, e, a);
  if (!ch) return null;
  const what = [ch.use, ch.brutal, ch.cunning].filter(Boolean).map((o) => o.name).join(' or ');
  const bits = [ch.use ? `${ch.use.name} changes the weapon` : '', ch.brutal ? `${ch.brutal.dice} more damage and an effect, no Advantage` : '', ch.cunning ? `${ch.cunning.dice} dice of Sneak Attack${ch.cunning.dice ? ' for effects' : ''}` : ''].filter(Boolean);
  const offered = [ch.use, ch.brutal, ch.cunning].filter(Boolean), stuck = offered.every((o) => o.why);
  return { id: `strike:${a.id}`, kind: 'strike', attack: a.id, label: `${a.name} with ${what}`, sub: bits.join(' · '), chip: base.chip, time: base.time, armed: armedBy(mode, 'attack', a.id) && !!mode.extra,
    why: base.why || (stuck ? offered[0].why : '') };
}

// ---------- the Attacks, Bonus, Move and Features tabs (T4a) ----------
// Each returns rows of one shape: { id, kind, label, sub, why, chip, time, armed, ... }. `kind` says what a tap does: `send` (an action to send, `send`), `arm`
// (set the mode `mode`; a tap on the armed row puts it down again), `spell` (cast `spell`, or arm it), `chooser` (open the card of `feature`), `fly` (`delta` feet
// to the height the next move ends at) or `none` (nothing to tap). `why` is the engine's reason a row cannot be used now ('' if it can); the shell writes it on the
// row. `time` is what it costs ('action', 'bonus', 'reaction', 'free' or null) and `chip` its words. The Bonus tab is a filter on the others by `time`.
const armedBy = (mode, kind, id) => !!mode && mode.kind === kind && mode.id === id;

// The attack record as it stands under a spell or feature that changes the weapon (imbue.js): a new record, or the same one.
export const imbuedAttack = (S, e, a) => armed(S, e, a);
// Attacks: a character's `attacks`, or a monster's `actions` (Multiattack, recharge, uses a day).
export function attackRows(S, e, { mode = null } = {}) {
  const b = S.encounter?.budget, mineTurn = !!b && current(S) === e.id, rows = [];
  if (e.actions) {
    for (const def of e.actions) {
      const p = actionProfile(def);
      if (e.bond?.noAttack && (def.multiattack || p.roll === 'melee' || p.roll === 'ranged')) continue;      // a familiar can't attack: the engine would refuse the row (companions.md, Decision 1)
      const armed = armedBy(mode, 'action', def.id), time = p.time === 'bonus' ? 'bonus' : 'action';
      const pooled = mineTurn && !!b.attacks && fromPool(b, def.id);
      const why = (pooled ? blocked(S, e, null) : blocked(S, e, time)) || actionSpent(e, def) || (def.multiattack && !S.encounter ? `${def.name} is for a fight. Use one of its attacks to start one.` : '');
      const reach = p.reach ? `reach ${p.reach} ft` : p.range ? `range ${p.range[0]}/${p.range[1]} ft` : '';
      const sub = [p.short, p.bonus !== undefined ? signed(p.bonus) : '', p.dc ? `DC ${p.dc}` : '', reach, p.recharge ? `recharge ${p.recharge[0]}–6${e.spent?.[def.id] ? ' (not yet)' : ''}` : '', p.uses ? `${e.charges?.[def.id] ?? p.uses.n}/day left` : ''].filter(Boolean).join(' · ');
      const sends = p.aim === 'multi' || p.aim === 'self' || p.aim === 'none';
      rows.push({ id: `act:${def.id}`, label: def.name, sub, why, chip: pooled ? 'Multiattack' : CHIP[time], time: pooled ? null : time, armed,
        ...(sends ? { kind: 'send', send: { type: 'act', actor: e.id, action: def.id } }
          : { kind: 'arm', arm: { kind: 'action', id: def.id }, mode: { kind: 'action', id: def.id, area: p.aim === 'area', aim: null } }) });
    }
    return rows;
  }
  for (const a of e.bond?.noAttack ? [] : e.attacks ?? []) {
    const armed = armedBy(mode, 'attack', a.id), flurry = !!b?.bonusAttacks && b.bonusAttacks.with === a.id && b.bonusAttacks.left > 0;
    const bonusTime = !flurry && a.time === 'bonus', pooled = mineTurn && !flurry && !bonusTime && !!b.attacks && fromPool(b, a.id);
    const time = flurry || pooled ? null : bonusTime ? 'bonus' : 'action';
    const reach = a.type === 'melee' ? `reach ${a.reach ?? 5} ft` : a.range ? `range ${a.range[0]}/${a.range[1]} ft` : '';
    const w = imbuedAttack(S, e, a);       // a weapon a spell or feature has changed shows its changed numbers (imbue.js)
    const row = { id: `atk:${a.id}`, kind: 'arm', label: a.name, sub: [`${signed(w.bonus)} to hit`, `${w.damage} ${[w.dtype, ...(w.alt ?? [])].join(' or ')}`, reach, ...(w.imbued ?? [])].filter(Boolean).join(' · '), why: blocked(S, e, time),
      chip: flurry ? `Flurry: ${b.bonusAttacks.left} left` : pooled ? 'Extra Attack' : CHIP[time], time: flurry || pooled ? null : time, armed: armed && !mode.extra, arm: { kind: 'attack', id: a.id }, mode: { kind: 'attack', id: a.id } };
    rows.push(row);
    const strike = strikeRow(S, e, a, row, mode);
    if (strike) rows.push(strike);
    rows.push(...strikeRows(S, e, a, row, mode));                  // Grapple, Shove and Punch and Grab: the Unarmed Strike's other options (grapple.js)
  }
  return rows;
}

// The standard actions and the objects in reach, for the Move tab. `fly`: { aloft, alt, up, down } for a creature that can fly (the height its next move goes to, and the next one up and down).
export function moveRows(S, e, { fly = null, mode = null } = {}) {
  const enc = S.encounter, nimble = !!e.features?.nimbleEscape, rows = [], row = (r) => ({ sub: '', why: '', armed: false, std: true, ...r });
  // "Fly…" (docs/specs/fly-swim-control.md, "Getting in"): the main road to the column of heights, for a creature with a Fly Speed; greyed with the reason when it cannot fly now.
  if (fly?.has) rows.push(row({ id: 'fly', kind: 'flyOpen', label: 'Fly\u2026', sub: fly.words ?? 'Pick a height, then a place', armed: mode?.kind === 'fly', time: null, std: false, why: fly.why ?? '' }));
  // The same move without the picture: a list of the places in reach, nearest first, in words (Accessibility).
  if (fly?.has && !fly.why) rows.push(row({ id: 'fly-to', kind: 'flyOpen', list: true, label: 'Fly to\u2026', sub: 'A list of the places in reach, nearest first', time: null, std: false }));
  rows.push(row({ id: 'dash', kind: 'send', label: 'Dash', sub: 'Double your move', chip: CHIP.action, time: 'action', why: blocked(S, e, 'action'), send: { type: 'dash', actor: e.id } }));
  const dt = nimble ? 'bonus' : 'action';
  rows.push(row({ id: 'disengage', kind: 'send', label: 'Disengage', sub: 'No Opportunity Attacks', chip: CHIP[dt], time: dt, why: blocked(S, e, dt), send: { type: 'disengage', actor: e.id } }));
  rows.push(row({ id: 'dodge', kind: 'send', label: 'Dodge', sub: 'Attackers roll with Disadvantage', chip: CHIP.action, time: 'action', why: blocked(S, e, 'action'), send: { type: 'dodge', actor: e.id } }));
  // Leap (#818): arm it, then a tap on a hex sends `leap`; "Use Jump" is the same with `spell: true`, only for a creature with a Jump effect it has not used this turn.
  { const L = leapState(S, e), lm = mode?.kind === 'leap';
    rows.push(row({ id: 'leap', kind: 'arm', label: 'Leap', sub: L.sub, chip: 'Move', time: null, std: false, why: L.why, armed: lm && !mode.spell, arm: { kind: 'leap', id: e.id }, mode: { kind: 'leap', id: e.id, spell: false } }));
    if (L.spellFree && !L.why) rows.push(row({ id: 'leap-jump', kind: 'arm', label: 'Use Jump', sub: `Leap up to ${L.spell} ft${enc?.budget ? ' for 10 ft of movement' : ''}`, chip: 'Move', time: null, std: false, armed: lm && !!mode.spell, arm: { kind: 'leap', id: e.id }, mode: { kind: 'leap', id: e.id, spell: true } })); }
  rows.push(hideRow(S, e, row));
  rows.push(row({ id: 'search', kind: 'send', label: 'Search', sub: `Perception ${signed(skillBonus(S, e, 'perception'))} · secret doors, traps, things hiding · 15 ft`, chip: CHIP.action, time: 'action',
    why: blocked(S, e, 'action'), send: { type: 'search', actor: e.id } }));
  const sh = shieldRow(S, e, row);
  if (sh) rows.push(sh);
  for (const u of usesFor(S, e)) rows.push(row({ id: `use:${u.object}:${u.verb}`, kind: 'send', label: u.label, sub: u.name, chip: u.time === 'free' ? 'Free once a turn' : CHIP.action, time: u.time === 'free' ? 'free' : 'action', why: u.why,
    send: { type: 'use', actor: e.id, object: u.object, verb: u.verb }, std: false }));
  if (fly?.aloft) {
    // One press, one block (docs/specs/fly-swim-control.md): the next height the engine has a place at, up or down. Without `up` and `down` (an older caller) it is 5 ft a press.
    const alt = fly.alt, up = 'up' in fly ? fly.up : alt + FT, down = 'down' in fly ? fly.down : alt ? alt - FT : null;
    rows.push(row({ id: 'fly-up', kind: 'fly', label: 'Higher', sub: up === null ? `At ${alt} ft` : `Fly at ${up} ft`, delta: FT, time: null, std: false, why: up === null ? 'Nowhere higher in reach.' : '' }));
    rows.push(row({ id: 'fly-down', kind: 'fly', label: alt ? 'Lower' : 'On the ground', sub: down !== null ? `Fly at ${down} ft${down === 0 ? ' (land)' : ''}` : alt ? `At ${alt} ft` : 'Tap Higher to take off', delta: -FT, time: null, std: false, why: down !== null ? '' : alt ? 'Nowhere lower in reach.' : 'Already as low as it goes.' }));
  }
  return rows;
}
// Put a Shield away or take it up (the `shield` action): one row for a built creature that carries a Shield, the sheet's own or a magic one. In a fight it costs the
// action and is greyed with the engine's reason when that is spent or it is not the creature's turn; outside one it is free. The outcome is the engine's: a refusal is shown as it says it.
export function shieldRow(S, e, row = (r) => r) {
  const sheet = e.sheet;
  if (!sheet) return null;
  const mags = (Array.isArray(sheet.items) ? sheet.items : []).filter((y) => CONTENT.items?.[y?.item]?.wear === 'shield');
  const plain = sheet.shield === true;
  if (!plain && !mags.length) return null;
  const held = mags.some((y) => y.equipped === true) || (plain && sheet.shieldStowed !== true), on = !held;
  const fight = !!S.encounter && inFight(S, e.id);
  const send = { type: 'shield', actor: e.id, on };
  if (on && !(plain && sheet.shieldStowed === true)) send.item = mags.find((y) => y.equipped !== true)?.id;      // a magic Shield to take up; a stowed sheet Shield needs no name
  if (send.item === undefined) delete send.item;
  return row({ id: 'shield', kind: 'send', label: on ? 'Take up Shield' : 'Put Shield away', sub: on ? 'Back in hand: its Armor Class bonus returns' : 'A hand free for a Two-Handed weapon; loses its Armor Class bonus',
    chip: fight ? CHIP.action : CHIP.free, time: fight ? 'action' : 'free', why: fight ? blocked(S, e, 'action') : '', send });
}
const hideRow = (S, e, row = (r) => r) => {
  const enc = S.encounter, time = e.features?.nimbleEscape ? 'bonus' : 'action';
  return e.hiding ? row({ id: 'hide', kind: 'none', armed: true, label: 'Hidden', sub: `Stealth ${e.hiding.dc} to find`, why: 'Already hidden: an attack, a spoken spell or a noise gives it away.', time: null })
    : row({ id: 'hide', kind: 'send', label: 'Hide', sub: `Stealth ${signed(skillBonus(S, e, 'stealth'))} · DC 15`, chip: CHIP[time], time, why: (enc && inFight(S, e.id) ? blocked(S, e, time) : '') || hideProblem(S, e), send: { type: 'hide', actor: e.id } });
};
// Feet of movement as shown: on a square map the engine keeps fractions (a diagonal is 5 x √2 ft) and the table sees the whole
// feet left, rounded down, as the engine's own messages say them (`feetLeft`); hex maps show the number as it is.
export const feetShown = (S, n) => (S?.map?.grid === 'square' ? Math.floor(n + 1e-6) : n);

// The speed left this turn for the Move tab's meter: { left, max, prone }. `max` is the walking Speed with each Dash added.
export function moveBudget(S, e) {
  const b = S.encounter?.budget;
  if (!b) return null;
  const base = e.speed ?? b.move, max = Math.max(b.move, base * (1 + (b.dashes ?? 0)));
  return { left: feetShown(S, b.move), max: feetShown(S, max), prone: !!e.cond?.prone };
}

// ---------- the Spells tab (T4b) ----------
// A spell as a row. `why` is the engine's own reason it cannot be cast now (`spellWhy`), then the range: a spell aimed at a creature with nobody within its range says so
// (`targetsFor`, the engine's own list of who it could be aimed at). The Bonus tab lists the spells that cost a Bonus Action; the Spells tab lists them all.
const LONGER = { minute: '1 minute', hour: '1 hour' };
export const castGroup = (sp) => (CHIP[sp.time] && sp.time !== 'free' ? CHIP[sp.time] : 'Longer');
const rangeWhy = (S, e, sp) => {
  const reach = rangeAt(sp.def, e.level);
  if (sp.aim === 'object') return noObjectWhy(S, e, sp);
  if (sp.aim === 'wall') return noWallWhy(S, e, sp);
  if (sp.aim !== 'creature' || !(reach > 0)) return '';
  try { return targetsFor(S, e, { spell: sp.id }).length ? '' : `Nobody within ${reach} ft.`; } catch { return ''; }
};
export function spellRow(S, e, id, { mode = null } = {}) {
  const sp = SPELLS[id], what = sp.heal ? `heal ${sp.heal.dice}${sp.heal.addMod ? signed(mod(e.abil[e.castAbil])) : ''}` : sp.short;
  const reach = rangeAt(sp.def, e.level), range = sp.aim === 'self' ? 'Self' : reach > 0 ? `${reach} ft` : '';
  return { id: `spell:${id}`, kind: 'spell', spell: id, label: sp.name, sub: [sp.level ? `Level ${sp.level}` : 'Cantrip', range, sp.def.concentration ? 'Concentration' : '', sp.def.ritual ? 'Ritual' : '', what].filter(Boolean).join(' · '),
    why: spellWhy(S, e, sp) || rangeWhy(S, e, sp), chip: CHIP[sp.time] && sp.time !== 'free' ? CHIP[sp.time] : (LONGER[sp.time] ?? sp.time), time: sp.time, armed: armedBy(mode, 'spell', id) && !mode.item,
    level: sp.level, roll: sp.roll ?? null, school: sp.def.school ?? '', cast: castGroup(sp), conc: !!sp.def.concentration, ritual: !!sp.def.ritual, kinds: sp.kinds ?? [] };
}

// The slot strip: one entry per spell level the creature has slots of (`e.slots` left, `e.slotsMax`); Pact Magic's are one row of the pact level.
export function slotStrip(e) {
  return Object.keys(e.slotsMax ?? {}).map(Number).sort((a, b) => a - b).map((l) => ({ level: l, left: e.slots?.[l] ?? 0, max: e.slotsMax[l], label: e.pact ? `Pact slots, level ${l}` : `Level ${l}` }));
}

export const SPELL_SORTS = { level: 'Level', name: 'Name', school: 'School', time: 'Casting time' };
export const SPELL_KIND_CHIPS = ['damage', 'healing', 'control', 'utility'];
export const SPELL_CASTS = ['Action', 'Bonus', 'Reaction', 'Longer'];
export const noFilters = () => ({ cast: [], conc: false, ritual: false, level: [], can: false, kind: [] });
export const filtersOn = (f) => f.cast.length + f.level.length + f.kind.length + (f.conc ? 1 : 0) + (f.ritual ? 1 : 0) + (f.can ? 1 : 0);

// The rows of the Spells tab: every spell of `e`, then Metamagic for a sorcerer (`meta`: the button classes.js builds, or null).
export function spellRows(S, e, { mode = null } = {}) {
  return (e.spells ?? []).filter((id) => SPELLS[id]).map((id) => spellRow(S, e, id, { mode }));
}
// The filters combine: a creature's row must pass every kind of chip that is on, and any one chip of the same kind (Action or Bonus; Cantrips or Prepared;
// Damage or Healing). The engine has no spellbook, so Prepared is "not a cantrip". A spell whose kind the engine cannot tell (`kinds` empty) passes every Kind chip.
export function filterSpells(rows, f) {
  return rows.filter((r) => (!f.cast.length || f.cast.includes(r.cast)) && (!f.conc || r.conc) && (!f.ritual || r.ritual) && (!f.can || !r.why) &&
    (!f.level.length || f.level.includes(r.level === 0 ? 'cantrip' : 'prepared')) && (!f.kind.length || !r.kinds.length || r.kinds.some((k) => f.kind.includes(k))));
}
// Rows in groups, as the sort says: Level (Cantrips first), Name (one list), School, Casting time. Within a group by level, then name.
export function sortSpells(rows, sort = 'level') {
  const byName = (a, b) => a.level - b.level || a.label.localeCompare(b.label);
  if (sort === 'name') return rows.length ? [{ head: '', rows: [...rows].sort((a, b) => a.label.localeCompare(b.label)) }] : [];
  const key = { level: (r) => (r.level ? `Level ${r.level}` : 'Cantrips'), school: (r) => (r.school ? r.school[0].toUpperCase() + r.school.slice(1) : 'Other'), time: (r) => r.cast }[sort] ?? ((r) => (r.level ? `Level ${r.level}` : 'Cantrips'));
  const groups = new Map();
  for (const r of [...rows].sort(byName)) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const order = sort === 'time' ? SPELL_CASTS : null;
  return [...groups].map(([head, list]) => ({ head, rows: list })).sort((a, b) => (order ? order.indexOf(a.head) - order.indexOf(b.head) : sort === 'school' ? a.head.localeCompare(b.head) : 0));
}

// Everything that costs a Bonus Action, from every kind (Decision 6): spells with `time: 'bonus'`, features whose action is a Bonus Action, the standard actions that are
// one for this creature (Nimble Escape: Disengage and Hide; Cunning Action, `bonusActs`: Dash, Disengage, Hide), a monster's bonus actions and a bonus attack.
// Returns { rows, available, why }: `available` is whether a Bonus Action is left, `why` the engine's reason when it is not.
export function bonusRows(S, e, { mode = null, fly = null } = {}) {
  const rows = [], seen = new Set(), add = (r) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } };
  for (const r of attackRows(S, e, { mode })) if (r.time === 'bonus') add(r);
  for (const r of featureRows(S, e, { mode })) if (r.time === 'bonus') add(r);
  for (const id of e.spells ?? []) if (SPELLS[id]?.time === 'bonus') add(spellRow(S, e, id, { mode }));
  const std = moveRows(S, e, { fly }), nimble = !!e.features?.nimbleEscape;
  for (const r of std) if (r.std && r.time === 'bonus') add(r);
  for (const kind of e.bonusActs ?? []) {
    if (nimble && kind !== 'dash') continue;                                                      // already a Bonus Action row above
    const base = std.find((r) => r.id === kind);
    if (!base) continue;
    add({ ...base, id: `${kind}-bonus`, label: `${base.label} (Bonus)`, chip: CHIP.bonus, time: 'bonus', why: kind === 'hide' && base.kind === 'none' ? base.why : (kind === 'hide' ? (S.encounter && inFight(S, e.id) ? blocked(S, e, 'bonus') : '') || hideProblem(S, e) : blocked(S, e, 'bonus')),
      ...(base.send ? { send: { ...base.send, bonus: true } } : {}) });
  }
  for (const r of rollers(S, e)) add({ id: `roll:${r.id}`, kind: 'arm', label: `Roll ${r.name}`, sub: `Up to ${r.feet} ft · tap the map`, chip: CHIP.bonus, time: 'bonus', armed: !!mode && mode.kind === 'roll' && mode.effect === r.id, mode: rollMode(r) });
  const why = blocked(S, e, 'bonus');
  return { rows: rows.map((r) => (r.why || !why ? r : { ...r, why })), available: !why, why };
}

// ---------- the Items tab (T4b, E18) ----------
// What a creature carries and what it can do with it. Three parts: `uses`, a row for each use of an item, as `itemUsesFor` (the engine's own list, with its reason a row is greyed);
// `gear`, each magic item of the sheet with where it is (carried, worn or held, attuned) and the buttons that change that (the `equip` and `attune` actions); and `light`, the light carried.
// A potion is given to the user or to a creature within `reach` (5 ft), so its row has `reach` and `targets` (`potionTargets`). Nothing here decides a rule: the engine's words are the reasons.
const GEAR_WORDS = (def) => (def.wear === 'weapon' || def.wear === 'shield' ? { on: 'Wield', off: 'Put away', is: 'Held', not: 'Not held' } : { on: 'Wear', off: 'Take off', is: 'Worn', not: 'Not worn' });

// Who a potion can be given to besides its drinker: creatures not dead within `reach` feet (the engine checks walls and height), in the fight if there is one.
export function potionTargets(S, e, reach) {
  if (!(reach > 0) || !e.pos) return [];
  const G = gridOf(S.map), fighting = !!S.encounter && inFight(S, e.id);
  return Object.values(S.entities).filter((x) => x.id !== e.id && !x.dead && x.pos && G.dist(e.pos, x.pos) * FT <= reach && (!fighting || inFight(S, x.id)))
    .sort((a, b) => G.dist(e.pos, a.pos) - G.dist(e.pos, b.pos) || a.name.localeCompare(b.name)).map((x) => ({ id: x.id, name: x.name, hp: x.hp, down: x.hp <= 0 }));
}

// The gear of a built creature: one entry per magic item on its sheet. `acts`: { id, label, why, send } for `equip` (Wear, Take off, Wield, Put away) and `attune`.
export function gearRows(S, e) {
  const sheet = e.sheet;
  if (!sheet || !Array.isArray(sheet.items)) return [];
  const fighting = !!S.encounter && inFight(S, e.id), pending = sheet.attuning ?? null;
  const attunedNow = heldItems(sheet).filter((y) => y.x.attuned === true).length;
  return heldItems(sheet).map(({ x, def }) => {
    const w = GEAR_WORDS(def), name = itemName(def, x), acts = [], state = [];
    if (def.wear === 'carried') state.push('Carried');
    else {
      const on = x.equipped === true;
      state.push(on ? w.is : w.not);
      acts.push({ id: `equip:${x.id}`, label: on ? w.off : w.on, why: fighting ? `${e.name} can't change what they wear in the middle of a fight.` : '', send: { type: 'equip', actor: e.id, item: x.id, on: !on } });
    }
    if (def.attune) {
      const mine = pending?.item === x.id, ending = mine && pending.end === true;
      state.push(x.attuned === true ? (ending ? 'Attuned, ending at the next Short Rest' : 'Attuned') : mine ? 'Attuning at the next Short Rest' : 'Needs attunement');
      if (mine) acts.push({ id: `attune:${x.id}`, label: ending ? 'Keep attunement' : 'Cancel attuning', why: fighting ? `${e.name} can't attune to an item in the middle of a fight.` : '', send: { type: 'attune', actor: e.id, item: null } });
      else if (x.attuned === true) acts.push({ id: `attune:${x.id}`, label: 'End attunement', why: fighting ? `${e.name} can't attune to an item in the middle of a fight.` : '', send: { type: 'attune', actor: e.id, item: x.id, end: true } });
      else acts.push({ id: `attune:${x.id}`, label: 'Attune', send: { type: 'attune', actor: e.id, item: x.id },
        why: fighting ? `${e.name} can't attune to an item in the middle of a fight.` : attuneProblem(sheet, def) || (attunedNow >= attuneMax(sheet) ? `${e.name} is attuned to ${attuneMax(sheet)} items already: end one first.` : '') });
    }
    return { id: `gear:${x.id}`, key: x.id, label: name, sub: state.join(' · '), acts, pack: def.id, held: x.equipped === true };
  });
}

// The light a creature carries, as one row: put it out (the DM), or light a torch (the DM; a player is told so, as in Explore).
export function lightRow(S, e, { dm = false } = {}) {
  if (e.light) {
    const l = e.light, name = l.item && LIGHTS[l.item] ? LIGHTS[l.item].name.toLowerCase() : 'light';
    return { id: 'light', kind: 'send', label: `Put out the ${name}`, sub: `Carried: Bright ${l.bright} ft, then Dim ${l.dim} ft more`, chip: '', why: dm ? '' : 'Only the DM hands out light.', send: { type: 'setLight', actor: e.id, item: null } };
  }
  return { id: 'light', kind: 'send', label: 'Light a torch', sub: 'Bright 20 ft, then Dim 20 ft more', chip: '', why: dm ? '' : 'Only the DM hands out light.', send: { type: 'setLight', actor: e.id, item: 'torch' } };
}

// The Items tab: { uses, gear, also, light }. `also`: what the creature carries that is only a name (`gear`, for a creature typed in by hand or plain kit).
export function itemRows(S, e, { dm = false, mode = null } = {}) {
  // A spell from an item is aimed as a spell is (tap the row to arm it, then the target or the hex). The engine greys such a use with "Pick a target for ..." (or a direction, or where it
  // goes off) until it is given an aim: that reason means arm, not disabled, so the row is not greyed for it. Any other reason stays.
  const needsAim = (u) => !!u.spell && !u.self && !['self', 'none'].includes(SPELLS[u.spell]?.aim);
  const aimOnly = (u) => needsAim(u) && /^Pick (a target|a direction|where)\b/.test(u.why);
  const row = (u) => ({ id: `item:${u.key}:${u.which}`, kind: 'item', label: u.label, sub: [u.item, u.consumed ? 'used up' : '', u.spell && SPELLS[u.spell] ? SPELLS[u.spell].name : ''].filter((t, i, a) => t && a.indexOf(t) === i && t !== u.label).join(' · '),
    aimed: needsAim(u), cost: u.cost, spell: u.spell, level: u.level, upTo: u.upTo ?? 0, armed: !!mode && mode.kind === 'spell' && mode.item?.key === u.key && mode.item.which === u.which,
    why: aimOnly(u) ? '' : u.why, chip: CHIP[u.time] ?? '', time: u.time, reach: u.reach, targets: u.reach ? potionTargets(S, e, u.reach) : [],
    pips: u.charges !== undefined ? { left: u.charges, max: u.max, unit: 'charges', text: u.cost ? `${u.cost} a use` : '' } : null, send: { type: 'use', actor: e.id, item: u.key, which: u.which } });
  // Two of the same potion (or scroll of one spell, or any item with no charges) are one row, "x2"; a tap uses the first.
  const all = [];
  for (const u of itemUsesFor(S, e)) {
    const r = row(u), twin = !u.charges && u.charges !== 0 && all.find((o) => !o.pips && o.group === `${u.pack}|${u.which}|${u.item}|${u.why}`);
    if (twin) { twin.count++; continue; }
    all.push({ ...r, count: 1, group: `${u.pack}|${u.which}|${u.item}|${u.why}` });
  }
  for (const r of all) if (r.count > 1) r.sub = [r.sub, `x${r.count}`].filter(Boolean).join(' · ');
  const uses = [...all.filter((r) => !r.why), ...all.filter((r) => r.why)];
  const gear = gearRows(S, e), also = (e.gear ?? []).filter((g) => typeof g === 'string' && g);
  const carried = gear.length > 0 || also.length > 0 || !!e.light;
  // E17: Give... and Drop on each thing carried, and what lies on the ground in reach. The engine's lists and its reasons (`passTargets`, `interactionOf`, `pickUpsFor`).
  const hand = handRows(S, e, { dm });
  for (const g of gear) g.acts.push(...hand.actsFor(g.key, g.held));
  for (const g of gear) if (g.held) g.note = TAKE_OFF;
  const names = [];
  for (const n of also) { const t = names.find((x) => x.label === n); if (t) t.count++; else names.push({ id: `name:${n}`, label: n, count: 1, acts: hand.actsFor(n, false), note: '' }); }
  return { uses, gear, also, names, light: carried ? lightRow(S, e, { dm }) : null, targets: hand.targets, time: hand.time, ground: hand.ground, any: carried || hand.ground.length > 0 };
}

// What a creature can do with what it carries and what lies by it (E17). `targets`: the creatures it can hand something to, as `passTargets` gives them (a player's state holds only the ones the
// party knows of; one that is hidden is left out for anyone but the DM besides); `time`: what the next object interaction costs. `actsFor(item, held)`: the Give... and Drop buttons of a thing carried
// (`item` is a sheet key or a name in `gear`, as the engine takes it); a worn or held thing has none, it says "take it off first". `ground`: the piles in reach, a button for each thing on them
// and, outside a fight, Take all; for the DM the piles dropped unseen too, marked `unseen`.
const TAKE_OFF = 'Take it off first.';
const TIME_WORDS = { free: 'Free: the first thing you handle this turn.', action: 'Uses your action.' };
export function handRows(S, e, { dm = false } = {}) {
  if (!e) return { targets: [], time: null, ground: [], actsFor: () => [] };
  const { why, time } = interactionOf(S, e), fighting = !!S.encounter && inFight(S, e.id);
  const targets = passTargets(S, e).filter((t) => dm || !S.entities[t.id]?.hidden).map((t) => ({ id: t.id, name: t.name, why: t.why, time: t.time }));
  const ready = targets.some((t) => !t.why);
  const actsFor = (item, held) => (held ? [] : [
    { id: `give:${item}`, label: 'Give...', give: { item }, why: why || (targets.length ? (ready ? '' : targets.find((t) => t.why)?.why ?? '') : 'Nobody is within 5 feet.'), time },
    { id: `drop:${item}`, label: 'Drop', why, time, send: { type: 'drop', actor: e.id, item } },
  ]);
  const ground = pickUpsFor(S, e, { dm }).map((p) => ({
    id: `pile:${p.object}`, object: p.object, label: p.name, unseen: p.unseen === true, why: p.why, time: p.time,
    things: p.items.map((x) => ({ id: `pick:${p.object}:${x.id}`, label: x.name, why: p.why, send: { type: 'pickUp', actor: e.id, object: p.object, item: x.id } })),
    all: !fighting && p.items.length > 1 ? { id: `pick:${p.object}`, label: 'Take all', why: p.why, send: { type: 'pickUp', actor: e.id, object: p.object } } : null,
  }));
  return { targets, time, ground, actsFor };
}

// The rows of the tab `id` for `e` ('' for a tab with none). One place for the shell and the tests.
export function tabRows(S, e, id, { mode = null, fly = null } = {}) {
  if (id === 'attacks') { const h = holdRows(S, e); return [...h.escape, ...attackRows(S, e, { mode }), ...h.letGo]; }       // breaking free comes first for a held creature: nothing else is likely worth its action
  if (id === 'bonus') return bonusRows(S, e, { mode, fly }).rows;
  if (id === 'move') return moveRows(S, e, { fly, mode });
  if (id === 'features') return [...featureRows(S, e, { mode }), ...holdRows(S, e).letGo];
  if (id === 'spells') return spellRows(S, e, { mode });
  return [];
}


// ---------- the action groups (docs/specs/one-token-menu.md, Decision 4 and R29; stage M4) ----------
// The old tabs sorted rows by kind; the groups sort the same rows by what the player wants to do. A row may be in two groups (a healing spell is in Cast and in Heal): it is the same row.
// In a fight only what can be used now is shown (R29): a row with a `why` is left out unless it is armed (a tap on it puts it down), and a group with nothing left is left out. Out of a fight the
// rows stay and say why. `groupsFor` is pure: a test walks it.
export const GROUP_LABEL = { stone: 'In the stone', explore: 'Explore', attacks: 'Attack', spells: 'Cast', heal: 'Heal', move: 'Move', defend: 'Defend and hide', use: 'Use', features: 'Features', companions: 'Companions', reactions: 'Reactions', rest: 'Rest', items: 'Inventory' };
// The order never changes within a state (Decision 4), so a hand learns it. Inventory ends the list in both.
export const GROUP_ORDER = { fight: ['attacks', 'spells', 'heal', 'move', 'defend', 'use', 'features', 'companions', 'reactions', 'items'], free: ['explore', 'spells', 'heal', 'use', 'rest', 'features', 'companions', 'items'] };
// What a turn-bar segment opens (Decision 4: the segment is the question): a screen of everything that costs that, or the group it stands for.
export const COSTS = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', move: 'Move' };
const HEAL_ROW = /^feat:(second-?wind|lay-on-hands)$/i;
const spellHeals = (id) => !!(SPELLS[id]?.heals || SPELLS[id]?.heal);
export const healsRow = (r) => HEAL_ROW.test(r.id) || ((r.kind === 'spell' || r.kind === 'ritual') && spellHeals(r.spell)) || (r.kind === 'item' && ((!!r.spell && spellHeals(r.spell)) || /heal/i.test(r.label)));
// Whether a row is offered in a fight: usable, or armed (so a tap can put it down again).
export const offered = (r) => !r.why || !!r.armed;

// The rows of one group for `e`, every one (greyed ones too: `groupsFor` takes them out of a fight). `o`: { mode, fly, dm, found, comp: { attacks, features, move } (companions.js), inv (an `itemRows`) }.
export function groupRows(S, e, id, { mode = null, fly = null, dm = false, found = false, comp = null, inv = null } = {}) {
  const cr = comp ?? { attacks: [], features: [], move: [] };
  const std = (...ids) => moveRows(S, e, { fly, mode }).filter((r) => ids.includes(r.id));
  const bonusStd = (...ids) => bonusRows(S, e, { mode, fly }).rows.filter((r) => ids.includes(r.id));
  const items = () => inv ?? itemRows(S, e, { dm, mode });
  switch (id) {
    case 'attacks': return [...attackRows(S, e, { mode }), ...cr.attacks, ...spellRows(S, e, { mode }).filter((r) => r.roll === 'attack')];
    case 'spells': return spellRows(S, e, { mode });
    case 'heal': return [...stabilizeRows(S, e), ...spellRows(S, e, { mode }).filter(healsRow), ...featureRows(S, e, { mode }).filter(healsRow), ...items().uses.filter(healsRow)];
    case 'move': { const h = holdRows(S, e); return [...std('fly'), ...h.escape, ...std('dash', 'disengage', 'leap', 'leap-jump', 'fly-up', 'fly-down', 'fly-to'), ...bonusStd('dash-bonus', 'disengage-bonus'), ...h.letGo]; }
    case 'defend': return [...std('dodge', 'hide', 'search', 'shield'), ...bonusStd('hide-bonus')];
    case 'use': return [...moveRows(S, e, { fly }).filter((r) => r.id.startsWith('use:')), ...items().uses.filter((r) => !healsRow(r))];
    case 'features': return featureRows(S, e, { mode }).filter((r) => !healsRow(r));
    case 'companions': return [...cr.features, ...cr.move];
    // Out of a fight there is no Move group: a flyer finds Fly… here, among the first tiles (it is the word a player looks for); Higher and Lower are under More.
    case 'explore': return [...std('fly').map((r) => ({ ...r, grid: true })), ...rankExplore(S, e, { dm, mode, found }), ...std('leap', 'leap-jump', 'fly-up', 'fly-down', 'fly-to')].filter((r) => r.kind !== 'jump' && r.id !== 'shortRest' && r.id !== 'longRest');
    case 'rest': return rankExplore(S, e, { dm, mode, found }).filter((r) => r.id === 'shortRest' || r.id === 'longRest');
    case 'items': { const it = items(); return [...it.uses, ...(it.light ? [it.light] : [])]; }
    default: return [];
  }
}


// ---------- A friend is down (docs/specs/one-token-menu.md, Heal; #781) ----------
// One row for each ally at 0 Hit Points and not Stable, first in the Heal group: a DC 10 Wisdom (Medicine) check within 5 feet, which anyone may try (engine/features.js
// `stabilize`). In a fight it takes the action; outside one it costs nothing. The engine decides the check and refuses what it must; this row only says why it is greyed.
export function stabilizeRows(S, e) {
  if (!e.pos || e.dead) return [];
  const fighting = !!S.encounter && inFight(S, e.id);
  return Object.values(S.entities).filter((t) => t.id !== e.id && t.side === e.side && t.pos && !t.dead && t.hp <= 0 && !t.cond?.stable && !t.hidden)
    .sort((a, b) => a.name.localeCompare(b.name)).map((t) => {
      let why = '';
      if (e.hp <= 0) why = `${e.name} is down.`;
      else if (fighting && blocked(S, e, 'action')) why = blocked(S, e, 'action');
      else if (!unblocked(S, e, t)) why = `There is a wall between ${e.name} and ${t.name}.`;
      else if (apart(S, e, t) * FT > 5) why = `${t.name} is out of reach: stabilizing is done within 5 feet.`;
      return { id: `stabilize:${t.id}`, kind: 'send', label: `Stabilize ${t.name}`, sub: `A friend is down · Medicine, DC 10${fighting ? '' : ' · a round of time'}`, why, chip: fighting ? CHIP.action ?? 'Action' : '', time: fighting ? 'action' : null,
        send: { type: 'stabilize', actor: e.id, target: t.id } };
    });
}

// ---------- Merged with stone (Meld into Stone, #826; #827) ----------
// A creature in the wall (`melded`) can do only what the engine's `control` allows: leave (`unmeld`), cast on itself, end its turn, check and answer reactions. So its page is two groups:
// Step out (greyed with the engine's own reason: out of turn, or under 5 ft of movement left in a fight) and the spells it may cast on itself. Pure.
export const meldedLeft = (S, e) => { const fx = (S.effects ?? []).find((x) => x.id === e.melded?.fx), t = fx ? untilText(S, fx) : ''; return t ? t.replace(/^until /, 'until ') : ''; };
export function stepOutRow(S, e) {
  const fight = !!S.encounter && inFight(S, e.id);
  let why = '';
  if (e.hp <= 0 || e.dead) why = `${e.name} is down.`;
  else if (fight && current(S) !== e.id) why = `It isn't ${e.name}'s turn.`;
  else if (fight && S.encounter.budget.move < FT - 1e-9) why = `Leaving the stone takes ${FT} ft of movement; ${e.name} has ${feetShown(S, S.encounter.budget.move)} ft left.`;
  return { id: 'unmeld', kind: 'send', label: 'Step out', sub: `Leave the stone${fight ? ` · costs ${FT} ft of movement` : ''}`, chip: fight ? 'Move' : '', time: null, why, send: { type: 'unmeld', actor: e.id } };
}
const meldedGroups = (S, e, o) => {
  const out = [], step = stepOutRow(S, e), self = spellRows(S, e, { mode: o.mode }).filter((r) => SPELLS[r.spell]?.aim === 'self');
  const fight = !!S.encounter && inFight(S, e.id), filtered = fight ? (l) => l.filter(offered) : (l) => l;
  for (const [id, rows] of [['stone', [step]], ['spells', self]]) {
    const g = { id, label: GROUP_LABEL[id], rows, offered: filtered(rows), tip: '', why: '', shown: id === 'stone' || rows.length > 0 };
    g.tip = g.offered.length ? names(g.offered) : rows.find((r) => r.why)?.why || '';
    out.push(g);
  }
  return out;
};

// What a group says closed, in a few words: the rows to use now (or, with none, why).
const names = (rows, n = 2) => { const l = rows.map((r) => r.label); return l.slice(0, n).join(', ') + (l.length > n ? ` +${l.length - n}` : ''); };

// Everything the Character screen's action part needs: { situation, fight, groups, shown, empty }. A group is { id, label, rows (all), offered (what a fight shows), tip, why, shown }.
// `ctx`: the `panelContext`; `o`: as `groupRows`, and `meta` (the Metamagic button of classes.js, or null), `react` (a `reactionState`).
export function groupsFor(S, e, ctx, o = {}) {
  const fight = !!S.encounter && inFight(S, e.id), mine = ctx.situation !== 'watch' && ctx.situation !== 'none' && ctx.situation !== 'down';
  if (!mine) return { situation: ctx.situation, fight, groups: [], shown: [], empty: '' };
  const dm = !!o.dm, inv = o.inv ?? itemRows(S, e, { dm, mode: o.mode });
  if (e.melded && ctx.situation !== 'down') { const groups = meldedGroups(S, e, o), shown = groups.filter((g) => g.shown); return { situation: ctx.situation, fight, groups, shown, empty: '' }; }
  const react = o.react ?? reactionState(S, e, { dm }), groups = [];
  const filtered = fight ? (list) => list.filter(offered) : (list) => list;
  for (const id of GROUP_ORDER[fight ? 'fight' : 'free']) {
    const g = { id, label: GROUP_LABEL[id], rows: [], offered: [], tip: '', why: '', shown: false };
    if (id === 'reactions') {
      g.shown = fight && (react.ok || react.pending || react.free > 0);
      g.tip = react.pending ? 'A question is waiting' : react.ok ? 'Ready' : react.free ? 'Standing instructions' : react.why; g.why = react.ok ? '' : react.why;
    } else if (id === 'items') {
      g.rows = groupRows(S, e, id, { ...o, inv });
      const acts = [...inv.gear.flatMap((x) => x.acts), ...inv.names.flatMap((x) => x.acts), ...inv.ground.flatMap((p) => [...p.things, ...(p.all ? [p.all] : [])])];
      g.offered = [...filtered(inv.uses), ...(inv.light && offered(inv.light) ? [inv.light] : []), ...acts.filter((a) => !a.why)];
      g.shown = fight ? g.offered.length > 0 : inv.any;
      g.tip = inv.any ? `${inv.gear.length + inv.names.length} carried${inv.uses.length ? ` · ${inv.uses.length} to use` : ''}` : 'Nothing carried';
    } else {
      g.rows = groupRows(S, e, id, { ...o, inv });
      if (id === 'spells' && o.meta) g.rows = [{ id: 'metamagic', kind: 'meta', label: o.meta.label, why: o.meta.why, armed: /\barmed\b/.test(o.meta.cls ?? '') }, ...g.rows];
      g.offered = filtered(g.rows);
      // Out of a fight a group is left out when nothing is in it (a fighter has no Cast); Heal and Explore stay, greyed, with their reason (Decision 4).
      g.shown = fight ? g.offered.length > 0 : g.rows.length > 0 || id === 'heal' || id === 'explore';
      if (id === 'heal' && !g.rows.length) g.why = `${e.name} has no healing spell or item.`;
      g.tip = g.offered.length ? names(g.offered) : g.why || g.rows.find((r) => r.why)?.why || '';
    }
    groups.push(g);
  }
  if (fight && current(S) !== e.id) { const i = groups.findIndex((g) => g.id === 'reactions'); if (i > 0) groups.unshift(...groups.splice(i, 1)); }      // not your turn: Reactions comes first
  const shown = groups.filter((g) => g.shown);
  // The whole page empty in a fight: one line, the engine's own reason.
  const empty = fight && !shown.length ? (blocked(S, e, 'action') || groups.flatMap((g) => g.rows).find((r) => r.why)?.why || `${e.name} has nothing to do right now.`) : '';
  return { situation: ctx.situation, fight, groups, shown, empty };
}

// The quick actions of the turn line (#717, docs/specs/one-token-menu.md "#717 build notes"): on the creature's own turn, up to `max` rows that need the map next (an attack to
// aim, a spell), so a fight action is the quick action and then the target. The row used last (`last`, a row id) comes first if it can be used again, then the first usable
// row of Attack, of Cast, the next of each; no row twice. `G` is `groupsFor`'s answer, so only what the Character screen offers now is here. Pure.
export const QUICK_KINDS = new Set(['arm', 'strike', 'spell']);
export function quickRows(G, { last = null, max = 3 } = {}) {
  if (!G || !G.fight || G.situation !== 'turn') return [];
  const of = (id) => (G.groups.find((g) => g.id === id && g.shown)?.offered ?? []).filter((r) => QUICK_KINDS.has(r.kind) && (!r.why || r.armed));
  const a = of('attacks'), c = of('spells'), out = [];
  const add = (r) => { if (r && out.length < max && !out.some((x) => x.id === r.id)) out.push(r); };
  add([...a, ...c].find((r) => r.id === last));
  for (let i = 0; i < Math.max(a.length, c.length) && out.length < max; i++) { add(a[i]); add(c[i]); }
  return out;
}

// Everything that costs `cost` ('action', 'bonus', 'reaction'), from every group, once each (Decision 4: the turn bar filters). `G` is `groupsFor`'s answer.
export function costRows(S, e, cost, G, { mode = null, fly = null } = {}) {
  if (cost === 'bonus') return bonusRows(S, e, { mode, fly }).rows;
  const seen = new Set(), out = [];
  for (const g of G.groups) for (const r of g.rows) if (r.time === cost && !seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
}


// ---------- the status line ----------
// What the pills say, and how each ends. Pure: it reads the creature and the state's lasting effects.
const effectsOn = (S, e) => (S.effects ?? []).filter((fx) => fx.source === e.id || fx.parts.some((p) => p.target === e.id && !p.ended));
const untilText = (S, fx) => (!fx.until ? '' : fx.until.clock !== undefined ? `until ${clockText(fx.until.clock)}` : S.encounter ? `${Math.max(0, fx.until.round - S.encounter.round)} rounds left` : '');
const CONC = 'Ends if you take damage and fail a Constitution save (DC 10 or half the damage, at most 30), cast another spell that needs Concentration, or are incapacitated.';

// The small card a pill opens: { title, lines, end }. `key`: `fx:<id>`, `cond:<id>` or `dying`. `end`: the effect `mine` may end.
export function howItEnds(S, e, key, { mine = false } = {}) {
  const [kind, id] = String(key).split(':');
  if (kind === 'fx') {
    const fx = (S.effects ?? []).find((x) => x.id === id);
    if (!fx) return null;
    const lines = [fx.lasts ? `Lasts ${fx.lasts}.` : '', untilText(S, fx) ? `${untilText(S, fx)[0].toUpperCase()}${untilText(S, fx).slice(1)}.` : fx.until ? '' : 'Until the DM ends it.'].filter(Boolean);
    if (fx.conc) lines.unshift(`${S.entities[fx.source]?.id === e.id ? 'Concentrating' : `${S.entities[fx.source]?.name ?? 'Someone'} is concentrating`} on ${fx.name}.`, CONC);
    return { title: fx.name, lines, end: mine && S.entities[fx.source] ? fx.id : null };
  }
  if (kind === 'dying') {
    const stable = e.cond?.stable;
    return { title: stable ? 'Stable' : 'Dying', lines: [stable ? `${e.name} is at 0 Hit Points and no longer rolling death saves. Healing brings ${e.name} back up.` : `Death saves ${e.death?.s ?? 0}✓ ${e.death?.f ?? 0}✗: rolled for you at the start of your turn. Three successes make you stable; three failures end you; any healing brings you back up.`], end: null };
  }
  if (kind === 'cond') {
    const def = conditionDef(id), by = effectsOn(S, e).filter((fx) => fx.parts.some((p) => p.target === e.id && p.cond === id && !p.ended));
    const lines = [def?.text ?? ''];
    if (id === 'prone') lines.push('You stand at the start of your turn, for half your Speed.');
    const held = id === 'grappled' ? howHeldEnds(S, e) : [];
    if (by.length) for (const fx of by) lines.push(`From ${fx.name}${untilText(S, fx) ? `: ${untilText(S, fx)}` : ''}.`);
    else if (held.length) lines.push(...held);
    else lines.push('Until the DM removes it.');
    return { title: conditionName(id) + (e.cond?.[id]?.level ? ` ${e.cond[id].level}` : ''), lines: lines.filter(Boolean), end: null };
  }
  return null;
}

// The pills of a creature: { html } for the status line. `full`: we were sent its whole record; `myTurn`: the turn budget is shown.
export function statusHtml(S, e, { mine = false, full = false, formLabel = '', budget = null, open = '' } = {}) {
  const enc = S.encounter, b = budget;
  // The turn bar's four segments are buttons (a tap opens everything that costs it: Decision 4); the rest are plain words.
  const pip = (label, have, cost = '') => (cost && mine ? `<button type="button" class="pip ${have ? 'have' : 'spent'}" data-cost="${cost}" aria-pressed="${open === (cost === 'move' ? 'move' : cost === 'reaction' ? 'reactions' : `cost:${cost}`)}">${label}</button>` : `<span class="${have ? 'have' : 'spent'}">${label}</span>`);
  const pill = (key, label, cls = '') => `<button type="button" class="pill ${cls}" data-how="${esc(key)}" aria-expanded="false">${label}</button>`;
  const dying = !e.dead && e.hp <= 0 && full && (e.cond?.stable ? 'Stable' : `Dying ${e.death?.s ?? 0}✓ ${e.death?.f ?? 0}✗`);
  const conds = Object.keys(e.cond ?? {}).filter((c) => e.cond[c] && c !== 'stable');
  const plain = (e.dead ? ['Dead'] : []).map((t) => `<span>${esc(t)}</span>`).join('');
  const lasting = effectsOn(S, e).map((fx) => {
    const left = untilText(S, fx), label = `${esc(fx.name)}${fx.conc ? ' (C)' : ''}${left ? ` · ${esc(left.replace(' left', '').replace(/^until /, 'until '))}` : ''}`;
    return pill(`fx:${fx.id}`, label, 'fx');
  }).join('');
  return (b ? pip('Action', b.action > 0, 'action') + (b.attacks ? pip(`Attacks left ${b.attacksLeft}`, true) : '') + pip('Bonus Action', b.bonus > 0, 'bonus') + pip(`Move ${feetShown(S, b.move)} ft`, b.move >= 5, 'move') : '') +
    (full && enc && inFight(S, e.id) ? pip('Reaction', !e.reactionUsed, 'reaction') : '') +
    Object.keys(e.slotsMax || {}).map((l) => pip(`Level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`, e.slots[l] > 0)).join('') +
    (e.melded && !e.dead ? `<span class="stone">Melded into stone${meldedLeft(S, e) ? ` · ${esc(meldedLeft(S, e))}` : ''}</span>` : '') + plain + (formLabel ? `<b class="form">${esc(formLabel)} form</b>` : '') + (dying ? pill('dying', esc(dying)) : '') + (e.hidden ? '<span>Hidden from players</span>' : '') +
    conds.map((c) => pill(`cond:${c}`, esc(c === 'grappled' ? heldText(S, e) : conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : '')))).join('') + lasting;
}

// ---------- the page ----------
const $ = (id) => document.getElementById(id);
const ARMS = (m) => !!m && m.kind !== 'move';

// ctx: { prefs, state(), isDM(), mine(e), act, toast, skipping(), setMode(m), move (the idle mode), castSpell(e, id, armed), openSheet(),
//        shortRest(), hpFraction(e), formLabel(e), budget(e), openFeature(e, id) (a chooser of classes.js), flyInfo(e) ({ has, why, words, aloft, alt, up, down }),
//        choices() (what the armed spell waits to be told: { key, name, groups }, confirm.js; #750 part 2), choose(group, value),
//        fly(e, delta) (change the height of the next move), flyOpen(e, armed) (open the column of heights, or close it), metamagic(e) (the Metamagic button of classes.js, or null), render(), selected() }.
// The groups are drawn into `#ap-body` of the Character screen (`#sheet`): one bar for each group, one open at a time (Decision 4d), under the status block, which draws the turn bar.
// M10: the page is one accordion. The sheet is its last section (`#sheet-body` is moved into it), and while a section is open the page is pinned (`#sheet.pin`): the status block goes
// compact, the open section's pane scrolls, and the other bars stay on the screen above and below it as titles side by side (accordion.js `gridPlan`), so every one is one tap away.
export function initActionPanel(ctx) {
  initSpellCards();                                      // hover, long press or the I key on any node with data-spellcard (#787)
  const { prefs } = ctx;
  const card = $('card'), body = $('ap-body'), how = $('ap-how');
  let sel = { key: '', tab: null }, rowsBy = {}, moreOpen = false, howKey = null, ctxNow = null, found = [false, false], openNow = '', curE = null, groupsNow = [], lastRun = { enc: null, ids: {} }, quickNow = [], quickLast = null;
  const pref = () => (prefs.get('hextable.panelTab') === 'remember' ? 'remember' : 'auto');
  const last = () => prefs.get('hextable.panelLast') ?? {};
  // One section for each group, then the screen of a turn-bar segment (`cost`) and the note of a creature that is down. Each is a bar (a button) and the pane it opens.
  const secs = {}, panes = {}, bars = {};
  const mk = (tag, props = {}, ...kids) => { const x = document.createElement(tag); for (const [k, v] of Object.entries(props)) x.setAttribute(k, v); x.append(...kids); return x; };
  const noteEl = mk('p', { id: 'ap-empty', class: 'ap-why-line', role: 'status' }); noteEl.hidden = true;
  panes.down = mk('div', { id: 'ap-down', class: 'ap-down', role: 'status' }); panes.down.hidden = true;
  body.append(noteEl, panes.down);
  // #750 part 2: the choices an armed action waits for (a spell's slot level, its weapon or skill), at the top of the open section. One element, moved into the pane that is open.
  const choicesEl = mk('div', { id: 'ap-choices', class: 'ap-choices', role: 'group' }); choicesEl.hidden = true;
  let choiceSeen = '';
  choicesEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ch]'); if (!b || ctx.skipping()) return;
    if (b.getAttribute('aria-disabled') === 'true') return ctx.toast(b.dataset.why);
    const g = b.dataset.ch, v = b.dataset.v;
    ctx.choose(g, v);
    choicesEl.querySelector(`[data-ch="${g}"][data-v="${CSS.escape(v)}"]`)?.focus({ preventScroll: true });      // the options are drawn again: the keyboard keeps its place
  });
  const choicesHtml = (c) => `<p class="ap-ch-h">${esc(c.name)} waits for the die. Choose, then tap it.</p>${c.groups.map((g) => {
    const gid = `ap-chl-${g.id}`;
    return `<div class="ap-ch-g" role="radiogroup" aria-labelledby="${gid}"><span class="ap-ch-l" id="${gid}">${esc(g.label)}</span><div class="ap-ch-o">${g.options.map((o, i) => {
      const wid = `ap-chw-${g.id}-${i}`;
      return `<button type="button" role="radio" class="ap-ch ${o.why ? 'off' : 'use'}${o.on ? ' on' : ''}" data-ch="${g.id}" data-v="${esc(o.value)}" data-why="${esc(o.why)}" aria-checked="${o.on}" aria-disabled="${o.why ? 'true' : 'false'}"${o.why ? ` aria-describedby="${wid}"` : ''}><span class="ap-ch-t">${o.on ? '\u2713 ' : ''}${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}${o.why ? `<small class="ap-why" id="${wid}">${esc(o.why)}</small>` : ''}</button>`;
    }).join('')}</div></div>`;
  }).join('')}`;
  for (const id of ['cost', ...new Set([...GROUP_ORDER.fight, ...GROUP_ORDER.free]), 'sheet']) {
    const bar = mk('button', { type: 'button', class: 'ap-bar', id: `ap-bar-${id}`, 'data-sec': id, 'aria-expanded': 'false', 'aria-controls': `ap-${id}` },
      mk('span', { class: 'ap-bt' }), mk('small', { class: 'ap-tip' }), mk('span', { class: 'ap-chev', 'aria-hidden': 'true' }, '›'));
    const pane = mk('div', { id: `ap-${id}`, class: 'ap-pane', role: 'region', 'aria-labelledby': `ap-bar-${id}` }); pane.hidden = true;
    const likely = mk('button', { type: 'button', class: 'ap-likely', 'data-likely': id }); likely.hidden = true;
    const sec = mk('section', { class: 'ap-sec', 'data-sec': id }, mk('h3', { class: 'ap-h' }, bar), likely, pane); sec.hidden = true;
    secs[id] = sec; panes[id] = pane; bars[id] = bar; body.append(sec);
  }
  const LISTS = ['explore', 'attacks', 'spells', 'heal', 'move', 'defend', 'use', 'features', 'companions', 'rest', 'cost', 'items'];
  let picking = null;                                    // the Inventory, Heal or Use row whose potion is being given: { id, actor }
  let giving = null;                                     // the Give... button whose list of creatures is open: { id (of the act), actor }
  // The Cast section's sort (kept on this device) and filters (kept while the page is open, not between sessions).
  const sortNow = () => (SPELL_SORTS[prefs.get('hextable.spellSort')] ? prefs.get('hextable.spellSort') : 'level');
  let filters = noFilters(), filtersOpen = false, refocus = null;
  const rowOfId = (id) => Object.values(rowsBy).flat().find((x) => x?.id === id);

  const setHtml = (el, html) => { if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; } };

  // A bar opens its group; the open one closes by a second tap. `''` is "none open" (a choice: it stays), `null` is "not chosen yet" (the likeliest opens).
  function choose(id) {
    sel.tab = id;
    if (pref() === 'remember' && ctxNow && id) prefs.set('hextable.panelLast', { ...last(), [ctxNow.situation]: id });
    ctx.render();
  }
  body.addEventListener('click', (ev) => {
    const bar = ev.target.closest('.ap-bar');
    if (bar) { choose(openNow === bar.dataset.sec ? '' : bar.dataset.sec); bar.focus({ preventScroll: true }); return; }
    const lk = ev.target.closest('[data-likely]');
    if (lk) { const r = rowOfId(lk.dataset.rid); if (r) run(r); return; }
  });
  // A turn bar segment opens everything that costs it (Decision 4); a second tap closes it. Move and Reaction stand for their groups.
  $('c-res').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cost]'); if (!b) return;
    const k = b.dataset.cost, id = k === 'move' ? 'move' : k === 'reaction' ? 'reactions' : `cost:${k}`;
    if (!id.startsWith('cost:') && !groupsNow.some((g) => g.id === id)) return ctx.toast(k === 'move' ? 'Nothing you can do with your Move now.' : (reactionState(ctx.state(), ctx.state().entities[ctx.selected()], { dm: ctx.isDM() }).why || 'No Reaction to use now.'));
    choose(openNow === id ? '' : id);
  });

  // A tap on a row does what the same button of the bar did.
  function run(r) {
    const S = ctx.state(), e = S.entities[ctx.selected()];
    if (!e || ctx.skipping()) return;
    if (r.why) return ctx.toast(r.why);
    if (QUICK_KINDS.has(r.kind) && !r.armed && S.encounter) lastRun = { enc: S.encounter.id ?? null, ids: { ...(lastRun.enc === (S.encounter.id ?? null) ? lastRun.ids : {}), [e.id]: r.id } };      // what this creature used last in this fight (#717)
    switch (r.kind) {
      case 'send': case 'use': return ctx.act(r.send);
      case 'lead': return ctx.lead ? ctx.lead(e) : ctx.act(r.send);
      case 'formation': return ctx.formation?.(e);
      case 'item': {
        // A potion can be given to someone within reach: ask whom, unless there is only the drinker. Anything else is sent as it is.
        if (r.armed) return ctx.armItem(e, r, null, true);                                        // armed: a tap puts it down
        if (r.targets?.length || r.upTo > r.level) { picking = picking?.id === r.id ? null : { id: r.id, actor: e.id }; return ctx.render(); }
        return r.aimed ? ctx.armItem(e, r, null, false) : ctx.act(r.send);
      }
      case 'arm': return ctx.setMode(r.armed ? ctx.move : r.mode);
      case 'strike': return ctx.openAttack(e, r.attack);
      case 'spell': return ctx.castSpell(e, r.spell, r.armed);
      case 'meta': return ctx.metamagic?.(e)?.onClick();
      case 'chooser': return ctx.openFeature(e, r.feature);
      case 'comp': return ctx.comp?.run(e, r);
      case 'fly': return ctx.fly(e, r.delta);
      case 'flyOpen': return ctx.flyOpen?.(e, r.armed, !!r.list);
      case 'follow': if (r.armed) { ctx.setMode(ctx.move); return ctx.act(r.send); } return ctx.setMode({ kind: 'follow' });
      case 'ritual': return ctx.castSpell(e, r.spell, r.armed);
      case 'shortRest': return ctx.shortRest();
      case 'check': return ctx.openSheet();
      default: return;
    }
  }
  for (const id of LISTS) {
    panes[id].addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-row]'); if (!b) return;
      const r = (rowsBy[id] ?? []).find((x) => x.id === b.dataset.row); if (r) run(r);
    });
  }
  for (const id of ['features', 'move', 'attacks', 'companions']) ctx.comp?.bindPane(panes[id]);
  // The Inventory's own controls: whom a potion is for, and the equip and attune buttons of a piece of gear (a use row goes through `run`).
  body.addEventListener('click', (ev) => {   // the pickers and the gear buttons can be in the Heal, Use and Inventory sections
    const S = ctx.state(), e = S.entities[ctx.selected()];
    const pick = ev.target.closest('[data-pick], [data-pick-cancel]');          // data-pick-cancel also closes the level chooser
    if (pick && e && !ctx.skipping()) {
      const r = picking && rowOfId(picking.id);
      if (pick.dataset.pickCancel !== undefined || !r) { picking = null; return ctx.render(); }
      const who = pick.dataset.pick; picking = null;
      ctx.act(who === 'self' ? r.send : { ...r.send, target: who });
      return ctx.render();
    }
    const lv = ev.target.closest('[data-lvl]');
    if (lv && e && !ctx.skipping()) {
      const r = picking && rowOfId(picking.id), level = Number(lv.dataset.lvl); picking = null;
      if (!r) return ctx.render();
      if (r.aimed) return ctx.armItem(e, r, level, false);
      return ctx.act(level > r.level ? { ...r.send, level } : r.send);
    }
    const to = ev.target.closest('[data-give-to], [data-give-cancel]');
    if (to) {
      const a = giving && giving.actor === e?.id && (rowsBy.itemsGear ?? []).find((x) => x.id === giving.id);
      if (!e || ctx.skipping()) return;
      if (to.dataset.giveCancel !== undefined || !a) { giving = null; return ctx.render(); }
      const t = (rowsBy.itemsTargets ?? []).find((x) => x.id === to.dataset.giveTo);         // only a creature the engine offered; a greyed one says why
      if (!t) { giving = null; return ctx.render(); }
      if (t.why) return ctx.toast(t.why);
      giving = null; ctx.act({ type: 'pass', actor: e.id, item: a.give.item, to: t.id });
      return ctx.render();
    }
    const g = ev.target.closest('[data-gact]');
    if (g) {
      const a = (rowsBy.itemsGear ?? []).find((x) => x.id === g.dataset.gact);
      if (a && e && !ctx.skipping()) {
        if (a.why) return ctx.toast(a.why);
        if (a.give) { giving = giving?.id === a.id ? null : { id: a.id, actor: e.id }; picking = null; return ctx.render(); }
        giving = null; ctx.act(a.send);
      }
      return;
    }
  });
  // The Spells tab's own controls: the sort, the filters, and Clear. A chip is `data-f="group:value"` (`conc`, `ritual` and `can` have no value).
  const keep = (sel) => { refocus = sel; ctx.render(); const b = refocus && panes.spells.querySelector(refocus); refocus = null; b?.focus({ preventScroll: true }); };
  panes.spells.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-f], [data-filters], [data-clear]'); if (!c) return;
    if (c.dataset.filters !== undefined) { filtersOpen = !filtersOpen; return keep('[data-filters]'); }
    if (c.dataset.clear !== undefined) { filters = noFilters(); return keep('[data-filters]'); }
    const [g, v] = c.dataset.f.split(':');
    if (v === undefined) filters[g] = !filters[g];
    else filters[g] = filters[g].includes(v) ? filters[g].filter((x) => x !== v) : [...filters[g], v];
    keep(`[data-f="${CSS.escape(c.dataset.f)}"]`);
  });
  panes.spells.addEventListener('change', (ev) => { if (ev.target.matches('[data-sort]')) { prefs.set('hextable.spellSort', ev.target.value); keep('[data-sort]'); } });
  panes.explore.addEventListener('toggle', (ev) => { if (ev.target.matches('details.ap-more')) moreOpen = ev.target.open; }, true);

  const pipDots = (p) => (p.max <= 8 ? `<span class="pips" aria-hidden="true">${'●'.repeat(Math.max(0, Math.min(p.left, p.max)))}${'○'.repeat(Math.max(0, p.max - p.left))}</span> ` : '');
  const pipsHtml = (p) => (p ? `<small class="ap-pips">${pipDots(p)}<b>${p.left} / ${p.max}${p.unit ? ` ${esc(p.unit)}` : ''}</b>${p.text ? ` · ${esc(p.text)}` : ''}</small>` : '');
  // A spell's roll as a tag the size of its level, in words and in a shape of its own (never colour alone): Attack, DEX save, No roll.
  const rollTagHtml = (roll) => (rollLabel(roll) ? `<span class="ap-roll" data-roll="${roll === 'attack' || roll === 'none' ? roll : 'save'}">${esc(rollLabel(roll))}</span> ` : '');
  const rowHtml = (r) => {
    const wid = `ap-w-${esc(r.id).replace(/[^\w-]/g, '_')}`, tag = r.kind === 'none' && !r.why ? 'div' : 'button';
    return `<${tag}${tag === 'button' ? ' type="button"' : ''} class="ap-row${r.armed ? ' armed' : ''}${r.why ? ' off' : ''}${tag === 'div' ? ' info' : ''}" data-row="${esc(r.id)}"${r.spell && SPELLS[r.spell] ? spellAttrs(r.spell) : ''}${tag === 'button' ? ` aria-disabled="${r.why ? 'true' : 'false'}"` : ''}${r.why ? ` aria-describedby="${wid}"` : ''}>
    <span class="ap-top"><span class="ap-t">${esc(r.label)}</span>${r.chip ? `<span class="ap-chip">${esc(r.chip)}</span>` : ''}</span>${r.sub || rollLabel(r.roll) ? `<small class="ap-s">${rollTagHtml(r.roll)}${esc(r.sub ?? '')}</small>` : ''}${pipsHtml(r.pips)}${r.why ? `<small class="ap-why" id="${wid}">${esc(r.why)}</small>` : ''}</${tag}>`;
  };
  const rowsHtml = (list) => list.map((r) => { const on = r.kind === 'item' && picking?.id === r.id; return rowHtml(on ? { ...r, armed: true } : r) + (on ? picker(r, curE) : ''); }).join('');
  const listHtml = (head, list) => `${head}<div class="ap-list">${rowsHtml(list)}</div>`;
  // The Move tab's meter: the Speed left this turn.
  const moveHead = (S, e) => {
    const m = moveBudget(S, e); if (!m) return '';
    return `<div class="ap-speed"><span>Speed left <b>${m.left} ft</b>${m.max > m.left ? ` of ${m.max}` : ''}</span><span class="ap-meter" role="presentation"><i style="width:${m.max ? Math.round((m.left / m.max) * 100) : 0}%"></i></span></div>${m.prone ? '<p class="ap-why-line">Prone. You stand at the start of your turn, using half your Speed.</p>' : ''}`;
  };
  const levels = (r) => `<div class="ap-pick" role="group" aria-label="Cast at which level?"><span>Cast at level</span>${Array.from({ length: r.upTo - r.level + 1 }, (_, i) => r.level + i).map((l) =>
      `<button type="button" data-lvl="${l}">${l}${l > r.level ? ` (${r.cost + l - r.level} charges)` : ''}</button>`).join('')}<button type="button" data-pick-cancel>Cancel</button></div>`;
  const picker = (r, e) => r.upTo > r.level && !r.targets.length ? levels(r) : `<div class="ap-pick" role="group" aria-label="Who is it for?"><span>Give it to</span><button type="button" data-pick="self">${esc(e.name)}</button>${
      r.targets.map((t) => `<button type="button" data-pick="${esc(t.id)}">${esc(t.name)}${t.down ? ' (down)' : ''}</button>`).join('')}<button type="button" data-pick-cancel>Cancel</button></div>`;
  const exploreHtml = (list) => `<div class="ap-grid">${list.filter((r) => r.grid).map(rowHtml).join('')}</div>${list.some((r) => !r.grid) ? `<details class="ap-more"${moreOpen ? ' open' : ''}><summary>More</summary><div class="ap-list">${list.filter((r) => !r.grid).map(rowHtml).join('')}</div></details>` : ''}`;

  // The Spells tab: the slot strip (always there, whatever the sort), the sort and filters, Metamagic, then the spells in groups.
  const slotsHtml = (e) => {
    const strip = slotStrip(e);
    return strip.length ? `<div class="ap-slots" role="group" aria-label="Spell slots">${strip.map((t) => `<span class="ap-slot${t.left ? '' : ' spent'}"><b>${esc(t.label)}</b> <span class="pips" aria-hidden="true">${'●'.repeat(Math.max(0, Math.min(t.left, t.max)))}${'○'.repeat(Math.max(0, t.max - t.left))}</span><span class="sr-only"> ${t.left} of ${t.max} left</span></span>`).join('')}</div>` : '';
  };
  const chip = (f, label, on) => `<button type="button" class="ap-fchip" data-f="${esc(f)}" aria-pressed="${on}">${esc(label)}</button>`;
  const toolbarHtml = () => {
    const n = filtersOn(filters), sort = sortNow();
    const panel = !filtersOpen ? '' : `<div class="ap-filters">
      <span class="ap-fgroup" role="group" aria-label="Casting time">${SPELL_CASTS.map((c) => chip(`cast:${c}`, c, filters.cast.includes(c))).join('')}</span>
      <span class="ap-fgroup" role="group" aria-label="Level">${chip('level:cantrip', 'Cantrips', filters.level.includes('cantrip'))}${chip('level:prepared', 'Prepared', filters.level.includes('prepared'))}</span>
      <span class="ap-fgroup" role="group" aria-label="Kind">${SPELL_KIND_CHIPS.map((k) => chip(`kind:${k}`, k[0].toUpperCase() + k.slice(1), filters.kind.includes(k))).join('')}</span>
      <span class="ap-fgroup" role="group" aria-label="Other">${chip('conc', 'Concentration', filters.conc)}${chip('ritual', 'Ritual', filters.ritual)}${chip('can', 'Can cast now', filters.can)}</span></div>`;
    const bar = `<div class="ap-tools"><label>Sort <select data-sort>${Object.entries(SPELL_SORTS).map(([k, v]) => `<option value="${k}"${k === sort ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <button type="button" data-filters aria-expanded="${filtersOpen}">Filters${n ? ` (${n})` : ''} ${filtersOpen ? '▴' : '▾'}</button>${n ? '<button type="button" data-clear>Clear</button>' : ''}</div>`;
    return { bar, panel };
  };
  function spellsPane(S, e, mode, fight) {
    const all = spellRows(S, e, { mode }), shown = filterSpells(all, filters).filter(fight ? offered : () => true), groups = sortSpells(shown, sortNow()), meta = ctx.metamagic?.(e);
    const metaRow = meta ? { id: 'metamagic', kind: 'meta', label: meta.label, sub: meta.sub, why: meta.why, armed: /\barmed\b/.test(meta.cls ?? ''), chip: 'Cast with' } : null;
    rowsBy.spells = [...(metaRow ? [metaRow] : []), ...shown];
    const kindOn = filters.kind.length > 0;
    const mark = (r) => (kindOn && !r.kinds.length ? { ...r, sub: `${r.sub} · kind not known` } : r);
    const tb = toolbarHtml();
    setHtml(panes.spells, `<div class="ap-spellhead">${slotsHtml(e)}${tb.bar}</div>${tb.panel}${metaRow ? `<div class="ap-list">${rowHtml(metaRow)}</div>` : ''}${
      groups.map((g) => `${g.head ? `<h4 class="ap-head">${esc(g.head)}</h4>` : ''}<div class="ap-list">${g.rows.map((r) => rowHtml(mark(r))).join('')}</div>`).join('')}${
      all.length && !shown.length ? `<p class="ap-why-line">${fight ? 'No spell can be cast now.' : 'No spell matches these filters.'}</p>` : ''}`);
  }

  // The Items tab: what can be used (greyed with the engine's reason), what is carried and how, the light.
  function itemsPane(S, e, it, fight) {
    // In a fight only what can be done now is shown: a use that is greyed, a button that is greyed, a thing that is only carried (nothing to do with it now) are left out.
    if (fight) {
      it = { ...it, uses: it.uses.filter(offered), light: it.light && offered(it.light) ? it.light : null,
        gear: it.gear.map((g) => ({ ...g, acts: g.acts.filter((a) => !a.why) })).filter((g) => g.acts.length),
        names: it.names.map((n) => ({ ...n, acts: n.acts.filter((a) => !a.why) })).filter((n) => n.acts.length),
        ground: it.ground.map((p) => ({ ...p, things: p.things.filter((x) => !x.why), all: p.all && !p.all.why ? p.all : null })).filter((p) => p.things.length) };
      it.any = it.gear.length > 0 || it.names.length > 0 || it.ground.length > 0 || !!it.light;
    }
    const lightList = it.light ? [it.light] : [];
    const groundActs = it.ground.flatMap((p) => [...p.things, ...(p.all ? [p.all] : [])]);
    const acts = [...it.gear.flatMap((g) => g.acts), ...it.names.flatMap((n) => n.acts), ...groundActs];
    rowsBy.items = [...it.uses, ...lightList]; rowsBy.itemsGear = acts; rowsBy.itemsTargets = it.targets;
    if (giving && (giving.actor !== e.id || !acts.some((a) => a.id === giving.id && a.give && !a.why))) giving = null;
    const wid = (a) => `ap-w-${esc(a.id).replace(/[^\w-]/g, '_')}`;
    const btn = (a, did = wid(a)) => `<button type="button" data-gact="${esc(a.id)}" aria-disabled="${a.why ? 'true' : 'false'}"${a.why ? ` aria-describedby="${did}" class="off"` : ''}${a.give ? ` aria-expanded="${giving?.id === a.id}"` : ''}>${esc(a.label)}</button>`;
    const why = (list) => list.filter((a) => a.why).map((a) => `<small class="ap-why" id="${wid(a)}">${esc(a.why)}</small>`).join('');
    const timeLine = it.time && TIME_WORDS[it.time] ? `<small class="ap-s">${esc(TIME_WORDS[it.time])}</small>` : '';
    const givePick = (a) => giving?.id === a.id ? `<div class="ap-pick" role="group" aria-label="Who gets it?"><span>Hand it to</span>${it.targets.map((t) =>
      `<button type="button" data-give-to="${esc(t.id)}" aria-disabled="${t.why ? 'true' : 'false'}"${t.why ? ' class="off"' : ''}>${esc(t.name)}${t.why ? `<small class="ap-why"> ${esc(t.why)}</small>` : ''}</button>`).join('')}<button type="button" data-give-cancel>Cancel</button></div>` : '';
    const carriedRow = (key, label, sub, list, note) => `<div class="ap-row ap-gear info" data-gear="${esc(key)}"><span class="ap-top"><span class="ap-t">${esc(label)}</span></span>${sub ? `<small class="ap-s">${esc(sub)}</small>` : ''}${
      list.length ? `<span class="ap-acts">${list.map(btn).join('')}</span>${timeLine}${why(list)}${list.map(givePick).join('')}` : ''}${note ? `<small class="ap-why">${esc(note)}</small>` : ''}</div>`;
    const uses = it.uses.map((r) => { const on = picking?.id === r.id; return rowHtml(on ? { ...r, armed: true } : r) + (on ? picker(r, e) : ''); }).join('');
    const gear = it.gear.map((g) => carriedRow(g.key, g.label, g.sub, g.acts, g.note)).join('');
    const names = it.names.map((n) => carriedRow(n.id, n.label, n.count > 1 ? `x${n.count}` : '', n.acts, '')).join('');
    const ground = it.ground.map((p) => `<div class="ap-row ap-gear info" data-pile="${esc(p.object)}"><span class="ap-top"><span class="ap-t">${esc(p.label)}</span>${p.unseen ? '<span class="ap-chip">Not seen by the players</span>' : ''}</span>${
      p.things.map((x) => `<span class="ap-line"><span>${esc(x.label)}</span>${btn({ ...x, label: 'Pick up' }, wid(p.things[0]))}</span>`).join('')}${p.all ? `<span class="ap-acts">${btn(p.all, wid(p.things[0]))}</span>` : ''}${timeLine}${why(p.things.slice(0, 1))}</div>`).join('');
    setHtml(panes.items, `${it.uses.length ? `<h4 class="ap-head">Use</h4><div class="ap-list">${uses}</div>` : ''}${gear || names ? `<h4 class="ap-head">Carried</h4><div class="ap-list">${gear}${names}</div>` : ''}${
      ground ? `<h4 class="ap-head">On the ground here</h4><div class="ap-list">${ground}</div>` : ''}${
      lightList.length ? `<h4 class="ap-head">Light</h4><div class="ap-list">${lightList.map(rowHtml).join('')}</div>` : ''}${!it.any ? `<p class="ap-why-line">${fight ? 'Nothing to do with what you carry now.' : 'Nothing carried.'}</p>` : ''}`);
  }

  function reactionsPane(S, e, r) {
    const el = panes.reactions;
    const html = `${r.pending ? '<p class="ap-q" role="status">A question is waiting.</p>' : ''}${!r.ok ? `<p class="ap-why-line">${esc(r.why)}</p>` : ''}${reactionsHtml(S, e, { panel: true })}`;
    if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; bindReactions(el, e, ctx.act); }
  }
  function downPane(S, e) {
    const k = e.dead ? null : howItEnds(S, e, 'dying');
    setHtml(panes.down, e.dead ? `<p class="ap-why-line">${esc(e.name)} is dead.</p>` : k ? `<p class="ap-why-line"><b>${esc(k.title)}.</b> ${k.lines.map(esc).join(' ')}</p>` : '');
  }

  function renderHow(S, e) {
    const k = howKey && howItEnds(S, e, howKey, { mine: ctx.mine(e) });
    if (!k) { howKey = null; how.hidden = true; how.textContent = ''; for (const b of $('c-res').querySelectorAll('[aria-expanded="true"]')) b.setAttribute('aria-expanded', 'false'); return; }
    how.hidden = false;
    const html = `<b>${esc(k.title)}</b>${k.lines.map((l) => `<p>${esc(l)}</p>`).join('')}<span class="row">${k.end ? `<button type="button" data-end="${esc(k.end)}">End it</button>` : ''}<button type="button" data-close="1">Close</button></span>`;
    setHtml(how, html);
    for (const b of $('c-res').querySelectorAll('[data-how]')) b.setAttribute('aria-expanded', String(b.dataset.how === howKey));
  }
  $('c-res').addEventListener('click', (ev) => { const b = ev.target.closest('[data-how]'); if (b) { howKey = howKey === b.dataset.how ? null : b.dataset.how; ctx.render(); } });
  how.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.end) { ctx.act({ type: 'endEffect', effect: b.dataset.end }); howKey = null; }
    else howKey = null;
    ctx.render();
  });


  // The Settings tab's choice of how the panel picks its section.
  const pick = $('set-paneltab');
  if (pick) { pick.value = pref(); pick.onchange = () => { prefs.set('hextable.panelTab', pick.value); sel = { key: '', tab: null }; ctx.render(); }; }

  // The list of one group, as HTML: the move meter and the companions' picker above it where they belong.
  function groupPane(S, e, id, list, mode) {
    let head = '';
    if (id === 'move') head = moveHead(S, e);
    if (id === 'move' || id === 'attacks' || id === 'companions') head += ctx.comp?.picker(e) ?? '';
    if (id === 'heal' && !list.length) head += `<p class="ap-why-line">${esc(`${e.name} has no healing spell or item.`)}</p>`;
    rowsBy[id] = list;
    setHtml(panes[id], listHtml(head, list));
    ctx.comp?.after(panes[id]);
  }

  return {
    // Events of an update: a `noticed` or `triggered` one moves Search up for the next two updates.
    updated(events) { found = [events.some((ev) => ev.type === 'noticed' || ev.type === 'triggered'), found[0]]; },
    // The quick actions of the turn line (#717): the rows for the selected creature as last drawn, and a tap on one.
    quick: () => quickNow.map((r) => ({ id: r.id, label: r.label, sub: r.sub ?? '', armed: !!r.armed })),
    runQuick(id) { const r = quickNow.find((x) => x.id === id); if (r) run(r); },
    fresh() { lastRun = { enc: null, ids: {} }; quickNow = []; found = [false, false]; sel = { key: '', tab: null }; howKey = null; picking = null; giving = null; },
    // Draws the status block and the groups for `e` (or hides them). `mode` is app.js's current mode. Returns the open group.
    render(e, mode, { my, full }) {
      const S = ctx.state(), enc = S.encounter, cur = current(S);
      card.hidden = !e; $('status-block').hidden = !e; quickNow = [];
      // The sheet is the page's last section while a creature is selected; with none, its words ("Select one of the characters") stand alone on the page.
      const page = $('sheet'), sheetBody = $('sheet-body');
      if (!e) { if (sheetBody.parentElement !== page) page.append(sheetBody); page.classList.remove('pin'); return null; }
      if (sheetBody.parentElement !== panes.sheet) panes.sheet.append(sheetBody);
      curE = e;
      $('c-name').textContent = shownName(S, e);
      $('c-sub').textContent = e.bond && ctx.comp?.subLine(e) ? `${e.bond.kind[0].toUpperCase()}${e.bond.kind.slice(1)} · ${ctx.comp.subLine(e)}` : e.bond ? `${e.bond.kind[0].toUpperCase()}${e.bond.kind.slice(1)}${MONSTERS[e.tpl] ? ` · ${MONSTERS[e.tpl].name}` : ''}` : e.kind === 'pc' ? `Level ${e.level} ${classTitle(e)}${e.ownerName ? ` · ${e.ownerName}` : ''}` : MONSTERS[e.tpl]?.name ?? 'Creature';
      $('c-hp').querySelector('i').style.width = `${ctx.hpFraction(e) * 100}%`;
      const showNumbers = full && (my || e.side === 'party');
      const noHealth = !showNumbers && !ctx.isDM() && S.settings?.foeHealth === 'hidden';      // Decision 7a: under Hidden a player's card for a foe says nothing of its health
      $('c-hp').hidden = noHealth;
      const looks = e.health ?? (e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy');
      $('c-hp-text').textContent = showNumbers ? `${e.hp} / ${e.maxHp} HP${e.tempHp > 0 ? ` +${e.tempHp} temp` : ''}` : { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' }[looks];
      if (noHealth) $('c-hp-text').textContent = '';
      $('c-ac').textContent = showNumbers ? `AC ${acShown(S, e, ctx.isDM()).ac}` : '';
      setHtml($('c-level'), showNumbers && e.kind === 'pc' ? levelUpChip(S, e, { dm: ctx.isDM() }) : '');      // XP reached the next level: Level up (the DM), or why not (#672)
      $('c-end').hidden = !(my && enc && cur === e.id);      // the turn line's own End turn (`#btn-end`, app.js) follows the same rule
      // A companion's player may hand its turns to the engine's companion brain (companions.md, Decision 9): { type: 'companion', actor, auto }.
      let letIt = $('btn-let');
      if (!letIt) {
        letIt = document.createElement('label'); letIt.id = 'btn-let'; letIt.className = 'check'; letIt.style.cssText = 'margin:0;white-space:nowrap;font-size:.85em'; letIt.innerHTML = '<input type="checkbox"> Let it act';
        letIt.querySelector('input').onchange = (ev) => { const id = letIt.dataset.id; if (id) ctx.act({ type: 'companion', actor: id, auto: ev.target.checked }); };
        $('c-row').prepend(letIt);
      }
      letIt.hidden = !(my && e.bond); letIt.dataset.id = e.id; letIt.querySelector('input').checked = !!e.bond?.auto;
      { const why = my && e.bond ? ctx.dry?.({ type: 'companion', actor: e.id, auto: !e.bond.auto }) ?? '' : ''; letIt.querySelector('input').disabled = !!why; letIt.title = why; letIt.classList.toggle('off', !!why); }
      const myTurn = !!enc && cur === e.id && up(e);


      const dm = ctx.isDM(), fight = !!enc && inFight(S, e.id);
      ctxNow = panelContext(S, e, { mine: my, dm });
      const fly = ctx.flyInfo(e), comp = my ? ctx.comp?.rows(e) ?? null : null, meta = my ? ctx.metamagic?.(e) ?? null : null;
      const inv = itemRows(S, e, { dm, mode });
      if (picking && (picking.actor !== e.id || !inv.uses.some((r) => r.id === picking.id && !r.why && (r.targets.length || r.upTo > r.level)))) picking = null;
      const react = reactionState(S, e, { dm });
      const G = groupsFor(S, e, ctxNow, { mode, fly, dm, found: found[0] || found[1], comp, inv, meta, react });
      groupsNow = G.shown;
      const key = `${e.id}|${ctxNow.situation}|${enc ? `${enc.round}:${enc.turn}` : ''}|${react.pending ? 'q' : ''}`;
      // The quick actions (#717). Their order is settled when the turn starts (what was used last comes first) and holds for the turn: a row does not move from under the finger when it arms.
      if (sel.key !== key) quickLast = enc && lastRun.enc === (enc.id ?? null) ? lastRun.ids[e.id] ?? null : null;
      quickNow = my && enc && cur === e.id ? quickRows(G, { last: quickLast }) : [];
      if (sel.key !== key) sel = { key, tab: null };
      // #750 part 2: the choices an armed action waits for. When they first appear the section that holds the armed row opens (the one already open if it holds it); they are drawn at its top.
      const ch = my ? ctx.choices?.() ?? null : null;
      const armedIn = G.shown.filter((g) => g.rows.some((r) => r.armed)).map((g) => g.id), armedId = armedIn.includes(openNow) ? openNow : armedIn[0] ?? null;
      if (!ch) choiceSeen = ''; else if (ch.key !== choiceSeen) { choiceSeen = ch.key; if (armedId) sel.tab = armedId; }
      const kinds = G.shown;
      const costOk = (id) => /^cost:(action|bonus)$/.test(id) && G.fight && ctxNow.situation === 'turn';
      const wanted = sel.tab !== null && (sel.tab === '' || sel.tab === 'sheet' || costOk(sel.tab) || kinds.some((g) => g.id === sel.tab)) ? sel.tab : null;
      // A creature with nothing to do here (someone else's, a foe looked at) opens on its sheet: it is the only section it has.
      let tab = wanted ?? (!kinds.length && !G.empty && ctxNow.situation !== 'down' ? 'sheet' : ctxNow.situation === 'wait' && kinds.some((g) => g.id === 'reactions') ? 'reactions' : defaultTab(ctxNow, kinds, { pref: pref(), last: last() })) ?? '';
      if (ch && !tab) tab = armedId ?? kinds[0]?.id ?? 'sheet';      // the choices need a section to sit in: closing every section does not hide them
      openNow = tab;
      if (ctxNow.situation === 'turn' && tab && sel.tab === null) sel.tab = tab;       // the group a turn opens on stays for the turn: spending the last slot does not move it (opensOnSpells, from main)
      // the status block's turn bar says which segment is open
      setHtml($('c-res'), statusHtml(S, e, { mine: my, full, formLabel: ctx.formLabel(e), budget: !!enc && cur === e.id && up(e) && full ? ctx.budget(e) : null, open: openNow }));
      renderHow(S, e);

      // the bars: each group that is shown, in the state's order, with its tip; the open one shows its rows under it
      let order = 0;
      const sorted = [...kinds];
      const cost = /^cost:/.test(tab) ? tab.slice(5) : '';
      secs.cost.hidden = !cost; secs.cost.style.order = -1;
      if (cost) {
        bars.cost.querySelector('.ap-bt').textContent = `Costs your ${COSTS[cost]}`; bars.cost.querySelector('.ap-tip').textContent = '';
        bars.cost.setAttribute('aria-expanded', 'true'); panes.cost.hidden = false;
        let list = costRows(S, e, cost, G, { mode, fly });
        list = list.filter(offered);
        const b = bonusRows(S, e, { mode, fly });
        rowsBy.cost = list;
        setHtml(panes.cost, listHtml(list.length ? '' : `<p class="ap-why-line">${esc(cost === 'bonus' && !b.available ? `No Bonus Action: ${b.why}` : `Nothing you can do now costs your ${COSTS[cost]}.`)}</p>`, list));
      } else { panes.cost.hidden = true; bars.cost.setAttribute('aria-expanded', 'false'); }
      const first = ctxNow.situation === 'turn' ? sorted[0] : null;
      for (const id of Object.keys(secs)) {
        if (id === 'cost') continue;
        if (id === 'sheet') {
          secs.sheet.hidden = false; secs.sheet.style.order = 99;
          const bt = bars.sheet.querySelector('.ap-bt'), tp = bars.sheet.querySelector('.ap-tip');
          if (bt.textContent !== 'Sheet') { bt.textContent = 'Sheet'; tp.textContent = 'Abilities, features, spells, story'; }
          bars.sheet.setAttribute('aria-expanded', String(tab === 'sheet')); panes.sheet.hidden = tab !== 'sheet';
          continue;
        }
        const g = G.groups.find((x) => x.id === id), on = !!g?.shown;
        secs[id].hidden = !on;
        if (!on) { bars[id].setAttribute('aria-expanded', 'false'); panes[id].hidden = true; if (panes[id].dataset.sig) setHtml(panes[id], ''); continue; }      // a group that is gone leaves nothing behind
        secs[id].style.order = sorted.indexOf(g);
        const bt = bars[id].querySelector('.ap-bt'), tp = bars[id].querySelector('.ap-tip');
        if (bt.textContent !== g.label) bt.textContent = g.label;
        const tip = g.tip ?? '';
        if (tp.textContent !== tip) tp.textContent = tip;
        const isOpen = id === tab;
        bars[id].setAttribute('aria-expanded', String(isOpen)); bars[id].classList.toggle('off', !G.fight && (g.rows.length ? g.rows.every((r) => r.why) : !!g.why));
        panes[id].hidden = !isOpen;
        rowsBy[id] = g.offered;
        // The likeliest row, inline, on my turn: the first group's first usable row (it replaces the old choice of a tab)
        const lk = secs[id].querySelector('.ap-likely'), top = g === first && !isOpen ? g.offered.find((r) => !r.why && r.kind !== 'none') : null;
        lk.hidden = !top;
        if (top) { lk.dataset.rid = top.id; const t = `${top.label}${top.sub ? ` · ${top.sub}` : ''}`; if (lk.textContent !== t) lk.textContent = t; lk.setAttribute('aria-label', `${g.label}: ${top.label}`); }
        order++;
        if (!isOpen) { if (panes[id].dataset.sig) setHtml(panes[id], ''); continue; }
        if (id === 'explore') { rowsBy.explore = g.rows; setHtml(panes.explore, exploreHtml(g.rows)); }
        else if (id === 'spells') spellsPane(S, e, mode, G.fight);
        else if (id === 'items') { rowsBy.items = [...inv.uses.filter((r) => !G.fight || offered(r)), ...(inv.light && (!G.fight || offered(inv.light)) ? [inv.light] : [])]; itemsPane(S, e, inv, G.fight); }
        else if (id === 'reactions') reactionsPane(S, e, react);
        else groupPane(S, e, id, g.offered, mode);
      }
      // a creature that is down: the words, and no groups (R29, Decision 7)
      panes.down.hidden = ctxNow.situation !== 'down';
      if (ctxNow.situation === 'down') downPane(S, e);
      // a fight with nothing to do: one line, the engine's reason
      const empty = G.empty && ctxNow.situation !== 'down';
      noteEl.hidden = !empty; if (empty && noteEl.textContent !== G.empty) noteEl.textContent = G.empty;
      { const host = ch && tab ? panes[cost ? 'cost' : tab] : null;
        choicesEl.hidden = !host;
        if (host) { setHtml(choicesEl, choicesHtml(ch)); if (host.firstChild !== choicesEl) host.prepend(choicesEl); }
        else if (choicesEl.isConnected) choicesEl.remove(); }
      body.hidden = false;
      // Where each bar goes (accordion.js): with a section open, the bars before it fill the rows above it and those after it the rows below, side by side.
      const openId = cost ? 'cost' : tab, ids = [...(cost ? ['cost'] : []), ...sorted.map((g) => g.id), 'sheet'];
      const plan = gridPlan(ids, openId);
      for (const id of Object.keys(secs)) { const sp = `span ${plan.span[id] ?? 6}`; if (secs[id].style.gridColumn !== sp) secs[id].style.gridColumn = sp; secs[id].classList.toggle('open', plan.pinned && id === openId); }
      const lead = (noteEl.hidden ? 0 : 1) + (panes.down.hidden ? 0 : 1);
      const rowsCss = plan.pinned ? [...Array(lead).fill('auto'), ...plan.rows.map((r) => (r === 'open' ? 'minmax(164px, 1fr)' : 'auto'))].join(' ') : '';
      if (body.style.gridTemplateRows !== rowsCss) body.style.gridTemplateRows = rowsCss;
      page.classList.toggle('pin', plan.pinned);
      body.dataset.open = tab && !cost ? tab : cost ? 'cost' : '';
      body.toggleAttribute('data-open-any', !!tab);
      card.dataset.tab = tab ?? '';
      card.dataset.situation = ctxNow.situation;
      if (tab && !cost && picking) panes[tab]?.querySelector('.ap-pick')?.focus?.({ preventScroll: true });
      return tab;
    },
    get tab() { return openNow || card.dataset.tab; },
    choose,
  };
}
