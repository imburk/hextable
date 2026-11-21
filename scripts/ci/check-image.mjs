// Probes a running Hextable server (the Docker image in CI, or `npm start` locally) the way a player's browser would.
//   node scripts/ci/check-image.mjs <base-url> [expected-commit]
// Checks, in order: GET /api/ping, GET /build.json (its commit starts the expected sha, when one is given), GET / (the game page),
// GET a script the page loads, and a WebSocket to /ws that hosts a table, sends one action and gets the answer.
// Node built-ins only (Node 22 has fetch and WebSocket). Exits 1 on the first failure and says which check and why.
const [base = "http://localhost:8080", expected] = process.argv.slice(2);
const url = (p) => new URL(p, base).href;
const fail = (what, why) => { console.error(`FAIL ${what}: ${why}`); process.exit(1); };
const ok = (what, detail = "") => console.log(`ok   ${what}${detail ? ` (${detail})` : ""}`);
const get = async (what, path, ms = 10_000) => {
  try { return await fetch(url(path), { signal: AbortSignal.timeout(ms) }); }
  catch (err) { return fail(what, `${path} did not answer: ${err.message}`); }
};

let r = await get("ping", "/api/ping");
const ping = await r.json().catch(() => null);
if (r.status !== 200 || ping?.ok !== true) fail("ping", `/api/ping gave ${r.status} ${JSON.stringify(ping)}`);
ok("ping");

r = await get("build.json", "/build.json");
const build = await r.json().catch(() => null);
if (r.status !== 200 || !build) fail("build.json", `/build.json gave ${r.status}`);
if (expected) {
  const want = expected.trim().slice(0, 7).toLowerCase();
  if (String(build.commit).toLowerCase() !== want) fail("build.json", `commit is ${JSON.stringify(build.commit)}, expected ${want} (whole answer: ${JSON.stringify(build)})`);
}
ok("build.json", `commit ${build.commit}`);

r = await get("game page", "/");
const page = await r.text();
if (r.status !== 200 || !/<html/i.test(page) || !/<script/i.test(page)) fail("game page", `/ gave ${r.status} and ${page.length} bytes that do not look like the game page`);
ok("game page", `${page.length} bytes`);
const script = /<script[^>]+src=["']([^"']+)["']/i.exec(page)?.[1];
if (!script) fail("game page", "the page loads no script");
r = await get("game script", script);
if (r.status !== 200 || (await r.text()).length < 100) fail("game script", `${script} gave ${r.status}`);
ok("game script", script);

// Host a table, then send one action (a chronicle entry) and wait for the update that carries it.
const wsUrl = url("/ws").replace(/^http/, "ws");
await new Promise((resolve) => {
  const ws = new WebSocket(wsUrl);
  let stage = "connecting";
  const timer = setTimeout(() => fail("websocket", `timed out while ${stage}`), 15_000);
  const done = () => { clearTimeout(timer); ws.close(); resolve(); };
  ws.onerror = () => fail("websocket", `could not connect to ${wsUrl}`);
  ws.onopen = () => { stage = "waiting for the host answer"; ws.send(JSON.stringify({ t: "host", name: "CI" })); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "error") fail("websocket", `server said: ${m.error}`);
    if (m.t === "welcome") { if (m.role !== "dm") fail("websocket", `host got role ${m.role}`); stage = "waiting for the first state"; }
    else if (m.t === "update" && stage === "waiting for the first state") {
      stage = "waiting for the answer to an action";
      ws.send(JSON.stringify({ t: "act", action: { type: "chronicle", title: "CI check" } }));
    } else if (m.t === "update" && stage === "waiting for the answer to an action") {
      if (m.events?.[0]?.type !== "chronicle") fail("websocket", `the action's answer was ${JSON.stringify(m).slice(0, 200)}`);
      ok("websocket", "hosted a table, one action answered");
      done();
    }
  };
});
console.log("All checks passed.");
