// Shops at a networked table (docs/specs/shops.md, Decision 3; task P3): the per-player view the table server builds carries the shops
// shown to that player, through patches, exactly as `view()` has them; a store not shown to a player never reaches them in any message.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiver } from "../../rules/src/patch.js";
import { view } from "../../rules/src/view.js";
import { createTables } from "../src/tables.js";

function client(tables) {
  const got = [], raw = [];
  const c = { got, raw };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.receiver = receiver;
  c.session = tables.connect({
    send(m) {
      const msg = JSON.parse(JSON.stringify(m));
      raw.push(msg);
      if (msg.t !== "update") return got.push(msg);
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state) });
    },
  });
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t) });
}

const MARKET = {
  format: "hextable-market", v: 1, id: "port-goods", name: "Port city goods", version: 1,
  lists: [{ id: "standard", name: "Standard goods", lines: [{ id: "rope", name: "Rope", price: "1 GP", kind: "gear" }] }],
  stores: [{ id: "outfitter", name: "Outfitter", lists: ["standard"], special: [{ id: "canary-orb", name: "CANARY ORB", price: "999 GP", kind: "valuable", qty: 1, hidden: true }] }],
  loot: [],
};

test("a shop shown to a player reaches them through patches as view() has it; one not shown never does", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const pat = client(tables), sam = client(tables);
  pat.say({ t: "join", code, name: "Pat" });
  sam.say({ t: "join", code, name: "Sam" });
  for (const p of [pat, sam]) dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  const patId = pat.last("welcome").userId;
  pat.say({ t: "act", action: { type: "claim", entity: "fighter" } });
  const expected = (c) => { const w = c.last("welcome"); return JSON.parse(JSON.stringify({ ...view(tables.get(code).state, { role: w.role, userId: w.userId }), timeline: undefined })); };
  const check = () => { for (const c of [dm, pat, sam]) assert.deepEqual(c.receiver.state, expected(c)); };

  const act = (action) => { const n = dm.got.length; dm.say({ t: "act", action }); assert.ok(!dm.got.slice(n).some((m) => m.t === "error"), JSON.stringify(dm.got.slice(n))); };
  act({ type: "market", add: MARKET });
  act({ type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "SECRET-STALL" });
  act({ type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "Outfitter" });
  check();
  act({ type: "showShop", shop: "s2", to: [patId] });
  check();
  act({ type: "give", actor: "fighter", coins: { gp: 5 } });
  pat.say({ t: "act", action: { type: "buy", actor: "fighter", shop: "sh1", line: "rope" } });       // a player names the shop by the number they were given (shopids.js); the valley is a map with no shop area: refused
  assert.equal(pat.last("error")?.error ?? pat.last("error")?.message ?? JSON.stringify(pat.last("error")), "The Outfitter has no place on this map.");
  act({ type: "buy", actor: "fighter", shop: "s2", line: "rope" });
  check();
  assert.deepEqual(pat.receiver.state.shops.map((x) => [x.id, x.name]), [["sh1", "Outfitter"]]);
  assert.deepEqual(sam.receiver.state.shops, []);
  for (const [who, c] of [["Pat", pat], ["Sam", sam]]) {
    const all = JSON.stringify(c.raw);
    for (const canary of ["SECRET-STALL", "CANARY", "canary-orb", "port-goods"]) assert.ok(!all.includes(canary), `${who} was sent "${canary}"`);
  }
  assert.ok(!JSON.stringify(sam.raw).includes("Outfitter"), "Sam was never sent the store shown to Pat");
  act({ type: "showShop", shop: "s2", to: "none" });
  check();
  assert.deepEqual(pat.receiver.state.shops, []);
});

test("the DM's view of the market list stays true through import, undo and redo (the server keeps its JSON per list)", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const expected = () => { const w = dm.last("welcome"); return JSON.parse(JSON.stringify({ ...view(tables.get(code).state, { role: w.role, userId: w.userId }), timeline: undefined })); };
  const two = structuredClone(MARKET); two.version = 2; two.lists[0].lines[0].price = "2 GP";
  const ver = () => dm.receiver.state.markets.map((m) => m.version);
  dm.say({ t: "act", action: { type: "market", add: MARKET } });
  dm.say({ t: "act", action: { type: "market", add: two } });
  assert.deepEqual(ver(), [2]);
  for (const [say, want] of [["undo", [1]], ["redo", [2]], ["undo", [1]]]) {
    dm.say({ t: say });
    assert.deepEqual(ver(), want, say);
    assert.deepEqual(dm.receiver.state, expected(), say);
  }
});
