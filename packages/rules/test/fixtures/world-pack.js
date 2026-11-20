// A world pack for the W3 tests (docs/specs/travel.md, Decision 2), rules and server: a continent, a port city's plan
// under it, two battle maps (the keep with a gate, the tavern with a door), a road from the keep to the port with an
// encounter table, and two pictures. `riverPack()` gives a fresh copy each time.
import keep from "../../src/content/maps/keep.js";
import tavern from "../../src/content/maps/tavern.js";

// The smallest pictures the asset store takes by their bytes: a 1x1 PNG and the head of a JPEG.
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
export const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(28).fill(7)));

export function keepMap() {
  const m = structuredClone(keep);
  m.entries = [{ id: "gate", name: "The gatehouse", kind: "gate" }];
  m.starts = [...m.starts, { level: "ground", q: -13, r: 1, entry: "gate" }, { level: "ground", q: -12, r: 1, entry: "gate" }];
  return m;
}
export function tavernMap() {
  const m = structuredClone(tavern);
  m.entries = [{ id: "door", name: "The front door", kind: "gate" }];
  m.starts = [...m.starts, { level: "ground", q: 0, r: 1, entry: "door" }];
  return m;
}

export function riverPack() {
  return {
    format: "hextable-world", v: 1,
    world: { id: "river-country", name: "The river country", version: 1, root: "continent" },
    nodes: [
      { id: "continent", kind: "nav", scale: "world", name: "The continent", image: "a1", size: [4000, 3000], miles: 25,
        pins: [{ id: "p-keep", at: [1210, 840], name: "The keep", to: "keep", entry: "gate" },
               { id: "p-port", at: [2930, 1710], name: "The port city", to: "port" }] },
      { id: "keep", kind: "map", scale: "tactical", parent: "continent", map: "keep-map", terrain: "hill" },
      { id: "port", kind: "nav", scale: "city", parent: "continent", name: "The port city", image: "a2", size: [2400, 1800], feet: 120, terrain: "urban", battle: ["tavern-map"],
        pins: [{ id: "p-tavern", at: [1100, 900], name: "A tavern", to: "tavern", entry: "door" }] },
      { id: "tavern", kind: "map", scale: "tactical", parent: "port", map: "tavern-map" },
    ],
    routes: [
      { id: "road", from: "keep", to: { node: "port", pin: "p-tavern" }, back: { node: "keep", entry: "gate" }, mode: "foot", miles: 48, terrain: "grassland", road: true,
        encounters: { table: "road-table", every: 240, roll: "engine" }, wayside: ["forest-road"] },
    ],
    tables: [
      { id: "road-table", name: "On the road", die: "1d20", rows: [
        { range: [1, 14] },
        { range: [15, 18], text: "Wolves on the road.", foes: [{ monster: "wolf", count: "1d4+1" }] },
        { range: [19, 20], text: "A merchant with a broken axle.", scene: true },
      ] },
    ],
    maps: { "keep-map": keepMap(), "tavern-map": tavernMap() },
    assets: { a1: { kind: "image", data: PNG, name: "Continent" }, a2: { kind: "image", data: JPEG } },
  };
}
