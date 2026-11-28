import { sleep, scenario, wait, state, waitShown, open, playSolo, closePanels, openTab } from './lib.mjs';

// #931: an overgrown tile (Plant Growth's `overgrown: true` on grass or forest) is drawn darker and denser with a tangle of blades, and the DM's Properties tool shows
// "Overgrown (4 ft per foot)" on it with a Clear overgrowth button that sends a tile edit. The map is loaded with five overgrown tiles; the renderer counts them (`R.overgrown`).
// SMOKE_SHOTS saves screenshots.
const SIZES = [['1280x800', { viewport: { width: 1280, height: 800 } }], ['390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];

export default async function overgrowth(browser, url) {
  for (const [name, opts] of SIZES) {
    await scenario(`overgrown tiles at ${name}`, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/overgrowth-${n}-${touch ? 'phone' : 'desktop'}.png` }) : null);
      const tile = (q, r) => state(page, (S, a) => S.map.levels[0].tiles[`${a[0]},${a[1]}`], [q, r]);
      const aim = (q, r) => page.evaluate(([q0, r0]) => {
        const R = window.hextable.R, s = R.screenOf({ q: q0, r: r0, z: 0 }), ed = document.querySelector('#editor'), top = ed && !ed.hidden ? ed.getBoundingClientRect().top : innerHeight;
        const a = R.planePoint(s.x, s.y, 0), b = R.planePoint(innerWidth / 2, Math.min(top, innerHeight) / 2, 0);
        R.cam.x += (a[0] - b[0]) * Math.sqrt(3) / 5; R.cam.z += (a[1] - b[1]) * Math.sqrt(3) / 5; R.cam.goal = null;
      }, [q, r]);
      const tap = async (q, r) => {
        for (let i = 0; i < 3; i++) { await aim(q, r); await sleep(400); }
        const s = await page.evaluate(([q0, r0]) => window.hextable.R.screenOf({ q: q0, r: r0, z: 0 }), [q, r]);
        if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y);
      };
      try {
        await run.do('load a map with five overgrown grass and forest tiles: the renderer draws five', async () => {
          await open(page, url); await playSolo(page); await closePanels(page);
          await page.evaluate(async () => {
            const o = {}; for (let q = -5; q <= 5; q++) for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) o[`${q},${r}`] = { t: 'grass' };
            for (const [q, r, t] of [[0, 0, 'grass'], [1, 0, 'grass'], [2, 0, 'forest'], [0, 1, 'grass'], [1, 1, 'forest']]) o[`${q},${r}`] = { t, overgrown: true };
            o['-1,0'] = { t: 'grass' }; o['-2,0'] = { t: 'forest' };
            const { newMap } = await import('./shared/map.js');
            await window.hextable.act({ type: 'loadMap', map: newMap({ id: 'og', name: 'Overgrown', starts: [{ q: -3, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: o }] }) });
          });
          await wait(page, () => window.hextable.state.map.id === 'og');
          await wait(page, () => window.hextable.R.overgrown === 5);
          for (let i = 0; i < 3; i++) { await aim(1, 0); await sleep(400); }
          await shot('drawn');
        });
        await run.do('the DM edits: Properties on overgrown grass says so and clears it with a tile edit; the renderer draws four', async () => {
          await openTab(page, 'dm'); await waitShown(page, '#dm');
          await page.click('#dm-edit'); await waitShown(page, '#editor');
          await page.click('#ed-tools [data-tool="props"]');
          await sleep(600);
          await tap(0, 0);
          await waitShown(page, '#ed-clearover');
          if (!/Overgrown \(4 ft per foot\)/.test(await page.textContent('#ed-wtile'))) throw new Error('words');
          await shot('panel');
          await page.click('#ed-clearover');
          await wait(page, () => window.hextable.state.map.levels[0].tiles['0,0'].overgrown === undefined);
          if ((await tile(0, 0)).t !== 'grass') throw new Error('the tile lost its type');
          await wait(page, () => window.hextable.R.overgrown === 4);
        });
        await run.do('a plain grass tile opens no panel', async () => {
          await tap(-1, 0);
          await sleep(300);
          if (await page.isVisible('#ed-clearover')) throw new Error('the Clear button shows on plain grass');
          await page.click('#ed-done'); await sleep(800);
          for (let i = 0; i < 3; i++) { await aim(1, 0); await sleep(400); }
          await shot('cleared');
        });
      } finally { await ctx.close(); }
    });
  }
}
