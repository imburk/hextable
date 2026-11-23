// Players are not told how many shops or hidden creatures there are (issue #630; docs/DEBT.md, T11): a player's id for a shop is a number given in the
// order shops were first shown (shopids.js), and a fight is numbered by a counter of its own.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { view, viewEvents, viewShops } from "../src/view.js";
import { newGame } from "../src/scenario.js";
import { migrate, VERSION } from "../src/migrate.js";
import { playerShop, realShop, nextFight, translateShops } from "../src/shopids.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, error) => { assert.equal(r.ok, false); if (error) assert.equal(r.error, error); return r; };
const MARKET = {
  format: "hextable-market", v: 1, id: "port-goods", name: "Port city goods", version: 1,
  lists: [{ id: "standard", name: "Standard goods", lines: [{ id: "rope", name: "Rope", price: "1 GP", kind: "gear" }] }],
  stores: [{ id: "outfitter", name: "Outfitter", lists: ["standard"] }], loot: [{ id: "box", name: "A strongbox", lines: [{ id: "dagger", item: "dagger", qty: 2 }], coins: { gp: 5 } }],
};
function table() {
  const s = newGame(5);
  for (const [id, u] of [["fighter", "pat"], ["rogue", "kim"]]) { s.entities[id].owner = u; s.entities[id].ownerName = u; }
  ok(apply(s, { type: "market", add: MARKET }, DM));
  return s;
}
const open = (s, name, kind = "store") => ok(apply(s, kind === "store" ? { type: "openShop", kind, market: "port-goods", template: "outfitter", name } : { type: "openShop", kind, market: "port-goods", template: "box", name }, DM)).events[0].shop;

test("a player's shop ids are numbered in the order the shops were first shown, whatever the shops' own ids", () => {
  const s = table();
  const hidden = open(s, "Hidden stall"), a = open(s, "Outfitter"), b = open(s, "Chandler"), c = open(s, "Loot", "loot");
  assert.deepEqual([hidden, a, b, c], ["s1", "s2", "s3", "s4"]);
  assert.equal(s.shopAlias, undefined, "nothing shown, no list");
  ok(apply(s, { type: "showShop", shop: c, to: ["pat"] }, DM));
  ok(apply(s, { type: "showShop", shop: a, to: "all" }, DM));
  ok(apply(s, { type: "showShop", shop: c, to: "none" }, DM));
  ok(apply(s, { type: "showShop", shop: c, to: ["pat"] }, DM));                 // shown again: the same number
  assert.deepEqual(s.shopAlias, [c, a]);
  assert.deepEqual([c, a, b, hidden].map((id) => playerShop(s, id)), ["sh1", "sh2", null, null]);
  assert.deepEqual(viewShops(s, PAT).map((x) => x.id), ["sh2", "sh1"], "in the order of the shops: the Outfitter, then the box");
  assert.deepEqual(viewShops(s, KIM).map((x) => x.id), ["sh2"]);
  assert.deepEqual(viewShops(s, DM).map((x) => x.id), [a, b, c, hidden].sort(), "the DM is sent the shops' own ids");
  assert.deepEqual(view(s, PAT).shops.map((x) => x.id).sort(), ["sh1", "sh2"]);
  assert.equal(JSON.stringify(view(s, PAT)).includes("shopAlias"), false);
  // Events of the action that showed it: the number, to those who hear it; the DM's events are as they were.
  const r = ok(apply(s, { type: "showShop", shop: b, to: ["kim"] }, DM));
  assert.equal(playerShop(s, b), "sh3");
  assert.deepEqual(viewEvents(r.events, s, KIM).filter((e) => e.type === "shopShown"), [{ type: "shopShown", shop: "sh3", name: "Chandler" }]);
  assert.deepEqual(viewEvents(r.events, s, PAT), []);
  assert.equal(r.events.find((e) => e.type === "shopShown").shop, b);
  // A closed shop keeps its number: a later one is never given it.
  const gone = ok(apply(s, { type: "closeShop", shop: b }, DM));
  assert.deepEqual(viewEvents(gone.events, s, KIM).filter((e) => e.type === "shopClosed"), [{ type: "shopClosed", shop: "sh3", name: "Chandler" }]);
  const d = open(s, "Newcomer");
  ok(apply(s, { type: "showShop", shop: d, to: "all" }, DM));
  assert.equal(playerShop(s, d), "sh4");
});

test("a player names a shop by its number; every other id is refused in one sentence, before anything else is looked at", () => {
  const s = table();
  const secret = open(s, "SECRET"), a = open(s, "Outfitter");
  ok(apply(s, { type: "showShop", shop: a, to: ["pat"] }, DM));
  ok(apply(s, { type: "give", actor: "fighter", coins: { gp: 5 } }, DM));
  const reply = (ctx, shop, extra = {}) => apply(s, { type: "buy", actor: "fighter", shop, line: "rope", ...extra }, ctx);
  assert.equal(reply(PAT, "sh1").error, "The Outfitter has no place on this map.", "found; the refusal is the game's");
  const guesses = [secret, a, "s1", "s2", "sh2", "sh0", "sh01", "sh-1", "sh1 ", "SH1", "sh", "", "__proto__", "constructor", "toString", 1, null, undefined, ["sh1"], { id: "sh1" }];
  for (const g of guesses) assert.equal(reply(PAT, g).error, "No such shop.", String(JSON.stringify(g)));
  // Kim, who was not shown it, is told the same of its number as of one that was never given.
  for (const g of ["sh1", "sh2", "sh9"]) assert.equal(reply(KIM, g, { actor: "rogue" }).error, "No such shop.", g);
  // Before the creature checks, the rest of the action, the place rule and the DM's own: the sentence is the same for every action that names a shop.
  for (const [type, extra] of [["buy", { line: "x" }], ["sell", { item: "Rope" }], ["chipIn", { joint: "j1", share: 1 }], ["take", { line: "x" }]]) {
    for (const g of [secret, "sh5", "s1"]) assert.equal(apply(s, { type, actor: "fighter", shop: g, ...extra }, PAT).error, "No such shop.", `${type} ${g}`);
  }
  const dmOnly = { quote: { for: "fighter", line: "rope", price: 1 }, shopEdit: { set: { name: "x" } }, showShop: { to: "all" }, revealGoods: { line: "x" }, closeShop: {} };
  // The DM's actions are refused to a player in one sentence for the action, whatever the id: nothing tells which numbers exist.
  const probe = (ctx) => Object.entries(dmOnly).map(([type, extra]) => ["sh1", "sh2", "sh9", "s1", secret, "junk", null].map((g) => apply(s, { type, actor: "fighter", shop: g, ...extra }, ctx).error));
  for (const ctx of [PAT, KIM, { role: "player", userId: "nobody" }]) for (const row of probe(ctx)) assert.equal(new Set(row).size, 1, JSON.stringify(row));
  assert.deepEqual(probe(PAT), probe(KIM));
  // A number of a shop shown to someone else is no different from one never given, for the actions a player may send.
  assert.equal(apply(s, { type: "buy", actor: "rogue", shop: "sh1", line: "rope" }, KIM).error, "No such shop.");
  assert.equal(apply(s, { type: "askCheck", actor: "rogue", skill: "persuasion", about: { shop: "sh1", line: "rope" } }, KIM).error, "No such shop.");
  // A check asked about a shop: its number in, its number back; a guess is the same refusal.
  const asked = ok(apply(s, { type: "askCheck", actor: "fighter", skill: "persuasion", about: { shop: "sh1", line: "rope" } }, PAT));
  assert.equal(asked.events[0].about.shop, a, "the engine keeps the shop's own id");
  assert.deepEqual(viewEvents(asked.events, s, PAT)[0].about, { shop: "sh1", line: "rope" });
  assert.deepEqual(viewEvents(asked.events, s, KIM), []);
  for (const g of [a, "s2", "sh2", null]) assert.equal(apply(s, { type: "askCheck", actor: "fighter", skill: "persuasion", about: { shop: g, line: "rope" } }, PAT).error, "No such shop.");
  // The DM keeps the shops' own ids.
  assert.equal(apply(s, { type: "shopEdit", shop: a, set: { blurb: "hi" } }, DM).ok, true);
  assert.equal(apply(s, { type: "shopEdit", shop: "sh1", set: { blurb: "hi" } }, DM).error, "No such shop.");
  // The translation copies: the action it is given is not changed, and a world's own ids are not shared.
  const act = { type: "buy", shop: "sh1" };
  assert.equal(translateShops(s, act, () => {}, PAT).shop, a);
  assert.equal(act.shop, "sh1");
  assert.equal(realShop(s, "sh1"), a);
  assert.equal(realShop(s, a), null);
});

test("a refused or guessed id changes nothing and the same refusal comes from a table with more shops", () => {
  const run = (extra) => {
    const s = table();
    for (let i = 0; i < extra; i++) open(s, `Unshown ${i}`);
    const id = open(s, "Outfitter");
    ok(apply(s, { type: "showShop", shop: id, to: ["pat"] }, DM));
    const before = JSON.stringify(s);
    const answers = ["s1", "s2", "s3", "s9", "sh2", id].map((g) => apply(s, { type: "buy", actor: "fighter", shop: g, line: "rope" }, PAT));
    assert.equal(JSON.stringify(s), before, "nothing changed");
    return { shown: viewShops(s, PAT), events: answers.map((r) => [r.ok, r.error, r.events]), s };
  };
  const a = run(0), b = run(3);
  assert.deepEqual(b.shown, a.shown);
  // The shop's own id is a guess like any other, even though it is the one the DM sees; only the first of the twins had "s1" at all.
  assert.deepEqual(b.events.map((x) => x.slice(0, 2)).slice(0, 5), a.events.map((x) => x.slice(0, 2)).slice(0, 5));
});

test("undo and redo of a showing take the number back and give it again; the list is part of the saved state", () => {
  const s = table();
  const a = open(s, "Outfitter"), b = open(s, "Chandler");
  const h = createHistory();
  const act = (action) => { const before = mark(s), r = ok(apply(s, action, DM)); h.record(before, s, describeStep(action, r.events, before, s)); return r; };
  const start = JSON.stringify(s);
  act({ type: "showShop", shop: b, to: "all" });
  act({ type: "showShop", shop: a, to: "all" });
  assert.deepEqual([playerShop(s, b), playerShop(s, a)], ["sh1", "sh2"]);
  const done = JSON.stringify(s);
  h.undo(s); h.undo(s);
  assert.equal(JSON.stringify(s), start);
  assert.equal(s.shopAlias, undefined);
  assert.deepEqual(viewShops(s, PAT), []);
  // Shown in the other order after undo: the numbers follow what happened now, and the old ones mean nothing.
  act({ type: "showShop", shop: a, to: "all" });
  assert.deepEqual([playerShop(s, a), playerShop(s, b)], ["sh1", null]);
  h.undo(s);
  h.redo(s);
  assert.deepEqual([playerShop(s, a), playerShop(s, b)], ["sh1", null]);
  h.clear();
  const again = JSON.parse(JSON.stringify(s));
  assert.deepEqual(again.shopAlias, [a]);
  assert.notEqual(done, JSON.stringify(s));
});

test("a fight is numbered by a counter of its own: hidden creatures, effects and other things made do not move it", () => {
  const run = (made) => {
    const s = newGame(5);
    for (let i = 0; i < made; i++) ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: `Hidden ${i}`, at: [{ q: -1, r: 3 }, { q: -1, r: 2 }, { q: 0, r: 3 }, { q: 0, r: 2 }][i], hidden: true }, DM));
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } }, DM));
    const start = ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 }, DM));
    const fights = [start.events.find((e) => e.type === "encounterStart").fight];
    const end = ok(apply(s, { type: "endEncounter" }, DM));
    fights.push(end.events.find((e) => e.type === "encounterEnd").fight);
    const pub = ok(apply(s, { type: "conclusion", publish: true }, DM));
    fights.push(viewEvents(pub.events, s, PAT).find((e) => e.type === "conclusion").fight, viewEvents(pub.events, s, PAT).find((e) => e.type === "chronicle").fight);
    ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 }, DM));
    fights.push(s.encounter.id);
    return { s, fights, seen: [viewEvents(start.events, s, PAT)[0].fight, viewEvents(end.events, s, PAT).find((e) => e.type === "encounterEnd").fight, view(s, PAT).encounter?.id] };      // (the ids of creatures made after a hidden one still differ: what is left of T11)
  };
  const a = run(0), b = run(4);
  assert.deepEqual(a.fights, [1, 1, 1, 1, 2]);
  assert.deepEqual(b.fights, a.fights, "four creatures more were made first");
  assert.deepEqual(b.seen, a.seen, "the numbers a player is sent for the fights");
  assert.equal(b.s.fightSeq, 2);
  assert.ok(b.s.seq > a.s.seq, "the creature counter did move");
  // The conclusion card and the chronicle line carry the same number.
  const chron = b.s.timeline.filter((e) => e.type === "chronicle" && e.tags?.includes("fight"));
  assert.deepEqual(chron.map((e) => e.fight), [1]);
  assert.equal(b.s.conclusion.fight, 1);
  assert.equal(nextFight({ fightSeq: "x" }), 1);
  assert.equal(nextFight({ fightSeq: -3 }), 1);
});

test("rewinding to the start of a fight keeps the fight counter going, so a fight fought again has a new number", () => {
  const s = newGame(5);
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } }, DM));
  const h = createHistory();
  const act = (action) => { const before = mark(s), r = ok(apply(s, action, DM)); h.record(before, s, describeStep(action, r.events, before, s)); h.track(action, r.events, before, s); return r; };
  act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });
  assert.equal(s.encounter.id, 1);
  act({ type: "endEncounter" });
  act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });
  assert.equal(s.encounter.id, 2);
  assert.ok(h.rewind(s, "fight"));
  assert.equal(s.fightSeq, 2, "not wound back to 1");
  const again = act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });
  assert.equal(again.events.find((e) => e.type === "encounterStart").fight, 3);
  // Plain undo puts the counter back with the rest of the state.
  h.undo(s);
  assert.equal(s.encounter, null);
});

test("a table saved before version 29 gets the highest fight number its record holds and the shops shown, in order; again changes nothing", () => {
  assert.equal(VERSION, 30);
  const s = newGame(5);
  const a = open(table(), "x");                       // (only for the id's shape)
  assert.equal(a, "s1");
  Object.assign(s, { version: 28, encounter: null, conclusion: { fight: 7, id: 7, published: false, foes: [], party: [], xp: { bonus: [], per: {}, fixed: [] }, loot: [], next: 1 } });
  s.timeline.push({ t: 1, type: "encounterStart", fight: 12 }, { t: 2, type: "encounterEnd", fight: 12 }, { t: 3, type: "say", text: "no number" });
  s.shops = [
    { id: "s1", kind: "store", name: "A", shown: "none" }, { id: "s2", kind: "store", name: "B", shown: ["pat"] },
    { id: "s3", kind: "store", name: "C", shown: [] }, { id: "s4", kind: "loot", name: "D", shown: "all" },
  ];
  migrate(s);
  assert.equal(s.version, 30);
  assert.equal(s.fightSeq, 12);
  assert.deepEqual(s.shopAlias, ["s2", "s4"]);
  assert.deepEqual(s.shops.map((x) => x.id), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual([playerShop(s, "s2"), playerShop(s, "s4"), playerShop(s, "s1")], ["sh1", "sh2", null]);
  const once = JSON.stringify(s);
  migrate(s);
  assert.equal(JSON.stringify(s), once);
  // The next fight comes after the highest.
  const fight = (x) => { ok(apply(x, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } }, DM)); return ok(apply(x, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 }, DM)).events.find((e) => e.type === "encounterStart").fight; };
  assert.equal(fight(s), 13);
  // A table with no fight and no shop shown gets neither field; an unreadable one is dropped; a game made now needs neither.
  const plain = newGame(5); plain.version = 28; delete plain.markets; delete plain.shops;
  migrate(plain);
  assert.equal(plain.fightSeq, undefined);
  assert.equal(plain.shopAlias, undefined);
  const odd = { ...newGame(5), version: 29, fightSeq: "3", shopAlias: [1, "s1"] };
  migrate(odd);
  assert.equal(odd.fightSeq, undefined);
  assert.equal(odd.shopAlias, undefined);
  const dup = { ...newGame(5), version: 29, fightSeq: 2, shopAlias: ["s1", "s1", "s2"] };
  migrate(dup);
  assert.deepEqual([dup.fightSeq, dup.shopAlias], [2, ["s1", "s2"]]);
  const fresh = newGame(5), was = JSON.stringify(fresh);
  migrate(fresh);
  assert.equal(JSON.stringify(fresh), was);
});

test("shopids.js is pure: no clock, no dice, no I/O and no import", () => {
  const src = readFileSync(new URL("../src/shopids.js", import.meta.url), "utf8");
  assert.ok(!/Math\.random|Date\.now|new Date|performance\.|process\.|require\(|fetch\(|from\s+['"]/.test(src.replace(/\/\/.*$/gm, "")));
});

test("a rewind keeps the shop numbers and counter, and numbers the shops of a pin saved before version 29", () => {
  const s = table();
  const h = createHistory();
  const act = (action) => { const before = mark(s), r = ok(apply(s, action, DM)); h.record(before, s, describeStep(action, r.events, before, s)); h.track(action, r.events, before, s); return r; };
  const a = open(s, "Outfitter");
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } }, DM));
  act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });      // the pin: before this, no shop shown
  act({ type: "endEncounter" });
  act({ type: "showShop", shop: a, to: "all" });
  const b = open(s, "Chandler");
  act({ type: "showShop", shop: b, to: ["kim"] });
  assert.deepEqual(s.shopAlias, [a, b]);
  ok(h.rewind(s, "fight") ? { ok: true } : { ok: false, error: "no pin" });
  assert.deepEqual(s.shopAlias, [a, b], "the numbers stay");
  assert.ok(s.shopSeq >= 2, "the counter goes on");
  assert.equal(open(s, "Later"), "s3");
  assert.equal(playerShop(s, a), "sh1");
});

test("rewinding to a pin from before version 29 numbers the shops that pin shows", () => {
  const s = table();
  const a = open(s, "Outfitter");
  ok(apply(s, { type: "showShop", shop: a, to: "all" }, DM));
  const h = createHistory();
  const old = JSON.parse(JSON.stringify(s)); delete old.shopAlias; old.version = 28;
  const act = (action) => { const before = mark(s), r = ok(apply(s, action, DM)); h.record(before, s, describeStep(action, r.events, before, s)); h.track(action, r.events, before, s); return r; };
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: -4, r: 2 } }, DM));
  act({ type: "startEncounter", center: { q: -6, r: 2 }, radius: 3 });
  // Swap the pin for the old tree.
  const dump = h.dump(); dump.pins.fight.tree = JSON.parse(JSON.stringify(old)); delete dump.pins.fight.tree.timeline;
  const h2 = createHistory(); assert.ok(h2.restore(JSON.parse(JSON.stringify(dump))));
  delete s.shopAlias;
  ok(h2.rewind(s, "fight") ? { ok: true } : { ok: false, error: "no pin" });
  assert.deepEqual(viewShops(s, PAT).map((x) => x.id), ["sh1"], "players are not shown no shops until the next action");
});
