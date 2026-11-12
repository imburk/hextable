// Browser smoke test: `npm run smoke`. Not part of `npm test`.
//
// Builds the game, starts the table server on a free port, and drives the real page in headless
// Chromium: solo play at desktop size and at phone size with touch (move, undo, tracker, a fight to
// the end of round 1, the DM panel, the map editor, quick entry, the character sheet), then a
// multiplayer pass with two browser contexts (host, a phone joining, being let in, claiming a
// character, moving it, the DM's copy following).
//
// Every step has an expected effect on `window.hextable.state`. The run fails (exit 1) on any page
// error, console error or step that does not do what it should, and says which step. Playwright is
// not a dependency: it is looked up in the global node_modules, and if it is not there the run is
// skipped with exit 0 (CI has no browser).
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

let chromium;
try {
  const req = createRequire(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/');
  ({ chromium } = req('playwright'));
} catch {
  console.log('smoke: skipped: playwright not found (install it globally to run the browser smoke test)');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => {
  const s = createServer().once('error', rej).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});

// ---------- server: build, start, and always stop the one we started ----------
let server = null, dataDir = null, browser = null;
function stopServer() {
  if (server && server.exitCode === null) { try { process.kill(server.pid); } catch { /* already gone */ } }
  if (dataDir) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ } dataDir = null; }
}
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });

async function startServer() {
  execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'ignore' });
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'hextable-smoke-'));
  server = spawn(process.execPath, ['packages/server/src/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('the table server exited at start');
    try { if ((await fetch(url + 'api/ping')).ok) return url; } catch { /* not listening yet */ }
    await sleep(100);
  }
  throw new Error('the table server did not answer');
}

// ---------- steps and errors ----------
const failures = [];
class Run {
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
async function scenario(label, fn) {
  console.log(label);
  const run = new Run(label);
  try { await fn(run); }
  catch (err) {
    const msg = `FAIL [${label}] step "${run.step}": ${String(err.message).split('\n')[0]}`;
    console.log('  ' + msg);
    failures.push(msg);
  }
}

// ---------- page helpers ----------
const wait = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout });
const state = (page, fn, arg) => page.evaluate(`(${fn})(window.hextable.state, ${JSON.stringify(arg ?? null)})`);
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getClientRects().length > 0; }, sel);
const waitShown = (page, sel, on = true, timeout = 5000) =>
  wait(page, ([s, want]) => { const e = document.querySelector(s); return (!!e && !e.hidden && e.getClientRects().length > 0) === want; }, [sel, on], timeout);

async function open(page, url) {
  await page.goto(url);
  await waitShown(page, '#lobby');
}
async function playSolo(page) {
  await page.click('#lobby-solo');
  await wait(page, () => window.hextable?.state?.entities);
}
// Let the camera stop moving: the same screen point twice in a row.
async function settle(page, id) {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate((i0) => { const e = window.hextable.state.entities[i0]; const p = e && window.hextable.R.screenOf(e.pos); return JSON.stringify(p && [Math.round(p.x), Math.round(p.y)]); }, id);
    if (now === last) return;
    last = now; await sleep(150);
  }
}
const tapAt = (page, touch, x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const onCanvas = (page, x, y) => page.evaluate(([x0, y0]) => document.elementFromPoint(x0, y0)?.id === 'gl', [x, y]);
const closePanels = async (page) => { for (const id of ['dm', 'sheet', 'log']) if (await shown(page, `#${id}`)) await page.click(`#${id} .close`); };

// Select a character by its chip and move it one hex by tapping the map. Returns the new position.
async function selectAndMove(page, touch, id, name) {
  await closePanels(page);
  await page.click(`#party button:has-text("${name}")`);
  await wait(page, (i) => document.querySelector('#card') && !document.querySelector('#card').hidden, id);
  const from = await state(page, (S, i) => S.entities[i].pos, id);
  for (let attempt = 0; attempt < 6; attempt++) {
    await settle(page, id);
    const dir = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][attempt];
    const pt = await page.evaluate(([i, d]) => { const e = window.hextable.state.entities[i]; return window.hextable.R.screenOf({ q: e.pos.q + d[0], r: e.pos.r + d[1], z: e.pos.z }); }, [id, dir]);
    if (!pt || pt.x < 5 || pt.y < 5 || !(await onCanvas(page, pt.x, pt.y))) continue;    // off screen or under a panel: try another side
    await tapAt(page, touch, pt.x, pt.y);
    try {
      await wait(page, ([i, f]) => { const p = window.hextable.state.entities[i].pos; return p.q !== f.q || p.r !== f.r; }, [id, from], 2500);
      return await state(page, (S, i) => S.entities[i].pos, id);
    } catch { /* that hex was not open to us: try the next */ }
  }
  throw new Error(`${name} did not move after tapping the map`);
}

// ---------- solo ----------
async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const dump = () => state(page, (S) => JSON.stringify(S));

      await run.do('open the lobby and play solo', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
      });

      let before, moved, start;
      await run.do('move a character by tapping the map', async () => {
        before = await dump();
        start = await state(page, (S) => S.entities.fighter.pos);
        moved = await selectAndMove(page, touch, 'fighter', 'Brenna');
        const now = await state(page, (S) => ({ pos: S.entities.fighter.pos, tl: S.timeline.length }));
        if (now.pos.q === start.q && now.pos.r === start.r) throw new Error('the character is where it was');
      });

      await run.do('undo the move with the Undo button', async () => {
        await closePanels(page);
        await wait(page, () => { const b = document.getElementById('btn-undo'); return !b.hidden && !b.disabled; });
        await page.click('#btn-undo');
        await wait(page, (p) => { const q = window.hextable.state.entities.fighter.pos; return q.q === p.q && q.r === p.r; }, start);
        const after = await dump();
        if (after !== before) throw new Error('undo did not give back exactly the game as it was');
      });

      await run.do('open and close the tracker', async () => {
        await page.click('#btn-tracker');
        await waitShown(page, '#tracker');
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li').length);
        if (rows < 4) throw new Error(`the tracker lists ${rows} characters, expected the party`);
        await page.click('#tr-close');
        await waitShown(page, '#tracker', false);
      });

      await run.do('start a fight in the middle of the field', async () => {
        await page.click('#btn-dm');
        await waitShown(page, '#dm');
        await page.click('#dm-start');
        await wait(page, () => window.hextable.mode.kind === 'encounter');
        await closePanels(page);
        // Look at the middle of the field, far enough out that party and monsters are both in the arena.
        const pt = await page.evaluate(async () => {
          const H = await import('./shared/hex.js'), R = window.hextable.R, w = H.toWorld({ q: -1, r: 1 });
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 30;
          await new Promise((r) => setTimeout(r, 600));
          return R.screenOf({ q: -1, r: 1, z: 0 });
        });
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('could not find the middle of the field on screen');
        await tapAt(page, touch, pt.x, pt.y);
        await wait(page, () => !!window.hextable.state.encounter);
        const n = await state(page, (S) => S.encounter.order.length);
        if (n < 5) throw new Error(`only ${n} creatures are in the fight`);
      });

      await run.do('play the fight to the end of round 1', async () => {
        const deadline = Date.now() + 120000;
        let monsterTurns = 0, last = '';
        for (;;) {
          const s = await state(page, (S) => S.encounter && ({ round: S.encounter.round, turn: S.encounter.turn, cur: S.encounter.order[S.encounter.turn]?.id, kind: S.entities[S.encounter.order[S.encounter.turn]?.id]?.kind, name: S.entities[S.encounter.order[S.encounter.turn]?.id]?.name }));
          if (!s) throw new Error('the fight ended before round 2');
          if (s.round >= 2) break;
          if (Date.now() > deadline) throw new Error(`still in round ${s.round} after two minutes (turn of ${s.name})`);
          const key = `${s.round}/${s.turn}`;
          if (key !== last) { last = key; if (s.kind === 'npc') monsterTurns++; }
          if (s.kind === 'pc') {
            await closePanels(page);
            await page.click(`#party button:has-text("${s.name}")`);
            await waitShown(page, '#btn-end');
            await page.click('#btn-end');
          }
          await sleep(250);
        }
        if (!monsterTurns) throw new Error('no monster took a turn');
      });

      await run.do('open the DM panel and end the fight', async () => {
        await closePanels(page);
        await page.click('#btn-dm');
        await waitShown(page, '#dm');
        await page.click('#dm-end');
        await wait(page, () => window.hextable.state.encounter === null);
        await page.click('#dm .close');
      });

      await run.do('open the map editor, paint one tile and leave it', async () => {
        await closePanels(page);
        await page.click('#btn-dm');
        await waitShown(page, '#dm');
        await page.click('#dm-edit');
        await waitShown(page, '#editor');
        await page.waitForSelector('#ed-terrain button', { state: 'attached' });
        await sleep(500);
        // Find a tile on screen that the editor panel does not cover, and a terrain it is not already.
        const target = await page.evaluate(async () => {
          const H = await import('./shared/hex.js'), R = window.hextable.R, S = window.hextable.state;
          const lv = S.map.levels.find((l) => l.z === 0) ?? S.map.levels[0];
          const terrains = [...document.querySelectorAll('#ed-terrain button')].map((b) => b.dataset.t);
          const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
          for (let y = h * 0.2; y < h * 0.9; y += 24) for (let x = w * 0.15; x < w * 0.85; x += 24) {
            if (document.elementFromPoint(x, y)?.id !== 'gl') continue;
            const hex = R.planeHex(x, y, lv.z), tile = hex && lv.tiles[H.col(hex)];
            if (tile) return { x, y, col: H.col(hex), level: lv.id, was: tile.t, terrain: terrains.find((t) => t !== tile.t) };
          }
          return null;
        });
        if (!target) throw new Error('found no tile to paint on screen');
        await page.click(`#ed-terrain button[data-t="${target.terrain}"]`);
        await tapAt(page, touch, target.x, target.y);
        await wait(page, (t) => window.hextable.state.map.levels.find((l) => l.id === t.level).tiles[t.col].t === t.terrain, target);
        await page.click('#ed-done');
        await waitShown(page, '#editor', false);
        const still = await state(page, (S, t) => S.map.levels.find((l) => l.id === t.level).tiles[t.col].t, target);
        if (still !== target.terrain) throw new Error('the painted tile did not stay');
      });

      await run.do('open quick entry and close it', async () => {
        await closePanels(page);
        await page.click('#btn-dm');
        await waitShown(page, '#dm');
        await page.click('#qe-add');
        await waitShown(page, '#qe');
        await page.click('#qe-close');
        await waitShown(page, '#qe', false);
        await closePanels(page);
      });

      await run.do('open the character sheet and roll a skill', async () => {
        await closePanels(page);
        await page.click('#party button:has-text("Brenna")');
        await page.click('#btn-sheet');
        await waitShown(page, '#sheet');
        const n = await state(page, (S) => S.timeline.length);
        await page.click('#sheet-body [data-skill="athletics"]');
        await wait(page, (k) => window.hextable.state.timeline.length > k && window.hextable.state.timeline.at(-1).type === 'check', n);
        await page.click('#sheet .close');
      });
    } finally { await ctx.close(); }
  });
}

// ---------- multiplayer ----------
async function multiplayer(browser, url) {
  await scenario('multiplayer: host on a desktop, a phone joins', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let code;

      await run.do('host a table', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM');
        await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
      });

      await run.do('join from the phone and wait to be let in', async () => {
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player');
        await phone.fill('#lobby-code', code);
        await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        const s = await state(phone, (S) => S);
        if (s) throw new Error('the phone was given a game before being let in');
      });

      await run.do('the DM lets the phone in', async () => {
        await host.click('#btn-dm');
        await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await host.click('#dm .close');
      });

      let id, name;
      await run.do('the phone claims a character', async () => {
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(phone, (i) => !!window.hextable.state.entities[i].owner, id);
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });

      await run.do('the phone moves it and the DM sees it move', async () => {
        const pos = await selectAndMove(phone, true, id, name);
        await wait(host, ([i, p]) => { const q = window.hextable.state.entities[i].pos; return q.q === p.q && q.r === p.r && q.z === p.z; }, [id, pos]);
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// ---------- main ----------
try {
  console.log('smoke: building and starting the table server');
  const url = await startServer();
  browser = await chromium.launch({ args: ARGS });
  await solo(browser, url, 'solo at 1280x800', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'solo at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await multiplayer(browser, url);
} catch (err) {
  failures.push(`smoke could not run: ${err.message}`);
} finally {
  await browser?.close().catch(() => {});
  stopServer();
}
if (failures.length) { console.log(`\nsmoke: FAILED\n${failures.map((f) => '  ' + f).join('\n')}`); process.exit(1); }
console.log('\nsmoke: all steps passed');
