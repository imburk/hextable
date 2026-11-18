# Spec: built spellcasters played by the AI cast spells

Status: draft by an agent (#483), to be reviewed by the design owner. Covers the debt line T62 (2): a built
spellcaster played by the AI never casts. Every rule below is from `reference/srd52/srd52-flow.txt`; line numbers
refer to that file. What goes beyond the SRD (the AI's choices stand in for a player's, so most of them do) is
marked **new rule**.

## Problem

1. **No spell logic for a built character.** `aiStep` (`packages/rules/src/ai.js`) plays a creature with
   `actions` (one made from a pack monster) through `withActions`, and one with flat `attacks` (a built or
   hand-typed character, a monster from an old save) through `withAttacks`. `withAttacks` reads `e.attacks` and
   nothing else: `e.spells`, `e.slots` and the creature's spellcasting are never looked at. Since #442 a caster
   with no weapon in reach punches a foe beside it with its Unarmed Strike, and otherwise ends its turn.
2. **Monsters are not the problem.** A pack monster's spell-like attacks (a Mage's Arcane Burst, a breath) are
   entries in `actions` and `withActions` already uses them. Its `Spellcasting` trait is text ("The DM casts
   these.", `monsters-h-o.js`), and stays the DM's (out of scope, below).
3. **Who is a built spellcaster today.** `addCharacter` and `setSheet` make only `kind: 'pc'`, `side: 'party'`
   creatures (`engine/characters.js`); the DM's `bond` refuses a character as a companion
   (`engine/companions.js`: "is a player's character and can't be a companion"); `spawn` makes creatures from pack
   monsters and summon blocks, which have no `spells`. So the creatures with a `spells` list are party characters:
   those with a player, and those with none (an ally the DM plays, the "built NPC" of the issue). A "sheet
   companion" cannot exist yet; if one is ever allowed it falls under the same rule through the companion brain's
   `free` mode, which calls the same functions (Decision 1).
4. **Nobody calls the AI for a character.** The DM's auto-play (`idled()` in `packages/client/app.js`) runs
   `aiStep` only when `cur.kind === 'npc'`. A character set aside with the table rule `standIn` ("the DM's screen
   plays them with the monster AI", `engine/dm.js`, `SETTING_TEXT.away.standIn`) starts its turn and waits: the
   stand-in exists in the engine (`step-away.test.js`, "standIn") but not on the DM's screen (DEBT T20 (1), "the
   stand-in run by the DM's screen").
5. **It plays on the true state.** `aiStep` reads the whole state. A party character played by it would act on
   creatures the party does not know of and on monster numbers players are never sent
   (`docs/specs/hidden-information.md`). The companion brain already solves this for a party companion
   (`knownTo` in `ai.js`); `aiStep` does not use it for an unbonded party creature.

## What the SRD says

| What | Rule (SRD 5.2.1) | Lines |
|---|---|---|
| Casting time | Most spells take the Magic action; some a Bonus Action, a Reaction, or 1 minute or more. | 23652-23656 |
| One slot a turn | "On a turn, you can expend only one spell slot to cast a spell": not a slot spell with the Magic action and another with a Bonus Action. | 23658-23664 |
| Reaction spells | Cast in response to the trigger in the spell's Casting Time entry. | 23666-23671 |
| Concentration | Starting another Concentration spell ends the first; damage calls for a Constitution save (DC 10 or half the damage); Incapacitated or dead ends it. | 32981-32998 |
| Ranged attacks in close combat | A ranged attack roll "with a weapon, a spell, or some other means" has Disadvantage within 5 feet of an enemy who can see you and isn't Incapacitated. | 2059-2066 |
| Falling Unconscious | At 0 Hit Points a creature is Unconscious "until you regain any Hit Points", and makes Death Saving Throws. | 2333-2337 |
| Death Saving Throws | Three failures and it dies; any damage at 0 Hit Points is a failure (two from a Critical Hit). | 2339-2361 |
| Healing Word | Bonus Action, 60 feet, a creature you can see regains 2d4 plus the spellcasting modifier. | 27911-27922 |

The SRD says nothing of how a creature someone else plays should choose. Everything in Decisions 3 to 7 is the
AI's choice, a **new rule**, written so that a player who comes back finds their character played the way a
careful, plain player would have played it.

## Goals

- A built spellcaster the AI plays casts its damage cantrips and levelled damage spells at foes, single targets
  and areas, catching no creature of its own side.
- It heals an ally at 0 Hit Points, and an ally (or itself) that is badly hurt.
- It never drops a Concentration spell it is keeping up.
- It spends spell slots by one plain rule, and keeps one for an emergency.
- The same state gives the same choice, with no dice and no clock: a recorded fight replays byte for byte.
- A party character played by the AI acts only on what the party knows, and uses no number players are not sent.
- The monster AI, for every creature with no `spells`, chooses exactly as it does now.
- No new state, no state version bump, no new content vocabulary in the first two stages.

Not in this spec: buffs and control (Bless, Hold Person, Shield of Faith) beyond naming what their stage needs
(Decision 8); Metamagic, Empowered Evocation and the other casting options; spells cast from items or through
features; summons, teleports and zones; anything outside a fight.

## The decisions

### Decision 1: who gets it

The casting AI plays a creature when all of these hold:

- it has a non-empty `spells` list and no `actions` (a built or hand-typed character; `makeEntity` gives every
  creature `spells: []`, so a pack monster never qualifies, and its play is unchanged);
- it is not in a form (`e.form`: the engine refuses a cast in Wild Shape, `engine/casting.js`), and not under an
  effect with `noSpells` (Rage);
- `aiStep` is called for it on its turn.

Who calls `aiStep` for a character is the DM's auto-play, and only for a character whose player is not playing it:

- **A character set aside under `standIn`** (`awayHow(s, e) === 'standIn'`): the player's own break, or the DM's
  `stepAway { actor, how: 'standIn' }`. This is the one way in for a character in the first stages.
- **A character with no player** (`owner` null, the DM's ally): the DM sets it aside under `standIn` to hand it
  to the AI, with the action that already exists. No new flag (question Q1).
- **Never a character whose player is present.** A character not set aside is its player's, or the DM's by hand;
  the auto-play does not touch it. A player who is offline is not a reason by itself: E20 says the hint on a lost
  link "must never act by itself" (DEBT T20), so the DM steps the character aside first.
- **A companion with spells** (none can exist today): the companion brain's `free` mode calls `withAttacks`, and
  so the casting below, with its `noAttack` limit (no spell with an attack roll, as `castSpell` already refuses).

`autoPlays(s, id, opts)` (ai.js) gains one case: a `kind: 'pc'` creature is auto-played exactly when
`awayHow(s, e) === 'standIn'`. The client's `idled()` drops its `cur.kind === 'npc'` test and asks `autoPlays`
alone (stage AC2). `aiStep` itself does not check who is present: it answers for whatever it is asked, as now
(the `standIn` test calls it directly).

### Decision 2: what it reads

- **A party creature reads what the party knows.** `aiStep` hands an unbonded party creature the same copy the
  companion brain uses, `knownTo(s, e)` (creatures `unknown` to the party are not in it). The move it already
  makes, and every target and area below, are worked out on that copy; a move onto a hidden creature is stopped
  and finds it by the engine's own rule (`walkKnown`, movement.js). A foe's caster (none today) reads the true
  state, as the monster AI does.
- **No monster numbers.** Players are not sent a monster's Armor Class, saving throw bonuses, Hit Points,
  resistances or immunities. The scores below use none of them, for any caster, so a party character's choice
  says nothing a player could not have known (question Q3). Targets are ordered nearest first, then by id; not by
  Hit Points, which `withActions` uses for monsters.
- **Its own side's numbers are known.** An ally's Hit Points and maximum, and whether it is at 0, dying or
  Stable, are in every party creature's open record. They are used freely.
- **Nothing is changed.** The AI never writes to the state. In particular `effectsOf` (durations.js) creates
  `s.effects` when it is missing; the AI reads `s.effects ?? []` instead.

### Decision 3: which spells it may cast (stage AC1)

A spell is a candidate for the caster when, read from its data and `spellProfile` (effects.js):

- it is in `e.spells`, its casting time is `action` or `bonus` (`sp.turn`), and its `time` is not `reaction`;
- it has no `choice` (Chromatic Orb's damage type), no `zone`, no `terrain`, no
  `summon` and no `teleport`, and its aim is `creature` or `area` (not `self` or `none`);
- every step in it, branches included (`walk`), is one of `attack`, `save`, `damage`, `heal`, `modifier`,
  `condition` and `move` (riders on a hit or a failed save, such as Ray of Frost's Speed or Thunderwave's push, are
  allowed and not scored); no `manual`, `counter`, `cure`, `reveal`, `kill` or `fall` step;
- it deals damage or heals, not both (Decision 4 scores one or the other);
- it does not need Concentration (stage AC1; Decision 6).

On the SRD pack as it is on main that admits 30 damage spells (Fire Bolt, Sacred Flame, Eldritch Blast, Ray of
Frost, Poison Spray, Vicious Mockery, Acid Splash, Magic Missile, Burning Hands, Guiding Bolt, Inflict Wounds,
Ray of Sickness, Dissonant Whispers, Thunderwave, Scorching Ray, Shatter, Fireball, Lightning Bolt, Blight,
Vitriolic Sphere, Contagion, Flame Strike, Chain Lightning, Circle of Death, Freezing Sphere, Harm, Finger of
Death, Befuddlement, Sunburst, Meteor Swarm) and 4 healing spells (Cure Wounds, Healing Word, Mass Healing Word,
Mass Cure Wounds). The list is not data: it is worked out from the steps, so a homebrew spell of the same shape
joins it. A test prints it from the pack and pins it (`ai-casting.test.js`), so a reviewer checks each entry once
against the SRD and a content change that moves a spell in or out shows up in review. A spell at tier `assist`
whose limit is only in its text (a target type, an object it ignites) is cast as the engine casts it, and the
engine's `manual` events tell the DM the rest, as they do when a player casts it.

What is checked before a candidate is offered, so that the engine does not refuse it (the caller ends the turn
on a refusal, which would waste it): the creature is up and not Incapacitated; the budget has the action or
Bonus Action (`s.encounter.budget`); a levelled spell has a slot of its level or higher (`e.slots`) and no slot
was spent this turn (`s.encounter.flags.slot`); an action spell is not cast with Action Surge's action after a
Magic action this turn (`flags['surge:<id>']` and `flags['magic:<id>']`); a target is within range
(`apart * FT`, Touch as 5 ft), not walled off (`unblocked`), one the caster can see (`canSee` is not `'no'`), in
the fight (`inFight`), and not the caster for a harmful spell; an area is laid out by the engine's own
`aimArea` (world.js, re-exported from engine.js for this), which applies range, walls and `types`. The stress
test (Testing) asserts that the engine refuses nothing the AI sends.

### Decision 4: the score

Every option for the action gets one number, its expected damage or healing, from the dice alone. No die is
rolled and nothing random is read.

- **Average dice.** The steps as this caster would cast them, from `scaleSteps(def, e.level, slot)` (cantrips by
  character level, levelled spells by slot): the average of `NdM+k` is `N × (M + 1) / 2 + k`; a step with `times`
  counts that many times; `heal` with `addMod` adds the caster's spellcasting modifier (`castAbilOf`).
- **How likely it lands (new rule).** Flat factors, the same for every target, because the true chances need
  monster numbers (Decision 2):
  - an attack roll: 0.65; with Disadvantage from the SRD's close-combat rule (a ranged spell attack while an
    enemy who can see the caster and is not Incapacitated is within 5 ft, lines 2059-2066): 0.65 × 0.65 = 0.42;
  - a save, no damage on a success: 0.5; a save for half: 0.75;
  - a damage step with no roll (Magic Missile's darts): 1.
- **Rays, darts and beams** (`target.creature.repeat`, `targetCount`) all go at one target, the first in order:
  their score is per ray, times the number of rays. Splitting them is a later refinement.
- **Several targets** (`count` above 1 without `repeat`, Chain Lightning's `within`): up to `count` foes in
  order, each scored.
- **Areas** score the sum over the foes caught. An area that would catch any creature of the caster's side
  (itself included, a companion, an ally at 0 Hit Points, who would suffer a death save failure, lines 2357-2359)
  is not a candidate at that spot; one with `choose` picks foes only, as `withActions`'s `aim` does now. Spots
  tried: each foe's place for a sphere or cylinder (within range), each foe's direction for a cone, line or cube
  from the caster, the caster's own place for an emanation. The best spot is the one catching the most foes,
  then the higher score, then the first in that order.
- **Weapons**, to compare: the best attack `withAttacks` would make now (or after its move in), at
  0.65 × the average of its `damage`, times the attacks the Attack action gives (`1 + features.extraAttack`).
  The Unarmed Strike is still only a last resort (`spareStrike`).
- **Healing** an ally: the average healing, capped at what it is missing (`maxHp - hp`).

Ties are broken by: the lower slot level, then the option that keeps the action (a Bonus Action spell), then the
spell's place in `e.spells`, then the target order. So the same state gives the same answer.

### Decision 5: the order of a turn, and the slots

`withAttacks` calls `casterStep(s, e, foes, lim)` first, for a creature that qualifies (Decision 1), when its
action or Bonus Action is still unspent and it is not in the middle of an Attack action (`budget.attacks`);
otherwise, and whenever `casterStep` returns null, `withAttacks` plays on as now. Being inside `withAttacks`, it is
reached both from `aiStep` (with the party's copy of Decision 2) and from the companion brain's `free` mode (with
`lim.noAttack`). Each call returns one action, as every AI step does.

**Free and paid.** A cantrip and a weapon attack are free. A levelled spell spends a slot, and slots come back
only with rests, so a player who comes back should not find them thrown away on one goblin.

**A hard fight (new rule)** is one where, on what the caster reads: the foes up and in the fight are at least as
many as the creatures of its side up and in the fight; or a creature of its side is at 0 Hit Points; or a creature
of its side (itself included) has a quarter of its Hit Point maximum or less.

The turn, in this order:

1. **An ally at 0 Hit Points**, dying first, then Stable, nearest first: heal it with a Bonus Action spell that
   reaches it (Healing Word), else with an action spell that reaches it, moving first to within Touch if the
   spell is Touch and a place within it is in reach this turn (`moveOptions`, the cheapest such place). This may
   spend any slot, even the one kept back (below).
2. **A badly hurt creature of its side** (a quarter of its maximum or less, itself included), in a hard fight:
   heal it with a Bonus Action spell if it has one; with an action spell only if the healing scores higher than
   the best damage option of step 3.
3. **The action.** The best-scoring option among free ones (cantrips, the weapon) and paid ones, where a paid
   option counts only when:
   - in a hard fight, it scores higher than the best free option;
   - otherwise, it is an area or several targets, catches two foes or more, and scores at least twice the best
     free option.
   A ranged option with nothing in range: the existing `approach` moves it nearer first, as for a ranged weapon.
4. **Then** anything `withAttacks` does now (a leftover move, the Dash, the end of the turn).

**Which slot.** The lowest slot level it has that can cast the spell; a higher one only when no lower is left,
and then scored at that level (`scaleSteps`). Never upcast by choice (question Q2).

**One kept back.** A caster that knows a healing spell of Decision 3 keeps its last slot of a level that can cast
it for step 1: steps 2 and 3 do not spend it. A caster with no healing spell keeps nothing back.

**One slot a turn** is the engine's rule (`flags.slot`, lines 23658-23664): after a Bonus Action Healing Word, a
levelled action spell is not a candidate that turn, and a cantrip or the weapon is.

**Amendment to Decision 5 (fix round 1 of #488, decided by the owner).** The rules above stand except where this says otherwise.

- **A hard fight** is one where foes able to act outnumber the creatures of its side able to act (a creature that is
  Incapacitated, dead or at 0 Hit Points does not count on either side), or a creature of its side is at 0 Hit Points,
  or one has a quarter of its maximum or less. "At least as many" is no longer enough: a fight of even numbers is not hard.
- **A slot spell is cast only if** its score is at least twice the best free option (a cantrip or the weapon), and either
  the fight is hard, or it is an area or several targets that catches two foes or more. Of the slot spells that qualify,
  the one cast is the lowest slot level whose score is within 25% of the best qualifying score (the best at an equal
  score by the order of step 3). A level 17 wizard against one goblin casts a cantrip.
- **A creature that has cast this turn does not close in.** `withAttacks` does not `approach` or Dash toward a foe after
  a cast (the flag `flags.slot` or `flags["magic:<id>"]` says it cast); it may still step away, or end its turn. Step 4
  of the turn is changed to that.
- **A ranged option that has nothing in range moves only as far as it must.** The caster's `approach` goes to the stoppable
  cell, within its Speed, from which the spell it means to cast (else its best ranged weapon) reaches a foe with a clear
  line, and of those cells the one that keeps the most distance from the foes (then the cheapest). If no cell it can
  reach gives a line, it does not Dash into melee: it ends its turn (or uses its weapon, if a foe is already beside it).
- **Ties between foes break by distance, then id, for a party creature** here and wherever the AI ranks foes (the weapon
  fall-through, `withActions`' order, `protect`'s `close` list), never by the foe's Hit Points, which a party creature must
  not use (Decision 2). A foe-side monster's tie by Hit Points is unchanged; a party-side creature (a companion's `protect` included) breaks ties by id.
- **`close` reads what the party knows.** Whether a foe next to the caster can see it (it takes Disadvantage on a ranged spell
  attack) is judged from what the party can know: a party creature does not read a foe's senses; it assumes the foe sees it,
  unless it is Blinded (an open condition).
- **Healing Word and Cure Wounds have no Undead or Construct exception** in SRD 5.2, and so the AI may cast them on any
  creature of its side, a skeleton or a construct among them. Left as the SRD has it.
- **For AC2.** `aiStep` reads the spell list of the table's pack (`SPELLS` and the homebrew overlay of a table's packs).
  The caller of AC2 (the DM's screen, the server) must install the table's overlay around the call (`using`, `registry.js`),
  as it does around `apply`; `aiStep` does not install it.

### Decision 6: Concentration

- **Stage AC1 starts none.** A Concentration spell is not a candidate (Decision 3). So the AI can never end a spell
  the caster's player was keeping up: a stand-in concentrating on its player's Bless keeps it.
- **Stage AC3** (buffs and control) may cast one only while the caster is concentrating on nothing
  (`s.effects` has no effect with `conc` and `source === e.id`). It never replaces a running one, however weak
  (question Q4 asks whether it may replace one that does nothing any more).
- Keeping Concentration (the save on damage) is the engine's, as for anyone.

### Decision 7: reactions

Shield and Counterspell are already reactions by standing instruction (`reactions.js`): `always`, `never`, `miss`
or `ask`, and a reaction that spends a slot defaults to `never`. The AI adds nothing: a stand-in keeps the
instructions its player set, and Shield, Counterspell, Hellish Rebuke and the Opportunity Attack fire or not by
them, inside the action that triggers them. An `ask` on a stand-in's reaction waits for an answer as for any
player's character: the prompt goes to the character's controller and to the DM, and the DM's auto-play waits
(`aiStep` returns null while `s.pending`), so the DM answers (question Q5).

### Decision 8: buffs and control, later (stage AC3)

Bless, Shield of Faith, Hold Person, Command, Sleep and the like need two things this spec does not settle:

- **A value.** What a +1d4 to three allies' attacks and saves, or a foe Paralyzed for a minute, is worth against
  damage now. A first reading: a buff on allies scores its average bonus times the attacks those allies are likely
  to make before it ends (by a fixed number of rounds); a disabling condition scores the foe's expected damage
  avoided. Both are guesses and need their own spec amendment and the owner's eye.
- **Target limits as data.** Hold Person affects a Humanoid only, and its data does not say so: `target.creature`
  has no `types` (only `target.area` does, for Turn Undead). The AI would cast it on a wolf, and the engine would
  let it. Before AC3, the vocabulary needs `target.creature.types` (schema.js, the engine's `creatures()` holding a
  spell to it, the SRD entries filled in): an engine and content change with its own amendment, as CLAUDE.md
  requires.

Until then a buff or control spell is never cast by the AI.

## What stays the DM's

Not cast by the AI (the DM casts them by hand from the character's sheet, as now):

- spells that need a choice the AI does not make: a damage type (Chromatic Orb), a place to teleport to, a
  summon's choices and spaces, corpses, a zone or terrain's layout (Moonbeam, Spirit Guardians, Web);
- Concentration spells (until AC3), buffs and control;
- spells with a `manual`, `counter`, `cure`, `reveal`, `kill` or `fall` step (Spare the Dying, Revivify,
  Lesser Restoration, Dispel Magic);
- Reaction spells by any route but the standing instruction (Decision 7);
- rituals and spells longer than a Bonus Action; anything outside a fight;
- Metamagic, Empowered Evocation, Overchannel, Repelling Blast, a familiar delivering a touch (`deliver`), a cast
  through a feature (`via`: Divine Intervention, Magic Initiate) or from an item (`use`);
- a pack monster's `Spellcasting` trait (text, "The DM casts these."): out of this spec, its own data job.

None of these is approximated: the AI does not cast them, so there is nothing to hand over. What a spell the AI
does cast cannot apply by itself, the engine hands to the DM with its `manual` events, as for a player.

## Testing

Every test builds its fight from a seed (`newGame(seed)`, the pregenerated party: Tavin the wizard with Fire
Bolt, Magic Missile and Burning Hands; Odessa the cleric with Sacred Flame, Cure Wounds, Healing Word and Shield
of Faith) and places goblins by hand, so each is a fixed fight that replays.

- **`packages/rules/test/ai-casting.test.js`** (AC1), on both grids:
  - the candidate list printed from the pack and pinned (Decision 3);
  - Tavin, set aside under `standIn`, one goblin at 60 ft, not a hard fight: Fire Bolt, not Magic Missile;
  - two goblins in a 15 ft cone of him and no ally in it: Burning Hands at the lowest slot; with Brenna in the
    cone: not cast there, and the next spot or Fire Bolt;
  - a goblin beside him: Fire Bolt at Disadvantage scores 0.42 × 5.5 = 2.3 and the dagger 0.65 × 4.5 = 2.9, so he
    stabs (the close-combat factor at work);
  - a hard fight (three goblins, not in one cone, against him alone): Magic Missile at the nearest goblin;
  - Odessa with Brenna at 0 Hit Points 40 ft away: Healing Word (Bonus Action) on Brenna, then Sacred Flame, in one
    turn; with Brenna at 0 Hit Points beside her and no Healing Word left: Cure Wounds after no move; 20 ft away:
    a move, then Cure Wounds;
  - the kept slot: a test cleric sheet with Guiding Bolt, Healing Word and one level 1 slot, in a hard fight, does
    not spend it on Guiding Bolt, and does on Healing Word for a downed ally;
  - one slot a turn: the same sheet with two slots, after Healing Word, casts Sacred Flame, not Guiding Bolt;
  - a Concentration spell already running (Odessa's Shield of Faith on Brenna) stays running through her turns;
  - hidden information: twin runs with a goblin the party does not know of beside the cone's best spot, and with
    no goblin there, give the same first action and the same events to every player until it is found;
  - determinism: `aiStep` on two `structuredClone`s of a state gives deep-equal answers, and does not change the
    state it reads (compared before and after).
- **`packages/rules/test/ai-casting-replay.test.js`** (AC1): the fights of `companions-brain-replay.test.js`,
  every creature played by `aiStep`, recorded on main before AC1: every creature with no `spells` chooses the same
  actions byte for byte. The pregenerated casters, which do change, are recorded again and pinned as the new
  replay, so a later change to the scores shows up as a changed recording.
- **`packages/rules/test/ai-casting-stress.test.js`** (AC1): the party all set aside under `standIn` against
  goblins and a pack Mage, auto-played for 200 rounds a grid (2,400 with `HEXTABLE_STRESS=full`, as the brain's
  loop): nothing the AI sends is refused, every turn ends within 25 steps, slots never go below zero, no
  Concentration effect of a caster ends by its own cast.
- **AC2** adds to `step-away.test.js`: `autoPlays` is true for a character under `standIn` and false for one under
  any other `how`, one not set aside, and one whose player is offline but not set aside. The client change is
  checked with the smoke pass that covers stepping away, at 1280x800 and 390x844.

## Job split

Each stage is one pull request with its own tests; every one leaves the valley playing as it does now for
monsters.

**AC1. Damage and healing.** Decisions 2 to 7. `casterStep`, the candidate filter, the score, the slot rule, the
party's `knownTo` copy for an unbonded party creature in `aiStep`. Files: `packages/rules/src/ai.js`;
`packages/rules/src/engine.js` (one re-export, `aimArea`, from `engine/world.js`; named here because AGENTS.md
asks for it). Tests: `packages/rules/test/ai-casting.test.js`, `ai-casting-replay.test.js`,
`ai-casting-stress.test.js` (and a kit file beside them if the loop needs one). No state change.

**AC2. The stand-in on the DM's screen.** Decision 1: `autoPlays` for a `standIn` character; `idled()` asks
`autoPlays` alone; a log line when the AI plays a set-aside character's turn ("Tavin is played by the stand-in"),
if `awayTurn` has none. Files: `packages/rules/src/ai.js`, `packages/client/app.js`,
`packages/rules/test/step-away.test.js`. Smoke: the stepping-away pass. Strikes the stand-in part of DEBT T20 (1).

**AC3. Buffs and control.** Decision 8. Needs its own spec amendment first (the value model and
`target.creature.types`). Files, when it comes: `content/schema.js`, `engine/world.js` (`creatures`),
`content/srd52/spells-*.js` (the type limits, checked against the SRD), `packages/rules/src/ai.js`.

**AC4. Refinements, if wanted.** Splitting rays and darts between foes; stepping out of a foe's reach before a
ranged spell (the guard's safe-step test, `guard()`, already says where that is no harm); casting outside a
fight. Each its own small job.

**DEBT.** AC1 and AC2 together strike T62 (2). AC1 adds a line for what it leaves (buffs and control, the
out-of-scope list above).

## Questions for the owner

Each has the default the jobs above are written to.

- **Q1. How does the DM hand a character with no player to the AI?** Default: by setting it aside under
  `standIn` (`stepAway { actor, how: 'standIn' }`), which exists and needs no new state; only in a fight, as
  stepping away is. The alternative is a per-character flag (`autoplay: true`, a DM action and a migration-free
  optional field), which would also work outside a fight and reads better in the tracker.
- **Q2. Slots.** Default: Decision 5 (free options first; a slot only in a hard fight, or for an area catching two
  or more at twice the free option's worth; the lowest slot; the last slot kept for a downed ally by a caster that
  can heal). The alternatives: spend freely (best score wins, slots or not), or a per-character instruction the
  player sets before stepping away (`thrifty` / `free`), stored beside the reaction instructions.
- **Q3. Hit chances.** Default: flat factors (0.65 to hit, 0.5 or 0.75 for a save) for every caster, so a party
  character's choice uses no monster number. The alternative is the true chance against the target's Armor Class
  and save bonus, for the DM's own creatures only, which picks better but plays a DM's ally with knowledge the
  players lack.
- **Q4. Concentration in AC3.** Default: never replace a running Concentration spell. The alternative: replace one
  whose every target is gone or at 0 Hit Points (a Bless on three fallen allies), which is no loss.
- **Q5. `ask` reactions on a stand-in.** Default: unchanged, the DM answers the prompt. The alternative: while a
  character is under `standIn`, its `ask` is read as `never` (or as `miss` for Shield), so the DM's auto-play never
  waits; that is an engine change in `reactions.js` and would be its own job.
- **Q6. Healing threshold.** Default: an ally is "badly hurt" at a quarter of its maximum or less, and healed with
  an action only when that beats the best damage. The alternative is half, which heals more and attacks less.

## Build notes (AC1, #487)

Built to the decisions above, on the owner questions' defaults (Q1 to Q6 as written). What was settled in building, where the spec
was silent or a choice had to be made; none of it changes a decision.

- **Where it lives.** `casterStep(s, e, foes, lim)` and `aiCastable(sp)` in `packages/rules/src/ai.js`. `withAttacks` calls
  `casterStep` first and takes a `lim` as `withActions` does; the companion brain's `free` mode passes `{ noAttack }` through to it (a
  sheet companion that can't attack casts only spells with no attack roll, and its weapon scores 0). `engine.js` re-exports `aimArea`.
  `aimArea` throws the engine's `RuleError`, which engine.js does not export, so the AI recognises it by its class name and rethrows
  anything else.
- **`aiStep` reads the party's copy for every unbonded party creature**, not only for casters (`knownTo`, as the brain does). A foe still
  reads the true state, so the monster AI's choices are unchanged (`ai-casting-replay.test.js`).
- **The candidate list** is `aiCastable(sp)`: 30 damage spells and 4 healing spells on the pack as it is, pinned in
  `ai-casting.test.js`. `Number.isFinite` of the spell's worth is part of the test, so a spell whose dice the AI cannot read is not cast.
- **Score.** The score of a step is worked out by walking its steps: `damage` (times `times`), `heal` (plus the modifier for `addMod`),
  `attack` (0.65 of `onHit`, the rest of `onMiss`) and `save` (0.5 of `onFail` on no damage on a success, 0.75 with `half`, the rest of
  `onSuccess`). The Disadvantage factor (0.65 x 0.65) applies to a `ranged` attack step while an enemy that sees the caster and is not
  Incapacitated is within 5 ft (the engine's own test, `rolls.js`); a `melee` spell attack (Inflict Wounds) is not reduced.
- **The weapon**, to compare, is worth 0.65 of its average damage times `1 + extraAttack`; a melee weapon counts when a foe is beside the
  caster or a place to stop beside one is in reach this turn; a ranged weapon with an enemy within 5 ft gets the same Disadvantage
  factor as a ranged spell (the spec gave the flat 0.65 for weapons; the same rule applies to a bow, and a bow must not beat a cantrip
  on a factor the cantrip is denied). The spare Unarmed Strike counts for nothing. On a tie the weapon wins (nothing is cast, and
  `withAttacks` attacks as it did before).
- **Step 1** tries every downed creature (dying first, then Stable, nearest first) for a cast that reaches it now (a Bonus Action spell,
  else an action spell) before it moves toward any of them; the move is to the cheapest place within Touch, never to the place it stands
  on, and only where the Touch spell would then reach (wall and sight checked from that place).
- **Step 2** takes the creature with the lowest share of its Hit Points first, then the nearest. Its action spell is cast only where it
  reaches now (no move) and heals more than step 3's best (the weapon included).
- **Healing several**: `Mass Healing Word` takes the creature to heal first and then those that are missing most; `Mass Cure Wounds`
  (an area that chooses) is aimed at each creature that is hurt in turn and picks hurt creatures of its own side only.
- **Rays** (`repeat`) are sent as `targets` listing the one foe once per ray (`target` when there is one ray).
- **The slot kept back** is counted over all slots of a level that can cast the lowest-level healing spell the caster knows: a damage
  spell may spend a slot of that kind only while another is left.
- **Fix round 1 (see the amendment to Decision 5).** Built as amended: no walk after a cast; the approach goes only as far as the
  chosen option needs (`plan` in `casterStep` tries each stoppable cell with the spell's own reach, keeps the one farthest from the
  foes); the slot rule is twice the best free option with the lowest slot within 25% of the best; a party creature breaks ties by
  distance then id (`byHp` in `ai.js` gives 0 for a party creature, so a foe-side monster is unchanged and every party-side creature, a companion's `protect` too, breaks ties by id); `close` assumes a foe sees a caster
  unless it is Blinded. A test of the `sight: los` stand-in pins that a fighter does not walk to a foe behind a shut door it cannot
  know of (`ai-casting.test.js`).
- **Tests.** `ai-casting.test.js` (the spec's list, on both grids, plus the gates, a badly hurt ally, and every spell of the list sent to
  the engine); `ai-casting-replay.test.js` with `fixtures/ai-casting-replay.json` (re-record with `HEXTABLE_RECORD=1`);
  `ai-casting-stress.test.js` (200 rounds a grid, 2,400 with `HEXTABLE_STRESS=full`); `ai-casting-kit.js`. `companions-brain-replay.test.js`
  plays the recorded fights whole (the party by `aiStep` too, the casters' spells put away, a whole-state digest) against
  `fixtures/c7-ai-replay.json`, re-recorded on the AC1 head because a party creature's tie rule changed on purpose (steps differ on
  4 of 7 fights); and `ai-casting-replay.test.js` plays them with the party passive against `fixtures/ai-casting-monsters.json`,
  recorded on main's `ai.js` before AC1: the monsters-byte-identical check.
- **Not done here:** AC2 (the DM's screen calls `aiStep` for a stand-in; `autoPlays` is unchanged; built in #490, below), buffs and control (AC3).

## Build notes (AC2, #490)

Built to Decision 1 and the AC2 job, on the owner questions' defaults (Q1: `standIn` is the handover, in a fight only; Q5: an `ask` waits for the DM).
What was settled in building; none of it changes a decision.

- **`autoPlays`** (`ai.js`): a `kind: 'pc'` creature is auto-played exactly when `awayHow(s, e) === 'standIn'`, checked before the bond test (a character
  is never a companion). Not set aside, asked but not granted, set aside under `dodge`, `end`, `endKeep` or `hold`, or a player merely offline: false. A
  monster is played as before, whether or not the DM set it aside. `aiStep` still does not check who is present.
- **A stand-in that drops to 0 in its own turn** (an Opportunity Attack as it moved) gets `endTurn` from `aiStep`, as a monster does (DEBT W24); a character
  at 0 that is not a stand-in is still left to its player (`null`).
- **`idled()`** (`app.js`) asks `autoPlays` alone; the `cur.kind === 'npc'` test is gone. It is the DM's screen only (`isDM()` and the DM's "Run monsters
  automatically"), so a stand-in is never played from two screens: a player's page never calls the AI. A table has one DM; a DM with the table open in two
  tabs would play from both, as for monsters (not new, not handled).
- **The overlay** is installed around the call by `aiAction` (`packages/client/standin.js`, a file added for this: `app.js` cannot be loaded in Node, and the
  call has to be tested). It runs `aiStep` under `using(overlay)` for the overlay the page's pack store keeps installed (`PK.store.installed()`); `using` of the
  installed overlay is a no-op re-entry, and a table with no homebrew has none. `packages/client/test/standin.test.js` shows a homebrew cantrip cast by a stand-in
  with the overlay and not cast without it. The server plays nothing, so it has nothing to install.
- **Dice.** An action the auto-play sends for a character (a stand-in) is thrown, when the table's dice are set to `throw`, by the device's monster setting
  ("auto-roll monsters"), not the player's "my own dice": nobody is throwing for a stand-in. A monster or a companion is as before.
- **Log lines** (`app.js`, `words`): `away` ("Tavin steps away: the stand-in plays Tavin's turns.", "asks to step away", other hows "steps away"), `back`
  ("is back.") and `awayTurn` under `standIn` ("Tavin is played by the stand-in."). Set aside on its own turn there is no `awayTurn` until its next turn
  (`dm.js`), so the `away` line is what says the screen plays from then on. The view sends these for a party creature only, so players see them for their
  own side and the log of a monster set aside stays silent, as the history already has it.
- **Smoke**: a new registered pass `standin` (`scripts/smoke/standin.mjs`, in the matrix of `.github/workflows/smoke.yml`): solo at 1280x800 and at 390x844 with
  touch, then a hosted table with a DM and a phone player. There is no tracker button or player's break button yet (DEBT T20), so the passes send the
  `stepAway` the button would.
- **Not done here:** the tracker control, the player's button, the hint on a lost link, "auto after N seconds" (T20 (1), what is left of it), and any buff or control spell (AC3).
