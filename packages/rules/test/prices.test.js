// Shops, task P1 (docs/specs/shops.md): the SRD's prices as data (content/srd52/prices.js). The numbers below are the SRD's own,
// typed here a second time from reference/srd52/srd52-flow.txt (line numbers in the spec's "Build notes: P1"), so the data file
// and this test must both be wrong in the same way to pass. The price sums use the data and the pack's items, with a small
// helper of their own: the market's `listPrice` is task P2.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack, lintPrices, RARITIES } from "../src/content/schema.js";

const [srd] = PACKS;
const T = CONTENT.prices;
const clone = (x) => structuredClone(x);
const lint = (change) => { const t = clone(T); change(t); const out = []; lintPrices(t, (m) => out.push(m)); return out.join("\n"); };

// "1,500 GP" -> copper pieces, by the coins of the table.
const worth = Object.fromEntries(T.coins.map((c) => [c.id.toUpperCase(), c.cp]));
const costCp = (s) => { const m = /^([\d,]+) (CP|SP|EP|GP|PP)$/.exec(s); assert.ok(m, `a cost reads "15 GP": ${s}`); return Number(m[1].replace(/,/g, "")) * worth[m[2]]; };
const baseCost = (id) => costCp((CONTENT.weapons[id] ?? CONTENT.armour[id]).cost) / 100;      // in GP

// The value of a magic item in GP by the rules of the data: rarity, halved if it is consumable (not a Spell Scroll), a Spell Scroll at
// double its scribing cost, plus the cost of a base item. null when the SRD gives none.
function value(id, { base, level } = {}) {
  const it = CONTENT.items[id];
  let gp;
  if (id === "spell-scroll") gp = T.scrolls[level].gp * T.scrollMultiple;
  else {
    const r = T.rarities.find((x) => x.id === it.rarity);
    if (!r || r.gp === null) return null;
    gp = it.activate?.some((u) => u.consumed) ? r.gp / T.consumableDivisor : r.gp;
  }
  return base && T.addsBaseCost ? gp + baseCost(base) : gp;
}

test("the SRD pack carries the prices, they pass the linter and are marked checked", () => {
  assert.equal(srd.prices, T);
  assert.equal(T.checked, true);
  assert.deepEqual(lintPack(srd), []);
  const out = []; lintPrices(T, (m) => out.push(m));
  assert.deepEqual(out, []);
});

test("Coin Values: CP 1/100 GP, SP 1/10, EP 1/2, GP 1, PP 10; fifty coins to the pound", () => {
  const gp = { cp: 1 / 100, sp: 1 / 10, ep: 1 / 2, gp: 1, pp: 10 };
  assert.deepEqual(T.coins.map((c) => c.id), ["cp", "sp", "ep", "gp", "pp"]);
  for (const c of T.coins) assert.equal(c.cp, Math.round(gp[c.id] * 100), c.id);
  assert.deepEqual(T.coins.map((c) => c.name), ["Copper Piece", "Silver Piece", "Electrum Piece", "Gold Piece", "Platinum Piece"]);
  assert.equal(T.perPound, 50);
});

test("Selling Equipment: equipment half its cost, trade goods and valuables their full value", () => {
  assert.deepEqual(T.selling, { equipment: 50, trade: 100, valuable: 100 });
});

test("the owner's 70 percent for magic items is not the SRD's, and is not in the SRD's data", () => {
  assert.equal(JSON.stringify(T).includes("70"), false);
  assert.equal("magic" in T.selling, false);
});

test("Magic Item Rarities and Values", () => {
  assert.deepEqual(T.rarities.map((r) => [r.id, r.gp]), [
    ["common", 100], ["uncommon", 400], ["rare", 4000], ["very-rare", 40000], ["legendary", 200000], ["artifact", null]]);
  assert.deepEqual(T.rarities.map((r) => r.name), ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]);
  assert.deepEqual(T.rarities.map((r) => r.id), RARITIES.filter((r) => r !== "varies"));
  assert.equal(T.consumableDivisor, 2);          // "Halve the value for a consumable item other than a Spell Scroll"
  assert.equal(T.scrollMultiple, 2);             // "double what it costs to scribe the scroll"
  assert.equal(T.addsBaseCost, true);            // "add that item's cost to the magic item's value"
});

test("Spell Scroll Costs: cantrip 15 GP, then 25, 100, 150, 1,000, 1,500, 10,000, 12,500, 15,000, 50,000", () => {
  assert.deepEqual(T.scrolls.map((r) => r.level), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(T.scrolls.map((r) => r.gp), [15, 25, 100, 150, 1000, 1500, 10000, 12500, 15000, 50000]);
});

test("the SRD's three worked prices: Potion of Healing 50 GP, Wand of Magic Missiles 400 GP, +1 Armor (Plate Armor) 5,500 GP", () => {
  assert.equal(value("potion-of-healing"), 50);
  assert.equal(value("wand-of-magic-missiles"), 400);
  assert.equal(value("armor-plus-1", { base: "plate-armor" }), 5500);     // 4,000 + 1,500, the SRD's own example
  assert.equal(CONTENT.items["armor-plus-1"].rarity, "rare");
  assert.equal(baseCost("plate-armor"), 1500);
});

test("the Potion of Healing agrees with the Adventuring Gear table, which prints 50 GP", () => {
  const printed = 50;                                                     // "Potion of Healing (50 GP)", srd52-flow.txt line 22486
  assert.equal(value("potion-of-healing"), printed);
});

test("more sums by the same rules", () => {
  assert.equal(value("weapon-plus-1", { base: "longsword" }), 415);                // Uncommon 400 + Longsword 15
  assert.equal(value("potion-of-healing-greater"), 200);                           // Uncommon, consumable: 400 halved
  assert.equal(value("potion-of-giant-strength-storm"), 100000);                   // Legendary, consumable: 200,000 halved
  assert.equal(value("spell-scroll", { level: 0 }), 30);
  assert.equal(value("spell-scroll", { level: 3 }), 300);                          // double 150
  assert.equal(value("spell-scroll", { level: 9 }), 100000);
  assert.equal(value("staff-of-striking"), 40000);                                 // Very Rare, not consumable
});

test("every item of the pack has a value, but the ones whose rarity varies (and the Spell Scroll, by its level)", () => {
  const none = Object.values(CONTENT.items).filter((it) => it.id !== "spell-scroll" && value(it.id, {}) === null).map((it) => it.id);
  assert.deepEqual(none.sort(), ["feather-token"]);
  for (const it of Object.values(CONTENT.items)) {
    if (it.id === "feather-token") continue;
    const v = value(it.id, { level: 1 });
    assert.ok(Number.isInteger(v) && v > 0, `${it.id}: ${v}`);
  }
});

test("every weapon and armour cost reads in the coins of the table", () => {
  for (const e of [...srd.weapons, ...srd.armour]) assert.ok(costCp(e.cost) > 0, e.id);
  assert.equal(baseCost("longsword"), 15);
  assert.equal(costCp(CONTENT.weapons.dart.cost), 5);                     // 5 CP
});

test("the linter refuses a prices table that is wrong", () => {
  const cases = [
    [(t) => { t.coins.reverse(); }, /coins are cp, sp, ep, gp, pp, in that order/],
    [(t) => { t.coins[1].cp = 11; t.coins[2].cp = 10; }, /rise/],
    [(t) => { t.coins[3].cp = 101; t.coins[4].cp = 1010; }, /Gold Piece is the game's main coin/],
    [(t) => { t.coins[0].cp = 0.5; }, /whole number/],
    [(t) => { t.perPound = 0; }, /perPound/],
    [(t) => { t.selling.magic = 70; }, /selling is/],
    [(t) => { t.selling.equipment = 150; }, /selling is/],
    [(t) => { t.rarities.pop(); }, /rarities are/],
    [(t) => { t.rarities[5].gp = 1000000; }, /priceless/],
    [(t) => { t.rarities[0].gp = null; }, /whole number above 0, except the Artifact/],
    [(t) => { t.rarities[2].gp = 100; }, /values by rarity must rise/],
    [(t) => { t.rarities[1].gp = 400.5; }, /whole number/],
    [(t) => { t.consumableDivisor = 1; }, /consumableDivisor/],
    [(t) => { t.scrollMultiple = "2"; }, /scrollMultiple/],
    [(t) => { t.addsBaseCost = "yes"; }, /addsBaseCost/],
    [(t) => { t.scrolls.pop(); }, /levels 0/],
    [(t) => { t.scrolls[4].gp = 100; }, /Spell Scroll costs must rise/],
    [(t) => { t.scrolls[2].gp = -5; }, /whole number above 0/],
    [(t) => { delete t.checked; }, /checked/],
    [(t) => { t.sneaky = 1; }, /"sneaky" is not something/],
    [(t) => { t.sneaky = () => 1; }, /data only/],
  ];
  for (const [change, re] of cases) assert.match(lint(change), re, String(change));
  const out = []; lintPrices(null, (m) => out.push(m)); assert.equal(out.length, 1);
  assert.match(lintPack({ ...srd, prices: { ...clone(T), coins: [] } }).join("\n"), /^prices: coins are/m);
});

test("a homebrew pack cannot carry prices: the prices are the SRD's", () => {
  const doc = { format: "hextable-pack", v: 1, pack: { id: "my-pack", name: "Mine", license: "mine", attribution: "me" }, prices: clone(T) };
  assert.match(lintPack(doc, { strict: true }).join("\n"), /"prices" cannot be homebrew/);
  delete doc.prices;
  assert.deepEqual(lintPack(doc, { strict: true }), []);
});
