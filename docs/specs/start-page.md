# Spec: the starting page, Play and Tools

Status: draft by an agent, to be reviewed by the design owner. Issue #356. A design
job: this spec and a clickable picture, [`mockups/start-page.html`](mockups/start-page.html)
(open the file in a browser; nothing in it runs the game). No code is written by this
spec.

The owner, 15 November 2026, looking at today's lobby:

> let's resort the starting page. ... figure out what info is needed and the best way
> to make it. I'd recommend a tools category even if they're not available yet. People
> should be able to create characters, create maps, build modules, etc. without
> spinning up an adventure. I'd expect the same mechanics behind the scenes but
> mentally they're different tasks.

It is written in the style of `table-ui.md`: where we are, the options, the choice and
its reasons, the words, the build in stages, risks and questions.

## Rules that bind this design

- **Presentation only.** Nothing here changes a rule, an action, the state or the
  server. Every tool on the page opens a screen that exists or will exist; a tool
  that needs a game gets a *local* engine of its own (the `localTransport` that solo
  already uses), so "the same mechanics behind the scenes" holds literally.
- **Everything goes through `apply()`.** A map made without a game is made by the
  editor's own actions in a private local game, never by writing a map document on
  the side.
- **Phones are first-class.** Every layout is given at 390 x 844 and 1280 x 800.
  Targets are at least 44 px. Nothing depends on hover. Every greyed or "coming"
  thing says why in words on the screen.
- **Themes restyle only.** All colour, type and radius come from the tokens in
  `themes.js`. The mockup copies the three themes' tokens and can switch between them.
- **Plain words.** "5E compatible"; no trademarked game name. No tool is described
  as more than it is.

## The people and their jobs

Who arrives at the start page, to do what, how often, on what, and what each must
be asked. "Name" is the name the other people at a table see.

| # | Person and job | How often | Device | Must be asked | Today's taps (phone) |
|---|---|---|---|---|---|
| 1 | **A player with a code from a friend** ("we're on, the code is KX7Q2M") | Every session, the commonest job | Phone, often in a hurry | Table code, name | Type name, type code, Join: 1 tap. The name field is above the map and grid choices she does not need |
| 2 | **That player again, next week**, same table | Every session | Phone | Nothing | Rejoin: 1 tap (the box sits under Host and Join) |
| 3 | **A DM hosting** for friends | Every session | Laptop | Name; map and grid if not the usual | Name, map, grid, Host a table: 1 tap |
| 4 | **Someone alone who wants to try it** | Once | Either | Nothing | Play solo on this device: 1 tap, but the button is the eighth thing on the card, under fields that do not apply |
| 5 | **A returning solo player** | Often | Either | Nothing | Continue solo game: 1 tap, same place |
| 6 | **A player making a character tonight** for Saturday's game | Now and then | Either | Nothing until the character is saved | Solo party (a heading that does not say "characters") > My characters > New character: 3 taps, and nothing tells her the way is under "Solo party" |
| 7 | **A DM preparing a map** with no session running | Before sessions | Laptop | Nothing | Not possible without a game: Play solo, then Menu > DM > Edit map; the map is made inside her saved solo game |
| 8 | **A DM building an adventure, homebrew, a market or an atlas** | Rare, long sessions | Laptop | Nothing | Not built |
| 9 | **Anyone looking for About, Settings, the version** | Rare | Either | Nothing | About Hextable: 1 tap; Settings is a tab of the drawer About opens |

Three things follow. **The name is needed by jobs 1 and 3 only**, and today it is the
first field everyone sees. **The map and grid are needed by jobs 3 and 4 only**, and only
when the default will not do. **Jobs 6 to 8 are making things, not playing**, and today
they have no place of their own.

## Where we are

### The lobby today

`packages/client/index.html` `#lobby` > `#lobby-card`, wired in `app.js` (`showLobby`,
the `#lobby-*` handlers near the end), with the map and grid from `tablecontrols.js`
(`lobbyChoice`, `lobbyGrid`) and the party from `mycharacters.js`. One column, in this
order: the title and a line; **Your name**; **Starting map (when you host or play
solo)**; **Valley on squares / Valley on hexes**; **Host a table**; **Table code** and
**Join**; the remembered table (**Rejoin**, **Forget**) when there is one; **Solo party
(4): Brenna, Pip, Odessa, Tavin**, a disclosure holding the party and **My characters
(n)**; **Play solo on this device** (or **Continue solo game** and **New game**); a
status line; **About Hextable**.

Looked at in headless Chromium at 390 x 844 and 1280 x 800 (screenshots in the PR):

- Everything is visible on a first visit, but in the order of the form, not of the jobs.
  Three primary-coloured buttons (Valley on squares, Host a table, Join) compete; the
  solo button, the job of every first-time visitor, is a quiet button near the bottom.
- **My characters is hidden** inside "Solo party". Someone who wants a character for a
  table game has no reason to open a solo setting.
- **On a short screen the bottom cannot be reached.** `#lobby` is a fixed full-screen
  layer that centres the card and does not scroll, and the body does not scroll either.
  At 390 x 500 (a phone held sideways, or a small phone with its keyboard up) the card
  is 640 px tall: Play solo and About sit below the screen with no way to scroll to them.
- **Tab order leaks behind the lobby.** After About, Tab goes on to the top bar's burger
  and the camera buttons of the game underneath the dark layer.
- The top bar's "Exploring" box and the burger show through the dark layer above the card.
- On load, focus goes to Rejoin or the solo button (a good choice for keyboards; on a
  phone it raises no keyboard).
- **No server, no lobby.** The GitHub Pages build has no table server: `app.js` asks
  `./api/ping`, gets nothing, and starts the solo game at once. A visitor there never
  sees the lobby, so there is no way to My characters at all.

### The tools that exist, and where

"Opens without a game?": **yes**, it opens from the lobby today; **small change**, it
works but only inside a game, and a client change can open it without one;
**not built**.

| Tool | Where it lives | How you get to it today | Opens without a game? |
|---|---|---|---|
| My characters (list, rename, duplicate, export, delete) | `mycharacters.js` (`initMyCharacters`, panel `#mychars`), `mycharacters.css` | Lobby > Solo party > My characters | **Yes** (hidden under Solo party) |
| Build a character (class, level, scores, feats, spells) | `buildsheet.js` (`openBuild({ mode: 'mine' })`, panel `#qb`) | My characters > New character, or Edit | **Yes**, through My characters |
| Import a character file (`.hextable-character.json`) | `mycharacters.js` (`parseFile`) | My characters > Import a file | **Yes** |
| Import from Fantasy Grounds (`.xml`) | `importfg.js` (`initImport`, `readImport`), opened from `quickentry.js` | In a game, as the DM: Menu > DM > Quick entry > Import | **Small change**: `readImport` is pure and `makeFile(sheet, { how: 'imported-fgxml' })` exists; My characters needs the button and the report shown once (`portable-characters.md`, "The start screen") |
| Quick entry (type a stat block by hand) | `quickentry.js` | In a game, DM | No, and it should not: it adds a creature to a table |
| Map editor (paint, walls, doors, rooms, height, levels, start) | `editor.js` (`Editor`, `#editor`) | In a game, DM: Menu > DM > Edit map (`#dm-edit`) | **Small change**: it edits the map of a game through `apply()`. A private local game with its own storage key gives it one (Decision 3) |
| Trace a map from a picture; import Universal VTT | `editor.js` (tools Trace, Levels, Map file; `import-uvtt.js`) | Inside the map editor | **Small change**, with the editor |
| Stock maps | `content/maps/`, the lobby's Starting map select, DM panel, editor | Lobby, DM panel, editor | Yes (it is a choice for a game, not a tool) |
| Adventure modules: add, save as module, assemble | `adventure-module.md` (A1 to A17; Decision 10: save as module from a table, `npm run adventure`) | — | **Not built** |
| Homebrew: pack manager and builder | `homebrew.md` (pack manager screen, Decision 7 builder) | — | **Not built** |
| Markets and loot packages, "My markets" | `shops.md` P7 ("from the lobby, My markets") | — | **Not built** |
| World atlas: pins, routes, nodes | `travel.md` W5b, Decision 13 (in the game, DM); world pack files made outside | — | **Not built** |
| Join with a character from this device | `portable-characters.md` P8 | — | **Not built** (needs P4, P5 on the server) |
| Find a game (a public list of tables) | `portable-characters.md` Decision 8, the official service | — | **Not built**, a separate project |
| Settings | `settings.js`, the drawer's Settings tab | Lobby > About Hextable, then the Settings tab | Yes, by a side door |
| About, the version | `about.js`, the drawer's About tab | Lobby > About Hextable | Yes |
| Send feedback | issue #353, a chat icon in a corner of every view, the lobby included | — | Being built by another job |

## The layouts considered

Four layouts, each judged on the same five points: what a first-time visitor
understands in five seconds; taps to the commonest jobs on a phone; whether the name
field stands in the way of people who do not need it; how "coming" tools are shown;
how it grows when shops, travel, modules, homebrew and a public game list arrive.

In every layout below **the name moves next to Join and Host**, **the map and party
become a one-line summary with Change**, and **About and Settings move to a footer**.
Those three are not in question; the layouts differ in how Play and Tools are shown.

### Layout A: two tabs, Play and Tools

```
 390 x 844                              1280 x 800
┌──────────────────────────────┐      ┌──────────────────────────────────────────────────────────┐
│ Hextable                     │      │ Hextable   A 3D tabletop for 5E compatible play          │
│ ┌────────────┬─────────────┐ │      │            ┌───────────┬───────────┐                     │
│ │ ▣ Play     │   Tools     │ │      │            │ ▣ Play    │  Tools    │                     │
│ └────────────┴─────────────┘ │      │  ┌─────────────────────────┐ ┌─────────────────────────┐ │
│ Play with others             │      │  │ Play with others        │ │ Play alone              │ │
│ Your name [ Isaac        ]   │      │  │ Your name [          ]  │ │ Your party and the      │ │
│ Table code [ KX7Q2M ][Join]  │      │  │ Code [      ] [ Join ]  │ │ monsters, on this device│ │
│ ─── or ───                   │      │  │ [ Host a table ]        │ │ [ Play alone ]          │ │
│ [ Host a table ]             │      │  │ Map: valley, squares ›  │ │ Party: Brenna, Pip… ›   │ │
│ Map: The starter valley ›    │      │  └─────────────────────────┘ └─────────────────────────┘ │
│ Play alone                   │      │                                                          │
│ [ Play alone ]               │      │                                                          │
│ Party: Brenna, Pip, … ›      │      │                                                          │
│                              │      │                                                          │
│ Settings · About             │      │  Settings · About · Build 15 Nov 2026, 11:13 (#354)      │
└──────────────────────────────┘      └──────────────────────────────────────────────────────────┘
```

- **Five seconds:** "this is for playing; there is something called Tools". What
  Tools holds is unknown until tapped.
- **Taps:** join 1 (after typing), rejoin 1, continue 1, new solo 1, host 1, My
  characters 2, make a map 3.
- **Name:** only on the Play tab, next to Join and Host. Good.
- **Coming tools:** on the Tools tab, out of the way. Good for calm, bad for the
  owner's wish that the category be seen.
- **Grows:** well; each tab is a list.
- **Against:** the owner's point is that making things is its own job; a tab hides it
  behind a word. A tab bar also costs 56 px at the top of a phone, and tabs on a page
  that is not an app frame read as a filter people overlook. Rejected.

### Layout B: one page, two groups, and a Carry on band (recommended)

```
 390 x 844, first visit                 390 x 844, returning
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ Hextable                     │      │ Hextable                     │
│ A 3D tabletop for 5E         │      │ A 3D tabletop for 5E …       │
│ compatible play.             │      │ ┌ Carry on ────────────────┐ │
│                              │      │ │ Table KX7Q2M  [ Rejoin ] │ │
│ PLAY                         │      │ │               Forget     │ │
│ ┌ Play with others ────────┐ │      │ │ Solo game     [Continue] │ │
│ │ Your name [            ] │ │      │ └──────────────────────────┘ │
│ │ Table code               │ │      │ PLAY                         │
│ │ [ ABC123     ] [ Join  ] │ │      │ ┌ Play with others ────────┐ │
│ │ The six letters your DM  │ │      │ │ Your name [ Isaac      ] │ │
│ │ gave you.                │ │      │ │ [ ABC123   ] [ Join  ]   │ │
│ │ ── or be the DM ──       │ │      │ │ [ Host a table ]         │ │
│ │ [ Host a table ]         │ │      │ │ Map: The starter valley, │ │
│ │ Map: The starter valley, │ │      │ │ on squares    Change     │ │
│ │ on squares     Change    │ │      │ └──────────────────────────┘ │
│ └──────────────────────────┘ │      │ ┌ Play alone ──────────────┐ │
│ ┌ Play alone ──────────────┐ │      │ │ [ New solo game ]        │ │
│ │ You run the party, the   │ │      │ │ Replaces your saved game.│ │
│ │ game runs the monsters.  │ │      │ └──────────────────────────┘ │
│ │ [ Play alone ]           │ │      │ TOOLS                        │
│ │ Party: Brenna, Pip, …    │ │      │ Make things for a game. …    │
│ └──────────────────────────┘ │      │ ── fold ─────────────────────│
│ TOOLS                        │      │ My characters (3)          › │
│ Make things for a game. No   │      │ …                            │
│ game needs to be running.    │      └──────────────────────────────┘
│ ── fold ─────────────────────│
│ My characters (0)          › │
│ Make a map                 › │
│ Adventure modules   Coming ▾ │
│ Homebrew            Coming ▾ │
│ Markets and shops   Coming ▾ │
│ World atlas         Coming ▾ │
│ Settings   About             │
│ Build 15 Nov 2026, 11:13     │
│ (after change #354)          │
└──────────────────────────────┘
```

```
 1280 x 800
┌───────────────────────────────────────────────────────────────────────────────────────┐
│  Hextable  A 3D tabletop for 5E compatible play.                                       │
│  ┌ Carry on ───────────────────────────────────────────────────────────────────────┐  │
│  │ Table KX7Q2M, remembered on this device [ Rejoin ] Forget │ Your solo game [Continue] │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
│  PLAY                                              TOOLS                               │
│  ┌ Play with others ─────────┐ ┌ Play alone ─────┐ Make things for a game. No game     │
│  │ Your name [             ] │ │ You run the     │ needs to be running.                │
│  │ Table code                │ │ party, the game │ ┌───────────────────────────────┐   │
│  │ [ ABC123      ] [ Join ]  │ │ runs the        │ │ My characters (3)           › │   │
│  │ ── or be the DM ──        │ │ monsters.       │ │ Make, keep and export …       │   │
│  │ [ Host a table ]          │ │ [ Play alone ]  │ ├───────────────────────────────┤   │
│  │ Map: The starter valley,  │ │ Party: Brenna,  │ │ Make a map                  › │   │
│  │ on squares       Change   │ │ Pip, Odessa,    │ │ Paint or trace a map …        │   │
│  └───────────────────────────┘ │ Tavin   Change  │ ├───────────────────────────────┤   │
│                                └─────────────────┘ │ Adventure modules    Coming ▾ │   │
│                                                    │ Homebrew             Coming ▾ │   │
│                                                    │ Markets and shops    Coming ▾ │   │
│                                                    │ World atlas          Coming ▾ │   │
│                                                    └───────────────────────────────┘   │
│  Settings · About · Build 15 Nov 2026, 11:13 (after change #354)                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Five seconds:** two headings, Play and Tools, both on screen; under Play, "with
  others" and "alone"; under Tools a list that starts with My characters. Measured in
  the mockup at 390 x 844 on a first visit, the Tools heading and its line are on the
  first screen (top at 780 px) and My characters is a short scroll; for a returning
  person the Carry on band pushes Tools below the first screen, which is the right
  trade (their job is in the band).
- **Taps:** join 1 (after typing), rejoin 1, continue 1, new solo 1, host 1, My
  characters 1, make a map 2.
- **Name:** inside "Play with others", the only card that needs it.
- **Coming tools:** rows in the same list, after the ready ones, with the word
  **Coming** and a dashed edge; a tap opens two lines in place saying what it will do
  and what to use until then (Decision 2). Never a dead button.
- **Grows:** Tools is a list (a data array, Decision 4): a new tool is a row; past
  about eight ready rows it gains sub-headings (Characters; Maps and worlds;
  Adventures). Play gains a row for **Find a game** when the online service exists,
  and the Join card gains **Join with a character** (P8). Neither moves anything
  that is there.

### Layout C: a hub of large cards

```
 390 x 844                              1280 x 800
┌──────────────────────────────┐      ┌──────────────────────────────────────────────────┐
│ Hextable                     │      │ Hextable                                         │
│ ┌────────────┐┌────────────┐ │      │ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │  Join a    ││  Host a    │ │      │ │ Join a   │ │ Host a   │ │ Play     │            │
│ │  table     ││  table     │ │      │ │ table    │ │ table    │ │ alone    │            │
│ └────────────┘└────────────┘ │      │ └──────────┘ └──────────┘ └──────────┘            │
│ ┌────────────┐┌────────────┐ │      │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│ │  Play      ││  My        │ │      │ │ My       │ │ Make a   │ │ Modules  │ │Homebr.│ │
│ │  alone     ││  characters│ │      │ │ characters│ │ map     │ │ (coming) │ │(coming│ │
│ └────────────┘└────────────┘ │      │ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│ ┌────────────┐┌────────────┐ │      │                                                  │
│ │  Make a    ││  Modules   │ │      │                                                  │
│ │  map       ││  (coming)  │ │      │                                                  │
│ └────────────┘└────────────┘ │      │                                                  │
│  … 2 more below the fold     │      │                                                  │
└──────────────────────────────┘      └──────────────────────────────────────────────────┘
```

- **Five seconds:** very clear words, but Play and Tools are cards of the same weight;
  a player cannot tell where to type a code.
- **Taps:** join 2 (the card, then the code screen), rejoin 1 with a shortcut,
  continue 1, new solo 1 or 2, host 2, My characters 1, make a map 2.
- **Name:** asked on the Join and Host screens only. Good.
- **Coming tools:** a "coming" card has the same shape and size as a live one; at a
  glance it looks like a dead button, and four of them make the page look unfinished.
- **Grows:** badly on a phone: every tool adds a card and pushes the rest below the
  fold; the commonest job costs an extra tap forever. Rejected.

### Layout D: today's card with a Tools section added at the bottom

The cheapest change. Rejected: the name and map stay first for everyone, Tools is
below the fold on a phone, the short-screen and tab-order faults stay, and "Play"
remains a form rather than three clear jobs.

### How they compare

| | A: tabs | **B: one page, two groups** | C: hub | D: today + Tools |
|---|---|---|---|---|
| First visit, five seconds | Play only; Tools is a word | **Play and Tools, both seen** | Many equal cards | A form |
| Join on a phone | 1 tap | **1 tap** | 2 taps | 1 tap |
| My characters | 2 taps | **1 tap** | 1 tap | 1 tap, below the fold |
| Name in the way of solo and tools | No | **No** | No | Yes |
| Coming tools | Hidden behind a tab | **Rows that explain, after ready ones** | Cards that look dead | Rows at the bottom |
| Growth | Good | **Good: a list and a band** | Poor on phones | Poor |
| Cost | Medium | **Medium** | Medium | Small |

## The recommendation: Layout B

**One page with two groups, Play and Tools, and a Carry on band for people coming
back.** Reasons:

1. **It sorts by what people came to do.** Playing (with others, or alone) and making
   things are separate headings on one screen, which is the owner's "mentally they're
   different tasks" made visible, without hiding either behind a tab.
2. **The commonest jobs stay one tap.** A player types a code and taps Join; a
   returning player taps Rejoin or Continue in the band at the top; a newcomer taps
   Play alone. None of them meets a field they do not need.
3. **Tools are seen, and honest.** The owner wants the category "even if they're not
   available yet". Coming tools are rows that say so in words and explain themselves
   when tapped, below the tools that work, so the page never looks broken.
4. **It grows by adding rows**, not by re-laying the page: Find a game joins Play,
   each new tool joins Tools.
5. **It is cheap to build without breaking the tests.** Every id the smoke passes use
   (`#lobby-name`, `#lobby-code`, `#lobby-join`, `#lobby-host`, `#lobby-solo`,
   `#lobby-new`, `#lobby-party-sum`, `#lobby-slot-*`, `#lobby-msg`, `#lobby-party-msg`,
   `#lobby-party-store`) stays, visible where the smoke expects it, doing what it does
   today. No engine or server change is needed for the page itself.

### Decision 1: the name, the map and the party

- **The name** is a field inside "Play with others", above the code, shared by Join and
  Host (one name per person; the smoke fills `#lobby-name` then taps either). It is
  remembered on the device (new client key `hextable.name`), so it is typed once. If it
  is empty when Join or Host is tapped, the field is marked and focused with the line
  "Type the name the others will see." (today a blank name silently becomes
  "Adventurer", and a DM with three Adventurers waiting cannot tell them apart).
- **The map and grid** become one line under Host a table and under Play alone:
  "Map: The starter valley, on squares" with **Change**. Change opens a short sheet,
  **Map and party**, holding today's `#lobby-map`, `#lobby-grid` and, for solo, the
  party (`#lobby-party` and its slots). One choice, as today (`TC.lobbyChoice`), shown
  in both places.
- **The party** (solo only) is the line "Party: Brenna, Pip, Odessa, Tavin" with
  **Change**, opening the same sheet at its party part.

### Decision 2: how a tool is shown

Each Tools row is one of three kinds, and says which in words:

| Kind | Looks | A tap |
|---|---|---|
| **Ready** | A row button with a chevron, the tool's name and one line of what it does | Opens the tool |
| **In a game only** (until its stage is built) | A row with "In a game" | Opens two lines in place: how to reach it today ("Start Play alone, then Menu, DM, Edit map.") |
| **Coming** | A row with a dashed edge and the word "Coming"; muted, but the text keeps full contrast | Opens two lines in place: what it will do, and what to use until then. `aria-expanded` |

A coming row is a disclosure button, not a disabled button: it does something (it
explains), so it is never dead, and a screen reader hears "Adventure modules, coming,
collapsed". Ready rows come first, then In a game, then Coming.

### Decision 3: making a map without a game

**Make a map** opens a step with:

- **Continue the map you were making** (when there is one),
- **New map on squares**, **New map on hexes**,
- **Open a map file**,
- **Start from a stock map** (the stock maps' select).

Behind it is a private local game, the **workshop**: `localTransport` with its own
storage key, `hextable.workshop`, so it never touches the saved solo game
(`hextable.solo`). The client sends the editor's own map action for the choice and
starts the editor. The top bar shows "Making a map" and a **Back to the start** button
instead of the table's controls. The editor's **Map file > Export map** keeps the map as a file;
a DM then loads that file in any game with the editor's **Map file > Import map**, as today. No
engine change: it is the solo game's engine, with another key.

One workshop map at a time to begin with; "My maps", a list like My characters, is a
later row if the owner wants it (question 5).

### Decision 4: the Tools list is data

The rows are one array in a new client module, `start.js`:
`{ id, title, line, kind: 'ready' | 'game' | 'coming', more?, issue? }`. A tool's PR
changes its row from `coming` to `ready` in the same PR that builds it, and a client
test checks that every coming row has its `more` sentence, that no row is empty, and
that no text names the trademarked game.

### Decision 5: About, Settings and the build stamp

- A footer under both groups: **Settings** and **About**, plain text buttons. Settings
  opens the drawer on its Settings tab (theme, look, dice, drawer side); About opens it
  on About, as `#lobby-about` does today. The drawer is the same one the game uses
  (`table-ui.md`, Decision 2).
- **The build stamp** (another job is adding it: a line like "Build 15 Nov 2026, 11:13
  (after change #354)") sits on its own line under Settings and About, small and muted,
  as plain selectable text so it can be copied into a bug report. It is the last thing
  on the page, not a link and not in the tab order. The same line heads the About tab.
- The feedback icon (#353) sits in a fixed corner; the start page keeps 72 px of bottom
  padding so the icon never covers the footer or the last tool.

## The words

Every label and helper line, as it appears. `ids` that exist keep them; new ones are
given.

| Where | Words | id |
|---|---|---|
| Title | **Hextable** | `#lobby-card h1` |
| Line under the title | A 3D tabletop for 5E compatible play. Roam free; when a fight starts, turns begin. | |
| Band heading | **Carry on** | `#start-carry` (new) |
| Remembered table | Table **KX7Q2M**, remembered on this device | `#lobby-table` |
| | **Rejoin** · Forget (two taps: "Tap again to forget") | `#lobby-rejoin`, `#lobby-forget` |
| Saved solo game | Your solo game, saved on this device | |
| | **Continue** | `#lobby-solo` (moved into the band when a game is saved) |
| Group heading | **Play** | |
| Card heading | **Play with others** | |
| Name | Your name — helper: "What the others at the table see. Kept on this device." | `#lobby-name` |
| Name missing | Type the name the others will see. | |
| Code | Table code — helper: "The six letters your DM gave you." Placeholder: ABC123 | `#lobby-code` |
| | **Join** | `#lobby-join` |
| Code missing | Type the table code your DM gave you. | `#lobby-msg` |
| Divider | or be the DM | |
| | **Host a table** — helper: "You get a code to give your players. They join from this page." | `#lobby-host` |
| Map line | Map: The starter valley, on squares · **Change** | `#start-map-line` (new) |
| Card heading | **Play alone** | |
| Helper | You run the party and the game runs the monsters. Saved on this device. | |
| | **Play alone** (no saved game) | `#lobby-solo` |
| | **New solo game** (a saved game exists) — helper: "This replaces your saved game." (two taps: "Tap again to replace it") | `#lobby-new` |
| Party line | Party: Brenna, Pip, Odessa, Tavin · **Change** | `#lobby-party-sum` |
| Sheet heading | **Map and party** — Map; Grid ("Valley on squares", "Valley on hexes"); Party; **Done** | `#start-setup` (new) holding `#lobby-map`, `#lobby-grid`, `#lobby-party` |
| Group heading | **Tools** | |
| Helper | Make things for a game. No game needs to be running. | |
| Ready | **My characters (3)** — "Make, edit and keep characters on this device. Export one to take to any table." | `#lobby-mychars` (moved here) |
| Ready (after stage S3) | **Make a map** — "Paint a map, or trace one over a picture. Export it as a file to use in your game." | `#start-map` (new) |
| In a game (before S3) | **Make a map** · In a game — "For now the map editor opens inside a game: Play alone, then Menu, DM, Edit map." | |
| Coming | **Adventure modules** · Coming — "One file that holds the maps, encounters, handouts and notes of an adventure, added to a game in one step. Until then: make the maps here and save each as a file." | |
| Coming | **Homebrew** · Coming — "Your own spells, monsters and items, checked against what the game can play, for a DM to add to a table. Until then: the DM's Quick entry adds a creature by hand." | |
| Coming | **Markets and shops** · Coming — "Shop lists and loot made ahead of a game, then brought in by the DM." | |
| Coming | **World atlas** · Coming — "A map of a region with places and routes, so the party can travel between battle maps." | |
| Footer | **Settings** · **About** | `#start-settings` (new), `#lobby-about` |
| Stamp | Build 15 Nov 2026, 11:13 (after change #354) | the stamp job's id |
| Make a map step | **Make a map** — Continue the map you were making · New map on squares · New map on hexes · Open a map file · Start from a stock map; helper: "Maps made here are kept on this device while you work, apart from any game. Export map in the editor keeps a copy as a file." **Back** | `#start-map-step` (new) |

Statuses, each in `#lobby-msg` (`role="status"`) or under its field:

| State | Words |
|---|---|
| Joining | Joining table KX7Q2M… |
| Waiting for the DM | Asked to join table KX7Q2M. Waiting for the DM to let you in. **Cancel** |
| Wrong code | (the server's words, today "No table has that code. Check it with your DM.") under the code field |
| Rejoining | Rejoining table KX7Q2M… |
| Left a table | You left the table. |
| Cannot reach the server | Can't reach the table server. Check your connection. Playing alone and the tools still work. **Try again** |
| No table server (GitHub Pages build) | Playing with others needs a table server. This copy of Hextable runs in your browser only. (and, if the build knows a server's address: **Play with friends at …**) |

## States

| State | What changes |
|---|---|
| **First visit** | No Carry on band. Name empty. Play alone reads "Play alone". My characters (0). Focus: none on a touch screen (no keyboard pops up); on a mouse and keyboard device, Play alone. |
| **Returning, solo game saved** | Band with "Your solo game · Continue" (`#lobby-solo` moved there, focused on keyboard devices); the Play alone card shows New solo game. |
| **Returning, table remembered** | Band with the table and Rejoin (focused on keyboard devices) and Forget. |
| **Both** | Both in the band, table first (a table has people waiting). |
| **Waiting for the DM** | The Play with others card is replaced by the waiting line and Cancel (closes the connection, forgets nothing). Tools stay usable. |
| **Cannot reach the server** (`./api/ping` throws) | Join, Host and Rejoin are greyed with the sentence above and Try again; Play alone and Tools work. |
| **No table server** (`./api/ping` answers but not ok, e.g. 404 on GitHub Pages) | The Play with others card becomes the one sentence; no greyed inputs. Play alone becomes the first card. Today this build skips the page and opens the solo game; with this design it shows the page (question 3). |
| **Coming back from a game** (Leave) | The page as above, with "You left the table." |

## Accessibility

- **Structure.** `#lobby` becomes a `<main>`-like region (`role="main"` is not needed
  if the game's root is made `inert`; see below) with `<h1>` Hextable, `<section
  aria-labelledby>` for Carry on, Play and Tools, `<h2>` for each group and `<h3>` for
  each card. The footer is a `<footer>`.
- **Keyboard order** follows the page: Carry on (Rejoin, Forget, Continue) → Your name →
  Table code → Join → Host a table → Change (map) → Play alone / New solo game →
  Change (party) → the Tools rows in order → Settings → About. Enter in the code field
  joins when a name is there and moves to the name when it is not; each card is a
  `<form>` so Enter submits it.
- **The game behind is inert.** While the start page shows, `#top`, `#cam`, the canvas
  and the dock get `inert`, so Tab never reaches them (today it does). The drawer is
  not made inert, since Settings and About open over the page.
- **Focus.** A step or sheet (Map and party, Make a map) moves focus to its heading
  (`tabindex="-1"`) and Back or Escape returns it to the button that opened it. No
  field is focused on load on a touch screen, so the keyboard does not cover the page
  before the person chooses.
- **Names for screen readers.** Rows are buttons whose name is their title plus the
  kind: "My characters, 3 saved", "Make a map", "Adventure modules, coming". The coming
  explanation is `aria-controls`'d and announced by expansion. The stamp is text, not
  a live region. Messages go to `#lobby-msg` (`role="status"`); a field's error is tied
  to it with `aria-describedby`.
- **Touch targets.** Every button, row and Change link is at least 44 px tall (the
  global button is 40 px; the page sets 44). Forget and Change are text-styled but keep
  the 44 px box.
- **Small screens and the on-screen keyboard.** The page is an ordinary scrolling page
  (not a fixed, centred card): `#lobby` gets `overflow-y: auto` and its content starts
  at the top on short screens, so at 390 x 500 everything can be reached. The code
  field has `inputmode="text"`, `autocapitalize="characters"`, `autocomplete="off"`,
  `enterkeyhint="go"`, `spellcheck="false"`; on focus the card scrolls into view with
  `block: "nearest"`, so the code, name and Join fit above a phone keyboard (they take
  about 230 px).
- **Zoom and large text.** Sizes in `rem`; at 200 % zoom a desktop gets the one-column
  phone layout (the switch is at 720 px of page width).
- **Reduced motion.** No slides with `prefers-reduced-motion: reduce`; steps appear
  at once. Otherwise a 150 ms fade.
- **Colour.** Coming rows are not told apart by colour alone: the word "Coming" and the
  dashed edge carry it. Text on a panel uses `--ink` or `--muted`; text that sits on the
  page background itself (the line under the title, the group headings, the footer and
  the stamp) uses `--ink`, because Sunlit's `--muted` (#5f7a68) on its sky (#8fd0e8) is
  too faint to read (the mockup's theme switch shows it).

## Build plan

Each stage is one client pull request, useful alone, checked at 390 x 844 with touch
and 1280 x 800, `npm test`, `npm run build`, and the smoke passes named. **No stage
needs an engine change or a server change.**

| # | Stage | Touches | Done when |
|---|---|---|---|
| S1 | **The page.** Layout B: the Carry on band, Play with others (name, code, Join, Host, map line), Play alone (party line), the Map and party sheet (today's map, grid and party moved in by id), Tools from `start.js` (My characters ready, Make a map "in a game", four coming rows), footer with Settings, About and a place for the stamp; name remembered (`hextable.name`) and required for Join and Host; the page scrolls; the game behind is inert. | `packages/client/index.html` (`#lobby`), `start.js` (new: the tools list and the page's small logic), `start.css` (new), `app.js` (`showLobby` and the lobby handlers, kept small), `mycharacters.js` (only where `#lobby-mychars` and the party summary are drawn), `tablecontrols.js` (the map line), `packages/client/test/start.test.js` (new), `scripts/smoke/start.mjs` (new) and its line in `scripts/smoke.mjs` | Every existing smoke pass runs unchanged (the ids above keep their meaning); at 390 x 500 every control can be reached; Tab never leaves the page for the game behind; a first visit, a saved game and a remembered table each look as in "States"; a coming row opens its sentence and is announced as collapsed or expanded; the test checks every coming row has its sentence and no trademarked name; no page errors at both sizes. |
| S2 | **States.** Cannot reach the server (Try again), no table server (the GitHub Pages build shows the page instead of opening solo, per question 3), waiting for the DM with Cancel, errors under their field. | `app.js` (the ping at start, `T.on.welcome`, `lobbyBusy`), `start.js`, `index.html`, `start.css`, `transport.js` (Cancel closes a pending join: only if it cannot be done with `close()`), tests, `scripts/smoke/start.mjs` | Served with no server (a static file server over `dist/`) the page shows Play alone and Tools and the one sentence; with the server stopped after load, Join is greyed with its sentence and Try again works when it is back; Cancel while waiting returns to the page and the DM's pending list loses the player. |
| S3 | **Make a map without a game** (Decision 3). The workshop: `localTransport({ key: 'hextable.workshop' })`, the Make a map step, the editor started on the choice, "Making a map" and Back to the start; the row turns ready. | `transport.js` (a `key` option; the solo key stays the default), `app.js` (workshop mode), `editor.js` (a hook for Back, nothing else), `start.js`, `index.html`, `start.css`, tests, a smoke pass | From a fresh browser: Tools > Make a map > New map on squares opens the editor; walls drawn there survive a reload and Continue; `hextable.solo` is byte for byte what it was; Export map, then Play alone > Menu > DM > Edit map > Map file > Import map loads the same map. |
| S4 | **Import from Fantasy Grounds in My characters** (`portable-characters.md`, "The start screen"). | `importfg.js` (a no-table mode returning the sheet and report), `mycharacters.js` (the button and the report shown once), tests | A Fantasy Grounds `.xml` becomes a My characters entry with `born.how: 'imported-fgxml'`; the report is shown and not stored; a bad file says why and saves nothing. |
| later | **Each coming row turns ready in its own tool's PR**: My markets (`shops.md` P7), the homebrew pack manager, Add or save a module (`adventure-module.md`), the atlas; **Join with a character** in the Join card (`portable-characters.md` P8, which needs the server's P4 and P5); **Find a game** in Play when the online service exists. | the tool's own files, and its row in `start.js` | as each spec says |

S1 first; S2, S3 and S4 after it in any order (S2 and S3 both touch `app.js`: one at a
time).

## Risks

- **The smoke passes depend on lobby ids.** S1 keeps every one listed under the
  recommendation, visible and doing what it does today; `#lobby-solo` moves between the
  band and the Play alone card by state, keeping its id (the drawer already re-parents
  by id). The builder runs every smoke pass that opens the lobby once before and after.
- **`app.js` is large and shared.** The page's logic goes in `start.js`; `app.js` keeps
  only the hand-offs it has today (start a transport, show the page).
- **The GitHub Pages visitor gets one more screen** (question 3). Play alone is the
  first big button there and one tap, so trying the game is still one tap.
- **The workshop and the solo game share the browser's storage** (about 5 MB of
  `localStorage`, `table-ui.md` notes the same). A big map with a picture can fill it;
  the editor must say so in words when a save fails, not lose work silently.
- **"Coming" for a long time reads as vapourware.** Each coming sentence also says what
  to use until then, and the rows are after the ready ones.
- **A remembered name on a shared device** (a family tablet) shows the last person's
  name. It is only a prefilled field; the person types over it.
- **The feedback icon (#353)** is being placed in a corner at the same time; the page's
  bottom padding keeps it clear, and S1 checks the two together if #353 has landed.

## Questions for the owner

Each has a default; the build follows the default unless the owner says otherwise.

1. **The group's name: "Tools", or "Make"?** "Make" says the job; "Tools" is the
   owner's word and leaves room for things that are not making (an importer, a
   checker). *Default: **Tools**, with the line "Make things for a game. No game needs
   to be running."*
2. **Show tools that are not built?** The owner said yes. *Default: yes, as Coming
   rows after the ready ones, each explaining itself in two lines; no dates promised.*
3. **On the GitHub Pages build (no table server), show this page, or go straight into
   the solo game as today?** *Default: show the page, so My characters and the tools
   can be reached; Play alone is the first button there.*
4. **Must a player type a name to join or host?** Today a blank name becomes
   "Adventurer". *Default: yes, asked once and remembered on the device.*
5. **Maps made without a game: one at a time, or a list ("My maps")?** *Default: one
   workshop map at a time, kept as a file with Export map; a My maps list later if wanted.*
6. **Show "Find a game" (a public list of tables) before the online service exists?**
   *Default: no; it joins Play when the service is real, since a coming row for
   something outside this project would promise too much.*
7. **On the Pages build, link to a server where friends can play?** *Default: only if
   the build is given a table server address (the feedback job #353 may add one);
   otherwise the sentence alone.*
