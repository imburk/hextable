// The Ranger class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const ranger = {
  "id": "ranger",
  "name": "Ranger",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A warrior of the wilds who hunts with magic.",
  "hitDie": 10,
  "primary": [
    "dex",
    "wis"
  ],
  "saves": [
    "str",
    "dex"
  ],
  "armour": [
    "light",
    "medium",
    "shield"
  ],
  "weapons": [
    "simple",
    "martial"
  ],
  "skills": {
    "choose": 3,
    "from": [
      "animal-handling",
      "athletics",
      "insight",
      "investigation",
      "nature",
      "perception",
      "stealth",
      "survival"
    ]
  },
  "table": {
    "favored-enemy": [
      2,
      2,
      2,
      2,
      3,
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      5,
      5,
      5,
      5,
      6,
      6,
      6,
      6
    ]
  },
  "casting": {
    "ability": "wis",
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
  "multiclass": {
    "requires": {
      "all": [
        "dex",
        "wis"
      ]
    },
    "armour": [
      "light",
      "medium",
      "shield"
    ],
    "weapons": [
      "martial"
    ],
    "skills": {
      "choose": 1,
      "from": "class"
    },
    "caster": "half"
  },
  "features": [
    {
      "id": "spellcasting",
      "name": "Spellcasting",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Cast Ranger spells using Wisdom; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "favored-enemy",
      "name": "Favored Enemy",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Hunter's Mark is always prepared, and you can cast it without a spell slot (cast with via favored-enemy) so many times per Long Rest (the Favored Enemy column).",
      "uses": {
        "max": {
          "column": "favored-enemy"
        },
        "recharge": "long"
      },
      "grants": {
        "spells": [
          "hunters-mark"
        ],
        "freeCast": {
          "spells": [
            "hunters-mark"
          ]
        }
      }
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
      "id": "deft-explorer",
      "name": "Deft Explorer",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Expertise in one skill proficiency (applied) and two languages.",
      "grants": {
        "expertise": 1
      }
    },
    {
      "id": "fighting-style",
      "name": "Fighting Style",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Gain a Fighting Style feat, or Druidic Warrior.",
      "options": [
        {
          "id": "archery",
          "feat": "archery",
          "name": "Archery",
          "tier": "auto",
          "text": "+2 to attack rolls with Ranged weapons."
        },
        {
          "id": "defense",
          "feat": "defense",
          "name": "Defense",
          "tier": "auto",
          "text": "+1 to Armor Class while wearing Light, Medium or Heavy armor."
        },
        {
          "id": "great-weapon-fighting",
          "feat": "great-weapon-fighting",
          "name": "Great Weapon Fighting",
          "tier": "manual",
          "text": "Treat a 1 or 2 on a damage die as a 3 with a Melee weapon held in two hands (Two-Handed or Versatile). The engine does not change damage dice; the DM applies it."
        },
        {
          "id": "two-weapon-fighting",
          "feat": "two-weapon-fighting",
          "name": "Two-Weapon Fighting",
          "tier": "manual",
          "text": "Add your ability modifier to the damage of the extra attack from a Light weapon. The engine has no extra Light-weapon attack yet; the DM applies it."
        },
        {
          "id": "druidic-warrior",
          "name": "Druidic Warrior",
          "tier": "manual",
          "text": "Learn two Druid cantrips, which count as Ranger spells using Wisdom. Enter them as spells; the DM checks them."
        }
      ]
    },
    {
      "id": "ability-score-improvement-4",
      "name": "Ability Score Improvement",
      "level": 4,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for (the sheet's feats). Without one, the scores entered on the sheet are taken as they stand."
    },
    {
      "id": "ability-score-improvement-8",
      "name": "Ability Score Improvement",
      "level": 8,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for (the sheet's feats). Without one, the scores entered on the sheet are taken as they stand."
    },
    {
      "id": "ability-score-improvement-12",
      "name": "Ability Score Improvement",
      "level": 12,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for (the sheet's feats). Without one, the scores entered on the sheet are taken as they stand."
    },
    {
      "id": "ability-score-improvement-16",
      "name": "Ability Score Improvement",
      "level": 16,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Take the Ability Score Improvement feat or another feat you qualify for (the sheet's feats). Without one, the scores entered on the sheet are taken as they stand."
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
      "id": "roving",
      "name": "Roving",
      "level": 6,
      "tier": "auto",
      "checked": true,
      "text": "+10 feet Speed while not wearing Heavy armor, and a Climb Speed and Swim Speed equal to your Speed.",
      "grants": {
        "speed": {
          "add": 10,
          "unless": "heavy"
        },
        "speeds": [
          "climb",
          "swim"
        ]
      }
    },
    {
      "id": "expertise",
      "name": "Expertise",
      "level": 9,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in two skill proficiencies.",
      "grants": {
        "expertise": 2
      }
    },
    {
      "id": "tireless",
      "name": "Tireless",
      "level": 10,
      "tier": "auto",
      "checked": true,
      "text": "As a Magic action, gain 1d8 + Wisdom modifier Temporary Hit Points, Wisdom modifier times per Long Rest; each Short Rest you finish lowers your Exhaustion by 1.",
      "uses": {
        "max": {
          "mod": "wis",
          "min": 1
        },
        "recharge": "long"
      },
      "grants": {
        "action": {
          "time": "action",
          "target": {
            "self": true
          },
          "effects": [
            {
              "tempHp": "1d8",
              "addMod": true
            }
          ]
        },
        "restExhaustion": "short"
      }
    },
    {
      "id": "relentless-hunter",
      "name": "Relentless Hunter",
      "level": 13,
      "tier": "auto",
      "checked": true,
      "text": "Taking damage never makes you save to keep Concentration on Hunter's Mark.",
      "grants": {
        "steadfast": {
          "spell": "hunters-mark"
        }
      }
    },
    {
      "id": "natures-veil",
      "name": "Nature's Veil",
      "level": 14,
      "tier": "auto",
      "checked": true,
      "text": "As a Bonus Action, become Invisible until the end of your next turn, Wisdom modifier times per Long Rest.",
      "uses": {
        "max": {
          "mod": "wis",
          "min": 1
        },
        "recharge": "long"
      },
      "grants": {
        "action": {
          "time": "bonus",
          "target": {
            "self": true
          },
          "effects": [
            {
              "condition": "invisible",
              "ends": {
                "on": "turnEnd"
              }
            }
          ]
        }
      }
    },
    {
      "id": "precise-hunter",
      "name": "Precise Hunter",
      "level": 17,
      "tier": "manual",
      "checked": true,
      "text": "Advantage on attack rolls against the creature marked by your Hunter's Mark. The DM applies it."
    },
    {
      "id": "feral-senses",
      "name": "Feral Senses",
      "level": 18,
      "tier": "auto",
      "checked": true,
      "text": "Blindsight 30 feet.",
      "grants": {
        "senses": {
          "blindsight": 30
        }
      }
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Dimensional Travel is suggested). Without one, nothing is added."
    },
    {
      "id": "foe-slayer",
      "name": "Foe Slayer",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Hunter's Mark's damage die is a d10. The DM applies it."
    }
  ],
  "subclass": {
    "id": "hunter",
    "name": "Hunter",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Rangers who protect nature and people from destruction.",
    "features": [
      {
        "id": "hunters-lore",
        "name": "Hunter's Lore",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "You know the Immunities, Resistances and Vulnerabilities of a creature marked by your Hunter's Mark. The DM tells you."
      },
      {
        "id": "hunters-prey",
        "name": "Hunter's Prey",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "Choose Colossus Slayer or Horde Breaker; change on a rest.",
        "options": [
          {
            "id": "colossus-slayer",
            "name": "Colossus Slayer",
            "tier": "manual",
            "text": "Once a turn, a weapon hit deals 1d8 more to a creature missing Hit Points. The DM applies it."
          },
          {
            "id": "horde-breaker",
            "name": "Horde Breaker",
            "tier": "manual",
            "text": "Once a turn, attack another creature within 5 feet of your target with the same weapon. The DM allows the attack."
          }
        ]
      },
      {
        "id": "defensive-tactics",
        "name": "Defensive Tactics",
        "level": 7,
        "tier": "auto",
        "checked": true,
        "text": "Choose Escape the Horde or Multiattack Defense on the sheet; after a Short or Long Rest you may change it there.",
        "options": [
          {
            "id": "escape-the-horde",
            "name": "Escape the Horde",
            "tier": "auto",
            "text": "Opportunity Attacks against you have Disadvantage.",
            "grants": {
              "modifiers": [
                {
                  "on": "attack.received",
                  "op": "disadvantage",
                  "when": [
                    "attack.opportunity"
                  ]
                }
              ]
            }
          },
          {
            "id": "multiattack-defense",
            "name": "Multiattack Defense",
            "tier": "auto",
            "text": "A creature that hits you with an attack roll has Disadvantage on its other attack rolls against you for the rest of the turn.",
            "grants": {
              "afterHit": {
                "modifier": {
                  "on": "attack.roll",
                  "op": "disadvantage"
                }
              }
            }
          }
        ]
      },
      {
        "id": "superior-hunters-prey",
        "name": "Superior Hunter's Prey",
        "level": 11,
        "tier": "assist",
        "checked": true,
        "text": "Once a turn, when your attack (the attack action with prey) damages the creature your Hunter's Mark marks, the mark's extra damage also hits another creature you can see within 30 feet of it. Damage dealt some other way (a spell's) is the DM's to spread.",
        "grants": {
          "markSpread": {
            "spell": "hunters-mark",
            "range": 30
          }
        }
      },
      {
        "id": "superior-hunters-defense",
        "name": "Superior Hunter's Defense",
        "level": 15,
        "tier": "auto",
        "checked": true,
        "text": "When you take damage, you can take a Reaction for Resistance to that damage and any more of its type until the end of the turn (by standing instruction: always, never or ask). Damage of several types at once goes to the DM, as you pick the type.",
        "grants": {
          "reaction": {
            "on": "damaged",
            "resist": true
          }
        }
      }
    ]
  }
};
