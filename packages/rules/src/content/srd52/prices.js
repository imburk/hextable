// What things are worth, from the SRD 5.2.1: the Coin Values table and the weight of a coin (Equipment, "Coins"), the
// rule for selling equipment (Equipment, "Selling Equipment"), the Magic Item Rarities and Values table with its
// footnote and the rule about a magic item built on a priced item (Magic Items, "Magic Item Rarity"), and the Spell
// Scroll Costs table (Equipment, "Scribing Spell Scrolls"). Data only (format: content/schema.js, the `prices` check in
// lintPack). Each number was compared with the SRD text; docs/specs/shops.md, "Build notes: P1", says where.
//
// Money is counted in copper pieces (`cp`, whole numbers) and in gold pieces (`gp`, as the SRD's tables print them).
// The SRD gives no price for a magic item beyond its rarity, and none for a Spell Scroll beyond its level; a table's
// own numbers (what a store pays for a magic item, how far a haggle moves a price) are not the SRD's and are not here.
//
//   coins       the five coins and what each is worth in copper pieces (CP 1, SP 1/10 GP, EP 1/2 GP, GP 1, PP 10)
//   perPound    how many coins weigh a pound
//   selling     percent of its cost that a thing fetches when sold, by kind: equipment (weapons, armour, gear) half;
//               trade goods and valuables (gems, art objects) their full value
//   rarities    a magic item's value in GP by rarity (`gp: null` is priceless: an Artifact). An item whose rarity is
//               "varies" has no value here, except the Spell Scroll, which has the table below
//   consumableDivisor
//               a consumable magic item other than a Spell Scroll is worth its value divided by this ("halve")
//   scrollMultiple
//               a Spell Scroll is worth this many times what it costs to scribe
//   addsBaseCost
//               true: a magic item that incorporates an item with a purchase cost (a weapon, a suit of armour) is worth
//               its value plus that cost
//   scrolls     what it costs in GP to scribe a Spell Scroll, by the level of its spell (0 is a cantrip)
export const prices = {
  id: "srd-prices",
  name: "Prices",
  source: "SRD 5.2.1",
  checked: true,
  text: "Coin values, the selling rule, magic item values by rarity and what a Spell Scroll costs to scribe.",
  coins: [
    { id: "cp", name: "Copper Piece", cp: 1 },
    { id: "sp", name: "Silver Piece", cp: 10 },
    { id: "ep", name: "Electrum Piece", cp: 50 },
    { id: "gp", name: "Gold Piece", cp: 100 },
    { id: "pp", name: "Platinum Piece", cp: 1000 }
  ],
  perPound: 50,
  selling: { equipment: 50, trade: 100, valuable: 100 },
  rarities: [
    { id: "common", name: "Common", gp: 100 },
    { id: "uncommon", name: "Uncommon", gp: 400 },
    { id: "rare", name: "Rare", gp: 4000 },
    { id: "very-rare", name: "Very Rare", gp: 40000 },
    { id: "legendary", name: "Legendary", gp: 200000 },
    { id: "artifact", name: "Artifact", gp: null }
  ],
  consumableDivisor: 2,
  scrollMultiple: 2,
  addsBaseCost: true,
  scrolls: [
    { level: 0, gp: 15 },
    { level: 1, gp: 25 },
    { level: 2, gp: 100 },
    { level: 3, gp: 150 },
    { level: 4, gp: 1000 },
    { level: 5, gp: 1500 },
    { level: 6, gp: 10000 },
    { level: 7, gp: 12500 },
    { level: 8, gp: 15000 },
    { level: 9, gp: 50000 }
  ]
};
