// Tables: who is sitting at which game, and what each of them is told.
//
// No network code here. A connection is anything with send(object); the HTTP
// and WebSocket layer in index.js supplies real ones and the tests supply fakes.
//
//   const tables = createTables({ load, save });
//   const session = tables.connect(conn);     // one per connection
//   session.receive(message);                 // a parsed client message
//   session.disconnect();
import { randomBytes, randomInt } from "node:crypto";
import { apply } from "../../rules/src/engine.js";
import { newGame } from "../../rules/src/scenario.js";
import { view, viewEvents } from "../../rules/src/view.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O or 1/I/L
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const makeId = () => randomBytes(9).toString("base64url");
const makeToken = () => randomBytes(24).toString("base64url");
const cleanName = (name) => String(name ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || "Adventurer";

export const MAX_TABLES = 500;
export const MAX_MEMBERS = 12;

export function createTables({ load = () => [], save = () => {}, seed = () => randomInt(1e9) } = {}) {
  // code -> { code, state, members: [{ id, token, name, role, approved }] }
  const tables = new Map();
  for (const t of load()) tables.set(t.code, t);
  // member id -> Set of live connections (the same person may have two tabs open)
  const online = new Map();

  const conns = (m) => online.get(m.id) ?? new Set();
  const tell = (m, msg) => { for (const c of conns(m)) c.send(msg); };
  // Nobody is ever sent the game state itself, only their view of it: the DM's view is
  // everything, a player's has no dice seed and only what their characters could know.
  const update = (t, m, events) => {
    const viewer = { role: m.role, userId: m.id };
    return { t: "update", state: view(t.state, viewer), events: viewEvents(events, t.state, viewer) };
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
      if (!online.has(m.id)) online.set(m.id, new Set());
      online.get(m.id).add(conn);
      conn.send(welcome(t, m));
      if (m.approved) conn.send(update(t, m, []));
      lobby(t);
    }

    const handlers = {
      host(msg) {
        if (tables.size >= MAX_TABLES) return error("This server is full. Try again later.", true);
        let code = makeCode();
        while (tables.has(code)) code = makeCode();
        const t = { code, state: newGame(seed()), members: [] };
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
          tell(m, update(table, m, []));
        } else {
          table.members = table.members.filter((x) => x !== m);
          tell(m, { t: "error", error: "The DM declined your request to join.", expired: true });
          online.delete(m.id);
        }
        save(table);
        lobby(table);
      },
      act(msg) {
        if (!me.approved) return error("Waiting for the DM to let you in.");
        const action = msg.action;
        if (!action || typeof action !== "object" || typeof action.type !== "string") return error("That isn't an action.");
        // Players can only ever claim a character for themselves, under their own name.
        if (action.type === "claim" && me.role !== "dm") { action.user = me.id; action.userName = me.name; }
        let res;
        try {
          res = apply(table.state, action, { role: me.role, userId: me.id });
        } catch {
          return error("The table couldn't make sense of that action.");   // malformed input, not a rules refusal
        }
        if (!res.ok) return error(res.error);
        save(table);
        for (const m of table.members) if (m.approved) tell(m, update(table, m, res.events));
      },
    };

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
      if (events.length) for (const m of t.members) if (m.approved) tell(m, update(t, m, events));
      lobby(t);
    };

    return {
      receive(msg) {
        if (!msg || typeof msg !== "object") return;
        const seated = msg.t === "approve" || msg.t === "act" || msg.t === "leave";
        if (seated ? !me : me) return error(seated ? "Join a table first." : "You are already at a table.");
        handlers[msg.t]?.(msg);
      },
      disconnect() {
        if (!me) return;
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

  return { connect, get: (code) => tables.get(code), size: () => tables.size };
}
