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
  (`within5`, `target.prone`, `attacker.unseen`, `ranged`, `ally.adjacent`; `attack.weapon`, made with a weapon and not an Unarmed Strike,
  and `attack.weaponOrUnarmed`, made with a weapon or an Unarmed Strike, since #445).
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
Feather Fall (`fall`, built in wave 4 part 5) and the Shield Guardian's and Stone Giant's reactions are still the DM's.
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
  The DM's `setSpeed` writes a speed (or `hover`) onto the creature and also records it in
  `speedSet` (`{ walk?, climb?, swim?, fly?, burrow?: feet, hover?: true }`; `0` is a way taken
  away; a way set back to exactly what its sheet gives loses its key; an empty record is
  deleted; so for a built character a value equal to what the sheet gives is not recorded, and a later sheet change shows through, while a creature with no sheet keeps every value set). A creature remade from its sheet (`remake()`: equip, shield, attunement at a Short
  Rest, `setSheet`, level-up) is laid over with the record by the same code, so the DM's grant
  wins over the sheet. Nothing is inferred from the creature differing from its sheet. A form
  (`forms.js`) keeps the live numbers and puts them back as they were, DM grants included; a
  `setSpeed` made during a form is not recorded and ends with the form. Players are not sent
  `speedSet`. #451.
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

### A spell's roll (amended 20 November 2026, #605)

A spell has one optional field, `roll`, that says what it turns on, so a list can show it as plainly as the level:
`"attack"` (the caster makes a spell attack roll), `"save:str"` to `"save:cha"` (the target makes that saving throw) or
`"none"` (no attack roll and no saving throw). `SPELL_ROLLS` in `content/schema.js` is the list, `lintSpell` checks it, and the
reader says it in words ("Its roll: the target makes a Dexterity saving throw").

- **One value.** A spell with two rolls takes the one that decides whether it works: Ice Knife is `attack` (its Dexterity save
  follows, hit or miss), Wall of Ice is `save:dex` (its Constitution save comes second). The spell's `text` names the other.
  A spell whose rolls come only from options (Arcane Hand's Clenched Fist) takes the roll of its first option.
- **Which roll the tag names.** The roll that decides, when the spell is cast, whether it works on its target. A save made only on
  later turns, only to escape, or only by an unwilling creature is still named when it is the spell's only way to resist
  (Levitate, Enlarge/Reduce: `save:con`). A save that applies only to one optional mode or a side case is `none`, and the text
  names it: Forcecage and Magic Circle (a creature escaping), Power Word Stun (the save only ends it later), Heat Metal (the damage
  is automatic; the save decides dropping the object), Wall of Stone, Control Water, Detect Thoughts (probing), Haste and Beacon of
  Hope (Advantage on saves is not a save the target makes). Melee spell attacks the caster makes each turn count as `attack`
  (Spiritual Weapon, Flame Blade, Conjure Fey).
- **It may not contradict the steps.** An attack step makes it `attack`; otherwise a save step that runs when the spell is cast (a top-level one, not inside another step's branch and not a
  zone's later turns) makes it one of those saves. A spell with no attack or save step (a `manual` one, or one that rolls nothing) may say any roll, since the steps do not
  show it. `spell-roll.test.js` holds all 339 SRD spells to this, so the data cannot drift.
- **Optional for homebrew.** When a spell does not say, `spellRoll(def)` (`effects.js`) reads the steps: an attack step, else the
  first save step, else `none` for a spell with no manual step, else nothing (null; the list shows no tag). `SPELLS[id].roll`
  and `spellRoll(id)` (`content/index.js`) give it for any spell, a table's homebrew included.
- **The screen.** A tag the size of the level: "Attack", "DEX save" or "No roll", in words and with a shape of its own (a solid
  outline, a double one, a dotted one), never colour alone, in every theme. Where it shows is in `docs/specs/spells-on-the-sheet.md`.

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
  creature it could not know of stands there, it arrives as intended and shares the space for now,
  and the DM alone is told to settle it (amended by #786 wave 4 part 4: landing anywhere else, or not
  moving, would tell the players something is there; a twin test casts Misty Step and Teleport onto a
  hidden creature and onto a bare cell), unless the step has `blocked`, whose steps then run on it
  and it stays (Dimension Door's 4d6 Force). If the space holds a creature it knew of (filled since
  the cast was checked), it takes the nearest unoccupied space, the first found on the nearest ring. Landing in a
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

#### Build notes: Mage Armor, Spare the Dying and Light (amendment, #674)

Three spells the engine used to hand to the DM, built to SRD 5.2.1 with the smallest additions to the vocabulary. Tests through
`apply()` in `packages/rules/test/mage-armor-spare-light.test.js`.

- **Op `baseAc`.** `{ on: 'ac', op: 'baseAc', value: { base, ability } }`, only in a modifier step (a trait, grant or aura is
  refused: the engine holds the number only for a creature a spell touched). The creature's base Armor Class becomes `base` plus
  that ability's modifier if that beats the base its own way of working it out gives; "you can benefit from only one" way
  (SRD, Rules Glossary, Armor Class) is read as the better. `derive` records that base as `acBase` (the armour's, or 10 + Dexterity,
  or the best Unarmored Defense, before a Shield and what features and items add); the spell replaces it and the rest still adds.
  `acOf` does the sum. The modifier is put on only a built character with no armour and not in a form. Any other creature (a
  monster, a hand-typed record, one in armour) gets a `manual` event and nothing is applied. Willingness is the table's.
- **`ends: { on: 'armour' }`**, for a modifier step: the effect ends when its creature is made again wearing armour (`donned`,
  `engine/sheets.js`, run by every route that remakes a character: `setSheet`, `equip`, `editCharacter`, `refresh`).
- **Step `stabilize: true`.** A creature at 0 Hit Points that is not dead becomes Stable (the `stable` status, the Death Saving Throw
  counts start again, a `cond` event). One that is up or already Stable is left, and a `note` says why: the cast still spends the
  action (the engine does not refuse a cast at an unhurt creature). Dead is refused at the cast, as for every spell.
- **`higher.range`.** The spell's range in feet by character level (Spare the Dying: 30, 60, 120), read by `rangeAt` in `effects.js` for
  the cast, the list of who can be aimed at, and Distant Spell.
- **Step `light: { bright, dim }`, with `replaces?: true`.** The creature it works on carries that light while the lasting effect
  runs, and it goes out with it (a `light` part, `durations.js`). `replaces`: the same caster casting the spell again ends the earlier
  casting. A creature carries one light in the engine: one already carried (`setLight`) is not replaced and the DM is told.
  Not built, so the DM's: Light on an object that lies elsewhere or is in someone's hands (the engine keeps the light on the caster, as
  if carried), its colour, covering it, the Large-or-smaller limit. SRD 5.2 has no saving throw for a hostile creature's object, so
  none is asked.
- **The Armor Class shown.** `ac` stays the creature's own number. The view adds `acNow` (the number that applies, from `acNow` in
  `engine/rolls.js`) and `acWhy` (the names of what changed it: Mage Armor, Barkskin) for every party creature where they differ;
  the DM works it out from the whole state (`acShown`). The sheet, the card and the attack log print it. A character saved before
  `acBase` existed has it worked out again from its sheet (`acBaseOf`), so no state version changed. That is done with the content lent
  at the moment (a table's homebrew, inside `using`) and trusted only when nothing is missing and the sheet gives the creature's own `ac`
  and armour; otherwise Mage Armor goes to the DM. A legacy character with homebrew gear may need a refresh (`refresh` writes `acBase`).
  A null or a failure is never kept; a kept answer is checked against `ac` and armour on every use, since `sheet.items` is emptied in
  place for a creature that vanishes or goes to a pocket dimension (`engine/resolve.js`).

#### Build notes: a creature-type limit on a target (amendment, #727)

A spell aimed at creatures may say which creature types it works on. Tests through `apply()` in
`packages/rules/test/target-types.test.js`.

- **`target.creature.types`.** A list of creature types, for a spell only (an area's `types`, above, stays for any action). A creature's
  type is its own `type`, else its stat block's, else Humanoid for a character (`creatureType`, `engine/world.js`); a creature in a form
  keeps its own type, as the SRD's Wild Shape says.
- **An invalid target** (SRD 5.2.1, Spells, "Invalid Targets"). The cast is not refused: the action, the slot and the components are
  spent as aimed, a hostile cast starts the fight as any does, and the steps do not run on a creature of another type. Where the
  spell's first step is a save with no half damage and nothing on a success, a `save` event is written for that creature with
  `success: true` and `invalid: true` and no die is rolled; otherwise a `note` says the spell did nothing to it. `effectStart` names
  the targets as aimed. A player who does not run the creature is sent the outcome alone, as for any save (`view.js`), so an invalid
  target and a made save read the same; the DM and the creature's own player see the mark.
- **A type the engine cannot tell** (a hand-typed creature with no `type` and no stat block): treated as valid, and a `manual`
  event tells the DM.
- **The monster AI** does not pick a spell with this limit (`castShape`, `ai.js`); the DM casts it for the monster.
- **Entered with it:** Hold Person (now `auto`), Charm Person, Dominate Person (Humanoid), Animal Friendship, Dominate Beast (Beast).
  Animal Friendship's charm also ends on damage from its caster's side (`ends: { on: 'damaged', by: 'source' }`, already in the
  vocabulary). Not built: a limit that changes the roll and not the target (Blight's Plant, Shatter's constructs), and wards against
  creature types (Protection from Evil and Good).
- **Not checked, not built** (#736). Animal Friendship cast with a higher slot on several Beasts: the SRD's "the spell ends" ends it on
  all of them when the caster's side damages one; the engine ends the charm on the damaged Beast alone (`ends` belongs to a part, and
  no part can end its whole effect), the entry is `assist` and says so, and the DM ends the rest (DEBT W39). Dominate Beast and Dominate
  Person are cast at a creature of the wrong type and of the right one in `target-types.test.js`.
- **Homebrew** (fix round 1). The field is in the strict-mode guard tables of `schema.js`, as an area's `types` is: its type is a list of
  text (`HOMEBREW_TYPES.creature`) and its length ceiling is the number of creature types, 14 (`HOMEBREW_LENGTHS['creature.types']`).
  That shape is also a creature's action's, where the linter refuses the field; the reader says so of such an action as a problem
  (`creatureAim`, `reader.js`), and the reader's golden monster "Flawed Reaver" has one.

#### Build notes: Jack of All Trades (amendment, #732)

Tests in `packages/rules/test/jack-of-all-trades.test.js`.

- **Tag `check.unskilled`.** A check that names a skill and uses none of the creature's proficiencies: not its own in that skill, not a
  monster's listed bonus, not a tool it is proficient with, not one a `proficient` modifier lends for a time. A check that names no
  skill (a plain ability check, Initiative) is not one: the SRD's sentence asks for "a skill proficiency you lack". The maker of the
  roll says whether a proficiency was used (`sit.proficient`: `abilityCheck` in `engine/features.js`, `passive` in `engine/rolls.js`);
  where it does not, the tag is not known to hold and the modifier is not applied.
- **Amount `{ prof: 0.5 }`.** Half the Proficiency Bonus, rounded down (`amount`, `derive.js`). No other fraction is taken.
- **Jack of All Trades** is that modifier on `check`, and is `auto`. A passive score counts it.

#### Build notes: Death Ward (amendment, #726 job 3)

Tests in `packages/rules/test/death-ward.test.js`. SRD 5.2.1, Death Ward: "The first time the target would drop to 0 Hit Points before
the spell ends, the target instead drops to 1 Hit Point, and the spell ends. If the spell is still in effect when the target is
subjected to an effect that would kill it instantly without dealing damage, that effect is negated against the target, and the spell
ends."

- **Hook `hp.zero`.** Asked when damage would take a creature from above 0 Hit Points to 0 (`damage`, `engine/resolve.js`), and by a
  `kill` step (`kill`, `engine/rolls.js`). It takes one shape, `{ on: "hp.zero", op: "min", value: 1, uses: 1 }`, and only as a
  modifier step (a spell's, an action's): the linter refuses any other op or value, a `when`, a missing `uses`, and the hook in a
  trait or a feat's grant, where nothing would use it up.
- **On damage.** The creature is left at 1 Hit Point, however large the damage (no death from massive damage: it never reaches 0).
  The `damage` events of that hit carry `hp: 1`, a `note` on the creature says "Death Ward: 1 Hit Point left instead of 0", and the
  part is used up (`useUp`), which ends the spell (`effectEnd`, "it was used"). Then the hit goes on as for any creature still up:
  the Concentration save, a reaction to the damage.
- **On a `kill` step.** Nothing happens to the creature, a `note` says "Death Ward: not killed", and the part is used up.
- **Not asked:** when the DM sets Hit Points (`setHp`: the DM's word); for a creature already at 0 Hit Points (it is not dropping to
  0: the damage counts against its Death Saving Throws and the ward stays); when its Hit Point maximum is lowered.
- **Before Relentless Rage.** A warded, raging barbarian is left at 1 by the ward; no Constitution save is made and no use counted.
- **Several wards on one creature** (two casters) all answer the same drop and all end.
- **Death Ward** is `assist`: the engine does all of the above, and a death the DM applies by hand from a `manual` entry (Power Word
  Kill, a monster's text) is the DM's to undo, ending the spell with `endEffect`.
- **The reader** has the hook's words; the golden spell "Many Blessings" and the golden monster "Cinderjaw Hound" (its Smoke Step) carry one.

#### Build notes: Dispel Magic (amendment, #726 job 5)

Tests in `packages/rules/test/dispel-magic.test.js`. SRD 5.2.1, Dispel Magic: "Choose one creature, object, or magical effect within
range. Any ongoing spell of level 3 or lower on the target ends. For each ongoing spell of level 4 or higher on the target, make an
ability check using your spellcasting ability (DC 10 plus that spell's level). On a successful check, the spell ends. Using a
Higher-Level Spell Slot. You automatically end a spell on the target if the spell's level is equal to or less than the level of the
spell slot you use."

- **Step `dispel: level` with `dc`** (`{ "dispel": 3, "dc": 10 }`; `dispel`, `engine/rolls.js`). Run on a creature. Every ongoing
  spell on it ends if its level is `dispel` or lower, or no higher than the slot the dispelling spell was cast with. For each higher
  one the caster makes an ability check with its spellcasting ability (`castAbilOf`), with no Proficiency Bonus, against `dc` plus
  that spell's level, through the same `abilityCheck` as any check (moved from `engine/features.js` to `engine/rolls.js` so the kit
  can use it), so what changes a check with that ability applies. A `check` event is written (`what` is the dispelling spell's
  name; a player is sent the roll and never the DC, as for every check), and on a success the spell ends. A `note` on the creature
  says how many spells ended ("Dispel Magic: 2 spells end", "no spell ends"); each ending is an `effectEnd` with
  `why: "it was dispelled"`.
- **A lasting effect keeps the level it was cast at** (`level` on the record in `state.effects`; state version 31): the slot's level,
  the spell's own where no higher slot was used, 0 for a cantrip, the level a magic item casts it at. The SRD's "Casting without
  Slots" and "Using a Higher-Level Spell Slot" make the slot's level the spell's. An effect with no `level` (a bound effect of an
  instant spell, corpses' control, one from before version 31 of a spell the pack does not have) counts at the spell's own level.
  The migration gives every older spell effect its spell's own level: the slot it was cast with is not known.
- **What "on the target" is.** A spell is on a creature if a live part of its effect is (a condition, a modifier, a light, Temporary
  Hit Points, a form, the bond of a creature a spell made, a changed weapon). A spell whose steps the DM applies has no part on
  anyone, so the effect also keeps whom it was aimed at (`aimed`, for a spell aimed at creatures or at its caster, less the targets
  a creature-type limit made invalid): where no part is on any of those, the spell is taken to be on each of them. Where it took
  hold on some and not on others (a made save), it is on those it holds only.
- **The spell ends whole.** The SRD's words are "the spell ends", so Bless on three creatures ends on all three when one of them is
  dispelled. (The other reading, ending it on the target alone, is one line: end the target's parts and let `spent` end the rest.)
- **Not built** (the entry is `assist` and says so): an object or a magical effect as the target (a zone, changed ground, a spell
  with nothing on a creature: the DM ends those with `endEffect`); magic that is not a spell cast through the engine (a feature's
  effect, a creature's own action, a spell the DM applied by hand). A caster whose spellcasting ability the engine does not know (a
  creature's action with the step) has each check handed to the DM in a `manual` event.
- **Views.** `level` and `aimed` are not sent to players: `viewEffects` sends named fields only.
- **The reader** has the step's sentence; the golden spell "Unravel" and the golden monster "Cinderjaw Hound" carry one.

#### Build notes: Revivify (amendment, #726 job 6)

Tests in `packages/rules/test/revivify.test.js`, and a `twin()` test in `packages/server/test/twin-worlds.test.js`. SRD 5.2.1, Revivify: "You
touch a creature that has died within the last minute. That creature revives with 1 Hit Point. This spell can't revive a creature that has
died of old age, nor does it restore any missing body parts." Components: V, S, M (a diamond worth 300+ GP, which the spell consumes).

- **The time of death is on the body** (`diedAt`, a number: the game clock, `s.clock`, in minutes). `died(s, t)` (`engine/rolls.js`) sets it at
  each of the places a creature dies (damage to a creature at 0 Hit Points or past its maximum, a third failed Death Saving Throw, a `kill`
  step, an Instant Death from damage), beside the `died` event. A creature that vanished (`vanish`: gone, not killed) has none.
  **One clock, in minutes, serves in and out of a fight**: in a fight the clock moves a round (0.1 minute) when the round turns, so ten rounds
  are a minute and no second count of rounds is kept. The cost is that the minute is judged to the round, not to the turn (a death early in
  round 3 and a cast late in round 13 count as a minute apart). Outside a fight it is the time the DM lets pass (`advanceTime`, rests).
- **The shape.** `diedAt` is optional and is read only on a dead creature, so the state version stays 31 and there is no migration: a body
  from a game saved before it was kept has no time of death, and none could be made up. Such a body is not revived: the cast is made and paid
  for, and the DM is told (`manual`: "the engine does not know when it died") and brings it back by hand (`setHp`). A body the DM's `setHp`
  raised has `diedAt` dropped there (`setHp` deletes it).
- **Aimed at the dead: `target.creature.dead: true`**, for a spell only (the linter refuses it in a creature's action, in the reader too).
  A spell without it refuses a dead target exactly as before ("... is dead."). With it the spell takes a body: the cast refuses, before
  anything is spent and changing nothing, a creature that is up ("... has not" died), a body that vanished, one nothing is left of
  (`remains`: dust or a statue, as Animate Dead says), a body under another creature that now stands there (the dead fill no space; as the
  DM's `setHp` refuses), one out of reach (touch is 5 feet) or behind a wall, and a creature a player has not been told of ("No such
  creature.", before the spell is looked at). `targetsFor` lists bodies for such a spell and the living for any other.
- **Step `revive: hitPoints` with `within`** (`{ "revive": 1, "within": 1 }`; `revive`, `engine/rolls.js`). Only in a spell whose creature
  target says `dead: true`, and that target needs the step: the linter holds each to the other, and holds the numbers (`revive` 1 to 100,
  `within` 1 to 1440 minutes; a homebrew table's ceilings are 2 and 2, twice the SRD's). It works on a body:
  - died `within` minutes ago or less (`s.clock - diedAt`, with the small allowance the clock's 0.1 steps need): the creature is no longer
    dead, `diedAt` is dropped, it is at 0 Hit Points and then healed `revive` (at most its maximum) by the engine's own `heal`, so its Death
    Saving Throw counts start again and Unconscious, Stable (and Prone outside a fight) end as for any healing, and a `heal` event and a `note`
    ("Revivify: Brenna returns to life") are written. In a fight it is in the order still and takes its turn.
  - died longer ago: an **invalid target** by the SRD's rule (a slot spent, nothing happens): a `note` says it died more than a minute ago.
    The cast is not refused, because a refusal would tell a player when a creature died, and no player is sent `diedAt` (it is withheld). The note
    itself does tell the caster that a body the party sees died more than a minute ago: a deliberate reveal about a body the party sees, not about
    a hidden creature (the twin test plays it).
- **What goes to the DM.** On every revival one `manual` event (`partial`) says that the engine cannot tell whether the creature died of old
  age (which the spell cannot undo) or lacks body parts (which it does not restore), and that it does not take the diamond worth 300 GP or more
  the spell consumes (the engine charges no component for any spell); the DM undoes the cast if the revival should not have worked, and takes the
  diamond. The engine does not guess either. A body with no `diedAt` is handed over whole, as above. The entry is `assist`.
- **Views.** `diedAt` is `withheld` in `view-fields.js`; the foe's record is built field by field and does not carry it. A hidden dead creature is
  not sent, aimed at or told of ("No such creature." is the same with and without it): the twin test plays a player's Revivify of a seen body, an
  aim at the id of a hidden body, and a second cast at the creature now up, in a world with a hidden dead creature and one without.
- **The reader** has the step's sentence and the target's, and the golden spell "Wake the Fallen" and golden monster "Grave Robber" (a creature's
  action aimed at the dead, refused) carry them.
- **Not built:** Raise Dead, Resurrection, Reincarnate, Clone and True Resurrection (a longer `within`, a Hit Point maximum penalty, Constitution
  checks, a body that is whole: none are in the vocabulary) and the client's picking a body to aim at.

#### Build notes: Death Saving Throws outside a fight (amendment, #726 job 8; DEBT W10)

Tests in `packages/rules/test/death-saves-outside-fight.test.js`. SRD 5.2.1, Dropping to 0 Hit Points: "Whenever you start your turn with 0 Hit Points,
you must make a Death Saving Throw". Stabilizing a Character: "You can take the Help action to try to stabilize a creature with 0 Hit Points,
which requires a successful DC 10 Wisdom (Medicine) check ... A Stable creature that isn't healed regains 1 Hit Point after 1d4 hours."

- **The problem.** Outside a fight nobody has a turn, so the trigger the SRD names never comes, and a creature at 0 Hit Points sat dying for ever
  (a Long Rest handed it to the DM). Three models were weighed. (1) *A fight starts for the dying creature*: invents a fight, an arena and an
  Initiative the DM did not ask for, and the SRD does not say it. (2) *The DM is handed it* (the old behaviour for a Long Rest): keeps the
  SRD but leaves the saves to the DM's memory and dice, which is the gap W10 names. (3) *The game clock moving rolls the saves*: the SRD's own
  unit of time for a turn is 6 seconds (a round), so a creature that is dying while the DM lets time pass makes one save for each 6 seconds
  that pass. **Model 3 is built**, because it needs no new state, keeps the SRD's counts and 1s and 20s, and uses the same `deathSave` as a fight.
- **The rule.** `deathSavesOver(s, minutes, ev)` (`engine/rolls.js`), called by `advanceTime`, `shortRest` (60 minutes) and `rest` (480 minutes)
  after they have validated and before the clock moves. For each creature that is dying (`dying`: at 0 Hit Points, not dead, not Stable) on the
  party's side with a death record, in the table's order, it writes a `note` ("... makes a Death Saving Throw for each 6 seconds that pass") and
  then rolls `floor(minutes x 10)` saves at most, one after another, stopping when the creature is Stable, dead or up (a 20). Five saves always
  settle a creature, so a jump of half a minute or more settles every one and a longer jump rolls no more. Less than 6 seconds rolls nothing.
  The seeded dice are the same as in a fight, so a game replays exactly; each save is a `deathSave` event with its roll, counts and result, sent to
  the table as it is in a fight (the DM sees every roll, and the players see what a fight shows them). The clock is set to each save's moment while it
  is rolled, so a death's `diedAt` (Revivify) is the moment of the failed save, then put back; the handler then moves it by the whole time.
  **Nobody dies silently**: the rolls and the `died` result are in the events, and `advanceTime` is the DM's own action. The DM who does not
  want the dice rolled stabilises or heals the creature first (below) or does not let the time pass.
- **After the saves.** A creature that died is out of the rest (dead: `who` drops it). One made Stable at a Long Rest regains 1 Hit Point as before
  (the Long Rest is longer than 1d4 hours); at an `advanceTime` or a Short Rest it stays Stable at 0, and the 1 Hit Point after 1d4 hours is still
  only across a Long Rest (W10's remainder: a Stable creature's 1d4 hours is not tracked on the clock). One that rolled a 20 is up with 1 Hit Point and rests as any
  creature does (not in the Short Rest it was dying through: its Hit Point Dice were not available when the rest began). A creature still dying
  after fewer than five rounds (a pass of under half a minute) keeps its counts, and a Long Rest or Short Rest still says it cannot rest.
- **Review fixes.** A Long Rest benefits only those who were up (1 Hit Point or more) when it began; one dying at its start gets the saves only (a 20 leaves it
  at 1 Hit Point, a Stable one regains 1 as before). Out of a fight each `stabilize` attempt takes 6 seconds: after the check the clock moves 0.1 minute
  through the same path (`deathSavesOver`, a `time` event, dawn, `tick`), so a failure costs the target a save and the other dying theirs. A player
  may only stabilise a creature it can see ("No such creature." otherwise, as for an absent id).
- **Foes and companions.** A foe at 0 Hit Points and a creature with no death record are not touched: the engine's own rule for them has not changed.
- **Stabilizing by Medicine: the `stabilize` action** (`engine/features.js`), `{ type: 'stabilize', actor, target }`. The SRD has no Help action in
  the engine, so this is the Help action's use: a DC 10 Wisdom (Medicine) check by a creature that is up and able, within 5 feet of the target and
  with no wall between, on a creature that is dying. Any creature may try (the check uses its own Medicine bonus, trained or not). In a fight it
  takes the actor's action on its turn (the engine's usual budget); out of one it costs nothing. A success is `stabilise` (the same as Spare the Dying: Stable,
  both counts reset, a `cond` event); a failure changes nothing and may be tried again (in a fight each try is an action). The `check` event
  carries `dc: 10`, `success` and `stabilize: <target id>`. Refused before anything is rolled, changing nothing: a target that is up, Stable or dead, the
  helper itself, a target out of reach, a helper that is down, and a creature a player has not been told of ("No such creature."). A player
  may stabilise anyone they can reach; control is the usual (`control`).
- **The play note of 15 November** ("during the exploration phase you can stabilize your team mates") was checked. Spare the Dying (15 feet and
  growing with level) and healing spells (Cure Wounds) already worked on a creature at 0 Hit Points outside a fight, with no fight needed
  (tested here); what was missing was the Medicine check, now `stabilize`, and the saves themselves.
- **Not built:** the 1d4 hours a Stable creature waits before it regains 1 Hit Point (only across a Long Rest, as before); a Help action in general
  (Advantage to an ally's check or attack: `stabilize` is its Medicine use only); the client's button for `stabilize` (the client lane); travel
  between places moves no clock, so it rolls nothing.

#### Build notes: Font of Inspiration and Wild Resurgence (amendment, #726 job 7)

Tests in `packages/rules/test/font-resurgence.test.js`. SRD 5.2.1, Bard level 5, Font of Inspiration: Bardic Inspiration comes back on a Short or
Long Rest, and "you can expend a spell slot (no action required) to regain one expended use of Bardic Inspiration." Druid level 5, Wild Resurgence:
"Once on each of your turns, if you have no uses of Wild Shape left, you can give yourself one use by expending a spell slot (no action required).
In addition, you can expend one use of Wild Shape (no action required) to give yourself a level 1 spell slot, but you can't do so again until you
finish a Long Rest." The Short Rest half of Font of Inspiration was already built (`uses.recharge` by level).

- **A new grant, `swap`** (a list of 1 to 4): `{ id, give, get, onlyEmpty?, per? }`. `give` is `{ slot: true }` (a spell slot the creature chooses) or
  `{ resource: feature id, n? }` (uses of a pool); `get` is `{ slot: level }` or `{ resource, n? }`. A slot is never given for a slot. `onlyEmpty:
  true` (only for a pool it gets): only when that pool has none left. `per: 'turn'`: once on each of the creature's own turns; `per: 'use'`: for one
  use of the feature itself (the feature then has `uses`, and they come back as `uses.recharge` says: Wild Resurgence's one use is "once until a Long
  Rest", restored by the rest as every feature with uses is, so `engine/rests.js` did not change). The linter holds the shapes and that a `resource`
  is a feature with uses of the class (`cost` references).
  Reading: `reader.js` has the sentence; `derive.js` copies it to the feature record (`FEAT_FIELDS` has it); an item may not grant it.
- **The action**: `{ type: 'feature', actor, feature, swap: id, slot?: level }`, by the creature's controller or the DM. No action, bonus action or
  reaction is taken, in a fight or out of it. Everything is checked before anything is paid: the creature is up and able; the swap exists; a slot of
  that level is there to give (`slot`); a pool given has the uses; a pool got is not already full (`uses.max`), and for `onlyEmpty` is at 0; `per:
  'use'` has a use left; `per: 'turn'` has not been made on this turn, and in a fight is made on the creature's own turn. Outside a fight there are no
  turns to count, so only the other limits hold and the DM is sent a `manual` note (partial) that the once-per-turn limit is theirs to judge (a swap needs a slot spent and a pool at 0, so it cannot run away). The turn is kept on the creature
  as `swapped` (`{ feature id: turn key }`), `withheld` in `view-fields.js`. A feature with `swap` used with no `swap` named is refused ("Say which
  swap"), so it can never spend its use by hand. A slot got is one more than the creature's maximum; it goes at the next Long Rest, which sets slots
  to their maximum, as a Font of Magic slot does.
- **Multiclass.** Features go by their own class's level: bard 5 / druid 5 has both; bard 4 / druid 5 only Wild Resurgence (tested).
- **The two features are `auto`.** Nothing is left for the DM. Pact Magic slots count as spell slots (they are in `slots`).
- **Homebrew swaps are refused for now**: `grants.swap` in a homebrew pack is refused by the strict shape check ("cannot swap a spell slot..."), as `invest` and `forgoAttack` are, because its limits are not in the homebrew tables. Tested through `loadPack`.
- **Not built:** the client has no control for it (DEBT W41).

#### Build notes: Flyby (amendment, #726 job 9)

Tests in `packages/rules/test/flyby.test.js`. SRD 5.2.1, the trait Flyby (the Owl, Giant Owl, Hippogriff, Gargoyle, Flying Snake, Giant Wasp and Pteranodon, one
text each): "doesn't provoke an Opportunity Attack when it flies out of an enemy's reach." DEBT W25.

- **A new trait key**, `flyby: true` (a trait of a monster, beside `dragFree`; `schema.js` lints it and lists it in the trait keys and types the homebrew
  tables read, `reader.js` says it in a sentence and counts the trait as run by the engine). It is a tag and nothing else, so a table's homebrew monster may carry it.
  The seven SRD traits named Flyby have it and the test holds that no other trait does.
- **The walk** (`engine/movement.js`, `walk`): a creature with the tag has no Opportunity Attack offered for any step it takes in a fight. The tag is read by
  `flyby(e)` in `modifiers.js` from the creature's own pack monster (`tpl`: a monster, a familiar, a summon) and from the stat block of the form it has taken
  (`form.block`: a druid's Wild Shape lays the beast's traits over it, as Pack Tactics is). A rider on a mount that has it is carried out of reach by it and
  provokes nothing either (it is moved by the mount's movement). A foe's instruction (`ask`, `never`) is not reached at all, so no prompt and no `manual`.
- **Walking or flying**: the SRD says "flies out". The engine keeps no movement mode, so a flyer walking on the ground still counts as flying; the tag counts only while the creature has a Speed to fly in its present shape (`speedOf` fly above 0). It is read for
  every step. Left for later (DEBT W42).
- **The brain** (`ai.js`, `guard`): a creature with the tag counts no foe as one that could make an Opportunity Attack on it, so a familiar owl steps away from harm
  as a creature with no such foe beside it does.
- **What a hidden creature tells.** A hidden mover that a party creature senses is found by the walk before the Opportunity Attack is made; with the tag there is no
  Opportunity Attack, so nothing finds it there. What a player is sent for a hidden flyer is a subset of what it is sent for a hidden creature without the tag (the
  `moved` event alone), and no scenario shows more with the tag than without, so no `twin()` test was added; the test holds that nothing but the move is sent.
- **Not built:** see DEBT W42.

#### Build notes: Heroism and Regenerate (amendment, #726 job 2)

Tests in `packages/rules/test/turn-start.test.js`. SRD 5.2.1, Heroism: "A willing creature you touch is imbued with bravery. Until the spell ends, the creature is
immune to the Frightened condition and gains Temporary Hit Points equal to your spellcasting ability modifier at the start of each of its turns. Using a
Higher-Level Spell Slot. You can target one additional creature for each spell slot level above 1." Regenerate: "A creature you touch regains 4d8 + 15 Hit Points.
For the duration, the target regains 1 Hit Point at the start of each of its turns, and any severed body parts regrow after 2 minutes." DEBT "a turn-start trigger
outside a zone".

- **Step `eachTurn: [steps]`** (`eachTurn`, `engine/rolls.js`; `turnSteps`, `effects.js`). Run on a creature, it puts a part `{ target, turn: { steps, src } }` on the
  spell's lasting effect (`src` is the name, the spell and the caster's spellcasting modifier as the cast had them). At the start of each of the creature's turns in a
  fight (`beginTurn`, `engine/resolve.js`, after what ends then and the zones that go off then; and for a controlled mount, with its rider's turn) the engine runs the
  steps on it as the effect's source, on top of whatever is on the effect stack, as a reaction is. Inside the list only `heal`, `tempHp` and `manual` steps, one to four,
  and none inside another (the linter, `lintSteps`); the step is for a spell that lasts, so that there is an effect to hang it on (`eachOk`). A cast with no lasting effect
  to hold it (an instant spell's bound one) hands the step to the DM, with a `manual` event. `eachTurn` is also a branch name (`BRANCHES`), so every walker of steps (the
  linter, the work estimate, the dice count, the reader) already reaches the steps inside; the homebrew list ceiling is 4 (`step.eachTurn`).
- **When it runs.** At the start of each of the creature's turns in a fight, not at a turn's end and not outside a fight (there are no turns then: Regenerate's hour out of
  a fight gives nothing, and the spell's text says so). A creature at 0 Hit Points gets its steps before its Death Saving Throw (`advanceTurn`): Regenerate's Hit Point
  raises it to 1, so no save is made; Temporary Hit Points never wake it. A dead creature gets nothing. Ending it is as for any part: the effect ends (its time, Concentration,
  Dispel Magic, the DM's `endEffect`) and nothing runs after. A creature that is set aside and takes its turn later the same round gets the steps once for the turn it
  begins, as everything else at the start of a turn does.
- **Temporary Hit Points a turn gives belong to the creature.** The steps are run without the effect's id, so the points are not taken back when the spell ends: the SRD's
  Temporary Hit Points "last until they're depleted or you finish a Long Rest". (A `tempHp` step in the cast itself is still tied to its effect, as before.) They do not add up:
  a creature keeps the larger of what it has and what it is given.
- **Hook `condition`** (`HOOKS`): one shape, `{ on: "condition", op: "immune", scope: { condition } }`, as a modifier step only (the linter refuses it in a trait, a feat's grant
  or an aura, which have `conditionImmune` and `aura.immune` already). While its part holds the creature is immune to that condition: `condition()` puts nothing on and says
  "Immune to Frightened", the DM's `condition` action is refused (`immuneTo`, `modifiers.js`, now also reads the lasting effects), and a condition it already has has no effect
  (its modifiers are not applied: `sources`, as for an Aura of Courage) and is not taken off, so it counts again when the spell ends. Frightened has no modifiers of its own
  in the pack (its Disadvantage and "cannot move closer" are in its `also` text for the DM), so for Frightened the effect today is that it cannot be given.
- **Heroism** is `auto`: a modifier step for the immunity and an `eachTurn` of `{ tempHp: "+0", addMod: true }` (equal to the modifier, with no dice of its own; a modifier of 0
  or less gives nothing and a lower number never lowers what the creature has). Targets and slots are as before (`higher.slot.targets`). "Willing" is not judged: the engine
  does not know whether the creature is.
- **Regenerate** is `assist`: the 4d8 + 15 at the cast, `eachTurn: [{ heal: "+1" }]`, and a `manual` step for the severed body parts, which regrow after 2 minutes: the DM does
  that, as it hands over every other restoration the engine cannot see.
- **Views.** `turn` on a part is not sent to players (`viewEffects`, with `born`): it holds the caster's modifier. Nothing else new is sent; a part on a creature a player sees is
  sent as before. No hidden state is added, so no `twin()` scenario was written: a hidden caster's effect on a party creature is visible by design, and the test holds that a
  player's view has no `turn` and no `healMod`.
- **The reader** says both: the hook's sentence and the step's, with what the steps do ("they stay after the spell ends"). The golden spell "Heroic Vigor" and the golden
  monster "Cinderjaw Hound" (Smoke Step) carry them; the sample pack's Stone Hide has an `eachTurn` for the dry run's coverage (the step cannot stand in a creature's action).
- **Not built:** steps at the *end* of a turn, other kinds of steps inside (damage at a turn's start is a zone's: Spirit Guardians), a number that grows with the turn, a
  creature's own action or a feature with an `eachTurn` (the step is for a spell), and a turn outside a fight (DEBT W43).

#### Build notes: wave 1 fight spells (amendment, #786)

Tests in `packages/rules/test/wave1-spells.test.js` and one `twin()` scenario in `packages/server/test/twin-worlds.test.js`. The owner's list of the spells his
table's party and the first module's NPCs use, in four waves; this is the first: Searing Smite, Spiritual Weapon, Guardian of Faith, Flame Blade, Heat Metal and
Faerie Fire, all `manual` before. Every number was compared with `reference/srd52/srd52-flow.txt` (Searing Smite 30476, Spiritual Weapon 31049, Guardian of Faith
27622, Flame Blade 27032, Heat Metal 27924, Faerie Fire 26686) and the entries keep `checked: true`. The wording of each entry's `text` is our own.

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Searing Smite | manual | **auto** | nothing |
| Faerie Fire | manual | assist | the objects in the cube (outlined, Dim Light, Advantage against them) |
| Heat Metal | manual | assist | the object itself (the target is the creature holding or wearing it), other creatures in contact, the Bonus Action repeat, whether a creature that failed the save could drop it |
| Guardian of Faith | manual | assist | keeps the guardian's space clear (it is invulnerable and occupies it) |
| Spiritual Weapon | manual | assist | keeps the attack to a creature within 5 feet of the weapon; the choice of weapon |
| Flame Blade | manual | assist | the free hand: letting go of the blade ends it, a new Bonus Action evokes it again |

**What the vocabulary already said** (no change): Faerie Fire is an area save whose failure puts a modifier on `attack.received`, a modifier on the hook `condition`
(`immune`, Invisible) and a `light` on the creature. Heat Metal is a damage step, a save, and two modifiers (`attack.roll`, `check` Disadvantage) that end at the start of the
caster's next turn. Searing Smite is a hit spell (`hit: { with: "melee" }`, Divine Smite's path: the engine asks at the hit, or the attack names it in `onHit`).

**What was added**, each as small as it could be:

- **Tag `target.seen`** (`TAGS`, `modifiers.js` `judge`): the attacker can see the target. The opposite of `target.unseen`; Faerie Fire's Advantage is "if the attacker can see it". And
  `sees` (`sight.js`) no longer says a creature is unseen for being Invisible while it is immune to the condition (`immuneTo`): "can't benefit from the Invisible condition" is the
  hook `condition`, and until now it stopped the condition being put on and its modifiers, but not the sight rule, which read the condition itself.
- **Tag `target.enemy`**: the target is on another side than the source (`hostile`). Guardian of Faith's "any enemy", in a fight or not (`target.fought` needs a fight).
- **Inside `eachTurn`: `damage`, `save` and a new step `endSpell: true`** (STEPS; Searing Smite: "the target takes 1d6 Fire damage and then makes a Constitution saving throw. On a failed
  save, the spell continues. On a successful save, the spell ends"). A `save` in the list has `onFail`/`onSuccess` steps that are `endSpell` or `manual` only; `endSpell` is refused anywhere but inside
  an `eachTurn`. The turn's steps now run with the spell's save DC (`dc` on the part's `src`), the effect to end (`fxEnd`, put there by `turnSteps`, not stored) and `turn: true`: a step after one that killed
  the creature does not run (no save for a dead creature). `endSpell` ends the whole lasting effect (`endSpell`, `engine/rolls.js`) with `why` "<name> made the save". A save inside an `eachTurn` is the creature's
  own, so the linter's "a self-aimed spell has a save step" check (`lintSelfSave`) does not count it.
- **A higher slot grows the damage inside an `eachTurn` as it grows the spell's first damage step** (`scaleSteps`): Searing Smite's "all the damage increases by 1d6 for each slot level above 1".
  `higher.slot.damage` is one number for both; the first damage step is the one with the hit, and the turn's step gets the same dice. (No second key: nothing else needs them to differ.)
- **`ends.keeps: true`** on a modifier or condition that ends at a turn boundary (Heat Metal: the Disadvantage "until the start of your next turn" ends, the spell goes on for the Bonus Action repeats):
  durations.js `spent` no longer ends an effect all of whose parts have ended when one of them carried it. Without it the engine ended the spell, and the caster's Concentration, with the Disadvantage.
- **`zone.budget: n`** (Guardian of Faith: "vanishes when it has dealt a total of 60 damage"): a spell's zone counts the damage its source dealt to the creatures it went off on (`fx.zone.spent`, after a save halves
  it and a Resistance cuts it) and ends the effect when it reaches `n` (`zones.js` `fire`; the effect ends with `why` "it dealt 60 damage"). Never sent to players (`viewEffects` sends no zone). The zone is a sphere
  15 feet from the chosen space, for a Large guardian that reaches 5 feet from its centre and "within 10 feet of the guardian"; it goes off on `["enter", "turnStart"]`, once a turn, and on no one as it appears.
- **A zone that goes off on nobody as it appears (no `atCast`) no longer reveals a hidden creature standing in its area** (`casting.js`): the cast's `targets` are the creatures in the area, and each was revealed, though nothing
  was done to it. The twin scenario found it: Pat was sent a `revealed` event only in the world with a hidden creature in the area. It applies to every such spell (Spirit Guardians and the other zones without `atCast`).
- **`bond.first: "commanded"`** (a summon bond that takes commands): made in a fight, the creature's first turn is already commanded (`bond.commanded`, as the `command` action sets it), so its master's player plays it straight
  after the cast, with no Bonus Action more. Spiritual Weapon: "you can immediately make one melee spell attack"; a weapon that acts straight after its caster (`turn: "after"`) is that attack, a turn later in the order
  but with nobody between. Later turns: the `command` action, a Bonus Action, as the SRD says ("As a Bonus Action on your later turns, you can move the force up to 20 feet and repeat the attack").
- **A summon block `spiritual-weapon`** (`content/srd52/summons.js`): Speed 20 (walk and fly), the caster's spell attack bonus, one action Force Strike for 1d8 plus the spellcasting modifier of Force damage, one more d8 for each slot level
  above 2 (as the Animated Object's extra dice are written). The SRD has no stat block: it is "a floating, spectral force", so the block is immune to every damage type and every condition and holds 1 Hit Point nothing can take.
- **Step `arm: { damage, type, addMod?, time? }`** (Flame Blade: "As a Magic action, you can make a melee spell attack with the fiery blade. On a hit, the target takes Fire damage equal to 3d6 plus your spellcasting ability modifier"):
  the creature it works on gets one more action in `e.actions` for as long as the lasting effect holds, a melee spell attack (reach 5) with the caster's spell attack bonus as the cast had it, taken with
  `{ type: "attack", attack: <the spell's id>, target }`. The part is `{ target, arm: id }` and `endPart` (durations.js) takes the action away with the effect (casting it again replaces it). It costs the Action (a Magic action:
  Extra Attack does not apply to it), or the Bonus Action with `time: "bonus"`. A spell attack, so Improved Critical does not widen it. A character that is made again from its sheet (a level up) loses it: the DM casts again.
  Needs a spell with a duration and a spell attack bonus; otherwise the step is handed to the DM. Flame Blade's `light` (10 and 10) and the new step are two steps of the same cast; the free hand is a `manual` step.
- **Fixed on the way:** an `onHit: [{ spell: "searing-smite" }]` named on an attack without a `slot` spent no slot (`e.slots[undefined]--`: NaN): it takes the lowest slot that may pay, as a standing instruction does.

**Per spell**

- *Searing Smite* has no Concentration (the SRD gives none). The extra 1d6 is rolled with the hit's damage and doubled on a Critical Hit; the turn damage is not doubled. A creature that dies of the burning makes no save.
  Like Divine Smite it is not offered on an Opportunity Attack. The burning runs only in a fight (no turns outside one: DEBT W43).
- *Heat Metal* is aimed at the creature holding or wearing the object: damage 2d8 (+1d8 per slot level), then its Constitution save. A success puts the Disadvantage on it (the engine reads "if it doesn't drop the object"
  as a success); a failure hands the drop to the DM, since a creature wearing armour cannot drop it and so has Disadvantage after all. The repeat on later turns is the DM's, in a `manual` step.
- *Guardian of Faith* is the zone above with `save: dex, half, when: target.enemy` and a flat +20 radiant damage on a failure. The guardian does not appear on the map.
- *Spiritual Weapon* lasts by Concentration; its `summon` makes a bonded creature `kind: "summon"`, `turn: "after"`, `orders: "command"` (range 500 feet), `at0: "vanish"`. The weapon appears in a space named in `summon: { at: [space] }`
  within the spell's range. Ending the spell, or losing Concentration, takes it off the map. A creature may still attack it (it takes no damage).
- *Flame Blade* gives the caster the action and the light; its Concentration ends both.
- *Faerie Fire* puts the modifiers on each creature that fails the save; one that makes it is not outlined. The Invisible modifier is the hook `condition`: a creature already Invisible keeps the condition (it counts again when the spell ends).

**Views.** `fx.zone.spent` and `fx.zone.budget` are in the zone, which no player is sent; `turn` and the new `arm` part carry the caster's numbers: a part's `arm` is the action's id, which a player who sees the creature is sent with the part.
The new `twin()` scenario holds the zone: a player's cast of Guardian of Faith with a hidden creature in the area outside the arena is sent the same as with none.

**Not built.** Heat Metal and Guardian of Faith do not track the object or the guardian as things on the map (DEBT W44); Spiritual Weapon's first attack is the weapon's turn straight after the cast, not inside it; Flame Blade does not look at
the free hand; Faerie Fire outlines no object; the "willing" and "can drop it" questions are the DM's.

#### Build notes: wave 2 areas and walls (amendment, #786)

Tests in `packages/rules/test/wave2-spells.test.js` and one `twin()` scenario in `packages/server/test/twin-worlds.test.js`. Second of the four waves: Spike Growth, Flaming Sphere, Wall of Fire, Wall of Thorns,
Blade Barrier and Wall of Stone, all `manual` before. Every number was compared with `reference/srd52/srd52-flow.txt` (Spike Growth 31004, Flaming Sphere 27073, Wall of Fire 31989, Wall of Stone 32076, Wall of Thorns
32112, Blade Barrier 24648) and the entries keep `checked: true`. The wording of each entry's `text` is our own, under 600 characters.

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Spike Growth | manual | assist | judges a jump, and the Search action and check that spot the hazard |
| Flaming Sphere | manual | assist | the barriers and pits it crosses, the objects it sets alight, its light |
| Wall of Fire | manual | assist | the hot side's 10 feet (creatures that end a turn beside the wall) and the ringed form |
| Wall of Thorns | manual | assist | the 4-feet-per-foot cost (the engine charges none: Difficult Terrain is a flat 2, so the cast hands it to the DM) and the circular form |
| Blade Barrier | manual | assist | Three-Quarters Cover for attacks across it, from both sides, and the ringed form |
| Wall of Stone | manual | **manual** | all of it: see "A wall that is an object" below |

**What the vocabulary already said** (no change): the zone (`on`, `once`, `atCast`), `terrain` (`difficult`, `obscured: "heavy"` for sight blocked) and the `line` area with a `width`.

**What was added**, each as small as it could be:

- **Zone trigger `step`** (`zone.on`, `zones.js` `stepped`; called after each 5-foot step in `engine/movement.js` and each pushed or pulled step in `engine/resolve.js` `push`). Spike Growth: "When a creature moves into or within the area, it takes 2d4 Piercing damage
  for every 5 feet it travels." A step that ends inside the zone is one dose, whatever it costs in movement (Difficult Terrain doubles the cost, not the feet travelled); the step that leaves it is none. Not once-a-turn.
- **Placed lines** (`area.placed: true`, a Line with `height`; `engine/world.js` `layout` and `squareLayout`, `aimArea`'s `toward`; `effects.js` `aimable`): a wall put down within the spell's range, centred on the space chosen, `size` feet in all, `width` thick,
  `height` high from the surface there. It runs across the line from the caster to the space unless `toward` (a space on its line) is named in the cast. Before this a Line with a range was a wall "of any shape" and handed to the DM. A zone's and a terrain's
  vertical test (`zones.js` `holds`, `terrain.js` `inside`) reads `height`. Straight walls only: the ringed form of each spell stays the DM's (a `manual` line in the entry's text). A hex is 5 feet, so Wall of Fire's 1-foot thickness is one hex.
- **`zone.effects`**: the steps a zone runs on later comers when they are not the cast's own. Wall of Fire: a Dexterity save for half as it appears, flat damage after ("takes the same damage", no save). Wall of Thorns: Piercing as it appears, Slashing after.
  The higher slot grows both (`scaleSteps` run on each list).
- **`zone.once: "enter"`**: only entering is held to once a turn. Wall of Fire "when it enters the wall for the first time on a turn or ends its turn there": ending a turn inside is its own go. (`once: "turn"` holds both together, as Moonbeam and Blade Barrier need.)
- **`zone.move: n` and the action `moveZone { actor, to, effect? }`** (a sphere zone that rolls; `engine/casting.js`, `zones.js` `shiftZone`). A Bonus Action; the zone goes up to `n` feet toward `to`, one step at a time, and stops in the first space a creature stands in; that creature
  makes the zone's save at once ("If you move the sphere into a creature's space, that creature makes the save against the sphere, and the sphere stops moving for the turn"), and is revealed if it was hidden. The cast puts the sphere in an unoccupied space.
  The barriers and pits are not looked at. Event `zoneMoved`, not sent to players (they are never sent a zone).

**The decisions the issue asked for**, each with a test:

- *Spike Growth and flyers.* A creature that is flying (its height is on no surface of its column, `space.js` `ground`; asked in `zones.js` `stepped`) touches no ground: it takes nothing. A creature on the ground takes a dose for every 5-foot step it takes in the area, whether or not it has a Fly Speed (Isaac's default on the board question `spike-fly`; the text says the ground sprouts the spikes).
- *Spike Growth and jumps.* The engine has no jump action; a jump is the DM's. The entry says so.
- *Spike Growth and forced movement.* A push or pull is movement: a creature shoved 10 feet through the area takes two doses (tested with Thunderwave).
- *Wall of Fire, leaving through the wall.* The text deals damage on entering for the first time on a turn and on ending a turn in it, and says nothing of leaving: leaving costs nothing. Crossing the wall costs one dose, on the way in; the walk stops there, as any walk into a zone does.
- *Blade Barrier, cover.* The wall gives Three-Quarters Cover to attacks across it from either side. The engine's cover comes from walls and objects on the map, which a spell cannot put there (below), so the cover is the DM's: the entry's text and the cast's `manual` event say it, for both sides.
- *Blade Barrier, the save.* "ends it turn there" (2024), not "starts" (2014): the zone goes off on `enter` and `turnEnd`, never `turnStart`, and a creature saves once a turn (`once: "turn"`, and the cast's own save counts for the turn it was made in).
- *Flaming Sphere's school.* The SRD 5.2.1 header reads "Level 2 Conjuration (Druid, Sorcerer, Wizard)": the entry keeps conjuration. The evocation the community pass reports is not in the text this repository holds.

**A wall that is an object (Wall of Stone, and the cover and sight of the others).** Wall of Stone is a nonmagical object with panels, Hit Points, AC and a shape the caster chooses, and the others need cover. `walls.js` reads walls and objects from the map document (`map.walls`, `map.objects`) and caches by their signature;
a spell-made wall would have to put segments there and take them away when the effect ends, which touches the map's linter, its migration, what players are sent of the map and the undo history. That is a larger mechanism than this wave: Wall of Stone stays `manual` (its entry already hands the DM everything), Blade Barrier's cover is
the DM's, and Wall of Thorns' sight block is Heavily Obscured in its area (`terrain.obscured`), the nearest thing the engine has. DEBT W45.

**Views.** `fx.zone` (its hexes, origin, `move`) is never sent to a player, as for every zone; the new `zoneMoved` event is dropped for players (`viewEvents` names the types a player receives). The new `twin()` scenario holds the sphere: a player's cast with a hidden creature in its area, and the sphere rolled away, are sent
the same as with none.

**Not built.** See DEBT W45: the ring of Wall of Fire, Thorns and Blade Barrier, the hot side of Wall of Fire, 4-for-1 movement through Thorns, walls as map objects, light from the sphere and objects it ignites, the client's way to name a wall's direction and to roll a zone.

#### Build notes: wave 3a wards and conditions (amendment, #786)

Tests in `packages/rules/test/wave3a-spells.test.js`. Third wave, first part: Protection from Evil and Good and Command are built; Sanctuary, Silence, See Invisibility and Freedom of Movement are not yet (still `manual`; see the PR). Numbers compared with `reference/srd52/srd52-flow.txt` (Protection from Evil and Good 30005, Command 25027). The flow text drops Command's "Using a Higher-Level Spell Slot" paragraph at a page break; the layout file `reference/srd52/srd52.txt` (line 7085) has it ("one additional creature for each spell slot level above 1"), so the entry's `higher` is right.

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Protection from Evil and Good | manual | assist | possession; whether the target is willing; a creature whose type the engine cannot tell |
| Command | manual | assist | Approach and Flee movement, what a Drop lets go of, whether a creature that cannot understand the word follows it (the SRD text is silent) |

**Added.**
- **Modifier key `from: [creature types]`**: the modifier holds only against a creature of those types. On `attack.received` the attacker's type; on the `condition` hook (immunity) the creature giving the condition (`condition()` passes its source; a DM-applied condition has none, so a restricted immunity does not stop it); on a `save` with `scope.condition`, the source recorded on the condition the creature already has (`cond[id].source`). `modifiers.js` `fromHolds`, `typeOf`, `immuneTo(s, e, id, giver)`. Schema lint, reader words, HOMEBREW_TYPES and `modifier.from` length 14. A restricted immunity never hides a condition already on the creature.
- **Step `command: <word>|'chosen'`, choice kind `command`** (`COMMANDS`): on a failed save a part is put on the lasting (bound) effect, carried out at the start of the creature's next turn (`resolve.js` `commandsOn`) and gone when that turn ends. Halt, Grovel and Drop set movement, action and Bonus Action to 0 (Reaction untouched); Grovel also puts Prone on (after the creature would have stood). Approach and Flee give a `manual` event to the DM. Spells only (`commandOk`).

**Decisions.** Protection from Evil and Good: Advantage on a save about Charmed or Frightened applies when the creature's existing condition came from one of the six types (an over-approximation: a new, unrelated Charm during it also gets it). Command: a command cast during the target's own turn waits for its next turn; outside a fight it waits for the first turn of the next fight. The part ends with the next turn's end, and also when the fight ends (`fightOver` ends parts that have a turn ending), so a command never waits forever (tested). The cast's and the turn's lines about a command are `manual` events with `partial: true` (the DM's alone), not `note`s: view.js sends a `note` to every player with its creature's id, which would name a creature that went hidden or Invisible after it was commanded (tested through `viewEvents`). A `twin()` scenario was tried and cannot be built: a creature the DM hides is never in the fight, and one forced into the order shows as `someone` in the order and the turn by the table rule `unseenTurns`, by design.

The Advantage-on-save modifier matches the recorded source of the condition (`cond[id].source`), as above. For `from`, a creature in a form keeps its own type (SRD 5.2.1: Wild Shape and Polymorph both retain the creature type), via `typeOf`; one with no known type matches nothing, and a player character reads Humanoid.

#### Build notes: wave 3a part 2 (amendment, #786)

Tests in `packages/rules/test/wave3a2-spells.test.js`. Sanctuary and Freedom of Movement are built (both `assist`). Numbers compared with `reference/srd52/srd52-flow.txt` (Sanctuary 30372, Freedom of Movement 27256). Silence and See Invisibility are still `manual`. The SRD 5.2.1 text of Freedom of Movement says nothing of attack penalties underwater (the 2014 text did): the entry gives a Swim Speed only, which the engine does not keep, so it is the DM's.

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Sanctuary | manual | assist | letting an attacker that failed choose a new target instead of losing the attack (the engine takes the loss); whether a spell with several targets is lost whole (the engine drops only the warded target); damage the engine cannot attribute to the warded creature (a zone or effect from an earlier spell, damage the DM sets) |
| Freedom of Movement | manual | assist | other magic than a spell (an item, a trap, a monster's own ability) reducing Speed or giving Paralyzed or Restrained; a condition a spell gave before this one; the Swim Speed; the 5 feet of movement to escape nonmagical restraints or a grapple |

**Added.**
- **Step `ward: <ability>`** (Sanctuary): a part `{ ward: { save, dc } }` on the lasting effect (`rolls.js` `ward`; needs a spell that lasts and a save DC, else the step goes to the DM). `resolve.js` `wardCheck`: a creature that targets the warded one with an attack roll (`resolveAttack`, and the `attack` step in `effects.js`, which runs a creature's action attack and a spell's attack roll) or with a spell that has an attack or damage step and an aim at creatures (`casting.js` `damaging`) first makes the saving throw against the spell's DC; on a failure the attack is not rolled, or the spell is left off that target (`src.blocked`, the list Shield uses), and the DM is told in a `partial` `manual` event. A `save` event is sent, no `note` (a note would name an attacker that went hidden). Area spells (`aim` not `creature`) are never checked. `durations.js` `endWards` ends the effect when the warded creature makes an attack roll (the same two places), casts a spell (`casting.js`, before the Counterspell window: a countered spell was still cast) or deals damage (`damage()`, where a damage part names `by`).
- **Hook `terrain`, op `immune`** (Freedom of Movement): `{ on: 'terrain', op: 'immune' }`. `world.js` `moveOptions`: a step into a Difficult Terrain tile (forest), a rise above `STEP_FREE`, a hostile creature's space and ground a spell made difficult cost what open ground does. Water and rock stay impassable; climbing is not Difficult Terrain and is unchanged.
- **Modifier key `magic: true`**, only on the `condition` hook (op `immune`) and on `speed` (op `immune`). On `condition`: the immunity holds only against a condition a spell gives (`condition()` in `rolls.js` passes `f.src.spell`; `immuneTo(..., magic)`); like `from`, it never hides a condition already on the creature, and a DM-applied condition is not stopped. On `speed`: `speedOf` leaves out what a spell's lasting effect (a part of an effect whose `spell` is set) takes off (`add` below 0, or `set`); a Speed cut by a condition that is on already, or by a feature's effect, still counts. Schema lint, reader words, HOMEBREW tables (`step.ward`, modifier key `magic`) and a lint test.

**Decisions.** A failed Sanctuary save loses the attack or spell: the SRD gives the attacker the choice of a new target, which would need a prompt; the DM may allow it. `keepSpeed` leaves out every spell `set` on Speed, even one that would raise it (nothing in the SRD does). A failed Sanctuary save takes the target out of the spell whole: no attack roll, save or rider (`wardLost` in `casting.js`, not Shield's `blocked`); a trap (an object actor) never makes the save. A zone's conditions are not `magic` (a zone's `src` does not name its spell); Web and Entangle cast as a spell are. One save is made for each attack roll or spell aimed at the warded creature, as the SRD says "targets".

#### Build notes: wave 3a part 3 (amendment, #786)

Tests in `packages/rules/test/wave3a3-spells.test.js`, and a `twin()` scenario in `packages/server/test/twin-worlds.test.js`. Silence and See Invisibility are built (both `assist`). Numbers compared with `reference/srd52/srd52-flow.txt` (See Invisibility 30517, Silence 30743).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Silence | manual | assist | the Deafened condition for a creature entirely inside; sound made within or passing through the sphere; objects' Immunity to Thunder damage |
| See Invisibility | manual | assist | the Ethereal Plane (the engine keeps none) |

**Added.**
- **Terrain key `silence: true`** (Silence): `terrain: { silence: true }` on a lasting spell whose area is a sphere. `casting.js` puts `silence` on `fx.terrain`. `terrain.js` `silentAt(s, pos)` is whether a place is in a sphere; `silentAll(s, t)` whether every hex of a creature's space, at its feet and its head, is. `casting.js` refuses a cast with a Verbal component by a creature that stands in one (before anything is spent or changed; Subtle Spell is let through, as it drops the component), and `resolve.js` `hitWays` offers no spell cast after a hit with a Verbal component from there. `damage()` gives a creature entirely inside Immunity to Thunder damage. The Verbal gate sits in `rolls.js` `slotsFor`, beside the `noSpells` gate, so every way of casting passes it: a reaction spell with a Verbal component (Shield, Hellish Rebuke) is neither offered nor cast from inside the sphere, and a spell cast after a hit is not offered; Counterspell (Somatic only) is. A Multiattack that holds a spell-like action, and a feature that is only spoken, are not gated. Schema lint, reader words, HOMEBREW tables (`terrain.silence`) and a lint test.
- **Hook `invisible`, op `immune`** (See Invisibility): `{ on: 'invisible', op: 'immune' }` as a modifier step. `sight.js` `sees`: a viewer that has it sees a target with the Invisible condition (and one hiding, which is the Invisible condition against its enemies) as if it were visible, at any distance, as it would with Truesight in range; the other checks (light, fog, walls, Blinded) still apply. `vision.js` `signature` includes whether each living party creature has the hook from any source (`modifiers()`: a spell, a trait, an aura, a form), so the party's view is built again when it is gained or lost. Schema lint, reader words (`HOOK_WORDS`, `HOLDER_HOOKS`) and a lint test.

**What players are sent.** Nothing new for a table with no See Invisibility on it: an Invisible creature is still left out of every view, which the twin scenario pins (the same bytes with and without such a creature). While the spell lasts, the party's shared view (`partyView`: a creature is seen if any party member can see it, as with Truesight or Blindsight) holds the Invisible creature, so every player at the table is sent it, not only the caster's player. A per-player sight rule would be a bigger change (W49).

**Decisions.** Silence is not a zone: it has no steps to run on a creature that enters, so the terrain machinery (a place, not an event) fits. "In the sphere" for casting is the caster's own hex. Deafened is left to the DM because a condition put on by a zone stays on after a creature leaves it.

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
    "any" }, bonus?, damageType?, properties?, trained?, mithral?, grants?, variant?: damageType | spell, charges?: { max,
    regain? }, activate?: [{ name?, time, cost?, consumed?, spell?, level?, dc?, effects? }], tier, checked, source,
    text }`. `mithral: true` (armour only): the worn suit has no Stealth Disadvantage and no Strength requirement. `wear` is where its magic works (`carried`: on the person). 76 items: 37 auto, 15 assist, 24 manual.
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
  - *Shield (issue #449)*: `shield { actor, on, item? }` puts a Shield away or takes it up (SRD "Armor": "Shield (Utilize
    Action to Don or Doff)"), by the controller or the DM, for a built character. In a fight it costs the creature's
    action on its own turn, and is refused when it has none, when it is not its turn, or when the Shield is already so;
    outside a fight it is free. A sheet's Shield put away is `shieldStowed: true` beside `shield: true` (carried, not held:
    no Armor Class from it, a hand free for a Two-Handed weapon, `e.shield` unset); a magic Shield item toggles its
    `equipped` (`item` picks one of several) and stays attuned. No Shield, or none the character is trained with, is
    refused. The creature is made again from the sheet as `equip` does. The `shield` event (`id`, `on`, and `key` and `item`
    for a magic one) goes to players for a creature they see, with the item only for their own, never for a hidden one.
    No state version change: a sheet without the field plays as before. The monster AI does not use it.
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

#### Build notes: wave 3b part 1 (amendment, #786)

Tests in `packages/rules/test/wave3b1-spells.test.js`, and a `twin()` scenario in `packages/server/test/twin-worlds.test.js`. Globe of Invulnerability and Antilife Shell are built (both `assist`). Numbers compared with `reference/srd52/srd52-flow.txt` (Globe of Invulnerability 27505, Antilife Shell 24136: the 10-foot Emanation, Concentration, up to 1 minute and up to 1 hour, Constructs and Undead excepted, levels 6 and 5, "level 5 or lower", one level more for each slot level above 6).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Globe of Invulnerability | manual | assist | objects inside; spells the engine cannot aim; effects already running; the barrier's height |
| Antilife Shell | manual | assist | touch spells, Opportunity Attacks, forced movement through it; a creature whose type is unknown; the whole aura when its caster is hidden from the party |

**Added.**
- **Terrain keys `globe: true` and `shell: true`**, each alone in its `terrain`, on a lasting spell whose area is an Emanation (until now an Emanation could carry no terrain, as it moves with its caster). Schema lint, reader words, HOMEBREW tables (`terrain.globe`, `terrain.shell`) and a lint test. `terrain.js`: `globesOf`, `shellsOf`, `inGlobe`, `inShell`. `casting.js` lays out a globe's columns (the caster's own space too) and its origin where it went off; a shell keeps `follows: caster` and no hexes.
- **Globe**: in `cast`, a spell whose level is below the globe's (`fx.level`, the slot it was cast with, less one: 5 or lower from a level 6 slot; the level of the spell as cast counts: the SRD says a spell cast with a higher slot "takes on the higher level for that casting", so a level 1 spell cast with a level 6 slot is a level 6 spell and gets through) cast by a creature not inside that globe leaves out what is inside. Aimed at an area, the creatures inside are left out of its targets and the barrier's columns out of its hexes (so a zone or terrain it lays out leaves the inside bare). Aimed at creatures, one inside may be targeted and the cast is paid for, and the creature is treated as an invalid target (`warded`: a `note` "does nothing", never a faked save). Cast from inside, a spell is not looked at.
- **Shell**: `world.js` `shellsFor`, `shelledStep`, `shelledReach`, `shellRefusal`. `moveOptions` leaves out a step that takes a bound creature from outside the aura into it (walking, climbing, flying and ladders), so the AI never plans it, and `move` names the aura when that is the only reason a place is refused (`opts.unshelled` asks the question). `attack` (a melee attack) and `aimAction` (an action with a reach) refuse a melee attack of 5 feet reach with one end inside and the other outside, before anything is spent. The SRD lets an affected creature attack "with Ranged or Reach weapons through the barrier", so an attack record or monster action whose reach is more than 5 feet (a glaive, an ogre's or violet fungus's 10-foot reach) is let through, and a 5-foot weapon or natural attack is stopped (the decision: the engine has no Reach property on a monster action, so reach beyond 5 feet stands for it); the monster brain (`ai.js`) skips such targets (`shelledReach` is exported from `engine.js`: the one change there). A creature already inside is not pushed and may move within and out. After each step of the caster (`movement.js` `shellCatch`) the spell ends if a Huge or smaller bound creature is inside the aura that was not before. Constructs and Undead are not bound; the caster is not bound by its own; allies are.

**What players are sent.** A refused move or attack of a creature the party can see names the aura (`Antilife Shell keeps ... from passing into it`). A shell whose caster the party does not know of (hidden, hiding or unseen: `shellSeen`) binds nobody and ends for nobody, so a refusal, or a spell that ends, never tells a player that something stands in a place; the `manual` event at the cast is the DM's alone. The twin scenario holds a visible creature walking into a hidden caster's shell: the same bytes as on a bare cell. A globe judges by the caster's and the targets' places only, and a creature that is hidden inside is left out of an area by its hex, not by being there, so the cast event is the same with or without it.

The aura moving over a creature the party does not know of ends nothing; the DM alone gets a `manual` event to judge it (tested). A second twin scenario holds a hidden creature inside a Globe with a spell cast from outside at the area, through the real `cast`.

**Decisions.** The SRD's "Huge or smaller" ends the spell, so a Gargantuan creature the aura moves over does not. A creature whose type the engine cannot tell is bound (it cannot be shown to be a Construct or Undead). Opportunity Attacks and touch spells are not gated: they are reach, but go through other paths; the DM judges them (W51).

#### Build notes: wave 3b part 2 (amendment, #786)

Tests in `packages/rules/test/wave3b2-spells.test.js`, and a `twin()` scenario in `packages/server/test/twin-worlds.test.js`. Dispel Evil and Good, Confusion and Bestow Curse are built (all `assist`). Numbers compared with `reference/srd52/srd52-flow.txt` (Dispel Evil and Good 26077, Confusion 25161, Bestow Curse 24571: levels 5, 4 and 3; Concentration, up to 1 minute for each; the 10-foot-radius Sphere, range 90 feet, +5 feet of radius per slot level above 4; Wisdom saves for Confusion and Bestow Curse, Charisma for Dismissal; the four curses; the d10 table 1, 2 to 6, 7 to 8, 9 to 10 with 1d4 for the direction; Bestow Curse's levels 4, 5 to 6, 7 to 8 and 9).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Dispel Evil and Good | manual | assist | Break Enchantment and Dismissal (Magic actions of the spell, with the Charisma save and sending a creature home), and ending the spell with them |
| Confusion | manual | assist | walking a creature that rolled 1; creatures the party does not know of that a 7 or 8 could pick; the later attacks of Extra Attack at the chosen creature on a 7 or 8; the Sphere's radius for a slot above 4 |
| Bestow Curse | manual | assist | the Dodge action forced by the third curse (the engine rolls the save); the longer time and no Concentration from a higher slot |

**Added.**
- **Step `confuse: true`** (Confusion), with `ends` as a condition has (`ends: { on: 'save', save, at: 'turnEnd' }` only), in a spell that lasts. `rolls.js` `confuse`: a part `{ target, confuse: { had } }` on the lasting effect, with the repeated save the step gives (`durations.js` `boundary` rolls it, at the end of each of the creature's turns; a success ends it on that creature). While it holds, the creature's Reaction is marked spent (`reactionUsed`, which `canReact` reads), so no Reaction of any kind is offered or taken; `had` is what it was, and `endPart` gives it back when the last such part ends. `resolve.js` `confusedOn`, run at the end of `beginTurn`: no Bonus Action (`budget.bonus` 0), the Reaction marked again (the turn gave it back), and 1d10 rolled. 1: no movement and no action (the engine takes both) and a direction from 1d4 told to the DM, who walks the creature (it does not steer a creature on a compass heading). 2 to 6: no movement, no action. 7 or 8: no movement; the Attack action is left, the creature to attack is picked and the turn flags `confused:<id>` and `confusedFoe:<id>:<foe>` are set; `attacks.js` `attack` refuses another target (`confusedFoe`), and the brain (`ai.js` `confusedStep`) makes that one melee attack and ends its turn. 9 or 10: it chooses. All told to the DM alone, in `partial` `manual` events (a `note` would name a creature). `durations.js` `confusedNow` keeps the Reaction marked when a Confused creature joins a fight or one begins. Schema lint, reader words, HOMEBREW tables (`step.confuse`) and lint tests; the sample pack's Gloom Snare gained the step, so the pinned hashes in `homebrew-subclass.test.js` are re-measured.
- **Choice kind `curse`, and step key `ifChoice: [values]`** (Bestow Curse). `CURSES`: `str` to `cha` (Disadvantage on checks and saves with that ability), `attacks`, `dodge` and `damage`. A spell whose choice is of a curse says in each step which values it is for; `casting.js` `chooseIn` leaves out of the cast the steps for another curse (in branches too) and fills the chosen ability into `scope.ability: 'chosen'`. A step with `ifChoice` needs `choice: { of: 'curse' }`, and the values must be the choice's (`from` may narrow them). Schema lint, reader words (`CURSE_WORDS`), HOMEBREW tables (`step.ifChoice`), the dry run's sample and lint tests.
- **Modifier key `against: 'source'`**, on `attack.roll` only, in a modifier put on the target (no `to`): it holds only against the spell's caster (`rolls.js` `modifier` keeps `against: <caster>` on the part; `modifiers.js` already matched it to the creature rolled against). Without a caster the step goes to the DM. Schema lint, reader words and a lint test.

**What players are sent.** Nothing new for a table with no Confusion on it. A confused creature's roll, its direction, its pick and its reach are in `partial` `manual` events: the DM's alone (tested through `viewEvents`). The pick leaves out every creature the party does not know of, and the die for it is drawn whatever the pool (`rand` is called once), so what a player is sent, and the dice that follow, do not depend on a hidden creature; the turn flags `confusedFoe:<id>:<foe>` already drop out of a player's flags when a creature they name is hidden (`view.js`). The refusal of an attack at another target names the chosen creature, which the party knows of. A `twin()` scenario holds a hidden creature on the map while a confused creature rolls a 7 or 8 and its turn is taken; one inside the confused creature's reach cannot be built (a creature the DM hides is never in the fight, and one forced into the order shows as `someone` by design), so that the pick skips an unknown creature is tested in the rules test, with a creature that is hiding. Bestow Curse and Dispel Evil and Good add no event.

**Decisions.** Dispel Evil and Good's list has no Aberration (Protection from Evil and Good's does; the SRD text of this spell lists five types, tested against an Aboleth); the cast has no roll of its own, but the entry keeps `roll: "save:cha"` for the Dismissal save so the pinned counts by roll do not move. Break Enchantment and Dismissal are the DM's because a Magic action of a spell already cast has no hook (W52). Confusion: "within reach" is the longest melee reach of the creature (its attack records, or a monster action's `reach`), 5 feet at the least, through nothing that gives Total Cover; the creature itself is never in the pool; creatures at 0 Hit Points are. A 7 or 8 with nobody the party knows of in reach takes the creature's action (the SRD: no action; the DM makes the one attack by hand if it finds an unknown creature in reach); this depends only on creatures the party knows of, so it shows a player nothing about a hidden one. With a creature picked, only the one melee attack is allowed: Dodge, Dash, Disengage, Hide, Search, a feature, a spell and an `act` at another target are refused with the reason (`confusedOnly`). A party creature's player is sent a plain `note` with the roll and what it may do. Casting Confusion again on a creature it already holds keeps one part. Bestow Curse: "Disadvantage on ability checks and saving throws made with that ability" is two modifiers (`check`, `save`) with the one ability; the extra Necrotic damage is added to all damage the caster deals the creature through `damage.dealt` (an attack or a spell, as the SRD says), once for each damage roll. A curse cast with a higher slot keeps a minute of Concentration in the engine (W52).


#### Build notes: wave 4 part 1 (amendment, #786)

Tests in `packages/rules/test/wave4p1-spells.test.js`. No engine change: Fly is made of a modifier the engine already has, and the two spells the engine cannot do stay `manual`. Numbers compared with `reference/srd52/srd52-flow.txt` (Fly 27146: level 3, Action, touch, Concentration up to 10 minutes, Fly Speed 60 feet, hover, one more creature per slot level above 3; Feather Fall 26756: level 1, Reaction, 60 feet, 1 minute, up to five falling creatures, 60 feet per round, no damage on landing; Jump 28399: level 1, Bonus Action, touch, 1 minute, 30 feet for 10 feet of movement once on each of its turns, one more creature per slot level above 1).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Fly | manual | assist | hovering (the engine lends the Fly Speed through `speed.fly`, not `hover`, so a flyer knocked Prone or Incapacitated falls); a creature that can stop its own fall |
| Feather Fall | manual | manual | everything: the cast, the slowed descent and the landing without damage |
| Jump | manual | manual | everything: the engine has no jump |

**Added.** Nothing: no new step, hook or op.

**Found.** A lent Fly Speed that ends while the creature is aloft already makes it fall: `gravity` in `engine.js` runs after every action (and so after `endEffect`, Concentration breaking and an effect running out), and `aloft` reads the modifier. The tests show a creature at 30 feet dropping to the ground with damage when Fly ends. Nothing was needed to close that gap.

**What players are sent.** Nothing new. Fly adds a lasting effect and a `fell` event the engine already sends; a fall is shown to a player only for a creature they can see, as before.

**Decisions.** Fly keeps its `manual` step for hovering, and says so. Feather Fall: the SRD trigger is "a creature you can see within 60 feet of you", so the falling creatures must be ones the caster can see; the text says so and a test pins it. It stays `manual` because the engine has no reaction trigger on a fall (`reactions.js` has none, and `cast` refuses a Reaction spell without a standing instruction): adding one means a prompt in the middle of `fall` and the gravity pass, and a slowed descent the fall rule does not have. Jump stays `manual`: movement has no jump, so there is nothing for a spell to lend (W53).

#### Build notes: wave 4 part 2 (amendment, #786)

Tests in `packages/rules/test/wave4p2-spells.test.js` and two twin scenarios in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (Find Traps 26926: level 2, Action, 120 feet, instantaneous, any trap in range and line of sight, its presence and general nature but not its location; Detect Magic 25933: level 1, Action or Ritual, Self, Concentration up to 10 minutes, 30 feet, a Magic action shows the aura and the school of a spell's magic, blocked by 1 foot of stone, dirt or wood, 1 inch of metal or a thin sheet of lead; Knock 28415: level 2, Action, 60 feet, V, one lock opened, Arcane Lock suppressed 10 minutes).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Find Traps | manual | assist | tells the player what the engine found; adds Alarm, Glyph of Warding and any trap the map does not hold as an object |
| Detect Magic | manual | assist | tells the player; adds magic the engine does not track (stat blocks, areas), magic that arrives later, and judges the thickness of a wall; the Magic action's aura and school |
| Knock | manual | manual | everything: a spell cannot be aimed at a map object (W54) |

**Added.** One step, `{ sense: 'traps' | 'magic', feet }` (`schema.js` `STEPS`, its lint and its closed key lists, with a `step.feet` homebrew range of 5 to 240; `reader.js`; `effects.js`; `sense` in `engine/world.js`, lent through `KIT`). It changes no state. It works out what the caster would sense and sends it to the DM as a `manual` event with `partial: true`, which `view.js` never sends a player. Traps: a map object with a trigger that has effects and fires from the object's present state, in line of sight (`clear`) and within `feet`, described by the kinds of danger its effects hold (damage types, a fall, a condition, or "a danger of another kind" for a manual step). Each trap is one line, sorted by its words: no place, no distance and no map order. Magic: magic items on a creature's sheet or in a pile, and spells running on a creature (named with their school), within `feet` and not behind total cover, with the distance in feet.

**Found.** `view.js` has `note` in `AS_IS`, so a `note` goes to every player: a caster-only line cannot be a note. There is no event only the caster's player may be sent, and adding one means a new case in `view.js` and a class for who the caster's side is. The DM-only `manual` event is what the engine already has, so the spell hands the finding to the DM, who tells the player ("The DM tells the player" was already the SRD-honest wording of the old entries).

**What players are sent.** Nothing new. The cast is sent as any cast is, with the spell's own `manual` text (which names no trap and no item). The twin tests send the same cast with a hidden trap in range, with one behind a wall and with none, and with a hidden creature carrying a magic item within 30 feet and with none, and every byte a player receives is the same.

**Decisions.** Knock stays `manual`: no spell target names an object, and aiming an effect at one needs a new target kind, a choice in `cast` of which object, and a state change for a lock that the objects' own `use` list has no name for (an unlock needs a key); it is a spec of its own (W54). Find Traps counts a trap only while it can still hurt (a sprung or wedged one is not sensed; a pit already open is). A trap behind total cover or farther than 120 feet is not sensed. A pressure plate is a trigger and not a danger of its own, so it is left to the DM. Detect Magic looks once at the cast; the engine does not watch the 10 minutes for magic that arrives, and the thickness of a wall is the DM's (the engine stops at total cover). Both spells keep a `manual` step that says what the engine leaves, and it is the spell's, so everyone sees it.

#### Build notes: wave 4 part 3 (amendment, #786)

Tests in `packages/rules/test/wave4p3-spells.test.js` and one twin scenario in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (True Seeing 31829: level 6, Action, touch, 1 hour, a willing creature has Truesight 120 feet; Heroes' Feast 27962: level 6, 10 minutes, Self, Instantaneous, a feast for up to twelve that takes 1 hour to eat, then for 24 hours Resistance to Poison damage, Immunity to Frightened and Poisoned, Hit Point maximum up 2d10 and as many Hit Points; Greater Restoration 27660: level 5, Action, touch, Instantaneous, one of: 1 Exhaustion level, Charmed or Petrified, a curse including Attunement to a cursed item, a reduction to an ability score, a reduction to the Hit Point maximum).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| True Seeing | manual | assist | the rest of Truesight: the Ethereal Plane, a shapechanger's true form, seeing through magical transformations and illusions; that the target is willing |
| Heroes' Feast | manual | assist | applies the same to up to eleven other creatures (each rolls 2d10), lets the hour of eating pass before the benefits "set in" (the engine starts the 24 hours at the cast), ends them on anyone who did not finish |
| Greater Restoration | manual | manual | everything (W56) |

**Added.** (1) A modifier hook `senses`: a modifier step `{ on: 'senses', op: 'set', value: <5 to 240 feet>, scope: { sense } }` (`schema.js` `HOOKS`, `scope.sense`, its lint, a range of -120 to 120 like a speed's; `reader.js`), read by `sensesOf` in `modifiers.js`: a creature's own senses, and for each sense the longer of that and any lasting effect's. `sight.js` (`sees`) and `vision.js` (`seesPlace`, Blindsight past a curtain, and the cache signature) read senses through it, so Truesight lent for an hour acts as the creature's own Truesight does. (2) In `engine/rolls.js` `modifier`, an `hp.max` `add` whose value is dice is rolled once for the creature and the number is what the part keeps (so ending the effect takes back what was given).

**Found.** `sees` already reads `viewer.senses`, so the only change to sight is where senses come from. The party shares what one member sees, as with any Truesight, so a player's table is sent an Invisible creature in range once any party member has the spell; a twin test pins that before the spell the bytes equal a bare cell's, and that after it the creature is described to the player exactly as it is when See Invisibility gives the sight.

**What players are sent.** Nothing new: the cast and a lasting effect as for any spell, `maxHp` for Heroes' Feast, and, for True Seeing, what the existing sight rules give a Truesight creature (an Invisible creature in range, and sight in darkness).

**Decisions.** Heroes' Feast: Range is Self, so the engine can aim it at the caster only (a spell's reach for creatures is its range; Self is 0); the other eleven are the DM's, in the spell's `manual` step. Its `duration` is "24 hours" though the SRD says Instantaneous, because the benefits are what lasts and a lasting effect is the only thing that holds a modifier. The hour of eating is the DM's: the engine has no way to start an effect later. Greater Restoration stays `manual`: a cast `choice` offers one value of one list, and `chooseIn` (`engine/casting.js`, not in this job's files) fills in a step for a `condition` or `curse` only. Charmed and Petrified could be ended by the `cure` step as Lesser Restoration does, but a choice limited to them would stop the caster using the spell on Exhaustion, a curse, an ability score or the Hit Point maximum, which the engine cannot end (an Exhaustion level is lowered only by rests; Bestow Curse's lasting effect has no step that ends it; the engine keeps no reduction to an ability score or Hit Point maximum other than lasting modifiers).

#### Build notes: wave 4 part 4 (amendment, #786)

Tests in `packages/rules/test/wave4p4-spells.test.js` and one twin scenario in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (Teleport 31433: level 7, Action, 10 feet, V, Instantaneous, the caster and up to eight willing creatures it can see within range, or one Large or smaller object, to a known destination on the same plane; the Teleportation Outcome table 31451: Very familiar 01-05 Mishap, 06-13 Similar Area, 14-24 Off Target, 25-00 On Target; Seen casually 01-33, 34-43, 44-53, 54-00; Viewed once or described 01-43, 44-53, 54-73, 74-00; False destination 01-50 Mishap, 51-00 Similar Area; a permanent circle and a linked object 01-00 On Target; a Mishap is 3d10 Force damage to each traveller and a reroll; Off Target is 2d12 miles away in a direction rolled on 1d8, 1 east through 8 northeast; Water Breathing 32172: level 3, Action or Ritual, 30 feet, 24 hours, up to ten willing creatures breathe underwater and keep their normal breathing; Water Walk 32185: level 3, Action or Ritual, 30 feet, 1 hour, up to ten willing creatures move across any liquid surface as if it were harmless solid ground, a Bonus Action to pass into the liquid and back).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Teleport | manual | assist | the other travellers (up to eight creatures, or an object): the engine moves the caster alone, and applies the Mishap damage to the caster alone; a Similar Area or Off Target arrival (the engine rolls the miles and the direction and tells the DM); any destination not on this map, and the familiarity itself (the caster says it) |
| Water Walk | manual | assist | liquids that are not a water tile of the map (acid, mud, snow, quicksand, lava and the heat of lava); the Bonus Action to pass into the liquid and back; a creature left standing on water when the spell ends |
| Water Breathing | manual | manual | everything (W57): the engine keeps no breath and no drowning |

**Added.** (1) A modifier hook `surface`: a modifier step `{ on: 'surface', op: 'immune', scope: { surface: 'water' } }` (`schema.js` `HOOKS`, its lint, `scope.surface`; `reader.js`), read by `walksOn` in `modifiers.js`. In `engine/world.js` `moveOptions` a creature that walks on water treats a water tile as ground of normal cost, to cross and to stop on (a Monk's Acrobatic Movement, which may cross but not stop, is unchanged). (2) A choice `familiarity` (`schema.js` `CHOICES`, the list `FAMILIARITY`: permanent circle, linked object, very familiar, seen casually, viewed once or described, false destination) and a field on the teleport step, `familiarity: 'chosen'` (`schema.js`, `reader.js`, `engine/casting.js` `chooseIn`). `effects.js` holds the SRD's table as `TELEPORT_TABLE` (the highest d100 roll that is a Mishap, a Similar Area and an Off Target outcome, for each familiarity). A teleport step with it rolls 1d100 for the caster: a Mishap puts a 3d10 Force damage step on the stack for the caster and rolls again (so many Mishaps, each its own damage); On Target moves the caster to the space the cast named, by the same teleport as Misty Step (`kit.teleport`); Similar Area and Off Target move nobody. With no space named, nothing is moved on any result. The roll and its outcome are one DM-only note (`manual` with `partial: true`).

**Found.** The map has no water the engine lets a creature stand in: a water tile costs `Infinity`, and `moveOptions` has one exception, the Acrobatic Movement crossing. Water Walk reuses that exception and lets the walker stop, so the engine needs no swimming for it. The teleport step moves its target to a space on the same map within `step.teleport` feet (at most 1000, which is what the schema allows); the engine has no second map to send a creature to in a spell (`enter`, `leave` and `goTo` are the DM's and a party's travel). Teleport therefore reaches a place on the map in play, and any other place is the DM's.

**What players are sent.** The cast and its own `manual` text as for any spell; on On Target the caster's `moved` event as for Misty Step; Mishap damage as any damage. The outcome note (the table row, the roll's result, the miles and the direction) is `partial` and never sent. On Mishap the caster's player is sent the damage (3d10 Force, once for each Mishap) and nothing else; on Similar Area and Off Target the caster stays where it is and the player is sent no event but the cast, so the DM's placing of the group is what the player then sees. A creature the party does not know of standing on the destination: as for every teleport (the amended teleport rule above, Misty Step included), the caster arrives as intended and shares the space; the DM alone is told and decides where each ends up. A player is sent exactly what a bare cell gives (twin tests for Teleport and Misty Step with the hidden creature on the landing; forcing the old nearest-free-space landing makes both fail). The twin tests cast Teleport with a hidden creature near the destination and with none, for a permanent circle (On Target) and a false destination (Similar Area), and every byte a player receives is the same in both worlds and holds no word of the outcome.

**Decisions.** Teleport is `assist` and not `auto`: the engine moves and hurts the caster only. The other travellers are "up to eight willing creatures that you can see within range": the spell is aimed at its caster (the teleport step is for a spell aimed at its caster, `schema.js`) because moving several creatures to spaces around the destination, each by its own occupied-space rule, is a design of its own; the spell's `manual` step names them and says each takes the same Mishap damage. The caster names the familiarity because the engine has no memory of what the caster has seen (W57); the table is the SRD's. Water Walk lets the walker stop on water for the hour; when the effect ends the creature is in the water and the engine has nowhere to put it (the board's item "swimming" waits on the owner), so the DM places it (W57). Water Breathing stays `manual`: nothing in the engine keeps breath, holds a creature's breath underwater or drowns it, so a lasting effect that carried no modifier would be a label that does nothing. `checked: true` on all three after comparing every field with the text above.

#### Build notes: wave 4 part 5 (amendment, #786)

Tests in `packages/rules/test/wave4p5-spells.test.js` and one twin scenario in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (Feather Fall 26756: level 1, Reaction, which you take when you or a creature you can see within 60 feet of you falls, 60 feet, V and M, 1 minute, up to five falling creatures within range, rate of descent slows to 60 feet per round until the spell ends, a creature that lands before it ends takes no damage from the fall and can land on its feet, and the spell ends for it).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Feather Fall | manual | assist | a fall of more than 60 feet: the engine lands the creature at once (a fall is instant in it), so the DM plays out the rounds of the descent; "can land on its feet" is the engine's own result (no damage, not Prone) |

**Added.** A reaction trigger `fall` (`schema.js` `REACTION_TRIGGERS`; `reader.js` `REACTION_WORDS`). A reaction spell with it may be aimed at up to five creatures (the lint's count limit is 5 for `fall`, 1 for `cast` and `damaged`). The engine's `fall()` (`engine/resolve.js`; every fall passes through it: pits, deep pits, the gravity pass, a mount's) calls `featherFall` just before it rolls the damage, for a fall of 10 feet or more by a creature that is not dead. `fall()` takes the place the fall began (`from`) so that range and sight are worked out from there, and not from the floor below that a deep pit has already put the creature on. `castReaction` no longer adds the spell's own tier note when its steps already handed the DM a `manual` note of that spell's name.

**How it is set.** By standing instruction, like Shield, Counterspell and Hellish Rebuke (Decision 4, stage A): the reaction `feather-fall` on the caster, `never` (the default, because it spends a slot), `always`, or `ask` (a player is asked which slot; for the DM's creature the DM is told with a `manual` event and nothing waits). A caster qualifies if it is the faller or not hostile to it, has a Reaction (`canReact`), a slot (`slotsFor`: Silence, one slot a turn, Verbal), and the faller is within 60 feet and seen (`seesFor`: the sight code, and never a creature the party does not know of). The first caster in the order of the creatures that qualifies casts it.

**What the engine does.** The Reaction and the lowest slot (or the chosen one) are spent; the spell's lasting effect is made and ended at once on the landing (`effectEnd`, why `landed`); the creature falls to where the fall would have put it, with no damage and not Prone (`fell` with `slowed: true`). One cast covers the other creatures that fall in the same action (a Fly that ends on two creatures, a pit under a group) until five are covered: the caster's `cast` event lists them in `targets`, and each is range- and sight-checked on its own. The spell's note tells the DM that a fall of more than 60 feet would take rounds.

**What players are sent.** The `reaction`, `cast` and `fell` events as for any reaction and fall; `fell` is sent to players as it was (`AS_IS`), and the cast's `targets` are filtered of creatures the party does not know of. A creature the party does not know of is never seen by a party caster (`seesFor`), so it sets nothing off, and a hostile creature is never covered. A caster the party knows of (a foe in plain view, say) also never reacts for a faller the party does not know of, whoever its side: its `reaction` and `cast` would tell the players of it. Nor does a caster the party does not know of react for a faller it does know of: the fall doing no harm would tell the players something is there (lead, after the second review). So a caster reacts for another creature only when the party knows of both or of neither; a hidden caster may react for a hidden faller, and its events are sent to nobody. The twin scenarios (a floor taken away under a creature) are a visible foe caster with a hidden ally that falls, a hidden caster with a visible ally that falls, and a hidden caster with a hidden ally, each against a world without the hidden creature; dropping either half of the rule makes one of the first two fail.

**Decisions.** Assist, not auto: the descent over 60 feet per round is not modelled. A creature that falls "far enough to be hurt" (10 feet) is the trigger, because nothing less is a fall the engine rolls. Only allies and the caster can be covered (the engine does not cast it on a foe's fall; the SRD allows any creature the caster can see). `checked: true` after comparing every field with the text above.

**Range and sight.** `fall()` takes `from`, the place the fall began, and the pit branch, the surface branch and `drop()` pass it. The gravity pass in `engine.js` (a Fly Speed ending, a floor removed) calls `fall()` after moving the creature and does not (W58).

#### Build notes: wave 4 part 6 (amendment, #786)

Tests in `packages/rules/test/wave4p6-spells.test.js` and one twin scenario in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (Knock 28415: level 2 Transmutation, Bard, Sorcerer, Wizard, Action, 60 feet, V, instantaneous; an object the caster can see within range, such as a door, box, chest, manacles or padlock, "that contains a mundane or magical means that prevents access"; a target held shut by a mundane lock or that is stuck or barred becomes unlocked, unstuck or unbarred, and with several locks only one is unlocked; held by Arcane Lock, that spell is suppressed for 10 minutes; a loud knock audible up to 300 feet comes from the target).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Knock | manual | assist | the loud knock (who hears it); Arcane Lock (a spell the engine does not model) suppressed for 10 minutes; a stuck or barred object (the object definitions have no such state); which lock opens when an object has several (an object has one lock) |

**Amendment: a spell target of a map object.** A spell's `target` may now be `{ object: {} }` (`schema.js` `lintTarget`, its closed key lists; a spell only, never a monster's action or a feature's). Its profile aim is `object` (`effects.js` `spellProfile`). `cast` takes the object's id in `object` (a string), and `aimObject` (`engine/world.js`) checks it before anything is spent, in this order: (1) `objectOf` with the sender's role: an id that names no object and one the party does not know of (an undiscovered secret door, an object in a place not yet shown or, under the `los` and `light` rules, out of the party's view and memory) are both refused with `No such object.`, so a refusal never tells a player a thing is there; the DM names any object; (2) the caster is not Blinded; (3) some hex of the object is within the spell's range (60 feet) of the caster, in feet, with the object's own words in the error; (4) the caster has a clear line to it (`clear`, the test `findable` uses; a door's own closed line does not hide the door from its near side); (5) the object can be locked at all: its definition has a use named `unlock`, so a lever or a torch is refused. The object's id goes on the `cast` event (`object`) and into the steps' `src.object`, where the existing `set` step already reads it for traps. The spell's steps run with the caster as the creature they are aimed through, as a spell aimed at its caster does, so no creature is revealed or touched.

**Amendment: `from` on the `set` step.** `{ set: 'closed', of: 'self', from: 'locked' }`: the object is set only if it is in the state `from` (`schema.js`, key lists; `reader.js`; `engine/world.js` `objectStep`, which answers `'idle'` for an object in another state, and `effects.js`, which then tells the table `nothing is held shut that it can open`). An open door is not closed by Knock. The `set` step's own state must still be one the object has; every locked object of `objects.js` (the wooden and iron doors, the chest) goes from `locked` to `closed`, which is what its `unlock` use does without a key.

**What the engine does.** A locked object in range and sight goes to `closed`, with the objects linked to it (`links`) set as `setObject` always does; the slot and the action are spent; the `object` event is sent to the players as any object event is. An object that is not locked is left as it is and the cast is still paid for (SRD "Invalid Targets": nothing happens, the slot is spent). The key, the pick and force DCs are not touched: Knock is none of those.

**What players are sent.** The `cast` event as for any cast (the player view's `cast` fields leave out `object`, so the id is not sent in it), the `object` event as for any object the party knows of, and the note when nothing was held shut. The spell's own `manual` step (the knock, Arcane Lock, stuck and barred, several locks) is the spell's, so everyone sees it; it names nothing hidden. The twin test casts at an undiscovered secret door in one world and at nothing in the other (a secret door stands in a wall, so the other world has the wall): the refusal and everything a player is sent are the same, and a second cast at a known locked door in the same script is unlocked in both.

**Decisions.** Assist, not auto: the engine has no sound (the knock and who hears it are the DM's), no Arcane Lock (the spell is `manual`; Knock's own text hands the suppression to the DM), no stuck or barred state, and one lock per object. Sight is geometry and Blindness; the engine does not judge darkness or an Invisible or hidden object here (W59). `checked: true` after comparing every field with the text above.

#### Build notes: wave 4 part 7 (amendment, #786)

Tests in `packages/rules/test/wave4p7-spells.test.js`. No twin scenario: the spell adds no state a player might not see (a cure and a lasting effect that ends on a creature the party can touch; the same events as Lesser Restoration and a Bestow Curse that ends). Numbers compared with `reference/srd52/srd52-flow.txt` (Greater Restoration 27660 and the list at 27595: level 5 Abjuration, Bard, Cleric, Druid, Paladin, Ranger, Action, touch, V S M diamond dust worth 100+ GP which the spell consumes, Instantaneous; one of 1 Exhaustion level, the Charmed or Petrified condition, a curse including the target's Attunement to a cursed magic item, any reduction to one of the target's ability scores, any reduction to the target's Hit Point maximum).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Greater Restoration | manual | assist | any curse other than a Bestow Curse effect, and the Attunement to a cursed item; a reduction to an ability score and a reduction to the Hit Point maximum (the engine keeps neither); the diamond dust (the spell is `costly`, and no spell's Material cost is taken from a purse) |

**Amendment: the `affliction` choice.** `CHOICES.affliction` (`schema.js` `AFFLICTIONS`): `exhaustion`, `charmed`, `petrified`, `curse`, `ability-score`, `hit-point-maximum`. The caster names one in `choice` when casting, checked before anything is spent (`engine/casting.js`; a refused cast changes nothing). `ifChoice` is now for a spell whose choice is of a curse or an affliction (`lintChoice`, `lintSteps`, `reader.js` `choiceOf`), and `chooseIn` removes the steps of the other values and strips the key for either (it did so for a curse alone). The reader says which affliction it ends. The client's cast menu already lists a choice from `CHOICES`, so it needs no change.

**Amendment: two words for the `cure` step** (`schema.js` `CURE_WORDS`; `engine/rolls.js` `cure`). `exhaustionLevel` lowers the target's Exhaustion by one level, and ends the condition at level 1, as a Long Rest does (a creature with none is passed over). `curse` ends one lasting effect on the target whose spell has a choice of a curse (Bestow Curse with a part on the target, not ended; the oldest when two casters cursed it: the SRD says "a curse"), whole, with everything it put on anyone, as `endEffect` does; `endEffect` is the way a lasting effect ends elsewhere, so the caster's Concentration on it goes with it. Other `cure` steps are as before: a condition, or `chosen`; `exhaustion` as a condition is still refused by the linter, and `cure` called with it (a creature made immune to it) still ends it whole.

**Decisions.** Assist, not auto: Exhaustion, Charmed, Petrified and a Bestow Curse effect are the engine's; a reduction to an ability score or the Hit Point maximum is not kept anywhere (only lasting modifiers are), and a curse the engine does not keep, or an Attunement to a cursed item, is the DM's, so those options are `manual` steps chosen by the same choice, and the curse option adds one `manual` step for what the engine cannot see. A step with no ending to run is never approximated. A lasting reduction made by a modifier (a hit point maximum or ability score that a spell's `modifier` lowers) is not ended by this spell: the DM ends that effect with `endEffect`. `checked: true` after comparing every field with the text above.

#### Build notes: wave 4 part 8 (amendment, #786)

Tests in `packages/rules/test/wave4p8-spells.test.js`, and three twin scenarios at the end of `packages/server/test/twin-worlds.test.js` ("leap: ..."). Numbers compared with `reference/srd52/srd52-flow.txt` (Jump 28399: level 1 Transmutation, Druid Ranger Sorcerer Wizard, Bonus Action, Touch, V S M a grasshopper's hind leg, 1 minute, no Concentration, "once on each of its turns until the spell ends, that creature can jump up to 30 feet by spending 10 feet of movement", one more creature per slot level above 1; Long Jump 33774: up to Strength in feet with at least 10 feet of movement immediately before, half standing, each foot costs a foot, DC 10 Dexterity (Acrobatics) or Prone on landing in Difficult Terrain, the low-obstacle Athletics check at the GM's option).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Jump | manual | auto | the low obstacle check; a leap between levels, a High Jump |

**The action `leap`** (`engine/movement.js` `leapOn`): `{ type: 'leap', id/actor, to: { q, r }, spell?: true }`. Named `leap` because `jump` is the travel action between pins (`engine/travel.js`, `known.js`). One leap is a one-step walk to the landing hex, so `walk`'s own pieces do the rest and are not copied: Opportunity Attacks for leaving a reach (Disengage prevents them; Flyby), the budget spend, noticing, a fight starting, what is on the landing hex (`trip`: traps, pits and their falls; `stepped` and `entered`: zones), the party following. The hexes between are only passed over: nothing on them fires, creatures on them do not block, nothing hidden on them is found. The history label is `{who} leaped`.

**Distance.** Strength in feet with a running start, half that standing, both rounded down to whole 5 feet (Strength 15: 15 ft running, 7 standing so 5 ft; 14: 10 ft). In a fight a running start is 10 feet of the turn's movement used since its last leap (`flags['leapm:<id>']` holds the movement used after the last leap; the used feet are Speed times Dashes less what is left); outside a fight it is always, and no movement or flag is spent or kept. Each foot costs a foot of movement in a fight; a leap the movement left cannot pay for is refused in the words `move` uses (`Too far. X has N ft of movement left.`) before anything changes. A leap beyond what it could make says how far it can (`Too far: X can leap 5 ft from a standing start. With a running start ... 15 ft.`), which depends on nothing hidden.

**The Jump spell** lends the hook `leap` (`{ on: 'leap', op: 'set', value: 30 }`, a modifier step; schema lint: `set`, a multiple of 5 from 5 to 40, no other key; `modifiers.js` `leapOf` reads the longest). While it lasts, once on each of the creature's turns (`flags['leaps:<id>']`, cleared with the turn's flags) a leap may go up to that far for 10 feet of movement, running start or not. The creature chooses with `spell: true` (the spell's leap: refused if there is none, or it is used this turn); without it the engine takes the **cheaper legal way** (the ordinary leap where its feet cost 10 or less, otherwise the spell's), and a tie goes to the ordinary leap so that the once-a-turn use is kept for a leap only it can make. Outside a fight the limit is the longer of the two and nothing is counted. The Ring of Jumping's activation (`{ spell: "jump", self: true }`) casts the same entry on its wearer and so lends the same hook (`item-use.test.js` now expects no manual step); its own `tier` and `text` in `magic-items.js` still say "the DM applies it" (DEBT W61).

**The line and the landing.** A wall or a shut door across the straight line between the two hex centres refuses the leap with `A wall or a shut door is in the way.`; a secret door is a wall to everyone (`barriers`), so the same words are said whether or not the party knows of the door. The landing is on the same level and within a step of the creature's height (`A leap stays on one level`); no floor there is `There's nothing there to stand on.` as for a move. A creature the party knows of on the landing hex refuses the leap (`That hex is occupied.`) before anything is spent. One it does not know of (the DM's hidden creature outside a fight, a creature hiding, or one unseen under the los rules) is judged as `move` judges it: the leap is legal and costs as if it were not there, then stops in the last free hex of the line before it (cost and Opportunity Attacks of that shorter leap) and finds it; with no free hex short of it the creature does not leap and finds it. Landing in Difficult Terrain (a tile of cost 2, or ground a spell made difficult; not for a creature with Freedom of Movement) rolls DC 10 Dexterity (Acrobatics) with a `check` event, and a failure gives Prone. A mounted or ridden creature, a Prone one, one that holds another, a flyer and one with no Strength score are refused.

**Decisions.** `leap` is not in `UNLOCKED` (shared.js): a command-locked creature only Dodges and moves to avoid harm, and a leap is a deliberate act beyond that. No new event kind: the walk's `moved` event and a `note` (the DM's creature's, a `manual`) say what happened. No state shape change (flags are the turn's own; state version stays 31). The hook is not in the sample pack: `dryrun.test.js` checks step kinds and the pinned hashes of `homebrew-subclass.test.js` are unchanged. Existing tests changed: `wave4p1-spells.test.js` (Jump's tier is `auto`) and `item-use.test.js` (Ring of Jumping: no manual step now, a Jump effect instead).

**Twin tests.** A hidden creature, a hidden spiked pit and an undiscovered pit-trap on hexes a leap passes over: players are sent the same bytes as with a bare cell. Each was checked by opening the leak on purpose (a leap refused when any creature or object stood on the line): all three twins failed on the first leap (`update` against `error`); with the leak taken out again they pass.

#### Build notes: wave 4 part 9 (amendment, #786)

Tests in `packages/rules/test/wave4p9-spells.test.js` and one twin scenario in `packages/server/test/twin-worlds.test.js` ("stone shape: ..."). Numbers compared with `reference/srd52/srd52-flow.txt` (Stone Shape: level 4 Transmutation, Cleric, Druid, Wizard, Action, touch, V S M, instantaneous; a stone object of Medium size or smaller or a section of stone no more than 5 feet in any dimension, formed into any shape, e.g. a weapon, statue, coffer, a small passage through a 5-foot-thick wall, or a door shaped shut; up to two hinges and a latch, nothing finer).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Stone Shape | manual | assist | any shape but a passage; whether the wall is stone (the engine keeps no wall material) |

**Amendment: a spell target of a wall.** `target: { wall: {} }` (`schema.js` `lintTarget`; a spell only, with a `cut` step), profile aim `wall` (`effects.js`). I chose a **point in map feet**, not a hex edge: walls are free line segments (`walls.js`), so `cast` takes `wall: { level, x, y }`. `aimWall` (`engine/world.js`) checks before anything is spent, in this order: (1) a point within 1 foot of a wall segment on that level (the map's walls, and an undiscovered secret door, which every player is sent as a plain wall and so is a wall here too); a player must also have a sent tile within the hex corner reach of the point (the test `view.js` `clipWall` applies, so exactly the wall pieces a player is sent); no wall at all and an unknown wall both give `No such wall.`; the DM names any; (2) the caster is not Blinded; (3) touch: the point is within the spell's range (5 feet) of the caster's space, on the caster's level; (4) the segment's kind is `wall` (a window, rail or curtain is refused in its own words). A malformed pick (`Pick a point on a wall`) depends on nothing hidden. The point goes on the `cast` event (`wall`, which the player view leaves out) and `src.wall`.

**Amendment: the `cut` step** (`{ cut: 5 }`, 5 or 10; `HOMEBREW_RANGES` `step.cut`). `cutWall` takes a window of that many feet along the aimed segment, centred on the point and moved to lie inside the segment (a cut near an end is still a whole 5 feet; a segment of 5 feet or less goes whole). Other `wall`-kind segments and undiscovered doors on the same line that overlap the window are cut with it; what is left of one is a wall of its own (the first piece keeps the id). The change is made by `editMap` (`engine/world.js`), the body of the DM's `mapEdit` moved out of `dm.js` so both call one path: a copy, `lintMap`, the nowhere-to-stand check, `lookAround`; the `mapEdit` event is sent as for a DM edit. `cutWall` is in the `KIT` literal of `resolve.js` (one line, allowed by the lead). Vision updates by the ordinary rules.

**Amendment: `CHOICES.shape`** (`passage`, `other`; `ifChoice` now also for a shape choice; the reader has `SHAPE_WORDS`). `other` runs only a `manual` step for everyone and names no wall: the cast names none and none is aimed.

**Hidden things.** An undiscovered secret door in the cut stretch is cut away with the wall (its uncut part becomes plain wall); the DM alone is told (a `partial` manual note, with the note that the engine does not know the wall's material and the DM undoes the cut if it is not stone). Players are sent the same as for a plain wall: the twin test casts at a secret door in one world and a wall of the same shape in the other, with a refusal first. A hidden creature beyond is seen through the gap only by the ordinary vision rules.

**Dry run and the sample pack.** `dryrun.js` gives a `wall` spell a long wall beside the caster (through `mapEdit`) and the first shape. The sample pack gained Stone Door (a `cut` step), so the pack has 20 spells and `homebrew-subclass.test.js` was re-measured (player hash `dadf6727e9` to `9665481789`, whole-pack `e714081f2b` to `01489c0191`).

**Existing tests changed:** `dryrun.test.js` (spell cap 19 to 20), `hb-cli.test.js` (20 spells), `homebrew-subclass.test.js` (hashes), `reader.test.js` (a `wall-gap` golden fixture and `reader-golden.txt`), `reader-kinds.test.js` (`cut` is spell-only), `apply-terrain.test.js` (the map-edit path is in `engine/world.js`).


#### Build notes: wave 4 part 10 (amendment, #786)

Tests in `packages/rules/test/wave4p10-spells.test.js` and the "meld into stone" scenarios in `packages/server/test/twin-worlds.test.js`. Numbers compared with `reference/srd52/srd52-flow.txt` (Meld into Stone: level 3 Transmutation, Cleric, Druid, Ranger, Action or Ritual, touch, V S, 8 hours; no sight outside and Disadvantage on Wisdom (Perception) checks to hear; spells on itself; leaves with 5 feet of movement, which ends the spell; partial destruction or a change of shape expels it with 6d6 Force damage, complete destruction or transmutation with 50; expelled into the nearest unoccupied space, Prone).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Meld into Stone | manual | assist | whether the wall is stone and large enough; Truesight and other senses; the "to hear" limit of the Perception Disadvantage; any damage or destruction of the stone other than a Stone Shape cut (6d6 / 50 Force) |

**The aim** is Stone Shape's: `target: { wall: {} }`, `aimWall` with the same refusals and words (casting.js lets a spell with a `cut` or a `meld` step aim at a wall). **The `meld` step** (`{ meld: true }`; schema, reader, `effects.js`; spell only, target a wall) calls `meldInto` (resolve.js, `KIT`): the caster gets `melded = { fx, level, x, y, at }` (the effect that holds it, the aimed point, the space it entered from; its `pos` stays at `at`), loses its `hiding`, stops following, and the effect gets a part `{ target, meld: true }`. The spell's data also holds a `modifier` step, Disadvantage on `check` with `scope.skill: perception`, and a `manual` note. The effect is an ordinary 8-hour one (no Concentration). `melded` is a new creature field, classified `sent` in `view-fields.js` (a creature of the party is known to its party; a foe's record is never sent). No state version bump (the field is optional).

**Occupancy and being found.** `living(s)` (engine/shared.js) leaves a melded creature out, so every place that asks "who is there" (occupancy by `overlapAt`, placing, area and creature targets, Search, the AI's lists, cover, `lookAround`) does not see it; what must still reach it goes by `s.entities` (its turn, its effects, ending the spell). Also: `sees` (sight.js) says no in both directions; vision.js leaves it out of the party's eyes and of `partyView`, and `unknown` is true for a foe; `classify` (view.js) says `hidden`; `holds` (zones.js) puts it in no zone; `creatures()` names it with the words for an id that is no creature; `ai.js` never picks it and a melded creature's turn only passes; a creature merged with stone reacts to nothing (attacks.js). A fight's start leaves a melded foe out of the order (`startEncounter`), as it would a creature it does not know of: it would otherwise take dice the other table never rolled; a melded creature of the party takes its place.

**One refusal.** `control` (shared.js) refuses every action but `cast`, `unmeld`, `endTurn`, `check`, `reactions`, `react` and `companion` from a melded creature with one message. `castSpell` refuses any spell not aimed at itself (`self`, or a `creature` spell whose every target is the caster) with another, before anything is spent; a mounted caster, or one with a rider, cannot cast Meld.

**Leaving: a new action `unmeld`** (casting.js; history label `left the stone`), not `endEffect`: `endEffect` is the DM's and Concentration's way and has no movement to pay, so a player's `endEffect` on a Meld effect is refused (`use unmeld`), the DM's works and costs nothing. `unmeld` costs 5 feet of movement on the creature's turn in a fight (refused out of turn, or with less left, nothing changed) and nothing outside one. Every way the effect ends (leaving, time, Dispel Magic, the DM, the expel) runs `ON.meldEnd` (durations.js `endPart`, set by resolve.js): the creature comes out through `teleport`, so at `at` or the nearest unoccupied space by the rules of any arrival (a creature standing there that the creature's side does not know of is shared with, and told to the DM), not Prone, no damage. One a foe that the party does not know of comes out does not join the fight's order (that would reveal it); the DM is told.

**Expelled.** `cutWall` now returns the stretch it took out; `effects.js` passes it to `expelMelded` (resolve.js, `KIT`): a creature merged at a point within 2.5 feet of that stretch is thrown out: the effect ends, it comes out as above, and it is made Prone and takes 6d6 Force damage (Prone first, so one the damage drops is Prone too). Any other damage or destruction of the stone is the DM's, said in the spell's manual note.

**Twins.** (a) A foe the DM hid, merged beside the party, against no creature: the party walks onto its space, Searches, casts an area spell over it, and it leaves by the DM's `endEffect`: the same bytes in both worlds for both players. (b) The same with a foe the DM never hid (it is the merging alone that keeps it from them), and under the `los` and `light` sight rules. (c) A party member merged against one that stepped out of view is compared (rules test) only for what the other player is sent of creatures outside the party and the party's sight; the wizard's own record differs on purpose. Leaks forced open and confirmed to fail: `living` keeping the merged creature (twin fails), `classify` (twin fails), a melded foe taken into a fight's order (twin fails), the exit joining the fight (twin fails); in the rules test: eyes, `partyView`, `sees`, `creatures()`, `control`, zones and the AI. `unknown`'s melded clause is defence in depth: removing it alone fails nothing, because `classify` and `partyView` already say it.

**Dry run and the sample pack.** The sample pack gained Stone Merge (a `meld` step), so it has 21 spells and `homebrew-subclass.test.js` was re-measured (player hash `9665481789` to `2813f27dcf`, whole-pack `01489c0191` to `66e4281a17`). `dryrun.js` needed no change (it already gives a wall spell a wall and a point).

**Existing tests changed:** `dryrun.test.js` (spell cap 20 to 21), `hb-cli.test.js` (21 spells), `homebrew-subclass.test.js` (hashes), `reader.test.js` (a `stone-hide` golden fixture and `reader-golden.txt`), `reader-kinds.test.js` (`meld` is spell-only), `apply-terrain.test.js` (a script that merges and then `unmeld`s; the `gridOf` import), `wave4p9-spells.test.js` (the lint message now reads "has a `cut` step (or a `meld` step)"; the test itself is unchanged).

**Files outside the issue's list, edited with a reason.** `engine/shared.js` (`living` and `control`: the one place each of the above is decided), `zones.js` (`holds`), `history.js` (the label), `engine/attacks.js` (one line). Not edited: `engine.js`, `tables.js`, the client.

#### Build notes: wave 5 part 1 (amendment, #786)

Tests in `packages/rules/test/wave5p1-spells.test.js` and two twin scenarios in `packages/server/test/twin-worlds.test.js` (Darkvision and Produce Flame). Numbers compared with `reference/srd52/srd52-flow.txt` (Darkvision 25808: level 2 Transmutation, Druid, Ranger, Sorcerer, Wizard, Action, touch, V S M a dried carrot, 8 hours, a willing creature has Darkvision with a range of 150 feet; Remove Curse 30214: level 3 Abjuration, Cleric, Paladin, Warlock, Wizard, Action, touch, all curses on a creature or object end, a cursed item keeps its curse but its owner's Attunement is broken; Produce Flame 29931: Conjuration cantrip, Druid, Bonus Action, Self, V S, 10 minutes, Bright Light 20 feet and Dim Light 20 feet more, ends if cast again, a Magic action to hurl fire at a creature or object within 60 feet, ranged spell attack, 1d8 Fire, +1d8 at levels 5, 11 and 17).

| Spell | Before | After | What the DM still does |
|---|---|---|---|
| Darkvision | manual | **auto** | nothing (that the creature is willing is the caster's choice) |
| Remove Curse | manual | assist | a curse the engine does not keep (only Bestow Curse is a lasting effect), and a cursed magic item's Attunement (the spell touches an object too) |
| Produce Flame | manual | assist | the hurl at an object; a caster who already carries a light; the damage dice are set at the cast |

**Darkvision.** One `senses` modifier, `{ on: 'senses', op: 'set', value: 150, scope: { sense: 'darkvision' } }`, as True Seeing's. `sensesOf` (modifiers.js) keeps the longer of the creature's own and the lent one, so a creature with Darkvision 200 keeps 200 and one with 60 gets 150. `sight.js` and `vision.js` already read it through `sensesOf`; nothing there changed. The lint cap for a `senses` value was 120 though its comment said 240: it is **240** (`lintModifier`), and `HOMEBREW_RANGES` has its own `senseModifier.value` of 5 to 240 (a speed's modifier stays at 120: `speedModifier` was shared with senses). The twin scenario: a creature in the dark 140 feet away is sent to the caster's player after the cast and to nobody before, and one at 155 feet, and one behind a wall, are sent as a bare cell is.

**Remove Curse.** A `cure` word `curses` (`CURE_WORDS`, `engine/rolls.js` `cure`): every lasting effect of a spell whose choice is of a curse that has a part on the target, each ended whole with `endEffect` (the caster's Concentration on it goes with it), re-read after each so one ending cannot leave another. `curse` (Greater Restoration) still ends the one, the oldest. The spell's `manual` step is kept for the cursed item and curses the engine does not keep. No twin scenario: nothing new that a player might not see (the same events as Greater Restoration's curse).

**Produce Flame.** The mechanism was there: Flame Blade's `arm` step (a lasting effect gives its caster one more action in `e.actions`, taken with `{ type: 'attack', attack: <spell id>, target }`, taken away with the effect). Two small extensions: `arm.range: <feet>` (5 to 120, a multiple of 5; `HOMEBREW_RANGES` `arm.range`) makes the action a ranged spell attack at a creature within that many feet instead of a melee one (`rolls.js` `arm`; schema, reader and the effects summary), and `scaleSteps` grows an `arm`'s damage by `higher.level` as a cantrip's damage (so 2d8 at character level 5, 3d8 at 11, 4d8 at 17, fixed at the cast). The light is the `light` step with `replaces: true`, which also ends the earlier casting ("the spell ends if you cast it again"), and so its hurl. **The hurl does not end the spell**: the issue said it does, but the SRD text has no such rule (the flame is hurled "until the spell ends", each Magic action), so the action stays for the 10 minutes. The Bonus Action is the cast; the hurl is the Action (Extra Attack does not apply to it), on the cast's turn or a later one. The twin scenario: the flame's 40 feet of light show a creature in the dark inside it to the caster's player, and one just past it is sent as a bare cell is.

**Existing tests changed:** none (a `homebrew-values` B1 test for senses was added; `reader.test.js` golden for every SRD spell passes with the new reader line for `arm.range`).
