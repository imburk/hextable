import { scenario, wait, open, playSolo, closePanels, openTab, waitShown, sleep } from './lib.mjs';

// ---------- Strike first asks before 'Spells and attacks' is turned on (#649) ----------
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const setting = (page) => page.evaluate(() => window.hextable.state.settings.strikeFirst ?? 'off');

async function run1(browser, url, label, opts, phone) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const { width: vw, height: vh } = opts.viewport;
      const click = (sel) => (phone ? page.locator(sel).tap() : page.click(sel));
      await run.do('the DM panel; choosing Spells and attacks asks first and changes nothing yet', async () => {
        await open(page, url); await playSolo(page); await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await page.selectOption('#dm-strike-first', 'all');
        await waitShown(page, '#strike-first-ask');
        if ((await setting(page)) === 'all') throw new Error('turned on before the answer');
        const b = await box(page, '#strike-first-card');
        if (!b || b.l < 0 || b.t < 0 || b.r > vw || b.b > vh) throw new Error(`dialog leaves the screen: ${JSON.stringify(b)}`);
        for (const sel of ['#strike-first-cancel', '#strike-first-on']) { const r = await box(page, sel); if (!r || r.r - r.l < 44 || r.b - r.t < 44) throw new Error(`${sel} under 44px`); }
        await shot(page, `strikefirst-${phone ? 'phone' : 'wide'}`);
      });
      await run.do('Cancel closes it, leaves the rule as it was and puts the choice back', async () => {
        await click('#strike-first-cancel'); await waitShown(page, '#strike-first-ask', false);
        if ((await setting(page)) === 'all') throw new Error('Cancel turned it on');
        if ((await page.inputValue('#dm-strike-first')) === 'all') throw new Error('choice not put back');
      });
      await run.do('Turn on sets it', async () => {
        await page.selectOption('#dm-strike-first', 'all'); await waitShown(page, '#strike-first-ask');
        await click('#strike-first-on'); await waitShown(page, '#strike-first-ask', false);
        await wait(page, () => window.hextable.state.settings.strikeFirst === 'all');
      });
      await run.do('turning it off asks nothing', async () => {
        await page.selectOption('#dm-strike-first', 'off'); await sleep(300);
        if (await box(page, '#strike-first-ask')) throw new Error('asked when turning off');
        await wait(page, () => (window.hextable.state.settings.strikeFirst ?? 'off') === 'off');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await run1(browser, url, 'strike first asks at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } }, false);
  await run1(browser, url, 'strike first asks at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);
}
