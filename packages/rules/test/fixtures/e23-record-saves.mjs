// Records fixtures/e23-main-saves.json (#372): games saved by main's code (before #372), on hexes and on the square room:
// the table before the DM's Fire Bolt at the fighter, and the fight that cast started on main (the cast dropped).
//   node packages/rules/test/fixtures/e23-record-saves.mjs /path/to/main/packages/rules
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const B = resolve(process.argv[2]);
const { apply, current, makeEntity } = await import(`${B}/src/engine.js`);
const { derive } = await import(`${B}/src/derive.js`);
const { newGame } = await import(`${B}/src/scenario.js`);
const { squareRoom } = await import("./square-room.js");
const { kit, DM, GRIDS } = await import("../e23-kit.js");
const K = kit({ apply, current, makeEntity, derive, newGame, squareRoom });
const saves = [];
for (const grid of GRIDS) {
  const s = K.table(grid);
  saves.push({ grid, at: "before", state: structuredClone(s) });
  apply(s, K.CASTS.attack(grid), DM);
  saves.push({ grid, at: "dropped", state: structuredClone(s) });
}
writeFileSync(new URL("./e23-main-saves.json", import.meta.url), JSON.stringify({ recordedOn: "main 727d590", saves }) + "\n");
