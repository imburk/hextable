// The rewards after a fight (docs/specs/table-ui.md, Decision 4; docs/specs/table-ui.md build notes, "Engine, part 2").
//
//   the DM:      after a won fight (or one the DM ended) the engine keeps a conclusion in `state.conclusion`. This file draws it as a form:
//                the foes with their XP and a tick for each that counts, bonus lines with a reason, each character's share, the loot lines.
//                Every edit is the `conclusion` action ({ edit }), so it is undoable and the form can be left half done and come back to
//                from the DM tab. [Show to the players] publishes it, [No rewards] skips it. In solo the one button is "Done".
//   players:     "The fight is over. The DM is working out the rewards." until it is published, and nothing else: the view sends no
//                XP, loot or foes before then. After it, the card: XP each, the bonus lines with their reasons, loot and who holds it,
//                and a note for anyone who can level up (levelling stays the DM's action).
//
// The client decides nothing: totals, shares, who counts and the refusals are the engine's. A number typed in the form is sent as typed;
// the engine says whether it is a whole number of XP. What is not a rule here (grouping "Goblin x3", thousands commas) is presentation.
import { xpFor, levelForXp } from './shared/rewards.js';
import { CONTENT } from './shared/content/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n).toLocaleString('en-US');
const SEEN = 'hextable.conclusionSeen';

// ---- words, as pure functions so they can be tested from a view ----

// "Goblin warrior x3, Wolf": the foes that counted, the same name together.
export function foeLine(foes) {
  const n = new Map();
  for (const f of foes ?? []) if (f.counts) { const k = f.name.replace(/ \d+$/, ''); n.set(k, (n.get(k) ?? 0) + 1); }      // the engine numbers copies ("Wolf 1"); the card counts them
  return [...n].map(([name, k]) => (k > 1 ? `${name} x${k}` : name)).join(', ');
}
export const lootText = (l) => (l.qty > 1 ? `${l.name} x${l.qty}` : l.name);
// The shares: one figure for all, or one per character. `nameOf(id)` gives a character's name.
export function shares(c, nameOf) {
  const rows = (c.party ?? []).map((id) => ({ id, name: nameOf(id), n: c.xp?.per?.[id] ?? 0 }));
  const same = rows.length > 0 && rows.every((r) => r.n === rows[0].n);
  return { each: same ? rows[0].n : null, rows };
}
export const resultLine = (c) => (c.result === 'ended' ? 'The fight has ended.' : 'The fight is won.');
// The log's line for the published record.
export function logLine(c, nameOf) {
  const s = shares(c, nameOf), bonus = (c.xp?.bonus ?? []).map((b) => `${b.amount} for ${b.reason}`);
  const xp = !s.rows.length ? '' : s.each !== null ? `${num(s.each)} XP each` : s.rows.map((r) => `${r.name} ${num(r.n)}`).join(', ');
  const found = (c.loot ?? []).map((l) => `${lootText(l)}${l.to ? ` (${nameOf(l.to)})` : ''}`);
  return `${resultLine(c)} ${[xp && `Experience: ${xp}${bonus.length ? `, including ${bonus.join(', ')}` : ''}.`, found.length && `Found: ${found.join(', ')}.`].filter(Boolean).join(' ')}`.trim();
}
// A party character's XP against the next level, from the character's own record and the SRD's table.
export function xpFact(e) {
  if (e?.kind !== 'pc' || typeof e.xp !== 'number') return '';
  return `<span>XP ${num(e.xp)}${e.level < 20 ? ` / ${num(xpFor(e.level + 1))}` : ''}</span>`;
}
export const xpToLevel = (e) => (typeof e?.xp !== 'number' ? '' : e.level < 20 ? `${num(e.xp)} / ${num(xpFor(e.level + 1))} to level ${e.level + 1}` : `${num(e.xp)} XP`);
// The engine's own helper says whether the XP has reached a level above the character's.
export const readyToLevel = (e) => e?.kind === 'pc' && typeof e.xp === 'number' && levelForXp(e.xp) > (e.level ?? 1);

const SHARE_NOTE = { split: 'Shared equally among the characters who took part and are alive.', full: 'Each character gets the whole amount.' };
const cleaned = (v) => (/^-?\d+$/.test(String(v).trim()) ? Number(v) : v);      // a whole number goes as a number; anything else goes as typed, for the engine to refuse

// ctx: { act, state(), isDM(), solo(), code(), prefs }
export function initConclusion(ctx) {
  const wrap = document.createElement('div'); wrap.id = 'cc'; wrap.hidden = true;
  const wait = document.createElement('div'); wait.id = 'cc-wait'; wait.hidden = true; wait.setAttribute('role', 'status');
  const chip = document.createElement('button'); chip.type = 'button'; chip.id = 'cc-chip'; chip.hidden = true; chip.textContent = 'Rewards waiting. Show';
  document.body.append(wrap, wait, chip);
  const names = CONTENT.weapons ? Object.values(CONTENT.weapons).map((w) => w.name) : [];
  const gear = [...names, ...Object.values(CONTENT.armour ?? {}).map((a) => a.name)];

  let offered = null, later = null, doneSolo = null, error = '', key = '', draft = { bonus: { amount: '', reason: '' }, loot: { name: '', qty: '1', to: '' } }, adding = null, last = '', focusNext = false, shownFight = null;
  const S = () => ctx.state();
  const nameOf = (id) => S()?.entities[id]?.name ?? 'Someone';
  const seenKeys = () => ctx.prefs.get(SEEN) ?? [];
  const tag = (c) => `${ctx.code()}:${c.fight}`;
  const isSeen = (c) => seenKeys().includes(tag(c));
  const markSeen = (c) => ctx.prefs.set(SEEN, [...seenKeys().filter((k) => k !== tag(c)), tag(c)].slice(-20));
  const send = (edit) => { error = ''; ctx.act({ type: 'conclusion', edit }); };

  // ---- the DM's form ----
  function form(c) {
    const solo = ctx.solo(), party = c.party.map((id) => S().entities[id]).filter(Boolean);
    const foes = c.foes.length ? c.foes.map((f) => `<li class="cc-row"><label class="check"><input type="checkbox" data-foe="${esc(f.id)}"${f.counts ? ' checked' : ''}> <span>${esc(f.name)}</span></label><span class="cc-n">${num(f.xp)} XP</span></li>`).join('') : '<li class="note">No foes took part.</li>';
    const bonus = c.xp.bonus.map((b, i) => `<li class="cc-bonus" data-i="${i}"><input type="text" inputmode="numeric" class="cc-amt" data-bamt value="${esc(b.amount)}" aria-label="Bonus XP"><input type="text" class="cc-reason" data-breason maxlength="80" value="${esc(b.reason)}" aria-label="Reason"><button type="button" data-brm="${i}" aria-label="Remove this bonus">&times;</button></li>`).join('');
    const mine = party.map((e) => {
      const fixed = c.xp.fixed.includes(e.id);
      return `<li class="cc-share"><span class="cc-who"><b>${esc(e.name)}</b><small>${e.dead ? 'died' : esc(xpToLevel(e))}</small></span>
        <input type="text" inputmode="numeric" data-per="${esc(e.id)}" value="${esc(c.xp.per[e.id] ?? 0)}" aria-label="XP for ${esc(e.name)}"><span class="cc-unit">XP</span>
        ${fixed ? `<button type="button" class="cc-reset" data-reset="${esc(e.id)}">Set by you. Reset</button>` : ''}</li>`;
    }).join('');
    const holder = (sel) => `<option value="">The party (nobody yet)</option>${party.map((e) => `<option value="${esc(e.id)}"${sel === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}`;
    const loot = c.loot.map((l) => `<li class="cc-loot"><span class="cc-lname">${esc(lootText(l))}${l.from ? `<small> from ${esc(l.from)}</small>` : ''}</span>
      <select data-assign="${esc(l.id)}" aria-label="Who holds ${esc(l.name)}">${holder(l.to)}</select><button type="button" data-lrm="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">&times;</button></li>`).join('');
    return `<div class="cc-card cc-dm" role="dialog" aria-modal="false" aria-labelledby="cc-title">
      <div class="cc-head"><h2 id="cc-title" tabindex="-1">${resultLine(c)}</h2><button type="button" class="cc-x" data-cc="later" aria-label="Decide later and look at the map">&times;</button></div>
      <p class="cc-sub">${c.rounds} round${c.rounds === 1 ? '' : 's'}${c.where ? ` &middot; ${esc(c.where)}` : ''}</p>
      <p class="note">${solo ? 'Settle the rewards for this fight.' : 'The players are told only that the rewards are being worked out, until you show them.'}</p>
      <h3>Foes</h3><ul class="cc-list">${foes}</ul>
      <p class="cc-total">From foes: <b>${num(c.xp.base)} XP</b></p>
      <h3>Bonus XP</h3><ul class="cc-list">${bonus}
        <li class="cc-bonus cc-new"><input type="text" inputmode="numeric" class="cc-amt" data-nb-amt placeholder="50" value="${esc(draft.bonus.amount)}" aria-label="New bonus XP"><input type="text" class="cc-reason" data-nb-reason maxlength="80" placeholder="Reason, for example Freed the prisoner" value="${esc(draft.bonus.reason)}" aria-label="Reason for the new bonus"><button type="button" data-badd>Add</button></li></ul>
      <h3>Each character gets</h3><p class="note">${esc(SHARE_NOTE[S().settings.xpShare ?? 'split'] ?? '')}</p><ul class="cc-list">${mine}</ul>
      <h3>Loot</h3><ul class="cc-list">${loot}
        <li class="cc-loot cc-new"><input type="text" list="cc-names" data-nl-name maxlength="60" placeholder="Shortbow, 35 gp..." value="${esc(draft.loot.name)}" aria-label="New loot"><input type="text" inputmode="numeric" class="cc-qty" data-nl-qty value="${esc(draft.loot.qty)}" aria-label="Quantity"><select data-nl-to aria-label="Who holds it">${holder(draft.loot.to)}</select><button type="button" data-ladd>Add</button></li></ul>
      <datalist id="cc-names">${gear.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <p class="cc-err" id="cc-err" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p>
      <div class="cc-actions"><button type="button" class="cc-go" data-cc="publish">${solo ? 'Done' : 'Show to the players'}</button><button type="button" data-cc="skip">No rewards</button><button type="button" data-cc="later">Decide later</button></div>
    </div>`;
  }

  // ---- the published card: what the players see, and the DM too ----
  function result(c) {
    const st = S(), s = shares(c, nameOf), beaten = foeLine(c.foes.filter((f) => f.seen !== false));
    const bonus = c.xp.bonus.map((b) => `<li><b>+${num(b.amount)}</b> ${esc(b.reason)}</li>`).join('');
    const xpHead = !s.rows.length ? '' : s.each !== null ? `+${num(s.each)} each` : '';
    const rows = s.each === null ? s.rows.map((r) => `<li class="cc-line"><span>${esc(r.name)}</span><b>+${num(r.n)}</b></li>`).join('') : '';
    const progress = c.party.map((id) => st.entities[id]).filter(Boolean).map((e) => `<li class="cc-line"><span>${esc(e.name)}</span><span>${esc(xpToLevel(e))}</span></li>${readyToLevel(e) ? `<li class="cc-ready">${esc(e.name)}: Ready to level up${ctx.isDM() ? '' : ': ask your DM'}</li>` : ''}`).join('');
    const loot = c.loot.map((l) => `<li class="cc-line"><span>${esc(lootText(l))}</span><span>${l.to ? esc(nameOf(l.to)) : 'the party'}</span></li>`).join('');
    return `<div class="cc-card" role="dialog" aria-modal="false" aria-labelledby="cc-title">
      <div class="cc-head"><h2 id="cc-title" tabindex="-1">${resultLine(c)}</h2><span class="cc-rounds">${c.rounds} round${c.rounds === 1 ? '' : 's'}</span></div>
      ${beaten ? `<p class="cc-sub">${esc(beaten)}</p>` : ''}
      <h3>Experience${xpHead ? `<span class="cc-each">${xpHead}</span>` : ''}</h3>
      ${rows ? `<ul class="cc-list">${rows}</ul>` : ''}${bonus ? `<ul class="cc-list cc-bonuses">${bonus}</ul>` : ''}
      ${progress ? `<ul class="cc-list">${progress}</ul>` : ''}
      ${loot ? `<h3>Found</h3><ul class="cc-list">${loot}</ul>` : ''}
      <div class="cc-actions"><button type="button" class="cc-go" data-cc="continue">Continue</button></div></div>`;
  }

  function sync(St, { calm = true } = {}) {
    const c = St?.conclusion, dm = ctx.isDM(), held = !!(St && (St.prompt || St.pending));
    const pendingDM = !!c && dm && c.published === false;
    // A new fight's rewards wait as a line at the top, not over the map: the DM may still want to place, heal or look first.
    if (pendingDM && offered !== c.fight) { offered = c.fight; later = c.fight; }
    wait.hidden = !(c?.pending && !dm);
    if (!wait.hidden) wait.textContent = 'The fight is over. The DM is working out the rewards.';
    const dmBox = $('dm-rewards');
    if (dmBox) { dmBox.hidden = !pendingDM; $('dm-rewards-open').hidden = !pendingDM; }
    if (!c || c.pending || !calm) { if (!c || c.pending) { wrap.hidden = chip.hidden = true; wrap.textContent = ''; key = ''; document.body.classList.remove('cc-open'); } return; }
    let show = false;
    if (pendingDM) { show = later !== c.fight; chip.hidden = show || held; }
    else { chip.hidden = true; show = c.published === true && !isSeen(c) && !(doneSolo === c.fight); }
    show = show && !held;
    wrap.hidden = !show; document.body.classList.toggle('cc-open', show);
    if (!show) { wrap.textContent = ''; key = ''; return; }
    const k = JSON.stringify([c, error, S().settings.xpShare, pendingDM ? null : Object.values(S().entities).map((e) => e.xp)]);
    if (k === key) return;
    if (adding && JSON.stringify(c) !== last) { draft[adding] = adding === 'bonus' ? { amount: '', reason: '' } : { name: '', qty: '1', to: '' }; }
    if (JSON.stringify(c) !== last) adding = null;
    last = JSON.stringify(c);
    key = k;
    const f = document.activeElement?.closest?.('#cc') ? document.activeElement : null;
    const keep = f ? ['data-foe', 'data-per', 'data-assign', 'data-bamt', 'data-breason', 'data-nb-amt', 'data-nb-reason', 'data-nl-name', 'data-nl-qty', 'data-nl-to', 'data-cc'].map((a) => (f.hasAttribute(a) ? `[${a}="${CSS.escape(f.getAttribute(a))}"]` : null)).find(Boolean) : null;
    const scroll = wrap.querySelector('.cc-card')?.scrollTop ?? 0;
    wrap.innerHTML = pendingDM ? form(c) : result(c);
    const card = wrap.querySelector('.cc-card');
    if (shownFight === c.fight && !focusNext) card.scrollTop = scroll;
    if (shownFight !== c.fight || focusNext) { shownFight = c.fight; focusNext = false; if (!document.body.classList.contains('drawer-open')) $('cc-title').focus({ preventScroll: true }); }
    else if (keep) wrap.querySelector(keep)?.focus({ preventScroll: true });
  }

  const redraw = () => { key = ''; sync(S()); };
  const bonusList = () => [...wrap.querySelectorAll('.cc-bonus:not(.cc-new)')].map((li) => ({ amount: cleaned(li.querySelector('[data-bamt]').value), reason: li.querySelector('[data-breason]').value }));
  wrap.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('[data-nb-amt]')) draft.bonus.amount = t.value; else if (t.matches('[data-nb-reason]')) draft.bonus.reason = t.value;
    else if (t.matches('[data-nl-name]')) draft.loot.name = t.value; else if (t.matches('[data-nl-qty]')) draft.loot.qty = t.value;
  });
  wrap.addEventListener('change', (ev) => {
    const t = ev.target, c = S()?.conclusion;
    if (!c || c.published !== false) return;
    if (t.matches('[data-foe]')) send({ foes: { [t.dataset.foe]: t.checked } });
    else if (t.matches('[data-bamt], [data-breason]')) send({ bonus: bonusList() });
    else if (t.matches('[data-per]')) send({ per: { [t.dataset.per]: cleaned(t.value) } });
    else if (t.matches('[data-assign]')) send({ loot: { assign: { [t.dataset.assign]: t.value || null } } });
    else if (t.matches('[data-nl-to]')) draft.loot.to = t.value;
  });
  wrap.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const c = S()?.conclusion; if (!c) return;
    const d = b.dataset;
    if (d.cc === 'continue') { markSeen(c); redraw(); return; }
    if (c.published !== false) return;
    if (d.cc === 'later') { later = c.fight; error = ''; redraw(); chip.focus({ preventScroll: true }); }
    else if (d.cc === 'publish') { error = ''; if (ctx.solo()) doneSolo = c.fight; ctx.act({ type: 'conclusion', publish: true }); }
    else if (d.cc === 'skip') { error = ''; ctx.act({ type: 'conclusion', skip: true }); }
    else if (d.brm !== undefined) send({ bonus: bonusList().filter((_, i) => i !== +d.brm) });
    else if (d.badd !== undefined) { adding = 'bonus'; send({ bonus: [...bonusList(), { amount: cleaned(draft.bonus.amount === '' ? 0 : draft.bonus.amount), reason: draft.bonus.reason }] }); }
    else if (d.reset) send({ per: { [d.reset]: null } });
    else if (d.lrm) send({ loot: { remove: [d.lrm] } });
    else if (d.ladd !== undefined) { adding = 'loot'; send({ loot: { add: [{ name: draft.loot.name, qty: cleaned(draft.loot.qty), ...(draft.loot.to ? { to: draft.loot.to } : {}) }] } }); }
  });
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); const c = S()?.conclusion; if (c?.published === false) later = c.fight; else if (c) markSeen(c); redraw(); } });
  chip.addEventListener('click', () => { later = null; focusNext = true; redraw(); });
  $('dm-rewards-open')?.addEventListener('click', () => { later = null; focusNext = true; redraw(); });
  $('log-rewards')?.addEventListener('click', () => {
    const c = S()?.conclusion; if (!c?.published) return;
    ctx.prefs.set(SEEN, seenKeys().filter((k) => k !== tag(c))); doneSolo = null; focusNext = true; redraw();
  });

  return {
    sync,
    // The engine refused an edit: show why, in its words, on the form.
    refused(msg) { adding = null; if (wrap.hidden) return; error = msg; redraw(); $('cc-err')?.scrollIntoView({ block: 'nearest' }); },
    fresh() { later = doneSolo = offered = null; error = ''; key = last = ''; adding = null; shownFight = null; wrap.hidden = wait.hidden = chip.hidden = true; wrap.textContent = ''; document.body.classList.remove('cc-open'); },
    // The Log tab's button to bring the last published card back.
    reopenable: (St) => !!St?.conclusion?.published,
  };
}
