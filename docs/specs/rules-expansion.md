# Spec: rules expansion

Status: design agreed by the project owner, not built. Owner of the design:
Claude (Fable). Reviewed against the full current rules and common house
rules in `rules-coverage.md`.
Covers characters, levelling, conditions, durations, reactions, and the data
format for all SRD 5.2.1 content. Tasks at the end are sized for one pull
request each and say which can go to any coding agent.

Rule details quoted here are from memory of the SRD 5.2.1 and are marked
**(check)** where an implementer must confirm them against the SRD text
before coding. The SRD is the authority, not this document.

## Where we are

The engine plays a correct level 1 fight for four pregenerated characters and
three monsters. It does so with numbers that were worked out by hand and
typed in:

- A character is a flat record: `ac: 18`, `attacks: [{ bonus: 5, damage: "1d8+3" }]`.
  Nothing records *why* the bonus is 5, so nothing can recompute it at level 2.
- A spell is one of four hard-coded kinds (`attack`, `save`, `auto`, `heal`).
- Conditions are booleans on the creature (`cond.prone`), each with its rules
  written inline in the engine. Two exist (Prone, Unconscious) of fifteen.
- Nothing lasts: there are no durations and no concentration.
- The only reaction is the opportunity attack, taken automatically.
- All content is one 87-line file.

This got a playable game fast. It will not carry a campaign: the SRD has
roughly 340 spells, 330 monsters, 12 classes over 20 levels, and several
hundred items **(check counts)**.

## Goals

1. **Your campaign's real characters can sit at the table soon**, at any
   level, before full character creation exists.
2. **Adding SRD content is data entry**, done by any agent or person, checked
   by a machine, with no engine change per entry.
3. **The engine never pretends.** If it cannot apply an effect by the rules,
   it says so and hands the decision to the DM. It does not approximate.
4. **Derived numbers are never typed in.** Attack bonuses, save DCs, Armor
   Class and hit points are computed from choices.
5. Everything already true stays true: one `apply()`, pure and replayable,
   rejected actions change nothing, views decide what players are sent.

Not in this spec: multiclassing, crafting, downtime, vehicles, mounted
combat, line of sight, cover and light. `rules-coverage.md` says which of
those the design can take later and which need their own spec.

## The first four decisions

Everything else follows from these and the four after them. Each is the kind of choice that is
expensive to reverse once content has been written against it.

### Decision 1: three layers, not one

```
content   definitions that are the same for every table      (data, read-only)
sheet     the choices that make one character                (data, per character)
record    the numbers the engine plays with                  (computed, never typed)
```

- **Content** is what the SRD says: a Longsword does 1d8 slashing, a Fighter
  gets Second Wind at level 1.
- **A sheet** is what the player chose: Human, Soldier, Fighter 3, these
  ability scores, this armour, these spells prepared.
- **A record** is what `derive(sheet, content)` produces: the flat creature
  the engine already reads today (`ac`, `attacks`, `saveProf`, `slotsMax`).

The engine keeps reading records. `derive()` is a new pure function. Because
the record's shape barely changes, the 594 lines of engine and its tests keep
working while the layers are built underneath them.

A creature in the game state becomes `{ ...record, sheet, state }`, where
`state` is what changes in play (current hit points, spent slots, active
conditions). On level-up or an equipment change the engine re-derives the
record and carries `state` across.

Monsters have no sheet: a stat block already is a record.

### Decision 2: effects are a small vocabulary; anything else is manual

A spell, a monster action, a class feature, a magic item and a condition all
*do things*. They are described with one shared list of effect steps:

| Step | Meaning |
|---|---|
| `attack` | make an attack roll (`melee` or `ranged`, `weapon` or `spell`) against each target; later steps under `onHit` / `onMiss` |
| `save` | each target makes a saving throw; later steps under `onFail` / `onSuccess`, with `half: true` for half damage |
| `damage` | roll dice of a type; supports `+mod`, scaling, and "extra on a critical hit" |
| `heal` | restore hit points; `temp: true` for temporary hit points |
| `condition` | apply or remove a condition, with a duration |
| `modifier` | attach a modifier to a creature for a duration (see decision 3) |
| `move` | push, pull or teleport a creature a number of feet |
| `resource` | spend or restore a resource (spell slot, class feature use, hit dice) |
| `manual` | the engine does nothing; the text is shown and the DM applies it |

Targeting is described separately: `self`, `creature` (with range and count),
or an `area` (`cone`, `sphere`, `line`, `cube`, `cylinder`, `emanation`
**(check the 2024 area names)**) with a size in feet.

Every entry is in one of three **tiers**, recorded in the data:

| Tier | Meaning | Engine behaviour |
|---|---|---|
| `auto` | fully described by the steps above | resolved and enforced |
| `assist` | the roll and damage are described; some consequence is not | resolved, then the leftover text is shown to the DM as a prompt |
| `manual` | not described | costs are enforced (action, slot, range, components); the effect text is shown; the DM applies the outcome with DM tools |

This is what makes goal 2 and goal 3 compatible. Every SRD spell and monster
can be entered now, with its full rules text, at whatever tier is honest.
Play is never blocked on the engine, and nothing is silently wrong. Tiers are
then raised over time by adding steps, without touching the entries that are
already `auto`.

The vocabulary is deliberately closed. A new step type is an engine change
that needs a spec amendment; it is not something a content pull request can
introduce.

### Decision 3: one modifier system

Advantage from Pack Tactics, +2 AC from a Shield, Disadvantage from being
Poisoned, resistance from Rage, Speed 0 from Grappled: these are all the same
thing. Today each is an `if` in the engine. They become data:

```js
{ on: "attack.roll",  op: "advantage",    when: ["target.prone", "within5"] }
{ on: "ac",           op: "add", value: 2 }
{ on: "save.dex",     op: "autoFail" }
{ on: "speed",        op: "set", value: 0 }
{ on: "damage.taken", op: "resist", types: ["bludgeoning", "piercing", "slashing"] }
```

- `on` names one of a fixed list of hooks (about twenty: ability checks,
  attack rolls made and received, each save, damage dealt and taken, AC,
  speed, initiative, concentration, and so on).
- `op` is one of `add`, `set`, `min`, `max`, `advantage`, `disadvantage`,
  `autoFail`, `autoSucceed`, `resist`, `vulnerable`, `immune`, `crit`.
- `when` is a list of named situation tags the engine knows how to test
  (`within5`, `target.prone`, `attacker.unseen`, `ranged`, `ally.adjacent`).
  All must hold. `beyond5` was added to the list with R3, for Prone.

One engine function, `modifiers(state, creature, hook, situation)`, collects
every modifier that applies from four sources: the creature's features and
equipment (static, folded in by `derive`), its active conditions, and effects
currently on it. Each roll asks once and gets back the total and the list of
reasons, which is what the log already shows ("with Advantage (Pack Tactics)").

Advantage and Disadvantage keep their rule: any number of each cancels to a
normal roll.

The hook and tag lists are closed in the same way as effect steps.

Two more fields make a modifier precise about *what* it touches and *when
it is switched on*:

- `scope` narrows which rolls it applies to. A magic weapon's +1 applies to
  attacks with that weapon (`scope: { weapon: "self" }`). A weapon that makes
  your *other* weapon better says so (`scope: { weapon: "other" }`), and one
  that changes something unrelated to weapons simply names another hook
  (`on: "save.wis"`, `on: "speed"`, `on: "spell.dc"`). Scope can also select
  by weapon property, category, damage type, spell school or skill.
- `requires` says what state the source must be in: `carried`, `equipped`,
  `attuned` or `active` (see decision 6).

So arming a weapon can modify anything a hook exists for, including other
weapons, with no engine change per item.

### Decision 4: reactions by standing instruction first, prompts later

A reaction interrupts someone else's turn. Doing that properly means the
engine must stop half-way through resolving an action, wait for another
player, and resume. That requires rebuilding action resolution as a queue of
resumable steps stored in the game state, because a paused JavaScript
function cannot be saved, replayed or sent over a network.

That rebuild is the single largest piece of engine work in sight. This spec
does it in two stages:

- **Stage A (in this spec):** each creature carries standing instructions for
  its reactions, set on its sheet and changeable at any time, even off-turn:
  "take Opportunity Attacks: always / never / ask the DM", "cast Shield when
  an attack would hit: yes / no". The engine consults them and resolves
  without pausing. This covers Opportunity Attacks, Shield, Uncanny Dodge and
  similar "when X, do Y" reactions **(check which SRD reactions fit)**.
- **Stage B (a later spec):** true prompts for reactions that need a choice
  in the moment, such as Counterspell. Until then those are `manual`.

Stage A is cheap, stays replayable, and plays faster at a table than waiting
for a prompt on every enemy move.

**Amended after the coverage review** (`rules-coverage.md`): a large share of
class features, feats and monster abilities are decisions made *after* a roll
is seen (spend a resource on a hit, add a die to a failed check, reroll, take
a legendary action after another creature's turn). Standing instructions
cover the common cases, but the review shows prompts are not a niche need.
So task R2 builds action resolution as a queue of small steps stored in the
game state from the start, even though nothing pauses yet. That costs a
little more in R2 and avoids rebuilding it for stage B. Standing instructions
then become one way of answering a pause point, and a live prompt another.

## Four more decisions, from play experience

Added after review by the project owner, who runs a campaign. Each is a
requirement the first four decisions did not answer.

### Decision 5: one model of space for size, height, flying and layers

> Replaced by [maps-and-objects.md](maps-and-objects.md), decisions 2 and 3,
> which design height and size together with walls and floors. Task R9 is
> now M6 and M7 there, both built. The text below is kept for the record.

A creature's position becomes `{ q, r, z }` and its body has a footprint.

- **Size and footprint.** Size (`tiny` to `gargantuan`) is data on the
  record. Each size has a footprint: the set of hexes it fills, anchored on
  one hex. Proposed: Tiny, Small and Medium fill one hex; Large three; Huge
  seven; Gargantuan twelve. The table is in the content pack, so it can be
  changed without touching the engine. Movement, reach, areas, opportunity
  attacks and "is this hex free" all work on footprints. Several Tiny
  creatures may share a hex.
- **Height.** `z` is feet above the lowest ground. Every hex has a ground
  height and may list further **surfaces** above it: a tree limb, a balcony,
  a bridge, a roof. A creature is either standing on a surface or in the air.
- **Movement modes.** A record has a speed per mode: walk, climb, swim, fly,
  burrow, plus `hover`. Moving up a tree is climbing to a surface; flying is
  moving through `z` with a fly speed. They are the same mechanism, which is
  why attacking from a tree and attacking from the air need no separate code.
- **Distance** between two creatures uses all three axes. How vertical
  distance combines with horizontal is a table rule (decision 8), since
  tables differ.
- **Falling.** A flyer that cannot stay up (knocked Prone, Speed 0,
  Incapacitated, unless it hovers), or a creature whose surface is removed,
  falls to the next surface below and takes falling damage **(check the
  amounts and limits)**.
- Large creatures squeezing through small gaps, and being moved through by
  smaller ones, follow the size rules **(check)**.
- One creature can be **attached to** another (grappled and dragged,
  swallowed, carried, later mounted): its position follows the other's until
  the attachment ends.

What this does not include: line of sight, cover and light. Those need the
map's geometry and are the next spec; this decision gives them the `z` they
will need.

### Decision 6: equipment has states, and effects say which state they need

An item on a sheet is in one of four states, each including the ones before:

| State | Meaning |
|---|---|
| `carried` | in the pack; counts for weight |
| `equipped` | worn or held; a weapon is in a hand, armour is on |
| `attuned` | bonded, for items that require it; limited in number **(check the limit)** |
| `active` | switched on: a command word spoken, a charge spent, a mode chosen |

- A modifier, action or feature granted by an item names the state it needs
  (`requires`). A ring that does nothing until activated simply requires
  `active`.
- Changing state is an action in the game with its own cost (free, an
  action, a Bonus Action, a rest), so the engine enforces "you have not
  drawn that yet".
- Items may carry `charges`, a `recharge` rule, and `modes` (a staff with
  two settings).
- Hands are tracked: what is in the main hand and off hand decides which
  attacks exist and whether a spell's gestures are possible.

### Decision 7: forms, for animal transformation and anything like it

Turning into an animal replaces part of who you are for a while. The engine
models that as a **form** laid over the creature:

```js
form: { block: "brown-bear", rule: "wild-shape", ends: { on: "time", at: 1260 } }
```

- `block` is a stat block from the content packs.
- `rule` is an entry in a `forms` table that says, field by field, what
  comes from the stat block and what is kept from the character: ability
  scores, Armor Class, speeds, size, attacks, hit points or temporary hit
  points, proficiencies, features, whether spells can be cast, what happens
  to equipment. Different transformations (a druid's shape change, a
  polymorph spell, a lycanthrope's hybrid form) are different rows in that
  table, not different code.
- The playing record is `applyForm(derive(sheet), form)`. Size, footprint,
  speeds and attacks change with it, so a character who becomes a giant
  eagle can fly (decision 5) and one who becomes a buffalo fills more hexes.
- The form ends by its own rule: time, dropping to 0 hit points, a Bonus
  Action, or the DM. Ending restores the original record and carries over
  what the rule says (remaining damage, conditions).
- Monsters with more than one shape use the same mechanism.

### Decision 8: table rules are switches, and homebrew is switches plus packs

Tables differ. Each difference is a named option the DM sets for their table:

```js
rules: { encumbrance: "off", "spell-materials": "focus-or-pouch", flanking: "none", "critical-hits": "double-dice" }
```

- Options are declared in content packs with an id, a description, the
  allowed choices and a default. The SRD pack's defaults are the rules as
  written.
- The engine reads an option at a fixed list of **rule points** (initiative,
  critical damage, what a potion costs to drink, when a fight starts, how
  vertical distance counts, and so on). A homebrew pack may add a choice at
  an existing rule point; a new rule point is an engine change.
- Options named by the project owner, all off-by-choice:
  - **Encumbrance** is automatic when on. Every item has a weight; the sheet
    totals what is carried; the limit comes from Strength and size; going
    over applies a Speed modifier through decision 3. Nobody types a weight.
    Choices: `off`, `capacity`, and a stricter variant.
  - **Spell materials.** Choices: `ignore`, `focus-or-pouch` (the default:
    covered unless the component has a cost), `track` (costly components are
    inventory items and are used up when the spell says so).
- Player-side choices, such as whose death saves are rolled out of sight,
  are options too, read by the view layer.

Common house rules found in a survey of community lists are mapped to rule
points in `rules-coverage.md`.

## The combat tracker

The game already keeps everything a combat tracker shows: the order, whose
turn it is, hit points, conditions, what each creature has left this turn.
Today it is drawn as a strip of names. A proper tracker is a panel over the
same state and needs no new rules.

- **Tracker v1 (can be built now, by any agent):** a list in initiative
  order with health, conditions, whose turn, round counter, reaction used,
  and hidden creatures marked for the DM. DM controls on each row: damage
  or heal by a typed amount, apply to several rows at once, set a condition,
  skip, remove from the fight, reveal. Players see the same list through
  their view: health words for monsters, no hidden rows.
- **Tracker v2 (after R3 and R4):** effects with time remaining,
  concentration, targets of the current action, delaying a turn, grouped
  initiative for identical monsters, and a round-by-round history.

## Modularity

Quick entry and the character builder are separate front ends that both
produce a sheet. The engine only ever sees the record made from it. Either
can be rebuilt, replaced or extended later without touching the other or
the rules. The same is true of the tracker, the renderer, and each content
pack.

## Content packs

```
packages/rules/src/content/
  schema.js          the closed vocabulary and the linter
  terrain.js         terrain types (engine data, not rules content)
  srd52/
    pack.js          { id, name, version, license, attribution }
    conditions.js
    spells.js        (split by level when it grows: spells-0.js ... spells-9.js)
    monsters.js      (split by first letter when it grows)
    classes.js
    species.js
    backgrounds.js
    feats.js
    equipment.js     weapons, armour, gear
    magic-items.js
  index.js           loads packs and builds lookup tables by id
```

- Files are JavaScript modules that export plain data: objects, arrays,
  strings, numbers, booleans. **No functions, no computed values, no
  imports.** This keeps them loadable in the browser with no build step, and
  means a data pull request cannot contain logic. The linter enforces it.
- Ids are `kebab-case` and unique within their kind: `fire-bolt`,
  `goblin-warrior`. The current camelCase ids are migrated.
- Every entry carries `text`: what it does, in plain words. The SRD 5.2.1 is
  licensed CC-BY-4.0, so a contributor may use its wording with the
  attribution in `pack.js`; a short description written for this project is
  also fine.
- Every entry carries `source: "SRD 5.2.1"`.
- Every entry carries `checked`: `true` only when someone has compared every
  number in it against the SRD text. The coverage report counts unchecked
  entries, so accuracy is tracked separately from how much is entered.
- A table's state records which packs it uses. Homebrew goes in its own pack;
  nothing outside `srd52/` may claim to be SRD.

### A spell

```js
{
  id: "burning-hands", name: "Burning Hands", source: "SRD 5.2.1",
  level: 1, school: "evocation", classes: ["sorcerer", "wizard"],
  time: "action", range: "self", components: ["v", "s"],
  duration: "instant", concentration: false, ritual: false,
  target: { area: { shape: "cone", size: 15 } },
  effects: [
    { save: "dex", half: true,
      onFail: [{ damage: "3d6", type: "fire" }] },
  ],
  higher: { slot: { damage: "+1d6" } },      // per slot level above 1st
  tier: "auto",
  text: "A thin sheet of flames shoots forth ...",
}
```

Cantrips scale by character level with `higher: { level: { 5: "2d10", 11: "3d10", 17: "4d10" } }`.
A levelled spell cast with a higher slot adds `higher.slot` once per level
above its own: `{ damage: "1d6" }`, `{ heal: "2d8" }` or `{ times: 1 }`.

What the engine does with a spell today (task R2):

- Aims it: one creature in range, the caster, or an area. Cones, spheres,
  cylinders, emanations, lines and cubes are laid out on the hexes (see the
  build notes on the vocabulary below for lines and cubes).
- Charges for it: the action or Bonus Action, the slot, the range. Spells
  cast as a Reaction are refused for now; spells that take longer than a
  turn can only be cast outside a fight.
- Runs its steps. In an area, damage is rolled once and shared.
- Says what it did not do. A `manual` step shows its text to the table. A
  step the engine cannot run yet, the part of a condition it does not apply,
  a `when` it cannot judge, a spell marked `assist`, and a duration it
  cannot time each produce a note to the DM.

### A monster

```js
{
  id: "wolf", name: "Wolf", source: "SRD 5.2.1",
  size: "medium", type: "beast", cr: 0.25, xp: 50,
  ac: 12, hp: 11, hitDice: "2d8+2", speed: { walk: 40 },
  abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  saves: {}, skills: { perception: 5, stealth: 4 }, senses: { darkvision: 60, passivePerception: 15 },
  traits: [
    { id: "pack-tactics", name: "Pack Tactics",
      modifiers: [{ on: "attack.roll", op: "advantage", when: ["ally.adjacentToTarget"] }],
      text: "..." },
  ],
  actions: [
    { id: "bite", name: "Bite",
      target: { creature: { reach: 5 } },
      effects: [{ attack: "melee", bonus: 4,
        onHit: [{ damage: "1d6+2", type: "piercing" },
                { condition: "prone", when: ["target.sizeAtMost.large"] }] }],
      text: "..." },
  ],
  tier: "auto",
}
```

Multiattack is an action whose effect is a list of other action ids.
Recharge, legendary actions and lair actions are fields the format reserves
now and the engine treats as `manual` until built.

#### Build notes: monster actions, Multiattack, Extra Attack (amendment)

Settled when monster actions were made to run from their data (DEBT M1 to M4, C1):

- **Actions run like spells.** A creature made from a pack monster carries its
  actions (everything but `text`). The engine action `{ type: 'act', actor,
  action, target? | hex? }` runs the action's effect steps through the effect
  runner: a weapon attack step uses its own `bonus`, a save its own `dc`, reach
  and range come from `target.creature`, and areas are aimed as a spell's are.
  It costs the action. The old `attack` action, given the id of one of a
  monster's actions, does the same; for a creature with flat attack records
  (characters, and creatures saved without a template) nothing changed. A
  creature's Opportunity Attack is its first melee attack action. The flat
  `attacks` summary of a monster stays, for screens and old saves; the engine
  does not use it for a creature that has actions.
- **Multiattack** is an action with `multiattack` and no `target` or `effects`:
  a list of `{ action, times }`, where `action` is the id of another action of
  the same creature or a list of ids ("any of these", for "in any
  combination"); or `{ or: [list, list, ...] }`, alternatives ("it can replace
  one attack with..."). An entry may not name a Multiattack, a Bonus Action, or
  an action with a recharge or uses: the SRD's "if available" stays text.
  Using it spends the action and puts the attacks in `encounter.budget.attacks`
  as alternatives of `{ action, left }`. Each later `act` that one of them
  allows spends from every alternative that allows it (its narrowest entry) and
  drops those that do not, so the choice between alternatives is made attack by
  attack, each at a target chosen then, with movement in between. Whatever is
  left when the turn ends is lost: the budget is rebuilt at every turn.
- **Extra Attack** is `features.extraAttack: n` on a character record (1 to 3).
  The first `attack` of a turn spends the action and leaves
  `[[{ action: null, left: n }]]` in the same budget; `null` allows any attack.
  Sneak Attack is still once a turn.
- **One hit, one instance of damage.** Damage steps that follow one another in a
  list land together (`damage()` takes a list of parts): each part is resisted
  and logged on its own, but a dying creature fails one death save for the hit
  (two on a critical hit) and Concentration is tested once, against the total.
- **Recharge, uses, Bonus Actions:** an action may have `recharge: [min, 6]`
  (spent on use, rolled for at the start of each of the creature's turns,
  `recharge` event), `uses: { per: 'day', n }` (counted in `creature.charges`;
  nothing restores it yet), and `time: 'bonus'` (costs the Bonus Action).
- **Areas** of monster actions: `target.area.range` (feet) says how far away a
  sphere or cylinder may be centred. Without it the engine has nothing to aim
  and the DM applies the action. Lines and cubes: see below.
- **Condition immunities:** `conditionImmune: [conditions]` on a monster. The
  engine refuses those conditions (a `note` says so) and the DM cannot set them.
- **Views.** A monster's actions are never sent to players (the seen record is
  an allow list), nor what a Multiattack left (`budget` is sent only for one of
  their own). The `act` event is sent as its name, hexes and targets. Saves
  after an `act` or an attack are redacted as after a cast. A `manual` event
  from a creature that is not one of theirs goes to the DM only, because a
  monster's action text carries its numbers.
- **State version 10:** `migrate()` gives a creature with a pack template its
  actions and condition immunities.

#### Build notes: the vocabulary, extended (amendment)

Settled while widening what spells and monster actions can say (DEBT S1 to S7, M11). Each
entry names what was added to `schema.js` and what the engine does with it.

- **Lines and cubes** (S3, M11). `area.shape: 'line'` takes `size` (its length) and `width`
  (feet, 5 when not given). It starts at the edge of the caster's space, so a Large or larger
  creature's line starts at its front, and runs toward the hex aimed at; the hexes in it are
  those whose centres lie inside the strip (a centre exactly on its edge counts on one side
  only, so a 5-foot line is one hex wide in every direction). Aimed at a height (`hex.z`), or
  at a hex whose ground is higher or lower, it tilts: its length is measured along the tilt,
  and it catches a creature whose body it passes through. A line with a range (Wind Wall: a
  wall of any shape placed at a distance) is not laid out; the DM places it.
  `area.shape: 'cube'`: the SRD puts a cube's point of origin on one of its faces, outside it.
  A Self cube (Thunderwave) starts at the edge of the caster's space and extends `size` feet
  the way it is aimed, as wide, from the caster's height up. A cube with a range (Entangle,
  Hypnotic Pattern) is placed by its near face: the hex aimed at must be within range, is in
  the cube, and the cube extends away from the caster, rising `size` feet from the ground (or
  the height) aimed at. A 20-foot square on the ground is entered as a 20-foot cube.
  Three more area fields: `exceptCaster: true` ("each creature other than you", Entangle);
  `choose: n` (up to n creatures of the caster's choice in the area, Slow) and `count: n` (n
  such shapes arranged by the caster, Fire Storm's ten cubes), both of which keep the spell
  with the DM until the engine can take the choice. One situation tag, `target.seesSource`
  (the target can see the effect's source), which the engine cannot judge until sight is
  built: a step under it is handed to the DM for each creature, as any unjudged tag is.

- **More than one target** (S2). `target.creature.count` (1 when not given) is how many
  creatures a spell or action aims at; `repeat: true` makes the count one of rays, darts or
  beams, so one creature may take several (Magic Missile, Scorching Ray, Eldritch Blast);
  `within` (feet) keeps every target after the first that near the first (Chain Lightning).
  `higher.slot.targets` adds so many per slot level above the spell's own, and
  `higher.targets` gives the count by character level (Eldritch Blast: 2, 3 and 4 beams at 5,
  11 and 17). The `cast` and `act` actions take `targets: [ids]` (or `target`, one); each entry
  runs the effect steps once, in the order given, so two darts at one creature are two
  instances of damage. Damage from steps that are not attack rolls is rolled once for all the
  targets when they are distinct (SRD "Damage against Multiple Targets"); a ray or dart rolls
  its own. An area with `choose: n` takes `targets`, those of the creatures it catches the
  caster picks (Slow, Mass Cure Wounds); without a list it takes everyone caught if that is no
  more than n. A `manual` step reached for several targets of one effect is shown to the
  table once. The client adds a target for each tap until the count is reached, with a Cast
  button to go with fewer.

- **Dice in a modifier** (S1). An `add` modifier's `value` may be dice, `"1d4"` or `"-1d4"`.
  `modifiers()` never rolls (asking what applies must change nothing, and the client asks
  too); it lists them in `dice`, and the engine rolls them each time it makes the roll they
  apply to (attack rolls, saving throws, ability checks, death saves). The roll's event gets
  `extra: [{ name, dice, roll }]`. A passive score is not a roll: dice do not count there.
  Players are sent `extra` only on rolls of their own creatures (the view's allow lists).
  A new hook, `save`, applies to every saving throw (Bless, Bane), death saves included.
  Death saves now read `save.death` and `save` (Exhaustion's penalty, Foresight).
- **Scope, and a choice made in casting** (S7, S5). A modifier's `scope: { skill }` or
  `{ ability }` limits it to checks (or saves) with that skill or ability. A spell's
  `choice: { of: 'skill' | 'ability' | 'damageType', from? }` is made when it is cast: the
  `cast` action carries `choice`, which the engine checks against the list and puts wherever
  the steps say `"chosen"` (in `scope.skill`, `scope.ability` or a modifier's `types`).
  Guidance, Enhance Ability, Resistance, Protection from Energy. A chosen damage type in a
  `damage` step is not built yet. The client shows the choices as a menu beside the hint.
- **Adjusting damage taken.** An `add` on `damage.taken` (a number or dice, with `types`)
  changes the damage of a part of those types before Resistance and Vulnerability (SRD order
  of application), once per instance of damage; `once: 'turn'` limits it to once a turn,
  recorded in the turn's flags (the Resistance cantrip). The damage event says so in
  `adjusted`, which players are not sent.

- **Temporary Hit Points** (C5, S5). A creature's `tempHp` (none when absent). Damage takes
  them first and the rest goes to Hit Points; the damage event says how much they soaked
  (`temp`, sent to the DM only). They do not add up: a creature given some keeps the larger
  amount (the SRD lets it choose, and the engine chooses the larger). Healing never restores
  them, they never wake a creature at 0 Hit Points, and the massive-damage rule counts only
  what reached Hit Points. They last until spent or a Long Rest; from a lasting effect
  (`tempFx`, a part `{ target, temp: true }`) they vanish when it ends. A `tempHp` step
  (dice, `addMod` for the spellcasting modifier) grants them; `higher.slot.tempHp` adds per
  slot level. The DM setting Hit Points leaves them alone. Event `tempHp` (DM only until the
  view sends it). Shown on the sheet, the dock and the tracker.
- **A Long Rest for monsters** (M3). The `rest` action takes `ids`, who rests (the party when
  not given). A monster that rests gets its Hit Points back, its uses per day
  (`creature.charges`) and its spent recharges. The DM panel has "Long rest (everyone)".

- **`min` and `max`, and the hooks nothing read** (S7). `modifiers()` returns the largest
  `min` and the smallest `max`; Armor Class, Speed, the spell save DC and the spell attack
  bonus are kept within them (Barkskin: AC at least 17). `spell.dc` and `spell.attack` are
  read when a spell is cast. `hp.max` with `add` moves the Hit Point maximum and current Hit
  Points together (Aid), and back when the effect ends, current Hit Points staying within
  the maximum; the part records `hpMax`; event `maxHp`. `higher.slot.value` adds to the first
  modifier's number per slot level above. `damage.dealt` with `add`: with `types`, an extra
  part of damage of that type; without, added to the first part; dice are doubled on a
  critical hit. Two tags for it: `attack.hit` (the damage comes from an attack roll that hit)
  and `attack.weapon` (made with a weapon). A modifier step with `to: 'caster'` puts the
  modifier on the caster, and `against: 'target'` makes it hold only against the spell's
  target (Hex, Hunter's Mark). `save.death` was wired with the `save` hook (above). `carry`
  is still unread: there is no encumbrance yet.

- **Turn boundaries** (S5). A `modifier` step may carry `ends` as a `condition` step does
  (`turnStart` or `turnEnd` of the target, or of the source with `of: 'source'`, or a repeat
  `save`). A part records the turn it was made in (`born`), and a `turnEnd` boundary of that
  same turn does not end it, which is what "until the end of your next turn" means (and "its
  next turn" for a creature affected during its own turn). When an effect's time runs out, a
  part with its own turn boundary keeps to it and the effect stays until it ends (Guiding
  Bolt: "1 round", but "before the end of your next turn"). Something with no duration of its
  own whose steps end at a turn boundary or on a save (Ray of Frost, a mephit's Blinding
  Breath) gets an effect `bound` to its parts, which ends when they do; it is announced only
  if it put something on someone. Monster actions get one too, so their timed conditions are
  timed instead of handed to the DM. A modifier with `uses: 1` is used up by the first roll it
  applies to (Guiding Bolt's Advantage, Vicious Mockery's Disadvantage).

### A class

```js
{
  id: "fighter", name: "Fighter", hitDie: 10,
  primary: ["str", "dex"], saves: ["str", "con"],
  proficiencies: { armour: ["light", "medium", "heavy", "shield"], weapons: ["simple", "martial"] },
  skills: { choose: 2, from: ["acrobatics", "athletics", "..."] },
  levels: {
    1: { grants: ["fighting-style", "second-wind", "weapon-mastery"], choices: [{ kind: "feat", category: "fighting-style" }] },
    2: { grants: ["action-surge", "tactical-mind"] },
    3: { choices: [{ kind: "subclass" }] },
    // ... to 20
  },
  spellcasting: null,
}
```

Features (`second-wind`) live in a `features` table shared by classes,
species and feats. A feature is a name, text, optional modifiers, optional
resource (`uses: 2, recover: "short"`), and optional action built from effect
steps.

## Characters

### Quick entry first

Full character creation is a long road (species, backgrounds, 12 classes, 20
levels, feats, equipment, spell lists). Your campaign should not wait for it.

**Quick entry** is a form the DM or player fills in from an existing sheet:
name, class and level (for display), ability scores, proficiency bonus, saves
proficient, Armor Class, hit point maximum, speed, attacks, spell slots,
spells known, and features as free text. It produces a sheet marked
`mode: "manual"`, whose record is taken as typed.

- It works for any character from any source at any level.
- Attacks and spells chosen from content packs resolve normally. A spell not
  in the packs can be added by name as `manual`.
- It deliberately breaks goal 4 for these characters, and says so on the
  sheet: "Numbers entered by hand".
- A manual sheet can later be converted to a built one, keeping its `state`.

### Built characters

A built sheet records choices only:

```js
{
  mode: "built", name: "Brenna",
  species: "human", background: "soldier",
  classes: [{ id: "fighter", level: 3, subclass: "champion" }],
  abilities: { method: "standard-array", base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
  choices: { /* keyed by the choice's id: skills, feats, fighting style, masteries, spells */ },
  equipment: [{ id: "chain-mail", equipped: true }, { id: "longsword", equipped: true, hand: "main" }],
  hp: { method: "average" },
  reactions: { "opportunity-attack": "always" },
}
```

`derive()` applies, in order: species, background, class levels, feats,
equipment, then modifiers. It returns the record plus a `why` map
(`ac: ["Chain Mail 16", "Shield +2"]`) that the sheet UI shows when a number
is tapped.

`validate(sheet, content)` returns the list of problems (a choice not made,
an option not allowed, two shields). A sheet with problems can be saved but
not brought into play without the DM's override.

### Levelling

`levelUp` is an action. The player proposes it with their choices; the DM
approves it (or the table setting "players level themselves" is on). The
engine validates against the class data, re-derives the record, raises
maximum hit points, and logs it. It is refused during a fight.

## Conditions, durations and concentration

### Conditions as data

The fifteen conditions **(check the list)** are entries in `conditions.js`:

```js
{ id: "restrained", name: "Restrained", visible: true,
  modifiers: [
    { on: "speed", op: "set", value: 0 },
    { on: "attack.received", op: "advantage" },
    { on: "attack.roll", op: "disadvantage" },
    { on: "save.dex", op: "disadvantage" },
  ],
  text: "..." }
```

Flags cover what modifiers cannot: `incapacitated: true` (no actions, bonus
actions or reactions), `includes: ["incapacitated", "prone"]` for conditions
that imply others, and `levels` for one that stacks. `also` holds, in plain
words, the part of a condition the engine does not apply; the DM is shown it
when the condition is put on a creature. A modifier whose `when` the engine
cannot judge is not applied.

The DM can put any condition on a creature or take it off
(`{type:"condition", actor, condition, on, level?}`). Until durations exist
(R4), nothing else ends a condition except standing up from Prone. `visible` decides whether players see it on a creature
that is not theirs; the view layer reads it instead of its current fixed list.

On a creature, `cond` changes from booleans to instances:

```js
cond: { restrained: { source: "m4", ends: { on: "save", save: "str", dc: 13, at: "turnEnd" } } }
```

`cond.prone` stays truthy for a creature that is prone, so existing checks
keep working during the migration.

A condition instance may carry a `level` for conditions that stack, such as
Exhaustion; its modifiers can scale by it (`value: { perLevel: -2 }`).

### What ends an effect

| `ends.on` | Ends when |
|---|---|
| `time` | the world clock reaches a value (one round is six seconds) |
| `turnStart` / `turnEnd` | the named creature's next turn starts or ends |
| `save` | the affected creature succeeds on a repeat save at a stated moment |
| `concentration` | the caster's concentration ends |
| `rest` | the next short or long rest |
| `manual` | the DM removes it |

As built (task R4): a spell whose `duration` is not `instant` becomes one
effect record, `{ id, name, spell, source, conc, lasts, until, parts }`.
`parts` lists exactly what it put on creatures, a condition or a modifier
each, so ending the effect takes exactly that off. In a fight `until` is a
round, and the effect ends at the start of its caster's turn in that round;
outside one it is a time on the world clock. When a fight ends, rounds left
become clock time. A `condition` step may carry its own `ends`
(`turnStart`, `turnEnd`, or a repeat `save`), and an effect whose parts
have all ended is over. `duration` is read from fixed forms: a number of
rounds, minutes, hours or days, or `until dispelled` and `special`, which
the engine records but cannot time.

Active effects live in one list in the game state, `state.effects`, each with
its source, targets, the modifiers and conditions it applies, and its ending
rule. An effect that covers an area is anchored either to hexes (a wall, a
cloud) or to a creature (an aura that moves with it); who is inside is
re-tested when anything moves. Removing the effect removes what it applied. The engine checks endings
at turn boundaries and whenever the clock moves.

### Concentration

A creature concentrates on at most one effect. It ends when the creature
casts another concentration spell, is Incapacitated or dies, or fails a
Constitution save after taking damage (DC 10 or half the damage, whichever is
higher, to a maximum of 30 **(check)**). The save is automatic and logged.
The caster's player, or the DM, can also end an effect at any time.

## State version and saved tables

The game state's `version` goes from 1 to 2. `migrate(state)` upgrades a
version 1 state in place: boolean conditions become records and ids become
kebab-case. Later tasks extend it: `state.effects` arrives with R4, and
creatures become `{ ...record, sheet, state }` with R7. The server runs it when loading a table
and solo play runs it when loading from browser storage. A test keeps a saved
version 1 table and checks it still loads and plays.

## Views

The view layer needs three changes, each small because of its allow lists:

- An Open creature's `sheet` is sent with it. A Seen creature's is not.
- Conditions shown on a Seen creature come from `visible` in the data.
- `state.effects` is sent filtered: an effect is included only if one of its
  targets is Open, or it is marked `visible` (a wall of fire is; a charm is not).

## Checking the data

`npm test` gains a content linter, with no dependencies:

- every file exports data only (no functions, no imports)
- required fields present and of the right type for each kind
- ids unique; every reference (a spell on a class list, an action in a
  multiattack, a feature on a level) resolves
- every effect step, hook, op and tag is in the closed lists
- dice strings parse; areas have a shape and size; ranges are numbers or
  known words
- `text` is present and `source` is set
- an entry marked `auto` contains no `manual` step

It prints a coverage table: entries per kind, per tier. That table is how
progress on the SRD is tracked.

A second check, for a human or a careful agent: each data pull request quotes
the SRD heading for a sample of its entries so a reviewer can compare.

## Known costs and risks

- **The vocabulary will be too small.** Expect amendments. The closed lists
  make each one a deliberate decision instead of drift.
- **`derive()` is where rule bugs will hide** (stacking AC formulas, which
  bonuses combine). It needs the densest tests in the project.
- **Manual-tier spells put work on the DM.** That is the honest state of the
  engine, and it is still less work than a tabletop with no automation.
- **Quick entry lets wrong numbers in.** They are labelled, and they are the
  player's own sheet.
- **Standing-instruction reactions are not the rules as written** for
  reactions that involve a choice. Those stay manual until stage B.
- **Migration touches every saved table.** The live server has few; the test
  with a saved version 1 table is the guard.

## Tasks

Order matters down to R4. After R4, the data tasks can run in parallel with
each other and with the engine tasks.

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| R1 (built) | Content pack layout, loader, and linter; move the existing 6 spells, 3 monsters and 4 pregens into `srd52/` in the new format | Fable | `content/**`, new linter, `scenario.js` | Linter passes; all existing tests pass unchanged apart from ids |
| R2 (built) | Effect steps: resolve `attack`, `save`, `damage`, `heal`, `condition`, `manual` from data on a resumable stack; delete the four hard-coded spell kinds. `modifier`, `move` and `resource` steps are handed to the DM until R3 and R4. Weapon attacks stay flat records until R3 and R10 | Fable | `engine.js`, new `effects.js` | The six spells play identically from data; a `manual` spell enforces its costs and shows its text |
| R3 (built) | Modifier system and the fifteen conditions as data; state version 2 and `migrate()`. Version 2 makes conditions records; the split of a creature into record, sheet and state moves to R7, where `derive()` needs it | Fable | `engine.js`, new `modifiers.js`, `view.js`, `conditions.js` | Every existing advantage and disadvantage case comes from data; saved version 1 table loads |
| R4 (built) | Durations, `state.effects`, concentration | Fable | `engine.js`, `effects.js` | An effect ends at each kind of boundary; concentration breaks on each trigger |
| R5 | Quick entry: form, manual sheets, DM adds a character to the table | any agent, reviewed | `app.js`, `index.html`, small engine action | A level 5 character typed from a paper sheet can be claimed and played |
| R6 | Standing-instruction reactions | Fable | `engine.js` | Opportunity Attack honours always / never; one spell reaction works |
| R7 | `derive()` and `validate()` for built sheets: species, backgrounds, one class to level 5 | Fable | new `derive.js` | A built Fighter 1 to 5 matches hand-checked numbers at each level |
| R8 | Character builder UI and `levelUp` | any agent, reviewed | `app.js`, `index.html` | A new player can make a level 1 Fighter on a phone |
| D1 | Spells, in batches by level | any agent | `content/srd52/spells-*.js` | Linter passes; tier set honestly; SRD headings quoted in the PR |
| D2 | Monsters, in batches by letter | any agent | `content/srd52/monsters-*.js` | as D1 |
| D3 | Equipment: weapons, armour, gear | any agent | `content/srd52/equipment.js` | as D1 |
| D4 | Remaining classes, species, backgrounds, feats | any agent | `content/srd52/*.js` | as D1; each class checked by `derive()` tests from R7 |

| R9 | Space: `z`, surfaces, movement modes, size and footprints, falling | Fable | `engine.js`, `hex.js`, `render.js`, map format | A Large creature blocks three hexes; a character climbs a tree and shoots from it; a flyer knocked Prone falls |
| R10 | Equipment states, hands, charges; attacks derived from what is held | Fable | `derive.js`, `engine.js` | An item's bonus applies only in its required state; drawing a weapon costs what the rules say |
| R11 | Forms | Fable | new `forms.js`, `engine.js` | A character becomes an SRD beast and back, with size, speed, attacks and hit points following the form's rule |
| R12 | Table rules: declaration, storage, rule points; encumbrance and spell materials as the first two | Fable for the mechanism, any agent for options | `engine.js`, content, DM panel | The DM switches encumbrance on and an overloaded character slows down with nobody entering a weight |
| T1 | Combat tracker v1 | any agent | `app.js`, `index.html`, `style.css` | The DM can run a fight from the tracker panel on a phone |
| T2 | Combat tracker v2 | any agent, after R4 | as T1 | Effects, concentration and delays are visible and editable |

D1 to D3 can start as soon as R1 is merged, because the linter defines the
format. Entries written before R2 to R4 land are simply entered at the tier
that is honest then, and promoted later.

R5 is the fastest route to your own campaign and depends only on R1. T1
depends on nothing and can start today.

Suggested order for the strongest model: R1, R2, R3, R4, then R9 (space),
because size and height change what "adjacent" and "in range" mean and are
cheaper to add before hundreds of monsters are entered than after.
