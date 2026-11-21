// The guides every agent is told to read first (CLAUDE.md, docs/DESIGN.md, docs/ROADMAP.md, docs/specs/README.md)
// are kept true by this test (architecture review R10, #617). A pull request that adds a rules module, enters
// content or adds a spec updates them, or this fails.
//   - Every module in packages/rules/src/*.js and src/engine/*.js is named, as `name.js` in backticks, in CLAUDE.md.
//   - Every <!-- count:KIND -->N<!-- /count --> in DESIGN.md and ROADMAP.md equals what the content pack holds.
//   - docs/specs/README.md lists every spec file, and every spec it links exists.
//   - Every spec has a `Status:` line near its top.
// Not checked: which build stages a spec's status names. Specs word that freely (S1 to S7, "part 2", C1 to C8);
// a rule that fits all of them is not cheap, so the spec's own status line stays the source and the README summarises it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACKS } from "../src/content/index.js";

const at = (p) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const read = (p) => readFileSync(at(p), "utf8");
const jsIn = (d) => readdirSync(at(d), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => `${d}/${e.name}`).sort();

test("CLAUDE.md's layout names every rules module", () => {
  const guide = read("CLAUDE.md");
  const missing = [...jsIn("packages/rules/src"), ...jsIn("packages/rules/src/engine")]
    .filter((f) => !guide.includes("`" + f.split("/").pop() + "`"));
  assert.deepEqual(missing, [], `CLAUDE.md's layout does not mention: ${missing.join(", ")}. Add one line for each.`);
});

test("counts quoted in DESIGN.md and ROADMAP.md are the content packs' counts", () => {
  const pack = PACKS[0];
  for (const doc of ["docs/DESIGN.md", "docs/ROADMAP.md"]) {
    const marks = [...read(doc).matchAll(/<!-- count:(\w+) -->(\d+)<!-- \/count -->/g)];
    assert.ok(marks.length > 0, `${doc} quotes no counts in <!-- count:KIND -->N<!-- /count --> markers`);
    for (const [, kind, n] of marks) {
      assert.ok(Array.isArray(pack[kind]), `${doc}: no content kind "${kind}"`);
      assert.equal(Number(n), pack[kind].length, `${doc} says ${n} ${kind}; the pack holds ${pack[kind].length}. Update it (npm run content).`);
    }
  }
});

test("the specs index lists every spec and only specs that exist", () => {
  const files = readdirSync(at("docs/specs")).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  const listed = [...read("docs/specs/README.md").matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]);
  assert.deepEqual(listed.filter((f) => !files.includes(f)), [], "docs/specs/README.md links a spec that does not exist");
  assert.deepEqual(files.filter((f) => !listed.includes(f)), [], "a spec file is not listed in docs/specs/README.md");
});

test("every spec has a Status line near its top", () => {
  const bad = readdirSync(at("docs/specs")).filter((f) => f.endsWith(".md") && f !== "README.md")
    .filter((f) => !read(`docs/specs/${f}`).split("\n").slice(0, 12).some((l) => /^Status:/.test(l)));
  assert.deepEqual(bad, [], `no "Status:" line in the first 12 lines of: ${bad.join(", ")}`);
});

test("each guide says when it was last checked", () => {
  for (const doc of ["CLAUDE.md", "docs/DESIGN.md", "docs/ROADMAP.md", "docs/specs/README.md"])
    assert.match(read(doc).split("\n").slice(0, 4).join("\n"), /last checked[^\n]*\d{4}-\d{2}-\d{2}/i, `${doc}: no "last checked YYYY-MM-DD" in its first lines`);
});
