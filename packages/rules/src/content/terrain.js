// Terrain types and what it costs to enter one, in multiples of normal movement.
// Engine data, not rules content: maps refer to these by name.
export const TILES = {
  grass: { cost: 1 },
  forest: { cost: 2 },          // Difficult Terrain
  stone: { cost: 1 },
  water: { cost: Infinity, swim: true },     // not ground to walk on; a place to swim in when the tile has a depth (WATER_DEPTH, space.js `waterAt`)
  rock: { cost: Infinity },
};

// Water is a volume (docs/specs/fly-swim-control.md, stage E1): a water tile's `depth` is the feet from its surface down to the bed,
// a multiple of 5 from 5 to 200. Maps before format 3 had none, and migrateMap gives each water tile the default.
export const WATER_DEPTH = { min: 5, max: 200, step: 5, default: 10 };
export const depthOk = (d) => Number.isInteger(d) && d >= WATER_DEPTH.min && d <= WATER_DEPTH.max && d % WATER_DEPTH.step === 0;
