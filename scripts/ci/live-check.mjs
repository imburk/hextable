// Post-deploy check (review R1, #617): is the live site the version that was merged?
//   node scripts/ci/live-check.mjs          (GITHUB_TOKEN and GITHUB_REPOSITORY in the environment, as in Actions)
// Reads the head of main and the commit each live site reports at /build.json. When main's head is older than GRACE_MINUTES (default 20)
// and a site reports a different commit (or does not answer), it opens the issue "Live site is not the merged version" (or adds a
// comment to the one that is open) naming both shas; when every site matches again it comments and closes that issue.
// Second check (#689): the server's /api/health counts engine crashes and browser errors. When either count has risen since the last run, it opens
// the issue "Live site errors" (or comments on the one that is open) with the rise and the counts by type. The last counts seen are kept in the
// issue itself, in a hidden marker in each comment it writes (`<!-- live-errors: {...} -->`): no cache or artifact to lose, and the issue is the
// record. The counters belong to one server process, so a marker whose process start differs from the current one (a deploy or restart) is not
// a baseline: everything counted since the start is new. When the issue was closed, a rise opens a new one. The job stays green for this check
// (the issue is the signal); a health that cannot be read is printed and left to the build check above.
// Node built-ins only. DRY_RUN=1 prints what it would do and touches nothing on GitHub. SITES overrides the list ("name=url,name=url").
import { pathToFileURL } from "node:url";

export const TITLE = "Live site is not the merged version";
export const DEFAULT_SITES = [
  { name: "Railway (table server)", url: "https://hextable-production.up.railway.app/build.json" },
  { name: "GitHub Pages (solo game)", url: "https://imburk.github.io/hextable/build.json" },
];
export const ERRORS_TITLE = "Live site errors";
export const DEFAULT_HEALTH = "https://hextable-production.up.railway.app/api/health";
const MARKER = /<!-- live-errors: (\{.*?\}) -->/;
const RESTART_SLACK_MS = 120_000;
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));

// main: { sha, when: Date }; results: [{ name, url, commit?, error? }]; returns { stale, mismatches: [{ name, url, why }], ageMinutes }
export function decide({ main, results, now = new Date(), graceMinutes = 20 }) {
  const ageMinutes = Math.floor((now - main.when) / 60_000);
  const mismatches = results.filter((r) => r.error || !same(r.commit, main.sha)).map((r) => ({
    name: r.name, url: r.url, why: r.error ? `did not answer: ${r.error}` : `reports commit ${r.commit ?? "none"}`,
  }));
  return { ageMinutes, mismatches, stale: ageMinutes >= graceMinutes && mismatches.length > 0 };
}

export function report({ main, ageMinutes, mismatches, now }) {
  return [
    `Checked ${now.toISOString()}.`, "",
    `- main's head: \`${main.sha}\` (committed ${main.when.toISOString()}, ${ageMinutes} minutes ago)`,
    ...mismatches.map((m) => `- ${m.name}: ${m.why}; ${m.url}`), "",
    "A merge to `main` should be live on Railway (`railway.app` deploy log) and GitHub Pages (the Pages workflow run) within 20 minutes. A failed or stuck deploy is the usual cause; see the Deploy section of `packages/server/README.md`.",
  ].join("\n");
}

const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const typed = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, v]) => /^[\w.?-]{1,40}$/.test(k) && Number.isFinite(v)).slice(0, 30));
export const CLIENT_THRESHOLD = 25;                 // browser errors alone report only from this many new ones...
export const CLIENT_GAP_MS = 24 * 3_600_000;        // ...and at most once a day. Crashes always report.
const PROCS_KEPT = 4;
// health: the parsed /api/health; marker: what the last report left, { procs: [{ start, crashes, clientErrors, crashesByType, clientErrorsByType }], clientAt? }, or null.
// A process is told by its start time (now - uptime, to a couple of minutes), and each one has its own baseline, so a restart, or two instances
// answering in turn, never makes the whole count new again. Returns { rose, restarted, why, now: the entry for this process, marker: what to leave, delta, byType }.
export function healthRise({ health, marker, now = new Date() }) {
  const start = new Date(now - num(health?.uptime) * 1000).toISOString();
  const cur = { start, crashes: num(health?.crashes), clientErrors: num(health?.clientErrors), crashesByType: typed(health?.crashesByType), clientErrorsByType: typed(health?.clientErrorsByType) };
  const procs = Array.isArray(marker?.procs) ? marker.procs.filter((p) => p && typeof p.start === "string") : [];
  const known = procs.find((p) => Math.abs(Date.parse(cur.start) - Date.parse(p.start)) <= RESTART_SLACK_MS);
  const restarted = !known;
  const base = known ?? { crashes: 0, clientErrors: 0, crashesByType: {}, clientErrorsByType: {} };
  const delta = { crashes: Math.max(0, cur.crashes - num(base.crashes)), clientErrors: Math.max(0, cur.clientErrors - num(base.clientErrors)) };
  const rows = (field) => Object.entries(cur[field]).map(([t, n]) => [t, n, Math.max(0, n - num(base[field]?.[t]))]).filter((r) => r[2] > 0).sort((a, b) => b[2] - a[2]);
  const clientAt = typeof marker?.clientAt === "string" ? Date.parse(marker.clientAt) : NaN;
  const clientDue = delta.clientErrors >= CLIENT_THRESHOLD && !(now - clientAt < CLIENT_GAP_MS);
  const why = delta.crashes > 0 ? "crashes" : clientDue ? "client" : null;
  const keep = procs.filter((p) => p !== known).slice(-(PROCS_KEPT - 1));
  return {
    rose: why !== null, restarted, why, now: cur, delta, byType: { crashes: rows("crashesByType"), clientErrors: rows("clientErrorsByType") },
    marker: { procs: [...keep, cur], ...(why === "client" ? { clientAt: now.toISOString() } : typeof marker?.clientAt === "string" ? { clientAt: marker.clientAt } : {}) },
  };
}
export function errorsReport({ rise, health, checked }) {
  const list = (rows) => (rows.length ? rows.map(([t, n, d]) => `  - \`${t}\`: +${d} (${n} since the server started)`).join("\n") : "  - (none by type)");
  return [
    `Checked ${checked.toISOString()}. Build \`${typeof health?.build === "string" ? health.build.replace(/[^\w.-]/g, "").slice(0, 40) : "unknown"}\`, server started ${rise.now.start}.`, "",
    `- Engine crashes: +${rise.delta.crashes} (${rise.now.crashes} since the server started)`, list(rise.byType.crashes),
    `- Browser errors: +${rise.delta.clientErrors} (${rise.now.clientErrors} since the server started)`, list(rise.byType.clientErrors), "",
    rise.restarted ? "This server process was not in the last report, so every count since it started is new." : "Counts are the rise since the last report on this issue.", "",
    "Engine crashes by action type are the ten most frequent only. Each new kind of crash also has its own `crash` issue; the repro bundles are on the server (`packages/server/README.md`, Engine crashes). Browser errors are `client-error` lines in the server log, and are reported here only with a crash or when 25 or more are new (once a day at most).",
    "", `<!-- live-errors: ${JSON.stringify(rise.marker)} -->`,
  ].join("\n");
}
export const ERRORS_LABEL = "live-errors";
// Only what this workflow wrote counts: an issue or comment by the Actions bot. Anyone else's text, marker or not, is ignored.
const ours = (x) => x?.user?.type === "Bot" && x?.user?.login === "github-actions[bot]";

async function fetchBuild(site) {
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(site.url, { signal: AbortSignal.timeout(20_000), headers: { "cache-control": "no-cache" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (typeof j?.commit !== "string") throw new Error(`no commit in ${JSON.stringify(j).slice(0, 100)}`);
      return { ...site, commit: j.commit };
    } catch (err) { last = err; await new Promise((r) => setTimeout(r, 3000)); }
  }
  return { ...site, error: String(last?.message ?? last) };
}

// The check of /api/health. gh(path) -> JSON; send(method, path, body). Returns a line for the log.
// The issue is found by its label (not its title, and not among the first 100 of all issues), and its marker is read only from the Actions bot's text.
export async function checkErrors({ gh, send, healthUrl, dry, now = new Date(), fetchHealth }) {
  let health;
  try { health = await fetchHealth(healthUrl); } catch (err) { return `health: ${String(err?.message ?? err)} (not checked)`; }
  if (health?.clientErrors === undefined && health?.crashes === undefined) return "health: no error counts in the answer (not checked)";
  const found = (await gh(`/issues?state=all&labels=${ERRORS_LABEL}&per_page=100&sort=created&direction=desc`)).filter((i) => !i.pull_request && ours(i));
  const issue = found.find((i) => i.state === "open") ?? found[0] ?? null;
  let marker = null;
  if (issue) {
    // The newest marker wins, so read from the newest end: start at the last page (the issue's own comment count says which it is) and step back
    // only while a page holds no marker of ours (up to 10 pages). However long the issue grows, the newest marker is on one of the last pages;
    // the issue body is the fallback. (Reading oldest first and stopping at 10 pages missed it past 1000 comments.)
    const last = Math.max(1, Math.ceil((typeof issue.comments === "number" ? issue.comments : 0) / 100));
    const read = (t) => { const m = MARKER.exec(t ?? ""); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; /* an unreadable marker is no baseline */ } };
    for (let page = last; page >= Math.max(1, last - 9) && !marker; page--) {
      const c = await gh(`/issues/${issue.number}/comments?per_page=100&page=${page}`);
      for (const x of c.filter(ours)) marker = read(x.body) ?? marker;
    }
    marker ??= read(issue.body);
  }
  const rise = healthRise({ health, marker, now });
  const line = `health: crashes ${rise.now.crashes} (+${rise.delta.crashes}), browser errors ${rise.now.clientErrors} (+${rise.delta.clientErrors})`;
  if (!rise.rose) return `${line}; nothing to report`;
  const body = errorsReport({ rise, health, checked: now });
  if (dry) return `${line}\n${body}\nDRY_RUN: no issue touched.`;
  if (issue?.state === "open") { await send("POST", `/issues/${issue.number}/comments`, { body }); return `${line}; commented on #${issue.number}`; }
  const i = await send("POST", "/issues", { title: ERRORS_TITLE, body, labels: [ERRORS_LABEL] });
  return `${line}; opened #${i.number}`;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || "imburk/hextable", token = process.env.GITHUB_TOKEN, dry = process.env.DRY_RUN === "1";
  const gh = async (path, init = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { accept: "application/vnd.github+json", "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }), "x-github-api-version": "2022-11-28", "user-agent": "hextable-live-check" } });
    if (!r.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} gave ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  };
  const send = (method, path, body) => gh(path, { method, body: JSON.stringify(body) });
  const head = await gh("/commits/main");
  const mainInfo = { sha: head.sha, when: new Date(head.commit.committer.date) };
  const sites = process.env.SITES ? process.env.SITES.split(",").map((s) => { const [name, ...u] = s.split("="); return { name, url: u.join("=") }; }) : DEFAULT_SITES;
  const results = await Promise.all(sites.map(fetchBuild));
  for (const r of results) console.log(`${r.name}: ${r.error ? `ERROR ${r.error}` : r.commit}`);
  const now = new Date(), verdict = decide({ main: mainInfo, results, now, graceMinutes: Number(process.env.GRACE_MINUTES) || 20 });
  console.log(`main head ${mainInfo.sha.slice(0, 7)} is ${verdict.ageMinutes} minutes old; ${verdict.mismatches.length} site(s) differ; stale=${verdict.stale}`);

  // The errors check runs whatever the build check finds, and never fails the job.
  try {
    const fetchHealth = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "cache-control": "no-cache" } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
    console.log(await checkErrors({ gh, send, healthUrl: process.env.HEALTH_URL || DEFAULT_HEALTH, dry, fetchHealth }));
  } catch (err) { console.log(`health: the errors check failed: ${String(err?.message ?? err).slice(0, 200)}`); }
  const open = (await gh("/issues?state=open&per_page=100")).find((i) => !i.pull_request && i.title === TITLE);
  if (verdict.stale) {
    const body = report({ main: mainInfo, ...verdict, now });
    console.log(`\n${body}\n`);
    if (dry) return console.log("DRY_RUN: no issue touched.");
    if (open) { await send("POST", `/issues/${open.number}/comments`, { body }); console.log(`Commented on #${open.number}.`); }
    else { const i = await send("POST", "/issues", { title: TITLE, body }); console.log(`Opened #${i.number}.`); }
    // The job stays red too, so the scheduled run is visible in the Actions list.
    process.exitCode = 1;
  } else if (open && verdict.mismatches.length === 0) {
    if (dry) return console.log(`DRY_RUN: would close #${open.number}.`);
    await send("POST", `/issues/${open.number}/comments`, { body: `Every live site reports main's head \`${mainInfo.sha}\` again (checked ${now.toISOString()}). Closing.` });
    await send("PATCH", `/issues/${open.number}`, { state: "closed", state_reason: "completed" });
    console.log(`Closed #${open.number}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((err) => { console.error(err.stack ?? err); process.exit(1); });
