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
| Licence of the project | Open source (MIT) |
| Access | Cloud link, with login or DM approval |
| Terrain mapping | Can come now or later; not blocking |
| Presentation | Staged: tokens, then 3D, then animated |

## Stack

The first playable version was prototyped before this repo existed and has been
brought in as the codebase. It set the stack:

| Topic | Choice | Reason |
|---|---|---|
| Platform | Web app | One codebase covers PC, phone and tablet with no app-store step |
| Language | Plain JavaScript ES modules | The working prototype is written in it; no build step, runs straight from static hosting |
| 3D | The prototype's own WebGL renderer, no library | Already works on phones with nothing to download |
| Server | Node.js, WebSockets written on the built-in `http` module | Same language as the rules; nothing to install |
| Storage | Browser storage for solo play; one JSON file per table on the server | A table is one JSON document; move to a database when a persistent world needs queries |
| Licence | MIT | Simplest permissive licence |
| Hex layout | Pointy-top hexes, 5 ft each, axial coordinates, per-hex height | Matches SRD distances |

Two earlier proposals are deferred, not dropped:

- **TypeScript.** Worth adding when the rules engine grows past what tests alone
  keep safe. Convert module by module; do not rewrite.
- **Three.js.** Worth adding when imported glTF character models and animation
  arrive, since that is where a hand-written renderer stops paying for itself.
  The renderer sits behind a presenter interface so it can be swapped.

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

Built so far:

- Movement with terrain cost, difficult terrain, occupied hexes
- Initiative, turn order, action / bonus action / movement budgets
- Attack rolls with advantage and disadvantage from the situation, critical hits
- Opportunity attacks, Dash, Disengage, Dodge, prone
- Damage types with resistance, vulnerability and immunity
- Death saving throws, instant death from massive damage, healing
- Spell slots; attack, saving-throw, automatic and healing spells; cone areas
- Class features in the starter set: Second Wind, Sneak Attack, Pack Tactics,
  Nimble Escape
- Long rest, the world clock, the chronicle and timeline
- DM tools: spawn, place, set HP, start and end fights, settings
- A monster AI that plays creatures through the same `apply()` call

Content so far: 6 spells, 3 monsters, 4 level 1 pregenerated characters.

Not built yet: character creation and levelling, conditions beyond prone and
unconscious, concentration, reactions other than opportunity attacks, most
spells and monsters, equipment as rules objects, visibility.

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
  WebSocket at `/ws`. No dependencies.
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
- Not yet: line of sight, accounts, sending only changes.

## Later, and what keeps the door open

| Want | What the design already provides |
|---|---|
| Persistent world | Event log plus snapshots per world, not per session |
| Timeline an AI can tap | The event log, tagged with in-world time and significance |
| AI DM and AI characters | They send the same intents as humans through the same server API |
| Importing 3D models | glTF as the internal format; converters feed into it |
| Full skinning | Theme bundles on the client; no rules impact |
| Terrain mapping | Per-hex height and terrain type fields exist from day one, flat by default |
