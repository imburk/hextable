import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip } from './lib.mjs';

// ---------- aiming a spell at a map object: Knock on a locked chest (issue #811, DEBT W59 (1)) ----------
// A level 5 wizard with Knock, a locked chest 3 hexes away and another beyond the spell's 60 ft. Armed, only the near chest is offered (lit on the map, listed on the sheet); a tap on it
// chooses it; on a computer a second tap on it casts, on a phone the person picks it from the list or taps it and then taps the die. The chest's state becomes closed; no page error.
async function aim(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-objectaim-${n}.png` }); };
      const view = () => page.evaluate(() => { const h = window.hextable, R = h.R, hl = (R.inner ?? R).hl; return { hint: document.getElementById('hint-text')?.textContent, die: document.getElementById('btn-menu').classList.contains('waiting'), kind: h.mode.kind, object: h.mode.object ?? null, lit: hl.range?.length ?? 0, chosen: hl.area?.length ?? 0 }; });
      const chestState = (id) => state(page, (S, i) => S.map.objects.find((o) => o.id === i)?.state, id);
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
      let ria, pos;

      await run.do('a level 5 wizard with Knock, a locked chest 3 hexes off and another 14 hexes off', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['knock'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
        await page.evaluate((p) => {
          const h = window.hextable, level = h.state.map.levels[0].id;
          h.act({ type: 'mapEdit', ops: [
            { op: 'object', object: { id: 'chest-near', def: 'chest', level, at: { q: p.q + 3, r: p.r }, state: 'locked' } },
            { op: 'object', object: { id: 'chest-far', def: 'chest', level, at: { q: p.q + 14, r: p.r }, state: 'locked' } },
          ] });
        }, pos);
        await wait(page, () => window.hextable.state.map.objects.some((o) => o.id === 'chest-near') && window.hextable.state.map.objects.some((o) => o.id === 'chest-far'));
        await closePanels(page);
        await chip(page, 'Ria');
      });

      await run.do('Knock armed: the near chest is lit and chosen from nothing yet; the far one is not offered; no die yet', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:knock"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'knock');
        await sleep(300);
        const v = await view();
        if (v.lit < 1 || v.chosen || v.die || v.object || !/Knock: tap the lit object/.test(v.hint)) throw new Error(`armed: ${JSON.stringify(v)}`);
        const listed = await page.evaluate(() => [...document.querySelectorAll('#ap-choices [data-ch="object"]')].map((b) => b.dataset.v));
        if (listed.join() !== 'chest-near') throw new Error(`the list holds ${JSON.stringify(listed)}`);
        await shot('1-armed');
      });

      if (touch) {
        await run.do('a phone: the chest is picked from the list on the sheet; the die is waiting', async () => {
          await page.click('#ap-choices [data-ch="object"][data-v="chest-near"]');
          await wait(page, () => window.hextable.mode.object === 'chest-near');
          const v = await view();
          if (!v.die || !v.chosen) throw new Error(`picked: ${JSON.stringify(v)}`);
          await shot('2-picked');
        });
      } else {
        await run.do('a tap on the far chest is not an aim; a tap on the near one chooses it and the die waits', async () => {
          await closePanels(page);       // the sheet's list is the other way to pick; here the map is tapped
          await tapHex({ q: pos.q + 14, r: pos.r });
          if ((await view()).object) throw new Error('the far chest was chosen');
          await tapHex({ q: pos.q + 3, r: pos.r });
          await wait(page, () => window.hextable.mode.object === 'chest-near');
          const v = await view();
          if (!v.die || !v.chosen || !/the chest \(locked/.test(v.hint)) throw new Error(`chosen: ${JSON.stringify(v)}`);
          await shot('2-chosen');
        });
      }

      await run.do(touch ? 'the die casts it: the chest is closed, not locked' : 'a second tap on the chest casts it: the chest is closed, not locked', async () => {
        if (!(await chestState('chest-near')) || (await chestState('chest-near')) !== 'locked') throw new Error('the chest was not locked to begin with');
        await sleep(500);
        if (touch) await page.click('#btn-menu'); else await tapHex({ q: pos.q + 3, r: pos.r });
        await wait(page, () => window.hextable.state.map.objects.find((o) => o.id === 'chest-near')?.state !== 'locked', null, 15000);
        const s = await chestState('chest-near');
        if (s !== 'closed') throw new Error(`the chest is ${s}`);
        if ((await chestState('chest-far')) !== 'locked') throw new Error('the far chest changed');
        const casts = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
        if (casts < 1) throw new Error('no cast in the timeline');
        await wait(page, () => window.hextable.mode.kind !== 'spell', null, 8000);
        await shot('3-cast');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=objectaim.
export default async function (browser, url) {
  await aim(browser, url, 'aiming a spell at an object at 1280x800', { viewport: { width: 1280, height: 800 } });
  await aim(browser, url, 'aiming a spell at an object at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
