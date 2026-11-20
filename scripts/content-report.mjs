// Prints how much rules content is entered, at which tier, and how much is unchecked.
// Usage: npm run content
import { PACKS } from "../packages/rules/src/content/index.js";
import { coverage, featureCoverage, lintPack } from "../packages/rules/src/content/schema.js";

let failed = false;
for (const p of PACKS) {
  const problems = lintPack(p);
  console.log(`\n${p.pack.name} (${p.pack.id})`);
  console.table(coverage({ spells: p.spells, monsters: p.monsters, conditions: p.conditions, objects: p.objects, ...(p.feats ? { feats: p.feats } : {}), ...(p.items ? { items: p.items } : {}), ...(p.species ? { species: p.species } : {}) }));
  // Each species' tier, and its features' (the lineage options' included) by tier.
  if (p.species?.length) {
    console.log("Species, with their features by tier (every lineage option's counted):");
    console.table(Object.fromEntries(p.species.map((s) => {
      const fs = [...s.features, ...(s.lineage?.options ?? []).flatMap((o) => o.features)], n = (t) => fs.filter((f) => f.tier === t).length;
      return [s.id, { tier: s.tier, auto: n("auto"), assist: n("assist"), manual: n("manual"), unchecked: fs.filter((f) => f.checked !== true).length + (s.checked === true ? 0 : 1) }];
    })));
  }
  if (p.classes?.length) { console.log("Class features (with the subclass), by tier:"); console.table(featureCoverage(p.classes)); console.log(`Equipment: ${p.weapons.length} weapons, ${p.armour.length} armour.`); }
  if (problems.length) { failed = true; console.log(`${problems.length} problem(s):`); for (const x of problems) console.log("  " + x); }
  else console.log("No problems found.");
}
process.exit(failed ? 1 : 0);
