import { sleep, scenario, wait, state, waitShown, open, playSolo, closePanels, openTab } from './lib.mjs';

// #814: the map editor's Properties panel has a Depth field for an object that falls (a pit). A pit over a cellar 30 ft down is set
// to 30 and saved (the map in the game state carries fall: 30); 20 ft has no floor within reach (the cellar is 30 down), so the linter's words appear under the
// field, nothing is sent and the field goes back to 30; 10 ft (same level) drops the key. A door has no Depth field.
const SIZES = [['1280x800', { viewport: { width: 1280, height: 800 } }], ['390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];

export default async function pitdepth(browser, url) {
  for (const [name, opts] of SIZES) {
    await scenario(`pit depth in the editor at ${name}`, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      const pit = () => state(page, (S) => S.map.objects.find((o) => o.id === 'pit'));
      try {
        await run.do('load a map with a pit over a cellar and open Properties', async () => {
          await open(page, url); await playSolo(page); await closePanels(page);
          await page.evaluate(async () => {
            const ring = (n) => { const o = {}; for (let q = -n; q <= n; q++) for (let r = Math.max(-n, -q - n); r <= Math.min(n, -q + n); r++) o[`${q},${r}`] = { t: 'stone' }; return o; };
            const { newMap } = await import('./shared/map.js');
            const map = newMap({ id: 'pd', name: 'Pit depth', starts: [{ q: -3, r: 0 }],
              levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: ring(5) }, { id: 'cellar', name: 'Cellar', z: -30, tiles: ring(5) }],
              objects: [{ id: 'pit', def: 'spiked-pit', level: 'ground', at: { q: 1, r: 0 }, state: 'found' }, { id: 'door', def: 'door-wooden', level: 'ground', at: { q: 0, r: 1 }, edge: 0, state: 'closed' }] });
            await window.hextable.act({ type: 'loadMap', map });
          });
          await wait(page, () => window.hextable.state.map.id === 'pd');
          await openTab(page, 'dm'); await waitShown(page, '#dm');
          await page.click('#dm-edit'); await waitShown(page, '#editor');
          await page.click('#ed-tools [data-tool="props"]');
          await sleep(500);
        });
        const tapPit = async () => {
          for (let i = 0; i < 3; i++) await page.evaluate(() => {       // bring the hex to the middle of the strip above the editor, as the maps pass does
            const R = window.hextable.R, s = R.screenOf({ q: 1, r: 0, z: 0 }), top = document.querySelector('#editor').getBoundingClientRect().top;
            const a = R.planePoint(s.x, s.y, 0), b = R.planePoint(innerWidth / 2, Math.min(top, innerHeight) / 2, 0);
            R.cam.x += (a[0] - b[0]) * Math.sqrt(3) / 5; R.cam.z += (a[1] - b[1]) * Math.sqrt(3) / 5; R.cam.goal = null;
          }).then(() => sleep(400));
          const s = await page.evaluate(() => window.hextable.R.screenOf({ q: 1, r: 0, z: 0 }));
          const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.tagName, [s.x, s.y]);
          if (under !== 'gl') throw new Error(`the pit hex at ${Math.round(s.x)},${Math.round(s.y)} is under ${under}`);
          if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y);
          await waitShown(page, '#ed-form select[name="depth"]');
        };
        await run.do('tap the pit: a Depth field offers 10 ft (same level) and 20 to 200', async () => {
          await tapPit();
          const o = await page.$$eval('select[name="depth"] option', (os) => os.map((x) => x.textContent));
          if (o.length !== 20 || !/^10 ft \(same level\)$/.test(o[0]) || o[19] !== '200 ft') throw new Error(`options: ${o.slice(0, 3)}...${o.at(-1)}`);
        });
        await run.do('Depth 30 and Save: the map carries fall 30', async () => {
          await page.selectOption('select[name="depth"]', '30');
          await page.click('#ed-form button.go');
          await wait(page, () => window.hextable.state.map.objects.find((o) => o.id === 'pit').fall === 30);
        });
        await run.do('Depth 20 has no floor: the linter words show, nothing changes, the field is back at 30', async () => {
          await page.selectOption('select[name="depth"]', '20');
          await page.click('#ed-form button.go');
          await waitShown(page, '#ed-depthnote');
          const t = await page.textContent('#ed-depthnote');
          if (!/no floor within 20 feet/.test(t)) throw new Error(`note: ${t}`);
          if ((await page.inputValue('select[name="depth"]')) !== '30') throw new Error('the field did not go back to 30');
          if ((await pit()).fall !== 30) throw new Error('the saved depth changed');
        });
        await run.do('Depth 10 drops the key', async () => {
          await page.selectOption('select[name="depth"]', '10');
          await page.click('#ed-form button.go');
          await wait(page, () => !('fall' in window.hextable.state.map.objects.find((o) => o.id === 'pit')));
        });
        await run.do('a door has no Depth field', async () => {
          await page.click('#ed-closeform');
          const s = await page.evaluate(() => { const h = window.hextable.state.map.objects.find((o) => o.id === 'door'); return window.hextable.R.screenOf({ q: h.at.q, r: h.at.r, z: 0 }); });
          if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y);
          await waitShown(page, '#ed-form select[name="state"]');
          if (await page.$('select[name="depth"]')) throw new Error('a door shows Depth');
        });
      } finally { await ctx.close(); }
    });
  }
}
