import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, openTab } from './lib.mjs';

// ---------- new game and leave are easy to find (docs/DEBT.md T16, issue #223) ----------
// Solo: the lobby offers Continue and New game once a game is saved, and the menu head has New game on every tab. Both take two taps.
// Table: Leave table is at the top of the menu for the DM and for a player, and a remembered table shows in the lobby with Rejoin and Forget.
const MARK = 'Smoke mark';
const marked = (page) => page.evaluate((m) => JSON.stringify(window.hextable.state).includes(m), MARK);
const inView = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);
// The drawer slides in: wait until the element has come to rest inside the screen, not for a fixed time.
const settled = (page, sel) => wait(page, (s) => { const e = document.querySelector(s), r = e?.getBoundingClientRect(); return !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel).then(() => true, () => false);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const session = (page) => page.evaluate(() => localStorage.getItem('hextable.session'));

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('a first visit offers solo play and no New game', async () => {
        await open(page, url);
        if (await shown(page, '#lobby-new')) throw new Error('New game is offered with nothing saved');
        if (!/play solo/i.test(await text(page, '#lobby-solo'))) throw new Error(`solo button says: ${await text(page, '#lobby-solo')}`);
        await playSolo(page);
        await page.evaluate((m) => window.hextable.act({ type: 'chronicle', title: m }), MARK);
        await wait(page, (m) => JSON.stringify(window.hextable.state).includes(m), MARK);
      });
      await run.do('New game is at the top of the menu on every tab, in view, and Leave table is not', async () => {
        for (const tab of ['turns', 'settings', 'log']) {
          await openTab(page, tab);
          if (!(await shown(page, '#menu-new'))) throw new Error(`no New game on ${tab}`);
          if (!(await settled(page, '#menu-new'))) throw new Error(`New game is out of view on ${tab}`);
          if (await shown(page, '#menu-leave')) throw new Error('Leave table shown in a solo game');
        }
      });
      await run.do('one tap on New game asks, the second starts a fresh game', async () => {
        await page.click('#menu-new');
        if (!(await marked(page))) throw new Error('one tap threw the game away');
        if (!/again/i.test(await text(page, '#menu-new'))) throw new Error('the button did not ask for a second tap');
        await page.click('#menu-new');
        await waitShown(page, '#drawer', false);                 // confirming closes the menu: the map is what was asked for
        await wait(page, (m) => !JSON.stringify(window.hextable.state).includes(m), MARK);
      });
      await run.do('an unconfirmed tap runs out and the game stays', async () => {
        await page.evaluate((m) => window.hextable.act({ type: 'chronicle', title: m }), MARK);
        await waitShown(page, '#drawer', false);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.click('#dm-new');
        await sleep(3400);
        if (/again/i.test(await text(page, '#dm-new'))) throw new Error('the button stayed armed');
        if (!(await marked(page))) throw new Error('the game was lost');
      });
      await run.do('the reloaded lobby offers Continue and New game; Continue keeps the game', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        if (!/continue/i.test(await text(page, '#lobby-solo'))) throw new Error(`solo button says: ${await text(page, '#lobby-solo')}`);
        await waitShown(page, '#lobby-new');
        if (!(await inView(page, '#lobby-new'))) throw new Error('New game is out of view in the lobby');
        await page.click('#lobby-solo');
        await wait(page, () => window.hextable?.state?.entities);
        if (!(await marked(page))) throw new Error('Continue did not keep the game');
      });
      await run.do('the lobby New game asks once, then starts fresh', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        await page.click('#lobby-new');
        if (!(await shown(page, '#lobby'))) throw new Error('the lobby closed on the first tap');
        if (!/again/i.test(await text(page, '#lobby-new'))) throw new Error('no second-tap prompt');
        await page.click('#lobby-new');
        await wait(page, () => window.hextable?.state?.entities);
        if (await marked(page)) throw new Error('the old game is still there');
      });
    } finally { await ctx.close(); }
  });
}

async function table(browser, url) {
  await scenario('table: leave at the top of the menu, remembered table in the lobby', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let code;
      await run.do('host a table; the DM menu has Leave table at the top and no New game', async () => {
        await open(host, url);
        await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await openTab(host, 'turns');
        if (!(await shown(host, '#menu-leave')) || !(await settled(host, '#menu-leave'))) throw new Error('no Leave table at the top of the DM menu');
        if (await shown(host, '#menu-new')) throw new Error('New game shown at a table');
      });
      await run.do('a player joins and has Leave table at the top of the menu on a phone', async () => {
        await open(phone, url);
        await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await phone.click('#btn-menu'); await waitShown(phone, '#drawer');
        if (!(await shown(phone, '#menu-leave')) || !(await settled(phone, '#menu-leave'))) throw new Error('no Leave table at the top of the player menu');
      });
      await run.do('the DM sees what leaving does on the first tap, and the table is kept', async () => {
        await host.click('#menu-leave');
        if (!/new players/i.test(await text(host, '#menu-note'))) throw new Error(`note: ${await text(host, '#menu-note')}`);
        if (!(await session(host))) throw new Error('the table was forgotten on one tap');
        await sleep(3400);
        if (await shown(host, '#menu-note')) throw new Error('the note stayed up');
      });
      await run.do('the DM reloads: the lobby names the table; Rejoin returns to it', async () => {
        await host.reload(); await waitShown(host, '#lobby');
        await waitShown(host, '#lobby-remember');
        if (!(await text(host, '#lobby-table')).includes(code)) throw new Error('the lobby does not say which table');
        await host.click('#lobby-rejoin');
        await wait(host, () => window.hextable?.state?.entities);
        await waitShown(host, '#lobby', false);
      });
      await run.do('Forget takes two taps and drops the remembered table', async () => {
        await host.reload(); await waitShown(host, '#lobby-remember');
        await host.click('#lobby-forget');
        if (!(await session(host))) throw new Error('forgotten on one tap');
        await host.click('#lobby-forget');
        await waitShown(host, '#lobby-remember', false);
        if (await session(host)) throw new Error('the table is still remembered');
      });
      await run.do('the player leaves with two taps from the menu and lands in the lobby', async () => {
        await phone.click('#menu-leave');
        if (!(await shown(phone, '#drawer'))) throw new Error('left on one tap');
        await phone.click('#menu-leave');
        await waitShown(phone, '#lobby');
        if (await session(phone)) throw new Error('the table is still remembered after leaving');
        if (await shown(phone, '#lobby-remember')) throw new Error('the lobby offers a table just left');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// ---------- the valley on squares or on hexes (docs/specs/square-grid.md, row S12, issue #269) ----------
// The lobby asks "Valley on squares" or "Valley on hexes" with the starting map (only while that is the starter valley), one tap, and
// the device remembers the last one. Solo and a hosted table both start on the grid chosen; Continue keeps a saved game's own grid.
const gridOf = (page) => page.evaluate(() => window.hextable.state?.map?.grid);
const picked = (page) => page.evaluate(() => [...document.getElementsByName('lobby-grid')].find((r) => r.checked)?.value);
async function valley(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
      await run.do('the lobby offers squares first, hexes picked on a first visit, and one tap changes it', async () => {
        await open(page, url);
        const labels = await page.$$eval('#lobby-grid label', (l) => l.map((x) => x.textContent.trim()));
        if (labels.join('|') !== 'Valley on squares|Valley on hexes') throw new Error(`choices: ${labels}`);
        if ((await picked(page)) !== 'hex') throw new Error('hexes are not the first-visit choice');
        if (!(await inView(page, '#lobby-grid label:first-child'))) throw new Error('the choice is out of view');
        await tap('#lobby-grid label:first-child');
        if ((await picked(page)) !== 'square') throw new Error('one tap did not pick squares');
      });
      await run.do('the choice is asked only for the starter valley', async () => {
        await page.selectOption('#lobby-map', 'undercroft');
        if (await shown(page, '#lobby-grid')) throw new Error('the grid choice stays up with a stock map chosen');
        await page.selectOption('#lobby-map', '');
        if (!(await shown(page, '#lobby-grid'))) throw new Error('the grid choice did not come back');
      });
      await run.do('solo starts the valley on squares, with the same heroes and foes', async () => {
        await playSolo(page);
        if ((await gridOf(page)) !== 'square') throw new Error(`grid ${await gridOf(page)}`);
        const ids = await page.evaluate(() => Object.keys(window.hextable.state.entities).join());
        if (ids !== 'fighter,rogue,cleric,wizard,m1,m2,m3,m4,m5,m6') throw new Error(ids);
        await page.evaluate((m) => window.hextable.act({ type: 'chronicle', title: m }), MARK);     // a solo game is saved by its first act
        await wait(page, (m) => JSON.stringify(window.hextable.state).includes(m), MARK);
      });
      await run.do('the device remembers it; New game from the lobby starts on the grid chosen; Continue keeps a saved game its own grid', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        if ((await picked(page)) !== 'square') throw new Error('the last choice was not remembered');
        await tap('#lobby-grid label:last-child');
        await page.click('#lobby-new'); await page.click('#lobby-new');
        await wait(page, () => window.hextable?.state?.entities);
        if ((await gridOf(page)) !== 'hex') throw new Error(`grid ${await gridOf(page)} after choosing hexes`);
        await page.evaluate((m) => window.hextable.act({ type: 'chronicle', title: m }), MARK);     // saved by its first act
        await wait(page, (m) => JSON.stringify(window.hextable.state).includes(m), MARK);
        await page.reload(); await waitShown(page, '#lobby');
        if ((await picked(page)) !== 'hex') throw new Error('hexes were not remembered');
        await tap('#lobby-grid label:first-child');
        await page.click('#lobby-solo');                           // Continue: the saved game keeps its own grid
        await wait(page, () => window.hextable?.state?.entities);
        if ((await gridOf(page)) !== 'hex') throw new Error('Continue changed the saved game\'s grid');
      });
      await run.do('a solo game starts on the square stock map chosen in the lobby, and a hero walks through its door', async () => {
        await page.evaluate(() => localStorage.removeItem('hextable.solo'));
        await page.reload(); await waitShown(page, '#lobby');
        const names = await page.$$eval('#lobby-map option', (o) => o.map((x) => x.textContent));
        if (!names.some((n) => /Thornwick Undercroft \(squares\)/.test(n)) || !names.some((n) => /Copper Kettle \(tavern, hexes\)/.test(n))) throw new Error(`names: ${names}`);
        await page.selectOption('#lobby-map', 'undercroft');
        await page.click('#lobby-solo');
        await wait(page, () => window.hextable?.state?.map?.id === 'undercroft');
        if ((await gridOf(page)) !== 'square') throw new Error('the stock map is not on squares');
        const act = (a) => page.evaluate((x) => window.hextable.act(x), a);
        const at = () => page.evaluate(() => JSON.stringify(window.hextable.state.entities.fighter.pos));
        await act({ type: 'move', actor: 'fighter', to: { q: 3, r: 18, z: 0 } });
        await wait(page, () => window.hextable.state.entities.fighter.pos.r === 18);
        await act({ type: 'use', actor: 'fighter', object: 'o1', verb: 'open' });
        await wait(page, () => window.hextable.state.map.objects.find((o) => o.id === 'o1').state === 'open');
        await act({ type: 'move', actor: 'fighter', to: { q: 3, r: 15, z: 0 } });
        await wait(page, () => window.hextable.state.entities.fighter.pos.r === 15);
        if (!/"r":15/.test(await at())) throw new Error(`the hero is at ${await at()}`);
      });
      await run.do('a hosted table starts on the grid chosen', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        if ((await picked(page)) !== 'square') throw new Error('square not remembered');
        await page.click('#lobby-host');
        await wait(page, () => window.hextable?.state?.entities && document.querySelector('#dm-table code')?.textContent.length === 6);
        if ((await gridOf(page)) !== 'square') throw new Error(`table grid ${await gridOf(page)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=newgame.
export default async function (browser, url) {
  await solo(browser, url, 'new game at 1280x800', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'new game at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await table(browser, url);
  await valley(browser, url, 'valley on squares or hexes at 1280x800', { viewport: { width: 1280, height: 800 } });
  await valley(browser, url, 'valley on squares or hexes at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
