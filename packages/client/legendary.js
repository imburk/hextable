// The DM's screen for legendary actions (docs/specs/legendary.md, Decisions 3, 5, 9 and 10; stage L4a).
// While `state.encounter.between` is set the table waits between two turns. The DM is shown one row for each creature offered: after whose turn, the creature,
// "Legendary n/m", a button for each option it may take, Skip for it and Done for all of them. An option that is run by hand (`manual`) or aims at nothing is
// one tap; one with a move or an aim arms the ordinary aim bar (the hint bar and the map): the destination first, then the target or the spot, then Send, which sends one
// `legendary` action. This module decides no rule: what is offered, what it costs and whether an action is allowed are the engine's, and a refusal is shown in its own words.
// A player is sent `between: true` and nothing more: the turn line says "Waiting for the DM" (tracker.js); there is no bar for them.
//
//   const LG = initLegendary({ mount, state, isDM, act, toast, dry, mode, setMode, move, render });
//   LG.sync()                     after every update: draws the bar (or hides it)
//   LG.tap(mode, hex, id)         a tap on the map while an option is armed -> true if it was this module's
//   LG.hintFor(mode)              the words of the aim bar for an armed option
//   LG.render()                   the highlights of an armed option: { move, moveBand, area, targets } or null
//   LG.fresh()                    a new table: forget what was armed
//
// The pure helpers (counts, what an option needs, the switches of DM tools › Creatures) are exported and tested apart (test/legendary.test.js).
import { moveOptions, areaHexes, areaTargets, actionSpent, hostile, targetsFor, up, FT } from './shared/engine.js';
import { actionProfile } from './shared/effects.js';
import { speedOf } from './shared/modifiers.js';
import { key as cellKey, col as cellCol } from './shared/grid.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const RESISTANCE = 'legendary-resistance';

// ---------- counts (as engine/legendary.js and engine/shared.js reckon them) ----------
// What it may spend in all: the lair's number when the DM has marked it in its lair. Spent, not left, is what the creature keeps.
export const usesMax = (e) => (e?.legend?.lair && e.legendary?.lair?.uses) || e?.legendary?.actions?.uses || 0;
export const usesLeft = (e) => Math.max(0, usesMax(e) - (e?.legend?.acts ?? 0));
export const resistMax = (e) => (e?.legend?.lair && e.legendary?.lair?.resistance) || e?.legendary?.resistance?.day || 0;
export const resistLeft = (e) => Math.max(0, resistMax(e) - (e?.legend?.resisted ?? 0));
export const isLegendary = (e) => !!(e && (e.legendary?.actions || e.legendary?.resistance) && e.legend);
// "Legendary 2/3 · Resistance 3/3": what Turns says under a legendary creature's row (the DM's alone).
export function countsText(e) {
  if (!isLegendary(e)) return '';
  const parts = [];
  if (e.legendary.actions) parts.push(`Legendary ${usesLeft(e)}/${usesMax(e)}`);
  if (e.legendary.resistance) parts.push(`Resistance ${resistLeft(e)}/${resistMax(e)}`);
  return parts.join(' · ');
}

// ---------- the window ----------
// The rows of the bar: who is still to choose, in the order the engine offered them. `between` is the DM's record ({ after, offered, done }); anything else gives no rows.
export function windowRows(S) {
  const w = S?.encounter?.between;
  if (!w || typeof w !== 'object' || !Array.isArray(w.offered)) return [];
  return w.offered.filter((id) => !w.done?.includes(id)).map((id) => S.entities[id]).filter((e) => e && e.legendary?.actions?.options);
}
export const afterWords = (S) => {
  const w = S?.encounter?.between;
  const e = typeof w === 'object' && w ? S.entities[w.after] : null;
  return e ? `after ${e.name}'s turn` : 'between turns';
};

// The action an option runs (its own action, or its effects made into one, as the engine does), or null for an option that is `manual` alone.
export function defOf(e, opt, pick) {
  if (opt.use?.length) {
    const id = pick ?? (opt.use.length === 1 ? opt.use[0] : null);
    return (e.actions ?? []).find((x) => x.id === id && !x.multiattack) ?? null;
  }
  return opt.effects ? { id: opt.id, name: opt.name, target: opt.target ?? { self: true }, effects: opt.effects } : null;
}
// Which of an option's own actions are usable now: a spent breath cannot be "used".
const usable = (e, opt) => (opt.use ?? []).filter((id) => { const d = (e.actions ?? []).find((x) => x.id === id); return d && !actionSpent(e, d); });

// Whether an option can be tried at all, and why not in words. Only what is plain from the creature: the engine judges the rest when it is sent.
export function optionState(e, opt) {
  const cost = opt.cost ?? 1, left = usesLeft(e);
  if (cost > left) return { ok: false, why: left < 1 ? `${e.name} has no legendary action left.` : `${opt.name} costs ${cost}; ${e.name} has ${left} left.` };
  if (opt.again && e.legend?.again?.[opt.id]) return { ok: false, why: `${opt.name} can't be taken again until the start of ${e.name}'s next turn.` };
  if (opt.use?.length && !usable(e, opt).length) return { ok: false, why: `${opt.name}: ${opt.use.length > 1 ? 'those actions are' : 'that action is'} spent.` };
  return { ok: true, why: '' };
}

// What taking an option needs from the DM, step by step: `pick` (one of two actions), `move` (where it ends), `aim` ('creature' or 'area'). No steps: one tap.
export function stepsOf(e, opt, pick) {
  const steps = [];
  if (opt.use?.length > 1 && usable(e, opt).length > 1) steps.push('pick');
  if (opt.move) steps.push('move');
  const def = defOf(e, opt, pick ?? (opt.use?.length > 1 && usable(e, opt).length === 1 ? usable(e, opt)[0] : undefined));
  if (def) { const p = actionProfile(def); if (p.aim === 'creature' || p.aim === 'area') steps.push('aim'); }
  return steps;
}

// ---------- the switches of DM tools > Creatures ----------
export const INSTRUCTION = { matters: 'Only when it matters', ask: 'Ask me every time', always: 'Every failed save', never: 'Never' };
const ORDER = ['matters', 'ask', 'always', 'never'];
// The legendary creatures on the table, for the switches. `instruction(e)` is the creature's own setting (the default when none).
export function creatureRows(S) {
  return Object.values(S?.entities ?? {}).filter((e) => isLegendary(e) && !e.dead && !e.object);
}
// The lair and show switches of one creature (the DM's: `legendarySet`), without the instruction. Drawn in DM tools and on the creature's own Reactions tab.
export const lairShowHtml = (e) => `<label class="check"><input type="checkbox" data-lg-set="lair"${e.legend.lair ? ' checked' : ''}${e.legendary.lair ? '' : ' disabled'}> In its lair${e.legendary.lair ? '' : ' (it has no lair numbers)'}</label>
      <label class="check"><input type="checkbox" data-lg-set="show"${e.legend.show ? ' checked' : ''}${e.legendary.actions ? '' : ' disabled'}> Show its legendary uses to the players</label>`;
export function creaturesHtml(S) {
  const rows = creatureRows(S);
  if (!rows.length) return '<p class="note">No legendary creature on the table. Add a dragon, a lich or another from the list above.</p>';
  const on = S?.settings?.legendaryWindows === true, lr = S?.settings?.legendaryResistance === true;
  return `${on && lr ? '' : `<p class="note">${!on ? 'The pause between turns for legendary actions is off. ' : ''}${!lr ? 'Legendary Resistance is not offered at failed saves. ' : ''}Both are switches in Table rules.</p>`}${rows.map((e) => {
    const now = e.reactions?.[RESISTANCE] ?? 'matters';
    return `<div class="lg-cr" data-id="${esc(e.id)}"><div class="lg-cr-head"><b>${esc(e.name)}</b><span>${esc(countsText(e))}</span></div>
      ${e.legendary.resistance ? `<label class="assign">Legendary Resistance <select data-lg-rx aria-label="Legendary Resistance for ${esc(e.name)}">${ORDER.map((o) => `<option value="${o}"${o === now ? ' selected' : ''}>${esc(INSTRUCTION[o])}</option>`).join('')}</select></label>` : ''}
      ${lairShowHtml(e)}</div>`;
  }).join('')}`;
}
// Bind the switches drawn by `creaturesHtml` (or by the sheet's own copy) in `root`.
export function bindSwitches(root, act) {
  root.addEventListener('change', (ev) => {
    const row = ev.target.closest('[data-id]'), id = row?.dataset.id;
    if (!id) return;
    if (ev.target.matches('[data-lg-rx]')) act({ type: 'reactions', actor: id, set: { [RESISTANCE]: ev.target.value } });
    else if (ev.target.matches('[data-lg-set]')) act({ type: 'legendarySet', actor: id, set: { [ev.target.dataset.lgSet]: ev.target.checked } });
  });
}

// ---------- the bar ----------
// ctx: { mount, state(), isDM(), act(a), toast(m), dry(a), mode(), setMode(m), move (the idle mode), render() }
export function initLegendary(ctx) {
  const { mount } = ctx;
  mount.id = 'lg'; mount.hidden = true; mount.setAttribute('role', 'region'); mount.setAttribute('aria-label', 'Legendary actions');
  let sig = '', sent = null;
  const S = () => ctx.state();
  const armed = () => { const m = ctx.mode(); return m?.kind === 'legendary' ? m : null; };

  const optionHtml = (e, opt) => {
    const st = optionState(e, opt), cost = opt.cost ?? 1;
    return `<button type="button" class="lg-opt${st.ok ? '' : ' off'}" data-opt="${esc(opt.id)}" ${st.ok ? '' : `aria-disabled="true" data-why="${esc(st.why)}"`} title="${esc(opt.text ?? '')}"><span class="lg-oname">${esc(opt.name)}${cost > 1 ? ` <i>(${cost} uses)</i>` : ''}</span><small>${esc(st.ok ? (opt.manual && !opt.use && !opt.effects && !opt.move ? 'You run it' : opt.text ?? '') : st.why)}</small></button>`;
  };
  const rowHtml = (e) => `<div class="lg-row" data-id="${esc(e.id)}"><div class="lg-who"><b>${esc(e.name)}</b><span class="lg-count">Legendary ${usesLeft(e)}/${usesMax(e)}</span></div>
    <div class="lg-opts">${e.legendary.actions.options.map((o) => optionHtml(e, o)).join('')}</div>
    <button type="button" class="lg-skip" data-skip="${esc(e.id)}">Skip</button></div>`;

  function draw() {
    const s = S(), rows = ctx.isDM() && s && !s.pending ? windowRows(s) : [];      // a question waiting (a reaction, Legendary Resistance) is answered first
    const m = armed();
    if (m && !s?.pending && (!rows.some((e) => e.id === m.actor) || !ctx.isDM())) ctx.setMode(ctx.move);      // the window moved on without it
    if (!rows.length) { mount.hidden = true; mount.textContent = ''; sig = ''; document.body.classList.remove('lg-open'); return; }
    const am = armed();
    if (am) return drawArmed(s, am);
    const html = `<div class="lg-head"><b>Legendary actions</b><span>${esc(afterWords(s))}</span><button type="button" class="lg-done" data-done>Done</button></div>${rows.map(rowHtml).join('')}<p class="lg-err" role="alert" hidden></p>`;
    mount.hidden = false; document.body.classList.add('lg-open');
    if (html !== sig) { sig = html; mount.innerHTML = html; }
  }

  // One handler for the whole bar: it is redrawn on every change.
  mount.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !ctx.isDM()) return;
    const s = S();
    const m = armed();
    if (m && b.dataset.do === 'cancel') return ctx.setMode(ctx.move);
    if (m && b.dataset.do === 'nomove') return goOn(m);
    if (m && b.dataset.do === 'send') return sendArmed(m);
    if (m && b.dataset.pick) { m.pick = b.dataset.pick; m.steps = m.steps.filter((x) => x !== 'aim'); const h = here(m); if (h && actionProfile(defNow(h.e, h.opt, m)).aim !== 'self') m.steps.push('aim'); return goOn(m); }
    if (b.hasAttribute('data-done')) return send({ type: 'legendary', done: true });
    if (b.dataset.skip) return send({ type: 'legendary', actor: b.dataset.skip, skip: true });
    if (b.dataset.opt) {
      if (b.getAttribute('aria-disabled') === 'true') return ctx.toast(b.dataset.why || 'Not now.');
      const e = s.entities[b.closest('.lg-row').dataset.id], opt = e?.legendary?.actions?.options.find((o) => o.id === b.dataset.opt);
      if (!e || !opt) return;
      const steps = stepsOf(e, opt);
      if (!steps.length) return send({ type: 'legendary', actor: e.id, option: opt.id });
      return arm(e, opt);
    }
  });
  // Sent through the engine's own answer first: a refusal is shown in its words and nothing is sent.
  function send(action) {
    const why = ctx.dry(action);
    if (why) return ctx.toast(why);
    ctx.act(action);
  }
  // ---- an option that moves or aims: the aim bar ----
  const here = (m) => { const s = S(), e = s.entities[m.actor], opt = e?.legendary?.actions?.options.find((o) => o.id === m.option); return e && opt ? { s, e, opt } : null; };
  const step = (m) => m.steps[m.i] ?? 'send';
  function arm(e, opt) {
    const m = { kind: 'legendary', actor: e.id, option: opt.id, pick: undefined, steps: stepsOf(e, opt), i: 0, to: null, stop: null, target: null, hex: null };
    ctx.setMode(m);
  }
  // Where the move part may end: the engine's own search from a budget of the option's own (half or full of the Speed it moves in), as `legendaryStop` makes it.
  function reach(s, e, opt) {
    const mv = opt.move, speed = speedOf(s, e, mv.mode ?? 'walk');
    const feet = mv.speed === 'full' ? speed : Math.floor(speed / 2 / FT) * FT;
    const bud = { move: feet, dashes: -1, diagonals: 0, out: true, ...(mv.provokes === false ? { free: true } : {}) };
    const as = { ...s, encounter: { ...s.encounter, turn: s.encounter.order.findIndex((o) => o.id === e.id), budget: bud } };
    try { return { feet, stops: [...moveOptions(as, e, { through: true }).entries()].filter(([, v]) => v.canStop) }; } catch { return { feet, stops: [] }; }
  }
  const stopAt = (stops, hex) => stops.map(([, v]) => v).filter((v) => cellCol(v.h) === cellCol(hex) && (hex.z === undefined || v.h.z === hex.z))[0]
    ?? stops.map(([, v]) => v).filter((v) => cellCol(v.h) === cellCol(hex))[0] ?? null;
  // The creature as it will stand after the move, for judging reach and the area from there.
  const after = (s, e, m) => (m.stop ? { ...s, entities: { ...s.entities, [e.id]: { ...e, pos: { ...m.stop } } } } : s);
  const defNow = (e, opt, m) => defOf(e, opt, m.pick ?? (opt.use?.length > 1 && usable(e, opt).length === 1 ? usable(e, opt)[0] : undefined));
  const foesOf = (s, e, def) => { try { return targetsFor(s, s.entities[e.id], { action: def.id }).filter((id) => s.entities[id] && hostile(s.entities[id], e)); } catch { return null; } };

  function drawArmed(s, m) {
    const h = here(m);
    if (!h) { ctx.setMode(ctx.move); return; }
    const { e, opt } = h, st = step(m);
    const words = hintFor(m);
    const btn = (k, label, cls = '') => `<button type="button" class="lg-b ${cls}" data-do="${k}">${esc(label)}</button>`;
    const picks = st === 'pick' ? opt.use.filter((id) => usable(e, opt).includes(id)).map((id) => `<button type="button" class="lg-b" data-pick="${esc(id)}">${esc((e.actions ?? []).find((a) => a.id === id)?.name ?? id)}</button>`).join('') : '';
    const html = `<div class="lg-armed"><b>${esc(e.name)}: ${esc(opt.name)}</b><span class="lg-step">${esc(words)}</span>
      <div class="lg-btns">${picks}${st === 'move' ? btn('nomove', 'No move') : ''}${st === 'send' ? btn('send', 'Send', 'lg-go') : ''}${btn('cancel', 'Cancel')}</div><p class="lg-err" role="alert" hidden></p></div>`;
    mount.hidden = false; document.body.classList.add('lg-open');
    if (html !== sig) { sig = html; mount.innerHTML = html; }
  }
  function hintFor(m) {
    const h = here(m); if (!h) return '';
    const { s, e, opt } = h, st = step(m), name = opt.name;
    if (st === 'pick') return `${name}: choose which action it makes.`;
    if (st === 'move') { const { feet, stops } = reach(s, e, opt); return stops.length ? `${name}: tap where ${e.name} moves (up to ${feet} ft), or No move.` : `${name}: ${e.name} has nowhere to move to. Tap No move.`; }
    const def = defNow(e, opt, m), p = def ? actionProfile(def) : null, S2 = after(s, e, m);
    if (st === 'aim' && p?.aim === 'creature') { const ids = foesOf(S2, e, def); return ids === null || ids.length ? `${name}: tap a target.` : `${name}: nobody in reach${m.stop ? ' from there' : ''} (${p.far} ft).`; }
    if (st === 'aim' && p?.aim === 'area') return `${name}: tap a spot for the area.`;
    const bits = [m.to ? 'it moves' : '', m.target ? `at ${s.entities[m.target]?.name ?? 'the target'}` : '', m.hex ? 'on the spot you tapped' : ''].filter(Boolean);
    return `${name}${bits.length ? `: ${bits.join(', ')}` : ''}. Send it.`;
  }
  function goOn(m) { m.i += 1; ctx.render(); }
  function sendArmed(m) {
    const h = here(m); if (!h) return;
    const action = { type: 'legendary', actor: m.actor, option: m.option, ...(m.pick ? { pick: m.pick } : {}), ...(m.to ? { to: m.to } : {}), ...(m.target ? { target: m.target } : {}), ...(m.hex ? { hex: m.hex } : {}) };
    const why = ctx.dry(action);
    if (why) { const p = mount.querySelector('.lg-err'); if (p) { p.textContent = why; p.hidden = false; } return ctx.toast(why); }      // the engine's words; it stays armed to change the aim
    ctx.act(action); ctx.setMode(ctx.move);
  }

  return {
    sync: draw,
    hintFor: (m) => (m?.kind === 'legendary' ? hintFor(m) : ''),
    // A tap on the map while an option is armed: the destination, then the target or the spot.
    tap(mode, hex, id) {
      if (mode.kind !== 'legendary') return false;
      const h = here(mode); if (!h) { ctx.setMode(ctx.move); return true; }
      const { s, e, opt } = h, st = step(mode);
      if (st === 'move') {
        if (!hex) return true;
        const { stops } = reach(s, e, opt), v = stopAt(stops, hex);
        if (!v) { ctx.toast(`${e.name} can't end its move there.`); return true; }
        mode.to = { q: hex.q, r: hex.r, ...(hex.z !== undefined ? { z: hex.z } : {}) }; mode.stop = v.h; goOn(mode); return true;
      }
      if (st === 'aim') {
        const def = defNow(e, opt, mode), p = def ? actionProfile(def) : null, S2 = after(s, e, mode);
        if (p?.aim === 'creature') {
          if (!id || !s.entities[id]) return true;
          const ids = foesOf(S2, e, def);
          if (ids && !ids.includes(id)) { ctx.toast(`${s.entities[id].name} is out of ${opt.name}'s reach${mode.stop ? ' from there' : ''}.`); return true; }
          mode.target = id; goOn(mode); return true;
        }
        if (p?.aim === 'area' && hex) { mode.hex = hex; goOn(mode); return true; }
      }
      return true;
    },
    // The highlights: where the move may end, who may be a target, the area as aimed.
    render() {
      const m = armed(); if (!m || !ctx.isDM()) return null;
      const h = here(m); if (!h) return null;
      const { s, e, opt } = h, st = step(m), out = { move: [], area: [], targets: [] };
      if (st === 'move') { const { stops } = reach(s, e, opt); out.move = stops.map(([k]) => k); out.moveBand = Object.fromEntries(out.move.map((k) => [k, 0])); }
      const def = defNow(e, opt, m), p = def ? actionProfile(def) : null, S2 = after(s, e, m);
      if (st === 'aim' && p?.aim === 'creature') out.targets = foesOf(S2, e, def) ?? [];
      if (p?.aim === 'area' && (st === 'aim' || st === 'send')) {
        try { const ee = S2.entities[e.id]; out.area = m.hex ? areaHexes(S2, ee, { area: p.area }, m.hex).map(cellKey) : []; } catch { /* no area to show */ }
      }
      if (st === 'send' && m.target) out.targets = [m.target];
      return out;
    },
    refused() {},
    fresh() { sig = ''; sent = null; mount.hidden = true; mount.textContent = ''; document.body.classList.remove('lg-open'); },
  };
}
