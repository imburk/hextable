# Hextable design

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
| Licence of the project | Open source |
| Access | Cloud link, with login or DM approval |
| Terrain mapping | Can come now or later; not blocking |
| Presentation | Staged: tokens, then 3D, then animated |

## Proposed (not yet confirmed)

These are recommendations to confirm before code is written.

| Topic | Proposal | Reason |
|---|---|---|
| Platform | Web app, installable as a PWA | One codebase covers PC, phone and tablet with no app-store step |
| Language | TypeScript everywhere | Rules code is shared between server and client |
| 3D | Three.js | Largest ecosystem, runs well on phones, loads glTF models |
| Server | Node.js with WebSockets | Same language as the rules; simple to host |
| Storage | SQLite to start, Postgres when a persistent world needs it | No database to administer in week one |
| Licence | MIT | Simplest permissive licence; revisit if copyleft is wanted |
| Hex layout | Flat ground hexes, 5 ft each, axial coordinates | Matches SRD distances; elevation added as a per-hex height later |

## Architecture

```
packages/
  rules/    Pure rules engine + SRD data. No rendering, no network.
  server/   Authoritative game server. Sessions, auth, persistence.
  client/   Browser app. Rendering, input, character sheet UI.
  shared/   Message types and schemas used by server and client.
```

### Flow of a player action

1. Client sends an **intent**: `{ type: "attack", attacker, target, weapon }`.
2. Server asks `rules` whether it is legal in the current state.
3. `rules` resolves it with the server's seeded dice and returns **events**:
   `attackRolled`, `damageDealt`, `conditionApplied`.
4. Server applies the events to the session state, stores them, and broadcasts
   them.
5. Clients update their view from the events. Today that is a number floating
   over a token; later the same event triggers an animation.

Because every change is an event, the event log is also the save file, the
undo history for the DM, and later the timeline an AI can read.

### Modes

A session is a state machine:

```
Exploration ──(DM or trigger starts combat)──▶ Initiative
Initiative ──(all rolled)──▶ Combat (turn loop)
Combat ──(DM ends or one side is down)──▶ Exploration
```

- **Exploration**: continuous movement, no grid. Server checks positions loosely.
- **Initiative**: each creature snaps to its nearest free hex; order is rolled.
- **Combat**: only the active creature can act. Movement, actions, bonus
  actions and reactions are budgeted and enforced per turn.

### Rules engine (`packages/rules`)

- **State**: creatures, their stats, resources, conditions, positions.
- **Mechanics** (code): ability checks, attack rolls, saving throws, damage and
  resistances, conditions, concentration, areas of effect on hexes, movement
  cost, opportunity attacks, resting.
- **Content** (data): spells, weapons, armour, items, monsters, classes,
  species, backgrounds. JSON, schema-validated, each entry composed from the
  mechanics above.
- **DM override**: the engine enforces rules for players; the DM can always
  apply a manual event (set HP, grant advantage, move a creature).

### Client (`packages/client`)

- **Scene**: renders the world and entities from state. An entity's view is
  chosen by a renderer interface, so token, static model and animated model
  are drop-in replacements.
- **Input**: one action layer mapped from mouse/keyboard and from touch.
- **Sheet**: the character sheet is a live view of the creature's rules state.
  Tapping a spell or weapon on the sheet starts the same intent as using it in
  the scene.
- **Skins**: a theme bundle (models, textures, UI styling). Styling only.

### Server (`packages/server`)

- Session rooms over WebSocket; one authoritative state per room.
- Join by link. A player either logs in or waits for DM approval.
- Roles: DM and player. Players see only what their characters could see once
  visibility is implemented; until then, everything is visible.
- Persists the event log and periodic snapshots.

## Later, and what keeps the door open

| Want | What the design already provides |
|---|---|
| Persistent world | Event log plus snapshots per world, not per session |
| Timeline an AI can tap | The event log, tagged with in-world time and significance |
| AI DM and AI characters | They send the same intents as humans through the same server API |
| Importing 3D models | glTF as the internal format; converters feed into it |
| Full skinning | Theme bundles on the client; no rules impact |
| Terrain mapping | Per-hex height and terrain type fields exist from day one, flat by default |
