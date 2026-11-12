// Level 1 pregenerated characters built from SRD 5.2.1 options. Data only.
// These are finished records with their numbers worked out by hand, the same as a character
// typed in through quick entry. They become built sheets when derive() exists (task R7).
export const pregens = [
  {
    id: "fighter", name: "Brenna", cls: "Fighter", level: 1, ac: 18, hp: 12, speed: 30, prof: 2,
    abil: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
    saveProf: ["str", "con"], features: { secondWind: 2 },
    skills: ["athletics", "intimidation", "perception", "survival"],
    attacks: [
      { id: "longsword", name: "Longsword", type: "melee", bonus: 5, damage: "1d8+3", dtype: "slashing", reach: 5 },
      { id: "javelin", name: "Javelin", type: "ranged", bonus: 5, damage: "1d6+3", dtype: "piercing", range: [30, 120] },
    ],
    gear: ["Chain Mail", "Shield", "Longsword", "4 Javelins", "Explorer's Pack"],
  },
  {
    id: "rogue", name: "Pip", cls: "Rogue", level: 1, ac: 14, hp: 10, speed: 30, prof: 2,
    abil: { str: 8, dex: 17, con: 14, int: 10, wis: 12, cha: 14 },
    saveProf: ["dex", "int"], features: { sneak: "1d6" },
    skills: ["acrobatics", "deception", "investigation", "perception", "sleight-of-hand", "stealth"], expertise: ["sleight-of-hand", "stealth"], tools: ["thieves-tools"],
    attacks: [
      { id: "shortsword", name: "Shortsword", type: "melee", bonus: 5, damage: "1d6+3", dtype: "piercing", reach: 5, finesse: true },
      { id: "shortbow", name: "Shortbow", type: "ranged", bonus: 5, damage: "1d6+3", dtype: "piercing", range: [80, 320] },
    ],
    gear: ["Leather Armor", "Shortsword", "Shortbow", "20 Arrows", "Thieves' Tools"],
  },
  {
    id: "cleric", name: "Odessa", cls: "Cleric", level: 1, ac: 18, hp: 10, speed: 30, prof: 2,
    abil: { str: 14, dex: 10, con: 14, int: 8, wis: 17, cha: 12 },
    saveProf: ["wis", "cha"], skills: ["insight", "medicine", "persuasion", "religion"],
    castAbil: "wis", spells: ["sacred-flame", "cure-wounds", "healing-word", "shield-of-faith"], slots: { 1: 2 },
    attacks: [{ id: "mace", name: "Mace", type: "melee", bonus: 4, damage: "1d6+2", dtype: "bludgeoning", reach: 5 }],
    gear: ["Chain Mail", "Shield", "Mace", "Holy Symbol", "Priest's Pack"],
  },
  {
    id: "wizard", name: "Tavin", cls: "Wizard", level: 1, ac: 12, hp: 8, speed: 30, prof: 2,
    abil: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 },
    saveProf: ["int", "wis"], skills: ["arcana", "history", "insight", "investigation"],
    castAbil: "int", spells: ["fire-bolt", "magic-missile", "burning-hands"], slots: { 1: 2 },
    attacks: [{ id: "dagger", name: "Dagger", type: "melee", bonus: 4, damage: "1d4+2", dtype: "piercing", reach: 5, finesse: true }],
    gear: ["Dagger", "Arcane Focus", "Spellbook", "Scholar's Pack"],
  },
];
