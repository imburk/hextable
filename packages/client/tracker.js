// The combat tracker: a panel over the game state. It lists the fight in initiative order (or the
// party, outside a fight) with health, conditions and lasting effects. It only reads state and
// sends existing actions (harm, mend, setHp for the dead, endTurn, reveal); it never changes anything itself, and it shows
// only what the state it is given holds, so a player's panel shows exactly what their view sent.
import { current, inFight, clockText, FT } from './shared/engine.js';
import { under } from './shared/space.js';
import { conditionName } from './shared/modifiers.js';
import { hpFraction } from './render.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WORD = { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' };

// ctx: { root, button, state(), isDM(), mine(e), act(a), pick(id), toast(msg), dock }
export function createTracker(ctx) {
  const { root } = ctx;
  const ticked = new Set();
  let lastTurn = null, lastKey = '';
  root.innerHTML = `<div class="tr-head"><strong id="tr-title"></strong><button type="button" class="close" id="tr-close">Close</button></div>
    <div class="tr-dm" id="tr-dm" hidden><input id="tr-amt" type="number" inputmode="numeric" min="0" placeholder="Amount" aria-label="Hit Points amount">
      <button type="button" data-all="dmg">Damage ticked</button><button type="button" data-all="heal">Heal ticked</button></div>
    <ol id="tr-list"></ol>`;
  const q = (id) => root.querySelector(`#${id}`), list = q('tr-list');
  const amount = () => { const n = Math.floor(Number(q('tr-amt').value)); return n > 0 ? n : 0; };

  // Hit points after taking (sign -1) or receiving (sign 1) the typed amount. Only the DM has maxHp.
  function setHp(id, sign) {
    const e = ctx.state().entities[id], n = amount();
    if (!n) return ctx.toast('Type an amount first.');
    if (typeof e?.maxHp !== 'number') return;
    // By the rules: Temporary Hit Points first, Resistance, Concentration, death saves. Raising the dead is a DM ruling, so that alone sets Hit Points.
    if (e.dead) return ctx.act({ type: 'setHp', actor: id, hp: sign > 0 ? Math.min(e.maxHp, n) : 0 });
    ctx.act(sign < 0 ? { type: 'harm', actor: id, amount: n } : { type: 'mend', actor: id, amount: n });
  }

  function rows(S) {
    if (S.encounter) return S.encounter.order.map((o) => S.entities[o.id]).filter(Boolean);
    const all = Object.values(S.entities);
    return [...all.filter((e) => e.side === 'party'), ...(ctx.isDM() ? all.filter((e) => e.hidden && e.side !== 'party') : [])];
  }

  function rowHTML(S, e, cur, dm) {
    const enc = S.encounter, full = !!e.abil && typeof e.maxHp === 'number', numbers = full && (ctx.mine(e) || e.side === 'party');
    const word = e.health ?? (e.dead ? 'dead' : typeof e.maxHp === 'number' ? (e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy') : null);
    const hp = numbers ? `${e.hp} / ${e.maxHp}${e.tempHp > 0 ? ` +${e.tempHp}` : ''}` : WORD[word] ?? '';
    const tags = [];
    if (e.size && e.size !== 'medium') tags.push(e.size[0].toUpperCase() + e.size.slice(1));
    let sf = null; try { sf = e.pos && S.map ? under(S.map, e.pos) : null; } catch { /* no surface: say nothing */ }
    if (sf && e.pos.z - sf.z >= FT) tags.push(`↑ ${Math.floor((e.pos.z - sf.z) / FT) * FT} ft`);
    if (e.hidden) tags.push('Hidden from players');
    if (full && enc && inFight(S, e.id) && e.reactionUsed) tags.push('Reaction used');
    const conds = Object.keys(e.cond || {}).filter((c) => e.cond[c] && c !== 'stable').map((c) => conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : ''));
    if (e.cond?.stable) conds.push('Stable');
    const fx = (S.effects || []).filter((f) => f.source === e.id || (f.parts || []).some((p) => p.target === e.id && !p.ended)).map((f) => {
      const left = !f.until ? '' : f.until.clock !== undefined ? ` until ${clockText(f.until.clock)}` : enc ? ` ${Math.max(0, f.until.round - enc.round)}r` : '';
      return `${f.name}${f.conc ? ' (C)' : ''}${left}`;
    });
    const out = e.dead || (typeof e.hp === 'number' ? e.hp <= 0 : word === 'down');
    const ctl = !dm ? '' : `<span class="tr-ctl">${typeof e.maxHp === 'number' ? `<button type="button" data-do="dmg" title="Damage by the typed amount">−</button><button type="button" data-do="heal" title="Heal by the typed amount">+</button>` : ''}` +
      `${enc && cur === e.id ? '<button type="button" data-do="skip">Skip turn</button>' : ''}${e.hidden ? '<button type="button" data-do="reveal">Reveal</button>' : ''}</span>`;
    return `<li data-id="${esc(e.id)}" data-side="${esc(e.side)}" class="${enc && cur === e.id ? 'now' : ''} ${out ? 'out' : ''}">
      ${dm && typeof e.maxHp === 'number' ? `<input type="checkbox" class="tr-tick" aria-label="Select ${esc(e.name)}" ${ticked.has(e.id) ? 'checked' : ''}>` : '<span class="tr-nobox"></span>'}
      <button type="button" class="tr-main" data-do="pick"><span class="tr-name">${enc && cur === e.id ? '<b class="tr-turn">Turn</b>' : ''}${esc(e.name)}</span>
        <span class="tr-hp"><span class="bar"><i style="width:${hpFraction(e) * 100}%"></i></span><span>${esc(hp)}</span></span>
        ${tags.length || conds.length || fx.length ? `<span class="tr-tags">${[...tags, ...conds, ...fx].map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}</button>${ctl}</li>`;
  }

  function render() {
    const S = ctx.state();
    if (!S || root.hidden) return;
    const dm = ctx.isDM(), enc = S.encounter, cur = enc ? current(S) : null, rs = rows(S);
    root.style.setProperty('--dock-h', `${ctx.dock.offsetHeight}px`);
    q('tr-title').textContent = enc ? `Round ${enc.round}` : 'The party';
    q('tr-dm').hidden = !dm;
    for (const id of [...ticked]) if (!S.entities[id]) ticked.delete(id);
    const keep = list.scrollTop;
    list.innerHTML = rs.map((e) => rowHTML(S, e, cur, dm)).join('') || '<li class="tr-empty">Nobody yet.</li>';
    list.scrollTop = keep;
    const key = `${enc ? 'f' : 'x'}${cur}${enc?.round}`;
    if (key !== lastKey) { lastKey = key; list.querySelector('.now')?.scrollIntoView({ block: 'nearest' }); }
    lastTurn = cur;
  }

  list.addEventListener('change', (ev) => {
    const id = ev.target.closest('li')?.dataset.id;
    if (id && ev.target.classList.contains('tr-tick')) ev.target.checked ? ticked.add(id) : ticked.delete(id);
  });
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-do]'), id = b?.closest('li')?.dataset.id;
    if (!id) return;
    const w = b.dataset.do;
    if (w === 'pick') ctx.pick(id);
    else if (w === 'dmg') setHp(id, -1);
    else if (w === 'heal') setHp(id, 1);
    else if (w === 'skip') ctx.act({ type: 'endTurn', actor: id });
    else if (w === 'reveal') ctx.act({ type: 'reveal', actor: id, hidden: false });
  });
  q('tr-dm').addEventListener('click', (ev) => {
    const w = ev.target.closest('button[data-all]')?.dataset.all; if (!w) return;
    if (!ticked.size) return ctx.toast('Tick the creatures first.');
    for (const id of ticked) setHp(id, w === 'dmg' ? -1 : 1);
  });
  q('tr-close').onclick = () => { root.hidden = true; ctx.button.setAttribute('aria-expanded', 'false'); };

  return {
    render,
    toggle() { root.hidden = !root.hidden; ctx.button.setAttribute('aria-expanded', String(!root.hidden)); lastKey = ''; render(); },
  };
}
