
import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, calm } from './lib.mjs';

// ---------- rewards ----------
// The rewards after a won fight (packages/client/conclusion.js): a DM and a phone player. The phone is told only that rewards are pending
// until the DM publishes; then it sees the card with its XP. With the table setting `conclusion: off` nothing appears.
async function rewards(browser, url) {
  await scenario('rewards: a DM and a phone player', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let id, name, xp0;
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
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
        xp0 = await phone.evaluate((i) => window.hextable.state.entities[i].xp, id);
        if (typeof xp0 !== 'number') throw new Error('a character has no XP');
      });
      await run.do('the DM wins a fight and settles the rewards; the phone is told only that they are pending', async () => {
        await host.evaluate(() => {
          const h = window.hextable; document.getElementById('dm-auto').checked = false;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
        });
        await waitShown(host, '#cc-chip');          // the DM's rewards wait as a line at the top, not over the map
        if (await shown(host, '#cc')) throw new Error('the rewards form opened over the map by itself');
        await host.click('#cc-chip');
        await waitShown(host, '#cc');
        if ((await host.textContent('#cc-title')).trim() !== 'The fight is won.') throw new Error('the DM card has the wrong title');
        await waitShown(phone, '#cc-wait');
        const said = (await phone.textContent('#cc-wait')).trim();
        if (said !== 'The fight is over. The DM is working out the rewards.') throw new Error(`the phone was told: ${said}`);
        if (await shown(phone, '#cc')) throw new Error('the phone shows a card before the rewards are published');
        const c = await state(phone, (S) => S.conclusion);
        if (Object.keys(c).sort().join() !== 'fight,id,pending') throw new Error(`the phone was sent: ${JSON.stringify(c)}`);
        const form = await host.textContent('#cc');
        if (!/XP/.test(form) || !/Foes/.test(form)) throw new Error('the DM form has no foes or XP');
      });
      await run.do('the DM adds a bonus line with a reason and a loot line for the phone character', async () => {
        await host.fill('[data-nb-amt]', '50'); await host.fill('[data-nb-reason]', 'Freed the prisoner');
        await host.click('[data-badd]');
        await wait(host, () => window.hextable.state.conclusion?.xp.bonus.length === 1);
        if ((await host.inputValue('[data-nb-reason]')) !== '') throw new Error('the new-bonus row was not cleared');
        await host.fill('[data-nl-name]', 'Shortbow'); await host.selectOption('[data-nl-to]', id);
        await host.click('[data-ladd]');
        await wait(host, () => window.hextable.state.conclusion?.loot.length === 1);
        const c = await state(host, (S) => S.conclusion);
        if (c.loot[0].to === null || c.xp.bonus[0].reason !== 'Freed the prisoner') throw new Error(JSON.stringify(c));
        await sleep(400);
        const leak = await phone.evaluate(() => JSON.stringify(window.hextable.state.conclusion) + document.body.innerText.slice(0, 0));
        if (/Shortbow|Freed|bonus|loot|foes|per/.test(leak)) throw new Error(`the phone was sent ${leak}`);
      });
      await run.do('a refusal is shown in the engine\'s words', async () => {
        if (process.env.SMOKE_SHOTS) await host.screenshot({ path: `${process.env.SMOKE_SHOTS}/rewards-form-desktop.png` });
        await host.fill('[data-nb-amt]', '5'); await host.fill('[data-nb-reason]', '');
        await host.click('[data-badd]');
        await waitShown(host, '#cc-err');
        if (!/reason/i.test(await host.textContent('#cc-err'))) throw new Error(`refusal: ${await host.textContent('#cc-err')}`);
        await host.fill('[data-nb-amt]', '');
      });
      await run.do('publishing shows the phone the card with its XP, the bonus line and the loot', async () => {
        await host.click('#cc [data-cc="publish"]');
        await waitShown(phone, '#cc');
        const t = await phone.textContent('#cc');
        const { per, xp1 } = await phone.evaluate((i) => ({ per: window.hextable.state.conclusion.xp.per[i], xp1: window.hextable.state.entities[i].xp }), id);
        if (!/Freed the prisoner/.test(t) || !/Shortbow/.test(t) || !t.includes(name) || !/\+50/.test(t)) throw new Error(`card: ${t}`);
        if (!t.includes(`+${per.toLocaleString('en-US')}`) && !/each/.test(t)) throw new Error(`no XP on the card: ${t}`);
        if (xp1 !== xp0 + per) throw new Error(`XP ${xp0} + ${per} is not ${xp1}`);
        const m = await phone.evaluate(() => { const c = document.querySelector('.cc-card').getBoundingClientRect(); return { l: c.left, r: c.right, t: c.top, b: c.bottom, w: innerWidth, h: innerHeight }; });
        if (m.l < 0 || m.r > m.w || m.t < 0 || m.b > m.h) throw new Error(`the card is off the screen: ${JSON.stringify(m)}`);
        if (process.env.SMOKE_SHOTS) await phone.screenshot({ path: `${process.env.SMOKE_SHOTS}/rewards-card-phone.png` });
        const sent = await phone.evaluate(() => JSON.stringify(window.hextable.state.conclusion));
        if (/"tpl"|"base"|"xp":\d+/.test(sent.replace(/"per":\{[^}]*\}/, ''))) throw new Error(`the phone was sent more than the card: ${sent}`);
      });
      await run.do('the log and the sheet say it; Continue puts the card away on both screens', async () => {
        await phone.locator('#cc [data-cc="continue"]').tap();
        await waitShown(phone, '#cc', false);
        await host.click('#cc [data-cc="continue"]');
        await waitShown(host, '#cc', false);
        await openTab(phone, 'log');
        if (!/Experience: .* XP/.test(await phone.textContent('#log-list'))) throw new Error('the phone log has no line for the rewards');
        await phone.click('#log-rewards');
        await closeMenu(phone);
        await waitShown(phone, '#cc');
        await phone.locator('#cc [data-cc="continue"]').tap();
        await phone.click(`#party button:has-text("${name}")`);
        await openTab(phone, 'sheet');
        if (!/XP \d/.test(await phone.textContent('#sheet-body'))) throw new Error('no XP on the sheet');
        await closeMenu(phone);
        await openTab(host, 'dm');
        const chron = await host.$$eval('#chron-list li', (l) => l.map((x) => x.textContent).filter((t) => /A fight.*won/.test(t)).length);
        await closeMenu(host);
        if (chron !== 1) throw new Error(`fight chronicle entries in the DM's chronicle: ${chron}`);
      });
      await run.do('with the rewards turned off, the next won fight shows nothing', async () => {
        await openTab(host, 'dm');
        await host.selectOption('#dm-conclusion', 'off');
        await wait(host, () => window.hextable.state.settings.conclusion === 'off');
        await closeMenu(host);
        const fight0 = await state(host, (S) => S.conclusion.fight);
        await host.evaluate(() => { for (const e of Object.values(window.hextable.state.entities)) if (e.side === 'foe') window.hextable.act({ type: 'setHp', actor: e.id, hp: e.maxHp }); });
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.side === 'foe' && e.hp > 0 && !e.hidden));
        await host.evaluate(() => {
          const h = window.hextable;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe' && e.hp > 0) h.act({ type: 'harm', actor: e.id, amount: 999 });
        });
        await wait(host, () => !window.hextable.state.encounter);
        await calm(host); await calm(phone); await sleep(500);
        for (const [pg, who] of [[host, 'the DM'], [phone, 'the phone']]) {
          if (await shown(pg, '#cc') || await shown(pg, '#cc-wait') || await shown(pg, '#cc-chip')) throw new Error(`${who} is shown something`);
          if ((await state(pg, (S) => S.conclusion?.fight)) !== fight0) throw new Error(`${who} has a new conclusion`);
        }
      });
      await run.do('the party falls: the phone sees the card with no choices, the DM rewinds over the wire', async () => {
        await host.evaluate(() => {
          const h = window.hextable;
          for (const e of Object.values(h.state.entities)) if (e.side === 'foe') h.act({ type: 'setHp', actor: e.id, hp: e.maxHp });
        });
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.side === 'foe' && e.hp > 0 && !e.hidden));
        await host.evaluate(() => {
          const h = window.hextable, foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });
        });
        await wait(host, () => !!window.hextable.state.encounter);
        for (let n = 0; n < 5; n++) {
          await host.evaluate(() => { const h = window.hextable; for (const e of Object.values(h.state.entities)) if (e.kind === 'pc' && !e.dead) h.act({ type: 'harm', actor: e.id, amount: Math.max(1, e.hp) }); });
          await sleep(300);
          if (await host.evaluate(() => !window.hextable.state.encounter)) break;
        }
        await waitShown(host, '#df'); await waitShown(phone, '#df');
        if (await phone.locator('#df .df-choice').count()) throw new Error('the phone is offered choices');
        if (!/The DM will decide what happens next/.test(await phone.textContent('#df'))) throw new Error('the phone card has no line about the DM');
        if (!(await host.locator('#df .df-choice').count())) throw new Error('the DM has no choices');
        await host.click('#df [data-df="fight"]');
        await host.click('#df [data-df="yes"]');
        await waitShown(host, '#df', false); await waitShown(phone, '#df', false);
        const up = await state(host, (S) => Object.values(S.entities).filter((e) => e.kind === 'pc' && !e.dead && e.hp > 0).length);
        if (up < 1) throw new Error('nobody is standing after the rewind');
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=rewards.
export default async function (browser, url) {
  await rewards(browser, url);
}
