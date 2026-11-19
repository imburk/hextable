# Importing characters from Fantasy Grounds

`packages/rules/src/import-fgxml.js` reads the XML a Fantasy Grounds 5E "save character" export writes
(`<root version="5.1" ...><character>`) and returns `{ character, report }`. It is pure: text in, data out. It
reads no files, uses no DOM and has no dependency. The button that picks a file is a separate job (see "For a client").

```js
import { importFgxml } from './shared/import-fgxml.js';
const { character, report } = importFgxml(text);     // never throws; a bad file gives character: null and report.error
```

## What `character` is

A **sheet**, the shape `setSheet` takes and "Build from class and level" produces (`derive.js`): class, level,
subclass, ability scores, skills, `extraSkills`, expertise, `choices`, armour, shield, weapons, spells, tools, gear,
senses, speed, size. The engine makes the record from it, so the numbers it plays are the engine's, not the file's.
Nothing new is invented: the one field beyond what "Build from class and level" makes is the optional `scoreBonus` (see "Scores above 20").

`report.loadable` is true when `validate(sheet)` and `lintRecord(derive(sheet).record)` find nothing; `report.problems`
says why when it is not.

## What is mapped

| From the file | To |
|---|---|
| `name` | the name with the player's name dropped: one trailing `[...]` or `(...)` is removed and never kept (the files seen so far use parentheses) |
| `classes` | every SRD 5.2 class, by name. One class gives a sheet with `class` and `level`; two or more give a multiclass sheet, `classes: [{ class, level, subclass?, spells? }]` (#175). The first class taken is the one whose saving throw proficiencies the sheet shows (only the first class gives them), else the sheet's first; when that cannot be told, `report.adjustments` says which was taken. A class that is not SRD 5.2 goes to `report.multiclass` and is not built (the SRD ones still are) |
| `classes/*/specialization` | for each class, the SRD subclass when the name matches it (the 2014 "Draconic Bloodline" is the SRD Draconic subclass). Else, at level 3 or more, the table's own homebrew subclass of that class when the name matches exactly one (see "A homebrew subclass of the table"). Otherwise see "Stand-ins" |
| `abilities/*/score` | `abilities`, at most 20; what is above 20 goes to `scoreBonus` (at most +10 for each ability) and is reported. See "Scores above 20" |
| `skilllist` (`prof` 1 or 2) | `skills` (the class's picks) and `extraSkills` (the rest); 2 is expertise as far as the class has it; 3 (half proficiency) is not proficiency |
| `inventorylist` armour carried 2 (equipped), Shield | `armour`, `shield`, only if the class is trained in it |
| `weaponlist` carried 1 or 2 (through its link to the inventory item) | `weapons`, by name against the pack ("Crossbow, Heavy" is a Heavy Crossbow; "Greatsword, +2" is a Greatsword), only if the class is proficient and the character holds twelve attacks at most |
| `proficiencylist` | `tools` for names that look like tools; armour and weapon training is the class's |
| `speed/base`, `size`, `senses` | `speed`, `size`, `senses` (Darkvision and the like) when the engine can hold them |
| `powers` with a `school` | `spells` (on a multiclass sheet, each class's `spells`): the class's own groups (`Spells (Class)`) and the generic `Spells` group (for the first class that casts), matched by normalised name (`Detect Magic (RIT) (30) (C)` is Detect Magic), on the class list, within the 5.2 limits |
| other carried non-magic items | `gear`, names only |
| `languagelist`, `hp` damage, spent slots | `report.languages` and `report.state`, because a sheet has no field for them |

Spells the subclass always prepares (oath, domain, Draconic) are added by `derive` and are not listed twice, and they do
not count against the class's prepared count. See "Prepared spells" for what happens when the sheet flags too many.

## What is not mapped, and the report

Each category is a list of `{ name, why }`, `report.counts` has its length. Only names, numbers and flags are read:
**no description text is read or kept**, and a name over 60 characters (a description typed into a name box) is
replaced by `[a long entry, N characters]`.

| Category | Holds |
|---|---|
| `multiclass` | the classes not built (not SRD 5.2) |
| `subclass` | a subclass that is not SRD 5.2 |
| `species`, `background` | names; the pack has no species or backgrounds. Species traits and innate spells are listed |
| `magicItems` | every magic item: mapped to the pack (`item`, `tier`, worn and attuned as imported), or why not |
| `feats` | every feat on the sheet. One the pack holds (by name) is put on the sheet's `feats` at the first place it can be taken (an Origin feat at the background's place first) with its choices left open, and carries `feat`, `at` and `tier`; any other is a name-only note. An SRD feat whose 2014 namesake had other rules (Alert, Grappler, Magic Initiate, Savage Attacker, Great Weapon Fighting) is also listed in `ruleDifferences` as "5.2 version". Places for a feat left open are one `ruleDifferences` entry |
| `features` | class features on the sheet that are not auto in the pack: `tier` `manual` or `assist` where the pack has them, none where it does not (a subclass or 2014 feature) |
| `spells` | spells not in the pack, not on the class list, over the 5.2 limit, or of a class not built; on a multiclass sheet also a class that casts with no spells listed under its group |
| `magicItems` | every magic item, by name. A weapon or armour with a base in the pack is imported as the plain base (`importedAs`) and listed here |
| `gear` | weapons and armour not imported and why, items marked not carried, entries too long to be names |
| `proficiencies` | tool entries that are choices or not tools |
| `ruleDifferences` | 2014 against 5.2 that can be told from a name: species, renamed or removed features, the subclass name, total level |
| `numbers` | the sheet's Hit Points, Armor Class, Speed, Proficiency Bonus, saving throws, skill bonuses, spell save DC and spell slots where they differ from what `derive` gives |
| `adjustments` | everything done so the sheet loads (see below) |

`report.spellTiers` and `report.builtFeatures` count what was imported by tier (`auto`, `assist`, `manual`).

## Prepared spells

The file's "prepared" flags are read in the sheet's own order (the order of its `powers`), not alphabetically and not by level.
The always-prepared spells of the SRD subclass are added by `derive`. Then the flagged SRD spells on the class list fill the class's
prepared count at its level, the earliest in the sheet's order first. A sheet that flags more than the class prepares (a cleric or druid who
flags the whole list, a wizard who flags the spellbook) is not refused any more: `report.spells` has one entry, "Prepared spells"
(on a multiclass sheet "Prepared <Class> spells"), that says how many the class prepares, which were taken and which were left, with
the left ones in `items`, so the DM can change them. A flagged spell that is not in the pack, not on the class list or above the
level the class casts keeps its own line and is not counted as left.

On a multiclass sheet, a class with an empty group takes the spells it finds in another class's group (see the limits below). A class with no spells in its own group (`Spells (Bard)`) and none in the generic `Spells` group reads the spells of a group named exactly "Spells Known" (for the first class that has none) or by a bare class name ("Bard", for that class); a group with another name, such as a feat's "Magic Initiate Spells", is not read as class spells. It takes the flagged leveled spells, or, when none is flagged, every spell in it (known
spells carry no flag), and every cantrip in it. `report.adjustments` says which group was read ("The DM should check them"). Which group
name Fantasy Grounds uses for a Bard's known spells is not settled by the exports seen so far; a sheet that keeps them nowhere gets none,
as before.

Limits of the move between classes: it goes by the spell lists alone, so a non-SRD subclass's own spell (a 2014 Oath spell that is on the
Wizard list but not on the SRD Paladin list) in the Paladin's group moves to a Wizard whose group is empty, and takes a place in its count.
The "Spells moved to the <Class>" entry lists every spell moved, so the DM can put it back. A spell a subclass always prepares is not added
to a class's list on a multiclass sheet; it gets one entry saying so.

## Scores above 20

A sheet's scores are 1 to 20 before its feats, and in the engine only an Epic Boon (level 19 or above) or a magic item takes one past
20. A score of 22 on a file is imported as 20 with `scoreBonus: { cha: 2 }`: the bonus is the sheet's score minus the score the engine derives for the sheet without one (its items, feats and boons included, so a Belt of Giant Strength the engine applies adds none, and a belt that gives 21 with a sheet score of 22 leaves +1), when that is positive, and at most +10. It is an optional field of the sheet (character data, not
homebrew content; no state version change), `{ <ability>: n }` with each n a whole number from 1 to 10. `derive` adds it after every
cap and every feat or item that raises the score, so the engine plays the score the file shows; the result is at most 30, and
`validate` refuses a bonus that would pass 30. The explanations name it: `why.abil` ("DM bonus: Charisma +2"), and `why.ac` and
`why.hp` where the Dexterity or Constitution score they use includes it. The importer puts a line in `report.adjustments`
("Charisma 22 on the sheet: +2 kept as a DM bonus; check what gives it"); a score over 30 keeps +10 and says how much is left out, and
a bonus that would pass 30 on top of an item is trimmed to fit, and says so. The adjustment names what the engine already counts.
The DM removes a bonus with the "Remove" control beside "DM bonus" in the build sheet, or by sending the sheet without `scoreBonus` (`setSheet`).

## A homebrew subclass of the table

When a class is level 3 or more and its subclass name is not the SRD's, the importer looks among the homebrew subclasses of that class
that are loaded (`CONTENT.subclasses`; call `importFgxml` inside `using` with the table's packs, as the DM's page does). A subclass
matches when its name is the sheet's name (case, accents and punctuation ignored) or one holds the other as whole words: "Ember" matches
"Oath of the Ember".

- **One match:** the sheet's subclass is its id. It is not a stand-in, so what it always prepares is the character's, not listed twice, and its
  features are not reported under "not in the SRD 5.2 pack". `report.imported.homebrewSubclasses` lists it: `{ class, id, name, pack, sheet, text }`,
  the text being "matched the table's homebrew subclass Oath of the Ember (pack ember-folk)".
- **None:** the SRD stand-in, as below.
- **Two or more** (two packs): the stand-in, and a `subclass` note naming the candidates and their packs, so the DM edits the sheet.
- `importFgxml(text, { homebrewSubclass: false })` turns matching off.

Nothing is added to the table by the importer: the DM sees the report before confirming. The pack is not read from the file; if the pack is not
loaded when the sheet is imported, the stand-in is what the sheet gets.

## Stand-ins

A sheet at level 3 or more must name the SRD subclass and a feature with options needs a chosen option; a score is
1 to 20 (see above for what is over). Where the file cannot supply that, the importer sets the nearest value and lists it in `report.adjustments`
(`what`, `from`, `to`, `why`): a non-SRD subclass becomes the SRD one ("its features are NOT this character's"), a
2014 sheet has no Divine Order or Primal Order (the option the gear fits is taken, else the first). A score of 22 is 20
with a DM bonus of +2 (the file does not say what raised it, so the DM is told).
`importFgxml(text, { substituteSubclass: false })` leaves the subclass out; the sheet then cannot load.

## Known limits of the format

- The file's "prepared" flags are read in the sheet's order and cut at the class's prepared count. A cleric or druid whose sheet
  flags the whole class list gets the first spells of its list that the class can take, and one entry lists those taken and left; the
  DM changes them.
- A multiclass sheet may keep another class's spells in the group of its first class (all of a Paladin/Bard's spells under
  "Spells (Paladin)", "Spells (Bard)" only a header). A built class that gets no spells from its own group takes, from the other
  built classes' groups, the spells on its list that are not on that group's class list (flagged spells, and cantrips flagged or
  not); a spell on both lists stays with the group's class. One entry, "Spells moved to the <Class>", lists those moved; each
  class then fills its own count in sheet order. A class that still gets none has one entry saying so; the DM moves them. The prerequisites (13 in each class's primary ability) are checked: a sheet that misses one does not load.
- A feat's choices (which scores an Ability Score Improvement raised, Skilled's skills, Magic Initiate's spells) are not
  in the file: the feat is put on the sheet with them left open, so the scores and skills imported stand as they are.
- Magic items the pack holds are put on the sheet's `items` (by name, including the 2014 names of SRD items such as
  "Potion of Greater Healing", "Potion of Hill Giant Strength", "Quaal's Feather Token", "Iron Bands of Bilarro", and
  "Scroll of <spell>"); a "+1" weapon, armour or Shield becomes the pack's +1 item made from that base. Worn and attuned
  follow the file (`carried` 2, `attune` 1); if the sheet refuses that (a fourth attuned item, two cloaks), the item is
  kept attuned-off, then carried, and the report says why. An item whose damage type the file does not give (Ring of
  Resistance) is a note. Potions and scrolls keep their count, up to 10.
- Non-SRD magic items, non-SRD feats, species, backgrounds and non-SRD subclasses are never given stats. A table that wants them needs a
  private, table-local form (a name-only note or a custom entry the DM types); they cannot enter the repo.

## For a client

A button reads the file as text and calls `importFgxml(text)`. If `report.ok` is false it shows `report.error`. Otherwise it
shows the report (counts, `adjustments` first, then each list) and, on the DM's confirmation, sends
`act({ type: 'setSheet', sheet: character })`. Spent slots and damage in `report.state` can be applied afterwards with
`harm`. The report must be shown: the sheet alone hides stand-ins.

### Where the report goes after the import

A sheet has no notes field and the engine has no state for a report, so the client keeps it in the DM's chronicle. When the DM
confirms (Add or Replace), `importfg.js` sends, after `setSheet` is applied, an ordinary
`{ type: 'chronicle', title: <the character's name>, text: <the report as text>, tags: ['fg-import'] }`. There is no
choice to make: the report is always written. The entry has no `public` flag, and a `chronicle` event reaches a player only when
`public` is true (`view.js`, "chronicle"; `packages/server/README.md`), live and from `history`. The smoke pass `controls` checks
that a phone player is sent none of it, in the live updates and when it asks the table for its history.
The sheet shows the DM a line ("Imported from Fantasy Grounds. Its report is in your chronicle...") when the chronicle holds an
entry tagged `fg-import` titled with that character's name (so the line is found again after a reload). A character renamed
afterwards loses the line; the entry stays. Text over 8,000 characters is cut with a note, and the file button still saves all of it.
Only the DM can import: `setSheet` is a DM action, and the import panel says so.
