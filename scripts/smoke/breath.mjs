import { sleep, scenario, wait, open, playSolo, closePanels, openChar, closeMenu } from './lib.mjs';

// ---------- the breath meter and the words (docs/specs/fly-swim-control.md, E2 build notes; DEBT T110 (1)) ----------
// Solo, a stone table with a pool of water 40 ft deep. The fighter (Constitution 15: three minutes) is put under the surface by the test hook of this pass (its position set in the
// state, as the DM's moving it would), and time goes by (`advanceTime`). Over the token: a meter that is full, then half, then in the warning colour (last two rounds), then
// empty when out of breath. On the character's page: "Holding breath: N rounds left" and "Out of breath". A creature on the shore shows neither.
// SMOKE_SHOTS saves a screenshot of each.
const SIZES = [['1280x800', { viewport: { width: 1280, height: 800 } }], ['390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];
const ID = 'fighter';

export default async function breath(browser, url) {
  for (const [name, opts] of SIZES) {
    await scenario(`breath under water at ${name}`, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      // Two screenshots for a state: the map with the camera on the fighter (the meter over the token), and the character's page (the words).
      const shot = async (n) => {
        if (!process.env.SMOKE_SHOTS) return;
        const at = (k) => `${process.env.SMOKE_SHOTS}/breath-${n}-${k}-${touch ? 'phone' : 'desktop'}.png`;
        await page.evaluate((id) => { const R = window.hextable.R; R.focus?.(id, true); }, ID); await sleep(700);
        await page.screenshot({ path: at('map') }).catch(() => {});
        await openChar(page).catch(() => {}); await sleep(500);
        await page.screenshot({ path: at('sheet') }).catch(() => {});
        await closeMenu(page).catch(() => {});
      };
      const meter = () => page.evaluate((id) => {
        const h = window.hextable, nm = h.state.entities[id].name, el = [...document.querySelectorAll('#labels .label')].find((l) => l.firstChild?.textContent === nm)?.querySelector('.breath');
        const line = document.getElementById('c-breath');
        return { shown: !!el && !el.hidden && getComputedStyle(el).display !== 'none', width: el ? Math.round(parseFloat(el.firstChild.style.width)) : null, warn: !!el?.classList.contains('warn'), words: line && !line.hidden ? line.textContent : '' };
      }, ID);
      try {
        await run.do('a pool 40 ft deep and the fighter on the shore: no meter, no words', async () => {
          await open(page, url); await playSolo(page); await closePanels(page);
          await page.evaluate(async () => {
            const o = {}; for (let q = -5; q <= 5; q++) for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) o[`${q},${r}`] = { t: q >= 1 && q <= 3 ? 'water' : 'stone', ...(q >= 1 && q <= 3 ? { depth: 40 } : {}) };
            const { newMap } = await import('./shared/map.js');
            await window.hextable.act({ type: 'loadMap', map: newMap({ id: 'bm', name: 'Breath', starts: [{ q: -3, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: o }] }) });
          });
          await wait(page, () => window.hextable.state.map.id === 'bm');
          await page.evaluate((id) => { const S = window.hextable.state, e = S.entities[id]; e.pos = { q: -3, r: 0, z: 0 }; window.hextable.select(id); }, ID);
          await sleep(600);
          const m = await meter();
          if (m.shown || m.words) throw new Error(`a creature on the shore shows breath: ${JSON.stringify(m)}`);
        });
        await run.do('under the surface with the breath full: a full meter and "Holding breath: about 3 minutes left"', async () => {
          await page.evaluate((id) => { const S = window.hextable.state; S.entities[id].pos = { q: 2, r: 0, z: -10 }; S.breathAt = S.clock; window.hextable.select(id); }, ID);
          await page.evaluate(() => window.hextable.act({ type: 'advanceTime', minutes: 0.1 }));
          await wait(page, (id) => !!window.hextable.state.entities[id].breath, ID);
          await sleep(500);
          const m = await meter();
          if (!m.shown || m.width < 95 || m.warn) throw new Error(`no full meter: ${JSON.stringify(m)}`);
          if (!/^Holding breath: (about \d+ minutes?|\d+ rounds?) left$/.test(m.words)) throw new Error(`the words: ${JSON.stringify(m)}`);
          await shot('full');
        });
        await run.do('after a minute and a half the meter is half and in the normal colour', async () => {
          await page.evaluate(() => window.hextable.act({ type: 'advanceTime', minutes: 1.4 }));
          await sleep(600);
          const m = await meter();
          if (!m.shown || m.width < 40 || m.width > 60 || m.warn) throw new Error(`not half: ${JSON.stringify(m)}`);
          await shot('half');
        });
        await run.do('in the last two rounds the meter is in the warning colour and the words say so', async () => {
          await page.evaluate(() => window.hextable.act({ type: 'advanceTime', minutes: 1.4 }));
          await sleep(600);
          const m = await meter();
          if (!m.shown || !m.warn || !/ [12] rounds? left$/.test(m.words)) throw new Error(`no warning: ${JSON.stringify(m)}`);
          await shot('warn');
        });
        await run.do('out of breath: an empty meter in the warning colour and "Out of breath"', async () => {
          await page.evaluate(() => window.hextable.act({ type: 'advanceTime', minutes: 0.5 }));
          await sleep(600);
          const m = await meter();
          if (!m.shown || !m.warn || m.width !== 0 || m.words !== 'Out of breath') throw new Error(`not out of breath: ${JSON.stringify(m)}`);
          await shot('out');
        });
        await run.do('back on the shore the meter and the words go', async () => {
          await page.evaluate((id) => { window.hextable.state.entities[id].pos = { q: -3, r: 0, z: 0 }; }, ID);
          await page.evaluate(() => window.hextable.act({ type: 'advanceTime', minutes: 0.1 }));
          await sleep(600);
          const m = await meter();
          if (m.shown || m.words) throw new Error(`still showing: ${JSON.stringify(m)}`);
        });
      } finally { await ctx.close(); }
    });
  }
}
