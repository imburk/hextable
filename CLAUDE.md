# Hextable — working notes for Claude

Layout last checked 2026-11-20; `packages/rules/test/guides.test.js` fails if a rules module is missing from it.

Read `docs/DESIGN.md` before changing architecture and `docs/ROADMAP.md` to see
what is in scope right now. Agreed designs are in `docs/specs`; build to them.
`AGENTS.md` has the working agreement for every coding agent, including you.

If you are the lead conversation: the hand-over note, the agent brief, the usage
log and the session records are in the private repo `imburk/hextable-ops`
(`HANDOVER.md`, `agents/AGENT-BRIEF.md`, `USAGE.md`, `sessions/`). Add that repo
to your session and read `HANDOVER.md` first; write the end-of-session notes
there, never here.

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
  notes), `history.js` (undo and redo), `hitpoints.js` (rolled hit points: the rolls kept on a sheet and the table's low-roll rule), `homebrew.js` (which creatures carry a
  homebrew monster), `imbue.js` (a weapon a spell or feature changes for a while: Shillelagh, Magic Weapon, Sacred Weapon; `armed` reads every attack record through it), `import-fgxml.js` and `import-uvtt.js` (Fantasy Grounds
  characters, Universal VTT maps), `market.js` (shops: the market document and
  money), `migrate.js` (brings a saved game up to date), `patch.js` (sending only
  what changed), `places.js` (a world's atlas as state: the place in play and
  parked ones), `reactions.js` (standing instructions and prompts), `rewards.js`
  (XP and loot), `rng.js` (seeded dice), `scenario.js` (the starter valley),
  `scenes.js` (scenes with no map), `scores.js` (making ability scores),
  `summons.js` (summon blocks), `terrain.js` (what lasting spells do to the
  ground and air), `timeline.js` (trimming the timeline), `view.js` (what each
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
- **Content is data.** Spells, monsters and characters are entries in a pack
  under `packages/rules/src/content`. Pack files hold no functions and no
  imports. Code implements mechanics; data uses them. A new effect step,
  hook, op or tag is an engine change with a spec amendment, never part of a
  content change.
- **Only SRD 5.2 content.** Nothing from non-SRD books goes in the repo.
- **Presentation is swappable.** The renderer draws whatever state it is given;
  themes change styling only, never rules.
- **Mobile is a first-class target.** Check touch and a phone-sized screen for
  every UI change.

## Conventions

- Plain JavaScript ES modules, no build tooling and no runtime dependencies.
  Do not add a dependency or a bundler without a reason written in the design
  doc. (TypeScript and Three.js were considered; see the design doc.)
- `npm test` runs the rules and server tests with Node's built-in runner.
  Every new mechanic lands with a test.
- `npm start` builds the game and runs the table server at
  http://localhost:8080.
- Small PRs, one module at a time.
