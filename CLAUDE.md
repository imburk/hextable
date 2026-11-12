# Hextable — working notes for Claude

Read `docs/DESIGN.md` before changing architecture and `docs/ROADMAP.md` to see
what is in scope right now. Agreed designs are in `docs/specs`; build to them.
`AGENTS.md` has the working agreement for every coding agent, including you.

## What this is

A browser-based 3D virtual tabletop for D&D: free roaming until combat starts,
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
  `content/sizes.js` is the table of creature sizes. Design:
  `docs/specs/maps-and-objects.md`, whose build notes say what was settled.
- `packages/rules/src/content` — rules content. `srd52/` is a pack of data
  files; `schema.js` is the closed vocabulary they may use and the linter
  that enforces it; `index.js` loads packs. `npm run content` prints what is
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
