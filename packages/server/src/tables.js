// Tables: who is sitting at which game, and what each of them is told.
//
// No network code here. A connection is anything with send(object); the HTTP
// and WebSocket layer in index.js supplies real ones and the tests supply fakes.
//
//   const tables = createTables({ load, save });
//   const session = tables.connect(conn);     // one per connection
//   session.receive(message);                 // a parsed client message
//   session.disconnect();
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { apply, recall } from "../../rules/src/engine.js";
import { diff, snapshot } from "../../rules/src/patch.js";
import { createHistory, describeStep, mark, undoable } from "../../rules/src/history.js";
import { capTimeline, TIMELINE_CAP } from "../../rules/src/timeline.js";
import { migrate } from "../../rules/src/migrate.js";
import { keyedRng } from "../../rules/src/rng.js";
import { newGame } from "../../rules/src/scenario.js";
import { playerView, view, viewEvents, viewHandouts, viewPrompt, viewReactions } from "../../rules/src/view.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O or 1/I/L
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const makeId = () => randomBytes(9).toString("base64url");
const makeToken = () => randomBytes(24).toString("base64url");
const cleanName = (name) => String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || "Adventurer";

export const MAX_TABLES = 500;
export const MAX_MEMBERS = 12;
// A table nobody has touched for this long no longer counts against MAX_TABLES. It is kept, not
// deleted: the next person to resume it makes it count again.
export const IDLE_MS = 30 * 24 * 3600 * 1000;
const SAVE_STALE_MS = 3600 * 1000;      // sitting down only rewrites the file when its stamp is this old
// The most an action may weigh as JSON. Everyone is held to the small cap, except that the DM
// may send a whole map document with loadMap or mapEdit, which run to hundreds of kilobytes.
export const MAX_ACTION_BYTES = 4 * 1024;
export const MAX_MAP_ACTION_BYTES = 1024 * 1024;
// Lines of a scene's transcript (`say`) one member may send in a minute. The engine caps a line's
// length and a scene's number of lines; this keeps one member from filling the record for everyone.
export const MAX_SAYS_PER_MINUTE = 30;
const MAP_ACTIONS = new Set(["loadMap", "mapEdit"]);

export function createTables({ load = () => [], save = () => {}, loadHistory = () => null, timelineCap = TIMELINE_CAP, seed, key, now = Date.now, idleMs = IDLE_MS, exportAssets = () => ({ assets: [], skipped: [], limit: 0 }) } = {}) {
  // A server makes its own seeds and dice keys. Tests that give a seed get the dice that seed
  // rolls (an integer rng, as before version 16) unless they also give a key.
  key ??= seed ? () => null : () => randomBytes(32).toString("hex");
  seed ??= () => randomInt(1e9);
  // code -> { code, state, members: [{ id, token, name, role, approved }] }
  const tables = new Map();
  // Dice from a key the server made (docs/specs/hidden-information.md, section 7). `key` returning
  // null keeps the game's integer seed.
  const rekey = (state) => {
    if (!state || !Number.isInteger(state.rng)) return false;
    const k = key();
    if (k === null) return false;
    state.rng = keyedRng(k);
    return true;
  };
  // t.active is when anyone last sat down, acted or left. Tables saved before it existed start fresh.
  const touch = (t) => { t.active = now(); };
  const isActive = (t) => now() - (t.active ?? 0) < idleMs;
  const activeCount = () => { let n = 0; for (const t of tables.values()) if (isActive(t)) n++; return n; };
  // The DM's undo history, per table (see below). It is kept in a file beside the table's own.
  const undos = new WeakMap();
  const undoOf = (t) => { if (!undos.has(t)) undos.set(t, createHistory()); return undos.get(t); };
  // Which table state each saved history belongs to: the table's `seq`, which moves with every change
  // to the game. A history saved for another state (the server stopped between the two files, or the
  // state was migrated to a newer version) is not used, because its patches would not fit.
  const kept = new Map();       // code -> the seq of the last history handed out by exportHistory
  const dirtyHistory = new Set();
  for (const t of load()) {
    const was = t.state?.version;
    migrate(t.state); t.active ??= now(); tables.set(t.code, t);     // saved tables may predate the current content ids
    // A table whose dice still come from a 32-bit seed is given a key, once, now: from here on
    // nobody can work its rolls out from the ones they see (rules rng.js). Its undo history is
    // dropped, so that no undo steps back to the old seed.
    const rekeyed = rekey(t.state);
    // A table saved before the cap, or under a larger one, is cut down now. That moves entries the
    // saved history points at, so the history is not used.
    const cut = capTimeline(t.state?.timeline, timelineCap).length > 0;
    try {
      const data = cut ? null : loadHistory(t.code);
      if (data && !rekeyed && data.seq === (t.seq ?? 0) && t.state?.version === was && undoOf(t).restore(data)) kept.set(t.code, data.seq);
      else undoOf(t).clear();
    } catch { undoOf(t).clear(); }         // a damaged history file costs the undo history and nothing else
  }
  // member id -> Set of live connections (the same person may have two tabs open)
  const online = new Map();

  const conns = (m) => online.get(m.id) ?? new Set();
  const tell = (m, msg) => { for (const c of conns(m)) c.send(msg); };
  // Nobody is ever sent the game state itself, only their view of it: the DM's view is
  // everything, a player's has no dice seed and only what their characters could know.
  // The timeline is the table's record (capped, see timeline.js) and grows, so it is never part of
  // an update, even the DM's. It is read through the history message instead.
  // The party sees as one, so the players' view is built once per change of the table (its `seq`) and
  // shared; each player's copy differs only in the handouts shown to them and the standing
  // instructions of their own creatures' reactions. The costly part inside it,
  // what the party can see, is itself kept until something it depends on moves (rules vision.js).
  const shared = new WeakMap();
  const forPlayers = (t) => {
    const had = shared.get(t);
    if (had && had.seq === (t.seq ?? 0) && had.state === t.state) return had;
    const base = playerView(t.state), out = { seq: t.seq ?? 0, state: t.state, base, snap: snapshot(base) };
    shared.set(t, out);
    return out;
  };
  const stateFor = (t, m) => (m.role === "dm" ? { ...view(t.state, { role: m.role, userId: m.id }), timeline: undefined }
    : { ...forPlayers(t).base, handouts: viewHandouts(t.state, { role: m.role, userId: m.id }), reactions: viewReactions(t.state, { role: m.role, userId: m.id }),
      prompt: viewPrompt(t.state, { role: m.role, userId: m.id }) });
  // What was sent, for the next difference: a player's is the shared one with their handouts, their
  // own creatures' standing instructions for reactions, and a reaction they are asked about (or
  // only that the table is waiting).
  const snapFor = (t, m, state) => {
    if (m.role === "dm") return snapshot(state);
    const { snap } = forPlayers(t);
    return { ...snap, top: { ...snap.top, handouts: JSON.stringify(state.handouts), reactions: JSON.stringify(state.reactions), prompt: JSON.stringify(state.prompt) } };
  };
  const eventsFor = (t, m, events) => viewEvents(events, t.state, { role: m.role, userId: m.id });

  // The DM's undo history is not part of the game state and is never sent to a player or put in an
  // export. It is saved beside the table (see exportHistory) so that it survives a restart.
  // What the DM's Undo and Redo buttons would do, newest first.
  const undoInfo = (t) => ({ t: "undoable", undo: undoOf(t).list(), redo: undoOf(t).listRedo() });
  const tellUndo = (t) => { for (const m of t.members) if (m.role === "dm" && m.approved) tell(m, undoInfo(t)); };

  // Put a state back as mark() found it: every key in its place, the timeline cut back to its length then.
  const putBack = (state, m) => {
    const tl = state.timeline;
    for (const k of Object.keys(state)) delete state[k];
    for (const [k, v] of Object.entries(m.tree)) state[k] = k === "timeline" ? tl : v;
    if (Array.isArray(tl)) tl.length = m.tl;
  };
  // When each member last spoke in a scene, for MAX_SAYS_PER_MINUTE.
  const saidAt = new WeakMap();
  // What each connection was last sent, so the next update can be only what changed.
  const sent = new WeakMap();
  // The whole view, to one connection: on sitting down, on being let in, and on request.
  // Updates are numbered per connection, not by the table's `seq`: a connection that is sent
  // nothing for a change (nothing it may know of moved) must not see a gap in the numbers either,
  // or the gap would tell it something happened (security review #132, M3).
  const wire = new WeakMap();
  const nextSeq = (c) => { const n = (wire.get(c) ?? 0) + 1; wire.set(c, n); return n; };
  const quiet = (seen, patch) => !seen.length && !Object.keys(patch).length;
  function sendFull(t, m, c) {
    const state = stateFor(t, m);
    sent.set(c, snapFor(t, m, state));
    c.send({ t: "update", seq: nextSeq(c), state, events: [] });
  }
  // Something happened: count it, and send every approved connection its own difference. A
  // connection for which nothing it may know of changed, no event and no difference, is sent nothing.
  function broadcast(t, events) {
    t.seq = (t.seq ?? 0) + 1;
    for (const m of t.members) {
      if (!m.approved || !conns(m).size) continue;
      const state = stateFor(t, m), next = snapFor(t, m, state), seen = eventsFor(t, m, events);
      for (const c of conns(m)) {
        const prev = sent.get(c);
        sent.set(c, next);
        if (!prev) { c.send({ t: "update", seq: nextSeq(c), state, events: seen }); continue; }
        const patch = diff(prev, next, state);
        if (!quiet(seen, patch)) c.send({ t: "update", seq: nextSeq(c), events: seen, patch });
      }
    }
  }
  // The game was put back (undo) or forward (redo): everyone gets their whole view again, built
  // the usual way, so nothing a view would leave out can reach a player through a patch. `told`
  // is { dm, players }: the event each is given, or null for none.
  function resend(t, told) {
    t.seq = (t.seq ?? 0) + 1;
    for (const m of t.members) {
      if (!m.approved || !conns(m).size) continue;
      const state = stateFor(t, m), ev = m.role === "dm" ? told.dm : told.players, next = snapFor(t, m, state);
      for (const c of conns(m)) {
        const prev = sent.get(c);
        sent.set(c, next);
        // Undoing what a player never saw changes nothing of theirs: they are sent nothing.
        if (prev && !ev && quiet([], diff(prev, next, state))) continue;
        c.send({ t: "update", seq: nextSeq(c), state, events: ev ? [ev] : [] });
      }
    }
  }
  // Past entries this member may see, oldest first, at most `limit` (never more than 200).
  const history = (t, m, { types, since, limit } = {}) => {
    const max = Math.max(1, Math.min(200, Number.isInteger(limit) ? limit : 50));
    const wanted = Array.isArray(types) ? types.filter((x) => typeof x === "string").slice(0, 20) : undefined;
    const from = typeof since === "number" && Number.isFinite(since) ? since : undefined;
    const all = recall(t.state, { types: wanted?.length ? wanted : undefined, since: from, limit: Infinity });
    return viewEvents(all, t.state, { role: m.role, userId: m.id }).slice(-max);
  };
  const welcome = (t, m) => ({ t: "welcome", role: m.role, userId: m.id, name: m.name, code: t.code, token: m.token, approved: m.approved });

  function lobby(t) {
    const members = t.members.filter((m) => m.approved).map((m) => ({ id: m.id, name: m.name, role: m.role, online: conns(m).size > 0 }));
    const pending = t.members.filter((m) => !m.approved).map((m) => ({ id: m.id, name: m.name }));
    for (const m of t.members) {
      if (m.approved) tell(m, { t: "lobby", members, pending: m.role === "dm" ? pending : [] });
    }
  }

  function connect(conn) {
    let table = null, me = null;
    const error = (text, expired = false) => conn.send({ t: "error", error: text, ...(expired && { expired: true }) });

    function sit(t, m) {
      table = t; me = m;
      const stale = now() - (t.active ?? 0) > SAVE_STALE_MS;
      touch(t);
      if (stale) save(t);
      if (!online.has(m.id)) online.set(m.id, new Set());
      online.get(m.id).add(conn);
      conn.send(welcome(t, m));
      if (m.approved) {
        sendFull(t, m, conn);
        conn.send({ t: "history", entries: history(t, m, { limit: 50 }), recent: true });   // so the log isn't empty
        if (m.role === "dm") conn.send(undoInfo(t));
      }
      lobby(t);
    }

    const handlers = {
      host(msg) {
        if (activeCount() >= MAX_TABLES) return error("This server is full. Try again later.", true);
        let code = makeCode();
        while (tables.has(code)) code = makeCode();
        const t = { code, state: newGame(seed()), members: [], active: now() };
        rekey(t.state);
        const m = { id: makeId(), token: makeToken(), name: cleanName(msg.name), role: "dm", approved: true };
        t.members.push(m);
        tables.set(code, t);
        save(t);
        sit(t, m);
      },
      join(msg) {
        const t = tables.get(String(msg.code ?? "").trim().toUpperCase());
        if (!t) return error("No table has that code. Check it with your DM.", true);
        if (t.members.length >= MAX_MEMBERS) return error("That table is full.", true);
        const m = { id: makeId(), token: makeToken(), name: cleanName(msg.name), role: "player", approved: false };
        t.members.push(m);
        save(t);
        sit(t, m);
      },
      resume(msg) {
        const t = tables.get(String(msg.code ?? ""));
        const m = t?.members.find((x) => x.token === msg.token);
        if (!m) return error("That table is no longer available. Host or join again.", true);
        sit(t, m);
      },
      approve(msg) {
        if (me.role !== "dm") return error("Only the DM can let players in.");
        const m = table.members.find((x) => x.id === msg.userId && !x.approved);
        if (!m) return;
        if (msg.ok) {
          m.approved = true;
          tell(m, welcome(table, m));
          for (const c of conns(m)) sendFull(table, m, c);
          tell(m, { t: "history", entries: history(table, m, { limit: 50 }), recent: true });
        } else {
          table.members = table.members.filter((x) => x !== m);
          tell(m, { t: "error", error: "The DM declined your request to join.", expired: true });
          online.delete(m.id);
        }
        save(table);
        lobby(table);
      },
      // The DM keeps their own copy of the table. Everything in the game state, and nothing about
      // who is sitting there: no members, no tokens. The table's files come with it as base64 beside
      // their records (`assets`), up to a size limit; what did not fit is listed in `assetsSkipped`.
      export() {
        if (me.role !== "dm") return error("Only the DM can export the table.");
        const files = exportAssets(table.code, table.state);
        conn.send({ t: "export", table: { code: table.code, exportedAt: new Date().toISOString(), state: table.state, assets: files.assets, assetsSkipped: files.skipped, assetLimit: files.limit } });
      },
      // The client noticed it missed an update and wants the whole view again.
      sync() {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        sendFull(table, me, conn);
      },
      history(msg) {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        // The answer names the types asked for, so a client with several requests out can tell them apart.
        const types = Array.isArray(msg.types) ? msg.types.filter((x) => typeof x === "string").slice(0, 20) : undefined;
        conn.send({ t: "history", entries: history(table, me, msg), ...(types && { types }) });
      },
      act(msg) {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        const action = msg.action;
        if (!action || typeof action !== "object" || typeof action.type !== "string") return error("That isn't an action.");
        const cap = me.role === "dm" && MAP_ACTIONS.has(action.type) ? MAX_MAP_ACTION_BYTES : MAX_ACTION_BYTES;
        if (Buffer.byteLength(JSON.stringify(action)) > cap) return error("That action is too large.");
        // Players can only ever claim a character for themselves, under their own name.
        if (action.type === "claim" && me.role !== "dm") { action.user = me.id; action.userName = me.name; }
        // Out of character, a player's line is signed with the name they joined by, never one they send.
        if (action.type === "say") {
          if (me.role === "dm") delete action.userName; else action.userName = me.name;
          const t0 = now(), times = (saidAt.get(me) ?? []).filter((t) => t > t0 - 60_000);
          saidAt.set(me, times);                   // kept beside the member, never saved or sent
          if (times.length >= MAX_SAYS_PER_MINUTE) return error("You are speaking too fast. Wait a moment.");
          times.push(t0);
        }
        // A note from the DM goes to someone sitting at this table as a player. The engine knows only ids.
        if (action.type === "note" && me.role === "dm" && !table.members.some((m) => m.approved && m.role === "player" && m.id === action.to)) return error("That player isn't at this table.");
        let res;
        // Taken before every action: for the undo history (claiming a seat is not undone), and to
        // put the game back if the engine throws part way through (review #132, L6).
        const was = mark(table.state), before = undoable(action) ? was : null;
        try {
          res = apply(table.state, action, { role: me.role, userId: me.id });
        } catch {
          putBack(table.state, was);
          return error("The table couldn't make sense of that action.");   // malformed input, not a rules refusal
        }
        if (!res.ok) return error(res.error);
        if (before) {
          // The timeline is capped here, not in apply(); what is dropped goes in the undo step so undo is exact.
          const dropped = capTimeline(table.state.timeline, timelineCap);
          undoOf(table).record(before, table.state, describeStep(action, res.events, before, table.state), dropped);
          dirtyHistory.add(table.code);
        }
        touch(table);
        save(table);
        if (before) tellUndo(table);
        broadcast(table, res.events);
      },
    };
    // The DM takes back the last action, or takes it again. Everything returns as it was,
    // the dice seed too, so a redo gives exactly the same result.
    for (const [kind, done] of [["undo", "undone"], ["redo", "redone"]]) {
      handlers[kind] = () => {
        if (me.role !== "dm") return error(`Only the DM can ${kind}.`);
        const step = undoOf(table)[kind](table.state);
        if (!step) return error(`Nothing to ${kind}.`);
        dirtyHistory.add(table.code);
        save(table);
        tellUndo(table);
        resend(table, { dm: { type: done, label: step.label }, players: step.shown ? { type: done, label: step.shown } : null });
      };
    }

    // Leaving for good: a player's character is freed for someone else and their seat is removed.
    // The DM's seat is kept, since a table with no DM cannot let anyone in.
    handlers.leave = () => {
      if (me.role === "dm") return;
      const t = table, gone = me;
      let events = [];
      for (const e of Object.values(t.state.entities)) {
        if (e.owner === gone.id) events = events.concat(apply(t.state, { type: "release", entity: e.id }, { role: "dm", userId: gone.id }).events);
      }
      t.members = t.members.filter((m) => m !== gone);
      for (const c of conns(gone)) if (c !== conn) c.send({ t: "error", error: "You left the table.", expired: true });
      online.delete(gone.id);
      table = null; me = null;
      save(t);
      if (events.length) broadcast(t, events);
      lobby(t);
    };

    return {
      receive(msg) {
        if (!msg || typeof msg !== "object") return;
        const seated = ["approve", "act", "undo", "redo", "leave", "history", "sync", "export"].includes(msg.t);
        if (seated ? !me : me) return error(seated ? "Join a table first." : "You are already at a table.");
        handlers[msg.t]?.(msg);
      },
      disconnect() {
        if (!me) return;
        touch(table);
        const set = online.get(me.id);
        set?.delete(conn);
        if (set && !set.size) online.delete(me.id);
        // Someone who leaves before being let in withdraws their request.
        if (!me.approved && !online.has(me.id) && table.members.includes(me)) {
          table.members = table.members.filter((m) => m !== me);
          save(table);
        }
        lobby(table);
      },
    };
  }

  // Who holds this session token at this table, if they have been let in: for requests that do not
  // come over the socket (fetching and uploading files). Compared in constant time.
  function member(code, token) {
    const t = typeof code === "string" ? tables.get(code) : undefined;
    if (!t || typeof token !== "string" || token.length < 16 || token.length > 64) return null;
    const want = Buffer.from(token);
    const m = t.members.find((x) => { const have = Buffer.from(x.token); return have.length === want.length && timingSafeEqual(have, want); });
    return m?.approved ? { table: t, member: m } : null;
  }

  // What to write beside a table's file: { seq, v, undos, redos }, or null if there is nothing new to
  // write since the last call. The caller saves the table too; the two are matched by `seq` on load.
  // The DM's undo history only: it holds the game's state changes and must never reach a player.
  function exportHistory(code) {
    const t = tables.get(code);
    if (!t) return null;
    const seq = t.seq ?? 0;
    if (!dirtyHistory.has(code) && kept.get(code) === seq) return null;
    dirtyHistory.delete(code); kept.set(code, seq);
    return { seq, ...undoOf(t).dump() };
  }

  return { connect, exportHistory, member, get: (code) => tables.get(code), size: () => tables.size, activeSize: activeCount };
}
