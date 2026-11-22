import { scenario, wait, state, shown, open, playSolo, sleep, waitShown, closeMenu, openTab, spotsFor } from './lib.mjs';

// ---------- the DM's monster finder (#673) ----------
// Above the "Add ..." buttons: a search box (name or type), a CR filter and the last six monsters added at this table. Checked at 1280x800 with a
// mouse and at 390x844 with touch, with the phone's keyboard taking half the screen.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const names = (page) => page.$$eval('#dm-spawn [data-monster]', (b) => b.map((x) => x.textContent.replace(/^Add /, '')));
const count = (page) => page.$$eval('#dm-spawn [data-monster]', (b) => b.length);
const recents = (page) => page.$$eval('.sf-recent [data-recent]', (b) => b.map((x) => x.textContent));
const press = (page, touch, sel) => (touch ? page.tap(sel) : page.click(sel));
const typeIn = async (page, text) => { await page.fill('.sf-q', text); await sleep(80); };

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'wide', ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      await run.do('the DM tab has a search box, five CR buttons and no recent row yet, over the whole list in a window of its own', async () => {
        await open(page, url); await playSolo(page); await openTab(page, 'dm');
        await page.locator('.spawn-find').scrollIntoViewIfNeeded();
        for (const s of ['.sf-q', '.sf-bands']) if (!(await shown(page, s))) throw new Error(`${s} is not showing`);
        if ((await page.$$('.sf-band')).length !== 5) throw new Error('not five CR buttons');
        if (await shown(page, '.sf-recent')) throw new Error('a recent row with nothing added');
        if ((await count(page)) < 300) throw new Error(`only ${await count(page)} buttons with nothing asked`);
        const h = await page.$eval('#dm-spawn', (e) => e.getBoundingClientRect().height);
        if (h > 400) throw new Error(`the list is ${h}px tall: the section is still a long page`);
        if (touch) for (const s of ['.sf-q', '.sf-band', '#dm-spawn button']) { const r = await page.$eval(s, (e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }); if (r[1] < 44) throw new Error(`${s} is ${r[1]}px tall`); }
        await shot(page, `spawn-${tag}-1-list`);
      });
      await run.do('a search finds a name, a part of a name and a type, and says so when nothing matches', async () => {
        await typeIn(page, 'ghoul');
        if (!(await names(page)).includes('Ghoul')) throw new Error('no Ghoul for "ghoul"');
        await typeIn(page, 'UNDEAD');
        const u = await names(page);
        if (!u.includes('Ghoul') || !u.includes('Zombie') || u.includes('Aboleth') || u.length > 40) throw new Error(`"undead" gave ${u.length}: ${u.slice(0, 8)}`);
        await typeIn(page, 'zzzz');
        if ((await count(page)) !== 0 || !/No monster matches/.test(await page.textContent('.sf-count'))) throw new Error('no word for an empty result');
        await shot(page, `spawn-${tag}-2-none`);
      });
      await run.do('the CR buttons narrow the list, with the search, and All CRs puts it back', async () => {
        await typeIn(page, '');
        const all = await count(page);
        await press(page, touch, '.sf-band[data-band="high"]');
        const hi = await count(page), hiNames = await names(page);
        if (!hi || hi >= all || hiNames.includes('Ghoul') || !hiNames.includes('Aboleth')) throw new Error(`5+ gave ${hi} of ${all}`);
        if ((await page.getAttribute('.sf-band[data-band="high"]', 'aria-pressed')) !== 'true') throw new Error('the pressed button does not say so');
        await press(page, touch, '.sf-band[data-band="mid"]');
        if (!(await names(page)).includes('Ghoul')) throw new Error('Ghoul (CR 1) is not in 1/2-1');
        await typeIn(page, 'undead');
        const m = await names(page);
        if (!m.includes('Ghoul') || m.includes('Aboleth') || m.includes('Wight')) throw new Error(`1/2-1 and undead gave ${m}`);
        await shot(page, `spawn-${tag}-3-filtered`);
        await typeIn(page, ''); await press(page, touch, '.sf-band[data-band="all"]');
        if ((await count(page)) !== all) throw new Error('All CRs did not bring the list back');
      });
      await run.do('picking a monster closes the menu, and a tap on the map adds it', async () => {
        await typeIn(page, 'ghoul');
        await press(page, touch, '#dm-spawn [data-monster="ghoul"]');
        await waitShown(page, '#drawer', false);
        await wait(page, () => window.hextable.mode.kind === 'spawn');
        const { spots } = await spotsFor(page, 'ghoul', { near: 'fighter' });
        if (!spots.length) throw new Error('no hex takes a ghoul');
        const before = await state(page, (S) => Object.keys(S.entities).length);
        await page.evaluate((hex) => window.hextable.R.onTap({ hex, id: null }), spots[0]);
        await wait(page, (n) => Object.keys(window.hextable.state.entities).length > n, before);
      });
      await run.do('the recent row has it, newest first, and a second monster goes in front', async () => {
        await openTab(page, 'dm'); await page.locator('.spawn-find').scrollIntoViewIfNeeded();
        if ((await recents(page)).join() !== 'Ghoul') throw new Error(`recent: ${await recents(page)}`);
        await typeIn(page, 'goblin warrior');
        await press(page, touch, '#dm-spawn [data-monster="goblin-warrior"]');
        await waitShown(page, '#drawer', false);
        const { spots } = await spotsFor(page, 'goblin-warrior', { near: 'fighter' });
        const before = await state(page, (S) => Object.keys(S.entities).length);
        await page.evaluate((hex) => window.hextable.R.onTap({ hex, id: null }), spots[0]);
        await wait(page, (n) => Object.keys(window.hextable.state.entities).length > n, before);
        await openTab(page, 'dm'); await page.locator('.spawn-find').scrollIntoViewIfNeeded();
        if ((await recents(page)).join() !== 'Goblin Warrior,Ghoul') throw new Error(`recent: ${await recents(page)}`);
        await shot(page, `spawn-${tag}-4-recent`);
      });
      await run.do('a recent button adds that monster too, and the row is kept on this device', async () => {
        await press(page, touch, '.sf-recent [data-recent="ghoul"]');
        await waitShown(page, '#drawer', false);
        await wait(page, () => window.hextable.mode.kind === 'spawn' && window.hextable.mode.monster === 'ghoul');
        await page.keyboard.press('Escape');
        const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('hextable.recent.monsters.')).map(([, v]) => JSON.parse(v)));
        if (saved.length !== 1 || saved[0].join() !== 'goblin-warrior,ghoul') throw new Error(`saved: ${JSON.stringify(saved)}`);
      });
      await run.do('with storage refusing every read and write the finder still works and nothing errors', async () => {
        await page.evaluate(() => { const no = () => { throw new Error('storage is off'); }; Storage.prototype.getItem = no; Storage.prototype.setItem = no; Storage.prototype.removeItem = no; });
        await openTab(page, 'dm'); await page.locator('.spawn-find').scrollIntoViewIfNeeded();
        await typeIn(page, 'ogre');
        await press(page, touch, '#dm-spawn [data-monster="ogre"]');
        await waitShown(page, '#drawer', false);
        const { spots } = await spotsFor(page, 'ogre', { near: 'fighter' });
        const before = await state(page, (S) => Object.keys(S.entities).length);
        await page.evaluate((hex) => window.hextable.R.onTap({ hex, id: null }), spots[0]);
        await wait(page, (n) => Object.keys(window.hextable.state.entities).length > n, before);
      });
      if (touch) await run.do('with the keyboard up (a 390x480 screen) the box and the first result are on screen and not under the dock, and Enter closes it', async () => {
        await openTab(page, 'dm'); await page.locator('.spawn-find').scrollIntoViewIfNeeded();
        await page.setViewportSize({ width: 390, height: 480 });
        await page.tap('.sf-q'); await typeIn(page, 'wolf'); await sleep(900);
        const r = await page.evaluate(() => { const q = document.querySelector('.sf-q').getBoundingClientRect(), b = document.querySelector('#dm-spawn button')?.getBoundingClientRect(); return { qt: q.top, qb: q.bottom, bt: b?.top, bb: b?.bottom, vh: innerHeight, hit: b ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('#dm-spawn') !== null : false, top: b ? (() => { const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e ? `${e.tagName}#${e.id}.${e.className}` : null; })() : null }; });
        if (r.qt < 0 || r.bt == null || r.bb > r.vh || r.bt < r.qb || !r.hit) throw new Error(`the box and a result are not both in view: ${JSON.stringify(r)}`);
        await shot(page, 'spawn-phone-5-keyboard');
        await page.keyboard.press('Enter');
        if (await page.evaluate(() => document.activeElement?.classList.contains('sf-q'))) throw new Error('Enter left the keyboard up');
        await page.setViewportSize({ width: 390, height: 844 });
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=spawnfind.
export default async function (browser, url) {
  await solo(browser, url, 'monster finder at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'monster finder at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
