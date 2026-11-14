import { join } from 'node:path';
import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab } from './lib.mjs';

// ---------- the reaction question ----------
// A DM, a phone player (Wren, a wizard who knows Shield) and a second player who watches. Wren's Shield is set to
// "ask" on her own sheet; a goblin attacks her until a hit reaches the question. The phone is asked, the other
// player is told only that the table waits, the DM sees the question; an answer the engine refuses is shown;
// the phone answers Shield, and later the DM answers for the phone.
async function prompt(browser, url) {
  await scenario('reaction question: a phone is asked, another player waits, the DM answers for the phone', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const watchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage(), watch = await watchCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)'); run.watch(watch, ' (watcher)');
      let code, wren, foe;
      const idle = (p) => wait(p, () => window.hextable.waiting === 0, null, 20000);
      const join = async (page, nm) => {
        await open(page, url);
        await page.fill('#lobby-name', nm); await page.fill('#lobby-code', code); await page.click('#lobby-join');
        await wait(page, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(page, '#lobby', false);
        await wait(page, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
      };

      await run.do('host a table; a phone and a second player join', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await join(phone, 'Phone Player'); await join(watch, 'Watching Player');
      });

      await run.do('the DM adds Wren (Shield), the phone plays her, a goblin stands beside her', async () => {
        await host.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          h.act({ type: 'addCharacter', record: D.derive({ name: 'Wren', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['shield'] }).record, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Wren'));
        wren = await state(host, (S) => Object.values(S.entities).find((e) => e.name === 'Wren').id);
        await phone.locator('#party button:has-text("Play as Wren")').tap();
        await wait(host, (W) => !!window.hextable.state.entities[W].owner, wren);
        foe = await host.evaluate((W) => {
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

      await run.do("the phone sets Wren's Shield to ask on her sheet", async () => {
        await phone.click('#party button:has-text("Wren")');
        await phone.locator('#btn-sheet').tap();
        await waitShown(phone, '#sheet-reactions');
        await phone.selectOption('#rx-shield', 'ask');
        await wait(phone, (W) => window.hextable.state.reactions?.[W]?.shield === 'ask', wren);
        await wait(host, (W) => window.hextable.state.entities[W].reactions?.shield === 'ask', wren);
        await closeMenu(phone);
      });

      // Walk the order to the goblin and have it attack Wren until a hit reaches the question.
      const provoke = async () => {
        await host.evaluate(() => { const h = window.hextable; if (!h.state.encounter) h.act({ type: 'startEncounter', center: h.state.entities[Object.keys(h.state.entities)[0]].pos }); });
        await idle(host);
        for (let i = 0; i < 16; i++) {
          for (let k = 0; k < 40; k++) {
            const cur = await state(host, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === foe) break;
            await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(host);
          }
          await host.evaluate(([f, w]) => {
            const S = window.hextable.state, def = S.entities[f].actions.find((a) => a.effects?.[0]?.attack === 'melee');
            window.hextable.act({ type: 'act', actor: f, action: def.id, target: w });
          }, [foe, wren]);
          await idle(host);
          if (await state(host, (S) => !!S.pending)) return;
          await host.evaluate((f) => window.hextable.act({ type: 'endTurn', actor: f }), foe); await idle(host);
        }
        throw new Error('the goblin never hit Wren, so no question was asked');
      };

      await run.do('a hit asks the phone: the question is on screen, big enough to touch and fits 390x844', async () => {
        await provoke();
        await waitShown(phone, '#rp .rp-card');
        const txt = await phone.$eval('#rp', (e) => e.innerText);
        if (!/Shield/.test(txt) || !/spell slot/i.test(txt) || !/Reaction/.test(txt)) throw new Error(`the prompt does not say what it is or costs: ${txt}`);
        const box = await phone.$eval('#rp .rp-card', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[4] || box[2] < 0 || box[3] > box[5]) throw new Error(`the prompt does not fit the phone: ${JSON.stringify(box)}`);
        const btn = await phone.$$eval('#rp button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
        if (btn.some((h) => h < 44)) throw new Error(`a button is too small to touch: ${btn}`);
        if (process.env.SMOKE_SHOTS) await phone.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-phone.png` });
      });

      await run.do('the other player is told only that the table waits; the DM sees the question', async () => {
        await waitShown(watch, '#rp-wait');
        const got = await state(watch, (S) => JSON.stringify(S.prompt));
        if (got !== '{"waiting":true}') throw new Error(`the other player was sent more than waiting: ${got}`);
        if (await shown(watch, '#rp')) throw new Error('the other player was shown the question');
        const t = await watch.$eval('#rp-wait', (e) => e.textContent);
        if (/Wren|Shield|goblin/i.test(t)) throw new Error(`the waiting notice names something: ${t}`);
        await waitShown(host, '#rp .rp-card');
        if (!/Wren can use a reaction/.test(await host.$eval('#rp', (e) => e.innerText))) throw new Error('the DM is not shown who is asked');
        if (await shown(host, '#rp-wait')) throw new Error('the DM was shown the waiting notice as well');
        if (process.env.SMOKE_SHOTS) { await host.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-dm.png` }); await watch.screenshot({ path: `${process.env.SMOKE_SHOTS}/prompt-waiting.png` }); }
      });

      await run.do('the question is not dismissed by a tap outside it or Escape; a refused answer shows the engine\'s words', async () => {
        await phone.touchscreen.tap(4, 4);
        await phone.keyboard.press('Escape');
        await sleep(200);
        if (!(await shown(phone, '#rp .rp-card'))) throw new Error('the prompt went away without an answer');
        await phone.evaluate(() => window.hextable.act({ type: 'react', prompt: 999, take: null }));
        await wait(phone, () => document.querySelector('#rp-err') && !document.querySelector('#rp-err').hidden && document.querySelector('#rp-err').textContent.length > 5);
        if (!(await shown(phone, '#rp .rp-card'))) throw new Error('a refused answer closed the prompt');
      });

      await run.do('the phone answers Shield, and Shield is used', async () => {
        await sleep(700);
        const slots0 = await state(host, (S, W) => JSON.stringify(S.entities[W].slots), wren);
        await phone.locator('#rp .rp-take').tap();
        await waitShown(phone, '#rp', false);
        await wait(host, () => !window.hextable.state.pending);
        await wait(watch, () => document.querySelector('#rp-wait').hidden);
        const now = await state(host, (S, W) => ({ used: S.entities[W].reactionUsed, slots: JSON.stringify(S.entities[W].slots) }), wren);
        if (!now.used || now.slots === slots0) throw new Error(`Shield was not used after the phone answered: ${JSON.stringify(now)} (slots were ${slots0})`);
      });

      await run.do('asked again, the DM answers for the phone and the phone is released', async () => {
        // The next time Wren's turn comes round her Reaction is back.
        for (let k = 0; k < 40; k++) {
          const cur = await state(host, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === wren) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(host);
        }
        await provoke();
        await waitShown(phone, '#rp .rp-card');
        await sleep(700);
        await host.locator('#rp .rp-no').click();
        await waitShown(phone, '#rp', false);
        await wait(host, () => !window.hextable.state.pending);
        if (await state(host, (S, W) => S.entities[W].reactionUsed, wren)) throw new Error('the DM declined but a reaction was used');
      });
    } finally { await watchCtx.close(); await phoneCtx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=prompt.
export default async function (browser, url) {
  await prompt(browser, url);
}
