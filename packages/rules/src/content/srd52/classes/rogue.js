// The Rogue class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const rogue = {
  "id": "rogue",
  "name": "Rogue",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A stealthy expert who strikes where a foe is weak.",
  "hitDie": 8,
  "primary": [
    "dex"
  ],
  "saves": [
    "dex",
    "int"
  ],
  "armour": [
    "light"
  ],
  "weapons": [
    "simple",
    "martial-finesse-or-light"
  ],
  "tools": "Thieves' Tools",
  "skills": {
    "choose": 4,
    "from": [
      "acrobatics",
      "athletics",
      "deception",
      "insight",
      "intimidation",
      "investigation",
      "perception",
      "persuasion",
      "sleight-of-hand",
      "stealth"
    ]
  },
  "table": {
    "sneak-attack": [
      "1d6",
      "1d6",
      "2d6",
      "2d6",
      "3d6",
      "3d6",
      "4d6",
      "4d6",
      "5d6",
      "5d6",
      "6d6",
      "6d6",
      "7d6",
      "7d6",
      "8d6",
      "8d6",
      "9d6",
      "9d6",
      "10d6",
      "10d6"
    ]
  },
  "casting": null,
  "multiclass": {
    "requires": {
      "all": [
        "dex"
      ]
    },
    "armour": [
      "light"
    ],
    "weapons": [],
    "skills": {
      "choose": 1,
      "from": "class"
    },
    "tools": "Thieves' Tools",
    "caster": null
  },
  "features": [
    {
      "id": "expertise",
      "name": "Expertise",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in two of your skill proficiencies.",
      "grants": {
        "expertise": 2
      }
    },
    {
      "id": "sneak-attack",
      "name": "Sneak Attack",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Once a turn, deal extra damage (see the table) to a creature you hit with a Finesse or Ranged weapon if you have Advantage, or if an ally who is not Incapacitated is within 5 feet of it and you don't have Disadvantage.",
      "grants": {
        "sneak": {
          "column": "sneak-attack"
        }
      }
    },
    {
      "id": "thieves-cant",
      "name": "Thieves' Cant",
      "level": 1,
      "tier": "manual",
      "checked": true,
      "text": "You know Thieves' Cant and one other language."
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
      "id": "cunning-action",
      "name": "Cunning Action",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "On your turn, take the Dash, Disengage or Hide action as a Bonus Action.",
      "grants": {
        "bonusActs": [
          "dash",
          "disengage",
          "hide"
        ]
      }
    },
    {
      "id": "steady-aim",
      "name": "Steady Aim",
      "level": 3,
      "tier": "manual",
      "checked": true,
      "text": "As a Bonus Action, if you have not moved this turn, gain Advantage on your next attack roll this turn; your Speed is then 0 until the end of the turn. The DM applies it."
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
      "id": "ability-score-improvement-10",
      "name": "Ability Score Improvement",
      "level": 10,
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
      "id": "cunning-strike",
      "name": "Cunning Strike",
      "level": 5,
      "tier": "assist",
      "checked": true,
      "text": "When your Sneak Attack deals damage, give up Sneak Attack dice (leaving at least one to deal it) for one effect (`cunning` on the attack; the dice come off before the roll, the effect follows the damage; save DC 8 + Dexterity modifier + Proficiency Bonus): Poison (1d6, needs a Poisoner's Kit: Constitution save or Poisoned for 1 minute, repeating the save at the end of each of its turns), Trip (1d6, Large or smaller: Dexterity save or Prone) or Withdraw (1d6: your move of up to half your Speed without Opportunity Attacks is the DM's).",
      "grants": {
        "cunning": {
          "options": [
            {
              "id": "poison",
              "name": "Poison",
              "cost": 1,
              "needs": "poisoners-kit",
              "duration": "1 minute",
              "effects": [
                {
                  "save": "con",
                  "dc": "dex",
                  "onFail": [
                    {
                      "condition": "poisoned",
                      "ends": {
                        "on": "save",
                        "save": "con",
                        "at": "turnEnd"
                      }
                    }
                  ]
                }
              ]
            },
            {
              "id": "trip",
              "name": "Trip",
              "cost": 1,
              "size": "large",
              "effects": [
                {
                  "save": "dex",
                  "dc": "dex",
                  "onFail": [
                    {
                      "condition": "prone"
                    }
                  ]
                }
              ]
            },
            {
              "id": "withdraw",
              "name": "Withdraw",
              "cost": 1,
              "effects": [
                {
                  "manual": "Withdraw: right after the attack the rogue may move up to half its Speed without provoking Opportunity Attacks. The DM moves it."
                }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "uncanny-dodge",
      "name": "Uncanny Dodge",
      "level": 5,
      "tier": "auto",
      "checked": true,
      "text": "When an attacker you can see hits you with an attack roll, use your Reaction to halve the attack's damage (round down). Taken by standing instruction.",
      "grants": {
        "reaction": {
          "on": "hit",
          "seen": true,
          "cut": "half"
        }
      }
    },
    {
      "id": "expertise-6",
      "name": "Expertise",
      "level": 6,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in two more of your skill proficiencies.",
      "grants": {
        "expertise": 2
      }
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
      "id": "reliable-talent",
      "name": "Reliable Talent",
      "level": 7,
      "tier": "auto",
      "checked": true,
      "text": "On an ability check that uses one of your skill or tool proficiencies, a d20 roll of 9 or lower counts as a 10.",
      "grants": {
        "modifiers": [
          {
            "on": "check",
            "op": "floor",
            "value": 10,
            "when": [
              "check.proficient"
            ]
          }
        ]
      }
    },
    {
      "id": "improved-cunning-strike",
      "name": "Improved Cunning Strike",
      "level": 11,
      "tier": "auto",
      "checked": true,
      "text": "Use up to two Cunning Strike effects on one Sneak Attack, paying the dice for each.",
      "grants": {
        "cunning": {
          "max": 2
        }
      }
    },
    {
      "id": "devious-strikes",
      "name": "Devious Strikes",
      "level": 14,
      "tier": "assist",
      "checked": true,
      "text": "More Cunning Strike effects: Daze (2d6: Constitution save, or on its next turn it can only move, take an action or take a Bonus Action; that limit is the DM's), Knock Out (6d6: Constitution save or Unconscious for 1 minute or until it takes damage, repeating the save at the end of each of its turns) and Obscure (3d6: Dexterity save or Blinded until the end of its next turn).",
      "grants": {
        "cunning": {
          "options": [
            {
              "id": "daze",
              "name": "Daze",
              "cost": 2,
              "effects": [
                {
                  "save": "con",
                  "dc": "dex",
                  "onFail": [
                    {
                      "manual": "Daze: on its next turn the target can do only one of these: move, take an action, or take a Bonus Action. The DM applies it."
                    }
                  ]
                }
              ]
            },
            {
              "id": "knock-out",
              "name": "Knock Out",
              "cost": 6,
              "duration": "1 minute",
              "effects": [
                {
                  "save": "con",
                  "dc": "dex",
                  "onFail": [
                    {
                      "condition": "unconscious",
                      "ends": {
                        "on": "save",
                        "save": "con",
                        "at": "turnEnd",
                        "orDamaged": true
                      }
                    }
                  ]
                }
              ]
            },
            {
              "id": "obscure",
              "name": "Obscure",
              "cost": 3,
              "effects": [
                {
                  "save": "dex",
                  "dc": "dex",
                  "onFail": [
                    {
                      "condition": "blinded",
                      "ends": {
                        "on": "turnEnd"
                      }
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
      "id": "slippery-mind",
      "name": "Slippery Mind",
      "level": 15,
      "tier": "auto",
      "checked": true,
      "text": "Proficiency in Wisdom and Charisma saving throws.",
      "grants": {
        "saves": [
          "wis",
          "cha"
        ]
      }
    },
    {
      "id": "elusive",
      "name": "Elusive",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "No attack roll has Advantage against you unless you are Incapacitated. The DM applies it."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of the Night Spirit is suggested). Without one, nothing is added."
    },
    {
      "id": "stroke-of-luck",
      "name": "Stroke of Luck",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Turn a failed D20 Test into a 20, once per Short or Long Rest. The engine cannot change a roll after it is made; spending the use shows this to the DM.",
      "uses": {
        "max": 1,
        "recharge": "short"
      }
    }
  ],
  "subclass": {
    "id": "thief",
    "name": "Thief",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "A burglar, treasure hunter and explorer.",
    "features": [
      {
        "id": "fast-hands",
        "name": "Fast Hands",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "As a Bonus Action, make a Sleight of Hand check to pick a lock, disarm a trap or pick a pocket, or take the Utilize action or use a magic item."
      },
      {
        "id": "second-story-work",
        "name": "Second-Story Work",
        "level": 3,
        "tier": "assist",
        "checked": true,
        "text": "A Climb Speed equal to your Speed; jump distance uses Dexterity (the DM applies that part).",
        "grants": {
          "speeds": [
            "climb"
          ]
        }
      },
      {
        "id": "supreme-sneak",
        "name": "Supreme Sneak",
        "level": 9,
        "tier": "auto",
        "checked": true,
        "text": "A Cunning Strike option, Stealth Attack (1d6): an attack made while hidden does not end your hiding if you end the turn behind Three-Quarters or Total Cover from every enemy.",
        "grants": {
          "cunning": {
            "options": [
              {
                "id": "stealth-attack",
                "name": "Stealth Attack",
                "cost": 1,
                "keepHidden": true
              }
            ]
          }
        }
      },
      {
        "id": "use-magic-device",
        "name": "Use Magic Device",
        "level": 13,
        "tier": "assist",
        "checked": true,
        "text": "Attune to up to four magic items (applied). Charges: a roll of 6 on a d6 spends none; Spell Scrolls: any, with Intelligence, cantrips and level 1 reliably, higher ones after an Intelligence (Arcana) check against 10 + the spell's level. Using items is not built yet, so those two are the DM's.",
        "grants": {
          "attune": 4
        }
      },
      {
        "id": "thiefs-reflexes",
        "name": "Thief's Reflexes",
        "level": 17,
        "tier": "manual",
        "checked": true,
        "text": "Take two turns in the first round of combat, the second at your Initiative minus 10. The DM runs the second turn."
      }
    ]
  }
};
