// The Warlock class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const warlock = {
  "id": "warlock",
  "name": "Warlock",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A spellcaster who bargained with a patron for power.",
  "hitDie": 8,
  "primary": [
    "cha"
  ],
  "saves": [
    "wis",
    "cha"
  ],
  "armour": [
    "light"
  ],
  "weapons": [
    "simple"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "arcana",
      "deception",
      "history",
      "intimidation",
      "investigation",
      "nature",
      "religion"
    ]
  },
  "table": {
    "invocations": [
      1,
      3,
      3,
      3,
      5,
      5,
      6,
      6,
      7,
      7,
      7,
      8,
      8,
      8,
      9,
      9,
      9,
      10,
      10,
      10
    ]
  },
  "casting": {
    "ability": "cha",
    "kind": "pact",
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
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      10,
      11,
      11,
      12,
      12,
      13,
      13,
      14,
      14,
      15,
      15
    ],
    "slots": [
      1,
      2,
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
      4,
      4,
      4,
      4
    ],
    "slotLevel": [
      1,
      1,
      2,
      2,
      3,
      3,
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
      5,
      5
    ]
  },
  "multiclass": {
    "requires": {
      "all": [
        "cha"
      ]
    },
    "armour": [
      "light"
    ],
    "weapons": [],
    "caster": "pact"
  },
  "features": [
    {
      "id": "eldritch-invocations",
      "name": "Eldritch Invocations",
      "level": 1,
      "tier": "assist",
      "checked": true,
      "text": "Know so many Eldritch Invocations (the Invocations column), each once, with its prerequisites, chosen on the sheet (choices: a list). Those the engine can apply are applied; each says what is left to the DM. An invocation you may take more than once is entered once per cantrip; Lessons of the First Ones once only. Replacing one on gaining a level is a sheet edit.",
      "pick": {
        "column": "invocations"
      },
      "options": [
        {
          "id": "armor-of-shadows",
          "name": "Armor of Shadows",
          "tier": "auto",
          "text": "Cast Mage Armor on yourself without a spell slot, at will (cast with via).",
          "grants": {
            "freeCast": {
              "spells": [
                "mage-armor"
              ],
              "atWill": true,
              "self": true
            }
          }
        },
        {
          "id": "agonizing-blast-eldritch-blast",
          "name": "Agonizing Blast (Eldritch Blast)",
          "tier": "auto",
          "text": "Add your Charisma modifier to the damage rolls of Eldritch Blast. Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "eldritch-blast"
          },
          "grants": {
            "modifiers": [
              {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "mod": "cha"
                },
                "spell": "eldritch-blast"
              }
            ]
          }
        },
        {
          "id": "agonizing-blast-chill-touch",
          "name": "Agonizing Blast (Chill Touch)",
          "tier": "auto",
          "text": "Add your Charisma modifier to the damage rolls of Chill Touch. Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "chill-touch"
          },
          "grants": {
            "modifiers": [
              {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "mod": "cha"
                },
                "spell": "chill-touch"
              }
            ]
          }
        },
        {
          "id": "agonizing-blast-poison-spray",
          "name": "Agonizing Blast (Poison Spray)",
          "tier": "auto",
          "text": "Add your Charisma modifier to the damage rolls of Poison Spray. Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "poison-spray"
          },
          "grants": {
            "modifiers": [
              {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "mod": "cha"
                },
                "spell": "poison-spray"
              }
            ]
          }
        },
        {
          "id": "agonizing-blast-true-strike",
          "name": "Agonizing Blast (True Strike)",
          "tier": "manual",
          "text": "Add your Charisma modifier to True Strike's damage. Needs Warlock level 2 and the cantrip. True Strike is the DM's (the engine does not resolve it), so this is too.",
          "requires": {
            "level": 2,
            "spell": "true-strike"
          }
        },
        {
          "id": "ascendant-step",
          "name": "Ascendant Step",
          "tier": "auto",
          "text": "Cast Levitate on yourself without a spell slot, at will. Needs Warlock level 5.",
          "requires": {
            "level": 5
          },
          "grants": {
            "freeCast": {
              "spells": [
                "levitate"
              ],
              "atWill": true,
              "self": true
            }
          }
        },
        {
          "id": "devils-sight",
          "name": "Devil's Sight",
          "tier": "manual",
          "text": "See normally in Dim Light and Darkness, magical or not, within 120 feet. Needs Warlock level 2. The engine has no such sense; the DM applies it.",
          "requires": {
            "level": 2
          }
        },
        {
          "id": "devouring-blade",
          "name": "Devouring Blade",
          "tier": "manual",
          "text": "Thirsting Blade's Extra Attack gives two extra attacks. Needs Warlock level 12 and Thirsting Blade. The pact weapon is not built; the DM applies it.",
          "requires": {
            "level": 12,
            "option": "thirsting-blade"
          }
        },
        {
          "id": "eldritch-mind",
          "name": "Eldritch Mind",
          "tier": "auto",
          "text": "Advantage on Constitution saves to keep Concentration.",
          "grants": {
            "modifiers": [
              {
                "on": "concentration",
                "op": "advantage"
              }
            ]
          }
        },
        {
          "id": "eldritch-smite",
          "name": "Eldritch Smite",
          "tier": "manual",
          "text": "Once a turn on a hit with the pact weapon, spend a Pact Magic slot for 1d8 Force damage plus 1d8 per slot level, and knock a Huge or smaller target Prone. Needs Warlock level 5 and Pact of the Blade. The pact weapon is not built; the DM applies it.",
          "requires": {
            "level": 5,
            "option": "pact-of-the-blade"
          }
        },
        {
          "id": "eldritch-spear-eldritch-blast",
          "name": "Eldritch Spear (Eldritch Blast)",
          "tier": "auto",
          "text": "Eldritch Blast's range is 30 feet longer per Warlock level. Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "eldritch-blast"
          },
          "grants": {
            "spellRange": {
              "spell": "eldritch-blast",
              "perLevel": 30
            }
          }
        },
        {
          "id": "eldritch-spear-poison-spray",
          "name": "Eldritch Spear (Poison Spray)",
          "tier": "auto",
          "text": "Poison Spray's range is 30 feet longer per Warlock level. Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "poison-spray"
          },
          "grants": {
            "spellRange": {
              "spell": "poison-spray",
              "perLevel": 30
            }
          }
        },
        {
          "id": "fiendish-vigor",
          "name": "Fiendish Vigor",
          "tier": "auto",
          "text": "Cast False Life on yourself without a spell slot, at will, taking the highest number on its dice instead of rolling. Needs Warlock level 2.",
          "requires": {
            "level": 2
          },
          "grants": {
            "freeCast": {
              "spells": [
                "false-life"
              ],
              "atWill": true,
              "self": true,
              "maxTemp": true
            }
          }
        },
        {
          "id": "gaze-of-two-minds",
          "name": "Gaze of Two Minds",
          "tier": "manual",
          "text": "As a Bonus Action, touch a willing creature and perceive through its senses until the end of your next turn, kept up with a Bonus Action each turn; you may cast spells from its space within 60 feet. Needs Warlock level 5. The DM applies it.",
          "requires": {
            "level": 5
          }
        },
        {
          "id": "gift-of-the-depths",
          "name": "Gift of the Depths",
          "tier": "assist",
          "text": "A Swim Speed equal to your Speed (applied) and breathing underwater (the DM applies it, as the engine does not track breath), and Water Breathing once per Long Rest without a slot. Needs Warlock level 5.",
          "requires": {
            "level": 5
          },
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "speeds": [
              "swim"
            ],
            "freeCast": {
              "spells": [
                "water-breathing"
              ]
            }
          }
        },
        {
          "id": "gift-of-the-protectors",
          "name": "Gift of the Protectors",
          "tier": "manual",
          "text": "Creatures who write their names in your Book of Shadows (up to your Charisma modifier) drop to 1 Hit Point instead of 0 once per Long Rest among them. Needs Warlock level 9 and Pact of the Tome. The DM applies it.",
          "requires": {
            "level": 9,
            "option": "pact-of-the-tome"
          }
        },
        {
          "id": "investment-of-the-chain-master",
          "name": "Investment of the Chain Master",
          "tier": "manual",
          "text": "Your familiar from Find Familiar gains a 40-foot Fly or Swim Speed, attacks as your Bonus Action, may deal Necrotic or Radiant damage, uses your spell save DC, and can be given Resistance with your Reaction. Needs Warlock level 5 and Pact of the Chain. Familiars are not built; the DM applies it.",
          "requires": {
            "level": 5,
            "option": "pact-of-the-chain"
          }
        },
        {
          "id": "lessons-of-the-first-ones",
          "name": "Lessons of the First Ones",
          "tier": "manual",
          "text": "Gain an Origin feat. Needs Warlock level 2. The sheet has no place for it yet; the DM applies the feat.",
          "requires": {
            "level": 2
          }
        },
        {
          "id": "lifedrinker",
          "name": "Lifedrinker",
          "tier": "manual",
          "text": "Once a turn on a hit with the pact weapon, 1d6 more Necrotic, Psychic or Radiant damage, and you may spend a Hit Point Die to heal its roll plus your Constitution modifier (at least 1). Needs Warlock level 9 and Pact of the Blade. The DM applies it.",
          "requires": {
            "level": 9,
            "option": "pact-of-the-blade"
          }
        },
        {
          "id": "mask-of-many-faces",
          "name": "Mask of Many Faces",
          "tier": "auto",
          "text": "Cast Disguise Self without a spell slot, at will. Needs Warlock level 2.",
          "requires": {
            "level": 2
          },
          "grants": {
            "freeCast": {
              "spells": [
                "disguise-self"
              ],
              "atWill": true
            }
          }
        },
        {
          "id": "master-of-myriad-forms",
          "name": "Master of Myriad Forms",
          "tier": "auto",
          "text": "Cast Alter Self without a spell slot, at will. Needs Warlock level 5.",
          "requires": {
            "level": 5
          },
          "grants": {
            "freeCast": {
              "spells": [
                "alter-self"
              ],
              "atWill": true
            }
          }
        },
        {
          "id": "misty-visions",
          "name": "Misty Visions",
          "tier": "auto",
          "text": "Cast Silent Image without a spell slot, at will. Needs Warlock level 2.",
          "requires": {
            "level": 2
          },
          "grants": {
            "freeCast": {
              "spells": [
                "silent-image"
              ],
              "atWill": true
            }
          }
        },
        {
          "id": "one-with-shadows",
          "name": "One with Shadows",
          "tier": "auto",
          "text": "While in Dim Light or Darkness, cast Invisibility on yourself without a spell slot, at will. Needs Warlock level 5.",
          "requires": {
            "level": 5
          },
          "grants": {
            "freeCast": {
              "spells": [
                "invisibility"
              ],
              "atWill": true,
              "self": true,
              "dark": true
            }
          }
        },
        {
          "id": "otherworldly-leap",
          "name": "Otherworldly Leap",
          "tier": "auto",
          "text": "Cast Jump on yourself without a spell slot, at will. Needs Warlock level 2.",
          "requires": {
            "level": 2
          },
          "grants": {
            "freeCast": {
              "spells": [
                "jump"
              ],
              "atWill": true,
              "self": true
            }
          }
        },
        {
          "id": "pact-of-the-blade",
          "name": "Pact of the Blade",
          "tier": "manual",
          "text": "As a Bonus Action, conjure or bond with a melee weapon: proficiency with it, a Spellcasting Focus, Charisma for its attack and damage rolls, and Necrotic, Psychic or Radiant damage if you like. The pact weapon is not built; the DM applies it."
        },
        {
          "id": "pact-of-the-chain",
          "name": "Pact of the Chain",
          "tier": "assist",
          "text": "You know Find Familiar and cast it as a Magic action without a spell slot (applied). Its special forms and giving up one of your attacks for the familiar to attack are the DM's.",
          "grants": {
            "spells": [
              "find-familiar"
            ],
            "freeCast": {
              "spells": [
                "find-familiar"
              ],
              "atWill": true,
              "time": "action"
            }
          }
        },
        {
          "id": "pact-of-the-tome",
          "name": "Pact of the Tome",
          "tier": "manual",
          "text": "A Book of Shadows appears at the end of each rest with three cantrips and two level 1 Ritual spells from any list, prepared while you carry it. Enter those spells on the sheet; the DM checks them."
        },
        {
          "id": "repelling-blast-eldritch-blast",
          "name": "Repelling Blast (Eldritch Blast)",
          "tier": "auto",
          "text": "When Eldritch Blast hits a Large or smaller creature, you can push it up to 10 feet straight away (cast with repel). Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "eldritch-blast"
          },
          "grants": {
            "repel": {
              "spell": "eldritch-blast",
              "feet": 10
            }
          }
        },
        {
          "id": "repelling-blast-chill-touch",
          "name": "Repelling Blast (Chill Touch)",
          "tier": "auto",
          "text": "When Chill Touch hits a Large or smaller creature, you can push it up to 10 feet straight away (cast with repel). Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "chill-touch"
          },
          "grants": {
            "repel": {
              "spell": "chill-touch",
              "feet": 10
            }
          }
        },
        {
          "id": "repelling-blast-poison-spray",
          "name": "Repelling Blast (Poison Spray)",
          "tier": "auto",
          "text": "When Poison Spray hits a Large or smaller creature, you can push it up to 10 feet straight away (cast with repel). Needs Warlock level 2 and the cantrip.",
          "requires": {
            "level": 2,
            "spell": "poison-spray"
          },
          "grants": {
            "repel": {
              "spell": "poison-spray",
              "feet": 10
            }
          }
        },
        {
          "id": "repelling-blast-true-strike",
          "name": "Repelling Blast (True Strike)",
          "tier": "manual",
          "text": "When True Strike hits a Large or smaller creature, you can push it up to 10 feet straight away. Needs Warlock level 2 and the cantrip. True Strike is the DM's (the engine does not resolve it), so this is too.",
          "requires": {
            "level": 2,
            "spell": "true-strike"
          }
        },
        {
          "id": "thirsting-blade",
          "name": "Thirsting Blade",
          "tier": "manual",
          "text": "Extra Attack with your pact weapon only. Needs Warlock level 5 and Pact of the Blade. The pact weapon is not built; the DM applies it.",
          "requires": {
            "level": 5,
            "option": "pact-of-the-blade"
          }
        },
        {
          "id": "visions-of-distant-realms",
          "name": "Visions of Distant Realms",
          "tier": "auto",
          "text": "Cast Arcane Eye without a spell slot, at will. Needs Warlock level 9.",
          "requires": {
            "level": 9
          },
          "grants": {
            "freeCast": {
              "spells": [
                "arcane-eye"
              ],
              "atWill": true
            }
          }
        },
        {
          "id": "whispers-of-the-grave",
          "name": "Whispers of the Grave",
          "tier": "auto",
          "text": "Cast Speak with Dead without a spell slot, at will. Needs Warlock level 7.",
          "requires": {
            "level": 7
          },
          "grants": {
            "freeCast": {
              "spells": [
                "speak-with-dead"
              ],
              "atWill": true
            }
          }
        },
        {
          "id": "witch-sight",
          "name": "Witch Sight",
          "tier": "auto",
          "text": "Truesight with a range of 30 feet. Needs Warlock level 15.",
          "requires": {
            "level": 15
          },
          "grants": {
            "senses": {
              "truesight": 30
            }
          }
        }
      ]
    },
    {
      "id": "pact-magic",
      "name": "Pact Magic",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Cast Warlock spells with Charisma. All Pact Magic slots are of one level (see the table) and come back on a Short or Long Rest."
    },
    {
      "id": "magical-cunning",
      "name": "Magical Cunning",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "After a 1-minute rite, regain up to half your Pact Magic slots (rounded up), once per Long Rest. The DM restores them.",
      "uses": {
        "max": 1,
        "recharge": "long"
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
      "id": "contact-patron",
      "name": "Contact Patron",
      "level": 9,
      "tier": "auto",
      "checked": true,
      "text": "Contact Other Plane is always prepared; once per Long Rest you can cast it without a spell slot (cast with via contact-patron), succeeding on its save.",
      "grants": {
        "spells": [
          "contact-other-plane"
        ],
        "freeCast": {
          "spells": [
            "contact-other-plane"
          ],
          "sureSave": true
        }
      },
      "uses": {
        "max": 1,
        "recharge": "long"
      }
    },
    {
      "id": "mystic-arcanum",
      "name": "Mystic Arcanum (level 6 spell)",
      "level": 11,
      "tier": "auto",
      "checked": true,
      "text": "Choose a level 6 Warlock spell on the sheet: you cast it once per Long Rest without a spell slot (cast with via, the option's id). Replacing it on gaining a level is a sheet edit.",
      "options": [
        {
          "id": "circle-of-death",
          "name": "Circle of Death",
          "tier": "auto",
          "text": "Cast Circle of Death once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "circle-of-death"
            ],
            "freeCast": {
              "spells": [
                "circle-of-death"
              ]
            }
          }
        },
        {
          "id": "create-undead",
          "name": "Create Undead",
          "tier": "auto",
          "text": "Cast Create Undead once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "create-undead"
            ],
            "freeCast": {
              "spells": [
                "create-undead"
              ]
            }
          }
        },
        {
          "id": "eyebite",
          "name": "Eyebite",
          "tier": "auto",
          "text": "Cast Eyebite once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "eyebite"
            ],
            "freeCast": {
              "spells": [
                "eyebite"
              ]
            }
          }
        },
        {
          "id": "true-seeing",
          "name": "True Seeing",
          "tier": "auto",
          "text": "Cast True Seeing once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "true-seeing"
            ],
            "freeCast": {
              "spells": [
                "true-seeing"
              ]
            }
          }
        }
      ]
    },
    {
      "id": "mystic-arcanum-7",
      "name": "Mystic Arcanum (level 7 spell)",
      "level": 13,
      "tier": "auto",
      "checked": true,
      "text": "Choose a level 7 Warlock spell on the sheet: you cast it once per Long Rest without a spell slot (cast with via, the option's id). Replacing it on gaining a level is a sheet edit.",
      "options": [
        {
          "id": "etherealness",
          "name": "Etherealness",
          "tier": "auto",
          "text": "Cast Etherealness once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "etherealness"
            ],
            "freeCast": {
              "spells": [
                "etherealness"
              ]
            }
          }
        },
        {
          "id": "finger-of-death",
          "name": "Finger of Death",
          "tier": "auto",
          "text": "Cast Finger of Death once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "finger-of-death"
            ],
            "freeCast": {
              "spells": [
                "finger-of-death"
              ]
            }
          }
        },
        {
          "id": "forcecage",
          "name": "Forcecage",
          "tier": "auto",
          "text": "Cast Forcecage once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "forcecage"
            ],
            "freeCast": {
              "spells": [
                "forcecage"
              ]
            }
          }
        },
        {
          "id": "plane-shift",
          "name": "Plane Shift",
          "tier": "auto",
          "text": "Cast Plane Shift once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "plane-shift"
            ],
            "freeCast": {
              "spells": [
                "plane-shift"
              ]
            }
          }
        }
      ]
    },
    {
      "id": "mystic-arcanum-8",
      "name": "Mystic Arcanum (level 8 spell)",
      "level": 15,
      "tier": "auto",
      "checked": true,
      "text": "Choose a level 8 Warlock spell on the sheet: you cast it once per Long Rest without a spell slot (cast with via, the option's id). Replacing it on gaining a level is a sheet edit.",
      "options": [
        {
          "id": "befuddlement",
          "name": "Befuddlement",
          "tier": "auto",
          "text": "Cast Befuddlement once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "befuddlement"
            ],
            "freeCast": {
              "spells": [
                "befuddlement"
              ]
            }
          }
        },
        {
          "id": "demiplane",
          "name": "Demiplane",
          "tier": "auto",
          "text": "Cast Demiplane once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "demiplane"
            ],
            "freeCast": {
              "spells": [
                "demiplane"
              ]
            }
          }
        },
        {
          "id": "dominate-monster",
          "name": "Dominate Monster",
          "tier": "auto",
          "text": "Cast Dominate Monster once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "dominate-monster"
            ],
            "freeCast": {
              "spells": [
                "dominate-monster"
              ]
            }
          }
        },
        {
          "id": "glibness",
          "name": "Glibness",
          "tier": "auto",
          "text": "Cast Glibness once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "glibness"
            ],
            "freeCast": {
              "spells": [
                "glibness"
              ]
            }
          }
        },
        {
          "id": "power-word-stun",
          "name": "Power Word Stun",
          "tier": "auto",
          "text": "Cast Power Word Stun once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "power-word-stun"
            ],
            "freeCast": {
              "spells": [
                "power-word-stun"
              ]
            }
          }
        }
      ]
    },
    {
      "id": "mystic-arcanum-9",
      "name": "Mystic Arcanum (level 9 spell)",
      "level": 17,
      "tier": "auto",
      "checked": true,
      "text": "Choose a level 9 Warlock spell on the sheet: you cast it once per Long Rest without a spell slot (cast with via, the option's id). Replacing it on gaining a level is a sheet edit.",
      "options": [
        {
          "id": "astral-projection",
          "name": "Astral Projection",
          "tier": "auto",
          "text": "Cast Astral Projection once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "astral-projection"
            ],
            "freeCast": {
              "spells": [
                "astral-projection"
              ]
            }
          }
        },
        {
          "id": "foresight",
          "name": "Foresight",
          "tier": "auto",
          "text": "Cast Foresight once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "foresight"
            ],
            "freeCast": {
              "spells": [
                "foresight"
              ]
            }
          }
        },
        {
          "id": "gate",
          "name": "Gate",
          "tier": "auto",
          "text": "Cast Gate once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "gate"
            ],
            "freeCast": {
              "spells": [
                "gate"
              ]
            }
          }
        },
        {
          "id": "imprisonment",
          "name": "Imprisonment",
          "tier": "auto",
          "text": "Cast Imprisonment once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "imprisonment"
            ],
            "freeCast": {
              "spells": [
                "imprisonment"
              ]
            }
          }
        },
        {
          "id": "power-word-kill",
          "name": "Power Word Kill",
          "tier": "auto",
          "text": "Cast Power Word Kill once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "power-word-kill"
            ],
            "freeCast": {
              "spells": [
                "power-word-kill"
              ]
            }
          }
        },
        {
          "id": "true-polymorph",
          "name": "True Polymorph",
          "tier": "auto",
          "text": "Cast True Polymorph once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "true-polymorph"
            ],
            "freeCast": {
              "spells": [
                "true-polymorph"
              ]
            }
          }
        },
        {
          "id": "weird",
          "name": "Weird",
          "tier": "auto",
          "text": "Cast Weird once per Long Rest without a spell slot.",
          "uses": {
            "max": 1,
            "recharge": "long"
          },
          "grants": {
            "spells": [
              "weird"
            ],
            "freeCast": {
              "spells": [
                "weird"
              ]
            }
          }
        }
      ]
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
      "id": "eldritch-master",
      "name": "Eldritch Master",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Magical Cunning restores all your Pact Magic slots."
    }
  ],
  "subclass": {
    "id": "fiend",
    "name": "Fiend Patron",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Warlocks who bargain with the Lower Planes.",
    "spells": {
      "3": [
        "burning-hands",
        "command",
        "scorching-ray",
        "suggestion"
      ],
      "5": [
        "fireball",
        "stinking-cloud"
      ],
      "7": [
        "fire-shield",
        "wall-of-fire"
      ],
      "9": [
        "geas",
        "insect-plague"
      ]
    },
    "features": [
      {
        "id": "dark-ones-blessing",
        "name": "Dark One's Blessing",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "When you (or someone within 10 feet of you) reduce an enemy to 0 Hit Points, gain Charisma modifier + Warlock level Temporary Hit Points (at least 1). The DM applies it."
      },
      {
        "id": "dark-ones-own-luck",
        "name": "Dark One's Own Luck",
        "level": 6,
        "tier": "manual",
        "checked": true,
        "text": "Add 1d10 to an ability check or saving throw after seeing the roll, Charisma modifier times per Long Rest. The engine cannot add after a roll; spending the use shows it to the DM.",
        "uses": {
          "max": {
            "mod": "cha",
            "min": 1
          },
          "recharge": "long"
        }
      },
      {
        "id": "fiendish-resilience",
        "name": "Fiendish Resilience",
        "level": 10,
        "tier": "auto",
        "checked": true,
        "text": "Resistance to one damage type other than Force, chosen on the sheet; after a Short or Long Rest you may choose another there.",
        "options": [
          {
            "id": "acid",
            "name": "Acid",
            "tier": "auto",
            "text": "Resistance to Acid damage.",
            "grants": {
              "resist": [
                "acid"
              ]
            }
          },
          {
            "id": "bludgeoning",
            "name": "Bludgeoning",
            "tier": "auto",
            "text": "Resistance to Bludgeoning damage.",
            "grants": {
              "resist": [
                "bludgeoning"
              ]
            }
          },
          {
            "id": "cold",
            "name": "Cold",
            "tier": "auto",
            "text": "Resistance to Cold damage.",
            "grants": {
              "resist": [
                "cold"
              ]
            }
          },
          {
            "id": "fire",
            "name": "Fire",
            "tier": "auto",
            "text": "Resistance to Fire damage.",
            "grants": {
              "resist": [
                "fire"
              ]
            }
          },
          {
            "id": "lightning",
            "name": "Lightning",
            "tier": "auto",
            "text": "Resistance to Lightning damage.",
            "grants": {
              "resist": [
                "lightning"
              ]
            }
          },
          {
            "id": "necrotic",
            "name": "Necrotic",
            "tier": "auto",
            "text": "Resistance to Necrotic damage.",
            "grants": {
              "resist": [
                "necrotic"
              ]
            }
          },
          {
            "id": "piercing",
            "name": "Piercing",
            "tier": "auto",
            "text": "Resistance to Piercing damage.",
            "grants": {
              "resist": [
                "piercing"
              ]
            }
          },
          {
            "id": "poison",
            "name": "Poison",
            "tier": "auto",
            "text": "Resistance to Poison damage.",
            "grants": {
              "resist": [
                "poison"
              ]
            }
          },
          {
            "id": "psychic",
            "name": "Psychic",
            "tier": "auto",
            "text": "Resistance to Psychic damage.",
            "grants": {
              "resist": [
                "psychic"
              ]
            }
          },
          {
            "id": "radiant",
            "name": "Radiant",
            "tier": "auto",
            "text": "Resistance to Radiant damage.",
            "grants": {
              "resist": [
                "radiant"
              ]
            }
          },
          {
            "id": "slashing",
            "name": "Slashing",
            "tier": "auto",
            "text": "Resistance to Slashing damage.",
            "grants": {
              "resist": [
                "slashing"
              ]
            }
          },
          {
            "id": "thunder",
            "name": "Thunder",
            "tier": "auto",
            "text": "Resistance to Thunder damage.",
            "grants": {
              "resist": [
                "thunder"
              ]
            }
          }
        ]
      },
      {
        "id": "hurl-through-hell",
        "name": "Hurl Through Hell",
        "level": 14,
        "tier": "assist",
        "checked": true,
        "text": "Once a turn, right after you hit a creature with an attack roll (use it on that creature, no action), it makes a Charisma save against your spell save DC or takes 8d10 Psychic damage (none if it is a Fiend) and is Incapacitated until the end of your next turn. Once per Long Rest; with the use spent, a Pact Magic slot restores it (send the slot). That it vanishes meanwhile and comes back is the DM's.",
        "uses": {
          "max": 1,
          "recharge": "long"
        },
        "grants": {
          "action": {
            "time": "free",
            "after": "hit",
            "orSlot": true,
            "target": {
              "creature": {
                "range": [
                  600,
                  600
                ]
              }
            },
            "effects": [
              {
                "save": "cha",
                "onFail": [
                  {
                    "damage": "8d10",
                    "type": "psychic",
                    "when": [
                      "target.notFiend"
                    ]
                  },
                  {
                    "condition": "incapacitated",
                    "ends": {
                      "on": "turnEnd",
                      "of": "source"
                    }
                  },
                  {
                    "manual": "Hurl Through Hell: the target vanishes through the Lower Planes until the end of the warlock's next turn, then returns to the space it left or the nearest unoccupied one. The engine leaves it where it is, Incapacitated; the DM keeps it out of reach and sight meanwhile."
                  }
                ]
              }
            ]
          }
        }
      }
    ]
  }
};
