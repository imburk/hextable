// The Sorcerer class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const sorcerer = {
  "id": "sorcerer",
  "name": "Sorcerer",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A spellcaster whose magic is innate.",
  "hitDie": 6,
  "primary": [
    "cha"
  ],
  "saves": [
    "con",
    "cha"
  ],
  "armour": [],
  "weapons": [
    "simple"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "arcana",
      "deception",
      "insight",
      "intimidation",
      "persuasion",
      "religion"
    ]
  },
  "table": {
    "sorcery-points": [
      null,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20
    ]
  },
  "casting": {
    "ability": "cha",
    "kind": "prepared",
    "cantrips": [
      4,
      4,
      4,
      5,
      5,
      5,
      5,
      5,
      5,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6,
      6
    ],
    "prepared": [
      2,
      4,
      6,
      7,
      9,
      10,
      11,
      12,
      14,
      15,
      16,
      16,
      17,
      17,
      18,
      18,
      19,
      20,
      21,
      22
    ],
    "slots": [
      [
        2
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
        2
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        2,
        1,
        1,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        3,
        1,
        1,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        3,
        2,
        1,
        1,
        1
      ],
      [
        4,
        3,
        3,
        3,
        3,
        2,
        2,
        1,
        1
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
      "text": "Cast Sorcerer spells using Charisma; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "innate-sorcery",
      "name": "Innate Sorcery",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "As a Bonus Action, for 1 minute your Sorcerer spell save DC rises by 1 and you have Advantage on attack rolls of Sorcerer spells. Twice per Long Rest.",
      "uses": {
        "max": 2,
        "recharge": "long"
      },
      "grants": {
        "action": {
          "time": "bonus",
          "target": {
            "self": true
          },
          "duration": "1 minute",
          "effects": [
            {
              "modifier": {
                "on": "spell.dc",
                "op": "add",
                "value": 1
              }
            },
            {
              "modifier": {
                "on": "attack.roll",
                "op": "advantage",
                "when": [
                  "attack.spell"
                ]
              }
            }
          ]
        }
      }
    },
    {
      "id": "font-of-magic",
      "name": "Font of Magic",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "Sorcery Points (see the table), back on a Long Rest. Turn a slot into points (no action) or points into a slot (Bonus Action). The engine keeps the count; the DM makes the conversions.",
      "uses": {
        "max": {
          "column": "sorcery-points"
        },
        "recharge": "long"
      }
    },
    {
      "id": "metamagic",
      "name": "Metamagic",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "Know two Metamagic options (two more at 10 and 17) and spend Sorcery Points to alter spells. Not built; the DM applies them."
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
      "id": "sorcerous-restoration",
      "name": "Sorcerous Restoration",
      "level": 5,
      "tier": "manual",
      "checked": true,
      "text": "On a Short Rest, regain Sorcery Points up to half your Sorcerer level, once per Long Rest.",
      "uses": {
        "max": 1,
        "recharge": "long"
      }
    },
    {
      "id": "sorcery-incarnate",
      "name": "Sorcery Incarnate",
      "level": 7,
      "tier": "manual",
      "checked": true,
      "text": "With no Innate Sorcery uses left, spend 2 Sorcery Points to use it; while it is active, use two Metamagic options on a spell."
    },
    {
      "id": "metamagic-10",
      "name": "Metamagic",
      "level": 10,
      "tier": "manual",
      "checked": true,
      "text": "Two more Metamagic options."
    },
    {
      "id": "metamagic-17",
      "name": "Metamagic",
      "level": 17,
      "tier": "manual",
      "checked": true,
      "text": "Two more Metamagic options."
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
      "id": "arcane-apotheosis",
      "name": "Arcane Apotheosis",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "While Innate Sorcery is active, one Metamagic option a turn costs no Sorcery Points."
    }
  ],
  "subclass": {
    "id": "draconic",
    "name": "Draconic Sorcery",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Sorcerers whose magic comes from a dragon.",
    "spells": {
      "3": [
        "alter-self",
        "chromatic-orb",
        "command",
        "dragons-breath"
      ],
      "5": [
        "fear",
        "fly"
      ],
      "7": [
        "arcane-eye",
        "charm-monster"
      ],
      "9": [
        "legend-lore",
        "summon-dragon"
      ]
    },
    "features": [
      {
        "id": "draconic-resilience",
        "name": "Draconic Resilience",
        "level": 3,
        "tier": "auto",
        "checked": true,
        "text": "Hit Point maximum +3 at level 3 and +1 for each Sorcerer level after; without armor, base Armor Class is 10 + Dexterity and Charisma modifiers.",
        "grants": {
          "hp": {
            "perLevel": 1
          },
          "ac": {
            "base": 10,
            "abilities": [
              "dex",
              "cha"
            ],
            "shield": true
          }
        }
      },
      {
        "id": "elemental-affinity",
        "name": "Elemental Affinity",
        "level": 6,
        "tier": "assist",
        "checked": true,
        "text": "Choose Acid, Cold, Fire, Lightning or Poison: Resistance to it (the engine applies it), and add Charisma modifier to one damage roll of a spell of that type (the DM adds it).",
        "options": [
          {
            "id": "acid",
            "name": "Acid",
            "tier": "assist",
            "text": "Resistance to Acid damage. When you cast a spell that deals Acid damage, add your Charisma modifier to one damage roll of it; the DM adds that.",
            "grants": {
              "resist": [
                "acid"
              ]
            }
          },
          {
            "id": "cold",
            "name": "Cold",
            "tier": "assist",
            "text": "Resistance to Cold damage. When you cast a spell that deals Cold damage, add your Charisma modifier to one damage roll of it; the DM adds that.",
            "grants": {
              "resist": [
                "cold"
              ]
            }
          },
          {
            "id": "fire",
            "name": "Fire",
            "tier": "assist",
            "text": "Resistance to Fire damage. When you cast a spell that deals Fire damage, add your Charisma modifier to one damage roll of it; the DM adds that.",
            "grants": {
              "resist": [
                "fire"
              ]
            }
          },
          {
            "id": "lightning",
            "name": "Lightning",
            "tier": "assist",
            "text": "Resistance to Lightning damage. When you cast a spell that deals Lightning damage, add your Charisma modifier to one damage roll of it; the DM adds that.",
            "grants": {
              "resist": [
                "lightning"
              ]
            }
          },
          {
            "id": "poison",
            "name": "Poison",
            "tier": "assist",
            "text": "Resistance to Poison damage. When you cast a spell that deals Poison damage, add your Charisma modifier to one damage roll of it; the DM adds that.",
            "grants": {
              "resist": [
                "poison"
              ]
            }
          }
        ]
      },
      {
        "id": "dragon-wings",
        "name": "Dragon Wings",
        "level": 14,
        "tier": "manual",
        "checked": true,
        "text": "As a Bonus Action, gain a Fly Speed of 60 feet for 1 hour, once per Long Rest or for 3 Sorcery Points. The DM sets the Fly Speed.",
        "uses": {
          "max": 1,
          "recharge": "long"
        }
      },
      {
        "id": "dragon-companion",
        "name": "Dragon Companion",
        "level": 18,
        "tier": "manual",
        "checked": true,
        "text": "Cast Summon Dragon without Material components, once without a slot per Long Rest, optionally without Concentration for 1 minute."
      }
    ]
  }
};
