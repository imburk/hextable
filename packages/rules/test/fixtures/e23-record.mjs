// Records fixtures/e23-main-replay.json (#372) from the rules code at the path given (main's packages/rules, before #372):
//   node packages/rules/test/fixtures/e23-record.mjs /path/to/main/packages/rules
// Each scenario of e23-scenarios.js is kept as the sha256 of every action's result and of the state at the end.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const B = resolve(process.argv[2]);
const { apply, current, makeEntity } = await import(`${B}/src/engine.js`);
const { derive } = await import(`${B}/src/derive.js`);
const { newGame } = await import(`${B}/src/scenario.js`);
const { squareRoom } = await import("./square-room.js");
const { kit } = await import("../e23-kit.js");
const { scenarios, run } = await import("../e23-scenarios.js");
const M = { apply, current, makeEntity, derive, newGame, squareRoom };
const sha = (x) => createHash("sha256").update(x).digest("hex");
const out = {};
for (const sc of scenarios(kit(M))) out[sc.name] = run(M, sc).map(sha);
writeFileSync(new URL("./e23-main-replay.json", import.meta.url), JSON.stringify({ recordedOn: "main 727d590", scenarios: out }, null, 1) + "\n");
console.log(Object.keys(out).length, "scenarios");
