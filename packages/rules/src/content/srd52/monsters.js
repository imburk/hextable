// Monsters from the SRD 5.2.1. Data only. Format: docs/specs/rules-expansion.md.
// `text` is a plain-words description written for this project.
// `checked: false` means nobody has yet compared the entry against the SRD text.
export const monsters = [
  {
    id: "goblin-warrior", name: "Goblin Warrior", source: "SRD 5.2.1",
    size: "small", type: "fey", cr: 0.25, xp: 50, pb: 2,
    ac: 15, hp: 10, speed: { walk: 30 },
    abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
    resist: [], vulnerable: [], immune: [],
    traits: [
      { id: "nimble-escape", name: "Nimble Escape", modifiers: [],
        text: "Can take the Disengage or Hide action as a Bonus Action." },
    ],
    actions: [
      { id: "scimitar", name: "Scimitar", target: { creature: { reach: 5 } },
        effects: [{ attack: "melee", kind: "weapon", bonus: 4,
          onHit: [{ damage: "1d6+2", type: "slashing" }, { damage: "1d4", type: "slashing", when: ["attack.advantage"] }] }],
        text: "A melee attack that deals extra damage when the attack roll had Advantage." },
      { id: "shortbow", name: "Shortbow", target: { creature: { range: [80, 320] } },
        effects: [{ attack: "ranged", kind: "weapon", bonus: 4,
          onHit: [{ damage: "1d6+2", type: "piercing" }, { damage: "1d4", type: "piercing", when: ["attack.advantage"] }] }],
        text: "A ranged attack that deals extra damage when the attack roll had Advantage." },
    ],
    tier: "auto", checked: false,
    text: "A small, quick skirmisher that slips away from melee.",
  },
  {
    id: "wolf", name: "Wolf", source: "SRD 5.2.1",
    size: "medium", type: "beast", cr: 0.25, xp: 50, pb: 2,
    ac: 12, hp: 11, speed: { walk: 40 },
    abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    resist: [], vulnerable: [], immune: [],
    traits: [
      { id: "pack-tactics", name: "Pack Tactics",
        modifiers: [{ on: "attack.roll", op: "advantage", when: ["ally.adjacentToTarget"] }],
        text: "Advantage on an attack roll against a creature if an ally of the wolf is next to that creature and able to act." },
    ],
    actions: [
      { id: "bite", name: "Bite", target: { creature: { reach: 5 } },
        effects: [{ attack: "melee", kind: "weapon", bonus: 4,
          onHit: [{ damage: "1d6+2", type: "piercing" }, { condition: "prone" }] }],
        text: "A melee attack that knocks the target Prone. The SRD limits this by the target's size; the engine does not apply that limit yet." },
    ],
    tier: "assist", checked: false,
    text: "A pack hunter that drags prey down.",
  },
  {
    id: "skeleton", name: "Skeleton", source: "SRD 5.2.1",
    size: "medium", type: "undead", cr: 0.25, xp: 50, pb: 2,
    ac: 14, hp: 13, speed: { walk: 30 },
    abilities: { str: 10, dex: 16, con: 15, int: 6, wis: 8, cha: 5 },
    resist: [], vulnerable: ["bludgeoning"], immune: ["poison"],
    traits: [],
    actions: [
      { id: "shortsword", name: "Shortsword", target: { creature: { reach: 5 } },
        effects: [{ attack: "melee", kind: "weapon", bonus: 5, onHit: [{ damage: "1d6+3", type: "piercing" }] }],
        text: "A melee attack." },
      { id: "shortbow", name: "Shortbow", target: { creature: { range: [80, 320] } },
        effects: [{ attack: "ranged", kind: "weapon", bonus: 5, onHit: [{ damage: "1d6+3", type: "piercing" }] }],
        text: "A ranged attack." },
    ],
    tier: "auto", checked: false,
    text: "An animated set of bones, brittle against crushing blows.",
  },
];
