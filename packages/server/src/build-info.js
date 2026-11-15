// GET /build.json: which change this server is running (#353 addendum). The game shows it in About and puts it in a feedback report.
//
// A deployed Railway service has the variables RAILWAY_GIT_COMMIT_SHA and RAILWAY_GIT_COMMIT_MESSAGE, "provided if the deploy originated
// from a GitHub trigger" (https://docs.railway.com/variables/reference, read 15 November 2026). The page does not say whether they are
// there at run time as well as build time, so nothing depends on it: without them the answer is the dist/build.json the image was built
// with (scripts/build.mjs), whose source is "local" inside a Docker build with no .git, and is then called "server". Only these two
// variables are read; no other environment variable is ever put in the answer. `started` is when this process began.
import { readFileSync } from "node:fs";

const first = (text, n) => String(text ?? "").split("\n")[0].trim().slice(0, n);
export const prOf = (subject) => { const m = /^Merge pull request #(\d+)/.exec(subject) ?? /\(#(\d+)\)\s*$/.exec(subject); return m ? Number(m[1]) : undefined; };

// file: the path of the dist/build.json; env: process.env (only the two variables are read); started: a Date.
export function buildInfo({ file, env = {}, started = new Date() }) {
  let built = {};
  try { const j = JSON.parse(readFileSync(file, "utf8")); if (j && typeof j === "object") built = j; } catch { /* no stamp in the image */ }
  const sha = String(env.RAILWAY_GIT_COMMIT_SHA ?? "").trim();
  const deployed = /^[0-9a-f]{7,40}$/i.test(sha);
  const subject = deployed ? first(env.RAILWAY_GIT_COMMIT_MESSAGE, 80) : String(built.subject ?? "").slice(0, 80);
  const pr = deployed ? prOf(subject) : Number.isInteger(built.pr) ? built.pr : undefined;
  const commit = deployed ? sha.slice(0, 7) : /^[0-9a-f]{7}$/i.test(built.commit ?? "") ? built.commit : null;
  return {
    commit, when: typeof built.when === "string" ? built.when.slice(0, 25) : null,
    ...(pr !== undefined && { pr }), ...(subject && { subject }),
    source: "server", from: deployed ? "railway" : "image", started: started.toISOString().replace(/\.\d+Z$/, "Z"),
  };
}
