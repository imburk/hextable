import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, openTab, calm } from './lib.mjs';

// ---------- log ----------
// The log by combat (packages/client/logview.js, docs/specs/table-ui.md T7c). Solo at both sizes: a fight is one collapsed entry with its
// summary, opens to rounds, filters keep the summary, a reload rebuilds the groups. Then a DM and a phone player: the phone's log holds what
// it was sent, and after a reload an old fight's blow-by-blow is asked for when it is opened.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const win = () => {
  const h = window.hextable;
  document.getElementById('dm-auto') && (document.getElementById('dm-auto').checked = false);
  const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
  h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
  for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
};
const fights = (page) => page.$$eval('#log-list .lg-fight', (l) => l.map((x) => ({ open: x.querySelector('details').open, title: x.querySelector('.lg-title').textContent, sub: x.querySelector('.lg-sub')?.textContent ?? '', rounds: x.querySelectorAll('.lg-h').length, lines: x.querySelectorAll('.lg-line').length })));

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desktop';
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('a won fight is one collapsed entry with its summary line', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await page.evaluate(win);
        await calm(page);
        await page.evaluate(() => { const c = window.hextable.state.conclusion; if (c && !c.published) window.hextable.act({ type: 'conclusion', publish: true }); });
        await wait(page, () => window.hextable.state.conclusion?.published !== false);
        await calm(page);
        await openTab(page, 'log');
        const f = await fights(page);
        if (f.length !== 1) throw new Error(`fights in the log: ${JSON.stringify(f)}`);
        if (f[0].open) throw new Error('a finished fight is open');
        if (!/^Fight 1 .*Won$/.test(f[0].title)) throw new Error(`title: ${f[0].title}`);
        if (!/XP each/.test(f[0].sub)) throw new Error(`summary: ${f[0].sub}`);
        if (!(await shown(page, '#log-list .lg-fight summary'))) throw new Error('the summary line is not on screen');
        await shot(page, `log-collapsed-${tag}`);
      });
      await run.do('opening it shows the blow-by-blow under round headings', async () => {
        await page.click('#log-list .lg-fight summary');
        await wait(page, () => document.querySelector('#log-list .lg-fight details').open);
        const f = (await fights(page))[0];
        if (f.rounds < 2 || f.lines < 3) throw new Error(`inside: ${JSON.stringify(f)}`);
        const t = await page.textContent('#log-list .lg-fight');
        if (!/Roll initiative/.test(t) || !/Experience: .* XP/.test(t)) throw new Error('start or rewards line missing');
        await shot(page, `log-open-${tag}`);
      });
      await run.do('a filter keeps the fight\'s summary and is remembered', async () => {
        await page.click('.lg-chip[data-kind="loot"]');
        if ((await page.getAttribute('.lg-chip[data-kind="loot"]', 'aria-pressed')) !== 'true') throw new Error('the chip is not pressed');
        const f = (await fights(page))[0];
        if (!f || !/Won/.test(f.title)) throw new Error('the summary went with the filter');
        if (!(await page.textContent('#log-list')).includes('Experience')) throw new Error('the rewards line is filtered out of Loot');
        if (await page.$('#log-list .lg-line[data-kind="combat"]')) throw new Error('a blow shows under the Loot filter');
        const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('hextable.logFilter')));
        if (kept?.join() !== 'loot') throw new Error(`kept: ${JSON.stringify(kept)}`);
        await shot(page, `log-filter-${tag}`);
        await page.click('.lg-chip[data-kind="loot"]');
      });
      await run.do('no horizontal overflow in the log', async () => {
        const o = await page.evaluate(() => { const l = document.getElementById('log-list'); return [l.scrollWidth, l.clientWidth]; });
        if (o[0] > o[1] + 1) throw new Error(`overflow ${o}`);
      });
      await run.do('a reload rebuilds the groups', async () => {
        await closeMenu(page);
        await page.reload(); await waitShown(page, '#lobby');
        await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await openTab(page, 'log');
        const f = await fights(page);
        if (f.length !== 1 || !/Won/.test(f[0].title) || !/XP each/.test(f[0].sub)) throw new Error(`after the reload: ${JSON.stringify(f)}`);
        await shot(page, `log-reload-${tag}`);
      });
    } finally { await ctx.close(); }
  });
}

async function table(browser, url) {
  await scenario('log: a DM and a phone player, lazy load after a reload', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      await run.do('a DM hosts and a phone player joins and claims a character', async () => {
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
        await phone.locator('#party button:has-text("Play as")').first().click();
      });
      await run.do('the DM wins and publishes; the phone log has one fight with its summary', async () => {
        await host.evaluate(win);
        await waitShown(host, '#cc-chip');
        await host.click('#cc-chip'); await waitShown(host, '#cc');
        await host.click('#cc [data-cc="publish"]');
        await waitShown(phone, '#cc');
        await phone.locator('#cc [data-cc="continue"]').tap();
        await calm(phone); await calm(host);
        await openTab(phone, 'log');
        const f = await fights(phone);
        if (f.length !== 1 || f[0].open || !/Won/.test(f[0].title) || !/XP each/.test(f[0].sub)) throw new Error(JSON.stringify(f));
        if (await phone.$('.lg-chip[data-kind="dm"]')) throw new Error('a player has the DM-only chip');
        if (!(await host.$('.lg-chip[data-kind="dm"]')) && !(await openTab(host, 'log'), await host.$('.lg-chip[data-kind="dm"]'))) throw new Error('the DM has no DM-only chip');
        await shot(phone, 'log-player-phone');
        await closeMenu(phone); await closeMenu(host);
      });
      await run.do('fifty more entries push the fight out of what a reload is sent', async () => {
        const c0 = await state(host, (S) => S.clock);
        await host.evaluate(async () => { for (let i = 0; i < 60; i++) { window.hextable.act({ type: 'advanceTime', minutes: 1 }); await new Promise((r) => setTimeout(r, 60)); } });
        await wait(host, (c) => window.hextable.state.clock >= c + 60, c0, 30000);
        await calm(host); await calm(phone);
      });
      await run.do('the phone reloads: the fight is still one collapsed entry; opening it asks for its rounds', async () => {
        await phone.reload(); await waitShown(phone, '#lobby-remember');
        await phone.click('#lobby-rejoin');
        await wait(phone, () => window.hextable?.state?.entities);
        await openTab(phone, 'log');
        await wait(phone, () => document.querySelectorAll('#log-list .lg-fight').length === 1);
        const before = (await fights(phone))[0];
        if (!/Won/.test(before.title)) throw new Error(`older fight summary: ${JSON.stringify(before)}`);
        if (before.rounds > 0 && before.lines > 6) throw new Error(`the blow-by-blow was already there: ${JSON.stringify(before)}`);
        await phone.locator('#log-list .lg-fight summary').tap();
        await wait(phone, () => document.querySelectorAll('#log-list .lg-fight .lg-h').length >= 2, null, 10000);
        const after = (await fights(phone))[0];
        if (after.lines <= before.lines) throw new Error(`nothing was loaded: ${JSON.stringify(after)}`);
        await shot(phone, 'log-lazy-phone');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=log.
export default async function (browser, url) {
  await solo(browser, url, 'log at 1280x800', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'log at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await table(browser, url);
}
