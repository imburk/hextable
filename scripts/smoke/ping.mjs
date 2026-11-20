import { scenario, wait, open, playSolo, closePanels, sleep, waitShown, closeMenu, openTab, onCanvas } from './lib.mjs';

// ---------- ping (#599): press and hold a cell of the map for a second ----------
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);

// A point of the canvas that is on a cell of the map, found through the renderer's own projection: the cells round the first party creature.
const freePoint = (page) => page.evaluate(() => {
  const S = window.hextable.state, R = window.hextable.R, e = Object.values(S.entities).find((x) => x.side === 'party');
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1], [2, 0], [-2, 0]]) {
    const h = { q: e.pos.q + dq, r: e.pos.r + dr, z: e.pos.z }, p = R.screenOf(h);
    if (p && p.x > 20 && p.y > 20 && p.x < innerWidth - 20 && p.y < innerHeight - 160 && document.elementFromPoint(p.x, p.y)?.id === 'gl') return [p.x, p.y];
  }
  // Not near the creature on this screen: the first point of the canvas, from the middle out, that is on a cell of the ground floor.
  const on = (x, y) => { const h = R.planeHex(x, y, 0); return h && S.map.levels.some((l) => l.tiles[`${h.q},${h.r}`]) && document.elementFromPoint(x, y)?.id === 'gl'; };
  for (let d = 0; d < 400; d += 20) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
    const x = innerWidth / 2 + dx, y = innerHeight * 0.35 + dy;
    if (x > 20 && y > 20 && x < innerWidth - 20 && y < innerHeight - 200 && on(x, y)) return [x, y];
  }
  return null;
});
// The camera eases to the party for a while after a table opens; presses wait until the map stands still.
const still = async (page) => {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => { const R = window.hextable.R, e = Object.values(window.hextable.state.entities).find((x) => x.side === 'party'); const p = R.screenOf(e.pos); return p ? `${Math.round(p.x)},${Math.round(p.y)}` : ''; });
    if (now && now === last) return; last = now; await sleep(500);
  }
};
const pings = (page) => page.evaluate(() => [...document.querySelectorAll('#pings .ping')].map((e) => e.querySelector('.ping-name').textContent));

// Hold with a mouse or, with touch, through CDP touch events (which make pointer events), for `ms`; `drift` pixels of movement during it.
async function hold(page, cdp, [x, y], ms, drift = 0, onDown = null) {
  if (cdp) {
    const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([px, py], id) => ({ x: px, y: py, id })) });
    await t('touchStart', [[x, y]]); await onDown?.();
    if (drift) { await sleep(100); for (let i = 1; i <= 5; i++) { await t('touchMove', [[x + (drift * i) / 5, y]]); await sleep(10); } await sleep(ms); } else await sleep(ms);
    await t('touchEnd', []);
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await onDown?.();
    if (drift) { await sleep(100); await page.mouse.move(x + drift, y, { steps: 5 }); await sleep(ms); } else await sleep(ms);
    await page.mouse.up();
  }
}

async function solo(browser, url, label, opts, phone) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const cdp = phone ? await ctx.newCDPSession(page) : null;
      let at;
      await run.do('open solo play', async () => { await open(page, url); await playSolo(page); await closePanels(page); await still(page); at = await freePoint(page); if (!at) throw new Error('no canvas point on a cell'); });
      const tl = () => page.evaluate(() => window.hextable.state.timeline.length);
      await run.do('a release before a second shows the ring, then nothing: no ping', async () => {
        const n = await tl();
        await page.evaluate(() => {});
        await hold(page, cdp, at, 300);
        await sleep(900);
        if ((await pings(page)).length) throw new Error('a short press pinged');
        if (await page.locator('#pings .hold-ring').count()) throw new Error('the ring stayed after the release');
        if ((await tl()) !== n) throw new Error('the timeline changed');
      });
      await run.do('a move during the hold cancels it', async () => {
        await hold(page, cdp, at, 2500, 30); await sleep(300);
        if ((await pings(page)).length) throw new Error('a drag pinged');
        if (await page.locator('#pings .hold-ring').count()) throw new Error('the ring stayed after the move');
      });
      await run.do('the ring is drawn while the press is held', async () => {
        // The screenshot takes as long as the page takes, so this press may run its second out and ping; it is let go and waited out.
        await hold(page, cdp, at, 300, 0, async () => {
          await sleep(150); if (!(await page.locator('#pings .hold-ring').count())) throw new Error('no ring while holding');
          await shot(page, `ping-ring-${phone ? 'phone' : 'wide'}`);
        });
        await wait(page, () => !document.querySelector('#pings .hold-ring'));
        await sleep(3600);
      });
      await run.do('a full second pings: seen in the log-free map, signed DM, nothing saved, not undoable', async () => {
        const n = await tl(), undo = await page.evaluate(() => window.hextable.state && 0);
        await hold(page, cdp, at, 2200);         // a second is the page's; the headless page is slow to run its timer, so the press is held longer than needed
        await wait(page, () => document.querySelectorAll('#pings .ping').length === 1);
        if ((await pings(page))[0] !== 'DM') throw new Error('name ' + (await pings(page)));
        const box = await page.evaluate(() => { const r = document.querySelector('#pings .ping i').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        if (Math.hypot(box[0] - at[0], box[1] - at[1]) > 60) throw new Error(`the ping is at ${box}, the press was at ${at}`);
        await shot(page, `ping-shown-${phone ? 'phone' : 'wide'}`);
        if ((await tl()) !== n) throw new Error('the timeline changed');
        void undo;
      });
      await run.do('it goes after about three seconds', async () => { await sleep(3300); if ((await pings(page)).length) throw new Error('still there'); });
      await run.do('a tap still does what it did (no ping, the selection tap)', async () => {
        await (cdp ? page.touchscreen.tap(...at) : page.mouse.click(...at)); await sleep(400);
        if ((await pings(page)).length) throw new Error('a tap pinged');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'ping at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } }, false);
  await solo(browser, url, 'ping at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);

  await scenario('ping: a phone pings, the DM sees it with the phone\'s name', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      const cdp = await phoneCtx.newCDPSession(phone);
      let code;
      await run.do('host, join, let in', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm', true, 20000);
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false, 20000);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host); await closeMenu(phone);
      });
      await run.do('the phone holds a cell; both screens show Smoke Player\'s ping', async () => {
        await still(phone); const at = await freePoint(phone);
        if (!at) throw new Error('no point');
        const n = await host.evaluate(() => window.hextable.state.timeline?.length ?? 0);
        await hold(phone, cdp, at, 2200);
        const named = (p) => wait(p, () => [...document.querySelectorAll('#pings .ping-name')].some((e) => e.textContent === 'Smoke Player'), null, 20000);
        await Promise.all([named(host), named(phone)]);
        if ((await host.evaluate(() => window.hextable.state.timeline?.length ?? 0)) !== n) throw new Error('the timeline grew');
        await shot(host, 'ping-multiplayer-host'); await shot(phone, 'ping-multiplayer-phone');
        void onCanvas;
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}
