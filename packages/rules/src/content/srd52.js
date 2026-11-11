// Starter rules content, hand-entered from the System Reference Document 5.2.1.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1")
// by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1
// is licensed under the Creative Commons Attribution 4.0 International License,
// available at https://creativecommons.org/licenses/by/4.0/legalcode.
//
// Content is data, not code: add a spell or monster by adding an entry here.
// Homebrew and non-SRD material belong in separate content packs.

export const TILES = {
  grass: { cost: 1 },
  forest: { cost: 2 },          // Difficult Terrain
  stone: { cost: 1 },
  water: { cost: Infinity },
  rock: { cost: Infinity },
};

// kind: attack (spell attack roll) | save | auto | heal
export const SPELLS = {
  fireBolt: { name: 'Fire Bolt', level: 0, time: 'action', range: 120, kind: 'attack', damage: '1d10', dtype: 'fire' },
  sacredFlame: { name: 'Sacred Flame', level: 0, time: 'action', range: 60, kind: 'save', save: 'dex', damage: '1d8', dtype: 'radiant', half: false },
  magicMissile: { name: 'Magic Missile', level: 1, time: 'action', range: 120, kind: 'auto', darts: 3, damage: '1d4+1', dtype: 'force' },
  burningHands: { name: 'Burning Hands', level: 1, time: 'action', range: 0, kind: 'save', area: { shape: 'cone', size: 15 }, save: 'dex', damage: '3d6', dtype: 'fire', half: true },
  cureWounds: { name: 'Cure Wounds', level: 1, time: 'action', range: 5, kind: 'heal', heal: '2d8' },
  healingWord: { name: 'Healing Word', level: 1, time: 'bonus', range: 60, kind: 'heal', heal: '2d4' },
};

const A = (str, dex, con, int, wis, cha) => ({ str, dex, con, int, wis, cha });

export const MONSTERS = {
  goblin: {
    name: 'Goblin Warrior', ac: 15, hp: 10, speed: 30, abil: A(8, 15, 10, 10, 8, 8), prof: 2,
    features: { nimbleEscape: true },
    attacks: [
      { id: 'scimitar', name: 'Scimitar', type: 'melee', bonus: 4, damage: '1d6+2', dtype: 'slashing', reach: 5, bonusOnAdv: '1d4' },
      { id: 'shortbow', name: 'Shortbow', type: 'ranged', bonus: 4, damage: '1d6+2', dtype: 'piercing', range: [80, 320], bonusOnAdv: '1d4' },
    ],
  },
  wolf: {
    name: 'Wolf', ac: 12, hp: 11, speed: 40, abil: A(14, 15, 12, 3, 12, 6), prof: 2,
    features: { packTactics: true },
    attacks: [{ id: 'bite', name: 'Bite', type: 'melee', bonus: 4, damage: '1d6+2', dtype: 'piercing', reach: 5, onHit: 'prone' }],
  },
  skeleton: {
    name: 'Skeleton', ac: 14, hp: 13, speed: 30, abil: A(10, 16, 15, 6, 8, 5), prof: 2,
    vuln: ['bludgeoning'], immune: ['poison'],
    attacks: [
      { id: 'shortsword', name: 'Shortsword', type: 'melee', bonus: 5, damage: '1d6+3', dtype: 'piercing', reach: 5 },
      { id: 'shortbow', name: 'Shortbow', type: 'ranged', bonus: 5, damage: '1d6+3', dtype: 'piercing', range: [80, 320] },
    ],
  },
};

// Level 1 pregenerated characters (Standard Array, 2024 backgrounds).
export const PREGENS = {
  fighter: {
    name: 'Brenna', cls: 'Fighter', level: 1, ac: 18, hp: 12, speed: 30, abil: A(17, 13, 15, 8, 12, 10), prof: 2,
    saveProf: ['str', 'con'], features: { secondWind: 2 },
    attacks: [
      { id: 'longsword', name: 'Longsword', type: 'melee', bonus: 5, damage: '1d8+3', dtype: 'slashing', reach: 5 },
      { id: 'javelin', name: 'Javelin', type: 'ranged', bonus: 5, damage: '1d6+3', dtype: 'piercing', range: [30, 120] },
    ],
    gear: ['Chain Mail', 'Shield', 'Longsword', '4 Javelins', "Explorer's Pack"],
  },
  rogue: {
    name: 'Pip', cls: 'Rogue', level: 1, ac: 14, hp: 10, speed: 30, abil: A(8, 17, 14, 10, 12, 14), prof: 2,
    saveProf: ['dex', 'int'], features: { sneak: '1d6' },
    attacks: [
      { id: 'shortsword', name: 'Shortsword', type: 'melee', bonus: 5, damage: '1d6+3', dtype: 'piercing', reach: 5, finesse: true },
      { id: 'shortbow', name: 'Shortbow', type: 'ranged', bonus: 5, damage: '1d6+3', dtype: 'piercing', range: [80, 320] },
    ],
    gear: ['Leather Armor', 'Shortsword', 'Shortbow', '20 Arrows', "Thieves' Tools"],
  },
  cleric: {
    name: 'Odessa', cls: 'Cleric', level: 1, ac: 18, hp: 10, speed: 30, abil: A(14, 10, 14, 8, 17, 12), prof: 2,
    saveProf: ['wis', 'cha'], castAbil: 'wis', spells: ['sacredFlame', 'cureWounds', 'healingWord'], slots: { 1: 2 },
    attacks: [{ id: 'mace', name: 'Mace', type: 'melee', bonus: 4, damage: '1d6+2', dtype: 'bludgeoning', reach: 5 }],
    gear: ['Chain Mail', 'Shield', 'Mace', 'Holy Symbol', "Priest's Pack"],
  },
  wizard: {
    name: 'Tavin', cls: 'Wizard', level: 1, ac: 12, hp: 8, speed: 30, abil: A(8, 14, 14, 17, 12, 10), prof: 2,
    saveProf: ['int', 'wis'], castAbil: 'int', spells: ['fireBolt', 'magicMissile', 'burningHands'], slots: { 1: 2 },
    attacks: [{ id: 'dagger', name: 'Dagger', type: 'melee', bonus: 4, damage: '1d4+2', dtype: 'piercing', reach: 5, finesse: true }],
    gear: ['Dagger', 'Arcane Focus', 'Spellbook', "Scholar's Pack"],
  },
};
