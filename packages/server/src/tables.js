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
// What reads content for a table (the engine, the views, the history's labels, migration) is imported under a raw_ name and
// called only inside the "scoped engine" block of createTables, which lends the table's homebrew to every call.
import { apply as rawApply, recall as rawRecall } from "../../rules/src/engine.js";
import { diff, snapshot } from "../../rules/src/patch.js";
import { createHistory, describeStep as rawDescribeStep, mark, undoable } from "../../rules/src/history.js";
import { capTimeline, TIMELINE_CAP } from "../../rules/src/timeline.js";
import { migrate as rawMigrate } from "../../rules/src/migrate.js";
import { keyedRng } from "../../rules/src/rng.js";
import { newGame } from "../../rules/src/scenario.js";
import { forViewer as rawForViewer, playerView as rawPlayerView, view as rawView, viewEvents as rawViewEvents, viewHandouts as rawViewHandouts, viewShops as rawViewShops, viewPrompt as rawViewPrompt, viewReactions as rawViewReactions } from "../../rules/src/view.js";
import { forPlayers as packFilteredCopy, packForPlayer, packsMatch, PLAYER_PACK_KINDS, cleanPacks, usesIn, inUse, vetAdd, vetPacks, vetUpdate } from "../../rules/src/content/packs.js";
import { installed, overlayOf, PackError, using } from "../../rules/src/content/registry.js";
import { HOMEBREW_LIMITS } from "../../rules/src/content/schema.js";
import { LIMIT_MESSAGE } from "./limits.js";

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
// may send a whole map document with loadMap or mapEdit, which run to hundreds of kilobytes, and so do the actions
// that carry a place's map (docs/specs/travel.md, Decision 2; W2): a first visit (enter, leave, goTo with `stale: 'reset'`),
// a reset, and a battle place added at the table.
export const MAX_ACTION_BYTES = 4 * 1024;
export const MAX_MAP_ACTION_BYTES = 1024 * 1024;
// Lines of a scene's transcript (`say`) one member may send in a minute. The engine caps a line's
// length and a scene's number of lines; this keeps one member from filling the record for everyone.
export const MAX_SAYS_PER_MINUTE = 30;
// The most entries one fight's record is sent with ({t:"history",fight}).
export const FIGHT_ENTRIES = 500;
export const MAP_ACTIONS = new Set(["loadMap", "mapEdit", "enter", "leave", "goTo", "resetPlace", "nodeAdd"]);
// A `pack` message carries one homebrew pack, at most this many bytes of JSON (HOMEBREW_LIMITS.packBytes); the frame it
// travels in is that plus an envelope. A string pack is measured before it is parsed; index.js measures the frame before it parses it.
export const MAX_PACK_BYTES = HOMEBREW_LIMITS.packBytes;
// A pack sent as JSON text is escaped once more inside the message, which at most doubles it (a quote or a backslash becomes two
// characters), so the text is read only up to twice the pack limit; the rules' own budget then bounds the pack itself at
// MAX_PACK_BYTES of canonical JSON, whatever form it came in. The frame it travels in is held to the DM's frame limit (index.js).
export const MAX_PACK_TEXT_BYTES = 2 * MAX_PACK_BYTES;
export { cleanPacks as sanitizePacks, usesIn, vetPacks };
export { PLAYER_PACK_KINDS, packForPlayer };
const PACK_PROBLEMS_SHOWN = 20;

export function createTables({ load = () => [], save = () => {}, loadHistory = () => null, timelineCap = TIMELINE_CAP, seed, key, now = Date.now, idleMs = IDLE_MS, exportAssets = () => ({ assets: [], skipped: [], limit: 0 }), allowPack = () => true, allowPackData = () => true } = {}) {
  // A server makes its own seeds and dice keys. Tests that give a seed get the dice that seed
  // rolls (an integer rng, as before version 16) unless they also give a key.
  key ??= seed ? () => null : () => randomBytes(32).toString("hex");
  seed ??= () => randomInt(1e9);
  // code -> { code, state, packs: [{ id, version, hash, data }], members: [{ id, token, name, role, approved }] }
  const tables = new Map();

  // ===== scoped engine: the one place the engine, the views, history labels and migration are called =====
  // A table's homebrew is added to the content lookups for the length of one synchronous call (content/registry.js `using`).
  // Everything that reads content for a table goes through `engine`, which lends that table's overlay; a test fails if
  // this file calls any of them anywhere else. The overlay is built once per table and rebuilt only when its packs change
  // (the cache is keyed on ids and hashes). `using` is synchronous: nothing here is ever awaited inside it, and
  // `t.packs` is never changed while an overlay is installed (the pack handler runs outside `scoped`).
  const overlays = new WeakMap();       // table -> { sig, overlay, loaded: [pack], problems: [sentences] }
  const cacheOf = (t) => {
    const sig = (t.packs ?? []).map((p) => `${p.id}@${p.version}#${p.hash}`).join(" ");
    const had = overlays.get(t);
    if (had && had.sig === sig) return had;
    let v;
    try { v = vetPacks(Array.isArray(t.packs) ? t.packs : []); } catch (err) { v = { ok: false, problems: [`the packs could not be checked (${err.message})`] }; }
    if (!v.ok) console.error(`Table ${t.code}: its homebrew packs were not used: ${v.problems.slice(0, 5).join("; ")}`);
    const made = { sig, overlay: v.ok ? v.overlay : overlayOf([]), loaded: v.ok ? v.loaded : [], problems: v.ok ? [] : v.problems };
    overlays.set(t, made);
    return made;
  };
  const scoped = (t, fn) => (t ? using(cacheOf(t).overlay, fn) : fn());
  const engine = {
    apply: (t, state, action, ctx) => scoped(t, () => rawApply(state, action, ctx)),
    recall: (t, state, opts) => scoped(t, () => rawRecall(state, opts)),
    migrate: (t) => scoped(t, () => rawMigrate(t.state)),
    describeStep: (t, action, events, before, state) => scoped(t, () => rawDescribeStep(action, events, before, state)),
    view: (t, state, ctx) => scoped(t, () => rawView(state, ctx)),
    playerView: (t, state) => scoped(t, () => rawPlayerView(state)),
    forViewer: (t, base, state, ctx) => scoped(t, () => rawForViewer(base, state, ctx)),
    viewEvents: (t, events, state, ctx) => scoped(t, () => rawViewEvents(events, state, ctx)),
    viewHandouts: (t, state, ctx) => scoped(t, () => rawViewHandouts(state, ctx)),
    viewShops: (t, state, ctx) => scoped(t, () => rawViewShops(state, ctx)),
    viewPrompt: (t, state, ctx) => scoped(t, () => rawViewPrompt(state, ctx)),
    viewReactions: (t, state, ctx) => scoped(t, () => rawViewReactions(state, ctx)),
  };
  // ===== end of the scoped engine =====
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
    // The packs a file holds are checked before anything reads them: what fails is dropped (the DM is told), never sent, and the game's
    // `state.packs` is made to say what is installed. One table's bad file is that table's problem alone.
    const s = cleanPacks(t.packs);
    t.packs = s.packs;
    if (s.dropped.length) { t.packsDropped = s.dropped; console.error(`Table ${t.code}: homebrew packs dropped at load: ${s.dropped.map((d) => `${d.id ?? "?"} (${d.reason})`).join("; ")}`); }
    engine.migrate(t); t.active ??= now(); tables.set(t.code, t);
    try { if (t.state && typeof t.state === "object") resyncPacks(t); } catch (err) { console.error(`Table ${t.code}: could not set its packs in the game: ${err.message}`); }     // saved tables may predate the current content ids
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
    const base = engine.playerView(t, t.state), out = { seq: t.seq ?? 0, state: t.state, base, snap: snapshot(base) };
    shared.set(t, out);
    return out;
  };
  // The shared view made one player's: a creature of the party that carries a homebrew monster's block is theirs alone to be sent whole
  // (rules view.js, forViewer; #457). The shared base itself when nothing changes, which is every table with no such creature.
  const baseFor = (t, m) => engine.forViewer(t, forPlayers(t).base, t.state, { role: m.role, userId: m.id });
  const stateFor = (t, m) => (m.role === "dm" ? { ...engine.view(t, t.state, { role: m.role, userId: m.id }), timeline: undefined }
    : { ...baseFor(t, m), handouts: engine.viewHandouts(t, t.state, { role: m.role, userId: m.id }), shops: engine.viewShops(t, t.state, { role: m.role, userId: m.id }), reactions: engine.viewReactions(t, t.state, { role: m.role, userId: m.id }),
      prompt: engine.viewPrompt(t, t.state, { role: m.role, userId: m.id }) });
  // What was sent, for the next difference: a player's is the shared one with their handouts, the shops shown to them, their
  // own creatures' standing instructions for reactions, and a reaction they are asked about (or
  // only that the table is waiting). A player who was sent a creature as a seen record in place of the open one
  // (forViewer) has their own snapshot, taken of what they were sent, so a patch never compares against the shared record.
  const snapFor = (t, m, state) => {
    if (m.role === "dm") return snapshot(state);
    const { snap, base } = forPlayers(t);
    if (state.entities !== base.entities || state.encounter !== base.encounter || state.effects !== base.effects) return snapshot(state);
    return { ...snap, top: { ...snap.top, handouts: JSON.stringify(state.handouts), shops: JSON.stringify(state.shops), reactions: JSON.stringify(state.reactions), prompt: JSON.stringify(state.prompt) } };
  };
  const eventsFor = (t, m, events) => engine.viewEvents(t, events, t.state, { role: m.role, userId: m.id });

  // The DM's undo history is not part of the game state and is never sent to a player or put in an
  // export. It is saved beside the table (see exportHistory) so that it survives a restart.
  // What the DM's Undo and Redo buttons would do, newest first.
  // `pins` says whether the DM can go back to the start of the last fight or to the last rest (rewind).
  const undoInfo = (t) => ({ t: "undoable", undo: undoOf(t).list(), redo: undoOf(t).listRedo(), pins: undoOf(t).pins() });
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
    const all = engine.recall(t, t.state, { types: wanted?.length ? wanted : undefined, since: from, limit: Infinity });
    return engine.viewEvents(t, all, t.state, { role: m.role, userId: m.id }).slice(-max);
  };
  // One fight's record, from its encounterStart to its encounterEnd (or to now, while it goes on), as
  // this member may see it: at most FIGHT_ENTRIES, from the start; `cut` says the rest was left out.
  const fightHistory = (t, m, fight) => {
    const tl = t.state.timeline ?? [];
    const from = tl.findIndex((e) => e.type === "encounterStart" && e.fight === fight);
    if (from < 0) return { entries: [], cut: false };
    let to = tl.findIndex((e, i) => i > from && e.type === "encounterEnd" && e.fight === fight);
    if (to < 0) to = tl.length - 1;
    const seen = engine.viewEvents(t, tl.slice(from, to + 1), t.state, { role: m.role, userId: m.id });
    return { entries: seen.slice(0, FIGHT_ENTRIES), cut: seen.length > FIGHT_ENTRIES };
  };
  // What a member is told of the table's packs (docs/specs/homebrew.md, Decision 5). `packs` is only the list, `[{ id, name, version, hash }]`,
  // so a `sync`, a sit-down or a let-in costs a few hundred bytes. The pack itself comes as `packData` for one pack: to every member let in
  // when a pack is added or updated, and otherwise only when that member asks (`{t:"packData", id}`; the client keeps what it has by hash).
  // The DM's `packData` is the whole pack; everyone else's is the id, name and version and the lists of PLAYER_PACK_KINDS (no monsters, no
  // `dmNotes`), built only from a pack that passed the check. Somebody not yet let in is sent nothing.
  // What a player is sent of a pack is its filtered form, and the hash they are given is the hash of that (made once per stored pack), never
  // the hash of the whole pack: a hash of content they are not sent would be a fingerprint of it. The DM's hash is the pack's own.
  const filtered = new WeakMap();                 // a stored pack record -> { data, hash }
  const playerPack = (p) => { let f = filtered.get(p); if (!f) { f = packFilteredCopy(p.data); filtered.set(p, f); } return f; };
  const hashFor = (m, p) => (m.role === "dm" ? p.hash : playerPack(p).hash);
  const packsMessage = (t, m) => {
    if (!m.approved) return null;
    const dropped = m.role === "dm" && t.packsDropped?.length ? { dropped: t.packsDropped } : {};
    return { t: "packs", packs: t.packs.map((p) => ({ id: p.id, name: p.data.pack.name, version: p.version, hash: hashFor(m, p) })), ...dropped };
  };
  const packDataMessage = (m, p) => ({ t: "packData", id: p.id, version: p.version, hash: hashFor(m, p), data: m.role === "dm" ? p.data : playerPack(p).data });
  const tellPacks = (t, changed) => {
    for (const m of t.members) {
      const msg = packsMessage(t, m);
      if (!msg) continue;
      tell(m, m.role === "dm" && changed ? { ...msg, changed } : msg);
      if (changed && changed.op !== "remove") { const p = t.packs.find((x) => x.id === changed.id); if (p) tell(m, packDataMessage(m, p)); }
    }
  };
  // A table with no packs sends none when someone sits down (the client starts with none).
  const sendPacks = (t, m, c) => { if (t.packs.length || (m.role === "dm" && t.packsDropped?.length)) c.send(packsMessage(t, m)); };
  // `state.packs` names what the table holds. The DM's undo, redo and rewind put whole trees back, so after each it is made to say
  // so again, through the engine and outside the undo history (the server composes `setPacks`; the DM cannot send it).
  function resyncPacks(t) {
    const want = (t.packs ?? []).map(({ id, version, hash }) => ({ id, version, hash }));
    if (packsMatch(t.state.packs ?? [], want) === true && JSON.stringify(t.state.packs) === JSON.stringify(want)) return;
    const r = engine.apply(t, t.state, { type: "setPacks", packs: want }, { role: "dm", userId: "server" });
    if (!r.ok) console.error(`Table ${t.code}: could not set its packs in the game (${r.error})`);
  }
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

    function sit(t, m) { scoped(t, () => { seat(t, m); }); }
    function seat(t, m) {
      table = t; me = m;
      const stale = now() - (t.active ?? 0) > SAVE_STALE_MS;
      touch(t);
      if (stale) save(t);
      if (!online.has(m.id)) online.set(m.id, new Set());
      online.get(m.id).add(conn);
      conn.send(welcome(t, m));
      if (m.approved) {
        sendPacks(t, m, conn);
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
        // The host may ask for the valley on squares (`grid: "square"`); anything else is the hex valley. The state is built
        // here from that one word, never taken from the client.
        const t = { code, state: newGame(seed(), msg.grid === "square" ? { grid: "square" } : undefined), packs: [], members: [], active: now() };
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
          for (const c of conns(m)) { sendPacks(table, m, c); sendFull(table, m, c); }
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
        conn.send({ t: "export", table: { code: table.code, exportedAt: new Date().toISOString(), state: table.state, packs: table.packs.map((p) => ({ id: p.id, version: p.version, hash: p.hash, data: p.data })), assets: files.assets, assetsSkipped: files.skipped, assetLimit: files.limit } });
      },
      // The client noticed it missed an update and wants the whole view again.
      sync() {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        sendPacks(table, me, conn);
        sendFull(table, me, conn);
      },
      history(msg) {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        // One fight's blow-by-blow (docs/specs/table-ui.md, Decision 5): the answer names the fight.
        if (msg.fight !== undefined) {
          if (!Number.isInteger(msg.fight)) return error("Name a fight by its number.");
          return conn.send({ t: "history", fight: msg.fight, ...fightHistory(table, me, msg.fight) });
        }
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
        // Which packs the table holds is the server's to say: `state.packs` follows the `pack` message, never an action.
        if (action.type === "setPacks") return error("A table's packs are changed with the pack message.");
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
          res = engine.apply(table, table.state, action, { role: me.role, userId: me.id });
        } catch {
          putBack(table.state, was);
          return error("The table couldn't make sense of that action.");   // malformed input, not a rules refusal
        }
        if (!res.ok) return error(res.error);
        if (before) {
          // The timeline is capped here, not in apply(); what is dropped goes in the undo step so undo is exact.
          const dropped = capTimeline(table.state.timeline, timelineCap);
          undoOf(table).record(before, table.state, engine.describeStep(table, action, res.events, before, table.state), dropped);
          undoOf(table).track(action, res.events, before, table.state);
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
        resyncPacks(table);
        dirtyHistory.add(table.code);
        save(table);
        tellUndo(table);
        resend(table, { dm: { type: done, label: step.label }, players: step.shown ? { type: done, label: step.shown } : null });
      };
    }

    // The DM takes the table back to the start of the last fight or to the last rest (docs/specs/table-ui.md,
    // Decision 1). Not an action: like undo it changes the history, and it is one step that undo takes back.
    // The dice go on from where they are, so the fight fought again rolls new dice.
    handlers.rewind = (msg) => {
      if (me.role !== "dm") return error("Only the DM can rewind.");
      const to = msg.to;
      if (to !== "fight" && to !== "rest") return error("Rewind to the start of the fight or to the last rest.");
      const step = undoOf(table).rewind(table.state, to);
      if (!step) return error(to === "fight" ? "No fight to go back to." : "No rest to go back to.");
      resyncPacks(table);
      dirtyHistory.add(table.code);
      touch(table);
      save(table);
      tellUndo(table);
      resend(table, { dm: { type: "rewound", to, label: step.label }, players: { type: "rewound", to } });
    };

    // The DM adds, updates or removes one of the table's homebrew packs (docs/specs/homebrew.md, Decision 3).
    //   { t: "pack", op: "add" | "update", pack: <the pack document, or its JSON text> }   { t: "pack", op: "remove", id }
    // The order of the checks: who; the size, before anything is parsed; the registry's budget and strict lint (`loadPack`); the id
    // and version; the four-pack limit and the cross-pack id rules (`overlayOf` on the set the table would have); what a removal or
    // an update would take from what is in play; the hash; then `setPacks` through the engine; and only when that has succeeded is
    // the table's record changed. A refusal at any step changes nothing: not the record, not the state, not what members have.
    // This handler runs outside `scoped`: it changes the packs, and an overlay is never swapped while one is installed.
    handlers.pack = (msg) => {
      if (me.role !== "dm") return error("Only the DM can change the table's packs.");
      const t = table, op = msg.op;
      if (op !== "add" && op !== "update" && op !== "remove") return error("Say what to do with the pack: add, update or remove.");
      // The budget of pack messages is the table's, spent only by its seated DM (a frame from anyone else never gets this far).
      if (!allowPack(t.code)) return error(LIMIT_MESSAGE);
      const refuse = (problems, extra = {}) => {
        const list = problems.slice(0, PACK_PROBLEMS_SHOWN).map((x) => String(x).slice(0, 300));
        conn.send({ t: "error", error: new PackError(list).message, problems: list, ...extra });
      };
      if (installed() !== null) return error("The table couldn't make sense of that pack message.");       // never swap packs under an overlay
      const cache = cacheOf(t);
      let id, record = null, loaded = null;
      if (op === "remove") {
        id = msg.id;
        if (typeof id !== "string" || !t.packs.some((p) => p.id === id)) return error("That pack is not on this table.");
      } else {
        let data = msg.pack;
        if (typeof data === "string") {
          if (Buffer.byteLength(data) > MAX_PACK_TEXT_BYTES) return error(`That pack is too large: a pack may be at most ${MAX_PACK_BYTES} bytes.`);
          try { data = JSON.parse(data); } catch (err) { return refuse([`pack: is not JSON (${err.message})`]); }
        } else if (data === null || typeof data !== "object") return error("Send the pack as a JSON document.");
        // The checks themselves are the rules package's (content/packs.js vetAdd / vetUpdate); how a refusal is sent is the server's.
        const v = (op === "add" ? vetAdd : vetUpdate)(t.packs, data, { loaded: cache.loaded });
        if (!v.ok) {
          if (v.form === "error") return error(v.problems[0]);
          return refuse(v.problems);
        }
        id = v.pack.id;
        record = v.record;
        loaded = v.pack;
      }
      // A removal is refused while anything in the game uses the pack (an update cannot drop entries, so it takes nothing away).
      if (op === "remove") {
        const uses = inUse(t.state, id);
        if (uses.length) return refuse([`The pack "${id}" is in use and cannot be removed yet: ${uses.join("; ")}.`], { blockers: uses });
      }
      const next = op === "remove" ? t.packs.filter((p) => p.id !== id) : op === "update" ? t.packs.map((p) => (p.id === id ? record : p)) : [...t.packs, record];
      const was = mark(t.state);
      let res;
      try { res = engine.apply(t, t.state, { type: "setPacks", packs: next.map((p) => ({ id: p.id, version: p.version, hash: p.hash })) }, { role: me.role, userId: me.id }); }
      catch { putBack(t.state, was); return error("The table couldn't make sense of that pack message."); }
      if (!res.ok) return error(res.error);
      t.packs = next;                                                // the record changes only now: the table is told next
      delete t.packsDropped;                                         // the DM has dealt with the packs that were dropped at load
      // A removed pack's creatures are gone, but an undo step could bring one back: the undo history is cleared (and the DM told).
      if (op === "remove") { undoOf(t).clear(); dirtyHistory.add(t.code); }
      touch(t);
      save(t);
      if (op === "remove") tellUndo(t);
      broadcast(t, []);
      tellPacks(t, { op, id, ...(record && { version: record.version }) });
    };

    // A member asks for the data of one pack (the client keeps packs by hash and asks only for what it lacks). Rate limited per member.
    handlers.packData = (msg) => {
      if (!me.approved) return error("Waiting for the DM to let you in.");
      if (!allowPackData(me.id)) return error(LIMIT_MESSAGE);
      const p = typeof msg.id === "string" ? table.packs.find((x) => x.id === msg.id) : undefined;
      if (!p) return error("That pack is not on this table.");
      conn.send(packDataMessage(me, p));
    };

    // Leaving for good: a player's character is freed for someone else and their seat is removed.
    // The DM's seat is kept, since a table with no DM cannot let anyone in.
    handlers.leave = () => {
      if (me.role === "dm") return;
      const t = table, gone = me;
      let events = [];
      for (const e of Object.values(t.state.entities)) {
        if (e.owner === gone.id) events = events.concat(engine.apply(t, t.state, { type: "release", entity: e.id }, { role: "dm", userId: gone.id }).events);
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
        const seated = ["approve", "act", "undo", "redo", "rewind", "leave", "history", "sync", "export", "pack", "packData"].includes(msg.t);
        if (seated ? !me : me) return error(seated ? "Join a table first." : "You are already at a table.");
        const handle = handlers[msg.t];
        if (typeof handle !== "function") return;
        // Everything a seated member's message does runs with the table's homebrew lent to the content lookups. `pack` alone
        // runs outside, because it changes which packs there are (it scopes each of its own engine calls).
        if (msg.t === "pack" || msg.t === "packData") handle(msg); else scoped(table, () => { handle(msg); });
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
