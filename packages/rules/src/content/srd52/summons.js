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
  {
    // Find Steed (SRD 5.2.1, flow lines 26854-26905). The Fey Step, Fell Glare and Healing Touch actions each
    // have a part the engine cannot say yet (a teleport that takes the rider, a Frightened that ends on the
    // caster's turn, healing "plus the spell's level"), so those parts are text for the DM and the block is `assist`.
    id: "otherworldly-steed", name: "Otherworldly Steed", source: "SRD 5.2.1",
    level: 2,
    types: ["celestial", "fey", "fiend"],
    size: "large",
    type: { by: "type", celestial: "celestial", fey: "fey", fiend: "fiend" },
    pb: { caster: "pb" },
    ac: { slot: 1, base: 10 },
    hp: { slot: 10, base: 5 },
    speed: { walk: 60, fly: { value: 60, only: { slot: 4 } } },
    abilities: { str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 },
    languages: ["Telepathy 1 mile (works only with you)"],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "life-bond",
        name: "Life Bond",
        modifiers: [],
        masterHeal: { within: 5 },
        text: "When its caster regains Hit Points from a level 1 or higher spell, the steed regains the same number if the caster is within 5 feet of it.",
      },
    ],
    actions: [
      {
        id: "otherworldly-slam",
        name: "Otherworldly Slam",
        target: { creature: { reach: 5 } },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: { caster: "attack" },
            onHit: [{ damage: "1d8", plus: { slot: 1 }, type: { by: "type", celestial: "radiant", fey: "psychic", fiend: "necrotic" } }],
          },
        ],
        text: "A melee attack with the caster's spell attack modifier, reach 5 feet: 1d8 plus the spell's level, Radiant (Celestial), Psychic (Fey) or Necrotic (Fiend).",
      },
      {
        id: "fell-glare",
        name: "Fell Glare",
        only: { type: ["fiend"] },
        time: "bonus",
        uses: { per: "day", n: 1 },
        target: { creature: { range: [60, 60] } },
        effects: [
          {
            save: "wis",
            dc: { caster: "dc" },
            onFail: [
              { condition: "frightened" },
              { manual: "Fell Glare: the Frightened condition lasts until the end of the caster's next turn (not the steed's). The engine has applied it with no end, so the DM removes it then." },
            ],
          },
        ],
        text: "Fiend only, once until a Long Rest. A Bonus Action: a creature the steed can see within 60 feet saves (Wisdom, the caster's spell save DC) or is Frightened until the end of the caster's next turn.",
      },
      {
        id: "fey-step",
        name: "Fey Step",
        only: { type: ["fey"] },
        time: "bonus",
        uses: { per: "day", n: 1 },
        target: { self: true },
        effects: [{ manual: "Fey Step: the steed teleports, with its rider, to an unoccupied space the caster chooses up to 60 feet from the steed. The DM moves them." }],
        text: "Fey only, once until a Long Rest. A Bonus Action: the steed and its rider teleport up to 60 feet to an unoccupied space the caster chooses.",
      },
      {
        id: "healing-touch",
        name: "Healing Touch",
        only: { type: ["celestial"] },
        time: "bonus",
        uses: { per: "day", n: 1 },
        target: { creature: { reach: 5 } },
        effects: [{ manual: "Healing Touch: one creature within 5 feet of the steed regains 2d8 plus the spell's level Hit Points (the level it was cast at). The DM rolls and heals." }],
        text: "Celestial only, once until a Long Rest. A Bonus Action: a creature within 5 feet regains 2d8 plus the spell's level Hit Points.",
      },
    ],
    tier: "assist",
    checked: true,
    text: "The steed that Find Steed summons, its numbers set by the slot level and its caster, as a Celestial, Fey or Fiend.",
  },
  {
    // Summon Dragon (SRD 5.2.1, flow lines 31196-31276). The breath's damage type is the `variant`: the SRD says it is
    // "your choice when you cast the spell" and one the spirit resists. The Shared Resistances choice is the spell's own.
    id: "draconic-spirit", name: "Draconic Spirit", source: "SRD 5.2.1",
    level: 5,
    variants: ["acid", "cold", "fire", "lightning", "poison"],
    size: "large",
    type: "dragon",
    pb: { caster: "pb" },
    ac: { slot: 1, base: 14 },
    hp: { slot: 10, base: 50, above: 5 },
    speed: { walk: 30, fly: 60, swim: 30 },
    abilities: { str: 19, dex: 14, con: 17, int: 10, wis: 14, cha: 14 },
    languages: ["Draconic", "Understands the languages you know"],
    senses: { blindsight: 30, darkvision: 60 },
    resist: ["acid", "cold", "fire", "lightning", "poison"],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "poisoned"],
    traits: [
      {
        id: "shared-resistances",
        name: "Shared Resistances",
        modifiers: [],
        text: "When it is summoned, its caster chooses one of its Resistances and has Resistance to that damage type until the spell ends. The spell gives the caster this.",
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: { slot: 0.5, round: "down" } }, { action: "breath-weapon", times: 1 }],
        text: "As many Rend attacks as half the spell's level, rounded down, and it uses Breath Weapon.",
      },
      {
        id: "rend",
        name: "Rend",
        target: { creature: { reach: 10 } },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: { caster: "attack" },
            onHit: [{ damage: "1d6+4", plus: { slot: 1 }, type: "piercing" }],
          },
        ],
        text: "A melee attack with the caster's spell attack modifier, reach 10 feet: 1d6 + 4 plus the spell's level, Piercing.",
      },
      {
        id: "breath-weapon",
        name: "Breath Weapon",
        target: { area: { shape: "cone", size: 30 } },
        effects: [
          {
            save: "dex",
            dc: { caster: "dc" },
            half: true,
            onFail: [{ damage: "2d6", type: { by: "variant", acid: "acid", cold: "cold", fire: "fire", lightning: "lightning", poison: "poison" } }],
          },
        ],
        text: "Each creature in a 30-foot Cone saves (Dexterity, the caster's spell save DC): 2d6 damage of the type chosen when the spell was cast, half on a success.",
      },
    ],
    tier: "auto",
    checked: true,
    text: "The dragon spirit that Summon Dragon calls, its numbers set by the slot level and its caster.",
  },
  {
    // Animate Objects (SRD 5.2.1, flow lines 24073-24135). The variant is the object's size ("Huge or Smaller"): Tiny,
    // Small and Medium share the "Medium or smaller" numbers. The SRD block lists no Proficiency Bonus or CR; `pb` is
    // the engine's required field and nothing in the block uses it (every save equals its modifier).
    id: "animated-object", name: "Animated Object", source: "SRD 5.2.1",
    level: 5,
    variants: ["tiny", "small", "medium", "large", "huge"],
    size: { by: "variant", tiny: "tiny", small: "small", medium: "medium", large: "large", huge: "huge" },
    type: "construct",
    pb: { caster: "pb" },
    ac: 15,
    hp: { by: "variant", tiny: 10, small: 10, medium: 10, large: 20, huge: 40 },
    speed: { walk: 30 },
    abilities: { str: 16, dex: 10, con: 10, int: 3, wis: 3, cha: 1 },
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "slam",
        name: "Slam",
        target: { creature: { reach: 5 } },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: { caster: "attack" },
            onHit: [
              {
                damage: { by: "variant", tiny: "1d4+3", small: "1d4+3", medium: "1d4+3", large: "2d6+3", huge: "2d12+3" },
                plus: { by: "variant", tiny: 0, small: 0, medium: 0, large: { caster: "mod" }, huge: { caster: "mod" } },
                type: "force",
              },
              { damage: { by: "variant", tiny: "1d4", small: "1d4", medium: "1d4", large: "1d6", huge: "1d12" }, only: { slot: 6 }, type: "force" },
              { damage: { by: "variant", tiny: "1d4", small: "1d4", medium: "1d4", large: "1d6", huge: "1d12" }, only: { slot: 7 }, type: "force" },
              { damage: { by: "variant", tiny: "1d4", small: "1d4", medium: "1d4", large: "1d6", huge: "1d12" }, only: { slot: 8 }, type: "force" },
              { damage: { by: "variant", tiny: "1d4", small: "1d4", medium: "1d4", large: "1d6", huge: "1d12" }, only: { slot: 9 }, type: "force" },
            ],
          },
        ],
        text: "A melee attack with the caster's spell attack modifier, reach 5 feet, Force damage: 1d4 + 3 (Medium or smaller), 2d6 + 3 plus the caster's spellcasting modifier (Large), 2d12 + 3 plus it (Huge); one more die (d4, d6 or d12) for each slot level above 5.",
      },
    ],
    tier: "auto",
    checked: true,
    text: "The construct that Animate Objects makes of an object, its size and numbers set by the object, the slot level and its caster.",
  },
];
