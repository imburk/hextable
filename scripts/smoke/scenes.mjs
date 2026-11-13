import { join } from 'node:path';
import { sleep, scenario, wait, shown, waitShown, open, closeMenu, openTab } from './lib.mjs';

// ---------- scenes ----------
// The scene screen (packages/client/scenes.js): a DM and a phone. Prepare, open, speak, undo, step out.
async function scenes(browser, url) {
  await scenario('scenes: the DM prepares and opens one, a phone speaks in it', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      const SECRET = 'secret-notes-xyzzy';
      const heard = [], hostHeard = [];          // every event each is sent, read off its WebSocket (neither has a timeline of its own)
      host.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) hostHeard.push(...m.events); } catch { /* not JSON */ } }));
      const hostGot = async (k, test, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (hostHeard.slice(k).some(test)) return true; await sleep(100); } return false; };
      phone.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) heard.push(...m.events); } catch { /* not JSON */ } }));
      const lines = (page) => page.evaluate(() => [...document.querySelectorAll('#sc-lines li[data-line]')].map((li) => li.textContent));
      const sees = (page, text, on = true) => wait(page, ([t, want]) => [...document.querySelectorAll('#sc-lines li[data-line]')].some((li) => li.textContent.includes(t)) === want, [text, on], 8000);

      await run.do('host, join, let in, claim a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Scene DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Scene Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        await b.click();
        await wait(phone, (n) => Object.values(window.hextable.state.entities).some((e) => e.name === n && e.owner), name);
      });

      await run.do('the DM prepares a scene: the DM sees it, the phone is sent nothing', async () => {
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.fill('#sc-new-title', 'The mayor\'s study');
        await host.click('#sc-new-prep');
        await wait(host, () => window.hextable.state.scene && window.hextable.state.scene.open === false);
        await closeMenu(host);       // the scene's own panel is what the DM works in now
        await waitShown(host, '#scene'); await waitShown(host, '#sc-prep');
        await sleep(400);
        if (await phone.evaluate(() => window.hextable.state.scene !== null)) throw new Error('the phone was sent a prepared scene');
        if (await shown(phone, '#scene')) throw new Error('the phone shows a prepared scene');
      });

      await run.do('the DM adds someone with notes, and opens the scene', async () => {
        await host.click('#sc-people [data-npc=""]');
        await host.fill('#sc-npc-name', 'Mayor Orsolya');
        await host.fill('#sc-npc-notes', SECRET);
        await host.click('#sc-npc-save');
        await wait(host, () => window.hextable.state.scene.present.length === 1);
        await host.click('#sc-go');
        await wait(host, () => window.hextable.state.scene.open === true);
        await wait(phone, () => window.hextable.state.scene?.open === true);
        await waitShown(phone, '#scene');
        const leaked = await phone.evaluate((k) => JSON.stringify(window.hextable.state).includes(k) || document.body.innerText.includes(k) || document.documentElement.innerHTML.includes(k), SECRET);
        if (leaked) throw new Error('the DM\'s notes reached the phone');
        const names = await phone.evaluate(() => [...document.querySelectorAll('#sc-people li')].map((li) => li.textContent));
        if (!names.some((n) => n.includes('Mayor Orsolya'))) throw new Error(`the phone does not list the NPC: ${names}`);
        if (await shown(phone, '#sc-tools')) throw new Error('the phone has the DM\'s tools');
      });

      await run.do('the DM speaks as the NPC and the phone sees it', async () => {
        await host.selectOption('#sc-as', { label: 'Mayor Orsolya' });
        await host.fill('#sc-text', 'Welcome, travellers.');
        await host.click('#sc-say button[type=submit]');
        await sees(phone, 'Mayor Orsolya'); await sees(phone, 'Welcome, travellers.');
      });

      await run.do('the phone speaks as its character; its box is not under the keyboard line', async () => {
        await phone.fill('#sc-text', 'We come in peace.');
        await phone.locator('#sc-say button[type=submit]').tap();
        await sees(host, 'We come in peace.'); await sees(phone, 'We come in peace.');
        const r = await phone.evaluate(() => { const b = document.getElementById('sc-say').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight }; });
        if (r.bottom > r.h || r.top < 0) throw new Error(`the box to speak in is off screen: ${JSON.stringify(r)}`);
      });

      await run.do('taking back a line removes it from the phone too', async () => {
        await host.fill('#sc-text', 'Oops, wrong line.');
        await host.click('#sc-say button[type=submit]');
        await sees(phone, 'Oops, wrong line.');
        await host.click('#btn-undo');
        await sees(phone, 'Oops, wrong line.', false); await sees(host, 'Oops, wrong line.', false);
        const l = await lines(phone);
        if (l.length !== 2) throw new Error(`expected two lines on the phone, found ${l.length}`);
      });

      await run.do('the DM calls for a check: it is rolled, and the phone is never sent the DC', async () => {
        await host.click('#sc-tools');
        const who = await host.evaluate(() => window.hextable.state.entities.fighter.name);
        await host.selectOption('#sc-call-who', { label: who });
        await host.selectOption('#sc-call-skill', 'insight');
        await host.fill('#sc-call-dc', '12');
        const n = hostHeard.length;
        await host.click('#sc-call button[type=submit]');
        if (!(await hostGot(n, (e) => e.type === 'check' && e.skill === 'insight' && e.dc === 12))) throw new Error('the DM was not sent the check');
        await wait(phone, () => window.hextable.waiting === 0, null, 15000);
        const seen = heard.filter((e) => e.type === 'check');
        if (!seen.length) throw new Error('the phone was told nothing of the check');
        if (seen.some((e) => e.dc !== undefined)) throw new Error(`the phone was sent the DC: ${JSON.stringify(seen)}`);
        await host.click('#sc-tools');
      });

      await run.do('a player asks for a check: the DM sees the request, answers it with a DC, and a second is turned down', async () => {
        await phone.locator('#sc-ask').tap();
        await waitShown(phone, '#sc-skills');
        await phone.locator('#sc-skills [data-skill="perception"]').tap();
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 1);
        const said = await host.evaluate(() => document.querySelector('#sc-asks li').textContent);
        if (!/asks for Perception/.test(said)) throw new Error(`the request reads "${said}"`);
        const n = hostHeard.length;
        await host.fill('#sc-asks li input', '10');
        await host.click('#sc-asks [data-roll]');
        if (!(await hostGot(n, (e) => e.type === 'check' && e.skill === 'perception' && e.dc === 10))) throw new Error('the answered request was not rolled with its DC');
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 0);
        await phone.locator('#sc-ask').tap();
        await phone.locator('#sc-skills [data-skill="history"]').tap();
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 1);
        const m = hostHeard.length;
        await host.click('#sc-asks [data-drop]');
        await wait(host, () => document.querySelectorAll('#sc-asks li[data-i]').length === 0);
        await sleep(300);
        if (hostHeard.slice(m).some((e) => e.type === 'check')) throw new Error('a request turned down was rolled anyway');
      });

      await run.do('the chronicle: pick two lines, write them, and they land (the phone is not sent them)', async () => {
        const nums = await host.evaluate(() => [...document.querySelectorAll('#sc-lines li[data-line]')].map((li) => li.dataset.line));
        if (nums.length < 2) throw new Error('fewer than two lines to pick');
        await host.click(`#sc-lines li[data-line="${nums[0]}"]`);
        await waitShown(host, '#sc-chron');
        if (!/Line /.test(await host.evaluate(() => document.getElementById('sc-chron-what').textContent))) throw new Error('one line picked, and the form does not say so');
        await host.click(`#sc-lines li[data-line="${nums[1]}"]`);
        await wait(host, () => /Lines \d+ to \d+/.test(document.getElementById('sc-chron-what').textContent));
        await host.fill('#sc-chron-title', 'Meeting the mayor');
        const n = hostHeard.length;
        await host.click('#sc-chron button[type=submit]');
        if (!(await hostGot(n, (e) => e.type === 'chronicle' && e.title === 'Meeting the mayor' && /Welcome, travellers/.test(e.text) && /We come in peace/.test(e.text) && e.scene))) throw new Error('the entry did not land with both lines');
        await waitShown(host, '#sc-chron', false);
        await host.click('#sc-tools'); await host.click('#sc-tools');          // keep the tools as they were
        await sleep(300);
        if (heard.some((e) => e.type === 'chronicle')) throw new Error('the phone was sent a chronicle entry that was not public');
      });

      await run.do('a player who speaks too fast is refused and told so', async () => {
        // The connection allows 5 messages a second, the table 30 lines a minute: send under the first, over the second
        // (36, so the limit is passed even when a slow machine has let the earlier lines age out of the minute).
        await phone.evaluate(() => { let i = 0; const t = setInterval(() => { window.hextable.act({ type: 'say', as: null, text: `spam ${i}` }); if (++i >= 36) clearInterval(t); }, 230); });
        try { await wait(phone, () => /too fast/i.test(document.getElementById('toast')?.textContent ?? ''), null, 45000); }
        catch { throw new Error(`no refusal shown; the toast says "${await phone.evaluate(() => document.getElementById('toast')?.textContent ?? '')}", ${await phone.evaluate(() => document.querySelectorAll('#sc-lines li[data-line]').length)} lines shown`); }
      });

      await run.do('the DM steps out to the map: the phone leaves the scene', async () => {
        await host.click('#sc-tools');
        await host.click('#sc-out');
        await wait(phone, () => window.hextable.state.scene === null);
        await waitShown(phone, '#scene', false);
        await wait(host, () => window.hextable.state.scene?.open === false);
        await waitShown(host, '#btn-scene');
      });

      // A scene has no turns: a fight ends one that is open, leaves one that is prepared alone, and the table cannot
      // open one during a fight (packages/rules/src/scenes.js).
      const startFight = async () => {
        const n = hostHeard.length;
        await host.evaluate(() => { const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden); window.hextable.act({ type: 'startEncounter', center: f.pos }); });
        await wait(host, () => !!window.hextable.state.encounter, null, 10000);
        await wait(phone, () => !!window.hextable.state.encounter, null, 10000);
        return n;
      };
      const endFight = async () => {
        await host.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(host, () => !window.hextable.state.encounter, null, 15000);
        await wait(phone, () => !window.hextable.state.encounter, null, 15000);
      };

      await run.do('a fight starts with the scene only prepared: it stays prepared, and cannot be opened until the fight ends', async () => {
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('no prepared scene to start with');
        await startFight();
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('the fight took the prepared scene away');
        if (await phone.evaluate(() => window.hextable.state.scene !== null)) throw new Error('the phone was sent the prepared scene by the fight');
        await host.evaluate(() => { document.getElementById('toast').textContent = ''; window.hextable.act({ type: 'scene', scene: { open: true } }); });
        await wait(host, () => /no turns/i.test(document.getElementById('toast')?.textContent ?? ''), null, 5000);
        if (!(await host.evaluate(() => window.hextable.state.scene?.open === false))) throw new Error('the scene opened during a fight');
        await endFight();
        await host.evaluate(() => window.hextable.act({ type: 'scene', scene: { open: true } }));
        await wait(host, () => window.hextable.state.scene?.open === true);
        await wait(phone, () => window.hextable.state.scene?.open === true);
      });

      await run.do('a fight starts in an open scene: the scene ends for both, with the reason, and the phone is back on the map', async () => {
        const n = await startFight();
        await wait(phone, () => window.hextable.state.scene === null);
        await waitShown(phone, '#scene', false);
        await waitShown(host, '#scene', false);
        if (!hostHeard.slice(n).some((e) => e.type === 'sceneEnd' && e.why === 'a fight began')) throw new Error('no sceneEnd with the reason');
        if (!heard.some((e) => e.type === 'sceneEnd' && e.why === 'a fight began')) throw new Error('the phone was not told why the scene ended');
        await endFight();
      });

      await run.do('the chronicle entry is in the DM panel\'s list', async () => {
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await wait(host, () => [...document.querySelectorAll('#chron-list li')].some((li) => /Meeting the mayor/.test(li.textContent)), null, 8000);
        await closeMenu(host);
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=scenes.
export default async function (browser, url) {
  await scenes(browser, url);
}
