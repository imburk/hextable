import { scenario, wait, open, playSolo, closePanels, sleep, waitShown } from './lib.mjs';

// ---------- "A new version is ready" (#646): the build id is checked on load, when the tab is shown again (solo) and when a table reconnects ----------
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);

// build.json answers come from here: the server's real stamp (the build the page carries in its meta) until `now.commit` is set, which is the "deploy".
async function fakeBuild(ctx) {
  const now = { commit: null };
  await ctx.route('**/build.json', async (route) => {
    const real = await (await route.fetch()).json();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(now.commit ? { ...real, commit: now.commit } : real) });
  });
  return now;
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const overlap = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const bannerShown = (page, on = true) => wait(page, (want) => { const e = document.getElementById('new-version'); return !!e && !e.hidden === want; }, on, 8000);

// The banner is inside the screen, clear of the top bar, the read-only bar and frame, and the dock (the action panel), and its buttons are touch-sized.
async function geometry(page, vw, vh) {
  const b = await rect(page, '#new-version');
  if (!b) throw new Error('no banner');
  if (b.l < 8 || b.t < 0 || b.r > vw - 8 || b.b > vh) throw new Error(`banner leaves the screen or the frame: ${JSON.stringify(b)}`);
  for (const sel of ['#top', '#readonly-bar', '#dock', '#ap-body', '#order']) if (overlap(b, await rect(page, sel))) throw new Error(`banner covers ${sel}`);
  for (const sel of ['#new-version-reload', '#new-version-later']) { const r = await rect(page, sel); if (r.r - r.l < 44 || r.b - r.t < 44) throw new Error(`${sel} is under 44px`); }
}

async function solo(browser, url, label, opts, phone) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const now = await fakeBuild(ctx);
      const page = await ctx.newPage(); run.watch(page);
      const { width: vw, height: vh } = opts.viewport;
      await run.do('open solo play: the page carries its build, and it is the same, so no banner', async () => { await open(page, url); if (!(await page.locator('meta[name="hextable-build"]').getAttribute('content'))) throw new Error('no build meta in the page'); await playSolo(page); await closePanels(page); await sleep(300); if (await rect(page, '#new-version')) throw new Error('a banner with no new build'); });
      await run.do('the tab is shown again with the same build: still no banner', async () => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(400); if (await rect(page, '#new-version')) throw new Error('banner'); });
      await run.do('a new build, the tab is shown: the banner offers a reload and is clear of the bars and the action panel', async () => {
        now.commit = 'bbb2222';
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await bannerShown(page);
        if ((await page.textContent('#new-version span')) !== 'A new version is ready') throw new Error('wrong words');
        await geometry(page, vw, vh);
        await shot(page, `newversion-solo-${phone ? 'phone' : 'wide'}`);
      });
      await run.do('the game is still usable: Later hides it, and it stays hidden for this build', async () => {
        await (phone ? page.tap('#new-version-later') : page.click('#new-version-later'));
        await bannerShown(page, false);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(400);
        if (await rect(page, '#new-version')) throw new Error('came back for the same build');
      });
      await run.do('another new build shows it again; Reload reloads the page', async () => {
        now.commit = 'ccc3333';
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await bannerShown(page);
        const nav = page.waitForNavigation({ timeout: 10000 });
        await (phone ? page.tap('#new-version-reload') : page.click('#new-version-reload'));
        await nav;
        await open(page, url); await playSolo(page); await closePanels(page); await sleep(500);
        if (await rect(page, '#new-version')) throw new Error('a banner right after the reload');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'new version at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } }, false);
  await solo(browser, url, 'new version at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);

  await scenario('new version: a table that reconnects after a deploy offers the reload, on a phone', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const now = await fakeBuild(hostCtx);
      const host = await hostCtx.newPage(); run.watch(host);
      await run.do('host a table', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        await waitShown(host, '#lobby', false, 20000); await closePanels(host); await sleep(300);
        if (await rect(host, '#new-version')) throw new Error('banner with no new build');
      });
      await run.do('the socket drops and comes back after a deploy: the banner', async () => {
        now.commit = 'ddd4444';
        await host.evaluate(() => window.hextable.dropSocket());
        await bannerShown(host);
        await geometry(host, 390, 844);
        await shot(host, 'newversion-multiplayer-phone');
      });
    } finally { await hostCtx.close(); }
  });
}
