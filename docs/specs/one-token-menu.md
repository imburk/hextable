# Spec: one token, one menu, a clean screen; dice that stay, say whose, and can be thrown

Status: draft by an agent, to be reviewed by the design owner. Issue #527. A design job:
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
| That something is waiting for me (a reaction, a roll, a handout, a note) | A badge on the token with a number, and the question itself if it must be answered (it opens on its own, as today) |
| How hurt my character is | A thin arc round the token: the selected character's Hit Points, in the theme's good colour turning to bad below half; the number in the token's spoken name (question 4) |
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

### Every control today, and where it goes

"Today" is `packages/client/index.html` and the modules that fill it. "Goes to" uses the
names of the new menu (the tree is below). Every id is kept when its element moves, so
`$('log')`, `renderSheet` and the smoke passes keep their handles (the build stages say
which smoke passes change).

| Today | Where | Goes to |
|---|---|---|
| Status box: `#mode` (Exploring / Round N), `#clock` | `#top` | **The turn line** above the token in a fight; the clock in the header of **Turns** (Party) and of **Log and chat**. Out of a fight nothing is shown on the map |
| Undo (DM) `#btn-undo` | `#top` | **The DM's undo chip**: a small "Undo" beside the token for 8 s after each action the DM sends, and always as the first row of **DM tools**; Ctrl+Z as now. (`table-ui.md`: undoing must be one tap; the chip is one tap) |
| Menu button `#btn-menu`, `#menu-badge` | `#top` | **The token** (it keeps the id `#btn-menu`, so the drawer's handles and `aria-controls` still hold); the badge goes on the token |
| Order strip `#order` | under `#top` | **The turn line** (whose turn, mine in N) and the **Turns** screen. A tap on the turn line opens Turns |
| Hint and aim bar `#hint`, `#hint-text`, `#hint-pick`, `#hint-go`, `#hint-cancel` | over the map | **The aim bar**, at the bottom, where the token is (`player-screen.md` Decision 4). While something is armed the aim bar *is* the one overlay; the token hides behind it and Cancel brings it back |
| Camera buttons `#cam` (⟲ ⟳ + −) | right edge | **Hidden by default.** The map already turns and zooms by touch (drag, pinch) and by keys and wheel. Setup › Controls › "Camera buttons on the map" (off) brings them back for whoever wants them; the one-finger way to turn the map without the buttons is Setup's buttons too (question 8) |
| `#pace-wait` ("…", skip a beat) | dock | A small **Skip** pill beside the token while a beat plays under the pace "wait" |
| Party chips `#party` | dock | **The character switcher** at the top of the Character screen: "Wren ▾" lists the characters this person controls (solo: the whole party). Also: a tap on one of your own pawns on the map selects it, as now |
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
  turn. Wren, 6 of 8 Hit Points. 1 waiting."), `aria-expanded`, `aria-controls`.
- **Where.** Bottom centre by default, 16 px above the safe area. Setup › Controls › "The
  menu token sits": **bottom centre**, **bottom right**, **bottom left** (left-handed).
  On a wide screen the same three; bottom centre by default.
- **What it wears.**
  - the **Hit Points arc** of the selected character (question 4);
  - a **badge**: the number of things waiting for this person (handouts, notes, the DM's
    waiting players and an undecided conclusion: today's `#menu-badge` sum);
  - on **my turn**, a ring in the accent colour that pulses once at the start of the turn
    (not under reduced motion) and stays lit;
  - **offline**: greyed with a crossed mark.
- **What a tap does.** Opens the menu where it was last left (the character screen, most of
  the time), or on the **Character** screen at the start of my turn (question 3). A
  second tap on the token closes it.
- **A press and hold** (500 ms, the finger still) on the token opens the **Dice** screen
  (the last rolls). It is a shortcut only: Dice is on the first level. There is no free
  "roll a die for fun": a number the engine did not make has no place on the table.

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
  right on a screen goes back one level; a swipe down on the sheet's handle closes it all.
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

### Decision 4: the tree

The same tree at both sizes. First level, top to bottom:

```
 ┌───────────────────────────────────────────┐
 │ (sigil) Wren                     6/8 HP ›  │  Character   ← always first; the symbol of the character
 │         Wizard 1 · Your turn               │
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
 ‹ Menu   Wren ▾                                   (switch character)
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

**Turns** (the tracker, `tracker.js`, unchanged inside): header "Round 2 · Goblin Warrior
2's turn · you in 3"; rows as built, with **"You"** under each of the viewer's own
creatures and their initiative roll shown as a die glyph with the number. Tapping a row
selects the creature and moves the camera; on a phone it also clears the menu.

**Dice**: the last rolls (Decision 8), and the dice settings in one place (they also live
in Setup).

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
│ ‹ Menu   Wren ▾                  │   │ ‹ Wren   Cast                    │
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

- **Phone, below 900 px wide:** the sheet rises from the bottom to `calc(100% - 12vh)`;
  one level shown; levels push from the right; a breadcrumb row on top (48 px, the "‹"
  is a 48 px target); the sheet's own handle (a short bar) closes it on a swipe down. The
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

- **Slide (default).** Phone: the sheet rises in 220 ms (ease-out), falls in 160 ms; a
  level pushes in from the right in 180 ms and the old one moves 30 % left and dims.
  Wide: each column slides out from the left in 200 ms, 40 ms after the one before it
  (the shooter's stagger). The scrim fades in with the sheet. Closing is quicker than
  opening on purpose: giving the screen back should feel instant.
- **Just appear.** Setup › The menu › "Menus: **Slide in and out** / **Just appear**"
  (`hextable.menuMotion`: `slide` | `appear`), a device preference like the theme. With
  `appear`, every sheet, column, level, card and prompt is shown and hidden with no
  movement and no fade.
- **Reduced motion** (`prefers-reduced-motion: reduce`) means `appear` whatever the
  preference, and no pulse on the token.
- Nothing waits for an animation: a tap during a slide acts on where things will be.

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
| **DM, any state** | the undo chip beside the token for 8 s after each action | badge = waiting players etc. | DM tools on the first level |

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

**Landing on the engine's result.** The rule of `dice.md` section 1 stands: the face shown
is the face the engine sent. Two cases:

| Table rule `diceThrow` | When is the result known | How the die lands on it |
|---|---|---|
| `throw` | **At release.** The action is sent at release (as built: "the action is sent at the throw"). The reply comes back in one round trip (solo: at once; online: typically under 300 ms) | The die flies on its own path with no target. When the faces arrive, the client works out the orientation that puts the sent face up (and upright toward the camera, `dice.md` 5.2), and **steers** the tumble: over the remaining flight, but at least the last 0.35 s, the die's angular velocity is blended toward the rotation that reaches that orientation at the planned resting time. The eye sees a die that tumbles and settles; the face is the engine's. If the reply is later than the planned rest, the die keeps rolling and rattles on the board up to 2 s, then rests face-down and shows "Waiting for the table…" until it comes. If the action is **refused**, the die fades and the reason is shown, as any refusal |
| `auto` | **Before the throw** (the engine already rolled: e.g. initiative, a save inside a monster's action) | The target is known at release: the steering starts at once; the path still follows the finger |

The finger's speed and spin choose only the path; they never reach the engine and never
choose a face. No physics library is added: the flight is the existing scripted tumble with
the launch point, launch velocity and spin taken from the gesture, a ground plane, three
bounces with restitution, and the steered last bounce (`dice.js`; a unit test holds that the
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
| Token, spoken | Menu. Your turn. Wren, 6 of 8 Hit Points. 1 waiting. |
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
| Setup, dice | Rolls stay on the board: 1.5 seconds / 3 seconds / 6 seconds / Until I tap · Throw my dice with a flick |
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
| M3 | **The clean screen.** `#top` goes (status to the turn line, undo to the DM's chip); `#order` to the turn line; `#cam` behind its setting; the feedback icon to Help and feedback; `#party` and `#card` leave the dock (the action panel lives in the menu from now; until M4 its tabs are shown as they are inside the Character screen) | `index.html`, `app.js`, `feedback.js`, `style.css`, `actionpanel.css` | `actionpanel`, `paneltabs`, `controls`, `feedback`, `multiplayer` | At 390 x 844 exploring, nothing but the map and the token; in a fight, the turn line; the old order strip is gone and Turns opens from the turn line |
| M4 | **The character cascade.** The status block with the turn bar (absorbs `player-screen.md` P2); the switcher; the action groups of Decision 4 from the existing rows; the turn bar's filter screens; the likeliest row inline; level-3 screens for formation, class-feature pickers, the short rest | `actionpanel.js` (`groupsFor(S, e)` beside `tabRows`), `classes.js`, `formation.js`, `companions.js`, `grapple.js` (host element only), `actionpanel.css`, tests for the grouping | `actionpanel`, `paneltabs`, `formation`, `companions`, `grapple` | Every row that a tab showed is in at least one group (a test walks the four sample characters and compares); a greyed group says why; a healing spell is in Cast and Heal |
| M5 | **Inventory and Sheet sections**; Log and chat with Say; DM tools as level-3 screens; Setup's new groups | `actionpanel.js` (items), `app.js` (`renderSheet` split), `logview.js`, `handouts.js` (Say box), `settings.js`, `index.html` (DM sections wrapped) | `log`, `items`, `dm`, `scenes` | A player can say a line out of character from Log and chat; every DM section is reachable in three taps |
| M6 | **The states of Decision 7**: the banner, the token's ring and arc, "you in N", down and dead lines, badges, offline | `app.js`, `drawer.js`, `linkdot.js`, `style.css` | `reactions`, `link`, `multiplayer` | "you in 3" counts right with an unseen slot; the banner shows once a turn; offline greys the token and every row says why |
| D1 | **Dice stay and say whose**: `hextable.diceHold`, resting rows, the colour band, "You", the separate own initiative die, the Dice screen | `dice.js` (`hold`, titles), `app.js`, `settings.js`, a `dice.js` test for the titles | `dice` | With "Until I tap", a roll stays until a tap; the viewer's own initiative die is thrown on its own with "You (Wren)"; no title holds a number the view did not send |
| D2 | **The initiative prompt (reveal)** under `auto` | `dice.js`, `app.js` (`encounterStart`), `tracker.js` (the held row) | `dice`, `actionpanel` | On `encounterStart` the player gets the prompt; their own number is hidden on their screen only until thrown or 8 s; the fight never waits |
| D3 | **The finger throw**: press, spin, fling; launch from the finger; steering to the sent face; the late reply and refusal; "Throw my dice with a flick" | `dice.js` (`tray`, the tumble), `app.js` (`act` hands the faces to the flying die), a unit test (1,000 gestures, every die, the resting face is the sent face) | `dice`, `armed` | Under `throw`, a flick sends the action at release and the die rests on the event's face; a slow release is a tap; a refused action fades the die with the reason |
| E-M1 | **Engine: initiative as a question under `throw`** (optional, owner question 7) | `engine/resolve.js` (`startEncounter`), `engine/shared.js` (`ask`), `engine.js` (the new action `throwInit` in the validation order), `view.js` (`viewPrompt`), `packages/server/README.md`, tests | — | A fight on `throw` waits for each connected player's throw; each roll is made at the answer from the seed; undo of an answer gives the question back; the DM's Throw the rest answers all; replay is exact |

M1 first, then M2 and M3; M4 to M6 in order (they share `actionpanel.js` and `app.js`); D1
to D3 can run beside M4 to M6 (they touch `dice.js` and only small parts of `app.js`; one
at a time with M6). E-M1 waits for the owner. `player-screen.md`'s remaining stages fold
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
