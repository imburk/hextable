// Browser smoke test: `npm run smoke`. Not part of `npm test`.
//
// Builds the game, starts the table server on a free port, and drives the real page in headless
// Chromium: solo play at desktop size and at phone size with touch (move, undo, tracker, a fight to
// the end of round 1, the DM panel, the map editor, quick entry, the character sheet), then a
// multiplayer pass with two browser contexts (host, a phone joining, being let in, claiming a
// character, moving it, the DM's copy following), and a scene pass (the DM prepares, opens, speaks as an
// NPC, a phone speaks, an undone line goes, the DM steps out; the DM's notes never reach the phone).
//
// Every step has an expected effect on `window.hextable.state`. The run fails (exit 1) on any page
// error, console error or step that does not do what it should, and says which step. Playwright is
// not a dependency: it is looked up in the global node_modules, and if it is not there the run is
// skipped with exit 0 (CI has no browser).
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
    const msg = `FAIL [${label}] step "${run.step}": ${process.env.SMOKE_VERBOSE ? String(err.message).split('\n').slice(0, 14).join(' | ') : String(err.message).split('\n')[0]}`;
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
// The drawer holds every panel (docs/specs/table-ui.md, Decision 2): open it on a tab, close it.
const TAB_BUTTON = { handouts: '#btn-handouts' };
const closeMenu = async (page) => { if (await shown(page, '#drawer')) { await page.click('#drawer-close'); await waitShown(page, '#drawer', false); } };
const closePanels = closeMenu;
const openTab = async (page, tab) => {
  if (!(await shown(page, '#drawer'))) { await page.click('#btn-menu'); await waitShown(page, '#drawer'); }
  await page.click(TAB_BUTTON[tab] ?? `#tab-${tab}`);
  await waitShown(page, `#${{ turns: 'tracker' }[tab] ?? tab}`);
};

// Select a character by its chip and move it one hex by tapping the map. Returns the new position.
async function selectAndMove(page, touch, id, name) {
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
        await openTab(page, 'turns');
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li').length);
        if (rows < 4) throw new Error(`the tracker lists ${rows} characters, expected the party`);
        await closeMenu(page);
      });

      // Before the fight on purpose: a character who is down after the fight cannot roll a check ("X is down"),
      // so rolling after it would depend on the dice. Here the party is whole, whatever the seed.
      await run.do('open the character sheet and roll a skill', async () => {
        await closePanels(page);
        await page.click('#party button:has-text("Brenna")');
        await page.click('#btn-sheet');
        await waitShown(page, '#sheet');
        const n = await state(page, (S) => S.timeline.length);
        await page.click('#sheet-body [data-skill="athletics"]');
        try { await wait(page, (k) => window.hextable.state.timeline.length > k && window.hextable.state.timeline.at(-1).type === 'check', n); }
        catch { throw new Error(`the skill roll did not happen; the game said: "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); }
        await closeMenu(page);
      });

      await run.do('start a fight in the middle of the field', async () => {
        await openTab(page, 'dm');
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
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#dm-end');
        await wait(page, () => window.hextable.state.encounter === null);
        await closeMenu(page);
      });

      await run.do('open the map editor, paint one tile and leave it', async () => {
        await closePanels(page);
        await openTab(page, 'dm');
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
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#qe-add');
        await waitShown(page, '#qe');
        await page.click('#qe-close');
        await waitShown(page, '#qe', false);
        await closePanels(page);
      });

      await run.do('dice: under diceThrow "throw" an armed attack is not applied until it is thrown', async () => {
        await closePanels(page);
        const { pc, foe } = await diceDuel(page, page);
        const before = await state(page, (S) => ({ tl: S.timeline.length, action: S.encounter.budget.action }));
        await page.evaluate(([p, f]) => { const e = window.hextable.state.entities[p]; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
        await waitShown(page, '#dice-tray');
        await sleep(400);
        const armed = await state(page, (S) => ({ tl: S.timeline.length, action: S.encounter.budget.action }));
        if (armed.tl !== before.tl || armed.action !== before.action) throw new Error('the attack was applied before the throw');
        if (touch) await page.locator('#dice-tray .dt-throw').tap(); else await page.click('#dice-tray .dt-throw');
        await waitShown(page, '#dice', true);
        await wait(page, ([p, n]) => window.hextable.state.timeline.length > n && window.hextable.state.timeline.some((e, i) => i >= n && e.type === 'attack' && e.actor === p), [pc, before.tl], 15000);
        if ((await state(page, (S) => S.encounter.budget.action)) !== before.action - 1) throw new Error('the throw did not spend the action');
        await page.evaluate(() => { window.hextable.dice.skip(); window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); window.hextable.act({ type: 'endEncounter' }); });
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.state.encounter, null, 15000);
      });

      // Last, because it replaces the map: the stock maps are drawn as rooms with a cut-away and as a cave (docs/specs/renderer.md).
      await run.do('the stock dungeon is drawn with a cut-away that follows the camera, and the stock cave as a cave', async () => {
        const load = async (id) => { await page.evaluate((m) => window.hextable.ED.stock(m), id); await wait(page, (m) => window.hextable.state.map.id === m, id); await sleep(400); };
        await load('dungeon');
        const walls = await page.evaluate(async () => {
          const R = window.hextable.R, seen = new Set(); R.cam.pitch = 0.95;
          for (const yaw of [0.5, 2.1, 3.6, 5.2]) { R.cam.yaw = yaw; await new Promise((r) => setTimeout(r, 250)); seen.add(R.cutSig); }
          return { levels: R.floorData.length, faces: R.floorData.reduce((n, l) => n + l.walls.length, 0), built: R.wallMesh.n, cuts: seen.size };
        });
        if (!walls.levels || !walls.faces || !walls.built) throw new Error(`the dungeon's walls were not built: ${JSON.stringify(walls)}`);
        if (walls.cuts < 2) throw new Error(`the cut-away did not change as the camera went round: ${JSON.stringify(walls)}`);
        await load('cave');
        const cave = await page.evaluate(() => { const R = window.hextable.R; return { levels: R.floorData.length, built: R.terrain.n, cells: R.floorData.reduce((n, l) => n + l.patches.reduce((m, p) => m + p.cells.length, 0), 0) }; });
        if (cave.levels !== 1 || cave.cells < 100 || cave.built < 5000) throw new Error(`the cave was not built: ${JSON.stringify(cave)}`);
      });

    } finally { await ctx.close(); }
  });
}

// ---------- dice ----------
// The DM sets the table to throw dice, puts `pc` (or any living character) beside a living foe,
// starts a fight there and ends turns until it is that character's. Runs on the DM's page; `watch`
// is the page whose state shows the turn (the DM's, or a player's). Returns { pc, foe }.
async function diceDuel(dm, watch, want = null) {
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

// ---------- the drawer (docs/specs/table-ui.md, Decisions 2 and 3) ----------
// The drawer opens and closes every way the spec lists, at both sizes; the side is a preference; About holds the SRD attribution
// as the SRD gives it; the lobby reaches About before any table; and the tracker lists a fight's turns in the engine's order.
const SRD_TEXT = 'This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
const rectOf = (page, sel) => page.evaluate((x) => { const r = document.querySelector(x).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; }, sel);
async function drawerPass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width < 900;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('the lobby has an About link that opens the drawer above it, with the SRD statement, and closes back to the link', async () => {
        await open(page, url);
        await waitShown(page, '#splash', false, 2000).catch(() => { throw new Error('the splash is still up over the lobby'); });
        await page.click('#lobby-about');
        await waitShown(page, '#drawer'); await waitShown(page, '#about');
        if (!(await page.evaluate(() => { const r = document.getElementById('drawer').getBoundingClientRect(); return document.elementFromPoint(r.left + 40, r.top + 120)?.closest('#drawer') !== null; }))) throw new Error('the drawer is under the lobby');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`About does not carry the SRD statement as given: ${text}`);
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'lobby-about') throw new Error('focus did not return to the About link');
      });
      await run.do('play solo: a burger, a closed drawer, no old panel buttons', async () => {
        await playSolo(page);
        await waitShown(page, '#btn-menu'); await waitShown(page, '#drawer', false);
        for (const id of ['btn-tracker', 'btn-log', 'btn-look', 'btn-dm']) if (await page.$('#' + id)) throw new Error(`#${id} is still on the page`);
        
      });
      await run.do('the burger opens the drawer from the right on Turns, as a dialog, with the party in it', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await sleep(300);
        const r = await rectOf(page, '#drawer');
        if (Math.abs(r.r - r.vw) > 2) throw new Error(`the drawer is not on the right: ${JSON.stringify(r)}`);
        if (r.w > Math.min(0.92 * r.vw, 420) + 1 && phone) throw new Error(`too wide: ${r.w}`);
        if ((await page.getAttribute('#btn-menu', 'aria-expanded')) !== 'true') throw new Error('aria-expanded');
        if ((await page.getAttribute('#drawer', 'role')) !== 'dialog') throw new Error('the drawer is not a dialog over the map');
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li[data-id]').length);
        if (rows < 4) throw new Error(`${rows} rows`);
        const tabs = await page.$$eval('#drawer-tabs [role=tab]:not([hidden])', (b) => b.map((x) => x.firstChild.textContent.trim()));
        if (tabs.join() !== 'Party,Sheet,Log,DM,Settings,About') throw new Error(`tabs: ${tabs}`);
      });
      if (phone) await run.do('on a phone it stops above the dock and the dock stays usable', async () => {
        const d = await rectOf(page, '#drawer'), k = await rectOf(page, '#dock');
        if (d.b > k.t + 1) throw new Error(`the drawer (${d.b}) covers the dock (${k.t})`);
        const hit = await page.evaluate(() => { const r = document.querySelector('#party button').getBoundingClientRect(); return document.elementFromPoint(r.left + 8, r.top + 8)?.closest('#party') !== null; });
        if (!hit) throw new Error('the character chips are not reachable');
      });
      await run.do('the X, Escape and (phone) the scrim or (wide) a click on the map close it, and focus returns to the burger', async () => {
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the burger (X)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the burger (Escape)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        if (phone) await tapAt(page, touch, 12, 300); else await page.mouse.click(300, 300);
        await waitShown(page, '#drawer', false);
        if (!phone) {
          await page.keyboard.press('m'); await waitShown(page, '#drawer');
          await page.keyboard.press('m'); await waitShown(page, '#drawer', false);
        }
      });
      await run.do('a drag away from the side on the header closes it', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.evaluate(() => { const h = document.getElementById('drawer-head'), r = h.getBoundingClientRect(), y = r.top + 20, x = r.left + 60;
          const fire = (t, dx, ms) => h.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x + dx, clientY: y, bubbles: true, isPrimary: true }));
          fire('pointerdown', 0); fire('pointermove', 30); fire('pointermove', 90); fire('pointerup', 90); });
        await waitShown(page, '#drawer', false);
      });
      await run.do('Tab stays inside an open drawer', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('#drawer')))) throw new Error('focus left the drawer');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
      });
      await run.do('arrow keys move along the tabs', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.focus('#tab-turns'); await page.keyboard.press('ArrowRight');
        await wait(page, () => document.getElementById('tab-sheet').getAttribute('aria-selected') === 'true');
        await page.keyboard.press('End');
        await wait(page, () => document.getElementById('tab-about').getAttribute('aria-selected') === 'true');
      });
      await run.do('About holds the SRD statement word for word, the licences and a place for model packs', async () => {
        await waitShown(page, '#about');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`the statement differs: ${text}`);
        const all = await page.$eval('#about', (e) => e.textContent);
        for (const want of ['Hextable contributors', 'three.js authors', 'Model packs', 'Silkscreen', 'Three.js']) if (!all.includes(want)) throw new Error(`About lacks ${want}`);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-about-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('Settings holds the preferences, and the side is one of them: left puts the drawer and the burger on the left', async () => {
        await page.click('#tab-settings'); await waitShown(page, '#settings');
        for (const id of ['set-theme', 'dice-show', 'pace-pick', 'dice-auto-mine', 'set-side', 'set-floors', 'dm-dice-monsters']) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not in Settings`);
        await page.selectOption('#set-side', 'left'); await sleep(400);
        const r = await rectOf(page, '#drawer');
        if (r.l > 2) throw new Error(`not on the left: ${JSON.stringify(r)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.drawerSide'))) !== '"left"') throw new Error('the side was not stored');
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        const b = await rectOf(page, '#btn-menu');
        if (b.l > b.vw / 2) throw new Error('the burger did not move to the left');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-left-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
        await page.click('#tab-settings'); await page.selectOption('#set-side', 'right'); await sleep(400);
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
      });
      await run.do('a theme chosen in Settings applies and is stored; the look of floors is stored too', async () => {
        await openTab(page, 'settings');
        const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        await page.selectOption('#set-theme', 'sunlit');
        const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        if (before === after || (await page.evaluate(() => localStorage.getItem('hextable.theme'))) !== '"sunlit"') throw new Error('the theme did not change');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-sunlit-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
        await page.selectOption('#set-floors', 'hex');
        if ((await page.evaluate(() => localStorage.getItem('hextable.floors'))) !== '"hex"') throw new Error('floors was not stored');
        await page.selectOption('#set-floors', 'rooms'); await page.selectOption('#set-theme', 'classic');
        await closeMenu(page);
      });
      if (!phone) await run.do('pinned, the drawer stays open and the map makes room for it', async () => {
        await openTab(page, 'turns');
        await page.click('#drawer-pin'); await sleep(300);
        const c = await rectOf(page, '#gl'), d = await rectOf(page, '#drawer');
        if (Math.abs(c.w - (c.vw - d.w)) > 2) throw new Error(`the canvas (${c.w}) did not give way to the drawer (${d.w})`);
        if ((await page.getAttribute('#drawer', 'role')) !== 'complementary') throw new Error('a pinned drawer is a landmark, not a dialog');
        await page.mouse.click(300, 300); await sleep(200);
        if (!(await shown(page, '#drawer'))) throw new Error('a click on the map closed a pinned drawer');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-pinned.png` : '/dev/null' }).catch(() => {});
        await page.click('#drawer-pin'); await sleep(300);
        const c2 = await rectOf(page, '#gl');
        if (c2.w !== c2.vw) throw new Error('the canvas did not come back');
        await closeMenu(page);
      });
      await run.do('a reaction question hides the drawer for as long as it is asked, and gives it back after', async () => {
        await openTab(page, 'turns');
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync({ ...h.state, prompt: { waiting: true } }); });
        await waitShown(page, '#drawer', false);
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync(h.state); });
        await waitShown(page, '#drawer');
        await closeMenu(page);
      });
      await run.do('in a fight the tracker lists the turns in the engine\'s order, top to bottom, with initiative and the turn marked', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const h = window.hextable, S = h.state, foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden); h.act({ type: 'startEncounter', center: foe.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await openTab(page, 'turns'); await sleep(300);
        const got = await page.evaluate(() => [...document.querySelectorAll('#tr-list li[data-id]')].map((l) => l.dataset.id));
        const want = await state(page, (S) => S.encounter.order.map((o) => o.id));
        if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`rows ${got} are not the order ${want}`);
        const tops = await page.evaluate(() => [...document.querySelectorAll('#tr-list li')].map((l) => Math.round(l.getBoundingClientRect().top)));
        if (tops.some((t, i) => i && t <= tops[i - 1])) throw new Error('the rows are not stacked top to bottom');
        const now = await page.evaluate(() => { const l = document.querySelector('#tr-list li[aria-current="step"]'); return l?.dataset.id; });
        if (now !== await state(page, (S) => S.encounter.order[S.encounter.turn].id)) throw new Error('the current turn is not marked');
        const inits = await page.evaluate(() => [...document.querySelectorAll('#tr-list .tr-init')].map((x) => x.textContent.trim()));
        const wantInit = await state(page, (S) => S.encounter.order.map((o) => String(o.init)));
        if (JSON.stringify(inits) !== JSON.stringify(wantInit)) throw new Error(`initiative ${inits} is not ${wantInit}`);
        if ((await page.$eval('#tr-title', (e) => e.textContent)) !== 'Round 1') throw new Error('the round');
        if ((await page.$eval('#tab-turns', (e) => e.textContent.trim())) !== 'Turns') throw new Error('the tab is not called Turns in a fight');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-turns-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('a tap on a row selects that creature, and on a phone closes the drawer; the order strip opens it again', async () => {
        const id = await state(page, (S) => S.encounter.order.at(-1).id);
        if (phone) await page.tap(`#tr-list li[data-id="${id}"] .tr-main`); else await page.click(`#tr-list li[data-id="${id}"] .tr-main`);
        await wait(page, (i) => window.hextable.state && document.querySelector('#c-name')?.textContent === window.hextable.state.entities[i].name, id);
        if (phone) await waitShown(page, '#drawer', false);
        else { await closeMenu(page); }
        await page.click('#order li'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

// What a player's tracker may show: a DM and a phone player, a fight with a creature the party cannot see taking its turn.
async function drawerTable(browser, url) {
  await scenario('the tracker at a table: a player sees what the view sent and no more', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let code;
      await run.do('host, join from the phone, let it in', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        await b.click();
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.owner));
      });
      let secret;
      await run.do('a fight with an invisible creature that the party cannot see', async () => {
        secret = await host.evaluate(async () => {
          const h = window.hextable; document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'sight', value: 'light' });
          const S = h.state, known = new Set(Object.keys(S.entities)), foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden);
          h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: foe.pos.q + 1, r: foe.pos.r } });
          let sp = null;
          for (let i = 0; i < 40 && !sp; i++) { await new Promise((r) => setTimeout(r, 100)); sp = Object.values(h.state.entities).find((e) => !known.has(e.id)); }
          if (!sp) return null;
          h.act({ type: 'condition', actor: sp.id, condition: 'invisible' });
          h.act({ type: 'place', actor: 'fighter', to: { q: foe.pos.q - 1, r: foe.pos.r } });       // a party member in the fight, or it ends at once
          h.act({ type: 'startEncounter', center: foe.pos });
          return { id: sp.id, name: sp.name };
        });
        if (!secret) throw new Error('no creature was made');
        await wait(phone, () => !!window.hextable.state.encounter);
        if (await state(phone, (S, i) => !!S.entities[i], secret.id)) throw new Error('the phone was sent the invisible creature');
      });
      await run.do('the DM\'s tracker lists everyone in order, the invisible one too; the phone\'s lists only what it was sent', async () => {
        await openTab(host, 'turns'); await openTab(phone, 'turns'); await sleep(300);
        const dmRows = await host.evaluate(() => [...document.querySelectorAll('#tr-list li[data-id]')].map((l) => l.dataset.id));
        const dmOrder = await state(host, (S) => S.encounter.order.map((o) => o.id));
        if (JSON.stringify(dmRows) !== JSON.stringify(dmOrder)) throw new Error('the DM tracker is not the order');
        if (!dmRows.includes(secret.id)) throw new Error(`the DM's tracker lacks the invisible creature ${secret.id}: ${dmRows}`);
        const html = await phone.$eval('#tracker', (e) => e.innerHTML);
        if (html.includes(`data-id="${secret.id}"`)) throw new Error('the invisible creature\'s id reached the phone\'s tracker');
        const rows = await phone.evaluate(() => [...document.querySelectorAll('#tr-list li')].map((l) => ({ id: l.dataset.id ?? null, text: l.textContent.replace(/\s+/g, ' ').trim() })));
        const order = await state(phone, (S) => S.encounter.order);
        if (rows.length !== order.length) throw new Error(`the phone's tracker has ${rows.length} rows for ${order.length} turns`);
        const names = await state(phone, (S) => Object.values(S.entities).map((e) => e.name));
        if (!names.includes(secret.name)) { /* a name shared with a visible goblin is fine: the id is what is checked above */ }
        const foeNums = await phone.$$eval('#tr-list li[data-side="foe"] .tr-hp span:last-child', (x) => x.map((e) => e.textContent.trim()));
        if (foeNums.some((t) => /\d/.test(t))) throw new Error(`a number for a foe reached the phone: ${foeNums}`);
        await phone.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-table-phone.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('when the invisible creature takes its turn the phone has one ghost row and no name', async () => {
        for (let i = 0; i < 30; i++) {
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn].id ?? null; });
          if (cur === null) throw new Error('the fight ended before the invisible creature had a turn');
          if (cur === secret.id) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(host, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(phone, () => window.hextable.state.encounter.order.some((o) => o.someone), null, 10000);
        await sleep(400);
        const ghosts = await phone.$$eval('#tr-list li.tr-ghost', (x) => x.map((l) => ({ text: l.textContent.replace(/\s+/g, ' ').trim(), now: l.classList.contains('now'), tag: l.querySelector('button') ? 'button' : 'none' })));
        if (ghosts.length !== 1 || !/unseen/.test(ghosts[0].text) || !ghosts[0].now || ghosts[0].tag !== 'none') throw new Error(`the ghost row: ${JSON.stringify(ghosts)}`);
        const live = await phone.$eval('#drawer-live', (e) => e.textContent);
        if (!/unseen/.test(live) || live.includes(secret.name.split(' ')[0] + '\'s')) throw new Error(`the live region said: ${live}`);
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// ---------- the renderer interface (docs/specs/renderer.md, decision 7; R5) ----------
// The page loads with the renderer that draws nothing (`?renderer=none`, or the device preference `hextable.renderer`), the table is
// hosted and a character moves by action: the UI and the rules play without a picture, and nothing throws. Then the default renderer
// reports stats(). The rest of this script reads the default renderer's insides through window.hextable.R (R.cam, R.floorData,
// R.actors, R.screenOf ...): that is the smoke script's test surface and the app does not use it; test/renderer.test.js checks the app.
async function interfacePass(browser, url, label, opts, how) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts, { pace: 'instant' });
    if (how === 'pref') await ctx.addInitScript(() => { try { localStorage.setItem('hextable.renderer', JSON.stringify('none')); } catch { /* storage unavailable */ } });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('load with the empty renderer', async () => {
        await open(page, how === 'pref' ? url : `${url}?renderer=none`);
      });
      await run.do('host a table and play', async () => {
        await page.fill('#lobby-name', 'Smoke DM');
        await page.click('#lobby-host');
        await wait(page, () => window.hextable?.state?.entities?.fighter);
        const name = await page.evaluate(() => window.hextable.R.constructor.name);
        if (name !== 'EmptyRenderer') throw new Error(`the renderer is ${name}, not the empty one`);
        const s = await page.evaluate(() => JSON.stringify(window.hextable.R.stats()));
        if (!/"drawCalls":0/.test(s)) throw new Error(`stats of the empty renderer: ${s}`);
      });
      await run.do('a character moves by action and the game answers', async () => {
        const from = await state(page, (S) => S.entities.fighter.pos);
        for (const d of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
          await page.evaluate(([f, d0]) => window.hextable.act({ type: 'move', actor: 'fighter', to: { q: f.q + d0[0], r: f.r + d0[1], z: f.z } }), [from, d]);
          await sleep(150);
          const now = await state(page, (S) => S.entities.fighter.pos);
          if (now.q !== from.q || now.r !== from.r) return;
        }
        throw new Error('the character did not move in any direction');
      });
      await run.do('the page works without a picture: tracker, sheet, undo, the editor, a fight', async () => {
        await closePanels(page);
        await openTab(page, 'turns'); await closeMenu(page);
        await page.click('#party button:has-text("Brenna")'); await page.click('#btn-sheet'); await waitShown(page, '#sheet'); await closeMenu(page);
        await wait(page, () => { const b = document.getElementById('btn-undo'); return !b.hidden && !b.disabled; });
        await page.click('#btn-undo');
        await page.evaluate(() => { const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => window.hextable.state.encounter === null);
        await page.evaluate(() => window.hextable.ED.stock('dungeon'));
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
      });
    } finally { await ctx.close(); }
  });
}
async function statsPass(browser, url) {
  await scenario('interface: the default renderer reports stats', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }, { pace: 'instant' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('stats() has frame time, quality, pixel ratio and draw calls', async () => {
        await open(page, url); await playSolo(page); await sleep(1500);
        const s = await page.evaluate(() => window.hextable.R.stats());
        if (!(s.frameMs > 0) || s.quality !== 0 || !(s.pixelRatio >= 1) || !(s.drawCalls > 0)) throw new Error(`stats: ${JSON.stringify(s)}`);
      });
    } finally { await ctx.close(); }
  });
}

// ---------- vendored Three.js (R10) ----------
// A normal page load fetches nothing under vendor/. Then, in the page, the vendored module is imported (gzipped by the
// server), a WebGLRenderer on an offscreen canvas draws a cube, and GLTFLoader and SkeletonUtils import.
async function threePass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const asked = [], got = [];
      page.on('request', (r) => asked.push(r.url()));
      page.on('response', (r) => { if (r.url().includes('/vendor/')) got.push({ url: r.url(), enc: r.headers()['content-encoding'], vary: r.headers()['vary'], status: r.status() }); });
      await run.do('a normal page load and a solo game fetch nothing under vendor/', async () => {
        await open(page, url); await playSolo(page); await sleep(1000);
        const v = asked.filter((u) => u.includes('/vendor/'));
        if (v.length) throw new Error(`the page fetched ${v.join(', ')}`);
      });
      await run.do('the vendored module loads, draws a cube on an offscreen canvas, GLTFLoader and SkeletonUtils import', async () => {
        const r = await page.evaluate(async () => (await import('/three-check.js')).checkThree());
        if (!/^\d+$/.test(String(r.revision))) throw new Error(`revision: ${JSON.stringify(r)}`);
        if (r.pixel[0] < 200 || !(r.drawCalls >= 1)) throw new Error(`result: ${JSON.stringify(r)}`);
        console.log(`       three r${r.revision}, webgl2 ${r.webgl2}, middle pixel ${r.pixel}, ${r.drawCalls} draw call(s)`);
      });
      await run.do('the vendored files came over gzipped', async () => {
        const want = ['three.module.js', 'three.core.js', 'GLTFLoader.js', 'SkeletonUtils.js', 'BufferGeometryUtils.js'];
        for (const f of want) {
          const r = got.find((g) => g.url.endsWith('/' + f));
          if (!r) throw new Error(`${f} was not requested`);
          if (r.status !== 200 || r.enc !== 'gzip' || !/accept-encoding/i.test(r.vary ?? '')) throw new Error(`${f}: ${JSON.stringify(r)}`);
        }
        // and the server sends it plain to a client that does not accept gzip
        const plain = await fetch(url + 'vendor/three/three.module.js', { headers: { 'accept-encoding': 'identity' } });
        if (plain.headers.get('content-encoding')) throw new Error('identity request got a content-encoding');
      });
    } finally { await ctx.close(); }
  });
}

// ---------- the Three.js renderer at parity (R11) ----------
// `?renderer=three` against the default renderer, for the same state and the same camera, on the valley, the stock dungeon and the stock
// cave: where a hex is on the screen (`screenOf`), which hex a tap picks, the plane questions and the axes agree to a pixel or two; the
// game plays on the Three.js renderer (a tap moves a character, a fight starts and ends). Frame times from `stats()` are printed for
// both (software GL here: they only compare the two). SMOKE_SHOTS=<dir> saves a screenshot of each renderer on each map.
const PARITY_PX = 1.5;
async function measureView(page, touch) {
  const info = await page.evaluate(() => {
    const h = window.hextable, R = h.R, S = h.state, pc = Object.values(S.entities).find((e) => e.kind === 'pc'), z = pc.pos.z ?? 0;
    const hexes = []; for (let dq = -4; dq <= 4; dq++) for (let dr = -4; dr <= 4; dr++) hexes.push({ q: pc.pos.q + dq, r: pc.pos.r + dr, z });
    const W = innerWidth, Hh = innerHeight, pts = [];
    for (const fx of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) pts.push([Math.round(W * fx), Math.round(Hh * fy)]);
    return {
      hexes, pts, canvas: pts.map(([x, y]) => document.elementFromPoint(x, y)?.id === 'gl'),
      screen: hexes.map((hx) => R.screenOf(hx)), plane: pts.map(([x, y]) => [R.planeHex(x, y, 0), R.planePoint(x, y, 0), R.planePoint(x, y, 10)]),
      point: [[0, 0, 0], [10, 10, 0], [30, -20, 10]].map((a) => R.screenPoint(...a)), axes: R.screenAxes(),
    };
  });
  const picks = [];
  await page.evaluate(() => { const R = window.hextable.R; window.__tap = R.onTap; window.__hit = null; R.onTap = (hit) => { window.__hit = hit; }; });
  for (let i = 0; i < info.pts.length; i++) {
    if (!info.canvas[i]) { picks.push('ui'); continue; }
    await page.evaluate(() => { window.__hit = null; });
    await tapAt(page, touch, ...info.pts[i]);
    picks.push(await page.evaluate(() => window.__hit && { hex: window.__hit.hex, id: window.__hit.id }));
  }
  await page.evaluate(() => { window.hextable.R.onTap = window.__tap; });
  return { ...info, picks };
}
function compareViews(gl, th) {
  const worst = { screen: 0, plane: 0, point: 0, axes: 0 }, bad = [];
  const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : a === b ? 0 : 1e9);
  gl.screen.forEach((a, i) => { const d = dist(a, th.screen[i]); worst.screen = Math.max(worst.screen, d); if (d > PARITY_PX) bad.push(`screenOf ${JSON.stringify(gl.hexes[i])}: ${JSON.stringify(a)} vs ${JSON.stringify(th.screen[i])}`); });
  gl.point.forEach((a, i) => { const d = dist(a, th.point[i]); worst.point = Math.max(worst.point, d); if (d > PARITY_PX) bad.push(`screenPoint ${i}: ${JSON.stringify(a)} vs ${JSON.stringify(th.point[i])}`); });
  gl.plane.forEach((a, i) => {
    const b = th.plane[i];
    if (JSON.stringify(a[0]) !== JSON.stringify(b[0])) bad.push(`planeHex at ${gl.pts[i]}: ${JSON.stringify(a[0])} vs ${JSON.stringify(b[0])}`);
    for (const k of [1, 2]) { const d = a[k] && b[k] ? Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) : a[k] === b[k] ? 0 : 1e9; worst.plane = Math.max(worst.plane, d); if (d > 0.05) bad.push(`planePoint(${k}) at ${gl.pts[i]}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`); }
  });
  for (const k of ['right', 'up']) for (let j = 0; j < 2; j++) { const d = Math.abs(gl.axes[k][j] - th.axes[k][j]); worst.axes = Math.max(worst.axes, d); if (d > 1e-3) bad.push(`screenAxes ${k}: ${JSON.stringify(gl.axes)} vs ${JSON.stringify(th.axes)}`); }
  let same = 0, n = 0;
  gl.picks.forEach((a, i) => { if (a === 'ui') return; n++; if (JSON.stringify(a) === JSON.stringify(th.picks[i])) same++; else bad.push(`pick at ${gl.pts[i]}: ${JSON.stringify(a)} vs ${JSON.stringify(th.picks[i])}`); });
  return { worst, same, n, bad };
}
async function threeParity(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, shots = process.env.SMOKE_SHOTS, tag = touch ? 'phone' : 'desk', pages = {}, ctxs = [];
    try {
      for (const kind of ['gl', 'three']) {
        const ctx = await browser.newContext(opts); ctxs.push(ctx);
        await ctx.addInitScript(() => { let s = 12345; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; });      // the valley's trees are drawn from a random seed per game
        const page = await ctx.newPage(); run.watch(page, ` (${kind})`); pages[kind] = page;
      }
      await run.do('both renderers load the valley, the Three.js one from vendor/ and only on request', async () => {
        const asked = { gl: [], three: [] };
        for (const k of ['gl', 'three']) pages[k].on('request', (r) => { if (r.url().includes('/vendor/')) asked[k].push(r.url()); });
        await open(pages.gl, url); await playSolo(pages.gl);
        await open(pages.three, `${url}?renderer=three`); await playSolo(pages.three);
        await wait(pages.three, () => window.hextable.R.kind === 'three', null, 20000);
        if (asked.gl.length) throw new Error(`the default renderer fetched ${asked.gl.join(', ')}`);
        if (!asked.three.some((u) => u.endsWith('three.module.js'))) throw new Error('the Three.js renderer did not load the library');
      });
      const valley = await pages.gl.evaluate(() => structuredClone(window.hextable.state.map));
      for (const map of ['valley', 'dungeon', 'cave']) {
        await run.do(`${map}: screenOf, picking, plane questions and axes agree; screenshots; frame times`, async () => {
          for (const k of ['gl', 'three']) {
            const pg = pages[k];
            if (map !== 'valley') { await pg.evaluate((m) => window.hextable.ED.stock(m), map); await wait(pg, (m) => window.hextable.state.map.id === m, map); }
            else await pg.evaluate((m) => window.hextable.act({ type: 'loadMap', map: m }), valley);      // the same valley in both: Three.js draws on Math.random (its ids), so the two pages' random valleys can differ
            await closePanels(pg);
            await pg.evaluate(() => { const h = window.hextable, pc = Object.values(h.state.entities).find((e) => e.kind === 'pc'); h.R.focus(pc.id, true); h.R.rotate(0.3); h.R.zoom(0.8); h.R.inset = 90; });
            await sleep(900);
          }
          const view = {};
          for (const k of ['gl', 'three']) { await pages[k].evaluate(() => window.hextable.R.focus(Object.values(window.hextable.state.entities).find((e) => e.kind === 'pc').id, true)); await sleep(500); view[k] = await measureView(pages[k], touch); }
          const r = compareViews(view.gl, view.three);
          console.log(`       ${map}: worst screenOf ${r.worst.screen.toFixed(2)} px, screenPoint ${r.worst.point.toFixed(2)} px, planePoint ${r.worst.plane.toFixed(3)} ft-units, axes ${r.worst.axes.toExponential(1)}; ${r.same}/${r.n} picks the same`);
          const st = {};
          for (const k of ['gl', 'three']) { await sleep(1200); st[k] = await pages[k].evaluate(() => { const R = window.hextable.R; return R.stats(); }); }
          console.log(`       ${map} ${tag} frame ms (software GL, median): gl ${st.gl.frameMs.toFixed(1)} (${st.gl.drawCalls} calls), three ${st.three.frameMs.toFixed(1)} (${st.three.drawCalls} calls)`);
          if (shots) for (const k of ['gl', 'three']) await pages[k].screenshot({ path: join(shots, `${map}-${tag}-${k}.png`) });
          if (r.bad.length) throw new Error(`${r.bad.length} differences, first: ${r.bad.slice(0, 3).join(' | ')}`);
          if (r.n < 6) throw new Error(`only ${r.n} points could be tapped on the canvas`);
        });
      }
    } finally { for (const c of ctxs) await c.close(); }
  });
  await scenario(`${label}: the game plays on the Three.js renderer`, async (run) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      await run.do('load with ?renderer=three and tap a character across the map', async () => {
        await open(page, `${url}?renderer=three`); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three', null, 20000);
        await wait(page, () => window.hextable.state.entities.fighter);
        const start = await state(page, (S) => S.entities.fighter.pos);
        const to = await selectAndMove(page, touch, 'fighter', 'Brenna');
        if (to.q === start.q && to.r === start.r) throw new Error('the character did not move');
      });
      await run.do('a fight starts, the arena curtain is drawn, a goblin falls, the fight ends', async () => {
        await closePanels(page);
        await page.evaluate(() => { const h = window.hextable, f = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0); h.act({ type: 'startEncounter', center: f.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await wait(page, () => window.hextable.R.inner.edge.n > 0, null, 5000);
        const id = await page.evaluate(() => { const h = window.hextable, f = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0); h.act({ type: 'harm', actor: f.id, amount: 99 }); return f.id; });
        await wait(page, (i) => window.hextable.state.entities[i].dead, id);
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => window.hextable.state.encounter === null);
        await sleep(300);
      });
    } finally { await ctx.close(); }
  });
  await beats(browser, `${url}?renderer=three`, `${label}: doors and falls on the Three.js renderer`, opts);
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
        await openTab(host, 'dm');
        await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
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

      await run.do("dice: the phone throws its attack and the DM sees the dice; a monster's d20 is not shown to the phone", async () => {
        const { pc, foe } = await diceDuel(host, phone, id);
        const n = await host.evaluate(() => window.hextable.state.encounter.budget.action);
        await phone.evaluate(([p, f]) => { const e = window.hextable.state.entities[p]; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
        await waitShown(phone, '#dice-tray');
        await sleep(300);
        if ((await host.evaluate(() => window.hextable.state.encounter.budget.action)) !== n) throw new Error('the attack was applied before the throw');
        await phone.locator('#dice-tray .dt-throw').tap();
        await wait(host, (k) => window.hextable.state.encounter.budget.action === k - 1, n, 15000);
        await wait(host, (p) => window.hextable.thrown.some((g) => g.type === 'attack' && g.side === 'party' && g.dice.some((d) => d.sides === 20)), pc, 15000);
        // The monster attacks the phone's character, its dice thrown for the DM.
        await wait(host, () => window.hextable.waiting === 0, null, 20000);
        await wait(phone, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {           // on round the order to the foe's turn
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
          if (cur === foe) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(host, () => window.hextable.waiting === 0, null, 20000);
        }
        const sent = await host.evaluate(async ([p, f]) => {
          const S = window.hextable.state;
          if (S.encounter.order[S.encounter.turn].id !== f) return 'not its turn';
          const def = S.entities[f].actions?.find((a) => JSON.stringify(a.effects ?? []).includes('"melee"'));
          window.hextable.act(def ? { type: 'act', actor: f, action: def.id, target: p } : { type: 'attack', actor: f, target: p, attack: S.entities[f].attacks[0].id });
          return 'sent';
        }, [pc, foe]);
        if (sent === 'sent') {
          await wait(host, (f) => window.hextable.thrown.some((g) => g.type === 'attack' && g.side === 'foe'), foe, 15000);
          await wait(phone, () => window.hextable.waiting === 0, null, 20000);
          await sleep(500);
        }
        const leaked = await phone.evaluate(() => window.hextable.thrown.filter((g) => (g.type === 'initiative' ? g.ids.some((i) => window.hextable.state.entities[i]?.side !== 'party') : g.side !== 'party' && g.dice.some((d) => d.sides === 20))).map((g) => g.label));
        if (leaked.length) throw new Error(`the phone was shown a monster's d20: ${leaked.join(', ')}`);
        if (sent !== 'sent') throw new Error(`the monster could not attack: ${sent}`);
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}


// ---------- scenes ----------
// The scene screen (packages/client/scenes.js): a DM and a phone. Prepare, open, speak, undo, step out.
async function scenes(browser, url) {
  await scenario('scenes: the DM prepares and opens one, a phone speaks in it', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      const SECRET = 'secret-notes-xyzzy';
      const heard = [], hostHeard = [];          // every event each is sent, read off its WebSocket (neither has a timeline of its own)
      host.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) hostHeard.push(...m.events); } catch { /* not JSON */ } }));
      const hostGot = async (k, test, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (hostHeard.slice(k).some(test)) return true; await sleep(100); } return false; };
      phone.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) heard.push(...m.events); } catch { /* not JSON */ } }));
      const lines = (page) => page.evaluate(() => [...document.querySelectorAll('#sc-lines li[data-line]')].map((li) => li.textContent));
      const sees = (page, text, on = true) => wait(page, ([t, want]) => [...document.querySelectorAll('#sc-lines li[data-line]')].some((li) => li.textContent.includes(t)) === want, [text, on], 8000);

      await run.do('host, join, let in, claim a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Scene DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Scene Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        await b.click();
        await wait(phone, (n) => Object.values(window.hextable.state.entities).some((e) => e.name === n && e.owner), name);
      });

      await run.do('the DM prepares a scene: the DM sees it, the phone is sent nothing', async () => {
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.fill('#sc-new-title', 'The mayor\'s study');
        await host.click('#sc-new-prep');
        await wait(host, () => window.hextable.state.scene && window.hextable.state.scene.open === false);
        await closeMenu(host);       // the scene's own panel is what the DM works in now
        await waitShown(host, '#scene'); await waitShown(host, '#sc-prep');
        await sleep(400);
        if (await phone.evaluate(() => window.hextable.state.scene !== null)) throw new Error('the phone was sent a prepared scene');
        if (await shown(phone, '#scene')) throw new Error('the phone shows a prepared scene');
      });

      await run.do('the DM adds someone with notes, and opens the scene', async () => {
        await host.click('#sc-people [data-npc=""]');
        await host.fill('#sc-npc-name', 'Mayor Orsolya');
        await host.fill('#sc-npc-notes', SECRET);
        await host.click('#sc-npc-save');
        await wait(host, () => window.hextable.state.scene.present.length === 1);
        await host.click('#sc-go');
        await wait(host, () => window.hextable.state.scene.open === true);
        await wait(phone, () => window.hextable.state.scene?.open === true);
        await waitShown(phone, '#scene');
        const leaked = await phone.evaluate((k) => JSON.stringify(window.hextable.state).includes(k) || document.body.innerText.includes(k) || document.documentElement.innerHTML.includes(k), SECRET);
        if (leaked) throw new Error('the DM\'s notes reached the phone');
        const names = await phone.evaluate(() => [...document.querySelectorAll('#sc-people li')].map((li) => li.textContent));
        if (!names.some((n) => n.includes('Mayor Orsolya'))) throw new Error(`the phone does not list the NPC: ${names}`);
        if (await shown(phone, '#sc-tools')) throw new Error('the phone has the DM\'s tools');
      });

      await run.do('the DM speaks as the NPC and the phone sees it', async () => {
        await host.selectOption('#sc-as', { label: 'Mayor Orsolya' });
        await host.fill('#sc-text', 'Welcome, travellers.');
        await host.click('#sc-say button[type=submit]');
        await sees(phone, 'Mayor Orsolya'); await sees(phone, 'Welcome, travellers.');
      });

      await run.do('the phone speaks as its character; its box is not under the keyboard line', async () => {
        await phone.fill('#sc-text', 'We come in peace.');
        await phone.locator('#sc-say button[type=submit]').tap();
        await sees(host, 'We come in peace.'); await sees(phone, 'We come in peace.');
        const r = await phone.evaluate(() => { const b = document.getElementById('sc-say').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight }; });
        if (r.bottom > r.h || r.top < 0) throw new Error(`the box to speak in is off screen: ${JSON.stringify(r)}`);
      });

      await run.do('taking back a line removes it from the phone too', async () => {
        await host.fill('#sc-text', 'Oops, wrong line.');
        await host.click('#sc-say button[type=submit]');
        await sees(phone, 'Oops, wrong line.');
        await host.click('#btn-undo');
        await sees(phone, 'Oops, wrong line.', false); await sees(host, 'Oops, wrong line.', false);
        const l = await lines(phone);
        if (l.length !== 2) throw new Error(`expected two lines on the phone, found ${l.length}`);
      });

      await run.do('the DM calls for a check: it is rolled, and the phone is never sent the DC', async () => {
        await host.click('#sc-tools');
        const who = await host.evaluate(() => window.hextable.state.entities.fighter.name);
        await host.selectOption('#sc-call-who', { label: who });
        await host.selectOption('#sc-call-skill', 'insight');
        await host.fill('#sc-call-dc', '12');
        const n = hostHeard.length;
        await host.click('#sc-call button[type=submit]');
        if (!(await hostGot(n, (e) => e.type === 'check' && e.skill === 'insight' && e.dc === 12))) throw new Error('the DM was not sent the check');
        await wait(phone, () => window.hextable.waiting === 0, null, 15000);
        const seen = heard.filter((e) => e.type === 'check');
        if (!seen.length) throw new Error('the phone was told nothing of the check');
        if (seen.some((e) => e.dc !== undefined)) throw new Error(`the phone was sent the DC: ${JSON.stringify(seen)}`);
        await host.click('#sc-tools');
      });

      await run.do('a player asks for a check: the DM sees the request, answers it with a DC, and a second is turned down', async () => {
        await phone.locator('#sc-ask').tap();
        await waitShown(phone, '#sc-skills');
        await phone.locator('#sc-skills [data-skill="perception"]').tap();
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 1);
        const said = await host.evaluate(() => document.querySelector('#sc-asks li').textContent);
        if (!/asks for Perception/.test(said)) throw new Error(`the request reads "${said}"`);
        const n = hostHeard.length;
        await host.fill('#sc-asks li input', '10');
        await host.click('#sc-asks [data-roll]');
        if (!(await hostGot(n, (e) => e.type === 'check' && e.skill === 'perception' && e.dc === 10))) throw new Error('the answered request was not rolled with its DC');
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 0);
        await phone.locator('#sc-ask').tap();
        await phone.locator('#sc-skills [data-skill="history"]').tap();
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 1);
        const m = hostHeard.length;
        await host.click('#sc-asks [data-drop]');
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 0);
        await sleep(300);
        if (hostHeard.slice(m).some((e) => e.type === 'check')) throw new Error('a request turned down was rolled anyway');
      });

      await run.do('the chronicle: pick two lines, write them, and they land (the phone is not sent them)', async () => {
        const nums = await host.evaluate(() => [...document.querySelectorAll('#sc-lines li[data-line]')].map((li) => li.dataset.line));
        if (nums.length < 2) throw new Error('fewer than two lines to pick');
        await host.click(`#sc-lines li[data-line="${nums[0]}"]`);
        await waitShown(host, '#sc-chron');
        if (!/Line /.test(await host.evaluate(() => document.getElementById('sc-chron-what').textContent))) throw new Error('one line picked, and the form does not say so');
        await host.click(`#sc-lines li[data-line="${nums[1]}"]`);
        await wait(host, () => /Lines \d+ to \d+/.test(document.getElementById('sc-chron-what').textContent));
        await host.fill('#sc-chron-title', 'Meeting the mayor');
        const n = hostHeard.length;
        await host.click('#sc-chron button[type=submit]');
        if (!(await hostGot(n, (e) => e.type === 'chronicle' && e.title === 'Meeting the mayor' && /Welcome, travellers/.test(e.text) && /We come in peace/.test(e.text) && e.scene))) throw new Error('the entry did not land with both lines');
        await waitShown(host, '#sc-chron', false);
        await host.click('#sc-tools'); await host.click('#sc-tools');          // keep the tools as they were
        await sleep(300);
        if (heard.some((e) => e.type === 'chronicle')) throw new Error('the phone was sent a chronicle entry that was not public');
      });

      await run.do('a player who speaks too fast is refused and told so', async () => {
        // The connection allows 5 messages a second, the table 30 lines a minute: send under the first, over the second
        // (36, so the limit is passed even when a slow machine has let the earlier lines age out of the minute).
        await phone.evaluate(() => { let i = 0; const t = setInterval(() => { window.hextable.act({ type: 'say', as: null, text: `spam ${i}` }); if (++i >= 36) clearInterval(t); }, 230); });
        try { await wait(phone, () => /too fast/i.test(document.getElementById('toast')?.textContent ?? ''), null, 45000); }
        catch { throw new Error(`no refusal shown; the toast says "${await phone.evaluate(() => document.getElementById('toast')?.textContent ?? '')}", ${await phone.evaluate(() => document.querySelectorAll('#sc-lines li[data-line]').length)} lines shown`); }
      });

      await run.do('the DM steps out to the map: the phone leaves the scene', async () => {
        await host.click('#sc-tools');
        await host.click('#sc-out');
        await wait(phone, () => window.hextable.state.scene === null);
        await waitShown(phone, '#scene', false);
        await wait(host, () => window.hextable.state.scene?.open === false);
        await waitShown(host, '#btn-scene');
      });

      // A scene has no turns: a fight ends one that is open, leaves one that is prepared alone, and the table cannot
      // open one during a fight (packages/rules/src/scenes.js).
      const startFight = async () => {
        const n = hostHeard.length;
        await host.evaluate(() => { const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden); window.hextable.act({ type: 'startEncounter', center: f.pos }); });
        await wait(host, () => !!window.hextable.state.encounter, null, 10000);
        await wait(phone, () => !!window.hextable.state.encounter, null, 10000);
        return n;
      };
      const endFight = async () => {
        await host.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(host, () => !window.hextable.state.encounter, null, 15000);
        await wait(phone, () => !window.hextable.state.encounter, null, 15000);
      };

      await run.do('a fight starts with the scene only prepared: it stays prepared, and cannot be opened until the fight ends', async () => {
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('no prepared scene to start with');
        await startFight();
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('the fight took the prepared scene away');
        if (await phone.evaluate(() => window.hextable.state.scene !== null)) throw new Error('the phone was sent the prepared scene by the fight');
        await host.evaluate(() => { document.getElementById('toast').textContent = ''; window.hextable.act({ type: 'scene', scene: { open: true } }); });
        await wait(host, () => /no turns/i.test(document.getElementById('toast')?.textContent ?? ''), null, 5000);
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('the scene opened during a fight');
        await endFight();
        await host.evaluate(() => window.hextable.act({ type: 'scene', scene: { open: true } }));
        await wait(host, () => window.hextable.state.scene?.open === true);
        await wait(phone, () => window.hextable.state.scene?.open === true);
      });

      await run.do('a fight starts in an open scene: the scene ends for both, with the reason, and the phone is back on the map', async () => {
        const n = await startFight();
        await wait(phone, () => window.hextable.state.scene === null);
        await waitShown(phone, '#scene', false);
        await waitShown(host, '#scene', false);
        if (!hostHeard.slice(n).some((e) => e.type === 'sceneEnd' && e.why === 'a fight began')) throw new Error('no sceneEnd with the reason');
        if (!heard.some((e) => e.type === 'sceneEnd' && e.why === 'a fight began')) throw new Error('the phone was not told why the scene ended');
        await endFight();
      });

      await run.do('the chronicle entry is in the DM panel\'s list', async () => {
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await wait(host, () => [...document.querySelectorAll('#chron-list li')].some((li) => /Meeting the mayor/.test(li.textContent)), null, 8000);
        await closeMenu(host);
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// ---------- armed class features ----------
// Stunning Strike on the action bar (packages/client/app.js, features.js): arm it, then tap a creature. A monk
// is added beside a goblin and the fight started; `touch` taps with a finger. Arm and cancel sends nothing; arm and
// tap a creature out of reach is sent and refused by the engine, spending nothing; arm and tap the goblin sends it.
async function armed(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const btn = () => page.locator('#actions button:has-text("Stunning Strike")');
      const snap = () => state(page, (S, i) => ({ tl: S.timeline.length, focus: S.entities[i]?.uses?.['monks-focus'], hint: document.getElementById('hint-text')?.textContent }), lo);
      const tapEntity = async (id) => {
        await page.evaluate(async (i) => {          // put it in the middle of the map, clear of the panels
          const H = await import('./shared/hex.js'), R = window.hextable.R, w = H.toWorld(window.hextable.state.entities[i].pos);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, id);
        await settle(page, id);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), id);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`${id} is not on screen where a tap can reach it: ${JSON.stringify(pt)} under ${await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.id || e.className || e.tagName : null; }, [pt?.x ?? 0, pt?.y ?? 0])}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      let foe, far, lo;

      await run.do('a level 5 monk beside a goblin, in a fight, on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Lo', class: 'monk', level: 5, subclass: 'open-hand', abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, skills: ['acrobatics', 'insight'], weapons: ['quarterstaff'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Lo'));
        lo = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Lo').id);
        const setup = await page.evaluate((LO) => {
          const h = window.hextable, S = h.state;
          document.getElementById('dm-auto').checked = false;
          const foes = Object.values(S.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          const near = foes[0];
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: LO, to: { q: near.pos.q + dq, r: near.pos.r + dr } });
            const p = h.state.entities[LO].pos, d = Math.max(Math.abs(p.q - near.pos.q), Math.abs(p.r - near.pos.r), Math.abs(p.q + p.r - near.pos.q - near.pos.r));
            if (d === 1) break;
          }
          const lo = h.state.entities[LO];
          const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
          const farthest = foes.slice().sort((a, b) => dist(b.pos, lo.pos) - dist(a.pos, lo.pos))[0];
          h.act({ type: 'startEncounter', center: near.pos });
          return { foe: near.id, far: farthest.id, d: dist(farthest.pos, lo.pos) };
        }, lo);
        foe = setup.foe; far = setup.far;
        if (setup.d < 2) throw new Error('no creature out of reach to tap');
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === lo) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, lo, 20000);
        await closePanels(page);
        await page.click('#party button:has-text("Lo")');
        await page.evaluate(async (a) => {          // both creatures in view
          const H = await import('./shared/hex.js'), R = window.hextable.R, S = window.hextable.state;
          const m = (p, q) => ({ q: (p.q + q.q) / 2, r: (p.r + q.r) / 2 });
          const w = H.toWorld(m(S.entities[a[1]].pos, S.entities[a[0]].pos)); R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, [far, lo]);
        await btn().waitFor({ state: 'visible', timeout: 5000 });
      });

      await run.do('arm Stunning Strike, then cancel: armed, hint shown, nothing sent', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature' && window.hextable.mode.id === 'stunning-strike');
        if (!/Stunning Strike: tap a creature/.test((await snap()).hint ?? '')) throw new Error('no hint to tap a creature');
        if (!/armed/.test(await btn().getAttribute('class'))) throw new Error('the button does not show as armed');
        await (touch ? page.locator('#hint-cancel').tap() : page.click('#hint-cancel'));
        await wait(page, () => window.hextable.mode.kind !== 'feature');
        await sleep(300);
        const b = await snap();
        if (b.tl !== a.tl || b.focus !== a.focus) throw new Error('arming and cancelling changed the game');
        if (/armed/.test(await btn().getAttribute('class'))) throw new Error('the button still shows as armed');
      });

      await run.do('arm and tap a creature out of reach: refused, nothing spent, disarmed', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapEntity(far);
        await wait(page, () => window.hextable.mode.kind !== 'feature');
        await sleep(500);
        const b = await snap();
        if (b.tl !== a.tl || b.focus !== a.focus) throw new Error(`a refused feature changed the game: ${JSON.stringify([a, b])}`);
        const toast = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
        if (!toast.trim()) throw new Error('the player was not told why it was refused');
      });

      await run.do('arm and tap the goblin: sent, a Focus Point spent, the save shown', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapEntity(foe);
        await wait(page, (n) => window.hextable.state.timeline.length > n, a.tl, 15000);
        const r = await page.evaluate(([n, i]) => { const S = window.hextable.state; const ev = S.timeline.slice(n); return { types: ev.map((e) => e.type), save: ev.find((e) => e.type === 'save'), focus: S.entities[i].uses['monks-focus'] }; }, [a.tl, lo]);
        if (!r.save) throw new Error(`no save came of it: ${r.types}`);
        if (r.focus !== a.focus - 1) throw new Error(`Focus Points ${a.focus} -> ${r.focus}`);
        if ((await state(page, () => window.hextable.mode.kind)) === 'feature') throw new Error('still armed after sending');
      });
    } finally { await ctx.close(); }
  });
}

// ---------- dice on the screen (PR #117) ----------
// A DM (desktop) and a player (`opts`: desktop or phone). The player's dice are thrown in the table's default
// way: an attack and its damage, a save the DM's spell makes them roll, a skill check. For each, the dice shown
// on the player's screen are the faces in the events that player was sent, and add up to their number. Then the
// player is audited: no die from a roll the player was not told the number of (a monster's attack, save or
// initiative; damage a monster rolled that was changed on the way). Under `throw`, the tray sits clear of
// the action bar, and when nothing is in the air the dice canvas is gone and the action bar takes the touch.
async function dice(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctx = await browser.newContext(opts);
    try {
      const host = await hostCtx.newPage(), me = await ctx.newPage();
      run.watch(host, ' (host)'); run.watch(me, ' (player)');
      const touch = !!opts.hasTouch;
      let pc, foe;
      const idle = () => Promise.all([wait(host, () => window.hextable.waiting === 0, null, 20000), wait(me, () => window.hextable.waiting === 0, null, 20000)]);
      // What each page was sent, read off its WebSocket (a player's state has no timeline of its own).
      const got = { host: [], me: [], other: [] };
      const tap = (page, key) => page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) got[key].push(...m.events); else if (m.t !== 'update' && m.t !== 'lobby') got.other = [...(got.other ?? []).slice(-4), String(f.payload).slice(0, 200)]; } catch { /* not JSON */ } }));
      tap(host, 'host'); tap(me, 'me');
      // The faces of every group thrown on the player's page against the events that player was sent. Returns what is wrong.
      const audit = async (page) => {
        const S = await page.evaluate(() => ({ ents: Object.fromEntries(Object.values(window.hextable.state.entities).map((e) => [e.id, e.side])), thrown: window.hextable.thrown }));
        const bad = [], mine = (id) => S.ents[id] === 'party', events = got.me;
        const sum = (e) => (e.dice ?? []).filter((d) => !d.drop).reduce((a, d) => a + (d.neg ? -d.value : d.value), 0) + (e.bonus ?? 0);
        for (const e of events) {
          if (e.type === 'encounterStart' && e.order.some((o) => o.dice && !mine(o.id))) bad.push('a monster\'s initiative came with dice');
          if (!e.dice) continue;
          const n = ['damage', 'heal', 'tempHp'].includes(e.type) ? (e.rolled ?? e.amount) : e.total ?? e.roll ?? e.init;
          if (sum(e) !== n) bad.push(`${e.type}: faces make ${sum(e)}, the event says ${n}`);
          if (['attack', 'save', 'check', 'concentration', 'deathSave'].includes(e.type) && !mine(e.actor ?? e.id)) bad.push(`${e.type} by ${e.actor ?? e.id} came with dice to a player`);
        }
        for (const g of S.thrown) {
          if (g.type === 'initiative' || !g.dice?.length || /more rolls/.test(g.label)) continue;
          if (!events.some((e) => e.dice && JSON.stringify(e.dice) === JSON.stringify(g.dice))) bad.push(`shown dice with no event: ${g.label} ${JSON.stringify(g.dice)}`);
        }
        return bad;
      };
      const groups = (page, type) => page.evaluate((ty) => window.hextable.thrown.filter((g) => g.type === ty).length, type);

      await run.do('host, join, let in, claim a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Dice DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(me, url);
        await me.fill('#lobby-name', 'Dice Player'); await me.fill('#lobby-code', code); await me.click('#lobby-join');
        await wait(me, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(me, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = me.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        pc = await me.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await (touch ? b.tap() : b.click());
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, pc);
      });

      await run.do('a fight; the player attacks: the d20 and the damage are shown and match the events', async () => {
        ({ foe } = await diceDuel(host, me, pc));
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }));
        await wait(me, () => window.hextable.state.settings.diceThrow === 'auto');
        const n = await me.evaluate(() => window.hextable.thrown.length);
        // Hit for certain: the faces are the engine's, so make the hit sure by making the foe easy to hit.
        await host.evaluate((f) => { window.hextable.act({ type: 'setHp', actor: f, hp: window.hextable.state.entities[f].maxHp }); }, foe);
        for (let i = 0; i < 8 && !(await me.evaluate((k) => window.hextable.thrown.slice(k).some((g) => g.type === 'attack'), n)); i++) {
          await me.evaluate(([p, f]) => { const S = window.hextable.state, e = S.entities[p]; if (S.encounter?.order[S.encounter.turn]?.id !== p) return; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
          await sleep(800); await idle();
          if (!(await me.evaluate((k) => window.hextable.thrown.slice(k).some((g) => g.type === 'attack'), n))) {
            const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
            await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
          }
        }
        if (!(await groups(me, 'attack'))) throw new Error('the player was shown no attack roll');
        const atk = await me.evaluate(() => window.hextable.thrown.find((g) => g.type === 'attack'));
        if (!atk.dice.some((d) => d.sides === 20)) throw new Error('an attack roll without a d20');
        const bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
        const hit = got.me.some((e) => e.type === 'attack' && e.hit && e.actor === pc);
        if (hit && !(await groups(me, 'damage'))) throw new Error('a hit, and no damage dice shown');
        if (!got.me.some((e) => e.type === 'attack' && e.dice)) throw new Error('the player\'s own attack came with no dice');
      });

      await run.do('a monster\'s save carries no dice to the player (the DM sees them); the player\'s own skill check is shown and matches', async () => {
        const sentAfter = async (page, k, type) => { for (let i = 0; i < 150; i++) { if (got[page].slice(k).some((e) => e.type === type && e.dice)) return true; await sleep(100); } return false; };
        // Odessa joins the fight beside a goblin still on its feet (the player's blow may have killed the first); on her turn the DM has her cast Sacred Flame at it.
        const target = await host.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.dead && !e.hidden)?.id);
        if (!target) throw new Error('no goblin left standing to cast at');
        await host.evaluate(async (f) => {
          const h = window.hextable, at = h.state.entities[f].pos;
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: 'cleric', to: { q: at.q + dq, r: at.r + dr } });
            await new Promise((r) => setTimeout(r, 300));
            const c = h.state.entities.cleric.pos;
            if (Math.max(Math.abs(c.q - at.q), Math.abs(c.r - at.r), Math.abs(c.q + c.r - at.q - at.r)) === 1) break;
          }
        }, target);
        await idle();
        for (let i = 0; i < 30; i++) {
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id; });
          if (cur === 'cleric') break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
        }
        const k = got.host.length, km = got.me.length;
        await host.evaluate((f) => window.hextable.act({ type: 'cast', actor: 'cleric', spell: 'sacred-flame', target: f }), target);
        if (!(await sentAfter('host', k, 'save'))) throw new Error(`the DM was sent no save with dice; toast "${await host.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`);
        await idle();
        if (got.me.slice(km).some((e) => e.type === 'save' && e.dice)) throw new Error('a monster\'s save came with dice to the player');
        if (!got.me.slice(km).some((e) => e.type === 'save')) throw new Error('the player was told nothing of the save');
        let bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
        await host.evaluate(() => window.hextable.act({ type: 'endEncounter' })); await idle();
        const n = got.me.length;
        await me.evaluate((p) => window.hextable.act({ type: 'check', actor: p, skill: 'athletics' }), pc);
        if (!(await sentAfter('me', n, 'check'))) throw new Error('the player was sent no check with its dice');
        await idle();
        if (!(await groups(me, 'check'))) throw new Error('the check was not shown as dice');
        bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
      });

      await run.do('nothing is left on the screen: no dice canvas, and the action bar takes a touch', async () => {
        await idle();
        if (await shown(me, '#dice')) throw new Error('the dice canvas is still over the screen with nothing in the air');
        await me.click(`#party button:has-text("${await me.evaluate((p) => window.hextable.state.entities[p].name, pc)}")`).catch(() => {});
        const r = await me.evaluate(() => {
          const bar = document.getElementById('actions'), b = bar && bar.querySelector('button');
          if (!b) return { none: true };
          const q = b.getBoundingClientRect(), top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return { ok: !top || b.contains(top) || top === b, over: top && (top.id || top.className || top.tagName) };
        });
        if (!r.none && !r.ok) throw new Error(`the action bar is covered by ${r.over}`);
      });

      await run.do('under throw the tray is on screen and clear of the action bar', async () => {
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'throw' }));
        await wait(me, () => window.hextable.state.settings.diceThrow === 'throw');
        await me.evaluate((p) => window.hextable.act({ type: 'check', actor: p, skill: 'athletics' }), pc);
        await waitShown(me, '#dice-tray');
        const r = await me.evaluate(() => {
          const t = document.getElementById('dice-tray').getBoundingClientRect(), b = document.getElementById('actions').getBoundingClientRect();
          return { t: [t.left, t.top, t.right, t.bottom], b: [b.left, b.top, b.right, b.bottom], w: innerWidth, h: innerHeight, shown: b.height > 0 };
        });
        if (r.t[0] < 0 || r.t[2] > r.w || r.t[1] < 0 || r.t[3] > r.h) throw new Error(`the tray is off screen: ${JSON.stringify(r)}`);
        if (r.shown && r.t[3] > r.b[1] && r.t[1] < r.b[3] && r.t[2] > r.b[0] && r.t[0] < r.b[2]) throw new Error(`the tray covers the action bar: ${JSON.stringify(r)}`);
        await (touch ? me.locator('#dice-tray .dt-throw').tap() : me.click('#dice-tray .dt-throw'));
        await wait(me, () => window.hextable.thrown.some((g) => g.type === 'check'), null, 15000);
        await me.evaluate(() => window.hextable.dice.skip());
        await idle();
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }));
      });
    } finally { await ctx.close(); await hostCtx.close(); }
  });
}

// ---------- reactions on the sheet ----------
// A wizard who knows Shield stands beside a goblin. Her sheet lists her reactions (and only those she has),
// Shield is set to "always" with the control, and when the goblin hits her Shield is used.
async function reactions(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let wren, foe;
      const idle = () => wait(page, () => window.hextable.waiting === 0, null, 20000);
      const openSheet = async () => {
        await closePanels(page);
        await page.click('#party button:has-text("Wren")');
        await (touch ? page.locator('#btn-sheet').tap() : page.click('#btn-sheet'));
        await waitShown(page, '#sheet');
      };

      await run.do('a level 5 wizard who knows Shield, beside a goblin', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Wren', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['shield'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Wren'));
        wren = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Wren').id);
        foe = await page.evaluate((W) => {
          const h = window.hextable, near = Object.values(h.state.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && e.actions?.length)[0];
          document.getElementById('dm-auto').checked = false;
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: W, to: { q: near.pos.q + dq, r: near.pos.r + dr } });
            const p = h.state.entities[W].pos, d = Math.max(Math.abs(p.q - near.pos.q), Math.abs(p.r - near.pos.r), Math.abs(p.q + p.r - near.pos.q - near.pos.r));
            if (d === 1) break;
          }
          return near.id;
        }, wren);
      });

      await run.do('the sheet lists her reactions and no others', async () => {
        await openSheet();
        await waitShown(page, '#sheet-reactions');
        const ids = await page.$$eval('#sheet-reactions [data-rx-set]', (els) => els.map((x) => x.dataset.rxSet));
        if (ids.join() !== 'shield') throw new Error(`reactions listed: ${ids.join() || 'none'}`);
        const now = await page.$eval('#rx-shield', (x) => x.value);
        if (now !== 'never') throw new Error(`Shield should start on never, not ${now}`);
        const box = await page.$eval('#sheet-reactions .rx select', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, innerWidth, r.height]; });
        if (box[0] < 0 || box[1] > box[2] || box[3] < 40) throw new Error(`the control does not fit or is too small to touch: ${JSON.stringify(box)}`);
      });

      await run.do('setting Shield to always sends the action and the engine keeps it', async () => {
        await page.selectOption('#rx-shield', 'always');
        await wait(page, (W) => window.hextable.state.entities[W].reactions?.shield === 'always', wren);
        await wait(page, () => document.getElementById('rx-shield')?.value === 'always');
      });

      await run.do('the goblin attacks until it hits her, and Shield is used', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[Object.keys(window.hextable.state.entities)[0]].pos }));
        await idle();
        let used = false;
        for (let i = 0; i < 12 && !used; i++) {
          for (let k = 0; k < 40; k++) {                                          // walk the order round to the goblin's turn
            const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === foe) break;
            await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
          }
          const before = await state(page, (S) => S.timeline.length);
          await page.evaluate(([f, w]) => {
            const S = window.hextable.state, def = S.entities[f].actions.find((a) => a.effects?.[0]?.attack === 'melee');
            window.hextable.act({ type: 'act', actor: f, action: def.id, target: w });
          }, [foe, wren]);
          await idle();
          used = await (page.evaluate(([n, W]) => window.hextable.state.timeline.slice(n).some((ev) => ev.type === 'reaction' && ev.id === W && ev.reaction === 'shield'), [before, wren]));
          if (!used) { await page.evaluate((f) => window.hextable.act({ type: 'endTurn', actor: f }), foe); await idle(); }
        }
        if (!used) throw new Error('the goblin never hit her, or Shield was not used');
      });

      await run.do('the sheet shows her Reaction spent', async () => {
        await openSheet();
        await wait(page, () => document.querySelector('[data-rx-status]')?.dataset.rxStatus === 'spent');
      });
    } finally { await ctx.close(); }
  });
}


// ---------- the reaction question ----------
// A DM, a phone player (Wren, a wizard who knows Shield) and a second player who watches. Wren's Shield is set to
// "ask" on her own sheet; a goblin attacks her until a hit reaches the question. The phone is asked, the other
// player is told only that the table waits, the DM sees the question; an answer the engine refuses is shown;
// the phone answers Shield, and later the DM answers for the phone.
async function prompt(browser, url) {
  await scenario('reaction question: a phone is asked, another player waits, the DM answers for the phone', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const watchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage(), watch = await watchCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)'); run.watch(watch, ' (watcher)');
      let code, wren, foe;
      const idle = (p) => wait(p, () => window.hextable.waiting === 0, null, 20000);
      const join = async (page, nm) => {
        await open(page, url);
        await page.fill('#lobby-name', nm); await page.fill('#lobby-code', code); await page.click('#lobby-join');
        await wait(page, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(page, '#lobby', false);
        await wait(page, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
      };

      await run.do('host a table; a phone and a second player join', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await join(phone, 'Phone Player'); await join(watch, 'Watching Player');
      });

      await run.do('the DM adds Wren (Shield), the phone plays her, a goblin stands beside her', async () => {
        await host.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          h.act({ type: 'addCharacter', record: D.derive({ name: 'Wren', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['shield'] }).record, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Wren'));
        wren = await state(host, (S) => Object.values(S.entities).find((e) => e.name === 'Wren').id);
        await phone.locator('#party button:has-text("Play as Wren")').tap();
        await wait(host, (W) => !!window.hextable.state.entities[W].owner, wren);
        foe = await host.evaluate((W) => {
          const h = window.hextable, near = Object.values(h.state.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && e.actions?.length)[0];
          document.getElementById('dm-auto').checked = false;
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: W, to: { q: near.pos.q + dq, r: near.pos.r + dr } });
            const p = h.state.entities[W].pos, d = Math.max(Math.abs(p.q - near.pos.q), Math.abs(p.r - near.pos.r), Math.abs(p.q + p.r - near.pos.q - near.pos.r));
            if (d === 1) break;
          }
          return near.id;
        }, wren);
      });

      await run.do("the phone sets Wren's Shield to ask on her sheet", async () => {
        await phone.click('#party button:has-text("Wren")');
        await phone.locator('#btn-sheet').tap();
        await waitShown(phone, '#sheet-reactions');
        await phone.selectOption('#rx-shield', 'ask');
        await wait(phone, (W) => window.hextable.state.reactions?.[W]?.shield === 'ask', wren);
        await wait(host, (W) => window.hextable.state.entities[W].reactions?.shield === 'ask', wren);
        await closeMenu(phone);
      });

      // Walk the order to the goblin and have it attack Wren until a hit reaches the question.
      const provoke = async () => {
        await host.evaluate(() => { const h = window.hextable; if (!h.state.encounter) h.act({ type: 'startEncounter', center: h.state.entities[Object.keys(h.state.entities)[0]].pos }); });
        await idle(host);
        for (let i = 0; i < 16; i++) {
          for (let k = 0; k < 40; k++) {
            const cur = await state(host, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === foe) break;
            await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(host);
          }
          await host.evaluate(([f, w]) => {
            const S = window.hextable.state, def = S.entities[f].actions.find((a) => a.effects?.[0]?.attack === 'melee');
            window.hextable.act({ type: 'act', actor: f, action: def.id, target: w });
          }, [foe, wren]);
          await idle(host);
          if (await state(host, (S) => !!S.pending)) return;
          await host.evaluate((f) => window.hextable.act({ type: 'endTurn', actor: f }), foe); await idle(host);
        }
        throw new Error('the goblin never hit Wren, so no question was asked');
      };

      await run.do('a hit asks the phone: the question is on screen, big enough to touch and fits 390x844', async () => {
        await provoke();
        await waitShown(phone, '#rp .rp-card');
        const txt = await phone.$eval('#rp', (e) => e.innerText);
        if (!/Shield/.test(txt) || !/spell slot/i.test(txt) || !/Reaction/.test(txt)) throw new Error(`the prompt does not say what it is or costs: ${txt}`);
        const box = await phone.$eval('#rp .rp-card', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[4] || box[2] < 0 || box[3] > box[5]) throw new Error(`the prompt does not fit the phone: ${JSON.stringify(box)}`);
        const btn = await phone.$$eval('#rp button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
        if (btn.some((h) => h < 44)) throw new Error(`a button is too small to touch: ${btn}`);
        if (process.env.SMOKE_SHOTS) await phone.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-phone.png` });
      });

      await run.do('the other player is told only that the table waits; the DM sees the question', async () => {
        await waitShown(watch, '#rp-wait');
        const got = await state(watch, (S) => JSON.stringify(S.prompt));
        if (got !== '{"waiting":true}') throw new Error(`the other player was sent more than waiting: ${got}`);
        if (await shown(watch, '#rp')) throw new Error('the other player was shown the question');
        const t = await watch.$eval('#rp-wait', (e) => e.textContent);
        if (/Wren|Shield|goblin/i.test(t)) throw new Error(`the waiting notice names something: ${t}`);
        await waitShown(host, '#rp .rp-card');
        if (!/Wren can use a reaction/.test(await host.$eval('#rp', (e) => e.innerText))) throw new Error('the DM is not shown who is asked');
        if (await shown(host, '#rp-wait')) throw new Error('the DM was shown the waiting notice as well');
        if (process.env.SMOKE_SHOTS) { await host.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-dm.png` }); await watch.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-waiting.png` }); }
      });

      await run.do('the question is not dismissed by a tap outside it or Escape; a refused answer shows the engine\'s words', async () => {
        await phone.touchscreen.tap(4, 4);
        await phone.keyboard.press('Escape');
        await sleep(200);
        if (!(await shown(phone, '#rp .rp-card'))) throw new Error('the prompt went away without an answer');
        await phone.evaluate(() => window.hextable.act({ type: 'react', prompt: 999, take: null }));
        await wait(phone, () => document.querySelector('#rp-err') && !document.querySelector('#rp-err').hidden && document.querySelector('#rp-err').textContent.length > 5);
        if (!(await shown(phone, '#rp .rp-card'))) throw new Error('a refused answer closed the prompt');
      });

      await run.do('the phone answers Shield, and Shield is used', async () => {
        await sleep(700);
        const slots0 = await state(host, (S, W) => JSON.stringify(S.entities[W].slots), wren);
        await phone.locator('#rp .rp-take').tap();
        await waitShown(phone, '#rp', false);
        await wait(host, () => !window.hextable.state.pending);
        await wait(watch, () => document.querySelector('#rp-wait').hidden);
        const now = await state(host, (S, W) => ({ used: S.entities[W].reactionUsed, slots: JSON.stringify(S.entities[W].slots) }), wren);
        if (!now.used || now.slots === slots0) throw new Error(`Shield was not used after the phone answered: ${JSON.stringify(now)} (slots were ${slots0})`);
      });

      await run.do('asked again, the DM answers for the phone and the phone is released', async () => {
        // The next time Wren's turn comes round her Reaction is back.
        for (let k = 0; k < 40; k++) {
          const cur = await state(host, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === wren) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(host);
        }
        await provoke();
        await waitShown(phone, '#rp .rp-card');
        await sleep(700);
        await host.locator('#rp .rp-no').click();
        await waitShown(phone, '#rp', false);
        await wait(host, () => !window.hextable.state.pending);
        if (await state(host, (S, W) => S.entities[W].reactionUsed, wren)) throw new Error('the DM declined but a reaction was used');
      });
    } finally { await watchCtx.close(); await phoneCtx.close(); await hostCtx.close(); }
  });
}

// ---------- import from Fantasy Grounds ----------
// The DM picks a synthetic export (packages/rules/test/fixtures). The report is shown before anything changes; errors are
// shown plainly; a refused sheet shows the engine's words; on confirm the character joins and the report goes to the chronicle.
async function importFg(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    const tmp = mkdtempSync(join(tmpdir(), 'hextable-fgi-'));
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const fixture = (n) => fileURLToPath(new URL(`../packages/rules/test/fixtures/${n}`, import.meta.url));
      const count = () => state(page, (S) => Object.keys(S.entities).length);
      const pickFile = async (path) => {
        await page.evaluate(() => { document.querySelector('#fgi-file').value = ''; });      // what the button does before it opens the picker
        await page.setInputFiles('#fgi-file', path);
        await waitShown(page, '#fgi');
      };
      const openDM = async () => {
        await closePanels(page);
        if (!(await shown(page, '#dm'))) await openTab(page, 'dm');
        await waitShown(page, '#dm');
      };
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      let before;

      await run.do('the DM panel offers the import and the file picker is wired', async () => {
        await open(page, url); await playSolo(page);
        await openDM();
        await waitShown(page, '#dm-qe .fgi-open');
        before = await count();
      });

      await run.do('a file that is not XML is refused plainly', async () => {
        const bad = join(tmp, 'notes.xml'); writeFileSync(bad, 'this is not a character, just words');
        await pickFile(bad);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/not readable XML|does not look like/i.test(t)) throw new Error(`error text: ${t}`);
        if (await count() !== before) throw new Error('the table changed');
      });

      await run.do('XML that is not a Fantasy Grounds character is refused plainly', async () => {
        const bad = join(tmp, 'other.xml'); writeFileSync(bad, '<?xml version="1.0"?><root><thing/></root>');
        await pickFile(bad);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/Fantasy Grounds/i.test(t)) throw new Error(`error text: ${t}`);
      });

      await run.do('a file that is too large is refused plainly', async () => {
        const big = join(tmp, 'big.xml'); writeFileSync(big, Buffer.alloc(6_500_000, 'a'));
        await pickFile(big);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/too large/i.test(t)) throw new Error(`error text: ${t}`);
        await page.click('#fgi-close'); await waitShown(page, '#fgi', false);
      });

      await run.do('a real export shows its report before anything changes', async () => {
        await pickFile(fixture('fgxml-cleric.xml'));
        await waitShown(page, '#fgi-summary');
        const txt = await page.$eval('#fgi', (e) => e.innerText);
        for (const want of ['Mira Testwell', 'Divine Order', 'Sparkly Footwork', 'Destroy Undead', 'Fireball', 'Ring of Invented Warding', 'Nothing has been changed yet']) if (!txt.includes(want)) throw new Error(`the report does not show ${want}`);
        if (/\[Zed\]|Zed/.test(txt)) throw new Error("the player's name was shown");
        if (await count() !== before) throw new Error('the table changed before the DM confirmed');
        const m = await page.$eval('#fgi', (e) => ({ w: e.getBoundingClientRect().right, iw: innerWidth, sh: e.scrollHeight, ch: e.clientHeight, sx: e.scrollWidth, cx: e.clientWidth }));
        if (m.w > m.iw + 1 || m.sx > m.cx + 1) throw new Error(`the panel overflows sideways: ${JSON.stringify(m)}`);
        if (!(await page.$eval('#fgi', (e) => getComputedStyle(e).overflowY === 'auto'))) throw new Error('the panel does not scroll');
        const foot = await page.$eval('#fgi-add', (b) => { const r = b.getBoundingClientRect(); return [r.bottom, innerHeight, r.height]; });
        if (foot[0] > foot[1] || foot[2] < 40) throw new Error(`the confirm button is not reachable: ${JSON.stringify(foot)}`);
        await shot('import-report');
        await page.evaluate(() => document.querySelector('#fgi').scrollTo(0, 99999)); await shot('import-report-end');
      });

      await run.do('the engine refuses a replace: its words are shown and nothing is lost', async () => {
        // Select a character, open the import, then lose that character before confirming.
        await page.click('#fgi-close');
        await closePanels(page);
        const target = await page.evaluate(() => { const h = window.hextable, e = Object.values(h.state.entities).find((x) => x.kind === 'pc' && x.abil); h.select(e.id); return e.id; });
        await openDM(); await pickFile(fixture('fgxml-cleric.xml'));
        await waitShown(page, '#fgi-replace');
        await page.evaluate((id) => window.hextable.act({ type: 'remove', actor: id }), target);
        await wait(page, (id) => !window.hextable.state.entities[id], target);
        before = await count();
        if (!(await shown(page, '#fgi'))) await pickFile(fixture('fgxml-cleric.xml'));
        await (touch ? page.locator('#fgi-replace').tap() : page.click('#fgi-replace'));
        await waitShown(page, '#fgi-refused');
        const t = await page.$eval('#fgi-refused', (e) => e.textContent);
        if (t.length < 5) throw new Error('no refusal text');
        if (await count() !== before) throw new Error('a refused import changed the table');
        if (!(await shown(page, '#fgi-add:not([disabled])'))) throw new Error('the DM cannot try again');
      });

      await run.do('confirming adds the character and keeps the report in the chronicle', async () => {
        await (touch ? page.locator('#fgi-add').tap() : page.click('#fgi-add'));
        await waitShown(page, '#fgi', false);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Mira Testwell' && e.sheet?.class === 'cleric'));
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'chronicle' && /Mira Testwell/.test(e.title) && /Divine Order/.test(e.text) && !e.public));
        const sheet = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').sheet);
        if (sheet.subclass !== 'life' || sheet.level !== 5) throw new Error(`sheet: ${JSON.stringify(sheet).slice(0, 200)}`);
      });
    } finally { await ctx.close(); rmSync(tmp, { recursive: true, force: true }); }
  });
}

// ---------- stock maps ----------
// The DM starts on a stock map from the editor's Map file tool (two taps: the second confirms), and a
// character walks on it. Then every other stock map is loaded with the same action, as a page error would show.
async function stockMaps(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('open the lobby and play solo', async () => { await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter); });
      await run.do('pick the dungeon under Map file > Stock map and start on it', async () => {
        await closePanels(page);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        await page.click('#dm-edit'); await waitShown(page, '#editor');
        await page.click('#ed-tools [data-tool="file"]');
        await waitShown(page, '#ed-stock');
        await page.selectOption('#ed-stock', 'dungeon');
        await page.click('#ed-stockgo');                       // the first tap only arms it
        if ((await state(page, (S) => S.map.id)) === 'dungeon') throw new Error('one tap changed the map');
        await page.click('#ed-stockgo');
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
        const bad = await state(page, (S) => Object.values(S.entities).filter((e) => e.side !== 'party').length);
        if (bad) throw new Error('creatures from the old map are still there');
        await page.click('#ed-done'); await waitShown(page, '#editor', false);
      });
      await run.do('a character walks on the dungeon', async () => {
        const start = await state(page, (S) => S.entities.fighter.pos);
        await sleep(400);
        const pos = await selectAndMove(page, touch, 'fighter', 'Brenna');
        if (pos.q === start.q && pos.r === start.r) throw new Error('the character is where it was');
      });
      await run.do('every stock map loads and the party stands on it', async () => {
        const ids = await page.evaluate(async () => {
          const { STOCK_MAPS } = await import('./shared/content/maps/index.js'), out = [];
          for (const m of STOCK_MAPS) {
            const r = await window.hextable.act({ type: 'loadMap', map: structuredClone(m.map) });
            const S = window.hextable.state;
            out.push([m.id, S.map.id, Object.values(S.entities).every((e) => S.map.levels.some((l) => l.tiles[`${e.pos.q},${e.pos.r}`]))]);
          }
          return out;
        });
        for (const [want, got, stands] of ids) if (want !== got || !stands) throw new Error(`${want}: got map ${got}, standing ${stands}`);
      });
    } finally { await ctx.close(); }
  });
}

// ---------- timeline and pace ----------
// At pace `wait` (the default of a table with no setting): a goblin's attack, damage and fall play in order and the player's
// controls wake after them; a tap skips; the shown state stays behind the table's until its beat. Setup runs at `instant`.
// Still: no dice in the air and no beats left to play.
const calm = (p, ms = 15000) => wait(p, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, ms);
const setPace = (p, v) => p.evaluate((x) => { localStorage.setItem('hextable.pace', JSON.stringify(x)); window.hextable.timeline.setPace(window.hextable.pace()); }, v);
// Starts a fight with `pc` beside a foe and turns until it is the foe's turn. Leaves the page at instant pace.
async function foeTurn(page, hp) {
  await setPace(page, 'instant');
  const ids = await page.evaluate((hp0) => {
    const h = window.hextable;
    document.getElementById('dm-auto').checked = false;
    if (h.state.encounter) h.act({ type: 'endEncounter' });
    const alive = (e) => e.hp > 0 && !e.dead;
    const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && alive(e) && !e.hidden && (e.attacks?.length || e.actions?.length));
    const pc = Object.values(h.state.entities).find((e) => e.kind === 'pc' && alive(e));
    h.act({ type: 'setHp', actor: pc.id, hp: hp0 ?? pc.maxHp });
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
      h.act({ type: 'place', actor: pc.id, to: { q: foe.pos.q + dq, r: foe.pos.r + dr } });
      const p = h.state.entities[pc.id].pos;
      if (Math.max(Math.abs(p.q - foe.pos.q), Math.abs(p.r - foe.pos.r), Math.abs(p.q + p.r - foe.pos.q - foe.pos.r)) === 1) break;
    }
    h.act({ type: 'startEncounter', center: foe.pos });
    return { pc: pc.id, foe: foe.id };
  }, hp);
  await calm(page);
  for (let i = 0; i < 20; i++) {
    const cur = await page.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id; });
    if (cur === ids.foe) return ids;
    await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
    await calm(page);
  }
  throw new Error('it never became the foe\'s turn');
}
// What a foe does to hit a hero: one of its actions, or its first attack (runs in the page).
const strike = ([pcId, foeId]) => {
  const S = window.hextable.state, f = S.entities[foeId];
  const def = f.actions?.find((a) => JSON.stringify(a.effects ?? []).includes('"melee"'));
  window.hextable.act(def ? { type: 'act', actor: foeId, action: def.id, target: pcId } : { type: 'attack', actor: foeId, target: pcId, attack: f.attacks[0].id });
};
// The foe attacks the hero. Reads, in the same breath, what the screen says (the table's state is final, the shown one is not);
// then waits for stillness and returns the beats that played, with their times.
async function strikeAndWatch(page, { pc, foe }) {
  const at = await page.evaluate(() => performance.now());
  const now = await page.evaluate(([pcId, foeId, src]) => {
    (0, eval)(`(${src})`)([pcId, foeId]);
    const h = window.hextable;
    return { busy: h.timeline.busy(), waiting: !document.getElementById('pace-wait').hidden, shown: h.timeline.shown().entities[pcId].hp, real: h.state.entities[pcId].hp };
  }, [pc, foe, strike.toString()]);
  await calm(page);
  const beats = await page.evaluate((n) => window.hextable.played.filter((x) => x.t >= n), at);
  return { now, beats, still: await page.evaluate(() => ({ busy: window.hextable.timeline.busy(), waiting: !document.getElementById('pace-wait').hidden })) };
}

async function pacing(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts, { pace: 'wait' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('play solo at the default pace', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { window.hextable.dice.show = 'off'; });        // the dice are not what this pass is about
        if ((await page.evaluate(() => window.hextable.pace())) !== 'wait') throw new Error('the pace is not wait');
        await openTab(page, 'log');
      });
      let ids;
      await run.do('a goblin hits: attack, damage and the fall play in order before the controls wake', async () => {
        for (let i = 0; i < 12; i++) {
          ids = await foeTurn(page, 1);
          await setPace(page, 'wait');
          const r = await strikeAndWatch(page, ids);
          const types = r.beats.map((x) => x.type), hit = types.includes('damage');
          if (!hit) { if (!types.includes('attack') || r.still.busy) throw new Error(`a miss did not play and settle: ${types}`); continue; }
          const t = (k) => r.beats.find((x) => x.type === k);
          if (!r.now.busy || !r.now.waiting) throw new Error('no "…" and no wait while the beats start');
          if (r.now.real >= 1 || r.now.shown !== 1) throw new Error(`the screen is not behind the table: table ${r.now.real}, shown ${r.now.shown}`);
          if (t('attack').hp !== 1) throw new Error('the hit points drained with the attack');
          if (!(t('damage').hp < 1)) throw new Error('the hit points did not drain with the damage');
          if (!(t('damage').t - t('attack').t >= 450)) throw new Error(`the damage came ${Math.round(t('damage').t - t('attack').t)} ms after the strike`);
          const order = types.filter((k) => ['attack', 'damage', 'down', 'idle'].includes(k)).join();
          if (!/^attack,damage(,down)?,idle$/.test(order)) throw new Error(`out of order: ${types}`);
          if (r.still.busy || r.still.waiting) throw new Error('the controls did not wake');
          return;
        }
        throw new Error('the goblin missed twelve times');
      });
      await run.do('a tap on the map skips the beats and does not act', async () => {
        ids = await foeTurn(page, null);
        await setPace(page, 'wait');
        await page.evaluate(strike, [ids.pc, ids.foe]);
        if (!(await page.evaluate(() => window.hextable.timeline.busy()))) throw new Error('nothing is playing');
        const before = await state(page, (S) => JSON.stringify([S.entities, S.encounter.turn]));
        const pt = await page.evaluate(() => { const h = window.hextable; const e = Object.values(h.state.entities).find((x) => x.kind === 'pc'); const p = h.R.screenOf({ q: e.pos.q + 2, r: e.pos.r, z: e.pos.z }); return p; });
        await sleep(60);
        const canvasPt = (pt && await onCanvas(page, pt.x, pt.y)) ? pt : { x: opts.viewport.width / 2, y: 120 };
        // A slow machine can stretch a tap past the renderer's limit for one, so a tap that was not taken is made again.
        for (let k = 0; k < 4 && (await page.evaluate(() => window.hextable.timeline.busy())); k++) { await tapAt(page, touch, canvasPt.x, canvasPt.y); await sleep(150); }
        if (await page.evaluate(() => window.hextable.timeline.busy())) throw new Error('the tap did not skip');
        if (before !== (await state(page, (S) => JSON.stringify([S.entities, S.encounter.turn])))) throw new Error('the tap acted as well as skipped');
        if (await shown(page, '#pace-wait')) throw new Error('"…" is still showing');
      });
      await run.do('Escape skips too, and a button tap skips without acting', async () => {
        await calm(page);
        await page.evaluate(([pc, foe]) => window.hextable.act({ type: 'endTurn', actor: window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id }), [ids.pc, ids.foe]);
        if (!(await page.evaluate(() => window.hextable.timeline.busy()))) throw new Error('nothing is playing');
        await page.keyboard.press('Escape');
        if (await page.evaluate(() => window.hextable.timeline.busy())) throw new Error('Escape did not skip');
      });
      await run.do('pace instant plays at once, as before', async () => {
        await setPace(page, 'instant');
        await page.evaluate(() => { const S = window.hextable.state; const c = S.encounter.order[S.encounter.turn].id; window.hextable.act({ type: 'endTurn', actor: c }); });
        if (await page.evaluate(() => window.hextable.timeline.busy())) throw new Error('beats are playing at instant');
      });
      await run.do('the pace control in Settings sets this device\'s pace', async () => {
        await openTab(page, 'settings');
        await page.selectOption('#pace-pick', 'flow');
        if ((await page.evaluate(() => window.hextable.pace())) !== 'flow') throw new Error('flow was not chosen');
        await page.selectOption('#pace-pick', '');
        if ((await page.evaluate(() => window.hextable.pace())) !== 'wait') throw new Error('the default is not wait');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

// The monster AI runs in the DM's browser and waits for the picture; a phone player is not held up by it.
async function pacingTable(browser, url) {
  await scenario('timeline: a DM and a phone player', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } }, { pace: 'wait' });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { pace: 'wait' });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(phone, ' (phone)');
      let code, id;
      await run.do('the DM hosts, the phone joins and plays a character', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6, null, 20000);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });
      await run.do('a fight is started at instant pace on the DM and the phone', async () => {
        await setPace(host, 'instant'); await setPace(phone, 'instant');
        await host.evaluate((pc) => {
          const h = window.hextable, alive = (e) => e.hp > 0 && !e.dead;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && alive(e) && !e.hidden);
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: pc, to: { q: foe.pos.q + dq, r: foe.pos.r + dr } });
            const p = h.state.entities[pc].pos;
            if (Math.max(Math.abs(p.q - foe.pos.q), Math.abs(p.r - foe.pos.r), Math.abs(p.q + p.r - foe.pos.q - foe.pos.r)) === 1) break;
          }
          h.act({ type: 'startEncounter', center: foe.pos });
        }, id);
        await wait(phone, () => !!window.hextable.state.encounter);
      });
      await run.do('at wait, the DM\'s monsters act only once the picture is still; the phone follows without being held up', async () => {
        await setPace(host, 'wait'); await setPace(phone, 'wait');
        await host.evaluate(() => { document.getElementById('dm-auto').checked = true; });
        // Put the turn on a monster: end the turns of the heroes with the DM's controls (at wait, one at a time).
        const turnOf = (p) => p.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id ?? null; });
        // Every update with a monster's doing in it must arrive while nothing is playing: the AI waited for the picture.
        await host.evaluate(() => {
          const h = window.hextable, tl = h.timeline, push = tl.push; h.pushes = [];
          tl.push = (state, events, meta) => { h.pushes.push({ npc: events.some((e) => (e.type === 'attack' || e.type === 'moved' || e.type === 'turn') && (e.actor ?? e.id) && state.entities[e.actor ?? e.id]?.kind === 'npc' && e.type !== 'turn'), busy: tl.busy() }); return push(state, events, meta); };
        });
        for (let i = 0; i < 12; i++) {
          const cur = await turnOf(host);
          if (!cur) break;
          const mineNow = await host.evaluate((c) => window.hextable.state.entities[c].kind === 'pc', cur);
          if (mineNow) { await calm(host); await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); }
          await sleep(700);
        }
        await sleep(2500);
        const pushes = await host.evaluate(() => window.hextable.pushes);
        if (!pushes.some((x) => x.npc)) throw new Error('no monster acted');
        if (pushes.some((x) => x.npc && x.busy)) throw new Error(`a monster acted while the picture was playing: ${JSON.stringify(pushes)}`);
        await calm(host); await calm(phone);
        const same = await Promise.all([host, phone].map((p) => p.evaluate(() => JSON.stringify([window.hextable.state.encounter?.round, window.hextable.state.encounter?.turn, ...Object.values(window.hextable.state.entities).filter((e) => e.side === 'party').map((e) => [e.id, e.hp, e.pos.q, e.pos.r])]))));
        if (same[0] !== same[1]) throw new Error('the phone and the DM disagree once both are still');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// ---------- beats in the renderer (R4) ----------
// At pace `wait` a door opens over time and a goblin falls over time (the renderer's tweens are seen part way, then at their end);
// at `instant` both are at their end state the moment the update is shown. A skip ends what is easing. Nothing is left half played.
async function beats(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts, { pace: 'wait' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let door, pc;
      await run.do('start on the stock dungeon with a hero on a door, and a goblin to fall', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { window.hextable.dice.show = 'off'; });
        await setPace(page, 'instant');
        await page.evaluate(() => window.hextable.ED.stock('dungeon'));
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
        const ids = await page.evaluate(() => {
          const h = window.hextable, S = h.state, o = S.map.objects.find((x) => x.def === 'door-wooden' && x.state === 'open');
          const pcId = Object.values(S.entities).find((e) => e.kind === 'pc').id;
          h.act({ type: 'place', actor: pcId, to: { q: o.at.q, r: o.at.r } });
          h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: o.at.q + 1, r: o.at.r } });
          return { door: o.id, pc: pcId, goblin: Object.values(h.state.entities).find((e) => e.side === 'foe')?.id };
        });
        door = ids.door; pc = ids.pc;
        await page.evaluate((i) => { window.__door = i.door; window.__goblin = i.goblin; }, ids);
        if (!ids.goblin) throw new Error('no goblin to fall');
        await calm(page);
      });
      await run.do('at wait a door closes over time and a goblin falls over time', async () => {
        await setPace(page, 'wait');
        const g = await page.evaluate(() => window.__goblin);
        // The tweens start inside the update, so they are read in the same breath as the action; then the time they take is measured.
        const door0 = await page.evaluate(([p, d]) => {
          const h = window.hextable; window.__t0 = performance.now(); h.act({ type: 'use', actor: p, object: d, verb: 'close' });
          const x = (h.R.inner ?? h.R).doors.get(d);
          return { tw: !!x.tw, v: x.v, goal: x.goal };
        }, [pc, door]);
        if (!door0.tw || door0.v === door0.goal) throw new Error(`the door did not start to swing: ${JSON.stringify(door0)}`);
        await wait(page, (d) => !(window.hextable.R.inner ?? window.hextable.R).doors.get(d).tw, door, 5000);
        const took = await page.evaluate(() => performance.now() - window.__t0);
        if (took < 400) throw new Error(`the door swung in ${Math.round(took)} ms`);
        const end = await page.evaluate((d) => { const x = (window.hextable.R.inner ?? window.hextable.R).doors.get(d); return { v: x.v, goal: x.goal }; }, door);
        if (end.v !== end.goal || end.v !== 0) throw new Error(`the door did not end shut: ${JSON.stringify(end)}`);
        await calm(page);
        const fall0 = await page.evaluate((id) => {
          const h = window.hextable; window.__t0 = performance.now(); h.act({ type: 'harm', actor: id, amount: 99 });
          const a = (h.R.inner ?? h.R).actors.get(id);
          return { falling: !!a.tiltTw, tilt: a.tiltNow };
        }, g);
        if (!fall0.falling || fall0.tilt > 0.3) throw new Error(`the goblin did not start to fall: ${JSON.stringify(fall0)}`);
        await wait(page, (id) => { const a = (window.hextable.R.inner ?? window.hextable.R).actors.get(id); return window.hextable.state.entities[id].dead && !a.tiltTw && !a.dying; }, g, 8000);
        const t2 = await page.evaluate(() => performance.now() - window.__t0), tilt = await page.evaluate((id) => (window.hextable.R.inner ?? window.hextable.R).actors.get(id).tiltNow, g);
        if (t2 < 500 || Math.abs(tilt - 1.45) > 0.01) throw new Error(`the goblin fell in ${Math.round(t2)} ms and lies at ${tilt}`);
      });
      await run.do('a skip brings a running swing and fall to their end at once', async () => {
        await calm(page);
        const r = await page.evaluate(([p, d]) => {
          const h = window.hextable; h.act({ type: 'use', actor: p, object: d, verb: 'open' });
          const x = (h.R.inner ?? h.R).doors.get(d), before = { tw: !!x.tw, v: x.v, goal: x.goal, busy: h.timeline.busy() };
          h.timeline.skip();
          return { before, after: { tw: !!x.tw, v: x.v, goal: x.goal, busy: h.timeline.busy() } };
        }, [pc, door]);
        if (!r.before.tw) throw new Error(`the door did not start to swing: ${JSON.stringify(r)}`);
        const after = r.after;
        if (after.tw || after.v !== after.goal) throw new Error(`a skip left the door half way: ${JSON.stringify(after)}`);
      });
      await run.do('at instant the same changes show at once', async () => {
        await setPace(page, 'instant');
        const r = await page.evaluate(([p, d]) => {
          const h = window.hextable; h.act({ type: 'use', actor: p, object: d, verb: 'close' });
          const x = (h.R.inner ?? h.R).doors.get(d);
          return { tw: !!x.tw, v: x.v, goal: x.goal };
        }, [pc, door]);
        if (r.tw || r.v !== r.goal) throw new Error(`at instant the door was not at once: ${JSON.stringify(r)}`);
        const f = await page.evaluate(([d]) => {
          const h = window.hextable, o = h.state.map.objects.find((x) => x.id === d);
          const n = Object.keys(h.state.entities).length;
          for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1]]) { if (Object.keys(h.state.entities).length > n) break; h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: o.at.q + dq, r: o.at.r + dr } }); }
          const id = Object.values(h.state.entities).filter((e) => e.side === 'foe' && !e.dead).at(-1).id;
          h.act({ type: 'harm', actor: id, amount: 99 });
          const a = (h.R.inner ?? h.R).actors.get(id);
          return { dead: h.state.entities[id].dead, tilt: a.tiltNow, tw: !!a.tiltTw, dying: !!a.dying };
        }, [door]);
        if (!f.dead || f.tw || f.dying || Math.abs(f.tilt - 1.45) > 0.01) throw new Error(`at instant the goblin did not fall at once: ${JSON.stringify(f)}`);
      });
    } finally { await ctx.close(); }
  });
}

// ---------- table controls (issue #163) ----------
// The DM's pace setting, the stock maps (lobby and DM panel, asking before a map replaces a game) and the import report kept in the
// chronicle with a line on the sheet. Solo, then a DM with a phone player, who must see the pace and nothing of the report.
async function controlsSolo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      const openDM = async () => { await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm'); };
      await run.do('the lobby offers the stock maps and solo starts on the one chosen', async () => {
        await open(page, url);
        const opts2 = await page.$$eval('#lobby-map option', (o) => o.map((x) => x.value));
        if (opts2.length !== 6 || opts2[0] !== '') throw new Error(`lobby maps: ${opts2}`);
        await shot('controls-lobby');
        await page.selectOption('#lobby-map', 'cave');
        await playSolo(page);
        await wait(page, () => window.hextable.state.map.id === 'cave');
        if (await state(page, (S) => Object.values(S.entities).filter((e) => e.side === 'party').length) < 1) throw new Error('no party');
      });
      await run.do('the DM sets the pace, and the table keeps it', async () => {
        await openDM();
        await page.selectOption('#dm-pace', 'flow');
        await wait(page, () => window.hextable.state.settings.pace === 'flow');
        await page.selectOption('#dm-pace', 'instant');
        await wait(page, () => window.hextable.state.settings.pace === 'instant');
        if (!/instant/.test(await page.$eval('#pace-table', (e) => e.textContent))) throw new Error('the pace line did not follow');
        await shot('controls-dm');
      });
      await run.do('a map over a game in progress asks first, then loads', async () => {
        await page.selectOption('#dm-stock', 'tavern');
        await tap(page, '#dm-stock-go');
        if ((await state(page, (S) => S.map.id)) === 'tavern') throw new Error('one tap loaded the map');
        await waitShown(page, '#dm-stock-ask');
        const ask = await page.$eval('#dm-stock-ask', (e) => e.textContent);
        if (!/Copper Kettle/.test(ask)) throw new Error(`the question: ${ask}`);
        await shot('controls-ask');
        await tap(page, '#dm-stock-go');
        await wait(page, () => window.hextable.state.map.id === 'tavern');
        await page.selectOption('#dm-stock', 'keep');                       // choosing another map cancels the question
        await tap(page, '#dm-stock-go'); await page.selectOption('#dm-stock', 'dungeon');
        if (await shown(page, '#dm-stock-ask')) throw new Error('changing the choice did not cancel the question');
        await sleep(300);
        if ((await state(page, (S) => S.map.id)) !== 'tavern') throw new Error('the map changed without a second tap');
      });
      await run.do('the import says only the DM can import, and the report lands in the chronicle by itself', async () => {
        await closePanels(page); await openDM();
        await waitShown(page, '#dm-qe .fgi-open');
        await page.evaluate(() => { document.querySelector('#fgi-file').value = ''; });
        await page.setInputFiles('#fgi-file', fileURLToPath(new URL('../packages/rules/test/fixtures/fgxml-cleric.xml', import.meta.url)));
        await waitShown(page, '#fgi-summary');
        if (!/Only the DM can import/.test(await page.$eval('#fgi-dm-only', (e) => e.textContent))) throw new Error('no DM-only line');
        if (await page.$('#fgi-chron')) throw new Error('the report is still a choice');
        await shot('controls-import');
        await tap(page, '#fgi-add');
        await waitShown(page, '#fgi', false);
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'chronicle' && e.title === 'Mira Testwell' && /Divine Order/.test(e.text) && !e.public && e.tags?.includes('fg-import')));
      });
      await run.do("the character's sheet says where the report is", async () => {
        await closePanels(page);
        const id = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').id);
        await page.evaluate((i) => window.hextable.select(i), id);
        await waitShown(page, '#btn-sheet'); await tap(page, '#btn-sheet');
        await waitShown(page, '#sheet-import');
        const t = await page.$eval('#sheet-import', (e) => e.textContent);
        if (!/chronicle/.test(t) || !/Mira Testwell/.test(t)) throw new Error(t);
        await shot('controls-sheet');
        const other = await state(page, (S) => Object.values(S.entities).find((e) => e.kind === 'pc' && e.name !== 'Mira Testwell').id);
        await page.evaluate((i) => window.hextable.select(i), other);
        await wait(page, () => !document.querySelector('#sheet-import'));
      });
    } finally { await ctx.close(); }
  });
}

async function controlsTable(browser, url) {
  await scenario('controls: a DM hosts on a map, a phone player sees the pace and none of the report', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(phone, ' (phone)');
      const frames = [];
      phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
      let code;
      await run.do('the DM hosts on the dungeon and a phone joins', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM');
        await host.selectOption('#lobby-map', 'dungeon');
        await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6, null, 20000);
        await wait(host, () => window.hextable.state.map.id === 'dungeon');
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.map?.id === 'dungeon');
      });
      await run.do('the DM sets the pace and the phone sees it but cannot change it', async () => {
        await host.selectOption('#dm-pace', 'flow');
        await wait(phone, () => window.hextable.state.settings.pace === 'flow');
        await openTab(phone, 'settings');
        await wait(phone, () => /flow/.test(document.querySelector('#pace-table').textContent));
        if (!/Only the DM/.test(await phone.$eval('#pace-table', (e) => e.textContent))) throw new Error('the phone is not told it cannot change it');
        if (await phone.$('#dm-pace:not([hidden])') && (await shown(phone, '#dm-pace'))) throw new Error('the phone can see the DM control');
        await phone.evaluate(() => window.hextable.act({ type: 'setting', key: 'pace', value: 'instant' }));
        await sleep(600);
        if ((await state(phone, (S) => S.settings.pace)) !== 'flow') throw new Error('a player changed the pace');
        await phone.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/controls-phone-pace.png` : '/dev/null' }).catch(() => {});
        await closeMenu(phone);
      });
      await run.do('the DM loads another stock map after being asked; the phone follows', async () => {
        await host.selectOption('#dm-stock', 'forest-road');
        await host.click('#dm-stock-go');
        if ((await state(host, (S) => S.map.id)) !== 'dungeon') throw new Error('one tap loaded it');
        await host.click('#dm-stock-go');
        await wait(host, () => window.hextable.state.map.id === 'forest-road');
        await wait(phone, () => window.hextable.state.map.id === 'forest-road');
      });
      await run.do('an import writes a DM-only chronicle entry that no player is sent', async () => {
        await host.evaluate(() => { document.querySelector('#fgi-file').value = ''; });
        await host.setInputFiles('#fgi-file', fileURLToPath(new URL('../packages/rules/test/fixtures/fgxml-cleric.xml', import.meta.url)));
        await waitShown(host, '#fgi-summary');
        await host.click('#fgi-add');
        await waitShown(host, '#fgi', false);
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Mira Testwell'));
        await sleep(500);
        await closeMenu(host).catch(() => {});
        // The DM's sheet line is there after the history has come back.
        const id = await state(host, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').id);
        await host.evaluate((i) => window.hextable.select(i), id);
        await waitShown(host, '#btn-sheet'); await host.click('#btn-sheet');
        await wait(host, () => document.querySelector('#sheet-import'));
        // What the phone has been sent, live: nothing of the report. And what it gets when it asks for the record.
        const leak = frames.find((f) => /fg-import|Imported from Fantasy|ADJUSTMENTS|"chronicle"/.test(f));
        if (leak) throw new Error(`the phone was sent the report: ${leak.match(/.{0,60}(fg-import|Imported from Fantasy|ADJUSTMENTS|"chronicle").{0,60}/)?.[0]}`);
        const asked = await phone.evaluate(() => new Promise((resolve) => {
          const sess = JSON.parse(localStorage.getItem('hextable.session')), got = [];
          const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
          ws.onopen = () => ws.send(JSON.stringify({ t: 'resume', ...sess }));
          ws.onmessage = (m) => { got.push(m.data); if (JSON.parse(m.data).t === 'welcome') { ws.send(JSON.stringify({ t: 'history', types: ['chronicle'], limit: 200 })); ws.send(JSON.stringify({ t: 'history', limit: 500 })); } };
          setTimeout(() => { ws.close(); resolve(got); }, 1500);
        }));
        if (!asked.some((f) => JSON.parse(f).t === 'history')) throw new Error('the phone got no history answer to check');
        if (asked.some((f) => /fg-import|Imported from Fantasy|ADJUSTMENTS/.test(f))) throw new Error('the phone got the report from the history');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// ---------- class features that need a choice (#170) ----------
// A cleric uses Divine Spark in each of its three modes, a druid takes a form and leaves it, a sorcerer
// casts with one Metamagic option and the Sorcery Points go down. Every control is driven by tapping.
async function classes(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const ids = {};
      const A = { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 16 };
      const sheets = {
        Cleo: { name: 'Cleo', class: 'cleric', level: 14, subclass: 'life', abilities: A, skills: ['insight', 'religion'], choices: {}, spells: [] },
        Dru: { name: 'Dru', class: 'druid', level: 14, subclass: 'land', abilities: A, skills: ['nature', 'perception'], choices: {}, spells: [] },
        Sorsha: { name: 'Sorsha', class: 'sorcerer', level: 15, subclass: 'draconic', abilities: { ...A, cha: 18 }, skills: ['arcana', 'insight'],
          choices: { metamagic: ['careful', 'quickened'], 'metamagic-10': ['heightened', 'transmuted'], 'elemental-affinity': 'fire' }, spells: ['fire-bolt', 'fireball', 'hold-person', 'haste', 'burning-hands'] },
      };
      const uses = (n, f) => state(page, (S, a) => S.entities[a[0]].uses[a[1]], [ids[n], f]);
      const pick = async (n) => { await closePanels(page); await tap(page, `#party button:has-text("${n}")`); await wait(page, (i) => window.hextable.state.entities[i] && !document.querySelector('#card').hidden, ids[n]); };
      const bar = async (text) => { await pick(text.who); await tap(page, `#actions button:has-text("${text.btn}")`); };
      const tapCreature = async (target) => {
        await settle(page, target);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), target);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('the target is off screen or under a panel');
        await tapAt(page, touch, pt.x, pt.y);
      };
      const newest = (since) => state(page, (S, n) => S.timeline.slice(n).map((e) => e.type), since);

      await run.do('a level 14 cleric, a level 14 druid and a level 15 sorcerer join the party', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async (sh) => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          let q = 0;
          for (const s of Object.values(sh)) { const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s))); h.act({ type: 'addCharacter', record: r.record, at: { q: -3 + q++, r: 4, z: 0 } }); }
        }, sheets);
        for (const n of Object.keys(sheets)) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n); ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n); }
      });

      await run.do('the cleric offers Divine Spark with a chooser of its three modes', async () => {
        await pick('Cleo');
        await tap(page, '#actions button:has-text("Divine Spark")');
        await waitShown(page, '#cp .cp-card');
        const modes = await page.$$eval('#cp .cp-mode', (b) => b.map((x) => x.dataset.mode));
        if (modes.join() !== 'heal,radiant,necrotic') throw new Error(`modes: ${modes}`);
        const box = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[3] || box[2] > box[4]) throw new Error(`the panel does not fit: ${JSON.stringify(box)}`);
        const small = await page.$$eval('#cp .cp-mode', (b) => b.some((x) => x.getBoundingClientRect().height < 40));
        if (small) throw new Error('a mode button is too small to touch');
        await tap(page, '#cp-close'); await waitShown(page, '#cp', false);
      });

      for (const [mode, what] of [['heal', 'an ally'], ['radiant', 'a goblin'], ['necrotic', 'a goblin']]) {
        await run.do(`Divine Spark in ${mode} mode: armed with the mode, then a tap on ${what} sends it`, async () => {
          const target = what === 'an ally' ? ids.Dru : await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden).id);
          if (what !== 'an ally') await page.evaluate(([f, c]) => { const h = window.hextable; const S = h.state, e = S.entities[c]; h.act({ type: 'place', actor: f, to: { q: e.pos.q + 1, r: e.pos.r - 1 } }); }, [target, ids.Cleo]);
          const before = await uses('Cleo', 'channel-divinity'), tl = await state(page, (S) => S.timeline.length);
          await pick('Cleo'); await tap(page, '#actions button:has-text("Divine Spark")');
          await tap(page, `#cp .cp-mode[data-mode="${mode}"]`);
          await wait(page, () => window.hextable.mode.kind === 'feature');
          const m = await page.evaluate(() => window.hextable.mode.extra?.mode); if (m !== mode) throw new Error(`armed with mode ${m}`);
          await tapCreature(target);
          await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['channel-divinity'] < b, [ids.Cleo, before]);
          const types = await newest(tl);
          if (types.includes('manual')) throw new Error(`the DM was handed it: ${types}`);
          if (!types.some((t) => t !== 'std')) throw new Error(`nothing happened beyond the announcement: ${types}`);
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), ids.Cleo).catch(() => {});
        });
      }

      await run.do('the druid takes a form from the list the engine offers, and the card and the sheet say so', async () => {
        await pick('Dru');
        await tap(page, '#actions button:has-text("Wild Shape")');
        await waitShown(page, '#cp .cp-card');
        const forms = await page.$$eval('#cp-form option', (o) => o.map((x) => x.value));
        const bad = await page.evaluate(async (f) => { const { CONTENT } = await import('./shared/content/index.js'); return f.filter((id) => CONTENT.monsters[id].type !== 'beast' || CONTENT.monsters[id].cr > 1); }, forms);
        if (forms.length < 20 || !forms.includes('wolf') || bad.length) throw new Error(`forms: ${forms.length}, outside the druid's limits: ${bad}`);
        await page.selectOption('#cp-form', 'wolf');
        const before = await uses('Dru', 'wild-shape');
        await tap(page, '#cp-use');
        await wait(page, (i) => window.hextable.state.entities[i].form, ids.Dru);
        if (await uses('Dru', 'wild-shape') !== before - 1) throw new Error('the use was not spent');
        const form = await state(page, (S, i) => S.entities[i].form, ids.Dru);
        if ((form.block ?? form) !== 'wolf') throw new Error(`form: ${JSON.stringify(form)}`);
        if (!/Wolf form/.test(await page.$eval('#c-res', (x) => x.textContent))) throw new Error('the card does not say the druid is a wolf');
        await closePanels(page); await tap(page, '#btn-sheet'); await waitShown(page, '#sheet-form');
        if (!/form of a Wolf/.test(await page.$eval('#sheet-form', (x) => x.textContent))) throw new Error('the sheet banner');
        await tap(page, '#sheet [data-leave-form]');
        await wait(page, (i) => !window.hextable.state.entities[i].form, ids.Dru);
        if (await shown(page, '#sheet-form')) throw new Error('the banner stayed after leaving the form');
      });

      await run.do('a refusal is shown in the panel with the choice kept; a form is changed and left from the bar', async () => {
        await pick('Dru');
        await tap(page, '#actions button:has-text("Wild Shape")'); await page.selectOption('#cp-form', 'brown-bear'); await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        if (!/room/.test(await page.$eval('#cp-err', (x) => x.textContent))) throw new Error('the engine\'s refusal is not in the panel');
        if ((await page.$eval('#cp-form', (x) => x.value)) !== 'brown-bear') throw new Error('the choice was not kept');
        await page.selectOption('#cp-form', 'boar'); await tap(page, '#cp-use');
        await wait(page, (i) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === 'boar', ids.Dru);
        await pick('Dru');
        if (!/Boar/.test(await page.$eval('#actions', (x) => x.textContent))) throw new Error('the bar does not say the druid is a boar');
        if (!(await page.$$eval('#actions button', (b) => b.some((x) => /Gore|Tusk/i.test(x.textContent))))) throw new Error('the bar shows no attack of the form');
        await tap(page, '#actions button:has-text("Wild Shape")');
        if (!/Boar/.test(await page.$eval('#cp-form-now', (x) => x.textContent))) throw new Error('the panel does not say which form');
        await page.selectOption('#cp-form', 'panther'); await tap(page, '#cp-use');
        await wait(page, (i) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === 'panther', ids.Dru);
        await pick('Dru'); await tap(page, '#actions button:has-text("Wild Shape")'); await tap(page, '#cp-leave');
        await wait(page, (i) => !window.hextable.state.entities[i].form, ids.Dru);
      });

      await run.do('the sorcerer casts Fire Bolt with Quickened Spell: the Metamagic panel shows the cost, the points go down', async () => {
        const foe = await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden).id);
        await page.evaluate(([f, c]) => { const h = window.hextable, e = h.state.entities[c]; h.act({ type: 'place', actor: f, to: { q: e.pos.q + 1, r: e.pos.r - 1 } }); }, [foe, ids.Sorsha]);
        // A goblin beside her: the fight starts now, and her first action waits for her turn.
        await page.evaluate((c) => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[c].pos }), ids.Sorsha);
        for (let k = 0; k < 40; k++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (!cur || cur === ids.Sorsha) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        const before = await uses('Sorsha', 'font-of-magic');
        await pick('Sorsha');
        await tap(page, '#actions button:has-text("Metamagic")');
        await waitShown(page, '#cp .cp-card');
        const opts = await page.$$eval('#cp [data-meta]', (b) => b.map((x) => x.dataset.meta));
        if (opts.join() !== 'careful,quickened,heightened,transmuted') throw new Error(`the options known: ${opts}`);
        await page.selectOption('#cp-spell', 'fire-bolt');
        const off = await page.$$eval('#cp [data-meta]', (b) => b.filter((x) => x.disabled).map((x) => x.dataset.meta).join());
        if (off !== 'careful,heightened') throw new Error(`a cantrip with an attack roll: Careful and Heightened should be greyed out, not: ${off}`);
        await tap(page, '#cp [data-meta="quickened"]');
        const extra = await page.$$eval('#cp [data-meta]', (b) => b.filter((x) => x.disabled).map((x) => x.dataset.meta).join());
        if (!/transmuted/.test(extra)) throw new Error(`one option a spell: the others should be greyed out: ${extra}`);
        const note = await page.$eval('#cp .cp-note', (x) => x.textContent);
        if (!new RegExp(`${before} Sorcery Points left; this costs 2, leaving ${before - 2}`).test(note)) throw new Error(`the note: ${note}`);
        await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'spell');
        if (!/Quickened: 2 SP/.test(await page.$eval('#hint-text', (x) => x.textContent))) throw new Error('the hint does not carry the Metamagic');
        const tl = await state(page, (S) => S.timeline.length);
        await tapCreature(foe);
        try { await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['font-of-magic'] === b - 2, [ids.Sorsha, before], 25000); }
        catch { throw new Error(`the cast did not go through; ${await page.evaluate(([f, c]) => { const h = window.hextable, S = h.state; return JSON.stringify([S.entities[f].pos, S.entities[f].hp, S.entities[c].pos, S.encounter?.order[S.encounter.turn]?.id === c, h.R.screenOf(S.entities[f].pos)]); }, [foe, ids.Sorsha])} toast: "${await page.$eval('#toast', (x) => x.hidden ? '' : x.textContent)}", points ${await uses('Sorsha', 'font-of-magic')} of ${before}, mode ${await page.evaluate(() => window.hextable.mode.kind)}`); }
        const types = await newest(tl);
        if (!types.includes('cast')) throw new Error(`no cast: ${types}`);
      });

      await run.do('Font of Magic: spending a slot for points, and a refusal in the engine\'s words when it is over the maximum', async () => {
        await page.evaluate(() => { if (window.hextable.state.encounter) window.hextable.act({ type: 'endEncounter' }); });       // the last cast may already have won it (the dice are not fixed)
        await wait(page, () => !window.hextable.state.encounter && window.hextable.waiting === 0, null, 25000);
        await pick('Sorsha');
        await page.waitForSelector('#actions button:has-text("Font of Magic")', { timeout: 20000 });
        await tap(page, '#actions button:has-text("Font of Magic")');
        await waitShown(page, '#cp .cp-card');
        await tap(page, '#cp [data-how="spend"]'); await tap(page, '#cp [data-level="3"]');
        await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        if (!/more than 15 points/.test(await page.$eval('#cp-err', (x) => x.textContent))) throw new Error('refusal not shown');
        const slots = await state(page, (S, i) => S.entities[i].slots[3], ids.Sorsha), pts = await uses('Sorsha', 'font-of-magic');
        await tap(page, '#cp [data-how="make"]'); await tap(page, '#cp [data-level="3"]');
        await tap(page, '#cp-use');
        await wait(page, ([i, n]) => window.hextable.state.entities[i].slots[3] === n + 1, [ids.Sorsha, slots]);
        if (await uses('Sorsha', 'font-of-magic') !== pts - 5) throw new Error('a level 3 slot should cost 5 points');
        await pick('Sorsha'); await tap(page, '#actions button:has-text("Font of Magic")');
        await tap(page, '#cp [data-how="spend"]'); await tap(page, '#cp [data-level="1"]'); await tap(page, '#cp-use');
        await wait(page, ([i, n]) => window.hextable.state.entities[i].uses['font-of-magic'] === n + 1, [ids.Sorsha, pts - 5]);
      });

      await run.do('a paladin and a bard join once the fight is over', async () => {
        await page.evaluate(() => { if (window.hextable.state.encounter) window.hextable.act({ type: 'endEncounter' }); });       // the last cast may already have won it (the dice are not fixed)
        await wait(page, () => !window.hextable.state.encounter, null, 20000);
        sheets.Pala = { name: 'Pala', class: 'paladin', level: 13, subclass: 'devotion', abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, skills: ['athletics', 'persuasion'], choices: {}, spells: [] };
        sheets.Bardo = { name: 'Bardo', class: 'bard', level: 13, subclass: 'lore', abilities: { ...A, cha: 18 }, skills: ['arcana', 'history', 'performance'], choices: {}, spells: [] };
        await page.evaluate(async (sh) => {
          const D = await import('./shared/derive.js'), h = window.hextable; let q = 0;
          for (const s of [sh.Pala, sh.Bardo]) { const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s))); h.act({ type: 'addCharacter', record: r.record, at: { q: -3 + q++, r: 5, z: 0 } }); }
        }, sheets);
        for (const n of ['Pala', 'Bardo']) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n); ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n); }
      });

      await run.do('Lay On Hands: a refused condition shows in the panel, then the pool pays for the Hit Points', async () => {
        await pick('Pala');
        await tap(page, '#actions button:has-text("Lay On Hands")');
        await waitShown(page, '#cp .cp-card');
        await page.fill('#cp-amount', '5');
        await tap(page, '#cp [data-cure="poisoned"]');
        await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        const err = await page.$eval('#cp-err', (x) => x.textContent);
        if (!/not poisoned|does not|isn't/i.test(err)) throw new Error(`the refusal: ${err}`);
        if (!(await page.$eval('#cp [data-cure="poisoned"]', (x) => x.checked)) || (await page.$eval('#cp-amount', (x) => x.value)) !== '5') throw new Error('the choice was not kept');
        const before = await uses('Pala', 'lay-on-hands');
        await tap(page, '#cp [data-cure="poisoned"]'); await tap(page, '#cp-use');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['lay-on-hands'] === b - 5, [ids.Pala, before], 25000);
      });

      await run.do('Divine Intervention: the cleric picks a spell from the list and casts it with no slot', async () => {
        await pick('Cleo');
        await tap(page, '#actions button:has-text("Divine Intervention")');
        await waitShown(page, '#cp .cp-card');
        const spells = await page.$$eval('#cp-spell option', (o) => o.map((x) => x.value));
        if (spells.length < 5 || !spells.includes('cure-wounds')) throw new Error(`the list: ${spells}`);
        await page.selectOption('#cp-spell', 'cure-wounds');
        await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'spell' && /no spell slot/.test(document.getElementById('hint-text').textContent));
        const before = await uses('Cleo', 'divine-intervention'), slots = await state(page, (S, i) => JSON.stringify(S.entities[i].slots), ids.Cleo);
        await tapCreature(ids.Pala);
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['divine-intervention'] === b - 1, [ids.Cleo, before], 25000);
        if ((await state(page, (S, i) => JSON.stringify(S.entities[i].slots), ids.Cleo)) !== slots) throw new Error('a spell slot was spent');
      });

      await run.do('Bardic Inspiration: arm it and tap an ally', async () => {
        await pick('Bardo');
        const before = await uses('Bardo', 'bardic-inspiration');
        await tap(page, '#actions button:has-text("Bardic Inspiration")');
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapCreature(ids.Pala);
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['bardic-inspiration'] === b - 1, [ids.Bardo, before], 25000);
        await pick('Bardo'); await tap(page, '#btn-sheet'); await waitShown(page, '#sheet-reactions');
        const rx = await page.$$eval('#sheet-reactions [data-rx-set]', (e) => e.map((x) => x.dataset.rxSet));
        if (!rx.includes('countercharm')) throw new Error(`reactions on the bard's sheet: ${rx}`);
      });

      await run.do('the DM\'s Short Rest offers Sorcerous Restoration, and the points come back', async () => {
        const pts = await uses('Sorsha', 'font-of-magic');
        if (pts >= 15) throw new Error('the sorcerer has spent no points to get back');
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await tap(page, '#dm-short-rest');
        await waitShown(page, `#sr-restore-${ids.Sorsha}`);
        await page.check(`#sr-restore-${ids.Sorsha}`);
        await tap(page, '#dm-short-go');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['font-of-magic'] > b, [ids.Sorsha, pts], 25000);
      });
    } finally { await ctx.close(); }
  });
}

// ---------- defeat ----------
// The party has fallen (packages/client/defeat.js): dying is not defeat, so no card while anyone is still rolling; the card when every
// character is dead or stable; the DM's choices; a reload shows it again; rewinding brings the party back standing.
async function defeat(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      const cardUp = () => shown(page, '#df');
      let pcs;
      await run.do('a fight starts and every character is brought to 0 Hit Points', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        pcs = await page.evaluate(() => {
          const h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });       // wide, so the whole party is in it
          const ids = Object.values(h.state.entities).filter((e) => e.side === 'party' && e.kind === 'pc' && e.hp > 0).map((e) => e.id);
          for (const id of ids) h.act({ type: 'harm', actor: id, amount: h.state.entities[id].hp });
          return ids;
        });
        await calm(page);
        const now = await state(page, (S, ids) => ({ fight: !!S.encounter, hp: ids.map((i) => S.entities[i].hp), dead: ids.map((i) => S.entities[i].dead) }), pcs);
        if (!now.fight || now.hp.some((h) => h !== 0) || now.dead.some(Boolean)) throw new Error(`not all dying: ${JSON.stringify(now)}`);
        if (await cardUp()) throw new Error('the card is up while the party is only dying');
      });
      await run.do('death saves roll turn by turn and there is still no card', async () => {
        await page.evaluate(() => { window.hextable.played.length = 0; });
        for (let i = 0; i < 40; i++) {
          if (await page.evaluate(() => window.hextable.played.some((p) => p.type === 'deathSave'))) break;
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id ?? null);
          if (!cur) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(page);
        }
        if (!(await page.evaluate(() => window.hextable.played.some((p) => p.type === 'deathSave')))) throw new Error('no Death Saving Throw was rolled');
        const left = await state(page, (S, ids) => ids.filter((i) => !S.entities[i].dead && S.entities[i].hp <= 0 && !S.entities[i].cond.stable).length, pcs);
        if (left > 0 && (await cardUp())) throw new Error('the card is up while someone is still dying');
        await openTab(page, 'log');
        const text = await page.textContent('#log-list');
        if (!/Death Save/.test(text)) throw new Error('the log shows no Death Save');
        await closeMenu(page);
      });
      await run.do('the card comes only when the last one has died', async () => {
        for (let k = 0; k < pcs.length; k++) {
          const id = pcs[k];
          for (let n = 0; n < 8; n++) {
            const e = await state(page, (S, i) => ({ dead: S.entities[i].dead, hp: S.entities[i].hp, over: !S.encounter }), id);
            if (e.dead || e.over) break;
            if (k === pcs.length - 1 && n === 0 && (await cardUp())) throw new Error('the card is up before the last character fell');
            await page.evaluate(([i, hp]) => window.hextable.act({ type: 'harm', actor: i, amount: Math.max(1, hp) }), [id, e.hp]);
            await calm(page);
          }
        }
        await waitShown(page, '#df');
        const t = await page.textContent('#df-title');
        if (t.trim() !== 'The party has fallen.') throw new Error(`title: ${t}`);
        const rows = await page.$$eval('#df .df-who li', (l) => l.map((x) => x.textContent));
        if (rows.length !== pcs.length || !rows.every((r) => /died|down, stable/.test(r))) throw new Error(`rows: ${rows}`);
        if (/!/.test(await page.textContent('#df'))) throw new Error('an exclamation mark on the card');
        await shot('defeat-card');
      });
      await run.do('the card fits the screen, its buttons are big enough, and the map around it is still the map', async () => {
        const m = await page.evaluate(() => {
          const c = document.querySelector('.df-card').getBoundingClientRect();
          const small = [...document.querySelectorAll('#df button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent);
          return { c: { l: c.left, r: c.right, t: c.top, b: c.bottom }, w: innerWidth, h: innerHeight, small, off: document.querySelector('#df').style.pointerEvents, probe: document.elementFromPoint(4, innerHeight / 2)?.id };
        });
        if (m.c.l < 0 || m.c.r > m.w || m.c.t < 0 || m.c.b > m.h) throw new Error(`the card is off the screen: ${JSON.stringify(m.c)}`);
        if (m.small.length) throw new Error(`buttons under 44 px: ${m.small}`);
        if (m.probe !== 'gl') throw new Error(`a tap beside the card would hit ${m.probe}, not the map`);
        const btns = await page.$$eval('#df .df-choice button', (b) => b.map((x) => [x.textContent, x.disabled]));
        if (btns.length !== 3 || btns[0][0] !== 'Try the fight again' || btns[0][1] || btns[1][0] !== 'Go back to the last rest' || btns[2][0] !== 'Carry on') throw new Error(`choices: ${JSON.stringify(btns)}`);
        if (!btns[1][1]) throw new Error('"go back to the last rest" is offered with no rest to go back to');
        if (!/No rest to go back to/.test(await page.textContent('#df .df-choice.off p'))) throw new Error('the greyed choice does not say why');
      });
      await run.do('with another theme and the menu open, closed or pinned the card and the menu do not fight', async () => {
        await openTab(page, 'settings');
        await page.selectOption('#set-theme', 'sunlit');
        const front = () => page.evaluate(() => { const c = document.querySelector('.df-card').getBoundingClientRect(); return { inside: !!document.elementFromPoint(c.left + c.width / 2, c.top + 30)?.closest('#df'), r: c.right, l: c.left, w: innerWidth, dr: document.getElementById('drawer').getBoundingClientRect().left, dl: document.getElementById('drawer').getBoundingClientRect().right }; });
        let f = await front();
        if (touch && f.inside) throw new Error('the card is in front of the open menu, which the person asked for');
        await closeMenu(page);
        if (!(await front()).inside) throw new Error('the card is hidden once the menu is closed');
        if (!touch) {
          await openTab(page, 'turns');
          await page.evaluate(() => window.hextable.drawer.setPin(true));
          await sleep(500);
          f = await front();
          if (f.r > f.dr + 1) throw new Error(`the card runs under the pinned menu: ${JSON.stringify(f)}`);
          await shot('defeat-pinned');
          await page.evaluate(() => window.hextable.drawer.setPin(false));
          await closeMenu(page);
        }
      });
      await run.do('the card can be put aside and brought back', async () => {
        await tap(page, '#df .df-x');
        await waitShown(page, '#df', false); await waitShown(page, '#df-chip');
        await tap(page, '#df-chip');
        await waitShown(page, '#df'); await waitShown(page, '#df-chip', false);
      });
      await run.do('a reload while the party is down shows the card again', async () => {
        await page.reload();
        await waitShown(page, '#lobby');
        await playSolo(page);       // the solo game is kept in this browser
        await waitShown(page, '#df');
      });
      await run.do('carry on closes the card and changes nothing; the DM tab brings it back', async () => {
        const before = await state(page, (S) => JSON.stringify(S));
        await tap(page, '#df .df-choice button:has-text("Carry on")');
        await waitShown(page, '#df', false);
        if ((await state(page, (S) => JSON.stringify(S))) !== before) throw new Error('carrying on changed the table');
        await openTab(page, 'dm');
        await waitShown(page, '#dm-fallen-open');
        await page.click('#dm-fallen-open');
        await waitShown(page, '#df');
        await closeMenu(page);
      });
      await run.do('try the fight again asks first, then brings the party back standing', async () => {
        await tap(page, '#df .df-choice button:has-text("Try the fight again")');
        await wait(page, () => /Undo brings it back/.test(document.querySelector('#df .df-sure')?.textContent ?? ''));
        const same = await state(page, (S) => S.entities && Object.values(S.entities).filter((e) => e.kind === 'pc').every((e) => e.dead || e.hp <= 0));
        if (!same) throw new Error('the table moved before the DM agreed');
        await tap(page, '#df [data-df="yes"]');
        await waitShown(page, '#df', false);
        const now = await state(page, (S) => ({ fight: !!S.encounter, up: Object.values(S.entities).filter((e) => e.kind === 'pc' && !e.dead && e.hp > 0).length }));
        if (now.fight || now.up !== pcs.length) throw new Error(`not standing, before the fight: ${JSON.stringify(now)}`);      // the pin is the table just before initiative was called
        await openTab(page, 'log');
        if (!/took the table back to the start of the fight/.test(await page.textContent('#log-list'))) throw new Error('the log does not say so');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}


// ---------- rewards ----------
// The rewards after a won fight (packages/client/conclusion.js): a DM and a phone player. The phone is told only that rewards are pending
// until the DM publishes; then it sees the card with its XP. With the table setting `conclusion: off` nothing appears.
async function rewards(browser, url) {
  await scenario('rewards: a DM and a phone player', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let id, name, xp0;
      await run.do('a DM hosts and a phone player joins and claims a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
        xp0 = await phone.evaluate((i) => window.hextable.state.entities[i].xp, id);
        if (typeof xp0 !== 'number') throw new Error('a character has no XP');
      });
      await run.do('the DM wins a fight and settles the rewards; the phone is told only that they are pending', async () => {
        await host.evaluate(() => {
          const h = window.hextable; document.getElementById('dm-auto').checked = false;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
        });
        await waitShown(host, '#cc-chip');          // the DM's rewards wait as a line at the top, not over the map
        if (await shown(host, '#cc')) throw new Error('the rewards form opened over the map by itself');
        await host.click('#cc-chip');
        await waitShown(host, '#cc');
        if ((await host.textContent('#cc-title')).trim() !== 'The fight is won.') throw new Error('the DM card has the wrong title');
        await waitShown(phone, '#cc-wait');
        const said = (await phone.textContent('#cc-wait')).trim();
        if (said !== 'The fight is over. The DM is working out the rewards.') throw new Error(`the phone was told: ${said}`);
        if (await shown(phone, '#cc')) throw new Error('the phone shows a card before the rewards are published');
        const c = await state(phone, (S) => S.conclusion);
        if (Object.keys(c).sort().join() !== 'fight,id,pending') throw new Error(`the phone was sent: ${JSON.stringify(c)}`);
        const form = await host.textContent('#cc');
        if (!/XP/.test(form) || !/Foes/.test(form)) throw new Error('the DM form has no foes or XP');
      });
      await run.do('the DM adds a bonus line with a reason and a loot line for the phone character', async () => {
        await host.fill('[data-nb-amt]', '50'); await host.fill('[data-nb-reason]', 'Freed the prisoner');
        await host.click('[data-badd]');
        await wait(host, () => window.hextable.state.conclusion?.xp.bonus.length === 1);
        if ((await host.inputValue('[data-nb-reason]')) !== '') throw new Error('the new-bonus row was not cleared');
        await host.fill('[data-nl-name]', 'Shortbow'); await host.selectOption('[data-nl-to]', id);
        await host.click('[data-ladd]');
        await wait(host, () => window.hextable.state.conclusion?.loot.length === 1);
        const c = await state(host, (S) => S.conclusion);
        if (c.loot[0].to === null || c.xp.bonus[0].reason !== 'Freed the prisoner') throw new Error(JSON.stringify(c));
        await sleep(400);
        const leak = await phone.evaluate(() => JSON.stringify(window.hextable.state.conclusion) + document.body.innerText.slice(0, 0));
        if (/Shortbow|Freed|bonus|loot|foes|per/.test(leak)) throw new Error(`the phone was sent ${leak}`);
      });
      await run.do('a refusal is shown in the engine\'s words', async () => {
        if (process.env.SMOKE_SHOTS) await host.screenshot({ path: `${process.env.SMOKE_SHOTS}/rewards-form-desktop.png` });
        await host.fill('[data-nb-amt]', '5'); await host.fill('[data-nb-reason]', '');
        await host.click('[data-badd]');
        await waitShown(host, '#cc-err');
        if (!/reason/i.test(await host.textContent('#cc-err'))) throw new Error(`refusal: ${await host.textContent('#cc-err')}`);
        await host.fill('[data-nb-amt]', '');
      });
      await run.do('publishing shows the phone the card with its XP, the bonus line and the loot', async () => {
        await host.click('#cc [data-cc="publish"]');
        await waitShown(phone, '#cc');
        const t = await phone.textContent('#cc');
        const { per, xp1 } = await phone.evaluate((i) => ({ per: window.hextable.state.conclusion.xp.per[i], xp1: window.hextable.state.entities[i].xp }), id);
        if (!/Freed the prisoner/.test(t) || !/Shortbow/.test(t) || !t.includes(name) || !/\+50/.test(t)) throw new Error(`card: ${t}`);
        if (!t.includes(`+${per.toLocaleString('en-US')}`) && !/each/.test(t)) throw new Error(`no XP on the card: ${t}`);
        if (xp1 !== xp0 + per) throw new Error(`XP ${xp0} + ${per} is not ${xp1}`);
        const m = await phone.evaluate(() => { const c = document.querySelector('.cc-card').getBoundingClientRect(); return { l: c.left, r: c.right, t: c.top, b: c.bottom, w: innerWidth, h: innerHeight }; });
        if (m.l < 0 || m.r > m.w || m.t < 0 || m.b > m.h) throw new Error(`the card is off the screen: ${JSON.stringify(m)}`);
        if (process.env.SMOKE_SHOTS) await phone.screenshot({ path: `${process.env.SMOKE_SHOTS}/rewards-card-phone.png` });
        const sent = await phone.evaluate(() => JSON.stringify(window.hextable.state.conclusion));
        if (/"tpl"|"base"|"xp":\d+/.test(sent.replace(/"per":\{[^}]*\}/, ''))) throw new Error(`the phone was sent more than the card: ${sent}`);
      });
      await run.do('the log and the sheet say it; Continue puts the card away on both screens', async () => {
        await phone.locator('#cc [data-cc="continue"]').tap();
        await waitShown(phone, '#cc', false);
        await host.click('#cc [data-cc="continue"]');
        await waitShown(host, '#cc', false);
        await openTab(phone, 'log');
        if (!/Experience: .* XP/.test(await phone.textContent('#log-list'))) throw new Error('the phone log has no line for the rewards');
        await phone.click('#log-rewards');
        await closeMenu(phone);
        await waitShown(phone, '#cc');
        await phone.locator('#cc [data-cc="continue"]').tap();
        await phone.click(`#party button:has-text("${name}")`);
        await openTab(phone, 'sheet');
        if (!/XP \d/.test(await phone.textContent('#sheet-body'))) throw new Error('no XP on the sheet');
        await closeMenu(phone);
        await openTab(host, 'dm');
        const chron = await host.$$eval('#chron-list li', (l) => l.map((x) => x.textContent).filter((t) => /A fight.*won/.test(t)).length);
        await closeMenu(host);
        if (chron !== 1) throw new Error(`fight chronicle entries in the DM's chronicle: ${chron}`);
      });
      await run.do('with the rewards turned off, the next won fight shows nothing', async () => {
        await openTab(host, 'dm');
        await host.selectOption('#dm-conclusion', 'off');
        await wait(host, () => window.hextable.state.settings.conclusion === 'off');
        await closeMenu(host);
        const fight0 = await state(host, (S) => S.conclusion.fight);
        await host.evaluate(() => { for (const e of Object.values(window.hextable.state.entities)) if (e.side === 'foe') window.hextable.act({ type: 'setHp', actor: e.id, hp: e.maxHp }); });
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.side === 'foe' && e.hp > 0 && !e.hidden));
        await host.evaluate(() => {
          const h = window.hextable;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
        });
        await wait(host, () => !window.hextable.state.encounter);
        await calm(host); await calm(phone); await sleep(500);
        for (const [pg, who] of [[host, 'the DM'], [phone, 'the phone']]) {
          if (await shown(pg, '#cc') || await shown(pg, '#cc-wait') || await shown(pg, '#cc-chip')) throw new Error(`${who} is shown something`);
          if ((await state(pg, (S) => S.conclusion?.fight)) !== fight0) throw new Error(`${who} has a new conclusion`);
        }
      });
      await run.do('the party falls: the phone sees the card with no choices, the DM rewinds over the wire', async () => {
        await host.evaluate(() => {
          const h = window.hextable;
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe') h.act({ type: 'setHp', actor: e.id, hp: e.maxHp });
        });
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.side === 'foe' && e.hp > 0 && !e.hidden));
        await host.evaluate(() => {
          const h = window.hextable, foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
        });
        await wait(host, () => !!window.hextable.state.encounter);
        for (let n = 0; n < 5; n++) {
          await host.evaluate(() => { const h = window.hextable; for (const e of Object.values(h.state.entities)) if (e.kind === 'pc' && !e.dead) h.act({ type: 'harm', actor: e.id, amount: Math.max(1, e.hp) }); });
          await sleep(300);
          if (await host.evaluate(() => !window.hextable.state.encounter)) break;
        }
        await waitShown(host, '#df'); await waitShown(phone, '#df');
        if (await phone.locator('#df .df-choice').count()) throw new Error('the phone is offered choices');
        if (!/The DM will decide what happens next/.test(await phone.textContent('#df'))) throw new Error('the phone card has no line about the DM');
        if (!(await host.locator('#df .df-choice').count())) throw new Error('the DM has no choices');
        await host.click('#df [data-df="fight"]');
        await host.click('#df [data-df="yes"]');
        await waitShown(host, '#df', false); await waitShown(phone, '#df', false);
        const up = await state(host, (S) => Object.values(S.entities).filter((e) => e.kind === 'pc' && !e.dead && e.hp > 0).length);
        if (up < 1) throw new Error('nobody is standing after the rewind');
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}


// ---------- main ----------
try {
  console.log('smoke: building and starting the table server');
  const url = await startServer();
  browser = await chromium.launch({ args: ARGS });
  // Every page plays at pace `instant` (docs/specs/renderer.md, decision 3), so the passes that are not about pacing need not wait for
  // beats. A pass about pacing asks for another pace: browser.newContext(opts, { pace: 'wait' }).
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts, { pace = 'instant' } = {}) => {
    const c = await newContext(opts);
    await c.addInitScript((p) => { try { localStorage.setItem('hextable.pace', JSON.stringify(p)); } catch { /* storage unavailable */ } }, pace);
    return c;
  };
  const only = process.env.SMOKE_ONLY;       // SMOKE_ONLY=scenes (or maps, armed, dice, reactions, timeline, beats, interface, three, three-parity) runs one pass alone
  if (!only || only === 'base') {       // SMOKE_ONLY=base: the solo and multiplayer passes alone
    await solo(browser, url, 'solo at 1280x800', { viewport: { width: 1280, height: 800 } });
    await solo(browser, url, 'solo at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await multiplayer(browser, url);
  }
  if (!only || only === 'armed') {
    await armed(browser, url, 'armed features at 1280x800', { viewport: { width: 1280, height: 800 } });
    await armed(browser, url, 'armed features at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'dice') {
    await dice(browser, url, 'dice: a desktop player', { viewport: { width: 1280, height: 800 } });
    await dice(browser, url, 'dice: a phone player', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'reactions') {
    await reactions(browser, url, 'reactions on the sheet at 1280x800', { viewport: { width: 1280, height: 800 } });
    await reactions(browser, url, 'reactions on the sheet at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'scenes') await scenes(browser, url);
  if (!only || only === 'prompt') await prompt(browser, url);
  if (!only || only === 'import') {
    await importFg(browser, url, 'import from Fantasy Grounds at 1280x800', { viewport: { width: 1280, height: 800 } });
    await importFg(browser, url, 'import from Fantasy Grounds at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'timeline') {
    await pacing(browser, url, 'timeline at 1280x800', { viewport: { width: 1280, height: 800 } });
    await pacing(browser, url, 'timeline at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await pacingTable(browser, url);
  }
  if (!only || only === 'beats') {
    await beats(browser, url, 'beats at 1280x800', { viewport: { width: 1280, height: 800 } });
    await beats(browser, url, 'beats at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'controls') {
    await controlsSolo(browser, url, 'controls at 1280x800', { viewport: { width: 1280, height: 800 } });
    await controlsSolo(browser, url, 'controls at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await controlsTable(browser, url);
  }
  if (!only || only === 'classes') {
    await classes(browser, url, 'class controls at 1280x800', { viewport: { width: 1280, height: 800 } });
    await classes(browser, url, 'class controls at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'interface') {
    await interfacePass(browser, url, 'interface: the empty renderer at 1280x800 (address flag)', { viewport: { width: 1280, height: 800 } }, 'address');
    await interfacePass(browser, url, 'interface: the empty renderer at 390x844 with touch (preference)', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'pref');
    await statsPass(browser, url);
  }
  if (!only || only === 'three') {      // SMOKE_ONLY=three: the vendored Three.js alone
    await threePass(browser, url, 'three: the vendored library at 1280x800', { viewport: { width: 1280, height: 800 } });
  }
  if (!only || only === 'drawer') {
    await drawerPass(browser, url, 'drawer at 1280x800', { viewport: { width: 1280, height: 800 } });
    await drawerPass(browser, url, 'drawer at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await drawerTable(browser, url);
  }
  if (!only || only === 'defeat') {
    await defeat(browser, url, 'defeat at 1280x800', { viewport: { width: 1280, height: 800 } });
    await defeat(browser, url, 'defeat at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'rewards') await rewards(browser, url);
  if (!only || only === 'three-parity') {      // SMOKE_ONLY=three-parity: the Three.js renderer against the default one (R11)
    await threeParity(browser, url, 'three-parity at 1280x800', { viewport: { width: 1280, height: 800 } });
    await threeParity(browser, url, 'three-parity at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
  if (!only || only === 'maps') {
    await stockMaps(browser, url, 'stock maps at 1280x800', { viewport: { width: 1280, height: 800 } });
    await stockMaps(browser, url, 'stock maps at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  }
} catch (err) {
  failures.push(`smoke could not run: ${err.message}`);
} finally {
  await browser?.close().catch(() => {});
  stopServer();
}
if (failures.length) { console.log(`\nsmoke: FAILED\n${failures.map((f) => '  ' + f).join('\n')}`); process.exit(1); }
console.log('\nsmoke: all steps passed');
