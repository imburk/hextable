// Saved tables on a square map (docs/specs/square-grid.md, task S14): host a table, load the square
// room, move, restart the server, reload, export and bring the export back. The table returns on the
// same squares with `grid: 'square'`, and a player's view of it holds no wall piece that the rule of
// view.js (a wall is sent only where it runs within a square's box of a square shown) would not send.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiver } from "../../rules/src/patch.js";
import { SQUARE_CLIP } from "../../rules/src/view.js";
import { VERSION } from "../../rules/src/migrate.js";
import { squareRoom } from "../../rules/test/fixtures/square-room.js";
import { createTables } from "../src/tables.js";

// A fake connection that rebuilds the state as the browser does.
function client(tables) {
  const got = [];
  const c = { got };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.session = tables.connect({
    send(m) {
      const msg = JSON.parse(JSON.stringify(m));
      if (msg.t !== "update") return got.push(msg);
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state) });
    },
  });
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t) });
}

// The pieces of wall the rule would send: a piece may lie only inside the box round the centre of a
// square the player was sent, on the wall's level. Returns the pieces that do not.
function strays(state) {
  const out = [];
  for (const w of state.map.walls) {
    const tiles = state.map.levels.find((l) => l.id === w.level).tiles;
    const centres = Object.keys(tiles).map((k) => k.split(",").map(Number).map((n) => n * 5));
    const near = (p) => centres.some(([x, y]) => Math.abs(p[0] - x) <= SQUARE_CLIP + 1e-6 && Math.abs(p[1] - y) <= SQUARE_CLIP + 1e-6);
    if (![w.a, w.b, [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]].every(near)) out.push(w.id);
  }
  return out;
}
const columns = (state) => Object.keys(state.map.levels[0].tiles).sort();

test("a square table is saved, restarted, exported and brought back on the same squares, and players are sent no wall they should not have", () => {
  const disk = new Map();
  const store = { load: () => [...disk.values()].map((s) => JSON.parse(s)), save: (t) => disk.set(t.code, JSON.stringify(t)) };
  const first = createTables({ ...store, seed: () => 5 });
  const dm = client(first);
  dm.say({ t: "host", name: "Dana", grid: "square" });
  const code = dm.last("welcome").code, dmToken = dm.last("welcome").token;
  const pat = client(first);
  pat.say({ t: "join", code, name: "Pat" });
  dm.say({ t: "approve", userId: pat.last("welcome").userId, ok: true });
  const patToken = pat.last("welcome").token;
  const act = (c, action) => { const n = c.got.length; c.say({ t: "act", action }); const err = c.got.slice(n).find((m) => m.t === "error"); assert.equal(err, undefined, err?.error); };

  // The square room, with its east corridors a room of their own that the players have not been shown.
  act(dm, { type: "loadMap", map: squareRoom() });
  act(dm, { type: "setting", key: "autoEngage", value: false });
  const corridors = [];
  for (let q = 15; q <= 22; q++) for (const r of [3, 4, 10]) corridors.push(`${q},${r}`);
  const rest = Object.keys(squareRoom().levels[0].tiles).filter((k) => !corridors.includes(k));
  act(dm, { type: "mapEdit", ops: [
    { op: "region", region: { id: "hall", name: "The hall", level: "ground", hexes: rest, revealed: true } },
    { op: "region", region: { id: "east", name: "East corridors", level: "ground", hexes: corridors, revealed: false } },
  ] });
  act(dm, { type: "move", actor: "fighter", to: { q: 3, r: 1 } });
  const at = structuredClone(first.get(code).state.entities.fighter.pos);
  assert.deepEqual(at, { q: 3, r: 1, z: 0 });

  const before = pat.last("update").state;
  assert.equal(before.map.grid, "square");
  assert.equal(before.map.id, "square-room");
  assert.ok(!columns(before).includes("15,3") && columns(before).includes("14,3"), "the unrevealed corridors are not sent");
  assert.deepEqual(strays(before), []);
  const reach = (ws) => Math.max(...ws.flatMap((w) => [w.a[0], w.b[0]]));
  assert.ok(reach(before.map.walls) <= 72.5 + 0.03, "no wall out in the unrevealed corridors is sent (their ids are hidden, so by where they are)");
  assert.ok(before.map.walls.some((w) => w.a[1] === -2.5 && w.b[1] === -2.5), "the north wall of the hall is");
  assert.ok(squareRoom().walls.some((w) => Math.max(w.a[0], w.b[0]) > 100), "(the room does have walls out there)");

  // Restart: a second server reads the same files.
  const second = createTables(store);
  assert.equal(second.get(code).state.map.grid, "square");
  const reload = (tables, who, token) => { const c = client(tables); c.say({ t: "resume", code, token }); return c; };
  const patBack = reload(second, "pat", patToken), dmBack = reload(second, "dm", dmToken);
  assert.equal(patBack.last("welcome").role, "player");
  const seen = patBack.last("update").state;
  assert.equal(seen.map.grid, "square");
  assert.equal(seen.map.cellFeet, 5);
  assert.deepEqual(seen.entities.fighter.pos, at);
  assert.deepEqual(columns(seen), columns(before));
  assert.deepEqual(strays(seen), []);
  assert.equal(dmBack.last("update").state.map.levels[0].tiles["15,3"].t, "stone");
  act(dmBack, { type: "move", actor: "fighter", to: { q: 3, r: 2 } });
  assert.deepEqual(second.get(code).state.entities.fighter.pos, { q: 3, r: 2, z: 0 });
  act(dmBack, { type: "move", actor: "fighter", to: { q: 3, r: 1 } });

  // Export: the whole state, still square, and nothing of the members.
  dmBack.say({ t: "export" });
  const file = dmBack.last("export").table;
  assert.equal(file.state.map.grid, "square");
  assert.equal(file.state.version, VERSION);
  assert.deepEqual(file.state.entities.fighter.pos, at);
  const json = JSON.stringify(file);
  assert.ok(!json.includes(patToken) && !json.includes(dmToken), "a token leaked into the export");

  // Import: a table made from the exported file (the server has no upload; it loads a saved table, as it does after an upgrade).
  const imported = createTables({ load: () => [{ code: file.code, state: JSON.parse(json).state, members: [{ id: "u1", token: "dm-token", name: "Dana", role: "dm", approved: true }, { id: "u2", token: "pat-token", name: "Pat", role: "player", approved: true }] }] });
  const back = imported.get(code).state;
  assert.equal(back.map.grid, "square");
  assert.deepEqual(back.entities.fighter.pos, at);
  assert.deepEqual(Object.keys(back.map.levels[0].tiles).sort(), Object.keys(squareRoom().levels[0].tiles).sort());
  const patNew = reload(imported, "pat", "pat-token");
  const view = patNew.last("update").state;
  assert.equal(view.map.grid, "square");
  assert.deepEqual(columns(view), columns(before));
  assert.deepEqual(strays(view), []);
  assert.deepEqual(view.map.walls.map((w) => w.id).sort(), before.map.walls.map((w) => w.id).sort());
  const dmNew = reload(imported, "dm", "dm-token");
  act(dmNew, { type: "move", actor: "fighter", to: { q: 4, r: 1 } });
  assert.deepEqual(imported.get(code).state.entities.fighter.pos, { q: 4, r: 1, z: 0 });
});
