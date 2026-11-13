# Stock maps

Five ready-made places the DM can start on. Each is a plain map document
([spec](specs/maps-and-objects.md)) with rooms to reveal, doors, light and a start for a
party of five. No monsters are placed: they are blank stages. The layouts are our own.

To use one: open the map editor (DM > Edit map), pick **Map file**, choose a map under
"Stock map" and tap **Start on this map** twice (the second tap confirms). It is the same
`loadMap` action as importing a file: the party is set down on the starts in order (anyone beyond them beside the first), creatures of the old
place stay behind, and it works in solo and at a table. It cannot be done in the middle of a fight.

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
