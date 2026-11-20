# Spec: the player's screen at the table

Status: draft by an agent, to be reviewed by the design owner; superseded in part by `one-token-menu.md`.

> **Superseded in part by [`one-token-menu.md`](one-token-menu.md) (#527).** The owner's
> direction of 19 November 2026: a clean screen, one token that opens one menu, one overlay
> at a time. Where the two differ, `one-token-menu.md` wins: the action panel at the foot of
> the screen, the order strip and the top bar give way to the token, the turn line and the
> menu. Kept from this spec: the turn bar (now at the top of the character screen), aiming
> that locks and confirms at the thumb, the reach edge, the wait, down, dead and level-up
> words, the offline bar, and reasons for greyed things. Its build stages fold into that
> spec's stages as its build plan says.

Status: draft by an agent, to be reviewed by the design owner. Issue #358. A design
job: this spec and a clickable picture, [`mockups/player-screen.html`](mockups/player-screen.html)
(open the file in a browser; nothing in it runs the game). No code is written by this
spec.

The owner, 15 November 2026, after the start page design (#356): "After the startup
screen have it take a look at the player screen".

It is written in the style of `table-ui.md` and `start-page.md`: who is playing and
what they are trying to do at each moment; what exists; where the play test showed the
screen failing; the layouts considered; the choice and its reasons; the words; the
states; the build in stages; risks and questions.

`table-ui.md` decided the drawer, the action panel and its tabs, the tracker, the log by
fight, and the defeat and rewards cards, and they are built. This spec does not reopen
them. It looks at them from the chair of a player in the middle of a game and proposes
what to add, move or reword so that the answers a player needs are on the screen when
they need them.

## Rules that bind this design

- **Presentation first.** Most of what follows is the client reading what the view
  already sends. Where a proposal needs the engine, it says so and names the amendment
  (E-P1 to E-P4 below); nothing in the client stages waits for them.
- **Everything goes through `apply()`.** Every button sends an action the engine already
  has, or one the named amendment adds. The client decides nothing: reach, cost, who is
  caught by an area, why something is greyed, all come from the engine's own helpers
  (`moveOptions`, `areaHexes`, `areaTargets`, `blocked`, `hideProblem`, `spellWhy`), as today.
- **The engine never pretends.** A thing the game cannot do (stabilising with Medicine,
  today) is shown greyed with its reason, never hidden and never faked.
- **A player is sent nothing hidden.** No line here needs more than the view sends.
- **Phones are first-class.** Every layout is given at 390 x 844 with one thumb and at
  1280 x 800. Targets are at least 44 px. Nothing depends on hover. Every greyed thing
  says why in words on the screen.
- **Themes restyle only.** Colour, type and radius come from the tokens in `themes.js`;
  the mockup copies the three themes and can switch between them.
- **Plain words.** "5E compatible"; no trademarked game name.

## The player and their moments

The person: a player at a table (hosted, with a DM in another browser) or alone (solo,
where the same person is the DM). Often on a phone held in one hand, the other hand on
dice, a drink or a snack; sometimes on a laptop. A fight is many short turns, each of
which starts with the same few questions; exploring is long stretches with a few verbs.

For each moment: what the screen should answer **at a glance** (without a tap), and
whether today's screen does. "Glance" means visible on a 390 x 844 phone without
scrolling or opening anything.

| # | Moment | At a glance the screen should say | Today | Verdict |
|---|---|---|---|---|
| 1 | **"It is my turn: what can I do, how much have I left?"** | That it is my turn (a clear moment, not a small badge); Action, Bonus Action, Movement in feet and Reaction, each ready or used; the likeliest things to do | A "turn" badge on my chip, my name lit in the order strip, End turn appears, the camera moves to me. Small outlined pills: Action, Bonus Action, Move 30 ft, Reaction; a used one is struck through at 40 % opacity. Attacks tab first | **Partly.** The resources are there but small; nothing marks the start of the turn for someone looking away; a used pill is told by strike and fading only |
| 2 | **"Where can I go?"** | Every space I can reach this turn, its edge, and how far Dash would take me; the cost of a space before I commit | The reachable spaces are filled at 34 % with the theme's move colour (Classic: a warm yellow) with no edge; on the valley's yellow-green grass inside the arena it reads as a tint. The Move tab says "Speed left 30 ft" with a bar. No Dash range, no cost of a space, no path | **Weak.** It exists but is hard to see, colour only, and says nothing about cost |
| 3 | **"What will this spell hit?"** | The area on the map, who is in it by name, a warning when a friend is in it, and that it stays where I put it until I cast | Armed: a hint bar at the top, "Burning Hands: tap a square to aim the 15 ft cone". A tap draws the cone and names those caught ("Burning Hands catches Pip, Goblin Warrior 1, ..."), with Cast and Cancel in the hint bar. **With a mouse the aim follows the pointer even after a click**, so on the way to Cast it moves: measured at 1280 x 800, a cone aimed on five creatures read "Burning Hands catches nobody" by the time the pointer reached Cast | **Wrong** on a computer; on a phone it holds, but Cast sits at the top of the screen, the farthest point from the thumb, and a friend in the area is only one more name in the list |
| 4 | **"What just happened to me?"** | The last thing that happened to my character, in words, where I am looking | Floating numbers over pawns and the dice; the words are in the log, in the drawer (Menu, Log: 2 taps) | **Hidden** |
| 5 | **"What is my friend doing?"** | Whose turn it is, and where they are | The order strip lights the current creature, the camera moves to it, floating numbers. On a phone the strip scrolls sideways and the current turn can be off its edge (seen: my own turn cut off at the right) | **Mostly**; the strip needs to keep the current turn and my next turn in view |
| 6 | **"I am waiting."** | How long until my turn; that my Reaction is ready and what it will do | The panel opens on Reactions: "Reaction this round: ready" and a select per reaction ("Never (default)", "Only if it turns the hit into a miss", "Always", "Ask"). Nothing says how many turns until mine | **Partly.** Settings are shown where a summary is wanted |
| 7 | **"A reaction is asked of me."** | The question, what it costs, two big answers | `reactionprompt.js`: a modal, "Use a reaction?", the trigger, the option with its cost, "Use Shield (level 1)" and "Do not react", 44 px and more. Other players see "The table is waiting for a reaction to be answered…" | **Good.** Keep |
| 8 | **"I am down."** | That I am down, my death saves, what happens at my turn, what my friends can do | The Down tab: "Dying. Death saves 0✓ 0✗: rolled for you at the start of your turn. Three successes make you stable; three failures end you; any healing brings you back up." Pills Unconscious, Prone. End turn stays | **Good words**, but the saves are a line of text, not a count you can see from across the table |
| 9 | **"We won: what did I get?"** | XP gained, how far to the next level, what was found; if a level is ready, how to take it | The rewards card: "The fight is won.", foes, "+200 each", "Wren 200 / 300 to level 2", Found, Continue. When a level is ready: "Wren: Ready to level up: ask your DM" and no button; in solo, "Ready to level up" and no button. After Continue the panel says nothing | **Dead end.** Nothing to tap, and the DM's Level up is Menu, DM, the Characters group far down the tab, with the character selected |
| 10 | **"What can I do here?"** (exploring) | The few verbs of exploring, always in the same place; anything in reach; a friend in trouble | The Explore tab ranks rows. On a phone the panel shows **two** rows (Follow, Lead the party) and "▾ 4 more: scroll or tap for more room"; Search and Hide are under it. On a computer it shows four | **Hidden on a phone** |
| 11 | **The same, with one thumb** | The things a turn needs within the bottom third of the screen | Tabs and rows are at the bottom (good). Cast and Cancel for an aimed spell, the order strip and the status are at the top; the camera buttons take the right edge at mid height | **Mixed** |
| 12 | **The link drops** | That nothing I do is being sent | The link dot in the top bar turns into a crossed square (shape and word on tap); the panel stays live and taps are sent into nothing | **Hidden in a corner** |

## Where we are

### What exists, and where

"Verdict": **keep** (works, leave it), **reword**, **move**, **fix** (a fault),
**add to**.

| Thing | Where it lives | Verdict |
|---|---|---|
| Top bar: status box ("Exploring", "Round 1", the clock), Undo (DM), link dot, Menu | `index.html` `#top`, `#status`, `#mode`, `#clock`; `linkdot.js`; `drawer.js` | **Add to**: the status names whose turn it is ("Round 2 · Your turn") |
| Order strip | `#order`, drawn in `app.js` (`refresh`) | **Fix**: keep the current turn and the viewer's own next turn scrolled into view; mark "you" |
| Hint bar (what to tap, Cast, Cancel, a choice select) | `#hint`, `#hint-go`, `#hint-cancel`, `#hint-pick`; `app.js` (`refresh`, `aimHow`, `actionAim`) | **Move** to the bottom (the aim bar, Decision 4) |
| Area aiming | `app.js`: `R.onTap` sets `mode.aim`; `R.onHover` sets it again on every pointer move unless `mode.pinned`, **which nothing ever sets** (line 824) | **Fix** (Decision 4) |
| Movement range | `app.js` `hl.move` from `moveOptions`, drawn by `buildOverlay` (`render-three.js`, `render.js`) in `theme.hl.move` (Classic `[0.95, 0.8, 0.35, 0.34]`) | **Add to**: an edge, the Dash edge, the cost of a space (Decision 3) |
| Card head: name, level and class, the player's name, Sheet, End turn; HP bar, AC | `#card-head`, `#c-hp`; `app.js`, `actionpanel.js` | **Reword**: drop the player's own name from their own card; End turn says what is left |
| Resource pills: Action, Attacks left, Bonus Action, Move N ft, Reaction, slots, conditions, effects | `#c-res`, `statusHtml` in `actionpanel.js`; `style.css` `.spent` (strike, opacity .4) | **Replace** the first four with the turn bar (Decision 1); slots, conditions and effects stay as pills |
| Action panel, tabs at the bottom, rows, "N more: scroll or tap for more room" | `actionpanel.js` (`panelContext`, `visibleTabs`, `defaultTab`, `rankExplore`, `tabRows`), `actionpanel.css` | **Keep**; Explore gets four fixed verbs (Decision 6); a wait line on others' turns (Decision 2) |
| Spells tab: slot strip, Sort select, Filters | `actionpanel.js` (`spellRows`, `slotStrip`, `filterSpells`, `sortSpells`) | **Move** Sort and Filters into one "Sort and filter" button on a phone: today they take a row and leave room for one spell |
| Tap an enemy on your turn: attack with what reaches | `app.js` `R.onTap` (line 800) | **Keep**, and say so (a helper line in the Attacks tab) |
| Reactions tab: status and a select per reaction | `reactionsheet.js` (`reactionsHtml`), shown by `actionpanel.js` | **Reword**: a summary; the selects behind "Change" |
| Reaction question | `reactionprompt.js` (`#rp`, `#rp-wait`) | **Keep** |
| Down tab, death saves | `actionpanel.js` (`howItEnds`, the `down` tab) | **Add to**: the saves as six marks |
| Dice tray (thrown dice) | `dice.js` (`DICE.tray`), `app.js` (`act`, `toThrow`) | **Keep** ("Wren: Fire Bolt · 1d10 fire, spell attack · flick, tap or click the dice to throw", Throw, Cancel) |
| Drawer: Turns/Party, Sheet, Log, Handouts, DM, Settings, About; Leave table at the top of every tab | `drawer.js`, `index.html` `#drawer`, `#menu-session`, `#menu-leave` | **Move** Leave table into Settings, group Table (as `table-ui.md` Decision 2 already says); on a phone it is the first, widest button of every tab |
| Tracker | `tracker.js` | **Keep** |
| Log by fight, filters, "Show the last rewards", private note to the DM | `logview.js`, `#log`, `handouts.js` (`note-form`, action `note`) | **Keep**; the last-thing line opens it (Decision 5) |
| Rewards card | `conclusion.js` (`result`, `readyToLevel`, `xpToLevel`) | **Add to**: a Level up button (solo, DM) or Ask the DM (player); reword "200 / 300 to level 2" (Decision 8) |
| Level up | `buildsheet.js` (`openBuild({ mode: 'levelup' })`), opened only from `quickentry.js` (`#qb-levelup`, DM tab, Characters); engine `levelUp` is DM only (`engine/characters.js`) | **Add** a way in from the card and the panel (Decision 8) |
| Lead the party, Follow, Formation… | `actionpanel.js` (`rankExplore`), `formation.js` (the popup opens after Lead; "Formation…" is a row while leading) | **Add to**: the shape is shown under Lead while leading, with Change (Decision 6) |
| Feedback icon | `feedback.js`, fixed at the left edge (#359) | **Fix**: on a phone it sits over the rewards card's heading ("The fight is won." loses its "T"); cards keep clear of it |
| Pace "wait" | `timeline.js`, `app.js` `skipping()`: while beats play under the pace "wait", a tap on the map or a button skips the beat and does nothing else | **Keep**, and say so on the "…" button ("Playing: tap to skip") — it does already |
| Camera buttons | `#cam` (rotate, zoom) | **Keep**; keyboard movement (#357) adds keys, not buttons |
| Link dot | `linkdot.js` (shape and word per state) | **Add to**: a lost link greys the panel with a sentence (Decision 10) |

### What it takes today

Counted in the running game (build of 15 November, after #359), headless Chromium, 390 x
844 with touch and 1280 x 800, solo and as a player at a hosted table. "Taps" from the map
with the character selected; seconds were not timed with a person, so thumb travel is
given instead.

| Job | Phone taps | Computer clicks | What is in the way |
|---|---|---|---|
| Move one space | 1 | 1 | Nothing. The reach is hard to see |
| Attack the enemy beside you | 1 (tap it) | 1 | Nothing, but nothing says a tap on an enemy attacks |
| Cast Burning Hands (wizard with a cantrip) | Spells, "2 more", Burning Hands, a square, Cast: **5**, the last at the top of the screen | 4, and the aim moves on the way to Cast | Decision 4 |
| Cast a spell at one creature (Fire Bolt) | Spells, Fire Bolt, the target: 3 | 3 | Nothing |
| Hide with a level 1 rogue in a fight | Move, "3 more", Hide: **3** | 2 | Hide is the fourth row of Move |
| Hide while exploring | "4 more", Hide: **2**, and unseen until then | 1 | Decision 6 |
| Search | as Hide | 1 | Decision 6 |
| See what just happened | Menu, Log: 2 | 2 | Decision 5 |
| See how many turns until mine | glance, sometimes scroll the strip | glance | Decision 2 |
| Level up when XP allows, as a player at a table | not possible | not possible | Decision 8, E-P2 |
| Level up, solo | Menu, DM, scroll to Characters, Level up (character selected), the build screen: 5 and a scroll | 4 and a scroll | Decision 8 |
| Change the party's shape while leading | "more", Formation…: 2 | 1 | Decision 6 |
| Heal a dying friend while exploring (cleric) | Spells, Cure Wounds, the friend: 3, and nothing tells you they are dying | 3 | Decision 6 |
| Stabilise a dying friend with Medicine | not possible | not possible | E-P3 |

### The kinds of problem

**Cannot be found** (it exists; nothing leads there):
- Level up (only in the DM tab's Characters group; never from the rewards card).
- Hide and Search on a phone while exploring (under "4 more").
- Changing the party's shape after the first Lead (the Formation… row is under "more").
- Tap an enemy to attack (never said).
- The log's words for what just happened.

**Can be found, but is slow or out of reach:**
- Cast for an aimed area (top of the screen).
- Hide in a fight (fourth row of Move).
- Spells on a phone (Sort and Filters take the room of a spell).
- The order strip on a phone (the current turn can be off its edge).

**Missing** (and whether the engine supports it):
- A clear start of my turn: **client only** (the `turn` event is already sent).
- An edge on the reach, the Dash reach and the cost of a space: the edge and the cost
  are **client only** (`moveOptions` returns `cost` and `prev` per space); the Dash reach
  needs a helper option, **E-P1**.
- A line saying what just happened to me: **client only** (the log's `describe`).
- "Your turn in N": **client only** (`S.encounter.order`, `turn`).
- A friend down while exploring, with what can help: the rows are **client only**
  (healing spells and items exist: `cast`, `use`); **stabilising with Medicine is not in
  the engine** (the SRD's Help action, DEBT C6): **E-P3**. Death saves are not rolled
  outside a fight (DEBT W10), so a friend at 0 Hit Points while exploring stays dying
  until healed or the DM steps in; the row says so.
- A player levelling their own character: the engine's `levelUp` is DM only. Asking the
  DM is **client only** (the existing `note` action, `to: 'dm'`); levelling without the DM
  is **E-P2** and a table rule (question 3).
- Starting a fight in the party's formation: **engine**, **E-P4** (when a fight starts,
  `catchUp` sets followers down on the leader's trail, not on their formation places).

**Confusing or wrong:**
- The area aim follows the pointer after a click (a fault).
- A used resource is told by a strike and 40 % opacity only.
- The Reactions tab shows four-way selects when the question is "is my Reaction ready".
- "200 / 300 to level 2" reads as a fraction of something; "300 / 300 to level 2" next to
  "Ready to level up" reads as a contradiction.
- "Level 1 Wizard · Player": the player's own name on their own card.
- Leave table is the first and widest button of every drawer tab on a phone.
- The feedback icon sits over the rewards card's heading on a phone.

## The evidence

### A play tester's notes of 15 November

Notes from a play test, recorded in the lead's hand-over, read as observations of where
the screen failed a real player. Each is mapped to its cause. (The notes were made on a
site that may have been on an older build; each was checked against today's main.)

| Note | What the game does today | Cause | Kind | Answer here |
|---|---|---|---|---|
| "A visual for remaining movement" | Reachable spaces are filled at 34 % with no edge; "Speed left 30 ft" in the Move tab and "Move 30 ft" in a small pill | The visual exists but is too faint and colour-only; no feet on the map | Confusing; partly missing | Decision 1 (Move in the turn bar), Decision 3 (edge, Dash edge, cost) |
| Burning Hands hard to aim: "the area does not lock when a square is clicked" | A click sets the aim; any pointer move after it sets it again (`R.onHover`, `mode.pinned` never set) | A fault in `app.js` | Wrong | Decision 4: a tap or click locks; hover only previews before the first click |
| Arranging the party's grouping under Lead the party | The formation popup opens once, right after Lead; afterwards "Formation…" is a row below "more" on a phone | Discoverability | Cannot be found | Decision 6: "Leading · two abreast · Change" under Lead, always |
| Can a rogue find Hide? | Hide is in Explore (under "4 more" on a phone), in Move in a fight (fourth row), and in Bonus from level 2 (Cunning Action) | Discoverability | Cannot be found | Decision 6 (Hide is one of four fixed verbs), Decision 1 (Bonus in the turn bar opens the Bonus tab) |
| Levelling up in game "is currently not possible" | Solo: possible, but only from Menu, DM, Characters, Level up. A player at a table: not possible (`levelUp` is DM only); the card says "ask your DM" with nothing to tap | Discoverability (solo); missing (table) | Both | Decision 8: Level up now (solo, DM), Ask the DM (player), E-P2 if the owner wants players to level themselves |
| Stabilising a team mate while exploring | Healing spells and potions work outside a fight; the Help action with Medicine does not exist | Missing in the engine (DEBT C6); nothing on the screen points at a dying friend | Missing | Decision 6 (A friend is down), E-P3 |
| Starting a fight in formation | A fight's start sets followers down on the leader's trail (`catchUp`) | Missing in the engine | Missing | E-P4 (out of the client stages) |
| XP shares not redistributing when one is edited | By design a share the DM types is kept as typed and the others keep theirs (`rewards.js`, `xp.fixed`) | The DM's card does not say so | Confusing (DM screen) | Out of scope; a line for the DM's card is suggested under "The DM's side" |
| Searching for a specific monster | The DM's list of monsters to add is a button per monster, a few hundred, with no search (`app.js`, `#dm-spawn`) | Missing (DM screen) | Missing | Out of scope; noted under "The DM's side" |

Other notes of that day (a shortsword used from 20 feet; Burning Hands seeming to double
damage on a save; saves against Prone; Magic Missile darts; wolves' advantage; criticals;
loot and gold) are rules or rewards questions, not the player's screen; they are left to
their own jobs. One of them touches this design: **"Magic Missile darts have no roll
each"**. By the SRD the darts need no attack roll ("Each dart strikes a creature of your
choice"; "A dart deals 1d4 + 1 Force damage"); whether the game rolls each dart's damage
is a rules question for its own job. Either way the screen showed a player too little to
tell; the last-thing line (Decision 5) puts the result in words.

### The owner's notes in #181

| # | Note | Built by `table-ui.md` | Still true for a player |
|---|---|---|---|
| 1 | A party wipe ends in nothing | The defeat card | Fine |
| 2 | Menus from the right, configurable | The drawer | Leave table sits at the top of every tab (move it) |
| 3 | The tracker in the drawer | Turns tab | Fine; the order strip on a phone needs to keep the current turn in view |
| 4 | Combat conclusion: loot and XP | The rewards card | A ready level leads nowhere (Decision 8) |
| 5 | The log by fight | Done | Hidden behind two taps when you want only the last line (Decision 5) |
| 6 | A context action panel: Explore, Reactions greyed until available and prominent when one applies, Attacks, Spells, Bonus, slots, sort | Done | The panel is right; what a turn has left is the question it answers least well (Decision 1) |

## The layouts considered

Three layouts, judged on the moments above. In every one, these do not change:
the map is the screen; the action panel's tabs stay at the bottom; the drawer, tracker,
log, rewards and defeat cards and the reaction question stay as built. The layouts
differ in **how a turn's resources are shown, where aiming is confirmed, and how the
panel is organised**. Every one of them gets Decisions 3 to 10 below (reach edge, aim
lock, last-thing line, explore verbs, down, level up, phone fixes, offline): those are
not in question.

### Layout A: a turn bar over today's panel (recommended)

The pills for Action, Bonus Action, Move and Reaction become a bar of four large
segments, always in the same place, always showing all four, each ready or used in
words, Move with its feet and a meter. Each segment is a button: Action opens the tab
that holds the likeliest action (Attacks or Spells), Bonus opens Bonus, Move opens Move
and shows the reach, Reaction opens Reactions. The tabs below stay as they are, by kind.
End turn stays in the head and says what is left. An armed action replaces the rows and
tabs with the aim bar at the bottom.

```
 390 x 844, my turn                       390 x 844, aiming Burning Hands
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ Round 2 · Your turn   ● [☰]      │    │ Round 2 · Your turn   ● [☰]      │
│ [Wolf 1][Gob 2][▶You][Gob 3] …   │    │ [Wolf 1][Gob 2][▶You][Gob 3] …   │
│                                  │    │                                  │
│            the map               │    │     ▧▧▧ the cone, locked ▧▧▧     │
│     reach: filled, solid edge    │    │       Goblin 1 ◎  Wolf 1 ◎       │
│     Dash: dashed edge            │    │          Pip ⚠                    │
│                           [⟲][+] │    │                                  │
│ Goblin Warrior 1 hit you: 2 ›    │    │                                  │
├──────────────────────────────────┤    ├──────────────────────────────────┤
│ Wren · Wizard 1   [Sheet][End ▸] │    │ Burning Hands · 15 ft cone       │
│ ▓▓▓▓▓▓░░ 6/8 HP · AC 12          │    │ Catches Goblin Warrior 1,        │
│┌───────┬───────┬────────┬──────┐│    │ Goblin Warrior 2 and Wolf 1.     │
││Action │Bonus  │Move    │React.││    │ ⚠ Also catches Pip, your side.   │
││Ready  │Ready  │30 of 30│Ready ││    │ Tap another square to aim again. │
│└───────┴───────┴────────┴──────┘│    │ [ Cancel ]  [ Cast Burning Hands]│
│ Burning Hands  L1 · 15 ft cone   │    └──────────────────────────────────┘
│ Magic Missile  L1 · 120 ft       │
│[Spells][Bonus][Move][Feat][Items]│
└──────────────────────────────────┘
```

```
 1280 x 800, my turn, the drawer pinned on Turns
┌────────────────────────────────────────────────────────────┬──────────────┐
│ Round 2 · Your turn                              ● Undo [☰]│ Turns        │
│ [Wolf 1][Goblin Warrior 2][▶ Wren (you)][Goblin Warrior 3] │ Round 2      │
│                                                            │ ▶ Wren  6/8  │
│                       the map                              │   Gob 3 ▓▓░  │
│          reach filled with a solid edge, Dash dashed       │   Wolf 1 ▓░  │
│                                                     [⟲][⟳] │              │
│   Goblin Warrior 1 hit you with a Scimitar: 2 slashing.  › │              │
│   ┌──────────────── panel, at most 760 wide ───────────┐   │              │
│   │ Wren · Level 1 Wizard           [Sheet] [End turn] │   │              │
│   │ ▓▓▓▓▓▓░░ 6/8 HP · AC 12 · Level 1 slots ●●         │   │              │
│   │ [Action Ready][Bonus Ready][Move 30 of 30][React.] │   │              │
│   │ Fire Bolt  cantrip · 120 ft  | Burning Hands L1    │   │              │
│   │ [Attacks][Spells][Bonus][Move][Features][Items]    │   │              │
│   └────────────────────────────────────────────────────┘   │              │
└────────────────────────────────────────────────────────────┴──────────────┘
```

- **Moment 1:** answered: four segments, in words, never hidden. **2:** the Move segment
  and the map's edges. **3:** the aim bar at the thumb, locked. **4:** the last-thing
  line. **6:** the head's wait line (Decision 2). **11:** everything a turn needs is in
  the bottom 45 %.
- **Cost:** the panel grows by about 20 px on a phone (the bar is 48 px; the pill row it
  replaces was about 28). The map keeps about 440 px of 844.
- **Against:** two ways into the same rows (a segment and a tab). Accepted: the segment
  is the question ("what can I do with my bonus action?"), the tab the catalogue.

### Layout B: a panel by resource

The tabs themselves become the resources: **Action · Bonus · Move · Reaction · More**.
Each tab's label carries its state ("Action ✓ used"), Attacks and Spells and Features are
groups inside Action (and inside Bonus, for what costs one); Items, Features with no cost
and the rest are under More.

```
 390 x 844, my turn
┌──────────────────────────────────┐
│ Round 2 · Your turn   ● [☰]      │
│            the map               │
├──────────────────────────────────┤
│ Wren · Wizard 1  6/8 HP [End turn]│
│ ATTACKS  (none)                  │
│ SPELLS   Fire Bolt · Burning H.  │
│ FEATURES —                       │
│[Action ][Bonus ][Move  ][React.][More]│
│ Ready    Ready   30 ft   Ready       │
└──────────────────────────────────┘
```

- **Moment 1:** answered well: the tabs are the turn. **10 (exploring):** badly: outside
  a fight Action, Bonus and Reaction mean nothing, so the panel needs a second set of
  tabs, and the player learns two panels.
- **Against:** it re-sorts everything `table-ui.md` Decision 6 built and the owner asked
  for ("on your turn tabs for Attacks, Spells, Bonus actions"); a spell that costs an
  Action and has a Bonus Action version appears under two tabs; Items and Features are
  pushed under More, where the play test already found things lost. The smoke passes
  that open tabs by id (`#ap-tab-attacks`, `#ap-tab-spells`…) would all change.
  Rejected; its one good idea, that the resource is a button, is in A.

### Layout C: map first, a ring of actions around my pawn

The panel shrinks to a strip (name, HP, End turn). A tap on my pawn opens a ring of
large buttons around it (Attack, Spell, Dash, Hide, Disengage, More); a tap on an
enemy opens a small card ("Attack with Shortsword · +5 to hit · 1d6+3"; "Cast…").

```
 390 x 844, my turn, my pawn tapped
┌──────────────────────────────────┐
│ Round 2 · Your turn   ● [☰]      │
│          (Spell)                 │
│   (Attack)  ◉ Wren  (Dash)       │
│          (Hide) (More)           │
│            the map               │
├──────────────────────────────────┤
│ Wren 6/8 HP · Action ● Bonus ● 30 ft  [End turn] │
└──────────────────────────────────┘
```

- **Moment 2 and 3:** the most map, the best for aiming. **1, 6, 10:** worse: what is
  possible is not on the screen until you tap the pawn; a pawn at the screen's edge or
  behind a tree (the 3D view tilts and hides) has no room for a ring; the ring covers
  the spaces next to me, which are the ones I most want to see.
- **Against:** a screen reader and a keyboard get a ring with no order; nothing for a
  long spell list; the 3D camera turns, so the ring's buttons move. Rejected; its good
  idea, that a tap on an enemy says what it will do before it does it, is a question for
  the owner (question 5).

### How they compare

| Moment | **A: turn bar** | B: by resource | C: ring |
|---|---|---|---|
| 1 My turn, what is left | **Four segments, words** | Tabs are the turn | A strip, small |
| 2 Where can I go | **Move segment + map edges** | Move tab + map edges | Map edges |
| 3 What will this hit | **Aim bar at the thumb** | Aim bar | Best map room; confirm is a floating button |
| 4 What happened to me | Last-thing line | Last-thing line | Last-thing line |
| 6 Waiting | **Wait line in the head** | Same | A strip, no room |
| 10 Exploring | **Four fixed verbs** | Needs a second panel | Ring around the pawn |
| 11 One thumb | **Bottom 45 %** | Bottom 40 % | Ring may be anywhere |
| Keyboard, screen reader | **Same order as today** | Re-learned | Poor |
| Cost, smoke passes | **Small; ids kept** | Large; tab ids change | Large |

## The recommendation: Layout A

**A turn bar over today's panel, with aiming that locks and confirms at the bottom,
movement drawn with an edge, and one line that says what just happened.** Reasons:

1. **It answers the question asked every turn** ("what have I left?") in the same place,
   in words, without a tap, and the play test's first note is exactly that question.
2. **It keeps what was decided and built.** The tabs by kind, the drawer, the cards and
   the question are the owner's choices in #181 and work; A adds to them and moves three
   things (the hint, Leave table, the feedback icon's clearance).
3. **It fixes the fault the play test hit** (the area aim) and moves the confirmation of
   every aimed action to where the thumb is.
4. **Most of it is client only.** Of the play notes, five are answered without the engine;
   the two that need it are named amendments the owner can take or leave.
5. **It is the cheapest safe change:** every id a smoke pass uses keeps its meaning.

### Decision 1: the turn bar

- **Where:** in the panel, under the HP bar, replacing the first four pills of `#c-res`
  (slots, conditions and effects stay as pills on the line under it). New element
  `#turnbar`, four buttons `#tb-action`, `#tb-bonus`, `#tb-move`, `#tb-reaction`.
- **When:** in a fight, for the selected creature the viewer controls. On my turn all four;
  on another's turn the first three show "Not your turn" in muted text and only Reaction
  is live. Outside a fight there is no bar (the Explore verbs take its place).
- **Each segment:** a label and a state in words, never colour alone.

  | Segment | Ready | Used / none | Extra |
  |---|---|---|---|
  | Action | **Ready** | **Used** (struck label, a check mark, `aria-label` "Action used") | With Extra Attack after the first: **1 attack left** |
  | Bonus | **Ready** | **Used** | |
  | Move | **30 of 30 ft** and a meter | **0 ft left** | After Dash: **45 of 60 ft** |
  | Reaction | **Ready** | **Used** (this round) | Pending question: **Answer** (accent, pulses unless reduced motion) |

- **A tap** opens the tab that answers it: Action → the default tab of `defaultTab`
  (Attacks, or Spells for a creature with no attack); Bonus → Bonus; Move → Move, and
  sets the move mode so the reach is drawn; Reaction → Reactions. The segment of the open
  tab is outlined.
- **End turn** stays at the head's right. Under it, while something is unused, a small
  line: "Action not used" or "Action and Bonus not used". It never asks for a second tap
  (question 4).
- **Source:** `budget(e)` (already given to the panel), `e.reactionUsed`, `attacksLeft`.

### Decision 2: the start of my turn, and waiting

- **The start of my turn.** When a `turn` event names a creature the viewer controls,
  for 1.6 s a banner over the top of the map: **"Your turn, Wren"** and under it the
  turn bar's state in one line ("Action, Bonus Action, 30 ft and your Reaction"). It
  takes no tap and blocks nothing; a tap anywhere passes through. With reduced motion it
  appears and goes without sliding. A phone may also buzz once (`navigator.vibrate(60)`),
  a device preference off by default (question 6). The status box reads **"Round 2 ·
  Your turn"** for the whole turn.
- **Someone else's turn.** The status box reads **"Round 2 · Goblin Warrior 2's turn"**
  (or "Round 2 · Something moves unseen", as the log does). The panel head shows a wait
  line under the name: **"Your turn next."**, **"Your turn in 3."** (the number of
  turns in `S.encounter.order` between the current one and mine, an unseen slot counting
  as one), or **"Your turn is next round."** when mine has passed.
- **The order strip** keeps the current turn in view and, on a phone, also my own next
  turn if both fit; my chip says **"You"** under the name. Tapping a chip opens the drawer
  on Turns, as now.
- **The Reactions tab** becomes a summary: one line per reaction, **"Shield · asks you"**,
  **"Opportunity Attack · always"**, and a **Change** button that opens today's selects
  (`reactionsHtml`) in place. The status line on top stays: "Reaction this round:
  ready".

### Decision 3: where I can go

- **The reach** keeps its fill and gains an **edge**: a 2 px line round the outside of
  the reachable spaces, in the theme's ink colour at 80 %, drawn by `buildOverlay` from
  `hl.move` (the cells are the same; the edge is the boundary between a cell in the set
  and one not in it). The fill drops to 22 % so the ground shows through; the edge
  carries the shape. Both renderers draw it.
- **The Dash reach** (when the Action is unused): a **dashed** edge round the spaces
  Dash would add, no fill. It needs `moveOptions` to answer "and with one more Speed"
  (**E-P1**, a helper option, not a rule). Until E-P1, no Dash edge; the Move segment's
  line says "Dash: 60 ft" in words.
- **The cost of a space.** On a computer, hovering a reachable space shows the path
  (`prev` from `moveOptions`, a line of dots) and a label at the space: **"15 ft · 15
  left"**; outside the reach: **"Too far: 40 ft"**, or **"With Dash: 40 ft"**. On a
  touch screen, a press of 400 ms on a space shows the same label and path without
  moving; a plain tap moves, as today (question 2).
- **The legend**, in the Move tab: "Solid edge: where you can walk this turn. Dashed
  edge: with Dash."
- **Colour-blind safety:** the edge is a line, the Dash edge a dashed line; the fill is
  not needed to read either. The edge is drawn in ink, not hue.

### Decision 4: aiming that locks and confirms at the thumb

- **The fault.** `R.onHover` re-aims every pointer move unless `mode.pinned`, which
  nothing sets. **Fix:** the first tap or click on the map while an area is armed sets
  `mode.aim` and `mode.pinned = true`; hover then changes nothing. A tap or click on
  another space moves the lock there. Before the first click, hover draws a **preview**
  (the edge dashed, the fill at half) so a mouse user still sees where it will fall;
  after it, the area is **locked** (solid edge, hatched fill).
- **The aim bar.** While anything is armed (an attack, a spell, a feature, an action
  with an area, Follow), the hint bar moves from the top of the map into the panel's
  place at the bottom (`#hint` re-parented above the tabs; on a phone the rows and tabs
  are hidden, as `table-ui.md` already collapses them). Its lines:
  1. what is armed and its shape: **"Burning Hands · 15 ft cone"**;
  2. before a tap: **"Tap a square to aim."** (hexes: "a hex"); after: **"Catches Goblin
     Warrior 1, Goblin Warrior 2 and Wolf 1."**, or **"Catches nobody."**;
  3. a warning when the area holds a creature not hostile to the caster (`hostile()`
     false, `harmful` true): **"⚠ Also catches Pip, on your side."** in the theme's bad
     colour with the sign;
  4. after a tap: **"Tap another square to aim again."**;
  5. buttons: **Cancel** (left) and **Cast Burning Hands** (right, accent, the thumb's
     side; on a left-handed drawer side it swaps). Cast is disabled with "Aim first."
     until the area is locked.
- **On the map**, caught creatures get a ring and a target mark; a friend caught gets the
  same ring with a ⚠ sign over the pawn. Shape, not colour, carries "caught".
- **Targeted spells** keep their flow (tap a creature casts, or picks up to N); the aim
  bar says **"Magic Missile · tap up to 3 creatures (1 chosen)."** with **Cast now**
  when fewer than the most are chosen (today's Cast in the hint).
- **Keyboard:** while an area is armed, the arrow keys (or W A S D) move an aim cursor
  space by space and **Enter** locks, a second **Enter** casts; **Escape** cancels. Keys
  walk the character only when nothing is armed (#357's spec already says Escape cancels
  the armed action).

### Decision 5: what just happened to me

- **The last-thing line**, `#lastline`, sits just above the panel (on a computer, just
  above the panel's top edge, the same width). One line, the newest log entry that
  **names one of my creatures** (as subject or object), in the log's own words
  (`describe`), with the time it stays: until the next such entry. Examples: **"Goblin
  Warrior 1 hits Wren with a Scimitar: 5 slashing."**, **"Wren's Magic Missile: Goblin
  Warrior 2 takes 8 force."** (the examples show the kind of line; the words are whatever
  `describe` writes for the event; whether "you" replaces the viewer's own creature is
  question 7).
- A chevron at the end: a tap opens the drawer on Log, scrolled to that line.
- On another player's turn in a fight, when nothing has happened to me since my turn, it
  shows the newest line of the fight instead, in muted text.
- `role="log"`, `aria-live="polite"`, so a screen reader hears it once.
- Hidden while a card (rewards, defeat) or the reaction question is open, and when
  exploring with nothing new for a minute.

### Decision 6: exploring

- **Four fixed verbs**, always first, in this order, in one row of four on a phone (each
  at least 44 px tall, the label over a short sub-line) and the same row on a computer:
  **Search**, **Hide**, **Follow**, **Lead**. They never move, so a hand learns them. Each
  greys with its reason as today (`hideProblem`, the lead rules). Today's ranking
  (`rankExplore`) applies to the rows under them.
- **Under the verbs**, as rows, when they apply: **In reach** (doors, levers, piles:
  `usesFor`, `handRows`), **A friend is down** (below), **You are hurt** (today's rule 3),
  **Light**, **Rituals**, **Check…**, **Rest** (DM).
- **Lead, while leading**, has a second line: **"Leading · two abreast · Change"**; Change
  opens the formation popup (`formation.js`) at once. While someone else leads: **"Pip
  leads · Take the lead"**. Today's separate Formation… row goes.
- **A friend is down** (any party member at 0 Hit Points that the viewer can see, not
  dead): a row at the top of the list, in the bad colour with a sign: **"Brenna is dying
  (0 HP)"**, and under it the ways the selected creature has now: each healing spell and
  each healing item it can use on her (`spellWhy`, `potionTargets`), as rows that arm with
  Brenna already chosen, or, when it has none, the line **"Wren has no healing spell or
  item."** Then, until E-P3, a greyed row **"Stabilise with Medicine (DC 10)"**
  with the reason **"Not in the game yet: ask the DM."** Outside a fight the row adds:
  "Outside a fight Brenna stays dying until healed or the DM steps in." (Death saves are
  rolled only in a fight, DEBT W10.)
- **The rogue's Hide in a fight** also appears in Bonus from level 2 (Cunning Action), as
  today; the Bonus segment of the turn bar leads there.

### Decision 7: down, and dead

- **Down** (the Down tab, today's words kept; the turn bar is hidden, since an
  Unconscious creature has nothing to spend): the death saves become six marks, three
  for successes and three for failures, filled as they come (**✓ ✓ ○** / **✗ ○ ○**, with
  words for a screen reader: "Death saves: 2 successes, 1 failure"). Under them: today's
  line. Then **"Your friends can heal you."** On my turn, End turn stays (the turn must
  end) with the line **"You can't act while Unconscious."**
- **Stable:** **"You are stable."** "You stay at 0 Hit Points and Unconscious but no
  longer roll death saves. Healing brings you back up."
- **Dead:** the panel shows **"Wren has died."** and **"Your DM decides what happens
  next."**, with **Open the log**. The turn bar goes. The rest of the screen stays usable
  (watching is playing). Solo and a wipe go to the defeat card, as built.

### Decision 8: after a fight, and levelling up

- **The rewards card** keeps its layout. Rewordings: "200 / 300 to level 2" becomes
  **"200 of 300 XP for level 2"**; a level ready becomes **"Wren can reach level 2."**
  (not "Ready to level up: ask your DM").
- **A button where the level is ready:**
  - solo, or the DM: **Level up Wren** → opens the build screen in level-up mode
    (`openBuild({ mode: 'levelup', entity })`, the same as the DM tab's button).
  - a player at a table: **Ask the DM to level up Wren** → sends the existing private
    note action `{ type: 'note', to: 'dm', text: 'Wren has 300 XP and is ready for level 2.' }`,
    then the button becomes **"Asked. Your DM levels Wren up."** (no engine change).
    If the owner chooses E-P2, the button is **Level up Wren** for the player too.
- **After Continue**, the panel head carries a chip **"Level 2 ready"** until the level is
  taken; a tap does what the card's button did. The Sheet shows the same line at the top.
- **The DM** sees a player's request as a note (today's private notes), with a **Level up
  Wren** button in the note (the DM's side, Decision 11).

### Decision 9: the phone

- **Where things sit** (390 x 844, top to bottom): top bar 52 px (status, link dot,
  Menu); order strip 30 px (a fight only); the map; the last-thing line 32 px; the panel
  (head 40, HP 20, turn bar 48, pills 28, rows, tabs 48). The map keeps about 440 px in a
  fight, 500 exploring.
- **Thumb:** everything a turn needs (turn bar, rows, tabs, aim bar, End turn) is in the
  bottom 45 %. Menu stays top right (it is not a turn's thing).
- **Leave table** moves into the drawer's Settings tab, group Table, as `table-ui.md`
  Decision 2 says; it is no longer at the top of every tab.
- **The feedback icon** keeps its place at the left edge; a card (rewards, defeat) and
  the aim bar keep a 48 px left margin on a phone so it never covers their text, or the
  icon hides while a card is open (the builder picks the one the feedback smoke pass
  allows).
- **Spells:** Sort and Filters become one button, **Sort and filter**, that opens them in
  a small sheet; the slot strip stays.

### Decision 10: the link drops

When the link dot goes to "lost": a bar over the top of the map, **"Connection lost.
Trying again…"** and **"Nothing you do is sent until the table is back."**; the panel's
buttons grey with that sentence as their reason. When it comes back: a toast, **"Back at
the table."** Solo never shows it.

### Decision 11: the DM's side (only where a player's request needs it)

- A player's level-up note carries a **Level up Wren** button for the DM (opens the
  build screen as the DM tab's does).
- Out of scope, noted for a DM-screen job: the rewards card could say under the shares
  "Shares you type are kept; the others do not change." (the play note on XP); the list
  of monsters to add needs a search field (the play note on finding a monster).

## The words

Every label and helper line, as it appears. New ids are marked.

| Where | Words | id |
|---|---|---|
| Status, exploring | Exploring · Day 1, 08:00 | `#mode`, `#clock` |
| Status, my turn | Round 2 · Your turn | `#mode` |
| Status, another's turn | Round 2 · Goblin Warrior 2's turn | `#mode` |
| Status, unseen turn | Round 2 · Something moves unseen | `#mode` |
| Status, question pending for me | Round 2 · Your reaction? | `#mode` |
| Order strip, my chip | Wren / You | `#order` |
| Your-turn banner | **Your turn, Wren** / Action, Bonus Action, 30 ft and your Reaction. | `#turn-banner` (new) |
| Turn bar | **Action** Ready · Used · 1 attack left | `#tb-action` (new) |
| | **Bonus** Ready · Used | `#tb-bonus` (new) |
| | **Move** 30 of 30 ft · 0 ft left · Dash: 60 ft | `#tb-move` (new) |
| | **Reaction** Ready · Used · Answer | `#tb-reaction` (new) |
| | (another's turn, first three) Not your turn | |
| End turn helper | Action not used · Action and Bonus not used | `#btn-end` + new `small` |
| Wait line | Your turn next. · Your turn in 3. · Your turn is next round. | `#c-wait` (new) |
| Reactions summary | Shield · asks you · Opportunity Attack · always · **Change** | `#ap-reactions` |
| Move legend | Solid edge: where you can walk this turn. Dashed edge: with Dash. | `#ap-move` |
| Space label | 15 ft · 15 left · Too far: 40 ft · With Dash: 40 ft · Difficult: 10 ft | on the map |
| Attacks helper | Or tap an enemy within reach to attack with what reaches. | `#ap-attacks` |
| Aim bar, line 1 | Burning Hands · 15 ft cone | `#hint-text` (moved) |
| Aim bar, before | Tap a square to aim. (hexes: Tap a hex to aim.) | |
| Aim bar, after | Catches Goblin Warrior 1, Goblin Warrior 2 and Wolf 1. · Catches nobody. | |
| Aim bar, friend | ⚠ Also catches Pip, on your side. | |
| Aim bar, again | Tap another square to aim again. | |
| Aim bar, buttons | **Cancel** · **Cast Burning Hands** (disabled: Aim first.) | `#hint-cancel`, `#hint-go` |
| Aim bar, targets | Magic Missile · tap up to 3 creatures (1 chosen). · **Cast now** | |
| Last-thing line | (the log's words) › | `#lastline` (new) |
| Explore verbs | **Search** Perception +3 · 15 ft · **Hide** Stealth +7 · DC 15 · **Follow** Walk behind someone · **Lead** Everyone walks behind you | `#ap-explore` |
| Lead, leading | Leading · two abreast · **Change** | |
| Lead, another leads | Pip leads · **Take the lead** | |
| Friend down | ⚠ Brenna is dying (0 HP) | |
| | Heal her: (the spell or item rows) · Wren has no healing spell or item. | |
| | Stabilise with Medicine (DC 10) — Not in the game yet: ask the DM. | |
| | Outside a fight Brenna stays dying until healed or the DM steps in. | |
| Down | Death saves: ✓ ✓ ○ ✗ ○ ○ (spoken: Death saves: 2 successes, 1 failure) | `#ap-down` |
| | Your friends can heal you. · You can't act while Unconscious. | |
| Stable | **You are stable.** You stay at 0 Hit Points and Unconscious but no longer roll death saves. Healing brings you back up. | |
| Dead | **Wren has died.** Your DM decides what happens next. **Open the log** | |
| Rewards, progress | 200 of 300 XP for level 2 | `conclusion.js` |
| Rewards, ready | Wren can reach level 2. | |
| | **Level up Wren** (solo, DM) · **Ask the DM to level up Wren** (player) | `.cc-level` (new) |
| | Asked. Your DM levels Wren up. | |
| The note sent | Wren has 300 XP and is ready for level 2. | action `note` |
| Panel chip | Level 2 ready | `#c-level` (new) |
| Spells on a phone | **Sort and filter** | `#ap-sortfilter` (new) |
| Offline bar | **Connection lost. Trying again…** Nothing you do is sent until the table is back. | `#offline` (new) |
| Back | Back at the table. | toast |

## States

| State | Top | Map | Panel |
|---|---|---|---|
| **Exploring** | Exploring · the clock | The selected creature lit; no reach overlay (a tap walks) | Head, HP, pills (slots, conditions); the four verbs; rows; tabs Explore, Spells, Features, Items |
| **My turn** | Round N · Your turn; the banner for 1.6 s | Reach (fill and edge), Dash edge | Head with End turn and its helper; turn bar all live; default tab |
| **Aiming** | as my turn | Preview, then locked area; caught creatures ringed, friends with ⚠ | The aim bar replaces rows and tabs |
| **Someone else's turn** | Round N · X's turn | The camera goes to them, as now | Wait line; turn bar with three "Not your turn" and Reaction live; Reactions summary |
| **A reaction asked of me** | Round N · Your reaction? | Unchanged | The question (`#rp`) over everything, as built; Reaction segment reads Answer |
| **Downed** | as the turn | My pawn "Down!" as now | The Down tab: six marks, words; End turn on my turn |
| **Dead** | as the turn | As now | "Wren has died." Open the log |
| **After a fight** | Exploring | As now | The rewards card over the map; the panel under it |
| **Level-up ready** | Exploring | | Chip "Level 2 ready"; the card's and the chip's button |
| **Offline** | The bar | Unchanged | Buttons greyed with the sentence |

## Accessibility

- **Keyboard.** Order: the status, the order strip (one stop; arrows move inside), the map
  (the canvas, as now), the last-thing line, the panel head (Sheet, End turn), the turn bar
  (one stop, Left and Right between segments, Enter opens), the pills, the rows, the tabs
  (`1` to `9` as now). Keys from #357: W A S D and the arrows walk when nothing is armed;
  while an area is armed they move the aim cursor, Enter locks and casts, Escape cancels.
  `T` focuses the turn bar, `L` opens the log (both only when no field has focus; the
  builder checks they are free in #357's key map, which reserves `M` for the menu).
- **Screen reader order** is the same as the keyboard's. The turn bar is a `role="group"`
  with `aria-label="This turn"`; each segment's name is its words ("Action, ready";
  "Move, 30 of 30 feet"). The banner is `role="status"` (spoken once: "Your turn, Wren.
  Action, Bonus Action, 30 feet and your Reaction."). The aim bar is `role="region"`
  with `aria-live="polite"` on its "Catches…" line. The last-thing line is
  `role="log"`. The death saves are text for a reader, marks for the eye.
- **Touch targets.** Turn bar segments 48 px tall and at least 72 px wide on a phone;
  the four explore verbs 56 px; the aim bar's buttons 48 px; Change and Take the lead keep
  a 44 px box though text-styled. The long press on a space never replaces the tap.
- **Reduced motion.** No slide for the banner, no pulse on Answer, no animated path; the
  banner appears and goes. The map's camera moves as it does now (the Settings tab
  already has the pace).
- **Colour-blind safety for overlays.** Every overlay has a shape that says what it is
  without its hue: the reach a solid edge, the Dash reach a dashed edge, an area a hatched
  fill with a solid edge (dashed while only a preview), a caught creature a ring with a
  target mark, a friend caught a ⚠ sign, a refused space the existing flash plus the
  words. The hues stay the themes' (`hl.move`, `hl.area`); the mockup's switch shows them
  in grey to check. Against the valley's yellow-green grass the reach fill (Classic
  warm yellow) was the faintest thing on the screen; the ink-coloured edge does not
  depend on it.
- **Zoom and text size.** Sizes in `rem`; at 200 % zoom a computer gets the phone layout
  (the panel's switch is the width it already uses).

## Build plan

Each stage is one client pull request unless it says engine, useful alone, checked at
390 x 844 with touch and 1280 x 800, `npm test`, `npm run build` and the smoke passes
named. "Engine" stages are amendments to name in their own spec section; **none of the
client stages waits for them.**

| # | Stage | Engine? | Touches | Done when |
|---|---|---|---|---|
| P1 | ~~**Lock the aim**~~ (done, #456: the first tap or click sets `mode.pinned`, a later tap moves the lock, Cast, Cancel, Escape and a new mode clear it, the hint says "Aimed: tap another hex to move it, or Cast"; smoke `armed`; the preview styling stays as it was). **Left of P1:** the aim bar at the bottom, the friend warning, Cast on the thumb's side. **Lock the aim and move it to the thumb.** `mode.pinned` set on the first tap or click; preview before, locked after; the hint becomes the aim bar at the bottom with the words above, the friend warning, Cast on the thumb's side | No | `app.js` (`R.onTap`, `R.onHover`, `refresh`, the hint), `actionpanel.js` (collapse while armed), `style.css`, `actionpanel.css`, a client test for the words; smoke: `armed`, `actionpanel` | A cone aimed by a click at 1280 x 800 names the same creatures after the pointer has moved to Cast; on a phone Cast is in the bottom 45 %; a friend in the area shows the warning; Escape and Cancel disarm |
| P2 | **The turn bar** and End turn's helper; segments open their tab | No | `actionpanel.js` (`statusHtml` loses the first four pills; new `turnBar(S, e, budget)`), `index.html` (`#turnbar`), `actionpanel.css`, `app.js` (wiring), tests; smoke: `paneltabs`, `actionpanel` | All four segments show in a fight with words; a used Action reads "Used"; Extra Attack shows "1 attack left"; each segment opens its tab; screen reader names read as in Accessibility |
| P3 | **The start of my turn and waiting**: the banner, the status words, the wait line, the order strip kept in view with "You", the Reactions summary | No | `app.js` (`beat` on `turn`, `refresh`), `actionpanel.js`, `reactionsheet.js` (summary and Change), `style.css`; smoke: `reactions`, `multiplayer` | On a phone the current turn and my next are in the strip; "Your turn in 3." counts right with an unseen slot; the banner shows once per turn and not under reduced motion's slide |
| P4 | **The reach edge and the cost of a space** (no Dash edge yet) | No | `render-three.js`, `render.js` (`buildOverlay`: an edge for `hl.move`, a dashed variant, hatched areas), `themes.js` (fill alpha only), `app.js` (hover and long press labels from `moveOptions` `cost`, `prev`); smoke: `three-parity`, `square`, `controls` | Both renderers draw the edge on hexes and squares; the label reads "15 ft · 15 left"; a long press never moves; a tap still moves |
| P5 | **The last-thing line** | No | `app.js` (from `describe` and the log), `logview.js` (open at a line), `index.html`, `style.css`; smoke: `log` | It names the newest line about my creatures; a tap opens the log there; it is spoken once |
| P6 | **Exploring**: four verbs, Lead's second line, A friend is down (heal rows; the greyed Stabilise row) | No | `actionpanel.js` (`rankExplore`), `formation.js` (open from Change), `actionpanel.css`; smoke: `formation`, `actionpanel` | On a phone Search, Hide, Follow, Lead are visible without scrolling; a dying friend while exploring shows the row with the cleric's Cure Wounds armed on her |
| P7 | **Down and dead; rewards and level up**: six marks; dead line; the card's rewording and buttons; the chip; the player's note; the DM's button in the note | No | `actionpanel.js`, `conclusion.js`, `buildsheet.js` (opened from the card), `handouts.js` (a note with a level-up button for the DM), `app.js`; smoke: `rewards`, `defeat` | Solo: the card's Level up opens the build screen at the next level; a player at a table sends the note and sees "Asked."; the DM's note opens the build screen |
| P8 | **Phone and link fixes**: Leave table into Settings, the feedback icon's clearance, Sort and filter, the offline bar | No | `index.html`, `drawer.js`, `settings.js`, `feedback.css` or `conclusion.css`, `actionpanel.js`, `linkdot.js`/`app.js`; smoke: `drawer`, `feedback`, `link` | No tab of the drawer starts with Leave table; the rewards heading is whole at 390 x 844; offline greys the panel with the sentence |
| E-P1 | **Dash reach**: `moveOptions(s, e, { extra })` counts `extra` more feet of movement, for display only | Engine (helper, no rule change) | `engine/world.js`, a test | The Move segment's "Dash" edge matches what Dash then allows |
| E-P2 | **A player levels their own character** when its XP reaches the next level, outside a fight (`levelUp` allowed to the controller under a table setting, default per question 3) | Engine, table rule | `engine/characters.js`, `engine.js` (`SETTINGS`), tests | Refused for a player below the XP or in a fight; allowed otherwise when the setting is on; the DM can undo |
| E-P3 | **Help to stabilise**: the SRD's Help action on a creature at 0 Hit Points, a DC 10 Wisdom (Medicine) check, Stable on a success; in a fight it costs the Action | Engine (DEBT C6, part) | `engine/features.js` or a new handler, tests; then the row in P6 turns live | A success makes the creature Stable; a failure changes nothing but the Action; refused at range over 5 ft |
| E-P4 | **A fight starts in formation**: `catchUp` sets followers on their formation places when free, else as now | Engine (amends E21) | `engine/resolve.js`, `engine/world.js`, tests | A party walking two abreast is two abreast when initiative is called |

P1 first (it is the fault the play test hit); then P2 and P3; P4 to P8 in any order (P3,
P5 and P7 all touch `app.js`: one at a time). The engine stages wait for the owner's
answers.

## Risks

- **The panel grows** by about 20 px on a phone. The aim bar's collapse and the turn
  bar's replacing the pill row pay for it; P2 measures the map's height before and after.
- **A second way into the same rows** (segment and tab). Kept consistent by having the
  segment only open the tab.
- **The banner over the map** could hide a monster's move at the start of my turn. It is
  short, low (top 80 px only), and lets taps through.
- **Smoke passes depend on the hint's place** (`#hint-go`, `#hint-cancel` are clicked by
  `armed` and others). P1 re-parents the elements by id; the ids stay.
- **The last-thing line could leak** if it reads anything but the log's own redacted
  words. It reads only what `describe` gave the viewer's log.
- **Hover preview vs. lock** may surprise a mouse user who expected today's follow-the-
  pointer: the dashed preview before the first click keeps the old feel until the click.
- **A long press on a phone** competes with the map's drag and pinch (`pinch` smoke). P4
  starts the press timer only when the finger has not moved more than 8 px.

## Questions for the owner

Each has a default; the build follows the default unless the owner says otherwise.

1. **The turn bar: four segments always, or only the ones left?** *Default: always four,
   a used one reads "Used", so the place of each never moves.*
2. **Moving on a phone: one tap moves (as now), or tap to see the path and tap again to
   go?** *Default: one tap moves; a long press shows the path and cost without moving.*
3. **Levelling up at a table: may a player level their own character when the XP is
   there (E-P2), or does the DM always do it?** *Default: the player asks the DM with one
   tap (no engine change); E-P2 later as a table setting, off by default.*
4. **End turn with the Action unused: ask "End turn anyway?" first?** *Default: no second
   tap; End turn says "Action not used" under it.*
5. **Tap an enemy on my turn: attack at once (as now), or show "Attack with Shortsword ·
   +5 · 1d6+3" first and attack on a second tap?** *Default: attack at once, as now, and
   say so in the Attacks tab.*
6. **The start of my turn on a phone: a short buzz as well as the banner?** *Default: the
   banner only; the buzz is a device setting, off.*
7. **The last-thing line: the log's words ("hit Wren"), or "you" for my own creature?**
   *Default: the log's words, so the line and the log agree.*
8. **Stabilising with Medicine (E-P3) and starting a fight in formation (E-P4): build
   now?** *Default: after the client stages; until then the screen says "Not in the game
   yet: ask the DM."*
