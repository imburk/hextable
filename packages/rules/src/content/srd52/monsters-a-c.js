// Monsters A to C from the SRD 5.2.1 (2024 rules). Data only. Format: docs/specs/rules-expansion.md.
// `text` is a plain-words description written for this project.
// Every entry here has `checked: false`: the numbers were read from a text-extraction of the SRD 5.2.1
// stat blocks, and each was sanity-checked (hit dice, attack bonus = ability + proficiency), but no entry
// was compared against the SRD page itself.
// Multiattack, recharge, condition immunities, spellcasting and legendary actions have no fields yet, so
// they sit in a trait's `text` or a `manual` step and the monster is `assist`.
export const monsters = [
  {
    id: "aboleth",
    name: "Aboleth",
    source: "SRD 5.2.1",
    size: "large",
    type: "aberration",
    cr: 10,
    xp: 5900,
    pb: 4,
    ac: 17,
    hp: 150,
    speed: {
      walk: 10,
      swim: 40
    },
    abilities: {
      str: 21,
      dex: 9,
      con: 15,
      int: 18,
      wis: 15,
      cha: 18
    },
    skills: {
      history: 12,
      perception: 10
    },
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
        id: "eldritch-restoration",
        name: "Eldritch Restoration",
        modifiers: [],
        text: "If destroyed it returns to life in 5d10 days with full Hit Points."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day, or 4 in its lair. The DM tracks the uses."
      },
      {
        id: "mucus-cloud",
        name: "Mucus Cloud",
        modifiers: [],
        text: "At the end of its turn, creatures in a 5 foot emanation make a Constitution save (DC 14) or are cursed with slimy skin; see the SRD for the curse."
      },
      {
        id: "probing-telepathy",
        name: "Probing Telepathy",
        modifiers: [],
        text: "Learns the greatest desires of a creature it can see that communicates with it telepathically."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Tentacle attacks, plus Consume Memories or Dominate Mind if available."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions (Lash, Psychic Drain). The engine has no field for them; the DM runs them from the SRD."
      }
    ],
    actions: [
      {
        id: "tentacle",
        name: "Tentacle",
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
                damage: "2d6+5",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              }
            ]
          }
        ],
        text: "A melee attack that grapples a Large or smaller target (escape DC 14)."
      },
      {
        id: "consume-memories",
        name: "Consume Memories",
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
            save: "int",
            dc: 16,
            half: true,
            onFail: [
              {
                damage: "3d6",
                type: "psychic"
              }
            ]
          }
        ],
        text: "Targets a creature within 30 feet that it has Charmed or Grappled. Memory gain from a humanoid reduced to 0 HP is left to the DM."
      },
      {
        id: "dominate-mind",
        name: "Dominate Mind",
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
            dc: 16,
            half: false,
            onFail: [
              {
                condition: "charmed"
              },
              {
                manual: "The target obeys the aboleth while within 60 feet, repeating the save when it takes damage; usable 2 times a day."
              }
            ]
          }
        ],
        text: "Charms a creature within 30 feet on a failed Wisdom save; twice a day."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A vast, ancient lake horror that enslaves minds."
  },
  {
    id: "air-elemental",
    name: "Air Elemental",
    source: "SRD 5.2.1",
    size: "large",
    type: "elemental",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 90,
    speed: {
      walk: 10,
      fly: 90
    },
    abilities: {
      str: 14,
      dex: 20,
      con: 14,
      int: 6,
      wis: 10,
      cha: 6
    },
    hover: true,
    resist: [
      "bludgeoning",
      "lightning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "poison",
      "thunder"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained and Unconscious condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "air-form",
        name: "Air Form",
        modifiers: [],
        text: "Can enter other creatures' spaces and move through a gap as narrow as 1 inch without squeezing."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Thunderous Slam attacks."
      }
    ],
    actions: [
      {
        id: "thunderous-slam",
        name: "Thunderous Slam",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 8,
            onHit: [
              {
                damage: "2d8+5",
                type: "thunder"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "whirlwind",
        name: "Whirlwind",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "str",
            dc: 13,
            half: true,
            onFail: [
              {
                damage: "4d10+2",
                type: "thunder"
              },
              {
                move: 20,
                dir: "away"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "Recharge 4-6 (the engine does not track recharge). One Medium or smaller creature within 5 feet is hurled away and knocked Prone."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A roaring whirl of wind that flies without a pause."
  },
  {
    id: "animated-armor",
    name: "Animated Armor",
    source: "SRD 5.2.1",
    size: "medium",
    type: "construct",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 18,
    hp: 33,
    speed: {
      walk: 25
    },
    abilities: {
      str: 14,
      dex: 11,
      con: 13,
      int: 1,
      wis: 3,
      cha: 1
    },
    resist: [],
    vulnerable: [],
    immune: [
      "poison",
      "psychic"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Exhaustion, Frightened, Paralyzed, Petrified and Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Slam attacks."
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
      }
    ],
    tier: "assist",
    checked: false,
    text: "A suit of armor that moves on its own."
  },
  {
    id: "animated-flying-sword",
    name: "Animated Flying Sword",
    source: "SRD 5.2.1",
    size: "small",
    type: "construct",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 17,
    hp: 14,
    speed: {
      walk: 5,
      fly: 50
    },
    abilities: {
      str: 12,
      dex: 15,
      con: 11,
      int: 1,
      wis: 5,
      cha: 1
    },
    hover: true,
    resist: [],
    vulnerable: [],
    immune: [
      "poison",
      "psychic"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Exhaustion, Frightened, Paralyzed, Petrified and Poisoned condition(s). The engine has no field for condition immunities yet."
      }
    ],
    actions: [
      {
        id: "slash",
        name: "Slash",
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
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A sword that hovers and fights by itself."
  },
  {
    id: "animated-rug-of-smothering",
    name: "Animated Rug of Smothering",
    source: "SRD 5.2.1",
    size: "large",
    type: "construct",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 27,
    speed: {
      walk: 10
    },
    abilities: {
      str: 17,
      dex: 14,
      con: 10,
      int: 1,
      wis: 3,
      cha: 1
    },
    resist: [],
    vulnerable: [],
    immune: [
      "poison",
      "psychic"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Exhaustion, Frightened, Paralyzed, Petrified and Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "damage-transfer",
        name: "Damage Transfer",
        modifiers: [],
        text: "While it grapples a creature, it takes only half the damage dealt to it and the grappled creature takes the other half. The DM applies this."
      }
    ],
    actions: [
      {
        id: "smother",
        name: "Smother",
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
                type: "bludgeoning"
              },
              {
                manual: "Alternatively (it cannot Smother again while holding someone): a Medium or smaller target is Grappled (escape DC 13), Blinded, Restrained and suffocating, and takes 2d6+3 bludgeoning at the start of each of its turns. One creature at a time."
              }
            ]
          }
        ],
        text: "A melee attack, or a grapple that smothers a Medium or smaller target."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A rug that wraps and smothers whoever steps on it."
  },
  {
    id: "ankheg",
    name: "Ankheg",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 14,
    hp: 45,
    speed: {
      walk: 30,
      burrow: 10
    },
    abilities: {
      str: 17,
      dex: 11,
      con: 14,
      int: 1,
      wis: 13,
      cha: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "tunneler",
        name: "Tunneler",
        modifiers: [],
        text: "Can burrow through solid rock at half its burrow speed, leaving a tunnel 10 feet across."
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
                damage: "2d6+3",
                type: "slashing"
              },
              {
                damage: "1d6",
                type: "acid"
              },
              {
                condition: "grappled"
              }
            ]
          }
        ],
        text: "A melee attack with extra acid damage that grapples a Large or smaller target (escape DC 13). It has Advantage against a creature it already grapples."
      },
      {
        id: "acid-spray",
        name: "Acid Spray",
        target: {
          area: {
            shape: "line",
            size: 30
          }
        },
        effects: [
          {
            save: "dex",
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "4d6",
                type: "acid"
              }
            ]
          }
        ],
        text: "Recharge 6 (not tracked). A line 30 feet long and 5 feet wide."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A burrowing insectoid that spits acid."
  },
  {
    id: "assassin",
    name: "Assassin",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 16,
    hp: 97,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 18,
      con: 14,
      int: 16,
      wis: 11,
      cha: 10
    },
    skills: {
      acrobatics: 7,
      perception: 6,
      stealth: 10
    },
    resist: [
      "poison"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "evasion",
        name: "Evasion",
        modifiers: [],
        text: "On a Dexterity save for half damage it takes none on a success and half on a failure, unless Incapacitated."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Three attacks, in any mix of Shortsword and Light Crossbow."
      },
      {
        id: "cunning-action",
        name: "Cunning Action",
        modifiers: [],
        text: "Bonus Action: Dash, Disengage or Hide."
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
            bonus: 7,
            onHit: [
              {
                damage: "1d6+4",
                type: "piercing"
              },
              {
                damage: "5d6",
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
        text: "A melee attack with heavy poison damage that Poisons the target until the assassin's next turn."
      },
      {
        id: "light-crossbow",
        name: "Light Crossbow",
        target: {
          creature: {
            range: [
              80,
              320
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
                damage: "1d8+4",
                type: "piercing"
              },
              {
                damage: "6d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A ranged attack with heavy poison damage."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A professional killer who strikes with poison."
  },
  {
    id: "awakened-shrub",
    name: "Awakened Shrub",
    source: "SRD 5.2.1",
    size: "small",
    type: "plant",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 9,
    hp: 10,
    speed: {
      walk: 20
    },
    abilities: {
      str: 3,
      dex: 8,
      con: 11,
      int: 10,
      wis: 10,
      cha: 6
    },
    resist: [
      "piercing"
    ],
    vulnerable: [
      "fire"
    ],
    immune: [],
    traits: [],
    actions: [
      {
        id: "rake",
        name: "Rake",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 1,
            onHit: [
              {
                damage: "+1",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A shrub that has woken up and can move."
  },
  {
    id: "awakened-tree",
    name: "Awakened Tree",
    source: "SRD 5.2.1",
    size: "huge",
    type: "plant",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 59,
    speed: {
      walk: 20
    },
    abilities: {
      str: 19,
      dex: 6,
      con: 15,
      int: 10,
      wis: 10,
      cha: 7
    },
    resist: [
      "bludgeoning",
      "piercing"
    ],
    vulnerable: [
      "fire"
    ],
    immune: [],
    traits: [],
    actions: [
      {
        id: "slam",
        name: "Slam",
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
                damage: "3d6+4",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A tree that has woken up and can walk."
  },
  {
    id: "axe-beak",
    name: "Axe Beak",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 11,
    hp: 19,
    speed: {
      walk: 50
    },
    abilities: {
      str: 14,
      dex: 12,
      con: 12,
      int: 2,
      wis: 10,
      cha: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
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
                damage: "1d8+2",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A tall flightless bird with a sharp beak."
  },
  {
    id: "azer-sentinel",
    name: "Azer Sentinel",
    source: "SRD 5.2.1",
    size: "medium",
    type: "elemental",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 17,
    hp: 39,
    speed: {
      walk: 30
    },
    abilities: {
      str: 17,
      dex: 12,
      con: 15,
      int: 12,
      wis: 13,
      cha: 10
    },
    resist: [],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "fire-aura",
        name: "Fire Aura",
        modifiers: [],
        text: "At the end of each of its turns, creatures it chooses in a 5 foot emanation take 1d10 fire damage unless it is Incapacitated. The DM applies this."
      },
      {
        id: "illumination",
        name: "Illumination",
        modifiers: [],
        text: "Gives off Bright Light in 10 feet and Dim Light for 10 feet beyond."
      }
    ],
    actions: [
      {
        id: "burning-hammer",
        name: "Burning Hammer",
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
                type: "bludgeoning"
              },
              {
                damage: "1d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A fire-wreathed dwarf-like guard of brass and flame."
  },
  {
    id: "balor",
    name: "Balor",
    source: "SRD 5.2.1",
    size: "huge",
    type: "fiend",
    cr: 19,
    xp: 22000,
    pb: 6,
    ac: 19,
    hp: 287,
    speed: {
      walk: 40,
      fly: 80
    },
    abilities: {
      str: 26,
      dex: 15,
      con: 22,
      int: 20,
      wis: 16,
      cha: 22
    },
    skills: {
      perception: 9
    },
    resist: [
      "cold",
      "lightning"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened and Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "death-throes",
        name: "Death Throes",
        modifiers: [],
        text: "When it dies it explodes: Dexterity save DC 20 in a 30 foot emanation, 9d6 fire plus 9d6 force, half on a success. Outside the Abyss it returns there with full Hit Points. The DM applies this."
      },
      {
        id: "fire-aura",
        name: "Fire Aura",
        modifiers: [],
        text: "At the end of each of its turns, creatures in a 5 foot emanation take 3d8 fire damage. The DM applies this."
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
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Flame Whip and one Lightning Blade."
      },
      {
        id: "teleport",
        name: "Teleport",
        modifiers: [],
        text: "Bonus Action: it or a willing demon within 10 feet teleports up to 60 feet to a visible unoccupied space. The DM applies this."
      }
    ],
    actions: [
      {
        id: "flame-whip",
        name: "Flame Whip",
        target: {
          creature: {
            reach: 30
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
                type: "force"
              },
              {
                damage: "5d6",
                type: "fire"
              },
              {
                manual: "A Huge or smaller target is pulled up to 25 feet toward the balor and knocked Prone."
              }
            ]
          }
        ],
        text: "A long melee attack that pulls the target in."
      },
      {
        id: "lightning-blade",
        name: "Lightning Blade",
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
                damage: "3d8+8",
                type: "force"
              },
              {
                damage: "4d10",
                type: "lightning"
              },
              {
                manual: "The target cannot take Reactions until the start of the balor's next turn."
              }
            ]
          }
        ],
        text: "A melee attack that also stops Reactions."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A towering demon of fire and lightning."
  },
  {
    id: "barbed-devil",
    name: "Barbed Devil",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 15,
    hp: 110,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 16,
      dex: 17,
      con: 18,
      int: 12,
      wis: 14,
      cha: 14
    },
    skills: {
      deception: 5,
      insight: 5,
      perception: 8
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "barbed-hide",
        name: "Barbed Hide",
        modifiers: [],
        text: "At the start of its turn, a creature it grapples, or that grapples it, takes 1d10 piercing. The DM applies this."
      },
      {
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If killed outside the Nine Hells, it returns there with all its Hit Points."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Claws and one Tail, or two Hurl Flame."
      }
    ],
    actions: [
      {
        id: "claws",
        name: "Claws",
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
                condition: "grappled"
              }
            ]
          }
        ],
        text: "A melee attack that grapples a Large or smaller target (escape DC 13)."
      },
      {
        id: "tail",
        name: "Tail",
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
                damage: "2d10+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "hurl-flame",
        name: "Hurl Flame",
        target: {
          creature: {
            range: [
              150,
              150
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
                damage: "5d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A ranged fire attack that can light flammable objects."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A spiny devil that holds its victims fast."
  },
  {
    id: "bearded-devil",
    name: "Bearded Devil",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 13,
    hp: 58,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 15,
      con: 15,
      int: 9,
      wis: 11,
      cha: 14
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Frightened and Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Beard and one Infernal Glaive."
      }
    ],
    actions: [
      {
        id: "beard",
        name: "Beard",
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
                condition: "poisoned",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              },
              {
                manual: "While Poisoned this way the target cannot regain Hit Points."
              }
            ]
          }
        ],
        text: "A melee attack that Poisons the target until the devil's next turn."
      },
      {
        id: "infernal-glaive",
        name: "Infernal Glaive",
        target: {
          creature: {
            reach: 10
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
                type: "slashing"
              },
              {
                manual: "A target without an infernal wound makes a Constitution save (DC 12) or gains one, losing Hit Points each turn until it is stanched; see the SRD."
              }
            ]
          }
        ],
        text: "A reach attack that can leave a bleeding infernal wound."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A devil with a wounding glaive and a poisonous beard."
  },
  {
    id: "behir",
    name: "Behir",
    source: "SRD 5.2.1",
    size: "huge",
    type: "monstrosity",
    cr: 11,
    xp: 7200,
    pb: 4,
    ac: 17,
    hp: 168,
    speed: {
      walk: 50,
      climb: 50
    },
    abilities: {
      str: 23,
      dex: 16,
      con: 18,
      int: 7,
      wis: 14,
      cha: 12
    },
    skills: {
      perception: 6,
      stealth: 7
    },
    resist: [],
    vulnerable: [],
    immune: [
      "lightning"
    ],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Bite and one Constrict."
      },
      {
        id: "swallow-rules",
        name: "Swallow",
        modifiers: [],
        text: "Bonus Action: swallows a Large or smaller creature it has Grappled; see the Swallow action."
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
            bonus: 10,
            onHit: [
              {
                damage: "2d12+6",
                type: "piercing"
              },
              {
                damage: "2d10",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A melee attack with extra lightning damage."
      },
      {
        id: "constrict",
        name: "Constrict",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "str",
            dc: 18,
            half: false,
            onFail: [
              {
                damage: "5d8+6",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              }
            ]
          }
        ],
        text: "Squeezes a Large or smaller creature within 5 feet; the grapple escape DC is 16."
      },
      {
        id: "lightning-breath",
        name: "Lightning Breath",
        target: {
          area: {
            shape: "line",
            size: 90
          }
        },
        effects: [
          {
            save: "dex",
            dc: 16,
            half: true,
            onFail: [
              {
                damage: "12d10",
                type: "lightning"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 90 feet long and 5 feet wide."
      },
      {
        id: "swallow",
        name: "Swallow",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Bonus Action: a Large or smaller creature grappled by the behir makes a Dexterity save (DC 18) or is swallowed: Blinded, Restrained, with total cover, taking 6d6 acid at the start of each behir turn. If the behir takes 30 or more damage in one turn from the swallowed creature it makes a Constitution save (DC 14) or regurgitates it. If the behir dies the creature is freed."
          }
        ],
        text: "Swallows a grappled creature whole; the DM applies the details."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A huge serpentine hunter that breathes lightning."
  },
  {
    id: "black-pudding",
    name: "Black Pudding",
    source: "SRD 5.2.1",
    size: "large",
    type: "ooze",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 7,
    hp: 68,
    speed: {
      walk: 20,
      climb: 20
    },
    abilities: {
      str: 16,
      dex: 5,
      con: 16,
      int: 1,
      wis: 6,
      cha: 1
    },
    resist: [],
    vulnerable: [],
    immune: [
      "acid",
      "cold",
      "lightning",
      "slashing"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Exhaustion, Frightened, Grappled, Prone and Restrained condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "amorphous",
        name: "Amorphous",
        modifiers: [],
        text: "Can move through a gap as narrow as 1 inch without squeezing."
      },
      {
        id: "corrosive-form",
        name: "Corrosive Form",
        modifiers: [],
        text: "A creature that hits it in melee takes 1d8 acid, and nonmagical weapons used take a cumulative -1 penalty. The DM applies this."
      },
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Climbs difficult surfaces without ability checks."
      },
      {
        id: "split",
        name: "Split",
        modifiers: [],
        text: "Reaction: when hit by lightning or slashing damage while Bloodied or at 10 or more HP, it splits into two puddings one size smaller. The DM applies this."
      }
    ],
    actions: [
      {
        id: "dissolving-pseudopod",
        name: "Dissolving Pseudopod",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 5,
            onHit: [
              {
                damage: "4d6+3",
                type: "acid"
              },
              {
                manual: "Nonmagical armor the target wears takes a cumulative -1 penalty to AC, destroyed at AC 10."
              }
            ]
          }
        ],
        text: "A reach attack that corrodes armor."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A hungry, acidic ooze that splits when cut."
  },
  {
    id: "blink-dog",
    name: "Blink Dog",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 13,
    hp: 22,
    speed: {
      walk: 40
    },
    abilities: {
      str: 12,
      dex: 17,
      con: 12,
      int: 10,
      wis: 13,
      cha: 11
    },
    skills: {
      perception: 5,
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
                damage: "1d4+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "teleport",
        name: "Teleport",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Bonus Action (Recharge 4-6): the blink dog teleports up to 40 feet to a visible unoccupied space."
          }
        ],
        text: "Short-range teleport as a bonus action."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A dog that teleports in and out of sight."
  },
  {
    id: "bone-devil",
    name: "Bone Devil",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 9,
    xp: 5000,
    pb: 4,
    ac: 16,
    hp: 161,
    speed: {
      walk: 40,
      fly: 40
    },
    abilities: {
      str: 18,
      dex: 16,
      con: 18,
      int: 13,
      wis: 14,
      cha: 16
    },
    skills: {
      deception: 7,
      insight: 6
    },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If killed outside the Nine Hells, it returns there with all its Hit Points."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Claw attacks and one Infernal Sting."
      }
    ],
    actions: [
      {
        id: "claw",
        name: "Claw",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 8,
            onHit: [
              {
                damage: "2d8+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A reach melee attack."
      },
      {
        id: "infernal-sting",
        name: "Infernal Sting",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 8,
            onHit: [
              {
                damage: "2d10+4",
                type: "piercing"
              },
              {
                damage: "4d8",
                type: "poison"
              },
              {
                condition: "poisoned",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              },
              {
                manual: "While Poisoned this way the target cannot regain Hit Points."
              }
            ]
          }
        ],
        text: "A reach attack with poison that Poisons the target."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A skeletal devil with a venomous stinging tail."
  },
  {
    id: "bandit",
    name: "Bandit",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 12,
    hp: 11,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 12,
      con: 12,
      int: 10,
      wis: 10,
      cha: 10
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "scimitar",
        name: "Scimitar",
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
      },
      {
        id: "light-crossbow",
        name: "Light Crossbow",
        target: {
          creature: {
            range: [
              80,
              320
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
                damage: "1d8+1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A common outlaw."
  },
  {
    id: "bandit-captain",
    name: "Bandit Captain",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 15,
    hp: 52,
    speed: {
      walk: 30
    },
    abilities: {
      str: 15,
      dex: 16,
      con: 14,
      int: 14,
      wis: 11,
      cha: 14
    },
    skills: {
      athletics: 4,
      deception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two attacks, in any combination of Scimitar and Pistol."
      },
      {
        id: "parry",
        name: "Parry",
        modifiers: [],
        text: "Reaction: when hit by a melee attack while holding a weapon, it adds 2 to its AC against that attack. The DM applies this."
      }
    ],
    actions: [
      {
        id: "scimitar",
        name: "Scimitar",
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
            bonus: 5,
            onHit: [
              {
                damage: "1d10+3",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A ranged attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "The leader of a band of outlaws."
  },
  {
    id: "basilisk",
    name: "Basilisk",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 15,
    hp: 52,
    speed: {
      walk: 20
    },
    abilities: {
      str: 16,
      dex: 8,
      con: 15,
      int: 2,
      wis: 8,
      cha: 7
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
                damage: "2d6+3",
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
        id: "petrifying-gaze",
        name: "Petrifying Gaze",
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            save: "con",
            dc: 12,
            half: false,
            onFail: [
              {
                condition: "restrained",
                ends: {
                  on: "save",
                  save: "con",
                  at: "turnEnd"
                }
              },
              {
                manual: "A creature that fails a second time while Restrained by the gaze is Petrified instead. The basilisk also saves if it sees its own reflection in the cone."
              }
            ]
          }
        ],
        text: "Bonus Action, Recharge 4-6 (not tracked). A 30 foot cone."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A reptile whose gaze turns creatures to stone."
  },
  {
    id: "berserker",
    name: "Berserker",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 67,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 12,
      con: 17,
      int: 9,
      wis: 11,
      cha: 9
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "bloodied-frenzy",
        name: "Bloodied Frenzy",
        modifiers: [],
        text: "While Bloodied it has Advantage on attack rolls and saving throws. The engine cannot test for Bloodied yet; the DM applies it."
      }
    ],
    actions: [
      {
        id: "greataxe",
        name: "Greataxe",
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
                damage: "1d12+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A frenzied warrior who fights without fear."
  },
  {
    id: "black-dragon-wyrmling",
    name: "Black Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 17,
    hp: 33,
    speed: {
      walk: 30,
      fly: 60,
      swim: 30
    },
    abilities: {
      str: 15,
      dex: 14,
      con: 13,
      int: 10,
      wis: 11,
      cha: 13
    },
    skills: {
      perception: 4,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [
      "acid"
    ],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Rend attacks."
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
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "slashing"
              },
              {
                damage: "1d4",
                type: "acid"
              }
            ]
          }
        ],
        text: "A melee attack with extra acid damage."
      },
      {
        id: "acid-breath",
        name: "Acid Breath",
        target: {
          area: {
            shape: "line",
            size: 15
          }
        },
        effects: [
          {
            save: "dex",
            dc: 11,
            half: true,
            onFail: [
              {
                damage: "5d8",
                type: "acid"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 15 feet long and 5 feet wide."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A young swamp dragon with an acid breath."
  },
  {
    id: "blue-dragon-wyrmling",
    name: "Blue Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 17,
    hp: 65,
    speed: {
      walk: 30,
      burrow: 15,
      fly: 60
    },
    abilities: {
      str: 17,
      dex: 10,
      con: 15,
      int: 12,
      wis: 11,
      cha: 15
    },
    skills: {
      perception: 4,
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "lightning"
    ],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Rend attacks."
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
                damage: "1d10+3",
                type: "slashing"
              },
              {
                damage: "1d6",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A melee attack with extra lightning damage."
      },
      {
        id: "lightning-breath",
        name: "Lightning Breath",
        target: {
          area: {
            shape: "line",
            size: 30
          }
        },
        effects: [
          {
            save: "dex",
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "6d6",
                type: "lightning"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 30 feet long and 5 feet wide."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A young desert dragon with a lightning breath."
  },
  {
    id: "brass-dragon-wyrmling",
    name: "Brass Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 15,
    hp: 22,
    speed: {
      walk: 30,
      burrow: 15,
      fly: 60
    },
    abilities: {
      str: 15,
      dex: 10,
      con: 13,
      int: 10,
      wis: 11,
      cha: 13
    },
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
                damage: "1d10+2",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "fire-breath",
        name: "Fire Breath",
        target: {
          area: {
            shape: "line",
            size: 20
          }
        },
        effects: [
          {
            save: "dex",
            dc: 11,
            half: true,
            onFail: [
              {
                damage: "4d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 20 feet long and 5 feet wide."
      },
      {
        id: "sleep-breath",
        name: "Sleep Breath",
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "con",
            dc: 11,
            half: false,
            onFail: [
              {
                condition: "incapacitated"
              },
              {
                manual: "A target that fails a second save falls Unconscious for 1 minute; the effect ends if it takes damage or someone within 5 feet wakes it."
              }
            ]
          }
        ],
        text: "A 15 foot cone of sleep."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A young desert dragon that likes to talk."
  },
  {
    id: "bronze-dragon-wyrmling",
    name: "Bronze Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 15,
    hp: 39,
    speed: {
      walk: 30,
      fly: 60,
      swim: 30
    },
    abilities: {
      str: 17,
      dex: 10,
      con: 15,
      int: 12,
      wis: 11,
      cha: 15
    },
    skills: {
      perception: 4,
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [
      "lightning"
    ],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Rend attacks."
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
                damage: "1d10+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "lightning-breath",
        name: "Lightning Breath",
        target: {
          area: {
            shape: "line",
            size: 40
          }
        },
        effects: [
          {
            save: "dex",
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "3d10",
                type: "lightning"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 40 feet long and 5 feet wide."
      },
      {
        id: "repulsion-breath",
        name: "Repulsion Breath",
        target: {
          area: {
            shape: "cone",
            size: 30
          }
        },
        effects: [
          {
            save: "str",
            dc: 12,
            half: false,
            onFail: [
              {
                move: 30,
                dir: "away"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A 30 foot cone that pushes targets away. The SRD text on Prone should be rechecked."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A young coastal dragon with a repelling breath."
  },
  {
    id: "copper-dragon-wyrmling",
    name: "Copper Dragon Wyrmling",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 16,
    hp: 22,
    speed: {
      walk: 30,
      climb: 30,
      fly: 60
    },
    abilities: {
      str: 15,
      dex: 12,
      con: 13,
      int: 14,
      wis: 11,
      cha: 13
    },
    skills: {
      perception: 4,
      stealth: 3
    },
    resist: [],
    vulnerable: [],
    immune: [
      "acid"
    ],
    traits: [],
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
            bonus: 4,
            onHit: [
              {
                damage: "1d10+2",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "acid-breath",
        name: "Acid Breath",
        target: {
          area: {
            shape: "line",
            size: 20
          }
        },
        effects: [
          {
            save: "dex",
            dc: 11,
            half: true,
            onFail: [
              {
                damage: "4d8",
                type: "acid"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A line 20 feet long and 5 feet wide."
      },
      {
        id: "slowing-breath",
        name: "Slowing Breath",
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            manual: "Constitution save (DC 11) in a 15 foot cone. On a failure the target cannot take Reactions, its Speed is halved, and it can take only an action or a Bonus Action, not both, until the end of its next turn."
          }
        ],
        text: "A 15 foot cone that slows targets."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A young hill dragon that loves jokes."
  },
  {
    id: "bugbear-warrior",
    name: "Bugbear Warrior",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 14,
    hp: 33,
    speed: {
      walk: 30
    },
    abilities: {
      str: 15,
      dex: 14,
      con: 13,
      int: 8,
      wis: 11,
      cha: 9
    },
    skills: {
      stealth: 6,
      survival: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "abduct",
        name: "Abduct",
        modifiers: [],
        text: "Can move a creature it is grappling at its full speed."
      }
    ],
    actions: [
      {
        id: "grab",
        name: "Grab",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "2d6+2",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              }
            ]
          }
        ],
        text: "A reach attack that grapples a Medium or smaller target (escape DC 12)."
      },
      {
        id: "light-hammer",
        name: "Light Hammer",
        target: {
          creature: {
            reach: 10
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 4,
            onHit: [
              {
                damage: "3d4+2",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A reach melee attack, with Advantage if the target is Grappled."
      },
      {
        id: "light-hammer-thrown",
        name: "Light Hammer (thrown)",
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
            bonus: 4,
            onHit: [
              {
                damage: "3d4+2",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "The same hammer thrown."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A hulking goblinoid ambusher."
  },
  {
    id: "bulette",
    name: "Bulette",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 17,
    hp: 94,
    speed: {
      walk: 40,
      burrow: 40
    },
    abilities: {
      str: 19,
      dex: 11,
      con: 21,
      int: 2,
      wis: 10,
      cha: 5
    },
    skills: {
      perception: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Bite attacks."
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
                damage: "2d12+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "deadly-leap",
        name: "Deadly Leap",
        target: {
          area: {
            shape: "cylinder",
            size: 5
          }
        },
        effects: [
          {
            save: "dex",
            dc: 15,
            half: true,
            onFail: [
              {
                damage: "3d12",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "The bulette jumps up to 15 feet and lands on Large or smaller creatures. On a success the target takes half damage and is pushed 5 feet instead of knocked Prone; the DM applies that."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A burrowing land-shark that leaps from the earth."
  },
  {
    id: "centaur-trooper",
    name: "Centaur Trooper",
    source: "SRD 5.2.1",
    size: "large",
    type: "fey",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 16,
    hp: 45,
    speed: {
      walk: 50
    },
    abilities: {
      str: 18,
      dex: 14,
      con: 14,
      int: 9,
      wis: 13,
      cha: 11
    },
    skills: {
      athletics: 6,
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two attacks, in any combination of Pike and Longbow."
      }
    ],
    actions: [
      {
        id: "pike",
        name: "Pike",
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
                damage: "1d10+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A reach melee attack."
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
      },
      {
        id: "trampling-charge",
        name: "Trampling Charge",
        target: {
          self: true
        },
        effects: [
          {
            save: "str",
            dc: 14,
            half: false,
            onFail: [
              {
                damage: "1d6+4",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "Bonus Action, Recharge 5-6 (not tracked). It moves up to its full Speed without provoking opportunity attacks and can pass through Medium or smaller creatures, which save as it goes. The DM applies the movement."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A centaur soldier with a pike and a bow."
  },
  {
    id: "chain-devil",
    name: "Chain Devil",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 15,
    hp: 85,
    speed: {
      walk: 30
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 18,
      int: 11,
      wis: 12,
      cha: 14
    },
    resist: [
      "bludgeoning",
      "cold",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If killed outside the Nine Hells, it returns there with all its Hit Points."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Chain attacks and Conjure Infernal Chain."
      },
      {
        id: "unnerving-gaze",
        name: "Unnerving Gaze",
        modifiers: [],
        text: "Reaction: when a creature within 30 feet starts its turn able to see the devil, it makes a Wisdom save (DC 15) or is Frightened until the end of its turn; on a success it is immune for 24 hours. The DM applies this."
      }
    ],
    actions: [
      {
        id: "chain",
        name: "Chain",
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
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              }
            ]
          }
        ],
        text: "A reach attack that grapples a Large or smaller target (escape DC 14)."
      },
      {
        id: "conjure-infernal-chain",
        name: "Conjure Infernal Chain",
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
            save: "dex",
            dc: 15,
            half: false,
            onFail: [
              {
                damage: "2d4+4",
                type: "fire"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Restrained until the end of the devil's next turn; a Large or smaller target is pulled up to 30 feet toward the devil."
              }
            ]
          }
        ],
        text: "Chains lash a creature within 60 feet."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A devil wrapped in animate hooked chains."
  },
  {
    id: "chimera",
    name: "Chimera",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 14,
    hp: 114,
    speed: {
      walk: 30,
      fly: 60
    },
    abilities: {
      str: 19,
      dex: 11,
      con: 19,
      int: 3,
      wis: 14,
      cha: 10
    },
    skills: {
      perception: 8
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Ram, one Bite and one Claw; Fire Breath may replace the Claw."
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
                damage: "2d6+4",
                type: "piercing"
              },
              {
                damage: "2d6",
                type: "piercing",
                when: [
                  "attack.advantage"
                ]
              }
            ]
          }
        ],
        text: "A melee attack that deals extra damage when the roll had Advantage."
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
            bonus: 7,
            onHit: [
              {
                damage: "1d6+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "ram",
        name: "Ram",
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
                damage: "1d12+4",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack that knocks a Medium or smaller target Prone; the engine does not apply the size limit."
      },
      {
        id: "fire-breath",
        name: "Fire Breath",
        target: {
          area: {
            shape: "cone",
            size: 15
          }
        },
        effects: [
          {
            save: "dex",
            dc: 15,
            half: true,
            onFail: [
              {
                damage: "7d8",
                type: "fire"
              }
            ]
          }
        ],
        text: "Recharge 5-6 (not tracked). A 15 foot cone."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A three-headed flying beast of lion, goat and dragon."
  },
  {
    id: "chuul",
    name: "Chuul",
    source: "SRD 5.2.1",
    size: "large",
    type: "aberration",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 16,
    hp: 76,
    speed: {
      walk: 30,
      swim: 30
    },
    abilities: {
      str: 19,
      dex: 10,
      con: 16,
      int: 5,
      wis: 11,
      cha: 5
    },
    skills: {
      perception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [
      "poison"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
      {
        id: "sense-magic",
        name: "Sense Magic",
        modifiers: [],
        text: "Senses magic within 120 feet, as with Detect Magic."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Pincer attacks and Paralyzing Tentacles."
      }
    ],
    actions: [
      {
        id: "pincer",
        name: "Pincer",
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
                damage: "1d10+4",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              }
            ]
          }
        ],
        text: "A reach attack that grapples a Large or smaller target (escape DC 14)."
      },
      {
        id: "paralyzing-tentacles",
        name: "Paralyzing Tentacles",
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
                condition: "poisoned",
                ends: {
                  on: "save",
                  save: "con",
                  at: "turnEnd"
                }
              },
              {
                manual: "While Poisoned this way the target is also Paralyzed. The effect ends after 1 minute."
              }
            ]
          }
        ],
        text: "Poisons and paralyzes a creature the chuul has Grappled."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A crustacean horror that drags prey into the water."
  },
  {
    id: "clay-golem",
    name: "Clay Golem",
    source: "SRD 5.2.1",
    size: "large",
    type: "construct",
    cr: 9,
    xp: 5000,
    pb: 4,
    ac: 14,
    hp: 123,
    speed: {
      walk: 30
    },
    abilities: {
      str: 20,
      dex: 9,
      con: 18,
      int: 3,
      wis: 8,
      cha: 1
    },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "acid",
      "poison",
      "psychic"
    ],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Petrified and Poisoned condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "acid-absorption",
        name: "Acid Absorption",
        modifiers: [],
        text: "Acid damage heals it instead of hurting it. The DM applies this."
      },
      {
        id: "berserk",
        name: "Berserk",
        modifiers: [],
        text: "When Bloodied it may go berserk (1d6 each turn). The DM applies this."
      },
      {
        id: "immutable-form",
        name: "Immutable Form",
        modifiers: [],
        text: "Cannot be changed by spells that alter form."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Slam attacks, or three if it used Hasten this turn."
      },
      {
        id: "hasten",
        name: "Hasten",
        modifiers: [],
        text: "Bonus Action, Recharge 5-6: Dash and Disengage. The DM applies this."
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
            bonus: 9,
            onHit: [
              {
                damage: "1d10+5",
                type: "bludgeoning"
              },
              {
                damage: "1d12",
                type: "acid"
              },
              {
                manual: "The target's Hit Point maximum is reduced by the acid damage taken."
              }
            ]
          }
        ],
        text: "A melee attack with acid that lowers the target's maximum Hit Points."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A hulking figure of enchanted clay."
  },
  {
    id: "cloaker",
    name: "Cloaker",
    source: "SRD 5.2.1",
    size: "large",
    type: "aberration",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 14,
    hp: 91,
    speed: {
      walk: 10,
      fly: 40
    },
    abilities: {
      str: 17,
      dex: 15,
      con: 12,
      int: 13,
      wis: 14,
      cha: 7
    },
    skills: {
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Frightened condition(s). The engine has no field for condition immunities yet."
      },
      {
        id: "light-sensitivity",
        name: "Light Sensitivity",
        modifiers: [],
        text: "Has Disadvantage on attack rolls while in Bright Light. The DM applies this."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Attach and two Tail attacks."
      }
    ],
    actions: [
      {
        id: "attach",
        name: "Attach",
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
                damage: "3d6+3",
                type: "piercing"
              },
              {
                condition: "blinded"
              },
              {
                manual: "A Large or smaller target is attached: Blinded, and the cloaker takes half the damage dealt to it while the target takes the other half. Detaching takes 5 feet of movement; the target or a creature within 5 feet can use an action for a Strength (Athletics) check, DC 14."
              }
            ]
          }
        ],
        text: "A melee attack that clamps onto the target."
      },
      {
        id: "tail",
        name: "Tail",
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
                damage: "1d10+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A reach melee attack."
      },
      {
        id: "moan",
        name: "Moan",
        target: {
          area: {
            shape: "emanation",
            size: 60
          }
        },
        effects: [
          {
            manual: "Bonus Action: creatures in a 60 foot emanation make a Wisdom save (DC 13) or are Frightened until the end of the cloaker's next turn; on a success they are immune for 24 hours."
          }
        ],
        text: "A frightening moan."
      },
      {
        id: "phantasms",
        name: "Phantasms",
        target: {
          self: true
        },
        effects: [
          {
            manual: "Bonus Action, once per short or long rest: the cloaker casts Mirror Image. It ends early if the cloaker starts or ends its turn in Bright Light."
          }
        ],
        text: "Casts Mirror Image."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A manta-like ambusher that wraps its prey."
  },
  {
    id: "cloud-giant",
    name: "Cloud Giant",
    source: "SRD 5.2.1",
    size: "huge",
    type: "giant",
    cr: 9,
    xp: 5000,
    pb: 4,
    ac: 14,
    hp: 200,
    speed: {
      walk: 40,
      fly: 20
    },
    abilities: {
      str: 27,
      dex: 10,
      con: 22,
      int: 12,
      wis: 16,
      cha: 16
    },
    hover: true,
    skills: {
      insight: 7,
      perception: 11
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two attacks, using Thunderous Mace or Thundercloud, and one may be replaced by a Fog Cloud spell."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Charisma, spell save DC 15, no Material components. At will: Detect Magic, Fog Cloud, Light. 1 a day each: Control Weather, Gaseous Form, Telekinesis. Bonus Action: Misty Step. The DM casts these."
      }
    ],
    actions: [
      {
        id: "thunderous-mace",
        name: "Thunderous Mace",
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
                damage: "3d8+8",
                type: "bludgeoning"
              },
              {
                damage: "2d6",
                type: "thunder"
              }
            ]
          }
        ],
        text: "A reach melee attack with extra thunder damage."
      },
      {
        id: "thundercloud",
        name: "Thundercloud",
        target: {
          creature: {
            range: [
              240,
              240
            ]
          }
        },
        effects: [
          {
            attack: "ranged",
            kind: "weapon",
            bonus: 12,
            onHit: [
              {
                damage: "3d6+8",
                type: "thunder"
              },
              {
                condition: "incapacitated"
              }
            ]
          }
        ],
        text: "A thunderous ranged attack that Incapacitates the target until the end of its next turn."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A giant of the clouds who hurls thunder."
  },
  {
    id: "cockatrice",
    name: "Cockatrice",
    source: "SRD 5.2.1",
    size: "small",
    type: "monstrosity",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 22,
    speed: {
      walk: 20,
      fly: 40
    },
    abilities: {
      str: 6,
      dex: 12,
      con: 12,
      int: 2,
      wis: 13,
      cha: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Petrified condition(s). The engine has no field for condition immunities yet."
      }
    ],
    actions: [
      {
        id: "petrifying-bite",
        name: "Petrifying Bite",
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
                damage: "1d4+1",
                type: "piercing"
              },
              {
                manual: "Constitution save (DC 11): on a failure the target is Restrained, repeating the save at the end of its next turn; on a second failure it is Petrified for 24 hours."
              }
            ]
          }
        ],
        text: "A bite that can turn the target to stone."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A chicken-like monster whose bite petrifies."
  },
  {
    id: "commoner",
    name: "Commoner",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 10,
    hp: 4,
    speed: {
      walk: 30
    },
    abilities: {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "training",
        name: "Training",
        modifiers: [],
        text: "Has proficiency in one skill chosen by the DM, with Advantage on its checks."
      }
    ],
    actions: [
      {
        id: "club",
        name: "Club",
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
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "An ordinary villager or labourer."
  },
  {
    id: "couatl",
    name: "Couatl",
    source: "SRD 5.2.1",
    size: "medium",
    type: "celestial",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 19,
    hp: 60,
    speed: {
      walk: 30,
      fly: 90
    },
    abilities: {
      str: 16,
      dex: 20,
      con: 17,
      int: 18,
      wis: 20,
      cha: 18
    },
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "psychic",
      "radiant"
    ],
    traits: [
      {
        id: "shielded-mind",
        name: "Shielded Mind",
        modifiers: [],
        text: "Cannot be read or scried by magic or have its alignment read. The DM applies this."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Wisdom, spell save DC 15, no components. At will: Detect Evil and Good, Detect Magic, Detect Thoughts, Shapechange (beast or humanoid only). 1 a day each: Create Food and Water, Dream, Greater Restoration, Scrying, Sleep. The DM casts these."
      },
      {
        id: "divine-aid",
        name: "Divine Aid",
        modifiers: [],
        text: "Bonus Action, 2 a day: casts Bless, Lesser Restoration or Sanctuary. The DM applies this."
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
                damage: "1d12+5",
                type: "piercing"
              },
              {
                condition: "poisoned",
                ends: {
                  on: "turnEnd",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A melee attack that Poisons the target until the end of the couatl's next turn."
      },
      {
        id: "constrict",
        name: "Constrict",
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
                damage: "1d6+5",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              }
            ]
          }
        ],
        text: "Squeezes a Medium or smaller creature within 5 feet (escape DC 13)."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A feathered celestial serpent."
  },
  {
    id: "cultist",
    name: "Cultist",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 12,
    hp: 9,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 12,
      con: 10,
      int: 10,
      wis: 11,
      cha: 10
    },
    skills: {
      deception: 2,
      religion: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "ritual-sickle",
        name: "Ritual Sickle",
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
                damage: "1d4+1",
                type: "slashing"
              },
              {
                damage: "+1",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A melee attack with a little extra necrotic damage."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A follower of a dark power."
  },
  {
    id: "cultist-fanatic",
    name: "Cultist Fanatic",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 44,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 14,
      con: 12,
      int: 10,
      wis: 14,
      cha: 13
    },
    skills: {
      deception: 3,
      persuasion: 3,
      religion: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Wisdom, spell save DC 12, +4 to hit with spells. At will: Light, Thaumaturgy. 2 a day: Command. 1 a day: Hold Person. Bonus Action, 2 a day: Spiritual Weapon. The DM casts these."
      }
    ],
    actions: [
      {
        id: "pact-blade",
        name: "Pact Blade",
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
                damage: "2d6",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A melee attack with extra necrotic damage."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A zealous cult leader with dark magic."
  },
  {
    id: "allosaurus",
    name: "Allosaurus",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 51,
    speed: {
      walk: 60
    },
    abilities: {
      str: 19,
      dex: 13,
      con: 17,
      int: 2,
      wis: 12,
      cha: 5
    },
    skills: {
      perception: 5
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
            bonus: 6,
            onHit: [
              {
                damage: "2d10+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "claws",
        name: "Claws",
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
                type: "slashing"
              },
              {
                manual: "If the target is Large or smaller and the allosaurus moved 30 feet or more straight toward it, the target is knocked Prone and the allosaurus can Bite it as part of this attack."
              }
            ]
          }
        ],
        text: "A melee attack that can knock the target down after a charge."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A large pouncing predator dinosaur."
  },
  {
    id: "ankylosaurus",
    name: "Ankylosaurus",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 15,
    hp: 68,
    speed: {
      walk: 30
    },
    abilities: {
      str: 19,
      dex: 11,
      con: 15,
      int: 2,
      wis: 12,
      cha: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Tail attacks."
      }
    ],
    actions: [
      {
        id: "tail",
        name: "Tail",
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
                damage: "1d10+4",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A reach attack that knocks a Huge or smaller target Prone; the engine does not apply the size limit."
      }
    ],
    tier: "assist",
    checked: false,
    text: "An armored, club-tailed dinosaur."
  },
  {
    id: "ape",
    name: "Ape",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 19,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 16,
      dex: 14,
      con: 14,
      int: 6,
      wis: 12,
      cha: 7
    },
    skills: {
      athletics: 5,
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Fist attacks."
      }
    ],
    actions: [
      {
        id: "fist",
        name: "Fist",
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
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "rock",
        name: "Rock",
        target: {
          creature: {
            range: [
              25,
              50
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
                damage: "2d6+3",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "Recharge 6 (not tracked). A thrown rock."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A strong climber that throws rocks."
  },
  {
    id: "archelon",
    name: "Archelon",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 17,
    hp: 90,
    speed: {
      walk: 20,
      swim: 80
    },
    abilities: {
      str: 18,
      dex: 16,
      con: 13,
      int: 4,
      wis: 14,
      cha: 6
    },
    skills: {
      stealth: 5
    },
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
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Bite attacks."
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
                damage: "3d6+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A giant sea turtle."
  },
  {
    id: "baboon",
    name: "Baboon",
    source: "SRD 5.2.1",
    size: "small",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 3,
    speed: {
      walk: 30,
      climb: 30
    },
    abilities: {
      str: 8,
      dex: 14,
      con: 11,
      int: 4,
      wis: 12,
      cha: 6
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
        text: "Advantage on an attack roll against a creature if an ally is next to that creature and able to act."
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
            bonus: 1,
            onHit: [
              {
                damage: "1d4-1",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "auto",
    checked: false,
    text: "A small climbing monkey that fights in troops."
  },
  {
    id: "badger",
    name: "Badger",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 11,
    hp: 5,
    speed: {
      walk: 20,
      burrow: 5
    },
    abilities: {
      str: 10,
      dex: 11,
      con: 16,
      int: 2,
      wis: 12,
      cha: 5
    },
    skills: {
      perception: 3
    },
    resist: [
      "poison"
    ],
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
    tier: "auto",
    checked: false,
    text: "A tiny burrowing animal."
  },
  {
    id: "bat",
    name: "Bat",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 1,
    speed: {
      walk: 5,
      fly: 30
    },
    abilities: {
      str: 2,
      dex: 15,
      con: 8,
      int: 2,
      wis: 12,
      cha: 4
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
    tier: "auto",
    checked: false,
    text: "A small flying animal."
  },
  {
    id: "black-bear",
    name: "Black Bear",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 19,
    speed: {
      walk: 30,
      climb: 30,
      swim: 30
    },
    abilities: {
      str: 15,
      dex: 12,
      con: 14,
      int: 2,
      wis: 12,
      cha: 7
    },
    skills: {
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Rend attacks."
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
            bonus: 4,
            onHit: [
              {
                damage: "1d6+2",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A forest bear that climbs and swims."
  },
  {
    id: "blood-hawk",
    name: "Blood Hawk",
    source: "SRD 5.2.1",
    size: "small",
    type: "beast",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 12,
    hp: 7,
    speed: {
      walk: 10,
      fly: 60
    },
    abilities: {
      str: 6,
      dex: 14,
      con: 10,
      int: 3,
      wis: 14,
      cha: 5
    },
    skills: {
      perception: 6
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
        text: "Advantage on an attack roll against a creature if an ally is next to that creature and able to act."
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
                damage: "1d4+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "A melee attack. The SRD gives 1d8+2 against a Bloodied target; the engine cannot test for Bloodied yet."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A fierce hawk that hunts in flocks."
  },
  {
    id: "boar",
    name: "Boar",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 11,
    hp: 13,
    speed: {
      walk: 40
    },
    abilities: {
      str: 13,
      dex: 11,
      con: 14,
      int: 2,
      wis: 9,
      cha: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "bloodied-fury",
        name: "Bloodied Fury",
        modifiers: [],
        text: "While Bloodied it has Advantage on attack rolls. The engine cannot test for Bloodied yet; the DM applies it."
      }
    ],
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
            bonus: 3,
            onHit: [
              {
                damage: "1d6+1",
                type: "piercing"
              },
              {
                manual: "If the target is Medium or smaller and the boar moved 20 feet or more straight toward it, it takes an extra 1d6 piercing and is knocked Prone."
              }
            ]
          }
        ],
        text: "A melee attack that hits harder after a charge."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A wild pig with tusks."
  },
  {
    id: "brown-bear",
    name: "Brown Bear",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 11,
    hp: 22,
    speed: {
      walk: 40,
      climb: 30
    },
    abilities: {
      str: 17,
      dex: 12,
      con: 15,
      int: 2,
      wis: 13,
      cha: 7
    },
    skills: {
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Bite and one Claw."
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
                damage: "1d8+3",
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
            bonus: 5,
            onHit: [
              {
                damage: "1d4+3",
                type: "slashing"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A melee attack that knocks a Large or smaller target Prone; the engine does not apply the size limit."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A big, strong bear."
  },
  {
    id: "camel",
    name: "Camel",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 10,
    hp: 17,
    speed: {
      walk: 50
    },
    abilities: {
      str: 15,
      dex: 8,
      con: 17,
      int: 2,
      wis: 11,
      cha: 5
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
    checked: false,
    text: "A desert pack animal."
  },
  {
    id: "cat",
    name: "Cat",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 2,
    speed: {
      walk: 40,
      climb: 40
    },
    abilities: {
      str: 3,
      dex: 15,
      con: 10,
      int: 3,
      wis: 12,
      cha: 7
    },
    skills: {
      perception: 3,
      stealth: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "jumper",
        name: "Jumper",
        modifiers: [],
        text: "Its jump distance is based on Dexterity instead of Strength. The DM applies this."
      }
    ],
    actions: [
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
            bonus: 4,
            onHit: [
              {
                damage: "+1",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A house cat."
  },
  {
    id: "constrictor-snake",
    name: "Constrictor Snake",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 0.25,
    xp: 50,
    pb: 2,
    ac: 13,
    hp: 13,
    speed: {
      walk: 30,
      swim: 30
    },
    abilities: {
      str: 15,
      dex: 14,
      con: 12,
      int: 1,
      wis: 10,
      cha: 3
    },
    skills: {
      perception: 2,
      stealth: 4
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
      },
      {
        id: "constrict",
        name: "Constrict",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "str",
            dc: 12,
            half: false,
            onFail: [
              {
                damage: "3d4",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              }
            ]
          }
        ],
        text: "Squeezes a Medium or smaller creature within 5 feet (escape DC 12)."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A heavy snake that squeezes prey."
  },
  {
    id: "crab",
    name: "Crab",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 11,
    hp: 3,
    speed: {
      walk: 20,
      swim: 20
    },
    abilities: {
      str: 6,
      dex: 11,
      con: 12,
      int: 1,
      wis: 8,
      cha: 2
    },
    skills: {
      stealth: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
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
                damage: "+1",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A small shore crab."
  },
  {
    id: "crocodile",
    name: "Crocodile",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 12,
    hp: 13,
    speed: {
      walk: 20,
      swim: 30
    },
    abilities: {
      str: 15,
      dex: 10,
      con: 13,
      int: 2,
      wis: 10,
      cha: 5
    },
    skills: {
      stealth: 2
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
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              }
            ]
          }
        ],
        text: "A melee attack that grapples a Medium or smaller target (escape DC 12) and Restrains it while grappled."
      }
    ],
    tier: "assist",
    checked: false,
    text: "A river predator that drags prey underwater."
  }
];
