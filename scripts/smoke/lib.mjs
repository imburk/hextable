// Shared helpers for the smoke passes (scripts/smoke.mjs runs them): the table server, the step runner, page helpers.
// Everything a pass needs from more than one file lives here; a helper only one pass uses stays in that pass's file.
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const freePort = () => new Promise((res, rej) => {
  const s = createServer().once('error', rej).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});

// ---------- server: build, start, and always stop the one we started ----------
export let server = null, dataDir = null;
export function stopServer() {
  if (server && server.exitCode === null) { try { process.kill(server.pid); } catch { /* already gone */ } }
  if (dataDir) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ } dataDir = null; }
}
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });

export async function startServer() {
  execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'ignore' });
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'hextable-smoke-'));
  // The server allows 5 hosted tables an hour per address (limits.js); a full run hosts more than that from one address.
  server = spawn(process.execPath, ['packages/server/src/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, LIMIT_HOSTS: '1000' }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('the table server exited at start');
    try { if ((await fetch(url + 'api/ping')).ok) return url; } catch { /* not listening yet */ }
    await sleep(100);
  }
  throw new Error('the table server did not answer');
}

// ---------- steps and errors ----------
export const failures = [];
export class Run {
  constructor(label) { this.label = label; this.step = 'start'; this.problems = []; }
  watch(page, who = '') {
    page.on('pageerror', (e) => this.problems.push(`page error${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') this.problems.push(`console error${who}: ${m.text()}`); });
  }
  // Runs one step. Throws (ending this run) if the step fails or any page or console error appeared.
  async do(name, fn) {
    this.step = name;
    await fn();
    await sleep(60);
    if (this.problems.length) throw new Error(this.problems.join('; '));
    console.log(`  ok   ${name}`);
  }
}
export async function scenario(label, fn) {
  console.log(label);
  const run = new Run(label);
  try { await fn(run); }
  catch (err) {
    const msg = `FAIL [${label}] step "${run.step}": ${process.env.SMOKE_VERBOSE ? String(err.message).split('\n').slice(0, 14).join(' | ') : String(err.message).split('\n')[0]}`;
    console.log('  ' + msg);
    failures.push(msg);
  }
}

// ---------- page helpers ----------
export const wait = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
export const state = (page, fn, arg) => page.evaluate(`(${fn})(window.hextable.state, ${JSON.stringify(arg ?? null)})`);
export const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
export const waitShown = (page, sel, on = true, timeout = 5000) =>
  wait(page, ([s, want]) => { const e = document.querySelector(s); return (!!e && !e.hidden && e.getClientRects().length > 0) === want; }, [sel, on], timeout);

// The lobby starts the valley on squares on a first visit (nothing remembered, `hextable.valleyGrid`). Every pass that starts from the
// lobby and expects the hex valley is served here, in one place: before the page loads, a device with no remembered choice is given
// hexes (a choice made by a tap is kept, so a reload does not undo it). `grid: 'square'` remembers squares; `grid: null` leaves the
// device as a first visit, which is what the pass about the lobby's own default needs.
export async function open(page, url, { grid = 'hex' } = {}) {
  if (grid) await page.context().addInitScript(([k, g]) => { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, g); } catch { /* storage unavailable */ } }, ['hextable.valleyGrid', grid]);
  await page.goto(url);
  await waitShown(page, '#lobby');
}
// Open a tab of the action panel by tapping it, and wait until its rows are on screen. The ids: explore, attacks, bonus, move, features, reactions, and `all` (the spell buttons, until T4b).
export async function panelTab(page, id) {
  const tab = `#ap-tab-${id}`, pane = id === 'all' ? '#ap-all' : `#ap-${id}`;
  await waitShown(page, tab, true, 8000);
  if ((await page.getAttribute(tab, 'aria-selected')) !== 'true') await page.click(tab);
  await wait(page, (t) => document.querySelector(t)?.getAttribute('aria-selected') === 'true', tab);
  await waitShown(page, pane, true, 8000);
}
// A row of an open tab by its visible name: `#ap-<tab> [data-row]` with that text. Greyed rows are rows too.
export const rowOf = (tab, text) => `#ap-${tab} [data-row]:has-text("${text}")`;
export async function playSolo(page) {
  await page.click('#lobby-solo');
  await wait(page, () => window.hextable?.state?.entities);
}
// Let the camera stop moving: the same screen point twice in a row.
export async function settle(page, id) {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate((i0) => { const e = window.hextable.state.entities[i0]; const p = e && window.hextable.R.screenOf(e.pos); return JSON.stringify(p && [Math.round(p.x), Math.round(p.y)]); }, id);
    if (now === last) return;
    last = now; await sleep(150);
  }
}
export const tapAt = (page, touch, x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
export const onCanvas = (page, x, y) => page.evaluate(([x0, y0]) => document.elementFromPoint(x0, y0)?.id === 'gl', [x, y]);
// The drawer holds every panel (docs/specs/table-ui.md, Decision 2): open it on a tab, close it.
export const TAB_BUTTON = { handouts: '#btn-handouts' };
// The drawer can be closing by itself (a fight starting closes it) when we look: then its close button is already gone, and what we want is that it ends hidden.
export const closeMenu = async (page) => { if (await shown(page, '#drawer')) { await page.click('#drawer-close', { timeout: 3000 }).catch(() => {}); await waitShown(page, '#drawer', false); } };
export const closePanels = closeMenu;
export const openTab = async (page, tab) => {
  if (!(await shown(page, '#drawer'))) { await page.click('#btn-menu'); await waitShown(page, '#drawer'); }
  await page.click(TAB_BUTTON[tab] ?? `#tab-${tab}`);
  await waitShown(page, `#${{ turns: 'tracker' }[tab] ?? tab}`);
};

// Select a character by its chip and move it one hex by tapping the map. Returns the new position.
export async function selectAndMove(page, touch, id, name) {
  await closePanels(page);
  await page.click(`#party button:has-text("${name}")`);
  await wait(page, (i) => document.querySelector('#card') && !document.querySelector('#card').hidden, id);
  const from = await state(page, (S, i) => S.entities[i].pos, id);
  for (let attempt = 0; attempt < 6; attempt++) {
    await settle(page, id);
    const dir = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][attempt];
    // A hex with somebody in it is skipped: a tap there selects them instead (the party stands side by side on a stock map).
    const pt = await page.evaluate(([i, d]) => { const S = window.hextable.state, e = S.entities[i], q = e.pos.q + d[0], r = e.pos.r + d[1];
      if (Object.values(S.entities).some((o) => o.pos && o.pos.q === q && o.pos.r === r)) return null;
      return window.hextable.R.screenOf({ q, r, z: e.pos.z }); }, [id, dir]);
    if (!pt || pt.x < 5 || pt.y < 5 || !(await onCanvas(page, pt.x, pt.y))) continue;    // off screen or under a panel: try another side
    await page.click(`#party button:has-text("${name}")`);                              // still the one selected
    await tapAt(page, touch, pt.x, pt.y);
    try {
      await wait(page, ([i, f]) => { const p = window.hextable.state.entities[i].pos; return p.q !== f.q || p.r !== f.r; }, [id, from], 2500);
      return await state(page, (S, i) => S.entities[i].pos, id);
    } catch { /* that hex was not open to us: try the next */ }
  }
  throw new Error(`${name} did not move after tapping the map`);
}


// The DM sets the table to throw dice, puts `pc` (or any living character) beside a living foe,
// starts a fight there and ends turns until it is that character's. Runs on the DM's page; `watch`
// is the page whose state shows the turn (the DM's, or a player's). Returns { pc, foe }.
export async function diceDuel(dm, watch, want = null) {
  const idle = (p) => wait(p, () => window.hextable.waiting === 0, null, 20000);
  const setup = await dm.evaluate((w) => {
    const h = window.hextable;
    document.getElementById('dm-auto').checked = false;
    if (h.state.encounter) h.act({ type: 'endEncounter' });
    h.act({ type: 'setting', key: 'diceThrow', value: 'throw' });
    const S = h.state, alive = (e) => e.hp > 0 && !e.dead;
    const pc = w ? S.entities[w] : Object.values(S.entities).find((e) => e.kind === 'pc' && alive(e) && e.attacks?.some((a) => a.type === 'melee'));
    const foe = Object.values(S.entities).find((e) => e.side === 'foe' && alive(e) && !e.hidden);
    if (pc.hp <= 0) h.act({ type: 'setHp', actor: pc.id, hp: pc.maxHp });
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
      h.act({ type: 'place', actor: pc.id, to: { q: foe.pos.q + dq, r: foe.pos.r + dr } });
      const p = h.state.entities[pc.id].pos;
      if (Math.max(Math.abs(p.q - foe.pos.q), Math.abs(p.r - foe.pos.r), Math.abs(p.q + p.r - foe.pos.q - foe.pos.r)) === 1) break;
    }
    h.act({ type: 'startEncounter', center: foe.pos });
    return { pc: pc.id, foe: foe.id };
  }, want);
  await idle(dm);
  for (let i = 0; i < 30; i++) {
    await idle(watch);
    const cur = await dm.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id; });
    if (cur === setup.pc) break;
    await dm.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
    await idle(dm);
  }
  await wait(watch, (p) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === p; }, setup.pc, 20000);
  return setup;
}


// Still: no dice in the air and no beats left to play. `setPace` sets a page's pace at once.
export const calm = (p, ms = 15000) => wait(p, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, ms);
export const setPace = (p, v) => p.evaluate((x) => { localStorage.setItem('hextable.pace', JSON.stringify(x)); window.hextable.timeline.setPace(window.hextable.pace()); }, v);


// ---------- seeds and places ----------
// SMOKE_SEED=<n> plays the valley of seed n in every context the runner makes (scripts/smoke.mjs calls this from its newContext): the game takes
// a random seed per solo game (transport.js), so a map a step failed on can be replayed. Only the Math.random() that transport.js makes the seed
// with is bent; the page's other calls stay random. A hosted table takes the server's seed, which this cannot set.
export const seeded = (ctx) => (process.env.SMOKE_SEED
  ? ctx.addInitScript((n) => { const real = Math.random; Math.random = () => (new Error().stack.includes('transport.js') ? n / 1e9 + 1e-10 : real()); }, Number(process.env.SMOKE_SEED))
  : null);

// The hexes near a place where the engine takes a spawn of `tpl` (a monster id), nearest first, asked of the page's own engine on this map. Never a
// fixed offset: each game's map is random, and a tree, water or another creature on the hex refuses the spawn. Options:
//   near: { q, r } or a creature id, the centre of the search (a creature's own hex is skipped); min/radius: distance from it in hexes (default 1..6);
//   sightFrom: a creature id that must have a line (not blocked by walls) to the new creature; range: feet from `sightFrom` (or from `near`) at most;
//   within: { center, radius }, the new creature must lie inside (a fight's arena); name: a name for the spawn, passed on.
// Returns { spots: [hex...], error }, `error` being the engine's own last refusal when no hex took it.
export const spotsFor = (page, tpl, opts = {}) => page.evaluate(async ([t, o]) => {
  const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'), { inSight } = await import('./shared/sight.js');
  const S = window.hextable.state, G = gridOf(S.map), DM = { role: 'dm', userId: 'dm' };
  const at = (v) => (typeof v === 'string' ? S.entities[v].pos : v);
  const c = at(o.near), from = o.sightFrom ? S.entities[o.sightFrom] : null, out = [];
  let error = null;
  for (const h of G.range(c, o.radius ?? 6)) {
    if (G.dist(c, h) < (o.min ?? 1)) continue;
    if (o.within && G.dist(o.within.center, h) > o.within.radius) continue;
    if (o.range != null && G.dist(from ? from.pos : c, h) * 5 > o.range) continue;
    const clone = structuredClone({ ...S, timeline: [] });
    const r = apply(clone, { type: 'spawn', monster: t, at: h, ...(o.name ? { name: o.name } : {}) }, DM);
    if (!r.ok) { error = r.error; continue; }
    if (from && !inSight(clone.map, from.pos, clone.entities[r.events.find((x) => x.type === 'spawned').id].pos)) { error = 'no line of sight'; continue; }
    out.push(h);
  }
  out.sort((a, b) => G.dist(c, a) - G.dist(c, b) || a.r - b.r || a.q - b.q);
  return { spots: out, error };
}, [tpl, opts]);

// Spawns `tpl` on the first hex spotsFor finds and requires the creature to exist afterwards; returns its id. Fails with the game's own words:
// the engine's last refusal when there is no hex, or the table's toast when the spawn was sent and nothing appeared.
export async function spawnNear(page, tpl, opts = {}) {
  const { spots, error } = await spotsFor(page, tpl, opts);
  if (!spots.length) throw new Error(`no hex near ${JSON.stringify(opts.near)} on this map takes a ${tpl}${opts.sightFrom ? ' in sight of ' + opts.sightFrom : ''}: ${error ?? 'none in range'}`);
  const before = await page.evaluate(() => Object.keys(window.hextable.state.entities));
  await page.evaluate(([t, at, n]) => window.hextable.act({ type: 'spawn', monster: t, at, ...(n ? { name: n } : {}) }), [tpl, spots[0], opts.name ?? null]);
  const made = async () => (await page.evaluate((b) => Object.keys(window.hextable.state.entities).filter((k) => !b.includes(k)), before));
  try { await wait(page, (b) => Object.keys(window.hextable.state.entities).some((k) => !b.includes(k)), before, 5000); }
  catch { throw new Error(`the ${tpl} was not made at ${JSON.stringify(spots[0])}: toast "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); }
  return (await made())[0];
}
