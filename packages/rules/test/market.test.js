// The market document and the money arithmetic (docs/specs/shops.md, task P2). Prices from the SRD pack (P1) are not read here:
// `env` below is a stub with the SRD numbers the spec quotes (Coin Values, Magic Item Rarities and Values, Spell Scroll Costs).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePrice, formatCp, formatCoins, cleanPurse, purseCp, change, pay, buysOf, haggleOf, haggleDc, findLine, kindOf, unitValue, basePrice, listPrice,
  sellOffer, haggle, settle, migrateMarket, lintMarket, MARKET_LIMITS,
} from "../src/market.js";
import { PACKS } from "../src/content/index.js";

const GP = 100;
const RARITY = { common: 100 * GP, uncommon: 400 * GP, rare: 4000 * GP, "very-rare": 40000 * GP, legendary: 200000 * GP };
const SCRIBE = [15, 25, 100, 150, 1000, 1500, 10000, 12500, 15000, 50000];                    // cantrip, level 1 to 9, in GP
const ITEMS = {
  longsword: { name: "Longsword", kind: "weapon", cost: "15 GP" },
  dagger: { name: "Dagger", kind: "weapon", cost: "2 GP" },
  shortbow: { name: "Shortbow", kind: "weapon", cost: "25 GP" },
  "chain-mail": { name: "Chain Mail", kind: "armour", cost: "75 GP" },
  "plate-armor": { name: "Plate Armor", kind: "armour", cost: "1,500 GP" },
  "potion-of-healing": { name: "Potion of Healing", kind: "magic", rarity: "common", consumable: true },
  "wand-of-magic-missiles": { name: "Wand of Magic Missiles", kind: "magic", rarity: "uncommon" },
  "weapon-plus-1": { name: "Weapon, +1", kind: "magic", rarity: "uncommon", needs: ["base"] },
  "armor-plus-1": { name: "Armor, +1", kind: "magic", rarity: "rare", needs: ["base"] },
  "spell-scroll": { name: "Spell Scroll", kind: "magic", rarity: "varies", scroll: true, consumable: true, needs: ["spell"] },
  "armor-of-resistance": { name: "Armor of Resistance", kind: "magic", rarity: "rare", needs: ["base", "type"] },
  "the-artifact": { name: "The Artifact", kind: "magic", rarity: "artifact" },
};
const SPELLS = { "magic-missile": 1, fireball: 3, "light": 0 };
const env = {
  item: (id) => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : null),
  rarityValue: (r) => RARITY[r] ?? null,
  scrollCost: (lvl) => SCRIBE[lvl] * GP,
  spellLevel: (id) => (Object.hasOwn(SPELLS, id) ? SPELLS[id] : null),
};
const gp = (n) => n * GP;

test("every cost in the equipment pack parses to copper", () => {
  const { weapons, armour } = PACKS[0];
  assert.ok(weapons.length > 20 && armour.length > 5);
  for (const e of [...weapons, ...armour]) assert.ok(Number.isInteger(parsePrice(e.cost)) && parsePrice(e.cost) > 0, `${e.id}: ${e.cost}`);
  assert.equal(parsePrice(armour.find((a) => a.id === "plate-armor").cost), gp(1500));
});

test("parsePrice reads the forms of `cost` and nothing else", () => {
  for (const [s, cp] of [["15 GP", gp(15)], ["5 SP", 50], ["1,500 GP", gp(1500)], ["3 cp", 3], [" 2 EP ", 100], ["10 PP", 10000], ["10,000,000 GP", 1e9]]) assert.equal(parsePrice(s), cp, s);
  for (const s of ["", "15", "GP", "15 gold", "1,50 GP", "1.5 GP", "-5 GP", "5GP5", "1,5000 GP", "0x10 GP", 15, null, undefined, {}]) assert.equal(parsePrice(s), null, String(s));
});

test("formatCp and formatCoins say money the way a shopkeeper would", () => {
  assert.equal(formatCp(1247), "12 GP 4 SP 7 CP");
  assert.equal(formatCp(gp(1500)), "1,500 GP");
  assert.equal(formatCp(0), "0 CP");
  assert.equal(formatCp(5), "5 CP");
  assert.equal(formatCp(-1), "?");
  assert.equal(formatCoins({ gp: 3, sp: 2 }), "3 GP 2 SP");
  assert.equal(formatCoins({ cp: 7, pp: 1, ep: 2 }), "1 PP 2 EP 7 CP");
  assert.equal(formatCoins({}), "no coins");
  assert.equal(formatCoins(undefined), "no coins");
});

test("a purse is only the five coins, whole and not negative", () => {
  assert.deepEqual(cleanPurse({ gp: 3, sp: 0, cp: 4 }), { gp: 3, cp: 4 });
  assert.deepEqual(cleanPurse(undefined), {});
  for (const bad of [{ gp: -1 }, { gp: 1.5 }, { gp: "3" }, { sc: 1 }, [], "gp", { gp: 1e12 }]) assert.equal(cleanPurse(bad), null, JSON.stringify(bad));
  assert.equal(purseCp({ pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 }), 1000 + 200 + 50 + 30 + 4);
});

// ---- change: the largest coins first, never electrum
const CHANGE = [
  [0, {}], [1, { cp: 1 }], [10, { sp: 1 }], [47, { sp: 4, cp: 7 }], [99, { sp: 9, cp: 9 }], [100, { gp: 1 }], [603, { gp: 6, cp: 3 }],
  [50, { sp: 5 }], [999, { gp: 9, sp: 9, cp: 9 }], [1000, { pp: 1 }], [1234, { pp: 1, gp: 2, sp: 3, cp: 4 }], [25000, { pp: 25 }],
];
test("change is given in the largest coins first and never in electrum", () => {
  for (const [cp, want] of CHANGE) assert.deepEqual(change(cp), want, String(cp));
  for (let cp = 0; cp < 3000; cp++) assert.equal(change(cp).ep, undefined);
  for (const bad of [-1, 1.5, "5", NaN, Infinity, null]) assert.equal(change(bad), null, String(bad));
});

// ---- pay: smallest coins up, change in the largest
const PAY = [
  // purse, price (cp), taken, change, purse afterwards
  { purse: { gp: 12, sp: 4, cp: 7 }, cp: gp(4), taken: { cp: 7, sp: 4, gp: 4 }, change: { sp: 4, cp: 7 }, after: { gp: 8, sp: 4, cp: 7 } },
  { purse: { gp: 5 }, cp: gp(1), taken: { gp: 1 }, change: {}, after: { gp: 4 } },
  { purse: { gp: 5 }, cp: 50, taken: { gp: 1 }, change: { sp: 5 }, after: { gp: 4, sp: 5 } },
  { purse: { pp: 1, cp: 3 }, cp: gp(4), taken: { cp: 3, pp: 1 }, change: { gp: 6, cp: 3 }, after: { gp: 6, cp: 3 } },
  { purse: { gp: 5, cp: 20 }, cp: gp(1), taken: { cp: 20, gp: 1 }, change: { sp: 2 }, after: { gp: 4, sp: 2 } },
  { purse: { ep: 2, sp: 5 }, cp: 120, taken: { sp: 5, ep: 2 }, change: { sp: 3 }, after: { sp: 3 } },
  { purse: { sp: 3 }, cp: 30, taken: { sp: 3 }, change: {}, after: {} },
  { purse: { gp: 1 }, cp: 0, taken: {}, change: {}, after: { gp: 1 } },
  { purse: { pp: 2 }, cp: 1, taken: { pp: 1 }, change: { gp: 9, sp: 9, cp: 9 }, after: { pp: 1, gp: 9, sp: 9, cp: 9 } },
  { purse: { cp: 100, sp: 100 }, cp: 105, taken: { cp: 100, sp: 1 }, change: { cp: 5 }, after: { sp: 99, cp: 5 } },
];
test("pay takes the smallest coins up, only as much as is needed, and gives change in the largest", () => {
  for (const c of PAY) {
    const frozen = structuredClone(c.purse);
    const r = pay(c.purse, c.cp);
    assert.ok(r.ok, JSON.stringify(c));
    assert.deepEqual(c.purse, frozen, "the purse given is not changed");
    assert.deepEqual(r.taken, c.taken, JSON.stringify(c));
    assert.deepEqual(r.change, c.change, JSON.stringify(c));
    assert.deepEqual(r.purse, c.after, JSON.stringify(c));
    assert.equal(r.paid, purseCp(r.taken));
    assert.equal(r.changeCp, r.paid - c.cp);
    assert.equal(purseCp(r.purse), purseCp(c.purse) - c.cp, "value is conserved: the purse loses exactly the price");
    assert.ok(r.changeCp < 1000, "never more change than the largest coin pays");
  }
});
test("pay refuses a price the purse cannot meet and moves nothing", () => {
  const r = pay({ gp: 3, sp: 2 }, gp(4));
  assert.equal(r.ok, false);
  assert.equal(r.need, gp(4));
  assert.equal(r.have, 320);
  assert.match(r.error, /3 GP 2 SP.*4 GP/);
  assert.equal(pay({}, 1).ok, false);
  assert.equal(pay(undefined, 0).ok, true);
  for (const cp of [-1, 1.5, "4", NaN, 1e12]) assert.equal(pay({ gp: 1 }, cp).ok, false, String(cp));
  assert.equal(pay({ gp: -1 }, 1).ok, false);
  assert.equal(pay("gp", 1).ok, false);
});
test("pay with named coins: they must be held and must cover the price, and change follows", () => {
  const r = pay({ gp: 8, sp: 4 }, gp(4) + 50, { gp: 5 });
  assert.ok(r.ok);
  assert.deepEqual(r.taken, { gp: 5 });
  assert.deepEqual(r.change, { sp: 5 });
  assert.deepEqual(r.purse, { gp: 3, sp: 9 });
  assert.equal(pay({ gp: 8 }, gp(4), { gp: 9 }).ok, false, "not held");
  assert.equal(pay({ gp: 8 }, gp(4), { gp: 3 }).ok, false, "does not cover");
  assert.equal(pay({ gp: 8 }, gp(4), { xp: 3 }).ok, false, "not a coin");
  assert.equal(pay({ gp: 8, sp: 99 }, gp(4), { sp: 40 }).ok, true, "silver covers it exactly");
});

// ---- store settings
test("buys default to the SRD rates with magic at 70, and null is kept", () => {
  assert.deepEqual(buysOf(undefined), { equipment: 50, trade: 100, magic: 70 });
  assert.deepEqual(buysOf({ equipment: 40 }), { equipment: 40, trade: 100, magic: 70 });
  assert.deepEqual(buysOf({ magic: null, trade: null }), { equipment: 50, trade: null, magic: null });
  assert.deepEqual(haggleOf(undefined), { step: 10, dc: 15, bonus: 5 });
  assert.deepEqual(haggleOf({ step: 5 }), { step: 5, dc: 15, bonus: 5 });
});
test("the default DC is 15, or the store's, or the keeper's Intelligence if that is higher", () => {
  assert.equal(haggleDc({}), 15);
  assert.equal(haggleDc({ haggle: { dc: 12 } }), 12);
  assert.equal(haggleDc({ haggle: { dc: 12 } }, 14), 14);
  assert.equal(haggleDc({}, 10), 15);
  assert.equal(haggleDc({}, 18), 18);
});

// ---- list prices
const market = { lists: [{ id: "standard", lines: [
  { id: "longsword", item: "longsword" }, { id: "rope", name: "Rope", price: "1 GP", kind: "gear" }, { id: "ruby", name: "Ruby", price: "500 GP", kind: "valuable" },
  { id: "potion", item: "potion-of-healing" }, { id: "plate", item: "plate-armor" },
] }] };
const shop = { id: "s1", lists: ["standard"], markup: 100, lines: [{ id: "wand", item: "wand-of-magic-missiles", qty: 1 }], overrides: {} };

test("the list price of an SRD item: its cost, or its rarity's value, halved for a consumable", () => {
  assert.equal(listPrice("longsword", shop, market, env), gp(15));
  assert.equal(listPrice("potion", shop, market, env), gp(50), "Potion of Healing: Common 100 GP halved");
  assert.equal(listPrice("wand", shop, market, env), gp(400), "Wand of Magic Missiles: Uncommon");
  assert.equal(listPrice({ id: "x", item: "weapon-plus-1", base: "longsword" }, shop, market, env), gp(415), "Weapon, +1 (Longsword): 400 + 15");
  assert.equal(listPrice({ id: "x", item: "armor-plus-1", base: "plate-armor" }, shop, market, env), gp(5500), "+1 Armor (Plate Armor): the SRD's own example");
  assert.equal(listPrice({ id: "x", item: "spell-scroll", spell: "fireball" }, shop, market, env), gp(300), "a Spell Scroll: double the scribing cost, level 3 is 150 GP");
  assert.equal(listPrice({ id: "x", item: "spell-scroll", spell: "light" }, shop, market, env), gp(30), "a cantrip scroll: double 15 GP, and a consumable is not halved again");
  assert.equal(listPrice({ id: "x", item: "spell-scroll", spell: "magic-missile" }, shop, market, env), gp(50));
});
test("no price: an Artifact, an unknown item, a scroll of no known spell, a base with no cost", () => {
  assert.equal(listPrice({ id: "x", item: "the-artifact" }, shop, market, env), null);
  assert.equal(listPrice({ id: "x", item: "nothing" }, shop, market, env), null);
  assert.equal(listPrice({ id: "x", item: "spell-scroll", spell: "nonesuch" }, shop, market, env), null);
  assert.equal(listPrice({ id: "x", item: "spell-scroll" }, shop, market, env), null);
  assert.equal(listPrice({ id: "x", item: "weapon-plus-1", base: "nothing" }, shop, market, env), null);
  assert.equal(listPrice("nonesuch", shop, market, env), null);
  assert.equal(listPrice({ id: "x", name: "Thing" }, shop, market, env), null, "a named line with no price");
  assert.equal(listPrice("longsword", shop, market, {}), null, "with no content to read");
});
test("a line's own price is final; markup applies to the pack's value, rounded up to a copper piece", () => {
  const s = { ...shop, markup: 120 };
  assert.equal(listPrice("longsword", s, market, env), gp(18), "15 GP a fifth more");
  assert.equal(listPrice("rope", s, market, env), gp(1), "its own price: no markup");
  assert.equal(listPrice({ id: "x", item: "dagger" }, { ...shop, markup: 133 }, market, env), 266, "2 GP at 133 percent");
  assert.equal(listPrice({ id: "x", item: "dagger", price: "2 CP" }, { ...shop, markup: 133 }, market, env), 2);
  assert.equal(listPrice("longsword", { ...shop, markup: 101 }, market, env), 1515);
  assert.equal(listPrice("longsword", { ...shop, markup: 10 }, market, env), 150);
  assert.equal(listPrice({ id: "c", item: "dagger", price: "1 CP" }, shop, market, env), 1);
  assert.equal(listPrice("longsword", { lists: ["standard"] }, market, env), gp(15), "markup absent is list price");
});
test("an override's price comes first and is final; both a price string and copper are read", () => {
  const s = { ...shop, markup: 150, overrides: { longsword: { price: "9 GP" }, rope: { price: 70 }, potion: { qty: 3 } } };
  assert.equal(listPrice("longsword", s, market, env), gp(9));
  assert.equal(listPrice("rope", s, market, env), 70);
  assert.equal(listPrice("potion", s, market, env), gp(75), "an override of stock only leaves the price");
  assert.deepEqual(basePrice("longsword", s, market, env), { cp: gp(9), own: true });
  assert.deepEqual(basePrice("plate", s, market, env), { cp: gp(1500), own: false });
});
test("findLine looks at the shop's own lines, then the lists it names", () => {
  assert.equal(findLine(shop, market, "wand").item, "wand-of-magic-missiles");
  assert.equal(findLine(shop, market, "rope").name, "Rope");
  assert.equal(findLine({ ...shop, lists: [] }, market, "rope"), null);
  assert.equal(findLine(shop, market, "__proto__"), null);
  assert.equal(kindOf({ item: "longsword" }, env), "weapon");
  assert.equal(kindOf({ item: "potion-of-healing" }, env), "magic");
  assert.equal(kindOf({ name: "Rope" }, env), "gear");
  assert.equal(kindOf({ name: "Ruby", kind: "valuable" }, env), "valuable");
  assert.equal(unitValue({ name: "Rope", price: "1 GP" }, env), null, "no item, no value");
});

// ---- selling
test("a store buys a magic item at 70 percent of its value: a Wand of Magic Missiles at 280 GP", () => {
  const o = sellOffer({ item: "wand-of-magic-missiles" }, shop, market, env);
  assert.equal(o.cp, gp(280));
  assert.equal(o.basis, "magic");
  assert.equal(o.cap, gp(400));
  assert.equal(sellOffer({ item: "potion-of-healing" }, shop, market, env).cp, gp(35));
  assert.equal(sellOffer({ item: "weapon-plus-1", base: "longsword" }, shop, market, env).cp, 29050, "70 percent of 415 GP");
  assert.equal(sellOffer({ item: "spell-scroll", spell: "fireball" }, shop, market, env).cp, gp(210));
});
test("the value is the SRD's, never the shop's markup or a line's own price", () => {
  const s = { ...shop, markup: 300, lines: [{ id: "wand", item: "wand-of-magic-missiles", price: "900 GP" }] };
  assert.equal(sellOffer({ item: "wand-of-magic-missiles" }, s, market, env).cp, gp(280));
});
test("buys.magic changes the rate, and null makes no automatic offer", () => {
  assert.equal(sellOffer({ item: "wand-of-magic-missiles" }, { ...shop, buys: { magic: 50 } }, market, env).cp, gp(200));
  assert.equal(sellOffer({ item: "wand-of-magic-missiles" }, { ...shop, buys: { magic: null } }, market, env), null);
  assert.equal(sellOffer({ item: "potion-of-healing" }, { ...shop, buys: { magic: null, equipment: 90 } }, market, env), null);
  assert.equal(sellOffer({ item: "the-artifact" }, shop, market, env), null, "an Artifact has no value and so no automatic offer");
  assert.equal(sellOffer({ item: "ring-of-nothing" }, shop, market, env), null, "an item the table does not know");
});
test("equipment: half its cost by default; a line of the shop at its price before markup; trade goods at full value", () => {
  assert.equal(sellOffer({ item: "shortbow" }, shop, market, env).cp, 1250, "Shortbow 25 GP, half: 12 GP 5 SP");
  assert.equal(sellOffer({ item: "shortbow" }, { ...shop, buys: { equipment: null } }, market, env), null);
  const s = { ...shop, markup: 200 };
  const o = sellOffer({ item: "longsword" }, s, market, env);
  assert.equal(o.cp, 750, "half of the 15 GP list, not of the marked-up 30 GP");
  assert.equal(o.basis, "line");
  assert.equal(o.cap, gp(30), "a haggle may not lift it above the store's own price");
  assert.equal(sellOffer({ name: "ruby" }, shop, market, env).cp, gp(500), "a valuable keeps its full value");
  assert.equal(sellOffer({ name: "Rope" }, shop, market, env).cp, 50, "named goods match by name");
  assert.equal(sellOffer({ name: "Rope" }, { ...shop, overrides: { rope: { gone: true } } }, market, env), null, "a line that is gone is not one the store carries");
  assert.equal(sellOffer({ name: "Mouldy boot" }, shop, market, env), null);
  assert.equal(sellOffer({ name: "Rope", kind: "gear", item: undefined }, { ...shop, buys: { equipment: 0 } }, market, env), null, "nothing is no offer");
  assert.equal(sellOffer("longsword", shop, market, env), null);
});

// ---- haggle: the table of Decision 6
const LIST = gp(100);                                                                         // 10,000 CP, so every percent is a whole number
const HAGGLE = [
  // total, dc, step, bonus, price, steps, wait
  [14, 15, 10, 0, 10000, 0, true],
  [15, 15, 10, 0, 9000, 1, false],
  [24, 15, 10, 0, 9000, 1, false],
  [25, 15, 10, 0, 8000, 2, false],
  [40, 15, 10, 0, 8000, 2, false],
  [14, 15, 10, 5, 9500, 0, true],                                                              // the bonus alone, after a failed roll: the wait is not lifted
  [15, 15, 10, 5, 8500, 1, false],                                                             // 15 percent off in all
  [25, 15, 10, 5, 7500, 2, false],                                                             // 25 percent off in all
  [null, 15, 10, 5, 9500, 0, false],                                                           // the bonus on its own, no roll: 5 percent
  [null, 15, 10, 0, 10000, 0, false],
  [18, 12, 5, 5, 9000, 1, false],                                                              // a store with a step of 5
  [22, 12, 5, 5, 8500, 2, false],
  [30, 15, 50, 0, 1, 2, false],                                                                // 100 percent off is held at 1 CP
  [30, 15, 50, 25, 1, 2, false],
];
test("haggle: one step off at the DC, two at DC + 10, none below, plus the roleplaying points", () => {
  for (const [total, dc, step, bonus, price, steps, wait] of HAGGLE) {
    const r = haggle(LIST, total, dc, step, bonus);
    assert.equal(r.price, price, JSON.stringify([total, dc, step, bonus]));
    assert.equal(r.steps, steps);
    assert.equal(r.wait, wait);
    assert.equal(r.was, LIST);
  }
});
test("haggle rounds the new price up to a copper piece and never goes below 1 CP", () => {
  assert.equal(haggle(7, 15, 15, 10, 0).price, 7, "7 CP less 10 percent is 6.3: up to 7");
  assert.equal(haggle(15, 15, 15, 10, 0).price, 14, "13.5 up to 14");
  assert.equal(haggle(1500, 15, 15, 10, 0).price, 1350);
  assert.equal(haggle(1, 30, 15, 10, 25).price, 1);
  assert.equal(haggle(3, 30, 15, 50, 25).price, 1, "100 percent off or more is still 1 CP");
  assert.equal(haggle(1999, 15, 15, 10, 5).price, Math.ceil(1999 * 0.85));
});
test("the bonus is points of the list price, not of the price already reduced", () => {
  assert.equal(haggle(LIST, 15, 15, 10, 5).points, 15);
  assert.equal(haggle(LIST, 15, 15, 10, 5).price, 8500);
  assert.notEqual(haggle(LIST, 15, 15, 10, 5).price, Math.ceil(LIST * 0.9 * 0.95));
});
test("a haggle over what the party sells goes up, by the same points", () => {
  const o = sellOffer({ item: "wand-of-magic-missiles" }, shop, market, env);                // 280 GP, value 400 GP
  const mk = (total, bonus) => haggle(o.cp, total, 15, 10, bonus, { sell: true, cap: o.cap });
  assert.equal(mk(15, 0).price, gp(308));
  assert.equal(mk(25, 0).price, gp(336));
  assert.equal(mk(25, 5).price, gp(350), "20 percent and the bonus: 70 + 25 = 95 percent of the value, under the value");
  assert.equal(mk(10, 0).price, gp(280));
  assert.equal(mk(10, 0).wait, true);
  assert.ok(mk(25, 5).price < o.cap, "a magic item's automatic offer stays under its value");
  assert.equal(haggle(7, 15, 15, 10, 0, { sell: true }).price, 8, "up: 7.7 rounds up to 8");
});
test("a sell offer is never lifted above the item's value, or the store's own price for a line it sells", () => {
  const trade = sellOffer({ name: "ruby" }, shop, market, env);                              // 100 percent: already at the cap
  assert.equal(trade.cp, trade.cap);
  const r = haggle(trade.cp, 40, 15, 10, 5, { sell: true, cap: trade.cap });
  assert.equal(r.price, gp(500), "bought at 500 GP, never sold above 500 GP: no loop");
  assert.equal(r.steps, 2);
  const eq = sellOffer({ item: "longsword" }, { ...shop, markup: 120 }, market, env);        // 7 GP 5 SP, store sells at 18 GP
  assert.equal(haggle(eq.cp, 40, 15, 100, 25, { sell: true, cap: eq.cap }).price, gp(18));
  assert.equal(haggle(10, 40, 15, 10, 5, { sell: true, cap: 5 }).price, 10, "a cap below the offer never lowers it");
});
test("haggle refuses numbers out of range", () => {
  for (const args of [[0, 15, 15, 10, 0], [1.5, 15, 15, 10, 0], [100, 1.5, 15, 10, 0], [100, 15, 0, 10, 0], [100, 15, 15, -1, 0], [100, 15, 15, 10, -1], [100, "15", 15, 10, 0]]) assert.equal(haggle(...args), null, JSON.stringify(args));
});

// ---- settle
const names = { ilya: "Ilya", tor: "Tor", orla: "Orla" };
const WAND = { qty: 1, price: gp(400), buyer: "ilya", pledges: { tor: gp(100), orla: gp(100) } };
test("settle splits a price exactly: the buyer pays what nobody else pledged", () => {
  const purses = { ilya: { gp: 250 }, tor: { gp: 120 }, orla: { gp: 100, sp: 5 } };
  const frozen = structuredClone(purses);
  const r = settle(WAND, purses, names);
  assert.ok(r.ok);
  assert.equal(r.total, gp(400));
  assert.deepEqual(r.shares, { tor: gp(100), orla: gp(100), ilya: gp(200) });
  assert.equal(Object.values(r.shares).reduce((a, b) => a + b, 0), r.total);
  assert.deepEqual(r.payers.map((p) => p.id), ["tor", "orla", "ilya"], "the buyer pays last");
  assert.deepEqual(r.payers.map((p) => p.purse), [{ gp: 20 }, { sp: 5 }, { gp: 50 }]);
  assert.deepEqual(purses, frozen, "the purses given are not changed");
});
test("settle takes the shares the way a buy takes them, and gives change", () => {
  const r = settle({ qty: 1, price: 1001, buyer: "ilya", pledges: { tor: 501 } }, { ilya: { gp: 5 }, tor: { gp: 6 } });
  assert.ok(r.ok);
  assert.deepEqual(r.payers[0].taken, { gp: 6 });
  assert.deepEqual(r.payers[0].change, { sp: 9, cp: 9 });
  assert.deepEqual(r.payers[0].purse, { sp: 9, cp: 9 });
  assert.equal(r.shares.ilya, 500);
  assert.deepEqual(r.payers[1].taken, { gp: 5 });
  assert.deepEqual(r.payers[1].purse, {});
});
test("settle multiplies the price by the quantity", () => {
  const r = settle({ qty: 3, price: gp(50), buyer: "ilya", pledges: { tor: gp(50) } }, { ilya: { gp: 100 }, tor: { gp: 50 } });
  assert.ok(r.ok);
  assert.equal(r.total, gp(150));
  assert.equal(r.shares.ilya, gp(100));
});
test("settle with no pledges is the buyer paying alone; pledges that cover everything leave the buyer nothing to pay", () => {
  assert.equal(settle({ qty: 1, price: gp(5), buyer: "ilya", pledges: {} }, { ilya: { gp: 5 } }).shares.ilya, gp(5));
  const r = settle({ qty: 1, price: gp(5), buyer: "ilya", pledges: { tor: gp(5) } }, { tor: { gp: 5 } });
  assert.ok(r.ok);
  assert.equal(r.shares.ilya, 0);
  assert.deepEqual(r.payers.at(-1).purse, {});
});
test("settle refuses a share that is too big and names whoever is short", () => {
  const r = settle(WAND, { ilya: { gp: 250 }, tor: { gp: 3 }, orla: { gp: 100 } }, names);
  assert.equal(r.ok, false);
  assert.equal(r.who, "tor");
  assert.equal(r.error, "Tor has 3 GP; the share is 100 GP.");
  const buyer = settle(WAND, { ilya: { gp: 150 }, tor: { gp: 100 }, orla: { gp: 100 } }, names);
  assert.equal(buyer.who, "ilya", "the buyer's own share is checked too");
  assert.match(buyer.error, /Ilya has 150 GP.*200 GP/);
  const none = settle(WAND, { ilya: { gp: 250 }, tor: { gp: 100 } }, names);
  assert.equal(none.who, "orla");
  assert.match(none.error, /Orla has no coins/);
});
test("settle refuses pledges that come to more than the price, and shares that are not shares", () => {
  const over = settle({ ...WAND, pledges: { tor: gp(300), orla: gp(150) } }, { ilya: { gp: 999 }, tor: { gp: 999 }, orla: { gp: 999 } }, names);
  assert.equal(over.ok, false);
  assert.match(over.error, /450 GP.*400 GP/);
  assert.equal(settle({ ...WAND, pledges: { tor: gp(500) } }, { tor: { gp: 999 } }).ok, false, "one pledge above the price");
  for (const bad of [0, -5, 1.5, "100", NaN, null]) assert.equal(settle({ ...WAND, pledges: { tor: bad } }, { ilya: { gp: 999 }, tor: { gp: 999 } }).ok, false, String(bad));
  const self = settle({ ...WAND, pledges: { ilya: gp(100) } }, { ilya: { gp: 999 } }, names);
  assert.equal(self.ok, false, "the buyer does not pledge");
  assert.equal(self.who, "ilya");
});
test("settle is all or nothing: a refusal carries no purses, and bad joints are refused", () => {
  const r = settle(WAND, { ilya: { gp: 250 }, tor: { gp: 3 }, orla: { gp: 100 } });
  assert.equal(r.ok, false);
  assert.equal(r.payers, undefined);
  assert.equal(r.purse, undefined);
  for (const j of [null, "x", { ...WAND, qty: 0 }, { ...WAND, qty: 1.5 }, { ...WAND, price: -1 }, { ...WAND, buyer: "" }, { ...WAND, pledges: [] }, { ...WAND, pledges: "x" }]) assert.equal(settle(j, { ilya: { gp: 999 } }).ok, false, JSON.stringify(j));
  assert.equal(settle(WAND, null).ok, false);
  assert.equal(settle(WAND, { ilya: { gp: -1 }, tor: { gp: 999 }, orla: { gp: 999 } }).ok, false);
});
test("settle reads purses by their own keys only", () => {
  const r = settle({ qty: 1, price: 100, buyer: "toString", pledges: {} }, {});
  assert.equal(r.ok, false);
  assert.equal(r.who, "toString");
});

// ---- the document
const doc = () => ({
  format: "hextable-market", v: 1, id: "port-goods", name: "Port city goods", version: 3,
  lists: [{ id: "standard", name: "Standard goods", lines: [
    { id: "longsword", item: "longsword" }, { id: "chain-mail", item: "chain-mail" }, { id: "potion-of-healing", item: "potion-of-healing" },
    { id: "rope", name: "Rope", price: "1 GP", kind: "gear", art: "icon:rope" }, { id: "rations", name: "Rations", price: "5 SP", kind: "gear" },
  ] }],
  stores: [{ id: "outfitter", name: "Outfitter", blurb: "Rope, steel and lamp oil, sold by the quay.", lists: ["standard"], markup: 100,
    buys: { equipment: 50, trade: 100, magic: 70 }, haggle: { step: 10, dc: 15, bonus: 5 },
    special: [{ id: "wand-of-magic-missiles", item: "wand-of-magic-missiles", qty: 1, hidden: true }], art: "a7Qm2xR4" }],
  loot: [{ id: "strongbox", name: "A strongbox", lines: [{ id: "dagger", item: "dagger", qty: 2 }], coins: { gp: 120, sp: 40 } }],
  assets: { a7Qm2xR4: { type: "image/webp", data: "AAAA" } },
  notes: "Prices for the harbour district.",
});
const lint = (d, e = env) => lintMarket(d, e);
const only = (d, re, e = env) => { const p = lint(d, e); assert.equal(p.length, 1, JSON.stringify(p)); assert.match(p[0], re); return p[0]; };

test("the spec's example pack lints clean, with and without content to check it against", () => {
  assert.deepEqual(lint(doc()), []);
  assert.deepEqual(lintMarket(doc()), []);
  assert.deepEqual(lint(JSON.parse(JSON.stringify(doc()))), []);
  const bare = doc(); delete bare.assets; delete bare.notes; bare.stores[0].art = "icon:shop";
  assert.deepEqual(lint(bare), []);
  assert.deepEqual(lint({ format: "hextable-market", v: 1, id: "empty", name: "Empty", version: 1 }), [], "lists, stores and loot may be left out");
});
test("the format, its version and the header are checked", () => {
  assert.match(lint(null)[0], /not a market document/);
  assert.match(lint([])[0], /not a market document/);
  assert.match(lint("x")[0], /not a market document/);
  assert.match(lint({ ...doc(), format: "hextable-map" })[0], /format is "hextable-map".*"hextable-market"/);
  assert.match(lint({ ...doc(), v: 2 })[0], /version 2 of the format.*reads version 1/);
  assert.match(lint({ ...doc(), v: undefined })[0], /format version/);
  assert.match(only({ ...doc(), id: "Port Goods" }, /^id: .*lower-case/), /id/);
  only({ ...doc(), name: "" }, /^name: /);
  only({ ...doc(), name: "x".repeat(61) }, /longer than 60/);
  for (const v of [0, 1.5, "3", -1, 1e7]) only({ ...doc(), version: v }, /^version: /);
  only({ ...doc(), notes: "x".repeat(301) }, /^notes: .*longer than 300/);
});
test("the key list is strict: an unknown field, a function, __proto__, constructor and prototype are refused", () => {
  assert.match(only({ ...doc(), extra: 1 }, /"extra" is not something/), /extra/);
  const s = doc(); s.stores[0].discount = 10;
  assert.match(only(s, /^stores\/outfitter: "discount"/), /discount/);
  const l = doc(); l.lists[0].lines[0].cost = "1 GP";
  only(l, /^lists\/standard\/lines\/longsword: "cost"/);
  const f = doc(); f.stores[0].markup = () => 100;
  only(f, /^stores\/outfitter\/markup: /);
  const fn = doc(); fn.lists[0].lines[3].price = () => "1 GP";
  only(fn, /price/);
  const sym = doc(); sym.notes = Symbol("x");
  assert.ok(lint(sym).length >= 1);
  for (const k of ["__proto__", "constructor", "prototype"]) {
    const d = JSON.parse(JSON.stringify(doc()).replace(/^\{/, `{"${k}":{"x":1},`));
    assert.ok(lint(d).some((p) => p.includes(`"${k}" is not allowed`)), k);
    const inner = JSON.parse(JSON.stringify(doc()).replace('"markup":100', `"markup":100,"${k}":1`));
    assert.ok(lint(inner).some((p) => p.includes(`"${k}" is not allowed`)), `inner ${k}`);
  }
  assert.equal(Object.getPrototypeOf(doc().stores[0]), Object.prototype);
  const odd = doc(); odd.stores[0] = Object.create({ inherited: 1 });
  assert.ok(lint(odd).some((p) => /is not a store/.test(p)));
  const cyc = doc(); cyc.self = cyc;
  assert.deepEqual(lint(cyc), ["It is not plain data."]);
});
test("ids are kebab and unique: lists among lists, stores among stores, line ids across lists and specials together", () => {
  const dup = doc(); dup.lists.push({ id: "standard", name: "Again", lines: [] });
  only(dup, /^lists\/standard: id is used twice\.$/);
  const dupStore = doc(); dupStore.stores.push({ ...dupStore.stores[0], special: [], art: undefined }); delete dupStore.stores[1].art;
  only(dupStore, /^stores\/outfitter: id is used twice\.$/);
  const clash = doc(); clash.stores[0].special[0].id = "rope";
  only(clash, /^stores\/outfitter\/special\/rope: id is used twice in the pack/);
  const clash2 = doc(); clash2.stores.push({ id: "second", name: "Second", special: [{ id: "wand-of-magic-missiles", item: "wand-of-magic-missiles" }] });
  only(clash2, /^stores\/second\/special\/wand-of-magic-missiles: id is used twice in the pack/);
  const inList = doc(); inList.lists[0].lines.push({ id: "rope", name: "Rope", price: "1 GP" });
  only(inList, /^lists\/standard\/lines\/rope: id is used twice/);
  const lootClash = doc(); lootClash.loot[0].lines.push({ id: "dagger", item: "dagger", qty: 1 });
  only(lootClash, /^loot\/strongbox\/lines\/dagger: id is used twice in this package/);
  const lootOk = doc(); lootOk.loot[0].lines[0].id = "rope";
  assert.deepEqual(lint(lootOk), [], "loot ids are their own space");
  for (const bad of ["Rope", "rope_1", "-rope", "rope-", "ro pe", "", 5, null]) { const d = doc(); d.lists[0].lines[3].id = bad; assert.ok(lint(d).length >= 1, String(bad)); }
});
test("the sentence names the first problem in the linter's style", () => {
  const d = doc(); d.stores[0].special[0] = { id: "wand", item: "wand-of-magic-misiles", qty: 1, hidden: true };
  assert.equal(lint(d)[0], 'stores/outfitter/special/wand: no such item "wand-of-magic-misiles"');
  const e = doc(); e.lists[0].lines[0].item = "longsworrd";
  assert.equal(lint(e)[0], 'lists/standard/lines/longsword: no such item "longsworrd"');
  const noEnv = doc(); noEnv.lists[0].lines[0].item = "longsworrd";
  assert.deepEqual(lintMarket(noEnv), [], "no content to check against, no such check");
});
test("an item must be one of the table's content; a line needs an item or a name", () => {
  const d = doc(); d.lists[0].lines.push({ id: "empty" });
  only(d, /^lists\/standard\/lines\/empty: needs an item or a name/);
  const t = doc(); t.lists[0].lines[0].item = 7;
  assert.ok(lint(t).some((p) => /item must be lower-case/.test(p)));
  const n = doc(); n.lists[0].lines[0].name = "Sword of the Quay";
  assert.deepEqual(lint(n), [], "a shown name over a pack item is allowed");
});
test("prices parse and are in range", () => {
  for (const [price, re] of [["15", /not a price/], ["fifteen GP", /not a price/], ["1.5 GP", /not a price/], ["0 GP", /out of range/], ["10,000,001 GP", /out of range/], ["10000001 GP", /out of range/], [15, /not a price/]]) {
    const d = doc(); d.lists[0].lines[3].price = price;
    only(d, re);
  }
  for (const price of ["1 CP", "10,000,000 GP", "1,500 GP", "999 PP", "3 ep"]) { const d = doc(); d.lists[0].lines[3].price = price; assert.deepEqual(lint(d), [], price); }
  const named = doc(); delete named.lists[0].lines[3].price;
  only(named, /^lists\/standard\/lines\/rope: a named line needs a price/);
});
test("qty is a whole number from 1 to 9,999; a list line has none; a loot line needs one", () => {
  for (const q of [0, -1, 1.5, 10000, "2", null]) { const d = doc(); d.stores[0].special[0].qty = q; only(d, /qty must be a whole number from 1 to 9999/); }
  for (const q of [1, 9999]) { const d = doc(); d.stores[0].special[0].qty = q; assert.deepEqual(lint(d), []); }
  const list = doc(); list.lists[0].lines[0].qty = 5;
  only(list, /a list line has no qty/);
  const loot = doc(); delete loot.loot[0].lines[0].qty;
  only(loot, /a loot line needs a qty/);
  const lp = doc(); lp.loot[0].lines[0].price = "2 GP";
  only(lp, /a loot line has no price/);
});
test("a magic item that needs a base or a spell has it, and one that does not need it refuses it", () => {
  const w = doc(); w.stores[0].special.push({ id: "plus-one", item: "weapon-plus-1", qty: 1 });
  only(w, /^stores\/outfitter\/special\/plus-one: Weapon, \+1 needs a base/);
  w.stores[0].special[1].base = "longsword";
  assert.deepEqual(lint(w), []);
  w.stores[0].special[1].base = "potion-of-healing";
  only(w, /base "potion-of-healing" is not a weapon or armour/);
  w.stores[0].special[1].base = "nothing";
  only(w, /base "nothing" is not a weapon or armour/);
  const s = doc(); s.stores[0].special.push({ id: "scroll", item: "spell-scroll", qty: 1 });
  only(s, /Spell Scroll needs a spell/);
  s.stores[0].special[1].spell = "fireball";
  assert.deepEqual(lint(s), []);
  s.stores[0].special[1].spell = "firebal";
  only(s, /no such spell "firebal"/);
  const x = doc(); x.lists[0].lines[0].base = "dagger";
  only(x, /Longsword does not take a base/);
  const y = doc(); y.lists[0].lines[0].spell = "fireball";
  only(y, /does not take a spell/);
  const z = doc(); z.lists[0].lines[3].base = "dagger";
  only(z, /base goes with an item/);
  const r = doc(); r.stores[0].special.push({ id: "resist", item: "armor-of-resistance", base: "chain-mail", type: "fire", qty: 1 });
  assert.deepEqual(lint(r), []);
  const t = doc(); t.stores[0].special.push({ id: "wand2", item: "wand-of-magic-missiles", type: "fire", qty: 1 });
  only(t, /does not take a type/);
});
test("an Artifact is priceless: it needs a price or has to be left out", () => {
  const d = doc(); d.stores[0].special.push({ id: "relic", item: "the-artifact", qty: 1 });
  only(d, /^stores\/outfitter\/special\/relic: An Artifact is priceless: give it a price or leave it out\.$/);
  d.stores[0].special[1].price = "50,000 GP";
  assert.deepEqual(lint(d), []);
  const loot = doc(); loot.loot[0].lines.push({ id: "relic", item: "the-artifact", qty: 1 });
  assert.deepEqual(lint(loot), [], "found, not bought");
});
test("an item the pack has no price for must be given one", () => {
  const e = { ...env, rarityValue: () => null };
  const d = doc(); d.lists[0].lines = [{ id: "potion", item: "potion-of-healing" }]; d.stores[0].special = [];
  only(d, /^lists\/standard\/lines\/potion: the table has no price for Potion of Healing: give it a price/, e);
  d.lists[0].lines[0].price = "50 GP";
  assert.deepEqual(lint(d, e), []);
});
test("kind is derived for a pack item and one of the six for named goods", () => {
  const d = doc(); d.lists[0].lines[0].kind = "weapon";
  only(d, /kind is worked out for a pack item/);
  for (const k of ["gear", "trade", "valuable", "magic", "weapon", "armour"]) { const n = doc(); n.lists[0].lines[3].kind = k; assert.deepEqual(lint(n), [], k); }
  const bad = doc(); bad.lists[0].lines[3].kind = "food";
  only(bad, /kind "food" is not one of/);
});
test("hidden belongs on a special", () => {
  const d = doc(); d.lists[0].lines[0].hidden = true;
  only(d, /only a special can be hidden/);
  const f = doc(); f.stores[0].special[0].hidden = false;
  only(f, /hidden is true or left out/);
});
test("stores: their lists, markup, buys and haggle", () => {
  const nl = doc(); nl.stores[0].lists = ["standard", "nope"];
  only(nl, /^stores\/outfitter\/lists: names no list of the pack: "nope"/);
  const twice = doc(); twice.stores[0].lists = ["standard", "standard"];
  only(twice, /names "standard" twice/);
  const notList = doc(); notList.stores[0].lists = "standard";
  only(notList, /lists must be a list/);
  for (const m of [0, 9, 1001, 120.5, "120"]) { const d = doc(); d.stores[0].markup = m; only(d, /^stores\/outfitter\/markup: /); }
  for (const m of [10, 120, 1000]) { const d = doc(); d.stores[0].markup = m; assert.deepEqual(lint(d), []); }
  for (const [k, v] of [["magic", 101], ["magic", -1], ["trade", 1.5], ["equipment", "50"]]) { const d = doc(); d.stores[0].buys[k] = v; only(d, /percent of value from 0 to 100/); }
  const nul = doc(); nul.stores[0].buys.magic = null; nul.stores[0].buys.equipment = null;
  assert.deepEqual(lint(nul), [], "null: no offer of its own");
  const bk = doc(); bk.stores[0].buys.armour = 50;
  only(bk, /"armour" is not something this has; it has equipment, trade, magic/);
  for (const [k, v] of [["step", 51], ["step", -1], ["dc", 0], ["dc", 41], ["bonus", 26], ["bonus", 2.5]]) { const d = doc(); d.stores[0].haggle[k] = v; only(d, new RegExp(`${k} must be a whole number`)); }
  const hk = doc(); hk.stores[0].haggle.roleplay = 5;
  only(hk, /"roleplay" is not something this has/);
  const zero = doc(); zero.stores[0].haggle = { step: 0, bonus: 0 };
  assert.deepEqual(lint(zero), []);
});
test("loot packages: lines, coins and art", () => {
  for (const [k, v] of [["gp", -1], ["gp", 10000001], ["sp", 1.5], ["gp", "5"]]) { const d = doc(); d.loot[0].coins[k] = v; only(d, /^loot\/strongbox\/coins: /); }
  const nc = doc(); nc.loot[0].coins.sc = 3;
  only(nc, /"sc" is not a coin/);
  const ok = doc(); ok.loot[0].coins = { cp: 0, pp: 10000000 };
  assert.deepEqual(lint(ok), []);
  const empty = doc(); empty.loot[0].lines = []; delete empty.loot[0].coins;
  assert.deepEqual(lint(empty), [], "an empty package says Empty and stays");
});
test("limits: lists, lines, stores, specials, loot", () => {
  const L = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const lists = doc(); lists.lists = L(21, (i) => ({ id: `l${i}`, name: "L", lines: [] })); lists.stores = [];
  only(lists, /^lists: lists has more than 20/);
  const lines = doc(); lines.lists[0].lines = L(301, (i) => ({ id: `r${i}`, name: "R", price: "1 CP" })); lines.stores[0].special = []; lines.loot = [];
  only(lines, /^lists\/standard\/lines: lines has more than 300/);
  const exact = doc(); exact.lists[0].lines = L(300, (i) => ({ id: `r${i}`, name: "R", price: "1 CP" }));
  assert.deepEqual(lint(exact), []);
  const stores = doc(); stores.stores = L(31, (i) => ({ id: `s${i}`, name: "S" }));
  only(stores, /^stores: stores has more than 30/);
  const sp = doc(); sp.stores[0].special = L(41, (i) => ({ id: `sp${i}`, name: "S", price: "1 CP", qty: 1 }));
  only(sp, /^stores\/outfitter\/special: special lines has more than 40/);
  const loot = doc(); loot.loot = L(31, (i) => ({ id: `p${i}`, name: "P" }));
  only(loot, /^loot: loot packages has more than 30/);
  const ll = doc(); ll.loot[0].lines = L(101, (i) => ({ id: `d${i}`, name: "D", qty: 1 }));
  only(ll, /^loot\/strongbox\/lines: lines has more than 100/);
  assert.equal(MARKET_LIMITS.lineBytes, 131072);
});
test("names are 60 letters, blurbs and notes 300, a line's note 120, and no control characters", () => {
  const n = doc(); n.stores[0].name = "x".repeat(61);
  only(n, /^stores\/outfitter: name is longer than 60/);
  const ok = doc(); ok.stores[0].name = "x".repeat(60); ok.stores[0].blurb = "y".repeat(300);
  assert.deepEqual(lint(ok), []);
  const b = doc(); b.stores[0].blurb = "y".repeat(301);
  only(b, /blurb is longer than 300/);
  const note = doc(); note.lists[0].lines[0].note = "z".repeat(121);
  only(note, /note is longer than 120/);
  for (const c of ["\u0000", "\n", "\t", "\u007f", "\u0085", "\u001b[31m"]) { const d = doc(); d.stores[0].name = `Out${c}fitter`; only(d, /name has a control character/); }
  const blank = doc(); blank.stores[0].name = "   ";
  only(blank, /name must be text that is not empty/);
  const num = doc(); num.stores[0].name = 5;
  only(num, /name must be text/);
  const loot = doc(); loot.loot[0].name = "a\u0000b";
  only(loot, /^loot\/strongbox: name has a control character/);
  const lname = doc(); lname.lists[0].lines[3].name = "x".repeat(61);
  only(lname, /name is longer than 60/);
});
test("art is a picture of the document or an icon, and the pictures are images within the limit", () => {
  const missing = doc(); missing.stores[0].art = "zzzzzzzz";
  only(missing, /art "zzzzzzzz" is not among the document's pictures/);
  const none = doc(); delete none.assets;
  only(none, /^stores\/outfitter: art "a7Qm2xR4" is not among/);
  for (const a of ["icon:", "icon:Rope", "icon:ro pe", "http://x.example/a.png", "../a.png", "a b", 5]) { const d = doc(); d.lists[0].lines[3].art = a; assert.ok(lint(d).length >= 1, String(a)); }
  const icon = doc(); icon.lists[0].lines[3].art = "icon:magic-ring";
  assert.deepEqual(lint(icon), []);
  const type = doc(); type.assets.a7Qm2xR4.type = "image/svg+xml";
  only(type, /^assets\/a7Qm2xR4: has type "image\/svg\+xml"/);
  const b64 = doc(); b64.assets.a7Qm2xR4.data = "not base64!";
  only(b64, /not base64/);
  const key = doc(); key.assets.a7Qm2xR4.url = "x";
  only(key, /"url" is not something this has/);
  const badId = doc(); badId.assets = { "../x": { type: "image/png", data: "AAAA" } }; badId.stores[0].art = undefined; delete badId.stores[0].art;
  only(badId, /is not a picture id/);
  const big = doc(); big.assets.a7Qm2xR4.data = "A".repeat(Math.ceil((1024 * 1024 + 4) / 3) * 4);
  assert.match(only(big, /The pictures take/), /the most is 1024 KB/);
  const fine = doc(); fine.assets.a7Qm2xR4.data = "A".repeat(1398100);                                       // 1,048,575 bytes
  assert.deepEqual(lint(fine), [], "pictures are counted apart from the 128 KB of lines");
});
test("the lines and stores together are at most 128 KB without pictures", () => {
  const d = doc();
  d.lists[0].lines = Array.from({ length: 300 }, (_, i) => ({ id: `row-${i}`, name: "N".repeat(60), price: "1 CP", note: "m".repeat(120) }));
  d.lists.push({ id: "second", name: "Second", lines: Array.from({ length: 300 }, (_, i) => ({ id: `other-${i}`, name: "N".repeat(60), price: "1 CP", note: "m".repeat(120) })) });
  assert.ok(lint(d).some((p) => /take \d+ KB; the most is 128 KB/.test(p)));
});
test("only the first problems are listed, with one line to say there are more", () => {
  const d = doc(); d.lists[0].lines = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, name: "R", price: "free" }));
  const p = lint(d);
  assert.equal(p.length, MARKET_LIMITS.problems + 1);
  assert.equal(p.at(-1), "There are more problems than these.");
});
test("a bad document returns sentences and throws nothing", () => {
  for (const d of [{ format: "hextable-market", v: 1, id: 5, name: [], version: {}, lists: 3, stores: "x", loot: null, assets: [], notes: {} }, { format: "hextable-market", v: 1, lists: [null, 1, "x", []], stores: [null], loot: [[]] }, { format: "hextable-market", v: 1, lists: [{ lines: [null, 3] }] }]) {
    const p = lint(d);
    assert.ok(Array.isArray(p) && p.length > 0 && p.every((s) => typeof s === "string"), JSON.stringify(d));
  }
});

// ---- migration
test("migrateMarket fills the lists and leaves a document it cannot read for the linter", () => {
  const m = migrateMarket({ format: "hextable-market", v: 1, id: "a", name: "A", version: 1 });
  assert.deepEqual([m.lists, m.stores, m.loot], [[], [], []]);
  assert.deepEqual(lint(m), []);
  const d = doc();
  assert.deepEqual(migrateMarket(d), d, "a current document is unchanged");
  assert.deepEqual(migrateMarket(migrateMarket(d)), d, "and any number of times");
  assert.notEqual(migrateMarket(d), d, "a copy, not the document given");
  const newer = { format: "hextable-market", v: 2, id: "a" };
  assert.equal(migrateMarket(newer), newer);
  assert.match(lint(newer)[0], /version 2 of the format/);
  for (const x of [null, undefined, 5, "x", []]) assert.equal(migrateMarket(x), x);
  const tmpl = doc(); tmpl.stores[0].buys = { equipment: 50, trade: 100 };
  assert.equal(migrateMarket(tmpl).stores[0].buys.magic, undefined, "defaults are read, not written");
  assert.equal(buysOf(migrateMarket(tmpl).stores[0].buys).magic, 70);
});
