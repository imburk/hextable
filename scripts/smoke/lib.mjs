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
    const msg = `FAIL [${label}] step "${run.step}": ${process.env.SMOKE_VERBOSE ? String(err.message).split('\n').slice(0, 14).join(' | ') : String(err.message).split('\n')[0]}${process.env.SMOKE_VERBOSE ? ' @ ' + String(err.stack).split('\n').filter((l) => /scripts\/smoke/.test(l)).slice(0, 4).map((l) => l.trim().replace(/^.*scripts\/smoke\//, '')).join(' < ') : ''}`;
    console.log('  ' + msg);
    failures.push(msg);
  }
}

// ---------- page helpers ----------
// A timeout names the wait that failed (its condition and its limit), not only "page.waitForFunction: Timeout 10000ms exceeded" (#661).
export const wait = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async (err) => {
  if (!/Timeout/.test(String(err?.message))) throw err;
  const src = String(fn).replace(/\s+/g, ' ').slice(0, 160);
  // Where the game stood when the wait gave up (a stuck game or a slow machine?): the timeline and the dice, whose turn it is, the last events. Never fails the wait differently.
  const stood = await page.evaluate(() => { const h = window.hextable, S = h.state, E = S?.encounter; return JSON.stringify({ waiting: h.waiting, busy: h.timeline.busy(), dice: h.dice.busy, turn: E ? E.order[E.turn]?.id : null, prompt: !!S?.prompt, last: (S?.timeline ?? []).slice(-6).map((x) => x.type) }); }).catch(() => 'unknown');
  throw new Error(`wait of ${timeout} ms timed out for ${src}${arg === undefined || arg === null ? '' : ` (arg ${JSON.stringify(arg).slice(0, 60)})`}; the game stood at ${stood}`);
});
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
// The action groups (M4: the dock is gone; the rows are the groups of the Character screen, one section open at a time, docs/specs/one-token-menu.md Decision 4).
// `panelTab(page, id)` opens the menu on the selected character's screen, opens the group that holds what the old tab `id` held, and waits until its rows are on screen.
// The old tab names still work: explore, attacks, spells (and `all`), bonus (the turn bar's Bonus Action screen), move, features, items, reactions, down; the new groups are
// heal, defend, use, companions and rest. The menu is left open: a row that arms an action folds it, any other leaves it, `closeMenu(page)` before a tap on the map.
const GROUP_OF = { all: 'spells', bonus: 'cost:bonus', inventory: 'items' };
export const groupId = (id) => GROUP_OF[id] ?? id;
export const paneOf = (id) => `#ap-${groupId(id).startsWith('cost:') ? 'cost' : groupId(id)}`;
export async function panelTab(page, id) {
  const g = groupId(id);
  await openChar(page);
  if (g === 'down') return waitShown(page, '#ap-down', true, 8000);
  const bar = g.startsWith('cost:') ? `#c-res [data-cost="${g.slice(5)}"]` : `#ap-bar-${g}`;
  await waitShown(page, bar, true, 8000);
  const open = () => page.evaluate(([b, g0]) => g0.startsWith('cost:') ? document.querySelector(b)?.getAttribute('aria-pressed') === 'true' : document.querySelector(b)?.getAttribute('aria-expanded') === 'true', [bar, g]);
  if (!(await open())) await page.click(bar);
  await page.waitForFunction(([b, g0]) => g0.startsWith('cost:') ? document.querySelector(b)?.getAttribute('aria-pressed') === 'true' : document.querySelector(b)?.getAttribute('aria-expanded') === 'true', [bar, g], { timeout: 8000 });
  await waitShown(page, paneOf(id), true, 8000);
  await menuStill(page);
}
// Which group is open now (null when none): the bar with aria-expanded, or the turn bar's open segment as `cost:<kind>`.
export const openGroup = (page) => page.evaluate(() => document.querySelector('#ap-body .ap-bar[aria-expanded="true"]:not(#ap-bar-cost)')?.dataset.sec ?? (document.querySelector('#c-res [aria-pressed="true"]')?.dataset.cost ? `cost:${document.querySelector('#c-res [aria-pressed="true"]').dataset.cost}` : null));
// A row of an open group by its visible name: `#ap-<group> [data-row]` with that text. Greyed rows are rows too.
export const rowOf = (tab, text) => `${paneOf(tab)} [data-row]:has-text("${text}")`;
export async function playSolo(page) {
  await page.click('#lobby-solo');
  await wait(page, () => window.hextable?.state?.entities);
}
// The view is still: the camera has no goal left to ease to (follow, turn), and for 8 frames in a row (waited for in the page, on the renderer's own frames, so a slow machine
// counts frames, not milliseconds) the dock's height, the canvas and where the map's origin is on the screen have not changed. The dock's height moves the picture (the renderer's `inset`
// follows it, app.js sizeDock) and a layout in progress or a camera still easing is what makes a tap land on another cell than the one that was looked up.
export const viewStill = (page, ms = 20000) => page.evaluate((limit) => new Promise((resolve, reject) => {
  const h = window.hextable, R = h.R, c = (R.inner ?? R).cam ?? {}, t0 = performance.now();
  const sig = () => { const p = R.screenOf({ q: 0, r: 0, z: 0 }); return JSON.stringify([c.goal ? 1 : 0, c.yawGoal != null ? 1 : 0, document.getElementById('dock')?.offsetHeight, innerWidth, innerHeight, p && [Math.round(p.x * 10), Math.round(p.y * 10)]]); };
  let last = '', same = 0;
  const frame = () => {
    const now = sig();
    same = now === last && !c.goal && c.yawGoal == null ? same + 1 : 0; last = now;
    if (same >= 8) return resolve(true);
    if (performance.now() - t0 > limit) return reject(new Error(`viewStill: the view never stilled in ${limit} ms: ${now}`));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}), ms);
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
// The menu (docs/specs/one-token-menu.md, stages M1 and M8): a tap on the token fans the places out in an arc round it; a symbol opens its screen, and the
// same symbols run across the top of every screen (the strip). A tap on the token, on the dimmed map or Escape closes everything. A place is a path:
// 'turns', 'settings', 'dm/creatures', or [] for the arc. The old names work too: 'character' is 'sheet', and 'table' (the list that held Setup, DM
// tools, Help and leaving) is Setup, where those are now. It leaves the menu open on that place and waits until the screen is drawn.
const PANEL = { sheet: 'sheet', turns: 'tracker', dice: 'dicepanel', log: 'log', settings: 'settings', dm: 'dm', about: 'about' };
// M10: Setup, Log and chat and DM tools are pages of sections, one accordion each, one section open at a time: 'settings/menu' is Setup with The menu open,
// 'log/talk' the Say box and the private note, 'log/handouts' a player's handouts ('handouts' alone still means that). A pass that touches a control of
// Setup names its section (display, dice, menu, chars, rules, help, leave). 'log' alone opens the log itself; 'settings' alone leaves Setup as it is.
// 'sheet' opens the character's page with its Sheet section open (the sheet is the last section of that page); `panelTab` opens a group of it instead,
// and `openChar` opens the page and touches no section.
const ACC = ['settings', 'log', 'dm'];
export const menuPath = (p = []) => {
  const segs = (Array.isArray(p) ? p : String(p).split('/')).filter(Boolean).map((k) => ({ character: 'sheet', party: 'turns', root: '' })[k] ?? k).filter(Boolean);
  if (segs[0] === 'table') return segs.length > 1 ? segs.slice(1) : ['settings'];
  if (segs[0] === 'handouts') return ['log', 'handouts'];
  return segs;
};
// M5: DM tools is a list of seven screens ('dm/creatures', 'dm/rules', ...) and a last row, "All tools on one page". A pass that asks for 'dm' alone
// wants a DM control by its id wherever it is, so `openMenu(page, 'dm')` taps that last row; a pass about one screen names it.
const menuAt = (page) => page.evaluate(() => document.getElementById('drawer').dataset.path || '');
// The menu is at this place: a page of sections may have one open (it remembers which), so a place named alone is matched by its first part.
const waitMenuAt = (page, want) => page.waitForFunction((p) => { const at = document.getElementById('drawer').dataset.path; return p.includes('/') || p === 'more' ? at === p : at.split('/')[0] === p; }, want.join('/'), { timeout: 5000 });
const menuIs = (page) => page.evaluate(() => { const d = window.hextable.drawer; return { open: d.isOpen, arc: d.arc }; });
export const openMenu = async (page, path = []) => {
  const want = menuPath(path);
  try { await openMenuTo(page, want); } catch (err) {
    const at = await page.evaluate(() => { const d = document.getElementById('drawer'), h = window.hextable.drawer; return { path: d.dataset.path, open: h.isOpen, arc: h.arc, hidden: d.hidden, cls: d.className, scrim: !document.getElementById('drawer-scrim').hidden }; }).catch(() => null);
    throw new Error(`openMenu(${want.join('/')}) stopped at ${JSON.stringify(at)}: ${String(err.message).split('\n')[0]}`);
  }
};
// The arc, fanned out and still (its symbols grow out of the die for half a second).
export const openArc = async (page) => {
  const is = await menuIs(page);
  if (is.arc) return;
  if (is.open) { await page.click('#btn-menu'); await page.waitForFunction(() => !window.hextable.drawer.isOpen, null, { timeout: 5000 }); }
  await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
  await page.waitForFunction(() => document.getElementById('menu-arc').classList.contains('out'), null, { timeout: 5000 });
};
// A place's symbol: on the arc when that is what is up, otherwise on the strip. A character's is the selected one's. A place the arc has no slot for is in More.
const tapPlace = async (page, key) => {
  const is = await menuIs(page);
  const sel = key === 'sheet' ? await page.evaluate(() => document.querySelector('#party .pr.sel')?.dataset.id ?? null) : null;
  // A creature with no symbol (the DM has selected a monster on the map or in Turns) has its screen opened by the menu itself, as a tap on the map's pawn does;
  // About is a button of Setup at a table.
  if (key === 'sheet' && !sel) { await page.evaluate(() => window.hextable.drawer.open('sheet')); return; }
  if (key === 'about' && !(await page.evaluate(() => { const b = document.getElementById('tab-about'); return !b.hidden; }))) { await openMenuTo(page, ['settings', 'help']); await page.click('#set-about'); return; }
  const place = key === 'sheet' ? `c:${sel}` : key;
  if (is.arc) {
    // by selector, not by handle: the arc is drawn again when a place's line changes (a turn passes), and a handle would be of a button that is gone
    if (await page.$(`#arc [data-place="${place}"]`)) { await page.click(`#arc [data-place="${place}"]`); return; }
    await page.click('#arc [data-place="more"]'); await waitMenuAt(page, ['more']);
    await page.click(`#more-list [data-place="${place}"]`); return;
  }
  const b = page.locator(key === 'sheet' ? '#menu-root #party .pr.sel' : `#menu-root [data-go="${key}"]`);
  await b.evaluate((x) => { const r = x.getBoundingClientRect(), s = document.getElementById('menu-root'), q = s.getBoundingClientRect(); s.scrollLeft += (r.left + r.width / 2) - (q.left + q.width / 2); });      // the strip scrolls sideways; its end arrows cover its edges
  await b.click();
};
const openMenuTo = async (page, want, { sheet = true } = {}) => {
  if (!want.length) { await openArc(page); return; }
  if (!(await menuIs(page)).open) await openArc(page);
  let have = (await menuAt(page)).split('/').filter(Boolean);
  if (have[0] !== want[0]) { await tapPlace(page, want[0]); await waitMenuAt(page, [want[0]]); have = (await menuAt(page)).split('/').filter(Boolean); }
  await waitShown(page, '#drawer');
  if (ACC.includes(want[0])) {
    const sub = want[1] ?? (want[0] === 'dm' ? 'all' : want[0] === 'log' ? 'log' : null), panel = PANEL[want[0]];
    if (sub && have[1] !== sub) {
      if (have[1] === 'all') { await page.click('#drawer-back'); await waitMenuAt(page, [want[0]]); }
      if (sub === 'all') {
        if (have[1] && have[1] !== 'all') { await page.click(`#acc-bar-${want[0]}-${have[1]}`); await page.waitForFunction((p) => document.getElementById('drawer').dataset.path === p, want[0], { timeout: 5000 }); }
        await page.click(`#${panel} > .acc-all [data-sec="all"]`);
      } else await page.click(`#acc-bar-${want[0]}-${sub}`);
      await waitMenuAt(page, [want[0], sub]);
    }
  }
  if (want[0] in PANEL) await waitShown(page, `#${PANEL[want[0]]}`);
  // the sheet is the last section of a character's page: 'sheet' means the page with it open
  if (want[0] === 'sheet' && sheet && (await page.$('#ap-bar-sheet'))) {
    await waitShown(page, '#ap-bar-sheet', true, 8000);
    if ((await page.getAttribute('#ap-bar-sheet', 'aria-expanded')) !== 'true') await page.click('#ap-bar-sheet');
    await page.waitForFunction(() => document.getElementById('ap-bar-sheet')?.getAttribute('aria-expanded') === 'true', null, { timeout: 8000 });
  }
  await menuStill(page);
};
// The character's page as it opens by itself: no section is touched (which group a page opens on is what some passes check).
export const openChar = async (page) => {
  try { await openMenuTo(page, ['sheet'], { sheet: false }); } catch (err) { throw new Error(`openChar stopped: ${String(err.message).split('\n')[0]}`); }
};
// The levels slide in (about .7 s): a check that measures the screen mid-slide sees a control hang out of the menu. Wait until the menu's own boxes stop moving.
export const menuStill = (page) => page.evaluate(() => new Promise((ok) => {
  const key = () => ['drawer', 'menu-levels', 'drawer-body'].map((i) => { const r = document.getElementById(i)?.getBoundingClientRect(); return r ? [r.left, r.top, r.width].map(Math.round).join() : ''; }).join('|');
  let last = '', n = 0; const t0 = Date.now();
  const t = setInterval(() => { const k = key(); n = k === last ? n + 1 : 0; last = k; if (n >= 3 || Date.now() - t0 > 3000) { clearInterval(t); ok(); } }, 60);
}));
// The drawer can be closing by itself (a fight starting closes it) when we look: then its close control is already gone, and what we want is that it ends hidden.
// A sheet closes by its handle, a wide menu by its x.
export const closeMenu = async (page) => {
  if ((await menuIs(page).catch(() => ({}))).arc) { await page.click('#btn-menu'); await waitShown(page, '#menu-arc', false); return; }      // the arc folds on a tap on the die
  if (!(await shown(page, '#drawer'))) return;
  await page.waitForFunction(() => document.getElementById('dice')?.hidden !== false, null, { timeout: 8000 }).catch(() => {});      // dice in flight sit over everything and take the tap
  const clicked = await page.click('#drawer-close:visible, #drawer-handle:visible', { timeout: 8000 }).then(() => 'clicked', (e) => `not clicked: ${String(e.message).split('\n')[0]}`);
  await waitShown(page, '#drawer', false).catch(async (err) => {
    const at = await page.evaluate(() => { const d = document.getElementById('drawer'); return { path: d.dataset.path, open: window.hextable.drawer.isOpen, hidden: d.hidden, cls: d.className, active: document.activeElement?.id, bodyCls: document.body.className }; }).catch(() => null);
    throw new Error(`closeMenu: the menu stayed up (${clicked}) at ${JSON.stringify(at)}: ${String(err.message).split('\n')[0]}`);
  });
};
export const closePanels = closeMenu;
export const openTab = (page, tab) => openMenu(page, tab);
// The characters are the first symbols of the arc (M8; they were the party chips of the dock, then rows of the first level). `chip` fans the arc out, taps the
// character's symbol, and closes the screen that opens, so the map is free again and the character is the selected one.
export const chip = async (page, name) => {
  await openArc(page);
  await page.click(`#arc .arc-b.char:has-text("${name}")`);
  await waitShown(page, '#drawer');
  await closeMenu(page);
};

// The same for a symbol found by its words (a player claiming a character: "Play as ..."), tapped or clicked.
export const chipPick = async (page, text, how = 'click') => {
  await openArc(page);
  const b = page.locator(`#arc .arc-b.char:has-text("${text}")`).first();
  await (how === 'tap' ? b.tap() : b.click());
  await waitShown(page, '#drawer');
  await closeMenu(page);
};

// Select a character by its chip and move it one hex by tapping the map. Returns the new position.
export async function selectAndMove(page, touch, id, name) {
  await closePanels(page);
  await chip(page, name);
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
    await chip(page, name);                                                             // still the one selected
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
    return { pc: pc.id, foe: foe.id };
  }, want);
  await placeBeside(dm, setup.pc, setup.foe);
  await dm.evaluate((f) => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[f].pos }), setup.foe);
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
// `window.hextable.act` does nothing while this page's timeline is playing at the pace `wait`: it skips the beats instead (app.js, `skipping()`; a tap that skips an animation must not also send).
// A script that sends an action right after another's events were queued therefore loses it without a word (#688: endEncounter lost, then 20 s for a fight that never ended). `window.__still(action)`
// (installed by `stillInit`, add it to a context before its pages open) waits in the page until nothing is playing and sends in the same turn, so nothing can start in between; it says in words when the timeline never stilled.
export const stillInit = `{ const W = window.WebSocket, log = (window.__wire = []);
  const note = (dir, d) => { if (typeof d !== 'string' || /"t":"(ping|pong)"/.test(d)) return; log.push(Math.round(performance.now()) + ' ' + dir + ' ' + d.replace(/"(entities|map|settings)":.*$/, '...').slice(0, 220)); if (log.length > 40) log.shift(); };
  window.WebSocket = class extends W { constructor(...a) { super(...a); this.addEventListener('message', (m) => note('<', m.data)); } send(d) { note('>', d); return super.send(d); } }; }
window.__still = async (a, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    const h = window.hextable;
    if (h && h.waiting === 0 && !h.timeline.busy()) return h.act(a);
    if (Date.now() - t0 > ms) { const S = h?.state, E = S?.encounter; throw new Error('__still: the timeline never stilled for ' + JSON.stringify(a) + ': waiting ' + h?.waiting + ', busy ' + h?.timeline.busy() + ', pace ' + h?.timeline.pace + ', turn ' + (E ? E.order[E.turn].id : null) + ', prompt ' + !!S?.prompt + ', pending ' + !!S?.pending + ', last ' + JSON.stringify((S?.timeline ?? []).slice(-6).map((x) => x.type))); }
    await new Promise((r) => setTimeout(r, 40));
  }
};`;
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
//   within: { center, radius }, the new creature must lie inside (a fight's arena); name: a name for the spawn, passed on; extra: more fields of the spawn action (`hidden: true`).
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
    const r = apply(clone, { type: 'spawn', monster: t, at: h, ...(o.name ? { name: o.name } : {}), ...(o.extra ?? {}) }, DM);
    if (!r.ok) { error = r.error; continue; }
    if (from && !inSight(clone.map, from.pos, clone.entities[r.events.find((x) => x.type === 'spawned').id].pos)) { error = 'no line of sight'; continue; }
    out.push(h);
  }
  out.sort((a, b) => G.dist(c, a) - G.dist(c, b) || a.r - b.r || a.q - b.q);
  return { spots: out, error };
}, [tpl, opts]);

// Puts the existing creature `actor` on a hex beside `near` (a creature id), asked of the engine: each of the six neighbours is tried on a copy of the
// state (a tree, water or somebody standing there refuses the placing, and the engine may land the creature on another hex than the one asked), and the
// first that leaves `actor` one hex from `near` is taken. Requires the creature to stand beside `near` afterwards; fails with the engine's own last refusal.
// Runs on the page that holds the game (the DM's); returns the hex.
export async function placeBeside(page, actor, near) {
  const r = await page.evaluate(async ([a, n]) => {
    const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
    const h = window.hextable, S = h.state, G = gridOf(S.map), DM = { role: 'dm', userId: 'dm' }, c = S.entities[n].pos;
    let error = null, pick = null;
    for (const t of G.range(c, 1)) {
      if (G.dist(c, t) !== 1) continue;
      const clone = structuredClone({ ...S, timeline: [] }), res = apply(clone, { type: 'place', actor: a, to: { q: t.q, r: t.r } }, DM);
      if (!res.ok) { error = res.error; continue; }
      if (G.dist(c, clone.entities[a].pos) !== 1) { error = 'the engine landed it on a hex that is not beside'; continue; }
      pick = t; break;
    }
    if (!pick) return { error: error ?? 'no neighbouring hex' };
    h.act({ type: 'place', actor: a, to: { q: pick.q, r: pick.r } });
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const p = h.state.entities[a].pos;
      if (G.dist(c, p) === 1) return { pos: p };
      await new Promise((x) => setTimeout(x, 50));
    }
    return { error: `placed at ${JSON.stringify(pick)} and it did not stand beside: toast "${document.getElementById('toast')?.textContent ?? ''}"` };
  }, [actor, near]);
  if (r.error) throw new Error(`${actor} could not be placed beside ${near} on this map: ${r.error}`);
  return r.pos;
}

// Spawns `tpl` on the first hex spotsFor finds and requires the creature to exist afterwards; returns its id. Fails with the game's own words:
// the engine's last refusal when there is no hex, or the table's toast when the spawn was sent and nothing appeared.
export async function spawnNear(page, tpl, opts = {}) {
  const { spots, error } = await spotsFor(page, tpl, opts);
  if (!spots.length) throw new Error(`no hex near ${JSON.stringify(opts.near)} on this map takes a ${tpl}${opts.sightFrom ? ' in sight of ' + opts.sightFrom : ''}: ${error ?? 'none in range'}`);
  const before = await page.evaluate(() => Object.keys(window.hextable.state.entities));
  await page.evaluate(([t, at, n, x]) => window.hextable.act({ type: 'spawn', monster: t, at, ...(n ? { name: n } : {}), ...x }), [tpl, spots[0], opts.name ?? null, opts.extra ?? {}]);
  const made = async () => (await page.evaluate((b) => Object.keys(window.hextable.state.entities).filter((k) => !b.includes(k)), before));
  try { await wait(page, (b) => Object.keys(window.hextable.state.entities).some((k) => !b.includes(k)), before, 5000); }
  catch { throw new Error(`the ${tpl} was not made at ${JSON.stringify(spots[0])}: toast "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); }
  return (await made())[0];
}

// Tap a creature on the map where the renderer says it is, and make sure the renderer picked IT: a party pawn between the camera and the target takes the
// tap, so the view is turned and the creature focused again until a tap lands on it (the guard paneltabs.mjs has, DEBT T30). `fail` is told what was seen.
export async function tapGuarded(page, touch, target) {
  const ev = (f, a) => page.evaluate(f, a);
  await ev((t) => { const R = window.hextable.R; window.__tap = R.onTap; window.__hits = []; R.onTap = (h) => { window.__hits.push(h.id ?? null); if (h.id === t) window.__tap(h); }; }, target);
  try {
    const turns = [0, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, (2 * Math.PI) / 3, (-2 * Math.PI) / 3, Math.PI];
    for (let k = 0; k < turns.length; k++) {
      if (k > 0) await ev(([t, turn]) => { const R = window.hextable.R; R.focus(t, true); R.face((window.__yaw0 ??= R.cameraAngles().yaw) + turn, true); }, [target, turns[k]]);
      await settle(page, target);
      const pt = await ev((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), target);
      if (!pt || pt.x < 5 || pt.y < 5 || !(await onCanvas(page, pt.x, pt.y))) continue;      // off screen or under a panel: another view
      await ev(() => { window.__hits = []; });
      await tapAt(page, touch, pt.x, pt.y);
      await wait(page, () => window.__hits.length > 0, null, 3000).catch(() => {});
      if ((await ev(() => window.__hits)).includes(target)) return;
    }
    throw new Error(`no view of the map puts ${target} where a tap reaches it (taps landed on ${JSON.stringify(await ev(() => window.__hits))})`);
  } finally { await ev(() => { window.hextable.R.onTap = window.__tap; delete window.__yaw0; }); }
}


// The build screen is one accordion (pickui.js, #603): a section's controls are on the page only while it is open. Open one (a no-op if it is open).
export async function openSec(page, id) { const bar = `#qb-acc-bar-${id}`; if ((await page.getAttribute(bar, 'aria-expanded')) !== 'true') await page.click(bar); }
// The two skills and the Fighting Style a level 1 to 20 Fighter needs, ticked in the open build screen.
export async function fighterBasics(page) {
  await openSec(page, 'skills');
  for (const k of ['athletics', 'perception']) await page.check(`#qb-skill-${k}`);
  if (await page.$('#qb-acc-bar-choices')) { await openSec(page, 'choices'); await page.check('#qb-choice-fighting-style--defense'); }
}

// #750: the d20 confirms what waits (its ring is dashed and pulses while `#btn-menu.waiting`; its spoken name is "Confirm <what>"). Tap or click it.
export const waitDie = (page, on = true, timeout = 8000) => page.waitForFunction((v) => document.getElementById('btn-menu').classList.contains('waiting') === v, on, { timeout });
export const tapDie = async (page, touch) => { await waitDie(page); await (touch ? page.locator('#btn-menu').tap() : page.locator('#btn-menu').click()); };

// #750 part 2: the choices an armed spell waits for are on the character's sheet (`#ap-choices`, at the top of the open section), not in the aim bar. What one group of them shows:
// each option { v, label, on (the one the die uses), off (greyed), why (its reason in words) }, the usable values, the chosen one, the smallest option's height, and where the block sits.
export const choiceView = (page, group) => page.evaluate((g) => {
  const box = document.getElementById('ap-choices'), btns = box ? [...box.querySelectorAll(`[data-ch="${g}"]`)] : [];
  const all = btns.map((b) => ({ v: b.dataset.v, label: b.textContent.trim(), on: b.getAttribute('aria-checked') === 'true', off: b.getAttribute('aria-disabled') === 'true', why: b.dataset.why }));
  return { old: !!document.getElementById('hint-pick') || !!document.getElementById('hint-slot'), shown: !!box && !box.hidden && box.getClientRects().length > 0,
    inDrawer: !!box && document.getElementById('drawer').contains(box), first: box?.parentElement?.firstElementChild?.id ?? '', pane: box?.parentElement?.id ?? '',
    all, usable: all.filter((o) => !o.off).map((o) => o.v), on: all.find((o) => o.on)?.v ?? '', minH: btns.length ? Math.min(...btns.map((b) => b.getBoundingClientRect().height)) : 0 };
}, group);
