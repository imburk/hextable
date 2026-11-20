# Spec: making ability scores (standard array, point cost, rolling)

Status: draft by an agent, agreed by the owner (answers of 19 November, defaults to all seven questions). Issue #557. Part 1 is built (decisions 1 to 3, 5 and 6, and the lobby roll of 4); part 2 (the engine actions, the table settings, state version 25) is built too (#576); what is left is the build sheet's use of it (#578). See the build notes at the end.

The owner, 19 November 2026, 21:10 ET:

> I changed to 6 characters and chose create a new character, there's no way to roll new ability scores, that
> needs to be fixed. We should be able to choose any of the standard score creation options.

The owner's two further answers, 19 November, 21:13 and 21:14 ET:

> I like roll 4 dice and you get the top 3 for any score and in my campaign, anything below a 10 can be rerolled.
> I'd be OK if every score could be rerolled once. If there's a way that the DM can set up their preference for
> their table that would be ideal.

> [whether a reroll's new result stands or the higher of the two is kept] should be DM selectable.

So rerolling is a **table setting the DM chooses**, in three settings (decision 4 below). Today the build sheet (`packages/client/buildsheet.js`) has six text boxes and a line saying "Enter each score as it
stands after background". It does not generate anything. This spec says what the three SRD methods are, how the
background's increase fits, where a rolled number comes from in a game and in the lobby, and what the sheet keeps.

## Rules that bind this design

- **The rules package is pure and dice come from a seed.** The roll is a pure function of an rng it is handed. In a game
  the rng is the game's; in the lobby the client makes a key with `crypto.getRandomValues` and hands it over, as the
  table server makes the game's key (`rng.js`, `keyedRng`).
- **Everything in a game goes through `apply()`**, so a game's roll is an action, an event, and replays from the seed.
- **The engine never pretends.** Where nothing can witness a roll (the lobby), the sheet says so and the DM is shown it.
- **A rejected action changes nothing.** The roll action validates before it rolls.
- **The client decides no rule.** The build sheet shows what `scores.js` and `validate` say.
- **Phones first.** Targets of at least 44 px, nothing by hover, checked at 390 x 844.
- **Only SRD 5.2 text.** The numbers below are copied from `reference/srd52/srd52-flow.txt`, not from memory.

## The SRD text

"Step 3: Ability Scores", lines 2792 to 2865 of `srd52-flow.txt` (the same page, with the tables in place, is at about
line 1300 of `srd52.txt`). Three methods; "your GM might prefer you to use a particular one".

| Method | The SRD says | Result |
|---|---|---|
| **Standard Array** | Use 15, 14, 13, 12, 10, 8 for your abilities (line 2799). | Six fixed numbers, each used once, assigned. |
| **Random Generation** | Roll four d6 and record the total of the highest three dice. Do this five more times, so you have six numbers (lines 2801 to 2803). | Six numbers from 3 to 18, assigned. Ties for lowest: any one of the tied dice is the one dropped; the total is the same. |
| **Point Cost** | 27 points to spend; the cost of each score is in the Ability Score Point Costs table (lines 2804 to 2808, table at 2809 and 2846 to 2858). | 8 costs 0, 9 costs 1, 10 costs 2, 11 costs 3, 12 costs 4, 13 costs 5, 14 costs 7, 15 costs 9. A score is 8 to 15 before the background. The six costs add up to at most 27. The SRD does not say you must spend all 27; spending fewer is allowed. |

Then "Assign Ability Scores" (line 2870): put the six numbers on the six abilities, keeping the class's primary ability
in mind. For the Standard Array the SRD gives a suggested placement for each class (the Standard Array by Class table,
line 2923: twelve classes, six numbers each); it says the table may also guide where other methods put their highest
and lowest. The modifiers table (3 is -4 up to 20 is +5) is `mod()` in `derive.js` already.

After assigning, "adjust them according to your background" (line 3111 and the Background description at 19502): a
background lists three abilities; **increase one by 2 and another one by 1, or increase all three by 1**; none of
these may raise a score above 20. The four SRD backgrounds and their three abilities (lines 19478, 19491, 19531,
19540):

| Background | Abilities |
|---|---|
| Acolyte | Intelligence, Wisdom, Charisma |
| Criminal | Dexterity, Constitution, Intelligence |
| Sage | Constitution, Intelligence, Wisdom |
| Soldier | Strength, Dexterity, Constitution |

The SRD also says a GM may offer other backgrounds (line 2603) and has a guide to making one (line 34622, with its own
three abilities).

The SRD says nothing about rerolling a score. Whether a player may, which scores, and which result stands is therefore a table choice, not a rule, and the SRD's own behaviour (no rerolls) is the default.

## What the code does today (a correction to the issue)

The issue says "the background's increases as `derive` already does them". It does not. `derive.js` adds the points of
**feats** (`raised`, capped at the feat's `increase.max`), the class feature Primal Champion, items that set a score and
the DM's `scoreBonus`. It adds nothing for a background: the header comment of `derive.js` says "Ability scores are
entered as they stand after background and feats", and the build note in `portable-characters.md` says a sheet "has no
field for" species and background. The Origin feat of a background is a feat in the place `at: 'background'`; that is all
the background there is.

So the design keeps that convention (the sheet's `abilities` stay the scores after the background, before feats; every
existing sheet, import and starter is unchanged) and adds the background's increase on the *making* side, in the
builder and in a record on the sheet.

## Decisions

### 1. A pure helper, `packages/rules/src/scores.js`

No state, no dice of its own, no I/O. It exports:

- `STANDARD_ARRAY` (`[15, 14, 13, 12, 10, 8]`), `POINT_COST` (the table above), `POINT_BUDGET` (27), and
  `ARRAY_BY_CLASS` (the SRD's table: class id to `{ str, dex, con, int, wis, cha }`).
- `BACKGROUNDS`: the four SRD backgrounds and their three abilities, by id. (A constant with a comment naming the SRD
  lines, because the pack has no background entries; a background entry in the content vocabulary is a later,
  separate change and the constant goes then. Logged in `DEBT.md`.)
- `pointsSpent(scores)` (sum of costs, `null` if any score is outside 8 to 15), `pointsLeft(scores)`.
- `rollScore(state)` and `rollScores(state)`: `rollScore` rolls 4d6 with the `roll` of `rng.js` and marks the lowest die
  `drop: true` (the first of equal lowest); `rollScores` does it six times. Returns
  `{ sets: [{ dice: [{ sides: 6, value, drop? }, ...], total }, ...] }`, the faces shape of `docs/specs/dice.md`. `state`
  is anything with an `rng` (the game, or `{ rng: keyedRng(hex) }` in the lobby).
- `applyBackground(base, bg)`: the scores after a background's increase, never above 20. `bg` is
  `{ abilities: { int: 2, wis: 1 } }`; the shape rules are in 3 below.
- `checkScores(sheet)`: the sentences for `validate` (below).

### 2. What a sheet keeps: one optional field, `scores`

```
scores: {
  method: 'standard' | 'pointcost' | 'roll',      // 'by hand' keeps no record at all
  base: { str, dex, con, int, wis, cha },         // the numbers placed, before the background
  background?: { id?: 'acolyte' | 'criminal' | 'sage' | 'soldier', abilities: { int: 2, wis: 1 } },
  rolls?: [ { dice: [d, d, d, d], again?: [d, d, d, d] }, ... six ],   // method 'roll': the faces of each score, and of its one reroll
  rule?: { reroll: 'none' | 'below' | 'each', below?: N, result: 'new' | 'higher' },   // method 'roll': the rule it was rolled under
  by?: 'table' | 'device',                        // method 'roll': where the dice were rolled (decision 4)
  at?: number | string,                           // 'table': the event's `seq`; 'device': the day, YYYY-MM-DD
}
```

The score a roll makes is the sum of its three highest dice. Where `again` is present, the score that **stands** is
worked out from `rule.result`, never stored: `new` means the reroll's score; `higher` means the larger of the two (equal:
the same number). `base` holds the six scores that stand, in the abilities they were placed on. So the record shows the
reroll and which result stands, and `validate` recomputes it.

`sheet.abilities` stays what it was: the final scores after the background, before feats. A sheet with a `scores` record
must agree with it, and `validate` says so in words when it does not. A sheet with **no** record (every starter, every
imported or hand-typed sheet, every character saved before this) is not checked and plays as before. `scores` is added
to `SHEET_FIELDS` in `derive.js` and to the sheet's fields the build sheet owns (it is *not* in `KEEP`; the builder
writes it from its own controls). Level-ups and feats do not touch it.

`validate`'s new sentences, only when the record is present (each is one sentence, as `validate`'s are):

| When | Sentence |
|---|---|
| `method` is not one of the three | "Its ability scores say they were made by a method this game does not have (standard, pointcost or roll)." |
| standard, and `base` is not the array in some order | "The Standard Array is 15, 14, 13, 12, 10 and 8, each used once." |
| pointcost, a score outside 8 to 15 | "With point cost every score is 8 to 15 before the background." |
| pointcost, cost over 27 | "These scores cost N points; point cost allows 27." |
| roll, `rolls` is not six sets of four dice of 1 to 6 | "A rolled set is six groups of four d6, each die 1 to 6." |
| roll, `base` is not the six scores that stand from `rolls` under `rule` | "The scores are not the totals of the highest three dice of each roll." |
| roll, an `again` where the rule allows none, or on a score the rule does not allow (below N: the first roll was N or more) | "This rule does not allow that score to be rolled again." |
| a background with the wrong shape | "A background raises three abilities: one by 2 and one by 1, or all three by 1." |
| a named SRD background with other abilities | "Acolyte raises Intelligence, Wisdom and Charisma." |
| `sheet.abilities` is not `base` plus the background, at most 20 | "The ability scores no longer match how they were made. Editing a score by hand clears this record." |

### 3. The background's increase

Each of the three abilities of a background gets a choice: **+2 and +1** (two abilities, one each) or **+1 to all three**.
The builder offers the four SRD backgrounds and "Another background (your GM's)", which asks for the three abilities
itself (the SRD allows other backgrounds and gives no list). The builder does not yet read the background's feat, skills or
tool from the background (it has no data for them; the Origin feat stays chosen in the Feats section as today). Not
being able to raise a score past 20 only matters for a rolled 18 (an 18 with +2 shows 20, and the sentence says "capped
at 20"); the standard array and point cost never reach it.

### 4. Where the roll comes from

**In a game: two engine actions and a table setting.**

- `{ type: 'rollAbilityScores' }`: rolls six scores, each 4d6 with the lowest die dropped, from the game's seed
  (`rollScores(s)`), so a game replays exactly. Any member for themself; the DM too. A member who has a roll already is
  refused ("You have already rolled your ability scores at this table.") and the refusal changes nothing, not even the rng;
  the DM may always roll a fresh set.
- `{ type: 'rerollAbilityScore', index }` (`index` 0 to 5): rolls that score again, **once**, if the table's rule allows it
  (below). It is refused, changing nothing, with a sentence that says why: "This table does not allow a score to be rolled
  again." / "This table allows a score below 10 to be rolled again; this one is 13." / "That score has been rolled again
  already." The DM is bound by the same rule (it is their table's rule); they can roll a fresh set instead.
- State: `state.scoreRolls: { [userId]: { sets: [{ dice, again? }, ...] } }`. It is needed so the engine, not the client,
  decides what may be rerolled. It is the DM's information and the member's own, and is not in what other players are sent
  (a `view.js` test). It is a state shape change: state version 24 to 25, a migration that sets `scoreRolls: {}`.
- Events (the faces in the standard faces shape of `dice.md`, so the client draws the dice as for any roll):
  `{ type: 'scoresRolled', by, sets: [{ dice, total }, ...], seq }` and
  `{ type: 'scoreRerolled', by, index, from: { dice, total }, to: { dice, total }, stands: 'new' | 'old', total, seq }`.
  **Who sees them:** the DM and the member who rolled. Other players are told only that "<name> rolled their ability
  scores" or "<name> rolled one score again", never the numbers. They are in the history, so they are recorded and survive a
  reload, undo and a save. `stands` is the rule applied: `new` unless the setting says `higher` and the first score was
  higher.
- **The DM's table rule for rolled scores** is three entries in `SETTINGS` (`engine/dm.js`), changed by the existing
  `setting` action, shown in the DM's table settings with words from `SETTING_TEXT`, and sent to players as every setting
  is. The first value of each list is the default, as for the other settings.

  | Setting | Values | Meaning |
  |---|---|---|
  | `scoreReroll` | `none` (default), `below`, `each` | `none`: no reroll, as the SRD has it. `below`: a score under N may be rolled again, once. `each`: every score may be rolled again, once. |
  | `scoreRerollBelow` | 10 (default), 8, 9, 11, 12, 13, 14 | The N of `below`. "Below" is judged on the score first rolled. (The owner's table: below 10.) Shown in order, 8 to 14. |
  | `scoreRerollResult` | `new` (default), `higher` | `new`: the new roll stands, even if it is lower. `higher`: the higher of the two stands. Applies to both modes. |

  In words beside the choice: "Rolled scores: no reroll (the SRD's rule)", "A score below 10 may be rolled again, once",
  "Every score may be rolled again, once"; "The new roll stands, even if lower", "The higher of the two stands". A change
  applies to rerolls made after it; a roll already made keeps the rule it was made under (the event and the sheet record it).
- How the build sheet uses it (game): Roll sends `rollAbilityScores`; a score that may be rerolled shows **Reroll** and
  sends `rerollAbilityScore`. It reads the member's own events back from the timeline when the panel is closed and
  reopened, so a closed panel is not a reroll. When saved, the draft is `scores: { method: 'roll', rolls, rule, by: 'table',
  at: seq }` with the rule copied from the table's settings at that time.
- The engine does **not** check that a `by: 'table'` sheet's faces equal the game's events (`setSheet` is the DM's action,
  and the DM can look the events up by `at`). If the owner wants it enforced, `setSheet` can compare the faces with
  `scoreRolls` (a small addition; question 4).

**In the lobby builder, with no game: a roll on this device, said plainly.** There is no game and no seed to roll from,
and nothing here can witness the roll. The builder does not pretend it can. It does this:

- It calls `rollScores({ rng: keyedRng(hex) })` with `hex` made by `crypto.getRandomValues` (the host's part, as for a
  game's seed). The function is the same one the action uses, so the dice are the same dice by the same rule; nothing
  in the rules package reads a clock or a random source.
- The six sets of faces, the reroll faces and the rule are kept on the sheet in `scores.rolls` and `scores.rule` with
  `by: 'device'` and the day. They are not hidden and are saved with the character; they are in the character file, so they
  come with the character to a table.
- **The rule on a device.** With no table there is no DM's setting. The builder takes the rule from a choice kept on this
  device (`hextable.scorerule`: reroll none, below N, or each; new or higher; default none and new), which the owner sets once
  in the Roll panel ("Rules for rolled scores on this device") and which is recorded on each sheet it makes. For a solo game
  the player is the DM, so this is the DM's preference. For a player who later joins another table it is the player's own
  choice, and the DM sees it for what it is (next point). Whether a solo game's own table settings start from this choice
  is question 2.
- **What the DM sees.** In the DM's sheet for that character, one line under the scores: "Rolled on the player's device
  on 19 Nov 2026, under the rule 'a score below 10 may be rolled again once, the new roll stands' (set on that device):
  14 (5 3 6 2), 12 (4 4 4 1), 13 (6 4 2 1, rolled again from 8 (3 2 2 1)), ... Not witnessed: the table did not roll these."
  Each rerolled score shows both dice and which stands. (A "Rolled at the table" line, with the event's `seq`, for
  `by: 'table'`.) If the sheet's rule is looser than the table's setting, the line says "More rerolls than this table
  allows" so the DM sees the difference; nothing is refused. The same line shows where My characters lists the character, and
  when the join-with-a-character offer of `portable-characters.md` is built, its summary line says "scores rolled on the
  player's device". The DM is never told a device roll is as good as a table roll; a DM who wants a witnessed roll uses
  the action in the game (the DM rolls, or lets the player roll, and the character is edited to those scores).
- **A closed panel is not a reroll.** The unsaved roll is kept on the device (`localStorage`, one entry, `hextable.scoreroll`)
  until the character is saved or the player starts a different new character. A player who clears their storage can
  still roll again; the sheet cannot tell. That is the honest limit of a roll no one watches, and the record exists so the
  DM can decide what to make of it, not so that it is enforced.
- **No new set.** After the six scores are rolled there is no "Roll all again": the owner asked for a reroll of a score,
  never of the set. Switching to another method keeps the roll, and switching back shows it. A new character gets a new roll.
- Rerolls on a device are rolled the same way, one score at a time, by `rollScore` with a fresh key, once per score, only
  where the device rule allows.

### 5. The score section of the build sheet (client)

It replaces the six free boxes in "Ability scores" (`buildsheet.js`, `initBuild`); nothing else on the sheet moves, so
the start-flow pages (#556) are not touched. Four choices in one segmented control, big enough for a thumb:
**Standard array, Point cost, Roll, Enter by hand**. A sheet that has no `scores` record opens on "Enter by hand" exactly
as today. A sheet with one opens on its method.

Under the control, six rows (STR to CHA), each: the ability's name and `mod`, the control for the method, the
background's `+n` if any, and the final score. A line under them says how the scores will be saved. Every row is at
least 44 px high, one column at 390 px wide, two columns of three at 1280 px.

| Method | The control | The line under it |
|---|---|---|
| Standard array | Each ability a `select` of the numbers not yet used (the used ones greyed and say so). A **Suggest for a <Class>** button fills the SRD's table. | "Used 4 of 6 numbers." |
| Point cost | Each ability a minus and a plus button around the score (8 to 15; plus is off at 15 or when it would pass 27, and says why in words next to the line, not only by greying). Starts at 8 each. | "27 points, 12 spent, 15 left." |
| Roll | One **Roll the dice** button. After it, six chips with their dice ("14: 5 3 6 ~~2~~"), each with a **Reroll** button where the rule allows it (a chip the rule does not allow says why in words: "13 is not below 10"). A chip rerolled once shows both ("14, rolled again from 8: the new roll stands") and has no button. Each ability gets a `select` of the chips not yet used, by chip, so a reroll changes the number under the ability it is placed on. In a game it says "Rolled at the table"; in the lobby, "Rolled on this device. The DM will see this." The rule is said above the chips in one sentence ("This table: a score below 10 may be rolled again once; the new roll stands.") and, in the lobby, can be changed there. | "Rolled on this device at 21:14. 2 of 6 rolled again." |
| Enter by hand | Today's six boxes. | Today's note, "Enter each score as it stands after background." |

Below the method, **Background**: a select of the four SRD backgrounds and "Another background (your GM's)"; then
"+2 to [ability]  +1 to [ability]" or "+1 to each" (a segmented choice) over the three abilities the background names.
Standard array, point cost and roll show the background's `+n` beside each row; "Enter by hand" shows no background
control (the score is entered as it already stands). Choosing a method for a sheet that already has hand-typed scores asks
once: "This replaces the scores you typed." The problem list under the sheet (`#qb-problems`, `aria-live`) shows
`validate`'s sentences as it does now; Save stays off until the six numbers are placed, as `validate` says.

### 6. My characters and the saved record (`mycharacters.js`)

`makeFile` and `parseFile` already carry the sheet whole and check it with `validate`, so `scores` rides along and a file
with a record that does not agree with its own scores is refused with the sentence above. `mycharacters.js` adds the one
line that says how a character's scores were made, in the list and the manager ("Standard array", "Point cost, 27
points", "Rolled on this device, 19 Nov", or none). It also holds the unsaved roll's one storage entry. No new key
in the envelope (`TOP`).

## The build in stages (small PRs)

| Stage | What | Files |
|---|---|---|
| S1 | `scores.js` and its tests (array, costs, applying a background and the cap at 20, roll shape and the drop, which result stands under `new` and `higher`, which scores a rule lets be rerolled, the rng position after a roll); `validate` and `SHEET_FIELDS` for the record; the ten sentences each with a test | `packages/rules/src/scores.js`, `derive.js`, `packages/rules/test/` |
| S2 | The two actions, the events, `scoreRolls`, the three settings (and their words in `SETTING_TEXT` and the DM's table settings in `tablecontrols.js`); state version 25 and its migration; `view.js` for the events; tests: seed replay gives the same faces, a refused second roll or reroll changes nothing (not the rng either), each of the three modes accepts and refuses what it should, `new` and `higher` each stand as set, below N is judged on the first roll, what a player is and is not sent | `engine/characters.js`, `engine/dm.js` (`SETTINGS`), `migrate.js`, `scenario.js`, `view.js`, `packages/client/tablecontrols.js`, `packages/rules/test/` |
| S3 | The score section (four methods, the background, the words), the lobby roll and its kept entry, the line in My characters; client tests of the pure parts | `packages/client/buildsheet.js`, `mycharacters.js`, `style.css`, `packages/client/test/` |
| S4 | A smoke step: a new character in My characters by each method at 390 x 844 and 1280 x 800, no page errors; the DM's line for a device roll | `scripts/smoke/`, `scripts/smoke.mjs` |
| S5 | `docs/DEBT.md` lines (below); this spec's build note | `docs/DEBT.md`, this file |

S1 and S3 do not need S2 to be useful: a lobby roll works with S1 and S3 alone, and "Roll" in a game waits for S2.

## Risks

- A stricter `validate` rejects a sheet whose `scores` disagree with its `abilities`. No sheet has a record today, so none
  breaks; a DM's hand edit of a score must clear the record (the builder does it; a raw `setSheet` that edits only
  `abilities` is refused with the sentence, which says what to do).
- A device roll can be rolled again by clearing storage. The spec says so on the screen and to the DM; it does not claim more.
- The background constant duplicates four lines of SRD text until a background entry exists in the content vocabulary.
- State version 25 is a change to the state shape, for the rolled scores a member holds (`scoreRolls`).
- `scoreRerollBelow` is a list of numbers with 10 first as the default, so it is shown sorted, not in list order.

## Debt this will log

- Backgrounds are a constant in `scores.js`, not content; a background's skills, tool and Origin feat are not read from it.
- A device roll is not witnessed; the engine does not compare a table roll's faces with the log.
- Species do not exist on the sheet (as before); a multiclass sheet is still not opened by the build sheet.

## Questions for the owner (each with a default)

1. **The reroll rule.** Defaults: `none`, below 10, the new roll stands; so a fresh table follows the SRD, and the owner's own
   table is two clicks (below, new). Is "below N once" with N from 8 to 14 enough, or should N go to 18?
2. **Does a solo game start with the owner's rule?** In the lobby the builder uses a rule kept on the device (default none).
   Default: **the solo game's table settings start from that same device rule**, so the owner sets it once and both the
   builder and the game agree. Alternative: they are separate and the DM sets the game's settings in the game.
3. **Does the lobby builder offer all four methods, including "Enter by hand"?** Default: **yes**, so imports and sheets from
   other sources can still be corrected without a method.
4. **Should the engine check a table roll against the log** when the DM saves a sheet with `by: 'table'`? Default: **no** (the DM
   can see the events; the DM is trusted with `setSheet` already). If yes, it is a small addition to S2.
5. **The SRD's class suggestion button** for the Standard Array ("Suggest for a <Class>"). Default: **yes**, it is the SRD's own
   table and one button.
6. **Other backgrounds.** Default: the four SRD ones plus "Another background" with three abilities picked by hand, with the
   background's feat, skills and tool still entered in their own places as today. Alternative: wait for backgrounds to be
   content.
7. **A second whole set for a player** (the member already rolled, the character died). Default: **not offered**; the DM rolls
   a fresh set. Alternative: a DM-only "clear this player's roll".

## Build note: part 1 (#557)

Built: `packages/rules/src/scores.js` (and `validate`, through `checkScores`, with `scores` in the sheet's fields); the build screen's score section; the line in My characters; the DM's line in the character sheet; the unsaved roll and the rule kept on the device. No engine action, no state change. What was settled while building:

- **The record's `rule`.** A roll's record carries `rule: { reroll, below?, result }` as designed. On a device the rule is the one kept under `hextable.scorerule` (the page offers it above the Roll button, until the first roll; after it the rule is fixed and said in a sentence). `scores.js` exports `standing`, `mayReroll`, `rerollWhy`, `ruleText`, `cleanRule`; the client and `validate` both read them.
- **Typed scores are kept, not replaced.** Choosing a method does not ask "this replaces the scores you typed" (the design's wording): nothing is thrown away, what was typed comes back with "Enter by hand" and the section says so. A level-up shows how the scores were made and does not offer to change them.
- **Where a roll is rolled today.** The build screen rolls on the device in every mode, in a game too (`by: 'device'`, the day). `by: 'table'` and `at: <event seq>` are read, checked and shown ("Rolled at the table (event 41)") but nothing writes them until part 2. `dmLine(sheet, tableRule)` already says "More rerolls than this table allows" when given the table's rule; part 2 gives it one.
- **A roll that is not saved** is kept in `hextable.scoreroll` (the faces, the rule and the day, with any reroll already made) until a sheet is saved with it. Closing the panel is not a new roll; a rerolled score stays rerolled. A character opened from a saved sheet cannot roll or reroll again ("This character was saved with these rolls.").
- **The DM's line** is in the character sheet of a creature that has a `sheet` with a record (`#sheet-scores-line`, DM only; one line in `app.js`, outside the files the design named; it only calls `dmLine`).
- **Sentences added to `validate`**: the ten of the table above plus one for a rule that is not one ("Its reroll rule is none, below a number from 4 to 18, or each, and either the new roll or the higher of the two stands.") and one for the record's shape.
- **Styles** are in `style.css` (`.sc-*`), not `quickentry.css` where the rest of the build screen's are; the build screen's `select` and `button` rules there ask 40 px, and the score section asks 44.

## Build note: part 2 (#557, #576)

Built: the settings `scoreReroll` (none, below, each), `scoreRerollBelow` (10 by default) and `scoreRerollResult` (new, or higher), with their words and the DM's controls in `tablecontrols.js`; `tableRule(settings)` in `scores.js`; the actions `rollAbilityScores` and `rerollAbilityScore` in `engine/characters.js`; the events `scoresRolled` and `scoreRerolled`; state version 25 and its migration (`scoreRolls: {}`).

- **What is kept.** `state.scoreRolls[userId] = { sets: [{ dice: [4 faces], again?: [4 faces] }] }` (the DM, where there is no user id, is `'dm'`). A member rolls once per table; the DM may roll again, which replaces the set. A reroll is once per score, judged on the first roll, and the table's rule at that moment decides. `rollAbilityScores` takes an optional `for: <user id>`, which only the DM may give: the DM rolls a fresh set for that member in place of what they have (the DM's own record is not touched; a member who has not rolled can be rolled for the same way). This is the repair for a record that is damaged or a roll the member should not be held to; it was chosen over a separate action because it is the same roll, from the same seed, with the same event. A record that is not six sets of four dice (a hand-edited save) is refused with a sentence, never an error; the DM repairs it with `for`.
- **Who is told what.** `playerView` whitelists fields, so no player is sent `scoreRolls`; the DM's view is the whole state. In `viewEvents` the full events (the faces, the totals, which result stands) go to the roller and the DM; the member the DM rolled for gets the full event too (`by` is the member), every other player gets the bare type, and the log shows them "Someone rolled their ability scores" and "Someone rolled one ability score again", with no numbers.
- **What `at` is.** The event's number, from a counter kept in `scoreRolls['#seq']`: it counts every roll and reroll at the table, starting at 1, and does not move when the timeline is cut at its cap. A counter that is missing or not a whole number (a save made by hand) is rebuilt as the number of records kept, and the numbers go on from there; a refused action never moves it. (The events carry no `seq` of their own, and a place in the timeline would name the wrong event once the timeline had been cut.) A sheet's `at: <n>` with `by: 'table'` ("Rolled at the table (event n)") is this number. `'#seq'` is not anyone's user id: a roll from that id is refused.
- **Outside the files this part's row names**: `history.js` (labels for the two actions), `app.js` (the two log lines), `feedback.js` and `docs/specs/feedback.md` (the two kinds, classified `engine`: no typed text), and a number of tests that pin the state version or compare a migrated old save with the new one.
- **Left**: the build sheet still rolls on the device in every mode; it does not send the actions, write `by: 'table'` or give `dmLine` the table's rule (follow-up #578; `docs/DEBT.md` C22).
