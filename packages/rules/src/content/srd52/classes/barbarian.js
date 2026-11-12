// The Barbarian class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const barbarian = {
  "id": "barbarian",
  "name": "Barbarian",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A warrior fuelled by primal Rage.",
  "hitDie": 12,
  "primary": [
    "str"
  ],
  "saves": [
    "str",
    "con"
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
    "choose": 2,
    "from": [
      "animal-handling",
      "athletics",
      "intimidation",
      "nature",
      "perception",
      "survival"
    ]
  },
  "table": {
    "rages": [
      2,
      2,
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
      6,
      6,
      6,
      6
    ],
    "rage-damage": [
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
      4,
      4,
      4,
      4,
      4
    ],
    "weapon-mastery": [
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
    ]
  },
  "casting": null,
  "features": [
    {
      "id": "rage",
      "name": "Rage",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "As a Bonus Action, unless wearing Heavy armor, enter a Rage: Resistance to Bludgeoning, Piercing and Slashing damage; the Rage Damage bonus to damage with Strength attacks; Advantage on Strength checks and saves; no spells or Concentration. It lasts to the end of your next turn and is extended by attacking an enemy, forcing an enemy to save, or a Bonus Action, for up to 10 minutes. Ends early when you are Incapacitated. One use back on a Short Rest, all on a Long Rest.",
      "uses": {
        "max": {
          "column": "rages"
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
          "duration": "10 minutes",
          "renew": true,
          "noSpells": true,
          "effects": [
            {
              "modifier": {
                "on": "damage.taken",
                "op": "resist",
                "types": [
                  "bludgeoning",
                  "piercing",
                  "slashing"
                ]
              },
              "ends": {
                "on": "turnEnd"
              }
            },
            {
              "modifier": {
                "on": "damage.dealt",
                "op": "add",
                "value": {
                  "column": "rage-damage"
                },
                "when": [
                  "attack.hit",
                  "attack.str"
                ]
              },
              "ends": {
                "on": "turnEnd"
              }
            },
            {
              "modifier": {
                "on": "check",
                "op": "advantage",
                "scope": {
                  "ability": "str"
                }
              },
              "ends": {
                "on": "turnEnd"
              }
            },
            {
              "modifier": {
                "on": "save.str",
                "op": "advantage"
              },
              "ends": {
                "on": "turnEnd"
              }
            }
          ]
        }
      }
    },
    {
      "id": "unarmored-defense",
      "name": "Unarmored Defense",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Without armor, your base Armor Class is 10 + Dexterity and Constitution modifiers. A Shield still adds.",
      "grants": {
        "ac": {
          "base": 10,
          "abilities": [
            "dex",
            "con"
          ],
          "shield": true
        }
      }
    },
    {
      "id": "weapon-mastery",
      "name": "Weapon Mastery",
      "level": 1,
      "tier": "manual",
      "checked": true,
      "text": "Use the mastery properties of two kinds of weapons you choose (more at higher levels). The engine does not apply mastery properties yet."
    },
    {
      "id": "danger-sense",
      "name": "Danger Sense",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Advantage on Dexterity saving throws unless you are Incapacitated.",
      "grants": {
        "modifiers": [
          {
            "on": "save.dex",
            "op": "advantage",
            "when": [
              "self.notIncapacitated"
            ]
          }
        ]
      }
    },
    {
      "id": "reckless-attack",
      "name": "Reckless Attack",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "When you make your first attack roll on your turn, you can attack recklessly: Advantage on attack rolls using Strength until the start of your next turn, and attack rolls against you have Advantage until then.",
      "grants": {
        "action": {
          "time": "free",
          "firstAttack": true,
          "target": {
            "self": true
          },
          "duration": "1 round",
          "effects": [
            {
              "modifier": {
                "on": "attack.roll",
                "op": "advantage",
                "when": [
                  "attack.str"
                ]
              }
            },
            {
              "modifier": {
                "on": "attack.received",
                "op": "advantage"
              }
            }
          ]
        }
      }
    },
    {
      "id": "primal-knowledge",
      "name": "Primal Knowledge",
      "level": 3,
      "tier": "assist",
      "checked": true,
      "text": "Gain one more skill from the Barbarian list. While raging, Acrobatics, Intimidation, Perception, Stealth and Survival checks can be made as Strength checks (the DM applies that part).",
      "grants": {
        "skills": {
          "n": 1,
          "from": "class"
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
      "id": "fast-movement",
      "name": "Fast Movement",
      "level": 5,
      "tier": "auto",
      "checked": true,
      "text": "+10 feet Speed while not wearing Heavy armor.",
      "grants": {
        "speed": {
          "add": 10,
          "unless": "heavy"
        }
      }
    },
    {
      "id": "feral-instinct",
      "name": "Feral Instinct",
      "level": 7,
      "tier": "auto",
      "checked": true,
      "text": "Advantage on Initiative rolls.",
      "grants": {
        "modifiers": [
          {
            "on": "initiative",
            "op": "advantage"
          }
        ]
      }
    },
    {
      "id": "instinctive-pounce",
      "name": "Instinctive Pounce",
      "level": 7,
      "tier": "manual",
      "checked": true,
      "text": "As part of the Bonus Action to enter Rage, move up to half your Speed. The DM moves you."
    },
    {
      "id": "brutal-strike",
      "name": "Brutal Strike",
      "level": 9,
      "tier": "manual",
      "checked": true,
      "text": "With Reckless Attack, forgo Advantage on one Strength attack; on a hit it deals 1d10 more and a Forceful Blow or Hamstring Blow. The engine cannot take that choice; the DM applies it."
    },
    {
      "id": "relentless-rage",
      "name": "Relentless Rage",
      "level": 11,
      "tier": "manual",
      "checked": true,
      "text": "Dropping to 0 Hit Points while raging, make a DC 10 Constitution save (DC +5 each later use, reset by a rest) to have Hit Points equal to twice your Barbarian level instead. The DM applies it."
    },
    {
      "id": "improved-brutal-strike",
      "name": "Improved Brutal Strike",
      "level": 13,
      "tier": "manual",
      "checked": true,
      "text": "Adds the Staggering Blow and Sundering Blow options to Brutal Strike."
    },
    {
      "id": "persistent-rage",
      "name": "Persistent Rage",
      "level": 15,
      "tier": "manual",
      "checked": true,
      "text": "On rolling Initiative, regain all uses of Rage once per Long Rest; Rage lasts 10 minutes without being extended and ends early only on Unconscious or donning Heavy armor. The engine still asks you to extend it; the DM applies this."
    },
    {
      "id": "improved-brutal-strike-17",
      "name": "Improved Brutal Strike",
      "level": 17,
      "tier": "manual",
      "checked": true,
      "text": "Brutal Strike deals 2d10 extra and can use two different effects."
    },
    {
      "id": "indomitable-might",
      "name": "Indomitable Might",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "A Strength check or save total below your Strength score uses the score instead. The DM applies it."
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
      "id": "primal-champion",
      "name": "Primal Champion",
      "level": 20,
      "tier": "auto",
      "checked": true,
      "text": "Strength and Constitution increase by 4, to a maximum of 25.",
      "grants": {
        "abilityBonus": {
          "str": 4,
          "con": 4,
          "max": 25
        }
      }
    }
  ],
  "subclass": {
    "id": "berserker",
    "name": "Path of the Berserker",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Barbarians who channel Rage into violence.",
    "features": [
      {
        "id": "frenzy",
        "name": "Frenzy",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "With Reckless Attack while raging, the first target you hit on your turn with a Strength attack takes extra d6s equal to your Rage Damage bonus. The DM applies it."
      },
      {
        "id": "mindless-rage",
        "name": "Mindless Rage",
        "level": 6,
        "tier": "manual",
        "checked": true,
        "text": "Immune to Charmed and Frightened while raging; entering Rage ends them. The DM applies it."
      },
      {
        "id": "retaliation",
        "name": "Retaliation",
        "level": 10,
        "tier": "manual",
        "checked": true,
        "text": "When a creature within 5 feet damages you, use your Reaction to make a melee attack against it. Reactions are not prompted yet."
      },
      {
        "id": "intimidating-presence",
        "name": "Intimidating Presence",
        "level": 14,
        "tier": "manual",
        "checked": true,
        "text": "As a Bonus Action, creatures of your choice in a 30-foot Emanation make a Wisdom save (DC 8 + Strength modifier + Proficiency Bonus) or are Frightened for 1 minute, repeating the save each turn. Once per Long Rest, or spend a Rage to use it again.",
        "uses": {
          "max": 1,
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
                "manual": "Intimidating Presence: each creature of your choice within 30 feet makes a Wisdom save (DC 8 + Strength modifier + Proficiency Bonus) or is Frightened for 1 minute, repeating the save at the end of each of its turns."
              }
            ]
          }
        }
      }
    ]
  }
};
