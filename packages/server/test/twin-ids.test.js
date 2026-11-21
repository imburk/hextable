// Twin worlds for the id counters (issue #630; docs/DEBT.md, T11): two tables played from one seed and one script, the second with one more thing
// the players are not told of (a shop never shown, a creature the DM hid). What a player is sent must be the same in both: in particular the
// id of a shop they are shown and the number of a fight, which used to come from counters that also counted the hidden things.
// (The general twin-world harness is a separate pull request; these two are written with the server tests' own helpers.)
import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiver } from "../../rules/src/patch.js";
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
  stores: [{ id: "outfitter", name: "Outfitter", lists: ["standard"] }], loot: [],
};

// A table with a DM and Pat (who plays the fighter) and Sam (who plays nobody). `secret` adds what only the second world has.
function table() {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const pat = client(tables), sam = client(tables);
  pat.say({ t: "join", code, name: "Pat" });
  sam.say({ t: "join", code, name: "Sam" });
  for (const p of [pat, sam]) dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  pat.say({ t: "act", action: { type: "claim", entity: "fighter" } });
  const act = (action) => { const n = dm.got.length; dm.say({ t: "act", action }); assert.ok(!dm.got.slice(n).some((m) => m.t === "error"), JSON.stringify(dm.got.slice(n))); return dm.last("update").events; };
  return { tables, code, dm, pat, sam, patId: pat.last("welcome").userId, act };
}
const eventsOf = (c, type) => c.got.filter((m) => m.t === "update").flatMap((m) => m.events ?? []).filter((e) => e.type === type);

test("twin worlds: a shop opened and never shown does not change the id a player is shown (issue #630, part 1)", () => {
  const run = (secret) => {
    const w = table();
    w.act({ type: "market", add: MARKET });
    if (secret) w.act({ type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "SECRET-STALL" });
    const id = w.act({ type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "Outfitter" })[0].shop;
    w.act({ type: "showShop", shop: id, to: [w.patId] });
    return { ...w, id };
  };
  const a = run(false), b = run(true);
  assert.notEqual(a.id, b.id, "the DM's own ids do differ (the twin does have one more shop)");
  assert.deepEqual(eventsOf(b.pat, "shopShown"), eventsOf(a.pat, "shopShown"));
  assert.equal(eventsOf(b.pat, "shopShown")[0].shop, "sh1");
  assert.deepEqual(b.pat.receiver.state.shops, a.pat.receiver.state.shops);
  assert.deepEqual(b.pat.receiver.state.shops.map((x) => x.id), ["sh1"]);
  // Pat acts on the shop by the number they were given; the DM's id, and a guess, are nothing to them.
  b.dm.say({ t: "act", action: { type: "give", actor: "fighter", coins: { gp: 5 } } });
  const tried = (shop) => { const n = b.pat.got.length; b.pat.say({ t: "act", action: { type: "buy", actor: "fighter", shop, line: "rope" } }); return b.pat.got.slice(n).find((m) => m.t === "error"); };
  const refusal = (m) => m?.error ?? m?.message ?? JSON.stringify(m);
  assert.equal(refusal(tried("sh1")), "The Outfitter has no place on this map.");     // found, and refused for a reason of the game
  for (const guess of [b.id, "s1", "s2", "sh2", "sh9"]) assert.equal(refusal(tried(guess)), "No such shop.", guess);
  // Nothing Pat or Sam was sent names the shop that was never shown, or any of the shops' own ids.
  for (const c of [b.pat, b.sam]) {
    const all = JSON.stringify(c.raw);
    assert.ok(!all.includes("SECRET-STALL"));
    assert.ok(!/"s[0-9]+"/.test(all.replace(/"shop[A-Za-z]*"/g, "")), "a shop's own id reached a player");
  }
  assert.deepEqual(b.sam.receiver.state.shops, []);
  // Sam, shown nothing, cannot count shops by trying the DM's actions: one answer for each action whatever the id, the same in both worlds.
  const sent = (w, type, shop) => { const n = w.sam.got.length; w.sam.say({ t: "act", action: { type, shop, actor: "fighter", to: "all", set: { name: "x" }, line: "rope", for: "fighter", price: 1 } }); return refusal(w.sam.got.slice(n).find((m) => m.t === "error")); };
  for (const type of ["shopEdit", "showShop", "closeShop", "revealGoods", "quote"]) {
    const answers = [a, b].flatMap((w) => ["sh1", "sh2", "s1", "s2", "junk"].map((g) => sent(w, type, g)));
    assert.equal(new Set(answers).size, 1, `${type}: ${JSON.stringify(answers)}`);
  }
});

test("twin worlds: a creature the DM hid does not change the number of a fight (issue #630, part 2)", () => {
  const run = (hidden) => {
    const w = table();
    if (hidden) w.act({ type: "spawn", monster: "goblin-warrior", name: "SECRET-GOBLIN", at: { q: -1, r: 3 }, hidden: true });
    w.act({ type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } });
    w.act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });
    w.act({ type: "endEncounter" });
    return w;
  };
  const a = run(false), b = run(true);
  for (const type of ["encounterStart", "encounterEnd"]) {
    const x = eventsOf(a.pat, type), y = eventsOf(b.pat, type);
    assert.equal(x.length, 1, type);
    assert.equal(y[0].fight, x[0].fight, type);
    assert.equal(x[0].fight, 1, "the first fight is fight 1");
  }
  assert.deepEqual(eventsOf(b.sam, "encounterStart").map((e) => e.fight), [1]);
  assert.equal(b.pat.receiver.state.conclusion?.fight ?? 1, 1);
  assert.ok(!JSON.stringify(b.pat.raw).includes("SECRET-GOBLIN"));
});
