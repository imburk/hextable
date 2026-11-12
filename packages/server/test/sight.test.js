// What a table server sends players under the sight table rules (docs/specs/sight.md, task S7):
// one shared players' view per change, never stale, and nothing out of sight in any update,
// including the full views sent after an undo or a redo.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as H from "../../rules/src/hex.js";
import { newMap } from "../../rules/src/map.js";
import { createReceiver } from "../../rules/src/patch.js";
import { view } from "../../rules/src/view.js";
import { createTables } from "../src/tables.js";

function client(tables) {
  const got = [];
  const c = { got };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.session = tables.connect({
    send(m) {
      const msg = JSON.parse(JSON.stringify(m));
      if (msg.t !== "update") return got.push(msg);
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state), raw: msg });
    },
  });
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t) });
}
// A floor with a wall from the north edge down to the middle row, just east of the party.
function map() {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 7).map((h) => [H.col(h), { t: "stone" }]));
  return newMap({ id: "w", name: "Wall", starts: [{ q: -3, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls: [{ id: "w", level: "ground", a: [2.5, -100], b: [2.5, -2], kind: "wall" }] });
}

test("players share one view, kept exact through patches, undo and redo, and a goblin out of sight is in none of it", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code, t = tables.get(code);
  const players = ["Pat", "Kim"].map((name) => { const p = client(tables); p.say({ t: "join", code, name }); dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true }); return p; });
  const act = (action) => { const before = dm.got.length; dm.say({ t: "act", action }); const err = dm.got.slice(before).find((m) => m.t === "error"); assert.equal(err, undefined, err?.error); };
  act({ type: "loadMap", map: map() });
  act({ type: "setting", key: "autoEngage", value: false });
  act({ type: "setting", key: "sight", value: "los" });
  act({ type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 3 }, name: "Grishnak" });
  const gob = Object.values(t.state.entities).find((e) => e.name === "Grishnak").id;
  const check = (label) => {
    const fresh = players.map((p) => JSON.parse(JSON.stringify({ ...view(t.state, { role: "player", userId: p.last("welcome").userId }), timeline: undefined })));
    players.forEach((p, i) => {
      const have = p.last("update").state;
      assert.deepEqual(have, fresh[i], `${label}: ${p.last("welcome").name}'s copy is not the fresh view`);
    });
    const { handouts: a, ...restA } = fresh[0], { handouts: b, ...restB } = fresh[1];
    assert.deepEqual(restA, restB, `${label}: the party sees as one`);
    return fresh[0].entities[gob] !== undefined;
  };
  const marks = () => players.map((p) => p.got.length);
  const leaks = (from) => players.some((p, i) => p.got.slice(from[i]).some((m) => JSON.stringify(m).includes(gob) || JSON.stringify(m).includes("Grishnak")));
  assert.equal(check("in the open"), true);
  // The goblin walks behind the wall: it leaves both players' states, and nothing after says otherwise.
  let mark = marks();
  act({ type: "move", actor: gob, to: { q: 4, r: -3 } });
  assert.equal(check("behind the wall"), false);
  const left = players.map((p) => p.got.at(-1).raw.patch.entities?.[gob]);
  assert.deepEqual(left, [null, null], "the patch takes it out of their state");
  mark = marks();
  act({ type: "move", actor: gob, to: { q: 5, r: -4 } });
  act({ type: "advanceTime", minutes: 1 });
  assert.equal(leaks(mark), false);
  // Undo the move behind the wall twice over: the full views it sends are built the usual way.
  dm.say({ t: "undo" }); dm.say({ t: "undo" });
  assert.equal(check("undone"), false);
  dm.say({ t: "undo" });
  assert.equal(check("undone into the open"), true);
  mark = marks();
  dm.say({ t: "redo" });
  assert.equal(check("redone"), false);
  assert.equal(leaks(mark), false);
  // A player asking for the record is not told where it went either.
  const p0 = players[0], before = p0.got.length;
  p0.say({ t: "history", limit: 200 });
  const history = p0.got.slice(before).find((m) => m.t === "history");
  assert.equal(JSON.stringify(history.entries).includes(gob), false);
});
