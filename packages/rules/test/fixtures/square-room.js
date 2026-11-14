// A small square map for the square-grid tests (docs/specs/square-grid.md, task S6): a room 15 by 15
// squares (columns 0 to 14, rows 0 to 14), with
//   - a pillar (a statue) at 10,3 and a square of rock at 12,12, both things that fill their square;
//   - a short wall inside the room on the line x = 12.5 ft, from the corner of squares 2,5 / 3,6 down
//     two squares (y 27.5 to 37.5 ft): it ends on a corner;
//   - a corridor 10 ft wide out of the east side, rows 3 and 4, columns 15 to 22;
//   - a corridor 5 ft wide out of the east side, row 10, columns 15 to 22, with a wooden door, shut,
//     on the east side of 18,10.
// A square's centre is at 5q, 5r feet; its sides are 2.5 ft either way. The party starts at 1,1.
// A function, so that every test gets its own copy.
const tiles = {};
const floor = (q, r, t = "stone") => { tiles[`${q},${r}`] = { t }; };
for (let q = 0; q <= 14; q++) for (let r = 0; r <= 14; r++) floor(q, r);
for (let q = 15; q <= 22; q++) { floor(q, 3); floor(q, 4); floor(q, 10); }
floor(12, 12, "rock");

const wall = (id, a, b) => ({ id, level: "ground", a, b, kind: "wall" });
const walls = [
  wall("north", [-2.5, -2.5], [72.5, -2.5]),
  wall("west", [-2.5, -2.5], [-2.5, 72.5]),
  wall("south", [-2.5, 72.5], [72.5, 72.5]),
  wall("east-1", [72.5, -2.5], [72.5, 12.5]),
  wall("east-2", [72.5, 22.5], [72.5, 47.5]),
  wall("east-3", [72.5, 52.5], [72.5, 72.5]),
  wall("wide-n", [72.5, 12.5], [112.5, 12.5]),
  wall("wide-s", [72.5, 22.5], [112.5, 22.5]),
  wall("wide-e", [112.5, 12.5], [112.5, 22.5]),
  wall("narrow-n", [72.5, 47.5], [112.5, 47.5]),
  wall("narrow-s", [72.5, 52.5], [112.5, 52.5]),
  wall("narrow-e", [112.5, 47.5], [112.5, 52.5]),
  wall("stub", [12.5, 27.5], [12.5, 37.5]),
];

export const squareRoom = () => structuredClone({
  format: 2, id: "square-room", name: "Square room", grid: "square", cellFeet: 5,
  levels: [{ id: "ground", name: "Ground", z: 0, light: "bright", tiles }],
  walls,
  objects: [
    { id: "pillar", def: "statue", level: "ground", at: { q: 10, r: 3 }, state: "standing" },
    { id: "door", def: "door-wooden", level: "ground", at: { q: 18, r: 10 }, edge: 0, state: "closed" },
  ],
  regions: [],
  starts: [{ q: 1, r: 1 }],
});
