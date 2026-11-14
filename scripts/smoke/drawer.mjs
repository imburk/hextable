import { join } from 'node:path';
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, tapAt, closeMenu, openTab } from './lib.mjs';

// ---------- the drawer (docs/specs/table-ui.md, Decisions 2 and 3) ----------
// The drawer opens and closes every way the spec lists, at both sizes; the side is a preference; About holds the SRD attribution
// as the SRD gives it; the lobby reaches About before any table; and the tracker lists a fight's turns in the engine's order.
const SRD_TEXT = 'This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
const rectOf = (page, sel) => page.evaluate((x) => { const r = document.querySelector(x).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; }, sel);
async function drawerPass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width < 900;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('the lobby has an About link that opens the drawer above it, with the SRD statement, and closes back to the link', async () => {
        await open(page, url);
        await waitShown(page, '#splash', false, 2000).catch(() => { throw new Error('the splash is still up over the lobby'); });
        await page.click('#lobby-about');
        await waitShown(page, '#drawer'); await waitShown(page, '#about');
        if (!(await page.evaluate(() => { const r = document.getElementById('drawer').getBoundingClientRect(); return document.elementFromPoint(r.left + 40, r.top + 120)?.closest('#drawer') !== null; }))) throw new Error('the drawer is under the lobby');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`About does not carry the SRD statement as given: ${text}`);
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'lobby-about') throw new Error('focus did not return to the About link');
      });
      await run.do('play solo: a burger, a closed drawer, no old panel buttons', async () => {
        await playSolo(page);
        await waitShown(page, '#btn-menu'); await waitShown(page, '#drawer', false);
        for (const id of ['btn-tracker', 'btn-log', 'btn-look', 'btn-dm']) if (await page.$('#' + id)) throw new Error(`#${id} is still on the page`);
        
      });
      await run.do('the burger opens the drawer from the right on Turns, as a dialog, with the party in it', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await sleep(300);
        const r = await rectOf(page, '#drawer');
        if (Math.abs(r.r - r.vw) > 2) throw new Error(`the drawer is not on the right: ${JSON.stringify(r)}`);
        if (r.w > Math.min(0.92 * r.vw, 420) + 1 && phone) throw new Error(`too wide: ${r.w}`);
        if ((await page.getAttribute('#btn-menu', 'aria-expanded')) !== 'true') throw new Error('aria-expanded');
        if ((await page.getAttribute('#drawer', 'role')) !== 'dialog') throw new Error('the drawer is not a dialog over the map');
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li[data-id]').length);
        if (rows < 4) throw new Error(`${rows} rows`);
        const tabs = await page.$$eval('#drawer-tabs [role=tab]:not([hidden])', (b) => b.map((x) => x.firstChild.textContent.trim()));
        if (tabs.join() !== 'Party,Sheet,Log,DM,Settings,About') throw new Error(`tabs: ${tabs}`);
      });
      if (phone) await run.do('on a phone it stops above the dock and the dock stays usable', async () => {
        const d = await rectOf(page, '#drawer'), k = await rectOf(page, '#dock');
        if (d.b > k.t + 1) throw new Error(`the drawer (${d.b}) covers the dock (${k.t})`);
        const hit = await page.evaluate(() => { const r = document.querySelector('#party button').getBoundingClientRect(); return document.elementFromPoint(r.left + 8, r.top + 8)?.closest('#party') !== null; });
        if (!hit) throw new Error('the character chips are not reachable');
      });
      await run.do('the X, Escape and (phone) the scrim or (wide) a click on the map close it, and focus returns to the burger', async () => {
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the burger (X)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the burger (Escape)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        if (phone) await tapAt(page, touch, 12, 300); else await page.mouse.click(300, 300);
        await waitShown(page, '#drawer', false);
        if (!phone) {
          await page.keyboard.press('m'); await waitShown(page, '#drawer');
          await page.keyboard.press('m'); await waitShown(page, '#drawer', false);
        }
      });
      await run.do('a drag away from the side on the header closes it', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.evaluate(() => { const h = document.getElementById('drawer-head'), r = h.getBoundingClientRect(), y = r.top + 20, x = r.left + 60;
          const fire = (t, dx, ms) => h.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x + dx, clientY: y, bubbles: true, isPrimary: true }));
          fire('pointerdown', 0); fire('pointermove', 30); fire('pointermove', 90); fire('pointerup', 90); });
        await waitShown(page, '#drawer', false);
      });
      await run.do('Tab stays inside an open drawer', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('#drawer')))) throw new Error('focus left the drawer');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
      });
      await run.do('arrow keys move along the tabs', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.focus('#tab-turns'); await page.keyboard.press('ArrowRight');
        await wait(page, () => document.getElementById('tab-sheet').getAttribute('aria-selected') === 'true');
        await page.keyboard.press('End');
        await wait(page, () => document.getElementById('tab-about').getAttribute('aria-selected') === 'true');
      });
      await run.do('About holds the SRD statement word for word, the licences and a place for model packs', async () => {
        await waitShown(page, '#about');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`the statement differs: ${text}`);
        const all = await page.$eval('#about', (e) => e.textContent);
        for (const want of ['Hextable contributors', 'three.js authors', 'Model packs', 'Silkscreen', 'Three.js']) if (!all.includes(want)) throw new Error(`About lacks ${want}`);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-about-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('Settings holds the preferences, and the side is one of them: left puts the drawer and the burger on the left', async () => {
        await page.click('#tab-settings'); await waitShown(page, '#settings');
        for (const id of ['set-theme', 'dice-show', 'pace-pick', 'dice-auto-mine', 'set-side', 'set-floors', 'dm-dice-monsters']) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not in Settings`);
        await page.selectOption('#set-side', 'left'); await sleep(400);
        const r = await rectOf(page, '#drawer');
        if (r.l > 2) throw new Error(`not on the left: ${JSON.stringify(r)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.drawerSide'))) !== '"left"') throw new Error('the side was not stored');
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
        const b = await rectOf(page, '#btn-menu');
        if (b.l > b.vw / 2) throw new Error('the burger did not move to the left');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-left-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
        await page.click('#tab-settings'); await page.selectOption('#set-side', 'right'); await sleep(400);
        await page.click('#drawer-close'); await waitShown(page, '#drawer', false);
      });
      await run.do('a theme chosen in Settings applies and is stored; the look of floors is stored too', async () => {
        await openTab(page, 'settings');
        const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        await page.selectOption('#set-theme', 'sunlit');
        const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        if (before === after || (await page.evaluate(() => localStorage.getItem('hextable.theme'))) !== '"sunlit"') throw new Error('the theme did not change');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-sunlit-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
        await page.selectOption('#set-floors', 'hex');
        if ((await page.evaluate(() => localStorage.getItem('hextable.floors'))) !== '"hex"') throw new Error('floors was not stored');
        await page.selectOption('#set-floors', 'rooms'); await page.selectOption('#set-theme', 'classic');
        await closeMenu(page);
      });
      if (!phone) await run.do('pinned, the drawer stays open and the map makes room for it', async () => {
        await openTab(page, 'turns');
        await page.click('#drawer-pin'); await sleep(300);
        const c = await rectOf(page, '#gl'), d = await rectOf(page, '#drawer');
        if (Math.abs(c.w - (c.vw - d.w)) > 2) throw new Error(`the canvas (${c.w}) did not give way to the drawer (${d.w})`);
        if ((await page.getAttribute('#drawer', 'role')) !== 'complementary') throw new Error('a pinned drawer is a landmark, not a dialog');
        await page.mouse.click(300, 300); await sleep(200);
        if (!(await shown(page, '#drawer'))) throw new Error('a click on the map closed a pinned drawer');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-pinned.png` : '/dev/null' }).catch(() => {});
        await page.click('#drawer-pin'); await sleep(300);
        const c2 = await rectOf(page, '#gl');
        if (c2.w !== c2.vw) throw new Error('the canvas did not come back');
        await closeMenu(page);
      });
      await run.do('a reaction question hides the drawer for as long as it is asked, and gives it back after', async () => {
        await openTab(page, 'turns');
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync({ ...h.state, prompt: { waiting: true } }); });
        await waitShown(page, '#drawer', false);
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync(h.state); });
        await waitShown(page, '#drawer');
        await closeMenu(page);
      });
      await run.do('in a fight the tracker lists the turns in the engine\'s order, top to bottom, with initiative and the turn marked', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const h = window.hextable, S = h.state, foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden); h.act({ type: 'startEncounter', center: foe.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await openTab(page, 'turns'); await sleep(300);
        const got = await page.evaluate(() => [...document.querySelectorAll('#tr-list li[data-id]')].map((l) => l.dataset.id));
        const want = await state(page, (S) => S.encounter.order.map((o) => o.id));
        if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`rows ${got} are not the order ${want}`);
        const tops = await page.evaluate(() => [...document.querySelectorAll('#tr-list li')].map((l) => Math.round(l.getBoundingClientRect().top)));
        if (tops.some((t, i) => i && t <= tops[i - 1])) throw new Error('the rows are not stacked top to bottom');
        const now = await page.evaluate(() => { const l = document.querySelector('#tr-list li[aria-current="step"]'); return l?.dataset.id; });
        if (now !== await state(page, (S) => S.encounter.order[S.encounter.turn].id)) throw new Error('the current turn is not marked');
        const inits = await page.evaluate(() => [...document.querySelectorAll('#tr-list .tr-init')].map((x) => x.textContent.trim()));
        const wantInit = await state(page, (S) => S.encounter.order.map((o) => String(o.init)));
        if (JSON.stringify(inits) !== JSON.stringify(wantInit)) throw new Error(`initiative ${inits} is not ${wantInit}`);
        if ((await page.$eval('#tr-title', (e) => e.textContent)) !== 'Round 1') throw new Error('the round');
        if ((await page.$eval('#tab-turns', (e) => e.textContent.trim())) !== 'Turns') throw new Error('the tab is not called Turns in a fight');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-turns-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('a tap on a row selects that creature, and on a phone closes the drawer; the order strip opens it again', async () => {
        const id = await state(page, (S) => S.encounter.order.at(-1).id);
        if (phone) await page.tap(`#tr-list li[data-id="${id}"] .tr-main`); else await page.click(`#tr-list li[data-id="${id}"] .tr-main`);
        await wait(page, (i) => window.hextable.state && document.querySelector('#c-name')?.textContent === window.hextable.state.entities[i].name, id);
        if (phone) await waitShown(page, '#drawer', false);
        else { await closeMenu(page); }
        await page.click('#order li'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

// What a player's tracker may show: a DM and a phone player, a fight with a creature the party cannot see taking its turn.
async function drawerTable(browser, url) {
  await scenario('the tracker at a table: a player sees what the view sent and no more', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let code;
      await run.do('host, join from the phone, let it in', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        await b.click();
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.owner));
      });
      let secret;
      await run.do('a fight with an invisible creature that the party cannot see', async () => {
        secret = await host.evaluate(async () => {
          const h = window.hextable; document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'sight', value: 'light' });
          const S = h.state, known = new Set(Object.keys(S.entities)), foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden);
          h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: foe.pos.q + 1, r: foe.pos.r } });
          let sp = null;
          for (let i = 0; i < 40 && !sp; i++) { await new Promise((r) => setTimeout(r, 100)); sp = Object.values(h.state.entities).find((e) => !known.has(e.id)); }
          if (!sp) return null;
          h.act({ type: 'condition', actor: sp.id, condition: 'invisible' });
          h.act({ type: 'place', actor: 'fighter', to: { q: foe.pos.q - 1, r: foe.pos.r } });       // a party member in the fight, or it ends at once
          h.act({ type: 'startEncounter', center: foe.pos });
          return { id: sp.id, name: sp.name };
        });
        if (!secret) throw new Error('no creature was made');
        await wait(phone, () => !!window.hextable.state.encounter);
        if (await state(phone, (S, i) => !!S.entities[i], secret.id)) throw new Error('the phone was sent the invisible creature');
      });
      await run.do('the DM\'s tracker lists everyone in order, the invisible one too; the phone\'s lists only what it was sent', async () => {
        await openTab(host, 'turns'); await openTab(phone, 'turns'); await sleep(300);
        const dmRows = await host.evaluate(() => [...document.querySelectorAll('#tr-list li[data-id]')].map((l) => l.dataset.id));
        const dmOrder = await state(host, (S) => S.encounter.order.map((o) => o.id));
        if (JSON.stringify(dmRows) !== JSON.stringify(dmOrder)) throw new Error('the DM tracker is not the order');
        if (!dmRows.includes(secret.id)) throw new Error(`the DM's tracker lacks the invisible creature ${secret.id}: ${dmRows}`);
        const html = await phone.$eval('#tracker', (e) => e.innerHTML);
        if (html.includes(`data-id="${secret.id}"`)) throw new Error('the invisible creature\'s id reached the phone\'s tracker');
        const rows = await phone.evaluate(() => [...document.querySelectorAll('#tr-list li')].map((l) => ({ id: l.dataset.id ?? null, text: l.textContent.replace(/\s+/g, ' ').trim() })));
        const order = await state(phone, (S) => S.encounter.order);
        if (rows.length !== order.length) throw new Error(`the phone's tracker has ${rows.length} rows for ${order.length} turns`);
        const names = await state(phone, (S) => Object.values(S.entities).map((e) => e.name));
        if (!names.includes(secret.name)) { /* a name shared with a visible goblin is fine: the id is what is checked above */ }
        const foeNums = await phone.$$eval('#tr-list li[data-side="foe"] .tr-hp span:last-child', (x) => x.map((e) => e.textContent.trim()));
        if (foeNums.some((t) => /\d/.test(t))) throw new Error(`a number for a foe reached the phone: ${foeNums}`);
        await phone.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-table-phone.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('when the invisible creature takes its turn the phone has one ghost row and no name', async () => {
        for (let i = 0; i < 30; i++) {
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn].id ?? null; });
          if (cur === null) throw new Error('the fight ended before the invisible creature had a turn');
          if (cur === secret.id) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(host, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(phone, () => window.hextable.state.encounter.order.some((o) => o.someone), null, 10000);
        await sleep(400);
        const ghosts = await phone.$$eval('#tr-list li.tr-ghost', (x) => x.map((l) => ({ text: l.textContent.replace(/\s+/g, ' ').trim(), now: l.classList.contains('now'), tag: l.querySelector('button') ? 'button' : 'none' })));
        if (ghosts.length !== 1 || !/unseen/.test(ghosts[0].text) || !ghosts[0].now || ghosts[0].tag !== 'none') throw new Error(`the ghost row: ${JSON.stringify(ghosts)}`);
        const live = await phone.$eval('#drawer-live', (e) => e.textContent);
        if (!/unseen/.test(live) || live.includes(secret.name.split(' ')[0] + '\'s')) throw new Error(`the live region said: ${live}`);
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=drawer.
export default async function (browser, url) {
  await drawerPass(browser, url, 'drawer at 1280x800', { viewport: { width: 1280, height: 800 } });
  await drawerPass(browser, url, 'drawer at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await drawerTable(browser, url);
}
