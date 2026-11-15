// Assembles the static site in dist/: the client files, with the rules engine
// copied in as ./shared so the browser can import it with relative paths.
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

rmSync("dist", { recursive: true, force: true });
cpSync("packages/client", "dist", { recursive: true });
cpSync("packages/rules/src", "dist/shared", { recursive: true });
// packages/client/vendor/ (pinned third-party code, see its README) arrives in dist/vendor/ with the rest of the client.
// Nothing imports it by default; only the Three.js renderer and the load check do. Fail the build if it did not arrive.
for (const f of ["three.module.js", "three.core.js", "GLTFLoader.js", "BufferGeometryUtils.js", "SkeletonUtils.js", "LICENSE"])
  if (!existsSync(`dist/vendor/three/${f}`)) throw new Error(`dist/vendor/three/${f} is missing: the vendored Three.js did not build in`);
console.log("Built dist/");

// dist/build.json says which change this build is: { commit, when, pr?, subject?, source }. The game reads it for About and the feedback
// report; the table server answers /build.json itself from its own environment when it can (packages/server/src/build-info.js).
// From GitHub Actions: GITHUB_SHA, and `git log -1` for the time and subject (the checkout has the head commit). With neither, source is "local".
const git = (...args) => { try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const [logTime = "", logSubject = ""] = git("log", "-1", "--format=%cI%n%s").split("\n");
const sha = (process.env.GITHUB_SHA || git("rev-parse", "HEAD")).trim();
const subject = logSubject.slice(0, 80);
const pr = /^Merge pull request #(\d+)/.exec(subject)?.[1] ?? /\(#(\d+)\)$/.exec(subject)?.[1];
const stamp = {
  commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null,
  when: (logTime ? new Date(logTime) : new Date()).toISOString().replace(/\.\d+Z$/, "Z"),
  ...(pr && { pr: Number(pr) }), ...(subject && { subject }),
  source: process.env.GITHUB_ACTIONS ? "pages" : "local",
};
writeFileSync("dist/build.json", JSON.stringify(stamp) + "\n");
console.log(`Build stamp: ${JSON.stringify(stamp)}`);
