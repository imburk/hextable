# Spec: species

Status: draft by an agent (#493), to be reviewed by the design owner. Docs only: nothing here is built. Covers the
SRD 5.2 species as content, a `species` field on the sheet, what `derive` does with each kind of trait, which traits
the vocabulary can say today and which need a small addition (each one an amendment named here), homebrew species
in a table's pack, the Fantasy Grounds importer, the species picker of the build screen, the job split and the
owner's questions. Every rule below is from `reference/srd52/srd52-flow.txt`; line numbers refer to that file. It
sits beside `docs/specs/homebrew-subclasses.md` (#492, merged in #496); "Where this meets the subclass
spec" says what the two share.

**No rules text or numbers from outside the SRD are in this spec, and none may enter the repo.** Where the owner's
party needs a species the SRD does not have, it is described by what kind of trait it needs, never by its words or
numbers; its entry goes in the owner's private pack.

## Problem

1. **The engine has no species.** The pack has no species kind (`content/index.js` builds `CONTENT` with no
   `species`), a sheet has no field for one (`SHEET_FIELDS` in `derive.js`), and `homebrew.md` Decision 9 lists
   "homebrew species and backgrounds" as "Large; engine: no such content kind and no sheet field".
2. **What a species gives is typed in by hand.** A sheet carries `size` (Small or Medium), `speed` (5 to 60),
   `senses` and `extraSkills` ("from background or species"); everything else a species does is absent. Darkvision
   works only because the number is typed; a Dwarf's Resistance to Poison, an Orc's Relentless Endurance, a
   Dragonborn's Breath Weapon and an Elf's lineage spells do not exist in play.
3. **The importer can only name it.** `import-fgxml.js` recognises the nine SRD names (`SRD_SPECIES`), carries
   Speed, size and senses, and lists every other trait as "A species trait; the engine has no species traits." Every
   one of the owner's five characters has a species; two of them are not SRD 5.2 species.
4. **The Human's Origin feat place is unconditional.** `featSlots` gives every sheet a place
   `{ at: 'species', name: 'Species: Origin feat (Human)' }` (`ORIGIN_SLOTS`), whatever its species, and DEBT C13
   says "the `species` place is not checked against a species (none entered)".

## What the SRD says

The SRD has exactly **nine** species (2718-2724, and "Species Descriptions", 19607-19975): Dragonborn, Dwarf, Elf,
Gnome, Goliath, Halfling, Human, Orc and Tiefling. Every one is Humanoid (19579-19583). A species gives a creature
type, a size, a Speed and special traits; some traits involve a choice (19575-19605). Ability score increases are
not a species' in 5.2: a background lists three abilities to raise (19500-19503; "Adjust Ability Scores", 3102-3112).

| Species | Size, Speed | Traits (SRD 5.2.1, in this project's words) | Lines |
|---|---|---|---|
| Dragonborn | Medium, 30 | **Draconic Ancestry**: choose one of ten dragons (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, White), each with a damage type (Acid, Lightning, Fire, Lightning, Acid, Fire, Poison, Fire, Cold, Cold). **Breath Weapon**: when you take the Attack action, replace one attack with a 15-foot Cone or a 30-foot Line 5 feet wide (chosen each time); Dexterity save, DC 8 + Constitution modifier + Proficiency Bonus; 1d10 of the ancestry's type, half on a success, 2d10 at character level 5, 3d10 at 11, 4d10 at 17; uses equal to the Proficiency Bonus, back on a Long Rest. **Damage Resistance** to the ancestry's type. **Darkvision** 60 ft. **Draconic Flight** (character level 5): Bonus Action, Fly Speed equal to Speed for 10 minutes or until retracted (no action) or Incapacitated; once per Long Rest. | 19608-19698 |
| Dwarf | Medium, 30 | **Darkvision** 120 ft. **Dwarven Resilience**: Resistance to Poison; Advantage on saves to avoid or end Poisoned. **Dwarven Toughness**: Hit Point maximum +1, and +1 more each level. **Stonecunning**: Bonus Action, Tremorsense 60 ft for 10 minutes while on or touching stone; uses equal to the Proficiency Bonus, back on a Long Rest. | 19699-19719 |
| Elf | Medium, 30 | **Darkvision** 60 ft. **Elven Lineage**: Drow (Darkvision 120 ft; Dancing Lights; level 3 Faerie Fire, level 5 Darkness), High Elf (Prestidigitation, which may be swapped for another Wizard cantrip on each Long Rest; level 3 Detect Magic, level 5 Misty Step), Wood Elf (Speed 35; Druidcraft; level 3 Longstrider, level 5 Pass without Trace). The level 3 and 5 spells are always prepared, cast once without a slot per Long Rest, and with any slots the character has. Intelligence, Wisdom or Charisma is the spellcasting ability, chosen with the lineage. **Fey Ancestry**: Advantage on saves to avoid or end Charmed. **Keen Senses**: proficiency in Insight, Perception or Survival. **Trance**: no sleep, magic can't put it to sleep, a Long Rest in 4 hours of trance. | 19720-19788 |
| Gnome | Small, 30 | **Darkvision** 60 ft. **Gnomish Cunning**: Advantage on Intelligence, Wisdom and Charisma saves. **Gnomish Lineage** (Intelligence, Wisdom or Charisma for its spells, chosen with it): Forest Gnome (Minor Illusion; Speak with Animals always prepared, cast without a slot a number of times equal to the Proficiency Bonus, back on a Long Rest, and with slots), Rock Gnome (Mending and Prestidigitation; 10 minutes of casting Prestidigitation makes a Tiny clockwork device, AC 5, 1 HP, one Prestidigitation effect on a Bonus Action touch, three at a time, each lasting 8 hours). | 19789-19831 |
| Goliath | Medium, 35 | **Giant Ancestry**, one boon with uses equal to the Proficiency Bonus, back on a Long Rest: Cloud's Jaunt (Bonus Action, teleport up to 30 ft to a space you can see), Fire's Burn (on a hit with an attack roll that deals damage, 1d10 Fire more), Frost's Chill (on such a hit, 1d6 Cold more and the target's Speed 10 ft lower until the start of your next turn), Hill's Tumble (on such a hit on a Large or smaller creature, Prone), Stone's Endurance (Reaction on taking damage: reduce it by 1d12 + Constitution modifier), Storm's Thunder (Reaction on taking damage from a creature within 60 ft: 1d8 Thunder to it). **Large Form** (character level 5): Bonus Action, Large for 10 minutes if there is room, Advantage on Strength checks, Speed +10; once per Long Rest. **Powerful Build**: Advantage on checks to end Grappled; one size larger for carrying capacity. | 19832-19880 |
| Halfling | Small, 30 | **Brave**: Advantage on saves to avoid or end Frightened. **Halfling Nimbleness**: move through the space of a creature a size larger, without stopping there. **Luck**: a 1 on the d20 of a D20 Test may be rerolled, and the new roll is used. **Naturally Stealthy**: may Hide when obscured only by a creature at least a size larger. | 19881-19899 |
| Human | Medium or Small, chosen, 30 | **Resourceful**: Heroic Inspiration on each Long Rest. **Skillful**: one skill of your choice. **Versatile**: an Origin feat of your choice. | 19900-19912 |
| Orc | Medium, 30 | **Adrenaline Rush**: Dash as a Bonus Action, gaining Temporary Hit Points equal to the Proficiency Bonus; uses equal to the Proficiency Bonus, back on a Short or Long Rest. **Darkvision** 120 ft. **Relentless Endurance**: reduced to 0 Hit Points but not killed outright, drop to 1 instead; once per Long Rest. | 19913-19930 |
| Tiefling | Medium or Small, chosen, 30 | **Darkvision** 60 ft. **Fiendish Legacy** (Intelligence, Wisdom or Charisma, chosen with it): Abyssal (Resistance to Poison; Poison Spray; level 3 Ray of Sickness, level 5 Hold Person), Chthonic (Resistance to Necrotic; Chill Touch; level 3 False Life, level 5 Ray of Enfeeblement), Infernal (Resistance to Fire; Fire Bolt; level 3 Hellish Rebuke, level 5 Darkness); the level 3 and 5 spells as the Elf's. **Otherworldly Presence**: Thaumaturgy, cast with the legacy's ability. | 19931-19975 |

What the SRD leaves open and this design does not fill: what a species' "level" means for a character with several
classes (the SRD says "character level" throughout, so the engine uses the sum of class levels, as it does for the
Proficiency Bonus); and how a Trance shortens a rest in a game whose rests are one action (see the survey).

## Goals

- The nine SRD species are content, one entry each, in the SRD pack, compared field by field with the SRD text.
- A sheet names its species and the choices the species asks for, and `derive` builds the traits into the record,
  as it builds class features and feats today, with the reasons in `why`.
- Every trait the current vocabulary can say is played by the engine; every trait it cannot is a feature with
  `tier: 'manual'` and DM text, until its amendment is built. No trait is approximated.
- A table's homebrew pack can carry a species in the same entry shape, under the same gate (strict mode, `hb-` ids,
  limits, readings), and a character keeps a species whose pack is gone, with its traits absent and the DM told.
- The importer maps a sheet's species by name to the SRD entry or the table's homebrew one, with the choice the name
  implies, and says what it could not tell.
- No state version bump: the sheet gains an optional field, and the record only gains fields it already has.

Not in this spec: backgrounds (the other half of "origin"; their own note, see question Q8), Heroic Inspiration as
a rule of play (its own engine job; see the survey), languages (a sheet has none; DEBT C9).

## The decisions

### Decision 1: a species is a pack entry with features, like a subclass

```js
{
  id: 'dwarf', name: 'Dwarf', source: 'SRD 5.2.1', checked: true, tier: 'auto' | 'assist' | 'manual',
  text: 'A short description in this project\'s words.',
  type: 'humanoid',                          // a creature type of CREATURE_TYPES
  sizes: ['medium'],                         // one, or the sizes the player chooses between (Human, Tiefling)
  speed: 30,                                 // feet, a multiple of 5
  ability: ['int', 'wis', 'cha'],            // optional: the abilities its spells may use, chosen once (Elf, Gnome, Tiefling)
  features: [ /* class-feature shape: { id, name, level, tier, checked, text, uses?, grants?, options? } */ ],
  lineage: {                                 // optional: one choice that brings its own features (Elven Lineage, Giant Ancestry)
    name: 'Elven Lineage',
    options: [ { id: 'drow', name: 'Drow', text: '...', features: [ ... ] }, ... ]
  }
}
```

- **The features are class features.** Each is checked by the same `lintFeature` (`content/schema.js`) that checks a
  class's, with the same `grants`, `uses`, `options` and tiers. There is no second vocabulary for species, so the
  reader, the derive code and every grant built for classes serve species at once, and every grant built for a
  species (the amendments below) serves classes and subclasses.
- **`level` is the character level.** A species feature's numbers go by the character's level (the sum of its class
  levels), as the SRD says ("character level 5", 19688, 19869; "when you reach character levels 3 and 5", 19738), and
  the Proficiency Bonus by the same. In `derive` a species feature is carried as feats are today:
  `cls: { c: SPECIES_CLASS, level: total }` (the pattern of `FEAT_CLASS`), so `amount()` reads `{ prof: 1 }`,
  `{ perLevel: 1 }` and `{ byLevel }` at the character level. A `{ column }` amount is refused in a species: it has no
  class table.
- **`lineage` is the one choice that brings features.** The SRD has five such choices: Draconic Ancestry, Elven
  Lineage, Gnomish Lineage, Giant Ancestry and Fiendish Legacy. Each option has its own feature list with levels, so
  an Elf's level 3 and level 5 spells come with its lineage without asking twice, and a Dragonborn's ancestry carries
  its own Breath Weapon and Resistance of its type. This repeats some data (ten Breath Weapons that differ only in
  damage type), which costs nothing at run time and needs no "type of the choice" reference in the vocabulary. A
  species has at most one `lineage`; its other choices (Keen Senses' skill, the Goliath's size) are ordinary feature
  `options` or sheet fields. This is the subclass shape: a list of features with levels, picked once (#492).
- **Ids.** A species id is kebab-case, used once in the kind. In the record a species feature is
  `species-<feature id>` (and `species-<lineage id>-<feature id>`), so it can never collide with a class feature or a
  feat (`feat-...`, `item-...`). A cost or a `with` inside a species names the species' own ids; `derive` relabels
  them as `relabel` already does for a later class.
- **`tier`** of the entry is the lowest of its features' and its chosen lineage's (a species is `auto` only when every
  trait plays). The linter refuses an `auto` species with a `manual` feature, as it does for spells.
- **`type`** is always `humanoid` in the SRD. It is there for homebrew: the record gains `type` only when it is not
  `humanoid`, which `creatureType` in `engine/world.js` already reads (`e.type ?? ... 'humanoid'` for a character).
  `makeEntity` must carry it; that is one line of the build job.

**Where it lives.** A new pack file `content/srd52/species.js` and a lint function `lintSpecies` in `schema.js`
(beside `lintFeatDef`), wired into `lintPack({ ..., species })` and `CONTENT.species` in `content/index.js`.
`npm run content` gains a species line by tier.

### Decision 2: the sheet names the species and its choices in one field

```js
species: { id: 'elf', lineage: 'wood-elf', ability: 'wis', choices: { 'keen-senses': 'perception' }, spells: { ... } }
```

- `id` is a species of the pack (SRD or the table's homebrew). `lineage` is one of its lineage options, required
  when it has a lineage. `ability` is one of its `ability` list, required when it has one. `choices` holds the
  options of its features, by species feature id, as the sheet's `choices` does for class features (kept apart, so a
  species feature and a class feature may share an id in the pack). `spells` holds a pick a feature leaves open (the
  High Elf's cantrip from the Wizard list; S2 below).
- **Size.** `sheet.size` stays where it is. With a species, `validate` requires it to be one of `sizes` (absent means
  the first): "A Dwarf is Medium." A species whose `sizes` holds one size needs nothing on the sheet.
- **Speed.** With a loaded species the base Speed is the species', and the sheet's own `speed` is refused with a
  sentence ("Speed comes from the species: a Goliath has 35 ft"); a Wood Elf's 35 ft is a feature's `speed` grant on
  top. Without a species the sheet's `speed` works as today. (Question Q2: keep `speed` as a DM override instead.)
- **Senses and skills.** `sheet.senses` stays and is joined with the species' (the larger range wins, as `derive`
  already does for grants). `extraSkills` stays for the background's skills and anything typed; a species skill is
  the species' own (Skillful, Keen Senses), counted by `validate` like a feature's `skills` grant, so a sheet that
  lists it in `extraSkills` too is told "Perception comes from Keen Senses."
- **Old sheets.** A sheet without `species` derives exactly as today. No migration: `species` is optional, and the
  state shape does not change (the record gains only `type`, which is optional already).
- **`setSheet` and `refresh`** need nothing new: both call `derive`, and `remake` keeps play state by the list it
  keeps today (`carryPlay`). A species feature's uses are kept by id like a class feature's (`e.uses`).

### Decision 3: what `derive` does with each kind of trait

`classFeatures(sheet)` stays as it is; a new `speciesFeatures(sheet)` returns the species' features up to the
character level, then its lineage's, then each option chosen, in the shape `{ f, cls }`, and `gather` puts them first
in `feats` (before class features), so everything below happens by the existing code:

| Trait kind | How it is said | What `derive` does (existing code unless marked) |
|---|---|---|
| Speed | `speed` on the entry; `grants.speed` for more (Wood Elf) | the base Speed; then the `speed` grants as today |
| Size | `sizes` on the entry; `sheet.size` | the record's `size`, checked by `validate` |
| Senses (Darkvision) | `grants.senses` | the larger range wins, as today (a Drow's 120 over the Elf's 60) |
| Resistances | `grants.resist` | into `resist`, as today |
| Advantage on saves against a condition | `grants.modifiers` with `scope.condition` (exists for Protection from Poison) | into the feature's `modifiers`, read by `modifiers.js` |
| Advantage on saves of some abilities | `grants.modifiers` on `save.int` and the like | as above |
| Hit Points per level | `grants.hp: { perLevel: 1 }` | `amount` at the character level, as for feats |
| Skill proficiencies | `grants.skills` (S3 for a list to choose from) | counted by `validate`; the chosen skill from `species.choices` |
| An Origin feat | a feature with `feat: 'origin'` (S4) | a place for a feat, `at: 'species'`, only for a species that has one |
| A Bonus Action with uses (Adrenaline Rush) | `uses: { max: { prof: 1 }, recharge: 'short' }`, `grants.action` with `acts: ['dash']` and a `tempHp` step of `{ prof: 1 }` | uses and the action, baked as for a class feature |
| A breath weapon | `uses`, `grants.action` with a save of `dc: 'con'`, damage `{ byLevel }` dice by character level; S5 and S6 | the DC (8 + Proficiency + Constitution) and the dice are baked in, as for a class's action |
| Spells known and always prepared (lineage spells) | `grants.innate` (S2), with `freeCast: { spells }` and `uses` for the free casting | the spells into `spells`, each cast with `species.ability` through `spellAbil`, outside every class's count (S2) |
| Free casting a number of times | `uses: { max: { prof: 1 } }` with `freeCast` (Forest Gnome), or `{ max: 1, recharge: 'long' }` (Elf, Tiefling) | as for Magic Initiate's free cast |
| Staying up at 0 Hit Points (Relentless Endurance) | `grants.relentless` (S7) | `relentless` in `engine/resolve.js` |
| A temporary Fly Speed equal to Speed | `grants.action` with a `speed.fly` modifier (S8 for "equal to Speed") | the action with the number baked in |
| A rider on a hit, spending a use (Giant Ancestry) | S9 | see S9 |
| A Reaction to taking damage | S10 | see S10 |
| Rerolling a 1 on a D20 Test | S11 | see S11 |
| Moving through a larger creature's space | S12 | see S12 |
| Anything else | a feature with `tier: 'manual'` and DM text | the DM is told in play, as for any manual feature |

`why` gains `species`: the species and lineage named, its ability for spells, and for Speed, Hit Points and spells
the species' part ("Dwarven Toughness +5"), as `why.hp` already lists features.

### Decision 4: the survey of the SRD traits, and the amendments

What each SRD trait needs. "Today" means the vocabulary of `content/schema.js` on main (18 November) can say it and
the engine plays it once the species kind exists (Decisions 1 to 3). An amendment is an engine change with this spec
amended, built in its own job, never part of a content change; until it lands the trait is entered as `manual` (or
its feature `assist`) with DM text, and the entry's tier says so.

| Trait | Today | Needs |
|---|---|---|
| Darkvision (all but Goliath, Halfling and Human) | yes: `grants.senses` | |
| Damage Resistance (Dragonborn, Dwarf, Tiefling) | yes: `grants.resist` | |
| Dwarven Resilience, Fey Ancestry, Brave | yes: `modifiers` on `save` with `scope.condition` and `advantage` | |
| Gnomish Cunning | yes: `modifiers` on `save.int`, `save.wis`, `save.cha` | |
| Dwarven Toughness | yes: `grants.hp: { perLevel: 1 }` at the character level | |
| Wood Elf Speed, Drow Darkvision | yes: `grants.speed`, `grants.senses` | |
| Adrenaline Rush | yes: Bonus Action, `acts: ['dash']`, `tempHp: { prof: 1 }`, uses `{ prof: 1 }`, recharge `short` | |
| Powerful Build | half: `modifiers` on `check` with `when: ['check.escape']` (the tag exists, grapple-shove.md); carrying capacity is not tracked | the carrying half is a `manual` line |
| Skillful | yes: `grants.skills: { n: 1, from: 'any' }` | |
| Keen Senses | no: `skills.from` is `class` or `any` | **S3** |
| Versatile | half: the place exists for every sheet | **S4** |
| Lineage cantrips and spells, Otherworldly Presence | no: `grants.spells` adds only to a class's prepared list (`derive`, `x.cls.i === k.i`), so a Fighter Tiefling gets nothing | **S2** |
| The free casting of lineage spells | yes once S2 lands: `freeCast: { spells: [id] }` with `uses` | |
| High Elf cantrip swap on a Long Rest | no: a sheet edit | `manual` text: the player changes the pick, the DM applies it with `setSheet` (assist) |
| Breath Weapon | no: an action's `modes` share one `target`, and a feature's action spends the whole action | **S5**, **S6**; its type is the lineage's own copy (Decision 1) |
| Draconic Flight | half: Bonus Action, `duration`, `endsWhenIncapacitated`, uses 1; a `speed.fly` `set` takes a number only | **S8** |
| Relentless Endurance | no: `relentless` needs `while` (an effect going) and a save | **S7** |
| Cloud's Jaunt | likely: a Bonus Action with a `teleport` step, `cost: { resource }` naming the Giant Ancestry feature's uses (SP2 checks that a feature's action runs `teleport` as a spell's does; if not, `manual` with its use enforced) | |
| Fire's Burn, Frost's Chill, Hill's Tumble | half: `after: 'hit'` is once a turn and may come later in the turn | **S9** |
| Stone's Endurance, Storm's Thunder | no: a feature's `reaction` cuts only an attack's hit (`on: 'hit'`), or answers damage with a melee attack (Retaliation) | **S10** |
| Large Form | half: Bonus Action, 10 minutes, uses 1, Advantage on Strength checks, Speed +10; no step changes size | the size change is a `manual` step (assist). A `size` step is a later amendment, shared with Enlarge/Reduce (`spells-2.js`, manual today) |
| Stonecunning | no: Tremorsense plays no part in sight (`sight.js`, "Tremorsense is not sight") | `manual`, with its uses enforced (a manual action, as the linter allows) |
| Luck | no | **S11** |
| Halfling Nimbleness | no: passing creatures follows W6's rule only | **S12** |
| Naturally Stealthy | no: Hide's conditions are the engine's own | `manual` |
| Trance | no: rests are one action; sleep is not a condition | `manual` |
| Resourceful | no: the engine has no Heroic Inspiration (DEBT C15 waits on it for Heroic Warrior) | `manual` until Heroic Inspiration is built as a rule of play (its own job, not an amendment of this spec) |
| Rock Gnome's clockwork devices | no: an object made by a spell | `manual` |

The amendments, each small and each serving classes too:

- **S1, the species kind.** `lintSpecies`, `CONTENT.species`, the `species` sheet field, `speciesFeatures`, the
  `why` lines, `type` on the record. Decisions 1 to 3. No new grant.
- **S2, `grants.innate: { spells: [ids], pick?: { list, level, n } }`.** Spells the character knows and always has
  ready, cast with the sheet's `species.ability` (or, outside a species, the ability its feature names), added to
  `record.spells` with `spellAbil`, and counted against no class's cantrips or prepared spells. A character with no
  class that casts gets `castAbil` from it, as Magic Initiate gives one today (`firstAbil`). `pick` leaves a choice
  to the sheet (`species.spells`). The level a spell comes at is its feature's `level`.
- **S3, `skills.from` may be a list of skills** (`{ n: 1, from: ['insight', 'perception', 'survival'] }`); the pick is
  in `species.choices` (or the sheet's `choices` for a class feature). This is addition A of the subclass note
  (#492), "choices from a short list": one change serves both.
- **S4, `feat: 'origin'` on a feature.** A place for an Origin feat at that feature, as `feat: 'any'` is a place for
  any feat. `ORIGIN_SLOTS` loses its fixed species place, which becomes the Human's Versatile feature
  (`at: 'species'` is kept as the place's name, so sheets saved before keep their feat; a sheet with a feat
  `at: 'species'` and no species that grants the place keeps it until its species is entered, and `validate` then
  says so: question Q3).
- **S5, a mode of an action may have its own `target`** (`modes: [{ id, name, target?, effects }]`), so one use picks
  a Cone or a Line. Without it, the mode uses the action's.
- **S6, `inAttack: true` on an action.** The action may replace one attack of the Attack action on its creature's
  turn: it spends one attack from `budget.attacks` (`fromPool` in `engine/attacks.js`), or, as the first attack,
  the action itself, leaving the Attack action's other attacks in the pool as an attack would. Refused outside the
  Attack action and off its turn.
- **S7, `relentless` with no `while`, `dc` or `step`.** Then it needs no effect going and no save, spends one of its
  feature's uses (refused when none is left), and sets the Hit Points to `hp`. `{ while, dc, step, hp }` stays for
  Relentless Rage.
- **S8, a modifier `value` of `{ speed: 1 }`** on `speed.fly` (or `speed.swim`, `speed.climb` when those hooks exist):
  "equal to the creature's Speed", baked by `derive` to the number when the record is made.
- **S9, a rider on a hit, built on `after: 'hit'`.** The vocabulary already has an action used on a creature its
  creature hit with an attack roll this turn (`after: 'hit'`, Hurl Through Hell), with a `cost` from another
  feature's uses; the subclass note (#492, addition F) proposes `after: 'weaponHit'` beside it. A Giant Ancestry boon
  needs three things neither gives: no once-a-turn limit (`after: 'hit'` is once a turn), a hit that **dealt
  damage**, and the use **at that hit**, not later in the turn. So S9 is one more value, `after: 'damagingHit'`: a
  `free` action on the creature just hit and damaged, before anything else happens, as often as uses allow; and
  `largest` on its target (Hill's Tumble: Large or smaller; the `move` step's `largest` exists). Taken by a standing
  instruction (`reactions.js`, `always` or `never`) as Persistent Rage and Indomitable are, until prompts can ask.
  Until S9 is built each of the three boons is a `manual` feature with a cost-only action, so the use is still spent
  (the pattern #492 uses for its own riders).
- **S10, `reaction: { on: 'damaged', within?, cut? | effects? }`.** On taking damage (any damage, not only a hit):
  `cut` reduces it as Deflect Attacks' does (`{ dice, add }`, where `add` may be `{ mod: 'con' }`); or `effects` run on
  the creature that dealt it, if it is within `within` feet. Spends the feature's use and the Reaction.
- **S11, `grants.lucky: true`.** A natural 1 on the d20 of its creature's D20 Test (attack roll, ability check,
  saving throw) is rolled again and the new roll is used. It is a rule, not a choice ("you can reroll" is always
  better than a 1), so it is not asked.
- **S12, `grants.nimble: true`.** Its creature may move through the space of a creature at least one size larger,
  and may not end its move there (`engine/movement.js`, the pass-through rule of W6).

With S1 alone the Dwarf plays all but Stonecunning, the Orc all but Relentless Endurance (S7), and every species the
Darkvision, Resistances and save Advantages it has. S2 brings the lineage spells of the Elf, the Gnome and the Tiefling;
S3 and S4 the Elf's and the Human's choices; S5 to S8 the Dragonborn and Relentless Endurance; S9 and S10 the Goliath's
boons; S11 and S12 the Halfling. What stays `manual`, with its reason above: Powerful Build's carrying half, the High
Elf's cantrip swap, Large Form's size, Stonecunning, Naturally Stealthy, Trance, Resourceful and the clockwork devices.

### Decision 5: homebrew species, in a table's pack

A homebrew pack (`homebrew.md` Decision 1) gains the kind `species`:

```js
{ format: 'hextable-pack', v: 1, pack: { id: 'ember-folk', ... }, species: [ { id: 'hb-ember-folk-ash-born', ... } ] }
```

- **Same entry shape, same gate.** A homebrew species is the shape of Decision 1, checked by `lintSpecies` in strict
  mode (`homebrew.md` Decision 2) after `budget`, then the homebrew rules (`lintRules`: prefix, `source:
  'homebrew:<pack id>'`, `checked: false`, a name that is not an SRD species' name by `nameKey`, as for every kind, so
  a table's species can never be taken for the SRD's). Strict key shapes (`lintKeys`): the entry has `id`, `name`,
  `source`, `checked`, `tier`, `text`, `type`, `sizes`, `speed`, `ability`, `features`, `lineage`, `dmNotes`; `lineage`
  has `name` and `options`; a lineage option has `id`, `name`, `text`, `features`; a feature and an option have the
  key lists the subclass note gives them (#492, Decision 2). No function, no prototype key. The id, every feature id
  and every lineage option id carry the `hb-<pack id>-` prefix. A feature key the vocabulary lacks is refused, so a
  homebrew trait the vocabulary cannot say is a `manual` feature with DM text, honestly tiered (a cost-only action
  keeps its use spent), as an SRD one is. `HOMEBREW_ENTRY_KINDS` (`content/schema.js`) and `HOMEBREW_LOOKUPS`
  (`content/registry.js`) gain `species`, so `overlayOf` puts them in `CONTENT.species` for the table, and `using`
  lends them to `derive` for one call.
- **Limits.** The Dragonborn, with ten lineages each holding its own Breath Weapon, is the largest SRD species and
  will pass the 8 KB of one entry. Proposed (question Q9), the same as the subclass note's: one species entry up to
  **16 KB**, at most **12 features**, a lineage of at most **12 options**, each with at most **6 features**; the step
  and depth limits as for every entry, counted over all its features.
- **A homebrew species uses only SRD or the same pack's spells** in `innate` and `freeCast`, as a homebrew item's
  spell does: the cross-reference check of `vetAdd` already covers ids across the pack and the SRD.
- **What players are sent.** `PLAYER_PACK_KINDS` (`content/packs.js`) gains `species`: a species is the character's
  own, like a feat or a spell, and the owner's rule keeps only monsters with the DM. A player is sent the whole pack's
  species, as they are sent its feats today (a player picking a species in the build screen needs the list).
- **Readings.** `readEntry('species', entry)` in `content/reader.js`, as the readers of items and feats: its type,
  size, Speed, then one line per feature (the feature reader already exists for feats' `grants`), the lineage and
  its options, the tier banner, and the `manual` lines in quotes as the author's words. The pack manager shows it as
  any reading. Golden tests on an invented species, written for this project, as `reader.js` has for spells.
- **A removed or absent pack.** The rule of the unloaded Shield (`derive.js`, `shieldEntry` and the `acWhy` line "its
  entry is not loaded at this table") and of the homebrew subclass (#492): **the sheet keeps the id, the traits are
  absent, and the DM is told.**
  - The DM cannot remove a pack while a sheet names its species: `inUse` (`content/packs.js`) already finds any
    `hb-` id anywhere in the state, a sheet's `species.id` included, and the server lists it as a blocker.
  - A species can still be absent: the operator deleted the pack, the DM switched it off (`enabled`), a solo game was
    opened without it, or a travelling character names it (`portable-characters.md`, the compatibility report).
  - Then `derive` gives no species trait, the base Speed is the sheet's `speed` or 30, the size is the sheet's or
    Medium, `why.species` says `Species "hb-ember-folk-ash-born": its entry is not loaded at this table, so it gives
    no traits.`, and `derive` returns `missing: [{ kind: 'species', id }]` beside the record, the list the subclass
    note adds for a missing subclass (#492, Decision 4). `validate` does not refuse the sheet for it (the character
    must still load), and no choice in `species` is checked against a species it cannot see.
  - The DM is told in play: every handler that makes a character from its sheet (`setSheet`, `refresh`, `levelUp`
    and the `resheet` of gear and rests, all through `remake` in `engine/sheets.js`) pushes, when `missing` is not
    empty, one DM-only `manual` event (`partial: true`, as `refresh` already sends for a sheet's problem) naming the
    character and what is missing; one event lists a missing species and a missing subclass together. The build
    screen shows `why.species` to the DM. Players see their own sheet's line, never the event.
  - When the pack comes back, `refresh` builds the traits again; the uses a feature had are kept by id if its id is
    unchanged (`carryPlay`).
- **Portable characters.** A character file's `needs.homebrew` lists the species id like any homebrew id, and
  only the id, as the subclass note decides for subclasses (#492, question 6): carrying the entry in the file's
  `homebrew.bundle` waits for the owner's word (#349; question Q5).

### Decision 6: the importer maps a species by name, and leaves the scores as they stand

`import-fgxml.js` today notes the race. With S1 it sets `sheet.species` when it can:

1. **Name.** The race name is normalised and matched: first a species of the table's packs whose whole name it is
   (`CONTENT.species` while the table's overlay is installed, which is how the client already calls the importer),
   by `nameKey` and the whole-word test the subclass note uses (#492, Decision 5); else an SRD species whose name is
   a word of it (as `SRD_SPECIES` does today, and still not for a 2014 mixed-heritage name, which the current
   `/\bhalf\b/` test already sets apart). A homebrew species cannot have an SRD species' name, but its name may
   contain one ("Ash Dwarf"), so the whole-name homebrew match goes first (question Q4). Exactly one homebrew match
   is used; two give none and a note naming both; nothing matched gives a note, as today, and no `species`.
   `options.homebrewSpecies === false` turns homebrew matching off.
2. **The lineage**, from the name: a dragon colour word gives the Draconic Ancestry; a lineage word gives the Elf's or
   the Gnome's ("Wood Elf" is `wood-elf`; a 2014 subrace name that is the 5.2 lineage's name maps to it); for a
   Tiefling or Goliath sheet that names none, the lineage whose cantrip or spells the file's innate spells name
   (`powers` in an innate group, read by name only), else the first, as an **adjustment** ("no legacy on the sheet:
   Abyssal is a stand-in"). A 2014 subrace with no 5.2 lineage (a 5.2 species with no lineage) is dropped with a note.
3. **The ability** for its spells: the file does not say it in a form the importer reads, so the highest of the
   allowed abilities is taken, as an adjustment.
4. **Choices** (Keen Senses' skill, Skillful's skill): a proficient skill on the sheet that the choice allows is taken
   for it, and removed from `extraSkills`; else the first allowed, as an adjustment.
5. **Speed, size, senses.** With a species set, the file's base Speed is not put on the sheet (Decision 2) but
   compared in `report.numbers` with the record's; its senses are kept only where they exceed the species'; its size
   must be one the species allows, else an adjustment.
6. **Traits** in the file's `traitlist` that the species entry has (by name) are no longer notes; the rest stay notes,
   with the words "not a 5.2 trait of this species" for a 2014 trait.

**Ability scores (2014 against 5.2).** A 2014 species raised scores; in 5.2 the background does (19500-19503). The
file's scores already include the 2014 increase, and the file does not say which points came from the species. The
importer **keeps the scores as they stand** (as it does for an Ability Score Improvement) and writes one
`ruleDifferences` entry, as today: "2014 species give ability score increases; 5.2 gives them through the
background. The scores were imported as they stand on the sheet." Subtracting a guess would change a character's
numbers on no evidence, and backgrounds are not entered to add the 5.2 points back. (Question Q6.)

**The owner's party.** Of the five, three name SRD 5.2 species (one with a dragon colour that selects a Draconic
Ancestry), and two do not: one is a 2014 mixed-heritage lineage with no 5.2 entry, one is from a book outside the
SRD. For either, the DM may enter a homebrew species in the table's private pack (Decision 5) whose name the
importer then matches; this spec does not say what such an entry contains, and none is written in the repo.

`docs/import-characters.md` is updated by the importer job: the species row of "What is mapped", the `species`
category, and the adjustments.

### Decision 7: the species picker in the build screen (a separate client job)

`packages/client/buildsheet.js` today keeps `size`, `speed` and `senses` as typed (`KEEP`). With S1 it gains, at the
top of the sheet beside the class:

- **Species**: a select of `CONTENT.species` (the SRD nine and the table's homebrew ones, homebrew marked "this
  table's"), with "none (typed in)" for sheets built before. Choosing one shows its size choice (only for a species
  with two), its lineage, its spell ability, and its feature options, each a select, the same controls the class
  features' options use.
- **The reasons**: the species' traits listed with their tiers, as class features are, and `why.species`.
- **What it removes**: choosing a species removes the typed `speed` (Decision 2) after saying so; `senses` and
  `extraSkills` stay.
- **The Human's Origin feat** place appears only for a species that has it (S4); the feat picker of #302 is reused.
- Phones: the selects stack in one column at 390 x 844; checked at both sizes with touch, as every UI change.

The Fantasy Grounds import panel (`importfg.js`) shows the new species rows; its "Species are not in the pack" line
goes.

## Where this meets the subclass spec (#492)

The two notes were written at the same time; the subclass note is on main (#492, PR #496). Read them together. They agree on:

- **Entry shape.** Both are lists of class-shaped features (`{ id, name, level, tier, checked, text, uses?, grants?,
  options? }`) checked by `lintFeature`, with no vocabulary of their own and the same strict key lists for a feature
  and an option. A species' `lineage` is shaped as a subclass is: a picked list of features with levels. The
  differences are where the levels come from (a subclass's are its class's levels and may name its class's table
  columns and pools; a species' are character levels and may name neither) and what is refused (a subclass may not
  carry `feat: 'any'`; a species may carry `feat: 'origin'`, S4).
- **Homebrew rules.** A new kind in `HOMEBREW_ENTRY_KINDS` and `HOMEBREW_LOOKUPS`, the gate in the same order,
  `hb-<pack>-` ids for the entry and every feature and option, `checked: false`, a name that is not the SRD's
  (`nameKey`), `dmNotes` stripped for players, a `manual` feature with a cost-only action for what the vocabulary
  cannot say, readings in the pack manager, sent to every member (`PLAYER_PACK_KINDS`), an entry limit of 16 KB.
- **The removed-pack rule.** The sheet keeps the id, the features are absent, `validate` does not refuse it, `derive`
  returns `missing`, one DM-only `manual` event from `remake`, `inUse` blocks the DM's own removal, and `refresh`
  rebuilds when the pack is back, keeping spent uses by id.
- **The importer.** A homebrew match by name inside `using`, exactly one or none, shown in the report before the DM
  confirms; a switch to turn it off.
- **Character files.** Only the id; the entry is not carried until the owner says (#349).
- **Amendments.** S3 is the subclass note's addition A (one change). S9 builds on `after: 'hit'` as the subclass
  note's addition F does (`after: 'weaponHit'`); the two values should land in one job. S2 (spells known outside a
  class's count) is not needed by a subclass, whose spells go by its class. Where the two name a grant for the same
  need differently, the build job picks one name and amends both notes.

## Jobs

Each runs `npm test`, `npm run content` and `npm run build`; each mechanic lands with a test.

| # | Job | Lane | Model | Files | Done when |
|---|---|---|---|---|---|
| SP1 | **The species kind and the sheet** (S1). `lintSpecies`, the `species` sheet field, `speciesFeatures`, `why.species`, the size and Speed rules, `type` on the record and the entity, the absent-species rule. No entries yet: test fixtures written for this project. | engine | Opus | `content/schema.js`, `content/index.js`, `derive.js`, `engine/sheets.js` (`type`), `packages/rules/test/species.test.js` | A fixture species' Resistance, Darkvision, save Advantage, Hit Points per level, a Bonus Action with uses and a lineage's level 3 feature play; a sheet without `species` derives byte-identical records to main for every pregen and test sheet; a missing species leaves the id, gives no traits, and `why.species` and a DM-only event say so. |
| SP2 | **The nine SRD species as data.** Every trait the vocabulary says after SP1; the rest `manual` with DM text; `checked: true` only after comparing every field with lines 19607-19975. | content | Opus | `content/srd52/species.js` (new), `content/index.js` | `npm run content` lists 9 species with their tiers; no `manual` text claims what the engine does. |
| SP3 | **S2 to S4**: innate spells, skill lists, the Origin feat place; then re-tier the species that use them. | engine | Opus | `content/schema.js`, `derive.js`, `content/srd52/species.js`, `tests` | A Fighter Tiefling casts its legacy cantrip with its legacy ability and its level 3 spell once without a slot; a Wizard Elf's lineage spells do not count against its prepared spells; Keen Senses accepts only its three skills; a Dwarf has no Origin feat place and a Human has one. |
| SP4 | **S5 to S8**: per-mode targets, an action in the Attack action, `relentless` with uses, "equal to Speed". | engine | Opus | `content/schema.js`, `engine/attacks.js`, `engine/features.js`, `engine/resolve.js`, `derive.js`, `content/srd52/species.js`, `tests` | A level 5 Fighter Dragonborn breathes a Line in place of its first attack and makes its second; refused outside the Attack action; an Orc drops to 1 Hit Point once and to 0 the second time; Draconic Flight's Fly Speed is the record's Speed. |
| SP5 | **S9 and S10**: `after: 'damagingHit'` (with #492's `after: 'weaponHit'`, one job) and the damaged Reaction. | engine | Opus | `content/schema.js`, `engine/resolve.js`, `reactions.js`, `content/srd52/species.js`, `tests` | Each Giant Ancestry boon plays once per use; Stone's Endurance cuts any damage, Storm's Thunder hits the source within 60 ft only. |
| SP6 | **S11 and S12**: Luck and Nimbleness. | engine | Opus | `engine/rolls.js`, `engine/resolve.js` (the attack roll), `engine/movement.js`, `content/schema.js`, `tests` | A Halfling's natural 1 on an attack, a check and a save is rolled again (seeded, replayable); it walks through an Ogre's space and cannot stop there. |
| SP7 | **Homebrew species.** The kind in `HOMEBREW_ENTRY_KINDS` and `HOMEBREW_LOOKUPS`, strict key lists, the 16 KB limit, `PLAYER_PACK_KINDS`, `readEntry('species')`, `missing` and the DM-only event in `remake` (shared with #492's B2: whichever lands second extends it). | engine | Opus | `content/registry.js`, `content/schema.js`, `content/packs.js`, `content/reader.js`, `engine/sheets.js`, `tests` | An invented species in a test pack plays at a table; strict mode refuses an unknown key, an SRD id and an id without the prefix; a player is sent the species; the reading's numbers equal the entry's. |
| SP8 | **The importer.** Decision 6, and `docs/import-characters.md`. | engine | Sonnet | `import-fgxml.js`, `docs/import-characters.md`, `packages/rules/test/import-fgxml.test.js` | A test file (written for this project) naming "Wood Elf" gets `species: { id: 'elf', lineage: 'wood-elf', ... }` with no typed Speed; a homebrew name matches a table's species inside `using`; an unknown name stays a note; scores are unchanged. |
| SP9 | **The species picker.** Decision 7. | client | Sonnet | `packages/client/buildsheet.js`, `quickentry.css`, `importfg.js`, `packages/client/test/*`, a smoke pass | At 1280 x 800 and 390 x 844 with touch a player builds a Tiefling, picks a legacy, an ability and a size, and sees the traits with tiers; a homebrew species of the table appears marked. |

SP1 comes first; SP2 needs SP1; SP3 to SP6 each need SP2 and may run in parallel (they touch different engine
modules but all touch `schema.js`: one at a time there); SP7 needs SP1; SP8 needs SP2 (and SP7 for homebrew names);
SP9 needs SP2.

## Questions for the owner

Each has a default the jobs follow if he does not answer.

- **Q1. Lineages as one choice with their own features** (Decision 1), at the cost of repeated data in the
  Dragonborn's ten ancestries? *Default: yes.*
- **Q2. A sheet's own `speed` beside a species**: refused (the species sets it), or kept as a DM override? *Default:
  refused; the DM's `setSpeed` is the override in play.*
- **Q3. Old sheets with a feat `at: 'species'`** and no species that grants the place: keep the feat with a warning,
  or drop it? *Default: keep it, with a line in `why`, until the sheet names a species.*
- **Q4. A sheet's species name that matches a homebrew species whole and an SRD species by one word** ("Ash
  Dwarf"): which does the importer pick? *Default: the homebrew one, shown in the report before the DM confirms.*
- **Q5. Species in a character file's bundle** (`homebrew.md` Decision 4 lists spells, items, feats, weapons and
  armour)? *Default: not built; the file names the id only, as for subclasses (#492), until the owner says (#349).*
- **Q6. 2014 ability score increases**: keep the scores as they stand, or ask the DM to say which points came from
  the species? *Default: keep them, with the `ruleDifferences` line.*
- **Q7. Standing instructions for the Giant Ancestry riders** (S9) until prompts exist: `always` by default (a use
  spent on the first hit) or `never`? *Default: `never` until the player sets it, as Indomitable.*
- **Q8. Backgrounds next?** They are the other half of the 5.2 origin (the ability increases, an Origin feat, two
  skills, a tool). *Default: a separate spec note after this one is built.*
- **Q9. Size of a species entry**: 16 KB, 12 features, 12 lineage options of at most 6 features each? *Default: yes,
  the subclass note's 16 KB.*
- **Q10. The order of the amendments.** *Default: S2 to S4 (the lineage spells and choices touch six of the nine
  species), then S5 to S8 (the Dragonborn and the Orc), then S9 and S10 with the subclass note's F, then S11 and S12.*

## Build notes: SP1, the species kind and the sheet (#552)

Built to Decisions 1 to 3 and the removed-pack rule of Decision 5, the owner's questions on their defaults. No species is entered (SP2);
the tests use two invented ones. What was settled in building, and what differs from the sketch:

- **Where.** `content/schema.js`: `lintSpecies`, wired into `lintPack({ ..., species })`; `SPECIES_SIZES`; `type` in the record's fields.
  `content/index.js`: `CONTENT.species`, empty. `derive.js`: `speciesOf`, `speciesFeatures`, `missingSpeciesOf`, the sheet's `species`
  in `validate` (`checkSpecies`), and the species in `gather`, `featuresOf`, the Speed, the size, `type`, `why.species` and `missing`.
  `engine/sheets.js`: `tellMissing` tells the DM of a missing species. `PACKS` has no `species` list yet (SP2 adds the file and the list),
  `HOMEBREW_LOOKUPS` and `HOMEBREW_ENTRY_KINDS` have no `species` (SP7), and `npm run content` prints what it printed.
- **A species' features are linted as a feat's grants are** (`lintFeature` with the feat's class, which has no table), so an amount is a
  number, `{ mod }`, `{ prof }`, `{ perLevel }` or `{ byLevel }` at the character level, `{ column }` is refused, and every grant that only a
  subclass's feature may carry is refused with the feat's sentence, worded for a species. Refused besides, each with its reason, because
  `derive` would drop it without a word: `spells`, `cantrips`, `spellLists` and `freeCast` (S2), `feat` (S4), `triggers` and `formOf` (a
  class's alone), `attune`, `skills.from: 'class'`, and an option that `requires` a spell. A cost names a feature with uses of the species,
  or of the same lineage option. A lineage option's feature ids are not the species' own (the sheet's `species.choices` are kept by feature
  id), but two options may use the same id (ten Breath Weapons). The entry's tier is no higher than its lowest feature, counting every
  lineage option's (the entry cannot know which one a sheet picks). `sizes` is `small` and `medium` only: the sizes a sheet may have.
- **In the record.** A species feature is `species-<id>`, a lineage's `species-<lineage>-<id>`, an option `...-<option>`, first in `feats`,
  before the class's; a cost or `with` naming one is relabelled with it. The numbers go by the character level (`SPECIES_CLASS`, `i: -2`).
  A `heal`, `tempHp` or `damage` step whose amount bakes to a plain number (`{ prof: 1 }`) has it written as dice text (`"+3"`), which a step's dice must be;
  no SRD class, feat or item had one, so no record changes.
- **The sheet.** `species: { id, lineage?, ability?, choices? }`. `spells` (S2's pick) is not accepted yet. With a loaded species: the
  lineage and the ability are required where the species has them and refused where it has none; a choice for a feature the species has not
  is refused; the size is one of `sizes` ("A Stonefolk is Medium."); the sheet's own `speed` is refused ("Speed comes from the species: a
  Stonefolk has 25 ft. Take the sheet's own Speed out."). An unknown id is refused ("There is no species "dwarf" in the game ...") unless it
  has a homebrew id's shape (`HB_ID`), which is the absent case below.
- **`type`.** On the record only when it is not `humanoid`; `lintRecord` accepts `type` (any creature type but `humanoid`), so a record
  typed in by hand may carry one too. `makeEntity` already spreads the record, so the creature has it and `creatureType` reads it; a creature
  remade without it has none.
- **The absent species.** The sheet keeps the id; no trait; the Speed is the sheet's or 30, the size the sheet's or Medium; `why.species` is
  the spec's sentence; `derive` returns `missing: [..., { kind: 'species', id }]`. `missingOf` stays the subclasses' (the client's header
  and `keepAway` read it as such); the species is `missingSpeciesOf`. **Differs from the sketch:** the DM-only event is one of its own, after
  the subclasses' events (B2 made one per missing subclass, which tests and the client pin), not one event listing both.
- **State shape: no change, no version bump.** The sheet gains an optional field, the record and the creature an optional `type`.
  **What players are sent: unchanged for every sheet without a species.** A party creature is sent whole, so its `type` and its sheet's
  `species` reach the players once a sheet names one; the DM's event is never sent.

**Fix round 1 (the review of #553).** The client's build sheet keeps `species` among the fields it has no control for (`KEEP`), so an edit or a
level from the build screen keeps the id, and the hand-typed form keeps a record's `type` (`packages/client/buildsheet.js` and `quickentry.js`,
beyond the issue's list, approved for this round). `lintSpecies` builds the record id of every feature and option, with the species alone and
with each lineage option in turn, and refuses two that come out the same ("feature old-craft's option lore and feature old-craft-lore would both be
"species-old-craft-lore" in a character's record: rename one"). An option's tier counts toward the entry's. A flat amount that adds a modifier
(`{ prof: 1 }` with `addMod`) bakes to one number ("+5"), not "+3+2". State shape: unchanged.
