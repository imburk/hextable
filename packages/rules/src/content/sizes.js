// Creature sizes: how many hexes a creature fills and how tall it stands, in feet.
// Engine data, not rules content. A footprint is anchored on one hex; `shape` names the pattern.
//   1:  the hex itself
//   3:  the hex and two neighbours that touch each other (a triangle)
//   7:  the hex and all six neighbours
//   12: the triangle and every hex around it
export const SIZES = {
  tiny: { hexes: 1, height: 5, shares: 4 },      // up to four Tiny creatures can share a hex
  small: { hexes: 1, height: 5 },
  medium: { hexes: 1, height: 5 },
  large: { hexes: 3, height: 10 },
  huge: { hexes: 7, height: 15 },
  gargantuan: { hexes: 12, height: 20 },
};
