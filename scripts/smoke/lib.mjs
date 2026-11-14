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

export async function open(page, url) {
  await page.goto(url);
  await waitShown(page, '#lobby');
}
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
export const closeMenu = async (page) => { if (await shown(page, '#drawer')) { await page.click('#drawer-close'); await waitShown(page, '#drawer', false); } };
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
