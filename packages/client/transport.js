// How the client reaches a game. Both transports expose the same shape, so the UI
// doesn't know whether the rules engine is running in this tab or on a server.
//   { you, send(action), undo(), redo(), undoInfo: { undo, redo },
//     on: { update(state, events), error(msg), lobby(info), welcome(you), undoable(info) } }
import { apply } from './shared/engine.js';
import { newGame } from './shared/scenario.js';
import { createReceiver } from './shared/patch.js';
import { migrate, VERSION } from './shared/migrate.js';
import { createHistory, describeStep, mark, undoable } from './shared/history.js';
import { capTimeline, TIMELINE_CAP } from './shared/timeline.js';
import { EXPORT_ASSET_BYTES, assetRefs } from './shared/handouts.js';
import { localAssets, serverAssets } from './assets.js';

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
  // The undo history lives in this tab only: a reload starts it afresh.
  const history = createHistory();
  const told = () => { t.undoInfo = { undo: history.list(), redo: history.listRedo() }; t.on.undoable?.(t.undoInfo); };
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
      if (before) { history.record(before, state, describeStep(action, res.events, before, state), capTimeline(state.timeline, timelineCap)); told(); }
      store.set('hextable.solo', state);
      t.on.update(state, res.events);
    },
    undo: () => step('undo', 'undone'),
    redo: () => step('redo', 'redone'),
    // The state and the files this tab keeps, as the server's export has them. Nothing leaves this tab.
    export: async () => {
      let files = { assets: [], skipped: [], limit: EXPORT_ASSET_BYTES };
      try { files = await t.assets.pack({ first: assetRefs(state) }); } catch { /* this browser keeps no files: the export has the game only */ }
      return { code: 'solo', exportedAt: new Date().toISOString(), state: structuredClone(state), assets: files.assets, assetsSkipped: files.skipped, assetLimit: files.limit };
    },
    reset() { state = newGame((Math.random() * 1e9) | 0); history.clear(); told(); store.set('hextable.solo', state); t.on.update(state, [], true); },
  };
  return t;
}

// Online: a table server owns the state. `first` is {t:'host'|'join'|'resume', ...}.
export function serverTransport(first) {
  const t = { solo: false, you: null, on: {}, lobby: { members: [], pending: [] }, undoInfo: { undo: [], redo: [] } };
  let ws, retry = 0, hello = first;
  // Table files are fetched over HTTP with the session token in a header (never in a URL).
  t.assets = serverAssets(() => (hello?.t === 'resume' ? { code: hello.code, token: hello.token } : null));
  // After the first full state the server sends only what changed. The receiver keeps our copy
  // up to date and asks for everything again if an update ever goes missing.
  const receiver = createReceiver(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'sync' })); });
  let pendingExport = null;            // { resolve, reject, timer } while an export is awaited
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; ws.send(JSON.stringify(hello)); };
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
      else if (msg.t === 'history') t.on.history?.(msg);
      else if (msg.t === 'undoable') { t.undoInfo = { undo: msg.undo, redo: msg.redo }; t.on.undoable?.(t.undoInfo); }
      else if (msg.t === 'lobby') { t.lobby = msg; t.on.lobby?.(msg); }
      else if (msg.t === 'error') { if (msg.expired) { store.del('hextable.session'); hello = null; } t.on.error(msg.error, msg.expired); }
    };
    ws.onclose = () => { if (hello?.t === 'resume') setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); };
  };
  t.start = open;
  // Drop this connection for good (used when the player starts over with a different table).
  t.close = () => { hello = null; if (ws) { ws.onmessage = null; ws.close(); } };
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
  t.approve = (userId, ok) => ws.send(JSON.stringify({ t: 'approve', userId, ok }));
  return t;
}
export const savedSession = () => store.get('hextable.session');
export const prefs = store;
