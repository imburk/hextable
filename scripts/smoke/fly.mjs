import { scenario, wait, state, open, playSolo, calm, closePanels, waitShown, onCanvas, panelTab, viewStill } from './lib.mjs';
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

export default async function (browser, url) {
  await desktop(browser, url);
}
