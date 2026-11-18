// Every pass in the smoke registry (scripts/smoke.mjs) runs in CI's matrix (.github/workflows/smoke.yml),
// and the matrix lists nothing the registry does not know. A new pass cannot be left out again (#478).
// The files are read as text: smoke.mjs runs a browser when imported.
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL("../../../" + p, import.meta.url));

function registry() {
  const src = readFileSync(root("scripts/smoke.mjs"), "utf8");
  const body = src.match(/const REGISTRY = \{\n([\s\S]*?)\n\};/);
  assert.ok(body, "REGISTRY not found in scripts/smoke.mjs");
  const out = new Map();
  for (const m of body[1].matchAll(/^\s*'?([\w-]+)'?:\s*\[([^\]]*)\]/gm)) {
    out.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((f) => f[1]));
  }
  return out;
}

function matrix() {
  const src = readFileSync(root(".github/workflows/smoke.yml"), "utf8");
  const m = src.match(/^\s*pass:\s*\[([^\]]*)\]/m);
  assert.ok(m, "matrix.pass not found in smoke.yml");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

test("the smoke matrix and the registry list the same passes", () => {
  const reg = [...registry().keys()].sort();
  const mat = matrix();
  assert.equal(new Set(mat).size, mat.length, "a pass is listed twice in the matrix");
  assert.deepEqual([...mat].sort(), reg);
});

test("every registry entry names pass files that exist", () => {
  for (const [name, files] of registry()) {
    assert.ok(files.length > 0, `${name} has no files`);
    for (const f of files) assert.ok(existsSync(root(`scripts/smoke/${f}.mjs`)), `${name}: scripts/smoke/${f}.mjs is missing`);
  }
});
