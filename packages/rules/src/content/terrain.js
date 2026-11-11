// Terrain types and what it costs to enter one, in multiples of normal movement.
// Engine data, not rules content: maps refer to these by name.
export const TILES = {
  grass: { cost: 1 },
  forest: { cost: 2 },          // Difficult Terrain
  stone: { cost: 1 },
  water: { cost: Infinity },
  rock: { cost: Infinity },
};
