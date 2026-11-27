# Spec: the DM helper: a goal for the encounter, an intention for each NPC, and a queue of recommended moves

Status: draft by an agent; the owner answered its fourteen questions on 23 November (see "The owner's answers" at the end). Issue #680. A design job: this
spec first, then a clickable picture (`mockups/dm-helper.html`) once the owner has read it. No
code is written by this spec and nothing in it is built.

It stands on the monster brain (`packages/rules/src/ai.js`), [`ai-casting.md`](ai-casting.md),
[`companions.md`](companions.md) Decision 9, [`hidden-information.md`](hidden-information.md) and
the encounter entry of [`adventure-module.md`](adventure-module.md) Decision 3. It shows in the
places [`one-token-menu.md`](one-token-menu.md) made (Turns, DM tools, "Waiting for you"), needs
the DM's to-do tray (#675) and is better with calling for rolls (#676).

## In plain words

- **What it is for** (owner, 23 Nov). To help the DM run the table: to facilitate the DM's
  facilitation of the adventure, not to turn the game into a video game. Goals and intentions
  shape the suggestions; nothing is automated; the game stays social and interactive. The DM
  decides, and the helper has the next move ready.
- Today every monster does one thing: it walks to the nearest character and attacks until it is
  dead. Nothing in the game knows why it is fighting.
- This design gives each group of NPCs a **goal** (Kill, Drive them off, Hold this place, Buy
  time, Talk, Get away) and each NPC an **intention** for now (Fight, Hold its post, Hit and
  move, Talk, Leave, Give up).
- The game proposes both when a fight starts, from what you placed. Nothing applies until you
  tap OK. One tap accepts, one tap changes, at any moment.
- Every NPC's turn waits for you, whatever it is. The move the game recommends for it, toward the
  goal, is already on the bar with one line of why: one tap plays it, and up to two other moves
  are under it. What every NPC means to do next is listed in the turn order, on your screen
  only: that list is **the queue**.
- When the story turns (a leader falls, a creature is Bloodied, someone strikes during a
  parley, a roll goes badly) you get a card: "Fight on / Leave / Give up". The game always
  asks, with the recommended choice shown and ready for one tap. Nothing changes by itself.
- An ally you play (a party-side NPC with no player) is treated the same way.
- A creature can **leave a fight** and be kept "for later" with its wounds, its grudge and your
  notes. A creature can **stop fighting** (to talk, or to give up) without a fight starting
  again the moment someone walks past it.
- Players are never sent a goal, an intention, a rule or a card. They see what their characters
  would see: what a creature does, that it has stopped fighting, that it has left.
- Round it sits a small family of other helpers, ranked at the end, with the ones turned down
  and why.
- For a party of levels 13 to 15 the weak point is not tactics. It is that the engine cannot
  yet run a boss's legendary actions or its spells. This design says what your screen shows
  meanwhile, and asks that those two come early.

## The dragon fight on your screen

The owner's own evening, as it would go with this built. The DM is at a laptop with the menu
pinned on Turns; on a phone the same things arrive as cards from the bottom. The party is five
characters of levels 13, 14, 14, 14 and 15. The monsters are the SRD's.

**Setting it down.** You place an Assassin and four Gladiators on the forest road, and an Adult
Green Dragon you name Verdigris, hidden, further off. Under the Add list one line reads: "On
the map: 11,100 XP. Below Low for your party (Low 14,600 · Moderate 24,300 · High 31,800). With
Verdigris: 24,100, Moderate."

**The fight starts.** The die shows a 1 and a card waits. Nothing applies until you tap OK:

> **The ambushers** (Assassin, 4 Gladiators). Goal: **Kill**. They are **steady**: you are
> asked when the Assassin falls or when half are down. Each waits for your tap on its own turn,
> with its move ready. **[OK] [Change]**

You tap OK. In Turns each of them now has a second line that only you are sent: "Gladiator 2 ·
Fight: Multiattack on the paladin (nearest)".

**The party gets on top.** The Assassin drops. A card: "The ambushers' leader has fallen.
**[Fight on] [Break and run] [Give up]**". You tap Break and run. On their turns the Gladiators
make for the edge of the arena (Disengage or Dash, as each needs) and go. The table's log says
"Gladiator 3 flees." The rewards will list them as driven off, and counted.

**The dragon arrives.** You bring Verdigris in. A card: "Verdigris joined. Its goal? **[Kill,
with the ambushers] [Talk] [Other…]**". You tap Talk. Verdigris is now marked "not fighting" on
every screen: walking near it starts nothing, and a player who taps Attack on it is asked
"Verdigris is not fighting. Attack anyway?". The last Gladiator leaves; nobody is fighting, so
the fight ends and the rewards for the ambush wait for you. Verdigris's row reads:

> **Verdigris** · Talk: stays 60 ft up, out of reach.
> Wants: to learn who hired the ambushers; to be flattered. Voice: slow, amused. Secret: (yours).
> Speaks Common and Draconic · Deception +9, Persuasion +9 · Influence: DC 18 (its Intelligence).
> You run: Legendary actions, Legendary Resistance, Spellcasting.

**The roll of 1.** The sorcerer tries to read its thoughts and the roll is a 1. On Verdigris's
row (and, once calling for rolls is built, on the roll's own result card): **[It takes offence:
Kill, and roll initiative] [It laughs: keep talking] [It leaves]**. You tap the first. "Not
fighting" drops off every screen and the fight starts the way any fight does.

**The dragon's turn.** Like every NPC it waits for you, and its bar appears by itself with the
recommended move ready for one tap:

> **Verdigris's turn · Fight** **[I'll play it]**
> ▸ **Poison Breath on the sorcerer, the paladin and the cleric** (3 caught), from the air.
> *Its breath is ready, and a limited ability is used as soon and as often as it can be.* **[Do it]**
> · Rend three times at the sorcerer from 10 ft, outside a sword's reach. **[Do this]**
> · Back out of reach and talk again. **[Do this]**
> You run: Mind Spike in place of one Rend · Legendary actions 3 of 3 · Legendary Resistance 3 of 3

The first move is ready to tap; the other two are one tap away in the same bar. A Gladiator's
turn looks the same, with one line instead of three.

You tap Do it. The dragon flies, breathes and ends its turn at the table's pace. After the
paladin's turn a small card: "Verdigris may take a legendary action (3 left): Pounce, Noxious
Miasma, Mind Invasion. **[Used one] [Skip]**", with Damage, Place and Call for a save beside it.

**The lucky hit.** The paladin's smite is a Critical Hit and Verdigris is Bloodied. A card:
"Verdigris is Bloodied. **[Fight on] [Leave, for later] [Talk]**". You tap Leave, for later. On
its turn it flies to the edge and is gone: "Verdigris flies off." The fight is over.

**Afterwards.** The rewards form lists Verdigris as "left: counted", with a tick box. DM
tools › Creatures has a list, **Offstage**: "Verdigris · left the forest road, day 43 · 98 of
207 HP · breath spent · Legendary Resistance 2 of 3 · your note: furious at the sorcerer
**[Bring back…] [Card]**". A private line was written in your chronicle. Next month Bring back
sets it down where you tap, rested.

**What the players' phones showed in all of this:** the creatures' moves and attacks,
"Gladiator 3 flees", "Verdigris is not fighting", "Verdigris flies off". Nothing else.

## What the owner asked

The owner, 21 November 2026 (his words; the book's full title in brackets is the lead's):

> "Can we create a DM helper that queues up recommended actions for NPCs. Take a look at 'the
> monsters know' [The Monsters Know What They're Doing, Keith Ammann]. I'd love to have that be
> a factor in this type of advice but I think having an overall goal when an encounter starts
> would be the best option. My party just went into a fight where the NPCs attacked without
> provocation. Then as the party overcame them, a supporting green dragon showed up and started
> teasing them with the intention of parlay. A bad read thoughts roll '1' made me decide the
> dragon would be pissed off and just attack them. A lucky roll on a pc's attack pushed it back
> and I then decided it should just fly away for later. An overall encounter concept would help
> drive individual intentions of npcs."

And: "Are there any additional things that belong here to help the DM or smooth the experience
for the players." His priority, the same day: his own party (levels 13 to 15) comes before
complete coverage of levels 1 to 6. The game's purpose, as he puts it, is to facilitate the
players' story: a DM should run the table without getting caught in minutiae. On 23 November he
added the aim of this helper: to facilitate the DM's facilitation of the adventure, not to turn
it into a video game; keep it social and interactive.

| He said | Here |
|---|---|
| "queues up recommended actions for NPCs" | The queue in Turns and the turn bar, with the recommended move ready for one tap (Decisions 4 and 12) |
| "an overall goal when an encounter starts" | The goal, proposed at the start of a fight (Decisions 2 and 6) |
| "drive individual intentions of npcs" | The intention, worked out from the goal and changed in one tap (Decision 3) |
| "the monsters know" as "a factor" | The profile: what a stat block says about how a creature fights, in our own words (Decision 5) |
| attacked without provocation, then overcome | A group that is steady, and a card when its leader falls (Decision 7) |
| "teasing them with the intention of parlay" | The goal Talk and "not fighting" (Decision 8) |
| a roll of 1 "made me decide" it attacks | A shift, one tap; later, on the roll's own card (Decision 7; stage H14) |
| "fly away for later" | Leaving a fight, Offstage and Bring back (Decisions 8 and 9) |
| "additional things" | The other helpers, ranked |

**The book.** We use one idea from it, which is not anyone's property: a stat block already
says how a creature fights. Every reading in Decision 5 is made from numbers and traits of the
SRD 5.2.1 stat blocks in the pack and from the SRD's own "Running a Monster" rules, and written
in our own words. Nothing from the book or its site is quoted or paraphrased here, and whoever
builds a stage does not work from them either: the source is `reference/srd52/` and the pack.

## Rules that bind this design

- **Everything goes through `apply()`.** A goal, a shift, a truce, leaving a fight and a return
  are actions. A recommended move is an ordinary action (`act`, `move`, `dash`…), sent like any
  other; the engine decides whether it is legal.
- **The engine never pretends.** What a boss can do that the engine cannot run is listed as
  "You run", with the tools beside it; it is never played badly on the quiet, and never left
  out of the advice.
- **A rejected action changes nothing.** Every new action checks before it writes.
- **The rules package is pure, and the brain stays deterministic.** The plan never rolls a die
  and reads no clock. The same state gives the same queue, the same advice and the same move.
- **Players are sent nothing hidden.** The whole plan is one top-level record that the player
  view does not list. Every new event type is unlisted, so it is dropped for players.
- **Content is data.** A prepared encounter carries its goal as data. A new field on a monster
  entry is a vocabulary change, named here as one (Decision 11).
- **Only SRD 5.2 content.** Tactics come from SRD stat blocks, in our words.
- **Phones count.** Every card is given at 390 x 844 with one thumb, targets at least 44 px.

## Where we are

Read from the code at `2def08ee` (21 November).

- **The brain** (`aiStep`, `ai.js`): the foes it knows of, nearest first, then the most hurt.
  An area or breath when it would catch two or more; otherwise Multiattack; melee if it
  reaches, else ranged; it walks in, or Dashes. It hides in round 1 if its block has Stealth,
  and gets out of a grapple it cannot fight from. It never retreats, never stops, never talks.
  It never picks a creature at 0 Hit Points (its foes are those that are up).
- **Who runs it.** The DM's browser, after each update (`idled()` in `app.js`), for whatever
  `autoPlays` (`ai.js`) says: a monster, a companion the brain plays, a character set aside
  under `standIn`. One device switch, "Run monsters automatically".
- **Sides.** `party`, `foe`, `object`; `hostile(a, b)` is "the sides differ". With auto-engage
  on, a foe within the table's engage range of a walking character starts a fight. Fighters
  cannot leave the arena, `remove` is refused for a creature in a fight, and a fight ends only
  when no foe is up (`checkEnd`) or the DM ends it. So today a creature cannot parley, give up
  or get away.
- **High level.** Of the 53 SRD monsters of CR 10 or more, 29 have Legendary Actions, 31
  Legendary Resistance and 25 Spellcasting. The engine runs none of the three (DEBT M5, M6);
  52 of the 53 are at tier `assist`. The brain uses their attacks and breath and says nothing
  of the rest (playability review, PB-9).
- **Prepared encounters.** `adventure.js` lints an encounter entry with `tactics` as text; the
  spec says "The monster AI does not read them". No screen stages one yet.
- **The SRD gives us:** how a monster uses its block ("Running a Monster",
  `reference/srd52/srd52-flow.txt` 43229 to 43244); the attitudes Friendly, Indifferent and
  Hostile and the Influence action with its DC (33465, 33600, 33670, 33674 to 33700); XP for
  "defeating the monster in combat or otherwise neutralizing it" (43394 to 43400); the XP
  budget per character (36053 on) and "having creatures flee" or "adding reinforcements" to
  adjust a fight (36121 to 36128); Bloodied (32754); knocking a creature out (2281 to 2288).
  It has **no morale rule and no treasure tables**.
- **Not built, and needed:** the DM's to-do tray (#675), a called saving throw (#676), the
  one-token menu (M1 is in progress, #665).

## The decisions

### Decision 1: three layers; two are kept, the third is worked out

1. **The goal** belongs to a **group**: creatures that are in it together. A fight may hold two
   groups with different goals (the ambushers; the dragon).
2. **The intention** belongs to one creature: what it is doing now. It follows from the goal
   until the DM, or a rule the DM agreed to, changes it.
3. **The queue** is what each NPC will do on its coming turn, in words, with up to three
   concrete moves for the one whose turn it is.

The goal, the intention and the rules for changing them are **state**: saved with the table,
undone and replayed like anything else, never sent to a player. The queue and the advice are
**not state**. They are worked out from the state by pure functions each time the DM's screen
draws, as `aiStep` works out a move today. Nothing is stored that could go stale, and nothing
the DM's browser remembers changes what a creature does: if the DM picks a move for one turn,
that choice is written to the state by an action first (Decision 4).

*Why.* A plan that lived in the browser would be lost on a reload, could not be undone, and
would make a recorded fight impossible to replay. Advice kept in the state would be out of date
after every move. It also keeps the door open that `ai.js` names in its first lines: an AI DM
later sets goals and answers cards through these same actions, and reads the same advice.

### Decision 2: goals

A closed list. Each is one chip on the screen and one line of help.

| Goal (code) | On the screen | Members start with | What it changes | Met when |
|---|---|---|---|---|
| `kill` | Kill | Fight | Today's behaviour, sharpened by the profile (Decision 5) | the party is all down |
| `repel` | Drive them off | Fight | They keep to their ground (an anchor) and do not chase a character who backs away from it | the DM says; a card when half the party is down |
| `defend` | Hold this place | Hold its post | They stay near a place, or near a creature the party knows of, and fight what comes | never by itself |
| `stall` | Buy time | Hold its post | As Hold this place, for a number of rounds | the round is reached: then Leave |
| `parley` | Talk | Talk | No harmful action and no reaction; "not fighting" for all to see (Decision 8) | the DM says |
| `flee` | Get away | Leave | They make for the edge and go | they are gone |
| `capture` | Take them alive | Fight | Blows that would drop a character knock out instead | later: needs the SRD's knock-out rule (stage H15) |
| `seize` | Take something | Fight | One of them makes for a thing or a person and leaves with it | later: needs the brain to carry |

The first six are the first build. The last two are named so the vocabulary is whole, and are
shown greyed with their reason until their stages land: the engine must not offer a goal the
brain cannot honestly play.

A group also has a **resolve**, three words: **to the death**, **steady** (until it is going
badly), **wary** (not looking for a hard fight). Resolve is shorthand for the rules of Decision
7, which the DM can read and change.

**Allies you play** (owner, 23 Nov, dmh-10: in the first build). A party-side NPC that has no
player is put in a group of its own, with a goal and intentions, on the same screens. Its turn
waits for the DM like every NPC's, with a recommended move against the foes. In the first build an
ally's goals are Kill, Drive them off, Hold this place, Buy time and Get away. Talk and Give up
are not offered to an ally yet: they rest on the truce of Decision 8, which is for creatures not of
the party (flagged for the owner). Prepared encounters carry allies later (H12).

*Why a short closed list.* The DM picks under time pressure, and prepared encounters carry the
goal as data, which a linter must be able to check. "Teasing", "testing" and "toying with" are
Talk with a rule for what ends the talking. A hunting animal is Kill with a wary resolve.

### Decision 3: intentions

What one creature is doing now. A closed list; the brain reads it on every step.

| Intention (code) | On the screen | What the brain does |
|---|---|---|
| `fight` | Fight | As today. With a `focus` (a named creature) it goes for that one while it can reach it this turn |
| `post` | Hold its post | Stays within one move of its anchor. Attacks what it can reach without leaving that ground; shoots if it can; does not chase. With nothing to do, the Dodge action |
| `harry` | Hit and move | Attacks, then moves out of reach where that costs nothing: Flyby, a reach longer than its foe's, a ranged attack, or Disengage as a Bonus Action. Offered only to a creature whose block lets it (stage H13) |
| `talk` | Talk | No harmful action, no reaction. Stays where it is; if a foe comes within reach it moves off where that draws no Opportunity Attack, else Dodges. A flyer keeps its height |
| `withdraw` | Leave | Makes for the nearest edge of the arena it can reach: Disengage first if stepping away would draw an Opportunity Attack and it can still get clear, otherwise Dash. At the edge it leaves the fight (Decision 8). Boxed in, it fights this turn and the queue says so |
| `yield` | Give up | No action but ending its turn; "not fighting" |

An intention can carry `focus` (a creature the party knows of) and, for one turn, `prefer` (one
of its own actions, used if it is legal).

The first build has Fight, Hold its post, Talk, Leave and Give up (stage H3). Hit and move comes
with the sharper brain (H13).

**A creature at 0 Hit Points is never chosen as a target by any intention,** as today. Finishing
a fallen character is always the DM's own hand.

### Decision 4: who plays the turn: itself, from suggestions, or the DM

Each NPC has a **hand**:

| Hand | What happens on its turn | Default for |
|---|---|---|
| **Suggests** (`suggest`) | The table waits for the DM. The turn bar shows the recommended move, ready for one tap, with a line of why, and up to two other moves one tap further. One tap writes the choice and the brain plays that turn | every NPC (owner, 23 Nov, dmh-2), foe or ally |
| **I'll play it** (`mine`) | The DM plays it from its own menu. The queue line is still there to read | whatever the DM takes over |
| **Plays itself** (`auto`) | The brain plays the intention, as monsters play today | nothing: only what the DM switches to it. Beej's reading, for the owner to confirm: it stays as the DM's own choice, never the default |

The device switch "Run monsters automatically" now decides only whether the browser plays the turn
of an NPC whose hand the DM set to Plays itself; it never overrides a turn that is waiting. With
every NPC on Suggests, the queue and the recommended move are always there.

**What is recommended, what is decided, what is the DM's.** The line is the story:

| What | Who decides | Why |
|---|---|---|
| Which gladiator stabs whom, where it stands, when a breath is used | the DM, by one tap on the recommended move | The brain works out the move (the SRD says how a monster uses its block); the DM keeps the table (owner, 23 Nov, dmh-2, dmh-4) |
| A boss's turn; anything the engine cannot run for it | the DM, from the recommended move and up to two others | One creature carries the scene, and the engine must not pretend to have played a turn it can only half play |
| A change of goal; leaving; giving up; pressing on when the party is breaking | the DM, by a card that always asks and shows the recommended choice (dmh-3) | It changes the story |
| What a creature says, and whether it keeps its word | the DM, always | Not rules |

Nothing is automatic unless the DM switches a hand to Plays itself. Even then, two things are
never done: striking a character at 0 Hit Points, and ending a truce by attacking.

**Accepting a suggestion** (one tap on the recommended move on the bar; no card is opened first, dmh-4) sends `shift { actor, go: true }`, with `stance`, `focus` or
`prefer` and `turn: true` if the DM picked something other than the standing intention. The
choice is then in the state for that one turn, `autoPlays` answers yes for it, and the usual
loop plays the turn step by step through `apply()`. The DM can stop it at any step (**Stop**
makes the hand "I'll play it" for the rest of the turn).

**The advice** for a turn is at most three options, from one pure function `advise(s, id)`:

1. what the brain would do under the standing intention (marked ▸, the recommended move, shown
   ready on the bar; every NPC has at least this one, however plain its block);
2. the next-best use of its own block that differs in kind (its Multiattack where the first is
   an area, or the other way round);
3. the intention its nearest rule would bring (Leave, when it is Bloodied; Talk again, when it
   was talking a round ago).

Under them, "You run": what its block has that the engine cannot play, each with its text and
the DM's tools. Each option has one line of why, written from the facts used ("3 caught", "its
breath is ready", "outside a sword's reach"). No option is ever built from a hidden die.

### Decision 5: how a stat block is read (the profile)

One pure function, `profileOf(monster)`, in a new rules module `tactics.js`. It reads the pack
entry and nothing else. Every reading names its field, so a DM (or a reviewer) can see where a
word came from; the words below are ours.

| Reading | From | On the card | Used for |
|---|---|---|---|
| **Wits** | `abilities.int`, banded on the SRD's own scale ("Ability Scores" table, 600 on; Awaken draws the line for an animal's mind at 3, line 24466): 3 or less **instinct**; 4 to 9 **simple** (the SRD's "weak"); 10 to 11 **sensible** ("the human average"); 12 or more **cunning** ("strong") | "Cunning (Intelligence 18)" | Who it picks on (below) |
| **Nerve** | `conditionImmune` holds Frightened: **fearless** (43 monsters). A Beast, or wits of instinct and not fearless: **wary**. Everything else: **steady** | "Wary: an animal does not die for a meal" | The resolve proposed for its group |
| **Opening** | An action with `recharge` or a daily use; `skills.stealth` | "Opens with Poison Breath (recharges on 5 or 6)"; "Ambusher (Stealth +6)" | The SRD's rule: a limited ability "as quickly and as often as possible"; Multiattack on the other turns |
| **Reach and range** | The longest `target.creature.reach`; any `range`; which of its routines deals the most on average (`actionProfile`) | "Reach 10 ft: strikes from outside a sword's reach"; "Shoots (80/320 ft)" | Where it stands (H13) |
| **Movement** | `speed.fly`, `hover`, `burrow`, `climb`, `swim`; the traits Flyby, Nimble Escape, Cunning Action | "Flies 80 ft"; "Leaves reach freely (Flyby)" | Hit and move; the way out |
| **Company** | The trait Pack Tactics | "Fights beside an ally" | Prefers a target an ally stands next to (H13) |
| **Talks** | `languages` not empty; `skills` Deception, Persuasion or Intimidation | "Speaks Common, Draconic · Deception +9 · Influence DC 18" (15 or its Intelligence score, whichever is higher: the SRD's Influence action) | Talk is offered in the proposal; the NPC card |
| **You run** | What the block has and the engine does not play: a trait with text and no modifiers, an action with a `manual` step or with text and no effects (the test behind DEBT.md's tally of held-back monsters): Legendary Actions, Legendary Resistance, Spellcasting, others | "You run: Legendary actions, Spellcasting" | The cards of stage H10 |
| **Weak spots** | `vulnerable`, Sunlight Sensitivity and the like | on the card only | the DM's eye |

**Who it picks on**, by wits, each one adding to the one before (the first build keeps today's
"nearest"; H13 adds the rest):

- *instinct*: the nearest foe;
- *simple*: the nearest, and it stays on the one it is already fighting while that one is up
  and in reach;
- *sensible*: and it does not leave a foe's reach for a target that is no better;
- *cunning*: first a foe it can reach this turn that is concentrating on a spell, then one that
  is Bloodied, then the nearest.

**Overrides are data.** Where a derived reading is plainly wrong for a monster, the fix is an
entry in a small table of ours, `content/srd52/tactics.js` (`{ [monster id]: { wits?, nerve?,
note? } }`, linted, our own words), never an `if` in the brain. A homebrew monster may carry
the same block as `tactics` (Decision 11).

**What a player could work out.** The stat blocks ship with the client and the code is open, so
a player who reads both can know that a wolf is proposed as wary. That is the same as owning
the rulebook. What they cannot know is what the DM chose for this fight.

### Decision 6: set up in seconds, changed in one tap

**Groups make themselves.** When a fight starts, the creatures of the foe's side that are in no
group yet are put in one, named for them ("The ambushers" from a preset; "The foes" otherwise).
A creature that joins a running fight and is in no group gets a card of its own ("Verdigris
joined. Its goal?"). Creatures placed together from a preset or a module's encounter are a
group from the moment they are placed, with the goal that came with them.

**The proposal** is made by a pure function, `proposePlan(s, ids)`, inside the engine at the
start of the fight, so it is the same on every replay:

- the **goal**: the one that came with the creatures; otherwise Kill (the honest default: they
  were placed as foes and the DM has said nothing else);
- the **leader**: the highest Challenge Rating, when it is above the others'; then by id. A
  group of equals has none;
- the **resolve**: the least bold nerve among them (fearless: to the death; wary: wary;
  otherwise steady);
- the **hands**: Suggests for every NPC (dmh-2);
- a **difficulty line** (stage H11): the group's XP against the party's budget.

**What becomes of the proposal** is the table's choice, `plans.mode`, kept in the plan itself
(the DM's, not a table rule players are sent):

| Mode | What happens |
|---|---|
| `off` | No proposal. Monsters play exactly as today. A table saved before this is built has `off` |
| `ask` (a new table) | A card in the tray (dmh-1: a proposed goal waits for your OK). No goal applies until you tap OK or Change; meanwhile each NPC's turn still waits for you, with the move the brain would make today (no goal) recommended. The card goes when the fight ends |
| `auto` | The proposal applies itself; every "ask" rule takes its default answer; the DM is told in one line. Solo play uses this (dmh-8, the default stands). Flagged for the owner: this sits against dmh-1 to dmh-3, which say the DM taps OK, is always asked and picks every move. Left as answered; for the owner to settle |

**One tap, anywhere the DM is looking:**

- **Turns:** each group has a bar ("The ambushers · Kill · steady") with **Change** (the goal
  chips, the resolve, the leader) and **Wrap up** (Decision 7). Each NPC row opens its card:
  intention chips, hand chips, focus, its NPC card.
- **The map:** tap a foe; the DM's quick bar for the selected creature (asked for by the
  playability review, PB-4) has an **Intention** chip beside Damage, Condition and Place.
- **Outside a fight:** select creatures, "Give them a goal" (DM tools › Creatures). The goal
  then needs no proposal when the fight starts. A guard post, a patrol and a parley that never
  becomes a fight are all set this way.

### Decision 7: shifts: how a goal changes

The owner's dragon went Talk, Kill, Leave in one scene. A **shift** is a change of a group's
goal or one creature's intention. It happens in one of three ways.

**1. The DM, at any time.** Change is always on the group bar and on every NPC's card. No
moment is needed.

**2. A moment the group has a rule for.** A moment is something the whole table has just seen:

| Moment (code) | It happens when |
|---|---|
| `bloodied` | a creature of the group is Bloodied for the first time in this fight (the rule says whose: the leader's, each one's own, anyone's) |
| `leaderDown` | the group's leader drops to 0, dies or leaves |
| `halfDown` | half or more of those the group began the fight with are down or gone |
| `lastOne` | one of them is left up (a group that began with three or more) |
| `rounds` | the fight reaches round N |
| `struck` | a creature that is not fighting is attacked, aimed at with a harmful spell or caught in a harmful area |
| `partyHalf` | half or more of the party's characters are at 0 Hit Points |
| `rolled` | a roll the DM called "about" one of them has its result (stage H14, after #676) |

A rule is `{ when, who?, to }`: at this moment, **ask** the DM whether to shift to this. `to` is
the recommended choice, shown ready for one tap. A rule never acts by itself (owner, 23 Nov,
dmh-3: "always ask, but provide recommendation").

- `who` says whose moment counts, where a moment belongs to one creature (`bloodied`,
  `struck`): `self` (each creature's own), `leader`, or `any`.
- `to` is a goal or an intention; the two lists share no word, so a linter can tell which. A
  goal changes the group's goal, and every member's intention follows. An intention is given to
  that one creature under `self`, and to every member that is up otherwise.
- Every rule has a `to`, so a card always has a recommended choice.

On a group's card the choices read **Fight on** (no change), **Break and run** (the goal Get
away) and **Give up** (the intention, for all of them). A group's resolve stands for a set of
rules, which the screen shows in words and the DM may edit:

| Resolve | Its rules |
|---|---|
| **To the death** | none. (With a goal other than Kill: `partyHalf`, ask, default "fight on") |
| **Steady** | `leaderDown`: ask, default Get away. `halfDown`: ask, default Get away. `lastOne`: ask, default Get away. `partyHalf`: ask, default "fight on" |
| **Wary** | `bloodied` (`self`): ask, recommended Leave. `halfDown`: ask, recommended Get away. `lastOne`: ask, recommended Get away |
| *always, for every NPC* | `bloodied` (`self`): ask, recommended by its nerve (fearless: fight on; otherwise Leave) |
| *always, for Talk* | `struck`: ask, default Kill |
| *always, for Buy time* | `rounds` N: ask, recommended Get away |

**3. Wrap up.** The last rounds of a fight that is already decided are the slowest part of an
evening. The group bar always has **Wrap up**: **[They run] [They give up] [Play it out]**.
"They run" takes every member that is up out of the fight at once, as driven off (Decision 8,
`force`), without playing their flight turn by turn. The `lastOne` card offers the same.

**A moment is noticed by the engine,** in the step that already runs after every action, from
the state alone: no die, no clock. Every rule adds a card to `plans.cards`; none is applied
there. A shift happens only when the DM taps.

**A card never stops the table.** The fight goes on. The creatures it is about keep their
standing intention. Only when the turn of one of *those* creatures comes with its card still
unanswered does that turn wait, with the card in front. So the DM is only ever waited for on a
monster's own turn, where a DM is expected to be busy. "You decide" on a card takes the recommended choice.
A group asks once per moment, never once per creature.

**Why moments are only things the table has seen.** A hidden threshold (a quarter of its Hit
Points, say) would make the DM pause, or a monster turn tail, at a moment the players could not
otherwise place. That would tell them a number they are never sent. Bloodied, a fall, a count of
bodies and the round number are already on every screen. Where the table rule hides foes' health
altogether (`one-token-menu.md`, Decision 7a), a creature that turns and runs when it is Bloodied
shows it is hurt, which is what a DM would say out loud.

**Why no morale roll.** SRD 5.2 has none. A hidden roll at a moment everyone saw, whose only
result is a decision the DM can make in one tap, with the recommended choice ready, is minutiae. It would also
spend seeded dice on something no rule calls for.

### Decision 8: leaving a fight, and not fighting

Two engine changes. Without them a goal is only a wish.

**Leaving.** `{ type: 'exitFight', actor, keep?, why?, force? }`, DM only (the DM's screen
sends it when the DM taps Leave on a turn bar or a card).

- Allowed when the creature stands on an edge cell of the arena, at any height, and is not
  Grappled, Restrained or Incapacitated and its Speed is not 0. `force: true` skips the edge
  test: the DM's "They run", a narrated exit. Getting to the edge is ordinary movement, with
  Opportunity Attacks as the rules give them.
- It leaves the fight's order and the map. What it was concentrating on, and what it had done
  that lasts, ends, as for a creature that vanishes (`vanish`, `resolve.js`). What it carries
  goes with it. Anyone it held is let go.
- Everyone who knew of it is sent `left { id, name }` and the log says it "flees" (or "flies
  off", for a creature in the air). A creature the party did not know of leaves unseen and
  untold, as `vanishUnseen` does it.
- `why` is `routed` (it was driven off) or `withdrew` (it chose to go). `keep: true` puts its
  whole record offstage (Decision 9).
- **Experience.** The SRD awards XP "for defeating the monster in combat or otherwise
  neutralizing it". The fight's conclusion lists a creature that left with a tick box: always
  counted (owner, 23 Nov, dmh-5): ticked whether it was driven off, gave up or chose to go. The
  tick box stays, so the DM can still untick one. `why` no longer decides XP; it stays in the DM's
  record. Players are sent what they are
  sent of any conclusion, and never `why`.
- Then `checkEnd` runs, as after any action.

**Not fighting (a truce).** One public flag on a creature that is not of the party:
`e.truce = true`. Set and cleared by the DM's `truce { actor, on }`, and by `shift` when an
intention becomes Talk or Give up, or stops being one. It means, and the engine enforces:

| Where | With a truce |
|---|---|
| Walking near it | starts no fight (the auto-engage test skips it) |
| The end of a fight | a fight goes on only while a foe that is up and **not** under truce remains. With only such creatures left, it ends |
| Its reactions | it takes none |
| A character's standing "always" for an Opportunity Attack | does not fire at it; an "ask" still asks |
| The party's AI (a stand-in, a companion the brain plays) | does not choose it as a target |
| A player who attacks it, aims a harmful spell at it or catches it in a harmful area | the action is refused with "Verdigris is not fighting. Send it again to attack anyway."; the screen asks; the second sending carries `breach: true` and goes through like any attack. The truce on that creature ends, everyone is told, and the moment `struck` reaches the DM |
| Its own brain | Talk and Give up never harm. A creature under truce with no intention of its own (a bystander the DM marked) is played as Talk. Clearing the truce is the DM's shift |

The truce is **public** because it is what the characters see: it has lowered its claws. What
is behind it (the goal, a ruse, a rule that ends the talking in round 2) is not sent. Sides are
untouched: a creature under truce is still a `foe` for every rule that asks, so `hostile()`
does not change and no other rule moves.

This is also the first step toward people on the map who are neither party nor foe, which
[`adventure-module.md`](adventure-module.md) asks for (its question 6): a bystander is a
creature under truce.

**The SRD's attitudes** (Friendly, Indifferent, Hostile) are a different thing and stay with
the DM: a field on the NPC's card that feeds the Influence aid (Advantage against Friendly,
Disadvantage against Hostile). A truce is what a creature does. An attitude is how it feels.

### Decision 9: recurring villains

**Offstage** is where a creature goes when it leaves "for later":

```js
s.offstage = { [key]: {
  rec,                                   // its whole record as it left: Hit Points, what is spent, conditions that last
  of,                                    // its part of the plan: the NPC card, marks
  left: { clock, fight, where, why, hp, maxHp },
  note,                                  // the DM's line: "furious at the sorcerer"
} }
```

- Never sent to a player, at any depth. At most 40 are kept.
- A private chronicle entry is written when a creature goes offstage and when it returns, so
  the timeline (and one day an AI DM) can follow a villain through a campaign.
- **Bring back:** `{ type: 'bringBack', key, at, hidden?, as }` (DM). It is placed as `spawn`
  places a creature. `as: 'rested'` gives back all Hit Points and everything spent; `as:
  'left'` keeps it as it went. The dialog proposes "rested" when eight hours or more of the
  world clock have passed, and says why.
- **It comes back with a new id.** Otherwise a creature brought back hidden, or under another
  name, could be matched to the old one in what a player's browser still holds. The DM's
  record keeps the link.

**The NPC card** is four short fields the DM writes: **Wants**, **Voice**, **Secret**,
**Attitude**, with the profile's "Talks" line under them. It lives in the creature's part of
the plan, goes offstage with it, and comes with a prepared encounter. The scene's NPC notes and
a module's `roleplay` say the same kind of thing in other places. Joining the three is a later
tidy-up, named in the risks.

### Decision 10: what players are sent

| Thing | A player is sent |
|---|---|
| `s.plans`: goals, resolve, rules, leaders, intentions, hands, focus, cards waiting, proposals, NPC cards, marks, presets, the mode | nothing. It is one top-level key that `playerView` does not list |
| `s.offstage` | nothing |
| The events `planned`, `shifted`, `moment`, `offstage` | nothing: they are not in `viewEvents`' list. They are on the DM's timeline |
| The queue, the advice, the options not taken, the difficulty line | nothing: they are never state and never sent to anyone. The DM's browser works them out |
| `truce` on a creature and the event `truce { id, on }` | sent: it is what the characters see |
| `left { id, name }` | sent for a creature the party knew of, named as they were shown it. Never `why`, never whether it was kept |
| A creature brought back | what any newly placed creature is: a new id, nothing that links it to the old one |
| The conclusion | a creature that left is named among those "driven off" if the party saw it. Never `why` |
| A monster's `tactics` block and our override table (Decision 11) | nothing of a homebrew monster's: monster entries are not in a player's copy of a pack. The SRD override table ships with the client like the stat blocks, and says nothing of any one fight |
| A DM-only action (`plan`, a `shift`) | nothing at all, not even an empty update: the server already sends a connection nothing when nothing it may know of changed, and numbers updates per connection (`tables.js`, `quiet` and `nextSeq`) |
| Undo and redo of such an action | nothing, as for any step the players never heard |

**The AI's choices.** Three rules keep a plan from showing through what creatures do.

1. **The party's AI never reads the plan.** `knownTo` (the copy a stand-in and a party
   companion read) leaves out `plans` and `offstage`. Of all this, the party's AI knows only
   `truce`, which is public. A party-side NPC the DM runs (dmh-10) is neither a stand-in nor a
   player's companion: its turn waits for the DM like every NPC's, and its recommended move is
   worked out on the DM's side, from the DM's state. Stand-ins and companions stay blind.
2. **A foe never stands by something the party does not know of.** The anchor of Hold its post
   is a place, or a creature the party knows of. Naming an unknown creature is refused to the
   DM ("The party does not know of it yet: name a place"). This follows the rule companions
   already obey for a hidden master.
3. **A moment is a public fact** (Decision 7).

**Timing.** No card stops the table. A wait happens only on an NPC's own turn, which waits for the
DM for every NPC (dmh-2), as a DM who plays monsters by hand is waited for too. A DM-only action sends players no bytes, so the
taps themselves leave nothing to count. The pause before an auto-played move is the same fixed
timer with or without a plan. A builder must not add work to it that grows with the plan.

**What does show, and should:** a monster that runs is seen to run. Players learning from what
creatures do is the game.

### Decision 11: prepared encounters and packs carry it as data

**One shape, three carriers.** The encounter entry of `adventure.js` gains closed keys:

```js
{ id: 'forest-ambush', name: 'The ambushers',
  creatures: [
    { monster: 'assassin', count: 1, leader: true },
    { monster: 'gladiator', count: 4 },
  ],
  plan: { goal: 'kill', resolve: 'steady',
          rules: [{ when: 'leaderDown', to: 'flee' }],
          notes: 'Hired in the city. They know the paladin by sight.' },
  budget: { difficulty: 'low', level: 14, size: 5 }, tactics: '…', stage: 'dm' }

{ id: 'verdigris', name: 'Verdigris',
  creatures: [{ monster: 'adult-green-dragon', name: 'Verdigris', hand: 'suggest',
                card: { want: 'To learn who hired them; to be flattered.', voice: 'Slow, amused.',
                        secret: '…', attitude: 'indifferent' } }],
  plan: { goal: 'parley', rules: [{ when: 'struck', to: 'kill' },
                                  { when: 'bloodied', who: 'self', to: 'withdraw' }] },
  stage: 'dm' }
```

`plan`, and on a creature `leader`, `hand`, `stance` and `card`, are all optional and all
linted against the lists of this spec. `tactics` stays as free text and is shown on the group's
card as the author's note. The three carriers:

1. **A module** ([`adventure-module.md`](adventure-module.md)): its `encounters`, as designed.
   Its `stage` action places the creatures and writes the group. This amends that spec's
   Decision 3, which says the AI does not read tactics: it still does not read the text. It
   reads `plan`.
2. **A presets file** the DM loads: `{ format: 'hextable-encounters', v: 1, encounters: [...] }`,
   the same entries without a map. "Drop a preset" places them round the cell the DM taps, in
   the entry's order, with no dice. This is the "encounter presets" the playability review
   asked for (PB-8), and it lets a DM keep next session's fights as files and check them with
   the CLI.
3. **Saved at the table:** "Save this group as a preset" writes the same entry into
   `plans.presets` (the DM's; saved with the table; exported with it).

Presets are **never part of a homebrew pack**: packs are sent to players, filtered, and an
encounter is the DM's secret.

**A monster's own tactics** are part of its entry: an optional `tactics: { wits?, nerve?,
note? }` on a monster, in a homebrew pack or in our override table. That is a new key in the
closed vocabulary of `schema.js`, so it is an engine change with this amendment and lands as
its own stage (H12). Monster entries are never sent to players. The one exception in
[`homebrew.md`](homebrew.md) (a player who runs a homebrew creature is sent its block) must
leave `tactics` out, and a test says so.

### Decision 12: where it shows

Everything is in a place the one-token menu already has. Nothing new sits on the clean screen.

| Place (`one-token-menu.md`) | What the DM sees there |
|---|---|
| **Turns** | The queue. A bar per group (goal, resolve, Change, Wrap up). Under each NPC's name a second line, the DM's only: its intention and what it will do ("Fight: Multiattack on the paladin (nearest)"), a mark for its hand, and "You run" where there is any. A tap on an NPC row opens its card. A row grows from 44 to 60 px; nothing else moves |
| **Waiting for you** (the tray of #675, and the token's badge) | Cards, newest moment first: the proposal at the start of a fight; a shift card; "X joined"; the "You run" cards of stage H10; after a fight, a creature kept offstage. Each has its buttons and a Done |
| **The turn bar** | For every NPC's turn (dmh-2, dmh-4). The turn is a question the table waits on, so the bar opens by itself, as a reaction question does, with the recommended move already shown and one tap to play it: no card is opened first. The other options are one tap further, in the same bar ("Other moves"). On a phone it is a bottom bar of one 56 px row (the move and Do it) that grows into three rows if you tap Other moves; on a wide screen it is the first line of the pinned column. By the menu's one-overlay rule it folds the menu |
| **DM tools › Undo and the fight** | "Monsters' plans: Off / Ask me / By themselves"; the group list out of a fight |
| **DM tools › Creatures** | "Give them a goal"; Presets (drop, save, load a file); **Offstage** with Bring back |
| **The DM's quick bar for the selected creature** | the Intention chip |
| **The rewards form** | "left" beside a creature that left, with its tick |
| **A player's screen** | "Not fighting" on a creature under truce (in Turns and on its health bar's label), the "Attack anyway?" question, and the two log lines. Nothing else |

Words on the screen are the owner's: **Goal** for the group, **Intention** for one NPC.

## Vocabulary and state additions

All optional: a state without them reads as "no plan", and plays as today.

```js
s.plans = {
  mode: 'ask',                                   // 'off' | 'ask' | 'auto'
  bands: { b1: {
    id: 'b1', name: 'The ambushers', goal: 'kill', resolve: 'steady', leader: 'm7',
    anchor: null,                                // { cell } | { creature }: repel, defend, stall
    focus: null, rounds: null,                   // a creature the party knows of; the round Buy time ends
    rules: null,                                 // null: the rules of `resolve`; else [{ when, who?, to }], `to` a goal or a stance (always asked)
    notes: '', from: null,                       // from: a preset or module encounter id
    began: { fight: 12, size: 5 }, seen: ['halfDown'],
  } },
  of: { m7: {                                    // one creature's part
    band: 'b1', stance: null, hand: null,        // null: from the goal; from the profile
    focus: null,
    once: null,                                  // { fight, round, stance?, focus?, prefer? }: this turn only
    go: null,                                    // { fight, round }: the DM released this suggested turn
    card: { want: '', voice: '', secret: '', attitude: 'indifferent' },
    marks: [],                                   // stage H10: [{ label, left, max, back }]
    was: {},                                     // { bloodied: true }: so a moment happens once
  } },
  cards: [],                                     // [{ n, fight, when, band, actor?, offers, default }]
  proposed: null,                                // { fight, bands }: waiting for OK under 'ask'
  presets: [], next: 1,
};
s.offstage = {};                                 // Decision 9
e.truce = true;                                  // on a creature not of the party; public
```

| List | Values |
|---|---|
| `GOALS` | `kill`, `repel`, `defend`, `stall`, `parley`, `flee`; later `capture`, `seize` |
| `STANCES` | `fight`, `post`, `talk`, `withdraw`, `yield`; later `harry` |
| `RESOLVE` | `death`, `steady`, `wary` |
| `HANDS` | `auto`, `suggest`, `mine` |
| `MOMENTS` | `bloodied`, `leaderDown`, `halfDown`, `lastOne`, `rounds`, `struck`, `partyHalf`; later `rolled` |
| the profile's `wits` | `instinct`, `simple`, `sensible`, `cunning` |
| the profile's `nerve` | `fearless`, `steady`, `wary` |
| `ATTITUDES` (the card; the SRD's words) | `friendly`, `indifferent`, `hostile` |

The words were chosen so that none means something else in the brain already: `guard`,
`protect`, `hold` and `free` are modes of the companion brain and are not used here.

Actions, all the DM's:

```js
{ type: 'plan', mode }
{ type: 'plan', accept: true }                                        // or accept: { bands } after Change
{ type: 'plan', band, set: { name, goal, resolve, leader, anchor, focus, rounds, rules, notes }, members? }
{ type: 'plan', band, drop: true }
{ type: 'plan', actor, set: { band, hand, card, marks } }
{ type: 'plan', preset: { save | drop | remove } }
{ type: 'shift', band, goal | stance, card? }                         // the group's goal from now on, or one intention for all of it
{ type: 'shift', actor, stance?, focus?, prefer?, turn?, go? }        // one creature; `turn`: this turn only
{ type: 'shift', card, dismiss: true }
{ type: 'truce', actor, on }
{ type: 'exitFight', actor, keep?, why?, force? }
{ type: 'bringBack', key, at, hidden?, as }
```

and `breach: true` on `attack`, `act` and `cast` (anyone's) against a creature under truce.
None of these is in `WHILE_WAITING`: while an action waits for a reaction they are refused, as
most actions are. Limits (`PLAN_LIMITS`): 12 groups, 40 members a group, 8 rules a group, 20
cards waiting, 40 offstage, 40 presets, names 60 letters, notes 2,000, a card field 300.

Build rule: **nothing of a plan is ever written into `s.encounter`**. Its `flags` are sent to
players.

## The other helpers

The owner asked what else belongs here. Each candidate was weighed on one question: does it
clearly help the story flow at a table of five high-level characters? Sizes are S, M and L, as
the lead sizes jobs.

**Kept, in the order recommended:**

| # | Helper | What it is | Size |
|---|---|---|---|
| 1 | **The DM's to-do tray** (#675) | Already a job. It is the home of every card here, so it comes first. This spec adds card kinds to it and asks one thing of it: cards that come from the state (`plans.cards`) must survive a reload | M |
| 2 | **Calling for rolls** (#676), with two additions | Already a job. Add: **several creatures in one call**, and **damage on a failed save** (`onFail: { damage, type }`, `half`). A boss's ability the engine does not run is nearly always "everyone in the cloud makes a Constitution save or takes 2d6 poison", and so are the players' spells that are still the DM's. With the two additions that is one card, not five rolls and five subtractions | S engine each; the screen M |
| 3 | **Boss marks and "You run" cards** (stage H10) | Counters only the DM sees for what the engine does not track on a boss (legendary actions left, Legendary Resistance left), with the block's own text, a reminder after each other creature's turn, and the tools beside it. It shrinks as DEBT M5 and M6 are built | M |
| 4 | **Wrap up** (Decision 7) | One tap ends a fight that is already decided: they run, or they give up | in H9 |
| 5 | **Ready your turn** | A player may choose and aim on someone else's turn; when their turn starts the confirm bar is already up ("Cast Fireball here? Cast / Change"). Nothing is ever sent without their tap. Five characters with long sheets are where an evening's time goes | M client |
| 6 | **The difficulty line** (stage H11) | The SRD's XP budget per character, as checked pack data, added up for the party as it is: "11,100 XP: below Low". For a party of unequal levels each character's own row is added (a design choice; it equals the SRD's sum when levels are equal). Advice, never enforced, never sent to players | S |
| 7 | **NPC cards** (Decision 9) | Wants, Voice, Secret, Attitude, and the Influence DC worked out from the block | in H2 and H8b |
| 8 | **"Last time…"** | The DM marks "Session starts" and "Session ends" (chronicle entries with a tag: no engine change). A pure function lists what the record holds between two marks: fights and how they ended, who fell, who left for later, XP, loot, places entered, the DM's own entries. The DM reads it out, or shows the public part as a handout. Facts set in order, not prose | S rules, S client |
| 9 | **One Initiative roll for identical monsters** | A rules gap found on the way: the SRD says "For a group of identical creatures, the GM makes a single roll" (1757). The engine rolls each. Fixing it makes the turn order shorter and the queue readable ("Gladiators ×4"). It changes the dice a fight uses, so it is a table rule: on for new tables, off for saved ones | S to M engine |
| 10 | **Knock out** (stage H15) | The SRD's rule, for players and monsters: a melee blow that would drop a creature leaves it at 1 Hit Point and Unconscious. Prisoners are story | S to M |
| 11 | **"Suggest a move"** for a player | The stand-in's own choice, shown as a hint on request, worked out in the player's browser from the player's own view (the casting AI was built to use nothing a player is not sent). Good for new groups. Less for a level 13 table, where the casting AI knows damage and healing but not buffs or control | S to M |
| 12 | **Conditions in context** | A tap on a condition, on any creature the viewer can see, says what it changes and how it ends. The engine applies conditions already, so this explains, it does not remind. Belongs in menu stage M4 | S |
| 13 | **What they carried** | 45 SRD stat blocks have a Gear line. Entered as data, the rewards form could offer it. Little use against dragons | S content, S client |

**Turned down:**

| Candidate | Why not |
|---|---|
| Loot suggested by Challenge Rating | SRD 5.2 has no treasure tables. Numbers we made up, shown beside SRD content, would be the engine pretending |
| A spotlight tracker (who has had less of the evening) | The game cannot measure a conversation, and a number about the people at the table is the DM's judgement. In a fight the turn order is the spotlight; "you're next" is already in the menu's design |
| A morale roll | Not in the SRD; a hidden roll for what one tap decides (Decision 7) |
| A turn timer | Pressure is not story. Ready your turn gets the same minutes back kindly |
| The game quietly making a fight easier or harder | The engine never pretends. The SRD's own answers are creatures that flee and reinforcements, and both are buttons here |
| Players queueing an action the game then takes for them | "Must never act by itself" (the lost-link rule, E20). Ready your turn keeps the tap |
| Speech or narration written by a language model | No network and no model in the rules. It belongs to the AI DM, which will read and write this same plan through the same actions |

## What this needs from other work

| Work | Why this needs it | What happens without it |
|---|---|---|
| **#675, the to-do tray** | Every card lives there | H8a would have to build a tray of its own. Do #675 first |
| **#676, a called save** and the prompts spec | The moment `rolled`; "You run" cards that can call a save; the Influence aid | The shift buttons sit on the NPC's row, and H14 waits |
| **Menu M1, then M5 and M6** | Turns, DM tools and the badge are where this shows | H8a and H8b can be built into today's tracker tab and DM tab, ids kept, and moved by M5. Better after M1 (#665) so it is built once |
| **DEBT M5 (legendary actions) and M6 (monster spellcasting)**, ROADMAP milestone 3 | For 29 of the 53 monsters a level 13 to 15 party meets, the best move each round is one the engine cannot run | The helper says "You run" and counts for the DM (H10). Honest, but it is the DM doing the work. **Recommended: M5 straight after the first slice below, before any sharper tactics** (dmh-11, accepted by the owner) |
| **AI casting AC3** (buffs and control) | Same file as H3 and H13 (`ai.js`) | No dependency. One job in `ai.js` at a time |
| **Module stage `stage`** (adventure-module, A2 on) | Dropping a preset is the same act as staging an encounter | H12 builds the creature half of `stage` and the module stages reuse it |

## Build plan

Each stage is one pull request, with `npm test` and `npm run build`, and for a screen the phone
(390 x 844, touch) and 1280 x 800. "Strongest" means the strongest model available builds or
reviews it: it touches `engine.js` or what players are sent. A stage that adds a rules module
adds it to CLAUDE.md's layout (the guides test fails otherwise).

| # | Stage | Kind, size | Files | Depends on | Done when |
|---|---|---|---|---|---|
| H0 | **The mockup**: the dragon fight above as a clickable picture, phone and wide, DM and one player | design, M | `docs/specs/mockups/dm-helper.html` | the owner's read of this spec | The owner has clicked through the evening above and answered the questions |
| H1 | **The profile** | rules, M | `packages/rules/src/tactics.js` (new), `content/srd52/tactics.js` (new, empty table and its lint), `test/tactics.test.js` | none | `profileOf` answers for all 329 monsters without a throw; a test prints every monster's wits, nerve and readings and pins the list, so a reviewer checks it once; each reading names its field |
| H2 | **The plan in the state**: `plans`, the actions `plan` and `shift`, the proposal at the start of a fight (it waits for OK), groups of party-side NPCs (dmh-10), the hand `suggest` for every NPC, limits, DM-only events, undo labels | engine, L (wider than before: allies), strongest | `packages/rules/src/plan.js` (new), `engine/plans.js` (new), `engine.js` (the handlers, the after-action step), `history.js`, `migrate.js`, `ai.js` (`knownTo` leaves the plan out), `packages/server/README.md`, tests | H1 | Tests 1 to 4 below pass; with mode `off` or no plan every existing test passes unchanged |
| H3 | **The brain reads the intention**: Hold its post, Talk, Leave (to the edge), Give up; `focus` and `prefer`; `autoPlays` reads the hand and `go`, so every NPC's turn waits (dmh-2); an ally's brain aims at foes | rules, L (was M: every NPC now waits, and allies) | `ai.js`, `test/ai-plans.test.js`, `test/ai-plans-replay.test.js` | H2 | Recorded fights from main replay byte for byte with no plan (test 5); a talking creature never returns a harmful action in 1,000 seeded states; a creature told to leave reaches an edge or says it is boxed in; an NPC with no `go` never plays; an ally never aims at a character |
| H4 | **Leaving, offstage, bringing back**: `exitFight`, `bringBack`, `s.offstage`, the conclusion's "left" | engine, L, strongest | `engine/resolve.js`, `engine/plans.js`, `rewards.js`, `view.js` (`left`), `history.js`, tests, a `twin()` scenario | H2 | A creature at the edge leaves and the fight ends if it was the last; its lasting effects end; a kept one returns with a new id; tests 6 and 7 pass |
| H5 | **Truce**: the flag, `truce`, `breach`, the end of a fight, auto-engage, reactions, the party's AI | engine, L, strongest | `engine/shared.js`, `engine/resolve.js` (`checkEnd`), `engine/movement.js`, `engine/attacks.js`, `engine/casting.js`, `reactions.js`, `ai.js`, `view.js`, `view-fields.js`, tests, a `twin()` scenario | none (H2 for `shift` setting it) | A fight with only creatures under truce left ends; walking past one starts nothing; an attack without `breach` is refused and changes nothing; with it, the truce ends and all are told; test 8 passes |
| H6 | **Moments, rules and cards**: the engine notices moments and queues a card for each; `shift` answers one. No rule applies itself (dmh-3) | engine, S to M (was M: the auto rules are gone), strongest | `plan.js`, `engine.js` (the after-action step), `engine/plans.js`, tests | H2 (H4 and H5 to carry out Leave and Give up) | Each moment happens once; no moment changes the state except by adding a card; a card never sets `pending`; test 9 passes |
| H7 | **The queue and the advice**: `queue(s)`, `advise(s, id)`, the lines of why; at least one recommended move for every NPC, plain or not | rules, M | `packages/rules/src/advise.js` (new), tests | H1, H3 | Same state, same advice (1,000 seeded states twice); every option's first action is accepted by `apply()` on a copy; the first option equals what `aiStep` returns; every NPC in a fight, foe or ally, has a first option; test 10 passes |
| H8a | **The DM's screen, part 1**: the turn bar with the recommended move on every NPC's turn, ready for one tap (dmh-2, dmh-4), the proposal card (it waits for OK), the group bar and the queue lines in Turns | client, L | `packages/client/helper.js` (new), `helper.css`, `tracker.js`, `app.js` (`idled` plays only a turn the DM released or whose hand is Plays itself), `todo.js` (#675), a smoke pass `helper` | H2, H3, H7, #675; best after menu M1 | A DM accepts a proposal in one tap and changes a goal in two; every NPC's turn opens its bar by itself with the recommended move first and one tap plays the turn, with no card to open; a player's screen in the same smoke pass shows none of it |
| H8b | **The DM's screen, part 2**: the NPC's card (intention, hand, focus, the four fields), the Intention chip, groups of allies | client, M | `helper.js`, `helper.css`, `tracker.js`, smoke | H8a | An NPC's intention is changed in two taps; an ally has a group, a goal and a bar like a foe's; a player's screen shows none of it |
| H9 | **The DM's screen, part 3**: shift cards, Wrap up, "Leave, for later", Offstage and Bring back, "left" on the rewards form; the players' "Not fighting" and "Attack anyway?" | client, M | `helper.js`, `conclusion.js`, `actionpanel.js` (the question), `tracker.js`, `logview.js`, smoke | H4, H5, H6, H8a | The dragon evening above can be played end to end in the smoke pass |
| H10 | **Boss marks and "You run" cards** (takes in PB-9's card) | client M, engine S | `plan.js` (`marks`), `helper.js`, `todo.js` | #675, H2 | A creature with Legendary Actions shows its counter; after each other creature's turn a card offers Used one or Skip; nothing is rolled or applied by the card itself |
| H11 | **The difficulty line** | content S, rules S | `content/srd52/advancement.js` (the budget table, `checked`), `plan.js` (`difficulty`), `helper.js` | none | The SRD's three worked examples give 200, 1,125 and 46,800 XP; the line never reaches a player |
| H12 | **Presets and the encounter shape**: the new keys in the linter, the presets file, drop and save, the monster `tactics` key | rules M, client S, strongest for `schema.js` | `adventure.js` (keys and lint, `lintEncounter` shared), `content/schema.js` (`tactics` on a monster), `engine/plans.js`, `scripts/hb.mjs` (lint a presets file), `helper.js` | H2; shares `stage` with the module stages | A presets file with a bad goal is refused in words; a dropped preset places all or none and its group carries the plan; no player message holds a preset's canary |
| H13 | **The sharper brain**: Hit and move, striking from the edge of reach, who it picks on by wits, Pack Tactics | rules, M (two pull requests if it grows) | `ai.js`, tests | H1, H3; not at the same time as AC3 | Only creatures in a plan change; each behaviour has a pinned scenario; the no-plan replays still pass |
| H14 | **Rolls that shift**, and the Influence aid | engine S, client S | the files of #676's client job, `plan.js` | #676 and its screen | A called roll "about" a creature shows that group's shift buttons on its result card; Influence shows DC 15 or the creature's Intelligence, whichever is higher |
| H15 | **Knock out**, then the goal Take them alive | engine S to M, client S | `engine/resolve.js`, `engine/attacks.js`, `ai.js`, `actionpanel.js` | none | A melee blow with `spare` leaves 1 Hit Point and Unconscious as the SRD words it; the goal is no longer greyed |

**Order.** H0 while H1 is built. Then the first slice, which already gives the owner his ask:
**H2, H3, H7, H8a, H8b** (a goal, intentions, the queue, a recommended move on every turn). The
first slice was four pull requests (L, M, M, L) and is now five (L, L, M, L, M): every NPC's turn
waiting for the DM (dmh-2) makes the brain and the screen's work larger, and allies (dmh-10) widen
the state. H6 is a little smaller, since no rule acts by itself. Then **H4, H6, H9** (shifts,
leaving, for later), **H5** beside them (it is independent in the engine), and **H10** as soon
as #675 is in. Then, for this party, DEBT M5 before H13. H11 and H15 are small and can go
whenever a hand is free. H12 goes with the module stages. H14 follows #676.

## Tests that say it is safe

In `packages/rules/test/` and `packages/server/test/`; the numbers are used in the build plan.

1. **Allow list.** With a full plan, an offstage creature and cards waiting,
   `JSON.stringify(view(...))` for a player holds none of the keys `plans` and `offstage`, at
   any depth.
2. **Canary.** Every text of the plan holds a canary (`CANARY-WANT`, `CANARY-SECRET`,
   `CANARY-NOTE`, a group named `CANARY-BAND`, a rule, a preset). A whole AI-played fight with
   shifts, a creature leaving and one brought back sends no player a canary: views, patches,
   events, history, errors.
3. **Twin worlds** (`twin()`, as AGENTS.md requires). World A has no plan. World B has a plan,
   cards, marks and a kept creature. The same script runs in both, plus B's `plan` and `shift`
   actions, ending before any creature's behaviour differs. Every player is sent the same
   bytes, the same number of messages and the same sequence numbers.
4. **The party's AI is blind to it.** A stand-in and a party companion return the same action
   in A and B on every step.
5. **No plan, no change.** Fights recorded on main before H3 replay byte for byte
   (`ai-plans-replay.test.js`, as `companions-brain-replay.test.js` does for the companion
   brain).
6. **Leaving.** `left` reaches a player only for a creature the party knew of, and carries
   nothing but its id and shown name. A creature that leaves unseen is in no player message.
7. **The return.** A creature brought back has an id no player message held before.
8. **Truce.** It is the same in both worlds of a twin (it is public); the refusal without
   `breach` changes nothing and is the same sentence whatever is behind the truce.
9. **Moments.** A moment's DM-only events and cards reach no player; a moment changes nothing in
   the state but the card, and a player's messages are byte-identical to the world without the
   moment's card.
10. **Determinism.** `queue`, `advise` and `aiStep` call no die: run on a state whose `rng`
    throws, they still answer.

## Risks

- **The cards become the new minutiae.** With every NPC's turn waiting (dmh-2), a fight with eight
  NPCs is eight taps a round. That is what the owner asked for ("to facilitate this that's why
  we're creating recommended actions"), so the defence is how little each tap costs: the
  recommended move is already on the bar, one tap plays it, and no card is opened first (dmh-4). A
  group asks once per moment, no card stops the table, Wrap up ends a decided fight, the DM may
  switch a hand to Plays itself (the DM's choice, never the default), and "Monsters' plans: Off"
  is always there. The mockup must be judged on how quick the tap is, and on how often the owner
  is interrupted, not on how much it can do.
- **A boss's best move is one the engine cannot play.** Until DEBT M5 and M6, the top of a
  dragon's turn bar is honest but thin, and "You run" is the DM working. This is the largest
  risk for the owner's own table, and why M5 is asked for early.
- **A plan surprises the DM.** A monster that runs when the DM forgot the rule looks like a
  bug. Nothing shifts by itself, except under the mode "By themselves" that solo play uses (see
  the flag in Decision 6); there every shift writes a DM log line with its reason, and is undone
  with the action that caused it.
- **Leaks through a careless field.** A flag in `s.encounter`, an event type added to the
  public list, a `why` left on `left`. The canary and twin tests are the guard, and H2, H4, H5
  and H6 go to the strongest model.
- **Truce sits close to `hostile()`.** It deliberately does not change it. The edge cases are
  reactions, areas that catch a creature under truce, and a truce broken in the middle of a
  Multiattack. H5 lists and tests each.
- **Leaving is a way out of a locked arena.** Only the DM can send `exitFight`. A party's own
  retreat is the defeat flow of `table-ui.md` and is not changed here.
- **Undo is one line.** A shift the DM made sits in the same history as the players' moves.
  Taking back an earlier misclick takes the shift back first. That is how every DM action
  behaves today.
- **Three places for an NPC's notes** (the scene, the module, this card). Not joined here; one
  later job should give them one home.
- **The brain's limits show more.** It treats height only as distance (DEBT M9), so "stays 60
  ft up" is H13's work; until then a talking flyer stays where the DM put it.
- **The phone.** A DM on a phone gets taller rows in Turns and a turn bar over the map. The
  mockup checks both at 390 x 844 before any build.
- **Copyright.** The profile must stay a reading of SRD numbers in our words. The reviewer of
  H1 and H13 checks that every line of text traces to a field or an SRD line.

## The owner's answers (23 Nov)

The fourteen questions this design asked, as the owner answered them on the project board. Each is
now a decision; the sections named were changed to follow it. Where the lead gave a reading of a
note, it is marked "Beej's reading, for the owner to confirm".

- **dmh-1. Does a proposed goal apply before you have said OK?** Owner, 23 Nov: "Yes it applies.
  This should inform the suggestion, correct? It's not automated. Again, the goal is to facilitate
  the DM's facilitation of the adventure, not turn this into a video game. ... keep it social and
  interactive." Beej's reading, for the owner to confirm: a proposed goal waits for the DM's OK
  (the first option, which was the default); goals shape the suggestions, nothing is automated; the
  owner's aim (help the DM run the table; keep it social, not a video game) is now in the design's
  purpose. See "In plain words", "What the owner asked", Decision 6 (the mode table).
- **dmh-2. Whose turns wait for you?** Owner, 23 Nov: "Every NPC. To facilitate this that's why
  we're creating recommended actions." Beej's reading: every NPC's turn waits for the DM's pick,
  with a recommended move ready. See Decision 4 (the hands table: Suggests for every NPC),
  Decision 6, Decision 12 (the turn bar), the build plan (H3 larger, H8 split) and the Risks.
- **dmh-3. When a rule fires, ask or act?** Owner, 23 Nov: "always ask, but provide
  recommendation." Beej's reading: always ask, with the recommended choice shown. No rule acts by
  itself: the `how` key is gone. See Decision 7 (the rule, the resolve table, "A moment is
  noticed"), Decision 11 (the examples), the vocabulary, H6 and test 9.
- **dmh-4. Should a suggested turn open its card by itself?** Owner, 23 Nov: "If it's a
  recommendation, make the recommendation so I can one click to move it along." Beej's reading:
  the suggested move is shown ready to accept with one tap, with no separate card to open. See
  Decision 4 ("Accepting a suggestion"), Decision 12 (the turn bar) and H8a.
- **dmh-5. XP for a creature that left.** Owner, 23 Nov: always counted. See Decision 8
  (Experience) and the dragon evening. The tick box stays so the DM can untick one.
- **dmh-6. Do players see "not fighting"?** Owner, 23 Nov: the default. Yes, with "Attack
  anyway?". See Decision 8.
- **dmh-7. Does the fight end by itself when only creatures not fighting remain?** Owner, 23 Nov:
  the default. Yes. See Decision 8.
- **dmh-8. Solo play.** Owner, 23 Nov: the default. Plans apply by themselves with their default
  answers. Flagged: this sits against dmh-1 to dmh-3 (see Decision 6); left as answered, for the
  owner to settle.
- **dmh-9. A villain's return.** Owner, 23 Nov: the default. "Rested" is proposed after eight hours
  or more of the world clock. See Decision 9.
- **dmh-10. Allies you play.** Owner, 23 Nov: yes, include party-side allies in the first build.
  See Decision 2 ("Allies you play"), Decision 10 (the party's AI), H2, H3, H8b. Talk and Give up
  for an ally are not in the first build (they rest on the truce); flagged.
- **dmh-11. Legendary actions before sharper tactics.** Owner, 23 Nov: the default. DEBT M5 after
  the first slice, ahead of H13. See "What this needs from other work".
- **dmh-12. Words for monsters' tactics.** Owner, 23 Nov: the default. Derived from the numbers
  only; a hand-written note only where plainly wrong. See Decision 5.
- **dmh-13. One Initiative roll for identical monsters.** Owner, 23 Nov: the default. Built as a
  table rule, on for new tables. See "The other helpers", row 9.
- **dmh-14. The two additions to calling for rolls.** Owner, 23 Nov: yes to both, as part of #676's
  work. See "The other helpers", row 2.
