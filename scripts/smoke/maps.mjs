
import { sleep, scenario, wait, state, waitShown, open, playSolo, closePanels, openTab, selectAndMove } from './lib.mjs';

// ---------- stock maps ----------
// The DM starts on a stock map from the editor's Map file tool (two taps: the second confirms), and a
// character walks on it. Then every other stock map is loaded with the same action, as a page error would show.
async function stockMaps(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('open the lobby and play solo', async () => { await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter); });
      await run.do('pick the dungeon under Map file > Stock map and start on it', async () => {
        await closePanels(page);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        await page.click('#dm-edit'); await waitShown(page, '#editor');
        await page.click('#ed-tools [data-tool="file"]');
        await waitShown(page, '#ed-stock');
        await page.selectOption('#ed-stock', 'dungeon');
        await page.click('#ed-stockgo');                       // the first tap only arms it
        if ((await state(page, (S) => S.map.id)) === 'dungeon') throw new Error('one tap changed the map');
        await page.click('#ed-stockgo');
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
        const bad = await state(page, (S) => Object.values(S.entities).filter((e) => e.side !== 'party').length);
        if (bad) throw new Error('creatures from the old map are still there');
        await page.click('#ed-done'); await waitShown(page, '#editor', false);
      });
      await run.do('a character walks on the dungeon', async () => {
        const start = await state(page, (S) => S.entities.fighter.pos);
        await sleep(400);
        const pos = await selectAndMove(page, touch, 'fighter', 'Brenna');
        if (pos.q === start.q && pos.r === start.r) throw new Error('the character is where it was');
      });
      await run.do('every stock map loads and the party stands on it', async () => {
        const ids = await page.evaluate(async () => {
          const { STOCK_MAPS } = await import('./shared/content/maps/index.js'), out = [];
          for (const m of STOCK_MAPS) {
            const r = await window.hextable.act({ type: 'loadMap', map: structuredClone(m.map) });
            const S = window.hextable.state;
            out.push([m.id, S.map.id, Object.values(S.entities).every((e) => S.map.levels.some((l) => l.tiles[`${e.pos.q},${e.pos.r}`]))]);
          }
          return out;
        });
        for (const [want, got, stands] of ids) if (want !== got || !stands) throw new Error(`${want}: got map ${got}, standing ${stands}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=maps.
export default async function (browser, url) {
  await stockMaps(browser, url, 'stock maps at 1280x800', { viewport: { width: 1280, height: 800 } });
  await stockMaps(browser, url, 'stock maps at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
