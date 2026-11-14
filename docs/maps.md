# Stock maps

Five ready-made places the DM can start on. Each is a plain map document
([spec](specs/maps-and-objects.md)) with rooms to reveal, doors, light and a start for a
party of five. No monsters are placed: they are blank stages. The layouts are our own.

To use one, three places offer the same list:

- **The lobby**: "Starting map" above Host a table. The table (or the solo game) starts on the valley as before, then
  loads the chosen map as its first act.
- **The DM panel**: Map > "Start on a stock map". The first tap on **Start on this map** only asks (it names the map and says
  the party moves and creatures here stay behind); the second tap, within five seconds, loads it. Changing the choice cancels
  the question. It is off during a fight.
- **The map editor**: Map file > Stock map, two taps as well.

All three send the `loadMap` action: the party is set down on the starts in order (anyone beyond them beside the first),
creatures of the old place stay behind, and it works in solo and at a table. It cannot be done in the middle of a fight.

| Id | Map | Size | What is in it |
|---|---|---|---|
| `tavern` | The Copper Kettle | 2 levels | Common room with a bar (a rail with a flap), kitchen with a serving hatch, a locked pantry, a back hall, stairs down to a cellar with a locked wine store and a secret door to a smugglers' cache. Windows along the outer wall of the common room. |
| `dungeon` | The Sunken Vault | 1 level | Eight rooms and their passages: entry hall, locked storeroom, a hexagonal great hall (diagonal walls), armory, barracks behind a portcullis, a shrine, a locked crypt (iron door) and a vault behind a secret door. Dim, with dark crypt and vault. |
| `cave` | Hollow Deep | 1 level | A bright cave mouth, a one-hex passage, a cavern with a pool and stalagmites, a slope of 2.5 ft steps up to a 10 ft ledge (a climb anywhere else), and a crawlway to a grotto. No walls: the rock hexes are the walls. Dark inside. |
| `forest-road` | The Old Road | 1 level | A road through the woods, a clearing on each side of the bend, boulders for cover, an overturned cart, a stream with banks and a stone bridge. Forest hexes are Difficult Terrain. |
| `keep` | Greywatch | 2 levels | An approach, a gatehouse (portcullis and door), a courtyard with a well and a stable, and a keep of hall, kitchen, locked larder and guard room. A stair in the hall climbs to a stair head, the lord's chamber, a study and a balcony over the yard (railed). |

Every map is 20 to 40 hexes across, so it plays on a phone. `packages/rules/test/stock-maps.test.js`
lints each one, checks the starts can be stood on, that every room can be reached from the start
once the doors are open (locked, secret and portcullis included), and that the engine loads it.

## Where they live

`packages/rules/src/content/maps/`: one `.js` file per map holding `export default { ...map document }`
(data only, no functions), and `index.js`, which lists them for the editor as `STOCK_MAPS`
(`{ id, name, text, map }`). They sit beside the other content so the build copies them to
`dist/shared/content/maps/` with the rules, and the editor imports them from `./shared/...`.
They are `.js` rather than `.json` because the browser cannot import JSON without import attributes.

## How to add one

1. Write the layout in `scripts/gen-maps.mjs`, following the others: `new Builder(id, name)`, a
   `level` for each floor, `region` for each room, and paint with `rect`, `disc`, `line` or `hex`
   (columns and rows; odd rows sit half a hex right). Walls are worked out where a `walled` hex
   meets nothing or another room. Use `door(roomA, roomB)` for a door where two rooms meet,
   `arch` for an opening, `edges(a, b, 'rail' | 'window')` for other wall kinds, `stairs` for a
   run of 2.5 ft steps, `thing` for objects and `start` for the party.
2. `node scripts/gen-maps.mjs --ascii` writes the files and prints each level, one letter per room.
   The script lints every map and stops on a problem.
3. Add the import and an entry to `packages/rules/src/content/maps/index.js` and the id to
   `KINDS` in the test.
4. `npm test`, then look at it in the browser (the editor shows walls and doors) at both sizes.

A map made some other way (the editor's Export, or a file from another tool) can be added the same
way: put its document in `export default` in a new file and list it in `index.js`.

# Maps on squares: drawing and tracing

A map is drawn on one grid, squares or hexes, and keeps it. The five stock maps above are on hexes. Battle maps
drawn on 5-ft squares (most of the ones published) are played on squares, and the editor works on them the same
way it works on hexes.

## Starting a square map

Map editor > **Map file** > **New square map** (tap twice: the first tap only asks). **New hex map** sits beside it.
You pick the grid each time; squares come first. A new square map is a 7 by 7 block of stone with the party
at its middle. The editor says which grid the map is on, under its title ("Grid: squares"), and there is no
button that changes it: to change grid, start a new map. Loading a stock map or a file brings its own grid.

## Painting, walls, doors and stairs

- **Paint, Erase, Rooms** work on squares. The brush is **1 square** or **3 by 3**. Drag to paint a stroke.
- **Walls** (the tool of that name): tap two neighbouring squares to wall the side between them; again to take it away.
  **Wall around this level** and a room's **Wall it in** wall every outside side.
- **Doors & things**: tap two neighbouring squares to put a door on the side between them (it stands on that side; again
  removes it). Only the sides count: tapping two squares that touch at a corner does nothing.
- **Height > Stairs**: tap the square at the bottom, then the square at the top, in a straight line along a row, a column or a
  diagonal. The squares between take even steps (a diagonal step is longer, about 7 ft, as it is to walk).

## Putting a picture under the map and tracing it

1. **Levels** > **Set background** and pick the picture (a screenshot or download of a battle map).
2. **Align to grid** (square maps use this in place of Set scale). The picture is first laid down at 70 pixels to a
   square, which is hardly ever right. Tap one corner of a square on the picture, where two of its lines cross; then tap
   another corner **as far from it as you can** (the far end of the drawn grid is best: a small slip in a tap matters
   less over twenty squares than over two). Type how many squares apart they are, across and down (a corner two squares
   right and one down is 2 and 1), then **Apply**. The editor sets the picture's size from that and puts the picture's
   corner you tapped on the nearest corner of the editor's squares. It then reads the picture's own lines and fits the squares to
   them exactly (the message tells you the pixels a square came out as). If the lines are too faint to read it says so and
   keeps the two-corner result: finish with the **Nudge** arrows (down to 0.05 ft) until the editor's squares sit on the picture's.
   - If the maker tells you the picture's scale (for example 140 pixels to a square), type it under **Pixels a square** and
     tap **Use**: the picture's size is exact, and the editor looks for the lines to place it.
   - **Find the lines** runs just that reading, at the picture's current scale, after you have nudged or aligned roughly.
   - A margin round the drawn grid does not matter: you tap corners of the drawn squares, not the picture's edge.
3. **Trace** > **Fill floor**: lays stone on every square that lies wholly on the picture (the margin stays bare, and anything
   already painted is kept). It is one edit; **Undo** takes it back.
4. **Trace** > **Wall**: tap along each wall of the picture. With **Snap to the grid** (the default on squares) a tap goes to the nearest
   square corner, or onto the nearest side line (and along it to a corner or the middle of a side), and to the end of a wall
   already there so corners meet. Tap the last point again or **Done** to end a line; tap the first point to close a room.
   Pick the wall kind (wall, window, rail, curtain) first.
5. **Trace** > **Door**: tap the two ends of the door, from corner to corner of one square side. A door that is exactly one side
   becomes a door **on that side**, like one placed with Doors & things; any other line stays a line. Leave a gap in the
   walls for it.
6. **Trace** > **Edit**: tap a wall or door to pick it, then **Delete**, or drag a red end to move it.
7. **Done**, then play. Everything the editor does is an ordinary map edit checked by the game; **Undo** works throughout.

What it cannot do yet is in `docs/DEBT.md` (T24): the Universal VTT import still makes hexes, and using a door on a square
map is blocked by an engine bug (the DM can still open it from the DM panel).
