# Spec: table UI

Status: draft by an agent, to be reviewed by the design owner. Issue #181
(the owner's notes after a play session in which the party was wiped); it
absorbs #173 (menu with Settings and About).

Covers what the player and the DM touch around the map: the slide-out drawer,
the combat tracker, the context action panel, what happens when a fight is
lost or won, the log, and where preferences and table settings live. It says
what the engine already gives, what it must add, and the order to build in.

Nothing here changes a rule except one: when a fight is lost (Decision 1). It
is marked there. Everything else is presentation, or new records the engine
keeps.

## Rules that bind this design

Stated once; every decision below obeys them.

- **Everything goes through `apply()`.** The UI sends actions and reads
  events. The two things that are not actions today, `undo` and `redo`, are
  server messages about the DM's history (`packages/server/README.md`, Undo);
  Decision 1 adds one more in the same family, and says why.
- **The client computes nothing.** It shows what its view gives
  (`packages/rules/src/view.js`) and asks the engine's own helpers
  (`blocked`, `usesFor`, `targetsFor`, `reactionsOf`) why something is
  greyed. Sorting and filtering what the view holds is presentation. Totals,
  XP, loot and who is defeated are the engine's.
- **A player is sent nothing hidden.** No screen here needs a secret to draw
  itself. Where a screen would reveal one (XP that adds up a hidden monster),
  the DM's step sits in front of it.
- **Phones are first-class.** Every layout below is given for 390 x 844 with
  one thumb, and for 1280 x 800. Targets are at least 44 px; nothing depends
  on hover; every greyed thing says why in text on the screen, not in a
  tooltip or a toast alone.
- **Themes restyle only.** All colour, type and radius come from the tokens
  in `themes.js` (`--panel`, `--accent`, `--line`...). No layout or wording
  depends on a theme.
- **No dependencies, no bundler.** Plain ES modules, as `CLAUDE.md` says.
- **Only SRD 5.2 content.** XP values come from the SRD's own table
  ("Experience Points by Challenge Rating", SRD 5.2 page 253,
  `reference/srd52/srd52-flow.txt` near line 43403) and are already in the
  pack: every monster entry in `content/srd52/monsters-*.js` carries `cr` and
  `xp`. The XP needed per level is the "Character Advancement" table
  (`reference/srd52/srd52.txt`, lines 1426 to 1470, section "Level
  Advancement"). The SRD has **no treasure tables**: its Equipment chapter and
  Magic Items chapter (page 204 on) list items and prices, nothing says what a
  monster drops. Loot is therefore what the DM puts in, never rolled by the
  engine.

## Where we are

What exists, and what does not. File and function are given so a builder can
check. "No" means a search of `packages/` found nothing.

| Feature | Exists today | Does not exist |
|---|---|---|
| **End of a fight** | `endEncounter(s, ev, result)` in `engine.js`, results `victory`, `defeat`, `ended` (the DM's `endEncounter` action), `stalemate` (nobody left to take a turn, from `advanceTurn`). Event `encounterEnd { result, rounds }`, sent to players as it is (`AS_IS` in `view.js`). `checkEnd` runs after every action that can down someone. The client writes one log line from it (`describe` in `app.js`: "The fight is won." / "The party has fallen." / ...). `scenes.js` ends an open scene when a fight starts. | Anything after the log line: no screen, no summary, no record of who took part, where, or what was won. `encounterStart` carries no fight id, `encounterEnd` does not say which fight ended. |
| **Defeat** | `checkEnd` ends the fight with `defeat` the moment no party member is `up` (`up(e)` is `!e.dead && e.hp > 0`). A party member at 0 Hit Points is **not up**, though by the rules still dying. Death saves are rolled only in `advanceTurn`, so once the fight is gone nobody rolls (debt W10 in `docs/DEBT.md`). `rest` hands a dying creature to the DM with a `manual` event. The monster AI (`ai.js`) only picks targets that are `up`. | A defeat screen; any choice for the DM; any distinction between "everyone is at 0" and "everyone is dead or stable". |
| **Undo** | `history.js`: the last 30 steps (`UNDO_LIMIT`), 8 MB (`UNDO_BYTES`), reverse patches that restore state, dice seed and timeline exactly. DM only (`{t:"undo"}`, `{t:"redo"}`; `tables.js` handlers). Saved beside the table on the server (`<CODE>.undo.json`); in solo it lives in the tab only and a reload starts it afresh (`localTransport` in `transport.js`). Labels per viewer: `describeStep` returns `{ label, shown }`, `shown` null when players must be told nothing. | A way back to the start of a fight: a fight of a few rounds is easily more than 30 steps (every move, attack, end of turn, and every monster step is one). Nothing marks a fight's start or the last rest. |
| **XP and CR** | Content: `cr` and `xp` on every pack monster (`aboleth`: `cr: 10`, `xp: 5900`). `schema.js` `lintMonster` checks `cr` is a number but **not `xp`**. | `legacyMonster()` in `content/index.js` drops both when it builds `MONSTERS`, so a creature entity has neither; the way to the number is `CONTENT.monsters[e.tpl].xp`. No `xp` on a character, no level thresholds as data, no award, no `levelUp` trigger: `levelUp` is a DM action that takes a whole new sheet (`engine.js`, `levelUp`). No XP share rule. |
| **Loot, items, inventory** | `e.gear`: a list of short strings on every creature (`makeEntity`), checked as names (`derive.js`: at most 60 strings of at most 60 characters). Used by name only: `hasKey`, `hasTool`. Weapons and armour as data (`content/srd52/equipment.js`), lights as data (`content/lights.js`). A map `chest` object with open and closed states (`objects.js`). | Loot record, coins, quantities, weight, magic items as content, containers with contents, piles on the map, anything an item does when used (potion, scroll, wand charges). |
| **Giving, dropping** | `give { actor, item, take? }`, **DM only** (`engine.js`). Event `gear { id, item, taken? }`. The DM's log shows it (`describe`, "X receives Y."). | `gear` is **not in `AS_IS` in `view.js`**, so players are sent nothing when gear changes, and their log never shows it. No action for a player to hand an item over, drop it, or pick it up. |
| **Rests** | `rest` (long: Hit Points, slots, features with uses, Hit Dice, one Exhaustion level) and `shortRest` (spend Hit Point Dice, features that return on a short rest), both **DM only** and refused in a fight (`engine.js`). The DM's Short Rest panel is `initShortRest` in `features.js`. Event `rest { short? }`. | A way for a player to ask for one. |
| **Follow, lead** | `follow { actor, leader }` and `follow { actor, leader: null }` by whoever controls `actor`; `marchingOrder` and **`partyFollow` DM only**. The bar's Follow, Stop following and Lead the party buttons are in `refresh()` in `app.js`; Lead is shown only to the DM. | Lead the party for a player. |
| **Searching** | One action, `search { actor }`: a single Wisdom (Perception) check against everything hidden within 15 ft: secret doors and traps (objects with `find`), and enemies hiding (`hiding.dc`). In a fight it costs the Action. Table setting `passiveFind` (`off`, `traps`, `all`) lets passive Perception find things without it. Events `check { search: true, found }`, `noticed`, `triggered`, `unhidden`. | Two kinds of search. A "trap suspected" flag: nothing in the state says a player suspects something. |
| **Opening doors** | `use { actor, object, verb }`; `usesFor(S, e)` lists what is in reach with a `why` when it cannot be done now (not your turn, no key, no action). The bar shows each as a button. Event `object`. | Nothing missing. |
| **Hide, Dash, Disengage, Dodge** | Actions `hide`, `dash`, `disengage`, `dodge`; `hideProblem(S, e)` and `blocked(S, e, time)` give the reason. | Help, Ready, Utilize, Influence: not in the engine. |
| **Stand up** | A prone creature stands by itself at the start of its turn for half its Speed (`advanceTurn`, event `stood`), and when a fight ends. | An action to stand during a turn. |
| **Spells** | `e.spells` is a flat list of ids: cantrips and prepared spells together (`derive.js`). `SPELLS[id]` (`effects.js`, `spellProfile`) has `level`, `time`, `range`, `aim`, `harmful`, `heals`, `turn`, and `.def`, the pack entry, which has `school`, `classes` (spell lists it is on), `time`, `concentration`, `ritual`, `text`. Slots: `e.slots`, `e.slotsMax`. A cast outside a fight takes a slot. | A tag for damage, healing, control or utility. Known-but-not-prepared spells (a spellbook). Ritual casting without a slot. More than one class on a character (that is #175). |
| **Class features** | `e.feats` (each with `uses`, `action`, `text`), `e.uses[id]` left. `features.js`: `featureButtons`, `usesText`, `featuresHtml`. `classes.js` (#170): choosers for Divine Spark, Wild Shape, Lay On Hands, Font of Magic, Divine Intervention, Metamagic, drawn as a card over the screen (`#cp`, z-index 14). | Nothing missing that this spec needs. |
| **Conditions, concentration** | `e.cond[id]` (`level?`); `S.effects[]` `{ id, name, source, conc, lasts, until, parts }` (`durations.js`), sent to players for effects on or from their own (`viewEffects`). `CONTENT.conditions[id].text` says what a condition does. The card shows them as pills with remaining rounds and an end button for effects you own (`#c-res`, `data-fx`, action `endEffect`). | A machine-readable "how this condition ends". `lasts` is a phrase ("1 minute"); `until` is a round or a clock time; a condition set by the DM has neither. |
| **Reactions** | `reactions.js`: `reactionsOf(e)`, `canReact(e)`, standing instructions (`reactions` action); `e.reactionUsed`. The question when a player's instruction is `ask`: view field `prompt`, drawn as a modal by `reactionprompt.js` (`#rp`, z-index 15) that blocks the table until answered. The sheet's Reactions section is `reactionsHtml` in `reactionsheet.js`. | A "take a reaction now" button: reactions are answered to a prompt or by standing instruction. |
| **The tracker** | `createTracker` in `tracker.js`: `#tracker`, opened by `#btn-tracker`. Rows from `S.encounter.order` (or the party outside a fight, plus hidden creatures for the DM). Health numbers for your own side, a word for the rest; size, height, hidden, Reaction used (own side only), conditions, lasting effects with `(C)`. The DM's tick boxes, amount, damage and heal, Skip turn, Reveal. A horizontal strip of names, `#order`, also shows the order. | The "someone unseen" slot the view sends (`order` has `{ someone: true }`) is dropped from the tracker's rows (`rows()` filters it out); the strip shows it. No initiative numbers in the rows. |
| **The log** | `log[]` in `app.js`, filled by `beat()` from each event through `describe()`: `[text, class, dice?]`, last 300 kept, last 120 shown flat in `#log`. On joining, the last 50 visible entries are asked for (`recent`). `T.history({ types, since, limit })` (limit at most 200). Everything is redacted per viewer in `viewEvents`. | Grouping. Filters. A record of which entries belong to which fight. Entries for gear changes seen by players (above). |
| **Preferences** | `prefs` in `transport.js`, JSON in `localStorage`: `hextable.theme`, `hextable.pace`, `hextable.dice`, `hextable.diceAutoMine`, `hextable.diceMonsters`, `hextable.renderer`. Also `hextable.session` and `hextable.solo`, which are not preferences. The floors look, wall cut-away and caves are **address parameters** only (`?hex`, `?nocut`, `?nocave`, read in `themes.js`). Table rules: `state.settings`, changed by the DM's `setting` action, validated against `SETTINGS` in `engine.js`; players are sent them all. | A place where a player changes any of these in one screen. |
| **Panels** | `index.html`: top bar `#top` with `#btn-undo`, `#btn-tracker`, `#btn-log`, `#btn-handouts`, `#btn-look`, `#btn-dm`, `#btn-leave`; `<aside>`s `#tracker`, `#sheet`, `#log`, `#handouts`, `#dm`, each a fixed panel on the right (`.panel`, z-index 5; the tracker is on the left, z-index 4); `openPanel(id)` in `app.js` shows one of `sheet`, `log`, `dm`, `handouts`. The dock `#dock` holds `#party` (character chips), `#card` (name, `#btn-sheet`, `#btn-end`, Hit Points, `#c-res` pills, `#actions` bar). | One menu; About; attribution (#173). |

## The seven decisions

### Decision 1: defeat

**Question.** What do players and the DM see when the party is wiped, and what
exactly is "wiped"?

**What the rules say.** A creature at 0 Hit Points falls unconscious and
makes a Death Saving Throw at the start of each of its turns; three
successes make it Stable, three failures kill it, a natural 20 puts it back
on its feet with 1 Hit Point, and damage to it adds failures (SRD 5.2,
"Dropping to 0 Hit Points"; the engine does all of this, `deathSave` and
`damage` in `engine.js`). So **a party that is all at 0 Hit Points is down,
not defeated**: its members are still rolling.

**What the engine does.** It ends the fight at the first moment nobody is up
(`checkEnd`), so the saves are never rolled (debt W10) and a 20 can never
save anyone. The owner's party did not get its saves.

**Options for when "defeat" is.**

- A. Keep: defeat when no party member is up. Simple, wrong by the rules.
- B. Defeat when no party member can still act or roll: every party member is
  dead, or at 0 Hit Points and Stable. While anyone is dying and a foe is
  up, the fight goes on, saves roll on their turns, monsters take theirs.
- C. Defeat only when everyone is dead. Too late: a party of Stable
  characters among monsters that cannot or will not finish them is stuck.

**Choice: B**, and it is the one rules change in this spec. In words:

> The party has fallen when **no party member is up and none is dying**: each
> is dead, or at 0 Hit Points and Stable. Dying, and rolling death saves, is
> not defeat.

Outside a fight (a trap, a fall, a spell) nobody rolls saves (W10), so the
same words are: **no party member is up**; the screen shows the dying ones as
dying and the DM settles them as today.

"Party member" means a creature with `side: 'party'` and `kind: 'pc'`.
Companions and summons on the party's side do not keep the party standing.

The monster AI keeps its rule (it only picks targets that are up), so while
the party lies dying the monsters pass their turns. That is kinder than the
SRD's coup de grace (damage on a creature at 0 within 5 feet is a critical
hit and adds failures) and is an open question below; the DM can `harm` a
dying character by hand.

**When the screen appears.** The moment the engine sends
`encounterEnd { result: 'defeat' }` for a fight, or, outside a fight, when
the state first has no party member up. The screen is drawn from the state,
not only from the event, so a player who reloads or joins late sees it too:
`fallen(S)` is true when there is no `S.encounter` and every party `pc` is
dead or at 0. It stays until the DM chooses, or until any party member is up
again.

**What players see.** One quiet card over the map; the map stays visible
behind it and tappable for looking around.

```
  ┌──────────────────────────────────┐
  │  The party has fallen.           │
  │                                  │
  │  Brenna    died                  │
  │  Tor       down, stable          │
  │  Ilya      died                  │
  │                                  │
  │  The DM will decide what         │
  │  happens next.                   │
  └──────────────────────────────────┘
```

Tone: short, plain, no jokes and no "game over". One line says what
happened, one line per character says how they ended, one line says who
decides. States per character: "died", "down, stable", and outside a fight
"down, dying". Nothing about the monsters is shown beyond what the map shows.
A player can close the card to look at the map; it comes back from the Log
entry of that fight. A player is never given a choice: the table is the DM's
to steer.

**What the DM sees.** The same card, with three choices, each with what it
does in one sentence:

```
  ┌──────────────────────────────────────────────┐
  │ The party has fallen.                        │
  │ Brenna died. Tor is down and stable.         │
  │ Ilya died.                                   │
  │                                              │
  │ [ Go back to the start of the fight ]        │
  │   The table as it was when initiative was    │
  │   called, with new dice. Undo brings this    │
  │   back.                                      │
  │ [ Go back to the last rest ]                 │
  │   The table as it was after the last rest.   │
  │ [ Carry on from here ]                       │
  │   Capture, rescue or new characters: Quick   │
  │   entry is under Menu, DM.                   │
  └──────────────────────────────────────────────┘
```

- **Go back to the start of the fight** ("rewind"). Not enough with `undo`
  alone: it keeps 30 steps. The engine lane adds a **fight pin**: when
  `startEncounter` succeeds, `history.js` keeps a full copy of the state as it
  was just before (`mark(state)`, which already leaves out the timeline), and
  a **rest pin** the same way after `rest` and `shortRest`. A new server
  message `{t:"rewind", to:"fight"|"rest"}` (DM only, handled beside
  `undo` in `tables.js`, and `t.rewind` in `localTransport`) restores the
  pinned state **except the dice stream**, so that the same choices do not
  roll the same results. It records one step, so Undo takes the rewind itself
  back and the lost fight returns. Everyone is sent a whole view, and the
  event `rewound { to }` (players see it too: "The DM took the table back to
  the start of the fight."). A pin is dropped by `loadMap`, and a fight pin
  by `rest`, `shortRest`, and when it is replaced by the next fight.
  The message is not an action because it changes the history, not the game,
  exactly like `undo`; the DM-only check, the exact restore and the
  `{ label, shown }` convention are the ones `history.js` already has.
- **Go back to the last rest.** The rest pin. Offered only if there is one.
- **Carry on from here.** Closes the card and changes nothing. The DM's own
  tools do the rest: `heal` and `stable` by `mend` and `condition`, `place`,
  `spawn`, `addCharacter` and Quick entry for new characters.
- The owner's "restart the scene" is the rest pin: it is the largest
  restore that does not throw away the story. A `loadMap` restart needs no
  pin; it is in the DM panel already.
- A choice that is not available is shown greyed with why ("No fight to go
  back to: the fight began more than a rest ago.").

**Solo.** The same card, since in solo you are the DM and every hero. Its
three lines are in the first person: "Try the fight again", "Go back to the
last rest", "Carry on". The pins are kept in `localStorage`
(`hextable.solo.pins`) because the history is not; if the browser refuses the
space, those two choices are greyed and say so.

**The mirror.** `encounterEnd { result: 'victory' }` (and `ended`, when the DM
ends it) leads to the conclusion in Decision 4. `stalemate` leads to nothing
but its log line.

### Decision 2: the drawer

**Question.** One menu for everything that is a panel today.

**Options.** (a) Keep five separate panels and add two. (b) One drawer with
tabs. (c) One drawer that is a list, each item opening a full screen.
Choice **(b)**: tabs keep the tracker one tap away during a fight, which (c)
makes two.

**What it is.**

- A burger button, `#btn-menu` (new), in `#top`. `aria-label="Menu"`,
  `aria-expanded`, `aria-controls="drawer"`. It carries one badge: the sum of
  the DM's waiting players (`#dm-badge`), the player's unseen handouts
  (`#ho-badge`) and, for the DM, an undecided conclusion.
- A slide-out `<aside id="drawer">`. It comes from the **right** by default.
  The side is a client preference: `hextable.drawerSide`, `"right"` or
  `"left"`; the burger sits on the same side, the status box on the other
  (`#top` flips with `flex-direction: row-reverse`; `body[data-drawer]` is
  the hook for CSS). Left is for left-handed thumbs; nothing else changes.
- Tabs, in this order: **Turns** (called **Party** outside a fight; the
  tracker, Decision 3), **Sheet**, **Log**, **Handouts** (only if there are
  any, or for the DM), **DM** (DM only), **Settings**, **About**. Every tab
  is an existing panel re-parented, not rewritten (below).

**Where today's things go.**

| Today (`index.html`) | Goes to |
|---|---|
| `#btn-undo` | Stays in the top bar for the DM: undoing must be one tap. |
| `#btn-tracker`, `#tracker` | Tab Turns / Party. The button is removed; `createTracker` gets the drawer section as its `root`. |
| `#btn-log`, `#log` (`#log-list`, `#note-form`) | Tab Log. `#note-form` stays with it. |
| In `#log`: `.dice-prefs`: `#dice-show`, `#pace-pick`, `#dice-auto-mine`, `#pace-table` | Tab Settings. They are device preferences. |
| `#btn-handouts`, `#ho-badge`, `#handouts` | Tab Handouts, badge on the tab. `handouts.js` and `scenes.js` are given `openPanel`; it becomes `drawer.open(tab)`. |
| `#btn-look` (cycles themes blind) | Tab Settings: a Theme select over `THEMES`. |
| `#btn-dm`, `#dm-badge`, `#dm` | Tab DM, badge on the tab. Its sections do not change in this spec. Its `#dm-dice-monsters` (a device preference) moves to Settings, under "For the DM, on this device". |
| `#btn-leave` | Tab Settings, group "Table" (players, online). The DM's Leave stays in the DM tab (`#dm-leave`). |
| `#btn-sheet`, `#sheet` | The button stays in the card; it opens the drawer on tab Sheet. `#sheet` and `#sheet-body` become that tab. |
| `#order` strip, `#hint`, `#cam`, `#pace-wait` | Stay where they are. A tap on `#order` opens the drawer on Turns. |
| `#party`, `#card`, `#actions` | Decision 6. |
| `#scene`, `#viewer`, `#cp`, `#rp`, `#lobby`, `#editor`, `#toast` | Unchanged. They sit above the drawer (z-index: the drawer is 5; `#cp` 14, `#rp` and `#viewer` 15, `#toast` 20). |

Re-parenting keeps every element id, so `$('log')`, `$('sheet')`, `renderLog`,
`renderSheet`, `renderDM` and the smoke script keep working. `.panel`'s
`position: fixed` is overridden inside the drawer.

**About** (closes the second half of #173). One data file, `about.js`, holds
the text, so a legal change is one edit and no page fetches anything:

1. The SRD 5.2 attribution, word for word as in `reference/srd52/README.md`
   ("This work includes material from the System Reference Document 5.2
   ("SRD 5.2") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative
   Commons Attribution 4.0 International License, available at
   https://creativecommons.org/licenses/by/4.0/legalcode.").
2. Hextable's own licence (AGPL-3.0-or-later, `LICENSE`).
3. Three.js r187, MIT, with the copyright line from
   `packages/client/vendor/README.md`.
4. The five fonts the page loads from Google Fonts (`index.html`: Baloo 2,
   Nunito, Silkscreen, Source Sans 3, Vollkorn SC). The builder confirms each
   one's licence on its Google Fonts page before writing it down; none is
   assumed here.
5. Model packs later, each with its licence from
   `packages/client/assets/models/LICENSES.md` when that file exists.
6. The game's version and the table's state version, so a bug report can say
   which.

About is a drawer tab, so it is one tap from the burger at any time, on a
phone too, including before a table is joined: the lobby (`#lobby`) gets an
"About" link that opens the same drawer.

**On a phone** (up to 600 px wide, the breakpoint `style.css` already uses).

```
 closed                           open (right side)
┌─────────────────────────┐      ┌─────────────────────────┐
│ Round 3 · 08:06  [↶][☰] │      │▒▒│ Menu              [✕] │
│ [Tor][Goblin 2][Brenna] │      │▒▒│ Turns Sheet Log Sett.▸│
│                         │      │▒▒│───────────────────────│
│          map            │      │▒▒│ Round 3     Tor's turn│
│                         │      │▒▒│ ...rows...            │
│                         │      │▒▒│                       │
├─────────────────────────┤      ├─────────────────────────┤
│ action panel            │      │ action panel (visible)  │
└─────────────────────────┘      └─────────────────────────┘
```

- Width `min(92vw, 420px)`; the remaining strip of map is a scrim: a tap on it
  closes the drawer.
- Height: from the top of the screen down to the top of the dock
  (`top: 0; bottom: var(--dock-h)`; `--dock-h` is already kept up to date in
  `refresh()`). So it is as tall as the screen allows and **never covers the
  action panel**.
- A pending reaction question (`#rp`, z-index 15) is above it, and the
  drawer does not close under it; when `state.prompt` or `state.pending` is
  set, the drawer is hidden for the length of the question and restored
  after.
- Close by: the scrim, the X, the burger, Escape, or a **swipe** away from
  the open side (a drag that starts on the drawer's header, past 60 px or a
  quick flick). It is **not** opened by swiping from the screen edge: the
  canvas owns single-finger drags (`touch-action: none` on `#gl`), and the
  left edge belongs to the browser's back gesture.
- Safe areas: `env(safe-area-inset-top/right/bottom)`.
- Tabs scroll sideways in a strip; each is at least 64 px wide and 44 px high.

**On a desktop** (900 px and wider; `closeDM()` in `app.js` already uses
900).

```
┌───────────────────────────────────────────────────────┬──────────────┐
│ Round 3 · Day 1 08:06                          [↶] [☰]│ Menu     [📌][✕]│
│ [Tor][Goblin 2][Brenna]                               │ Turns Sheet ..│
│                                                       │ Round 3       │
│                      map                              │ ▶ Tor   14/24 │
│                                              [+]      │   Goblin 2 .. │
│                                              [−]      │               │
│            ┌───── action panel (max 760) ─────┐       │               │
└───────────────────────────────────────────────────────┴──────────────┘
```

- Width 360 px. A **pin** button keeps it open: `hextable.drawerPin`
  (default off). Pinned, the canvas element's box shrinks by the drawer's
  width (`#gl { inset: 0 var(--drawer-w) 0 0 }`; `render.js` already follows
  the canvas size with a `ResizeObserver`, so no renderer change), and `#cam`,
  `#top`, `#order`, `#hint` and the dock move out from under it. Unpinned, it
  floats over the map with a scrim that does not block the map (a click on the
  map closes it), so a tracker can be opened for a glance and dismissed by
  clicking the map.
- Keyboard: `m` toggles the drawer (not while typing; the existing key
  handler already skips inputs), Escape closes an unpinned drawer, `Tab` moves
  through it and, unpinned, is trapped in it while open; focus returns to the
  burger on close. The tab strip is `role="tablist"` with arrow keys.

**Screen readers.** `#drawer` is `role="dialog" aria-modal="true"` while it
covers the map (phone, or desktop unpinned) and `role="complementary"` when
pinned; its heading names the tab. Opening moves focus to the heading;
closing returns it to `#btn-menu`. A visually hidden `aria-live="polite"`
region says "Round 3. Tor's turn." when the turn changes, once, never per
Hit Point change. The slide itself is skipped under `prefers-reduced-motion`.

**Preference.** `hextable.drawerSide`, `hextable.drawerPin`, and the last open
tab (in memory only; it is not worth storing).

### Decision 3: the tracker in the drawer

**Question.** What does each row show, to whom, without leaking.

**Choice.** Keep what `tracker.js` already does and fix what it lacks.
Vertical, in initiative order, header "Round N" and whose turn it is. The
horizontal `#order` strip stays: it is the glance when the drawer is shut.

**A player's row** is built only from the view (`playerView`,
`viewEncounter`):

| Part | Source | Own side | Others |
|---|---|---|---|
| Initiative | `S.encounter.order[i].init` | the number (the view sends `init` and `dex` for open creatures only) | none |
| Name, side colour | `e.name`, `e.side` | yes | yes, for creatures the party can see |
| Health | `e.hp`, `e.maxHp`, `e.tempHp` / `e.health` | `14 / 24 +3` and a bar | the word (Healthy, Bloodied, Down, Dead) and a bar from `hpFraction`; never a number |
| Dying | `e.death` (open creatures) | `Dying 1✓ 0✗`, or `Stable` | none |
| Turn | `S.encounter.turn`, `current()` | `aria-current="step"`, accent fill, scrolled into view | same |
| Reaction | `e.reactionUsed` (open creatures) | "Reaction used" | **nothing**: the view does not send it, and the row does not guess |
| Conditions | `e.cond` (all for open; `visibleConditions` for seen) | all | only the ones that show by looking |
| Concentration, lasting effects | `S.effects` (`viewEffects`) | `Bless (C) 8r` | those the view sent, e.g. a foe's `Hex (C)` |
| Size, height | `e.size`, `e.pos` | yes | yes |
| Unseen turn | `{ someone: true }` in `order` | | a ghost row, "Something moves unseen", not tappable. Added: `rows()` drops it today. A run of unseen turns is already one slot, so no count leaks; under `unseenTurns: 'quiet'` there is no slot and so no row |

**The DM's row** is the DM's whole state: exact `hp / maxHp` for everyone,
initiative for everyone, creatures hidden from the players marked "Hidden
from players" (that tag exists), the tick boxes, the typed amount with
Damage and Heal for the ticked, a `-` and `+` per row, Skip turn on the
current row and Reveal on hidden ones (all existing; they are kept as they
are, in the same actions: `harm`, `mend`, `setHp` for the dead, `endTurn`,
`reveal`). On a phone the DM's controls collapse behind an "Edit" button on
the header so the list gets the room.

```
 Round 3                         Tor's turn
 ┌─────────────────────────────────────────┐
 │▶18 ▌Tor        14/24 +3 ▓▓▓▓░           │  your own: numbers
 │     Bless (C) 8r · Reaction used        │
 │ 12 ▌Brenna     Dying 1✓ 0✗              │
 │    ▌Goblin 2   Bloodied ▓▓░░░           │  a foe: word and bar
 │     Prone · Hex (C)                     │
 │    ░ Something moves unseen             │
 │    ▌Goblin 1   Dead                     │  struck through
 └─────────────────────────────────────────┘
```

**Tapping a row** selects that creature and moves the camera to it (what
`ctx.pick` does now: `select(id)` and `R.focus(id)`). On a phone it then
closes the drawer, since the map is what was asked for; tapping a tick box or
a DM button does not. A row of a creature whose full record the viewer has
(`e.abil`) has a small "Sheet" button that opens tab Sheet for it.

**Why not move the order strip into the drawer too.** A fight is played with
the drawer shut; the strip costs one line and says whose turn is next.

### Decision 4: combat conclusion

**Question.** When a fight is won (or the DM ends it), what is awarded, who
decides, who sees what, what is written down.

**What the SRD says.** A monster's XP is set by its CR; XP "is awarded for
defeating the monster in combat or otherwise neutralizing it", and the Game
Master awards it; at certain totals a character gains a level (SRD 5.2,
"Experience Points" under Monsters, page 253, with the table, and the
Character Advancement table under "Level Advancement"). It does **not** say
how a group divides it, and gives no treasure tables. So: the XP **values**
are the SRD's; dividing them **equally among the party members who took
part** is a table convention, made a table setting (`xpShare`, below) with
that as the default; loot is whatever the DM enters.

**What exists.** See the table above: the data is in the pack, nothing in the
engine uses it, and an item is only a string in `e.gear`.

**What a "loot" record is.** Given that items are strings, a loot line is the
smallest thing that fits `give`:

```
{ id, name, qty, from?, to }
  name   up to 60 characters, the same rule as `gear`; the client offers
         names from the pack (weapons, armour, lights) and free text
  qty    a whole number, default 1; "Arrow x20" goes into gear as one string
  from   the name of the creature it came from (for the log), optional
  to     a party member's id, or null: carried by nobody yet
```

Coins are loot lines ("35 gp"). There is no currency in the engine; one is
not invented here. When structured items arrive (an `items` content kind),
`name` becomes an item id and nothing else here changes.

**The flow.**

1. The fight ends. If the result is `victory` or `ended`, the engine builds a
   **conclusion** and keeps it in `state.conclusion`. It is private to the DM
   (players are sent only `{ id, pending: true }`). Defeat does not make one.
   The table setting `conclusion` (`dm`, `auto`, `off`; default `dm`) decides
   whether the DM reviews it, it is published at once, or none is made
   (milestone levelling). In solo the one person sees the DM's form with a
   single button, "Done".
2. **The DM's step, before players see anything.** A card over the map:
   - Foes that took part, each with its XP and a checkbox "counts" (defeated
     creatures start ticked: the engine ticks a foe that is not up; a foe that
     fled or was talked down is the DM's to tick, which is the SRD's
     "otherwise neutralizing").
   - Bonus XP: lines of amount and **reason** ("Freed the prisoner").
   - The share each party member gets: the engine's figure, editable per
     member; a member who was not in the fight, or died, starts at zero.
   - Loot: lines to add, remove, and assign to a member or to nobody.
   - [Show to the players] and [No rewards].
   Every edit is an action (`conclusion { edit }`) so it is undoable and the
   DM can leave the step half done and come back from the DM tab.
3. **Publishing** is one action. The engine adds each member's XP to `xp`,
   puts each assigned loot line into that member's `gear` (as `give` does),
   writes the record to the timeline, and sends players the result.
4. **What players then see** (a card over the map, like Decision 1's, one
   tap to dismiss, reopenable from the Log):

```
  ┌──────────────────────────────────────┐
  │  The fight is won.      4 rounds     │
  │  Goblin warrior x3, Wolf             │
  │                                      │
  │  Experience        +450 each         │
  │    +50  Freed the prisoner           │
  │  Tor   1,150 / 2,700 to level 4      │
  │                                      │
  │  Found                               │
  │    Shortbow          Ilya            │
  │    35 gp             the party       │
  │                                      │
  │  [ Continue ]                        │
  └──────────────────────────────────────┘
```

   While the DM is still deciding, players see a small non-blocking line
   ("The fight is over. The DM is working out the rewards.") from the
   `pending` marker, never a blocked screen. If a member's `xp` reaches the
   next row of the Character Advancement table, the card says "Ready to level
   up: ask your DM", from the `levelReady` event. Levelling itself stays the
   DM's `levelUp` action; this spec does not change it.
5. **What is written down.** Two timeline entries, in the same action:
   - `conclusion`, the whole published record (below), tagged `fight`.
   - A `chronicle` entry (title "A fight at the old watchtower: won", text
     with rounds, who was beaten, XP and loot, `tags: ['fight']`,
     `public: true`), so the DM's chronicle, `recall` and any later AI DM
     read it through the same path as every other entry. The log (Decision
     5) shows the `conclusion` and hides the matching chronicle line inside
     the fight's group.
   The `conclusion` event is sent to players shaped like the card they see
   (creatures they know of only; the totals and reasons the DM published).

**Leaks.** A player's per-head XP adds up every defeated foe, hidden ones too.
The DM's step is exactly where that is decided: the DM can edit the figures
before publishing. The published `foes` list holds only creatures the party
knew of at that moment (`classify`), the same rule `viewEvents` uses.

**What the engine must add**, few and named (full table below):

- `state.conclusion` and `xp` on characters, state version 18, with a
  migration that gives each existing character the XP its level starts at.
- The Character Advancement table as content data (`advancement.js` in the
  pack; no functions, no imports).
- One action `conclusion` with three forms: `{ edit: { foes?, bonus?, per?,
  loot? } }`, `{ publish: true }`, `{ skip: true }`. DM only.
- Events: `conclusionReady` (DM only), `conclusion` (published, shaped per
  viewer), `xp { id, amount, total }`, `levelReady { id, level }`, and
  `gear` extended and sent to players (below).
- Two table settings: `conclusion` and `xpShare` (`split`, `full`).
- `encounterStart` gains `id` (the fight's id) and `where` (the name of the
  revealed region the fight is in, else the map's name); `encounterEnd`
  gains `fight` (that id). These feed Decision 5.

### Decision 5: the log by combat

**Question.** One collapsible entry per fight, with a summary and the
blow-by-blow, exploring in between, and trades and loot always recorded.

**Today.** A flat array of lines, no fights, no filter (see "Where we are").
`encounterStart` and `encounterEnd` already bracket a fight in the event
stream, and `describe()` already writes every line in words.

**Choice.** Group on the client, from the stream the viewer was sent, and
keep the one thing it cannot do itself (which entries belong to which fight
after a reload) as a small engine addition.

```
 ▸ Exploring · Day 1 08:00                      6 entries
 ▾ Fight 1 · The goblin camp · 4 rounds · Won
     Tor, Ilya and Brenna beat 3 goblin warriors and a wolf
     450 XP each · 2 items
     ┌ Round 1
     │  Roll initiative! Tor 18, Goblin 2 ...
     │  Tor's turn ... attacks Goblin 2 ... Hit.
     └ Round 2 ...
     ┌ Spoils
     │  Ilya receives Shortbow.
     │  35 gp: the party's.
 ▸ Exploring · Day 1 09:10                      3 entries
```

- **Entries.** `log[]` becomes a list of `{ kind, text, cls, dice, round,
  fight, t }`, built in `beat()`. `kind` is one of `combat`, `explore`,
  `loot`, `talk`, `dm`. A fight group opens at `encounterStart` and closes at
  `encounterEnd`; the `conclusion` event that follows belongs to it. Between
  fights, entries go in an "Exploring" group that ends at the next fight or
  after a long gap of world time (an hour; the engine clock is in minutes).
  A fight that is taken back with undo (`undone` of `startEncounter`) is
  closed as "Taken back". A fight still going shows "In progress".
- **Summary line**, in this order, each part only if the view sent it: place
  (`encounterStart.where`), rounds (`encounterEnd.rounds`), outcome
  (Won, Fell, Ended by the DM, Stalemate), who (party names, and foes by
  name and number from the `conclusion` the viewer got), XP per head
  (`conclusion.xp`), and the number of items (`conclusion.loot`). A fight
  with no conclusion shows what it has and no placeholders.
- **Inside**, the existing lines, grouped under "Round N" headings from the
  existing `turn` events, using `<details>` so a screen reader and the
  keyboard get collapsing for free. A fight is collapsed once it is over,
  open while it is going on.
- **Always recorded: trades, loot, items picked up, dropped or given.**
  Events today:

  | Event | Today | Seen by players today |
  |---|---|---|
  | `gear { id, item, taken? }` (DM's `give`) | yes | **No** (not in `AS_IS`) |
  | `light { id, ... }` | yes | yes |
  | `object` (a chest opened, a door) | yes | yes |
  | `chronicle` (DM's) | yes | only if `public` |
  | loot, XP, a conclusion | **no** | no |
  | a player handing an item to another, dropping it, picking it up | **no** | no |

  The engine must add (full table below): `gear` seen by players for
  creatures that are theirs, with `why` (`dm`, `loot`, `pass`, `drop`,
  `pickup`) and `with` (the other creature) so one event says "Ilya gave
  Tor a rope"; the `conclusion` and `xp` events; and, as a later stage, the
  actions `pass`, `drop` and `pickUp` (with a `pile` object on the map for
  what is dropped, a content addition under `docs/specs/maps-and-objects.md`).
  Until those exist the log shows exactly what exists, and nothing is
  invented to fill it.
- **Filters**, as chips above the list, several at once, remembered as
  `hextable.logFilter`: Fights, Exploring, Loot and trades, Talk (`say`
  lines and notes). The DM also has **DM only** (`undone`, `redone`,
  `chronicle`, `manual` and the events players are never sent). Filtering
  keeps each fight's summary line and shows inside only the matching
  entries.
- **Per viewer.** The client filters nothing for secrecy: it draws what its
  view delivered. `viewEvents` already redacts live events and `history`
  alike, including creatures the party did not know of when something
  happened (`unseen` in the record). `history.js`'s `{ label, shown }` rule
  is the model for the new events: an event carries its words for the DM and
  its (possibly shorter or absent) words for players, and an event with
  nothing a player may be told is not sent. The undo lines ("Taken back:
  ...") already work this way and stay.
- **After a reload.** The first 50 visible entries come with the join
  (`recent`). The summaries are asked for by type
  (`{ t:"history", types:["encounterEnd","conclusion"], limit:200 }`), and
  the blow-by-blow of one fight is asked for when its group is opened
  (`{ t:"history", fight: id }`, new: the server returns the record between
  that fight's `encounterStart` and `encounterEnd`, through `viewEvents`, up
  to 500 entries). In solo the whole timeline is local (`recall(S, ...)`) and
  nothing is asked for.

### Decision 6: the context action panel

**Question.** An always-present panel that changes with the situation, holds
everything a creature can do, and leaves the map visible and tappable.

**What it replaces.** The card in `#dock` and the bar in `#actions`: one long
scrolling row of buttons built in `refresh()` from attacks, spells, features,
class buttons (`CLS.buttons`), Second Wind, Higher/Lower for fliers, Follow,
Search, Hide, objects in reach, Dash, Disengage, Dodge. Every one of those
buttons becomes a row in a tab below, with the same behaviour: the arming of
a target (`setMode`), the `#hint` bar above the map, the engine's refusal
shown as it came. Nothing is lost; the order is what changes.

**What stays.** `#party` (the character chips) above the panel. The card's
head (name, level and class, **Sheet**, **End turn**), the Hit Point bar,
and the pill row (`#c-res`) of Action, Bonus Action, Move, Reaction and slots.
`#hint` above the map. The class choosers in `classes.js` stay as the cards
over the screen they are; the panel opens them.

**Structure.**

```
┌ head       Tor · Cleric 3            [Sheet] [End turn]
├ hp         ▓▓▓▓▓▓░░ 14/24 HP · AC 16
├ status     Action · Bonus · Move 20 ft · Reaction ·  L1 ●●○  L2 ●○
│            Bless (C) 8r ▸   Poisoned ▸                 (tap: how it ends)
├ rows       the active tab's rows, two and a half visible on a phone
└ tabs       at the bottom edge, in the thumb's reach
```

Tabs sit at the **bottom** of the panel (like a phone's navigation bar), so a
thumb reaches them without stretching; End turn stays in the head, large and
accent-coloured, as it is now.

**Which tabs, when** (the panel is a function of the state and the selected
creature, `panelContext(S, e)`, pure and tested; the engine's `blocked()` and
`inFight()` are its inputs):

| Situation | Tabs | Default |
|---|---|---|
| Not in a fight | **Explore**, Spells, Features, Items | Explore |
| In a fight, your turn | **Attacks**, Spells, **Bonus**, **Move**, Features, Items | Attacks (Spells if the creature has no attack) |
| In a fight, another's turn | **Reactions**, Spells, Features, Items (the last three browsable, every row greyed "It isn't your turn") | Reactions, if it is available; else the last tab used |
| A creature that is not yours (DM selects a monster) | the same as yours, from its `actions` | as above |
| Down, dying or dead | one tab, "Down", with the death save count and what ends it | |

The default tab is chosen when a turn starts and when the fight begins or
ends. A device preference, `hextable.panelTab` (`auto`, the above; or
`remember`, the last tab used in each situation), lets a player keep their own
habit.

**Explore tab** (outside a fight). Most likely first. "Likely" is decided by
a pure function over the view, `rankExplore(S, e)`, in this order, each rule
using only what the view and the engine's helpers say:

1. **An object in reach.** `usesFor(S, e)` returns, for a door or lever
   within reach, a row with its label ("Open", "Close", "Unlock") and a `why`
   if it cannot be done. Those that can be done come first, nearest the top.
2. **Following.** If `e.follow` is set, "Stop following Brenna" is first of
   the walking rows; else "Follow...", which arms a tap on a party member
   exactly as today (`mode.kind === 'follow'`, with the nearest ally
   offered). "Lead the party" is shown to the DM only (`partyFollow` is DM
   only); for players it is not shown rather than shown greyed.
3. **Hurt.** If `e.hp` is at or below half of `e.maxHp` (your own numbers),
   healing you can do now: Cure Wounds / Healing Word, Second Wind, Lay On
   Hands, as shortcuts that jump to the same rows in Spells and Features.
   For the DM the Short rest and Long rest buttons (`shortRest`, `rest`, DM
   only) come up when any party member is under half or has used slots.
4. **Something found or sprung.** If a `noticed` or `triggered` event is in
   the last two updates of the log, **Search** moves up.
5. **Search** (always offered). With `settings.passiveFind` = `off` it is in
   the top four, because nothing else finds things; with `traps` or `all` it
   drops below the rows above, because passive Perception already does part
   of the work.
6. **Light.** If the party's sight rule is `light` and the tile under `e`
   is not Bright (`S.sight.light`), and the creature has no light, "Light a
   torch" (below).
7. **Hide**, with `hideProblem()` as its reason when it cannot be done.
8. **Rituals**: spells with `def.ritual`, below.
9. **Check...**: opens the Sheet's skills (tap to roll, as today).

The first four rows are shown as large buttons in a two-by-two grid; the rest
are under "More". All rows follow the greyed-with-reason rule.

**One Search, not two.** The owner asked for "search for secret doors" and
"search for traps". The engine has one `search` action, one Perception check
against everything hidden within 15 ft (secret doors, traps, hiders); two
buttons would send the same action and mislead. One button, sub-line "secret
doors, traps, things hiding · 15 ft". Both owner's items are met by it.

**Rituals and light, honestly.** Ritual casting does not exist: a ritual
spell (`def.ritual`) is cast like any spell, with a slot, and takes no ten
extra minutes. The panel lists ritual spells under Explore and casts them as
they are today; ritual casting (no slot, outside a fight, ten minutes on the
clock) is an engine item below. Lighting a torch is DM-only (`setLight`);
players get the row greyed with "Only the DM hands out light" until the
engine lets the controller light something their `gear` names (below).

**Reactions tab** (another creature's turn). The tab is greyed when the
creature has no reactions (`reactionsOf(e)` empty), or the Reaction is spent
(`e.reactionUsed`: "Reaction used this round"), and says so. Inside:
`reactionsHtml` (status and the standing instruction for each: always,
never, miss, ask; `bindReactions` sends `reactions`), as the sheet shows it
now. **When a question is pending** (`S.prompt` for this player), the tab
becomes active, pulses (not under reduced motion) and shows "A question is
waiting". The question itself stays the modal `#rp`: the engine stops the
whole table while it waits (`packages/server/README.md`, "Asking in the
moment"), so it has to be impossible to miss and impossible to tap past, and
`reactionprompt.js` already does that and is tested. The tab does not
duplicate it.

**Attacks tab.** `e.attacks` (characters) or `e.actions` (monsters,
including Multiattack and what is left of it). Each row: name, bonus, damage
and type, reach or range, and for monsters recharge and uses per day. Tap
arms it (`setMode`), as today.

**Spells tab.** Spell slots are a strip at the top and are always there,
whatever the sort: `Level 1 ●●○  Level 2 ●○`, pips from `e.slots` and
`e.slotsMax` (pact slots show as one row of the pact level). A "Metamagic"
button and Sorcery Points appear here for a sorcerer (`CLS.buttons`).
Rows grouped by level (Cantrips first), each: name, level, cost chip (A, B,
R), range, a one-line effect (`sp.short`, or the healing dice), and the why
when greyed.

- **Sort** (one at a time; `hextable.spellSort`): Level (default), Name,
  School (`def.school`), Casting time (`def.time`).
- **Filters** (chips, several at once, not remembered between sessions):

  | Chip | From |
  |---|---|
  | Casting time: Action, Bonus, Reaction, Longer | `def.time` (`action`, `bonus`, `reaction`, anything else is Longer) |
  | Concentration | `def.concentration` |
  | Ritual | `def.ritual` |
  | Cantrips, Prepared | `sp.level === 0`, `sp.level > 0`. **The engine has no spellbook**: `e.spells` is cantrips and prepared spells together, so Prepared is "not a cantrip" and nothing more. A wizard's unprepared spells are not represented. |
  | Can cast now | the row is not greyed |
  | Kind: Damage, Healing, Control, Utility | a derived tag, below |
  | Class | shown only if the creature has more than one class |

- **Where the Kind tag comes from, without inventing data.** The pack has no
  such field and none is added. A spell's `def.effects` are steps from a
  closed list (`STEPS` in `schema.js`), and `spellProfile` already walks them
  to decide `harmful` and `heals`. A new pure function there,
  `spellKinds(def)`, returns the kinds from the steps it finds:
  **Damage** for `attack` or `damage` (or `fall`), **Healing** for `heal`,
  `tempHp` or `cure`, **Control** for a harmful `condition`, `move`,
  `teleport`, a `modifier` with `against`, or a `zone`, and **Utility** when
  none of them. A spell can have several. It is returned as `sp.kinds`; the
  client only reads it. The builder lists how the 339 spells fall out and
  fixes the function, not the data, where the split looks wrong; a spell
  entered as `manual` (no steps) is Utility, honestly.
- **Class filter and multiclass.** The engine has one class per character
  (`e.cls`, one `casting` in `derive.js`); multiclassing is #175. The Class
  chip is hidden until a character carries more than one, and what it needs
  from #175 is one thing: **each entry of `e.spells` must say which class
  gives it** (for example `e.spellClass[spellId] = classId`). The spell's own
  `def.classes` is the list of lists it is on, and cannot say which of the
  character's classes chose it. No guessing from it.
- **Greyed, and why**, written under the row, from the engine's own checks:
  `blocked(S, e, sp.time)` ("It isn't Tor's turn", "Tor has already used an
  action this turn"), no slot ("Tor has no level 2 spell slots left"), the
  one-slot-spell-per-turn rule, and range ("Nobody within 60 ft", from
  `targetsFor`, for spells aimed at a creature). The toast on a tap stays as
  well.

**Bonus tab.** Everything that costs a Bonus Action, from every kind:
spells with `time: 'bonus'`, features whose `action.time` is `bonus` (Bardic
Inspiration, Second Wind), and the standard actions that are a Bonus Action
for this creature (`actTime`: Disengage or Hide with Nimble Escape). It is a
filter on the other tabs, kept as a tab because it is the question a player
asks every turn: "what can I still do with my bonus action?" Each row also
appears in its own tab.

**Move tab.** Speed left (`budget.move`), as a number and a bar; **Dash**,
**Disengage**, **Dodge**, **Hide**, **Search** and the objects in reach
(`usesFor`), each with its cost and the why; Higher/Lower for fliers (as
today). **Stand up** does not exist as an action: the engine stands a prone
creature by itself at the start of its turn for half its Speed. Until the
engine gets one (below), a prone creature's Move tab says "Prone. You stand
at the start of your turn, using half your Speed." and offers no button.

**Features tab.** Every feature with uses, and the resource it spends, as
rows: name, pips `3 / 4` from `e.uses[f.id]` and `f.uses.max`, "back on a
Short Rest" or "Long Rest" (`usesText`), cost chip, why. Channel Divinity,
Sorcery Points (shown as a pool with the Font of Magic conversions inside),
Wild Shape (with the current form, "leave form"), Lay On Hands (the pool and
its chooser), Rage, Bardic Inspiration, Second Wind. A feature that needs a
choice opens the card from `classes.js`; one that needs a target arms it
(`aimedFeature`). Features with no uses (passive ones) are not listed here;
they are on the Sheet.

**Items tab.** What exists: the creature's `gear` (strings), with its light
if it carries one. Nothing in the engine lets an item *do* anything: no
potions, scrolls or wands with charges, no `items` content, no `item`
action. So the tab is a list, an honest small one, and the DM's torch.
"Potions, scrolls, charges" are a later stage (an `items` content kind that
reuses the effect steps spells use, and an `item` action), listed in the
engine table as not scheduled.

**Conditions on you, how each ends.** The status line carries a pill per
condition and per lasting effect; tapping one opens a small card:

| Source | Says |
|---|---|
| A lasting effect (`S.effects`) | its name, `lasts` ("1 minute"), and `until` as "3 rounds left" or "until 14:30" (the formatting `tracker.js` already has) |
| A concentration effect (`conc`) | "Concentrating on Bless." "Ends if you take damage and fail a Constitution save (DC 10 or half the damage, at most 30), cast another spell that needs Concentration, or are incapacitated." (SRD "Concentration"; the engine's rule is `concentrationCheck`.) A button, **End it**, sends `endEffect` (exists, for effects you own). |
| A condition with no effect behind it | `CONTENT.conditions[id].text` ("Cannot see. ..."), and "Until the DM removes it" for one the DM set with `condition` (the engine's own words when it applies one that nothing ends: "Nothing ends it yet: the DM removes it") |
| Prone | "You stand at the start of your turn, for half your Speed." |
| Dying | "Death saves 1✓ 0✗: rolled for you at the start of your turn." |

**Layouts.**

390 x 844, your turn, Spells tab, a spell armed (rows shrink so the map is
free):

```
┌──────────────────────────────────────┐ 0
│ Round 3 · 08:06             [↶]  [☰] │ top bar 52
│ [Tor][Goblin 2][Brenna][Goblin 1]    │ order strip 30
├──────────────────────────────────────┤ 82
│                                      │
│                the map               │
│        (canvas: taps go to it)       │  about 470 px
│                                [+]   │
│                                [−]   │
│  Fire Bolt: tap a target   [Cancel]  │ #hint
├──────────────────────────────────────┤ 560
│ (Tor) (Brenna) (Ilya)                │ #party chips, 36
│ Tor · Cleric 3       [Sheet][End turn]│ head, 40
│ ▓▓▓▓▓▓░░ 14/24 HP · AC 16            │ 20
│ L1 ●●○  L2 ●○ · Bless (C) 8r ▸       │ status, 28
│ ┌──────────────────────────────────┐ │
│ │ Fire Bolt  cantrip · A · 120 ft  │ │ rows, 2 x 52
│ │ Guiding Bolt L1 · A · 4d6 radiant│ │
│ └──────────────────────────────────┘ │
│ [Attacks][Spells][Bonus][Move][Feat]▸│ tabs, 48, at the thumb
└──────────────────────────────────────┘ 844
```

- Compact by default: about 286 px of panel, so the map keeps about 470 px.
- **Browsing a long list** (Spells with filters) raises the panel to at most
  55 % of the height; **arming a row collapses it again** to the compact
  height, so the map is free to tap a target. Cancelling brings it back. A
  drag on the head moves between compact and raised.
- With a spell armed on a phone the rows are hidden and only head, status
  and tabs remain, about 160 px.

1280 x 800, the drawer pinned:

```
┌──────────────────────────────────────────────────────────┬────────────┐
│ Round 3 · Day 1 08:06                             [↶] [☰]│ Turns  ... │
│ [Tor][Goblin 2][Brenna][Goblin 1]                        │ Round 3    │
│                                                          │ ▶Tor  14/24│
│                         the map                          │  Goblin 2  │
│                                                  [+]     │            │
│                                                  [−]     │            │
│       Fire Bolt: tap a target [Cancel]                   │            │
│   ┌──────────────── action panel (max 760) ───────────┐  │            │
│   │ (Tor)(Brenna)(Ilya)                               │  │            │
│   │ Tor · Cleric 3                [Sheet] [End turn]  │  │            │
│   │ ▓▓▓▓▓▓░░ 14/24 · AC 16 · L1 ●●○ L2 ●○ · Bless (C) │  │            │
│   │ Fire Bolt   cantrip A 120 ft  | Guiding Bolt L1 A │  │            │
│   │ Sacred Flame cantrip A DEX    | Bless L1 A C      │  │            │
│   │ [Attacks][Spells][Bonus][Move][Features][Items]   │  │            │
│   └───────────────────────────────────────────────────┘  │            │
└──────────────────────────────────────────────────────────┴────────────┘
```

On a desktop the rows run in two columns, and the panel is at most 40 % of
the height. The tabs read as a bar, `1` to `6` switch to them when no field
has focus.

**How armed features and class choosers fit.** Arming is unchanged: a tap on
a row sets `mode` (`attack`, `spell`, `feature`, `action`, `follow`);
`refresh()` computes highlights and the hint as it does now. The panel only
reads `mode` to paint the armed row and to collapse. `CLS.sync(mode)` and
`CLS.refused(msg)` keep working because the choosers are still opened by the
same callbacks. `button()` in `app.js` is replaced by a row builder that
adds the visible `why` line and `aria-disabled` instead of `opacity: .45`
alone.

### Decision 7: preferences and settings

**Rule.** A thing that changes how *this person's screen* looks or behaves is
a **client preference** and lives in `localStorage` under `hextable.*`
(through `prefs`). A thing that changes **the rules or what the whole table
sees** is a **table setting**, lives in `state.settings`, and is set by the
DM with the `setting` action. A player never needs a table setting to be
changeable, and a table setting never depends on a device.

| What | Kind | Stored | Exists |
|---|---|---|---|
| Theme | client | `hextable.theme` | yes (`btn-look`) |
| Drawer side (right, left) | client | `hextable.drawerSide` | new |
| Drawer pinned (desktop) | client | `hextable.drawerPin` | new |
| Default action tab (auto, remember) | client | `hextable.panelTab` | new |
| Spell sort order | client | `hextable.spellSort` | new |
| Log filters | client | `hextable.logFilter` | new |
| Animation speed on this device (follow the table, flow, instant) | client, may only be quicker than the table's | `hextable.pace` | yes |
| Dice shown (full, quick, off); always throw my dice at once | client | `hextable.dice`, `hextable.diceAutoMine` | yes |
| Throw the monsters' dice for me (DM, this device) | client | `hextable.diceMonsters` | yes |
| Floors look (rooms, hex); cut away near walls; cave edges | client | `hextable.floors`, `hextable.cutaway`, `hextable.caves` | **address parameters only today** (`?hex`, `?nocut`, `?nocave` in `themes.js`); they become stored preferences, the address parameter still wins for a test |
| Renderer | client, advanced | `hextable.renderer` | yes (`?renderer=`); stays out of Settings |
| Pace of the table (wait, flow, instant) | **table** | `settings.pace` | yes |
| How dice are rolled (auto, throw) | table | `settings.diceThrow` | yes |
| Sight, unseen turns, cover, climbing, vertical distance, passive finds, engage range, auto-engage | table | `settings.*` | yes |
| Who reviews rewards (dm, auto, off) | table | `settings.conclusion` | new |
| How XP is shared (split, full) | table | `settings.xpShare` | new |
| The session token, the solo game, saved pins | not preferences | `hextable.session`, `hextable.solo`, `hextable.solo.pins` | `pins` new |

The Settings tab shows the client preferences, grouped (Look, Controls,
Animation and dice, Table), and a read-only list of the table's rules in
plain words for players ("The DM has set the table to: wait for each beat."
is `#pace-table` today); for the DM each line is a link to where it is
changed (the DM tab). Preferences are per device, not per person: there are
no accounts.

## What the engine must add

One table for the engine lane. "Version" is the state version
(`VERSION` in `migrate.js`, 17 today); "view" is what each role is sent
(`view.js`). Server messages are not state. "Needed for" is the task stage
in the next section.

| # | Addition | Kind | Who may send | DM sees | Players see | Version | Needed for |
|---|---|---|---|---|---|---|---|
| E1 | `checkEnd`: defeat only when no party `pc` is up and none is dying (dead, or Stable); outside a fight `fallen` as Decision 1 says. Tests for: all dying keeps the fight going; a 20 revives; all Stable ends it. | rule change, no new shape | engine | `encounterEnd { result: 'defeat' }`, now after the saves | the same | no | 5 |
| E2 | Fight pin and rest pin in `history.js`: `pin(kind, mark)`, `rewind(state, kind)`, kept in the history dump (`v: 2`, older files load with no pins), counted in `UNDO_BYTES`, never trimmed first. A pin is made when `startEncounter`, `rest` and `shortRest` succeed; dropped by `loadMap`, and the fight pin by a rest. `rewind` keeps `state.rng`. | history | — | `undoable` gains `pins: { fight, rest }` (booleans) | nothing | no | 5 |
| E3 | `{t:"rewind", to:"fight"\|"rest"}`: server handler in `tables.js` beside `undo`, and `t.rewind` in `localTransport` with pins kept in `hextable.solo.pins`. DM only; "Only the DM can rewind." Records one undoable step. | server message | DM | `rewound { to, label }` and a whole view | `rewound { to }` if the step is `shown`, and a whole view | no | 5 |
| E4 | `ADVANCEMENT`: the Character Advancement table as pack data (`content/srd52/advancement.js`: level, xp, proficiency bonus), linted. `lintMonster` also requires `xp`. | content | — | — | — | no | 6 |
| E5 | `xp` on a party `pc` (number), and `state.conclusion` (below). Migration to version 18: `conclusion: null`; each `pc` gets the `xp` its level starts at, from E4. | state | engine | both whole | `xp` on open creatures (every player sees the party's); `conclusion`: `{ id, pending: true }` unpublished, else the published shape | **17 to 18** | 6 |
| E6 | At `endEncounter` with `victory` or `ended` (not `defeat`, not `stalemate`), under `settings.conclusion` (`dm`: build and wait; `auto`: build and publish; `off`: nothing), build `state.conclusion = { id, fight, result, rounds, where, foes: [{ id, name, tpl, xp, counts }], party: [ids], xp: { base, bonus: [{ id, amount, reason }], per: { [pcId]: n } }, loot: [{ id, name, qty, from?, to }], published: false }`. `base` is the sum of `CONTENT.monsters[tpl].xp` over foes with `counts`; a creature with no `tpl` is 0. Under `xpShare: 'split'`, `per[id] = floor((base + bonus) / n)`, n the party `pc`s who took part and are not dead; under `full`, each gets `base + bonus`. | engine | engine | `conclusionReady { id }` | — | 18 | 6 |
| E7 | Action `conclusion`: `{ edit: { foes?: { id: bool }, bonus?: [{ amount, reason }], per?: { id: n }, loot?: { add?: [{ name, qty?, to? }], remove?: [id], assign?: { id: toId\|null } } } }`, `{ publish: true }`, `{ skip: true }`. Refused unless there is an unpublished conclusion. `publish`: adds `per` to each `xp` (and emits `levelReady` where a threshold is crossed), pushes each assigned loot line into that member's `gear`, records the `conclusion` event and a public `chronicle` (`tags: ['fight']`), sets `published`. `skip` clears it. Limits: 40 loot lines, 20 bonus lines, name 60, reason 80. | action | DM only ("Only the DM can settle the rewards.") | events `conclusionEdited { id }` (never to players), `conclusion`, `xp`, `gear`, `levelReady`, `chronicle` | `conclusion` (shaped: creatures the party knew only; totals, bonus reasons, loot), `xp { id, amount, total }`, `gear` (open creatures), `levelReady { id, level }`, `chronicle` (public) | 18 | 6 |
| E8 | `view.js`: `conclusion` in `playerView` (pending marker, then published shape); event `gear` sent to players for creatures that are open (theirs). Extend `gear` with `why` (`dm`, `loot`, `pass`, `drop`, `pickup`) and `with`. | view | — | everything | as the cell above | no | 6 |
| E9 | Settings `conclusion` (`dm`, `auto`, `off`; default `dm`) and `xpShare` (`split`, `full`; default `split`) in `SETTINGS`. | settings | DM (`setting`) | in `settings` | in `settings` (sent as today) | no (absent means default) | 6 |
| E10 | `encounterStart` gains `id` and `where`; `encounterEnd` gains `fight`. `where` is the name of a revealed region holding the fight's centre, else the map's name; never an unrevealed one. | event fields | engine | all | all | no | 7 |
| E11 | `{t:"history", fight: id}`: the server returns the record from that fight's `encounterStart` to its `encounterEnd`, through `viewEvents`, up to 500 entries. | server message | any member | redacted as `history` is | redacted as `history` is | no | 7 |
| E12 | `spellKinds(def)` in `effects.js`, returned as `sp.kinds` by `spellProfile`; a test that lists every spell's kinds so a mistake shows. | rules helper | — | — | — | no | 4 |
| E13 | Multiclass: each entry of `e.spells` says which class gives it (`e.spellClass[id]`), and `e.classes` lists the classes. Asked of #175, not built here. | state | engine (#175) | yes | yes (own) | with #175 | 4 (the Class chip only) |
| E14 | `stand { actor }`: a prone creature on its turn stands, spending half its Speed (floor, in feet); event `stood`. The SRD allows it during a move. | action | controller, DM | `stood` | `stood` | no | 4 (optional) |
| E15 | `cast { ritual: true }`: a spell with `def.ritual`, outside a fight, no slot, ten minutes on the clock; refused otherwise. | action field | controller, DM | `cast`, `time` | the same | no | 3 (optional) |
| E16 | `setLight` allowed for the controller when their `gear` names the item (the same name match `hasKey` and `hasTool` use). | permission | controller, DM | `light` | `light` | no | 3 (optional) |
| E17 | Items between creatures: `pass { actor, item, to }` (a party member within 5 ft), `drop { actor, item }`, `pickUp { actor, object }`, and a map object kind `pile` with `contents` (a content addition and an amendment to `maps-and-objects.md`). One `gear` event per side with `why` and `with`. | actions, content | controller, DM | `gear` | `gear` for open creatures; `object` for a pile in view | 18 or later | 6g (after 6) |
| E18 | Items that do things (potions, scrolls, wands with charges): an `items` content kind reusing the effect steps, and an `item` action. | content, action | controller, DM | — | — | later | not scheduled |
| E19 | The monster AI may attack a creature at 0 Hit Points (SRD: within 5 ft, a critical hit that adds failures). Only if the owner says so (question 1). | AI | engine | — | — | no | after 5 |

Nothing in E1 to E19 lets a client send what the engine should compute: the
client sends `conclusion`, `pass`, `rewind` and the existing actions, and
reads `state` and events.

## Tasks

Ordered so each stage is useful alone. "Client agent" is a Sonnet client-lane
agent; "engine lane" is the strongest model, since these change `engine.js`,
`view.js` or the server (`docs/DEBT.md`). Each task is one pull request and
lists the files it may touch (`AGENTS.md`: anything else, stop and say so in
the issue). Every one runs `npm test` and `npm run build`; the client ones are
checked at 390 x 844 with touch and at 1280 x 800 (`npm run smoke` by hand).

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| T1 | **The drawer, Settings, About.** Closes #173. `#btn-menu`, `#drawer` with tabs Turns (the existing tracker for now), Sheet, Log, Handouts, DM, Settings, About; the existing panels re-parented by id; side and pin preferences; Theme select replaces `#btn-look`; device preferences moved into Settings; floors, cut-away and caves become stored preferences (address parameters still win); `about.js` text; the splash line and an About link on `#lobby`. | client agent | `packages/client/index.html`, `style.css`, `app.js`, `themes.js`, `drawer.js` (new), `about.js` (new), `handouts.js` and `scenes.js` (only the `openPanel` they are given), `scripts/smoke.mjs`, `docs/` | Every old button's job is reachable; the drawer opens from the right and, with the preference, from the left; on a phone it stops above the dock and the dock stays usable; Escape, scrim, swipe and burger close it; focus returns to the burger; About shows the SRD text exactly as `reference/srd52/README.md` has it; the smoke script still passes; nothing is lost from the list in Decision 2. |
| T2 | **The tracker in the drawer.** Rows as in Decision 3: initiative for own side, unseen ghost row, Dying counts, Reaction used for own side only, DM's controls kept and folded behind Edit on a phone; `#order` opens the drawer on the tracker; the turn is announced once per turn through the live region. | client agent | `packages/client/tracker.js`, `style.css`, `index.html`, `app.js` (small) | A player's tracker, with a hidden creature acting, shows no number and no name that the view did not send; the DM's shows all; tapping a row selects, focuses and, on a phone, closes the drawer; works at both sizes; a test in `tests/` drives `rows`/`rowHTML` from a `playerView` and from the full state. |
| T3 | **The action panel shell.** `actionpanel.js`: the head, status line with how-it-ends cards, and tabs by `panelContext`; the **Explore** and **Reactions** tabs from what exists (`usesFor`, Follow, Search, Hide, `reactionsHtml`); one temporary tab, "All", holding today's `#actions` bar unchanged so nothing is lost before T4; compact and raised heights; the `panelTab` preference. E15 and E16 optional beside it. | client agent (engine lane for E15, E16) | `packages/client/index.html`, `style.css`, `app.js`, `actionpanel.js` (new), `reactionsheet.js`, `features.js` (export only) | Exploring shows Explore first with the ranking of Decision 6, the DM's rest buttons, no Lead the party for a player; on another's turn Reactions is greyed with a reason or, with a pending prompt, active and pulsing while `#rp` still answers; the map stays tappable at both sizes; `panelContext` and `rankExplore` have tests. |
| T4e | **Spell kinds.** E12 (and E14 `stand` if taken). | engine lane | `packages/rules/src/effects.js`, `engine.js` (only if E14), `tests/` | `spellKinds` returns kinds for every spell; the test prints the split; no pack file changed. |
| T4a | **Attacks, Bonus, Move, Features tabs.** Rows with visible reasons; Bonus built as the filter described; Move with the budget, standard actions, objects in reach, fly; Features with pips and recharge text; "All" removed once these cover what it held. | client agent | `actionpanel.js`, `app.js` (the `refresh()` bar code is removed), `features.js`, `classes.js` (only where it returns buttons), `style.css`, `tests/` | Every button the old bar built has a row; a greyed row names its reason on screen; Second Wind, Dash, Disengage, Hide, Search, objects and fly rows behave as before; the choosers still open; monsters' `actions` list under Attacks. |
| T4b | **Spells and Items tabs.** The slot strip, sort, filters, the Kind chip from `sp.kinds`, Cantrips and Prepared, Can cast now, the Class chip hidden until #175, Metamagic entry, Items as gear and light. | client agent | `actionpanel.js`, `style.css`, `tests/` | The slot strip is visible whatever the sort; sort and each filter work and combine; a spell greyed shows its reason, including "Nobody within N ft"; a spell armed collapses the panel on a phone and cancelling restores it; sort order is remembered. |
| T5e | **Defeat, engine.** E1, E2, E3. | engine lane | `packages/rules/src/engine.js`, `history.js`, `packages/server/src/tables.js`, `packages/client/transport.js` (`rewind`, pins), `packages/server/README.md`, `docs/DEBT.md` (strike W10 where fixed), `tests/` | A party all at 0 keeps fighting until saves resolve; a 20 revives; all-Stable or all-dead ends in `defeat`; `rewind` restores the fight start with new dice and Undo takes it back; a pin survives a server restart and is dropped by `loadMap`; players cannot send `rewind`. |
| T5c | **Defeat, client.** `defeat.js`: the card for players and the DM, from `fallen(S)`; the three choices with their greyed reasons from `undoable.pins`; solo wording; reopen from the DM tab. | client agent | `packages/client/defeat.js` (new), `index.html`, `style.css`, `app.js`, `transport.js` (`rewind` call only), `tests/` | The owner's scenario (party wiped) shows the card for a player and the DM at both sizes; Rewind returns the start of the fight and the log says so; Carry on closes it; a reload while defeated shows it again. |
| T6e | **Rewards, engine.** E4 to E9. | engine lane | `packages/rules/src/engine.js`, `view.js`, `migrate.js`, `content/srd52/advancement.js` (new), `content/index.js`, `content/schema.js`, `packages/server/README.md`, `tests/` | A won fight makes a conclusion with XP from the pack; `edit`, `publish`, `skip` work and are undoable; players get the pending marker and, after publish, the shaped record and no more; gear events reach players for their own; `levelReady` fires at a threshold; a hidden foe's XP does not name it; state migrates 17 to 18. |
| T6c | **Rewards, client.** `conclusion.js`: the DM's step (foes, bonus lines with reasons, shares, loot add and assign), the card players see, the pending line, "Ready to level up"; the settings in the DM tab. | client agent | `packages/client/conclusion.js` (new), `index.html`, `style.css`, `app.js`, `tablecontrols.js`, `tests/` | A DM can win a fight, add 50 XP "Freed the prisoner" and a shortbow for Ilya, publish, and every player sees exactly that; before publish players see only the pending line; solo is one step. |
| T6g | **Items between creatures.** E17: `pass`, `drop`, `pickUp`, `pile`; the Items tab rows "Give...", "Drop". | engine lane, then client agent | `engine.js`, `view.js`, `content/srd52/objects.js`, `docs/specs/maps-and-objects.md`, `actionpanel.js`, `tests/` | An item can be handed over and dropped and picked up; each is a `gear` event the players of the table see and the log shows; a pile on the map is seen only where it is in view. |
| T7e | **The log, engine.** E10 and E11. | engine lane | `engine.js`, `packages/server/src/tables.js`, `packages/server/README.md`, `tests/` | `encounterStart` has `id` and `where`; `encounterEnd` has `fight`; `history { fight }` returns one fight's record, redacted; a hidden creature's lines are absent for a player. |
| T7c | **The log by combat.** `logview.js`: groups, summaries from `conclusion`, rounds, filters, the Exploring runs, lazy load of older fights; the log's `kind` on every `describe` result. | client agent | `packages/client/logview.js` (new), `app.js` (`beat`, `renderLog`, `describe`), `style.css`, `tests/` | A fight is one collapsed entry with its summary line; open it for the blow-by-blow by round; trades, loot and picked-up or dropped items (as far as the engine sends them) are always present and filterable; a player's log holds nothing a player was not sent; the DM-only chip shows the rest; a reload rebuilds the groups. |

T1, T2 and T3 and T4a to T4b are client-only apart from small engine items
marked optional; they can go in this order with no engine wait. T5e and T6e
can start at any time and are independent of each other; T5c needs T5e, T6c
needs T6e, T7c needs T6e and T7e. T4b's Class chip waits for #175 and ships
hidden meanwhile.

## Risks

- **`app.js` is one file of nearly a thousand lines, and T1, T3 and T4a all
  edit its `refresh()`.** Land them one at a time, in order, and move code
  out of `app.js` into the new module in the same PR, never leave a copy.
- **The panels share ids with the smoke script and with `handouts.js`,
  `scenes.js` and `classes.js`.** Re-parent, do not rename. T1 runs the
  smoke script before and after.
- **Pins cost storage.** A pin is a full copy of the state without the
  timeline. On the server they share the 8 MB budget; in solo they are in
  `localStorage` (about 5 MB) next to the game, and a big map can leave no
  room. The pin is then not made, the DM is told once, and Decision 1 greys
  the choice with its reason. A table that never rewinds pays for two copies.
- **Changing `checkEnd` changes how every fight ends.** A party that is all
  down and dying used to end the fight at once; now the fight runs on a few
  rounds with the monsters passing. Test it against the existing fight tests,
  and the AI's `endTurn` for a foe with nobody to attack.
- **XP numbers can leak a hidden monster.** Handled by the DM's step; and the
  `auto` setting turns that step off on purpose, so its description in the DM
  panel says so.
- **Sorting and filtering are presentation, but the Kind tag is derived.**
  A wrong tag is a wrong filter, not a wrong rule. The test that prints every
  spell's kinds is there to be read by a person once.
- **Many tabs on a small screen.** Six tabs at 390 px is 65 px each; the
  labels are short and the strip scrolls. If a playtest shows it is too
  tight, Bonus (a filter) is the one to fold into Spells and Features.
- **A pinned drawer narrows the canvas.** The renderer follows the canvas
  size, but the camera still centres on the canvas, so the focused creature
  is centred in what is left. That is wanted.
- **The class chip, Items that do things, ritual casting and a spellbook are
  engine work that is not scheduled or belongs to others (#175).** The
  panel ships without them and says so on screen instead of showing a control
  that does nothing.

## Questions for the owner

Only those whose answer changes the design. Each has a default, and work
proceeds on the default.

1. **Should monsters finish off the dying?** By the SRD an attack within 5 ft
   on a creature at 0 Hit Points is a critical hit that adds failures. With
   defeat as Decision 1 puts it, the AI leaves the dying alone. *Default: it
   does, no change to the AI; the DM can `harm` by hand. E19 if you want it.*
2. **Rewind and the dice.** After "go back to the start of the fight", should
   the dice **repeat** (the same choices give the same results, like Undo) or
   **continue** (new dice)? *Default: continue.*
3. **How XP is shared.** The SRD gives each monster's XP and says the GM
   awards it, and says nothing about dividing it. *Default: divided equally
   among the characters who took part and did not die; `xpShare` `full`
   gives each the whole amount.* Should a character who fell and was brought
   back still share? *Default: yes, if alive at the end.*
4. **Can a player lead the party?** `partyFollow` is DM only; the owner's
   Explore tab lists "lead the party". Letting a player send everyone else
   falling in behind them overrides other players' characters. *Default:
   DM only; the row is not shown to players, who can still Follow.*
5. **Two searches or one.** *Default: one (Decision 6).* Say if the two
   labels matter for how the table talks, and the one button can carry
   both words.
6. **Should the drawer open itself?** At the start of a fight, or when the
   DM publishes rewards. *Default: no, the burger carries a badge; the
   defeat and rewards cards open themselves because they are the table's
   turning points.*
7. **Items that do things.** The Items tab lists names until potions and
   scrolls exist as content with effects. Is that worth a milestone ahead of
   Reactions? *Default: later (E18), after Roadmap milestone 2.*

## Build notes

What was settled while building, and where the build differs from the text above.

### Engine, part 1 (T5e, T7e, T4e)

- **E1.** As written. `checkEnd` counts a party's characters (`kind: 'pc'`); a fight with none of
  them on the party's side counts that side whole, as before. A death save that leaves the last
  dying character Stable or dead ends the fight there, before the next turn starts. `fallen(s)` and
  `dying(e)` are exported from `engine.js` so the client reads the rule instead of repeating it.
  No existing fight test had to change.
- **E2, E3.** As written, with these settled: a fight pin is taken whenever an action's events hold
  `encounterStart` (a move or attack that starts a fight pins too), from the state before that
  action. Kept from now on a rewind, not from the pin: the dice stream (owner question 2's default,
  new dice; the dice are a stream in the state, so replaying actions from any saved state is still
  exact, and undo and redo of the rewind are exact), the id counter `seq` (the fight fought again
  has a new id), the timeline (the record keeps the lost fight) and who holds which character.
  Undo and redo leave the pins alone. Players are always sent `rewound { to }`; the undo step's
  label is shown to players too, since going back is something the whole table sees.
  `track()` returns whether the pins changed, so the solo transport writes `hextable.solo.pins`
  only then; if the browser refuses the space, `undoInfo.pinsError` says so and there are no pins.
  The server transport's `rewind` call is left to T5c.
- **E10.** The fight's id on `encounterStart` is named **`fight`, not `id`**: in an event `id`
  names a creature, and `viewEvents` drops an event whose `id` a player may not know. So both
  events carry `fight`. `where` is `null` only for a map with no name.
- **E11.** As written; the answer is `{ t:"history", fight, entries, cut }`, the first 500 entries
  of the fight as the asker may see them, `cut` true if there were more.
- **E12.** `spellKinds(def)` and `sp.kinds`. A spell whose steps are only `manual` (perhaps behind
  an attack roll or a save) gets **no kind**, `[]`, because the engine cannot tell what it is for
  and does not guess; today that is 211 of 339 spells. The client shows those under every kind,
  marked as not known. Steps under a teleport's `blocked` branch (what befalls the caster) do not
  count. `tempHp` and `cure` count as healing.
- **E13** was done by #182 (`e.spellClass`, `e.classes`); nothing added here.
- **E14.** `stand { actor }`: in a fight only on its own turn and for half its Speed (refused with
  the feet needed if too little is left); outside a fight it costs nothing.

### Engine, part 2 (T6e)

- **E4.** `content/srd52/advancement.js`, read from `reference/srd52/srd52-flow.txt` (the Character
  Advancement table under Level Advancement) and checked against the page layout copy; linted
  (levels 1 to 20, XP rising from 0, Proficiency Bonus +2 to +6). `lintMonster` requires `xp`.
  `xpFor(level)` and `levelForXp(xp)` in `rewards.js`.
- **E5.** State version **19** (the spec said 18; #182 took 18). `xp` on every party character,
  set by `makeEntity` from its level and kept across `setSheet` and `levelUp` (never below the new
  level's threshold). `state.conclusion` is `null` in a new game; the migration drops one that is not
  whole. The settings are filled in by the migration and in a new game.
- **E6, E7.** In `rewards.js` (`concludeFight`, `rewardActions`), called from `endEncounter`. The
  conclusion's `id` is the fight's id. Events about it carry **`fight`, not `id`**, for the reason
  given for E10. Settled beyond the text: `edit.bonus` replaces the whole list; `edit.per` sets a
  share by hand, and that share is then kept when foes or bonus change (`xp.fixed` lists them),
  until `per: { id: null }` gives it back to the engine; loot lines have ids `l1, l2...`, bonus
  lines `b1...`; `edit.loot.add` takes `from` and `to`. A bonus is 0 or more (a penalty is a lower
  share). An unpublished conclusion is replaced by the next fight's. Publishing records `seen` on
  each foe (whether the party knew of it at that moment), which the players' card and the public
  chronicle use. `skip` sends `conclusionSkipped { fight }`, to players too. `levelReady { id, level }`
  is sent when this publish takes a character's total past a threshold above its level; `level` is
  the level its XP now reaches.
- **E8.** `gear` now has `why` (`dm` from `give`, `loot` from a conclusion) and goes to players for
  their own creatures; `with` is sent only if they know of that creature (E17 will use it).
- **E9.** As written.
- Levelling up from XP is not automatic, as the spec says.

### T1 and T2: the drawer, Settings, About, the splash, the tracker (PR for #173 and #181)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `drawer.js` (the drawer), `settings.js` (the Settings tab and `rulesLines`), `about.js` (every word of About, as data),
  `drawer.css`, and changes to `tracker.js`, `themes.js`, `index.html`, `style.css`, `app.js`. `.panel` stays in `style.css` because
  `#qe` and `#fgi` are still fixed panels; the drawer's tabs use `.tabpanel`.
- **Ids kept.** Every panel keeps its id (`tracker`, `sheet`, `log`, `handouts`, `dm`); `#btn-handouts` and `#ho-badge` are the Handouts
  tab and its badge, so `handouts.js` and `scenes.js` needed no change. A tab's `hidden` attribute says it is not the open tab, so the
  app draws only what is shown. New ids: `#btn-menu`, `#menu-badge`, `#drawer`, `#drawer-tabs`, `#tab-*`, `#set-*`, `#splash`, `#lobby-about`.
- **Wide and unpinned**, the drawer starts below the top bar, not at the top of the screen: the burger can close it and Undo stays one
  tap. Below 1480 px it also stops above the dock, because the dock (760 px, centred) would otherwise sit under it. Pinned, it is full
  height and the map, top bar, order strip, hint, camera buttons, dock and editor move out of its way (`--inset-l`, `--inset-r`).
- **Tablets (600 to 899 px)** get the phone behaviour (scrim, modal), since there is no room to pin.
- **Handouts tab:** players with handouts only; the DM's are in the DM tab (no empty list for the DM).
- **Splash:** static in `index.html`, so it shows before the script loads; it goes when a table or the lobby shows, after 10 s in any
  case, and by CSS alone after 12 s if the script never runs. It never waits for anything.
- **Settings.** Theme, floors look, cut-away, caves (stored as `hextable.floors`, `hextable.cutaway`, `hextable.caves`; `?hex`,
  `?nocut` and `?nocave` still win, and then the control is off and says so), drawer side and pin, dice, animation, always throw my dice,
  and for the DM the monsters' dice. The renderer choice stays out, as the table in Decision 7 says. The table's rules are listed in
  plain words (`rulesLines`); for the DM each has a "Change" button that opens the DM tab. Not built: default action tab, spell sort and
  log filters (their features do not exist yet).
- **About.** The attribution is the SRD's own Legal Information text, which uses typographic quotation marks; `test/about.test.js`
  compares it with `reference/srd52/srd52-flow.txt`, the two licences with `LICENSE` and `vendor/three/LICENSE`, the version with
  `package.json` and the credited fonts with the ones `index.html` loads. The five fonts are SIL OFL 1.1; the copyright lines come from
  the Fontsource packaging of the Google Fonts files (see DEBT T12). Model packs: an empty list, rendered as "None yet".
- **Burger badge:** waiting players plus unseen handouts. The "undecided conclusion" part waits for Decision 4.
- **T2, the tracker.** Rows come from `trackerRows(S, { dm })` and `rowHTML`, pure and tested from a `playerView` and from the full state.
  Initiative shows where `order[i].init` is a number (own side for a player; everyone for the DM). A party member at 0 shows
  `Dying 1/0` or `Stable` (player characters only). "Reaction used" is shown only where the record has `reactionUsed`, which only open
  creatures do. The unseen slot is a ghost row, not a button, with no id. A tap on a row selects and focuses, and closes the drawer
  below 900 px; each row with a full record has a Sheet button; the order strip opens the drawer on Turns. On a phone the DM's tick
  boxes, amount, damage, heal and skip are behind an Edit button. The turn is spoken once per change in `#drawer-live`, and not when a
  table is joined.
- **Left out of T2, because the view does not send it:** an initiative number or Reaction used for a creature the party sees but does not
  own. Nothing is computed on the client.
- **Smoke.** `SMOKE_ONLY=drawer` is new. The other passes use `openTab(page, tab)` and `closeMenu(page)` where they used the old buttons.
- **Not checked:** a real phone's swipe (the test drives pointer events), a screen reader, and the three themes beyond Classic and Sunlit.

### T5c and T6c: the defeat card and the rewards (PR for #181)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `defeat.js`, `conclusion.js`, `defeat.css`, `conclusion.css`; small changes to `app.js` (`syncCards`, `describe`), `index.html`,
  `tablecontrols.js` (the two table settings), `settings.js` (two plain-words lines), `transport.js` (`rewind` and `pins` on the server transport).
- **Defeat.** `fallen(S)` from the engine decides; the card is drawn from the state (so a reload shows it) once the beats that led to it have played.
  Players: the card of the spec, the fallen named as "died", "down, stable" or "down, dying", "The DM will decide what happens next."; a close button
  and Escape put it aside, and a line at the top ("The party has fallen. Show") brings it back. The map around the card stays tappable (the dim layer
  lets taps through). The DM: three choices, each with its sentence; a choice the engine says is not available (`undoable.pins`, `pinsError` in solo)
  is greyed and shows the engine's words ("No fight to go back to.") in place of its sentence; a rewind asks first ("Undo brings it back"), and a
  refusal is shown on the card. Solo uses "Try the fight again" / "Go back to the last rest" / "Carry on". "Carry on" closes the card on the DM's
  screen only; the DM tab has "Show the card" to bring it back. Hidden while a reaction question is up.
- **Rewind returns to just before initiative**, not into the fight: the party is standing and no fight is on (the pin is the state before the action
  that started it). The card says "as it was when initiative was called".
- **Rewards.** The DM's form edits with the `conclusion` action exactly as PR #188 documents it: foe ticks, the whole bonus list, shares (a hand-set share
  shows "Set by you. Reset"), loot add, assign and remove. Numbers are sent as typed (a whole number as a number) and the engine's refusal is shown on the
  form. The form starts aside, so that a DM who wants to place, heal or look first is not covered: a new fight's rewards wait as a line at the top ("Rewards waiting. Show"), and "Decide later" (or the close button) puts it back; the line at the top and the DM tab bring it back; the burger's badge counts it. Players
  see "The fight is over. The DM is working out the rewards." and nothing else until it is published, then the card; "Continue" dismisses it (remembered per
  table and fight in `hextable.conclusionSeen`) and the Log tab has "Show the last rewards". In solo the form's one button is "Done" and no card follows;
  with `auto` solo sees the published card. The DM sees the published card too.
- **XP on the sheet** is `XP n / next`; "Ready to level up" uses the engine's `levelForXp`, so it also shows after a reload, not only on the `levelReady` event.
- **Settings.** `conclusion` and `xpShare` are in the DM tab's Fight section (the note says `auto` shows players the XP of hidden foes too) and in the
  Settings tab's list of the table's rules.
- **Log.** The `conclusion` event is one line ("Experience: 87 XP each, including 50 for Freed the prisoner. Found: Shortbow (Brenna)."), plus lines for
  `levelReady`, `conclusionSkipped` and `rewound`; `xp` and `conclusionEdited` say nothing. Grouping under the fight is T7c.
- **Left out.** Who would pass a threshold before publishing (the engine does not say), a defeat entry in the Log, the foe names without their numbers when the
  pack names are numbered by the engine ("Wolf 1" is counted as "Wolf" for display only). See DEBT T13.
- **Smoke.** `SMOKE_ONLY=defeat` (solo, both sizes) and `SMOKE_ONLY=rewards` (a DM and a phone player) are new.

### T3: the action panel shell (PR for #231)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `actionpanel.js` (the panel; its top half is pure and has no page in it), `actionpanel.css`, `index.html` (the card's new elements and one
  Settings select), small changes to `app.js` (the card's head and status moved out, `startSpell` and `sizeDock` pulled out of the bar code, `AP.render`
  called from `refresh`), `reactionsheet.js` (`reactionsHtml(S, e, { panel })`: ids prefixed `ap-` so the sheet keeps its own, no heading). `features.js` was not
  touched: nothing needed exporting. `packages/client/test/actionpanel.test.js` is run by `npm test` (it matches `packages/*/test/*.test.js`).
- **Pure parts.** `panelContext(S, e, { mine, dm })` returns the spec's table (situation, every tab, default) with a `built` flag; `visibleTabs` is the built ones plus
  All; `defaultTab` applies the preference and "Reactions if available, else the last tab used"; `rankExplore(S, e, { dm, mode, found })` returns the ordered rows;
  `howItEnds` and `statusHtml` are the status line. Nothing in them computes a rule: they call `usesFor`, `blocked`, `hideProblem`, `reactionsOf`, `canReact`, `lightAt`.
- **Tabs drawn today.** Explore (not in a fight), Reactions (another's turn), Down (one tab, from the death-save count), and **All**, which holds `#actions`
  exactly as `refresh()` builds it (same ids, same buttons, same toasts). The strip of tabs is hidden when there is only one (on your own turn in a fight: All
  alone, so the card is as it was). The tabs the spec lists and T4a/T4b will fill are in `panelContext` already; the shell draws only those with rows.
- **Explore order.** Objects in reach (doable first), then Follow or Stop following (and Lead the party for the DM only), then healing shortcuts when under half and the
  DM's rests (the rests come up here when a party member is under half or has used slots, else at the end), Search, Light a torch, Hide, rituals, Check. Search:
  with `passiveFind` `off` it is in the top four; with a `noticed` or `triggered` event in the last two updates it is moved up to at most the fourth place; otherwise it
  sits after the rows above. The first four rows are large buttons in a two-by-two grid, the rest under More. A greyed row writes its reason under its name
  and sets `aria-disabled`; a tap on it also shows the toast, as the bar does.
- **Healing shortcuts** jump to the matching button of the All tab (Spells and Features tabs do not exist yet) and focus it. **Light a torch** sends `setLight` for the DM and is
  greyed "Only the DM hands out light." for a player (E16 not built). **Rituals** are cast as ordinary spells (E15 not built).
- **Status line.** Conditions, the form, Dying and lasting effects are buttons (`data-how`); a tap opens a small card (`#ap-how`) with how it ends, as the spec's table says, and
  **End it** for an effect whose source you control (all such effects, not only Concentration, because the old `✕` pill ended any of them). The old `✕` pill is gone.
- **Reactions.** Greyed (aria-disabled, class `off`) with the reason shown in the pane when there are no reactions, the Reaction is spent or the creature cannot react; with a
  question for this creature (`S.prompt.reactor`, or `S.pending.ask.reactor` for the DM) the tab is chosen, pulses (steady fill under reduced motion), is announced to
  screen readers, and the pane says "A question is waiting." `#rp` is untouched.
- **Heights.** Compact: the open pane is at most 112 px (two and a half rows of Explore). **More room** (a button at the end of the tab strip, or a drag of 30 px or more on the head)
  raises it to about 55 % of the screen on a phone and 40 % on a desktop; the choice is kept until it is toggled. When something is armed (any `mode` but move) the rows step aside on a phone (up to 600 px) and the card is the head, the status and the tabs; the desktop keeps them. Explore's rows run in two columns from 900 px.
- **Keyboard.** `1` to `6` choose a tab when no field has focus; arrow keys move along the tab strip.
- **Preference `hextable.panelTab`.** `auto` (default), `remember` (the last tab used in each situation, kept in `hextable.panelLast`) and, until T4a, `all` (no tab strip, no collapsing:
  today's card). It is a select in the Settings tab ("Actions, on this device"). `hextable.panelLast` is written only under `remember`.
- **Smoke.** `SMOKE_ONLY=actionpanel` is new. Because the other passes tap `#actions` buttons while exploring, `open()` in `scripts/smoke/lib.mjs` sets `hextable.panelTab` to `all` for
  them (one line, outside the T3 file list; the alternative was editing every tap). The new pass does not use `open()`.
- **Not verified.** A real finger's drag on the head, a screen reader, the three themes beyond Classic, a real asked reaction with the new tab (the smoke sets a pending record in the page;
  `SMOKE_ONLY=prompt` covers the real one with the old bar).

### T4a: the Attacks, Bonus, Move and Features tabs (PR for #235)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `actionpanel.js` (the row builders `attackRows`, `bonusRows`, `moveRows`, `moveBudget`, `spellRow`, `tabRows`, all pure; the page code draws them), `features.js` (`featureRows`, `CHIP`,
  `rechargeText`), `classes.js` (`chooserButtons`, the pure half of what `buttons()` built, and `openFeature(e, id)`), `app.js` (the bar code is gone), `actionpanel.css`, `index.html` (four pane
  containers; the Settings select loses its "always the full bar" choice). Tests: `packages/client/test/actionpanel.test.js`. Smoke: `SMOKE_ONLY=paneltabs` is new.
- **One row shape.** `{ id, kind, label, sub, why, chip, time, armed, pips? }`. `kind` is what a tap does: `send` (an action), `arm` (a mode: `attack`, `action`, `feature`), `spell`, `chooser` (opens the
  card of `classes.js`), `fly` (Higher and Lower) or `none`. `why` is always the engine's own check (`blocked`, uses left, `actionSpent`, `usesFor`, `hideProblem`, `spellWhy`). A greyed row is
  `aria-disabled`, dashed, its name and numbers fade and its reason stays at full strength under it; a tap on it shows the toast and sends nothing.
- **Attacks.** A character's `attacks` (to hit, damage and type, reach or range), or a monster's `actions` (Multiattack, recharge, uses a day, reach or range). An attack taken from Extra Attack, a
  Multiattack pool or Flurry of Blows is checked against that pool and not the action (the old bar greyed the second attack); a bonus-time attack (the Monk's Unarmed Strike) is checked against the Bonus Action.
- **Bonus.** A filter by `time === 'bonus'` over attacks, features, spells (`def.time` bonus), the standard actions that are a Bonus Action for this creature (Nimble Escape: Disengage and Hide; Cunning
  Action, `e.bonusActs`: Dash, Disengage and Hide, sent with `bonus: true`). With no Bonus Action left the tab says `No Bonus Action:` and the engine's words, and every row carries them; with nothing
  to offer it says so. This tab is always on your turn, empty or not.
- **Move.** The Speed left as a number and a bar (the walking Speed with each Dash added), Dash, Disengage, Dodge, Hide, Search, the objects in reach, Higher and Lower for a flyer. A prone creature gets
  the spec's sentence. No stand-up row (engine item, as the text above says).
- **Features.** Every feature that has a button (a self feature, an aimed one, or one that opens a chooser) or uses to count, with its cost chip, pips (`●●○ 2 / 3`, or the number alone above eight),
  and "Back on a Short Rest" or "Long Rest". The pool a feature spends (Divine Spark spends Channel Divinity) is shown on its row. A feature with uses and no button is an info row (a Reaction: "set on the
  Reactions tab"; a pool: "the pool the features above spend"; a feature the DM applies; one that works by itself). Features with no uses are on the Sheet. The older hand-typed Second Wind is a row too.
  Outside your turn the rows are browsable and greyed with the engine's "It isn't X's turn".
- **Which tabs are drawn.** Exploring: Explore, Spells (the `all` tab), Features. Your turn: Attacks (not for a creature with no attack: a wizard opens on Spells), Spells, Bonus, Move, Features. Another's
  turn: Reactions, Spells, Features. A tab with nothing in it is not drawn (Attacks, Spells, Features); Bonus and Move always are on your turn. The Items tab is T4b's.
- **"All" is not gone.** Spells are T4b's, so the tab with id `all` stays and holds the spell buttons and Metamagic as the bar built them, in the Spells position and labelled **Spells**. Everything else
  has a row elsewhere. The `hextable.panelTab = all` preference value and the `open()` line in `scripts/smoke/lib.mjs` are removed: with the bar gone the value would hide Explore and every other row.
  `panelTab(page, id)` in `lib.mjs` opens a tab by tapping it, for the passes that drive a button. The Explore healing shortcuts go to the Features row (Second Wind, Lay On Hands); the spell ones to the
  spell button.
- **Heights.** The compact pane is cut back to whole rows (a row is never cut through the middle), at most 132 px, and a dashed line under it says how many are below and raises the panel when tapped.
  The "more room" button is a small arrow at the end of the strip (it has a label for a screen reader) so five tabs fit at 390 px. Raised: 55 % of the screen on a phone; on a wide screen
  `max(184px, 40vh - 130px)`, since 40 % of the screen minus the head and the tabs left no more rows than compact.
- **From the martial-class pull request (#230).** Rows come from the record, so Patient Defense, Step of the Wind, Stunning Strike, Flurry of Blows, Wholeness of Body and Rage appear with what the engine
  already exposes. Not in the panel yet (DEBT T19): the Brutal Strike and Cunning Strike choices on an attack, Intimidating Presence's targets, Self-Restoration's `cure`, the `free` standing instructions on
  Reactions, and the new events.
- **Not verified.** A real finger; a screen reader on the new rows; the three themes beyond Classic; objects in reach and a prone creature in a browser (the unit tests cover the rows; the send is the old one).

### T4b: the Spells tab (PR for #277)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `actionpanel.js` (pure: `spellRow`, `spellRows`, `slotStrip`, `filterSpells`, `sortSpells`, `castGroup`, `noFilters`, `filtersOn`; the page code draws them), `actionpanel.css`, `style.css` (the old bar's `#actions` rules are gone),
  `app.js` (the spell-button builder in `refresh()` is gone; the panel is given `metamagic(e)`, the Metamagic button of `classes.js`), tests in `packages/client/test/actionpanel.test.js`, and the Spells steps in `SMOKE_ONLY=paneltabs`.
- **The tab id `all` is gone.** The tab is `spells`, its pane `#ap-spells`. `index.html` was not on the issue's list and still carries the temporary pane (`#ap-all` holding `#actions`): `initActionPanel` takes that element, renames it `ap-spells`
  and empties it. The markup should be tidied the next time `index.html` is touched. (The `all` value of `hextable.panelTab` and the `open()` line were already gone with T4a.)
- **Slot strip.** `Level 1 ●●○ Level 2 ●○` from `e.slots` and `e.slotsMax`, in a bar that sticks to the top of the pane, so it stays whatever the sort, the filters or the scroll; a screen reader hears "2 of 3 left". Pact slots are one entry,
  "Pact slots, level N". A creature with no slots has no strip. The strip shares its line with the Sort select and the Filters button (the compact pane is short).
- **Sort** (Level, Name, School, Casting time) is kept per device in `hextable.spellSort`. Level groups Cantrips first; Name is one list; School and Casting time group under headings. Within a group: level, then name.
- **Filters**, kept while the page is open and not between sessions: Casting time (Action, Bonus, Reaction, Longer), Cantrips, Prepared, Kind (Damage, Healing, Control, Utility), Concentration, Ritual, Can cast now. One chip of a group is enough
  (Action or Bonus; Cantrips or Prepared); every group that has a chip on must pass. They sit behind a Filters button with a count (and Clear) so the compact pane keeps room for rows. **Class is not drawn** (#175).
  A spell with `sp.kinds === []` (the engine cannot tell what it is for, E12) passes every Kind chip and says "kind not known" on its row while a Kind chip is on. Prepared is "not a cantrip" (the engine has no spellbook).
- **Greyed.** `spellWhy` (turn, action, no slot, one slot a turn), then range: a spell aimed at a creature with nobody in `targetsFor` says "Nobody within N ft." The engine's list counts allies, since it lets a harmful spell be aimed at
  one, so the reason shows only when nobody at all is in range. The same row feeds the Bonus tab, so it has the reason too. A tap on a greyed row shows the toast and sends nothing.
- **Metamagic** is a row at the top of the list (not sorted or filtered away) with the Sorcery Points; it opens the same card as before.
- **A spell armed** collapses the card on a phone (the shell's rule: any mode but move, up to 600 px) and Cancel puts it back, from this tab as from any other; checked in the smoke at both sizes.
- **Explore's healing shortcuts** for spells now jump to `spell:<id>` in the Spells tab; the filters are cleared first so the row cannot be hidden.
- **Items** was built in the next job (see "T4b: the Items tab" below).
- **Not verified.** A real finger, a screen reader, the themes beyond Classic, and "Nobody within N ft." in a browser (the valley's map is too small to put everyone out of a cantrip's range; a unit test covers it).


### T4b: the Items tab (PR for #285)

What was settled while building, where it differs from the text above, and what was left.

- **Files.** `actionpanel.js` (pure: `itemRows`, `gearRows`, `lightRow`, `potionTargets`; the page code draws them), `actionpanel.css`, `app.js` (the log's lines for `item`, `equip`, `attuning`, `attuned`; nothing else),
  tests in `packages/client/test/actionpanel.test.js`, and `SMOKE_ONLY=items` (`scripts/smoke/items.mjs`). `index.html` has no element for the tab, so `initActionPanel` makes `#ap-items` after `#ap-features` (as the Spells pane did).
- **Drawn when** the creature carries something: a magic item on its sheet, kit by name, or a light. A monster has no tab. In a fight the tab is there on every turn, since `itemUsesFor` greys a use with the engine's own reason ("It isn't Orla's turn.").
- **Three parts.** *Use*: one row for each use from `itemUsesFor(S, e)`, the ones that can be done first, then the greyed with the reason written on the row; the cost chip (Action, Bonus, Free) and charges as pips, `7 / 7 charges` and `1 a use`. Identical
  rows without charges (two Potions of Healing) are one row with `x2`; a tap uses the first. *Carried*: each magic item of the sheet with where it is (Carried, Held or Worn, Not held, Needs attunement, Attuned, Attuning at the next Short Rest) and its buttons;
  kit that is only a name (a hand-typed creature's `gear`) is one "Also carried" line. *Light*: the light carried, or Light a torch.
- **Buttons.** Wield and Put away (a weapon or Shield) or Wear and Take off (the rest) send `equip`; Attune, End attunement, and Cancel attuning (or Keep attunement, for an end that is waiting) send `attune`. An item that is only carried has neither. The reasons are the engine's words,
  worked out in the panel where the action allows no dry run: "can't change what they wear in the middle of a fight", "can't attune ... in the middle of a fight", `attuneProblem` and the three-item limit. A greyed button shows its reason under it, and a tap on it shows the toast and sends nothing.
  What the panel cannot know (an Attunement to a second copy of an item) the engine refuses and the toast says.
- **Spells from items (after E18b).** A use with `spell` is aimed as the Spells tab aims: a tap arms the row (`mode = { kind: 'spell', id, item: { key, which, base, level? } }`), the usual target or hex taps and Cast follow, and `castAct` in `app.js` sends
  `{ type: 'use', item, which, ...aim, level? }` instead of `cast`. The engine greys such a use "Pick a target for X." (or a direction, or where it goes off) until it has an aim; that reason means arm, so the row is not greyed for it (`aimOnly`: a
  reason that starts "Pick a target", "Pick a direction" or "Pick where", on a spell use that is not `self`/`none`); any other reason (not held, not attuned, no charges, not your turn) still greys it. A `self` or `none` spell (Ring of Jumping) is sent at once.
  A use with `upTo` first offers "Cast at level" (`1`, `2 (2 charges)`, `3 (3 charges)`); `level` is sent only when raised, and the number of darts or targets follows it (`targetCount` at the lowest caster level and that slot). The armed row is highlighted and does
  not arm the same spell in the Spells tab. A harmful spell outside a fight only starts the fight (engine rule): the smoke fires the wand on the user's turn.
- **Whom a potion is for.** The row for a potion has a target picker, built in the pane and not on the map: tapping it lists the drinker and each creature not dead within 5 ft (in the fight, if there is one; at 0 Hit Points counts, as in the SRD) and sends `target` only when someone else is chosen. With nobody near, one tap
  sends it. The map is not tapped for a target: the pane is already open, and the picker is large enough for a thumb. The engine still checks reach, walls and height.
- **Light.** `setLight` is the DM's: for a player the row is greyed "Only the DM hands out light." as in Explore. A carried light shows "Put out the torch" for the DM.
- **Log.** `item`: "Orla uses Potion of Healing: Drink on Ilya (6/7 charges left), used up."; `equip`: readies or puts away; `attuning` and `attuned`.
- **Not verified.** A real finger; a screen reader; the themes beyond Classic; a player's own table (the smoke is solo as the DM; the panel reads `e.sheet`, which a controller is sent); a scroll (the pack's `spell-scroll` needs a `spell` on the sheet; `itemUsesFor` is tested in the engine's own tests).
- **Left out.** Give and drop (E17, T6g). A dice tray for an item's roll (`rollsDice` in `app.js` does not know item uses, so the engine rolls at once). Choosing among several spellcasting abilities (the engine gives one).

### E18: using items, engine (PR for #276)

- **The action is `use` with `item`, not a new `item` action.** `{ type: 'use', actor, item: key on the sheet, which?, target? }`
  (`which`: the item's `activate` use, 0 for the first). A new action type needs a label in `history.js`, which was not
  among the files of this job; `use` already reads "used something", which also tells players nothing of what. `use`
  with `object` is unchanged; both at once is refused.
- **What it checks.** A built character (a hand-typed one holds pack items by name only); the item worn or held where its
  magic works and attuned if it needs it (`itemActive`); up and able; in a fight its own turn and the use's time (an
  `action` use is a Magic action, refused on Action Surge's extra action after another, as casting is; `free` takes
  nothing); `cost` charges of what is left (a sheet entry's `charges`, full when not set). A refused use changes nothing.
- **What it does.** `effects` run on the effect runner as a feature's steps do, on the user, or for a potion on
  `target`, a creature within 5 ft (SRD "Potions": drinking it or administering it is a Bonus Action; a creature at 0
  Hit Points can be given one). `consumed` takes the entry off the sheet (and `attuning` that named it); an item that
  gives its holder something would be taken off by remaking the character, checked first (none consumed does today).
- **Spells from items go to the DM.** SRD "Spells Cast from Items": no slot, no components, the lowest level, the user's
  spellcasting ability unless the item gives a DC (+0 with the Proficiency Bonus for a user with none). `cast` would
  open a Counterspell window and give a hider away for a Verbal component, which a spell with no components does not,
  and casting.js was not in this job, so the engine spends the time and charges and sends a `manual` naming the spell,
  its level, DC and attack bonus. **Next:** a way into `cast` for an item (no slot, no components, a given DC and attack,
  the use's time), after which these uses run as spells.
- **Spell Scrolls.** Read at the spell's casting time; refused if no class of the reader has the spell on its list
  ("unintelligible"); a spell above the highest slot level the reader has takes an ability check with that class's
  spellcasting ability (the best, if several) against DC 10 + its level; on a failure the scroll is gone and the spell
  with it (`std` "the spell fades"). DC and attack from the spell's level (`scrollStats`, the SRD table).
- **Events.** `item { id, key, item, pack, use, target?, charges?, max?, consumed? }`; a consumed item also a
  `gear { why: 'used', taken: true }`; then the steps' events or the `manual`. Spending the last charge tells the DM
  (`manual`, partial) that the description may say what that does. Players: their own `item` whole; another creature's
  they know of without `key`, `pack`, `charges`, `max` (view.js).
- **Tiers.** The linter counts a use whose steps are not all `manual` as something the engine applies, so the Potions
  of Healing are `auto` and the Potion of Heroism `assist` (its Temporary Hit Points; Bless is the DM's). Every other
  item keeps its tier.
- **Left out.** Charges back at dawn (rests.js was not in this job; the DM sets `charges` on the sheet), "once a dawn"
  uses, extra charges for a higher spell level (Wand of Magic Missiles, Staff of Healing), Use Magic Device's 1d6 and
  any-scroll reading, the d20 on the last charge, an interrupted reading keeping the scroll.

### E18b: spells from items, and charges at dawn, engine (PR for #284)

- **A spell from an item goes through `cast`.** `use` with `item` on a use with `spell` (or a Spell Scroll) calls
  `castFromItem` (casting.js), the cast path with an item record: the action's aim goes to it as on `cast`
  (`target`, `targets`, `hex`, `choice`, `spare`), and `level` raises the spell where extra charges may. Refused with an
  item: `via`, `slot`, `metamagic`, `empower`, `overchannel`, `repel` (those are a class's own casting). Everything is
  checked before anything is spent; a harmful spell outside a fight starts it, as `cast` does, and spends nothing.
  features.js imports casting.js for this (handler modules did not import each other before; there is no cycle).
- **What it is, by the SRD ("Spells Cast from Items").** No spell slot, so not the one slot spell of a turn; the
  lowest caster level (a cantrip's damage as at level 1); the spell's own casting time, range and duration, whatever
  the use's `time` says (Lesser Restoration from the Staff of Healing is a Bonus Action; Scrying from the Crystal Ball
  takes 10 minutes, so not in a fight); Concentration if the spell needs it; a Magic action is still refused on Action
  Surge's extra action after another. Save DC and attack: the item's `dc` if it gives one (Helm of Telepathy 13), else
  the user's own (`spellStats`, with modifiers), else 8 + Proficiency Bonus and the Proficiency Bonus; a heal's
  "spellcasting ability modifier" is the user's, +0 for a user with none. A user with several spellcasting abilities
  gets the one `castAbilOf` gives (the SRD lets them choose; not offered).
- **Components, Counterspell, hiding.** A wand, staff, ring or helm casts with no components unless its text says
  otherwise (none in the pack does), so nobody can see it being cast: no Counterspell window and a hiding user stays
  hidden. A Spell Scroll loses only Material components: its Verbal and Somatic ones open the Counterspell window,
  and a Verbal one gives a hiding reader away. A countered reading is interrupted, so the scroll is kept (SRD "If the
  casting is interrupted, the scroll isn't lost"); the action is spent.
- **More charges, higher level (`upTo`).** A use with `upTo` costs one charge more a level past its own: Wand of
  Magic Missiles 1 to 3 (cost 1, `level: 1`, `upTo: 3`), Staff of Healing's Cure Wounds 1 to 4. `level` outside that
  is refused, and on a use without `upTo` (Mass Cure Wounds, a scroll). The `item` event carries `level` when raised
  and the `cast` event `slot` (the level it was cast at, as for a slot) and `item` (the item's name).
- **`self`.** Ring of Jumping: Jump on its wearer only.
- **A Spell Scroll's order.** Checked (list, casting time, aim), then the time spent and the `item` event (without
  `consumed`), then the ability check if the spell is above the reader's level (a failure: "the spell fades", the
  scroll is gone, nothing cast), then the Counterspell window, then the scroll goes (`gear` with `why: 'used'`,
  `taken`) and the spell is cast.
- **Dawn (rests.js).** The clock counts minutes from midnight of day 1; dawn is 06:00 (`DAWN`, `dawnsBetween`).
  When `rest`, `shortRest` or `advanceTime` carries the clock past dawns, each built character's item entry with
  `charges` set below its most and a `charges.regain` rolls that many times (once a dawn), up to the most:
  `recharged { id, key, item, pack, gained, charges, max, dice, rolls }`, sent to players for a party creature only. An
  item with no `regain` (the Chime of Opening) gets nothing back. Items whose text says a use comes back once a dawn
  (Helm of Telepathy, Dagger of Venom, Iron Bands) are not tracked: the DM gets one `manual` (partial, DM only)
  naming them at each dawn. The text is read only to word that reminder; nothing is applied from it.
- **Tiers.** The linter now counts a spell use as something the engine applies. Wand of Magic Missiles, Staff of
  Healing, Spell Scroll and Helm of Telepathy are `assist` (the last-charge d20, "once a dawn", and the Helm's
  Detect Thoughts are the DM's); Ring of Jumping, Ring of Shooting Stars, Chime of Opening and Crystal Ball stay
  `manual`, as their spells are (the cast path hands a manual spell's text to the DM, as for any caster).
- **Left out.** The clock moving by rounds in a fight is not watched for dawn; "once a dawn" uses (a sheet entry has no
  field for them: derive.js); Use Magic Device; the d20 on the last charge; Metamagic and the Evoker's additions on a
  spell from an item (refused: they are for the class's own spells, a reading the SRD leaves open); choosing among
  several spellcasting abilities.

### T7c: the log by combat (PR for #286)

What was settled while building, where it differs from Decision 5, and what was left.

- **Files.** `logview.js` (new: the model, `kindOf`, `view`, `html`, and `initLogView` for the page), `app.js` (`beat`, `renderLog`, `describe`, and the `history` handler), `style.css` (`.lg-*`), `smoke/log.mjs`
  (`SMOKE_ONLY=log`), `test/logview.test.js`. `index.html` is not touched: the chip row is made by `logview.js` and put in front of `#log-list`.
- **Model.** The log is a list of blocks, not a flat list: a fight block (by the engine's `fight` id) or an Exploring block (ends at the next fight or after 60 minutes of world time, read from `ev.t`, or the
  state's clock for a live event). Each entry is `{ type, kind, text, cls, dice, round, spoils, t }`. `describe` now returns `[text, class, kind]`; `kind` is `combat`, `explore`, `loot`, `talk` or `dm`, decided by event
  type (`kindOf`). Inside a fight everything that is not loot, talk or DM-only counts as `combat` for the filters; outside a fight a stray blow counts as `explore`.
- **Fights.** Opened by `encounterStart`, closed by `encounterEnd`. What follows belongs to the fight until its `conclusion` or `conclusionSkipped`: `gear` with `why: 'loot'`, `levelReady`, `conclusionReady` and the
  conclusion itself, under "Spoils". The matching `chronicle` (tag `fight`) is dropped inside the group. `undone` of "The fight began" and `rewound` to the fight close it as "Taken back". A fight is open while
  it goes on and collapsed once over; the last Exploring block is open; what a person opens or closes stays so across redraws.
- **Summary.** Place, rounds, outcome, then "Party beat Foes", XP each (or per name when they differ) and the number of items, each only if the view sent it. A fight with no conclusion shows the first three.
- **Filters.** Chips as in the decision, several at once, empty meaning everything; kept as `hextable.logFilter` (a list of kinds). A player has no DM only chip and a stored one is ignored. A fight keeps its summary
  under any filter; an Exploring block with nothing that matches is left out.
- **After a reload.** Online: the `recent` 50 are read first (a fight that began before them is marked as not loaded), then `{ types: ['encounterStart','encounterEnd','conclusion'], limit: 200 }` makes one collapsed block
  per older fight, and opening one asks `{ t:"history", fight }` (once; "Loading" shows meanwhile; `cut` is said). Solo: the whole local timeline is read (`recall`), so a reload rebuilds the groups and nothing is asked for.
  Older fights come in front of everything, in the order of their ids; Exploring between old fights is not rebuilt (only fights are asked for).
- **Gear lines.** `describe` says `pass`, `drop` and `pickup` (`why`, `with`) as the spec's table has them; the engine does not send those yet (T6g), so today only the DM's gift and loot appear.
- **Left out.** Numbering of fights counts the fights this device holds (it is stable once the summaries have come); a log that holds more than 2500 entries drops its oldest blocks; the whole list is drawn again on
  every entry while the Log tab is open (fine at this size, a windowed list if it is not); no defeat entry (see DEBT T13 (5)).

### E17: items between creatures, engine (PR for #290)

- **Actions** (engine/characters.js). `pass { actor, item, to }`, `drop { actor, item }`, `pickUp { actor, object, item? }`,
  by the actor's controller or the DM. `item` is what `give` takes: a magic item's key on a built character's sheet
  (`"i1"`), else a name in `gear` (any case). `pickUp`'s `item` is the id of one thing on the pile (`contents[].id`);
  without it everything on the pile, which in a fight is refused for more than one thing.
- **Who and where.** `pass`: the taker is on the actor's side (`!hostile`: a party member for a player's character),
  not dead, up and not Incapacitated, within 5 ft by `apart` (the map's grid, both grids, height by the `vertical`
  rule), with no wall between (`walled`). `to` naming a creature the party does not know of gets "No such creature.",
  as an id that is nothing (dispatch does not walk `to`, so the handler does; the hidden-ids test walks it). `drop`:
  onto the pile in the creature's cell on the surface under it (in the air: the surface below), or a new pile there.
  `pickUp`: a pile within reach as for using an object (`nearObject`, moved from features.js to world.js so that
  characters.js need not import a handler module).
- **In a fight** (SRD "Interacting with Things"): on the creature's own turn; the first object interaction of the
  turn is free (`flags.interact`, shared with `use` on objects), any more takes the Utilize action, then nothing.
  Fast Hands (a Bonus Action Utilize) is not offered. Outside a fight they cost nothing.
- **What is refused as in use.** A magic item `equipped` (worn or held): "take it off first", and taking off is
  `equip`, outside a fight (so a held magic weapon is not dropped in a fight; DEBT C14 "equipping in a fight").
- **Attunement.** By the SRD an Attunement lasts until the item has been 100 ft away for 24 hours or another
  attunes; the engine keeps Attunement on the sheet's entry, so it ends when the item leaves the sheet. The giver's
  `gear` event says so (`unattuned: true`); an `attuning` (the next Short Rest's) that named it is cleared with an
  `attuning { cleared: true }` event. The taker holds it unattuned.
- **What moves.** A magic item to a built character lands on its sheet (carried, a new key, its `charges`, `base`,
  `type`, `spell` kept); to a creature with no sheet, its name in `gear` (`nameOnly`, as `give`). Names go to `gear`
  (at most 60, `GEAR_MAX`). A sheet that can't take it (60 items) refuses the whole action and both creatures stay
  as they were. A name that is the creature's lit light (a `setLight` torch or lamp, and the only gear of that name)
  carries the light: passed, the light goes to the taker (refused if it has one); dropped, the light goes out on the
  creature and the DM gets a `manual` (partial) that it burns on where it fell.
- **Events.** `gear { id, item, pack?, key?, why: 'pass' | 'drop' | 'pickup', with? | object?, taken?, unattuned?,
  nameOnly? }`, one per side for `pass` (giver first, `taken`, then the taker with its new `key`), one for `drop`
  (`taken`, `object`), one per thing for `pickUp` (`object`). Then `object { object, name, state, stateName, actor,
  verb: 'drop' | 'pickup', placed? | gone? }` for the pile. Players: `gear` for their own (party) creatures, `with`
  if they know the other, `object` only if they are sent the pile, `unattuned` (view.js); `object` as any object
  event, if they see the pile (a pile emptied is gone, so its last event does not reach them).
- **Piles** (`maps-and-objects.md`, build notes, "Piles"): seen where in view, with `contents` only while in view.
- **History labels.** "X handed something to Y", "X dropped something", "X picked something up": never the item,
  since a label goes to players who may not be sent the gear event. `pass` counts `to` among the creatures a player
  must know of for the step to be shown.
- **Helpers for the client** (engine.js): `passTargets(s, e)` → `[{ id, name, why, time }]` (creatures on its side
  within 5 ft), `pickUpsFor(s, e)` → `[{ object, name, items: [{ id, name, pack? }], why, time }]`, `interactionOf(s, e)`
  → `{ why, time: null | 'free' | 'action' }`; `pileContents`, `contentName`, `isPile`.
- **Review of #291.** (1) What a creature the party does not know of drops goes onto a pile of its own in the
  cell, marked `by`, beside the pile the party sees and never merged with it while marked (second round: a party
  drop where a hidden pile lies must be, for players, a drop onto a bare cell: ids, `placed`, the room for 40, the
  `gone` when they empty theirs, the record). A marked pile is not sent and not nameable by a player (`pileOpen`;
  `objectOf` answers "No such object."). When the party knows of the dropper, or it is gone, `seePiles` (from
  `watch`) merges it into the cell's open pile (new `c` ids) or makes it that pile (its id becomes the cell's).
  Pile ids come from the cell (`pile-ground-3_-1`; a marked one `...-h1`), so they count nothing players can't see.
  Third round: the merge moves everything, past 40 if need be (40 only limits a drop onto a pile), so no thing is
  lost on `reveal` or `remove`; a concealed dropper that dies keeps its record marked until revealed or removed.
  `pickUpsFor(s, e, { dm: true })` lists every pile in reach for the DM's screen, the marked ones with `unseen: true`.
  Under los and light a hiding creature's drop seen by the party's own eyes stays marked too: the mark goes with
  the dropper, not the cell (it never leaks; the cost is a pile shown a little late). (2) `pickUp` is refused
  through a wall, as `pass` is. (3) `drop` and `pickUp` events carry `seen` (not sent) when the party saw the
  pile, so the gear event's `object` and the pile's `object` event (`gone` too) still reach them after the pile
  has left the map.
- **State.** No new state version: piles are map objects, `contents` a field on them; older tables have none.
- **Left out.** `map.js` does not lint `contents`; a pile remembered under los/light leaves the view when emptied
  unseen (players learn it was taken); Fast Hands; dropping a held weapon in a fight; Attunement kept at a distance;
  the light of a dropped torch; a creature carrying a pile's contents by weight (encumbrance).

#### For the client job (Items tab: Give..., Drop, Pick up)

- **Give...** on a gear row or a magic item row: list `passTargets(S, e)`; a row with `why` is greyed with that text;
  `time` says "free" or "uses your action". Send `{ type: 'pass', actor: e.id, item, to }`, `item` the sheet key for a
  magic item, else the gear string. An item with `equipped` has no Give or Drop: show "Take it off first".
- **Drop** on the same rows: `{ type: 'drop', actor, item }`; reason from `interactionOf(S, e).why`.
- **Pick up**: the Move tab's objects in reach (or the Items tab) from `pickUpsFor(S, e)` (walls already counted; the DM's screen passes `{ dm: true }` to see piles dropped unseen, `unseen: true`): one row per thing,
  `{ type: 'pickUp', actor, object, item: thing.id }`, and outside a fight "Take all" without `item`.
- **The map** draws a pile (`def: 'pile'`, id `pile-<level>-<q>_<r>`) as a small heap in its cell (the DM's view may
  hold a second, marked `by`, in the same cell: draw them as one heap and list both); an `object` event with
  `gone` removes it; its card lists `contents` names
  (`contentName`, or `name` / the item's name) when sent, "you can't see what is there now" when not.
- **Log** (`logview.js` already reads `why`/`with`): "Brenna gave Tavin Rope", "Brenna dropped Rope",
  "Tavin picked up the Wand of Magic Missiles"; `unattuned` adds "(no longer attuned)".
