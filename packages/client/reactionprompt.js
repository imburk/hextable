// The question a reaction asks (rules engine, "Asking in the moment"; packages/server/README.md, Reactions).
// When a player's standing instruction for a reaction is "ask", the engine pauses the action and the view says so:
//   the player asked:  state.prompt = { n, reactor, trigger, options: [{ reaction, name, slots?, ac? }], by?, attack?, total?, ac?, crit?, spell? }
//   every other player: state.prompt = { waiting: true }, and nothing more
//   the DM:            state.pending = { n, action, ctx, answers, ask }, the whole record
// This file draws that and sends the answer, { type: 'react', prompt: n, take: reactionId | null, slot? }, through `act`.
// It decides nothing: what is offered, what it costs and whether the answer is allowed are the engine's; a refusal is shown as it came.
import { SPELLS } from './shared/content/index.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ARM_MS = 600;      // a tap meant for the map, a moment before the question came, must not answer it

export function initReactionPrompt({ act, state, isDM }) {
  const modal = document.createElement('div');
  modal.id = 'rp'; modal.hidden = true;
  const bar = document.createElement('div');
  bar.id = 'rp-wait'; bar.hidden = true; bar.setAttribute('role', 'status');
  document.body.append(modal, bar);

  let key = '', armedAt = 0, sent = false, slotPick = {}, error = '';
  const S = () => state();
  const nameOf = (id) => S()?.entities[id]?.name;

  // What set it off, as far as the view says, in words. `me` is the creature asked.
  function trigger(q, whom) {
    const by = q.by !== undefined ? (nameOf(q.by) ?? 'A creature') : 'Something you cannot see';
    const you = whom ?? 'you';
    switch (q.trigger) {
      case 'hit': return `${by} attacks ${you}${q.attack ? ` with ${q.attack}` : ''}${q.total !== undefined ? `: ${q.total}${q.ac !== undefined ? ` against Armor Class ${q.ac}` : ''}` : ''}${q.crit ? ', a critical hit' : ''}.`;
      case 'targeted': return `${by} casts ${q.spell ? SPELLS[q.spell]?.name ?? 'a spell' : 'a spell'} and ${you === 'you' ? 'you are' : `${you} is`} a target.`;
      case 'leave': return `${by} is leaving ${you === 'you' ? 'your' : `${you}'s`} reach.`;
      case 'cast': return `${by} is casting a spell.`;
      case 'damaged': return `${by} has just damaged ${you}.`;
      default: return 'Something has happened that a reaction answers.';
    }
  }
  const cost = (o) => [o.slots?.length ? (o.slots.length === 1 ? `Spends a level ${o.slots[0]} spell slot` : `Spends a spell slot (level ${o.slots[0]} to ${o.slots.at(-1)})`) : '', o.ac !== undefined ? `Adds ${o.ac} to Armor Class` : '', 'Uses your Reaction'].filter(Boolean).join(' · ');

  function answer(n, take, slot) {
    if (sent || performance.now() < armedAt) return;
    sent = true; error = ''; draw(true);
    act({ type: 'react', prompt: n, take, ...(slot !== undefined ? { slot } : {}) });
  }

  // The sheet that asks. `q` has n, trigger, options; `dm` is whether it is the DM answering for a player.
  function card(q, who, dm) {
    const opts = q.options.map((o, i) => {
      const slots = o.slots ?? [], pick = slots.includes(slotPick[`${q.n}:${o.reaction}`]) ? slotPick[`${q.n}:${o.reaction}`] : slots[0];
      const pickers = slots.length > 1 ? `<div class="rp-slots" role="group" aria-label="Spell slot level">${slots.map((l) => `<button type="button" data-slot="${l}" data-for="${esc(o.reaction)}" aria-pressed="${l === pick}">Level ${l}</button>`).join('')}</div>` : '';
      return `<div class="rp-opt" data-option="${esc(o.reaction)}"><div class="rp-name">${esc(o.name)}</div><div class="rp-cost">${esc(cost(o))}</div>${pickers}
        <button type="button" class="rp-take" data-take="${esc(o.reaction)}"${pick !== undefined ? ` data-slot-now="${pick}"` : ''}${sent ? ' disabled' : ''}>${dm ? 'Use' : 'Use'} ${esc(o.name)}${pick !== undefined && slots.length ? ` (level ${pick})` : ''}</button></div>`;
    }).join('');
    return `<div class="rp-card" role="alertdialog" aria-modal="${dm ? 'false' : 'true'}" aria-labelledby="rp-title" aria-describedby="rp-why">
      <h2 id="rp-title">${dm ? `${esc(who)} can use a reaction` : 'Use a reaction?'}</h2>
      <p id="rp-why" class="rp-why">${esc(trigger(q, dm ? who : null))}</p>
      ${dm ? `<p class="rp-dm note">A player is being asked. The table waits until it is answered; you may answer for them.</p>` : ''}
      ${opts}
      <button type="button" class="rp-no" data-take=""${sent ? ' disabled' : ''}>${dm ? 'No reaction' : 'Do not react'}</button>
      <p class="rp-err" id="rp-err" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p></div>`;
  }

  function draw(again) {
    const st = S();
    if (!st) { modal.hidden = bar.hidden = true; key = ''; return; }
    const dm = isDM(), pend = dm ? st.pending : null, q = dm ? (pend ? { n: pend.n, ...pend.ask } : null) : st.prompt;
    const waiting = !dm && q?.waiting;
    const k = !q ? '' : waiting ? 'w' : JSON.stringify([dm, q.n, q.reactor, q.trigger, q.options, q.by, q.total, q.ac, q.spell]);
    if (!again && k === key) return;
    if (k !== key) { key = k; sent = false; error = ''; slotPick = {}; armedAt = performance.now() + (q && !waiting ? ARM_MS : 0); }
    bar.hidden = !waiting;
    if (waiting) bar.textContent = 'The table is waiting for a reaction to be answered…';
    modal.hidden = !q || waiting;
    modal.classList.toggle('rp-dm', dm);
    document.body.classList.toggle('rp-open', !modal.hidden && !dm);
    if (modal.hidden) { modal.textContent = ''; return; }
    const focused = document.activeElement?.closest?.('#rp') ? document.activeElement.dataset.take ?? document.activeElement.dataset.slot : null;
    modal.innerHTML = card(q, nameOf(q.reactor) ?? 'A creature', dm);
    if (!again) { if (!dm) modal.querySelector('.rp-take, .rp-no')?.focus({ preventScroll: true }); }
    else if (focused !== null && focused !== undefined) modal.querySelector(`[data-take="${CSS.escape(focused)}"],[data-slot="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }

  // One handler for the whole sheet: it is redrawn on every change.
  modal.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const st = S(), q = isDM() ? (st?.pending ? { n: st.pending.n } : null) : st?.prompt;
    if (!q || q.waiting) return;
    if (b.dataset.slot) { slotPick[`${q.n}:${b.dataset.for}`] = +b.dataset.slot; draw(true); return; }
    if (b.dataset.take === undefined) return;
    answer(q.n, b.dataset.take === '' ? null : b.dataset.take, b.dataset.slotNow !== undefined ? +b.dataset.slotNow : undefined);
  });
  // Nothing outside the buttons answers or closes it; Escape does not either.
  modal.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ev.stopPropagation(); }, true);

  return {
    refresh: () => draw(false),
    // The table refused something (the engine's own words): if we had sent an answer, show why and let them try again.
    refused(msg) {
      if (modal.hidden) return;
      sent = false; error = msg; draw(true);
      modal.querySelector('.rp-err')?.scrollIntoView({ block: 'nearest' });
    },
    fresh() { key = ''; sent = false; error = ''; modal.hidden = bar.hidden = true; document.body.classList.remove('rp-open'); },
  };
}
