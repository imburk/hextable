// GET /build.json (build-info.js): from Railway's variables when set, else the image's dist/build.json; nothing else of the environment.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildInfo, prOf } from "../src/build-info.js";
import { startServer, stopAll } from "./helpers.js";

after(stopAll);
const dir = mkdtempSync(join(tmpdir(), "bi-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, "build.json");
writeFileSync(file, JSON.stringify({ commit: "abc1234", when: "2026-11-15T11:13:26Z", pr: 12, subject: "Merge pull request #12 from x/y", source: "local" }));
const started = new Date("2026-11-15T12:00:00.123Z");

test("with Railway's variables the commit and message come from them; the time is the image's", () => {
  const b = buildInfo({ file, started, env: { RAILWAY_GIT_COMMIT_SHA: "c1d5069aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", RAILWAY_GIT_COMMIT_MESSAGE: "Merge pull request #354 from imburk/x\n\nbody", FEEDBACK_GITHUB_TOKEN: "SECRET", DATA_DIR: "/data" } });
  assert.deepEqual(b, { commit: "c1d5069", when: "2026-11-15T11:13:26Z", pr: 354, subject: "Merge pull request #354 from imburk/x", source: "server", from: "railway", started: "2026-11-15T12:00:00Z" });
  assert.ok(!JSON.stringify(b).includes("SECRET"));
});

test("without them the image's build.json is the answer, and a missing or damaged one is not an error", () => {
  assert.deepEqual(buildInfo({ file, started, env: {} }), { commit: "abc1234", when: "2026-11-15T11:13:26Z", pr: 12, subject: "Merge pull request #12 from x/y", source: "server", from: "image", started: "2026-11-15T12:00:00Z" });
  assert.deepEqual(buildInfo({ file: join(dir, "none.json"), started, env: { RAILWAY_GIT_COMMIT_SHA: "not a sha" } }), { commit: null, when: null, source: "server", from: "image", started: "2026-11-15T12:00:00Z" });
});

test("a pull request number is read from a merge or a squash subject", () => {
  assert.equal(prOf("Merge pull request #7 from a/b"), 7);
  assert.equal(prOf("Add a thing (#8)"), 8);
  assert.equal(prOf("Add a thing"), undefined);
});

test("the server answers /build.json from its environment, and adds no other variable", async () => {
  const s = await startServer({ env: { RAILWAY_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567", RAILWAY_GIT_COMMIT_MESSAGE: "Fix a thing (#99)", FEEDBACK_GITHUB_TOKEN: "TOPSECRET" } });
  const r = await fetch(`http://localhost:${s.port}/build.json`);
  const text = await r.text(), j = JSON.parse(text);
  assert.equal(r.status, 200);
  assert.equal(j.commit, "0123456");
  assert.equal(j.pr, 99);
  assert.equal(j.from, "railway");
  assert.match(j.started, /^\d{4}-\d\d-\d\dT[\d:]+Z$/);
  assert.ok(!text.includes("TOPSECRET"));
});

test("with no Railway variables the server answers with the build it was built with", async () => {
  const s = await startServer({ env: { RAILWAY_GIT_COMMIT_SHA: "" } });
  const j = await (await fetch(`http://localhost:${s.port}/build.json`)).json();
  assert.equal(j.source, "server");
  assert.equal(j.from, "image");
  assert.ok("commit" in j);
});
