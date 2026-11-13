// The stock maps: five ready-made places for the DM to start on. Each file beside this one is a
// plain map document (docs/specs/maps-and-objects.md) with no monsters on it. They are written by
// scripts/gen-maps.mjs; docs/maps.md says how to add one.
import tavern from './tavern.js';
import dungeon from './dungeon.js';
import cave from './cave.js';
import forestRoad from './forest-road.js';
import keep from './keep.js';

export const STOCK_MAPS = [
  { id: 'tavern', name: 'The Copper Kettle (tavern)', text: 'A common room with a bar, a kitchen, and a cellar below. A locked pantry and wine store, and a secret door in the cellar.', map: tavern },
  { id: 'dungeon', name: 'The Sunken Vault (dungeon)', text: 'Eight rooms joined by passages: a locked storeroom, a portcullis, a locked crypt and a secret vault. Mostly dim.', map: dungeon },
  { id: 'cave', name: 'Hollow Deep (cave)', text: 'A cave mouth, a one-hex passage, a cavern with a pool, a slope up to a ledge, and a crawlway to a grotto. Dark inside.', map: cave },
  { id: 'forest-road', name: 'The Old Road (forest ambush)', text: 'A road through the woods with clearings on both sides, boulders, a stream with a bridge, and a cart across the bend.', map: forestRoad },
  { id: 'keep', name: 'Greywatch (small keep)', text: 'A gatehouse and courtyard around a keep of two floors joined by a stair, with a balcony over the yard.', map: keep },
];
