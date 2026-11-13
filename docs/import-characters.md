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
| `classes` | the class with the most levels, by name. The others go to `report.multiclass`; a class that is not SRD 5.2 cannot be built |
| `classes/*/specialization` | the SRD subclass when the name matches it (the 2014 "Draconic Bloodline" is the SRD Draconic subclass). Otherwise see "Stand-ins" |
| `abilities/*/score` | `abilities`, clamped to 20 (reported) |
| `skilllist` (`prof` 1 or 2) | `skills` (the class's picks) and `extraSkills` (the rest); 2 is expertise as far as the class has it; 3 (half proficiency) is not proficiency |
| `inventorylist` armour carried 2 (equipped), Shield | `armour`, `shield`, only if the class is trained in it |
| `weaponlist` carried 1 or 2 (through its link to the inventory item) | `weapons`, by name against the pack ("Crossbow, Heavy" is a Heavy Crossbow; "Greatsword, +2" is a Greatsword), only if the class is proficient and the character holds twelve attacks at most |
| `proficiencylist` | `tools` for names that look like tools; armour and weapon training is the class's |
| `speed/base`, `size`, `senses` | `speed`, `size`, `senses` (Darkvision and the like) when the engine can hold them |
| `powers` with a `school` | `spells`: the class's own groups (`Spells (Class)`) and the generic `Spells` group, matched by normalised name (`Detect Magic (RIT) (30) (C)` is Detect Magic), on the class list, within the 5.2 limits |
| other carried non-magic items | `gear`, names only |
| `languagelist`, `hp` damage, spent slots | `report.languages` and `report.state`, because a sheet has no field for them |

Spells the subclass always prepares (oath, domain, Draconic) are added by `derive` and are not listed twice.

## What is not mapped, and the report

Each category is a list of `{ name, why }`, `report.counts` has its length. Only names, numbers and flags are read:
**no description text is read or kept**, and a name over 60 characters (a description typed into a name box) is
replaced by `[a long entry, N characters]`.

| Category | Holds |
|---|---|
| `multiclass` | the classes not built |
| `subclass` | a subclass that is not SRD 5.2 |
| `species`, `background` | names; the pack has no species or backgrounds. Species traits and innate spells are listed |
| `feats` | every feat (the pack has none), saying whether SRD 5.2 has it |
| `features` | class features on the sheet that are not auto in the pack: `tier` `manual` or `assist` where the pack has them, none where it does not (a subclass or 2014 feature) |
| `spells` | spells not in the pack, not on the class list, over the 5.2 limit, or of another class |
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
2014 sheet has no Divine Order or Primal Order (the option the gear fits is taken, else the first), a score of 22 is 20.
`importFgxml(text, { substituteSubclass: false })` leaves the subclass out; the sheet then cannot load.

## Known limits of the format

- The file's "prepared" flags are a list only when about as many spells are flagged as the sheet says it prepares. A cleric
  or druid whose sheet flags the whole class list is not read as a choice: no leveled spells are imported, one entry says so.
- A multiclass sheet may keep another class's spells in the group of its first class; they are reported under that class.
- Magic items, feats, species, backgrounds and non-SRD subclasses are never given stats. A table that wants them needs a
  private, table-local form (a name-only note or a custom entry the DM types); they cannot enter the repo.

## For a client

A button reads the file as text and calls `importFgxml(text)`. If `report.ok` is false it shows `report.error`. Otherwise it
shows the report (counts, `adjustments` first, then each list) and, on the DM's confirmation, sends
`act({ type: 'setSheet', sheet: character })`. Spent slots and damage in `report.state` can be applied afterwards with
`harm`. The report must be shown: the sheet alone hides stand-ins.
