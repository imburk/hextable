# Spec: legendary actions and Legendary Resistance

Status: Agreed (the owner, 26 November on #193: legendary actions next after swimming). Written by an agent; the owner answered its eleven questions on 23 November (see "The owner's answers" at the end). DEBT M5. Docs only: nothing here is
built. Checked against main on 27 November (state version 31): the code claims below are as of then, and the build plan was cut into smaller stages. Every rule is from `reference/srd52/srd52-flow.txt`; the numbers after a section name are its
lines.

It stands on the reactions and prompts machinery (`reactions.js`, the `react` handler in
`engine.js`, [`prompts.md`](prompts.md), built with #694), the turn order in `engine/resolve.js`, the monster
brain (`ai.js`), [`homebrew.md`](homebrew.md), [`hidden-information.md`](hidden-information.md), and
it shows in the places [`one-token-menu.md`](one-token-menu.md), the DM's to-do tray (#684,
`dm-todo.md`) and `dm-helper.md` (PR #681, still open on 27 November, so not in `docs/specs`) made.

## In plain words

- A legendary monster (an adult dragon, a lich, a vampire) gets a few extra moves each round,
  taken just after other creatures' turns. Today the engine does not know about them at all: the
  stat block says "the DM runs them", and the DM has to remember, count and apply each one by hand.
- With this built, after each turn the table pauses for a moment **only if** a legendary creature
  could do something. You see one small bar: "Verdigris · 2 of 3 · **[Pounce → Brenna]**
  [Noxious Miasma…] [Skip]". One tap plays the recommended one; the engine moves it, rolls the
  attack and applies the damage. One tap on Skip moves on.
- You can let a creature take them **by itself** (the monster brain picks, as it plays turns now).
- **Legendary Resistance**: by default each legendary creature is set to **"Only when it
  matters"**. When it fails a saving throw, has uses left, and failing would change something for
  it (damage it does not resist or ignore, a condition it is not immune to, its Concentration, and
  the like), the engine spends a use by itself. A failed save that would change nothing never
  spends one. If the engine cannot tell, it stops and asks you: "Verdigris failed a Wisdom save
  against Hold Monster: it would be Paralyzed. Use Legendary Resistance (3 of 3 left today)?
  **[Use it]** [Let it fail]". One switch per creature changes this: **"Ask me every time"**,
  **"Every failed save"** or **"Never"**.
- Players see what their characters see: "Verdigris uses Pounce", the move and the hit; "Verdigris
  shrugs it off". They are never told the words "Legendary Resistance", and never how many uses
  are left unless you choose to show the legendary uses.
- What the engine still cannot do (a legendary action that casts a spell, until monster
  spellcasting is built: DEBT M6) is offered all the same, spends the use, and is handed to you
  as a card with the tools beside it. The engine never plays it badly on the quiet.
- It works the same for a monster from your private adventure, entered in your homebrew pack.

## What the owner asked

The lead's brief, 21 November 2026: the owner's party is level 13 to 15 (Paladin 13, Paladin 6 /
Bard 8, Druid 14, Sorcerer 15, Cleric 14), so legendary monsters matter most. The game is there to
let the DM facilitate the players' story without getting caught in minutiae. His adventure's
monsters come in a homebrew pack. Follow SRD 5.2 for both rules; Legendary Resistance is a choice,
and the DM is not overruled (the owner's answers to leg-2 and leg-3 settle how). The DM-helper spec (question 11) recommends this work straight
after its first slice, before sharper tactics.

| Asked | Here |
|---|---|
| A monster entry declares its legendary actions, uses, Legendary Resistance | Decision 1 |
| State for remaining uses; the window after each other creature's turn | Decisions 2 and 3 |
| Reactions, the `react` re-run, death, Incapacitated, end of fight, undo | Decision 4 |
| The DM picks; the AI recommends or takes one by the DM's setting | Decisions 5 and 8 |
| Legendary Resistance as a choice: "only when it matters" by default, asked when the engine cannot tell | Decision 6 |
| Never pretend | Decision 7 |
| What players see | Decision 9 |
| A compact, one-tap DM screen, on a phone too | Decision 10 |
| Several legendary creatures | Decision 3, last part |
| Homebrew packs | Decision 1, last part |

## What the SRD says

- **Legendary Actions** (43616 to 43627): "an action that a monster can take immediately after
  another creature's turn. Only one of these actions can be taken at a time and only after another
  creature's turn ends. The monster can't take a Legendary Action if it has the Incapacitated
  condition or is otherwise unable to take actions. The monster has a limited number of Legendary
  Action uses, and that number is specified in the stat block. The monster expends one use
  whenever it takes a Legendary Action, and it regains all expended uses at the start of each of
  its turns."
- **The stat block** (for example 43701, 44694): "Legendary Action Uses: 3 (4 in Lair). Immediately
  after another creature's turn, the dragon can expend a use to take one of the following
  actions." Several options say "can't take this action again until the start of its next turn".
  No SRD 5.2.1 option costs more than one use.
- **Legendary Resistance** (43713, 44762): "(3/Day, or 4/Day in Lair). If the aboleth fails a saving
  throw, it can choose to succeed instead." Ancient dragons and the lich have 4 (5 in a lair); the
  tarrasque 6.
- **X/Day** (43635 to 43641): "a monster must finish a Long Rest to regain expended uses."
- **Running a Monster** (43241 to 43244): "If the monster has Bonus Actions, Reactions, or Legendary
  Actions in its stat block, make sure it uses them as often as it can."
- **Lairs.** The SRD gives only the numbers "in Lair" (uses, Legendary Resistance, XP). It has no
  lair actions and no regional effects; those are out of scope.
- **Vorpal Sword** (42601): a creature with Legendary Resistance "can expend one daily use of that
  trait to avoid losing its head". A use spent on something that is not a save.

## Where we are

Read from the code at `d371fcbf` (21 November), and checked again against main on 27 November: nothing of this spec was built meanwhile (the only `legendary` in `packages/rules/src` besides the SRD data is the to-do tray's pattern, the reader's pattern and the called save's note below).

- **The data.** 30 SRD monsters have a trait `legendary-actions` and 32 a trait
  `legendary-resistance` (the balor and the pit fiend have only the second), all `assist`. Both are
  text with no modifiers: "3 uses (4 in its lair) ... The engine has no field for legendary actions;
  the DM runs them." and "Can turn a failed saving throw into a success, 3 times a day, or 4 in its
  lair. The DM tracks the uses." `content/reader.js` says the same in plain words (its `LEGENDARY`
  pattern).
- **The to-do tray** (#684, built) makes a "You run" card for a monster whose block has a Legendary
  Actions or Legendary Resistance trait with nothing the engine reads, when it is added and at its
  first turn. It says that those cards stop by themselves when M5 gives the traits fields.
- **A called save** (#694, merged 22 November; `engine/dm.js`, the `call` handler) puts a `manual` event to the DM alone when a
  creature whose template has the `legendary-resistance` trait fails it, and applies the failure. It reads the trait from
  `CONTENT.monsters[t.tpl].traits`, so once the trait is taken out of the entry (Decision 1) this line must read
  `e.legendary.resistance` instead. Nothing else looks at the trait.
- **Turns.** `endTurn` (`engine/attacks.js`) runs `finishTurn` and then `advanceTurn`
  (`engine/resolve.js`), which steps to the next creature, rolls a dying creature's death save,
  plays a turn set aside, and calls `beginTurn` (budget, Reaction back, recharge; a private function of `resolve.js`). `advanceTurn` is
  also called from `engine/dm.js` (`stepAway`, a held or set-aside turn) and twice inside `resolve.js` (the start of a fight and
  the end of a fall or a ride), so the window is opened inside `advanceTurn` and not at each caller. There is no
  moment between one turn's end and the next turn's start where anything can happen. A new round starts inside the same
  loop (`enc.round++`, `newRound`, `stepTides`, `roundStarted`), before the next creature is looked at.
- **Questions.** `ask()` (`engine/shared.js`) stops an action and keeps it in `s.pending` until the
  `react` answer re-runs it. It returns `null`, and nothing waits, for a creature no player controls (`ownerOf`) or where
  the action cannot pause (`RUN.canPause`); the DM is then told by a `manual` event and the action carries on
  (`reactions.js`, header: "monster turns and the AI never stop on themselves"). `mayAsk` is in `reactions.js` (it
  decides whether `apply()` takes the copy). `WHILE_WAITING` is in `reactions.js` too, and `engine.js` checks it in `apply()` beside `s.pending`.
  There is no `askDM` yet.
- **Off-turn actions.** A creature that is not the current one can act only as a Reaction, or move
  with the feet an Opportunity Attack's rider gave (`rmove`, `engine/movement.js`).

## Rules that bind this design

- **Everything goes through `apply()`.** A legendary action, a skip and a spent Legendary
  Resistance are actions or answers. The AI sends the same actions as the DM.
- **A rejected action changes nothing**, and **the rules package is pure**: the window, the
  counters and the "matters" judgement are state and pure functions; dice come from the seed.
- **The engine never pretends.** An option it cannot run is offered as the DM's, with its text.
- **Content is data, and the vocabulary is closed.** The new monster key, its option keys and the
  new instruction value are engine changes with this spec as their amendment. A content job may
  not add them.
- **Players are sent nothing hidden**: no remaining uses, no options not taken, no instruction, no
  question. A `twin()` test for each stage that adds hidden state (AGENTS.md).
- **Phones count.** Every card is drawn at 390 x 844, one thumb, targets 44 px or more.

## The decisions

### Decision 1: the data: one `legendary` key on a monster

A monster entry gains one optional key, `legendary`, with up to three parts. The traits
`legendary-actions` and `legendary-resistance` are taken out of an entry when its block is entered,
so nothing is said twice and the "You run" card no longer fires for what the engine now runs.

```js
// Adult Green Dragon (SRD 5.2.1). The steps inside are in the forms schema.js already has; the
// builder checks each against the linter.
legendary: {
  actions: {
    uses: 3,
    options: [
      { id: 'mind-invasion', name: 'Mind Invasion',
        manual: 'Casts Mind Spike (level 3 version) using Spellcasting.',
        text: 'Casts Mind Spike (level 3 version) using its Spellcasting.' },
      { id: 'noxious-miasma', name: 'Noxious Miasma', again: 'nextTurn',
        target: { area: { shape: 'sphere', size: 20, range: 90 } },
        effects: [{ save: 'con', dc: 17, half: false, onFail: [
          { damage: '2d6', type: 'poison' },
          { modifier: { on: 'ac', op: 'add', value: -2 }, ends: { on: 'turnEnd' } }] }],
        text: 'A 20-foot sphere within 90 feet: Constitution save or poison damage and -2 AC until the end of its next turn. Not again before its next turn.' },
      { id: 'pounce', name: 'Pounce', move: { speed: 'half' }, use: ['rend'],
        text: 'Moves up to half its Speed, then makes one Rend attack.' },
    ],
  },
  resistance: { day: 3 },
  lair: { uses: 4, resistance: 4, xp: 15000 },
},
```

**`actions`**: `uses` (1 to 5) and `options` (1 to 8). An option has:

| Key | Says | Notes |
|---|---|---|
| `id`, `name`, `text` | as an action's | `text` in our own words; required |
| `cost` | uses it spends, 1 to 3; 1 if left out | SRD 5.2.1 never needs it. Older published blocks ("Costs 2 Actions"), which a homebrew pack from a 2014 adventure will hold, do |
| `move` | `{ speed: 'half' \| 'full', mode?, provokes?, after? }` | Moves first, up to that part of its Speed. `mode` is a movement mode it has (`fly` for Cloaked Flight); `provokes: false` is "without provoking Opportunity Attacks" (the unicorn's Charging Horn); `after: true` moves after the rest (the kraken's Toxic Ink) |
| `use` | one to three of its own action ids | "Makes one Rend attack", "uses Dreadful Glare", "one Claw or Tail attack" (two ids: the DM or the AI picks). Never a Multiattack. The used action keeps its own recharge and uses: a spent breath cannot be "used" |
| `target`, `effects` | as an action's | An option with an effect of its own (Noxious Miasma, Blinding Gaze). Not with `use` |
| `again` | `'nextTurn'` | "Can't take this action again until the start of its next turn" |
| `manual` | text for the DM | What the engine does not do. Alone (an option the DM runs whole, such as one that casts a spell before M6) or beside the rest (the part left over) |

An option has `use`, or `effects`, or `manual`, or a `move` with one of them; never none.

**`resistance`**: `{ day }`, 1 to 10. The tarrasque's 6 is the SRD's largest.

**`lair`**: the numbers "in Lair": `uses`, `resistance`, `xp`, each optional and each at least the
plain number. The engine uses them only for a creature the DM has marked as in its lair (Decision 2).

**Tier.** Entering a block does not by itself raise a monster's tier. A monster with a `manual`
option, or with Spellcasting still as text, stays `assist`, which is honest.

**Homebrew packs.** The same key, in the same shape, linted by the same code (`lintMonster`), with
the usual homebrew limits (`HOMEBREW_LENGTHS`, `HOMEBREW_TYPES`, the monster `SHAPES` key list).
`cost` exists for them. The reader (`content/reader.js`) reads the block back in plain words
("Legendary actions, 3 a round: Pounce, moves up to half its Speed, then one Rend attack ..."), so
`node scripts/hb.mjs read` shows the DM what the engine will do before a session. A homebrew
monster's block is never sent to a player who does not run it, as for the rest of its block.

*Why one key.* The balor has resistance and no actions; the lair numbers belong to both. One key
keeps the three together and keeps `actions` free of things the brain and the action panel would
otherwise have to learn to skip (*rejected*: options as ordinary actions with `time: 'legendary'`:
every reader of `e.actions`, the AI, the action panel, the profile, the Multiattack linter, would
need a new exception).

### Decision 2: the state: counters on the creature

`makeEntity` copies the block onto the creature as `e.legendary` (as it copies its actions, so a new
version of a pack changes new creatures only, `homebrew.md`). What it has spent is kept beside it:

```js
e.legend = {
  acts: 0,              // uses spent since the start of its last turn
  resisted: 0,          // Legendary Resistance spent since its last Long Rest
  again: {},            // { [option id]: true }: an `again: 'nextTurn'` option taken; cleared at its turn's start
  lair: false,          // the DM's mark: it is in its lair (the lair numbers apply)
  show: false,          // the DM's choice to show its uses to the players (Decision 9)
};
```

Spent, not left, so that marking a creature as in its lair, or not, moves what is left by the
difference and nothing is lost. Left is `max - spent`, never below 0.

- **Regained:** `acts` and `again` at the start of each of its turns (`beginTurn`), and at the end
  of a fight. `resisted` on a Long Rest the DM names it in (rests.js, as for a monster's other daily
  uses, #82).
- **A creature added during a fight** starts with everything.
- **The DM may set them** (`legendarySet`, Decision 5): uses left this round, Legendary Resistance
  left today, in its lair, shown. This also covers the Vorpal Sword and anything else that spends a
  use without a save.
- **Old saves.** `migrate.js` gives an SRD monster that has no `e.legendary` the block of its
  template (the data is the SRD's, so this is safe). A homebrew creature made before this keeps
  what it had; the DM adds it again from the pack to get the block.

### Decision 3: the window, after each other creature's turn

**When it opens.** After each turn that was taken, before the next one starts (and before a new
round's start, after the last turn of a round). A turn was taken when `endTurn` ended it, when the
engine played it for a creature set aside (`awayTurn`), or when a dying creature rolled its death
save. Not before the first turn of a fight, and not after a place in the order that had no turn
(the dead, a held turn, a ridden mount's place).

**Who is offered.** Every creature in the fight's order, other than the one whose turn just ended,
that has `legendary.actions` and:

- is up (above 0 Hit Points, not dead) and not Incapacitated or otherwise unable to act (`able`);
- is not set aside (`away`);
- has a use left that pays for at least one option;
- has at least one option it could take now: not barred by `again`, its `use` actions not spent
  (recharge, uses), and something to aim it at (the same check the brain uses, so the engine never
  offers what it would refuse).

**Lead's default (V025), for the owner to confirm:** a legendary creature hidden from the party (one the party does not know of: DM-hidden, hiding, melded, unseen) is offered no window; its legendary actions wait until it is known. So a fight with only such creatures goes on exactly as a world without them, and players are never sent that the table waits for what they cannot see.

**Until stage L4 lands the window is off unless the DM turns it on** (lead, V025): the table setting `legendaryWindows` is `false` when absent, and with it off every fight plays exactly as it did. L4 turns the default on.

**If nobody is offered, nothing opens** and the next turn starts exactly as today, in the same
action, with the same events. A fight with no legendary creature is byte for byte what it was.

**While it is open** (`s.encounter.between = { after, round, offered: [ids], done: [ids] }`):

- Nobody has a turn. The next creature's turn has not begun: its start-of-turn effects, its
  recharge and its Reaction back all wait. This is the SRD's order ("immediately after another
  creature's turn").
- Only these actions are accepted: `legendary`, `legendarySet`, `react`, `reactions`, the DM's
  tools that change nothing about whose turn it is (Damage, Heal, Condition, Set AC, Place, a
  called save, notes, handouts, the to-do tray's Done), and ending the fight. Anything else is
  refused before it changes anything: "Between turns: the DM is deciding on legendary actions."
  (`BETWEEN_OK` is defined beside `WHILE_WAITING` in `reactions.js` and checked in `apply()` in `engine.js`, next to the `s.pending` test.)
- **One option per offered creature per window** (the reading the SRD's own words give and that
  our data already says: "one action can be taken after another creature's turn"; owner, 23 Nov,
  leg-1).
- While it is open `spawn` and `remove` are refused (they are not in `BETWEEN_OK`): the DM closes the window first. A creature offered that is dropped, killed, made Incapacitated or moved off the map by a `BETWEEN_OK` action leaves the window at once, and when nobody is left the window closes and the next turn begins (`settleWindow`, run after every action).
- It closes when every offered creature has taken one or been skipped, when the DM closes it, or
  when the fight ends. The next turn then begins (`advanceTurn` goes on from where it stopped).
- **None is ever late** (owner, 23 Nov, leg-10). The game offers a window after every other
  creature's turn, so there is no moment when a legendary action was "forgotten" and no "late"
  legendary action. Nothing in this design sends the table back across another player's turn
  to fix one.

**Several legendary creatures.** One window holds them all, listed in the order their own turns
come after the turn that ended. The DM (or the AI, in that order) takes or skips each; the order of
taking is the DM's. Two identical monsters are listed by their names and ids; how identical
monsters share initiative is out of scope here.

### Decision 4: how it meets the rest of the engine

| Meets | What happens |
|---|---|
| **Reactions** | A legendary action is an ordinary action through `apply()`: its move can draw an Opportunity Attack (unless `provokes: false`), its attack a Shield, a later cast a Counterspell. A question stops it in `s.pending` as any action; the `react` answer re-runs the whole `legendary` action from the copy taken before it, so a use is never spent twice. While a reaction waits, `legendary` is refused, as most actions are. The creature's own Reaction is separate and is not spent |
| **Death and dropping** | A creature dropped to 0 in the window (by an Opportunity Attack on its Pounce) is taken off the offered list. If a legendary action ends the fight, the window goes with the fight. A creature that died is never offered |
| **Incapacitated** | Not offered. Made Incapacitated during its own legendary action: the rest of that option is not made (the move stops; the attack is not made), and the use stays spent, with a note |
| **The move part** | Walked by the engine's walk with a budget of its own (the half or full Speed of the option; `mode`), as the `rmove` feet are. If the walk stops short (an Opportunity Attack, a creature found), the attack is made only if its target is still in reach; else it is lost, with a note to the DM. The destination and the target are checked before anything moves, so a refused option changes nothing |
| **End of the fight** | `between` goes; `acts` and `again` reset; `resisted` stays until a Long Rest |
| **Undo, redo, rewind** | The window is part of `s.encounter`, so undo puts it back as it was: undo of a legendary action reopens the window with that creature offered again; undo of the `endTurn` that opened it takes the table back into that turn. `history.js` gets a label for each new action type (`ACTS` and the `phrase` switch in `describeStep`; a test fails for an action with none): "Verdigris: Pounce" (the option's name is read from the creature, as `act`'s is), "Skipped Verdigris's legendary action", and one for `legendarySet`. The timeline records the events, so `recall()` and an AI DM can read them |
| **The DM-helper** (dm-helper.md, PR #681, still open) | A creature whose intention is Talk or Give up is never offered a harmful option by the AI, and its window card says so. H10's "boss marks" for legendary actions and Legendary Resistance are replaced by the real counters of Decision 2; H10 keeps marks only for what the engine still does not count |
| **The to-do tray** (#684) | A "You run" card is no longer made for a block the engine runs. It is made for each `manual` option and for Spellcasting still as text, so the DM still has the reminder for what is theirs |
| **Stepping away, standing in** | A creature set aside is not offered. A stand-in (`standIn`) plays its windows as the brain does (Decision 8) |

### Decision 5: the actions

```js
{ type: 'legendary', actor, option, to?, target?, targets?, hex?, pick? }   // take one option
{ type: 'legendary', actor, skip: true }                                    // pass for this window
{ type: 'legendary', done: true }                                           // close the window
{ type: 'legendarySet', actor, set: { acts?, resisted?, lair?, show? } }   // the DM's adjustments
```

- `legendary` is sent by whoever controls the creature: the DM for nearly every one; a player who
  runs a legendary creature (a homebrew ally) for theirs. `done` is the DM's.
- **Taking an option** is one action: `to` is where the move part ends (optional: no move), `target`
  / `targets` / `hex` aim the `use` or the `effects` as the same fields aim `act`, and `pick` is the
  action id where `use` names two. Everything is checked before anything changes: the window is
  open and offers it; it has not taken one in this window; the uses pay the cost; `again` does not
  bar it; the move fits the budget; the aim is legal from where the move ends.
- Events: `legendary { actor, option, name, after }`, then the move's and the action's own events
  (`moved`, `attack`, `damage`, `save` ...), then a `manual` for a `manual` part. The window's own
  events (`legendaryWindow { after, offered }`, `legendarySkip { actor }`) are the DM's.
- `legendarySet` is the DM's only, outside a fight too. It is told to no player (no event a player
  is sent), but `show`, which changes what players are sent.

Refusals are in words and change nothing: "Verdigris has no legendary action left this round.",
"Noxious Miasma can't be taken again until the start of Verdigris's next turn.", "Verdigris has
already taken a legendary action after this turn.", "Rend can't reach Brenna from there."

### Decision 6: Legendary Resistance is a choice: only when it matters, and the DM is asked when the engine cannot tell

**Where.** Every saving throw whose outcome is final: a spell's or an action's save step
(`effects.js`), a save repeated at a turn's start or end and a Concentration save (`durations.js`),
a called save (`engine/dm.js`, #694, whose `manual` note this replaces), and the saves inside
`engine/resolve.js` (strike options, falls, riding). One function, `resistFailure`, is called at
each, after every reroll and rescue (Countercharm, Bardic Inspiration and the like), so it is the
last word on a save. A test lists every call of `savingThrow` and fails if one is not followed by
it, as `imports.test.js` pins import cycles.

**What can be resisted.** Any failed save, an automatic failure too (Paralyzed on a Dexterity save):
the SRD says "if it fails a saving throw" (owner, 23 Nov, leg-3: "Any failed save"). Not an attack roll, not a check. It is not a Reaction,
has no limit a round and may be used on its own turn.

**The instruction.** Legendary Resistance is listed by `reactionsOf` as a choice of the creature's
(`kind: 'free'`, as Indomitable's reroll is), set with the existing `reactions` action and kept on
the creature, private to its controller and the DM:

| Instruction | On the screen | What the engine does at a failed save with a use left |
|---|---|---|
| `matters` (the default) | Only when it matters | Spends it by itself when the failure matters (below), lets a failure that changes nothing stand, and asks when it cannot tell |
| `ask` | Ask me every time | Stops and asks the creature's controller (Decision 10) |
| `always` | Every failed save | Spends it while uses last |
| `never` | Never | Lets every save fail |

`matters` is a new value in `WHEN` (`reactions.js`), "Only if the failure matters", beside `miss`. It is the starting value for every legendary creature (owner, 23 Nov, leg-2). The DM can switch one creature to `ask`, `always` or `never` on its card or in its settings.

**Asking the DM.** Today a question about the DM's own creature is not asked: the DM is told and
nothing waits. Legendary Resistance is the one exception, because the brief asks for a choice and
not a note: `askDM` (beside `ask` in `engine/shared.js`) stops the action and puts the question in
`s.pending` addressed to the controller, which for a monster is the DM. Everything else about it is
the existing machinery: the copy before the action, the re-run on `react`, the numbered question.
`mayAsk` (`reactions.js`) answers yes while any creature in play has a use left under `ask` or `matters`, so the copy
is taken (about 1.4 ms at 70 creatures, DEBT T55). Where an action cannot stop (no copy was taken),
the engine applies the failure and puts the question to the DM as today's `manual` note, and says
so. The answer is `react` with `take: 'legendary-resistance'` or `null`.

**When a failure matters** (one pure function, `failureMatters`, shared with the AI of Decision 8):

Beej's reading of leg-2 and leg-3, confirmed by the owner (leg-11): every failed save can be resisted
(leg-3), and a failed save *matters* when failing it changes something for this monster. One that
changes nothing never spends a use.

1. it would apply a condition the creature is not immune to (any of the SRD's fifteen), or keep one
   that a repeated save would have ended;
2. it would end the creature's Concentration;
3. it would run a `kill`, `teleport` (of the creature), `set` or `summon` step on it, or change its
   form;
4. it would do damage the creature does not resist and is not immune to, counting the difference
   between failing and succeeding (all of it where a success takes none). There is no Hit Point
   threshold: a fireball against a creature with natural fire resistance or immunity changes nothing
   and does not spend a use;
5. otherwise it does not: a failure that changes nothing never spends a use. A failure the engine cannot read (a `manual` step under `onFail`) is
   asked, never guessed.

**What is recorded.** The `save` event keeps the roll and gets `success: true, resisted: true`; the
creature's `resisted` count goes up by one; the outcome that follows is the success's. A Concentration
save that was resisted keeps the Concentration.

### Decision 7: never pretend

| What the engine cannot do | What happens |
|---|---|
| An option that casts a spell (most dragons have one or two; DEBT M6) | Entered with `manual` until M6. Offered like any other; taking it spends the use, tells the players its name, and makes a to-do card with the stat block's words and the tools (Call for a roll, Damage, Condition). When M6 lands, the option gains `cast` (an amendment of this spec there) and becomes the engine's |
| A part the vocabulary lacks (the lich's damage round the space it teleported from, the tarrasque's Medium-or-smaller Prone, the aboleth's "if it has a creature Charmed or Grappled") | The rest of the option runs; the part is a `manual` step with its words |
| A failed save that cannot stop to ask | The failure applies and the DM is asked by a `manual` note (#694's behaviour) |
| A creature with a Legendary Actions or Legendary Resistance trait still as text (an entry not yet converted, an old homebrew pack) | Today's behaviour: the "You run" card, nothing offered, nothing counted. The window never opens for a creature with no block |

### Decision 8: the AI recommends, and takes one when told to

One pure function, `legendaryPick(s, id)` in `ai.js`: the option the brain would take now, with its
aim and one line of why, or `null` (skip). Same state, same pick; no die, no clock.

- **What it prefers**, from the SRD's "uses them as often as it can": a use not taken before its next
  turn is lost, so it takes one in every window where an option is worth taking. Among them: an
  option with `again` or a limited `use` first (the SRD's "as quickly and as often as possible" for a
  limited ability), then an area option that catches two or more foes, then an attack on the foe the
  brain would attack on its turn (after the move part, if the option has one).
- **What it never does:** pick a creature at 0 Hit Points; pick a `manual` option (it is the DM's:
  shown, never sent by the AI); act under a Talk or Give up intention (dm-helper).
- **Who uses it.** The DM's browser, as for turns (`idled()` in `app.js`). The device setting "Run
  monsters automatically" stays the master. Per creature, a second switch: **Legendary actions:
  Suggest** (the default: the card opens with the pick armed, one tap) or **By themselves** (the
  browser sends the pick, or the skip, after the usual pause). When dm-helper's hands exist, the
  creature's hand decides instead (Plays itself: by themselves; Suggests or I'll play it: suggest).
- **Legendary Resistance** has no AI part beyond `failureMatters`: it is decided inside the action, in
  the engine, by the instruction of Decision 6.

### Decision 9: what players are sent

| Thing | A player is sent |
|---|---|
| `e.legendary`, `e.legend` of a foe | nothing: a foe is a `seenRecord`, which lists neither |
| Its uses left | nothing, unless the DM sets `show`: then the creature's record carries `legend: { left, max }` and its health bar says "Legendary 2/3" |
| `s.encounter.between` | `between: true` in the fight's view: the table is waiting; never after whom, for whom, or what is offered. The turn line reads "Waiting for the DM". A player's action then is refused with the sentence of Decision 3 |
| `legendary { actor, option, name }` | as an `act` event is: who and the option's name, for a creature the party knows of. Then the move, the attack and the damage as any |
| `legendaryWindow`, `legendarySkip`, `legendarySet` | nothing (new types not in `viewEvents`' list are dropped) |
| A Legendary Resistance question | the DM (or the creature's player) gets the question; others get `{ waiting: true }` where they perceive what set it off, as for any question (`viewPrompt`) |
| A resisted save | the save as any save of a foe is sent (`id`, `abil`, `success`, and the DC where it is theirs to know), as a success, with nothing that names Legendary Resistance (owner, 23 Nov, leg-4). The log: "Verdigris shrugs it off". Never the words "Legendary Resistance" and never the count |
| The instruction (ask, matters ...) | nothing (`reactions` is private to the controller and the DM) |
| The lair mark | nothing, but what follows from it: a fourth use taken is seen being taken |
| A homebrew legendary monster | its events as `stampHomebrew` and `viewEvents` already settle for the rest of its block |

**What players can still work out, and why that is fine.** The table waits after a turn only when a
legendary creature could act, and does not wait once it has no use left; a player who counts can
tell a fourth use (a lair) when it comes, or that a question was asked. A player who counts the
"shrugs it off" lines may guess the trait, as at a real table. At a real table a DM's
pause tells as much. The `twin()` tests below hold the rest: worlds that differ only in uses left
(both above 0), the lair mark, the instruction, or the options the DM did not take send every player
the same bytes.

### Decision 10: the DM's screen

Everything sits in places the one-token menu already has, and both cards are **prompts** (rank 1 of
its Decision 2: the engine waits for this person), so they fold the menu and come first.

**The window bar.** It rises when a window opens, in the place the aim bar takes, and leaves the map
clear above it.

```
Wide (one row per creature offered):
 After Brenna's turn · Verdigris · Legendary 2/3 ·  [▸ Pounce → Brenna]  [Noxious Miasma…]  [Mind Invasion (you run)]  [Skip]   ⚙
Phone, 390 x 844 (a bottom sheet, rows 56 px):
 ┌ Verdigris may act · 2 of 3 left ─────────── ⚙ ┐
 │ ▸ Pounce: moves, Rend on Brenna     [Do it]   │   the AI's pick, aimed, one tap
 │   Noxious Miasma (3 caught)          [Aim]    │   arms the aim bar: tap a point, Send
 │   Mind Invasion · you run it         [Use]    │   spends it; opens the to-do card
 │                [ Skip ]                       │
 └───────────────────────────────────────────────┘
```

- The pick is first, marked ▸, with its aim filled in and its why on a second line (from
  `legendaryPick`). **One tap plays it.**
- Another option arms the ordinary aim bar: the destination for its move first (where it has one),
  then the target. Send sends one `legendary` action.
- **Skip** passes this creature; with several creatures, **Done** under them passes all.
- ⚙ opens the creature's two switches: Legendary actions (Suggest / By themselves) and Legendary
  Resistance (Only when it matters, the starting choice / Ask me every time / Every failed save /
  Never), and "In its lair".
- Under **By themselves**, no bar opens: the browser plays the window after the usual pause, and a
  toast says what was done ("Verdigris: Pounce on Brenna. Undo").

**The Legendary Resistance card.** A question, like a reaction question. Under the starting choice
it opens only when the engine cannot tell whether the failure matters; under "Ask me every time" it
opens at every failed save that a use could turn:

```
 ┌ Verdigris failed a save ───────────────────────┐
 │ Wisdom, DC 17, rolled 12, against Hold Monster  │
 │ It would be Paralyzed.                          │
 │ Legendary Resistance: 3 of 3 left today         │
 │  [ Use it: it succeeds ]   [ Let it fail ]      │
 │  Only when it matters ▾                         │
 └─────────────────────────────────────────────────┘
```

The line "It would be ..." is written from the save's `onFail` (conditions, Concentration, damage
on average, the spell's name). "Only when it matters ▾" sets the instruction for this creature on the
spot.

**Counters.** In Turns, under a legendary creature's row, the DM's line: "Legendary 2/3 ·
Resistance 3/3". DM tools › Creatures: "In its lair" and "Show its legendary uses to the players"
for a selected creature. A module's or a preset's encounter may carry `lair: true` on a creature
(an amendment of [`adventure-module.md`](adventure-module.md) when the encounter keys are added, dm-helper H12).

## Vocabulary and state additions

All optional: an entry or a state without them reads as "no legendary anything".

| Where | Addition |
|---|---|
| `content/schema.js`, monster | key `legendary: { actions?: { uses, options }, resistance?: { day }, lair?: { uses?, resistance?, xp? } }`; the option keys `id`, `name`, `text`, `cost`, `move` (`speed`, `mode`, `provokes`, `after`), `use`, `target`, `effects`, `again`, `manual`; `LEGENDARY_AGAIN = ['nextTurn']`, `LEGENDARY_SPEEDS = ['half', 'full']`; the monster `SHAPES` list, `HOMEBREW_TYPES`, `HOMEBREW_LENGTHS['legendary.options'] = 8` |
| `reactions.js` | `WHEN.matters`; Legendary Resistance in `reactionsOf` (`kind: 'free'`, `on: 'resist'`, options `matters`, `ask`, `always`, `never`; default `matters`) |
| a creature | `e.legendary` (the copied block), `e.legend` (Decision 2) |
| `s.encounter` | `between: { after, round, offered, done }` while a window is open |
| actions | `legendary`, `legendarySet` (Decision 5), in a new domain module `engine/legendary.js` |
| events | `legendary`, `legendaryWindow`, `legendarySkip`; on `save`, `resisted: true` |
| `view-fields.js` | `legendary: 'sent'` and `legend: 'sent'` in `PARTY_FIELDS` (a creature of the party: its own block and counters; a player running a legendary ally sees them). A foe goes through `seenRecord` in `view.js`, which names its fields one by one and so sends neither; `test/view-fields.test.js` fails until both new fields are classified |
| `view.js` | `viewEncounter` gains `between: true` while a window is open (it builds the encounter's view field by field, so `between` itself is never sent) |
| `history.js` | a label for `legendary` and `legendarySet` (`ACTS`, `phrase`) |
| `migrate.js` | `VERSION` 31 to 32 (`scenario.js` reads it): an SRD monster gets its template's `legendary` block and a `legend` record |
| `AGENTS.md` | the Layout list names `engine/legendary.js`: `test/guides.test.js` fails for a rules module it does not name. This spec said CLAUDE.md; CLAUDE.md only includes AGENTS.md |
| `shared.js` / `reactions.js` | `BETWEEN_OK` (`reactions.js`); `askDM` (`engine/shared.js`, stage L2); `UNLOCKED` (`engine/shared.js`) needs no entry: a command-locked creature is a companion, never a legendary one |

Limits: 5 uses, 8 options, cost 3 (and never more than `uses`), 3 ids in a `use`, Legendary
Resistance 10 a day, an option's text 400 letters.

## Build plan

Each stage is one small pull request with its tests, sized for one worker and one review. L1b, L1c and L2 are engine jobs for the strongest model (they touch `advanceTurn`, the walk and every save site); L1a, L1d and the content stages are for a mid-sized one.

**`engine.js` is named in the issue of every stage that touches it** (AGENTS.md hard limit: it is not edited unless the issue names it). Here that is L1b (the `BETWEEN_OK` check in `apply()` and the handler table) and L1c (the handler table gains nothing new if `legendary` is already spread in L1b, so L1c does not name it). `packages/server/src/tables.js` is touched by none.

Every stage that changes a creature's fields must keep the replays pinned to main passing (`e23-replay`, `companions-brain-replay`, `companions-brain-history`, `starters-built-golden`, `items-between`, `summons-385`, AGENT-BRIEF): a new field in the hashed state is normalised out in them with a comment, never re-recorded.

| Stage | What | Size and kind | Files | Needs | Done when |
|---|---|---|---|---|---|
| L1a | **The data and the state.** In `content/schema.js`: the `legendary` key, its option keys, `LEGENDARY_AGAIN`, `LEGENDARY_SPEEDS`, the limits, the monster `SHAPES` entry, `HOMEBREW_TYPES`, `HOMEBREW_LENGTHS['legendary.options']`, and the lint. In `content/reader.js`: the plain-words reading (replacing its `LEGENDARY` pattern for an entry that has the key). `makeEntity` copies the block as `e.legendary` and adds `e.legend`. `migrate.js` bumps `VERSION` to 32 and gives an SRD monster the template's block. Data, `checked` against the SRD: the unicorn, the adult green and adult blue dragons, the vampire, the lich, and the balor and pit fiend (resistance only); their two traits are taken out. The called save's note in `engine/dm.js` reads `e.legendary.resistance` | engine S, content S | `content/schema.js`, `content/reader.js`, `content/srd52/monsters-a-c.js`, `monsters-h-o.js`, `monsters-p-z.js`, `engine/sheets.js`, `engine/dm.js` (one line), `migrate.js`, `view-fields.js` (the two `PARTY_FIELDS`), tests: lint, the reader goldens (`reader.test.js`, `reader-kinds.test.js`, `reader-when.test.js`), `homebrew-values.test.js`, migrate, the called-save test | none | Test 1 passes (the replays above, with `legendary` and `legend` normalised out); a bad block is refused by the lint and a homebrew pack's block is read back in plain words; an old save migrates; `npm run content` counts the seven blocks and no "You run" card is made for them; `view-fields.test.js` passes. No engine behaviour has changed. No `engine.js` |
| L1b | **The window.** `advanceTurn` opens and closes `s.encounter.between` and goes on from where it stopped; `engine/legendary.js` (new) holds the window's open and close, `legendary` with `skip` and `done`, and `legendarySet`; the handlers are spread into the table; `BETWEEN_OK` and its refusal. `viewEncounter` sends `between: true`. History labels for `skip`, `done`, `legendarySet`. Lair XP is not here. `AGENTS.md` names the new module (the guides test). A `twin()` scenario with a window open. At this stage an option cannot yet be taken: a window offers it, and a creature can only be skipped | engine L | `engine/resolve.js` (`advanceTurn`), `engine/legendary.js` (new), `engine.js` (the module in its table, the `BETWEEN_OK` check: **name it in the issue**), `reactions.js` (`BETWEEN_OK`), `view.js` (`viewEncounter`), `history.js`, `AGENTS.md`, tests, one `twin()` scenario | L1a | Tests 2, 3 and 5 pass; test 7 passes for skip and done (undo of a skip reopens the window; undo of the `endTurn` goes back into that turn); test 1 still passes; the twin scenario passes |
| L1c | **Taking an option.** `legendary` with `option`: the destination and the aim checked before anything changes; the move part through the engine's walk with its own budget; `use` of the creature's own action; `target` and `effects` as `act`'s; `cost` and `again`; a `manual` option spends the use and makes its `manual` event (the to-do tray then makes its card); the `legendary` event; `acts` and `again` regained in `beginTurn` and at the end of a fight; a creature Incapacitated or dropped mid-option. A label for it in `history.js`. Data: none new | engine L | `engine/legendary.js`, `engine/resolve.js` (`beginTurn`, end of fight), `engine/movement.js` (only if the walk needs an export), `history.js`, `todo.js` (only if a `manual` option needs its "You run" card to name the option), tests. `engine.js` is not named: it is not touched | L1b | Tests 4 and 6 pass; test 7 passes for an option; every refusal in Decision 5 is tested with the state compared whole. A re-run after a reaction spends the use once |
| L1d | **What players are sent, lair XP, README.** `legendary` event as an `act` is, for a creature the party knows; the `legendaryWindow`, `legendarySkip`, `legendarySet` events dropped from `viewEvents`; `show` and the `legend: { left, max }` record on the creature's view; `s.encounter.between` never sent as anything but `true`. `rewards.js` reads `lair.xp` for a creature marked in its lair. `packages/server/README.md` lists the new actions and events. The `twin()` scenario for the rest: worlds that differ only in uses left (both above 0), the lair mark, the options not taken, `show` off; with `show` on the count is sent | engine M | `view.js`, `view-fields.js`, `rewards.js`, `packages/server/README.md`, `packages/server/test/twin-worlds.test.js` (or a new file beside it), `hidden-ids` test, tests. No `engine.js` | L1c | The part of test 12 that does not need Legendary Resistance (no saving throw is resisted yet) passes, and a `show` world sends the count; lair XP is tested; every existing test passes unchanged |
| L1e | **The other 23 legendary monsters** entered, each `checked` (was L1b). Four hands may split it by file | content M | `content/srd52/monsters-*.js` | L1a (L1c to run them in a test) | All 32 SRD monsters with a legendary trait have a block and no legendary trait; the reader reads each; `npm run content` counts them |
| L2 | **Legendary Resistance**: `resistFailure` at every save site, `askDM`, the instruction and `matters`, `failureMatters`, the `resisted` save, the called save's note replaced | engine M | `engine/shared.js`, `engine/rolls.js`, `effects.js`, `durations.js`, `engine/dm.js`, `engine/resolve.js`, `reactions.js`, `view.js`, tests, a `twin()` scenario (test 12's Legendary Resistance part). `engine.js` is not named unless `react` needs a change for `take: 'legendary-resistance'`; if it does, the issue names it | L1a (L1d for the `twin()` file). #694 is merged | Tests 8 to 11 pass, and test 12's resisted-save and instruction part. It may be split in two if the save sites are many: `resistFailure` at the sites first, `askDM` and `matters` after |
| L3 | **The AI**: `legendaryPick`; the browser loop plays windows under "By themselves"; the pick feeds dm-helper's `advise` when H7 exists (dm-helper is PR #681, still open) | rules M, client S | `ai.js`, `packages/client/app.js` (`idled`, line 676 today), tests | L1c (L2 for `failureMatters`) | Tests 13 and 14 pass |
| L4 | **The DM's screen**: the window bar and sheet, the Legendary Resistance card, the counters in Turns, the creature switches, "In its lair", "Show its uses", the players' "Waiting for the DM"; a smoke pass at 390 x 844 and wide | client M | `packages/client/legendary.js` (new), its CSS, `tracker.js`, `reactionprompt.js` (the card beside the reaction question), the DM tools' Creatures section, `scripts/smoke/` and both places the smoke pass is registered (`scripts/smoke.mjs`, `.github/workflows/smoke.yml`) | L1d, L2 (L3 for the pick) | A DM plays a dragon's windows with one tap each and answers a Legendary Resistance question with one tap, on a phone; a player in the same smoke pass sees the events and "Waiting for the DM", nothing else |

**Order.** L1a, L1b, L1c, L1d in turn (each needs the one before; L1a and L1e's data are the only content). Then L2 (the owner's party will meet saves against dragons before anything else), then L3 and L4 side by side, L1e whenever a content hand is free. Then DEBT M6, which turns the `manual` cast options into the engine's (recommended next: leg-9, which the owner accepted).

**Which model.** L1b and L1c are the delicate ones (`advanceTurn` stops and resumes; the walk and the reaction re-run). If either is still too much for one review, cut L1c at the move part (L1c: `use`, `effects`, `manual`, `cost`, `again`; L1c2: `move`).

## Tests that say it is safe

1. **No legendary creature, no change.** Recorded fights from main replay byte for byte, events and
   state, with L1 in.
2. **The window opens and closes by the SRD.** A dragon and three characters: a window after each
   character's turn and none after the dragon's own; none before the first turn; one after the
   round's last turn, before the round number moves. Uses come back at the dragon's turn's start,
   not before. A window after a dying character's death save and after a turn played for one set
   aside; none after a held turn.
3. **Who is offered.** Not an Incapacitated, a down, a dead or a set-aside dragon; not one with no
   use left, or whose only options are barred by `again` or a spent breath, or that has nothing to
   aim at. With nobody offered the next turn starts in the same action, as test 1.
4. **Taking and refusing.** Pounce moves at most half its Speed and makes one Rend; a destination
   too far, a target out of reach from it, a second option in the same window, a cost over the uses
   left and an `again` option a second time are each refused with nothing changed (the state
   compared whole). Noxious Miasma runs its saves; a `manual` option spends the use and makes its
   `manual` event and to-do card.
5. **Between turns, nothing else.** Every action type is tried while a window is open: only
   `BETWEEN_OK` passes; the rest are refused and change nothing (the pattern of
   `apply-restore.test.js`).
6. **Reactions and the re-run.** An Opportunity Attack on the Pounce asked of a player: the
   `legendary` action waits, the answer re-runs it, the use is spent once. The dragon dropped by it
   leaves the window. A legendary action that drops the last character ends the fight and the
   window.
7. **Undo.** Undo of a legendary action reopens the window with the creature offered; undo of the
   `endTurn` that opened it goes back into that turn; redo gives the same state.
8. **Every save site.** A test reads the sources and lists each `savingThrow(` call; each is
   followed by `resistFailure` (or is on a list of exceptions with a reason, such as a save that
   only judges). A dragon with uses left under `always` succeeds on a spell's save, a Concentration
   save, a repeated end-of-turn save and a called save.
9. **Asking the DM.** Under `ask`, a party caster's Hold Monster stops at the dragon's failed save;
   the DM's `react` with the use re-runs the cast, the dragon succeeds, `resisted` goes up by one; a
   decline applies Paralyzed. The same dice either way up to the save.
10. **`matters`.** A new legendary creature starts on `matters`. Paralyzed, Banished, Concentration
    lost, or damage it does not resist: spent. A failed save that changes nothing (a Fireball
    against a creature immune to fire, a condition it is immune to): not spent, not asked. A
    `manual` step under `onFail`: asked.
11. **Long Rest.** Uses come back only when the DM's Long Rest names the creature.
12. **Hidden information (twin).** (L1b has its own scenario for an open window; L1d the part without Legendary Resistance; L2 the rest.) Also: a resisted save is sent without the words "Legendary
    Resistance" (leg-4). Worlds differing only in Legendary Resistance left (2 or 3), the
    lair mark, the instruction (`ask` answered by a decline, or `never`), `show` off, and the
    options not taken: every player is sent the same bytes. With `show` on, the count is sent.
13. **The pick.** Same state, same pick (1,000 seeded states twice); every pick is accepted by
    `apply()` on a copy; never a creature at 0 Hit Points; never a `manual` option; a skip where
    nothing harmful is legal.
14. **By themselves.** The client loop plays a round of windows for a dragon left to itself, with
    the device switch on, and plays none with it off.

## Risks

- **`advanceTurn` becomes re-entrant.** The loop must stop at a window and go on from the same
  place later, with its stalemate counters. It is the most delicate change here; test 2 and the
  replay of test 1 are its guard. The handler stays in `resolve.js`; `engine/legendary.js` only
  opens and closes the window through one function.
- **A save site missed** would let a dragon fail where it could have resisted, silently. Test 8
  walks the sources so a new save site cannot be added without it.
- **The first question the DM's own creature waits on.** Monster turns played by the AI can now
  stop on a question to the DM (a dragon's breath catches another legendary creature). The AI loop
  must not answer it and must not keep sending; it waits for the DM, who is at the table. Solo play
  is the DM too.
- **The table slows down.** Five characters and their companions open five or more windows a round.
  Mitigated by opening only when something can be taken, by one tap on the pick, and by "By
  themselves". If it still drags, leg-5 (the table waits whenever something can be taken) is the lever; leg-1 is settled as one at a time.
- **"Only when it matters" can still be wrong at the edges.** The engine reads the save's steps;
  anything it cannot read is asked, and the DM can switch a creature to "Ask me every time".
- **What a pause tells** (Decision 9): accepted and documented; the twin tests hold the rest.
- **Data accuracy.** Fifty-odd options from the SRD, plus the owner's adventure in his pack. Each
  entry `checked` only after every number is compared; the reader's plain words are the reviewer's
  check.
- **Older published blocks** (costs, lair actions) in the owner's pack: `cost` covers the first;
  lair actions are not SRD and stay the DM's (a `manual` note, or a later spec).

## Out of scope

Lair actions and regional effects (not in the SRD 5.2.1); mythic actions; how identical monsters
share initiative; monster spellcasting itself (DEBT M6, which this spec leaves a place for).

## The owner's answers (23 Nov)

The ten questions this spec asked, as the owner answered them on the project board. Each is now
a decision, and the sections named were changed to follow it.

- **leg-1. One legendary action after each turn.** Owner, 23 Nov: one at a time (the default). One
  per creature per window. See Decision 3.
- **leg-2. Legendary Resistance by default.** Owner, 23 Nov: "I'm not sure what you mean by only
  when it matters. If you mean maybe they have natural resistance to a fireball, then yes, only
  when it matters." Beej's reading, confirmed by the owner (leg-11, and leg-10's note): the default for each monster is "Only
  when it matters" (not "Ask me"), and with leg-3 a failed save matters when failing it changes
  something for the monster (damage it does not resist or ignore, a condition it is not immune to,
  and the like); a failed save that changes nothing never spends a use. The DM can still switch a
  monster to "Ask me every time". See "In plain words", Decision 6 (table, the `matters` list),
  Decision 10 (card), the vocabulary table and test 10.
- **leg-3. What can be resisted.** Owner, 23 Nov: "Any failed save". See Decision 6, "What can be
  resisted" (it was already so) and "When a failure matters", whose Hit Point threshold is gone.
- **leg-4. The words players see.** Owner, 23 Nov: "Just 'it shrugs it off'". Players are never
  shown the words Legendary Resistance. See "In plain words", Decision 9 and test 12.
- **leg-5. Wait when only poor options are legal.** Owner, 23 Nov: the default. The bar opens
  whenever something can be taken, with Skip one tap away.
- **leg-6. "In its lair".** Owner, 23 Nov: the default. A switch you set per creature, and a key on
  a prepared encounter; off unless set. See Decisions 2 and 10.
- **leg-7. Showing uses to players.** Owner, 23 Nov: the default. Never, unless you switch it on for
  a creature. See Decision 9.
- **leg-8. AI default.** Owner, 23 Nov: the default. "Suggest", with "By themselves" per creature.
  See Decision 8.
- **leg-9. Monster spellcasting (DEBT M6) next.** Owner, 23 Nov: the default. M6 straight after L2,
  ahead of L1b and before dm-helper's sharper tactics. See the build plan's Order.
- **leg-10. A forgotten legendary action.** Owner, 23 Nov: "This should be prompted at the end of
  every player's turn so not sure how it becomes late. I wouldn't want to undo someone else's
  turn." Beej's reading, confirmed by the owner (leg-11, and leg-10's note): the game offers a legendary action after every
  other creature's turn, so none is ever late; there is no late legendary action, and the fix is
  never an undo across another player's turn. The old answer (undo back to the window) is dropped.
  See Decision 3.

## Confirmed by the owner

- **leg-2** (and leg-3): confirmed on the board as leg-11 ("A failed save that changes nothing, a Fireball on a fire-immune monster, never spends Legendary Resistance?": "Yes, that's what I meant"). "Only when it matters" means only when failing would actually do something to the monster; any such failed save counts.
- **leg-10**: the owner's note ("This should be prompted at the end of every player's turn so not sure how it becomes late. I wouldn't want to undo someone else's turn") settles it: a window is offered after every other creature's turn, so none is ever late, and no fix-up undoes another creature's turn.
- Still the draft's own, to be shown to the owner when L2 is built: the exact `failureMatters` list (a condition, Concentration, `kill`/`teleport`/`set`/`summon`/form, damage not resisted) and the rule that an unreadable `manual` step is asked, not guessed.
