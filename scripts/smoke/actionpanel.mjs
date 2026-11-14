import { sleep, scenario, wait, state, shown, waitShown, onCanvas, closeMenu, openTab, open } from './lib.mjs';

// ---------- the action panel (docs/specs/table-ui.md, Decision 6, task T3) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch: Explore first with the ranking and the DM's rests, the Features tab
// (a greyed row says why on screen), a pill that says how it ends, the raised height, a follow armed on a phone (the panel steps aside for the map),
// a fight (Reactions on another's turn, the question waiting, nothing covering the chips or the initiative strip). Then a table: a DM
// and a phone player, who gets no "Lead the party", sees Reactions on another's turn and no tab strip on its own.
// The tabs' own rows (Attacks, Bonus, Move, Features) are driven by SMOKE_ONLY=paneltabs.
const go = (page, url) => open(page, url);
const tabOf = (page) => page.evaluate(() => document.querySelector('#ap-tabs [aria-selected="true"]')?.dataset.tab ?? null);
const rows = (page) => page.$$eval('#ap-explore [data-row]', (b) => b.map((x) => x.dataset.row));
const pick = async (page, name) => { await page.click(`#party button:has-text("${name}")`); await wait(page, () => !document.querySelector('#card').hidden); };
const waitTab = (page, id) => wait(page, (t) => document.querySelector('#ap-tabs [aria-selected="true"]')?.dataset.tab === t, id);

// The map must stay tappable and the chips and the strip must not be covered: the card sits under both, and a point in the middle
// of the free band is the canvas.
async function clear(page, touch, fight) {
  const g = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { party: r('#party').top, card: r('#card').top, cardB: r('#card').bottom, order: r('#order').bottom, h: innerHeight, w: innerWidth, orderHas: document.querySelectorAll('#order li').length };
  });
  if (g.cardB > g.h + 1) throw new Error(`the card runs off the screen: ${JSON.stringify(g)}`);
  if (fight && g.orderHas && g.party < g.order + 40) throw new Error(`the panel leaves no room for the map under the initiative strip: ${JSON.stringify(g)}`);
  const y = (Math.max(g.order, 110) + g.party) / 2;
  if (g.party - y < 40) throw new Error(`no map left to tap: ${JSON.stringify(g)}`);
  if (!(await onCanvas(page, g.w / 2, y))) throw new Error(`the middle of the free band is not the map: ${JSON.stringify(g)}`);
  // chips and strip are not under anything
  const hit = await page.evaluate(() => { const bad = []; for (const s of ['#party button', '#order li']) for (const el of document.querySelectorAll(s)) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth) continue; const x = r.left + 6, e = document.elementFromPoint(x, r.top + r.height / 2); if (e && !el.contains(e) && e !== el) bad.push(`${s} under ${e.id || e.className || e.tagName}`); } return bad; });
  if (hit.length) throw new Error(hit.join('; '));
}

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width <= 600;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/actionpanel-${n}-${phone ? 'phone' : 'wide'}.png` }).catch(() => {}) : null);

      await run.do('exploring, the card opens on Explore: Search is in the top four, the DM has Lead the party and the rests', async () => {
        await go(page, url);
        await page.click('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities);
        await pick(page, 'Brenna');
        await waitTab(page, 'explore');
        await waitShown(page, '#ap-explore');
        if (await shown(page, '#ap-spells')) throw new Error('the Spells tab is showing in front of Explore');
        const r = await rows(page);
        if (r.indexOf('search') < 0 || r.indexOf('search') > 3) throw new Error(`Search is not in the top four with passive finds off: ${r}`);
        for (const want of ['follow', 'lead', 'shortRest', 'longRest', 'hide', 'check']) if (!r.includes(want)) throw new Error(`no ${want} row in ${r}`);
        const grid = await page.$$eval('#ap-explore .ap-grid [data-row]', (b) => b.length);
        if (grid !== 4) throw new Error(`${grid} large buttons, not four`);
        const small = await page.$$eval('#ap-explore [data-row], #ap-tabs button', (bs) => bs.filter((b) => b.getBoundingClientRect().width && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()));
        if (small.length) throw new Error(`targets under 44 px: ${small}`);
        await clear(page, touch, false); await shot('explore');
      });

      await run.do('a row sends what the bar button sends: Search rolls a check', async () => {
        const n = await state(page, (S) => S.timeline.length);
        await page.click('#ap-explore [data-row="search"]');
        await wait(page, (k) => window.hextable.state.timeline.length > k && window.hextable.state.timeline.some((e, i) => i >= k && e.type === 'check' && e.search), n);
      });

      await run.do('the Features tab has a row for Second Wind with its pips and the reason it is greyed written on screen, Explore comes back', async () => {
        await page.click('#ap-tab-features'); await waitTab(page, 'features'); await waitShown(page, '#ap-features'); await waitShown(page, '#ap-explore', false);
        await waitShown(page, '#ap-features [data-row="feat:secondWind"], #ap-features [data-row="feat:second-wind"]');
        const sw = await page.$eval('#ap-features [data-row^="feat:"]', (b) => ({ t: b.textContent.replace(/\s+/g, ' '), off: b.getAttribute('aria-disabled'), why: b.querySelector('.ap-why')?.getBoundingClientRect().height }));
        if (!/Second Wind/.test(sw.t) || !/\d \/ \d/.test(sw.t) || !/Back on a/.test(sw.t)) throw new Error(`no pips or recharge text: ${sw.t}`);
        if (sw.off !== 'true' || !sw.why || !/full Hit Points/.test(sw.t)) throw new Error(`a greyed row does not say why on screen: ${JSON.stringify(sw)}`);
        await clear(page, touch, false);
        await page.click('#ap-tab-explore'); await waitTab(page, 'explore'); await waitShown(page, '#ap-spells', false);
        if (!touch) { await page.keyboard.press('2'); await waitTab(page, 'features'); await page.keyboard.press('1'); await waitTab(page, 'explore'); }
      });

      await run.do('a condition is a pill; tapping it says how it ends, tapping again closes it', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'condition', actor: 'fighter', condition: 'poisoned', on: true }));
        await waitShown(page, '#c-res [data-how="cond:poisoned"]');
        await page.click('#c-res [data-how="cond:poisoned"]');
        await waitShown(page, '#ap-how');
        const t = await page.$eval('#ap-how', (e) => e.textContent);
        if (!/Poisoned/.test(t) || !/Until the DM removes it/.test(t)) throw new Error(`the card does not say how it ends: ${t}`);
        if ((await page.getAttribute('#c-res [data-how="cond:poisoned"]', 'aria-expanded')) !== 'true') throw new Error('the pill is not marked open');
        await clear(page, touch, false);
        await page.click('#ap-how [data-close]'); await waitShown(page, '#ap-how', false);
        await page.evaluate(() => window.hextable.act({ type: 'condition', actor: 'fighter', condition: 'poisoned', on: false }));
      });

      await run.do('the raised height gives more room and the map is still there; back to compact', async () => {
        await page.click('#ap-explore details.ap-more > summary');          // more rows than the compact height shows, or there is nothing to raise
        await wait(page, () => document.querySelector('#ap-explore details.ap-more')?.open);
        const h0 = await page.$eval('#ap-explore', (e) => e.getBoundingClientRect().height);
        await page.click('#ap-grip');
        await wait(page, () => document.querySelector('#card').hasAttribute('data-raised'));
        const h1 = await page.$eval('#ap-explore', (e) => e.getBoundingClientRect().height);
        if (!(h1 > h0)) throw new Error(`raised is not taller: ${h0} then ${h1}`);
        if ((await page.getAttribute('#ap-grip', 'aria-expanded')) !== 'true') throw new Error('the grip does not say it is open');
        await clear(page, touch, false); await shot('raised');
        await page.click('#ap-grip'); await wait(page, () => !document.querySelector('#card').hasAttribute('data-raised'));
        await page.click('#ap-explore details.ap-more > summary'); await wait(page, () => !document.querySelector('#ap-explore details.ap-more')?.open);
      });

      await run.do('Follow armed: on a phone the rows step aside for the map, on a desktop they stay; Cancel brings them back', async () => {
        await page.click('#ap-explore [data-row="follow"]');
        await wait(page, () => window.hextable.mode.kind === 'follow');
        const collapsed = await page.evaluate(() => document.querySelector('#card').hasAttribute('data-collapsed'));
        if (collapsed !== phone) throw new Error(`collapsed is ${collapsed} on a ${phone ? 'phone' : 'desktop'}`);
        if (phone && (await shown(page, '#ap-explore'))) throw new Error('the rows are still in the way of the map');
        await waitShown(page, '#hint'); await clear(page, touch, false); await shot('armed');
        await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move' && !document.querySelector('#card').hasAttribute('data-collapsed'));
        await waitShown(page, '#ap-explore');
      });

      await run.do('in a fight, on another\'s turn: Reactions is the tab, with the standing instructions', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }); });
        await wait(page, () => !!window.hextable.state.encounter && window.hextable.waiting === 0, null, 15000);
        await closeMenu(page);
        const other = await state(page, (S) => S.encounter.order.map((o) => o.id).find((i) => S.entities[i].kind === 'pc' && i !== S.encounter.order[S.encounter.turn].id));
        await page.evaluate((i) => window.hextable.select(i), other);
        await waitTab(page, 'reactions'); await waitShown(page, '#ap-reactions'); await waitShown(page, '#ap-spells', false);
        await waitShown(page, '#ap-reactions .rx select');
        if (await page.$('#ap-reactions #sheet-reactions')) throw new Error('the sheet\'s section id is used twice');
        await clear(page, touch, true); await shot('reactions');
      });

      await run.do('a question waiting makes Reactions pulse while the question itself is still the modal #rp', async () => {
        const who = await state(page, (S) => S.encounter.order.map((o) => o.id).find((i) => S.entities[i].kind === 'pc' && i !== S.encounter.order[S.encounter.turn].id));
        await page.evaluate((i) => { const h = window.hextable; h.state.pending = { n: 1, action: {}, ctx: {}, answers: {}, ask: { reactor: i, trigger: 'leave', options: [{ reaction: 'opportunity-attack', name: 'Opportunity Attack' }] } }; h.select(i); }, who);
        await waitShown(page, '#rp .rp-card');
        await wait(page, () => document.querySelector('#ap-tab-reactions')?.classList.contains('pulse'));
        const t = await page.$eval('#ap-reactions', (e) => e.textContent);
        if (!/A question is waiting/.test(t)) throw new Error(`the tab does not say it: ${t}`);
        await page.evaluate(() => { const h = window.hextable; h.state.pending = null; h.select(h.state.encounter.order[h.state.encounter.turn].id); });
        await wait(page, () => document.querySelector('#rp').hidden);
      });

      await run.do('on its own turn the card opens on Attacks with End turn, and the tab strip names Bonus and Move', async () => {
        const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
        const isPc = await state(page, (S, i) => S.entities[i].kind === 'pc', cur);
        if (!isPc) { // walk the order to a character's turn
          for (let k = 0; k < 12 && !(await state(page, (S) => S.entities[S.encounter.order[S.encounter.turn].id].kind === 'pc')); k++) {
            await page.evaluate(() => { const S = window.hextable.state; window.hextable.act({ type: 'endTurn', actor: S.encounter.order[S.encounter.turn].id }); });
            await wait(page, () => window.hextable.waiting === 0, null, 15000);
          }
        }
        const me = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
        await page.evaluate((i) => window.hextable.select(i), me);
        await waitTab(page, 'attacks'); await waitShown(page, '#ap-attacks'); await waitShown(page, '#btn-end'); await waitShown(page, '#ap-spells', false);
        const tabs = await page.$$eval('#ap-tabs [data-tab]', (b) => b.map((x) => x.dataset.tab));
        for (const want of ['attacks', 'bonus', 'move']) if (!tabs.includes(want)) throw new Error(`no ${want} tab in ${tabs}`);
        await clear(page, touch, true); await shot('turn');
      });
    } finally { await ctx.close(); }
  });
}

// A table: a DM and a phone player.
async function table(browser, url) {
  await scenario('a table: a player has no Lead the party, sees Reactions on another\'s turn and Explore first', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      await run.do('host a table, the phone joins and plays Brenna', async () => {
        await go(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await go(phone, url); await phone.fill('#lobby-name', 'Phone Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        await phone.locator('#party button:has-text("Play as")').first().tap();
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.owner));
      });
      await run.do('the player\'s Explore has Follow and Search, no Lead the party and no rests', async () => {
        await waitTab(phone, 'explore');
        const r = await rows(phone);
        if (!r.includes('follow') || !r.includes('search')) throw new Error(`rows ${r}`);
        for (const no of ['lead', 'shortRest', 'longRest']) if (r.includes(no)) throw new Error(`a player is offered ${no}`);
        await clear(phone, true, false);
        await host.evaluate(() => { const h = window.hextable; const e = Object.values(h.state.entities).find((x) => x.owner); h.select(e.id); });
        await pick(host, (await host.evaluate(() => Object.values(window.hextable.state.entities).find((x) => x.owner).name)));
        await waitTab(host, 'explore');
        if (!(await rows(host)).includes('lead')) throw new Error('the DM is not offered Lead the party');
      });
      await run.do('in a fight the player is on another\'s turn: Reactions, and nothing covers the chips or the strip', async () => {
        await host.evaluate(() => { document.getElementById('dm-auto').checked = false; window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }); });
        await wait(phone, () => !!window.hextable.state.encounter && window.hextable.waiting === 0, null, 15000);
        for (let k = 0; k < 14; k++) {
          const mineNow = await state(phone, (S) => { const c = S.entities[S.encounter.order[S.encounter.turn].id]; return !!c.owner; });
          if (!mineNow) break;
          await host.evaluate(() => { const S = window.hextable.state; window.hextable.act({ type: 'endTurn', actor: S.encounter.order[S.encounter.turn].id }); });
          await wait(host, () => window.hextable.waiting === 0, null, 15000);
        }
        await waitTab(phone, 'reactions'); await waitShown(phone, '#ap-reactions');
        await clear(phone, true, true);
      });
      await run.do('on its turn the phone is given Attacks and End turn', async () => {
        for (let k = 0; k < 14; k++) {
          const mineNow = await state(phone, (S) => !!S.entities[S.encounter.order[S.encounter.turn].id].owner);
          if (mineNow) break;
          await host.evaluate(() => { const S = window.hextable.state; window.hextable.act({ type: 'endTurn', actor: S.encounter.order[S.encounter.turn].id }); });
          await wait(host, () => window.hextable.waiting === 0, null, 15000);
          await sleep(100);
        }
        await waitShown(phone, '#btn-end'); await waitShown(phone, '#ap-attacks');
        await clear(phone, true, true);
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'action panel at 1280x800', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'action panel at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await table(browser, url);
}
