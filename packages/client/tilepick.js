// Which tile of a level a ray meets first (#738). The map editor's tile tools used to take the cell where the pointer meets the level's base plane,
// so a raised tile seen at an angle gave the tile behind it. This marches the ray down through the hex columns and returns the first tile whose
// drawn top (or side) it is inside; where it meets no tile it falls back to the base plane, so painting empty ground still works.
// Pure: `topOf(tile)` is the drawn height of a tile top (three-build's surfY at the tile's z), `planeAt` the drawn height of the level's base plane.
export function tileAlongRay({ eye, dir, level, G, topOf, planeAt, step = 0.08, far = 140 }) {
  const tiles = level.tiles ?? {}, tops = Object.values(tiles).map(topOf);
  const floor = Math.min(planeAt, ...tops) - 0.5;
  let fallback = null;
  for (let t = 0; t < far; t += step) {
    const x = eye[0] + dir[0] * t, y = eye[1] + dir[1] * t, z = eye[2] + dir[2] * t;
    if (y < floor) break;
    const h = G.fromWorld(x, z), tile = tiles[G.col(h)];
    if (tile && y <= topOf(tile)) return { hex: { q: h.q + 0, r: h.r + 0 }, tile };
    if (!fallback && y <= planeAt) fallback = { hex: { q: h.q + 0, r: h.r + 0 }, tile: null };
  }
  return fallback;
}
