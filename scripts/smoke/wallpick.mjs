import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip } from './lib.mjs';

// ---------- aiming a spell at a wall: Stone Shape beside a wall (issue #823, DEBT W63 (4)) ----------
// A level 9 wizard with Stone Shape and a long wall one hex north of her. Armed, the wall is lit and listed on the sheet ("Wall ... north"); a tap far from it is not an aim; a mouse resting on it
// lights it; a tap on it chooses it; on a computer a second tap on it casts, on a phone the person picks it from the list (or taps it) and then taps the die. The wall has a gap and Ria walks through it.
async function aim(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-wallpick-${n}.png` }); };
      const view = () => page.evaluate(() => { const h = window.hextable, R = h.R, hl = (R.inner ?? R).hl; return { hint: document.getElementById('hint-text')?.textContent, die: document.getElementById('btn-menu').classList.contains('waiting'), kind: h.mode.kind, wall: h.mode.wall?.id ?? null, lit: hl.range?.length ?? 0, chosen: hl.area?.length ?? 0 }; });
      const tapHex = async (h) => {
        await page.evaluate(async (t) => {
          const G = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, w = G.toWorld(t);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, h);
        await sleep(600);
        const pt = await page.evaluate((t) => window.hextable.R.screenOf(t), h);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`hex ${JSON.stringify(h)} is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      let ria, pos, north;
      // The hexes next to Ria that lie across the wall (north of her), nearest the wall's middle first.
      const across = () => page.evaluate(async ([p]) => {
        const G = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), me = G.center(p);
        return G.range(p, 1).filter((h) => G.center(h)[1] < me[1] - 1).map((h) => ({ q: h.q, r: h.r, dx: G.center(h)[0] - me[0] })).sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
      }, [pos]);
      const where = () => state(page, (S, i) => S.entities[i].pos, ria);

      await run.do('a level 9 wizard with Stone Shape and a 60 ft wall just north of her', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 9, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['stone-shape'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
        await page.evaluate(async (p) => {
          const h = window.hextable, level = h.state.map.levels[0].id, G = (await import('./shared/grid.js')).gridOf(h.state.map), c = G.center(p);
          h.act({ type: 'mapEdit', ops: [{ op: 'wall', wall: { id: 'long-wall', kind: 'wall', level, a: [c[0] - 30, c[1] - 3], b: [c[0] + 30, c[1] - 3] } }] });
        }, pos);
        await wait(page, () => window.hextable.state.map.walls.some((w) => w.id === 'long-wall'));
        north = await across();
        if (!north.length) throw new Error('no hex across the wall');
        await closePanels(page);
        await chip(page, 'Ria');
      });

      await run.do('before the cast the wall stops her: a step north is refused and she stays', async () => {
        await page.evaluate((h) => window.hextable.act({ type: 'move', actor: window.hextable.state.entities && Object.values(window.hextable.state.entities).find((e) => e.name === 'Ria').id, to: h }), north[0]);
        await sleep(600);
        const p = await where();
        if (p.q !== pos.q || p.r !== pos.r) throw new Error(`she crossed a wall: ${JSON.stringify(p)}`);
      });

      await run.do('Stone Shape armed: the wall is lit; no wall is chosen and no die yet', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:stone-shape"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'stone-shape');
        await sleep(300);
        const v = await view();
        if (v.lit < 1 || v.chosen || v.die || v.wall || !/Stone Shape: tap the lit wall/.test(v.hint)) throw new Error(`armed: ${JSON.stringify(v)}`);
        const listed = await page.evaluate(() => [...document.querySelectorAll('#ap-choices [data-ch="wall"]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
        if (listed.length !== 1 || !/^Wall .*north/.test(listed[0])) throw new Error(`the list holds ${JSON.stringify(listed)}`);
        await shot('1-armed');
      });

      if (touch) {
        await run.do('a phone: the wall is picked from the list on the sheet; the die is waiting', async () => {
          await page.click('#ap-choices [data-ch="wall"]');
          await wait(page, () => !!window.hextable.mode.wall);
          const v = await view();
          if (!v.die || !v.chosen) throw new Error(`picked: ${JSON.stringify(v)}`);
          await shot('2-picked');
        });
      } else {
        await run.do('a tap far from the wall is not an aim; a mouse on the wall lights it; a tap chooses it and the die waits', async () => {
          await closePanels(page);       // the sheet's list is the other way to pick; here the map is tapped
          await tapHex({ q: pos.q + 6, r: pos.r + 2 });
          if ((await view()).wall) throw new Error('a far tap chose a wall');
          const hex = north[0];
          await tapHex(hex);       // centres the view on it; the first tap chooses
          await wait(page, () => !!window.hextable.mode.wall);
          const v = await view();
          if (!v.die || !v.chosen || !/Stone Shape: the north wall/.test(v.hint)) throw new Error(`chosen: ${JSON.stringify(v)}`);
          await shot('2-chosen');
        });
      }

      await run.do(touch ? 'the die casts it: the wall has a gap and Ria walks through' : 'a second tap on the wall casts it: the wall has a gap and Ria walks through', async () => {
        const before = await state(page, (S) => S.map.walls.length);
        await sleep(500);
        if (touch) await page.click('#btn-menu'); else await tapHex(north[0]);
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'cast'), null, 15000);
        await wait(page, () => window.hextable.mode.kind !== 'spell', null, 8000);
        const after = await state(page, (S) => S.map.walls.map((w) => w.id).sort().join());
        if (!(await state(page, (S) => S.map.walls.length)) || after === 'long-wall' && before === 1) throw new Error(`the wall was not cut: ${after}`);
        // the hex across that lies in the gap: one of the neighbours north of her is now reachable
        let crossed = false;
        for (const h of north) {
          await page.evaluate(([i, t]) => window.hextable.act({ type: 'move', actor: i, to: t }), [ria, h]);
          await sleep(800);
          const p = await where();
          if (p.q === h.q && p.r === h.r) { crossed = true; break; }
        }
        if (!crossed) throw new Error('Ria could not walk through the gap');
        await shot('3-cast');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=wallpick.
export default async function (browser, url) {
  await aim(browser, url, 'aiming Stone Shape at a wall at 1280x800', { viewport: { width: 1280, height: 800 } });
  await aim(browser, url, 'aiming Stone Shape at a wall at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
