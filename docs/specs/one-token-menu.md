# Spec: one token, one menu, a clean screen; dice that stay, say whose, and can be thrown

Status: draft by an agent, revised after the owner tried the mockup (round 2, 19 November
2026: "Owner's feedback, round 2" below). Issue #527. A design job:
this spec and a clickable picture, [`mockups/one-token-menu.html`](mockups/one-token-menu.html)
(open the file in a browser; nothing in it runs the game). No code is written by this
spec.

This spec **supersedes the direction of [`player-screen.md`](player-screen.md)** (#358)
where the two differ. It keeps from it: the turn bar (Decision 1, now at the top of the
character screen), aiming that locks and confirms at the thumb (Decision 4, P1 is built),
the reach edge (Decision 3), the wait words (Decision 2), the down and level-up words
(Decisions 7 and 8), the offline bar (Decision 10) and the rule that every greyed thing
says why. It drops: the always-open action panel at the foot of the screen, the order
strip across the top, the camera buttons on the right and the floating feedback icon.
`table-ui.md`'s drawer, tracker, log and settings are kept as screens; only the way in
changes.

## What the owner asked

The owner, in chat on 19 November 2026 (summarised in #527; his points, in order):

1. "The screen is almost perfectly clean." **One token** (a die, in a corner or bottom
   centre) opens everything. "Phones today can show several menus at once: chaos." **One
   overlay at a time.**
2. The menu **slides out like an overlay in a first-person shooter**. Its top option is
   **a symbol of the player's character**, opening a **cascaded, context-appropriate
   menu**: the current status at the top, laid out clearly; then **action groups** ("heal,
   attack, movement, ...", the designer to propose); **inventory** for the rest. "All of it
   should mimic a character sheet."
3. The higher level holds **administrative options** ("setup, ...", the designer to
   propose). **The combat tracker is a first-level screen**, beside the character sheet.
4. **One simple tap clears the menu** and gives back the whole screen.
5. **Slide in and out by default**; a setup option to **just have them appear**.
6. Dice: a setting for **how long a roll stays** on the screen (today "the words are seen,
   the dice not"); every roll says **whose it is** ("which initiative roll is mine");
   **prompt the player to roll initiative**; **throw the die with a finger** (spin and
   fling, as in a well-known phone game that catches creatures with a thrown ball). The
   result is still the engine's seeded roll; the throw is presentation and lands on it.

### Owner's feedback, round 2

The owner tried the published mockup and said (his words quoted):

| # | He said | What changed here |
|---|---|---|
| R1 | "The slide is too quick, slow it by half a second." | Every slide of the menu takes 0.5 s longer: the sheet rises in 0.72 s and falls in 0.66 s; a level or column moves in 0.68 to 0.70 s (Decision 6) |
| R2 | "When I click through Wren, every time I select a tab on that sheet, it resets the sheet to the top. It should stay where it is, i.e., when I click on story, now at the bottom, 'Wren' should stay as displayed" | A new rule: **nothing scrolls by itself**. Inside Character, groups and sections open in place under their row; the name and status block stay on screen; every level keeps its scroll (Decision 4a) |
| R3 | "The current dice animation feels a bit comic." Make them calmer and more real; "make them an upsell item and provide a few options to start with, some simple colors. I like translucent dice personally and in blue. I'd like them to be able to pick primary colors with primary color numbering for dice." | A calmer throw (no squash, no flickering numbers, two low hops, a small rock to rest) and **dice looks**: free starters (simple solids, primary colours with a chosen primary number colour, translucent blue as the default) and looks for sale later; the shop is a separate decision (Decisions 8a and 9) |
| R4 | "You should always be able to just roll dice, it's kind of fun." | **Roll dice**: always on the Dice screen and on a press and hold of the token; any dice, a count and a modifier; the engine rolls it from the seed (engine amendment E-M2, `freeRoll`), the table sees it as a plain roll that changes nothing (Decision 8b) |
| R5 | "There's a 1 and the die button also has a green wrap around it, is that health? What's the 1 for, I don't see a required action?" | The green wrap is the health ring; the 1 was the mockup's mistake (a badge with nothing behind it). Now the badge shows only when something waits, opening the menu shows exactly what at the top, and the ring explains itself (Decision 1) |
| R6 | "In this mockup for the phone, the character sheet comes up with Wren and then after it says 'level 1 wizard' and then Wren as a drop down, it doesn't appear to do anything ... it should probably be at a 'higher' level." | The choice of character moves to the first level: one row per creature the person controls; a player with one character sees one row and no switcher; nothing in a character's screen changes which character it is (Decision 4b) |
| R7 | "Just to the right of Pip and above left of the goblin warrior are brown rectangles, are those part of the design or what?" | They were the mockup's rocks, drawn as plain boxes. The mockup now draws boulders (a lumpy outline, light from above, a shadow), so the stand-in map does not look like buttons. Nothing in the game changes |
| R8 | "I'd like health bars on everyone when in combat or at least the option for the DM to display them." | A health bar over every creature in a fight: the party's exact, a foe's from what players are sent today (full, half for Bloodied, empty for Down), and a DM table rule "Players see foes' health: Hidden / Rough / Exact"; Exact is engine amendment E-M3 (Decision 7a) |
| R9 | (round 3) "I'm at 6 d20 and 1 d100 and I can't unselect dice, a shift key should allow deselection." | Your roll as chips with a − each and Clear all; Shift+click and press and hold on a die take one away (Decision 8b, "Taking dice away") |
| R10 | (round 3) "I went ahead and rolled all of those dice and I couldn't see them, they distributed in a row and overlapped. I'd prefer it if they bounced around the screen naturally and just landed where they stopped, maybe nudging to one side or another as they roll so as not to overlap ... the die's up face should parallel the tabletop plane." | Dice scatter: each has its own path, hops, rolls with friction, glances off the edges and the other dice, stops where it stops, and touching dice are nudged apart; a resting die lies flat in the board's plane; then the other faces' numerals fade (Decision 9, "Many dice") |
| R11 | (round 3) "On the phone version, the horizontal line is sufficient to close the menu, no x needed." | No × on the phone sheet: the grab handle (a real button, "Close menu", 44 px tall) closes it on a tap or a drag down; the map and Escape still close it; a wide screen keeps its × (Decision 3) |
| R12 | (round 3) "the labeling should be for what it is? Table is also too blunt." | Every screen's heading names what it is, never "Menu"; three naming sets for the two groups, with a pick (Decision 4c) |
| R13 | (round 3) "create some symbols like setup should be the standard gear symbol. DM tools should have a wrench. Characters could be meeples. Packs needs something ... A singular aesthetic that matches the game" | One set of line symbols drawn in the theme's colour: gear, wrench, meeples, a strapped tome for Packs, and the rest; shown together on one sheet in the mockup (Decision 4c) |
| R14 | (round 3) "if I click and hold, can they have that 6 dot thing to allow them to be dragged into a different order?" | Arrange: hold a symbol, or Setup › Arrange; rows with six-dot handles to drag, ▲ ▼ for keys, an eye to hide; per device; Reset order; four places cannot be hidden (Decision 4c) |
| R15 | (round 3) "if I just hold that for a second, can it immediately allow me to roll a die for idle fun. When I just quick click on it, can it present the menu as a set of icons ... if there's no selection for 3 seconds, popup text explanations? When in the menus, show those same icons across the top"; then "quick tap, I don't want a row, I want an arc around the die." | A quick tap fans the symbols out in an **arc round the die**; labels appear after 3 s; inside a screen the same symbols run across the top; holding the die for a second throws the last roll at once (Decisions 1 and 4c) |
| R16 | (round 4) "OK, I can't get out of the menu now that it's up." | A rule and a test: every state closes by a tap on the die, a tap on the map, or Escape. The die now sits above the sheet and the arc (it was under the dimmed map, so a tap on it reached the map instead, and on a phone the sheet covered it); the phone sheet keeps a footer for it; the Waiting card and the health note never take the closing tap (Decision 3, "Closing, always"). **Amended in round 6 (R25):** the die is not raised above the sheet; it stays where it is and the sheet leaves room for it |
| R17 | (round 4) "A number of these are setup items that are more specific, can they be held under the same menu item and just shown as sections ... dice ... on the same page as Look and just have a title bar that you click on" | The arc and the strip hold a few places: your character(s), Turns, Roll dice, Log and chat, Setup, and DM tools for the DM. Setup is one page of sections: Display and controls, Dice, The menu, Characters and packs, The table's rules, Help and about, Leave the table (Decision 4d) |
| R18 | (round 4) "When a section is too long to display with the other section headers, it scrolls while keeping the section headers above and below." | One section open at a time; its content scrolls between the bars before it, pinned at the top, and the bars after it, pinned at the bottom (Decision 4d) |
| R19 | (round 4) "the symbols across the top are too many and there's no indicator that there are more ... add > & < symbols if required? I'd prefer to get down to just a few though. Not sure what leave means ... If the latter, it should be under settings." | Six symbols fit a phone's strip; when more do not fit (a solo party, say), ‹ and › appear at the ends where there is more. Leave means leaving the table (the game, on this device); it is now the last section of Setup, with a confirm (Decisions 4c and 4d) |
| R20 | (round 5) "when i click on wren, the w on the menu, it does this weird skip thing where it moves past the display and comes back?"; then "actually that happens when I click on anything" | Two causes, both fixed. (1) Opening a place scrolled the clipped frame: the strip's `scrollIntoView` on the current symbol, called while the sheet was still sliding up (the symbol below the frame's edge), scrolled every ancestor that could scroll, the frame and the sheet included, so the whole picture jumped. (2) Choosing a place from the strip re-made the screen and slid it in again from off the edge (from the left on a wide screen, 462 px; from the right on a phone, 53 to 161 px) though it was already in place. Now the strip sets only its own `scrollLeft`, and switching places swaps the screen where it is. The rule "the menu never overshoots" (Decision 6) |
| R21 | (round 5) "the display needs to be consistent. On the setup tab, you only have one item open at a time. On Wren's page, it can open multiple things at once. I think we go with the setup version where you have headers that hold top/bottom. When all of them are shown, they should have the tip info. When we're in one, they can hide the tip info in favor of showing more working space." | One accordion for every page with sections: the character's page, Roll dice, Log and chat, Setup and DM tools. One section open; the bars before it pinned at the top and after it at the bottom; with none open each bar shows its tip, with one open the others show their title only. In-place folds are gone (Decisions 4a and 4d) |
| R22 | (round 6) "When I click and hold on the die menu, it should popup the dice I want to throw for fun, it's a fidget that only shows up on my screen. Unless changed, it should just be a d20." | Holding the die for a second pops up the **fidget die**, ready to throw (a flick or a tap, the usual throw); a single d20 unless changed in Setup › Dice › Fidget die. Only that screen ever sees it: nothing is sent, nothing is logged, the DM does not see it. Its numbers come from the device, never from the game's seed (Decision 1, "The fidget die") |
| R23 | (round 6) "The combat menu is not clear on what's going on, I think it's Wren's turn in this shot but when I click on wren, nothing happens?" | Turns: the current row is filled with "▶ Now", the next row says "Next", and the heading names who acts ("Round 2 · Wren's turn — yours"). Every row does something when tapped: your own opens your character (on your turn, on "Attack and cast"); anyone else is shown on the map (a phone clears the menu: "Showing Goblin Warrior 3"); the unseen row says why there is nothing to show (Decision 4, Turns) |

### Owner's feedback, round 6 (22 Nov)

The owner looked at the running game (build of main with M1 merged) on the evening of 22 November and said (his words quoted):

| # | He said | What answers it |
|---|---|---|
| R24 | "I'm confused by the menu space at the bottom. When we did mockups, that was gone. The functionality should be in the slide-out menu." | **M3** takes the top bar, the order strip, the party chips and the card's head (name, Hit Points, resources, Sheet) off the screen; the party chips become the top of the menu's first level and the card's head the top of the Character screen. What is left of the dock after M3 is only the action rows (`#ap-tabs`, `#ap-body`), and **M4** moves them into the menu, which removes the dock |
| R25 | "The menu button (the d20 in the health circle) should be stationary, not move with menus." | **The token stays in one fixed place at every size, whatever menu, sheet or panel is open** (Decisions 1 and 5; M3 builds it). This **replaces** round 4's "the die rides above the sheet" and M8's "the die above the sheet": the token no longer rises with the dock, slides along with open columns, or moves for any screen; the sheet, the columns and the dock **leave room for it** instead |
| R26 | "The undo/redo should be standard symbology, not text." | Undo and Redo are the standard curved arrows (inline SVG, the symbol set of Decision 4c, `currentColor`), with the accessible names "Undo" and "Redo" and the same keyboard shortcuts, wherever they show: the DM's chip beside the token and the first row of DM tools (**M3**) |
| R27 | "The slide-out menus should always keep their section headers reachable while scrolling" | **M10**: the one accordion with the bars pinned above and below the open section (Decision 4d), as the mockup worked out |
| R28 | A way to fly or swim: a column of translucent cubes to pick the height, then a translucent plane of squares at that height; open to other ideas | A **separate design job** (height picking for flying and swimming creatures); not in this spec's stages. It will have to fit the token's fixed place (R25) and the clean screen |
| R29 | "During combat only what is available should be shown" | **M4**: in a fight the character's page shows only the groups and rows that can be used now; what is greyed today is folded away, with one line saying why when the whole page is empty |

## Rules that bind this design

- **Everything goes through `apply()`.** Every button in the menu sends an action the
  engine already has. The menu re-homes controls; it adds no rule. The one engine
  amendment proposed (E-M1, the initiative throw) is named and optional; nothing in the
  client stages waits for it.
- **The engine never pretends, and nothing hidden is shown.** The menu is built from the
  same view the screen reads today (`playerView`); a foe's row says Bloodied, never a
  number; a check's DC is never shown. A thrown die lands on the face the engine sent
  (`dice.md` section 1); a throw never decides anything.
- **Greyed things say why**, in words on the screen, from the engine's own helpers
  (`blocked`, `spellWhy`, `hideProblem`, `reactionsWhy`), as today.
- **Phone first.** 390 x 844 with one thumb is the design size; 1280 x 800 the second.
  Every target at least 44 px (most 52 to 56); nothing depends on hover; nothing needs two
  fingers except the map's own pinch, which has a one-finger alternative.
- **Themes restyle only.** The token, the menu and the dice take colour, type and radius
  from the tokens in `themes.js`; the mockup carries the three themes.
- **Plain words.** "5E compatible"; no trademarked game name; no game's name for a
  gesture.

## The player, and what "clean" has to keep

The person: Isaac and his players, at a table or alone, mostly on a phone held in one hand
or a touch screen propped on the table; sometimes a laptop. They are not engineers. They
look at the map most of the time and at the menu for a few seconds at a time.

"Clean" cannot mean "blind". Some things a player must know **without a tap**. This
design keeps exactly these on the clean screen, and nothing else:

| Must be known at a glance | How the clean screen shows it |
|---|---|
| That it is my turn | The token wears a ring and pulses once; a banner "Your turn, Wren" for 1.6 s; the turn line says "Your turn" |
| Whose turn it is, and how long until mine (a fight only) | One line of text above the token: **"Goblin Warrior 2's turn · you in 3"** (the turn line). No strip of chips |
| That something is waiting for me (a reaction, a roll, a handout, a note) | A badge on the token with a number **only when something waits**, and the question itself if it must be answered (it opens on its own, as today); opening the menu lists what waits, in words |
| How hurt my character is | A thin arc round the token: the selected character's Hit Points, in the theme's good colour turning to bad below half; the number in the token's spoken name, and for 3 s beside the token whenever it changes (question 4) |
| That the link to the table is lost | The offline bar of `player-screen.md` Decision 10 across the top; the token greys with a crossed mark |
| A roll that just happened | The dice, left on the board for the time the player chose (Dice, below) |

Everything else is one tap away, behind the token.

## Where we are

Measured in the running game (build of main at `0be0412`, 19 November, headless
Chromium, the valley, solo). Screenshots: `/home/claude/shots/527/today-phone-explore.png`,
`today-phone-fight.png`, `today-phone-menu.png`, `today-phone-fight-log.png`,
`today-desktop-fight.png`.

At 390 x 844 in a fight, **nine separate things** sit over the map at once: the status box
(top left), Undo and the menu button (top right), the order strip (a row of chips that runs
off the right edge), the feedback icon (left edge), four camera buttons (right edge), the
row of party chips, and the action panel (name, Sheet, End turn, Hit Points, four resource
pills, two rows, five tabs and a "more" arrow). The map keeps about 470 px of 844. When the
menu opens it covers the top half and the action panel stays open under it: **two menus at
once**, which is the "chaos" the owner means. The log, in that menu, shows "Roll
initiative! Brenna 21, Odessa 20, Goblin Warrior 3 19, ..." as one line: which number is
mine is a reading job.

### M4 build notes (the character cascade)

**Built.** The dock is gone (`#dock`, `#ap-tabs` and the strip under it are out of `index.html`, the CSS and `app.js`). The token strip sets the map's `inset`
(`--dock-h` is now the strip the token owns at the bottom; the turn line, the dice tray, the join bar and the new-version banner sit above it). The Character
screen holds the status block (`#card`: name, Hit Points, AC, conditions, `#c-res`), the turn bar and one accordion of action groups (`#ap-body`, one `.ap-sec`
per group, one open at a time). `groupsFor(S, e, ctx, o)` and `groupRows(S, e, id, o)` in `actionpanel.js` sort the same rows the tabs showed (`tabRows`' pieces,
`spellRows`, `rankExplore`, `holdRows`, the companion and feature rows) into groups; `packages/client/test/groups.test.js` walks sample characters and checks
that every row a tab showed is in at least one group. The first level has one row per controlled character (Decision 4b): a row selects, recentres the map and
opens that character's screen. Aiming folds the menu (one overlay at a time).

**Settled.**
- Fight order: Attack, Cast, Heal, Move, Defend and hide, Use, Features, Companions, Reactions, Inventory. Out of a fight: Explore, Cast, Heal, Use, Rest, Features, Companions, Inventory.
  The order never changes within a state.
- The four pips of the turn bar are buttons: Action and Bonus Action open a cost screen (`#ap-cost`, everything that costs that), Move opens Move, Reaction opens Reactions.
- R29: in a fight only rows with no refusal reason (or armed, so a tap can put them down) are shown, a group with none is not shown, and an empty page says why in one line
  from the engine. Out of a fight the spec's rule stands: greyed rows stay with their reasons.
- Breaking free of a hold (Escape) and Let go are rows of Move (a held creature cannot walk); Grapple and Shove stay Unarmed Strike's options under Attack.
- What gives Hit Points back (Second Wind, Lay On Hands, healing spells and items) is one group, Heal, and is not repeated in Features, Cast or Use.
- A group the player opened stays open when the character is selected again; a turn opens on the likeliest group (a martial character on Attack, a caster with slots on Cast, #678/#696).
- Casting or arming a row folds the menu; to use another row the player opens the screen again (smoke: `panelTab`).
- Taps for the common turn: move 1, attack 1 (tap the enemy), End turn 1 (on the turn line, `#btn-end`). Picking a weapon or spell and then a target goes from about 2 taps to about 4.

**Where each old dock control went.**

| Old control | Now |
|---|---|
| Tab strip `#ap-tabs`, `#ap-all` | gone; the groups of `#ap-body` (rows below) |
| Explore tab `#ap-explore` | Explore group (`#ap-explore`), out of a fight; Follow, Search, Lead the party, Formation, objects in reach |
| Attacks tab `#ap-attacks` | Attack group; Grapple and Shove as Unarmed Strike options; spell attack rolls also listed here |
| Spells tab `#ap-spells`, Metamagic button | Cast group (`#ap-spells`, the Metamagic row first) |
| Bonus tab | the turn bar's Bonus Action pip, a cost screen (`#ap-cost`) |
| Move tab `#ap-move` (Dash, Disengage, fly up and down) | Move group; Escape and Let go join it |
| Dodge, Hide, Search, Shield | Defend and hide group (`#ap-defend`) |
| Features tab `#ap-features` | Features group, without the healing features |
| Second Wind, Lay On Hands, healing spells and items | Heal group (`#ap-heal`) |
| Items tab (uses, light, give, drop) | Use group for what can be used now; Inventory group (`#ap-items`) for the rest |
| Reactions tab, standing instructions | Reactions group, and the turn bar's Reaction pip; a waiting question is said on its bar while the question stays the modal `#rp` |
| Short rest, Long rest | Rest group (`#ap-rest`), out of a fight |
| Companion rows (Command, Dismiss, Recall, Mount) | Companions group (`#ap-companions`) |
| Down tab (death saves) | `#ap-down`, the page of a downed creature |
| Party chips `#party` (M3 first level) | one row per controlled character on the first level |
| `#card` head, `#c-res`, End turn `#btn-end` | the status block, the turn bar and the turn line |
| `#ap-how` | the status block (a tap on a condition shows its line) |
| `#todo-wait`, `#pace-wait` | `#pace-wait` in `#chips` beside the token; `#todo-wait` a status line above the token strip |

**Left (see DEBT T104).** No level-3 screens yet (formation, class-feature pickers and the short rest still open their popups over the menu, and `#ap-features` rows
open the existing pickers); no keyboard shortcuts 1 to 6; no pinned bars (M10) and no setting to open the character on my turn; Brutal Strike and Hide are hidden
rather than greyed in a fight; the sheet is still shown under the status block (M5).

### M5 build notes (sheet sections, Say, DM screens, Setup's groups)

**Built.**
- **Sheet.** `renderSheet` draws four sections at the foot of the Character screen: Abilities and skills (the facts, the six scores, saving throws, skills, defenses, attacks), Features and traits
  (class features, pocket dimension, reactions), Spells known, Story (species, background, class, who plays it, gear; for the DM, Refresh from sheet). Each is a bar (48 px) that opens and shuts
  its section in place; which are shut is kept on the device (`hextable.sheetShut`). The notices (a level to take, a form, a missing pack, an import) stay above the sections. The name and class
  are the status block's; the sheet keeps the name as a heading for a screen reader only.
- **Log and chat.** A Say box (`#say-form`, `handouts.js`) above the private note sends the engine's `say`: a player as a character of their own or "Out of character", the DM "As the DM" or as a
  party member. The clock heads the log (`#log-clock`).
- **DM tools.** The panel is a list of seven screens (Decision 4d's: Undo and the fight, Creatures, Map, sight and light, Table rules, Party and time, Scenes and handouts, Table file), each row
  with a line saying what it holds. A row opens its screen as the menu's third level (`table/dm/creatures`): the heading names it, the back arrow and Left return to the list with the focus on
  the row, and each screen keeps its own scroll. `drawer.js` reads the screens from the page (`.sec-index`, `.sec-screen[data-sec]`), so another panel can have them without new code. What waits
  for the DM (players to let in, unsettled rewards, the fallen party's card) stays above the list. The old Fight section is split: starting, ending, auto-play and pace are on Undo and the
  fight; the rules are on Table rules. Every id is kept.
- **Setup.** Seven sections in Decision 4d's order: Display and controls (theme, floors, walls, caves, shadows, edge of a fight, camera buttons, keys), Dice, The menu (the token's place, slide or
  appear, side, pin, which group a character's page opens on), Characters and packs, The table's rules, Help and about, Leave the table (Leave for anyone at a table, New game in a solo game).

**Settled.**
- **"Every DM section is reachable in three taps"** is counted from the menu's first level: Table, DM tools, the screen. With the token it is four. M8's few places (DM tools on the first level,
  question 24) makes it three with the token; the first level is not changed here because M8 owns it.
- **A last row, "All tools on one page"**, shows the seven screens one under the other. It is not in the spec. It is there for a DM on a wide screen who would rather scroll one page, and
  it is what `openMenu(page, 'dm')` taps in the smoke passes, so the thirty-odd passes that click a DM control by its id did not have to learn which screen it is on. A pass about one screen
  names it (`openMenu(page, 'dm/creatures')`).
- **The sheet's sections start open** and are independent of each other; M10 makes them part of the one accordion. Started shut, a dozen smoke passes that read the sheet would each need a tap first.
- **The dice and animation controls stay on the Dice screen** (`#dice-show`, `#pace-pick`, `#dice-auto-mine`): the `drawer` pass pins them there. Setup › Dice has a button that opens the Dice
  screen and, for the DM, "Throw the monsters' dice for me". They move when D1/D5 give the Dice screen its own content.
- **Characters and packs** in Setup is words and buttons that open the DM's screens (Creatures, Table file) or the player's character; the tools themselves are not moved.
- A line the table refuses (too long, too fast) is not put back in the Say box, as the scene's box does; the refusal shows as a toast.

### M6 build notes (the states of Decision 7)

**Built.**
- **The turn line** (`tracker.js`, `screenTurnLine`): "you in N" counts the turns that will be taken before the viewer's (`turnsAway`): a dead creature's place is none. "Waiting for a reaction…"
  while the table waits for someone else's answer (a player's view says only `prompt.waiting`). A player whose one character is down reads "You are down · Death saves ✓ ✓ ○ ✗ ○ ○" (or
  "· Stable"); End turn stays on their own turn. Dead adds nothing to the line.
- **The banner** (`#turn-banner`): "Your turn, Wren" for 1.6 s when a turn of the viewer's starts, once a turn; it takes no tap, and joining a table in the middle of a turn shows none.
  A player looking at the first level or a character's page is moved to the character whose turn it is; a closed menu stays closed (question 3's default), and Turns and every other
  screen are left alone (a player watching the order keeps it: the `drawer` pass has a phone on Turns while turns pass).
- **The token** (`drawer.js` `paintToken`, from `tokenState()` in `app.js`): a health arc for the selected character (the good colour; the bad one at half or less), the ring lit with a
  glow on a turn of the viewer's and one pulse when it starts, a flat bar across the die when the character is down, grey when it is dead or the link is lost (then crossed too). Its name
  stays "Menu" (the `drawer` pass pins it) and its description (`aria-describedby`, `#token-says`) says the rest, so it is read "Menu. Your turn. Wren, 6 of 8 Hit Points. 1 waiting for you." The health label ("Wren 3 / 8 HP") shows beside the token for 3 s after a change.
- **Waiting for you** (`#menu-waiting`, the top of the first level, only when the badge shows): a player's unopened handouts (Open) and a level their character can take (the DM gives it);
  the DM's players waiting to join (Let in) and unsettled rewards (Settle), and under them the to-do tray, moved here from DM tools (`#todo-mount`, `todo.js` unchanged). The badge is the
  count of those lines and cards.
- **Dead** (`#dead-line` in the status block): "Wren has died. Your DM decides what happens next." and Open the log.
- **Offline** (the link judged lost, `linkquality.js`): `#offline-bar` across the top with Decision 10's two sentences, the token greyed and crossed, the character's page says "Nothing
  you do is sent until the table is back." with its bars and rows greyed, and an action tried is answered with that sentence and not sent. "Back at the table." when it returns.

**Settled.**
- **An unseen creature's turn is counted only while it is being taken.** A player's order holds the slot `{ someone: true }` only then (`view.js`), so "you in 3" cannot count an unseen turn
  still to come without giving the creature away. The count is right for what the player is sent, and one short when a hidden creature acts in between; the line then reads "Something
  moves unseen". The test pins both (it plays the order out and compares).
- **"You are down" is for a player with one character.** The DM, and a solo player with the whole party, keep the round and whose turn it is; their downed character shows on the token
  (the flat bar) and on its row.
- **The connection dot stays beside the token while the link is good** (T104 item 4 stands): the `link` pass pins a good dot there. The offline bar and the token carry the lost state.
- **The DM's badge has no level-ups in it** (Decision 7's DM row lists waiting players, rewards and the tray); a player's has their own character's.
- With the tray open, a wide screen's first column is 340 px instead of 240 so a card's tools fit.

### #717 build notes (a fight action in two taps again)

**The problem.** After M4 a weapon or spell at a target is: the token, the character's row, the row (its group is open on a turn), the target: about four taps, where the old dock took two.
Only a plain attack with the default weapon is one (tap the enemy).

**Ways considered.**

| Way | Taps | Why not, or why |
|---|---|---|
| The token opens straight on the character's page on my turn | 3 | Saves one tap but breaks "a closed menu opens on its first level", and the menu still covers the map between the choice and the target |
| The menu stays open after a row arms, the target tapped beside it | 3 | Works only on a wide screen; on a phone the sheet covers the map (and "one overlay at a time") |
| A radial of rows round the token | 2 | A second menu, and M8's arc already takes the quick tap on the die |
| **Quick actions on the turn line** | **2** | Picked: the turn line is already on the clean screen on my turn, beside End turn; nothing new floats over the map |

**The approach (built).** On a turn of the viewer's, when the creature whose turn it is is the selected one, the turn line carries up to three **quick actions** on a row of its own above
"Round 2 · Your turn · End turn": the row used last by this creature in this fight (if it can be used again), then the first usable row of Attack, then of Cast, then the next of each, no row
twice. They are the same rows the Character screen offers (`groupsFor`, so only what can be used now, R29), with the same names; a tap does exactly what the row does (`run`): an attack or an
aimed spell arms and the map takes the target, a spell with nothing to aim shows its slot and Cast on the aim bar. The armed one is marked, and a second tap puts it down. So: **the quick
action, the target: two taps**, and a third only where the row itself asks something first (a weapon with options, a slot).

**What it keeps.** The clean screen: nothing is added outside a turn of the viewer's, nothing while exploring, nothing on anyone else's turn; the token does not move; the menu is not
opened, so nothing covers the map. Each quick action is 44 px high and at most a third of the line wide (a long name is cut with an ellipsis; its full name is its accessible name). Setup ›
The menu › "Quick actions on the turn line on my turn" turns them off (on by default; kept on the device as `hextable.quickRows`).

**What it does not do.** It offers no healing, movement or feature rows (the turn bar's segments and the groups hold those; three is what fits a phone), and it follows the selected
creature: a DM who has selected another creature than the one whose turn it is sees none. The menu's own path is still four taps; question 29 (open the character's page on my turn) is
M10's.

### M8 build notes (the arc, the strip, the symbols, the names)

**Built.**
- **The symbols** (`client/symbols.js`): the whole set of Decision 4c as inline SVG strings on the 24-unit grid, drawn in `currentColor` with no fill (a dot is a short stroke with a round end,
  so it takes the stroke's colour too), each with a spoken name (`SYMBOL_NAMES`). `PLACE_SYMBOLS` and `placeSymbol` say which a place wears; Turns wears the campfire while nobody fights.
  A character wears its own sigil (a letter on its colour inside its health ring).
- **The arc** (`client/menuarc.js` for the sums, `drawer.js` for the page): a tap on the die fans the places out round it, 52 px round buttons on the rings of Decision 4c's table (a phone
  at bottom centre 7 + 8, a corner 4 + 6, a wide screen 8 + 11 or 4 + 6); with more places than slots the last slot is More, a list of every place with its name and a line about it. The
  symbols grow out of the die in 0.5 s with a 25 ms stagger; none under Just appear or reduced motion. The words are in each button from the start; on the screen they come up after 3 s
  (the same timer as the scroll card's) and stay until the arc folds. The die, the dimmed map and Escape fold it; M folds it too. Arrow keys move round it in order, Home and End go to its
  ends, Enter opens, and the focus starts on the first symbol. Waiting for you (with the DM's to-do tray) and, once on a device, the note about the health ring sit above the arc.
- **The strip** (`#menu-strip`): the same places in the same order across the top of every screen, 48 px buttons with 44 px symbols; the current one has a rim and an underline and
  `aria-current="page"`. It scrolls sideways by itself (never `scrollIntoView`, R20) and shows ‹ or › (32 x 48 px) only at an end with more that way; a tap moves it by about three symbols.
  The strip's buttons are the old first level's rows with their ids (`#tab-turns`, `#tab-settings`, `#party .pr`), so nothing that held one had to change.
- **The places** are round 4's few: one for each character this person plays (in the party's order, or the turn order in a fight; a symbol keeps its place when another character is
  selected), Turns (Party while nobody fights), Dice, Log and chat, Setup, and DM tools for the DM. The list "Table" is gone: Setup and DM tools are places, Help and feedback, About and
  leaving are in Setup (Help and about; Leave the table), where M5 had already put them.
- **Names.** A screen's heading is its own name (a character's page is the character's name; Turns is Party while nobody fights; no screen is headed "Menu"). A screen inside a screen
  has a way back that names where it goes ("‹ DM tools" over "Creatures"); the breadcrumb is gone, since there is no first-level list to go back to.
- **Closing.** A phone's sheet has no ×: the handle closes it (a tap or a drag down), as do the die, the map and Escape. A wide screen's column keeps its × beside Pin.
- **Setup › The menu › Labels under the symbols**: After 3 seconds / Always (`hextable.menuLabels`). Under Always the strip shows the words too.
- **Motion** (R20): only the sheet (or the column) and the arc move. Changing place from the strip swaps the screen where it is.

**Settled, and where this differs from the text above.**
- **Dice is a place; Roll dice is not yet.** Round 4's places name Roll dice, which needs `freeRoll` (E-M2, D5: not in this job). The Dice screen (the last rolls, the dice and animation
  controls) keeps its place and wears the d20; the two-dice symbol is drawn and waits for D5.
- **Handouts is still a place for a player when there are any** (with its badge). Round 4 makes it a section of Log and chat; that is M10's accordion.
- **About is a place only before a table** (the lobby's About link opens it, with Setup beside it on the strip). At a table it is a button of Setup › Help and about.
- **The slots.** The build plan's "14 slots at bottom centre, 15 at bottom left" is older than Decision 4c's table; the table is what is built and tested: 15 at bottom centre (14 places
  and More when there are more), 10 in a corner. A second ring's symbols take its middle slots first, so they clear the first ring's.
- **A phone narrower than 390 px** pulls a centred fan's rings in so no symbol leaves the screen (not in the spec; 320 px is tested).
- **A phone on its side** has the die in the bottom left corner (M3), so its arc is the corner's quarter circles.
- **Group names** (question 19) show nowhere yet: the arc has no words for them, and Arrange (M9) and Help are where they would be. Set A is the default when they are.
- **The banner's move to the character whose turn it is** (M6) now applies to a player looking at a character's page; the arc is left alone.
- **Leaving says what it does before the first tap**: the note that came up on the first tap of the Table list's "Leave table" row is the standing line of Setup › Leave the table.

### M10 build notes (one accordion, and the ways the menu closes)

**Built.**
- **One accordion** (`client/accordion.js`; `drawer.js` for Setup, Log and chat and DM tools; `actionpanel.js` for a character's page). A page with sections is marked `data-acc` in
  `index.html`; the bars are made from the page as written (a section's heading, or a row of DM tools' list), every id kept. One section is open at a time. With none open the bars are
  a list, each with a line about it (52 px). With one open the page is **pinned**: it fills the screen, the bars before the open section stay at the top and those after it at the
  bottom (44 px, the title only), and only the open section scrolls (never under 120 px: on a screen too short for that the page scrolls instead of squeezing it). A section is part
  of the place's path (`settings/menu`, `dm/rules`, `log/talk`), a page remembers which was open while the table is open, and each section keeps its own scroll. The page keeps its
  own name as the heading. Up and Down move between the bars, Right or Enter opens one, Left or Backspace shuts it with the focus on its bar; each bar is a button with
  `aria-expanded` and `aria-controls`, and the open content is a region labelled by it.
- **Setup**: the seven sections of Decision 4d. **DM tools**: the seven screens of M5 are the seven sections; the last row, "All tools on one page", is still there under the bars
  while none is open (M5 settled it; it is the one screen under a page, with a way back). **Log and chat**: Handouts (a player's, when there are any), Log, Talk (the Say box and the
  private note); it opens on Log. **Handouts is no place any more** (round 4, question 27): its badge is on the Log symbol, `open('handouts')` opens that section, and the Waiting
  card still opens a new handout itself.
- **A character's page**: the status block, then one accordion of the action groups and, last, **Sheet** (`#sheet-body` is moved into it; its four parts have small headings and no
  longer fold by themselves, R21). With a section open the status block is **compact** (the name, Hit Points and Armor Class on one line, then the turn bar on one line that scrolls
  sideways), and the other bars stay on the screen above and below the open one. A creature with nothing to do here (someone else's, a foe looked at) opens on its sheet.
- **Closing** (`scripts/smoke/menuclose.mjs`, in the smoke matrix): sixteen states (the arc, More, every screen, pages with a section open, with none, all on one page) at 390 x 844
  with touch and at 1280 x 800, each closed by a real tap on the die, a tap on the dimmed map, Escape and M; a phone's sheet also by a tap on the handle and a drag down (a short
  drag springs back), a column by the × beside Pin; a closing tap changes nothing on the map; with the slide on the die never moves; the arc fans out, folds, and no symbol
  moves away from where it ends up (R20).

**Settled, and where this differs from the text above.**
- **The character's page keeps M4's groups as its bars; they are not merged into six sections.** M4 settled ten groups in a fixed order and two smoke passes pin them. Ten bars and
  the sheet do not fit a phone one under the other, so while a section is open **the closed bars are titles side by side, up to three in a row** (`gridPlan`: as few rows as hold
  them, as even as they go; each at least 44 px high). On a 390 x 844 phone the open section then keeps about 290 px exploring and never less than 120 px in a fight with every
  group shown. Decision 4d's six (Attack and cast, Move and defend, ...) would be a change to `groupsFor` and to those passes; the owner may still want it (question 28).
- **Which section a page opens on.** Log and chat on Log; Setup and DM tools on none the first time, then on the one that was open (kept in memory, not on the device). A
  character's page as M4 had it: the likely group on a turn, the group opened last otherwise.
- **"The tapped bar stays where it was under the finger" holds only as far as pinning allows**: a bar that opens moves up under the bars before it, which is where the spec's own
  layout puts it. The focus stays on it.
- **Leaving** keeps M5's confirm (a second tap on the same button, with the words of what it does standing above it), not the two buttons Stay / Leave the table.
- **`openMenu(page, 'sheet')` in the smoke passes means the page with its Sheet section open**; `panelTab` opens a group, `openChar` touches no section. A pass that uses a control
  of Setup names its section (`settings/menu`).

**Left.** The Dice screen has one section until D5 gives it Roll dice and Last rolls, so it is not an accordion and has no row to Setup › Dice; no shortcut 1 to 9 for a
character's sections; the open pane of a character's page does not keep its scroll when the menu is closed and opened again (Setup's, Log's and DM tools' sections do).

### M9 build notes (Arrange)

**Built.**
- **Arrange the symbols** (`client/menuorder.js` for the sums, `drawer.js` for the screen): a screen under Setup (the heading is its own name, the way back says "‹ Setup" and
  returns to The menu with the focus on the way in). Ways in: Setup › The menu › Arrange the symbols, and **holding a symbol of the arc for half a second** (the symbol lifts
  when the hold is made, and Arrange opens when it is let go; a quick tap still opens the place).
- **A row for each place**: a six-dot handle (44 px) to drag it up or down within its group, ▲ and ▼ (disabled at an end of the group), and an eye that hides it from the arc and
  the strip. A hidden place keeps its row, dimmed, with the eye crossed: that is where it comes back. What a step or a drag did is said once for a screen reader, and the
  focus stays on the control used. **Reset order** puts the order back and shows everything.
- **The two groups** carry question 19's names, set A: **Play** (your characters, Turns, Dice, Log and chat) and **This game** (Setup, DM tools).
- **Kept on the device**: `hextable.menuOrder` (the places in order) and `hextable.menuHidden`. A stored order is made whole when read (unknown names dropped, a place it does
  not know put where the default has it, the groups kept apart), so an old or broken one cannot lose a place.
- The order is applied to the arc, the strip (by CSS `order`: the buttons are not moved, so their ids and the keys along the strip follow it) and More.

**Settled, and where this differs from the text above.**
- **Two kinds of place cannot be hidden, not four**: your character(s) and Setup (round 4). The build plan's "Setup, Help, Leave and the character" is older: Help and
  leaving are sections of Setup now. Their rows have no eye and say why.
- **The characters are one row.** They move as one and keep the order they have among themselves (the party's order, or the turn order in a fight, as M8 settled).
- **DM tools, hidden, leaves the arc and stays on the strip** (question 23's default).
- **A hidden place can still be opened** by what leads to it (the turn line opens Turns, the Waiting card opens a handout); it only has no symbol.
- **The arc does not show the groups by ring** (Play inside, This game outside): its rings are filled in order, as M8 built them. The group names show in Arrange only.
- The hold opens Arrange **on release**, not at half a second with the finger still down: opening under a finger that is still pressing would give the lift's tap to
  whatever came up under it.

**Left.** No drag between rows by the keyboard beyond ▲ ▼ (they are the keyboard's way); a drag has no animation of the rows making room; Help does not explain the symbols yet.

### Every control today, and where it goes

"Today" is `packages/client/index.html` and the modules that fill it. "Goes to" uses the
names of the new menu (the tree is below). Every id is kept when its element moves, so
`$('log')`, `renderSheet` and the smoke passes keep their handles (the build stages say
which smoke passes change).

| Today | Where | Goes to |
|---|---|---|
| Status box: `#mode` (Exploring / Round N), `#clock` | `#top` | **The turn line** above the token in a fight; the clock in the header of **Turns** (Party) and of **Log and chat**. Out of a fight nothing is shown on the map |
| Undo (DM) `#btn-undo` | `#top` | **The DM's undo chip**: a small **undo arrow** (the standard curved arrow, with a redo arrow beside it; round 6, R26: symbols, not words; the accessible names stay "Undo" and "Redo") beside the token for 8 s after each action the DM sends, and always as the first row of **DM tools**; Ctrl+Z as now. (`table-ui.md`: undoing must be one tap; the chip is one tap) |
| Menu button `#btn-menu`, `#menu-badge` | `#top` | **The token** (it keeps the id `#btn-menu`, so the drawer's handles and `aria-controls` still hold); the badge goes on the token |
| Order strip `#order` | under `#top` | **The turn line** (whose turn, mine in N) and the **Turns** screen. A tap on the turn line opens Turns |
| Hint and aim bar `#hint`, `#hint-text`, `#hint-pick`, `#hint-go`, `#hint-cancel` | over the map | **The aim bar**, at the bottom, where the token is (`player-screen.md` Decision 4). While something is armed the aim bar *is* the one overlay; the token hides behind it and Cancel brings it back |
| Camera buttons `#cam` (⟲ ⟳ + −) | right edge | **Hidden by default.** The map already turns and zooms by touch (drag, pinch) and by keys and wheel. Setup › Controls › "Camera buttons on the map" (off) brings them back for whoever wants them; the one-finger way to turn the map without the buttons is Setup's buttons too (question 8) |
| `#pace-wait` ("…", skip a beat) | dock | A small **Skip** pill beside the token while a beat plays under the pace "wait" |
| Party chips `#party` | dock | **One row per character on the first level** (Decision 4b): each creature this person controls (their characters, companions they play, stand-ins the DM plays; solo: the whole party) is its own row at the top of the menu. A player with one character sees one row and no switcher anywhere. Also: a tap on one of your own pawns on the map selects it, as now |
| Card head, Hit Points, AC, `#c-res` pills, End turn, Sheet | dock (`#card`) | **Character › status block** (top of the character screen): name, level and class, Hit Points, AC, Speed, conditions, Concentration, slots, the turn bar in a fight; **End turn** is the status block's right-hand button on my turn, and also on the turn line ("End turn" appears there on my turn so a turn can end without opening the menu) |
| Action panel tabs `#ap-tabs`: Explore, Attacks, Spells, Bonus, Move, Features, Items, Reactions, Down; `#ap-all` | dock | **Character › action groups** (below). The rows are the same rows (`tabRows`, `spellRows`, `rankExplore`), sorted into groups by what the player wants instead of by tab. Items › **Inventory**. Down › the status block (see States) |
| `#ap-how` (how a condition ends) | dock | Character › status block: a tap on a condition shows its line in place |
| Formation popup (`formation.js`) | popup | Character › Explore › Lead › **Formation** (a level-3 screen, not a popup) |
| Class-feature pickers (`classes.js`: Wild Shape forms, Lay On Hands, Font of Magic, Metamagic, Divine Spark) | popups | Level-3 screens under the row that opens them (no popup over the menu) |
| Companion pickers and rows (`companions.js`) | rows and popups | Character › **Companions** group (shown when the character has one) |
| Grapple, Shove, Escape, Let go (`grapple.js`) | Attacks rows | Character › **Attack** (Grapple and Shove are Unarmed Strike's options) and **Move** (Escape) |
| Short rest picker | popup | Character › **Rest** › Short rest (a level-3 screen) |
| Drawer `#drawer` and its tabs | right side | **The menu.** Its tab strip becomes the first level (below). `#drawer-pin` stays (desktop: keep the menu open beside the map) |
| Turns / Party `#tab-turns`, `#tracker` | drawer | **Turns** (first level), unchanged inside |
| Sheet `#tab-sheet`, `#sheet` | drawer | **Character › Sheet** sections (Abilities and skills, Features and traits, Spells known, Story) at the foot of the character screen |
| Log `#tab-log`, `#log`, `#log-rewards`, `#note-form` | drawer | **Log and chat** (first level): the log by fight as built, a **Say** box (the engine's `say` action, which works with or without a scene) and the private note (`note`) |
| Handouts `#btn-handouts`, `#ho-badge`, `#handouts` | drawer | **Handouts** (first level, shown when there are any, badge kept) |
| DM `#tab-dm`, `#dm` and all its sections | drawer | **Table › DM tools** (DM only), its sections as level-3 screens (below) |
| Settings `#tab-settings`, `#settings` | drawer | **Table › Setup** |
| About `#tab-about`, `#about` | drawer | **Table › About** |
| `#menu-session`: New game, Leave table, `#menu-note` | drawer top | **Table › Leave the table** (players) and **Table › New game** (solo); never at the top of a screen (`player-screen.md` Decision 9) |
| Feedback icon (`feedback.js`) | left edge | **Table › Help and feedback** (the same panel opens there) |
| Pack manager (`packmanager.js`, `#dm-packs`) | DM tab | **Table › Packs** (DM; players see what packs the table uses, read-only) |
| My characters, quick entry, build sheet, level up (`mycharacters.js`, `quickentry.js`, `buildsheet.js`, `#dm-chars`) | lobby, DM tab | **Table › Characters**: who plays whom, add (build, type in, import), level up, refresh. A player sees their own and "Ask the DM" |
| Link dot (`linkdot.js`) | top bar | Hidden while the link is good; **Table › Setup › Connection** shows it with its words; a lost link shows the offline bar and greys the token |
| Reaction question `#rp`, `#rp-wait` | modal | Kept as built. It is a **prompt** and outranks the menu (States) |
| Dice canvas `#dice`, the tray `#dice-tray` | over the map | Kept; the tray becomes the **throw zone** at the bottom, where the token is (Dice) |
| Rewards and defeat cards (`conclusion.js`, `defeat.js`) | over the map | Kept as **cards**: one overlay, outranking the menu |
| Handout viewer `#viewer`, scenes screen (`scenes.js`), map editor (`editor.js`) | full screen | Kept as **full-screen modes**; the token stays in its corner over them (the editor has its own Done) |
| Toasts `#toast` | top | Kept (not a menu; they go on their own) |
| Names over pawns `#labels` | map | Kept |

## The layouts considered

Three ways to make "one token opens everything", judged on: one thumb at 390 x 844, one
overlay at a time, how deep a turn's commonest things are, and how much of today survives.

### Layout A: a bottom sheet that rises from the token, levels pushed sideways (recommended for phones)

The token sits at the bottom centre. A tap raises a sheet from the bottom to 88 % of the
screen's height (the top 12 % of the map stays visible and dimmed: the place to tap to
clear). Inside, levels **push**: the first level is a list; choosing Character slides the
character screen in from the right over it, with a breadcrumb row on top ("‹ Menu ·
Wren"). One level is visible at a time on a phone; the breadcrumb shows the cascade.

### Layout B: a side panel from the left with columns that cascade (recommended for wide screens)

The first-person-shooter pause menu: a column of first-level choices slides in from the
left edge (240 px), and the chosen one opens its screen in a second column beside it (420
px), and a third level a third column, while the map stays visible on the right and is the
place to tap to clear. On a phone the columns cannot fit; the side panel would be a full
screen and the thumb would travel to the top-left for the first choices.

### Layout C: a ring of choices round the token (radial menu)

A tap on the token fans six round buttons out around it. Fast for six things, quick to
learn; but there are more than six first-level choices (Character, Turns, Dice, Log and
chat, Handouts, Table), the second level does not fit in a ring, and a ring has no reading
order for a screen reader or a keyboard. Rejected; its idea of **the token as a place the
thumb already is** is kept.

### How they compare

| | A: rising sheet | B: side columns | C: ring |
|---|---|---|---|
| Phone, one thumb | **Choices in the bottom two thirds; back is the breadcrumb or a swipe right** | First choices top left, far from the thumb | Best for the first level, nothing after |
| Wide screen | Wastes width | **Map visible beside the cascade; the shooter feel the owner named** | Same as phone |
| Cascade visible | Breadcrumb | **Columns** | No |
| One tap to clear | The strip of map above | The map beside | Anywhere |
| Keyboard, screen reader | A list, then a list | Lists in columns | No order |
| What survives from today | The drawer's panels as screens | The drawer's panels as columns | Little |

## The recommendation

**One token; one menu that is a rising sheet on a phone and cascading columns on a wide
screen (A below 900 px, B from 900 px); the same tree in both; one overlay at a time; any
tap outside clears it.** Reasons:

1. **It is what the owner described**, at both sizes: a slide-out overlay (B is the
   shooter's pause menu; A is the same menu turned to the thumb), a character symbol on
   top, a cascade, administration one level up, the tracker beside the character.
2. **The thumb never leaves the bottom on a phone**: token, first level, action groups,
   the aim bar, the throw zone and End turn are all in the bottom two thirds.
3. **One tree, two shapes.** The same items in the same order, so a player who uses a
   phone at the table and a laptop at home learns one menu. The width that chooses the
   shape is the 900 px `table-ui.md` already uses for the pinned drawer.
4. **It re-homes, it does not rebuild.** Every screen of today's drawer becomes a screen of
   the menu by re-parenting (as `table-ui.md` did when it made the drawer); the action
   panel's rows are kept and regrouped.

### Decision 1: the token

- **What it is.** A die, 64 px, drawn by the theme: Classic a brass d20 on a dark disc,
  Sunlit a rounded green d20 with a white rim, Pocket a pixel-cut d20 with a hard shadow.
  It is the button `#btn-menu`, `aria-label="Menu"` (spoken with state: "Menu. Your
  turn. Wren, 6 of 8 Hit Points. 1 new handout."), `aria-expanded`, `aria-controls`.
- **Where.** Bottom centre by default, 16 px above the safe area. Setup › Controls › "The
  menu token sits": **bottom centre**, **bottom right**, **bottom left** (left-handed).
  On a wide screen the same three; bottom centre by default.
- **The token stays put (round 6, R25).** The token is in one fixed place at every size and
  whatever is open: a menu, a sheet, columns, the pinned menu, the dock, the aim bar's
  neighbours. It never rides above a sheet, never rises with the dock, and never slides
  along when columns open; **everything else leaves room for it**. A phone's sheet and the
  columns keep a footer as tall as the token and its margin (84 px) empty at the bottom; the
  dock keeps the same strip clear. On a phone on its side the token takes the bottom corner
  it takes with the menu shut, and the columns stop short of it. The token's place changes
  only when the person sets it (Setup › The menu), never because of what is on the screen.
- **What it wears.**
  - the **health ring**: an arc round the die for the selected character's Hit Points
    (question 4), in the theme's good colour, the bad colour below half, empty at 0. It
    **explains itself** three ways, because a coloured ring alone is a riddle (R5):
    1. **When Hit Points change**, a small label sits beside the token for 3 s: "Wren 3 / 8
       HP" (spoken once, politely);
    2. **The first time the menu opens on a device**, a one-line note above the arc
       (Decision 4c): "The ring round the die is Wren's health: 6 of 8 HP." with **Got it**
       (`hextable.seen.ring`, never shown again);
    3. **Help and feedback** opens on "The die button": a picture of the token with each
       mark named (health ring, turn ring, badge, offline mark).
    The character row of the first level draws the same ring round the sigil, beside "6 / 8
    HP", so the two are seen together.
  - a **badge**, **only when something is waiting for this person**, never otherwise: a
    handout or note not yet opened, a level ready, for the DM a waiting player or an
    undecided conclusion (today's `#menu-badge` sum). The number counts those things and
    nothing else. A question that must be answered (a reaction) does not use the badge: it
    opens by itself (Decision 2).
  - **What waits is said at once.** When the badge shows, a tap on the token fans out
    the arc with a **Waiting for you** card above it listing each
    thing in words with its button: "1 new handout: A torn map · **Open**", "Wren can reach
    level 2 · **Level up**". Opening it clears its count. When nothing waits there is no
    box and no badge.
  - on **my turn**, a ring in the accent colour that pulses once at the start of the turn
    (not under reduced motion) and stays lit;
  - **offline**: greyed with a crossed mark.
- **What a quick tap does** (round 3). The places fan out in an **arc round the die**
  (Decision 4c), and nothing else opens. A tap on a symbol opens that place; a tap on the
  die again, or on the map, folds the arc back. When something waits, the Waiting for you
  card sits above the arc. (At the start of my turn, if question 3 is answered yes, the
  Character screen opens instead.)
- **Holding it for a second** (1 s, the finger still) **pops up the fidget die** (round 6,
  R22; it replaces round 3's instant throw of the last roll). The die lifts a little at 1 s
  so the finger knows it worked, the menu and the arc fold if open, and the throw zone
  rises with the fidget dice in it, ready: a flick or a tap throws them, as any throw
  (Decision 9); Cancel, a tap on the map or Escape puts them away. Lifting the finger
  earlier is a tap.
  - **By default a single d20.** Setup › Dice › **Fidget die** chooses the dice (any pool
    of d4 to d100, up to 12 dice, chips with their own −, "Back to a d20"). A second
    setting, **Remember the last fidget dice**, is **off**: the chosen set always wins
    (question 30). There is no modifier: a fidget has nothing to add to.
  - **Only on this screen.** Nothing is sent to the table, so no other player and **not the
    DM** sees it; it is not in the log or in Last rolls; its title says so: "Fidget: 1d20 ·
    17 · only on your screen". It is not a plain roll (E-M2 is not used).
  - **Not a game roll.** The fidget never uses the game's seed and never reaches the
    engine: the client draws its numbers from the device's own random numbers
    (`crypto.getRandomValues`, in the client only, kept out of the rules package), so a
    fidget cannot change, predict or use up any game roll, and it does not replay. The
    "rules package is pure" rule is untouched, since the rules package never sees it.
  - It obeys the dice settings of this device (look, how long rolls stay, flick on or off).
- **Three holds, three places, never in conflict:** holding the **die** (1 s) pops up the fidget die for
  fun; holding a **symbol in the arc** (0.5 s) opens Arrange; holding a **die type in Roll
  dice** (0.5 s) takes one die of that kind away. The die's hold is longer because a throw
  cannot be taken back and a tap must stay a tap.

### Decision 2: one overlay at a time

There are five kinds of thing that can cover the map. **At most one is open**; the order of
precedence, highest first:

| Rank | Overlay | Examples | When a higher one arrives |
|---|---|---|---|
| 1 | **A prompt**: something the engine waits for from this person | the reaction question (`#rp`), a dice question (outside dice), the initiative prompt | — |
| 2 | **A card**: something that happened to the whole table | rewards, defeat, a handout shown to all | waits behind a prompt; comes back after it |
| 3 | **The aim bar or the throw zone**: an action armed and not yet sent | Burning Hands aimed, an attack waiting to be thrown | stays armed under a prompt or card and comes back after; nothing is sent |
| 4 | **The menu** | any level | **folds away** (slides down, remembers its level and scroll) and does **not** come back on its own: the screen is clean after a prompt. One tap on the token returns to the same place |
| 5 | **The dice** on the board | a roll lying there | the dice stay on the board under the menu; a prompt's or card's scrim dims them |

Toasts and the turn line are not overlays: they never take a tap and never block one.

Full-screen modes (the scenes screen, the handout viewer, the map editor) replace the map;
inside them the same rule holds.

### Decision 3: one tap clears

- On a phone the sheet stops 12 % below the top; that strip of map, dimmed, is the **clear
  zone**: one tap there closes the whole menu (every level), and the tap does nothing else
  (it does not move the character). The breadcrumb's "‹" goes back one level; a swipe
  right on a screen goes back one level.
- **No × on a phone (round 3).** The sheet's **grab handle** is the close control: a real
  button named "Close menu", the full width of the sheet and 44 px tall, with a 56 x 6 px bar
  drawn in it. A tap on it closes the sheet; so does a drag down past 60 px or a quick flick
  (a shorter drag springs back). The map above and Escape still close it. A wide screen
  keeps its × (there is no handle there).
- On a wide screen the visible map beside the columns is the clear zone, with the same
  rule. A pinned menu (`hextable.drawerPin`, as today) is not closed by a tap on the map:
  the map then plays as normal.
- Choosing a row that **arms an action** (a spell to aim, an attack to throw, Follow)
  closes the menu by itself and shows the aim bar or the throw zone: the map is what the
  player needs next.
- Choosing a row that **sends at once** (Dash, Dodge, a long rest) leaves the menu open on
  the same screen, so the player sees the turn bar change; the status block says what
  happened in one line ("Dashed: 60 ft to move.").
- Escape (or M) closes the whole menu; Backspace or Left goes back one level.
- **Closing, always (round 4).** In every state, the arc, every screen, every section, Arrange,
  More, with or without the Waiting for you card or the health-ring note, **three things
  close it: a tap on the die, a tap on the map, Escape.** So the die is drawn above the
  dimmed map and the arc (only a prompt, the aim bar and the throw zone are above
  it, and those hide it) and it **does not move**: the phone sheet and the columns end above
  the token's strip (round 6, R25: they leave room for it, it does not ride above them), so it stays
  in view and in reach. The Waiting card and the health note are only as big as their text,
  so the map round them still closes. The build carries a test that walks each state at
  both sizes and closes it each of the three ways (the mockup's check did: 27 states x 2
  sizes, all closed).

### Decision 4: the tree

The same tree at both sizes. First level, top to bottom:

```
 ┌───────────────────────────────────────────┐
 │ Waiting for you                            │  only when the badge shows (Decision 1)
 │ 1 new handout: A torn map         [Open]   │
 ├───────────────────────────────────────────┤
 │ (sigil) Wren                     6/8 HP ›  │  Character   ← always first; the symbol of the character
 │         Wizard 1 · Your turn               │
 │   (sigil) Owl · Wren's familiar   1/1 HP › │  one row per creature controlled (Decision 4b)
 ├───────────────────────────────────────────┤
 │ Turns            Round 2 · Goblin's turn › │  (outside a fight: Party)
 │ Dice                     last: Wren 17   › │
 │ Log and chat                     2 new   › │
 │ Handouts                             1   › │  only when there are any
 ├─ Table ───────────────────────────────────┤
 │ Setup                                    › │
 │ DM tools                                 › │  DM only
 │ Characters                               › │
 │ Packs                                    › │
 │ Help and feedback                        › │
 │ About                                    › │
 │ Leave the table                            │  (solo: New game)
 └───────────────────────────────────────────┘
```

Each row shows its most useful line on the right (the status, the round, the last roll,
the count of new lines), so the first level is itself a summary.

**Why these administrative items, in this order.** Setup is what a player most often needs
(theme, dice, the token's place). DM tools are the DM's daily screen. Characters and Packs
are setup work done between sessions. Help and About are rare. Leaving is last and apart,
so it is never tapped by accident (today it is the first, widest button of every drawer
tab).

**Character**, the cascade (second level), read top to bottom like a character sheet:

```
 ‹ Menu   Wren                                     (no switcher here: Decision 4b)
 ┌ STATUS ─────────────────────────────────────┐
 │ Wren · Level 1 Wizard        [End turn]      │  End turn on my turn only
 │ ▓▓▓▓▓▓░░ 6 / 8 HP    AC 12    Speed 30 ft    │
 │ Your turn · Round 2                          │
 │ [Action Ready][Bonus Ready][Move 30/30][React Ready]   ← the turn bar (a fight)
 │ Level 1 slots ●●  · Concentrating: none      │
 │ Prone ⓘ                                      │  a tap shows how it ends
 └──────────────────────────────────────────────┘
 ACTIONS
   Attack            Quarterstaff, Fire Bolt          ›
   Cast              2 slots · 6 spells               ›
   Heal              nothing that heals  (greyed)     ›
   Move              Dash, Disengage, Stand up        ›
   Defend and hide   Dodge, Hide                      ›
   Use               a lever in reach                 ›
   Features          Arcane Recovery                  ›
   Reactions         Shield asks you · Opp. Attack    ›
 INVENTORY           Quarterstaff (held) · 3 more · 12 gp ›
 SHEET
   Abilities and skills                               ›
   Features and traits                                ›
   Spells known                                       ›
   Story                                              ›
```

**The action groups** (proposed; question 1). The owner named "heal, attack, movement";
the groups are by **what the player wants to do**, because that is the question a player
asks ("can I heal Brenna?"), and today's tabs by kind (Spells, Features, Bonus) make a
healing spell, a healing feature and a potion live in three tabs.

| Group | Holds (today's rows) | Shown |
|---|---|---|
| **Attack** | weapon attacks and Multiattack (Attacks tab), attack cantrips and attack spells (Spells rows whose effect is an attack roll or harmful save against chosen targets), Grapple and Shove, a companion's attack order | always in a fight; out of a fight when a hostile creature is in sight |
| **Cast** | every spell (Spells tab with its slot strip and "Sort and filter"), Metamagic, rituals | for a caster |
| **Heal** | every row that heals or ends a condition: healing spells, Second Wind, Lay On Hands, potions and items that heal, and "A friend is down" (`player-screen.md` Decision 6) at the top when it applies | always (greyed with why when there is nothing: "Wren has no healing spell or item.") |
| **Move** | Move (the reach, its legend), Dash, Disengage, Stand up, fly higher and lower, Escape a grapple, Follow, Lead and Formation (out of a fight) | always |
| **Defend and hide** | Dodge, Hide, take up or put away a Shield, Search (in a fight) | always |
| **Use** | objects in reach (`usesFor`: doors, levers, piles), items with an action that are not healing, Light a torch, Check… | when there is something |
| **Features** | class features with uses (Action Surge, Rage, Channel Divinity, Wild Shape, Font of Magic…) not already in a group above | when the character has any |
| **Companions** | Command, Dismiss, Recall, Mount (`companions.js`) | when the character has one |
| **Reactions** | the summary (`player-screen.md` Decision 2: "Shield · asks you", Change) | always in a fight |
| **Explore** (out of a fight, in place of Attack's position) | the four fixed verbs Search, Hide, Follow, Lead (`player-screen.md` Decision 6), Light, Check… | out of a fight |
| **Rest** (out of a fight) | Short rest…, Long rest | out of a fight |

A row may be in two groups (a healing spell is in **Cast** and in **Heal**); it is the same
row and does the same thing. Every row keeps its **cost chip** (Action, Bonus Action,
Reaction, Free, a slot) and, when it cannot be used, its **reason in words** under it.

**The order of groups never changes within a state** (in a fight: Attack, Cast, Heal,
Move, Defend and hide, Use, Features, Companions, Reactions; out of a fight: Explore, Cast,
Heal, Use, Rest, Features, Companions), so a hand learns it. A group with nothing at all
for this character is left out (a fighter has no Cast); a group with nothing usable **now**
is shown greyed with its reason ("Not your turn", "Action used").

**The turn bar filters.** A tap on a turn bar segment (Action, Bonus, Move, Reaction)
opens a screen of **everything that costs that**, across groups ("Bonus Action: Misty
Step, Cunning Action: Hide, Healing Word"). This keeps `player-screen.md` Decision 1's
"the segment is the question".

**The likeliest thing.** On my turn, the first group that has something usable shows its
first usable row inline under it ("Attack: Quarterstaff · +2 · 1d6"), one tap from the
character screen. This replaces `defaultTab`'s choice of a tab.

**Inventory** is the Items tab: what is worn and held, equip, attune, give, drop, pick up,
coins; a tap on an item shows its text and its actions.

**Sheet** sections are today's sheet (`renderSheet`), split into four so a phone does not
scroll a long page: Abilities and skills (with "Check…" on each skill when a check can be
asked), Features and traits, Spells known, Story (background, notes).

### Decision 4a: nothing scrolls by itself (round 2, R2)

The owner opened Story at the foot of Wren's screen and the screen jumped to the top, with
"Wren" gone. The rule:

- **No screen ever changes its scroll position by itself.** Opening, closing, a new turn,
  a refreshed state, a row that sends: the scroll of every level stays where the player
  left it. A re-drawn level keeps its `scrollTop` (the client keeps it per level and puts
  it back after drawing).
- **Round 5 replaces the in-place folds of round 2** with the one accordion of Decision 4d
  (R21): on the character's page, as on Setup, one section is open at a time and the bars
  before and after it stay pinned. What this rule still says: a tapped bar stays where it
  was under the finger; an open section keeps its own scroll while it stays open, and each
  page remembers which section was open.
- **The name and status block stay on screen.** The status block ("Wren", Hit Points, the
  turn bar) is fixed at the top of the character's page above the sections, so the Sheet
  section at the bottom opens with Wren still shown above it.
- Only a screen that is a real next step (a picker such as Formation or a Wild Shape form,
  Arrange) pushes a new level; going back returns to the same scroll and the same open
  section. On a wide screen there is no second column for a group any more: a group is a
  section of the page.
- **One exception, asked for:** the turn line's tap (Turns) and the Waiting for you box's
  buttons open their screen at its top, since that is where the thing is.

### Decision 4b: which character (round 2)

The owner, on the phone mockup: the "Wren ▾" choice inside the character screen "doesn't
appear to do anything and it's within the character so if it's so they can control
multiple characters it should probably be at a 'higher' level." Agreed. The choice of
character lives **on the first level**, never inside a character's screen:

- **One row per creature this person controls**, at the top of the first level under the
  Waiting for you box, in this order: the selected one first, then the others in turn
  order (in a fight) or party order. Each row is the character's symbol with its own
  health ring, the name, level and class (or "Owl · Wren's familiar"), and a state on the
  right ("Your turn", "6 / 8 HP", "Down"). A tap opens that creature's Character screen
  **and selects it** (the camera goes to it, as `select` does today), so the token's ring,
  the turn line and the map's reach are then about it.
- **Who sees several rows:** a player with a companion they command (Find Familiar, a
  steed), a player given a second character, the DM's stand-ins (`standIn`), and solo play
  (the whole party: Brenna, Pip, Odessa, Tavin, Wren). Companions sit under their master,
  indented.
- **A player with one character** sees one row and nothing else: no switcher, no arrow, no
  "choose". The row is simply "Wren".
- **The DM** sees the creatures they play by hand in this list only when they have chosen
  some ("Play as…" in DM tools › Creatures); monsters run by the AI are not listed. The
  DM's tracker (Turns) remains the way to pick any creature.
- On a wide screen the rows are the top of the first column; the Character column shows
  the one that was tapped.
- The Character screen's head carries only the name, level and class: nothing in it
  changes which character it is.

**Turns** (the tracker, `tracker.js`; amended in round 6, R23, because the owner could not
tell whose turn it was and a tap on Wren did nothing):

- **The heading names who acts**: "Round 2 · **Wren's turn — yours**" on my turn;
  "Round 2 · **Goblin Warrior 2's turn** · you're in 3" on another's; "Round 1 · Odessa's
  turn · you're next". An unseen turn reads "Round 2 · Something moves unseen" (or nothing,
  under `unseenTurns: 'quiet'`), as the turn line does.
- **The current row is filled** in the accent colour, taller (60 px), with a **"▶ Now"**
  tag before the name and `aria-current="step"`; not a border alone. **The next seen row**
  has a **"Next"** tag and an accent outline. The viewer's own creatures say **"You"** under
  the name, with their initiative as a number.
- **Every row does something when tapped** (each row is a button with words for what it
  does):
  - **your own character** (or a companion you play): opens its page; on your turn it opens
    on "Attack and cast". The row shows **"Open ›"**;
  - **anyone else** the party can see: selects it and shows it on the map (the camera goes
    to it and it is ringed); on a phone the menu clears so the map can be seen, with a
    toast "Showing Goblin Warrior 3"; on a wide screen the menu stays. The row shows
    "Show";
  - **the unseen row** ("Something moves unseen") stays as it is: no name, no number; a tap
    shows nothing on the map and says why: "Something moves unseen: the party can't see it,
    so there is nothing to show."
- What a row shows is unchanged: a foe's health in words, never a number; no initiative for
  a creature whose roll players are not sent (`tracker.js` today).

**Dice**: **Roll dice** at the top (Decision 8b), then the last rolls (Decision 8), then
the dice settings in one place, the dice look among them (Decision 8a; they also live in
Setup).

**Log and chat**: the log by fight as built (filters kept: All, Talk, Rolls…); at the
foot a **Say** box ("Say as Wren" or "out of character", the engine's `say`) and **Note to
the DM** (the private `note`). "2 new" on the first level counts lines added since it was
last opened.

**Table › DM tools** (DM only). Today's DM tab is one long scroll of sixteen sections. It
becomes a list of level-3 screens, each today's section unchanged inside:

| DM tools screen | Today's sections |
|---|---|
| **Undo and redo** (first row, with what each would undo) | Take back |
| **Fight** | Call for initiative, End the fight, Run monsters automatically, the fallen card, rewards |
| **Creatures** | Add (with the search the play test asked for, `player-screen.md` Decision 11, its own job), hidden, conditions, place, hide, flight, size, refresh the party |
| **Map** | Edit map, stock maps, places (rooms revealed) |
| **Sight and light** | sight, unseen turns, light, torch |
| **Table rules** | pace, dice (`diceThrow`), rewards review, XP share, engage, passive, vertical, cover, climbing, the square rules |
| **Party** | marching order, rest, who plays whom (also under Characters) |
| **Scenes and handouts** | scenes, handouts |
| **Time and chronicle** | world clock, chronicle |
| **Table file** | export, leave (DM), new world (solo) |

**Table › Setup** (today's Settings, with the new preferences):

| Group | Items |
|---|---|
| **Look** | Theme; floors; cut walls; caves; arena edge (as today) |
| **The menu** | The menu token sits (bottom centre, right, left); **Menus: slide in and out / just appear** (`hextable.menuMotion`, Decision 6); Open my character at the start of my turn (question 3); Keep the menu open beside the map (wide screens, today's pin) |
| **Controls** | Keys (the presets of `keyboard.md`, Show keys); Camera buttons on the map (off) |
| **Dice and animation** | Dice (full throw, quick, off: today's); **Rolls stay on the board** (Decision 8); **Throw my dice with a flick** (on); Always throw my dice at once (today's); Animation (follow the table, flow, instant: today's) |
| **For the DM, on this device** | Throw the monsters' dice for me (today's) |
| **The table's rules** | the read-only list, as today |
| **Connection** | the link dot with its words (when online) |

### Decision 4c: names, symbols, the arc, the strip and Arrange (round 3)

This decision replaces the first level of Decision 4 as a list: the places and their order
are the same, but they are reached through an arc of symbols round the die and a strip of
the same symbols across the top of every screen. Decision 4's tree below the first level
(the character screen, its groups, Setup, DM tools) stands.

**Names: every screen says what it is.** The heading of a screen is its own name, never
"Menu": **Wren** (the character's name), **Turns** (in a fight) or **Party**, **Dice**,
**Log and chat**, **Handouts**, **Setup**, **DM tools**, **Characters**, **Packs**,
**Help**, **About**; a screen under another says both in its back link ("‹ Setup" over
"Arrange the symbols"). The die's button is spoken "Menu" only as its role ("Menu button:
Wren, 6 of 8 HP").

The two groups need names. Three sets, for the owner to choose (question 19):

| Set | Your play | The game around it | For | Against |
|---|---|---|---|---|
| **A (my pick)** | **Play** | **This game** | Says what each is for in words a new player uses; "This game" covers setup, the characters, packs, help and leaving without the jargon of "table" or "session" | "Game" is broad |
| B | **At the table** | **Behind the screen** | The tabletop's own picture; warm | "Behind the screen" reads as the DM's, but players use Setup and Leave too |
| C | **Adventure** | **Session** | Short | "Session" is technical; a solo player has no session |

The group names show as captions in Arrange and Help; the arc shows them by ring (Play
inside, This game outside), not in words, so the arc stays clean.

**One set of symbols.** Line drawings on a 24-unit grid, 1.7-unit strokes with round ends,
drawn in the theme's accent colour (`currentColor`), on a round tile of the panel colour
(Classic: a brass-tinted rim; Sunlit: white tiles; Pocket: square tiles with a hard shadow
and square stroke ends). No fills except small dots, so they read at 26 px and at 44.

| Place | Symbol | Why |
|---|---|---|
| Your character | its **sigil** (a letter on its colour) with the **health ring** | the same ring as the die's, so the two are learnt together |
| Turns (a fight) | **crossed swords** | the fight's order |
| Party (exploring) | **a campfire** | the party at rest together |
| Dice | **a d20** | |
| Roll dice | **two dice** with pips | rolling, as opposed to looking at rolls |
| Log and chat | **a speech bubble** with lines | talk and what was said |
| Handouts | **a scroll** | |
| Setup | **a gear** | the owner's choice; the universal sign |
| DM tools | **a wrench** | the owner's choice |
| Characters | **two meeples** | the owner's choice: people at the table |
| Packs | **a strapped tome** (a book with a clasp) | homebrew is a book of extra rules and things |
| Help | **a question mark** in a circle | |
| About | **an i** in a circle | |
| Leave | **a door with an arrow** | |
| More | **three dots** | |
| Arrange | **six dots** | the drag handle people know |

The mockup's "Symbols" control shows them together in the three themes.

Round 4: Characters, Packs, Help, About, Leave and Handouts are no longer places (they are
sections of Setup or of Log and chat), so their symbols leave the arc and the strip; the
set is kept for later use (a section bar may carry its symbol if the owner wants it).

**The places (round 4).** Only a few: **your character** (one symbol per creature you
control), **Turns** (Party when exploring), **Roll dice**, **Log and chat** (handouts are a
section of it), **Setup**, and **DM tools** for the DM. Everything else is a section of
Setup (Decision 4d). A player with one character has **5**; with a familiar 6; the DM 6 or
more; a solo player with a party of five, 9 (+ DM tools, 10).

**The arc (a quick tap on the die).** The places fan out from the die along rings, in
order. They grow out of the die in 0.5 s with a
25 ms stagger (none under Just appear or reduced motion).

| Where the die sits | Rings (centre distance) | Slots | What it holds |
|---|---|---|---|
| Phone, bottom centre | one half **ellipse**, 128 x 150 px; a second (165 x 252) only past 7 | 7 (+ 8) | every usual case in one ring (5 to 7); a solo party uses the second ring |
| Phone, bottom left or right | one **quarter circle** of 124 px; a second of 204 px past 4 | 4 + 6 | 5 or 6 places use both rings |
| Wide screen, centre | one half circle of 160 px; a second of 270 px | 8 + 11 | one ring for every usual case |
| Wide screen, corner | quarter circles of 135 and 220 px | 4 + 6 | |

- Each symbol is a 52 px round button (above the 44 px minimum), its badge at its corner.
- **When there are more places than slots** the last slot is **More**, a screen of every
  place as labelled tiles. With the few places of round 4 this needs more than 15 places
  on a phone, which no table reaches today.
- **Labels.** The words are in each button from the start (a screen reader says them at
  once); on screen they appear as small plates under the symbols after **3 seconds** with
  no choice, and stay until the arc closes. Setup › The menu › **Labels under the symbols:
  After 3 seconds / Always**.
- **Closing:** a tap on the die, on the map, or Escape folds the arc. Choosing a place
  folds it and opens the screen.
- **Keyboard:** M opens the arc; arrow keys move round it in order; Enter opens; the
  focus starts on the first symbol.

**The strip (inside a screen).** The same symbols, in the same order, run across the top
of every screen as the way between places (48 px buttons). The current place is marked (a
rim and an underline in the accent colour, `aria-current="page"`). Six fit a 390 px phone
with room to spare. **When they do not fit** (a solo party with the DM's tools: 10), the
strip scrolls sideways, the current one is scrolled into view, and a **‹** or **›** (32 x
48 px, the accent colour, with a soft shadow) appears at an end **only when there is more
that way**; a tap moves the strip by about three symbols. Labels show under
them only when "Always" is set. This replaces the "‹ Menu" link: there is no first-level
list to go back to.

**Arrange (round 3).** Hold a symbol in the arc for half a second, or open Setup ›
**Arrange the symbols**. Each place is a row: a **six-dot handle** (44 px) to drag it up or
down within its group, ▲ and ▼ buttons for keys and switch users, and an **eye** to hide it
from the arc and the strip. **Reset order** puts back the order and shows everything.
Kept per device (`hextable.menuOrder`, `hextable.menuHidden`), like the theme.

**Two kinds of place cannot be hidden** (round 4), and their row says why:

| Place | Why it always shows |
|---|---|
| Your character(s) | the character is how you play |
| Setup | it is where hidden symbols come back, and where you leave the table |

Turns, Roll dice, Log and chat and DM tools may be hidden. (Help and Leave, which could not
be hidden in round 3, are now sections of Setup, so they are always one place away.)

### Decision 4d: pages of sections, one accordion (rounds 4 and 5)

Round 4 made Setup one page of sections; round 5 (R21) uses the same accordion on **every
page that has sections**, so the whole menu behaves one way:

| Page | Sections |
|---|---|
| **Your character, in a fight** | Attack and cast · Move and defend · Heal · Features and reactions · Inventory · Sheet (abilities and skills, features and traits, spells known, story) |
| **Your character, exploring** | Explore (Search, Hide, Follow, Lead, things in reach) · Cast · Heal and rest · Features · Inventory · Sheet |
| **A companion** (the owl) | Move and defend · Help (or Attack) · Sheet |
| **Roll dice** | Roll · Last rolls |
| **Log and chat** | Handouts (when there are any) · Log · Talk (say, a note to the DM) |
| **Setup** | the seven of round 4, below |
| **DM tools** | Undo and the fight · Creatures · Map, sight and light · Table rules (Players see foes' health) · Party and time · Scenes and handouts · Table file |
| **Turns** | none: one list |

Round 2's eleven groups on the character's page become six sections: two groups that a
player uses together share a section, with a small heading for each inside it (Attack /
Cast, Move / Defend and hide, Features / Reactions). Six is what fits beside the status
block on a phone (below).

**The character's page.** The status block stays above the sections. With no section open
it is the full block (name, level and class, the Hit Point bar, AC, speed, the turn bar in a
fight, slots and conditions) and every bar shows its tip ("Fire Bolt, Quarterstaff · 2
slots, 6 spells"). With a section open the block goes **compact**: one 44 px line (sigil,
name, Hit Points and AC, End turn on my turn) and the turn bar (44 px), and the other bars
show their titles only. The page's heading is the status block's name (it is still a
heading for screen readers). **On my turn the page opens on "Attack and cast"**, the
likeliest section (question 29); otherwise on what was open last, or none. A turn-bar
segment opens, as a first section above the others, everything that costs it ("Costs your
Bonus Action"); a second tap closes it. A section with nothing usable now still opens: its
rows are greyed with their reasons, and its tip says why ("Not your turn.").

**Room for the open section** (its own visible height, measured in the mockup with every
other bar still on screen; round 5, with every bar showing its title only while one is
open):

| Page, open section | 390 x 844 phone | 1280 x 800 |
|---|---|---|
| Wren in a fight, my turn, "Attack and cast" (status block compact, turn bar shown) | **147 px** | 271 px |
| Wren in a fight, "Sheet" | 149 px | 273 px |
| Wren exploring, "Cast" | 195 px | 319 px |
| The owl, "Move and defend" | 333 px | 457 px |
| Roll dice, "Roll" | 384 px | 560 px |
| Log and chat (with Handouts), "Log" | 338 px | 514 px |
| Setup, "Dice" | 154 px | 330 px |
| DM tools, "Table rules" | 154 px | 330 px |

The tightest is the character's page in a fight on a phone; it keeps at least 140 px
because the status block goes compact and no bar shows its tip while a section is open.
With none open, every bar shows its tip (6 on the character's page, 7 on Setup) and all
fit with the full status block.

### Decision 4d (round 4): Setup is one page of sections

Settings-like things are no longer places of their own. **Setup** holds them as sections,
in this order:

| Section | Holds |
|---|---|
| **Display and controls** | Theme; Health bars over creatures; Camera buttons on the map; Floors; Keys |
| **Dice** | Fidget die (round 6: the dice the 1 s hold pops up, d20 by default; Remember the last fidget dice: off); Dice look (and the primary-colour picker); Rolls stay on the board; Throw my dice with a flick; Other players' dice |
| **The menu** | Arrange the symbols; Labels under the symbols; The die sits; Menus: slide or appear; Open my character at the start of my turn |
| **Characters and packs** | Who plays whom, adding, levelling (the DM's tools for it; a player sees their own); the packs the table uses (the DM adds and removes them here) |
| **The table's rules** | The DM's rules in words for players; for the DM, the rules to set (Players see foes' health here too) |
| **Help and about** | The die and every symbol explained; feedback; credits, licences, version |
| **Leave the table** | Leaving this game on this device: "Leave the table…", then **Stay** / **Leave the table** (in the bad colour). Words: "Leaving takes you back to the start page. It does not end the game for anyone else." |

**How the sections behave.**

- Each section is a **title bar** (52 px, the title and a one-line summary, a chevron) that
  opens and closes it. **One section is open at a time**: opening another closes the first,
  and the tapped bar stays where it was under the finger.
- While a section is open, the **bars before it stay pinned at the top** and the **bars
  after it stay pinned at the bottom**; only the open section's content scrolls between
  them (its own scroll, kept while it stays open). The closed bars shrink to 44 px (the
  title only; round 5: the open bar too) so all seven fit beside an open section on a 390 x
  844 phone, with 154 px of the section showing.
- With no section open, Setup is the list of seven bars.
- **Roll dice** has a row "How dice look and how long they stay", which opens Setup with
  Dice open.
- Keyboard: Tab moves between bars; Enter or Space opens; each bar is a button with
  `aria-expanded` and `aria-controls`; the open content is a labelled region.

### Decision 5: the layout at each size

```
 390 x 844, exploring, menu closed      390 x 844, my turn, menu closed
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│                                  │   │      Your turn, Wren             │ ← banner 1.6 s
│                                  │   │                                  │
│                                  │   │                                  │
│            the map               │   │            the map               │
│         (nothing over it)        │   │   reach: fill and edge           │
│                                  │   │                                  │
│                                  │   │                                  │
│                                  │   │                                  │
│                                  │   │  Round 2 · Your turn  [End turn] │ ← the turn line
│               (◈)                │   │               (◈)  ← ring lit    │
└──────────────────────────────────┘   └──────────────────────────────────┘

 390 x 844, menu open on Character     390 x 844, Character › Cast
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│▒▒▒▒▒ map, dimmed: tap to clear ▒▒│   │▒▒▒▒▒▒▒▒▒ tap to clear ▒▒▒▒▒▒▒▒▒▒▒│
├──────────────────────────────────┤   ├──────────────────────────────────┤
│ ‹ Menu   Wren                    │   │ ‹ Wren   Cast                    │
│ Wren · Level 1 Wizard [End turn] │   │ Level 1 slots ●●   [Sort, filter]│
│ ▓▓▓▓▓▓░░ 6/8 HP  AC 12  30 ft    │   │ Fire Bolt   Cantrip · 120 ft  [A]│
│ [Action][Bonus][Move 30][React]  │   │ Burning Hands L1 · 15 ft cone [A]│
│ ACTIONS                          │   │ Magic Missile L1 · 120 ft     [A]│
│ Attack   Fire Bolt · +5 · 1d10  ›│   │ Shield      L1 · Reaction    [R] │
│ Cast     2 slots · 6 spells     ›│   │   Cast it when you are hit.      │
│ Heal     (none) greyed          ›│   │ Mage Armor  L1 · 1 hour       [A]│
│ Move     Dash, Disengage        ›│   │                                  │
│ Defend   Dodge, Hide            ›│   │                                  │
│ …                                │   │                                  │
│ INVENTORY …                      │   │                                  │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

```
 1280 x 800, menu open: first level, Character, Character › Cast; the map on the right
┌────────────┬───────────────────────┬──────────────────────┬────────────────────────┐
│ (sigil)    │ Wren · Level 1 Wizard │ Cast                 │                        │
│ Wren  6/8 ›│ ▓▓▓▓▓▓░░ 6/8  AC 12   │ Level 1 slots ●●     │      the map           │
│ Turns     ›│ [Act][Bonus][Move][R] │ Fire Bolt   cantrip  │      (tap: clear)      │
│ Dice      ›│ ACTIONS               │ Burning Hands  L1    │                        │
│ Log, chat ›│ Attack              › │ Magic Missile  L1    │                        │
│ Handouts  ›│ Cast  ◀ open        › │ Shield  Reaction     │                        │
│ ─ Table ─  │ Heal                › │                      │                        │
│ Setup     ›│ Move                › │                      │                        │
│ DM tools  ›│ …                     │                      │                        │
│ …          │ INVENTORY …           │                      │        (◈)             │
└────────────┴───────────────────────┴──────────────────────┴────────────────────────┘
   240 px          420 px                  360 px
```

- **The token is fixed (round 6, R25).** In every drawing above it sits at the same place:
  the sheet, the columns and the dock stop short of its strip (its 64 px, its 16 px margin
  and the safe area); the token is never lifted, shifted or hidden to make room for them.
- **Phone, below 900 px wide:** the sheet rises from the bottom to `calc(100% - 12vh)`;
  one level shown; levels push from the right; a breadcrumb row on top (48 px, the "‹"
  is a 48 px target); the sheet's grab handle closes it on a tap or a drag down, and there
  is no × (round 3). The
  status block of the character screen stays fixed at the top of that screen while the
  groups scroll under it, so Hit Points and the turn bar are never scrolled away.
- **Tablet in portrait** (768 x 1024) is a phone layout with a sheet capped at 560 px wide,
  centred over the token.
- **Wide, 900 px and up:** columns from the left (or the right, with the token on the
  right: the side follows `hextable.drawerSide`, today's preference, which this replaces
  as "the menu comes from"). First level 240 px, second 420 px, third 360 px; a fourth
  level replaces the third with a breadcrumb. The rest of the map is the clear zone.
- **Landscape phone** (844 x 390): the side columns, at most two at once (first level
  folds to icons), since a sheet from the bottom would leave no map.

### Decision 6: motion, and "just appear"

- **Slide (default).** Round 2 (R1): the owner found the first speeds too quick ("slow it
  by half a second"), so each slide is 0.5 s longer than the first draft. Phone: the
  sheet rises in **0.72 s** (ease-out) and falls in **0.66 s**; a level pushes in from
  the right in **0.68 s** and the old one moves 30 % left and dims. Wide: each column
  slides out from the left in **0.70 s**, 40 ms after the one before it (the shooter's
  stagger), and slides back in 0.66 s. The scrim fades with the sheet. These are the
  menu's slides; the prompts (a reaction question, the throw zone, the aim bar) keep a
  quick 0.22 s, because a question should not make a player wait (question 13).
- **Just appear.** Setup › The menu › "Menus: **Slide in and out** / **Just appear**"
  (`hextable.menuMotion`: `slide` | `appear`), a device preference like the theme. With
  `appear`, every sheet, column, level, card and prompt is shown and hidden with no
  movement and no fade.
- **Reduced motion** (`prefers-reduced-motion: reduce`) means `appear` whatever the
  preference, and no pulse on the token.
- Nothing waits for an animation: a tap during a slide acts on where things will be.
- **The menu never overshoots (round 5, R20).** Nothing moves past where it ends up and
  comes back. In particular:
  - **Only three things move**: the sheet (or a wide screen's column) when the menu opens
    or closes, a real next step (Arrange, a picker) sliding in, and the arc fanning out.
    **Switching places** (from the strip, from the arc while the menu is open, from the
    Waiting card) **swaps the screen where it is**: no slide, no fade from an edge.
  - **No two slides at once.** The sheet rises with its screen already in place inside it;
    the screen does not also slide in from the side.
  - **Nothing scrolls an ancestor.** The client never calls `scrollIntoView` (it scrolls
    every clipped ancestor, the page frame and the sheet included, which made the whole
    picture jump while the sheet was still sliding). The strip shows the current symbol by
    setting its own `scrollLeft`; focus moves with `preventScroll`.
  - **The test** (in the build, as in the mockup's check): after each way into each place
    (every symbol, from the arc and from the strip, every character, at 390 x 844 with
    touch and at 1280 x 800, with slide and with appear), record the sheet's and the
    screen's position every frame for 1.6 s: each moves only towards its final place, and
    the scroll of the frame, the stage, the document, the sheet and its levels never
    changes.

### Decision 7: states

| State | The clean screen | The token | When the menu is open |
|---|---|---|---|
| **Exploring** | the map only | the HP arc; badge if anything waits | Character opens on Explore first |
| **A fight, someone else's turn** | the turn line: "Round 2 · Goblin Warrior 2's turn · you in 3" | the HP arc | the turn bar shows "Not your turn" on Action, Bonus, Move and Reaction live; Reactions comes first among groups |
| **Unseen turn** | "Round 2 · Something moves unseen" (or nothing, under `unseenTurns: 'quiet'`) | | |
| **My turn starts** | the banner "Your turn, Wren" for 1.6 s (it lets taps through); the turn line "Round 2 · Your turn" with **End turn** at its right | the ring lights and pulses once | if the menu was open, it moves to Character and the turn bar is lit; if closed, it stays closed (question 3) |
| **Aiming** | the aim bar at the bottom: "Burning Hands · 15 ft cone · Tap a square to aim" … Cancel, Cast | hidden behind the aim bar | the menu closed itself when the spell was chosen |
| **An attack waiting to be thrown** (table rule `throw`) | the throw zone (Decision 9) | becomes the die | the menu closed itself |
| **A reaction asked of me**, menu closed | the question card rises from the bottom, as built (`#rp`): the trigger, the cost, "Use Shield (level 1)", "Do not react" | badge "!" | — |
| **A reaction asked of me**, menu open | the menu folds away first (Decision 2), then the question rises | | after the answer the screen is clean; the token goes back to where the menu was |
| **The table waits for someone else's reaction** | the turn line says "Waiting for a reaction…" | | the menu stays usable for looking; actions that would be refused show the reason ("The table is waiting for a reaction to be answered.") |
| **Initiative is called** | the initiative prompt (Decision 10) | becomes the die | the menu folds away |
| **Down** | the turn line "You are down · Death saves ✓ ✓ ○ ✗ ○ ○" | the arc empty; a flat bar across the die's face | Character's status block shows the six marks and "Your friends can heal you."; the action groups are greyed with "You can't act while Unconscious."; End turn stays on my turn |
| **Dead** | nothing new | greyed | "Wren has died. Your DM decides what happens next." · Open the log |
| **A handout or a note arrives** | a toast "The DM showed you a handout." | badge +1 | Handouts row shows the count |
| **Rewards, defeat** | the card, as built | hidden under the card | the menu folds away |
| **Level ready** | nothing | badge +1 | Character's status block has "Level 2 ready" with the button of `player-screen.md` Decision 8 |
| **Offline** | the offline bar on top | greyed, crossed | every action row greyed with "Nothing you do is sent until the table is back." |
| **DM, any state** | the undo chip beside the token for 8 s after each action | badge = waiting players, unsettled rewards and the open cards of the to-do tray (#675, `dm-todo.md`) | DM tools on the first level; "Waiting for you" on top, the tray's cards, when there are any |
| **A player's spell waits for the DM** (#675) | a line "Ria's Mage Armor: waiting for the DM" with the turn line | no change (the DM's badge carries the card) | the status block repeats it; it goes when the DM taps Done |

### Decision 7a: health bars over every creature (round 2, R8)

**Today.** The game already draws a small bar over each creature (`render-three.js` labels,
`hpFraction` in `three-build.js`): exact for a creature whose Hit Points the viewer is
sent, and for a foe a guess from its `health` word (healthy 1, bloodied 0.45, down 0).
What players are sent is fixed in `view.js`: a foe's Hit Points are never sent (`seenHp`
sends only 1 or 0), only `health`: healthy, bloodied, down or dead (`healthOf`, Bloodied
being at or below half).

**The design.**

- **Over every creature, in a fight, always**, unless this person turns it off: a device
  preference, Setup › Look › **Health bars over creatures: Always / In a fight / Never**
  (`hextable.bars`; default **Always**, as today: question 17).
- **The party's bars are exact** (Hit Points over maximum), as today; a creature at 0 shows
  an empty bar and the word "Down" on tap.
- **A foe's bar follows the table's rule** (`settings.foeHealth`, set by the DM in DM tools
  › Table rules, and shown for the DM in Setup too):

  | Value | A player sees over a foe | Engine |
  |---|---|---|
  | **Hidden** | no bar; the tracker says nothing of its health | client only (the client does not draw it) |
  | **Rough** (default) | a bar that is full (Healthy), **half with a notch** in the middle (Bloodied), or empty (Down); the notch says "this bar is a word, not a number"; a tap on the creature says the word | none: it is what `view.js` sends today. The half bar replaces today's 0.45, which looked like a number |
  | **Exact** | the real fraction of its Hit Points (still no number on the bar) | **E-M3**: `view.js` sends a new field `hpFrac` (Hit Points over maximum, rounded to tenths) for a foe the party can see, only when the table's rule is `exact` |

- **E-M3, the rule:** a table setting the DM chooses (`foeHealth` in `SETTINGS`, `rough` by
  default; an older game migrates to `rough`); under `exact` the view sends a rounded
  fraction for a creature that is **seen** (`visibility` 'seen'); a hidden or unseen
  creature still sends nothing at all, and a creature shown as Someone sends no fraction.
  The number of Hit Points is never sent, only the fraction. Tests: under `rough` no player
  message holds a foe's fraction; under `exact` a hidden creature's id appears in no player
  message.
- **The DM** sees exact bars for everyone, always.
- **Colour is not alone:** the party's bar is green, turning amber below half; a foe's bar
  is red; Bloodied's notch and the word on tap carry the meaning.

### Decision 8: dice that stay, and say whose

**How long a roll stays.** Today a settled roll is on the board for about 0.7 s (`dice.js`:
`hold` 0.7 s in full, 0.55 s quick) and then fades in 0.25 s: the words are read, the dice
are not. New device preference, Setup › Dice and animation › **"Rolls stay on the board"**:

| Value | Meaning |
|---|---|
| **3 seconds** (default) | the settled dice and their title stay 3 s, then fade |
| 1.5 seconds | about twice today's |
| 6 seconds | |
| **Until I tap** | they stay until a tap anywhere (the tap does nothing else), or the next roll pushes them aside |

`hextable.diceHold` (`1.5` | `3` | `6` | `tap`). While dice stay, **the game does not wait
for them** unless the table's pace is "wait": under "flow" and "instant" the next thing
plays and the old dice shrink into a row at the side to make room (at most three rows; the
oldest goes). A tap on resting dice clears them (today's tap skips flying dice; it still
does). The log line with its die glyphs is written when the dice settle, as today (`dice.md`
section 6), so nothing is lost when they fade.

**Whose roll it is.** Every throw already carries a title ("Brenna: Longsword attack",
`dice.md` 5.1). Added, built only from what the viewer was sent:

- **A band of the roller's colour** down the left of the title (the party chip colour of
  `colorOf`; the DM's monsters in the foe colour; "Someone" in grey) and the dice drawn in
  that colour, as today.
- **"You"** for the viewer's own creatures: "**You** (Wren): Initiative · 17".
- **Initiative** is no longer one throw titled "Initiative" with a list. Each of the
  viewer's own creatures gets **its own die**, thrown separately and titled "You (Wren):
  Initiative 17 · 2nd of 9"; then one summary title for the rest of the order, with the
  viewer's line marked ▶ and in bold ("▶ Wren 17"). Others' numbers appear only where the
  view sends them (a monster's initiative is only its place in the order, as now).
- **The Dice screen** (first level) lists the last 20 rolls this viewer saw, newest first:
  the colour band, the title, the faces as glyphs, the result line. Read-only; built from
  the log's own entries, so it never holds more than the log.

### Decision 8a: dice looks (round 2, R3)

The owner: dice as "an upsell item", with "a few options to start with, some simple colors.
I like translucent dice personally and in blue. I'd like them to be able to pick primary
colors with primary color numbering for dice."

A **dice look** is a device preference (`hextable.diceLook`), chosen in Setup › Dice and
animation › **Dice look** and on the Dice screen, with a live die that turns slowly so the
look is seen at rest and in motion. A look is presentation only: it changes no number, no
rule and nothing sent to the engine.

| Look | What it is | Free or paid |
|---|---|---|
| **Translucent blue** (the default) | clear blue resin: the body at about 55 % opacity with the board showing through, white numbers, a soft highlight on the top edges | **Free starter**, the default look (the owner's own choice) |
| **Simple solids** | one colour each with a contrasting number: White (black numbers), Black (white), Red (white), Blue (white), Green (white), Yellow (black) | **Free starters** |
| **Primary colours, your way** | pick the **die colour** from red, yellow, blue (and white, black) and the **number colour** from red, yellow, blue, white, black. A pair that cannot be read (the same colour twice; yellow on white) is greyed with the reason "The numbers would not show." | **Free starter** |
| Other translucent colours (red, green, amber, smoke) | as translucent blue | **Paid later** |
| Swirls, metals, gemstones, glow, sets that match a theme | richer looks, each a small data file of colours and a finish | **Paid later** |

**Which looks are free is the owner's choice** (question 11); the table above is the
proposal. **The shop is not designed here**: buying needs an account, payment, refunds,
the stores' rules on phones and a licence for any bought art, and the game has no accounts
today (`portable-characters.md` keeps characters per browser). It is a separate decision
for the owner (question 12). Until then the paid looks are not shown at all: nothing is
greyed with a price, so no one is teased with what cannot be bought.

**Who sees my look.** In the first build, a look is drawn on this device only: I see my
dice in my look; others see my dice in their own choice of look for others' dice ("Other
players' dice: in their colour of the party / like mine"). Showing each player's chosen
look to the whole table needs the look sent to the server's list of who is at the table
(not the game state: it is not a rule). Question 14.

**The roller's colour stays.** Whatever the look, the title's colour band says whose roll
it is (Decision 8), so a table where everyone picks translucent blue still knows whose die
is whose.

### Decision 8b: Roll dice, any time (round 2, R4)

The owner: "You should always be able to just roll dice, it's kind of fun."

**Where.** The top of the **Dice** screen, and **Roll dice** in the arc. (Round 6: holding
the die now pops up the private fidget die instead, which is not a plain roll; see Decision
1.) Holding the die for
a second throws the last roll at once without opening anything (round 3, Decision 1). In a
fight, in a scene, while exploring: always reachable.

**What.** A row of dice: **d4, d6, d8, d10, d12, d20, d100**; a tap adds one of that die
(the count shows on its button, "× 2"); a modifier stepper (−10 to +10); an optional "What for?" line (40 characters: "Perception, for the
DM"); and who sees it: **The table** (default for players) or **Only the DM** (default for
the DM: a DM's private roll). Then **Roll**: the throw zone opens with those dice (up to
12 shown, as today's limit), thrown by a tap, a flick or Enter, or at once under "Always
throw my dice at once".

**Taking dice away (round 3).** The owner, with six d20 and a d100 chosen: "I can't
unselect dice, a shift key should allow deselection." The rule: **every way to add a die
has a way to take it away, on every device, and none of them needs a key a phone lacks.**

- **Your roll** sits above the dice as a row of chips in the order of the dice, then the
  modifier: **6d20 + 1d100 + 2**. Each chip has its own **−** (a 44 px target) that takes one
  die of that kind away; a tap on the chip itself does the same. The modifier's chip has a
  **×** that sets it back to 0. **Clear all** at the end of the row empties the roll and the
  modifier. With nothing chosen the row says "No dice yet: tap a die to add it."
- **On a computer, Shift+click** on a die's button takes one of it away (a plain click adds).
- **On a touch screen, press and hold** a die's button (500 ms, the finger still) takes one
  away, with a short buzz where the device allows; the tap that ends the hold adds nothing.
- **Keyboard:** each button says how in its spoken name ("d20, 6 chosen: tap to add one;
  Shift+click or press and hold to take one away"); a chip's − is a button in the tab order.
- **At most 20 dice in one roll** (the limit of E-M2): a tap past it adds nothing and says
  "At most 20 dice in one roll."
- The Roll button always names the whole roll ("Roll 6d20 + 1d100 + 2"), so what will be
  thrown is never in doubt.

**Through `apply()`: engine amendment E-M2, a new action `freeRoll`.** There is no action
for a roll that is not part of something else today (checked: the handlers in `engine/`
have none). The roll must be the engine's, from the seed, so it replays and nobody can
type a number:

- `freeRoll { as?, dice: [{ sides, count }], bonus, label?, to: 'table' | 'dm' }`: `sides` one
  of 4, 6, 8, 10, 12, 20, 100; at most 20 dice in all; `bonus` an integer from −20 to 20;
  `label` cleaned like a `say` line, at most 40 characters. Anything else is refused and
  changes nothing.
- The engine rolls each die with the existing `die(state, sides)` of `rng.js`, from the seed, and records an
  event `diceRolled { by, as, dice: [{ sides, value }], bonus, total, label, to }` on the
  timeline; it changes **nothing else** in the game: no Hit Points, no check, no turn.
- **Who may:** anyone at the table, as themselves or as a creature they control; in a fight
  at any time (it is not an action of the turn). Refused while a question waits for an
  answer (a reaction, a dice question): the waiting action will be re-run from the state
  before it, dice seed included, and a roll in between would change what it rolls.
- **Who is sent it:** `to: 'table'`, everyone, with the faces (the number is public by the
  roller's choice); `to: 'dm'`, the roller and the DM; other players are sent nothing, not
  even that a roll happened.
- **Undo:** the DM's undo takes it back like any action.
- **The log** says it plainly, so nobody mistakes it for a game roll: "**Wren rolls 2d6 +
  1** (Perception, for the DM): 4, 5 + 1 = **10**. A plain roll: it changes nothing in the
  game." The dice title says "You (Wren): 2d6 + 1 · plain roll".
- **The server** limits it like any message (the existing per-connection message bucket,
  `packages/server/src/limits.js`); no new limit is needed.

A plain roll is never used by the game as a check or an attack: if the DM wants a roll to
count, the DM asks for it with the game's own check (today's `askCheck`, DM tools).

### Decision 9: throwing with a finger

Today the tray (`dice.js`, `tray`) takes a flick as a direction only (a unit vector);
speed and spin are ignored and the die starts from a fixed point.

**The gesture.** The throw zone is the bottom of the screen, where the token was; the die
sits in it at rest, large (96 px), with the title of what it is for ("Wren: Fire Bolt ·
1d20 + 5 to hit") and Cancel.

1. **Press** the die: it lifts (scale 1.1, a shadow) and follows the finger.
2. **Spin**: while held, moving the finger in a circle spins the die about the screen's
   axis; the spin is the angle swept per second, kept (decaying) until release. A visible
   trail shows the spin.
3. **Fling**: release while moving. The release velocity (pixels per second over the last
   80 ms) and the spin become the throw: speed sets how far up the board it flies and how
   many bounces; spin sets how fast it tumbles. A release slower than 200 px/s is a
   **tap**: the die is thrown up the board with a default speed and spin (today's tap).
4. **Cancel** by dragging the die back down into the tray's bottom edge, or the Cancel
   button.

A flick is never required: a tap throws; Enter on the focused die throws; the "Throw"
button stays for whoever wants it. Setup › "Throw my dice with a flick" (on) turns the
gesture off so a touch on the die simply throws.

**Many dice (round 3, R10).** The owner threw 6d20, 1d100 and 2d6 in the round-2 mockup
and they flew in a row and lay on top of one another. The rule for any number of dice:

- **Each die has its own path.** Thrown from the finger (or the die button) in the throw's
  direction, each with its own small spread of angle and speed. It hops two or three times
  (each about a third of the one before), then rolls with friction and stops **where it
  stops**: there is no line or grid of resting places.
- **They do not lie on one another.** Dice glance off the edges of the board's area and off
  each other as they roll (an elastic push with some loss); dice that come to rest touching
  are **nudged apart** a few pixels a frame until none overlaps, before the numbers settle.
- **Flat on the table.** A resting die lies with its up face in the plane of the board, seen
  at the board's tilt (`dice.md` 5.2), and turns about the up axis so its number is upright
  for the camera, with a little jitter. No die rests tilted or on an edge.
- **Only the rolled number stays.** As in the game today (`dice.md` 5.3): once a die is
  still, after 0.05 s the numerals of its other faces fade out over 0.45 s (0.35 s in quick),
  and the counted number grows a little.
- **The area** is the board between the dice title and the bottom controls. **At most 12
  dice are drawn** (a d100 is two d10s, so 6d20 + 1d100 + 2d6 is 10 dice on the board); a
  roll of more shows 12 and "+N more dice" under the title, as `dice.md` section 5 already
  says. Twelve 50 px dice take under a fifth of a phone's board area (390 x 500 px), so they
  never need to shrink there; on a smaller board they shrink to fit (`dice.md` 5.2).

**A calmer, more real throw (round 2, R3).** The owner found the first mockup "a bit
comic": the die grew and shrank, and its number flickered through random values as it
spun. The motion follows a real die on a table instead:

- **No squash, stretch or scale bounce.** The die keeps its size; only the camera's
  perspective changes it.
- **No flickering numbers.** While the die turns fast its faces are a blur of the die's
  own colour; the numerals come into view as it slows, on the faces actually turned up,
  ending on the engine's face. No random number is ever drawn in the air.
- **Friction, not springs.** It travels with an ease-out (fast to slow), at most **two low
  hops** of falling height (the second about a third of the first), then rolls and
  **rocks once** to rest (less than 8 degrees, 0.25 s). Flight about 0.9 to 1.3 s in
  `full`, 0.5 s in `quick`.
- **A shadow on the board** that tightens as the die lands; a soft click of contact is a
  sound for later (no sound now).
- **Weight by size:** a d4 slides more than it rolls; a d20 rolls longest; a d100 is two
  d10s that part a little.
- **Translucent looks** show the board through the body and the back edges faintly, so a
  translucent die reads as a solid object, not as a flat icon.

**Landing on the engine's result.** The rule of `dice.md` section 1 stands: the face shown
is the face the engine sent. Two cases:

| Table rule `diceThrow` | When is the result known | How the die lands on it |
|---|---|---|
| `throw` | **At release.** The action is sent at release (as built: "the action is sent at the throw"). The reply comes back in one round trip (solo: at once; online: typically under 300 ms) | The die flies on its own path with no target. When the faces arrive, the client works out the orientation that puts the sent face up (and upright toward the camera, `dice.md` 5.2), and **steers** the tumble: over the remaining flight, but at least the last 0.35 s, the die's angular velocity is blended toward the rotation that reaches that orientation at the planned resting time. The eye sees a die that tumbles and settles; the face is the engine's. If the reply is later than the planned rest, the die keeps rolling and rattles on the board up to 2 s, then rests face-down and shows "Waiting for the table…" until it comes. If the action is **refused**, the die fades and the reason is shown, as any refusal |
| `auto` | **Before the throw** (the engine already rolled: e.g. initiative, a save inside a monster's action) | The target is known at release: the steering starts at once; the path still follows the finger |

The finger's speed and spin choose only the path; they never reach the engine and never
choose a face. No physics library is added: the flight is the existing scripted tumble with
the launch point, launch velocity and spin taken from the gesture, a ground plane, two
low hops with friction, and the steered last bounce (`dice.js`; a unit test holds that the
resting face is the sent face for 1,000 random gestures and every die type).

**Who sees the throw.** The thrower sees their own path. Other screens see the dice of the
event as today (thrown from the roller's side), since the gesture is not sent: sending it
would add a message for presentation only. (Question 9.)

### Decision 10: the initiative prompt

The owner wants players prompted to roll initiative. Today initiative is rolled by the
engine inside the action that starts the fight (`startEncounter`, or the fight that a
hostile act or nearness starts: E23, auto-engage), which another person sent; the player
is not asked (`dice.md` section 4, "Limit: rolls inside someone else's action"; DEBT T6).
How the prompt fits each table rule:

- **`diceThrow: 'auto'` (the default), client only.** The engine has already rolled. When
  `encounterStart` arrives, each player whose creature is in the order gets the
  **initiative prompt** in the throw zone: "**Roll for initiative!** Throw your die, Wren."
  with the d20. The result is already the engine's; the prompt is **a reveal**, and the
  words say no more than that: the sub-line reads "The game has rolled it; throw to see it."
  Until the player throws (or 8 s pass, when it is thrown for them: "Thrown for you"), the
  player's own screen holds back its own number: the turn line says "Round 1 · Initiative…"
  and Turns shows "Wren: ?" on that row. Other screens are not held back (each screen holds
  only its own player's die). The fight itself does not wait: if the first turn comes while
  the prompt is up, the prompt throws at once.
- **`diceThrow: 'throw'`, with the engine amendment E-M1.** The fight's start **waits** for
  each player's throw, as an armed action waits today. E-M1 makes initiative a question:
  `startEncounter` pauses with one question per party creature whose controller is a
  connected player (`ask.kind: 'initiative'`), the same `pending` machinery as a reaction;
  each player's answer is the throw (an action `{ type: 'throwInit', actor }`); **the engine
  rolls that creature's d20 at the answer**, from the seed, so the roll is the engine's and
  replays exactly (the order of answers is recorded as actions). The DM's screen shows who
  has thrown and a button "Throw the rest" (the DM's answer for everyone left); the host's
  clock (outside dice's O2) is not needed, since the DM can always finish it. Monsters and
  absent players are rolled at once, as now. This is outside dice's group question (O1c)
  with the game's own dice; whichever is built first, the other reuses it.
- **Until E-M1**, a table on `throw` gets the `auto` reveal for initiative (it is honest:
  the words say the game rolled it).

### Decision 11: accessibility and keyboard

- **Keys** (`keyboard.md`'s fixed keys; nothing new is bound in a preset):
  - **M** opens and closes the menu (as today). **Escape** closes the whole menu (or
    cancels what is armed, as today, when the menu is closed).
  - In the menu: **Up and Down** move between rows; **Right** or **Enter** opens a row;
    **Left** or **Backspace** goes back one level; **Home** and **End**.
  - **1 to 9** (today "Choose an action tab") choose the character's action groups in their
    order (1 Attack or Explore, 2 Cast, ...), opening the menu on that group.
  - **T** opens Turns, **L** opens Log and chat (only when no field has focus; both are
    free in `keys.js` today, the build checks).
  - **Enter** on the throw zone's die throws it.
- **Screen readers.** The token: `button`, its name says the state (Decision 1). The menu:
  `role="dialog"` with `aria-modal="true"` while it covers the map (phone, or wide and not
  pinned), `role="complementary"` when pinned; each level a `nav` with a heading; the
  breadcrumb is a `nav aria-label="Where you are"`. Opening moves focus to the level's
  heading; closing returns it to the token. The turn line is `role="status"`
  (`aria-live="polite"`, spoken once a turn, as the drawer's live region does today). The
  banner is spoken once. Dice titles are spoken once when the dice settle ("You, Wren:
  Initiative, 17"), never the tumble.
- **Targets.** The token 64 px; rows 56 px; the turn bar 48 px; the breadcrumb's back 48 px;
  the aim bar's buttons 48 px; the die in the throw zone 96 px.
- **No hover.** Nothing is shown only on hover; on a wide screen hover adds a highlight
  only.
- **Colour.** Every state has a word or a shape: the turn ring is a ring and the words
  "Your turn"; the HP arc has the number in the spoken name and in the status block; the
  roller's colour band is backed by the name in the title.
- **Zoom.** Sizes in `rem`; at 200 % zoom a wide screen gets the phone shape.

## The words

| Where | Words |
|---|---|
| Token, spoken | Menu. Your turn. Wren, 6 of 8 Hit Points. 1 new handout. |
| Health label (3 s after a change) | Wren 3 / 8 HP |
| First open, once | The ring round the die is Wren's health: 6 of 8 HP. **Got it** |
| Waiting for you | 1 new handout: A torn map · **Open** · Wren can reach level 2 · **Level up** · (DM) Pip is waiting to join · **Let in** |
| Help, the die button | The die button opens everything. The ring round it is your character's health. A lit ring: it is your turn. A number: something is waiting for you; open the menu to see what. Greyed and crossed: the link to the table is lost. |
| Turn line, another's turn | Round 2 · Goblin Warrior 2's turn · you in 3 |
| | Round 2 · Goblin Warrior 2's turn · you next |
| | Round 2 · Something moves unseen |
| Turn line, mine | Round 2 · Your turn · **End turn** |
| Turn line, waiting | Waiting for a reaction… |
| Turn line, initiative | Round 1 · Initiative… |
| Turn line, down | You are down · Death saves ✓ ✓ ○ ✗ ○ ○ |
| Banner | **Your turn, Wren** |
| First level | Character (the name) · Turns (Party) · Dice · Log and chat · Handouts · Table: Setup · DM tools · Characters · Packs · Help and feedback · About · Leave the table (New game) |
| Breadcrumb | ‹ Menu · ‹ Wren |
| Clear zone (spoken) | Close the menu |
| Status block | Wren · Level 1 Wizard · 6 / 8 HP · AC 12 · Speed 30 ft · Your turn · Round 2 |
| Turn bar | Action Ready / Used / 1 attack left · Bonus Ready / Used · Move 30 of 30 ft · Reaction Ready / Used / Answer · (others' turn) Not your turn |
| Groups (fight) | Attack · Cast · Heal · Move · Defend and hide · Use · Features · Companions · Reactions |
| Groups (exploring) | Explore · Cast · Heal · Use · Rest · Features · Companions |
| Group greyed | Not your turn. · Action used. · Wren has no healing spell or item. · You can't act while Unconscious. |
| After a sent row | Dashed: 60 ft to move. · Dodging until your next turn. |
| Sections | Inventory · Sheet: Abilities and skills · Features and traits · Spells known · Story |
| Setup, menu | The menu token sits: Bottom centre / Bottom right / Bottom left · Menus: Slide in and out / Just appear · Open my character at the start of my turn · Keep the menu open beside the map |
| Setup, controls | Camera buttons on the map |
| Setup, dice | Rolls stay on the board: 1.5 seconds / 3 seconds / 6 seconds / Until I tap · Throw my dice with a flick · Dice look: Translucent blue / White / Black / Red / Blue / Green / Yellow / Primary colours, your way (Die colour, Number colour; greyed: The numbers would not show.) · Other players' dice: In their party colour / Like mine |
| Roll dice | Roll dice · d4 d6 d8 d10 d12 d20 d100 · Modifier · What for? · Who sees it: The table / Only the DM · **Roll 2d6 + 1** |
| Group names (pick) | Play · This game |
| Arc labels | Wren · Owl · Turns / Party · Dice · Roll dice · Log and chat · Handouts · Setup · DM tools · Characters · Packs · Help · About · Leave · More |
| Arc, close hint | Tap the map or the die to close |
| Phone sheet, close hint | Tap here or the die to close |
| Places (round 4) | Wren · Owl · Turns / Party · Roll dice · Log and chat · DM tools · Setup |
| Setup sections | Display and controls · Dice · The menu · Characters and packs · The table's rules · Help and about · Leave the table |
| Leave | Leave the table… · Leave the table? Your character stays with the DM, and you can come back with the table's code. · **Stay** · **Leave the table** |
| Strip arrows (spoken) | More symbols to the left · More symbols to the right |
| Handle (spoken) | Close menu |
| Arrange | Arrange the symbols · Drag a row by its six dots, or use ▲ ▼. The eye hides a symbol from the arc and the strip. Kept on this device. · Always shown: Your character is how you play. / Setup is where hidden symbols come back. / Help explains every symbol, hidden ones too. / Leaving must always be possible. · Reset order |
| Setup, menu | Labels under the symbols: After 3 seconds / Always |
| Fidget die, ready | Fidget die: 1d20 · Just for you: no one else sees it, and it is not a game roll. Change it in Setup › Dice. · Cancel |
| Fidget die, thrown | Fidget: 1d20 · 17 · only on your screen |
| Setup › Dice | Fidget die: 1d20 · Hold the die button for a second to throw these, just for you. Only your screen sees them. · Back to a d20 · Remember the last fidget dice: No: always these / Yes |
| Turns heading | Round 2 · Wren's turn — yours · Round 2 · Goblin Warrior 2's turn · you're in 3 · Round 1 · Odessa's turn · you're next |
| Turns rows | ▶ Now · Next · You · Open › · Show |
| Turns, after a tap | Showing Goblin Warrior 3 · Something moves unseen: the party can't see it, so there is nothing to show. |
| Many dice | +N more dice |
| Roll dice, your roll | 6d20 − · 1d100 − · 2 × · **Clear all** · No dice yet: tap a die to add it. · Tap a die to add one. To take one away: its − in your roll above, a tap on it there, Shift+click, or press and hold the die. · At most 20 dice in one roll. |
| Roll dice, refused | Not while the table waits for an answer. |
| Plain roll, log | Wren rolls 2d6 + 1 (Perception, for the DM): 4, 5 + 1 = 10. A plain roll: it changes nothing in the game. |
| Plain roll, title | You (Wren): 2d6 + 1 · plain roll |
| Setup, look | Health bars over creatures: Always / In a fight / Never |
| DM, table rules | Players see foes' health: Hidden / Rough (default) / Exact · (Rough) A foe's bar is full, half (Bloodied) or empty (Down). · (Exact) A foe's bar shows its real Hit Points. Hidden and unseen creatures still send nothing. |
| First level, characters | one row each: Wren · Level 1 Wizard · Your turn · 6 / 8 HP; Owl · Wren's familiar · 1 / 1 HP |
| Dice title | **You** (Wren): Initiative · 17 · 2nd of 9 · Goblin Warrior 2: Scimitar attack · 14 vs AC 12 · Hit |
| Initiative prompt | **Roll for initiative!** Throw your die, Wren. · The game has rolled it; throw to see it. (`auto`) · Your throw rolls it. (`throw` with E-M1) · Thrown for you |
| Throw zone | Wren: Fire Bolt · 1d20 + 5 to hit · Flick, tap or press Enter to throw · Cancel |
| Late reply | Waiting for the table… |
| DM, initiative (E-M1) | Waiting for: Pip, Odessa · **Throw the rest** |
| DM undo chip | Undo |
| Dice screen | Last rolls · (each: the title, the faces, the result) |
| Log and chat | Say as Wren · Out of character · Note to the DM · Send |

## The mockup

[`mockups/one-token-menu.html`](mockups/one-token-menu.html) is one page with no game code.
Its own controls (top left, "Mockup controls", not part of the design) switch the frame
(phone 390 x 844, desktop 1280 x 800), the theme (Classic, Sunlit, Pocket), the state
(exploring, another's turn, my turn, down), the motion (slide, just appear) and the table's
dice rule (`auto`, `throw`), and make a reaction question or a call for initiative arrive.
It shows: the clean screen with the token and the turn line; the menu sliding in and out,
and one tap on the map clearing it; the first level; the character cascade with the status
block on top, the turn bar, the action groups, inventory and sheet; Cast and the other
groups; Turns; Dice with "Rolls stay on the board"; Setup; aiming Burning Hands with the
aim bar; Fire Bolt thrown from the throw zone; the initiative prompt with a press, spin and
fling that lands on the (made-up) engine result; a reaction question folding the menu
away. The address can set a picture, for screenshots: for example
`#bare&theme=sunlit&state=mine&open=cast`, `#bare&frame=desktop&open=turns`,
`#bare&prompt=initiative` (the names are listed at the top of the file).

Round 6 (22 Nov): the mockup still draws the die over the sheet's footer, which is what the build now does (the token fixed, the sheet leaving room). Round 6, earlier: hold the die for the private fidget die (and its Setup row); Turns with a filled "Now" row, "Next", a heading that names who acts, and rows that open your character or show others on the map. Round 6 screenshots: `/home/claude/shots/527-r6`.

Round 5: no skip when a place opens (the strip no longer scrolls the frame; switching places swaps the screen in place), and one accordion on every page with sections, with the compact status block on the character's page. Round 5 screenshots: `/home/claude/shots/527-r5`.

Round 4 adds: few places in the arc and the strip, the die above the dimmed map (round 6: and never moved, the sheet leaves room), Setup as one page of sections with pinned bars, Leave as Setup's last section with a confirm, ‹ › on an overflowing strip, a Player/DM switch in the mockup's controls. Round 4 screenshots: `/home/claude/shots/527-r4`.

Round 3 adds: removable dice chips, Shift+click and press-and-hold to take a die away, dice that scatter and rest flat and apart, the arc round the die (the mockup control "Tap the die", and the die at left, centre or right), labels after 3 s, the strip of symbols across the top of every screen, Arrange with six-dot handles, the 1 s hold that throws a d20, a "Symbols" sheet in the three themes, and no × on the phone. Round 3 screenshots: `/home/claude/shots/527-r3`.

Round 2 adds to the mockup: the slower slide; groups and sections of Character opening in
place with Wren kept on screen (scroll kept on both sizes); one row per character on the
first level (Wren and Owl, her familiar; a mock control switches to "one character" to show
the plain single row); the badge only when something waits ("Arrives › a handout"), with
the Waiting for you box; the health label when Wren is hit and the one-time note on the
ring; the calmer throw; dice looks with a turning preview; and Roll dice on the Dice screen
and on a press and hold of the token; boulders in place of the plain boxes on the stand-in
map; health bars over every creature, and the DM's "Players see foes' health" in DM tools
and Setup. Round 2 screenshots: `/home/claude/shots/527-r2`.

Screenshots of the mockup and of today's game at both sizes were taken for the pull request
(today's: `today-*.png`; the mockup's: `mock-*.png`).

## Build plan

Each stage is one client pull request unless marked engine; each is useful alone, checked
at 390 x 844 with touch and at 1280 x 800, `npm test`, `npm run build` and the smoke passes
named. Ids are kept wherever an element moves; a smoke pass that clicked a drawer tab or an
action-panel tab is updated in the same stage to open the menu and the screen instead,
through one helper (`openMenu(page, path)`) added in M1.

| # | Stage | Touches | Smoke | Done when |
|---|---|---|---|---|
| M1 | **The token and the menu shell.** `#btn-menu` becomes the token (bottom centre, theme-drawn, badge); the drawer becomes the menu: first level as a list (replacing `#drawer-tabs`), the sheet from the bottom below 900 px, columns from 900 px, breadcrumb, clear zone, Escape/M/arrows, `hextable.menuMotion` and reduced motion. Its screens are today's tabs, re-parented, ids kept | `drawer.js`, `index.html`, `style.css` (+ `menu.css`), `settings.js`, `keys.js` (words only), smoke helper | `drawer`, `settings`, `keys` | One tap on the map closes every level; Just appear shows no movement; focus returns to the token; the first level lists Character, Turns, Dice, Log and chat, Table |
| M2 | **One overlay at a time.** The precedence of Decision 2: a prompt or card folds the menu; the aim bar and throw zone hide the token; the menu never reopens by itself | `drawer.js`, `reactionprompt.js`, `conclusion.js`, `defeat.js`, `app.js` (`refresh`) | `reactions`, `rewards`, `defeat`, `armed` | A reaction question with the menu open: the menu folds, the question shows, after the answer the screen is clean and one tap on the token returns to the same screen |
| M3 | **The clean screen** (round 6: and the token stays put, undo and redo as symbols). `#top` goes (status to the turn line, undo and redo to the DM's chip, as curved-arrow symbols); the token is one fixed place and the dock leaves room for it; `#order` to the turn line; `#cam` behind its setting; the feedback icon to Help and feedback; `#party` and the card's head leave the dock for the first level and the Character screen (built: the dock keeps only the action rows, `#ap-tabs` and `#ap-body`, until M4 moves them into the Character screen and the dock goes) | `index.html`, `app.js`, `feedback.js`, `style.css`, `actionpanel.css` | `actionpanel`, `paneltabs`, `controls`, `feedback`, `multiplayer` | At 390 x 844 exploring, nothing but the map and the token; in a fight, the turn line; the old order strip is gone and Turns opens from the turn line |
| M4 | **The character cascade.** The status block with the turn bar (absorbs `player-screen.md` P2); one row per controlled character on the first level (Decision 4b); the action groups of Decision 4 from the existing rows; the turn bar's filter screens; the likeliest row inline; level-3 screens for formation, class-feature pickers, the short rest | `actionpanel.js` (`groupsFor(S, e)` beside `tabRows`), `classes.js`, `formation.js`, `companions.js`, `grapple.js` (host element only), `actionpanel.css`, tests for the grouping | `actionpanel`, `paneltabs`, `formation`, `companions`, `grapple` | Every row that a tab showed is in at least one group (a test walks the four sample characters and compares); a greyed group says why; a healing spell is in Cast and Heal |
| M5 | **Inventory and Sheet sections**; Log and chat with Say; DM tools as level-3 screens; Setup's new groups | `actionpanel.js` (items), `app.js` (`renderSheet` split), `logview.js`, `handouts.js` (Say box), `settings.js`, `index.html` (DM sections wrapped) | `log`, `items`, `dm`, `scenes` | A player can say a line out of character from Log and chat; every DM section is reachable in three taps |
| M6 | **The states of Decision 7**: the banner, the token's ring and arc, "you in N", down and dead lines, badges (the DM's carries the to-do tray: `todo.js` is moved under "Waiting for you" and its count joins the badge sum, `dm-todo.md`), offline | `app.js`, `drawer.js`, `linkdot.js`, `style.css` | `reactions`, `link`, `multiplayer` | "you in 3" counts right with an unseen slot; the banner shows once a turn; offline greys the token and every row says why |
| D1 | **Dice stay and say whose**: `hextable.diceHold`, resting rows, the colour band, "You", the separate own initiative die, the Dice screen | `dice.js` (`hold`, titles), `app.js`, `settings.js`, a `dice.js` test for the titles | `dice` | With "Until I tap", a roll stays until a tap; the viewer's own initiative die is thrown on its own with "You (Wren)"; no title holds a number the view did not send |
| D2 | **The initiative prompt (reveal)** under `auto` | `dice.js`, `app.js` (`encounterStart`), `tracker.js` (the held row) | `dice`, `actionpanel` | On `encounterStart` the player gets the prompt; their own number is hidden on their screen only until thrown or 8 s; the fight never waits |
| D3 | **The finger throw**: press, spin, fling; launch from the finger; steering to the sent face; the late reply and refusal; "Throw my dice with a flick" | `dice.js` (`tray`, the tumble), `app.js` (`act` hands the faces to the flying die), a unit test (1,000 gestures, every die, the resting face is the sent face) | `dice`, `armed` | Under `throw`, a flick sends the action at release and the die rests on the event's face; a slow release is a tap; a refused action fades the die with the reason |
| D4 | **Calmer throw and dice looks** (round 2): the tumble of Decision 9's list (no scale bounce, no random numerals, two hops, a rock), translucent drawing, `hextable.diceLook` with the free starters, the primary-colour picker with its unreadable-pair rule, the preview die | `dice.js` (drawing and the look), `settings.js`, `themes.js` untouched (a look is not a theme), a unit test (every free look's number contrast above 3:1; an unreadable pair is refused) | `dice` | A translucent blue d20 shows the board through it; no frame of a throw draws a numeral that is not on a face turned up; Yellow on White is greyed with its reason |
| D5 | **Roll dice** (client), after E-M2: the picker on the Dice screen, the token's press and hold, the throw zone with the chosen dice, the log line and title | `dice.js`, `app.js`, `drawer.js` (the Dice screen), `logview.js`, tests | `dice` | 2d6 + 1 to the table shows the same faces on every screen and in the log; "Only the DM" is seen by the roller and the DM only; refused while a reaction waits, with the reason |
| E-M2 | **Engine: `freeRoll`**, a plain roll from the seed that changes nothing else (Decision 8b) | `engine/` (a handler in `rolls.js`'s domain or a small new module under `engine/`), `engine.js` (dispatch and the validation order: refused while a question waits), `view.js` (sent to all, or to the roller and the DM), `packages/server/README.md`, tests | — | Replay gives the same faces; undo takes it back; a player is never sent another player's `to: 'dm'` roll; 21 dice, a d7, a bonus of 21 are refused and change nothing |
| M8 | **The arc, the strip, the symbols and the names** (rounds 3 and 4; round 4: a few places, the sheet leaves room for the die, which stays where it is (round 6), ‹ › on the strip, Setup's sections): the symbol set as one module (`client/symbols.js`, inline SVG strings, `currentColor`), the arc on a quick tap with its rings per position and More, labels after 3 s and the setting, the strip across the top of every screen, every heading its own name, the handle as the phone's close control | `drawer.js`, `symbols.js` (new), `style.css`, `settings.js`, a test that every place has a symbol and an accessible name | `drawer`, `settings`, `keys` | At 390 x 844 the arc at bottom centre has 14 slots on the screen, none under 44 px; at bottom left 15; labels appear after 3 s and at once to a screen reader; no phone screen has a × |
| M10 | **One accordion for every page with sections** (rounds 4 and 5): Setup's seven sections, the character's six (with the compact status block), Roll dice, Log and chat, DM tools; one open at a time with the bars pinned above and below; tips shown only with none open; the no-overshoot test (R20); Leave with its confirm, the Dice row from Roll dice; and the closing test (every state, at both sizes, by the die, the map and Escape) | `settings.js`, `drawer.js`, `style.css`, a smoke pass `menuclose` | `settings`, `drawer` | All seven bars and 120 px of the open section fit at 390 x 844; no state fails to close |
| M9 | **Arrange**: hold a symbol, Setup › Arrange, drag by six dots, ▲ ▼, hide, Reset order; the four that cannot be hidden | `drawer.js`, `settings.js`, a test for the order and the fixed four | `drawer` | A dragged order survives a reload; Setup, Help, Leave and the character cannot be hidden |
| D6 | **Many dice**: separate paths, hops, friction, glancing, nudging apart, flat rest, the fade; the 1 s hold on the die for the fidget die (device random numbers, in the client only; never sent, never logged) | `dice.js`, `app.js`, a unit test (100 throws of 12 dice: no two resting dice overlap; every resting die's face is the sent one) | `dice` | 6d20 + 1d100 + 2d6 rests as 10 separate dice at both sizes |
| E-M3 | **Engine: foes' health for players, a table rule** (`settings.foeHealth`: `hidden`, `rough`, `exact`; Decision 7a) | `engine/dm.js` (`SETTINGS`), `migrate.js` (the next state version), `view.js` (the fraction under `exact`, seen creatures only), tests | — | Under `rough` no player message holds a foe's fraction; under `exact` a seen goblin's fraction is sent rounded to tenths and a hidden one's id is in no player message |
| M7 | **Health bars** (client): the device preference, Rough's half bar with a notch, Hidden, the DM's setting in DM tools and in Setup; Exact once E-M3 is in | `render-three.js`, `three-build.js` (`hpFraction`), `settings.js`, `app.js` | `three-parity`, `actionpanel` | Each of the three rules draws as said at both sizes; the party's bars stay exact |
| E-M1 | **Engine: initiative as a question under `throw`** (optional, owner question 7) | `engine/resolve.js` (`startEncounter`), `engine/shared.js` (`ask`), `engine.js` (the new action `throwInit` in the validation order), `view.js` (`viewPrompt`), `packages/server/README.md`, tests | — | A fight on `throw` waits for each connected player's throw; each roll is made at the answer from the seed; undo of an answer gives the question back; the DM's Throw the rest answers all; replay is exact |

M1 first, then M2 and M3; M4 to M6 in order (they share `actionpanel.js` and `app.js`); D1
to D3 can run beside M4 to M6 (they touch `dice.js` and only small parts of `app.js`; one
at a time with M6). D4 can come at any time; E-M2 then D5 once the owner agrees; M7 at any time (its Exact after E-M3). E-M1
waits for the owner. `player-screen.md`'s remaining stages fold
in: P2 into M4, P3 into M6, P4 (reach edge) and P5 (now: the Dice screen and Log and chat
replace the last-thing line, question 6) stand as they are, P6 into M4 (Explore group), P7
and P8 into M6 and M3.

## Risks

- **Hidden means forgotten.** A player who cannot see their Hit Points or slots may forget
  them. The arc on the token and the status block at the top of the character screen are
  the answer; the play test after M3 should ask.
- **One more tap for common things.** Today Attack is one tap from the panel; now it is the
  token, then the likeliest row (two taps), or a tap on the enemy on the map (one, as now).
  Tapping the map to move and to attack stays one tap: the clean screen plays.
- **Smoke passes everywhere.** Most smoke passes open a tab of the drawer or the panel. M1's
  helper keeps each change to one line per pass; every stage names the passes it changes.
- **The steered die may look wrong** if the reply is slow (a die that rattles too long).
  Measured on the table server in D3; the 2 s rattle and "Waiting for the table…" cap it.
- **The initiative reveal could read as fake.** The words say the game rolled it; the
  setting (question 7) can turn it off.
- **Gestures fight the map.** The throw zone takes touches only on the die; the sheet's
  swipe-down only on its handle; the map keeps every other touch.
- **Free rolls in a serious moment.** A player rolling for fun in a tense fight adds lines
  to the log. They are marked "plain roll" and the log's Rolls filter can hide them
  (`hextable.logFilter`).
- **Paid looks before a shop.** If a paid look were shown greyed with a price before the
  shop exists, it would be a tease; they are not shown until the owner decides (question
  12).
- **Landscape phones and small tablets** get the column shape at its narrowest; checked at
  844 x 390 in M1.

## Questions for the owner

Each has a default; the build follows the default unless the owner says otherwise.

1. **The action groups.** Attack, Cast, Heal, Move, Defend and hide, Use, Features,
   Companions, Reactions in a fight; Explore, Cast, Heal, Use, Rest, Features, Companions
   out of one. *Default: these, in this order.*
2. **Where the menu comes from on a phone.** From the bottom (thumb) or from the side
   (like a shooter's pause menu, as on a wide screen)? *Default: from the bottom on a
   phone, from the side on a wide screen.*
3. **At the start of my turn, open my character by itself?** *Default: no; the token's
   ring lights, the banner shows, and one tap opens Character. A setting turns it on.*
4. **Hit Points on the token.** A thin arc round the die for the selected character?
   *Default: yes.*
5. **How long rolls stay.** *Default: 3 seconds; 1.5, 6 and "until I tap" in Setup.*
6. **The "last thing that happened" line** from `player-screen.md` (one line of the log
   over the map). Keep it on the clean screen, or rely on the dice staying and the Log?
   *Default: drop it from the clean screen; Log and chat shows "2 new" on the first level.*
7. **Initiative.** On the default dice (`auto`), a "throw to see it" prompt (the game has
   already rolled); on a table set to "thrown by whoever acts", should the fight wait for
   each player's throw (engine change E-M1)? *Default: the reveal prompt on, thrown for the
   player after 8 s; E-M1 built after the client stages.*
8. **Camera buttons.** Hidden on the clean screen (drag and pinch turn and zoom the map;
   keys and the wheel on a computer)? *Default: hidden; Setup brings them back.*
9. **Should others see my flick?** Sending the gesture would let every screen see the die
   fly the way I threw it, for one more small message per throw. *Default: no; others see
   the die thrown from my side, as today.*
10. **The token's place.** *Default: bottom centre; bottom right and bottom left in Setup.*

Added in round 2:

11. **Which dice looks are free?** *Default: translucent blue (the default look), six
    simple solids, and primary colours with a chosen number colour are free; other
    translucent colours, swirls, metals, gemstones and theme sets are for sale later.*
12. **The shop for dice looks** (accounts, payment, refunds, the phone stores' rules, who
    makes the art): a separate decision and its own design. *Default: not designed now; paid
    looks are not shown until it is decided.*
13. **The slower slide for prompts too?** The menu now slides in 0.72 s. *Default: the
    menu only; a reaction question, the aim bar and the throw zone stay quick (0.22 s) so a
    question never makes anyone wait.*
14. **Should everyone see my dice look?** *Default: not in the first build (each screen
    draws others' dice in their party colour); later, sent with the table's list of
    players, not in the game state.*
15. **Plain rolls: who sees them by default?** *Default: the table for a player's roll,
    only the DM for the DM's own; the roller can switch each time.*
16. **Press and hold on the token.** *Settled in round 3 by the owner: holding the die for a
    second throws the last roll for fun (Decision 1).*
17. **Health bars: always, or only in a fight?** *Default: always, as today; the device
    setting offers "In a fight" and "Never".*
18. **Foes' health for players.** *Default: Rough (full, half, empty, from the words players
    are sent today); the DM can choose Hidden, or Exact once E-M3 is built.*

Added in round 3:

19. **The names of the two groups.** *Default: Set A, "Play" and "This game".*
20. **The arc's capacity before More.** *Default: as in Decision 4c (14 at bottom centre on
    a phone, 15 in a corner); More holds the rest.*
21. **Labels after 3 seconds, or always?** *Default: after 3 seconds; "Always" in Setup.*
22. **Holding the die to throw for fun: who sees it?** *Settled by the owner in round 6: only
    the person holding it (the fidget die).*
23. **Should the DM be able to hide DM tools from the arc?** *Default: yes from the arc,
    never from the strip.*

Added in round 4:

24. **The few places.** *Default: your character(s), Turns, Roll dice, Log and chat, Setup,
    and DM tools for the DM; everything else in Setup.*
25. **Setup's sections and their order.** *Default: Display and controls, Dice, The menu,
    Characters and packs, The table's rules, Help and about, Leave the table.*
26. **One section open at a time, or several?** *Default: one; the bars before and after
    stay pinned, which only works with one.*
27. **Handouts inside Log and chat**, not a place of their own. *Default: yes; the Waiting
    card and the Log symbol's badge say when one arrives.*

Added in round 5:

28. **The character's six sections** (Attack and cast, Move and defend, Heal, Features and
    reactions, Inventory, Sheet; exploring: Explore, Cast, Heal and rest, Features,
    Inventory, Sheet). *Default: these.*
29. **On my turn, open the character's page on "Attack and cast"?** *Default: yes; at other
    times it opens on what was open last.*

Added in round 6:

30. **Should the fidget remember the last dice it threw?** *Default: no; the dice chosen in
    Setup › Dice › Fidget die always win.*
31. **Tapping someone else on Turns on a wide screen: keep the menu open?** *Default: yes on
    a wide screen (the map is visible beside it); on a phone the menu clears.*

## Amendment: the d20 confirms (#750)

Owner's answers in #750 (24 November 2026, final). This section amends the parts named in
point 4. Where it and the rest of the spec differ, this section wins. The build is a
separate pull request and follows this section.

1. **The d20 is the confirm button.**
   - While an action waits for confirmation, the die's ring pulses slowly.
   - With reduced motion the ring is steady instead.
   - A tap on the die confirms. On a computer, Enter confirms.
   - The aim bar's Go button goes away, because the die does its job.
   - Desktop and phone work the same way.
   - The waiting ring must look different from the turn ring and the health arc (Decision 1).
     It also has a word: the spoken name says what waits, for example "Confirm Fire Bolt".
   - Nothing is sent before the confirm. A confirm sends the action through `apply()`, as the
     same action is sent today.

2. **Targeting.**
   - Pick a spell that needs a target. Tap each target on the map.
   - Double-tap a chosen target to de-select it. Then tap the die.
   - A note at the top of the screen counts the choice: "2 of 4 targets". It is not at the
     bottom.
   - With fewer targets chosen than the most the spell or attack allows, the die confirms with
     what is chosen.
   - With none chosen, the die does nothing. The note says so: "No target yet: tap one, then
     the die."
   - The choices are a draft on the device until the die is tapped. A refused confirm changes
     nothing, and the choices stay on the screen with the reason.

3. **The small prompt and confirm popup by the die goes away.** Its choices appear on the
   character's sheet. An option that can be used now is highlighted. An option that cannot be
   used is greyed out, and its reason is said in words (Decision 7's "greyed things say why").

4. **What this replaces.**
   - Decision 1, "What a quick tap does": while an action waits for confirmation, a tap on
     the die confirms. It does not fan out the arc. At other times the arc works as written.
   - Decision 2, row 3 (the aim bar): the die is no longer hidden behind the aim bar while an
     action waits. The aim bar keeps its text and Cancel only.
   - Decision 3, "Closing, always": in the waiting state a tap on the die confirms and does not
     close the menu. A tap on the map and Escape still close it. The closing test (M10) must
     allow for this state.
   - Decision 7, the "Aiming" row: the words "Cancel, Cast" become the note and the die. There
     is no Cast button.
   - Decision 11, keys: Enter on the die confirms when an action waits, as it throws a die
     in the throw zone today.
   - "Every control today", the "Hint and aim bar" row: `#hint-go` goes. The other controls in
     that row stay.
   - Decision 3, "Choosing a row that arms an action closes the menu": unchanged, unless point 5(b)
     settles otherwise.

5. **Open points for the build to settle.**
   - (a) Where the choices sit on the sheet on a phone. The sheet is one accordion (Decision
     4d). The choices could be a section at the top of the page, or the section that holds the
     armed row could open. Check it at 390 x 844 with the status block compact.
   - (b) Whether arming still folds the menu. If the choices are on the sheet, the sheet has
     to be open for the player to use them, and Decision 3 would have to change.
   - (c) Double-tap against the map's own gestures. A double-tap is two taps close together in
     the same place, so the build sets the time window and the distance. A drag, or a pinch
     with two fingers, is never a tap. A drag that starts on a target still pans the map.
   - (d) A double-tap on a target that is not chosen. The build says what it does; the simplest
     rule is that it chooses the target once.
   - (e) Order at the top of the screen. The offline bar (Decision 1) and the "Your turn"
     banner (Decision 5) also sit at the top, next to the note.
   - (f) Turn ring and waiting ring together. On my turn both can be lit. They differ by a
     shape or a word, not by colour alone.
   - (g) The engine. The build checks whether the engine accepts fewer targets than the most a
     spell allows. This section does not assume it does. If it does not, the change is an engine
     amendment and goes back to the owner.
   - (h) Computers. A double-click on a target de-selects it. The build checks that this does
     not clash with Shift+click for dice (Decision 8b).
   - (i) Keyboard. How targets are picked with the keys is not settled here.
   - (j) Throws. Whether an attack waiting to be thrown under the `throw` rule (Decision 9) also
     uses the die as its confirm. This section leaves the throw zone as it is.
   - (k) A hold on the die during a confirm. Whether it still pops up the fidget die
     (Decision 1) is not settled here.
