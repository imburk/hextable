// The action panel (docs/specs/table-ui.md, Decision 6, task T3): the card at the foot of the screen. Its head (name, Sheet, End turn),
// Hit Point bar and status line (with a small card on how each condition or lasting effect ends), and tabs chosen by what the
// table is doing, `panelContext(S, e)`. Built here: Explore (outside a fight, ranked by `rankExplore`), Reactions (on another's
// turn), Down, and one temporary tab, "All", which holds today's action bar (`#actions`, still built by app.js) until T4a and T4b
// give each of its buttons a row in its own tab.
//
// The top of this file is pure: it reads a state (a full state or a player's view) and the engine's own helpers, and returns
// plain data, so a test can drive it with no page. `initActionPanel` below is the only part that touches the page. Nothing here
// decides a rule: what can be done, and why not, is `usesFor`, `blocked`, `hideProblem` and `reactionsOf`; a tap sends the same
// action the bar sends.
import * as H from './shared/hex.js';
import { inFight, current, up, blocked, usesFor, hideProblem, checkBonus, clockText } from './shared/engine.js';
import { reactionsOf, canReact } from './shared/reactions.js';
import { conditionName, conditionDef } from './shared/modifiers.js';
import { SPELLS, MONSTERS } from './shared/content/index.js';
import { lightAt } from './shared/sight.js';
import { under } from './shared/space.js';
import { reactionsHtml, bindReactions } from './reactionsheet.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------- which tabs, when ----------
export const TAB_LABEL = { explore: 'Explore', attacks: 'Attacks', spells: 'Spells', bonus: 'Bonus', move: 'Move', features: 'Features', items: 'Items', reactions: 'Reactions', down: 'Down', all: 'All' };
// The tabs that have rows today. The others are in the spec (Decision 6) and come with T4a and T4b; until then "All" holds their buttons.
export const BUILT = new Set(['explore', 'reactions', 'down', 'all']);

// Whether the Reactions tab is available for `e` now, and if not why, in words. A question waiting for this creature makes it
// active whatever else is true: `S.prompt` is what a player is sent, `S.pending` what the DM is sent.
export function reactionState(S, e, { dm = false } = {}) {
  const q = dm ? S.pending?.ask : S.prompt;
  const pending = !!q && !q.waiting && q.reactor === e.id;
  const why = !reactionsOf(e).length ? `${e.name} has no reactions.` : e.reactionUsed ? 'Reaction used this round.' : !canReact(e) ? `${e.name} can't take a reaction now.` : '';
  return { ok: !why, why, pending };
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
  return { situation: 'wait', tabs: ['reactions', 'spells', 'features', 'items'].map((id) => tab(id, id === 'reactions' ? { ok: r.ok, why: r.why, pending: r.pending } : { why: 'It isn\'t your turn.' })), default: 'reactions' };
}

// The tabs the shell draws: the built ones in the spec's order, then "All" while there is anything to do (a creature that is up).
export function visibleTabs(ctx) {
  const own = ctx.tabs.filter((t) => t.built);
  return ['explore', 'turn', 'wait'].includes(ctx.situation) ? [...own, { id: 'all', label: TAB_LABEL.all, built: true }] : own;
}

// Which tab is open. `pref`: 'auto' (the spec's default), 'remember' (the last tab used in this situation) or, until T4a replaces
// it, 'all' (always today's bar). `last`: { [situation]: tab id }.
export function defaultTab(ctx, tabs, { pref = 'auto', last = {} } = {}) {
  const has = (id) => tabs.some((t) => t.id === id);
  if (pref === 'all' && has('all')) return 'all';
  if (pref === 'remember' && has(last[ctx.situation])) return last[ctx.situation];
  if (ctx.situation === 'wait') {
    const r = ctx.tabs.find((t) => t.id === 'reactions');
    if (r && (r.ok || r.pending) && has('reactions')) return 'reactions';
    if (has(last.wait)) return last.wait;
  }
  if (has(ctx.default)) return ctx.default;
  return has('all') ? 'all' : tabs[0]?.id ?? null;
}

// ---------- the Explore tab ----------
// The nearest other living party member: whom Follow picks if nobody is tapped.
export function nearestAlly(S, e) {
  return Object.values(S.entities).filter((x) => x.id !== e.id && x.side === 'party' && !x.dead)
    .sort((a, b) => H.dist(a.pos, e.pos) - H.dist(b.pos, e.pos))[0] ?? null;
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
  if (S.sight?.rule === 'light') return !!S.sight.light?.[under(S.map, e.pos)?.level]?.[H.col(e.pos)];       // a player is sent which tiles are not Bright
  try { return lightAt(S, e.pos) !== 'bright'; } catch { return false; }
};
// Whether a party member is under half or has spent spell slots: the DM's rests are then worth offering first.
const wearyParty = (S) => Object.values(S.entities).some((x) => x.side === 'party' && x.kind === 'pc' && !x.dead && (hurt(x) || x.hp <= 0 || Object.keys(x.slotsMax ?? {}).some((l) => (x.slots?.[l] ?? 0) < x.slotsMax[l])));

// What to offer outside a fight, most likely first (Decision 6). Rows: { id, kind, label, sub, why, send?, ... }. `kind` says what a tap does:
// an action to send (`send`), `follow` (arm a tap on a party member), `jump` (go to a button of the All tab), `ritual`, `shortRest`, `check`.
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
  // 3. Hurt: the healing this creature can do now, as shortcuts to its buttons (Spells and Features come with T4a and T4b), and the DM's rests.
  const aid = [];
  if (hurt(e)) {
    for (const id of e.spells ?? []) {
      const sp = SPELLS[id];
      if (sp?.heals && !spellWhy(S, e, sp)) aid.push(row({ id: `heal:${id}`, kind: 'jump', label: sp.name, sub: `${sp.level ? 'Slot' : 'Cantrip'}${sp.time === 'bonus' ? ' · Bonus' : ''} · heals`, jump: sp.name }));
    }
    for (const f of e.feats ?? []) {
      if (!HEAL_FEATS.includes(f.id)) continue;
      const left = f.uses ? (e.uses?.[f.id] ?? 0) : null;
      if (blocked(S, e, f.action?.time === 'free' ? null : f.action?.time ?? 'action') || (left !== null && left < 1)) continue;
      aid.push(row({ id: `heal:${f.id}`, kind: 'jump', label: f.name, sub: `${left === null ? '' : `${left} left · `}heals`, jump: f.name }));
    }
    if (e.features?.secondWind && !(e.feats ?? []).some((f) => f.id === 'second-wind') && e.uses?.secondWind > 0 && !blocked(S, e, 'bonus'))
      aid.push(row({ id: 'heal:secondWind', kind: 'jump', label: 'Second Wind', sub: `${e.uses.secondWind} left · heals`, jump: 'Second Wind' }));
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
  return (b ? pip('Action', b.action > 0) + (b.attacks ? pip(`Attacks left ${b.attacksLeft}`, true) : '') + pip('Bonus Action', b.bonus > 0) + pip(`Move ${b.move} ft`, b.move >= 5) : '') +
    (full && enc && inFight(S, e.id) ? pip('Reaction', !e.reactionUsed) : '') +
    Object.keys(e.slotsMax || {}).map((l) => pip(`Level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`, e.slots[l] > 0)).join('') +
    plain + (formLabel ? `<b class="form">${esc(formLabel)} form</b>` : '') + (dying ? pill('dying', esc(dying)) : '') + (e.hidden ? '<span>Hidden from players</span>' : '') +
    conds.map((c) => pill(`cond:${c}`, esc(conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : '')))).join('') + lasting;
}

// ---------- the page ----------
const $ = (id) => document.getElementById(id);
const ARMS = (m) => !!m && m.kind !== 'move';

// ctx: { prefs, state(), isDM(), mine(e), act, toast, skipping(), setMode(m), move (the idle mode), castSpell(e, id, armed), openSheet(),
//        shortRest(), hpFraction(e), formLabel(e), budget(e), onSize() }.
export function initActionPanel(ctx) {
  const { prefs } = ctx;
  const card = $('card'), body = $('ap-body'), tabsEl = $('ap-tabs'), how = $('ap-how');
  let sel = { key: '', tab: null }, rows = [], raised = false, moreOpen = false, howKey = null, ctxNow = null, tabsNow = [], found = [false, false];
  const pref = () => ({ remember: 'remember', all: 'all' })[prefs.get('hextable.panelTab')] ?? 'auto';
  const last = () => prefs.get('hextable.panelLast') ?? {};
  const narrow = () => { try { return matchMedia('(max-width: 600px)').matches; } catch { return false; } };
  const panes = { explore: $('ap-explore'), reactions: $('ap-reactions'), down: $('ap-down'), all: $('ap-all') };

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
    if (Math.abs(dy) > 30 && sel.tab !== 'all') { raised = dy < 0; ctx.render(); }
  });
  addEventListener('pointercancel', () => { drag = null; });
  // 1 to 6 switch to a tab when no field has focus.
  addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented || card.hidden || document.body.classList.contains('rp-open')) return;
    if (ev.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const n = Number(ev.key);
    if (Number.isInteger(n) && n >= 1 && n <= tabsNow.length && tabsNow.length > 1) choose(tabsNow[n - 1].id);
  });

  // A tap on an Explore row does what the same button of the bar does.
  function run(r) {
    const S = ctx.state(), e = S.entities[ctx.selected()];
    if (!e || ctx.skipping()) return;
    if (r.why) return ctx.toast(r.why);
    switch (r.kind) {
      case 'send': return ctx.act(r.send);
      case 'use': return ctx.act(r.send);
      case 'follow': if (r.armed) { ctx.setMode(ctx.move); return ctx.act(r.send); } return ctx.setMode({ kind: 'follow' });
      case 'ritual': return ctx.castSpell(e, r.spell, r.armed);
      case 'shortRest': return ctx.shortRest();
      case 'check': return ctx.openSheet();
      case 'jump': {
        choose('all');
        const b = [...$('actions').querySelectorAll('button')].find((x) => x.querySelector('span')?.textContent === r.jump);
        if (b) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); b.focus({ preventScroll: true }); }
        return;
      }
      default: return;
    }
  }
  panes.explore.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-row]'); if (!b) return;
    const r = rows.find((x) => x.id === b.dataset.row); if (r) run(r);
  });
  panes.explore.addEventListener('toggle', (ev) => { if (ev.target.matches('details.ap-more')) moreOpen = ev.target.open; }, true);

  const rowHtml = (r) => `<button type="button" class="ap-row${r.armed ? ' armed' : ''}${r.why ? ' off' : ''}" data-row="${esc(r.id)}" aria-disabled="${r.why ? 'true' : 'false'}"${r.why ? ` aria-describedby="ap-w-${esc(r.id).replace(/[^\w-]/g, '_')}"` : ''}>
    <span class="ap-t">${esc(r.label)}</span>${r.sub ? `<small class="ap-s">${esc(r.sub)}</small>` : ''}${r.why ? `<small class="ap-why" id="ap-w-${esc(r.id).replace(/[^\w-]/g, '_')}">${esc(r.why)}</small>` : ''}</button>`;
  const exploreHtml = (list) => `<div class="ap-grid">${list.filter((r) => r.grid).map(rowHtml).join('')}</div>${list.some((r) => !r.grid) ? `<details class="ap-more"${moreOpen ? ' open' : ''}><summary>More</summary><div class="ap-list">${list.filter((r) => !r.grid).map(rowHtml).join('')}</div></details>` : ''}`;

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
    fresh() { found = [false, false]; sel = { key: '', tab: null }; howKey = null; raised = false; },
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
      const legacy = pref() === 'all';
      tabsNow = visibleTabs(ctxNow);
      if (legacy && tabsNow.some((t) => t.id === 'all')) tabsNow = tabsNow.filter((t) => t.id === 'all');       // the preference "always the full bar": no tabs, today's card
      const react = ctxNow.tabs.find((t) => t.id === 'reactions');
      const key = `${e.id}|${ctxNow.situation}|${enc ? `${enc.round}:${enc.turn}` : ''}|${react?.pending ? 'q' : ''}`;
      if (sel.key !== key) sel = { key, tab: null };
      const tab = tabsNow.some((t) => t.id === sel.tab) ? sel.tab : defaultTab(ctxNow, tabsNow, { pref: pref(), last: last() });

      // the tabs
      tabsEl.hidden = tabsNow.length < 2;
      setHtml(tabsEl, tabsNow.map((t, i) => {
        const off = t.id === 'reactions' && !t.ok && !t.pending;
        return `<button type="button" role="tab" id="ap-tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === tab}" aria-controls="ap-${t.id}" tabindex="${t.id === tab ? 0 : -1}" class="${off ? 'off ' : ''}${t.pending ? 'pulse' : ''}"${off ? ' aria-disabled="true"' : ''}${i < 6 ? ` aria-keyshortcuts="${i + 1}"` : ''}>${esc(t.label)}${t.pending ? '<i class="sr-only"> (a question is waiting)</i>' : ''}</button>`;
      }).join('') + (tab !== 'all' && tab !== 'down' && !legacy ? `<button type="button" id="ap-grip" aria-expanded="${raised}" aria-controls="ap-body">${raised ? 'Less' : 'More room'}</button>` : ''));

      // the panes: only the open one is shown
      for (const [id, el] of Object.entries(panes)) el.hidden = id !== tab;
      if (tab === 'explore') { rows = rankExplore(S, e, { dm, mode, found: found[0] || found[1] }); setHtml(panes.explore, exploreHtml(rows)); }
      if (tab === 'reactions') reactionsPane(S, e, react ?? reactionState(S, e, { dm }));
      if (tab === 'down') downPane(S, e);
      body.hidden = !tabsNow.length;
      card.dataset.tab = tab ?? '';
      card.dataset.situation = ctxNow.situation;
      card.toggleAttribute('data-raised', raised && tab !== 'all');
      card.toggleAttribute('data-collapsed', !legacy && ARMS(mode) && narrow() && tab !== 'down');       // a thumb needs the map to tap a target
      return tab;
    },
    get tab() { return sel.tab ?? card.dataset.tab; },
    choose,
  };
}
