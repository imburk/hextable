// The feedback button (issue #353, docs/specs/feedback.md): a chat icon in a corner and a small panel that sends a comment, with what just
// happened if the player allows it, to POST /feedback on the table server.
//
// The one rule: the report is built only from what this client already showed or sent. The log lines are the ones the log was
// handed to draw (app.js `beat`), the actions are the ones this client sent with the answer it got, the errors are the ones the page
// raised, and the rest are facts about this browser and the viewer's own selection. Nothing is read from hidden fields, the seed, the
// table's state at large, other people's chat, notes or handouts. No name of a person or of their character leaves: every line is scrubbed
// first (`createScrubber`). Nothing about the table's identity is sent at all, not the code and not a hash of it.
//
//   the model   createScrubber(), createRecorder(), actionArgs(), buildReport(), fitReport()   pure: tests drive them with no page
//   the page    initFeedback({ look, onBuild }) -> { shown(line), attach(transport), open(), buildLine() }
//               look() -> { S, T, selId, themeId, renderer, mine }: what the app has now, read only when a report is built.
//               The build stamp (build.json beside the game: { commit, when, pr?, subject?, source }) is fetched once, silently; About
//               shows `buildLine()` and the report's `build` field carries `buildId()`. onBuild() is called when it has arrived.
import { VERSION } from './shared/migrate.js';
import { MONSTERS } from './shared/content/index.js';

export const COMMENT_MAX = 2000, REPORT_MAX = 24 * 1024, LOG_LINES = 30, ACTIONS = 15, ERRORS = 10, LINE_MAX = 300;
const DRAFT = 'hextable.feedback.draft';
const KINDS = [['bug', 'Bug'], ['idea', 'Idea'], ['question', 'Question']];
// What the server's allow-list accepts of an action's arguments (packages/server/src/feedback.js): ids, words and numbers, never text typed by a player.
const ARG_KEYS = ['actor', 'target', 'targets', 'attack', 'action', 'spell', 'feature', 'skill', 'ability', 'slot', 'level', 'prompt', 'take', 'to', 'hex', 'mode', 'item', 'id', 'by', 'kind'];
const WORD = /^[\w.:-]{1,40}$/;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
const isScalar = (v) => v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && WORD.test(v));

// ---- names never leave ----
// Every line of the log is written with the names of this table in it. Before it is kept, each name this client has in view is replaced by a
// stable placeholder: a player's moniker by "Player 2", a party character's name by "Hero 1 (Fighter)", and a creature's name only kept when
// it is a content entry's own name ("Goblin Warrior"), else "a creature". Names are matched whole (not inside a longer word), in one pass,
// so a name made of regex characters or one that sits inside ordinary words does no harm and a placeholder is never scrubbed again.
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function createScrubber(monsterName = (tpl) => MONSTERS[tpl]?.name) {
  const map = new Map();                                   // lower-cased name -> placeholder
  let players = 0, heroes = 0, re = null;
  const add = (name, make) => { const k = String(name ?? '').trim(); if (k.length && !map.has(k.toLowerCase())) { map.set(k.toLowerCase(), make()); re = null; } };
  return {
    // What this client has in view now: { S, T } as app.js has them.
    learn({ S, T }) {
      for (const n of [T?.you?.name, ...(T?.lobby?.members ?? []).map((m) => m.name), ...(T?.lobby?.pending ?? []).map((m) => m.name), ...Object.values(S?.entities ?? {}).map((e) => e.ownerName)]) add(n, () => `Player ${++players}`);
      for (const e of Object.values(S?.entities ?? {})) {
        if (e.side === 'party' && e.kind === 'pc') add(e.name, () => `Hero ${++heroes}${e.cls ? ` (${String(e.cls).replace(/[^\w ]/g, '').slice(0, 20)})` : ''}`);
        else { const base = e.tpl ? monsterName(e.tpl) : null; if (!(base && String(e.name) === base || (base && new RegExp(`^${escRe(base)} \\d{1,3}$`).test(String(e.name))))) add(e.name, () => 'a creature'); }      // only a content name, with the game's own numbering, is kept
      }
    },
    text(t) {
      const s = String(t ?? '');
      if (!map.size) return s;
      re ??= new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...map.keys()].sort((a, b) => b.length - a.length).map(escRe).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
      return s.replace(re, (m) => map.get(m.toLowerCase()) ?? m);
    },
  };
}
// Every kind of line the log can show, by the event's type, and what may leave in a report:
//   engine  the game's own words (names in it are scrubbed above): recorded
//   fixed   a fixed sentence stands in for the line (the label it carries is typed text): recorded as that sentence
//   typed   may hold text a person typed (a title, a name of a map, region, item or object, chat, a note): never recorded
// A type that is not here is not recorded. packages/client/test/feedback.test.js reads the describe functions of app.js, handouts.js
// and scenes.js and fails until every type they draw is listed; docs/specs/feedback.md has the same table.
export const LINE_KINDS = {
  encounterStart: 'engine', encounterEnd: 'engine', turn: 'engine', joined: 'engine', attack: 'engine', damage: 'engine', heal: 'engine', cast: 'engine', act: 'engine',
  recharge: 'engine', save: 'engine', down: 'engine', died: 'engine', deathSave: 'engine', std: 'engine', cond: 'engine', condEnd: 'engine', manual: 'engine',
  effectStart: 'engine', effectEnd: 'engine', concentration: 'engine', stood: 'engine', time: 'engine', rest: 'engine', tempHp: 'engine', spawned: 'engine',
  summoned: 'engine', bonded: 'engine', unbonded: 'engine', companion: 'engine', vanished: 'engine', fell: 'engine', size: 'engine', speed: 'engine',
  revealed: 'engine', concealed: 'engine', hid: 'engine', unhidden: 'engine', light: 'engine', follow: 'engine', formation: 'engine', marchingOrder: 'engine',
  rewound: 'engine', levelReady: 'engine', conclusionSkipped: 'engine', conclusionReady: 'engine', scoresRolled: 'engine', hpRolled: 'engine', hpRerolled: 'engine', scoreRerolled: 'engine', xp: 'engine', conclusionEdited: 'engine',
  companionOrder: 'engine', pocketed: 'engine', recalled: 'engine', reformed: 'engine', delivered: 'engine', reasserted: 'engine', mounted: 'engine', dismounted: 'engine', away: 'engine', back: 'engine', awayTurn: 'engine',
  undone: 'fixed', redone: 'fixed',
  note: 'typed', chronicle: 'typed', claimed: 'typed', released: 'typed', map: 'typed', region: 'typed', check: 'typed', object: 'typed', noticed: 'typed', triggered: 'typed',
  gear: 'typed', item: 'typed', equip: 'typed', shield: 'typed', attuning: 'typed', attuned: 'typed', conclusion: 'typed',
  say: 'typed', privateNote: 'typed', handoutShown: 'typed', handout: 'typed', handoutHidden: 'typed', handoutRemoved: 'typed',
  sceneStart: 'typed', sceneEdit: 'typed', sceneEnd: 'typed', sceneNpc: 'typed', checkAsked: 'typed', commanded: 'typed', commandedTurn: 'typed',
};
const FIXED = { undone: 'Taken back.', redone: 'Done again.' };

// ---- what is remembered: a ring of shown log lines, a ring of sent actions, the page's errors ----
export function createRecorder({ scrub = (t) => t, changed = () => {} } = {}) {
  const log = [], actions = [], errors = [];
  const keep = (list, x, n) => { list.push(x); if (list.length > n) list.splice(0, list.length - n); changed(); };
  return {
    // `line` is the app's [text, class, kind], `type` the event's. Talk and the events above are never kept.
    shown(line, type) {
      const how = Object.hasOwn(LINE_KINDS, type) ? LINE_KINDS[type] : 'typed';
      if (!line || line[2] === 'talk' || how === 'typed' || typeof line[0] !== 'string') return;
      keep(log, how === 'fixed' ? FIXED[type] : clean(scrub(line[0]), LINE_MAX), LOG_LINES);
    },
    sent(action) { const e = { type: WORD.test(action?.type ?? '') ? action.type : 'other', args: actionArgs(action), answer: 'sent' }; keep(actions, e, ACTIONS); return e; },
    answer(entry, text) { entry.answer = clean(scrub(text), 200); changed(); },
    error(message, at) { keep(errors, { message: clean(scrub(message), 200), ...(at ? { at: clean(at, 200) } : {}) }, ERRORS); },
    log: () => [...log], actions: () => actions.map((a) => ({ ...a })), errors: () => errors.map((e) => ({ ...e })),
    pending: () => actions.filter((a) => a.answer === 'sent'),
  };
}

// An action's arguments with only the allowed keys and only short words, numbers, small lists and a position.
export function actionArgs(action) {
  const out = {};
  for (const k of ARG_KEYS) {
    const v = action?.[k];
    if (v === undefined) continue;
    if (isScalar(v)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 8 && v.every(isScalar)) out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ks = Object.keys(v);
      if (ks.length <= 4 && ks.every((x) => /^[a-z]{1,8}$/.test(x) && typeof v[x] === 'number' && Number.isFinite(v[x]))) out[k] = { ...v };
    }
  }
  return out;
}

// ---- the build stamp ----
const OK_COMMIT = /^[0-9a-f]{7,40}$/i;
export const validStamp = (b) => !!b && typeof b === 'object' && (OK_COMMIT.test(b.commit ?? '') || !Number.isNaN(Date.parse(b.when ?? '')));
// A line a person can read aloud, in the viewer's local time: "Build 15 Nov 2026, 11:13 (after change #354, c1d5069)". `tz` is for tests.
export function buildLine(b, tz) {
  if (!validStamp(b)) return '';
  const t = Date.parse(b.when ?? '');
  const when = Number.isNaN(t) ? '' : new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, ...(tz && { timeZone: tz }) }).replace(' at ', ', ');
  const commit = OK_COMMIT.test(b.commit ?? '') ? b.commit.slice(0, 7) : '';
  const change = Number.isInteger(b.pr) && b.pr > 0 && b.pr < 1e7 ? `after change #${b.pr}` : '';
  const tail = [change, commit].filter(Boolean).join(', ');
  return `Build ${when}${when && tail ? ' ' : ''}${tail ? `(${tail})` : ''}`.trim();
}
// The same stamp as one short token for a report: "c1d5069 2026-11-15T11:13:26Z #354".
export const buildId = (b) => (validStamp(b) ? [OK_COMMIT.test(b.commit ?? '') ? b.commit.slice(0, 7) : '', typeof b.when === 'string' && !Number.isNaN(Date.parse(b.when)) ? b.when.slice(0, 20) : '', Number.isInteger(b.pr) && b.pr > 0 && b.pr < 1e7 ? `#${b.pr}` : ''].filter(Boolean).join(' ').slice(0, 40) : '');

// ---- the report ----
// `facts` is plain data the page gathered (see `gather`); `rec` the recorder. Nothing here names the table.
export function buildReport({ comment, kind, include }, facts, rec, now = new Date()) {
  const r = {
    v: 1, kind, comment: String(comment).trim().slice(0, COMMENT_MAX), sentAt: now.toISOString(), build: facts.build, mode: facts.mode, role: facts.role,
    renderer: clean(facts.renderer, 30), theme: clean(facts.theme, 30), grid: facts.grid, viewport: facts.viewport, touch: facts.touch,
    ua: clean(facts.ua, 300), lang: clean(facts.lang, 35),
  };
  if (include) r.context = { log: rec.log(), actions: rec.actions(), fight: facts.fight, character: facts.character, map: clean(facts.map, 60), errors: rec.errors() };
  return fitReport(r);
}
// Over the 24 KB the server takes: the oldest log lines and actions go first, then the errors.
export function fitReport(r) {
  const size = () => new TextEncoder().encode(JSON.stringify(r)).length;
  const c = r.context;
  while (c && size() > REPORT_MAX && (c.log.length || c.actions.length || c.errors.length)) {
    if (c.log.length) c.log.shift(); else if (c.actions.length) c.actions.shift(); else c.errors.shift();
  }
  return r;
}

// What the page knows, as plain data. Reads only what the viewer was shown: their own selected character, the fight as they see it.
export function gather(look, win = globalThis, build = '') {
  const { S, T, selId, themeId, renderer, mine } = look();
  const e = S?.entities?.[selId];
  const enc = S?.encounter;
  const slot = enc?.order?.[enc.turn];
  return {
    build: clean(build || `state-v${VERSION}`, 40), mode: T && !T.solo ? 'table' : 'solo', role: T?.you?.role === 'dm' ? 'dm' : 'player',
    renderer, theme: themeId, grid: S?.map?.grid === 'square' ? 'square' : 'hex',
    viewport: { w: Math.round(win.innerWidth || 0), h: Math.round(win.innerHeight || 0) },
    touch: !!(win.matchMedia?.('(pointer: coarse)').matches || win.navigator?.maxTouchPoints > 0), ua: win.navigator?.userAgent ?? '', lang: win.document?.documentElement?.lang || win.navigator?.language || '',
    fight: enc ? { on: true, round: Number.isInteger(enc.round) ? enc.round : null, turn: !slot ? null : slot.someone ? 'unseen' : mine?.(S.entities[slot.id]) ? 'mine' : 'other' } : { on: false },
    character: e && e.kind === 'pc' ? { cls: clean(e.cls ?? '', 40), level: Number.isInteger(e.level) ? e.level : 0, conditions: Object.keys(e.cond ?? {}).slice(0, 20).map((c) => clean(c, 40)) } : null,
    map: String(S?.map?.id ?? ''),
  };
}

// ---- the page ----
const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 9h10M7 13h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export function initFeedback({ look, onBuild }) {
  const scrubber = createScrubber();
  const learn = () => { try { const { S, T } = look(); scrubber.learn({ S, T }); } catch { /* nothing in view yet */ } };
  let live = () => {};                                   // the panel's refresh, once it exists
  const rec = createRecorder({ scrub: (t) => { learn(); return scrubber.text(t); }, changed: () => live() });
  let stamp = null;                                      // build.json, fetched once; a failure is silent and the report says state-v<N>
  fetch('./build.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (validStamp(b)) { stamp = b; onBuild?.(); } }).catch(() => {});
  addEventListener('error', (ev) => rec.error(ev.message, ev.filename ? `${String(ev.filename).split('/').pop()}:${ev.lineno ?? 0}` : ''));
  addEventListener('unhandledrejection', (ev) => rec.error(`Unhandled: ${ev.reason?.message ?? ev.reason}`, ''));

  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'fb-btn'; btn.setAttribute('aria-label', 'Send feedback'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.title = 'Send feedback';
  btn.innerHTML = ICON;
  const panel = document.createElement('section');
  panel.id = 'fb-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'fb-title');
  panel.innerHTML = `
    <header><h2 id="fb-title">Send feedback</h2><button type="button" id="fb-close" aria-label="Close feedback">&times;</button></header>
    <div id="fb-form">
      <label for="fb-text">What happened, or what would help?</label>
      <textarea id="fb-text" rows="5" maxlength="${COMMENT_MAX}" placeholder="Ctrl+Enter sends. Enter starts a new line."></textarea>
      <div id="fb-count" aria-live="off"></div>
      <div id="fb-kinds" role="radiogroup" aria-label="Kind of feedback">${KINDS.map(([v, w], i) => `<label><input type="radio" name="fb-kind" value="${v}"${i === 0 ? ' checked' : ''}><span>${w}</span></label>`).join('')}</div>
      <label id="fb-inc-label"><input type="checkbox" id="fb-inc" checked> Include what just happened</label>
      <details id="fb-see"><summary>See what will be sent</summary>
        <p>This is everything that goes with your comment, as it will be sent (it updates until you press Send, then it is fixed). It has no names of people or their characters and nothing about which table this is, and nothing you were not shown.</p>
        <p id="fb-dm" class="note" hidden>You are the DM, so the log you are shown can hold things your players have not seen. Untick &ldquo;Include what just happened&rdquo; if this is not for other eyes.</p>
        <pre id="fb-preview" tabindex="0"></pre><p id="fb-build" class="note"></p></details>
      <p id="fb-msg" role="status"></p>
      <div id="fb-actions"><button type="button" id="fb-send">Send</button><button type="button" id="fb-copy" class="quiet">Copy</button></div>
    </div>
    <div id="fb-done" hidden><p id="fb-thanks" role="status"></p><details id="fb-sent"><summary>What was sent</summary><pre id="fb-sent-pre" tabindex="0"></pre></details><div id="fb-actions2"><button type="button" id="fb-again" class="quiet">Write another</button><button type="button" id="fb-done-close">Close</button></div></div>`;
  const top = document.getElementById('top');
  if (top) top.after(btn); else document.body.append(btn);        // right after the header, so the keyboard reaches it early
  document.body.append(panel);
  const $ = (id) => panel.querySelector('#' + id);
  const text = $('fb-text'), inc = $('fb-inc'), msg = $('fb-msg'), pre = $('fb-preview');
  const kind = () => panel.querySelector('input[name="fb-kind"]:checked').value;
  const feedbackUrl = () => document.querySelector('meta[name="hextable-feedback-url"]')?.content?.trim() || './feedback';

  // The draft survives closing the panel (it is only hidden) and a reload (kept on this device until it is sent).
  try { const d = JSON.parse(localStorage.getItem(DRAFT)); if (d && typeof d.text === 'string') { text.value = d.text.slice(0, COMMENT_MAX); const r = panel.querySelector(`input[name="fb-kind"][value="${d.kind}"]`); if (r) r.checked = true; } } catch { /* no draft */ }
  const saveDraft = () => { try { text.value ? localStorage.setItem(DRAFT, JSON.stringify({ text: text.value, kind: kind() })) : localStorage.removeItem(DRAFT); } catch { /* storage unavailable */ } };

  // The preview follows what the page shows until Send is pressed; then the report is frozen: that object is what is shown and what is posted,
  // `sentAt` set once. Editing the comment, kind or tick (or closing the thank-you) lets go of it.
  let frozen = null, canSend = true, busy = false, timer = null;
  const build = () => {
    const f = gather(look, globalThis, buildId(stamp));
    const r = buildReport({ comment: text.value || '(your comment)', kind: kind(), include: inc.checked }, f, rec);
    pre.textContent = JSON.stringify(r, null, 1); $('fb-build').textContent = buildLine(stamp); $('fb-dm').hidden = f.role !== 'dm';
    return r;
  };
  const showFrozen = () => { pre.textContent = JSON.stringify(frozen, null, 1); };
  live = () => { if (timer || panel.hidden || frozen) return; timer = setTimeout(() => { timer = null; if (!panel.hidden && !frozen) build(); }, 120); };      // new lines arrive in bursts
  const count = () => { $('fb-count').textContent = `${text.value.length} / ${COMMENT_MAX}`; };
  const refresh = () => { frozen = null; count(); saveDraft(); if (!panel.hidden) build(); };
  text.addEventListener('input', refresh); inc.addEventListener('change', refresh); $('fb-kinds').addEventListener('change', refresh);
  $('fb-see').addEventListener('toggle', () => { if ($('fb-see').open && !frozen) build(); });

  const say = (m, bad) => { msg.textContent = m; msg.className = bad ? 'bad' : ''; };
  // Is there a table server to send to? Asked when the panel opens: on a page with no server (the solo game on its own) only Copy is offered.
  const probe = async () => {
    const u = document.querySelector('meta[name="hextable-feedback-url"]')?.content?.trim();
    if (navigator.onLine === false) { canSend = false; return say('You are offline, so this cannot be sent now. Copy it to send it another way.'); }
    if (u) { canSend = true; return say(''); }
    try { const r = await fetch('./api/ping', { cache: 'no-store' }); canSend = r.ok && (await r.json()).ok === true; } catch { canSend = false; }
    say(canSend ? '' : 'There is no table server here to send this to. Copy it and send it another way.');
    $('fb-send').disabled = busy || !canSend;
  };

  async function send() {
    if (busy) return;
    if (!text.value.trim()) { say('Write a comment first.', true); text.focus(); return; }
    busy = true; $('fb-send').disabled = true; say('Sending…');
    try {
      const r = (frozen ??= build());                  // what is shown from now on is exactly this object
      showFrozen();
      const body = JSON.stringify(r);
      if (new TextEncoder().encode(body).length > REPORT_MAX) throw Object.assign(new Error('That report is too long.'), { final: true });
      const res = await fetch(feedbackUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', cache: 'no-store' });
      let j = null; try { j = await res.json(); } catch { /* not ours */ }
      if (res.status === 201 && j?.ref) {
        try { localStorage.removeItem(DRAFT); } catch { /* nothing to clear */ }
        $('fb-sent-pre').textContent = JSON.stringify(r, null, 1);
        frozen = null; text.value = ''; count();
        $('fb-thanks').textContent = `Thank you. Your reference is ${j.ref}.`;
        $('fb-form').hidden = true; $('fb-done').hidden = false; $('fb-done-close').focus();
      } else if (res.status === 429) say('Too many reports from here just now. Wait a minute and try again, or copy it.', true);
      else if (j?.error) say(j.error, true);
      else { canSend = false; say('There is no table server here to send this to. Copy it and send it another way.', true); }
    } catch (err) {
      if (err.final) say(err.message, true); else { say('Could not reach the server. Copy it and send it another way.', true); }
    }
    busy = false; $('fb-send').disabled = false;
  }
  $('fb-send').onclick = send;

  // Copy: the clipboard API from this click, else select the text so the player can copy it by hand.
  $('fb-copy').onclick = async () => {
    const r = frozen ?? build(), t = JSON.stringify(r, null, 1);
    try { await navigator.clipboard.writeText(t); return say('Copied. Paste it where you were asked to send feedback.'); } catch { /* fall back */ }
    $('fb-see').open = true;
    const sel = getSelection(), range = document.createRange();
    range.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(range);
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    say(ok ? 'Copied. Paste it where you were asked to send feedback.' : 'The text is selected: press Ctrl+C (or hold and choose Copy).');
  };

  let opener = null;
  const open = () => {
    if (!panel.hidden) return;
    opener = document.activeElement; panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    $('fb-form').hidden = false; $('fb-done').hidden = true; frozen = null; count(); say(''); build(); probe();
    text.focus({ preventScroll: true });
  };
  const close = () => { if (panel.hidden) return; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); (opener && document.contains(opener) && opener !== document.body ? opener : btn).focus?.({ preventScroll: true }); };
  btn.onclick = () => (panel.hidden ? open() : close());
  $('fb-close').onclick = close; $('fb-done-close').onclick = close;
  $('fb-again').onclick = () => { $('fb-form').hidden = false; $('fb-done').hidden = true; say(''); build(); text.focus(); };
  // Keys typed here belong to this panel: the game's shortcuts (m, the arrows) must not act on them.
  panel.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && ev.target === text) { ev.preventDefault(); send(); }
  });
  panel.addEventListener('keyup', (ev) => ev.stopPropagation());

  return {
    // A line the log was handed to draw: [text, class, kind].
    shown: (line, type) => rec.shown(line, type),
    // Watch a transport: each action it is sent, and each answer. A refusal is the engine's own text. An answer arrives in the order the
    // actions were sent; an update after an action with no refusal before it counts as accepted.
    attach(T) {
      const send0 = T.send.bind(T), prevError = T.on.error, prevUpdate = T.on.update;
      T.send = (action) => { rec.sent(action); return send0(action); };
      T.on.error = (m, ...rest) => { const p = rec.pending()[0]; if (p) rec.answer(p, `refused: ${m}`); return prevError?.(m, ...rest); };
      T.on.update = (...a) => { for (const p of rec.pending()) p.answer = 'accepted'; return prevUpdate?.(...a); };
    },
    open, recorder: rec, buildLine: () => buildLine(stamp),
  };
}
