// The Cleric class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const cleric = {
  "id": "cleric",
  "name": "Cleric",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A priest who channels divine power.",
  "hitDie": 8,
  "primary": [
    "wis"
  ],
  "saves": [
    "wis",
    "cha"
  ],
  "armour": [
    "light",
    "medium",
    "shield"
  ],
  "weapons": [
    "simple"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "history",
      "insight",
      "medicine",
      "persuasion",
      "religion"
    ]
  },
  "table": {
    "channel-divinity": [
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
      3,
      4,
      4,
      4
    ],
    "divine-spark": [
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "2d8",
      "2d8",
      "2d8",
      "2d8",
      "2d8",
      "2d8",
      "3d8",
      "3d8",
      "3d8",
      "3d8",
      "3d8",
      "4d8",
      "4d8",
      "4d8"
    ]
  },
  "casting": {
    "ability": "wis",
    "kind": "prepared",
    "cantrips": [
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      4,
      4,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
      5
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
      "text": "Cast Cleric spells using Wisdom; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "divine-order",
      "name": "Divine Order",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Choose Protector or Thaumaturge.",
      "options": [
        {
          "id": "protector",
          "name": "Protector",
          "tier": "auto",
          "text": "Proficiency with Martial weapons and training with Heavy armor.",
          "grants": {
            "proficiency": {
              "weapons": [
                "martial"
              ],
              "armour": [
                "heavy"
              ]
            }
          }
        },
        {
          "id": "thaumaturge",
          "name": "Thaumaturge",
          "tier": "auto",
          "text": "One extra Cleric cantrip, and your Wisdom modifier (at least +1) added to Intelligence (Arcana or Religion) checks.",
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
                  "skill": "religion"
                }
              }
            ]
          }
        }
      ]
    },
    {
      "id": "channel-divinity",
      "name": "Channel Divinity",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Uses of Channel Divinity (see the table) fuel Divine Spark, Turn Undead and your subclass's options; one comes back on a Short Rest, all on a Long Rest. Their save DC is your spell save DC.",
      "uses": {
        "max": {
          "column": "channel-divinity"
        },
        "recharge": "long",
        "short": 1
      }
    },
    {
      "id": "divine-spark",
      "name": "Divine Spark",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "As a Magic action, spend Channel Divinity on a creature within 30 feet: it regains or (Constitution save for half) takes Necrotic or Radiant damage of 1d8 + Wisdom modifier (more d8s at 7, 13, 18). The engine spends the use; the DM applies the choice.",
      "grants": {
        "action": {
          "time": "action",
          "cost": {
            "resource": "channel-divinity"
          },
          "target": {
            "creature": {
              "range": [
                30,
                30
              ]
            }
          },
          "effects": [
            {
              "manual": "Divine Spark: roll the Divine Spark dice + Wisdom modifier, and either heal the creature that much or have it make a Constitution save against your spell save DC, taking that much Necrotic or Radiant damage on a failure and half on a success."
            }
          ]
        }
      }
    },
    {
      "id": "turn-undead",
      "name": "Turn Undead",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "As a Magic action, spend Channel Divinity: Undead of your choice within 30 feet make a Wisdom save or are Frightened and Incapacitated for 1 minute, fleeing; it ends on damage. The engine spends the use; the DM applies it.",
      "grants": {
        "action": {
          "time": "action",
          "cost": {
            "resource": "channel-divinity"
          },
          "target": {
            "self": true
          },
          "effects": [
            {
              "manual": "Turn Undead: each Undead of your choice within 30 feet makes a Wisdom save against your spell save DC or is Frightened and Incapacitated for 1 minute (it ends early if the creature takes damage)."
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
      "id": "sear-undead",
      "name": "Sear Undead",
      "level": 5,
      "tier": "manual",
      "checked": true,
      "text": "Turn Undead also deals Radiant damage (Wisdom modifier d8s) to Undead that fail the save."
    },
    {
      "id": "blessed-strikes",
      "name": "Blessed Strikes",
      "level": 7,
      "tier": "manual",
      "checked": true,
      "text": "Choose Divine Strike or Potent Spellcasting.",
      "options": [
        {
          "id": "divine-strike",
          "name": "Divine Strike",
          "tier": "manual",
          "text": "Once a turn when you hit with a weapon attack, deal an extra 1d8 Necrotic or Radiant (your choice). The DM applies the choice."
        },
        {
          "id": "potent-spellcasting",
          "name": "Potent Spellcasting",
          "tier": "manual",
          "text": "Add your Wisdom modifier to damage from Cleric cantrips. The DM adds it."
        }
      ]
    },
    {
      "id": "divine-intervention",
      "name": "Divine Intervention",
      "level": 10,
      "tier": "manual",
      "checked": true,
      "text": "As a Magic action, cast a Cleric spell of level 5 or lower without a slot or Material components, once per Long Rest. The DM applies it.",
      "uses": {
        "max": 1,
        "recharge": "long"
      }
    },
    {
      "id": "improved-blessed-strikes",
      "name": "Improved Blessed Strikes",
      "level": 14,
      "tier": "manual",
      "checked": true,
      "text": "Divine Strike becomes 2d8; Potent Spellcasting cantrips can also give Temporary Hit Points equal to twice your Wisdom modifier."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "manual",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Fate is suggested). Feats are applied by the DM."
    },
    {
      "id": "greater-divine-intervention",
      "name": "Greater Divine Intervention",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Divine Intervention can cast Wish; then it can't be used again for 2d4 Long Rests."
    }
  ],
  "subclass": {
    "id": "life",
    "name": "Life Domain",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Clerics of healing and endurance.",
    "spells": {
      "3": [
        "aid",
        "bless",
        "cure-wounds",
        "lesser-restoration"
      ],
      "5": [
        "mass-healing-word",
        "revivify"
      ],
      "7": [
        "aura-of-life",
        "death-ward"
      ],
      "9": [
        "greater-restoration",
        "mass-cure-wounds"
      ]
    },
    "features": [
      {
        "id": "disciple-of-life",
        "name": "Disciple of Life",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "A spell cast with a slot that restores Hit Points restores 2 + the slot's level more. The DM adds it."
      },
      {
        "id": "preserve-life",
        "name": "Preserve Life",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "As a Magic action, spend Channel Divinity to share five times your Cleric level in Hit Points among Bloodied creatures within 30 feet, none above half its maximum. The engine spends the use; the DM shares them out.",
        "grants": {
          "action": {
            "time": "action",
            "cost": {
              "resource": "channel-divinity"
            },
            "target": {
              "self": true
            },
            "effects": [
              {
                "manual": "Preserve Life: share out Hit Points equal to five times your Cleric level among Bloodied creatures within 30 feet, none above half its Hit Point maximum."
              }
            ]
          }
        }
      },
      {
        "id": "blessed-healer",
        "name": "Blessed Healer",
        "level": 6,
        "tier": "manual",
        "checked": true,
        "text": "After casting a healing spell with a slot on others, regain 2 + the slot's level Hit Points."
      },
      {
        "id": "supreme-healing",
        "name": "Supreme Healing",
        "level": 17,
        "tier": "manual",
        "checked": true,
        "text": "Healing dice from spells and Channel Divinity use their highest number."
      }
    ]
  }
};
