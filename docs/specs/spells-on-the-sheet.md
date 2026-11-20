# Spec: spells on the sheet: one Cantrips list, when each spell was chosen, changes by the rules, a clear slots and prepared display

Status: draft by an agent, to be reviewed by the design owner. Issue #568. A design job:
this spec and a clickable picture, [`mockups/spells-on-the-sheet.html`](mockups/spells-on-the-sheet.html)
(open the file in a browser; nothing in it runs the game). No code is written by this spec;
the lead approves it before the build.

It fits two designs on the way: the hover and long-press scroll card of #566 (a spell's text
shown the same way everywhere) and the character screen of
[`one-token-menu.md`](one-token-menu.md) (#527: Character › Cast and Character › Sheet ›
Spells known). It is built after #560 (ability scores) and #566, which touch the same file.

## What the owner asked

The owner, 19 November 2026 at 23:17 ET, during a live game (his words):

> "It actually shows text in one section of cantrips and not in the first section of
> cantrips. Can we have just one section of cantrips? Do the rules allow change of spells
> as you progress? I'd prefer that once you've made a choice it sticks, can that be
> settable? If you select different spells at each level, instead of a checkbox for
> previous level selections, could we display the level when that was selected? Is there a
> more intuitive display for spells, spell slots, prepared spells. In this version, are
> prepared spells different than known spells?"

And at 23:20 ET, after the issue was written: **"Please match the rules for spells, not my
preference."** So the table setting the issue proposed ("Spell choices: by the rules / stick
once chosen") is **dropped** (Decision 0). Everything else in #568 stands.

## The answers to his questions, in plain words

- **One section of cantrips?** Yes: one Cantrips list, each cantrip tagged with where it
  comes from (Wizard, Magic Initiate, a species), each with its text shown the same way
  (Decision 1).
- **Do the rules allow changing spells as you progress?** Yes, and the rules differ by class.
  Some classes swap one spell when they gain a level (Bard, Sorcerer, Warlock); some change
  their prepared spells after every Long Rest (Cleric, Druid, Wizard, and one at a time for
  Paladin and Ranger). The table under "What the rules allow" has each, with the SRD line.
  The sheet offers a change only at the moment the rules allow it (Decision 3).
- **Can choices stick?** Not as a setting: the owner asked for the rules. What sticks is what
  the rules say sticks; nothing else can be changed outside its moment, except by the DM
  correcting a mistake, which is said in the log (Decision 5).
- **Show the level instead of a checkbox?** Yes: an earlier choice is a line that reads
  "chosen at level 3", not a live checkbox (Decision 2). The sheet records the level of each
  pick (Decision 6).
- **A more intuitive display?** Yes: slots as pips by level, one count line, prepared spells
  apart from always-prepared ones, and the Wizard's spellbook as its own list (Decision 4).
- **Are prepared spells different from known spells?** In SRD 5.2, cantrips are *known*:
  you have them all the time. Spells of level 1 and up are *prepared*: every class keeps a
  list of them, as long as its Prepared Spells column. What differs is how often the list
  can change (above). The **Wizard** is the one class with a list of *known* level 1+ spells
  as well: the spellbook. A Wizard prepares from the book; the book only grows.

## What the play test showed (today's build sheet)

Screenshots of `origin/main` at `cb19b64`, 390 x 844 with touch and 1280 x 800, a level 4
Wizard and a level 4 Cleric, each with Magic Initiate as the background's Origin feat:
`/home/claude/shots/568/today-*.png`.

1. **Two cantrip sections.** The Feats section shows Magic Initiate's "Cantrips: 2 of 2" as
   ticks under the feat; the Spells section shows the class's "Cantrips (4 chosen)" further
   down. A Wizard with Magic Initiate (Cleric) has six cantrips in two places.
2. **Text in one, not the other.** The class list's ticks carry the spell's text as a
   `title` (seen on a mouse hover only, never on a phone); the feat's ticks carry none. The
   feat's own description is printed as a paragraph. This is the "text in one section and
   not the first".
3. **Everything is a checkbox, every time.** A level 4 Wizard sees every Wizard cantrip and
   every level 1 and 2 spell as ticks, at creation and at every level-up, with nothing to
   say which were chosen before and which may change now.
4. **The counts are one grey line.** "Cantrips 4 of 4 · Prepared spells 2 of 7 · Spell slots
   level 1: 4 · level 2: 3" wraps over two lines on a phone and is easy to miss.
5. **Always-prepared spells are mixed in.** The Cleric's Life Domain spells show as greyed,
   ticked boxes "Bless (always prepared)" among the spells to choose.
6. **No spellbook.** The engine has none (`actionpanel.js` says so: "Prepared is 'not a
   cantrip'"); a Wizard's sheet has only its prepared spells.

## Rules that bind this design

- Everything goes through `apply()`. A change of spells in a game is an action the engine
  checks against the rules below; the client only shows what may be done.
- The engine never pretends. What the sheet cannot check (a spell copied into a spellbook
  from a scroll, Warlock's Book of Shadows) goes to the DM in words.
- Only SRD 5.2 content. The rules are read from `reference/srd52/srd52-flow.txt`.
- Phones count: every row is a 44 px target; nothing needs a hover to be read.

## What the rules allow

Read from `reference/srd52/srd52-flow.txt` (line numbers there). "Gain a level" is a level
in **that** class (a multiclass Bard swaps on Bard levels only); Magic Initiate's swap comes
with any level.

| Who | Cantrips | Level 1+ spells | New picks a level brings | SRD lines |
|---|---|---|---|---|
| Bard | replace 1 on gaining a Bard level | replace 1 on gaining a Bard level | per the Cantrips and Prepared Spells columns | 5805, 5844 |
| Cleric | replace 1 on gaining a Cleric level | change **any** after a Long Rest | per the columns | 6915, 7476 |
| Druid | replace 1 on gaining a Druid level | change **any** after a Long Rest | per the columns | 9036, 9070 |
| Paladin | (Blessed Warrior's 2) replace 1 on gaining a Paladin level | replace **1** after a Long Rest | per the column | 11910, 11882 |
| Ranger | (Druidic Warrior's 2) replace 1 on gaining a Ranger level | replace **1** after a Long Rest | per the column | 13003, 12957 |
| Sorcerer | replace 1 on gaining a Sorcerer level | replace 1 on gaining a Sorcerer level | per the columns | 14021, 14585 |
| Warlock | replace 1 on gaining a Warlock level | replace 1 on gaining a Warlock level | per the columns | 16270, 16314 |
| Wizard | replace **1 after a Long Rest** | change **any** after a Long Rest, from the spellbook; from level 5, replace 1 after a **Short Rest** (Memorize Spell) | the columns, and **2 spells added to the spellbook** per Wizard level after 1 | 17354, 17851, 17888, 17966 |
| Magic Initiate (feat) | on gaining any level, replace **one** of its spells (a cantrip or its level 1 spell) with one of the same level from its list | | | 20045 to 20058 |
| High Elf (species, SP2) | its cantrip after a Long Rest | | | `species.md`, 19720 on |

Also from the rules: a replacement must be a spell of a level the class has slots for
(Bard, Cleric, Druid, Paladin, Ranger, Sorcerer: "for which you have spell slots"; Warlock:
"of an eligible level"); spells a feature always has prepared do not count against the
Prepared Spells number; the Cleric's Thaumaturge and the Druid's Magician add a cantrip of
the class's list, which counts and swaps as the class's own.

## The recommendation

### Decision 0: no "stick once chosen" setting (owner, 23:20 ET)

The issue proposed a DM table setting, "Spell choices: by the rules (default) / stick once
chosen (the DM can unlock one)". The owner then asked to match the rules, not his
preference. So there is **no such setting**: spell changes follow SRD 5.2 for each class
exactly, when and how many, as the table above. Nothing in `SETTINGS` (`engine/dm.js`) is
added. The DM's power to correct a mistake (Decision 5) is not a setting and not a way
round the rules: it is the fix for a sheet that was entered wrong, and the log says so.

### Decision 1: one Cantrips list, tagged by where each comes from

The Spells section has **one Cantrips list** holding every cantrip the character knows:

```
 CANTRIPS · 6 known
 Fire Bolt        Wizard                         chosen at level 1      ⓘ
 Light            Wizard                         chosen at level 1      ⓘ
 Mage Hand        Wizard                         chosen at level 1      ⓘ
 Ray of Frost     Wizard                         chosen at level 4      ⓘ
 Guidance         Magic Initiate · Cleric · WIS  chosen at level 1      ⓘ
 Sacred Flame     Magic Initiate · Cleric · WIS  chosen at level 1      ⓘ
```

- **The tag** is the source: the class (`Wizard`), a feat with its list and ability when they
  differ from the class's (`Magic Initiate · Cleric · WIS`), a Fighting Style
  (`Blessed Warrior · CHA`), a species (`High Elf · INT`, once SP2 lands). A cantrip that
  comes from a class feature that adds one (Thaumaturge, Magician) is tagged with the class:
  it counts and swaps as the class's own; the count line says "Cleric 4 (3 + Thaumaturge)".
- **The text** of every cantrip is shown the same way: the #566 scroll card on a 3-second
  hover or a long-press, and an `ⓘ` button at the row's end that opens the same card on a
  tap (so a phone player never has to discover the long-press). Every spell row in this spec
  has the same card.
- **Open picks** are rows too: "+ Choose a Wizard cantrip (1 left)", one row per source with
  picks left, at the foot of the list. A tap opens the chooser (Decision 3).
- **Magic Initiate's block under Feats** keeps what is the feat's own: the spell list and the
  spellcasting ability. Its spells are chosen in the Spells section, and the feat's block
  says so: "Its 2 cantrips and its level 1 spell are chosen under Spells, below." The level 1
  spell is in the always-prepared group (Decision 4) with its free casting.

A character with no Spellcasting feature but a feat or species that gives spells (a Fighter
with Magic Initiate) gets the same Spells section, with only the parts it has.

### Decision 2: an earlier choice is a line, "chosen at level N"

A spell chosen before is **not a checkbox**. It is a row with its name, tag and
"chosen at level N" (the character's level when it was chosen; Decision 6). An older sheet
that has no level for it reads **"chosen before levels were kept"**. The row holds a
**Change** button only when the rules allow a change of that spell at this moment
(Decision 3); otherwise the row says, in small words under it, when it can change:

| Class | The line under a locked cantrip | The line under a locked prepared spell |
|---|---|---|
| Bard, Sorcerer, Warlock | "One cantrip can change when you gain a Bard level." | "One spell can change when you gain a Bard level." |
| Cleric, Druid | "One cantrip can change when you gain a Cleric level." | "Prepared spells change after a Long Rest." |
| Paladin, Ranger | "One cantrip can change when you gain a Paladin level." | "One spell can change after a Long Rest." |
| Wizard | "One cantrip can change after a Long Rest." | "Prepared spells change after a Long Rest, from your spellbook." (level 5+: "…; one after a Short Rest.") |
| Magic Initiate | "One of this feat's spells can change when you gain a level." | (same) |

The line is said once per group, not under every row (on a phone, six identical lines are
noise): it sits under the group's heading, and a row that **can** change carries the button.

A spell picked **in this sitting** (not yet saved) shows "new" and an ✕ to take it back,
since nothing has been decided until Save.

### Decision 3: changes offered only when the rules allow, at that moment

What the Spells section offers depends on **the moment** it is opened in:

| Moment | Where | What may change |
|---|---|---|
| **A new character** | build sheet: Add, My characters › New | everything: every pick is open, recorded at the level built (question 1) |
| **Level up** | build sheet: Level up (the DM, today) | the new picks this level brings (the columns; Wizard: 2 spellbook spells); and, for the class that gained the level, the swaps of the table above that come "on gaining a level" (one cantrip; Bard, Sorcerer, Warlock one prepared spell); Magic Initiate's one swap. Nothing else. |
| **After a Long Rest** | character screen (one-token menu) › Sheet › Spells › **Change spells**, open until it closes (below) | Cleric, Druid, Wizard: any prepared spell (Wizard: from the book); Paladin, Ranger: one prepared spell; Wizard: one cantrip; High Elf: its cantrip |
| **After a Short Rest** | as above | Wizard level 5+: one prepared spell (Memorize Spell) |
| **Any other time** | anywhere | nothing; the rows show when they can change |
| **The DM corrects** | build sheet: Edit (the DM) | anything, said in the log (Decision 5) |
| **My characters, between games** | My characters › Edit | nothing about spells by default; "Correct a mistake" opens them, noted in the file (question 6) |

**The chooser.** Change or Choose opens one chooser (on a phone, a sheet over the build
screen with its own Back; on a wide screen, a column beside the list). It lists only the
spells that are legal for this pick: the source's list, a level the class has slots for, not
already known, and for a Wizard's prepared spell only spells in the book. Each row has its
`ⓘ` card. Picking one replaces the spell (Change) or fills the pick (Choose); the list shows
it as "new" with ✕. A swap that the rules count ("one cantrip") is counted on the group's
heading: "Swap 1 cantrip on gaining a level: 0 of 1 used".

**The window after a rest.** When a Long Rest finishes, each party character whose rules
allow a change after it gets a **window**: the character screen shows one quiet line above
its groups, "After your Long Rest you may change your prepared spells. **Change spells** ·
Done". The window closes when the player taps Done, when a fight starts, or at the next
rest (which opens its own); and a one-spell allowance (Paladin, Ranger, Wizard's cantrip,
Memorize Spell) closes when used (question 3). Nothing about the rest itself waits for it.

**Who sends it.** In a game, the player who controls the character (and the DM) sends a
change in a window; the engine checks it. Level up stays the DM's action, as today
(question 4).

### Decision 4: slots, prepared, always prepared and the spellbook, laid out

The Spells section reads top to bottom (the same blocks, read-only, are Character › Sheet ›
Spells in the one-token menu; the slot pips are the ones its status block and Cast group
already show):

```
 SPELLS                                   Wizard · INT · save DC 13 · attack +5
 Slots   Level 1 ●●●●   Level 2 ●●●                        back on a Long Rest
 ┌ Cantrips 6 ┐ ┌ Prepared 7 of 7 ┐ ┌ Always prepared 1 ┐ ┌ Spellbook 12 ┐

 CANTRIPS · 6 known                     One cantrip can change after a Long Rest.
   (Decision 1's list)

 PREPARED · 7 of 7                      Prepared spells change after a Long Rest, from your spellbook.
   Level 1   Magic Missile · Shield · Mage Armor · Detect Magic · Sleep
   Level 2   Misty Step · Web
 ALWAYS PREPARED · do not count
   Bless          Magic Initiate · Cleric · WIS  once without a slot per Long Rest
 SPELLBOOK · 12 (Wizard)
   Level 1   ★Magic Missile ★Shield ★Mage Armor ★Detect Magic ★Sleep  Feather Fall  Thunderwave  Burning Hands
   Level 2   ★Misty Step ★Web  Scorching Ray  Invisibility
             ★ prepared · each "added at level N"
```

- **Slots** are pips by spell level, the number beside them; Pact Magic says "2 slots of
  level 3 · back on a Short Rest". In a game the pips show what is spent (hollow).
- **The count tiles** are four short tiles on one row (two by two on a phone), each a tap
  target that scrolls to its group. Prepared turns the theme's bad colour when over and says
  "pick 2 more" when under.
- **Prepared** is grouped by spell level, each row with its tag and "chosen at level N".
- **Always prepared** is its own group, each with its source (Life Domain, Magic Initiate)
  and its free casting when it has one; it never appears in the lists to choose from, so
  there are no greyed ticked boxes.
- **The Wizard's spellbook** is its own group: every spell in the book by level, the prepared
  ones starred, each "added at level N" (or "copied", Decision 6). Preparing a Wizard spell is
  done **from the book** (a tick in the book, when a window allows it); the chooser for a
  Wizard's prepared spell lists the book only. Adding to the book is a pick of the level-up
  (2 per Wizard level) and the six of level 1.
- **Multiclass**: one Slots row (the combined table), and Cantrips and Prepared grouped by
  class, each class's tag and count.

### Decision 5: the DM corrects; the log says so

The DM's Edit on the build sheet stays what it is for: fixing a sheet entered wrong. It is
**not bound by the moments** of Decision 3, but it is plain: the build sheet's title reads
"Correct Wren's sheet", a line under it says "Changes here are corrections, outside the
rules for changing spells; the log says what changed", and the engine's event names the
spells changed (`corrected`: "The DM corrected Wren's spells: Sleep for Thunderwave."). A
spell the DM adds is recorded at the character's level now. This is not a table setting and
offers nothing to players (question 5).

### Decision 6: the sheet records when each spell was chosen

Two optional sheet fields (`derive.js`, the sheet's comment and `validate`):

- **`spellsAt: { [spellId]: level }`** beside each list of spells: on the sheet with one
  class, beside `spells`; with several classes, in each `classes[i]` beside its `spells`; in
  each `feats[i]` that has `spells` (Magic Initiate); in `species` beside its `spells`
  (with SP2). `level` is the **character level** at which the spell was chosen, a whole
  number from 1 to the sheet's level. A spell with no entry was chosen before levels were
  kept. `validate` refuses an entry for a spell not in its list, or a level above the
  sheet's.
- **`book: [{ id, at?, copied? }]`** on a Wizard's class (the sheet, or its `classes[i]`):
  the spellbook. `id` a level 1+ Wizard spell, `at` the character level it was added at,
  `copied: true` for one copied from a scroll or another book (SRD 17939 on: gold and time,
  the DM's to allow; the build sheet adds one only in the DM's correction or a later stage).
  `validate`: every Wizard prepared spell is in the book; the book's spells not copied number
  at most 6 + 2 per Wizard level after 1 (plus what a subclass adds, the Evoker's Evocation
  Savant: 2, and 1 each time a new slot level comes); each of a level the Wizard had slots
  for when added (by `at`, when known). Evocation Savant's text today says "Add two Evocation
  spells …" and becomes those picks.

**Migration.** The state version goes up one (`migrate.js`): nothing is rewritten. A sheet
without `spellsAt` reads every spell as chosen before levels were kept. A Wizard sheet
without `book` is read as a book that holds its prepared level 1+ spells, all "added before
levels were kept", and the Spells section says "Your spellbook holds only your prepared
spells; add the others (up to N) when you next level up or ask the DM." The version is
raised so that an older server refuses a table whose sheets carry the new fields, as with
the earlier optional fields. A character file in My characters keeps `v: 1`: the fields are
optional; an older build reading a file that has them says the sheet cannot be played (its
`validate` sentence), which is acceptable for files made by a newer build.

**The rules, in the engine.** One pure function in `derive.js`,
`spellChanges(before, after, moment)`, returns the problems with a change of spells, in
words, for a moment of Decision 3 (`'level'` with the class that gained it, `'long'`,
`'short'`, `'new'`, `'correct'`). `levelUp` runs it with `'level'`; a new action
**`respell`** `{ actor, sheet }` (in `engine/characters.js`) runs it with the open window's
moment and refuses outside one; `setSheet` by the DM is `'correct'` and emits `corrected`.
The window is `e.respell = { after: 'long' | 'short', used: {...} }` on the creature, set by
`rest` and `shortRest`, cleared by `respell` with `done`, by a fight starting, and by the
next rest. No table setting is read.

## The words

| Where | Words |
|---|---|
| Group line, cantrips (Wizard) | One cantrip can change after a Long Rest. |
| Group line, cantrips (others) | One cantrip can change when you gain a {Class} level. |
| Group line, prepared (Cleric, Druid) | Prepared spells change after a Long Rest. |
| Group line, prepared (Wizard) | Prepared spells change after a Long Rest, from your spellbook. |
| Row, earlier pick | chosen at level {N} |
| Row, older sheet | chosen before levels were kept |
| Row, this sitting | new · ✕ |
| Open pick | + Choose a {source} cantrip ({n} left) |
| Swap count | Swap 1 cantrip on gaining a level: {u} of 1 used |
| Window line | After your Long Rest you may change your prepared spells. Change spells · Done |
| Window line, one spell | After your Long Rest you may replace one prepared spell. Change spells · Done |
| DM correction title | Correct {name}'s sheet |
| DM correction note | Changes here are corrections, outside the rules for changing spells; the log says what changed. |
| Log | {name} prepares {new} in place of {old}. · The DM corrected {name}'s spells: {new} for {old}. |
| Spellbook, migrated | Your spellbook holds only your prepared spells; add the others (up to {n}) when you next level up, or ask the DM. |
| Feat block | Its {n} cantrips and its level 1 spell are chosen under Spells, below. |

## States

- **Nothing to choose:** a non-caster with no spell-giving feat or species has no Spells
  section, as today.
- **Over the count** (an imported sheet): the tile in the bad colour, the problem line under
  Save as today (`validate`'s sentence), and every row still readable.
- **A spell the content lacks** (a homebrew pack not loaded): the row reads "{id}: not loaded
  at this table", kept, as subclasses are today.
- **Read-only** (Character › Sheet › Spells with no window open): the same blocks, no Change
  buttons, the group lines say when.

## The mockup

[`mockups/spells-on-the-sheet.html`](mockups/spells-on-the-sheet.html): a phone frame
(390 x 844) and a desktop frame (1280 x 800); two characters (Wren, a level 4 Wizard with
Magic Initiate (Cleric); Brenna, a level 4 Cleric of the Life Domain with Magic Initiate
(Wizard)); four moments (New character, Level up to 5, After a Long Rest, Any other time).
Change and Choose open the chooser; `ⓘ` and a long-press or a 3-second hover show the
scroll card. Screenshots: `/home/claude/shots/568/mock-*.png`.

## Build plan

| Stage | What | Files |
|---|---|---|
| **SS1** (rules) | `spellsAt` and `book` on the sheet; `validate`; derive reads `book` (prepared ⊂ book); state version and migration; tests | `derive.js`, `migrate.js`, `packages/rules/test/derive.test.js` |
| **SS2** (rules) | `spellChanges(before, after, moment)`; `levelUp` checks it; `respell` and the window from `rest` and `shortRest`; `corrected` on a DM's `setSheet`; view and log words; tests per class row of the rules table | `derive.js`, `engine/characters.js`, `engine/rests.js`, `view.js`, tests |
| **SS3** (client) | the build sheet's Spells section: one Cantrips list with tags, "chosen at level N", the moments, the chooser, the slot pips and tiles, always prepared, spellbook; the Magic Initiate block's line; `ⓘ` and #566's card; smoke step in the classes pass | `buildsheet.js`, its CSS, `packages/client/test/`, `scripts/smoke/classes.mjs` |
| **SS4** (client) | Character › Sheet › Spells (one-token menu) read-only blocks and the window line with Change spells; until the one-token menu lands, the same in today's sheet tab | `app.js` (`renderSheet`), the one-token menu's files when built |
| **SS5** | a Wizard copying a spell into the book (gold and hours, DM-approved); High Elf's swap (with SP2) | later |

DEBT lines are added by the build PRs (the spellbook copying until SS5; the Warlock's Book of
Shadows stays manual).

## Risks

- **A level-up that changes what may not change.** Today the DM's level-up accepts any
  sheet; SS2 refuses changes outside the rules. A DM used to fixing things during level up
  uses Edit (correction) for those, and the refusal says so: "A Cleric changes prepared
  spells after a Long Rest; to correct the sheet, use Edit."
- **Older sheets** have no levels; "chosen before levels were kept" on every row is honest
  but grey. It fades as characters level.
- **The window after a rest** is a new thing a player can miss; it is one line on the
  character screen and closes by itself in a fight, so a missed window costs nothing.

## Questions for the owner (with the default if no answer)

1. **A character built at level 5: what level are its picks "chosen at"?** Default: **5**
   for every pick (the sheet does not invent a history). Alternative: ask the level for each.
2. **Older sheets:** default **"chosen before levels were kept"**, locked like any earlier
   pick. Alternative: treat them as chosen at level 1.
3. **How long the window after a rest stays open:** default **until Done, a fight starts, or
   the next rest** (one-spell allowances close when used). Alternative: until the
   character's first action after the rest.
4. **Who may change spells in a window:** default **the player who controls the character,
   and the DM**. Level up stays the DM's, as today. Alternative: the DM only.
5. **The DM's correction:** default **the DM may correct anything, said in the log** (it is
   how a mistake is fixed, not a way round the rules). Alternative: the DM's Edit is bound
   by the same moments, and a mistake needs a level-up or a rest.
6. **Editing in My characters, between games:** default **spells locked**, with "Correct a
   mistake" that opens them and is noted in the file's edit record. Alternative: My
   characters edits are free (no game is attached).
7. **The Wizard's copied spells:** default **the DM adds them by correction until SS5**.
   Alternative: build SS5 (gold and time) with SS3.
8. **A swap's history:** default the row shows only "chosen at level N"; the log keeps
   "Mage Hand in place of Light". Alternative: the row also says "in place of Light".
