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
| 14 | A once-per-rest Bonus Action that changes the holder for a time (a Fly Speed, with the aura of 13), with a spell slot to use it again | the oath | **Partly**: `time: 'bonus'`, `uses: { max: 1, recharge: 'long' }`, a Fly Speed by a modifier step for the action's `duration`. **Now also** (E): paying again with a spell slot (`orSlot` for any caster). **Does not**: the aura (13). | D, E |
| 15 | An attack rider: on a hit, spend a use for extra damage and one effect of a few (a push, a bonus to the holder's AC, damage to another creature nearby) | the college | **Partly**: an action with `after: 'hit'` (Hurl Through Hell), `cost: { resource: 'bardic-inspiration' }`, `modes`, a `damage` step of `{ column: 'bardic-die' }`, a `move` step for the push. **Now also** (F): a bonus whose value is the die just rolled, and "a hit with a weapon" (`after: 'weaponHit'`). **Now also** (G): a second creature within so many feet of the first takes the damage too (`target: { near }`), the roll shared. The extra damage is a separate roll, not added to the hit's, which the reading must say. | F, G |
| 16 | The same rider at a higher level without spending a use, with a fixed die | the college | **Says it** (G): a mode with `free: true` costs nothing, or has a `cost` of its own, in place of the action's. | G |
| 17 | More Speed when the holder takes the Attack action | the college | **Says it** (H): `triggers.attackAction` with a Speed modifier until the end of the turn. | H |
| 18 | After an Opportunity Attack that hits, the holder moves without provoking | the oath | **Says it** (H): `triggers.opportunityHit: { move: 'half' }`, spent afterwards with a `move` of its own (the engine finishes the mover's move first). The earlier row also said "the target is slowed"; the owner's sheets use the older text, which has the move only, so that part is not built. | H |
| 19 | A Reaction attack when a creature the holder marked (item 8) attacks | the oath | **Does not**: `REACTION_TRIGGERS` are being hit, a cast and damage taken. | I |
| 20 | Wild Shape into forms of a higher Challenge Rating than the class feature allows, by level | the circle | **Does not**: the rating is the class feature's own `form.maxCr`; a subclass cannot raise it. | J |
| 21 | Wild Shape into another creature type for two uses | the circle | **Does not**: a second form action would spend its own uses, not Wild Shape's (`shapeShift` spends `e.uses[f.id]`, ignoring `cost`). | J |
| 22 | More Temporary Hit Points, or another Armor Class, while in a form | the circle | **Does not** for the same reason as 20; an Armor Class formula is already queued (homebrew.md, question 4). | J, and the AC formula |
| 23 | Healing in a form by spending a spell slot, as a Bonus Action | the circle | **Partly** (E): `cost: { slot: 1, higher: { heal: '1d8' } }` on a Bonus Action that heals the holder. **Not** the "in a form" condition (the DM's). | E |
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
- **D. A feature's action may carry a `zone`** (built, #518; see "Build notes: D"): an Emanation that moves with the holder, steps on a foe that enters
  it or starts or ends its turn there, exactly the spell `zone` that `zones.js` already plays, ended with the action's
  duration, by the holder, and by the holder's death or falling Unconscious. `content/schema.js`, `content/reader.js`,
  `engine/features.js`, `zones.js`.
- **E. A spell slot as a cost** (built, #520; see "Build notes: E"): `cost: { slot: minLevel }` on a feature's action (and `orSlot` for any caster),
  with an amount that may grow with the slot spent. `content/schema.js`, `content/reader.js`, `engine/features.js`.
- **F. "The die just rolled"** (built, #523; see "Build notes: F"): a modifier value `{ rolled: true }` that takes the result of the step before
  (a damage die), and `after: 'weaponHit'`. `effects.js`, `engine/features.js` (and `engine/resolve.js`, one line, to record a weapon hit).
- **G. A second target near the first** (built, #530; see "Build notes: G"): `target: { near: 5 }` on an action or on a mode, and a mode with its own cost or none
  (`cost: { resource, n? }`, `free: true`). `content/schema.js`, `content/reader.js`, `engine/features.js`.
- **H. Triggers on what the holder does** (built, #534; see "Build notes: H"): "on taking the Attack action" and "after an Opportunity Attack hits",
  with a move that provokes nothing: `grants.triggers: { attackAction?, opportunityHit? }`. `content/schema.js`, `content/reader.js`, `derive.js`, `engine/attacks.js`, `engine/movement.js`,
  `reactions.js`.
- **I. A Reaction trigger "a creature under my effect attacks"** for a feature's Reaction attack. `reactions.js`.
- **J. A grant that changes another feature's form** (built, #516 and #525; see "Build notes: J" and "Build notes: J2"): `formOf: { of: 'wild-shape', maxCr?, types?, tempHp?, cost? }`
  (the `{ of: feature id }` pattern of `moveWith`, `persist` and `restore`), merged by `derive` into the named
  feature's `form`, the higher limit winning; and `shapeShift` spending from `cost.resource` when there is one.
  `derive.js`, `engine/features.js`. Settled shape: `maxCr` is a Challenge Rating or `{ byLevel }` of them (the class's own `form.maxCr` is
  the same), `types` are creature types the feature does not already take, `tempHp` is a number or an amount of the class and is **added**
  to the form's own, `cost` is `{ resource, n? }` and prices the forms of the types the grant adds (every form, when the grant lists no `types`).

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
  `requires`, `spellMap`), their types, ranges (`features.level` 3 to 20 and a few more) and lengths (12 features, 13 options
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
  a heal's `addMod` an ability, and a modifier on a speed may reach 120 (the SRD's Draconic Sorcerer's Fly Speed 60; a modifier
  on any other hook is held to 40, as a feat's is). All the SRD subclasses, made homebrew, pass: a test holds them to it. The
  options limit is 13, not the sketch's 8 (question 2), because the Fiend's Fiendish Resilience has 12 (one for each damage type).
- **Survey item 8 is true.** A feature's action with `to: 'caster'` and `against: 'target'` gives Advantage on attack rolls
  against the chosen creature only, spends the parent class's Channel Divinity use and a Bonus Action, and puts a lasting
  effect on the holder bound to the target (the test plays it in a game; the record is made as `derive` makes it, as `derive`
  does not read a homebrew subclass until B2). The reading may say it.
- **Nothing else changes.** No state shape change, no version bump; `npm run content` is byte for byte what it was.

**Fix round 1 (the review of #503).**

- **What a player is sent.** A player's copy has `subclasses` only when the pack has any, so every existing pack's player copy
  and hash are what they were (the DM's hash never changed). The client's pack manager (`packmanager.js`) knows the kind: a
  player's data is rebuilt with it before its hash is checked, it is listed as entries "not read" until the reading (B3), and a
  client test feeds the rules' own `forPlayers` output, with and without a subclass, to the store. Before this the client
  refused every player's pack data on a hash mismatch.
- **The work estimate.** `workOf` has a `subclasses` branch: each action of each feature and option, and each mode, counts as a
  creature's action does (steps over every branch and creature, dice over every repeat), and is refused with the same sentence.
- **A feature may not claim `checked: true`** (its `checked` must be false, as the entry's). A feature or option id is used once in
  the whole pack: not any entry's id (a spell, a feat, an item, a subclass, the subclass itself) and not another feature's. The
  `dmNotes` of a subclass or a feature are at most 500 letters (homebrew.md, Decision 5). A refusal is a plain sentence for a
  non-text id, a feature without an id, a `spells` key that is not a class level, and a grant `action` that is not an object.

## Build notes: B2, `derive` and the sheet (#504)

Built to Decisions 3 and 4, the owner's questions on their defaults. What was settled in building, and what differs from the sketch:

- **Where.** `derive.js`: `subclassOf(k)` (as sketched, and an object's own keys such as `constructor` are no subclass); `missingOf(sheet)`, which `derive` returns
  as `missing` (always an array, empty for a sheet with nothing missing); the four uses (`classFeatures` for the features and the relabel map, the always-prepared
  spells, the class name) and `validate`. `engine/sheets.js`: `tellMissing`, called at the end of `remake`, and a small addition to `carryPlay`. `engine/characters.js`:
  `setSheet` for a new character, which does not pass through `remake`, calls `tellMissing` itself. `resheet` (gear, rests, attunement), `refreshOne` and
  `levelUp` all reach `remake`, so they needed no change.
- **What is "missing".** A class of level 3 or more whose sheet names a subclass that is neither the SRD's nor loaded, and whose id starts `hb-`. Any other
  unknown id is still refused by `validate`. A loaded subclass of another class is not "missing": `validate` refuses it ("hb-… is a Bard subclass, not a Paladin
  one", beside the "choose …" sentence), and `derive` plays the class without a subclass.
- **Sentences.** With no homebrew subclass of the class loaded, `validate` says what it said before, word for word. With one: "A level 5 Paladin has a subclass:
  choose Oath of Devotion or one of this table's (Oath of the Ember)." and, for an unknown id, "The Paladin subclass in the SRD is Oath of Devotion (devotion).
  This table also has Oath of the Ember (hb-…)."
- **The relabel map** (a second class's `channel-divinity` cost renamed `cleric-channel-divinity`) still includes every feature of the class's SRD subclass, chosen
  or not, as before (an SRD-only game is unchanged), and now the chosen homebrew subclass's features.
- **The class name** is "Paladin (Oath of the Ember)", "Paladin (subclass not loaded)", and for several classes the class names alone when the long form is over 40
  letters, as for SRD subclasses (the two-class example is 52 letters long).
- **The event** is `{ type: 'manual', actor, name, partial: true, text }` per missing subclass, as the spec wrote it, and a player's view of events drops it.
- **Spent uses (differs from the sketch; reworked after the review of #505).** The sketch says spent uses of the subclass's features are "kept by id (`remake`)"
  when the pack returns. As `remake` stood, a `refresh` run while the pack was away would lose the count, as the feature is then not on the record. So the creature
  gets an optional field `usesAway: { <subclass id>: { <feature id>: spent } }` (no version bump), written by `carryPlay` (`keepAway`, sheets.js) only while that
  subclass is missing: the spent count of each `hb-` feature the old record had and the new one lacks goes to the missing subclass whose id shares the longest pack
  prefix with the feature's id. When the subclass is loaded again and still the sheet's, the features of that same subclass come back with `max - spent` (not below
  0), from the new maximum, and the entry is deleted; an entry for a subclass the sheet no longer names is dropped, and a feature of another subclass is never
  touched, whatever its id. A Long Rest (`rests.js`) deletes `usesAway`: the uses would have recharged. A Short Rest does not (DEBT T82).
- **The shape of a subclass id.** `validate` refuses a subclass id that begins `hb-` and is not `hb-<pack>-<name>` (lower case letters, digits, single dashes), with
  a sentence that does not repeat the text; only an id of that shape is "a subclass this table does not have". Below class level 3 a well-formed unloaded id is
  accepted and nothing is told to the DM until level 3 (no subclass features exist before it).
- **A pack update may not move a subclass to another class.** `vetUpdate` (`content/packs.js`) refuses it: "Version 2 of "ember-folk" moves the subclass "..." from
  the paladin class to the cleric class. ...". Two files beyond the issue's list were touched for the review round: `content/packs.js` for this, and
  `engine/rests.js` (one line) for the Long Rest.
- **Tests** (`homebrew-subclass-derive.test.js`): the example at level 7 inside `using`; a Paladin 6 / Bard 8 with a subclass from each of two packs, and the
  subclasses swapped; a Cleric taken after a Paladin; waiting counts (a pack whose id begins with the first's, a maximum that grew while away, a Long Rest, two subclasses away at once); the gate's refusal of a moved subclass; the shape of an id; the validate sentences with and without the overlay; `setSheet` with the wrong class (nothing changes), the
  right one, and a missing pack; `refresh` with the overlay removed, all characters refreshed, and the overlay back; `levelUp`; an SRD-only sheet and game unchanged.
  No existing test was changed.

## Build notes: B3, the reading (#508)

Built to Decision 2's last bullet. What was settled in building, and what differs from the sketch:

- **Where.** `content/reader.js`: `readEntry('subclass' | 'subclasses', e)`, a `SubclassReading` that extends the feat and item reading (`GrantReading`), so a
  feature's `grants` are said by the same sentence makers (`GRANT_WORDS`). `READ_KINDS`, `KIND_NAMES` and the strict-mode names know the kind. The
  exports `SUBCLASS_FIELDS`, `SUBCLASS_FEATURE_FIELDS`, `SUBCLASS_OPTION_FIELDS`, `SUBCLASS_USES_FIELDS`, `SUBCLASS_REQUIRES_FIELDS`,
  `SUBCLASS_TIER_WORDS` and `SUBCLASS_RECHARGE_WORDS` are held by a test to the linter's own key lists. Test: `test/reader-subclass.test.js`, golden
  text `test/reader-subclass-golden.txt` (three invented subclasses: a paladin oath, a bard college, a fighter archetype).
- **The order of the reading.** The title ("Oath of the Ember", a Paladin subclass), the spells by class level with their names, then each feature in
  level order (a heading with its level and its tier in words, its uses and recharge, its cost and `grants`, its options, and for an assist or a manual
  feature the author's text in quotes: "the DM does this"), then the tier count, "Not checked against any rulebook", and a line for each feature
  level that is not one of the class's own subclass levels (question 1: said, not refused). `dmNotes` is not read.
- **No tier for the entry.** The reading's `tier` is `null`, as for a weapon. The count is "N of M features are played entirely by the engine (a auto,
  b assist, c manual)": *entirely* is an auto feature that hands nothing to the DM. An auto feature that does (a manual step, a prerequisite the engine
  does not check) says "auto, but the engine hands the parts listed for the DM to the DM" in its heading.
- **A feature's steps are read with its class behind them.** An SRD subclass's steps use amounts `derive.js` puts in from the class (`bakeAt`): a save
  `dc` that is an ability, a `damage`, `heal` or `tempHp` that is `{ column }`, `{ mod, min, die }` or `{ byLevel }`, an `addMod` that is an ability,
  `addLevel`. The feat and item readings flag these as not dice and not a whole number; for a subclass the reading says them in words (a `sub` flag on
  the reading, so no other kind's reading changes). The sentences for `grants.spells`, `cantrips`, `spellLists` and `attune` said "a feat or an item
  belongs to no class, so the engine adds nothing"; for a subclass's feature, which belongs to a class, they say what the engine does. A feature's
  `freeCast` says "through this feature". `stepsUnder` indents by the base the caller has (it was reset to its own depth; the same for every kind that
  had no base).
- **Found in the engine and said, not changed.** A feature with `uses` and no action of its own is used by `feature`: it spends one use and sends its
  text to the DM (the reading says so; a test plays it). An option's `requires` is checked by `validate` only for a feature whose player picks a list
  (`pick`), never for a single choice; the reading says which, and hands the single-choice check to the DM (DEBT T83). `uses.short` counts only where the
  rest that brings the uses back is a Long Rest (`derive.js`); where it is `short` the reading says the number is not used. A test plays a Short Rest and
  a Long Rest for each reading of `recharge`.
- **What is read from the SRD.** A test reads each of the twelve SRD subclasses, made homebrew as B1's test makes them: no problem, each feature once, the
  tiers add up, every manual feature's words are the DM's, and no level is flagged (they are the class's own).
- **The pack manager** (`packmanager.js`, not changed) asks the reader's own `READ_KINDS`, so a pack's subclasses are now listed with readings and tiers
  by feature, not as "not read". The build sheet, the sheet header and a smoke pass stay B5's.
- **Proved against B2 (#504).** The sentences "a character names it as the subclass of its levels" and "the engine makes these a feature of the character"
  describe `derive`. A test reads the Oath of the Ember and derives a level 7 paladin that names it, inside `using`: the features the reading lists at levels 3
  and 7 are the character's, the level 9 and 15 ones are not yet, and the spells the reading lists at class level 3 are prepared.

## Build notes: B4, the importer (#509)

Built to Decision 5. What was settled in building:

- **Where.** `import-fgxml.js` only (plus this spec, `docs/import-characters.md`, `docs/DEBT.md` and the tests). Matching is for a class at level 3 or more whose
  sheet name is not the SRD's; `nameKey` equality, or the `words()` test either way round ("Ember" in "Oath of the Ember"). One match sets `at.subclass`, is not in
  `standIns`, and goes to `report.imported.homebrewSubclasses` (`{ class, id, name, pack, sheet, text }`, the pack from the entry's `source`); the key is absent
  when nothing matched. Several: the stand-in and a `subclass` note naming them. `options.homebrewSubclass === false` turns it off. The feature-name loop needed no
  change: it reads `featuresOf`, which reads the subclass through B2's `subclassOf`.
- **A spell of the oath.** The importer's spell-name map is made from the SRD at load, so a homebrew spell was reported "not in the SRD 5.2 pack", even the oath's
  own (Ember Ward). The importer now also knows a spell the matched subclass always prepares, found in the loaded content; any other homebrew spell on a sheet is
  still reported as before (DEBT T84).
- **Tests** (`import-fgxml.test.js`, fixture `fgxml-paladin-ember.xml`, invented): one match inside `using` (loadable, no stand-in, spells and feature, `setSheet`
  takes it); no pack, or a pack with no match, gives the stand-in; two packs give the stand-in and the note; the option off; a subclass of another class and the SRD
  name. No existing test was changed.
- **Not done:** the client's import report does not show the new `imported` key (T84).

## Build notes: B5, the client (#512)

Built to the job split's B5. The client computes no rule: every sentence below is read from content (`CONTENT.subclasses`, which holds the table's own while the
page's overlay is installed) or from the engine's own `missingOf` (B2), and the engine checks every sheet again. What was settled in building:

- **The build sheet's Subclass list** (`buildsheet.js`, `subclassChoices`): the choose line, the SRD subclass, then each loaded homebrew subclass of the sheet's class by
  name, labelled "(homebrew)"; a subclass of another class is not listed. A sheet that names a subclass the list does not hold (its pack is not loaded here, or it is not this
  class's) keeps its id as an entry, "hb-... (not loaded at this table)", so editing the character does not drop it unseen; `validate` still says what may be saved
  (an unloaded `hb-` id is accepted, B2). A line under the list (`subclassNote`) says where a loaded subclass is from ("from the pack ember-folk", then the pack's own
  `text`) or that an unloaded one is kept and plays without its features. Names are put on the page as text, never as HTML (a pack name cannot hold `<` anyway: B1's rule).
  The field is full width, so a long name is not cut on a phone.
- **The sheet header** (`classTitle`, used by the character card in `actionpanel.js` and the sheet in `app.js`): where the record says "subclass not loaded" it is shown as
  it is; where the record was made with the pack and the page no longer has it (a player's page that lost the pack, a solo browser that lost it: DEBT T63), `missingOf(e.sheet)`
  says so and the header reads "Paladin (subclass not loaded)". It needs the sheet, which the page has for a built party character (the DM and the party's players);
  a character without a sheet shows its record's own class line. The DM's sheet also has a note (`missingText`, `#sheet-subclass-missing`) with the id and what to do;
  it is not sent to players (the engine's event is DM-only, and the note is made only in `isDM()` pages). When the pack is back and the record is not remade, the DM's
  note says to Refresh from sheet.
- **The pack manager** (`packmanager.js`): B3's reader reads the kind, so the manager already listed a pack's subclasses with readings and no "not read" line; this job adds
  one line under each subclass's name, from its own data (`subclassBrief`: "Paladin subclass · 2 features: 1 auto, 1 manual"; the tiers the author declared, not what the
  engine plays, which the reading says), the DM's intro says players are sent subclasses, and a small CSS rule (`packmanager.css`) puts the line on its own row. A subclass has
  no tier of its own (B3), so there is no tier line for the kind and no pill.
- **The import report** (`importfg.js`): the summary lists the importer's own sentence for each `imported.homebrewSubclasses` entry ("Paladin: the sheet's "Ember" matched
  the table's homebrew subclass Oath of the Ember (pack ember-folk)."), the "Mapped" line names it, the summary gives the subclass's name instead of its `hb-` id, and the
  saved text and the chronicle entry hold the same lines (DEBT T84 (1)).
- **Tests.** `packages/client/test/buildsheet.test.js` (the list with and without the overlay, an unloaded id kept, the header and the DM's note, and a game played through
  the engine's own `setSheet` and `refresh` with the pack away), `importfg.test.js` (new: the real importer with an invented pack), `packmanager.test.js` (the reading, the line).
  The smoke pass `homebrew` has a scenario, run twice (DM at 1280x800 with a phone player, DM on a 390x844 touch phone with a desktop player): the character made before the
  pack, both headers, the DM's note and the player not seeing it, the manager's review and list, Refresh, the build sheet's list (Edit and Build from class), the import report,
  and the player's page losing and regaining the pack. Fixtures are invented (the Oath of the Ember, the College of Embers, `fgxml-paladin-ember.xml`).
- **Files beyond the issue's list.** `packages/client/app.js` and `actionpanel.js` (the sheet view: the header), `packages/client/packmanager.css` (one rule), and
  `docs/DEBT.md` as listed. No other file; the CI matrix is unchanged (the scenario is in an existing pass).
- **Left** (DEBT T85): the header reads as the record does once the pack is back until Refresh (only the DM's note says so), a character with several classes cannot be opened in the
  build screen, and the manager's line counts the author's tiers.

## Build notes: J, `formOf` (#516)

Built to addition J, the owner's questions on their defaults. What was settled in building, and what differs from the sketch:

- **Where.** `content/schema.js`: `formOf` in `GRANTS`; `formOfProblem` (the shape, exported with `FORM_OF_KEYS`), `lintSubclass` (the named feature, the types, one price), the strict
  shapes (`formOf`, `formCost`), `HOMEBREW_RANGES` (`formOf.maxCr`, a Challenge Rating in eighths; `formOf.tempHp`) and one rule for a Challenge Rating inside `byLevel`.
  `content/reader.js`: `GRANT_WORDS.formOf`. `derive.js`: the merge, after every feature is made. `engine/features.js`: `shapeShift` spends the price. State shape: no change, no
  version bump; a record's Wild Shape gains `action.form.cost` only when a circle prices it.
- **The shape.** `formOf: { of, maxCr?, types?, tempHp?, cost? }`; `of` and at least one more key. A key the vocabulary lacks (`fly`, `hours`) is refused with the strict sentence
  "is not something a form grant has".
- **Where the level-dependent values live: in the grant, and by the class's level, as the class's own `form` does.** The class's `form.maxCr`, `fly`, `hours` and `tempHp` are
  numbers or amounts (`{ byLevel }`, `{ perLevel }`) that `derive` puts in at the level of the class the feature is of. `formOf.maxCr` is a number or `{ byLevel: { 3: 1, 6: 2 } }`
  and `formOf.tempHp` an amount, put in the same way, at the level of the class of the feature that holds the grant (the druid's level in a multiclass character, not the
  character's). A `byLevel` with no entry reached yet gives nothing. The grant exists from its feature's own level (3 or more), so a type "from level 5" is a feature at level 5.
- **The merge.** `maxCr`: the higher of the circle's and the class's stands (a circle that gives less changes nothing). `types`: added to the feature's list. `tempHp`: **added** to the
  form's own (the survey says "more Temporary Hit Points"; the issue's "the higher limit winning" is about the rating). Two grants of one feature combine in the order of the
  features: the highest rating, all the types, the sum of the Temporary Hit Points. `fly` and `hours` are the class's and are not changed.
- **The price.** `cost: { resource, n? }`, one price a subclass for a feature (a second is refused). `shapeShift` spends `n` uses (1 if left out) of `e.uses[resource]` instead of one use of
  the feature, for a form of a type the grant adds; with no `types` in the grant, for every form. A type the class already takes is the class's price (so "another creature type for
  two uses" leaves the beasts at one). The pool is a feature of the class or the subclass that has uses (the gate's existing cost rule, so `channel-divinity` of another class is
  refused); naming `wild-shape` itself with `n: 2` is allowed. When the pool has too few: "Ven has 1 use of Wild Shape left; the form of an Azer Sentinel costs 2.", and nothing
  changes; all is checked before anything is paid, so a refused form leaves the Bonus Action too. The sentence for the feature's own single use is the one it was.
- **The gate.** Strict and closed: `of` must name a feature of the class or of the subclass whose action takes a form ("neither a feature of the Druid nor of this subclass" for a
  paladin's circle or a misspelt id; "which does not take a form" for another druid feature); `types` lists creature types, each once, none the feature already takes; `maxCr` is 0 to
  30 in eighths; `tempHp` is a number or an amount of the class, never dice; the cost's resource has uses, comes in at a level no later than the feature that gives the price (else a character would have a price for a pool it lacks), and holds at least `n` uses where its maximum is a plain number; one price; every number of `tempHp` is at least 1. A **feat or an item** that holds the key is refused (`Only a
  subclass's feature can change the form of a class feature`), and `derive` ignores it all the same (only a feature of the same class changes a form).
- **The reading.** "Changes the form of the feature "wild-shape": it lets its forms be of a Challenge Rating that grows with the class level (1 from level 3, 2 from level 6), where
  that is higher than they already may be, adds elemental creatures to the forms it may take and gives ... more Temporary Hit Points on taking a form." and a line for the price. The golden
  file `reader-subclass-golden.txt` is unchanged: none of its three invented subclasses holds the grant (adding one needs a change in `reader-subclass.test.js`); the reading is held by
  `homebrew-subclass-formof.test.js`.
- **What players are sent: no change.** The circle is sent as any subclass is (B1). A character's own record, which its party sees, holds the merged `form` (and `cost`, where there is one);
  an enemy in a form shows what it did (the form's name and template only), a `form` event is what it was; a test compares both with and without a circle.
- **Tests** (`homebrew-subclass-formof.test.js`): the invented Circle of the Ember (rating by level 3, 6 and 10, an elemental type, Temporary Hit Points by level), a circle whose rating
  is below the class's, a price in the circle's own pool, a price of two uses of Wild Shape, a price on every form; the gate's refusals; derive in a druid 4 / fighter 3; the forms played
  (accepted, past the rating, the wrong type, a Fly Speed, nothing changed on refusal, in a fight); the overlay removed (`refresh`: the class's own forms) and back; an SRD-only game
  unchanged; what a player is sent.
- **A file beyond the issue's list.** `packages/rules/test/reader-items.test.js`: one line in `SAMPLES` (a sample of `formOf`), because that test holds the sample keys equal to `GRANTS`, as it did for #464. The owner's coordinator approved it. `tempHp` being *added* to the form's own, not the higher of the two, was confirmed in the same review.
- **Not built (DEBT T86).** The client's form list and its note read `action.form` as the merged record gives it (types, rating, Temporary Hit Points) and say "N of M uses left" for
  Wild Shape's own pool, which is not the pool a priced form spends; the engine refuses a form with too few uses and says why, but the screen does not yet show the price.

## Build notes: J2, a rating for the added types alone, named forms, and "while in a form" (#525)

Built to addition J, on the issue's three asks. The meaning of every key #516 built is unchanged (a pack that loaded before loads and plays the same: the existing tests, all of `homebrew-subclass-formof.test.js`, pass untouched); the new things are new keys.

- **Where.** `content/schema.js`: `FORM_OF_KEYS` and `formOfProblem` (the shapes), `lintSubclass` (the named forms against content; `inForm` names a feature that takes a form), `monsterLookup` (as `spellLookup` is for spells), `lintGrants` (the action key `inForm`), the strict shapes, `HOMEBREW_RANGES`, `FORM_CR_PATH` and `HOMEBREW_LENGTHS` (`formOf.forms`: 20). `content/reader.js`: `formOf` and `actionLines`. `derive.js`: the merge. `engine/features.js`: `shapeShift` and the check in `feature`. State shape: no change and no version bump (a record's Wild Shape gains `action.form.typeMaxCr` and `action.form.forms`, and `cost.forms`, only when a circle uses the new keys; a feature's action gains `inForm`; a record made before has none of them and plays as it did).
- **1. `typesMaxCr`: a rating for the types a grant adds, alone.** `maxCr` keeps its meaning (the higher of it and the feature's own stands, for every form), so the new thing is a new key, not a change to `maxCr` with `types`. `formOf: { of, types: ['elemental'], typesMaxCr: 5 }` (or `{ byLevel }`, fractions in eighths, by the class's level as `maxCr` is). It needs `types` ("formOf.typesMaxCr is the rating of the types the grant adds, so it needs `types`"). It is the rating of those types in place of the feature's own, up **or down** (a rating below the feature's: elementals up to CR 1/2 while beasts reach CR 1 is a real wish). The beasts keep the feature's rating whatever it says. A `byLevel` that no level of the class has reached yet adds **no type** (the type is not on the record, and a form of it is "not one" the feature takes): a circle that says "elementals from level 6 at CR 2, from level 10 at CR 5" has none at level 3 to 5. Two grants that add the same type: a rating of its own is the highest given; where one grant gives none, the type takes the higher of that rating and the feature's own. A grant that only raises `maxCr` (no `types`) does **not** lift a type another grant gave a rating of its own: with A `{ maxCr: 5 }` and B `{ types: ['elemental'], typesMaxCr: 2 }` the elementals are CR 2 and the beasts CR 5, in either order of the features (the record is `maxCr: 5, typeMaxCr: { elemental: 2 }`); but if A also adds `elemental` with no rating of its own, A's reading is "elementals at the feature's rating" and the higher of the two stands (5). The reader says both ("Another grant of the same subclass that raises the limit of every form does not lift these types above this rating; another that adds the same types with no rating of its own gives them the higher of its limit and this one."); `homebrew-subclass-formof-forms.test.js` holds both cases and both orders.
- **The record.** `form.types` still lists the added types (so everything that reads it still sees them) and `form.maxCr` is the feature's, unchanged. The new key is `form.typeMaxCr: { elemental: 5 }`, there only when a grant gave a type a rating of its own. A reader that lists forms by `maxCr` alone would call a CR 5 elemental too high, so the client reads `typeMaxCr` (see "The client" below).
- **2. `forms`: named forms.** `formOf: { of, forms: ['air-elemental', 'earth-elemental', 'fire-elemental', 'water-elemental'] }`, 1 to 20 monster ids, each once. A named form is allowed **whatever its type and its Challenge Rating**: the name is the limit (the issue's "the four elementals" at CR 5 with the class's limit at CR 1), so `maxCr` and `typesMaxCr` do not apply to it. A Fly Speed is still the class's (`fly`, T86 (3)): a level 6 druid cannot take the Air Elemental by name, and is told so by the existing sentence. The gate checks each id against content, a sentence for each: "formOf.forms names "x", which is not a monster of the SRD or of this pack" (a pack monster is the pack's own `hb-<pack>-` monster; an `hb-` id of another pack is refused; the SRD's ids are read from the SRD lookups the linter already holds, `ctx.monster`, built as `ctx.spell` is; with no pack in hand, as in `lintEntry`, a homebrew id cannot be told and is not refused), and "formOf.forms names "wolf", a beast, a type Wild Shape already takes". A named form of a type the same grant adds is **allowed**: it is how a type with a rating of its own has one form above it (`types: ['elemental'], typesMaxCr: 1, forms: ['fire-elemental']`). `forms` stands alone: it is "something" for the shape rule ("formOf changes something: maxCr, types, tempHp or cost, or forms"). Record: `form.forms: [ids]`, the union of the grants.
- **The price.** `cost` covers what the grant adds: the types it lists, the forms it names, both when it has both; with neither, every form. The record's `form.cost` is `{ resource, n, types?, forms? }`; a grant with `forms` and no `types` has no `types` key on its price, so it prices the named forms alone. `shapeShift` takes the price for a form of a covered type or a covered name; one price a subclass for a feature, as before.
- **The sentences at play.** A named form is taken before the type and rating checks; any other form: "Wild Shape takes the form of a beast or elemental; the X is not one." (as it was, and with named forms: "...a beast, or of the Air Elemental, the Earth Elemental, ...; the X is not one."), then the rating, "At Ven's level Wild Shape takes forms of Challenge Rating 1 or lower; the X is 3." (as it was) or, for an added type with a rating of its own, "At Ven's level Wild Shape takes elemental forms of Challenge Rating 2 or lower; the Fire Elemental is 5." All of it is checked before anything is paid, as before.
- **3. `inForm`: "while in a form" on a feature's action.** `grants.action.inForm: <feature id>`, the id of a feature of the class or the subclass whose action takes a form (Wild Shape). The action is refused unless the holder is in a form **that feature gave** (`e.form.fx`'s effect names the feature: a form from another feature, for instance a subclass's own, does not count, and a feature may name that one instead). It sits beside any cost, `cost.slot` (E) included: Combat Wild Shape is `{ time: 'bonus', target: { self: true }, effects: [{ heal: '1d8' }], cost: { slot: 1, higher: { heal: '1d8' } }, inForm: 'wild-shape' }`. A named feature is one thing to check; "in any form" is not said (T92). It is the action's, so a Reaction is refused by the gate (a standing instruction does not look at a form: "an action with `inForm` is used by its holder..."), an action that takes a form itself is refused ("it is how a form is taken"), and a feat or an item may not say it (as for `zone`, `formOf` and the slot cost). The gate also checks the name: "a grant names "x", which is neither a feature of the Druid nor of this subclass" and "inForm names "x", which does not take a form".
- **Played.** `feature` checks it with the other checks, before the Bonus Action, a use or a slot is paid: "Hearth mend is used while Ven is in a Wild Shape form." (and, in a form another feature gave, "... (the Magmin form is from something else)"). A record that skipped the gate (the name not a string, a Reaction, an action with a form) is refused with "cannot be used: its data for "while in a form" is wrong". A test holds the state equal before and after each refusal, in a fight with the Bonus Action too.
- **The client (review fix round).** `packages/client/classes.js` (approved beyond the issue's list, with its test): `formPrice` prices a form exactly as `shapeShift` does (a form of a covered type or a covered name; a price with neither `types` nor `forms` is every form's, so a price on named forms alone no longer marks a beast unavailable), and `formsFor` lists the forms the engine allows: types within `typeMaxCr[type] ?? maxCr`, and the named forms at any rating (a Fly Speed still the class's). A named monster the client has no content for (a table's pack monster) is listed by its id under "Named forms", priced by its name, and the engine decides. The card's note names an added type's own rating and how many forms the DM named.
- **What players are sent: no change in kind.** The view and the events are untouched. A party member's own record (which its party sees) holds the merged form with `typeMaxCr`, `forms` and `cost.forms` where a circle gave them, and an action with `inForm`; an enemy in a form shows only the creature (the form's name and template), as before; the pack's copy carries the grants as written, with `dmNotes` stripped. A test compares them. A named form's monster id is in the player's pack copy and in the party member's record, and its name appears in a refusal ("... or of the Air Elemental ..."), because the DM chose it for the circle; an enemy's form still shows only the creature.
- **Reading.** "... lets the forms of those added types alone be of a Challenge Rating that grows with the class level (2 from level 6 and 5 from level 10), whatever the feature's own limit is, and adds none of them before the first of those levels." / "adds "air-elemental", ... to the forms it may take, each by name, of any type and any Challenge Rating." / "A form it names spends 1 use of the feature ... instead of a use of ...", and for an action: "It can be used only while the holder is in a form that the feature "wild-shape" gave; otherwise it is refused and nothing is spent." `reader-subclass-golden.txt` is unchanged (none of its subclasses holds the keys); `homebrew-subclass-formof-forms.test.js` holds the reading.
- **Tests** (`homebrew-subclass-formof-forms.test.js`, new; the invented Circle of the Cairn and eight cousins, a pack "cairn-folk"): each circle loads and reads; each refusal of the gate with its sentence; derive (by level, lower and higher than the feature's own, two grants of a type, the price, the class unchanged, an SRD-only record with no new key); the forms played (the CR 5 elementals of a level 10 druid with the beasts held at CR 1, a type no level has reached, the four by name at any rating, a Fly Speed still the class's, a price in a pool for the names and for a type together, a pack monster by name, a fight and the Bonus Action); `inForm` (none, in a form, a larger slot, leaving, a fight, a form from another feature, data that skipped the gate); the overlay out and back; what players are sent. The client's `classes.test.js` holds the card's price and list (a price on named forms alone, `typeMaxCr`, a named monster the client lacks). No existing test was changed; the only files beyond the issue's list are the client's `classes.js` and its test, approved in review.
- **Left (DEBT T92).** See there: the client's note and a screen for a feature with `inForm`, `inForm` for "any form", a rating for a single named form, one price a feature, the Fly Speed of a named form.

## Build notes: D, a feature's action carries a `zone` (#518)

Built to addition D, the owner's questions on their defaults (question 7: after J). What was settled in building, and what differs from the sketch:

- **Where.** `content/schema.js`: `zone` in the keys of a feature's action; `lintZone` takes an action (`lintZone(action, say, true)`); the rules below in `lintGrants`; `BY_KEY.zone` so
  the strict shapes check the zone's own keys and types inside `grants.action`; `workOf` counts a zone's dice for a subclass. `content/reader.js`: the action's `odd` list and
  `actionZone`. `zones.js`: `startZone`, the one place a zone record is made for a feature (see "Left"). `engine/features.js`: `feature` checks, pays and plays it. State shape: no change,
  no version bump (an effect with `feature` and `zone` is the same record as a spell's zone with `feature` as any feature's effect has).
- **The shape.** `grants.action.zone: { on: ['enter' | 'turnStart' | 'turnEnd', ...], once?: 'turn', atCast?: true, spare?: true }`, the spell's own, beside `target: { area: { shape: 'emanation', size } }`,
  `duration` (not `instant`) and `effects` (the steps that go off on each creature). It is the action's, so its cost, its time (action, Bonus Action or free) and its `uses` are any action's.
- **The gate, a sentence for each refusal.** The area must be an Emanation ("the zone of a feature's action is an Emanation, which moves with its holder": a spell may lay out any shape, a feature's moves
  with its holder), a single one, with no `choose` or `count`; a duration that is not `instant`; the zone's keys, `on` (each of three, once), `once`, `atCast` and `spare` as for a spell; `effects` present;
  no summon or teleport step among them (they run on each creature that enters); not a Reaction; and not together with `modes`, `form`, `gain`, `pool`, `cure`, `renew`, `after`, `firstAttack`, `acts`,
  `noSpells` or `orSlot` ("an action with a zone cannot also have `renew`: the zone runs the action's own `effects` and nothing else"). **Only a subclass's feature may carry one**: a homebrew feat or item
  that holds it is refused ("a feat or an item cannot carry a zone: only a feature of a subclass can"), as for `formOf`. An option of a subclass's feature may. A zone's work is held to the same limits as a spell zone's
  (a creature that enters rolls its own dice: `workOf`).
- **Played as the spell zone is, by the same code.** `feature` lays out the area as any area action does (`aimAction`), starts the lasting effect as it did, and calls `startZone` (`zones.js`), which makes `fx.zone`
  (`follows` the holder, `steps` a copy of the action's, `src` the DC, attack and name the action's steps run with, `last` for once a turn) and returns who it goes off on as it appears (those caught, minus those
  spared, if `atCast`; nobody otherwise). From there `entered`, `turnInZones`, `holds` and the queue of zones that wait for an effect to finish are the spell zone's own and are not changed: a foe the zone is moved onto
  by the holder's walk, one that walks in, one that starts or ends its turn there, once a turn if the zone says so, hidden creatures, the `zone` event that only the DM is sent, the zone a player is not sent. No Concentration: a
  feature's effect is not one.
- **How it ends.** With its duration (`startEffect`: rounds in a fight, the clock outside; a fight that ends turns what is left into minutes, as for any effect); when its holder or the DM ends it (`endEffect`, as for a
  spell); and when its holder dies, drops to 0 Hit Points or falls Unconscious: a zone's effect is `fragile: 'unconscious'` (`durations.js`, as Persistent Rage's), which the spell zone gets from Concentration. **Incapacitated** ends
  it only if the action says `endsWhenIncapacitated` (a Stunned holder otherwise keeps it; the spec's "where the spell rules end it" is Concentration's, which a feature has none of). Healing the holder back does not bring it back.
- **One at a time.** A holder with the feature's zone going cannot use the feature again until it has ended: "Sir Ember's Smoulder aura is already going: end it first to use it again.", checked before anything is paid. The
  alternative, a second use that ends the first, was not chosen: a second zone of the same feature would give each creature a second go at its saves.
- **A refusal changes nothing.** The zone's checks (a record that skipped the gate and has no duration, area or effects: "makes an area that lasts, but its data gives no duration, area or effects to lay out"; the
  spare list; the second use) are before the use, the Bonus Action or the Channel Divinity is paid. A test holds the state equal before and after each.
- **What players are sent: no change.** The view and the events are untouched. A zone in play is an effect as any feature's is (`view.js` sends its id, name, source, `lasts`, `parts`, no `zone`; `spell` is `null`), a
  `zone` event goes to the DM only, and a player is told of a creature the zone touches exactly as for Spirit Guardians (a test plays both: a hidden creature that is reached is revealed by its save, one that is not stays hidden and
  untold). The pack copy of a subclass carries `zone` inside the action as every other key of it (and `dmNotes` stripped, as ever).
- **The reading.** "A 10-foot emanation stays for as long as the action lasts. It moves with the holder and never affects the holder. As it appears it affects nobody. From then on, the steps below run on a creature each
  time it enters the area (or the area reaches it) or ends its turn there, at most once a turn for each creature. ... It ends when its duration does, when the holder ends it, and when the holder dies, drops to 0 Hit Points or
  falls Unconscious. The holder cannot use it again while it lasts." The steps under it are read as done to "that creature". The golden file `reader-subclass-golden.txt` is unchanged (none of its three
  subclasses carries a zone); the reading is held by `homebrew-subclass-zone.test.js`.
- **Tests** (`homebrew-subclass-zone.test.js`): the invented Oath of the Ember (a Smoulder Aura that spends Channel Divinity; an Ember Pyre with its own use, `atCast`, `spare` and `endsWhenIncapacitated`); the strict
  load and the reading; each refusal of the gate; a feat and an item refused; derive (DC put in, the class unchanged, an SRD-only sheet identical with the pack lent); what players are sent; the zone played (appears on
  nobody, moves with the holder, a foe reached or walking in, once a turn, turn end, outside a fight, a failed save's damage, `atCast` and `spare`); the duration in a fight and on the clock; dismissal by the owner or
  the DM and not by another player, and use again; death, 0 Hit Points and Unconscious, and Incapacitated only where it says; refusals that change nothing; hidden creatures against Spirit Guardians; a typed area; a fight that ends; the overlay
  away and back; replay. No existing test was changed. No file outside the issue's list was touched.
- **Left (DEBT T87).** See there: `casting.js` still makes its own zone record (the same fields) and should call `startZone`; the size of the Emanation is a number (the friendly `aura`'s grows by level); only an Emanation;
  the client offers no spare list for a feature and has not been looked at for a feature's zone; no replace-on-reuse.

## Build notes: E, a spell slot as a feature's cost (#520)

Built to addition E, building on `orSlot`, which Hurl Through Hell already had (with its use spent, `feature` with `slot` spends a Pact Magic slot of that level to restore it). What was settled:

- **Where.** `content/schema.js`: `lintActionCost` (one function, called by `lintGrants` and by `lintFeat` for the record a character holds), the `workOf` estimate for a subclass's action, and three
  places that took a cost to name a resource (a cost with only a `slot` names none). `content/reader.js`: `slotCost`, and a line for `orSlot`. `engine/features.js`: `feature`. State shape: no change,
  no version bump (the creature's `slots` was already there, and the cost is data of a feature's action).
- **Two things, one argument.** `orSlot: true` restores a spent use with a slot (now for any caster: a Pact Magic slot of the level named for a Warlock, as before, any spell slot the creature has for another);
  `cost: { slot: n }` makes a slot part of the price of the action. Both are named by `slot` on the `feature` action, so the two cannot be on one action ("a slot is spent for its cost or to restore a use,
  not both"). `orSlot` has no lowest level (DEBT T88).
- **The shape.** `cost: { resource?, n?, slot?, higher? }`: at least one of `resource` and `slot`; `n` only with a `resource`; `slot` is the lowest level that pays, 1 to 9; `higher` is what each level above `slot` adds,
  in a spell's own vocabulary (`higher.slot`): `damage`, `heal` or `tempHp` dice added to the first step of that kind, `times` more repeats of the first damage step, `value` more to the number of the first modifier
  step. (`targets` is not offered: G.) The action's own step is the amount at the lowest level, so `heal: '1d8'` with `slot: 1` and `higher: { heal: '1d8' }` is 1d8 per slot level. `scaleSteps` (`effects.js`) does the
  growing, the same code that grows a spell, so the first step of the kind is found as it is for a spell (inside a branch too); what it cannot add (different dice) is handed to the DM with a `manual` event.
- **The gate, a sentence for each refusal.** A slot of 1 to 9; `n` without a resource; `higher` without a slot, empty, with a key a slot level cannot add, with something that is not dice or a positive whole number
  (`times` up to 10, `value` up to 40), or growing a step the action does not have, or one `scaleSteps` cannot grow: it grows the FIRST step of its kind (a step, then its branches), so the gate checks that one
  (its amount is plain dice, of the same size as the die added or without dice; a `{ mod }` or `{ column }` amount is refused; a modifier step's `value` is a plain number, and a later numeric modifier does not do), and says so in a sentence instead of a note to the DM on every use; and the action may not also have `modes`, `form`, `gain`, `pool`, `cure`, `renew` or `orSlot`, may not be a Reaction, and must have
  `effects` ("an action with a slot cost cannot also have `renew`"). **Only a subclass's feature may carry one**: a feat or an item with a slot cost is refused, as for `zone` and `formOf` (a feat or an item may
  still have `orSlot`). A slot cost may sit beside a zone, an `uses` of the feature itself, `cost.resource` (Channel Divinity), `acts`, `after` and `firstAttack`. The work estimate counts the action at a 9th-level
  slot (as a spell's is), so a use that passes at the lowest level cannot pass the dice ceiling at the highest; a zone's term (each creature that enters rolls) is counted with the grown steps too.
- **Played.** `feature` checks everything before it pays: the level (named by `a.slot`; with none named, the lowest level at or above `slot` that the creature has a slot of left), that the level is `slot` or higher and
  1 to 9, that a slot of it is left, and the data (an action with a slot cost and no plain steps, which skipped the gate, is refused with a sentence). Then it pays together: the Action or Bonus Action, the feature's own
  use or `cost.resource`, and the slot (`e.slots[level]--`, with a `std` event "Lantern mend: spent a level 3 spell slot", or "Pact Magic slot" for a Warlock). A refusal changes nothing (tests hold the state equal
  before and after each one, including the refusal of a second price after the first would have been fine).
- **Slots as spells have them.** The slots are the creature's `slots`, whatever made them: a Warlock's one level (Pact Magic), a multiclass caster's from the Multiclass Spellcaster table. The one difference from `cast`:
  with no level named, `cast` takes the spell's own level; a feature takes the lowest level at or above its `slot` that the creature has a slot of, so a Warlock whose only slot is level 3 can use a level 1 feature without naming
  it. Slots do not count for "only one spell slot can be spent per turn" (SRD: "to cast a spell"): a feature is not a spell, and neither flag is set or read. Outside a fight the slot is spent just the same.
- **What players are sent: no change.** The view and the events are untouched in kind: a use makes the events any feature does (a `std` for the feature, one `std` for the slot, the `heal` or `damage`), and the slots a player is sent are the creature's own, as they
  were. The pack's copy carries `cost` as data inside the action, as every other key.
- **The reading.** "It also spends a spell slot of level 1 or higher (a Pact Magic slot for a Warlock): the lowest one the holder has left, unless a level is named when using it. It is refused, and nothing is spent, if no slot of that level or higher is left.
  A slot spent this way is not spent to cast a spell, so it is outside the rule that only one spell slot can be spent to cast a spell on a turn. +1d8 healing for each level of the slot above 1 (to the first healing step, 1d8 at level 1)." The lowest level goes to the numbers the owner checks against the source.
- **The #519 follow-ups.** The gate refuses an `attack` step anywhere in a feature's zone ("an attack step cannot be one of them"; a zone's steps run on a creature the zone caught, with no reach or range to roll against; a save does
  the work). `feature` checks `zone.on` before it pays, beside the duration, the area and the effects ("its zone does not say when it goes off"). Both are held in `homebrew-subclass-zone.test.js`.
- **Tests** (`homebrew-subclass-slotcost.test.js`): the invented Oath of the Lantern (a heal that grows by 1d8 a level, a damage with a use of its own and a lowest level of 2, a Temporary Hit Points that also spends Channel Divinity, a
  use restored by a slot, a plain feature, a repeating bolt) and a Lantern Patron for a Warlock; the strict load, the reading, each refusal of the gate, the work at the highest slot, a feat and an item refused, derive and the
  record lint, an SRD-only sheet identical; what players are sent; the lowest, a higher and a named slot; none named; a multiclass paladin/cleric; Pact Magic; Channel Divinity, a use and a slot together and each short;
  a refused use changes nothing (each reason); outside a fight and a rest; `times`; a zone that costs a slot (its steps are the grown ones); `orSlot` for a creature that is not Pact Magic's; replay. No existing test was changed.
  The two #519 follow-ups are added to `homebrew-subclass-zone.test.js`.
- **Not verified.** Whether the client can pick the slot level for a feature (see DEBT T88): the engine takes `slot` on the `feature` action, but the screen was not looked at, and no browser was run.

## Build notes: F, "the die just rolled" and a hit with a weapon (#523)

Built to addition F. What was settled in building, and what differs from the sketch:

- **Where.** `content/schema.js`: `lintModifier` (a value of `{ rolled: true }`, only where it is allowed), `rolledIn` and `isRolled` (exported: the one check of "the step before", used by the gate and by `feature`), the `after` word, the shape of a modifier `value` (`rolled` joins the amount keys) and one refusal in a zone.
  `content/reader.js`: the words for `after: 'weaponHit'` and for the value. `effects.js`: the damage step keeps the number it rolled in its frame (`f.rolled`); the modifier step puts that number in place of the marker. `engine/features.js`: the `after` check and a check of the data, both before anything is paid.
  **A file beyond the issue's list, approved by the coordinator:** `engine/resolve.js`, one line in `rollToHit`, because the engine recorded a hit with an attack roll (`hit:<attacker>:<target>`) and nothing said whether it was made with a weapon. State shape: no change in kind, no version bump (the fight's `flags` gain a key of a new name while a turn lasts; a frame on the effects stack gains `rolled` while an action runs).
- **`after: 'weaponHit'`.** As `after: 'hit'` (Hurl Through Hell): on a creature, in a fight, once a turn for the feature. It follows the holder's hit with a weapon on **each creature the action is aimed at**. The flag `whit:<attacker>:<target>` is set in `rollToHit` when the attack hits, there is a fight, the attacker is a creature, and the attack is neither a spell's (`atk.spell`) nor an Unarmed Strike (`isUnarmed`): the same test as the `weapon` flag of `resolveAttack`. So a thrown weapon, an Opportunity Attack with a weapon and a monster's stat-block attack count; a spell attack, an Unarmed Strike and a hit on another creature do not. The once-a-turn mark (`after:<feature>:<holder>`) is the one `after: 'hit'` uses. The gate: `after` is `"hit"` or `"weaponHit"`, on a creature.
  Sentences: "X follows a hit with a weapon in a fight." / "X follows a hit with a weapon: Zaa has not hit Gob with a weapon this turn." / "Zaa has already used X this turn."; all checked with the rest, before the use, the Bonus Action or a slot is paid.
- **`{ rolled: true }`.** A modifier step's `value` that is the number the damage step just before it rolled. The marker is replaced by the number when the step runs, so the modifier stored on the creature is a plain number (`{ on: 'ac', op: 'add', value: 5 }`) and nothing else in the engine reads the marker. The gate: only a modifier step of a subclass feature's action (a feat, an item, a spell, a trait's modifier, a feature's always-on modifier and a zone's steps are refused, a sentence each); op `add`; the step directly before it, in the same list (a branch is its own list), is a damage step of plain dice (`1d8`, not `1d8+2`) with no `times` and no `when`. The Bardic die is put in by `derive` (`{ column: 'bardic-die' }` becomes `1d8` at level 5), so the invented College's step is `{ damage: { column: 'bardic-die' }, type: 'slashing' }`. `feature` checks the same of the record it plays before paying (data that skipped the gate: "its data is wrong (...). The DM can apply it."); a modifier step that finds no number is handed to the DM.
  The number is the damage as rolled, before a Resistance cuts it. A save that halves the damage does not halve the number, because a successful half-save skips the rest of its branch, the modifier step with it (`effects.js`: `if (f.half) return`); so the only way a halved damage and a number added meet is Evasion's failed save, which deals half and still adds the whole number. A test holds that a goblin with Resistance to slashing takes half and the Armor Class still goes up by the whole number.
- **Refused by the gate, after review (fix round 1).** (1) `{ rolled: true }` anywhere under an `attack` step: a Critical Hit doubles the dice of its damage, so the number would be two dice; the engine's check (`rolledProblem`) refuses the same from data that skipped the gate. (2) A rolled value is held to the range a number written out has: the most the damage step can roll (`NdM`, or the largest die of the class column) is at most 40, or 120 on a speed. (3) `rolled` is for one target: not with `target.creature.count` above 1 or an area (several creatures would each roll their own number: addition G settled that, see "Build notes: G": a second creature `near` the first shares the one roll; `count` and an area stay refused), and not with a `cost.higher` that grows damage or repeats it (the number could pass what is checked); `feature` refuses an action that reaches more than one creature before it pays. (4) `after` with `pool` or `gain` (no creature to have hit): a gate sentence, and `feature` refuses it before paying with a sentence where it used to throw (inherited from `after: 'hit'`; fixed for both).
- **The extra damage is its own roll.** As the survey said: the die is rolled for the action's own damage step, to the creature hit, and is not added to the weapon hit's damage or doubled with it.
- **What players are sent: a small change, yes.** The view and the events are the kinds a feature's use always makes. The fight's `flags` that a player is sent now carry `whit:<attacker>:<target>` beside `hit:<attacker>:<target>` after a weapon hit, under the same filter (`view.js` leaves out any flag that names a creature the party does not know of; `view.js` is not changed). A test plays a hidden creature's four flags (`hit` and `whit`, each way round) and holds that none reaches a player while the DM keeps all. A creature's own record is sent as before.
- **The reading.** "It follows a hit the holder made with a weapon this turn, on the creature it hit, once a turn. A spell attack and an Unarmed Strike are not a weapon here." and "an addition to its Armor Class equal to the number the damage step just before it rolled (the same roll, not a new one)". The golden file `reader-subclass-golden.txt` is unchanged (none of its three subclasses uses either); the reading is held by `homebrew-subclass-rolled.test.js`.
- **Tests** (`homebrew-subclass-rolled.test.js`): the invented College of Whirling Steel (a Bard subclass: Guard, Dash, a choice of the two by `modes`, and an `after: 'hit'` one): the strict load and the reading; each refusal of the gate (no step before, a step that is not damage, a step between, after it, a flat part, `times`, `when`, a branch, the value's shape, the op); where `rolled` may not be (a feat, an item, a trait, a spell, a zone) and where `after` may not; derive (the die put in at levels 3 and 5, the class and an SRD-only sheet unchanged); what players are sent; the use after a weapon hit (damage, and the same number added to Armor Class and gone at the start of the holder's next turn; a Speed; the choice); once a turn; each refusal that changes nothing (not in a fight, no attack, a miss, another creature, a spell attack, an Unarmed Strike); a thrown weapon counted; no pool left; data that skipped the gate; `after: 'hit'` as it was; Resistance; the overlay away; an SRD-only game identical; replay. The review's fix round adds tests for each refusal above, a real Fire Bolt cast (`hit:` only), a weapon Opportunity Attack and a monster's stat-block weapon attack (`whit:`), and the flags the engine makes for the DM's hidden goblin (sent to players exactly when the creature is: an attack gives its place away, so the flags that name it go to players exactly when the creature does, and the keyed filter is played with flags set by hand; **corrected in #530**: that a creature the party is not told of cannot have its flags made was wrong. An unseen goblin's Opportunity Attack under the `light` sight rule, in a dark field, makes `hit:` and `whit:` flags while the goblin stays unknown to the party, and they are filtered out exactly as the keyed filter says; the last test of `homebrew-subclass-rolled.test.js` plays that, with the flags made by the engine). No existing test was changed in what it checks. **A second file beyond the list, approved by the coordinator:** `e23-replay.test.js`, whose recorded final-state hash of one scenario now has a `whit:` flag in it; the test takes only `"whit:..."` keys out of the state before hashing, beside its other two normalisations, and no hash was re-recorded.
- **Not built (DEBT T89).** See there: the extra damage is its own roll; `rolled` is narrow (one die, `add` only); the client was not looked at; `whit:` flags are now sent to players.

## Build notes: G, a second target near the first, and a mode with its own price (#530)

Built to addition G. What was settled in building, and what differs from the sketch:

- **Where.** `content/schema.js`: `lintTarget` (a `nearOk` argument), `lintNear`, `lintModeOwn`, `nearRun` and `nearProblem` (exported: the one check of "the steps it begins with", used by the gate and by `feature`),
  `featureRefs` (a mode's `cost.resource` is a cost like the action's), the record lint (`lintFeat`: a mode's keys, its pool), the strict shapes (`target.near`), `HOMEBREW_RANGES` (`target.near`, 5 to 60) and `workOf`.
  `content/reader.js`: `nearLine` and a line for each mode's price. `engine/features.js`: `feature`. `effects.js` was not needed: `sharedRolls` and `begin` already do what the second creature wants. State shape: no change, no
  version bump (a record's action carries `near`, `free` and a mode's `cost` as data, as any key of it; no new flag, no new event).
- **The shape.** `target: { near: N }` on the action, beside `creature`, or on a mode, alone (`{ id, name, target: { near }, effects }`); N is feet, a multiple of 5, 5 to 60. A mode's `cost: { resource, n? }` is the pool it spends
  **instead of** the action's price (n is 1 if left out), and `free: true` is no price at all; not both. The action's own `cost` is what a mode with neither spends, as before. A mode's keys are now `id, name, effects, target?, cost?, free?`.
- **Chosen by the player: the second id in `targets`.** `{ type: 'feature', actor, feature, mode, targets: [first, second] }`; `target` alone, or `targets` of one, is the first creature only (the second is optional, as in Slashing Flourish: "and also").
  It is the existing field `targets` that the creature-id filter of `engine.js` already reads (`CREATURE_FIELDS`), so a creature the party is not told of is, to a player, no creature at all, with the very sentence a creature that is not there gets ("No such creature."), checked before anything else; the DM may name one. A new field would have needed `engine.js`.
- **What the second creature is, and takes.** It is within N feet of the **first** target (not of the holder: it need not be in reach, and it is not checked for a hit: `after` follows the hit on the first target only), another creature than the holder and than the first,
  alive, and in the battle in a fight. **It may be an ally**: the feature says "another creature" and the vocabulary has no "foe" for it (as a spell's target names no side), so the engine does not ask; the reading says so. A wall between the two is not looked at (as for `within`). It takes **the damage steps the action begins with**, the leading run of `damage` steps, **and nothing else**: a modifier on the holder, a push or a condition after them is done to the first creature alone.
  The gate holds the run to plain steps: the first step is a damage step, and none of the run has `when`, `onKill` or `onZero`; a mode's own `near` holds its own steps to that, an action's `near` holds every mode's. Resistance, Immunity and Vulnerability are each creature's own.
- **One roll, shared: the answer to F's question.** The leading damage is rolled **once** (`sharedRolls`, as an area's damage is) and both creatures read it; the first creature's later `{ rolled: true }` modifier reads the same number. This is the usual reading of Slashing Flourish
  ("the damage equals the roll"), and it keeps the number a modifier adds equal to the damage the player saw dealt, to both. The second creature is run first on the stack and so goes second in the events (the first creature's steps, then the second's). The die is spent once. **The refusal F made is lifted for `near` and kept
  for `count` above 1 and for an area**, for a reason F did not give in full: a modifier step runs once for each creature the action reaches, so a `to: 'caster'` modifier of `{ rolled: true }` would be put on the holder once for each creature and add the number several times over. With `near` the second creature
  runs the damage steps only, so the modifier is put once. The gate's sentence now says so, and says where the way to a second target is. (An area's own damage is already one shared roll; the refusal there is the modifier, not the number.)
- **A mode's price, all before payment.** `feature` finds the mode first (it used to come after the pool check, so a refusal for a missing mode now comes before one for no uses, the one change of order), then the price: none for `free`, the mode's `cost`, else the action's, else the feature's own uses.
  `orCost` and `orSlot` are about the action's own price, so an action that has either and a mode with a price of its own (or none) is refused by the gate in a sentence, and by the engine for data that skipped it ("its Master mode has a price of its own (or none), and the action also has orCost or orSlot"); so is a mode both free and priced, a price with no pool or no
  uses, and a `near` that is not feet, on an action of several targets. A mode's `cost.resource` must name a feature with uses of the class or the subclass, like the action's (the sentence "a cost names ..., which is not a feature with uses of the Bard or of this subclass"), and, in a record, one the character has.
  Nothing is paid for a refusal; the tests hold the state equal before and after each.
- **Who may.** `near` only in a subclass's feature (a feat, an item, a spell, a monster and an object are refused, a sentence each; a spell's `lintTarget` says so). A mode's `cost` and `free` have no such limit: a feat's action may have modes, and a price it names is checked in the record as the action's is. `near` with `pool`, `gain`, `form`, a `self` target or an area (a zone is one) is refused: it needs one creature to be the first.
  `near` with `cost.slot` is allowed (the damage that grows is the shared one). The work estimate counts the second creature's leading steps on top of the first creature's, and no dice more.
- **What players are sent: no change.** The view and the events are the kinds a use always makes (a `damage` event for each creature, `std`, `effectStart`), the fight's flags gain no key (the use makes the `after:` mark it always made, and nothing names the second creature), and a damage event to a creature the party is not told of is left out of what players are sent, as ever (a test: the DM names a hidden creature). The pack's copy carries `near`, `free` and the mode's `cost` as data, as every other key.
- **The reading.** "In the "Slash" way, a second creature within 5 feet of the first target may be named as well, by the holder (a second name in `targets`). It must be another creature than the holder and the first target. It takes the damage steps the action begins with, rolled once for the two of them (the same roll, not a new one), and nothing else: every step after those is done to the first target alone." and "The "Master" way costs nothing: it spends no use of anything, whatever the action costs otherwise." / "The "Heavy" way spends 2 uses of the holder's feature ... instead of what the action costs otherwise." The golden file `reader-subclass-golden.txt` is unchanged (none of its subclasses has any); the reading is held by `homebrew-subclass-near.test.js`.
- **Tests** (`homebrew-subclass-near.test.js`): the invented College of the Silver Fan (a Bard subclass: Flourish with six modes (Slash, Guard, Sweep, Master, Heavy, Reserve), Fan with `near` on the action itself, a pool of its own); the strict load and the reading; each refusal of the gate (where `near` may not be, what it needs of the action and of the steps, a mode's target, each refusal of a mode's price and what it cannot sit beside); the work; derive and the record lint; what players are sent; the second creature taking the same roll over several seeds, with the Armor Class put once;
  the second named or not; every refusal of the second creature, with nothing changed; a creature outside the battle; a hidden creature to a player and to the DM; Resistance; a free mode with the pool empty; a mode priced at two uses and one in a pool of its own; `near` on the action; replay; the overlay away; data that skipped the gate; `rolled` kept refused for `count` and an area. **One existing test changed in its wording:** `homebrew-subclass-rolled.test.js`, the test of `rolled` for one target, matched the sentence "(a second target is addition G)", which now says where G went. The rest of that file
  gains the engine-made case of the F correction above and a reworded comment.
- **Review of #532, fix round 1.** (H1, High, on main too) The creature-id filter of `engine.js` (`dispatch`) skipped an element that was not a string, and a handler then coerced it: `s.entities[['m15']]` is `s.entities.m15`, so `targets: [gob, ['m15']]` reached a hidden creature (damage, and refusals that named it and its distance).
  A field that names creatures (`CREATURE_FIELDS`) is now an id or a flat list of ids, or absent (undefined or null); anything else (a list inside a list, an object, a number, a list with a non-id in it) is refused for a player with "No such creature.", before any handler runs, the very answer an id that is nothing gets.
  `feature` also refuses a non-string id in its own list, whoever sends it. State shape and what players are sent are unchanged (a refusal only). **Two existing tests changed** because a number in an id field used to reach the handler's own sentence: `companions-command.test.js` (`ids: [1]`: "Name the creatures" is now "No such creature.") and `companions-pocket.test.js` (`deliver: 7`: "Name the familiar" is now "No such creature."); `hidden-ids.test.js` gains the nested, object and number forms in every field of every action.
  (L1) An ally may be the second creature, said above, in the reading and tested. (L2) The engine's data check for `near` also holds it to 5 to 60 feet and to an action aimed at a creature. (L3) `lintFeat` runs the same `lintNear` on a record's action (a creature to be the first, one target, 5 to 60, damage to begin with, every mode's). (L4) Tests: a critical weapon hit and then the flourish (one die on each creature), a mode's own pool paying with the action's empty, and `cost.slot` beside `near` (the slot grows the one shared roll).
- **Not built (DEBT T91).** See there: the client does not send a second creature or show a mode's own price; the second creature takes only leading damage (no save, no attack, no other step); `rolled` stays one-target beyond `near`; a mode's price is a pool only.

## Build notes: H, triggers on what the holder does (#534)

Built to addition H, with the owner's coordinator's approval of two files beyond the issue's list (below). What was settled in building:

- **Where.** `content/schema.js`: `GRANTS` (`triggers`), `triggersProblems` (the gate, one sentence for each refusal; also run on a record's feature by `lintFeat`, `FEAT_FIELDS`), `TRIGGER_KEYS`, the strict shapes (`triggers`, `attackTrigger`, `hitTrigger`), the refusal for a feat or an item and the item's key list.
  `content/reader.js`: `GRANT_WORDS.triggers`, `ITEM_NO_GRANTS`. `derive.js`: one line copying the grant onto the record of a class's or a subclass's feature. `engine/attacks.js`: `attackActionTaken`. `engine/movement.js`: `opportunityRider`, the `move` handler.
  `reactions.js`: `afterOpportunity` and the flag's name `OWED_MOVE`. **Files beyond the issue's list, approved:** `derive.js` (the copy line) and `test/reader-items.test.js` (one entry in `SAMPLES`, which that test holds equal to `GRANTS`).
- **The shape: one new grant, `triggers`, a subclass's feature only.** `triggers: { attackAction?: { modifiers }, opportunityHit?: { move: 'half' } }`, at least one key, each once. The gate: a key that is neither, an empty list, more than five modifiers, a modifier the existing
  `lintModifier` refuses (unknown hook or op, a bad value), a modifier with `against`, `except`, `uses`, `onFail` or `cost` ("lasts for the turn and is the holder's own"), and `opportunityHit` that is not exactly `{ move: "half" }`. **Only a subclass's feature may state one**: a homebrew feat or item that holds it is refused
  ("Only a subclass's feature can state a trigger on what its holder does (triggers)"), the item linter refuses the key, and `derive` copies it only from a feature of a class (`cls.i >= 0`), so a feat or an item that skipped the gate changes nothing.
- **`attackAction`.** Fires in `attack`, at the one place the Attack action is spent (the non-pooled, non-Bonus-Action branch), and in the Pact of the Chain `familiarAttack` branch that spends the master's Attack action; on the holder's own turn in a fight. Not for an attack that only starts the fight (it rolls Initiative and returns), not for
  an Extra Attack's later attacks (they come from the pool), not for a Bonus Action attack, a spell or an Opportunity Attack (`current(s) !== holder`). Each feature that states it puts its modifiers on the holder as a bound lasting effect
  that ends at the end of the current turn (the pattern of `afterHit` and `missed`: `ends: { on: 'turnEnd', who: holder }`), once a turn for the feature by the mark `after:<feature>:<holder>` that `after:` already uses: a second Attack action in the turn (Action Surge) adds nothing. **Speed is also walking feet:** `budget.move` is set at the turn's start and does not follow Speed,
  so what the modifiers raised `speedOf` by is added to `budget.move` at once (as Instinctive Pounce adds its half); a Speed that is lowered gives no feet and takes none back. Dash after it sees the higher Speed. A record that skipped the gate (modifiers not a list) is told to the DM with a `manual` event and left alone, and the attack is made. All of this follows the checks of the attack, so a refused attack changes nothing.
  Not covered: the Multiattack of a creature made from a monster (a subclass belongs to a character).
- **`opportunityHit`.** Fires in `walk()` (movement.js), where the Opportunity Attack is resolved, when the holder's attack made as the Opportunity Attack hit (an `attack` event of the holder with `hit` true, a Critical Hit included; a Grapple made in its place is not an attack roll, so it gives nothing).
  The holder must be up, not on its own turn, and have half its Speed (rounded down to 5 feet) of at least 5. **Where the destination is chosen is the limit, said plainly:** the engine runs the mover's whole move in one action and the prompt machinery cannot carry a hex, so the holder is not asked where to go in the middle of it.
  Instead the feet are kept on the fight's turn flags as `rmove:<holder>` (the larger of any it already has) and the holder is told by a `note` (a party member) or a `manual` event (the DM's creature): "Bell chase: Sir Bell may move up to 15 ft without provoking Opportunity Attacks. The engine finishes the other creature's move first, so Sir Bell moves afterwards, before this turn ends."
  It is spent with the existing `move` action, by whoever controls the holder, **after** the mover's move and before the turn ends (the flags are reset when the next turn begins, so it lapses then); it is not taken between the mover's steps. A holder that rides or is ridden gets a `manual` event for the DM and nothing is kept.
- **A move and nothing else.** Only the `move` handler reads the flag. Every other action still needs the turn (`need`, `current`), so an attack, Dash, Disengage, Dodge, a feature or `endTurn` is refused as ever. `move` with the allowance lays its reach out on a read-only copy of the game in which it is the holder's turn with only that movement (`asItsTurn`; `moveOptions` is unchanged), spends from a budget of its own
  (`{ move, dashes: 0, free: true }`), and `walk` skips the Opportunity Attack loop for a budget with `free` (as `cond.disengaged` does for a Disengaged mover); traps, zones and noticing still go off. What is left is written back as the flag (none left, the flag is deleted), and a move beyond it is refused ("Too far. Sir Bell has 5 ft of movement left.") before anything changes.
  A creature with no allowance is told "It isn't X's turn." as before.
- **State shape: no change, no version bump.** A record's feature gains `triggers` as data; the fight's turn flags gain `rmove:<holder>` while a turn lasts (a number of feet).
- **What players are sent: a small change, yes.** A party member's own record, which its party sees, holds `triggers` on its feature; the pack's copy carries it as written, with `dmNotes` stripped; the fight's flags a player is sent can now include `rmove:<creature>` for a creature the party knows of, and none for one it is not told of (the view's existing filter drops any flag that names such a creature, as for `hit:`; a test plays a creature that stays unknown, with the flag made by the engine). The `note` goes to the holder's side only: a foe's is a `manual` event, which players are not sent. `view.js` is not changed.
- **The reading.** "When the holder takes the Attack action on its own turn in a fight, it gets +10 feet to its Speed until the end of that turn, once a turn. A second Attack action in the turn (Action Surge) adds nothing more. A Speed it adds is also added to the movement it has left, at once." and "When the holder's Opportunity Attack hits, it may move up to half its Speed (rounded down to 5 feet), and that movement provokes no Opportunity Attacks. The engine finishes the mover's whole move first, so the holder spends this movement afterwards, with a move of its own, before that turn ends; it does not move in between the mover's steps, and it can do nothing else with it. A holder that rides or is ridden is moved by the DM."
  The golden file `reader-subclass-golden.txt` is unchanged (none of its subclasses holds the grant); the reading is held by `homebrew-subclass-triggers.test.js`.
- **Tests** (`homebrew-subclass-triggers.test.js`, the invented College of the Swift Needle and Oath of the Hollow Bell, a pack "bell-needle-folk"): the strict load and the reading; each refusal of the gate; a feat and an item refused and derive ignoring them; the record lint; derive (levels, an SRD-only record the same); what players are sent; the Attack action (feet, mark, effect gone at the turn's end, Dash, a second action,
  an Extra Attack, a spell, an Opportunity Attack, the attack that starts a fight, a refused attack with the state equal before and after, a record that skipped the gate, a Speed `set` and a lowered one, the overlay away); the Opportunity Attack (a hit, a miss, no Reaction, no feature, an SRD oath, Speed 0, a rider, a foe's, an unseen foe's flag, an answered `ask`, a Grapple instead); the allowance (spent with `move`, provoking nothing beside a control that does provoke, what is left, too far, every other action refused with the state equal, another player, lapsing at the turn's end); replay.
  One entry added to `reader-items.test.js`'s `SAMPLES` (approved); no existing test was changed otherwise.
- **Left (DEBT T93).** See there: the allowance comes after the mover's move, not in the middle of it; the client has no button or hint for it; the Multiattack of a creature made from a monster does not set `attackAction` off; the monster AI does not spend the allowance of a creature it plays.
