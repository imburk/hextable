// Prints how much rules content is entered, at which tier, and how much is unchecked.
// Usage: npm run content
import { PACKS } from "../packages/rules/src/content/index.js";
import { coverage, lintPack } from "../packages/rules/src/content/schema.js";

let failed = false;
for (const p of PACKS) {
  const problems = lintPack(p);
  console.log(`\n${p.pack.name} (${p.pack.id})`);
  console.table(coverage({ spells: p.spells, monsters: p.monsters, conditions: p.conditions }));
  if (problems.length) { failed = true; console.log(`${problems.length} problem(s):`); for (const x of problems) console.log("  " + x); }
  else console.log("No problems found.");
}
process.exit(failed ? 1 : 0);
