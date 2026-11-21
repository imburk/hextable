// Post-deploy check (review R1, #617): is the live site the version that was merged?
//   node scripts/ci/live-check.mjs          (GITHUB_TOKEN and GITHUB_REPOSITORY in the environment, as in Actions)
// Reads the head of main and the commit each live site reports at /build.json. When main's head is older than GRACE_MINUTES (default 20)
// and a site reports a different commit (or does not answer), it opens the issue "Live site is not the merged version" (or adds a
// comment to the one that is open) naming both shas; when every site matches again it comments and closes that issue.
// Node built-ins only. DRY_RUN=1 prints what it would do and touches nothing on GitHub. SITES overrides the list ("name=url,name=url").
import { pathToFileURL } from "node:url";

export const TITLE = "Live site is not the merged version";
export const DEFAULT_SITES = [
  { name: "Railway (table server)", url: "https://hextable-production.up.railway.app/build.json" },
  { name: "GitHub Pages (solo game)", url: "https://imburk.github.io/hextable/build.json" },
];
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
