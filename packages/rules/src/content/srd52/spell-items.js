// Things a spell makes, which exist only while that spell lasts. They are items of the pack (a character carries them on its sheet, hands them over, drops them
// and uses them like any other), but they are not magic items to be found or bought, so they are kept out of `items` (magic-items.js), whose count the guides
// quote. The engine reads them through CONTENT.items. A spell makes them with a `grant` step, which marks each one as the spell's own; they vanish when it ends.
// Format: the item format of magic-items.js. Design: docs/specs/rules-expansion.md, "Build notes: Goodberry".
export const spellItems = [
  { id: "goodberry", name: "Goodberry", category: "potion", rarity: "common", wear: "carried", tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "A berry the Goodberry spell made. Eating it takes a Bonus Action and restores 1 Hit Point, and it feeds a creature for a day. It vanishes when the spell ends.",
    activate: [{ name: "Eat", time: "bonus", consumed: true, effects: [{ heal: "+1" }] }] },
];
