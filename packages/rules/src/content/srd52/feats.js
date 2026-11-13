// Feats from the SRD 5.2.1 "Feats" chapter: every Origin, General, Fighting Style and Epic Boon feat
// it holds, and no others. Data only. Each was compared with the SRD text (reference/srd52) field by
// field: category, prerequisite, repeatable, ability score increase and its maximum, numbers.
// `text` is a short description, not the SRD wording.
//
// The parts (content/schema.js, lintFeatDef):
//   category       origin | general | fighting-style | epic-boon
//   prerequisite   { level?, abilities?: { any: [abilities], min }, feature?: "fighting-style" | "spellcasting" }
//   repeatable     true, or "list" (again only with a different spell list: Magic Initiate)
//   increase       { from: [abilities], points, max }: points added to scores of the player's choice, none above max
//   proficiencies  { n }: proficiency in n skills or tools of the player's choice
//   spellPick      { lists, abilities, cantrips, level1 }: spells learned from one of the lists, cast with one of the
//                  abilities; the level 1 spell is always prepared and cast once without a slot each Long Rest
//   grants         what a class feature can grant (modifiers, senses, rangedAttack, armouredAc, ...)
export const feats = [
  // ---------- Origin ----------
  {
    id: "alert", name: "Alert", category: "origin", tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "Add your Proficiency Bonus to Initiative rolls. Right after rolling Initiative you may trade Initiatives with a willing ally in the fight, unless either of you is Incapacitated (the DM swaps them).",
    grants: { modifiers: [{ on: "initiative", op: "add", value: { prof: 1 } }] },
  },
  {
    id: "magic-initiate", name: "Magic Initiate", category: "origin", repeatable: "list", tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "Learn two cantrips and one level 1 spell from the Cleric, Druid or Wizard list, cast with Intelligence, Wisdom or Charisma (chosen with the feat). The level 1 spell is always prepared; cast it once without a slot, again after a Long Rest, or with your own slots. On gaining a level you may swap one of these spells for another of the same level from the list. Taken again, choose another list.",
    spellPick: { lists: ["cleric", "druid", "wizard"], abilities: ["int", "wis", "cha"], cantrips: 2, level1: 1 },
  },
  {
    id: "savage-attacker", name: "Savage Attacker", category: "origin", tier: "manual", source: "SRD 5.2.1", checked: true,
    text: "Once a turn, when you hit with a weapon, roll its damage dice twice and use either result. The engine rolls once; the DM applies the second roll.",
  },
  {
    id: "skilled", name: "Skilled", category: "origin", repeatable: true, tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "Gain proficiency in any three skills or tools, in any mix. Can be taken more than once.",
    proficiencies: { n: 3 },
  },
  // ---------- General ----------
  {
    id: "ability-score-improvement", name: "Ability Score Improvement", category: "general", prerequisite: { level: 4 }, repeatable: true, tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "Raise one ability score by 2, or two scores by 1 each; no score above 20. Can be taken more than once.",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 2, max: 20 },
  },
  {
    id: "grappler", name: "Grappler", category: "general", prerequisite: { level: 4, abilities: { any: ["str", "dex"], min: 13 } }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "Strength or Dexterity +1 (to 20). Once a turn, an Unarmed Strike that hits during the Attack action can both deal damage and grapple; Advantage on attack rolls against a creature you are grappling; moving a grappled creature your size or smaller costs no extra movement. The engine raises the score; grappling is the DM's.",
    increase: { from: ["str", "dex"], points: 1, max: 20 },
  },
  // ---------- Fighting Style ----------
  {
    id: "archery", name: "Archery", category: "fighting-style", prerequisite: { feature: "fighting-style" }, tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "+2 to attack rolls with Ranged weapons.",
    grants: { rangedAttack: 2 },
  },
  {
    id: "defense", name: "Defense", category: "fighting-style", prerequisite: { feature: "fighting-style" }, tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "+1 to Armor Class while wearing Light, Medium or Heavy armor.",
    grants: { armouredAc: 1 },
  },
  {
    id: "great-weapon-fighting", name: "Great Weapon Fighting", category: "fighting-style", prerequisite: { feature: "fighting-style" }, tier: "manual", source: "SRD 5.2.1", checked: true,
    text: "Treat a 1 or 2 on a damage die as a 3 with a Melee weapon held in two hands (Two-Handed or Versatile). The engine does not change damage dice; the DM applies it.",
  },
  {
    id: "two-weapon-fighting", name: "Two-Weapon Fighting", category: "fighting-style", prerequisite: { feature: "fighting-style" }, tier: "manual", source: "SRD 5.2.1", checked: true,
    text: "Add your ability modifier to the damage of the extra attack from a Light weapon. The engine has no extra Light-weapon attack yet; the DM applies it.",
  },
  // ---------- Epic Boon ----------
  {
    id: "boon-of-combat-prowess", name: "Boon of Combat Prowess", category: "epic-boon", prerequisite: { level: 19 }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "One ability score +1 (to 30). When you miss with an attack roll you may hit instead, once until the start of your next turn (the DM turns the miss into a hit).",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 1, max: 30 },
  },
  {
    id: "boon-of-dimensional-travel", name: "Boon of Dimensional Travel", category: "epic-boon", prerequisite: { level: 19 }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "One ability score +1 (to 30). Right after the Attack or Magic action, teleport up to 30 feet to an unoccupied space you can see (the DM moves you).",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 1, max: 30 },
  },
  {
    id: "boon-of-fate", name: "Boon of Fate", category: "epic-boon", prerequisite: { level: 19 }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "One ability score +1 (to 30). When you or a creature within 60 feet succeeds or fails a D20 Test, roll 2d4 and add it to or take it from the d20; once until you roll Initiative or finish a rest (the DM applies it).",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 1, max: 30 },
  },
  {
    id: "boon-of-irresistible-offense", name: "Boon of Irresistible Offense", category: "epic-boon", prerequisite: { level: 19 }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "Strength or Dexterity +1 (to 30). Your Bludgeoning, Piercing and Slashing damage ignores Resistance, and a 20 on an attack roll's d20 adds damage equal to the raised score. The engine raises the score; the DM applies the rest.",
    increase: { from: ["str", "dex"], points: 1, max: 30 },
  },
  {
    id: "boon-of-spell-recall", name: "Boon of Spell Recall", category: "epic-boon", prerequisite: { level: 19, feature: "spellcasting" }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "Intelligence, Wisdom or Charisma +1 (to 30). When you cast with a level 1 to 4 slot, roll 1d4: if it equals the slot's level, the slot is kept (the DM gives it back).",
    increase: { from: ["int", "wis", "cha"], points: 1, max: 30 },
  },
  {
    id: "boon-of-the-night-spirit", name: "Boon of the Night Spirit", category: "epic-boon", prerequisite: { level: 19 }, tier: "assist", source: "SRD 5.2.1", checked: true,
    text: "One ability score +1 (to 30). In Dim Light or Darkness, become Invisible as a Bonus Action until you next take an action, Bonus Action or Reaction, and resist all damage but Psychic and Radiant. The engine raises the score; the DM applies the rest.",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 1, max: 30 },
  },
  {
    id: "boon-of-truesight", name: "Boon of Truesight", category: "epic-boon", prerequisite: { level: 19 }, tier: "auto", source: "SRD 5.2.1", checked: true,
    text: "One ability score +1 (to 30). Truesight to 60 feet.",
    increase: { from: ["str", "dex", "con", "int", "wis", "cha"], points: 1, max: 30 },
    grants: { senses: { truesight: 60 } },
  },
];
