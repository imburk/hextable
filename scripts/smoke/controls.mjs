import { fileURLToPath } from 'node:url';
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, closePanels, openTab } from './lib.mjs';

// ---------- table controls (issue #163) ----------
// The DM's pace setting, the stock maps (lobby and DM panel, asking before a map replaces a game) and the import report kept in the
// chronicle with a line on the sheet. Solo, then a DM with a phone player, who must see the pace and nothing of the report.
async function controlsSolo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      const openDM = async () => { await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm'); };
      await run.do('the lobby offers the stock maps and solo starts on the one chosen', async () => {
        await open(page, url);
        const opts2 = await page.$$eval('#lobby-map option', (o) => o.map((x) => x.value));
        if (opts2.length !== 7 || opts2[0] !== '') throw new Error(`lobby maps: ${opts2}`);
        await shot('controls-lobby');
        await page.selectOption('#lobby-map', 'cave');
        await playSolo(page);
        await wait(page, () => window.hextable.state.map.id === 'cave');
        if (await state(page, (S) => Object.values(S.entities).filter((e) => e.side === 'party').length) < 1) throw new Error('no party');
      });
      await run.do('the DM sets the pace, and the table keeps it', async () => {
        await openDM();
        await page.selectOption('#dm-pace', 'flow');
        await wait(page, () => window.hextable.state.settings.pace === 'flow');
        await page.selectOption('#dm-pace', 'instant');
        await wait(page, () => window.hextable.state.settings.pace === 'instant');
        if (!/instant/.test(await page.$eval('#pace-table', (e) => e.textContent))) throw new Error('the pace line did not follow');
        await shot('controls-dm');
      });
      await run.do('a map over a game in progress asks first, then loads', async () => {
        await page.selectOption('#dm-stock', 'tavern');
        await tap(page, '#dm-stock-go');
        if ((await state(page, (S) => S.map.id)) === 'tavern') throw new Error('one tap loaded the map');
        await waitShown(page, '#dm-stock-ask');
        const ask = await page.$eval('#dm-stock-ask', (e) => e.textContent);
        if (!/Copper Kettle/.test(ask)) throw new Error(`the question: ${ask}`);
        await shot('controls-ask');
        await tap(page, '#dm-stock-go');
        await wait(page, () => window.hextable.state.map.id === 'tavern');
        await page.selectOption('#dm-stock', 'keep');                       // choosing another map cancels the question
        await tap(page, '#dm-stock-go'); await page.selectOption('#dm-stock', 'dungeon');
        if (await shown(page, '#dm-stock-ask')) throw new Error('changing the choice did not cancel the question');
        await sleep(300);
        if ((await state(page, (S) => S.map.id)) !== 'tavern') throw new Error('the map changed without a second tap');
      });
      await run.do('the import says only the DM can import, and the report lands in the chronicle by itself', async () => {
        await closePanels(page); await openDM();
        await waitShown(page, '#dm-qe .fgi-open');
        await page.evaluate(() => { document.querySelector('#fgi-file').value = ''; });
        await page.setInputFiles('#fgi-file', fileURLToPath(new URL('../../packages/rules/test/fixtures/fgxml-cleric.xml', import.meta.url)));
        await waitShown(page, '#fgi-summary');
        if (!/Only the DM can import/.test(await page.$eval('#fgi-dm-only', (e) => e.textContent))) throw new Error('no DM-only line');
        if (await page.$('#fgi-chron')) throw new Error('the report is still a choice');
        await shot('controls-import');
        await tap(page, '#fgi-add');
        await waitShown(page, '#fgi', false);
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'chronicle' && e.title === 'Mira Testwell' && /Divine Order/.test(e.text) && !e.public && e.tags?.includes('fg-import')));
      });
      await run.do("the character's sheet says where the report is", async () => {
        await closePanels(page);
        const id = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').id);
        await page.evaluate((i) => window.hextable.select(i), id);
        await waitShown(page, '#btn-sheet'); await tap(page, '#btn-sheet');
        await waitShown(page, '#sheet-import');
        const t = await page.$eval('#sheet-import', (e) => e.textContent);
        if (!/chronicle/.test(t) || !/Mira Testwell/.test(t)) throw new Error(t);
        await shot('controls-sheet');
        const other = await state(page, (S) => Object.values(S.entities).find((e) => e.kind === 'pc' && e.name !== 'Mira Testwell').id);
        await page.evaluate((i) => window.hextable.select(i), other);
        await wait(page, () => !document.querySelector('#sheet-import'));
      });
    } finally { await ctx.close(); }
  });
}

async function controlsTable(browser, url) {
  await scenario('controls: a DM hosts on a map, a phone player sees the pace and none of the report', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(phone, ' (phone)');
      const frames = [];
      phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
      let code;
      await run.do('the DM hosts on the dungeon and a phone joins', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM');
        await host.selectOption('#lobby-map', 'dungeon');
        await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6, null, 20000);
        await wait(host, () => window.hextable.state.map.id === 'dungeon');
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.map?.id === 'dungeon');
      });
      await run.do('the DM sets the pace and the phone sees it but cannot change it', async () => {
        await host.selectOption('#dm-pace', 'flow');
        await wait(phone, () => window.hextable.state.settings.pace === 'flow');
        await openTab(phone, 'settings');
        await wait(phone, () => /flow/.test(document.querySelector('#pace-table').textContent));
        if (!/Only the DM/.test(await phone.$eval('#pace-table', (e) => e.textContent))) throw new Error('the phone is not told it cannot change it');
        if (await phone.$('#dm-pace:not([hidden])') && (await shown(phone, '#dm-pace'))) throw new Error('the phone can see the DM control');
        await phone.evaluate(() => window.hextable.act({ type: 'setting', key: 'pace', value: 'instant' }));
        await sleep(600);
        if ((await state(phone, (S) => S.settings.pace)) !== 'flow') throw new Error('a player changed the pace');
        await phone.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/controls-phone-pace.png` : '/dev/null' }).catch(() => {});
        await closeMenu(phone);
      });
      await run.do('the DM loads another stock map after being asked; the phone follows', async () => {
        await host.selectOption('#dm-stock', 'forest-road');
        await host.click('#dm-stock-go');
        if ((await state(host, (S) => S.map.id)) !== 'dungeon') throw new Error('one tap loaded it');
        await host.click('#dm-stock-go');
        await wait(host, () => window.hextable.state.map.id === 'forest-road');
        await wait(phone, () => window.hextable.state.map.id === 'forest-road');
      });
      await run.do('an import writes a DM-only chronicle entry that no player is sent', async () => {
        await host.evaluate(() => { document.querySelector('#fgi-file').value = ''; });
        await host.setInputFiles('#fgi-file', fileURLToPath(new URL('../../packages/rules/test/fixtures/fgxml-cleric.xml', import.meta.url)));
        await waitShown(host, '#fgi-summary');
        await host.click('#fgi-add');
        await waitShown(host, '#fgi', false);
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Mira Testwell'));
        await sleep(500);
        await closeMenu(host).catch(() => {});
        // The DM's sheet line is there after the history has come back.
        const id = await state(host, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').id);
        await host.evaluate((i) => window.hextable.select(i), id);
        await waitShown(host, '#btn-sheet'); await host.click('#btn-sheet');
        await wait(host, () => document.querySelector('#sheet-import'));
        // What the phone has been sent, live: nothing of the report. And what it gets when it asks for the record.
        const leak = frames.find((f) => /fg-import|Imported from Fantasy|ADJUSTMENTS|"chronicle"/.test(f));
        if (leak) throw new Error(`the phone was sent the report: ${leak.match(/.{0,60}(fg-import|Imported from Fantasy|ADJUSTMENTS|"chronicle").{0,60}/)?.[0]}`);
        const asked = await phone.evaluate(() => new Promise((resolve) => {
          const sess = JSON.parse(localStorage.getItem('hextable.session')), got = [];
          const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
          ws.onopen = () => ws.send(JSON.stringify({ t: 'resume', ...sess }));
          ws.onmessage = (m) => { got.push(m.data); if (JSON.parse(m.data).t === 'welcome') { ws.send(JSON.stringify({ t: 'history', types: ['chronicle'], limit: 200 })); ws.send(JSON.stringify({ t: 'history', limit: 500 })); } };
          setTimeout(() => { ws.close(); resolve(got); }, 1500);
        }));
        if (!asked.some((f) => JSON.parse(f).t === 'history')) throw new Error('the phone got no history answer to check');
        if (asked.some((f) => /fg-import|Imported from Fantasy|ADJUSTMENTS/.test(f))) throw new Error('the phone got the report from the history');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=controls.
export default async function (browser, url) {
  await controlsSolo(browser, url, 'controls at 1280x800', { viewport: { width: 1280, height: 800 } });
  await controlsSolo(browser, url, 'controls at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await controlsTable(browser, url);
}
