import { sleep, scenario, wait, state, open, playSolo, settle, tapAt, onCanvas, closePanels, panelTab } from './lib.mjs';

// ---------- aiming an area: the reach on the map, the preview, the same-spot tap (issue #600) ----------
// A level 5 wizard with Web (a cube aimed at a spot within 60 ft) and Fireball. Armed, the edge of the reach is drawn (the renderer's highlights hold it);
// a spot within it shows the area and can be cast (hover on a mouse; on touch the first tap shows it and a second tap on the same spot casts); a spot
// beyond it shows the area dimmed (areaBad), says how far it is, and has no Cast button, and tapping it twice sends nothing.
async function aim(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const hl = () => page.evaluate(() => { const R = window.hextable.R, h = (R.inner ?? R).hl; return { range: h.range?.length ?? 0, area: h.area?.length ?? 0, bad: !!h.areaBad }; });
      const view = () => page.evaluate(() => ({ hint: document.getElementById('hint-text')?.textContent, go: !document.getElementById('hint-go').hidden, aim: window.hextable.mode.aim, pinned: !!window.hextable.mode.pinned, kind: window.hextable.mode.kind }));
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-range-${n}.png` }); };
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
      const arm = async (id) => {
        await panelTab(page, 'spells');
        await page.click(`#ap-spells [data-row="spell:${id}"]`);
        await wait(page, (i) => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === i, id);
      };
      const casts = () => state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
      let ria, pos;

      await run.do('a level 5 wizard in a fight on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['fireball', 'web'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const foe = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: foe.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === ria) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, ria, 20000);
        await closePanels(page);
        await page.click('#party button:has-text("Ria")');
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
      });

      await run.do('Web armed: the edge of the 60 ft reach is drawn before any aim, and there is no Cast', async () => {
        await arm('web');
        await sleep(200);
        const h = await hl(), v = await view();
        if (h.range < 6) throw new Error(`no reach drawn: ${JSON.stringify(h)}`);
        if (h.area || h.bad || v.go || v.aim) throw new Error(`area or Cast before an aim: ${JSON.stringify([h, v])}`);
      });

      await run.do('a spot in reach: the area shows, it is not red; the first tap puts it there and shows Cast', async () => {
        const near = { q: pos.q + 4, r: pos.r };
        await page.evaluate((n) => window.hextable.R.onHover(n), near);       // a mouse hovers; on touch nothing does, so the tap below is the preview
        if (!touch) { await sleep(150); const h = await hl(); if (!h.area || h.bad) throw new Error(`hover showed no clean area: ${JSON.stringify(h)}`); }
        await tapHex(near);
        const h = await hl(), v = await view();
        if (!h.area || h.bad || h.range < 6 || !v.go || !v.pinned) throw new Error(`after the tap: ${JSON.stringify([h, v])}`);
        await shot('1-in-reach');
      });

      await run.do('a spot beyond the reach: the area is dimmed and the hint says how far; no Cast; two taps send nothing', async () => {
        const far = { q: pos.q + 14, r: pos.r };
        await page.evaluate((f) => window.hextable.R.onHover(f), far);
        await tapHex(far);
        const h = await hl(), v = await view();
        if (!h.bad || v.go || !/ft away, and it reaches 60 ft/.test(v.hint)) throw new Error(`out of reach: ${JSON.stringify([h, v])}`);
        const n = await casts();
        await sleep(500); await tapHex(far); await sleep(400);
        if ((await casts()) !== n || (await view()).kind !== 'spell') throw new Error('a spot out of reach was cast at');
        await shot('2-out-of-reach');
      });

      await run.do('back in reach it is not red again; a second tap on the same spot casts', async () => {
        const near = { q: pos.q + 3, r: pos.r };
        await tapHex(near);
        const back = await hl(), v = await view();
        if (back.bad || !v.go) throw new Error(`moving the aim back in reach: ${JSON.stringify([back, v])}`);
        const n = await casts();
        await sleep(500);
        await tapHex(near);
        await wait(page, (k) => window.hextable.state.timeline.filter((e) => e.type === 'cast').length > k, n, 15000);
        if ((await view()).kind === 'spell') throw new Error('still armed after the casting');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=aimrange.
export default async function (browser, url) {
  await aim(browser, url, 'aiming range and area at 1280x800', { viewport: { width: 1280, height: 800 } });
  await aim(browser, url, 'aiming range and area at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
