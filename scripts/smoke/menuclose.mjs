// The ways the menu closes (docs/specs/one-token-menu.md, Decision 3 "Closing, always", R11, R16; stage M10's closing test). Every state of the menu
// (the arc, More, every screen, a page with a section open, with none, "all on one page", Arrange) closes by a tap on the die, a tap on the map and
// Escape, and by M; a phone's sheet also by a tap on its handle and a drag down on it, a wide screen's column by the x beside Pin. The taps are real
// ones at the place on the screen (the die must be on top and in reach in every state), and a closing tap does nothing else: nobody moves, nothing
// is selected. Then the arc: it fans out of the die and folds back by each way, and a place chosen from it folds it and opens the screen.
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, tapAt } from './lib.mjs';

// The states: [name, how to get there]. `path` is opened through the menu itself; `make` sets a page's sections once it is up, and `until` says it is so.
const STATES = [
  ['the arc', { arc: true }],
  ['More, the list of every place', { path: 'more' }],
  ['Party (Turns)', { path: 'turns' }],
  ['Dice', { path: 'dice' }],
  ['a character\'s page with a group open', { path: 'sheet', make: () => { const b = document.querySelector('#ap-body .ap-sec:not([hidden]) .ap-bar:not(#ap-bar-sheet)'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); }, until: () => !!document.querySelector('#sheet.pin .ap-sec.open:not([data-sec="sheet"])') }],
  ['a character\'s page with the Sheet section open', { path: 'sheet', make: () => { const b = document.getElementById('ap-bar-sheet'); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }, until: () => document.getElementById('ap-bar-sheet').getAttribute('aria-expanded') === 'true' }],
  ['a character\'s page with no section open', { path: 'sheet', make: () => { document.querySelector('#ap-body .ap-bar[aria-expanded="true"]')?.click(); }, until: () => !document.getElementById('sheet').classList.contains('pin') }],
  ['Log and chat, the log open', { path: 'log/log' }],
  ['Log and chat, Talk open', { path: 'log/talk' }],
  ['Setup with no section open', { path: 'settings', shut: true }],
  ['Setup, The menu open', { path: 'settings/menu' }],
  ['Setup, Leave the table open', { path: 'settings/leave' }],
  ['Arrange the symbols', { path: 'settings/menu', make: () => { if (!document.querySelector('#arrange:not([hidden])')) document.getElementById('set-arrange').click(); }, until: () => !!document.querySelector('#arrange:not([hidden])'), only: () => !!document.getElementById('set-arrange') }],
  ['DM tools with no section open', { path: 'dm', shut: true }],
  ['DM tools, Table rules open', { path: 'dm/rules' }],
  ['DM tools, all on one page', { path: 'dm/all' }],
  ['About', { path: 'about' }],
];

export default async function menuclose(browser, url) {
  for (const [label, opts, phone] of [['menuclose at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true], ['menuclose at 1280x800', { viewport: { width: 1280, height: 800 } }, false]]) {
    await scenario(label, async (run) => {
      const ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      try {
        await open(page, url);
        await playSolo(page);
        await sleep(600);
        const motion = (m) => page.evaluate((v) => window.hextable.drawer.setMotion(v), m);
        const is = () => page.evaluate(() => { const d = window.hextable.drawer, q = (i) => { const e = document.getElementById(i); return !!e && !e.hidden && e.getClientRects().length > 0; };
          return { open: d.isOpen, arc: q('menu-arc'), drawer: q('drawer'), scrim: q('drawer-scrim'), expanded: document.getElementById('btn-menu').getAttribute('aria-expanded'), path: document.getElementById('drawer').dataset.path }; });
        const closed = async (what) => {
          await page.waitForFunction(() => !window.hextable.drawer.isOpen && document.getElementById('drawer').hidden && document.getElementById('menu-arc').hidden && document.getElementById('drawer-scrim').hidden, null, { timeout: 4000 })
            .catch(async () => { throw new Error(`${what}: the menu did not close: ${JSON.stringify(await is())}`); });
          if ((await is()).expanded !== 'false') throw new Error(`${what}: the die still says the menu is open`);
        };
        // Where things stand on the map: a closing tap must change none of it.
        const world = () => state(page, (S) => JSON.stringify([Object.values(S.entities).map((e) => [e.id, e.pos?.q, e.pos?.r]), !!S.encounter]) + '|' + (document.querySelector('#party .pr.sel')?.dataset.id ?? ''));
        const enter = async ([name, st]) => {
          if (st.arc) { await page.click('#btn-menu'); await waitShown(page, '#menu-arc'); return; }
          await page.evaluate((p) => window.hextable.drawer.open(p), st.path);
          if (st.shut) await page.evaluate(() => { const b = document.querySelector('#drawer-body > .tabpanel:not([hidden]) > .acc-sec.open .acc-bar'); if (b) b.click(); });      // a page remembers its section: shut it
          await waitShown(page, st.path === 'more' ? '#menu-table' : '#drawer');
          const want = st.shut ? st.path : st.path;
          await page.waitForFunction(([w, exact]) => { const at = document.getElementById('drawer').dataset.path; return exact ? at === w : at.split('/')[0] === w.split('/')[0] && (!w.includes('/') || at === w); }, [want, !!st.shut], { timeout: 4000 })
            .catch(async () => { throw new Error(`${name}: could not get there: ${JSON.stringify(await is())}`); });
          if (st.make) { await waitShown(page, '#drawer-body > .tabpanel:not([hidden])'); await page.evaluate(st.make); }
          if (st.until) await page.waitForFunction(st.until, null, { timeout: 4000 }).catch(() => { throw new Error(`${name}: could not get there`); });
        };
        const die = () => page.evaluate(() => { const r = document.getElementById('btn-menu').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        // A point of the dimmed map: above a phone's sheet, beside a wide screen's column. It must be the scrim that is there, nothing else.
        const mapPoint = async (name) => {
          for (const [x, y] of phone ? [[195, 40], [40, 60], [350, 60]] : [[1100, 300], [900, 200], [1200, 80]]) {
            if ((await page.evaluate(([a, b]) => document.elementFromPoint(a, b)?.id, [x, y])) === 'drawer-scrim') return [x, y];
          }
          throw new Error(`${name}: no dimmed map to tap: ${JSON.stringify(await is())}`);
        };
        const WAYS = [
          ['a tap on the die', async (name) => { const [x, y] = await die(); const top = await page.evaluate(([a, b]) => document.elementFromPoint(a, b)?.closest('#btn-menu') !== null, [x, y]); if (!top) throw new Error(`${name}: the die is under something`); await tapAt(page, phone, x, y); }],
          ['a tap on the map', async (name) => { const [x, y] = await mapPoint(name); await tapAt(page, phone, x, y); }],
          ['Escape', async () => { await page.keyboard.press('Escape'); }],
          ['M', async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('m'); }],
        ];
        const SHEET_WAYS = [
          ['a tap on the handle', async (name) => { const r = await page.evaluate(() => { const h = document.getElementById('drawer-handle').getBoundingClientRect(); return [h.left + h.width / 2, h.top + h.height / 2, h.width, h.height]; }); if (r[3] < 44 || r[2] < 300) throw new Error(`${name}: the handle is ${r[2]} x ${r[3]}`); await tapAt(page, true, r[0], r[1]); }],
          ['a drag down on the handle', async () => { await page.evaluate(async () => { const h = document.getElementById('drawer-handle'), r = h.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 20;
            const fire = (t, d) => h.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: x, clientY: y + d, bubbles: true, isPrimary: true }));
            fire('pointerdown', 0); for (const d of [20, 45, 70, 90]) { fire('pointermove', d); await new Promise((ok) => setTimeout(ok, 30)); } fire('pointerup', 90); }); }],
        ];
        const COLUMN_WAYS = [
          ['the x beside Pin', async (name) => { const ok = await page.evaluate(() => { const x = document.getElementById('drawer-close').getBoundingClientRect(), p = document.getElementById('drawer-pin').getBoundingClientRect(); return x.width >= 44 && x.height >= 44 && Math.abs(x.left - p.right) < 16 && Math.abs(x.top - p.top) < 4; }); if (!ok) throw new Error(`${name}: the x is not beside Pin, or is under 44 px`); await page.click('#drawer-close'); }],
        ];

        await run.do('every state closes by a tap on the die, a tap on the map, Escape and M (and a tap does nothing else)', async () => {
          await motion('appear');
          let walked = 0;
          for (const st of STATES) {
            if (st[1].only && !(await page.evaluate(st[1].only))) continue;
            for (const [how, go] of WAYS) {
              await enter(st);
              const before = await world();
              await go(st[0]);
              await closed(`${st[0]}, ${how}`);
              if ((await world()) !== before) throw new Error(`${st[0]}: ${how} did more than close the menu`);
              walked++;
            }
          }
          if (walked < 60) throw new Error(`only ${walked} closings were walked`);
        });
        await run.do(phone ? 'a phone\'s sheet has no x: the handle closes it, by a tap and by a drag down; a short drag springs back' : 'a wide screen\'s column closes by the x beside Pin, and has no handle', async () => {
          for (const st of STATES.filter(([, s]) => !s.arc)) {
            if (st[1].only && !(await page.evaluate(st[1].only))) continue;
            for (const [how, go] of phone ? SHEET_WAYS : COLUMN_WAYS) {
              await enter(st);
              if (phone ? await shown(page, '#drawer-close') : await shown(page, '#drawer-handle')) throw new Error(`${st[0]}: ${phone ? 'a phone\'s sheet shows an x' : 'a column shows a handle'}`);
              await go(st[0]);
              await closed(`${st[0]}, ${how}`);
            }
          }
          if (phone) {
            await enter(STATES[2]);
            await page.evaluate(async () => { const h = document.getElementById('drawer-handle'), r = h.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 20;
              const fire = (t, d) => h.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: x, clientY: y + d, bubbles: true, isPrimary: true }));
              fire('pointerdown', 0); for (const d of [8, 16, 24]) { fire('pointermove', d); await new Promise((ok) => setTimeout(ok, 120)); } fire('pointerup', 24); });
            await sleep(200);
            const at = await is();
            if (!at.open || !at.drawer) throw new Error(`a drag of 24 px closed the sheet: ${JSON.stringify(at)}`);
            if ((await page.evaluate(() => document.getElementById('drawer').style.transform)) !== '') throw new Error('the sheet did not spring back');
            await page.keyboard.press('Escape'); await closed('after the short drag');
          }
        });
        await run.do('with the slide on, each way still closes the menu, and the die never moves', async () => {
          await motion('slide');
          const home = (await die()).map(Math.round).join();
          for (const st of [STATES[0], STATES[2], STATES[10]]) {
            for (const [how, go] of [...WAYS, ...(st[1].arc ? [] : phone ? SHEET_WAYS : COLUMN_WAYS)]) {
              await enter(st); await sleep(st[1].arc ? 650 : 850);
              if ((await die()).map(Math.round).join() !== home) throw new Error(`${st[0]}: the die moved`);
              await go(st[0]);
              await closed(`${st[0]}, ${how}, sliding`);
              if ((await die()).map(Math.round).join() !== home) throw new Error(`${st[0]}: the die moved when the menu closed`);
            }
          }
          // a tap while the sheet is still rising acts on where things will be: the die closes it at once
          await enter(STATES[2]); const [x, y] = await die(); await tapAt(page, phone, x, y); await closed('a tap on the die while the sheet rises');
        });
        await run.do('the arc fans out of the die and folds back; a place chosen from it folds it and opens its screen', async () => {
          await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
          await wait(page, () => document.getElementById('menu-arc').classList.contains('out'));
          await sleep(750);
          const fan = await page.evaluate(() => { const t = document.getElementById('btn-menu').getBoundingClientRect(), cx = t.left + t.width / 2, cy = t.top + t.height / 2;
            return [...document.querySelectorAll('#arc .arc-b')].map((b) => { const r = b.getBoundingClientRect(); return { place: b.dataset.place, d: Math.round(Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)), w: r.width, on: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, op: Number(getComputedStyle(b).opacity) }; }); });
          if (fan.length < 5 || fan.some((b) => b.d < 90 || b.w < 44 || !b.on || b.op < 0.99)) throw new Error(`the arc is not fanned out round the die: ${JSON.stringify(fan)}`);
          if (await shown(page, '#drawer')) throw new Error('the arc opened a screen too');
          // folded: the symbols are gone, and the next tap fans them out afresh (they grow out of the die again)
          await page.keyboard.press('Escape'); await closed('the arc, Escape');
          if (await page.evaluate(() => document.getElementById('menu-arc').classList.contains('out'))) throw new Error('a folded arc is still marked as out');
          const grown = await page.evaluate(async () => { document.getElementById('btn-menu').click(); const seen = []; for (let i = 0; i < 40; i++) { const b = document.querySelector('#arc .arc-b:last-child'); const r = b?.getBoundingClientRect(); seen.push(r ? Math.round(r.top) : null); await new Promise((ok) => requestAnimationFrame(ok)); } return seen; });
          const tops = grown.filter((v) => v !== null);
          if (new Set(tops).size < 3) throw new Error(`the arc did not grow out of the die the second time: ${[...new Set(tops)]}`);
          // nothing overshoots (R20): a symbol only ever moves towards where it ends up
          const end = tops.at(-1), dist = tops.map((v) => Math.abs(v - end));
          if (dist.some((v, i) => i && v > dist[i - 1] + 1)) throw new Error(`a symbol of the arc moved away from its place: ${tops}`);
          await sleep(600);
          await page.click('#arc [data-place="turns"]'); await waitShown(page, '#drawer');
          if (await shown(page, '#menu-arc')) throw new Error('choosing a place did not fold the arc');
          if ((await is()).path !== 'turns') throw new Error('the place chosen from the arc did not open');
          await sleep(850);
          const [x, y] = await die(); await tapAt(page, phone, x, y); await closed('the screen opened from the arc, the die');
          // the arc again after a screen: a closed menu opens on its arc, not on the screen it was at
          await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
          if (await shown(page, '#drawer')) throw new Error('a closed menu opened on a screen');
          const [mx, my] = await mapPoint('the arc'); await tapAt(page, phone, mx, my); await closed('the arc, the map');
          await motion('appear');
        });
      } finally { await ctx.close(); }
    });
  }
}
