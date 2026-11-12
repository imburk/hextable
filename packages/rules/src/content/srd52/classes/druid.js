// The Druid class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const druid = {
  "id": "druid",
  "name": "Druid",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A priest of nature who takes the shapes of beasts.",
  "hitDie": 8,
  "primary": [
    "wis"
  ],
  "saves": [
    "int",
    "wis"
  ],
  "armour": [
    "light",
    "shield"
  ],
  "weapons": [
    "simple"
  ],
  "tools": "Herbalism Kit",
  "skills": {
    "choose": 2,
    "from": [
      "animal-handling",
      "arcana",
      "insight",
      "medicine",
      "nature",
      "perception",
      "religion",
      "survival"
    ]
  },
  "table": {
    "wild-shape": [
      null,
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
      3,
      3,
      4,
      4,
      4,
      4
    ]
  },
  "casting": {
    "ability": "wis",
    "kind": "prepared",
    "cantrips": [
      2,
      2,
      2,
      3,
      3,
      3,
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4
    ],
    "prepared": [
      4,
      5,
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
      "text": "Cast Druid spells using Wisdom; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "druidic",
      "name": "Druidic",
      "level": 1,
      "tier": "assist",
      "checked": true,
      "text": "You know Druidic and always have Speak with Animals prepared (applied); hidden messages are the DM's.",
      "grants": {
        "spells": [
          "speak-with-animals"
        ]
      }
    },
    {
      "id": "primal-order",
      "name": "Primal Order",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Choose Magician or Warden.",
      "options": [
        {
          "id": "magician",
          "name": "Magician",
          "tier": "auto",
          "text": "One extra Druid cantrip, and your Wisdom modifier (at least +1) added to Intelligence (Arcana or Nature) checks.",
          "grants": {
            "cantrips": 1,
            "modifiers": [
              {
                "on": "check",
                "op": "add",
                "value": {
                  "mod": "wis",
                  "min": 1
                },
                "scope": {
                  "skill": "arcana"
                }
              },
              {
                "on": "check",
                "op": "add",
                "value": {
                  "mod": "wis",
                  "min": 1
                },
                "scope": {
                  "skill": "nature"
                }
              }
            ]
          }
        },
        {
          "id": "warden",
          "name": "Warden",
          "tier": "auto",
          "text": "Proficiency with Martial weapons and training with Medium armor.",
          "grants": {
            "proficiency": {
              "weapons": [
                "martial"
              ],
              "armour": [
                "medium"
              ]
            }
          }
        }
      ]
    },
    {
      "id": "wild-shape",
      "name": "Wild Shape",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "As a Bonus Action, take the form of a Beast you know (CR and Fly Speed by level) for hours equal to half your Druid level. One use back on a Short Rest, all on a Long Rest. Forms are not built (spec R11): the engine spends the use; the DM runs the form.",
      "uses": {
        "max": {
          "column": "wild-shape"
        },
        "recharge": "long",
        "short": 1
      },
      "grants": {
        "action": {
          "time": "bonus",
          "target": {
            "self": true
          },
          "effects": [
            {
              "manual": "Wild Shape: the druid takes a known Beast form, with Temporary Hit Points equal to its Druid level. The DM runs the form."
            }
          ]
        }
      }
    },
    {
      "id": "wild-companion",
      "name": "Wild Companion",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "Spend a spell slot or Wild Shape use to cast Find Familiar without Material components; the familiar is Fey."
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
      "id": "wild-resurgence",
      "name": "Wild Resurgence",
      "level": 5,
      "tier": "manual",
      "checked": true,
      "text": "Once a turn with no Wild Shape uses, spend a slot for one; once per Long Rest, spend a Wild Shape use for a level 1 slot."
    },
    {
      "id": "elemental-fury",
      "name": "Elemental Fury",
      "level": 7,
      "tier": "manual",
      "checked": true,
      "text": "Choose Potent Spellcasting or Primal Strike.",
      "options": [
        {
          "id": "potent-spellcasting",
          "name": "Potent Spellcasting",
          "tier": "manual",
          "text": "Add your Wisdom modifier to damage from Druid cantrips. The DM adds it."
        },
        {
          "id": "primal-strike",
          "name": "Primal Strike",
          "tier": "manual",
          "text": "Once a turn when you hit with a weapon or a Beast form's attack, deal an extra 1d8 Cold, Fire, Lightning or Thunder (your choice). The DM applies it."
        }
      ]
    },
    {
      "id": "improved-elemental-fury",
      "name": "Improved Elemental Fury",
      "level": 15,
      "tier": "manual",
      "checked": true,
      "text": "Potent Spellcasting cantrips of 10 feet or more gain 300 feet of range; Primal Strike becomes 2d8."
    },
    {
      "id": "beast-spells",
      "name": "Beast Spells",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "Cast spells in Wild Shape, except those with costly or consumed Material components."
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
      "id": "archdruid",
      "name": "Archdruid",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Regain a Wild Shape use on Initiative when you have none; convert Wild Shape uses into a spell slot once per Long Rest; age slowly."
    }
  ],
  "subclass": {
    "id": "land",
    "name": "Circle of the Land",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Druids who guard ancient knowledge of the land.",
    "features": [
      {
        "id": "circle-of-the-land-spells",
        "name": "Circle of the Land Spells",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "After each Long Rest choose arid, polar, temperate or tropical land; that land's circle spells for your level are prepared. Enter them as prepared spells; the DM checks them."
      },
      {
        "id": "lands-aid",
        "name": "Land's Aid",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "As a Magic action, spend Wild Shape: creatures of your choice in a 10-foot Sphere within 60 feet make a Constitution save or take 2d6 Necrotic (half on success), and one creature there regains 2d6 Hit Points (3d6 at 10, 4d6 at 14). The engine spends the use; the DM applies it.",
        "grants": {
          "action": {
            "time": "action",
            "cost": {
              "resource": "wild-shape"
            },
            "target": {
              "self": true
            },
            "effects": [
              {
                "manual": "Land's Aid: creatures of your choice in a 10-foot Sphere within 60 feet make a Constitution save against your spell save DC, taking the damage on a failure and half on a success; one creature of your choice there regains the same dice in Hit Points."
              }
            ]
          }
        }
      },
      {
        "id": "natural-recovery",
        "name": "Natural Recovery",
        "level": 6,
        "tier": "assist",
        "checked": true,
        "text": "When you finish a Short Rest, recover spell slots with a combined level up to half your Druid level (rounded up), none of level 6 or higher, once per Long Rest (applied at the Short Rest). Casting one Circle spell without a slot once per Long Rest is the DM's.",
        "uses": {
          "max": 1,
          "recharge": "long"
        },
        "grants": {
          "recover": {
            "levels": "half-up",
            "max": 5
          }
        }
      },
      {
        "id": "natures-ward",
        "name": "Nature's Ward",
        "level": 10,
        "tier": "manual",
        "checked": true,
        "text": "Immune to Poisoned, and Resistance to the damage type of your current land (arid Fire, polar Cold, temperate Lightning, tropical Poison). The DM applies it."
      },
      {
        "id": "natures-sanctuary",
        "name": "Nature's Sanctuary",
        "level": 14,
        "tier": "manual",
        "checked": true,
        "text": "As a Magic action, spend Wild Shape for a 15-foot Cube of spectral trees within 120 feet for 1 minute: you and allies there have Half Cover and allies gain your Nature's Ward Resistance.",
        "grants": {
          "action": {
            "time": "action",
            "cost": {
              "resource": "wild-shape"
            },
            "target": {
              "self": true
            },
            "effects": [
              {
                "manual": "Nature's Sanctuary: a 15-foot Cube within 120 feet for 1 minute; you and your allies in it have Half Cover, and your allies gain your Nature's Ward Resistance. A Bonus Action moves it up to 60 feet."
              }
            ]
          }
        }
      }
    ]
  }
};
