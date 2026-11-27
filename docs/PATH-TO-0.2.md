# Path to 0.2: how the engine is built, what it runs, and what comes next

Issue #376, 15 November 2026. Read-only on code: nothing here changes the game. Every number comes from a
script or a search run on `main` at commit `1d55450`; the last section says how. Where this document
proposes something, it says **proposal**: those are for the owner to decide, not decisions.

## Summary (one page)

**Are spells data or code?** Data. All 339 spells are entries in eleven data files
(`packages/rules/src/content/srd52/spells*.js`) with no functions in them; the linter refuses one.
`effects.js` (442 lines) plays them from a closed list of 20 step kinds. Engine code names only one spell for
a special case in play (Find Steed, `ai.js:195`), one summon block (Animate Objects' object,
`engine/resolve.js:1411`) and one spell in the linter (Contact Other Plane, `content/schema.js:476`).
So the claim holds, with three small exceptions (section 1).

**How much of the game does the engine run by itself today?**

| Kind | Entered | Engine runs all of it (auto) | Engine runs part (assist) | DM runs it (manual) |
|---|---|---|---|---|
| Spells | 339 | 48 (14 %) | 94 (28 %) | 197 (58 %) |
| Spells of levels 0 to 3 (what characters of levels 1 to 6 cast) | 183 | 37 (20 %) | 48 (26 %) | 98 (54 %) |
| Monsters | 329 | 57 (17 %) | 270 (82 %) | 2 |
| Monsters of Challenge Rating 4 or lower | 216 | 53 (25 %) | 161 | 2 |
| Class features (all 12 classes, levels 1 to 20) | 268 | 166 (62 %) | 41 (15 %) | 61 (23 %) |
| Magic items | 75 | 40 (53 %) | 20 | 15 |
| Feats | 17 | 6 | 8 | 3 |

Fighting with weapons, saves, damage, conditions, Concentration, areas, reactions and the turn order is the
engine's. Most of what is left is spells that make things (objects, walls, summons), answers only a DM can
give (43 spells), and monsters' extra traits.

**Is the engine split right?** Mostly yes. The handlers are split by domain into 13 modules under
`engine/` (7,488 lines with `engine.js`), layered without cycles. Two modules are large and mixed:
`engine/resolve.js` (1,672 lines, eight topics) and `engine/world.js` (1,142, seven topics). Splitting them
would mostly move lines; one split (summoning out of `resolve.js`) would help the companion jobs that
keep editing it. Three proposals in section 3, each with its risk.

**Shortest path to a DM casting his own homebrew spell:** five jobs of `docs/specs/homebrew.md`, none built
yet: **B1** (the safety check and strict lint), **B4** (the registry that lets a table have its own spells),
**B5** (packs stored on a table), **B3** (the plain-words reading of a spell) and **B7** (the screen to add a pack
file). B1, B3 and B4 can run at the same time. After them a DM can load a spell written as a file (by hand, or by
an AI tool outside the game) and cast it; it plays at the tier its steps allow. The builder form (B9) comes after.

**What a v0.2 for game testing needs (proposal):** 17 must jobs (section 5): cut `v0.1.0` (R14 step 2, 1), the
homebrew first slice (5), three missing table screens (3), the "on weapon hit" trigger the owner already put
second (1), six small vocabulary jobs that are the main gap for 48 spells, 34 of them levels 0 to 3 (6), and the
size limit on Prone and grapples, which alone holds back 15 monsters (1). Then 12 should jobs.

## 1. How spells are built

### Confirmed: spells are data run by a closed vocabulary

| What | Where | Count |
|---|---|---|
| Spell entries | `content/srd52/spells.js`, `spells-0.js` to `spells-9.js` | 339 |
| Step kinds a spell may use | `STEPS` in `content/schema.js` | 20 (`attack save damage heal tempHp condition modifier move fall set reveal resource counter teleport cure kill remains endConcentration summon manual`) |
| Other closed lists | `schema.js` | 7 branches, 24 hooks, 13 ops, 26 tags, 15 conditions, 13 damage types, 9 casting times, 6 area shapes, 3 reaction triggers, 58 grants |
| The runner | `effects.js` `run`, one `if (kind === ...)` per step | 442 lines |
| Manual spells that are exactly one `manual` step | walking every manual spell | 200 of 200 |

Corrections to older documents: `homebrew.md` says 19 steps (there are 20; `summon` was added) and state
version 20 (it is 23, `migrate.js:18`); `DEBT.md`'s Spells heading says 36 / 87 / 216 (today 47 / 92 / 200);
CLAUDE.md says "there are no import cycles", which holds for `engine/`, but the rules package has three
older cycles pinned by `test/imports.test.js`, all through `content/index.js`. ROADMAP milestone 3 says seven
classes stop at level 6: the pack has features to level 20 for all twelve classes (61 of them manual).

### Every place code names a particular spell, monster, feature or item

A script compared every quoted word in the code of `packages/rules`, `client` and `server` (not the data
files, maps or tests) with every id in the pack: 385 matches on 88 ids. Most are ordinary words that happen to
be ids (`hex`, `light`, `heal`, `fly`, `shield`, `fire`). The real special cases are these.

| Where | What it names | A rule of the game, or a shortcut? | Can homebrew reach it? |
|---|---|---|---|
| `ai.js:195` | `find-steed`: its steed guards a rider who cannot steer | Shortcut: a summon block could carry it | No |
| `engine/resolve.js:1411` | `animated-object`: summons that are objects | Shortcut: a summon field could say "object" | No |
| `content/schema.js:476` | `contact-other-plane` may save against itself (`SELF_SAVE_EXCEPTIONS`, "awaiting review", DEBT S11) | Linter shortcut | No |
| `content/schema.js:568`, `:592` | `MOUNTS`: 8 monster ids that may be `mount: "trained"` | Rule of the game (the animals sold as mounts), written as a list of ids | No: a homebrew horse cannot be a trained mount |
| `engine/features.js` action `secondWind`; `client/actionpanel.js:100`, `:150`, `client/features.js:76` | Second Wind has its own action; `second-wind` and `lay-on-hands` listed as healing features | Shortcut kept from before features were data | No |
| `engine/casting.js:117`, `:118`; `content/schema.js:974` | The 8 (cast) and 10 (linter) Metamagic option ids, the 6 Transmuted types | Rule of the game | Homebrew cannot add a Metamagic option |
| `derive.js:659` | `additional-fighting-style` must differ from `fighting-style` | Rule of the game (Champion) | n/a (homebrew subclasses are not possible yet) |
| `content/schema.js:1194` | `spellcasting`, `pact-magic` exempt from "auto but grants nothing" | Linter rule | n/a |
| `modifiers.js:63` | Tag `target.notFiend`, for Hurl Through Hell | Rule, as a vocabulary tag | Yes, any entry may use the tag |
| `content/schema.js:790` to `:819` | 25 of the 58 grants were added with a comment naming the one or two features they serve (Overchannel, Repelling Blast, Relentless Rage...) | Rules, as vocabulary | Yes, items and feats may use them |
| `engine/characters.js:398`, `engine/resolve.js:1179`, `engine/world.js:453` | The `pile` object holds dropped items | Rule of the engine that needs one content entry | Not needed |
| `scenario.js:19`, `:70`; `migrate.js:5` to `:7` | The starter valley's creatures; old ids renamed in saved games | Not rules | Not needed |
| `import-fgxml.js`, `import-uvtt.js` | Outside names mapped to SRD ids (feats, items, `door-wooden`, `brazier`) | Importers | An import cannot land on a homebrew entry |
| `client/render.js:764`, `:765`; `client/three-build.js:311`, `:312` | `pit-trap`, `lever` drawn specially | Drawing only | A homebrew object draws as a plain thing |

No engine code tests a monster id in a fight, and no code tests a spell id while casting.

## 2. The coverage gap, counted exactly

### Spells: 292 not auto, one group each

Each of the 292 spells (200 manual, 92 assist) was put in the one group of the mechanism it lacks most, by
reading its `manual` text, or for the 71 assist spells with no `manual` step, the "the DM handles" part of its
`text`. The full list is the appendix. A group is the **main** gap: building it moves a spell up a tier only if
nothing else is missing from it, so "spells" below is the most a job can unlock, not a promise.

Size is a judgement: **small** is one module and its tests, one pull request; **medium** is two to four modules
or a new idea in the turn; **large** is a new kind of thing on the map or in the monster AI, several pull requests.

| Group (main missing mechanism) | Spells | Manual / assist | Of them levels 0 to 3 | Engine size | Files it would touch | Examples |
|---|---|---|---|---|---|---|
| Information or small utility, nothing to roll | 43 | 41 / 2 | 30 | none: the DM's by nature | stays `manual` | Detect Magic, Message, Augury |
| Makes or changes an object, wall, barrier or terrain | 31 | 26 / 5 | 8 | large | `effects.js`, `engine/world.js`, `walls.js`, `map.js`, `schema.js` | Wall of Fire, Arcane Lock, Wall of Force |
| A summon or a thing that acts on later turns | 20 | 14 / 6 | 9 | medium (the `summon` step exists) | `summons.js`, `srd52/summons.js`, `engine/resolve.js` | Spiritual Weapon, Mage Hand, Conjure Animals |
| A follow-up each turn, or an action granted for later turns | 17 | 8 / 9 | 9 | medium | `durations.js`, `engine/casting.js`, `effects.js` | Hex, Heroism, Produce Flame, Call Lightning |
| Forced behaviour and orders | 16 | 4 / 12 | 5 | large | `ai.js`, `engine/movement.js`, `durations.js` | Command, Suggestion, Dominate Person |
| What an area does while inside, or an area that moves | 15 | 7 / 8 | 7 | medium | `zones.js`, `modifiers.js` | Moonbeam (move it), Silence, Spike Growth |
| A condition or state the engine lacks | 14 | 6 / 8 | 9 | small each, in a batch | `modifiers.js` (`STATUSES`), `schema.js` | Spare the Dying (Stable), Chill Touch (no healing) |
| Movement modes and travel | 14 | 12 / 2 | 7 | medium | `engine/movement.js`, `modifiers.js`, `schema.js` | Fly, Spider Climb, Jump |
| Illusions | 13 | 12 / 1 | 7 | medium, after objects | `effects.js`, `engine/world.js`, `engine/features.js` (Study) | Minor Illusion, Major Image |
| Leaves the map (another plane, a demiplane) | 11 | 10 / 1 | 3 | medium | `engine/resolve.js`, `vision.js` | Banishment, Blink, Plane Shift |
| How an effect ends (all parts on one save, after attacking, three saves) | 10 | 0 / 10 | 4 | small | `durations.js`, `schema.js` | Invisibility, Web, Flesh to Stone |
| Wards by creature type or against spells | 10 | 10 / 0 | 3 | large | `effects.js`, `engine/casting.js`, `walls.js` | Sanctuary, Magic Circle, Globe of Invulnerability |
| A number formula (AC 13 + Dexterity, a Hit Point threshold, a pool) | 9 | 7 / 2 | 2 | small | `modifiers.js`, `derive.js`, `schema.js` | Mage Armor, Power Word Kill, Mass Heal |
| Revive, restore, dispel | 9 | 9 / 0 | 3 | medium | `effects.js`, `durations.js`, `engine/resolve.js` | Revivify, Dispel Magic |
| Sight, senses and light on a creature | 8 | 4 / 4 | 7 | small | `modifiers.js` (a "can see the target" tag), `sight.js`, `vision.js` | Faerie Fire, Darkvision, Blur |
| A trigger on the caster's own weapon hit, or a weapon changed | 7 | 6 / 1 | 7 | medium | `engine/attacks.js`, `engine/resolve.js`, `engine/casting.js`, `schema.js` | Divine Smite, Shillelagh, True Strike |
| A creature-type rule (Humanoid only, auto-fail) | 7 | 2 / 5 | 5 | small | `schema.js`, `engine/world.js` (`targetsFor`), `modifiers.js` | Hold Person, Charm Person |
| Shape and size change | 7 | 7 / 0 | 2 | medium (`forms.js` exists for Wild Shape) | `forms.js`, `engine/features.js`, `engine/sheets.js` | Polymorph, Enlarge/Reduce |
| A choice or random roll among effects | 7 | 4 / 3 | 3 | medium | `effects.js`, `schema.js` | Bestow Curse, Prismatic Spray |
| Light and darkness on the map | 6 | 5 / 1 | 6 | small (lights exist, `setLight`) | `effects.js`, `content/lights.js` | Light, Darkness, Daylight |
| A trigger the engine has no hook for | 6 | 4 / 2 | 3 | medium | `reactions.js`, `engine/resolve.js` | Feather Fall, Mirror Image, Death Ward |
| An area the engine cannot lay out | 4 | 0 / 4 | 2 | medium | `engine/world.js` (`layout`) | Fire Storm, Wind Wall |
| Extra actions or turn limits | 4 | 1 / 3 | 2 | medium | `engine/shared.js` (budgets), `engine/attacks.js` | Haste, Slow |
| Dice wording (exploding dice, a leap, a burst) | 3 | 1 / 2 | 3 | small | `rng.js`, `effects.js` | Sorcerous Burst, Chromatic Orb, Ice Knife |
| Growth by slot level the format cannot say | 1 | 0 / 1 | 0 | small | `effects.js` | Flame Strike |
| **Total** | **292** | **200 / 92** | **146** | | | |

**Order that unlocks the most play per job (proposal).** Ranked by spells at levels 0 to 3 for each job, small
jobs before medium ones; number formulas are small but come last because only 2 of their 9 spells are low level:

| # | Job | Size | Main gap for | Of them levels 0 to 3 |
|---|---|---|---|---|
| 1 | Missing states (Stable, no healing, no Opportunity Attacks...) | small batch | 14 | 9 |
| 2 | "Can see the target" tag, Invisible not helping, senses granted | small | 8 | 7 |
| 3 | A spell lights an object or an area | small | 6 | 6 |
| 4 | Creature-type limits and auto-fail | small | 7 | 5 |
| 5 | Endings (one save ends all parts, ends after attacking) | small | 10 | 4 |
| 6 | Dice wording | small | 3 | 3 |
| 7 | On weapon hit (the owner's second pick) | medium | 7 spells, 6 class features, 2 items | 7 |
| 8 | Follow-up actions for later turns | medium | 17 | 9 |
| 9 | Summons still manual (the step exists) | medium | 20 | 9 |
| 10 | Zones that move or work while inside | medium | 15 | 7 |
| 11 | Movement modes | medium | 14 | 7 |
| 12 | Number formulas, AC formula included (the owner's third pick) | small | 9 (AC formula alone: 1, Mage Armor) | 2 |

The owner's order for vocabulary growth (homebrew.md, question 4) is subclasses, on weapon hit, AC formula,
summon. The counts agree that "on weapon hit" is the best medium job; they suggest summon before the AC
formula, which is the main gap of one spell. For the owner.

### Monsters: 270 assist, 2 manual

A script listed what holds each monster back: a trait with text and no modifiers, or an action with a `manual`
step or no effects, sorted by keywords in its name and text. A monster can be in several kinds.

| Kind | Monsters touched | First kind of the monster | Touched at CR 4 or lower | Engine size |
|---|---|---|---|---|
| Movement traits (Amphibious, Spider Climb, Flyby, Leap...) | 106 | 51 | 67 | mostly none to small |
| Recharge, once a day, uses | 70 | 25 | 20 | varies (the field exists; held by what the action does) |
| Spellcasting (M6) | 65 | 40 | 19 | large |
| Auras and effects while near | 49 | 29 | 32 | medium (zones) |
| Magic Resistance | 35 | 2 | 7 | small (a "against spells" tag) |
| Legendary actions (M5) | 30 | 30 | 0 | medium |
| Swallow, engulf, grapple riders | 30 | 25 | 12 | medium (needs grapple, DEBT C6) |
| Shape-changing | 25 | 14 | 13 | medium (`forms.js`) |
| Senses and sight traits | 18 | 3 | 11 | small |
| Reactions | 16 | 7 | 5 | medium |
| Restoration after death (fiends) | 15 | 1 | 1 | none (out of play) |
| Regeneration | 4 | 1 | 1 | small |
| Multiattack with a part for the DM | 5 | 1 | 0 | small |
| Summoning | 2 | 1 | 0 | medium |
| Other (Gore, Ram, Death Burst, Trample...) | 87 | 23 | 52 | varies |
| No held trait or action: a note in an action's text | 19 | 19 | | 15 of the 19 name a size limit (W9): **small**, a `largest` on condition steps (move steps have one, `effects.js:435`) |

Two cheap findings: **20 monsters** are held only by Amphibious, Water Breathing, Hold Breath, Mimicry or Siege
Monster, which have nothing to roll in a fight on land (the crabs, sharks, crocodiles and three dragon
wyrmlings); and **15** by the size limit of W9 alone. Legendary actions touch no monster of CR 4 or lower, so
they can wait for game testing at low levels.

### Magic items: 35 not auto

`activate` is run since #276 (`use` with `item`, `engine/features.js:468`); the issue's "is not run" is out of
date. What holds the 35:

| Main gap | Items | Examples |
|---|---|---|
| A timed effect from a use (an hour of Strength 25, of Gaseous Form) | 9 | Potions of Giant Strength (5), Armor of Invulnerability |
| Movement | 4 | Slippers of Spider Climbing, Ring of Jumping |
| Creature-type rule | 3 | Sun Blade, Dragon Scale Mail |
| Objects | 3 | Bag of Holding, Ring of Shooting Stars |
| On a weapon hit | 2 | Dagger of Venom, Staff of Striking |
| The d20 on the last charge | 2 | Wand of Magic Missiles, Staff of Healing |
| Number formula | 2 | Defender, Ring of Warmth |
| A state the engine lacks | 2 | Brooch of Shielding, Weapon of Warning |
| One each: light, sight, a trigger, an ending, a table of variants, once-a-dawn uses, scroll casting | 7 | Lantern of Revealing, Helm of Telepathy, Spell Scroll |

### Class features: 61 manual, 41 assist

| Main gap of the 61 manual | Features | Examples |
|---|---|---|
| Spell lists, preparation and slot bookkeeping | 16 | Ritual Adept, Magical Cunning, Signature Spells |
| Weapon Mastery, not built | 6 | Weapon Mastery (5 classes), Tactical Master |
| On a hit, or a weapon changed | 6 | Frenzy, Open Hand Technique, Sacred Weapon |
| A choice after a roll (prompts) | 4 | Cutting Words, Stroke of Luck |
| A hook on healing spells | 4 | Disciple of Life, Supreme Healing |
| Other, one or two each | 25 | Jack of All Trades, Elusive, Steady Aim |

## 3. Is the engine split still right?

### Sizes

| Module | Lines | Holds |
|---|---|---|
| `engine/resolve.js` | 1,672 | forced movement (lines 28 to 143), starting and turning fights (144 to 333), riding (334 to 580), turn order and stepping away (581 to 735), damage, the attack roll and reactions (736 to 1137), actions and gear left behind (1138 to 1225), vanishing and bonds (1226 to 1348), summons, the pocket and raising the dead (1349 to 1664), the `KIT` |
| `content/schema.js` | 1,667 | the vocabulary and the linter |
| `engine/world.js` | 1,142 | moving and fitting (1 to 333), regions, objects and piles (334 to 511), placing and revealing (512 to 580), initiative and joining (581 to 753), finding (754 to 778), areas and targets (779 to 971), marching and formations (972 to 1142) |
| `derive.js` | 871 | sheets from class and level |
| `engine/movement.js` | 749 | |
| `view.js` | 731 | what each person is sent |
| `engine/casting.js`, `engine/features.js` | 678, 667 | |
| the other 9 `engine/` modules and `engine.js` | 112 to 452 each | |

Rules package without data and maps: 16,420 lines. Client: 13,634. Server: 1,643.

**Would a further split help or only move lines?** `resolve.js` holds eight topics but the layer rule
(`shared` ← `world`, `rolls` ← `sheets` ← `resolve`) means most of them must stay above `sheets.js` and below
the handlers. Moving forced movement or turn order out only moves lines. Summons, the pocket and raising the
dead (316 lines) are the part the companion jobs C1 to C10 keep changing, and they share little with damage
and attacks, so moving them is the one split that would let two lanes work at once.

### Imports

All 13 `engine/` modules import only downwards except one sideways import: `engine/features.js` imports
`engine/casting.js` (`castFromItem`, for spells cast from items). That is not a cycle. The three pinned cycles
(`test/imports.test.js`) are outside `engine/`: `content/index.js` imports `effects.js` to build the spell
profiles at load time, and `effects.js` reaches `modifiers.js`, which reads `content/index.js`. The homebrew
registry will sit on exactly this path, so B4 must not add a fourth.

### Duplicated code

211 lines of 70 characters or more appear identically in two or more files. 177 are the two renderers
(`render.js` against `render-three.js` and `three-build.js`), removed by R14 step 2. 7 are rules code copied
into the client (`client/classes.js` copies `slug`, the Brutal Strike and Cunning Strike lookups and
`TRANSMUTE` from `engine/attacks.js` and `engine/casting.js`; `client/companions.js:35` copies
`summonCount` from `engine/resolve.js:1349`). 14 are inside the rules package.

One copy is of **state shape**: `editCharacter` (`engine/characters.js:55` to `:79`) remakes a creature the
same way as `remake` (`engine/sheets.js:72`), but keeps a shorter list of play state. Seven fields `remake` keeps
are dropped by `editCharacter`: `tempHp`, `tempFx`, `follow`, `march`, `light`, `hiding`, `hidden`. Found by
reading; not tried in a game or a test. It is for the lead to check (a hidden character edited by the DM may
come out of hiding without the usual event).

### Direct reads of content, and what the registry (B4) must do

| Name read | Reads | Where |
|---|---|---|
| `CONTENT` | 156 | |
| `SPELLS` | 65 | |
| `MONSTERS` | 23 | |
| `MONSTER_ACTIONS` | 5 | |
| `PREGENS` | 3 | |
| **Total** | **252** on 220 lines in 31 files | client 93, rules `engine/` 66, other rules modules 93, server 0 |

The most: `derive.js` 44, `client/app.js` 23, `engine/resolve.js` 19, `import-fgxml.js` 18. By kind,
`CONTENT.items` 32, `CONTENT.spells` 25, `CONTENT.objects` 23, `CONTENT.monsters` 22.

Almost every read happens inside a function, when it is called. Eight lines outside `content/index.js` build
something from content once, at load time: six loops in `import-fgxml.js` (lines 127 to 185, the name maps of
the Fantasy Grounds importer, which should only ever map to SRD entries anyway) and two in `client/app.js`:
line 915 (the DM's list of conditions) and **line 1010 (the DM's "Add a monster" buttons), so a homebrew monster
would not appear there until that list is rebuilt when packs change** (a job for B7).

So the **safest route** for B4 is the spec's option C done in place: `using(overlay, fn)` adds the table's
homebrew ids **into the same lookup objects** (`CONTENT.spells`, `SPELLS`, `MONSTERS`, `MONSTER_ACTIONS` and the
rest) and deletes them in a `finally`. No read site changes, which is what the spec's done-when "`CONTENT` and
`SPELLS` are the same objects as before" asks. Its guards: a test that lists the lines that read content at load
time (the eight above) and fails on a new one, the two-tables test of review point 6, and the client installing
the same overlay for its 93 reads and rebuilding the spawn list.

### Three structural changes (proposals, each with its risk)

| # | Change | Why | Risk |
|---|---|---|---|
| 1 | Move summons, the pocket and raising the dead out of `engine/resolve.js` into their own module under it, lent to `effects.js` through the `KIT` as today | `resolve.js` loses 316 lines; companion and summon jobs stop colliding with damage and attack jobs | Low to medium: a move with no behaviour change, but the `KIT` and three `makeEntity` call sites must keep their order of events. Needs the full tests, which this job could not run |
| 2 | One `remake` for both `editCharacter` and sheet changes, keeping one list of play state | Removes the drifted copy above | Low, but it changes behaviour (the seven fields would be kept): owner or lead to confirm that is wanted |
| 3 | Export the five rules helpers the client copies, and import them | A rule changed in the engine changes in the panels too | Low: `client/classes.js` and `client/companions.js` only |

Everything else: leave it.

## 4. Homebrew readiness (`docs/specs/homebrew.md`)

### What exists and what each job needs

None of B1 to B15 is built: there is no `content/registry.js`, `shapes.js`, `reader.js`, `dryrun.js` or
`scripts/hb.mjs`, and `schema.js` exports `lintPack`, `lintRecord`, `lintMultiattack`, `lintBaked`, `coverage`
and `featureCoverage` but no `lintEntry`, budget or strict mode.

| Job | What | Needs | Can run beside |
|---|---|---|---|
| B1 | Budget, strict mode, `lintEntry` | nothing | B2 (agree the key lists), B3, B4 |
| B2 | Shapes and `schemaOf` | B1's key lists | B3, B4 |
| B3 | The plain-words reading, spells | nothing | B1, B2, B4 |
| B4 | The registry | nothing | B1, B2, B3 |
| B5 | Packs on a table: state version 23 to 24, the `pack` message, storage | B1, B4 | B6 |
| B6 | The dry run | B4 | B5 |
| B7 | Pack manager screen | B3, B5 | B9 |
| B8 | Characters carrying homebrew (Allow or Deny) | B1, B3, B5 | B9, B10 |
| B9, B10 | The spell builder, two slices | B2, B3; B10 needs B6 | B7, B8 |
| B11 | Paste from an AI | B3, B9 | |
| B12 | Command line | B1 to B3, B6 | anything |
| B13 | Other kinds | B3, B9 per kind | |
| B14 | Tool server (stretch) | B12 | |
| B15 | Operator controls, lobby line | B5 | B7 |

Order: **B1, B3, B4 together → B5 → B7** is the first usable slice; B2 and B6 beside B5; B9, B10, B11 next;
B8, B12, B13, B15 after; B14 last.

### The first usable slice for a DM

The smallest set after which a DM can add one homebrew spell to his own table and cast it: **B1, B4, B5, B3, B7**
(five jobs). The DM writes the spell as a file (by hand, or with any AI tool outside the game), uploads it in the
pack manager, reads the engine's own reading of it, gives it to a character and casts it. A homebrew spell joins a
class's list by naming the class (`derive.js:690` checks `classes`), so nothing else is needed for the sheet.

**Proposal, smaller still, for the owner:** a solo-only slice (B1, B4 and the solo half of B5, loading a pack in
the browser game) is three jobs, lets the owner try homebrew at his own table first, and touches no server code.
It leaves out the safety review on the server, so it must not be offered online.

### What homebrew cannot say until the vocabulary grows

A homebrew spell built from the 20 steps is played by the engine. What it cannot say is the same list as the SRD
gap in section 2: a homebrew "summons three wolves" or "+2 to your next weapon hit" becomes a `manual` step with
text for the DM, exactly like the SRD's own 200. The groups that matter most for homebrew authors are the ones
people ask for most: on weapon hit (smites), summons, follow-up actions on later turns, and new conditions
(`lintCondition` allows only the 15 SRD conditions). Homebrew subclasses, species and backgrounds are a different
kind of work: no vocabulary step adds them (homebrew.md, Decision 9). Five hard-coded lists in section 1 also stay
closed to homebrew: `MOUNTS`, Metamagic options, the Find Steed guard, the object summon and the self-save
exception.

## 5. A proposed `v0.2`: "ready for game testing"

**This is a proposal for the owner, not a decision.** "Game testing" here means real groups playing levels 1 to 6
against monsters of CR 4 or lower, online and on phones (ROADMAP milestone 6), with homebrew from day one.

### Must (17 jobs)

| # | What must be true | Jobs | From |
|---|---|---|---|
| 1 | `v0.1.0` is cut: Three.js is the default and the old renderer is gone | 1 (R14 step 2, #355: built; the owner said go on 18 November; the lead tags after the merge) | ROADMAP; DEBT P23, P25, P30 |
| 2 | A DM can add a homebrew spell and cast it, online, with the server's safety check | 5 (B1, B3, B4, B5, B7) | homebrew.md |
| 3 | The screens players need to cast what the engine runs: aim a teleport, draw a spell's terrain or fog, level up a multiclass character | 3 | DEBT Spells (after #165); C12 |
| 4 | "On weapon hit": the smites, Shillelagh, True Strike, and the same hook for features and items | 1 | owner's question 4; section 2 |
| 5 | Six small vocabulary jobs: missing states, "can see the target", lights from spells, creature-type limits, endings, dice wording | 6 | section 2 (main gap of 48 spells, 34 of them levels 0 to 3) |
| 6 | The size limit on Prone and grapples (W9): a `largest` on condition steps, and the data pass | 1 | DEBT W9; 15 monsters held by it alone |

### Should (12 jobs)

| What | Jobs | From |
|---|---|---|
| Summon blocks for the 20 summon spells still not auto | 1 data, 1 engine | companions.md, section 2 |
| Follow-up actions for later turns (Hex, Hunter's Mark, Call Lightning) | 1 | section 2 |
| Zones that move or work while inside | 1 | DEBT S4 |
| Homebrew subclasses of SRD classes (the owner's first pick for homebrew) | 3 (spec amendment, engine, build screen) | homebrew.md Decision 9 |
| The spell builder and paste from an AI | 3 (B9, B10, B11) | homebrew.md |
| Bring the docs up to date: DEBT's Spells heading, ROADMAP milestone 3, the 19 steps and state 20 in homebrew.md | 1 | section 1 |
| Death saves outside a fight; Surprise | 1 | DEBT W10, W31 |

### Later

| What | Why later |
|---|---|
| Legendary actions (M5) | No monster of CR 4 or lower has them |
| Monster spellcasting (M6) | Large; 19 monsters at CR 4 or lower, the DM casts for them meanwhile |
| Objects, walls and barriers from spells; illusions; wards | Large; 54 spells together, 18 at levels 0 to 3 |
| Forced behaviour (Command, Suggestion) | Large; needs the monster AI and player turns to obey |
| The 61 manual class features | Most sit above level 6 or in spell bookkeeping |
| B2, B6, B8, B12 to B15, the tool server | After the first slice |

## How this was counted

All counts were made on `main` at `1d55450` with `npm run content` and small scripts kept in `/tmp`, outside the
repo; no test, smoke run or browser was run.

- **Tiers** (summary, section 2): `npm run content`; spells by level and monsters by CR from a script that imports
  `content/index.js` and reads each entry's `tier`, `level` and `cr`.
- **Spell groups:** a script dumped every non-auto spell's `manual` steps (walking `effects` and `zone`) and `text`;
  each was read in full and given one group by hand. The entries' own text named the missing part for every one
  of the 292, so the SRD file (`reference/srd52/srd52-flow.txt`) was not needed for any of them. A second script checked that the list holds every one of the 292 and
  nothing else, and tallied groups, tiers and levels.
- **Hard-coded ids:** a script collected every id of spells, monsters, summons, items, feats, objects, weapons,
  armour, pregens, classes and class features, then matched every quoted kebab-case word in the code files of
  `packages` (not `srd52/`, `maps/`, `vendor/`, tests), skipping comment lines; each real hit was read. Also `grep`
  for comparisons of `tpl`, `id`, `source`, `spell` and `summon` against a literal.
- **Content reads:** a script counted the words `CONTENT`, `SPELLS`, `MONSTERS`, `MONSTER_ACTIONS` and `PREGENS` in
  code lines of the same files, leaving out imports, re-exports, comments and `content/index.js`; `grep` for
  lines at the top level of a module (not inside a function) that use them.
- **Duplicates:** a script listed trimmed lines of 70 characters or more (not comments or imports) that occur in two
  or more files.
- **Monsters:** a script listed, for each non-auto monster, its traits with text and no modifiers, reaction or aura,
  its actions with a `manual` step or no effects, and Multiattacks whose text names the DM; each was sorted by
  keywords in its name and text into the first matching kind. The keywords are a rule, so the kinds are exact for
  that rule and not a reading of each monster.
- **Items and class features:** listed with their `manual` text and `text`, grouped by hand, tallied by a script.
- **Sizes and line ranges:** `wc -l`, and `grep` for the top-level definitions of `resolve.js` and `world.js`.
- **Imports:** `grep` of the `from` lines of `engine.js` and `engine/*.js`; the pinned cycles from
  `packages/rules/test/imports.test.js`.

## Appendix: every spell that is not auto, by group

| Spell | Level | Tier | Group |
|---|---|---|---|
| chill-touch | 0 | assist | A condition or state the engine lacks |
| dancing-lights | 0 | manual | Light and darkness on the map |
| druidcraft | 0 | manual | Information or small utility |
| elementalism | 0 | manual | Information or small utility |
| light | 0 | manual | Light and darkness on the map |
| mage-hand | 0 | manual | Summons and things that act |
| mending | 0 | manual | Information or small utility |
| message | 0 | manual | Information or small utility |
| minor-illusion | 0 | manual | Illusions |
| prestidigitation | 0 | manual | Information or small utility |
| produce-flame | 0 | manual | Follow-up each turn or a later action |
| shillelagh | 0 | manual | On-hit trigger or weapon changed |
| shocking-grasp | 0 | assist | A condition or state the engine lacks |
| sorcerous-burst | 0 | manual | Dice wording |
| spare-the-dying | 0 | manual | A condition or state the engine lacks |
| starry-wisp | 0 | assist | Sight, senses, light on a creature |
| thaumaturgy | 0 | manual | Information or small utility |
| true-strike | 0 | manual | On-hit trigger or weapon changed |
| alarm | 1 | manual | Objects, walls, terrain |
| animal-friendship | 1 | assist | Creature-type rule |
| charm-person | 1 | assist | Creature-type rule |
| chromatic-orb | 1 | assist | Dice wording |
| command | 1 | manual | Forced behaviour and orders |
| comprehend-languages | 1 | manual | Information or small utility |
| create-or-destroy-water | 1 | manual | Information or small utility |
| detect-evil-and-good | 1 | manual | Information or small utility |
| detect-magic | 1 | manual | Information or small utility |
| detect-poison-and-disease | 1 | manual | Information or small utility |
| disguise-self | 1 | manual | Illusions |
| dissonant-whispers | 1 | assist | Forced behaviour and orders |
| divine-smite | 1 | manual | On-hit trigger or weapon changed |
| ensnaring-strike | 1 | manual | On-hit trigger or weapon changed |
| entangle | 1 | assist | How an effect ends |
| expeditious-retreat | 1 | manual | Movement and travel |
| faerie-fire | 1 | manual | Sight, senses, light on a creature |
| feather-fall | 1 | manual | A trigger with no hook |
| find-familiar | 1 | assist | Information or small utility |
| floating-disk | 1 | manual | Summons and things that act |
| fog-cloud | 1 | assist | An area the engine cannot lay out |
| goodberry | 1 | manual | Objects, walls, terrain |
| heroism | 1 | manual | Follow-up each turn or a later action |
| hex | 1 | assist | Follow-up each turn or a later action |
| hideous-laughter | 1 | assist | A condition or state the engine lacks |
| hunters-mark | 1 | assist | Follow-up each turn or a later action |
| ice-knife | 1 | assist | Dice wording |
| identify | 1 | manual | Information or small utility |
| illusory-script | 1 | manual | Illusions |
| jump | 1 | manual | Movement and travel |
| mage-armor | 1 | manual | Number formula |
| protection-from-evil-and-good | 1 | manual | Creature-type rule |
| purify-food-and-drink | 1 | manual | Information or small utility |
| sanctuary | 1 | manual | Wards against types or spells |
| searing-smite | 1 | manual | On-hit trigger or weapon changed |
| silent-image | 1 | manual | Illusions |
| sleep | 1 | assist | A condition or state the engine lacks |
| speak-with-animals | 1 | manual | Information or small utility |
| thunderwave | 1 | assist | Objects, walls, terrain |
| unseen-servant | 1 | manual | Summons and things that act |
| acid-arrow | 2 | assist | Follow-up each turn or a later action |
| alter-self | 2 | manual | Shape and size change |
| animal-messenger | 2 | manual | Information or small utility |
| arcane-lock | 2 | manual | Objects, walls, terrain |
| arcanists-magic-aura | 2 | manual | Illusions |
| augury | 2 | manual | Information or small utility |
| blindness-deafness | 2 | assist | A choice or random roll among effects |
| blur | 2 | assist | Sight, senses, light on a creature |
| calm-emotions | 2 | manual | A choice or random roll among effects |
| continual-flame | 2 | manual | Light and darkness on the map |
| darkness | 2 | manual | Light and darkness on the map |
| darkvision | 2 | manual | Sight, senses, light on a creature |
| detect-thoughts | 2 | manual | Information or small utility |
| dragons-breath | 2 | manual | Follow-up each turn or a later action |
| enlarge-reduce | 2 | manual | Shape and size change |
| enthrall | 2 | manual | A condition or state the engine lacks |
| find-steed | 2 | assist | Summons and things that act |
| find-traps | 2 | manual | Information or small utility |
| flame-blade | 2 | manual | Follow-up each turn or a later action |
| flaming-sphere | 2 | manual | Summons and things that act |
| gentle-repose | 2 | manual | Information or small utility |
| gust-of-wind | 2 | assist | Inside an area, or an area that moves |
| heat-metal | 2 | manual | Follow-up each turn or a later action |
| hold-person | 2 | assist | Creature-type rule |
| invisibility | 2 | assist | How an effect ends |
| knock | 2 | manual | Objects, walls, terrain |
| levitate | 2 | manual | Movement and travel |
| locate-animals-or-plants | 2 | manual | Information or small utility |
| locate-object | 2 | manual | Information or small utility |
| magic-mouth | 2 | manual | Objects, walls, terrain |
| magic-weapon | 2 | manual | On-hit trigger or weapon changed |
| mind-spike | 2 | assist | Sight, senses, light on a creature |
| mirror-image | 2 | manual | A trigger with no hook |
| moonbeam | 2 | assist | Inside an area, or an area that moves |
| pass-without-trace | 2 | assist | Inside an area, or an area that moves |
| phantasmal-force | 2 | manual | Illusions |
| prayer-of-healing | 2 | assist | A condition or state the engine lacks |
| ray-of-enfeeblement | 2 | assist | How an effect ends |
| rope-trick | 2 | manual | Leaves the map |
| see-invisibility | 2 | manual | Sight, senses, light on a creature |
| shatter | 2 | assist | Creature-type rule |
| shining-smite | 2 | assist | On-hit trigger or weapon changed |
| silence | 2 | manual | Inside an area, or an area that moves |
| spider-climb | 2 | manual | Movement and travel |
| spike-growth | 2 | manual | Inside an area, or an area that moves |
| spiritual-weapon | 2 | manual | Summons and things that act |
| suggestion | 2 | assist | Forced behaviour and orders |
| warding-bond | 2 | assist | A trigger with no hook |
| web | 2 | assist | How an effect ends |
| zone-of-truth | 2 | assist | Forced behaviour and orders |
| animate-dead | 3 | assist | Summons and things that act |
| beacon-of-hope | 3 | assist | A condition or state the engine lacks |
| bestow-curse | 3 | manual | A choice or random roll among effects |
| blink | 3 | manual | Leaves the map |
| call-lightning | 3 | assist | Follow-up each turn or a later action |
| clairvoyance | 3 | manual | Information or small utility |
| conjure-animals | 3 | manual | Summons and things that act |
| create-food-and-water | 3 | manual | Information or small utility |
| daylight | 3 | manual | Light and darkness on the map |
| dispel-magic | 3 | manual | Revive, restore, dispel |
| fear | 3 | assist | Forced behaviour and orders |
| fireball | 3 | assist | Objects, walls, terrain |
| fly | 3 | manual | Movement and travel |
| gaseous-form | 3 | assist | Movement and travel |
| glyph-of-warding | 3 | manual | Objects, walls, terrain |
| haste | 3 | assist | Extra actions or turn limits |
| hypnotic-pattern | 3 | assist | Sight, senses, light on a creature |
| magic-circle | 3 | manual | Wards against types or spells |
| major-image | 3 | manual | Illusions |
| meld-into-stone | 3 | manual | Leaves the map |
| nondetection | 3 | manual | Information or small utility |
| phantom-steed | 3 | assist | Summons and things that act |
| plant-growth | 3 | manual | Inside an area, or an area that moves |
| remove-curse | 3 | manual | Revive, restore, dispel |
| revivify | 3 | manual | Revive, restore, dispel |
| sending | 3 | manual | Information or small utility |
| sleet-storm | 3 | assist | Light and darkness on the map |
| slow | 3 | assist | Extra actions or turn limits |
| speak-with-dead | 3 | manual | Information or small utility |
| speak-with-plants | 3 | manual | Information or small utility |
| spirit-guardians | 3 | assist | Inside an area, or an area that moves |
| stinking-cloud | 3 | manual | A condition or state the engine lacks |
| tiny-hut | 3 | manual | Wards against types or spells |
| tongues | 3 | manual | Information or small utility |
| vampiric-touch | 3 | assist | Number formula |
| water-breathing | 3 | manual | Information or small utility |
| water-walk | 3 | manual | Movement and travel |
| wind-wall | 3 | assist | An area the engine cannot lay out |
| arcane-eye | 4 | manual | Information or small utility |
| aura-of-life | 4 | assist | Inside an area, or an area that moves |
| banishment | 4 | assist | Leaves the map |
| black-tentacles | 4 | assist | How an effect ends |
| blight | 4 | assist | Creature-type rule |
| charm-monster | 4 | assist | Forced behaviour and orders |
| compulsion | 4 | assist | Forced behaviour and orders |
| confusion | 4 | manual | Forced behaviour and orders |
| conjure-minor-elementals | 4 | manual | Inside an area, or an area that moves |
| conjure-woodland-beings | 4 | assist | Extra actions or turn limits |
| control-water | 4 | assist | Objects, walls, terrain |
| death-ward | 4 | manual | A trigger with no hook |
| dimension-door | 4 | assist | Movement and travel |
| divination | 4 | manual | Information or small utility |
| dominate-beast | 4 | assist | Forced behaviour and orders |
| fabricate | 4 | manual | Objects, walls, terrain |
| faithful-hound | 4 | manual | Summons and things that act |
| fire-shield | 4 | assist | A trigger with no hook |
| freedom-of-movement | 4 | manual | A condition or state the engine lacks |
| guardian-of-faith | 4 | manual | Summons and things that act |
| hallucinatory-terrain | 4 | manual | Illusions |
| locate-creature | 4 | manual | Information or small utility |
| phantasmal-killer | 4 | assist | Follow-up each turn or a later action |
| polymorph | 4 | manual | Shape and size change |
| private-sanctum | 4 | manual | Wards against types or spells |
| resilient-sphere | 4 | manual | Objects, walls, terrain |
| secret-chest | 4 | manual | Objects, walls, terrain |
| stone-shape | 4 | manual | Objects, walls, terrain |
| vitriolic-sphere | 4 | assist | Follow-up each turn or a later action |
| wall-of-fire | 4 | manual | Objects, walls, terrain |
| animate-objects | 5 | assist | Summons and things that act |
| antilife-shell | 5 | manual | Wards against types or spells |
| arcane-hand | 5 | manual | Summons and things that act |
| awaken | 5 | manual | Information or small utility |
| cloudkill | 5 | assist | Inside an area, or an area that moves |
| commune | 5 | manual | Information or small utility |
| commune-with-nature | 5 | manual | Information or small utility |
| conjure-elemental | 5 | manual | Summons and things that act |
| contact-other-plane | 5 | assist | How an effect ends |
| contagion | 5 | assist | How an effect ends |
| creation | 5 | manual | Objects, walls, terrain |
| dispel-evil-and-good | 5 | manual | Creature-type rule |
| dominate-person | 5 | assist | Forced behaviour and orders |
| dream | 5 | manual | Information or small utility |
| flame-strike | 5 | assist | Growth by slot level |
| geas | 5 | assist | Forced behaviour and orders |
| greater-restoration | 5 | manual | Revive, restore, dispel |
| hallow | 5 | manual | Wards against types or spells |
| insect-plague | 5 | assist | Inside an area, or an area that moves |
| legend-lore | 5 | manual | Information or small utility |
| mislead | 5 | assist | Illusions |
| modify-memory | 5 | assist | Information or small utility |
| passwall | 5 | manual | Objects, walls, terrain |
| planar-binding | 5 | manual | Forced behaviour and orders |
| raise-dead | 5 | manual | Revive, restore, dispel |
| reincarnate | 5 | manual | Revive, restore, dispel |
| scrying | 5 | manual | Information or small utility |
| seeming | 5 | manual | Illusions |
| telekinesis | 5 | manual | Follow-up each turn or a later action |
| telepathic-bond | 5 | manual | Information or small utility |
| teleportation-circle | 5 | manual | Movement and travel |
| tree-stride | 5 | manual | Movement and travel |
| wall-of-force | 5 | manual | Objects, walls, terrain |
| wall-of-stone | 5 | manual | Objects, walls, terrain |
| blade-barrier | 6 | manual | Objects, walls, terrain |
| chain-lightning | 6 | assist | Objects, walls, terrain |
| conjure-fey | 6 | manual | Summons and things that act |
| contingency | 6 | manual | A trigger with no hook |
| create-undead | 6 | assist | Summons and things that act |
| disintegrate | 6 | assist | Objects, walls, terrain |
| eyebite | 6 | manual | A choice or random roll among effects |
| find-the-path | 6 | manual | Information or small utility |
| flesh-to-stone | 6 | assist | How an effect ends |
| forbiddance | 6 | manual | Wards against types or spells |
| freezing-sphere | 6 | assist | Objects, walls, terrain |
| globe-of-invulnerability | 6 | manual | Wards against types or spells |
| guards-and-wards | 6 | manual | Wards against types or spells |
| harm | 6 | assist | Number formula |
| heroes-feast | 6 | manual | A condition or state the engine lacks |
| instant-summons | 6 | manual | Objects, walls, terrain |
| irresistible-dance | 6 | assist | Forced behaviour and orders |
| magic-jar | 6 | manual | Shape and size change |
| mass-suggestion | 6 | assist | Forced behaviour and orders |
| move-earth | 6 | manual | Objects, walls, terrain |
| planar-ally | 6 | manual | Summons and things that act |
| programmed-illusion | 6 | manual | Illusions |
| sunbeam | 6 | assist | Follow-up each turn or a later action |
| transport-via-plants | 6 | manual | Movement and travel |
| true-seeing | 6 | manual | Sight, senses, light on a creature |
| wall-of-ice | 6 | manual | Objects, walls, terrain |
| wall-of-thorns | 6 | manual | Objects, walls, terrain |
| wind-walk | 6 | manual | Movement and travel |
| word-of-recall | 6 | manual | Movement and travel |
| arcane-sword | 7 | manual | Summons and things that act |
| conjure-celestial | 7 | manual | Inside an area, or an area that moves |
| delayed-blast-fireball | 7 | manual | Follow-up each turn or a later action |
| divine-word | 7 | manual | Number formula |
| etherealness | 7 | manual | Leaves the map |
| finger-of-death | 7 | assist | Summons and things that act |
| fire-storm | 7 | assist | An area the engine cannot lay out |
| forcecage | 7 | manual | Objects, walls, terrain |
| magnificent-mansion | 7 | manual | Leaves the map |
| mirage-arcane | 7 | manual | Illusions |
| plane-shift | 7 | manual | Leaves the map |
| prismatic-spray | 7 | assist | A choice or random roll among effects |
| project-image | 7 | manual | Illusions |
| regenerate | 7 | assist | Follow-up each turn or a later action |
| resurrection | 7 | manual | Revive, restore, dispel |
| reverse-gravity | 7 | manual | Inside an area, or an area that moves |
| sequester | 7 | manual | A condition or state the engine lacks |
| simulacrum | 7 | manual | Summons and things that act |
| symbol | 7 | manual | Objects, walls, terrain |
| teleport | 7 | manual | Movement and travel |
| animal-shapes | 8 | manual | Shape and size change |
| antimagic-field | 8 | manual | Wards against types or spells |
| antipathy-sympathy | 8 | manual | Forced behaviour and orders |
| befuddlement | 8 | assist | A condition or state the engine lacks |
| clone | 8 | manual | Revive, restore, dispel |
| control-weather | 8 | manual | Information or small utility |
| demiplane | 8 | manual | Leaves the map |
| dominate-monster | 8 | assist | Forced behaviour and orders |
| earthquake | 8 | manual | Objects, walls, terrain |
| glibness | 8 | manual | Number formula |
| holy-aura | 8 | manual | Inside an area, or an area that moves |
| incendiary-cloud | 8 | assist | Inside an area, or an area that moves |
| maze | 8 | manual | Leaves the map |
| mind-blank | 8 | assist | A condition or state the engine lacks |
| power-word-stun | 8 | manual | Number formula |
| sunburst | 8 | assist | How an effect ends |
| tsunami | 8 | manual | Objects, walls, terrain |
| astral-projection | 9 | manual | Leaves the map |
| foresight | 9 | assist | How an effect ends |
| gate | 9 | manual | Leaves the map |
| imprisonment | 9 | assist | A choice or random roll among effects |
| mass-heal | 9 | manual | Number formula |
| meteor-swarm | 9 | assist | An area the engine cannot lay out |
| power-word-heal | 9 | manual | Number formula |
| power-word-kill | 9 | manual | Number formula |
| prismatic-wall | 9 | manual | Objects, walls, terrain |
| shapechange | 9 | manual | Shape and size change |
| storm-of-vengeance | 9 | manual | Follow-up each turn or a later action |
| time-stop | 9 | manual | Extra actions or turn limits |
| true-polymorph | 9 | manual | Shape and size change |
| true-resurrection | 9 | manual | Revive, restore, dispel |
| weird | 9 | assist | Follow-up each turn or a later action |
| wish | 9 | manual | A choice or random roll among effects |
