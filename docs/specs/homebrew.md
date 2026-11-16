# Spec: homebrew, and a builder an AI can drive

Status: draft by an agent, to be reviewed by the design owner. Issue #237, part B
(the owner's request of 13 November), amended by #278 to agree with the owner's
homebrew answers of 14 November (#237): **strictly the DM adds homebrew**,
homebrew monsters are never sent to players, and AI help stays outside the game
for now. Amended again to the owner's answers of 15 November (#347, issue
#193, the comment "Beej (lead 4), 15 November, 09:45 ET"): a homebrew piece a
travelling character names is **denied by default, but the DM is shown what it
does in plain words and may allow it** (this reopens "homebrew is never taken
from a file"; Decisions 3 and 4 are rewritten); the limits are confirmed, a
take-down contact and a way to delete a table's packs are wanted, there is **no
device library**, and a joining player sees that the table uses homebrew
before approval. Every detail the owner did not state is marked as the lead's
proposal. Nothing here is built. No code is written by this spec.

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
- **The repo stays SRD-only.** Homebrew packs belong to a table (or to the
  device of the person who runs it as DM), never to the repo, and never to
  `content/srd52/`.
- **Strictly the DM adds homebrew.** Players cannot upload homebrew to a table.
  A character file may carry the few pieces its sheet names, but they are held
  outside the table, **denied by default**, read back to the DM in plain words,
  and enter the table only if the DM allows each one (Decision 4; the owner,
  15 November, who replaced his 14 November rule that nothing is taken from a
  file). The DM still decides what the table plays.
- **Never trust a client.** A pack is linted on the server by the same linter
  as the SRD pack, with stricter limits, before it can touch a table. A client
  that lints for its user's convenience proves nothing to the server.
- **The server is authoritative; everything goes through `apply()`.** Adding
  or removing a pack is a message the DM sends; what the pack does in play runs
  in the engine like any content.
- **The engine never pretends.** A homebrew spell the engine cannot fully run
  is `assist` or `manual`, and the table is told in words, as for SRD entries.
- **Players are sent only what their characters can see.** Homebrew monsters
  are never sent to players: their stat blocks stay with the DM, as SRD
  monsters' do (Decision 5).
- **The rules package is pure.** The schema export, the linter, the reader and
  the dry run are plain functions with no I/O, no clock and no `Math.random`;
  the dry run uses a seed.
- **No dependencies, no bundler.** JSON Schema is produced by our own function;
  no validator library is added.
- **No model is called from inside the game.** AI help is outside the app: the
  app hands out instructions to copy into any AI the user already has, takes the
  result pasted back, lints it and shows the reading (Decision 8).
- **No text copied from any rulebook.** The builder, the reader's sentences and
  the examples are written for this project. The project says "5E compatible".
- **Phones are first-class.** The builder is a form that works at 390 x 844.

## Where we are

What exists today, with the file and function so a builder can check.

| Feature | Exists today | Does not exist |
|---|---|---|
| **The vocabulary** | `content/schema.js` exports closed lists: `STEPS` (20; `summon` was added after this was written), `BRANCHES`, `HOOKS`, `OPS`, `TAGS`, `CONDITIONS` (15), `DAMAGE_TYPES` (13), `SCHOOLS`, `CAST_TIMES`, `AREA_SHAPES`, `SIZES`, `SKILLS`, `GRANTS`, `REACTION_TRIGGERS`, `OBJECT_KINDS`, `TIERS`. | A single declarative description of each entry kind. The shape of a spell, monster or item lives in the code of `lintSpell`, `lintMonster`, `lintItem` and so on, which are not exported (only `lintPack`, `lintRecord`, `lintMultiattack`, `coverage` are). |
| **The linter** | `lintPack({ pack, spells, monsters, pregens, conditions, objects, classes, weapons, armour, feats, items, multiclass, advancement })` returns plain-sentence problems like `spells/fire-bolt: damage "x" is not dice like 2d6+3`. It refuses functions anywhere in an entry (`findFunction`) and cross-checks ids (a class's spells must be in the pack). | Limits on size, count or depth. `lintSteps` and `walkSteps` recurse through `onHit`/`onFail`/... without a depth limit, so a deeply nested entry is a stack-overflow risk. Most kinds accept **unknown extra fields** (only `lintItem` and `lintFeatDef` check their key list); the monster action copy `runtimeAction` in `content/index.js` `structuredClone`s everything but `text` into every creature. A pack from a stranger needs a strict mode. |
| **How packs load** | `content/index.js` imports each file of `srd52/` statically, builds `PACKS` (one pack), and builds the lookups `CONTENT`, `SPELLS` (`spellProfile`), `MONSTERS` (`legacyMonster`), `MONSTER_ACTIONS` and `PREGENS` **once, at import**, as plain objects. About 130 places read `CONTENT`, 53 read `SPELLS`, 23 `MONSTERS` (`rules`, `client` and `server`). | A table-specific content set. A second pack cannot be added without editing the file; there is nothing that loads data at run time. |
| **How a spell runs** | `effects.js`: `spellProfile(def)` (aim, kinds, harmful, area, count), `spellKinds(def)` (damage, healing, control, utility: a spell's own optional `kinds` field when it has one, else read from its steps; table-ui.md, E12 amended, #374), `run` executes the steps on a stack kept in the game state. A cast goes through `casting.js`. | Reading a spell back in words. `spellProfile` makes a UI profile, not a description. |
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
a DM's map actions already may be 1 MB). **Players cannot upload homebrew to
a table.** A character file can carry the pieces its sheet names, but those wait
in the DM's review, denied unless the DM allows them (Decision 4); they are not
a `pack` message, and a player never sends one. A player who wants a piece that
is not in a file hands it to the DM outside the app. The server refuses a `pack`
message from any sender who is not the table's DM.

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

**Operator controls** (the owner, 15 November: allowed within the limits, plus a
take-down contact and a way to delete a table's packs; the forms are the lead's
proposal). The About screen shows a contact address for take-down requests, set
by the operator in `HEXTABLE_CONTACT` (an environment setting like
`TRUSTED_KEYS`; unset, About says there is none). The operator can delete a
table's packs from the server's command line (`node packages/server/ops.js
packs delete <code> [<pack id>]`, the lead's proposal for the name), which
removes them from `table.packs`, writes `state.packs` through `setPacks` the next
time the DM connects, and reports what the table lost. The usual "in use" check
(above) is for the DM; the operator's delete is not blocked by it, and the table
is told in words ("The host removed a pack: 3 spells; creatures made from it
keep their own copies"). Nothing is deleted by itself.

**Cost.** One new module (`registry.js`), a state version, a message pair, a
server record. The overlay is a hidden global during a call: it is safe only
because `apply` and the view functions are synchronous and the wrapper cannot be
skipped. A test asserts that two tables with different packs, called in turn,
never see each other's ids, and that a throw inside `apply` leaves the SRD
lookups as they were. The rules package stays pure: `using` mutates a registry
of derived lookups, not game state, and gives the same results for the same
inputs.

### Decision 4: homebrew in the compatibility report of the portable-characters spec

**Amended 15 November 2026.** The owner's answer to question 1: *"The second
half is not confirmed. A homebrew piece a travelling character names is denied
by default, but the DM is shown a generated plain-language description of the
piece and may allow it."* The 14 November rule "homebrew is never taken from a
file" is therefore replaced. What stays: a file never puts anything into a
table by itself, and only the DM adds to the table. What changes: a file may
carry the pieces its sheet names, so the DM has something to read and allow.
Every detail below that the owner did not state is **the lead's proposal**,
for him to confirm.

A character file (`portable-characters.md`) lists in `needs.homebrew` the
`{ id, pack, hash }` of every homebrew entry its sheet names, so a table can say
what it lacks. **It may also carry `homebrew.bundle`: the entries themselves,
only the ones the sheet names** (design choice, lead's proposal: spells, magic
items, feats, weapons and armour only; never monsters, objects or whole packs;
at most 12 entries and 24 KB, inside the file's 96 KB limit). The bundle is
unsigned like the sheet: the signed history does not vouch for it, and the file
does not cover it with trust.

**What the server does with a bundle** (the lead's proposal). When a player
offers a character, for each bundle entry: size and depth budget first
(Decision 2), then strict lint (`lintEntry`), then it recomputes the SHA-256 of
the canonical JSON and compares it with the `hash` in `needs.homebrew`. An
entry that fails any step is **refused for the review**: it is not stored, the
DM is told "refused: <the linter's sentence>" and the piece is treated as
absent. Nothing from the bundle enters `table.packs`, `state.packs`, the
overlay or any message to another player. The checked entries wait, in memory,
with the pending member's review result, and are dropped when the member leaves,
is declined or is admitted.

**What the DM is shown** (the lead's proposal). For each piece that is not
already in the table's packs, the DM's review shows the **reading** of Decision 6,
generated by `readEntry` from the entry *after* it has passed the gate, with the
tier banner ("The engine plays all of this" or "You apply this by hand"), the
numbers list, and what the piece would be (a spell of level 3, a magic item).
**The reading is generated from the linted data and from nothing else.** Free
text in the file, the entry's `text`, its name and any `manual` step text appear
only beside the reading, in quotation marks, labelled "the author's words,
not checked", shown with `esc`, and never in the reading's own sentences; the
numbers in the reading come from the data fields, so an entry that says
"harmless" in its text but deals 10d10 reads as 10d10. Each piece has a choice,
**Deny** (the default, pre-selected, the same as doing nothing) or **Allow**. A
DM must choose Allow on each piece; there is no "allow all".

**What Allow does** (the lead's proposal). Allowing is a DM action through the
same route as a `pack` message: the server adds the piece to a **guest pack**,
a table pack with the pack id the entry names, marked `origin: character` (a
name for the DM, never an identity), counted against the table's limits of
Decision 2 like any pack. From then it is a table pack in every respect:
`state.packs`, the filtered `packs` message of Decision 5 (not monsters), and the
DM can update or remove it. If the DM's own pack already holds that id: with the
same hash nothing happens; with a different hash Allow is not offered, "the
table's version plays". If a limit would be passed, Allow is off with the
sentence of the limit. The character then plays with the piece.

The report's kinds, for homebrew:

- **Table has it, same id and hash** (a table pack holds a matching entry):
  nothing to say. It plays.
- **Table has the id with a different hash:** "a different thing with the same
  name": the DM sees the table's entry's reading, and the table's version is the
  one that plays; the DM accepts that or refuses.
- **Table lacks it:** the report shows the piece as **"not in this table's
  rules"** with its reading when the file carried it and it passed the gate, and
  the choice **Deny** (default) or **Allow**. Deny leaves the character
  accepted without the piece (taken off the playing copy and written to
  `parked`, as the Fantasy Grounds importer leaves things off), or replaced
  with a stand-in under the stand-in rules of `portable-characters.md`, or the
  DM refuses the character. A file with no bundle, or an entry the gate refused,
  can only be denied: a DM who wants that piece adds it to their own pack
  outside the review (Decision 3) and the player offers again.

**Security review points** for this reopened decision (they are also review
points 14 and 15 below):

1. *A hostile file.* The bundle is untrusted input in the same class as a `pack`
   message from a stranger: the size cap, the budget, strict lint and the hash
   check run before anything is read back, on every entry, on the server. A
   bundle with a depth bomb, a function, an unknown key, a `__proto__` key, an
   SRD id or an id without its pack prefix is refused for that entry, in
   bounded time.
2. *The linter is the gate, not the reading.* The reading is only ever built
   from an entry the gate passed. An entry that fails lint has no reading, and
   Allow is not offered for it.
3. *The description is generated, never copied.* The DM's reading comes from
   `readEntry`'s templates over the data. Text in the file reaches the DM only as
   labelled, escaped, length-capped author text beside it.
4. *Limits.* 12 entries and 24 KB per file (the lead's proposal) are far below
   a pack's; the existing offer limits stay (96 KB, one offer per ten seconds, a
   table whose `characters` is `new` refuses offers). The review result holds
   the readings, not the entries, once checked; the checked entries are kept only
   until the offer ends.
5. *Nothing is added without a DM click on that piece.* No setting allows pieces
   automatically; a DM who is absent leaves the member pending.
6. *Hidden information.* The reading goes to the DM only. The offering player
   sees their own report; no other player sees a denied piece or the bundle. An
   allowed piece is sent as any table pack's entries are (Decision 5), and never
   a monster, because monsters cannot be in a bundle.

**Cost.** One optional field in the file format (`homebrew.bundle`), one report
kind with a reading, a DM choice per piece, and the guest-pack path in B5. It
touches `compat.js` and the review screen of the portable-characters spec and
needs `readEntry` (B3) and the gate (B1) first: until they exist the report shows
ids and hashes only, as in the 14 November design, and every piece is denied.

### Decision 5: what players are sent of a pack

A table's homebrew is the DM's secret in part. The rule: **a player is sent
what their character needs to play, never what it does not.**

- **Sent to every approved member:** the pack's id, name and version, and
  its spells, items, feats, weapons, armour, objects. These are needed to show
  a spell list, a magic item on a sheet and a door's states, and are no more
  secret than the SRD's.
- **Never sent:** monsters (the owner's decision, 14 November). The client draws a creature from the view's
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

**A joining player is told before approval** (the owner, 15 November, question 8:
yes). The lobby shows a player who has asked to join, before the DM approves them,
a line "This table uses homebrew: 2 packs" (design choice, lead's proposal: the
count of packs and nothing of their content, so no spell, item or monster name
is sent to someone not yet approved). The server adds the count to the join
reply it already sends a pending member. A character that would lose homebrew is
told so in its own compatibility report as before.

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
required, which step or branch may nest; a spell's optional `kinds`, a list from
`SPELL_KINDS`, is one such field) and `schemaOf` and the strict key
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

**Choice.** A client screen, `homebrew.js`, for the person running the table as DM, in the
table settings. **There is no device library** (the owner, 15 November,
question 7: "no device library"; his note: "This could be a setting. If not by
device, rather by session, then a way to group homebrew rules would be nice.").
What the builder makes is saved into one of the table's own packs, and a pack is
the group. **The lead's reading, for the owner to confirm:** (a) homebrew
belongs to a table, not to a device: in solo it is stored with the saved solo
game (the session), not under a device-wide key; (b) a pack is the way to group
homebrew rules, and the DM can switch a pack **off** for the table without
deleting it (a flag `enabled` in `table.packs`; the engine sees a disabled pack
as absent, so it is refused while anything uses it, as removal is); (c) a table
setting **Homebrew: on/off** (off by default, on when the first pack is added)
is the "setting" the owner mentions, a gate over all packs; (d) to reuse a pack
at another table the DM downloads it as a file and adds it there, as the
`pack` message already allows; the app keeps no copy of its own. If he meant
something else (a per-device list after all, or a grouping finer than a pack),
only (b) to (d) change. Players do not get the builder: a player has no way to
add homebrew to a table (Decision 3), and the portable character screens offer
SRD content only. It builds one entry at a time. For a **spell** (the first target; monsters and items
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
   table** uploads the pack through Decision 3 (the DM only).

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

1. The user (the DM) describes the entry in words, in an AI tool of their own,
   outside the game.
2. The model **reads the schema** (`schemaOf`), writes an entry, and **calls
   `lintEntry`**; on problems it reads the plain sentences and fixes the entry,
   repeating until the linter is silent (the model's loop, not the user's).
3. The model calls **`readEntry`** and shows **the reading** to the user,
   with the original request beside it.
4. **The user approves the reading.** The raw data is behind an "Advanced:
   show data" fold and is not what the button says. The approval is for one
   `hash`: if the entry changes by one character the reading is regenerated and
   the approval is void.
5. The approved entry goes into the DM's pack on their device, and to the table
   through Decision 3, where the server lints it again.

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
| **Inside the app, a model call** | A "Describe it" box that sends the user's words to a model service. This needs a key, a network call from the browser, a privacy statement (the user's text leaves the device), and a place to pay; none exists. | **Not planned: the owner's decision is that AI help stays outside the game for now.** A built-in assistant remains a possible later offering of the official server (`portable-characters.md`, Decision 8) and needs its own spec |

**The in-app route is the only one the app has.** "Paste from an AI" needs no
key and calls no model: the screen shows a
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
| In-app model call | Not planned (outside the game for now) | Keys, privacy, cost; a later offering of the official server, if ever |
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
| H5 | `state.packs` and the action `setPacks` | state, action | DM (the server composes it) | `engine/dm.js`, `migrate.js`, `tests` | 23 to 24 (corrected in #380: the state was at 23 when this was read) |
| H6 | Message `pack` (add, update, remove; DM only), the table record, the filtered view `packs`, the export, limits | server | DM | `tables.js`, `index.js`, `limits.js`, `packages/server/README.md`, `view.js` (nothing for players but the filtered message) | no |
| H7 | `dryRun` | rules | n/a | `content/dryrun.js` (new), `tests` | no |
| H8 | Compatibility kinds for homebrew: ids and hashes, and for a bundled piece that passes the gate its reading and the DM's Allow or Deny; nothing enters the table without the DM's Allow | rules | DM (Allow) | `compat.js` (portable-characters P2) | no |
| H9 | Guest packs (`origin: character`), pack `enabled` flag, the join reply's homebrew count, the operator's `HEXTABLE_CONTACT` and pack delete | server | DM; operator | `tables.js`, `index.js`, `ops` script, `packages/server/README.md`, `client` About | no (the `enabled` flag is in `table.packs`, not the state) |

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
| B5 | **Packs on a table, state and server.** H5 and H6: `state.packs`, migration, `setPacks`, the `pack` message, storage, limits, the export, and the filtered `packs` message. | engine, server | Opus | `engine/dm.js`, `migrate.js`, `tables.js`, `index.js`, `limits.js`, `view.js` (only if the filter lives there), `packages/server/README.md`, `tests` | A DM adds a lint-clean pack and members get the filtered `packs`; a player cannot send `pack`, and a guest pack is added only by the DM's Allow; a pack that fails strict lint changes nothing and the sentences are returned; removing a pack in use is refused with what blocks it; a restart keeps the packs; the export has them; a player's messages hold no homebrew monster text (the hidden-information test). State migrates 23 to 24. |
| B6 | **The dry run.** H7. | engine | Opus | `content/dryrun.js`, `tests` | A seeded dry run of an invented spell twice gives byte-identical output; it touches no state outside its own game; a monster entry fights a pregenerated character for one round and returns the events. |
| B7 | **Pack manager, client.** For the DM only: upload a file, the review (every entry's reading and tier, counts by tier, the licence text), add, update, remove; the player's side receiving packs. | client | Sonnet | `index.html`, `style.css`, `packmanager.js` (new), `tablecontrols.js`, `transport.js` (message pass-through), `app.js` (install the filtered overlay), `tests` | At both sizes a DM uploads a pack file and sees a reading for each entry; a bad file shows the linter's sentences; a player at the table sees a homebrew spell on a sheet and in the spell list, and no monster. |
| B8 | **Compatibility, homebrew kinds.** H8 and the review rows; needs B1, B3 and B5. | engine, client | Opus then Sonnet | `compat.js`, `reviewchar.js` | A character file naming a homebrew spell the table lacks shows "not in this table's rules" with its reading and Deny pre-selected; with Deny the character is accepted without it, stands in or is refused, and nothing is added to the table; with Allow the piece enters as a guest pack and plays; a bundle entry that fails the gate (depth bomb, function, unknown key, bad hash, SRD id) has no reading and no Allow; the same id with another hash shows the table's reading and says the table's version plays; a matching id and hash shows nothing; a bundle of 13 entries or over 24 KB, or one holding a monster, is refused. |
| B15 | **Operator controls and the lobby line.** H9: take-down contact in About, the operator's pack delete, the pack `enabled` flag, the table's Homebrew setting, and "This table uses homebrew: N packs" before approval. | server, client | Opus then Sonnet | `tables.js`, `index.js`, `ops` script, `packages/server/README.md`, `index.html`, `lobby` screens, `tests` | A pending member's join reply holds the pack count and no name; the operator's delete removes the packs and the table is told; a disabled pack is absent to the engine; About shows the contact or says there is none. |
| B9 | **Builder, spells, slice one.** Basics, target, effect cards for save, attack, damage, heal, condition, the "by hand" card, the live reading and lint, the tier banner; Save to a pack of the table (a new one is offered). | client | Sonnet | `homebrew.js` (new), `style.css`, `index.html`, `tests` | At 390 x 844 a person builds "Ember Burst" without typing JSON, sees the reading of Decision 6, sees the banner "The engine plays all of this", and saves; a deliberate error (dice "x") shows the linter's sentence under the field and blocks Save. |
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
   The owner wants a take-down contact in About and a way for the operator to
   delete a table's packs (Decision 3, Operator controls).
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
14. **Characters and homebrew (amended 15 November).** A character file may carry
    a `homebrew.bundle` of at most 12 entries and 24 KB, and it is hostile input.
    Each entry goes through the budget, strict lint and the hash check before
    anything is read; failing entries are absent, with the linter's sentence for
    the DM. A test offers files with a depth bomb, a function, a `__proto__` key,
    an SRD id, a wrong hash, a monster, 13 entries and 25 KB, and asserts each is
    refused in bounded time and that nothing of any of them enters a pack, the
    state, the overlay or any message to another player. A `pack` message from a
    player is refused.
15. **The DM's reading is generated from linted data.** `readEntry` is called only
    on an entry the gate passed, and its sentences and numbers come from the
    data, never from free text in the file; free text appears only beside the
    reading, labelled, escaped and capped. A test gives an entry whose `text` says
    "harmless" and whose damage is 10d10, and asserts the reading says 10d10 and
    does not say "harmless" in its own sentences. Allow is a DM action on one
    piece; with no DM answer the default is Deny and the character plays without
    it. Denied pieces and bundles never reach another player, and an allowed
    piece reaches players as any pack's entries do (never a monster).
16. **The join reply.** A pending member is told the number of packs and
    nothing of their content; a test asserts no entry id, name or text is in
    anything sent to a member who is not yet approved.

## Build notes: B4, the registry (#379)

What was settled while building `content/registry.js`:

- **In place, as `docs/PATH-TO-0.2.md` recommends.** `using(overlay, fn)` adds the overlay's ids into the same
  objects every read site uses and deletes them in a `finally`. Which objects, and how each value is made from an
  entry, is one list in `content/index.js`, `HOMEBREW_LOOKUPS` (spells: `CONTENT.spells`, `SPELLS`; monsters:
  `CONTENT.monsters`, `MONSTERS`, `MONSTER_ACTIONS`; items, feats, objects, weapons, armour: `CONTENT.<kind>`).
  A test fails on an export of `index.js` keyed by a kind's ids that the list misses.
- **`loadPack(data)`** takes the JSON text or object of Decision 1 (`format: 'hextable-pack'`, `v: 1`, the seven
  kinds and nothing else), bounds it, copies it (`structuredClone`, so no getter or function survives), lints the
  copy, checks every id is `hb-<pack id>-<kebab>` and no entry claims `checked: true`, freezes it and builds its
  lookups once (spell profiles included). It returns `{ ok, pack }` or `{ ok: false, problems }`. The caller keeps
  the loaded pack (one per pack and hash), so lint and profiles are not redone per call. B1's budget and strict lint
  plug into one marked seam.
- **`overlayOf(packs)`** sorts packs by id (two callers holding the same packs in another order build the same key
  order, so replays agree) and throws `PackError` on a pack twice or an id already in the lookups.
- **Nesting:** the same overlay again is a no-op; a different overlay while one is installed is refused.
  **Async:** an async or generator `fn` is refused before it runs; a returned promise is refused after the ids are
  taken out. A key written into a lookup during the call is reported.
- **Caches.** Every module-level cache in the rules package was read. Keyed by state or map objects and holding
  nothing from content: `space.js` `regionIndex`, `grid.js` `offsets`, `world.js` `ROUTES`, vision.js `sets`. Built
  from content once at load, SRD only for ever (an overlay is never installed while a module loads, since `using` is
  synchronous and module evaluation is not): the six name maps of `import-fgxml.js`. **Poisonable:** `walls.js`
  `barriers` and the caches keyed on its signature (DEBT P31): an answer from outside the overlay is given back
  inside it. A test pins it.
- **Load-time reads:** `content-reads.test.js` scans the rules, client and server code and fails on a new line that
  reads `CONTENT`, `SPELLS`, `MONSTERS`, `MONSTER_ACTIONS` or `PREGENS` outside any function; the eight known lines
  are listed.

## Build notes: B1, the budget, strict mode and `lintEntry` (#380)

What was settled while building it (`content/schema.js`, the end of the file; tests in
`packages/rules/test/homebrew-lint.test.js`):

- **`budget(doc, limits?)`** is one walk with its own stack. It counts the UTF-8 bytes of the document as
  `JSON.stringify` would write them (exact: a test holds it to `JSON.stringify` for all 836 SRD entries of the seven
  kinds), stops descending at the first container past the depth limit, and stops walking once the pack is over its
  bytes, so its time is bounded by the limits whatever the input (a 10,000-deep `onHit`, 100,000 nested lists, a cycle,
  a list of a million strings). It also refuses what is not plain data (a function, a bigint, a `Date`, an object with
  another prototype, a number JSON cannot hold), the keys `__proto__`, `constructor` and `prototype`, and control
  characters (C0 but tab and new line, DEL, C1) in any string or key. Which limit a string has goes by its key: `name`
  60 letters, `text` and a `manual` step's text 1,500, every other string and every key 200. Letters are code points.
  Step depth counts the lists under `effects` and the seven branches; steps per entry count every step in them.
  The depth of the whole document counts the document as level 1, a kind's list 2, an entry 3.
- **`HOMEBREW_LIMITS`** holds the owner's numbers. `budgetTable(packs)` checks the 4 packs a table may have (for B5);
  `budgetEntry(kind, entry)` measures one entry as it sits in a pack (for `lintEntry` and B8's bundles). "Numbers: whole
  numbers in the ranges the linter already uses" stays the linter's: the budget adds no number limit of its own.
  The SRD's largest entry is 4,648 bytes (the vampire), its longest text 1,361 letters, its longest name 41 letters,
  its longest other string 82, its most steps in one entry 14, its deepest steps 3 and its deepest entry 12 levels.
- **Strict mode** is `lintPack(doc, { strict: true, srd? })` and `lintEntry(kind, entry, { pack, srd? })` (strict by
  default). It runs the budget first and returns only its sentences if it fails; then the kind's own linter; then the
  closed key lists (`SHAPES` and `STEP_KEYS`: every object of an entry, each step by its kind, a step's branches, the
  modifiers, targets and steps found inside grants); then the homebrew rules: an id `hb-<pack id>-<kebab>` (an id that
  is an SRD id is named as one when `srd` is given), `source: "homebrew:<pack id>"` (Decision 1; the issue did not
  list it, the spec does), `checked: false`; and the pack document's own keys and header. A few fields the SRD linter
  leaves unchecked because the SRD's are known good get a value check in strict mode only: a save's `half`, a move's
  `largest`, an area's `height`, a monster's `hover`, equipment's `weight`, `cost`, `ammo` and
  `twoHandedUnlessMounted`. `lintPack(doc, { keys: true })` is the key lists alone: the SRD pack passes it, and a test
  runs every SRD entry of the seven kinds through it, so the lists are never stricter than the vocabulary. B2's
  `shapes.js` should take these lists over (Decision 6) rather than write new ones.
- **`lintEntry`** checks one entry only; what `lintPack` checks across a pack (duplicate ids, what a summon step names,
  a class's spells) is not done for one entry. For items, `ctx.weapons`, `ctx.armour` and `ctx.spells` give the ids it
  may name; left out, any id is taken (as `lintPack` does today for an item linted with no pack). The other kinds
  (classes, summons, conditions) can be linted with `strict: false`; strict, they are refused as not homebrew.
- **The registry's seam** (part C of #380) now calls `budget` and `lintPack(..., { strict: true, srd })`, with the SRD
  ids read from `HOMEBREW_LOOKUPS`; the interim guard is gone. A pack sent as JSON text is parsed before the budget
  sees it (V8's `JSON.parse` takes 50,000-deep text without overflowing; a test feeds it); its length is bounded by
  the server's message limit, which B5 must keep at or under `HOMEBREW_LIMITS.packBytes` plus a margin.
- **The cache of `barriers(map)`** (part B, DEBT P31): its signature now holds a number for each def object (none
  outside an overlay), so no cached answer crosses an overlay or outlives a changed def. B5 and B7 no longer need to
  avoid reading a map outside its overlay for the caches' sake.

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
- **Reopening "never from a file" widens what a stranger's file can ask of the
  server.** The bundle is a new place for hostile data to enter. The gate is the
  same as for a pack, the caps are small, nothing is stored before the DM's
  Allow, and the default is Deny; the cost is the review's reading work (B3) and
  the guest-pack path (B5, B8). Until the gate and the reader exist, every piece
  is denied.
- **A reading is only as honest as its templates.** The DM may allow something
  because of a sentence we wrote. The numbers list and golden tests are the
  guard, as for the builder.
- **A pack removes the DM's surprise.** Players are sent spells and items; a DM
  who wants a secret item should not put it in a pack until it is found. The pack
  manager says so.
- **AI briefs go stale.** The test tying the brief's vocabulary list to the
  schema export is the guard.

## Questions for the owner

Questions 1 to 3 were settled by the owner's answers of 14 November (#237);
the second half of question 1 was reopened on 15 November. Questions 4 to 9 were
answered on 15 November (the comment "Beej (lead 4), 15 November, 09:45 ET").

1. *Who adds homebrew.* **Strictly the DM.** Players cannot upload homebrew to a
   table. (14 November.)
   *Answered 15 November 2026, second half:* "not confirmed". A homebrew piece a
   travelling character names is **denied by default, but the DM is shown a
   generated plain-language description of the piece and may allow it.**
   *What changed:* the rule "homebrew is never taken from a file" (Rules that
   bind this design, Decisions 3 and 4) is replaced. A file may carry a
   `homebrew.bundle` of the entries its sheet names; the server gates it as it
   gates a pack; the DM reads each piece and chooses Deny (the default) or Allow;
   Allow adds a guest pack. The caps (12 entries, 24 KB), the kinds allowed (no
   monsters), the guest pack and the reading's rules are **the lead's
   proposal**, for the owner to confirm. The security review points are
   Decision 4 and review points 14 and 15; `portable-characters.md` is amended
   to match.
2. *Homebrew monsters hidden from players.* **Yes, never sent.** (Decision 5.)
3. *An in-app model call.* **No. AI help stays outside the game for now:** the
   app gives instructions to copy into any AI the user already has, the result is
   pasted back, the app lints it and shows the plain-language reading. A built-in
   assistant remains a possible later offering of the official server.
   (Decision 8.)
4. **Which vocabulary growth comes first.** *Answered 15 November 2026: the
   default stands.* Homebrew subclasses of SRD classes first, then an "on weapon
   hit" trigger, then an Armor Class formula, then `summon`. His note: "how do
   we get more of this going in parallel?" *What changed:* nothing in the order.
   **The lead's proposal on parallel work:** the four are independent engine
   jobs in different modules, so they can run as four lanes at once if each has
   its own spec amendment first. Subclasses touch `derive`, `validate`,
   `lintClass` and the build screen; the weapon-hit trigger touches `effects.js`
   hooks and `attacks.js`; the AC formula touches `modifiers.js` and `derive`;
   `summon` touches `effects.js` and `world.js`. They collide in `schema.js`
   (each adds to a closed list) and in `shapes.js`, so each lane adds only its
   own entries and a fifth, small job owns the merge order of those two files. The
   builder and reader jobs (B1 to B4, B9 to B11) already run in parallel to all
   four. None is scheduled by this spec.
5. **The limits.** *Answered 15 November 2026: the default stands.* 4 packs per
   table, 200 entries and 256 KB per pack, 8 KB per entry, 1,500 letters of text.
   *What changed:* nothing. A guest pack counts against the 4 (Decision 4).
6. **Hosting user text on the public server.** *Answered 15 November 2026:
   allowed within the limits, plus a take-down contact in About and a way for the
   operator to delete a table's packs.* *What changed:* Decision 3 gains
   "Operator controls", H9 and B15, and review point 9. The setting name and the
   delete command are the lead's proposal.
7. **A device library of homebrew.** *Answered 15 November 2026: no device
   library.* His note: "This could be a setting. If not by device, rather by
   session, then a way to group homebrew rules would be nice." *What changed:*
   Decision 7 and B9: nothing is saved on the device; what the builder makes goes
   into a pack of the table. **The lead's reading, for the owner to confirm:**
   homebrew belongs to a table (to the saved game in solo); a pack is the group;
   a pack can be switched off for a table; a table setting turns homebrew on or
   off; a pack is carried to another table as a downloaded file. If he meant
   otherwise, only the grouping and setting parts change.
8. **Does a table that uses homebrew say so in the lobby?** *Answered 15 November
   2026: yes.* A joining player sees that the table uses homebrew before
   approval. *What changed:* Decision 5 and B15. "This table uses homebrew: N
   packs", a count only, is the lead's proposal.
9. **Schedule.** *Answered 15 November 2026: the default stands.* Build B1 to B6
   (the pure functions and the registry) in Next after milestone 2, the pack
   manager and the spell builder next, the paste route with them, the tool server
   and monsters' builder later. *What changed:* nothing. B8 (compatibility) now
   needs B1, B3 and B5 because of the reading, and B15 sits with B7.

## Adventure modules

A DM may also add their own pack inside their adventure module, through the same gate and limits: see [adventure-module.md](adventure-module.md) (Decision 3).
