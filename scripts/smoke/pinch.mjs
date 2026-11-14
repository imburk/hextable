import { scenario, wait, open, playSolo, closePanels, sleep } from './lib.mjs';

// ---------- pinch zoom ----------
// The page may be pinch-zoomed (no maximum-scale in the viewport tag), but a pinch that starts on the map canvas
// is the game camera's: `touch-action: none` on #gl. Two-finger touches are sent through CDP.
export default async function (browser, url) {
  await scenario('pinch at 390x844 with touch', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const pinch = async (cx, cy, from, to) => {
        const at = (d) => [[cx - d, cy], [cx + d, cy]];
        await touch('touchStart', at(from));
        for (let i = 1; i <= 12; i++) { await touch('touchMove', at(from + ((to - from) * i) / 12)); await sleep(16); }
        await touch('touchEnd', []);
        await sleep(200);
      };
      const scale = () => page.evaluate(() => window.visualViewport.scale);
      const dist = () => page.evaluate(() => window.hextable.R.cam.dist);

      await run.do('open the lobby and play solo', async () => { await open(page, url); await playSolo(page); await closePanels(page); });
      await run.do('the viewport tag does not forbid zoom', async () => {
        const v = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
        if (/maximum-scale|user-scalable/.test(v)) throw new Error('viewport tag: ' + v);
      });
      await run.do('a spread on the canvas zooms the camera in and leaves the page at scale 1', async () => {
        const free = await page.evaluate(() => { for (let y = 300; y < 700; y += 20) if (document.elementFromPoint(195, y)?.id === 'gl') return y; return 0; });
        if (!free) throw new Error('no canvas point to pinch on');
        const d0 = await dist();
        await pinch(195, free, 30, 110);
        const d1 = await dist();
        if (!(d1 < d0)) throw new Error(`camera distance ${d0} -> ${d1}`);
        if ((await scale()) !== 1) throw new Error('page scale ' + (await scale()));
      });
      await run.do('a spread on a panel zooms the page', async () => {
        const ok = await page.evaluate(() => {
          const el = document.getElementById('btn-menu') ?? document.querySelector('button');
          return getComputedStyle(el).touchAction !== 'none' && getComputedStyle(document.body).touchAction !== 'none';
        });
        if (!ok) throw new Error('touch-action none on a panel');
        const r = await page.evaluate(() => { const b = document.getElementById('btn-menu').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
        await pinch(r[0], r[1], 20, 90);
        const sc = await scale(); console.log('       page scale after the pinch on a panel: ' + sc);
        if (!(sc > 1)) throw new Error('a pinch on a panel did not zoom the page: ' + sc);
      });
    } finally { await ctx.close(); }
  });
}
