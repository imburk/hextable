import { sleep, scenario, wait, state, open, playSolo, calm, closePanels, waitShown, onCanvas, panelTab, viewStill } from './lib.mjs';
import { newMap } from '../../packages/rules/src/map.js';
import * as H from '../../packages/rules/src/hex.js';

// ---------- flying: the column of heights and the plane of places (docs/specs/fly-swim-control.md, #716) ----------
// A flat stone table with a roof 10 ft up, so every run is the same. The wizard is given a Fly Speed by the DM (`setSpeed`).
// Desktop (1280x800): the Fly row opens the column; Page Up three times picks 15 ft; a click on a place of the plane sends the engine's
// ordinary `move` with that height; a click on a block picks it; Alt and the wheel step the pick and do not zoom; Home picks the ground
// and a click lands; Escape closes; a Prone flyer has no column and is told why.
const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 7).map((h) => [H.col(h), { t: 'stone' }]));
const MAP = newMap({ id: 'fly-smoke', name: 'The flying field', starts: [{ q: -1, r: 0 }],
  levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: ground }, { id: 'roof', name: 'Roof', z: 10, tiles: { '3,0': { t: 'stone' }, '4,0': { t: 'stone' }, '3,-1': { t: 'stone' }, '4,-1': { t: 'stone' } } }] });
const ID = 'wizard';

const fly = (page) => page.evaluate(() => {
  const h = window.hextable, R = h.R, col = R.hl?.column ?? null, pl = R.hl?.plane ?? null;
  return { mode: h.mode.kind, hint: document.getElementById('hint').hidden ? '' : document.getElementById('hint-text').textContent, picked: col?.blocks.find((b) => b.picked)?.ft ?? null, blocks: col?.blocks.map((b) => b.ft) ?? null,
    cells: pl?.cells.length ?? 0, planeZ: pl?.z ?? null, labels: [...document.querySelectorAll('.col-label')].map((e) => e.textContent), through: (R.inner ?? R).overlayX?.n ?? 0, dist: (R.inner ?? R).cam?.dist };
});

// Input the page saw, kept for a failure's dump (#720): every pointer event on the canvas and every tap the renderer handed to the app, with what it hit.
const recordInput = (page) => page.evaluate(() => {
  const h = window.hextable, R = h.R, log = (window.__flyLog = []), t0 = performance.now(), add = (o) => { log.push({ t: Math.round(performance.now() - t0), ...o }); if (log.length > 14) log.shift(); };
  const cv = document.getElementById('gl');
  for (const k of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) cv.addEventListener(k, (e) => { if (k !== 'pointermove' || log.at(-1)?.ev !== k) add({ ev: k, id: e.pointerId, type: e.pointerType, x: Math.round(e.clientX), y: Math.round(e.clientY) }); }, { capture: true });
  const old = R.onTap; R.onTap = (hit) => { add({ ev: 'onTap', hit: JSON.stringify({ hex: hit.hex, id: hit.id, block: hit.block, plane: hit.plane, pointer: hit.pointer }), mode: h.mode.kind, marked: h.mode.marked, point: h.mode.point }); return old(hit); };
});
// What matters when a first tap did not mark its place: the mode, the tap's point and what the picker finds there now, the column and the plane, the token, the last input.
const dumpTap = (page, c) => page.evaluate(async (c) => {
  const h = window.hextable, R = h.R, col = R.hl?.column, pl = R.hl?.plane, e = Object.values(h.state.entities).find((x) => x.id === 'wizard');
  const here = pl?.cells.find((x) => x.key === c.key), U = Math.sqrt(3) / 5, w = col ? R.G.toWorld(col.at) : null, cp = col ? R.screenPoint(w.x / U, w.z / U, col.z0) : null;
  const cam = (R.inner ?? R).cam, top = document.elementFromPoint(c.p.x, c.p.y);
  // Is the tap on the column? (the press the column's drag takes for its own: app.js FLY_DRAG.down, heights.js blockAtPoint)
  let onBlock = 'unknown';
  try {
    const { blockAtPoint } = await import('./heights.js'), e2 = h.state.entities.wizard, g = R.G.toWorld(e2.pos);
    onBlock = blockAtPoint(h.flyBlocksPx ? h.flyBlocksPx(e2) : col.blocks.map((b) => { const a = R.screenPoint(g.x / U, g.z / U, b.z ?? 0), t = R.screenPoint(g.x / U, g.z / U, (b.z ?? 0) + 4.8); return { z: b.z, x: a.x, top: t.y, bottom: a.y }; }), c.p.y, c.p.x);
  } catch (err) { onBlock = `error ${err.message}`; }
  return JSON.stringify({ onBlock, element: top ? `${top.tagName}#${top.id}.${top.className}` : null, mode: { kind: h.mode.kind, marked: h.mode.marked, point: h.mode.point, hover: h.mode.hover }, tap: { key: c.key, h: c.h, px: c.p, cellNow: here ? { h: here.h, cost: here.cost, floor: here.floor } : null, nowAt: here ? R.screenPoint(R.G.toWorld(here.h).x / U, R.G.toWorld(here.h).z / U, here.h.z ?? 0) : null },
    column: col ? { at: col.at, blocks: col.blocks.map((b) => b.ft + (b.picked ? '*' : '')).join(','), foot: cp } : null, plane: pl ? { z: pl.z, ground: pl.ground, faint: pl.faint, cells: pl.cells.length } : null,
    token: e?.pos, cam: cam ? { x: cam.x, z: cam.z, dist: cam.dist, pitch: cam.pitch, yaw: cam.yaw } : null, hintGoHidden: document.getElementById('hint-go').hidden, log: window.__flyLog ?? [] });
}, c);
const posOf = (page) => state(page, (S, i) => S.entities[i].pos, ID);
// Where a place of the plane is on the screen (the plane's own height), and the middle of a block of the column.
const cellPx = (page, h) => page.evaluate((c) => { const R = window.hextable.R, U = Math.sqrt(3) / 5, w = R.G.toWorld(c); return R.screenPoint(w.x / U, w.z / U, c.z ?? 0); }, h);
const blockPx = (page, ft) => page.evaluate((f) => { const R = window.hextable.R, U = Math.sqrt(3) / 5, col = R.hl.column, w = R.G.toWorld(col.at); return R.screenPoint(w.x / U, w.z / U, col.z0 + f + 2.5); }, ft);
// A place of the plane the pointer can reach: on the canvas, and the one the app marks when the mouse is put on it.
async function pointAt(page, pick = () => true) {
  const cells = await page.evaluate(() => window.hextable.R.hl.plane.cells.map((c) => ({ key: c.key, h: c.h, floor: c.floor, cost: c.cost })));
  for (const c of cells.filter(pick)) {
    const p = await cellPx(page, c.h);
    if (!p || !(await onCanvas(page, p.x, p.y))) continue;
    await page.mouse.move(p.x, p.y);
    const hit = await wait(page, (k) => window.hextable.mode.point === k, c.key, 1200).then(() => true, () => false);
    if (hit) return { ...c, p };
  }
  throw new Error(`no place of the plane could be pointed at (${cells.length} cells)`);
}
const act = async (page, a) => { const r = await page.evaluate((x) => window.hextable.act(x), a); await calm(page); return r; };

async function desktop(browser, url) {
  await scenario('flying: the column and the plane (desktop 1280x800)', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/fly-${n}-desktop.png` }).catch(() => {}) : null);

      await run.do('a creature with no Fly Speed has no Fly row and no height button; given one, both appear', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await act(page, { type: 'setting', key: 'autoEngage', value: false });
        await act(page, { type: 'loadMap', map: MAP });
        await act(page, { type: 'place', actor: ID, to: { q: -1, r: 1 } });
        await page.evaluate((i) => window.hextable.select(i), ID);
        await calm(page);
        await panelTab(page, 'explore');
        if (await page.$('#ap-explore [data-row="fly"]')) throw new Error('Fly is offered to a creature with no Fly Speed');
        if (!(await page.$eval('#cam-fly', (b) => b.hidden))) throw new Error('the height button is shown with no Fly Speed');
        await act(page, { type: 'setSpeed', actor: ID, mode: 'fly', feet: 60 });
        await waitShown(page, '#ap-explore [data-row="fly"]');
        if (!/Fly/.test(await page.$eval('#ap-explore [data-row="fly"]', (e) => e.textContent))) throw new Error('the Fly row has no words');
        if (await page.$eval('#cam-fly', (b) => b.hidden)) throw new Error('the height button is not shown to a flyer');
      });

      await run.do('the Fly row opens the column: a block for each height in reach, the ground picked, numbers on its side, the plane under it, and words', async () => {
        await page.click('#ap-explore [data-row="fly"]');
        await wait(page, () => window.hextable.mode.kind === 'fly' && window.hextable.R.hl?.column);
        await closePanels(page); await viewStill(page);
        const f = await fly(page);
        if (f.picked !== 0 || f.blocks.join() !== '0,5,10,15,20,25,30,35,40,45,50') throw new Error(`the column: ${JSON.stringify(f)}`);
        if (!/On the ground/.test(f.hint) || !/60 ft/.test(f.hint)) throw new Error(`the words: "${f.hint}"`);
        if (!f.labels.includes('Ground') || !f.labels.includes('10 ft') || !f.cells || !f.through) throw new Error(`labels and plane: ${JSON.stringify(f)}`);
        await shot('1-open');
      });

      await run.do('Page Up three times picks 15 ft: the plane hangs there and the words say what straight up costs', async () => {
        for (const want of [5, 10, 15]) { await page.keyboard.press('PageUp'); await wait(page, (w) => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === w, want); }
        const f = await fly(page);
        if (f.planeZ !== 15 || !/15 ft up\. Straight up costs 15 ft/.test(f.hint)) throw new Error(`at 15 ft: ${JSON.stringify(f)}`);
        if (!f.labels.includes('15 ft')) throw new Error(`the picked block has no number: ${f.labels}`);
        await page.keyboard.press('f'); await wait(page, () => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === 10);
        await page.keyboard.press('r'); await wait(page, () => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === 15);
      });

      await run.do('a place of the plane under the mouse says its cost and draws a line down; a click sends the engine\'s move with that height; the column closes and the token says its height', async () => {
        const c = await pointAt(page, (x) => !x.floor && x.cost > 15);
        const f = await fly(page);
        if (!new RegExp(`^${c.cost} ft`).test(f.hint) || !/15 ft up/.test(f.hint) || !/15 ft above the floor/.test(f.hint)) throw new Error(`the place's words: "${f.hint}"`);
        if (!(await page.evaluate(() => !!window.hextable.R.hl.plane.point))) throw new Error('no line down');
        await shot('2-plane-15ft');
        await page.mouse.click(c.p.x, c.p.y);
        await wait(page, ([i, h]) => { const p = window.hextable.state.entities[i].pos; return p.q === h.q && p.r === h.r && p.z === 15; }, [ID, c.h]);
        await calm(page);
        const moved = await page.evaluate((i) => window.hextable.state.timeline?.findLast?.((e) => e.type === 'moved' && e.id === i)?.path?.at(-1) ?? null, ID);
        if (moved && moved.z !== 15) throw new Error(`the engine's move ended at ${JSON.stringify(moved)}`);
        const g = await fly(page);
        if (g.mode !== 'move' || g.blocks) throw new Error(`the column stayed open: ${JSON.stringify(g)}`);
        await wait(page, () => [...document.querySelectorAll('#labels .label')].some((e) => /15 ft/.test(e.textContent)));
        await shot('3-flown');
      });

      await run.do('in the air: Page Up opens the column on its own height; a click on a block picks it; Alt and the wheel step the pick and leave the zoom alone', async () => {
        await page.keyboard.press('PageUp');
        await wait(page, () => window.hextable.mode.kind === 'fly' && window.hextable.R.hl?.column);
        await viewStill(page);
        let f = await fly(page);
        if (f.picked !== 15 || !/Flying at 15 ft/.test(f.hint)) throw new Error(`opened at: ${JSON.stringify(f)}`);
        const p = await blockPx(page, 25);
        await page.mouse.move(p.x, p.y);
        await wait(page, () => window.hextable.mode.hover === 25);
        await page.mouse.click(p.x, p.y);
        await wait(page, () => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === 25);
        const dist = (await fly(page)).dist;
        await page.keyboard.down('Alt'); await page.mouse.wheel(0, -120); await page.keyboard.up('Alt');
        await wait(page, () => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === 30);
        f = await fly(page);
        if (f.dist !== dist) throw new Error(`Alt and the wheel zoomed: ${dist} to ${f.dist}`);
        await page.mouse.move(p.x + 300, p.y + 40); await page.mouse.wheel(0, 120);
        await wait(page, (d) => (window.hextable.R.inner ?? window.hextable.R).cam.dist !== d, dist);
        await page.mouse.wheel(0, -120);
        await page.keyboard.press('End'); await wait(page, () => { const k = window.hextable.R.hl.column?.blocks; return !!k && k.at(-1).picked && k.at(-1).ft > 30; });
        await shot('4-top');
      });

      await run.do('Home picks the ground, the plane is the walking reach, and a click lands; Escape closes the column and sends nothing', async () => {
        await page.keyboard.press('Home');
        await wait(page, () => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === 0);
        const f = await fly(page);
        if (!/^Ground\. Straight down costs 15 ft/.test(f.hint)) throw new Error(`the ground's words: "${f.hint}"`);
        const c = await pointAt(page, (x) => x.floor && (x.h.z ?? 0) === 0);
        await page.mouse.click(c.p.x, c.p.y);
        await wait(page, ([i, h]) => { const q = window.hextable.state.entities[i].pos; return q.q === h.q && q.r === h.r && (q.z ?? 0) === 0; }, [ID, c.h]);
        await calm(page);
        await page.keyboard.press('PageUp');
        await wait(page, () => window.hextable.mode.kind === 'fly');
        const at = await posOf(page);
        await page.keyboard.press('Escape');
        await wait(page, () => window.hextable.mode.kind === 'move' && !window.hextable.R.hl.column);
        const now = await posOf(page);
        if (now.q !== at.q || now.r !== at.r) throw new Error('Escape moved the flyer');
        if (await page.$('.col-label')) throw new Error('the height numbers stayed after the column closed');
      });

      await run.do('a Prone flyer has no column: the keys and the button open nothing, and the Fly row says why', async () => {
        await act(page, { type: 'condition', actor: ID, condition: 'prone', on: true });
        await page.keyboard.press('PageUp');
        await wait(page, () => /Prone/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden);
        let f = await fly(page);
        if (f.mode !== 'move' || f.blocks) throw new Error(`a Prone flyer has a column: ${JSON.stringify(f)}`);
        await page.click('#cam-fly');
        f = await fly(page);
        if (f.mode !== 'move' || f.blocks) throw new Error(`the button opened a column for a Prone flyer: ${JSON.stringify(f)}`);
        await panelTab(page, 'explore');
        const row = await page.$eval('#ap-explore [data-row="fly"]', (e) => ({ off: e.getAttribute('aria-disabled'), text: e.textContent }));
        if (row.off !== 'true' || !/Prone/.test(row.text)) throw new Error(`the Fly row: ${JSON.stringify(row)}`);
        await act(page, { type: 'condition', actor: ID, condition: 'prone', on: false });
        await closePanels(page);
      });
    } finally { await ctx.close(); }
  });
}

// A phone (390x844, touch): the Fly button opens the column and a view that looked nearly straight down is tilted for it (and put back after);
// the stepper moves the pick; a drag up the column moves it under the finger and does not pan the map; a place in the air takes two taps
// (the first marks it and shows Go); the height tag on the token opens the column again and Go sends; the list of places sends the same move.
async function phone(browser, url) {
  await scenario('flying: touch, the camera and words (390x844 with touch)', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/fly-${n}-phone.png` }).catch(() => {}) : null);
      const picked = (want) => wait(page, (w) => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft === w, want);
      const pitch = () => page.evaluate(() => window.hextable.R.cameraAngles().pitch);
      const opened = async () => { await wait(page, () => window.hextable.mode.kind === 'fly' && window.hextable.R.hl?.column); await viewStill(page); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))); };
      // A place of the plane a finger can reach, nearest the middle of the free part of the screen.
      const tapPlace = async () => {
        const cells = await page.evaluate(() => window.hextable.R.hl.plane.cells.filter((c) => !c.floor && c.cost >= 15).map((c) => ({ key: c.key, h: c.h })));
        const at = [], colX = (await blockPx(page, 0)).x;
        // A press on the column (a finger within a block's grown pick area of it, up its whole height) belongs to the column's drag and is never a tap (app.js FLY_DRAG.down): the place straight above the token is
        // under the column, so it is not a place to tap. Whether the "20 ft" label over it let the point pass `onCanvas` is what made this step fail at random (#720).
        for (const c of cells) { const p = await cellPx(page, c.h); if (p && p.y > 230 && p.y < 640 && p.x > 30 && p.x < 360 && Math.abs(p.x - colX) > 70 && (await onCanvas(page, p.x, p.y))) at.push({ ...c, p, d: Math.abs(p.x - 195) + Math.abs(p.y - 520) }); }
        at.sort((x, y) => x.d - y.d);
        if (!at.length) throw new Error(`no place of the plane is on the screen (${cells.length} cells)`);
        return at[0];
      };

      await run.do('the Fly button opens the column; a view that looks nearly straight down is tilted to 0.9 for it; the stepper and the list are in the aim bar', async () => {
        await open(page, url); await playSolo(page); await recordInput(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await act(page, { type: 'setting', key: 'autoEngage', value: false });
        await act(page, { type: 'loadMap', map: MAP });
        await act(page, { type: 'place', actor: ID, to: { q: -1, r: 1 } });
        await act(page, { type: 'setSpeed', actor: ID, mode: 'fly', feet: 60 });
        await page.evaluate((i) => window.hextable.select(i), ID);
        await calm(page); await closePanels(page);
        await page.evaluate(() => window.hextable.R.tilt(0.4));
        const steep = await pitch();
        if (!(steep > 1.3)) throw new Error(`the view was not made steep: ${steep}`);
        const box = await page.$eval('#cam-fly', (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, hidden: b.hidden }; });
        if (box.hidden || box.w < 44 || box.h < 44) throw new Error(`the Fly button: ${JSON.stringify(box)}`);
        await page.tap('#cam-fly');
        await opened();
        if (Math.abs((await pitch()) - 0.9) > 0.01) throw new Error(`the view is at ${await pitch()}, not 0.9`);
        const bar = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id), q = e.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height), on: !e.hidden && q.width > 0 }; }; return { up: r('hint-up'), down: r('hint-down'), list: r('hint-fly'), ft: document.getElementById('hint-ft').textContent, go: !document.getElementById('hint-go').hidden, wide: document.getElementById('hint').getBoundingClientRect().right <= innerWidth + 1 }; });
        if (!bar.up.on || bar.up.w < 48 || bar.up.h < 48 || bar.down.w < 48 || bar.down.h < 48 || !bar.list.on || bar.list.h < 44 || bar.ft !== 'Ground' || bar.go || !bar.wide) throw new Error(`the aim bar: ${JSON.stringify(bar)}`);
        // How tall a block is on a phone at the default zoom (the spec asks for the number: worked out as 45 to 50 px).
        const px = await page.evaluate(() => { const R = window.hextable.R, U = Math.sqrt(3) / 5, col = R.hl.column, w = R.G.toWorld(col.at), y = (f) => R.screenPoint(w.x / U, w.z / U, col.z0 + f).y; return { ground: Math.round(y(0) - y(4.8)), at20: Math.round(y(20) - y(24.8)), top: Math.round(y(col.blocks.at(-1).ft + 4.8)), dist: (R.inner ?? R).cam.dist }; });
        console.log(`       a block on a 390x844 phone at the default zoom (camera ${px.dist} away, tilt 0.9): ${px.ground} px at the ground, ${px.at20} px at 20 ft; the top of the column is at y ${px.top}`);
        await shot('1-open');
      });

      await run.do('the stepper: up twice is 10 ft, down once is 5 ft, and the words are said for a screen reader', async () => {
        await page.tap('#hint-up'); await picked(5);
        await page.tap('#hint-up'); await picked(10);
        await page.tap('#hint-down'); await picked(5);
        const said = await page.$eval('#fly-live', (e) => e.textContent);
        if (!/^Picked 5 ft/.test(said) || (await page.$eval('#hint-ft', (e) => e.textContent)) !== '5 ft') throw new Error(`said "${said}"`);
      });

      await run.do('a drag up the column moves the pick under the finger one block at a time, shows the height above the finger, and does not pan the map', async () => {
        const from = await blockPx(page, 5), to = await blockPx(page, 20), cam0 = await page.evaluate(() => { const c = (window.hextable.R.inner ?? window.hextable.R).cam; return [c.x, c.z]; });
        await touch('touchStart', [[from.x, from.y]]);
        const seen = new Set();
        for (let i = 1; i <= 12; i++) {
          await touch('touchMove', [[from.x + 3, from.y + ((to.y - from.y) * i) / 12]]); await sleep(30);
          seen.add(await page.evaluate(() => window.hextable.R.hl.column?.blocks.find((b) => b.picked)?.ft));
          if (i === 6 && (await page.$eval('#fly-tip', (e) => e.hidden))) throw new Error('no height above the finger during the drag');
        }
        await touch('touchEnd', []);
        await picked(20);
        if (![10, 15, 20].every((f) => seen.has(f))) throw new Error(`the pick skipped blocks: ${[...seen]}`);
        const cam1 = await page.evaluate(() => { const c = (window.hextable.R.inner ?? window.hextable.R).cam; return [c.x, c.z]; });
        if (cam0[0] !== cam1[0] || cam0[1] !== cam1[1]) throw new Error('the drag on the column panned the map');
        if (!(await page.$eval('#fly-tip', (e) => e.hidden)) || (await page.evaluate(() => window.hextable.mode.kind)) !== 'fly') throw new Error('after the drag: the tip stayed or the column closed');
        await shot('2-dragged-20ft');
      });

      await run.do('a place in the air takes two taps: the first marks it (a line down, the cost, Go), the second sends; the column closes and the view tilts back', async () => {
        const c = await tapPlace(), before = await posOf(page);
        await page.touchscreen.tap(c.p.x, c.p.y);
        try { await wait(page, () => window.hextable.mode.marked && !!window.hextable.mode.point && !document.getElementById('hint-go').hidden); }
        catch (err) { throw new Error(`${err.message}\nfirst tap did not mark: ${await dumpTap(page, c)}`); }
        const mark = await page.evaluate(() => ({ key: window.hextable.mode.point, hint: document.getElementById('hint-text').textContent, go: document.getElementById('hint-go').textContent, line: !!window.hextable.R.hl.plane.point }));
        const now = await posOf(page);
        if (now.q !== before.q || now.r !== before.r || (now.z ?? 0) !== (before.z ?? 0)) throw new Error('one tap sent the flying move');
        if (mark.go !== 'Go' || !mark.line || !/Tap again or Go/.test(mark.hint) || !/20 ft up/.test(mark.hint)) throw new Error(`the marked place: ${JSON.stringify(mark)}`);
        await shot('3-marked');
        await sleep(450);
        await page.touchscreen.tap(c.p.x, c.p.y);
        await wait(page, ([i, k]) => { const q = window.hextable.state.entities[i].pos; return `${q.q},${q.r},${q.z}` === k; }, [ID, mark.key]);
        await calm(page);
        await wait(page, () => window.hextable.mode.kind === 'move' && !window.hextable.R.hl.column);
        await wait(page, () => window.hextable.R.cameraAngles().pitch > 1.3);
        if (await page.$eval('#hint-step', (e) => !e.hidden)) throw new Error('the stepper stayed after the move');
      });

      await run.do('the height tag on the token opens the column at its height; a tap marks a place and Go sends it', async () => {
        await waitShown(page, '#labels .label .alt:not([hidden])');
        const tag = await page.$eval('#labels .label .alt:not([hidden])', (e) => e.textContent);
        if (!/20 ft/.test(tag)) throw new Error(`the tag says "${tag}"`);
        await page.tap('#labels .label .alt:not([hidden])');
        await opened(); await picked(20);
        await page.tap('#hint-down'); await picked(15);
        const c = await tapPlace();
        await page.touchscreen.tap(c.p.x, c.p.y);
        await wait(page, () => window.hextable.mode.marked && !document.getElementById('hint-go').hidden);
        const key = await page.evaluate(() => window.hextable.mode.point);
        await page.tap('#hint-go');
        await wait(page, ([i, k]) => { const q = window.hextable.state.entities[i].pos; return `${q.q},${q.r},${q.z}` === k; }, [ID, key]);
        await calm(page);
      });

      await run.do('without the picture: Fly to… lists the places nearest first in words, choosing one marks it, Go sends the same move; one tap on the ground lands', async () => {
        await page.tap('#cam-fly'); await opened();
        await page.tap('#hint-up'); await picked(20);
        const opts = await page.$$eval('#hint-fly option', (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
        if (!/^Fly to/.test(opts[0].t) || !/^Straight up, at 20 ft up, costs 5 ft/.test(opts[1].t) || !/, 5 ft, at 20 ft up, costs/.test(opts[2].t)) throw new Error(`the list: ${JSON.stringify(opts.slice(0, 3))}`);
        await page.selectOption('#hint-fly', opts[2].v);
        await wait(page, () => window.hextable.mode.marked && !document.getElementById('hint-go').hidden);
        if (!/^Marked: /.test(await page.$eval('#fly-live', (e) => e.textContent))) throw new Error('the marked place was not said');
        await page.tap('#hint-go');
        await wait(page, ([i, k]) => { const q = window.hextable.state.entities[i].pos; return `${q.q},${q.r},${q.z}` === k; }, [ID, opts[2].v]);
        await calm(page);
        // Landing: the ground block, and the ordinary one tap.
        await page.tap('#cam-fly'); await opened();
        await page.keyboard.press('Home'); await picked(0);
        const g = await page.evaluate(() => window.hextable.R.hl.plane.cells.filter((c) => c.floor && (c.h.z ?? 0) === 0).map((c) => c.h));
        let spot = null;
        const colX = (await blockPx(page, 0)).x;            // the column stands in front of the ground behind it: a place clear of it
        for (const h of g) { const p = await page.evaluate((c) => window.hextable.R.screenOf(c), h); if (p && p.y > 300 && p.y < 640 && p.x > 40 && p.x < 350 && Math.abs(p.x - colX) > 70 && (await onCanvas(page, p.x, p.y))) { spot = { h, p }; break; } }
        if (!spot) throw new Error('no ground place on the screen');
        await page.touchscreen.tap(spot.p.x, spot.p.y);
        await wait(page, (i) => (window.hextable.state.entities[i].pos.z ?? 0) === 0, ID);
        await calm(page);
        if (await page.$('#labels .label .alt:not([hidden])')) throw new Error('the height tag stayed on the ground');
        await shot('4-landed');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await desktop(browser, url);
  await phone(browser, url);
}
