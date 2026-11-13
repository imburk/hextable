# Rules coverage review

Question from the project owner: if licensing for the full current rules
could be arranged, would the design in `rules-expansion.md` support them?
And would it support the house rules tables commonly use?

Short answer: **yes for the great majority, with one structural gap that
changed the plan, and five areas that need their own specs.** Nothing found
requires abandoning a decision already made.

## What this review is and is not

- It walks the *kinds of mechanic* in the current (2024) core rules: the
  Player's Handbook, Dungeon Master's Guide and Monster Manual, plus widely
  used house rules found in community lists (sources at the end).
- It asks of each kind: can it be expressed with content packs, effect
  steps, modifiers, conditions, forms, equipment states, the space model and
  table rules? If not, what is missing?
- It was done from general knowledge of how those books' mechanics work,
  **not from a line-by-line read of licensed text**, which this project does
  not have. Individual features may still surprise us. Treat "covered" as
  "the mechanism exists", not "every case was checked".
- It reproduces no non-SRD rules text. Only the SRD 5.2.1 may be included in
  this repository.

## On licensing

This is not legal advice. The SRD 5.2.1 is under CC-BY-4.0 and can ship in
this open source repository with attribution. Everything else in the core
books is not, and would need an agreement with the rights holder.

The design keeps that door open without risk to the open source project:
content packs are separate from the engine, and a table records which packs
it uses. A licensed pack can therefore live **outside the public
repository**, be loaded by a private server, and never be redistributed.
The engine would not change.

## Result by area

Status key:

- **Covered**: expressible with what the spec already defines.
- **Covered, amended**: expressible after the amendments made in response to
  this review (decisions 5 to 8).
- **Needs prompts**: needs the pause-and-ask mechanism (stage B of decision 4).
- **Needs its own spec**: a real subsystem not yet designed.
- **Table-side**: the game provides the numbers; people at the table do the rest.

### Core resolution

| Mechanic | How | Status |
|---|---|---|
| Ability checks, saves, attack rolls, proficiency, expertise | hooks in the modifier system | Covered |
| Advantage and Disadvantage, and their cancelling | modifier ops | Covered |
| Skills and tools, passive scores | derived values with a `why` | Covered |
| Contested or DC-based actions outside combat (influence, search, study) | a check against a DC the DM sets | Covered, DM sets the DC |
| Rerolls and dice added after seeing a roll (inspiration-style features, luck) | a pause point after the roll | Needs prompts |
| Group checks, working together | check with a helper modifier | Covered |

### Combat

| Mechanic | How | Status |
|---|---|---|
| Initiative, surprise affecting initiative | rule point at initiative | Covered |
| Actions, Bonus Actions, movement, one free object interaction | turn budget, already built | Covered |
| Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Search, Study, Utilize | actions as data | Covered; Hide needs sight |
| Ready (act later on a trigger) | a reaction with a chosen trigger | Needs prompts |
| Opportunity attacks | standing instruction, built | Covered |
| Other reactions with a choice in the moment | pause point | Needs prompts |
| Two-weapon fighting, weapon properties, weapon mastery effects | weapon data plus modifiers with `scope`, effect steps on hit | Covered, amended |
| Unarmed strikes, grappling, shoving | actions with a save and a condition or `move` step | Covered |
| Critical hits and their variants | rule point at damage | Covered |
| Cover | needs map geometry | Needs its own spec (sight) |
| Mounted combat | rider and mount share movement and position | Needs its own spec |
| Underwater combat | modifiers switched on by terrain | Covered once terrain tags exist |
| Size, reach, squeezing, moving through others | footprints | Covered, amended |
| Flying, climbing, swimming, burrowing, hovering, falling | movement modes and `z` | Covered, amended |
| Fighting from a tree, a balcony, a bridge | surfaces at a height | Covered, amended |

### Damage, healing, death

| Mechanic | How | Status |
|---|---|---|
| Damage types, resistance, vulnerability, immunity | built; becomes modifiers | Covered |
| Temporary hit points | `heal` with `temp` | Covered |
| Death saves, stabilising, massive damage | built | Covered |
| Short and long rests, hit dice, what each restores | `resource` steps keyed to a rest | Covered |
| Exhaustion with levels | a condition with a `level` that scales its modifiers | Covered; conditions need a `level` field (added to R3) |

### Conditions and lasting effects

| Mechanic | How | Status |
|---|---|---|
| The standard conditions | data in `conditions.js` | Covered |
| Effects with durations, repeat saves, "until the end of your next turn" | `state.effects` and ending rules | Covered |
| Concentration | built in R4 | Covered |
| Auras and emanations that move with a creature | an effect with an area anchored to a creature, re-tested on movement | Covered; anchor added to the effect format |
| Zones that stay in place (walls, clouds, difficult ground) | an effect with an area anchored to hexes | Covered |
| Curses, diseases, poisons with stages | effects with their own ending and progression rules | Covered for the common shapes; unusual ones `manual` |

### Spellcasting

| Mechanic | How | Status |
|---|---|---|
| Slots, prepared and known spells, cantrips, rituals, upcasting | sheet plus spell data | Covered |
| Components and focuses, optional | table rule | Covered, amended |
| Attack, save, automatic, healing, buff and debuff spells | effect steps | Covered |
| Areas of every shape, at any height | area targeting with `z` | Covered, amended |
| Summoning and conjuring creatures | adds creatures the caster's player controls | Needs its own spec (companions) |
| Counterspelling and other spell reactions | pause point | Needs prompts |
| Changing shape | forms | Covered, amended |
| Illusions, divination, social and exploration magic | text shown, DM decides | Table-side (`manual`) |
| Teleporting, pushing, pulling | `move` step | Covered |
| Variant casting systems (spell points) | a different resource on the same steps | Covered as a table rule |

### Classes, species, backgrounds, feats

Class features fall into a small number of shapes. Each shape is listed once.

| Shape | Examples of the shape | How | Status |
|---|---|---|---|
| A pool of uses that recovers on a rest | second wind, rage, channelled power, focus points | feature with `uses` and `recover` | Covered |
| Always-on bonus | fighting styles, unarmoured defence, extra speed | static modifiers folded by `derive` | Covered |
| Extra attacks | at levels 5, 11, 20 | attack count on the Attack action | Covered |
| Bonus damage once a turn under a condition | sneak attack and similar | modifier with a once-per-turn flag, built today | Covered |
| Spend something after a hit | smite-style features, some manoeuvres | pause point after the hit, or a standing instruction ("on a critical hit") | Needs prompts for full choice; standing instruction covers most play |
| A die handed to an ally for later | inspiration dice | an effect on the ally, spent at a pause point | Needs prompts |
| Modifying a spell as it is cast | metamagic-style options | options chosen when declaring the spell | Covered; choices are part of the cast action |
| Changing shape | wild shape | forms | Covered, amended |
| A companion creature | beast companions, familiars, steeds | a second creature the player controls | Needs its own spec (companions) |
| A stance or mode | rage, reckless attacks, patient defence | a self-applied effect with modifiers | Covered |
| Auras that help allies | paladin-style auras | creature-anchored effect | Covered |
| Choosing from a list at certain levels | invocations, masteries, maneuvers, feats, epic boons | `choices` in class data | Covered |
| Subclasses | all | another `levels` table merged at the right level | Covered |
| Multiclassing | all | several entries in `classes`, with shared slot rules | Covered by the sheet format; `derive` rules are a later task |
| Species traits | darkvision, resistances, breath weapons, flight, size | modifiers, senses, an action, a movement mode, size | Covered, amended; senses matter once sight exists |
| Backgrounds and origin feats | ability increases, proficiencies, a feat | grants at level 1 | Covered |

### Equipment and magic items

| Mechanic | How | Status |
|---|---|---|
| Weapons, armour, shields, properties, proficiency | equipment data and `derive` | Covered |
| An item that changes any other number, including another weapon's | modifiers with `scope` | Covered, amended |
| Items that must be worn, attuned or switched on | equipment states and `requires` | Covered, amended |
| Charges, recharging at dawn, items with several modes | `charges`, `recharge`, `modes` | Covered, amended |
| Potions, scrolls, other consumables | an item with an action and a quantity | Covered |
| Carrying capacity and encumbrance, automatic and optional | weights in data, table rule | Covered, amended |
| Ammunition tracking | quantity spent on attack; a table rule to ignore it | Covered |
| Cursed items | modifiers and a rule that blocks unequipping | Covered for the common shape |
| Sentient items | personality and conflict are roleplay | Table-side |
| Crafting, buying and selling, lifestyle | downtime | Needs its own spec (downtime) |

### Monsters

| Mechanic | How | Status |
|---|---|---|
| Stat blocks, traits, actions, multiattack | monster format | Covered |
| Recharge abilities | a resource rolled at the start of the turn | Covered; field reserved, small engine task |
| Legendary actions (acting after others' turns) | pause points between turns | Needs prompts |
| Automatic success on a failed save, a limited number of times | pause point after the save, or DM standing instruction | Needs prompts; standing instruction is workable |
| Lair effects | effects on a timer in a region | Covered as zone effects; scripted ones `manual` |
| Regeneration, damage thresholds, healing blocked by a damage type | start-of-turn effect with a condition on it | Covered |
| Swarms, creatures bigger than their space, sharing a space | footprints and a size rule | Covered, amended |
| Shapechangers | forms | Covered, amended |
| Swallowing, engulfing, carrying a creature | a condition that ties one creature's position to another's | Covered; "attached to" added to the space model |
| Innate spellcasting with uses per day | spells as actions with `uses` | Covered |
| Mounts and creatures that carry riders | shared position | Needs its own spec |

### Running the game

| Mechanic | How | Status |
|---|---|---|
| Traps and hazards | a hex or object with a trigger and effect steps | Covered once objects exist on the map (map spec) |
| Environmental effects (heat, cold, altitude) | conditions and saves on a timer | Covered |
| Travel pace, navigation, foraging | exploration turns | Needs its own spec (exploration) |
| Chases | DM-run with the tracker | Table-side |
| Light, vision, darkvision, hiding, being unseen | needs map geometry | Needs its own spec (sight) |
| Experience, milestones, levelling | `levelUp` action with either trigger | Covered |
| Rest variants (slower or faster recovery) | table rule on what a rest restores | Covered |
| Strongholds and long-term holdings | campaign management | Needs its own spec (downtime) |
| Random tables, treasure, encounter building | DM tools, not rules enforcement | Out of scope for the engine |

## Common house rules

Found in community lists and forum surveys (sources below). Each maps to a
rule point, so each can be a table option without new engine design.

| House rule | Rule point | Status |
|---|---|---|
| Flanking gives Advantage, or a flat bonus | situation tag `flanked`, defined for hexes; option `none`, `advantage`, `plus-2` | Covered; needs a hex definition of "opposite sides" |
| Critical hits deal maximum dice plus a roll | critical damage | Covered |
| Drinking a potion as a Bonus Action | cost of using a consumable | Covered. The current rules already do this for potions |
| A free feat at level 1 | character creation grant | Covered |
| Death saves rolled out of sight | view option | Covered |
| Drawing a weapon as part of the attack | cost of changing equipment state | Covered |
| Ignoring ammunition and carrying capacity | options `off` | Covered, amended |
| Spell points in place of slots | casting resource | Covered |
| Initiative rerolled each round, side initiative, swapping initiative | initiative | Covered; side initiative changes turn order logic and needs a small engine task |
| Inspiration spent for a reroll | after-roll decision | Needs prompts |
| Lingering injuries on a critical hit or at 0 hit points | a table to roll on, applying a homebrew condition | Covered by a homebrew pack; unusual injuries `manual` |
| "Bloodied" as a visible state at half hit points | already how players see monsters | Built |
| Limits on resurrection, harsher or kinder death | spell data overrides in a homebrew pack; death save rule point | Covered |
| "Rule of cool" one-off rulings | DM override tools | Built; this is what DM tools are for |
| Hit points at level-up: fixed, rolled, or rolled with a floor | character creation option | Covered |
| Alternative weapon property sets | a homebrew pack replacing weapon data | Covered if the properties use existing steps and hooks |
| Entirely new actions or action economy changes | new engine behaviour | Not covered; each is its own design |

The last row is the honest limit. Packs and switches cover changes to
numbers, costs, options and content. A house rule that invents a new kind of
action, or changes how turns work, is engine work.

## What the review changed

1. **Prompts moved from "later" to "plan for it now".** Counting the rows
   above, the pause-and-ask mechanism is the most common thing missing: Ready,
   reactions with a choice, spending after a hit, dice added after a roll,
   rerolls, legendary actions. Standing instructions cover a good share of
   real play, but not all of it. The spec's decision 4 was amended: action
   resolution is built as a resumable queue from task R2, so prompts can be
   added without rebuilding it.
2. **Decisions 5 to 8 were added**: space (size, height, flying, surfaces),
   equipment states, forms, and table rules.
3. **Small additions to formats**: a `level` on conditions (for exhaustion),
   an anchor on effects (creature or hexes, for auras and zones), and an
   "attached to" relation between creatures (swallowed, grappled and
   carried, later mounted).

## What still needs its own spec

In the order I would write them:

| Spec | Why it cannot be folded in | Blocks |
|---|---|---|
| Sight: line of sight, cover, light, hiding | needs the map's 3D geometry and a visibility calculation | Hide, cover, darkvision, unseen attackers, fog of war |
| Prompts: stage B of reactions | a user-interface and timing design on top of the R2 queue | Ready, counterspelling, after-roll spending, legendary actions |
| Companions and summons | who controls an extra creature, when it acts, what it shares | familiars, beast companions, conjured creatures, mounts |
| Maps and objects | traps, doors, containers, terrain that changes | traps, hazards, interactive scenery |
| Downtime and exploration | not combat; a different loop | crafting, travel, strongholds |

None of these is needed to play fights with real characters, which is what
the current task list delivers.

## Sources for the house-rule survey

Articles and forum threads surveying common fifth edition house rules:

- [DM David, on the nine most popular house rules](https://dmdavid.com/tag/scrutinizing-the-9-most-popular-house-rules-for-dd)
- [TheGamer, on popular homebrew rules](https://www.thegamer.com/dungeons-dragons-most-popular-homebrew-rules/)
- [Tabletop Gaming, on common rules that are homebrew](https://tabletopgaming.co.uk/features/8-common-dd-5e-rules-you-didnt-know-were-homebrew)
- [EN World thread on 2024 house rules](https://www.enworld.org/goto/post?id=9629609)
- [EN World thread on house rules assumed common](https://www.enworld.org/goto/post?id=9045428)
- [Dungeon Mister, on the 2024 rules changes](https://dungeonmister.com/guides/important-rules-changes-in-dnd-2024/)
