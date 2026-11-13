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
  "multiclass": {
    "requires": {
      "all": [
        "wis"
      ]
    },
    "armour": [
      "light",
      "medium",
      "shield"
    ],
    "weapons": [],
    "caster": "full"
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
      "tier": "auto",
      "checked": true,
      "text": "As a Magic action, spend Channel Divinity on another creature within 30 feet: roll the Divine Spark dice + Wisdom modifier, and either it regains that many Hit Points or it makes a Constitution save, taking that much Radiant or Necrotic damage (your choice) on a failure and half on a success.",
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
          "modes": [
            {
              "id": "heal",
              "name": "Heal",
              "effects": [
                {
                  "heal": {
                    "column": "divine-spark"
                  },
                  "addMod": "wis"
                }
              ]
            },
            {
              "id": "radiant",
              "name": "Radiant",
              "effects": [
                {
                  "save": "con",
                  "half": true,
                  "onFail": [
                    {
                      "damage": {
                        "column": "divine-spark"
                      },
                      "addMod": "wis",
                      "type": "radiant"
                    }
                  ]
                }
              ]
            },
            {
              "id": "necrotic",
              "name": "Necrotic",
              "effects": [
                {
                  "save": "con",
                  "half": true,
                  "onFail": [
                    {
                      "damage": {
                        "column": "divine-spark"
                      },
                      "addMod": "wis",
                      "type": "necrotic"
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "turn-undead",
      "name": "Turn Undead",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "As a Magic action, spend Channel Divinity: each Undead within 30 feet makes a Wisdom save or is Frightened and Incapacitated for 1 minute; it ends on a creature that takes damage, and on all if you are Incapacitated or die (applied). That a turned creature flees from you, and choosing to spare an Undead, are the DM's.",
      "grants": {
        "action": {
          "time": "action",
          "cost": {
            "resource": "channel-divinity"
          },
          "duration": "1 minute",
          "endsWhenIncapacitated": true,
          "target": {
            "area": {
              "shape": "emanation",
              "size": 30,
              "exceptCaster": true,
              "types": [
                "undead"
              ]
            }
          },
          "effects": [
            {
              "save": "wis",
              "onFail": [
                {
                  "damage": {
                    "mod": "wis",
                    "min": 1,
                    "die": 8
                  },
                  "type": "radiant",
                  "with": "sear-undead"
                },
                {
                  "condition": "frightened",
                  "ends": {
                    "on": "damaged"
                  }
                },
                {
                  "condition": "incapacitated",
                  "ends": {
                    "on": "damaged"
                  }
                },
                {
                  "manual": "Turn Undead: a turned creature tries to move as far from the cleric as it can on its turns."
                }
              ]
            }
          ]
        }
      }
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
      "id": "sear-undead",
      "name": "Sear Undead",
      "level": 5,
      "tier": "auto",
      "checked": true,
      "text": "Turn Undead also deals Radiant damage, Wisdom modifier d8s (at least one), rolled once, to each Undead that fails the save; this damage does not end the turning."
    },
    {
      "id": "blessed-strikes",
      "name": "Blessed Strikes",
      "level": 7,
      "tier": "auto",
      "checked": true,
      "text": "Choose Divine Strike or Potent Spellcasting.",
      "options": [
        {
          "id": "divine-strike",
          "name": "Divine Strike",
          "tier": "auto",
          "text": "Once on each of your turns when you hit with a weapon attack, deal an extra 1d8 Necrotic or Radiant damage (2d8 from level 14); the engine picks the type that hurts the target most.",
          "grants": {
            "modifiers": [
              {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "byLevel": {
                    "7": "1d8",
                    "14": "2d8"
                  }
                },
                "types": [
                  "necrotic",
                  "radiant"
                ],
                "once": "turn",
                "when": [
                  "attack.hit",
                  "attack.weapon"
                ]
              }
            ]
          }
        },
        {
          "id": "potent-spellcasting",
          "name": "Potent Spellcasting",
          "tier": "auto",
          "text": "Add your Wisdom modifier to the damage your Cleric cantrips deal.",
          "grants": {
            "modifiers": [
              {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "mod": "wis"
                },
                "when": [
                  "spell.cantrip"
                ]
              }
            ]
          }
        }
      ]
    },
    {
      "id": "divine-intervention",
      "name": "Divine Intervention",
      "level": 10,
      "tier": "auto",
      "checked": true,
      "text": "Once per Long Rest, as a Magic action, cast any Cleric spell of level 5 or lower that is not a Reaction, without a slot or Material components and whether prepared or not (cast it through this feature).",
      "uses": {
        "max": 1,
        "recharge": "long"
      },
      "grants": {
        "freeCast": {
          "list": "cleric",
          "maxLevel": 5
        }
      }
    },
    {
      "id": "improved-blessed-strikes",
      "name": "Improved Blessed Strikes",
      "level": 14,
      "tier": "assist",
      "checked": true,
      "text": "Divine Strike becomes 2d8 (applied through Blessed Strikes). With Potent Spellcasting, when a Cleric cantrip deals damage you may give yourself or a creature within 60 feet Temporary Hit Points equal to twice your Wisdom modifier: the DM applies that."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Fate is suggested). Without one, nothing is added."
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
