import { join } from 'node:path';
import { sleep, spawnNear, spotsFor, scenario, wait, state, shown, waitShown, open, playSolo, tapAt, closeMenu, openMenu } from './lib.mjs';

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
      await run.do('the lobby has an About link that opens the menu above it, with the SRD statement, and closes back to the link', async () => {
        await open(page, url);
        await waitShown(page, '#splash', false, 2000).catch(() => { throw new Error('the splash is still up over the lobby'); });
        await page.click('#lobby-about');
        await waitShown(page, '#drawer'); await waitShown(page, '#about');
        if (!(await page.evaluate(() => { const r = document.getElementById('drawer').getBoundingClientRect(); return document.elementFromPoint(r.left + 40, r.top + 120)?.closest('#drawer') !== null; }))) throw new Error('the menu is under the lobby');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`About does not carry the SRD statement as given: ${text}`);
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== 'table/about') throw new Error('About is not under Table');
        await closeMenu(page);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'lobby-about') throw new Error('focus did not return to the About link');
      });
      await run.do('play solo: a token, a closed menu, no old panel buttons', async () => {
        await playSolo(page);
        await waitShown(page, '#btn-menu'); await waitShown(page, '#drawer', false);
        for (const id of ['btn-tracker', 'btn-log', 'btn-look', 'btn-dm']) if (await page.$('#' + id)) throw new Error(`#${id} is still on the page`);
      });
      await run.do('the token is one 64 px die at the bottom centre, over the map and clear of the top bar', async () => {
        const r = await rectOf(page, '#btn-menu');
        if (Math.abs(r.w - 64) > 1 || Math.abs(r.h - 64) > 1) throw new Error(`the token is ${r.w} x ${r.h}`);
        if (Math.abs((r.l + r.r) / 2 - r.vw / 2) > 2) throw new Error(`the token is not at the centre: ${JSON.stringify(r)}`);
        const k = await rectOf(page, '#dock');      // until the dock goes (stage M3) the token sits just above it
        if (r.b > k.t + 1 || k.t - r.b > 24) throw new Error(`the token is not at the bottom, above the dock: ${JSON.stringify(r)} dock ${k.t}`);
        if (await page.$('#top #btn-menu')) throw new Error('the token is still in the top bar');
        const who = await page.evaluate(() => { const b = document.getElementById('btn-menu'), q = b.getBoundingClientRect(); return { hit: document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest('#btn-menu') !== null, name: b.getAttribute('aria-label'), face: getComputedStyle(b.querySelector('.tk-face')).fill }; });
        if (!who.hit) throw new Error('something covers the token');
        if (who.name !== 'Menu') throw new Error(`the token is called ${who.name}`);
        if (!/^rgb\(201, 154, 62\)$/.test(who.face)) throw new Error(`the Classic die is not brass: ${who.face}`);
        if (await shown(page, '#menu-badge')) throw new Error('a badge shows with nothing waiting');
      });
      await run.do('the token opens the first level as a dialog: Character, Party, Dice, Log and chat, Table', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await waitShown(page, '#menu-root');
        await sleep(900);
        const r = await rectOf(page, '#drawer');
        if (phone) {
          if (Math.abs(r.w - r.vw) > 2 && r.w > 561) throw new Error(`the sheet is ${r.w} wide`);
          if (Math.abs(r.t - 0.12 * r.vh) > 4) throw new Error(`the sheet does not stop 12% below the top: ${r.t}`);
        } else if (r.l > 2 || r.w < 200 || r.w > 260) throw new Error(`a wide menu comes from the left, one 240 px column: ${JSON.stringify(r)}`);
        if ((await page.getAttribute('#btn-menu', 'aria-expanded')) !== 'true') throw new Error('aria-expanded');
        if ((await page.getAttribute('#drawer', 'role')) !== 'dialog') throw new Error('the menu is not a dialog over the map');
        const names = await page.$$eval('#menu-root .menu-row:not([hidden]) .mr-name', (b) => b.map((x) => x.textContent.trim()));
        if (names.join() !== 'Character,Party,Dice,Log and chat,Table') throw new Error(`the first level: ${names}`);
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== '') throw new Error('it did not open on the first level');
        if (await shown(page, '#tracker')) throw new Error('a screen shows on the first level');
        if (await page.$('#drawer-tabs')) throw new Error('the old tab strip is still there');
        const sum = await page.$eval('#sum-sheet', (e) => e.textContent);
        if (!/ · \d+ \/ \d+ HP$/.test(sum)) throw new Error(`the Character row says: ${sum}`);
        if (phone) {
          const small = await page.evaluate(() => [...document.querySelectorAll('#menu-root .menu-row:not([hidden]), #drawer-handle')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.id));
          if (small.length) throw new Error(`targets under 44 px: ${small}`);
          if (await shown(page, '#drawer-close')) throw new Error('a phone sheet has an x');
          if (!(await shown(page, '#drawer-handle'))) throw new Error('a phone sheet has no handle');
        } else if (!(await shown(page, '#drawer-close'))) throw new Error('a wide menu has no x');
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-root-${phone ? 'phone' : 'wide'}.png` }).catch(() => {});
      });
      await run.do('a row goes down a level with a breadcrumb; back goes up; a screen is the old panel with its ids', async () => {
        await page.click('#tab-turns'); await waitShown(page, '#tracker');
        await sleep(900);
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li[data-id]').length);
        if (rows < 4) throw new Error(`${rows} rows`);
        const crumb = await page.$eval('#crumb-list', (e) => e.textContent.replace(/\s+/g, ' ').trim());
        if (crumb !== 'MenuParty') throw new Error(`the breadcrumb says: ${crumb}`);
        if ((await page.$eval('#drawer-title', (e) => e.tagName + e.textContent)) !== 'H2Party') throw new Error('the heading');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'drawer-title') throw new Error('focus did not move to the heading of the new level');
        if (phone && (await page.evaluate(() => { const b = document.getElementById('drawer-back').getBoundingClientRect(); return b.width < 44 || b.height < 44; }))) throw new Error('the back arrow is under 44 px');
        await page.click('#drawer-back'); await wait(page, () => document.getElementById('drawer').dataset.path === '');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'tab-turns') throw new Error('back did not leave focus on the row that was chosen');
        await page.click('#tab-turns'); await waitShown(page, '#tracker');
        await page.click('#crumb-list [data-path=""]'); await wait(page, () => document.getElementById('drawer').dataset.path === '');
        await waitShown(page, '#tracker', false);
      });
      if (phone) await run.do('on a phone it stops above the dock and the dock stays usable', async () => {
        const d = await rectOf(page, '#drawer'), k = await rectOf(page, '#dock');
        if (d.b > k.t + 1) throw new Error(`the menu (${d.b}) covers the dock (${k.t})`);
        const hit = await page.evaluate(() => { const r = document.querySelector('#party button').getBoundingClientRect(); return document.elementFromPoint(r.left + 8, r.top + 8)?.closest('#party') !== null; });
        if (!hit) throw new Error('the character chips are not reachable');
      });
      await run.do('the token, Escape, the handle or x, and the dimmed map each close it, and focus returns to the token', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the token (token)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the token (Escape)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        await page.click(phone ? '#drawer-handle' : '#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the token (handle or x)');
        if (!phone) {
          await page.keyboard.press('m'); await waitShown(page, '#drawer');
          await page.keyboard.press('m'); await waitShown(page, '#drawer', false);
        }
      });
      await run.do('one tap on the map closes every level, and that tap does nothing else', async () => {
        await openMenu(page, 'table/settings'); await sleep(900);
        const clear = phone ? [200, 40] : [1200, 300];
        const at = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, clear);
        if (at !== 'drawer-scrim') throw new Error(`the clear zone is ${at}, not the dimmed map's scrim`);
        const pos = await state(page, (S) => JSON.stringify(Object.values(S.entities).map((e) => e.pos)));
        await tapAt(page, touch, clear[0], clear[1]);
        await waitShown(page, '#drawer', false);
        if ((await state(page, (S) => JSON.stringify(Object.values(S.entities).map((e) => e.pos)))) !== pos) throw new Error('the tap moved somebody');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the token (the map)');
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== '') throw new Error('a closed menu did not open on the first level');
        await closeMenu(page);
      });
      await run.do('a drag down on the handle (a sheet) or away from the side on the header (columns) closes it', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(900);
        await page.evaluate((isPhone) => { const h = document.getElementById(isPhone ? 'drawer-handle' : 'drawer-head'), r = h.getBoundingClientRect(), y = r.top + 20, x = r.left + 160;
          const fire = (t, d) => h.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: isPhone ? x : x - d, clientY: isPhone ? y + d : y, bubbles: true, isPrimary: true }));
          fire('pointerdown', 0); fire('pointermove', 30); fire('pointermove', 90); fire('pointerup', 90); }, phone);
        await waitShown(page, '#drawer', false);
      });
      await run.do('Tab stays inside an open menu', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(300);
        for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('#drawer')))) throw new Error('focus left the menu');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
      });
      await run.do('arrow keys: Up and Down move between rows, Right or Enter opens, Left or Backspace goes back, Escape closes every level', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#drawer'); await sleep(900);
        const at = () => page.evaluate(() => document.activeElement?.id);
        await page.focus('#tab-sheet'); await page.keyboard.press('ArrowDown');
        if ((await at()) !== 'tab-turns') throw new Error(`ArrowDown reached ${await at()}`);
        await page.keyboard.press('End'); if ((await at()) !== 'tab-table') throw new Error(`End reached ${await at()}`);
        await page.keyboard.press('ArrowUp'); await page.keyboard.press('Home'); if ((await at()) !== 'tab-sheet') throw new Error(`Home reached ${await at()}`);
        await page.keyboard.press('End'); await page.keyboard.press('ArrowRight');
        await wait(page, () => document.getElementById('drawer').dataset.path === 'table');
        await page.keyboard.press('ArrowLeft'); await wait(page, () => document.getElementById('drawer').dataset.path === '');
        if ((await at()) !== 'tab-table') throw new Error(`Left left the focus on ${await at()}`);
        await page.keyboard.press('Enter'); await wait(page, () => document.getElementById('drawer').dataset.path === 'table');
        await page.keyboard.press('Backspace'); await wait(page, () => document.getElementById('drawer').dataset.path === '');
        // At the root there is no back, and the key must not reach the game (it would walk the party or turn the camera).
        await page.evaluate(() => { window.__leaked = []; addEventListener('keydown', (e) => window.__leaked.push(e.key)); });
        await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Backspace');
        if ((await page.evaluate(() => window.__leaked.length)) !== 0) throw new Error('ArrowLeft or Backspace at the root reached the game');
        // The heading: Down or Home reaches the first row.
        await page.focus('#drawer-title'); await page.keyboard.press('ArrowDown');
        if ((await at()) !== 'tab-sheet') throw new Error(`ArrowDown from the heading reached ${await at()}`);
        await page.focus('#drawer-title'); await page.keyboard.press('Home');
        if ((await at()) !== 'tab-sheet') throw new Error(`Home from the heading reached ${await at()}`);
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
        await openMenu(page, 'table/about'); await page.focus('#drawer-title');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
      });
      await run.do('About holds the SRD statement word for word, the licences and a place for model packs', async () => {
        await openMenu(page, 'about');
        const text = await page.$eval('#ab-srd-text', (e) => e.textContent);
        if (text !== SRD_TEXT) throw new Error(`the statement differs: ${text}`);
        const all = await page.$eval('#about', (e) => e.textContent);
        for (const want of ['Hextable contributors', 'three.js authors', 'Model packs', 'Silkscreen', 'Three.js']) if (!all.includes(want)) throw new Error(`About lacks ${want}`);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-about-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('Setup holds the preferences; the dice and animation are the Dice screen\'s', async () => {
        await openMenu(page, 'settings');
        for (const id of ['set-theme', 'set-token', 'set-motion', 'set-side', 'set-floors', 'dm-dice-monsters']) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not in Setup`);
        await openMenu(page, 'dice');
        for (const id of ['dice-show', 'pace-pick', 'dice-auto-mine']) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not on the Dice screen`);
      });
      await run.do('the token sits at the bottom centre, right or left as chosen, and keeps its place', async () => {
        await openMenu(page, 'settings');
        for (const at of ['left', 'right']) {
          await page.selectOption('#set-token', at); await closeMenu(page); await sleep(100);
          const b = await rectOf(page, '#btn-menu');
          if (at === 'left' ? b.l > 40 : b.vw - b.r > 40) throw new Error(`the token is not at the ${at}: ${JSON.stringify(b)}`);
          if ((await page.evaluate(() => localStorage.getItem('hextable.menuToken'))) !== JSON.stringify(at)) throw new Error('the place was not stored');
          await openMenu(page, 'settings');
        }
        await page.selectOption('#set-token', 'center'); await closeMenu(page); await sleep(100);
        const b = await rectOf(page, '#btn-menu');
        if (Math.abs((b.l + b.r) / 2 - b.vw / 2) > 2) throw new Error('the token did not come back to the centre');
      });
      await run.do('the menu slides by default, and under "Just appear" or reduced motion nothing moves at all', async () => {
        // The rectangles of the menu and its screen on every frame for a while after the token is tapped.
        const frames = (what) => page.evaluate(async (w) => {
          const d = document.getElementById('drawer'), seen = [];
          const snap = () => { const q = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); }; seen.push(d.hidden ? 'hidden' : `${q(d)}|${q(document.getElementById('drawer-body'))}|${q(document.getElementById('menu-root'))}`); };
          if (w === 'open') document.getElementById('btn-menu').click(); else document.getElementById('tab-turns').click();
          for (let i = 0; i < 14; i++) { snap(); await new Promise((r) => requestAnimationFrame(r)); }
          return seen;
        }, what);
        const moves = (seen) => new Set(seen.filter((s) => s !== 'hidden')).size;
        let seen = await frames('open'); await sleep(900);
        if (moves(seen) < 3) throw new Error(`the menu did not slide: ${seen.slice(0, 4)}`);
        let level = await frames('level'); await sleep(900);
        if (moves(level) < 2) throw new Error('a level did not push in');
        await closeMenu(page);
        await openMenu(page, 'settings');
        await page.selectOption('#set-motion', 'appear');
        if ((await page.evaluate(() => localStorage.getItem('hextable.menuMotion'))) !== '"appear"') throw new Error('Just appear was not stored');
        await closeMenu(page);
        seen = await frames('open'); await sleep(200);
        if (moves(seen) !== 1 || seen[0] === 'hidden') throw new Error(`under Just appear the menu moved or came late: ${new Set(seen)}`);
        level = await frames('level');
        if (moves(level) !== 1) throw new Error(`under Just appear a level moved: ${new Set(level)}`);
        await closeMenu(page);
        if (await shown(page, '#drawer')) throw new Error('under Just appear the menu did not go at once');
        await openMenu(page, 'settings'); await page.selectOption('#set-motion', 'slide'); await closeMenu(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        seen = await frames('open'); await sleep(200);
        if (moves(seen) !== 1) throw new Error(`under reduced motion the menu moved: ${new Set(seen)}`);
        await closeMenu(page);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      });
      if (!phone) await run.do('a wide menu keeps its columns side by side, and takes its side from Setup', async () => {
        await openMenu(page, 'table/settings'); await sleep(900);
        const cols = await page.evaluate(() => ['menu-root', 'menu-table', 'drawer-body'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), r.width > 0]; }));
        if (!cols.every((c, i) => c[2] && (!i || c[0] >= cols[i - 1][1] - 1))) throw new Error(`the three levels are not side by side: ${JSON.stringify(cols)}`);
        const tb = await rectOf(page, '#btn-menu'), dr = await rectOf(page, '#drawer');
        if (tb.l < dr.r - 1) throw new Error(`the token is over the columns: token ${tb.l}-${tb.r}, columns to ${dr.r}`);
        await page.selectOption('#set-side', 'right'); await sleep(900);
        const r = await rectOf(page, '#drawer');
        if (Math.abs(r.r - r.vw) > 2) throw new Error(`not on the right: ${JSON.stringify(r)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.drawerSide'))) !== '"right"') throw new Error('the side was not stored');
        const b = await rectOf(page, '#btn-menu');
        if (b.r > r.l + 1) throw new Error(`the token is over the columns: token ${b.l}-${b.r}, columns from ${r.l}`);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-right-wide.png` : '/dev/null' }).catch(() => {});
        await page.selectOption('#set-side', 'left'); await sleep(900); await closeMenu(page);
      });
      await run.do('a theme chosen in Setup applies and is stored, and the token takes its colours; the look of floors is stored too', async () => {
        await openMenu(page, 'settings');
        const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        await page.selectOption('#set-theme', 'sunlit');
        const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        if (before === after || (await page.evaluate(() => localStorage.getItem('hextable.theme'))) !== '"sunlit"') throw new Error('the theme did not change');
        const face = await page.$eval('#btn-menu .tk-face', (e) => getComputedStyle(e).fill);
        if (face !== 'rgb(47, 158, 107)') throw new Error(`the Sunlit die is not green: ${face}`);
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-sunlit-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
        await page.selectOption('#set-floors', 'hex');
        if ((await page.evaluate(() => localStorage.getItem('hextable.floors'))) !== '"hex"') throw new Error('floors was not stored');
        await page.selectOption('#set-floors', 'rooms'); await page.selectOption('#set-theme', 'classic');
        await closeMenu(page);
      });
      if (!phone) await run.do('pinned, the menu stays open and the map makes room for it', async () => {
        await openMenu(page, 'turns');
        await page.click('#drawer-pin'); await sleep(300);
        const c = await rectOf(page, '#gl'), d = await rectOf(page, '#drawer');
        if (Math.abs(c.w - (c.vw - d.w)) > 2) throw new Error(`the canvas (${c.w}) did not give way to the menu (${d.w})`);
        if ((await page.getAttribute('#drawer', 'role')) !== 'complementary') throw new Error('a pinned menu is a landmark, not a dialog');
        if (await shown(page, '#drawer-scrim')) throw new Error('a pinned menu dims the map');
        // A press and drag on the map (not a tap: the party stands near enemies, and a tap there starts a fight) must not close a pinned menu.
        await page.mouse.move(1100, 300); await page.mouse.down(); await page.mouse.move(1100, 360, { steps: 4 }); await page.mouse.up(); await sleep(200);
        if (!(await shown(page, '#drawer'))) throw new Error('a press on the map closed a pinned menu');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-pinned.png` : '/dev/null' }).catch(() => {});
        await page.click('#drawer-pin'); await sleep(300);
        const c2 = await rectOf(page, '#gl');
        if (c2.w !== c2.vw) throw new Error('the canvas did not come back');
        await closeMenu(page);
      });
      await run.do('a reaction question hides the menu for as long as it is asked, and gives it back after', async () => {
        await openMenu(page, 'turns');
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync({ ...h.state, prompt: { waiting: true } }); });
        await waitShown(page, '#drawer', false);
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync(h.state); });
        await waitShown(page, '#drawer');
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== 'turns') throw new Error('the menu did not come back where it was');
        await closeMenu(page);
      });
      await run.do('in a fight the tracker lists the turns in the engine\'s order, top to bottom, with initiative and the turn marked', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const h = window.hextable, S = h.state, foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden); h.act({ type: 'startEncounter', center: foe.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await openMenu(page, 'turns'); await sleep(300);
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
        if ((await page.$eval('#tab-turns .mr-name', (e) => e.textContent.trim())) !== 'Turns') throw new Error('the row is not called Turns in a fight');
        if (!/^Round 1 · .+'s turn$/.test(await page.$eval('#sum-turns', (e) => e.textContent.trim()))) throw new Error('the row does not say whose turn it is');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-turns-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('a tap on a row selects that creature, and on a phone closes the drawer; the order strip opens it again', async () => {
        const id = await state(page, (S) => S.encounter.order.at(-1).id);
        if (phone) await page.tap(`#tr-list li[data-id="${id}"] .tr-main`); else await page.click(`#tr-list li[data-id="${id}"] .tr-main`);
        await wait(page, (i) => window.hextable.state && document.querySelector('#c-name')?.textContent === window.hextable.state.entities[i].name, id);
        if (phone) await waitShown(page, '#drawer', false);
        else { await closeMenu(page); }
        // The fight starts at a foe with the party far off, so "The party has fallen" can be up by now (it comes when the beats are still): put it aside, it is not what this step is about.
        if (await shown(page, '#df .df-card')) { await page.click('#df [data-df="aside"]'); await waitShown(page, '#df .df-card', false); }
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
        await openMenu(host, 'dm'); await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        await b.click();
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.owner));
      });
      let secret;
      await run.do('a fight with an invisible creature that the party cannot see', async () => {
        // The goblin goes on a hex the engine takes it on, next to a foe (the map is random per game, and the hex at a fixed offset was refused on about 2 maps in 100, #418).
        const foe = await host.evaluate(() => { document.getElementById('dm-auto').checked = false; window.hextable.act({ type: 'setting', key: 'sight', value: 'light' }); const S = window.hextable.state; const f = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden); return { id: f.id, pos: f.pos }; });
        const id = await spawnNear(host, 'goblin-warrior', { near: foe.id, min: 1, radius: 2 });
        await host.evaluate((i) => window.hextable.act({ type: 'condition', actor: i, condition: 'invisible' }), id);
        // The fighter joins the fight beside the foe, on a hex the engine takes a creature of its size on now that the goblin stands there (a fixed hex was occupied on about 2 maps in 100). A hosted table takes the server's seed, so this cannot be replayed with SMOKE_SEED.
        let found = await spotsFor(host, 'goblin-warrior', { near: foe.id, min: 1, radius: 1 });
        if (!found.spots.length) found = await spotsFor(host, 'goblin-warrior', { near: foe.id, min: 1, radius: 2 });
        if (!found.spots.length) throw new Error(`no hex beside the foe takes the fighter: ${found.error}`);
        const spot = found.spots[0];                                                           // a party member in the fight, or it ends at once
        await host.evaluate((at) => window.hextable.act({ type: 'place', actor: 'fighter', to: at }), spot);
        await wait(host, (p) => { const q = window.hextable.state.entities.fighter.pos; return q.q === p.q && q.r === p.r; }, spot, 5000)
          .catch(async () => { throw new Error(`the fighter was not placed beside the foe: toast "${await host.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); });
        await host.evaluate((f) => window.hextable.act({ type: 'startEncounter', center: f.pos }), foe);
        secret = { id, name: await state(host, (S, i) => S.entities[i].name, id) };
        await wait(phone, () => !!window.hextable.state.encounter);
        if (await state(phone, (S, i) => !!S.entities[i], secret.id)) throw new Error('the phone was sent the invisible creature');
      });
      await run.do('the DM\'s tracker lists everyone in order, the invisible one too; the phone\'s lists only what it was sent', async () => {
        await openMenu(host, 'turns'); await openMenu(phone, 'turns'); await sleep(300);
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

// A phone on its side is 390 high and the dock fills it: the menu must still be reachable and tappable, and the dock must come back.
async function drawerLandscape(browser, url) {
  await scenario('drawer at 844x390 with touch', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter);
      const boxOf = (sel) => page.evaluate((x) => { const r = document.querySelector(x).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
      await run.do('the token is on the screen and at least 44 px, with the dock showing', async () => {
        const t = await boxOf('#btn-menu');
        if (t.t < 0 || t.b > 390 || t.l < 0 || t.r > 844 || t.w < 44 || t.h < 44) throw new Error(`the token is at ${JSON.stringify(t)}`);
        if (!(await shown(page, '#dock'))) throw new Error('no dock');
      });
      await run.do('the menu opens, the dock steps aside, every first-level row is tappable and none is under the token', async () => {
        await page.tap('#btn-menu'); await waitShown(page, '#drawer');
        await sleep(1200);                      // the token slides beside the column: look when it has arrived
        const rows = await page.$$eval('#menu-root [data-go]', (x) => x.map((e) => { const r = e.getBoundingClientRect(); return { k: e.dataset.go, t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height }; }).filter((r) => r.h > 0));
        if (rows.length < 5) throw new Error(`rows: ${JSON.stringify(rows)}`);
        const tok = await boxOf('#btn-menu'), dr0 = await boxOf('#drawer');
        for (const r of rows) {
          if (r.h < 44) throw new Error(`row ${r.k} is ${r.h} high`);
          if (r.l < tok.r && Math.min(r.r, dr0.r) > tok.l && r.b > tok.t && r.t < tok.b) throw new Error(`row ${r.k} is under the token: ${JSON.stringify([r, tok])}`);
        }
        if (await shown(page, '#dock') && (await page.evaluate(() => getComputedStyle(document.getElementById('dock')).visibility)) !== 'hidden') throw new Error('the dock is still showing over the menu');
        const dr = await boxOf('#drawer');
        if (dr.h < 300) throw new Error(`the menu is only ${dr.h} high`);
      });
      await run.do('Settings is reached by taps, one setting changes, and closing brings the dock back', async () => {
        await openMenu(page, 'table/settings');
        await page.selectOption('#set-motion', 'appear');
        if ((await page.evaluate(() => document.body.dataset.menuMotion)) !== 'appear') throw new Error('the motion setting did not take');
        await page.selectOption('#set-motion', 'slide');
        await closeMenu(page);
        await sleep(300);
        const vis = await page.evaluate(() => getComputedStyle(document.getElementById('dock')).visibility);
        if (vis !== 'visible' || !(await shown(page, '#dock'))) throw new Error(`the dock did not come back (${vis})`);
        const t = await boxOf('#btn-menu');
        if (t.t < 0 || t.b > 390) throw new Error(`the token is off the screen: ${JSON.stringify(t)}`);
      });
      if (process.env.SMOKE_SHOTS) { await openMenu(page, ''); await sleep(1200); await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-root-landscape.png` }).catch(() => {}); await closeMenu(page); }
      await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-landscape.png` : '/dev/null' }).catch(() => {});
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=drawer.
export default async function (browser, url) {
  await drawerPass(browser, url, 'drawer at 1280x800', { viewport: { width: 1280, height: 800 } });
  await drawerPass(browser, url, 'drawer at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await drawerLandscape(browser, url);
  await drawerTable(browser, url);
}
