
import { scenario, wait, state, waitShown, open, playSolo, closePanels, placeBeside, menuStill, chip, openMenu } from './lib.mjs';

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
        await chip(page, 'Wren');
        await openMenu(page, 'sheet');
        await waitShown(page, '#sheet');
        await menuStill(page);
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
        foe = await page.evaluate(() => {
          const h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          return Object.values(h.state.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && e.actions?.length)[0].id;
        });
        await placeBeside(page, wren, foe);
      });

      await run.do('the sheet lists her reactions and no others (the Opportunity Attack, for her Unarmed Strike, and Shield)', async () => {
        await openSheet();
        await waitShown(page, '#sheet-reactions');
        const ids = await page.$$eval('#sheet-reactions [data-rx-set]', (els) => els.map((x) => x.dataset.rxSet));
        if (ids.join() !== 'opportunity-attack,shield') throw new Error(`reactions listed: ${ids.join() || 'none'}`);
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
      // M2 (Decision 2, one overlay at a time): a question that comes while the menu is open folds it; after the answer the screen is clean; one tap on the die returns to the same screen.
      await run.do('a reaction question with the menu open folds the menu, and after the answer the screen is clean until the die is tapped', async () => {
        await openSheet();
        await page.selectOption('#rx-shield', 'ask');
        await wait(page, (W) => window.hextable.state.entities[W].reactions?.shield === 'ask', wren);
        await page.evaluate((W) => window.hextable.act({ type: 'claim', entity: W, user: 'smoke-player', userName: 'Smoke player' }), wren);      // a creature nobody plays is the DM's: the engine does not ask for it
        await wait(page, (W) => !!window.hextable.state.entities[W].owner, wren);
        const before = await page.evaluate(() => ({ path: document.getElementById('drawer').dataset.path, open: window.hextable.drawer.isOpen }));
        if (!before.open || before.path.split('/')[0] !== 'sheet') throw new Error(`the menu is not open on the sheet before the question: ${JSON.stringify(before)}`);
        let asked = false;
        for (let i = 0; i < 16 && !asked; i++) {
          for (let k = 0; k < 40; k++) {                                          // walk the order round to the goblin's turn (Wren's turn gives her Reaction back)
            const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === foe) break;
            await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
          }
          await page.evaluate(([f, w]) => {
            const S = window.hextable.state, def = S.entities[f].actions.find((a) => a.effects?.[0]?.attack === 'melee');
            window.hextable.act({ type: 'act', actor: f, action: def.id, target: w });
          }, [foe, wren]);
          await idle();
          asked = await state(page, (S) => !!S.pending);
          if (!asked) { await page.evaluate((f) => window.hextable.act({ type: 'endTurn', actor: f }), foe); await idle(); }
        }
        if (!asked) throw new Error('the goblin never hit her, so no question was asked');
        await waitShown(page, '#rp .rp-card');
        const seen = () => page.evaluate(() => { const d = document.getElementById('drawer'); return { open: window.hextable.drawer.isOpen, cls: document.body.classList.contains('drawer-open'), drawer: !d.hidden && d.getClientRects().length > 0, scrim: !document.getElementById('drawer-scrim').hidden, rp: !document.getElementById('rp').hidden }; });
        const up = await seen();
        if (!up.rp || up.open || up.cls || up.drawer || up.scrim) throw new Error(`the menu did not fold under the question: ${JSON.stringify(up)}`);
        await page.waitForTimeout(800);                                           // a tap in the first 600 ms is taken for one meant for the map and answers nothing (reactionprompt.js ARM_MS)
        if (touch) await page.locator('#rp .rp-no').tap(); else await page.locator('#rp .rp-no').click();
        await waitShown(page, '#rp', false);
        await idle();
        await page.waitForTimeout(700);                                           // the menu must not come back by itself
        const clean = await seen();
        if (clean.rp || clean.open || clean.cls || clean.drawer || clean.scrim) throw new Error(`the screen is not clean after the answer: ${JSON.stringify(clean)}`);
        if (touch) await page.locator('#btn-menu').tap(); else await page.locator('#btn-menu').click();
        await waitShown(page, '#drawer');
        await menuStill(page);
        const back = await page.evaluate(() => ({ path: document.getElementById('drawer').dataset.path, arc: window.hextable.drawer.arc }));
        if (back.arc || back.path.split('/')[0] !== 'sheet') throw new Error(`one tap on the die did not return to the same screen: ${JSON.stringify(back)} (was ${before.path})`);
        await waitShown(page, '#sheet');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=reactions.
export default async function (browser, url) {
  await reactions(browser, url, 'reactions on the sheet at 1280x800', { viewport: { width: 1280, height: 800 } });
  await reactions(browser, url, 'reactions on the sheet at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
