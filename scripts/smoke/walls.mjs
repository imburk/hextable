import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip, tapDie } from './lib.mjs';

// ---------- a wall's direction and a rolling sphere (issue #795, DEBT W46) ----------
// A level 9 wizard in a fight. Flaming Sphere is cast, then rolled with the Bonus tab's control and one tap on the map. On a later turn Wall of Fire is armed: the first tap puts it
// down, a tap on another space names the way it runs (the preview is the engine's own cells for that direction), and the same space again casts it with `toward`.
async function walls(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-walls-${n}.png` }); };
      const hlArea = () => page.evaluate(() => [...((window.hextable.R.inner ?? window.hextable.R).hl.area ?? [])].sort());
      const view = () => page.evaluate(() => ({ hint: document.getElementById('hint-text')?.textContent, kind: window.hextable.mode.kind, toward: window.hextable.mode.toward ?? null }));
      const expected = (ria, at, toward) => page.evaluate(async ([id, a, t]) => {
        const E = await import('./shared/engine.js'), C = await import('./shared/content/index.js'), G = await import('./shared/grid.js'), S = window.hextable.state;
        return E.areaHexes(S, S.entities[id], C.SPELLS['wall-of-fire'], a, t ?? undefined).map(G.key).sort();
      }, [ria, at, toward]);
      const tapHex = async (h) => {
        await page.evaluate(async (t) => {
          const G = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, w = G.toWorld(t);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, h);
        await sleep(600);
        const pt = await page.evaluate((t) => window.hextable.R.screenOf(t), h);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`over ${await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.id + '/' + el?.className + '/' + el?.closest('[id]')?.id; }, [pt.x, pt.y])} hex ${JSON.stringify(h)} is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      const myTurn = async (ria) => {
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === ria) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, ria, 20000);
      };
      let ria, pos, fx;

      await run.do('a level 9 wizard in a fight on her turn, with Flaming Sphere out', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ria', class: 'wizard', level: 9, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['flaming-sphere', 'wall-of-fire'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria').id);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const foe = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: foe.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        await myTurn(ria);
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
        await page.evaluate(([i, p]) => window.hextable.act({ type: 'cast', actor: i, spell: 'flaming-sphere', hex: { q: p.q + 2, r: p.r } }), [ria, pos]);
        await wait(page, () => window.hextable.state.effects.some((f) => f.spell === 'flaming-sphere'), null, 15000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        fx = await state(page, (S) => S.effects.find((f) => f.spell === 'flaming-sphere').id);
        await closePanels(page);
        await chip(page, 'Ria');
      });

      await run.do('the Bonus tab has a roll control; one tap arms it, one tap on the map rolls the sphere', async () => {
        const where = () => state(page, (S, id) => { const f = S.effects.find((x) => x.id === id); return f.zone?.origin ?? null; }, fx);
        const before = await where();
        await panelTab(page, 'bonus');
        await page.click(`#ap-cost [data-row="roll:${fx}"]`);
        await wait(page, () => window.hextable.mode.kind === 'roll');
        const v = await view();
        if (!/tap the space it rolls to/.test(v.hint)) throw new Error(`hint: ${v.hint}`);
        await shot('1-roll-armed');
        const n = await state(page, (S) => S.timeline.filter((e) => e.type === 'zoneMoved').length);
        await tapHex({ q: pos.q + 5, r: pos.r });
        await wait(page, (k) => window.hextable.state.timeline.filter((e) => e.type === 'zoneMoved').length > k, n, 15000);
        if ((await view()).kind === 'roll') throw new Error('still aiming the roll');
        const after = await where();
        if (before && after && before.q === after.q && before.r === after.r) throw new Error('the sphere did not move');
        await shot('2-rolled');
      });

      await run.do('next turn: Wall of Fire is armed, the first tap places it and previews it across', async () => {
        await page.evaluate((i) => window.hextable.act({ type: 'endTurn', actor: i }), ria);
        await myTurn(ria);
        await closePanels(page);
        await chip(page, 'Ria');
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:wall-of-fire"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'wall-of-fire');
        await closePanels(page);
        await wait(page, () => window.hextable.mode.kind === 'spell');
        pos = await state(page, (S, i) => S.entities[i].pos, ria);
        const spot = { q: pos.q + 4, r: pos.r };
        await tapHex(spot);
        const got = await hlArea(), want = await expected(ria, spot, null);
        if (!got.length || JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`default preview: ${JSON.stringify([got, want])} ${JSON.stringify(await page.evaluate(() => ({ ...window.hextable.mode, hint: document.getElementById('hint-text')?.textContent })))}`);
        if (!/another space for the way/.test((await view()).hint)) throw new Error(`hint: ${(await view()).hint}`);
        await shot('3-wall-placed');
      });

      await run.do('a second tap names the way it runs: the preview is the engine\'s cells for that direction', async () => {
        const spot = { q: pos.q + 4, r: pos.r }, way = { q: spot.q, r: spot.r + 3 };
        const across = await expected(ria, spot, null);
        await tapHex(way);
        const got = await hlArea(), want = await expected(ria, spot, { q: way.q, r: way.r });
        if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`toward preview: ${JSON.stringify([got, want])}`);
        if (JSON.stringify(want) === JSON.stringify(across)) throw new Error('the direction changed nothing');
        const v = await view();
        if (!v.toward || v.toward.r !== way.r) throw new Error(`toward not kept: ${JSON.stringify(v)}`);
        await shot('4-wall-turned');
      });

      await run.do('tapping the wall\'s own spot skips the direction; naming it again and tapping it casts toward it', async () => {
        const spot = { q: pos.q + 4, r: pos.r }, way = { q: spot.q, r: spot.r + 3 };
        await tapHex(spot);
        if ((await view()).toward) throw new Error('skip kept the direction');
        const flat = await hlArea();
        if (JSON.stringify(flat) !== JSON.stringify(await expected(ria, spot, null))) throw new Error('skip did not go back to the default');
        await tapHex(way);
        await sleep(500);
        const n = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
        await tapHex(way);
        await tapDie(page, touch).catch(() => {});
        await wait(page, (k) => window.hextable.state.timeline.filter((e) => e.type === 'cast').length > k, n, 15000);
        await wait(page, () => window.hextable.state.effects.some((f) => f.spell === 'wall-of-fire'), null, 15000);
        if ((await view()).kind === 'spell') throw new Error('still armed after the casting');
        const laid = await state(page, (S) => (S.effects.find((f) => f.spell === 'wall-of-fire').zone?.hexes ?? []).map((h) => (typeof h === 'string' ? h : Array.isArray(h) ? h.slice(0, 2).join(',') : `${h.q},${h.r}`)).sort());
        const want = await expected(ria, spot, { q: way.q, r: way.r });
        if (!laid.length || JSON.stringify(laid) !== JSON.stringify(want)) throw new Error(`the wall was not laid toward the space named: ${JSON.stringify([laid, want])}`);
        await shot('5-cast');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=walls.
export default async function (browser, url) {
  await walls(browser, url, 'a wall\'s direction and a rolling sphere at 1280x800', { viewport: { width: 1280, height: 800 } });
  await walls(browser, url, 'a wall\'s direction and a rolling sphere at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
