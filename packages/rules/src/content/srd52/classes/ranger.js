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
      "tier": "assist",
      "checked": true,
      "text": "Hunter's Mark is always prepared (applied); casting it without a slot, so many times per Long Rest (see the table), is the DM's.",
      "uses": {
        "max": {
          "column": "favored-enemy"
        },
        "recharge": "long"
      },
      "grants": {
        "spells": [
          "hunters-mark"
        ]
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
      "tier": "assist",
      "checked": true,
      "text": "As a Magic action, gain 1d8 + Wisdom modifier Temporary Hit Points, Wisdom modifier times per Long Rest (applied); a Short Rest lowers Exhaustion by 1 (the DM applies that).",
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
        }
      }
    },
    {
      "id": "relentless-hunter",
      "name": "Relentless Hunter",
      "level": 13,
      "tier": "manual",
      "checked": true,
      "text": "Taking damage can't break your Concentration on Hunter's Mark. The DM applies it."
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
      "tier": "manual",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Dimensional Travel is suggested). Feats are applied by the DM."
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
        "tier": "manual",
        "checked": true,
        "text": "Choose Escape the Horde or Multiattack Defense; change on a rest.",
        "options": [
          {
            "id": "escape-the-horde",
            "name": "Escape the Horde",
            "tier": "manual",
            "text": "Opportunity Attacks against you have Disadvantage."
          },
          {
            "id": "multiattack-defense",
            "name": "Multiattack Defense",
            "tier": "manual",
            "text": "A creature that hits you has Disadvantage on its other attacks against you this turn."
          }
        ]
      },
      {
        "id": "superior-hunters-prey",
        "name": "Superior Hunter's Prey",
        "level": 11,
        "tier": "manual",
        "checked": true,
        "text": "Once a turn, Hunter's Mark's extra damage can also hit another creature within 30 feet of the marked one."
      },
      {
        "id": "superior-hunters-defense",
        "name": "Superior Hunter's Defense",
        "level": 15,
        "tier": "manual",
        "checked": true,
        "text": "When you take damage, use your Reaction for Resistance to that type this turn. Reactions are not prompted yet."
      }
    ]
  }
};
