
import { scenario, wait, state, waitShown, open, playSolo, closePanels } from './lib.mjs';

// ---------- reactions on the sheet ----------
// A wizard who knows Shield stands beside a goblin. Her sheet lists her reactions (and only those she has),
// Shield is set to "always" with the control, and when the goblin hits her Shield is used.
async function reactions(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let wren, foe;
      const idle = () => wait(page, () => window.hextable.waiting === 0, null, 20000);
      const openSheet = async () => {
        await closePanels(page);
        await page.click('#party button:has-text("Wren")');
        await (touch ? page.locator('#btn-sheet').tap() : page.click('#btn-sheet'));
        await waitShown(page, '#sheet');
      };

      await run.do('a level 5 wizard who knows Shield, beside a goblin', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Wren', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['shield'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Wren'));
        wren = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Wren').id);
        foe = await page.evaluate((W) => {
          const h = window.hextable, near = Object.values(h.state.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && e.actions?.length)[0];
          document.getElementById('dm-auto').checked = false;
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: W, to: { q: near.pos.q + dq, r: near.pos.r + dr } });
            const p = h.state.entities[W].pos, d = Math.max(Math.abs(p.q - near.pos.q), Math.abs(p.r - near.pos.r), Math.abs(p.q + p.r - near.pos.q - near.pos.r));
            if (d === 1) break;
          }
          return near.id;
        }, wren);
      });

      await run.do('the sheet lists her reactions and no others', async () => {
        await openSheet();
        await waitShown(page, '#sheet-reactions');
        const ids = await page.$$eval('#sheet-reactions [data-rx-set]', (els) => els.map((x) => x.dataset.rxSet));
        if (ids.join() !== 'shield') throw new Error(`reactions listed: ${ids.join() || 'none'}`);
        const now = await page.$eval('#rx-shield', (x) => x.value);
        if (now !== 'never') throw new Error(`Shield should start on never, not ${now}`);
        const box = await page.$eval('#sheet-reactions .rx select', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, innerWidth, r.height]; });
        if (box[0] < 0 || box[1] > box[2] || box[3] < 40) throw new Error(`the control does not fit or is too small to touch: ${JSON.stringify(box)}`);
      });

      await run.do('setting Shield to always sends the action and the engine keeps it', async () => {
        await page.selectOption('#rx-shield', 'always');
        await wait(page, (W) => window.hextable.state.entities[W].reactions?.shield === 'always', wren);
        await wait(page, () => document.getElementById('rx-shield')?.value === 'always');
      });

      await run.do('the goblin attacks until it hits her, and Shield is used', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[Object.keys(window.hextable.state.entities)[0]].pos }));
        await idle();
        let used = false;
        for (let i = 0; i < 12 && !used; i++) {
          for (let k = 0; k < 40; k++) {                                          // walk the order round to the goblin's turn
            const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === foe) break;
            await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
          }
          const before = await state(page, (S) => S.timeline.length);
          await page.evaluate(([f, w]) => {
            const S = window.hextable.state, def = S.entities[f].actions.find((a) => a.effects?.[0]?.attack === 'melee');
            window.hextable.act({ type: 'act', actor: f, action: def.id, target: w });
          }, [foe, wren]);
          await idle();
          used = await (page.evaluate(([n, W]) => window.hextable.state.timeline.slice(n).some((ev) => ev.type === 'reaction' && ev.id === W && ev.reaction === 'shield'), [before, wren]));
          if (!used) { await page.evaluate((f) => window.hextable.act({ type: 'endTurn', actor: f }), foe); await idle(); }
        }
        if (!used) throw new Error('the goblin never hit her, or Shield was not used');
      });

      await run.do('the sheet shows her Reaction spent', async () => {
        await openSheet();
        await wait(page, () => document.querySelector('[data-rx-status]')?.dataset.rxStatus === 'spent');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=reactions.
export default async function (browser, url) {
  await reactions(browser, url, 'reactions on the sheet at 1280x800', { viewport: { width: 1280, height: 800 } });
  await reactions(browser, url, 'reactions on the sheet at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
