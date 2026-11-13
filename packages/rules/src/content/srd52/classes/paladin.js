// The Paladin class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const paladin = {
  "id": "paladin",
  "name": "Paladin",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A holy warrior bound by an oath.",
  "hitDie": 10,
  "primary": [
    "str",
    "cha"
  ],
  "saves": [
    "wis",
    "cha"
  ],
  "armour": [
    "light",
    "medium",
    "heavy",
    "shield"
  ],
  "weapons": [
    "simple",
    "martial"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "athletics",
      "insight",
      "intimidation",
      "medicine",
      "persuasion",
      "religion"
    ]
  },
  "table": {
    "channel-divinity": [
      null,
      null,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3,
      3
    ]
  },
  "casting": {
    "ability": "cha",
    "kind": "prepared",
    "cantrips": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "prepared": [
      2,
      3,
      4,
      5,
      6,
      6,
      7,
      7,
      9,
      9,
      10,
      10,
      11,
      11,
      12,
      12,
      14,
      14,
      15,
      15
    ],
    "slots": [
      [
        2
      ],
      [
        2
      ],
      [
        3
      ],
      [
        3
      ],
      [
        4,
        2
      ],
      [
        4,
        2
      ],
      [
        4,
        3
      ],
      [
        4,
        3
      ],
      [
        4,
        3,
        2
      ],
      [
        4,
        3,
        2
      ],
      [
        4,
        3,
        3
      ],
      [
        4,
        3,
        3
      ],
      [
        4,
        3,
        3,
        1
      ],
      [
        4,
        3,
        3,
        1
      ],
      [
        4,
        3,
        3,
        2
      ],
      [
        4,
        3,
        3,
        2
      ],
      [
        4,
        3,
        3,
        3,
        1
      ],
      [
        4,
        3,
        3,
        3,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2
      ],
      [
        4,
        3,
        3,
        3,
        2
      ]
    ]
  },
  "features": [
    {
      "id": "lay-on-hands",
      "name": "Lay On Hands",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "A pool of five times your Paladin level Hit Points, refilled on a Long Rest. As a Bonus Action, touch a creature (or yourself) and restore Hit Points from it, or spend 5 from it to remove Poisoned.",
      "uses": {
        "max": {
          "perLevel": 5
        },
        "recharge": "long"
      },
      "grants": {
        "action": {
          "time": "bonus",
          "pool": true,
          "target": {
            "creature": {
              "reach": 5
            }
          },
          "cure": {
            "conditions": [
              "poisoned"
            ],
            "cost": 5
          }
        }
      }
    },
    {
      "id": "spellcasting",
      "name": "Spellcasting",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Cast Paladin spells using Charisma; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "weapon-mastery",
      "name": "Weapon Mastery",
      "level": 1,
      "tier": "manual",
      "checked": true,
      "text": "Use the mastery properties of two kinds of weapons you choose. The engine does not apply mastery properties yet."
    },
    {
      "id": "fighting-style",
      "name": "Fighting Style",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Gain a Fighting Style feat, or Blessed Warrior.",
      "options": [
        {
          "id": "archery",
          "name": "Archery",
          "tier": "auto",
          "text": "+2 to attack rolls with Ranged weapons.",
          "grants": {
            "rangedAttack": 2
          }
        },
        {
          "id": "defense",
          "name": "Defense",
          "tier": "auto",
          "text": "+1 to Armor Class while wearing Light, Medium or Heavy armor.",
          "grants": {
            "armouredAc": 1
          }
        },
        {
          "id": "great-weapon-fighting",
          "name": "Great Weapon Fighting",
          "tier": "manual",
          "text": "Treat a 1 or 2 on a damage die as a 3 with a Melee weapon held in two hands (Two-Handed or Versatile). The engine does not change damage dice; the DM applies it."
        },
        {
          "id": "two-weapon-fighting",
          "name": "Two-Weapon Fighting",
          "tier": "manual",
          "text": "Add your ability modifier to the damage of the extra attack from a Light weapon. The engine has no extra Light-weapon attack yet; the DM applies it."
        },
        {
          "id": "blessed-warrior",
          "name": "Blessed Warrior",
          "tier": "manual",
          "text": "Learn two Cleric cantrips, which count as Paladin spells using Charisma. Enter them as spells; the DM checks them."
        }
      ]
    },
    {
      "id": "paladins-smite",
      "name": "Paladin's Smite",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Divine Smite is always prepared (applied); casting it once without a slot per Long Rest is the DM's.",
      "grants": {
        "spells": [
          "divine-smite"
        ]
      }
    },
    {
      "id": "channel-divinity",
      "name": "Channel Divinity",
      "level": 3,
      "tier": "auto",
      "checked": true,
      "text": "Uses of Channel Divinity (two, three from level 11) fuel Divine Sense and your other options; one comes back on a Short Rest, all on a Long Rest.",
      "uses": {
        "max": {
          "column": "channel-divinity"
        },
        "recharge": "long",
        "short": 1
      }
    },
    {
      "id": "divine-sense",
      "name": "Divine Sense",
      "level": 3,
      "tier": "manual",
      "checked": true,
      "text": "As a Bonus Action, spend Channel Divinity to sense Celestials, Fiends, Undead and consecrated or desecrated places within 60 feet for 10 minutes. The engine spends the use; the DM tells you what you sense.",
      "grants": {
        "action": {
          "time": "bonus",
          "cost": {
            "resource": "channel-divinity"
          },
          "target": {
            "self": true
          },
          "effects": [
            {
              "manual": "Divine Sense: for 10 minutes the paladin knows where any Celestial, Fiend or Undead within 60 feet is, and senses consecrated or desecrated places and objects there."
            }
          ]
        }
      }
    },
    {
      "id": "ability-score-improvement-4",
      "name": "Ability Score Improvement",
      "level": 4,
      "tier": "manual",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for. Enter the raised scores on the sheet; other feats are applied by the DM."
    },
    {
      "id": "ability-score-improvement-8",
      "name": "Ability Score Improvement",
      "level": 8,
      "tier": "manual",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for. Enter the raised scores on the sheet; other feats are applied by the DM."
    },
    {
      "id": "ability-score-improvement-12",
      "name": "Ability Score Improvement",
      "level": 12,
      "tier": "manual",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for. Enter the raised scores on the sheet; other feats are applied by the DM."
    },
    {
      "id": "ability-score-improvement-16",
      "name": "Ability Score Improvement",
      "level": 16,
      "tier": "manual",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for. Enter the raised scores on the sheet; other feats are applied by the DM."
    },
    {
      "id": "extra-attack",
      "name": "Extra Attack",
      "level": 5,
      "tier": "auto",
      "checked": true,
      "text": "Attack twice when you take the Attack action.",
      "grants": {
        "extraAttack": 1
      }
    },
    {
      "id": "faithful-steed",
      "name": "Faithful Steed",
      "level": 5,
      "tier": "assist",
      "checked": true,
      "text": "Find Steed is always prepared (applied); casting it once without a slot per Long Rest is the DM's.",
      "grants": {
        "spells": [
          "find-steed"
        ]
      }
    },
    {
      "id": "aura-of-protection",
      "name": "Aura of Protection",
      "level": 6,
      "tier": "auto",
      "checked": true,
      "text": "You and allies within 10 feet add your Charisma modifier (at least +1) to saving throws, while you are not Incapacitated. One Aura of Protection at a time: the best one applies.",
      "grants": {
        "aura": {
          "range": 10,
          "modifiers": [
            {
              "on": "save",
              "op": "add",
              "value": {
                "mod": "cha",
                "min": 1
              }
            }
          ]
        }
      }
    },
    {
      "id": "abjure-foes",
      "name": "Abjure Foes",
      "level": 9,
      "tier": "assist",
      "checked": true,
      "text": "As a Magic action, spend Channel Divinity: up to Charisma modifier (at least one) creatures within 60 feet make a Wisdom save or are Frightened for 1 minute or until they take damage (applied). That they can only move, act or take a Bonus Action on their turns is the DM's.",
      "grants": {
        "action": {
          "time": "action",
          "cost": {
            "resource": "channel-divinity"
          },
          "duration": "1 minute",
          "target": {
            "creature": {
              "range": [
                60,
                60
              ],
              "count": {
                "mod": "cha",
                "min": 1
              }
            }
          },
          "effects": [
            {
              "save": "wis",
              "onFail": [
                {
                  "condition": "frightened",
                  "ends": {
                    "on": "damaged"
                  }
                },
                {
                  "manual": "Abjure Foes: while Frightened this way, the creature can do only one of these on each of its turns: move, take an action, or take a Bonus Action."
                }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "aura-of-courage",
      "name": "Aura of Courage",
      "level": 10,
      "tier": "auto",
      "checked": true,
      "text": "You and allies in your Aura of Protection are immune to Frightened; a Frightened ally there is not affected by it while there.",
      "grants": {
        "aura": {
          "range": 10,
          "immune": [
            "frightened"
          ]
        }
      }
    },
    {
      "id": "radiant-strikes",
      "name": "Radiant Strikes",
      "level": 11,
      "tier": "auto",
      "checked": true,
      "text": "A hit with a Melee weapon or Unarmed Strike deals an extra 1d8 Radiant.",
      "grants": {
        "modifiers": [
          {
            "on": "damage.dealt",
            "op": "add",
            "value": "1d8",
            "types": [
              "radiant"
            ],
            "when": [
              "attack.hit",
              "attack.weapon",
              "melee"
            ]
          }
        ]
      }
    },
    {
      "id": "restoring-touch",
      "name": "Restoring Touch",
      "level": 14,
      "tier": "auto",
      "checked": true,
      "text": "Lay On Hands can also remove Blinded, Charmed, Deafened, Frightened, Paralyzed or Stunned, for 5 points from the pool each.",
      "grants": {
        "cure": {
          "of": "lay-on-hands",
          "conditions": [
            "blinded",
            "charmed",
            "deafened",
            "frightened",
            "paralyzed",
            "stunned"
          ]
        }
      }
    },
    {
      "id": "aura-expansion",
      "name": "Aura Expansion",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "Your Aura of Protection becomes a 30-foot Emanation."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "manual",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Truesight is suggested). Feats are applied by the DM."
    }
  ],
  "subclass": {
    "id": "devotion",
    "name": "Oath of Devotion",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Paladins of justice and order.",
    "spells": {
      "3": [
        "protection-from-evil-and-good",
        "shield-of-faith"
      ],
      "5": [
        "aid",
        "zone-of-truth"
      ],
      "9": [
        "beacon-of-hope",
        "dispel-magic"
      ],
      "13": [
        "freedom-of-movement",
        "guardian-of-faith"
      ],
      "17": [
        "commune",
        "flame-strike"
      ]
    },
    "features": [
      {
        "id": "sacred-weapon",
        "name": "Sacred Weapon",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "When you take the Attack action, spend Channel Divinity: for 10 minutes add your Charisma modifier (at least +1) to attack rolls with a Melee weapon you hold, which may deal Radiant damage and sheds light.",
        "grants": {
          "action": {
            "time": "free",
            "cost": {
              "resource": "channel-divinity"
            },
            "target": {
              "self": true
            },
            "effects": [
              {
                "manual": "Sacred Weapon: for 10 minutes, add Charisma modifier (at least +1) to attack rolls with the held Melee weapon; its hits can deal Radiant damage; it sheds Bright Light 20 feet and Dim Light 20 feet beyond."
              }
            ]
          }
        }
      },
      {
        "id": "aura-of-devotion",
        "name": "Aura of Devotion",
        "level": 7,
        "tier": "auto",
        "checked": true,
        "text": "You and allies in your Aura of Protection are immune to Charmed; a Charmed ally there is not affected by it while there.",
        "grants": {
          "aura": {
            "range": 10,
            "immune": [
              "charmed"
            ]
          }
        }
      },
      {
        "id": "smite-of-protection",
        "name": "Smite of Protection",
        "level": 15,
        "tier": "manual",
        "checked": true,
        "text": "When you cast Divine Smite, you and allies in your Aura of Protection have Half Cover until the start of your next turn. The engine has no trigger on casting a named spell yet; the DM applies it."
      },
      {
        "id": "holy-nimbus",
        "name": "Holy Nimbus",
        "level": 20,
        "tier": "manual",
        "checked": true,
        "text": "As a Bonus Action for 10 minutes: Advantage on saves forced by Fiends or Undead, enemies starting their turn in the aura take Radiant damage of Charisma modifier + Proficiency Bonus, and the aura is sunlight. Once per Long Rest, or spend a level 5 slot.",
        "uses": {
          "max": 1,
          "recharge": "long"
        }
      }
    ]
  }
};
