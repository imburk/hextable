import { scenario, wait, state, shown, open, playSolo, closePanels, selectAndMove, sleep, waitShown, closeMenu, openTab } from './lib.mjs';

// ---------- the DM's Undo and Redo (#654; M3 moved them from the top bar: chips beside the token for 8 s after an action, and the first row of DM tools; round 6: curved-arrow symbols, not words) ----------
// Both are there for the DM and disabled when there is nothing to do. What a press would do shows only on a long hover (mouse) or a
// press-hold (touch), and a hold does not also undo. Players never see the buttons.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const btn = (page, id) => page.evaluate((i) => { const b = document.getElementById(i), r = b.getBoundingClientRect(); return { shown: !b.hidden && r.width > 0, disabled: b.disabled, w: r.width, h: r.height, label: b.getAttribute('aria-label'), svg: !!b.querySelector('svg'), words: b.textContent.trim() }; }, id);
const tip = (page) => page.evaluate(() => { const t = document.getElementById('scrolltip'); return t ? t.textContent : null; });
const where = (page) => state(page, (S) => JSON.stringify([S.entities.fighter.pos, S.timeline.length]));

// A finger held on a button for `ms`, then lifted, as the browser reports it (Playwright has no long press).
async function hold(page, id, ms) {
  const c = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await sleep(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
// Ask for the line the way the device does: rest the mouse on it (3 s) or hold a finger on it (0.5 s).
async function ask(page, touch, id) {
  if (touch) await hold(page, id, 700);
  else { await page.mouse.move(2, 400); await page.hover(`#${id}`); await sleep(3300); }
}
const press = (page, touch, id) => (touch ? page.tap(`#${id}`) : page.click(`#${id}`));

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'wide', ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      await run.do('the clean screen has no Undo or Redo until an action; DM tools has both, as arrows named Undo and Redo, disabled with nothing to do', async () => {
        await open(page, url); await playSolo(page); await closePanels(page);
        const [u0, r0] = [await btn(page, 'btn-undo'), await btn(page, 'btn-redo')];
        if (u0.shown || r0.shown) throw new Error(`the chips show on a clean screen: ${JSON.stringify({ u0, r0 })}`);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        const [u, r] = [await btn(page, 'dm-undo'), await btn(page, 'dm-redo')];
        if (!u.shown || !r.shown) throw new Error(`not both shown: ${JSON.stringify({ u, r })}`);
        if (!u.disabled || !r.disabled) throw new Error('enabled with nothing to take back');
        if (!u.svg || !r.svg) throw new Error('DM tools shows no arrow symbol');
        if (!/^Undo/.test(u.label) || !/^Redo/.test(r.label)) throw new Error(`the names are ${u.label} and ${r.label}`);
        if (/Undo|Redo/.test(u.words.replace(/Nothing/, '')) ) throw new Error(`the row still says the word: ${u.words}`);
        await closeMenu(page);
        if (await tip(page)) throw new Error('a line is showing at rest');
      });
      let start, moved;
      await run.do('after a move the two chips come up beside the token as arrows, at least 44 px; Undo is enabled and Redo is not; the line still is not showing', async () => {
        start = await where(page);
        await selectAndMove(page, touch, 'fighter', 'Brenna');
        moved = await where(page);
        await closePanels(page);
        await wait(page, () => !document.getElementById('btn-undo').disabled);
        const [u, r] = [await btn(page, 'btn-undo'), await btn(page, 'btn-redo')];
        if (!u.shown || !r.shown) throw new Error(`the chips did not come up: ${JSON.stringify({ u, r })}`);
        if (u.w < 44 || u.h < 44 || r.w < 44 || r.h < 44) throw new Error(`under 44px: ${JSON.stringify({ u, r })}`);
        if (!u.svg || !r.svg || u.words || r.words) throw new Error(`not symbols: ${JSON.stringify({ u, r })}`);
        if (!/^Undo/.test(u.label) || !/^Redo/.test(r.label)) throw new Error(`the names are ${u.label} and ${r.label}`);
        if (!r.disabled) throw new Error('Redo is enabled before any undo');
        if (await tip(page)) throw new Error('a line is showing without a hover or a hold');
      });
      await run.do(`${touch ? 'a press-hold' : 'a long hover'} on Undo says what it takes back, and does not undo`, async () => {
        await ask(page, touch, 'btn-undo');
        const t = await tip(page);
        if (!t || !/Undo takes back/.test(t)) throw new Error(`no line: ${t}`);
        await shot(page, `undo-${tag}-hint`);
        if ((await where(page)) !== moved) throw new Error('the hold undid the move');
        await page.keyboard.press('Escape'); await sleep(200);
        if (await tip(page)) throw new Error('the line stayed after Escape');
        if ((await where(page)) !== moved) throw new Error('dismissing the line undid the move');
      });
      await run.do('a tap on Undo takes the move back and Redo comes on', async () => {
        await press(page, touch, 'btn-undo');
        await wait(page, (s) => JSON.stringify([window.hextable.state.entities.fighter.pos, window.hextable.state.timeline.length]) === s, start, 6000).catch(() => { throw new Error('the tap did not undo'); });
        await wait(page, () => !document.getElementById('btn-redo').disabled && document.getElementById('btn-undo').disabled);
        if (await tip(page)) throw new Error('a line showed on a tap');
        await shot(page, `undo-${tag}-after`);
      });
      await run.do(`${touch ? 'a press-hold' : 'a long hover'} on Redo says what it puts back, and does not redo; a tap redoes`, async () => {
        await ask(page, touch, 'btn-redo');
        const t = await tip(page);
        if (!t || !/Redo puts back/.test(t)) throw new Error(`no line: ${t}`);
        await shot(page, `undo-${tag}-redo-hint`);
        if ((await where(page)) !== start) throw new Error('the hold redid the move');
        await page.keyboard.press('Escape'); await sleep(200);
        await press(page, touch, 'btn-redo');
        await wait(page, (s) => JSON.stringify([window.hextable.state.entities.fighter.pos, window.hextable.state.timeline.length]) === s, moved, 6000).catch(() => { throw new Error('the tap did not redo'); });
        await wait(page, () => document.getElementById('btn-redo').disabled);
      });
      await run.do('the chips go again after about 8 s, and the DM tab keeps its Take back box', async () => {
        await page.mouse.move(2, 300); await page.evaluate(() => document.activeElement?.blur?.());      // a mouse resting on a chip, or a key focus in one, keeps it up
        await sleep(9500);
        if ((await btn(page, 'btn-undo')).shown) throw new Error('the chips stayed on the clean screen');
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        if (!(await shown(page, '#dm-undo')) || !(await shown(page, '#dm-redo'))) throw new Error('the Take back box is gone');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

async function players(browser, url) {
  await scenario('a player never sees Undo or Redo', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      await run.do('host a table and let a phone in', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
      });
      await run.do('the host has both in DM tools; the player has neither, chips or row', async () => {
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        for (const id of ['dm-undo', 'dm-redo']) if (!(await btn(host, id)).shown) throw new Error(`the DM has no ${id}`);
        await closeMenu(host);
        for (const id of ['btn-undo', 'btn-redo', 'dm-undo', 'dm-redo']) if ((await btn(phone, id)).shown) throw new Error(`the player sees ${id}`);
        await shot(phone, 'undo-player');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=undobar.
export default async function (browser, url) {
  await solo(browser, url, 'undo bar at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'undo bar at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await players(browser, url);
}
