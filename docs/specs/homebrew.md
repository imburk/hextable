# Spec: homebrew, and a builder an AI can drive

Status: draft by an agent, to be reviewed by the design owner. Issue #237, part B
(the owner's request of 13 November). Nothing here is built. No code is written
by this spec.

The owner asked: given the engine as it is, what can be added to support
homebrew rules, and how would they be constructed? Is there a builder for the
language of a spell? He would love it to be something an AI can use, so that a
user need not learn the vocabulary (a stretch goal).

This spec says what a homebrew pack is and where it lives, what the closed
vocabulary can and cannot express today (with evidence), the limits that keep a
table safe, how homebrew shows in the compatibility report of
`portable-characters.md`, the builder, the AI route, and what is cheap now and
what is a stretch. It ends with the jobs in build order, the review points and
the questions for the owner. Style follows `table-ui.md`.

## Rules that bind this design

- **Content is data, and the vocabulary is closed.** A homebrew entry is data
  that `lintPack` (`content/schema.js`) accepts. A new effect step, hook, op or
  tag is an engine change with a spec amendment, never a pack (`CLAUDE.md`).
  Homebrew therefore cannot do what the vocabulary cannot; what it cannot say
  becomes a `manual` step with text for the DM, and the tier says so.
- **The repo stays SRD-only.** Homebrew packs belong to a table (or to a
  player's device), never to the repo, and never to `content/srd52/`.
- **Never trust a client.** A pack is linted on the server by the same linter
  as the SRD pack, with stricter limits, before it can touch a table. A client
  that lints for its user's convenience proves nothing to the server.
- **The server is authoritative; everything goes through `apply()`.** Adding
  or removing a pack is a message the DM sends; what the pack does in play runs
  in the engine like any content.
- **The engine never pretends.** A homebrew spell the engine cannot fully run
  is `assist` or `manual`, and the table is told in words, as for SRD entries.
- **Players are sent only what their characters can see.** Homebrew monsters
  are secrets until met (Decision 5).
- **The rules package is pure.** The schema export, the linter, the reader and
  the dry run are plain functions with no I/O, no clock and no `Math.random`;
  the dry run uses a seed.
- **No dependencies, no bundler.** JSON Schema is produced by our own function;
  no validator library is added.
- **No text copied from any rulebook.** The builder, the reader's sentences and
  the examples are written for this project. The project says "5E compatible".
- **Phones are first-class.** The builder is a form that works at 390 x 844.

## Where we are

What exists today, with the file and function so a builder can check.

| Feature | Exists today | Does not exist |
|---|---|---|
| **The vocabulary** | `content/schema.js` exports closed lists: `STEPS` (19), `BRANCHES`, `HOOKS`, `OPS`, `TAGS`, `CONDITIONS` (15), `DAMAGE_TYPES` (13), `SCHOOLS`, `CAST_TIMES`, `AREA_SHAPES`, `SIZES`, `SKILLS`, `GRANTS`, `REACTION_TRIGGERS`, `OBJECT_KINDS`, `TIERS`. | A single declarative description of each entry kind. The shape of a spell, monster or item lives in the code of `lintSpell`, `lintMonster`, `lintItem` and so on, which are not exported (only `lintPack`, `lintRecord`, `lintMultiattack`, `coverage` are). |
| **The linter** | `lintPack({ pack, spells, monsters, pregens, conditions, objects, classes, weapons, armour, feats, items, multiclass, advancement })` returns plain-sentence problems like `spells/fire-bolt: damage "x" is not dice like 2d6+3`. It refuses functions anywhere in an entry (`findFunction`) and cross-checks ids (a class's spells must be in the pack). | Limits on size, count or depth. `lintSteps` and `walkSteps` recurse through `onHit`/`onFail`/... without a depth limit, so a deeply nested entry is a stack-overflow risk. Most kinds accept **unknown extra fields** (only `lintItem` and `lintFeatDef` check their key list); the monster action copy `runtimeAction` in `content/index.js` `structuredClone`s everything but `text` into every creature. A pack from a stranger needs a strict mode. |
| **How packs load** | `content/index.js` imports each file of `srd52/` statically, builds `PACKS` (one pack), and builds the lookups `CONTENT`, `SPELLS` (`spellProfile`), `MONSTERS` (`legacyMonster`), `MONSTER_ACTIONS` and `PREGENS` **once, at import**, as plain objects. About 130 places read `CONTENT`, 53 read `SPELLS`, 23 `MONSTERS` (`rules`, `client` and `server`). | A table-specific content set. A second pack cannot be added without editing the file; there is nothing that loads data at run time. |
| **How a spell runs** | `effects.js`: `spellProfile(def)` (aim, kinds, harmful, area, count), `spellKinds(def)` (damage, healing, control, utility), `run` executes the steps on a stack kept in the game state. A cast goes through `casting.js`. | Reading a spell back in words. `spellProfile` makes a UI profile, not a description. |
| **Evidence of the gap** | `npm run content` prints the tier of every entry. Spells: 339, **45 auto, 86 assist, 208 manual**. Monsters: 329, 57 / 270 / 2. Feats 17: 6 / 8 / 3. Magic items 75: 36 / 15 / 24. Objects 24: 16 / 7 / 1. Conditions 15: 5 / 10 / 0. **All 208 manual spells are exactly one `manual` step** (counted by walking the pack); the 270 assist monsters carry 176 `manual` steps in their actions. | Entries that say *why* they are manual in a machine-readable way. The reason is the text of the `manual` step. |
| **Table rules** | `state.settings`, the DM's `setting` action, validated against `SETTINGS` in `engine/dm.js`: thirteen named switches (`sight`, `autoEngage`, `passiveFind`, `vertical`, `climbing`, `cover`, `creatureCover`, `engageRange`, `unseenTurns`, `diceThrow`, `pace`, `conclusion`, `xpShare`). | `rules-expansion.md` Decision 8 describes options *declared in packs* with an id, description, choices and default, read at fixed rule points. Today the list is a constant in the engine; a pack cannot declare a switch or add a choice. |
| **Packs on a table** | The table state has no record of which packs it uses (`rules-expansion.md` says it should). `pack.version` is 1 and nothing reads it. | Per-table packs, pack ids in the state, pack storage on the server. |
| **Server storage and limits** | One JSON file per table in `DATA_DIR`; per-address and per-table limits in `limits.js`; uploaded images under `DATA_DIR/assets/<code>/` with a size, count and type check (`assets.js`). A DM's action may be up to 4 KB, a map action up to 1 MB (`MAX_ACTION_BYTES`, `MAX_MAP_ACTION_BYTES`). | A place for a pack, or a message that carries one. |
| **What players are sent** | `playerView` (`view.js`) sends the entities the party knows; a foe is a `seenRecord` (name, health word), not a stat block. The client bundle holds the SRD monsters' stat blocks because they are SRD content. | A rule about what of a table's own content players may have. |

## What the vocabulary can say today, and what it cannot

An honest inventory by kind. "Plays by the rules" means `auto`: the engine runs
it. Everything else is text for the DM.

### Spells (the builder's first target)

**Can express, and the engine runs (45 auto spells and the auto parts of 86
assist spells):**

- Casting time from `CAST_TIMES`; range `self`, `touch` or feet; components
  `v s m`; duration `instant` or a count of rounds, minutes, hours or days;
  `concentration`, `ritual`.
- Targets: `self`, one or more creatures (`count`, `repeat`, `within`), or an
  area of one of six shapes (`cone sphere line cube cylinder emanation`) with
  `choose`, `count`, `exceptCaster` and creature-type filters.
- Steps: `attack` (spell or weapon, melee or ranged) with `onHit` and `onMiss`;
  `save` with `onFail` and `onSuccess` (a half-damage save is `half`);
  `damage` (dice plus a flat number, one of 13 types or the caster's `chosen`
  type, `times`, `onZero`, `onKill`); `heal`, `tempHp` (`addMod`, `atLeast`);
  `condition` (15 conditions, with how it ends: a turn boundary, a repeat save,
  damage); `modifier` (a number or advantage or resistance at one of 24 hooks:
  checks, saves, attack rolls, damage, Armor Class, speed, initiative, and so
  on, scoped to a skill or ability, with situation tags); `move` (push or pull a
  multiple of 5 feet), `fall`, `teleport`, `cure`, `kill`, `remains`,
  `endConcentration`, `counter` (for a reaction that cancels a spell), `set`,
  `reveal`.
- Growth: more damage or healing or targets per slot level above its own,
  cantrip dice by character level.
- Areas that last: `zone` (steps on entering or at a turn's start or end),
  `terrain` (difficult or obscured).
- A choice made at casting (a skill, an ability, a damage type, a condition).
- A reaction cast by standing instruction (`reaction: { on: hit | cast | damaged }`).

**Cannot express (the 208 manual spells and the manual steps in the assist
ones), grouped by what is missing.** A keyword pass over the 208 manual texts
(counts are indicative, not exact; the grouping is by reading, not by a field)
puts about 72 in group 1 (objects and barriers), 29 in group 1 (summons), 42 in
group 2, 37 in groups 3 to 5 (numbers, triggers, wording), and 26 elsewhere:

1. **Making things.** A creature that appears and acts (summons, conjured
   creatures, a familiar, animated objects), an object or a barrier or a wall
   put on the map, light or an illusion that persists. There is no `summon`
   step, no `create` step, no way for a spell to add something to the map or
   to the fight. About 29 of the manual spells are summons and about 72 make
   objects or barriers.
2. **Information.** Detecting, locating, learning, speaking with, perceiving
   through another's eyes. These are answers the DM gives, so they are
   honestly `manual`; no step could replace the DM. About 40 spells.
3. **Numbers the vocabulary has no formula for.** A base Armor Class of 13 plus
   a modifier (`modifier` with `op: set` takes a number only), a Speed that
   becomes a formula, ability-score setting, hit points granted as a pool (a
   few dozen spells).
4. **Triggers the engine has no hook for.** A spell cast *after* a weapon hit
   and adding to it (the smites: `CAST_TIMES` has no "on hit"; a
   `reaction.on` of `hit` means being hit, not hitting), a spell that waits and
   fires later, a spell that follows the target for minutes and acts each
   turn without a zone.
5. **Wording the dice cannot hold.** `DICE` in `schema.js` is one dice group
   plus a flat number (`2d6+3`); damage cannot add an ability modifier (only
   `heal` has `addMod`), cannot be `1d8+1d6`, and cannot be "your level
   times 2".
6. **Closed lists.** Damage types, conditions, schools, creature types and
   skills are lists the engine knows. `lintCondition` requires the id to be
   one of the fifteen (`CONDITIONS.includes(e.id)`), so **no new condition** is
   possible, and no new damage type. A homebrew "frostbitten" condition is a
   `modifier` step bundle with a name in the text at best.

**Consequence.** An author who asks for "a spell that damages and slows in an
area, and a creature that has to save each turn" gets `auto`; one who asks for
"summons a wolf pack" or "gives +2 to the next weapon hit" gets `manual` text
for the DM. The builder and the reader must say which, in words, up front.

### Monsters

Fully data: size, type, `cr`, `xp`, `ac`, `hp`, speeds, senses, abilities, saves,
skills, resistances, immunities, condition immunities, traits (modifiers at
hooks, a `reaction` of `hit`), actions (the same steps as spells, attack bonus
and save DC written in), `multiattack`, `recharge`, `uses`, and bonus actions
(`time: 'bonus'`). 57 of the 329 SRD monsters are auto because the rest have
a feature the engine does not run (legendary actions, spellcasting, lair
actions, summoning, many traits): 270 are `assist` with 176 manual steps among
them. Homebrew monsters are therefore mostly *playable as attacks and saves*
and `assist` for anything exotic.

### Magic items, feats, objects

- **Items** (`lintItem`): category, rarity, attunement (any, by class,
  spellcaster), where worn, a base weapon or armour, a +1 to +3 bonus, a
  damage type, properties, `grants` (the same vocabulary as class features,
  minus what is a class's own), charges, and `activate` (a use that casts a
  spell of the pack or runs steps; **nothing runs `activate` yet**, so those are
  `assist` or `manual`, 24 of the 75 SRD items are manual).
- **Feats** (`lintFeatDef`): category, prerequisite (level, ability, a
  feature), ability increase, proficiencies, spell picks, `grants`.
- **Objects** (`lintObject`): doors and things with states, light, triggers
  that fire on enter, leave or near, uses with checks, keys, hidden states and
  finding them.
- **Weapons and armour** (`lintWeapon`, `lintArmour`): fully data, all `auto`.

### What is not content at all, or only one of

- **Classes** are data (`lintClass`: a 20-level table and features with
  `grants`) but `derive` and `validate` assume exactly **one subclass per
  class** (`classOf(...).subclass`, and `validate` tests `k.subclass !==
  k.c.subclass.id`). A homebrew *subclass* for an SRD class, the most common
  request, is therefore impossible; a whole homebrew class is possible in
  principle and a large job in practice (spell progression, multiclass table,
  build screen).
- **Species and backgrounds** are not in the pack at all, and a sheet has no
  field for them (`SHEET_FIELDS` in `derive.js`). The importer reports them as
  names (`import-fgxml.js`). Homebrew species need an engine and sheet change.
- **Table rules**: only the thirteen switches above. A pack cannot declare a
  new one, and "a homebrew choice at an existing rule point" (Decision 8) is
  not built: there is no code reading a pack's option.
- **Maps** are documents, not packs (`map.js`); a homebrew object kind beyond
  `door` and `thing` is not possible.

## The nine decisions

### Decision 1: a homebrew pack is the SRD pack's shape, with a strict prefix

**Question.** What is a homebrew pack, and how does it avoid shadowing the SRD?

**Choice.** A homebrew pack is a JSON document with the shape `lintPack` takes,
for the kinds that can be homebrew now:

```js
{
  format: 'hextable-pack', v: 1,
  pack: { id: 'ember-folk', name: 'Ember Folk', version: 1, license: 'CC0, by the author', attribution: 'Written by the table.' },
  spells: [...], monsters: [...], items: [...], feats: [...], objects: [...], weapons: [...], armour: [...]
}
```

- **Kinds in the first version:** spells, monsters, magic items, feats,
  objects, weapons, armour. **Not** classes, subclasses, species, backgrounds,
  conditions, pack-declared table rules: Decision 9 says why and what each
  costs.
- **Ids are namespaced.** Every id in a homebrew pack matches
  `^hb-<pack id>-<kebab>$` (the existing `ID` pattern allows only lowercase,
  digits and single hyphens, so a dot or double hyphen is not available).
  `hb-` is reserved: no SRD id starts with it, and the linter refuses an SRD
  pack id in a homebrew pack and any id that does not carry the pack's prefix.
  A homebrew entry cannot replace or shadow an SRD entry because it cannot have
  its id. Two packs on one table cannot collide because their prefixes differ.
- **`source`** is `homebrew:<pack id>`; `checked` is `false` and the linter
  requires it, since nothing was compared to a rulebook. The reader shows
  "Not checked against any rulebook" beside every homebrew entry.
- **`tier` is derived, not declared.** `tierOf(kind, entry)` returns `manual`
  when the entry has a `manual` step, otherwise `auto`; the author may lower
  `auto` to `assist` with a flag only where the existing rules allow it
  (`lintSpell` already refuses `auto` with a `manual` step and `manual`
  without one). The builder sets it; a pack that declares a tier the steps
  contradict is refused.
- **`license` and `attribution`** are required by `lintPack` already; for
  homebrew they are the author's statement, shown on the review, and are not
  checked by anyone.
- **Strict mode.** The linter gains `strict: true` (Decision 2) so that a
  pack from a client is checked against the key list of each kind, with no
  unknown field anywhere.

**Reasons.** The same linter and shape means the SRD pack and a homebrew pack
play by one set of rules. The `hb-` prefix is checkable by a regex and is
visible in a character file (`portable-characters.md`).

**Cost.** Ids are longer than the SRD's. A pack that is renamed changes every
id, so `pack.id` is fixed for the life of the pack and changing it is "a new
pack".

### Decision 2: limits and safety are a budget checked before the linter

**Question.** What stops a hostile or clumsy pack from hurting the server, the
table or a player?

**Choice.** A pure function `budget(pack)` runs first, iteratively (no
recursion), and refuses a pack that exceeds any of these. The numbers are
defaults in one constant, `HOMEBREW_LIMITS`, set so that a generous table is
never near them:

| Limit | Default |
|---|---|
| Pack file, as JSON | 256 KB |
| Entries per pack, all kinds | 200 |
| Packs per table | 4 |
| Bytes of one entry | 8 KB |
| `text` of an entry | 1,500 letters |
| Names | 60 letters |
| Steps in one entry | 40 |
| Depth of nested steps (`onHit` inside `onFail` ...) | 6 |
| Depth of the whole document | 16 |
| Any other string | 200 letters |
| Numbers | whole numbers in the ranges the linter already uses |

After the budget, `lintPack(pack, { strict: true })` runs. Strict means:

- **A key list per kind.** Any field not in the list is a problem. The lists
  are written once, in the shape table of Decision 6.
- **No functions** (already enforced by `findFunction`), no `__proto__`,
  `constructor` or `prototype` keys anywhere (the linter and the budget refuse
  them; entries are cloned with `structuredClone`, but a prototype-looking key
  has no business in data).
- **Text is plain text.** Control characters are refused; the client shows
  every string with the `esc` it already uses (`app.js`, `importfg.js`); no
  string is ever rendered as HTML, a link or an image.
- **Ids prefixed** as Decision 1 says, and every cross-reference (an item's
  `spell`, a monster's `multiattack`, a class's spells) resolves inside the
  pack or the SRD.

**What players are sent** (Decision 5): spells, items, feats, weapons, armour
and objects, which they need to draw their own sheets and spell lists; never
monsters.

**Cost.** The strict key lists must be maintained with the vocabulary; a test
that every SRD entry passes strict mode keeps them honest.

### Decision 3: where a pack lives, how it is added, and how the engine reads it

**Question.** The engine reads `CONTENT`, `SPELLS` and `MONSTERS` as module
constants built at import. How does a table have its own content?

**Options.**

- A. **Thread a content object through `apply()`** (`ctx.content`) and change
  the roughly 200 read sites. The clean answer and a very large job: it
  touches nearly every engine module, the client and the server at once, which
  the repo's "small PRs, one module at a time" cannot absorb.
- B. **Keep the packs in the game state.** Replayable, but every pack byte
  goes into every undo patch, every `playerView`, every snapshot and the
  state version, and monsters would reach players.
- C. **A scoped registry.** A new `content/registry.js` builds an *overlay*
  from a table's packs (the same lookups as `content/index.js`: `CONTENT`,
  `SPELLS`, `MONSTERS`, `MONSTER_ACTIONS`) and `using(overlay, fn)` installs it
  over the SRD lookups for the duration of one synchronous call, then removes
  it in a `finally`. The server wraps `apply`, `view` and `viewEvents` for a
  table in `using(overlayOf(table), ...)`; the solo transport does the same
  with the device's packs. Because the engine is synchronous and single-threaded,
  no other table runs in between.

**Choice: C for now, with A as the long-term direction.** The overlay adds ids,
and ids are prefixed, so it can never replace an SRD entry; `using` refuses
an overlay that would. The overlay's `SPELLS` profiles are built by
`spellProfile` once per pack hash and cached.

**Where the pack is stored.** In the table's record on the server, beside
`state`, not in it: `table.packs = [{ id, version, hash, data }]` in the table's
JSON file (`index.js` already saves the table object). The state keeps one thing:
`state.packs = [{ id, version, hash }]`, so a saved game or an export says what it
needs and an engine can refuse a state whose packs are absent. Adding that field
is a state version bump (`VERSION` in `migrate.js`, 20 today) with a migration
giving `packs: []`. The DM's export of a table carries `packs` beside `state`
and `assets` (`export` in `tables.js`). In solo the packs live in the browser
(`hextable.solo.packs`) the same way.

**Who adds a pack.** The **DM only**, by a server message `pack` with the
pack as JSON (the frame limit is raised for the DM to 256 KB plus the envelope;
a DM's map actions already may be 1 MB). Players never upload packs to a
table. A player who has their own homebrew (a character using a homebrew spell)
offers it as part of a character file's `bundle` (Decision 7), which the DM
reads; it is never added without the DM.

The server's steps on `pack`: size and budget; `lintPack` strict; the pack
`id` is new or the `version` is higher; the cross-reference check against the
SRD and the table's other packs; then it computes `hash` (SHA-256 of the
canonical JSON), stores it, updates `state.packs` through an action
`setPacks`, and tells every approved member `packs` (their filtered view,
Decision 5). The refusal is a plain sentence listing the first few problems
with their `spells/hb-ember-folk-x: ...` prefixes, the linter's own words.

**Removing a pack.** The DM can remove one only if nothing refers to it: no
living creature has a template from it, no sheet names its ids, no map object
uses it. The server lists what blocks it. A pack in use is never half
removed.

**Updating a pack.** A higher `version` with the same `id`. A character or
creature referring to an id whose hash changed is flagged in the compatibility
report. The engine uses the new definition. Creatures already made from a
monster keep their own copy of its actions (`makeEntity` copies
`MONSTER_ACTIONS`), so a new version affects new creatures only; this is stated
in the DM's update screen.

**Cost.** One new module (`registry.js`), a state version, a message pair, a
server record. The overlay is a hidden global during a call: it is safe only
because `apply` and the view functions are synchronous and the wrapper cannot be
skipped. A test asserts that two tables with different packs, called in turn,
never see each other's ids, and that a throw inside `apply` leaves the SRD
lookups as they were. The rules package stays pure: `using` mutates a registry
of derived lookups, not game state, and gives the same results for the same
inputs.

### Decision 4: homebrew in the compatibility report of the portable-characters spec

A character file (`portable-characters.md`) lists in `needs.homebrew` the
`{ id, pack, hash }` of every homebrew entry its sheet names, and may carry a
`bundle` with those entries as data (at most 16 entries, 64 KB, linted strictly
like any pack, never trusted). The report's kinds, for homebrew:

- **Table has it, same hash:** nothing to say.
- **Table has the id with a different hash:** "a different thing with the same
  name": the DM sees the two readings side by side (Decision 6) and chooses
  to accept the table's version or refuse.
- **Table lacks it, and the file carries it:** the DM can read the entry and
  **add it to the table** as a new pack `from-<character>` (a one-click
  version of the pack upload, with the same lint and review), or accept without it
  (it goes into `parked`), or refuse.
- **Table lacks it, no bundle:** accept without it (parked) or refuse; no
  guess.

The DM never adds a bundle's content without reading its reading; a bundle that
fails strict lint is dropped and the report says so.

**Cost.** Two fields in the file format and one report kind. Touches
`compat.js` of the portable-characters spec.

### Decision 5: what players are sent of a pack

A table's homebrew is the DM's secret in part. The rule: **a player is sent
what their character needs to play, never what it does not.**

- **Sent to every approved member:** the pack's id, name and version, and
  its spells, items, feats, weapons, armour, objects. These are needed to show
  a spell list, a magic item on a sheet and a door's states, and are no more
  secret than the SRD's.
- **Never sent:** monsters. The client draws a creature from the view's
  `seenRecord` (name, health word), and the SRD stat blocks in the client
  bundle are public SRD content; a homebrew monster's stats are a surprise and
  stay on the server. A creature that has been met is shown as the view shows any
  creature.
- **The DM's notes** on a pack (a field `dmNotes`, at most 500 letters, in the
  key list) are stripped before sending.
- **Where a client reads** `MONSTERS[e.tpl]?.name` (`app.js`, `actionpanel.js`)
  a homebrew template is unknown to a player's overlay, so the code already
  falls back to "Creature". A test asserts the fallback and that no player
  message contains a homebrew monster's text.

The client installs the filtered overlay with the same `using`-style registry
on each update; in solo the player is the DM and has everything.

### Decision 6: the plain-language reader, the schema and the linter are three pure functions

The AI route and the builder rest on three functions in the rules package, all
pure, all returning plain data, none doing I/O:

```js
schemaOf(kind)                  -> JSON Schema (2020-12) for one kind of entry, or { all: ... } for the pack
lintEntry(kind, entry, ctx)     -> [ 'spells/hb-ember-folk-x: plain sentence', ... ]   // strict by default; ctx names the pack and the SRD ids it may refer to
readEntry(kind, entry, ctx)     -> { title, tier, lines: [ 'plain sentence', ... ], doesNot: [ 'what the DM does by hand', ... ], numbers: [ ... ], hash }
```

**`schemaOf`.** The vocabulary lists are already exported constants, but the
*shape* of each kind is imperative code. A new `content/shapes.js` states each
kind's fields as data (field name, type, enum from the vocabulary, range,
required, which step or branch may nest) and `schemaOf` and the strict key
lists are both derived from it. JSON Schema cannot express the linter's
cross-field rules (a zone needs an area and a duration; an `auto` entry has no
manual step; a chosen damage type needs a `choice`). So the schema is a
**structural** schema, and says so in its own description: valid by the schema
is necessary, not sufficient; `lintEntry` is the judge. A conformance test
checks every SRD entry validates against `schemaOf` (so the schema is never
stricter than the linter), and a test mutates entries and checks that the
linter's sentences, which are plain, are what a model is sent back.

**`lintEntry`.** The existing per-kind functions (`lintSpell`, `lintMonster`,
`lintItem`, ...) exported as `lintEntry(kind, entry, ctx)`, with `strict` and the
budget. A change to `schema.js` that exports and parameterises, not a
rewrite. The messages are the linter's own; a model can read "`damage "x" is
not dice like 2d6+3`" and fix it.

**`readEntry`.** Templates per step, per target, per duration, written for this
project, deterministic from the data. Not a language model: the reading must be
what the **engine** will do, which is the whole point of the user approving it.
Example, for an invented spell:

> **Ember Burst** (level 3 evocation, 150 feet, action, instant).
> Each creature in a 20-foot sphere makes a Dexterity saving throw. On a
> failure it takes 8d6 fire damage; on a success, half. Cast with a higher slot,
> +1d6 for each level above 3rd.
> *Tier: auto. The engine rolls and applies all of this.*
> *Not checked against any rulebook.*

and for one it cannot fully run:

> **Wolfsong** (level 2 conjuration, self, action, 1 hour, concentration).
> *The engine does not do this, the DM does:* "Summons three wolves that fight
> for you and obey spoken commands."
> *Tier: manual.*

The reading has fixed parts: the numbers with their units, **every step in the
order it runs**, what the engine does not do (each `manual` step's text, shown
as the author's words in quotes), the tier in a sentence, and two checks that
catch an AI's mistakes: `numbers` lists every number the entry holds with the
step that uses it, and the reader prints the author's `text` and the reading
side by side so a mismatch ("the description says 2d6, the entry has 8d6") is
visible. For a monster it adds average damage per round from the dice (an
arithmetic the reader does, not a promise about play) and the actions with their
save DCs and attack bonuses. `hash` is the SHA-256 of the entry's canonical
JSON, so an approval of a reading is an approval of one exact entry.

**Cost.** `shapes.js` is the biggest piece: about a dozen kinds, one table each,
with tests against the SRD. The reader needs one template per step and per area
and per hook (about 60 phrases), and a golden-text test per template so a
change to a sentence is a visible change.

### Decision 7: the builder is a form over the vocabulary, with a live reading and a dry run

**Question.** What does a person who does not know the vocabulary use?

**Choice.** A client screen, `homebrew.js`, in the table settings (DM) and on
the start screen (My homebrew, a device library like My characters). It builds
one entry at a time. For a **spell** (the first target; monsters and items
follow the same pattern):

1. **Basics**: name, level, school, casting time, range, components, duration,
   concentration and ritual, with the closed lists as selects. A rules text field
   for the table's own description.
2. **Target**: self, creatures (how many), or an area (shape, size).
3. **Effects**: a list of steps, each added from a short menu ("Make a saving
   throw", "Make an attack", "Deal damage", "Heal", "Apply a condition", "Push
   or pull", "Add a bonus or penalty", "Teleport", "Something the DM does by
   hand"). Each step is a small card with the fields that step has, the choices
   from the lists, and nesting shown as indented "On a failed save" /
   "On a hit" blocks. The "by hand" card is the escape hatch and is always
   visible, so nobody is stuck.
4. **Higher levels** and **what lasts** (a zone, terrain).
5. **The reading**: always visible, updating as the person types, from
   `readEntry`. Problems from `lintEntry` are listed in the reader's words
   under the field that caused them and block Save; the tier banner at the top
   says "The engine plays all of this", "The engine plays part, the DM does X" or
   "The DM plays this".
6. **Try it**: a dry run (below).
7. **Save** adds the entry to the pack being edited on this device. **Add to
   table** (DM) uploads the pack through Decision 3.

**Dry run.** `dryRun(kind, entry, { seed })` in the rules package makes a
throw-away game from `newGame(seed)`, installs the entry through the registry
overlay, gives a pregenerated character the spell (or a pregenerated foe the
monster, or the item), places a few target dummies, runs one `cast` (or one
round) through `apply()`, and returns the events with the client's own
`describe` wording and the result of 200 seeded repetitions (average damage,
how often a save succeeded). It touches no table and no saved game, and is the
only way to see the engine do the thing the reading says. It runs in the
browser for the builder and in the CLI for tools. Because it uses `apply()` it
can reveal that an entry the linter allows does something unexpected, and that
is the point.

**Mobile.** One column; each step is a collapsible card; the reading is a
bottom sheet that opens with a tap and stays pinned as a one-line tier banner;
every control is at least 44 px; nothing depends on hover.

**Cost.** The builder is a large client job, done in slices: spells first
(a whole PR for the shell and the step menu, another for areas, higher levels
and zones), then monsters, then items, feats and objects. It must not compute
rules: it reads the schema and calls `lintEntry`, `readEntry`, `dryRun`.

### Decision 8: the AI route, and the user approves the reading, never the data

**Question.** How can an AI model turn "a spell that ..." into a valid entry
without the user learning the vocabulary, and without the user having to trust
raw data they cannot read?

**Choice.** The same three functions, offered to a model, with a fixed
procedure around them:

1. The user describes the entry in words, in an AI tool of their own.
2. The model **reads the schema** (`schemaOf`), writes an entry, and **calls
   `lintEntry`**; on problems it reads the plain sentences and fixes the entry,
   repeating until the linter is silent (the model's loop, not the user's).
3. The model calls **`readEntry`** and shows **the reading** to the user,
   with the original request beside it.
4. **The user approves the reading.** The raw data is behind an "Advanced:
   show data" fold and is not what the button says. The approval is for one
   `hash`: if the entry changes by one character the reading is regenerated and
   the approval is void.
5. The approved entry goes into the user's pack on their device (or, for a DM,
   to the table through Decision 3), where the server lints it again.

**Why the user can trust the reading.** The reading is produced by our code from
the data the engine will run, not by the model. A model that writes a spell that
does 8d6 but describes it as 2d6 is caught because the reader's sentence says
8d6. What the reading cannot catch is a model that misreads the *request*
("fire" instead of "cold"); the request is shown beside the reading so the
user can see it, and the dry run shows what happens. Both are reasons the user
approves in words.

**Where the functions run.**

| Where | What runs | Status |
|---|---|---|
| **The client** (browser) | `schemaOf`, `lintEntry`, `readEntry`, `dryRun`, all of them, from `./shared/...`. Powers the builder and the "paste from an AI" screen. No network. | Cheap once the functions exist |
| **The server** | `budget`, `lintPack` strict and the hash on every pack a DM uploads; nothing is trusted from a client. **No public lint endpoint**: an unauthenticated route that runs the linter and the dry run is a CPU target, and no part of this design needs it. | Required |
| **A small CLI**, `scripts/hb.mjs`, no dependencies | `hb schema <kind>`, `hb lint <file>`, `hb read <file>`, `hb dryrun <file> --seed n`. Reads and writes JSON on the user's machine; the AI tool the user already runs (a coding assistant, say) calls it as a shell tool. | Cheap |
| **A tool server** `scripts/hb-mcp.mjs` | The same four functions as tools of a stdio tool server in the style of the Model Context Protocol (JSON-RPC 2.0 over stdio; the part needed is small and is written here without a library), so a chat client that supports such tools can call them directly. | Stretch |
| **Inside the app, a model call** | A "Describe it" box that sends the user's words to a model service. This needs a key, a network call from the browser, a privacy statement (the user's text leaves the device), and a place to pay; none exists. | Stretch, not recommended now |

**The cheap in-app route.** "Paste from an AI" needs no key: the screen shows a
**Copy instructions** button that puts the schema, a short written brief (one
page, in the repo's own words: what the vocabulary is, the loop above, "if you
cannot express it, use a manual step and say what the DM does") and the user's
kind of entry on the clipboard; the user pastes that into any model and pastes
back what it makes; the screen lints it, reads it and asks for the approval.
Everything on the user's side is the client; nothing is sent anywhere by the app.

**Security of the AI route.** The model's output is untrusted data like any
other pack: budget, strict lint, no function, escaped text. A prompt injection
in the model's input can change what the model writes, but cannot make the
output do more than the closed vocabulary allows, and the reading shows what
it does. A `text` or `manual` step written by a model is shown as a quoted
author's line, never as the app's own voice, and is capped in length.

**Cost.** The brief is a document (`docs/homebrew-ai.md` in a later pull
request) that must be kept current with the vocabulary; a test makes the
schema export and the brief's vocabulary list agree.

### Decision 9: what is cheap now, what is a stretch, and what needs the engine

| Item | Size | Why |
|---|---|---|
| Export `lintEntry` per kind, budget and strict mode | Small | Code exists, needs exporting and a key list |
| `shapes.js` and `schemaOf` | Medium | The shape data is new; tests against the SRD keep it honest |
| `readEntry` for spells, then monsters, items, feats, objects | Medium, per kind | Templates and golden tests |
| Scoped registry, pack message, table record, `state.packs` | Medium to large | The singleton problem and a state version |
| Pack manager screen (review readings, tiers, add, remove) | Medium | Uses the reader |
| `dryRun` | Small to medium | Uses `newGame`, `apply` and the overlay |
| The builder, spells | Large | Many cards; sliced |
| The builder, monsters, items, feats, objects | Large each | Same pattern |
| Paste-from-AI screen with Copy instructions | Small once the three functions exist | |
| CLI | Small | Thin over the functions |
| Tool server (stdio) | Small to medium (stretch) | Needs care and tests |
| In-app model call | Stretch | Keys, privacy, cost |
| **Homebrew subclasses of SRD classes** | Large; engine | `derive`, `validate`, `lintClass`, `classOf`, the build screen and the importer assume one subclass per class |
| **Homebrew species and backgrounds** | Large; engine | No such content kind and no sheet field |
| **New conditions or damage types** | Large; engine | The closed lists are read in many places |
| **Pack-declared table rules** (Decision 8 of `rules-expansion.md`) | Medium to large; engine | Rule points read an option; none does |
| **Vocabulary growth** for what makes spells manual: a `summon` step, an AC formula in `modifier`, an "on weapon hit" trigger, an ability modifier in damage | Each an engine job with a spec amendment | Not decided here; the 208-spell gap is the evidence of where the weight is |

Vocabulary growth is how the gap closes for *every* table at once, SRD
spells included, and it is better value than any homebrew-only feature. This
spec does not schedule it; it names the groups so the milestone
"More of the SRD plays by the rules" (ROADMAP 5) can order them.

## What the engine, server and rules must add

| # | Addition | Kind | Who may send | Touches | State version |
|---|---|---|---|---|---|
| H1 | `budget(pack)`, `HOMEBREW_LIMITS`, strict mode, `lintEntry` per kind | rules | n/a | `content/schema.js`, `tests` | no |
| H2 | `shapes.js`, `schemaOf` | rules | n/a | `content/shapes.js` (new), `tests` | no |
| H3 | `readEntry` | rules | n/a | `content/reader.js` (new), `tests` | no |
| H4 | `registry.js`: `overlayOf(packs)`, `using(overlay, fn)`; `loadPack` | rules | n/a | `content/registry.js` (new), `content/index.js` (export the builders), `tests` | no |
| H5 | `state.packs` and the action `setPacks` | state, action | DM (the server composes it) | `engine/dm.js`, `migrate.js`, `tests` | 20 to 21 |
| H6 | Message `pack` (add, update, remove), the table record, the filtered view `packs`, the export, limits | server | DM | `tables.js`, `index.js`, `limits.js`, `packages/server/README.md`, `view.js` (nothing for players but the filtered message) | no |
| H7 | `dryRun` | rules | n/a | `content/dryrun.js` (new), `tests` | no |
| H8 | Compatibility kinds for homebrew | rules | n/a | `compat.js` (portable-characters P2) | no |

## Tasks

Ordered so each stage is useful alone. Models and lanes as in
`portable-characters.md`. Every task runs `npm test`, `npm run content` and
`npm run build`.

| # | Task | Lane | Model | Touches | Done when |
|---|---|---|---|---|---|
| B1 | **Budget, strict mode, `lintEntry`.** H1. Export the per-kind linters, add the iterative budget, the key lists, the `hb-` prefix rule, the `checked: false` rule. | engine | Opus | `content/schema.js`, `packages/rules/test/homebrew-lint.test.js` | `lintPack` on the SRD pack is unchanged and passes strict mode; a pack with a 10,000-deep nested `onHit` is refused in bounded time with no stack overflow; an entry with an extra key, a function, a `__proto__` key, an SRD id, or an id without its pack prefix is refused with a plain sentence; every limit has a test at, and one past, its value. |
| B2 | **Shapes and the schema export.** H2, with `hb schema <kind>` in the CLI as the first user. | engine | Opus | `content/shapes.js`, `scripts/hb.mjs` (new), `tests` | Every SRD entry of every kind validates against its `schemaOf`; a mutated SRD entry (a bad enum, a missing required field) fails the schema or the linter; the schema's `$comment` says it is structural; `node scripts/hb.mjs schema spell` prints valid JSON Schema. |
| B3 | **The reader, spells.** H3 for spells, golden sentences for every step, area, hook and duration; the "does not" lines for `manual`; the numbers list; the author's text beside it. | engine | Opus | `content/reader.js`, `tests` | For every one of the 45 auto SRD spells the reading is non-empty and its numbers equal the entry's; a golden reading for an invented example matches the one in Decision 6 (written for this project); a changed template changes a golden file; the reader never prints a publisher or product name; for a manual spell it prints the `manual` text in quotes and says "the DM does this". |
| B4 | **The registry.** H4: `overlayOf`, `using`, cached profiles. | engine | Opus | `content/registry.js`, `content/index.js`, `tests` | A homebrew spell cast in a test game runs its steps; two overlays called in turn never leak ids; a throw inside `using` restores the lookups; an overlay with an SRD id is refused; `CONTENT` and `SPELLS` are the same objects as before when no overlay is installed. |
| B5 | **Packs on a table, state and server.** H5 and H6: `state.packs`, migration, `setPacks`, the `pack` message, storage, limits, the export, and the filtered `packs` message. | engine, server | Opus | `engine/dm.js`, `migrate.js`, `tables.js`, `index.js`, `limits.js`, `view.js` (only if the filter lives there), `packages/server/README.md`, `tests` | A DM adds a lint-clean pack and members get the filtered `packs`; a player cannot send `pack`; a pack that fails strict lint changes nothing and the sentences are returned; removing a pack in use is refused with what blocks it; a restart keeps the packs; the export has them; a player's messages hold no homebrew monster text (the hidden-information test). State migrates 20 to 21. |
| B6 | **The dry run.** H7. | engine | Opus | `content/dryrun.js`, `tests` | A seeded dry run of an invented spell twice gives byte-identical output; it touches no state outside its own game; a monster entry fights a pregenerated character for one round and returns the events. |
| B7 | **Pack manager, client.** Upload a file, the review (every entry's reading and tier, counts by tier, the licence text), add, update, remove; the player's side receiving packs. | client | Sonnet | `index.html`, `style.css`, `packmanager.js` (new), `tablecontrols.js`, `transport.js` (message pass-through), `app.js` (install the filtered overlay), `tests` | At both sizes a DM uploads a pack file and sees a reading for each entry; a bad file shows the linter's sentences; a player at the table sees a homebrew spell on a sheet and in the spell list, and no monster. |
| B8 | **Compatibility, homebrew kinds.** H8 and the review rows. | engine, client | Opus then Sonnet | `compat.js`, `reviewchar.js` | A character file naming a homebrew spell the table lacks shows "missing content" with the bundle's reading and the three choices; the same id with another hash shows both readings. |
| B9 | **Builder, spells, slice one.** Basics, target, effect cards for save, attack, damage, heal, condition, the "by hand" card, the live reading and lint, the tier banner; Save to the device library. | client | Sonnet | `homebrew.js` (new), `style.css`, `index.html`, `tests` | At 390 x 844 a person builds "Ember Burst" without typing JSON, sees the reading of Decision 6, sees the banner "The engine plays all of this", and saves; a deliberate error (dice "x") shows the linter's sentence under the field and blocks Save. |
| B10 | **Builder, spells, slice two.** Areas, higher levels, zones and terrain, choices, modifiers; Try it (dry run). | client | Sonnet | `homebrew.js`, `tests` | Every step and field `shapes.js` lists for spells has a control; Try it shows the cast and the average of 200 seeded casts. |
| B11 | **Paste from an AI.** The Copy instructions button, the paste box, lint, reading and the approval of one `hash`; the brief. | client | Sonnet | `homebrew.js`, `aibrief.js` (new), `tests` | A pasted valid entry shows its reading and Approve; changing one character voids the approval; an invalid one lists the linter's sentences; the raw data is behind a fold. |
| B12 | **CLI.** `lint`, `read`, `dryrun`, `schema`. | engine | Sonnet | `scripts/hb.mjs`, `tests` | Each prints plain output and exits nonzero on problems; no dependency. |
| B13 | **Monsters, items, feats, objects: reader and builder.** One kind per pull request. | engine, client | Opus then Sonnet | as above | As B3 and B9 for each kind. |
| B14 | **Stretch: the tool server.** | engine | Sonnet | `scripts/hb-mcp.mjs`, `tests` | A scripted client lists the four tools, calls `lintEntry` and `readEntry`, and gets the CLI's answers. |

B1 to B4 are independent of the client and the server and can run in parallel
after B1's key lists are agreed with B2; B5 needs B1 and B4; B7 needs B5 and
B3; B9 needs B2 and B3; B10 needs B6; B11 needs B3 and B9.

## Security and hidden-information review points

1. **A pack is untrusted input.** Budget first (iterative, bounded), then
   strict lint; a client-side lint is advice. A DM's pack is as untrusted as a
   player's: the DM is trusted with the table, not with the server.
2. **Recursion.** `lintSteps`, `walkSteps` and `effects.js` `walk` recurse.
   The budget's depth limit protects them; a test feeds a depth-bomb to
   `lintPack`, the reader, `schemaOf` validation, `dryRun` and the overlay builder.
3. **Unknown fields.** Strict mode refuses them; without it a field could be
   copied into every creature (`runtimeAction`) and sent to players. A test
   asserts strict mode's key lists cover every SRD entry's keys.
4. **Prototype pollution.** No `__proto__`, `constructor` or `prototype` key in
   any pack; the overlay builder copies into objects made with
   `Object.create(null)` or `Object.hasOwn`-guarded maps.
5. **Shadowing.** The `hb-<pack>-` prefix and the overlay's refusal of an SRD
   id; a test tries to add a pack whose id is `fire-bolt`.
6. **The scoped registry is a hidden global.** Every entry point that reads
   content for a table is wrapped; a test calls the server's `act`, `sync`,
   `history` and `export` paths for two tables with different packs in an
   interleaved order. Anything that reads content *outside* a wrapper sees only
   the SRD, and the failure is a missing id, not another table's entry.
7. **Players and monsters.** Homebrew monsters are never in a message to a
   player: not in `packs`, not in `history`, not in `export` for a player (there
   is none), not in an error sentence. The test greps every message a player
   receives across a fight.
8. **Text is data.** `text`, names and `manual` step text are shown with `esc`
   in the app; none is ever inserted as HTML, a link or an image; control
   characters are refused; the budget caps lengths. A name with `<script>`
   shows as text.
9. **Abuse of hosting.** The public server stores user text. Limits (4 packs
   per table, 256 KB each) bound it; there is no public lint or dry-run
   endpoint (a CPU target); `pack` uploads are in the per-connection message
   bucket and a new per-address limit beside `allowUpload` in `limits.js`.
   Whether the operator wants a take-down path is a question for the owner.
10. **Licence and attribution.** The author's `license` and `attribution` are
    shown, never checked; the repo never receives a pack. A homebrew entry's
    `source` says `homebrew:`, so no part of the app claims it is SRD content.
11. **The AI route.** A model is not trusted: its output goes through the same
    gate; the user approves a reading generated by our code for one `hash`. The
    brief tells a model never to claim an entry is checked. No key, no
    network call and no user text leaves the device from the in-app route.
12. **Dry run isolation.** It runs a throw-away game, with a seed, on a copy; a
    test asserts it does not read or write `hextable.solo` or any table.
13. **Undo.** Adding or removing a pack is not undoable by the DM's undo (it is
    not game state); it is its own message and the DM is told so in the pack
    manager. The state keeps `packs` ids, and an undo that would remove a pack's
    id from the state while the table still has the pack is refused by
    `setPacks` being outside the undo set (`undoable` in `history.js`).
14. **Hidden-information interplay with characters.** A character file's
    `bundle` can reveal a player's homebrew to the DM only; the DM chooses
    whether to add it; no other player is sent it until it is in a pack.

## Risks

- **The scoped registry is a workaround, not a design.** It is the cheapest way
  to give a table its own content without rewriting 200 read sites, and it
  must be removed when content is threaded through `ctx` (Option A of Decision 3).
  Until then every new read of content must sit inside a wrapper.
- **Most homebrew will be `manual` in places.** An author who wants summons
  gets a text for the DM. The tier banner and the reading say so before they
  save; the cure is vocabulary growth, not the builder.
- **`shapes.js` can drift from the linter.** The conformance test against all
  SRD entries and the mutation test catch the common drift; a change to
  `schema.js` that does not touch `shapes.js` fails it.
- **Readings can mislead by omission.** The reader must show every step and
  every number; a golden test per template and the "numbers" list keep it from
  summarising.
- **A pack removes the DM's surprise.** Players are sent spells and items; a DM
  who wants a secret item should not put it in a pack until it is found. The pack
  manager says so.
- **AI briefs go stale.** The test tying the brief's vocabulary list to the
  schema export is the guard.

## Questions for the owner

Only those whose answer changes the design. Each has a default, and work
proceeds on the default.

1. **Who may upload a pack.** *Default: the DM only; a player offers
   homebrew inside a character file's `bundle`, which the DM reads.* The
   alternative is players uploading to the table with DM approval.
2. **Are homebrew monsters hidden from players?** *Default: yes, never
   sent.* The cost is that a player's client cannot show a monster's
   description before it is met.
3. **An in-app model call.** *Default: no; the in-app route is "Copy
   instructions" and "Paste from an AI", and the CLI and a tool server serve
   people who run an AI tool.* The stretch needs a key, a payment path and a
   privacy statement.
4. **Which vocabulary growth comes first** if homebrew and the SRD are to play
   better by the rules: a `summon` step, an Armor Class formula, an "on weapon
   hit" trigger, an ability modifier in damage, or homebrew subclasses?
   *Default: homebrew subclasses of SRD classes first (the most common
   request; an engine change across `derive`, `validate`, `lintClass`, the
   build screen and the importer), then an "on weapon hit" trigger (smites and
   several class features), then an Armor Class formula, then `summon`.*
5. **The limits.** *Default: 4 packs per table, 200 entries and 256 KB per
   pack, 8 KB per entry, 1,500 letters of text.* Say if a bigger table needs
   more.
6. **Hosting user text on the public server.** *Default: allowed, with
   the limits above, plain text only; the DM can remove a pack; no automatic
   moderation.* Do you want a take-down contact in About, and a way for the
   operator to delete a table's packs?
7. **A player's homebrew library on their device ("My homebrew").** *Default:
   yes, local only, like My characters.*
8. **Does a table that uses homebrew say so in the lobby?** A joining player
   sees "this table uses 2 homebrew packs" before approval? *Default: no; the
   player is told after approval, as for the table's settings.*
9. **Schedule.** *Default: build B1 to B6 (the pure functions and the registry)
   in Next after milestone 2, the pack manager and the spell builder next, the
   paste route with them, the tool server and monsters' builder later.*
