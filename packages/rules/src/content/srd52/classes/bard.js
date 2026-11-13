// The Bard class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const bard = {
  "id": "bard",
  "name": "Bard",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A performer whose words and music carry magic.",
  "hitDie": 8,
  "primary": [
    "cha"
  ],
  "saves": [
    "dex",
    "cha"
  ],
  "armour": [
    "light"
  ],
  "weapons": [
    "simple"
  ],
  "tools": "Three Musical Instruments",
  "skills": {
    "choose": 3,
    "from": "any"
  },
  "table": {
    "bardic-die": [
      "1d6",
      "1d6",
      "1d6",
      "1d6",
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
      "1d12",
      "1d12",
      "1d12",
      "1d12",
      "1d12",
      "1d12"
    ]
  },
  "casting": {
    "ability": "cha",
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
      "id": "bardic-inspiration",
      "name": "Bardic Inspiration",
      "level": 1,
      "tier": "assist",
      "checked": true,
      "text": "As a Bonus Action, give another creature within 60 feet who can see or hear you a Bardic Inspiration die for 1 hour; once, when it fails a D20 Test, it rolls the die and adds it. Charisma modifier uses (at least 1); back on a Long Rest (a Short Rest too from level 5). The engine rolls the die on the first failed attack roll or saving throw it could turn; on an ability check, and keeping it for a later roll, and the one-die-at-a-time limit, are the DM's.",
      "uses": {
        "max": {
          "mod": "cha",
          "min": 1
        },
        "recharge": {
          "1": "long",
          "5": "short"
        }
      },
      "grants": {
        "action": {
          "time": "bonus",
          "target": {
            "creature": {
              "range": [
                60,
                60
              ]
            }
          },
          "duration": "1 hour",
          "effects": [
            {
              "modifier": {
                "on": "d20",
                "op": "add",
                "value": {
                  "column": "bardic-die"
                },
                "onFail": true,
                "uses": 1
              }
            }
          ]
        }
      }
    },
    {
      "id": "spellcasting",
      "name": "Spellcasting",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "Cast Bard spells using Charisma; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "expertise",
      "name": "Expertise",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in two of your skill proficiencies.",
      "grants": {
        "expertise": 2
      }
    },
    {
      "id": "jack-of-all-trades",
      "name": "Jack of All Trades",
      "level": 2,
      "tier": "manual",
      "checked": true,
      "text": "Add half your Proficiency Bonus to ability checks using a skill you lack proficiency in. The DM adds it."
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
      "id": "font-of-inspiration",
      "name": "Font of Inspiration",
      "level": 5,
      "tier": "assist",
      "checked": true,
      "text": "Bardic Inspiration comes back on a Short Rest as well (applied), and you can spend a spell slot to regain one use (the DM applies it)."
    },
    {
      "id": "countercharm",
      "name": "Countercharm",
      "level": 7,
      "tier": "auto",
      "checked": true,
      "text": "When you or a creature within 30 feet fails a save against an effect that would make it Charmed or Frightened, take your Reaction to have it rolled again with Advantage (by your standing instruction: always or never).",
      "grants": {
        "reaction": {
          "on": "saveFailed",
          "conditions": [
            "charmed",
            "frightened"
          ],
          "range": 30
        }
      }
    },
    {
      "id": "expertise-9",
      "name": "Expertise",
      "level": 9,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in two more of your skill proficiencies.",
      "grants": {
        "expertise": 2
      }
    },
    {
      "id": "magical-secrets",
      "name": "Magical Secrets",
      "level": 10,
      "tier": "auto",
      "checked": true,
      "text": "Prepared spells can come from the Bard, Cleric, Druid and Wizard lists.",
      "grants": {
        "spellLists": [
          "bard",
          "cleric",
          "druid",
          "wizard"
        ]
      }
    },
    {
      "id": "superior-inspiration",
      "name": "Superior Inspiration",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "On rolling Initiative, regain Bardic Inspiration uses up to two."
    },
    {
      "id": "epic-boon",
      "name": "Epic Boon",
      "level": 19,
      "tier": "manual",
      "checked": true,
      "text": "Gain an Epic Boon feat or another feat you qualify for (Boon of Spell Recall is suggested). Feats are applied by the DM."
    },
    {
      "id": "words-of-creation",
      "name": "Words of Creation",
      "level": 20,
      "tier": "assist",
      "checked": true,
      "text": "Power Word Heal and Power Word Kill are always prepared (applied); either can also target a second creature within 10 feet of the first (the DM applies it).",
      "grants": {
        "spells": [
          "power-word-heal",
          "power-word-kill"
        ]
      }
    }
  ],
  "subclass": {
    "id": "lore",
    "name": "College of Lore",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Bards who gather spells and secrets.",
    "features": [
      {
        "id": "bonus-proficiencies",
        "name": "Bonus Proficiencies",
        "level": 3,
        "tier": "auto",
        "checked": true,
        "text": "Proficiency in three skills of your choice.",
        "grants": {
          "skills": {
            "n": 3,
            "from": "any"
          }
        }
      },
      {
        "id": "cutting-words",
        "name": "Cutting Words",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "When a creature within 60 feet makes a damage roll or succeeds on an ability check or attack roll, use your Reaction and a Bardic Inspiration die to subtract it. Reactions are not prompted yet."
      },
      {
        "id": "magical-discoveries",
        "name": "Magical Discoveries",
        "level": 6,
        "tier": "manual",
        "checked": true,
        "text": "Learn two spells from the Cleric, Druid or Wizard lists, always prepared. Enter them as prepared spells; the DM checks the count."
      },
      {
        "id": "peerless-skill",
        "name": "Peerless Skill",
        "level": 14,
        "tier": "assist",
        "checked": true,
        "text": "When you fail an ability check or attack roll, spend a use of Bardic Inspiration to roll the die and add it; the use is not spent if you still fail. The engine does this for an attack roll the die could turn; for an ability check the DM does.",
        "grants": {
          "modifiers": [
            {
              "on": "attack.roll",
              "op": "add",
              "value": {
                "column": "bardic-die"
              },
              "onFail": true,
              "cost": "bardic-inspiration"
            }
          ]
        }
      }
    ]
  }
};
