// The four pregenerated characters (content/srd52/pregens.js), as sheets of choices (derive.js).
export const SHEETS = {
  fighter: { name: "Brenna", class: "fighter", level: 1, abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
    skills: ["perception", "survival"], extraSkills: ["athletics", "intimidation"], choices: { "fighting-style": "archery" },
    armour: "chain-mail", shield: true, weapons: ["longsword", "javelin"], gear: ["Chain Mail", "Shield", "Longsword", "4 Javelins", "Explorer's Pack"] },
  rogue: { name: "Pip", class: "rogue", level: 1, abilities: { str: 8, dex: 17, con: 14, int: 10, wis: 12, cha: 14 },
    skills: ["acrobatics", "deception", "investigation", "perception"], extraSkills: ["sleight-of-hand", "stealth"], expertise: ["sleight-of-hand", "stealth"],
    armour: "leather-armor", weapons: ["shortsword", "shortbow"], gear: ["Leather Armor", "Shortsword", "Shortbow", "20 Arrows", "Thieves' Tools"] },
  cleric: { name: "Odessa", class: "cleric", level: 1, abilities: { str: 14, dex: 10, con: 14, int: 8, wis: 17, cha: 12 },
    skills: ["medicine", "persuasion"], extraSkills: ["insight", "religion"], choices: { "divine-order": "protector" },
    armour: "chain-mail", shield: true, weapons: ["mace"], spells: ["sacred-flame", "cure-wounds", "healing-word", "shield-of-faith"], gear: ["Chain Mail", "Shield", "Mace", "Holy Symbol", "Priest's Pack"] },
  wizard: { name: "Tavin", class: "wizard", level: 1, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 },
    skills: ["insight", "investigation"], extraSkills: ["arcana", "history"], weapons: ["dagger"], spells: ["fire-bolt", "magic-missile", "burning-hands"],
    gear: ["Dagger", "Arcane Focus", "Spellbook", "Scholar's Pack"] },
};
