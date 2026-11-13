// Class features on the character sheet and in the action bar, and the DM's Short Rest.
// A built character (derive.js) carries `feats`: each has its text, its uses (`e.uses[id]` left) and,
// when it can be used, an `action` (time, target, cost...). The engine decides everything; this file
// only lists them and sends { type: 'feature', actor, feature }.
import { blocked, up } from './shared/engine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TIME = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', free: 'Free' };

export function usesText(u) {
  if (!u) return '';
  const n = `${u.max} use${u.max === 1 ? '' : 's'}`;
  if (u.recharge === 'short') return `${n}, back on a Short Rest`;
  return `${n}, back on a Long Rest${u.short ? ` (${u.short} back on a Short Rest)` : ''}`;
}
// A feature the bar can send by itself: it needs no target (self, or an extra action / attacks).
export const barFeature = (f) => !!f.action && f.action.time !== 'reaction' && !f.action.pool && (f.action.target?.self || f.action.gain);
// A feature aimed at one creature (Stunning Strike): the bar arms it and a tap on the creature sends it.
export const aimedFeature = (f) => !!f.action && f.action.time !== 'reaction' && !f.action.pool && !f.action.gain && !!f.action.target?.creature;
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
      (f.action.unless === 'heavy' && e.armour === 'heavy' && `${e.name} can't use ${f.name} in Heavy armor.`) || '';
    out.push({ label: live && f.action.renew ? `${f.name} (extend)` : f.name, cls: time === 'bonus' || f.action.time === 'free' ? 'bonus' : '', why,
      sub: [TIME[f.action.time], f.uses ? `${left} left` : ''].filter(Boolean).join(' · '), send: { type: 'feature', actor: e.id, feature: f.id }, ...(aim ? { aim: f.id } : {}) });
  }
  return out;
}

// The Features section of the sheet.
export function featuresHtml(e) {
  if (!e.feats?.length) return '';
  const rows = e.feats.map((f) => {
    const u = f.uses ? `<span class="fx-uses" data-feat-uses="${esc(f.id)}">${e.uses?.[f.id] ?? 0} of ${f.uses.max} left</span> · <span>${esc(usesText(f.uses))}</span>` : '';
    const how = f.action ? `<span>${TIME[f.action.time] ?? ''}</span>` : '';
    return `<details class="qb-feat" data-feat="${esc(f.id)}"><summary>${esc(f.name)}${f.uses ? ` · ${e.uses?.[f.id] ?? 0}/${f.uses.max}` : ''}</summary>
      <p class="note">${[how, u].filter(Boolean).join(' · ')}</p><p class="note">${esc(f.text)}${f.tier === 'manual' ? ' (The DM applies this one.)' : ''}</p></details>`;
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
    const inputs = [];
    for (const e of who) {
      const row = document.createElement('label'); row.className = 'qe-f';
      const n = e.hd ?? 0, can = n > 0 && e.hp > 0 && e.hp < e.maxHp;
      row.innerHTML = `<span>${esc(e.name)}: HP ${e.hp}/${e.maxHp}, ${n} Hit Point Di${n === 1 ? 'e' : 'ce'}${e.hitDie ? ` (d${e.hitDie})` : ''} left</span>`;
      if (e.hitDie) { const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.max = n; i.value = 0; i.disabled = n === 0 || e.hp <= 0; i.id = `sr-${e.id}`; i.inputMode = 'numeric'; row.append(i); inputs.push([e, i]); }
      box.append(row);
    }
    const go = document.createElement('button'); go.type = 'button'; go.id = 'dm-short-go'; go.className = 'qe-save'; go.textContent = 'Take the Short Rest';
    go.onclick = () => {
      const spend = {};
      for (const [e, i] of inputs) { const n = Math.max(0, Math.min(e.hd ?? 0, parseInt(i.value, 10) || 0)); if (n) spend[e.id] = n; }
      act({ type: 'shortRest', ids: who.map((x) => x.id), spend }); box.hidden = true;
    };
    box.append(go); box.hidden = false;
  };
  return { sync(S) { btn.disabled = !!S.encounter; box.hidden = box.hidden || !!S.encounter; } };
}
