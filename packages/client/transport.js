// How the client reaches a game. Both transports expose the same shape, so the UI
// doesn't know whether the rules engine is running in this tab or on a server.
//   { you, send(action), undo(), redo(), undoInfo: { undo, redo, pins }, rewind(to) (solo; online, the DM sends {t:'rewind'}),
//     on: { update(state, events), error(msg), lobby(info), welcome(you), undoable(info) } }
//   Online only: homebrew packs (docs/specs/homebrew.md, packages/server/README.md "Homebrew packs"): `on.packs(msg)` and `on.packData(msg)` pass the
//   table's messages on as they come (packmanager.js keeps what they carry); `packData(id)` asks for one pack's data; `packOp(msg)` sends a DM's
//   `{t:'pack', ...}` and resolves with the table's `packs` answer or rejects with its error frame ({ error, problems?, blockers? }). While
//   `holdUpdates()` says a pack's data is still on its way, updates wait (in order, at most 4 seconds) so a state never names a spell the page lacks.
//   Online only: `link` (this connection's state: { known, state, label, text, rtt }), `links` (what the table told us of the others':
//   Map userId -> { state, rtt, at }: for the DM every player's, for a player the DM's), `on.link()` and `on.links()` when either changes.
import { apply } from './shared/engine.js';
import { newGame } from './shared/scenario.js';
import { createReceiver } from './shared/patch.js';
import { migrate, VERSION } from './shared/migrate.js';
import { createHistory, describeStep, mark, undoable } from './shared/history.js';
import { capTimeline, TIMELINE_CAP } from './shared/timeline.js';
import { EXPORT_ASSET_BYTES, assetRefs } from './shared/handouts.js';
import { HOMEBREW_LIMITS } from './shared/content/schema.js';
import { PackError } from './shared/content/registry.js';
import { cleanPacks, inUse, packsMatch, vetAdd, vetPacks, vetUpdate } from './shared/content/packs.js';
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

// ---------- solo: the homebrew packs this browser keeps (docs/specs/homebrew.md, "pack vetting moves into the rules package"; DEBT T51) ----------
// The packs are the browser's, kept beside the saved game under `hextable.solo.packs` as a list of `{ id, version, hash, data }`. What storage holds is NEVER
// trusted: it is size-checked before it is parsed, and every record goes through `cleanPacks` (the registry's budget and strict lint, the hash, the
// cross-pack rules) each time it is read; what fails is dropped and the player is told why. This mirrors what the table server does with a table's file.
export const SOLO_PACKS_KEY = 'hextable.solo.packs';
// The most the key may hold, in characters (a character is at least a byte, so more than this is more than the packs may be): four packs at their limit.
export const SOLO_PACKS_MAX = HOMEBREW_LIMITS.packs * (HOMEBREW_LIMITS.packBytes + 1024) + 1024;
const PACK_TEXT_MAX = 2 * HOMEBREW_LIMITS.packBytes;           // a pack sent as text is read up to twice its limit (as the table does); the rules' budget then bounds the pack itself
const PACK_PROBLEMS_SHOWN = 20;
const SHOWN_DROPS = 8;

// What storage holds of the packs: `{ packs: [records that pass], dropped: [{ id, reason, held? }], held: [{ id, record }] }`. Never throws, whatever the key holds.
// A record that is shaped like a stored pack (an id, a version, a hash and the pack) but does not pass is DROPPED (never installed, never parsed beyond what the check does)
// and also HELD: the browser goes on keeping it, untouched, through later writes, until the player removes it or adds the same pack again from a file. What is not even a
// record (nonsense, not a list, a value that is not an object) is dropped with its message and not kept.
export function readSoloPacks(storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(SOLO_PACKS_KEY); } catch { return { packs: [], dropped: [], held: [] }; }       // storage is off: there is nothing to read
  if (raw === null || raw === undefined) return { packs: [], dropped: [], held: [] };
  const lost = (reason) => ({ packs: [], dropped: [{ id: null, reason }], held: [] });
  if (typeof raw !== 'string') return lost('what this browser kept was not text');
  if (raw.length > SOLO_PACKS_MAX) return lost(`what this browser kept is ${Math.round(raw.length / 1024)} KB, more than four packs can be; it was not read`);
  let list;
  try { list = JSON.parse(raw); } catch { return lost('what this browser kept was not readable (it is not JSON)'); }
  const r = cleanPacks(list);
  const shaped = (Array.isArray(list) ? list : []).filter((p) => p && typeof p === 'object' && !Array.isArray(p) && typeof p.id === 'string' && Object.keys(p).sort().join() === 'data,hash,id,version'
    && !r.packs.some((g) => g.id === p.id && g.version === p.version && g.hash === p.hash));
  const held = [], dropped = [];
  for (const d of r.dropped.slice(0, SHOWN_DROPS)) {
    const at = d.id === null ? -1 : shaped.findIndex((p) => p.id.slice(0, 60) === d.id);
    if (at < 0) { dropped.push(d); continue; }
    held.push({ id: d.id, record: shaped.splice(at, 1)[0] });
    dropped.push({ ...d, held: true });
  }
  if (r.dropped.length > SHOWN_DROPS) dropped.push({ id: null, reason: `and ${r.dropped.length - SHOWN_DROPS} more records that were not packs; they are not kept` });
  return { packs: r.packs, dropped, held };
}
// Keeps the packs (and, untouched, the records that could not be loaded: `held`), and says how it went: null when the browser has them, 'room' when together they would
// pass the limit of what the key may hold (nothing is written), 'storage' when the browser would not keep them (a full or switched-off storage throws, and a store that took
// it quietly is read back).
export function writeSoloPacks(records, held = [], storage = globalThis.localStorage) {
  try {
    const text = JSON.stringify([...records.map(({ id, version, hash, data }) => ({ id, version, hash, data })), ...held.map((h) => h.record)]);
    if (text.length > SOLO_PACKS_MAX) return 'room';
    storage.setItem(SOLO_PACKS_KEY, text);
    return storage.getItem(SOLO_PACKS_KEY) === text ? null : 'storage';
  } catch { return 'storage'; }
}
// A saved game's packs against the packs this browser holds: the sentences the player is told when the game was played with packs that are not here
// (or are another version), with a word on what in the game still names a pack that is gone. Pure.
export function soloPackNotes(state, held) {
  const notes = [];
  for (const need of state?.packs ?? []) {
    const have = held.find((p) => p.id === need.id);
    if (!have) {
      let uses = []; try { uses = inUse(state, need.id); } catch { /* nothing to add */ }
      notes.push({ id: need.id, reason: `this game was saved with it (version ${need.version}), but this browser no longer has it, so the game opens without it${uses.length ? `. These still name it and will show as missing until the pack is added again: ${uses.slice(0, 3).join('; ')}` : ''}` });
    } else if (have.version !== need.version || have.hash !== need.hash) notes.push({ id: need.id, reason: `this game was saved with ${have.version !== need.version ? `version ${need.version}` : 'other contents'} of it, but this browser holds ${have.version !== need.version ? `version ${have.version}` : 'a different copy'}, which the game now uses` });
  }
  return notes;
}

// The valley's options for a grid and a party: squares if asked, a party if given (newGame's `party`, scenario.js), otherwise nothing (the hex valley with the four starters, as always).
const valleyOptions = (grid, party) => (grid === 'square' || party ? { ...(grid === 'square' && { grid: 'square' }), ...(party && { party }) } : undefined);

// Solo: the engine runs here and you are the DM and every hero.
// `grid` is the grid a NEW game's valley is on ('square', or anything else for hexes); a saved game keeps its own.
// `party` is the heroes of a NEW game (see `partyProblems` in scenario.js); a saved game keeps its own.
export function localTransport({ timelineCap = TIMELINE_CAP, grid, party } = {}) {
  let state = migrate(store.get('hextable.solo'));       // a saved solo game may predate the current content ids
  if (!state || state.version !== VERSION) state = newGame((Math.random() * 1e9) | 0, valleyOptions(grid, party));
  capTimeline(state.timeline, timelineCap);       // a game saved before the cap, or under a larger one
  // The browser's packs, checked again now (storage is not trusted): `records` are the packs that passed, `dropped` what did not and what the saved game
  // lost, told to the DM (the player) until the next change to the packs. The page's pack store installs them in the content lookups (start() hands them over).
  const got = readSoloPacks();
  let records = got.packs, dropped = got.dropped, held = got.held, loaded;
  const vet = (list) => { try { return vetPacks(list); } catch (err) { return { ok: false, problems: [`the packs could not be checked (${String(err?.message).slice(0, 100)})`] }; } };
  { const v = vet(records);
    if (!v.ok) { dropped = [...dropped, ...records.map((p) => ({ id: p.id, reason: `the packs cannot be used together: ${v.problems.slice(0, 2).join('; ')}`, held: true }))]; held = [...held, ...records.map((p) => ({ id: p.id, record: p }))]; records = []; loaded = []; } else loaded = v.loaded; }
  dropped = [...dropped, ...soloPackNotes(state, records)];
  const names = (list) => list.map(({ id, version, hash }) => ({ id, version, hash }));
  // `state.packs` says what is installed. After a load, a new game, an undo or a rewind (which put whole trees back) it is made to say so again, through the
  // engine as the DM and outside the undo history.
  const resync = () => {
    const want = names(records);
    if (packsMatch(state.packs ?? [], want) === true && JSON.stringify(state.packs) === JSON.stringify(want)) return;
    const r = apply(state, { type: 'setPacks', packs: want }, { role: 'dm', userId: 'local' });
    if (!r.ok) console.error(`solo: could not set the game's packs (${r.error})`);
  };
  resync();
  // The undo history lives in this tab only: a reload starts it afresh. The pins for rewind (the start of
  // the last fight, the last rest) are kept in this browser beside the game, since the history is not;
  // `pinsError` says why there are none if the browser refused the space.
  const history = createHistory();
  const PINS = 'hextable.solo.pins';
  let pinsError = null;
  const saved = store.get(PINS);
  // A saved copy to go back to is let go if it was taken with other packs than this browser holds now: it could bring back what a missing pack made.
  if (saved && Object.values(saved).every((p) => !p || (p.tree?.version === VERSION && packsMatch(p.tree.packs ?? [], names(records)) === true))) history.restore({ v: 2, undos: [], redos: [], pins: saved });
  const keepPins = () => {
    try { localStorage.setItem(PINS, JSON.stringify(history.dump().pins)); pinsError = null; }
    catch { history.clear(); store.del(PINS); pinsError = 'This browser has no room left to keep a copy of the table to go back to.'; }
  };
  const told = () => { t.undoInfo = { undo: history.list(), redo: history.listRedo(), pins: history.pins(), ...(pinsError && { pinsError }) }; t.on.undoable?.(t.undoInfo); };
  const step = (kind, done) => {
    const s = history[kind](state);
    if (!s) return t.on.error(`Nothing to ${kind}.`);
    resync();
    store.set('hextable.solo', state);
    told();
    t.on.update(state, [{ type: done, label: s.label }]);
  };
  const packsMsg = (changed) => ({ t: 'packs', packs: records.map((p) => ({ id: p.id, name: p.data.pack.name, version: p.version, hash: p.hash })), ...(dropped.length && { dropped }), ...(changed && { changed }) });
  const dataMsg = (p) => ({ t: 'packData', id: p.id, version: p.version, hash: p.hash, data: p.data });
  const announce = (msg = packsMsg(), only = null, data = true) => { t.on.packs?.(msg); if (data) for (const p of only ? [only] : records) t.on.packData?.(dataMsg(p)); };
  const t = {
    solo: true, you: { role: 'dm', userId: 'local', name: 'You' }, on: {}, undoInfo: { undo: [], redo: [] }, assets: localAssets(),
    start() { announce(); told(); t.on.update(state, []); },
    // The packs, as the table would say them to the DM, so the page's store builds and installs the overlay (packmanager.js): the list, then each pack's data.
    // Asked for again (the store does when it lacks one), the data comes at once.
    packData(id) { const r = records.find((p) => p.id === id); if (r) queueMicrotask(() => t.on.packData?.(dataMsg(r))); },
    // The DM's pack message, as the table server does it (packages/server/src/tables.js, handlers.pack), in the same order: the size of text, its parse,
    // the rules' checks (vetAdd / vetUpdate), what is in use (a removal), `setPacks` through the engine, and only when that has worked is the pack kept.
    // Resolves to the `packs` message, or rejects with { error, problems?, blockers? }. A refusal changes nothing: not the browser, not the overlay, not the game.
    packOp(msg) {
      return new Promise((resolve, reject) => {
        const refuse = (problems, extra = {}) => { const list = problems.slice(0, PACK_PROBLEMS_SHOWN).map((x) => String(x).slice(0, 300)); return reject({ error: new PackError(list).message, problems: list, ...extra }); };
        try {
          const op = msg?.op;
          if (op !== 'add' && op !== 'update' && op !== 'remove' && op !== 'discard') return reject({ error: 'Say what to do with the pack: add, update or remove.' });
          let id, record = null;
          if (op === 'discard') {                          // the player removes a pack this browser kept but could not load (nothing of it was ever in the game)
            id = msg.id;
            if (typeof id !== 'string' || !held.some((h) => h.id === id)) return reject({ error: 'That pack is not kept in this browser.' });
            const rest = held.filter((h) => h.id !== id), bad = writeSoloPacks(records, rest);
            if (bad) return reject({ error: 'This browser could not keep the change (its storage is full or turned off), so nothing was removed.' });
            held = rest; dropped = dropped.filter((d) => !(d.held && d.id === id));
            const answer = packsMsg({ op: 'remove', id });
            announce(answer, null, false);
            return resolve(answer);
          }
          if (op === 'remove') {
            id = msg.id;
            if (typeof id !== 'string' || !records.some((p) => p.id === id)) return reject({ error: 'That pack is not in this game.' });
            const uses = inUse(state, id);
            if (uses.length) return refuse([`The pack "${id}" is in use and cannot be removed yet: ${uses.join('; ')}.`], { blockers: uses });
          } else {
            let data = msg.pack;
            if (typeof data === 'string') {
              if (data.length > PACK_TEXT_MAX || new TextEncoder().encode(data).length > PACK_TEXT_MAX) return reject({ error: `That pack is too large: a pack may be at most ${HOMEBREW_LIMITS.packBytes} bytes.` });
              try { data = JSON.parse(data); } catch (err) { return refuse([`pack: is not JSON (${err.message})`]); }
            } else if (data === null || typeof data !== 'object') return reject({ error: 'Give the pack as a JSON document.' });
            const v = (op === 'add' ? vetAdd : vetUpdate)(records, data, { loaded });
            if (!v.ok) return v.form === 'summon' ? reject({ error: v.problems[0], problems: v.problems }) : v.form === 'error' ? reject({ error: v.problems[0] }) : refuse(v.problems);
            id = v.pack.id; record = v.record;
          }
          const next = op === 'remove' ? records.filter((p) => p.id !== id) : op === 'update' ? records.map((p) => (p.id === id ? record : p)) : [...records, record];
          // A pack added again from a file replaces the record of the same id this browser kept unloaded; the others stay as they are.
          const keptHeld = op === 'remove' ? held : held.filter((h) => h.id !== id);
          const was = names(records);
          const res = apply(state, { type: 'setPacks', packs: names(next) }, { role: 'dm', userId: 'local' });
          if (!res.ok) return reject({ error: res.error });
          const bad = writeSoloPacks(next, keptHeld), done = op === 'remove' ? 'removed' : op === 'update' ? 'updated' : 'added';
          if (bad) {                                      // the browser would not keep it: the game is put back as it was, and the player is told
            apply(state, { type: 'setPacks', packs: was }, { role: 'dm', userId: 'local' });
            const room = `This browser also keeps ${keptHeld.length} pack${keptHeld.length === 1 ? '' : 's'} it could not load (${keptHeld.map((h) => `“${h.id}”`).join(', ')}), and with them this change would take more room than the packs may. Nothing was ${done}. Remove those packs from the list of packs that could not be loaded first.`;
            return reject({ error: bad === 'room' ? room : `This browser could not keep the packs (its storage is full or turned off), so nothing was ${done}.` });
          }
          records = next; held = keptHeld; dropped = dropped.filter((d) => d.held && held.some((h) => h.id === d.id));
          const v2 = vet(records); loaded = v2.ok ? v2.loaded : undefined;
          // A removed pack's creatures are gone, but an undo step (or a copy kept to go back to) could bring one back: the history is cleared.
          if (op === 'remove') { history.clear(); store.del(PINS); pinsError = null; told(); }
          store.set('hextable.solo', state);
          const answer = packsMsg({ op, id, ...(record && { version: record.version }) });
          announce(answer, record);
          t.on.update?.(state, []);
          resolve(answer);
        } catch { reject({ error: "The game couldn't make sense of that pack message." }); }
      });
    },
    send(action) {
      if (action?.type === 'setPacks') return t.on.error("A game's packs are changed with the pack message.");     // which packs there are is the browser's to say, not an action's
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
      resync();
      store.set('hextable.solo', state);
      told();
      t.on.update(state, [{ type: 'rewound', to, label: s.label }]);
    },
    // The state and the files this tab keeps, as the server's export has them. Nothing leaves this tab.
    export: async () => {
      let files = { assets: [], skipped: [], limit: EXPORT_ASSET_BYTES };
      try { files = await t.assets.pack({ first: assetRefs(state) }); } catch { /* this browser keeps no files: the export has the game only */ }
      return { code: 'solo', exportedAt: new Date().toISOString(), state: structuredClone(state), packs: records.map(({ id, version, hash, data }) => ({ id, version, hash, data })), assets: files.assets, assetsSkipped: files.skipped, assetLimit: files.limit };
    },
    reset({ grid: g = grid, party: p = party } = {}) { state = newGame((Math.random() * 1e9) | 0, valleyOptions(g, p)); resync(); history.clear(); store.del(PINS); pinsError = null; told(); store.set('hextable.solo', state); t.on.update(state, [], true); },
  };
  return t;
}

// Online: a table server owns the state. `first` is {t:'host'|'join'|'resume', ...}.
// `?link=fast` in the address shortens the link thresholds (linkquality.js, LINK_FAST) for tests and smoke passes.
const linkConfig = () => { try { return new URLSearchParams(location.search).get('link') === 'fast' ? LINK_FAST : LINK; } catch { return LINK; } };
// Whether a table's error frame answers a pack message: the table's refusals of one carry the checker's `problems` or the `blockers`, or say so in words
// (the DM-only refusal, the four-pack limit, an unknown operation, the budget of pack messages). Any other error (a refused action, a packData rate limit)
// is not the pack's answer and goes on to the page as it always did.
export const answersPack = (msg) => Array.isArray(msg.problems) || Array.isArray(msg.blockers) || /pack|homebrew|Too many requests|add, update or remove|could.?n.t make sense/i.test(String(msg.error ?? ''));
export function serverTransport(first, { link: cfg = linkConfig() } = {}) {
  const t = { solo: false, you: null, on: {}, lobby: { members: [], pending: [] }, undoInfo: { undo: [], redo: [] } };
  let ws, retry = 0, hello = first;
  // Table files are fetched over HTTP with the session token in a header (never in a URL).
  t.assets = serverAssets(() => (hello?.t === 'resume' ? { code: hello.code, token: hello.token } : null));
  // After the first full state the server sends only what changed. The receiver keeps our copy
  // up to date and asks for everything again if an update ever goes missing.
  const receiver = createReceiver(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'sync' })); });
  let pendingExport = null;            // { resolve, reject, timer } while an export is awaited
  let pendingPack = null;              // { resolve, reject, timer } while the answer to a DM's `pack` message is awaited
  // Updates held while a pack's data is on its way (t.holdUpdates, set by the page), and the packs message the table sends before the first
  // update after a welcome (a table with no packs sends none: the first update then says the list is empty).
  const held = []; let heldTimer = null, packsSeen = true;
  const onUpdate = (msg) => {
    if (!packsSeen) { packsSeen = true; t.on.packs?.({ t: 'packs', packs: [] }); }
    const u = receiver.receive(msg); if (u) t.on.update(u.state, u.events);
  };
  const flush = (force = false) => {
    while (held.length && (force || !t.holdUpdates?.())) onUpdate(held.shift());
    if (!held.length) { clearTimeout(heldTimer); heldTimer = null; }
  };
  t.flushUpdates = () => flush();

  // Connection quality (linkquality.js judges, this measures). Every cfg.pingMs: if the socket is open, a ping whose answer must come within
  // cfg.pongMs (the round trip is timed here, on the client); if it is not open, or the browser says it is offline, a "down" sample.
  // Reconnects of the last cfg.flapMs are counted too. The state is told to the server (at most every cfg.reportMs, and repeated every
  // cfg.heartbeatMs so a silent player can be told from a steady one), which relays it by role: the DM gets every player's.
  let judged = linkStart(), pingN = 0, waitingPong = null, reconnects = [], everOpen = false, lastReport = { at: 0, state: null };
  t.link = { known: false, state: 'good', ...linkExplain(judged, cfg), rtt: null };
  t.links = new Map();
  t.linkCfg = cfg;                     // the thresholds in force (the DM's view of a quiet player uses cfg.staleMs)
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
        packsSeen = false;
        t.on.welcome?.(t.you);
      } else if (msg.t === 'update') {
        if (held.length || t.holdUpdates?.()) { held.push(msg); heldTimer ??= setTimeout(() => { heldTimer = null; flush(true); }, 4000); } else onUpdate(msg);
      }
      else if (msg.t === 'packs') {
        packsSeen = true; t.on.packs?.(msg);
        if (pendingPack && msg.changed) { clearTimeout(pendingPack.timer); const p = pendingPack; pendingPack = null; p.resolve(msg); }
      }
      else if (msg.t === 'packData') t.on.packData?.(msg);
      else if (msg.t === 'export') { pendingExport?.resolve(msg.table); }
      else if (msg.t === 'error' && pendingExport && !msg.expired) pendingExport.reject(new Error(msg.error));
      else if (msg.t === 'pong') gotPong(msg);
      else if (msg.t === 'link') { if (msg.from !== t.you?.userId) { t.links.set(msg.from, { state: msg.state, rtt: msg.rtt ?? null, at: Date.now() }); t.on.links?.(t.links); } }
      else if (msg.t === 'history') t.on.history?.(msg);
      else if (msg.t === 'undoable') { t.undoInfo = { undo: msg.undo, redo: msg.redo, ...(msg.pins && { pins: msg.pins }) }; t.on.undoable?.(t.undoInfo); }
      else if (msg.t === 'lobby') { t.lobby = msg; t.on.lobby?.(msg); }
      else if (msg.t === 'error' && pendingPack && !msg.expired && answersPack(msg)) { clearTimeout(pendingPack.timer); const p = pendingPack; pendingPack = null; p.reject(msg); }
      else if (msg.t === 'error') { if (msg.expired) { store.del('hextable.session'); hello = null; } t.on.error(msg.error, msg.expired); }
    };
    ws.onclose = () => { waitingPong = null; if (pinger) down(); if (hello?.t === 'resume') setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); };
  };
  t.start = open;
  // Drop this connection for good (used when the player starts over with a different table).
  t.close = () => { hello = null; stopLink(); clearTimeout(heldTimer); held.length = 0; clearTimeout(pendingPack?.timer); pendingPack = null; if (ws) { ws.onmessage = null; ws.close(); } };
  t.send = (action) => ws?.readyState === 1 ? ws.send(JSON.stringify({ t: 'act', action })) : t.on.error('Reconnecting to the table…');
  // Leave the table for good and forget it on this device.
  t.leave = () => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'leave' })); store.del('hextable.session'); t.close(); };
  // Ask for past entries from the table's record: { types, since, limit }. The answer arrives on on.history.
  t.history = (query) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'history', ...query })); };
  // A pack's data, once, by its id (the table sends it unasked when a pack is added or updated). The answer arrives on on.packData.
  t.packData = (id) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'packData', id })); };
  // The DM's pack message: { t:'pack', op:'add'|'update', pack } or { t:'pack', op:'remove', id }. One at a time.
  t.packOp = (msg) => new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject({ error: 'Reconnecting to the table…' });
    if (pendingPack) return reject({ error: 'Wait for the table to answer the last pack change.' });
    pendingPack = { resolve, reject, timer: setTimeout(() => { pendingPack = null; reject({ error: 'The table did not answer.' }); }, 20000) };
    ws.send(JSON.stringify({ ...msg, t: 'pack' }));
  });
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
