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
Nothing new is added to the sheet and the engine is not changed to accept it.

`report.loadable` is true when `validate(sheet)` and `lintRecord(derive(sheet).record)` find nothing; `report.problems`
says why when it is not.

## What is mapped

| From the file | To |
|---|---|
| `name` | the name with the player's name dropped: one trailing `[...]` or `(...)` is removed and never kept (the files seen so far use parentheses) |
| `classes` | every SRD 5.2 class, by name. One class gives a sheet with `class` and `level`; two or more give a multiclass sheet, `classes: [{ class, level, subclass?, spells? }]` (#175). The first class taken is the one whose saving throw proficiencies the sheet shows (only the first class gives them), else the sheet's first; when that cannot be told, `report.adjustments` says which was taken. A class that is not SRD 5.2 goes to `report.multiclass` and is not built (the SRD ones still are) |
| `classes/*/specialization` | for each class, the SRD subclass when the name matches it (the 2014 "Draconic Bloodline" is the SRD Draconic subclass). Otherwise see "Stand-ins" |
| `abilities/*/score` | `abilities`, clamped to 20 (reported) |
| `skilllist` (`prof` 1 or 2) | `skills` (the class's picks) and `extraSkills` (the rest); 2 is expertise as far as the class has it; 3 (half proficiency) is not proficiency |
| `inventorylist` armour carried 2 (equipped), Shield | `armour`, `shield`, only if the class is trained in it |
| `weaponlist` carried 1 or 2 (through its link to the inventory item) | `weapons`, by name against the pack ("Crossbow, Heavy" is a Heavy Crossbow; "Greatsword, +2" is a Greatsword), only if the class is proficient and the character holds twelve attacks at most |
| `proficiencylist` | `tools` for names that look like tools; armour and weapon training is the class's |
| `speed/base`, `size`, `senses` | `speed`, `size`, `senses` (Darkvision and the like) when the engine can hold them |
| `powers` with a `school` | `spells` (on a multiclass sheet, each class's `spells`): the class's own groups (`Spells (Class)`) and the generic `Spells` group (for the first class that casts), matched by normalised name (`Detect Magic (RIT) (30) (C)` is Detect Magic), on the class list, within the 5.2 limits |
| other carried non-magic items | `gear`, names only |
| `languagelist`, `hp` damage, spent slots | `report.languages` and `report.state`, because a sheet has no field for them |

Spells the subclass always prepares (oath, domain, Draconic) are added by `derive` and are not listed twice.

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

## Stand-ins

A sheet at level 3 or more must name the SRD subclass, a feature with options needs a chosen option, and a score is
1 to 20. Where the file cannot supply that, the importer sets the nearest value and lists it in `report.adjustments`
(`what`, `from`, `to`, `why`): a non-SRD subclass becomes the SRD one ("its features are NOT this character's"), a
2014 sheet has no Divine Order or Primal Order (the option the gear fits is taken, else the first), a score of 22 is 20
(above what the engine derives: only an Epic Boon or a magic item takes a score past 20, and the file does not say
which raised it, so the DM is told rather than the score kept).
`importFgxml(text, { substituteSubclass: false })` leaves the subclass out; the sheet then cannot load.

## Known limits of the format

- The file's "prepared" flags are a list only when about as many spells are flagged as the sheet says it prepares. A cleric
  or druid whose sheet flags the whole class list is not read as a choice: no leveled spells are imported, one entry says so.
- A multiclass sheet may keep another class's spells in the group of its first class. They are read as that class's, so
  they may be refused as not on its list or over its limit, and the other class may get none (one entry says so); the DM
  moves them. The prerequisites (13 in each class's primary ability) are checked: a sheet that misses one does not load.
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
