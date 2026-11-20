// Purses and shops, the engine (docs/specs/shops.md, task P3, issue #596). Each test is one item of the row's "Done when" list, or one
// of the review points (Security and hidden-information review points 1 to 11), on the valley of `newGame` with a shop area drawn
// round the party's camp.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, ACTION_TYPES } from "../src/engine.js";
import * as H from "../src/hex.js";
import { footprint } from "../src/space.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { view, viewEvents, viewShops } from "../src/view.js";
import { newGame } from "../src/scenario.js";
import { migrate, VERSION } from "../src/migrate.js";
import { PREGENS } from "../src/content/index.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" }, LEE = { role: "player", userId: "lee" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, error) => { assert.equal(r.ok, false); if (error) assert.equal(r.error, error); return r; };
const GP = 100;

// The market pack: one standard list, the Outfitter template with two hidden specials (one of them a canary whose name and id must
// reach no player before it is revealed), and a loot template.
const market = (over = {}) => ({
  format: "hextable-market", v: 1, id: "port-goods", name: "Port city goods", version: 1,
  lists: [{ id: "standard", name: "Standard goods", lines: [
    { id: "longsword", item: "longsword" },
    { id: "potion-of-healing", item: "potion-of-healing" },
    { id: "rope", name: "Rope", price: "1 GP", kind: "gear" },
    { id: "rations", name: "Rations", price: "5 SP", kind: "gear" },
  ] }],
  stores: [{ id: "outfitter", name: "Outfitter", blurb: "Rope, steel and lamp oil, sold by the quay.", lists: ["standard"], markup: 100,
    buys: { equipment: 50, trade: 100, magic: 70 }, haggle: { step: 10, dc: 15, bonus: 5 },
    special: [
      { id: "wand-of-magic-missiles", item: "wand-of-magic-missiles", qty: 1, hidden: true },
      { id: "canary-orb", name: "CANARY ORB", price: "999 GP", kind: "valuable", qty: 1, hidden: true },
    ] }],
  loot: [{ id: "strongbox", name: "A strongbox", lines: [{ id: "dagger", item: "dagger", qty: 2 }], coins: { gp: 120, sp: 41 } }],
  notes: "NOTES-CANARY",
  ...over,
});

// The valley with the party's players seated and a shop area ("quay") of the cells round Brenna; Pip stands outside it.
function table() {
  const s = newGame(5);
  for (const [id, u] of [["fighter", "pat"], ["rogue", "kim"], ["cleric", "lee"]]) { s.entities[id].owner = u; s.entities[id].ownerName = u; }
  const f = s.entities.fighter.pos;
  s.map.areas = [
    { id: "quay", name: "The quay", level: "ground", hexes: [H.key(f), H.key({ q: f.q, r: f.r - 1 }), H.key({ q: f.q + 1, r: f.r - 1 })] },
    { id: "secret-area", name: "SECRET-AREA", level: "ground", hexes: [H.key({ q: -7, r: 3 })] },
  ];
  s.entities.rogue.pos = { q: -4, r: 0, z: 0 };                              // out of the quay
  s.entities.cleric.pos = { q: f.q + 1, r: f.r - 1, z: 0 };                  // in it
  ok(apply(s, { type: "market", add: market() }, DM));
  return s;
}
// The Outfitter, opened from the template, standing in the quay and shown to everyone, with coins in three purses.
function outfitter(s, coins = { fighter: { gp: 300 }, rogue: { gp: 200 }, cleric: { gp: 200 } }) {
  const id = ok(apply(s, { type: "openShop", kind: "store", market: "port-goods", template: "outfitter", at: { area: "quay" } }, DM)).events[0].shop;
  ok(apply(s, { type: "showShop", shop: id, to: "all" }, DM));
  for (const [who, c] of Object.entries(coins)) ok(apply(s, { type: "give", actor: who, coins: c }, DM));
  return id;
}

test("import a market, open three shops from one template, add a special to two; a newer version of the list reaches all three", () => {
  const s = table();
  assert.equal(s.markets.length, 1);
  assert.equal(s.markets[0].assets, undefined);
  assert.match(s.markets[0].hash, /^[0-9a-f]{8}$/);
  no(apply(s, { type: "market", add: market() }, DM), "Already imported.");
  no(apply(s, { type: "market", add: market({ lists: [{ id: "standard", name: "x", lines: [{ id: "rope", name: "Rope" }] }] }) }, DM));
  no(apply(s, { type: "market", add: market() }, PAT), "Only the DM can import a market.");
  const ids = ["Harbour Outfitter", "Dockside Outfitter", "Gate Outfitter"].map((name) => ok(apply(s, { type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name }, DM)).events[0].shop);
  assert.deepEqual(ids, ["s1", "s2", "s3"]);
  for (const id of ids.slice(0, 2)) ok(apply(s, { type: "shopEdit", shop: id, add: [{ id: "ring-of-swimming", item: "ring-of-swimming", qty: 1 }] }, DM));
  no(apply(s, { type: "shopEdit", shop: "s1", add: [{ id: "rope", name: "Rope", price: "2 GP", kind: "gear" }] }, DM), "Harbour Outfitter has a line \"rope\" already.");
  no(apply(s, { type: "shopEdit", shop: "s3", add: [{ id: "bad", item: "wand-of-magic-misiles" }] }, DM));
  for (const id of ids) ok(apply(s, { type: "showShop", shop: id, to: "all" }, DM));
  const shelf = (id) => viewShops(s, PAT).find((x) => x.id === id).lines.map((l) => `${l.id}:${l.price}`).sort();
  assert.deepEqual(shelf("s1"), ["longsword:1500", "potion-of-healing:5000", "rations:50", "ring-of-swimming:40000", "rope:100"]);
  assert.deepEqual(shelf("s3"), ["longsword:1500", "potion-of-healing:5000", "rations:50", "rope:100"]);
  // Version 2 of the pack makes rope 2 GP: every shop reading the list has it.
  const v2 = market({ version: 2 });
  v2.lists[0].lines[2].price = "2 GP";
  ok(apply(s, { type: "market", add: v2 }, DM));
  for (const id of ids) assert.ok(shelf(id).includes("rope:200"), id);
  no(apply(s, { type: "market", add: market() }, DM), "Version 2 of Port city goods is imported already; this is version 1.");
  no(apply(s, { type: "market", remove: "port-goods" }, DM), "Port city goods is used by Harbour Outfitter, Dockside Outfitter, Gate Outfitter: close them first.");
});

test("buy at the list price, with the change right, and at a haggled price; the coins taken are the engine's", () => {
  const s = table(), shop = outfitter(s, { fighter: { gp: 5 } });
  // 5 SP from 5 GP: one gold piece taken, 5 SP back.
  const r = ok(apply(s, { type: "buy", actor: "fighter", shop, line: "rations" }, PAT));
  const b = r.events.find((e) => e.type === "bought");
  assert.deepEqual([b.price, b.paid, b.change], [50, { gp: 1 }, { sp: 5 }]);
  assert.deepEqual(s.entities.fighter.coins, { gp: 4, sp: 5 });
  assert.equal(s.entities.fighter.gear.at(-1), "Rations");
  // Rope x3 at 1 GP: from the smallest coins up (5 SP, then 3 GP), 2 GP 5 SP... the purse always loses exactly the price.
  ok(apply(s, { type: "buy", actor: "fighter", shop, line: "rope", qty: 3 }, PAT));
  assert.deepEqual(s.entities.fighter.coins, { gp: 1, sp: 5 });
  assert.equal(s.entities.fighter.gear.at(-1), "Rope x3");
  // Named coins: 1 GP for 5 SP, change in silver.
  ok(apply(s, { type: "buy", actor: "fighter", shop, line: "rations", pay: { gp: 1 } }, PAT));
  assert.deepEqual(s.entities.fighter.coins, { sp: 10 });
  // A forged price and a forged paid are not read (review point 1): the rations still cost 5 SP.
  const f = ok(apply(s, { type: "buy", actor: "fighter", shop, line: "rations", price: 1, paid: { gp: 99 }, change: { pp: 9 } }, PAT)).events.find((e) => e.type === "bought");
  assert.equal(f.price, 50);
  assert.deepEqual(s.entities.fighter.coins, { sp: 5 });
  no(apply(s, { type: "quote", shop, for: "fighter", line: "rope", price: 1 }, PAT), "Only the DM can quote a price.");
  no(apply(s, { type: "shopEdit", shop, override: { rope: { price: 1 } } }, PAT), "Only the DM can change a shop.");

  // A haggle: the DM calls for Persuasion; the engine rolls it, and the price follows the rule of Decision 6.
  ok(apply(s, { type: "give", actor: "fighter", coins: { gp: 100 } }, DM));
  const q = ok(apply(s, { type: "quote", shop, for: "fighter", line: "potion-of-healing", check: { skill: "persuasion" } }, DM)).events;
  const check = q.find((e) => e.type === "check"), quoted = q.find((e) => e.type === "quoted");
  const steps = check.total >= 25 ? 2 : check.total >= 15 ? 1 : 0;
  assert.equal(quoted.steps, steps);
  assert.equal(quoted.price, Math.ceil(5000 * (100 - 10 * steps) / 100));
  // Good roleplaying: a further 5 percent of the list price, once.
  const rp = ok(apply(s, { type: "quote", shop, for: "fighter", line: "potion-of-healing", roleplay: true }, DM)).events.find((e) => e.type === "quoted");
  assert.equal(rp.price, Math.ceil(5000 * (100 - 10 * steps - 5) / 100));
  no(apply(s, { type: "quote", shop, for: "fighter", line: "potion-of-healing", roleplay: true }, DM), "The bonus for good roleplaying is in this price already.");
  // Pip pays the shop's price; Brenna the quote, which is then used up.
  const before = s.entities.fighter.coins.gp;
  const paid = ok(apply(s, { type: "buy", actor: "fighter", shop, line: "potion-of-healing" }, PAT)).events.find((e) => e.type === "bought");
  assert.equal(paid.price, rp.price);
  assert.ok(s.entities.fighter.coins.gp < before);
  assert.deepEqual(s.shops[0].quotes, []);
  // A price by hand.
  const hand = ok(apply(s, { type: "quote", shop, for: "fighter", line: "longsword", price: "9 GP" }, DM)).events.find((e) => e.type === "quoted");
  assert.equal(hand.price, 900);
  // What players hear of the quote: the price, not the DC, the steps, the bonus or how it was reached.
  for (const e of viewEvents(q, s, PAT).filter((x) => x.type === "quoted")) for (const k of ["dc", "steps", "roleplay", "by", "to", "except"]) assert.equal(e[k], undefined, k);
});

test("a refused buy changes nothing and says who is short", () => {
  const s = table(), shop = outfitter(s, { fighter: { gp: 3, sp: 2 } });
  const before = JSON.stringify(s);
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope", qty: 4 }, PAT), "Brenna has 3 GP 2 SP; Rope x4 costs 4 GP.");
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope", pay: { gp: 9 } }, PAT), "The purse has no 9 GP to pay with.");
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope", qty: 0 }, PAT), "How many: a whole number from 1 to 99.");
  no(apply(s, { type: "buy", actor: "rogue", shop, line: "rope" }, PAT), "Pip isn't yours to control.");
  assert.equal(JSON.stringify(s), before);
});

test("a hidden line and a store not shown never reach a player message, a view or a label; a guessed id gets the missing one's answer", () => {
  const s = table(), shop = outfitter(s);
  // A second store, not shown, standing in an area of its own, where Pip stands.
  const secret = ok(apply(s, { type: "openShop", kind: "store", name: "SECRET-STALL", at: { area: "secret-area" } }, DM)).events[0].shop;
  s.entities.rogue.pos = { q: -7, r: 3, z: 0 };
  const sent = [];
  const h = createHistory();
  const act = (action, ctx) => {
    const before = mark(s), r = apply(s, action, ctx);
    for (const v of [PAT, KIM, LEE]) sent.push(viewEvents(r.events, s, v), view(s, v), viewShops(s, v));
    if (r.ok) { const d = describeStep(action, r.events, before, s); h.record(before, s, d); sent.push(d.shown); }
    sent.push(r.error);
    return r;
  };
  act({ type: "shopEdit", shop: secret, add: [{ id: "secret-line", name: "SECRET LINE", price: "1 GP", kind: "gear" }], set: { notes: "NOTES-CANARY" } }, DM);
  act({ type: "shopEdit", shop, set: { notes: "NOTES-CANARY", keeper: "m1" } }, DM);
  act({ type: "quote", shop, for: "fighter", line: "rope", check: { skill: "persuasion" } }, DM);
  act({ type: "buy", actor: "fighter", shop, line: "rope" }, PAT);
  // Guessed ids: a hidden line, a line that is nothing, a store not shown and a shop that is nothing, from inside its area too.
  const answers = (line) => [act({ type: "buy", actor: "fighter", shop, line }, PAT).error, act({ type: "askCheck", actor: "fighter", skill: "persuasion", about: { shop, line } }, PAT).error];
  assert.deepEqual(answers("canary-orb"), ["No such item.", "No such item."]);
  assert.deepEqual(answers("nothing-here"), answers("canary-orb"));
  for (const [type, extra] of [["buy", { line: "secret-line" }], ["sell", { item: "Rope" }], ["chipIn", { joint: "j1", share: 1 }], ["take", { line: "x" }]]) {
    for (const id of [secret, "s99"]) assert.equal(act({ type, actor: "rogue", shop: id, ...extra }, KIM).error, "No such shop.", `${type} ${id}`);
  }
  assert.equal(act({ type: "askCheck", actor: "rogue", skill: "persuasion", about: { shop: secret, line: "secret-line" } }, KIM).error, "No such shop.");
  const all = JSON.stringify(sent);
  for (const canary of ["CANARY", "canary-orb", "SECRET", "secret-area", "secret-line", secret, "wand-of-magic-missiles", "Wand of Magic Missiles", "NOTES", "haggle", "keeper", "waits", "port-goods", "Port city goods", "outfitter\""]) {
    assert.ok(!all.includes(canary), `"${canary}" reached a player`);
  }
  // Revealed, the special turns up with its price, for those the store is shown to.
  const rev = act({ type: "revealGoods", shop, line: "canary-orb" }, DM);
  assert.deepEqual(viewEvents(rev.events, s, KIM), [{ type: "goodsRevealed", shop, line: "canary-orb", name: "CANARY ORB", price: 99900, qty: 1 }]);
  assert.ok(viewShops(s, KIM).find((x) => x.id === shop).lines.some((l) => l.id === "canary-orb"));
  // Shown to Pat alone: Kim is told it was taken from them, and from then on hears nothing of it.
  const hid = act({ type: "showShop", shop, to: ["pat"] }, DM);
  assert.deepEqual(viewEvents(hid.events, s, KIM), [{ type: "shopHidden", shop }]);
  assert.deepEqual(viewEvents(hid.events, s, PAT), []);
  assert.deepEqual(viewShops(s, KIM), []);
  const later = act({ type: "buy", actor: "fighter", shop, line: "rope" }, PAT);
  assert.deepEqual(viewEvents(later.events, s, KIM).map((e) => e.type), ["coins", "gear"]);     // the sheet changed in plain sight, the shop unnamed
  assert.ok(!JSON.stringify(viewEvents(later.events, s, KIM)).includes(shop));
  assert.equal(act({ type: "buy", actor: "rogue", shop, line: "rope" }, KIM).error, "No such shop.");
  // From the record too: the timeline told to Kim holds none of it.
  assert.ok(!JSON.stringify(viewEvents(s.timeline, s, KIM)).includes("SECRET"));
});

test("undo restores coins, stock and dice; redo rolls the same dice", () => {
  const s = table(), shop = outfitter(s, { fighter: { gp: 500 } });
  ok(apply(s, { type: "revealGoods", shop, line: "wand-of-magic-missiles" }, DM));
  const h = createHistory();
  const act = (action, ctx) => { const before = mark(s), r = ok(apply(s, action, ctx)); h.record(before, s, describeStep(action, r.events, before, s)); return r; };
  const start = JSON.stringify(s);
  const q1 = act({ type: "quote", shop, for: "fighter", line: "wand-of-magic-missiles", check: { skill: "persuasion" } }, DM).events.find((e) => e.type === "check");
  const b = act({ type: "buy", actor: "fighter", shop, line: "wand-of-magic-missiles" }, PAT).events.find((e) => e.type === "bought");
  assert.equal(s.shops[0].lines.find((l) => l.id === "wand-of-magic-missiles").qty, 0);
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "wand-of-magic-missiles" }, PAT), "Sold out.");
  assert.equal(viewShops(s, PAT)[0].lines.find((l) => l.id === "wand-of-magic-missiles").qty, 0);
  assert.equal(h.undo(s).label, `Brenna bought Wand of Magic Missiles`);
  h.undo(s);
  assert.equal(JSON.stringify(s), start);
  h.redo(s);
  const again = s.timeline.findLast((e) => e.type === "check");
  assert.deepEqual([again.total, again.dice], [q1.total, q1.dice]);
  h.redo(s);
  assert.equal(s.entities.fighter.coins.gp, 500 - b.price / GP);
  // Every action of the spec has its own label.
  for (const type of ["market", "openShop", "shopEdit", "showShop", "revealGoods", "closeShop", "quote", "buy", "chipIn", "sell", "take"]) {
    assert.ok(ACTION_TYPES.includes(type), type);
    assert.ok(!/\(an action\)/.test(describeStep({ type, actor: "fighter", shop }, [], mark(s), s).label), type);
  }
});

test("a table saved at version 26 migrates: no markets, no shops, purses cleaned", () => {
  const s = newGame(5);
  Object.assign(s, { version: 26 });
  delete s.markets; delete s.shops;
  s.entities.fighter.coins = { gp: 12, sp: 0 };
  s.entities.rogue.coins = { gp: -1 };
  s.entities.cleric.coins = "35 gp";
  s.entities.wizard.coins = {};
  migrate(s);
  assert.equal(VERSION, 27);
  assert.equal(s.version, 27);
  assert.deepEqual([s.markets, s.shops], [[], []]);
  assert.deepEqual(s.entities.fighter.coins, { gp: 12 });
  for (const id of ["rogue", "cleric", "wizard"]) assert.equal(s.entities[id].coins, undefined, id);
  // Again: the same, byte for byte. A state at 27 made by newGame (no lists) stays as it is.
  const once = JSON.stringify(s);
  migrate(s);
  assert.equal(JSON.stringify(s), once);
  const fresh = newGame(5), was = JSON.stringify(fresh);
  migrate(fresh);
  assert.equal(JSON.stringify(fresh), was);
  // A broken shop list.
  const bad = { ...newGame(5), version: 27, shops: [{ id: "s1" }, null, { id: "s2", kind: "store", name: "Ok", shown: 7 }], markets: "x" };
  migrate(bad);
  assert.deepEqual(bad.markets, []);
  assert.deepEqual(bad.shops.map((x) => [x.id, x.shown, x.lines]), [["s2", "none", []]]);
});

test("a joint purchase of 400 GP pledged by three settles all or nothing, names whoever is short, and undo restores all three purses", () => {
  const s = table(), shop = outfitter(s);
  s.entities.rogue.pos = { ...s.entities.fighter.pos, q: s.entities.fighter.pos.q };      // Pip into the quay too (Brenna's own cell is shared below)
  s.entities.rogue.pos = { q: s.entities.fighter.pos.q, r: s.entities.fighter.pos.r - 1, z: 0 };
  ok(apply(s, { type: "revealGoods", shop, line: "wand-of-magic-missiles" }, DM));
  const open = ok(apply(s, { type: "buy", actor: "fighter", shop, line: "wand-of-magic-missiles", split: true }, PAT)).events.find((e) => e.type === "jointOpened");
  assert.deepEqual([open.joint, open.price, open.buyer], ["j1", 400 * GP, "fighter"]);
  no(apply(s, { type: "chipIn", actor: "fighter", shop, joint: "j1", share: 100 }, PAT), "Brenna is the buyer and pays what the others have not pledged.");
  no(apply(s, { type: "chipIn", actor: "rogue", shop, joint: "j1", share: 100 * GP }, PAT), "Pip isn't yours to control.");      // nobody pledges another player's coins
  no(apply(s, { type: "chipIn", actor: "rogue", shop, joint: "j1", share: 201 * GP }, KIM), "Pip has 200 GP; the share is 201 GP.");
  ok(apply(s, { type: "chipIn", actor: "rogue", shop, joint: "j1", share: 100 * GP }, KIM));
  ok(apply(s, { type: "chipIn", actor: "cleric", shop, joint: "j1", share: 100 * GP }, LEE));
  assert.deepEqual(viewShops(s, LEE)[0].joint, [{ id: "j1", line: "wand-of-magic-missiles", name: "Wand of Magic Missiles", qty: 1, price: 40000, buyer: "fighter", pledges: { rogue: 10000, cleric: 10000 } }]);
  // Pip spends the coins elsewhere before Pay: the settle names him and changes nothing.
  ok(apply(s, { type: "give", actor: "rogue", coins: { gp: 197 }, take: true }, DM));
  let before = JSON.stringify(s);
  no(apply(s, { type: "buy", actor: "fighter", shop, joint: "j1" }, PAT), "Pip has 3 GP; the share is 100 GP.");
  assert.equal(JSON.stringify(s), before);
  // So does a buyer short of their own share.
  ok(apply(s, { type: "give", actor: "rogue", coins: { gp: 197 } }, DM));
  ok(apply(s, { type: "give", actor: "fighter", coins: { gp: 150 }, take: true }, DM));
  before = JSON.stringify(s);
  no(apply(s, { type: "buy", actor: "fighter", shop, joint: "j1" }, PAT), "Brenna has 150 GP; their share is 200 GP.");
  assert.equal(JSON.stringify(s), before);
  ok(apply(s, { type: "give", actor: "fighter", coins: { gp: 150 } }, DM));
  no(apply(s, { type: "buy", actor: "rogue", shop, joint: "j1" }, KIM), "Only Brenna can pay.");
  const h = createHistory(), pre = mark(s), purses = ["fighter", "rogue", "cleric"].map((id) => s.entities[id].coins);
  const r = ok(apply(s, { type: "buy", actor: "fighter", shop, joint: "j1" }, PAT));
  h.record(pre, s, describeStep({ type: "buy", actor: "fighter", shop, joint: "j1" }, r.events, pre, s));
  const b = r.events.find((e) => e.type === "bought");
  assert.deepEqual(b.payers.map((p) => [p.id, p.paid]), [["rogue", 10000], ["cleric", 10000], ["fighter", 20000]]);
  assert.deepEqual(["fighter", "rogue", "cleric"].map((id) => s.entities[id].coins), [{ gp: 100 }, { gp: 100 }, { gp: 100 }]);
  assert.ok(s.entities.fighter.gear.includes("Wand of Magic Missiles"));
  assert.deepEqual(s.shops[0].joint, []);
  assert.deepEqual(viewEvents(r.events, s, LEE).map((e) => e.type), ["bought", "jointEnded", "coins", "coins", "coins", "gear"]);
  h.undo(s);
  assert.deepEqual(["fighter", "rogue", "cleric"].map((id) => s.entities[id].coins), purses);
  assert.equal(s.shops[0].joint.length, 1);
  // A joint purchase ends by itself when its buyer walks out of the area, and when a fight starts.
  s.entities.fighter.pos = { q: -4, r: 2, z: 0 };
  const walked = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM)).events.find((e) => e.type === "jointEnded");
  assert.equal(walked.why, "left");
  // And when a fight starts.
  s.entities.fighter.pos = { ...s.entities.cleric.pos };
  s.entities.cleric.pos = { q: s.entities.fighter.pos.q - 1, r: s.entities.fighter.pos.r + 1, z: 0 };
  ok(apply(s, { type: "buy", actor: "fighter", shop, line: "wand-of-magic-missiles", split: true }, PAT));
  const fight = ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM)).events.find((e) => e.type === "jointEnded");
  assert.equal(fight.why, "fight");
});

test("the place rule: outside the shop area, a store not shown, a Large pawn, a fight, a scene, a store with no area", () => {
  const s = table(), shop = outfitter(s);
  // Pip stands outside the quay: told where, for a store he was shown.
  no(apply(s, { type: "buy", actor: "rogue", shop, line: "rope" }, KIM), "Pip is not at the Outfitter.");
  no(apply(s, { type: "sell", actor: "rogue", shop, item: "Rope" }, KIM), "Pip is not at the Outfitter.");
  ok(apply(s, { type: "buy", actor: "rogue", shop, line: "rope" }, DM));                   // the DM is not stopped by the place
  assert.deepEqual(viewShops(s, KIM)[0].here.sort(), ["cleric", "fighter"]);
  assert.ok(viewShops(s, KIM)[0].area.hexes.length >= 1);
  // A Large pawn with one cell of its footprint in the area is inside.
  const area = s.map.areas.find((a) => a.id === "quay");
  let spot = null;
  for (const h of H.range(s.entities.fighter.pos, 3)) {
    const cells = footprint({ size: "large" }, { ...h, z: 0 }).map((c) => H.key(c));
    if (!area.hexes.includes(H.key(h)) && cells.some((k) => area.hexes.includes(k)) && cells.every((k) => s.map.levels[0].tiles[k])) { spot = h; break; }
  }
  assert.ok(spot, "a spot whose anchor is outside and one cell inside");
  s.entities.rogue.pos = { ...spot, z: 0 };
  s.entities.rogue.size = "large";
  ok(apply(s, { type: "buy", actor: "rogue", shop, line: "rope" }, KIM));
  // A fight refuses even a pawn inside; the DM still trades.
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope" }, PAT), "Not in the middle of a fight.");
  ok(apply(s, { type: "endEncounter" }, DM));
  // With a scene open, only `shown` applies: Pip, far off, buys.
  s.entities.rogue.pos = { q: -4, r: 0, z: 0 };
  ok(apply(s, { type: "scene", scene: { title: "The quay at dusk" } }, DM));
  ok(apply(s, { type: "buy", actor: "rogue", shop, line: "rope" }, KIM));
  ok(apply(s, { type: "endScene" }, DM));
  // A store with no area on this map refuses players, with the sentence the DM's card shows.
  ok(apply(s, { type: "shopEdit", shop, set: { at: null } }, DM));
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope" }, PAT), "The Outfitter has no place on this map.");
  ok(apply(s, { type: "shopEdit", shop, set: { at: { area: "gone" } } }, DM));
  no(apply(s, { type: "buy", actor: "fighter", shop, line: "rope" }, PAT), "The Outfitter has no place on this map.");
  ok(apply(s, { type: "buy", actor: "fighter", shop, line: "rope" }, DM));
});

test("selling: a magic item at 70 percent of its value, equipment at half, nothing automatic when the store does not buy it", () => {
  const s = table(), shop = outfitter(s, { fighter: { gp: 100 } });
  ok(apply(s, { type: "buy", actor: "fighter", shop, line: "potion-of-healing" }, PAT));
  assert.deepEqual(s.entities.fighter.coins, { gp: 50 });
  const sold = ok(apply(s, { type: "sell", actor: "fighter", shop, item: "Potion of Healing" }, PAT)).events.find((e) => e.type === "sold");
  assert.equal(sold.price, 35 * GP);
  assert.deepEqual(s.entities.fighter.coins, { gp: 55, pp: 3 });                 // paid in the largest coins first
  ok(apply(s, { type: "give", actor: "fighter", item: "Longsword" }, DM));
  assert.equal(ok(apply(s, { type: "sell", actor: "fighter", shop, item: "longsword" }, PAT)).events.find((e) => e.type === "sold").price, 750);
  ok(apply(s, { type: "give", actor: "fighter", item: "Odd pebble" }, DM));
  no(apply(s, { type: "sell", actor: "fighter", shop, item: "Odd pebble" }, PAT), "The Outfitter makes no offer for Odd pebble. Ask the DM.");
  ok(apply(s, { type: "quote", shop, for: "fighter", item: "Odd pebble", sell: true, price: "2 SP" }, DM));
  assert.equal(ok(apply(s, { type: "sell", actor: "fighter", shop, item: "Odd pebble" }, PAT)).events.find((e) => e.type === "sold").price, 20);
  no(apply(s, { type: "sell", actor: "fighter", shop, item: "Odd pebble" }, PAT), "Brenna has no Odd pebble.");
});

test("loot packages: take a line, take coins, the DM shares the coins out; give coins; a remade character keeps its purse", () => {
  const s = table();
  const box = ok(apply(s, { type: "openShop", kind: "loot", market: "port-goods", template: "strongbox" }, DM)).events[0].shop;
  ok(apply(s, { type: "showShop", shop: box, to: "all" }, DM));
  no(apply(s, { type: "buy", actor: "fighter", shop: box, line: "dagger" }, PAT), "A strongbox is not a store.");
  ok(apply(s, { type: "take", actor: "rogue", shop: box, line: "dagger" }, KIM));            // no object: no place rule
  ok(apply(s, { type: "take", actor: "rogue", shop: box, coins: { gp: 20 } }, KIM));
  no(apply(s, { type: "take", actor: "rogue", shop: box, coins: { gp: 200 } }, KIM), "A strongbox holds no 200 GP.");
  no(apply(s, { type: "take", shop: box, split: ["fighter", "rogue", "cleric"] }, KIM), "Only the DM can share out a package.");
  const r = ok(apply(s, { type: "take", shop: box, split: ["fighter", "rogue", "cleric", "wizard"] }, DM));
  assert.deepEqual(r.events[0].each, { sp: 10, gp: 25 });
  assert.deepEqual(r.events[0].left, { sp: 1 });
  assert.deepEqual(s.entities.rogue.coins, { gp: 45, sp: 10 });
  assert.deepEqual(viewShops(s, PAT)[0], { id: box, kind: "loot", name: "A strongbox", lines: [{ id: "dagger", name: "Dagger", item: "dagger", kind: "weapon", qty: 1 }], coins: { sp: 1 } });
  // give coins, and take them back.
  ok(apply(s, { type: "give", actor: "fighter", coins: { pp: 2 } }, DM));
  no(apply(s, { type: "give", actor: "fighter", coins: { pp: 3 }, take: true }, DM), "Brenna has no 3 PP to take.");
  no(apply(s, { type: "give", actor: "fighter", coins: { gp: 1 } }, PAT), "Only the DM can hand out items.");
  const g = ok(apply(s, { type: "give", actor: "fighter", coins: { pp: 1 }, take: true }, DM)).events[0];
  assert.deepEqual(viewEvents([g], s, KIM), [{ type: "coins", id: "fighter", coins: { sp: 10, gp: 25, pp: 1 }, why: "dm", taken: { pp: 1 } }]);
  // Edited from a record, the character keeps its purse, as it keeps its XP.
  ok(apply(s, { type: "editCharacter", actor: "fighter", record: PREGENS.fighter }, DM));
  assert.deepEqual(s.entities.fighter.coins, { sp: 10, gp: 25, pp: 1 });
  // A Seen creature's public record has no purse; the party's has.
  ok(apply(s, { type: "give", actor: "m1", coins: { gp: 3 } }, DM));
  assert.ok(view(s, PAT).entities.m1, "the goblin is Seen");
  assert.equal(view(s, PAT).entities.m1.coins, undefined);
  assert.deepEqual(view(s, PAT).entities.fighter.coins, { sp: 10, gp: 25, pp: 1 });
});
