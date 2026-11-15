# Spec: adventure modules

Status: draft by an agent, to be reviewed by the design owner. Issue #322. Nothing
here is built. No code is written by this spec.

The owner asked for **a module format that makes it simple to host an adventure**.
The DM prepares an adventure once, privately, and loads it into a solo table or a
multiplayer table in one step and runs it; the same module can be run again, by the
same DM with another group or by another DM. Players never receive the module; they
receive what the party has seen, through views, as today.

The pieces already exist, separately: map documents (map format 2, the editor, the
Universal VTT import), handouts, private notes and scenes (state), the market pack
(`shops.md`), the atlas, routes and encounter tables (`travel.md`), homebrew packs
(`homebrew.md`), the admission step and the adventure's character level
(`portable-characters.md` Decision 8). Nothing wraps them. This spec says what the
wrapper is, how it is checked, how it reaches a table, what stays in the file and
what becomes the table's progress, how one is made, what may and may not be in one,
and how a hostile file is stopped. It ends with a worked example, a staged build
plan and the questions for the owner, each with the default work proceeds on.

Style follows `shops.md` and `travel.md`.

## Words used here

| Word | Means |
|---|---|
| **Module** | The DM's prepared adventure: one file, `*.hextable-adventure.json`. Read-only once made. Never sent to a player. |
| **Table** | A game in play: a server table (code, members, state) or the solo game in a browser. |
| **Progress** | What happened at a table: its state (and undo history). Made by play, never written into the module. |
| **Adventure** (service sense) | An official run of a table on the official server, with an `aid` (`docs/service/INTERFACE.md` I7). A module is not an `aid`; a table started from a module may become one. |

## Rules that bind this design

- **Everything goes through `apply()`.** A module changes nothing by being read. A
  table started from a module is a new game state built by a pure function, as
  `newGame` builds the valley today; everything after that is an action. What the
  DM's screen does with the module in play (open a prepared scene, show a handout,
  stage an encounter, load the next map) is the DM sending actions that exist, or
  one new one (`stage`), each checked by `apply()` with the DM's role and its usual
  limits.
- **The server is authoritative.** The server lints a module itself before it
  starts a table from it; a lint in the DM's browser is advice. A DM is trusted with
  the table, not with the server (`homebrew.md` review point 1).
- **The rules package is pure.** The format, the budget, the linter, the migration
  and the start are plain functions with no I/O, no clock and no `Math.random`. The
  start takes the table's seed. Hashing is done by the caller (Node's `crypto` on the
  server, `crypto.subtle` in the browser) over a canonical string the rules package
  makes.
- **A rejected action changes nothing; a refused file changes nothing.** The import
  dialog shows what was read before anything changes, as the Universal VTT and
  character-file imports do.
- **The engine never pretends.** A module section this build cannot use is named in
  the compatibility report, never dropped quietly. Monsters and spells at `assist` or
  `manual` tier are listed as such.
- **Content is data.** A module holds no code, no functions, no scripts, no
  expressions, and no rules content of its own beyond a reference to (or an embedded
  copy of) the DM's homebrew pack, which goes through the homebrew gate unchanged.
- **Only SRD 5.2.1 content in the repo.** The repo ships the format, the tools and
  invented, SRD-only example modules. A DM's private module may hold their own or
  purchased material; it never enters the repo.
- **Players are sent only what their characters could know**
  (`hidden-information.md`). Nothing new reaches a player except by allow list.
- **Plain JavaScript, no dependencies, no bundler.**
- **Phones are first-class.** The import dialog and the DM's module panel work at
  390 x 844 with touch.

## Where we are

What exists today, with the file and function so a builder can check.

| Piece | Exists today | Specified, not built | Missing |
|---|---|---|---|
| **Maps** | Map format 2 (`map.js`: `MAP_FORMAT`, `migrateMap`, `lintMap`, `MAP_LIMITS` 40 levels, 20,000 tiles, 5,000 walls, 2,000 objects, 500 regions); levels with `light` (`AMBIENT`), regions, objects and traps, doors, `starts`; the editor; Universal VTT import (`import-uvtt.js`, refused over 64 million characters). `loadMap` (DM, up to 1 MB: `MAP_ACTIONS` in `tables.js`). | Entries on maps and arrivals at one (`travel.md` W1). | A bundle of several maps. |
| **Pictures** | Assets (M9): DM-only upload, `POST /assets/<code>`, type by the bytes (`sniff`: PNG, JPEG, WebP), 5 MB a file, 50 MB and 200 files a table, 2 GiB a server (`limits.js`); served to a player only when their view names it. Solo: IndexedDB, 2 MB a file, 20 MB, 50 files (`SOLO_LIMITS` in `client/assets.js`). Table export (#83) carries files as base64, up to 24 MB (`EXPORT_ASSET_BYTES`). | — | A file that carries pictures for a whole adventure. |
| **Handouts, notes, scenes** | `state.handouts` (`handouts.js`, 200 at most, text 2,000); `note`; `state.scene`, one at a time, prepared or open (`scenes.js`, notes 2,000, 20 present); the scene screen. | — | Many prepared scenes, read-aloud text, DM notes tied to a room. |
| **Creatures** | `spawn { monster, at, name?, hidden? }` (DM), hidden until found; `side` is `party`, `foe` or `object`. | — | A group placed together, with tactics notes; a friendly creature on the map. |
| **Settings** | `SETTINGS` in `engine/dm.js`: `sight`, `diagonals`, `squareRange`, `areaFill`, `autoEngage`, `passiveFind`, `vertical`, `climbing`, `cover`, `creatureCover`, `squareCover`, `engageRange`, `unseenTurns`, `diceThrow`, `pace`, `conclusion`, `xpShare`, `away`, `breaks`. | `characters`, `level`, `takeaway` (`portable-characters.md` Decision 5). | A preset that comes with an adventure. |
| **Market** | — | Market pack and shops (`shops.md` P1 to P7). | — |
| **Atlas** | — | World pack, nodes, routes, encounter tables, parking (`travel.md` W1 to W9). | — |
| **Homebrew** | — | Homebrew packs per table, DM only (`homebrew.md` B1 to B14). | — |
| **Admission** | `newGame(seed, { party })` with 1 to 6 starters or sheets (#308); My characters (`hextable.characters`). | Offer, review, admit, the level meter, forks (`portable-characters.md` P1 to P8). | — |
| **Starting a game** | `newGame` in `scenario.js` (the valley, hexes or squares); the server's `host`; solo `reset`. | — | Starting from anything but the valley. |
| **State version** | 23 (`migrate.js`). | — | — |

## The ten decisions

### Decision 1: the container is one JSON file, with pictures inside or listed

**Question.** One JSON file, or an archive (a zip) holding a manifest and the
pictures beside it? And how is it versioned?

**Options.**

- A. **A zip** with `adventure.json` and `assets/…`. Pictures stay binary (no base64
  growth); familiar to authors. But the project has no zip reader and may not add a
  dependency, so it would write one: the central directory, local headers, names,
  sizes, and DEFLATE through `DecompressionStream` in the browser and `zlib` on the
  server. That is a new parser of a binary archive at the place the server takes
  files from strangers, with the archive's classic attacks to defend (names with
  `../`, absolute paths, duplicate names, links, sizes that lie, a small file that
  inflates to gigabytes).
- B. **One JSON file, pictures embedded as base64 in an `assets` table.** Every
  document the project reads already works this way: the table export (#83), the
  market pack (`shops.md` Decision 1), the world pack (`travel.md` Decision 2). One
  parser (`JSON.parse`), one budget walk, one linter, no paths at all. A third larger
  for pictures.
- C. **One JSON file, pictures never inside**: the DM uploads them separately. Small
  files, but two things to keep together, and "load it in one step" is lost.

**Choice: B, with C as an allowed form of the same file.**

- The file is `*.hextable-adventure.json`, UTF-8 JSON. The same file **gzipped**
  (`*.hextable-adventure.json.gz`) is also read: gzip is one stream, not an archive,
  so it has no names or paths, and both the browser (`DecompressionStream('gzip')`)
  and Node (`zlib`) read it with nothing added. Decompression stops, and the file is
  refused, the moment the output passes the size cap (a bomb costs at most the cap).
  Gzip brings base64 pictures back close to their binary size, which answers A's
  main advantage.
- **Each asset** is `{ mime, bytes, sha256, data? }`. With `data` (base64) the
  picture is inside; without it the module is **lean**: the picture is named by its
  hash and size, and the import dialog asks for the files (or loads without them, as
  the UVTT import offers "Load without the picture"). The module's hash (Decision 4)
  is taken with `data` left out, so a full and a lean copy of one module are the
  same module.
- **Versioning.** Two numbers, as the market and world packs have them:
  - `format: 'hextable-adventure', v: 1` is the **format**. `migrateAdventure(doc)`
    brings an older `v` up to date, is safe to run any number of times, and leaves a
    document of a newer `v` untouched so the linter refuses it by its version ("This
    module is format 2; this game reads format 1. Update the game."), exactly as
    `migrateMap` does for maps.
  - `module.version` is the **edition**: a whole number the author raises on each
    export. With `module.id` (fixed for the life of the module) it says which module
    and which edition a table was started from.
  - **Sections keep their own formats.** A map inside is a map document and is
    migrated by `migrateMap`; a market pack inside is migrated by `migrateMarket`; a
    world pack by its own. A new map format does not need a new module format.

**Reasons.** The repo's rule against dependencies makes A a parser we would own at a
security boundary; B is the shape of every file the project already imports. Lean
files keep a module mailable and let a DM share prep without sharing purchased art.

**Cost.** A large module is parsed whole in the browser; the caps of Decision 5 keep
that within what a phone can do (the UVTT import already accepts 64 million
characters). Base64 is undone once, on import.

### Decision 2: what is in a module, and what is not

**Question.** What sections does a module have, and what may never be in one?

**Choice.** A manifest and sections. Every section is optional except `module`,
`start` and at least one map (or a world whose root leads to one).

```js
{
  format: 'hextable-adventure', v: 1,
  module: {
    id: 'flooded-mill',                       // kebab, fixed for the life of the module
    title: 'The Flooded Mill', version: 3,    // version: the edition, rises on each export
    by: 'Written for the Hextable examples',  // the author's words; a moniker or a name, the author's choice
    blurb: 'Rats in the cellar, and worse.',  // up to 500 letters
    kind: 'one-shot',                         // 'one-shot' | 'campaign', as INTERFACE I7 names them
    level: { start: 1, min: 1, max: 2 },      // the adventure's character level (portable-characters Decision 8)
    party: { min: 3, max: 5 },
    length: { sessions: 1, hours: 3 },        // the author's estimate
    content: 'srd-only',                      // 'srd-only' | 'private' (Decision 9)
    licence: { name: 'CC-BY-4.0', attribution: '…', srd: '…', text?: '…' },   // Decision 9
    made: '2026-11-14',
  },
  needs: {                                    // what a table must have; the compatibility report (Decision 6) reads it
    rules: 'srd-5.2.1',
    grid: 'hex',                              // 'hex' | 'square' | 'both'
    homebrew: [ { id: 'ember-folk', version: 2, hash: 'sha256:…' } ],
  },
  settings: { diagonals: 'srd', cover: 'on', away: 'dodge', characters: 'own', level: 1, takeaway: 'everything' },
  start: {
    map: 'mill', entry: 'door',               // or { node, entry } with a world (travel.md)
    clock: 1080,                              // minutes from the start of day 1, as s.clock counts (here 18:00)
    light: { cellar: 'dark' },                // level id -> an AMBIENT value, over what the map says
    weather: 'Rain since noon; the river is high.',   // words for the DM: the engine has no weather
    scene: 'arrival',                         // a prepared scene to open at once, or absent
    stage: ['cellar-rats'],                   // encounters placed at the start (Decision 3)
  },
  maps:       { mill: { format: 2, … } },     // map documents, by the module's id
  world:      { format: 'hextable-world', … },       // travel.md's world pack, its maps and assets taken from the module
  markets:    [ { format: 'hextable-market', … } ],   // shops.md's market packs
  shops:      [ { id: 'miller-stall', market: 'mill-goods', template: 'stall', name: "The miller's stall", at: { map: 'mill', region: 'yard' } } ],
  homebrew:   [ { format: 'hextable-pack', … } ],    // the DM's own pack, optional copy (Decision 3)
  encounters: [ … ],                          // Decision 3
  npcs:       [ … ],                          // Decision 3
  scenes:     [ { id: 'arrival', title: 'At the mill gate', image: 'a-gate', present: ['miller'], notes: '…', readAloud: '…' } ],
  handouts:   [ { id: 'deed', title: 'The mill deed', text: '…', asset: 'a-deed' } ],
  notes:      [ { id: 'n-cellar', at: { map: 'mill', region: 'cellar' }, title: 'The cellar', readAloud: '…', dm: '…' } ],
  pregens:    [ { id: 'tamsin', sheet: { … } } ],    // ready-made heroes the DM offers (Decision 3)
  assets:     { 'a-gate': { mime: 'image/webp', bytes: 183402, sha256: '…', data: '<base64>' } },
}
```

**Explicitly not in a module**, and refused by the linter if present:

- **Code of any kind.** No functions (impossible in JSON, and `findFunction` is run
  anyway on what came from a script), no `script`, `code`, `eval`, `expr`, `formula`
  or any field outside the closed key lists of Decision 5, no URLs that are
  followed (a link in a text is shown as text; nothing in a module is fetched from
  the network), no HTML, no SVG (assets are PNG, JPEG or WebP by their bytes).
- **Players' characters.** No character files, no `cid`, no history blocks, no keys.
  A module's `pregens` are sheets only, made by the DM; a player's own character
  arrives only by the admission routes of `portable-characters.md`.
- **Rules content of its own.** No spells, monsters, items or conditions outside an
  embedded homebrew pack, and that pack is checked by the homebrew gate as if the DM
  had uploaded it (Decision 3).
- **Progress.** No state, no seed, no dice key, no undo history, no timeline. A
  module is the same file before and after any number of tables have run it.
- **Secrets outside DM-only fields.** Every field is DM-only unless the table of
  Decision 8 lists it as something a player may be sent once shown. There is no
  "public" field a module can set to push text to players: text reaches a player only
  when the DM shows it in play, through an existing action.

**Reasons.** Each section is one of the existing documents, or a small list of the
DM's prep in the shapes the engine already takes (a scene is what `scene` and
`sceneNpc` take; a handout is what `handout` takes). The module adds the glue:
what starts where, which creatures go together, what the DM reads aloud.

**Cost.** A closed key list per section to maintain beside the sections' own linters.

### Decision 3: encounters, NPCs, homebrew and pregenerated heroes

**Encounters.** A group of creatures that belong together, with their place and the
DM's plan:

```js
{ id: 'cellar-rats', name: 'Rats in the cellar', map: 'mill', region: 'cellar',
  creatures: [ { monster: 'giant-rat', count: 6, at: { region: 'cellar' }, hidden: true } ],
  budget: { difficulty: 'low', level: 1, size: 4 },   // for the DM's check, never enforced
  tactics: 'They flee up the chute when half are down.',
  stage: 'start' }                                     // 'start': placed when the table starts on (or first enters) its map; 'dm': when the DM says
```

- **`monster`** is a pack id: an SRD id, or an `hb-` id of a homebrew pack the module
  names in `needs.homebrew`. A creature from a book outside the SRD is entered with
  an SRD **stand-in** id and a `name` ("Mill Ghoul", playing as `ghoul`); the
  stand-in's stat block is what plays, and the report says so. Nothing else is
  accepted.
- **`at`** is a cell, written as a map's `starts` write one (`{ level, q, r }`), or a
  region (`{ region }`): the creatures are set down on the region's cells in the
  order of its cell list (`hexes`), passing over cells nobody can stand on or that are
  taken, each footprint checked as `spawn` checks it **(design choice: no dice, so
  the same module places the same way every time)**. Too few cells is a lint problem,
  not a quiet move.
- **`hidden`** is `spawn`'s `hidden`: the creatures are unknown to players until the
  existing rules reveal them.
- **`budget`** is advice. The linter adds the creatures' XP from the pack's `xp` and,
  once the SRD's XP Budget per Character table is entered as checked pack data (a
  content job, not this spec), shows the budget beside it. The SRD's own worked
  example is the check of that job: a low-difficulty encounter for four level 1
  characters is 50 x 4 = 200 XP. Until then the dialog shows the XP total only. No
  number is invented here.
- **In play** the DM's screen sends one new action, `stage { encounter, creatures }`
  (DM only), with the creatures written out from the module. It places them all or
  none (the first that cannot stand is the refusal, nothing placed), at most 40, and
  marks each with `enc: '<encounter id>'`, a DM-only field. It records
  `s.adventure.staged[id] = n` so the panel can say "staged" and "done" (staged, and
  no living creature carries the mark). Staging the same encounter twice asks
  `again: true`. One action is one undo step and one log line ("The DM placed Rats in
  the cellar"). The engine does not read the module to do this: the DM is entitled
  to place creatures, and the action is checked as `spawn` is.
- **Tactics** are DM text. The monster AI does not read them; a later AI DM may, from
  the DM's view.

**NPCs.** People to talk to, with a stat block in case it comes to blows:

```js
{ id: 'miller', name: 'Oswin the miller', monster: 'commoner', portrait: 'a-oswin',
  roleplay: 'Owes money to everyone. Lies about the cellar door.', scenes: ['arrival'] }
```

- In the first build an NPC is a person in a **scene** (`sceneNpc { name, portrait,
  notes }`, with `roleplay` as the DM-only notes). "Add to scene" on the DM's panel
  sends it.
- **On the map**, an NPC needs a creature that is neither party nor foe: today
  `side` is `party`, `foe` or `object`, and a `foe` within `engageRange` starts a
  fight. Placing friendly or neutral creatures is an engine change (a side, and what
  `autoEngage` and the arena do with it) with its own amendment; until it lands, an
  NPC's `monster` is used only when the DM turns them hostile ("Make a foe" spawns the
  stand-in where the DM taps) **(question 6)**.

**Homebrew.** `needs.homebrew` lists `{ id, version, hash }` of each pack the module
uses. A module may also carry a copy of the DM's own pack in `homebrew`. This keeps
`homebrew.md` whole:

- The rule there is that **homebrew is never taken from a player's file** and a
  `pack` message from a player is refused. A module is **the DM's file, loaded only by
  the DM** (the server refuses a module from anyone else, Decision 7). An embedded
  pack is therefore the DM importing their own pack, and it goes through exactly the
  same gate: `budget`, `lintPack` strict, the `hb-<pack>-` prefix, `HOMEBREW_LIMITS`
  (256 KB, 4 packs a table), the reader shown in the import dialog for the DM to
  approve, then `setPacks`. Its hash must match `needs.homebrew`.
- A module that lists a pack without carrying it needs the table to have it already;
  otherwise the report says "not in this table's rules" and the DM chooses (load the
  pack first, or do not start). A second DM given a module with an embedded pack is
  importing a stranger's pack: the dialog shows its reading and asks, as the pack
  manager does.
- Until homebrew B5 is built, a module whose `needs.homebrew` is not empty is refused
  with that reason.

**Pregenerated heroes.** `pregens` are sheets the DM made (what `setSheet` takes and
`validate` passes), at most 8. They are the "from the DM's stable" route of
`portable-characters.md` Decision 8: offered in solo's party choice and, at a table,
assigned by the DM as `addCharacter` does today. They carry no history; a hero who
leaves the table becomes a travelling character whose history starts with one line,
`born.how: 'pregen'`, as that spec already says.

### Decision 4: identity: the module id and the hash

- **`module.id`** is the author's kebab id (up to 40 letters), fixed for the life of
  the module. Changing it makes a new module.
- **The hash** is SHA-256 of the canonical JSON of the module **with every asset's
  `data` removed** (keys sorted, no spaces, numbers as JSON writes them): the same
  canonical form the homebrew pack hash uses (`homebrew.md` Decision 3). The rules
  package exports `canonical(doc)`; the server and the browser hash its output. A
  full and a lean copy hash the same; any change to any text, map or creature
  changes it.
- **Each asset's `sha256`** is checked against its bytes on import. A mismatch is a
  refusal (a lean copy given the wrong picture, or a file tampered with).
- **Kept in the state:** `s.adventure = { id, version, hash, title, by, licence: { name,
  attribution, srd }, staged: {} }`, or `null` for a table not started from a module.
  It is small, so it can be in every undo patch. It is how an export says what it
  needs, how a resumed table checks it was given the right file, how the DM panel
  shows progress, and what a later `recall` or AI DM reads. One state version adds it
  (`adventure: null`).

### Decision 5: validation

**Question.** What is checked, in what order, and how is a refusal worded?

**Choice.** Four passes, all pure, in `packages/rules/src/adventure.js`, run in the
browser for the dialog and again on the server before anything is kept:

1. **Size, before parsing.** The file (after gzip) is at most 64 million characters,
   the UVTT import's ceiling. Checked on the byte length, then on the decompressed
   length as it streams.
2. **The budget**, iterative, never recursive, as `homebrew.md` Decision 2: depth of
   the whole document 16; no key `__proto__`, `constructor` or `prototype` anywhere;
   no control characters in any string, and none of the Unicode direction overrides
   (U+202A to U+202E, U+2066 to U+2069), so a name cannot display reversed; every
   count and length under the caps below; then the body (the document with asset
   `data` removed) is measured.
3. **`lintAdventure(doc, { content, grid })`**, strict: a closed key list for every
   object of every section; ids kebab and unique within their section; every
   reference resolves (a start's map and entry, an encounter's map and region, an
   NPC's scenes, a scene's `present`, a note's `at`, every asset id used, every
   shop's market and template); every `monster` is in the content the table has (SRD,
   plus the homebrew the module names); `settings` keys and values are in `SETTINGS`;
   `start.clock` a whole number from 0 to 1,000,000; `start.light` values in
   `AMBIENT`; every `pregens` sheet passes `validate`. Then the sections' own
   linters: `lintMap` for every map (and the creatures' cells against it),
   `lintMarket` (`shops.md`), the world linter (`travel.md`), `lintPack` strict for an
   embedded homebrew pack. An asset no section refers to is reported and dropped, so a
   module cannot use the table's storage for files nobody sees.
4. **Assets**, when they are read: each decoded `data` is the declared `bytes`, its
   SHA-256 is the declared `sha256`, and `sniff` finds the declared `mime` in the
   bytes. On the server the existing upload path checks it again.

**The caps** **(design choice)**, in one constant `ADVENTURE_LIMITS`:

| What | Cap | Why this number |
|---|---|---|
| The file | 64 million characters | the UVTT import's |
| The body (all but asset `data`) | 4 MB | a world pack is 4 MB at most with its pictures; the body has none |
| Maps | 60, each at most 1 MB as JSON | `WORLD_LIMITS` battle maps; `loadMap`'s 1 MB frame |
| Assets | 150 | under the table's 200, leaving room for play |
| One asset | 5 MB decoded | the server's `assetBytes` |
| All assets | 40 MB decoded | under the table's 50 MB |
| Encounters | 200; 40 creatures each; 1,000 in all | `stage`'s 40 |
| NPCs, scenes, handouts, notes | 200, 100, 200, 500 | handouts: `HANDOUT_LIMITS` |
| Pregens | 8 | a party of 6 and two spares |
| Names, titles | 60, 80 | the scene and handout limits |
| `readAloud`, `notes`, `dm`, `roleplay`, `tactics`, handout `text` | 2,000 letters | the handout and scene-note limit, so any text can become a handout or a scene note without being cut |
| `blurb`, `weather` | 500 | — |
| `licence.text` | 8,000 | room for a licence's short form |

**Refusals** follow the linter's style: a path, then a plain sentence, the first
ten problems, then "and 14 more":

```
encounters/cellar-rats/creatures/0: no such monster "giant-ratt".
maps/mill: Region "celar" is not a region of this map.
assets/a-gate: the picture is not the file the module names (its fingerprint differs).
start: the map "mil" is not in this module.
```

**Reasons.** The same layering the homebrew gate uses (size, budget, strict lint),
so one review covers both. Caps tied to limits that already exist mean a module that
passes the linter also fits the table it is loaded into.

**Cost.** Key lists per section, and a test that the worked example and every
section's sample pass while each cap fails one past its value.

### Decision 6: the import dialog, and the compatibility report

**Question.** What does the DM see before anything changes?

**Choice.** One dialog, from the lobby (**Start from a module**) and from the DM's
drawer at a table (**Load a module**), in a new client module `adventureimport.js`.
It reads the file on the device, runs the four passes of Decision 5, and shows,
before any change and before any upload:

```
  ┌──────────────────────────────────────────────┐
  │ The Flooded Mill  · edition 3                │
  │ Written for the Hextable examples            │
  │ One-shot · level 1 to 2 · 3 to 5 characters  │
  │ CC-BY-4.0 · uses SRD 5.2.1 content           │
  ├──────────────────────────────────────────────┤
  │ 1 map (hexes) · 2 encounters · 1 store       │
  │ 2 scenes · 1 handout · 4 notes · 6 pictures  │
  ├──────────────────────────────────────────────┤
  │ This table:                                  │
  │  ✓ every monster and item is here            │
  │  ! Goblin Boss: some of its actions are      │
  │    applied by the DM (assist)                │
  │  ! shops are not in this game yet: the store │
  │    is left out                               │
  │  ! 1 picture is over 2 MB: it is shrunk      │
  │    for solo play                             │
  ├──────────────────────────────────────────────┤
  │ [ Cancel ]            [ Start this module ]  │
  └──────────────────────────────────────────────┘
```

**The compatibility report** lists what the table lacks, each with what happens:

| Finding | What happens |
|---|---|
| A format newer than this game | refused: "Update the game." |
| A section this build does not have yet (markets, world, homebrew, friendly NPCs on the map) | left out, named; the DM ticks **Start without it** or cancels |
| A monster, item or object id not in this build's content (a module from a newer build) | refused, with the ids |
| Content below `auto` tier | listed by name with its tier, as `npm run content` words it |
| A homebrew pack missing, or with another hash | as `homebrew.md` Decision 4: "not in this table's rules", or "a different thing with the same name" with the table's reading |
| A setting this build does not know | named and left at the table's default |
| A grid the table does not offer | refused ("This module is drawn on squares.") |
| Pictures missing (a lean module) | the dialog asks for the files; each found is matched by its hash; the rest load without the picture, named |
| Pictures over the solo limits | shrunk by the path the UVTT import uses, or left out past 50 files; named |
| The party (solo) or the seated players (table) against `module.level` and `party` | said, not enforced: admission is `portable-characters.md`'s |
| Loading at a table in play | "This ends the game at this table. Members stay; characters and the undo history go." |

The DM's **Start this module** is the only button that changes anything.

**Reasons.** The UVTT import and the character-file import already do "show what was
read, then load"; the DM sees the same habit. The report reuses the wording of the
homebrew and portable-character reports.

### Decision 7: hosting: solo, the table server, progress, and running it again

**Question.** How does a module reach a table, what is kept where, and how does a
second session, a restart, or a second DM work?

**The start is a new game.** `startAdventure(doc, seed, { party?, grid? })` in
`adventure.js`, pure, returns a state as `newGame` does: version, seed, clock
(`start.clock`), settings (the module's, over the defaults), the start map (with
`start.light` applied to its levels), the party set down at `start.entry` (or the
map's starts, until travel W1), the encounters in `start.stage` placed as `stage`
would place them, `s.adventure` filled, the open scene of `start.scene` if any, and
the sections later builds support (markets and shops after shops P3, the world index
after travel W3, `packs` after homebrew B5). It never reads assets: map and scene
pictures are already asset ids by then (below). Loading a module **into a table that
is playing** replaces its state the same way: a new game, members kept and their
claims cleared, the undo history cleared (as solo's `reset` does today), after the
dialog's warning.

**Solo.**

- The lobby's **Start from a module** opens the dialog, then the party choice
  (starters, My characters, the module's pregens), then
  `startAdventure(doc, seed, { party })`.
- The module is kept in IndexedDB (a store `hextable-modules`, beside the assets),
  its pictures in the device's asset store, the references rewritten to their ids.
  The saved game (`hextable.solo`) is the progress, as today.

**The table server.**

- **Host from a module** in the lobby: the client hosts a table as today, uploads the
  module's pictures through the existing `POST /assets/<code>` (the DM's seat, the
  existing type, size, rate and slow-body checks), and gets an id for each; then it
  sends the body, with every asset reference rewritten to the table's ids and an
  `assets` map from the module's ids to the table's, to a new
  **`POST /adventure/<code>`** (the DM with a live seat, JSON, at most 4 MB, in the
  same upload slots and deadlines as assets). The body goes over HTTP, not the
  WebSocket, because the DM's frames are capped at 1 MB plus an envelope and held
  whole in memory, and the upload path already defends against large and slow bodies.
- **The server** runs the four passes again, checks each referenced asset id is a file
  of that table, computes the hash over the body as the author made it (references
  put back by the `assets` map), runs `startAdventure` with the table's seed, keeps
  the module, clears the undo history and sends every member the full view.
  The players' screens never show the valley: the client starts the upload before
  showing the table.
- **Where the module is kept.** In its own file beside the table's
  (`<code>.module.json`, written once on load and on an update, read on restart), as
  the undo history is kept beside it, because it is written once and read rarely and
  would otherwise be rewritten with every save of the state. `table.module = { id,
  version, hash, body, assets }` in memory.
- **Who is sent it.** The DM only, as `{t: "module", module}` on sitting down and on
  change: the DM's panel needs it on any device. Never a player, never in a player's
  history, never in a player's export (there is none). A player's request for a
  module picture is the one identical 404 of the asset rules until their view names
  it (a shown handout, a level background they are sent).
- **A restart** reloads the module file with the table. If it is missing or
  damaged, the table still plays: everything already in play is in the state. The
  DM's panel says "The module is not on this table; load it again", and a file with
  the same id and hash (or the same id and a higher edition) is taken without
  restarting the game.

**What stays in the file, and what is progress.**

| In the module (read-only) | In the table (progress) |
|---|---|
| maps as prepared | the map in play: doors opened, regions revealed, what the party has seen, the DM's edits (`s.map`; parked places with travel) |
| encounters | which were staged (`s.adventure.staged`), the creatures alive, hurt or dead |
| scenes, NPCs, read-aloud, notes | the scene open now, the transcript (`say` events), the chronicle |
| handouts | which were made and shown to whom (`state.handouts`, each with `from`, a DM-only field naming the module's handout) |
| markets and store openings | shops opened, stock, quotes, purses (`shops.md`) |
| the atlas | where the party is, parked places, journeys (`travel.md`) |
| settings at the start | settings now |
| pregens | the characters at the table |

Nothing is ever written back to the module.

**Undo.** Starting from a module is a new game: there is nothing before it to undo.
`stage`, and every action the DM's panel sends, is an ordinary step. Loading a newer
edition (below) is not a game action and is not undone, as adding a homebrew pack is
not (`homebrew.md` review point 13); its record in the state is set by a
server-only action, `adventureRecord`, outside the undo set, as `worldIndex` is in
`travel.md`.

**Running it again.**

- **The next session of the same table** is the same table: the server keeps it, the
  solo game is saved. Nothing to load.
- **The same module with another group, or by another DM**, is a new table started
  from the same file: nothing of the first table's progress is in the module.
- **Moving progress** to another server or device is a table export (#83), which
  gains `module: { id, version, hash }` and lists the module's pictures by `sha256`
  instead of carrying them; resuming needs the export and the module file, and the
  import checks the hash. Import of a table export does not exist yet (DEBT P12), so
  this waits for it. A tick box **Include the module** puts the whole module in the
  export for a DM who wants one file **(question 4)**.
- **A newer edition** (same id, higher `version`) can be loaded into a table started
  from an older one without a new game: the server keeps the new file and updates
  `s.adventure`; what is in play keeps its copies (maps visited, shops open, handouts
  shown), and what is not yet used (unstaged encounters, unopened scenes, unshown
  handouts, maps not yet loaded) is read from the new edition. The dialog lists what
  changed by section. The same id at the same edition with another hash is refused
  ("This is not the edition this table was started from."); a lower edition is
  refused; another id means a new game.

**Reasons.** A pure start function keeps `apply()` the only mutator and replay exact:
the history starts at the module's state. Keeping the module beside the table, not
in the state, keeps patches, views and saves small and keeps the module away from
every player path by construction.

**Cost.** A new HTTP route, a new file beside each table, one state field, one action
(`stage`), one server-only action (`adventureRecord`), and a field `from` on handouts
and scenes.

### Decision 8: what the DM's screen does with it, and what players are sent

**The DM's module panel** (a drawer tab "Adventure", a new client module
`adventurepanel.js`), built only from the DM's copy of the module:

- **Here**: the notes and read-aloud for where the party is (the region of the party
  member the DM follows, the open scene, the encounter staged), updated as regions
  are revealed. **Read aloud** sends the text as the DM's `say` lines (500 letters a
  line, split at sentence ends); **Show as handout** makes a text handout.
- **Encounters**: each with its status (not yet, staged, done), XP, tactics, **Stage**
  (sends `stage`), **Go to** (centres the map).
- **Scenes**: **Prepare** and **Open** (sends `scene` and `sceneNpc` from the
  module's scene and its NPCs, with `from`).
- **Handouts**: **Show to…** (sends `handout` with `from`, then `showHandout`).
- **NPCs**: the roleplay note, the portrait, **Add to scene**, and later **Make a
  foe**.
- **Maps**: the module's other maps, **Go there** (`loadMap` with the map, as the
  editor's load does; with travel, `loadMap { node }`).
- **Stores** (after shops P6): **Open** from the module's `shops`.
- **The start**: the weather words and the module's blurb.

Every one of these is an existing action, or `stage`, checked as if the DM had typed
it, under its existing limits. The module never reaches the engine by any other way.

**What players are sent**, by allow list (`view.js`):

| Thing | A player is sent |
|---|---|
| `s.adventure` | `title`, `by`, `licence.name`, `licence.attribution`, `licence.srd` (shown in About: the author's credit and the SRD's) |
| Never | `id`, `version`, `hash`, `staged`, the module itself, encounter ids, the `enc` mark on creatures, `from` on handouts and scenes, tactics, notes, read-aloud not yet read, NPC roleplay, unshown handouts, unopened scenes, maps not loaded, assets not named by their view |
| Everything else | exactly as today: a shown handout, a said line, a revealed creature, a loaded map by its sight rules |

**Acceptance tests** (in `view.test.js` and the server's): a module whose every DM-only
text holds a canary (`CANARY-NOTE`, `CANARY-TACTIC`, `CANARY-ROLE`, a canary
encounter id, a hidden handout titled `CANARY-HO`, a secret door and a trap) is
started, staged, played through a fight, a scene and a handout shown to one player;
no message to any player holds a canary until the DM showed that thing, and the
other player never gets the handout. A player's `GET` of an unshown module picture
is the same 404 as a missing one.

### Decision 9: legal terms and wording

- **The repo** ships the format, the linter, the tools and **invented, SRD-only
  example modules** (the worked example below, under `examples/adventures/`). Their
  places, people and words are written for this project. No published adventure,
  setting, place name or picture is entered, adapted or named, anywhere.
- **A private module** may hold the DM's own or purchased material: their prose,
  their pictures, stand-in creatures named as their book names them. It stays the
  DM's file: never uploaded to the repo, never shared by the server, kept on the
  server only for that table and deleted with it.
- **Wording.** The game, its docs and its tools say "5E compatible". The words "D&D"
  and "Wizards" appear only in the SRD attribution (`reference/srd52/README.md`,
  `about.js`). The assemble script and the editor's export never write them into a
  module. The linter does not police the words of a private module; the repo's
  example modules are tested for them.
- **Licences.** The format is part of Hextable and is AGPL-3.0-or-later code. A
  module's **content is its author's**. A module declares:
  - `licence.name`: an SPDX id (`CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-4.0`), or
    `all-rights-reserved`, or `other` with `licence.text`;
  - `licence.attribution`: the credit the author asks for;
  - `licence.srd`: when any SRD content is named (and every module names some), the
    SRD's attribution sentence exactly as `reference/srd52/README.md` has it. The
    assemble script and the editor write it; the linter checks it is present and
    exact when `content` is `srd-only`;
  - `content: 'srd-only'` (every rules id is SRD; the author states the prose and
    pictures are their own or openly licensed) or `'private'`. The linter can check
    the first half of `srd-only` (no `hb-` ids, no embedded pack) and nothing else; the
    rest is the author's statement, shown, not checked, as a homebrew pack's licence
    is.
  The import dialog shows all of it. Players see the credit (Decision 8).
- **Sharing on the official server, later.** A library of modules people can start
  from is a service the project would run, with take-down, abuse and moderation
  (`docs/service/FOUNDING.md` §2 and §5.6). This spec proposes only the shape, for the
  service lead to take or leave: only `content: 'srd-only'` modules with an open
  licence (`CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-4.0`); listed under the author's moniker;
  stored and served by hash; linted by the same `lintAdventure`; never a private
  module. Nothing in the game waits for it. An official adventure (I7) started from
  a module could carry `module: { id, version, hash }` so the anonymous statistics
  can relate play time to a module; that would be a change to `INTERFACE.md` made by
  its own process (`WORKING-TOGETHER.md`), not by this spec.

### Decision 10: authoring

**Question.** How is a module made, and how can an agent assemble one from an outline
the owner brings?

**Choice.** Three routes to the same file, all ending in the same linter:

1. **From a table: Save as module** (DM, later stage). The DM prepares in the game:
   paints or traces maps in the editor, imports UVTT files, writes handouts, prepares
   scenes, places hidden creatures. **Save as module** reads the DM's own view and
   writes a module: the map in play (with its edits, without `seen`), every handout
   (unshown), the prepared scene, the hidden creatures grouped by region as
   encounters, the table's settings, the clock and light; the DM names it and adds
   read-aloud and notes in a short form. Pictures come from the table's files. It is
   the shape a DM who prepares by playing alone already works in.
2. **From a folder: `npm run adventure`** (`scripts/adventure.mjs`, no dependency).
   A folder holds `adventure.json` (the manifest and the small sections), `maps/*.json`
   (map documents: the editor's export or the UVTT import's output), `text/*.txt`
   (read-aloud and notes, referenced as `"@text/arrival.txt"` only in the folder),
   and `pictures/*` (PNG, JPEG, WebP). Commands:
   - `npm run adventure -- build <folder> [--lean] [--gz]`: inlines the text, encodes
     and hashes the pictures, writes `licence.srd`, raises nothing on its own (the
     author raises `version`), lints, and writes `<id>.hextable-adventure.json`;
   - `npm run adventure -- lint <file>`: the four passes, the refusal sentences, exit
     code 1 on a problem;
   - `npm run adventure -- read <file>`: a plain-words summary (what the dialog
     shows, plus every encounter with its XP and every reference), for a reviewer or
     an agent to check its work.
3. **By hand.** The JSON is meant to be readable; the linter's sentences say where a
   hand edit went wrong.

**The agent route.** An agent given an adventure outline by the owner (rooms, people,
fights, a store, a hook) writes the folder of route 2, never the built file:

- monsters by SRD id, chosen by the agent from `npm run content` and the pack, with a
  stand-in id for any creature the outline takes from a non-SRD book, named as the
  outline names it, and the substitution written in the module's notes for the DM;
- maps as map documents (a small map can be written as JSON; a real one comes from
  the editor or a UVTT file the owner supplies);
- every number from the pack or from the SRD text, never from memory; the XP of each
  encounter from the pack's `xp`;
- read-aloud and notes in its own words;
- `npm run adventure -- lint` until clean, then `read`, and the `read` output is what
  the owner approves, as the homebrew AI route has the user approve the reading
  (`homebrew.md` Decision 8).
- The owner's private module (purchased material) is assembled outside the repo, in a
  folder the owner names, and is never committed. The agent brief for this lives with
  the authoring guide (stage A8).

**Reasons.** Route 2 is what an agent and a careful author both want: files that diff,
text that is not escaped inside JSON, pictures that stay pictures until the build.
Route 1 is the simplest for a DM who prepares in the game. Both end in one file and
one linter.

## A worked example

Invented for this spec, SRD-only, tiny: one map, two encounters, one store. Ids are
real SRD pack ids (`giant-rat` 25 XP, `goblin-warrior` 50 XP, `commoner`,
`longsword`, `potion-of-healing`, `chest`); the encounters are the SRD's own
low-difficulty example for four level 1 characters (six Giant Rats, 150 XP, within a
200 XP budget) and a group of four Goblin Warriors (200 XP). The map is abridged.

```js
{
  "format": "hextable-adventure", "v": 1,
  "module": {
    "id": "flooded-mill", "title": "The Flooded Mill", "version": 1,
    "by": "Written for the Hextable examples",
    "blurb": "The miller's cellar has flooded and something is eating the grain.",
    "kind": "one-shot", "level": { "start": 1, "min": 1, "max": 1 },
    "party": { "min": 3, "max": 5 }, "length": { "sessions": 1, "hours": 2 },
    "content": "srd-only",
    "licence": { "name": "CC-BY-4.0", "attribution": "The Flooded Mill, written for the Hextable examples.",
                 "srd": "This work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by …" },
    "made": "2026-11-14"
  },
  "needs": { "rules": "srd-5.2.1", "grid": "hex", "homebrew": [] },
  "settings": { "cover": "on", "conclusion": "dm" },
  "start": { "map": "mill", "clock": 1080, "light": { "cellar": "dark" },
             "weather": "Rain since noon; the river is high.", "scene": "gate", "stage": ["cellar-rats"] },
  "maps": {
    "mill": { "format": 2, "id": "mill", "name": "The mill", "grid": "hex", "cellFeet": 5,
      "levels": [ { "id": "ground", "name": "Mill floor", "z": 0, "tiles": { "0,0": { "t": "wood" } } },
                  { "id": "cellar", "name": "Cellar", "z": -10, "tiles": { "0,0": { "t": "stone" } } } ],
      "walls": [], "objects": [ { "id": "o1", "def": "chest", "level": "ground", "at": { "q": 3, "r": 1 } } ],
      "regions": [ { "id": "yard", "name": "Mill yard", "level": "ground", "hexes": ["0,0"] },
                   { "id": "cellar", "name": "Cellar", "level": "cellar", "hexes": ["0,0"] },
                   { "id": "loft", "name": "Grain loft", "level": "ground", "hexes": ["0,0"] } ],
      "starts": [ { "level": "ground", "q": 0, "r": 0 } ] }
  },
  "encounters": [
    { "id": "cellar-rats", "name": "Rats in the cellar", "map": "mill", "region": "cellar",
      "creatures": [ { "monster": "giant-rat", "count": 6, "at": { "region": "cellar" }, "hidden": true } ],
      "budget": { "difficulty": "low", "level": 1, "size": 4 },
      "tactics": "They swarm whoever comes down the ladder first and scatter when three are down.",
      "stage": "start" },
    { "id": "loft-goblins", "name": "Goblins in the loft", "map": "mill", "region": "loft",
      "creatures": [ { "monster": "goblin-warrior", "count": 4, "at": { "region": "loft" }, "hidden": true } ],
      "budget": { "difficulty": "low", "level": 1, "size": 4 },
      "tactics": "They opened the sluice to flood the cellar. Two shoot from the loft; two hide and wait.",
      "stage": "dm" }
  ],
  "npcs": [
    { "id": "miller", "name": "Oswin the miller", "monster": "commoner", "portrait": "a-oswin",
      "roleplay": "Frightened, and ashamed he let the goblins in for a sack of coin.", "scenes": ["gate"] }
  ],
  "scenes": [
    { "id": "gate", "title": "At the mill gate", "image": "a-gate", "present": ["miller"],
      "readAloud": "Water pours from under the mill door. A man in a flour-white apron waves you over.",
      "notes": "Oswin pays 10 GP each if the cellar is cleared. He will not mention the loft unless pressed (Insight)." }
  ],
  "handouts": [ { "id": "ledger", "title": "A torn ledger page", "text": "Paid: one sack of coin, to the small folk, for the loft.", "asset": "a-ledger" } ],
  "notes": [
    { "id": "n-cellar", "at": { "map": "mill", "region": "cellar" }, "title": "The cellar",
      "readAloud": "Knee-deep black water. Something swims.", "dm": "The water is difficult terrain in the editor's paint." },
    { "id": "n-loft", "at": { "map": "mill", "region": "loft" }, "title": "The loft",
      "readAloud": "Grain sacks, slashed open. The sluice lever is pulled down.", "dm": "Stage the goblins when the party climbs, or when they make noise below." }
  ],
  "markets": [
    { "format": "hextable-market", "v": 1, "id": "mill-goods", "name": "Mill goods", "version": 1,
      "lists": [ { "id": "basic", "name": "Basic goods", "lines": [ { "id": "longsword", "item": "longsword" },
                                                                    { "id": "potion-of-healing", "item": "potion-of-healing", "qty": 2 } ] } ],
      "stores": [ { "id": "stall", "name": "Stall", "lists": ["basic"], "markup": 100 } ], "loot": [] }
  ],
  "shops": [ { "id": "miller-stall", "market": "mill-goods", "template": "stall", "name": "The miller's stall", "at": { "map": "mill", "region": "yard" } } ],
  "assets": {
    "a-gate":   { "mime": "image/webp", "bytes": 183402, "sha256": "…", "data": "…" },
    "a-oswin":  { "mime": "image/webp", "bytes": 41210,  "sha256": "…", "data": "…" },
    "a-ledger": { "mime": "image/png",  "bytes": 90233,  "sha256": "…" }
  }
}
```

`a-ledger` has no `data`: this copy is lean for that picture, and the dialog asks for
it. A build without shops reads the market and the store, names them in the report,
and starts without them when the DM ticks **Start without it**.

## What the engine, server and client must add

| # | Addition | Kind | Who may send | DM sees | Players see | State version |
|---|---|---|---|---|---|---|
| D1 | `adventure.js`: `ADVENTURE_LIMITS`, `migrateAdventure`, `budget`, `lintAdventure`, `canonical`, `summarise` (the dialog's and `read`'s words), `placeIn(map, region, bodies)`; pure | rules module | — | — | — | no |
| D2 | `startAdventure(doc, seed, opts)` beside `newGame`; `s.adventure`; migration giving `adventure: null` | state | engine | all | Decision 8's fields | **+1** |
| D3 | `stage { encounter, creatures, again? }` in `engine/dm.js`; the `enc` mark; `from` on `handout` and `scene`; `adventureRecord` (server only, outside the undo set); `describeStep` labels | actions | DM; server | everything | the creatures once revealed, as any | same |
| D4 | `view.js`: the allow list of Decision 8 | view | — | — | — | no |
| D5 | Server: `POST /adventure/<code>`, `<code>.module.json`, `{t:"module"}` to the DM, restart reload, edition update, export with `module` | server | DM | the module | nothing | no |
| D6 | Client: the dialog, the solo store, Host from a module, the DM's panel | client | — | — | — | no |
| D7 | `scripts/adventure.mjs` and `package.json`'s `adventure` line | tool | — | — | — | no |

## Build plan

Each row is one pull request. **Lanes**: *engine* rows change `engine/`, `view.js`,
`migrate.js` or what players are sent; they run one at a time, on the strongest
model, and their review points are the hidden-information tests and "a rejected
action changes nothing". *Server*, *client* and *docs* rows can run beside them where
the files do not overlap. Every row runs `npm test`, `npm run content` and
`npm run build`; client rows also run their smoke pass at 1280 x 800 and at 390 x 844
with touch. After every row the valley plays as before and a table not started from a
module is unchanged.

| # | Task | Lane | Who | Files it may touch | Done when |
|---|---|---|---|---|---|
| A1 | **The format and the linter.** D1, for the sections that need nothing unbuilt: `module`, `needs`, `settings`, `start`, `maps`, `encounters`, `npcs`, `scenes`, `handouts`, `notes`, `pregens`, `assets`; the other sections are recognised and reported as "not in this game yet" | engine (pure, no engine file) | Opus | `packages/rules/src/adventure.js` (new), `packages/rules/test/adventure.test.js` (new) | the worked example (lean, no store) lints clean; every hostile case of the list below that is a file case is refused with its sentence; each cap passes at its value and fails one past; `canonical` gives the same string for a full and a lean copy; no engine file changes |
| A2 | **Starting from a module, and `stage`.** D2 to D4 | engine | Opus | `adventure.js`, `scenario.js` (only to share the party placing), `engine/dm.js` (`stage`, `adventureRecord`), `handouts.js` and `scenes.js` (`from`), `migrate.js`, `view.js`, `history.js`, tests in `adventure.test.js` and `view.test.js` | `startAdventure` on the example gives the clock, the dark cellar, the party at the start, six hidden rats placed the same way every time; `stage` of the goblins places four or, with the loft full, none and changes nothing; undo of a `stage` removes them all; the canary tests of Decision 8 pass; replaying the history from the started state gives the same state; a valley game migrates with `adventure: null` and nothing else |
| A3 | **Server.** D5 | server (names `tables.js`) | Opus | `packages/server/src/tables.js`, `packages/server/src/index.js`, new `packages/server/src/adventure-http.js`, `limits.js` (the route's slots), `packages/server/README.md`, `packages/server/test/` | a DM starts a table from the example; a player's `POST /adventure` is 403; a 4 MB + 1 body is 413; a body naming an asset of another table is refused; the module file survives a restart and the panel's copy comes back; a missing module file leaves the table playing; edition 2 updates a table started from edition 1 without a new game and edition 1 again is refused; the export carries `module` and lists the pictures by hash; no player message or player history holds module text |
| A4 | **Solo.** The `hextable-modules` store, Start from a module in the lobby, the party choice with pregens | client | Sonnet | `packages/client/transport.js` (the solo start and store only), `packages/client/assets.js` (store pictures from a module), `index.html` (the lobby button), `mycharacters.js` (pregens in the party choice), `scripts/smoke/adventure.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=adventure`: start the example solo at both sizes, see the gate scene open, find the rats; a reload continues the game; no page errors |
| A5 | **The import dialog and the report.** Decision 6, solo and table, gzip, lean pictures asked for and matched by hash, shrinking for solo | client | Sonnet | new `packages/client/adventureimport.js`, `adventureimport.css`, `index.html`, `tablecontrols.js` (Load a module), the smoke pass of A4 | the dialog shows the example's summary and report before any change; Cancel changes nothing (no upload made); a bad file shows the linter's first sentences; a lean picture is matched by its hash; at 390 x 844 every row and button is reachable with a thumb |
| A6 | **The DM's module panel.** Decision 8's panel | client | Sonnet | new `packages/client/adventurepanel.js`, `adventurepanel.css`, `drawer.js` (the tab), `app.js` (`describe` for `stage`), `scripts/smoke/adventure.mjs` | at both sizes the DM reads aloud the cellar note, stages the goblins, opens the gate scene with Oswin, shows the ledger to one player; the other player's screen never shows it |
| A7 | **The assemble script.** Decision 10 route 2 | tool | Sonnet | new `scripts/adventure.mjs`, `package.json` (the script line), tests in `packages/rules/test/adventure-script.test.js` | `build` of a folder makes the example byte for byte as the test fixture; `--lean` drops `data` and keeps the hash; `lint` exits 1 with sentences on a broken folder; `read` prints the summary |
| A8 | **The example module and the authoring guide.** `examples/adventures/flooded-mill/` as a folder, built by A7 in the test; `docs/adventures.md` (how to make one, the folder, the agent brief, what may not go in a module, the wording rule) | docs + content | Haiku, reviewed by Opus | `examples/adventures/flooded-mill/**` (new; invented, SRD-only, pictures drawn for the project or none), `docs/adventures.md` (new), a test that lints the example and greps it for the trademark words | the example lints clean and plays in A4's smoke pass; every id and XP figure is the pack's; the guide's agent brief is what Decision 10 says |
| A9 | **Save as module** from a table. Decision 10 route 1 | client | Sonnet | `packages/client/adventureexport.js` (new), `editor.js` (the menu item), `tablecontrols.js` | a DM paints a map, writes a handout, places three hidden goblins, saves as module, starts a new solo game from it, and finds the goblins in the same region |
| A10 | **Markets and stores in a module.** Waits for shops P2 and P3 (and P6 for the panel's Open). `markets` and `shops` in `lintAdventure` (calling `lintMarket`) and `startAdventure` (calling the `market` import and leaving stores unopened, or opened per `shops`) | engine | Opus | `adventure.js`, tests | the example with its store starts with the stall unshown; a market that fails `lintMarket` refuses the module with the market's sentence |
| A11 | **The atlas in a module.** Waits for travel W2 and W3. `world` drawing maps and assets from the module; `start.node`; the server keeping the world from the module instead of its own `world` message | engine + server | Opus | `adventure.js`, `worldpack.js` (accept maps by reference to the module), `packages/server/src/tables.js`, tests | a module with a continent, a city plan and two battle maps starts at a node's entry; a world referring to a map the module lacks is refused |
| A12 | **Homebrew in a module.** Waits for homebrew B5 (and B7 for the reading in the dialog). `needs.homebrew` and the embedded pack through the homebrew gate | engine + server | Opus | `adventure.js`, `packages/server/src/tables.js` (call the pack path), `adventureimport.js` (the reading), tests | a module with an embedded pack adds it as the DM's; a pack whose hash differs from `needs` refuses the module; a module referring to a pack the table lacks reports "not in this table's rules"; no player message holds a homebrew monster |
| A13 | **Admission and pregens at a table.** Waits for portable-characters P4 and P5. `settings.characters`, `level`, `takeaway`, `module.level` given to the review; pregens as the DM's stable | engine + client | Opus then Sonnet | `adventure.js`, the review files that spec names | a table started from a level 3 module offers a level 5 file as a fork rewound to 3, through that spec's flow |
| A14 | **Moving progress.** Waits for the import of a table export (DEBT P12). An export with `module`, resumed on another server with the module file | server + client | Opus | `packages/server/src/tables.js`, the import that P12 adds, tests | an export resumed with the right file continues identically; with another hash it is refused |
| A15 | **Friendly NPCs on the map**, if the owner wants it (question 6): a side for creatures that are neither party nor foe, and what `autoEngage` and the arena do with it, after a spec amendment | engine | Opus | `engine/shared.js`, `engine/dm.js`, `engine/resolve.js`, tests | to be written in the amendment |

**Order and what waits.** A1 first. A2 after A1. A3 and A4 after A2, side by side
(different files; A4 holds `transport.js`, A3 the server). A5 after A3 and A4. A6
after A5. A7 any time after A1; A8 after A7. A9 after A6. A10, A11, A12 and A13 each
wait for the spec stages named in their row and are not duplicated here: the market
linter, the world pack, the homebrew gate and the admission review are built once,
by their own specs, and a module only calls them. A14 waits for DEBT P12. The work
can stop after any row: after A4 a DM can run the example solo; after A6 a DM runs a
one-map module at a table with its scenes, handouts and encounters.

## Hostile file tests

Each is a test in `adventure.test.js` or the server's tests. Every refusal changes
nothing: no upload kept, no state touched, no member told anything but the DM.

1. **Too big.** A file of 64 million characters plus one is refused before
   `JSON.parse`; a gzip file whose output passes the cap is refused part-way, with
   at most the cap decompressed.
2. **Not JSON**, a byte-order mark with trailing bytes, a JSON array, a JSON string:
   refused with one sentence.
3. **Depth bomb.** 10,000 nested arrays in a `notes` text field's place: refused by
   the budget in bounded time with no stack overflow.
4. **Prototype keys.** `"__proto__"`, `"constructor"` and `"prototype"` as keys at any
   depth, including inside a map and a market: refused; a test asserts
   `Object.prototype` is unchanged afterwards.
5. **Unknown fields** anywhere (`"script"`, `"onload"`, `"html"`, a `"public": true` on
   a note): refused, with the path.
6. **Text that looks like code.** A title `<img src=x onerror=alert(1)>`, a note with
   `javascript:` and a `<script>` read-aloud: accepted as text, shown as text in the
   dialog and the panel (the client's `esc`), sent as text in a `say`; nothing is
   rendered as HTML or followed as a link.
7. **Direction overrides and control characters** in a name: refused.
8. **Pictures that lie.** An SVG or HTML file declared `image/png`; a PNG declared
   `image/webp`; `bytes` that differ from the decoded length; a `sha256` that differs;
   base64 with junk: each refused with the asset's id. An asset id `../../x` or
   `a/b`: refused by the id pattern.
9. **Storage abuse.** 151 assets; one of 5 MB plus one; 40 MB plus one in all; an
   asset no section names (reported and not uploaded).
10. **Content that is not in the table.** A monster `giant-ratt`; an `hb-` id with no
    pack; an embedded homebrew pack holding an entry with an SRD id (`goblin-warrior`)
    or without its prefix; an embedded pack over `HOMEBREW_LIMITS`: refused with the
    homebrew linter's own sentence.
11. **Maps.** A map failing `lintMap`; a region that does not exist; creatures in a
    wall or more than a region holds: refused, never moved quietly.
12. **Settings.** An unknown key (named and dropped, not obeyed); a known key with a
    value outside its choices (refused); a `role`, `dm` or `members` key anywhere
    (refused as unknown: a module cannot say who is DM).
13. **Numbers.** `count` 10^9, `clock` negative or 10^12, `version` 0 or a fraction:
    refused.
14. **Who may load.** A player's `POST /adventure/<code>`; the DM's token without a
    live seat; a body naming another table's asset ids: refused, nothing kept.
15. **Editions.** The same id and edition with another hash; a lower edition; another
    id at a table in play without the new-game confirmation: refused.
16. **Hidden means absent.** The canary module of Decision 8: no player message,
    patch, history entry or error sentence holds a canary before the DM shows it.
17. **No progress inside.** A module carrying `state`, `rng`, `key`, `history` or a
    character file's `cid` and `blocks`: refused as unknown fields.
18. **Replay.** A table started from a module, played, exported with its history:
    replaying the history from the started state without the module file gives an
    identical state.
19. **Ids from the engine's namespace.** An NPC or encounter id `pc1` or `m12`:
    accepted as the module's id and never becomes an entity id (entity ids are minted
    by the engine).
20. **No cross-table probing.** A lean module naming the `sha256` of a picture
    another table holds is not matched against it: pictures are matched only against
    files the DM gives in the dialog or the table already has.

## Where this spec changes or meets existing specs

Each is stated so the owner can see every touch. None reverses a decision there; four
add a route or a field.

1. **`maps-and-objects.md` Decision 1** says a map can be "shipped inside a content
   pack as part of a scenario". Under this spec a scenario is a **module**, not a
   content pack: content packs hold rules content (`homebrew.md`), and a module holds
   maps and prep. This replaces that phrase's meaning; the maps spec is not edited by
   this PR (it is not in this issue's files), so the change is recorded here.
2. **`travel.md` Decision 2.** A world pack inside a module takes its `maps` and
   `assets` from the module (its own `maps` and `assets` are empty), so a battle map
   is held once. The server keeps such a world from the module's file, not from a
   separate `world` message. A standalone world pack is unchanged. (A pointer is added
   under its own heading in `travel.md`.)
3. **`shops.md` Decision 2.** Market packs also reach a table inside a module; the
   linter and the import are the same (`lintMarket`, `market { add }`'s path). The
   module's `shops` list adds store openings at the start, shown to nobody, which
   `shops.md` question 11 left out of scope for scenes. (Pointer in `shops.md`.)
4. **`homebrew.md` Decision 3.** A second way for the DM to add their own pack: inside
   their module. Same gate, same limits, same DM-only rule; a module from a player
   cannot exist, because only the DM may load one. (Pointer in `homebrew.md`.)
5. **`portable-characters.md` Decisions 5 and 8.** A module presets `characters`,
   `level` and `takeaway`, and its `pregens` are the "DM's stable" route. The review
   and admission are unchanged. (Pointer in `portable-characters.md`.)
6. **The table export (#83)** gains `module: { id, version, hash }` and lists module
   pictures by hash instead of carrying them, unless the DM ticks Include the module.
7. **Handouts and scenes** gain an optional DM-only `from`. `HANDOUT_LIMITS` and
   `SCENE_LIMITS` are unchanged; module text is capped to fit them.
8. **`DESIGN.md` storage row** ("one JSON file per table") becomes one JSON file per
   table plus, for a table started from a module, the module file beside it, as the
   undo history file already is. Not edited by this PR.
9. **`docs/service/INTERFACE.md` I7** could carry the module's id, edition and hash;
   proposed here only, for that file's own process.
10. **State versions.** `shops.md` and `travel.md` each say their stage moves the
    state from 21 to 22; the state is at 23 today. Each stage, this spec's A2
    included, takes the next free version when it is built.

## Risks

- **A large module on a phone.** A 40 MB picture set as base64 is a 54-million-
  character string held in memory once. The caps and the lean form bound it; the
  dialog should read the file in a worker if a real phone struggles (A5 measures).
- **The start replaces the state.** Loading at a table in play is a new game; the
  warning must be plain, and A3 tests that members stay and claims go.
- **Two places for a map.** A module's maps are prep; the table's map is progress.
  A DM who edits the map in play and wants the edits in the module uses Save as
  module (A9), never a write-back.
- **Sections that wait.** Until A10 to A13, a module with a store, an atlas or
  homebrew starts without them, or is refused for homebrew. The report must say so
  every time.
- **Private material on the server.** A purchased module sits on a table server for
  as long as the table does. The server deletes it with the table, never lists it,
  and never serves it to anyone but that table's DM.

## Questions for the owner

Each has a default; work proceeds on the default.

1. **The container.** *Default: one JSON file with pictures embedded as base64, the
   same file gzipped also read, and a lean form with pictures named by hash.* A zip is
   not proposed: it is a binary archive parser we would write ourselves at a security
   boundary.
2. **The caps.** *Default: 64 million characters a file, 4 MB of body, 60 maps, 150
   pictures, 5 MB each, 40 MB in all (the table keeps 10 MB of its 50 for play).*
3. **Loading a module at a table in play.** *Default: allowed, as a new game after a
   plain warning; members stay, characters and undo go.* Say if a module should only
   ever start a new table.
4. **The module in an export.** *Default: not included; the export names it by id,
   edition and hash, and a tick box includes it.*
5. **Encounters placed at the start.** *Default: an encounter marked `stage: 'start'`
   is placed, hidden, when the table starts on its map (or first enters it, with
   travel); others wait for the DM's Stage.*
6. **Friendly NPCs on the map.** *Default: not in the first build; NPCs are scene
   people, and become creatures only when the DM makes them a foe. A side for
   neutral creatures is its own engine amendment (A15).*
7. **Pregenerated heroes in a module.** *Default: allowed, up to 8, as sheets with no
   history; they are the DM's stable.*
8. **A newer edition at a table in progress.** *Default: allowed for the same id,
   higher edition; what is in play keeps its copies, what is unused comes from the
   new edition.*
9. **One module at a time.** *Default: a table runs one module. Chaining modules in a
   campaign (the party carried into the next module) is a later stage, through the
   send-off and admission of `portable-characters.md` or a "continue with" start that
   keeps the party.*
10. **Example modules in the repo.** *Default: yes, invented and SRD-only, under
    `examples/adventures/`, linted and smoke-played by the tests; the first is the
    worked example of this spec.*
11. **The valley as a module.** *Default: not now.* The starter valley stays
    `newGame`; making it the first stock module would prove the format but changes
    every test that starts a game.
12. **Sharing modules on the official server.** *Default: deferred to the service
    (FOUNDING); if it comes, only `srd-only` modules under an open licence, by the
    author's moniker, stored by hash.*
