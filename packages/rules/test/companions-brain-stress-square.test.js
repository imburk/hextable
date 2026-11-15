// Companions C7 (#366): the DM's auto-play stress loop on the square room (c7-stress-kit.js says what it does and checks): 2,400
// rounds with locked, commanded, bonded, ridden and independent creatures: no stall, no endless turn, nothing the brain
// sends refused, one turn's worth a round for every creature, nobody overlapping.
import { test } from "node:test";
import { check, ROUNDS } from "./c7-stress-kit.js";

const grid = "square";
test(`square: C7 stress, ${ROUNDS} rounds of the DM's auto-play with locked, commanded, bonded, ridden and independent creatures: no stall, no endless turn, nothing refused, one turn's worth a round`, () => check(grid));
