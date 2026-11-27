import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas, closePanels, panelTab, chip, tapDie, waitDie, waitShown, choiceView } from './lib.mjs';

// ---------- Magic Circle's kinds and reverse, the circle drawn, Conjure Animals' pack moved (issue #838, DEBT W68 (1)) ----------
// A level 9 cleric with Magic Circle and Conjure Animals. Outside a fight Magic Circle is armed: the sheet offers the five kinds (one or more) and a Reverse toggle; with no kind the aimed spot does not confirm;
// with fey and undead and Reverse the die casts it, and the circle's `ward` is what was chosen. Then a fight: Conjure Animals is cast, the cleric moves, and the Move tab offers "Move the pack": one tap on it, one on the map (`moveZone`).
async function circle(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-circle-${n}.png` }); };
      const hint = () => page.evaluate(() => document.getElementById('hint-text')?.textContent ?? '');
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
      const openSheet = async () => { await page.evaluate(() => window.hextable.drawer.open('sheet')); await waitShown(page, '#ap-choices'); await sleep(400); };
      let id, pos;

      await run.do('a level 9 cleric, in the open, with Magic Circle and Conjure Animals', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Maren', class: 'cleric', level: 9, abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 17, cha: 12 }, skills: ['insight', 'religion'], spells: ['magic-circle', 'conjure-animals'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Maren'));
        id = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Maren').id);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        pos = await state(page, (S, i) => S.entities[i].pos, id);
        await closePanels(page);
        await chip(page, 'Maren');
      });

      await run.do('armed, the sheet offers the five kinds and Reverse; with no kind the aimed spot does not confirm', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:magic-circle"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'magic-circle');
        await waitShown(page, '#ap-choices');
        const kinds = await choiceView(page, 'ward'), rev = await choiceView(page, 'reverse');
        if (kinds.all.map((o) => o.v).join() !== 'celestial,elemental,fey,fiend,undead' || kinds.on) throw new Error(`kinds: ${JSON.stringify(kinds.all)}`);
        if (kinds.minH < 40 && touch) throw new Error(`a kind is too small to touch: ${kinds.minH}`);
        if (rev.all.length !== 1 || !/Reverse it \(trap them inside\)/.test(rev.all[0].label) || rev.all[0].on) throw new Error(`reverse: ${JSON.stringify(rev.all)}`);
        await shot('1-sheet');
        await closePanels(page);
        await tapHex({ q: pos.q + 2, r: pos.r });
        await sleep(400);
        const h = await hint();
        if (!/at least one kind/.test(h)) throw new Error(`hint: ${h}`);
        if (await page.evaluate(() => document.getElementById('btn-menu').classList.contains('waiting'))) throw new Error('the die waits with no kind chosen');
      });

      await run.do('fey, undead and Reverse are chosen on the sheet; the die casts it with those', async () => {
        await openSheet();
        for (const k of ['undead', 'fey']) await page.click(`#ap-choices [data-ch="ward"][data-v="${k}"]`);
        await page.click('#ap-choices [data-ch="reverse"][data-v="reverse"]');
        const m = await page.evaluate(() => ({ wards: window.hextable.mode.wards, reverse: window.hextable.mode.reverse }));
        if (m.wards.join() !== 'undead,fey' || m.reverse !== true) throw new Error(`mode: ${JSON.stringify(m)}`);
        const kinds = await choiceView(page, 'ward');
        if (kinds.all.filter((o) => o.on).map((o) => o.v).join() !== 'fey,undead') throw new Error(`checked: ${JSON.stringify(kinds.all)}`);
        await shot('2-chosen');
        await closePanels(page);
        await waitDie(page);
        await tapDie(page, touch);
        await wait(page, () => window.hextable.state.effects.some((f) => f.spell === 'magic-circle'), null, 15000);
        const ward = await state(page, (S) => S.effects.find((f) => f.spell === 'magic-circle').zone?.ward ?? null);
        if (JSON.stringify(ward) !== JSON.stringify({ types: ['fey', 'undead'], reverse: true })) throw new Error(`ward: ${JSON.stringify(ward)}`);
        if ((await page.evaluate(() => window.hextable.mode.kind)) === 'spell') throw new Error('still armed after the casting');
      });

      await run.do('the circle is drawn and named where it lies; a tap on it says so', async () => {
        const at = { q: pos.q + 2, r: pos.r };
        const names = await page.evaluate((h) => window.hextable.R.zonesAt(h), at);
        if (!names.includes('Magic Circle (fey, undead), 1 hour, reversed')) throw new Error(`zone names: ${JSON.stringify(names)}`);
        await tapHex({ q: pos.q + 1, r: pos.r });
        await sleep(500);
        await shot('3-circle');
      });

      await run.do('a fight on the cleric\'s turn; Conjure Animals is cast; there is no pack row before the cleric moves', async () => {
        await page.evaluate(() => { const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === id) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, id, 20000);
        pos = await state(page, (S, i) => S.entities[i].pos, id);
        await page.evaluate(([i, p]) => window.hextable.act({ type: 'cast', actor: i, spell: 'conjure-animals', hex: { q: p.q + 4, r: p.r }, slot: 3 }), [id, pos]);
        await wait(page, () => window.hextable.state.effects.some((f) => f.spell === 'conjure-animals'), null, 15000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        await closePanels(page);
        await chip(page, 'Maren');
        await panelTab(page, 'move');
        if (await page.$('#ap-move [data-row^="roll:"]')) throw new Error('the pack is offered before the cleric has moved');
        await panelTab(page, 'bonus');
        if (await page.$('#ap-cost [data-row^="roll:"]')) throw new Error('the pack is offered as a Bonus Action');
      });

      await run.do('the cleric moves; the Move tab offers "Move the pack"; one tap on it and one on the map moves the pack', async () => {
        // one step to a neighbour that can be stood on: the first the engine takes
        const moved = await page.evaluate(async ([i, p]) => {
          for (const [dq, dr] of [[-1, 0], [0, 1], [-1, 1], [1, -1], [0, -1], [1, 0]]) {
            const r = await window.hextable.act({ type: 'move', actor: i, to: { q: p.q + dq, r: p.r + dr } });
            await new Promise((ok) => setTimeout(ok, 700));
            const q = window.hextable.state.entities[i].pos;
            if (q.q !== p.q || q.r !== p.r) return [q.q, q.r];
          }
          return null;
        }, [id, pos]);
        if (!moved) throw new Error('the cleric could not take one step');
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        await closePanels(page);
        await chip(page, 'Maren');
        await panelTab(page, 'move');
        const fx = await state(page, (S) => S.effects.find((f) => f.spell === 'conjure-animals').id);
        const sel = `#ap-move [data-row="roll:${fx}"]`;
        await waitShown(page, sel);
        if (!/Move the pack/.test(await page.textContent(sel))) throw new Error(`row: ${await page.textContent(sel)}`);
        await shot('4-pack-row');
        await page.click(sel);
        await wait(page, () => window.hextable.mode.kind === 'roll' && window.hextable.mode.pack === true);
        if (!/new space within 30 ft/.test(await hint())) throw new Error(`hint: ${await hint()}`);
        await closePanels(page);
        const before = await state(page, (S, f) => S.effects.find((x) => x.id === f).zone.origin, fx);
        const n = await state(page, (S) => S.timeline.filter((e) => e.type === 'zoneMoved').length);
        await tapHex({ q: before.q, r: before.r + 3 });
        await wait(page, (k) => window.hextable.state.timeline.filter((e) => e.type === 'zoneMoved').length > k, n, 15000);
        const ev = await state(page, (S) => S.timeline.filter((e) => e.type === 'zoneMoved').pop());
        if (ev.fx !== fx || ev.by !== id || ev.to.r !== before.r + 3) throw new Error(`zoneMoved: ${JSON.stringify(ev)}`);
        const line = await page.evaluate((e) => window.hextable.describe(e), ev);
        if (!/moves Conjure Animals/.test(line ?? '')) throw new Error(`log line: ${line}`);
        if ((await page.evaluate(() => window.hextable.mode.kind)) === 'roll') throw new Error('still aiming the move');
        await sleep(500);
        await shot('5-pack-moved');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=circle.
export default async function (browser, url) {
  await circle(browser, url, 'Magic Circle and the pack at 1280x800', { viewport: { width: 1280, height: 800 } });
  await circle(browser, url, 'Magic Circle and the pack at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
