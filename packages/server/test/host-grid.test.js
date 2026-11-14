// Hosting a table on the valley of either grid (row S12): `{ t: "host", grid: "square" }` makes the square valley, and
// anything else makes the hex valley as before. The server builds the state itself from the word; it takes no state
// from the client.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiver } from "../../rules/src/patch.js";
import { newGame } from "../../rules/src/scenario.js";
import { createTables } from "../src/tables.js";

// A fake connection that rebuilds the state as a browser does.
function host(tables, msg) {
  let state = null, welcome = null;
  const receiver = createReceiver(() => {});
  const session = tables.connect({
    send(m) {
      const msg2 = JSON.parse(JSON.stringify(m));
      if (msg2.t === "welcome") welcome = msg2;
      if (msg2.t === "update") { const u = receiver.receive(msg2); if (u) state = structuredClone(u.state); }
    },
  });
  session.receive(msg);
  return { get state() { return state; }, welcome: () => welcome, session };
}
const strip = (s) => { const c = structuredClone(s); delete c.rng; return c; };

test("a host who asks for squares gets the valley on squares, with the same heroes and foes", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = host(tables, { t: "host", name: "Dana", grid: "square" });
  assert.equal(dm.welcome().role, "dm");
  assert.equal(dm.state.map.grid, "square");
  assert.equal(dm.state.map.id, "valley-squares");
  const want = newGame(5, { grid: "square" });
  assert.deepEqual(Object.keys(dm.state.entities), Object.keys(want.entities));
  assert.deepEqual(dm.state.entities.m1.pos, want.entities.m1.pos);
  assert.equal(strip(dm.state).map.levels[0].tiles["0,0"].t, want.map.levels[0].tiles["0,0"].t);
});

test("a host who asks for hexes, for nothing, or for something else gets the hex valley as before", () => {
  for (const msg of [{ t: "host", name: "Dana", grid: "hex" }, { t: "host", name: "Dana" }, { t: "host", name: "Dana", grid: "triangle" }, { t: "host", name: "Dana", grid: { q: 1 } }]) {
    const dm = host(createTables({ seed: () => 5 }), msg);
    assert.equal(dm.state.map.grid, "hex", JSON.stringify(msg));
    assert.equal(dm.state.map.id, "valley");
    assert.deepEqual(dm.state.entities.m1.pos, newGame(5).entities.m1.pos);
  }
});

test("a state sent along with the host message is ignored: the server builds its own", () => {
  const evil = newGame(5, { grid: "square" });
  evil.entities.fighter.hp = 9999;
  const dm = host(createTables({ seed: () => 5 }), { t: "host", name: "Dana", state: evil, map: evil.map });
  assert.equal(dm.state.map.grid, "hex");
  assert.notEqual(dm.state.entities.fighter.hp, 9999);
});
