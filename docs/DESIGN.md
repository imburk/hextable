# Hextable design

Last checked against the code: 2026-11-20 (the counts below are tested by `packages/rules/test/guides.test.js`). What is built, and what is next: [ROADMAP](ROADMAP.md); what is missing: [DEBT](DEBT.md); the detail of each part: [specs](specs/README.md).

## Goals

1. Free roaming in a 3D world until a battle starts; then hexes lock and play
   goes into turns.
2. SRD 5.2 rules fully enforced by the engine.
3. Seamless character handling: sheet, spells and objects integrated with play,
   not a separate form to keep in sync.
4. Works on PC, phone and tablet.
5. Hosted: players join by link, with a login or DM approval.
6. Modular, so each layer can be upgraded without touching the others:
   tokens → 3D characters → animated 3D characters; damage and spells as
   numbers first, animations later.

## Decided

| Topic | Decision |
|---|---|
| Rules | SRD 5.2, fully enforced |
| Licence of the project | Open source (AGPL-3.0-or-later) |
| Access | Cloud link, with login or DM approval |
| Terrain mapping | Can come now or later; not blocking |
| Presentation | Staged: tokens, then 3D, then animated |

## Stack

The first playable version was prototyped before this repo existed and set the stack:

| Topic | Choice | Reason |
|---|---|---|
| Platform | Web app | One codebase covers PC, phone and tablet with no app-store step |
| Language | Plain JavaScript ES modules | The working prototype is written in it; no build step, runs straight from static hosting |
| 3D | **Three.js**, vendored and pinned (r187), the only renderer since R14 (#348, #355) | Models, animation, materials and shadows are a large body of general GPU code that is better borrowed than written untested. Costs about 458 KB gzipped, once per player. It is copied into `packages/client/vendor/` (release, commit and SHA-256 in the `README` there), not installed. Our own code (rooms, timeline, sight, picking) stays behind the interface of `renderer.js`, so another renderer, or none (`?renderer=none`), can still go behind it. Reasoning: `docs/specs/renderer.md`, Decision 8 |
| Zip | **zip.js**, vendored and pinned (v2.25.0, BSD-3-Clause), approved 20 November 2026 (#572, #582) | An adventure module is a zip (`docs/specs/adventure-module.md`, Decision 1). It only inflates and writes; every safety check of the zip is our own, in `packages/client/modulezip.js`, done before the library loads. About 107 KB gzipped, fetched only when a module is opened. Same vendoring rules as Three.js |
| Server | Node.js, WebSockets written on the built-in `http` module | Same language as the rules; nothing to install |
| Storage | Browser storage for solo play; one JSON file per table on the server | A table is one JSON document; move to a database when a persistent world needs queries |
| Licence | AGPL-3.0-or-later | Changed from MIT on 13 November 2026: anyone who runs a modified table server must offer its source |
| Hex layout | Pointy-top hexes, 5 ft each, axial coordinates, per-hex height | Matches SRD distances |

Deferred, not dropped: **TypeScript**, to be added module by module when tests alone no longer keep the rules engine safe. Nothing is installed from the network; vendored libraries are copied in with their release and hashes recorded.

## Architecture

```
packages/
  rules/src/   Rules engine, hex maths, dice, monster AI, scenario, SRD content.
  client/      Browser app: renderer, table UI, themes, transport.
  server/      Table server: static files, tables over WebSocket, saving.
scripts/       build.mjs assembles dist/.
```

### Flow of a player action

1. The client sends an **action**: `{ type: "attack", actor, target, attack }`.
2. `apply(state, action, { role, userId })` checks it against the rules and
   against who is allowed to control that creature.
3. If it is illegal, nothing changes and the player gets a plain-language
   reason ("Too far. Brenna has 10 ft of movement left.").
4. If it is legal, the engine updates the state with its seeded dice and
   returns **events**: `attack`, `damage`, `save`, `down`, `turn`, and so on.
5. Clients update their view from the events. Today that is a number floating
   over a pawn; later the same event triggers an animation.

Events are also written to the world's **timeline** with the in-world time.
`recall(state, { since, types, about, tags })` queries it; this is what an AI
DM or AI character will read.

In solo play the engine runs in the browser tab. Online, the same call runs on
the server and the result is broadcast.

### Modes

```
Exploring ──(DM calls initiative, an attack, or walking within 10 ft of an enemy)──▶ Fight
Fight ──(one side is down, or the DM ends it)──▶ Exploring
```

- **Exploring**: free movement, up to 300 ft per tap, no turns.
- **Fight**: the hexes around the start of the fight lock into an arena.
  Initiative is rolled, only the active creature can act, and movement,
  actions and bonus actions are budgeted per turn. Creatures who walk into the
  arena join the fight; fighters cannot leave it.

### Rules engine (`packages/rules`)

`engine.js` holds `apply()`: the order in which an action is checked, the
pause for reaction prompts, what runs after every action, and the timeline.
Handlers are split by domain under `engine/`, above layered helpers that
import only downwards, so there are no import cycles. CLAUDE.md says which
module holds what, and a test keeps that list complete.

What it enforces (the specs say how; `npm run content` says how much):

- Movement, initiative, turn budgets, attacks, opportunity and other reactions,
  damage types, conditions, death saves, healing, Concentration, lasting
  effects and zones, Temporary Hit Points, grappling.
- Spells and monster actions as data run by effect steps; Multiattack and recharge.
- Twelve classes to level 20 (build from class and level, levelling, multiclassing,
  feats, magic items with attunement, Wild Shape), species as data, ability scores.
- Maps with levels, height, walls, doors, objects, size and footprints; hexes
  or squares; line of sight, cover, light, hiding and finding.
- Companions, summons and riding; shops, an atlas of places and travel (stages built
  so far are in each spec's status line).
- Rests, the world clock, the chronicle and timeline, DM tools, undo and redo.
- A monster AI, and a stand-in for a creature nobody commands, that play through `apply()`.

Content entered today (SRD 5.2.1, from the packs):
<!-- count:spells -->339<!-- /count --> spells,
<!-- count:monsters -->329<!-- /count --> monsters,
<!-- count:items -->76<!-- /count --> magic items,
<!-- count:feats -->17<!-- /count --> feats,
<!-- count:objects -->25<!-- /count --> map objects,
<!-- count:species -->9<!-- /count --> species; each at an honest tier (`auto`, `assist`,
`manual`). What the engine hands to the DM instead is listed in DEBT.md.

### Client (`packages/client`)

- **Scene**: renders the world and creatures from state. Creatures are drawn
  by a presenter (pawns today), so static and animated models can replace it
  without touching the rules.
- **Input**: one action layer mapped from mouse/keyboard and from touch.
- **Sheet**: the character sheet is a live view of the creature's rules state.
  Tapping a spell or weapon on the sheet starts the same intent as using it in
  the scene.
- **Themes**: colours, fonts and UI styling, switchable in play. Styling only.

### Server (`packages/server`)

- One Node process serves the built game, `/api/ping`, and tables over a
  WebSocket at `/ws`. No dependencies. It compresses the game's text files
  with Node's own `zlib` (gzip, once per file, kept until the file changes).
- The DM hosts a table and gets a code; players join with the code and wait
  for the DM to let them in. A player controls the one character they claim.
- The server holds each table's state, runs every action through `apply()`
  with the sender's role, and sends the result to everyone at the table.
- Tables are saved to disk as JSON and reloaded on restart; players rejoin
  with a saved token.
- Each person is sent a view of the game built by `packages/rules/src/view.js`:
  the DM gets everything, players get no dice seed and no monster numbers.
- The DM can add creatures hidden from the players; the engine reveals one
  when the party comes close, walks into it, or a fight starts around it.
- After the first full view, each update carries only what changed.
- Players see only what their characters can see (line of sight, light).
- Not built: accounts, a persistent world across sessions.

## Later, and what keeps the door open

| Want | What the design already provides |
|---|---|
| Persistent world | Event log plus snapshots per world, not per session |
| Timeline an AI can tap | The event log, tagged with in-world time and significance |
| AI DM and AI characters | They send the same intents as humans through the same server API |
| Importing 3D models | glTF as the internal format; converters feed into it |
| Full skinning | Theme bundles on the client; no rules impact |
| Terrain mapping | Per-hex height and terrain type fields exist from day one, flat by default |
