import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip } from './lib.mjs';

// ---------- aiming the space of a teleport: Misty Step (issue #912, DEBT T115 (1)) ----------
// A level 5 wizard with Misty Step. Armed, the spaces the engine would take are lit and the hint asks for one; a tap on a space it refuses (beyond 30 ft) shows its words and keeps the aim;
// a tap on a lit space marks it and the die waits; the die sends one cast and the caster lands on the space tapped. No page error.
async function aim(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-destaim-${n}.png` }); };
      const view = () => page.evaluate(() => { const h = window.hextable, R = h.R, hl = (R.inner ?? R).hl; return { hint: document.getElementById('hint-text')?.textContent, die: document.getElementById('btn-menu').classList.contains('waiting'), kind: h.mode.kind, dest: h.mode.dest ?? null, lit: hl.range?.length ?? 0, marked: hl.area?.length ?? 0 }; });
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
      let ria, pos, near, far;

      await run.do('a level 5 wizard with Misty Step on open ground', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['misty-step'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
        // a space 3 hexes off that the engine takes (found by asking it, as the aim does) and one 12 hexes off, beyond 30 ft
        const picked = await page.evaluate(async ([id]) => {
          const h = window.hextable, S = h.state, e = S.entities[id], G = (await import('./shared/grid.js')).gridOf(S.map), sp = await import('./shared/engine.js');
          const ok = (t) => sp.apply(structuredClone(S), { type: 'cast', actor: id, spell: 'misty-step', hex: t }, { role: 'dm' }).ok;
          const ring = (n) => G.range(e.pos, n).filter((t) => G.dist(t, e.pos) === n);
          return { near: ring(3).find(ok) ?? null, far: ring(12).find((t) => S.map.levels[0].tiles[`${t.q},${t.r}`]) ?? null };
        }, [ria]);
        near = picked.near; far = picked.far;
        if (!near) throw new Error('no space 3 hexes from Ria that the engine takes');
        await closePanels(page);
        await chip(page, 'Ria');
      });

      await run.do('Misty Step armed: spaces are lit, the hint asks where, no die yet', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:misty-step"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'misty-step');
        await sleep(300);
        const v = await view();
        if (v.lit < 6 || v.die || v.dest || !/Misty Step: tap where you go, up to 30 ft/.test(v.hint)) throw new Error(`armed: ${JSON.stringify(v)}`);
        await shot('1-armed');
      });

      await run.do('a tap beyond 30 ft shows the engine\'s words and keeps the aim', async () => {
        await closePanels(page);
        if (far) {
          await tapHex(far);
          const t = await page.evaluate(() => document.getElementById('toast')?.textContent ?? document.body.innerText.match(/reaches 30 ft[^\n]*/)?.[0] ?? '');
          const v = await view();
          if (v.kind !== 'spell' || v.dest || v.die) throw new Error(`a far tap changed the aim: ${JSON.stringify(v)}`);
          if (!/30 ft|away|stand/.test(t)) throw new Error(`no refusal shown: ${JSON.stringify(t)}`);
        }
        await shot('2-refused');
      });

      await run.do('a tap on a lit space marks it and the die waits', async () => {
        await tapHex(near);
        await wait(page, () => !!window.hextable.mode.dest);
        const v = await view();
        if (!v.die || v.marked !== 1 || !/tap the die/.test(v.hint)) throw new Error(`marked: ${JSON.stringify(v)}`);
        await shot('3-marked');
      });

      await run.do(touch ? 'the die casts it: Ria stands on the space tapped' : 'a second tap on the space casts it: Ria stands on the space tapped', async () => {
        await sleep(500);
        if (touch) await page.click('#btn-menu'); else await tapHex(near);
        await wait(page, ([id, n]) => { const p = window.hextable.state.entities[id].pos; return p.q === n.q && p.r === n.r; }, [ria, near], 15000);
        const casts = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
        if (casts < 1) throw new Error('no cast in the timeline');
        await wait(page, () => window.hextable.mode.kind !== 'spell', null, 8000);
        await shot('4-landed');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=destaim.
export default async function (browser, url) {
  await aim(browser, url, 'aiming the space of a teleport at 1280x800', { viewport: { width: 1280, height: 800 } });
  await aim(browser, url, 'aiming the space of a teleport at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
