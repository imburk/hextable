import { sleep, scenario, wait, state, shown, waitShown, open, calm } from './lib.mjs';
import { mkdirSync } from 'node:fs';

// ---------- the formation popup (docs/specs/table-ui.md, "E22: formations, client", issue #304) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch, on hexes and on squares. Lead sends `partyFollow` and the popup opens with the
// leader fixed in front and a token for exactly those the engine says follow; a preset and OK send `formation { shape }`; a token dragged
// (mouse) or tapped and then a cell tapped (touch) sends `formation { slots }`; Cancel sends nothing; after the leader has walked, the
// places show as faint cells on the map; in a fight there is no Lead and no Formation row. SMOKE_SHOTS=<dir> saves screenshots.

const ids = (page) => state(page, (S) => Object.values(S.entities).filter((x) => x.side === 'party' && !x.dead && !x.hidden && x.follow === 'fighter').map((x) => x.id).sort());
const rowClick = async (page, id) => {
  const sel = `#ap-explore [data-row="${id}"]`;
  await waitShown(page, '#ap-explore');
  if (!(await shown(page, sel))) { await page.click('#ap-explore .ap-more summary'); await waitShown(page, sel); }
  await page.click(sel);
};
const center = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

async function pass(browser, url, label, opts, grid) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'wide'}`;
    const dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (dir ? page.screenshot({ path: `${dir}/formation-${n}-${tag}.png` }).catch(() => {}) : null);
      const shape = () => state(page, (S) => S.entities.fighter.formation?.shape ?? null);
      const slots = () => state(page, (S) => S.entities.fighter.formation?.slots ?? null);

      await run.do('Lead opens the popup: the leader in front, one token for each follower the engine lists', async () => {
        await open(page, url, { grid });
        await page.click('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities?.fighter);
        await page.evaluate(() => window.hextable.select('fighter'));
        await waitShown(page, '#ap-explore');
        await rowClick(page, 'lead');
        await waitShown(page, '#fm');
        const want = await ids(page);
        const got = await page.$$eval('#fm .fm-tok:not(.lead)', (t) => t.map((x) => x.dataset.id).sort());
        if (JSON.stringify(want) !== JSON.stringify(got) || !want.length) throw new Error(`tokens ${got}, engine followers ${want}`);
        if ((await page.$$('#fm .fm-tok.lead')).length !== 1) throw new Error('no leader token');
        if ((await shape()) !== 'held') throw new Error(`shape ${await shape()}, not held`);
        if ((await page.getAttribute('#fm [data-shape="held"]', 'aria-checked')) !== 'true') throw new Error('held is not shown as chosen');
        const g = await page.getAttribute('#fm-board', 'data-grid'); if (g !== grid) throw new Error(`the board is drawn for ${g}`);
        await shot('open');
      });

      await run.do('a preset and OK send the shape; the popup closes', async () => {
        await page.click('#fm [data-shape="pairs"]'); await shot('pairs');
        await page.click('#fm-ok');
        await waitShown(page, '#fm', false);
        await wait(page, () => window.hextable.state.entities.fighter.formation?.shape === 'pairs');
      });

      await run.do('after the leader walks, the places show on the map as cells', async () => {
        await page.evaluate(() => { const h = window.hextable, S = h.state, p = S.entities.fighter.pos; for (const n of h.R.G.neighbors(p)) { const before = JSON.stringify(h.state.entities.fighter.pos); h.act({ type: 'move', actor: 'fighter', to: { ...n, z: p.z } }); if (JSON.stringify(h.state.entities.fighter.pos) !== before) return; } });
        await calm(page);
        if (!(await page.evaluate(() => Number.isInteger(window.hextable.state.entities.fighter.formation?.face)))) throw new Error('the leader has no facing after a walk');
        await rowClick(page, 'formation'); await waitShown(page, '#fm');
        await sleep(300);
        const n = await page.evaluate(() => window.hextable.R.hl?.move?.length ?? -1);
        if (n < 1) throw new Error(`no ghost cells on the map (${n})`);
        await shot('ghosts');
      });

      await run.do(touch ? 'tap a token, then a cell: OK sends the places' : 'drag a token to a cell: OK sends the places', async () => {
        const id = (await ids(page))[0];
        const cell = '#fm .fm-cell[data-back="3"][data-side="-2"]', tok = `#fm .fm-tok[data-id="${id}"]`;
        if (touch) { await page.locator(tok).tap(); await page.locator(cell).tap(); }
        else {
          const a = await center(page, tok), b = await center(page, cell);
          await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
        }
        await sleep(150);
        const at = await page.$eval(tok, (t) => [t.getAttribute('aria-label')]);
        if (!/3 behind, 2 left/.test(at[0])) throw new Error(`the token is at: ${at}`);
        await shot('moved');
        await page.click('#fm-ok'); await waitShown(page, '#fm', false);
        await wait(page, () => window.hextable.state.entities.fighter.formation?.shape === 'custom');
        const s = await slots();
        if (s[id]?.back !== 3 || s[id]?.side !== -2) throw new Error(`slot ${JSON.stringify(s[id])}`);
      });

      await run.do('Cancel sends nothing', async () => {
        const before = JSON.stringify(await state(page, (S) => S.entities.fighter.formation));
        await rowClick(page, 'formation'); await waitShown(page, '#fm');
        await page.click('#fm [data-shape="wedge"]'); await page.click('#fm-cancel'); await waitShown(page, '#fm', false);
        await sleep(200);
        if (JSON.stringify(await state(page, (S) => S.entities.fighter.formation)) !== before) throw new Error('Cancel changed the formation');
      });

      await run.do('the DM\'s marching order has the control, and in a fight neither Lead nor Formation is offered', async () => {
        const b = await page.evaluate(() => [...document.querySelectorAll('#dm-march .fm-march')].map((x) => `${x.textContent}:${x.disabled}`));
        if (!b.length) throw new Error('no formation control in the marching order');
        await page.evaluate(() => window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }));
        await calm(page);
        // In a fight the panel leaves Explore; whatever the hidden pane still holds is not on screen.
        const r = await page.$$eval('#ap-explore [data-row]', (x) => x.filter((y) => y.getClientRects().length).map((y) => y.dataset.row));
        if (r.includes('lead') || r.includes('formation')) throw new Error(`offered in a fight: ${r}`);
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  const wide = { viewport: { width: 1280, height: 800 } }, phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  await pass(browser, url, 'formation popup on hexes at 1280x800', wide, 'hex');
  await pass(browser, url, 'formation popup on hexes at 390x844 with touch', phone, 'hex');
  await pass(browser, url, 'formation popup on squares at 1280x800', wide, 'square');
  await pass(browser, url, 'formation popup on squares at 390x844 with touch', phone, 'square');
}
