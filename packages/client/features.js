// Class features on the character sheet and in the action bar, and the DM's Short Rest.
// A built character (derive.js) carries `feats`: each has its text, its uses (`e.uses[id]` left) and,
// when it can be used, an `action` (time, target, cost...). The engine decides everything; this file
// only lists them and sends { type: 'feature', actor, feature }.
import { blocked, up } from './shared/engine.js';
import { needsChoice, chooserButtons, usesLeft } from './classes.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIME = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', free: 'Free' };

export function usesText(u) {
  if (!u) return '';
  const n = `${u.max} use${u.max === 1 ? '' : 's'}`;
  if (u.recharge === 'short') return `${n}, back on a Short Rest`;
  return `${n}, back on a Long Rest${u.short ? ` (${u.short} back on a Short Rest)` : ''}`;
}
// A feature the bar can send by itself: it needs no target (self, or an extra action / attacks).
export const barFeature = (f) => !!f.action && !needsChoice(f) && f.action.time !== 'reaction' && !f.action.pool && (f.action.target?.self || f.action.gain);
// A feature aimed at one creature (Stunning Strike): the bar arms it and a tap on the creature sends it.
export const aimedFeature = (f) => !!f.action && !needsChoice(f) && f.action.time !== 'reaction' && !f.action.pool && !f.action.gain && !!f.action.target?.creature;
// Second Wind and friends are a feature here; the older hand-typed Second Wind has its own button.
export const hasFeat = (e, id) => (e.feats ?? []).some((f) => f.id === id);

// Buttons for the action bar: [{ label, sub, cls, why, send }].
export function featureButtons(S, e) {
  const out = [];
  for (const f of e.feats ?? []) {
    const aim = aimedFeature(f);
    if (!barFeature(f) && !aim) continue;
    const time = f.action.time === 'free' ? null : f.action.time;
    const left = f.uses ? (e.uses?.[f.id] ?? 0) : null;
    const cost = f.action.cost?.n ?? 1;
    const live = !!(S.effects ?? []).find((fx) => fx.source === e.id && fx.feature === f.id);
    const why = (time && blocked(S, e, time)) || (f.uses && !(f.action.renew && live) && left < cost && `${e.name} has no uses of ${f.name} left.`) ||
      (f.action.unless === 'heavy' && e.armour === 'heavy' && `${e.name} can't use ${f.name} in Heavy armor.`) || (!time && blocked(S, e, null)) || '';
    out.push({ label: live && f.action.renew ? `${f.name} (extend)` : f.name, cls: time === 'bonus' || f.action.time === 'free' ? 'bonus' : '', why,
      sub: [TIME[f.action.time], f.uses ? `${left} left` : ''].filter(Boolean).join(' · '), send: { type: 'feature', actor: e.id, feature: f.id }, ...(aim ? { aim: f.id } : {}), feature: f.id, time: f.action.time });
  }
  return out;
}

// ---------- the Features tab (docs/specs/table-ui.md, Decision 6) ----------
export const CHIP = { action: 'Action', bonus: 'Bonus', reaction: 'Reaction', free: 'Free' };
// "Back on a Long Rest", for the line under a feature's pips.
export const rechargeText = (u) => (!u ? '' : u.recharge === 'short' ? 'Back on a Short Rest' : `Back on a Long Rest${u.short ? ` (${u.short} back on a Short Rest)` : ''}`);
// The pool a feature draws on, as pips: its own uses, or those of the feature it spends (Divine Spark spends Channel Divinity).
function pipsOf(e, f) {
  const own = f.uses ? f : f.action?.cost?.resource ? (e.feats ?? []).find((x) => x.id === f.action.cost.resource) : null;
  if (!own?.uses) return null;
  return { left: e.uses?.[own.id] ?? 0, max: own.uses.max, text: rechargeText(own.uses), unit: f.action?.pool || f.exchange ? (f.action?.pool ? 'HP' : 'points') : '' };
}
// The rows of the Features tab: every feature that has a button, or uses to count, with its pips and how it comes back. `mode`: what is armed.
// A row: { id, kind ('send' | 'arm' | 'chooser' | 'none'), label, sub, why, chip, time, pips, armed, send?, arm?, mode?, feature }. The reason for a greyed row
// is the engine's own check (`blocked`, uses left); `why` is empty when the feature can be used now.
export function featureRows(S, e, { mode = null } = {}) {
  const rows = [], done = new Set();
  const fOf = (id) => (e.feats ?? []).find((f) => f.id === id);
  for (const b of chooserButtons(S, e)) {
    done.add(b.feature);
    rows.push({ id: `feat:${b.feature}`, kind: 'chooser', label: b.label, sub: b.kind === 'form' && formNow(e) ? b.sub : '', why: b.why, chip: CHIP[b.time] ?? '', time: b.time, feature: b.feature, pips: pipsOf(e, b.f),
      armed: b.cls.includes('armed') && b.kind === 'form' });
  }
  for (const fb of featureButtons(S, e)) {
    done.add(fb.feature);
    const armed = !!fb.aim && mode?.kind === 'feature' && mode.id === fb.aim;
    rows.push({ id: `feat:${fb.feature}`, kind: fb.aim ? 'arm' : 'send', label: fb.label, sub: fb.aim ? 'Tap a creature' : '', why: fb.why, chip: CHIP[fb.time] ?? '', time: fb.time, feature: fb.feature, pips: pipsOf(e, fOf(fb.feature)),
      armed, send: fb.send, ...(fb.aim ? { arm: { kind: 'feature', id: fb.aim }, mode: { kind: 'feature', id: fb.aim, name: fb.label } } : {}) });
  }
  // A feature with uses and no button of its own: it works by itself, on a Reaction's instruction, or the DM applies it. Listed so the count is visible.
  for (const f of e.feats ?? []) {
    if (done.has(f.id) || !f.uses || f.metamagic) continue;
    const reaction = f.action?.time === 'reaction';
    rows.push({ id: `feat:${f.id}`, kind: 'none', label: f.name, sub: reaction ? 'Reaction: set on the Reactions tab' : f.tier === 'manual' ? 'The DM applies it' : 'Works by itself, no button', why: '', chip: CHIP[f.action?.time] ?? '', time: f.action?.time ?? null, feature: f.id, pips: pipsOf(e, f), armed: false });
  }
  // The older hand-typed Second Wind, for a character whose record has it as a plain feature and not in `feats`.
  if (e.features?.secondWind && !hasFeat(e, 'second-wind')) {
    const left = e.uses?.secondWind ?? 0;
    const why = blocked(S, e, 'bonus') || (!left && 'No uses of Second Wind left.') || (e.hp >= e.maxHp && `${e.name} is at full Hit Points.`) || '';
    rows.push({ id: 'feat:secondWind', kind: 'send', label: 'Second Wind', sub: `Heal 1d10+${e.level}`, why, chip: 'Bonus', time: 'bonus', feature: 'secondWind',
      pips: { left, max: Math.max(left, e.features.secondWind), text: 'Back on a Short Rest', unit: '' }, armed: false, send: { type: 'secondWind', actor: e.id } });
  }
  return rows;
}
const formNow = (e) => !!(typeof e.form === 'string' ? e.form : e.form?.block);

// The Features section of the sheet.
export function featuresHtml(e, mineHere = false) {
  if (!e.feats?.length) return '';
  const rows = e.feats.map((f) => {
    const u = f.uses ? `<span class="fx-uses" data-feat-uses="${esc(f.id)}">${e.uses?.[f.id] ?? 0} of ${f.uses.max} left</span> · <span>${esc(usesText(f.uses))}</span>` : '';
    const how = f.action ? `<span>${TIME[f.action.time] ?? ''}</span>` : '';
    const use = !mineHere ? '' : needsChoice(f) ? `<p><button type="button" class="qb-use" data-feat-use="${esc(f.id)}">Use ${esc(f.name)}…</button></p>`
      : f.id === 'metamagic' && e.spells?.length ? `<p><button type="button" class="qb-use" data-meta-open="1">Cast a spell with Metamagic…</button></p>` : '';
    return `<details class="qb-feat" data-feat="${esc(f.id)}"><summary>${esc(f.name)}${f.uses ? ` · ${e.uses?.[f.id] ?? 0}/${f.uses.max}` : ''}</summary>
      <p class="note">${[how, u].filter(Boolean).join(' · ')}</p><p class="note">${esc(f.text)}${f.tier === 'manual' ? ' (The DM applies this one.)' : ''}</p>${use}</details>`;
  }).join('');
  return `<section id="sheet-feats"><h3>Class features</h3>${rows}</section>`;
}

// The DM's Short Rest: a small panel to choose how many Hit Point Dice each member spends.
export function initShortRest({ host, act, getState }) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'dm-short-rest'; btn.textContent = 'Short rest…';
  const box = document.createElement('div'); box.id = 'dm-short-box'; box.hidden = true; box.className = 'qb-gain';
  host.after(btn); btn.after(box);
  btn.onclick = () => {
    const S = getState(); box.textContent = '';
    if (S.encounter) { box.hidden = false; box.textContent = "You can't rest in the middle of a fight."; return; }
    const who = Object.values(S.entities).filter((x) => x.side === 'party' && !x.dead);
    const h = document.createElement('h4'); h.textContent = 'Short Rest: Hit Point Dice to spend'; box.append(h);
    const inputs = [], restores = [];
    for (const e of who) {
      const row = document.createElement('label'); row.className = 'qe-f';
      const n = e.hd ?? 0, can = n > 0 && e.hp > 0 && e.hp < e.maxHp;
      row.innerHTML = `<span>${esc(e.name)}: HP ${e.hp}/${e.maxHp}, ${n} Hit Point Di${n === 1 ? 'e' : 'ce'}${e.hitDie ? ` (d${e.hitDie})` : ''} left</span>`;
      if (e.hitDie) { const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.max = n; i.value = 0; i.disabled = n === 0 || e.hp <= 0; i.id = `sr-${e.id}`; i.inputMode = 'numeric'; row.append(i); inputs.push([e, i]); }
      box.append(row);
      // A feature that gives points back on a Short Rest (Sorcerous Restoration): the DM says who uses it.
      const rf = (e.feats ?? []).find((f) => f.restore && (e.uses?.[f.id] ?? 0) > 0);
      if (rf) {
        const l = document.createElement('label'); l.className = 'check';
        const c = document.createElement('input'); c.type = 'checkbox'; c.id = `sr-restore-${e.id}`; c.disabled = e.hp <= 0; restores.push([e, c]);
        l.append(c, document.createTextNode(`${e.name} uses ${rf.name} (${e.uses[rf.restore.of] ?? 0} of ${(e.feats.find((f) => f.id === rf.restore.of)?.uses.max) ?? '?'} points now)`)); box.append(l);
      }
    }
    const go = document.createElement('button'); go.type = 'button'; go.id = 'dm-short-go'; go.className = 'qe-save'; go.textContent = 'Take the Short Rest';
    go.onclick = () => {
      const spend = {};
      for (const [e, i] of inputs) { const n = Math.max(0, Math.min(e.hd ?? 0, parseInt(i.value, 10) || 0)); if (n) spend[e.id] = n; }
      const restore = restores.filter(([, c]) => c.checked).map(([e]) => e.id);
      act({ type: 'shortRest', ids: who.map((x) => x.id), spend, ...(restore.length ? { restore } : {}) }); box.hidden = true;
    };
    box.append(go); box.hidden = false;
  };
  return { sync(S) { btn.disabled = !!S.encounter; box.hidden = box.hidden || !!S.encounter; } };
}
