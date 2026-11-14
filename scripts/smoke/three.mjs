
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { squareRoom } from '../../packages/rules/test/fixtures/square-room.js';
import { sleep, scenario, wait, open, playSolo, closePanels } from './lib.mjs';

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

// ---------- real shadows (R15) ----------
// On the Three.js renderer: the default is on for a computer or tablet and off for a phone; the Settings control and the page event switch it;
// with it on the picture differs from the picture with it off by a patch of floor (not by the whole screen), on a hex map and on a square one;
// and the sun's pass is not redrawn while nothing moves. Screenshots go to SMOKE_SHOTS.
async function pixelsApart(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = (u) => createImageBitmap(new Blob([Uint8Array.from(atob(u), (c) => c.charCodeAt(0))], { type: 'image/png' }));      // not fetch(data:): the page's policy refuses it
    const [p, q] = [await load(x), await load(y)], cv = new OffscreenCanvas(p.width, p.height), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(p, 0, 0); const A = g.getImageData(0, 0, p.width, p.height).data; g.clearRect(0, 0, p.width, p.height); g.drawImage(q, 0, 0); const B = g.getImageData(0, 0, p.width, p.height).data;
    let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) n++;
    return { n, of: p.width * p.height };
  }, [a.toString('base64'), b.toString('base64')]);
}
async function threeShadows(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desk', shots = process.env.SMOKE_SHOTS, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const stats = () => page.evaluate(() => window.hextable.R.stats());
      const set = async (v) => { await page.evaluate((x) => { const e = document.getElementById('set-shadows'); e.value = x; e.dispatchEvent(new Event('change')); }, v); await sleep(500); };
      await run.do('the default is on for a computer and off for a phone; the Settings control, stored, switches it; the address wins', async () => {
        await open(page, `${url}?renderer=three`); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three' && window.hextable.state.entities.fighter, null, 20000);
        await sleep(800);
        let st = await stats();
        if (st.shadows !== !touch || st.shadowMode !== 'auto') throw new Error(`by default: ${JSON.stringify(st)}`);
        await set('on'); st = await stats();
        if (!st.shadows || st.shadowSize !== (touch ? 1024 : 2048)) throw new Error(`On: ${JSON.stringify(st)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.shadows'))) !== '"on"') throw new Error('On was not stored');
        await set('off'); st = await stats();
        if (st.shadows || st.shadowSize !== 0) throw new Error(`Off: ${JSON.stringify(st)}`);
        await page.goto(`${url}?renderer=three&shadows=on`); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three' && window.hextable.state.entities.fighter, null, 20000);
        if (!(await stats()).shadows) throw new Error('?shadows=on did not win over the stored Off');
        if (!(await page.evaluate(() => document.getElementById('set-shadows').disabled))) throw new Error('the control is not off while the address sets the shadows');
      });
      for (const grid of ['hex', 'square']) {
        await run.do(`${grid}: shadows on differ from shadows off by a patch of floor, and the sun's pass rests while nothing moves`, async () => {
          if (grid === 'square') { await page.evaluate((m) => window.hextable.act({ type: 'loadMap', map: m }), squareRoom()); await wait(page, () => window.hextable.state.map.grid === 'square'); }
          else { await page.evaluate(() => window.hextable.ED.stock('dungeon')); await wait(page, () => window.hextable.state.map.id === 'dungeon'); }
          await closePanels(page); await sleep(1200);
          await page.evaluate(() => { const h = window.hextable, pc = Object.values(h.state.entities).find((e) => e.kind === 'pc'); h.R.focus(pc.id, true); h.R.rotate(0.3); h.R.zoom(0.7); });
          await sleep(1500);
          const clip = await page.evaluate(() => { const r = document.getElementById('gl').getBoundingClientRect(); return { x: 0, y: 0, width: Math.floor(r.width), height: Math.floor(r.height * 0.55) }; });      // the upper part: the action panel covers the rest on a phone
          await set('on'); await sleep(1800);
          const on = await page.screenshot({ clip }), before = await stats();
          await sleep(1500);
          const after = await stats();
          if (after.shadowPasses !== before.shadowPasses) throw new Error(`the sun's pass was drawn ${after.shadowPasses - before.shadowPasses} more times with nothing moving`);
          if (!(before.shadowPasses >= 1 && before.shadowCalls >= 1)) throw new Error(`no pass was drawn: ${JSON.stringify(before)}`);
          await set('off'); await sleep(1800);
          const off = await page.screenshot({ clip });
          const d = await pixelsApart(page, on, off), frac = d.n / d.of;
          console.log(`       ${grid} ${tag}: ${d.n} of ${d.of} pixels differ (${(frac * 100).toFixed(1)} %); sun's pass ${before.shadowCalls} draw calls, ${before.shadowPasses} passes; frame ms on ${before.frameMs.toFixed(1)}, off ${(await stats()).frameMs.toFixed(1)} (software GL: comparable only)`);
          if (shots) { await writeFile(join(shots, `shadows-${grid}-${tag}-on.png`), on); await writeFile(join(shots, `shadows-${grid}-${tag}-off.png`), off); }
          if (!(frac > 0.002)) throw new Error(`shadows on and off look alike (${d.n} pixels)`);
          if (!(frac < 0.35)) throw new Error(`shadows changed ${(frac * 100).toFixed(0)} % of the screen`);
        });
      }
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=three.
export default async function (browser, url) {
  await threePass(browser, url, 'three: the vendored library at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeShadows(browser, url, 'three: real shadows at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeShadows(browser, url, 'three: real shadows at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
