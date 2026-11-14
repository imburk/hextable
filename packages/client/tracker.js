// The combat tracker: a tab of the drawer (docs/specs/table-ui.md, Decision 3). It lists the fight in initiative order, one row to
// a turn and top to bottom (or the party, outside a fight), with health, conditions and lasting effects. It only reads the state it
// is given and sends existing actions (harm, mend, setHp for the dead, endTurn, reveal); it never changes anything itself. It shows
// only what that state holds, so a player's tracker shows exactly what the player's view sent: no hidden creature, no number the
// view held back, and a turn taken by a creature the party cannot see is one row that says so and names no one.
import { inFight, clockText, FT } from './shared/engine.js';
import { under } from './shared/space.js';
import { conditionName } from './shared/modifiers.js';
import { hpFraction } from './render.js';
import { rowDotHTML } from './linkdot.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WORD = { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' };

// The rows, in order. In a fight: one per slot of the order, { e, init, now } for a creature the viewer is sent and { unseen: true, now }
// for the one slot a creature's unseen turn is (it holds no id, no name, no number). Outside a fight: the party, and for the DM the
// creatures hidden from the players. `init` is there only where the view sent it (open creatures; everyone for the DM).
export function trackerRows(S, { dm = false } = {}) {
  const enc = S?.encounter;
  if (enc) return enc.order.map((o, i) => (o.someone ? { unseen: true, now: i === enc.turn } : S.entities[o.id] ? { e: S.entities[o.id], init: typeof o.init === 'number' ? o.init : undefined, now: i === enc.turn } : null)).filter(Boolean);
  const all = Object.values(S?.entities ?? {});
  return [...all.filter((e) => e.side === 'party'), ...(dm ? all.filter((e) => e.hidden && e.side !== 'party') : [])].map((e) => ({ e, now: false }));
}

// What the header says about the turn: "Tor's turn", "Something moves unseen", or nothing (the table says nothing of an unseen turn).
export function turnLine(S) {
  const enc = S?.encounter; if (!enc) return '';
  const o = enc.order[enc.turn];
  return !o ? '' : o.someone ? 'Something moves unseen' : S.entities[o.id] ? `${S.entities[o.id].name}'s turn` : '';
}

// One row. `opts`: { dm, mine(e), ticked: Set } . The same function draws every viewer's row; what differs is what the state holds.
export function rowHTML(S, item, { dm = false, mine = () => false, ticked = new Set(), link = () => null } = {}) {
  if (item.unseen) return `<li class="tr-ghost${item.now ? ' now' : ''}" data-side="unseen"${item.now ? ' aria-current="step"' : ''}><span class="tr-init"></span><span class="tr-main"><span class="tr-name">Something moves unseen</span></span></li>`;
  const { e, now, init } = item, enc = S.encounter;
  const full = !!e.abil && typeof e.maxHp === 'number', numbers = full && (mine(e) || e.side === 'party');
  const word = e.health ?? (e.dead ? 'dead' : typeof e.maxHp === 'number' ? (e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy') : null);
  const dying = full && e.kind === 'pc' && !e.dead && e.hp <= 0 && e.death;
  const stable = !!(dying && e.cond?.stable);
  let hp = numbers ? `${e.hp} / ${e.maxHp}${e.tempHp > 0 ? ` +${e.tempHp}` : ''}` : WORD[word] ?? '';
  if (dying) hp = stable ? 'Stable' : `Dying ${e.death.s}\u2713 ${e.death.f}\u2717`;
  const tags = [];
  if (e.size && e.size !== 'medium') tags.push(e.size[0].toUpperCase() + e.size.slice(1));
  let sf = null; try { sf = e.pos && S.map ? under(S.map, e.pos) : null; } catch { /* no surface: say nothing */ }
  if (sf && e.pos.z - sf.z >= FT) tags.push(`\u2191 ${Math.floor((e.pos.z - sf.z) / FT) * FT} ft`);
  if (e.hidden) tags.push('Hidden from players');
  if (full && enc && inFight(S, e.id) && e.reactionUsed) tags.push('Reaction used');
  const conds = Object.keys(e.cond || {}).filter((c) => e.cond[c] && c !== 'stable').map((c) => conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : ''));
  if (e.cond?.stable && !stable) conds.push('Stable');
  const fx = (S.effects || []).filter((f) => f.source === e.id || (f.parts || []).some((p) => p.target === e.id && !p.ended)).map((f) => {
    const left = !f.until ? '' : f.until.clock !== undefined ? ` until ${clockText(f.until.clock)}` : enc ? ` ${Math.max(0, f.until.round - enc.round)}r` : '';
    return `${f.name}${f.conc ? ' (C)' : ''}${left}`;
  });
  const out = e.dead || (typeof e.hp === 'number' ? e.hp <= 0 : word === 'down');
  const ctl = (dm ? `${typeof e.maxHp === 'number' ? '<button type="button" data-do="dmg" aria-label="Damage by the typed amount">\u2212</button><button type="button" data-do="heal" aria-label="Heal by the typed amount">+</button>' : ''}` +
      `${enc && now ? '<button type="button" data-do="skip">Skip turn</button>' : ''}${e.hidden ? '<button type="button" data-do="reveal">Reveal</button>' : ''}` : '') +
    (e.abil ? `<button type="button" data-do="sheet" aria-label="Sheet: ${esc(e.name)}">Sheet</button>` : '');
  return `<li data-id="${esc(e.id)}" data-side="${esc(e.side)}" class="${now ? 'now' : ''} ${out ? 'out' : ''}"${now ? ' aria-current="step"' : ''}>
      ${dm && typeof e.maxHp === 'number' ? `<input type="checkbox" class="tr-tick" aria-label="Select ${esc(e.name)}" ${ticked.has(e.id) ? 'checked' : ''}>` : '<span class="tr-nobox"></span>'}
      <span class="tr-init">${init !== undefined ? init : ''}</span>
      <button type="button" class="tr-main" data-do="pick"><span class="tr-name">${now ? '<b class="tr-turn" aria-hidden="true">\u25B6</b>' : ''}${esc(e.name)}${now ? '<span class="sr-only"> (current turn)</span>' : ''}${dm && link(e) ? `<span class="tr-link">${rowDotHTML(link(e).state, link(e).who ?? e.name, link(e).text)}</span>` : ''}</span>
        <span class="tr-hp"><span class="bar"><i style="width:${hpFraction(e) * 100}%"></i></span><span>${esc(hp)}</span></span>
        ${tags.length || conds.length || fx.length ? `<span class="tr-tags">${[...tags, ...conds, ...fx].map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}</button>${ctl ? `<span class="tr-ctl">${ctl}</span>` : ''}</li>`;
}

// ctx: { root, state(), isDM(), mine(e), act(a), pick(id), openSheet(id), toast(msg), link(e) } where link(e) is the connection state of the
// player who plays e, { state, text } (the DM's tracker only; see linkdot.js), or null.
export function createTracker(ctx) {
  const { root } = ctx;
  const ticked = new Set();
  let lastKey = '';
  root.innerHTML = `<div class="tr-head"><div><strong id="tr-title"></strong><span id="tr-turn"></span></div><button type="button" id="tr-edit" aria-pressed="false" hidden>Edit</button></div>
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

  function render() {
    const S = ctx.state();
    if (!S) return;
    if (root.hidden) { lastKey = ''; return; }       // the drawer shows another tab: nothing is drawn, and the turn is scrolled to when it comes back
    const dm = ctx.isDM(), enc = S.encounter, rs = trackerRows(S, { dm });
    q('tr-title').textContent = enc ? `Round ${enc.round}` : 'The party';
    q('tr-turn').textContent = turnLine(S);
    q('tr-dm').hidden = !dm; q('tr-edit').hidden = !dm;      // the button shows on a phone only (style.css)
    for (const id of [...ticked]) if (!S.entities[id]) ticked.delete(id);
    const keep = list.scrollTop, opts = { dm, mine: ctx.mine, ticked, link: ctx.link };
    list.innerHTML = rs.map((r) => rowHTML(S, r, opts)).join('') || '<li class="tr-empty">Nobody yet.</li>';
    list.scrollTop = keep;
    const key = `${enc ? 'f' : 'x'}${enc?.turn}${enc?.round}`;
    if (key !== lastKey) { lastKey = key; list.querySelector('.now')?.scrollIntoView({ block: 'nearest' }); }
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
    else if (w === 'sheet') ctx.openSheet(id);
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
  // On a phone the DM's controls fold away so the list has the room; Edit brings them back.
  q('tr-edit').onclick = (ev) => { const on = !root.classList.contains('edit'); root.classList.toggle('edit', on); ev.currentTarget.setAttribute('aria-pressed', String(on)); };

  return { render };
}
