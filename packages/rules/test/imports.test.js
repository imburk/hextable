// The rules package's modules import one another without cycles (CLAUDE.md, "Engine layout"):
// a cycle gives a module that is still loading to another, and breaks in ways that depend on which
// was loaded first. Three cycles older than this test are listed and may only go away; any other
// fails, one through migrate.js included (review of #310: migrate.js must not import engine.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const KNOWN = new Set([
  "content/index.js > effects.js > durations.js > modifiers.js > content/index.js",
  "content/index.js > effects.js > durations.js > modifiers.js > sight.js > walls.js > content/index.js",
  "modifiers.js > sight.js > modifiers.js",
]);

function graph() {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
  walk(ROOT);
  const deps = new Map();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    deps.set(f, [...src.matchAll(/^\s*(?:import|export)\b[^;'"]*?from\s*['"](\.[^'"]+)['"]/gm)].map((m) => resolve(dirname(f), m[1])));
  }
  return { files: files.sort(), deps };
}
function cycles({ files, deps }) {
  const state = new Map(), out = [];
  const name = (f) => relative(ROOT, f).split("\\").join("/");
  const dfs = (f, stack) => {
    state.set(f, 1); stack.push(f);
    for (const d of deps.get(f) ?? []) {
      if (state.get(d) === 1) out.push(stack.slice(stack.indexOf(d)).concat(d).map(name).join(" > "));
      else if (!state.get(d)) dfs(d, stack);
    }
    stack.pop(); state.set(f, 2);
  };
  for (const f of files) if (!state.get(f)) dfs(f, []);
  return out;
}

test("no import cycles in the rules package beyond the three known ones", () => {
  const found = cycles(graph());
  assert.deepEqual(found.filter((c) => !KNOWN.has(c)), []);
  assert.ok(!found.some((c) => c.includes("migrate.js")));
});

test("the cycle check finds a cycle through migrate.js", () => {
  const g = graph(), m = resolve(ROOT, "migrate.js"), e = resolve(ROOT, "engine.js"), sc = resolve(ROOT, "scenario.js");
  g.deps.set(m, [...g.deps.get(m), e]);
  g.deps.set(e, [...g.deps.get(e), sc]);                          // engine.js > scenario.js > migrate.js > engine.js
  assert.ok(cycles(g).some((c) => c.includes("migrate.js") && !KNOWN.has(c)));
});
