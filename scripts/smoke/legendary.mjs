import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab } from './lib.mjs';

// ---------- legendary actions: the DM's screen (docs/specs/legendary.md, stage L4a) ----------
// A DM and a player at a table with an adult green dragon, "Verdigris", in a fight. After a turn the table waits for the dragon's windows: the DM plays them
// with one tap each and answers a Legendary Resistance question with one tap; the player sees the events and "Waiting for the DM", nothing else.
// Run twice: the DM on a wide screen with the player on a phone, then the other way round (the phone as DM, with touch).
const WIDE = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const shot = async (page, name) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/legendary-${name}.png` }); };

async function legendary(browser, url, dmOpts, playerOpts, label) {
  await scenario(`legendary actions: ${label}`, async (run) => {
    const dmCtx = await browser.newContext(dmOpts), plCtx = await browser.newContext(playerOpts);
    const phoneDM = !!dmOpts.hasTouch;
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      let code, drake;
      const idle = (p) => wait(p, () => window.hextable.waiting === 0, null, 20000);
      const tapIt = (loc) => (phoneDM ? loc.tap() : loc.click());

      await run.do('host a table, a player joins', async () => {
        await open(dm, url);
        await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url);
        await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(dm, 'dm'); await waitShown(dm, '#dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
        await closeMenu(dm);
      });

      await run.do('the DM turns the windows on, a dragon joins and a fight begins', async () => {
        drake = await dm.evaluate(() => {
          const h = window.hextable, S = h.state;
          document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'autoEngage', value: false });
          h.act({ type: 'setting', key: 'legendaryWindows', value: true });
          h.act({ type: 'setting', key: 'legendaryResistance', value: true });
          const f = S.entities.fighter.pos;
          h.act({ type: 'spawn', monster: 'adult-green-dragon', at: { q: f.q + 3, r: f.r }, name: 'Verdigris' });
          return null;
        });
        await wait(dm, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Verdigris'), null, 20000);
        drake = await state(dm, (S) => Object.values(S.entities).find((e) => e.name === 'Verdigris').id);
        await dm.evaluate(() => { const h = window.hextable; h.act({ type: 'startEncounter', center: h.state.entities.fighter.pos }); });
        await wait(dm, () => window.hextable.state.encounter, null, 20000); await idle(dm);
      });

      // Ends turns until the table waits between two turns.
      const toWindow = async () => {
        for (let i = 0; i < 40; i++) {
          if (await state(dm, (S) => !!S.encounter?.between)) return;
          const cur = await state(dm, (S) => S.encounter.order[S.encounter.turn].id);
          await dm.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(dm);
        }
        throw new Error('no window opened');
      };

      await run.do('after a turn the DM sees the window and the player only "Waiting for the DM"', async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        const txt = await dm.$eval('#lg', (e) => e.innerText);
        if (!/Verdigris/.test(txt) || !/Legendary 3\/3/.test(txt) || !/Mind Invasion/.test(txt) || !/Pounce/.test(txt) || !/Skip/.test(txt) || !/Done/.test(txt)) throw new Error(`the window does not say what it should: ${txt}`);
        const boxes = await dm.$$eval('#lg button', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.height, r.left, r.right, r.bottom]; }));
        const vw = await dm.evaluate(() => [innerWidth, innerHeight]);
        if (boxes.some((b) => b[0] < 56)) throw new Error(`a button is under 56 px: ${JSON.stringify(boxes)}`);
        if (boxes.some((b) => b[1] < 0 || b[2] > vw[0] || b[3] > vw[1] + 1)) throw new Error(`a button is off screen: ${JSON.stringify(boxes)} in ${vw}`);
        await wait(pl, () => /Waiting for the DM/.test(document.querySelector('#turn-text').textContent));
        const got = await state(pl, (S) => S.encounter.between);
        if (got !== true) throw new Error(`the player was sent more than "waiting": ${JSON.stringify(got)}`);
        if (await shown(pl, '#lg')) throw new Error('the player was shown the window');
        const plTxt = await pl.evaluate(() => document.body.innerText);
        if (/Legendary \d|Verdigris's|Mind Invasion|Pounce/.test(plTxt)) throw new Error('the player can read what the window offers');
        await shot(dm, 'window-dm'); await shot(pl, 'window-player');
      });

      await run.do('one tap on a manual option spends the use and the player sees the event', async () => {
        await tapIt(dm.locator('#lg .lg-opt[data-opt="mind-invasion"]'));
        await wait(dm, (id) => window.hextable.state.entities[id].legend.acts === 1, drake);
        await wait(dm, () => !window.hextable.state.encounter.between);
        await waitShown(dm, '#lg', false);
        await wait(pl, () => !window.hextable.state.encounter.between);
        await wait(pl, () => !/Waiting for the DM/.test(document.querySelector('#turn-text').textContent));
      });
    } finally { await plCtx.close(); await dmCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=legendary.
export default async function (browser, url) {
  await legendary(browser, url, WIDE, PHONE, 'a wide DM, a phone player');
  await legendary(browser, url, PHONE, WIDE, 'a phone DM, a wide player');
}
