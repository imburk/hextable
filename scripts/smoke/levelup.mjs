import { scenario, wait, state, shown, open, playSolo, closeMenu, closePanels, openTab, waitShown, calm, sleep, openMenu } from './lib.mjs';

// ---------- Level up where the player looks (#672) ----------
// The four starters are built from sheets, so Level up works for them; the button is on the rewards card, on the character card at the bottom of the screen
// and on the sheet, once the XP reaches the next level. Solo (the DM): live buttons that open the level-up screen. A phone player at a table: the same line with
// the button off and the reason in words on the page (not a hover title). Screenshots with SMOKE_SHOTS=<dir>.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const box = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
const WIN = () => {
  const h = window.hextable;
  const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
  h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
  for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
};

async function solo(browser, url, label, opts, touch) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    const tag = touch ? 'phone' : 'desktop';
    try {
      const page = await ctx.newPage(); run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
      await run.do('the starters have sheets; a won fight with 1,200 bonus XP makes all four ready, and the rewards card has a Level up for each', async () => {
        await open(page, url); await playSolo(page); await closePanels(page);
        const sheets = await state(page, (S) => ['fighter', 'rogue', 'cleric', 'wizard'].map((id) => !!S.entities[id].sheet));
        if (sheets.includes(false)) throw new Error(`a starter has no sheet: ${sheets}`);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await page.evaluate(WIN);
        await wait(page, () => !window.hextable.state.encounter && window.hextable.state.conclusion);
        await page.evaluate(() => { window.hextable.act({ type: 'conclusion', edit: { bonus: [{ amount: 1200, reason: 'Smoke' }] } }); window.hextable.act({ type: 'conclusion', publish: true }); });
        await calm(page);
        await waitShown(page, '#cc .lu');
        const n = await page.$$eval('#cc .lu-go', (b) => b.filter((x) => !x.disabled).length);
        if (n !== 4) throw new Error(`${n} live Level up buttons on the card, not 4`);
        const text = await page.textContent('#cc .lu');
        if (!/\w can reach level 2\./.test(text)) throw new Error(`the line says "${text}"`);
        const m = await box(page, '#cc .lu-go');
        if (m.h < 44) throw new Error(`the button is ${m.h} px high`);
        const c = await box(page, '.cc-card');
        if (c.l < 0 || c.r > c.vw) throw new Error(`the card runs off the side: ${JSON.stringify(c)}`);
        await shot(page, `levelup-${tag}-1-rewards`);
      });
      await run.do('tapping Level up on the card puts the card away and opens the level-up screen; saving makes level 2', async () => {
        await tap('#cc [data-levelup="fighter"]');
        await waitShown(page, '#qb'); await waitShown(page, '#cc', false);
        const title = await page.textContent('#qb h2');
        if (!/Level up Brenna/.test(title)) throw new Error(`the screen says "${title}"`);
        await shot(page, `levelup-${tag}-2-screen`);
        await tap('#qb-save');
        await wait(page, () => window.hextable.state.entities.fighter.level === 2);
        const hp = await state(page, (S) => S.entities.fighter.maxHp);
        if (hp <= 12) throw new Error(`Brenna has ${hp} Hit Points at level 2`);
        await waitShown(page, '#qb', false);
      });
      await run.do('the character card has a Level up chip for a ready hero, and tapping it opens the screen', async () => {
        await closePanels(page);
        await page.evaluate(() => window.hextable.select('rogue'));
        await openMenu(page, 'sheet');                       // M3: the status block (level chip) is the top of the Character screen
        await waitShown(page, '#c-level .lu-go');
        const txt = await page.textContent('#c-level');
        if (!/Level 2 is ready/.test(txt)) throw new Error(`the chip says "${txt}"`);
        const m = await box(page, '#c-level .lu-go');
        if (m.h < 44 || m.b > m.vh) throw new Error(`the chip button is ${JSON.stringify(m)}`);
        await shot(page, `levelup-${tag}-3-card`);
        await tap('#c-level .lu-go');
        await waitShown(page, '#qb');
        if (!/Level up Pip/.test(await page.textContent('#qb h2'))) throw new Error('the screen is not for Pip');
        await tap('#qb-cancel'); await waitShown(page, '#qb', false);
      });
      await run.do('the sheet has the line and the button too; the DM tab says why Level up is off for a hero who is not selected', async () => {
        await openTab(page, 'sheet');
        await waitShown(page, '#sheet-body .lu-go');
        if (!/Pip can reach level 2\./.test(await page.textContent('#sheet-body .lu'))) throw new Error('the sheet line is wrong');
        await shot(page, `levelup-${tag}-4-sheet`);
        await tap('#sheet-body [data-levelup="rogue"]'); await waitShown(page, '#qb');
        await tap('#qb-cancel'); await waitShown(page, '#qb', false);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.evaluate(() => window.hextable.select(Object.keys(window.hextable.state.entities).find((id) => window.hextable.state.entities[id].side === 'foe')));
        await wait(page, () => document.getElementById('qb-levelup')?.disabled);
        const why = await page.textContent('#qb-levelup-why');
        if (!/Only a character levels up/.test(why) || !(await shown(page, '#qb-levelup-why'))) throw new Error(`the DM tab says "${why}"`);
        await closeMenu(page);
      });
      await run.do('in a fight the chip goes and the sheet and the DM tab say in words that it waits', async () => {
        await page.evaluate(() => {
          const h = window.hextable;
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe') h.act({ type: 'setHp', actor: e.id, hp: e.maxHp });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.side === 'foe' && e.hp > 0 && !e.hidden));
        await page.evaluate(() => { const h = window.hextable, foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden); h.act({ type: 'startEncounter', center: foe.pos, radius: 40 }); });
        await wait(page, () => !!window.hextable.state.encounter);
        // The first turn's beat selects the hero whose turn it is (app.js, the 'turn' event) once it has played, and the order is rolled: so pick the cleric only after the
        // initiative dice and the beats are done, or a hero who rolled first is picked back over it and the sheet is somebody else's.
        await calm(page);
        await page.evaluate(() => window.hextable.select('cleric'));
        await calm(page);
        if (await shown(page, '#c-level .lu-go')) throw new Error('the chip is on the card in a fight');
        await openTab(page, 'sheet');
        await waitShown(page, '#sheet-body .lu-why');
        if (!/middle of a fight/.test(await page.textContent('#sheet-body .lu-why'))) throw new Error('the sheet does not say it waits');
        if (!(await page.$eval('#sheet-body .lu-go', (b) => b.disabled))) throw new Error('the sheet button is live in a fight');
        await shot(page, `levelup-${tag}-5-fight`);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await wait(page, () => /middle of a fight/.test(document.getElementById('qb-levelup-why')?.textContent ?? ''));
      });
    } finally { await ctx.close(); }
  });
}

async function player(browser, url) {
  await scenario('level up for a phone player at a table: the line and a button that is off, with the reason on the page', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let id;
      await run.do('a DM hosts, a phone player joins and plays Brenna; the DM wins a fight with 1,200 bonus XP and shows the rewards', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        await openMenu(phone, []); const b = phone.locator('#arc .arc-b:has-text("Play as")').first();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, (await b.locator('strong').textContent()).replace('Play as ', '').trim());
        await b.click(); await closeMenu(phone);
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
        await host.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await host.evaluate(WIN);
        await wait(host, () => !window.hextable.state.encounter && window.hextable.state.conclusion);
        await host.evaluate(() => { window.hextable.act({ type: 'conclusion', edit: { bonus: [{ amount: 1200, reason: 'Smoke' }] } }); window.hextable.act({ type: 'conclusion', publish: true }); });
        await calm(host); await calm(phone);
        await waitShown(phone, '#cc .lu');
      });
      await run.do('the phone card says the character can reach level 2 and why the button is off, in text; nothing is cut off', async () => {
        const mine = await phone.evaluate((i) => window.hextable.state.entities[i].name, id);
        const text = await phone.textContent(`#cc .lu[data-lu="${id}"]`);
        if (!new RegExp(`${mine} can reach level 2\\.`).test(text)) throw new Error(`the line says "${text}"`);
        const live = await phone.$$eval('#cc .lu-go', (b) => b.filter((x) => !x.disabled).length);
        if (live) throw new Error(`${live} live Level up buttons for a player`);
        const why = await phone.textContent('#cc .lu-why');
        if (!/Only the DM levels a character up at this table\. Ask your DM\./.test(why)) throw new Error(`the reason says "${why}"`);
        if (!(await shown(phone, '#cc .lu-why'))) throw new Error('the reason is not on screen');
        const c = await box(phone, '.cc-card');
        if (c.l < 0 || c.r > c.vw || c.t < 0 || c.b > c.vh) throw new Error(`the card is off the screen: ${JSON.stringify(c)}`);
        await shot(phone, 'levelup-phone-6-player-rewards');
        await phone.locator('#cc [data-cc="continue"]').tap(); await waitShown(phone, '#cc', false);
      });
      await run.do('the player\'s character card has the chip with the reason; the DM\'s own card has a live button', async () => {
        await phone.evaluate((i) => window.hextable.select(i), id);
        await openMenu(phone, 'sheet');                      // M3: the level chip is in the Character screen
        await waitShown(phone, '#c-level .lu-why');
        if (!/Ask your DM/.test(await phone.textContent('#c-level .lu-why'))) throw new Error('no reason on the card');
        if (!(await phone.$eval('#c-level .lu-go', (b) => b.disabled))) throw new Error('the chip is live for a player');
        const m = await box(phone, '#c-level');
        if (m.r > m.vw || m.l < 0) throw new Error(`the chip is cut off: ${JSON.stringify(m)}`);
        await shot(phone, 'levelup-phone-7-player-card');
        await host.evaluate((i) => window.hextable.select(i), id);
        await openMenu(host, 'sheet');
        await waitShown(host, '#c-level .lu-go');
        if (await host.$eval('#c-level .lu-go', (b) => b.disabled)) throw new Error('the DM\'s button is off');
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=levelup.
export default async function (browser, url) {
  await solo(browser, url, 'level up in solo at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } }, false);
  await solo(browser, url, 'level up in solo at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);
  await player(browser, url);
}
