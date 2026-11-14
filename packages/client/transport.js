// How the client reaches a game. Both transports expose the same shape, so the UI
// doesn't know whether the rules engine is running in this tab or on a server.
//   { you, send(action), undo(), redo(), undoInfo: { undo, redo, pins }, rewind(to) (solo; online, the DM sends {t:'rewind'}),
//     on: { update(state, events), error(msg), lobby(info), welcome(you), undoable(info) } }
//   Online only: `link` (this connection's state: { known, state, label, text, rtt }), `links` (what the table told us of the others':
//   Map userId -> { state, rtt, at }: for the DM every player's, for a player the DM's), `on.link()` and `on.links()` when either changes.
import { apply } from './shared/engine.js';
import { newGame } from './shared/scenario.js';
import { createReceiver } from './shared/patch.js';
import { migrate, VERSION } from './shared/migrate.js';
import { createHistory, describeStep, mark, undoable } from './shared/history.js';
import { capTimeline, TIMELINE_CAP } from './shared/timeline.js';
import { EXPORT_ASSET_BYTES, assetRefs } from './shared/handouts.js';
import { localAssets, serverAssets } from './assets.js';
import { LINK, LINK_FAST, start as linkStart, step as linkStep, explain as linkExplain, average as linkAverage } from './linkquality.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

// What an export looks like, and how it reaches the DM's disk: a JSON file named hextable-<code>-<date>.json.
export function downloadTable(table) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(table, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `hextable-${table.code}-${table.exportedAt.slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Solo: the engine runs here and you are the DM and every hero.
export function localTransport({ timelineCap = TIMELINE_CAP } = {}) {
  let state = migrate(store.get('hextable.solo'));       // a saved solo game may predate the current content ids
  if (!state || state.version !== VERSION) state = newGame((Math.random() * 1e9) | 0);
  capTimeline(state.timeline, timelineCap);       // a game saved before the cap, or under a larger one
  // The undo history lives in this tab only: a reload starts it afresh. The pins for rewind (the start of
  // the last fight, the last rest) are kept in this browser beside the game, since the history is not;
  // `pinsError` says why there are none if the browser refused the space.
  const history = createHistory();
  const PINS = 'hextable.solo.pins';
  let pinsError = null;
  const saved = store.get(PINS);
  if (saved && Object.values(saved).every((p) => !p || p.tree?.version === VERSION)) history.restore({ v: 2, undos: [], redos: [], pins: saved });
  const keepPins = () => {
    try { localStorage.setItem(PINS, JSON.stringify(history.dump().pins)); pinsError = null; }
    catch { history.clear(); store.del(PINS); pinsError = 'This browser has no room left to keep a copy of the table to go back to.'; }
  };
  const told = () => { t.undoInfo = { undo: history.list(), redo: history.listRedo(), pins: history.pins(), ...(pinsError && { pinsError }) }; t.on.undoable?.(t.undoInfo); };
  const step = (kind, done) => {
    const s = history[kind](state);
    if (!s) return t.on.error(`Nothing to ${kind}.`);
    store.set('hextable.solo', state);
    told();
    t.on.update(state, [{ type: done, label: s.label }]);
  };
  const t = {
    solo: true, you: { role: 'dm', userId: 'local', name: 'You' }, on: {}, undoInfo: { undo: [], redo: [] }, assets: localAssets(),
    start() { told(); t.on.update(state, []); },
    send(action) {
      const before = undoable(action) ? mark(state) : null;
      const res = apply(state, action, { role: 'dm', userId: 'local' });
      if (!res.ok) return t.on.error(res.error);
      if (before) {
        history.record(before, state, describeStep(action, res.events, before, state), capTimeline(state.timeline, timelineCap));
        if (history.track(action, res.events, before, state)) keepPins();
        told();
      }
      store.set('hextable.solo', state);
      t.on.update(state, res.events);
    },
    undo: () => step('undo', 'undone'),
    redo: () => step('redo', 'redone'),
    // Go back to the start of the last fight or to the last rest, with new dice; undo takes it back.
    rewind(to) {
      const s = to === 'fight' || to === 'rest' ? history.rewind(state, to) : null;
      if (!s) return t.on.error(to === 'rest' ? 'No rest to go back to.' : 'No fight to go back to.');
      store.set('hextable.solo', state);
      told();
      t.on.update(state, [{ type: 'rewound', to, label: s.label }]);
    },
    // The state and the files this tab keeps, as the server's export has them. Nothing leaves this tab.
    export: async () => {
      let files = { assets: [], skipped: [], limit: EXPORT_ASSET_BYTES };
      try { files = await t.assets.pack({ first: assetRefs(state) }); } catch { /* this browser keeps no files: the export has the game only */ }
      return { code: 'solo', exportedAt: new Date().toISOString(), state: structuredClone(state), assets: files.assets, assetsSkipped: files.skipped, assetLimit: files.limit };
    },
    reset() { state = newGame((Math.random() * 1e9) | 0); history.clear(); store.del(PINS); pinsError = null; told(); store.set('hextable.solo', state); t.on.update(state, [], true); },
  };
  return t;
}

// Online: a table server owns the state. `first` is {t:'host'|'join'|'resume', ...}.
// `?link=fast` in the address shortens the link thresholds (linkquality.js, LINK_FAST) for tests and smoke passes.
const linkConfig = () => { try { return new URLSearchParams(location.search).get('link') === 'fast' ? LINK_FAST : LINK; } catch { return LINK; } };
export function serverTransport(first, { link: cfg = linkConfig() } = {}) {
  const t = { solo: false, you: null, on: {}, lobby: { members: [], pending: [] }, undoInfo: { undo: [], redo: [] } };
  let ws, retry = 0, hello = first;
  // Table files are fetched over HTTP with the session token in a header (never in a URL).
  t.assets = serverAssets(() => (hello?.t === 'resume' ? { code: hello.code, token: hello.token } : null));
  // After the first full state the server sends only what changed. The receiver keeps our copy
  // up to date and asks for everything again if an update ever goes missing.
  const receiver = createReceiver(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'sync' })); });
  let pendingExport = null;            // { resolve, reject, timer } while an export is awaited

  // Connection quality (linkquality.js judges, this measures). Every cfg.pingMs: if the socket is open, a ping whose answer must come within
  // cfg.pongMs (the round trip is timed here, on the client); if it is not open, or the browser says it is offline, a "down" sample.
  // Reconnects of the last cfg.flapMs are counted too. The state is told to the server (at most every cfg.reportMs, and repeated every
  // cfg.heartbeatMs so a silent player can be told from a steady one), which relays it by role: the DM gets every player's.
  let judged = linkStart(), pingN = 0, waitingPong = null, reconnects = [], everOpen = false, lastReport = { at: 0, state: null };
  t.link = { known: false, state: 'good', ...linkExplain(judged, cfg), rtt: null };
  t.links = new Map();
  const sample = (s) => {
    const now = Date.now();
    reconnects = reconnects.filter((x) => now - x < cfg.flapMs);
    judged = linkStep(judged, { t: now, flaps: reconnects.length, ...s }, cfg);
    t.link = { known: true, state: judged.state, ...linkExplain(judged, cfg), rtt: linkAverage(judged) };
    t.on.link?.(t.link);
  };
  const report = () => {
    const now = Date.now();
    if (ws?.readyState !== 1 || !t.you?.approved) return;
    if (now - lastReport.at < cfg.reportMs || (judged.state === lastReport.state && now - lastReport.at < cfg.heartbeatMs)) return;
    lastReport = { at: now, state: judged.state };
    ws.send(JSON.stringify({ t: 'link', state: judged.state, ...(t.link.rtt !== null && { rtt: Math.round(t.link.rtt) }) }));
  };
  const down = () => sample({ kind: 'down', offline: navigator.onLine === false, attempt: Math.max(1, retry) });
  const tick = () => {
    if (ws?.readyState !== 1 || navigator.onLine === false) { waitingPong = null; down(); return; }
    if (waitingPong) return;                                   // the last ping is still out; its timer decides
    const n = ++pingN, sent = performance.now();
    const timer = setTimeout(() => { if (waitingPong?.n === n) { waitingPong = null; sample({ kind: 'miss' }); report(); } }, cfg.pongMs);
    waitingPong = { n, sent, timer };
    ws.send(JSON.stringify({ t: 'ping', n }));
  };
  const gotPong = (msg) => {
    if (waitingPong?.n !== msg.n) return;                      // late (already counted as missed) or not ours
    clearTimeout(waitingPong.timer);
    const rtt = performance.now() - waitingPong.sent;
    waitingPong = null;
    sample({ kind: 'ok', rtt }); report();
  };
  let pinger = null;
  const goOffline = () => down(), goOnline = () => tick();
  const startLink = () => {
    if (pinger) return;
    pinger = setInterval(() => { tick(); report(); }, cfg.pingMs);
    window.addEventListener('offline', goOffline); window.addEventListener('online', goOnline);
  };
  const stopLink = () => { clearInterval(pinger); pinger = null; clearTimeout(waitingPong?.timer); waitingPong = null; window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  // For tests: shut the socket as a dropped network would (the usual reconnect follows).
  t.dropSocket = () => ws?.close();

  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; if (everOpen) reconnects.push(Date.now()); everOpen = true; waitingPong = null; startLink(); ws.send(JSON.stringify(hello)); };
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.t === 'welcome') {
        t.you = { role: msg.role, userId: msg.userId, name: msg.name, code: msg.code, approved: msg.approved };
        hello = { t: 'resume', code: msg.code, token: msg.token };
        store.set('hextable.session', { code: msg.code, token: msg.token });
        t.on.welcome?.(t.you);
      } else if (msg.t === 'update') { const u = receiver.receive(msg); if (u) t.on.update(u.state, u.events); }
      else if (msg.t === 'export') { pendingExport?.resolve(msg.table); }
      else if (msg.t === 'error' && pendingExport && !msg.expired) pendingExport.reject(new Error(msg.error));
      else if (msg.t === 'pong') gotPong(msg);
      else if (msg.t === 'link') { if (msg.from !== t.you?.userId) { t.links.set(msg.from, { state: msg.state, rtt: msg.rtt ?? null, at: Date.now() }); t.on.links?.(t.links); } }
      else if (msg.t === 'history') t.on.history?.(msg);
      else if (msg.t === 'undoable') { t.undoInfo = { undo: msg.undo, redo: msg.redo, ...(msg.pins && { pins: msg.pins }) }; t.on.undoable?.(t.undoInfo); }
      else if (msg.t === 'lobby') { t.lobby = msg; t.on.lobby?.(msg); }
      else if (msg.t === 'error') { if (msg.expired) { store.del('hextable.session'); hello = null; } t.on.error(msg.error, msg.expired); }
    };
    ws.onclose = () => { waitingPong = null; if (pinger) down(); if (hello?.t === 'resume') setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); };
  };
  t.start = open;
  // Drop this connection for good (used when the player starts over with a different table).
  t.close = () => { hello = null; stopLink(); if (ws) { ws.onmessage = null; ws.close(); } };
  t.send = (action) => ws?.readyState === 1 ? ws.send(JSON.stringify({ t: 'act', action })) : t.on.error('Reconnecting to the table…');
  // Leave the table for good and forget it on this device.
  t.leave = () => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'leave' })); store.del('hextable.session'); t.close(); };
  // Ask for past entries from the table's record: { types, since, limit }. The answer arrives on on.history.
  t.history = (query) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'history', ...query })); };
  // The DM asks for the whole table to keep as a file. Resolves to { code, exportedAt, state }.
  t.export = () => new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject(new Error('Reconnecting to the table…'));
    const done = (fn) => (v) => { clearTimeout(pendingExport.timer); pendingExport = null; fn(v); };
    pendingExport = { resolve, reject, timer: setTimeout(() => pendingExport?.reject(new Error('The table did not answer.')), 30000) };
    pendingExport.resolve = done(resolve); pendingExport.reject = done(reject);
    ws.send(JSON.stringify({ t: 'export' }));
  });
  // The DM takes back the last action, or does it again. The server answers with a fresh update.
  t.undo = () => (ws?.readyState === 1 ? ws.send(JSON.stringify({ t: 'undo' })) : t.on.error('Reconnecting to the table…'));
  t.redo = () => (ws?.readyState === 1 ? ws.send(JSON.stringify({ t: 'redo' })) : t.on.error('Reconnecting to the table…'));
  // The DM takes the table back to the start of the last fight (to: 'fight') or to the last rest (to: 'rest'). The server answers
  // with a whole update, or with its own refusal ("No fight to go back to.") on on.error.
  t.rewind = (to) => (ws?.readyState === 1 ? ws.send(JSON.stringify({ t: 'rewind', to })) : t.on.error('Reconnecting to the table…'));
  t.approve = (userId, ok) => ws.send(JSON.stringify({ t: 'approve', userId, ok }));
  return t;
}
export const savedSession = () => store.get('hextable.session');
// Does this device hold a solo game, or a table it remembers? (The lobby offers Continue / Rejoin from these.)
export const hasSoloGame = () => !!store.get('hextable.solo');
export const forgetSession = () => store.del('hextable.session');
export const forgetSolo = () => { store.del('hextable.solo'); store.del('hextable.solo.pins'); };
export const prefs = store;
