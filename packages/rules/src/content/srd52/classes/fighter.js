// The Fighter class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const fighter = {
  "id": "fighter",
  "name": "Fighter",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A master of weapons and armor who fights with skill and endurance.",
  "hitDie": 10,
  "primary": [
    "str",
    "dex"
  ],
  "saves": [
    "str",
    "con"
  ],
  "armour": [
    "light",
    "medium",
    "heavy",
    "shield"
  ],
  "weapons": [
    "simple",
    "martial"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "acrobatics",
      "animal-handling",
      "athletics",
      "history",
      "insight",
      "intimidation",
      "persuasion",
      "perception",
      "survival"
    ]
  },
  "table": {
    "second-wind": [
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
    "weapon-mastery": [
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
      6,
      6,
      6,
      6,
      6
    ],
    "action-surge": [
      null,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2
    ],
    "indomitable": [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2,
      3,
      3,
      3,
      3
    ]
  },
  "casting": null,
  "multiclass": {
    "requires": {
      "any": [
        "str",
        "dex"
      ]
    },
    "armour": [
      "light",
      "medium",
      "shield"
    ],
    "weapons": [
      "martial"
    ],
    "caster": null
  },
  "features": [
    {
      "id": "fighting-style",
      "name": "Fighting Style",
      "level": 1,
      "tier": "assist",
      "checked": true,
      "text": "Gain a Fighting Style feat of your choice.",
      "options": [
        {
          "id": "archery",
          "feat": "archery",
          "name": "Archery",
          "tier": "auto",
          "text": "+2 to attack rolls with Ranged weapons."
        },
        {
          "id": "defense",
          "feat": "defense",
          "name": "Defense",
          "tier": "auto",
          "text": "+1 to Armor Class while wearing Light, Medium or Heavy armor."
        },
        {
          "id": "great-weapon-fighting",
          "feat": "great-weapon-fighting",
          "name": "Great Weapon Fighting",
          "tier": "manual",
          "text": "Treat a 1 or 2 on a damage die as a 3 with a Melee weapon held in two hands (Two-Handed or Versatile). The engine does not change damage dice; the DM applies it."
        },
        {
          "id": "two-weapon-fighting",
          "feat": "two-weapon-fighting",
          "name": "Two-Weapon Fighting",
          "tier": "manual",
          "text": "Add your ability modifier to the damage of the extra attack from a Light weapon. The engine has no extra Light-weapon attack yet; the DM applies it."
        }
      ]
    },
    {
      "id": "second-wind",
      "name": "Second Wind",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "As a Bonus Action, regain 1d10 + your Fighter level Hit Points. One use comes back on a Short Rest, all on a Long Rest.",
      "uses": {
        "max": {
          "column": "second-wind"
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
              "heal": "1d10",
              "addLevel": true
            }
          ]
        }
      }
    },
    {
      "id": "weapon-mastery",
      "name": "Weapon Mastery",
      "level": 1,
      "tier": "manual",
      "checked": true,
      "text": "Use the mastery properties of three kinds of weapons you choose (more at higher levels: see the Weapon Mastery column). The engine does not apply mastery properties yet."
    },
    {
      "id": "action-surge",
      "name": "Action Surge",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "On your turn, take one additional action, but not the Magic action. Uses come back on a Short or Long Rest; twice before a rest from level 17, once a turn.",
      "uses": {
        "max": {
          "column": "action-surge"
        },
        "recharge": "short"
      },
      "grants": {
        "action": {
          "time": "free",
          "gain": {
            "action": 1
          }
        }
      }
    },
    {
      "id": "tactical-mind",
      "name": "Tactical Mind",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "When you fail an ability check, spend a use of Second Wind to add 1d10 to it; the use is kept if the check still fails. The engine cannot offer a choice after a roll; the DM applies it."
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
      "id": "ability-score-improvement-6",
      "name": "Ability Score Improvement",
      "level": 6,
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
      "id": "ability-score-improvement-14",
      "name": "Ability Score Improvement",
      "level": 14,
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
      "id": "tactical-shift",
      "name": "Tactical Shift",
      "level": 5,
      "tier": "manual",
      "checked": true,
      "text": "When you use Second Wind, you may move up to half your Speed without provoking Opportunity Attacks. The DM moves you."
    },
    {
      "id": "indomitable",
      "name": "Indomitable",
      "level": 9,
      "tier": "auto",
      "checked": true,
      "text": "When you fail a saving throw, you can reroll it with a bonus equal to your Fighter level and use the new roll; once per Long Rest (twice from level 13, three times from 17). Set by standing instruction (never until you set it to always); taken where the new roll could succeed.",
      "uses": {
        "max": {
          "column": "indomitable"
        },
        "recharge": "long"
      },
      "grants": {
        "reroll": {
          "cost": "indomitable",
          "add": {
            "perLevel": 1
          }
        }
      }
    },
    {
      "id": "tactical-master",
      "name": "Tactical Master",
      "level": 9,
      "tier": "manual",
      "checked": true,
      "text": "When you attack with a weapon whose mastery property you can use, replace that property with Push, Sap or Slow for the attack. Weapon mastery properties are not built yet (Weapon Mastery is manual), so the DM applies it."
    },
    {
      "id": "two-extra-attacks",
      "name": "Two Extra Attacks",
      "level": 11,
      "tier": "auto",
      "checked": true,
      "text": "Attack three times when you take the Attack action.",
      "grants": {
        "extraAttack": 2
      }
    },
    {
      "id": "studied-attacks",
      "name": "Studied Attacks",
      "level": 13,
      "tier": "auto",
      "checked": true,
      "text": "When you miss a creature with an attack roll, you have Advantage on your next attack roll against it before the end of your next turn.",
      "grants": {
        "missed": {
          "modifier": {
            "on": "attack.roll",
            "op": "advantage",
            "uses": 1
          },
          "ends": {
            "on": "turnEnd"
          }
        }
      }
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "auto",
      "feat": "any",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Combat Prowess is suggested). Without one, nothing is added."
    },
    {
      "id": "three-extra-attacks",
      "name": "Three Extra Attacks",
      "level": 20,
      "tier": "auto",
      "checked": true,
      "text": "Attack four times when you take the Attack action.",
      "grants": {
        "extraAttack": 3
      }
    }
  ],
  "subclass": {
    "id": "champion",
    "name": "Champion",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "A fighter devoted to physical excellence.",
    "features": [
      {
        "id": "improved-critical",
        "name": "Improved Critical",
        "level": 3,
        "tier": "auto",
        "checked": true,
        "text": "Weapon attacks and Unarmed Strikes score a Critical Hit on a 19 or 20.",
        "grants": {
          "critOn": 19
        }
      },
      {
        "id": "remarkable-athlete",
        "name": "Remarkable Athlete",
        "level": 3,
        "tier": "assist",
        "checked": true,
        "text": "Advantage on Initiative and on Strength (Athletics) checks. After a Critical Hit you may move half your Speed without provoking Opportunity Attacks (the DM moves you).",
        "grants": {
          "modifiers": [
            {
              "on": "initiative",
              "op": "advantage"
            },
            {
              "on": "check",
              "op": "advantage",
              "scope": {
                "skill": "athletics"
              }
            }
          ]
        }
      },
      {
        "id": "additional-fighting-style",
        "name": "Additional Fighting Style",
        "level": 7,
        "tier": "assist",
        "checked": true,
        "text": "Gain another Fighting Style feat.",
        "options": [
          {
            "id": "archery",
            "feat": "archery",
            "name": "Archery",
            "tier": "auto",
            "text": "+2 to attack rolls with Ranged weapons."
          },
          {
            "id": "defense",
            "feat": "defense",
            "name": "Defense",
            "tier": "auto",
            "text": "+1 to Armor Class while wearing Light, Medium or Heavy armor."
          },
          {
            "id": "great-weapon-fighting",
            "feat": "great-weapon-fighting",
            "name": "Great Weapon Fighting",
            "tier": "manual",
            "text": "Treat a 1 or 2 on a damage die as a 3 with a Melee weapon held in two hands (Two-Handed or Versatile). The engine does not change damage dice; the DM applies it."
          },
          {
            "id": "two-weapon-fighting",
            "feat": "two-weapon-fighting",
            "name": "Two-Weapon Fighting",
            "tier": "manual",
            "text": "Add your ability modifier to the damage of the extra attack from a Light weapon. The engine has no extra Light-weapon attack yet; the DM applies it."
          }
        ]
      },
      {
        "id": "heroic-warrior",
        "name": "Heroic Warrior",
        "level": 10,
        "tier": "manual",
        "checked": true,
        "text": "In combat, give yourself Heroic Inspiration whenever you start your turn without it. The engine does not track Heroic Inspiration (rerolling any die), so the DM tracks it and applies the reroll."
      },
      {
        "id": "superior-critical",
        "name": "Superior Critical",
        "level": 15,
        "tier": "auto",
        "checked": true,
        "text": "Weapon attacks and Unarmed Strikes score a Critical Hit on an 18 to 20.",
        "grants": {
          "critOn": 18
        }
      },
      {
        "id": "survivor",
        "name": "Survivor",
        "level": 18,
        "tier": "assist",
        "checked": true,
        "text": "Advantage on Death Saving Throws, and an 18 or 19 on one counts as a 20 (the DM applies that part). At the start of your turn, while Bloodied with at least 1 Hit Point, regain 5 + Constitution modifier Hit Points (the DM applies it).",
        "grants": {
          "modifiers": [
            {
              "on": "save.death",
              "op": "advantage"
            }
          ]
        }
      }
    ]
  }
};
