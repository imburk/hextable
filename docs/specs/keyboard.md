# Spec: keyboard movement, the follow camera and key maps

Issue #357. The owner, 15 November: "arrow keys or asdw should work for moving around the screen. My intent was
movement. Shift or alt could alter that... a default should be chosen. Then there should be maps to popular games ...
that live on the clients interface. For me I'd like movement with the camera reorienting to my direction of travel but
with a shift option to just look around. Space bar could return view to my direction of travel."

Decided by the owner and not reopened here: the keys walk the selected character (they do not pan); the view turns to
the direction of travel; Shift held looks around without moving; Space returns the view to the direction of travel; a
default key map and presets, all on the client.

## Rules that bind this design

- **Every step is the ordinary `move` action for one space**, sent by the same code as a tap on that space
  (`R.onTap` in `app.js` with no creature under it). Cost, Difficult Terrain, doors, the locked arena, hidden things,
  Opportunity Attack questions and every refusal are the engine's. The client decides nothing and predicts nothing.
- **Who may move what is the engine's rule**: a player their own characters (and companions), the DM anything.
- **Nothing is sent to the server** but the moves. The key map is a device preference (`hextable.keys`).
- **Touch devices are unaffected**: nothing here changes a tap, a drag or a pinch.

## One table

`packages/client/keys.js` holds `ACTIONS` (each action's name, its words and whether a preset may rebind it) and
`PRESETS` (each preset is data: action name to a list of keys). Keys are `KeyboardEvent.code` values, the key's place
on the keyboard, so W A S D are where they are on any layout; the list in Settings names them by a US layout's
letters. `actionOf(event, preset)` is the only way the app reads a key; `keyList(preset)` makes the "Show keys" list.

### The default map: "WASD and arrows"

| Action | Keys | With Shift held |
|---|---|---|
| Walk forward | W, Up | tilt the view toward the horizon |
| Walk back | S, Down | tilt the view toward straight down |
| Walk left | A, Left | look left |
| Walk right | D, Right | look right |
| Turn the map | Q (⟲), E (⟳) | the same |
| Look around (hold) | Shift | |
| Return the view to the direction of travel | Space | |

### Fixed keys, the same in every preset

| Action | Keys | Where it is handled |
|---|---|---|
| Undo, redo (DM) | Ctrl+Z; Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac) | `app.js` |
| Cancel the armed action | Escape | `app.js` (the drawer and the dice tray take it first when open) |
| Choose an action-panel tab | 1 to 9 (as many as there are tabs) | `actionpanel.js` |
| Open or close the menu | M | `drawer.js` |
| Move between tabs of a focused tab list | Left, Right, Home, End | `actionpanel.js`, `drawer.js` |
| Move the focus | Tab, Shift+Tab | the browser |

A test checks that no preset binds a fixed key and that no key is bound twice in a preset.

### Presets

Named in the UI by their layout. Each resembles a well-known kind of game; the names of the games are not in the UI.

| Preset | What changes from the default |
|---|---|
| **WASD and arrows** (default) | |
| **Arrows only** | W A S D do nothing; the arrows walk |
| **Block-builder style** (like the popular block-building survival game) | W A S D walk; the arrows turn the view (Left, Right) and tilt it (Up, Down) as a mouse would; **E opens the character sheet** (that game's inventory key), so E no longer turns; Q still turns |
| **World-builder style** (like the popular world-building platform) | Up and Down walk with W and S; **Left and Right turn the view** (as its camera keys do), so they no longer walk sideways; I and O zoom in and out |
| **First-person style** (like first-person shooters) | W A S D walk (A and D sidestep); the arrows turn and tilt the view; Q and E still turn; Space returns the view |

## Which space a key chooses

"Forward" is relative to the view. The camera looks along `(-sin yaw, -cos yaw)` on the board (x east, z south), and
its right is `(cos yaw, -sin yaw)`. The keys held make a wish in view terms: forward and back give `f = ±1`, right and
left `r = ±1` (opposite keys cancel). Each candidate neighbour's direction (`G.toWorld` of the neighbour minus that of
the space, from the geometry interface, `docs/specs/square-grid.md`) is turned into view terms and given its angle
from forward, clockwise positive. The candidate whose angle is nearest the wish's is chosen.

- **Hexes**: the six neighbours are the candidates, for one key or two. The six directions are 60 degrees apart, so the
  chosen neighbour is never more than 30 degrees from the key's direction.
- **Squares**: one key chooses among the four side neighbours (never more than 45 degrees off). Two keys held together
  (W and D, say) choose among all eight, so a diagonal comes when the view is square to the grid. Every value of the
  table rule `diagonals` (`real`, `srd`, `alternate`) allows a diagonal step; what it costs is the engine's.
- **Ties** (a wish exactly between two candidates, as at yaw 0 on hexes): the candidate clockwise of the wish wins.
  Opposite keys therefore choose opposite neighbours. Pinned by a test at every 15 degrees of yaw on both grids.
- **The frame is kept while keys are held.** The yaw used is the one when the first walk key went down, kept until every
  walk key is up (or a refusal or a pause ends the walk). Without that, holding A with the view following would walk in
  a circle. So holding a key walks a straight line along the grid; the next press measures from wherever the view then is.

## Stepping

- The first step of a walk waits 50 ms for a second key, so W and D pressed together make one diagonal step and not a
  step forward first.
- One step at a time: a step is sent, and the next waits for its answer (an update that names the walker, or a refusal).
  An answer that does not come within 2 seconds ends the walk. A held key repeats every 200 ms outside a fight and every
  400 ms in one. In `wait` pace a step also waits until the beats of the last one have played, as a tap would.
- A walk stops at once, and the key must be pressed again, on: release; a refusal (shown as today, by the toast and, at
  the arena's edge, the flash); a question opening (a reaction prompt, `state.prompt` or `state.pending`); a fight
  starting or a turn changing; the selection changing; the mode leaving plain moving (a spell or an attack armed); the
  window losing focus. The key's own auto-repeat is ignored, so nothing queues up after a release.
- In a fight a step spends movement exactly as a tap on that space does. Nothing extra is asked; after each step an
  information toast says how much movement is left ("Move 20 ft left"), beside the status line's own count. The keys
  never Dash.
- With nothing selected, or a creature selected that this person may not move, the first walk key selects the person's
  own character (the DM's: the first party character) and walks it.
- Flying creatures go through the tap's own path, so they keep the height chosen with Higher and Lower.

## The follow camera

- After each accepted step taken with forward held (W, or W with A or D) the view turns, eased, to face the step's
  direction (`R.face(yaw)`); that is the direction of travel. Facing a grid direction exactly also means the next W is
  exactly that direction, with no tie. With `prefers-reduced-motion` the view snaps.
- A step back or to the side (S, A or D without W) leaves the view where it is, as backing up and sidestepping do in
  third-person games. Otherwise S would turn the view round and the next press of S would walk the other way, and
  separate presses of A would walk a square.
- **A manual turn wins.** Q, E, Shift-look, a right-button or Shift drag, or a two-finger twist cancels the turn in
  progress and suspends following until the next walk starts (every walk key released, then one pressed) or Space. The
  renderer counts manual turns (`cameraAngles().turns`); the app compares the count.
- The view's centre already follows the walker (the `moved` beat focuses it, as for a tap).
- **Shift held**: the walk keys send nothing. Left and right turn the view (1.8 radians a second while held), up and down
  tilt it (between the renderer's limits). Releasing Shift with a walk key still held starts a new walk from the new view.
- **Space**: centre on the selected character and face its last direction of travel (its last step with forward held;
  the view's turn stays as it is if it has not walked forward with the keys). Following resumes.
- Both renderers: the classic renderer (`?renderer=gl`, to be removed in R14 step 2) has the same `face` and `tilt`, so
  its keys and follow camera work too. The empty renderer accepts both and does nothing.

## When the keys do nothing

The handler does nothing (and the browser keeps the key) when Ctrl, Meta or Alt is held (browser shortcuts), when the
lobby is up, or when the focus is in an input, a textarea, a select, anything contenteditable, a tab list (the arrows
move between tabs there), or any dialog (`role="dialog"` or `"alertdialog"`, `<dialog>`; the reaction prompt, the
formation popup, the character viewer, the drawer when it covers the map, and any later panel with a textarea, such as
feedback). It also does nothing while any modal dialog (`aria-modal="true"`) is on screen or the reaction prompt is up.

- **Space** never scrolls the page. On a button that has the keyboard focus (`:focus-visible`), Space presses the button
  as always; on a button that was last clicked with the mouse, Space returns the view instead (and the button is not
  pressed again). With the dice tray up, Space throws the dice as before.
- Nothing traps the keyboard: Tab and Shift+Tab are never taken, so the drawer and the panels are reached as before.

## Settings

"Keys" in the Controls section of Settings: a choice of preset and a "Show keys" button that lists the current keys
(from `keyList`). A note says the keys need a keyboard and the choice stays on this device.

## Build notes (#357)

- `keys.js` imports nothing; its tests (`packages/client/test/keys.test.js`) run in Node with the rules' `HEX` and
  `SQUARE`. The walker (`createWalker`) is a small state machine given its clock and its effects, tested the same way.
- The renderer interface gains `face(yaw, snap)` and `tilt(d)`; `cameraAngles()` gains `turns`.
- Smoke pass `keys` (`scripts/smoke/keys.mjs`).
- Not verified here: real keyboard latency and repeat, a real GPU, a phone (a phone has no keyboard; the pass checks the
  phone layout did not change).
