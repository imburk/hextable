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
      "tier": "manual",
      "checked": true,
      "text": "Know invocations (see the table) such as Agonizing Blast or Pact of the Blade. Invocations are not entered yet; the DM applies them."
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
      "id": "contact-patron",
      "name": "Contact Patron",
      "level": 9,
      "tier": "assist",
      "checked": true,
      "text": "Contact Other Plane is always prepared (applied); casting it without a slot to reach your patron, succeeding on its save, once per Long Rest, is the DM's.",
      "grants": {
        "spells": [
          "contact-other-plane"
        ]
      }
    },
    {
      "id": "mystic-arcanum",
      "name": "Mystic Arcanum",
      "level": 11,
      "tier": "manual",
      "checked": true,
      "text": "Choose a level 6 Warlock spell (7 at 13, 8 at 15, 9 at 17) to cast once per Long Rest without a slot. The DM tracks it."
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
        "tier": "manual",
        "checked": true,
        "text": "After each rest choose a damage type other than Force to have Resistance to. The DM applies it."
      },
      {
        "id": "hurl-through-hell",
        "name": "Hurl Through Hell",
        "level": 14,
        "tier": "manual",
        "checked": true,
        "text": "Once a turn on a hit, the target makes a Charisma save or takes 8d10 Psychic (unless a Fiend) and is Incapacitated until the end of your next turn. Once per Long Rest, or spend a Pact slot.",
        "uses": {
          "max": 1,
          "recharge": "long"
        }
      }
    ]
  }
};
