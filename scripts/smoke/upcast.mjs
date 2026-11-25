import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip, tapDie } from './lib.mjs';

// ---------- casting at a higher level: the slot menu (issue #604) ----------
// A level 3 wizard (one level 1 slot, two level 2) with Magic Missile. Armed, the hint bar offers the level (the default is level 1; level 2 adds a dart);
// at level 2 it throws four darts and spends a level 2 slot. With the level 1 slot spent the default is level 2.
async function upcast(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const casts = () => state(page, (S) => S.timeline.filter((e) => e.type === 'cast' && e.name === 'Magic Missile').length);
      const view = () => page.evaluate(() => {
        const sel = document.getElementById('hint-slot'), r = sel.getBoundingClientRect();
        return { shown: !sel.hidden && sel.getClientRects().length > 0, value: sel.value, options: [...sel.options].map((o) => o.value), h: r.height, hint: document.getElementById('hint-text').textContent, note: document.getElementById('aim-note').textContent, picked: (window.hextable.mode.picked ?? []).length };
      });
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-upcast-${n}.png` }); };
      const tapFoe = async (id) => {
        await page.evaluate(async (i) => {
          const S = window.hextable.state, G = (await import('./shared/grid.js')).gridOf(S.map), R = window.hextable.R, w = G.toWorld(S.entities[i].pos);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, id);
        await sleep(600);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), id);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`the foe is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      const arm = async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:magic-missile"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'magic-missile');
      };
      let ria, foe;

      await run.do('a level 3 wizard in a fight on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 3, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['magic-missile'] }).record;
          rec.slots = { 1: 1, 2: 2 };       // one level 1 slot and two level 2: the rounds below spend them in turn
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos, radius: 14 }); });
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
        await chip(page, 'Ria');
        foe = await page.evaluate(async (i) => {
          const E = await import('./shared/engine.js'), S = window.hextable.state;
          return E.targetsFor(S, S.entities[i], { spell: 'magic-missile' }).find((id) => E.hostile(S.entities[id], S.entities[i])) ?? null;
        }, ria);
        if (!foe) throw new Error('no foe Magic Missile can reach');
      });

      await run.do('armed: the slot menu offers level 1 and 2, level 1 is chosen, and it is a thumb-sized control on touch', async () => {
        await arm();
        const v = await view();
        if (!v.shown || v.value !== '1' || v.options.join() !== '1,2' || !/of 3|up to 3/.test(v.hint)) throw new Error(`menu: ${JSON.stringify(v)}`);
        if (touch && v.h < 44) throw new Error(`the menu is ${v.h}px high on touch`);
        await shot('1-menu');
      });

      await run.do('level 2 chosen: the hint now asks for four darts, and a tap keeps the choice', async () => {
        await page.selectOption('#hint-slot', '2');
        await wait(page, () => /up to 4/.test(document.getElementById('hint-text').textContent));
        await tapFoe(foe);
        const v = await view();
        if (v.value !== '2' || v.picked !== 1 || !/^1 of 4 targets$/.test(v.note)) throw new Error(`after a tap: ${JSON.stringify(v)}`);
        await shot('2-level-2');
      });

      await run.do('four darts at level 2 spend a level 2 slot and no level 1 slot', async () => {
        const before = await state(page, (S, i) => ({ ...S.entities[i].slots }), ria);
        for (let n = 1; n < 4; n++) { await tapFoe(foe); await sleep(150); }
        if ((await casts()) !== 0) throw new Error('the fourth dart was sent before the die');
        await tapDie(page, touch);
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'cast' && e.name === 'Magic Missile'), null, 15000);
        const ev = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast' && e.name === 'Magic Missile').pop());
        const after = await state(page, (S, i) => ({ ...S.entities[i].slots }), ria);
        if (ev.targets?.length !== 4 || after[2] !== before[2] - 1 || after[1] !== before[1]) throw new Error(`cast: ${JSON.stringify({ ev, before, after })}`);
      });

      // Round after round: end the turn and come round to Ria again, then find a foe she can still reach.
      const nextTurn = async () => {
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 40; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === ria && i > 0) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, ria, 20000);
        await chip(page, 'Ria');
        foe = await page.evaluate(async (i) => {
          const E = await import('./shared/engine.js'), S = window.hextable.state;
          return E.targetsFor(S, S.entities[i], { spell: 'magic-missile' }).find((id) => E.hostile(S.entities[id], S.entities[i])) ?? null;
        }, ria);
        if (!foe) throw new Error('no foe Magic Missile can reach');
      };
      const fire = async (n) => {
        const count = () => state(page, (S) => S.timeline.filter((e) => e.type === 'cast' && e.name === 'Magic Missile').length);
        const k = await count();
        for (let i = 0; i < n; i++) { await tapFoe(foe); await sleep(150); }
        await tapDie(page, touch);
        await wait(page, (c) => window.hextable.state.timeline.filter((e) => e.type === 'cast' && e.name === 'Magic Missile').length > c, k, 15000);
      };

      await run.do('next turn: one level 1 slot and one level 2 left, the default is level 1, and three darts spend it', async () => {
        await nextTurn();
        await arm();
        const v = await view();
        if (!v.shown || v.value !== '1' || !/up to 3/.test(v.hint)) throw new Error(`menu: ${JSON.stringify(v)}`);
        await fire(3);
        const s = await state(page, (S, i) => ({ ...S.entities[i].slots }), ria);
        if (s[1] !== 0 || s[2] !== 1) throw new Error(`slots ${JSON.stringify(s)}`);
      });

      await run.do('with every level 1 slot spent the default is level 2: four darts, a level 2 slot, and no choice left to make', async () => {
        await nextTurn();
        await arm();
        const v = await view();
        if (v.shown || !/up to 4/.test(v.hint)) throw new Error(`default with level 1 spent: ${JSON.stringify(v)}`);
        await shot('3-level-1-spent');
        await fire(4);
        const s = await state(page, (S, i) => ({ ...S.entities[i].slots }), ria);
        const ev = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast' && e.name === 'Magic Missile').pop());
        if (s[2] !== 0 || ev.targets?.length !== 4) throw new Error(`slots ${JSON.stringify(s)}, targets ${ev.targets?.length}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=upcast.
export default async function (browser, url) {
  await upcast(browser, url, 'casting at a higher level at 1280x800', { viewport: { width: 1280, height: 800 } });
  await upcast(browser, url, 'casting at a higher level at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
