import { scenario, wait, state, shown, waitShown, open, playSolo, closePanels, panelTab, chip, placeBeside, tapDie, waitDie } from './lib.mjs';

// ---------- a swap (Wild Resurgence) and Stabilize for a dying ally (#781, DEBT W41) ----------
// A level 5 druid swaps a Wild Shape use for a level 1 slot from the chooser (the other swap is greyed and says why; tapping Swap on it sends nothing), and a level 5 fighter at 0 Hit Points
// is stabilized outside a fight: the row is greyed out of reach, then live beside the druid, and a tap sends the engine's check. At 1280x800 and at 390x844 with touch.
async function pass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel, force = false) => (touch ? page.locator(sel).tap({ timeout: 6000, force }) : page.click(sel, { timeout: 6000, force })).catch((err) => { throw new Error(`tap ${sel}: ${err.message.split('\\n').slice(0, 6).join(' | ')}`); });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const ids = {}, A = { str: 14, dex: 12, con: 14, int: 10, wis: 16, cha: 10 };
      const sheets = [
        { at: { q: -3, r: 4, z: 0 }, sheet: { name: 'Dru', class: 'druid', level: 5, subclass: 'land', abilities: A, skills: ['nature', 'perception'], choices: {}, spells: [] } },
        { at: { q: 3, r: 4, z: 0 }, sheet: { name: 'Tor', class: 'fighter', level: 5, subclass: 'champion', abilities: A, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: ['longsword'], spells: [] } },
      ];
      const pick = async (n) => { await closePanels(page); await chip(page, n); await wait(page, (i) => window.hextable.state.entities[i] && !document.querySelector('#card').hidden, ids[n]); };

      await run.do('a level 5 druid and a level 5 fighter join the party', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async (list) => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          for (const { sheet, at } of list) { const r = D.derive(sheet); if (!r.record) throw new Error(JSON.stringify(D.validate(sheet))); h.act({ type: 'addCharacter', record: r.record, at }); }
        }, sheets);
        for (const { sheet } of sheets) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), sheet.name); ids[sheet.name] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, sheet.name); }
      });

      await run.do('Wild Resurgence opens a chooser of its two swaps; the one that cannot be made is greyed and says why, and Swap on it sends nothing', async () => {
        await pick('Dru'); await panelTab(page, 'features');
        const rows = await page.$$eval('#ap-features [data-row]', (r) => r.map((x) => x.dataset.row));
        if (!rows.includes('feat:wild-resurgence')) throw new Error(`Features has no Wild Resurgence row: ${rows}`);
        await tap(page, '#ap-features [data-row="feat:wild-resurgence"]');
        await waitShown(page, '#cp .cp-card');
        const swaps = await page.$$eval('#cp-swaps [data-swap]', (b) => b.map((x) => [x.dataset.swap, x.getAttribute('aria-disabled'), x.textContent]));
        if (swaps.map((s) => s[0]).join() !== 'slot-for-shape,shape-for-slot') throw new Error(`swaps: ${JSON.stringify(swaps)}`);
        if (swaps[0][1] !== 'true' || !/still has uses of Wild Shape/.test(swaps[0][2])) throw new Error(`the first swap should be greyed with its reason: ${JSON.stringify(swaps[0])}`);
        if (swaps[1][1] === 'true') throw new Error(`the second swap should be open: ${JSON.stringify(swaps[1])}`);
        const box = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[3] || box[2] > box[4]) throw new Error(`the panel does not fit: ${JSON.stringify(box)}`);
        if (await page.$$eval('#cp-swaps button', (b) => b.some((x) => x.getBoundingClientRect().height < 40))) throw new Error('a swap button is too small to touch');
        const before = await state(page, (S, i) => JSON.stringify([S.entities[i].uses, S.entities[i].slots]), ids.Dru);
        await tap(page, '#cp-swaps [data-swap="slot-for-shape"]', true);      // greyed (aria-disabled), still tapped to read why
        await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        if (!/still has uses of Wild Shape/.test(await page.$eval('#cp-err', (x) => x.textContent))) throw new Error('the reason is not in the panel');
        if (before !== await state(page, (S, i) => JSON.stringify([S.entities[i].uses, S.entities[i].slots]), ids.Dru)) throw new Error('a greyed swap changed the druid');
      });

      await run.do('the open swap gives a Wild Shape use for a level 1 slot, with no action spent', async () => {
        const was = await state(page, (S, i) => ({ ws: S.entities[i].uses['wild-shape'], wr: S.entities[i].uses['wild-resurgence'], s1: S.entities[i].slots[1] }), ids.Dru);
        await tap(page, '#cp-swaps [data-swap="shape-for-slot"]');
        await tap(page, '#cp-use');
        await wait(page, ([i, w]) => window.hextable.state.entities[i].slots[1] === w + 1, [ids.Dru, was.s1]);
        const now = await state(page, (S, i) => ({ ws: S.entities[i].uses['wild-shape'], wr: S.entities[i].uses['wild-resurgence'] }), ids.Dru);
        if (now.ws !== was.ws - 1 || now.wr !== was.wr - 1) throw new Error(`uses: ${JSON.stringify(was)} -> ${JSON.stringify(now)}`);
        await waitShown(page, '#cp', false);
        // Spent for the day: the row now says why on the Features list.
        await panelTab(page, 'features');
        if (!/no uses of Wild Resurgence left|Long Rest/.test(await page.$eval('#ap-features [data-row]:has-text("Wild Resurgence")', (x) => x.textContent))) throw new Error('the row does not say why it is greyed');
      });

      await run.do('Heal lists Stabilize for a dying friend: greyed out of reach with the reason, live beside the druid', async () => {
        await page.evaluate((t) => window.hextable.act({ type: 'setHp', actor: t, hp: 0 }), ids.Tor);
        await wait(page, (t) => window.hextable.state.entities[t].hp === 0, ids.Tor);
        await pick('Dru'); await panelTab(page, 'heal');
        const row = '#ap-heal [data-row="stabilize:' + ids.Tor + '"]';
        await waitShown(page, row);
        if (await page.$eval('#ap-heal [data-row]', (r) => r.dataset.row) !== `stabilize:${ids.Tor}`) throw new Error('Stabilize is not first in Heal');
        if (!/out of reach/.test(await page.$eval(row, (x) => x.textContent)) || await page.$eval(row, (x) => x.getAttribute('aria-disabled')) !== 'true') throw new Error('the row is not greyed with the reason');
        await placeBeside(page, ids.Tor, ids.Dru);
        await pick('Dru'); await panelTab(page, 'heal');
        await wait(page, (s) => document.querySelector(s)?.getAttribute('aria-disabled') === 'false', row);
        const tl = await state(page, (S) => S.timeline.length);
        await tap(page, row);
        for (let k = 0; k < 40; k++) {
          const done = await state(page, (S, n) => S.timeline.slice(n).some((e) => e.type === 'check' && e.stabilize), tl);
          if (done) break;
          if (await page.evaluate(() => document.getElementById('btn-menu').classList.contains('waiting'))) await tapDie(page, touch);
          else await page.waitForTimeout(250);
        }
        if (!(await state(page, (S, n) => S.timeline.slice(n).some((e) => e.type === 'check' && e.stabilize), tl))) throw new Error('the engine did not run the Medicine check');
        const ev = await state(page, (S, n) => S.timeline.slice(n).find((e) => e.type === 'check' && e.stabilize), tl);
        if (ev.skill !== 'medicine' || ev.dc !== 10) throw new Error(`check: ${JSON.stringify(ev)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=swapstab.
export default async function (browser, url) {
  await pass(browser, url, 'swap and stabilize at 1280x800', { viewport: { width: 1280, height: 800 } });
  await pass(browser, url, 'swap and stabilize at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
