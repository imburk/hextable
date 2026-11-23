# Working on Hextable as a coding agent

Layout last checked 2026-11-20; `packages/rules/test/guides.test.js` fails if a rules module is missing from it.

This file is for any AI coding agent (Claude, Gemini, Grok or another).
Read [docs/DESIGN.md](docs/DESIGN.md) before changing architecture and
[docs/ROADMAP.md](docs/ROADMAP.md) to see what is in scope right now. Agreed
designs are in [docs/specs](docs/specs); build to them.
The guides (AGENTS.md's layout, DESIGN, ROADMAP, the specs index) are tested by `packages/rules/test/guides.test.js`: a pull request that adds a rules module, changes a quoted content count, or adds a spec updates them, or the test fails.
What is wrong or missing is listed in [docs/DEBT.md](docs/DEBT.md). The
maintainer's working notes (hand-over, agent brief, session records) are kept
in a private repo, `imburk/hextable-ops`; you do not need them to take an issue.

## What this is

A browser-based 3D virtual tabletop for 5E-compatible play: free roaming until combat starts,
then a locked hex arena and turn-based play. SRD 5.2 rules are fully enforced
by the engine. Must work on PC, phone and tablet.

## Layout

- `packages/rules/src` — the rules engine. `apply(state, action, ctx)` is the
  only way game state changes. Also hex maths, seeded dice, monster AI, the
  starter scenario, views and patches. `effects.js` runs a spell's effect
  steps from its data on a stack kept in the game state. `modifiers.js`
  gathers what conditions, traits and lasting effects change about a roll
  or a number. `durations.js` keeps lasting effects, ends them, and handles
  Concentration. `zones.js` is areas that last (Moonbeam, Web) and what they
  do to a creature that enters them or starts or ends its turn there.
  `space.js` is where things can stand: levels, heights, surfaces. `map.js`
  is the map document: its format, its linter, its migration and its edits.
  `walls.js` works out what walls and doors block.
  The rest of `packages/rules/src`, one line each: `ai.js` (monster brain),
  `derive.js` (a character built from class and level), `forms.js` (Wild Shape
  and other forms), `grid.js` (the geometry of hexes or squares behind one
  interface) and `hex.js` (hex maths), `handouts.js` (handouts and private
  notes), `history.js` (undo and redo), `hitchoices.js` (what a creature may choose after its attack hits: Divine Smite and its standing instructions), `hitpoints.js` (rolled hit points: the rolls kept on a sheet and the table's low-roll rule), `homebrew.js` (which creatures carry a
  homebrew monster), `imbue.js` (a weapon a spell or feature changes for a while: Shillelagh, Magic Weapon, Sacred Weapon; `armed` reads every attack record through it), `import-fgxml.js` and `import-uvtt.js` (Fantasy Grounds
  characters, Universal VTT maps), `market.js` (shops: the market document and
  money), `migrate.js` (brings a saved game up to date), `patch.js` (sending only
  what changed), `places.js` (a world's atlas as state: the place in play and
  parked ones), `reactions.js` (standing instructions and prompts), `rewards.js`
  (XP and loot), `rng.js` (seeded dice), `scenario.js` (the starter valley),
  `scenes.js` (scenes with no map), `scores.js` (making ability scores),
  `summons.js` (summon blocks), `terrain.js` (what lasting spells do to the
  ground and air), `timeline.js` (trimming the timeline), `todo.js` (the DM's to-do tray: a card for each note the engine hands over), `view.js` (what each
  person at the table may know), `vision.js` (what the party sees and
  remembers), `weapons.js` (what a weapon attack may do) and `worldpack.js`
  (the DM's world pack: atlas, pins, routes), `known.js` (which places of a world players know, and their player ids),
  `adventure.js` (an adventure module's format and its checker) and `shopids.js` (the numbers players are
  given for shops).
  `view-fields.js` classifies every field of a party creature and every setting as sent, scrubbed or withheld; `view.js` builds a player's view from it.
  `content/sizes.js` is the table of creature sizes. Design:
  `docs/specs/maps-and-objects.md`, whose build notes say what was settled.
- **Engine layout.** `engine.js` is the entry point: `apply()`, its
  validation order, dispatch, the `react` handler (it re-runs a waiting
  action), history and `recall()`; it re-exports everything importers use,
  so import from `engine.js`, never from `engine/`. The handlers live in
  `packages/rules/src/engine/`, one module per domain, each exporting a
  `handlers` object that `engine.js` spreads into its table:
  `movement.js` (move, dash, stand, disengage, follow, marching order;
  walking itself), `attacks.js` (attack, act, dodge, reaction instructions,
  endTurn; Multiattack pools), `casting.js` (cast, Metamagic, Counterspell,
  teleport targets, endEffect), `features.js` (secondWind, feature with Font
  of Magic and Wild Shape, use, check, search, hide), `characters.js`
  (adding, editing, levelling, gear, attunement), `rests.js` (rests, time,
  chronicle, rewards) and `dm.js` (DM tools, the map, light, settings,
  handouts, scenes), `companions.js` (the DM's `bond`, a master's `command`,
  and a familiar's `dismiss` and `recall`; design `docs/specs/companions.md`), `trade.js` (purses and shops:
  `market`, `openShop`, `shopEdit`, `showShop`, `revealGoods`, `closeShop`, `quote`, `buy`, `chipIn`, `sell`,
  `take`, the place rule; design `docs/specs/shops.md`, its money arithmetic in the pure `market.js` beside
  `engine.js`) and `travel.js` (the atlas's places: `enter`, `leave`, `goTo`, parking; design
  `docs/specs/travel.md`). Under them, helpers used by more than one domain, in
  layers that import only downwards: `shared.js` (basics: `fail`, `ent`,
  `control`, dice, asking a player) ← `world.js` (moving and fitting,
  regions, objects, hidden creatures, areas and targets, marching) and
  `rolls.js` (healing, rolls, saves, conditions, checks) ← `sheets.js`
  (`makeEntity`, remaking a creature from its sheet) ← `resolve.js` (damage,
  the attack roll, reactions, falls, pushes, teleports, the `KIT` lent to
  `effects.js`, and starting, turning and ending fights). There are no
  import cycles in `engine/`; the rules package has three older ones (two
  through `content/index.js`, one between `modifiers.js` and `sight.js`) that
  `packages/rules/test/imports.test.js` pins, and no new one may be added. Two actions must not share a name: the later spread would
  win silently.
- `packages/rules/src/content` — rules content. `srd52/` is a pack of data
  files; `schema.js` is the closed vocabulary they may use and the linter
  that enforces it; `index.js` loads packs. `registry.js` holds a table's own
  homebrew pack: `loadPack` checks one, `overlayOf` joins a table's packs,
  `using` lends them to the content lookups for one synchronous call
  (`docs/specs/homebrew.md`); `packs.js` is what a game says about the packs it needs and `reader.js` reads an entry back in plain words; `dryrun.js` casts a homebrew spell in a throw-away game. `npm run content` prints what is
  entered and at which tier.
- `packages/client` — the browser app: WebGL renderer, table UI, themes, and
  the transport that talks to either an in-tab engine (solo) or a server.
- `packages/server` — the table server: serves the built game and runs
  multiplayer tables over a WebSocket. Its README has the protocol.
- `scripts/build.mjs` copies the client and the rules into `dist/`, where the
  rules appear as `./shared`. Client code imports rules from `./shared/...`.

## How work is handed out

1. Work comes from GitHub issues. Take one issue. Do only what it asks.
2. Each issue lists the files it may touch. If the task seems to need a file
   outside that list, stop and say so in the issue instead of editing it.
3. One branch and one pull request per issue. Small PRs, one module at a time.
   Name the branch after the issue, for example `12-rate-limiting`.
4. Before opening the pull request, run `npm test` and `npm run build`. Both
   must pass. New behaviour needs a new test.
5. In the pull request, say what you changed, how you checked it, and what
   you did not check. Do not merge your own pull request.
6. If you are contributing from outside the project, your first pull request
   must carry the acceptance line of the contributor agreement in
   [CONTRIBUTING.md](CONTRIBUTING.md).

## Rules that do not bend

- **Everything goes through `apply()`.** The UI, the server, the monster AI and
  any future AI DM send actions and read events. Nothing else mutates state.
- **The server is authoritative.** It runs every action through `apply()`
  with the sender's role. Never trust client-computed outcomes.
- **The rules package is pure.** No rendering, no network, no I/O, no
  `Math.random`: dice come from the seed stored in game state, so any game
  replays exactly.
- **A rejected action changes nothing.** Validate before mutating.
- **The engine never pretends.** What it cannot apply by the rules it hands
  to the DM with a `manual` event. It does not approximate or skip quietly.
- **Presentation is swappable.** The renderer draws whatever state it is given;
  themes change styling only, never rules.

## Hard limits

- **No new dependencies, no bundler, no framework.** The project runs on
  Node's standard library and plain browser JavaScript ES modules on purpose,
  with no build tooling and no runtime dependencies. Do not add a dependency
  or a bundler without a reason written in the design doc. (TypeScript and
  Three.js were considered; see the design doc.)
- **Do not edit `packages/rules/src/engine.js` or `packages/server/src/tables.js`
  unless the issue names them.** Most parallel work collides there, and
  mistakes there are rule or security bugs.
- **Only SRD 5.2.1 content.** Nothing from other sourcebooks, and no invented
  stats presented as SRD.
- **Content is data, and it is checked.** Spells, monsters and characters are
  entries in a pack under `packages/rules/src/content`. Entries go in
  `packages/rules/src/content/srd52/` in the format `schema.js` enforces. Pack
  files hold no functions and no imports. Code implements mechanics; data uses
  them. A new effect step, hook, op or tag is an engine change with a spec
  amendment, never part of a content change. Do not add to the lists in
  `schema.js`; if an entry needs something the vocabulary lacks, enter it at
  the tier that is honest (`assist` or `manual`) and say what was missing in
  the pull request. Set `checked: true` only if you compared every number in
  the entry against the SRD 5.2.1 text, and say so in the pull request.
- **A feature that adds state players might not see lands with a `twin()` test.**
  Hidden creatures, unexplored regions, DM notes, parked places, hidden shop lines, homebrew
  monsters and the like: write one scenario in `packages/server/test/twin.js` form and give it
  the hidden thing. It runs the script in two worlds through the table server, and fails unless
  every player is sent the same bytes in both (views, patches, events, errors, message counts,
  sequence numbers). Examples are in `packages/server/test/twin-worlds.test.js`. If it finds
  a leak, do not hide it: file an issue and mark the test `todo` with its number.
- **Mobile is a first-class target.** Any UI change is checked at a phone-sized
  screen with touch, as well as on desktop.
- **No secrets in the repo.** There are none today; keep it that way.

## Running it

```
npm test     # rules and server tests, Node 22+ (Node's built-in runner)
npm start    # build, then serve at http://localhost:8080 with multiplayer
```

Open two browser windows on that address to try a DM and a player together.
