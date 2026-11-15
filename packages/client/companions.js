// The screens of companions (docs/specs/companions.md, stage C8; issue #367): the cast chooser for a summon, and the rows and pickers for what a
// master does with its companions (Command, the steed's side, Dismiss, Recall, Mount, Dismount, Let it act, a touch delivered by a familiar).
//
// The top of the file is pure: it reads a state (a full state or a player's view) and returns plain data, so a test can drive it with no page.
// Nothing here decides a rule. Whether a button is greyed, and why, is the engine's own answer: `dry(action)` (app.js) runs the action on a copy
// of the state the screen holds and returns the engine's refusal in its words ('' when it would be accepted). The only thing read is what the
// view sent: a creature the view did not send is not here, and nothing is guessed from ids or gaps. Every word that came from a person (an order,
// a name) is escaped where it is drawn.
import { inFight, current } from './shared/engine.js';
import { SPELLS, MONSTERS } from './shared/content/index.js';
import { CHOICES } from './shared/content/schema.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const human = (s) => String(s ?? '').replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const SIDES = ['after', 'before'];

// ---------- who is whose ----------
// The master's companions that this screen was sent (the party's own carry their bond), alive, and what is in its pocket dimension.
export const companionsOf = (S, m) => Object.values(S?.entities ?? {}).filter((c) => c.bond?.to === m?.id && !c.dead);
export const pocketOf = (m) => Object.entries(m?.pocket ?? {}).map(([id, r]) => ({ ...r, id: r?.id ?? id }));
// Which side of its master's turn a companion acts on: what is chosen for the next round, else what stands, else after (companions.md, A1).
export const sideOf = (c) => c?.bond?.orderNext ?? c?.bond?.order ?? 'after';
const isFamiliar = (c) => c?.bond?.kind === 'familiar' && typeof c.bond.source === 'string';
// The words an order carries, as the party was sent them (text a person typed: always drawn escaped).
export const orderText = (c) => (typeof c?.bond?.commanded?.order === 'string' ? c.bond.commanded.order : typeof c?.bond?.standing === 'string' ? c.bond.standing : '');
const nameOf = (S, c) => {
  const m = S?.entities?.[c?.bond?.to];
  return !m || c.name.startsWith(m.name) ? c?.name ?? '' : `${m.name}'s ${MONSTERS[c.tpl]?.name === c.name ? c.name.toLowerCase() : c.name}`;
};

// ---------- the cast chooser's plan (pure) ----------
// What a summon spell asks of the caster, from the spell's data (`spellProfile`'s `summon`, and the step's `one`): { choices, taps, ... }.
//  choices: [{ key: 'variant'|'type'|'form'|'choice', title, options: [{ v, label }] }]   one pick each, in this order
//  taps:    { kind: 'points', count } | { kind: 'corpses', max, again } | { kind: 'none' }   (`none`: Find Familiar changing its familiar's form)
export const summonCount = (c, slot) => (c === undefined ? 1 : Number.isInteger(c) ? c : (c.base ?? 0) + c.slot * (slot - (c.above ?? 0)));
export const isSummon = (spellId) => !!SPELLS[spellId]?.summon;
export function slotsFor(e, sp) {
  return Object.keys(e.slots ?? {}).map(Number).filter((l) => l >= sp.level && (e.slots[l] ?? 0) > 0).sort((a, b) => a - b);
}
export function summonPlan(S, e, spellId, slot) {
  const sp = SPELLS[spellId], sm = sp?.summon;
  if (!sm) return null;
  const step = sp.def.effects.find((x) => 'summon' in x) ?? {};
  const choices = [];
  if (sm.variants) choices.push({ key: 'variant', title: 'Which?', options: sm.variants.map((v) => ({ v, label: human(v) })) });
  if (sm.types) choices.push({ key: 'type', title: 'Creature type', options: sm.types.map((v) => ({ v, label: human(v) })) });
  if (sm.forms) {
    const ids = Array.isArray(sm.forms) ? sm.forms : Object.keys(MONSTERS).filter((id) => MONSTERS[id].type === sm.forms.type && MONSTERS[id].cr === sm.forms.cr);
    choices.push({ key: 'form', title: 'Form', options: ids.filter((id) => MONSTERS[id]).map((id) => ({ v: id, label: MONSTERS[id].name })) });
  }
  const pickDef = sp.def.choice, list = pickDef ? pickDef.from ?? CHOICES[pickDef.of] ?? null : null;
  if (list) choices.push({ key: 'choice', title: pickDef.of === 'damageType' ? 'Damage type' : human(pickDef.of ?? 'choice'), options: list.map((v) => ({ v, label: human(v) })), extra: true });
  const lvl = slot ?? sp.level;
  // One per master (Find Familiar, Find Steed): a casting while the master has one. A reform names no space; a replace does.
  const had = step.one ? [...companionsOf(S, e), ...pocketOf(e)].some((c) => c.bond?.source === spellId && c.bond.kind === (step.bond?.kind ?? c.bond.kind)) : false;
  let taps;
  if (sm.on === 'corpse') taps = { kind: 'corpses', max: summonCount(sm.count, lvl), again: summonCount(sm.reassert ?? sm.count, lvl) };
  else if (step.one === 'reform' && had) taps = { kind: 'none', note: `${e.name} has a ${sm.kind ?? 'companion'} already: ${sp.name} gives it the new form where it is.` };
  else taps = { kind: 'points', count: summonCount(sm.count, lvl), note: step.one === 'replace' && had ? 'The one you have now goes when the new one comes.' : '' };
  return { id: spellId, name: sp.name, level: sp.level, choices, taps };
}
// What is still to pick, in words ('' when the chooser can send the cast with its picks).
export function summonMissing(plan, m) {
  for (const c of plan.choices) if (!c.extra && !m.pick[c.key]) return `Choose: ${c.title.toLowerCase()}.`;
  if (plan.taps.kind === 'points' && m.at.length < plan.taps.count) return `Tap ${plan.taps.count === 1 ? 'a space' : `${plan.taps.count} spaces`} on the map (${m.at.length} of ${plan.taps.count}).`;
  if (plan.taps.kind === 'corpses' && !m.ids.length) return `Tap up to ${plan.taps.max} corpse${plan.taps.max === 1 ? '' : 's'} on the map, or the creatures you made with it to keep (up to ${plan.taps.again}).`;
  return '';
}
// The cast action the picks make. `summon` is left out altogether when nothing is picked (the engine then hands the spell to the DM): never null.
export function summonAction(plan, m, { bare = false } = {}) {
  const sp = SPELLS[plan.id], out = { type: 'cast', actor: m.actor, spell: plan.id };
  if (sp.level > 0 && m.slot > sp.level) out.slot = m.slot;
  if (m.pick.choice) out.choice = m.pick.choice;
  else { const c = plan.choices.find((x) => x.key === 'choice'); if (c) out.choice = c.options[0].v; }       // a cast without it is refused; the first one is the engine's own default (app.js chosen())
  if (bare) return out;
  const s = {};
  for (const k of ['variant', 'type', 'form']) if (m.pick[k]) s[k] = m.pick[k];
  if (plan.taps.kind === 'corpses') out.summon = { ids: [...m.ids] };
  else if (plan.taps.kind === 'points') out.summon = { ...s, at: m.at.map((h) => ({ q: h.q, r: h.r, ...(h.z !== undefined ? { z: h.z } : {}) })) };
  else out.summon = s;
  return out;
}

// ---------- the rows (pure) ----------
// The companion rows of one creature's Features tab and Move tab: { features: [], move: [] }, in the shape actionpanel.js draws (`kind: 'comp'`).
// `dry(action)` is the engine's answer to the action ('' = it would be accepted). `fight`: whether `e` is in a fight now.
const row = (r) => ({ kind: 'comp', sub: '', why: '', armed: false, time: null, chip: '', ...r });
export function companionRows(S, e, dry, { open = null } = {}) {
  const out = { features: [], move: [] };
  if (!e || e.dead) return out;
  const fight = !!S.encounter && inFight(S, e.id), mine = companionsOf(S, e), pocket = pocketOf(e);
  const first = (list) => (list.length && list.every((x) => x.why) ? list[0].why : '');
  // Command: one Bonus Action in a fight, nothing outside one; the engine refuses a creature out of range or one that takes no orders.
  const cmd = mine.filter((c) => c.bond.orders === 'command');
  if (cmd.length) {
    const why = first(cmd.map((c) => ({ why: dry({ type: 'command', actor: e.id, ids: [c.id] }) })));
    out.features.push(row({ id: 'comp:command', op: 'command', label: 'Command…', sub: cmd.map((c) => nameOf(S, c)).join(', '), chip: fight ? 'Bonus' : 'Free', time: fight ? 'bonus' : null, why, armed: open?.op === 'command' }));
  }
  // The steed's choice of before or after (A1): what it will do is `orderNext ?? order ?? 'after'`.
  for (const c of mine.filter((x) => x.bond.turn && x.bond.turn !== 'own')) {
    const now = sideOf(c), other = SIDES.find((x) => x !== now);
    out.features.push(row({ id: `comp:side:${c.id}`, op: 'side', target: c.id, order: other, label: `${nameOf(S, c)} acts ${now} you`,
      sub: `Tap to act ${other} you${fight ? ' from the next round' : ''}${c.bond.orderNext ? ` (now chosen: ${c.bond.orderNext})` : ''}`, why: dry({ type: 'companionOrder', actor: e.id, id: c.id, order: other }) }));
  }
  // Dismiss: a familiar to its pocket dimension or for good (a Magic action); a creature kept by a spell that lasts, for free.
  if (mine.length || pocket.length) {
    const list = [...mine, ...pocket.map((p) => ({ ...p, inPocket: true }))];
    const why = first(list.map((c) => ({ why: dry({ type: 'dismiss', actor: e.id, id: c.id, ...(c.inPocket || isFamiliar(c) ? { forever: true } : {}) }) })));
    out.features.push(row({ id: 'comp:dismiss', op: 'dismiss', label: 'Dismiss…', sub: 'Send away a companion', chip: mine.some(isFamiliar) ? 'Magic action' : '', why, armed: open?.op === 'dismiss' }));
  }
  if (pocket.length) {
    // The engine wants a space it only checks when it gets one: with none it says "Pick a space" once everything else is in order.
    const why = first(pocket.map((p) => { const r = dry({ type: 'recall', actor: e.id, id: p.id }); return { why: /^Pick a space/.test(r) ? '' : r }; }));
    out.features.push(row({ id: 'comp:recall', op: 'recall', label: 'Recall…', sub: `${pocket.map((p) => p.name).join(', ')} in the pocket dimension`, chip: 'Magic action', time: fight ? 'action' : null, why, armed: open?.op === 'recall' }));
  }
  // Let it act: the engine plays the companion on its own turn, or waits for its player.
  if (mine.length) {
    out.features.push(row({ id: 'comp:auto', op: 'auto', label: 'Let it act…', sub: mine.map((c) => `${nameOf(S, c)} ${c.bond.auto ? 'acts on its own' : 'waits for you'}`).join(' · '),
      why: first(mine.map((c) => ({ why: dry({ type: 'companion', actor: c.id, auto: !c.bond.auto }) }))), armed: open?.op === 'auto' }));
  }
  // A touch spell delivered by the familiar (cast { deliver }): the spell is armed as any is, and the familiar delivers it.
  const fams = mine.filter(isFamiliar);
  for (const f of fams) for (const id of e.spells ?? []) {
    const sp = SPELLS[id];
    if (!sp || sp.def.range !== 'touch' || sp.aim !== 'creature') continue;
    const target = Object.values(S.entities).find((x) => x.id !== e.id && !x.dead && x.pos);
    const r = target ? dry({ type: 'cast', actor: e.id, spell: id, target: target.id, deliver: f.id }) : '';
    out.features.push(row({ id: `comp:deliver:${f.id}:${id}`, op: 'deliver', spell: id, familiar: f.id, label: `${sp.name} through ${nameOf(S, f)}`, sub: 'Its Reaction delivers the touch', chip: 'Familiar',
      why: /familiar|Reaction|\b100 ft\b|Touch|is down/.test(r) && !/^Pick /.test(r) ? r : (sp.level > 0 && !(e.slots?.[sp.level] > 0) ? `${e.name} has no level ${sp.level} spell slots left.` : '') }));
  }
  // Riding. Mount: whom; Dismount: at once (half its Speed). A creature carrying a rider says so.
  if (e.riding) {
    const m = S.entities[e.riding.on];
    out.move.push(row({ id: 'comp:dismount', op: 'dismount', label: 'Dismount', sub: `Get down from ${m ? nameOf(S, m) : 'its mount'} · half your Speed`, why: dry({ type: 'dismount', actor: e.id }), time: null, chip: 'Half Speed' }));
  } else if (e.rider) {
    const r = S.entities[e.rider];
    out.move.push(row({ id: 'comp:carry', op: 'none', kind: 'none', label: `Carrying ${r ? nameOf(S, r) : 'a rider'}`, sub: 'The rider moves and acts for both', time: null }));
  } else {
    const cand = mountCandidates(S, e);
    if (cand.length) out.move.push(row({ id: 'comp:mount', op: 'mount', label: 'Mount…', sub: 'Climb onto a creature beside you · half your Speed', chip: 'Half Speed', armed: open?.op === 'mount',
      why: first(cand.map((c) => ({ why: dry({ type: 'mount', actor: e.id, mount: c.id }) }))) }));
  }
  return out;
}
// Whom a creature might ride: the creatures of its side that are not characters, as the view sent them. Which of them it may is the engine's to say.
export const mountCandidates = (S, e) => Object.values(S.entities).filter((x) => x.id !== e.id && !x.dead && x.side === e.side && x.kind !== 'pc' && !x.riding && !x.rider && !x.hidden);

// ---------- the pickers (pure HTML) ----------
const btn = (attrs, label, why, extra = '') => `<button type="button" ${attrs} aria-disabled="${why ? 'true' : 'false'}"${why ? ' class="off"' : ''}>${esc(label)}${extra}${why ? `<small class="ap-why">${esc(why)}</small>` : ''}</button>`;
// What an open picker draws above the rows of a tab: { html }. `open`: { op, actor, draft?, picked? }.
export function pickerHtml(S, e, open, dry) {
  if (!open || open.actor !== e.id) return '';
  const mine = companionsOf(S, e), pocket = pocketOf(e), cancel = '<button type="button" data-cc-cancel>Cancel</button>';
  const wrap = (title, body) => `<div class="ap-pick cc-pick" role="group" aria-label="${esc(title)}" data-cc-open="${esc(open.op)}"><span>${esc(title)}</span>${body}${cancel}</div>`;
  if (open.op === 'command') {
    const cmd = mine.filter((c) => c.bond.orders === 'command');
    const boxes = cmd.map((c) => {
      const why = dry({ type: 'command', actor: e.id, ids: [c.id] }), on = !why && !open.unchecked?.includes(c.id);
      return `<label class="cc-check${why ? ' off' : ''}"><input type="checkbox" data-cc-id="${esc(c.id)}"${on ? ' checked' : ''}${why ? ' disabled' : ''}> ${esc(nameOf(S, c))}${why ? `<small class="ap-why">${esc(why)}</small>` : ''}</label>`;
    }).join('');
    const standing = cmd.map((c) => orderText(c) && `${nameOf(S, c)}: ${orderText(c)}`).filter(Boolean);
    return wrap('Command which?', `${boxes}<label class="cc-order">Order <input type="text" data-cc-order maxlength="80" autocomplete="off" placeholder="guard the door (optional)" value="${esc(open.draft ?? '')}"></label>` +
      `${standing.length ? `<small class="ap-s">Standing: ${esc(standing.join(' · '))}</small>` : ''}<button type="button" data-cc-send="command">Command</button>`);
  }
  if (open.op === 'dismiss') {
    const list = [...mine.map((c) => ({ ...c })), ...pocket.map((p) => ({ ...p, inPocket: true }))];
    return wrap('Dismiss which?', list.map((c) => {
      const fam = c.inPocket || isFamiliar(c);
      const away = c.inPocket ? '' : btn(`data-cc-dismiss="${esc(c.id)}"`, fam ? `${nameOf(S, c)}: to its pocket` : `Dismiss ${nameOf(S, c)}`, dry({ type: 'dismiss', actor: e.id, id: c.id }));
      const gone = fam ? btn(`data-cc-dismiss="${esc(c.id)}" data-forever="1"`, `${c.inPocket ? c.name : nameOf(S, c)}: for good`, dry({ type: 'dismiss', actor: e.id, id: c.id, forever: true })) : '';
      return away + gone;
    }).join(''));
  }
  if (open.op === 'recall') return wrap('Recall which?', pocket.map((p) => { const r = dry({ type: 'recall', actor: e.id, id: p.id }); return btn(`data-cc-recall="${esc(p.id)}"`, p.name, /^Pick a space/.test(r) ? '' : r); }).join(''));
  if (open.op === 'mount') return wrap('Mount which?', mountCandidates(S, e).map((c) => btn(`data-cc-mount="${esc(c.id)}"`, nameOf(S, c), dry({ type: 'mount', actor: e.id, mount: c.id }))).join('') || '<small class="ap-s">Nobody here to ride.</small>');
  if (open.op === 'auto') return wrap('Let it act on its own?', mine.map((c) => btn(`data-cc-auto="${esc(c.id)}"`, `${nameOf(S, c)}: ${c.bond.auto ? 'wait for me' : 'act on its own'}`, dry({ type: 'companion', actor: c.id, auto: !c.bond.auto }))).join(''));
  return '';
}

// The line under a companion's name on its card: what it is, and whose turn.
export function subLine(S, e) {
  if (!e?.bond) return '';
  const bits = [], enc = S.encounter;
  if (enc && current(S) === e.id) bits.push(e.bond.commanded ? 'commanded this turn' : 'its turn');
  const o = orderText(e);
  if (o) bits.push(`order: ${o}`);
  if (e.riding) bits.push('being ridden');
  return bits.join(' · ');
}

// ---------- the page ----------
// ctx: { state(), isDM(), act(a), toast(m), dry(a), setMode(m), move (the idle mode), render() }
export function initCompanions(ctx) {
  let open = null, el = null;
  const $ = (id) => document.getElementById(id);
  const S0 = () => ctx.state();
  const dryNow = (a) => ctx.dry(a);

  // The cast chooser's panel. Built once, shown while the mode is `summon`.
  function panel() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'cc-chooser'; el.hidden = true; el.setAttribute('role', 'group');
    document.body.append(el);
    el.addEventListener('click', onChooser);
    return el;
  }
  const modeNow = () => { const m = ctx.mode(); return m?.kind === 'summon' ? m : null; };
  function openChooser(e, spellId) {
    const sp = SPELLS[spellId], slots = slotsFor(e, sp);
    ctx.setMode({ kind: 'summon', actor: e.id, id: spellId, slot: sp.level > 0 ? (slots[0] ?? sp.level) : 0, pick: {}, at: [], ids: [] });
  }
  function onChooser(ev) {
    const b = ev.target.closest('button'); if (!b) return;
    const m = modeNow(), S = S0(), e = m && S.entities[m.actor]; if (!m || !e) return;
    const plan = summonPlan(S, e, m.id, m.slot);
    if (b.dataset.ccCancel !== undefined) return ctx.setMode(ctx.move);
    if (b.dataset.ccPick) {
      const [k, v] = b.dataset.ccPick.split('|');
      if (m.pick[k] === v && k !== 'choice') delete m.pick[k]; else m.pick[k] = v;
      return ctx.render();
    }
    if (b.dataset.ccSlot) { m.slot = Number(b.dataset.ccSlot); m.at.length = Math.min(m.at.length, summonPlan(S, e, m.id, m.slot).taps.count ?? 0); return ctx.render(); }
    if (b.dataset.ccUndo !== undefined) { if (m.at.length) m.at.pop(); else m.ids.pop(); return ctx.render(); }
    if (b.dataset.ccCast !== undefined) {
      const bare = b.dataset.ccCast === 'bare', miss = bare ? '' : summonMissing(plan, m);
      if (miss) return ctx.toast(miss);
      const action = summonAction(plan, m, { bare }), why = dryNow(action);
      if (why) return ctx.toast(why);                      // the engine's words; the picks stay so they can be changed
      ctx.act(action); ctx.setMode(ctx.move);
    }
  }
  // Draw the chooser for the current mode (or hide it). Returns the highlights the map should show: { area, targets, allies }.
  function render() {
    const m = modeNow(), p = panel(), S = S0(), e = m && S.entities[m.actor];
    if (!m || !e) { p.hidden = true; if (p.dataset.sig) { p.dataset.sig = ''; p.textContent = ''; } return null; }
    const plan = summonPlan(S, e, m.id, m.slot), sp = SPELLS[m.id], slots = slotsFor(e, sp), miss = summonMissing(plan, m);
    const group = (c) => `<div class="cc-group" role="group" aria-label="${esc(c.title)}"><span class="cc-t">${esc(c.title)}</span>${c.options.map((o) => {
      const on = (m.pick[c.key] ?? (c.extra ? c.options[0].v : '')) === o.v;
      return `<button type="button" data-cc-pick="${esc(c.key)}|${esc(o.v)}" aria-pressed="${on}">${esc(o.label)}</button>`;
    }).join('')}</div>`;
    const taps = plan.taps.kind === 'points' ? `${plan.taps.count === 1 ? 'Tap a space' : `Tap ${plan.taps.count} spaces`} on the map: ${m.at.length} of ${plan.taps.count}${plan.taps.note ? `. ${plan.taps.note}` : ''}`
      : plan.taps.kind === 'corpses' ? `Tap up to ${plan.taps.max} corpse${plan.taps.max === 1 ? '' : 's'} on the map to raise (or up to ${plan.taps.again} of yours to keep): ${m.ids.length} chosen${m.ids.length ? `: ${m.ids.map((id) => esc(S.entities[id]?.name ?? 'someone')).join(', ')}` : ''}`
      : esc(plan.taps.note);
    const html = `<div class="cc-head"><b>${esc(plan.name)}</b><span class="cc-sub">${esc(e.name)}</span></div>` +
      (slots.length > 1 ? `<div class="cc-group" role="group" aria-label="Cast at level"><span class="cc-t">Cast at level</span>${slots.map((l) => `<button type="button" data-cc-slot="${l}" aria-pressed="${l === m.slot}">${l}</button>`).join('')}</div>` : '') +
      plan.choices.map(group).join('') + `<p class="cc-taps" role="status">${taps}</p>` +
      `<div class="cc-go"><button type="button" data-cc-cast="picks" aria-disabled="${miss ? 'true' : 'false'}"${miss ? ' class="off"' : ''}>Cast</button>` +
      `${m.at.length || m.ids.length ? '<button type="button" data-cc-undo>Undo last</button>' : ''}` +
      `<button type="button" data-cc-cast="bare" title="Cast it and let the DM add what it makes">Cast, DM adds it</button><button type="button" data-cc-cancel>Cancel</button></div>` +
      `${miss ? `<small class="cc-miss">${esc(miss)}</small>` : ''}`;
    if (p.dataset.sig !== html) { p.dataset.sig = html; const keep = document.activeElement?.closest?.('#cc-chooser') ? document.activeElement.getAttribute('data-cc-pick') : null; p.innerHTML = html; if (keep) p.querySelector(`[data-cc-pick="${CSS.escape(keep)}"]`)?.focus({ preventScroll: true }); }
    p.hidden = false;
    // Where the map shows the picks: the chosen spaces, and the corpses that can be tapped.
    const area = m.at.map((h) => `${h.q},${h.r}`);
    const dead = Object.values(S.entities).filter((x) => x.dead && !x.vanished && x.kind !== 'pc').map((x) => x.id);
    return { area, targets: plan.taps.kind === 'corpses' ? [...dead.filter((id) => !m.ids.includes(id))] : [], allies: plan.taps.kind === 'corpses' ? [...m.ids] : [] };
  }
  // A tap on the map while a summon or a recall is armed. Returns true when it was ours.
  function tap(mode, hex, id) {
    const S = S0();
    if (mode.kind === 'recall') {
      if (!hex) return true;
      const action = { type: 'recall', actor: mode.actor, id: mode.id, at: { q: hex.q, r: hex.r } }, why = dryNow(action);
      if (why) { ctx.toast(why); return true; }
      ctx.act(action); ctx.setMode(ctx.move); return true;
    }
    if (mode.kind !== 'summon') return false;
    const e = S.entities[mode.actor]; if (!e) return true;
    const plan = summonPlan(S, e, mode.id, mode.slot);
    if (plan.taps.kind === 'corpses') {
      if (!id || !S.entities[id]) { ctx.toast('Tap a corpse.'); return true; }
      const i = mode.ids.indexOf(id);
      if (i >= 0) mode.ids.splice(i, 1);
      else if (mode.ids.length >= Math.max(plan.taps.max, plan.taps.again)) ctx.toast(`At most ${Math.max(plan.taps.max, plan.taps.again)} at this level.`);
      else mode.ids.push(id);
    } else if (plan.taps.kind === 'points') {
      if (!hex) return true;
      const h = { q: hex.q, r: hex.r };
      const i = mode.at.findIndex((x) => x.q === h.q && x.r === h.r);
      if (i >= 0) mode.at.splice(i, 1);                       // tap again to take it back
      else if (mode.at.length >= plan.taps.count) mode.at[mode.at.length - 1] = h;
      else mode.at.push(h);
    } else ctx.toast('Nothing to tap: it changes the form where it stands.');
    ctx.render(); return true;
  }
  // The hint line for an armed recall.
  const hintFor = (mode) => (mode.kind === 'recall' ? `Tap a space within 30 ft of ${S0().entities[mode.actor]?.name ?? 'the caster'} to call ${mode.name} back` : '');

  // ---- the rows' own controls, bound on the panes that carry them ----
  function bindPane(pane) {
    pane.addEventListener('click', (ev) => {
      const S = S0(), e = S.entities[ctx.selected()]; if (!e) return;
      const t = ev.target.closest('[data-cc-cancel],[data-cc-send],[data-cc-dismiss],[data-cc-recall],[data-cc-mount],[data-cc-auto]'); if (!t) return;
      const send = (a) => { const why = dryNow(a); if (why && !/^Pick a space/.test(why)) return ctx.toast(why); open = null; ctx.act(a); ctx.render(); };
      if (t.dataset.ccCancel !== undefined) { open = null; return ctx.render(); }
      if (t.getAttribute('aria-disabled') === 'true') { const w = t.querySelector('.ap-why')?.textContent; return w && ctx.toast(w); }
      if (t.dataset.ccSend === 'command') {
        const ids = [...pane.querySelectorAll('[data-cc-id]')].filter((x) => x.checked && !x.disabled).map((x) => x.dataset.ccId);
        if (!ids.length) return ctx.toast('Tick the creatures to command.');
        const text = (pane.querySelector('[data-cc-order]')?.value ?? '').trim();
        return send({ type: 'command', actor: e.id, ids, ...(text ? { order: text } : {}) });
      }
      if (t.dataset.ccDismiss) return send({ type: 'dismiss', actor: e.id, id: t.dataset.ccDismiss, ...(t.dataset.forever ? { forever: true } : {}) });
      if (t.dataset.ccMount) return send({ type: 'mount', actor: e.id, mount: t.dataset.ccMount });
      if (t.dataset.ccAuto) { const c = S.entities[t.dataset.ccAuto]; return c && send({ type: 'companion', actor: c.id, auto: !c.bond?.auto }); }
      if (t.dataset.ccRecall) { const p = pocketOf(e).find((x) => x.id === t.dataset.ccRecall); open = null; ctx.setMode({ kind: 'recall', actor: e.id, id: t.dataset.ccRecall, name: p?.name ?? 'it' }); }
    });
    // The order being typed is kept as it is typed, so a redraw of the pane (every update of the game) gives it back.
    pane.addEventListener('input', (ev) => { if (open && ev.target.matches('[data-cc-order]')) open.draft = ev.target.value; });
    pane.addEventListener('change', (ev) => {
      if (!open || !ev.target.matches('[data-cc-id]')) return;
      open.unchecked = [...pane.querySelectorAll('[data-cc-id]')].filter((x) => !x.checked && !x.disabled).map((x) => x.dataset.ccId);
    });
    pane.addEventListener('focusin', (ev) => { if (open && ev.target.matches('[data-cc-order]')) open.focus = true; });
    pane.addEventListener('focusout', (ev) => { if (open && ev.target.matches('[data-cc-order]')) open.focus = false; });
  }

  return {
    openChooser, render, tap, hintFor, bindPane,
    isOpen: () => !!open,
    fresh() { open = null; },
    // A row of the panel was tapped (kinds `comp`).
    run(e, r) {
      if (r.op === 'side') return ctx.act({ type: 'companionOrder', actor: e.id, id: r.target, order: r.order });
      if (r.op === 'dismount') return ctx.act({ type: 'dismount', actor: e.id });
      if (r.op === 'deliver') return ctx.setMode({ kind: 'spell', id: r.spell, aim: null, keep: false, picked: [], deliver: r.familiar });
      if (['command', 'dismiss', 'recall', 'mount', 'auto'].includes(r.op)) { open = open?.op === r.op && open.actor === e.id ? null : { op: r.op, actor: e.id, draft: open?.op === 'command' ? open.draft : '' }; return ctx.render(); }
    },
    // The rows and the open picker for `e`.
    rows(e) { const S = S0(); return companionRows(S, e, dryNow, { open: open?.actor === e.id ? open : null }); },
    picker(e) { return pickerHtml(S0(), e, open, dryNow); },
    subLine(e) { return subLine(S0(), e); },
    // After a pane was drawn: give the order field back its focus (a redraw replaced it).
    after(pane) {
      if (open?.focus) { const f = pane.querySelector('[data-cc-order]'); if (f && document.activeElement !== f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(f.value.length, f.value.length); } catch { /* not a text field */ } } }
    },
  };
}
