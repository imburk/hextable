// Monsters P to Z from the SRD 5.2.1 (2024 rules), animals included. Data only. Format: docs/specs/rules-expansion.md.
// `text` is a plain-words description written for this project.
// Skeleton and Wolf are not here: they already sit in monsters.js.
// `checked: true` means every number, dice expression, DC, attack bonus, damage type, condition and distance in the entry was
// compared with the SRD 5.2.1 stat block text and every hand-written line was read against it; `checked: false` marks the
// entry where the SRD allows a choice the engine cannot hold (Swarm of Insects: climb or fly, the GM's choice).
// Multiattack (`multiattack`), recharge, daily uses, Bonus Actions and condition immunities have fields now and were
// filled in by script where the SRD's wording is plain; a Multiattack that involves spellcasting, "if available" or
// something the DM applies stays a trait's `text`.
// Spellcasting, legendary actions and reactions have no fields yet, so they sit in a trait's `text` or a `manual` step and the monster is `assist`
// (or `manual` when none of its actions can be played by the engine).
export const monsters = [
  {
    id: "swarm-of-crawling-claws",
    name: "Swarm of Crawling Claws",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny undead",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 12,
    hp: 49,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 14,
      dex: 14,
      con: 11,
      int: 5,
      wis: 10,
      cha: 4
    },
    initiative: 2,
    languages: ["Understands Common but can’t speak"],
    senses: { blindsight: 30 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "grappled", "incapacitated", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Grappled, Incapacitated, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "swarm-of-grasping-hands",
        name: "Swarm of Grasping Hands",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "4d8+2",
                type: "necrotic"
              },
              {
                condition: "prone"
              },
              {
                manual: "While the swarm is Bloodied the necrotic hit does 11 (2d8+2) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack that knocks a Medium or smaller target Prone (the engine does not check size); less damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A scuttling mass of severed hands."
  },
  {
    id: "shrieker-fungus",
    name: "Shrieker Fungus",
    source: "SRD 5.2.1",
    size: "medium",
    type: "plant",
    cr: 0,
    xp: 0,
    pb: 2,
    ac: 5,
    hp: 13,
    speed: {
      walk: 5
    },
    abilities: {
      str: 1,
      dex: 1,
      con: 10,
      int: 1,
      wis: 3,
      cha: 1
    },
    initiative: -5,
    languages: [],
    senses: { blindsight: 30 },
    resist: [],
    vulnerable: [],
    immune: [],
    conditionImmune: ["blinded", "charmed", "deafened", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Blinded, Charmed, Deafened, Frightened condition(s). The engine applies this."
      }
    ],
    actions: [
      {
        id: "shriek",
        name: "Shriek",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Reaction: when a creature or a source of Bright Light moves within 30 feet, it shrieks. The shriek can be heard within 300 feet for 1 minute or until it dies."
          }
        ],
        text: "Reaction: shrieks when a creature or bright light comes within 30 feet. The DM applies this."
      }
    ],
    tier: "manual",
    checked: true,
    text: "A stationary fungus that shrieks to draw attention."
  },
  {
    id: "violet-fungus",
    name: "Violet Fungus",
    source: "SRD 5.2.1",
    size: "medium",
    type: "plant",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 5,
    hp: 18,
    speed: {
      walk: 5
    },
    abilities: {
      str: 3,
      dex: 1,
      con: 10,
      int: 1,
      wis: 3,
      cha: 1
    },
    initiative: -5,
    languages: [],
    senses: { blindsight: 30 },
    resist: [],
    vulnerable: [],
    immune: [],
    conditionImmune: ["blinded", "charmed", "deafened", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Blinded, Charmed, Deafened, Frightened condition(s). The engine applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rotting-touch", times: 2 }],
        text: "Makes two Rotting Touch attacks.",
      },
      {
        id: "rotting-touch",
        name: "Rotting Touch",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "1d8",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fungus with rotting, reaching tendrils."
  },
  {
    id: "steam-mephit",
    name: "Steam Mephit",
    source: "SRD 5.2.1",
    size: "small",
    type: "elemental",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 10,
    hp: 17,
    speed: {
      walk: 30,
      fly: 30
    },
    abilities: {
      str: 5,
      dex: 11,
      con: 10,
      int: 11,
      wis: 10,
      cha: 12
    },
    initiative: 0,
    languages: ["Primordial (Aquan, Ignan)"],
    senses: { darkvision: 60 },
    skills: {
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    conditionImmune: ["exhaustion", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Poisoned condition(s). The engine applies this."
      },
      {
        id: "blurred-form",
        name: "Blurred Form",
        modifiers: [],
        text: "Attack rolls against it have Disadvantage unless it is Incapacitated. The DM applies this."
      },
      {
        id: "death-burst",
        name: "Death Burst",
        modifiers: [],
        text: "When it dies, creatures within 5 feet make a Dexterity save (DC 10) or take 5 (2d4) fire damage, half on a success. The DM applies this."
      }
    ],
    actions: [
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "1d4",
                type: "slashing"
              },
              {
                damage: "1d4",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      },
      {
        id: "steam-breath",
        name: "Steam Breath",
        recharge: [6, 6],
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "con",
            dc: 10,
            half: true,
            onFail: [
              {
                damage: "2d4",
                type: "fire"
              },
              {
                manual: "The target's Speed decreases by 10 feet until the end of the mephit's next turn. Being underwater does not grant Resistance to this fire damage."
              }
            ]
          }
        ],
        text: "Constitution save (DC 10) or take 2d4 fire damage, half on a success. Recharge 6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small elemental of hot steam that bursts when it dies."
  },
  {
    id: "pegasus",
    name: "Pegasus",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 59,
    speed: {
      walk: 60,
      fly: 90
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 16,
      int: 10,
      wis: 15,
      cha: 13
    },
    saves: { dex: 4, con: 5, wis: 4, cha: 3 },
    initiative: 2,
    languages: ["Understands Celestial, Common, Elvish, and Sylvan but can’t speak"],
    skills: {
      perception: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d6+4",
                type: "bludgeoning"
              },
              {
                damage: "2d4",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A winged white horse of the heavens."
  },
  {
    id: "phase-spider",
    name: "Phase Spider",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 14,
    hp: 45,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 15,
      dex: 16,
      con: 12,
      int: 6,
      wis: 10,
      cha: 6
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      stealth: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "ethereal-sight",
        name: "Ethereal Sight",
        modifiers: [],
        text: "Sees 60 feet into the Ethereal Plane from the Material Plane, and the reverse."
      },
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "web-walker",
        name: "Web Walker",
        modifiers: [],
        text: "Ignores movement limits from webs and knows where any creature touching the same web is."
      },
      {
        id: "ethereal-jaunt",
        name: "Ethereal Jaunt",
        modifiers: [],
        text: "Bonus Action: Teleports between the Material Plane and the Ethereal Plane. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 2 }],
        text: "Makes two Bite attacks.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d10+3",
                type: "piercing"
              },
              {
                damage: "2d8",
                type: "poison"
              },
              {
                manual: "If this damage reduces the target to 0 Hit Points, the target becomes Stable and Poisoned for 1 hour, and while Poisoned it is also Paralyzed."
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage; a target dropped to 0 Hit Points is left Stable, Poisoned and Paralyzed."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A spider that slips in and out of the Ethereal Plane."
  },
  {
    id: "pirate",
    name: "Pirate",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 14,
    hp: 33,
    speed: {
      walk: 30
    },
    abilities: {
      str: 10,
      dex: 16,
      con: 12,
      int: 8,
      wis: 12,
      cha: 14
    },
    saves: { dex: 5, cha: 4 },
    initiative: 5,
    languages: ["Common plus one other language"],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["dagger", "dagger-thrown"], times: 2 }], [{ action: ["dagger", "dagger-thrown"], times: 1 }, { action: "enthralling-panache", times: 1 }]] },
        text: "Makes two Dagger attacks. It can replace one attack with a use of Enthralling Panache.",
      },
      {
        id: "dagger",
        name: "Dagger",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "dagger-thrown",
        name: "Dagger (thrown)",
        target: {
          creature: {
            range: [
              20,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "The same weapon thrown."
      },
      {
        id: "enthralling-panache",
        name: "Enthralling Panache",
        target: {
          creature: {
            range: [
              30,
              30
            ]
          }
        },
        effects: [
          {
            save: "wis",
            dc: 12,
            half: false,
            onFail: [
              {
                condition: "charmed",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "Wisdom save (DC 12) or Charmed until the start of the pirate's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A rough sailor who fights with daggers and charm."
  },
  {
    id: "pirate-captain",
    name: "Pirate Captain",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 17,
    hp: 84,
    speed: {
      walk: 30
    },
    abilities: {
      str: 10,
      dex: 18,
      con: 14,
      int: 10,
      wis: 14,
      cha: 17
    },
    saves: { str: 3, dex: 7, wis: 5, cha: 6 },
    initiative: 7,
    languages: ["Common plus one other language"],
    skills: {
      acrobatics: 7,
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "captains-charm",
        name: "Captain’s Charm",
        modifiers: [],
        text: "Bonus Action: One creature it can see within 30 feet makes a Wisdom save (DC 14) or is Charmed until the start of the pirate's next turn. The DM applies this."
      },
      {
        id: "riposte",
        name: "Riposte",
        modifiers: [],
        text: "Reaction: When a melee attack hits it while it holds a weapon, it adds 3 to its AC against that attack. If the attack then misses, it makes one Rapier attack against the attacker if in range. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["rapier", "pistol"], times: 3 }],
        text: "Makes three attacks, using Rapier or Pistol in any combination.",
      },
      {
        id: "rapier",
        name: "Rapier",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "piercing"
              },
              {
                manual: "The pirate has Advantage on the next attack roll it makes before the end of this turn."
              }
            ]
          }
        ],
        text: "A melee attack that gives the pirate Advantage on its next attack this turn."
      },
      {
        id: "pistol",
        name: "Pistol",
        target: {
          creature: {
            range: [
              30,
              90
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d10+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A swashbuckling ship commander with rapier and pistol."
  },
  {
    id: "pit-fiend",
    name: "Pit Fiend",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 20,
    xp: 25000,
    pb: 6,
    ac: 21,
    hp: 337,
    speed: {
      walk: 30,
      fly: 60
    },
    abilities: {
      str: 26,
      dex: 14,
      con: 24,
      int: 22,
      wis: 18,
      cha: 24
    },
    saves: { dex: 8, wis: 10 },
    initiative: 14,
    languages: ["Infernal", "telepathy 120 ft."],
    senses: { truesight: 120 },
    skills: {
      perception: 10,
      persuasion: 19
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    conditionImmune: ["poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If it dies outside the Nine Hells, it gets a new body at once, with all its Hit Points, somewhere in the Nine Hells."
      },
      {
        id: "fear-aura",
        name: "Fear Aura",
        modifiers: [],
        text: "While not Incapacitated, an enemy that starts its turn within 20 feet makes a Wisdom save (DC 21) or is Frightened until the start of its next turn; a success makes it immune to this aura for 24 hours. The DM applies this."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 4 times a day. The DM tracks the uses."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "devilish-claw", times: 2 }, { action: "fiery-mace", times: 1 }],
        text: "Makes one Bite attack, two Devilish Claw attacks, and one Fiery Mace attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "3d6+8",
                type: "piercing"
              },
              {
                damage: "6d6",
                type: "poison"
              },
              {
                manual: "If the target is a creature, it makes a Constitution save (DC 21) or is Poisoned: it cannot regain Hit Points and takes 21 (6d6) poison damage at the start of each of its turns, and repeats the save at the end of each of its turns, ending the effect on a success. After 1 minute it succeeds automatically."
              }
            ]
          }
        ],
        text: "A melee attack that can leave the target with a lingering, damaging poison."
      },
      {
        id: "devilish-claw",
        name: "Devilish Claw",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "4d8+8",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "fiery-mace",
        name: "Fiery Mace",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "4d6+8",
                type: "force"
              },
              {
                damage: "6d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      },
      {
        id: "hellfire-spellcasting",
        name: "Hellfire Spellcasting",
        recharge: [4, 6],
        target: {
          self: true
        },
        effects: [
          {
            manual: "Recharge 4-6: casts Fireball (level 5 version) twice, with no Material components, using Charisma (spell save DC 21). It can replace one Fireball with Hold Monster (level 7 version) or Wall of Fire."
          }
        ],
        text: "Casts Fireball twice, or swaps one for Hold Monster or Wall of Fire; Recharge 4-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge devil general of the Nine Hells."
  },
  {
    id: "planetar",
    name: "Planetar",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 16,
    xp: 15000,
    pb: 5,
    ac: 19,
    hp: 262,
    speed: {
      walk: 40,
      fly: 120
    },
    abilities: {
      str: 24,
      dex: 20,
      con: 24,
      int: 19,
      wis: 22,
      cha: 25
    },
    saves: { str: 12, con: 12, wis: 11, cha: 12 },
    initiative: 10,
    languages: ["All", "telepathy 120 ft."],
    senses: { truesight: 120 },
    hover: true,
    skills: {
      perception: 11
    },
    resist: [
      "radiant"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "exhaustion", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened condition(s). The engine applies this."
      },
      {
        id: "divine-awareness",
        name: "Divine Awareness",
        modifiers: [],
        text: "Knows when it hears a lie."
      },
      {
        id: "exalted-restoration",
        name: "Exalted Restoration",
        modifiers: [],
        text: "If it dies outside Mount Celestia, it gets a new body at once, with all its Hit Points, somewhere in Mount Celestia."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "divine-aid",
        name: "Divine Aid",
        modifiers: [],
        text: "Bonus Action (2/Day): Casts Cure Wounds, Invisibility, Lesser Restoration or Remove Curse, with its Spellcasting ability. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "radiant-sword", times: 3 }], [{ action: "holy-burst", times: 2 }]] },
        text: "Makes three Radiant Sword attacks or uses Holy Burst twice.",
      },
      {
        id: "radiant-sword",
        name: "Radiant Sword",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 12,
            onHit: [
              {
                damage: "2d6+7",
                type: "slashing"
              },
              {
                damage: "4d8",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
      },
      {
        id: "holy-burst",
        name: "Holy Burst",
        target: {
          area: {
            shape: "sphere",
            size: 20
          }
        },
        effects: [
          {
            save: "dex",
            dc: 20,
            half: true,
            onFail: [
              {
                damage: "7d6",
                type: "radiant"
              }
            ]
          }
        ],
        text: "Each enemy in a 20-foot-radius sphere centered on a point the planetar sees within 120 feet makes a Dexterity save (DC 20) or takes radiant damage, half on a success."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Charisma (spell save DC 20). At will: Detect Evil and Good. 1 a day each: Commune, Control Weather, Dispel Evil and Good, Raise Dead."
          }
        ],
        text: "Casts planetar spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A mighty angel who fights with a radiant greatsword."
  },
  {
    id: "priest-acolyte",
    name: "Priest Acolyte",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 13,
    hp: 11,
    speed: {
      walk: 30
    },
    abilities: {
      str: 14,
      dex: 10,
      con: 12,
      int: 10,
      wis: 14,
      cha: 11
    },
    initiative: 0,
    languages: ["Common"],
    skills: {
      medicine: 4,
      religion: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "divine-aid",
        name: "Divine Aid",
        modifiers: [],
        text: "Bonus Action (1/Day): Casts Bless, Healing Word or Sanctuary, with its Spellcasting ability. The DM applies this."
      }
    ],
    actions: [
      {
        id: "mace",
        name: "Mace",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "bludgeoning"
              },
              {
                damage: "1d4",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
      },
      {
        id: "radiant-flame",
        name: "Radiant Flame",
        target: {
          creature: {
            range: [
              60,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d6",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A ranged attack."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, using Wisdom. At will: Light, Thaumaturgy."
          }
        ],
        text: "Casts Light or Thaumaturgy."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A junior cleric with minor spells."
  },
  {
    id: "priest",
    name: "Priest",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 38,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 10,
      con: 12,
      int: 13,
      wis: 16,
      cha: 13
    },
    initiative: 0,
    languages: ["Common plus one other language"],
    skills: {
      medicine: 7,
      perception: 5,
      religion: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "divine-aid",
        name: "Divine Aid",
        modifiers: [],
        text: "Bonus Action (3/Day): Casts Bless, Dispel Magic, Healing Word or Lesser Restoration, with its Spellcasting ability. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["mace", "radiant-flame"], times: 2 }],
        text: "Makes two attacks, using Mace or Radiant Flame in any combination.",
      },
      {
        id: "mace",
        name: "Mace",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
                type: "bludgeoning"
              },
              {
                damage: "2d4",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
      },
      {
        id: "radiant-flame",
        name: "Radiant Flame",
        target: {
          creature: {
            range: [
              60,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d10",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A ranged attack."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, using Wisdom (spell save DC 13). At will: Light, Thaumaturgy. 1 a day: Spirit Guardians."
          }
        ],
        text: "Casts Light, Thaumaturgy or Spirit Guardians."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A cleric who heals allies and fights with mace and radiant flame."
  },
  {
    id: "pseudodragon",
    name: "Pseudodragon",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "dragon",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 14,
    hp: 10,
    speed: {
      walk: 15,
      fly: 60
    },
    abilities: {
      str: 6,
      dex: 15,
      con: 13,
      int: 10,
      wis: 12,
      cha: 10
    },
    initiative: 2,
    languages: ["Understands Common and Draconic but can’t speak"],
    senses: { blindsight: 10, darkvision: 60 },
    skills: {
      perception: 5,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 2 }],
        text: "Makes two Bite attacks.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d4+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "sting",
        name: "Sting",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 12,
            half: false,
            onFail: [
              {
                damage: "2d4",
                type: "poison"
              },
              {
                condition: "poisoned"
              },
              {
                manual: "The Poisoned condition lasts 1 hour. If the save fails by 5 or more, the target is also Unconscious while Poisoned, which ends early if it takes damage or a creature within 5 feet uses an action to wake it."
              }
            ]
          }
        ],
        text: "Constitution save (DC 12) or take 2d4 poison damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny, cat-sized dragon with a venomous tail."
  },
  {
    id: "purple-worm",
    name: "Purple Worm",
    source: "SRD 5.2.1",
    size: "gargantuan",
    type: "monstrosity",
    cr: 15,
    xp: 13000,
    pb: 5,
    ac: 18,
    hp: 247,
    speed: {
      walk: 50,
      burrow: 50
    },
    abilities: {
      str: 28,
      dex: 7,
      con: 22,
      int: 1,
      wis: 8,
      cha: 4
    },
    saves: { con: 11, wis: 4 },
    initiative: 3,
    languages: [],
    senses: { blindsight: 30, tremorsense: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "tunneler",
        name: "Tunneler",
        modifiers: [],
        text: "Burrows through solid rock at half its Burrow speed, leaving a 10-foot-wide tunnel."
      },
      {
        id: "swallow",
        name: "Swallow",
        modifiers: [],
        text: "Bonus Action: A Large or smaller creature it has Grappled makes a Strength save (DC 19) or is swallowed (up to three at once): Blinded, Restrained, with total cover from outside, and takes 17 (5d6) acid damage at the start of each of the worm's turns. If the worm takes 30 or more damage in a turn from inside, it makes a Constitution save (DC 21) at the end of that turn or regurgitates everyone, Prone, within 5 feet. If it dies, swallowed creatures are freed and can leave using 20 feet of movement. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "tail-stinger", times: 1 }],
        text: "Makes one Bite attack and one Tail Stinger attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "3d8+9",
                type: "piercing"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 19, and only if the target is Large or smaller. The Restrained condition lasts only until the grapple ends."
              }
            ]
          }
        ],
        text: "A melee attack that grapples and restrains a Large or smaller target (escape DC 19)."
      },
      {
        id: "tail-stinger",
        name: "Tail Stinger",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "2d6+9",
                type: "piercing"
              },
              {
                damage: "10d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A colossal burrowing worm that swallows its prey."
  },
  {
    id: "quasit",
    name: "Quasit",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "fiend",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 13,
    hp: 25,
    speed: {
      walk: 40
    },
    abilities: {
      str: 5,
      dex: 17,
      con: 10,
      int: 7,
      wis: 10,
      cha: 10
    },
    initiative: 3,
    languages: ["Abyssal", "Common"],
    senses: { darkvision: 120 },
    skills: {
      stealth: 5
    },
    resist: [
      "cold",
      "fire",
      "lightning"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "slashing"
              },
              {
                condition: "poisoned",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A melee attack that Poisons the target until the start of the quasit's next turn."
      },
      {
        id: "invisibility",
        name: "Invisibility",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts Invisibility on itself, with no components, using Charisma."
          }
        ],
        text: "Turns itself Invisible."
      },
      {
        id: "scare",
        name: "Scare",
        uses: { per: "day", n: 1 },
        target: {
          creature: {
            range: [
              20,
              20
            ]
          }
        },
        effects: [
          {
            save: "wis",
            dc: 10,
            half: false,
            onFail: [
              {
                condition: "frightened",
                ends: {
                  on: "save",
                  save: "wis",
                  at: "turnEnd"
                }
              },
              {
                manual: "After 1 minute the target succeeds on the save automatically."
              }
            ]
          }
        ],
        text: "Wisdom save (DC 10) or Frightened, repeating the save each turn; 1 a day."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Becomes a bat (Speed 10, Fly 40), a centipede (Speed 40, Climb 40) or a toad (Speed 40, Swim 40), or returns to its true form. Statistics are unchanged except Speed; equipment is not transformed."
          }
        ],
        text: "Becomes a bat, centipede or toad, or its true form."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny demon that shifts shape and turns invisible."
  },
  {
    id: "rakshasa",
    name: "Rakshasa",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 13,
    xp: 10000,
    pb: 5,
    ac: 17,
    hp: 221,
    speed: {
      walk: 40
    },
    abilities: {
      str: 14,
      dex: 17,
      con: 18,
      int: 13,
      wis: 16,
      cha: 20
    },
    initiative: 8,
    languages: ["Common", "Infernal"],
    senses: { truesight: 60 },
    skills: {
      deception: 10,
      insight: 8,
      perception: 8
    },
    resist: [],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened condition(s). The engine applies this."
      },
      {
        id: "conditional-vulnerability",
        name: "Conditional Vulnerability",
        modifiers: [],
        text: "Vulnerable to piercing damage from weapons wielded by creatures under the effect of a Bless spell. The engine cannot judge that condition, so the DM applies it."
      },
      {
        id: "greater-magic-resistance",
        name: "Greater Magic Resistance",
        modifiers: [],
        text: "Automatically succeeds on saves against spells and magical effects, spell attack rolls automatically miss it, and no spell can observe it remotely or reveal its thoughts, creature type or alignment without its permission. The DM applies this."
      },
      {
        id: "fiendish-restoration",
        name: "Fiendish Restoration",
        modifiers: [],
        text: "If it dies outside the Nine Hells, it gets a new body at once, with all its Hit Points, somewhere in the Nine Hells."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "cursed-touch", times: 3 }],
        text: "Makes three Cursed Touch attacks.",
      },
      {
        id: "cursed-touch",
        name: "Cursed Touch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "2d6+5",
                type: "slashing"
              },
              {
                damage: "3d12",
                type: "necrotic"
              },
              {
                manual: "If the target is a creature, it is cursed: while cursed it gains no benefit from finishing a Short or Long Rest."
              }
            ]
          }
        ],
        text: "A melee attack with extra necrotic damage that curses the target so it gains no benefit from Short or Long Rests."
      },
      {
        id: "baleful-command",
        name: "Baleful Command",
        recharge: [5, 6],
        target: {
          area: {
            shape: "emanation",
            size: 30
          }
        },
        effects: [
          {
            save: "wis",
            dc: 18,
            half: false,
            onFail: [
              {
                damage: "8d6",
                type: "psychic"
              },
              {
                condition: "frightened",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              },
              {
                condition: "incapacitated",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "Enemies within 30 feet make a Wisdom save (DC 18) or take psychic damage and are Frightened and Incapacitated until the start of the rakshasa's next turn. Recharge 5-6."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Charisma (spell save DC 18). At will: Detect Magic, Detect Thoughts, Disguise Self, Mage Hand, Minor Illusion. 1 a day each: Fly, Invisibility, Major Image, Plane Shift."
          }
        ],
        text: "Casts rakshasa spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiger-headed fiend that curses with a touch."
  },
  {
    id: "red-dragon-wyrmling",
    name: "Red Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 17,
    hp: 75,
    speed: {
      walk: 30,
      climb: 30,
      fly: 60
    },
    abilities: {
      str: 19,
      dex: 10,
      con: 17,
      int: 12,
      wis: 11,
      cha: 15
    },
    saves: { dex: 2, wis: 2 },
    initiative: 2,
    languages: ["Draconic"],
    senses: { blindsight: 10, darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "fire"
    ],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Makes two Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d10+4",
                type: "slashing"
              },
              {
                damage: "1d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      },
      {
        id: "fire-breath",
        name: "Fire Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "dex",
            dc: 13,
            half: true,
            onFail: [
              {
                damage: "7d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "Dexterity save (DC 13) or take 7d6 fire damage, half on a success. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young fire-breathing dragon."
  },
  {
    id: "young-red-dragon",
    name: "Young Red Dragon",
    source: "SRD 5.2.1",
    size: "large",
    type: "dragon",
    cr: 10,
    xp: 5900,
    pb: 4,
    ac: 18,
    hp: 178,
    speed: {
      walk: 40,
      climb: 40,
      fly: 80
    },
    abilities: {
      str: 23,
      dex: 10,
      con: 21,
      int: 14,
      wis: 11,
      cha: 19
    },
    saves: { dex: 4, wis: 4 },
    initiative: 4,
    languages: ["Common", "Draconic"],
    senses: { blindsight: 30, darkvision: 120 },
    skills: {
      perception: 8,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [
      "fire"
    ],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 3 }],
        text: "Makes three Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "2d6+6",
                type: "slashing"
              },
              {
                damage: "1d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      },
      {
        id: "fire-breath",
        name: "Fire Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            save: "dex",
            dc: 17,
            half: true,
            onFail: [
              {
                damage: "16d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "Dexterity save (DC 17) or take 16d6 fire damage, half on a success. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young dragon that breathes fire."
  },
  {
    id: "remorhaz",
    name: "Remorhaz",
    source: "SRD 5.2.1",
    size: "huge",
    type: "monstrosity",
    cr: 11,
    xp: 7200,
    pb: 4,
    ac: 17,
    hp: 195,
    speed: {
      walk: 40,
      burrow: 30
    },
    abilities: {
      str: 24,
      dex: 13,
      con: 21,
      int: 4,
      wis: 10,
      cha: 5
    },
    initiative: 5,
    languages: [],
    senses: { darkvision: 60, tremorsense: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "cold",
      "fire"
    ],
    traits: [
      {
        id: "heat-aura",
        name: "Heat Aura",
        modifiers: [],
        text: "At the end of each of its turns, creatures within 5 feet take 16 (3d10) fire damage. The DM applies this."
      },
      {
        id: "swallow",
        name: "Swallow",
        modifiers: [],
        text: "Bonus Action: A Large or smaller creature it has Grappled makes a Strength save (DC 19) or is swallowed (up to two at once): Blinded, Restrained, with total cover from outside, and takes 10 (3d6) acid plus 10 (3d6) fire damage at the start of each of the remorhaz's turns. If it takes 30 or more damage in a turn from inside, it makes a Constitution save (DC 15) at the end of that turn or regurgitates everyone, Prone, within 5 feet. If it dies, swallowed creatures can leave using 15 feet of movement. The DM applies this."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 11,
            onHit: [
              {
                damage: "2d10+7",
                type: "piercing"
              },
              {
                damage: "4d6",
                type: "fire"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 17, and only if the target is Large or smaller. The Restrained condition lasts only until the grapple ends."
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage that grapples and restrains a Large or smaller target (escape DC 17)."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge burning ice worm that swallows prey."
  },
  {
    id: "roc",
    name: "Roc",
    source: "SRD 5.2.1",
    size: "gargantuan",
    type: "monstrosity",
    cr: 11,
    xp: 7200,
    pb: 4,
    ac: 15,
    hp: 248,
    speed: {
      walk: 20,
      fly: 120
    },
    abilities: {
      str: 28,
      dex: 10,
      con: 20,
      int: 3,
      wis: 10,
      cha: 9
    },
    saves: { dex: 4, wis: 4 },
    initiative: 8,
    languages: [],
    skills: {
      perception: 8
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "swoop",
        name: "Swoop",
        modifiers: [],
        text: "Bonus Action (Recharge 5-6): If it has a creature Grappled, it flies up to half its Fly speed without provoking Opportunity Attacks and drops the creature. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "beak", times: 2 }], [{ action: "beak", times: 1 }, { action: "talons", times: 1 }]] },
        text: "Makes two Beak attacks. It can replace one attack with a Talons attack.",
      },
      {
        id: "beak",
        name: "Beak",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 13,
            onHit: [
              {
                damage: "3d12+9",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "talons",
        name: "Talons",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 13,
            onHit: [
              {
                damage: "4d6+9",
                type: "slashing"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 19, only if the target is Huge or smaller, held by both talons. The Restrained condition lasts only until the grapple ends."
              }
            ]
          }
        ],
        text: "A melee attack that grapples and restrains a Huge or smaller target (escape DC 19)."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A gargantuan bird that carries off prey in its talons."
  },
  {
    id: "roper",
    name: "Roper",
    source: "SRD 5.2.1",
    size: "large",
    type: "aberration",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 20,
    hp: 93,
    speed: {
      walk: 10,
      climb: 20
    },
    abilities: {
      str: 18,
      dex: 8,
      con: 17,
      int: 7,
      wis: 16,
      cha: 6
    },
    initiative: 5,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      perception: 6,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Makes two Tentacle attacks, uses Reel, and makes two Bite attacks."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "3d8+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "tentacle",
        name: "Tentacle",
        target: {
          creature: {
            reach: 60
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                condition: "grappled"
              },
              {
                condition: "poisoned"
              },
              {
                manual: "Grapple escape DC 14, from one of six tentacles; the target stays Poisoned until the grapple ends. A tentacle can be attacked (AC 20, HP 10, Immunity to Poison and Psychic damage); destroying it frees the creature, deals no damage to the roper, and it regrows at the start of the roper's next turn."
              }
            ]
          }
        ],
        text: "A long-reach attack that grapples and poisons the target; it deals no damage itself."
      },
      {
        id: "reel",
        name: "Reel",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Pulls each creature it has Grappled up to 30 feet straight toward itself."
          }
        ],
        text: "Pulls grappled creatures toward it."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A cave stalker that reels victims in with sticky tentacles."
  },
  {
    id: "rust-monster",
    name: "Rust Monster",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 14,
    hp: 33,
    speed: {
      walk: 40
    },
    abilities: {
      str: 13,
      dex: 12,
      con: 13,
      int: 2,
      wis: 13,
      cha: 6
    },
    initiative: 1,
    languages: [],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "iron-scent",
        name: "Iron Scent",
        modifiers: [],
        text: "Pinpoints ferrous metal within 30 feet."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Makes one Bite attack and uses Antennae twice."
      },
      {
        id: "reflexive-antennae",
        name: "Reflexive Antennae",
        modifiers: [],
        text: "Reaction: When an attack roll hits it, it uses Antennae. The DM applies this."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d8+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "antennae",
        name: "Antennae",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Targets a nonmagical metal object (armor or a weapon) worn or carried by a creature within 5 feet. The creature makes a Dexterity save (DC 11) or the object takes a -1 penalty (to the AC it offers, or to attack rolls). Armor is destroyed if its AC would drop to 10, and a weapon if its penalty reaches -5. The Mending spell removes the penalty."
          }
        ],
        text: "Corrodes a metal weapon or armor."
      },
      {
        id: "destroy-metal",
        name: "Destroy Metal",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Touches a nonmagical metal object within 5 feet that is not worn or carried, destroying a 1-foot cube of it."
          }
        ],
        text: "Destroys loose metal."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A beast that corrodes metal armor and weapons."
  },
  {
    id: "sahuagin-warrior",
    name: "Sahuagin Warrior",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 22,
    speed: {
      walk: 30,
      swim: 40
    },
    abilities: {
      str: 13,
      dex: 11,
      con: 12,
      int: 12,
      wis: 13,
      cha: 9
    },
    initiative: 0,
    languages: ["Sahuagin"],
    senses: { darkvision: 120 },
    skills: {
      perception: 5
    },
    resist: [
      "acid",
      "cold"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "blood-frenzy",
        name: "Blood Frenzy",
        modifiers: [],
        text: "Advantage on attack rolls against any creature that is missing Hit Points. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "limited-amphibiousness",
        name: "Limited Amphibiousness",
        modifiers: [],
        text: "Breathes air and water, but must be submerged at least once every 4 hours or suffocate."
      },
      {
        id: "shark-telepathy",
        name: "Shark Telepathy",
        modifiers: [],
        text: "Controls sharks within 120 feet by a special telepathy."
      },
      {
        id: "aquatic-charge",
        name: "Aquatic Charge",
        modifiers: [],
        text: "Bonus Action: Swims up to its Swim speed straight toward an enemy it can see. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "claw", times: 2 }],
        text: "Makes two Claw attacks.",
      },
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d6+1",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fish-like raider of the sea with claws and bite."
  },
  {
    id: "salamander",
    name: "Salamander",
    source: "SRD 5.2.1",
    size: "large",
    type: "elemental",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 90,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 18,
      dex: 14,
      con: 15,
      int: 11,
      wis: 10,
      cha: 12
    },
    initiative: 2,
    languages: ["Primordial (Ignan)"],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [
      "cold"
    ],
    immune: [
      "fire"
    ],
    traits: [
      {
        id: "fire-aura",
        name: "Fire Aura",
        modifiers: [],
        text: "At the end of each of its turns, creatures of its choice within 5 feet take 7 (2d6) fire damage. The DM applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["flame-spear", "flame-spear-thrown"], times: 2 }], [{ action: ["flame-spear", "flame-spear-thrown"], times: 1 }, { action: "constrict", times: 1 }]] },
        text: "Makes two Flame Spear attacks. It can replace one attack with a use of Constrict.",
      },
      {
        id: "flame-spear",
        name: "Flame Spear",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "piercing"
              },
              {
                damage: "2d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A spear attack, melee or thrown, with extra fire damage; the spear returns to the salamander's hand after a thrown attack."
      },
      {
        id: "flame-spear-thrown",
        name: "Flame Spear (thrown)",
        target: {
          creature: {
            range: [
              20,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "piercing"
              },
              {
                damage: "2d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A spear attack, melee or thrown, with extra fire damage; the spear returns to the salamander's hand after a thrown attack."
      },
      {
        id: "constrict",
        name: "Constrict",
        target: {
          creature: {
            range: [
              10,
              10
            ]
          }
        },
        effects: [
          {
            save: "str",
            dc: 15,
            half: false,
            onFail: [
              {
                damage: "2d6+4",
                type: "bludgeoning"
              },
              {
                damage: "2d6",
                type: "fire"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 14, and the Restrained condition lasts only until the grapple ends."
              }
            ]
          }
        ],
        text: "Strength save (DC 15) for a Large or smaller creature within 10 feet, or it takes bludgeoning and fire damage and is grappled and restrained."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fiery elemental that wields a flaming spear."
  },
  {
    id: "satyr",
    name: "Satyr",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 13,
    hp: 31,
    speed: {
      walk: 40
    },
    abilities: {
      str: 12,
      dex: 16,
      con: 11,
      int: 12,
      wis: 10,
      cha: 14
    },
    initiative: 3,
    languages: ["Common", "Elvish", "Sylvan"],
    skills: {
      perception: 2,
      performance: 6,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      }
    ],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "bludgeoning"
              },
              {
                move: 10,
                dir: "away"
              }
            ]
          }
        ],
        text: "A melee attack that pushes a Medium or smaller target 10 feet away (the engine does not check size and pushes the full distance)."
      },
      {
        id: "mockery",
        name: "Mockery",
        target: {
          creature: {
            range: [
              90,
              90
            ]
          }
        },
        effects: [
          {
            save: "wis",
            dc: 12,
            half: false,
            onFail: [
              {
                damage: "1d6+2",
                type: "psychic"
              }
            ]
          }
        ],
        text: "Wisdom save (DC 12) or take 1d6+2 psychic damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A merry fey trickster with a mocking jeer."
  },
  {
    id: "scout",
    name: "Scout",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 13,
    hp: 16,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 14,
      con: 12,
      int: 11,
      wis: 13,
      cha: 11
    },
    initiative: 2,
    languages: ["Common plus one other language"],
    skills: {
      nature: 4,
      perception: 5,
      stealth: 6,
      survival: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["shortsword", "longbow"], times: 2 }],
        text: "Makes two attacks, using Shortsword and Longbow in any combination.",
      },
      {
        id: "shortsword",
        name: "Shortsword",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "longbow",
        name: "Longbow",
        target: {
          creature: {
            range: [
              150,
              600
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d8+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A skilled wilderness spy with sword and longbow."
  },
  {
    id: "sea-hag",
    name: "Sea Hag",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 14,
    hp: 52,
    speed: {
      walk: 30,
      swim: 40
    },
    abilities: {
      str: 16,
      dex: 13,
      con: 16,
      int: 12,
      wis: 12,
      cha: 13
    },
    initiative: 1,
    languages: ["Common", "Giant", "Primordial (Aquan)"],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
      {
        id: "coven-magic",
        name: "Coven Magic",
        modifiers: [],
        text: "While within 30 feet of at least two other hags, it can cast Augury, Find Familiar, Identify, Locate Object, Scrying or Unseen Servant (Intelligence, save DC 11, no Material components), then needs a Long Rest before casting that spell again. The DM applies this."
      },
      {
        id: "vile-appearance",
        name: "Vile Appearance",
        modifiers: [],
        text: "A Beast or Humanoid that starts its turn within 30 feet and can see the hag's true form makes a Wisdom save (DC 11) or is Frightened until the start of its next turn; a success makes it immune for 24 hours. The DM applies this."
      }
    ],
    actions: [
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "death-glare",
        name: "Death Glare",
        recharge: [5, 6],
        target: {
          creature: {
            range: [
              30,
              30
            ]
          }
        },
        effects: [
          {
            save: "wis",
            dc: 11,
            half: false,
            onFail: [
              {
                damage: "3d8",
                type: "psychic"
              },
              {
                manual: "If the target has 20 Hit Points or fewer, it drops to 0 Hit Points instead of taking the damage."
              }
            ]
          }
        ],
        text: "A Frightened creature within 30 feet makes a Wisdom save (DC 11) or takes psychic damage; Recharge 5-6."
      },
      {
        id: "illusory-appearance",
        name: "Illusory Appearance",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts Disguise Self using Constitution (spell save DC 13), lasting 24 hours."
          }
        ],
        text: "Disguises itself for a day."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A horrid sea witch whose looks and glare terrify."
  },
  {
    id: "shadow",
    name: "Shadow",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 27,
    speed: {
      walk: 40
    },
    abilities: {
      str: 6,
      dex: 14,
      con: 13,
      int: 6,
      wis: 10,
      cha: 8
    },
    initiative: 2,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      stealth: 6
    },
    resist: [
      "acid",
      "cold",
      "fire",
      "lightning",
      "thunder"
    ],
    vulnerable: [
      "radiant"
    ],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["exhaustion", "frightened", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Frightened, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
      {
        id: "amorphous",
        name: "Amorphous",
        modifiers: [],
        text: "Squeezes through spaces as narrow as 1 inch at no extra movement cost."
      },
      {
        id: "sunlight-weakness",
        name: "Sunlight Weakness",
        modifiers: [],
        text: "Has Disadvantage on D20 Tests while in sunlight. The DM applies this."
      },
      {
        id: "shadow-stealth",
        name: "Shadow Stealth",
        modifiers: [],
        text: "Bonus Action: While in Dim Light or Darkness, it takes the Hide action."
      }
    ],
    actions: [
      {
        id: "draining-swipe",
        name: "Draining Swipe",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "necrotic"
              },
              {
                manual: "The target's Strength score decreases by 1d4, and it dies if that score reaches 0. A Humanoid slain by this attack rises as a Shadow 1d4 hours later."
              }
            ]
          }
        ],
        text: "A melee attack that drains the target's Strength."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead shade that drains strength."
  },
  {
    id: "shambling-mound",
    name: "Shambling Mound",
    source: "SRD 5.2.1",
    size: "large",
    type: "plant",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 110,
    speed: {
      walk: 30,
      swim: 20
    },
    abilities: {
      str: 18,
      dex: 8,
      con: 16,
      int: 5,
      wis: 10,
      cha: 5
    },
    initiative: -1,
    languages: [],
    senses: { blindsight: 60 },
    skills: {
      stealth: 3
    },
    resist: [
      "cold",
      "fire"
    ],
    vulnerable: [],
    immune: [
      "lightning"
    ],
    conditionImmune: ["deafened", "exhaustion"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Deafened, Exhaustion condition(s). The engine applies this."
      },
      {
        id: "lightning-absorption",
        name: "Lightning Absorption",
        modifiers: [],
        text: "When it takes lightning damage, it regains that many Hit Points. The DM applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "charged-tendril", times: 3 }], [{ action: "charged-tendril", times: 2 }, { action: "engulf", times: 1 }]] },
        text: "Makes three Charged Tendril attacks. It can replace one attack with a use of Engulf.",
      },
      {
        id: "charged-tendril",
        name: "Charged Tendril",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "1d6+4",
                type: "bludgeoning"
              },
              {
                damage: "2d4",
                type: "lightning"
              },
              {
                move: 5,
                dir: "toward"
              }
            ]
          }
        ],
        text: "A reach attack with extra lightning damage that pulls a Medium or smaller target 5 feet closer (the engine does not check size)."
      },
      {
        id: "engulf",
        name: "Engulf",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "str",
            dc: 15,
            half: false,
            onFail: [
              {
                condition: "grappled"
              },
              {
                condition: "blinded"
              },
              {
                condition: "restrained"
              },
              {
                manual: "The target is pulled into the mound's space (escape DC 14). While grappled it is Blinded and Restrained, and takes 10 (3d6) lightning damage at the start of each of its turns. The grappled target moves with the mound at no extra cost, and the mound can hold only one creature this way."
              }
            ]
          }
        ],
        text: "Strength save (DC 15) for a Medium or smaller creature within 5 feet, or it is engulfed."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A heap of living plants that crackles with lightning."
  },
  {
    id: "shield-guardian",
    name: "Shield Guardian",
    source: "SRD 5.2.1",
    size: "large",
    type: "construct",
    cr: 7,
    xp: 2900,
    pb: 3,
    ac: 17,
    hp: 142,
    speed: {
      walk: 30
    },
    abilities: {
      str: 18,
      dex: 8,
      con: 18,
      int: 7,
      wis: 10,
      cha: 3
    },
    initiative: -1,
    languages: ["Understands commands given in any language but can’t speak"],
    senses: { blindsight: 10, darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "paralyzed", "petrified", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Petrified, Poisoned condition(s). The engine applies this."
      },
      {
        id: "bound",
        name: "Bound",
        modifiers: [],
        text: "Magically bound to an amulet: the wearer can call it telepathically anywhere on the plane and it knows the amulet's distance and direction. While within 60 feet of the wearer, half of any damage the wearer takes (rounded up) goes to the guardian instead. The DM applies this."
      },
      {
        id: "regeneration",
        name: "Regeneration",
        modifiers: [],
        text: "Regains 10 Hit Points at the start of each of its turns while it has at least 1 Hit Point. The DM applies this."
      },
      {
        id: "spell-storing",
        name: "Spell Storing",
        modifiers: [],
        text: "The amulet's wearer can store one spell of level 4 or lower in it by casting it on the guardian within 5 feet; the guardian can later cast it with the original settings and the caster's ability, and the spell is then lost. The DM applies this."
      },
      {
        id: "protection",
        name: "Protection",
        modifiers: [],
        text: "Reaction: When an attack roll hits the amulet's wearer within 5 feet of it, the wearer gains +5 AC against that attack and until the start of the guardian's next turn. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "fist", times: 2 }],
        text: "Makes two Fist attacks.",
      },
      {
        id: "fist",
        name: "Fist",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d6+4",
                type: "bludgeoning"
              },
              {
                damage: "2d6",
                type: "force"
              }
            ]
          }
        ],
        text: "A melee attack with extra force damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A construct that protects the wearer of its amulet."
  },
  {
    id: "silver-dragon-wyrmling",
    name: "Silver Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 17,
    hp: 45,
    speed: {
      walk: 30,
      fly: 60
    },
    abilities: {
      str: 19,
      dex: 10,
      con: 17,
      int: 12,
      wis: 11,
      cha: 15
    },
    saves: { dex: 2, wis: 2 },
    initiative: 2,
    languages: ["Draconic"],
    senses: { blindsight: 10, darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold"
    ],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Makes two Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d10+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "cold-breath",
        name: "Cold Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "con",
            dc: 13,
            half: true,
            onFail: [
              {
                damage: "4d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "Constitution save (DC 13) or take 4d8 cold damage, half on a success. Recharge 5-6."
      },
      {
        id: "paralyzing-breath",
        name: "Paralyzing Breath",
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            manual: "Each creature in a 15-foot Cone makes a Constitution save (DC 13). First failure: Incapacitated until the end of its next turn, when it saves again. Second failure: Paralyzed, repeating the save at the end of each of its turns; after 1 minute it succeeds automatically."
          }
        ],
        text: "A 15-foot cone that incapacitates, then paralyzes."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young dragon with a cold breath and a paralyzing breath."
  },
  {
    id: "young-silver-dragon",
    name: "Young Silver Dragon",
    source: "SRD 5.2.1",
    size: "large",
    type: "dragon",
    cr: 9,
    xp: 5000,
    pb: 4,
    ac: 18,
    hp: 168,
    speed: {
      walk: 40,
      fly: 80
    },
    abilities: {
      str: 23,
      dex: 10,
      con: 21,
      int: 14,
      wis: 11,
      cha: 19
    },
    saves: { dex: 4, wis: 4 },
    initiative: 4,
    languages: ["Common", "Draconic"],
    senses: { blindsight: 30, darkvision: 120 },
    skills: {
      history: 6,
      perception: 8,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold"
    ],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Makes three Rend attacks. It can replace one attack with a use of Paralyzing Breath."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "2d8+6",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "cold-breath",
        name: "Cold Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            save: "con",
            dc: 17,
            half: true,
            onFail: [
              {
                damage: "11d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "Constitution save (DC 17) or take 11d8 cold damage, half on a success. Recharge 5-6."
      },
      {
        id: "paralyzing-breath",
        name: "Paralyzing Breath",
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            manual: "Each creature in a 30-foot Cone makes a Constitution save (DC 17). First failure: Incapacitated until the end of its next turn, when it saves again. Second failure: Paralyzed, repeating the save at the end of each of its turns; after 1 minute it succeeds automatically."
          }
        ],
        text: "A 30-foot cone that incapacitates, then paralyzes."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young dragon with a cold breath and a paralyzing breath."
  },
  {
    id: "warhorse-skeleton",
    name: "Warhorse Skeleton",
    source: "SRD 5.2.1",
    size: "large",
    type: "undead",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 13,
    hp: 22,
    speed: {
      walk: 60
    },
    abilities: {
      str: 18,
      dex: 12,
      con: 15,
      int: 2,
      wis: 8,
      cha: 5
    },
    initiative: 1,
    languages: [],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [
      "bludgeoning"
    ],
    immune: [
      "poison"
    ],
    conditionImmune: ["exhaustion", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Poisoned condition(s). The engine applies this."
      }
    ],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d6+4",
                type: "bludgeoning"
              },
              {
                manual: "If the target is Large or smaller and the skeleton moved 20 or more feet straight toward it just before the hit, the target has the Prone condition."
              }
            ]
          }
        ],
        text: "A melee attack that knocks a target Prone after a charge, which the DM applies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "The animated bones of a charging steed."
  },
  {
    id: "solar",
    name: "Solar",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 21,
    xp: 33000,
    pb: 7,
    ac: 21,
    hp: 297,
    speed: {
      walk: 50,
      fly: 150
    },
    abilities: {
      str: 26,
      dex: 22,
      con: 26,
      int: 25,
      wis: 25,
      cha: 30
    },
    initiative: 20,
    languages: ["All", "telepathy 120 ft."],
    senses: { truesight: 120 },
    hover: true,
    skills: {
      perception: 14
    },
    resist: [],
    vulnerable: [],
    immune: [
      "poison",
      "radiant"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Poisoned condition(s). The engine applies this."
      },
      {
        id: "divine-awareness",
        name: "Divine Awareness",
        modifiers: [],
        text: "Knows when it hears a lie."
      },
      {
        id: "exalted-restoration",
        name: "Exalted Restoration",
        modifiers: [],
        text: "If it dies outside Mount Celestia, it gets a new body at once, with all its Hit Points, somewhere in Mount Celestia."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 4 times a day. The DM tracks the uses."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "divine-aid",
        name: "Divine Aid",
        modifiers: [],
        text: "Bonus Action (3/Day): Casts Cure Wounds (level 2 version), Lesser Restoration or Remove Curse, with its Spellcasting ability. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round. Blinding Gaze: one creature it can see within 120 feet makes a Constitution save (DC 25) or is Blinded for 1 minute (it cannot repeat this until the start of its next turn). Radiant Teleport: teleports up to 60 feet to a free space it can see, and each creature within 10 feet of the destination makes a Dexterity save (DC 25) or takes 11 (2d10) radiant damage, half on a success. The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["flying-sword", "flying-sword-thrown"], times: 2 }], [{ action: ["flying-sword", "flying-sword-thrown"], times: 1 }, { action: "slaying-bow", times: 1 }]] },
        text: "Makes two Flying Sword attacks. It can replace one attack with a use of Slaying Bow.",
      },
      {
        id: "flying-sword",
        name: "Flying Sword",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 15,
            onHit: [
              {
                damage: "4d6+8",
                type: "slashing"
              },
              {
                damage: "8d8",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A sword attack, melee or thrown, with extra radiant damage; the sword returns to the solar's hand or hovers beside it after a thrown attack."
      },
      {
        id: "flying-sword-thrown",
        name: "Flying Sword (thrown)",
        target: {
          creature: {
            range: [
              120,
              120
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 15,
            onHit: [
              {
                damage: "4d6+8",
                type: "slashing"
              },
              {
                damage: "8d8",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A sword attack, melee or thrown, with extra radiant damage; the sword returns to the solar's hand or hovers beside it after a thrown attack."
      },
      {
        id: "slaying-bow",
        name: "Slaying Bow",
        target: {
          creature: {
            range: [
              600,
              600
            ]
          }
        },
        effects: [
          {
            save: "dex",
            dc: 21,
            half: false,
            onFail: [
              {
                damage: "4d8+6",
                type: "piercing"
              },
              {
                damage: "8d8",
                type: "radiant"
              },
              {
                manual: "If the target has 100 Hit Points or fewer, it dies instead of taking the damage."
              }
            ]
          }
        ],
        text: "Dexterity save (DC 21) for a creature within 600 feet, or it dies if it has 100 Hit Points or fewer, and otherwise takes piercing and radiant damage."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Charisma (spell save DC 25). At will: Detect Evil and Good. 1 a day each: Commune, Control Weather, Dispel Evil and Good, Resurrection."
          }
        ],
        text: "Casts solar spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A mighty angel with a flying sword and a slaying bow."
  },
  {
    id: "specter",
    name: "Specter",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 12,
    hp: 22,
    speed: {
      walk: 30,
      fly: 50
    },
    abilities: {
      str: 1,
      dex: 14,
      con: 11,
      int: 10,
      wis: 10,
      cha: 11
    },
    initiative: 2,
    languages: ["Understands Common plus one other language but can’t speak"],
    senses: { darkvision: 60 },
    hover: true,
    resist: [
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "lightning",
      "piercing",
      "slashing",
      "thunder"
    ],
    vulnerable: [],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
      {
        id: "incorporeal-movement",
        name: "Incorporeal Movement",
        modifiers: [],
        text: "Moves through creatures and objects as if they were Difficult Terrain, and takes 5 (1d10) force damage if it ends its turn inside an object. The DM applies this."
      },
      {
        id: "sunlight-sensitivity",
        name: "Sunlight Sensitivity",
        modifiers: [],
        text: "Has Disadvantage on ability checks and attack rolls while in sunlight. The DM applies this."
      }
    ],
    actions: [
      {
        id: "life-drain",
        name: "Life Drain",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d6",
                type: "necrotic"
              },
              {
                manual: "If the target is a creature, its Hit Point maximum decreases by the damage taken."
              }
            ]
          }
        ],
        text: "A melee necrotic attack that lowers the target's Hit Point maximum."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead spirit that drains life from the living."
  },
  {
    id: "sphinx-of-wonder",
    name: "Sphinx of Wonder",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "celestial",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 13,
    hp: 24,
    speed: {
      walk: 20,
      fly: 40
    },
    abilities: {
      str: 6,
      dex: 17,
      con: 13,
      int: 15,
      wis: 12,
      cha: 11
    },
    initiative: 3,
    languages: ["Celestial", "Common"],
    senses: { darkvision: 60 },
    skills: {
      arcana: 4,
      religion: 4,
      stealth: 5
    },
    resist: [
      "necrotic",
      "psychic",
      "radiant"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "burst-of-ingenuity",
        name: "Burst of Ingenuity",
        modifiers: [],
        text: "Reaction (2/Day): When it or another creature within 30 feet makes an ability check or a saving throw, it adds 2 to the roll. The DM applies this."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "slashing"
              },
              {
                damage: "2d6",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny winged sphinx that bolsters its friends."
  },
  {
    id: "sphinx-of-lore",
    name: "Sphinx of Lore",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 11,
    xp: 7200,
    pb: 4,
    ac: 17,
    hp: 170,
    speed: {
      walk: 40,
      fly: 60
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 16,
      int: 18,
      wis: 18,
      cha: 18
    },
    initiative: 10,
    languages: ["Celestial", "Common"],
    senses: { truesight: 120 },
    skills: {
      arcana: 12,
      history: 12,
      perception: 8,
      religion: 12
    },
    resist: [
      "necrotic",
      "radiant"
    ],
    vulnerable: [],
    immune: [
      "psychic"
    ],
    conditionImmune: ["charmed", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened condition(s). The engine applies this."
      },
      {
        id: "inscrutable",
        name: "Inscrutable",
        modifiers: [],
        text: "No magic can observe it remotely or read its thoughts without its leave, and Insight checks to judge its intent or sincerity have Disadvantage."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day, or 4 in its lair. The DM tracks the uses."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round (4 in its lair). Arcane Prowl: teleports up to 30 feet to a free space it can see and makes one Claw attack. Weight of Years: one creature it can see within 120 feet makes a Constitution save (DC 16) or gains 1 Exhaustion level and looks 3d10 years older while exhausted (it cannot repeat this until the start of its next turn). The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "claw", times: 3 }],
        text: "Makes three Claw attacks.",
      },
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 8,
            onHit: [
              {
                damage: "3d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "mind-rending-roar",
        name: "Mind-Rending Roar",
        recharge: [5, 6],
        target: {
          area: {
            shape: "emanation",
            size: 300
          }
        },
        effects: [
          {
            save: "wis",
            dc: 16,
            half: false,
            onFail: [
              {
                damage: "10d6",
                type: "psychic"
              },
              {
                condition: "incapacitated",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "Enemies within 300 feet make a Wisdom save (DC 16) or take psychic damage and are Incapacitated until the start of the sphinx's next turn. Recharge 5-6."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Intelligence (spell save DC 16). At will: Detect Magic, Identify, Mage Hand, Minor Illusion, Prestidigitation. 1 a day each: Dispel Magic, Legend Lore, Locate Object, Plane Shift, Remove Curse, Tongues."
          }
        ],
        text: "Casts sphinx spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A great sphinx of secrets and ancient knowledge."
  },
  {
    id: "sphinx-of-valor",
    name: "Sphinx of Valor",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 17,
    xp: 18000,
    pb: 6,
    ac: 17,
    hp: 199,
    speed: {
      walk: 40,
      fly: 60
    },
    abilities: {
      str: 22,
      dex: 10,
      con: 20,
      int: 16,
      wis: 23,
      cha: 18
    },
    saves: { dex: 6, con: 11, int: 9, wis: 12 },
    initiative: 12,
    languages: ["Celestial", "Common"],
    senses: { truesight: 120 },
    skills: {
      arcana: 9,
      perception: 12,
      religion: 15
    },
    resist: [
      "necrotic",
      "radiant"
    ],
    vulnerable: [],
    immune: [
      "psychic"
    ],
    conditionImmune: ["charmed", "frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened condition(s). The engine applies this."
      },
      {
        id: "inscrutable",
        name: "Inscrutable",
        modifiers: [],
        text: "No magic can observe it remotely or read its thoughts without its leave, and Insight checks to judge its intent or sincerity have Disadvantage."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day, or 4 in its lair. The DM tracks the uses."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Makes two Claw attacks and uses Roar."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round (4 in its lair). Arcane Prowl: teleports up to 30 feet to a free space it can see and makes one Claw attack. Weight of Years: one creature it can see within 120 feet makes a Constitution save (DC 16) or gains 1 Exhaustion level and looks 3d10 years older while exhausted (it cannot repeat this until the start of its next turn). The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 12,
            onHit: [
              {
                damage: "4d6+6",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "roar",
        name: "Roar",
        uses: { per: "day", n: 3 },
        target: {
          self: true
        },
        effects: [
          {
            manual: "The sphinx roars, and each roar differs (the sequence resets on a Long Rest). First Roar: each enemy in a 500-foot Emanation makes a Wisdom save (DC 20) or is Frightened for 1 minute. Second Roar and Third Roar are listed as their own actions."
          }
        ],
        text: "A magical roar with three stages; 3 a day."
      },
      {
        id: "second-roar",
        name: "Second Roar",
        target: {
          area: {
            shape: "emanation",
            size: 500
          }
        },
        effects: [
          {
            save: "wis",
            dc: 20,
            half: false,
            onFail: [
              {
                condition: "paralyzed",
                ends: {
                  on: "save",
                  save: "wis",
                  at: "turnEnd"
                }
              },
              {
                manual: "After 1 minute the target succeeds on the save automatically."
              }
            ]
          }
        ],
        text: "The second of the sphinx's three roars: enemies within 500 feet make a Wisdom save (DC 20) or are Paralyzed, repeating the save each turn."
      },
      {
        id: "third-roar",
        name: "Third Roar",
        target: {
          area: {
            shape: "emanation",
            size: 500
          }
        },
        effects: [
          {
            save: "con",
            dc: 20,
            half: true,
            onFail: [
              {
                damage: "8d10",
                type: "thunder"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "The third of the sphinx's three roars: enemies within 500 feet make a Constitution save (DC 20) or take thunder damage and are knocked Prone."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Wisdom (spell save DC 20). At will: Detect Evil and Good, Thaumaturgy. 1 a day each: Detect Magic, Dispel Magic, Greater Restoration, Heroes' Feast, Zone of Truth."
          }
        ],
        text: "Casts sphinx spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A great sphinx whose roars terrify, paralyze and blast."
  },
  {
    id: "spirit-naga",
    name: "Spirit Naga",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 17,
    hp: 135,
    speed: {
      walk: 40
    },
    abilities: {
      str: 18,
      dex: 17,
      con: 14,
      int: 16,
      wis: 15,
      cha: 16
    },
    saves: { dex: 6, con: 5, wis: 5, cha: 6 },
    initiative: 3,
    languages: ["Abyssal", "Common"],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["charmed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Poisoned condition(s). The engine applies this."
      },
      {
        id: "fiendish-restoration",
        name: "Fiendish Restoration",
        modifiers: [],
        text: "If it dies, it returns to life in 1d6 days with all its Hit Points; only a Wish spell prevents this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["bite", "necrotic-ray"], times: 3 }],
        text: "Makes three attacks, using Bite or Necrotic Ray in any combination.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "1d6+4",
                type: "piercing"
              },
              {
                damage: "4d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      },
      {
        id: "necrotic-ray",
        name: "Necrotic Ray",
        target: {
          creature: {
            range: [
              60,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "6d6",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A ranged attack."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Somatic or Material components, using Intelligence (spell save DC 14). At will: Detect Magic, Mage Hand, Minor Illusion, Water Breathing. 2 a day each: Detect Thoughts, Dimension Door, Hold Person (level 3 version), Lightning Bolt (level 4 version)."
          }
        ],
        text: "Casts naga spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fiendish serpent with a human head and spells."
  },
  {
    id: "sprite",
    name: "Sprite",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "fey",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 15,
    hp: 10,
    speed: {
      walk: 10,
      fly: 40
    },
    abilities: {
      str: 3,
      dex: 18,
      con: 10,
      int: 14,
      wis: 13,
      cha: 11
    },
    initiative: 4,
    languages: ["Common", "Elvish", "Sylvan"],
    skills: {
      perception: 3,
      stealth: 8
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "needle-sword",
        name: "Needle Sword",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d4+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "enchanting-bow",
        name: "Enchanting Bow",
        target: {
          creature: {
            range: [
              40,
              160
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              },
              {
                condition: "charmed",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A ranged attack that Charms the target until the start of the sprite's next turn."
      },
      {
        id: "heart-sight",
        name: "Heart Sight",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "cha",
            dc: 10,
            half: false,
            onFail: [
              {
                manual: "The sprite learns the target's emotions and alignment. Celestials, Fiends and Undead automatically fail the save."
              }
            ]
          }
        ],
        text: "A creature within 5 feet makes a Charisma save (DC 10) or the sprite learns its emotions and alignment."
      },
      {
        id: "invisibility",
        name: "Invisibility",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts Invisibility on itself, with no components, using Charisma."
          }
        ],
        text: "Turns itself Invisible."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny fey archer who can turn invisible."
  },
  {
    id: "spy",
    name: "Spy",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 12,
    hp: 27,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 10,
      dex: 15,
      con: 10,
      int: 12,
      wis: 14,
      cha: 16
    },
    initiative: 4,
    languages: ["Common plus one other language"],
    skills: {
      deception: 5,
      insight: 4,
      investigation: 5,
      perception: 6,
      "sleight-of-hand": 4,
      stealth: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "cunning-action",
        name: "Cunning Action",
        modifiers: [],
        text: "Bonus Action: Takes the Dash, Disengage or Hide action. The DM applies this."
      }
    ],
    actions: [
      {
        id: "shortsword",
        name: "Shortsword",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "piercing"
              },
              {
                damage: "2d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      },
      {
        id: "hand-crossbow",
        name: "Hand Crossbow",
        target: {
          creature: {
            range: [
              30,
              120
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "piercing"
              },
              {
                damage: "2d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A ranged attack with extra poison damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A secretive agent with poisoned blades."
  },
  {
    id: "stirge",
    name: "Stirge",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "monstrosity",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 13,
    hp: 5,
    speed: {
      walk: 10,
      fly: 40
    },
    abilities: {
      str: 4,
      dex: 16,
      con: 11,
      int: 2,
      wis: 8,
      cha: 6
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "proboscis",
        name: "Proboscis",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
                type: "piercing"
              },
              {
                damage: "2d4",
                type: "necrotic"
              },
              {
                manual: "The stirge attaches to the target. While attached it cannot make Proboscis attacks, and the target takes 5 (2d4) necrotic damage at the start of each of the stirge's turns. The stirge can detach by spending 5 feet of movement; the target or a creature within 5 feet can detach it with an action."
              }
            ]
          }
        ],
        text: "A melee attack after which the stirge clings on and drains blood each turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny flier that latches on and sucks blood."
  },
  {
    id: "stone-giant",
    name: "Stone Giant",
    source: "SRD 5.2.1",
    size: "huge",
    type: "giant",
    cr: 7,
    xp: 2900,
    pb: 3,
    ac: 17,
    hp: 126,
    speed: {
      walk: 40
    },
    abilities: {
      str: 23,
      dex: 15,
      con: 20,
      int: 10,
      wis: 12,
      cha: 9
    },
    saves: { dex: 5, con: 8, wis: 4 },
    initiative: 5,
    languages: ["Giant"],
    senses: { darkvision: 60 },
    skills: {
      athletics: 12,
      perception: 4,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "deflect-missile",
        name: "Deflect Missile",
        modifiers: [],
        text: "Reaction (Recharge 5-6): When a ranged attack roll hits it for bludgeoning, piercing or slashing damage, it reduces that damage by 11 (1d10 + 6). If the damage drops to 0, one creature it can see within 60 feet makes a Dexterity save (DC 17) or takes 11 (1d10 + 6) force damage. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["stone-club", "boulder"], times: 2 }],
        text: "Makes two attacks, using Stone Club or Boulder in any combination.",
      },
      {
        id: "stone-club",
        name: "Stone Club",
        target: {
          creature: {
            reach: 15
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 9,
            onHit: [
              {
                damage: "3d10+6",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "boulder",
        name: "Boulder",
        target: {
          creature: {
            range: [
              60,
              240
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 9,
            onHit: [
              {
                damage: "2d8+6",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A ranged attack, knocks the target Prone if it is Large or smaller."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge, rock-hurling giant of the mountains."
  },
  {
    id: "stone-golem",
    name: "Stone Golem",
    source: "SRD 5.2.1",
    size: "large",
    type: "construct",
    cr: 10,
    xp: 5900,
    pb: 4,
    ac: 18,
    hp: 220,
    speed: {
      walk: 30
    },
    abilities: {
      str: 22,
      dex: 9,
      con: 20,
      int: 3,
      wis: 11,
      cha: 1
    },
    initiative: 3,
    languages: ["Understands Common plus two other languages but can’t speak"],
    senses: { darkvision: 120 },
    resist: [],
    vulnerable: [],
    immune: [
      "poison",
      "psychic"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "paralyzed", "petrified", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Petrified, Poisoned condition(s). The engine applies this."
      },
      {
        id: "immutable-form",
        name: "Immutable Form",
        modifiers: [],
        text: "Cannot be shape-shifted."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "slow",
        name: "Slow",
        modifiers: [],
        text: "Bonus Action (Recharge 5-6): Casts Slow (Constitution, save DC 17, no components). The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["slam", "force-bolt"], times: 2 }],
        text: "Makes two attacks, using Slam or Force Bolt in any combination.",
      },
      {
        id: "slam",
        name: "Slam",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "2d8+6",
                type: "bludgeoning"
              },
              {
                damage: "2d8",
                type: "force"
              }
            ]
          }
        ],
        text: "A melee attack with extra force damage."
      },
      {
        id: "force-bolt",
        name: "Force Bolt",
        target: {
          creature: {
            range: [
              120,
              120
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 9,
            onHit: [
              {
                damage: "4d10",
                type: "force"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A construct of carved rock that can slow foes."
  },
  {
    id: "storm-giant",
    name: "Storm Giant",
    source: "SRD 5.2.1",
    size: "huge",
    type: "giant",
    cr: 13,
    xp: 10000,
    pb: 5,
    ac: 16,
    hp: 230,
    speed: {
      walk: 50,
      fly: 25,
      swim: 50
    },
    abilities: {
      str: 29,
      dex: 14,
      con: 20,
      int: 16,
      wis: 20,
      cha: 18
    },
    saves: { str: 14, con: 10, wis: 10, cha: 9 },
    initiative: 7,
    languages: ["Common", "Giant"],
    senses: { darkvision: 120, truesight: 30 },
    hover: true,
    skills: {
      arcana: 8,
      athletics: 14,
      history: 8,
      perception: 10
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "lightning",
      "thunder"
    ],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["storm-sword", "thunderbolt"], times: 2 }],
        text: "Makes two attacks, using Storm Sword or Thunderbolt in any combination.",
      },
      {
        id: "storm-sword",
        name: "Storm Sword",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "4d6+9",
                type: "slashing"
              },
              {
                damage: "3d8",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A melee attack with extra lightning damage."
      },
      {
        id: "thunderbolt",
        name: "Thunderbolt",
        target: {
          creature: {
            range: [
              500,
              500
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 14,
            onHit: [
              {
                damage: "2d12+9",
                type: "lightning"
              },
              {
                condition: "blinded",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              },
              {
                condition: "deafened",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A ranged lightning attack that Blinds and Deafens the target until the start of the giant's next turn."
      },
      {
        id: "lightning-storm",
        name: "Lightning Storm",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cylinder",
            size: 10,
            height: 40
          }
        },
        effects: [
          {
            save: "dex",
            dc: 18,
            half: true,
            onFail: [
              {
                damage: "10d10",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A 10-foot-radius, 40-foot-high cylinder centered on a point within 500 feet: Dexterity save (DC 18) or lightning damage, half on a success. Recharge 5-6."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no Material components, using Wisdom (spell save DC 18). At will: Detect Magic, Light. 1 a day: Control Weather."
          }
        ],
        text: "Casts giant spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A towering giant of storms and lightning."
  },
  {
    id: "succubus",
    name: "Succubus",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 15,
    hp: 71,
    speed: {
      walk: 30,
      fly: 60
    },
    abilities: {
      str: 8,
      dex: 17,
      con: 13,
      int: 15,
      wis: 12,
      cha: 20
    },
    initiative: 3,
    languages: ["Abyssal", "Common", "Infernal", "telepathy 60 ft."],
    senses: { darkvision: 60 },
    skills: {
      deception: 9,
      insight: 5,
      perception: 5,
      persuasion: 9,
      stealth: 7
    },
    resist: [
      "cold",
      "fire",
      "poison",
      "psychic"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "incubus-form",
        name: "Incubus Form",
        modifiers: [],
        text: "After a Long Rest it can take the Incubus stat block instead of this one."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Makes one Fiendish Touch attack and uses Charm or Draining Kiss."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Medium or Small Humanoid, or returns to its true form. Statistics are unchanged, except that its Fly speed works only in true form; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "fiendish-touch",
        name: "Fiendish Touch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d10+5",
                type: "psychic"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "charm",
        name: "Charm",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts Dominate Person (level 8 version), with no components, using Charisma (spell save DC 15)."
          }
        ],
        text: "Dominates a creature."
      },
      {
        id: "draining-kiss",
        name: "Draining Kiss",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 15,
            half: true,
            onFail: [
              {
                damage: "3d8",
                type: "psychic"
              },
              {
                manual: "Whether the save succeeds or fails, the target's Hit Point maximum decreases by an amount equal to the damage taken."
              }
            ]
          }
        ],
        text: "A kiss on a creature it has Charmed within 5 feet: Constitution save (DC 15) or psychic damage (half on a success), and the target's Hit Point maximum drops by the damage taken."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fiend that charms and drains with a kiss."
  },
  {
    id: "tarrasque",
    name: "Tarrasque",
    source: "SRD 5.2.1",
    size: "gargantuan",
    type: "monstrosity",
    cr: 30,
    xp: 155000,
    pb: 9,
    ac: 25,
    hp: 697,
    speed: {
      walk: 60,
      burrow: 40,
      climb: 60
    },
    abilities: {
      str: 30,
      dex: 11,
      con: 30,
      int: 3,
      wis: 11,
      cha: 11
    },
    saves: { dex: 9, int: 5, wis: 9, cha: 9 },
    initiative: 18,
    languages: [],
    senses: { blindsight: 120 },
    skills: {
      perception: 9
    },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    conditionImmune: ["charmed", "deafened", "frightened", "paralyzed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Frightened, Paralyzed, Poisoned condition(s). The engine applies this."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 6 times a day. The DM tracks the uses."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "reflective-carapace",
        name: "Reflective Carapace",
        modifiers: [],
        text: "If targeted by Magic Missile or a spell that needs a ranged attack roll, roll 1d6: on 1 to 5 it is unaffected; on a 6 it is unaffected and the spell is turned back on the caster. The DM applies this."
      },
      {
        id: "siege-monster",
        name: "Siege Monster",
        modifiers: [],
        text: "Deals double damage to objects and structures."
      },
      {
        id: "swallow",
        name: "Swallow",
        modifiers: [],
        text: "Bonus Action: A Large or smaller creature it has Grappled makes a Strength save (DC 27) or is swallowed (up to six at once): Blinded, Restrained, unable to teleport, with total cover from outside, and takes 56 (16d6) acid damage at the start of each of the tarrasque's turns. If it takes 60 or more damage in a turn from inside, it makes a Constitution save (DC 20) at the end of that turn or regurgitates everyone, Prone, within 10 feet. If it dies, swallowed creatures can leave using 20 feet of movement. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round. Onslaught: moves up to half its Speed and makes one Claw or Tail attack. World-Shaking Movement: moves up to its Speed, then sends a shock wave through a 60-foot emanation: creatures in it lose Concentration and, if Medium or smaller, fall Prone (it cannot repeat this until the start of its next turn). The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: ["claw", "tail"], times: 3 }],
        text: "Makes one Bite attack and three other attacks, using Claw or Tail in any combination.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 15
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 19,
            onHit: [
              {
                damage: "4d12+10",
                type: "piercing"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 20. The Restrained condition lasts only until the grapple ends, and while Restrained the target cannot teleport."
              }
            ]
          }
        ],
        text: "A melee attack that grapples and restrains the target (escape DC 20)."
      },
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 15
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 19,
            onHit: [
              {
                damage: "4d8+10",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "tail",
        name: "Tail",
        target: {
          creature: {
            reach: 30
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 19,
            onHit: [
              {
                damage: "3d8+10",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack, knocks the target Prone if it is Huge or smaller."
      },
      {
        id: "thunderous-bellow",
        name: "Thunderous Bellow",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 150
          }
        },
        effects: [
          {
            save: "con",
            dc: 27,
            half: true,
            onFail: [
              {
                damage: "12d12",
                type: "thunder"
              },
              {
                condition: "deafened",
                ends: {
                  on: "turnEnd",
                  of: "target"
                }
              },
              {
                condition: "frightened",
                ends: {
                  on: "turnEnd",
                  of: "target"
                }
              }
            ]
          }
        ],
        text: "A 150-foot cone: Constitution save (DC 27) or thunder damage plus Deafened and Frightened until the end of its next turn. It also hits unattended objects. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "The legendary titan-sized scourge of the world."
  },
  {
    id: "tough",
    name: "Tough",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 32,
    speed: {
      walk: 30
    },
    abilities: {
      str: 15,
      dex: 12,
      con: 14,
      int: 10,
      wis: 10,
      cha: 11
    },
    initiative: 1,
    languages: ["Common"],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      }
    ],
    actions: [
      {
        id: "mace",
        name: "Mace",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "heavy-crossbow",
        name: "Heavy Crossbow",
        target: {
          creature: {
            range: [
              100,
              400
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d10+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A street thug who fights in a pack."
  },
  {
    id: "tough-boss",
    name: "Tough Boss",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 16,
    hp: 82,
    speed: {
      walk: 30
    },
    abilities: {
      str: 17,
      dex: 14,
      con: 16,
      int: 11,
      wis: 10,
      cha: 11
    },
    saves: { str: 5, con: 5, cha: 2 },
    initiative: 2,
    languages: ["Common plus one other language"],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["warhammer", "heavy-crossbow"], times: 2 }],
        text: "Makes two attacks, using Warhammer or Heavy Crossbow in any combination.",
      },
      {
        id: "warhammer",
        name: "Warhammer",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d8+3",
                type: "bludgeoning"
              },
              {
                move: 10,
                dir: "away"
              }
            ]
          }
        ],
        text: "A melee attack that pushes a Large or smaller target up to 10 feet away (the engine does not check size and pushes the full distance)."
      },
      {
        id: "heavy-crossbow",
        name: "Heavy Crossbow",
        target: {
          creature: {
            range: [
              100,
              400
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d10+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A gang leader with a warhammer and a crossbow."
  },
  {
    id: "treant",
    name: "Treant",
    source: "SRD 5.2.1",
    size: "huge",
    type: "plant",
    cr: 9,
    xp: 5000,
    pb: 4,
    ac: 16,
    hp: 138,
    speed: {
      walk: 30
    },
    abilities: {
      str: 23,
      dex: 8,
      con: 21,
      int: 12,
      wis: 16,
      cha: 12
    },
    initiative: 3,
    languages: ["Common", "Druidic", "Elvish", "Sylvan"],
    resist: [
      "bludgeoning",
      "piercing"
    ],
    vulnerable: [
      "fire"
    ],
    immune: [],
    traits: [
      {
        id: "siege-monster",
        name: "Siege Monster",
        modifiers: [],
        text: "Deals double damage to objects and structures."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "slam", times: 2 }],
        text: "Makes two Slam attacks.",
      },
      {
        id: "slam",
        name: "Slam",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "3d6+6",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "hail-of-bark",
        name: "Hail of Bark",
        target: {
          creature: {
            range: [
              180,
              180
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "4d10+6",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      },
      {
        id: "animate-trees",
        name: "Animate Trees",
        uses: { per: "day", n: 1 },
        target: {
          self: true
        },
        effects: [
          {
            manual: "Animates up to two trees it can see within 60 feet. Each uses the Treant stat block, except Intelligence and Charisma are 1, it cannot speak, and it lacks this action. Each tree acts right after the treant on its initiative count, obeys it, and stays animate for 1 day or until it dies, the treant dies, or it is more than 120 feet away; then it takes root again."
          }
        ],
        text: "Wakes up to two trees to fight for it; 1 a day."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge walking tree guardian of the forest."
  },
  {
    id: "troll",
    name: "Troll",
    source: "SRD 5.2.1",
    size: "large",
    type: "giant",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 94,
    speed: {
      walk: 30
    },
    abilities: {
      str: 18,
      dex: 13,
      con: 20,
      int: 7,
      wis: 9,
      cha: 7
    },
    initiative: 1,
    languages: ["Giant"],
    senses: { darkvision: 60 },
    skills: {
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "loathsome-limbs",
        name: "Loathsome Limbs",
        modifiers: [],
        text: "If it ends a turn Bloodied after taking 15 or more slashing damage that turn, a limb is severed and becomes a Troll Limb that acts right after the troll. The troll gains 1 Exhaustion level per missing limb and regrows limbs the next time it regains Hit Points. The DM applies this. (4/Day, not tracked)"
      },
      {
        id: "regeneration",
        name: "Regeneration",
        modifiers: [],
        text: "Regains 15 Hit Points at the start of each of its turns. Acid or fire damage switches this off for its next turn. It dies only if it starts a turn at 0 Hit Points and does not regenerate. The DM applies this."
      },
      {
        id: "charge",
        name: "Charge",
        modifiers: [],
        text: "Bonus Action: Moves up to half its Speed straight toward an enemy it can see. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 3 }],
        text: "Makes three Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A regenerating giant that rends with claws."
  },
  {
    id: "troll-limb",
    name: "Troll Limb",
    source: "SRD 5.2.1",
    size: "small",
    type: "giant",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 13,
    hp: 14,
    speed: {
      walk: 20
    },
    abilities: {
      str: 18,
      dex: 12,
      con: 10,
      int: 1,
      wis: 9,
      cha: 1
    },
    initiative: 1,
    languages: [],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "regeneration",
        name: "Regeneration",
        modifiers: [],
        text: "Regains 5 Hit Points at the start of each of its turns. Acid or fire damage switches this off for its next turn. It dies only if it starts a turn at 0 Hit Points and does not regenerate. The DM applies this."
      },
      {
        id: "troll-spawn",
        name: "Troll Spawn",
        modifiers: [],
        text: "Has a troll's senses. If not destroyed within 24 hours, roll 1d12: on a 12 it grows into a Troll, otherwise it withers away."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d4+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A severed troll limb that fights on."
  },
  {
    id: "unicorn",
    name: "Unicorn",
    source: "SRD 5.2.1",
    size: "large",
    type: "celestial",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 12,
    hp: 97,
    speed: {
      walk: 50
    },
    abilities: {
      str: 18,
      dex: 14,
      con: 15,
      int: 11,
      wis: 17,
      cha: 16
    },
    initiative: 8,
    languages: ["Celestial", "Elvish", "Sylvan", "telepathy 120 ft."],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["charmed", "paralyzed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Paralyzed, Poisoned condition(s). The engine applies this."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day. The DM tracks the uses."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "unicorns-blessing",
        name: "Unicorn’s Blessing",
        modifiers: [],
        text: "Bonus Action (3/Day): Touches another creature with its horn and casts Cure Wounds or Lesser Restoration on it, with its Spellcasting ability. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round. Charging Horn: moves up to half its Speed without provoking Opportunity Attacks and makes one Radiant Horn attack. Shimmering Shield: it or a creature it can see within 60 feet gains 10 (3d6) Temporary Hit Points and +2 AC until the end of the unicorn's next turn (it cannot repeat this until the start of its next turn). The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "hooves", times: 1 }, { action: "radiant-horn", times: 1 }],
        text: "Makes one Hooves attack and one Radiant Horn attack.",
      },
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d6+4",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "radiant-horn",
        name: "Radiant Horn",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "1d10+4",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Casts one spell per action, with no components, using Charisma (spell save DC 14). At will: Detect Evil and Good, Druidcraft. 1 a day each: Calm Emotions, Dispel Evil and Good, Entangle, Pass without Trace, Word of Recall."
          }
        ],
        text: "Casts unicorn spells."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A radiant horned guardian of the wild."
  },
  {
    id: "vampire-familiar",
    name: "Vampire Familiar",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 15,
    hp: 65,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 17,
      dex: 16,
      con: 15,
      int: 10,
      wis: 10,
      cha: 14
    },
    saves: { dex: 5, wis: 2 },
    initiative: 5,
    languages: ["Common plus one other language"],
    senses: { darkvision: 60 },
    skills: {
      perception: 4,
      persuasion: 4,
      stealth: 7
    },
    resist: [
      "necrotic"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed condition except from its vampire master. The engine has no field for condition immunities yet."
      },
      {
        id: "vampiric-connection",
        name: "Vampiric Connection",
        modifiers: [],
        text: "While on the same plane as its vampire master, the vampire can speak to it telepathically and perceive through its senses."
      },
      {
        id: "deathless-agility",
        name: "Deathless Agility",
        modifiers: [],
        text: "Bonus Action: Takes the Dash or Disengage action."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["umbral-dagger", "umbral-dagger-thrown"], times: 2 }],
        text: "Makes two Umbral Dagger attacks.",
      },
      {
        id: "umbral-dagger",
        name: "Umbral Dagger",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "piercing"
              },
              {
                damage: "3d4",
                type: "necrotic"
              },
              {
                manual: "If the target is reduced to 0 Hit Points by this attack, it becomes Stable but Poisoned for 1 hour, and while Poisoned it is also Paralyzed."
              }
            ]
          }
        ],
        text: "A dagger attack, melee or thrown, with extra necrotic damage; a target dropped to 0 Hit Points is left Stable, Poisoned and Paralyzed."
      },
      {
        id: "umbral-dagger-thrown",
        name: "Umbral Dagger (thrown)",
        target: {
          creature: {
            range: [
              20,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "piercing"
              },
              {
                damage: "3d4",
                type: "necrotic"
              },
              {
                manual: "If the target is reduced to 0 Hit Points by this attack, it becomes Stable but Poisoned for 1 hour, and while Poisoned it is also Paralyzed."
              }
            ]
          }
        ],
        text: "A dagger attack, melee or thrown, with extra necrotic damage; a target dropped to 0 Hit Points is left Stable, Poisoned and Paralyzed."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A bound servant of a vampire."
  },
  {
    id: "vampire-spawn",
    name: "Vampire Spawn",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 16,
    hp: 90,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 16,
      con: 16,
      int: 11,
      wis: 10,
      cha: 12
    },
    saves: { dex: 6, wis: 3 },
    initiative: 3,
    languages: ["Common plus one other language"],
    senses: { darkvision: 60 },
    skills: {
      perception: 3,
      stealth: 6
    },
    resist: [
      "necrotic"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "vampire-weakness",
        name: "Vampire Weakness",
        modifiers: [],
        text: "Cannot enter a residence without an invitation from an occupant."
      },
      {
        id: "running-water",
        name: "Running Water",
        modifiers: [],
        text: "Takes 20 acid damage if it ends its turn in running water. The DM applies this."
      },
      {
        id: "stake-to-the-heart",
        name: "Stake to the Heart",
        modifiers: [],
        text: "Destroyed if a piercing weapon is driven into its heart while it is Incapacitated. The DM applies this."
      },
      {
        id: "sunlight",
        name: "Sunlight",
        modifiers: [],
        text: "Takes 20 radiant damage if it starts its turn in sunlight, and has Disadvantage on attack rolls and ability checks while in it. The DM applies this."
      },
      {
        id: "deathless-agility",
        name: "Deathless Agility",
        modifiers: [],
        text: "Bonus Action: Takes the Dash or Disengage action."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "claw", times: 2 }, { action: "bite", times: 1 }],
        text: "Makes two Claw attacks and uses Bite.",
      },
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d4+3",
                type: "slashing"
              },
              {
                condition: "grappled"
              },
              {
                manual: "Grapple escape DC 13, from one of two claws, only if the target is Medium or smaller."
              }
            ]
          }
        ],
        text: "A melee attack that grapples a Medium or smaller target (escape DC 13)."
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 14,
            half: false,
            onFail: [
              {
                damage: "1d4+3",
                type: "piercing"
              },
              {
                damage: "3d6",
                type: "necrotic"
              },
              {
                manual: "The target must be willing or Grappled, Incapacitated or Restrained. Its Hit Point maximum decreases by the necrotic damage taken, and the vampire regains Hit Points equal to that amount."
              }
            ]
          }
        ],
        text: "A bite on a willing or helpless creature within 5 feet: Constitution save (DC 14) or it takes piercing and necrotic damage and loses maximum Hit Points."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lesser vampire that claws and drains."
  },
  {
    id: "vampire",
    name: "Vampire",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 13,
    xp: 10000,
    pb: 5,
    ac: 16,
    hp: 195,
    speed: {
      walk: 40,
      climb: 40
    },
    abilities: {
      str: 18,
      dex: 18,
      con: 18,
      int: 17,
      wis: 15,
      cha: 18
    },
    saves: { dex: 9, con: 9, wis: 7, cha: 9 },
    initiative: 14,
    languages: ["Common plus two other languages"],
    senses: { darkvision: 120 },
    skills: {
      perception: 7,
      stealth: 9
    },
    resist: [
      "necrotic"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day, or 4 in its lair. The DM tracks the uses."
      },
      {
        id: "misty-escape",
        name: "Misty Escape",
        modifiers: [],
        text: "If reduced to 0 Hit Points outside its resting place, it turns to mist at once (if it cannot Shape-Shift it is destroyed). It must reach its resting place within 2 hours or be destroyed, and cannot leave mist form meanwhile. In its resting place it is Paralyzed until it regains Hit Points, and regains 1 Hit Point after 1 hour. The DM applies this."
      },
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "vampire-weakness",
        name: "Vampire Weakness",
        modifiers: [],
        text: "Cannot enter a residence without an invitation from an occupant."
      },
      {
        id: "running-water",
        name: "Running Water",
        modifiers: [],
        text: "Takes 20 acid damage if it ends its turn in running water. The DM applies this."
      },
      {
        id: "stake-to-the-heart",
        name: "Stake to the Heart",
        modifiers: [],
        text: "If a piercing weapon is driven into its heart while it is Incapacitated in its resting place, it is Paralyzed until the weapon is removed. The DM applies this."
      },
      {
        id: "sunlight",
        name: "Sunlight",
        modifiers: [],
        text: "Takes 20 radiant damage if it starts its turn in sunlight, and has Disadvantage on attack rolls and ability checks while in it. The DM applies this."
      },
      {
        id: "charm",
        name: "Charm",
        modifiers: [],
        text: "Bonus Action (Recharge 5-6): Casts Charm Person (Charisma, save DC 17, no components) lasting 24 hours. The target willingly accepts its Bite, which does not end the spell, and afterwards does not know it was charmed. The DM applies this."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: If not in sunlight or running water, becomes a Tiny bat (Speed 5, Fly 30) or a Medium cloud of mist (Speed 5, Fly 20, hover), or returns to vampire form; clothing goes with it. Statistics other than size and Speed are unchanged, and a bat cannot speak. In mist form it cannot take actions, speak or handle objects, is weightless, can enter an enemy's space, can pass anywhere air can (not liquid), and resists all damage except sunlight. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions, 3 uses a round (4 in its lair). Beguile: casts Command (Charisma, save DC 17, no components); it cannot repeat this until the start of its next turn. Deathless Strike: moves up to half its Speed and makes one Grave Strike attack. The engine has no field for legendary actions; the DM runs them."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "grave-strike", times: 2 }, { action: "bite", times: 1 }],
        text: "Makes two Grave Strike attacks and uses Bite.",
      },
      {
        id: "grave-strike",
        name: "Grave Strike",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 9,
            onHit: [
              {
                damage: "1d8+4",
                type: "bludgeoning"
              },
              {
                damage: "2d6",
                type: "necrotic"
              },
              {
                condition: "grappled"
              },
              {
                manual: "Grapple escape DC 14, from one of two hands, only if the target is Large or smaller."
              }
            ]
          }
        ],
        text: "A melee attack with extra necrotic damage that grapples a Large or smaller target (escape DC 14)."
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 17,
            half: false,
            onFail: [
              {
                damage: "1d4+4",
                type: "piercing"
              },
              {
                damage: "3d8",
                type: "necrotic"
              },
              {
                manual: "The target must be willing or Grappled, Incapacitated or Restrained. Its Hit Point maximum decreases by the necrotic damage taken, and the vampire regains Hit Points equal to that amount. A Humanoid reduced to 0 Hit Points by this damage and then buried rises the next sunset as a Vampire Spawn under the vampire's control. Usable in bat or vampire form only."
              }
            ]
          }
        ],
        text: "A bite on a willing or helpless creature within 5 feet: Constitution save (DC 17) or it takes piercing and necrotic damage and loses maximum Hit Points.Bat or Vampire Form Only"
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead noble who drains blood and charms."
  },
  {
    id: "vrock",
    name: "Vrock",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 15,
    hp: 152,
    speed: {
      walk: 40,
      fly: 60
    },
    abilities: {
      str: 17,
      dex: 15,
      con: 18,
      int: 8,
      wis: 13,
      cha: 8
    },
    saves: { dex: 5, wis: 4, cha: 2 },
    initiative: 2,
    languages: ["Abyssal", "telepathy 120 ft."],
    senses: { darkvision: 120 },
    resist: [
      "cold",
      "fire",
      "lightning"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "demonic-restoration",
        name: "Demonic Restoration",
        modifiers: [],
        text: "If it dies outside the Abyss, it gets a new body at once, with all its Hit Points, somewhere in the Abyss."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "shred", times: 2 }],
        text: "Makes two Shred attacks.",
      },
      {
        id: "shred",
        name: "Shred",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d6+3",
                type: "piercing"
              },
              {
                damage: "3d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      },
      {
        id: "spores",
        name: "Spores",
        recharge: [6, 6],
        target: {
          area: {
            shape: "emanation",
            size: 20
          }
        },
        effects: [
          {
            save: "con",
            dc: 15,
            half: false,
            onFail: [
              {
                condition: "poisoned",
                ends: {
                  on: "save",
                  save: "con",
                  at: "turnEnd"
                }
              },
              {
                manual: "While Poisoned the target takes 5 (1d10) poison damage at the start of each of its turns. Emptying a flask of Holy Water on the target ends the effect early."
              }
            ]
          }
        ],
        text: "Creatures within 20 feet make a Constitution save (DC 15) or are Poisoned and take poison damage each turn. Recharge 6."
      },
      {
        id: "stunning-screech",
        name: "Stunning Screech",
        uses: { per: "day", n: 1 },
        target: {
          area: {
            shape: "emanation",
            size: 20
          }
        },
        effects: [
          {
            save: "con",
            dc: 15,
            half: false,
            onFail: [
              {
                damage: "3d6",
                type: "thunder"
              },
              {
                condition: "stunned",
                ends: {
                  on: "turnEnd",
                  of: "source"
                }
              },
              {
                manual: "Demons succeed on the save automatically."
              }
            ]
          }
        ],
        text: "Creatures within 20 feet make a Constitution save (DC 15) or take thunder damage and are Stunned until the end of the vrock's next turn; 1 a day."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A vulture-like demon with poison spores and a stunning screech."
  },
  {
    id: "warrior-infantry",
    name: "Warrior Infantry",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 13,
    hp: 9,
    speed: {
      walk: 30
    },
    abilities: {
      str: 13,
      dex: 11,
      con: 11,
      int: 8,
      wis: 11,
      cha: 8
    },
    initiative: 0,
    languages: ["Common"],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      }
    ],
    actions: [
      {
        id: "spear",
        name: "Spear",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d6+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "spear-thrown",
        name: "Spear (thrown)",
        target: {
          creature: {
            range: [
              20,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d6+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "The same weapon thrown."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A common soldier who fights alongside others."
  },
  {
    id: "warrior-veteran",
    name: "Warrior Veteran",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 17,
    hp: 65,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 13,
      con: 14,
      int: 10,
      wis: 11,
      cha: 10
    },
    initiative: 3,
    languages: ["Common plus one other language"],
    skills: {
      athletics: 5,
      perception: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "parry",
        name: "Parry",
        modifiers: [],
        text: "Reaction: When a melee attack hits it while it holds a weapon, it adds 2 to its AC against that attack. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["greatsword", "heavy-crossbow"], times: 2 }],
        text: "Makes two Greatsword or Heavy Crossbow attacks.",
      },
      {
        id: "greatsword",
        name: "Greatsword",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "heavy-crossbow",
        name: "Heavy Crossbow",
        target: {
          creature: {
            range: [
              100,
              400
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "2d10+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A seasoned fighter with greatsword and a parry."
  },
  {
    id: "water-elemental",
    name: "Water Elemental",
    source: "SRD 5.2.1",
    size: "large",
    type: "elemental",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 14,
    hp: 114,
    speed: {
      walk: 30,
      swim: 90
    },
    abilities: {
      str: 18,
      dex: 14,
      con: 18,
      int: 5,
      wis: 10,
      cha: 8
    },
    initiative: 2,
    languages: ["Primordial (Aquan)"],
    senses: { darkvision: 60 },
    resist: [
      "acid",
      "fire"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
      {
        id: "freeze",
        name: "Freeze",
        modifiers: [],
        text: "If it takes cold damage, its Speed drops by 20 feet until the end of its next turn. The DM applies this."
      },
      {
        id: "water-form",
        name: "Water Form",
        modifiers: [],
        text: "Can enter an enemy's space and stop there, and squeeze through spaces 1 inch wide at no extra movement cost."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "slam", times: 2 }],
        text: "Makes two Slam attacks.",
      },
      {
        id: "slam",
        name: "Slam",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack, knocks the target Prone if it is Medium or smaller."
      },
      {
        id: "whelm",
        name: "Whelm",
        recharge: [4, 6],
        target: {
          self: true
        },
        effects: [
          {
            manual: "Recharge 4-6: each creature in the elemental's space makes a Strength save (DC 15). Failure: 22 (4d8 + 4) bludgeoning damage, and a Large or smaller creature is Grappled (escape DC 14). Until the grapple ends the target is Restrained, cannot breathe unless it can breathe water, and takes 9 (2d8) bludgeoning damage at the start of each of the elemental's turns. It can hold one Large or up to two Medium or smaller creatures this way. A creature within 5 feet can use an action to pull one out with a DC 14 Strength (Athletics) check. Success: half damage only."
          }
        ],
        text: "Engulfs creatures in its space; Recharge 4-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A living wave that engulfs creatures."
  },
  {
    id: "werebear",
    name: "Werebear",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 135,
    speed: {
      walk: 30
    },
    abilities: {
      str: 19,
      dex: 10,
      con: 17,
      int: 11,
      wis: 12,
      cha: 12
    },
    initiative: 3,
    languages: ["Common (can’t speak in bear form)"],
    senses: { darkvision: 60 },
    skills: {
      perception: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "speed-notes",
        name: "Speed Notes",
        modifiers: [],
        text: "Speed 40 and Climb 30 apply in bear form only; the entry gives the 30-foot walking speed."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Large bear-humanoid hybrid or a Large bear, or returns to its humanoid form. Statistics other than size are unchanged; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["handaxe", "handaxe-thrown", "rend"], times: 2 }], [{ action: ["handaxe", "handaxe-thrown", "rend"], times: 1 }, { action: "bite", times: 1 }]] },
        text: "Makes two attacks, using Handaxe or Rend in any combination. It can replace one attack with a Bite attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d12+4",
                type: "piercing"
              },
              {
                manual: "If the target is a Humanoid it makes a Constitution save (DC 14) or is cursed: if it drops to 0 Hit Points it becomes a Werebear under the DM's control with 10 Hit Points. On a success it is immune to this werebear's curse for 24 hours."
              }
            ]
          }
        ],
        text: "A melee attack that can pass on lycanthropy."
      },
      {
        id: "handaxe",
        name: "Handaxe",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "3d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "handaxe-thrown",
        name: "Handaxe (thrown)",
        target: {
          creature: {
            range: [
              20,
              60
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "3d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "The same weapon thrown."
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lycanthrope who can become a bear."
  },
  {
    id: "wereboar",
    name: "Wereboar",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 15,
    hp: 97,
    speed: {
      walk: 30
    },
    abilities: {
      str: 17,
      dex: 10,
      con: 15,
      int: 10,
      wis: 11,
      cha: 8
    },
    initiative: 2,
    languages: ["Common (can’t speak in boar form)"],
    skills: {
      perception: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "speed-notes",
        name: "Speed Notes",
        modifiers: [],
        text: "Speed 40 applies in boar form only; the entry gives the 30-foot walking speed."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Medium boar-humanoid hybrid or a Small boar, or returns to its humanoid form. Statistics other than size are unchanged; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["javelin", "javelin-thrown", "tusk"], times: 2 }], [{ action: ["javelin", "javelin-thrown", "tusk"], times: 1 }, { action: "gore", times: 1 }]] },
        text: "Makes two attacks, using Javelin or Tusk in any combination. It can replace one attack with a Gore attack.",
      },
      {
        id: "gore",
        name: "Gore",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d8+3",
                type: "piercing"
              },
              {
                manual: "If the target is a Humanoid it makes a Constitution save (DC 12) or is cursed: if it drops to 0 Hit Points it becomes a Wereboar under the DM's control with 10 Hit Points. On a success it is immune to this wereboar's curse for 24 hours."
              }
            ]
          }
        ],
        text: "A melee attack that can pass on lycanthropy."
      },
      {
        id: "javelin",
        name: "Javelin",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "3d6+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "javelin-thrown",
        name: "Javelin (thrown)",
        target: {
          creature: {
            range: [
              30,
              120
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "3d6+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "The same weapon thrown."
      },
      {
        id: "tusk",
        name: "Tusk",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "piercing"
              },
              {
                manual: "If the target is Medium or smaller and the wereboar moved 20 or more feet straight toward it just before the hit, the target takes an extra 7 (2d6) piercing damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "A melee attack with a charge bonus (7 (2d6) piercing extra damage and Prone, if Medium or smaller) that the DM applies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lycanthrope who can become a boar."
  },
  {
    id: "wererat",
    name: "Wererat",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 60,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 10,
      dex: 16,
      con: 12,
      int: 11,
      wis: 10,
      cha: 8
    },
    initiative: 3,
    languages: ["Common (can’t speak in rat form)"],
    senses: { darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Medium rat-humanoid hybrid or a Small rat, or returns to its humanoid form. Statistics other than size are unchanged; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["scratch", "hand-crossbow"], times: 2 }], [{ action: ["scratch", "hand-crossbow"], times: 1 }, { action: "bite", times: 1 }]] },
        text: "Makes two attacks, using Scratch or Hand Crossbow in any combination. It can replace one attack with a Bite attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d4+3",
                type: "piercing"
              },
              {
                manual: "If the target is a Humanoid it makes a Constitution save (DC 11) or is cursed: if it drops to 0 Hit Points it becomes a Wererat under the DM's control with 10 Hit Points. On a success it is immune to this wererat's curse for 24 hours."
              }
            ]
          }
        ],
        text: "A melee attack that can pass on lycanthropy."
      },
      {
        id: "scratch",
        name: "Scratch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "hand-crossbow",
        name: "Hand Crossbow",
        target: {
          creature: {
            range: [
              30,
              120
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lycanthrope who can become a rat."
  },
  {
    id: "weretiger",
    name: "Weretiger",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 12,
    hp: 120,
    speed: {
      walk: 30
    },
    abilities: {
      str: 17,
      dex: 15,
      con: 16,
      int: 10,
      wis: 13,
      cha: 11
    },
    initiative: 2,
    languages: ["Common (can’t speak in tiger form)"],
    senses: { darkvision: 60 },
    skills: {
      perception: 5,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "speed-notes",
        name: "Speed Notes",
        modifiers: [],
        text: "Speed 40 applies in tiger form only; the entry gives the 30-foot walking speed."
      },
      {
        id: "prowl",
        name: "Prowl",
        modifiers: [],
        text: "Bonus Action (Tiger or Hybrid Form Only): Moves up to its Speed without provoking Opportunity Attacks, and can then take the Hide action. The DM applies this."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Large tiger-humanoid hybrid or a Large tiger, or returns to its humanoid form. Statistics other than size are unchanged; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["scratch", "longbow"], times: 2 }], [{ action: ["scratch", "longbow"], times: 1 }, { action: "bite", times: 1 }]] },
        text: "Makes two attacks, using Scratch or Longbow in any combination. It can replace one attack with a Bite attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d8+3",
                type: "piercing"
              },
              {
                manual: "If the target is a Humanoid it makes a Constitution save (DC 13) or is cursed: if it drops to 0 Hit Points it becomes a Weretiger under the DM's control with 10 Hit Points. On a success it is immune to this weretiger's curse for 24 hours."
              }
            ]
          }
        ],
        text: "A melee attack that can pass on lycanthropy."
      },
      {
        id: "scratch",
        name: "Scratch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "longbow",
        name: "Longbow",
        target: {
          creature: {
            range: [
              150,
              600
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d8+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lycanthrope who can become a tiger."
  },
  {
    id: "werewolf",
    name: "Werewolf",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 15,
    hp: 71,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 14,
      con: 14,
      int: 10,
      wis: 11,
      cha: 10
    },
    initiative: 4,
    languages: ["Common (can’t speak in wolf form)"],
    senses: { darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "speed-notes",
        name: "Speed Notes",
        modifiers: [],
        text: "Speed 40 applies in wolf form only; the entry gives the 30-foot walking speed."
      },
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: Becomes a Large wolf-humanoid hybrid or a Medium wolf, or returns to its humanoid form. Statistics other than size are unchanged; equipment is not transformed. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["scratch", "longbow"], times: 2 }], [{ action: ["scratch", "longbow"], times: 1 }, { action: "bite", times: 1 }]] },
        text: "Makes two attacks, using Scratch or Longbow in any combination. It can replace one attack with a Bite attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d8+3",
                type: "piercing"
              },
              {
                manual: "If the target is a Humanoid it makes a Constitution save (DC 12) or is cursed: if it drops to 0 Hit Points it becomes a Werewolf under the DM's control with 10 Hit Points. On a success it is immune to this werewolf's curse for 24 hours."
              }
            ]
          }
        ],
        text: "A melee attack that can pass on lycanthropy."
      },
      {
        id: "scratch",
        name: "Scratch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "longbow",
        name: "Longbow",
        target: {
          creature: {
            range: [
              150,
              600
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d8+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A lycanthrope who can become a wolf."
  },
  {
    id: "white-dragon-wyrmling",
    name: "White Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 16,
    hp: 32,
    speed: {
      walk: 30,
      burrow: 15,
      fly: 60,
      swim: 30
    },
    abilities: {
      str: 14,
      dex: 10,
      con: 14,
      int: 5,
      wis: 10,
      cha: 11
    },
    saves: { dex: 2, wis: 2 },
    initiative: 2,
    languages: ["Draconic"],
    senses: { blindsight: 10, darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold"
    ],
    traits: [
      {
        id: "ice-walk",
        name: "Ice Walk",
        modifiers: [],
        text: "Crosses and climbs icy surfaces without ability checks; ice and snow Difficult Terrain costs it no extra movement."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Makes two Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d8+2",
                type: "slashing"
              },
              {
                damage: "1d4",
                type: "cold"
              }
            ]
          }
        ],
        text: "A melee attack with extra cold damage."
      },
      {
        id: "cold-breath",
        name: "Cold Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "con",
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "5d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "Constitution save (DC 12) or take 5d8 cold damage, half on a success. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young ice-dwelling dragon with a cold breath."
  },
  {
    id: "young-white-dragon",
    name: "Young White Dragon",
    source: "SRD 5.2.1",
    size: "large",
    type: "dragon",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 17,
    hp: 123,
    speed: {
      walk: 40,
      burrow: 20,
      fly: 80,
      swim: 40
    },
    abilities: {
      str: 18,
      dex: 10,
      con: 18,
      int: 6,
      wis: 11,
      cha: 12
    },
    saves: { dex: 3, wis: 3 },
    initiative: 3,
    languages: ["Common", "Draconic"],
    senses: { blindsight: 30, darkvision: 120 },
    skills: {
      perception: 6,
      stealth: 3
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold"
    ],
    traits: [
      {
        id: "ice-walk",
        name: "Ice Walk",
        modifiers: [],
        text: "Crosses and climbs icy surfaces without ability checks; ice and snow Difficult Terrain costs it no extra movement."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 3 }],
        text: "Makes three Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d4+4",
                type: "slashing"
              },
              {
                damage: "1d4",
                type: "cold"
              }
            ]
          }
        ],
        text: "A melee attack with extra cold damage."
      },
      {
        id: "cold-breath",
        name: "Cold Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            save: "con",
            dc: 15,
            half: true,
            onFail: [
              {
                damage: "9d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "Constitution save (DC 15) or take 9d8 cold damage, half on a success. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A young ice-dwelling dragon with a cold breath."
  },
  {
    id: "wight",
    name: "Wight",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 14,
    hp: 82,
    speed: {
      walk: 30
    },
    abilities: {
      str: 15,
      dex: 14,
      con: 16,
      int: 10,
      wis: 13,
      cha: 15
    },
    initiative: 4,
    languages: ["Common plus one other language"],
    senses: { darkvision: 60 },
    skills: {
      perception: 3,
      stealth: 4
    },
    resist: [
      "necrotic"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["exhaustion", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Poisoned condition(s). The engine applies this."
      },
      {
        id: "sunlight-sensitivity",
        name: "Sunlight Sensitivity",
        modifiers: [],
        text: "Has Disadvantage on ability checks and attack rolls while in sunlight. The DM applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["necrotic-sword", "necrotic-bow"], times: 2 }], [{ action: ["necrotic-sword", "necrotic-bow"], times: 1 }, { action: "life-drain", times: 1 }]] },
        text: "Makes two attacks, using Necrotic Sword or Necrotic Bow in any combination. It can replace one attack with a use of Life Drain.",
      },
      {
        id: "necrotic-sword",
        name: "Necrotic Sword",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d8+2",
                type: "slashing"
              },
              {
                damage: "1d8",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A melee attack with extra necrotic damage."
      },
      {
        id: "necrotic-bow",
        name: "Necrotic Bow",
        target: {
          creature: {
            range: [
              150,
              600
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d8+2",
                type: "piercing"
              },
              {
                damage: "1d8",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A ranged attack with extra necrotic damage."
      },
      {
        id: "life-drain",
        name: "Life Drain",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 13,
            half: false,
            onFail: [
              {
                damage: "1d8+2",
                type: "necrotic"
              },
              {
                manual: "The target's Hit Point maximum decreases by the damage taken. A Humanoid slain by this attack rises 24 hours later as a Zombie under the wight's control, unless it is restored to life or its body is destroyed. The wight can control at most twelve zombies at a time."
              }
            ]
          }
        ],
        text: "Constitution save (DC 13) for a creature within 5 feet, or it takes necrotic damage and loses maximum Hit Points."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead warrior that drains life and raises zombies."
  },
  {
    id: "will-o-wisp",
    name: "Will-o’-Wisp",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "undead",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 19,
    hp: 27,
    speed: {
      walk: 5,
      fly: 50
    },
    abilities: {
      str: 1,
      dex: 28,
      con: 10,
      int: 13,
      wis: 14,
      cha: 11
    },
    initiative: 9,
    languages: ["Common plus one other language"],
    senses: { darkvision: 120 },
    hover: true,
    resist: [
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "necrotic",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "lightning",
      "poison"
    ],
    conditionImmune: ["exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
      {
        id: "ephemeral",
        name: "Ephemeral",
        modifiers: [],
        text: "Cannot wear or carry anything."
      },
      {
        id: "illumination",
        name: "Illumination",
        modifiers: [],
        text: "Sheds Bright Light in a 20-foot radius and Dim Light for 20 feet beyond that."
      },
      {
        id: "incorporeal-movement",
        name: "Incorporeal Movement",
        modifiers: [],
        text: "Moves through creatures and objects as if they were Difficult Terrain, and takes 5 (1d10) force damage if it ends its turn inside an object. The DM applies this."
      },
      {
        id: "consume-life",
        name: "Consume Life",
        modifiers: [],
        text: "Bonus Action: A living creature it can see within 5 feet that has 0 Hit Points makes a Constitution save (DC 10) or dies, and the wisp regains 10 (3d6) Hit Points. The DM applies this."
      },
      {
        id: "vanish",
        name: "Vanish",
        modifiers: [],
        text: "Bonus Action: The wisp and its light become Invisible until its Concentration ends; this ends early when it makes an attack roll or uses Consume Life. The DM applies this."
      }
    ],
    actions: [
      {
        id: "shock",
        name: "Shock",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d8+2",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny flickering undead light that feeds on the dying."
  },
  {
    id: "winter-wolf",
    name: "Winter Wolf",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 13,
    hp: 75,
    speed: {
      walk: 50
    },
    abilities: {
      str: 18,
      dex: 13,
      con: 14,
      int: 7,
      wis: 12,
      cha: 8
    },
    initiative: 1,
    languages: ["Common", "Giant"],
    skills: {
      perception: 5,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold"
    ],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack, knocks the target Prone if it is Large or smaller."
      },
      {
        id: "cold-breath",
        name: "Cold Breath",
        recharge: [5, 6],
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "con",
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "4d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "Constitution save (DC 12) or take 4d8 cold damage, half on a success. Recharge 5-6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A large frost wolf that breathes cold."
  },
  {
    id: "worg",
    name: "Worg",
    source: "SRD 5.2.1",
    size: "large",
    type: "fey",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 13,
    hp: 26,
    speed: {
      walk: 50
    },
    abilities: {
      str: 16,
      dex: 13,
      con: 13,
      int: 7,
      wis: 11,
      cha: 8
    },
    initiative: 1,
    languages: ["Goblin", "Worg"],
    senses: { darkvision: 60 },
    skills: {
      perception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d8+3",
                type: "piercing"
              },
              {
                manual: "The next attack roll made against the target before the start of the worg's next turn has Advantage."
              }
            ]
          }
        ],
        text: "A melee attack that gives the next attack against the target Advantage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A large evil wolf."
  },
  {
    id: "wraith",
    name: "Wraith",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 13,
    hp: 67,
    speed: {
      walk: 5,
      fly: 60
    },
    abilities: {
      str: 6,
      dex: 16,
      con: 16,
      int: 12,
      wis: 14,
      cha: 15
    },
    initiative: 3,
    languages: ["Common plus two other languages"],
    senses: { darkvision: 60 },
    hover: true,
    resist: [
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
      {
        id: "incorporeal-movement",
        name: "Incorporeal Movement",
        modifiers: [],
        text: "Moves through creatures and objects as if they were Difficult Terrain, and takes 5 (1d10) force damage if it ends its turn inside an object. The DM applies this."
      },
      {
        id: "sunlight-sensitivity",
        name: "Sunlight Sensitivity",
        modifiers: [],
        text: "Has Disadvantage on ability checks and attack rolls while in sunlight. The DM applies this."
      }
    ],
    actions: [
      {
        id: "life-drain",
        name: "Life Drain",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "4d8+3",
                type: "necrotic"
              },
              {
                manual: "If the target is a creature, its Hit Point maximum decreases by the damage taken."
              }
            ]
          }
        ],
        text: "A melee necrotic attack that lowers the target's Hit Point maximum."
      },
      {
        id: "create-specter",
        name: "Create Specter",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Targets a Humanoid corpse within 10 feet that died no more than 1 minute ago. Its spirit rises as a Specter in the corpse's space or the nearest free space, under the wraith's control. The wraith can control at most seven specters at a time."
          }
        ],
        text: "Raises a fresh corpse as a specter."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead spirit that drains life and creates specters."
  },
  {
    id: "wyvern",
    name: "Wyvern",
    source: "SRD 5.2.1",
    size: "large",
    type: "dragon",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 14,
    hp: 127,
    speed: {
      walk: 30,
      fly: 80
    },
    abilities: {
      str: 19,
      dex: 10,
      con: 16,
      int: 5,
      wis: 12,
      cha: 6
    },
    initiative: 0,
    languages: [],
    senses: { darkvision: 120 },
    skills: {
      perception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "sting", times: 1 }],
        text: "Makes one Bite attack and one Sting attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "sting",
        name: "Sting",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              },
              {
                damage: "7d6",
                type: "poison"
              },
              {
                condition: "poisoned",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage that Poisons the target until the start of the wyvern's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A two-legged dragonkin with a venomous tail stinger."
  },
  {
    id: "xorn",
    name: "Xorn",
    source: "SRD 5.2.1",
    size: "medium",
    type: "elemental",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 19,
    hp: 84,
    speed: {
      walk: 20,
      burrow: 20
    },
    abilities: {
      str: 17,
      dex: 10,
      con: 22,
      int: 11,
      wis: 10,
      cha: 11
    },
    initiative: 0,
    languages: ["Primordial (Terran)"],
    senses: { darkvision: 60, tremorsense: 60 },
    skills: {
      perception: 6,
      stealth: 6
    },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["paralyzed", "petrified", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Paralyzed, Petrified, Poisoned condition(s). The engine applies this."
      },
      {
        id: "earth-glide",
        name: "Earth Glide",
        modifiers: [],
        text: "Burrows through nonmagical, unworked earth and stone without disturbing it."
      },
      {
        id: "treasure-sense",
        name: "Treasure Sense",
        modifiers: [],
        text: "Pinpoints precious metals and stones within 60 feet."
      },
      {
        id: "charge",
        name: "Charge",
        modifiers: [],
        text: "Bonus Action: Moves up to its Speed or Burrow speed straight toward an enemy it can sense. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "claw", times: 3 }],
        text: "Makes one Bite attack and three Claw attacks.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "4d6+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d10+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An earth elemental that moves through solid stone."
  },
  {
    id: "zombie",
    name: "Zombie",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 8,
    hp: 15,
    speed: {
      walk: 20
    },
    abilities: {
      str: 13,
      dex: 6,
      con: 16,
      int: 3,
      wis: 6,
      cha: 5
    },
    saves: { wis: 0 },
    initiative: -2,
    languages: ["Understands Common plus one other language but can’t speak"],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["exhaustion", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Poisoned condition(s). The engine applies this."
      },
      {
        id: "undead-fortitude",
        name: "Undead Fortitude",
        modifiers: [],
        text: "If damage drops it to 0 Hit Points, it makes a Constitution save (DC 5 plus the damage taken) unless the damage is radiant or a critical hit; on a success it stays at 1 Hit Point. The DM applies this."
      }
    ],
    actions: [
      {
        id: "slam",
        name: "Slam",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "1d8+1",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A shambling undead that is hard to put down."
  },
  {
    id: "panther",
    name: "Panther",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 13,
    hp: 13,
    speed: {
      walk: 50,
      climb: 40
    },
    abilities: {
      str: 14,
      dex: 16,
      con: 10,
      int: 3,
      wis: 14,
      cha: 7
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      perception: 4,
      stealth: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "nimble-escape",
        name: "Nimble Escape",
        modifiers: [],
        text: "Bonus Action: Takes the Disengage or Hide action."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A stealthy big cat that climbs."
  },
  {
    id: "piranha",
    name: "Piranha",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 13,
    hp: 1,
    speed: {
      walk: 5,
      swim: 40
    },
    abilities: {
      str: 2,
      dex: 16,
      con: 9,
      int: 1,
      wis: 7,
      cha: 2
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "water-breathing",
        name: "Water Breathing",
        modifiers: [],
        text: "Can breathe only underwater."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              },
              {
                manual: "Has Advantage on the attack roll if the target is missing Hit Points."
              }
            ]
          }
        ],
        text: "A melee attack with Advantage against wounded targets."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny, biting fish."
  },
  {
    id: "plesiosaurus",
    name: "Plesiosaurus",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 68,
    speed: {
      walk: 20,
      swim: 40
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 16,
      int: 2,
      wis: 12,
      cha: 5
    },
    initiative: 2,
    languages: [],
    skills: {
      perception: 3,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "hold-breath",
        name: "Hold Breath",
        modifiers: [],
        text: "Can hold its breath for 1 hour."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A long-necked marine reptile."
  },
  {
    id: "polar-bear",
    name: "Polar Bear",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 42,
    speed: {
      walk: 40,
      swim: 40
    },
    abilities: {
      str: 20,
      dex: 14,
      con: 16,
      int: 2,
      wis: 13,
      cha: 7
    },
    initiative: 2,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      perception: 5,
      stealth: 4
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Makes two Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "1d8+5",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A large, cold-country bear."
  },
  {
    id: "pony",
    name: "Pony",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 10,
    hp: 11,
    speed: {
      walk: 40
    },
    abilities: {
      str: 15,
      dex: 10,
      con: 13,
      int: 2,
      wis: 11,
      cha: 7
    },
    saves: { str: 4 },
    initiative: 0,
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d4+2",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A small, sturdy riding horse."
  },
  {
    id: "pteranodon",
    name: "Pteranodon",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 13,
    hp: 13,
    speed: {
      walk: 10,
      fly: 60
    },
    abilities: {
      str: 12,
      dex: 15,
      con: 10,
      int: 2,
      wis: 9,
      cha: 5
    },
    initiative: 2,
    languages: [],
    skills: {
      perception: 1
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "flyby",
        name: "Flyby",
        modifiers: [],
        text: "Does not provoke Opportunity Attacks when it flies out of an enemy's reach."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d8+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A flying reptile that dives on prey."
  },
  {
    id: "rat",
    name: "Rat",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 10,
    hp: 1,
    speed: {
      walk: 20,
      climb: 20
    },
    abilities: {
      str: 2,
      dex: 11,
      con: 9,
      int: 2,
      wis: 10,
      cha: 4
    },
    initiative: 0,
    languages: [],
    senses: { darkvision: 30 },
    skills: {
      perception: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "agile",
        name: "Agile",
        modifiers: [],
        text: "Does not provoke Opportunity Attacks when it moves out of an enemy's reach."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small, skulking rodent."
  },
  {
    id: "raven",
    name: "Raven",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 2,
    speed: {
      walk: 10,
      fly: 50
    },
    abilities: {
      str: 2,
      dex: 14,
      con: 10,
      int: 5,
      wis: 13,
      cha: 6
    },
    initiative: 2,
    languages: [],
    skills: {
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "mimicry",
        name: "Mimicry",
        modifiers: [],
        text: "Mimics simple sounds; a listener who succeeds on a DC 10 Wisdom (Insight) check can tell it is an imitation."
      }
    ],
    actions: [
      {
        id: "beak",
        name: "Beak",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small bird that mimics sounds."
  },
  {
    id: "reef-shark",
    name: "Reef Shark",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 22,
    speed: {
      walk: 5,
      swim: 30
    },
    abilities: {
      str: 14,
      dex: 15,
      con: 13,
      int: 1,
      wis: 10,
      cha: 4
    },
    initiative: 2,
    languages: [],
    senses: { blindsight: 30 },
    skills: {
      perception: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      },
      {
        id: "water-breathing",
        name: "Water Breathing",
        modifiers: [],
        text: "Can breathe only underwater."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d4+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A shark that hunts in packs near reefs."
  },
  {
    id: "rhinoceros",
    name: "Rhinoceros",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 45,
    speed: {
      walk: 40
    },
    abilities: {
      str: 21,
      dex: 8,
      con: 15,
      int: 2,
      wis: 12,
      cha: 6
    },
    initiative: -1,
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "gore",
        name: "Gore",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 7,
            onHit: [
              {
                damage: "2d8+5",
                type: "piercing"
              },
              {
                manual: "If the target is Large or smaller and the rhinoceros moved 20 or more feet straight toward it just before the hit, the target takes an extra 9 (2d8) piercing damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "A melee attack with a charge bonus (9 (2d8) piercing extra damage and Prone, if Large or smaller) that the DM applies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A charging, thick-hided beast."
  },
  {
    id: "riding-horse",
    name: "Riding Horse",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 11,
    hp: 13,
    speed: {
      walk: 60
    },
    abilities: {
      str: 16,
      dex: 13,
      con: 12,
      int: 2,
      wis: 11,
      cha: 7
    },
    initiative: 1,
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "1d8+3",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A fast horse trained to carry a rider."
  },
  {
    id: "saber-toothed-tiger",
    name: "Saber-Toothed Tiger",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 52,
    speed: {
      walk: 40
    },
    abilities: {
      str: 18,
      dex: 17,
      con: 15,
      int: 3,
      wis: 12,
      cha: 8
    },
    saves: { str: 6, dex: 5 },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      perception: 5,
      stealth: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "running-leap",
        name: "Running Leap",
        modifiers: [],
        text: "With a 10-foot running start, it can Long Jump up to 25 feet."
      },
      {
        id: "nimble-escape",
        name: "Nimble Escape",
        modifiers: [],
        text: "Bonus Action: Takes the Disengage or Hide action."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Makes two Rend attacks.",
      },
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A big cat with long fangs that leaps on prey."
  },
  {
    id: "scorpion",
    name: "Scorpion",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 11,
    hp: 1,
    speed: {
      walk: 10
    },
    abilities: {
      str: 2,
      dex: 11,
      con: 8,
      int: 1,
      wis: 8,
      cha: 2
    },
    initiative: 0,
    languages: [],
    senses: { blindsight: 10 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "sting",
        name: "Sting",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              },
              {
                damage: "1d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A tiny, venomous arachnid."
  },
  {
    id: "seahorse",
    name: "Seahorse",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 0,
    pb: 2,
    ac: 12,
    hp: 1,
    speed: {
      walk: 5,
      swim: 20
    },
    abilities: {
      str: 1,
      dex: 12,
      con: 8,
      int: 1,
      wis: 10,
      cha: 2
    },
    initiative: 1,
    languages: [],
    skills: {
      perception: 2,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "water-breathing",
        name: "Water Breathing",
        modifiers: [],
        text: "Can breathe only underwater."
      }
    ],
    actions: [
      {
        id: "bubble-dash",
        name: "Bubble Dash",
        target: {
          self: true
        },
        effects: [
          {
            manual: "While underwater, moves up to its Swim speed without provoking Opportunity Attacks."
          }
        ],
        text: "Darts away underwater."
      }
    ],
    tier: "manual",
    checked: true,
    text: "A tiny, drifting sea creature."
  },
  {
    id: "spider",
    name: "Spider",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 1,
    speed: {
      walk: 20,
      climb: 20
    },
    abilities: {
      str: 2,
      dex: 14,
      con: 8,
      int: 1,
      wis: 10,
      cha: 2
    },
    initiative: 2,
    languages: [],
    senses: { darkvision: 30 },
    skills: {
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "web-walker",
        name: "Web Walker",
        modifiers: [],
        text: "Ignores movement limits from webs and knows where any creature touching the same web is."
      }
    ],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              },
              {
                damage: "1d4",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small venomous spider."
  },
  {
    id: "swarm-of-bats",
    name: "Swarm of Bats",
    source: "SRD 5.2.1",
    size: "large",
    type: "swarm of tiny beasts",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 12,
    hp: 11,
    speed: {
      walk: 5,
      fly: 30
    },
    abilities: {
      str: 5,
      dex: 15,
      con: 10,
      int: 2,
      wis: 12,
      cha: 4
    },
    initiative: 2,
    languages: [],
    senses: { blindsight: 60 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "bites",
        name: "Bites",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d4",
                type: "piercing"
              },
              {
                manual: "While the swarm is Bloodied the piercing hit does 2 (1d4) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack; less damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A cloud of biting bats."
  },
  {
    id: "swarm-of-insects",
    name: "Swarm of Insects",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny beasts",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 19,
    speed: {
      walk: 20,
      fly: 20
    },
    abilities: {
      str: 3,
      dex: 13,
      con: 14,
      int: 1,
      wis: 7,
      cha: 1
    },
    initiative: 1,
    languages: [],
    senses: { blindsight: 30 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "speed-notes",
        name: "Speed Notes",
        modifiers: [],
        text: "The SRD lets the GM choose Climb 20 or Fly 20 for this swarm; the entry gives Fly 20."
      },
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces, ceilings included, with no ability check."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "bites",
        name: "Bites",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 3,
            onHit: [
              {
                damage: "2d4+1",
                type: "poison"
              },
              {
                manual: "While the swarm is Bloodied the poison hit does 3 (1d4+1) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack; less damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A cloud of biting insects."
  },
  {
    id: "swarm-of-piranhas",
    name: "Swarm of Piranhas",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny beasts",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 13,
    hp: 28,
    speed: {
      walk: 5,
      swim: 40
    },
    abilities: {
      str: 13,
      dex: 16,
      con: 9,
      int: 1,
      wis: 7,
      cha: 2
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      },
      {
        id: "water-breathing",
        name: "Water Breathing",
        modifiers: [],
        text: "Can breathe only underwater."
      }
    ],
    actions: [
      {
        id: "bites",
        name: "Bites",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d4+3",
                type: "piercing"
              },
              {
                manual: "Has Advantage on the attack roll if the target is missing Hit Points."
              },
              {
                manual: "While the swarm is Bloodied the piercing hit does 5 (1d4+3) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack with Advantage against wounded targets; less damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A frenzied school of biting fish."
  },
  {
    id: "swarm-of-rats",
    name: "Swarm of Rats",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny beasts",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 10,
    hp: 14,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 9,
      dex: 11,
      con: 9,
      int: 2,
      wis: 10,
      cha: 3
    },
    saves: { dex: 2 },
    initiative: 0,
    languages: [],
    senses: { darkvision: 30 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "bites",
        name: "Bites",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "2d4",
                type: "piercing"
              },
              {
                manual: "While the swarm is Bloodied the piercing hit does 2 (1d4) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack; less damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A surging mass of rats."
  },
  {
    id: "swarm-of-ravens",
    name: "Swarm of Ravens",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny beasts",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 12,
    hp: 11,
    speed: {
      walk: 10,
      fly: 50
    },
    abilities: {
      str: 6,
      dex: 14,
      con: 12,
      int: 5,
      wis: 12,
      cha: 6
    },
    initiative: 2,
    languages: [],
    skills: {
      perception: 5
    },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "beaks",
        name: "Beaks",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "piercing"
              },
              {
                manual: "While the swarm is Bloodied the piercing hit does 2 (1d4) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack; less damage when the swarm is Bloodied."
      },
      {
        id: "cacophony",
        name: "Cacophony",
        recharge: [6, 6],
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "wis",
            dc: 10,
            half: false,
            onFail: [
              {
                condition: "deafened",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              },
              {
                manual: "While Deafened the target also has Disadvantage on ability checks and attack rolls."
              }
            ]
          }
        ],
        text: "A creature in the swarm's space makes a Wisdom save (DC 10) or is Deafened until the start of the swarm's next turn. Recharge 6."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A flock of ravens that pecks and screeches."
  },
  {
    id: "swarm-of-venomous-snakes",
    name: "Swarm of Venomous Snakes",
    source: "SRD 5.2.1",
    size: "medium",
    type: "swarm of tiny beasts",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 14,
    hp: 36,
    speed: {
      walk: 30,
      swim: 30
    },
    abilities: {
      str: 8,
      dex: 18,
      con: 11,
      int: 1,
      wis: 10,
      cha: 3
    },
    initiative: 4,
    languages: [],
    senses: { blindsight: 10 },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed", "frightened", "grappled", "paralyzed", "petrified", "prone", "restrained", "stunned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned condition(s). The engine applies this."
      },
      {
        id: "swarm",
        name: "Swarm",
        modifiers: [],
        text: "Can share a space with other creatures and squeeze through any gap a Tiny creature fits through; it cannot regain Hit Points or gain Temporary Hit Points."
      }
    ],
    actions: [
      {
        id: "bites",
        name: "Bites",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "1d8+4",
                type: "piercing"
              },
              {
                damage: "3d6",
                type: "poison"
              },
              {
                manual: "While the swarm is Bloodied the piercing hit does 6 (1d4+4) damage instead."
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage; less piercing damage when the swarm is Bloodied."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A writhing mass of venomous snakes."
  },
  {
    id: "tiger",
    name: "Tiger",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 13,
    hp: 30,
    speed: {
      walk: 40
    },
    abilities: {
      str: 17,
      dex: 16,
      con: 14,
      int: 3,
      wis: 12,
      cha: 8
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      perception: 3,
      stealth: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "nimble-escape",
        name: "Nimble Escape",
        modifiers: [],
        text: "Bonus Action: Takes the Disengage or Hide action."
      }
    ],
    actions: [
      {
        id: "rend",
        name: "Rend",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "2d6+3",
                type: "slashing"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack, knocks the target Prone if it is Large or smaller."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A large striped hunter that slips away after striking."
  },
  {
    id: "triceratops",
    name: "Triceratops",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 14,
    hp: 114,
    speed: {
      walk: 50
    },
    abilities: {
      str: 22,
      dex: 9,
      con: 17,
      int: 2,
      wis: 11,
      cha: 5
    },
    initiative: -1,
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "gore", times: 2 }],
        text: "Makes two Gore attacks.",
      },
      {
        id: "gore",
        name: "Gore",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 9,
            onHit: [
              {
                damage: "2d12+6",
                type: "piercing"
              },
              {
                manual: "If the target is Huge or smaller and the triceratops moved 20 or more feet straight toward it just before the hit, the target takes an extra 9 (2d8) piercing damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "A melee attack with a charge bonus (9 (2d8) piercing extra damage and Prone, if Huge or smaller) that the DM applies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge three-horned dinosaur that tramples."
  },
  {
    id: "tyrannosaurus-rex",
    name: "Tyrannosaurus Rex",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 13,
    hp: 136,
    speed: {
      walk: 50
    },
    abilities: {
      str: 25,
      dex: 10,
      con: 19,
      int: 2,
      wis: 12,
      cha: 9
    },
    saves: { str: 10, wis: 4 },
    initiative: 3,
    languages: [],
    skills: {
      perception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "tail", times: 1 }],
        text: "Makes one Bite attack and one Tail attack.",
      },
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "4d12+7",
                type: "piercing"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Grapple escape DC 17, only if the target is Large or smaller. While Grappled the target is Restrained and cannot be targeted by the tyrannosaurus's Tail."
              }
            ]
          }
        ],
        text: "A melee attack that grapples and restrains a Large or smaller target (escape DC 17)."
      },
      {
        id: "tail",
        name: "Tail",
        target: {
          creature: {
            reach: 15
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 10,
            onHit: [
              {
                damage: "4d8+7",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack, knocks the target Prone if it is Huge or smaller."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge predatory dinosaur that grabs with its jaws."
  },
  {
    id: "venomous-snake",
    name: "Venomous Snake",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 12,
    hp: 5,
    speed: {
      walk: 30,
      swim: 30
    },
    abilities: {
      str: 2,
      dex: 15,
      con: 11,
      int: 1,
      wis: 10,
      cha: 3
    },
    initiative: 2,
    languages: [],
    senses: { blindsight: 10 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "1d4+2",
                type: "piercing"
              },
              {
                damage: "1d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A small snake with a poisonous bite."
  },
  {
    id: "vulture",
    name: "Vulture",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 10,
    hp: 5,
    speed: {
      walk: 10,
      fly: 50
    },
    abilities: {
      str: 7,
      dex: 10,
      con: 13,
      int: 2,
      wis: 12,
      cha: 4
    },
    initiative: 0,
    languages: [],
    skills: {
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "pack-tactics",
        name: "Pack Tactics",
        modifiers: [
          {
            on: "attack.roll",
            op: "advantage",
            when: [
              "ally.adjacentToTarget"
            ]
          }
        ],
        text: "Advantage on an attack roll against a creature that has one of its allies within 5 feet, if that ally can act."
      }
    ],
    actions: [
      {
        id: "beak",
        name: "Beak",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 2,
            onHit: [
              {
                damage: "1d4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A scavenger bird that hunts in a pack."
  },
  {
    id: "warhorse",
    name: "Warhorse",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 19,
    speed: {
      walk: 60
    },
    abilities: {
      str: 18,
      dex: 12,
      con: 13,
      int: 2,
      wis: 12,
      cha: 7
    },
    saves: { wis: 3 },
    initiative: 1,
    languages: [],
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "hooves",
        name: "Hooves",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 6,
            onHit: [
              {
                damage: "2d4+4",
                type: "bludgeoning"
              },
              {
                manual: "If the target is Large or smaller and the horse moved 20 or more feet straight toward it just before the hit, the target takes an extra 5 (2d4) bludgeoning damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "A melee attack with a charge bonus (5 (2d4) bludgeoning extra damage and Prone, if Large or smaller) that the DM applies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A sturdy mount trained for battle."
  },
  {
    id: "weasel",
    name: "Weasel",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 13,
    hp: 1,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 3,
      dex: 16,
      con: 8,
      int: 2,
      wis: 12,
      cha: 3
    },
    initiative: 3,
    languages: [],
    senses: { darkvision: 60 },
    skills: {
      acrobatics: 5,
      perception: 3,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "bite",
        name: "Bite",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A tiny, quick carnivore."
  }
];
