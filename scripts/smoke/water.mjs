import { scenario, wait, calm, state, open, playSolo, closeMenu, openMenu, tapAt, sleep, spawnNear } from './lib.mjs';

// ---------- the DM's water and tide controls (#854, docs/specs/fly-swim-control.md E3) ----------
// As the DM, in solo: choose cells on the map by tapping, start a tide on them, see it in the list, end turns of a fight until it rises, stop it, and be told why a change is refused.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const SIZES = [['wide', { viewport: { width: 1280, height: 800 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]];
const tides = (page) => state(page, (S) => (S.tides ?? []).map((t) => ({ id: t.id, n: t.cells.length, at: t.at, to: t.to })));
const says = (page) => page.evaluate(() => { const e = document.getElementById('water-says'); return e.hidden ? '' : e.textContent; });

export default async function water(browser, url) {
  for (const [tag, opts] of SIZES) {
    await scenario(`water and tides at ${tag}`, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      try {
        const page = await ctx.newPage(); run.watch(page);
        let cells = [];
        await run.do('the Water section is on Map, sight and light, with no tide running', async () => {
          await open(page, url); await playSolo(page); await closeMenu(page); await calm(page);
          await openMenu(page, 'dm/map');
          await wait(page, () => !!document.querySelector('#dm-water:not([hidden]) #water-up'));
          if ((await tides(page)).length) throw new Error('a tide before anything was set');
          await shot(page, `water-${tag}-section`);
        });
        await run.do('a change with no cells chosen is refused in the section, and sends nothing', async () => {
          await page.click('#water-up');
          await wait(page, () => /Choose cells first/.test(document.getElementById('water-says').textContent));
        });
        await run.do('Pick on the map closes the menu, and three taps choose three hexes (a hint says so)', async () => {
          // three hexes that touch one another, on dry ground, nearest the middle of the screen (clear of the hint and the token)
          cells = await page.evaluate(() => {
            const h = window.hextable, S = h.state, l = S.map.levels[0], W = innerWidth, H = innerHeight;
            const cell = (q, r) => { const t = l.tiles[`${q},${r}`]; return t && t.t !== 'water' ? { q, r, z: l.z + (t.h ?? 0) } : null; };
            let best = null;
            for (const k of Object.keys(l.tiles)) {
              const [q, r] = k.split(',').map(Number), tri = [cell(q, r), cell(q + 1, r), cell(q, r + 1)];
              if (tri.some((c) => !c)) continue;
              const ps = tri.map((c) => h.R.screenOf(c));
              if (ps.some((p) => !p || p.x < 40 || p.x > W - 40 || p.y < 160 || p.y > H - 140)) continue;
              const d = Math.hypot(ps.reduce((a, p) => a + p.x, 0) / 3 - W / 2, ps.reduce((a, p) => a + p.y, 0) / 3 - H / 2);
              if (!best || d < best.d) best = { d, tri };
            }
            return best?.tri ?? [];
          });
          if (cells.length < 3) throw new Error(`only ${cells.length} cells beside the fighter`);
          await page.click('#water-pick');
          await wait(page, () => !document.getElementById('hint').hidden && /Water:/.test(document.getElementById('hint-text').textContent));
          await closeMenu(page); await sleep(400);
          for (const h of cells) {
            const p = await page.evaluate((c) => window.hextable.R.screenOf(c), h);
            if (!p) throw new Error(`no screen point for ${JSON.stringify(h)}`);
            await tapAt(page, touch, p.x, p.y); await sleep(250);
          }
          await shot(page, `water-${tag}-picked`);
          await openMenu(page, 'dm/map');
          await wait(page, () => /3 cells chosen/.test(document.getElementById('water-count').textContent));
        });
        await run.do('Start a tide (up 5 ft to 5 ft): one tide of 3 cells, listed with Stop; nothing moves outside a fight', async () => {
          await page.click('#water-tide');
          await wait(page, () => window.hextable.state.tides?.length === 1);
          const t = (await tides(page))[0];
          if (t.n !== 3 || t.to !== 5) throw new Error(JSON.stringify(t));
          await wait(page, () => /T1: 3 cells/.test(document.getElementById('water-tides').textContent));
          await shot(page, `water-${tag}-tide`);
        });
        await run.do('a tide that cannot reach its end is refused with the engine\'s words, shown in the section', async () => {
          await page.fill('#water-to', '0');
          await page.click('#water-tide');
          await wait(page, () => /already at/.test(document.getElementById('water-says').textContent));
          if ((await tides(page)).length !== 1) throw new Error('a refused tide was kept');
          await page.fill('#water-to', '5');
        });
        await run.do('end turns of a fight until the tide rises, and the cells become water', async () => {
          await closeMenu(page); await calm(page);
          const hero = await state(page, (S) => Object.values(S.entities).find((x) => x.side === 'party').id); await spawnNear(page, 'goblin-warrior', { near: hero, min: 3, radius: 8 });
          await page.evaluate(() => { const S = window.hextable.state, e = Object.values(S.entities).find((x) => x.side === 'party'); window.hextable.act({ type: 'startEncounter', center: e.pos }); });
          await wait(page, () => !!window.hextable.state.encounter);
          for (let i = 0; i < 40; i++) {
            if (await page.evaluate(() => window.hextable.state.tides?.[0]?.at > 0 || !window.hextable.state.tides?.length)) break;
            await calm(page);
            await page.evaluate(() => { const S = window.hextable.state, id = S.encounter?.order?.[S.encounter.turn]?.id; if (id) window.hextable.act({ type: 'endTurn', actor: id }); });
            await sleep(150);
          }
          const sf = await state(page, (S, c) => c.map((h) => S.map.levels.some((l) => l.tiles[`${h.q},${h.r}`]?.t === 'water')), cells);
          if (!sf.every(Boolean)) throw new Error(`the cells are not water: ${JSON.stringify(sf)} tides ${JSON.stringify(await tides(page))} enc ${JSON.stringify(await state(page, (S) => S.encounter && { round: S.encounter.round, turn: S.encounter.turn, order: S.encounter.order.map((o) => o.id) }))} toast ${await page.evaluate(() => document.getElementById("toast").textContent)}`);
          await calm(page); await sleep(600);
          await shot(page, `water-${tag}-risen`);
        });
        await run.do('Stop ends a tide that is still running (a new one on the same cells if it has ended)', async () => {
          await openMenu(page, 'dm/map');
          if (!(await tides(page)).length) {
            await page.fill('#water-to', '15'); await page.fill('#water-from', '5');
            await page.click('#water-tide');
            await wait(page, () => window.hextable.state.tides?.length === 1);
          }
          await page.click('#water-tides .water-stop');
          await wait(page, () => !window.hextable.state.tides?.length);
          await wait(page, () => /No tide is running/.test(document.getElementById('water-tides').textContent));
          await shot(page, `water-${tag}-stopped`);
        });
      } finally { await ctx.close(); }
    });
  }
}
