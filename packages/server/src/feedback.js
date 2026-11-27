// Player feedback (issue #353, docs/specs/feedback.md): POST /feedback takes one report from the game's feedback button.
//
//   POST    /feedback    JSON, at most 24 KB -> 201 { ref: "FB-XXXXXX" }
//   OPTIONS /feedback    the CORS preflight, for the solo game on another site (this route only; no cookies, no credentials)
//
// What the route does, in this order: the address's rate limit (5 a minute, 30 an hour; limits.js), the content type, the body read
// with a hard cap while it arrives (nothing past 24 KB is ever held), the JSON, then a field-by-field check against an allow-list
// (`check` below: a field not named there is refused, and so is a wrong type or length). Only then is anything written: one JSON line
// appended to <data dir>/feedback.jsonl. When that passes its size ceiling it is renamed to the next free feedback.N.jsonl; when every
// place is taken (FILES files of FILE_MAX bytes in all) new reports are refused with a clear answer, and nothing older is ever deleted, so
// a flood can fill the disk's share but cannot erase a real report. A refused report writes nothing and files nothing.
//
// Optional GitHub forwarding, when FEEDBACK_GITHUB_REPO ("owner/name") and FEEDBACK_GITHUB_TOKEN are set: the report is also filed as an
// issue labelled `feedback`. Every word the player wrote goes inside a fenced block whose fence is longer than any run of backticks in it,
// so it cannot make a mention, a link, HTML or a heading, or close the block. It happens after the player has their answer; a failure
// is logged without the token and is never shown to the player or allowed to lose the local line.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { LIMIT_MESSAGE } from "./limits.js";

export const BODY_MAX = 24 * 1024;
export const COMMENT_MAX = 2000;
export const FILE_MAX = 5 * 1024 * 1024;           // feedback.jsonl is rotated before it passes this
export const FILES = 5;                            // files in all: feedback.jsonl and feedback.1.jsonl to feedback.4.jsonl
const BODY_MS = 10_000;                            // a body must arrive within this
const KINDS = ["bug", "idea", "question"];
const KIND_WORDS = { bug: "Bug", idea: "Idea", question: "Question" };

// ---------- the allow-list ----------
// A field is a test that returns an error string or null. `str(max)` is a string of at most `max` characters with no control
// characters (a comment may hold newlines and tabs); the others are what they say.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const str = (max, { min = 0, lines = false } = {}) => (v) => {
  if (typeof v !== "string") return "must be text";
  if (v.length > max) return `must be at most ${max} characters`;
  if (v.length < min) return "must not be empty";
  if (CONTROL.test(v) || (!lines && /[\n\r\t]/.test(v))) return "has characters that are not allowed";
  return null;
};
const oneOf = (list) => (v) => (list.includes(v) ? null : `must be one of ${list.join(", ")}`);
const bool = (v) => (typeof v === "boolean" ? null : "must be true or false");
const int = (lo, hi) => (v) => (Number.isInteger(v) && v >= lo && v <= hi ? null : `must be a whole number from ${lo} to ${hi}`);
const list = (max, item) => (v) => {
  if (!Array.isArray(v)) return "must be a list";
  if (v.length > max) return `must have at most ${max} entries`;
  for (const x of v) { const e = item(x); if (e) return `an entry ${e}`; }
  return null;
};
const nullable = (f) => (v) => (v === null ? null : f(v));
// An object with exactly these fields allowed; `required` ones must be there.
const shape = (fields, required = []) => (v) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "must be an object";
  for (const k of Object.keys(v)) {
    if (!Object.hasOwn(fields, k)) return "has a field that is not allowed";
    const e = fields[k](v[k]);
    if (e) return `field ${k} ${e}`;
  }
  for (const k of required) if (!Object.hasOwn(v, k)) return `needs field ${k}`;
  return null;
};
// The arguments of an action the client sent: short words and numbers only, never text a player typed.
const WORD = /^[\w.:-]{1,40}$/;
const word = (v) => (typeof v === "string" && WORD.test(v) ? null : "must be a short word");
const scalar = (v) => (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ? null : word(v));
const argValue = (v) => {
  if (Array.isArray(v)) return v.length <= 8 && v.every((x) => scalar(x) === null) ? null : "must be a short list of words or numbers";
  if (v !== null && typeof v === "object") return Object.keys(v).length <= 4 && Object.entries(v).every(([k, x]) => /^[a-z]{1,8}$/.test(k) && typeof x === "number" && Number.isFinite(x)) ? null : "must be a few numbers";
  return scalar(v);
};
const args = (v) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "must be an object";
  const keys = Object.keys(v);
  if (keys.length > 12) return "has too many fields";
  for (const k of keys) { if (!/^[A-Za-z]{1,20}$/.test(k)) return "has a field name that is not allowed"; const e = argValue(v[k]); if (e) return `field ${k} ${e}`; }
  return null;
};

// The same checks, for crashes.js (#689): the browser's error reports are held to an allow-list of the same kind.
export { str, oneOf, int, list, shape };

export const REPORT = shape({
  v: oneOf([1]),
  kind: oneOf(KINDS),
  comment: str(COMMENT_MAX, { min: 1, lines: true }),
  sentAt: str(40),
  build: str(40),
  mode: oneOf(["solo", "table"]),
  role: oneOf(["player", "dm"]),
  renderer: str(30), theme: str(30), grid: oneOf(["hex", "square"]),
  viewport: shape({ w: int(0, 20000), h: int(0, 20000) }, ["w", "h"]),
  touch: bool,
  ua: str(300), lang: str(35),
  context: shape({
    log: list(30, str(300)),
    actions: list(15, shape({ type: str(40), args, answer: str(200) }, ["type", "answer"])),
    fight: shape({ on: bool, round: nullable(int(0, 10000)), turn: nullable(oneOf(["mine", "other", "unseen"])) }, ["on"]),
    character: nullable(shape({ cls: str(40), level: int(0, 30), conditions: list(20, str(40)) }, ["cls", "level", "conditions"])),
    map: str(60),
    errors: list(10, shape({ message: str(200), at: str(200) }, ["message"])),
  }),
}, ["v", "kind", "comment", "sentAt", "build", "mode", "role", "viewport"]);

// ---------- the GitHub issue ----------
// A fence one backtick longer than the longest run of backticks inside, at least three: text inside cannot close it.
export function fence(text, info = "") {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const f = "`".repeat(Math.max(3, longest + 1));
  return `${f}${info}\n${text}\n${f}`;
}
// A title is plain text on one line. Characters that GitHub turns into something (mentions, references, markup) become spaces.
export function issueTitle(report) {
  const first = report.comment.replace(/\s+/g, " ").trim().slice(0, 60).replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/GH-(?=\d)/gi, "GH ").replace(/[@#<>&`\[\]\\*_~|:]/g, " ").replace(/\s+/g, " ").trim();
  return `${KIND_WORDS[report.kind]}: ${first || "(no text)"}`;
}
export function issueBody(report, ref) {
  const { comment, context, ...rest } = report;
  const meta = { ...rest, ...(context && { context }) };
  return [
    `Player feedback ${ref} (${KIND_WORDS[report.kind]}). The player's words and what their game sent are in the blocks below, as text.`,
    "",
    fence(comment, "text"),
    "",
    "<details><summary>What was sent with it</summary>",
    "",
    fence(JSON.stringify(meta, null, 1), "json"),
    "",
    "</details>",
  ].join("\n");
}

// ---------- the handler ----------
// options: dir (the data directory), env, fileMax, log (console.error), fetch (for tests), now.
export function createFeedback({ dir, env = {}, fileMax = FILE_MAX, files = FILES, log = (m) => console.error(m), fetch: doFetch = globalThis.fetch } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "feedback.jsonl"), numbered = (n) => join(dir, `feedback.${n}.jsonl`), old = numbered(1);
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.FEEDBACK_GITHUB_REPO ?? "") ? env.FEEDBACK_GITHUB_REPO : null;
  const token = typeof env.FEEDBACK_GITHUB_TOKEN === "string" && env.FEEDBACK_GITHUB_TOKEN.trim() ? env.FEEDBACK_GITHUB_TOKEN.trim() : null;
  if ((env.FEEDBACK_GITHUB_REPO || token) && !(repo && token)) log("feedback: set both FEEDBACK_GITHUB_REPO (owner/name) and FEEDBACK_GITHUB_TOKEN to file reports on GitHub; reports are kept in the data directory only.");
  // The API address can be changed for tests; it must be https, or http on this machine.
  let api = "https://api.github.com";
  if (env.FEEDBACK_GITHUB_API) {
    try { const u = new URL(env.FEEDBACK_GITHUB_API); if (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) api = u.origin; } catch { /* keep the default */ }
  }
  const timeoutMs = Number(env.FEEDBACK_GITHUB_TIMEOUT_MS) > 0 ? Number(env.FEEDBACK_GITHUB_TIMEOUT_MS) : 10_000;
  const scrub = (s) => { let t = String(s); if (token) t = t.split(token).join("[token]"); return t.slice(0, 300); };
  let filing = 0;                                    // issues being filed now: a burst from many addresses is not queued without end

  function store(report, ref) {
    const line = JSON.stringify({ ref, at: new Date().toISOString(), ...(env.RAILWAY_GIT_COMMIT_SHA || env.SOURCE_COMMIT || env.GIT_COMMIT ? { server: String(env.RAILWAY_GIT_COMMIT_SHA || env.SOURCE_COMMIT || env.GIT_COMMIT).slice(0, 40) } : {}), report }) + "\n";
    let size = 0;
    try { size = statSync(file).size; } catch { /* no file yet */ }
    if (size > 0 && size + Buffer.byteLength(line) > fileMax) {
      let free = 0;
      for (let n = 1; n < files && !free; n++) if (!existsSync(numbered(n))) free = n;
      if (!free) { if (!full) { full = true; log(`feedback: all ${files} feedback files in ${dir} are full; new reports are refused until some are moved away.`); } return false; }
      renameSync(file, numbered(free));
    }
    appendFileSync(file, line);
    return true;
  }
  let full = false;

  let capped = false;
  async function forward(report, ref, limits) {
    if (!repo || !token) return;
    if (filing >= 4) return log("feedback: too many GitHub requests at once; this report was kept locally only.");
    if (!limits.allowForward()) { if (!capped) { capped = true; setTimeout(() => { capped = false; }, 3_600_000).unref(); log("feedback: the hourly or daily limit on GitHub issues is reached; reports are kept locally only."); } return; }
    filing++;
    try {
      const res = await doFetch(`${api}/repos/${repo}/issues`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "hextable-feedback", "x-github-api-version": "2022-11-28" },
        body: JSON.stringify({ title: issueTitle(report), body: issueBody(report, ref), labels: ["feedback"] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await res.body?.cancel?.().catch(() => {});
      if (!res.ok) log(`feedback: GitHub refused the issue for ${ref} (status ${res.status}); the report is in ${file}.`);
    } catch (err) {
      log(`feedback: could not file ${ref} on GitHub (${scrub(err?.name === "TimeoutError" ? "timed out" : err?.message)}); the report is in ${file}.`);
    } finally { filing--; }
  }

  // req, res: the request; addr: the client address from the server's own logic; limits: createLimits().
  function handle(req, res, { limits, addr }) {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" };
    const send = (status, body, extra = {}) => res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors, ...extra }).end(JSON.stringify(body));
    const refuse = (status, error, extra) => send(status, { error }, { connection: "close", ...extra });
    if (req.method === "OPTIONS") return void res.writeHead(204, { ...cors, "cache-control": "no-store" }).end();
    if (req.method !== "POST") return refuse(405, "Use POST.", { allow: "POST, OPTIONS" });
    // What can be judged from the headers is judged before the address's budget is spent, so junk of that kind costs a real report nothing.
    const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") return refuse(415, "Send JSON.");
    const declared = Number(req.headers["content-length"]);
    const tooBig = () => { refuse(413, "That report is too long."); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); };
    if (Number.isFinite(declared) && declared > BODY_MAX) return tooBig();
    if (!limits.allowFeedback(addr)) return refuse(429, LIMIT_MESSAGE);
    const parts = [];
    let size = 0, done = false;
    const stop = setTimeout(() => { if (!done) { done = true; refuse(408, "The report did not arrive in time."); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); } }, BODY_MS);
    stop.unref();
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > BODY_MAX) { done = true; clearTimeout(stop); parts.length = 0; return tooBig(); }
      parts.push(chunk);
    });
    req.on("error", () => { done = true; clearTimeout(stop); });
    req.on("end", () => {
      if (done) return;
      done = true; clearTimeout(stop);
      let report;
      try { report = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return refuse(400, "That is not JSON."); }
      const problem = REPORT(report);
      if (problem) return refuse(400, `The report was refused: ${problem}.`);
      const ref = `FB-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
      try { if (!store(report, ref)) return refuse(503, "Feedback cannot be saved on this server right now. Copy it and send it another way."); }
      catch (err) { log(`feedback: could not write ${file}: ${scrub(err.message)}`); return refuse(500, "The report could not be saved. Copy it and send it another way."); }
      send(201, { ref });
      forward(report, ref, limits);
    });
  }
  return { handle, file, rotated: old };
}

// Is this request for the feedback route? (The raw path, query ignored.)
export const feedbackRoute = (rawUrl) => String(rawUrl ?? "").split("?")[0] === "/feedback";
