# Spec: rules expansion

Status: design agreed by the project owner, partly built (R1 to R4 are marked in the
task table; quick entry and space are in the game too; see `docs/DEBT.md` for the rest).
Owner of the design: Claude (Fable). Reviewed against the full current rules and common house
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
- The only reaction is the opportunity attack, taken automatically. (Since reactions part 1:
  a general mechanism with standing instructions, Shield, Uncanny Dodge and Deflect Attacks;
  since part 2: asking a player in the moment, Counterspell, Hellish Rebuke and monsters' Parry;
  see the Decision 4 build notes.)
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

#### Build notes: reactions, part 1 (amendment, stage A)

**What was built.** `packages/rules/src/reactions.js` holds the mechanism; the engine calls it at
two trigger points.

- *One Reaction a round.* `reactionUsed` (already in state) is spent when a reaction is taken and
  cleared at the start of the creature's own turn, as before. `canReact()` refuses a creature that
  is down, dead, has spent it, or is Incapacitated (or has a condition that includes it): SRD
  "Inactive". The sheet's Reaction pip shows it, as before.
- *What a creature can react with* (`reactionsOf`): the Opportunity Attack (any creature with a
  melee attack, built in), every known spell whose data has `reaction`, and every built feature
  whose grants include `reaction`. Considered in that order at a trigger; the first one its
  instruction lets fire and it can pay for is taken, and no more (one Reaction).
- *Standing instructions.* `e.reactions = { [reaction id]: when }`, set with
  `{ type: 'reactions', actor, set: { id: when } }` by the creature's controller or the DM, at any
  time, in or out of a fight, on or off its turn. Validated whole before anything changes. Values:
  `always`, `never`, `miss` (only for a reaction that adds to AC: only if it turns this hit into a
  miss), `ask` (Opportunity Attack only: the engine does not take it; a DM-only `manual` event says
  it could have, and the DM decides and applies it by hand). Only non-default values are stored.
  Defaults: `always` for a reaction that costs only the Reaction (Opportunity Attack, Uncanny Dodge,
  Deflect Attacks), `never` for one that spends a spell slot (Shield), so nothing is spent that
  nobody chose. Monsters keep `always` for the Opportunity Attack: no behaviour change.
- *Triggers.* `leave` (walk(): the Opportunity Attack, re-seated on the instruction) and `hit`
  (rollToHit(): after the hit is known, before the attack event and before damage). Shield's
  "targeted by Magic Missile" is the spell's `blocks` list, checked in `cast` after the cast event.
- *Resolution inside the triggering action.* No pause. A reaction spell's steps are begun on the
  effect stack above the frames already there, and `run(s, ev, kit, floor)` (new `floor`
  argument) runs only those, so the attack step that set it off carries on afterwards. Its events
  come between the triggering roll and the attack event (`reaction`, then `cast` with
  `reaction: true`, `effectStart`), and the attack event carries the Armor Class it was finally
  compared with. A damage cut is passed from the hit to the damage under it (`cut`, applied with
  the other adjustments before Resistance, SRD "Order of Application").
- *Consumers.* Shield (auto): the lowest slot it can use is spent (one slot a turn per caster, kept
  per creature off its own turn as `flags["slot:<id>"]`); +5 AC to the start of the caster's next
  turn, including against the triggering attack; while it lasts, Magic Missile does the caster no
  damage. Uncanny Dodge (auto): halves the hit's damage, rounded down, against an attacker it can
  see. Deflect Attacks (assist): cuts a hit whose damage includes Bludgeoning, Piercing or Slashing
  by 1d10 + Dexterity modifier + Monk level, rolled when it is taken; the Focus Point redirect is a
  choice in the moment and goes to the DM.

**Vocabulary added** (schema.js), the minimum for these three:

- `REACTION_TRIGGERS = ['hit']`: the triggers data may name. `leave` is the engine's own.
- A spell's `reaction: { on, blocks? }` (only with `time: 'reaction'` and a self target).
- A class feature's grant `reaction: { on, cut: 'half' | { dice, add? }, seen?, types? }`; `add`
  takes class amounts (`{ mod }`, `{ perLevel }`), which `derive()` bakes into the dice. A record's
  feature may carry the baked `reaction` (FEAT_FIELDS).
- Events: `reaction` { id, reaction, name, trigger, against?, amount? } (sent to players as anyone
  watching would see it; `amount` and its dice only for one of theirs), and `reactionsSet` (the
  DM's alone). `cast` may carry `reaction: true`.
- State version 14: `reactions` on a creature. Migration drops one that is not a record of words.

**Privacy.** An instruction is its controller's and the DM's. `playerView()` strips `reactions`
from every creature; `viewReactions(state, viewer)` gives a player those of their own creatures,
and the table server adds it to each player's view and patch beside their handouts (the one change
to `tables.js`). A Seen creature's record never had `reactionUsed` or `reactions`. Declining sends
nothing; `ask` is a DM-only `manual`; the event setting one is never sent. Tests prove each channel
(rules `reactions.test.js`, server `tables.test.js`).

**Settled.** Standing instructions are read at the trigger, never cached. A reaction that adds to
AC is considered before one that cuts damage, so with `miss` set Shield yields to Uncanny Dodge
when it would not help. A spell barred by Rage or by the one-slot-a-turn rule is passed over, not
refused. Halving rounds down on the total of the attack's damage, not part by part.

**Part 2 (stage B) needs.** Prompts: a pause point on the stack where a player answers in the
moment (Counterspell, and anything decided after a roll is seen: Dark One's Own Luck, the Deflect
Attacks redirect, Hellish Rebuke's choice to use a slot), with timeouts and what a hidden reactor
shows while the table waits. Triggers still to add then: `damaged` (taking damage from a creature
it can see: Hellish Rebuke), `cast` (seeing a spell cast: Counterspell), `fall` (Feather Fall),
and monster reactions as data (DEBT M3: Parry and the like fit the `hit` trigger with an AC
modifier). The client screen for setting instructions (below) and letting a player throw the
dice of a reaction (DEBT T6).

**Not built in part 1.** No screen sets instructions yet: the action is there and tested, and the
sheet's Reaction pip shows available or spent, but choosing "always / never / only if it misses"
waits for a sheet job.

#### Build notes: reactions, part 2 (amendment, stage B)

**How an action waits.** Not by a stack of resumable steps but by running the action again. When
an action reaches a reaction whose instruction is `ask` for a creature a player controls, the
engine throws a pause; `apply()` puts the whole state back as it was before the action (a copy
is taken first, only when some player's creature has an `ask` instruction, `mayAsk()`, or the
action is an answer), and stores `pending: { n, action, ctx, answers, ask }`. The answer,
`{ type: 'react', prompt: n, take: reactionId | null, slot? }`, runs the same action from the same
state with the answers given so far: the dice seed is part of the state, so the same dice fall,
and at each point where it asked before, the next answer is read instead of asking. An action may
ask several times; each answer adds one. So the waiting state is plain data that saves, sends,
undoes and replays exactly, no timer is in the rules package, and nothing half-done is ever kept.
The effect stack (decision 2) is unchanged and still empty whenever `apply()` returns.

**Settled.**
- *Who is asked.* Only a player, about a creature they control. For the DM's own creatures `ask`
  stays a DM-only `manual` event and nothing waits, so monster turns and the AI never stop on
  themselves, and a hidden monster's reaction can never hold the table up where players would
  notice. `ask` is now an option of every reaction. Its label is "Ask".
- *Who answers.* The reacting creature's controller or the DM (the DM's answer overrides; there is
  no other override). An answer must name the question's number, so a late answer to an earlier
  question is refused. A refused answer leaves the question waiting, unchanged. Time limits are
  the DM's (or a later server feature's): the engine has none.
- *What may happen while it waits.* Only the answer and what cannot change how the waiting action
  comes out: `say`, `note`, handouts, `askCheck`, `claim` and `release` (`WHILE_WAITING`). Setting
  an instruction, moving, ending a turn are refused. `aiStep()` returns nothing while it waits.
- *What is asked.* The player sees `{ n, reactor, trigger, options: [{ reaction, name, slots?, ac? }] }`
  and, by trigger: `hit` the attack's name, total, the Armor Class it beat and `crit`; `targeted`
  the spell (Shield's trigger names it); `leave`, `cast`, `damaged` nothing more. `by`, who set it
  off, only where the party knows of that creature. A `cast` question never says which spell: a
  creature sees a spell being cast, not what it is. At a hit with several reactions, if any says
  `ask` the player chooses among all that could be taken (a `miss` one only where it would turn the
  hit into a miss); otherwise the first is taken, as before.
- *What others are told.* Every other player gets `prompt: { waiting: true }` in their view and
  nothing else: not who, not why, not the waiting action. They get even that only when the party
  can perceive what set the question off (the triggering creature and the waiting action's actor are
  not hidden from the party); otherwise `null`, so an unseen attacker does not show itself by making
  the table wait (#154). A player who tries to act meanwhile is still refused because the table waits. The question event (`reactionAsked`) goes
  to the player asked alone, live and in the record; `reactionAnswered` is the DM's. The waiting
  step's history label is shown to no player; the answer's is the waiting action's label with
  ", after a reaction", naming nobody asked.
- *Counterspell* (trigger `cast`, new step `counter: "spell"`). Offered when a creature hostile to
  the reactor, within 60 feet and seen by it, casts a spell with V, S or M components through the
  engine's `cast` action, after the spell's costs are paid and before it takes effect. The caster
  makes a Constitution save against the counterspeller's spell save DC; on a failure the spell
  dissipates (`countered` event), the action or Bonus Action stays spent, and the slot is given
  back and does not count as the turn's one slot. The counterspeller's slot (level 3 or higher, its
  player may choose) is spent either way. Creatures are offered it in the table's order until one
  counters. Players are told a countered spell's name only if it was theirs.
- *Hellish Rebuke* (trigger `damaged`). After damage from a hostile creature it can see within 60
  feet, if still standing (and after any Concentration save), it casts at that creature: a
  Dexterity save, 2d10 Fire, half on a success, 1d10 more per slot level above 1.
- *Hostile only.* `cast` and `damaged` reactions are offered against hostile creatures only, so a
  player is not asked every time an ally casts or catches them in an area. Countering or rebuking
  an ally is the DM's.
- *Monster reactions* (DEBT M3). A pack monster's trait may carry
  `reaction: { on: 'hit', ac, attack?, manual? }`: it adds `ac` to its Armor Class against the
  attack that hit (not lastingly), only for `attack` rolls of that kind, and tells the DM `manual`
  (the rest of the reaction) when taken. Default `miss`: a Reaction that only adds to AC is taken
  when it turns the hit into a miss. "While holding a weapon" is not tracked: the engine assumes
  it, and the trait's text tells the DM to set it to `never` when the creature is disarmed. Wired:
  Parry (bandit captain, erinyes, gladiator, knight, marilith, noble, warrior veteran), Riposte
  (pirate captain; the Rapier attack is the DM's) and Whirlwind of Sand (mummy lord; the teleport
  and Blinded are the DM's).
- State version 15: `pending`, and `asked` (how many questions so far, for their numbers). The
  migration drops a `pending` that is not whole.

**Vocabulary added** (schema.js): `REACTION_TRIGGERS` gains `cast` and `damaged` (spells only; a
reaction spell set off by another creature is aimed at that one creature and has a range in
feet); the step `counter: "spell"`, only in a spell whose reaction is `cast`; a monster trait's
`reaction`. Events: `reactionAsked {id, n, to, ask}`, `reactionAnswered {id, n, take, by}` (DM),
`countered {id, spell, name, by}`; `reaction.trigger` may be `cast` or `damaged`.

**Not built in part 2.** Counterspell is offered only against spells cast through the `cast`
action: monsters' Spellcasting is the DM's by hand, and reaction spells (Shield, Counterspell
itself) are never offered to be countered. Monsters that cast Counterspell or Shield from their
stat block (Protective Magic) keep it as text. The Deflect Attacks redirect, Dark One's Own Luck,
Feather Fall (`fall`) and the Shield Guardian's and Stone Giant's reactions are still the DM's.
No client screen asks the question yet (a client job); with the default instructions nothing
asks, so play is as before.

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
  cast as a Reaction are refused as actions: one with a `reaction` trigger is cast by
  standing instruction (Decision 4 build notes), the rest go to the DM; spells that take longer than a
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

- **Lasting zones** (S4), in `zones.js`. A spell with `zone: { on, once?, atCast?, spare? }`
  leaves its area in place for its duration as `fx.zone` on its effect: the hexes it was laid
  out on (and its height), or, for an Emanation, the caster it moves with. Its own effect steps,
  scaled and with the caster's choices made, are stored with the caster's DC and attack as they
  were when cast, and run against one creature when it enters the zone (walking in, being
  pushed in, or the zone moving onto it: before and after every step of a walk or a push the
  engine compares which zones hold whom), or when its turn starts or ends there (`on`).
  `once: 'turn'` is "a creature makes this save only once per turn" (recorded by turn).
  `atCast`: it also works on everyone in it as it appears (Moonbeam); otherwise appearing is
  not entering (Web, Spirit Guardians). `spare`: the `cast` action names creatures it leaves
  alone (`spare: [ids]`; the client spares the caster's side). A walk stops where a zone goes
  off on the walker, as it does at a trap. A zone that goes off while another effect is being
  resolved (pushed in by Thunderwave) waits in `s.zoneQueue` until that effect is done, so the
  stack is never run from inside itself. Whatever a zone's steps put on a creature is a part
  of its effect and ends with it (Web's Restrained ends with the spell). Event `zone` (DM
  only); players are not sent `fx.zone`. A `damage` step may say `type: 'chosen'` with a
  `choice` of damage type (Spirit Guardians' radiant or necrotic).
  Not built: moving a zone after it is cast (Moonbeam's Magic action), a zone that changes
  something while a creature is inside it (Spirit Guardians' halved Speed; Difficult Terrain and
  obscuring came with #165, `terrain`),
  walls of free shape (Wall of Fire). The renderer draws each zone in the state it is given (a tinted patch by damage type, name on hover or tap); players are not sent zones yet.

#### Build notes: what the party's spells asked for (amendment, #165)

Settled while adding the general vocabulary the party-spells table in `docs/DEBT.md` asks for
(issue #165). Each part has a linter rule and tests through `apply()` in
`packages/rules/test/spell-vocab.test.js`.

- **`teleport` step.** `{ teleport: feet, see?: true, blocked?: [steps] }`, only in the own list of
  steps of a spell aimed at its caster (the linter says so). The `cast` action names the
  destination in `hex`, the field an area spell is aimed with (`hex.z` asks for a height, as `move`'s
  `to` does; otherwise the surface in that column nearest the caster). It is checked before anything
  is spent (`teleportSpot`): within `feet` of where the caster stands (height counted by the table
  rule), not the hex it is on, ground or air its whole body fits in, inside the arena while it is in
  a fight, a space it can see when `see` is set (sight.js, `canSee` on a stand-in of its size at that
  place), and not a space taken by a creature it knows of. A player may name only a place the party
  has been shown (not in an unrevealed region), and is told no more than that about any other. The
  SRD Teleportation rules: no movement is spent, nothing provokes an Opportunity Attack, the creature
  arrives as one `moved` event with a one-hex `path` and `teleport: true` (the view filters it as any
  `moved`: under the line-of-sight rules a player is sent it only where the place is in view). If a
  creature it could not know of stands there, it appears in the nearest unoccupied space instead
  (the SRD lets it choose; the engine takes the first it finds on the nearest ring), unless the step
  has `blocked`, whose steps then run on it and it stays (Dimension Door's 4d6 Force). Landing in a
  zone sets the zone off as walking in does; a thing on the floor that goes off when stepped on is
  told to the DM instead (it is not run from inside a spell). Landing in the air: it falls, by the
  engine's gravity after the action. Landing in the arena from outside a fight joins it. A cast with
  no `hex` spends what the spell costs and hands the move to the DM (a `manual` event), so a client
  that does not yet aim teleports still casts the spell. `spellProfile()` gives
  `teleport: { feet, see }` so a client can arm a hex pick. A destination off the map, passengers and
  "a place you can describe" stay with the DM. Not run: a teleport aimed at another creature.
- **`cure` step.** `{ cure: [conditions] }` ends those conditions on the creature it works on
  (Heal: Blinded, Deafened, Poisoned), or `{ cure: ["chosen"] }` with the spell's
  `choice: { of: 'condition', from: [...] }` (Lesser Restoration's one of four; `condition` is a new
  kind of choice, made in the `cast` action's `choice` as the others are, and the client's choice
  menu shows it with nothing new). A condition it does not have is passed over; one a lasting effect
  holds ends with that effect's part, and an effect with nothing left ends (Hold Person). Exhaustion
  is not ended this way (a spell lowers it by levels). This is the spell-step twin of the class
  features' `cure` (Lay On Hands' pool), which stays a pool option.
- **A save scoped to a condition.** A modifier on `save` (or `save.<ability>`) may say
  `scope: { condition }`: it applies to a saving throw made to avoid or end that condition
  (Protection from Poison's Advantage against Poisoned). A save step is about the conditions in its
  `onFail`; a repeat save of a condition's `ends` is about that condition; a Countercharm reroll
  is about the conditions it rerolls against. `savingThrow()` takes them as `about`.
- **A rider on a kill.** A `damage` step may have `onZero` (steps run on its target when this
  damage took it from above 0 Hit Points to 0) and `onKill` (when it was alive and this damage
  killed it, by the engine's rules: a monster at 0, a character by massive damage or death saves).
  Damage steps that land together share them; a successful save's half damage counts (the branch
  runs at full, not halved). Two steps that only make sense there (the linter keeps them under these
  branches): `kill: true` (it dies outright, a character at 0 Hit Points too: Disintegrate) and
  `remains: 'frozen-statue' | 'dust'` (what is left of the body, `creature.remains`, event
  `remains`; players see it on a creature they know of, in the seen record and the event). Cone of
  Cold's statue and Disintegrate's dust. The DM's `setHp` raising a dead creature clears `remains`.
  Who can revive dust (True Resurrection, Wish) is not enforced: the engine has no revival step.
  `remains` is a new optional field on a creature; old saves lack it and need no migration, so the
  state version stays 17.
- **Terrain and obscuring on an area** (`terrain.js`). A spell may say
  `terrain: { difficult?: true, obscured?: 'heavy' | 'light', lasts? }`: while its lasting effect
  runs, its area (laid out as for its steps, one shape that stays where it was laid out: not an
  Emanation, not `count` or `choose`) is Difficult Terrain and/or Heavily or Lightly Obscured. It is
  `fx.terrain` on the effect: `{ area, hexes, origin, difficult?, obscured? }`, with the height of a
  cylinder, cube or sphere judged from where it went off, as a zone's is. An instant spell says how
  long with `lasts: 'nextTurnEnd'` and gets an effect of its own that ends at the end of the caster's
  next turn (Ice Storm's hail; a part `{ target: caster, ends: { on: 'turnEnd', of: 'source' } }`
  that holds nothing). **Movement:** a walking step onto such ground costs double (`moveOptions`;
  Difficult Terrain does not stack with a crowd or a step up); a flyer is not on the ground.
  **Sight:** by the SRD, a creature trying to see something in a Heavily Obscured space is Blinded
  for it: `sees()` says `{ see: 'no', why: 'obscured' }` when every part of the target is in one, and
  'dim' (Lightly Obscured) for a light one, whatever the light. Blindsight sees in it; Truesight
  does not. Only the target's space counts (the SRD's wording), so a creature in the fog sees out.
  That feeds everything sight feeds: attack rolls (Unseen Attackers and Targets), Hide (a creature
  in the fog may Hide), Opportunity Attacks, a teleport's "a space you can see", and, under the
  `light` sight rule, which creatures players are sent (the vision cache is keyed on the effects that
  obscure). Under the `los` rule players' view of creatures is line of sight only, as it is for
  darkness. What a player is shown of the map tiles in fog is unchanged (the client is not sent
  `fx.terrain` and has nothing to draw it with yet). Ice Storm, Grease, Sleet Storm, Fog Cloud, Web,
  Entangle.
- **`endConcentration` step.** `{ endConcentration: true }`: the creature it works on loses
  Concentration on whatever it holds (Sleet Storm's failed save).
- **Ending on damage, and "fighting it".** An `ends: { on: 'damaged' }` may say `by: 'source'`:
  only damage from the effect's source or a creature on its side ends it ("until you or your allies
  damage it": Charm Person, Charm Monster). Damage from no creature (a trap, the DM's `harm`) does
  not. `ends: { on: 'save', save, at: 'damaged' }` repeats the save whenever the creature takes
  damage, the part ending on a success ("ending the spell on itself": the Dominate spells); the save
  event says `against`. A save step may say `advantageIf: [tags]`, Advantage when every tag holds,
  with a new tag `target.fought`: a fight is on, the target is in it, and it is hostile to the
  source. That is how the engine reads the SRD's undefined "if you or your allies are fighting it";
  a DM who reads it otherwise overrides by hand. Not built: a creature's attitude (Friendly), the
  Dominate spells' commands, and their longer Concentration from a higher slot.

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

#### Build notes: classes as data (amendment, R7)

Settled when the twelve classes were entered (`content/srd52/classes/`, one file each; linted by
`lintClass` in `schema.js`; equipment in `content/srd52/equipment.js`, `lintWeapon`, `lintArmour`):

- **A class** is `{ id, name, hitDie, primary, saves, armour, weapons, tools?, skills: { choose, from },
  table, casting, features, subclass }`. `table` holds the class table's own columns as 20 entries
  each (`rages`, `sneak-attack`, `channel-divinity`; `null` before a column starts). `casting` is
  `null` or `{ ability, kind: 'prepared' | 'pact', cantrips, prepared, slots }` (20 rows; a pact
  caster's `slots` is a count per level with `slotLevel`). The Proficiency Bonus is the same for
  every class and is worked out (2 + (level - 1) / 4, rounded down), not repeated per class.
  `weapons` uses four words: `simple`, `martial`, `martial-light` (Monk), `martial-finesse-or-light` (Rogue).
- **A feature** is `{ id, name, level, text, tier, checked, uses?, grants?, options? }`. Features
  shared by several levels of a class (Ability Score Improvement) are entered once per level.
  `uses` is the feature's own resource: `{ max, recharge: 'short' | 'long' | { level: rest }, short? }`,
  where `short` is how many come back on a Short Rest when the rest come back on a Long Rest.
  `options` are choices made on the sheet (`choices[feature id]`), each with its own tier and grants.
- **An amount** that grows with the class is a number, `{ column }` (the class table),
  `{ mod, min }` (an ability modifier, at least `min`) or `{ perLevel }` (times the class level). A
  modifier's `value` may be one of these in class content; `derive()` puts the number in. A heal
  step may say `addLevel: true` (Second Wind's 1d10 + Fighter level), also baked by `derive()`.
- **Amendment (levels 5 and 6, classes-5).** Three more things a class feature's steps may say,
  all baked by `derive()` into plain dice and numbers, so the effect runner sees nothing new but
  one key:
  - a heal or tempHp step's dice may be an amount, `{ column }` (Wholeness of Body rolls the
    Martial Arts die), and `addMod` may name an ability (`addMod: "wis"`) where a spell's
    `addMod: true` means the spellcasting modifier;
  - a save step's `dc` may name an ability: the class's own DC, 8 + Proficiency Bonus + that
    modifier (Stunning Strike's Focus save DC, `dc: "wis"`). In any other content `dc` is a whole
    number, as before, and the linter now says so;
  - a heal step may say `atLeast: n`, the fewest Hit Points it restores ("minimum of 1 Hit Point
    regained"). This one is read by the effect runner (`effects.js`).
  No new step, hook, op, tag or grant was added.
- **Amendment (levels 7 to 15, #154: Paladin, Cleric, Druid, Sorcerer, Bard).** The vocabulary
  grew by these general parts, each with a linter rule and a test (`test/classes-*.test.js`):
  - *Amounts*: `{ byLevel: { level: value } }` (the value for the highest class level reached; dice
    allowed where dice are: Divine Strike 1d8/2d8) and `{ mod, min, die }` (so many of that die as
    the modifier: Sear Undead). A heal, tempHp **or damage** step may roll a class amount and
    `addMod`; `bake` now works inside `onHit`/`onFail`/... branches. A creature target's `count`
    may be an amount (Abjure Foes: Charisma modifier).
  - *Grants*: `aura { range, modifiers?, immune? }` (an Emanation from the holder giving it and
    its allies there modifiers and condition Immunity, off while the holder is Incapacitated or
    down, blocked by total cover; of auras from one feature id, the best: `modifiers.js`, `aurasOn`;
    a condition an aura makes a creature immune to has no effect on it while there);
    `cure { of, conditions }` (more conditions another feature's pool removes: Restoring Touch);
    `freeCast { list, maxLevel } | { spells }` (with uses: cast through the feature, `cast` with
    `via`, no slot, as its action: Divine Intervention); `conditionImmune` (Nature's Ward);
    `metamagic { id, cost, pool }` and `metamagicMax { n, while }` (Metamagic; `cast` takes
    `metamagic`, `careful`, `heightened`, `transmute`); `exchange { costs, minLevel }` (Font of
    Magic: the `feature` action with `make` or `spend`); `restore { of, max }` (Sorcerous
    Restoration: `shortRest` with `restore: [ids]`).
  - *Feature actions*: `modes` (one of several step lists, chosen with `mode`: Divine Spark);
    `form { types, maxCr, fly, hours, tempHp }` (Wild Shape; Decision 7 built as `forms.js`, below);
    `orCost { resource, n, with? }` (paid from another pool when the feature's uses are gone:
    Dragon Wings, Innate Sorcery with Sorcery Incarnate); `cure { conditions, cost }` on a pool
    (Lay On Hands' Poisoned; `feature` takes `cure: [conditions]`, `amount` may then be 0).
    Damage an area feature deals is rolled once for everyone in it.
  - *Steps*: `with: feature id` keeps a step only for a character with that feature (Sear Undead's
    damage in Turn Undead); `ends.on: 'damaged'` (a condition or modifier ends when its creature
    takes damage: Turn Undead, Abjure Foes). An area target may say `types` (creature types it
    affects: Turn Undead's Undead; a monster's type, a character is Humanoid).
  - *Modifiers*: hooks `speed.fly` (a Fly Speed for a while: Dragon Wings) and `d20` (every D20
    Test, for `onFail` only); tag `spell.cantrip`; `once: 'turn'` on `damage.dealt` (once on each of
    the creature's own turns); a `damage.dealt` add with several `types` deals the one the target
    takes most from (the player's choice, made as a player would); `onFail: true` with an optional
    `cost` (a die added to a failed attack roll or effect save where it could turn it: Bardic
    Inspiration, Peerless Skill, whose use is spent only on a success).
  - *Reactions*: a feature reaction `{ on: 'saveFailed', conditions, range }` (Countercharm), taken
    by instruction only (`always` or `never`).
  - *Options*: a feature with `pick: n` takes a list of up to n option ids (Metamagic); it may be
    left unchosen, and options picked in two such features may not repeat.
  - *Forms* (`forms.js`, Decision 7, first build): a form lays a pack monster's stat block over a
    creature: size, AC, speeds, senses, Strength, Dexterity and Constitution, attacks (none) and
    actions (the block's), Vulnerabilities and initiative; Resistances, damage and condition Immunities are its own together with the block's (class features are kept: Nature's Ward, #169); save and skill bonuses are the better of its
    own (its proficiencies and Proficiency Bonus with the new scores) and the block's. Hit Points,
    mental scores, features and proficiencies stay. What was replaced is kept on `e.form` and put
    back when the lasting effect holding it ends (its hours, a new form, the Bonus Action with no
    form, Incapacitated or 0 Hit Points). No spells in a form; no sheet change while in one.
    Event `form { id, form, name }` (players: where the creature is known); a creature not of the party in a
    form is seen only as the Beast (amended, #169: `seenRecord` sends the Beast's name and `tpl`,
    kind `npc`, no `look` and no `form`; history labels name it the same way, `seenName`). **State version 17**: the migration keeps a whole form, puts back one
    whose effect is gone, and drops a broken one.
- **Amendment (review fixes, #169).** Found by the independent review (#166) and fixed each with a test
  (`test/class-review.test.js`):
  - A spell may say `costly: true`: its Material component has a cost given in the spell or is consumed
    by it (57 SRD spells, each compared with the SRD's Components line). Subtle Spell leaves such a
    component, so the spell can still be seen being cast and Counterspelled.
  - Careful Spell protects other creatures, never the caster. Malformed `metamagic` is a refusal. A
    feature that casts (`freeCast`, Divine Intervention) is refused through `feature` and keeps its use.
    `shortRest` refuses a creature named twice in `restore`.
  - An aura's `range` may be `{ byLevel }` (feet): the Paladin's three auras are 10 feet, 30 from level
    18, so Aura Expansion is `auto` and grants nothing itself (the linter allows that for a feature at
    a level where an aura's range grows). Range is measured from the edge of the holder's space, as an
    Emanation extends from a creature (a Large paladin reaches further from its origin hex).
  - A feature action with a `duration` whose steps hand over a `modifier` with `uses` (a die to spend:
    Bardic Inspiration) is refused for a creature that still holds one from the same feature, from any
    giver ("only one Bardic Inspiration die at a time").
  - Checked against the SRD and pinned, no change: Aura of Protection adds to Death Saving Throws and
    Concentration saves (both are saving throws); Twinned Spell's effective level only changes the
    target count, as no spell in the pack that it can twin scales anything else by slot.
- **Amendment (multiclassing, #175). State version 18.** Built to the SRD 5.2.1 "Multiclassing" rules and each
  class's "As a Multiclass Character" (`test/multiclass.test.js`):
  - *Data*: each class has `multiclass { requires: { all | any: [abilities] }, armour, weapons, skills?, tools?,
    caster: full | half | pact | null }` (linted; left out, a class cannot be combined). The Multiclass Spellcaster
    table is pack data (`srd52/multiclass.js`, `CONTENT.multiclass`).
  - *Sheet*: `classes: [{ class, level, subclass?, spells? }]`, the first class taken first, in place of `class`,
    `level`, `subclass` and `spells`. A sheet with one class is unchanged, and so is what `derive` makes of it
    (checked for every class at every level).
  - *Derive*: total level for the Proficiency Bonus, cantrip scaling and Hit Dice; each feature's numbers, uses and
    recharge by its own class's level; saving throws and full training from the first class, a later class's
    `multiclass` training and skill pick; Hit Points as the first class's level 1 and each class's fixed value after;
    Extra Attack and Armor Class formulas do not stack (the best is taken). A later class's feature whose id an
    earlier class has is renamed `<class>-<id>` with the references inside its own class (cost, `with`, pools), so
    Channel Divinity from Cleric and Paladin are two pools (the SRD says nothing to join them). Spellcasting: each
    class prepares its own spells by its own level and spell-level limit; slots from the class's own table when one
    class casts, else the Multiclass Spellcaster table by full levels plus half levels rounded up. Each spell is cast
    with its class's ability (`spellAbil`); one prepared by two classes uses the better. The record gains `classes`,
    `hitDice` and `spellAbil`.
  - *Engine*: `spellStats(e, s, spell)`; `hdBy` with `shortRest` spending the largest dice first; `levelUp` takes one
    more level in a class or level 1 in a new class at the end; `validate` checks prerequisites (13 in each class's
    primary ability, `any` for the Fighter). Migration to 18 gives a creature with `hitDice` an `hdBy` that agrees
    with `hd`; nothing else changes for saved tables.
  - *Not built*: Pact Magic beside Spellcasting (refused by `validate`); Potent Spellcasting still adds to any cantrip;
    a feature's own save DC and spell attack (not a spell's) still use `castAbil`.
- **Amendment (feats, #189).** Built to the SRD 5.2.1 "Feats" chapter (`test/feats.test.js`). No state change.
  - *Data*: a new kind, `feats` (`srd52/feats.js`, `lintFeatDef`): `{ id, name, category: origin | general |
    fighting-style | epic-boon, prerequisite?: { level?, abilities?: { any, min }, feature?: fighting-style |
    spellcasting }, repeatable?: true | "list", tier, checked, source, text, increase?: { from, points, max },
    proficiencies?: { n }, spellPick?: { lists, abilities, cantrips, level1 }, grants? }`. `grants` is the class
    features' vocabulary. All 17 SRD feats are entered: 6 auto, 8 assist, 3 manual.
  - *Where a feat is taken*: a class feature may say `feat: "any"` (every Ability Score Improvement and Epic Boon
    feature, now `auto`: the engine applies the feat taken there at that feat's tier); the sheet has two Origin
    places, `background` and `species` (the Human's Versatile; species are not entered, so the DM checks the
    species). A Fighting Style feature's options name their feat (`feat: id`, with the feat's name and tier, no
    grants of their own: they grant the feat's), so `choices["fighting-style"]` is unchanged.
  - *Sheet*: `feats: [{ id, at, abilities?, skills?, tools?, list?, ability?, spells? }]`. The sheet's `abilities`
    are its scores before the feats it lists (1 to 20, as before); each feat's points are added in the order of the
    places, none above the feat's maximum (20, or 30 for an Epic Boon); then class features (Primal Champion).
    A choice left out adds nothing, so a sheet that lists no feats, or an imported one, plays exactly as before.
  - *Validate*: the place exists and is used once; an Origin place takes an Origin feat; prerequisites (level: the
    feature's class level for one class, the character's level with several, since the order of levels is not
    kept; abilities: the scores before this feat; feature: a feature of that id or `<class>-<id>`); a feat only once
    unless `repeatable` (`"list"`: again only with another spell list); a Fighting Style feat not already the
    character's Fighting Style; each choice of the right kind and number. `featChoices(sheet)` lists each place, the
    feat taken, the feats it could take now and what is left to choose.
  - *Derive*: each feat becomes a record feature `feat-<id>` (`-2` for a second); Skilled's skills and tools join the
    record's; Magic Initiate's spells join `spells` with their ability in `spellAbil` (a non-caster's `castAbil` is
    the feat's), and its level 1 spell is a `freeCast { spells }` with one use a Long Rest.
  - *Vocabulary*: the amount `{ prof: n }` (n times the Proficiency Bonus: Alert). `freeCast { spells }` casts at the
    spell's own level and casting time, with no slot (it was the Magic action; `freeCast { list, maxLevel }`, Divine
    Intervention, still is).
  - *Not built*: Savage Attacker, Great Weapon Fighting and Two-Weapon Fighting (dice the engine rolls once), Alert's
    Initiative swap, Grappler's grapple parts (grappling is not built), and each Epic Boon's benefit but the score
    and Truesight: the DM applies them. Magic Initiate's spell swap on gaining a level is a sheet edit.
- **Amendment (magic items, #189). State version 20.** Decision 6 built in part, to the SRD 5.2.1 "Magic Items" rules
  (Attunement, Wearing and Wielding Items, Multiple Items of the Same Kind, Attunement Prerequisites;
  `test/items.test.js`).
  - *Data*: a new kind, `items` (`srd52/magic-items.js`, `lintItem`): `{ id, name, category, rarity, attune?: true |
    { by: [classes] } | { spellcaster: true }, wear, base?: { weapon: [ids] | "any" | "melee" } | { armour: [ids] |
    "any" }, bonus?, damageType?, properties?, trained?, grants?, variant?: damageType | spell, charges?: { max,
    regain? }, activate?: [{ name?, time, cost?, consumed?, spell?, level?, dc?, effects? }], tier, checked, source,
    text }`. `wear` is where its magic works (`carried`: on the person). 75 items: 36 auto, 15 assist, 24 manual.
  - *Grants*, general: `setAbility` (a score becomes this unless already as high; of two, the higher), `bareAc` (with no
    armour and no Shield), `senseRange` (a sense gained or lengthened), and `speeds` may give feet (`{ swim: 40 }`).
    A modifier's damage type `"chosen"` is the item's `type`.
  - *Sheet*: `items: [{ id, item, base?, type?, spell?, equipped?, attuned?, charges? }]` and `attuning: { item, end? }`.
    The sheet is the place: a built character holds items; one typed in by hand gets a pack item's name in `gear`.
    *States*: Decision 6's `carried`, `equipped` and `attuned` are built; `active` (switched on) is not: that is the
    later use action (table-ui E18), for which `activate` and `charges` are the data.
  - *Derive*: an item works while worn (`equipped`, or `wear: carried`) and attuned if it needs it; without the
    Attunement it needs it gives only its mundane item (a magic weapon its plain attack, armour its plain AC). Magic
    armour or a Shield worn is the armour or Shield; a magic weapon held adds an attack `item-<id>` with its bonus,
    damage type and properties. An active item with grants is a record feature `item-<id>`; its flat Armor Class
    bonuses are put in `ac` (with the reason in `why.ac`), its other modifiers read by modifiers.js. Scores: as typed,
    then feats, then bonuses (`abilityBonus`, never lowering a higher score), then `setAbility`.
  - *Validate*: what it is made from, its variant, charges; one each of footwear, gloves, bracers, armour (with the
    sheet's own), headwear, cloak and Shield (with the sheet's own); three Ioun Stones orbiting; armour, Shield and
    weapon training as for mundane gear (Elven Chain counts as trained); at most three attuned, one copy of an item,
    and its prerequisite (a class, or a spellcaster by its own features).
  - *Actions*: `equip { actor, item, on? }` and `attune { actor, item | null, end? }`, by the controller or the DM,
    outside a fight. Attuning and ending Attunement take a Short Rest focused on the item (SRD): `attune` records the
    choice, and the next `shortRest` the character takes makes it, or fails it with the reason (event `attuned`, with
    `failed`). `give` takes a pack item id (with `base`, `damageType`, `spell`) and takes one back by its key; a loot
    line may name `item` (with `base`, `type`, `spell`) and lands as that item on a built character, as a name
    otherwise. Gear handed over in play is kept when a character is made again from a sheet whose gear list is unchanged.
  - *View*: the party's sheets are open to the party as before, so a player sees their own items and the party's;
    `equip`, `attuning`, `attuned` and `gear` events only for open creatures; nothing about a foe's items.
  - *Migration to 20*: nothing to convert (a sheet without items plays as before); an `attuning` that names no item is
    dropped.
  - *Not built*: using an item (potions, scrolls, wands, charges spent: E18); Attunement ending on death, distance or
    another's Attunement; curses; identifying (an item is always known); encumbrance; drawing a weapon in a fight;
    Sun Blade's proficiency through Shortswords for a class trained only with Light martial weapons; a Luckstone's +1 on
    Initiative (the engine's Initiative reads its own hook, not ability checks).
- **Amendment (levels 7 to 15, #224: Barbarian, Fighter, Monk, Rogue). No state version change**, decided after review:
  what is new in a saved game is optional and read only by the new code (`uses["relentless-rage"]`, a lasting effect's
  `option`, a part's `except`, `fragile: 'unconscious'`), so a version 20 table loads and plays as it did; its
  characters keep the records they were saved with until the DM makes them again from their sheets (`setSheet`,
  `levelUp`), as with #164 (test: `classes-barbarian.test.js`, a version 20 table saved before #224). Each part has a linter rule
  (`lintGrants`, and `lintFeat` for the record) and a test (`test/classes-barbarian.test.js`, `-fighter`, `-monk`, `-rogue`).
  - *Grants*: `moveWith { of }` (starting that feature's effect in a fight adds half the Speed to the turn's movement:
    Instinctive Pounce); `brutal { after?, dice?, options }` (the `attack` action's `brutal: option id`: on its own turn,
    after `after` that turn, once a turn, a Strength attack with no Disadvantage gives up Advantage; a hit deals `dice`
    more of its type and runs the option's steps on the target; `unique` keeps only the most recent on a target;
    a later feature adds options); `relentless { while, dc, step, hp }` (at 0 Hit Points without dying outright while
    `while` has its effect going, a Constitution save against `dc` plus `step` per use since the last rest, counted in
    `uses[feature id]` and cleared by either rest: Relentless Rage); `initiative { regain, upTo?, heal?, addLevel?,
    unless? }` (on rolling Initiative, run after the action in `watch`: uses of `regain` back, all or up to `upTo`,
    Hit Points with `heal`; with uses of its own only when it gives something back; Persistent Rage, Uncanny
    Metabolism, Perfect Focus); `persist { of, endsOn: 'unconscious' }` (that feature's effect needs no extending and
    ends early only on that condition: `fragile: 'unconscious'`); `reroll { cost, add? }` (a failed save rolled again
    for a use of `cost`, adding `add`, the new roll standing, where it could succeed: Indomitable, Disciplined
    Survivor); `missed { modifier, ends }` (after a missed attack roll, that modifier against that target: Studied
    Attacks); `evasion: true`; `surfaces: true` (no armour or Shield: walls as with a Climb Speed equal to Speed, and
    water crossed but not stopped on, as the engine has no swimming; vertical surfaces are the DM's: Acrobatic Movement); `selfCure { conditions }` (at the end of each of its turns
    one of these it has ends: the one named in `endTurn`'s `cure`, the only one, or with several and no pick a
    `manual` event for the DM: Self-Restoration); `allTypes { of }` (that feature's reaction loses its damage types:
    Deflect Energy); `fleet { of }` (that feature without a Bonus Action after a different Bonus Action, once a turn:
    Fleet Step); `cunning { max?, options? }` (the `attack` action's `cunning: [option ids]`: Sneak Attack dice given up
    before the roll, effects after the damage; an option is `{ id, name, cost, effects?, duration?, needs?, size?,
    keepHidden? }`; Cunning Strike, Improved Cunning Strike, Devious Strikes, Supreme Sneak); `attune: n` (magic items
    it may be attuned to: Use Magic Device; `attuneMax(sheet)` in derive.js). A feature reaction may be `{ on:
    'damaged', attack: 'melee', within }` (Retaliation: one melee attack, its first, against a hostile creature within
    `within` feet that damaged it; instruction always, never or ask).
  - *Feature actions*: `acts: [dash | disengage | dodge]` (the action also takes these: Patient Defense and Step of the
    Wind with a Focus Point; refused outside a fight when nothing else would happen). A feature action's save with
    its own `dc` is the DC of a save that ends what it did (Intimidating Presence).
  - *Modifiers*: hook `opportunity` (`autoFail`: no Opportunity Attacks: Staggering Blow); op `floor` on `check` (a
    d20 under it counts as it: Reliable Talent) with tag `check.proficient`; `except: 'source'` on `attack.received`
    (not for the source's own rolls) and `stack: false` (of several of one name, one applies and is used up: Sundering
    Blow). `attack.received` adds now count toward the roll (no content used one before). An ending may say
    `orDamaged: true` beside a save (Knock Out).
  - *Choices made in advance*: a feature with `initiative` and uses, or with `reroll`, is listed by `reactionsOf` with
    `kind: 'free'` (it does not spend the Reaction) and options `never` (the default, as for a reaction that spends a
    slot: Shield) / `always`, set with the `reactions` action. No trigger looks at them; they are read where they apply.
    Retaliation costs only the Reaction and defaults to `always`, as the Opportunity Attack and Uncanny Dodge do.
  - Cunning Strike leaves at least one Sneak Attack die ("when you deal Sneak Attack damage"). Rage of any kind ends
    when its creature's sheet or record puts it in Heavy armour (`donned`, sheets.js). Reliable Talent's check event
    keeps the real d20 face, with `floor: { name, value, was }`.
  - *Built below level 7 because a feature here needs it*: Uncanny Metabolism (Monk 2), the Focus Point versions of
    Patient Defense and Step of the Wind (Monk 2), Cunning Strike (Rogue 5).
  - *Not built*: Weapon Mastery (so Tactical Master), Heroic Inspiration (so Heroic Warrior), jumping, carrying a
    creature, moves "straight toward" or "immediately after" (Forceful Blow, Withdraw, Fleet Step's timing), food and
    drink, using magic items (Use Magic Device's charges and scrolls): each is a `manual` step or the DM's by the text.
- **Amendment (levels 7 to 15, #232: Ranger, Warlock, Wizard). No state version change**, for the reason given for #224:
  what is new in a saved game is optional and read only by new code (`uses["overchannel"]`, a part's `ends.who`, a source's
  `sure`, `max`, `maxTemp`, `empower` and `spell`, encounter flags `hit:`, `after:`, `prey:`), so a version 20 table loads and
  plays; its characters keep their old records until made again from their sheets (test: `classes-warlock.test.js`, a version
  20 table saved before #232). A saved warlock sheet of level 10 or more must then choose Fiendish Resilience and Mystic
  Arcanum, which are new choices. Each part has a linter rule and a test (`test/classes-ranger.test.js`, `-warlock`, `-wizard`).
  - *Grants*: `empowered { school, list, ability }` (Empowered Evocation: `cast` takes `empower`, false or which damage roll;
    with one roll it is added unless false, with several the DM is told unless one is named; a roll shared by an area gets it
    once); `overchannel { list, maxSlot, die }` (`cast` with `overchannel: true`: a damaging spell of that list with a slot of
    1 to `maxSlot` deals its dice at their highest, faces marked `max`; from the second use since a Long Rest, counted in
    `uses[feature id]` and cleared by a Long Rest, `slot × (uses + 1)` of `die` in Necrotic damage to the caster, ignoring
    Resistance and Immunity: `damage(..., { pierce })`); `afterHit { modifier }` (an attacker that hits it gets that
    `attack.roll` modifier against it until the end of the current turn: Multiattack Defense); `markSpread { spell, range }`
    (`attack` with `prey`: once a turn, when the attack damages a creature `spell` marks, the mark's damage to another seen
    creature within `range` of it: Superior Hunter's Prey); `steadfast { spell }` (damage makes no Concentration save for
    that spell: Relentless Hunter); `restExhaustion: 'short'` (a Short Rest lowers Exhaustion by 1: Tireless); `spellRange
    { spell, perLevel }` (that spell's range longer by so much per class level: Eldritch Spear); `repel { spell, feet }`
    (`cast` with `repel`: each Large or smaller creature the spell's attack hits is pushed that far away, up to `feet`:
    Repelling Blast). A feature reaction may be `{ on: 'damaged', resist: true }` (Superior Hunter's Defense: Resistance to
    the damage's type, this instance and the rest of the turn; several types at once go to the DM and spend nothing;
    always, never or ask).
  - *freeCast* of named spells may say `atWill` (no uses: the invocations that cast a spell without a slot), `self` (on
    its caster only), `dark` (only in Dim Light or Darkness: One with Shadows), `sureSave` (the caster succeeds on the
    spell's saves without rolling, `save` event `sure: true`: Contact Patron), `maxTemp` (Temporary Hit Point dice at their
    highest: Fiendish Vigor) and `time: 'action'` (cast as a Magic action whatever its casting time: Pact of the Chain).
  - *Feature actions*: `after: 'hit'` (used on a creature its creature hit with an attack roll this turn, once a turn; the
    hit sets the flag in `rollToHit`) and `orSlot: true` (with its uses spent, `feature` with `slot` spends a Pact Magic slot
    of that level instead: Hurl Through Hell).
  - *Options*: a feature's `pick` may be `{ column }` (Eldritch Invocations by the Invocations column; `pickFor(f, c, level)`
    in derive.js); an option may have `requires { level?, option?, spell? }` (a class level, another option of the same
    feature chosen with it, a spell the class knows: invocation prerequisites, checked by `validate`) and `uses` (Gift of the
    Depths' Water Breathing, each Mystic Arcanum spell).
  - *Modifiers*: `spell: id` on `damage.dealt` (only that spell's damage: Agonizing Blast; a spell's source carries its id to
    `dealt` as `spellId`); tags `attack.opportunity` (Escape the Horde; `rollToHit` passes it) and `target.notFiend` (Hurl
    Through Hell). A `tempHp` step may say `atLeast` (Tireless). A `move` step may say `largest: size` (Repelling Blast; added
    by the engine, not by content). A part's ending may say `who` (the creature whose turn it ends with: "the current turn").
  - *Built below level 7 because a feature here needs it*: Favored Enemy's free Hunter's Mark (Ranger 1: three features turn
    on the mark), Eldritch Invocations (Warlock 1: the invocations gained at 7 to 15 are what it gives).
  - *Not built*: the pact weapon and the invocations that need it, Devil's Sight, Pact of the Tome, familiars, a second copy
    of a repeatable invocation for the same cantrip or of Lessons of the First Ones (DEBT C16).
  - *Review fixes (#234)*: Superior Hunter's Defense answers only damage of a damage type, and not the DM setting Hit
    Points (`raw`); outside a fight there is no turn, so it resists only the damage that set it off (no lasting part), and its
    Reaction stays spent until the creature's next turn in a fight, as any Reaction taken outside one. Empowered Evocation is
    not added unasked when the roll also catches a creature not hostile to the caster (the caster included): the DM is told,
    and `empower` adds it; nor for an Evocation spell whose damage the engine does not roll as it is cast (a zone's later
    damage, a manual spell's dice): the DM is told. A sheet change made by an item (`give`, `equip`, `attune`, attuning at a
    rest) is refused only for a problem the sheet did not already have (`newProblems`, sheets.js), so a warlock saved before
    #232 without its new choices still takes items; `setSheet` and `levelUp` ask for them. Players' views leave out a part's
    `ends.who` and a fight's flags that name a creature hidden from the party; a reaction question carries `dtype`. True
    Strike's Agonizing and Repelling Blast are entered, `manual` (the engine does not resolve True Strike). The build
    screen reads `pick` through `pickFor`.
- **What `grants` can say** is a closed list (`GRANTS`): `modifiers`; `action` (a Bonus Action,
  action or free use with a target and effect steps, a `duration` for a lasting one, a `cost` in
  another feature's uses, `gain` of an extra action or attacks, a healing `pool`, `renew` and
  `noSpells` for Rage, `firstAttack` for Reckless Attack); and numbers `derive()` folds into the
  record: `ac` (an Unarmored Defense formula), `armouredAc`, `rangedAttack`, `speed`, `speeds`,
  `senses`, `saves`, `extraAttack`, `sneak`, `martialArts`, `hp`, `bonusActs`, `expertise`,
  `skills`, `abilityBonus`, `cantrips`, `proficiency`, `recover` (Arcane Recovery),
  `resist`, `critOn`, `spellLists`, `spells` (always prepared).
- A feature at tier `manual` may still grant an action whose only steps are `manual`: the engine
  enforces its cost (the action, the use) and shows the text. A feature at tier `auto` must grant
  something, have uses, or be Spellcasting.
- **`derive(sheet)` and `validate(sheet)`** are in `packages/rules/src/derive.js`. The sheet as
  built: `{ name, class, subclass?, level, abilities, skills, extraSkills?, expertise?, choices?,
  armour?, shield?, weapons?, spells?, size?, speed?, senses?, tools?, gear?, look? }`. Ability
  scores are entered as they stand after background and feats (species, backgrounds and feats are
  not entered yet); `extraSkills` are the background's or species' skills. Hit Points use the fixed
  value per level. A Shield takes a hand, so a Versatile weapon's two-handed attack is listed only
  without one; a Thrown melee weapon is listed twice (melee and thrown). The record gains `feats`
  (each feature with its numbers put in), `hitDie`, `armour` (the category worn), `shield`,
  `critOn`, `bonusActs` and `pact`, and attacks gain `abil`, `weapon` and `time`.
- **Three situation tags** were added: `attack.str` (an attack using Strength: Rage, Reckless
  Attack), `attack.spell` (a spell's attack roll: Innate Sorcery), `self.notIncapacitated` (Danger
  Sense, Aura of Protection).

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
| R6 (part 1 built) | Standing-instruction reactions | Fable | `engine.js` | Opportunity Attack honours always / never; one spell reaction works |
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
