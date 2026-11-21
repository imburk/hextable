# Spec: spells on the sheet: one list of checkboxes, the level a spell was chosen at in its box, changes by the rules, a clear slots and prepared display

Status: draft by an agent, to be reviewed by the design owner. **Round 3** (the owner tried the
round 2 mockup; see "Round 3 feedback" below, which adds Decisions 8 to 12 and amends the words and
mockup sections). Round 2 (the owner tried the round 1 mockup; see "Round 2 feedback", which
amended Decisions 1 to 4). Issue #568. A design job:
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

## Round 3 feedback

The owner tried the round 2 mockup, levelling the Wizard (his words, 20 November 2026):

> "For spellbook on the level up screen, it should have section headers that scroll up/down and
> stop at the top of the display even as the spells themselves scroll. The spell title should
> have (lvl X). I like the info button. I'd prefer that it be a 3 second hover to display but
> there's no equivalent on a touch screen is there?"

He tried it again and added, at 06:32 ET (summarised, not word for word): he likes the directions and the caster
stats and wants the stats on a combat page too; "save DC 13" is unclear; does Magic Initiate use Wisdom
while Wizard spells use Intelligence; "All back on a Long Rest" and the four tiles are unclear; and the
list should show only the spells available at each moment. At 06:45 ET he added: the long list gets a
search that **filters** (hides what does not match), opened by a magnifying-glass button and not a box that
always takes room, with an obvious way out.

Round 2's answers (one list, the level in the box, nothing moves) were not questioned and stand.

| # | What he said | What the design does now | Where |
|---|---|---|---|
| R3-1 | "section headers that scroll up/down and stop at the top of the display even as the spells themselves scroll" | Every group header (Cantrips, the Magic Initiate spell, Spellbook or Prepared spells, Always prepared) **sticks under the count bar** while its rows scroll beneath it, and the next header pushes it up. In the spellbook the "Level N" sub-header sticks under its group header the same way. The bar stays pinned above both. On a phone at most **two lines are pinned below the bar** (the group, 34 px, and its level, 26 px); with the bar that is 153 px of a 712 px list. It is done for every group, not only the spellbook, so the list reads the same everywhere. | Decision 8 (new) |
| R3-2 | "The spell title should have (lvl X)" | Every spell row's name reads **"Magic Missile (lvl 1)"**, and a cantrip **"Fire Bolt (cantrip)"**, in the row's fixed 52 px: a long name is cut with an ellipsis and the tag is never cut. | Decision 9 (new) |
| R3-3 | "I like the info button" | **Kept**, unchanged in size and place (28 px circle in a 44 px target at the end of every row). It now also brightens when the mouse is on its row, and the status line says "Tap ⓘ to read a spell." so it is the obvious tap. | Decision 9 |
| R3-4 | "I'd prefer that it be a 3 second hover to display but there's no equivalent on a touch screen is there?" | **Desktop: yes, the card appears after the mouse rests on a row for 3 seconds** (it did in round 2; the mockup now says so at the top). **Touch: there is no hover, so there is no exact equivalent.** The nearest thing is a **press-and-hold of about half a second** on the row, which phones already use for "tell me more"; it is kept. A 3 second hold was not copied: a finger held still for 3 seconds feels like nothing is happening. **Nobody has to find the hold:** tapping the ⓘ is the way, on a phone and on a desktop, and it works the same everywhere. | Decision 9 |
| R3-5 | He likes the directions and the caster stats; the stats should also be on a combat page | Kept on the sheet. **The same caster lines are also shown on the combat page** of the character screen (one-token menu, Character, where a player in a fight has Cast): same words, same numbers, read-only, from the same derived values; the mockup draws the sheet only. | Decision 11 |
| R3-6 | "'save DC 13' is unclear" | The line reads **"Spell save DC 13 (targets save against this)"** and **"Spell attack +5"**. | Decision 11 |
| R3-7 | Do Magic Initiate spells use Wisdom while Wizard spells use Intelligence? | **Yes, and it is the player's choice, not the class's.** SRD 5.2 (Magic Initiate, line 20040): "Intelligence, Wisdom, or Charisma is your spellcasting ability for this feat's spells (choose when you select this feat)." Wren chose Wisdom; her Wizard spells use Intelligence. The sheet says it plainly in its own line: **"Magic Initiate (Cleric) spells: Wisdom, chosen with the feat"**, with that line's own save DC and attack bonus. | Decision 11 |
| R3-8 | "'All back on a Long Rest'" | Reads **"Spell slots: all back after a Long Rest"** (the label is on the row; Pact Magic's says "back after a Short Rest"). | Decision 11 |
| R3-9 | "The four tiles are unclear" | Each tile now has a **label, a number with its unit, and one line saying what it counts**: "Cantrips: 6 known", "Spells prepared: 7 of 7", "Always prepared: 1 spell (do not count against your limit)", "Spellbook: 12 spells (written in it; it only grows)"; a Cleric's fourth tile is "Free casts: 1 per Long Rest". | Decision 11 |
| R3-10 | Only show the spells available at each moment | **New character and Level up list everything to choose from. After a Long Rest the list shows only what can be prepared** (a Wizard: the spellbook's spells; a Cleric: the Cleric list) and, for a Wizard, the Wizard cantrip list for the one cantrip the rules let her swap. **At any other time it shows only what the character has: prepared spells, cantrips, always-prepared spells.** The set is fixed by the moment, so a tap still changes nothing else. | Decision 10 |
| R3-11 | A search for the long list: it filters (hides non-matches), is opened by a magnifying-glass button and not a box that always takes space, keeps the sticky level headers (a header with no matching rows hides), and has an obvious way out | **A magnifying-glass button in the corner of the count bar** (44 px target). Tapped, a search row covers the bar's top two lines (the bar keeps its 93 px; the status line stays). Typing **hides every row that does not match**, a level sub-header and a group header with no matching row hide with them, and the headers that remain still stick. **The ✕** at the end of the search row clears the text, closes the search and **puts the whole list back at the scroll place it was at when the search was opened**. Filtering is **the one exception to "nothing moves"**, and only while the search is open; ticking a box inside the filtered list moves nothing. This answers question 11. | Decision 12 (new), Decision 7 |

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
   [ ] Acid Splash (cantrip)                                 ⓘ
   [1] Fire Bolt (cantrip)       Wizard                      ⓘ
   [1] Guidance (cantrip)        Magic Initiate · Cleric · WIS   ⓘ
   [ ] Resistance (cantrip)      Cleric list · Magic Initiate    ⓘ
   ...                  (every cantrip either list offers, A to Z, chosen or not)
 LEVEL 1 SPELL · MAGIC INITIATE (CLERIC)                    1 of 1
 SPELLBOOK                                     12 of 12   ★ 7 of 7
   LEVEL 1
   [1] Detect Magic (lvl 1)                           ★     ⓘ
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
- **Every spell the source offers is a row** (when the moment is one that chooses: a new character and a level-up; after a rest and at any other time the list is shorter, Decision 10), chosen or not, in a fixed order (cantrips, then
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
   [ ] Acid Splash (cantrip)                                 ⓘ
   [1] Fire Bolt (cantrip)  Wizard     ...   (the one list of Decision 1: every cantrip, A to Z)
 LEVEL 1 SPELL · MAGIC INITIATE (CLERIC)                    1 of 1
 SPELLBOOK                                     12 of 12   ★ 7 of 7
   LEVEL 1
   [1] Detect Magic (lvl 1)                           ★     ⓘ
   [ ] Feather Fall (lvl 1)                           ☆     ⓘ
   LEVEL 2
   [4] Scorching Ray (lvl 2)                          ☆     ⓘ
 ALWAYS PREPARED · do not count          (Brenna: Life Domain's six, read-only rows)
   Aid (lvl 2)   Life Domain · from level 3                  ⓘ
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
   ("scroll to this group"). Headers that stick under the bar (Decision 8) are what scrolling
   looks like, not an effect of a tap: no tap changes which header is pinned.
6. **Fixed heights.** Rows are 52 px, headings and rule lines have text that does not change
   when a tap happens, the bar has a fixed height and its lines never wrap into more. So a
   longer or shorter word in a count cannot push a row.
7. **A refusal is words, not movement.** A tap on a spell that cannot change, or on a full
   group, changes only the bar's status line.
8. **One exception, and only while it is open: the search** (Decision 12). Typing in the search
   hides the rows that do not match, which is rows moving, and the owner asked for it. It is
   allowed because the player did it on purpose and sees the list narrow, and it ends with the ✕,
   which puts the full list back at the scroll place it was left. **Inside a filtered list the rule
   holds as before**: ticking a box, a ★ or a swap changes the box, the counts and the status words and
   nothing else, and no row appears or goes because of a tap.

**Nothing moves** (the check in the mockup, `window.mock.layout()`): before and after each
tap, the top and height of every row, heading, rule line, tile and the bar, the list's scroll
position and its total height. Over the 50 taps of a walk of a Wizard from level 1 to 5, a
Cleric's swap, a Long Rest and the read-only view, on a 390 x 844 touch screen and a
1280 x 800 mouse screen, **the largest change in any row's top, any height, the scroll
position or the list's height was 0 px.**

### Decision 8: headers that stick (round 3)

The owner's picture: the headers stay at the top of the list while the spells scroll under
them, so you always know which group, and which spell level, you are looking at. This is
**scroll behaviour, not tap behaviour**: it changes what the player sees as they scroll, never
what a tap does (Decision 7).

1. **What sticks.** The count bar (Decision 3) stays pinned at the top of the list, as in round
   2. Under it, the **group header** of the group being read sticks: `CANTRIPS 6 of 6`,
   `LEVEL 1 SPELL · MAGIC INITIATE (CLERIC) 1 of 1`, `SPELLBOOK 12 of 14 ★ 7 of 9` (a Cleric's
   `PREPARED SPELLS 7 of 9`), `ALWAYS PREPARED do not count`. In a group made of spell levels
   (the spellbook, the Cleric's prepared spells) the **level sub-header** (`LEVEL 2`) sticks
   under the group header. The group's count is on its header, so it stays in view while you
   scroll, which is useful in itself.
2. **The stack, in px** (the same on a phone and a desktop):

   | Piece | Height | Pinned when |
   |---|---|---|
   | Count bar | 93 | always |
   | Group header | 34 | always, one line |
   | Level sub-header | 26 | only in a group made of spell levels |
   | **Pinned in all** | **127** (cantrips, Initiate, always prepared) or **153** (spellbook, prepared spells) | |

   On a phone that leaves 585 or 559 px of the 712 px list (about 11 rows); on the 1280 x 800
   desktop panel (list 668 px) 541 or 515 px. **At most two lines are pinned below the bar**: the
   group and its level, nothing else (the rule line under a header, which says when a spell can
   change, is *not* pinned; it scrolls away, and a tap that cannot change a spell says it on the
   status line anyway).
3. **The push.** The next header takes the place of the one above it, the "stacked sticky"
   pattern: as the end of a group comes up, its header is pushed up under the bar by the next
   group's header; when a spell level ends, its sub-header is pushed up by the next level's. A
   group header is pushed together with its level sub-header, which is inside it.
4. **Fixed and plain.** A header is one line of a fixed height, opaque (rows scroll under it
   and are not seen through it), its title is cut with an ellipsis rather than wrapped, and its
   count is on the right. The level sub-header has a slightly lighter fill, so the two pinned
   lines read as two tiers.
5. **How it is built** (for SS3): CSS only, `position: sticky` with three constants (bar 93,
   group 34, level 26). Each group is a `<section>` that holds its header, and each spell level
   a `<div>` that holds its sub-header, which is what makes the next one push the last; no
   scroll listener and no JavaScript while scrolling. The count tiles scroll to a group so its
   header lands right under the bar (not under the pinned stack).
6. **Nothing moves, re-checked.** Sticking never changes the list's layout: every header,
   row and line has the same place in the list (measured from the top of the list's content)
   whether it is stuck or not; only what the eye sees moves, by scrolling. The 0 px tap check was
   re-run with the round 3 mockup (see "The mockup"): 79 taps, largest change 0 px (see "The mockup").
7. **Rejected:** (a) one floating label that JavaScript rewrites to the current group as you
   scroll: its words change while scrolling and it costs work on every scroll event on a phone;
   (b) pinning the rule lines too: four pinned lines on a phone; (c) pinning the level as part
   of the group line ("SPELLBOOK · LEVEL 2"): one line fewer (127 px), but the header's words
   change as you scroll (question 15).

### Decision 9: the level in the name, and the info button (round 3)

**The name.** Every spell row, in every group, reads `Name (lvl N)`: `Magic Missile (lvl 1)`,
`Scorching Ray (lvl 2)`; a cantrip reads `Fire Bolt (cantrip)`. The tag follows the name in
regular weight and the muted colour; the name stays bold. The always-prepared rows have it too
(`Aid (lvl 2)`).

- **Why "(cantrip)" and not "(lvl 0)".** "Cantrip" is the SRD's own word and the word the
  Cantrips header already uses. A cantrip uses no slot, so "lvl 0" invites the question "what
  slot is that?", and looks like a typo beside the slot pips (which start at level 1). It costs two
  more characters, which the row has room for (see the next point). The alternative is in question
  14.
- **Fixed height at 390 px.** The row is still 52 px. The name is cut with an ellipsis, the tag
  is not: at 390 px the longest name in the lists, "Protection from Evil and Good", reads
  "Protection from Evil and G… (lvl 1)", with the box, the ★ and the ⓘ in place. (The name area at
  390 px is about 228 px in a Wizard's row, which has the ★.) Measured in the mockup: every row on
  the screen is 52 px high, with and without a long name.
- **Under a "Level 1" sub-header the tag says what the header says.** That is kept as asked: a row
  read alone (by a screen reader, in a log line, in the scroll card) still says its level, and the
  tag is the only place a Magic Initiate or Always prepared row shows it.
- **Two numbers on a row, and how they are told apart.** The number *in the box* is the
  character level the spell was chosen at (Decision 2); the number in the *tag* is the spell's own
  level. They differ for most rows (Scorching Ray: `4` in the box, `(lvl 2)` in the name). They are told
  apart by place and look (an outlined or gold box on the left, grey words in brackets after the
  name) and by the status line's legend, which says what the box number is. It is the one
  thing here that may be misread (Risks, question 15).
- **Words for a screen reader:** "Magic Missile, level 1 spell, chosen at level 1" ·
  "Fire Bolt, cantrip, Wizard, chosen at level 1".

**The ⓘ and the scroll card.**

- **The ⓘ stays**, as the owner likes it: a 28 px circle in a 44 px target at the end of every spell
  row, after the ★ where there is one. A tap opens the scroll card (#566); a tap on it again, a
  tap elsewhere, Escape or scrolling the list closes it. It is **the obvious tap**: the same place
  on every row, it brightens when the mouse is on its row or it has focus, it has the tooltip
  "Read Fire Bolt", and the status line's legend ends "Tap ⓘ to read a spell."
- **On a mouse:** resting the pointer on a row for **3 seconds** shows the card, and moving off
  hides it. (The ⓘ is there for the person who does not want to wait.)
- **On touch there is no hover.** A finger is either on the glass or off it, so the 3-second
  hover has no twin. The equivalent is a **press-and-hold of about 0.5 seconds** on the row, which
  shows the card and does not choose or un-choose the spell (the tap that ends the press is
  swallowed). It is kept as a shortcut, and the design never depends on it: **tap the ⓘ**. Half a
  second, not three, because a finger held for three seconds feels like a frozen screen, and
  because half a second is what phones already use for "tell me more".

### Decision 10: each moment lists only what it can use (round 3)

The owner: show only the spells available at each moment. Round 2 listed every spell the class
may take at every moment, which is right for choosing and wrong for reading. What the list holds
now depends on **the moment** (Decision 3's table), and on nothing a tap can change:

| Moment | Cantrips | The spells group (spellbook or prepared) | The Magic Initiate spell | Always prepared |
|---|---|---|---|---|
| **New character**, **Level up** | every cantrip either list offers (Decision 1) | every spell of the levels the class has slots for | every level 1 spell on its list | all |
| **After a Long Rest** | what is chosen; a Wizard also gets **every Wizard cantrip**, for the one cantrip the rules let her swap | a **Wizard: the spellbook's spells only** (the ★ prepares them); a **Cleric (Druid, Paladin, Ranger): the whole class list** of the levels she has slots for | what is chosen | all |
| **After a Short Rest** (Wizard 5+, Memorize Spell) | as after a Long Rest, but without the cantrip swap: what is chosen | the spellbook's spells only | what is chosen | all |
| **Any other time** | what is chosen | **what is prepared only** (a Wizard's group is headed "Prepared spells", not "Spellbook": the book itself is not listed) | what is chosen | all |

- **Why a Wizard's Long Rest list is the book, and a Cleric's is the class list.** It is the
  rule: a Wizard prepares from her spellbook; a Cleric from her whole list (the table under
  "What the rules allow"). The Wizard's one cantrip swap is the only reason her cantrip list is long
  then (cantrips are known, not prepared, and "replace 1 after a Long Rest" picks from the Wizard
  list).
- **Fewer rows, so shorter lists.** After a rest the Wizard's list is the 12 spells of her book, not
  about 130 rows; at any other time it is her 7 prepared spells and her 6 cantrips (counts of the
  mockup are in "The mockup"). The long list of Risks is the level-up and new-character moment only.
- **Still one list that does not move.** The rows are decided when the sitting opens (Decision 7
  point 1) from the moment and the sheet. A tap never adds or removes a row: a spell given up in a
  swap stays as a dashed row until the swap is done; a spell chosen in a swap was already in the list.
  The nothing-moves check was re-run inside each moment (see "The mockup").
- **The headers and counts follow.** A group with no rows is not drawn; the level sub-headers are
  those of the rows shown (Decision 8). The count tiles still count what the sheet holds, and a
  tile whose group is not listed (the Wizard's Spellbook tile at any other time) scrolls to the
  group nearest to it ("Prepared spells") and keeps its number: the book is counted, not listed.
- **Not shown at any other time: the spellbook's unprepared spells.** That is the owner's ask and
  the default; question 18 has the alternative.

### Decision 11: the caster lines, the slots and the four tiles (round 3)

Under the heading, in this order (the sheet, read-only at any moment; the same two lines and the
slots row are also shown on the **combat page** of the character screen, one-token menu
Character › Cast, so a player in a fight has them without opening the sheet; they are derived
values, so the two places cannot disagree. The mockup draws the sheet only):

```
 Wizard spells: Intelligence · Spell save DC 13 (targets save against this) · Spell attack +5
 Magic Initiate (Cleric) spells: Wisdom, chosen with the feat · Spell save DC 12 · Spell attack +4
 Spell slots   Level 1 ●●●●   Level 2 ●●●        All back after a Long Rest
```

- **Spell save DC** is the number a target rolls its saving throw against; the bracket says so the
  first time a player meets it. **Spell attack** is the bonus added to a spell's attack roll. Both
  are the SRD's 8 + proficiency + the spellcasting modifier, and the proficiency bonus + that modifier.
- **Each spell source has its own ability.** The class's (Wizard: Intelligence) and Magic Initiate's,
  which the player chose with the feat (SRD 5.2: Intelligence, Wisdom or Charisma, "choose when you
  select this feat"; reference line 20040). So a Wizard with Magic Initiate (Cleric) can have two lines
  with two abilities and two DCs, as drawn. A species' spells (High Elf, with SP2) get a third line the
  same way. A line shows only for a source the character has.
- **Spell slots** is the row's own label, and "All back after a Long Rest" says when (Pact Magic:
  "2 slots of level 3 · all back after a Short Rest").
- **The four tiles** each carry a label, a number with its unit and one line saying what it counts.
  A tap still scrolls to the group (Decision 4):

  | Tile | Number | The line under it | What it counts |
  |---|---|---|---|
  | **Cantrips** | `6 known` | cast any time, no slot | every cantrip from every source (class, Magic Initiate, species) |
  | **Spells prepared** | `7 of 7` (a Wizard: ★ prepared of the limit; a Cleric: chosen of the limit) | chosen from your spellbook / from the Cleric list | the spells counted against the Prepared Spells column; not the always-prepared ones |
  | **Always prepared** | `1 spell` | do not count against your limit | spells a feature gives (a Cleric's domain spells, Magic Initiate's level 1 spell) |
  | **Spellbook** (a Wizard) | `12 spells` | spells written in it; it only grows | every spell in the book, prepared or not |
  | **Free casts** (everyone else, in the fourth place) | `1 per Long Rest` | Magic Initiate spell, once per Long Rest | the cast without a slot the feat gives |

  A tile's height is fixed (78 px) with a one or two line "what it counts", so a number cannot change
  its height.

### Decision 12: a search that filters, opened by a button (round 3)

The long list (about 130 rows at a level-up, Risks) gets a search. The owner chose **a filter that
hides what does not match**, so round 2's default (question 11: "no search box, because a filter
moves rows") is answered the other way, with the limits below.

1. **Closed, it takes no room.** A **magnifying-glass button** (a drawn glass, not a letter, 44 px
   target, tooltip and name "Search spells") sits in the corner of the count bar. The bar does not
   get taller, and there is no box until the button is tapped.
2. **Open.** A search row covers the bar's first two lines (the number to choose and what it is made
   of); the status line below it stays. The row holds a text box (16 px, so a phone does not zoom),
   the number of matches ("12 matches") and an **✕** (44 px, "Clear the search and show the whole
   list"). The keyboard comes up on a phone. Opening the search changes nothing in the list.
3. **What it does.** As the player types, rows whose name (with its tag, so "lvl 2" and "cantrip"
   work) does not contain the text hide. A **spell level's sub-header hides when none of its rows
   match, and so does a group's header** when the whole group has no match; the headers that
   remain **still stick** (Decision 8, measured). The intro blocks (caster lines, slots, tiles, the
   window line) and the rule lines are not part of the results and are hidden while there is text, so
   the matches start at the top. No match says: **No spell matches "xyz".**
4. **The way out is the ✕**: it clears the text, closes the search and **restores the full list at
   the scroll place the list had when the search was opened**, whatever was scrolled while
   filtering. Escape does the same on a keyboard. Deleting the text back to nothing (the key,
   not the ✕) also brings the full list back at that place, leaving the search open. A rest, a
   level-up or Save closes it (the list is rebuilt).
5. **Ticking inside a filtered list moves nothing** (Decision 7, point 8): the same box, counts and
   status words; a row never appears or goes because of a tap. A spell chosen while filtered stays
   in the list, matching or not, until the search changes.
6. **It filters what the moment lists** (Decision 10): at any other time it searches the 20 or so
   rows of prepared spells and cantrips, which is rarely needed; the button is always there so the
   bar does not change.
7. **Words:** the button's name "Search spells"; the placeholder "Search spells"; "{n} match(es)";
   "No spell matches "{text}"."; the ✕'s name "Clear the search and show the whole list".
8. **Rejected:** a box that is always open (takes about 52 px on a phone for a thing used now and
   then); a search that only brightens matches and dims the rest (round 2's alternative: it keeps the
   list still but does not shorten it, which is what the owner wants the search for).

### Decision 13: every spell row says its roll, as plainly as its level (round 4, #605)

The owner, 20 November 2026: choosing spells (new character, level up, preparing after a Long Rest, the spell list in play), it
must be very clear whether a spell needs a spell attack roll or makes the target roll a save, and which ability. Every spell row
carries a tag beside its level, the same size: **Attack**, **DEX save** (STR, CON, INT, WIS, CHA) or **No roll**. It is read from
the spell's `roll` (rules-expansion.md, "A spell's roll"), and shows nothing for a homebrew spell whose roll cannot be read. It is
in words and has a shape of its own (a pill, a square box, a dotted pill), so colour is never the only difference, and it
uses the theme's own line and text colours, so every theme shows it. Built in the in-play lists first; the create and level-up
sheet takes it through `spellTag()` once the rework (#603) is merged.

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
| Search button, row | Search spells · {n} match(es) · No spell matches "{text}". · ✕: Clear the search and show the whole list |
| Caster line, class | {Class} spells: {Ability} · Spell save DC {n} (targets save against this) · Spell attack +{n} |
| Caster line, feat | Magic Initiate ({List}) spells: {Ability}, chosen with the feat · Spell save DC {n} · Spell attack +{n} |
| Slots | Spell slots · Level {n} ●●● · All back after a Long Rest (Pact Magic: after a Short Rest) |
| Tiles | Cantrips: {n} known · Spells prepared: {n} of {cap} · Always prepared: {n} spells (do not count against your limit) · Spellbook: {n} spells (written in it) · Free casts: 1 per Long Rest |
| Legend, status line | The number in a box is the level you chose the spell at. Tap ⓘ to read a spell. |
| Spell name | {Name} (lvl {N}) · cantrip: {Name} (cantrip) |
| ⓘ tooltip (mouse) | Read {Name} |
| Group header (sticks) | {Title}   {have} of {cap}   (spellbook: ★ {have} of {cap}) |
| Level sub-header (sticks) | LEVEL {N} |
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
  buttons, the group lines say when; only what the character has is listed (Decision 10).
- **A group with no rows at a moment** (a Fighter with Magic Initiate has no spellbook group; a
  character with no always-prepared spell has none) is not drawn, and neither is its header.

## The mockup

[`mockups/spells-on-the-sheet.html`](mockups/spells-on-the-sheet.html), round 3: a phone frame
(390 x 844) and a desktop frame (1280 x 800); two characters (Wren, a Wizard with Magic
Initiate (Cleric); Brenna, a Cleric of the Life Domain with Magic Initiate (Wizard)); four
moments (New character, which builds level 1; Level up; After a Long Rest; Any other time),
and **"Sheet is at level"** 1 to 5 to jump a sheet to a level. **To walk a character up:**
pick New character, tick spells until the top says "All chosen", press Save, then Level up
(to 2, 3, 4, 5); the number in each box is the level it was chosen at, and the choices carry
from level to level. The swaps of the rules are in the same list (Wren at level 5 may give up
a Magic Initiate spell; Brenna a cantrip). Round 3 adds: **headers that stick** under the count
bar (scroll any list; Decision 8); **`(lvl N)` and `(cantrip)`** on every name (Decision 9); the
**caster lines, "Spell slots" row and the four relabelled tiles** (Decision 11); and the
**list that follows the moment** (Decision 10): switch Moment to see what each lists; and the **search** (Decision 12): the magnifying glass in the bar, the ✕ to leave. `ⓘ` shows
the scroll card on a tap; on a mouse, 3 seconds on a row shows it; on touch, a press-and-hold of
half a second does. The page has no chooser and no second step. It does not draw: an older sheet's
dash, a multiclass character, the DM's correction, the Short Rest, the combat page.

**What was measured** (a script, not part of the repo; Chromium at 390 x 844 touch and 1280 x 800
mouse; screenshots of the frame in `/home/claude/shots/568-r3/`):

- **Pinned stack:** bar 93 px, group header 34, level sub-header 26 (CSS constants, measured the
  same). At scroll positions from 0 to 3600 px, in both frames and both characters, the group header
  sat at 93 px under the bar's bottom edge and the level sub-header at 127 px; as a group ended its header
  was pushed up under the bar by the next one.
- **Rows:** every row is 52 px high at 390 px, including "Protection from Evil and Good (lvl 1)",
  whose name is cut with an ellipsis and whose tag is fully visible. No touch target is under 44 px
  and the list does not scroll sideways.
- **Count tiles:** each tile jumps to its group, which lands right under the bar.
- **Nothing moves** (`window.mock.layout()`: the top and height of every row, header, rule line, tile
  and the bar, the scroll position and the list's height, before and after each tap): **79 taps,
  the largest change in any top, any height, the scroll position or the list's height was 0 px.** They
  were: a Wizard walked from level 1 to 5, the swaps, Brenna's level 5, Long Rest and read-only view, **inside
  each of the four moments for both characters** (a tap on the first, middle and last row of each list),
  three taps with the list scrolled so that headers were stuck, and a tap inside a **filtered** list (phone
  and desktop).
- **Search** (Decision 12), phone and desktop alike: opening it left the scroll place and all 130
  rows as they were (the bar still 93 px); "fire" left 2 rows (Fire Bolt; Fireball under a lone "Level 3"
  sub-header, the Level 1 and 2 sub-headers and the Initiate group hidden); "lvl 2" left 36 rows under
  "Level 2" only; "zzzq" left none and said so; with matches scrolled, the group and level headers stuck
  at 93 and 127 px; the ✕ closed it and the list was **back at the scroll place it was opened at (1900 px)
  with all 130 rows**.
- **Rows each moment lists** (sheets at level 4, the level-up being to 5; rows per group):

  | Moment | Wren (Wizard) | Brenna (Cleric) |
  |---|---|---|
  | New character | cantrips 20 · Initiate spell 15 · spellbook 30 | cantrips 20 · Initiate spell 30 · prepared 15 |
  | Level up | cantrips 20 · Initiate 15 · spellbook 95 | cantrips 20 · Initiate 30 · prepared 45 · always 6 |
  | After a Long Rest | cantrips 17 (the Wizard list) · Initiate 1 · **spellbook 12** | cantrips 7 · Initiate 1 · **prepared 28** · always 4 |
  | Any other time | cantrips 6 · Initiate 1 · **prepared 7** | cantrips 7 · Initiate 1 · prepared 7 · always 4 |

  The tiles read, for Wren at level 4: "Cantrips 6 known", "Spells prepared 7 of 7", "Always prepared 1
  spell", "Spellbook 12 spells".

Screenshots in `/home/claude/shots/568-r3/` (frame only): `phone-wren-scroll-0` to `-5` and
`phone-brenna-scroll-0` to `-5` (the pinned headers at six scroll places), `desktop-wren-scroll-*`,
`desktop-brenna-scroll-*`, `phone-wren-pinned-after-taps`, `phone-wren-top-tiles` (caster lines, slots,
tiles), `phone-{wren,brenna}-moment-{new,level,long,other}`, `phone-wren-long-scrolled`,
`phone-search-{open,fire,none,scrolled-pinned,closed}`, `desktop-search-*`, `desktop-wren-card-hover`,
`phone-wren-card`, and round 2's walk (`phone-wren-L*`, `-levelup5-*`, `-swap-*`, `phone-brenna-*`).
Round 2's pictures (`/home/claude/shots/568-r2/`) are out of date.

## Build plan

| Stage | What | Files |
|---|---|---|
| **SS1** (rules) | `spellsAt` and `book` on the sheet; `validate`; derive reads `book` (prepared ⊂ book); state version and migration; tests | `derive.js`, `migrate.js`, `packages/rules/test/derive.test.js` |
| **SS2** (rules) | `spellChanges(before, after, moment)`; `levelUp` checks it; `respell` and the window from `rest` and `shortRest`; `corrected` on a DM's `setSheet`; view and log words; tests per class row of the rules table | `derive.js`, `engine/characters.js`, `engine/rests.js`, `view.js`, tests |
| **SS3** (client) | the build sheet's Spells section: the one list of checkbox rows with the level in the box, the count bar, swaps in the list, the moments, the slot pips and tiles, always prepared, the spellbook's ★; the Magic Initiate block's line; `ⓘ` and #566's card; sticky headers, `(lvl N)` names, the caster lines and tiles, the lists per moment and the search (Decisions 8 to 12); a test that a tap changes no row's place (the mockup's `layout()` check, in the client tests); smoke step in the classes pass | `buildsheet.js`, its CSS, `packages/client/test/`, `scripts/smoke/classes.mjs` |
| **SS4** (client) | Character › Sheet › Spells (one-token menu) read-only list and the window line (the same list, live, Done in the foot); until the one-token menu lands, the same in today's sheet tab | `app.js` (`renderSheet`), the one-token menu's files when built |
| **SS5** | a Wizard copying a spell into the book (gold and hours, DM-approved); High Elf's swap (with SP2) | later |

DEBT lines are added by the build PRs (the spellbook copying until SS5; the Warlock's Book of
Shadows stays manual).

## Risks

- **A long list, now with a search** (a new character and a level-up only; after a rest and at other times the list is a
  few dozen rows at most, Decision 10). A level 5 Wizard's list is about 130 rows (every cantrip and spell of her
  levels, chosen or not), about 6,800 px on a phone. That is the price of "nothing moves" and
  of one list; the count tiles jump to a group, and the bar keeps the count in view. A search
  (Decision 12) filters the list when the player wants fewer rows.
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
11. **Finding a spell in a long list:** ~~default no search box~~ **Answered by the owner
    (round 3, 06:45 ET): a search that filters (hides non-matches), opened by a magnifying-glass
    button, with an ✕ that clears and closes it** (Decision 12). It is the one allowed exception to
    "nothing moves", only while it is open. (Round 2's alternative, a box that only dims
    non-matches, is not wanted.)
12. **Giving up a spell to swap:** default **tap its number** (the box empties and the count
    rises; tap again to keep it). Alternative: a "Replace" button on the row, which opens
    nothing but does the same; it adds a control to every row that may change.
13. **A spell the domain grants after it was prepared** (a Cleric prepared Cure Wounds, then
    reaches level 3): default **the engine frees the prepared place and says so in the log**.
    Alternative: refuse to preparing a domain spell before it is granted.


Round 3 (20 November 2026), new, each with its default:

14. **A cantrip's tag:** default **"(cantrip)"** (the SRD's word, and no slot). Alternative:
    "(lvl 0)", which is the owner's pattern to the letter and two characters shorter.
15. **Two numbers on a row** (the box: the character level it was chosen at; the name: the spell's
    level): default **both, told apart by place and look**, with the legend. Alternative: "(spell lvl 2)"
    or "(L2)" in the name, which is clearer and longer; or the box number with an "L" before it (also
    the fallback of Risks).
16. **How much is pinned on a phone:** default **the bar, the group and its level (153 px of 712)**.
    Alternative: the level folded into the group line ("SPELLBOOK · LEVEL 2", 127 px), whose words
    change as you scroll; or a shorter bar on a phone (the status line moved out of the bar).
17. **The press-and-hold on touch:** default **kept, 0.5 seconds, as a shortcut; the ⓘ is the tap**.
    Alternative: drop the hold, so that the ⓘ is the only way on a phone (one fewer hidden behaviour,
    and a phone player who never found the hold loses nothing).
18. **The Wizard's unprepared spells at any other time:** default **not listed** (the owner's ask:
    only what is prepared), the Spellbook tile still counts them. Alternative: a read-only "Spellbook"
    group below the prepared spells, which is 5 or so more rows and lets a Wizard read what she has
    written down without opening a window.
19. **The combat page:** default **the caster lines and the slots row are shown on it, read-only**.
    Alternative: only the DC and attack bonus (two numbers), with the ability and the Magic
    Initiate line left on the sheet.
