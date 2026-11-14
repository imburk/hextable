
import { sleep, scenario, wait, state, waitShown, open, playSolo, closeMenu, closePanels, openTab } from './lib.mjs';

// ---------- the renderer interface (docs/specs/renderer.md, decision 7; R5) ----------
// The page loads with the renderer that draws nothing (`?renderer=none`, or the device preference `hextable.renderer`), the table is
// hosted and a character moves by action: the UI and the rules play without a picture, and nothing throws. Then the default renderer
// reports stats(). The rest of this script reads the default renderer's insides through window.hextable.R (R.cam, R.floorData,
// R.actors, R.screenOf ...): that is the smoke script's test surface and the app does not use it; test/renderer.test.js checks the app.
async function interfacePass(browser, url, label, opts, how) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts, { pace: 'instant' });
    if (how === 'pref') await ctx.addInitScript(() => { try { localStorage.setItem('hextable.renderer', JSON.stringify('none')); } catch { /* storage unavailable */ } });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('load with the empty renderer', async () => {
        await open(page, how === 'pref' ? url : `${url}?renderer=none`);
      });
      await run.do('host a table and play', async () => {
        await page.fill('#lobby-name', 'Smoke DM');
        await page.click('#lobby-host');
        await wait(page, () => window.hextable?.state?.entities?.fighter);
        const name = await page.evaluate(() => window.hextable.R.constructor.name);
        if (name !== 'EmptyRenderer') throw new Error(`the renderer is ${name}, not the empty one`);
        const s = await page.evaluate(() => JSON.stringify(window.hextable.R.stats()));
        if (!/"drawCalls":0/.test(s)) throw new Error(`stats of the empty renderer: ${s}`);
      });
      await run.do('the edge-of-a-fight control is in Settings and the empty renderer takes the flash event without error (#305)', async () => {
        await page.evaluate(() => { const e = document.getElementById('set-arena-edge'); e.value = 'edge'; e.dispatchEvent(new Event('change')); window.dispatchEvent(new CustomEvent('hextable-arena-flash', { detail: { q: 0, r: 0 } })); });
        const v = await page.evaluate(() => [localStorage.getItem('hextable.arenaEdge'), document.getElementById('set-arena-edge').value]);
        if (v[0] !== '"edge"' || v[1] !== 'edge') throw new Error(`the control left ${JSON.stringify(v)}`);
      });
      await run.do('a character moves by action and the game answers', async () => {
        const from = await state(page, (S) => S.entities.fighter.pos);
        for (const d of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
          await page.evaluate(([f, d0]) => window.hextable.act({ type: 'move', actor: 'fighter', to: { q: f.q + d0[0], r: f.r + d0[1], z: f.z } }), [from, d]);
          await sleep(150);
          const now = await state(page, (S) => S.entities.fighter.pos);
          if (now.q !== from.q || now.r !== from.r) return;
        }
        throw new Error('the character did not move in any direction');
      });
      await run.do('the page works without a picture: tracker, sheet, undo, the editor, a fight', async () => {
        await closePanels(page);
        await openTab(page, 'turns'); await closeMenu(page);
        await page.click('#party button:has-text("Brenna")'); await page.click('#btn-sheet'); await waitShown(page, '#sheet'); await closeMenu(page);
        await wait(page, () => { const b = document.getElementById('btn-undo'); return !b.hidden && !b.disabled; });
        await page.click('#btn-undo');
        await page.evaluate(() => { const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => window.hextable.state.encounter === null);
        await page.evaluate(() => window.hextable.ED.stock('dungeon'));
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
      });
    } finally { await ctx.close(); }
  });
}
async function statsPass(browser, url) {
  await scenario('interface: the default renderer reports stats', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }, { pace: 'instant' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('stats() has frame time, quality, pixel ratio and draw calls', async () => {
        await open(page, url); await playSolo(page); await sleep(1500);
        const s = await page.evaluate(() => window.hextable.R.stats());
        if (!(s.frameMs > 0) || s.quality !== 0 || !(s.pixelRatio >= 1) || !(s.drawCalls > 0)) throw new Error(`stats: ${JSON.stringify(s)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=interface.
export default async function (browser, url) {
  await interfacePass(browser, url, 'interface: the empty renderer at 1280x800 (address flag)', { viewport: { width: 1280, height: 800 } }, 'address');
  await interfacePass(browser, url, 'interface: the empty renderer at 390x844 with touch (preference)', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'pref');
  await statsPass(browser, url);
}
