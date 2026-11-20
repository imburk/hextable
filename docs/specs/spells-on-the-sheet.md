# Spec: spells on the sheet: one list of checkboxes, the level a spell was chosen at in its box, changes by the rules, a clear slots and prepared display

Status: draft by an agent, to be reviewed by the design owner. **Round 2** (the owner tried the
round 1 mockup; see "Round 2 feedback" below, which amends Decisions 1 to 4 and the words and
mockup sections). Issue #568. A design job:
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

## Round 2 feedback

The owner tried the round 1 mockup, levelling a Wizard up to level 5 (his words, 20 November
2026):

> "Selecting new spells was a two step process, can't it be 1. I liked the simplicity of check
> boxes on the last version, I just meant instead of a check in a checkbox, you put the level
> at which the spell was acquired, so a 1 instead of a check but in the checkbox. When I
> selected a spell in step two, the whole list bounced around versus just showing I selected a
> spell. It's just not intuitive."

He had also said: **"Please match the rules for spells, not my preference."** That still binds:
the rules in "What the rules allow" are unchanged; only how they are shown changes.

| # | What he said | What the design does now | Where |
|---|---|---|---|
| R2-1 | "a two step process, can't it be 1" | Choosing at a level-up is **one step in one list**. Every spell the class may take is a checkbox row in that one list; the top says "Choose 2 more" and turns to "All chosen" when the count is met; the foot button (Level up to 5, Save, Done) opens when it does. There is no chooser, no second screen, no "+ Choose" row. A swap the rules allow is in the same list (tap the old spell's number to give it up, tap a new one to take its place); see Decision 3. | Decisions 1, 3, 4 |
| R2-2 | "I liked the simplicity of check boxes ... a 1 instead of a check but in the checkbox" | Each row has a checkbox, and a chosen spell's box **holds the level it was chosen at** ("1", "3"), not a tick. | Decision 2 |
| R2-3 | (level of a spell chosen now) | A spell chosen in this sitting shows **the current level as a number, on a gold box**, at once; the number is what will be saved. A tick that turns into a number on Save was rejected (see Decision 2: it changes a glyph the player has already read, and shows nothing about what is recorded). | Decision 2 |
| R2-4 | "the whole list bounced around ... just showing I selected a spell" | **A tap changes the box, the counts and one line of words, and nothing else.** The list is built once and is never re-sorted, rebuilt, opened, closed or scrolled by a tap; rows have a fixed height; sections do not open or close; chosen rows stay where they are. Checked in the mockup by measuring every row's place before and after each tap: 0 px of movement over 50 taps (see "Nothing moves"). | Decision 7 (new) |
| R2-5 | "It's just not intuitive" | Fewer kinds of thing on screen: one list, one kind of row, one count. Rows that were "locked lines" in round 1 are the same rows, unchanged in look; a tap on one that cannot change says when it can. | Decisions 2, 3 |

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
- **Show the level instead of a checkbox?** Yes, in round 2's words: the checkbox stays and
  **holds the level** ("3") where a tick would be (Decision 2). The sheet records the level of
  each pick (Decision 6).
- **A more intuitive display?** Yes: slots as pips by level, one count line, always-prepared
  spells apart from the ones you choose, and the Wizard's spellbook and prepared spells in
  the one list (Decision 4); and a list that does not move when you tap it (Decision 7).
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
- Phones count: every row is a 44 px target (the row is 52 px, its box, ★ and ⓘ each a 44 px
  target); nothing needs a hover to be read.
- **Nothing moves when a box is tapped** (Decision 7).

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

### Decision 1: one list, one Cantrips group, a checkbox on every row

The Spells section is **one list of checkbox rows** (round 2: no chooser, no second step). It
is made of groups under fixed headings, each with its own count on the heading's right
("6 of 6"). **There is one Cantrips group** (the owner's first ask, kept), not one per source:
for a Wizard with Magic Initiate (Cleric):

```
 CANTRIPS                                                   6 of 6
 Wizard 4 and Magic Initiate (Cleric) 2; the source is under each name.
   [ ] Acid Splash                                           ⓘ
   [1] Fire Bolt        Wizard                               ⓘ
   [1] Guidance         Magic Initiate · Cleric · WIS        ⓘ
   [ ] Resistance       Cleric list · Magic Initiate         ⓘ
   ...                  (every cantrip either list offers, A to Z, chosen or not)
 LEVEL 1 SPELL · MAGIC INITIATE (CLERIC)                    1 of 1
 SPELLBOOK                                     12 of 12   ★ 7 of 7
   LEVEL 1
   [1] Detect Magic                                   ★     ⓘ
```

- **One Cantrips group; the tag is the source**, shown under the name of a chosen cantrip: the
  class (`Wizard`), a feat with its list and ability (`Magic Initiate · Cleric · WIS`), a
  Fighting Style (`Blessed Warrior · CHA`), a species (`High Elf · INT`, once SP2 lands). A
  cantrip that only a feat's list offers says so before it is chosen ("Cleric list · Magic
  Initiate"). A tap on a cantrip both lists offer takes the class's place first, then the
  feat's; a group with no place left says so on the status line. Each source has its own cap
  (the hint line says "Wizard 4 and Magic Initiate (Cleric) 2"; the count line of a Cleric
  with Thaumaturge says "Cleric 4 (3 + Thaumaturge)": it counts and swaps as the class's own).
- **A row is** the box, the spell's name, and `ⓘ` (the #566 scroll card on a tap, and on a
  3-second hover or a long-press of the name, so a phone player never has to discover the
  long-press). Every spell row in this spec has the same card.
- **Every spell the source offers is a row**, chosen or not, in a fixed order (cantrips, then
  spell level 1 up, each A to Z). A level-up adds rows when it opens a new spell level
  (level 5 adds level 3 spells); it never takes a row away or reorders them.
- **There are no "open pick" rows** ("+ Choose a Wizard cantrip (1 left)" of round 1 is
  dropped): the unchosen rows are the choices, and the count is at the top.
- **Magic Initiate's block under Feats** keeps what is the feat's own: the spell list and the
  spellcasting ability. Its spells are chosen in the Spells section, and the feat's block
  says so: "Its 2 cantrips and its level 1 spell are chosen under Spells, below." The level 1
  spell is its own group, marked always prepared, with its free casting.

A character with no Spellcasting feature but a feat or species that gives spells (a Fighter
with Magic Initiate) gets the same Spells section, with only the groups it has.

### Decision 2: the checkbox holds the level the spell was chosen at

(Round 2 replaces "an earlier choice is a line, 'chosen at level N'".)

- **A chosen spell's box holds a number: the character level it was chosen at.** A Wizard's
  Fire Bolt from level 1 reads `1`, Ray of Frost from level 4 reads `4`. An empty box is a
  spell not chosen. There is no tick anywhere on the screen. The row's accessible name says
  it in words ("Fire Bolt, chosen at level 1").
- **A spell chosen in this sitting shows the current level at once**, as the same number on a
  **gold filled box** (earlier choices are an outlined box in the text colour). *Chosen:* the
  number, not a tick that becomes a number on Save. *Why:* the number is exactly what the
  sheet will record (Decision 6), so the screen already says what Save will keep; a tick that
  changes glyph at Save is a change after the fact, to a thing the player has already read as
  "done"; and one glyph class (a number in a box) means one thing to learn. The gold fill is
  what tells new from earlier, so colour is not the only cue (filled versus outlined, and the
  top line counts them). A legend sits on the status line: "The number in a box is the level
  you chose the spell at."
- **An older sheet** with no level for a spell reads a **dash** in the box (accessible name
  "chosen before levels were kept"); it fades as the character levels.
- **Size and room at 390 px:** the box is 30 px inside a row that is 52 px high; the row's
  name area is one target at least 44 px wide and 52 px high, and the ★ and ⓘ buttons are 44 px
  each. Two digits (levels 10 to 20) fit in the same box. Measured at 390 px: no target is
  under 44 px and the list does not scroll sideways.
- **Taking one back:** a spell chosen in this sitting is taken back by tapping its box again.
  Nothing is decided until Save (or Level up to N, or Done).
- **A spell that cannot change now** looks the same as any earlier choice. A tap on it does
  not change it; the status line says when it can: this is the table of lines, said on the
  status line (and once under the group heading, as a rule line that does not change):

| Class | The line for a cantrip | The line for a prepared spell |
|---|---|---|
| Bard, Sorcerer, Warlock | "One cantrip can change when you gain a Bard level." | "One spell can change when you gain a Bard level." |
| Cleric, Druid | "One cantrip can change when you gain a Cleric level." | "Prepared spells change after a Long Rest." |
| Paladin, Ranger | "One cantrip can change when you gain a Paladin level." | "One spell can change after a Long Rest." |
| Wizard | "One cantrip can change after a Long Rest." | "Prepared spells change after a Long Rest, from your spellbook." (level 5+: "…; one after a Short Rest.") |
| Magic Initiate | "One of this feat's spells can change when you gain a level." | (same) |

### Decision 3: changes offered only when the rules allow, at that moment

What the Spells section offers depends on **the moment** it is opened in:

| Moment | Where | What may change |
|---|---|---|
| **A new character** | build sheet: Add, My characters › New | everything: every pick is open, recorded at the level built (question 1) |
| **Level up** | build sheet: Level up (the DM, today) | the new picks this level brings (the columns; Wizard: 2 spellbook spells); and, for the class that gained the level, the swaps of the table above that come "on gaining a level" (one cantrip; Bard, Sorcerer, Warlock one prepared spell); Magic Initiate's one swap. Nothing else. |
| **After a Long Rest** | character screen (one-token menu) › Sheet › Spells, the same list made live until the window closes (below) | Cleric, Druid, Wizard: any prepared spell (Wizard: from the book); Paladin, Ranger: one prepared spell; Wizard: one cantrip; High Elf: its cantrip |
| **After a Short Rest** | as above | Wizard level 5+: one prepared spell (Memorize Spell) |
| **Any other time** | anywhere | nothing; the rows show when they can change |
| **The DM corrects** | build sheet: Edit (the DM) | anything, said in the log (Decision 5) |
| **My characters, between games** | My characters › Edit | nothing about spells by default; "Correct a mistake" opens them, noted in the file (question 6) |

**The count, at the top.** A bar at the top of the list (it stays in view as the list
scrolls, and has the same height whatever it says) holds three lines: the number still to
choose ("Choose 2 more", or "All chosen" in the good colour), what it is made of ("2 cantrips ·
1 Initiate · 6 book · 4 to prepare", only the parts still open), and one line of words (the
legend, or the reason a tap did nothing). The foot button (Level up to 5 / Save / Done) is
dimmed until the count is met; tapping it dimmed says "Choose 2 more first." **That is the
whole of choosing: one list, one count, done when the count is met.**

**A swap is in the same list.** A swap the rules allow ("one cantrip", "one of Magic
Initiate's spells", a Cleric's prepared spell after a Long Rest) is not a separate step and
not a separate screen. The player taps the number of the earlier spell to give it up (its box
goes empty and dashed, "giving this up · tap to keep"), the count rises by one for that group
only, and they tap another row of the same group to take its place. Tapping the given-up row
again keeps it. How many may be given up is the rules table, per group: a Wizard at level up
may give up none of her cantrips (that is after a Long Rest) but one of Magic Initiate's
spells; a Cleric one cantrip and one of Magic Initiate's. A second give-up beyond the allowance
is refused on the status line ("That swap is used. Put the other one back to swap this one.").
The new spell must be of the same level and the same source (each source has its own count,
and a source's count is what rises), so "a cantrip for a cantrip" needs no extra checking by
the player. At a Long Rest
the same goes for a Cleric's prepared spells (any number) and a Wizard's: the ★ on a spellbook
row is tapped to prepare or unprepare it (Decision 4).

**The window after a rest.** When a Long Rest finishes, each party character whose rules
allow a change after it gets a **window**: the character screen shows one quiet line above
its groups, "After your Long Rest you may change your prepared spells.", and the same one
list is **live** (its boxes and ★ can be tapped, the count bar at the top works as at a
level-up) until the window closes. There is no "Change spells" button and no second screen:
the list that shows the spells is the list that changes them. **Done**, in the foot, closes
the window (it is dimmed while the count is short). The window also closes when a fight
starts, or at the next
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
 Choose 2 more   2 book · 1 to prepare            <- the bar; fixed height
 Slots   Level 1 ●●●●   Level 2 ●●●                        back on a Long Rest
 ┌ Cantrips 6 ┐ ┌ Prepared 7 of 7 ┐ ┌ Always prepared 1 ┐ ┌ Spellbook 12 ┐

 CANTRIPS                                                   6 of 6
   [ ] Acid Splash                                           ⓘ
   [1] Fire Bolt  Wizard     ...   (the one list of Decision 1: every cantrip, A to Z)
 LEVEL 1 SPELL · MAGIC INITIATE (CLERIC)                    1 of 1
 SPELLBOOK                                     12 of 12   ★ 7 of 7
   LEVEL 1
   [1] Detect Magic                                   ★     ⓘ
   [ ] Feather Fall                                   ☆     ⓘ
   LEVEL 2
   [4] Scorching Ray                                  ☆     ⓘ
 ALWAYS PREPARED · do not count          (Brenna: Life Domain's six, read-only rows)
   Aid           Life Domain · from level 3                  ⓘ
```

- **Slots** are pips by spell level, the number beside them; Pact Magic says "2 slots of
  level 3 · back on a Short Rest". In a game the pips show what is spent (hollow).
- **The count tiles** are four short tiles on one row (two by two on a phone), each a tap
  target that scrolls to its group. Prepared turns the theme's bad colour when over and says
  "pick 2 more" when under.
- **Prepared is not a second list** (round 2). For a class that prepares from the whole of
  its list (Cleric, Druid, Paladin, Ranger), the "Prepared spells" group is the one list: a
  spell's box is ticked with the level it was prepared at. For the Wizard, prepared is the
  **★ at the end of a spellbook row** (below). Spells are grouped by spell level, and the
  group's count is on its heading.
- **Always prepared** is its own group of read-only rows without a checkbox (a Cleric's
  domain spells), each with its source and the level it comes at; Magic Initiate's level 1
  spell is chosen in its own group (Decision 1) and counted here. An always-prepared spell
  never appears among the rows to choose from, so there are no greyed ticked boxes. (If a
  spell the character already prepared is granted by the domain, the engine frees the
  prepared place; the mockup keeps granted spells out of the Cleric's list from the start.)
- **The Wizard's spellbook** is a group of the one list: every Wizard spell of a level she
  has slots for, **its box ticked with the level it was added at** (or "copied", Decision 6)
  when it is in the book, and a **★ button** at the row's end (44 px) that is lit when the
  spell is prepared and dimmed when the spell is not in the book. Two taps on two different
  things, each of which is a real rule: the box is "in my book" (2 more per Wizard level, six
  at level 1); the ★ is "prepared" (the Prepared Spells column), allowed only from the book.
  The heading carries both counts ("12 of 12   ★ 7 of 7") and the bar sums what is open.
  At a level-up the Wizard may not unprepare (that is after a Long Rest), so her ★ can only
  be added; at a Long Rest it can be moved freely among the book's spells; her book rows,
  once saved, cannot be unticked (the book only grows).
- **Multiclass**: one Slots row (the combined table), and the groups of the one list made per
  class, each class's heading and count.

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

The number in a box is read from these fields: `spellsAt[id]` for a cantrip or a Cleric-style
prepared spell, `book[].at` for a Wizard's book row (the ★'s own level is `spellsAt` of the
prepared list). A spell chosen in the open sitting carries the sitting's level until Save.

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

### Decision 7: nothing moves when a box is tapped (round 2)

"When I selected a spell in step two, the whole list bounced around." The rule, which the
build must keep and the mockup shows:

1. **The list is built once** per sitting (when the screen opens, or after a Save/Level up
   begins the next one). A tap changes **state**, not structure.
2. **A tap changes only**: the tapped box (empty, or a number, gold when new), a ★ if the tap
   was on one, the counts (the group's right-hand count, the tiles, the bar), and the bar's
   one line of words. Nothing else on the screen changes, with one allowed exception: a
   spell the character now knows by another source is dimmed in the other group with a
   one-line note (text and colour only, in a row of the same height).
3. **No re-sorting.** Order is fixed (cantrips, then spell level, then A to Z); a chosen row
   does not go to the top, to a "chosen" section or to the bottom.
4. **No sections open or close.** Every group is always open; there is no collapsed state to
   toggle. Chosen rows stay where they are, among the unchosen.
5. **No scroll change.** The tap never scrolls the list (no scroll-to, no focus jump). The
   only things that scroll it are the player's own scrolling and a tap on a count tile
   ("scroll to this group").
6. **Fixed heights.** Rows are 52 px, headings and rule lines have text that does not change
   when a tap happens, the bar has a fixed height and its lines never wrap into more. So a
   longer or shorter word in a count cannot push a row.
7. **A refusal is words, not movement.** A tap on a spell that cannot change, or on a full
   group, changes only the bar's status line.

**Nothing moves** (the check in the mockup, `window.mock.layout()`): before and after each
tap, the top and height of every row, heading, rule line, tile and the bar, the list's scroll
position and its total height. Over the 50 taps of a walk of a Wizard from level 1 to 5, a
Cleric's swap, a Long Rest and the read-only view, on a 390 x 844 touch screen and a
1280 x 800 mouse screen, **the largest change in any row's top, any height, the scroll
position or the list's height was 0 px.**

## The words

| Where | Words |
|---|---|
| Group line, cantrips (Wizard) | One cantrip can change after a Long Rest. |
| Group line, cantrips (others) | One cantrip can change when you gain a {Class} level. |
| Group line, prepared (Cleric, Druid) | Prepared spells change after a Long Rest. (after a rest: Any prepared spell can change: tap one to give it up, then choose another.) |
| Group line, prepared (Wizard) | Prepared spells change after a Long Rest, from your spellbook. |
| Box, earlier pick | the level number, outlined ("Fire Bolt, chosen at level 1" to a screen reader) |
| Box, older sheet | a dash ("chosen before levels were kept") |
| Box, this sitting | the current level number on a gold box |
| Count, top | Choose {n} more · All chosen |
| Count, what is open | {n} cantrips · {n} Initiate · {n} book · {n} to prepare |
| Count, group heading | {have} of {cap} · ★ {have} of {cap} |
| Legend, status line | The number in a box is the level you chose the spell at. |
| Given up (a swap) | giving this up · tap to keep; status: Given up. Choose another of the same level to replace it, or tap it again to keep it. |
| Swap refused | That swap is used. Put the other one back to swap this one. |
| Group full | Full: {cap} of {cap}. Tap one you chose earlier to give it up, if a swap is left. |
| Foot button, not ready | Choose {n} more first. |
| Duplicate, other group | already chosen under {group} |
| Window line | After your Long Rest you may change your prepared spells. (the list is live; Done in the foot) |
| Window line, one spell | After your Long Rest you may replace one prepared spell. |
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

[`mockups/spells-on-the-sheet.html`](mockups/spells-on-the-sheet.html), round 2: a phone frame
(390 x 844) and a desktop frame (1280 x 800); two characters (Wren, a Wizard with Magic
Initiate (Cleric); Brenna, a Cleric of the Life Domain with Magic Initiate (Wizard)); four
moments (New character, which builds level 1; Level up; After a Long Rest; Any other time),
and **"Sheet is at level" 1 to 5** to jump a sheet to a level. **To walk a character up:**
pick New character, tick spells until the top says "All chosen", press Save, then Level up
(to 2, 3, 4, 5); the number in each box is the level it was chosen at, and the choices carry
from level to level. The swaps of the rules are in the same list (Wren at level 5 may give up
a Magic Initiate spell; Brenna a cantrip); a Long Rest and Any other time show the live and
the read-only list. `ⓘ`, a long-press or a 3-second hover shows the scroll card. The page has
no chooser and no second step. It does not draw: an older sheet's dash, a multiclass
character, the DM's correction, the Short Rest.

The mockup was walked with a script (not part of the repo) on a 390 x 844 touch screen and a
1280 x 800 mouse screen: a Wizard from level 1 to 5 by taps, Brenna's level 5 and a Long Rest,
and Wren's Long Rest and read-only view. Screenshots, `/home/claude/shots/568-r2/`:
`phone-wren-new-L1-start`, `phone-wren-L1-mid`, `phone-wren-L2-mid`, `phone-wren-L4-done-top`,
`phone-wren-levelup5-start`, `phone-wren-levelup5-book`, `phone-wren-L5-picked`,
`phone-wren-L5-swap-open`, `phone-wren-L5-swap-done`, `phone-wren-L5-saved-readonly`,
`phone-wren-card`, `phone-wren-long`, `phone-wren-other`, `phone-brenna-levelup5`,
`phone-brenna-levelup5-picked`, `phone-brenna-long`, `desktop-wren-new-L1`,
`desktop-wren-levelup5-start`, `desktop-wren-levelup5-picked`, `desktop-wren-card-hover`.
Round 1's pictures (`mock-*.png`, with the chooser) are out of date.

## Build plan

| Stage | What | Files |
|---|---|---|
| **SS1** (rules) | `spellsAt` and `book` on the sheet; `validate`; derive reads `book` (prepared ⊂ book); state version and migration; tests | `derive.js`, `migrate.js`, `packages/rules/test/derive.test.js` |
| **SS2** (rules) | `spellChanges(before, after, moment)`; `levelUp` checks it; `respell` and the window from `rest` and `shortRest`; `corrected` on a DM's `setSheet`; view and log words; tests per class row of the rules table | `derive.js`, `engine/characters.js`, `engine/rests.js`, `view.js`, tests |
| **SS3** (client) | the build sheet's Spells section: the one list of checkbox rows with the level in the box, the count bar, swaps in the list, the moments, the slot pips and tiles, always prepared, the spellbook's ★; the Magic Initiate block's line; `ⓘ` and #566's card; a test that a tap changes no row's place (the mockup's `layout()` check, in the client tests); smoke step in the classes pass | `buildsheet.js`, its CSS, `packages/client/test/`, `scripts/smoke/classes.mjs` |
| **SS4** (client) | Character › Sheet › Spells (one-token menu) read-only list and the window line (the same list, live, Done in the foot); until the one-token menu lands, the same in today's sheet tab | `app.js` (`renderSheet`), the one-token menu's files when built |
| **SS5** | a Wizard copying a spell into the book (gold and hours, DM-approved); High Elf's swap (with SP2) | later |

DEBT lines are added by the build PRs (the spellbook copying until SS5; the Warlock's Book of
Shadows stays manual).

## Risks

- **A long list.** A level 5 Wizard's list is about 130 rows (every cantrip and spell of her
  levels, chosen or not), about 6,800 px on a phone. That is the price of "nothing moves" and
  of one list; the count tiles jump to a group, and the bar keeps the count in view. A search
  that hid rows would move rows (question 11).
- **A number in a box may be read as a quantity.** The legend on the status line says what it
  is, and the accessible name says it in words. If the owner's players misread it, the fallback
  is a "L" before the number (`L3`).
- **The Wizard's ★** is a second control on a row. It is the rule (the book, then prepared),
  but it is the one place the one-list design has two taps (question 9).

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
8. **A swap's history:** default the box shows only the level it was chosen at; the log keeps
   "Mage Hand in place of Light". Alternative: the row also says "in place of Light".


Round 2 (20 November 2026), new, each with its default:

9. **The Wizard's two taps:** the box is "in my spellbook" and the ★ is "prepared" (both rules
   of SRD 5.2). Default **two controls on a spellbook row**, as drawn. Alternative: a new
   spell added to the book at a level-up is prepared at once while there is room, and the ★
   is for moving prepared spells after a Long Rest (one tap for the usual case; wrong when the
   player wants to prepare something older).
10. **New choice: a number or a tick?** Default **the current level as a number on a gold
    box**, at once (Decision 2). Alternative: a tick on a gold box that becomes the number
    when the level-up is saved.
11. **Finding a spell in a long list:** default **no search box** (a filter hides rows, which
    is rows moving). Alternative: a search box fixed at the top that only brightens the
    matching rows and dims the others, hiding none.
12. **Giving up a spell to swap:** default **tap its number** (the box empties and the count
    rises; tap again to keep it). Alternative: a "Replace" button on the row, which opens
    nothing but does the same; it adds a control to every row that may change.
13. **A spell the domain grants after it was prepared** (a Cleric prepared Cure Wounds, then
    reaches level 3): default **the engine frees the prepared place and says so in the log**.
    Alternative: refuse to preparing a domain spell before it is granted.
