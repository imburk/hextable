// Rolled Hit Points at a networked table (#638): a player rolls the Hit Points of a character they run, and every player and the DM is sent the roll
// with each die; the sheet's rolls come through the player's view; a player cannot send a sheet with rolls of their own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiver } from "../../rules/src/patch.js";
import { createTables } from "../src/tables.js";

function client(tables) {
  const got = [];
  const c = { got };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.receiver = receiver;
  c.session = tables.connect({
    send(m) {
      const msg = JSON.parse(JSON.stringify(m));
      if (msg.t !== "update") return got.push(msg);
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state) });
    },
  });
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t), events: (type) => got.filter((m) => m.t === "update").flatMap((m) => m.events ?? []).filter((e) => e.type === type) });
}
const SHEET = { name: "Brann", class: "fighter", level: 4, subclass: "champion", abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 8 }, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };

test("a player's Hit Point roll at a rolled table is seen by every player and the DM, dice and all; a forged sheet from a player is refused", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const pat = client(tables), sam = client(tables);
  pat.say({ t: "join", code, name: "Pat" }); sam.say({ t: "join", code, name: "Sam" });
  for (const p of [pat, sam]) dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  const act = (c, action) => { const n = c.got.length; c.say({ t: "act", action }); return c.got.slice(n); };
  const bad = (msgs) => msgs.find((m) => m.t === "error");

  // The DM brings the character in while the table is fixed; Pat runs it; then the table begins to roll.
  const joined = act(dm, { type: "setSheet", sheet: SHEET, at: { q: 1, r: 1, z: 0 } });
  assert.ok(!bad(joined), JSON.stringify(joined));
  const id = dm.events("spawned").at(-1).id;
  assert.ok(!bad(act(pat, { type: "claim", entity: id })));
  const fixed = tables.get(code).state.entities[id].maxHp;
  assert.ok(bad(act(pat, { type: "rollHp", actor: id })), "a fixed table refuses the roll");
  assert.ok(!bad(act(dm, { type: "setting", key: "hpMethod", value: "rolled" })));
  assert.equal(tables.get(code).state.entities[id].maxHp, fixed, "switching the setting changes nobody");

  assert.ok(bad(act(sam, { type: "rollHp", actor: id })), "Sam does not run it");
  const rolled = act(pat, { type: "rollHp", actor: id });
  assert.ok(!bad(rolled), JSON.stringify(rolled));
  for (const c of [dm, pat, sam]) {
    const ev = c.events("hpRolled").at(-1);
    assert.ok(ev, "everyone is sent the roll");
    assert.equal(ev.id, id); assert.equal(ev.by, tables.get(code).state.entities[id].owner);
    assert.deepEqual(ev.levels.map((l) => l.level), [2, 3, 4]);
    for (const l of ev.levels) { assert.equal(l.dice.length, 1); assert.ok(l.dice[0].value >= 1 && l.dice[0].value <= 10); }
  }
  assert.deepEqual(sam.events("hpRolled").at(-1).levels, pat.events("hpRolled").at(-1).levels);
  const st = tables.get(code).state;
  assert.deepEqual(st.entities[id].sheet.hpRolls.fighter, dm.events("hpRolled").at(-1).levels.map((l) => l.value));

  // A player cannot write rolls: setSheet and levelUp are the DM's, and the DM's own client may not change what was rolled either.
  const before = JSON.stringify(st);
  assert.ok(bad(act(pat, { type: "setSheet", actor: id, sheet: { ...SHEET, hpRolls: { fighter: [10, 10, 10] } } })));
  assert.ok(bad(act(dm, { type: "setSheet", actor: id, sheet: { ...st.entities[id].sheet, hpRolls: { fighter: [10, 10, 10] } } })));
  assert.equal(JSON.stringify(tables.get(code).state), before);
});
