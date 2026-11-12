// The Wizard class and its SRD subclass, from the SRD 5.2.1 Classes chapter. Data only (format: schema.js, lintClass).
// Tables and features compared with the SRD text; `text` is a short description, not the SRD wording.
export const wizard = {
  "id": "wizard",
  "name": "Wizard",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "A scholar of arcane magic.",
  "hitDie": 6,
  "primary": [
    "int"
  ],
  "saves": [
    "int",
    "wis"
  ],
  "armour": [],
  "weapons": [
    "simple"
  ],
  "skills": {
    "choose": 2,
    "from": [
      "arcana",
      "history",
      "insight",
      "investigation",
      "medicine",
      "nature",
      "religion"
    ]
  },
  "table": {},
  "casting": {
    "ability": "int",
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
      18,
      19,
      21,
      22,
      23,
      24,
      25
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
      "text": "Cast Wizard spells using Intelligence; cantrips, prepared spells and spell slots follow the class table. Slots come back on a Long Rest."
    },
    {
      "id": "ritual-adept",
      "name": "Ritual Adept",
      "level": 1,
      "tier": "manual",
      "checked": true,
      "text": "Cast any Ritual spell in your spellbook as a Ritual without preparing it. Ritual casting is not built."
    },
    {
      "id": "arcane-recovery",
      "name": "Arcane Recovery",
      "level": 1,
      "tier": "auto",
      "checked": true,
      "text": "When you finish a Short Rest, recover spell slots with a combined level up to half your Wizard level (rounded up), none of level 6 or higher, once per Long Rest.",
      "uses": {
        "max": 1,
        "recharge": "long"
      },
      "grants": {
        "recover": {
          "levels": "half-up",
          "max": 5
        }
      }
    },
    {
      "id": "scholar",
      "name": "Scholar",
      "level": 2,
      "tier": "auto",
      "checked": true,
      "text": "Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion that you are proficient in.",
      "grants": {
        "expertise": 1
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
      "id": "memorize-spell",
      "name": "Memorize Spell",
      "level": 5,
      "tier": "manual",
      "checked": true,
      "text": "On a Short Rest, swap one prepared spell for another from your spellbook. Edit the sheet to change spells."
    },
    {
      "id": "spell-mastery",
      "name": "Spell Mastery",
      "level": 18,
      "tier": "manual",
      "checked": true,
      "text": "Choose a level 1 and a level 2 spell taking an action; cast them at their lowest level without a slot. The DM tracks it."
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
      "id": "signature-spells",
      "name": "Signature Spells",
      "level": 20,
      "tier": "manual",
      "checked": true,
      "text": "Two level 3 spells always prepared, each castable once at level 3 without a slot per Short or Long Rest."
    }
  ],
  "subclass": {
    "id": "evoker",
    "name": "Evoker",
    "source": "SRD 5.2.1",
    "checked": true,
    "text": "Wizards of elemental evocation.",
    "features": [
      {
        "id": "evocation-savant",
        "name": "Evocation Savant",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "Add two Evocation spells of level 2 or lower to your spellbook, and one more each time you gain a new spell slot level."
      },
      {
        "id": "potent-cantrip",
        "name": "Potent Cantrip",
        "level": 3,
        "tier": "manual",
        "checked": true,
        "text": "A damaging cantrip that misses or is saved against still deals half damage, with no other effect. The DM applies it."
      },
      {
        "id": "sculpt-spells",
        "name": "Sculpt Spells",
        "level": 6,
        "tier": "manual",
        "checked": true,
        "text": "Choose 1 + spell level creatures you can see in your Evocation spell: they succeed on its save and take no damage instead of half. The DM applies it."
      },
      {
        "id": "empowered-evocation",
        "name": "Empowered Evocation",
        "level": 10,
        "tier": "manual",
        "checked": true,
        "text": "Add your Intelligence modifier to one damage roll of your Wizard Evocation spells. The DM adds it."
      },
      {
        "id": "overchannel",
        "name": "Overchannel",
        "level": 14,
        "tier": "manual",
        "checked": true,
        "text": "Deal maximum damage with a level 1 to 5 damaging Wizard spell; later uses before a Long Rest cost 2d12 Necrotic per slot level, rising by 1d12 each time."
      }
    ]
  }
};
