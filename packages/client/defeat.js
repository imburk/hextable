// The party has fallen (docs/specs/table-ui.md, Decision 1). One quiet card over the map, drawn from the state, not from an event, so a
// player who reloads or joins late sees it too. It stays until the DM chooses or a party member is up again.
//
//   players: what happened, who, and that the DM decides. They can put it aside to look at the map and bring it back from a small
//            line at the top; they are given no choice.
//   the DM:  the same, with the choices from the spec: go back to the start of the fight, go back to the last rest, carry on.
//   solo:    the same choices in the first person, for the one person who is the DM and every hero.
//
// The rule that says the party has fallen is the engine's (`fallen`, engine.js); this file only reads it. A rewind is a message about
// the history, not an action ({t:'rewind', to}, packages/server/README.md, Rewind): the transport sends it, the engine does it, and a
// refusal is shown in the engine's own words.
import { fallen } from './shared/engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// How each character ended, in the words of the card.
export const HOW = { died: 'died', stable: 'down, stable', dying: 'down, dying' };
const SENTENCE = { died: 'died', stable: 'is down and stable', dying: 'is down and dying' };

// The party's characters and how each is: dead, Stable at 0, or at 0 and still dying. Companions and summons are not listed.
export function fallenRows(S) {
  return Object.values(S?.entities ?? {}).filter((e) => e.side === 'party' && e.kind === 'pc')
    .map((e) => ({ id: e.id, name: e.name, how: e.dead ? 'died' : e.cond?.stable ? 'stable' : 'dying' }));
}
// "Brenna died. Tor is down and stable." for a reader who wants a sentence (the DM's summary and the screen reader).
export const fallenSummary = (rows) => rows.map((r) => `${r.name} ${SENTENCE[r.how]}.`).join(' ');

// The DM's three choices. `info` is the transport's undo information: `pins` says which copies the history holds
// ({fight, rest}, booleans; absent when the transport has not said yet, and then the engine is asked and may refuse),
// and `pinsError` is why there are none when the browser refused the space (solo).
export function choices({ solo, pins, pinsError }) {
  const no = (k, why) => (pinsError ? pinsError : pins && pins[k] === false ? why : '');
  const fight = no('fight', 'No fight to go back to.'), rest = no('rest', 'No rest to go back to.');
  return [
    { to: 'fight', label: solo ? 'Try the fight again' : 'Go back to the start of the fight',
      what: 'The table as it was when initiative was called, with new dice. Undo brings this back.', why: fight },
    { to: 'rest', label: 'Go back to the last rest',
      what: 'The table as it was after the last rest. Undo brings this back.', why: rest },
    { to: null, label: solo ? 'Carry on' : 'Carry on from here',
      what: 'Nothing changes. Capture, rescue or new characters: Quick entry is under Menu, DM.', why: '' },
  ];
}
const SURE = {
  fight: 'Go back to the start of the fight? Everything since then is taken back and the dice are new. Undo brings it back.',
  rest: 'Go back to the last rest? Everything since then is taken back and the dice are new. Undo brings it back.',
};

// ctx: { state(), isDM(), solo(), info() -> the transport's undoInfo, rewind(to) }
export function initDefeat(ctx) {
  const wrap = document.createElement('div');
  wrap.id = 'df'; wrap.hidden = true;
  const chip = document.createElement('button');
  chip.type = 'button'; chip.id = 'df-chip'; chip.hidden = true; chip.textContent = 'The party has fallen. Show';
  document.body.append(wrap, chip);

  let aside = false, carried = false, ask = null, error = '', key = '', was = false, focusNext = false;

  const dmBox = $('dm-fallen');

  function card(S, rows) {
    const dm = ctx.isDM(), solo = ctx.solo();
    const list = `<ul class="df-who">${rows.map((r) => `<li data-how="${r.how}"><b>${esc(r.name)}</b><span>${HOW[r.how]}</span></li>`).join('')}</ul>`;
    let body;
    if (!dm) {
      body = `${list}<p class="df-next">The DM will decide what happens next.</p>
        <div class="df-actions"><button type="button" class="df-aside" data-df="aside">Look at the map</button></div>`;
    } else if (ask) {
      body = `${list}<p class="df-sure" role="alert">${esc(SURE[ask])}</p>
        <div class="df-actions"><button type="button" class="df-go" data-df="yes">${ask === 'fight' ? (solo ? 'Try the fight again' : 'Go back to the start of the fight') : 'Go back to the last rest'}</button>
        <button type="button" data-df="no">Not now</button></div>`;
    } else {
      const opts = choices({ solo, ...ctx.info() }).map((c) => `<div class="df-choice${c.why ? ' off' : ''}">
        <button type="button" data-df="${c.to ?? 'carry'}"${c.why ? ' disabled' : ''}>${esc(c.label)}</button>
        <p>${esc(c.why || c.what)}</p></div>`).join('');
      body = `${list}${opts}`;
    }
    return `<div class="df-card" role="dialog" aria-modal="false" aria-labelledby="df-title" aria-describedby="df-sum">
      <div class="df-head"><h2 id="df-title" tabindex="-1">The party has fallen.</h2><button type="button" class="df-x" data-df="aside" aria-label="Put the card aside and look at the map">&times;</button></div>
      <p id="df-sum" class="sr-only">${esc(fallenSummary(rows))}</p>
      ${body}
      <p class="df-err" id="df-err" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p></div>`;
  }

  function sync(S, { calm = true } = {}) {
    const f = !!S && fallen(S);
    if (!f) {
      if (was) { aside = carried = false; ask = null; error = ''; key = ''; }
      was = false; wrap.hidden = chip.hidden = true; wrap.textContent = ''; if (dmBox) dmBox.hidden = true;
      return;
    }
    if (!calm) return;                       // the beats that led to it are still playing: the card comes when they are done
    const fresh = !was; was = true;
    const dm = ctx.isDM(), held = !!(S.prompt || S.pending);      // a reaction question is above everything and is answered first
    if (dmBox) {
      dmBox.hidden = !dm;
      $('dm-fallen-open').hidden = !(carried || aside);
    }
    const showCard = !aside && !carried && !held;
    wrap.hidden = !showCard;
    chip.hidden = !(aside && !carried) || held;
    document.body.classList.toggle('df-open', showCard);
    if (!showCard) { wrap.textContent = ''; key = ''; return; }
    const rows = fallenRows(S);
    const k = JSON.stringify([rows, dm, ctx.solo(), ask, error, dm && !ask ? ctx.info() : null]);
    if (k === key) return;
    const focused = document.activeElement?.closest?.('#df') ? document.activeElement.dataset.df : null;
    key = k;
    wrap.innerHTML = card(S, rows);
    const t = $('df-title');
    if (fresh || focusNext) { focusNext = false; t.focus({ preventScroll: true }); }
    else if (focused) wrap.querySelector(`[data-df="${CSS.escape(focused)}"]:not([disabled])`)?.focus({ preventScroll: true });
  }

  const redraw = () => { key = ''; sync(ctx.state()); };
  wrap.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-df]');
    if (!b || b.disabled) return;
    const v = b.dataset.df;
    if (v === 'aside') { aside = true; ask = null; error = ''; redraw(); chip.focus({ preventScroll: true }); }
    else if (v === 'carry') { carried = true; ask = null; error = ''; redraw(); }
    else if (v === 'fight' || v === 'rest') { ask = v; error = ''; focusNext = false; redraw(); wrap.querySelector('[data-df="yes"]')?.focus({ preventScroll: true }); }
    else if (v === 'no') { ask = null; error = ''; redraw(); }
    else if (v === 'yes') { const to = ask; error = ''; ctx.rewind(to); }       // the answer is a whole update, or a refusal on refused()
  });
  chip.addEventListener('click', () => { aside = false; carried = false; focusNext = true; redraw(); });
  $('dm-fallen-open')?.addEventListener('click', () => { aside = false; carried = false; focusNext = true; redraw(); });
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); aside = true; ask = null; redraw(); chip.focus({ preventScroll: true }); } });

  return {
    sync,
    // The table refused something: if the card was asking about a rewind, show why and go back to the choices.
    refused(msg) {
      if (wrap.hidden || !ask) return;
      ask = null; error = msg; redraw();
      $('df-err')?.scrollIntoView({ block: 'nearest' });
    },
    fresh() { aside = carried = false; ask = null; error = ''; key = ''; was = false; wrap.hidden = chip.hidden = true; wrap.textContent = ''; document.body.classList.remove('df-open'); },
    get open() { return !wrap.hidden; },
  };
}
