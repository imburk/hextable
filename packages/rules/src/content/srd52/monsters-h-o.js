// Monsters H to O from the SRD 5.2.1 (2024 rules), animals included. Data only. Format: docs/specs/rules-expansion.md.
// `text` is a plain-words description written for this project.
// `checked: true` means every number in the entry (size, AC, HP, speeds, scores, skills, defences, CR, XP,
// PB, and each attack's bonus, reach or range, damage dice and type, and save DC) was compared by script
// against the SRD 5.2.1 stat block text and matched; see the pull request. Trait and action `text` is
// paraphrase and is not part of that comparison.
// Multiattack (`multiattack`), recharge, daily uses, Bonus Actions and condition immunities have fields now and were
// filled in by script where the SRD's wording is plain; a Multiattack that involves spellcasting, "if available" or
// something the DM applies stays a trait's `text`.
// Spellcasting, legendary actions and most reactions have no fields yet, so they sit in a trait's `text` or a `manual` step and the monster is `assist`.
export const monsters = [
  {
    id: "half-dragon",
    name: "Half-Dragon",
    source: "SRD 5.2.1",
    size: "medium",
    type: "dragon",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 18,
    hp: 105,
    speed: {
      walk: 40
    },
    abilities: {
      str: 19,
      dex: 14,
      con: 16,
      int: 10,
      wis: 15,
      cha: 14
    },
    senses: { blindsight: 10, darkvision: 60 },
    skills: {
      athletics: 7,
      perception: 5,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "draconic-origin",
        name: "Draconic Origin",
        modifiers: [],
        text: "Related to a dragon of one damage type (the DM chooses acid, cold, fire, lightning or poison). That type is its Resistance and the extra damage of its Claw and breath. The engine has no field for a chosen type; the DM applies it."
      },
      {
        id: "leap",
        name: "Leap",
        modifiers: [],
        text: "Bonus Action: jumps up to 30 feet by spending 10 feet of movement. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "claw", times: 2 }],
        text: "Two Claw attacks.",
      },
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
            bonus: 7,
            onHit: [
              {
                damage: "1d4+4",
                type: "slashing"
              },
              {
                manual: "Plus 2d6 damage of the type chosen for Draconic Origin."
              }
            ]
          }
        ],
        text: "A reach attack with extra damage of the chosen type."
      },
      {
        id: "dragons-breath",
        name: "Dragon's Breath",
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
            dc: 14,
            onFail: [
              {
                manual: "The target takes 8d6 damage of the type chosen for Draconic Origin; half on a success."
              }
            ]
          }
        ],
        text: "Recharge 5-6. A 30 foot cone of the chosen damage type."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A humanoid with draconic blood who fights with claws and a breath weapon."
  },
  {
    id: "harpy",
    name: "Harpy",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 11,
    hp: 38,
    speed: {
      walk: 20,
      fly: 40
    },
    abilities: {
      str: 12,
      dex: 13,
      con: 12,
      int: 7,
      wis: 10,
      cha: 13
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
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
            bonus: 3,
            onHit: [
              {
                damage: "2d4+1",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "luring-song",
        name: "Luring Song",
        target: {
          area: {
            shape: "emanation",
            size: 300
          }
        },
        effects: [
          {
            save: "wis",
            dc: 11,
            onFail: [
              {
                condition: "charmed",
                ends: {
                  on: "save",
                  save: "wis",
                  at: "turnEnd"
                }
              },
              {
                manual: "Affects Humanoids and Giants only. Needs Concentration. While Charmed the target is Incapacitated and walks toward the harpy; it repeats the save when it takes damage from another source. On a success it is immune to this harpy's song for 24 hours."
              }
            ]
          }
        ],
        text: "A magical song in a 300 foot emanation that charms and draws in Humanoids and Giants."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A winged woman-bird whose song lures travellers to their doom."
  },
  {
    id: "hawk",
    name: "Hawk",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 13,
    hp: 1,
    speed: {
      walk: 10,
      fly: 60
    },
    abilities: {
      str: 5,
      dex: 16,
      con: 8,
      int: 2,
      wis: 14,
      cha: 6
    },
    skills: {
      perception: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
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
            bonus: 5,
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
    checked: true,
    text: "A small bird of prey."
  },
  {
    id: "hell-hound",
    name: "Hell Hound",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 15,
    hp: 58,
    speed: {
      walk: 50
    },
    abilities: {
      str: 17,
      dex: 12,
      con: 14,
      int: 6,
      wis: 13,
      cha: 6
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [
      "fire"
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
        text: "Advantage on an attack roll against a creature if an ally is next to that creature and able to act."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 2 }],
        text: "Two Bite attacks.",
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
                damage: "1d8+3",
                type: "piercing"
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
            dc: 12,
            half: true,
            onFail: [
              {
                damage: "5d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "Recharge 5-6. A 15 foot cone."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A fiery infernal hound that hunts in packs."
  },
  {
    id: "hezrou",
    name: "Hezrou",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 18,
    hp: 157,
    speed: {
      walk: 30
    },
    abilities: {
      str: 19,
      dex: 17,
      con: 20,
      int: 5,
      wis: 12,
      cha: 13
    },
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
        id: "demonic-restoration",
        name: "Demonic Restoration",
        modifiers: [],
        text: "If it dies outside the Abyss it revives with all its Hit Points somewhere in the Abyss. The DM applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The hezrou has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "stench",
        name: "Stench",
        modifiers: [],
        text: "A creature that starts its turn in a 10 foot emanation around the hezrou makes a Constitution save (DC 16) or is Poisoned until the start of its next turn. The DM runs this."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "leap",
        name: "Leap",
        modifiers: [],
        text: "Bonus Action: jumps up to 30 feet by spending 10 feet of movement. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 3 }],
        text: "Three Rend attacks.",
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
                damage: "1d4+4",
                type: "slashing"
              },
              {
                damage: "2d8",
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
    text: "A hulking toad-like demon wreathed in a poisonous stench."
  },
  {
    id: "hill-giant",
    name: "Hill Giant",
    source: "SRD 5.2.1",
    size: "huge",
    type: "giant",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 13,
    hp: 105,
    speed: {
      walk: 40
    },
    abilities: {
      str: 21,
      dex: 8,
      con: 19,
      int: 5,
      wis: 9,
      cha: 6
    },
    skills: {
      perception: 2
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["tree-club", "trash-lob"], times: 2 }],
        text: "Two attacks, using Tree Club or Trash Lob in any combination.",
      },
      {
        id: "tree-club",
        name: "Tree Club",
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
                damage: "3d8+5",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A reach attack that knocks a Large or smaller target Prone."
      },
      {
        id: "trash-lob",
        name: "Trash Lob",
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
            bonus: 8,
            onHit: [
              {
                damage: "2d10+5",
                type: "bludgeoning"
              },
              {
                condition: "poisoned",
                ends: {
                  on: "turnEnd",
                  of: "target"
                }
              }
            ]
          }
        ],
        text: "A thrown attack that also Poisons the target until the end of its next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge, brutish giant who clubs foes or hurls refuse at them."
  },
  {
    id: "hippogriff",
    name: "Hippogriff",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 11,
    hp: 26,
    speed: {
      walk: 40,
      fly: 60
    },
    abilities: {
      str: 17,
      dex: 13,
      con: 13,
      int: 2,
      wis: 12,
      cha: 8
    },
    skills: {
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "flyby",
        name: "Flyby",
        modifiers: [],
        text: "Does not provoke an Opportunity Attack when it flies out of an enemy's reach."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Two Rend attacks.",
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
            bonus: 5,
            onHit: [
              {
                damage: "1d8+3",
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
    text: "A winged beast, half eagle and half horse."
  },
  {
    id: "hippopotamus",
    name: "Hippopotamus",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 14,
    hp: 82,
    speed: {
      walk: 30,
      swim: 30
    },
    abilities: {
      str: 21,
      dex: 7,
      con: 15,
      int: 2,
      wis: 12,
      cha: 4
    },
    skills: {
      perception: 3
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "hold-breath",
        name: "Hold Breath",
        modifiers: [],
        text: "Can hold its breath for 10 minutes."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 2 }],
        text: "Two Bite attacks.",
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
                damage: "2d10+5",
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
    text: "A bad-tempered river giant."
  },
  {
    id: "hobgoblin-captain",
    name: "Hobgoblin Captain",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 17,
    hp: 58,
    speed: {
      walk: 30
    },
    abilities: {
      str: 15,
      dex: 14,
      con: 14,
      int: 12,
      wis: 10,
      cha: 13
    },
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "aura-of-authority",
        name: "Aura of Authority",
        modifiers: [],
        text: "While in a 10 foot emanation around the captain, it and its allies have Advantage on attack rolls and saving throws, unless the captain is Incapacitated. The DM applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["greatsword", "longbow"], times: 2 }],
        text: "Two attacks, using Greatsword or Longbow in any combination.",
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
            bonus: 4,
            onHit: [
              {
                damage: "2d6+2",
                type: "slashing"
              },
              {
                damage: "1d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack with extra poison damage."
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
              },
              {
                damage: "2d4",
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
    text: "A goblinoid officer whose presence steadies the ranks."
  },
  {
    id: "hobgoblin-warrior",
    name: "Hobgoblin Warrior",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fey",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 18,
    hp: 11,
    speed: {
      walk: 30
    },
    abilities: {
      str: 13,
      dex: 12,
      con: 12,
      int: 10,
      wis: 10,
      cha: 9
    },
    senses: { darkvision: 60 },
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
        id: "longsword",
        name: "Longsword",
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
                damage: "2d10+1",
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
            bonus: 3,
            onHit: [
              {
                damage: "1d8+1",
                type: "piercing"
              },
              {
                damage: "3d4",
                type: "poison"
              }
            ]
          }
        ],
        text: "A ranged attack with extra poison damage."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A disciplined goblinoid soldier."
  },
  {
    id: "homunculus",
    name: "Homunculus",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "construct",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 13,
    hp: 4,
    speed: {
      walk: 20,
      fly: 40
    },
    abilities: {
      str: 4,
      dex: 15,
      con: 14,
      int: 10,
      wis: 10,
      cha: 7
    },
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
        id: "telepathic-bond",
        name: "Telepathic Bond",
        modifiers: [],
        text: "Shares thoughts with its master while on the same plane."
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
                save: "con",
                dc: 12,
                onFail: [
                  {
                    condition: "poisoned",
                    ends: {
                      on: "turnEnd",
                      of: "source"
                    }
                  },
                  {
                    manual: "If the save fails by 5 or more the target is Poisoned for 1 minute and has the Unconscious condition while Poisoned; that ends early if it takes damage."
                  }
                ]
              }
            ]
          }
        ],
        text: "A bite that can Poison the target (Constitution save, DC 12)."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny winged construct that serves a spellcaster."
  },
  {
    id: "horned-devil",
    name: "Horned Devil",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 11,
    xp: 7200,
    pb: 4,
    ac: 18,
    hp: 199,
    speed: {
      walk: 30,
      fly: 60
    },
    abilities: {
      str: 22,
      dex: 17,
      con: 21,
      int: 12,
      wis: 16,
      cha: 18
    },
    senses: { darkvision: 150 },
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
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If it dies outside the Nine Hells it revives with all its Hit Points somewhere in the Nine Hells. The DM applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The devil has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["searing-fork", "hurl-flame"], times: 3 }], [{ action: ["searing-fork", "hurl-flame"], times: 2 }, { action: "infernal-tail", times: 1 }]] },
        text: "Three attacks, using Searing Fork or Hurl Flame in any combination. It can replace one attack with Infernal Tail.",
      },
      {
        id: "searing-fork",
        name: "Searing Fork",
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
                type: "piercing"
              },
              {
                damage: "2d8",
                type: "fire"
              }
            ]
          }
        ],
        text: "A reach attack with extra fire damage."
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
            bonus: 8,
            onHit: [
              {
                damage: "5d8+4",
                type: "fire"
              },
              {
                manual: "A flammable object that is not worn or carried starts burning."
              }
            ]
          }
        ],
        text: "A ranged fire attack."
      },
      {
        id: "infernal-tail",
        name: "Infernal Tail",
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
            save: "dex",
            dc: 17,
            onFail: [
              {
                damage: "1d8+6",
                type: "necrotic"
              },
              {
                manual: "The target gets an infernal wound if it has none: it loses 3d6 Hit Points at the start of each of its turns. The wound closes after 1 minute, when a spell restores its Hit Points, or when someone succeeds on a DC 17 Wisdom (Medicine) check to stanch it."
              }
            ]
          }
        ],
        text: "A tail lash at a creature within 10 feet that leaves an infernal wound."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A winged devil who whips foes with a barbed tail and hurls flame."
  },
  {
    id: "hunter-shark",
    name: "Hunter Shark",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 45,
    speed: {
      walk: 5,
      swim: 40
    },
    abilities: {
      str: 18,
      dex: 14,
      con: 15,
      int: 1,
      wis: 10,
      cha: 4
    },
    senses: { blindsight: 60 },
    skills: {
      perception: 2
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
        text: "A bite with Advantage if the target is missing any Hit Points. The DM applies the Advantage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A big predatory shark that smells blood."
  },
  {
    id: "hydra",
    name: "Hydra",
    source: "SRD 5.2.1",
    size: "huge",
    type: "monstrosity",
    cr: 8,
    xp: 3900,
    pb: 3,
    ac: 15,
    hp: 184,
    speed: {
      walk: 40,
      swim: 40
    },
    abilities: {
      str: 20,
      dex: 12,
      con: 20,
      int: 2,
      wis: 10,
      cha: 7
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    conditionImmune: ["blinded", "charmed", "deafened", "frightened", "stunned", "unconscious"],
    traits: [
      {
        id: "hold-breath",
        name: "Hold Breath",
        modifiers: [],
        text: "Can hold its breath for 1 hour."
      },
      {
        id: "multiple-heads",
        name: "Multiple Heads",
        modifiers: [],
        text: "Has five heads. Taking 25 or more damage in one turn kills a head; it dies with its last head. At the end of its turn it grows two heads for each head lost since its last turn (unless it took Fire damage) and regains 20 Hit Points. The DM tracks the heads."
      },
      {
        id: "reactive-heads",
        name: "Reactive Heads",
        modifiers: [],
        text: "For each head beyond one it has an extra Reaction, usable only for Opportunity Attacks."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Blinded, Charmed, Deafened, Frightened, Stunned, Unconscious condition(s). The engine applies this."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "One Bite attack for each head it has."
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
            bonus: 8,
            onHit: [
              {
                damage: "1d10+5",
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
    text: "A many-headed serpent that regrows what it loses."
  },
  {
    id: "hyena",
    name: "Hyena",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 11,
    hp: 5,
    speed: {
      walk: 50
    },
    abilities: {
      str: 11,
      dex: 13,
      con: 12,
      int: 2,
      wis: 12,
      cha: 5
    },
    senses: { darkvision: 60 },
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
            bonus: 2,
            onHit: [
              {
                damage: "1d6",
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
    text: "A pack-hunting scavenger."
  },
  {
    id: "ice-devil",
    name: "Ice Devil",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 14,
    xp: 11500,
    pb: 5,
    ac: 18,
    hp: 228,
    speed: {
      walk: 40
    },
    abilities: {
      str: 21,
      dex: 14,
      con: 18,
      int: 18,
      wis: 15,
      cha: 18
    },
    senses: { blindsight: 120 },
    skills: {
      insight: 7,
      perception: 7,
      persuasion: 9
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold",
      "fire",
      "poison"
    ],
    conditionImmune: ["poisoned"],
    traits: [
      {
        id: "diabolical-restoration",
        name: "Diabolical Restoration",
        modifiers: [],
        text: "If it dies outside the Nine Hells it revives with all its Hit Points somewhere in the Nine Hells. The DM applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The devil has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: ["ice-spear", "ice-spear-ranged"], times: 3 }], [{ action: ["ice-spear", "ice-spear-ranged"], times: 2 }, { action: "tail", times: 1 }]] },
        text: "Three Ice Spear attacks. It can replace one attack with Tail.",
      },
      {
        id: "ice-spear",
        name: "Ice Spear",
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
                damage: "2d8+5",
                type: "piercing"
              },
              {
                damage: "3d6",
                type: "cold"
              },
              {
                manual: "Until the end of its next turn the target cannot take Bonus Actions or Reactions, its Speed drops by 10 feet, and it can take a move or an action, not both."
              }
            ]
          }
        ],
        text: "A melee spear thrust that slows the target."
      },
      {
        id: "ice-spear-ranged",
        name: "Ice Spear (ranged)",
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
            bonus: 10,
            onHit: [
              {
                damage: "2d8+5",
                type: "piercing"
              },
              {
                damage: "3d6",
                type: "cold"
              },
              {
                manual: "Until the end of its next turn the target cannot take Bonus Actions or Reactions, its Speed drops by 10 feet, and it can take a move or an action, not both. The spear returns to the devil's hand."
              }
            ]
          }
        ],
        text: "The same spear thrown."
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
            bonus: 10,
            onHit: [
              {
                damage: "3d6+5",
                type: "bludgeoning"
              },
              {
                damage: "4d8",
                type: "cold"
              }
            ]
          }
        ],
        text: "A reach attack with extra cold damage."
      },
      {
        id: "ice-wall",
        name: "Ice Wall",
        recharge: [6, 6],
        target: {
          self: true
        },
        effects: [
          {
            manual: "Recharge 6: the devil casts Wall of Ice (level 8 version), no components, Intelligence, spell save DC 17."
          }
        ],
        text: "Recharge 6. Casts Wall of Ice. The DM runs the spell."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A frost-wreathed devil that spears foes with ice."
  },
  {
    id: "ice-mephit",
    name: "Ice Mephit",
    source: "SRD 5.2.1",
    size: "small",
    type: "elemental",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 21,
    speed: {
      walk: 30,
      fly: 30
    },
    abilities: {
      str: 7,
      dex: 13,
      con: 10,
      int: 9,
      wis: 11,
      cha: 12
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 2,
      stealth: 3
    },
    resist: [],
    vulnerable: [
      "fire"
    ],
    immune: [
      "cold",
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
        id: "death-burst",
        name: "Death Burst",
        modifiers: [],
        text: "When it dies it explodes: Constitution save (DC 10) for each creature in a 5 foot emanation, 2d4 Cold damage on a failure and half on a success. The DM runs this."
      },
      {
        id: "fog-cloud",
        name: "Fog Cloud",
        modifiers: [],
        text: "1 a day it casts Fog Cloud, no components, Charisma. The DM casts it."
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
            bonus: 3,
            onHit: [
              {
                damage: "1d4+1",
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
        id: "frost-breath",
        name: "Frost Breath",
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
                damage: "3d4",
                type: "cold"
              }
            ]
          }
        ],
        text: "Recharge 6. A 15 foot cone."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small elemental imp of ice."
  },
  {
    id: "imp",
    name: "Imp",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "fiend",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 13,
    hp: 21,
    speed: {
      walk: 20,
      fly: 40
    },
    abilities: {
      str: 6,
      dex: 17,
      con: 13,
      int: 11,
      wis: 12,
      cha: 14
    },
    senses: { darkvision: 120 },
    skills: {
      deception: 4,
      insight: 3,
      stealth: 5
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
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The imp has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Becomes a rat (Speed 20), a raven (Speed 20, Fly 60) or a spider (Speed 20, Climb 20), or returns to its true form. The DM applies this."
      }
    ],
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
            bonus: 5,
            onHit: [
              {
                damage: "1d6+3",
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
        id: "invisibility",
        name: "Invisibility",
        target: {
          self: true
        },
        effects: [
          {
            manual: "The imp casts Invisibility on itself, no components, using Charisma."
          }
        ],
        text: "Casts Invisibility on itself. The DM applies it."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A tiny devil that serves as a spy and familiar."
  },
  {
    id: "incubus",
    name: "Incubus",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 15,
    hp: 66,
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
        id: "succubus-form",
        name: "Succubus Form",
        modifiers: [],
        text: "After a Long Rest it can take the Succubus stat block instead. The DM applies this."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Charisma, spell save DC 15, no Material components. At will: Disguise Self, Etherealness. 1 a day each: Dream, Hypnotic Pattern. The DM casts these."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "restless-touch", times: 2 }],
        text: "Two Restless Touch attacks.",
      },
      {
        id: "restless-touch",
        name: "Restless Touch",
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
                damage: "3d6+5",
                type: "psychic"
              },
              {
                manual: "The target is cursed for 24 hours or until the incubus dies; while cursed it gains no benefit from finishing Short Rests."
              }
            ]
          }
        ],
        text: "A touch that deals psychic damage and curses the target."
      },
      {
        id: "nightmare",
        name: "Nightmare",
        time: "bonus",
        recharge: [6, 6],
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
            save: "wis",
            dc: 15,
            onFail: [
              {
                manual: "If the target has 20 Hit Points or fewer it has the Unconscious condition for 1 hour, until it takes damage, or until a creature within 5 feet wakes it with an action. Otherwise it takes 18 (4d8) Psychic damage."
              }
            ]
          }
        ],
        text: "Bonus Action, Recharge 6. Wisdom save against sleep or psychic damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A seductive fiend that torments with nightmares."
  },
  {
    id: "invisible-stalker",
    name: "Invisible Stalker",
    source: "SRD 5.2.1",
    size: "large",
    type: "elemental",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 14,
    hp: 97,
    speed: {
      walk: 50,
      fly: 50
    },
    abilities: {
      str: 16,
      dex: 19,
      con: 14,
      int: 10,
      wis: 15,
      cha: 11
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 8,
      stealth: 10
    },
    hover: true,
    resist: [
      "bludgeoning",
      "piercing",
      "slashing"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained", "unconscious"],
    traits: [
      {
        id: "air-form",
        name: "Air Form",
        modifiers: [],
        text: "Can enter an enemy's space and stop there, and squeeze through a space 1 inch wide without extra movement cost."
      },
      {
        id: "invisibility",
        name: "Invisibility",
        modifiers: [],
        text: "Always has the Invisible condition."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious condition(s). The engine applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "wind-swipe", times: 3 }], [{ action: "wind-swipe", times: 2 }, { action: "vortex", times: 1 }]] },
        text: "Three Wind Swipe attacks. It can replace one attack with Vortex.",
      },
      {
        id: "wind-swipe",
        name: "Wind Swipe",
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
                type: "force"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "vortex",
        name: "Vortex",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "con",
            dc: 14,
            onFail: [
              {
                damage: "1d8+3",
                type: "thunder"
              },
              {
                condition: "grappled"
              },
              {
                manual: "Targets one Large or smaller creature in the stalker's space. Escape DC 13. While Grappled the target cannot cast spells with a Verbal component and takes 2d6 Thunder damage at the start of each of the stalker's turns."
              }
            ]
          }
        ],
        text: "A whirlwind that grapples a Large or smaller creature."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A hovering air spirit that hunts unseen."
  },
  {
    id: "iron-golem",
    name: "Iron Golem",
    source: "SRD 5.2.1",
    size: "large",
    type: "construct",
    cr: 16,
    xp: 15000,
    pb: 5,
    ac: 20,
    hp: 252,
    speed: {
      walk: 30
    },
    abilities: {
      str: 24,
      dex: 9,
      con: 20,
      int: 3,
      wis: 11,
      cha: 1
    },
    senses: { darkvision: 120 },
    resist: [],
    vulnerable: [],
    immune: [
      "fire",
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
        id: "fire-absorption",
        name: "Fire Absorption",
        modifiers: [],
        text: "Whenever it takes Fire damage it regains Hit Points equal to the damage instead. The DM applies this."
      },
      {
        id: "immutable-form",
        name: "Immutable Form",
        modifiers: [],
        text: "Cannot shape-shift."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The golem has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["bladed-arm", "fiery-bolt"], times: 2 }],
        text: "Two attacks, using Bladed Arm or Fiery Bolt in any combination.",
      },
      {
        id: "bladed-arm",
        name: "Bladed Arm",
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
                damage: "3d8+7",
                type: "slashing"
              },
              {
                damage: "3d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A reach attack with extra fire damage."
      },
      {
        id: "fiery-bolt",
        name: "Fiery Bolt",
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
            bonus: 10,
            onHit: [
              {
                damage: "8d8",
                type: "fire"
              }
            ]
          }
        ],
        text: "A ranged fire attack."
      },
      {
        id: "poison-breath",
        name: "Poison Breath",
        recharge: [6, 6],
        target: {
          area: {
            shape: "cone",
            size: 60
          }
        },
        effects: [
          {
            save: "con",
            dc: 18,
            half: true,
            onFail: [
              {
                damage: "10d10",
                type: "poison"
              }
            ]
          }
        ],
        text: "Recharge 6. A 60 foot cone."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A massive iron construct that cuts, burns and exhales poison gas."
  },
  {
    id: "jackal",
    name: "Jackal",
    source: "SRD 5.2.1",
    size: "small",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 12,
    hp: 3,
    speed: {
      walk: 40
    },
    abilities: {
      str: 8,
      dex: 15,
      con: 11,
      int: 3,
      wis: 12,
      cha: 6
    },
    senses: { darkvision: 90 },
    skills: {
      perception: 5,
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
    checked: true,
    text: "A small desert dog."
  },
  {
    id: "killer-whale",
    name: "Killer Whale",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 12,
    hp: 90,
    speed: {
      walk: 5,
      swim: 60
    },
    abilities: {
      str: 19,
      dex: 14,
      con: 13,
      int: 3,
      wis: 12,
      cha: 7
    },
    senses: { blindsight: 120 },
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
        text: "Can hold its breath for 30 minutes."
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
                damage: "5d6+4",
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
    text: "A huge, intelligent ocean hunter."
  },
  {
    id: "knight",
    name: "Knight",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 18,
    hp: 52,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 11,
      con: 14,
      int: 11,
      wis: 11,
      cha: 15
    },
    resist: [],
    vulnerable: [],
    immune: [],
    conditionImmune: ["frightened"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Frightened condition(s). The engine applies this."
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
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["greatsword", "heavy-crossbow"], times: 2 }],
        text: "Two attacks, using Greatsword or Heavy Crossbow in any combination.",
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
              },
              {
                damage: "1d8",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A melee attack with extra radiant damage."
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
            bonus: 2,
            onHit: [
              {
                damage: "2d10",
                type: "piercing"
              },
              {
                damage: "1d8",
                type: "radiant"
              }
            ]
          }
        ],
        text: "A ranged attack with extra radiant damage."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An armoured warrior sworn to a lord or a cause."
  },
  {
    id: "kobold-warrior",
    name: "Kobold Warrior",
    source: "SRD 5.2.1",
    size: "small",
    type: "dragon",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 14,
    hp: 7,
    speed: {
      walk: 30
    },
    abilities: {
      str: 7,
      dex: 15,
      con: 9,
      int: 8,
      wis: 7,
      cha: 8
    },
    senses: { darkvision: 60 },
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
      },
      {
        id: "sunlight-sensitivity",
        name: "Sunlight Sensitivity",
        modifiers: [],
        text: "In sunlight it has Disadvantage on ability checks and attack rolls. The DM applies this."
      }
    ],
    actions: [
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
            bonus: 4,
            onHit: [
              {
                damage: "1d4+2",
                type: "piercing"
              }
            ]
          }
        ],
        text: "The same dagger thrown."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small, cowardly dragon-kin that fights in numbers."
  },
  {
    id: "kraken",
    name: "Kraken",
    source: "SRD 5.2.1",
    size: "gargantuan",
    type: "monstrosity",
    cr: 23,
    xp: 50000,
    pb: 7,
    ac: 18,
    hp: 481,
    speed: {
      walk: 30,
      swim: 120
    },
    abilities: {
      str: 30,
      dex: 11,
      con: 26,
      int: 22,
      wis: 18,
      cha: 20
    },
    senses: { truesight: 120 },
    skills: {
      history: 13,
      perception: 11
    },
    resist: [],
    vulnerable: [],
    immune: [
      "cold",
      "lightning"
    ],
    conditionImmune: ["frightened", "grappled", "paralyzed", "restrained"],
    traits: [
      {
        id: "amphibious",
        name: "Amphibious",
        modifiers: [],
        text: "Breathes air and water."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 4 times a day, or 5 in its lair. The DM tracks the uses."
      },
      {
        id: "siege-monster",
        name: "Siege Monster",
        modifiers: [],
        text: "Deals double damage to objects and structures."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Frightened, Grappled, Paralyzed, Restrained condition(s). The engine applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions (3 uses, 4 in its lair): Storm Bolt (uses Lightning Strike) and Toxic Ink (Constitution save, DC 23, each creature in a 15 foot emanation while it is underwater is Blinded and Poisoned until the end of its next turn, then the kraken moves up to its Speed). The engine has no field for them; the DM runs them from the SRD."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "tentacle", times: 2 }, { action: ["fling", "lightning-strike", "swallow"], times: 1 }],
        text: "Two Tentacle attacks, and it uses Fling, Lightning Strike or Swallow.",
      },
      {
        id: "tentacle",
        name: "Tentacle",
        target: {
          creature: {
            reach: 30
          }
        },
        effects: [
          {
            attack: "melee",
            kind: "weapon",
            bonus: 17,
            onHit: [
              {
                damage: "4d6+10",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Escape DC 20; the target is Grappled by one of ten tentacles and Restrained until the grapple ends."
              }
            ]
          }
        ],
        text: "A very long reach attack that grapples and restrains."
      },
      {
        id: "fling",
        name: "Fling",
        target: {
          creature: {
            reach: 30
          }
        },
        effects: [
          {
            save: "dex",
            dc: 25,
            half: true,
            onFail: [
              {
                damage: "4d8",
                type: "bludgeoning"
              },
              {
                condition: "prone"
              },
              {
                manual: "Throws a Large or smaller creature it has Grappled to a space it can see within 60 feet that is not in the air; the thrown creature and each creature in the destination space make the save."
              }
            ]
          }
        ],
        text: "Throws a grappled creature."
      },
      {
        id: "lightning-strike",
        name: "Lightning Strike",
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
            save: "dex",
            dc: 23,
            half: true,
            onFail: [
              {
                damage: "6d10",
                type: "lightning"
              }
            ]
          }
        ],
        text: "A bolt at one creature within 120 feet."
      },
      {
        id: "swallow",
        name: "Swallow",
        target: {
          creature: {
            reach: 30
          }
        },
        effects: [
          {
            save: "dex",
            dc: 25,
            onFail: [
              {
                damage: "3d8+10",
                type: "piercing"
              },
              {
                manual: "A Large or smaller target is swallowed and no longer Grappled: Restrained, Total Cover against outside effects, and it takes 7d6 Acid damage at the start of each of its turns. Up to four creatures at a time. If the kraken takes 50 or more damage from inside in one turn it must make a DC 25 Constitution save or regurgitate everyone, Prone, within 10 feet."
              }
            ]
          }
        ],
        text: "Swallows a creature it has Grappled."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A colossal tentacled titan of the deep."
  },
  {
    id: "lamia",
    name: "Lamia",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 4,
    xp: 1100,
    pb: 2,
    ac: 13,
    hp: 97,
    speed: {
      walk: 40
    },
    abilities: {
      str: 16,
      dex: 13,
      con: 15,
      int: 14,
      wis: 15,
      cha: 16
    },
    senses: { darkvision: 60 },
    skills: {
      deception: 7,
      insight: 4,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Charisma, spell save DC 13, no Material components. At will: Disguise Self (can appear as a Large or Medium biped), Minor Illusion. 1 a day each: Geas, Major Image, Scrying. The DM casts these."
      },
      {
        id: "leap",
        name: "Leap",
        modifiers: [],
        text: "Bonus Action: jumps up to 30 feet by spending 10 feet of movement. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "claw", times: 2 }], [{ action: "claw", times: 1 }, { action: "corrupting-touch", times: 1 }]] },
        text: "Two Claw attacks. It can replace one attack with Corrupting Touch.",
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
                damage: "1d8+3",
                type: "slashing"
              },
              {
                damage: "2d6",
                type: "psychic"
              }
            ]
          }
        ],
        text: "A melee attack with extra psychic damage."
      },
      {
        id: "corrupting-touch",
        name: "Corrupting Touch",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "wis",
            dc: 13,
            onFail: [
              {
                damage: "3d8",
                type: "psychic"
              },
              {
                condition: "charmed"
              },
              {
                condition: "poisoned"
              },
              {
                manual: "The target is cursed for 1 hour; the Charmed and Poisoned conditions last until the curse ends."
              }
            ]
          }
        ],
        text: "A touch that curses a creature the lamia can see within 5 feet."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A serpent-bodied fiend that charms and curses."
  },
  {
    id: "lemure",
    name: "Lemure",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 9,
    hp: 9,
    speed: {
      walk: 20
    },
    abilities: {
      str: 10,
      dex: 5,
      con: 11,
      int: 1,
      wis: 11,
      cha: 3
    },
    senses: { darkvision: 120 },
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [
      "fire",
      "poison"
    ],
    conditionImmune: ["charmed", "frightened", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Frightened, Poisoned condition(s). The engine applies this."
      },
      {
        id: "hellish-restoration",
        name: "Hellish Restoration",
        modifiers: [],
        text: "If it dies in the Nine Hells it revives with all its Hit Points after 1d10 days; see the SRD for what prevents this. The DM applies it."
      }
    ],
    actions: [
      {
        id: "vile-slime",
        name: "Vile Slime",
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
                type: "poison"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "The lowest sort of devil, a shapeless mass of tormented soul."
  },
  {
    id: "lich",
    name: "Lich",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 21,
    xp: 33000,
    pb: 7,
    ac: 20,
    hp: 315,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 16,
      con: 16,
      int: 21,
      wis: 14,
      cha: 16
    },
    senses: { truesight: 120 },
    skills: {
      arcana: 19,
      history: 12,
      insight: 9,
      perception: 9
    },
    resist: [
      "cold",
      "lightning"
    ],
    vulnerable: [],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "paralyzed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Poisoned condition(s). The engine applies this."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 4 times a day, or 5 in its lair. The DM tracks the uses."
      },
      {
        id: "spirit-jar",
        name: "Spirit Jar",
        modifiers: [],
        text: "If destroyed it reforms in 1d10 days if it has a spirit jar, with all its Hit Points, in its lair. The DM applies this."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Intelligence, spell save DC 20. At will: Detect Magic, Detect Thoughts, Dispel Magic, Fireball (level 5), Invisibility, Lightning Bolt (level 5), Mage Hand, Prestidigitation. 2 a day each: Animate Dead, Dimension Door, Plane Shift. 1 a day each: Chain Lightning, Finger of Death, Power Word Kill, Scrying. The DM casts these."
      },
      {
        id: "protective-magic",
        name: "Protective Magic",
        modifiers: [],
        text: "Reaction: casts Counterspell or Shield in response to the trigger. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions (3 uses, 4 in its lair): Deathly Teleport, Disrupt Life (Constitution save DC 20, 9d6 Necrotic, 20 foot emanation, non-Undead) and Frightening Gaze (casts Fear). The engine has no field for them; the DM runs them from the SRD."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["eldritch-burst", "eldritch-burst-ranged", "paralyzing-touch"], times: 3 }],
        text: "Three attacks, using Eldritch Burst or Paralyzing Touch in any combination.",
      },
      {
        id: "eldritch-burst",
        name: "Eldritch Burst",
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
                damage: "4d12+5",
                type: "force"
              }
            ]
          }
        ],
        text: "A melee force attack."
      },
      {
        id: "eldritch-burst-ranged",
        name: "Eldritch Burst (ranged)",
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
            bonus: 12,
            onHit: [
              {
                damage: "4d12+5",
                type: "force"
              }
            ]
          }
        ],
        text: "The same burst at range."
      },
      {
        id: "paralyzing-touch",
        name: "Paralyzing Touch",
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
                damage: "3d6+5",
                type: "cold"
              },
              {
                condition: "paralyzed",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A touch that Paralyzes the target until the start of the lich's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An undead archmage who has bound its soul to a vessel."
  },
  {
    id: "lion",
    name: "Lion",
    source: "SRD 5.2.1",
    size: "large",
    type: "beast",
    cr: 1,
    xp: 200,
    pb: 2,
    ac: 12,
    hp: 22,
    speed: {
      walk: 50
    },
    abilities: {
      str: 17,
      dex: 15,
      con: 11,
      int: 3,
      wis: 12,
      cha: 8
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 3,
      stealth: 4
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
      },
      {
        id: "running-leap",
        name: "Running Leap",
        modifiers: [],
        text: "With a 10 foot running start it can Long Jump up to 25 feet."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "rend", times: 2 }], [{ action: "rend", times: 1 }, { action: "roar", times: 1 }]] },
        text: "Two Rend attacks. It can replace one attack with Roar.",
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
            bonus: 5,
            onHit: [
              {
                damage: "1d8+3",
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
        target: {
          creature: {
            range: [
              15,
              15
            ]
          }
        },
        effects: [
          {
            save: "wis",
            dc: 11,
            onFail: [
              {
                condition: "frightened",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A roar at one creature within 15 feet that Frightens it until the start of the lion's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A pride hunter of the savanna."
  },
  {
    id: "lizard",
    name: "Lizard",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 10,
    hp: 2,
    speed: {
      walk: 20,
      climb: 20
    },
    abilities: {
      str: 2,
      dex: 11,
      con: 10,
      int: 1,
      wis: 8,
      cha: 3
    },
    senses: { darkvision: 30 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Can climb difficult surfaces, including ceilings, without a check."
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
    text: "A common small lizard."
  },
  {
    id: "mage",
    name: "Mage",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 15,
    hp: 81,
    speed: {
      walk: 30
    },
    abilities: {
      str: 9,
      dex: 14,
      con: 11,
      int: 17,
      wis: 12,
      cha: 11
    },
    skills: {
      arcana: 6,
      history: 6,
      perception: 4
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Intelligence, spell save DC 14, no Material components. At will: Detect Magic, Light, Mage Armor (included in AC), Mage Hand, Prestidigitation. 2 a day each: Fireball (level 4), Invisibility. 1 a day each: Cone of Cold, Fly. The DM casts these."
      },
      {
        id: "misty-step",
        name: "Misty Step",
        modifiers: [],
        text: "Bonus Action, 3 a day: casts Misty Step. The DM applies this."
      },
      {
        id: "protective-magic",
        name: "Protective Magic",
        modifiers: [],
        text: "Reaction, 3 a day: casts Counterspell or Shield in response to the trigger. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["arcane-burst", "arcane-burst-ranged"], times: 3 }],
        text: "Three Arcane Burst attacks.",
      },
      {
        id: "arcane-burst",
        name: "Arcane Burst",
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
                damage: "3d8+3",
                type: "force"
              }
            ]
          }
        ],
        text: "A melee force attack."
      },
      {
        id: "arcane-burst-ranged",
        name: "Arcane Burst (ranged)",
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
            bonus: 6,
            onHit: [
              {
                damage: "3d8+3",
                type: "force"
              }
            ]
          }
        ],
        text: "The same burst at range."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A spellcaster who blasts foes with force and a few well-chosen spells."
  },
  {
    id: "magma-mephit",
    name: "Magma Mephit",
    source: "SRD 5.2.1",
    size: "small",
    type: "elemental",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 11,
    hp: 18,
    speed: {
      walk: 30,
      fly: 30
    },
    abilities: {
      str: 8,
      dex: 12,
      con: 12,
      int: 7,
      wis: 10,
      cha: 10
    },
    senses: { darkvision: 60 },
    skills: {
      stealth: 3
    },
    resist: [],
    vulnerable: [
      "cold"
    ],
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
        id: "death-burst",
        name: "Death Burst",
        modifiers: [],
        text: "When it dies it explodes: Dexterity save (DC 11) for each creature in a 5 foot emanation, 2d6 Fire damage on a failure and half on a success. The DM runs this."
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
            bonus: 3,
            onHit: [
              {
                damage: "1d4+1",
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
        recharge: [6, 6],
        target: {
          area: {
            shape: "cone",
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
                damage: "2d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "Recharge 6. A 15 foot cone."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small elemental imp of molten rock."
  },
  {
    id: "magmin",
    name: "Magmin",
    source: "SRD 5.2.1",
    size: "small",
    type: "elemental",
    cr: 0.5,
    xp: 100,
    pb: 2,
    ac: 14,
    hp: 13,
    speed: {
      walk: 30
    },
    abilities: {
      str: 7,
      dex: 15,
      con: 12,
      int: 8,
      wis: 11,
      cha: 10
    },
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [
      "fire"
    ],
    traits: [
      {
        id: "death-burst",
        name: "Death Burst",
        modifiers: [],
        text: "When it dies it explodes: Dexterity save (DC 11) for each creature in a 10 foot emanation, 2d6 Fire damage on a failure and half on a success. The DM runs this."
      },
      {
        id: "ignited-illumination",
        name: "Ignited Illumination",
        modifiers: [],
        text: "Bonus Action: sets itself ablaze (Bright Light 10 feet, Dim Light another 10) or puts the flames out. The DM applies this."
      }
    ],
    actions: [
      {
        id: "touch",
        name: "Touch",
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
                type: "fire"
              },
              {
                manual: "A creature, or a flammable object that is not worn or carried, starts burning."
              }
            ]
          }
        ],
        text: "A fiery touch that ignites the target."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A small lump of living magma."
  },
  {
    id: "mammoth",
    name: "Mammoth",
    source: "SRD 5.2.1",
    size: "huge",
    type: "beast",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 13,
    hp: 126,
    speed: {
      walk: 50
    },
    abilities: {
      str: 24,
      dex: 9,
      con: 21,
      int: 3,
      wis: 11,
      cha: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "gore", times: 2 }],
        text: "Two Gore attacks.",
      },
      {
        id: "gore",
        name: "Gore",
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
                damage: "2d10+7",
                type: "piercing"
              },
              {
                manual: "If the target is Huge or smaller and the mammoth moved 20 or more feet straight toward it just before the hit, the target has the Prone condition."
              }
            ]
          }
        ],
        text: "A tusk attack that can knock the target Prone after a charge."
      },
      {
        id: "trample",
        name: "Trample",
        time: "bonus",
        target: {
          creature: {
            reach: 5
          }
        },
        effects: [
          {
            save: "dex",
            dc: 18,
            half: true,
            onFail: [
              {
                damage: "4d10+7",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "Bonus Action. Targets one creature within 5 feet that has the Prone condition."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A huge, shaggy elephant of the cold lands."
  },
  {
    id: "manticore",
    name: "Manticore",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 14,
    hp: 68,
    speed: {
      walk: 30,
      fly: 50
    },
    abilities: {
      str: 17,
      dex: 16,
      con: 17,
      int: 7,
      wis: 12,
      cha: 8
    },
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["rend", "tail-spike"], times: 3 }],
        text: "Three attacks, using Rend or Tail Spike in any combination.",
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
            bonus: 5,
            onHit: [
              {
                damage: "1d8+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "tail-spike",
        name: "Tail Spike",
        target: {
          creature: {
            range: [
              100,
              200
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
                damage: "1d8+3",
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
    text: "A winged lion with a spiked tail and a man's face."
  },
  {
    id: "marilith",
    name: "Marilith",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 16,
    xp: 15000,
    pb: 5,
    ac: 16,
    hp: 220,
    speed: {
      walk: 40,
      climb: 40
    },
    abilities: {
      str: 18,
      dex: 20,
      con: 20,
      int: 18,
      wis: 16,
      cha: 20
    },
    senses: { truesight: 120 },
    skills: {
      perception: 8
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
        id: "demonic-restoration",
        name: "Demonic Restoration",
        modifiers: [],
        text: "If it dies outside the Abyss it revives with all its Hit Points somewhere in the Abyss. The DM applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The marilith has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Poisoned condition(s). The engine applies this."
      },
      {
        id: "reactive",
        name: "Reactive",
        modifiers: [],
        text: "Can take one Reaction on every turn of combat. The DM applies this."
      },
      {
        id: "teleport",
        name: "Teleport",
        modifiers: [],
        text: "Bonus Action, Recharge 5-6 (not tracked): teleports up to 120 feet to an unoccupied space it can see. The DM applies this."
      },
      {
        id: "parry",
        name: "Parry",
        modifiers: [],
        text: "Reaction: when hit by a melee attack while holding a weapon, it adds 5 to its AC against that attack. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "pact-blade", times: 6 }, { action: "constrict", times: 1 }],
        text: "Six Pact Blade attacks and one use of Constrict.",
      },
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
            bonus: 10,
            onHit: [
              {
                damage: "1d10+5",
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
            dc: 17,
            onFail: [
              {
                damage: "2d10+4",
                type: "bludgeoning"
              },
              {
                condition: "grappled"
              },
              {
                condition: "restrained"
              },
              {
                manual: "Targets a Medium or smaller creature. Escape DC 14; the target is Restrained until the grapple ends."
              }
            ]
          }
        ],
        text: "Coils around a Medium or smaller creature within 5 feet."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A six-armed serpentine demon general."
  },
  {
    id: "mastiff",
    name: "Mastiff",
    source: "SRD 5.2.1",
    size: "medium",
    type: "beast",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 12,
    hp: 5,
    speed: {
      walk: 40
    },
    abilities: {
      str: 13,
      dex: 14,
      con: 12,
      int: 3,
      wis: 12,
      cha: 7
    },
    senses: { darkvision: 60 },
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
            bonus: 3,
            onHit: [
              {
                damage: "1d6+1",
                type: "piercing"
              },
              {
                condition: "prone"
              }
            ]
          }
        ],
        text: "A bite that knocks a Medium or smaller target Prone."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A big, loyal guard dog."
  },
  {
    id: "medusa",
    name: "Medusa",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 6,
    xp: 2300,
    pb: 3,
    ac: 15,
    hp: 127,
    speed: {
      walk: 30
    },
    abilities: {
      str: 10,
      dex: 17,
      con: 16,
      int: 12,
      wis: 13,
      cha: 15
    },
    senses: { darkvision: 150 },
    skills: {
      deception: 5,
      perception: 4,
      stealth: 6
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: { or: [[{ action: "claw", times: 2 }, { action: "snake-hair", times: 1 }], [{ action: "poison-ray", times: 3 }]] },
        text: "Two Claw attacks and one Snake Hair attack, or three Poison Ray attacks.",
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
                damage: "2d6+3",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "snake-hair",
        name: "Snake Hair",
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
                damage: "1d4+3",
                type: "piercing"
              },
              {
                damage: "4d6",
                type: "poison"
              }
            ]
          }
        ],
        text: "A bite with extra poison damage."
      },
      {
        id: "poison-ray",
        name: "Poison Ray",
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
                damage: "2d8+2",
                type: "poison"
              }
            ]
          }
        ],
        text: "A ranged attack."
      },
      {
        id: "petrifying-gaze",
        name: "Petrifying Gaze",
        time: "bonus",
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
            dc: 13,
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
                manual: "Second failure: the target is Petrified instead of Restrained. If the medusa sees its reflection in the cone it must make this save too."
              }
            ]
          }
        ],
        text: "Bonus Action, Recharge 5-6. A 30 foot cone that Restrains and then Petrifies."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A snake-haired creature whose gaze turns foes to stone."
  },
  {
    id: "merfolk-skirmisher",
    name: "Merfolk Skirmisher",
    source: "SRD 5.2.1",
    size: "medium",
    type: "elemental",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 11,
    hp: 11,
    speed: {
      walk: 10,
      swim: 40
    },
    abilities: {
      str: 10,
      dex: 13,
      con: 12,
      int: 11,
      wis: 14,
      cha: 12
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
        id: "ocean-spear",
        name: "Ocean Spear",
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
                damage: "1d6",
                type: "piercing"
              },
              {
                damage: "1d4",
                type: "cold"
              },
              {
                manual: "A creature's Speed drops by 10 feet until the end of its next turn."
              }
            ]
          }
        ],
        text: "A spear thrust that slows a creature."
      },
      {
        id: "ocean-spear-thrown",
        name: "Ocean Spear (thrown)",
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
            bonus: 2,
            onHit: [
              {
                damage: "1d6",
                type: "piercing"
              },
              {
                damage: "1d4",
                type: "cold"
              },
              {
                manual: "A creature's Speed drops by 10 feet until the end of its next turn. The spear returns to the merfolk's hand."
              }
            ]
          }
        ],
        text: "The same spear thrown."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A sea-dwelling spear fighter."
  },
  {
    id: "merrow",
    name: "Merrow",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 13,
    hp: 45,
    speed: {
      walk: 10,
      swim: 40
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 15,
      int: 8,
      wis: 10,
      cha: 9
    },
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
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["bite", "claw", "harpoon", "harpoon-thrown"], times: 2 }],
        text: "Two attacks, using Bite, Claw or Harpoon in any combination.",
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
                damage: "1d4+4",
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
        text: "A bite that Poisons the target until the end of the merrow's next turn."
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
                damage: "2d4+4",
                type: "slashing"
              }
            ]
          }
        ],
        text: "A melee attack."
      },
      {
        id: "harpoon",
        name: "Harpoon",
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
                manual: "A Large or smaller target is pulled up to 15 feet straight toward the merrow."
              }
            ]
          }
        ],
        text: "A harpoon thrust that pulls the target closer."
      },
      {
        id: "harpoon-thrown",
        name: "Harpoon (thrown)",
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
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              },
              {
                manual: "A Large or smaller target is pulled up to 15 feet straight toward the merrow."
              }
            ]
          }
        ],
        text: "The same harpoon thrown."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A hulking, sea-dwelling ogre-kin."
  },
  {
    id: "mimic",
    name: "Mimic",
    source: "SRD 5.2.1",
    size: "medium",
    type: "monstrosity",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 58,
    speed: {
      walk: 20
    },
    abilities: {
      str: 17,
      dex: 12,
      con: 15,
      int: 5,
      wis: 13,
      cha: 8
    },
    senses: { darkvision: 60 },
    skills: {
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [
      "acid"
    ],
    conditionImmune: ["prone"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Prone condition(s). The engine applies this."
      },
      {
        id: "adhesive",
        name: "Adhesive",
        modifiers: [],
        text: "In object form it sticks to anything that touches it: a Huge or smaller creature is Grappled (escape DC 13) and has Disadvantage on checks to escape. The DM applies this."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: becomes a Medium or Small object or returns to its true blob form. The DM applies this."
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
              },
              {
                damage: "1d8",
                type: "acid"
              },
              {
                manual: "Against a target Grappled by the mimic the attack has Advantage and the piercing damage is 2d8+3 instead."
              }
            ]
          }
        ],
        text: "A bite with extra acid damage, better against a grappled target."
      },
      {
        id: "pseudopod",
        name: "Pseudopod",
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
              },
              {
                damage: "1d8",
                type: "acid"
              },
              {
                condition: "grappled"
              },
              {
                manual: "Grapples a Large or smaller target (escape DC 13, with Disadvantage on the check)."
              }
            ]
          }
        ],
        text: "A blow that grapples a Large or smaller target."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A shapeshifting ambusher that passes for a chest or door."
  },
  {
    id: "minotaur-of-baphomet",
    name: "Minotaur of Baphomet",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 14,
    hp: 85,
    speed: {
      walk: 40
    },
    abilities: {
      str: 18,
      dex: 11,
      con: 16,
      int: 6,
      wis: 16,
      cha: 9
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 7,
      survival: 7
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "abyssal-glaive",
        name: "Abyssal Glaive",
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
                damage: "1d12+4",
                type: "slashing"
              },
              {
                damage: "3d6",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A reach attack with extra necrotic damage."
      },
      {
        id: "gore",
        name: "Gore",
        recharge: [5, 6],
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
                damage: "4d6+4",
                type: "piercing"
              },
              {
                manual: "If the target is Large or smaller and the minotaur moved 10 or more feet straight toward it just before the hit, the target takes an extra 3d6 Piercing damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "Recharge 5-6. A charging gore."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A demonic bull-headed brute serving the Prince of Beasts."
  },
  {
    id: "minotaur-skeleton",
    name: "Minotaur Skeleton",
    source: "SRD 5.2.1",
    size: "large",
    type: "undead",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 12,
    hp: 45,
    speed: {
      walk: 40
    },
    abilities: {
      str: 18,
      dex: 11,
      con: 15,
      int: 6,
      wis: 8,
      cha: 5
    },
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
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              },
              {
                manual: "If the target is Large or smaller and the skeleton moved 20 or more feet straight toward it just before the hit, the target takes an extra 2d8 Piercing damage and has the Prone condition."
              }
            ]
          }
        ],
        text: "A charging gore."
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
            bonus: 6,
            onHit: [
              {
                damage: "2d10+4",
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
    text: "The animated bones of a minotaur."
  },
  {
    id: "mule",
    name: "Mule",
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
      str: 14,
      dex: 10,
      con: 13,
      int: 2,
      wis: 10,
      cha: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "beast-of-burden",
        name: "Beast of Burden",
        modifiers: [],
        text: "Counts as one size larger for carrying capacity."
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
    tier: "assist",
    checked: true,
    text: "A sturdy pack animal."
  },
  {
    id: "mummy",
    name: "Mummy",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 11,
    hp: 58,
    speed: {
      walk: 20
    },
    abilities: {
      str: 16,
      dex: 8,
      con: 15,
      int: 6,
      wis: 12,
      cha: 12
    },
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [
      "fire"
    ],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "paralyzed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Poisoned condition(s). The engine applies this."
      },
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rotting-fist", times: 2 }, { action: "dreadful-glare", times: 1 }],
        text: "Two Rotting Fist attacks, and it uses Dreadful Glare.",
      },
      {
        id: "rotting-fist",
        name: "Rotting Fist",
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
                damage: "3d6",
                type: "necrotic"
              },
              {
                manual: "A creature hit is cursed: it cannot regain Hit Points, its Hit Point maximum does not return to normal on a Long Rest and drops by 3d6 every 24 hours. A creature reduced to 0 Hit Points by this attack dies and turns to dust."
              }
            ]
          }
        ],
        text: "A blow that curses the target with rot."
      },
      {
        id: "dreadful-glare",
        name: "Dreadful Glare",
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
            save: "wis",
            dc: 11,
            onFail: [
              {
                condition: "frightened",
                ends: {
                  on: "turnEnd",
                  of: "source"
                }
              },
              {
                manual: "On a success the target is immune to this mummy's Dreadful Glare for 24 hours."
              }
            ]
          }
        ],
        text: "A glare at one creature within 60 feet that Frightens it until the end of the mummy's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A preserved corpse that spreads a rotting curse."
  },
  {
    id: "mummy-lord",
    name: "Mummy Lord",
    source: "SRD 5.2.1",
    size: "medium",
    type: "undead",
    cr: 15,
    xp: 13000,
    pb: 5,
    ac: 17,
    hp: 187,
    speed: {
      walk: 30
    },
    abilities: {
      str: 18,
      dex: 10,
      con: 17,
      int: 11,
      wis: 19,
      cha: 16
    },
    senses: { truesight: 60 },
    skills: {
      history: 5,
      perception: 9,
      religion: 5
    },
    resist: [],
    vulnerable: [
      "fire"
    ],
    immune: [
      "necrotic",
      "poison"
    ],
    conditionImmune: ["charmed", "exhaustion", "frightened", "paralyzed", "poisoned"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Exhaustion, Frightened, Paralyzed, Poisoned condition(s). The engine applies this."
      },
      {
        id: "legendary-resistance",
        name: "Legendary Resistance",
        modifiers: [],
        text: "Can turn a failed saving throw into a success, 3 times a day, or 4 in its lair. The DM tracks the uses."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The mummy has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "undead-restoration",
        name: "Undead Restoration",
        modifiers: [],
        text: "If destroyed it gains a new body in 24 hours if its heart is intact, with all its Hit Points, in its lair. The heart is a Tiny object (AC 17, HP 10, immune to all damage except Fire). The DM applies this."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Wisdom, spell save DC 17, +9 to hit with spell attacks, no Material components. At will: Dispel Magic, Thaumaturgy. 1 a day each: Animate Dead, Harm, Insect Plague (level 7). The DM casts these."
      },
      {
        id: "whirlwind-of-sand",
        name: "Whirlwind of Sand",
        modifiers: [],
        text: "Reaction when hit by an attack roll: adds 2 to its AC against that attack, teleports up to 60 feet, and creatures of its choice within 5 feet of the destination are Blinded until the end of its next turn. The DM applies this."
      },
      {
        id: "legendary-actions",
        name: "Legendary Actions",
        modifiers: [],
        text: "Has legendary actions (3 uses, 4 in its lair): Dread Command (casts Command), Glare (uses Dreadful Glare) and Necrotic Strike (one Rotting Fist or Channel Negative Energy attack). The engine has no field for them; the DM runs them from the SRD."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: ["rotting-fist", "channel-negative-energy"], times: 1 }, { action: "dreadful-glare", times: 1 }],
        text: "One Rotting Fist or Channel Negative Energy attack, and it uses Dreadful Glare.",
      },
      {
        id: "rotting-fist",
        name: "Rotting Fist",
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
                damage: "2d10+4",
                type: "bludgeoning"
              },
              {
                damage: "3d6",
                type: "necrotic"
              },
              {
                manual: "A creature hit is cursed: it cannot regain Hit Points, gets no benefit from a Long Rest and its Hit Point maximum drops by 3d6 every 24 hours. A creature reduced to 0 Hit Points by this attack dies and turns to dust."
              }
            ]
          }
        ],
        text: "A blow that curses the target with rot."
      },
      {
        id: "channel-negative-energy",
        name: "Channel Negative Energy",
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
            bonus: 9,
            onHit: [
              {
                damage: "6d6+4",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A ranged necrotic attack."
      },
      {
        id: "dreadful-glare",
        name: "Dreadful Glare",
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
            save: "wis",
            dc: 17,
            onFail: [
              {
                damage: "6d6+4",
                type: "psychic"
              },
              {
                condition: "paralyzed",
                ends: {
                  on: "turnEnd",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A glare at one creature within 60 feet that Paralyzes it until the end of the mummy's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An ancient undead priest-king with command of sand and curses."
  },
  {
    id: "nalfeshnee",
    name: "Nalfeshnee",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 13,
    xp: 10000,
    pb: 5,
    ac: 18,
    hp: 184,
    speed: {
      walk: 20,
      fly: 30
    },
    abilities: {
      str: 21,
      dex: 10,
      con: 22,
      int: 19,
      wis: 12,
      cha: 15
    },
    senses: { truesight: 120 },
    resist: [
      "cold",
      "fire",
      "lightning"
    ],
    vulnerable: [],
    immune: [
      "poison"
    ],
    conditionImmune: ["frightened", "poisoned"],
    traits: [
      {
        id: "demonic-restoration",
        name: "Demonic Restoration",
        modifiers: [],
        text: "If it dies outside the Abyss it revives with all its Hit Points somewhere in the Abyss. The DM applies this."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The nalfeshnee has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Frightened, Poisoned condition(s). The engine applies this."
      },
      {
        id: "pursuit",
        name: "Pursuit",
        modifiers: [],
        text: "Reaction: when a creature it can see ends its move within 120 feet, it uses Teleport but must end within 10 feet of that creature. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 3 }],
        text: "Three Rend attacks.",
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
                damage: "2d10+5",
                type: "slashing"
              },
              {
                damage: "2d10",
                type: "force"
              }
            ]
          }
        ],
        text: "A reach attack with extra force damage."
      },
      {
        id: "teleport",
        name: "Teleport",
        target: {
          self: true
        },
        effects: [
          {
            manual: "The nalfeshnee teleports up to 120 feet to an unoccupied space it can see."
          }
        ],
        text: "Teleports up to 120 feet. The DM applies it."
      },
      {
        id: "horror-nimbus",
        name: "Horror Nimbus",
        time: "bonus",
        recharge: [5, 6],
        target: {
          area: {
            shape: "emanation",
            size: 15
          }
        },
        effects: [
          {
            save: "wis",
            dc: 15,
            onFail: [
              {
                damage: "8d6",
                type: "psychic"
              },
              {
                condition: "frightened"
              },
              {
                manual: "Frightened for 1 minute, until it takes damage, or until it ends its turn with the nalfeshnee out of line of sight. On a success the target is immune to this nalfeshnee's Horror Nimbus for 24 hours."
              }
            ]
          }
        ],
        text: "Bonus Action, Recharge 5-6. A 15 foot emanation of psychic dread."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A boar-headed demon of terrifying presence."
  },
  {
    id: "night-hag",
    name: "Night Hag",
    source: "SRD 5.2.1",
    size: "medium",
    type: "fiend",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 17,
    hp: 112,
    speed: {
      walk: 30
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 16,
      int: 16,
      wis: 14,
      cha: 16
    },
    senses: { darkvision: 120 },
    skills: {
      deception: 6,
      insight: 5,
      perception: 5,
      stealth: 5
    },
    resist: [
      "cold",
      "fire"
    ],
    vulnerable: [],
    immune: [],
    conditionImmune: ["charmed"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed condition(s). The engine applies this."
      },
      {
        id: "coven-magic",
        name: "Coven Magic",
        modifiers: [],
        text: "Within 30 feet of at least two hag allies it can cast Augury, Find Familiar, Identify, Locate Object, Scrying or Unseen Servant (Intelligence, DC 14), once each per Long Rest. The DM casts these."
      },
      {
        id: "magic-resistance",
        name: "Magic Resistance",
        modifiers: [],
        text: "The hag has Advantage on saving throws against spells and other magical effects. The engine has no tag for this yet; the DM applies it."
      },
      {
        id: "soul-bag",
        name: "Soul Bag",
        modifiers: [],
        text: "Carries a soul bag (AC 15, HP 20, Resistance to all damage) that lets it use Nightmare Haunting. The DM tracks it."
      },
      {
        id: "nightmare-haunting",
        name: "Nightmare Haunting",
        modifiers: [],
        text: "1 a day, needs the soul bag, while on the Ethereal Plane: casts Dream on a creature it can see on the Material Plane. Damage from the dream lowers the target's Hit Point maximum, and a target killed has its soul trapped in the bag. The DM runs this."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Intelligence, spell save DC 14, no Material components. At will: Detect Magic, Etherealness, Magic Missile (level 4). 2 a day each: Phantasmal Killer, Plane Shift (self only). The DM casts these."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Bonus Action: becomes a Small or Medium Humanoid or returns to its true form. The DM applies this."
      }
    ],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "claw", times: 2 }],
        text: "Two Claw attacks.",
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
    text: "A wicked hag who torments mortals through their dreams."
  },
  {
    id: "nightmare",
    name: "Nightmare",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 13,
    hp: 68,
    speed: {
      walk: 60,
      fly: 90
    },
    abilities: {
      str: 18,
      dex: 15,
      con: 16,
      int: 10,
      wis: 13,
      cha: 15
    },
    hover: true,
    resist: [],
    vulnerable: [],
    immune: [
      "fire"
    ],
    traits: [
      {
        id: "confer-fire-resistance",
        name: "Confer Fire Resistance",
        modifiers: [],
        text: "Can give a rider Resistance to Fire damage. The DM applies this."
      },
      {
        id: "illumination",
        name: "Illumination",
        modifiers: [],
        text: "Sheds Bright Light in a 10 foot radius and Dim Light for another 10 feet."
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
                damage: "2d8+4",
                type: "bludgeoning"
              },
              {
                damage: "3d6",
                type: "fire"
              }
            ]
          }
        ],
        text: "A melee attack with extra fire damage."
      },
      {
        id: "ethereal-stride",
        name: "Ethereal Stride",
        target: {
          self: true
        },
        effects: [
          {
            manual: "The nightmare and up to three willing creatures within 5 feet of it teleport to the Ethereal Plane from the Material Plane, or back."
          }
        ],
        text: "Carries itself and up to three willing creatures between the Material and Ethereal Planes. The DM applies it."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A flaming fiendish horse."
  },
  {
    id: "noble",
    name: "Noble",
    source: "SRD 5.2.1",
    size: "medium",
    type: "humanoid",
    cr: 0.125,
    xp: 25,
    pb: 2,
    ac: 15,
    hp: 9,
    speed: {
      walk: 30
    },
    abilities: {
      str: 11,
      dex: 12,
      con: 11,
      int: 12,
      wis: 14,
      cha: 16
    },
    skills: {
      deception: 5,
      insight: 4,
      persuasion: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "parry",
        name: "Parry",
        modifiers: [],
        text: "Reaction: when hit by a melee attack while holding a weapon, it adds 2 to its AC against that attack. The DM applies this."
      }
    ],
    actions: [
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
      }
    ],
    tier: "assist",
    checked: true,
    text: "A well-born person of rank, with a rapier and little training."
  },
  {
    id: "ochre-jelly",
    name: "Ochre Jelly",
    source: "SRD 5.2.1",
    size: "large",
    type: "ooze",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 8,
    hp: 52,
    speed: {
      walk: 20,
      climb: 20
    },
    abilities: {
      str: 15,
      dex: 6,
      con: 14,
      int: 2,
      wis: 6,
      cha: 1
    },
    senses: { blindsight: 60 },
    resist: [
      "acid"
    ],
    vulnerable: [],
    immune: [
      "lightning",
      "slashing"
    ],
    conditionImmune: ["charmed", "deafened", "exhaustion", "frightened", "grappled", "prone", "restrained"],
    traits: [
      {
        id: "condition-immunities",
        name: "Condition Immunities",
        modifiers: [],
        text: "Immune to the Charmed, Deafened, Exhaustion, Frightened, Grappled, Prone, Restrained condition(s). The engine applies this."
      },
      {
        id: "amorphous",
        name: "Amorphous",
        modifiers: [],
        text: "Can squeeze through a space 1 inch wide without extra movement cost."
      },
      {
        id: "spider-climb",
        name: "Spider Climb",
        modifiers: [],
        text: "Can climb difficult surfaces, including ceilings, without a check."
      },
      {
        id: "split",
        name: "Split",
        modifiers: [],
        text: "Reaction: while Large or Medium with 10 or more Hit Points, when it becomes Bloodied or takes Lightning or Slashing damage it splits into two jellies one size smaller, sharing its Hit Points evenly (rounded down). The DM applies this."
      }
    ],
    actions: [
      {
        id: "pseudopod",
        name: "Pseudopod",
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
                damage: "3d6+2",
                type: "acid"
              }
            ]
          }
        ],
        text: "A melee attack."
      }
    ],
    tier: "assist",
    checked: true,
    text: "An acidic ooze that splits when struck."
  },
  {
    id: "ogre",
    name: "Ogre",
    source: "SRD 5.2.1",
    size: "large",
    type: "giant",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 11,
    hp: 68,
    speed: {
      walk: 40
    },
    abilities: {
      str: 19,
      dex: 8,
      con: 16,
      int: 5,
      wis: 7,
      cha: 7
    },
    senses: { darkvision: 60 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "greatclub",
        name: "Greatclub",
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
                damage: "2d8+4",
                type: "bludgeoning"
              }
            ]
          }
        ],
        text: "A melee attack."
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
            bonus: 6,
            onHit: [
              {
                damage: "2d6+4",
                type: "piercing"
              }
            ]
          }
        ],
        text: "The same javelin thrown."
      }
    ],
    tier: "auto",
    checked: true,
    text: "A big, dim, hungry giant."
  },
  {
    id: "ogre-zombie",
    name: "Ogre Zombie",
    source: "SRD 5.2.1",
    size: "large",
    type: "undead",
    cr: 2,
    xp: 450,
    pb: 2,
    ac: 8,
    hp: 85,
    speed: {
      walk: 30
    },
    abilities: {
      str: 19,
      dex: 6,
      con: 18,
      int: 3,
      wis: 6,
      cha: 5
    },
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
        text: "If damage reduces it to 0 Hit Points it makes a Constitution save (DC 5 plus the damage taken), unless the damage is Radiant or from a Critical Hit; on a success it drops to 1 Hit Point instead. The DM applies this."
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
            bonus: 6,
            onHit: [
              {
                damage: "2d8+4",
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
    text: "A shambling ogre corpse."
  },
  {
    id: "oni",
    name: "Oni",
    source: "SRD 5.2.1",
    size: "large",
    type: "fiend",
    cr: 7,
    xp: 2900,
    pb: 3,
    ac: 17,
    hp: 119,
    speed: {
      walk: 30,
      fly: 30
    },
    abilities: {
      str: 19,
      dex: 11,
      con: 16,
      int: 14,
      wis: 12,
      cha: 15
    },
    senses: { darkvision: 60 },
    skills: {
      arcana: 5,
      deception: 8,
      perception: 4
    },
    hover: true,
    resist: [
      "cold"
    ],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "regeneration",
        name: "Regeneration",
        modifiers: [],
        text: "Regains 10 Hit Points at the start of each of its turns if it has at least 1 Hit Point. The DM applies this."
      },
      {
        id: "multiattack",
        name: "Multiattack",
        modifiers: [],
        text: "Two Claw or Nightmare Ray attacks. It can replace one attack with Spellcasting."
      },
      {
        id: "spellcasting",
        name: "Spellcasting",
        modifiers: [],
        text: "Charisma, spell save DC 13, no Material components. 1 a day each: Charm Person (level 2), Darkness, Gaseous Form, Sleep. The DM casts these."
      },
      {
        id: "invisibility",
        name: "Invisibility",
        modifiers: [],
        text: "Bonus Action: casts Invisibility on itself. The DM applies this."
      },
      {
        id: "shape-shift",
        name: "Shape-Shift",
        modifiers: [],
        text: "Becomes a Small or Medium Humanoid or a Large Giant, or returns to its true form. The DM applies this."
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
            bonus: 7,
            onHit: [
              {
                damage: "1d12+4",
                type: "slashing"
              },
              {
                damage: "2d8",
                type: "necrotic"
              }
            ]
          }
        ],
        text: "A reach attack with extra necrotic damage."
      },
      {
        id: "nightmare-ray",
        name: "Nightmare Ray",
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
                damage: "2d6+2",
                type: "psychic"
              },
              {
                condition: "frightened",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "A ray that Frightens the target until the start of the oni's next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A shape-changing ogre-mage fiend."
  },
  {
    id: "otyugh",
    name: "Otyugh",
    source: "SRD 5.2.1",
    size: "large",
    type: "aberration",
    cr: 5,
    xp: 1800,
    pb: 3,
    ac: 14,
    hp: 104,
    speed: {
      walk: 30
    },
    abilities: {
      str: 16,
      dex: 11,
      con: 19,
      int: 6,
      wis: 13,
      cha: 6
    },
    senses: { darkvision: 120 },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "bite", times: 1 }, { action: "tentacle", times: 2 }],
        text: "One Bite attack and two Tentacle attacks.",
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
                damage: "2d8+3",
                type: "piercing"
              },
              {
                condition: "poisoned"
              },
              {
                manual: "Whenever the Poisoned target finishes a Long Rest it makes a DC 15 Constitution save: on a failure its Hit Point maximum drops by 1d10 and stays down until the Poisoned condition ends; on a success the Poisoned condition ends."
              }
            ]
          }
        ],
        text: "A bite that poisons and can sap Hit Point maximum."
      },
      {
        id: "tentacle",
        name: "Tentacle",
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
                damage: "2d8+3",
                type: "piercing"
              },
              {
                condition: "grappled"
              },
              {
                manual: "Grapples a Medium or smaller target (escape DC 13) from one of two tentacles."
              }
            ]
          }
        ],
        text: "A reach attack that grapples a Medium or smaller target."
      },
      {
        id: "tentacle-slam",
        name: "Tentacle Slam",
        target: {
          area: {
            shape: "emanation",
            size: 10
          }
        },
        effects: [
          {
            save: "con",
            dc: 14,
            half: true,
            onFail: [
              {
                damage: "3d8+3",
                type: "bludgeoning"
              },
              {
                condition: "stunned",
                ends: {
                  on: "turnStart",
                  of: "source"
                }
              }
            ]
          }
        ],
        text: "Hits only creatures Grappled by the otyugh; Stuns them until the start of its next turn."
      }
    ],
    tier: "assist",
    checked: true,
    text: "A filth-dwelling scavenger with grasping tentacles."
  },
  {
    id: "owl",
    name: "Owl",
    source: "SRD 5.2.1",
    size: "tiny",
    type: "beast",
    cr: 0,
    xp: 10,
    pb: 2,
    ac: 11,
    hp: 1,
    speed: {
      walk: 5,
      fly: 60
    },
    abilities: {
      str: 3,
      dex: 13,
      con: 8,
      int: 2,
      wis: 12,
      cha: 7
    },
    senses: { darkvision: 120 },
    skills: {
      perception: 5,
      stealth: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [
      {
        id: "flyby",
        name: "Flyby",
        modifiers: [],
        text: "Does not provoke an Opportunity Attack when it flies out of an enemy's reach."
      }
    ],
    actions: [
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
            bonus: 3,
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
    checked: true,
    text: "A silent night hunter."
  },
  {
    id: "owlbear",
    name: "Owlbear",
    source: "SRD 5.2.1",
    size: "large",
    type: "monstrosity",
    cr: 3,
    xp: 700,
    pb: 2,
    ac: 13,
    hp: 59,
    speed: {
      walk: 40,
      climb: 40
    },
    abilities: {
      str: 20,
      dex: 12,
      con: 17,
      int: 3,
      wis: 12,
      cha: 7
    },
    senses: { darkvision: 60 },
    skills: {
      perception: 5
    },
    resist: [],
    vulnerable: [],
    immune: [],
    traits: [],
    actions: [
      {
        id: "multiattack",
        name: "Multiattack",
        multiattack: [{ action: "rend", times: 2 }],
        text: "Two Rend attacks.",
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
                damage: "2d8+5",
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
    text: "A savage cross between a bear and a giant owl."
  }
];
