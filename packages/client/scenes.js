// Scenes: the screen for conversation with no map and no turns, for everyone at the table, and
// the DM's controls for it. Everything goes through actions (packages/rules/src/scenes.js); the
// transcript is built from `say` events, live and from the table's record.
// Design: docs/specs/maps-and-objects.md, "Sharing things that are not on the map", Scenes.
//
//   const SC = initScenes({ act, toast, transport: () => T, state: () => S, isDM, openPanel, startFight });
//   SC.refresh()          after every update
//   SC.events(events)     every batch of events, live
//   SC.history(entries)   entries from the record (the answer to a history request for `say`)
//   SC.refused()          the table refused the last action: a line not sent comes back to the box
//   SC.resync()           the connection came (back): ask the record for the transcript again
//   SC.describe(ev)       a log line for the events this module knows, or null
//   SC.fresh()            a new state from scratch (joining, resuming, a new solo world)
import { SKILLS } from './shared/content/schema.js';
import { checkBonus, recall } from './shared/engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const skillName = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const SAY_MAX = 500, NAME_MAX = 60, NOTES_MAX = 2000, TITLE_MAX = 80;

export function initScenes({ act, toast, transport, state, isDM, openPanel, startFight }) {
  const T = () => transport(), S = () => state();
  const me = () => T()?.you?.userId;
  const myFrom = () => (isDM() ? 'dm' : me());       // how a say event names the speaker
  const who = (id) => (id === 'dm' ? 'the DM' : (T()?.lobby?.members ?? []).find((m) => m.id === id)?.name ?? 'a player');
  const lines = new Map();         // scene id -> Map(line number -> say event)
  let feed = [];                   // checks rolled and asked during the scene on screen, for the transcript: { after: line, ev }
  let asks = [];                   // the DM's: requests for checks not yet answered
  let hiddenFor = null;            // the open scene this person has put aside to look at the map
  let prepShown = false;           // the DM is looking at a scene that is not open (being prepared, or set aside)
  let resyncing = false;           // the next history answer replaces the lines kept for the scene on screen
  let unsent = '';                 // the last line sent, to give back if the table refuses it
  let pick = null;                 // the DM's selection of transcript lines: { from, to }
  let editing = null;              // the NPC the DM has open
  let asked = null;                // the scene a history request has gone out for

  // ---------- the screen ----------
  const box = document.createElement('section');
  box.id = 'scene'; box.hidden = true; box.setAttribute('aria-label', 'Scene');
  box.innerHTML = `
    <header class="sc-head"><div class="sc-title"><small>Scene</small><strong id="sc-title"></strong></div>
      <span class="row"><button type="button" id="sc-map" title="Look at the map; the scene goes on">Map</button><button type="button" id="sc-tools" hidden aria-expanded="false">Run it</button></span></header>
    <div id="sc-prep" class="sc-prep" hidden><p id="sc-prep-text" class="note"></p><div class="row"><button type="button" id="sc-go">Open the scene</button></div></div>
    <div id="sc-picture" hidden></div>
    <ul id="sc-people" class="sc-people" aria-label="Who is here"></ul>
    <div id="sc-dm" class="sc-dm" hidden>
      <form id="sc-npc" class="sc-form" autocomplete="off">
        <strong id="sc-npc-head">Someone joins</strong>
        <input id="sc-npc-name" placeholder="Name" maxlength="${NAME_MAX}">
        <label class="ho-file"><span>Portrait</span><input type="file" id="sc-npc-file" accept="image/png,image/jpeg,image/webp"></label>
        <textarea id="sc-npc-notes" rows="2" maxlength="${NOTES_MAX}" placeholder="Your notes (only you see these)"></textarea>
        <div class="row"><button type="submit" id="sc-npc-save">Add</button><button type="button" id="sc-npc-remove" class="leave" hidden>Remove</button><button type="button" id="sc-npc-cancel" hidden>Done</button></div>
      </form>
      <form id="sc-call" class="sc-form" autocomplete="off">
        <strong>Call for a check</strong>
        <div class="row"><select id="sc-call-who" aria-label="Who makes the check"></select><select id="sc-call-skill" aria-label="Skill"></select>
        <input id="sc-call-dc" type="number" inputmode="numeric" min="1" max="40" placeholder="DC" aria-label="DC (players never see it)"><button type="submit">Roll</button></div>
        <p class="note">The DC stays with you: players see their roll, not the DC or whether it was met.</p>
      </form>
      <form id="sc-edit" class="sc-form" autocomplete="off">
        <strong>The scene</strong>
        <input id="sc-edit-title" placeholder="Title" maxlength="${TITLE_MAX}">
        <label class="ho-file"><span>Picture</span><input type="file" id="sc-edit-file" accept="image/png,image/jpeg,image/webp"></label>
        <div class="row"><button type="submit">Save</button><button type="button" id="sc-edit-nopic">No picture</button><button type="button" id="sc-fight">Start a fight</button><button type="button" id="sc-out" title="Back to the map; the scene is kept for later">Step out to the map</button><button type="button" id="sc-end" class="leave">End the scene</button></div>
      </form>
    </div>
    <ol id="sc-asks" class="sc-asks" hidden></ol>
    <ol id="sc-lines" class="sc-lines" aria-label="What has been said" aria-live="polite"></ol>
    <form id="sc-chron" class="sc-chron" autocomplete="off" hidden>
      <span id="sc-chron-what"></span>
      <input id="sc-chron-title" placeholder="Title for the chronicle" maxlength="${TITLE_MAX}">
      <textarea id="sc-chron-text" rows="1" placeholder="Anything to add (optional)"></textarea>
      <div class="row"><button type="submit">To the chronicle</button><button type="button" id="sc-chron-cancel">Cancel</button></div>
    </form>
    <form id="sc-say" class="sc-say" autocomplete="off">
      <select id="sc-as" aria-label="Speak as"></select>
      <input id="sc-text" maxlength="${SAY_MAX}" placeholder="Say something" enterkeyhint="send">
      <button type="submit">Say</button>
      <button type="button" id="sc-ask" aria-expanded="false" title="Ask the DM to let you make a check">Check</button>
      <button type="button" id="sc-note" title="Write a line to the chronicle" hidden>Chronicle</button>
    </form>
    <ul id="sc-skills" class="sc-skills" hidden aria-label="Ask for a check"></ul>`;
  document.body.append(box);
  const back = document.createElement('button');
  back.type = 'button'; back.id = 'btn-scene'; back.hidden = true; back.textContent = 'Scene';
  $('tools').prepend(back);

  // Pictures come through the table's file store, as handouts do.
  function pictures(root) {
    for (const img of root.querySelectorAll('img[data-asset]:not([src])')) {
      T()?.assets?.url(img.dataset.asset).then((u) => { img.src = u; }, () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'sc-face', textContent: '?' })); });
    }
  }
  const upload = async (input) => { const f = input.files[0]; return f ? (await T().assets.upload(f)).id : undefined; };

  // ---------- the transcript ----------
  const said = (id) => lines.get(id) ?? lines.set(id, new Map()).get(id);
  function take(ev) {
    if (ev.type === 'say' && ev.scene && Number.isInteger(ev.line)) said(ev.scene).set(ev.line, ev);
  }
  function events(evs) {
    const sc = S()?.scene;
    for (const ev of evs) {
      take(ev);
      if (ev.type === 'say' && ev.from === myFrom()) unsent = '';
      if (!sc) continue;
      const last = Math.max(0, ...said(sc.id).keys());
      if (ev.type === 'check' && S().entities[ev.id]?.side === 'party') feed.push({ scene: sc.id, after: last, ev });
      if (ev.type === 'checkAsked') { feed.push({ scene: sc.id, after: last, ev }); if (isDM()) asks.push(ev); }
    }
    for (const ev of evs) {
      if (ev.type === 'sceneStart') { hiddenFor = null; pick = null; editing = null; prepShown = !!ev.prep; }
      // Taking back or doing again a line leaves it on screens that already showed it: the record is
      // the truth, so the transcript is asked for again (the number of an undone line is reused).
      if ((ev.type === 'undone' || ev.type === 'redone') && !T()?.solo) resync();
    }
    const end = evs.findLast?.((e) => e.type === 'sceneEnd');
    if (end) { asks = []; feed = []; pick = null; editing = null; if (end.why === 'set aside') prepShown = false; if (!end.prep) hiddenFor = null; }
  }
  // Ask the record for the lines again; its answer replaces what is kept for the scene on screen.
  function resync() { const sc = S()?.scene; if (T()?.solo || !T()?.history || !sc?.open) return; resyncing = true; asked = sc.id; T().history({ types: ['say'], limit: 200 }); }
  function history(entries) {
    const sc = S()?.scene;
    if (resyncing && sc) { lines.delete(sc.id); resyncing = false; }
    for (const ev of entries) take(ev);
    refresh();
  }
  function fresh() { lines.clear(); feed = []; asks = []; pick = null; editing = null; asked = null; hiddenFor = null; prepShown = false; resyncing = false; }

  function renderLines(sc) {
    const all = T()?.solo ? recall(S(), { types: ['say'], limit: 5000 }).filter((e) => e.scene === sc.id) : [...said(sc.id).values()];
    all.sort((a, b) => a.line - b.line);
    const extra = feed.filter((f) => f.scene === sc.id);
    const out = [];
    const line = (f) => {
      const ev = f.ev;
      if (ev.type === 'checkAsked') out.push(`<li class="sc-sys">${esc(S().entities[ev.actor]?.name ?? 'Someone')} asks to make ${/^[aeiou]/i.test(ev.skill) ? 'an' : 'a'} ${esc(skillName(ev.skill))} check${isDM() && ev.by !== 'dm' ? ` (${esc(who(ev.by))})` : ''}.</li>`);
      else out.push(`<li class="sc-sys">${esc(S().entities[ev.id]?.name ?? 'Someone')} rolls ${esc(ev.skill ? skillName(ev.skill) : ev.ability.toUpperCase())}: <b>${ev.total}</b>${ev.dc !== undefined ? ` against DC ${ev.dc}: ${ev.success ? 'success' : 'failure'}` : ''}.</li>`);
    };
    for (const f of extra.filter((x) => x.after === 0)) line(f);
    for (const ev of all) {
      const sel = pick && ev.line >= pick.from && ev.line <= pick.to;
      const mineLine = ev.from === myFrom();
      out.push(`<li data-line="${ev.line}" class="${ev.as === null ? 'ooc' : ''}${mineLine ? ' mine' : ''}${sel ? ' picked' : ''}"><b>${esc(ev.name)}</b>${ev.as === null ? '<small>out of character</small>' : ''}<span>${esc(ev.text)}</span></li>`);
      for (const f of extra.filter((x) => x.after === ev.line)) line(f);
    }
    for (const f of extra.filter((x) => x.after > (all.at(-1)?.line ?? 0))) line(f);
    const list = $('sc-lines'), atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = out.join('') || `<li class="sc-sys">${isDM() ? 'Speak as someone in the scene, or out of character.' : 'Nothing has been said yet.'}</li>`;
    if (atEnd) list.scrollTop = list.scrollHeight;
  }
  $('sc-lines').onclick = (ev) => {
    if (!isDM()) return;
    const li = ev.target.closest('li[data-line]'); if (!li) return;
    const n = +li.dataset.line;
    // One tap picks a line, a second tap another line picks everything between; a tap inside starts again.
    if (pick && pick.from === pick.to && n === pick.from) pick = null;
    else if (pick && pick.from === pick.to) pick = { from: Math.min(pick.from, n), to: Math.max(pick.from, n) };
    else pick = { from: n, to: n };
    refresh();
  };

  // ---------- who is here ----------
  function renderPeople(sc) {
    const party = Object.values(S().entities).filter((e) => e.side === 'party' && !e.dead);
    const face = (asset, name) => (asset ? `<img data-asset="${esc(asset)}" alt="" class="sc-face">` : `<span class="sc-face">${esc(initials(name))}</span>`);
    $('sc-people').innerHTML = [
      ...party.map((e) => `<li class="party" style="--who:${esc(e.look?.color ?? 'var(--good)')}">${face(null, e.name)}<span>${esc(e.name)}</span></li>`),
      ...sc.present.map((p) => `<li class="npc${editing === p.id ? ' open' : ''}"${isDM() ? ` data-npc="${esc(p.id)}" role="button" tabindex="0"` : ''}>${face(p.portrait, p.name)}<span>${esc(p.name)}</span>${isDM() && p.notes ? '<small>notes</small>' : ''}</li>`),
      ...(isDM() ? ['<li class="add" data-npc="" role="button" tabindex="0"><span class="sc-face">+</span><span>Add someone</span></li>'] : []),
    ].join('');
    pictures($('sc-people'));
  }
  $('sc-people').onclick = (ev) => {
    const li = ev.target.closest('[data-npc]'); if (!li || !isDM()) return;
    const id = li.dataset.npc;
    editing = id || null;
    const p = S().scene?.present.find((x) => x.id === id);
    tools(true);
    $('sc-npc-head').textContent = p ? `Change ${p.name}` : 'Someone joins';
    $('sc-npc-name').value = p?.name ?? ''; $('sc-npc-notes').value = p?.notes ?? ''; $('sc-npc-file').value = '';
    $('sc-npc-save').textContent = p ? 'Save' : 'Add';
    $('sc-npc-remove').hidden = !p; $('sc-npc-cancel').hidden = !p;
    refresh();
    $('sc-npc-name').focus();
  };
  $('sc-people').onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.target.click?.(); } };
  const npcReset = () => { editing = null; $('sc-npc').reset(); $('sc-npc-head').textContent = 'Someone joins'; $('sc-npc-save').textContent = 'Add'; $('sc-npc-remove').hidden = $('sc-npc-cancel').hidden = true; };
  $('sc-npc').onsubmit = async (ev) => {
    ev.preventDefault();
    const name = $('sc-npc-name').value.trim();
    if (!name) return toast('Give them a name.');
    $('sc-npc-save').disabled = true;
    try {
      const portrait = await upload($('sc-npc-file'));
      act({ type: 'sceneNpc', npc: { ...(editing ? { id: editing } : {}), name, notes: $('sc-npc-notes').value, ...(portrait && { portrait }) } });
      npcReset(); tools(!S()?.scene?.open);
    } catch (err) { toast(err.message); } finally { $('sc-npc-save').disabled = false; }
  };
  $('sc-npc-remove').onclick = () => { if (editing) act({ type: 'sceneNpc', npc: { id: editing }, remove: true }); npcReset(); refresh(); };
  $('sc-npc-cancel').onclick = () => { npcReset(); refresh(); };

  // ---------- speaking ----------
  let lastAs = '';
  function renderAs(sc) {
    const sel = $('sc-as'), was = sel.value;
    const opts = isDM()
      ? [...sc.present.map((p) => [p.id, p.name]), ...(T()?.solo ? Object.values(S().entities).filter((e) => e.side === 'party' && !e.dead).map((e) => [e.id, e.name]) : []), ['', 'DM (out of character)']]
      : [...Object.values(S().entities).filter((e) => e.side === 'party' && e.owner === me()).map((e) => [e.id, e.name]), ['', 'Out of character']];
    const sig = JSON.stringify(opts);
    if (sig !== lastAs) { lastAs = sig; sel.innerHTML = opts.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join(''); }
    if (opts.some(([v]) => v === was)) sel.value = was;
    // Asking for a check needs a character of one's own (the DM calls for checks instead).
    $('sc-ask').hidden = isDM() || !opts.some(([v]) => v);
    $('sc-note').hidden = !isDM();
  }
  $('sc-say').onsubmit = (ev) => {
    ev.preventDefault();
    const text = $('sc-text').value.trim(); if (!text) return;
    unsent = text;
    $('sc-text').value = '';
    act({ type: 'say', as: $('sc-as').value || null, text });
  };
  // The table refused (too fast, too long): the words go back in the box, unless something is typed there already.
  function refused() { if (unsent && !$('sc-text').value && !box.hidden) $('sc-text').value = unsent; unsent = ''; }
  // A player's check request: the skills of the character they speak as (or their first), with the bonus.
  function askerOf() { const id = $('sc-as').value; const e = S().entities[id]; return e && e.owner === me() ? e : Object.values(S().entities).find((x) => x.side === 'party' && x.owner === me()); }
  $('sc-ask').onclick = () => {
    const e = askerOf(), list = $('sc-skills');
    if (!e) return toast('Take a character first.');
    const open = list.hidden;
    list.hidden = !open; $('sc-ask').setAttribute('aria-expanded', String(open));
    if (open) list.innerHTML = `<li class="sc-sys">${esc(e.name)} asks the DM to make a check:</li>` + Object.keys(SKILLS).map((k) => `<li><button type="button" data-skill="${k}"${e.skills?.includes(k) ? ' class="prof"' : ''}>${esc(skillName(k))} <small>${signed(checkBonus(e, { skill: k }))}</small></button></li>`).join('');
  };
  $('sc-skills').onclick = (ev) => {
    const b = ev.target.closest('[data-skill]'); if (!b) return;
    const e = askerOf(); if (!e) return;
    act({ type: 'askCheck', actor: e.id, skill: b.dataset.skill });
    $('sc-skills').hidden = true; $('sc-ask').setAttribute('aria-expanded', 'false');
  };

  // ---------- the DM's controls ----------
  // The DM's tools open over the picture, so the transcript and the box to speak in stay on screen.
  const tools = (open) => { $('sc-dm').hidden = !open; box.classList.toggle('tools', open); $('sc-tools').setAttribute('aria-expanded', String(open)); };
  $('sc-tools').onclick = () => tools($('sc-dm').hidden);
  function renderDM(sc) {
    const party = Object.values(S().entities).filter((e) => e.side === 'party' && !e.dead);
    const whoSel = $('sc-call-who'), was = whoSel.value;
    const sig = party.map((e) => e.id + e.name).join();
    if (whoSel.dataset.sig !== sig) { whoSel.dataset.sig = sig; whoSel.innerHTML = party.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''); }
    if (party.some((e) => e.id === was)) whoSel.value = was;
    if (!$('sc-call-skill').options.length) $('sc-call-skill').innerHTML = Object.keys(SKILLS).map((k) => `<option value="${k}">${esc(skillName(k))}</option>`).join('');
    if (document.activeElement !== $('sc-edit-title')) $('sc-edit-title').value = sc.title;
    $('sc-edit-nopic').disabled = !sc.image;
    const open = asks.filter((a) => S().entities[a.actor]);
    $('sc-asks').hidden = !open.length;
    $('sc-asks').innerHTML = open.map((a, i) => `<li data-i="${i}"><span><b>${esc(S().entities[a.actor].name)}</b> asks for ${esc(skillName(a.skill))}</span>
      <input type="number" inputmode="numeric" min="1" max="40" placeholder="DC" aria-label="DC"><button type="button" data-roll>Roll</button><button type="button" data-drop>No</button></li>`).join('');
    // Chronicle: the lines picked, or a line typed.
    $('sc-chron').hidden = !pick && !writing;
    $('sc-chron-what').textContent = pick ? (pick.from === pick.to ? `Line ${pick.from}` : `Lines ${pick.from} to ${pick.to}`) : 'A line of your own';
  }
  let writing = false;
  $('sc-note').onclick = () => { writing = true; pick = null; refresh(); $('sc-chron-title').focus(); };
  $('sc-chron-cancel').onclick = () => { writing = false; pick = null; $('sc-chron').reset(); refresh(); };
  $('sc-chron').onsubmit = (ev) => {
    ev.preventDefault();
    const title = $('sc-chron-title').value.trim(), text = $('sc-chron-text').value.trim();
    if (!title) return toast('Give the entry a title.');
    if (!pick && !text) return toast('Pick lines of the transcript or write something.');
    act({ type: 'sceneChronicle', title, ...(pick ? { lines: [pick.from, pick.to] } : {}), ...(text && { text }) });
    writing = false; pick = null; $('sc-chron').reset(); refresh();
  };
  $('sc-asks').onclick = (ev) => {
    const li = ev.target.closest('li[data-i]'); if (!li) return;
    const a = asks.filter((x) => S().entities[x.actor])[+li.dataset.i];
    if (ev.target.closest('[data-roll]')) {
      const dc = Number(li.querySelector('input').value);
      act({ type: 'check', actor: a.actor, skill: a.skill, ...(Number.isInteger(dc) && dc > 0 ? { dc } : {}) });
    } else if (!ev.target.closest('[data-drop]')) return;
    asks = asks.filter((x) => x !== a);
    refresh();
  };
  $('sc-call').onsubmit = (ev) => {
    ev.preventDefault();
    const dc = Number($('sc-call-dc').value);
    act({ type: 'check', actor: $('sc-call-who').value, skill: $('sc-call-skill').value, ...(Number.isInteger(dc) && dc > 0 ? { dc } : {}) });
  };
  $('sc-edit').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const image = await upload($('sc-edit-file'));
      act({ type: 'scene', scene: { title: $('sc-edit-title').value.trim(), ...(image && { image }) } });
      $('sc-edit-file').value = '';
    } catch (err) { toast(err.message); }
  };
  $('sc-edit-nopic').onclick = () => act({ type: 'scene', scene: { image: null } });
  $('sc-end').onclick = () => {
    const b = $('sc-end');
    if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Tap again'; setTimeout(() => { b.classList.remove('sure'); b.textContent = S()?.scene?.open ? 'End the scene' : 'Throw it away'; }, 3000); return; }
    act({ type: 'endScene' });
  };
  $('sc-out').onclick = () => act({ type: 'scene', scene: { open: false } });
  $('sc-go').onclick = () => { hiddenFor = null; act({ type: 'scene', scene: { open: true } }); };
  $('sc-fight').onclick = () => { hiddenFor = S().scene?.id ?? null; startFight(); refresh(); };

  // The DM panel's part: prepare a scene, start one at once, or go to the one there is.
  const dmBox = $('dm-scene');
  dmBox.innerHTML = `<h3>Scene</h3>
    <p class="note">A conversation away from the map: who is there, what is said, checks on request. Prepare one ahead and nobody else sees it until you open it. A fight ends an open scene.</p>
    <form id="sc-new" class="ho-form" autocomplete="off">
      <input id="sc-new-title" placeholder="Where, or who (The mayor's study)" maxlength="${TITLE_MAX}">
      <label class="ho-file"><span>Picture</span><input type="file" id="sc-new-file" accept="image/png,image/jpeg,image/webp"></label>
      <div class="row"><button type="submit" id="sc-new-prep" data-open="false">Prepare it</button><button type="submit" id="sc-new-go" data-open="true">Start it now</button></div>
    </form>
    <div id="sc-going" hidden><p class="note" id="sc-going-text"></p><div class="row"><button type="button" id="sc-open">Go to the scene</button></div></div>`;
  $('sc-new').onsubmit = async (ev) => {
    ev.preventDefault();
    const title = $('sc-new-title').value.trim();
    if (!title) return toast('Give the scene a title.');
    const open = ev.submitter?.dataset.open !== 'false';
    $('sc-new-go').disabled = $('sc-new-prep').disabled = true;
    try {
      const image = await upload($('sc-new-file'));
      act({ type: 'scene', scene: { title, open, ...(image && { image }) } });
      $('sc-new').reset();
      $('dm').hidden = true;                  // the screen takes the place of the panel
    } catch (err) { toast(err.message); } finally { $('sc-new-go').disabled = $('sc-new-prep').disabled = false; }
  };
  $('sc-open').onclick = () => { hiddenFor = null; prepShown = true; $('dm').hidden = true; refresh(); };
  $('sc-map').onclick = () => { const sc = S()?.scene; if (sc?.open) hiddenFor = sc.id; else prepShown = false; refresh(); };
  back.onclick = () => { hiddenFor = null; prepShown = true; refresh(); };

  // The box above the keyboard: on a phone the keyboard covers the bottom of the page, and the
  // box to speak in must not go under it. The visual viewport is what is left to see.
  function fit() {
    const vv = window.visualViewport;
    box.style.bottom = vv ? `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px` : '';
    if (vv && box.contains(document.activeElement)) { const l = $('sc-lines'); l.scrollTop = l.scrollHeight; }
  }
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  $('sc-text').addEventListener('focus', () => setTimeout(() => { fit(); $('sc-lines').scrollTop = $('sc-lines').scrollHeight; }, 250));

  const wasOpened = (sc) => /^sc\d+$/.test(sc.id);
  let wasPrep = false;
  function refresh() {
    const s = S(), t = T(); if (!s || !t) return;
    const sc = s.scene, dm = isDM();
    const shown = !!sc && (sc.open ? hiddenFor !== sc.id : dm && prepShown);      // a scene that is not open is the DM's alone
    const prep = shown && !sc.open;
    $('sc-new').hidden = !!sc || !dm; $('sc-going').hidden = !sc || !dm;
    if (sc && dm) $('sc-going-text').textContent = sc.open ? `${sc.title}: the table is in it.` : `${sc.title}: ${wasOpened(sc) ? 'set aside' : 'being prepared'}. Players see only the map.`;
    back.hidden = !sc || shown || (!sc.open && !dm);
    back.textContent = sc && !sc.open ? 'Scene (prepared)' : 'Scene';
    box.hidden = !shown;
    box.classList.toggle('prep', prep);
    document.body.classList.toggle('in-scene', shown);
    if (!sc) return;
    // Joining while a scene goes on: what was said before comes from the record.
    if (sc.open && !t.solo && asked !== sc.id) { asked = sc.id; t.history({ types: ['say'], limit: 200 }); }
    if (box.hidden) return;
    $('sc-title').textContent = sc.title;
    const pic = $('sc-picture');
    if ((pic.dataset.asset ?? '') !== (sc.image ?? '')) {
      pic.dataset.asset = sc.image ?? '';
      pic.innerHTML = sc.image ? `<img data-asset="${esc(sc.image)}" alt="${esc(sc.title)}">` : '';
      pictures(pic);
    }
    pic.hidden = !sc.image;
    $('sc-tools').hidden = !dm || prep;
    $('sc-prep').hidden = !prep;
    if (prep) $('sc-prep-text').textContent = wasOpened(sc) ? 'Set aside: the table is at the map. Change it, then open it to bring everyone back.' : 'Being prepared: nobody else can see this. Add who is there and your notes, then open it.';
    $('sc-go').disabled = !!s.encounter;
    if (prep) tools(true); else if (wasPrep) tools(false);       // a scene being prepared is all tools
    wasPrep = prep;
    $('sc-fight').hidden = $('sc-out').hidden = prep;
    $('sc-end').textContent = $('sc-end').classList.contains('sure') ? 'Tap again' : prep ? 'Throw it away' : 'End the scene';
    if (!dm) { tools(false); $('sc-asks').hidden = true; $('sc-chron').hidden = true; }
    else renderDM(sc);
    if (editing && !sc.present.some((p) => p.id === editing)) npcReset();       // gone, or renumbered when the scene was first opened
    renderPeople(sc);
    if (prep) return;
    renderAs(sc);
    renderLines(sc);
    fit();
  }

  function describe(ev) {
    switch (ev.type) {
      case 'say': return [`${ev.name}${ev.as === null ? ' (out of character)' : ''}: ${ev.text}`, ev.as === null ? 'ooc' : 'say'];
      case 'sceneStart': return [ev.prep ? `Scene prepared: ${ev.title}` : `Scene: ${ev.title}`, 'head'];
      case 'sceneEdit': return [`The scene is now: ${ev.title}`];
      case 'sceneEnd': return [`The scene ends${ev.why ? `: ${ev.why}` : ''}.`, 'head'];
      case 'sceneNpc': return [ev.change === 'added' ? `${ev.name} is here.` : ev.change === 'removed' ? `${ev.name} leaves.` : `${ev.name} is changed.`];
      case 'checkAsked': {
        const n = S()?.entities[ev.actor]?.name ?? 'Someone', k = skillName(ev.skill);
        return [isDM() ? `${who(ev.by)} asks: ${n}, ${k}.` : `You ask the DM: ${n}, ${k}.`, 'private'];
      }
      default: return null;
    }
  }
  return { refresh, events, history, describe, fresh, refused, resync };
}
