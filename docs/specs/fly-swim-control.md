# Spec: flying and swimming control (a column of cubes, a plane of cells)

Status: C1 to C4 are built (#716, flying), E1 (the swimming engine, #836) and E2 (breath, underwater combat, Water Breathing, #840); C5 (the swimming control) is not. The owner answered questions 1 to 8 with the defaults (board, 23 November 2026). What was
settled while building is in "Build notes" at the end.

Written 22 November 2026, after the owner's game night. It sits beside `maps-and-objects.md` (the rules for height, M6),
`one-token-menu.md` (where the controls live) and `renderer.md` (how things are drawn). Where it touches them it says so.

## What the owner asked

> "There doesn't appear to be any way to fly? I'd envision movement for flying/swimming to involve the appearance of a
> column made of translucent cubes to indicate the desired height and once selected a plane of potential squares, also
> translucent. Open to other ideas."

Two things are in that: the owner could not find a way to fly (a discovery problem), and he wants a way to see and pick a
height that is a picture, not a number (a design problem). The recommendation below is his idea, made concrete.

## What exists today

### The rules engine (it is mostly there for flying, and not there for swimming)

- **`move` accepts a height.** `to` is `{ q, r, z }`. With `z` left out, the engine picks the nearest surface the creature
  can stop on. With `z` given, the engine uses it if it is on a surface the creature can reach, or open air
  (`packages/rules/src/engine/movement.js`, the `move` handler; `airspace` in `engine/world.js`). Anything else is refused
  with "Too far", "Can't get there" or "There's nothing there to stand on", and nothing changes.
- **Flying** is part of the one search the engine does for every move, `moveOptions` (`engine/world.js`). A creature that
  can stay up (`aloft`: a Fly Speed above 0, and not Prone or Incapacitated unless it can hover) may step to any
  neighbouring cell level, 5 ft up or 5 ft down, or straight up or straight down. Each step costs 5 ft (10 if it squeezes
  past a hostile creature). It cannot pass through a floor, passes over rails, and is stopped by walls up to 10 ft above
  their floor. It looks for places up to 40 ft above the highest floor on the map, or above the flyer itself if that is
  higher (`FLY_CEILING` in `engine/shared.js`).
- **A creature does not need to be in the air to take off.** `aloft` is true for any creature with a Fly Speed, on the
  ground or not (a spell's or a feature's temporary Fly Speed counts: Fly, Dragon Wings). So a first step of "up" from the
  ground is already something the engine allows.
- **How the speeds are spent.** In a fight each way of moving has what is left of its own Speed, less everything moved so
  far: `limit.fly = budget.move + (flySpeed - walk) * (1 + Dashes)`, and climbing the same with the Climb Speed. A creature
  that swaps from walking to flying has already used, of the new Speed, whatever it moved. Out of a fight flying is held
  to the larger of 60 ft and its Fly Speed. `budget.move` (walking feet left) can go below zero after flying, as the maps
  spec says.
- **Climbing** is between neighbouring cells whose floors differ by more than 5 ft (a ledge, a roof, a ladder object). It
  costs the rise as well, doubled without a Climb Speed. There is no "straight up a wall" with no ledge to stop on.
- **Falling.** After every action, whatever has nothing under it and cannot stay up falls and takes damage
  (`engine/resolve.js`). A creature that is still `aloft` never falls; a flyer knocked Prone, or whose Fly Speed ends, does.
- **Swimming (built since #836, see "Build notes (E1)").** Before it, a `water` tile had cost `Infinity` (`content/terrain.js`): nobody enters it, and a creature
  can only be placed over it by the DM. A Swim Speed is kept on the sheet and read by nothing (`content/reader.js`
  `MOVE_ENGINE.swim = false`; debt items T54 (6) and P3). There is no depth to water and no "in the water" position.
- **The monster AI flies**, because it reads the same `moveOptions`: every place a flyer could stop is a candidate, and a
  tie is broken in favour of the place nearest its own height (`ai.js`, the `rank` of the follow code and the `stops`
  loops). It has no idea of altitude as a tactic (keeping out of a goblin's reach, hovering over a pit). That is a rules
  and AI matter, not a control matter, and is outside this spec.

### The client (it can fly, but nobody can find out how)

- **A "Higher" and a "Lower" row** sit at the bottom of the Move tab of the action panel, shown only when the creature
  is `aloft` (`actionpanel.js`, `fly-up` and `fly-down`; `flyInfo` in `app.js`). Each press changes a number, `flyAlt`, by
  5 ft. Reaching 30 ft takes six presses. Nothing is drawn at that height; the row's small text says "Fly at 10 ft".
- **The reach** at that height is the ordinary move highlight, one flat fill per cell, drawn at the height each cell has
  (`app.js` line near 750 filters the engine's stops to the chosen height; `three-build.js` `buildOverlay`). It is one
  colour: today's reach is not shaded by cost. (The owner's brief for this spec said the walking reach is coloured by cost;
  it is not, so shading by cost is new for both ground and air here.)
- **A tap on a cell** sends `move` with the chosen height as `z` (`R.onTap`). A creature standing on the ground with
  `flyAlt` of 0 sends a plain move, and the engine picks a surface.
- **`flyAlt` is never cleared.** It is set by the buttons and read from then on, so after a fall, a landing or a new turn
  it can still say "30 ft" while the creature stands on the ground; the highlights then show nothing, and the tap says
  "can't reach that at 30 ft up".
- **The one-token menu** (`one-token-menu.md`, Decision 4) lists "fly higher and lower" in its Move group. Nothing of
  that menu is built yet; the Higher and Lower rows are what the Move group would carry.
- **Keys:** Q and E turn the map, W A S D and arrows walk, Shift looks, Space re-centres (`keys.js`). Nothing moves
  vertically. **The wheel** zooms the camera (`render-three.js`).

### The gap, in one paragraph

A flyer can already fly, but the control is two buttons hidden in a tab, with no picture and no way to see what a height
costs or where it leads. A swimmer cannot swim at all: the engine has nothing to move it by. The owner's idea fixes the
first with a drawing, and needs one engine step for the second. For flying, no engine change is needed.

## The design

Two moments, in this order. Choose a height (the column). Then choose a place at that height (the plane). Both appear only
for a creature on the move, on its turn (or any time out of a fight), and only for what the engine says is possible now.

### The column

- **What it is.** A stack of translucent blocks standing on the creature's own cell. One block for each 5 ft, from the
  surface under the creature up to the highest height it could end a move at this turn. On a hex map a block is a hex
  prism 5 ft tall; on a square map it is a cube. (The owner said cubes and squares; the shape follows the grid.)
- **What is drawn, and what is left out.** Only heights the creature can end a move at this turn: the blocks that have
  at least one place at that height in the engine's reach (`moveOptions` with `canStop`). A height it cannot reach is not
  drawn as a greyed block, in line with the owner's round-6 rule for the menu (the token is stationary; in combat only what
  is available is shown). The column is as tall as the reachable heights; it simply ends. The reason a height is missing
  (out of Speed, a ceiling, a floor above) is in the words under the column, not in the drawing (see "Words" below).
  One exception: when a height is missing in the middle (a floor above blocks a few cubes but the ones above it are
  reachable some other way), the gap is a faint outline so the column does not look broken.
- **Which block is lit.** The block at the creature's current height is outlined brightly with the creature's colour, and
  a small mark on it ("you are here"). That block is the default pick every time the column opens, so a flyer already at 30
  ft who only wants to go sideways opens the column, sees the plane at 30 ft at once, and taps: keeping the current height
  costs nothing. The remembered pick is cleared when the creature moves, lands, falls, loses its flight or a turn ends, so
  the stale `flyAlt` of today cannot happen.
- **The bottom block** is the ground (or the floor it stands on), labelled "Ground". Picking it is how a flyer comes back
  down: the plane shows the ordinary walking reach, and leaving the mode is then the same as an ordinary move.
  Other floors in the column (a roof, a gallery, a ledge) are marked on the column's side with a small ledge sign, so a
  creature can see that this height is a place to stand, not air.
- **Cost on the column.** A tap or a hover on a block says how much it takes to get there *straight up from here*, and
  how much flight is left afterwards: "30 ft up. Straight up costs 20 ft. 10 ft of flying left." The height numbers sit
  on the side of the column at every 10 ft (and on the picked block), in the same words as the rest of the interface.
- **Large and bigger creatures.** The column is on the creature's anchor cell and its height is the anchor's, which is what
  the engine stores. The plane then marks the anchor cells; the creature's footprint is drawn at the picked place as
  the walking reach draws it today.
- **Climbing.** No column. Climbing moves between neighbouring cells whose floors differ, and every such place is already
  a place in the ordinary walking reach, drawn at its own height. The walking plane keeps drawing ledges at their heights
  and shades them with the climb's extra cost (the shading below). A creature with a Climb Speed gets no new picture; one
  with a Fly Speed gets the column. (If the owner wants a straight-up climb with no ledge, that is a rules question, not a
  control one; see the questions.)

### The plane

- **What it is.** After a height is picked, a translucent plane of cells hangs at that height: one cell for every place the
  creature can stop at that height, laid out as the grid (hexes, or squares). It is the engine's own answer, the same
  stops the walking reach is made from, filtered to that height. A cell at the height of a real floor (a roof, a ledge)
  is drawn solid like a floor highlight, because that is a place to stand; a cell in open air is drawn glassy, with a dashed
  edge. The two look different without relying on colour.
- **Cost.** Each cell is shaded by the feet it uses to get there: the nearest third of the creature's reach is the lightest
  tint, the middle third a stronger one, and the farthest third the strongest. It is the same colour family the walking
  reach uses, so a flyer and a walker read alike. Under a held finger, or on a mouse hover, the cell shows its number and
  what is left: "35 ft, 25 left".
- **A line down.** A cell in the air does not say what is below it, and a plane drawn above the ground covers the ground
  behind it from some angles. So the cell the player is pointing at (hover on a mouse, the first touch on a phone) draws a thin line
  straight down to the floor under it, and a small ring on that floor, with the height in feet beside it. Hazards below
  (a pit, water, lava a spell left) are marked on that ring, because they are what matters if the flight ends.
- **Sending.** On a mouse a click on a plane cell sends the move. On touch the first tap marks a cell (line down, cost, a
  "Go" in the aim bar), a second tap on the same cell or on "Go" sends it. Reason: the plane hangs above the ground, so the
  cell a finger lands on and the cell the player meant can differ with the camera's angle, and a flying move is not
  something to send by accident. The ordinary ground tap stays one tap. The move sent is always the ordinary
  `{ type: 'move', actor, to: { q, r, z } }`; the engine decides.
- **The plane when more than one height is wanted.** A flight that goes up 15 ft and sideways 20 ft is one move to a cell
  at 15 ft; the engine finds the route. The player never plans the path.
- **After the move** the column and plane go away, and the creature's token carries a small tag with its height ("30 ft")
  for as long as it is off the ground, so a player can tell at a glance without opening anything.

### Swimming and underwater

The same two pictures, with water for air:

- **The column** goes from the bed of the water up to the surface and a little above it (a swimmer can break the surface;
  a flyer can leave it). The water part of the column is tinted blue, the air part the ordinary colour, and the block at the
  surface is marked "Surface". A swimmer at the surface who wants to dive picks a lower block; there is no "swim" button
  and no "fly" button, only the block.
- **The plane** under water is a water-tinted plane of the cells the swimmer can reach at that depth, shaded by cost as
  above. The line down runs to the bed.
- **Cost** follows the SRD (Swimming, "each foot of movement costs 1 extra foot... ignore this extra cost if you have a Swim
  Speed and use it to swim"): a creature with a Swim Speed pays 5 ft a step; one without it pays 10 ft. The number under
  the finger says which.
- **This needs the engine** (stage E1 below). Until then, swimming has no column because there is nothing for the column
  to be made of. The client stages C1 to C4 are built so that the column asks "which heights has the engine got here?"
  and draws them whatever the medium, so E1 adds water and C5 adds its tint, not a second control.

### What it will not offer (it shows only what is possible)

The column and the plane are built from what the engine reports it can do this turn, so each of these simply shows less:

| Why a height or cell is missing | How it shows |
|---|---|
| Not enough Speed left (walking, flying, climbing are separate: see "Words") | The column ends at the last reachable height; the cell is not in the plane |
| The 40 ft ceiling the engine searches to | The column ends; the words say "40 ft is as high as the table's search goes here" |
| A floor or a ceiling above, a wall to cross | The block is missing (a faint outline in the middle of a column); the plane is cut by it |
| Another creature's space, or a hostile one it cannot pass | The cell is not in the plane |
| Prone, or a Fly Speed that cannot hold it up (not `aloft`) | No column; the Fly row says why: "Wren is Prone: stand up first, or hover" |
| Incapacitated, Restrained, held, Speed 0 | No column; the same words the Move row uses today |
| The arena is locked (a fight is on) | Cells outside the arena are not in the plane |
| Not the creature's turn | No column; "Waiting for your turn", as the Move row says |

### Falling

By the SRD a flyer that is not Prone or Incapacitated stays up, so ending a move in the air is not, in itself, a fall, and
the plane does not warn about it. The real dangers are two, and the picture names them:

1. **A flight that ends on its own.** A Fly spell or Dragon Wings has a duration. When the picked cell is off the ground
   and the creature's flying has a lasting end that falls before its next turn (read from `durations.js`; the builder
   checks the field exists and says so in the pull request if it does not), the aim bar says: "Fly ends in 1 round: you
   would fall 30 ft (3d6)." The 3d6 is what the engine's fall does (1d6 for each 10 ft, at most 20d6), asked of the
   engine, never worked out by the client.
2. **What is below.** The ring on the floor under a pointed-at cell marks a pit, water or a hazard (above).

A creature that has just been knocked Prone while aloft is the engine's business (it falls); the client only shows the
result.

### Words, in every state

A one-line state under the column, always visible, in the plain words of the rest of the menu. Examples:

- "Flying at 20 ft. 15 ft of flying left, 0 of walking."
- "Pick a height. Straight up to 30 ft costs 10 ft."
- "Can't fly: Wren is Prone."
- "Wren swims at 40 ft: 25 left."

Each way of moving is named because the engine spends them together: a creature that walked 15 ft and then flies has used
15 ft of its Fly Speed. The client's number is the same formula the engine uses (`left(speed)` above), pinned by a test that
every stop the engine reports is within it. If this ever gets awkward, one read-only export from `engine/world.js` (the
ways of moving and their feet left) would replace the copy; that is an optional engine addition, noted below, not required.

## Controls

### Getting in (the discovery problem)

Today the control is hidden, and the owner could not find it. So there are three ways in, all leading to the same column:

1. **A "Fly" row at the top of the Move group** (and in the Move tab of the action panel until the menu is built). It says
   "Fly..." for a creature with a Fly Speed, "Swim..." in or at water for one with a Swim Speed, and "Fly or swim..." for both.
   It is shown only to a creature that has such a speed, and greyed with the reason when it cannot be used (the table
   above). It is the main road; its words are the word a player looks for.
2. **A "Height" button on the aim bar** while Move is armed, with an up and down arrow (44 px). The bar is where the
   player already is when about to move.
3. **Page Up** on a keyboard, and a tap on the creature's own height tag.
   Tapping the creature's own token while Move is armed is *not* used for this: it already means "select".

The old Higher and Lower rows stay, as the non-visual way (see Accessibility): one press, one 5 ft step, spoken.

### Picking a block

| Device | How |
|---|---|
| Mouse | Click a block. Move over the column and the block under the pointer lights with its height and cost; the plane at that height previews, faintly, before the click. Scroll the **wheel with Alt held** (or Ctrl on a Mac, where Alt is taken) to step the pick by one block; the wheel alone still zooms |
| Keyboard | **Page Up** and **Page Down** move the pick one block (5 ft). **Home** picks the ground, **End** the highest. **R** and **F** do the same as Page Up and Page Down on a keyboard with none (a laptop). Q and E are taken by "turn the map", and W A S D by walking, so they are left alone. Enter or Space sends the marked cell; Escape closes the column. Keys go through `keys.js` as actions, so a key map can rebind them |
| Phone and tablet | A **stepper in the aim bar**: ▲ and ▼ buttons, 48 px each, with the height between them ("30 ft"). A **drag on the column** also works: press any block, slide up or down, the pick follows the finger one block at a time and the height label rises above the finger so it is not covered, a short tick (a light vibration where the device has it) at each block. A **tap on a block** picks it. The stepper is the sure way; the drag is the quick way |

On a phone the size of the blocks matters, so here is the arithmetic. The camera's lens is 0.75 rad, it sits 22 drawing
units away at a pitch of 0.95 rad (the defaults in `render-three.js`), a foot is 0.346 drawing units (`UNIT`), so a 5 ft
block is 1.73 units tall and, seen at that pitch, about 0.58 of that on screen. On a 390 x 844 phone that is roughly 45 to
50 px for a block at the default zoom (worked out, not measured: the builder measures it with the smoke test's screenshot and
writes the number in the pull request). That is near a thumb's 44 px, and falls as the player zooms out. So the drag and tap on
blocks are offered, the invisible pick area of each block is made 1.5 times as tall as it is drawn when blocks are smaller
than 44 px, and the stepper is always there as the sure way.

### Camera

The camera must show the whole column and read it as a column:

- **Pitch.** At the default tilt (0.95 rad, about 54 degrees above the table) a column reads well. The camera's range is 0.45
  to 1.45 rad. If it is steeper than 1.05 rad when the column opens (looking nearly straight down, where a block is only
  a quarter of its height on screen), it eases to 0.9 over the same 0.5 s the menu's slides use, and goes back when the column
  closes, but only if the player did not tilt it themselves meanwhile. With reduced motion it jumps.
- **Framing.** If the top block would fall under the menu or off the top edge (`R.inset` is how much the interface covers),
  the view's focus is nudged up by the missing amount, not zoomed. The column never moves the follow camera's yaw.
- **Seeing the plane.** The plane is drawn with depth test on and no depth write, behind the creatures and walls that are
  nearer the camera, so a roof hides the part of it beneath. A faint outline is drawn through the geometry, so a cell
  behind a wall is not lost. The ground reach under it is not drawn while a plane is up, so two layers do not fight.
- **Cost.** One column of up to eight blocks and one plane at a time: a few hundred triangles, built in `buildOverlay`
  from the same highlight arrays, which are rebuilt only when the pick changes.

### Reduced motion, and motion

Blocks appear all together (a 0.15 s fade) and not one at a time rising; with reduced motion, at once. The pick moves with no
tween. The plane fades in. Nothing flashes.

## Multiplayer

- **The mover's pick is private until sent.** The column, the plane, the pick and the line down are the mover's screen
  only: nothing is sent, nothing is logged, and there is nothing to leak (there is no state added, so no `twin()` test is
  needed; the builder says so in the pull request). The same holds for the DM moving a monster: the players see nothing
  until the move is sent.
- **What the others see is the move**, as every move: the token goes to its new cell and height by the renderer's own
  walk, with the engine's `moved` events. A flyer drawn up in the air gets its height tag. Nobody else sees a column.
- **Whose creature.** The control is offered for the creatures the player may move (theirs, and the DM's any). For a
  monster the DM moves, it is the same control on the DM's screen. For a hidden creature or one a player has not seen, the DM
  sees the column and the players see nothing, as with a hidden token.
- **Two people at once.** The engine's own order applies: the move is refused if it is not the creature's turn, or the
  place has been taken in the meantime. The client says what the engine says.
- **A move that provokes.** An Opportunity Attack's question comes as for any move; the column is already closed.

## Accessibility

- **Everything the picture says is also words**: the state line, the aria-live line that says "Picked 30 ft, 20 ft of
  flying left" on each change, and the cell's number on focus. Colour is never the only sign: air cells have a dashed edge,
  floors a solid one, water cells a wave pattern, the picked block a thick outline and a marker.
- **A non-visual way**: the Higher and Lower rows (5 ft, spoken), plus a "Fly to..." row that opens a list of the places
  in the plane, nearest first, each with its distance and cost ("North-east, 25 ft, at 20 ft up, costs 30 ft"). A player
  who cannot or does not want to use the picture can always send the same move by this list.
- **Focus order:** the column is one control with arrow keys and Page Up and Page Down (a listbox of heights); the plane
  is a second, in the order of distance. Escape closes and returns focus to the row that opened it.
- **Targets:** 44 px at least for every button, 48 px for the stepper; the pick areas grow as above.
- **Reduced motion and high contrast** follow the device and the theme's settings; the tints come from the theme's own
  colours, with a minimum contrast against the floor drawn behind (the builder checks it in all four themes).
- **Colour-blind players** are served by the pattern and outline above, not by hue.

## Alternatives considered

1. **A height slider and a flat plane.** A vertical slider beside the token, with a flat plane of cells moving up and
   down with it. Honest merit: one control, big, thumb-friendly, nothing to aim at. It loses to the column on two counts:
   a slider shows a number where the owner wants to see a height in the world, and it has no place to mark floors, ceilings
   and water as the column does. **It survives in the design** as the phone's stepper and drag, which is the slider's
   job done on the column itself.
2. **A number: "up 10 ft" (a field or a row of buttons: 5, 10, 20, 30).** The least drawing and the most accessible; a
   good fit for the keyboard and for the screen-reader list, and it is the Higher and Lower rows kept. It is poor for
   choosing among places, since the player cannot see what a height is near (a branch, a roof, a bridge). **It survives**
   as the non-visual way.
3. **Hold and drag vertically on the destination cell.** Press a cell on the ground and drag up to lift the target in
   height, as a map pin is lifted. The best for a single quick move and the fewest taps. It is worse on a phone, where the
   finger covers the very cell being aimed at and a drag is already what pans and turns the map (`render-three.js`: one
   finger drags the map). It also hides which heights are possible until the finger finds them. **Not used.**
4. **A side view: a flat strip beside the map showing the heights as a side slice.** Clear for tall places and caves; a
   second picture to learn, and a poor use of a phone's screen. **Not used.**

The column wins because it is the owner's picture, it shows what is possible before the player commits, and it is one
drawing that serves flying, swimming and floors alike.

## Questions for the owner

Each has the answer this spec goes on with if no answer comes.

1. **Swimming: the engine now or later?** Swimming needs an engine step (water becomes a place to be in, with a depth;
   see E1). Default: build flying first (C1 to C4), and build E1 and C5 when the owner says yes; the control is made so
   that swimming adds, and does not redo.
2. **Shade the reach by cost, on the ground too?** Today one flat tint. Default: yes, three shades by thirds of the
   feet used, on the walking reach as well as the plane, so flyers and walkers read the same. (This changes how the
   ordinary move looks; it is a small, separate stage, C3, and can be left out.)
3. **Two taps to send a flying move on a phone?** Default: yes on touch, one click on a mouse, ordinary ground moves
   unchanged at one tap.
4. **Falling warning only for a flight that ends?** Default: yes: warn only when the creature's flight has an end before its
   next turn (a spell, Dragon Wings). A natural flyer, by the SRD, does not fall.
5. **Which key for the column?** Default: Page Up and Page Down, with R and F as well. If the owner uses another game's
   map, say which keys.
6. **Climbing straight up a wall with no ledge?** Today the engine climbs only to a ledge; the owner said "fly/swim", so
   the column does not do climbing. Default: leave climbing as it is.
7. **Should the column stay open for a flyer's whole turn?** Default: no, it opens on demand and closes after each move,
   with the height tag always on the token. (Keeping it open would show many tokens' columns at once on a busy table.)
8. **Should the engine report "ways of moving and feet left" itself?** Default: no; the client works it out and a test pins
   it. The export would be small and additive if the owner prefers one source.

## Build plan

Sized for Sonnet builders: each stage is one pull request, small, with a test and a smoke pass. Files are named so the
builder opens only those. Every stage: `npm test`, `npm run content`, `npm run build`, `node --check` on `dist`, and the
smoke passes named, one at a time. Phone and desktop screenshots at 390 x 844 and 1280 x 800 in the pull request.

### Engine

- **Flying: none.** Everything flying needs is in `move` and `moveOptions` today: a height on `to`, 5 ft steps up and down,
  the 40 ft search, the budgets, the fall rule. No state field is added, so no migration and no `twin()` test.
- **Optional, small, additive (question 8):** a read-only export of the ways of moving and their feet left from
  `engine/world.js`. Not needed to start.
- **E1, swimming (only after the owner says yes to question 1).** The engine's change, behind its own spec amendment
  in `maps-and-objects.md` (decision 2, "Movement modes") and a new entry in `docs/DEBT.md`:
  - a water tile gets a depth (in feet, the bed below its surface), a field on the tile; the map format version goes up
    with a migration that gives every existing water tile a default depth (the owner's answer, or 10 ft);
  - `space.js`: water is a volume: a position between the bed and the surface is "in the water", and holds a creature up
    (no fall) the way a Fly Speed does, whatever the creature's speeds;
  - `engine/world.js`, `moveOptions`: a creature in or at water may step in the six directions and up and down 5 ft
    through it; a creature with a Swim Speed pays 5 ft a step, one without pays 10 (the SRD's extra foot a foot);
    swimming shares the turn's feet as flying and climbing do (`left(speed)`), and `MOVE_ENGINE.swim` becomes true
    in `content/reader.js`;
  - tests in `packages/rules/test/` for: entering and leaving water, the two costs, the depth limit, the Swim Speed
    shared with walking, a swimmer is not left "falling", and the old maps still load.
  - Files: `packages/rules/src/space.js`, `engine/world.js`, `content/terrain.js`, `map.js`, `migrate.js`,
    `content/reader.js`, tests; the docs. This is engine work and is named in the issue by number, as `AGENTS.md`
    requires.

### Client

- **C1: the heights, as data, and the stale `flyAlt` fixed.** A new `packages/client/heights.js` (pure, tested in Node):
  `heightsOf(S, e)` returns the reachable heights and, for each, the cells at that height with their cost, built from
  `moveOptions(previewState(S, e), e)`; `waysLeft(S, e)` the feet left by walking, flying, climbing. `app.js` stops
  keeping `flyAlt` by hand: the pick is cleared on any move, fall, landing, turn change or loss of flight. Tests:
  `packages/client/test/heights.test.js` (a flyer on the ground, in the air, under a floor, prone, not on its turn,
  with Dash used, every cell within `waysLeft`). Smoke: `paneltabs` still passes (its Higher and Lower test is kept).
- **C2: the column and the plane, mouse and keyboard.** `three-build.js` (`buildOverlay` draws the blocks and the
  plane from `hl.column` and `hl.plane`), `render-three.js` (picking of a block: the hex-column march is kept, a second
  pass tests the blocks; `setHighlights`), `app.js` (the mode `{ kind: 'fly' }`, the tap path), `keys.js` (the new actions
  and their default keys), `actionpanel.js` (the Fly row; the Higher and Lower rows kept). The state line. The line down.
  Test: `heights` picks and `keys.test.js`. Smoke: a new `fly.mjs` (open from the Fly row, pick 15 ft with Page Up, click a
  cell, assert the engine's `move` with the right `z`; land with Home; assert a Prone flyer has no column) added to the
  registry in `scripts/smoke.mjs`; and `keys` and `three` unchanged.
- **C3: shading by cost.** `three-build.js` and `render-three.js`: three tints from the theme's colours, for the plane
  and the walking reach; `themes.js` for the theme colours. Test: the tint function (pure). Smoke: `three-parity` golden
  is expected to change for the walking reach, and the pull request says so and updates it with the owner's say. Can be
  dropped if the owner answers no to question 2.
- **C4: touch, the camera and words.** The stepper in the aim bar, the drag on the column, the two-tap send, the grown pick
  areas, the haptic tick, the camera pitch and framing (`render-three.js` `tilt`, `inset`), the aria-live line, the list
  "Fly to...", the height tag on the token (`render-three.js` pawns), the falling warning (question 4). Test: the pure
  parts (the pick-area growth, the framing arithmetic, the warning). Smoke: `fly.mjs` extended to touch at 390 x 844
  (pointer events: a drag up the column, the stepper, the two taps), and `pinch` and `controls` unchanged.
- **C5: swimming (after E1).** The water part of the column and the plane: the tint and the wave pattern, the "Surface"
  block, the line down to the bed, the "Swim..." wording. Test and smoke as C4 with water. Files: `heights.js`,
  `three-build.js`, `actionpanel.js`.

Order: C1, C2, C3 (optional), C4; E1 and C5 whenever the owner says. C2 is the stage that answers the owner's
sentence, and is worth shipping on its own with C1.

### Not in this spec

- AI choice of altitude (a monster that hovers out of reach). A rules and AI design of its own.
- Burrowing (a Burrow Speed is read by nothing either; the same shape of column, downward, could serve it later).
- Straight-up climbing with no ledge, and jumping.
- A shared "ruler" in three axes; the maps spec's `vertical` table rule already counts distance.

## Build notes (C1 to C4, #716)

What was settled while building, where the text above left room or the code turned out otherwise.

- **Where it lives.** `packages/client/heights.js` is the pure part (the heights, the feet left, the pick, the highlights, the words, the
  pick-area growth, the framing arithmetic, the warning); `three-build.js` draws the column and the plane in `buildOverlay` from
  `hl.column` and `hl.plane`; `render-three.js` picks them (`#pickFly`) and draws the height numbers and the height tag; `app.js` holds the
  mode `{ kind: 'fly' }`. The app still reaches the renderer only through the interface of `renderer.js`: the column goes in through
  `setHighlights`, a tap comes back through `onTap` (the hit carries `block`, or `plane`, and the `pointer` type), a hover through `onHover`, a drag
  through `onDrag`, and the height tag's tap is a page event (`hextable-height-tag`), as the arena flash is.
- **A height is a height on the map, not above each cell.** A block is 5 ft of the map's own height, counted from the creature's position, and the
  plane is flat: every place of it has the same `z`. (The old rows counted "feet above the floor under each cell", which is the same on flat ground
  and a bumpy carpet elsewhere.) The number on a block is feet above the floor under the creature.
- **The ground block** is every floor the creature can stop on, at whatever height (the walking reach, ledges and roofs included), so one block lands
  it anywhere. A floor at a block's own height (a roof at 10 ft) is also in that block's plane, drawn solid, and the block carries the ledge sign.
- **The pick** is `{ id, z, stamp }`; the stamp is the creature's place and the fight's round and turn, so a move, a fall, a landing, a turn change
  and the loss of flight all drop it with no bookkeeping (`livePick`). The column closes on the same stamp.
- **Higher and Lower** now step to the next height the engine has a place at (one block), and are greyed with "Nowhere higher in reach" at the end of
  the column, instead of counting 5 ft up for ever.
- **Three ways in, as built:** the "Fly…" row (first in Move in a fight; among Explore's first tiles out of one, where there is no Move group), a
  "Fly" button at the right edge of the map for a creature with a Fly Speed (the aim bar does not exist while nothing is armed, so the button cannot
  sit on it), and Page Up (or R) and a tap on the creature's height tag. "Fly to…" opens the same column with the list of places focused.
- **Keys.** `heightUp`, `heightDown`, `heightGround`, `heightTop` are actions of `keys.js` in every preset (Page Up and R, Page Down and F, Home,
  End). They act only for a creature that has a Fly Speed; for anyone else the keys stay the browser's. Enter and Space send the marked place while the
  column is open. Alt or Ctrl with the wheel steps the pick (a listener on the canvas ahead of the renderer's keeps it from zooming).
- **Shading (C3).** `themes.js` makes three tints of each theme's own move colour (`costTints`: paler and thinner, the colour itself, deeper and more
  solid); a theme may give its own as `hl.cost`. There are three themes, not four. The thirds are of the feet the way has left: flying for a place in
  the air, the most of the ways for a floor. `three-parity`'s golden did not change (it records places and picks, not colours) and was not recorded again.
- **A block on a phone, measured:** at 390 x 844, the default zoom (the camera is 30 away on a narrow screen, not 22) and a tilt of 0.9, a block is
  39 px tall at the ground and 58 px at 20 ft (nearer the camera). So the lowest blocks are under a thumb's 44 px and get the grown pick area
  (1.5 times as tall, the nearer middle winning where two overlap); the stepper is always there.
- **Two taps** are for a place in the air on touch (and pen). A tap on the ground block's places, and any mouse click, sends at once.
- **The falling warning** reads the lasting effects in the state (`effects[].until` and a part's `ends`, with a `speed.fly` modifier on the creature):
  the fields exist. It names the feet of the fall and quotes the rule; it does not work out dice (DEBT T105 (1)).
- **The camera.** A view steeper than 1.05 rad goes to 0.9 over 0.5 s (at once with reduced motion or at pace `instant`) and back when the column
  closes, unless the view was turned or tilted meanwhile. The view also goes to the creature when the column opens. Framing slides the picture down
  through `inset` (2 px of inset is 1 px of picture) until the top block is under the aim bar or the creature's cell would go under the menu's strip.
- **Multiplayer.** No state was added and nothing is sent but the ordinary `move`, so there is no `twin()` test.
- **Not built, with reasons:** DEBT T105.

## Build notes (E1, #836)

What was settled while building the swimming engine (the owner said yes to question 1 on 26 November 2026).

- **Depth.** A water tile has `depth`, in feet from its surface to the bed: a multiple of 5 from 5 to 200 (`WATER_DEPTH` in `content/terrain.js`). The map format is 3
  (`map.js`); `migrateMap` gives every water tile of a format 1 or 2 map 10 feet, without writing to the document it is given. The linter wants a depth on every water
  tile (and on no other). A save needs no new state version: `migrate.js` already runs `migrateMap` on the table's map and on each parked place's on every load. A water
  tile with no depth (a hand-built map in a test; the linter refuses it) is read as before swimming: a surface, and no one enters it. A `mapEdit` that paints water with no
  depth gives it 10 feet (the editor's Depth field is a client follow-up, DEBT T109).
- **In the water** (`space.js`). `waterAt(map, pos)` is the water volume a position is in: over a water tile with a depth, at or below its surface and at or above its bed. The
  nearest surface at or above the position decides, so a floor of another level between it and the water is not water. `submerged(s, e)` is true below the surface (false at
  it; E2 reads it for breath), `inWater(s, e)` at or below it. `ground()` returns the water's own record for a position in the water below its surface, so the water holds a
  creature up whatever its speeds (`gravity` and `drop` look at `ground` first); `under()` returns it too, so a creature under the water is in the water's level: its region
  (and what players are sent of it), its light.
- **Falling into water** stops at the surface, as it always did (the surface is a surface); the fall's damage is the engine's as before (DEBT T109 (3)).
- **Moving** (`engine/world.js`, `moveOptions`). From the shore it steps onto the water's surface (a rise or drop up to 5 feet), as from any water position it steps in the grid's
  directions level, up or down 5 feet, or straight up or down, between the bed and the surface (the same shape as the flying steps). It leaves the water onto a shore from the
  surface by a walking step; from under the surface there is no walking out (it swims up first). Cost: with a Swim Speed 5 feet a step from that Speed; without it, 10 feet a
  step from the walking Speed (a creature with both may use either, whichever gets it further); one more foot where the space is Difficult Terrain (a hostile creature that can be
  passed, ground a spell made difficult): 15 without a Swim Speed, 10 with one (Freedom of Movement takes that away). The turn's feet are shared as for flying and climbing
  (`limit.swim`, `left(speed)`); a Dash doubles them. Not where only the ground is used (a formation's places, a creature that drags another) and not for a creature standing
  on water by Water Walk, which keeps to the surface. A Speed 0 creature goes nowhere; one with only a Swim Speed moves through water and nowhere else. A big creature goes
  where its whole footprint is in water. The monster brain swims by the same costs but does not choose to end a turn under the water with no Swim Speed.
- **Squares.** A diagonal step in the water is open to a swimmer past a corner of water (`cornerFree`'s `swim`); the true length (5 x root 2) doubled is the cost, as on land.
- **Water Walk** works as before; when it ends on a creature standing on water, the creature is in the water at the surface and swims (the spell's text says so).
- **Acrobatic Movement** is as before (it crosses water and may not stop in it); it does not swim in from the shore (DEBT T109 (5)).
- **A hidden creature under the water** is sent to no player: `under()` gives a submerged creature its level, so a creature under the water in a region the party has not seen is
  concealed as on land. A party mover that names a column of water without a height chooses its place among those the party knows (`move`), so a creature the party does not
  know of, in the nearest place, does not send the mover to another place of the column. Twin tests: `packages/server/test/twin-worlds.test.js`.
- **Reader.** `MOVE_ENGINE.swim` is true: a swim speed is no longer handed to the DM, and a monster's reading says how it swims; the goldens moved.
- **Not built, with reasons:** DEBT T109.

## Build notes (E2, #840)

What was settled while building what being under water does (the owner said yes to swimming on 26 November 2026; Water Breathing is the druid Ventus's, #786). Every number is
from the SRD: "Suffocation" (Hazards), "Underwater Combat", "Swimming", the spell Water Breathing, and the monster traits Amphibious, Water Breathing and Hold Breath.

- **Under water** is `submerged(s, e)` (E1): below the surface, not at it. A creature swimming at the surface is not under water, for breath, for weapons or for Fire.
- **Holding breath** (`engine/rolls.js` `breathe`, `modifiers.js` `breathOf`). A creature under the surface that needs air holds its breath for 1 + its Constitution modifier
  minutes, 30 seconds at least (a `hold-breath` trait: 1 hour). Its record is `breath: { held, gave, out?, told? }` (seconds held, Exhaustion levels suffocation gave it, said to
  be out of breath, the DM told); it is optional, so there is no new state version and no migration. The time is the game clock's: in a fight a round is 0.1 of a minute and the
  clock moves a round at the start of each round (as it always did), outside one it is whatever `advanceTime`, a rest or travel moves it. `durations.js` `tick` counts it for every
  creature under the surface, from `state.breathAt` (the clock at the last look: optional too, and written only once someone has been under water, so a table that never swims keeps the state it had; a game with
  none works the first advance out from the `time` or `rest` event it just made, and from nothing else), and every turn boundary of a creature looks at it with 0 seconds, which is where surfacing is noticed.
- **Running out.** In a fight the rounds are counted as they complete, and the round whose turn is ending counts too: a creature with three minutes holds its breath for rounds 1 to 30,
  and gains 1 Exhaustion level at the end of each of its turns from round 31 on. Outside a fight a turn is a round: one
  level for each full 6 seconds past the limit. The sixth level is death (Exhaustion, SRD "Rules Glossary"): `kill` runs, so Death Ward holds against it as against any other kill
  that deals no damage. A creature immune to Exhaustion (`conditionImmune`) gains none.
- **Breathing again** (it is at or above the surface, or breathes water): the levels suffocation gave it come off (`breath.gave`, kept apart from Exhaustion that came from elsewhere:
  no more than it has) and the count starts again. A level a long rest took off meanwhile is not taken twice.
- **Who needs no air** (`breathOf`): a lasting `{ on: 'breath', op: 'immune' }` modifier (Water Breathing), or a trait of its stat block, or of the form it has taken (Wild Shape lays
  the beast's traits over the druid), with the id `amphibious` or `water-breathing`, breathes water as well as whatever it breathes otherwise. A character, and a creature of a kind
  that lives by breathing (beast, humanoid, dragon, monstrosity, giant, fey), is judged to need air. The SRD says nothing of whether an Aberration, a Celestial, a Construct, an
  Elemental, a Fiend, an Ooze, a Plant or an Undead breathes, and a creature with no stat block of its own says nothing at all: the engine does not guess; the DM is told once (a
  `manual` that is `partial`: for the DM alone, once for the creature and never again), the creature is not counted, and the DM applies Exhaustion by hand. A form never changes the
  creature's kind (SRD, Wild Shape). A creature that breathes only water (a fish, Water Breathing trait) and is out of the water suffocates in the SRD's hour; that half is not built.
- **Underwater combat** (`rollMode` in `engine/rolls.js`, `damage` in `engine/resolve.js`). A weapon attack roll is judged by where the attacker or its target is, under the surface.
  Melee (the SRD: "a creature that lacks a Swim Speed ... underwater"): the attacker is under the surface, has no Swim Speed, and the weapon deals no Piercing damage: Disadvantage
  (reason "weapon underwater"). Ranged: **either end** under the surface (the arrow passes through water however it is shot): beyond the weapon's normal range the attack
  **automatically misses** (the die is still rolled, and never hits, a natural 20 included; reason "beyond normal range underwater"), within it Disadvantage. A spell attack and an
  Unarmed Strike are not weapon attacks; a creature's own attack counts as a weapon attack (its stat block calls it one), by the damage types its steps deal, and one that names no type is
  left as it is. A ranged attack at point blank keeps its other Disadvantage; they do not add. **Fire**: damage of the Fire type to a creature under the surface is halved, as any
  Resistance is (once, with any other Resistance: it does not stack; Overchannel's damage that ignores Resistance still does).
- **Water Breathing** is `auto`: `[{ modifier: { on: 'breath', op: 'immune' } }]` for 24 hours on up to ten willing creatures, ritual too. The hook is `breath`, a modifier step
  only (`schema.js`, `reader.js`); it adds water to what the creature breathes, so "also retain normal respiration" is the rule itself. Water Walk is as it was.
- **The brain** (`ai.js`). A creature that needs air and has two rounds of it or less left comes up first, before it does anything else: it moves to the cheapest place it can reach that
  is not under the surface, or as far up as it can get, and it does not choose to end a turn under the surface while it is down to those two rounds (a creature with a Swim Speed may
  otherwise stay under, as it could before). It reads the true state and rolls nothing. It does not dive on purpose, drown a foe, or hold a foe under.
- **Players are sent** a party creature's `breath` (`view-fields.js`: sent) and the notes "is out of breath" and "can breathe again" for it, and its Exhaustion as any condition of its own. Of a
  creature that is not the party's, nothing: the events name it (`id`, `actor`) and `view.js` drops them; the notes are not even made for it; the DM is told by a `partial` `manual`. Twin
  tests: `packages/server/test/twin-worlds.test.js` (a hidden creature running out of breath, gaining Exhaustion, and surfacing, by time and by the rounds of a fight).
- **Not built, with reasons:** DEBT T110.

## Build notes (E3, #849)

What was settled while building water that rises and falls (the Cliff Keep's sea cave; Control Water's Flood and Part Water use the same mechanism in E4).

- **A water level is a change of tiles** (`tides.js`, pure). `setSurface(map, levelId, cells, surface, opts)` returns `{ tiles }` or `{ problem }`. A cell's floor is the top of its
  *dry* tile (the tile as it was before any water change, kept on the tile as `dry`, a copy, the first time; a tile that has one keeps its first), or its bed if that was water
  (`z - depth`). Surface above the floor: `{ t: 'water', h: surface - level.z, depth: surface - floor, dry }` (depth must be one `WATER_DEPTH` allows; the deepest is 200, and a
  floor that is not a multiple of 5 refuses). Surface at or below it: the dry tile again with no `dry`, except a dry tile that was water, which becomes its bed
  `{ t: opts.bed ?? 'stone', h: bed - level.z, dry }` (the Sluice Gallery drained). The linter accepts `dry` on any tile and checks it as a tile (a `dry` inside a `dry` is refused).
  **No state version and no migration:** `dry` and `state.tides` are optional, an old save has neither, and a game that never changes water has the state it had.
- **Never in place.** `waterChange` copies the level's tiles and puts a new `map` in whole (as `mapEdit` does), so the restore copy that holds the terrain by reference stays sound.
  `water` is not in `TERRAIN_ACTIONS` (`engine.js` was not the issue's to change); `apply-terrain.test.js` lists it as copy-on-write: DEBT T111 (1).
- **The action** `water` (DM only; `engine/dm.js`): `{ level, cells | region, surface | by, bed?, rise?: { by, to } }` or `{ tide, stop: true }`. `by` is relative to each cell's
  current top (its surface where it is water, its floor where it is dry). `surface` with `rise` is where the tide starts; with `rise` alone it starts at the highest water on its cells,
  or at their lowest floor if they have none. `by` with `rise` is refused. Everything is checked before anything changes; a change that changes no cell is refused ("already there").
- **A tide** is `state.tides: [{ id, map, level, cells, by, to, at, bed? }]` (ids T1, T2...; at most 16): `at` is where its water stands, `map` the map it was set on. At the start of
  each round of a fight (`engine/resolve.js`, after `newRound`) each tide moves `by` feet, not past `to`, and is removed when it gets there. Outside a fight nothing moves (DEBT T111 (2)).
  A tide whose map is not the one in play waits, and `loadMap` without a node drops them. One that cannot go on (the water would be deeper than 200) stops, and the DM's `water`
  event says why. The Cliff Keep shape (a causeway at 0, ledges at -5, a dais at +5, an inlet with its bed at -10, `rise: { by: 5, to: 5 }`): round 2 the inlet has water (-5, the
  ledges at its edge), round 3 the ledges are under, round 4 the causeway is under and the tide ends; the dais stays dry (`tides.test.js`).
- **Who is carried** (`tides.js` `carry`). Rising: a creature standing on a covered cell is lifted to the new surface; **a creature swimming at the old surface rises with it** (the issue did
  not say; it is the same as the falling case); one under the old surface stays where it is, deeper. Falling: a creature at or under the old surface and now above the new one is at the new
  surface (or the floor), with no fall damage. A creature that flies above the surface stays where it is. A big creature is judged by its whole footprint and goes to the highest new surface under it,
  **only if its anchor cell is then held up** (the gravity pass would drop it from anywhere else, with a fall): otherwise it stays where it is (DEBT T111 (3)). A rider goes with its mount. Piles
  and objects stay on the floor. Events: a `water` event (the DM's alone: the table's players are not told of it) and a `moved` event with `water: true` for each creature carried,
  which `view.js` treats as any other `moved`: never sent for a creature a player may not know of.
- **Players are sent** the tiles as any map edit sends them, **without `dry`** (`view.js` strips it: it is the DM's record of what the ground was, and a drained cell's `dry` would say how deep
  water used to be, in a place that may be unseen when it was). Never `state.tides`: a player's view is an allow list and has no such field. Twin test (`twin-worlds.test.js`, "tides:"): a hidden
  creature lifted by a tide and a tide in a region the party has not seen; it fails if the lift event names the creature, and passes as built.
- **Not built, with reasons:** DEBT T111.

## Build notes (E4, #853)

What was settled while building Control Water's Flood and Part Water on the water of E3 (`control-water` in `spells-4.js` is `assist`, `checked: true`: every number compared with `reference/srd52/srd52-flow.txt`, "Control Water": level 4, Action, 300 feet, V S M, Concentration up to 10 minutes, a Cube up to 100 feet, a rise of up to 20 feet, the wave 20 feet tall and 25 percent to capsize, the whirlpool 5, 50 and 25 feet, 25 feet of pull, 10 feet pulled, 2d8 Bludgeoning, a Strength save).

- **The step.** `{ water: { mode: 'flood', by?: 5..20, size } }` or `{ water: { mode: 'part', size } }` (`schema.js` `STEPS`, `reader.js`, `HOMEBREW_RANGES` `water.by` 5 to 20 and `water.size` 5 to 200). `size` is the cube's side, the spell's own: the engine runs a step knowing only the cast, not
  the spell's area (`effects.js` may not import the content index: a new import cycle), so the step carries it and the linter holds it equal to `target.area.size` (a `water` step needs a cube target and a range). `by` defaults to 20. It is a step for a spell that lasts.
- **The choice.** `choice: { of: 'water' }` with `WATERS = flood, part, redirect, whirlpool` (`CHOICES.water`), and `ifChoice` on the steps. `casting.js` `chooseIn` strips the steps of the other choices for a curse, an affliction, a shape and a resize,
   `effects.js` `exec` reads the choice from the cast event (`ev`, `choice`) and leaves out a step whose `ifChoice` does not list it. One line of `chooseIn` would let the cast strip them as it does for the others (DEBT T112 (1)).
- **Once for the cast.** An area spell runs its steps for each creature in the area, and for none if nobody is there. `begin` (`effects.js`) puts a frame of its own on the stack, run first, for a spell with a `water` step: it runs the `water` and `manual` steps once whether or not a creature stands in the
  area (the `told` marks are shared with the creatures' frames, so a note is said once); a creature's frame leaves a `water` step alone. The cube's cells are those the `cast` event names (`hexes`, laid out and clipped to the map by `casting.js`, Globe of Invulnerability's included); its base is the aimed point's height (`src.origin`).
- **What is in the cube.** A cell on any level whose tile holds standing water (a water tile with a depth: the engine has no flowing water) any of which lies in the cube's height: its surface is at or above the cube's base, and its bed at or below its top. Water that the cube only reaches into counts; a cell wholly above or below does not.
  Flood adds `by` to each such cell's surface (`setSurface`, so `dry` is kept and a creature at the surface rises with it, as `carry` does for a tide); a cell that would be deeper than 200 feet, or whose bed is off the 5-foot steps, is left and the DM is told (a `partial` `manual`). Part Water sets the surface at the cell's bed: the bed tile as a drained cell has it (stone), the creatures come down to it.
- **It lasts with the spell.** Each level changed is a part of the lasting effect (`{ target: caster, water: { mode, map, level, cells: { key: { was, now } } } }`, whole tiles, `durations.js` `endPart`). When the effect ends for any reason (Concentration, ten minutes, the DM's `endEffect`), `tides.js` `endWater` undoes it:
  a cell whose tile is still `now` goes back **exactly** to `was` (the lake tile with no `dry` kept). **The rule chosen for a cell something else has changed since** (a tide, the DM's `water`, a second Control Water): a flooded cell that still holds water comes down by what this spell raised it, **never below its floor and keeping what the other change did** (flood +20, the DM takes 5 off, the spell ends: 15 less 20 is 5 feet under where it began);
  a cell the water has left, or a trench that has been filled or changed, is not touched. The map in play is not the one it was made on: the water is left and the DM is told.
- **When.** The SRD says only the trench "slowly fills in ... over the course of the next round". A trench that ends in a fight is recorded in `state.refills` (`{ map, level, fx, name, source, cells }`, an optional field: no migration) and fills at the start of the next round (`stepTides`, which `resolve.js` already calls each round); outside a fight, at once.
  **A flood comes down at once**: the SRD says nothing of a delay, and the creatures at its surface come down with it. A trench still waiting when the fight ends fills then (`endEncounter` calls `refill`); a map cannot change in a fight, so none outlives it. `water` parts are never sent to players (`view.js` `viewEffects`).
- **Players are sent** the tiles as any water change sends them, without `dry`; never the effect's parts, `refills`, the `water` events (the DM's), or the carried creature's `moved` for a creature they may not know of. An area spell reveals the creatures it catches (`casting.js`'s own rule, Fireball's too), so the twin tests put a hidden creature in the water after the cast, and ending the spell carries it.
  Twin tests (`twin-worlds.test.js`, "control water:"): a Flood, and a Part Water, cast by a DM-hidden caster, then a hidden creature at the surface or on the bed, then the spell ends; each fails when a note of the end is let through.
- **Not built, with reasons:** DEBT T112. Redirect Flow and Whirlpool, the wave in a large body of water and a later-turn change of effect are `manual` steps for the DM.
