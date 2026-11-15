# Spec: adventure modules

Status: draft by an agent, to be reviewed by the design owner. Issue #322. Nothing
here is built. No code is written by this spec. **Amended 14 November 2026** to the
owner's answers to questions 1 (the container is a zip, read by a vendored library),
3 and 9 (modules are added to a game, which becomes a campaign); see "Questions for
the owner". **Amended 15 November 2026** (#347) to the owner's answers to questions 2
(the caps, roughly doubled), 10, 11 and 12 (sharing on the official server is now
planned, not deferred) and to his answer on stage A0 (he cannot do it himself: "Not
me; find another way").

The owner asked for **a module format that makes it simple to host an adventure**.
The DM prepares an adventure once, privately, and adds it to a solo game or a
multiplayer table in one step and runs it; the same module can be run again, by the
same DM with another group or by another DM. **Modules are additive**: a second module
added to the same game joins the first, with the same characters, so a game grows
into a **campaign**. Players never receive a module; they receive what the party has
seen, through views, as today.

The pieces already exist, separately: map documents (map format 2, the editor, the
Universal VTT import), handouts, private notes and scenes (state), the market pack
(`shops.md`), the atlas, routes and encounter tables (`travel.md`), homebrew packs
(`homebrew.md`), the admission step and the adventure's character level
(`portable-characters.md` Decision 8). Nothing wraps them. This spec says what the
wrapper is, how it is checked, how it reaches a table, what stays in the file and
what becomes the table's progress, how modules add up to a campaign, how one is made,
what may and may not be in one, and how a hostile file is stopped. It ends with a
worked example, a staged build plan and the questions for the owner, each with the
default work proceeds on.

Style follows `shops.md` and `travel.md`.

## Words used here

| Word | Means |
|---|---|
| **Module** | The DM's prepared adventure: one zip file, `*.hextable-adventure.zip`, holding a manifest, the data and the pictures (Decision 1). Read-only once made. Never sent to a player. |
| **Manifest** | `module.json`, the first entry of the zip: what the module is, what it needs, and every file in the zip with its size and SHA-256. |
| **Data** | `adventure.json`, the second entry: the sections (maps, encounters, scenes and the rest). |
| **Lean copy** | The same module with some or all pictures left out of the zip; the manifest still names them. Same module, same hash. |
| **Table** | A game in play: a server table (code, members, state) or the solo game in a browser. |
| **Campaign** | A table with one or more modules added to it. A table with none (the valley today) is a campaign with no modules. |
| **Alias** | The name a module has inside one campaign, `module.id` unless the DM chose another because of a clash (Decision 11). Every id the module brings is prefixed with it: `flooded-mill/cellar-rats`. |
| **Progress** | What happened at a table: its state (and undo history). Made by play, never written into a module. |
| **Adventure** (service sense) | An official run of a table on the official server, with an `aid` (`docs/service/INTERFACE.md` I7). A module is not an `aid`; a table running modules may become one. |

## Rules that bind this design

- **Everything goes through `apply()`.** A module changes nothing by being read.
  Adding a module to a game is recorded by one server-only action (`campaign`,
  Decision 11), as `worldIndex` records a world in `travel.md`; everything after that
  is an action. What the DM's screen does with the module in play (open a prepared
  scene, show a handout, stage an encounter, take the party to the module's start) is
  the DM sending actions that exist, or one new one (`stage`), each checked by
  `apply()` with the DM's role and its usual limits.
- **The server is authoritative.** The server unpacks and lints a module itself
  before it adds it to a table; an unpack and a lint in the DM's browser are advice.
  A DM is trusted with the table, not with the server (`homebrew.md` review point 1).
- **The rules package is pure, and never sees a zip.** The format, the budget, the
  linter, the migration and the start are plain functions with no I/O, no clock and
  no `Math.random`, working on the **unpacked** module (`{ manifest, data }` and a
  list of the pictures found, never their bytes). The zip is unpacked by the caller
  with the vendored library (Decision 1): the browser for solo and for the dialog,
  the server for a table. Hashing is done by the caller (Node's `crypto` on the
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
- **Plain JavaScript, no bundler, no installed dependency.** One documented exception,
  of the same kind as Three.js: a small open-source zip library, **vendored** as
  pinned, hashed files with a README (Decision 1), its reason written in `DESIGN.md` by
  the build stage that vendors it (A0b). Nothing is installed from the network.
- **Phones are first-class.** The import dialog and the DM's module panel work at
  390 x 844 with touch.

## Where we are

What exists today, with the file and function so a builder can check.

| Piece | Exists today | Specified, not built | Missing |
|---|---|---|---|
| **Maps** | Map format 2 (`map.js`: `MAP_FORMAT`, `migrateMap`, `lintMap`, `MAP_LIMITS` 40 levels, 20,000 tiles, 5,000 walls, 2,000 objects, 500 regions); levels with `light` (`AMBIENT`), regions, objects and traps, doors, `starts`; the grid is the map's (`square-grid.md` Decision 3); the editor; Universal VTT import (`import-uvtt.js`, refused over 64 million characters). `loadMap` (DM, up to 1 MB: `MAP_ACTIONS` in `tables.js`). | Entries on maps and arrivals at one (`travel.md` W1); parking a map the party leaves (`travel.md` Decision 5, V1). | A bundle of several maps. |
| **Pictures** | Assets (M9): DM-only upload, `POST /assets/<code>`, type by the bytes (`sniff`: PNG, JPEG, WebP), 5 MB a file, 50 MB and 200 files a table, 2 GiB a server (`limits.js`); served to a player only when their view names it. Solo: IndexedDB, 2 MB a file, 20 MB, 50 files (`SOLO_LIMITS` in `client/assets.js`). Table export (#83) carries files as base64, up to 24 MB (`EXPORT_ASSET_BYTES`). | — | A file that carries pictures for a whole adventure; room for the pictures of several modules. |
| **Archives** | None. Gzip only, from Node's `zlib`, for the server's own text files. One vendored library (Three.js, `packages/client/vendor/README.md`). | — | A zip reader and writer. |
| **Handouts, notes, scenes** | `state.handouts` (`handouts.js`, 200 at most, text 2,000); `note`; `state.scene`, one at a time, prepared or open (`scenes.js`, notes 2,000, 20 present); the scene screen. | — | Many prepared scenes, read-aloud text, DM notes tied to a room. |
| **Creatures** | `spawn { monster, at, name?, hidden? }` (DM), hidden until found; `side` is `party`, `foe` or `object`. | — | A group placed together, with tactics notes; a friendly creature on the map. |
| **Settings** | `SETTINGS` in `engine/dm.js`: `sight`, `diagonals`, `squareRange`, `areaFill`, `autoEngage`, `passiveFind`, `vertical`, `climbing`, `cover`, `creatureCover`, `squareCover`, `engageRange`, `unseenTurns`, `diceThrow`, `pace`, `conclusion`, `xpShare`, `away`, `breaks`. | `characters`, `level`, `takeaway` (`portable-characters.md` Decision 5). | A preset that comes with an adventure. |
| **Market** | — | Market pack and shops (`shops.md` P1 to P7). | — |
| **Atlas** | — | World pack, nodes, routes, encounter tables, parking (`travel.md` W1 to W9). | — |
| **Homebrew** | — | Homebrew packs per table, DM only (`homebrew.md` B1 to B14). | — |
| **Admission** | `newGame(seed, { party })` with 1 to 6 starters or sheets (#308); My characters (`hextable.characters`). | Offer, review, admit, the level meter, forks (`portable-characters.md` P1 to P8). | — |
| **Starting a game** | `newGame` in `scenario.js` (the valley, hexes or squares); the server's `host`; solo `reset`. | — | Starting from anything but the valley; adding prepared content to a game in play. |
| **State version** | 23 (`migrate.js`). | — | — |

## The eleven decisions

### Decision 1: the container is a zip, read by a vendored library

**Question.** One JSON file, or an archive (a zip) holding a manifest and the
pictures beside it? Who reads it, with what, and how is it versioned?

**What changed.** The first draft chose one JSON file with base64 pictures, because a
zip would have meant writing a binary archive reader at the place the server takes
files from strangers. The owner answered (14 November 2026) that a **vendored
open-source library** avoids writing one, as Three.js avoided writing a glTF loader,
and that pictures as separate files are what an author wants. The zip is the format.

**Options.**

- A. **A zip** with a manifest, the data and the pictures as files, read by a
  vendored library. Pictures stay binary; one picture can be swapped without touching
  the rest; an author can open the file with any zip tool.
- B. **One JSON file, pictures embedded as base64** (the first draft). One parser, no
  paths; a third larger before gzip; every edit rewrites the whole file, and a
  picture is a string an author cannot look at.
- C. **A zip read by our own code.** Rejected: a DEFLATE decoder and an archive
  parser written and debugged here, at a security boundary, is what the owner's answer
  avoids.

**Choice: A.** B survives as the **test and tool form** (below), never as what a DM
is handed.

**The file.** `<id>.hextable-adventure.zip` (MIME `application/zip`). The double
extension says what it is and still opens in any zip tool. Inside, in this order:

```
module.json                 the manifest; the FIRST entry; at most 128 KB unpacked
adventure.json              the data; the SECOND entry; at most 4 MB unpacked
pictures/gate.webp          the pictures, flat, by the author's file name
pictures/oswin.webp
pictures/ledger.png
```

- **Manifest first** so a reader can refuse a wrong format, a newer `v`, a module
  over the caps or a module that needs what the table lacks after reading 128 KB, and
  before inflating anything else. A zip whose first entry is not `module.json` is
  refused (the assemble script always writes it first).
- **Pictures by name, with the hash in the manifest.** The manifest lists every
  picture: `pictures: { 'a-gate': { file: 'pictures/gate.webp', mime: 'image/webp',
  bytes: 183402, sha256: '…' } }`. Sections refer to the asset id (`a-gate`), never
  the file name. By name rather than by hash **(design choice)**, because the owner
  wants an author to swap one picture: the author replaces `gate.webp` in the folder,
  the assemble script recomputes its line in the manifest, and nothing else moves. A
  reader matches bytes to the manifest by SHA-256, so a hand-swapped picture whose
  manifest was not updated is refused with its name.
- **Nothing else.** Any other entry is refused, with two exceptions skipped unread
  and named in the report because a zip made by a desktop's "Compress" carries them:
  `__MACOSX/…` and `.DS_Store`. If every entry sits under one top-level folder
  (`flooded-mill/module.json`, as a desktop zips a folder), that folder is stripped
  once; two top-level folders are refused.

**Why pictures beside the data is better.** A text edit changes `adventure.json`
alone; a picture swap changes one picture and one manifest line. A table that already
holds a module's pictures (matched by SHA-256) needs only the changed ones when a new
edition is added (Decision 11), so a small edit is a small upload. Authors see their
pictures as pictures, and a lean copy is simply the zip with some `pictures/` entries
left out.

**A lean copy.** The manifest still names every picture; the zip leaves some or all
out. The import dialog asks for the missing files (matched by SHA-256), or adds the
module without them, as the UVTT import offers "Load without the picture". The hash
(Decision 4) is over the manifest and the data, never the pictures' bytes, so a full
and a lean copy are the same module. A lean copy keeps a module mailable and lets a DM
share prep without sharing purchased art.

**The JSON form, for tests and tools.** `{ format: 'hextable-adventure-json', v: 1,
manifest, data, pictures?: { [assetId]: '<base64>' } }`, read by the rules tests,
the fixtures and `npm run adventure` (`--json`), so the engine tests need no zip and
no vendored file. The game's import dialog and the server's route take **only the
zip** **(design choice: one format at the boundary, one set of hostile tests)**.

**Versioning.** Two numbers, as the market and world packs have them:

- `format: 'hextable-adventure', v: 1` in the manifest is the **format** (the layout
  of the zip, the manifest and the data together). `migrateAdventure({ manifest, data })`
  brings an older `v` up to date, is safe to run any number of times, and leaves a
  module of a newer `v` untouched so the linter refuses it by its version ("This
  module is format 2; this game reads format 1. Update the game."), exactly as
  `migrateMap` does for maps.
- `module.version` is the **edition**: a whole number the author raises on each
  release. With `module.id` (fixed for the life of the module) it says which module
  and which edition a campaign holds.
- **Sections keep their own formats.** A map inside is a map document and is
  migrated by `migrateMap`; a market pack inside is migrated by `migrateMarket`; a
  world pack by its own. A new map format does not need a new module format.

**Who reads it, and where.**

| Where | Who unpacks | Why |
|---|---|---|
| Solo | the browser, in a Worker if A5 measures that a phone needs one | there is no server; the browser is the authority of a solo game, as it is for every solo action |
| The dialog, at a table | the DM's browser | to show the report before anything is sent; advice only |
| A table | **the server**, on `POST /adventure/<code>` (Decision 7) | the server is authoritative; it never trusts the browser's reading |
| `npm run adventure` | Node, through the same wrapper | the author's checks are the game's checks |

All three go through one wrapper, `packages/client/modulezip.js` **(design choice:
beside the vendored files it wraps; the server imports it by path, as it already
imports the rules package)**. The wrapper holds every safety check of Decision 5's
first pass; the library only lists entries and inflates bytes. The wrapper gives the
rules package `{ manifest, data, found: [assetId…] }` and the caller the pictures'
bytes.

**The vendored library.** It is not chosen by this spec, because choosing needs
downloads and checks this environment cannot be assumed to make. The choice and the
vendoring are build stage **A0**. The first draft said the owner or a machine with
npm would do it; the owner answered on 15 November 2026 that he **cannot do it
himself** ("Not me; find another way"). So A0 is split in two, and neither half needs
npm or the owner's hands **(design choice, lead's proposal; the owner asked only for
a way that does not need him)**:

- **A0a, the pick.** An agent reads each candidate's licence file, release list and
  repository as published on GitHub (through `gh api`, as the agents already reach this
  repo; nothing is installed and nothing is run), measures the sizes of the built files
  it would vendor, and answers the six checks below in the issue. It brings the owner **one pick
  and its licence text** to approve in a comment, and nothing is vendored until he
  does. If no candidate passes, it says which check failed and stops; it never writes
  a DEFLATE decoder here.
- **A0b, the vendoring**, after his approval: an agent fetches the pinned tag's files
  the same way (a read of the tagged files, or a shallow clone into a scratch
  directory outside the repo, nothing run from it), computes the SHA-256 of each
  file itself, rewrites import lines only if needed, and writes the README section
  and the `DESIGN.md` row, as the Three.js vendoring did.
- **The catch to check first.** Some libraries keep only TypeScript source in their
  repository and publish the built JavaScript through npm alone. With no npm and no
  build tool in this project, such a library cannot be vendored by A0b. A0a must say,
  for each candidate, whether the repository or a release asset carries the built
  ES module; a candidate that does not is passed over. If every candidate fails this,
  the finding goes back to the owner with the other way open to him: the platform
  already inflates DEFLATE (Node's `zlib`, and the browser's `DecompressionStream`),
  leaving only the zip container's fixed-size records to read, which the wrapper
  already does for its checks. That would replace the owner's choice of a library, so
  it is his to make, not A0's.

Candidates to examine (names only; no size, version or licence here is claimed as
checked):

- **fflate**: a small pure-JavaScript DEFLATE and zip library, believed MIT-licensed,
  with synchronous and streaming inflate and a zip writer;
- **zip.js** (gildas-lormeau): a zip reader and writer built on web streams,
  believed BSD-3-Clause, with entry metadata and streaming reads;
- **JSZip**: widely used, believed dual-licensed MIT or GPL-3.0; reads whole
  archives into memory, so its fit to streaming limits must be checked with care.

What A0a must verify, and A0b write in `packages/client/vendor/README.md` as the Three.js
section does:

1. **Licence**: permissive and compatible with AGPL-3.0-or-later (MIT, BSD, ISC,
   Apache-2.0, zlib); upstream's `LICENSE` copied unchanged.
2. **Pure JavaScript, no dependencies**: an ES module (or one file convertible by
   rewriting import lines only, as Three's five rewrites were), no native code, no
   WebAssembly the project cannot read, no network, nothing loaded at run time; works
   in a current browser and in Node 22 unchanged.
3. **Size**: raw and gzipped, measured the way the README measures Three.js, with the
   increase recorded. Loaded only by the dialog, the solo start and the server, never
   by the default page load.
4. **Maintained**: recent releases, issues answered, security advisories read.
5. **API fit**: lists central-directory entries (name, method, sizes, CRC, flags,
   external attributes) **before** inflating; inflates one entry at a time; can stop
   part-way when the output passes a limit; checks CRC-32; ideally writes a zip, for
   the assemble script. Every check of Decision 5 pass 1 that the API does not answer
   is done by the wrapper reading the fixed-size directory records itself (no
   decompression), and the README says which.
6. **Pinned**: release tag, upstream commit, SHA-256 of each vendored file, the date,
   how it was fetched (a shallow clone into a scratch directory outside the repo,
   nothing run from it), and the upgrade steps.

The reason is added to `DESIGN.md`'s stack table by A0b, as R10 added Three.js's: a
zip is the format the owner chose, and a DEFLATE decoder is general, well-tested code
that a small library already has.

**Reasons.** The owner's choice; pictures as files; small edits stay small; the
dangerous part (DEFLATE) is code many people use, and the part that is ours (the
limits) is a short list of checks with a hostile test each.

**Cost.** One vendored library to pin and upgrade on purpose; a wrapper of checks;
and A0a and A0b, which need the owner once, to approve a pick and its licence.

### Decision 2: what is in a module, and what is not

**Question.** What sections does a module have, and what may never be in one?

**Choice.** The **manifest** says what the module is and what is in the zip; the
**data** holds the sections. Every section is optional except `start` and at least
one map (or a world whose root leads to one).

```js
// module.json, the manifest
{
  format: 'hextable-adventure', v: 1,
  module: {
    id: 'flooded-mill',                       // kebab, fixed for the life of the module
    title: 'The Flooded Mill', version: 3,    // version: the edition, rises on each release
    by: 'Written for the Hextable examples',  // the author's words; a moniker or a name, the author's choice
    blurb: 'Rats in the cellar, and worse.',  // up to 500 letters
    kind: 'one-shot',                         // 'one-shot' | 'campaign', as INTERFACE I7 names them
    level: { start: 1, min: 1, max: 2 },      // the character levels it expects: advice, never enforced (Decision 11)
    party: { min: 3, max: 5 },
    length: { sessions: 1, hours: 3 },        // the author's estimate
    content: 'srd-only',                      // 'srd-only' | 'private' (Decision 9)
    licence: { name: 'CC-BY-4.0', attribution: '…', srd: '…', text?: '…' },   // Decision 9
    made: '2026-11-14',
  },
  needs: {                                    // what a table must have; the compatibility report (Decision 6) reads it
    rules: 'srd-5.2.1',
    grid: 'hex',                              // 'hex' | 'square' | 'both': the grids its maps are drawn on
    homebrew: [ { id: 'ember-folk', version: 2, hash: 'sha256:…' } ],
  },
  data: { file: 'adventure.json', bytes: 48211, sha256: '…' },
  pictures: { 'a-gate': { file: 'pictures/gate.webp', mime: 'image/webp', bytes: 183402, sha256: '…' } },
}

// adventure.json, the data
{
  settings: { diagonals: 'srd', cover: 'on', away: 'dodge', characters: 'own', level: 1, takeaway: 'everything' },
  start: {
    map: 'mill', entry: 'door',               // or { node, entry } with a world (travel.md)
    clock: 1080,                              // minutes from the start of day 1, as s.clock counts (here 18:00)
    light: { cellar: 'dark' },                // level id -> an AMBIENT value, over what the map says
    weather: 'Rain since noon; the river is high.',   // words for the DM: the engine has no weather
    scene: 'arrival',                         // a prepared scene to open at once, or absent
    stage: ['cellar-rats'],                   // encounters placed at the start (Decision 3)
  },
  links:      [ { to: 'drowned-chapel', text: 'The ledger names the chapel downriver.' } ],   // Decision 11
  maps:       { mill: { format: 2, … } },     // map documents, by the module's id
  world:      { format: 'hextable-world', … },       // travel.md's world pack, its maps and assets taken from the module
  markets:    [ { format: 'hextable-market', … } ],   // shops.md's market packs
  shops:      [ { id: 'miller-stall', market: 'mill-goods', template: 'stall', name: "The miller's stall", at: { map: 'mill', area: 'stall' } } ],      // `area`: a shop area of that map (shops.md Decision 4)
  homebrew:   [ { format: 'hextable-pack', … } ],    // the DM's own pack, optional copy (Decision 3)
  encounters: [ … ],                          // Decision 3
  npcs:       [ … ],                          // Decision 3
  scenes:     [ { id: 'arrival', title: 'At the mill gate', image: 'a-gate', present: ['miller'], notes: '…', readAloud: '…' } ],
  handouts:   [ { id: 'deed', title: 'The mill deed', text: '…', asset: 'a-deed' } ],
  notes:      [ { id: 'n-cellar', at: { map: 'mill', region: 'cellar' }, title: 'The cellar', readAloud: '…', dm: '…' } ],
  pregens:    [ { id: 'tamsin', sheet: { … } } ],    // ready-made heroes the DM offers (Decision 3)
}
```

Ids inside a module are the author's, kebab and unique within their section. They
never carry the campaign's prefix: the alias is added when the module is added
(Decision 11), so one file works in any campaign.

**Explicitly not in a module**, and refused by the linter if present:

- **Code of any kind.** No functions (impossible in JSON, and `findFunction` is run
  anyway on what came from a script), no `script`, `code`, `eval`, `expr`, `formula`
  or any field outside the closed key lists of Decision 5, no URLs that are
  followed (a link in a text is shown as text; nothing in a module is fetched from
  the network), no HTML, no SVG (pictures are PNG, JPEG or WebP by their bytes), no
  file in the zip but those of Decision 1.
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
what starts where, which creatures go together, what the DM reads aloud, and which
module comes next.

**Cost.** A closed key list per section to maintain beside the sections' own linters.

### Decision 3: encounters, NPCs, homebrew and pregenerated heroes

**Encounters.** A group of creatures that belong together, with their place and the
DM's plan:

```js
{ id: 'cellar-rats', name: 'Rats in the cellar', map: 'mill', region: 'cellar',
  creatures: [ { monster: 'giant-rat', count: 6, at: { region: 'cellar' }, hidden: true } ],
  budget: { difficulty: 'low', level: 1, size: 4 },   // for the DM's check, never enforced
  tactics: 'They flee up the chute when half are down.',
  stage: 'start' }                                     // 'start': placed when the party first enters its map; 'dm': when the DM says
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
  (DM only), with `encounter` the campaign id (`flooded-mill/cellar-rats`) and the
  creatures written out from the module. It places them all or none (the first that
  cannot stand is the refusal, nothing placed), at most 40, and marks each with
  `enc: 'flooded-mill/cellar-rats'`, a DM-only field. It records
  `s.campaign.modules['flooded-mill'].staged['cellar-rats'] = n` so the panel can say
  "staged" and "done" (staged, and no living creature carries the mark). Staging the
  same encounter twice asks `again: true`; staging from a retired module is refused
  ("The Flooded Mill is retired."). One action is one undo step and one log line ("The
  DM placed Rats in the cellar"). The engine does not read the module to do this: the
  DM is entitled to place creatures, and the action is checked as `spawn` is. The
  second form of `stage`, which takes the party to a module, is in Decision 11.
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
- **Packs belong to the table, not to a module.** Homebrew ids are already prefixed by
  their pack (`hb-ember-folk-…`), so they are not prefixed again by the alias. Two
  modules naming the same pack with the same hash share it; with another hash, the
  second is refused as `homebrew.md` Decision 4 words it ("a different thing with the
  same name"). The table's 4-pack limit counts every module's packs together.
- A module that lists a pack without carrying it needs the table to have it already;
  otherwise the report says "not in this table's rules" and the DM chooses (load the
  pack first, or do not add the module). A second DM given a module with an embedded
  pack is importing a stranger's pack: the dialog shows its reading and asks, as the
  pack manager does.
- Until homebrew B5 is built, a module whose `needs.homebrew` is not empty is refused
  with that reason.

**Pregenerated heroes.** `pregens` are sheets the DM made (what `setSheet` takes and
`validate` passes), at most 8. They are the "from the DM's stable" route of
`portable-characters.md` Decision 8: offered in solo's party choice and, at a table,
assigned by the DM as `addCharacter` does today. In a campaign they are offered
whenever the DM adds a character, not only when the module is added. They carry no
history; a hero who leaves the table becomes a travelling character whose history
starts with one line, `born.how: 'pregen'`, as that spec already says.

### Decision 4: identity: the module id and the hash

- **`module.id`** is the author's kebab id (up to 40 letters), fixed for the life of
  the module. Changing it makes a new module.
- **The hash** is SHA-256 of the canonical JSON of `{ manifest, data }` (keys sorted,
  no spaces, numbers as JSON writes them; the manifest's `data.sha256` and
  `data.bytes` left out, since they describe the data's own bytes): the same canonical
  form the homebrew pack hash uses (`homebrew.md` Decision 3). The manifest lists each
  picture's `sha256`, so a changed picture changes the hash, but the pictures' bytes
  are not hashed, so a full and a lean copy hash the same. The rules package exports
  `canonical({ manifest, data })`; the server and the browser hash its output. Any
  change to any text, map, creature or picture changes it. Zip details (entry order,
  compression level, timestamps) do not.
- **Each picture's `sha256`** is checked against its bytes on import, and the data's
  against `adventure.json`'s bytes. A mismatch is a refusal (a lean copy given the
  wrong picture, a picture swapped by hand without the manifest, or a file tampered
  with).
- **Kept in the state:** one small record per module in `s.campaign` (Decision 11).
  It is how an export says what it needs, how a resumed table checks it was given the
  right files, how the DM panel shows progress, and what a later `recall` or AI DM
  reads.

### Decision 5: validation

**Question.** What is checked, in what order, and how is a refusal worded?

**Choice.** Five passes. The first is the zip wrapper's (`modulezip.js`, Decision 1);
the other four are pure, in `packages/rules/src/adventure.js`. All run in the browser
for the dialog and again on the server before anything is kept.

1. **The zip**, in the wrapper, before and while inflating, with the vendored library
   doing only the inflating. In this order:
   - **Size of the file** at most the cap, on the byte length, before anything is read.
   - **The end of the central directory** found once, at the end; one disk only;
     no ZIP64 (the caps are far below 4 GB, so a ZIP64 record is refused); an archive
     comment of at most 1 KB; nothing after the end record.
   - **Entries** from the central directory, at most the entry cap, each checked
     before any is inflated:
     - **Name**: at most 100 bytes; only `a-z`, `0-9`, `-`, `_`, `.` and the one `/`
       after `pictures` (and after a single stripped top folder); no `..`, no `.`
       segment, no empty segment, no leading `/`, no `\`, no drive letter (`C:`), no
       NUL; the UTF-8 flag ignored because the names allowed are ASCII. A name outside
       this is a refusal with the name shown escaped, never a quiet rename.
     - **Duplicates**: no two entries with the same name, compared after lower-casing,
       so `Gate.webp` and `gate.webp` cannot both arrive.
     - **Kind**: a regular file, or a directory entry (`pictures/`) with no data; an
       entry whose external attributes say symbolic link, device or anything else is
       refused. No encrypted entry (flag bit 0). No nested archive: every picture must
       sniff as PNG, JPEG or WebP, `adventure.json` and `module.json` must parse as
       JSON, and there is no other kind of entry.
     - **Method**: 0 (stored) or 8 (deflate) only.
     - **Layout**: each entry's local header agrees with its central record (name,
       method, flags, compressed and uncompressed size, CRC-32; or, with a data
       descriptor, the descriptor agrees); no two entries' data overlap; no entry's
       data runs past the start of the central directory. This stops the overlapping
       and lying-header bombs.
   - **Order**: `module.json` is the first entry by offset, `adventure.json` the
     second. The manifest is inflated first and passes 2 to 4 before anything else is
     inflated.
   - **Inflating**, one entry at a time: output is counted as it comes, never taken
     from the header; the entry is stopped and the file refused the moment its output
     passes its declared size, its own cap (128 KB, 4 MB, 5 MB), **200 times its
     compressed size**, or the total unpacked cap; then CRC-32 and SHA-256 are checked
     against the central record and the manifest. A bomb costs at most the cap.
   - **Time**: the whole unpack stops at a time limit (5 seconds on the server, which
     checks the clock between chunks; 20 seconds in the browser; both to be measured again
     at the doubled size by A3 and A5, and raised if they must be). The server runs at
     most one module unpack per table and a few per server (`limits.js`, A3), so a
     slow file cannot hold the event loop for others; if A3 measures the 5 seconds as
     too long for the loop, the unpack moves to a worker thread.
   - **Every picture the manifest names** is either in the zip (and matches) or
     missing (a lean copy, reported); every picture in the zip is named by the
     manifest (else refused: no unnamed files).
2. **The budget** of the manifest and of the data, iterative, never recursive, as
   `homebrew.md` Decision 2: depth of each document 16; no key `__proto__`,
   `constructor` or `prototype` anywhere; no control characters in any string, and
   none of the Unicode direction overrides (U+202A to U+202E, U+2066 to U+2069), so a
   name cannot display reversed; every count and length under the caps below.
3. **`lintAdventure({ manifest, data }, { content, grids, found })`**, strict: a
   closed key list for every object of every section; ids kebab and unique within
   their section; every reference resolves (a start's map and entry, an encounter's
   map and region, an NPC's scenes, a scene's `present`, a note's `at`, every asset id
   used is in `manifest.pictures`, every shop's market and template); every `monster`
   is in the content the table has (SRD, plus the homebrew the module names);
   `settings` keys and values are in `SETTINGS`; `start.clock` a whole number from 0
   to 1,000,000; `start.light` values in `AMBIENT`; `links[].to` a kebab id (it need
   not resolve: the linked module may never be added); every `pregens` sheet passes
   `validate`. Then the sections' own linters: `lintMap` for every map (and the
   creatures' cells against it), `lintMarket` (`shops.md`), the world linter
   (`travel.md`), `lintPack` strict for an embedded homebrew pack. A picture no section
   refers to is reported and not stored, so a module cannot use the table's storage
   for files nobody sees.
4. **Pictures**, as they are read: each is the declared `bytes`, its SHA-256 is the
   declared `sha256`, and `sniff` finds the declared `mime` in the bytes. On the server
   the asset store's own checks run again when it keeps them.
5. **Against the campaign** (Decision 11), when the module is added to a game that
   has others: the alias is free, or this is an edition of the module under it; the
   pictures fit the table's room for module pictures; the homebrew packs agree.

**The caps** **(design choice)**, in one constant `ADVENTURE_LIMITS` (the zip caps
are in the wrapper's `ZIP_LIMITS`, the same numbers on both sides):

| What | Cap | Why this number |
|---|---|---|
| The zip file | 100 MB | the owner's "about 100 MB" (15 November; the draft's 48 MB was about half): the pictures' 90 MB, the data's 4 MB, and room for zip overhead; pictures barely compress |
| Unpacked, all entries | 95 MB | 90 MB of pictures, 4 MB of data, the manifest (128 KB) |
| Entries | 320 | 300 pictures, the manifest, the data, a directory entry, and the skipped desktop files |
| Entry name | 100 bytes, the charset of pass 1 | long enough for a readable name, short enough for every file system |
| One entry's ratio | 200 to 1 | a 1 MB map of repeated tiles deflates to about 5 KB; a bomb needs far more |
| Unpack time | 5 s on the server, 20 s in the browser | a 95 MB unpack, nearly all of it stored pictures, takes about a second on a server; the margin is for phones, where the doubled size is what A5 measures first |
| Archive comment | 1 KB | zip tools add short ones |
| `module.json` | 128 KB | a picture's line in the manifest is about 250 bytes, so 300 of them are about 75 KB; the draft's 64 KB would not have held them |
| `adventure.json` (the body) | 4 MB | a world pack is 4 MB at most with its pictures; the body has none |
| Maps | 60, each at most 1 MB as JSON | `WORLD_LIMITS` battle maps; `loadMap`'s 1 MB frame |
| Pictures | 300 | the owner's "about 300 pictures a module"; a quarter of a table's room for module pictures (1,200 files) |
| One picture | 5 MB | the server's `assetBytes`; not scaled, since it is the size of one file, not of a module |
| All pictures | 90 MB | under the zip's 100 MB; under a quarter of a table's room for module pictures (400 MB) |
| Encounters | 200; 40 creatures each; 1,000 in all | `stage`'s 40 |
| NPCs, scenes, handouts, notes | 200, 100, 200, 500 | handouts: `HANDOUT_LIMITS` |
| Links | 20 | a module leads to a few others |
| Pregens | 8 | a party of 6 and two spares |
| Names, titles | 60, 80 | the scene and handout limits |
| `readAloud`, `notes`, `dm`, `roleplay`, `tactics`, handout `text`, link `text` | 2,000 letters | the handout and scene-note limit, so any text can become a handout or a scene note without being cut |
| `blurb`, `weather` | 500 | — |
| `licence.text` | 8,000 | room for a licence's short form |

A campaign adds caps of its own (modules per campaign, room for their pictures):
Decision 11. **What was rescaled and what was not.** The owner chose the two headline
numbers, about 100 MB and 300 pictures a module (15 November); he asked whether the
caps are architectural or only a performance and safety setting, and was told they are
one list of constants, raisable later without changing the format (a module made under
larger caps is refused by a server on smaller ones; there is no ZIP64, so 4 GB is the
format's ceiling). The numbers that follow from them were not asked one by one and are
scaled to match **(design choice, lead's proposal)**: the zip 48 to 100 MB, unpacked 45
to 95 MB, entries 160 to 320, the manifest 64 to 128 KB, all pictures 40 to 90 MB, the
campaign's room for module pictures 200 MB and 600 files to 400 MB and 1,200 files on a
server and 200 to 400 MB on a solo device (Question 2). Not scaled, because they do not
grow with pictures: one picture 5 MB, the body 4 MB, 60 maps, the encounter, NPC, scene,
handout, note, link and pregen counts, every text length, 20 modules a campaign, 8 MB of
map deltas, the 200 to 1 ratio and the unpack times (re-measured, above).

**Refusals** follow the linter's style: a path, then a plain sentence, the first
ten problems, then "and 14 more":

```
zip: the entry "../../etc/passwd" is not a name a module may use.
zip: pictures/gate.webp unpacks to more than 200 times its size; the file is refused.
encounters/cellar-rats/creatures/0: no such monster "giant-ratt".
maps/mill: Region "celar" is not a region of this map.
pictures/a-gate: the picture is not the file the module names (its fingerprint differs).
start: the map "mil" is not in this module.
```

**Reasons.** The same layering the homebrew gate uses (size, budget, strict lint),
with the zip's own pass in front of it, so one review covers both. Caps tied to
limits that already exist mean a module that passes the linter also fits the table it
is added to.

**Cost.** Key lists per section; a zip pass whose every rule has a hostile fixture;
and a test that the worked example and every section's sample pass while each cap
fails one past its value.

### Decision 6: the import dialog, and the compatibility report

**Question.** What does the DM see before anything changes?

**Choice.** One dialog, from the lobby (**Start from a module**: a new game with this
module as its first) and from the DM's drawer at a table (**Add a module**), in a new
client module `adventureimport.js`. It reads the zip on the device, runs the passes of
Decision 5, and shows, before any change and before any upload:

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
  │ This campaign:                               │
  │  ✓ every monster and item is here            │
  │  ! the party is level 4; this module expects │
  │    1 to 2                                    │
  │  ! Goblin Boss: some of its actions are      │
  │    applied by the DM (assist)                │
  │  ! shops are not in this game yet: the store │
  │    is left out                               │
  │  · added beside 2 modules; nothing of theirs │
  │    changes                                   │
  ├──────────────────────────────────────────────┤
  │ [ Cancel ]             [ Add this module ]   │
  └──────────────────────────────────────────────┘
```

**The compatibility report** lists what the table lacks, each with what happens:

| Finding | What happens |
|---|---|
| A format newer than this game | refused: "Update the game." |
| A zip that fails pass 1 | refused, with the first sentences |
| A section this build does not have yet (markets, world, homebrew, friendly NPCs on the map) | left out, named; the DM ticks **Add without it** or cancels |
| A monster, item or object id not in this build's content (a module from a newer build) | refused, with the ids |
| Content below `auto` tier | listed by name with its tier, as `npm run content` words it |
| A homebrew pack missing, or with another hash | as `homebrew.md` Decision 4: "not in this table's rules", or "a different thing with the same name" with the table's reading |
| A setting this build does not know | named and left at the table's default |
| A grid this build does not draw | refused ("This module is drawn on squares; this game draws hexes only."). A campaign may mix hex and square modules: the grid is each map's |
| Pictures missing (a lean copy) | the dialog asks for the files; each found is matched by its hash; the rest are added without the picture, named |
| Pictures over the solo limits | shrunk by the path the UVTT import uses; named |
| Desktop files in the zip (`__MACOSX`, `.DS_Store`) | skipped unread, named |
| The party (solo) or the seated characters (table) against `module.level` and `party` | **warned, never blocked** ("The party is level 4; this module expects 1 to 2."): admission and forks stay `portable-characters.md`'s, under the table's own `level` setting (Decision 11) |
| A game with characters, and the module's `settings` | listed; a tick box **Use this module's settings** (off by default in a game with a party, on for a new game) sends them as ordinary `settings` actions |
| Added to a game in play | "Added beside what is here. Characters, the party, the map in play, progress and the undo history stay. Adding a module cannot be undone; it can be retired." |
| The same module, a newer edition | "This replaces edition 1 of The Flooded Mill in this campaign," with what changed by section (Decision 11) |
| The same `module.id` as a module already here, not an edition of it | the DM chooses: **A new edition of it** (only if the edition is higher and the DM says the file is the same module) or **Another module** under an alias the DM confirms (`flooded-mill-2`) |

The DM's **Add this module** (or **Start this module**, from the lobby) is the only
button that changes anything.

**Reasons.** The UVTT import and the character-file import already do "show what was
read, then load"; the DM sees the same habit. The report reuses the wording of the
homebrew and portable-character reports.

### Decision 7: hosting: solo, the table server, progress, and running it again

**Question.** How does a module reach a table, what is kept where, and how does a
second session, a restart, or a second DM work?

**Adding is the one operation.** Adding a module to a game, empty or in play, is the
same thing (Decision 11): the module is unpacked and checked, its pictures kept, its
record added to `s.campaign`, nothing else in play touched. **A new game from a
module** is an empty game plus one module added, then the party taken to its start:
`startAdventure(unpacked, seed, { party?, grid? })` in `adventure.js`, pure, is that
composition and returns a state as `newGame` does: version, seed, clock
(`start.clock`), settings (the module's, over the defaults), the start map (with
`start.light` applied to its levels), the party set down at `start.entry` (or the
map's starts, until travel W1), the encounters in `start.stage` placed as `stage`
would place them, `s.campaign` with the module's record, the open scene of
`start.scene` if any, and the sections later builds support (markets and shops after
shops P3, the world index after travel W3, `packs` after homebrew B5). It never reads
pictures' bytes: map and scene pictures are already asset ids by then (below). There
is no longer a way to load a module that **ends** the game at a table: the first
draft's "a new game, members kept, characters and undo go" is withdrawn by the owner's
answer.

**Solo.**

- The lobby's **Start from a module** opens the dialog, then the party choice
  (starters, My characters, the module's pregens), then `startAdventure`.
- **Add a module** in the DM's drawer of a solo game opens the dialog, then adds it
  (Decision 11) without touching the party.
- The unpacked modules are kept in IndexedDB (a store `hextable-modules`, beside the
  assets: one record per module, `{ alias, manifest, data }`), their pictures in the
  device's asset store, the references rewritten to their ids. The zip itself is not
  kept. The saved game (`hextable.solo`) is the progress, as today. A module's
  pictures do not count against the solo game's own 20 MB for play; the module store
  has its own room (question 2), and the browser is asked for persistent storage when
  the first module is added.

**The table server.**

- **Add a module** (or **Host from a module** in the lobby, which hosts a table as
  today and then adds it): after the dialog, the client sends the **zip itself**, as
  it was given (or rebuilt by the dialog to add pictures a lean copy was missing, which
  changes no hash), to a new **`POST /adventure/<code>`** with `alias` and
  `useSettings` in the query: the DM with a live seat only; `application/zip`; at most
  100 MB; in the upload slots, rate limits, deadlines and slow-body checks the asset
  route already has; one module upload per table at a time. HTTP, not the WebSocket,
  because the DM's frames are capped at 1 MB plus an envelope and held whole in
  memory, and the upload path already defends against large and slow bodies.
- **The server** unpacks the zip itself with the wrapper (Decision 5, pass 1), runs
  passes 2 to 5, computes the hash, keeps each picture through the asset store's own
  path (type by the bytes, size) under the table's room for module pictures, **reusing
  a file the table already holds with the same SHA-256**, so a new edition uploads
  only what changed; rewrites the data's asset ids to the table's; writes the module
  file; sends the server-only `campaign { add }` action through `apply()`; and sends
  every member the update. A refusal at any pass keeps nothing: pictures already
  written for this upload are removed, and only the DM is told.
- **Where modules are kept.** Each in its own file beside the table's, in a folder
  `<code>.modules/` with one `<alias>.json` holding `{ alias, hash, manifest, data }`
  with the table's asset ids (written once on add and on an update, read on restart),
  as the undo history is kept beside the table, because it is written once and read
  rarely and would otherwise be rewritten with every save of the state. The zip is not
  kept: its pictures are in the asset store and its text in that file. `table.modules
  = Map(alias → { id, version, hash, manifest, data })` in memory.
- **What the state keeps** is only the small records of Decision 11 (a few hundred
  bytes per module, plus its staged counts): never a module's text, maps or pictures.
  A module's map is copied into the state only when the party is taken to it (it is
  then `s.map`, the map in play, as any loaded map is).
- **Who is sent it.** The DM only, as `{t: "modules", modules}` on sitting down and
  `{t: "module", alias, module}` on a change: the DM's panel needs them on any device.
  Never a player, never in a player's history, never in a player's export (there is
  none). A player's request for a module picture is the one identical 404 of the asset
  rules until their view names it (a shown handout, a level background they are sent).
- **A restart** reloads the module files with the table. If one is missing or
  damaged, the table still plays: everything already in play is in the state. The
  DM's panel says "The Flooded Mill is not on this table; add it again", and a zip
  with the same id and hash (or the same id and a higher edition) is taken under the
  same alias without touching the game.

**What stays in the file, and what is progress.**

| In the module (read-only) | In the table (progress) |
|---|---|
| maps as prepared | the map in play: doors opened, regions revealed, what the party has seen, the DM's edits (`s.map`; parked places with travel); which of the module's maps the party has entered (`maps` in the module's record) |
| encounters | which were staged (`staged` in the module's record), the creatures alive, hurt or dead |
| scenes, NPCs, read-aloud, notes | the scene open now, the transcript (`say` events), the chronicle |
| handouts | which were made and shown to whom (`state.handouts`, each with `from`, a DM-only field naming the module's handout by campaign id) |
| markets and store openings | shops opened, stock, quotes, purses (`shops.md`) |
| the atlas | where the party is, parked places, journeys (`travel.md`) |
| settings at the start | settings now |
| pregens | the characters at the table |
| links to other modules | which modules are in the campaign, begun, retired (`s.campaign`) |

Nothing is ever written back to a module.

**Undo.** Adding a module, an edition update and a removal are **not game actions
and are not undone**, as adding a homebrew pack is not (`homebrew.md` review point
13): they pair with files the server keeps. Their record in the state is set by the
server-only action `campaign`, outside the undo set, as `worldIndex` is in
`travel.md`. The DM is told, in the dialog and in the log ("The Flooded Mill was
added to the campaign. Adding a module cannot be undone; you can retire it."), and the
DM's undo list never shows it; an undo of steps made before the add does not remove
the module. `stage` (both forms), `prep`, retiring, and every action the DM's panel
sends are ordinary steps. A new game from a module has nothing before it to undo.

**Running it again.**

- **The next session of the same table** is the same table: the server keeps it, the
  solo game is saved. Nothing to load.
- **The same module with another group, or by another DM**, is the same zip added to
  another game: nothing of the first table's progress is in the module.
- **Moving progress** to another server or device is a table export (#83). It holds
  the state with every module's progress and **delta** (the table's changes relative
  to the module), a file integrity note naming each module by id, edition and hash,
  and the modules' pictures by `sha256` instead of carried; a tick box **Include the
  modules** adds the zips. Module files plus export reproduce the campaign exactly.
  What a delta is, and how an export is restored with, against another edition of, or
  without its modules: Decision 11 (question 4, answered). Import of a table export
  does not exist yet (DEBT P12), so restoring waits for it.
- **A newer edition**: Decision 11.

**Reasons.** One operation (add) for a new game and a game in play keeps one path to
test. A pure start function keeps `apply()` the only mutator and replay exact: the
history starts at the module's state, and an add is a recorded action with everything
it changes inside it. Keeping modules beside the table, not in the state, keeps
patches, views and saves small and keeps modules away from every player path by
construction. The server reading the zip itself keeps it authoritative.

**Cost.** A new HTTP route taking a zip, a folder beside each table, one state field
(`s.campaign`, with each module's progress and delta), one action (`stage`, two
forms), two DM actions (`prep`, `retire`), one server-only action (`campaign`), a
field `from` on handouts, scenes and a module map, and a second allowance for
pictures.

### Decision 8: what the DM's screen does with it, and what players are sent

**The DM's module panel** (a drawer tab "Adventure", a new client module
`adventurepanel.js`), built only from the DM's copies of the campaign's modules, each
shown as module + delta (Decision 11):

- **Modules**: every module of the campaign in the order added, with its status
  (added, begun, retired, missing), edition, level range against the party (a
  warning, Decision 11), **Begin** (sends `stage { begin }`), **Retire** and **Bring
  back** (`retire`), **Remove** (only for an unused module), **Add a module** (the
  dialog), and room used for pictures and deltas. The rest of the panel shows the
  module in play (`current`), with a picker for the others.

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
- **Edit**, on every scene, NPC, handout, note, encounter and store not yet used:
  changes the table's copy (sends `prep`), marked "edited", with **Undo my edit**
  (`prep` with the field set back, or the ordinary undo).
- **Maps**: the module's other maps, **Go there** (`stage { begin, map }`, so the map
  left behind keeps its delta; with travel, `enter`/`goTo` by node).
- **Next**: the module's `links`, as **Go on** when the linked module is in the
  campaign, else as the author's words (Decision 11).
- **Stores** (after shops P6): **Open** from the module's `shops`.
- **The start**: the weather words, the module's blurb, and in a campaign the
  module's start time as advice with **Set the clock**.

Every one of these is an existing action, or `stage`, `prep` or `retire`, checked as
if the DM had typed it, under its existing limits. A module never reaches the engine
by any other way: what the server fills into `stage { begin }` comes from its own
copy, never the client's.

**What players are sent**, by allow list (`view.js`):

| Thing | A player is sent |
|---|---|
| `s.campaign` | for each module not removed: `title`, `by`, `licence.name`, `licence.attribution`, `licence.srd` (shown in About: each author's credit and the SRD's) |
| Never | `alias`, `id`, `version`, `hash`, `status`, `staged`, `entered`, `opened`, `delta` (map ops and `prep`), `current`, `missing`, the modules themselves, campaign ids, the `enc` mark on creatures, `from` on handouts, scenes and maps, tactics, notes, read-aloud not yet read, NPC roleplay, unshown handouts, unopened scenes, maps not in play, links, assets not named by their view |
| Everything else | exactly as today: a shown handout, a said line, a revealed creature, a loaded map by its sight rules |

**Acceptance tests** (in `view.test.js` and the server's): a module whose every DM-only
text holds a canary (`CANARY-NOTE`, `CANARY-TACTIC`, `CANARY-ROLE`, a canary
encounter id, a hidden handout titled `CANARY-HO`, a secret door and a trap) is
started, staged, played through a fight, a scene and a handout shown to one player,
then a second canary module is added and begun, a `prep` edit holding `CANARY-PREP`
is made, and the party is taken back;
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
- **Sharing on the official server, planned now.** The first draft deferred a library of
  modules people can start from, and said nothing in the game waited for it. The owner
  answered on 15 November 2026 (question 12) to **plan for it now**, so the design of the
  service includes a module library from the start. He was shown the draft's conditions as
  what the default would mean and was not asked to change them, so they stand as the
  working conditions, for him to confirm: only `content: 'srd-only'` modules with an open
  licence (`CC-BY-4.0`, `CC0-1.0`, `CC-BY-SA-4.0`); listed under the author's moniker;
  stored and served by hash; linted by the same `lintAdventure`; never a private module.
  The library itself is the service's (storage, listing, take-down, abuse and moderation,
  the moniker check: `docs/service/FOUNDING.md` §2 and §5.6) and belongs to the service
  lead; **what this spec owes it** is below, so the game does not have to change when it
  arrives. All of it is **(design choice, lead's proposal)**:
  - **One set of checks.** The library runs the same wrapper (`modulezip.js`, A0b) and the
    same `lintAdventure`, with the same `ADVENTURE_LIMITS`, at publishing, so a module that
    is in the library fits every table that can hold one, and a module over a server's caps
    is refused there with the same sentences.
  - **A pure verdict on sharing.** `libraryProblems(unpacked)` in `adventure.js` (A16), pure,
    lists what stops a module being shared: not `srd-only`, a licence not in the open list,
    an embedded homebrew pack, a missing or inexact licence block, no statement that the
    prose and pictures are the author's own or openly licensed. The import dialog can show
    "This module could be shared" with it, and the service calls the same function.
  - **The moniker comes from the account, not the file.** `module.by` stays the author's own
    words; the library lists the uploader's moniker, taken from their account by the
    service, so a file cannot claim another person's moniker. The library keys a module by
    its hash (`canonical`, Decision 4) and shows `id` and `version` as the author wrote them.
  - **Adding from the library** is the same single operation as adding from a file (Decision
    11): the DM picks a module, the table server receives the zip from the library and runs
    passes 1 to 5 itself, trusting nothing the library says (the server is authoritative).
    A table never has to be online to the library to play a module it holds.
  - **Cost to the service**, not to the game: whole zips up to 100 MB each (and a library
    of them) to store and serve, bandwidth, take-down, and a licence check by a person.
    The caps were doubled on 15 November; the service lead sizes storage to them.
  - **What this spec does not change.** `docs/service/FOUNDING.md` and `INTERFACE.md` are
    not edited by this spec; adding the library to the service's founding spec and
    interface is for their own process (`WORKING-TOGETHER.md`). An official adventure (I7)
    started from a module could carry `module: { id, version, hash }` so the anonymous
    statistics can relate play time to a module; that would be a change to `INTERFACE.md`
    made by its own process, not by this spec.

### Decision 10: authoring

**Question.** How is a module made, and how can an agent assemble one from an outline
the owner brings?

**Choice.** Three routes to the same file, all ending in the same linter:

1. **From a table: Save as module** (DM, later stage). The DM prepares in the game:
   paints or traces maps in the editor, imports UVTT files, writes handouts, prepares
   scenes, places hidden creatures. **Save as module** reads the DM's own view and
   writes a module zip: the map in play (with its edits, without `seen`), every handout
   (unshown), the prepared scene, the hidden creatures grouped by region as
   encounters, the table's settings, the clock and light; the DM names it and adds
   read-aloud and notes in a short form. Pictures come from the table's files. It is
   the shape a DM who prepares by playing alone already works in.
2. **From a folder: `npm run adventure`** (`scripts/adventure.mjs`; nothing installed, the vendored zip library through `modulezip.js`).
   A folder holds `adventure.json` (the manifest and the small sections), `maps/*.json`
   (map documents: the editor's export or the UVTT import's output), `text/*.txt`
   (read-aloud and notes, referenced as `"@text/arrival.txt"` only in the folder),
   and `pictures/*` (PNG, JPEG, WebP). Commands:
   - `npm run adventure -- build <folder> [--lean] [--json]`: inlines the text, splits
     the manifest from the data, hashes the pictures and writes their lines in the
     manifest, writes `licence.srd`, raises nothing on its own (the author raises
     `version`), lints, and writes `<id>.hextable-adventure.zip` through
     `modulezip.js` (manifest first, data second, pictures stored, not deflated, since
     they do not compress); `--lean` leaves the pictures out, `--json` writes the JSON
     form for tests;
   - `npm run adventure -- lint <file>`: every pass of Decision 5, on a zip or the
     JSON form, the refusal sentences, exit code 1 on a problem;
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
text that is not escaped inside JSON, pictures that stay pictures, in the folder and in the zip.
Route 1 is the simplest for a DM who prepares in the game. Both end in one file and
one linter.

### Decision 11: campaigns: modules are added, side by side

**Question.** What happens when a DM adds a module to a game that already has
characters, a map and history, or a module already? How are two modules kept apart,
how does the party go from one to the next, what is remembered of each, and what does
an export hold?

**What changed.** The first draft made loading a module at a table in play a new
game (question 3) and ran one module at a time (question 9). The owner answered
(14 November 2026) that modules are **additive**: adding one keeps the characters,
the party, progress and history, and the game becomes a campaign. Then (question 4,
the same day) that an export must hold every change the table made **relative to the
modules** (the deltas below), so that the module files plus the export reproduce the
campaign exactly.

**What adding does, and does not do.**

- It adds the module's record to `s.campaign` and its files beside the table
  (Decision 7). Its maps, scenes, encounters, NPCs, handouts, notes, shops, markets,
  atlas and pregens become **available** to the DM under the module's alias. Nothing
  is placed, opened or shown, and the map in play, the party, the clock, the settings
  and every other module are untouched.
- The module's `settings` are applied only if the DM ticks **Use this module's
  settings** (on by default for a new game, off for a game with a party), as ordinary
  `settings` actions, undoable. `start.clock` sets the clock only in a new game; in a
  campaign the panel shows it as advice with **Set the clock** (the existing time
  action) **(design choice: campaign time runs on)**.
- **A new game from a module** is adding one to an empty game, then `stage { begin }`
  (below), in one pure step (`startAdventure`, Decision 7). A game started from the
  valley is a campaign with no modules; adding one to it works the same way.

**The state** (one new field, replacing the first draft's `s.adventure`; the state
version bump and its migration, giving `campaign: { order: [], current: null,
modules: {} }`, are build stage A2):

```js
s.campaign = {
  order: ['flooded-mill', 'drowned-chapel'],      // aliases, in the order added
  current: 'flooded-mill',                        // the module whose map is in play, or null (the valley, a DM's own map)
  modules: {
    'flooded-mill': {
      alias: 'flooded-mill', id: 'flooded-mill', version: 3, hash: 'sha256:…',
      title: 'The Flooded Mill', by: 'Written for the Hextable examples',
      licence: { name: 'CC-BY-4.0', attribution: '…', srd: '…' },
      level: { start: 1, min: 1, max: 2 },        // copied for the warning
      status: 'begun',                            // 'added' | 'begun' | 'retired'
      added: 1080, begun: 1080, retired: null,    // clock minutes
      missing: false,                             // set by the server when its file is absent (Decision 7, restart)
      staged: { 'cellar-rats': 1 },               // progress: encounters staged, by the module's own id
      entered: ['mill'],                          // progress: maps the party has been taken to
      opened: ['gate'],                           // progress: scenes opened
      delta: { maps: { … }, prep: { … } },        // the table's changes relative to the module (below)
    },
  },
}
```

Each record without its delta is a few hundred bytes. Handouts and scenes keep `from`
(the campaign id of what they were made from), creatures `enc`, and a map in play made
from a module carries `from: 'flooded-mill/mill'`; all DM-only.

**Namespaces.** Every id a module brings is used in the campaign as
`<alias>/<id>`: `flooded-mill/cellar-rats`, `flooded-mill/mill`,
`flooded-mill/a-gate` (before the asset id is rewritten to the table's). `/` cannot
appear in a kebab id, so a campaign id is never ambiguous, and two modules' ids never
collide whatever their authors chose. The file never holds the prefix. Entity ids
(`pc1`, `m12`) are still minted by the engine and are never a module's. With shops
and travel, market, store and node ids are prefixed the same way; homebrew ids are
not, being prefixed by their pack already (Decision 3).

**Aliases and collisions** **(design choice: the alias is the campaign's name for a
module, chosen once)**:

| The module being added | What happens |
|---|---|
| A `module.id` not in the campaign | added under alias `module.id` |
| The same id and hash as a module here | nothing to do: "The Flooded Mill, edition 3, is already in this campaign." |
| The same id, a higher edition | offered as an **edition update** (below), after the DM confirms it is the same module (the dialog shows both `by` lines) |
| The same id, the same or a lower edition, another hash | the DM chooses **Another module** under an alias they confirm (`flooded-mill-2`, kebab, free in this campaign), or cancels. Never an update |
| An alias already used | refused; the dialog proposes the next free one |

Caps: 20 modules a campaign; aliases up to 40 letters **(design choice)**.

**Taking the party to a module.** `stage` has a second form, `stage { begin: alias,
map?, entry? }` (DM only), sent by the panel's **Begin**, **Go there** and a link's
**Go on** (below). The server fills it from its module file with the map document
(the module's map with the module's delta for it applied, as `applyMapDelta` gives),
`start.light` (only for the start map), the start scene, and the creatures of every
`stage: 'start'` encounter of that map not yet staged; a client's own fill is replaced,
as `travel.md` W3 fills `map` into actions. The engine, in one step:

1. refuses during a fight, during a journey, and for a retired or missing module;
2. **leaves the map in play.** If it came from a module, the server has filled
   `left: { map: '<alias>/<id>', edition, ops }`, the map's delta from its prepared
   form (`diffMap`, below), which is written into that module's `delta.maps`, so
   doors, revealed regions, what the party saw and the DM's edits are there when the
   party returns. If it is not from a module (the valley, a map the DM made), it is
   replaced as `loadMap` replaces a map today, after the panel's warning ("The valley
   as it is now is not kept."), until travel's parking keeps it. With travel built, a
   module map left behind is parked as `travel.md` Decision 5 says, and its parked
   record holds the delta instead of the whole map;
3. sets down the party (every `side: 'party'` creature on the map in play) at the
   entry, as `newGame` places a party; places the start encounters as `stage` does;
   opens the start scene; sets `current`, `status: 'begun'`, `begun`, and adds the map
   to `entered`;
4. is one undo step and one log line ("The party went to The Flooded Mill"). The
   clock does not move: travel time is the DM's to add, or travel's.

**Links between modules.** A module's data may list `links: [ { to, text } ]`: the
`module.id` of a module that follows, with the DM's words for the hook. The panel
shows a link as **Go on** when a module with that id is in the campaign and not
retired, and as text otherwise ("The ledger names the chapel downriver; The Drowned
Chapel is not in this campaign."). A link never fetches or adds anything. With travel
(A11), each module's world joins the table's atlas under its alias, and a link may
name nodes (`{ to, from: 'river-gate', node: 'chapel-steps' }`) to become a route
between the two atlases; that is `travel.md`'s amendment, made with A11.

**Retiring, and removing.** **(Design choice: retire is the DM's; remove is only for
a module nothing has used.)**

- **`retire { module, back? }`** (DM, an ordinary undoable action): `status:
  'retired'`. The panel lists it under "Retired", read-only; `stage` and `prep` on it
  are refused. Nothing in play changes: its creatures, handouts, scenes, the map in
  play, its deltas and its files stay. `back: true` makes it active again. Retiring is
  how a module leaves a campaign: its content stays as history, never deleted under a
  party's feet.
- **Remove** (the server-only `campaign { remove }`, from the panel's **Remove**):
  only for a module whose status is `added`, with nothing staged, nothing entered or
  opened, no delta, no handout, scene or creature naming it, and not current. It
  deletes the record, the module file and the pictures nothing else names. Like adding,
  it is outside the undo set and the DM is told. Anything else is retired, never
  removed.

**Deltas: the table's changes relative to a module** (question 4, answered 14
November 2026). A delta is a **per-module record of changes, kept in the table's
state** (`s.campaign.modules[alias].delta`), never a rewritten copy of the module.
Module file + delta gives the module as the table now has it. It has two parts:

- **`maps`**: for each of the module's maps the party has left, `{ edition, ops }`:
  the ops that turn the prepared map into the map as the party left it, in the
  vocabulary of `map.js`'s `EDITS` (what `mapEdit` takes), extended with whole-element
  replacements (a level, region, object, wall or door by its id) for anything `EDITS`
  cannot say, and the regions revealed, door and trap states and what the party has
  seen. Made by **`diffMap(prepared, played)`** and applied by **`applyMapDelta(prepared,
  delta)`**, both pure, in `map.js`, with the contract that
  `applyMapDelta(m, diffMap(m, p))` equals `p` for every map (a round-trip test over
  every stock map after scripted play and editing). The map **in play** needs no delta
  while it is in play: it is `s.map`, whole, as today; its delta is taken when the
  party leaves it and when the table is exported.
- **`prep`**: the DM's edits in play to the module's prepared items, keyed
  `'<section>/<id>'` (`scenes/gate`, `npcs/miller`, `handouts/ledger`, `notes/n-loft`,
  `encounters/loft-goblins`, `shops/miller-stall`; with travel, `world/nodes/<id>`):
  `{ set: { field: value, … } }` (whole fields replaced) or `{ removed: true }`. Made
  by a new DM action **`prep { module, item, set? , removed? }`**, an ordinary undoable
  step, checked against the section's closed key list and caps (Decision 5); the panel
  shows every item as module + delta, marked "edited". Things the DM makes from
  nothing (a new handout, a new scene) are the table's, not a module's, and are not in
  a delta.

Progress (`staged`, `entered`, `opened`) sits beside the delta in the record and is
exported with it. A delta holds **only the table's own changes**: the DM's words, the
DM's edits, and map state. It never copies a module's text: an op that replaces a
region carries the region as the table has it, which the DM already holds in the
table; a `prep` field holds what the DM typed. Deltas are DM-only exactly as the
table's other DM-only fields are: never in a player's view, patch, history or error
(Decision 8). Caps **(design choice)**: 1,000 `prep` entries a module, each field
under its section's cap; map deltas 8 MB a campaign in all. Past it, leaving a map
asks the DM to forget the oldest left map's changes ("Forget how the mill was left?"),
never silently.

**A newer edition of a module in the campaign.** Same alias and id, higher `version`,
through the same dialog and route (`campaign { update }`, server-only, outside the
undo set). The server holds the old edition's file and the new one, so it **rebases**
each delta entry three ways:

- an entry whose target the author did not change between the editions is kept as it
  is;
- an entry whose target the author changed, or removed, while the table changed it
  too, is a **conflict**: for a map op, its element (by id) differs between the
  editions; for a `prep` field, the field differs;
- an entry whose target is gone in the new edition is a conflict.

The dialog lists every conflict by path ("maps/mill: the cellar region was redrawn
in edition 4; your revealed cellar and 2 edits to it cannot be kept.") and offers
**Update, and drop these 3 changes** or **Cancel**; nothing is merged by guessing.
Progress ids no longer in the module (an encounter staged, then cut by the author) are
kept as history and named. What is in play keeps its copies (the map in play, the open
scene, shown handouts, staged creatures); what is not yet used is read from the new
edition. The same edition with another hash is refused ("This is not the edition this
campaign holds."); a lower edition is refused.

**The table export** (#83; question 4, answered 14 November 2026):

- It holds the state, as today, and with it `s.campaign`: every module's record,
  progress and delta, and the map in play whole. The DM's export takes the delta of
  the map in play too (`diffMap`) and puts it in the record, so the export says
  everything relative to the modules.
- A **file integrity note**: for each module `{ alias, id, version, hash, pictures:
  [sha256…] }`, and the SHA-256 of the export's own body, so an importer can tell a
  damaged export from a wrong module.
- Module pictures are listed by SHA-256, not carried. A tick box **Include the
  modules** downloads each module's zip beside the export, rebuilt from the table's
  files with the same hash (or, if the export becomes a zip, as folders in it, never a
  zip in a zip).

**Restoring an export** (waits for the import of a table export, DEBT P12):

- **With each module's zip**: each hash is checked against the integrity note; the
  modules are added as on a table (Decision 7, all passes); each delta is checked
  against its module (every map op's element and every `prep` item resolves) and kept;
  the state is restored. Module files plus export give the campaign exactly (a test).
- **With a module of another edition**: refused by default with the report ("This
  export was made with The Flooded Mill edition 3 (hash 1a2b…); you gave edition 4.
  Give edition 3, or restore with edition 3 and update at the table."), because the
  three-way rebase needs the edition the delta was made on. The DM may tick **Rebase
  onto edition 4 without edition 3**: a two-way rebase that keeps every entry whose
  target exists, lists every one whose target is gone, and drops those only on the
  DM's confirmation.
- **Without a module**: a compatibility report names what is needed ("Needs The
  Flooded Mill, edition 3, hash 1a2b…, 6 pictures"). The DM may restore anyway: the
  game plays (everything in play is in the state), the module's record is marked
  `missing`, its deltas are kept untouched, `stage` into it is refused, and the panel
  asks for the zip, which is matched by id and hash when given.

**Admission and the module's level range.** `module.level` is what the author
expects. It is shown, and the dialog and the panel **warn** when the party's levels
fall outside it; nothing is blocked. A module never changes the table's `level`
setting by being added: that setting governs admission and forks
(`portable-characters.md` Decision 8) for the whole campaign, so it changes only if
the DM ticks **Use this module's settings**, and then the dialog says that future
characters are admitted at the new level. Characters already at the table are never
forked or rewound by adding a module. Pregens of every active module are offered when
the DM adds a character (Decision 3).

**Reasons.** The owner wants a campaign. Prefixing at add time keeps a module file
the same in every campaign. Retiring instead of deleting keeps every handout, creature
and log line in play meaningful. Deltas as records of change, not copies, keep the
state small, keep module text out of exports beyond what the table already holds, and
make an edition update a rebase that can say exactly what it cannot keep.

**Cost.** `s.campaign`; `stage { begin }` with a server fill; `prep`, `retire`; the
server-only `campaign` (add, update, remove); `diffMap` and `applyMapDelta` with a
round-trip contract; the three-way and two-way rebase with conflict reports.

## A worked example

Invented for this spec, SRD-only, tiny: one map, two encounters, one store. Ids are
real SRD pack ids (`giant-rat` 25 XP, `goblin-warrior` 50 XP, `commoner`,
`longsword`, `potion-of-healing`, `chest`); the encounters are the SRD's own
low-difficulty example for four level 1 characters (six Giant Rats, 150 XP, within a
200 XP budget) and a group of four Goblin Warriors (200 XP). The map is abridged.

The zip, `flooded-mill.hextable-adventure.zip`, in order:

```
module.json
adventure.json
pictures/gate.webp
pictures/oswin.webp
```

`module.json`:

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
  "data": { "file": "adventure.json", "bytes": 6120, "sha256": "…" },
  "pictures": {
    "a-gate":   { "file": "pictures/gate.webp",  "mime": "image/webp", "bytes": 183402, "sha256": "…" },
    "a-oswin":  { "file": "pictures/oswin.webp", "mime": "image/webp", "bytes": 41210,  "sha256": "…" },
    "a-ledger": { "file": "pictures/ledger.png", "mime": "image/png",  "bytes": 90233,  "sha256": "…" }
  }
}
```

`adventure.json`:

```js
{
  "settings": { "cover": "on", "conclusion": "dm" },
  "start": { "map": "mill", "clock": 1080, "light": { "cellar": "dark" },
             "weather": "Rain since noon; the river is high.", "scene": "gate", "stage": ["cellar-rats"] },
  "links": [ { "to": "drowned-chapel", "text": "The ledger's last line names the chapel downriver." } ],
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
  "shops": [ { "id": "miller-stall", "market": "mill-goods", "template": "stall", "name": "The miller's stall", "at": { "map": "mill", "region": "yard" } } ]
}
```

`pictures/ledger.png` is named by the manifest but not in the zip: this copy is lean
for that picture, and the dialog asks for it. A build without shops reads the market
and the store, names them in the report, and adds the module without them when the
DM ticks **Add without it**.

**In a campaign.** Added to a game whose party has just finished the valley, the
module's ids become `flooded-mill/cellar-rats`, `flooded-mill/mill` and so on, nothing
is placed, and the dialog warns if the party is above level 1. The DM's **Begin**
sends `stage { begin: 'flooded-mill' }`: the party stands in the mill yard, the rats
are in the cellar, the gate scene opens; the valley is replaced, after the warning,
since it is not a module map. Later the DM adds `drowned-chapel`; the mill's link now
shows **Go on**, and taking it writes the mill's delta (the cellar revealed, the
sluice door open, the DM's edit to Oswin's roleplay note as a `prep` entry) into the
mill's record. The table export names both modules by id, edition and hash, and holds
both records with their deltas.

## What the engine, server and client must add

| # | Addition | Kind | Who may send | DM sees | Players see | State version |
|---|---|---|---|---|---|---|
| D0 | The vendored zip library, pinned, with its README section and `DESIGN.md`'s row; `packages/client/modulezip.js`, the wrapper holding Decision 5's pass 1 (`ZIP_LIMITS`, `unpack`, and `pack` for the tools) | vendored code + client/shared module | — | — | — | no |
| D1 | `adventure.js`: `ADVENTURE_LIMITS`, `migrateAdventure`, `budget`, `lintAdventure`, `canonical`, `summarise` (the dialog's and `read`'s words), `placeIn(map, region, bodies)`, the JSON form's reader; pure; never a zip | rules module | — | — | — | no |
| D2 | `s.campaign` and its migration (`{ order: [], current: null, modules: {} }`); `startAdventure(unpacked, seed, opts)` beside `newGame`; `diffMap` and `applyMapDelta` in `map.js`; the rebase (three-way and two-way) with its conflict list, pure | state + rules | engine | all | Decision 8's fields | **+1** |
| D3 | `stage { encounter, creatures, again? }` and `stage { begin, map?, entry? }` (server-filled) in `engine/dm.js`; `prep`; `retire`; the `enc` mark; `from` on `handout`, `scene` and a module map; `campaign { add \| update \| remove }` (server only, outside the undo set); `describeStep` labels | actions | DM; server | everything | the creatures once revealed, as any | same |
| D4 | `view.js`: the allow list of Decision 8 | view | — | — | — | no |
| D5 | Server: `POST /adventure/<code>` taking the zip, the unpack with limits, picture reuse by SHA-256, the room for module pictures, `<code>.modules/`, `{t:"modules"}` and `{t:"module"}` to the DM, the fill of `stage { begin }`, restart reload, edition update with rebase, the export with the integrity note and deltas | server | DM | the modules | nothing | no |
| D6 | Client: the dialog, the solo store, Start / Host from a module, Add a module, the DM's panel with prep editing, links, retire | client | — | — | — | no |
| D7 | `scripts/adventure.mjs` and `package.json`'s `adventure` line | tool | — | — | — | no |

## Build plan

Each row is one pull request. **Lanes**: *engine* rows change `engine/`, `view.js`,
`migrate.js`, `map.js` or what players are sent; they run one at a time, on the
strongest model, and their review points are the hidden-information tests and "a
rejected action changes nothing". *Server*, *client* and *docs* rows can run beside
them where the files do not overlap. Every row runs `npm test`, `npm run content` and
`npm run build`; client rows also run their smoke pass at 1280 x 800 and at 390 x 844
with touch. After every row the valley plays as before and a table with no modules is
unchanged.

| # | Task | Lane | Who | Files it may touch | Done when |
|---|---|---|---|---|---|
| A0a | **Pick the zip library and its licence.** Examine the candidates of Decision 1 against its six checks, read from the upstream repositories through `gh api` with nothing installed or run; for each, whether the built ES module is in the repository or a release asset (the catch of Decision 1); bring the owner **one pick and its licence text** to approve in a comment. Nothing is vendored. Split from A0 on 15 November: the owner cannot do the original A0 and asked for another way | research (no npm, no code in the repo) | Opus | none (an issue comment) | the six checks answered for each candidate with the files read; one pick named with its licence text and its measured sizes, or the failing check named for each candidate; the owner's approval recorded in the issue |
| A0b | **Vendor the zip library and write the wrapper.** After the owner's approval: vendor the picked release as pinned files fetched without npm (a read of the tagged files or a shallow clone into a scratch directory, nothing run from it), with a README section like Three.js's (release, commit, fetch method, raw and gzip sizes, SHA-256 of each file computed here, the import rewrites if any, upgrade steps, what the API does not answer); add the reason to `DESIGN.md`'s stack table; let `build.mjs` copy it; write `modulezip.js` with every check of pass 1 and its hostile fixtures | vendor | Opus | `packages/client/vendor/<library>/` (new), `packages/client/vendor/README.md`, `docs/DESIGN.md`, `scripts/build.mjs`, new `packages/client/modulezip.js`, new `packages/server/test/modulezip.test.js` with fixture zips made by the test itself | the licence is MIT, BSD, ISC, Apache-2.0 or zlib and is copied; every vendored file's hash is in the README and matches; the default page load fetches none of it; every zip case of the hostile list is refused with its sentence in bounded time and memory, in Node and in a headless browser; the example zip unpacks to the JSON form byte for byte |
| A1 | **The format and the linter.** D1, on the unpacked form and the JSON form, for the sections that need nothing unbuilt: `module`, `needs`, the picture list, `settings`, `start`, `links`, `maps`, `encounters`, `npcs`, `scenes`, `handouts`, `notes`, `pregens`; the other sections are recognised and reported as "not in this game yet". Needs no zip: may run before or beside A0 | engine (pure, no engine file) | Opus | `packages/rules/src/adventure.js` (new), `packages/rules/test/adventure.test.js` (new), fixtures in the JSON form | the worked example (lean, no store) lints clean; every hostile case of the list below that is a data case is refused with its sentence; each cap passes at its value and fails one past; `canonical` gives the same string for a full and a lean copy and ignores zip details; no engine file changes |
| A2 | **The campaign in the state, `stage` and deltas.** D2 to D4: `s.campaign` and the **state version bump with its migration**; `startAdventure`; `stage` (both forms), `prep`, `retire`, the server-only `campaign`; `diffMap` and `applyMapDelta`; the rebase functions | engine | Opus | `adventure.js`, `scenario.js` (only to share the party placing), `map.js` (`diffMap`, `applyMapDelta`), `engine/dm.js`, `handouts.js` and `scenes.js` (`from`), `migrate.js`, `view.js`, `history.js`, tests in `adventure.test.js`, `map.test.js` and `view.test.js` | `startAdventure` on the example gives the clock, the dark cellar, the party at the start, six hidden rats placed the same way every time; adding a second module to a game in play changes nothing but `s.campaign`; `stage` of the goblins places four or, with the loft full, none and changes nothing; undo of a `stage` removes them all; `begin` into a second module writes the first map's delta and coming back restores it exactly; `applyMapDelta(m, diffMap(m, p))` equals `p` for every stock map after scripted play; a three-way rebase keeps untouched entries and lists conflicts; `remove` is refused for a begun module; `campaign` is not in the undo list; the canary tests of Decision 8 pass; replaying the history from the started state gives the same state; a valley game migrates with an empty campaign and nothing else |
| A3 | **Server.** D5 | server (names `tables.js`) | Opus | `packages/server/src/tables.js`, `packages/server/src/index.js`, new `packages/server/src/adventure-http.js`, `assets.js` (reuse by SHA-256, the module allowance), `limits.js` (the route's slots and allowance), `packages/server/README.md`, `packages/server/test/` | a DM adds the example to a table in play and the party, map and undo history are unchanged; a player's `POST /adventure` is 403; a 100 MB + 1 zip is 413; a zip bomb is refused within the cap and the time limit with nothing kept; the module file survives a restart and the panel's copy comes back; a missing file leaves the table playing; edition 2 updates a table holding edition 1, uploads only changed pictures, and reports conflicts; edition 1 again is refused; the export carries the integrity note and every delta; no player message or player history holds module text |
| A4 | **Solo.** The `hextable-modules` store, Start from a module and Add a module, the party choice with pregens | client | Sonnet | `packages/client/transport.js` (the solo start, add and store only), `packages/client/assets.js` (store pictures from a module), `index.html` (the lobby button), `mycharacters.js` (pregens in the party choice), `scripts/smoke/adventure.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=adventure`: start the example solo at both sizes, see the gate scene open, find the rats; add a second module and begin it; a reload continues the game; no page errors |
| A5 | **The import dialog and the report.** Decision 6, solo and table, the zip read on the device (in a Worker if a phone needs it), lean pictures asked for and matched by hash, shrinking for solo, the level warning, alias choice on a clash | client | Sonnet | new `packages/client/adventureimport.js`, `adventureimport.css`, `index.html`, `tablecontrols.js` (Add a module), the smoke pass of A4 | the dialog shows the example's summary and report before any change; Cancel changes nothing (no upload made); a bad zip shows the first sentences; a lean picture is matched by its hash; at 390 x 844 every row and button is reachable with a thumb |
| A6 | **The DM's module panel.** Decision 8's panel: modules, Begin, links, retire, prep editing | client | Sonnet | new `packages/client/adventurepanel.js`, `adventurepanel.css`, `drawer.js` (the tab), `app.js` (`describe` for `stage`, `prep`, `retire`), `scripts/smoke/adventure.mjs` | at both sizes the DM reads aloud the cellar note, stages the goblins, opens the gate scene with Oswin, edits his roleplay note, shows the ledger to one player, then goes on to a second module; the other player's screen never shows the ledger |
| A7 | **The assemble script.** Decision 10 route 2, writing the zip through `modulezip.js` | tool | Sonnet | new `scripts/adventure.mjs`, `package.json` (the script line), tests in `packages/rules/test/adventure-script.test.js` | `build` of a folder makes a zip that unpacks to the test fixture byte for byte and whose hash is the fixture's; `--lean` leaves pictures out and keeps the hash; `--json` writes the JSON form; `lint` exits 1 with sentences on a broken folder or zip; `read` prints the summary |
| A8 | **The example module and the authoring guide.** `examples/adventures/flooded-mill/` as a folder, built by A7 in the test; `docs/adventures.md` (how to make one, the folder, the zip, the agent brief, what may not go in a module, the wording rule, campaigns and links) | docs + content | Haiku, reviewed by Opus | `examples/adventures/flooded-mill/**` (new; invented, SRD-only, pictures drawn for the project or none), `docs/adventures.md` (new), a test that lints the example and greps it for the trademark words | the example lints clean and plays in A4's smoke pass; every id and XP figure is the pack's; the guide's agent brief is what Decision 10 says |
| A9 | **Save as module** from a table. Decision 10 route 1 | client | Sonnet | `packages/client/adventureexport.js` (new), `editor.js` (the menu item), `tablecontrols.js` | a DM paints a map, writes a handout, places three hidden goblins, saves as module, adds it to a new solo game, and finds the goblins in the same region |
| A10 | **Markets and stores in a module.** Waits for shops P2 and P3 (and P6 for the panel's Open). `markets` and `shops` in `lintAdventure` (calling `lintMarket`), added under the alias, stores left unopened or opened per `shops`, a store's `at: { map, area }` naming a shop area of one of the module's maps (the map linter checks the area exists; `shops.md` P3a); their `prep` entries | engine | Opus | `adventure.js`, tests | the example with its store adds with the stall unshown; a market that fails `lintMarket` refuses the module with the market's sentence; two modules' markets with the same id do not collide |
| A11 | **The atlas in a module.** Waits for travel W2, W3 and the parking of V1. `world` drawing maps and assets from the module; each module's world joined to the table's atlas under its alias; links as routes between atlases; parked module maps holding deltas; `start.node` | engine + server, with `travel.md`'s amendment | Opus | `adventure.js`, `worldpack.js`, `engine/travel.js`, `packages/server/src/tables.js`, tests | two modules with atlases join one table's atlas; a link route takes the party from one to the other; a world referring to a map its module lacks is refused |
| A12 | **Homebrew in a module.** Waits for homebrew B5 (and B7 for the reading in the dialog). `needs.homebrew` and the embedded pack through the homebrew gate; packs shared between modules | engine + server | Opus | `adventure.js`, `packages/server/src/tables.js` (call the pack path), `adventureimport.js` (the reading), tests | a module with an embedded pack adds it as the DM's; a pack whose hash differs from `needs` refuses the module; a second module with the same pack and hash shares it; one with another hash is refused; no player message holds a homebrew monster |
| A13 | **Admission and pregens at a table.** Waits for portable-characters P4 and P5. The level warning against the meter; `settings.characters`, `level`, `takeaway` only when the DM ticks them; pregens of every active module as the DM's stable | engine + client | Opus then Sonnet | `adventure.js`, the review files that spec names | adding a level 1 module to a level 4 party warns and admits nobody differently; ticking its settings sets `level` 1 for future characters, with the dialog's warning, and forks nobody already seated |
| A14 | **Moving progress.** Waits for the import of a table export (DEBT P12). Restoring an export with its modules, with another edition (refused, or the two-way rebase on the DM's tick), and without them (the report, the `missing` mark) | server + client | Opus | `packages/server/src/tables.js`, the import that P12 adds, tests | an export restored with the right zips continues identically (module files plus export reproduce the campaign: state equal); with another hash it is refused; with a newer edition it is refused with the report, and the tick rebases and lists what was dropped; without a zip it plays and names what is needed |
| A15 | **Friendly NPCs on the map**, if the owner wants it (question 6): a side for creatures that are neither party nor foe, and what `autoEngage` and the arena do with it, after a spec amendment | engine | Opus | `engine/shared.js`, `engine/dm.js`, `engine/resolve.js`, tests | to be written in the amendment |
| A16 | **What a library needs of a module.** `libraryProblems(unpacked)` (Decision 9), the dialog's "This module could be shared" line; the other half of the library (storage, listing, moniker check, take-down) is the service's and is not a row here. Planned now (the owner, 15 November). Needs A1 | engine (pure, no engine file) | Opus | `packages/rules/src/adventure.js`, `packages/rules/test/adventure.test.js` | the worked example reports "could be shared"; a `private` module, an embedded pack, a `CC-BY-NC-4.0` licence, a missing statement and an inexact SRD sentence each give their own sentence; nothing is checked that only the author can state |
| A17 | **Add from the library.** The dialog's second source beside the file, once the service has a library to list: the server fetches the zip by hash and runs passes 1 to 5. Waits for the service's library interface and for A3 and A5 | server + client | Opus then Sonnet | to be written when the service's interface exists | a module added from the library behaves as one added from a file, and a library that lies about a hash or a module is refused by the same passes |

**Order and what waits.** A0a needs the owner once (to approve a pick and its licence)
and A0b, after it, gates every row that reads a zip; A1 does not need either. A1 first;
A2 after A1. A3 and A4 after A0b and A2, side by side (different files; A4 holds `transport.js`, A3 the server). A5
after A3 and A4. A6 after A5. A7 any time after A0b and A1; A8 after A7. A9 after A6.
A10, A11, A12 and A13 each wait for the spec stages named in their row and are not
duplicated here: the market linter, the world pack, the homebrew gate and the
admission review are built once, by their own specs, and a module only calls them.
A14 waits for DEBT P12. The work can stop after any row: after A4 a DM can run the
example solo and add a second module; after A6 a DM runs a campaign of one-map
modules at a table with their scenes, handouts and encounters.

## Hostile file tests

Each is a test in `modulezip.test.js`, `adventure.test.js` or the server's tests.
Every refusal changes nothing: no upload kept, no state touched, no member told
anything but the DM.

1. **Zip size and bombs.** A zip of 100 MB plus one is refused before reading. A small
   zip whose entry inflates past 200 times its size, past its declared size, past its
   own cap or past the 95 MB total is stopped part-way, with at most the cap
   inflated. The classic nested bomb (a zip inside a zip) is refused at its first
   entry (not a name or kind a module has). A "flat" bomb of overlapping entries is
   refused by the layout check before inflating.
2. **Names.** `../../etc/passwd`, `/abs.png`, `C:\x.png`, `pictures\gate.webp`,
   `pictures/../module.json`, `pictures/./gate.webp`, `pictures//gate.webp`, a name of
   101 bytes, a name with NUL, a name with `é` or an emoji, two top-level folders:
   each refused with the name escaped.
3. **Duplicates.** Two `module.json` entries; `pictures/gate.webp` and
   `pictures/Gate.webp`; the same name in the central directory and a different one in
   the local header: refused.
4. **Kinds and methods.** A symbolic link entry (by its external attributes); an
   encrypted entry; method 12 (bzip2), 14 (LZMA) or 99 (AES); a ZIP64 record; a
   multi-disk archive; data after the end record; a 2 KB comment: refused.
5. **Lying headers.** A CRC-32 that differs; a local header whose sizes differ from
   the central record; a data descriptor that disagrees; an entry whose data runs into
   the central directory: refused.
6. **Order and extras.** `adventure.json` first; no `module.json`; an extra
   `readme.txt` or `script.js`: refused. `__MACOSX/…` and `.DS_Store`: skipped unread
   and named; one top folder: stripped.
7. **Time.** A zip built to inflate slowly within every size cap is stopped at the
   time limit, and the server answers other tables meanwhile.
8. **Not JSON**, a byte-order mark with trailing bytes, a JSON array, a JSON string as
   `module.json` or `adventure.json`: refused with one sentence.
9. **Depth bomb.** 10,000 nested arrays in a `notes` text field's place: refused by
   the budget in bounded time with no stack overflow.
10. **Prototype keys.** `"__proto__"`, `"constructor"` and `"prototype"` as keys at
    any depth, in the manifest and the data, including inside a map and a market:
    refused; a test asserts `Object.prototype` is unchanged afterwards.
11. **Unknown fields** anywhere (`"script"`, `"onload"`, `"html"`, a `"public": true`
    on a note): refused, with the path.
12. **Text that looks like code.** A title `<img src=x onerror=alert(1)>`, a note with
    `javascript:` and a `<script>` read-aloud: accepted as text, shown as text in the
    dialog and the panel (the client's `esc`), sent as text in a `say`; nothing is
    rendered as HTML or followed as a link.
13. **Direction overrides and control characters** in a name: refused.
14. **Pictures that lie.** An SVG or HTML file named `.png`; a PNG declared
    `image/webp`; `bytes` that differ; a `sha256` that differs (a picture swapped by
    hand); a picture in the zip the manifest does not name; an asset id `../../x` or
    `a/b`: each refused with the picture's id or name.
15. **Storage abuse.** 301 pictures; one of 5 MB plus one; 90 MB plus one in all; a
    picture no section names (reported and not stored); a module whose pictures pass
    the table's room for module pictures: refused with the room left.
16. **Content that is not in the table.** A monster `giant-ratt`; an `hb-` id with no
    pack; an embedded homebrew pack holding an entry with an SRD id (`goblin-warrior`)
    or without its prefix; an embedded pack over `HOMEBREW_LIMITS`: refused with the
    homebrew linter's own sentence.
17. **Maps.** A map failing `lintMap`; a region that does not exist; creatures in a
    wall or more than a region holds: refused, never moved quietly.
18. **Settings.** An unknown key (named and dropped, not obeyed); a known key with a
    value outside its choices (refused); a `role`, `dm` or `members` key anywhere
    (refused as unknown: a module cannot say who is DM).
19. **Numbers.** `count` 10^9, `clock` negative or 10^12, `version` 0 or a fraction:
    refused.
20. **Who may add.** A player's `POST /adventure/<code>`; the DM's token without a
    live seat; two uploads at once to one table: refused, nothing kept.
21. **Editions and aliases.** The same id and edition with another hash offered as an
    update; a lower edition; an alias already used; an alias with `/` or 41 letters:
    refused.
22. **Campaign ids.** A module whose ids include `flooded-mill/cellar-rats` or any
    `/`: refused (prefixes are the campaign's, never the file's). Two modules both
    with an encounter `cellar-rats`: both staged, each creature marked with its own
    module's id.
23. **Retired and missing.** `stage`, `begin` and `prep` on a retired module, `begin`
    into a missing one, `remove` of a begun one: refused, nothing changed.
24. **Hidden means absent.** The canary module of Decision 8, added to a game in play
    beside a second canary module: no player message, patch, history entry or error
    sentence holds a canary before the DM shows it, and no delta or `prep` text ever
    reaches a player.
25. **No progress inside.** A module carrying `state`, `rng`, `key`, `history`,
    `delta` or a character file's `cid` and `blocks`: refused as unknown fields.
26. **Replay.** A campaign of two modules, played, exported with its history:
    replaying the history from the started state without the module files gives an
    identical state.
27. **Deltas.** A delta whose map op names an element the module lacks, or a `prep`
    entry with a field outside the section's key list or over its cap: refused on
    restore and on `prep`. An export whose integrity note differs from its body: refused
    as damaged. An export with a delta made on edition 3, given edition 4: refused with
    the report unless the DM ticks the two-way rebase.
28. **Ids from the engine's namespace.** An NPC or encounter id `pc1` or `m12`:
    accepted as the module's id and never becomes an entity id (entity ids are minted
    by the engine).
29. **No cross-table probing.** A lean module naming the `sha256` of a picture
    another table holds is not matched against it: pictures are matched only against
    files the DM gives in the dialog or the same table already has.

## Where this spec changes or meets existing specs

Each is stated so the owner can see every touch. None reverses a decision there; the
rest add a route or a field, except item 11, which is a recorded exception to a
project rule, as Three.js was.

1. **`maps-and-objects.md` Decision 1** says a map can be "shipped inside a content
   pack as part of a scenario". Under this spec a scenario is a **module**, not a
   content pack: content packs hold rules content (`homebrew.md`), and a module holds
   maps and prep. This replaces that phrase's meaning; the maps spec is not edited by
   this PR, so the change is recorded here. `map.js` gains `diffMap` and
   `applyMapDelta` (A2).
2. **`travel.md` Decision 2.** A world pack inside a module takes its `maps` and
   `assets` from the module (its own `maps` and `assets` are empty), so a battle map
   is held once. The server keeps such a world from the module's file, not from a
   separate `world` message. A standalone world pack is unchanged. **New with
   campaigns:** a table may hold several modules' worlds, joined into one atlas under
   their aliases, and a parked module map holds a delta instead of the whole map; that
   is an amendment to `travel.md`, made with A11. (A pointer is under its own heading
   in `travel.md`.)
3. **`shops.md` Decision 2.** Market packs also reach a table inside a module; the
   linter and the import are the same (`lintMarket`, `market { add }`'s path). The
   module's `shops` list adds store openings, shown to nobody, which `shops.md`
   question 11 left out of scope for scenes. Market and store ids are prefixed by the
   module's alias. (Pointer in `shops.md`.)
4. **`homebrew.md` Decision 3.** A second way for the DM to add their own pack: inside
   their module. Same gate, same limits, same DM-only rule; a module from a player
   cannot exist, because only the DM may add one. Packs are the table's and shared
   between modules. (Pointer in `homebrew.md`.)
5. **`portable-characters.md` Decisions 5 and 8.** A module may preset `characters`,
   `level` and `takeaway`, applied only for a new game or when the DM ticks them; its
   `level` range is a warning, never a block; its `pregens` are the "DM's stable"
   route. The review and admission are unchanged. (Pointer in
   `portable-characters.md`.)
6. **The table export (#83)** gains `s.campaign` with every module's progress and
   delta, a file integrity note naming each module by id, edition and hash, and module
   pictures by hash instead of carried, unless the DM ticks Include the modules.
7. **Handouts and scenes** gain an optional DM-only `from`. `HANDOUT_LIMITS` and
   `SCENE_LIMITS` are unchanged; module text is capped to fit them.
8. **`DESIGN.md` storage row** ("one JSON file per table") becomes one JSON file per
   table plus, for a table with modules, a folder of module files beside it, as the
   undo history file already is. Not edited by this PR.
9. **`docs/service/INTERFACE.md` I7** could carry each module's id, edition and hash;
   proposed here only, for that file's own process.
10. **State versions.** `shops.md` and `travel.md` each say their stage moves the
    state from 21 to 22; the state is at 23 today. Each stage, this spec's A2
    included, takes the next free version when it is built.
11. **The no-dependency rule** (CLAUDE.md, AGENTS.md, `DESIGN.md`). A zip library is
    vendored as Three.js is: pinned files, not installed, one README, its reason in
    `DESIGN.md`'s stack table. A0b writes that row and the README section; this PR
    edits neither. `packages/client/vendor/README.md`'s line "Nothing else in the repo
    may import it" becomes a list naming `modulezip.js` (browser and server) as the
    zip library's only importer.
12. **The first draft of this spec** is changed in three places by the owner's
    answers: the container (Decision 1), loading at a table in play (now adding, never
    a new game: Decisions 7 and 11), and one module at a time (now a campaign:
    Decision 11); the export gains deltas (question 4). `s.adventure` is replaced by
    `s.campaign`.

## Risks

- **A large module on a phone.** A 90 MB set of pictures (the cap since 15 November,
  about double the draft's) is no longer a base64 string, but a phone still holds each
  picture while it is checked and stored, and the solo device now keeps up to 400 MB
  of module pictures. The caps and the lean form bound it; the dialog unpacks in a
  Worker if a real phone struggles (A5 measures, at the new size first), and the solo
  room may have to be lower on a phone than on a desktop, which the dialog says
  before it adds a module, not after.
- **The library is somebody else's code at a security boundary.** The wrapper's
  checks come before the library inflates anything, and the hostile fixtures are
  ours; an upgrade of the library re-runs them. A0b records what its API does not
  answer and the wrapper does instead.
- **A0 cannot be done by the owner, and cannot be assumed to be doable here.** Every row
  that reads a zip waits for A0b, which waits for the owner's approval of A0a's pick.
  The risk is the catch of Decision 1: a library whose repository holds only TypeScript
  source cannot be vendored without npm. A1 and A2 do not wait, so the engine work
  need not.
- **A campaign grows.** Twenty modules' pictures and deltas sit beside one table. The
  room for module pictures (400 MB, so four full-size modules' pictures if none are
  shared) and the 8 MB of map deltas bound it, and the panel says how much is used.
  A server that hosts many tables will want its own total (`limits.js`, 2 GiB today)
  raised, which is the operator's setting.
- **Two places for a map.** A module's maps are prep; the table's map, and the deltas,
  are progress. A DM who wants their edits in the module itself uses Save as module
  (A9), never a write-back.
- **A rebase drops something the DM wanted.** It is never silent: the conflict list is
  shown, and the DM may cancel and keep the older edition.
- **Sections that wait.** Until A10 to A13, a module with a store, an atlas or
  homebrew is added without them, or is refused for homebrew. The report must say so
  every time.
- **Private material on the server.** A purchased module sits on a table server for
  as long as the table does. The server deletes it with the table, never lists it,
  and never serves it to anyone but that table's DM.

## Questions for the owner

Each has a default; work proceeds on the default. Questions 1, 3, 4 and 9 were
answered by the owner on 14 November 2026; questions 2, 10, 11 and 12 on 15 November
2026 (issue #193, the comment "Q&A lead, 15 November, 08:50 ET"), and question 5, skipped on 14 November,
stays on its default. Every question now has an answer.

1. **The container.** *Answered 14 November 2026: a zip, with the pictures as
   separate files beside a manifest and the data, read by a small vendored
   open-source library.* What changed: the first draft's single JSON file (and its
   gzip form) is gone as the owner-facing format; the JSON form stays for tests and
   tools only; the vendoring is build stage A0, which needs the owner or a machine
   with npm (Decision 1). **Amended 15 November 2026:** the owner cannot do A0 himself
   ("Not me; find another way"), so it is split in two without npm: A0a brings him a
   pick and its licence to approve, A0b vendors it after he does.
2. **The caps.** *Answered 15 November 2026: changed, start bigger, about double.* He
   first asked: "Is this question architectural, constraining the future or is it a
   performance manager?" The answer given: a performance and safety setting in one list
   of constants, raisable later without changing the format (a module made under larger
   caps is refused by a server on smaller ones; there is no ZIP64, so 4 GB is the
   format's ceiling). He then chose roughly double the draft: **about 100 MB and 300
   pictures a module** (the draft was 48 MB and 150). What changed: the numbers that
   follow from those were not asked one by one and are scaled to match, as the lead's
   proposal: a zip of at most **100 MB** and **95 MB** unpacked, **320** entries, a
   **128 KB** manifest, **300** pictures and **90 MB** of them in all, for one module;
   unchanged: a 200 to 1 ratio, 5 seconds to unpack on the server (re-measured), 4 MB of
   data, 60 maps, 5 MB a picture. For a campaign: 20 modules; module pictures in a room
   of their own, **400 MB and 1,200 files** a table on the server (configurable in
   `limits.js`) and **400 MB** on a solo device (was 200 MB and 600 files, and 200 MB),
   beside the table's 50 MB for play; 8 MB of map deltas. The table in Decision 5, the
   upload limit in Decision 7, the hostile tests, the A3 row and the risks follow.
3. **Loading a module at a table in play.** *Answered 14 November 2026: modules are
   additive.* What changed: adding a module keeps the characters, the party, progress
   and history; its content is added under its alias; a new game from a module is
   adding one to an empty game; adding is outside the undo and the DM is told; there
   is no longer a load that ends the game (Decisions 7 and 11).
4. **The module in an export.** *Answered 14 November 2026: the export names each
   module by id, edition and hash, with a file integrity note, and a tick box includes
   the modules; and it must include every delta, the table's changes relative to each
   module, so that module files plus export reproduce the campaign exactly.* What
   changed: deltas are defined (Decision 11), kept in the state per module, rebased on
   an edition update, refused or rebased two-way on the DM's tick when restored against
   another edition, and an export restores without its modules with a report naming
   them.
5. **Encounters placed at the start.** *Default: an encounter marked `stage: 'start'`
   is placed, hidden, when the party is first taken to its map (`stage { begin }`, or
   first enters it, with travel); others wait for the DM's Stage.*
6. **Friendly NPCs on the map.** *Default: not in the first build; NPCs are scene
   people, and become creatures only when the DM makes them a foe. A side for
   neutral creatures is its own engine amendment (A15).*
7. **Pregenerated heroes in a module.** *Default: allowed, up to 8 a module, as sheets
   with no history; they are the DM's stable, offered whenever the DM adds a
   character.*
8. **A newer edition of a module in a campaign.** *Default: allowed for the same id,
   higher edition; what is in play keeps its copies, what is unused comes from the new
   edition, the table's deltas are rebased three ways, and every conflict is listed
   for the DM to accept or cancel; only changed pictures are uploaded.*
9. **One module at a time.** *Answered 14 November 2026: no; modules are added into
   the current game, making a campaign.* What changed: namespaces by alias, progress
   and deltas per module, `stage { begin }` and links to move the party between
   modules, retire (and remove only for an unused module), the level range as a
   warning (Decision 11).
10. **Example modules in the repo.** *Answered 15 November 2026: default confirmed: yes,
    invented and SRD-only, under `examples/adventures/`, linted and smoke-played by the
    tests; the first is the worked example of this spec.* What changed: nothing.
11. **The valley as a module.** *Answered 15 November 2026: default confirmed: not now.*
    The starter valley stays `newGame`, a campaign with no modules; making it the first
    stock module would prove the format but changes every test that starts a game.
    What changed: nothing.
12. **Sharing modules on the official server.** *Answered 15 November 2026: changed: plan
    for it now,* so the design of the service includes a module library from the start.
    The draft's conditions (only `srd-only` modules under an open licence, by the author's
    moniker, stored by hash) were shown to him as what the default would mean; he was not
    asked to change them. What changed: Decision 9's "Sharing" bullet is no longer
    "later"; the rows A16 and A17; the library's storage cost is named for the service
    lead; `docs/service/` is not edited by this spec and needs its own amendment.
