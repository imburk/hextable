// The nine species of the SRD 5.2.1 "Character Origins" chapter ("Species Descriptions", reference/srd52/srd52-flow.txt
// 19607-19993). Data only (format: content/schema.js, lintSpecies; design: docs/specs/species.md). Each was compared with the
// SRD text field by field: creature type, size, Speed, every trait, its level, its uses and recharge, and every number.
// `text` is a short description, not the SRD wording.
//
//   type      always humanoid in the SRD
//   sizes     the sizes a sheet may pick from (the first when it names none)
//   speed     feet
//   ability   the abilities the species' spells may use, chosen once on the sheet (Elf, Gnome, Tiefling)
//   features  class-shaped features, by character level (`level`), with uses, grants and options as a class feature's
//   lineage   the one choice that brings features of its own (Draconic Ancestry, Elven Lineage, Gnomish Lineage,
//             Giant Ancestry, Fiendish Legacy)
//
// What the vocabulary cannot say yet is a `manual` feature whose text tells the DM what to apply. Where the trait has
// uses, the feature keeps them, so using it spends one (and, for a Bonus Action, the Bonus Action) and tells the DM.
// Waiting on the amendments of docs/specs/species.md: species spells (S2), a skill from a short list (S3), the Origin
// feat place (S4), Breath Weapon (S5, S6), Relentless Endurance (S7), a Fly Speed equal to Speed (S8), the Giant
// Ancestry riders and Reactions (S9, S10), Luck (S11) and Halfling Nimbleness (S12).
export const species = [
  // ---------- Dragonborn (19608-19698) ----------
  {
    id: "dragonborn", name: "Dragonborn", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium"], speed: 30,
    text: "Descendants of dragons, with a breath weapon, a resistance and later spectral wings of their ancestor's kind.",
    features: [
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 60 feet.", grants: { senses: { darkvision: 60 } } },
      { id: "draconic-flight", name: "Draconic Flight", level: 5, tier: "manual", checked: true,
        text: "Once per Long Rest, as a Bonus Action, spectral wings give you a Fly Speed equal to your Speed for 10 minutes, until you retract them (no action) or until you have the Incapacitated condition. Using it spends the Bonus Action and the use; the engine does not give a Fly Speed equal to Speed yet, so the DM gives it and ends it.",
        uses: { max: 1, recharge: "long" },
        grants: { action: { time: "bonus", target: { self: true }, cost: { resource: "draconic-flight" },
          effects: [{ manual: "Draconic Flight: the creature has a Fly Speed equal to its Speed for 10 minutes, until it retracts the wings (no action) or has the Incapacitated condition. The engine does not give a Fly Speed equal to Speed yet; the DM sets it and ends it." }] } } },
    ],
    lineage: { name: "Draconic Ancestry", options: [
      { id: "black", name: "Black", text: "A black dragon ancestor: Acid.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Acid)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Acid damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Acid)", level: 1, tier: "auto", checked: true, text: "Resistance to Acid damage.", grants: { resist: ["acid"] } }] },
      { id: "blue", name: "Blue", text: "A blue dragon ancestor: Lightning.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Lightning)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Lightning damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Lightning)", level: 1, tier: "auto", checked: true, text: "Resistance to Lightning damage.", grants: { resist: ["lightning"] } }] },
      { id: "brass", name: "Brass", text: "A brass dragon ancestor: Fire.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Fire)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Fire damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Fire)", level: 1, tier: "auto", checked: true, text: "Resistance to Fire damage.", grants: { resist: ["fire"] } }] },
      { id: "bronze", name: "Bronze", text: "A bronze dragon ancestor: Lightning.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Lightning)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Lightning damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Lightning)", level: 1, tier: "auto", checked: true, text: "Resistance to Lightning damage.", grants: { resist: ["lightning"] } }] },
      { id: "copper", name: "Copper", text: "A copper dragon ancestor: Acid.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Acid)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Acid damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Acid)", level: 1, tier: "auto", checked: true, text: "Resistance to Acid damage.", grants: { resist: ["acid"] } }] },
      { id: "gold", name: "Gold", text: "A gold dragon ancestor: Fire.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Fire)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Fire damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Fire)", level: 1, tier: "auto", checked: true, text: "Resistance to Fire damage.", grants: { resist: ["fire"] } }] },
      { id: "green", name: "Green", text: "A green dragon ancestor: Poison.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Poison)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Poison damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Poison)", level: 1, tier: "auto", checked: true, text: "Resistance to Poison damage.", grants: { resist: ["poison"] } }] },
      { id: "red", name: "Red", text: "A red dragon ancestor: Fire.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Fire)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Fire damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Fire)", level: 1, tier: "auto", checked: true, text: "Resistance to Fire damage.", grants: { resist: ["fire"] } }] },
      { id: "silver", name: "Silver", text: "A silver dragon ancestor: Cold.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Cold)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Cold damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Cold)", level: 1, tier: "auto", checked: true, text: "Resistance to Cold damage.", grants: { resist: ["cold"] } }] },
      { id: "white", name: "White", text: "A white dragon ancestor: Cold.", features: [
        { id: "breath-weapon", name: "Breath Weapon (Cold)", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "In place of one attack of the Attack action on your turn, exhale a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time): each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking 1d10 Cold damage on a failure and half on a success; 2d10 from character level 5, 3d10 from 11, 4d10 from 17. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not play it in place of an attack yet: using this feature spends a use and tells the DM, who rolls the saves and the damage." },
        { id: "damage-resistance", name: "Damage Resistance (Cold)", level: 1, tier: "auto", checked: true, text: "Resistance to Cold damage.", grants: { resist: ["cold"] } }] },
    ] },
  },
  // ---------- Dwarf (19699-19719) ----------
  {
    id: "dwarf", name: "Dwarf", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium"], speed: 30,
    text: "Hardy folk of stone and forge: long sight in the dark, a body that shrugs off poison, and a feel for the stone.",
    features: [
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 120 feet.", grants: { senses: { darkvision: 120 } } },
      { id: "dwarven-resilience", name: "Dwarven Resilience", level: 1, tier: "auto", checked: true, text: "Resistance to Poison damage, and Advantage on saves to avoid or end the Poisoned condition.",
        grants: { resist: ["poison"], modifiers: [{ on: "save", op: "advantage", scope: { condition: "poisoned" } }] } },
      { id: "dwarven-toughness", name: "Dwarven Toughness", level: 1, tier: "auto", checked: true, text: "Your Hit Point maximum is 1 higher for each character level.", grants: { hp: { perLevel: 1 } } },
      { id: "stonecunning", name: "Stonecunning", level: 1, tier: "manual", checked: true,
        text: "As a Bonus Action, gain Tremorsense out to 60 feet for 10 minutes, usable only while on or touching stone (natural or worked). Uses equal to your Proficiency Bonus, all back on a Long Rest. Using it spends the Bonus Action and a use; the engine does not use Tremorsense in what a creature perceives, so the DM applies it.",
        uses: { max: { prof: 1 }, recharge: "long" },
        grants: { action: { time: "bonus", target: { self: true }, cost: { resource: "stonecunning" },
          effects: [{ manual: "Stonecunning: the creature has Tremorsense out to 60 feet for 10 minutes while it is on or touching stone. The engine does not use Tremorsense; the DM tells it what it senses." }] } } },
    ],
  },
  // ---------- Elf (19720-19788) ----------
  {
    id: "elf", name: "Elf", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium"], speed: 30, ability: ["int", "wis", "cha"],
    text: "Long-lived people touched by the Feywild, of one of three lineages, each with its own magic.",
    features: [
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 60 feet.", grants: { senses: { darkvision: 60 } } },
      { id: "fey-ancestry", name: "Fey Ancestry", level: 1, tier: "auto", checked: true, text: "Advantage on saves to avoid or end the Charmed condition.",
        grants: { modifiers: [{ on: "save", op: "advantage", scope: { condition: "charmed" } }] } },
      { id: "keen-senses", name: "Keen Senses", level: 1, tier: "manual", checked: true,
        text: "Proficiency in one of Insight, Perception or Survival. The engine cannot yet offer a species skill from a short list: enter the chosen skill among the sheet's extra skills, and the DM checks that it is one of the three." },
      { id: "trance", name: "Trance", level: 1, tier: "manual", checked: true,
        text: "You don't need sleep and magic can't put you to sleep; a Long Rest can be finished in 4 hours of trance, during which you stay conscious. The engine does not track sleep or the length of a rest; the DM applies it." },
    ],
    lineage: { name: "Elven Lineage", options: [
      { id: "drow", name: "Drow", text: "Darkvision out to 120 feet and Dancing Lights; Faerie Fire at level 3 and Darkness at level 5.", features: [
        { id: "superior-darkvision", name: "Drow Darkvision", level: 1, tier: "auto", checked: true, text: "Your Darkvision reaches 120 feet.", grants: { senses: { darkvision: 120 } } },
        { id: "dancing-lights", name: "Dancing Lights", level: 1, tier: "manual", checked: true,
          text: "You know the Dancing Lights cantrip, cast with the ability chosen for your lineage. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "faerie-fire", name: "Faerie Fire", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Faerie Fire prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "darkness", name: "Darkness", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Darkness prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
      { id: "high-elf", name: "High Elf", text: "Prestidigitation, which may be swapped on a Long Rest; Detect Magic at level 3 and Misty Step at level 5.", features: [
        { id: "prestidigitation", name: "Prestidigitation", level: 1, tier: "manual", checked: true,
          text: "You know the Prestidigitation cantrip, cast with the ability chosen for your lineage; when you finish a Long Rest you may replace it with another cantrip of the Wizard list. The engine does not give species spells yet: when you cast it, the DM applies it, and the DM notes a swap." },
        { id: "detect-magic", name: "Detect Magic", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Detect Magic prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "misty-step", name: "Misty Step", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Misty Step prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
      { id: "wood-elf", name: "Wood Elf", text: "Speed 35 feet and Druidcraft; Longstrider at level 3 and Pass without Trace at level 5.", features: [
        { id: "fleet", name: "Wood Elf Speed", level: 1, tier: "auto", checked: true, text: "Your Speed is 35 feet.", grants: { speed: { add: 5 } } },
        { id: "druidcraft", name: "Druidcraft", level: 1, tier: "manual", checked: true,
          text: "You know the Druidcraft cantrip, cast with the ability chosen for your lineage. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "longstrider", name: "Longstrider", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Longstrider prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "pass-without-trace", name: "Pass without Trace", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Pass without Trace prepared, cast with your lineage's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
    ] },
  },
  // ---------- Gnome (19789-19831) ----------
  {
    id: "gnome", name: "Gnome", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["small"], speed: 30, ability: ["int", "wis", "cha"],
    text: "Small, quick-witted folk with a knack for illusion or for tinkering.",
    features: [
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 60 feet.", grants: { senses: { darkvision: 60 } } },
      { id: "gnomish-cunning", name: "Gnomish Cunning", level: 1, tier: "auto", checked: true, text: "Advantage on Intelligence, Wisdom and Charisma saves.",
        grants: { modifiers: [{ on: "save.int", op: "advantage" }, { on: "save.wis", op: "advantage" }, { on: "save.cha", op: "advantage" }] } },
    ],
    lineage: { name: "Gnomish Lineage", options: [
      { id: "forest-gnome", name: "Forest Gnome", text: "Minor Illusion, and Speak with Animals always prepared.", features: [
        { id: "minor-illusion", name: "Minor Illusion", level: 1, tier: "manual", checked: true,
          text: "You know the Minor Illusion cantrip, cast with the ability chosen for your lineage. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "speak-with-animals", name: "Speak with Animals", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "You always have Speak with Animals prepared, cast with your lineage's ability: without a spell slot a number of times equal to your Proficiency Bonus (all back on a Long Rest), or with any spell slot. The engine does not give species spells yet: using this feature spends one casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
      { id: "rock-gnome", name: "Rock Gnome", text: "Mending and Prestidigitation, and small clockwork devices.", features: [
        { id: "cantrips", name: "Mending and Prestidigitation", level: 1, tier: "manual", checked: true,
          text: "You know the Mending and Prestidigitation cantrips, cast with the ability chosen for your lineage. The engine does not give species spells yet: when you cast one, the DM applies it." },
        { id: "clockwork-device", name: "Clockwork Devices", level: 1, tier: "manual", checked: true,
          text: "Spending 10 minutes casting Prestidigitation, you build a Tiny clockwork device (AC 5, 1 HP) that makes one Prestidigitation effect, picked when it is built (one choice within that effect), whenever a creature touches it as a Bonus Action. At most three exist at a time; each falls apart after 8 hours, or when you take it apart with a touch as a Utilize action. The engine does not make these devices; the DM keeps track of them." }] },
    ] },
  },
  // ---------- Goliath (19832-19880) ----------
  {
    id: "goliath", name: "Goliath", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium"], speed: 35,
    text: "Towering descendants of giants, with a boon of their giant forebear and, later, a giant's size.",
    features: [
      { id: "large-form", name: "Large Form", level: 5, tier: "assist", checked: true, uses: { max: 1, recharge: "long" },
        text: "Once per Long Rest, as a Bonus Action, if there is room, you become Large for 10 minutes or until you end it (no action): Advantage on Strength checks and 10 feet more Speed. The engine gives the Advantage and the Speed for 10 minutes but does not change a size, so the DM makes you Large and checks the room.",
        grants: { action: { time: "bonus", target: { self: true }, cost: { resource: "large-form" }, duration: "10 minutes",
          effects: [
            { modifier: { on: "check", op: "advantage", scope: { ability: "str" } } },
            { modifier: { on: "speed", op: "add", value: 10 } },
            { manual: "Large Form: the creature becomes Large if it is in a big enough space (it may not use the trait otherwise). The engine does not change a creature's size; the DM does, and sets it back when the effect ends." }] } } },
      { id: "powerful-build", name: "Powerful Build", level: 1, tier: "assist", checked: true,
        text: "Advantage on ability checks to end the Grappled condition, and you count as one size larger for your carrying capacity. The engine gives the Advantage on a check to escape a grapple; it does not track carrying capacity, which is the DM's.",
        grants: { modifiers: [{ on: "check", op: "advantage", when: ["check.escape"] }] } },
    ],
    lineage: { name: "Giant Ancestry", options: [
      { id: "cloud", name: "Cloud's Jaunt (Cloud Giant)", text: "Teleport a short way as a Bonus Action.", features: [
        { id: "clouds-jaunt", name: "Cloud's Jaunt", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "As a Bonus Action, teleport up to 30 feet to an unoccupied space you can see. Uses equal to your Proficiency Bonus, all back on a Long Rest. Using it spends the Bonus Action and a use; the engine cannot take a destination for a species' teleport yet, so the DM moves you.",
          grants: { action: { time: "bonus", target: { self: true }, cost: { resource: "clouds-jaunt" },
            effects: [{ manual: "Cloud's Jaunt: the creature teleports up to 30 feet to an unoccupied space it can see. The DM moves it." }] } } }] },
      { id: "fire", name: "Fire's Burn (Fire Giant)", text: "Fire damage added to a damaging hit.", features: [
        { id: "fires-burn", name: "Fire's Burn", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "When you hit a target with an attack roll and deal damage to it, you may also deal it 1d10 Fire damage. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not offer this on a hit yet: using this feature spends a use and tells the DM, who rolls and applies the damage." }] },
      { id: "frost", name: "Frost's Chill (Frost Giant)", text: "Cold damage and a slowed target on a damaging hit.", features: [
        { id: "frosts-chill", name: "Frost's Chill", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "When you hit a target with an attack roll and deal damage to it, you may also deal it 1d6 Cold damage, and its Speed is 10 feet lower until the start of your next turn. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not offer this on a hit yet: using this feature spends a use and tells the DM, who applies the damage and the slowing." }] },
      { id: "hill", name: "Hill's Tumble (Hill Giant)", text: "A damaging hit knocks a Large or smaller creature Prone.", features: [
        { id: "hills-tumble", name: "Hill's Tumble", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "When you hit a Large or smaller creature with an attack roll and deal damage to it, you may give it the Prone condition. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not offer this on a hit yet: using this feature spends a use and tells the DM, who applies the condition." }] },
      { id: "stone", name: "Stone's Endurance (Stone Giant)", text: "A Reaction that lessens damage taken.", features: [
        { id: "stones-endurance", name: "Stone's Endurance", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "When you take damage, you may take a Reaction to roll 1d12, add your Constitution modifier, and reduce the damage by the total. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not take this Reaction yet: using this feature spends a use and tells the DM, who rolls, gives back the Hit Points and counts the Reaction as taken." }] },
      { id: "storm", name: "Storm's Thunder (Storm Giant)", text: "A Reaction that strikes back with thunder.", features: [
        { id: "storms-thunder", name: "Storm's Thunder", level: 1, tier: "manual", checked: true, uses: { max: { prof: 1 }, recharge: "long" },
          text: "When a creature within 60 feet of you deals you damage, you may take a Reaction to deal it 1d8 Thunder damage. Uses equal to your Proficiency Bonus, all back on a Long Rest. The engine does not take this Reaction yet: using this feature spends a use and tells the DM, who rolls and applies the damage and counts the Reaction as taken." }] },
    ] },
  },
  // ---------- Halfling (19881-19899) ----------
  {
    id: "halfling", name: "Halfling", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["small"], speed: 30,
    text: "Small, bold and lucky folk who slip past bigger creatures unseen.",
    features: [
      { id: "brave", name: "Brave", level: 1, tier: "auto", checked: true, text: "Advantage on saves to avoid or end the Frightened condition.",
        grants: { modifiers: [{ on: "save", op: "advantage", scope: { condition: "frightened" } }] } },
      { id: "halfling-nimbleness", name: "Halfling Nimbleness", level: 1, tier: "manual", checked: true,
        text: "You can move through the space of any creature a size larger than you, but you can't end your move there. The engine's movement does not allow this yet; the DM moves you through." },
      { id: "luck", name: "Luck", level: 1, tier: "manual", checked: true,
        text: "When you roll a 1 on the d20 of a D20 Test (an attack roll, an ability check or a saving throw), you can reroll the die and must use the second roll. The engine keeps the 1; the DM has the die rolled again and applies that result." },
      { id: "naturally-stealthy", name: "Naturally Stealthy", level: 1, tier: "manual", checked: true,
        text: "You can take the Hide action when the only thing obscuring you is a creature at least one size larger than you. The engine's Hide works out being obscured by its own rules, which do not know this exception; the DM allows it." },
    ],
  },
  // ---------- Human (19900-19912) ----------
  {
    id: "human", name: "Human", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium", "small"], speed: 30,
    text: "Adaptable and ambitious people of every land, Medium or Small.",
    features: [
      { id: "resourceful", name: "Resourceful", level: 1, tier: "manual", checked: true,
        text: "You gain Heroic Inspiration whenever you finish a Long Rest. The engine has no Heroic Inspiration yet; the DM keeps track of it." },
      { id: "skillful", name: "Skillful", level: 1, tier: "auto", checked: true, text: "Proficiency in one skill of your choice.", grants: { skills: { n: 1, from: "any" } } },
      { id: "versatile", name: "Versatile", level: 1, tier: "assist", checked: true,
        text: "An Origin feat of your choice (Skilled is suggested). Take it in the sheet's place \"Species: Origin feat (Human)\", and the engine plays it as any feat. The engine does not tie that place to this trait yet (it is on every sheet, whatever its species), so the DM checks that only a Human fills it." },
    ],
  },
  // ---------- Orc (19913-19930) ----------
  {
    id: "orc", name: "Orc", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium"], speed: 30,
    text: "Tough, driven people who surge forward in a fight and are hard to put down.",
    features: [
      { id: "adrenaline-rush", name: "Adrenaline Rush", level: 1, tier: "auto", checked: true,
        text: "Dash as a Bonus Action, gaining Temporary Hit Points equal to your Proficiency Bonus. Uses equal to your Proficiency Bonus, all back on a Short or Long Rest.",
        uses: { max: { prof: 1 }, recharge: "short" },
        grants: { action: { time: "bonus", target: { self: true }, cost: { resource: "adrenaline-rush" }, acts: ["dash"], effects: [{ tempHp: { prof: 1 } }] } } },
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 120 feet.", grants: { senses: { darkvision: 120 } } },
      { id: "relentless-endurance", name: "Relentless Endurance", level: 1, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
        text: "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead; once per Long Rest. The engine does not do this yet: the DM sets the Hit Points to 1, and using this feature spends the use." },
    ],
  },
  // ---------- Tiefling (19931-19993) ----------
  {
    id: "tiefling", name: "Tiefling", source: "SRD 5.2.1", checked: true, tier: "manual", type: "humanoid", sizes: ["medium", "small"], speed: 30, ability: ["int", "wis", "cha"],
    text: "People marked by a fiendish legacy that gives them a resistance and spells, Medium or Small.",
    features: [
      { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: true, text: "You see in the dark out to 60 feet.", grants: { senses: { darkvision: 60 } } },
      { id: "otherworldly-presence", name: "Otherworldly Presence", level: 1, tier: "manual", checked: true,
        text: "You know the Thaumaturgy cantrip, cast with the ability chosen for your Fiendish Legacy. The engine does not give species spells yet: when you cast it, the DM applies it." },
    ],
    lineage: { name: "Fiendish Legacy", options: [
      { id: "abyssal", name: "Abyssal", text: "Resistance to Poison and Poison Spray; Ray of Sickness at level 3 and Hold Person at level 5.", features: [
        { id: "resistance", name: "Abyssal Resistance", level: 1, tier: "auto", checked: true, text: "Resistance to Poison damage.", grants: { resist: ["poison"] } },
        { id: "poison-spray", name: "Poison Spray", level: 1, tier: "manual", checked: true,
          text: "You know the Poison Spray cantrip, cast with the ability chosen for your legacy. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "ray-of-sickness", name: "Ray of Sickness", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Ray of Sickness prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "hold-person", name: "Hold Person", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Hold Person prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
      { id: "chthonic", name: "Chthonic", text: "Resistance to Necrotic and Chill Touch; False Life at level 3 and Ray of Enfeeblement at level 5.", features: [
        { id: "resistance", name: "Chthonic Resistance", level: 1, tier: "auto", checked: true, text: "Resistance to Necrotic damage.", grants: { resist: ["necrotic"] } },
        { id: "chill-touch", name: "Chill Touch", level: 1, tier: "manual", checked: true,
          text: "You know the Chill Touch cantrip, cast with the ability chosen for your legacy. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "false-life", name: "False Life", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have False Life prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "ray-of-enfeeblement", name: "Ray of Enfeeblement", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Ray of Enfeeblement prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
      { id: "infernal", name: "Infernal", text: "Resistance to Fire and Fire Bolt; Hellish Rebuke at level 3 and Darkness at level 5.", features: [
        { id: "resistance", name: "Infernal Resistance", level: 1, tier: "auto", checked: true, text: "Resistance to Fire damage.", grants: { resist: ["fire"] } },
        { id: "fire-bolt", name: "Fire Bolt", level: 1, tier: "manual", checked: true,
          text: "You know the Fire Bolt cantrip, cast with the ability chosen for your legacy. The engine does not give species spells yet: when you cast it, the DM applies it." },
        { id: "hellish-rebuke", name: "Hellish Rebuke", level: 3, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Hellish Rebuke prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." },
        { id: "darkness", name: "Darkness", level: 5, tier: "manual", checked: true, uses: { max: 1, recharge: "long" },
          text: "You always have Darkness prepared, cast with your legacy's ability: once without a spell slot (back on a Long Rest), or with any slot of a fitting level. The engine does not give species spells yet: using this feature spends the casting without a slot and tells the DM, who applies the spell; a casting with a slot is the DM's too." }] },
    ] },
  },
];
