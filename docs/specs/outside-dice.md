# Spec: outside dice

Status: draft by an agent, to be reviewed by the design owner. Issue #351 (the
owner's request on the project board, 15 November 2026). Nothing here is built. No
code is written by this spec. Browser and device facts were checked on 15 November
2026 against the sources listed at the end ("Sources"); each is cited where it is used.

The owner wrote:

> I'd like the project to be able to take outside dice. I know it's a risk but one
> that the dm should be able to accept, either use the game's dice or allow
> connections to dice rollers or the like. Internally I'd like to be able to prompt
> someone to roll certain dice and then be able to use the camera on a phone to see
> what's rolled, so you'd need to be able to do the image processing once it's
> captured. Perhaps a good place to use Jev or ???. Ultimately I'd like to create
> bluetooth dice that can connect to the game.

## Problem

Today every die in a game comes from the seed in the game state. That is what lets
any game replay exactly, lets undo give back the same dice, lets a reaction prompt
re-run an action and get the same rolls, and lets the server be the only judge of
what happened. Many players want to roll their own dice: the feel of it, the habit
of a table, the dice they own. The owner wants the DM to be able to accept that, to
ask a named person to roll named dice, to read physical dice with a phone's camera,
to take results from other dice rollers, and in the end to connect Bluetooth dice.

An outside result is a number the game did not make and cannot check. This spec
says how such a number enters the engine without breaking its rules: as an
**input recorded on the action**, validated by the server, attributed and marked,
under the DM's control, with a timeout and a fallback to the game's dice. It says
which rolls may be asked for and which stay on the game's dice, and why; what
players are sent and never sent; what the DM accepts by allowing it; how a
character's portable history shows it; and how the sources (typed, camera,
third-party rollers, Bluetooth) are built in stages, with what each device and
browser supports today.

## Rules that bind this design

- **Everything goes through `apply()`.** Asking for dice, answering, the DM's
  overrule and the timeout's fallback are actions or the engine's own steps. A
  client never applies a roll; it sends faces and reads events.
- **The server is authoritative.** The faces a player sends are a claim. The
  engine, run by the server with the sender's role, checks that the right person
  answered the question that is waiting, with the right number of dice of the
  right sides, each in range. It never takes a total, a hit, a success or an
  amount from a client: it works those out from the faces, as it does from its own.
- **The rules package is pure.** No clock, no network, no `Math.random`. The rules
  cannot time anything out; the host (the server, or the solo tab) runs the clock
  and sends the fallback as an action. An outside face is part of the recorded
  input, so a game still follows from its state and its actions alone.
- **Any game replays exactly.** The faces are kept with the waiting action
  (`pending.answers`), the same way a reaction's answer is; the answer is itself an
  action. Undo and redo restore state patches down to the dice seed; save and load
  keep a waiting question; the timeline records each roll with its source.
- **A rejected action changes nothing.** Faces that do not fit leave the question
  waiting exactly as it was (the `react` pattern in `engine.js`).
- **The engine never pretends.** A roll the engine cannot ask for (Decision 5) is
  rolled on the game's dice and said to be; a source that cannot be read
  (a blurred photograph) is never guessed at: the player types, or the game rolls.
  Nothing is shown as "verified" that is a player's claim.
- **Players are sent only what their characters could know**
  (`hidden-information.md`, `dice.md` section 3). A prompt never tells a player of
  a roll they would not be sent, of a hidden creature, of a DC or of a monster's
  number.
- **Content is data; the repo is SRD-only.** Nothing here adds content. The rules
  this spec leans on are from `reference/srd52/srd52-flow.txt`: "Roll Two D20s"
  (Advantage and Disadvantage: roll a second d20, use the higher or the lower),
  "Interactions with Rerolls" (with Advantage or Disadvantage only one die may be
  rerolled or replaced), "Heroic Inspiration" (reroll any die immediately after
  rolling it), "Critical Hits" (roll the attack's damage dice twice, Sneak Attack's
  too) and "Damage against Multiple Targets" (roll the damage once for all targets).
- **No dependency, no bundler, no network at run time** beyond the table server.
  A vendored library or a connection to another service needs a reason written in
  `docs/DESIGN.md`, as the Three.js exception was argued.
- **Phones are first-class.** The prompt, the number pad and the camera capture
  work at 390 x 844 with touch; the phone is the device most players would roll
  beside.

## Where we are

| Feature | Exists today | Does not exist |
|---|---|---|
| **Dice** | `rng.js`: `rand`, `die(state, sides)`, `roll(state, expr, { crit })`; ChaCha20 keyed by the host (`{ key, n }`), Mulberry32 for old games and solo; `d20Faces`, `faceSum`. About thirty call sites roll: d20 tests in `engine/rolls.js` (`deathSave`, `savingThrow` with its `reroll`, `recharge`), `engine/resolve.js` (`rollToHit`, damage, falls, Uncanny Dodge's cut), `engine/world.js` (`rollInit`), `engine/features.js` (checks, Second Wind, healing), `effects.js` (a step's damage, healing and Temporary Hit Points), `engine/rests.js` (Hit Dice, regaining), `engine/casting.js` (Overchannel), `engine/attacks.js` (the Prey), `engine/shared.js` (`rollDice`: Bless, Bane). | Any roll from anywhere but the seed. |
| **Faces in events** | `dice.md` section 2: every roll event carries `dice: [{ sides, value, drop?, neg? }]` and `bonus`; `by` the roller (DM only). | A mark of where faces came from. |
| **What players are sent of rolls** | `view.js`, `facesFor`: a player gets faces only where they get the number they make; a monster's roll is hit or miss, success or failure. | — |
| **Asking a player and waiting** | `engine/shared.js`: `ask()` throws `Pause`; `engine.js` `apply()` thaws the state to before the action (dice seed too), keeps `pending = { n, action, ctx, answers, ask }`, sends `reactionAsked` to the one player; `react` re-runs the action from the same state with the answers so far. `reactions.js`: `mayAsk` (when a snapshot is taken), `WHILE_WAITING` (what may be sent while a question waits). `view.js` `viewPrompt`: the asked player gets the question, others `{ waiting: true }` only when the party perceives what set it off. Client: `reactionprompt.js` (a prompt that cannot be dismissed, the DM's card). | A question that asks for dice; a time limit (`DEBT.md` T8: "the server still has no time limit on a waiting question"). |
| **Rolls inside someone else's action** | Rolled on the player's behalf and labelled (`dice.md` section 4, limit; `DEBT.md` T6, T10). | Letting the player roll them. |
| **Throwing** | `diceThrow: 'auto' \| 'throw'` (`engine/dm.js` `SETTINGS`); under `throw` the action is sent at the throw; `client/dice.js` draws the engine's faces. | — |
| **Undo, redo, rewind** | `history.js`: reverse patches down to the seed; pins for the start of a fight and the last rest; `rewind` keeps `rng` moving ("new dice": the fight fought again rolls new dice). Undoing an answer to a question gives the question back, since the state before the answer held `pending`. Server: `undo`, `redo`, `rewind` in `tables.js`. | — |
| **Timeline** | `engine.js` `record()`: every event, with the creatures the party did not know of; `recall()`. | A source on a roll. |
| **Settings** | `state.settings`, the DM's `setting` action, validated against `SETTINGS`; every player is sent all of them. | Any setting about dice sources. |
| **Portable history** | `portable-characters.md` Decisions 2, 3 and 6: entries made on the server from what `apply()` returned (`lineageStep`), blocks signed per server, four grades, the level meter. Not built. | Any record of how a character's dice were rolled. |
| **Network and devices** | The server's CSP allows connections to its own origin only (`connect-src 'self'` and its WebSocket, `packages/server/src/index.js`, `securityHeaders`). No camera, no Bluetooth, no picture processing anywhere. One vendored library (Three.js, `packages/client/vendor/README.md`). | — |
| **State version** | 23 (`migrate.js`). | — |

## The ten decisions

### Decision 1: the table setting, and who rolls outside

**Question.** Who allows outside dice, at what grain (table, player, kind of roll),
and what is a joining player told?

**Options.**

- A. One table switch: on, every player rolls their own; off, nobody.
- B. A table switch that **allows** it, and each player **opts in** per character,
  optionally narrowed to kinds of roll; the DM may also roll their own creatures'
  dice.
- C. Per roll: the DM decides each time whom to ask.

**Choice: B, with C as the DM's tool on top.** Four new table rules in
`SETTINGS` (`engine/dm.js`), set by the DM's existing `setting` action:

| Rule | Values (first is the default) | Meaning |
|---|---|---|
| `outsideDice` | `off`, `players`, `everyone` | `off`: the game's dice only, as today. `players`: a player may roll their own characters' dice. `everyone`: also the DM's creatures, asked of the DM |
| `outsideWait` | `60`, `30`, `120`, `0` | Seconds a question for dice waits before it lapses; `0` never lapses (the DM answers) |
| `outsideLapse` | `game`, `dm` | What a lapse does: roll the game's dice there, or hand the question to the DM |
| `outsideCheck` | `none`, `dm` | `dm`: every outside answer waits for the DM to accept it before the action goes on |

Each creature may carry `dice: { kinds }`, set by its controller with the new
`diceFrom` action (and by the DM for anyone): the kinds of roll its controller
rolls outside, from a closed list:

`attack` (attack rolls), `damage` (damage, including an area's, and the extra dice
of a hit), `save` (saving throws, Concentration included), `death` (Death Saving
Throws), `check` (ability checks: skills, Search, Hide, forcing a door),
`initiative`, `heal` (healing and Temporary Hit Points it rolls, Hit Dice),
`extra` (dice a modifier adds to its roll: Bless's d4, Bane's, a Bardic
Inspiration die it spends).

`diceFrom { actor, kinds: [...] }` with an empty list, or `null`, goes back to the
game's dice. It is refused while `outsideDice` is `off` ("This table uses the
game's dice.") and for a DM's creature unless it is `everyone`. A creature with no
`dice` rolls on the game's dice. Turning `outsideDice` off does not clear `dice`;
it makes it sleep, so turning it back on restores everyone's choice.

**Who may turn it on.** The DM only (the `setting` action is the DM's). On the
official server the operator may forbid it for all tables (question 7).

**What a joining player is told.** Settings are sent to every player. When
`outsideDice` is not `off`, the waiting screen after joining and the character
claim say, in one line: "This table lets you roll your own dice. Rolls you enter
are marked in the log and in your character's record." When the DM turns it on or
off mid-game every player gets the `setting` event's log line. Who rolls outside is
public: the tracker and the character card show a small die mark with words
("rolls own dice: attacks, damage") on a creature with `dice`, so the table knows
whose numbers are claims.

**Reasons.** The owner wants the DM to accept the risk, and a table where one
player has dice and another does not is normal. Narrowing by kind covers the
common table habit (players roll their own attacks and damage; the game rolls the
rest). Per-roll asking (C) is kept as the DM's "ask for this roll" tool, which is
`everyone` with the DM answering, not a separate mechanism.

**Cost.** Four settings and one creature field. `dice` is public and small, so it
joins the creature allow list in `view.js` as it is.

### Decision 2: an outside result is an answer to a question, recorded on the action

**Question.** How does a number the engine did not roll enter the engine while
the game still replays exactly, undo still gives back the same game, and the
server stays the judge?

**Options.**

- A. **The client sends a finished action with its results** ("I attacked, I
  rolled 17, I hit"). Breaks the server's authority: the client computes the
  outcome. Refused outright.
- B. **The client sends faces in advance with the action** (`attack { faces: [17] }`).
  The client does not know how many dice the engine will roll until the engine
  rolls them (Advantage from a hidden reason, a reaction that interrupts, a hit
  that leads to damage, Sneak Attack, a crit doubling the dice), and asking it to
  guess would tell it things the engine has not yet decided. Works only for the
  first roll of an action; nothing inside a resolution.
- C. **A question, like a reaction prompt.** The engine runs the action; at the
  first die that belongs to an outside roller it stops (`Pause`), the state goes
  back to how it was before the action (seed included), and the action waits in
  `pending` with the answers so far and the question. The roller's controller
  answers with faces (`roll`). The action runs again from the same state with
  those faces; every point that asked before reads its answer; the next outside
  die stops it again. This is the mechanism `react` already uses.

**Choice: C.** One function, `rollFor`, in `engine/shared.js`, which every roll
site calls instead of `die`/`roll` for a creature's roll:

    rollFor(s, roller, kind, parts, { label, keep, crit }) -> { values, dice, from? }

`parts` are the dice that roll needs together, e.g. `[{ n: 2, sides: 20 }]` for a
d20 test with Advantage, `[{ n: 2, sides: 6 }, { n: 1, sides: 6, name: 'Sneak Attack' }]`
for damage. It **always draws the game's dice first** (Decision 3), then:

- if `roller` is not an outside roller for `kind` (Decision 1), or the roll may not
  be asked for (Decision 5), it returns the game's faces;
- if this run has an answer at this point (`RUN.answers[RUN.i]` with `dice`), it
  checks that the answer fits this question exactly (same roller, same parts) and
  returns the answer's faces, marked `from`;
- otherwise it throws `Pause` with a dice question (Decision 4).

The rest of each roll site is unchanged: Advantage still takes the higher of the
two values, a crit still doubled the count before the question was built (so the
question already asks for the doubled dice), Resistance still halves what the
faces make. **The engine works out every outcome from the faces; the client sends
only faces.**

**What is recorded, and where.**

- *While waiting:* `pending.answers` holds each answer given in this action, in
  order: `{ dice: { roller, faces, from, by } }` beside the reaction answers
  `{ reactor, take, slot? }` that already live there. A waiting table can be
  saved, loaded, sent, undone and replayed, as today.
- *When the action finishes:* each roll event carries
  `outside: { from, by }` (`from`: `typed`, `camera`, `bluetooth`, `roller:<name>`,
  or `dm` when the DM typed them; `by`: `player` or `dm`) and, for the DM only,
  `game: [faces]`, what the game's dice gave at that point. The timeline keeps the
  event as it keeps every event.
- *Replaying:* the answer is an action (`roll { prompt, faces, from }`), so a list
  of actions replays the outside faces exactly, as a list with `react` replays
  reactions. Undo and redo restore state patches, which hold the outside faces
  like any other part of the state. An export of a table holds `pending` and the
  timeline.

**Reasons.** It is the one design that lets the engine ask for exactly the dice it
is about to roll, at any depth of a resolution (damage after a hit, a save from an
area, a Concentration save inside a monster's attack, a reroll, a reaction that
interrupts), without the client knowing anything in advance and without a
JavaScript call that waits. It reuses a mechanism already built, tested and
reviewed for hidden information (`pending`, `viewPrompt`, `perceived`).

**Cost.** An action with k outside rolls runs k + 1 times. Each run is the
action's own cost (milliseconds for an attack, more for an area spell with many
targets); the build measures a Fireball over eight outside rollers. `apply()`
takes a snapshot (`freeze`) before every action at a table where any creature
rolls outside (`mayAsk` widens), which costs one `structuredClone` of the state
per action at such tables. A crash between the question and the answer loses
nothing: the question is in the saved state.

### Decision 3: the game's dice are drawn anyway (the "shadow" die)

**Question.** When a die comes from outside, does the game's seed still move?

**Options.**

- A. **No.** The outside die replaces the draw; every later game die shifts by one.
- B. **Yes.** The engine draws the game's die at that point as it would have, sets
  it aside, and uses the outside face.

**Choice: B.** Every roll site draws from the seed exactly as it does today, outside
roller or not.

**Reasons.**

- The game's dice after an outside roll are the same as at a table that never had
  outside dice, so a player's choice to roll their own cannot move anyone else's
  luck, and a twin-run test can compare the two tables die for die (the test in
  stage O1: a fight in which every outside answer is the shadow face gives the
  same state and events as the same fight with outside dice off, but for the
  `outside` marks).
- The fallback (a lapse, the DM's "use the game's dice") takes exactly the die the
  seed gave there, which the question was built around: nothing is re-rolled, so a
  fallback is not a second chance drawn later in the stream.
- Undo of the answer gives the question back with the same shadow die.

**Cost.** The DM can see, on the DM's own screen, what the game would have rolled
(`game`). That is the DM's to know: the DM holds the key already
(`hidden-information.md` section 7). A player is never sent it.

### Decision 4: the question, the answer, the lapse and the fallback

**Question.** What exactly is a named person asked, how do they answer, what
happens if they do not, and what may the DM do?

**The question.** The `Pause` carries
`ask = { kind: 'dice', roller, rollKind, label, parts, bonus, keep, crit, by?, against? }`.
`apply()` keeps it in `pending` as it keeps a reaction's question, raises
`s.asked`, and sends `diceAsked { n, id: roller, to, ask }`: `to` is the roller's
player (`ownerOf`), or `'dm'` for a DM's creature under `everyone`. It reads, on
the asked player's screen:

> **Brenna: Longsword damage.** Roll 2d6 + 3 (slashing). Critical hit: the dice
> are doubled.

> **Pip: Dexterity saving throw.** Roll 1d20 with Advantage (two d20s, the higher
> counts) + 1d4 (Bless).

> **Odessa: Initiative.** Roll 1d20.

The label follows `dice.md` 5.1 (`titleOf`): who, and what for, built only from
what the asked player's own view tells them (Decision 6). `bonus` is shown because
the engine adds it anyway; the player is asked only to roll and enter the faces,
never to add.

The question also carries what has happened so far in the action that the asked
player would be sent (`sofar`: the events before the pause, run through
`viewEvents` for that player), because the state was put back and those events are
not yet final: "Brenna attacks the Goblin: 17 against AC 15, a hit." Then "Roll
2d6 + 3". Others are told nothing of `sofar` until the action finishes.

**The answer.** The new action
`roll { prompt: n, faces: [int, ...], from }`, from the roller's controller or the
DM. `faces` are in the order of `parts`. The engine checks, in this order, before
anything changes: a dice question is waiting; `prompt` is its number ("That
question has already been answered."); the sender controls the roller or is the
DM; `faces` is an array of exactly the count asked; each is a whole number from 1
to its die's sides ("A d6 shows 1 to 6."); `from` is one of the closed words (any
other is refused, not rewritten). A refusal leaves the question waiting exactly as
it was. A d10's "0" is ten and a d100 is typed as one number from 1 to 100; the
client turns these into faces, the engine accepts only 1 to sides.

**The DM.**

- `roll { prompt, game: true }` (DM only): use the game's dice for this roll. The
  shadow faces are taken; the roll event says `outside: { lapsed: 'dm' }`.
- `roll { prompt, faces, from: 'dm' }`: the DM types the faces for the player
  ("Brenna rolled a 14 at my end of the table").
- With `outsideCheck: 'dm'`, a player's answer does not resume the action: it is
  kept on the question (`pending.ask.answer`) and the DM is shown it beside the
  shadow faces, with **Accept**, **Use the game's dice** and **Ask again** (the new
  `diceOk { prompt, take: 'accept' | 'game' | 'again' }`). Ask again clears the
  answer and keeps the question (the same `n`, the same shadow die) so the player
  rolls again.
- After a roll has been applied, the DM's **Undo** gives back the question with its
  answer cleared: the step before the answer held `pending`, so undoing the answer
  restores it. That is how the DM overrules after the fact; Redo puts the same
  answer back.

**The lapse.** The rules have no clock, so the host runs it: the server in
`tables.js` (the solo transport in a tab). On `diceAsked` it starts a timer of
`outsideWait` seconds for that `n`; on an answer, an undo, a rewind or a new
question it drops it. When it runs out it applies, with the DM's role and a
server marker, `roll { prompt: n, lapse: true }`. The engine then does what
`outsideLapse` says: `game` takes the shadow faces (the event says
`outside: { lapsed: 'timeout' }`); `dm` hands the question to the DM (`to` becomes
`'dm'`, the asked player's prompt says "The DM will decide this roll"), with no
further timer. The timer is not in the state: after a server restart a waiting
question gets a fresh full wait. `outsideWait: 0` sets no timer.

**The player may not switch to the game's dice once asked.** The asked player's
prompt has the number pad and the sources, and no "use the game's dice" button. A
player who has lost their dice asks the DM, or lets it lapse. Reason: a player who
could take the game's dice after seeing their own die would get a free second roll
of every bad one (Decision 9). Before being asked, a player can turn outside dice
off for their character at any time (`diceFrom`), which applies to the next
question, not to one already waiting.

**What others see.** Every other player gets, while the question waits,
`{ waiting: true, on: <roller> }` ("Waiting for Brenna's dice") only when the party
perceives what set it off (`perceived` in `view.js`: the waiting action's actor and
the question's `by` are not hidden from the party), and only for a roll they would
be sent once it is made (a party creature's roll: Decision 6). Otherwise they get
`{ waiting: true }` (the table waits, but not on whom), or nothing, exactly as for
reactions today.

**Reasons.** The owner asked for a prompt to a named person for named dice. The
timeout and fallback stop one absent player stalling the table, and putting the
clock in the host keeps the rules pure. Taking the shadow die at a lapse means the
lapse gives the very result a table without outside dice would have had.

**Cost.** Three actions (`roll`, `diceOk`, `diceFrom`) and three events
(`diceAsked`, `diceAnswered`, `diceLapsed`); `roll` and `diceOk` join
`WHILE_WAITING`. The server gains a timer per table with a question waiting.

### Decision 5: which rolls are asked for, and which stay on the game's dice

**Question.** The engine rolls in many places, some deep inside a resolution and
some secret. Which may be put to a player?

**The rule.** A roll is put to an outside roller only when **all** of these hold:

1. it is that creature's own roll (the creature that rolls it at a table: the
   attacker for an attack and its damage, the saver for a save, the caster for a
   spell's damage and healing, the dying creature for a Death Saving Throw);
2. its controller would be sent its faces once it is made (`dice.md` section 3: a
   party creature's attack, save, check, Concentration, Death Saving Throw and
   initiative, and the damage, healing and Temporary Hit Points it rolls);
3. its kind is one the creature rolls outside (Decision 1);
4. the roll does not exist only to decide something secret that its roller must
   not know is being decided (below).

Anything else is rolled on the game's dice, as today, and its event says nothing
new.

**Roll by roll.**

| Roll | Asked or kept | Why |
|---|---|---|
| A party creature's attack roll, with Advantage or Disadvantage | Asked: `parts` two d20s, `keep` high or low | The SRD's "Roll Two D20s": the player rolls both; the engine keeps the one the rule says |
| Dice a modifier adds to that roll (Bless's +1d4, Bane's -1d4) | Asked in the same question, kind `extra`, named | Part of the same roll; Bane's die is shown as taken off |
| Damage after a hit, crit included, with Sneak Attack, Brutal Strike, extra damage parts | Asked: one question for the hit's damage, every part named, the dice already doubled on a crit | The SRD's "Critical Hits" doubles the dice, so the question asks for the doubled count |
| A spell's damage rolled once for an area | Asked of the caster, once | "Damage against Multiple Targets": one roll for every target; every target's event shows the same faces, as today |
| A party creature's saving throw against anything, a hidden caster's spell included | Asked; the label names the source only if the party knows of it ("Dexterity saving throw", not "against Burning Hands" from a hidden caster) | The save itself is sent to the player whatever its source (`view.js`) |
| A Concentration save inside a monster's attack | Asked; it stops the monster's action | As a reaction prompt stops it today |
| A Death Saving Throw at the start of a turn | Asked | The player's own |
| A check, with a DC the DM keeps (`check` with `dc`: `secret`) | Asked; the question never holds the DC | The player knows their die, not the DC or whether it succeeded, exactly as at a table where the DM keeps a DC behind a screen |
| Hide's Stealth check | Asked | The player's own roll; the total is what others must beat, and the engine uses it as given |
| Search's second d20 for Dim Light | **Kept** | Never shown to the player (`dice.md` section 2); asking would tell them the light counts against them |
| A reroll a feature takes by standing instruction (Indomitable, Disciplined Survivor) | Asked, as a new question "Pip: Indomitable, roll the save again" | A new die, the player's |
| A die that may turn a failure (Bardic Inspiration, Peerless Skill) used by standing instruction | Asked of the creature that spends it, kind `extra` | Its holder rolls it |
| A reaction's own dice (Deflect Attacks' 1d10, Hellish Rebuke's damage) | Asked, after the reaction's own question | Closes `DEBT.md` T10 for outside rollers |
| An opportunity attack a party creature makes inside a monster's move | Asked | Its own attack |
| Initiative when a fight starts | Asked, of every outside roller in the fight | Its own |
| Hit Dice and healing it rolls; Second Wind | Asked, kind `heal` | Its own |
| A monster's, NPC's or other DM creature's roll | **Kept**, or asked of the **DM** under `everyone` | A player never rolls a creature they do not control |
| A hidden creature's roll | **Kept**, or asked of the **DM** under `everyone`; no player is asked, told, or shown a waiting notice for it | The DM may roll a hidden foe's dice behind the screen; a player learns nothing from a question that only the DM gets |
| Rolls with no roller (a fall, a trap, a thing on the map: `by: null`) | **Kept** | Nobody's die; the DM may change the result by hand as today |
| A monster's Recharge | **Kept**, or the DM's under `everyone` | Never sent to players |
| The d4 of a `damage.taken` adjustment (the Resistance cantrip) | **Kept** in the first stages | It is in `adjusted`, not in `dice`, today (`dice.md` section 2); asking needs it to become a face first (stage O1b) |
| Overchannel, or any roll the engine maximises | No die | Nothing is rolled |
| Something the engine hands to the DM (`manual`) | The DM's, as today | The DM rolls what the DM applies by hand |

**Rerolls and choices after a roll.** Heroic Inspiration ("reroll any die
immediately after rolling it") and every "after you see the roll" choice (Cutting
Words, Empowered Spell, Dark One's Own Luck) wait on the prompts spec (`README.md`:
"Prompts: reactions and decisions made after a roll", to write). When they come,
they come for the game's dice and outside dice alike: the player sees the faces
in the event and is asked whether to spend the feature; a reroll is a new question
for one die, and with Advantage or Disadvantage the player names which of the two
("Interactions with Rerolls": only one die, not both). Nothing in this spec decides
those rules. Note for that spec: the engine's standing-instruction reroll in
`savingThrow` rolls a new pair under Advantage or Disadvantage; the SRD sentence
above says one die; the outside question asks for whatever the engine rolls, so a
fix there changes the question without changing this design.

**Several rollers at once.** An area that asks six saves, or the start of a fight,
would ask six questions one after another, each with its own wait. Stage O1c adds
the **group question**: where a step rolls for several creatures independently (a
save step over its targets, `startEncounter`'s initiative), the first `Pause` asks
all of them at once (`ask.group: [{ roller, parts, ... }]`); each answers on their
own; the action re-runs when the last answer (or lapse) is in. Rolls that depend on
an earlier result (damage after a hit) are never grouped.

**Reasons.** Rule 2 is what makes outside dice safe for hidden information: a
player is only ever asked for a die whose face they would be sent anyway, so a
question carries no new information. Rule 4 closes the one case (Dim Light) where
the existence of a die is itself the secret.

**Cost.** Every roll site is touched once, to call `rollFor` with its roller, kind
and label. The list above is the test list: a test walks every roll site and
checks it is asked or kept as the table says.

### Decision 6: what a player is sent, and never sent

**Sent to the asked player:** the question (`diceAsked`): the roller, the label,
the parts, the bonus, `keep`, `crit`, the source if the party knows of it, and
`sofar` run through `viewEvents` for that player. Building `sofar` against the
state as it was put back, not as it stood at the pause, can only make it say less
(a creature revealed during the action is still unknown there and its events are
dropped); the full events come when the action finishes.

**Sent to other players:** the waiting notice of Decision 4. After the action, the
roll event as today, plus `outside: { from, by }` or `outside: { lapsed }`, for a
roll they are sent at all.

**Never sent to any player:**

- `game`, the shadow faces;
- the DM's tally (Decision 9);
- a question for a roll the player would not be sent, or for a creature they do
  not control;
- a DC, an Armor Class or a monster number the player's view does not already
  hold (the question is built from the view's own fields: an attack's `ac` only
  where the party's attack events already carry it);
- the name or id of a hidden creature, in the label, `by`, `against` or `sofar`;
- `pending.action` of another player's waiting action (as today: the DM alone gets
  the action);
- a question asked of the DM under `everyone`;
- a picture, or anything a camera, a Bluetooth die or another service gave the
  device beyond the faces the player sends (Decision 10).

**The DM** gets everything: every question, every answer, the shadow faces, lapses
and who sent what.

### Decision 7: undo, redo, rewind, save and load

- **Undo** of a finished action that asked for dice takes the whole action back,
  as today. **Undo of an answer** (the `roll` step) gives the question back,
  waiting, with its answer cleared, and the host's timer starts again. Redo puts
  the same answer back and the action finishes the same way.
- **Rewind** to the start of a fight or to the last rest keeps the dice stream
  moving (`history.js`, "new dice"). For outside dice that means: **a recorded
  outside roll is never replayed into a fight fought again.** It stays in the
  timeline, which keeps the lost fight; the fight fought again asks again, and the
  shadow dice behind the new questions are new. A question waiting at the moment of
  a rewind is withdrawn (the pinned state has no `pending`); the asked player's
  prompt closes with "The DM took the table back."
- **Save and load.** `pending` with its answers is in the saved state, so a table
  saved while waiting for Brenna's dice loads still waiting for them. The timer is
  the host's and starts again in full.
- **History sent to players** is made of events through `viewEvents`, so `game` is
  stripped there too.

### Decision 8: trust, and the portable history

**What the DM accepts by allowing outside dice.** Stated in the setting's text,
beside the choice, in plain words:

> Players may roll their own dice and enter the faces. The game cannot check a
> die it did not roll: a player can enter any face, roll again until they like
> it, or let a roll lapse when they see a bad one. Every such roll is marked in
> the log as rolled outside, with who entered it and how. You can see every
> question, take the game's dice instead, or ask again.

**What is recorded.** In the game: the `outside` mark on every roll event, with
`from` and `by`; `diceAsked`, `diceAnswered` and `diceLapsed` in the timeline. The
log line of a roll gains a small die-in-hand glyph with words ("rolled at the
table, typed"); the log gains a filter "Rolled outside". `from` is the device's
claim about how the faces were got: the display never says a camera or Bluetooth
roll was checked, only "read by camera" or "from a Bluetooth die".

**The portable history (`portable-characters.md`).** That spec's record is built
on the server from what `apply()` returned (`lineageStep`, Decision 3 there). This
spec proposes, as an amendment to that spec made in its own job (stage O5, not
here):

- `lineageStep` counts the character's rolls marked `outside` (not lapsed) since
  the last block: a number, no faces;
- a block carries `outside: n` and the table's `outsideDice` value at sealing
  (`off`, `players`, `everyone`), both words or numbers, as that spec's closed
  list requires;
- the level meter keeps its segment kinds and adds, under a level gained while the
  character rolled outside, a small mark with words, never colour alone: "Gained
  at a table where this character rolled its own dice (34 rolls)";
- the summary line gains "rolled its own dice at 2 tables".

A level gained with outside dice is **not** a different grade: the grade says who
recorded it, not how fair it was (Decision 2 there: "Official means *recorded and
validated by the project*, not *honest*"). The mark tells a receiving DM what they
need to weigh it. Whether the official server allows outside dice at all, and
whether its levels then count as official, is the owner's (question 7).

**Reasons.** The owner accepts the risk at the DM's choice. Hiding outside rolls in
the record would overstate a history; refusing them would turn a common table
habit into a mark of shame. A count and a mark are the honest middle.

**Cost.** An amendment to a draft spec; one field in a block.

### Decision 9: cheating, and what the DM can see

**What no software can stop.** A player with physical dice can enter any number,
roll until they like it, or claim a camera or Bluetooth source they do not have.
The engine does not pretend otherwise, and the spec does not promise detection.

**What the design closes.**

- No second chance from the game: a player cannot take the game's dice after
  seeing a prompt (Decision 4); a lapse takes the shadow die that was already
  fixed, not a new one; the DM can set `outsideLapse: 'dm'` so that a lapse is the
  DM's call, not a reroll.
- No guessing ahead: the client never knows the shadow die, and never sends faces
  before it is asked.
- No early exit: an action that asked cannot be withdrawn by the player; only the
  DM's undo takes it back.
- Every outside roll is attributed (`by`) and its source recorded (`from`).

**What the DM can see (DM only).** A tally per creature, built by the client from
the DM's timeline (no engine state): how many rolls it made outside, how many
lapsed, and, per die size, the average face against the expected average
("Brenna, outside d20s: 41 rolls, average 13.2; a fair d20 averages 10.5"), with
the warning that a few dozen rolls swing widely and that this is not evidence of
anything. For Bluetooth dice, the number of times the die reported a roll between
the question and the answer (Decision 10, stage O8), since a die that is rolled
four times before one result is entered says so.

**Reasons.** Honest tools for the DM, no false accusations by the software.

**Cost.** A DM card; arithmetic on the timeline.

### Decision 10: sources, in stages, behind one interface

**Question.** How do typed entry, the camera, other dice rollers and Bluetooth dice
reach the engine, and what can each device do today?

**Choice: every source is a client module that fills in the faces of one waiting
question, and every source sends the same `roll` action.** The engine knows a
source only as the word in `from`. A source module has one shape:

    source.read(question) -> Promise<{ faces, from }>   // or rejects; the player can always type instead

The prompt card always has the number pad; other sources fill it in and the player
taps **Send**. Nothing a source produces besides the faces leaves the device.

#### Stage O3: typed entry (first)

One field per die, in `parts` order, labelled ("d20 (first)", "d20 (second)",
"d4, Bless"), big targets for a phone, a number pad keyboard (`inputmode="numeric"`),
d10's 0 read as 10, a d100 as one number. Send is greyed until every field is in
range, with the engine's own sentence. Works on every device the game works on.

#### Stage O6: a phone's camera, processed on the device

**What browsers offer (checked 15 November 2026).**

- `getUserMedia` (a live camera view) is Baseline "Widely available (since
  2020-03-19)", first in Chrome 53, Chrome on Android 53, Firefox 36, Safari 11 and
  Safari on iOS 11 [web-features: media-capture]; caniuse lists Safari on iOS
  supported from 11 through 27.2 and marks it "Secure context required"
  [caniuse: getUserMedia; caniuse: getUserMedia secure context].
- The file input's `capture` attribute (`<input type="file" accept="image/*"
  capture="environment">`, which opens the phone's camera and returns one picture)
  has "Limited availability": Chrome on Android from 25, Firefox for Android from 79,
  Safari on iOS from 10, and not desktop browsers [web-features:
  html-media-capture]. On a desktop it falls back to choosing a file, which is fine.
- Text recognition built into the browser (`TextDetector`, Shape Detection API) is
  "available behind a flag" and "In Progress" per Chrome's own page, whose stated
  date is 2019-01-07 [Chrome: shape detection]. It cannot be relied on.

So: the stage uses the `capture` input first (one picture, no live stream, no
permission prompt on most phones beyond the camera's own), and `getUserMedia` for a
live view where the player prefers it. Both need a secure context: the hosted
server (HTTPS) and `http://localhost` qualify; a table server reached by a bare LAN
address over plain HTTP gets no camera, and the source says so and offers typing.

**What can be done with no model and no dependency.** The picture is drawn to a
canvas and read as pixels in plain JavaScript, on the device. What is feasible:

- **Pips on six-sided dice.** Find the dice (the largest regions that differ from
  the background), then within each, threshold and count round dark (or light)
  blobs of similar size: classic connected components and a roundness test, a few
  hundred lines. It reads ordinary pipped d6s on a plain surface in good light. It
  is the case that matters most (damage and many spells roll d6s).
- **Which die is which.** With several dice of different sizes in one picture the
  reader cannot tell a d8 from a d10 by shape reliably; the question already says
  which dice were asked for, so the player taps each die in the picture in order,
  or rolls one size at a time.
- **Numbers on d4, d8, d10, d12, d20.** Not reliably. Reading a numeral on a face
  seen at an angle, in any font, colour and finish, is a recognition problem.
  Template matching against one known set of dice (photographed once by the player
  as a "dice profile") might reach usable accuracy for that set in good light; it
  is brittle, and the build plan treats it as an experiment, not a promise.

**Always confirmed by the player.** The reader fills in the number pad and marks
each field "read from the picture"; the player corrects any and taps Send. The
answer's `from` is `camera` only when every face sent is the one the reader read;
if the player changed one it is `typed`. A reading the reader is not sure of is
left empty, never guessed.

**What a recogniser would need.** Reading numerals well needs a trained model. That
means, at the least: (1) weights, a data file trained outside the repo on pictures
of dice whose licence allows it (none exist in the repo; collecting and labelling
them is a project of its own); (2) code to run the model: either a vendored
inference library (a large download, a WebAssembly or WebGL runtime, and a pinned
version to keep, the same kind of cost the Three.js exception weighed), or a small
hand-written forward pass for a small network in plain JavaScript (feasible for a
classifier of a cropped face, a few hundred lines, testable with fixed inputs);
(3) a written reason in `docs/DESIGN.md`, the files vendored with their release
and SHA-256 as in `packages/client/vendor/README.md`, loaded only when a player
opens the camera source, never on the default page load. The pictures never leave
the device: no picture is sent to the table server or anyone else, so the
recogniser runs where the picture is. This is question 10.

#### Stage O7: other dice rollers

**What a connection means.** Another service (a dice app, an online roller) makes
a roll; Hextable takes its faces. Taking them directly means the player's browser
talks to that service's servers with that player's account on it. Example, checked
15 November 2026: dddice's API authenticates with a bearer token from the user's
account ("You must have an account to use the API") and is "alpha software"
[dddice: API]; its JavaScript SDK connects to a room "to receive rolls" and is
installed with npm or loaded from dddice's CDN [dddice: JS SDK]. Whether its rolls
are made or signed on its servers was not stated in what was read.

**Choice.** No connection is built until the owner names a service (question 8).
When one is named, its adapter is a client source module that:

- is allowed per table by the DM (a list of allowed sources, a later setting) and
  turned on by the player;
- connects from the player's device only; the table server never calls it and
  never holds its key; the player's key stays in that device's storage and is in no
  table file, export or undo file;
- needs its origin added to the CSP's `connect-src` (`packages/server/src/index.js`)
  and a reason in `docs/DESIGN.md` for that one network exception, and its code
  written here or vendored with a pinned release, never fetched from its CDN;
- sends `from: 'roller:<name>'`.

**Trust.** A connected roller is no stronger than typing: the faces still come
from the player's device. It would be stronger only if the service signed each
roll and the table server could check the signature against the service's public
key; that is worth asking of a service before choosing it, and the spec does not
assume it.

Until then the player rolls in the other app and types the faces (stage O3).

#### Stage O8: Bluetooth dice

**What browsers offer (checked 15 November 2026).**

- Web Bluetooth: Chrome from 56 (70 per web-features), Edge from 79, Opera from 43,
  Chrome for Android, Samsung Internet from 6.2: supported. **Firefox: not
  supported** (Mozilla's position: negative). **Safari on macOS and on iOS: not
  supported.** Baseline: "Limited availability"; the feature "has received a
  negative standards position from at least one browser vendor"
  [web-features: web-bluetooth; caniuse: web-bluetooth].
- Chrome's own guide: available "in ChromeOS, Chrome for Android 6.0", Mac (Chrome
  56) and Windows 10 (Chrome 70); on Linux it needs a flag; "made available only to
  secure contexts"; `requestDevice` must follow "a user gesture such as a touch or a
  mouse click"; GATT notifications are in the supported subset [Chrome: Bluetooth].
- **iPhones and iPads.** caniuse keeps Safari on iOS "Not supported" through 27.2
  and notes that a third-party extension can add `navigator.bluetooth` as "userland
  support and not part of WebKit" [caniuse: web-bluetooth]. Other browsers on iOS
  use WebKit unless they use an alternative engine, which Apple allows only in the
  European Union and Japan (BrowserEngineKit, iOS 17.4 and later) [Apple:
  BrowserEngineKit]; a heise report (undated, read 15 November 2026) says none of
  the major providers had shipped one [heise]. In practice **no iPhone browser
  can connect a Bluetooth die to the game.** An iPhone player types or uses the
  camera; a die can still be paired to another device at the table (the DM's
  laptop in Chrome), which then answers for that player with `from: 'bluetooth'`
  and `by: 'dm'`.
- Remembering a paired die across page loads needs a Chromium permissions flag
  today, per the Pixels extension's own requirements page [Owlbear: Pixels] and a
  GoDice API issue [GoDice issue 16]; a die is paired again each session.

**Existing dice.** Pixels dice have an MIT-licensed web library on Web Bluetooth
that reports a `roll` event with the face, and say "only Chromium based browsers
such as Chrome, Edge and Opera have support for these APIs" [Pixels: web-connect];
GoDice publish a JavaScript API on GitHub [GoDice issue 16]. Using either means
vendoring their code (a dependency, with its reason) or writing their protocol
here from their published documents, after a licence check.

**The owner's own dice.** The owner wants to make Bluetooth dice. The game's side
is small and can be fixed first: a **Hextable dice profile**, a GATT service with
its own UUID and one characteristic that notifies
`{ seq, sides, face, settled, rolls }` (a counter per roll the die felt, so the
game can tell a die rolled once from one rolled four times). The die's hardware and
firmware are outside this repo. The profile is written as its own short document
when stage O8 starts (question 9).

**How a Bluetooth answer is taken.**

- Pairing: a tap on "Connect a die" (the user gesture), `requestDevice` with a
  filter on the profile's service (never `acceptAllDevices`), one die or a set.
- A question waiting for a d20 takes **the first settled roll of a d20 after the
  question arrived**; a roll before it is ignored. Every roll the die reports
  between the question and the answer is counted and sent with the answer as
  `rolls` (a number), which the DM's tally shows (Decision 9). A die that reports
  the wrong size for the question is ignored with a line ("That die is a d12; this
  roll needs a d20.").
- `from: 'bluetooth'`. The device id and name are not sent.

**Trust.** Better evidence of *when* a die was rolled and *how often*, not proof:
the browser can be made to send anything. The record says "from a Bluetooth die",
not "verified".

**Reasons for the order.** Typing works everywhere at once and is the base every
other source fills in. The camera serves the most players (every phone has one)
but can only promise d6 pips without a recogniser. Other rollers need the owner to
name one and a network exception. Bluetooth reaches only Chromium browsers and no
iPhone, and the owner's own dice are a hardware project.

## What players are sent and never sent (summary)

| What | DM | The asked player | Other players |
|---|---|---|---|
| `outsideDice` and the other three rules | yes | yes | yes |
| A creature's `dice` (who rolls outside, which kinds) | yes | yes | yes, as the tracker mark |
| `diceAsked` and its question | yes | yes, built from their view | no |
| `sofar` | the full events | through `viewEvents` | no |
| The waiting notice | the full `pending` | — | "Waiting for Brenna's dice" when perceived and a party roll; else `{ waiting: true }` or nothing |
| The answer's faces | yes | yes | in the roll event, where they are sent that roll today |
| `outside: { from, by }`, `lapsed` | yes | yes | with the roll event, where it is sent |
| `game` (the shadow faces) | yes | **never** | **never** |
| The tally | yes | **never** | **never** |
| A question asked of the DM, a hidden creature's roll | yes | **never** | **never** |
| Pictures, Bluetooth device ids, third-party keys | — | stay on their device | — |

## The actions and the state

### State (version 24, or the next free number when built)

- `state.settings.outsideDice | outsideWait | outsideLapse | outsideCheck`, in
  `SETTINGS`; absent means the first value.
- `e.dice = { kinds: [...] }` on a creature, optional; public; joins the creature
  allow list in `view.js`.
- `state.pending`, unchanged in shape, gains a second kind of question:

      pending: {
        n, action, ctx,
        answers: [ { reactor, take, slot? } | { dice: { roller, faces, from, by } }, ... ],
        ask: { kind: 'dice', roller, rollKind, label, parts: [{ n, sides, name?, neg? }],
               bonus, keep: 'high' | 'low' | null, crit, by?, against?, sofar: [events],
               to: userId | 'dm', answer?: { faces, from, by },          // waiting for the DM under outsideCheck
               group?: [ { roller, ... , answer? } ] }                   // stage O1c
      }

  A question with no `kind` is a reaction, as every saved one is. The migration
  changes nothing in a saved state.

### Actions

| Action | Who may send | What it does |
|---|---|---|
| `setting { key, value }` (existing) | DM | the four rules |
| `diceFrom { actor, kinds }` | the creature's controller, or the DM | sets or clears `dice` (Decision 1) |
| `roll { prompt, faces, from }` | the roller's controller, or the DM (`from: 'dm'`) | answers a dice question (Decision 4) |
| `roll { prompt, game: true }` | DM | takes the shadow faces |
| `roll { prompt, lapse: true }` | the host's timer, with the DM's role | does what `outsideLapse` says |
| `diceOk { prompt, take }` | DM, under `outsideCheck: 'dm'` | accept, game, again |

`roll` and `diceOk` join `WHILE_WAITING`; `diceFrom` does not (it waits until the
question is answered). Each gets a label in `history.js` (`describeStep`): "Brenna
rolled for Longsword damage (outside)", "The DM used the game's dice for Brenna's
roll", "Brenna's roll lapsed: the game's dice". No name may clash (`ACTION_TYPES`
has no `roll`, `diceOk` or `diceFrom` today).

### Events

| Event | DM | Players |
|---|---|---|
| `diceAsked { n, id, to, ask }` | yes | the player `to` names only, through `viewPrompt` |
| `diceAnswered { n, id, from, by }` | yes | those who will be sent the roll |
| `diceLapsed { n, id, how: 'game' \| 'dm' }` | yes | those who will be sent the roll |
| every roll event: `outside`, and `game` | yes | `outside` only, where the event is sent |

## What the engine, server and client must add

| # | Addition | Where |
|---|---|---|
| X1 | `rollFor`, the dice question in `Pause`, reading `dice` answers | `engine/shared.js` |
| X2 | Every roll site calls `rollFor` with roller, kind and label; the kept ones say why in a comment | `engine/rolls.js`, `engine/resolve.js`, `engine/world.js`, `engine/features.js`, `engine/attacks.js`, `engine/casting.js`, `engine/rests.js`, `effects.js` |
| X3 | `roll`, `diceOk` handlers beside `react`; `apply()` keeps a dice question as it keeps a reaction | `engine.js` |
| X4 | `diceFrom`; the four rules in `SETTINGS` and `SETTING_TEXT` (the words of Decision 8) | `engine/characters.js` or `engine/dm.js`, `engine/dm.js` |
| X5 | `mayAsk` true at a table with an outside roller; `WHILE_WAITING` | `reactions.js` |
| X6 | `viewPrompt` for dice; `diceAsked` and the other events; `outside` kept and `game` stripped on every roll event; `dice` on creatures | `view.js` |
| X7 | Labels | `history.js` |
| X8 | Version and migration | `migrate.js` |
| X9 | The timer and the lapse; the protocol | `packages/server/src/tables.js`, `packages/server/README.md` |
| X10 | The prompt card with the number pad, the DM's card, the tracker mark, the log glyph and filter, the four rules in the drawer, the joining line, the solo timer | `client/dicein.js` (new), `reactionprompt.js`, `tracker.js`, `logview.js`, `settings.js` or `tablecontrols.js`, `transport.js`, `dice.js` (an outside roll is shown lying still with the mark, not thrown) |

## Build plan

Each stage is one pull request (or the few named) with `npm test` and
`npm run build`; client stages are checked at 1280 x 800 and 390 x 844 with touch,
with a smoke pass. "Engine lane" is the strongest model: these change `engine.js`,
`engine/`, `view.js` and the server.

| # | Stage | Lane | Files | Done when |
|---|---|---|---|---|
| O0 | **The owner's answers.** | lead | this spec | The questions below are answered or confirmed; the spec amended. |
| O1a | **The mechanism, for rolls in a player's own action.** `rollFor`, the dice question, `roll`, `diceFrom`, the four rules, `view.js`, labels, version. Roll sites: attack rolls with their modifier dice, damage after a hit (crit, Sneak Attack, Brutal Strike), a spell's damage and healing (`effects.js`), checks, Hide, Second Wind, Hit Dice. | engine lane | X1 to X8 for those sites; `packages/rules/test/outside-dice.test.js` (new) | **Twin run:** over a seeded fight on hexes and on squares, every outside answer equal to the shadow faces gives the identical state and events as the same fight with `outsideDice: 'off'`, but for the `outside` marks; an answer with other faces changes exactly that roll's outcome; a refused answer (wrong count, 0, 7 on a d6, a non-integer, the wrong `prompt`, another player's) changes nothing and the question waits; a player's `roll { game: true }` is refused; undo of the answer gives the question back and redo the same result; save and load mid-question; the canary test: no player message holds `game`, a DC, or a hidden creature's id; a Search's Dim Light die is never asked. |
| O1b | **Rolls inside someone else's action.** Saves (a spell's, a trap's), Concentration, Death Saving Throws, opportunity attacks, reactions' own dice, rerolls by instruction, rescue dice, the Resistance cantrip's d4 as a face. | engine lane | X2 for those sites, `reactions.js`, tests | A monster's attack stops for a Concentration save and goes on; a hidden caster's spell asks for a save whose label has no source and whose `sofar` names nobody hidden; a reaction prompt and a dice question in one action are answered in order; the walk over every roll site matches Decision 5's table. |
| O1c | **Group questions.** Initiative and a save step over several targets ask everyone at once. | engine lane | `engine/shared.js`, `engine/world.js`, `effects.js`, `view.js`, tests | A Fireball over four outside rollers asks four questions at once; answers in any order; one lapse takes its shadow die and the rest stand; the twin run still holds. |
| O2 | **The server's clock.** | engine lane | `packages/server/src/tables.js`, `packages/server/README.md`, `packages/server/test/` | A question lapses after `outsideWait` and takes the shadow die (or goes to the DM); an answer, undo, rewind or a new question drops the timer; a restart gives a full wait; a player cannot send `lapse`. |
| O3 | **Typed entry.** The prompt card, the DM's card (with Accept, Game's dice, Ask again), the tracker mark, the log glyph and filter, the settings with their words, the joining line, the solo timer. | client agent | X10, `scripts/smoke/outsidedice.mjs` (new), `test/` | At a two-browser table a player is asked for damage after a hit, types it, and both screens show the same result marked "rolled outside"; a lapse at 30 s takes the game's dice; on a phone the number pad fits with the turn order and the dock. |
| O4 | **The DM's tally.** | client agent | `client/dicetally.js` (new), `tablecontrols.js`, `test/` | The card shows counts and averages per creature and die size from the timeline, with its warning; a player's screen never builds it. |
| O5 | **The portable history.** Amend `portable-characters.md` (Decision 8 here) in its own job; then `lineageStep` and the meter's mark, after that spec's P1 and P2. | lead (amendment), then engine lane | `docs/specs/portable-characters.md`, `packages/rules/src/lineage.js`, `client/levelmeter.js` | A block counts outside rolls and records the setting; the meter's words say so; no faces are in a block. |
| O6a | **Camera, no model.** The `capture` input and a live view; pip counting for d6; the player confirms. | client agent | `client/dicecamera.js` (new), `client/dicein.js`, `test/` (fixed pictures under `packages/client/test/fixtures/`, taken by the project, licensed with the repo) | Reads the test pictures' d6s correctly; leaves unsure faces empty; `from` is `typed` when the player changed a face; no picture appears in any network message (a test on the transport); works on Chrome for Android and Safari on iOS (looked at on real phones, or said in the PR that it was not). |
| O6b | **A recogniser for numerals**, only if the owner says yes (question 10) and after the reason is in `docs/DESIGN.md`. | design, then client agent | `docs/DESIGN.md`, `packages/client/vendor/` or `client/diceread.js` (new), the weights | Accuracy measured on a held-out set of pictures and written in the PR; loaded only when the camera source is opened. |
| O7 | **One third-party roller**, once the owner names it. | design, then client agent | `docs/DESIGN.md` (the network exception), `packages/server/src/index.js` (CSP), `client/sources/<name>.js` (new) | Rolls made in that service reach a waiting question; the key is only in the device's storage; the CSP allows that origin only. |
| O8 | **Bluetooth dice.** The Hextable dice profile as a document; the source module; first-roll-after-question and the roll count; an adapter for an existing die only after a licence check. | design, then client agent | `docs/specs/dice-profile.md` (new, its own issue), `client/sources/bluetooth.js` (new) | In Chrome on Android and on a desktop, a die of the profile answers a question; a roll before the question is ignored; the count reaches the DM's tally; on Safari and Firefox the source is not offered and says why in one line. |

O1a comes first; O1b, O2 and O3 can follow in parallel; O1c after O1b; O4 after
O3; O5 after the portable-characters jobs it names; O6a after O3; O6b, O7 and O8
after the owner's answers.

## What stays manual

- Rolls the engine does not make: whatever a `manual` event hands the DM, a
  Teleportation outcome, a trinket table. The DM rolls those as today, with any
  dice.
- A cocked die, a die off the table, a disputed reading: the table's own
  convention; the DM answers for the player or asks again.
- Choices after a roll (Heroic Inspiration and the like) until the prompts spec.
- Deciding whether an outside roller is honest. The game gives the DM the record
  and the tally; the judgment is the DM's.

## Security and hidden-information review points

1. **Faces only.** `roll` carries faces, a prompt number and a source word. A test
   sends a forged `total`, `hit`, `success`, `amount` and `game` with an answer and
   asserts they are ignored and the outcome comes from the faces.
2. **Validated before anything changes.** Count, sides, whole numbers, range, the
   prompt's number, the sender's control of the roller: each refused with a
   sentence, and a refused answer leaves `pending` byte-identical.
3. **No second chance.** A player's `roll { game: true }` and `roll { lapse: true }`
   are refused; only the DM and the host's timer may send them; a lapse takes the
   shadow die fixed before the question, never a new draw.
4. **The shadow die is the DM's.** `game` is in no player view, patch, event or
   history entry: the canary test of `hidden-information.md` extended to it.
5. **A question only where faces would be sent.** A test walks every roll site and
   checks Decision 5's table, and that no player is asked for a roll whose event
   they are not sent; twin runs with a hidden foe and without show the same
   questions to players.
6. **Nothing hidden in a question.** `label`, `by`, `against` and `sofar` name no
   creature the party does not know of; `sofar` passes `viewEvents`; a DC or an
   Armor Class appears only where the party's own events already carry it.
7. **Waiting tells no more than reactions do.** Others' notices follow `perceived`;
   a question asked of the DM sends nothing to players.
8. **Sources are claims.** No screen says "verified"; `from` is a closed word and
   any other is refused.
9. **Nothing leaves the device but faces.** No picture, Bluetooth id or
   third-party key in any message, table file, export or undo file; a transport
   test watches for it.
10. **The clock is the server's.** A client cannot shorten or lengthen a wait; a
    lapse after an answer is refused by the prompt number.
11. **Undo and rewind.** Undo of an answer restores the question; rewind withdraws
    a waiting one; neither replays an outside roll into a different situation.
12. **Network.** No CSP change for the camera or Bluetooth; a third-party roller's
    origin only, with its reason in `docs/DESIGN.md`. Bluetooth `requestDevice`
    filters by service; never `acceptAllDevices`.
13. **The tally stays with the DM.** It is built on the DM's screen and never sent.

## Risks

- **A slower table.** Every outside roll waits for a person. Group questions (O1c),
  the timeout and narrowing by kind are the answer; a table that finds it slow turns
  kinds off.
- **The re-run cost.** k outside rolls in one action run it k + 1 times, with a
  snapshot at every action at such a table. Measured in O1a; if an area spell over
  many targets is slow, the group question also halves the runs.
- **A question that does not match its answer** on a re-run would mean the engine
  asked something different from the same state, which it never should. If it
  happens the engine takes the shadow die and tells the DM with a `manual` line,
  rather than using faces for a question nobody was asked.
- **Players will cheat sometimes.** The design says so and gives the DM the
  record; it does not promise detection.
- **The camera promises less than the owner hopes.** Without a recogniser only d6
  pips are dependable. The spec says so; question 10 decides the rest.
- **No iPhone can use Bluetooth dice in a browser** (Decision 10). A table of
  iPhones gets typing and the camera, or a die paired to the DM's laptop.
- **Plain-HTTP LAN servers get no camera or Bluetooth** (secure contexts only).
- **Third-party services change.** dddice's API calls itself alpha; an adapter may
  break with no change here.
- **The portable history changes another spec.** O5 is an amendment to a draft
  spec in its own job, not done here.

## Questions for the owner

Each has the default the build proceeds on if he does not answer.

1. **"Perhaps a good place to use Jev or ???".** What is Jev? A tool, a library, a
   service, a person or a model? The spec does not guess. *Default: nothing in the
   design depends on it; it is added when he says what it is.*
2. **Rolls inside other people's actions.** Should outside rollers be asked for
   saves, Concentration and Death Saving Throws that happen in a monster's turn,
   which stops that turn until they answer? *Default: yes, every kind the player
   chooses; a player who wants only their own turn's rolls picks `attack`,
   `damage` and `check`.*
3. **The wait and the lapse.** *Default: 60 seconds, then the game's dice (the
   shadow die); the DM may choose 30, 120 or no limit, and "hand it to the DM".*
4. **May a player take the game's dice after seeing a prompt?** *Default: no, only
   the DM or the lapse, so a bad physical roll cannot be swapped for a game roll.*
5. **Should the DM approve every outside roll?** *Default: no (`outsideCheck:
   'none'`); the DM sees every one and can undo it, which gives the question back.*
6. **The DM's own dice for monsters.** *Default: allowed under `everyone`, off by
   default; the monster AI then waits for the DM's dice on each roll.*
7. **The official server.** May its tables allow outside dice, and are levels
   gained there still "official" in a character's record? *Default: allowed;
   levels stay official in grade, with the mark and the count of Decision 8; the
   operator may forbid outside dice for all its tables.*
8. **Which third-party roller first, if any?** *Default: none is built; players
   roll in any app and type the faces.*
9. **Bluetooth dice.** Your own design first (the Hextable dice profile), or an
   existing brand's dice (Pixels, GoDice) first? *Default: the profile first, as a
   short document of its own, so your dice and any adapter speak one language;
   an existing brand only after a licence check of its protocol and code.*
10. **A model for reading numerals from the camera.** Is a vendored recogniser (a
    weights file and either a vendored runtime or our own small forward pass)
    acceptable, under the same kind of exception as Three.js? *Default: no for
    now; the camera reads d6 pips and the player confirms or types the rest.*
11. **Does the DM see the shadow die?** *Default: yes, on the DM's screen only,
    beside each outside roll.*
12. **Solo play.** *Default: outside dice are offered in solo too (the solo player
    is the DM), with no lapse.*

## Sources

Checked on 15 November 2026. Where a page gives its own date, it is noted; two
are old and may be stale.

- [web-features: web-bluetooth] https://web-platform-dx.github.io/web-features-explorer/features/web-bluetooth
- [caniuse: web-bluetooth] https://caniuse.com/web-bluetooth
- [Chrome: Bluetooth] https://developer.chrome.com/articles/bluetooth/ (states "Last updated 2015-07-21", while citing later Chrome versions)
- [web-features: media-capture] https://web-platform-dx.github.io/web-features-explorer/features/media-capture
- [caniuse: getUserMedia] https://caniuse.com/mdn-api_mediadevices_getusermedia
- [caniuse: getUserMedia secure context] https://caniuse.com/mdn-api_mediadevices_getusermedia_secure_context_required
- [web-features: html-media-capture] https://web-platform-dx.github.io/web-features-explorer/features/html-media-capture
- [Chrome: shape detection] https://developer.chrome.com/docs/capabilities/shape-detection (states "Last updated 2019-01-07")
- [Apple: BrowserEngineKit] https://developer.apple.com/documentation/browserenginekit
- [heise] https://heise.de/-10492493 (no date on the page as read)
- [Pixels: web-connect] https://gamewithpixels.github.io/pixels-js/modules/_systemic-games_pixels-web-connect.html
- [Owlbear: Pixels] https://extensions.owlbear.rodeo/pixels-dice
- [GoDice issue 16] https://github.com/ParticulaCode/GoDiceJavaScriptAPI/issues/16
- [dddice: API] https://docs.dddice.com/api/
- [dddice: JS SDK] https://docs.dddice.com/sdk/js/latest

Not read (the fetch was refused): MDN's Web Bluetooth page and the Web Bluetooth
Community Group's implementation-status page. WebKit's and Mozilla's standards
positions were not read directly; the negative position is as web-features reports
it.
