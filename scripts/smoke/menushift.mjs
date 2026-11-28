// Opening the menu must not move the map (#749): the canvas keeps its size and place and the camera stays where it was; the menu slides over the map.
import { sleep, scenario, wait, open, playSolo, openMenu, closeMenu, waitShown } from './lib.mjs';

export default async function menushift(browser, url) {
  for (const [label, opts] of [['menushift at 1280x800', { viewport: { width: 1280, height: 800 } }], ['menushift at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    await scenario(label, async (run) => {
      const ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      try {
        await open(page, url);
        await playSolo(page);
        await sleep(800);
        const look = () => page.evaluate(() => {
          const c = document.getElementById('gl'), r = c.getBoundingClientRect(), R = window.hextable.R, cam = R.inner?.camera ?? R.camera;
          return { client: [c.clientWidth, c.clientHeight], rect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100), eye: cam ? [cam.position.x, cam.position.y, cam.position.z].map((v) => Math.round(v * 1000) / 1000) : null, inset: R.inset };
        });
        const before = await look();
        if (!before.eye) throw new Error('could not read the camera');
        const same = (what, now) => { if (JSON.stringify([now.client, now.rect, now.eye]) !== JSON.stringify([before.client, before.rect, before.eye])) throw new Error(`${what}: the map moved: ${JSON.stringify(before)} -> ${JSON.stringify(now)}`); };
        await run.do('the arc leaves the map where it was', async () => {
          await page.click('#btn-menu'); await waitShown(page, '#menu-arc'); await sleep(900);
          same('the arc', await look());
          await closeMenu(page); await sleep(400);
          same('after the arc', await look());
        });
        for (const path of ['turns', 'dice', 'log', 'settings']) {
          await run.do(`the ${path} screen slides over the map`, async () => {
            await openMenu(page, path); await sleep(900);
            same(`the ${path} screen`, await look());
            await closeMenu(page); await sleep(500);
            same(`after the ${path} screen`, await look());
          });
        }
      } finally { await ctx.close(); }
    });
  }
}
