// The stock maps: ready-made places for the DM to start on, five on hexes (`STOCK_MAPS`) and one on squares
// (`SQUARE_STOCK_MAPS`); `ALL_STOCK_MAPS` is the list the lobby and the DM panel offer. Each file beside this one is a
// plain map document (docs/specs/maps-and-objects.md) with no monsters on it. They are written by
// scripts/gen-maps.mjs; docs/maps.md says how to add one.
import tavern from './tavern.js';
import dungeon from './dungeon.js';
import cave from './cave.js';
import forestRoad from './forest-road.js';
import keep from './keep.js';
import undercroft from './undercroft.js';

export const STOCK_MAPS = [
  { id: 'tavern', name: 'The Copper Kettle (tavern)', text: 'A common room with a bar, a kitchen, and a cellar below. A locked pantry and wine store, and a secret door in the cellar.', map: tavern },
  { id: 'dungeon', name: 'The Sunken Vault (dungeon)', text: 'Eight rooms joined by passages: a locked storeroom, a portcullis, a locked crypt and a secret vault. Mostly dim.', map: dungeon },
  { id: 'cave', name: 'Hollow Deep (cave)', text: 'A cave mouth, a one-hex passage, a cavern with a pool, a slope up to a ledge, and a crawlway to a grotto. Dark inside.', map: cave },
  { id: 'forest-road', name: 'The Old Road (forest ambush)', text: 'A road through the woods with clearings on both sides, boulders, a stream with a bridge, and a cart across the bend.', map: forestRoad },
  { id: 'keep', name: 'Greywatch (small keep)', text: 'A gatehouse and courtyard around a keep of two floors joined by a stair, with a balcony over the yard.', map: keep },
];

export const SQUARE_STOCK_MAPS = [
  { id: 'undercroft', name: 'Thornwick Undercroft (squares)', text: 'A map on squares: seven rooms joined by corridors 5 and 10 feet wide, with a portcullis, a locked vault door and a secret panel. Dim, with a dark shrine and vault.', map: undercroft },
];

// The five, then the one on squares. (A map says which grid it is on: `map.grid`.)
export const ALL_STOCK_MAPS = [...STOCK_MAPS, ...SQUARE_STOCK_MAPS];
