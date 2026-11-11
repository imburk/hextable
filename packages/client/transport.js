// How the client reaches a game. Both transports expose the same shape, so the UI
// doesn't know whether the rules engine is running in this tab or on a server.
//   { you, send(action), on: { update(state, events), error(msg), lobby(info), welcome(you) } }
import { apply } from './shared/engine.js';
import { newGame } from './shared/scenario.js';
import { createReceiver } from './shared/patch.js';
import { migrate } from './shared/migrate.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

// Solo: the engine runs here and you are the DM and every hero.
export function localTransport() {
  let state = migrate(store.get('hextable.solo'));       // a saved solo game may predate the current content ids
  if (!state || state.version !== 1) state = newGame((Math.random() * 1e9) | 0);
  const t = {
    solo: true, you: { role: 'dm', userId: 'local', name: 'You' }, on: {},
    start() { t.on.update(state, []); },
    send(action) {
      const res = apply(state, action, { role: 'dm', userId: 'local' });
      if (!res.ok) return t.on.error(res.error);
      store.set('hextable.solo', state);
      t.on.update(state, res.events);
    },
    reset() { state = newGame((Math.random() * 1e9) | 0); store.set('hextable.solo', state); t.on.update(state, [], true); },
  };
  return t;
}

// Online: a table server owns the state. `first` is {t:'host'|'join'|'resume', ...}.
export function serverTransport(first) {
  const t = { solo: false, you: null, on: {}, lobby: { members: [], pending: [] } };
  let ws, retry = 0, hello = first;
  // After the first full state the server sends only what changed. The receiver keeps our copy
  // up to date and asks for everything again if an update ever goes missing.
  const receiver = createReceiver(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'sync' })); });
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
      else if (msg.t === 'history') t.on.history?.(msg);
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
  t.approve = (userId, ok) => ws.send(JSON.stringify({ t: 'approve', userId, ok }));
  return t;
}
export const savedSession = () => store.get('hextable.session');
export const prefs = store;
