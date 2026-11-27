import { sleep, scenario, wait, state, waitShown, open, playSolo, closePanels, openTab } from './lib.mjs';

// #850: the map editor's Paint tool has a Depth field when the terrain is Water (5 to 200 in 5s, default 10): water painted carries it, stone painted over water drops it,
// and the Properties tool on a water tile shows its Depth and changes it with a tile edit. Water of three depths is drawn in three tints (SMOKE_SHOTS saves screenshots).
const SIZES = [['1280x800', { viewport: { width: 1280, height: 800 } }], ['390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];

export default async function waterdepth(browser, url) {
  for (const [name, opts] of SIZES) {
    await scenario(`water depth in the editor at ${name}`, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/waterdepth-${n}-${touch ? 'phone' : 'desktop'}.png` }) : null);
      const tile = (q, r) => state(page, (S, a) => S.map.levels[0].tiles[`${a[0]},${a[1]}`], [q, r]);
      const tap = async (q, r) => {
        for (let i = 0; i < 3; i++) await page.evaluate(([q0, r0]) => {
          const R = window.hextable.R, s = R.screenOf({ q: q0, r: r0, z: 0 }), top = document.querySelector('#editor').getBoundingClientRect().top;
          const a = R.planePoint(s.x, s.y, 0), b = R.planePoint(innerWidth / 2, Math.min(top, innerHeight) / 2, 0);
          R.cam.x += (a[0] - b[0]) * Math.sqrt(3) / 5; R.cam.z += (a[1] - b[1]) * Math.sqrt(3) / 5; R.cam.goal = null;
        }, [q, r]).then(() => sleep(400));
        const s = await page.evaluate(([q0, r0]) => window.hextable.R.screenOf({ q: q0, r: r0, z: 0 }), [q, r]);
        if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y);
      };
      try {
        await run.do('load a stone map with three water tiles of 5, 20 and 60 ft and open Paint', async () => {
          await open(page, url); await playSolo(page); await closePanels(page);
          await page.evaluate(async () => {
            const o = {}; for (let q = -5; q <= 5; q++) for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) o[`${q},${r}`] = { t: 'stone' };
            o['0,0'] = { t: 'water', depth: 5 }; o['1,0'] = { t: 'water', depth: 20 }; o['2,0'] = { t: 'water', depth: 60 };
            const { newMap } = await import('./shared/map.js');
            await window.hextable.act({ type: 'loadMap', map: newMap({ id: 'wd', name: 'Water depth', starts: [{ q: -3, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: o }] }) });
          });
          await wait(page, () => window.hextable.state.map.id === 'wd');
          await openTab(page, 'dm'); await waitShown(page, '#dm');
          await page.click('#dm-edit'); await waitShown(page, '#editor');
          await page.click('#ed-tools [data-tool="paint"]');
          await sleep(600);
        });
        await run.do('the Depth field is hidden for stone and shown for Water, 5 to 200 in 5s, default 10, with the words', async () => {
          if (await page.isVisible('#ed-wdepthsel')) throw new Error('Depth shows for stone');
          await page.click('#ed-terrain [data-t="water"]');
          await waitShown(page, '#ed-wdepthsel');
          const o = await page.$$eval('#ed-wdepthsel option', (os) => os.map((x) => x.textContent));
          if (o.length !== 40 || o[0] !== '5 ft' || o[39] !== '200 ft') throw new Error(`options: ${o.slice(0, 2)}...${o.at(-1)}`);
          if ((await page.inputValue('#ed-wdepthsel')) !== '10') throw new Error('default is not 10');
          const t = await page.textContent('#ed-wdepthnote');
          if (t !== 'Depth 10 ft (to the bed)') throw new Error(`note: ${t}`);
        });
        await run.do('Depth 40 and paint a stone hex: it is water with depth 40; the choice is kept', async () => {
          await page.selectOption('#ed-wdepthsel', '40');
          await tap(0, 2);
          await wait(page, () => window.hextable.state.map.levels[0].tiles['0,2'].depth === 40);
          if ((await tile(0, 2)).t !== 'water') throw new Error('not water');
          if ((await page.inputValue('#ed-wdepthsel')) !== '40') throw new Error('the choice was not kept');
          await shot('paint');
        });
        await run.do('stone painted over that water drops the depth', async () => {
          await page.click('#ed-terrain [data-t="stone"]');
          await tap(0, 2);
          await wait(page, () => window.hextable.state.map.levels[0].tiles['0,2'].t === 'stone');
          if ('depth' in (await tile(0, 2))) throw new Error('stone kept a depth');
        });
        await run.do('the Properties tool on water shows its Depth and changing it sends a tile edit', async () => {
          await page.click('#ed-tools [data-tool="props"]');
          await sleep(300);
          await tap(1, 0);
          await waitShown(page, '#ed-wtiledepth');
          if ((await page.inputValue('#ed-wtiledepth')) !== '20') throw new Error('the panel does not show 20');
          if (!/Depth 20 ft \(to the bed\)/.test(await page.textContent('#ed-wtile'))) throw new Error('words');
          await page.selectOption('#ed-wtiledepth', '25');
          await wait(page, () => window.hextable.state.map.levels[0].tiles['1,0'].depth === 25);
          await shot('tile');
        });
        await run.do('water of three depths is drawn in three tints', async () => {
          await page.click('#ed-done'); await sleep(800);
          await page.evaluate(() => { const R = window.hextable.R; R.cam.goal = null; });
          await shot('water');
        });
      } finally { await ctx.close(); }
    });
  }
}
