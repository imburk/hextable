// The Monk class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const monk = {
  "id": "monk",
  "name": "Monk",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A martial artist who channels inner Focus.",
  "hitDie": 8,
  "primary": [
    "dex",
    "wis"
  ],
  "saves": [
    "str",
    "dex"
  ],
  "armour": [],
  "weapons": [
    "simple",
    "martial-light"
  ],
  "tools": "One type of Artisan's Tools or Musical Instrument",
  "skills": {
    "choose": 2,
    "from": [
      "acrobatics",
      "athletics",
      "history",
      "insight",
      "religion",
      "stealth"
    ]
  },
  "table": {
    "martial-arts": [
      "1d6",
      "1d6",
      "1d6",
      "1d6",
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "1d8",
      "1d10",
      "1d10",
      "1d10",
      "1d10",
      "1d10",
      "1d10",
      "1d12",
      "1d12",
      "1d12",
      "1d12"
    ],
    "focus-points": [
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
    ],
    "unarmored-movement": [
      null,
      10,
      10,
      10,
      10,
      15,
      15,
      15,
      15,
      20,
      20,
      20,
      20,
      25,
      25,
      25,
      25,
      30,
      30,
      30
    ],
    "flurry": [
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
      3,
      3
    ]
  },
  "casting": null,
  "multiclass": {
    "requires": {
      "all": [
        "dex",
        "wis"
      ]
    },
    "armour": [],
    "weapons": [],
    "caster": null
  },
  "features": [
    {
      "id": "martial-arts",
      "name": "Martial Arts",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Unarmed or with only Monk weapons, and without armor or Shield: an Unarmed Strike as a Bonus Action, the Martial Arts die in place of normal damage, and Dexterity instead of Strength for attack and damage.",
      "grants": {
        "martialArts": {
          "column": "martial-arts"
        }
      }
    },
    {
      "id": "unarmored-defense",
      "name": "Unarmored Defense",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Without armor or a Shield, your base Armor Class is 10 + Dexterity and Wisdom modifiers.",
      "grants": {
        "ac": {
          "base": 10,
          "abilities": [
            "dex",
            "wis"
          ],
          "shield": false
        }
      }
    },
    {
      "id": "monks-focus",
      "name": "Monk's Focus",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Focus Points (see the table) fuel Flurry of Blows, Patient Defense and Step of the Wind; all come back on a Short or Long Rest. Their save DC is 8 + Wisdom modifier + Proficiency Bonus.",
      "uses": {
        "max": {
          "column": "focus-points"
        },
        "recharge": "short"
      }
    },
    {
      "id": "flurry-of-blows",
      "name": "Flurry of Blows",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Spend 1 Focus Point to make two Unarmed Strikes as a Bonus Action (three from level 10).",
      "grants": {
        "action": {
          "time": "bonus",
          "cost": {
            "resource": "monks-focus"
          },
          "gain": {
            "attacks": {
              "with": "unarmed-strike",
              "n": {
                "column": "flurry"
              }
            }
          }
        }
      }
    },
    {
      "id": "patient-defense",
      "name": "Patient Defense",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Take the Disengage action as a Bonus Action (disengage with bonus), or spend 1 Focus Point to take Disengage and Dodge as a Bonus Action (the feature); from level 10 that also gives two rolls of your Martial Arts die in Temporary Hit Points.",
      "grants": {
        "bonusActs": [
          "disengage"
        ],
        "action": {
          "time": "bonus",
          "cost": {
            "resource": "monks-focus"
          },
          "target": {
            "self": true
          },
          "acts": [
            "disengage",
            "dodge"
          ],
          "effects": [
            {
              "tempHp": {
                "byLevel": {
                  "10": "2d8",
                  "11": "2d10",
                  "17": "2d12"
                }
              },
              "with": "heightened-focus"
            }
          ]
        }
      }
    },
    {
      "id": "step-of-the-wind",
      "name": "Step of the Wind",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Take the Dash action as a Bonus Action (dash with bonus), or spend 1 Focus Point to take Disengage and Dash as a Bonus Action (the feature). Your doubled jump distance, and from level 10 the willing creature you carry, are the DM's.",
      "grants": {
        "bonusActs": [
          "dash"
        ],
        "action": {
          "time": "bonus",
          "cost": {
            "resource": "monks-focus"
          },
          "target": {
            "self": true
          },
          "acts": [
            "disengage",
            "dash"
          ],
          "effects": [
            {
              "manual": "Step of the Wind: the monk's jump distance is doubled for the turn. The engine does not model jumps; the DM applies it."
            },
            {
              "manual": "Heightened Focus: the monk may take a willing Large or smaller creature within 5 feet along until the end of its turn, without that creature provoking Opportunity Attacks. The DM moves it.",
              "with": "heightened-focus"
            }
          ]
        }
      }
    },
    {
      "id": "unarmored-movement",
      "name": "Unarmored Movement",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Speed increases (see the table) while not wearing armor or a Shield.",
      "grants": {
        "speed": {
          "add": {
            "column": "unarmored-movement"
          },
          "unless": "armour"
        }
      }
    },
    {
      "id": "uncanny-metabolism",
      "name": "Uncanny Metabolism",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "When you roll Initiative, regain all spent Focus Points and Hit Points equal to your Monk level plus a roll of your Martial Arts die, once per Long Rest. Used when it gives something back, by standing instruction (always or never).",
      "uses": {
        "max": 1,
        "recharge": "long"
      },
      "grants": {
        "initiative": {
          "regain": "monks-focus",
          "heal": {
            "column": "martial-arts"
          },
          "addLevel": true
        }
      }
    },
    {
      "id": "deflect-attacks",
      "name": "Deflect Attacks",
      "level": 3,
      "tier": "assist",
      "checked": true,
      "text": "When hit by an attack roll whose damage includes Bludgeoning, Piercing or Slashing, use your Reaction to reduce the attack's total damage by 1d10 + Dexterity modifier + Monk level (taken by standing instruction). If that brings it to 0, the monk may spend 1 Focus Point to redirect it: a creature within 5 feet (melee) or 60 feet (ranged) makes a Dexterity save or takes two Martial Arts dice + Dexterity modifier. The DM applies the redirect.",
      "grants": {
        "reaction": {
          "on": "hit",
          "types": [
            "bludgeoning",
            "piercing",
            "slashing"
          ],
          "cut": {
            "dice": "1d10",
            "add": [
              {
                "mod": "dex"
              },
              {
                "perLevel": 1
              }
            ]
          }
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
      "id": "slow-fall",
      "name": "Slow Fall",
      "level": 4,
      "tier": "manual",
      "checked": true,
      "text": "Use your Reaction when you fall to reduce the damage by five times your Monk level."
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
      "id": "stunning-strike",
      "name": "Stunning Strike",
      "level": 5,
      "tier": "assist",
      "checked": true,
      "text": "Once a turn when you hit with a Monk weapon or Unarmed Strike, spend 1 Focus Point: the target makes a Constitution save against your Focus save DC or is Stunned until the start of your next turn (on a success its Speed is halved and the next attack against it has Advantage). Use it after the hit; the DM confirms the hit and the once a turn, and applies a successful save.",
      "grants": {
        "action": {
          "time": "free",
          "cost": {
            "resource": "monks-focus"
          },
          "target": {
            "creature": {
              "reach": 5
            }
          },
          "effects": [
            {
              "save": "con",
              "dc": "wis",
              "onFail": [
                {
                  "condition": "stunned",
                  "ends": {
                    "on": "turnStart",
                    "of": "source"
                  }
                }
              ],
              "onSuccess": [
                {
                  "manual": "Stunning Strike: the target saved. Its Speed is halved until the start of the monk's next turn, and the next attack roll against it before then has Advantage. The DM applies this."
                }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "empowered-strikes",
      "name": "Empowered Strikes",
      "level": 6,
      "tier": "manual",
      "checked": true,
      "text": "Unarmed Strikes can deal Force damage instead of their normal type."
    },
    {
      "id": "evasion",
      "name": "Evasion",
      "level": 7,
      "tier": "auto",
      "checked": true,
      "text": "On a Dexterity save against an effect that does half damage on a success, take none on a success and half on a failure, unless you are Incapacitated.",
      "grants": {
        "evasion": true
      }
    },
    {
      "id": "acrobatic-movement",
      "name": "Acrobatic Movement",
      "level": 9,
      "tier": "auto",
      "checked": true,
      "text": "Without armor or a Shield, move along vertical surfaces (as with a Climb Speed equal to your Speed) and across water on your turn; you can't stop on water.",
      "grants": {
        "surfaces": true
      }
    },
    {
      "id": "heightened-focus",
      "name": "Heightened Focus",
      "level": 10,
      "tier": "assist",
      "checked": true,
      "text": "Flurry of Blows makes three Unarmed Strikes; Patient Defense with a Focus Point also gives two rolls of your Martial Arts die in Temporary Hit Points (both applied); Step of the Wind with a Focus Point can carry a willing creature (the DM's)."
    },
    {
      "id": "self-restoration",
      "name": "Self-Restoration",
      "level": 10,
      "tier": "auto",
      "checked": true,
      "text": "At the end of each of your turns, end one of Charmed, Frightened or Poisoned on yourself (in that order of choice). Going without food and drink gives you no Exhaustion (the engine does not track food).",
      "grants": {
        "selfCure": {
          "conditions": [
            "charmed",
            "frightened",
            "poisoned"
          ]
        }
      }
    },
    {
      "id": "deflect-energy",
      "name": "Deflect Energy",
      "level": 13,
      "tier": "auto",
      "checked": true,
      "text": "Deflect Attacks works against attacks of any damage type.",
      "grants": {
        "allTypes": {
          "of": "deflect-attacks"
        }
      }
    },
    {
      "id": "disciplined-survivor",
      "name": "Disciplined Survivor",
      "level": 14,
      "tier": "auto",
      "checked": true,
      "text": "Proficiency in all saving throws. When you fail a save, spend 1 Focus Point to reroll it and use the new roll; taken by standing instruction (always or never) where the new roll could succeed.",
      "grants": {
        "saves": "all",
        "reroll": {
          "cost": "monks-focus"
        }
      }
    },
    {
      "id": "perfect-focus",
      "name": "Perfect Focus",
      "level": 15,
      "tier": "auto",
      "checked": true,
      "text": "When you roll Initiative and don't use Uncanny Metabolism, regain Focus Points until you have 4, if you have 3 or fewer.",
      "grants": {
        "initiative": {
          "regain": "monks-focus",
          "upTo": 4,
          "unless": "uncanny-metabolism"
        }
      }
    },
    {
      "id": "superior-defense",
      "name": "Superior Defense",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "At the start of your turn, spend 3 Focus Points for Resistance to all damage but Force for 1 minute."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Irresistible Offense is suggested). Without one, nothing is added."
    },
    {
      "id": "body-and-mind",
      "name": "Body and Mind",
      "level": 20,
      "tier": "auto",
      "checked": true,
      "text": "Dexterity and Wisdom increase by 4, to a maximum of 25.",
      "grants": {
        "abilityBonus": {
          "dex": 4,
          "wis": 4,
          "max": 25
        }
      }
    }
  ],
  "subclass": {
    "id": "open-hand",
    "name": "Warrior of the Open Hand",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Masters of unarmed combat.",
    "features": [
      {
        "id": "open-hand-technique",
        "name": "Open Hand Technique",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "When you hit with a Flurry of Blows attack, impose Addle, Push (Strength save or pushed 15 feet) or Topple (Dexterity save or Prone). The DM applies it."
      },
      {
        "id": "wholeness-of-body",
        "name": "Wholeness of Body",
        "level": 6,
        "tier": "auto",
        "checked": true,
        "text": "As a Bonus Action, regain a Martial Arts die + Wisdom modifier Hit Points (at least 1), Wisdom modifier times (at least once) per Long Rest.",
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
                "heal": {
                  "column": "martial-arts"
                },
                "addMod": "wis",
                "atLeast": 1
              }
            ]
          }
        }
      },
      {
        "id": "fleet-step",
        "name": "Fleet Step",
        "level": 11,
        "tier": "assist",
        "checked": true,
        "text": "After a Bonus Action other than Step of the Wind, use Step of the Wind without a Bonus Action, once a turn. That it comes immediately after is not enforced.",
        "grants": {
          "fleet": {
            "of": "step-of-the-wind"
          }
        }
      },
      {
        "id": "quivering-palm",
        "name": "Quivering Palm",
        "level": 17,
        "tier": "manual",
        "checked": true,
        "text": "Spend 4 Focus Points on an Unarmed Strike hit to set lethal vibrations; ending them forces a Constitution save for 10d12 Force damage, half on a success."
      }
    ]
  }
};
