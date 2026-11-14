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
import { inFight, current, up, blocked, targetsFor, usesFor, itemUsesFor, hideProblem, passTargets, pickUpsFor, interactionOf, checkBonus, clockText, mod, aloft, FT, fromPool, attacksLeft, actionSpent } from './shared/engine.js';
import { actionProfile } from './shared/effects.js';
import { heldItems, itemName, attuneMax, attuneProblem } from './shared/derive.js';
import { LIGHTS } from './shared/content/lights.js';
import { reactionsOf, canReact, WHEN } from './shared/reactions.js';
import { conditionName, conditionDef } from './shared/modifiers.js';
import { SPELLS, MONSTERS } from './shared/content/index.js';
import { lightAt } from './shared/sight.js';
import { under } from './shared/space.js';
import { reactionsHtml, bindReactions, reactionRows } from './reactionsheet.js';
import { featureRows as baseFeatureRows, CHIP } from './features.js';
import { strikeChoices } from './classes.js';

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
// Returns { situation, tabs: [{ id, label, built, ... }], default } with every tab the spec names; the shell draws the built ones.
export function panelContext(S, e, { mine = true, dm = false } = {}) {
  if (!e) return { situation: 'none', tabs: [], default: null };
  const tab = (id, extra = {}) => ({ id, label: TAB_LABEL[id], built: BUILT.has(id), ...extra });
  if (!mine) return { situation: 'watch', tabs: [], default: null };
  if (e.dead || !up(e)) return { situation: 'down', tabs: [tab('down')], default: 'down' };
  const fight = !!S.encounter && inFight(S, e.id);
  if (!fight) return { situation: 'explore', tabs: ['explore', 'spells', 'features', 'items'].map((id) => tab(id)), default: 'explore' };
  if (current(S) === e.id) {
    const armed = !!(e.attacks?.length || e.actions?.length);
    return { situation: 'turn', tabs: ['attacks', 'spells', 'bonus', 'move', 'features', 'items'].map((id) => tab(id)), default: armed ? 'attacks' : 'spells' };
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
  return blocked(S, e, sp.time) || (sp.level > 0 && !(e.slots[sp.level] > 0) && `${e.name} has no level ${sp.level} spell slots left.`) ||
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
  // 2. Following. "Lead the party" is the DM's (`partyFollow` is DM only): a player is not shown it.
  const follows = [];
  if (!inFight(S, e.id) && e.side === 'party') {
    const leader = e.follow && S.entities[e.follow];
    if (leader) follows.push(row({ id: 'stopFollow', kind: 'send', label: 'Stop following', sub: `Following ${leader.name}`, send: { type: 'follow', actor: e.id, leader: null } }));
    else {
      const armed = mode?.kind === 'follow', near = nearestAlly(S, e);
      follows.push(row({ id: 'follow', kind: 'follow', armed, label: armed ? 'Follow nearest' : 'Follow', sub: armed ? (near ? `${near.name} · or tap someone` : 'Tap a party member') : 'Walk behind someone',
        why: near ? '' : 'Nobody else in the party to follow.', send: near ? { type: 'follow', actor: e.id, leader: near.id } : null }));
    }
    if (dm && !enc) follows.push(row({ id: 'lead', kind: 'send', label: 'Lead the party', sub: 'Everyone follows; then tap where to go', send: { type: 'partyFollow', leader: e.id } }));
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
  const search = row({ id: 'search', kind: 'send', label: 'Search', sub: `${enc ? 'Action · ' : ''}Perception ${signed(checkBonus(e, { skill: 'perception' }))} · secret doors, traps, things hiding · 15 ft`,
    why: blocked(S, e, 'action'), send: { type: 'search', actor: e.id } });
  // 6. Light, when the party sees by light and it is not Bright here and this creature carries none.
  const dark = !e.light && dimHere(S, e) ? [row({ id: 'light', kind: 'send', label: 'Light a torch', sub: 'It is not bright here', why: dm ? '' : 'Only the DM hands out light.', send: { type: 'setLight', actor: e.id, item: 'torch' } })] : [];
  // 7. Hide, with the engine's reason when it cannot be done.
  const hideTime = e.features?.nimbleEscape ? 'bonus' : 'action';
  const hide = e.hiding ? row({ id: 'hide', kind: 'none', armed: true, label: 'Hidden', sub: `Stealth ${e.hiding.dc} to find`, why: 'Already hidden: an attack, a spoken spell or a noise gives it away.' })
    : row({ id: 'hide', kind: 'send', label: 'Hide', sub: `${enc ? (hideTime === 'bonus' ? 'Bonus · ' : 'Action · ') : ''}Stealth ${signed(checkBonus(e, { skill: 'stealth' }))} · DC 15`,
      why: (enc && inFight(S, e.id) ? blocked(S, e, hideTime) : '') || hideProblem(S, e), send: { type: 'hide', actor: e.id } });
  // 8. Rituals: cast like any spell today (ritual casting is an engine item, E15).
  const rituals = (e.spells ?? []).filter((id) => SPELLS[id]?.def.ritual).map((id) => {
    const sp = SPELLS[id], armed = mode?.kind === 'spell' && mode.id === id;
    return row({ id: `ritual:${id}`, kind: 'ritual', spell: id, armed, label: sp.name, sub: `Ritual · ${sp.level ? 'Slot' : 'Cantrip'}`, why: spellWhy(S, e, sp) });
  });
  // 9. A check, from the sheet's skills.
  const check = row({ id: 'check', kind: 'check', label: 'Check…', sub: 'Skills, on the sheet' });

  const head = [...objects], tail = [...dark, hide, ...rituals, check];
  const base = [...follows, ...aid, ...(weary ? rests : [])];
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
  const what = ch.brutal && ch.cunning ? `${ch.brutal.name} or ${ch.cunning.name}` : (ch.brutal ?? ch.cunning).name;
  const bits = [ch.brutal ? `${ch.brutal.dice} more damage and an effect, no Advantage` : '', ch.cunning ? `${ch.cunning.dice} dice of Sneak Attack${ch.cunning.dice ? ' for effects' : ''}` : ''].filter(Boolean);
  const offered = [ch.brutal, ch.cunning].filter(Boolean), stuck = offered.every((o) => o.why);
  return { id: `strike:${a.id}`, kind: 'strike', attack: a.id, label: `${a.name} with ${what}`, sub: bits.join(' · '), chip: base.chip, time: base.time, armed: armedBy(mode, 'attack', a.id) && !!mode.extra,
    why: base.why || (stuck ? offered[0].why : '') };
}

// ---------- the Attacks, Bonus, Move and Features tabs (T4a) ----------
// Each returns rows of one shape: { id, kind, label, sub, why, chip, time, armed, ... }. `kind` says what a tap does: `send` (an action to send, `send`), `arm`
// (set the mode `mode`; a tap on the armed row puts it down again), `spell` (cast `spell`, or arm it), `chooser` (open the card of `feature`), `fly` (`delta` feet
// to the height the next move ends at) or `none` (nothing to tap). `why` is the engine's reason a row cannot be used now ('' if it can); the shell writes it on the
// row. `time` is what it costs ('action', 'bonus', 'reaction', 'free' or null) and `chip` its words. The Bonus tab is a filter on the others by `time`.
const armedBy = (mode, kind, id) => !!mode && mode.kind === kind && mode.id === id;

// Attacks: a character's `attacks`, or a monster's `actions` (Multiattack, recharge, uses a day).
export function attackRows(S, e, { mode = null } = {}) {
  const b = S.encounter?.budget, mineTurn = !!b && current(S) === e.id, rows = [];
  if (e.actions) {
    for (const def of e.actions) {
      const p = actionProfile(def), armed = armedBy(mode, 'action', def.id), time = p.time === 'bonus' ? 'bonus' : 'action';
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
  for (const a of e.attacks ?? []) {
    const armed = armedBy(mode, 'attack', a.id), flurry = !!b?.bonusAttacks && b.bonusAttacks.with === a.id && b.bonusAttacks.left > 0;
    const bonusTime = !flurry && a.time === 'bonus', pooled = mineTurn && !flurry && !bonusTime && !!b.attacks && fromPool(b, a.id);
    const time = flurry || pooled ? null : bonusTime ? 'bonus' : 'action';
    const reach = a.type === 'melee' ? `reach ${a.reach ?? 5} ft` : a.range ? `range ${a.range[0]}/${a.range[1]} ft` : '';
    const row = { id: `atk:${a.id}`, kind: 'arm', label: a.name, sub: [`${signed(a.bonus)} to hit`, `${a.damage} ${a.dtype}`, reach].filter(Boolean).join(' · '), why: blocked(S, e, time),
      chip: flurry ? 'Flurry' : pooled ? 'Extra Attack' : CHIP[time], time: flurry || pooled ? null : time, armed: armed && !mode.extra, arm: { kind: 'attack', id: a.id }, mode: { kind: 'attack', id: a.id } };
    rows.push(row);
    const strike = strikeRow(S, e, a, row, mode);
    if (strike) rows.push(strike);
  }
  return rows;
}

// The standard actions and the objects in reach, for the Move tab. `fly`: { aloft, alt } for a creature that can fly.
export function moveRows(S, e, { fly = null } = {}) {
  const enc = S.encounter, nimble = !!e.features?.nimbleEscape, rows = [], row = (r) => ({ sub: '', why: '', armed: false, std: true, ...r });
  rows.push(row({ id: 'dash', kind: 'send', label: 'Dash', sub: 'Double your move', chip: CHIP.action, time: 'action', why: blocked(S, e, 'action'), send: { type: 'dash', actor: e.id } }));
  const dt = nimble ? 'bonus' : 'action';
  rows.push(row({ id: 'disengage', kind: 'send', label: 'Disengage', sub: 'No Opportunity Attacks', chip: CHIP[dt], time: dt, why: blocked(S, e, dt), send: { type: 'disengage', actor: e.id } }));
  rows.push(row({ id: 'dodge', kind: 'send', label: 'Dodge', sub: 'Attackers roll with Disadvantage', chip: CHIP.action, time: 'action', why: blocked(S, e, 'action'), send: { type: 'dodge', actor: e.id } }));
  rows.push(hideRow(S, e, row));
  rows.push(row({ id: 'search', kind: 'send', label: 'Search', sub: `Perception ${signed(checkBonus(e, { skill: 'perception' }))} · secret doors, traps, things hiding · 15 ft`, chip: CHIP.action, time: 'action',
    why: blocked(S, e, 'action'), send: { type: 'search', actor: e.id } }));
  for (const u of usesFor(S, e)) rows.push(row({ id: `use:${u.object}:${u.verb}`, kind: 'send', label: u.label, sub: u.name, chip: u.time === 'free' ? 'Free once a turn' : CHIP.action, time: u.time === 'free' ? 'free' : 'action', why: u.why,
    send: { type: 'use', actor: e.id, object: u.object, verb: u.verb }, std: false }));
  if (fly?.aloft) {
    const alt = fly.alt;
    rows.push(row({ id: 'fly-up', kind: 'fly', label: 'Higher', sub: `Fly at ${alt + FT} ft`, delta: FT, time: null, std: false }));
    rows.push(row({ id: 'fly-down', kind: 'fly', label: alt ? 'Lower' : 'On the ground', sub: alt ? `Fly at ${alt - FT} ft${alt === FT ? ' (land)' : ''}` : 'Tap Higher to take off', delta: -FT, time: null, std: false, why: alt ? '' : 'Already as low as it goes.' }));
  }
  return rows;
}
const hideRow = (S, e, row = (r) => r) => {
  const enc = S.encounter, time = e.features?.nimbleEscape ? 'bonus' : 'action';
  return e.hiding ? row({ id: 'hide', kind: 'none', armed: true, label: 'Hidden', sub: `Stealth ${e.hiding.dc} to find`, why: 'Already hidden: an attack, a spoken spell or a noise gives it away.', time: null })
    : row({ id: 'hide', kind: 'send', label: 'Hide', sub: `Stealth ${signed(checkBonus(e, { skill: 'stealth' }))} · DC 15`, chip: CHIP[time], time, why: (enc && inFight(S, e.id) ? blocked(S, e, time) : '') || hideProblem(S, e), send: { type: 'hide', actor: e.id } });
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
  if (sp.aim !== 'creature' || !(sp.range > 0)) return '';
  try { return targetsFor(S, e, { spell: sp.id }).length ? '' : `Nobody within ${sp.range} ft.`; } catch { return ''; }
};
export function spellRow(S, e, id, { mode = null } = {}) {
  const sp = SPELLS[id], what = sp.heal ? `heal ${sp.heal.dice}${sp.heal.addMod ? signed(mod(e.abil[e.castAbil])) : ''}` : sp.short;
  const range = sp.aim === 'self' ? 'Self' : sp.range > 0 ? `${sp.range} ft` : '';
  return { id: `spell:${id}`, kind: 'spell', spell: id, label: sp.name, sub: [sp.level ? `Level ${sp.level}` : 'Cantrip', range, sp.def.concentration ? 'Concentration' : '', sp.def.ritual ? 'Ritual' : '', what].filter(Boolean).join(' · '),
    why: spellWhy(S, e, sp) || rangeWhy(S, e, sp), chip: CHIP[sp.time] && sp.time !== 'free' ? CHIP[sp.time] : (LONGER[sp.time] ?? sp.time), time: sp.time, armed: armedBy(mode, 'spell', id) && !mode.item,
    level: sp.level, school: sp.def.school ?? '', cast: castGroup(sp), conc: !!sp.def.concentration, ritual: !!sp.def.ritual, kinds: sp.kinds ?? [] };
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
  if (id === 'attacks') return attackRows(S, e, { mode });
  if (id === 'bonus') return bonusRows(S, e, { mode, fly }).rows;
  if (id === 'move') return moveRows(S, e, { fly });
  if (id === 'features') return featureRows(S, e, { mode });
  if (id === 'spells') return spellRows(S, e, { mode });
  return [];
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
    if (by.length) for (const fx of by) lines.push(`From ${fx.name}${untilText(S, fx) ? `: ${untilText(S, fx)}` : ''}.`);
    else lines.push('Until the DM removes it.');
    return { title: conditionName(id) + (e.cond?.[id]?.level ? ` ${e.cond[id].level}` : ''), lines: lines.filter(Boolean), end: null };
  }
  return null;
}

// The pills of a creature: { html } for the status line. `full`: we were sent its whole record; `myTurn`: the turn budget is shown.
export function statusHtml(S, e, { mine = false, full = false, formLabel = '', budget = null } = {}) {
  const enc = S.encounter, b = budget;
  const pip = (label, have) => `<span class="${have ? 'have' : 'spent'}">${label}</span>`;
  const pill = (key, label, cls = '') => `<button type="button" class="pill ${cls}" data-how="${esc(key)}" aria-expanded="false">${label}</button>`;
  const dying = !e.dead && e.hp <= 0 && full && (e.cond?.stable ? 'Stable' : `Dying ${e.death?.s ?? 0}✓ ${e.death?.f ?? 0}✗`);
  const conds = Object.keys(e.cond ?? {}).filter((c) => e.cond[c] && c !== 'stable');
  const plain = (e.dead ? ['Dead'] : []).map((t) => `<span>${esc(t)}</span>`).join('');
  const lasting = effectsOn(S, e).map((fx) => {
    const left = untilText(S, fx), label = `${esc(fx.name)}${fx.conc ? ' (C)' : ''}${left ? ` · ${esc(left.replace(' left', '').replace(/^until /, 'until '))}` : ''}`;
    return pill(`fx:${fx.id}`, label, 'fx');
  }).join('');
  return (b ? pip('Action', b.action > 0) + (b.attacks ? pip(`Attacks left ${b.attacksLeft}`, true) : '') + pip('Bonus Action', b.bonus > 0) + pip(`Move ${feetShown(S, b.move)} ft`, b.move >= 5) : '') +
    (full && enc && inFight(S, e.id) ? pip('Reaction', !e.reactionUsed) : '') +
    Object.keys(e.slotsMax || {}).map((l) => pip(`Level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`, e.slots[l] > 0)).join('') +
    plain + (formLabel ? `<b class="form">${esc(formLabel)} form</b>` : '') + (dying ? pill('dying', esc(dying)) : '') + (e.hidden ? '<span>Hidden from players</span>' : '') +
    conds.map((c) => pill(`cond:${c}`, esc(conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : '')))).join('') + lasting;
}

// ---------- the page ----------
const $ = (id) => document.getElementById(id);
const ARMS = (m) => !!m && m.kind !== 'move';

// ctx: { prefs, state(), isDM(), mine(e), act, toast, skipping(), setMode(m), move (the idle mode), castSpell(e, id, armed), openSheet(),
//        shortRest(), hpFraction(e), formLabel(e), budget(e), openFeature(e, id) (a chooser of classes.js), flyInfo(e) ({ aloft, alt }),
//        fly(e, delta) (change the height of the next move), metamagic(e) (the Metamagic button of classes.js, or null), render(), selected() }.
export function initActionPanel(ctx) {
  const { prefs } = ctx;
  const card = $('card'), body = $('ap-body'), tabsEl = $('ap-tabs'), how = $('ap-how');
  let sel = { key: '', tab: null }, rowsBy = {}, raised = false, moreOpen = false, howKey = null, ctxNow = null, tabsNow = [], found = [false, false];
  const pref = () => (prefs.get('hextable.panelTab') === 'remember' ? 'remember' : 'auto');
  const last = () => prefs.get('hextable.panelLast') ?? {};
  const narrow = () => { try { return matchMedia('(max-width: 600px)').matches; } catch { return false; } };
  // index.html still carries the temporary pane of the old action bar (`#ap-all` and `#actions`); it is the Spells pane now.
  const spellsEl = $('ap-all') ?? $('ap-spells');
  spellsEl.id = 'ap-spells'; spellsEl.setAttribute('aria-labelledby', 'ap-tab-spells'); spellsEl.textContent = '';
  // The Items pane is made here: index.html carries no element for it (it was not on the issue's list; tidy it next time that file is touched).
  const itemsEl = $('ap-items') ?? (() => { const el = document.createElement('div'); el.id = 'ap-items'; el.setAttribute('role', 'tabpanel'); el.setAttribute('aria-labelledby', 'ap-tab-items'); el.hidden = true; $('ap-features').after(el); return el; })();
  const panes = { items: itemsEl, explore: $('ap-explore'), attacks: $('ap-attacks'), spells: spellsEl, bonus: $('ap-bonus'), move: $('ap-move'), features: $('ap-features'), reactions: $('ap-reactions'), down: $('ap-down') };
  const LISTS = ['explore', 'attacks', 'spells', 'bonus', 'move', 'features'];
  let picking = null;                                    // the Items row whose potion is being given: { id, actor }
  let giving = null;                                     // the Give... button whose list of creatures is open: { id (of the act), actor }
  // The Spells tab's sort (kept on this device) and filters (kept while the page is open, not between sessions).
  const sortNow = () => (SPELL_SORTS[prefs.get('hextable.spellSort')] ? prefs.get('hextable.spellSort') : 'level');
  let filters = noFilters(), filtersOpen = false, refocus = null;

  const setHtml = (el, html) => { if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; } };

  function choose(id, focus = false) {
    if (!tabsNow.some((t) => t.id === id)) return;
    sel.tab = id;
    if (pref() === 'remember' && ctxNow) prefs.set('hextable.panelLast', { ...last(), [ctxNow.situation]: id });
    ctx.render();
    if (focus) tabsEl.querySelector(`[data-tab="${id}"]`)?.focus();
  }
  tabsEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'ap-grip') { raised = !raised; return ctx.render(); }
    choose(b.dataset.tab);
  });
  tabsEl.addEventListener('keydown', (ev) => {
    const i = tabsNow.findIndex((t) => t.id === sel.tab), step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
    if (step && i >= 0) { ev.preventDefault(); choose(tabsNow[(i + step + tabsNow.length) % tabsNow.length].id, true); }
  });
  // A drag on the head moves between compact and raised; a tap on a button in it does what it did.
  let drag = null;
  $('card-head').addEventListener('pointerdown', (ev) => { if (!ev.target.closest('button')) drag = { y: ev.clientY, id: ev.pointerId }; });
  addEventListener('pointerup', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dy = ev.clientY - drag.y; drag = null;
    if (Math.abs(dy) > 30) { raised = dy < 0; ctx.render(); }
  });
  addEventListener('pointercancel', () => { drag = null; });
  // 1 to 6 switch to a tab when no field has focus.
  addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented || card.hidden || document.body.classList.contains('rp-open')) return;
    if (ev.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const n = Number(ev.key);
    if (Number.isInteger(n) && n >= 1 && n <= tabsNow.length && tabsNow.length > 1) choose(tabsNow[n - 1].id);
  });

  // A tap on a row does what the same button of the bar did.
  function run(r) {
    const S = ctx.state(), e = S.entities[ctx.selected()];
    if (!e || ctx.skipping()) return;
    if (r.why) return ctx.toast(r.why);
    switch (r.kind) {
      case 'send': case 'use': return ctx.act(r.send);
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
      case 'fly': return ctx.fly(e, r.delta);
      case 'follow': if (r.armed) { ctx.setMode(ctx.move); return ctx.act(r.send); } return ctx.setMode({ kind: 'follow' });
      case 'ritual': return ctx.castSpell(e, r.spell, r.armed);
      case 'shortRest': return ctx.shortRest();
      case 'check': return ctx.openSheet();
      case 'jump': {
        if (r.jumpTab === 'spells') filters = noFilters();                        // a filter must not hide the row we are going to
        choose(r.jumpTab);
        const b = panes[r.jumpTab].querySelector(`[data-row="${CSS.escape(r.jump)}"]`);
        if (b) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); b.focus({ preventScroll: true }); }
        return;
      }
      default: return;
    }
  }
  for (const id of LISTS) {
    panes[id].addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-row]'); if (!b) return;
      const r = (rowsBy[id] ?? []).find((x) => x.id === b.dataset.row); if (r) run(r);
    });
  }
  // The Items tab's own controls: a use row (through `run`), whom a potion is for, and the equip and attune buttons of a piece of gear.
  panes.items.addEventListener('click', (ev) => {
    const S = ctx.state(), e = S.entities[ctx.selected()];
    const pick = ev.target.closest('[data-pick], [data-pick-cancel]');          // data-pick-cancel also closes the level chooser
    if (pick && e && !ctx.skipping()) {
      const r = picking && (rowsBy.items ?? []).find((x) => x.id === picking.id);
      if (pick.dataset.pickCancel !== undefined || !r) { picking = null; return ctx.render(); }
      const who = pick.dataset.pick; picking = null;
      ctx.act(who === 'self' ? r.send : { ...r.send, target: who });
      return ctx.render();
    }
    const lv = ev.target.closest('[data-lvl]');
    if (lv && e && !ctx.skipping()) {
      const r = picking && (rowsBy.items ?? []).find((x) => x.id === picking.id), level = Number(lv.dataset.lvl); picking = null;
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
    const b = ev.target.closest('[data-row]'); if (!b) return;
    const r = (rowsBy.items ?? []).find((x) => x.id === b.dataset.row); if (r) run(r);
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
  const rowHtml = (r) => {
    const wid = `ap-w-${esc(r.id).replace(/[^\w-]/g, '_')}`, tag = r.kind === 'none' && !r.why ? 'div' : 'button';
    return `<${tag}${tag === 'button' ? ' type="button"' : ''} class="ap-row${r.armed ? ' armed' : ''}${r.why ? ' off' : ''}${tag === 'div' ? ' info' : ''}" data-row="${esc(r.id)}"${tag === 'button' ? ` aria-disabled="${r.why ? 'true' : 'false'}"` : ''}${r.why ? ` aria-describedby="${wid}"` : ''}>
    <span class="ap-top"><span class="ap-t">${esc(r.label)}</span>${r.chip ? `<span class="ap-chip">${esc(r.chip)}</span>` : ''}</span>${r.sub ? `<small class="ap-s">${esc(r.sub)}</small>` : ''}${pipsHtml(r.pips)}${r.why ? `<small class="ap-why" id="${wid}">${esc(r.why)}</small>` : ''}</${tag}>`;
  };
  const listHtml = (head, list) => `${head}<div class="ap-list">${list.map(rowHtml).join('')}</div>`;
  // The Move tab's meter: the Speed left this turn.
  const moveHead = (S, e) => {
    const m = moveBudget(S, e); if (!m) return '';
    return `<div class="ap-speed"><span>Speed left <b>${m.left} ft</b>${m.max > m.left ? ` of ${m.max}` : ''}</span><span class="ap-meter" role="presentation"><i style="width:${m.max ? Math.round((m.left / m.max) * 100) : 0}%"></i></span></div>${m.prone ? '<p class="ap-why-line">Prone. You stand at the start of your turn, using half your Speed.</p>' : ''}`;
  };
  // Only whole rows show in the compact pane: its height is cut back to the last row that fits, and a line under it says how many more are below.
  const cue = document.createElement('button'); cue.type = 'button'; cue.id = 'ap-cue'; cue.hidden = true; body.append(cue);
  cue.onclick = () => { raised = true; ctx.render(); };
  const rowsOf = (el) => [...el.querySelectorAll('.ap-row, .ap-more > summary')];
  function cueFor(el) {
    const box = el.getBoundingClientRect(), hidden = el.hidden ? 0 : rowsOf(el).filter((it) => it.getBoundingClientRect().bottom > box.bottom + 1).length;
    cue.hidden = !hidden; cue.textContent = hidden ? `▾ ${hidden} more: scroll or tap for more room` : '';
  }
  function fit(el) {
    el.style.maxHeight = '';
    const cap = parseFloat(getComputedStyle(el).maxHeight), items = rowsOf(el);
    if (cap > 0 && items.length && el.scrollHeight > cap + 1) {
      const top = el.getBoundingClientRect().top - el.scrollTop;
      let h = 0;
      for (const it of items) { const bottom = it.getBoundingClientRect().bottom - top; if (bottom <= cap + 1 || !h) h = Math.max(h, bottom); }
      el.style.maxHeight = `${Math.ceil(h)}px`;
    }
    cueFor(el);
  }
  for (const id of [...LISTS, 'items', 'reactions', 'down']) panes[id].addEventListener('scroll', () => cueFor(panes[id]), { passive: true });

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
  function spellsPane(S, e, mode) {
    const all = spellRows(S, e, { mode }), shown = filterSpells(all, filters), groups = sortSpells(shown, sortNow()), meta = ctx.metamagic?.(e);
    const metaRow = meta ? { id: 'metamagic', kind: 'meta', label: meta.label, sub: meta.sub, why: meta.why, armed: /\barmed\b/.test(meta.cls ?? ''), chip: 'Cast with' } : null;
    rowsBy.spells = [...(metaRow ? [metaRow] : []), ...shown];
    const kindOn = filters.kind.length > 0;
    const mark = (r) => (kindOn && !r.kinds.length ? { ...r, sub: `${r.sub} · kind not known` } : r);
    const tb = toolbarHtml();
    setHtml(panes.spells, `<div class="ap-spellhead">${slotsHtml(e)}${tb.bar}</div>${tb.panel}${metaRow ? `<div class="ap-list">${rowHtml(metaRow)}</div>` : ''}${
      groups.map((g) => `${g.head ? `<h4 class="ap-head">${esc(g.head)}</h4>` : ''}<div class="ap-list">${g.rows.map((r) => rowHtml(mark(r))).join('')}</div>`).join('')}${
      all.length && !shown.length ? '<p class="ap-why-line">No spell matches these filters.</p>' : ''}`);
  }

  // The Items tab: what can be used (greyed with the engine's reason), what is carried and how, the light.
  function itemsPane(S, e, dm, mode) {
    const it = itemRows(S, e, { dm, mode });
    if (picking && (picking.actor !== e.id || !it.uses.some((r) => r.id === picking.id && !r.why && (r.targets.length || r.upTo > r.level)))) picking = null;
    const lightList = it.light ? [it.light] : [];
    const groundActs = it.ground.flatMap((p) => [...p.things, ...(p.all ? [p.all] : [])]);
    const acts = [...it.gear.flatMap((g) => g.acts), ...it.names.flatMap((n) => n.acts), ...groundActs];
    rowsBy.items = [...it.uses, ...lightList]; rowsBy.itemsGear = acts; rowsBy.itemsTargets = it.targets;
    if (giving && (giving.actor !== e.id || !acts.some((a) => a.id === giving.id && a.give && !a.why))) giving = null;
    const levels = (r) => `<div class="ap-pick" role="group" aria-label="Cast at which level?"><span>Cast at level</span>${Array.from({ length: r.upTo - r.level + 1 }, (_, i) => r.level + i).map((l) =>
      `<button type="button" data-lvl="${l}">${l}${l > r.level ? ` (${r.cost + l - r.level} charges)` : ''}</button>`).join('')}<button type="button" data-pick-cancel>Cancel</button></div>`;
    const picker = (r) => r.upTo > r.level && !r.targets.length ? levels(r) : `<div class="ap-pick" role="group" aria-label="Who is it for?"><span>Give it to</span><button type="button" data-pick="self">${esc(e.name)}</button>${
      r.targets.map((t) => `<button type="button" data-pick="${esc(t.id)}">${esc(t.name)}${t.down ? ' (down)' : ''}</button>`).join('')}<button type="button" data-pick-cancel>Cancel</button></div>`;
    const wid = (a) => `ap-w-${esc(a.id).replace(/[^\w-]/g, '_')}`;
    const btn = (a, did = wid(a)) => `<button type="button" data-gact="${esc(a.id)}" aria-disabled="${a.why ? 'true' : 'false'}"${a.why ? ` aria-describedby="${did}" class="off"` : ''}${a.give ? ` aria-expanded="${giving?.id === a.id}"` : ''}>${esc(a.label)}</button>`;
    const why = (list) => list.filter((a) => a.why).map((a) => `<small class="ap-why" id="${wid(a)}">${esc(a.why)}</small>`).join('');
    const timeLine = it.time && TIME_WORDS[it.time] ? `<small class="ap-s">${esc(TIME_WORDS[it.time])}</small>` : '';
    const givePick = (a) => giving?.id === a.id ? `<div class="ap-pick" role="group" aria-label="Who gets it?"><span>Hand it to</span>${it.targets.map((t) =>
      `<button type="button" data-give-to="${esc(t.id)}" aria-disabled="${t.why ? 'true' : 'false'}"${t.why ? ' class="off"' : ''}>${esc(t.name)}${t.why ? `<small class="ap-why"> ${esc(t.why)}</small>` : ''}</button>`).join('')}<button type="button" data-give-cancel>Cancel</button></div>` : '';
    const carriedRow = (key, label, sub, list, note) => `<div class="ap-row ap-gear info" data-gear="${esc(key)}"><span class="ap-top"><span class="ap-t">${esc(label)}</span></span>${sub ? `<small class="ap-s">${esc(sub)}</small>` : ''}${
      list.length ? `<span class="ap-acts">${list.map(btn).join('')}</span>${timeLine}${why(list)}${list.map(givePick).join('')}` : ''}${note ? `<small class="ap-why">${esc(note)}</small>` : ''}</div>`;
    const uses = it.uses.map((r) => { const on = picking?.id === r.id; return rowHtml(on ? { ...r, armed: true } : r) + (on ? picker(r) : ''); }).join('');
    const gear = it.gear.map((g) => carriedRow(g.key, g.label, g.sub, g.acts, g.note)).join('');
    const names = it.names.map((n) => carriedRow(n.id, n.label, n.count > 1 ? `x${n.count}` : '', n.acts, '')).join('');
    const ground = it.ground.map((p) => `<div class="ap-row ap-gear info" data-pile="${esc(p.object)}"><span class="ap-top"><span class="ap-t">${esc(p.label)}</span>${p.unseen ? '<span class="ap-chip">Not seen by the players</span>' : ''}</span>${
      p.things.map((x) => `<span class="ap-line"><span>${esc(x.label)}</span>${btn({ ...x, label: 'Pick up' }, wid(p.things[0]))}</span>`).join('')}${p.all ? `<span class="ap-acts">${btn(p.all, wid(p.things[0]))}</span>` : ''}${timeLine}${why(p.things.slice(0, 1))}</div>`).join('');
    setHtml(panes.items, `${it.uses.length ? `<h4 class="ap-head">Use</h4><div class="ap-list">${uses}</div>` : ''}${gear || names ? `<h4 class="ap-head">Carried</h4><div class="ap-list">${gear}${names}</div>` : ''}${
      ground ? `<h4 class="ap-head">On the ground here</h4><div class="ap-list">${ground}</div>` : ''}${
      lightList.length ? `<h4 class="ap-head">Light</h4><div class="ap-list">${lightList.map(rowHtml).join('')}</div>` : ''}${!it.any ? '<p class="ap-why-line">Nothing carried.</p>' : ''}`);
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

  // The Settings tab's choice of how the panel picks its tab.
  const pick = $('set-paneltab');
  if (pick) { pick.value = pref(); pick.onchange = () => { prefs.set('hextable.panelTab', pick.value); sel = { key: '', tab: null }; ctx.render(); }; }

  return {
    // Events of an update: a `noticed` or `triggered` one moves Search up for the next two updates.
    updated(events) { found = [events.some((ev) => ev.type === 'noticed' || ev.type === 'triggered'), found[0]]; },
    fresh() { found = [false, false]; sel = { key: '', tab: null }; howKey = null; raised = false; picking = null; },
    // Draws the card for `e` (or hides it): the head, the status, the tabs and the open tab. `mode` is app.js's current mode.
    render(e, mode, { my, full }) {
      const S = ctx.state(), enc = S.encounter, cur = current(S);
      card.hidden = !e;
      if (!e) { tabsEl.hidden = true; return; }
      $('c-name').textContent = e.name;
      $('c-sub').textContent = e.kind === 'pc' ? `Level ${e.level} ${e.cls}${e.ownerName ? ` · ${e.ownerName}` : ''}` : MONSTERS[e.tpl]?.name ?? 'Creature';
      $('c-hp').querySelector('i').style.width = `${ctx.hpFraction(e) * 100}%`;
      const showNumbers = full && (my || e.side === 'party');
      const looks = e.health ?? (e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy');
      $('c-hp-text').textContent = showNumbers ? `${e.hp} / ${e.maxHp} HP${e.tempHp > 0 ? ` +${e.tempHp} temp` : ''}` : { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' }[looks];
      $('c-ac').textContent = showNumbers ? `AC ${e.ac}` : '';
      $('btn-sheet').hidden = !showNumbers;
      $('btn-end').hidden = !(my && enc && cur === e.id);
      const myTurn = !!enc && cur === e.id && up(e);
      $('c-res').innerHTML = statusHtml(S, e, { mine: my, full, formLabel: ctx.formLabel(e), budget: myTurn && full ? ctx.budget(e) : null });
      renderHow(S, e);

      const dm = ctx.isDM();
      ctxNow = panelContext(S, e, { mine: my, dm });
      const fly = ctx.flyInfo(e);
      const has = { spells: !!(e.spells?.length || e.feats?.some((f) => f.metamagic)), attacks: !!(e.attacks?.length || e.actions?.length), features: featureRows(S, e).length > 0, items: itemRows(S, e, { dm }).any };
      tabsNow = visibleTabs(ctxNow, has);
      const react = ctxNow.tabs.find((t) => t.id === 'reactions');
      const key = `${e.id}|${ctxNow.situation}|${enc ? `${enc.round}:${enc.turn}` : ''}|${react?.pending ? 'q' : ''}`;
      if (sel.key !== key) sel = { key, tab: null };
      const tab = tabsNow.some((t) => t.id === sel.tab) ? sel.tab : defaultTab(ctxNow, tabsNow, { pref: pref(), last: last() });

      // the tabs
      tabsEl.hidden = tabsNow.length < 2;
      setHtml(tabsEl, tabsNow.map((t, i) => {
        const off = t.id === 'reactions' && !t.ok && !t.pending && !t.free;
        return `<button type="button" role="tab" id="ap-tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === tab}" aria-controls="ap-${t.id}" tabindex="${t.id === tab ? 0 : -1}" class="${off ? 'off ' : ''}${t.pending ? 'pulse' : ''}"${off ? ' aria-disabled="true"' : ''}${i < 6 ? ` aria-keyshortcuts="${i + 1}"` : ''}>${esc(t.label)}${t.pending ? '<i class="sr-only"> (a question is waiting)</i>' : ''}</button>`;
      }).join('') + (tab !== 'down' ? `<button type="button" id="ap-grip" aria-expanded="${raised}" aria-controls="ap-body" aria-label="${raised ? 'Less room' : 'More room'}" title="${raised ? 'Less room' : 'More room'}">${raised ? '▾' : '▴'}</button>` : ''));

      // the panes: only the open one is shown
      for (const [id, el] of Object.entries(panes)) el.hidden = id !== tab;
      if (tab === 'explore') { rowsBy.explore = rankExplore(S, e, { dm, mode, found: found[0] || found[1] }); setHtml(panes.explore, exploreHtml(rowsBy.explore)); }
      if (['attacks', 'features', 'move', 'bonus'].includes(tab)) {
        let head = '', list;
        if (tab === 'bonus') {
          const b = bonusRows(S, e, { mode, fly }); list = b.rows;
          head = (b.available ? '' : `<p class="ap-why-line">No Bonus Action: ${esc(b.why)}</p>`) + (list.length ? '' : '<p class="ap-why-line">Nothing this creature has costs a Bonus Action.</p>');
        } else list = tabRows(S, e, tab, { mode, fly });
        if (tab === 'move') head = moveHead(S, e);
        rowsBy[tab] = list;
        setHtml(panes[tab], listHtml(head, list));
      }
      if (tab === 'spells') spellsPane(S, e, mode);
      if (tab === 'items') itemsPane(S, e, dm, mode);
      if (tab === 'reactions') reactionsPane(S, e, react ?? reactionState(S, e, { dm }));
      if (tab === 'down') downPane(S, e);
      body.hidden = !tabsNow.length;
      card.dataset.tab = tab ?? '';
      card.dataset.situation = ctxNow.situation;
      card.toggleAttribute('data-raised', raised);
      card.toggleAttribute('data-collapsed', ARMS(mode) && narrow() && tab !== 'down');       // a thumb needs the map to tap a target
      if (panes[tab] && !panes[tab].hidden) fit(panes[tab]); else cue.hidden = true;
      if (tab === 'items' && (picking || giving)) panes.items.querySelector('.ap-pick')?.scrollIntoView({ block: 'nearest' });       // the chooser must be on screen, not below the fold
      return tab;
    },
    get tab() { return sel.tab ?? card.dataset.tab; },
    choose,
  };
}
