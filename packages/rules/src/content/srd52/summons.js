// Summon blocks (SRD 5.2.1): stat blocks whose numbers depend on the casting that makes the creature, with
// summon amounts where the SRD says "+ the spell's level", "your spell attack modifier" or "Wasp Only"
// (docs/specs/companions.md, Decision 5; packages/rules/src/summons.js bakes them). Data only.
// `level`: the lowest spell level the block is cast at. `variants`: the choices the block reads.
export const summons = [
  {
    id: "giant-insect", name: { by: "variant", centipede: "Giant Centipede", spider: "Giant Spider", wasp: "Giant Wasp" }, source: "SRD 5.2.1",
    level: 4,
    variants: ["centipede", "spider", "wasp"],
    size: "large",
    type: "beast",
    pb: { caster: "pb" },
    ac: { slot: 1, base: 11 },
    hp: { slot: 10, base: 30, above: 4 },
    speed: { walk: 40, climb: 40, fly: { value: 40, only: { variant: ["wasp"] } } },
    abilities: { str: 17, dex: 13, con: 15, int: 4, wis: 14, cha: 3 },
    languages: ["Understands the languages you know"],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, without needing an ability check.",
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: { by: "variant", centipede: "poison-jab", spider: ["poison-jab", "web-bolt"], wasp: "poison-jab" }, times: { slot: 0.5, round: "down" } }],
        text: "As many attacks as half the spell's level, rounded down.",
      },
      {
        id: "poison-jab",
        name: "Poison Jab",
        target: { creature: { reach: 10 } },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: { caster: "attack" },
            onHit: [{ damage: "1d6+3", plus: { slot: 1 }, type: "piercing" }, { damage: "1d4", type: "poison" }],
          },
        ],
        text: "A melee attack with the caster's spell attack modifier, reach 10 feet.",
      },
      {
        id: "web-bolt",
        name: "Web Bolt",
        only: { variant: ["spider"] },
        target: { creature: { range: [60, 60] } },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: { caster: "attack" },
            onHit: [
              { damage: "1d10+3", plus: { slot: 1 }, type: "bludgeoning" },
              { modifier: { on: "speed", op: "set", value: 0 }, ends: { on: "turnStart", of: "source" } },
            ],
          },
        ],
        text: "Spider only. A ranged attack, 60 feet, that stops the target's movement until the insect's next turn.",
      },
      {
        id: "venomous-spew",
        name: "Venomous Spew",
        only: { variant: ["centipede"] },
        time: "bonus",
        target: { creature: { range: [10, 10] } },
        effects: [
          {
            save: "con",
            dc: { caster: "dc" },
            onFail: [{ condition: "poisoned", ends: { on: "turnStart", of: "source" } }],
          },
        ],
        text: "Centipede only. A Bonus Action: a creature it can see within 10 feet saves against the caster's spell save DC or is Poisoned until the insect's next turn.",
      },
    ],
    tier: "auto",
    checked: true,
    text: "A giant centipede, spider or wasp summoned by Giant Insect, its numbers set by the spell's level and its caster.",
  },
];
