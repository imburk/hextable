# Spec: square grid

Status: agreed. Issue #240; the owner's answers of 14 November are recorded under "The owner's
answers" below and in the decisions they change. Built so far: S0 to S6.

The owner asked on 13 November: "can we pivot to squares?" He brought four
published battle maps, all drawn on a square grid. `maps-and-objects.md`
already records the cost of hexes under such a picture (Decision 4 and
"Hexes against square maps") and left a square-grid mode open as "a far
larger change".

This spec scopes three ways to answer him, measures what each costs in this
codebase, recommends one, and gives the design and the build order for it.
It decides nothing for the owner: the questions at the end each carry a
default, and work can proceed on the defaults or stop at any row.

- **A. Replace**: squares everywhere, hexes removed.
- **B. Both**: a map says which grid it uses, `hex` or `square`; the engine
  works through one geometry interface. Existing hex maps, tests and saved
  tables keep working.
- **C. Stay**: hexes only, with better help for square pictures.

Every number below was measured on `main` at `cf486a2` with throwaway
scripts kept under `/tmp/sq240/` (named in the appendix). Nothing was
guessed; where a number is a lower bound it says so.

## Rules that bind this design

- **Everything goes through `apply()`.** A grid changes how positions are
  measured, never who may change them.
- **The rules package stays pure.** The grid is read from the map in the
  state (`gridOf(state.map)`); there is no module-level "current grid",
  because one server process runs many tables at once and a global would
  leak one table's grid into another's rules.
- **A rejected action changes nothing; the engine never pretends.** Where a
  square-grid rule is not in the SRD, it is a table rule with a default and
  is named as such here, never called SRD.
- **Only SRD 5.2 rules.** The SRD text is `reference/srd52/srd52-flow.txt`;
  line numbers below are into that file.
- **Mobile is first-class.** Every client row is checked at 390 x 844 with
  touch and at 1280 x 800.

## What the SRD says about playing on a grid

The SRD's only grid rules are for **squares**. It says nothing about hexes
anywhere (the word appears only as the spell Hex): the hex grid is already a
Hextable choice.

| Question | SRD 5.2.1 text | Line | On squares |
|---|---|---|---|
| Size of a square | "Each square represents 5 feet." | 1810 | 5 ft, as a hex is today |
| Speed on a grid | "move square by square on the grid, using your Speed in 5-foot segments" | 1811-1816 | Speed / 5 squares |
| Diagonal movement | "It costs 1 square of movement to enter an unoccupied square that's adjacent to your space (orthogonally or diagonally adjacent). A square of Difficult Terrain costs 2 squares to enter." | 1817-1823 | **A diagonal costs the same as a side step.** No 5-10-5 rule in the SRD |
| Corners | "Diagonal movement can't cross the corner of a wall, a large tree, or another terrain feature that fills its space." | 1824-1825 | A rule the engine must enforce (Decision 5) |
| Range and adjacency | "count squares from a square adjacent to one of them and stop counting in the space of the other one. Count by the shortest route." | 1826-1829 | Distance is the larger of the two offsets; the 8 squares around a creature are within 5 ft |
| Reach | "A creature has a 5-foot reach and can thus attack targets within 5 feet" | 2075-2078 | With the range rule: all 8 neighbours |
| Space of a size | Tiny "4 per square", Small and Medium "1 square", Large "4 squares (2 by 2)", Huge "9 squares (3 by 3)", Gargantuan "16 squares (4 by 4)" | 1893-1943 | Footprints are given by the SRD itself (on hexes, 1/3/7/12 is our own choice, `maps-and-objects.md` Decision 3) |
| Moving through others | ally, Incapacitated, Tiny, two sizes apart; another's space is Difficult Terrain | 1945-1956 | Unchanged; already built grid-free |
| Areas of effect | Six shapes defined geometrically, each "extends in straight lines from a point of origin" (Area of Effect 32651-32680, Cone 33026-33039, Cube 33096-33102, Cylinder 33112-33118, Emanation 33377-33385, Line 33767-33771, Sphere 34195-34199). A Cone's "width at any point along its length is equal to that point's distance from the point of origin" | as given | **Silent** on which squares a shape covers. Table rule (Decision 6) |
| Cover | Half, Three-Quarters, Total by how much of the target an obstacle covers | 1992-2010, 33043-33048 | **Silent** on how to judge it on a grid. Design choice (Decision 7) |
| Flanking | Not in the SRD (no hit for "flank") | — | Out of scope |
| Squeezing | Not in the SRD 5.2.1 | — | Out of scope, as today |

## Where we are

What is grid-free already and what is bound to hexes, by subsystem. "Calls"
are calls of a `hex.js` function that depends on the grid (`dist`, `range`,
`neighbors`, `DIRS`, `toWorld`, `fromWorld`, `cone`, `band`, `along`);
`col`, `key`, `parse`, `reachable` and `pathTo` are grid-free and are not
counted. Full lists are in the appendix.

| Subsystem | Files | Grid-free | Hex-bound |
|---|---|---|---|
| Positions and keys | everywhere | `{ q, r, z }` integers and `"q,r"` keys work for any grid of cells | nothing, if a square position is also `{ q, r }` (Decision 2) |
| Path finding | `hex.js` `reachable`, `pathTo` | Dijkstra over a `stepsFn`: grid-free | the steps it is fed |
| Movement | `engine/world.js` `moveOptions` | costs in feet, terrain, Difficult Terrain, height, climbing, ladders, moving through creatures | `H.neighbors` for walking; the flyer loop `i < 6` (world.js:132) |
| Distance, reach, OA | `space.js` `gap`, `apartAt` | height rules (`vertical`), reach by size | `H.dist` |
| Size | `space.js` `SHAPES`, `content/sizes.js` | heights, Tiny sharing (4, as the SRD's square) | the 1/3/7/12 shapes built from `H.DIRS` |
| Areas | `engine/world.js` `layout` | `band` and `along` are in feet; height of each shape | `H.range` (sphere, cylinder, emanation), `H.cone` (a 60° wedge, not the SRD's width = distance) |
| Walls and doors | `walls.js` | **segments in feet**: `crosses`, `barriers`, blocked steps are grid-free | `center()` (hex layout, √3), `edgeSegment()` and `objectHexes()` (`H.DIRS`, corner radius 5/√3), `edge` index 0 to 5 on a door |
| Sight and cover | `sight.js` | lines between points in feet, floors, light | `CORNERS` (six, at 30° + 60°i) and the cover thresholds on six corners (sight.js:99-106) |
| What players are sent | `view.js`, `vision.js` | regions, `seen`, events filtered by cells | `REACH = 5/√3` (view.js:210, which wall pieces are sent); the vision flood over `H.neighbors` |
| Regions, objects, traps, zones, terrain | `space.js`, `zones.js`, `terrain.js`, `engine/movement.js` | sets of cell keys; triggers by distance | `H.dist` only |
| Monster AI | `ai.js` | **entirely**: it imports no `hex.js`, only engine helpers | none |
| Marching order, followers | `engine/movement.js` | — | `KEEP_UP = 2` cells, `H.dist` |
| Arena lock | `engine/resolve.js` `startEncounter` | — | `H.range(center, ARENA_RADIUS = 6)` |
| Timeline (client) | `client/timeline.js` | beats | its own copy of the hex distance (timeline.js:52) |
| Default renderer | `render.js` | camera, models, beats | `UNIT = √3/5`; tiles are six-sided prisms (`ring(..., 6, π/6)`, :163, :633); highlight rims (:801-805); picking through `H.fromWorld` (:459, :1066) |
| Three.js renderer | `render-three.js`, `three-build.js` | Three.js scene | the same code as `render.js`, duplicated until R14 (`docs/DEBT.md` P25) |
| Floors | `client/floors.js` | clipping cells to walls, patches | `hexCorners` (six), the six-strip grid loop (:324, :488), `HEX_RADIUS` |
| Editor | `client/editor.js` | trace, scale, nudge, levels, regions | brush `H.range`; door edges `(e + 3) % 6` (:163); stairs on "the three grid directions" (:317); Fill floor row `5√3/2` (:570); `#doorAt` (:501) |
| UVTT import | `import-uvtt.js` | walls and doors copied as segments in feet | the hex tiling loop (:83-91) and `SIZE = 5/√3` |
| Stock maps | `scripts/gen-maps.mjs`, `content/maps/*.js` | walls as segments | layouts in hex offset coordinates and six named directions |
| Server | `packages/server/src` | **entirely**: it stores state JSON and migrates it on load (tables.js:73); no grid code | none |
| Content packs | `content/srd52/` | **entirely**: areas are shapes in feet | none (4 uses of the word in text) |

**One measurement says most of it.** With `hex.js` alone swapped for square
maths in a copy of the repo (8 neighbours, distance the larger offset, a
square `range`), 12 of the 1,013 tests that pass on `main` fail. With
`walls.center`, the sight corners and `view.js`'s `REACH` swapped too, 37
fail (lists in the appendix). The engine already routes almost all of its
geometry through `hex.js` and a handful of constants. That makes an
interface mostly mechanical, and it also says the test suite does not, by
itself, guard a square grid: most tests place creatures with `H.neighbors`
and measure with `H.dist`, so they pass on either grid.

## What a square-grid picture costs on today's hexes

Measured with the real `walls.js` and `hex.js` (`/tmp/sq240/misfit.mjs`): a
corridor 60 ft long drawn on a square grid, at ten offsets across one square.

| Corridor | Medium (1 hex) gets through | Large (3 hexes) gets through | On squares |
|---|---|---|---|
| 5 ft, east-west | 10 of 10 | 0 of 10 | Medium always; Large never (SRD: a 2 by 2 space) |
| 5 ft, north-south | **8 of 10** | 0 of 10 | Medium always |
| 10 ft, east-west | 10 of 10 | **4 of 10** | Large always |
| 10 ft, north-south | 10 of 10 | **8 of 10** | Large always |
| 10 ft, diagonal | 10 of 10 | 10 of 10 | Large always |

That is the owner's problem in numbers: a Large ogre that fits the corridor
on the picture is stopped in it more often than not. Option C can only move
that, a wall at a time.

## The options

### A. Replace

What changes: `hex.js` becomes square maths; every hidden hex constant
(appendix, list 2) is rewritten; footprints, areas, cover, the renderers,
floors, editor and importer follow; the five stock maps and the valley are
redrawn on squares; saved tables and exports are converted.

What breaks:
- **Saved tables and exports.** Every one holds a hex map. A converter can
  keep walls (they are segments in feet) and move each tile, region cell,
  object, start and position to the square holding its hex centre, but a
  hex map's walls zig-zag at 30° and 60°, so the converted map has the
  mirror image of today's problem. Mid-fight tables lose their arena;
  lasting areas lose their cells; every undo history is dropped (any state
  version bump drops them already, `tables.js`:66-68).
- **Stock maps**: five, 3,220 tiles, 2,549 region cells, 62 objects (27
  doors on hex edges), 25 starts, laid out in hex offset coordinates in
  `scripts/gen-maps.mjs`. Redrawn, not converted.
- **Tests**: 292 of 988 tests write positions or hex keys in their own body,
  in 72 files; 559 more run on positions set in shared fixtures; the 37 of
  the crude swap fail outright; `client/floors.test.js` (25 tests) is about
  hex cells. Each has to be re-read, because a test that still passes may
  now test something else.
- **The starter scenario** (`scenario.js`, a hex disc of radius 13) and 16 of
  the 22 smoke passes, which use hex positions.
- There is **no safe stopping point**: between the first engine change and
  the last renderer change, `main` plays neither grid well.

What the owner gets: one grid, the SRD's own; the published maps fit; a
smaller engine at the end (the hex branches gone). He loses the hex maps
already made, and the stock maps until they are redrawn.

### B. Both, behind one geometry interface

What changes: a new module `grid.js` holds two geometries with one set of
functions; every caller asks `gridOf(map)` for the right one; a map document
says `grid: 'hex' | 'square'`, absent meaning hex. Hex behaviour is the code
that runs today, moved, not rewritten. Square is new code beside it.

What breaks: nothing on purpose. The first four jobs change no behaviour and
no test. The map format goes to 2 and the state to version 21 (one test line
changes, `space.test.js`:79, which pins the old field name). Saved tables,
exports, stock maps and the valley migrate to `grid: 'hex'` and play as
before. Every new geometry feature after this is written twice, and square
maps get their own tests in addition to today's.

What the owner gets: square maps that play by the SRD's grid rules, the
published maps traced or imported onto a grid that matches them, and
everything made so far still working. A table can move between a hex map and
a square map with `loadMap`.

### C. Stay, with better help

What changes: the editor learns the picture's own square grid (mark one
square to set scale and origin, show it as an overlay), tracing snaps to the
picture's square lines, a list of the steps where hexes and the picture
disagree with one tap to move a wall, and the UVTT importer tries several hex
origins and keeps the one that blocks least.

What breaks: nothing. No state change, no test change.

What the owner gets: easier tracing. The table in the previous section does
not change in kind: Large creatures still stop in 10-ft corridors at most
offsets, areas and reach still count hexes against squares the players can
see on the picture, and the picture shows two grids at once.

### Cost

From the measurements in the appendix. "Files" counts existing source
files changed, then new ones; "tests changed" counts existing tests that
must be edited.

| | A. Replace | B. Both | C. Stay |
|---|---|---|---|
| Jobs | about 24 by the safe route (B's 18, then convert, redraw five maps and the valley, remove hex); about 15 as one big change with no safe stop | 18 | 4 |
| Lanes | engine, client, render, editor, content, server | engine, client, render, editor, content, server | editor, engine (importer only) |
| Files touched | about 45 source + the 5 stock maps redrawn + up to 72 test files | about 40 source (the 26 that import `hex.js`, the hidden-cost files, 5 stock maps regenerated) + about 10 new | 3 to 4 (`editor.js`, `import-uvtt.js`, `floors.js`, a test) |
| Existing tests changed | at least 37, up to 292 re-read | 1 | 0 |
| Saved tables | converted, lossy; undo dropped | migrated, play as before | untouched |
| Stock maps, valley | redrawn | kept; one square map added | kept |
| Renderers, editor | rewritten for squares | gain a second cell shape | small editor additions |
| Risk | high: everything moves at once, conversions are lossy | medium: the square rules (S6-S8) and the two renderers are new code; two geometries to keep | low, and it does not fix the problem |

## Recommendation

**B.** Reasons, in order:

1. The SRD's only grid rules are square rules (lines 1806-1829, 1893-1943):
   diagonals, corners, range counting and the 2 by 2 / 3 by 3 / 4 by 4
   spaces. On squares the engine enforces text; on hexes it enforces our
   own adaptation. The owner's maps are square.
2. Nothing made so far is lost: 988 tests, five stock maps, the valley, every
   saved table and export, both renderers.
3. The engine is already nearly grid-free (the crude swap fails 37 tests of
   1,013, the AI and the server have no grid code at all), so the interface
   is mostly moving calls, and the first four jobs change nothing at all.
   The work can stop safely after any row.
4. A is B plus conversion and deletion. Anyone who wants A later gets there
   through B, and with the choice made on evidence from real tables.

The cost of B that does not go away: two geometries to keep and test; and
the name. C is not recommended because it does not change the numbers in
the corridor table.

The rest of this spec is the design for B.

## The owner's answers (14 November)

Recorded on #240; they replace the defaults the questions at the end proposed.

1. **Option B**: both grids, each map chooses.
2. **Diagonals: measured for real, with the next square as a bonus**, the default on square maps.
   A side step costs 5 ft; a diagonal step its true length, 5 x √2 (about 7.07 ft), doubled by
   Difficult Terrain and the like as any step is. A creature may enter a square whenever it has
   any movement left, even if the step costs more than is left; that step uses up the rest. So at
   Speed 30 a pure diagonal run is 5 squares (4 paid in full, the fifth on the remainder). The SRD's
   count (every diagonal 5 ft) and "every second diagonal 10 ft" stay as values of the table
   setting `diagonals` (Decision 5). The second is not in the SRD 5.2.1 and is labelled so.
   **Reach and range** (the lead's proposal, built as the default of the setting `squareRange`; the
   owner has not objected): centre to centre for real, rounded down to a whole 5 ft, so a diagonal
   neighbour (7.07 ft) is within a 5-ft reach.
3. **Areas**: a square is in an area when its centre is inside the real shape (Decision 6, `round`).
4. **Cover** is judged by what the obstacle is and where it stands, not by counting corners
   (Decision 7, replacing the four-corner rule proposed there).
5. **New maps**: the DM picks the grid each time, squares listed first; UVTT files import as squares.

Questions 6 and 7 (stock maps, the valley) stay open on their defaults.

## The decisions

### Decision 1: one geometry interface, chosen by the map

A new module `packages/rules/src/grid.js` exports two geometry objects,
`HEX` and `SQUARE`, with the same members (next section), and
`gridOf(map)`, which returns `SQUARE` when `map.grid === 'square'` and `HEX`
otherwise. Callers write `const G = gridOf(s.map)` and use `G.dist`,
`G.neighbors` and so on.

- **Why from the map, not a global or a setting.** The server runs many
  tables in one process; a global would be impure and wrong. A table setting
  would let a hex map be read as squares. The map is what was drawn on a
  grid, so the map says which.
- **Why an object, not `if (square)` at each call.** The hex code stays
  exactly as it is inside `HEX`; square code cannot change hex behaviour by
  accident; and a third grid would be one more object.
- **`hex.js` stays** as the hex implementation that `HEX` wraps, and the
  valley generator (`scenario.js`) keeps importing it. Nothing else does
  once S2 and S3 are done.
- **Grid-free helpers** (`col`, `key`, `parse`, `reachable`, `pathTo`) are
  re-exported from `grid.js` so a caller needs one import.
- **Functions that have no map today take the grid.** `footprint`,
  `shapeOf`, `overlapAt` and `apartAt` in `space.js` gain a last parameter
  `G`. In S1 it defaults to `HEX` so no caller has to change at once; S6
  removes the default, so a caller that forgot it fails loudly in tests
  instead of measuring a square map in hexes.
- **Cost.** 130 grid-dependent calls in 26 source files and 91 in 29 test
  files (appendix, list 1) gain a `G`; tests can keep calling `hex.js`,
  since they are about hex maps. Every future geometry feature is written
  for both.

### Decision 2: a square position is `{ q, r, z }` too

On a square map `q` is the column (east), `r` the row (south), `z` the
height in feet, exactly as on hexes. Keys stay `"q,r"`.

- **Why.** Every stored position, every key in tiles, regions, `seen`,
  arenas, zones and terrain, every event and every client that reads them
  works unchanged. 206 grid-free calls in source and 130 in tests need no
  change at all. A square position is told from a hex one only by the map.
- **Cost.** A position means nothing without its map. That is already true
  in practice (levels and heights depend on the map), and `loadMap` already
  re-seats the party when the map changes.

### Decision 3: the map says its grid; format 2

The map document gains `grid` and renames `hexFeet`:

```js
{ format: 2, id, name, grid: 'hex' | 'square', cellFeet: 5, levels, walls, objects, regions, starts }
```

- `migrateMap` brings format 1 to 2: `grid: 'hex'`, `cellFeet` from
  `hexFeet` (always 5), `hexFeet` dropped. It runs on every map that enters
  the game, as now.
- **Why a new format and not an optional field.** `lintMap` ignores fields
  it does not know, so a build before this one would read a square map as
  hexes and play it wrongly without a word. With format 2, an old build
  refuses it: "Its format is 2; this game reads format 1."
- The linter checks `grid` is one of the two, a door's `edge` is below
  `G.EDGES` (6 or 4), and `cellFeet === 5` (the SRD's square, line 1810, and
  today's hex).
- `view.js` sends `grid` and `cellFeet` to players with the rest of the map
  header. Nothing about the grid is secret.
- **Cost.** The five stock map files are regenerated (two lines each); one
  test line changes (`space.test.js`:79 sets `hexFeet`).

### Decision 4: state version 21; a table plays one map at a time

- **Version 21** runs `migrateMap` on `state.map` (it already does since
  version 3) and stamps the version. No other field changes. Saved tables on
  the server migrate on load (`tables.js`:73) and, as with every version
  bump, their undo history is dropped once. Exports migrate when they are
  loaded.
- **A table holds one map** (`state.map`), as now. The DM may load a map of
  either grid outside a fight; `loadMap` seats the party at the new map's
  starts, so no position is ever converted between grids. Lasting areas laid
  on the old map's cells (zones, terrain) are ended by `loadMap` when the
  grid changes (today they are kept, which is already wrong across any map
  change; S6 ends them on every map change and says so).
- **The valley stays hex.** New maps in the editor ask which grid
  (question 5); UVTT files import as squares by default.
- **No converter.** A hex map is not turned into a square map or back. That
  is Option A's job and out of scope.

### Decision 5: movement, reach and size on squares

- **Diagonals by the table rule `diagonals`** (owner's answer 2), square maps only; absent means
  `real`. `G.dist` stays the SRD's count (the larger of `|dq|` and `|dr|`); what a step costs is
  the rule's, in `moveOptions`:
  - `real` (default, a table rule): a side step 5 ft, a diagonal 5 x √2 ft, times whatever
    doubles a step (Difficult Terrain, climbing, crawling, a creature's space). A creature with any
    movement left may enter one more square; that step uses up the rest (one bonus at most, since
    nothing is left after it). Straight runs come out as by the SRD.
  - `srd`: every diagonal 5 ft (SRD 1817-1823).
  - `alternate`: every second diagonal in a turn 10 ft, counted through the turn
    (`encounter.budget.diagonals`, 0 or 1, absent meaning 0). Not in the SRD 5.2.1; the setting's
    words say so.
  Reachability on squares is a least-cost search over feet that need not be whole; the squares a
  client highlights (it runs `moveOptions` on its view) and the way walked come from the same
  search, and the cost charged is the cost of that way. Movement left is kept in feet and may be
  fractional; players are sent the number itself (the client rounds down for display).
- **Reach and range by the table rule `squareRange`** (owner's answer 2), square maps only: `real`
  (default) measures centre to centre and rounds down to whole cells; `srd` counts squares
  (1826-1829). It is `space.js` `measure`, used by `gap` and `apartAt` and so by every reach and
  range check (attacks, spells, areas aimed at a point, Opportunity Attacks, traps, Search).
- **Corners** (SRD 1824-1825): a diagonal step is refused if a wall that
  blocks movement touches the corner it passes (the existing segment test
  `crosses` already counts touching), or if either of the two squares beside
  the step (`G.beside`) is solid on that level (rock, deep water, a thing
  that fills its square). A creature does not count as a terrain feature, so
  a diagonal between two creatures is allowed. A flyer obeys the same rule
  below a wall's top.
- **Reach and adjacency**: `apartAt` takes the nearest parts of two creatures by `measure`. Under
  either `squareRange` a goblin diagonal to the fighter is within 5 ft and provokes an
  Opportunity Attack when it walks away.
- **Footprints** come from the SRD table (1893-1943): 1, 2 by 2, 3 by 3,
  4 by 4. A big creature's position names its **north-west square**; the
  renderer already draws a creature at the middle of its parts
  (`render.js`:537). Tiny creatures share a square four at a time, as they
  share a hex.
- **The arena** is the squares within `ARENA_RADIUS` (6) by grid count, a
  13 by 13 block (169 squares against 127 hexes). **Marching order** keeps
  `KEEP_UP = 2` squares. **Flyers** move in the 8 directions and up and down
  (world.js:132 loops over `G.DIRS`).
- **Cost.** The corner rule, the diagonal costs and the square search are new engine code
  (`engine/world.js`); hex maps keep hex.js's search untouched.

### Decision 6: areas on squares

The SRD defines the shapes and says nothing about which squares they cover.
Hextable already says "a cell is in an area if its centre is" for cones,
lines and cubes; squares keep that and make one choice explicit.

- **Cone**: the squares whose centres lie inside the SRD cone, as wide at
  each point as it is far from the origin (33026-33039), out to its length
  measured along the aim; the origin's square is out. Measured: a 15-ft cone
  covers 7 squares aimed east and 6 aimed diagonally; 30 ft, 24 and 20. The
  hex cone stays the 60° wedge it is today (15 ft: 7 hexes).
- **Line and Cube**: today's `band` and `along`, which already work in feet
  from cell centres; on squares they use `G.center` and `G.range`.
- **Sphere, Cylinder, Emanation**: a table rule `areaFill`, square maps only:
  - `round` (proposed default): the squares whose centres lie within the
    radius in a straight line, as the SRD's shapes "extend in straight lines"
    (32671, 34195). A 20-ft Sphere covers 49 squares (1,225 sq ft against the
    sphere's 1,257).
  - `grid`: the squares within the radius counted as range is counted
    (1826-1829). A 20-ft Sphere covers 81 squares (2,025 sq ft, 61% more
    than the sphere), but "within 15 feet" means one thing for a target and
    an area.
  Neither is SRD. **The owner chose `round`** (answer 3: a square is in an area when its centre is
  inside the real shape); whether `grid` is kept as a value of `areaFill` is S7's to settle with the
  lead. On hexes nothing changes
  (hex counting is already close to round: 61 hexes for 20 ft).
- Areas keep their heights (`maps-and-objects.md`, M6 build note) and walls
  still shelter what is behind them.

### Decision 7: sight and cover on squares

- Lines of sight are already segments between points in feet; only the
  corners change: `G.corners(h)` gives four on a square (a little inside the
  true corner, as the hex ones are, sight.js:9).
- **Cover by what the obstacle is and where it stands** (owner's answer 4; it replaces the
  four-corner count first proposed here). The owner's definitions: **Half Cover**, anything that
  does not fully cover the target; **Three-Quarters Cover**, something that fully covers the
  target but has a hole in it, or is askew of the direction of attack; **Total Cover**, a wall, or
  something bigger than the target, directly between the target and the attack. The lead's
  reading for the engine (S8 builds it; awaiting the owner's confirmation): "directly between" is
  the line from the attacker to the target's centre, and what can be seen is the lines to the
  target's corners (`G.corners`):

  | What the lines find | Cover |
  |---|---|
  | Centre line clear, every corner visible | none |
  | Centre line clear, some corner hidden; or another creature on the line | Half |
  | Centre line blocked by something solid, but part of the target still visible round it (askew) | Three-Quarters |
  | Everything blocked, but by something with a hole (window, rail, portcullis: wall kinds the map has) | Three-Quarters |
  | Everything blocked by something solid | Total |

  The DM can still set cover by hand. The rule does not depend on the grid; using it on hexes too
  is a separate decision (it would change results on existing hex maps and their tests).
- **What players are sent**: `view.js` sends a wall's stretches that lie
  within a cell's corner of a cell they were shown. That radius becomes
  `G.cornerReach` (5/√3 on hexes, 5/√2 on squares). Too small and players
  miss walls; too large and they are sent walls of rooms they have not
  seen. This is a hidden-information change and is reviewed as one (S8).

### Decision 8: drawing squares

- Both renderers and `floors.js` take cell outlines from `G.corners`; a
  square tile is a four-sided prism (the builder already draws four-sided
  rings, `render.js`:154). One drawing scale for both grids: `UNIT = √3/5`
  drawing units per foot, so the camera, models and zoom limits are
  unchanged.
- Picking (`planeHex`) returns `G.cell` of the point under the finger; the
  column march (`render.js`:1066, `render-three.js`:563) uses `G.cell`.
- The grid overlay over a picture is drawn from the same corners, so on a
  square map traced from a square picture the two grids are one.
- `three-build.js` duplicates `render.js` until renderer task R14. If R14
  lands first, S9b is not needed.

### Decision 9: the editor and the importer on squares

- **New map**: the DM picks the grid each time, squares listed first (owner's answer 5). A map's grid
  cannot be changed in the editor once it has tiles.
- **Align to the picture's grid** (square maps): tap two opposite corners of
  one square on the picture, or of a run of N squares, and the picture's
  `feet` and `origin` are set so its squares are the map's. This replaces
  "Set scale" for square maps and needs no new map field: `level.image`
  already holds `feet` and `origin` (M9 build note).
- **Trace** snaps to square corners and sides as well as to wall ends; doors
  stand on a square's side (`edge` 0 to 3) or on a traced line, as now.
  **Fill floor** lays a tile on every square under the picture
  (`G.cellsIn`). Stairs run along any of the 8 directions.
- **UVTT import** (`import-uvtt.js`): its files are square-grid, measured in
  squares with a `pixels_per_grid`. On a square map the import becomes
  exact: one tile per square of `map_size`, walls and doors copied as they
  are (they already lie on square edges), a portal's `at` the square nearest
  its middle, and no "hexes and squares never line up" note. The hex import
  stays as an option.

## The geometry interface

`G` is `HEX` or `SQUARE`. "Today" says where hex callers get the same thing
now; S1 to S3 move them.

| Member | Contract | Hex | Square | Today |
|---|---|---|---|---|
| `kind` | which grid | `'hex'` | `'square'` | — |
| `word` | `{ one, many }` for messages | hex, hexes | square, squares | literal "hex" in 64 engine and 41 client strings |
| `DIRS` | steps to the neighbours; the first `EDGES` cross a side | 6 axial, today's order | 8: E, N, W, S, then NE, NW, SW, SE | `H.DIRS` |
| `EDGES` | number of sides | 6 | 4 | `6` in map.js:104, editor.js:163 |
| `neighbors(h)` | every cell one step away | 6 | 8 | `H.neighbors` |
| `dist(a, b)` | steps by the shortest route | axial distance | `max(abs dq, abs dr)` (SRD 1817-1829) | `H.dist`; `client/timeline.js` `hexDist` |
| `range(c, n)` | every cell with `dist <= n`, in a fixed order | 3n²+3n+1 cells | (2n+1)² cells | `H.range` |
| `center(h)` | centre in map feet `[x, y]` | `walls.center` | `[5q, 5r]` | `walls.center` (20 calls) |
| `cell(x, y)` | the cell holding a point in feet; `cell(...center(h))` is `h` | `H.fromWorld(x, y, 5/√3)` | `round(x/5), round(y/5)` | `H.fromWorld`, `floors.hexAt`, editor `#doorAt` |
| `toWorld(h)`, `fromWorld(x, z)` | drawing units, `center × UNIT` and back | as today | same `UNIT` | `H.toWorld`, `H.fromWorld` |
| `corners(h)` | corner points in feet, in order around | 6 | 4 | `floors.hexCorners`, `sight.CORNERS`, renderer rings |
| `cornerReach` | centre to corner, feet | 5/√3 | 5/√2 | `view.js` `REACH`, `walls.objectHexes` |
| `edgeSegment(h, e)` | the side between `h` and `DIRS[e]`, `e < EDGES` | `walls.edgeSegment` | the shared side | `walls.edgeSegment` |
| `edgeOf(a, b)` | side index from `a` to neighbour `b`, or -1 | as editor's `edgeOf` | -1 for a diagonal | `editor.js`:38 |
| `beside(a, b)` | the cells a step from `a` to `b` passes between, for the corner rule | `[]` | two cells for a diagonal, `[]` for a side | — (new) |
| `footprint(size)` | offsets a size fills, anchored at `[0, 0]` | today's 1, 3, 7, 12 | 1, 2x2, 3x3, 4x4 from the north-west | `space.js` `SHAPES` |
| `cone(o, aim, n)` | cells of a cone of `n` cells | today's 60° wedge | the SRD cone, Decision 6 | `H.cone` |
| `band(o, aim, from, to, half)`, `along(o, aim, h)` | as today, in feet | shared code over `center` and `range` | shared | `H.band`, `H.along` |
| `straight(a, b)` | cells on a straight run along one grid direction, or null | three axes | four axes (8 directions) | `editor.js`:316-324 |
| `cellsIn(x0, y0, x1, y1)` | every cell whose centre is in a rectangle in feet | the editor and UVTT loops | rows and columns | `editor.js`:570, `import-uvtt.js`:83-91 |
| `col`, `key`, `parse`, `reachable`, `pathTo` | grid-free | re-exported | same | `hex.js` |

`HEX` must return exactly what today's code returns, in the same order:
replays depend on `range` and `neighbors` order (`reachable` breaks ties by
the order things were added). The test of S0 pins that.

## What the engine must add

| # | Addition | Kind | Players see | Version |
|---|---|---|---|---|
| E1 | `grid.js`: `HEX`, `SQUARE`, `gridOf` | module | — | no |
| E2 | Map format 2: `grid`, `cellFeet`; `migrateMap` 1 to 2; linter checks | map document | `grid` and `cellFeet` in the map header | map format 2 |
| E3 | State version 21: the map migrated | state | — | 20 to 21 |
| E4 | Corner rule on diagonal steps; footprints and arena by `G` | rule | — | no |
| E5 | Table rule `areaFill: 'round' \| 'grid'` (square maps only; absent means `round`) | setting | in `settings` | no (absent means default) |
| E6 | Cover from four corners | rule | — | no |
| E7 | `view.js` wall pieces by `G.cornerReach` | view | fewer or more wall pieces, by grid | no |
| E8 | `loadMap` ends lasting areas tied to the old map's cells | rule fix | `effectEnd` events | no |
| E9 | Engine messages use `G.word` | text | "square" on square maps | no |
| E10 | Table rule `diagonals: 'real' \| 'srd' \| 'alternate'` (square maps only; absent means `real`), with `encounter.budget.diagonals` under `alternate` | setting | in `settings` | no (absent means default) |
| E11 | Table rule `squareRange: 'real' \| 'srd'` (square maps only; absent means `real`) | setting | in `settings` | no (absent means default) |

## Tasks

In build order. Each row is one pull request. "Opus" rows are engine
geometry and rules; "Sonnet" rows are screens, renderers and data. Every row
runs `npm test` and `npm run build`; client rows also run the smoke passes
named, at 390 x 844 with touch and 1280 x 800. A row may touch only the files
it lists (`AGENTS.md`). **S0 to S3 change no behaviour and no existing
test**; after any row the game plays as it did before that row on every hex
map.

| # | Task | Lane | Model | Files it may touch | Acceptance test |
|---|---|---|---|---|---|
| S0 | **The interface, hex only.** `grid.js` with `HEX` built from `hex.js`, `walls.center` and `edgeSegment`, the sight corners and the size shapes (copied constants, not new maths); `SQUARE` absent; `gridOf` returns `HEX` for every map. Nothing calls it yet. | engine | Opus | `packages/rules/src/grid.js` (new), `packages/rules/test/grid.test.js` (new) | `grid.test.js`: for every cell in `range({0,0}, 8)` and every pair in it, each `HEX` member returns exactly (same values, same order) what today's function returns; every existing test passes untouched |
| S1 | **Rules callers, part 1.** `space.js` (with `G` as a last parameter defaulting to `HEX`), `walls.js`, `sight.js`, `vision.js`, `view.js`, `zones.js`, `terrain.js`, `map.js`, `import-uvtt.js`; the unused import in `modifiers.js` removed. | engine | Opus | those files, `grid.js` | every existing test passes untouched; none of these files imports `hex.js` |
| S2 | **Rules callers, part 2.** `engine/world.js` (the flyer loop over `G.DIRS`), `resolve.js`, `movement.js`, `casting.js`, `characters.js`, `dm.js`, `features.js`. | engine | Opus | those files, `grid.js` | every existing test passes untouched; a test in `grid.test.js` reads `packages/rules/src` and finds `hex.js` imported only by `grid.js` and `scenario.js` |
| S3a | **Renderer callers.** `render.js`, `three-build.js`, `render-three.js`, `floors.js` take geometry from `gridOf(state.map)`; still hex only. | render | Sonnet | those files | client tests pass untouched; smoke `base`, `armed`, `three`, `three-parity`, `timeline` pass; screenshots unchanged by eye at both sizes |
| S3b | **Other client callers.** `app.js`, `actionpanel.js`, `timeline.js` (`hexDist` goes), `editor.js` (imports only, no square behaviour); the two smoke passes that import `shared/hex.js` import `shared/grid.js`. | client | Sonnet | those files, `scripts/smoke/armed.mjs`, `scripts/smoke/solo.mjs` | as S3a, plus smoke `maps`, `import`, `actionpanel`; no client file imports `shared/hex.js` |
| S4 | **Map format 2 and state version 21.** E2, E3: `grid`, `cellFeet`, `migrateMap`, linter (a `square` map is refused with "Square maps come in a later version" until S6), `view.js` header; `gen-maps.mjs` writes format 2 and the five stock maps are regenerated; the protocol note in the server README. | engine | Opus | `map.js`, `migrate.js`, `view.js`, `scripts/gen-maps.mjs`, `content/maps/*.js` (regenerated only), `packages/server/README.md`, `packages/rules/test/space.test.js` (line 79 only), new tests | `fixtures/table-v1.json` and both v20 fixtures load as `grid: 'hex'` at version 21 and play their tests; a format-1 document migrates; a square map is refused with the sentence; the stock maps lint and differ from before only in the header |
| S5 | **Square geometry.** `SQUARE` in `grid.js`, every member of the interface table; still refused by the linter. | engine | Opus | `grid.js`, `grid.test.js` | property tests on `SQUARE`: `dist` equals breadth-first steps over `neighbors`; `range(c, n)` is exactly the cells with `dist <= n`; `cell(center(h)) = h`; `corners` are the four at ±2.5 ft; `edgeSegment` is the shared side; `beside` of a diagonal is the two cells it passes; a 15-ft cone is 7 squares east and 6 diagonal; footprints are 1, 4, 9, 16 cells |
| S6 | **Moving on squares.** The linter accepts `square`; corner rule (E4); footprints, Tiny sharing, the arena, marching, flyers by `G`; the `G` default removed from `space.js`; E8 in `loadMap`; E10 and E11 (#252); `loadMap` migrates a format 1 map. A test fixture `square-room` (a small square map with a corridor, a pillar and a door). | engine | Opus | `map.js`, `space.js`, `engine/world.js`, `engine/movement.js`, `engine/resolve.js`, `engine/dm.js`, `packages/rules/test/fixtures/square-room.js` (new), `packages/rules/test/square-moving.test.js` (new) | with Speed 30 a Medium creature moves 6 squares diagonally in a turn under `diagonals: 'srd'` (SRD 1814-1821), 5 under `real`, 4 under `alternate`; a diagonal past a wall's corner or a pillar is refused and the side route allowed (1824); a Large creature fills 2 by 2 and passes the 10-ft corridor at every offset, not the 5-ft one; a goblin diagonal to the fighter provokes an Opportunity Attack when it walks away (1826-1829, 2075); a fifth Tiny creature cannot share a square (1913); the arena is the 13 by 13 block; loading a square map seats the party and ends the old map's zones; every hex test still passes |
| S7 | **Areas on squares.** `layout` by `G`; E5 `areaFill` with `round` as default, in `SETTINGS`. | engine | Opus | `engine/world.js`, `engine/dm.js` (`SETTINGS` only), `packages/rules/test/square-areas.test.js` (new) | on `square-room`: a 20-ft Sphere covers 49 squares under `round` and 81 under `grid`; Burning Hands (15-ft cone) catches the creatures on the 7 squares east and not one beside them; Lightning Bolt (100 by 5 ft line) aimed diagonally is one square wide; Thunderwave (15-ft cube from self) is the 3 by 3 in front; a wall still shelters what is behind it; every hex area test still passes |
| S8 | **Sight, cover and what players are sent on squares.** E6, E7; the vision flood over `G.neighbors`. | engine | Opus | `sight.js`, `vision.js`, `view.js`, `packages/rules/test/square-sight.test.js` (new) | cover from a pillar beside the line is Half and from a wall end Three-Quarters, by the four-corner rule; the property test "over a long random game nothing the party cannot see reaches any player" (`sight-views.test.js`, seed 3) passes on a square map too; a wall is sent only where it runs beside a shown square; **reviewed for hidden information before merge** |
| S9a | **The default renderer draws squares.** Tile prisms, highlights and rims from `G.corners`, picking by `G.cell`, floors and cut-away, grid overlay, the arena. A smoke pass `square` that loads `square-room`, walks diagonally, aims a cone and checks each tap lands on the square under it. | render | Sonnet | `render.js`, `floors.js`, `packages/client/test/floors.test.js` (new tests only), `scripts/smoke/square.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=square` passes at both sizes with no page errors; squares meet walls with no gaps; every existing smoke pass still passes |
| S9b | **The Three.js renderer draws squares.** As S9a. Skipped if R14 has removed the hand-written renderer. | render | Sonnet | `three-build.js`, `render-three.js`, `scripts/smoke/three-parity.mjs` (a square map added) | `three-parity` passes on `square-room` and on a hex map |
| S10 | **The editor on squares.** Grid choice for a new map; brush, walls snapping to square sides and corners, doors on sides, stairs in 8 directions, Fill floor by `G.cellsIn`; Align to the picture's grid. | editor | Sonnet | `editor.js`, `index.html`, `style.css`, `scripts/smoke/maps.mjs` | on a tablet-sized screen a DM makes a square map from a generated square-grid test picture: after Align the picture's lines lie on the square edges within one screen pixel at default zoom; Fill floor and a traced door give a room the party can walk into; the hex editor works as before |
| S11 | **UVTT import onto squares.** Decision 9; `grid: 'square'` the default, hex an option; the editor's import dialog offers both. | engine (importer) | Sonnet, engine review | `import-uvtt.js`, `packages/rules/test/import-uvtt.test.js` (new tests only), `editor.js` (the dialog only) | `fixtures/room.dd2vtt` imports as `map_size.x` by `map_size.y` squares; every wall end lies on a square corner or side; nobody walks through an imported wall and the open door lets them out (as the hex test does); the hex import still gives today's result |
| S12 | **A square stock map.** A square builder in `gen-maps.mjs` and one map (question 6); `docs/maps.md` says how to draw on squares. | content | Sonnet | `scripts/gen-maps.mjs`, `content/maps/<new>.js`, `content/maps/index.js`, `docs/maps.md`, `packages/rules/test/stock-maps.test.js` (new tests only) | the stock-map tests (lint, plain data, size for a phone, every room reachable through its doors) pass for it |
| S13e | **Words in the engine.** E9: messages that say "hex" use `G.word`. | engine | Sonnet | the engine files holding the 64 strings (appendix), new tests | on a square map no message names a hex; on a hex map every message is unchanged (existing tests pin many) |
| S13c | **Words and choices in the client.** The lobby and DM panel show each map's grid; the 41 client strings by grid; About says the table plays both. | client | Sonnet | `app.js`, `index.html`, `about.js`, `tablecontrols.js`, `editor.js` (strings only) | at both sizes, a square map's screens say squares; smoke `base`, `drawer`, `maps` pass |
| S14 | **Saved tables on a square map.** A server test: host a table, load `square-room`, move, restart the server, reload, export, import. | server | Sonnet | `packages/server/test/square.test.js` (new) | the table comes back on the same squares with `grid: 'square'`; a player's view of it holds no wall piece the S8 rule would not send |

### What can run side by side

- S0, then S1 and S2 in order (they share `grid.js`).
- S3a and S3b after S2, side by side with each other and with S4.
- S5 after S2 (it only adds to `grid.js`); it can run beside S3 and S4.
- S6 after S4 and S5. S7 and S8 after S6, side by side (different files).
- S9a after S3a and S6; S9b after S9a. S10 after S9a. S11 after S6, beside
  S7 to S10. S12 after S7. S13e after S8; S13c after S10. S14 after S8.
- The work can stop after any row. Stopping after S3 leaves a cleaner engine
  and nothing else; after S4, maps that know their grid; after S8, square
  maps that play by the rules but cannot be drawn (the linter should then
  keep refusing them in a release, which S6's sentence can be put back to
  do).

### Review points

- **S0 to S3**: diff review that nothing but imports and call sites moved;
  any changed test is a stop.
- **S4**: the migration on every fixture, and the format bump read against
  old clients (an old build must refuse a format 2 map).
- **S6**: the corner rule against SRD 1824-1825, by the owner if he wants a
  different reading (creatures as corners, question 2).
- **S8, hidden information**: `cornerReach` decides which wall pieces a
  player gets. Reviewed by the engine lane against `hidden-information.md`
  and `sight.md`, with the seed-3 property test on a square map.
- **S7**: the cell counts of each shape are read once by a person against
  the SRD shape definitions; they are design choices, pinned by tests.

### Build notes: S6 (#252)

- **Search.** Hex maps run hex.js's `reachable` as before. Square maps run `squareSearch` in
  `engine/world.js`: Dijkstra over steps that each say `flat` (times the step's length: 5 ft, or a
  diagonal's by the rule) and `extra` feet (a climb's height). Under `alternate` a state is a
  square and whether an odd number of diagonals has been taken. `route(reach, key)` gives the way
  and the cost at each step; `walk` spends `start - cost`, one subtraction, so fractions never
  pile up (on hexes the step-by-step subtraction is kept; there every cost is whole or half feet).
- **One tolerance.** `EPS_FT = 1e-6` and `below(a, b)` are the only comparison of feet on squares.
  Costs are sums of whole feet and multiples of 5√2: two routes of equal length can differ in the
  last bit, two of different length differ by far more than the tolerance. Only `+`, `-`, `*` and
  the constant `Math.SQRT2` are used (no `Math.hypot`), so every engine gets the same bits.
- **The bonus square** under `real` applies to any step (walking, climbing, a ladder, flying): the
  step's cost is capped at what is left. With a whole Speed and no diagonal, nothing is ever left
  over, so straight runs are the SRD's.
- **Corners.** A wall or shut door touching the corner already blocks the centre-to-centre line
  (`crosses` counts touching). `cornerFree` checks the two squares beside the step: blocked if the
  surface there at the walker's height is impassable (rock, deep water) or holds something solid,
  or the ground there rises above the walker; a square with no floor, or lower ground, is not a
  feature. Every part of a big creature obeys it; so does a push and a flyer.
- **Reach and range** are `space.js` `measure(s, G)`, whole-number arithmetic (an integer square
  root), used by `gap` and `apartAt`; `apartAt` now takes the map's grid when none is given.
- **The `G` default** is not removed from `shapeOf`, `footprint` and `overlapAt`: their callers
  outside S6's files (sight, zones, casting, features, characters, sheets, the renderers) do not
  pass a grid yet; `docs/DEBT.md` T21 lists them. Every caller in S6's files passes it.
- **E8** ends every terrain effect and every zone that does not follow a creature on any map
  change, hex maps included (the one deliberate change on hexes). **`loadMap`** runs `migrateMap`
  on the map it is sent before linting it.

## Out of scope

- Converting a hex map to squares or back, and converting saved tables
  (that is Option A).
- Removing hexes.
- Flanking (not in the
  SRD); squeezing (not in the SRD 5.2.1; as on hexes, the DM's `place`).
- Gridless play, other grids (offset hexes, isometric).
- Redrawing the five stock maps or the valley on squares (question 6, 7).
- Light by square corner (renderer R13 does light per corner; it reads
  `G.corners` when it is built).

## Risks

- **A forgotten caller measures a square map in hexes.** S2's test lists the
  importers of `hex.js`; S6 removes the `HEX` default from `space.js`; the
  square tests run the main rules on a square map. A call that slips through
  shows as a wrong distance, not a crash; the square smoke pass is the last
  net.
- **Two renderers, twice the work** until R14. S9b is the cost.
- **Replays.** `HEX` must keep `range` and `neighbors` order exactly (S0's
  test). `SQUARE` fixes its own order once and pins it.
- **The arena on squares is a third larger** (169 against 127 cells). If
  fights on squares feel loose, `ARENA_RADIUS` can be per grid.
- **Tests guard less than they seem.** The crude swap passed 976 of 1,013
  tests on a half-square engine. Square behaviour is guarded only by the
  new square tests (S5 to S8, S14) and the square smoke pass.

## Questions for the owner

Each has a default; work proceeds on the default. Questions 1 to 5 are answered (see "The
owner's answers"); they are struck here.

1. ~~**A, B or C?**~~ Answered: B.
2. ~~**Diagonals.**~~ Answered: measured for real with the next square as a bonus, the SRD count
   and every-second-diagonal-double as table rules. Creatures do not block a diagonal corner (the
   SRD names walls, large trees and terrain features, 1824-1825; not asked again).
3. ~~**Which squares a Sphere, Cylinder or Emanation covers.**~~ Answered: centres inside the real shape.
4. ~~**Cover on squares.**~~ Answered: by what the obstacle is and where it stands (Decision 7).
5. ~~**New maps.**~~ Answered: the DM picks each time, squares first; UVTT files import as squares.
6. **Stock maps.** *Default: keep the five on hexes and add one square map
   (S12).* Redrawing all five on squares is five content jobs.
7. **The valley.** *Default: stays a hex map.*

## The name

A note, not a decision. Under **A** the name describes a grid the game no
longer has. Under **B** it is where the game started and still one of its two
grids; many products keep such names. Under **C** it stays literal. Nothing
in this spec depends on the name, and renaming would touch the repo, the
package, the deploy, the server's token header (`x-hextable-token`) and the
browser storage keys (`hextable.*`), which is its own job.

## Appendix: measurements

Scripts, all under `/tmp/sq240/`: `hexuse.mjs` (importers and the exports
each uses), `stored.mjs` (coordinates stored in stock maps and the starter
state), `tests.mjs` (tests that pin hex positions, by file), `misfit.mjs`
(square corridors on hexes), `cone.mjs` (cells per area), and the copy
`swap/` with the square shims for the swap runs. Outputs are the `.txt`
files beside them.

### List 1: importers of `hex.js` and what each uses

All import it as `import * as H`. Counts are uses of each member. 57 files:
18 in the rules, 7 in the client, 1 script, 2 smoke passes (dynamic
import), 29 tests.

| File | Members used |
|---|---|
| rules/src/engine/world.js | along 3, band 3, col 17, cone 1, dist 10, key 9, neighbors 5, pathTo 1, range 2, reachable 1, toWorld 4 |
| rules/src/engine/resolve.js | col 4, dist 4, fromWorld 1, neighbors 1, range 2, toWorld 5 |
| rules/src/engine/movement.js | col 4, dist 3, key 7, pathTo 1 |
| rules/src/engine/dm.js | col 2, dist 1, key 3, parse 1, range 1 |
| rules/src/engine/characters.js | col 1, dist 1, parse 1, range 1 |
| rules/src/engine/casting.js | col 2, key 2 |
| rules/src/engine/features.js | col 1, dist 1 |
| rules/src/space.js | DIRS 2, col 3, dist 3, parse 1 |
| rules/src/walls.js | DIRS 4, col 2, range 1 |
| rules/src/sight.js | col 3, dist 1 |
| rules/src/vision.js | col 9, dist 1, neighbors 1, range 1 |
| rules/src/view.js | col 7, parse 2 |
| rules/src/zones.js | col 1, dist 1 |
| rules/src/terrain.js | col 1 |
| rules/src/map.js | col 5 |
| rules/src/import-uvtt.js | col 3, fromWorld 1 |
| rules/src/scenario.js | key 5, neighbors 1, range 3 (stays on `hex.js`) |
| rules/src/modifiers.js | nothing (an unused import) |
| client/render.js | col 8, fromWorld 3, key 1, neighbors 1, parse 7, range 1, toWorld 10 |
| client/three-build.js | col 8, fromWorld 1, key 1, neighbors 1, parse 6, toWorld 10 |
| client/render-three.js | fromWorld 2 |
| client/floors.js | col 7, fromWorld 1, neighbors 9, parse 9 |
| client/editor.js | DIRS 6, col 26, dist 1, fromWorld 1, key 4, parse 5, range 3 |
| client/app.js | col 1, key 4 |
| client/actionpanel.js | col 1, dist 2 |
| scripts/gen-maps.mjs | DIRS 2, col 9, dist 4, parse 10, range 3 |
| scripts/smoke/armed.mjs, solo.mjs | toWorld 3, col 2 (in the page) |
| 27 rules tests, 2 server tests | 91 grid-dependent uses, 130 grid-free; heaviest: `server/tables.test.js` (dist 6, range 5, neighbors 1), `rules/engine.test.js` (dist 7, range 3, neighbors 2, toWorld 1, fromWorld 1), `rules/party.test.js` (dist 7, range 2), `rules/sight-views.test.js` (range 3), `rules/walls.test.js` (DIRS 4) |

Totals over all importers: col 193, key 76, dist 65, parse 64, range 55,
neighbors 30, toWorld 30, DIRS 18, fromWorld 12, band 6, along 4, pathTo 2,
reachable 1, cone 1. `FEET_PER_UNIT` is used by nobody outside `hex.js`.
Grid-dependent calls: 130 in 26 source files, 91 in 29 test files.

### List 2: hidden hex costs outside `hex.js`

| Where | What |
|---|---|
| `walls.js`:14-33 | `S3`; `center()` in hex layout; `edgeSegment()` from `H.DIRS` and `5/(2√3)`; `objectHexes()` radius `5/√3` |
| `sight.js`:9-10 | `CORNER = (5/√3)·0.9`; six `CORNERS` at 30° + 60°i |
| `sight.js`:55, 99-106 | `corners: 6` for the own hex; cover thresholds on six corners |
| `view.js`:210 | `REACH = 5/√3 + 0.02` (wall pieces sent to players) |
| `import-uvtt.js`:13-14, 83-91 | `S3`, `SIZE = 5/√3`; the hex tiling of the picture |
| `space.js`:83-85, `content/sizes.js` | footprints 1/3/7/12 as `TRIANGLE` and `H.DIRS` shapes |
| `map.js`:55, 104 | `hexFeet !== 5`; door `edge < 6` |
| `engine/world.js`:132 | flyer directions `i < 6` |
| `engine/shared.js`:8 | `ARENA_RADIUS = 6` hexes |
| `engine/movement.js`:131 | `KEEP_UP = 2` hexes |
| `vision.js` | `FLOOD_HEXES = 40` |
| `client/timeline.js`:52 | its own hex distance |
| `client/floors.js`:26-51, 324-325, 488-489 | `S3`, `UNIT`, `HEX_RADIUS`, `hexCorners`, six-strip loops, `hexAt` |
| `client/render.js`:37, 163-165, 633-634, 801-805 | `UNIT = √3/5`; six-sided prisms and rims (`ring(..., 6, π/6)`) |
| `client/three-build.js`:10, 91-93, 184-185, 334-338 | the same, duplicated |
| `client/editor.js`:38, 160-163, 219-220, 316-324, 501, 570, 633 | `DIRS` edges, `(e + 3) % 6`, stairs on three axes, `FT/√3`, Fill floor row `5√3/2` |
| `scripts/gen-maps.mjs`:17-22 | offset-to-axial, six named directions |
| `render.js`:922, `render-three.js`:450 | `1.732` in the walk bob: cosmetic, not geometry |
| Text | 64 string literals in the rules and 41 in the client say "hex" |

### List 3: where `{ q, r }` is stored, and the migration under B

| Where | What | Under B |
|---|---|---|
| `state.entities[*].pos` | `{ q, r, z }` | unchanged |
| `state.map.levels[*].tiles` | keys `"q,r"` | unchanged |
| `state.map.objects[*]` | `at {q,r}`, `to {q,r}`, `edge` 0-5, `seg` in feet | unchanged; `edge` checked against `G.EDGES` |
| `state.map.regions[*].hexes` | `"q,r"` keys | unchanged (the field keeps its name) |
| `state.map.starts`, `state.map.seen.tiles` | `{q,r}`, keys | unchanged |
| `state.map` header | `format: 1`, `hexFeet: 5` | format 2, `grid: 'hex'`, `cellFeet: 5` |
| `state.encounter` | `arena` keys, `center`, `radius` in cells | unchanged |
| `state.effects[*]` | zone and terrain `hexes` keys, `origin` | unchanged |
| `state.timeline` | event `path`, `hexes`, positions | unchanged |
| server `<CODE>.json`, `<CODE>.undo.json` | the state; undo patches | migrated on load; undo dropped once by the version bump, as for every bump |
| table export | the state and its files | migrated when loaded |
| stock maps | tavern 443 tiles, dungeon 398, cave 936, forest-road 912, keep 531: 3,220 tile keys, 2,549 region keys, 62 objects (27 doors on hex edges, none on traced lines), 25 starts | regenerated with the new header only |
| starter state | 547 tiles, 10 positions, 1 start | built with `grid: 'hex'` |
| test fixtures | `table-v1.json` (14 positions), `v20-barbarian-224.json` (3), `v20-casters-232.json` (5), `room.dd2vtt` | migrate as saved tables |

### List 4: tests that pin hex positions, by file

988 tests (`node --test` reports 1,015 with subtests). A test is counted if
its own body writes a position (`q:` with a number, or a door `edge:`), a
`"q,r"` key, or calls a grid-dependent `hex.js` function. 292 tests in 72
files do; 62 files (559 tests) also set positions in shared fixtures at the
top of the file; 92 files (783 tests) build the valley with `newGame()`.

| File | Tests | Pinned | File | Tests | Pinned |
|---|---|---|---|---|---|
| rules/spell-vocab | 26 | 16 | rules/checks | 7 | 5 |
| rules/engine | 22 | 15 | rules/classes-warlock | 15 | 5 |
| rules/effects | 13 | 11 | rules/classes-wizard | 8 | 5 |
| server/tables | 54 | 11 | rules/modifiers | 10 | 5 |
| rules/class-review | 14 | 10 | rules/monster-riders | 7 | 5 |
| rules/party | 11 | 10 | rules/classes-barbarian | 16 | 4 |
| rules/height | 9 | 9 | rules/light | 5 | 4 |
| rules/multiattack | 22 | 9 | rules/objects-pack | 8 | 4 |
| rules/reactions-prompts | 19 | 9 | rules/stock-maps | 8 | 4 |
| rules/space | 10 | 9 | rules/view | 12 | 4 |
| rules/walls | 9 | 8 | rules/zones | 4 | 4 |
| rules/areas | 8 | 7 | 47 more files | | 1 to 3 each |
| rules/objects | 8 | 7 | client/floors | 25 | 7 |
| rules/regions | 10 | 7 | | | |
| rules/rule-fixes | 14 | 7 | | | |
| rules/size | 9 | 7 | | | |
| rules/reactions | 15 | 6 | | | |

Smoke: 16 of the 22 passes use hex positions, keys or `planeHex` /
`screenOf` (most: `three-parity` 8, `armed` 8, `lib` 7, `timeline` 6,
`solo` 6, `classes` 6).

### List 5: the swap runs

A copy of the repo at `/tmp/sq240/swap` (2 tests fail there at baseline,
both about licence files the copy lacks).

- **`hex.js` only** (8 neighbours, distance the larger offset, a square
  `range`, square `toWorld` and `fromWorld`): 12 tests fail. Lines and cubes
  (3), Supreme Sneak cover (1), hex distance (1), the UVTT portal (1), the
  secret door and shove (2), footprints and the Large creature (2), teleport
  to the nearest space (1), hex centres 5 ft apart (1).
- **Also `walls.center`, `edgeSegment`, the sight corners and `view.js`
  `REACH`**: 37 fail. The 12, plus floors (7), Hide (2), walls sent to
  players and regions revealed by doors (4), the `los` views (4), the seed-3
  hidden-information property test (1), a wall between parts of a big
  creature (1), the imported wall (1), and the stock maps (6: rooms not
  reachable, sizes). The rest, 976, pass on a half-square engine.

### List 6: cells per area

| Shape | Hex (today) | Square, `round` | Square, `grid` |
|---|---|---|---|
| Sphere 10 ft | 19 | 13 | 25 |
| Sphere 20 ft | 61 | 49 | 81 |
| Sphere 40 ft | 217 | 197 | 289 |
| Cone 15 ft (east / diagonal) | 7 | 7 / 6 | — |
| Cone 30 ft | 24 | 24 / 20 | — |
| Cone 60 ft | 84 | 84 / 72 | — |
