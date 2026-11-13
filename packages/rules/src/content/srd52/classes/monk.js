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
      "tier": "assist",
      "checked": true,
      "text": "Take the Disengage action as a Bonus Action, or spend 1 Focus Point to take Disengage and Dodge as a Bonus Action (the DM applies the Focus Point version).",
      "grants": {
        "bonusActs": [
          "disengage"
        ]
      }
    },
    {
      "id": "step-of-the-wind",
      "name": "Step of the Wind",
      "level": 2,
      "tier": "assist",
      "checked": true,
      "text": "Take the Dash action as a Bonus Action, or spend 1 Focus Point to take Disengage and Dash as a Bonus Action with double jump distance (the DM applies the Focus Point version).",
      "grants": {
        "bonusActs": [
          "dash"
        ]
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
      "tier": "manual",
      "checked": true,
      "text": "On rolling Initiative, regain all Focus Points and Hit Points equal to Monk level + a Martial Arts die roll, once per Long Rest. The DM applies it.",
      "uses": {
        "max": 1,
        "recharge": "long"
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
        "reaction": { "on": "hit", "types": ["bludgeoning", "piercing", "slashing"], "cut": { "dice": "1d10", "add": [{ "mod": "dex" }, { "perLevel": 1 }] } }
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
      "tier": "manual",
      "checked": true,
      "text": "On a Dexterity save for half damage, take none on a success and half on a failure, unless Incapacitated. The DM applies it."
    },
    {
      "id": "acrobatic-movement",
      "name": "Acrobatic Movement",
      "level": 9,
      "tier": "manual",
      "checked": true,
      "text": "Without armor or Shield, move along vertical surfaces and across liquids on your turn."
    },
    {
      "id": "heightened-focus",
      "name": "Heightened Focus",
      "level": 10,
      "tier": "assist",
      "checked": true,
      "text": "Flurry of Blows makes three strikes (applied); Patient Defense with a Focus Point also grants two Martial Arts dice of Temporary Hit Points, and Step of the Wind can carry a willing creature (the DM applies those)."
    },
    {
      "id": "self-restoration",
      "name": "Self-Restoration",
      "level": 10,
      "tier": "manual",
      "checked": true,
      "text": "At the end of each of your turns, end Charmed, Frightened or Poisoned on yourself; going without food and drink gives no Exhaustion."
    },
    {
      "id": "deflect-energy",
      "name": "Deflect Energy",
      "level": 13,
      "tier": "manual",
      "checked": true,
      "text": "Deflect Attacks works against any damage type."
    },
    {
      "id": "disciplined-survivor",
      "name": "Disciplined Survivor",
      "level": 14,
      "tier": "assist",
      "checked": true,
      "text": "Proficiency in all saving throws; spend 1 Focus Point to reroll a failed save (the DM applies the reroll).",
      "grants": {
        "saves": "all"
      }
    },
    {
      "id": "perfect-focus",
      "name": "Perfect Focus",
      "level": 15,
      "tier": "manual",
      "checked": true,
      "text": "On rolling Initiative without using Uncanny Metabolism, regain Focus Points up to 4."
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
      "tier": "manual",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Irresistible Offense is suggested). Feats are applied by the DM."
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
        "tier": "manual",
        "checked": true,
        "text": "After a Bonus Action other than Step of the Wind, use Step of the Wind at once."
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
