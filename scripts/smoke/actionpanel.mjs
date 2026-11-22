import { sleep, scenario, wait, state, shown, waitShown, onCanvas, closeMenu, openTab, open, chip, chipPick, openMenu, panelTab, openGroup, menuStill } from './lib.mjs';

// ---------- the action panel (docs/specs/table-ui.md, Decision 6, task T3; moved into the Character screen by M4 of docs/specs/one-token-menu.md) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch: the groups of the Character screen (Explore first with the ranking and the DM's rests in Rest), the Features group
// (a greyed row says why on screen), a pill that says how it ends, one group open at a time, a follow armed (the menu folds for the map), a fight (Reactions on another's turn, the
// question waiting, nothing covering the token or the turn line, the dock gone). Then a table: a DM and a phone player, who gets no "Lead the party" and sees Reactions on another's turn.
// The groups' own rows (Attack, Bonus, Move, Features) are driven by SMOKE_ONLY=paneltabs.
const go = (page, url) => open(page, url);
const tabOf = (page) => openGroup(page);
const rows = (page) => page.$$eval('#ap-explore [data-row]', (b) => b.map((x) => x.dataset.row));
const pick = async (page, name) => { await chip(page, `${name}`); await wait(page, () => !document.querySelector('#card').hidden); };
// The menu on the selected character's screen, and the group `id` open there.
const waitTab = async (page, id) => {
  await openMenu(page, 'sheet');
  await wait(page, (t) => document.querySelector('#ap-body .ap-bar[aria-expanded="true"]')?.dataset.sec === t, id).catch(async (err) => {
    const at = await page.evaluate(() => ({ sel: document.getElementById('c-name')?.textContent, bars: [...document.querySelectorAll('#ap-body .ap-sec:not([hidden]) .ap-bar')].map((b) => `${b.dataset.sec}:${b.getAttribute('aria-expanded')}`), empty: document.getElementById('ap-empty')?.textContent, mode: window.hextable.mode.kind }));
    throw new Error(`${err.message.split('\n')[0]} (the page: ${JSON.stringify(at)})`);
  });
};

// The dock is gone (M4): with the menu closed nothing but the map, the turn line and the token is on the screen, the action rows are not drawn, a point in the free band
// above the turn line is the canvas, and neither the turn line nor the token is under anything. With the menu open the sheet stops short of the token and the token is on top.
async function clear(page, touch, fight) {
  await closeMenu(page);
  const g = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); return e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null; };
    const turn = r('#turnline');
    return { top: turn ? turn.top : innerHeight, card: !!document.querySelector('#card')?.getClientRects().length, dock: !!document.getElementById('dock'), turn: !!turn, h: innerHeight, w: innerWidth };
  });
  if (g.dock) throw new Error('the dock is still in the page');
  if (g.card) throw new Error('the action rows are drawn with the menu closed');
  const y = g.top / 2;
  if (g.top - 60 < 40) throw new Error(`no map left to tap: ${JSON.stringify(g)}`);
  if (!(await onCanvas(page, g.w / 2 - 120, y))) throw new Error(`the free band is not the map: ${JSON.stringify(g)}`);
  // the turn line and the token are not under anything
  const hit = await page.evaluate(() => { const bad = []; for (const s of ['#turnline button', '#btn-menu']) for (const el of document.querySelectorAll(s)) { if (el.hidden || !el.getClientRects().length) continue; const r = el.getBoundingClientRect(); if (r.left < 0 || r.right > innerWidth) continue; const x = r.left + 6, e = document.elementFromPoint(x, r.top + r.height / 2); if (e && !el.contains(e) && e !== el) bad.push(`${s} under ${e.id || e.className || e.tagName}`); } return bad; });
  if (hit.length) throw new Error(hit.join('; '));
}
// With the menu open on the Character screen the token has not moved and nothing is under it: the sheet and its columns leave room for it (round 6, R25).
async function tokenKept(page) {
  const at = () => page.evaluate(() => { const r = document.getElementById('btn-menu').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)].join(','); });
  await closeMenu(page); const before = await at();
  await openMenu(page, 'sheet'); const during = await at();
  if (before !== during) throw new Error(`the token moved for the menu: ${before} then ${during}`);
  const over = await page.evaluate(() => { const t = document.getElementById('btn-menu'), r = t.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const d = document.getElementById('drawer').getBoundingClientRect(); const lv = document.querySelector('#menu-levels').getBoundingClientRect(); return { onTop: !!e && (t === e || t.contains(e)), levelsBottom: lv.bottom, tokenTop: r.top, wide: innerWidth >= 900, drawerRight: d.right, tokenLeft: r.left, tokenRight: r.right }; });
  if (!over.onTop) throw new Error('something is over the token with the menu open');
  if (over.levelsBottom > over.tokenTop + 1 && !(over.wide && over.drawerRight < over.tokenLeft)) throw new Error(`the menu runs under the token: ${JSON.stringify(over)}`);
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
        if (await shown(page, '#ap-spells')) throw new Error('the Cast group is open in front of Explore');
        const r = await rows(page);
        if (r.indexOf('search') < 0 || r.indexOf('search') > 3) throw new Error(`Search is not in the top four with passive finds off: ${r}`);
        for (const want of ['follow', 'lead', 'hide', 'check']) if (!r.includes(want)) throw new Error(`no ${want} row in ${r}`);
        for (const no of ['shortRest', 'longRest']) if (r.includes(no)) throw new Error(`${no} is in Explore: the rests are the Rest group`);
        await page.click('#ap-bar-rest'); await waitShown(page, '#ap-rest [data-row="shortRest"]'); await waitShown(page, '#ap-rest [data-row="longRest"]');
        await page.click('#ap-bar-explore'); await waitShown(page, '#ap-explore');
        const grid = await page.$$eval('#ap-explore .ap-grid [data-row]', (b) => b.length);
        if (grid !== 4) throw new Error(`${grid} large buttons, not four`);
        const small = await page.$$eval('#ap-explore [data-row], #ap-body .ap-bar, #c-res button', (bs) => bs.filter((b) => b.getBoundingClientRect().width && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()));
        if (small.length) throw new Error(`targets under 44 px: ${small}`);
        await tokenKept(page); await clear(page, touch, false); await shot('explore');
      });

      await run.do('a row sends what the bar button sends: Search rolls a check', async () => {
        const n = await state(page, (S) => S.timeline.length);
        await panelTab(page, 'explore');
        await page.click('#ap-explore [data-row="search"]');
        await wait(page, (k) => window.hextable.state.timeline.length > k && window.hextable.state.timeline.some((e, i) => i >= k && e.type === 'check' && e.search), n);
      });

      await run.do('the Heal group has a row for Second Wind with its pips and the reason it is greyed written on screen, Explore comes back', async () => {
        await panelTab(page, 'heal'); await waitTab(page, 'heal'); await waitShown(page, '#ap-heal'); await waitShown(page, '#ap-explore', false);
        await waitShown(page, '#ap-heal [data-row="feat:secondWind"], #ap-heal [data-row="feat:second-wind"]');
        if (await shown(page, '#ap-features')) throw new Error('Second Wind is in Features too: a row is in the group that is for it');
        const sw = await page.$eval('#ap-heal [data-row^="feat:"]', (b) => ({ t: b.textContent.replace(/\s+/g, ' '), off: b.getAttribute('aria-disabled'), why: b.querySelector('.ap-why')?.getBoundingClientRect().height }));
        if (!/Second Wind/.test(sw.t) || !/\d \/ \d/.test(sw.t) || !/Back on a/.test(sw.t)) throw new Error(`no pips or recharge text: ${sw.t}`);
        if (sw.off !== 'true' || !sw.why || !/full Hit Points/.test(sw.t)) throw new Error(`a greyed row does not say why on screen: ${JSON.stringify(sw)}`);
        await clear(page, touch, false);
        await panelTab(page, 'explore'); await waitTab(page, 'explore'); await waitShown(page, '#ap-spells', false);
      });

      await run.do('a condition is a pill; tapping it says how it ends, tapping again closes it', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'condition', actor: 'fighter', condition: 'poisoned', on: true }));
        await openMenu(page, 'sheet');                       // the status block (conditions) is the top of the Character screen now
        await waitShown(page, '#c-res [data-how="cond:poisoned"]');
        await page.click('#c-res [data-how="cond:poisoned"]');
        await waitShown(page, '#ap-how');
        const t = await page.$eval('#ap-how', (e) => e.textContent);
        if (!/Poisoned/.test(t) || !/Until the DM removes it/.test(t)) throw new Error(`the card does not say how it ends: ${t}`);
        if ((await page.getAttribute('#c-res [data-how="cond:poisoned"]', 'aria-expanded')) !== 'true') throw new Error('the pill is not marked open');
        await page.click('#ap-how [data-close]'); await waitShown(page, '#ap-how', false);
        await closeMenu(page);
        await page.evaluate(() => window.hextable.act({ type: 'condition', actor: 'fighter', condition: 'poisoned', on: false }));
      });

      await run.do('the groups are bars: one open at a time, each closed bar shows its tip, with one open the others show their titles only; a second tap closes it', async () => {
        await panelTab(page, 'explore');
        await page.click('#ap-bar-explore');                                   // closes it: no group is open
        await wait(page, () => !document.querySelector('#ap-body .ap-bar[aria-expanded="true"]'));
        const tips = await page.$$eval('#ap-body .ap-sec:not([hidden]) .ap-bar', (bs) => bs.map((b) => [b.dataset.sec, getComputedStyle(b.querySelector('.ap-tip')).display, b.querySelector('.ap-tip').textContent.trim()]));
        if (tips.length < 3) throw new Error(`too few bars: ${JSON.stringify(tips)}`);
        if (tips.some(([, d]) => d === 'none')) throw new Error(`a closed bar hides its tip with none open: ${JSON.stringify(tips)}`);
        if (!tips.find(([k]) => k === 'explore')?.[2]) throw new Error('Explore has no tip');
        await page.click('#ap-bar-rest'); await waitShown(page, '#ap-rest');
        await page.click('#ap-bar-explore'); await waitShown(page, '#ap-explore'); await waitShown(page, '#ap-rest', false);
        const open = await page.$$eval('#ap-body .ap-bar[aria-expanded="true"]', (b) => b.length);
        if (open !== 1) throw new Error(`${open} groups open at once`);
        const hidden = await page.$$eval('#ap-body .ap-bar[aria-expanded="false"]', (bs) => bs.filter((b) => b.offsetParent && getComputedStyle(b.querySelector('.ap-tip')).display !== 'none').map((b) => b.dataset.sec));
        if (hidden.length) throw new Error(`with one open these bars still show a tip: ${hidden}`);
        const sc = await page.evaluate(() => document.getElementById('drawer-body').scrollTop);
        await page.click('#ap-explore details.ap-more > summary');
        await wait(page, () => document.querySelector('#ap-explore details.ap-more')?.open);
        if ((await page.evaluate(() => document.getElementById('drawer-body').scrollTop)) !== sc) throw new Error('opening More scrolled the screen by itself');
        await page.click('#ap-explore details.ap-more > summary'); await wait(page, () => !document.querySelector('#ap-explore details.ap-more')?.open);
        await tokenKept(page); await shot('bars');
      });

      await run.do('Follow armed: the menu folds for the map (it is aimed there), the hint is up; Cancel puts it down and the menu stays closed', async () => {
        await panelTab(page, 'explore');
        await page.click('#ap-explore [data-row="follow"]');
        await wait(page, () => window.hextable.mode.kind === 'follow');
        await waitShown(page, '#drawer', false);
        if (await shown(page, '#ap-explore')) throw new Error('the rows are still in the way of the map');
        await waitShown(page, '#hint'); await clear(page, touch, false); await shot('armed');
        await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move');
        if (await shown(page, '#drawer')) throw new Error('the menu reopened by itself');
      });

      await run.do('in a fight, on another\'s turn: Reactions is the tab, with the standing instructions', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }); });
        await wait(page, () => !!window.hextable.state.encounter && window.hextable.waiting === 0, null, 15000);
        await closeMenu(page);
        const other = await state(page, (S) => S.encounter.order.map((o) => o.id).find((i) => S.entities[i].kind === 'pc' && i !== S.encounter.order[S.encounter.turn].id));
        await page.evaluate((i) => window.hextable.select(i), other);
        // Reactions is shown only when there is a Reaction to use (R29): this creature's group, or one line of reasons
        await openMenu(page, 'sheet');
        await wait(page, () => !document.getElementById('ap-empty').hidden || document.querySelector('#ap-bar-reactions')?.offsetParent);
        const has = await shown(page, '#ap-bar-reactions');
        const bars = await page.$$eval('#ap-body .ap-sec:not([hidden]) .ap-bar', (b) => b.map((x) => x.dataset.sec));
        for (const no of ['attacks', 'move', 'defend', 'spells']) if (bars.includes(no)) throw new Error(`on another's turn the page offers ${no}: ${bars}`);
        if (has) {
          await waitTab(page, 'reactions'); await waitShown(page, '#ap-reactions'); await waitShown(page, '#ap-spells', false);
          await waitShown(page, '#ap-reactions .rx select');
          if (await page.$('#ap-reactions #sheet-reactions')) throw new Error('the sheet\'s section id is used twice');
        } else if (!/\S/.test(await page.$eval('#ap-empty', (e) => e.textContent))) throw new Error('an empty page does not say why');
        await clear(page, touch, true); await shot('reactions');
      });

      await run.do('a question waiting puts the question on the Reactions bar while the question itself is still the modal #rp', async () => {
        const who = await state(page, (S) => S.encounter.order.map((o) => o.id).find((i) => S.entities[i].kind === 'pc' && i !== S.encounter.order[S.encounter.turn].id));
        await page.evaluate((i) => { const h = window.hextable; h.state.pending = { n: 1, action: {}, ctx: {}, answers: {}, ask: { reactor: i, trigger: 'leave', options: [{ reaction: 'opportunity-attack', name: 'Opportunity Attack' }] } }; h.select(i); }, who);
        await waitShown(page, '#rp .rp-card');
        await wait(page, () => /A question is waiting/.test(document.querySelector('#ap-bar-reactions')?.textContent ?? ''));
        const t = await page.$eval('#ap-reactions', (e) => e.textContent);
        if (!/A question is waiting/.test(t)) throw new Error(`the group does not say it: ${t}`);
        await page.evaluate(() => { const h = window.hextable; h.state.pending = null; h.select(h.state.encounter.order[h.state.encounter.turn].id); });
        await wait(page, () => document.querySelector('#rp').hidden);
      });

      await run.do('on its own turn the Character screen opens on Attack with End turn; Move and the Bonus Action are there', async () => {
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
        const bars = await page.$$eval('#ap-body .ap-sec:not([hidden]) .ap-bar', (b) => b.map((x) => x.dataset.sec));
        for (const want of ['attacks', 'move']) if (!bars.includes(want)) throw new Error(`no ${want} group in ${bars}`);
        if (!(await page.$('#c-res [data-cost="bonus"]'))) throw new Error('the turn bar has no Bonus Action button');
        const un = await page.$$eval('#ap-body .ap-sec:not([hidden]) [data-row].off, #ap-body .ap-sec:not([hidden]) [data-row][aria-disabled="true"]', (b) => b.map((x) => x.dataset.row));
        if (un.length) throw new Error(`in a fight the page shows rows that cannot be used: ${un}`);
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
        await chipPick(phone, 'Play as', 'tap');
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.owner));
      });
      await run.do('the player\'s Explore has Follow and Search, Lead the party (formations, #304) and no rests', async () => {
        await waitTab(phone, 'explore');
        const r = await rows(phone);
        if (!r.includes('follow') || !r.includes('search')) throw new Error(`rows ${r}`);
        if (!r.includes('lead')) throw new Error(`a player is not offered lead: ${r}`);
        for (const no of ['shortRest', 'longRest']) if (r.includes(no)) throw new Error(`a player is offered ${no}`);
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
        await waitShown(phone, '#btn-end'); await waitTab(phone, 'attacks'); await waitShown(phone, '#ap-attacks');
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
