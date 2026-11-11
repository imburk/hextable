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
  starter scenario and SRD content.
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
- **Content is data.** Spells, monsters and characters are entries in
  `packages/rules/src/content`; code implements mechanics, data uses them.
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
