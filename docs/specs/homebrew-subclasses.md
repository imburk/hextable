# Spec: homebrew subclasses

Status: draft by an agent (#492), to be reviewed by the design owner. Docs only: nothing here is built. It extends
[homebrew.md](homebrew.md) (the gate, the registry, strict mode, Decision 5) with one more kind of homebrew entry, a
**subclass of an SRD class**, which that spec left out (its Decision 1 and Decision 9: "Homebrew subclasses of SRD
classes: large; engine"). The owner chose it as the first vocabulary growth (homebrew.md, question 4: "Homebrew
subclasses of SRD classes first") and, on 18 November, "subclasses first".

**No rules text or numbers from any non-SRD book are in this spec, its examples or its tests.** The owner's table
needs four subclasses that are not in SRD 5.2 (a paladin oath, a druid circle, a cleric domain, a bard college,
across five characters). They are described below only by the *kinds* of feature they need. The entries themselves
are written by the owner into his table's private pack, never into the repo. Every example here is invented for this
project (an "Oath of the Ember" of a pack `ember-folk`).

## Problem

1. **A homebrew pack cannot carry a subclass.** `HOMEBREW_ENTRY_KINDS` (`content/schema.js`) is spells, monsters,
   items, feats, objects, weapons and armour; a `classes` or `subclasses` key in a pack is refused ("cannot be
   homebrew").
2. **The engine knows one subclass per class.** A class entry has one `subclass` object (`lintClass`). `derive.js`
   reads it in four places by comparing ids: `classFeatures` (`k.subclass === c.subclass.id`), the always-prepared
   spells (`derive`, the `always` set), the sheet's class name (`named`), and `validate`, which refuses any other
   id ("The Paladin subclass in the SRD is Oath of Devotion") and requires that one at level 3 or more.
3. **So the importer stands in.** `import-fgxml.js` gives a level 3 or higher character whose subclass is not the
   SRD's the SRD subclass, marked "its features are NOT this character's" (`standIns`, `adjust('subclass', ...)`),
   because the sheet cannot load otherwise. All five of the owner's characters with such a subclass play today with
   the wrong features.

The SRD itself expects other subclasses: each class says "You gain a Paladin subclass of your choice. The Oath of
Devotion subclass is detailed after this class's description" (`reference/srd52/srd52-flow.txt`, 11963-11968; the
Bard, 5869-5875, says the same of the College of Lore).

## Goals

- A DM's pack can hold a subclass of an SRD class, written in the same feature vocabulary the SRD subclasses use,
  checked by the same gate, with the same honesty about tiers.
- A sheet names it (`subclass: 'hb-…'`), and `derive` builds its features and always-prepared spells, for one class
  or several.
- What the vocabulary cannot say becomes a `manual` feature with text for the DM, so a subclass always loads; the
  reading says which parts the engine plays.
- The importer uses it in place of the SRD stand-in when the table has it.
- The survey says, for each kind of feature the owner's four subclasses need, whether the vocabulary says it today,
  and if not, the small addition that would. Each addition is its own engine job with its own amendment.

Not goals: a homebrew **class**; a subclass of a homebrew class; spellcasting given by a subclass to a class that
has none (Decision 1); homebrew species or backgrounds.

## The decisions

### Decision 1: a subclass is a new homebrew kind, `subclasses`, shaped like an SRD class's `subclass`

**Question.** Where does a homebrew subclass live, and what does it look like?

**Options.**

- A. **A pack carries a whole class entry** whose `subclass` is the homebrew one. Refused: it would repeat (and be
  able to change) the SRD class's table, hit die and features, and two packs could disagree about the Paladin.
- B. **A new kind, `subclasses`**, each entry naming the SRD class it belongs to and holding only what the SRD
  `subclass` object holds.

**Choice: B.** A pack document gains a list `subclasses` beside `spells`, `feats` and the rest:

```js
subclasses: [{
  id: 'hb-ember-folk-oath-of-the-ember',      // the pack's prefix, like every homebrew id (homebrew.md, Decision 1)
  name: 'Oath of the Ember',                   // not the name of an SRD subclass (nameKey, as for every kind)
  class: 'paladin',                            // an SRD class id; never a homebrew one
  source: 'homebrew:ember-folk', checked: false,
  text: 'Paladins sworn to keep a hearth-fire burning.',
  spells: { 3: ['burning-hands', 'shield-of-faith'], 5: ['hb-ember-folk-ember-ward'] },   // always prepared, by class level
  features: [
    { id: 'hb-ember-folk-kindle', name: 'Kindle', level: 3, tier: 'auto', checked: false,
      text: 'Spend Channel Divinity to wreathe one foe in sparks: you have Advantage on attack rolls against it for 1 minute.',
      grants: { action: { time: 'bonus', cost: { resource: 'channel-divinity' }, duration: '1 minute',
        target: { creature: { range: [30, 30] } },
        effects: [{ modifier: { on: 'attack.roll', op: 'advantage', against: 'target' }, to: 'caster' }] } } },
    { id: 'hb-ember-folk-hearth-aura', name: 'Hearth Aura', level: 7, tier: 'auto', checked: false,
      text: 'You and allies in your aura have Resistance to Cold damage.',
      grants: { aura: { range: { byLevel: { 7: 10, 18: 30 } }, modifiers: [{ on: 'damage.taken', op: 'resist', types: ['cold'] }] } } },
    { id: 'hb-ember-folk-ash-memory', name: 'Ash Memory', level: 15, tier: 'manual', checked: false,
      text: 'Once per Long Rest you may ask the DM one question about what the fire saw.', uses: { max: 1, recharge: 'long' } },
  ],
}]
```

(The whole example is invented. Its `Kindle` sentence is an example of the shape, not a claim that the engine plays
that exact modifier from a feature's action: B1 tests it, see the survey.)

- **The features are the class vocabulary.** Each feature is what `lintFeature` already accepts for an SRD
  subclass: `id`, `name`, `level`, `tier`, `checked`, `text`, `uses`, `grants`, `options`, `pick`. Its amounts may
  name the parent class's table columns (`{ column: 'bardic-die' }`) and its costs the parent class's pools
  (`channel-divinity`, `bardic-inspiration`, `wild-shape`), because the subclass is linted *inside* its class: the
  linter runs `lintFeature(f, { ...CONTENT.classes[e.class], subclass: e }, ...)`, so `lintAmount`, `withRefs` and
  `byLevelAt` see the right table and the right features. The SRD class's own features are not linted again.
- **Every feature and option id carries the pack's prefix** (`hb-<pack>-…`) and is used once in the pack. The SRD
  never uses that prefix, so a homebrew feature can never take the id of a class feature (`channel-divinity`,
  `spellcasting`) whose uses or choices it would share, and the ids are found by `usesIn` (`content/packs.js`) when
  a creature's `uses` or a sheet's `choices` name them, so a pack in use is not removed.
- **`spells`** are lists of spell ids by class level, as in an SRD subclass: SRD spells or spells of the same pack
  (the cross-reference check of homebrew.md, Decision 2). Two checks are added: the class must have Spellcasting
  (`casting` not null; a non-caster class's subclass spells would be silently ignored by `derive`), and a spell at
  class level L must be no higher than the highest slot the class has at L. A spell a subclass names need not be on
  the class's list, as in the SRD.
- **Feature levels** are 3 to 20: in SRD 5.2 every class gains its subclass at level 3. The reading says when a
  level is not one at which the class's own table gives a subclass feature (the SRD subclass's levels), but the
  linter does not refuse it (question 1). An older-rules subclass whose features come below level 3 is entered with
  those features moved to 3 or later, by the DM's choice.
- **What is refused**, each with a plain sentence:
  - a `classes` key in a pack: "a homebrew class is not possible yet; a subclass of an SRD class is (`subclasses`)";
  - `class` that is not an SRD class id;
  - a feature or option key the vocabulary lacks, an unknown grant, an unknown hook, op or tag (strict mode, as for
    feats): such a feature is entered as `tier: 'manual'` with its `text` for the DM. It may keep a cost-only action
    (an action whose only steps are `manual`, which `lintFeature` already allows on a manual feature) so the engine
    still spends the Channel Divinity or Bardic Inspiration use while the DM applies the effect;
  - `feat: 'any'` on a feature (a feat slot from a subclass: no SRD subclass has one, and `featSlots` would change);
  - a `casting` field (a subclass that gives a non-caster class spell slots needs a spellcasting table the class
    entry does not have);
  - what homebrew feats already may not do: `freeCast.forms` (#414), `invest` and `forgoAttack` (#464);
  - a cost, `with`, `of` or `while` naming a feature that is neither the parent class's nor this subclass's.
- **Tiers stay honest by the existing rules.** `lintFeature` refuses `auto` that grants nothing and `manual` that
  grants something (but a cost-only action). The entry has no tier of its own; the reading counts its features by
  tier ("3 of 5 features are played by the engine").

**Reasons.** The same shape as an SRD subclass means the same linter, the same `derive` code and the same readings;
the entry cannot touch the class it belongs to.

**Cost.** A new kind in `HOMEBREW_ENTRY_KINDS`, `lintSubclass` (a thin wrapper over `lintFeature`), a strict key
shape, and a lookup in the registry (Decision 3).

### Decision 2: the gate, limits and what players are sent

- **The gate** is homebrew.md's, unchanged in order: `budget`, then `lintPack` strict, then the homebrew rules
  (`lintRules`: prefix, `source`, `checked: false`, a name that is not an SRD subclass's). The SRD reference that
  `registry.js` gives the linter (`SRD_IDS`) gains `subclasses`: the SRD subclasses by id and name, read from the
  twelve classes.
- **Strict key shapes** (`lintKeys`): `subclasses` has `id`, `name`, `class`, `source`, `checked`, `text`, `spells`,
  `features`, `dmNotes`; `feature` has `id`, `name`, `level`, `tier`, `checked`, `text`, `uses`, `grants`, `options`,
  `pick`, `dmNotes`; `option` has `id`, `name`, `text`, `tier`, `grants`, `requires`, `uses`, `feat`. The children
  (`grants` and below) are the shapes feats and items already use.
- **Limits.** A subclass is larger than a spell. The largest SRD subclass, measured as JSON, is under 4 KB (the
  Fiend Patron), with at most six features and two effect steps. Proposed (question 2): one subclass entry may be
  **16 KB** (the others stay at 8 KB); at most **12 features**, **8 options** a feature, **5 spells** a class level;
  the 40-step and depth limits as for every entry, counted over all its features. The pack's 256 KB and 200 entries
  are unchanged.
- **No functions, no prototype keys, plain text**: as every homebrew entry (homebrew.md, Decision 2).
- **What players are sent.** Subclasses join `PLAYER_PACK_KINDS` (`content/packs.js`): every approved member gets
  every subclass of the table's packs, with `dmNotes` stripped. The owner's rule is that only the DM's monsters stay
  secret; a subclass's features are a character's own, which its player needs to draw its sheet and actions. A
  subclass no character takes is sent too, as an unused spell is (question 4).
- **Readings in the pack manager** (`readEntry('subclasses', e)`, `content/reader.js`). The title ("Oath of the
  Ember, a Paladin subclass"), the always-prepared spells by class level with their names, then each feature in
  level order: its level, its tier in words, its uses and recharge, its cost, and the reading of its `grants` by the
  same sentence makers feats and items use (`GRANT_WORDS`), its options, and for a manual feature the author's text
  in quotes under "The DM does this". Then the tier counts, the numbers list, "Not checked against any rulebook", and
  a line for each feature level that is not one of the class's usual subclass levels. The pack manager lists
  subclasses as it lists feats, with their readings.

### Decision 3: the registry gets one more lookup, and `derive` asks for "the subclass of this class"

**Choice.** `content/index.js` gains `CONTENT.subclasses`, an object that is **empty for the SRD** (the SRD
subclasses stay inside their classes, so nothing the SRD prints, counts or tests changes), and
`HOMEBREW_LOOKUPS.subclasses = [[CONTENT.subclasses, same]]`, so `using` and `install` add a table's subclasses
the way they add its feats. `derive.js` gains one helper and uses it in the four places of the Problem:

```js
// The subclass a class of the sheet plays: the SRD one, a loaded homebrew one of that class, or none.
export function subclassOf(k) {
  if (k.subclass === undefined) return null;
  if (k.subclass === k.c.subclass.id) return k.c.subclass;
  const h = CONTENT.subclasses[k.subclass];
  return h && h.class === k.c.id ? h : null;
}
```

`classFeatures` takes the features of `subclassOf(k)` (and builds its relabel map from them, so a second class's
`channel-divinity` cost is renamed as today); the always-prepared spells come from `subclassOf(k)?.spells`; the
sheet's class name uses its name. Several classes work as one does: each `{ class, level, subclass }` of `classes`
may name a homebrew subclass, from the same pack or two.

### Decision 4: the sheet, a missing pack, `refresh` and `setSheet`

- **Naming it.** `subclass: 'hb-ember-folk-oath-of-the-ember'` on a one-class sheet, or in an entry of `classes`.
  The `SHEET_FIELDS` do not change, and the state shape does not change: no version bump.
- **`validate`** accepts, beside the SRD subclass, a loaded homebrew subclass whose `class` is this class. Its
  sentences change: "A level 5 Paladin has a subclass: choose Oath of Devotion or one of this table's (Oath of the
  Ember)"; "hb-… is a Druid subclass, not a Paladin one". A homebrew subclass of the wrong class is refused.
- **A subclass whose pack is not loaded** (an `hb-` id with no entry): the pack was deleted by the operator,
  switched off, dropped when the table file was read (`cleanPacks`), lost from a solo browser (DEBT T63), or the
  character came from another table. The DM's own remove is already refused while a sheet names the pack (`inUse`).
  Like a Shield whose entry is not loaded (`derive.js`, `gone`): **the character keeps the id, its features are
  absent, and the DM is told.**
  - `validate` does **not** refuse it (unlike an unloaded Shield id), because a level 3 sheet cannot be valid
    without a subclass and the DM's only way out would be to rewrite it. It accepts an `hb-` id that is not loaded
    as "a subclass this table does not have" (question 3).
  - `derive` builds the class without subclass features or subclass spells, names the class "Paladin (subclass not
    loaded)", and returns `missing: [{ kind: 'subclass', id, class }]` beside the record.
  - Every handler that makes a character from a sheet (`setSheet`, `refresh`, `levelUp` and the `resheet` of gear,
    rests and attunement, all through `remake` in `engine/sheets.js`) pushes, when `missing` is not empty, a
    DM-only event `{ type: 'manual', partial: true, actor, text: '<name>: its subclass "hb-…" is not loaded at this
    table, so its subclass features and spells are absent until its pack is added again.' }` (`partial`: for the DM
    alone, as `refresh` already does).
  - Until it is next made from its sheet, a character plays the record it was made with, as a creature made from a
    removed pack keeps its copy (homebrew.md, Decision 3). When the pack comes back, `refresh` brings the features
    back; spent uses of its features are kept by id (`remake`).
- **`refresh`** makes a character again from its stored sheet: with the pack loaded, the subclass's features
  (and any change an update of the pack made) come in; without it, they go and the DM is told. A character saved
  before a pack update keeps its old features until `refresh`, as every content change today (DEBT C19).
- **`setSheet`** (a new character or a changed one) accepts the homebrew subclass when its pack is loaded, and with
  it missing does as above.
- **Pack updates** may change a subclass's features (an update may not drop an entry, homebrew.md, B5). A feature
  an update removes leaves its count in `e.uses` until the next remake; a `choices` entry for a removed option is
  ignored by `classFeatures`, as today.

### Decision 5: the importer uses a matching homebrew subclass instead of the stand-in

In `importFgxml`, for each class at level 3 or more whose subclass name is not the SRD's: look among the loaded
homebrew subclasses of that class (`CONTENT.subclasses`, which in the DM's page holds the table's overlay, installed
by `packmanager.js`) for one whose name matches the sheet's (`nameKey`, and the same whole-word test `words()` the
SRD match uses, so "Oath of the Ember" matches "Ember").

- **Exactly one match:** `at.subclass` is its id; it is not a stand-in (not in `standIns`), so its always-prepared
  spells count as the character's in the spell step; the report lists it under `imported` as "matched the table's
  homebrew subclass Oath of the Ember (pack ember-folk)"; its features' names no longer appear under "Not in the SRD
  5.2 pack" (the feature-name loop includes the matched subclass's features).
- **None:** the stand-in, exactly as today.
- **Two or more** (two packs): the stand-in, with a note naming the candidates, so the DM edits the sheet.
- `options.homebrewSubclass === false` turns matching off (the test and a DM who wants the stand-in).

The DM sees the report before confirming, as today; nothing is added to the table by the importer. A portable
character file (portable-characters.md) names the subclass id in `needs.homebrew` like any homebrew piece, and **only the id**: carrying the
entry itself in a character's file is not built and is not part of any job here; it waits for the owner's word (#349;
question 6). `compat.js` is not built yet.

## Survey: what the owner's four subclasses need, and what says it

Described by kind only. "Today" is the vocabulary on main (18 November); "says it" means the linter accepts it and
the engine plays it as the rule reads. An addition is a small engine change, each with its own spec amendment and
test; none is part of this spec's jobs. The letters in the last column are the additions listed after the table.

| # | Kind of feature | Needed by | Today | Addition |
|---|---|---|---|---|
| 1 | Always-prepared spells by class level | the oath, the circle, the domain | **Says it**: `spells`, as the SRD subclasses. A spell that is not SRD must be in the pack as a homebrew spell. | none |
| 2 | Proficiency in skills of the player's choice, and Expertise | the domain, the college | **Says it** for "any skills" (`skills: { n, from: 'any' }`) and Expertise picks (`expertise: n`). **Does not** when the choice is from a short list. | A |
| 3 | Proficiency in an armour category, or martial weapons | the college | **Says it**: `proficiency`. **Does not** for one named weapon. | A |
| 4 | Languages | the domain | **Does not**: a sheet has no languages (DEBT C9). `manual`. | none planned |
| 5 | A Fighting Style chosen from a few | the college | **Says it**: `options` whose `feat` is an SRD Fighting Style feat. A style that is not an SRD feat would be a homebrew feat; `option.feat` naming a homebrew feat is not allowed today. | B |
| 6 | Extra Attack | the college | **Says it**: `extraAttack`. | none |
| 7 | A Channel Divinity option: creatures that fail a save get a condition | the oath | **Says it**: an action with `cost: { resource: 'channel-divinity' }`, a target or area, `save` and `condition` steps (as Turn Undead). | none |
| 8 | A Channel Divinity option: an edge against one chosen creature for a time | the oath | **Probably says it**: a modifier put on the holder that holds only against the target (`to: 'caster'`, `against: 'target'`, as Hunter's Mark) on a feature's action with a `duration`. Spells do this; a feature's action doing it is untested, so job B1 tests it before the reading claims it. | none, if the test passes |
| 9 | A Channel Divinity option: proficiency with a skill or tool for a time | the domain | **Does not**: a modifier can add the Proficiency Bonus (`{ prof: 1 }`), which is not the same for a skill already proficient. `manual` with the cost enforced. | C |
| 10 | A Channel Divinity option that tells the holder something (thoughts, the past) | the domain | Information is the DM's (homebrew.md, "Information"). `manual`, with a cost-only action so the use is spent. | none |
| 11 | An ability modifier added to cantrip damage | the domain | **Says it**: `modifiers` on `damage.dealt` with `when: ['spell.cantrip']` and `value: { mod }`, as the SRD's Potent Spellcasting. | none |
| 12 | A friendly aura: the holder and allies near it gain a modifier or an immunity, wider at a higher level | any oath (listed for completeness; the class's own auras already do this) | **Says it**: `aura` with `range: { byLevel }`, `modifiers`, `immune`. | none |
| 13 | A hostile aura: foes near the holder must save or suffer a condition, while a feature lasts | the oath | **Does not**: an `aura` gives only to the holder and its allies, and a feature's action cannot make a zone. | D |
| 14 | A once-per-rest Bonus Action that changes the holder for a time (a Fly Speed, with the aura of 13), with a spell slot to use it again | the oath | **Partly**: `time: 'bonus'`, `uses: { max: 1, recharge: 'long' }`, a Fly Speed by a modifier step for the action's `duration`. **Does not**: paying again with a spell slot (`orSlot` is for Pact Magic only), and the aura (13). | D, E |
| 15 | An attack rider: on a hit, spend a use for extra damage and one effect of a few (a push, a bonus to the holder's AC, damage to another creature nearby) | the college | **Partly**: an action with `after: 'hit'` (Hurl Through Hell), `cost: { resource: 'bardic-inspiration' }`, `modes`, a `damage` step of `{ column: 'bardic-die' }`, a `move` step for the push. **Does not**: a bonus whose value is the die just rolled; a second target beside the first; "a hit with a weapon" (`after: 'hit'` follows any attack roll). The extra damage is a separate roll, not added to the hit's, which the reading must say. | F, G |
| 16 | The same rider at a higher level without spending a use, with a fixed die | the college | **Does not**: a mode has no cost of its own. | G |
| 17 | More Speed when the holder takes the Attack action | the college | **Does not**: no trigger on taking an action. | H |
| 18 | A rider on an Opportunity Attack that hits: the target is slowed and the holder moves without provoking | the oath | **Does not**: no trigger after an Opportunity Attack's hit; `moveWith` gives movement only with another feature's action. | H |
| 19 | A Reaction attack when a creature the holder marked (item 8) attacks | the oath | **Does not**: `REACTION_TRIGGERS` are being hit, a cast and damage taken. | I |
| 20 | Wild Shape into forms of a higher Challenge Rating than the class feature allows, by level | the circle | **Does not**: the rating is the class feature's own `form.maxCr`; a subclass cannot raise it. | J |
| 21 | Wild Shape into another creature type for two uses | the circle | **Does not**: a second form action would spend its own uses, not Wild Shape's (`shapeShift` spends `e.uses[f.id]`, ignoring `cost`). | J |
| 22 | More Temporary Hit Points, or another Armor Class, while in a form | the circle | **Does not** for the same reason as 20; an Armor Class formula is already queued (homebrew.md, question 4). | J, and the AC formula |
| 23 | Healing in a form by spending a spell slot, as a Bonus Action | the circle | **Does not**: no action is paid for with a spell slot. | E |
| 24 | A spell cast at will without a slot | the circle | **Says it**: `freeCast` with `atWill`. | none |
| 25 | Attacks in a form count as magical | the circle | SRD 5.2 monsters have almost no such distinction; `manual` text (likely nothing to do). | none |

**The additions** (names are proposals; each is one amendment and one job, in `content/schema.js` and the module
named):

- **A. Choices from a short list.** `skills: { n, from: [skill ids] }`, `expertise` limited to listed skills, and
  `proficiency.weapons` naming weapon ids. `derive.js`, `validate`.
- **B. A Fighting Style option that is a homebrew feat** of the same pack. `schema.js` (lintPack cross-check),
  `derive.js`.
- **C. Proficiency for a time**: a modifier op `proficient` on `check` with a scope, which `rolls.js` reads as
  proficiency, not as an add. `modifiers.js`, `engine/rolls.js`.
- **D. A feature's action may carry a `zone`** (an Emanation that moves with the holder, steps on a foe that enters
  it or starts its turn there), exactly the spell `zone` that `zones.js` already plays, ended with the action's
  duration. `engine/features.js`, `zones.js`.
- **E. A spell slot as a cost**: `cost: { slot: minLevel }` on a feature's action (and `orSlot` for any caster),
  with an amount that may grow with the slot spent. `engine/features.js`.
- **F. "The die just rolled"**: a modifier value `{ rolled: true }` that takes the result of the step before
  (a damage die), and `after: 'weaponHit'`. `effects.js`, `engine/features.js`.
- **G. A second target near the first** (`target: { near: 5 }` on a mode), and a mode with its own cost or none.
  `engine/features.js`.
- **H. Triggers on what the holder does**: "on taking the Attack action" and "after an Opportunity Attack hits",
  with a move that provokes nothing. `engine/attacks.js`, `reactions.js`.
- **I. A Reaction trigger "a creature under my effect attacks"** for a feature's Reaction attack. `reactions.js`.
- **J. A grant that changes another feature's form**: `formOf: { of: 'wild-shape', maxCr?, types?, tempHp?, cost? }`
  (the `{ of: feature id }` pattern of `moveWith`, `persist` and `restore`), merged by `derive` into the named
  feature's `form`, the higher limit winning; and `shapeShift` spending from `cost.resource` when there is one.
  `derive.js`, `engine/features.js`.

What this means for the owner's four, before any addition: each loads and its spells, proficiencies, Extra Attack,
the save-and-condition Channel Divinity option, the cantrip bonus, a friendly aura and an at-will spell play; the
Channel Divinity edge (8) plays if B1's test passes; everything else is `manual` with the use still spent. J matters
most to the circle (its main feature), D, H and I to the oath, F and G to the college; the domain needs only C and A.

## Job split

Each job is one pull request with its own tests, and leaves the valley playing as it does. Test fixtures are
invented subclasses (the Oath of the Ember), never a published one.

**B1. The kind, the gate and the lookup.** `subclasses` in `HOMEBREW_ENTRY_KINDS`; `lintSubclass`; the strict
shapes, ranges and lengths; the 16 KB entry limit; the SRD subclass names in `SRD_IDS`; `CONTENT.subclasses` and
`HOMEBREW_LOOKUPS.subclasses`; `PLAYER_PACK_KINDS`. Files: `packages/rules/src/content/schema.js`,
`content/index.js`, `content/registry.js`, `content/packs.js`, `packages/rules/test/homebrew-subclass.test.js` (new).
Tests: the example loads; each refusal of Decision 1 has a sentence (a `classes` key, a homebrew class id, an
unprefixed feature id, `feat: 'any'`, `casting`, a cost naming another class's pool, a spell too high for the class
level, spells on a Fighter subclass, a name equal to an SRD subclass's, an unknown grant); the limits at and past
their values; a player's pack copy has the subclasses and no `dmNotes`; `npm run content` unchanged; and survey item
8 (a feature's `to: 'caster'` modifier with `against: 'target'`) played in a test game.

**B2. `derive` and the sheet.** `subclassOf`, the four uses, `validate`'s sentences, `missing`, the DM-only event
in `remake`. Files: `packages/rules/src/derive.js`, `engine/sheets.js`, `engine/characters.js` (only if `setSheet`
needs the event apart from `remake`), `packages/rules/test/homebrew-subclass-derive.test.js` (new). Tests: a level 7
paladin with the example has its features and spells, inside `using`; a paladin 6 / bard 8 with a homebrew subclass
on each class; the wrong class refused; the overlay removed: `refresh` keeps the id, drops the features and tells the
DM only; the overlay back: `refresh` restores them and spent uses are kept; an SRD-only game unchanged.

**B3. The reading.** `readEntry('subclasses')` and its golden text. Files: `packages/rules/src/content/reader.js`,
`packages/rules/test/reader-subclass.test.js` (new).

**B4. The importer.** Decision 5. Files: `packages/rules/src/import-fgxml.js`, `docs/import-characters.md`,
`packages/rules/test/import-fgxml.test.js`. Tests: a made-up export naming "Ember" loads with the homebrew subclass
inside `using`, with no stand-in; without the pack, the stand-in as today; two matches give the stand-in and a note.

**B5. Client.** The build sheet's Subclass list shows the SRD subclass and the loaded homebrew ones of the class
(names escaped); the sheet header shows "subclass not loaded"; the pack manager lists subclasses with readings.
Files: `packages/client/buildsheet.js`, `packages/client/packmanager.js`, the sheet view, a smoke pass. Checked at
1280 x 800 and 390 x 844.

**The additions A to J** are separate engine jobs after B1 and B2, each with its amendment to this spec; the owner
orders them (question 7). B1 comes first; B2 and B3 can run in parallel after it; B4 after B2; B5 after B1 and B3.

**DEBT.** T78 points here; B4 strikes the "non-SRD subclass can only load as the SRD stand-in" part of C9; each job adds a line
for what it leaves.

## Questions for the owner

Each has the default the jobs above are written to.

1. **Feature levels.** Default: any level from 3 to 20, with the reading flagging a level that is not one of the
   class's usual subclass levels. The alternative is to refuse such a level, which forces older-rules subclasses to
   be moved onto 5.2's levels.
2. **Size.** Default: a subclass entry up to 16 KB, 12 features, 8 options a feature, 5 spells a class level; other
   entries stay at 8 KB.
3. **A sheet whose subclass pack is missing.** Default: it loads, the features are absent, the DM is told (Decision
   4), for a new character as for an old one. The alternative is to refuse `setSheet` for a new character and accept
   it only when remaking one.
4. **Players are sent every subclass of the table's packs.** Default: yes, as spells. The alternative is to send only
   the subclasses a party character has, which hides the DM's unused ones but adds a per-player filter.
5. **The importer picks a matching homebrew subclass by itself.** Default: yes when exactly one matches, shown in the
   report before the DM confirms. The alternative is to list it as a suggestion the DM ticks.
6. **A character file carrying its homebrew subclass** (`homebrew.bundle`, portable-characters.md). Default: **not
   built**: the character file names the subclass id only; carrying the entry waits for the owner's word (#349). No
   job in this spec builds it.
7. **The order of the additions.** Default: J (Wild Shape forms, the circle's core), then D and E (the oath's
   transformation and hostile aura), then F and G (the college's rider), then H, I, C, A, B.
8. **Spellcasting from a subclass** (a third-caster subclass of a non-caster class). Default: refused for now; none
   of the owner's characters needs it.

## Build notes: B1, the kind, the gate and the lookup (#497)

Built to the decisions above, the owner's questions on their defaults. What was settled in building, and what differs from
the sketch:

- **Where.** `content/schema.js`: `subclasses` last in `HOMEBREW_ENTRY_KINDS`; `lintSubclass` (a wrapper over `lintFeature`,
  linted inside `{ ...class, subclass: entry }`); the key lists (`subclasses`, `feature`, `option`, `featureUses`,
  `requires`, `spellMap`), their types, ranges (`features.level` 3 to 20 and a few more) and lengths (12 features, 8 options
  a feature, 5 spells a class level: `HOMEBREW_LENGTHS`); `HOMEBREW_LIMITS.subclassBytes` (16 KB; every other kind stays at
  8 KB: `budget` and `budgetEntry` take the limit by kind). `content/index.js`: `CONTENT.subclasses` (empty for the SRD) and
  `HOMEBREW_LOOKUPS.subclasses`. `content/registry.js`: the SRD reference gains `subclasses` (read from the twelve classes)
  and `classTable`. `content/packs.js`: `PLAYER_PACK_KINDS` gains `subclasses`, so a player's copy of any pack now has a
  `subclasses` list (empty when there are none).
- **The class table is `classTable`, not `classes`, in the registry's reference.** A key `classes` there would also change what
  a homebrew feat's freeCast cost may name (the gap DEBT T56 and `reader-items.test.js` pin). `lintEntry` given `srd: CONTENT`
  reads `classes`. The SRD subclass names are read from the classes in either case, so the name rule never depends on
  `CONTENT.subclasses`, which holds the table's homebrew while it is installed.
- **Refusal sentences.** A `classes` key: "a homebrew class is not possible yet; a subclass of an SRD class is (`subclasses`)"
  (`packKeyProblem`, in the linter and the registry). `feat` on a feature and `casting` on a subclass are refused by the key
  lists with a reason after "is not something ... has" (`NOT_HERE`). The prefix rule for feature and option ids and the name
  rule are in `lintRules`; "used once in the pack" is across all the pack's subclasses.
- **Spells** are 3 to 20 by class level (the spec said "by class level"; a level 1 or 2 key is a plain refusal, like a feature
  below level 3). A spell id is an SRD spell or one of the pack's, never another pack's; its level is compared with the
  highest slot the class has at that class level (Pact Magic by `slotLevel`).
- **Options that are feats.** Allowed only for an SRD Fighting Style feat (survey item 5), with its id, name and tier: so
  that option keeps the feat's id and is exempt from the prefix rule. A feat of the pack stays refused (addition B).
- **Amounts in a subclass's steps.** A subclass's `damage`, `heal` and `tempHp` steps may be a class amount, a save's `dc` and
  a heal's `addMod` an ability, and a modifier value may reach 100 (the SRD's Draconic Sorcerer's Fly Speed 60). All the SRD
  subclasses, made homebrew, pass but one: a test holds them to it. The exception is the warlock's, whose Fiendish
  Resilience has 12 options against the limit of 8 (DEBT T81 says what to set).
- **Survey item 8 is true.** A feature's action with `to: 'caster'` and `against: 'target'` gives Advantage on attack rolls
  against the chosen creature only, spends the parent class's Channel Divinity use and a Bonus Action, and puts a lasting
  effect on the holder bound to the target (the test plays it in a game; the record is made as `derive` makes it, as `derive`
  does not read a homebrew subclass until B2). The reading may say it.
- **Nothing else changes.** No state shape change, no version bump; `npm run content` is byte for byte what it was.
