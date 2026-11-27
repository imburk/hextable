import { join } from 'node:path';
import { sleep, spawnNear, spotsFor, scenario, wait, state, shown, waitShown, open, playSolo, tapAt, closeMenu, openMenu, openArc, menuStill } from './lib.mjs';

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
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== 'about') throw new Error('About did not open as its own screen');
        await closeMenu(page);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'lobby-about') throw new Error('focus did not return to the About link');
      });
      await run.do('play solo: a token, a closed menu, no old panel buttons', async () => {
        await playSolo(page);
        await waitShown(page, '#btn-menu'); await waitShown(page, '#drawer', false);
        for (const id of ['btn-tracker', 'btn-log', 'btn-look', 'btn-dm']) if (await page.$('#' + id)) throw new Error(`#${id} is still on the page`);
      });
      await run.do('the token is one 64 px die at the bottom centre, over the map, and the dock is gone', async () => {
        const r = await rectOf(page, '#btn-menu');
        if (Math.abs(r.w - 64) > 1 || Math.abs(r.h - 64) > 1) throw new Error(`the token is ${r.w} x ${r.h}`);
        if (Math.abs((r.l + r.r) / 2 - r.vw / 2) > 2) throw new Error(`the token is not at the centre: ${JSON.stringify(r)}`);
        // M3 (round 6): the token is at the bottom edge and stays there; M4: the dock is gone, the action rows are the groups of the Character screen.
        if (r.vh - r.b > 24 || r.vh - r.b < 8) throw new Error(`the token is not at the bottom edge: ${JSON.stringify(r)}`);
        if (await page.$('#dock, #ap-tabs')) throw new Error('the dock is still in the page (M4 took it away)');
        for (const gone of ['#top', '#order', '#status']) if (await page.$(gone)) throw new Error(`${gone} is still on the page (M3 took it away)`);
        const who = await page.evaluate(() => { const b = document.getElementById('btn-menu'), q = b.getBoundingClientRect(); return { hit: document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest('#btn-menu') !== null, name: b.getAttribute('aria-label'), face: getComputedStyle(b.querySelector('.tk-face')).fill }; });
        if (!who.hit) throw new Error('something covers the token');
        if (who.name !== 'Menu') throw new Error(`the token is called ${who.name}`);
        if (!/^rgb\(201, 154, 62\)$/.test(who.face)) throw new Error(`the Classic die is not brass: ${who.face}`);
        if (await shown(page, '#menu-badge')) throw new Error('a badge shows with nothing waiting');
      });
      await run.do('a tap on the token fans the places out in an arc round it: a symbol for each character, then Party, Dice, Log and chat, Setup, DM tools', async () => {
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        await wait(page, () => document.getElementById('menu-arc').classList.contains('out'));
        await sleep(800);
        if (await shown(page, '#drawer')) throw new Error('a screen is up with only the arc asked for');
        if ((await page.getAttribute('#btn-menu', 'aria-expanded')) !== 'true') throw new Error('aria-expanded');
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== '') throw new Error('it did not open on the arc');
        const syms = await page.$$eval('#arc .arc-b', (b) => b.map((x) => { const r = x.getBoundingClientRect(); return { name: x.querySelector('.ab-label').textContent, char: x.classList.contains('char'), spoken: x.textContent.replace(/\s+/g, ' ').trim(), w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, svg: !!x.querySelector('svg, .pr-sig') }; }));
        const names = syms.filter((x) => !x.char).map((x) => x.name);
        if (names.join() !== 'Party,Dice,Log and chat,Setup,DM tools') throw new Error(`the places: ${names}`);      // solo, the player is the DM too
        const chars = syms.filter((x) => x.char);
        if (chars.length !== 4 || syms.findIndex((x) => !x.char) !== 4) throw new Error(`the characters are not the first four symbols: ${JSON.stringify(syms.map((x) => x.name))}`);
        if (chars.some((c) => !/\d+ \/ \d+ HP|Your turn|Down|Play as/.test(c.spoken))) throw new Error(`a character's symbol does not say its state: ${JSON.stringify(chars.map((c) => c.spoken))}`);
        const vp = page.viewportSize(), tok = await rectOf(page, '#btn-menu');
        for (const x of syms) {
          if (x.w < 44 || x.h < 44) throw new Error(`${x.name} is ${x.w} x ${x.h}`);
          if (!x.svg || !x.name) throw new Error(`${x.name || 'a symbol'} has no drawing or no words`);
          if (x.l < 0 || x.t < 0 || x.r > vp.width || x.b > vp.height) throw new Error(`${x.name} is off the screen: ${JSON.stringify(x)}`);
          if (x.l < tok.r && x.r > tok.l && x.t < tok.b && x.b > tok.t) throw new Error(`${x.name} is on the die`);
        }
        for (let i = 0; i < syms.length; i++) for (let j = 0; j < i; j++) if (Math.hypot((syms[i].l + syms[i].r - syms[j].l - syms[j].r) / 2, (syms[i].t + syms[i].b - syms[j].t - syms[j].b) / 2) < 50) throw new Error(`${syms[i].name} and ${syms[j].name} touch`);
        if (await page.$('#drawer-tabs')) throw new Error('the old tab strip is still there');
        // The note about the health ring, once on a device: one line and Got it.
        if (!(await shown(page, '#ring-note')) || !/health/.test(await page.textContent('#ring-note-text'))) throw new Error('no note about the health ring the first time');
        await page.click('#ring-ok'); await waitShown(page, '#ring-note', false);
        if ((await page.evaluate(() => localStorage.getItem('hextable.seen.ring'))) !== 'true') throw new Error('the note was not put away for good');
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-arc-${phone ? 'phone' : 'wide'}.png` }).catch(() => {});
      });
      await run.do('the words come up under the symbols after 3 seconds, and at once when Setup says Always (then the strip shows them too)', async () => {
        await closeMenu(page); await openArc(page);
        const up = () => page.evaluate(() => getComputedStyle(document.querySelector('#arc .ab-label')).opacity === '1');
        await sleep(600);
        if (await up()) throw new Error('the words are up before 3 seconds');
        await wait(page, () => document.getElementById('menu-arc').classList.contains('labels') && getComputedStyle(document.querySelector('#arc .ab-label')).opacity === '1', null, 6000).catch(() => { throw new Error('the words did not come up after 3 seconds'); });
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-arc-labels-${phone ? 'phone' : 'wide'}.png` }).catch(() => {});
        await openMenu(page, 'settings/menu'); await page.selectOption('#set-labels', 'always');
        if ((await page.evaluate(() => localStorage.getItem('hextable.menuLabels'))) !== '"always"') throw new Error('Always was not stored');
        if (!(await page.evaluate(() => { const n = document.querySelector('#tab-settings .mr-name').getBoundingClientRect(); return n.width > 20 && n.height > 8; }))) throw new Error('under Always the strip shows no words');
        await closeMenu(page); await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        await wait(page, () => getComputedStyle(document.querySelector('#arc .ab-label')).opacity === '1', null, 1500).catch(() => { throw new Error('under Always the words are not there from the start'); });
        await openMenu(page, 'settings/menu'); await page.selectOption('#set-labels', '3s'); await closeMenu(page);
      });
      await run.do('a symbol opens its screen as a dialog: a sheet from the bottom on a phone with a handle and no x, a column from the side on a wide screen', async () => {
        await openArc(page);
        await page.click('#arc [data-place="turns"]'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await waitShown(page, '#menu-arc', false);
        await sleep(900);
        const r = await rectOf(page, '#drawer');
        if (phone) {
          if (Math.abs(r.w - r.vw) > 2 && r.w > 561) throw new Error(`the sheet is ${r.w} wide`);
          if (Math.abs(r.t - 0.12 * r.vh) > 4) throw new Error(`the sheet does not stop 12% below the top: ${r.t}`);
        } else if (r.l > 2 || r.w < 340 || r.w > 580) throw new Error(`a wide menu comes from the left, one column: ${JSON.stringify(r)}`);
        if ((await page.getAttribute('#drawer', 'role')) !== 'dialog') throw new Error('the menu is not a dialog over the map');
        if (phone) {
          const small = await page.evaluate(() => [...document.querySelectorAll('#menu-root .menu-row:not([hidden]), #menu-root .pr, #drawer-handle')].filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).map((b) => b.id || b.dataset.id));
          if (small.length) throw new Error(`targets under 44 px: ${small}`);
          if (await shown(page, '#drawer-close')) throw new Error('a phone sheet has an x');
          if (!(await shown(page, '#drawer-handle'))) throw new Error('a phone sheet has no handle');
        } else if (!(await shown(page, '#drawer-close'))) throw new Error('a wide menu has no x');
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-screen-${phone ? 'phone' : 'wide'}.png` }).catch(() => {});
      });
      await run.do('every screen is headed by its own name; the strip across its top marks the place and goes to the others; a section keeps the page\'s name, and a screen inside a screen has a way back that names it', async () => {
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li[data-id]').length);
        if (rows < 4) throw new Error(`${rows} rows`);
        if ((await page.$eval('#drawer-title', (e) => e.tagName + e.textContent)) !== 'H2Party') throw new Error(`the heading: ${await page.textContent('#drawer-title')}`);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'drawer-title') throw new Error('focus did not move to the heading of the screen');
        if (/Menu/.test(await page.$eval('#drawer-head', (e) => e.textContent))) throw new Error('a screen is headed "Menu"');
        const cur = () => page.$$eval('#menu-root [aria-current="page"]', (x) => x.map((b) => b.id || b.dataset.id));
        if ((await cur()).join() !== 'tab-turns') throw new Error(`the strip marks ${await cur()}`);
        const strip = await page.$$eval('#menu-root .pr, #menu-root .menu-row:not([hidden])', (x) => x.map((b) => b.querySelector('strong, .mr-name').textContent.trim()));
        if (strip.slice(4).join() !== 'Party,Dice,Log and chat,Setup,DM tools' || strip.length !== 9) throw new Error(`the strip: ${strip}`);
        // Another place, from the strip: the screen swaps where it is, and the heading is that screen's name.
        await openMenu(page, 'settings');
        if ((await page.textContent('#drawer-title')) !== 'Setup' || (await cur()).join() !== 'tab-settings') throw new Error(`Setup: heading ${await page.textContent('#drawer-title')}, strip ${await cur()}`);
        await waitShown(page, '#tracker', false);
        await openMenu(page, 'sheet');
        const who = await state(page, (S) => S.entities[document.querySelector('#party .pr.sel').dataset.id].name);
        if ((await page.textContent('#drawer-title')) !== who) throw new Error(`a character's page is headed ${await page.textContent('#drawer-title')}, not ${who}`);
        // The strip scrolls sideways when the places do not fit, with an arrow only at an end that has more.
        if (phone) {
          const ends = () => page.evaluate(() => ({ prev: !document.getElementById('strip-prev').hidden, next: !document.getElementById('strip-next').hidden, left: document.getElementById('menu-root').scrollLeft }));
          await page.evaluate(() => { document.getElementById('menu-root').scrollLeft = 0; }); await sleep(200);
          let e = await ends();
          if (e.prev || !e.next) throw new Error(`at its start the strip shows ${JSON.stringify(e)}`);
          const box = await rectOf(page, '#strip-next');
          if (box.w < 32 || box.h < 44) throw new Error(`the strip's arrow is ${box.w} x ${box.h}`);
          await page.click('#strip-next'); await sleep(700);
          e = await ends();
          if (!e.prev || e.left < 100) throw new Error(`a tap on the arrow moved the strip to ${JSON.stringify(e)}`);
          const top = await page.evaluate(() => document.getElementById('drawer-body').scrollTop);
          if (top !== 0) throw new Error('moving the strip scrolled the screen');
        }
        // M10: a page with sections keeps its own name while a section is open; the section's bar says it is open, and Left shuts it with the focus on its bar.
        await openMenu(page, 'dm/creatures');
        if ((await page.textContent('#drawer-title')) !== 'DM tools') throw new Error(`the heading with a section open: ${await page.textContent('#drawer-title')}`);
        if (await shown(page, '#drawer-back')) throw new Error('a section of a page is not a screen under it: there is no way back to show');
        if ((await page.getAttribute('#acc-bar-dm-creatures', 'aria-expanded')) !== 'true' || !(await shown(page, '#dm-spawn'))) throw new Error('Creatures is not open');
        await page.focus('#acc-bar-dm-creatures'); await page.keyboard.press('ArrowLeft'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'acc-bar-dm-creatures') throw new Error('shutting a section did not leave the focus on its bar');
        // "All tools on one page" is a screen under DM tools: the way back names where it goes.
        await openMenu(page, 'dm/all');
        if (!/DM tools/.test(await page.textContent('#drawer-back')) || (await page.getAttribute('#drawer-back', 'aria-label')) !== 'Back to DM tools') throw new Error(`the way back says: ${await page.textContent('#drawer-back')}`);
        if (phone && (await page.evaluate(() => { const b = document.getElementById('drawer-back').getBoundingClientRect(); return b.width < 44 || b.height < 44; }))) throw new Error('the way back is under 44 px');
        await page.click('#drawer-back'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm');
        if ((await page.evaluate(() => document.activeElement?.dataset.sec)) !== 'all') throw new Error('back did not leave focus on the row that was chosen');
        if ((await page.textContent('#drawer-title')) !== 'DM tools') throw new Error('the heading after going back');
      });
      if (phone) await run.do('on a phone the sheet runs to the bottom edge, its screen ends above the token, and the strip is its first row', async () => {
        const d = await rectOf(page, '#drawer'), t = await rectOf(page, '#btn-menu');
        if (d.vh - d.b > 1) throw new Error(`the sheet stops ${d.vh - d.b} px short of the bottom`);
        const lv = await page.evaluate(() => document.getElementById('menu-levels').getBoundingClientRect().bottom);
        if (lv > t.t + 1) throw new Error(`the screen (${lv}) runs under the token (${t.t})`);
        const hit = await page.evaluate(() => { const s = document.getElementById('menu-root'); s.scrollLeft = 0; const r = s.querySelector('#party button').getBoundingClientRect(); return document.elementFromPoint(r.left + 24, r.top + 24)?.closest('#party') !== null && r.top < document.getElementById('drawer-head').getBoundingClientRect().top; });
        if (!hit) throw new Error('the characters\' symbols are not reachable at the top of the sheet');
      });
      await run.do('the token stays exactly where it is while the arc fans out, a screen opens, the place changes, and it closes', async () => {
        const at = () => page.evaluate(() => { const r = document.getElementById('btn-menu').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(); });
        await closeMenu(page); await sleep(200);
        const home = await at(); const seen = [];
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        for (let i = 0; i < 6; i++) { seen.push(await at()); await sleep(150); }       // mid-slide too
        for (const where of ['sheet', 'turns', 'table/settings', 'dice']) { await openMenu(page, where); seen.push(await at()); }
        await closeMenu(page);
        for (let i = 0; i < 6; i++) { seen.push(await at()); await sleep(150); }
        const moved = seen.filter((x) => x !== home);
        if (moved.length) throw new Error(`the token moved: home ${home}, then ${[...new Set(moved)].join(' | ')}`);
      });
      await run.do('the token and Escape fold the arc; the token, Escape and the handle or x close a screen; focus returns to the token', async () => {
        const focus = () => page.evaluate(() => document.activeElement?.id);
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc', false);
        if ((await focus()) !== 'btn-menu') throw new Error('focus did not return to the token (token, arc)');
        if ((await page.getAttribute('#btn-menu', 'aria-expanded')) !== 'false') throw new Error('aria-expanded after closing');
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        await page.keyboard.press('Escape'); await waitShown(page, '#menu-arc', false);
        if ((await focus()) !== 'btn-menu') throw new Error('focus did not return to the token (Escape, arc)');
        await openMenu(page, 'turns');
        await page.click('#btn-menu'); await waitShown(page, '#drawer', false);
        if ((await focus()) !== 'btn-menu') throw new Error('focus did not return to the token (token, screen)');
        if (await shown(page, '#menu-arc')) throw new Error('closing a screen by the die left the arc up');
        await openMenu(page, 'turns');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
        if ((await focus()) !== 'btn-menu') throw new Error('focus did not return to the token (Escape, screen)');
        await openMenu(page, 'turns');
        await page.click(phone ? '#drawer-handle' : '#drawer-close'); await waitShown(page, '#drawer', false);
        if ((await focus()) !== 'btn-menu') throw new Error('focus did not return to the token (handle or x)');
        if (!phone) {
          await page.keyboard.press('m'); await waitShown(page, '#menu-arc');
          await page.keyboard.press('m'); await waitShown(page, '#menu-arc', false);
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
        // A closed menu opens on its arc, and one tap on the map folds that too and does nothing else.
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc'); await sleep(700);
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== '') throw new Error('a closed menu did not open on the arc');
        if ((await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, clear)) !== 'drawer-scrim') throw new Error('with the arc out the map is not the clear zone');
        await tapAt(page, touch, clear[0], clear[1]);
        await waitShown(page, '#menu-arc', false);
        if ((await state(page, (S) => JSON.stringify(Object.values(S.entities).map((e) => e.pos)))) !== pos) throw new Error('the tap that folded the arc moved somebody');
        if (await page.evaluate(() => window.hextable.drawer.isOpen)) throw new Error('the menu is still open');
      });
      await run.do('a drag down on the handle (a sheet) or away from the side on the header (columns) closes it', async () => {
        await openMenu(page, 'turns'); await sleep(900);
        await page.evaluate((isPhone) => { const h = document.getElementById(isPhone ? 'drawer-handle' : 'drawer-head'), r = h.getBoundingClientRect(), y = r.top + 20, x = r.left + 160;
          const fire = (t, d) => h.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: isPhone ? x : x - d, clientY: isPhone ? y + d : y, bubbles: true, isPrimary: true }));
          fire('pointerdown', 0); fire('pointermove', 30); fire('pointermove', 90); fire('pointerup', 90); }, phone);
        await waitShown(page, '#drawer', false);
      });
      await run.do('Tab stays inside the arc, and inside an open screen', async () => {
        await openArc(page);
        for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('#menu-arc')))) throw new Error(`focus left the arc: ${await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)}`);
        await page.keyboard.press('Escape'); await waitShown(page, '#menu-arc', false);
        await openMenu(page, 'turns');
        for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => !!document.activeElement?.closest('#drawer')))) throw new Error('focus left the menu');
        await page.keyboard.press('Escape'); await waitShown(page, '#drawer', false);
      });
      await run.do('keys: M opens the arc with the focus on its first symbol, arrows move round it in order, Enter opens; on a screen arrows move along the strip, and Left or Backspace goes back', async () => {
        await page.evaluate(() => document.getElementById('gl').focus?.());
        await page.keyboard.press('m'); await waitShown(page, '#menu-arc'); await sleep(700);
        const at = () => page.evaluate(() => { const a = document.activeElement; return a?.dataset.place ?? a?.dataset.go ?? a?.id ?? ''; });
        const order = await page.$$eval('#arc .arc-b', (x) => x.map((b) => b.dataset.place));
        if ((await at()) !== order[0]) throw new Error(`the focus starts on ${await at()}, not the first symbol`);
        await page.evaluate(() => { window.__leaked = []; addEventListener('keydown', (e) => window.__leaked.push(e.key)); });
        await page.keyboard.press('ArrowRight'); if ((await at()) !== order[1]) throw new Error(`ArrowRight reached ${await at()}`);
        await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); if ((await at()) !== order[0]) throw new Error(`ArrowLeft reached ${await at()}`);
        await page.keyboard.press('End'); if ((await at()) !== order.at(-1)) throw new Error(`End reached ${await at()}`);
        await page.keyboard.press('Home'); if ((await at()) !== order[0]) throw new Error(`Home reached ${await at()}`);
        await page.keyboard.press('Backspace');
        if ((await page.evaluate(() => window.__leaked.length)) !== 0) throw new Error(`a key on the arc reached the game: ${await page.evaluate(() => window.__leaked.join())}`);      // an arrow would walk the party or turn the camera
        for (let i = 0; i < order.indexOf('settings'); i++) await page.keyboard.press('ArrowRight');
        if ((await at()) !== 'settings') throw new Error(`walking round reached ${await at()}`);
        await page.keyboard.press('Enter'); await wait(page, () => document.getElementById('drawer').dataset.path.split('/')[0] === 'settings');      // a page of sections remembers the one it had open
        if ((await at()) !== 'drawer-title') throw new Error('focus did not move to the heading');
        // From the heading, Up reaches the place on the strip; Left and Right move along it; Enter opens; Down comes back to the heading.
        await page.keyboard.press('ArrowUp'); if ((await at()) !== 'settings') throw new Error(`ArrowUp from the heading reached ${await at()}`);
        await page.keyboard.press('ArrowRight'); if ((await at()) !== 'dm') throw new Error(`ArrowRight on the strip reached ${await at()}`);
        await page.keyboard.press('Enter'); await wait(page, () => document.getElementById('drawer').dataset.path.split('/')[0] === 'dm');
        await openMenu(page, 'dm/fight'); await page.click('#acc-bar-dm-fight'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm');      // every section shut: the bars are a list
        // In the list of bars Up and Down move between them, Right or Enter opens one, Left or Backspace shuts it with the focus on its bar.
        await page.focus('#acc-bar-dm-fight');
        await page.keyboard.press('ArrowDown'); if ((await page.evaluate(() => document.activeElement?.dataset.sec)) !== 'creatures') throw new Error('ArrowDown in the list');
        await page.keyboard.press('ArrowRight'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm/creatures');
        await page.keyboard.press('ArrowLeft'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm');
        if ((await page.evaluate(() => document.activeElement?.dataset.sec)) !== 'creatures') throw new Error('Left did not leave the focus on the row');
        await page.keyboard.press('Enter'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm/creatures');
        await page.keyboard.press('Backspace'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm');
        // With no level to go back to, the key must still not reach the game.
        await page.evaluate(() => { window.__leaked.length = 0; });
        await page.focus('#drawer-title'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Backspace');
        if ((await page.evaluate(() => window.__leaked.length)) !== 0) throw new Error('ArrowLeft or Backspace on a screen reached the game');
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
        for (const [sec, ids] of [['display', ['set-theme', 'set-floors']], ['menu', ['set-token', 'set-motion', 'set-side']], ['dice', ['dm-dice-monsters']]]) {
          await openMenu(page, `settings/${sec}`);
          for (const id of ids) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not in Setup's ${sec}`);
        }
        await openMenu(page, 'dice');
        for (const id of ['dice-show', 'pace-pick', 'dice-auto-mine']) if (!(await shown(page, '#' + id))) throw new Error(`#${id} is not on the Dice screen`);
      });
      await run.do('M10, one accordion: with none open every bar shows its tip; one section is open at a time, the bars before it stay at the top and those after it at the bottom, and it scrolls by itself', async () => {
        for (const leaf of ['settings', 'dm', 'log']) {
          const panel = { settings: 'settings', dm: 'dm', log: 'log' }[leaf];
          const first = await page.evaluate((p) => [...document.querySelectorAll(`#${p} > .acc-sec:not([hidden])`)].map((x) => x.dataset.sec), panel);
          await openMenu(page, `${leaf}/${first[0]}`); await page.click(`#acc-bar-${leaf}-${first[0]}`); await wait(page, (l) => document.getElementById('drawer').dataset.path === l, leaf);
          const shut = await page.evaluate((p) => [...document.querySelectorAll(`#${p} > .acc-sec:not([hidden]) .acc-bar`)].map((b) => ({ sec: b.dataset.sec, h: b.getBoundingClientRect().height, tip: b.querySelector('.acc-tip').textContent.trim(), tipShown: getComputedStyle(b.querySelector('.acc-tip')).display !== 'none', open: b.getAttribute('aria-expanded') })), panel);
          if (shut.length < 2 || shut.some((b) => b.open !== 'false' || b.h < 52 || !b.tip || !b.tipShown)) throw new Error(`${leaf}, none open: ${JSON.stringify(shut)}`);
          for (const sec of first) {
            await page.click(`#acc-bar-${leaf}-${sec}`); await wait(page, (w) => document.getElementById('drawer').dataset.path === w, `${leaf}/${sec}`);
            const at = await page.evaluate(([p, want]) => {
              const body = document.getElementById('drawer-body').getBoundingClientRect(), tok = document.getElementById('btn-menu').getBoundingClientRect();
              const bars = [...document.querySelectorAll(`#${p} > .acc-sec:not([hidden]) .acc-bar`)].map((b) => { const r = b.getBoundingClientRect(); return { sec: b.dataset.sec, top: r.top, bottom: r.bottom, h: r.height, open: b.getAttribute('aria-expanded') === 'true', tip: getComputedStyle(b.querySelector('.acc-tip')).display !== 'none' }; });
              const box = document.querySelector(`#${p} > .acc-sec.open > .acc-body`), r = box?.getBoundingClientRect();
              return { bars, body: [body.top, body.bottom], tok: tok.top, box: r ? [r.top, r.bottom, r.height] : null, scrolls: box ? getComputedStyle(box).overflowY : '', bodyScroll: document.getElementById('drawer-body').scrollTop, open: bars.filter((b) => b.open).map((b) => b.sec).join(), i: bars.findIndex((b) => b.sec === want) };
            }, [panel, sec]);
            if (at.open !== sec) throw new Error(`${leaf}: ${at.open} open after a tap on ${sec}`);
            if (at.bars.some((b) => b.h < 44 || b.tip)) throw new Error(`${leaf}/${sec}: a bar is under 44 px or still shows its tip: ${JSON.stringify(at.bars)}`);
            if (at.bars.some((b) => b.top < at.body[0] - 1 || b.bottom > at.body[1] + 1 || b.bottom > at.tok + 1)) throw new Error(`${leaf}/${sec}: a bar is off the screen or under the token: ${JSON.stringify(at)}`);
            if (!at.box || at.box[2] < 120 || at.scrolls !== 'auto') throw new Error(`${leaf}/${sec}: the open section shows ${at.box?.[2]} px (scroll: ${at.scrolls})`);
            if (at.bars.slice(0, at.i + 1).some((b) => b.bottom > at.box[0] + 1) || at.bars.slice(at.i + 1).some((b) => b.top < at.box[1] - 1)) throw new Error(`${leaf}/${sec}: the bars are not above and below the open section: ${JSON.stringify(at)}`);
            if (at.bodyScroll !== 0) throw new Error(`${leaf}/${sec}: the screen scrolled`);
          }
          // the tapped bar keeps the focus; a second tap shuts the section
          const last = first.at(-1);
          if ((await page.evaluate(() => document.activeElement?.id)) !== `acc-bar-${leaf}-${last}`) throw new Error(`${leaf}: the focus left the bar`);
          await page.click(`#acc-bar-${leaf}-${last}`); await wait(page, (l) => document.getElementById('drawer').dataset.path === l, leaf);
        }
        // A section keeps its own scroll while another place is looked at, and a page remembers which section was open.
        await openMenu(page, 'dm/rules');
        await page.evaluate(() => { document.querySelector('#dm > .acc-sec.open > .acc-body').scrollTop = 90; });
        await openMenu(page, 'turns'); await page.click('#tab-dm'); await wait(page, () => document.getElementById('drawer').dataset.path === 'dm/rules');
        const kept = await page.evaluate(() => document.querySelector('#dm > .acc-sec.open > .acc-body').scrollTop);
        if (Math.abs(kept - 90) > 2) throw new Error(`the open section's scroll was ${kept}, not 90, after coming back`);
        // The character's page: the sheet is its last section; with a section open the status block is compact and every other bar is still on the screen.
        await openMenu(page, 'sheet');
        const ch = await page.evaluate(() => {
          const pg = document.getElementById('sheet'), tok = document.getElementById('btn-menu').getBoundingClientRect(), body = document.getElementById('drawer-body').getBoundingClientRect();
          const bars = [...pg.querySelectorAll('.ap-sec:not([hidden]) .ap-bar')].map((b) => { const r = b.getBoundingClientRect(); return { sec: b.dataset.sec, top: r.top, bottom: r.bottom, h: r.height, w: r.width, open: b.getAttribute('aria-expanded') === 'true' }; });
          const pane = pg.querySelector('.ap-sec.open > .ap-pane'), r = pane?.getBoundingClientRect();
          return { pin: pg.classList.contains('pin'), bars, pane: r ? [r.top, r.bottom, r.height] : null, id: pane?.id, tok: tok.top, body: [body.top, body.bottom], sub: getComputedStyle(document.getElementById('c-sub')).display, name: document.getElementById('c-name').getBoundingClientRect().bottom > body.top, sheetIn: !!document.querySelector('#ap-sheet > #sheet-body') };
        });
        if (!ch.pin || ch.id !== 'ap-sheet' || !ch.sheetIn || ch.bars.filter((b) => b.open).map((b) => b.sec).join() !== 'sheet') throw new Error(`the Sheet section is not the open one: ${JSON.stringify(ch)}`);
        if (ch.pane[2] < 120) throw new Error(`the open section of the character's page shows ${ch.pane[2]} px`);
        if (ch.bars.some((b) => b.h < 44 || b.w < 44 || b.top < ch.body[0] - 1 || b.bottom > ch.tok + 1)) throw new Error(`a bar of the character's page is small, off the screen or under the token: ${JSON.stringify(ch.bars)}`);
        if (ch.sub !== 'none' || !ch.name) throw new Error('the status block is not compact with the name still shown');
        await page.click('#ap-bar-sheet'); await wait(page, () => !document.getElementById('sheet').classList.contains('pin'));
        if ((await page.evaluate(() => getComputedStyle(document.getElementById('c-sub')).display)) === 'none') throw new Error('with none open the status block is not the full one');
        await closeMenu(page);
      });
      await run.do('the token sits at the bottom centre, right or left as chosen, and keeps its place', async () => {
        await openMenu(page, 'settings/menu');
        for (const at of ['left', 'right']) {
          await page.selectOption('#set-token', at); await closeMenu(page); await sleep(100);
          const b = await rectOf(page, '#btn-menu');
          if (at === 'left' ? b.l > 40 : b.vw - b.r > 40) throw new Error(`the token is not at the ${at}: ${JSON.stringify(b)}`);
          if ((await page.evaluate(() => localStorage.getItem('hextable.menuToken'))) !== JSON.stringify(at)) throw new Error('the place was not stored');
          await openMenu(page, 'settings/menu');
        }
        await page.selectOption('#set-token', 'center'); await closeMenu(page); await sleep(100);
        const b = await rectOf(page, '#btn-menu');
        if (Math.abs((b.l + b.r) / 2 - b.vw / 2) > 2) throw new Error('the token did not come back to the centre');
      });
      await run.do('the sheet slides and the arc grows by default; under "Just appear" or reduced motion nothing moves at all; changing place never slides', async () => {
        // The rectangles of the menu and its screen (or of the arc's symbols) on every frame for a while after a tap.
        const frames = (what) => page.evaluate(async (w) => {
          const d = document.getElementById('drawer'), seen = [];
          const q = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); };
          const snap = () => seen.push(w === 'arc' ? [...document.querySelectorAll('#arc .arc-b')].map(q).join('|') || 'hidden' : d.hidden ? 'hidden' : `${q(d)}|${q(document.getElementById('drawer-body'))}|${q(document.getElementById('menu-root'))}`);
          if (w === 'arc') document.getElementById('btn-menu').click(); else if (w === 'open') document.querySelector('#arc [data-place="turns"]').click(); else document.getElementById('tab-dice').click();
          for (let i = 0; i < 14; i++) { snap(); await new Promise((r) => requestAnimationFrame(r)); }
          return seen;
        }, what);
        const moves = (seen) => new Set(seen.filter((s) => s !== 'hidden')).size;
        let arc = await frames('arc'); await sleep(900);
        if (moves(arc) < 3) throw new Error(`the arc did not grow out of the die: ${arc.slice(0, 3)}`);
        let seen = await frames('open'); await sleep(900);
        if (moves(seen) < 3) throw new Error(`the sheet did not slide: ${seen.slice(0, 4)}`);
        let level = await frames('level'); await sleep(300);
        if (moves(level) !== 1) throw new Error(`changing place moved the menu (R20): ${[...new Set(level)]}`);
        await closeMenu(page);
        await openMenu(page, 'settings/menu');
        await page.selectOption('#set-motion', 'appear');
        if ((await page.evaluate(() => localStorage.getItem('hextable.menuMotion'))) !== '"appear"') throw new Error('Just appear was not stored');
        await closeMenu(page);
        arc = await frames('arc'); await sleep(200);
        if (moves(arc) !== 1 || arc[0] === 'hidden') throw new Error(`under Just appear the arc moved or came late: ${[...new Set(arc)].slice(0, 3)}`);
        seen = await frames('open'); await sleep(200);
        if (moves(seen) !== 1 || seen[0] === 'hidden') throw new Error(`under Just appear the menu moved or came late: ${[...new Set(seen)]}`);
        level = await frames('level');
        if (moves(level) !== 1) throw new Error(`under Just appear a place moved: ${[...new Set(level)]}`);
        await closeMenu(page);
        if (await shown(page, '#drawer')) throw new Error('under Just appear the menu did not go at once');
        await openMenu(page, 'settings/menu'); await page.selectOption('#set-motion', 'slide'); await closeMenu(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        arc = await frames('arc'); await sleep(200);
        if (moves(arc) !== 1) throw new Error('under reduced motion the arc moved');
        seen = await frames('open'); await sleep(200);
        if (moves(seen) !== 1) throw new Error(`under reduced motion the menu moved: ${[...new Set(seen)]}`);
        await closeMenu(page);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      });
      if (!phone) await run.do('a wide menu is one column with the strip across its top, clear of the token wherever it sits, and takes its side from Setup', async () => {
        await openMenu(page, 'settings/menu'); await sleep(900);
        const parts = await page.evaluate(() => ['menu-strip', 'drawer-head', 'drawer-body'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), r.width > 0]; }));
        if (!parts.every((c, i) => c[2] && (!i || c[0] >= parts[i - 1][1] - 1))) throw new Error(`the strip, the heading and the screen are not one under the other: ${JSON.stringify(parts)}`);
        // The token does not move for the column (round 6): the column leaves its strip empty, so no screen runs under it.
        const under = () => page.evaluate(() => { const t = document.getElementById('btn-menu').getBoundingClientRect(), l = document.getElementById('menu-levels').getBoundingClientRect(); return l.left < t.right && l.right > t.left && l.bottom > t.top + 1; });
        const tb = await rectOf(page, '#btn-menu');
        if (await under()) throw new Error('the column runs under the token');
        if (Math.abs(tb.l + tb.w / 2 - tb.vw / 2) > 2) throw new Error(`the token moved off the centre: ${JSON.stringify(tb)}`);
        await page.selectOption('#set-token', 'left'); await sleep(300);
        if (await under()) throw new Error('with the token at the left the column runs under it');
        await page.selectOption('#set-token', 'center'); await sleep(300);
        await page.selectOption('#set-side', 'right'); await sleep(900);
        const r = await rectOf(page, '#drawer');
        if (Math.abs(r.r - r.vw) > 2) throw new Error(`not on the right: ${JSON.stringify(r)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.drawerSide'))) !== '"right"') throw new Error('the side was not stored');
        const b = await rectOf(page, '#btn-menu');
        if (Math.abs(b.l + b.w / 2 - b.vw / 2) > 2) throw new Error(`the token moved when the column changed side: ${JSON.stringify(b)}`);
        if (await under()) throw new Error('on the right the column runs under the token');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-right-wide.png` : '/dev/null' }).catch(() => {});
        await page.selectOption('#set-side', 'left'); await sleep(900); await closeMenu(page);
      });
      await run.do('a theme chosen in Setup applies and is stored, and the token takes its colours; the look of floors is stored too', async () => {
        await openMenu(page, 'settings/display');
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
      await run.do('M9, Arrange: a screen under Setup; a place moves by its arrows and by a drag on its six dots, within its group; the eye hides it from the arc and the strip; the characters and Setup cannot be hidden; holding a symbol of the arc opens it', async () => {
        const strip = () => page.$$eval('#menu-root .pr, #menu-root .menu-row', (x) => x.filter((b) => !b.hidden && b.getClientRects().length).sort((p, q) => p.getBoundingClientRect().left - q.getBoundingClientRect().left).map((b) => b.dataset.go ?? 'c'));
        const rows = () => page.$$eval('#arrange .arr-row', (x) => x.map((r) => r.dataset.key));
        const stored = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), k);
        await openMenu(page, 'settings/menu'); await page.click('#set-arrange'); await wait(page, () => document.getElementById('drawer').dataset.path === 'settings/arrange');
        if ((await page.textContent('#drawer-title')) !== 'Arrange the symbols' || !/Setup/.test(await page.textContent('#drawer-back'))) throw new Error(`Arrange is headed "${await page.textContent('#drawer-title')}", back "${await page.textContent('#drawer-back')}"`);
        if ((await rows()).join() !== 'chars,turns,dice,log,settings,dm') throw new Error(`the rows: ${await rows()}`);
        const caps = await page.$$eval('#arrange .arr-cap', (x) => x.map((c) => c.textContent));
        if (caps.join() !== 'Play,This game') throw new Error(`the groups: ${caps}`);
        const small = await page.$$eval('#arrange button', (bs) => bs.filter((b) => b.getBoundingClientRect().width < 44 || b.getBoundingClientRect().height < 44).map((b) => b.getAttribute('aria-label') ?? b.id));
        if (small.length) throw new Error(`under 44 px in Arrange: ${small}`);
        // the two that cannot be hidden have no eye and say why
        for (const k of ['chars', 'settings']) {
          const r = await page.$eval(`#arrange .arr-row[data-key="${k}"]`, (li) => ({ eye: !!li.querySelector('[data-eye]'), why: li.querySelector('.arr-why')?.textContent ?? '' }));
          if (r.eye || !/^Always shown: /.test(r.why)) throw new Error(`${k} can be hidden, or does not say why not: ${JSON.stringify(r)}`);
        }
        // one step down: Turns goes under Dice, on the strip too, and it is stored; the focus stays on the arrow
        await page.click('#arrange .arr-row[data-key="turns"] [data-move="1"]');
        if ((await rows()).join() !== 'chars,dice,turns,log,settings,dm') throw new Error(`after a step down: ${await rows()}`);
        if ((await strip()).filter((k) => k !== 'c').join() !== 'dice,turns,log,settings,dm') throw new Error(`the strip after a step: ${await strip()}`);
        if ((await stored('hextable.menuOrder')).join() !== 'chars,dice,turns,log,settings,dm') throw new Error('the order was not stored');
        if (!(await page.evaluate(() => document.activeElement?.matches('.arr-row[data-key="turns"] [data-move="1"]')))) throw new Error('the focus left the arrow');
        // the ends of a group: the last of Play cannot go down into This game, nor Setup up into Play
        if (!(await page.$eval('#arrange .arr-row[data-key="log"] [data-move="1"]', (b) => b.disabled)) || !(await page.$eval('#arrange .arr-row[data-key="settings"] [data-move="-1"]', (b) => b.disabled))) throw new Error('a place can leave its group');
        // a drag by the six dots: Log and chat to the top of its group
        const g = await rectOf(page, '#arrange .arr-row[data-key="log"] .arr-grip'), top = await rectOf(page, '#arrange .arr-row[data-key="chars"]');
        await page.evaluate(async ([x, y0, y1]) => { const h = document.querySelector('#arrange .arr-row[data-key="log"] .arr-grip');
          const fire = (t, y) => h.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
          fire('pointerdown', y0); for (let i = 1; i <= 6; i++) { fire('pointermove', y0 + (y1 - y0) * i / 6); await new Promise((ok) => setTimeout(ok, 20)); } fire('pointerup', y1); }, [g.l + g.w / 2, g.t + g.h / 2, top.t + 4]);
        if ((await rows()).join() !== 'log,chars,dice,turns,settings,dm') throw new Error(`after the drag: ${await rows()}`);
        if ((await strip())[0] !== 'log' || (await stored('hextable.menuOrder'))[0] !== 'log') throw new Error(`the drag did not reach the strip or the store: ${await strip()}`);
        // the eye: Dice leaves the strip and the arc and has a row still; DM tools leaves the arc only
        await page.click('#arrange .arr-row[data-key="dice"] [data-eye]'); await page.click('#arrange .arr-row[data-key="dm"] [data-eye]');
        if ((await stored('hextable.menuHidden')).join() !== 'dice,dm') throw new Error('what is hidden was not stored');
        if ((await strip()).includes('dice') || !(await strip()).includes('dm')) throw new Error(`the strip with Dice and DM tools hidden: ${await strip()}`);
        if ((await page.getAttribute('#arrange .arr-row[data-key="dice"] [data-eye]', 'aria-pressed')) !== 'true') throw new Error('the eye does not say Dice is hidden');
        await closeMenu(page); await openArc(page);
        const arc = await page.$$eval('#arc .arc-b', (x) => x.map((b) => b.dataset.place));
        if (arc.includes('dice') || arc.includes('dm') || arc[0] !== 'log' || !arc.includes('settings') || !arc.some((k) => k.startsWith('c:'))) throw new Error(`the arc: ${arc}`);
        // holding a symbol of the arc for half a second opens Arrange when it is let go; a quick tap still opens the place
        await sleep(800);                                   // the symbols grow out of the die for half a second: press one where it has come to rest
        const b = await rectOf(page, '#arc .arc-b[data-place="turns"]');
        await page.mouse.move(b.l + b.w / 2, b.t + b.h / 2); await page.mouse.down(); await waitShown(page, '#arc .arc-b.held'); await page.mouse.up();
        await wait(page, () => document.getElementById('drawer').dataset.path === 'settings/arrange');
        // back goes to Setup as it was, the focus on the way in
        await page.click('#drawer-back'); await wait(page, () => document.getElementById('drawer').dataset.path === 'settings/menu');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'set-arrange') throw new Error('back did not leave the focus on Arrange the symbols');
        // Reset order puts everything back and shows everything
        await page.click('#set-arrange'); await page.click('#arr-reset');
        if ((await rows()).join() !== 'chars,turns,dice,log,settings,dm' || (await stored('hextable.menuHidden')).length) throw new Error(`after Reset order: ${await rows()}`);
        if ((await strip()).filter((k) => k !== 'c').join() !== 'turns,dice,log,settings,dm') throw new Error(`the strip after Reset order: ${await strip()}`);
        await closeMenu(page);
      });
      if (!phone) await run.do('pinned, the menu stays open and slides over the map, which does not move', async () => {
        const c0 = await rectOf(page, '#gl');
        await openMenu(page, 'turns');
        await page.click('#drawer-pin'); await sleep(300);
        const c = await rectOf(page, '#gl');
        if (JSON.stringify(c) !== JSON.stringify(c0)) throw new Error(`the canvas moved for the pinned menu: ${JSON.stringify(c0)} -> ${JSON.stringify(c)}`);
        if ((await page.getAttribute('#drawer', 'role')) !== 'complementary') throw new Error('a pinned menu is a landmark, not a dialog');
        if (await shown(page, '#drawer-scrim')) throw new Error('a pinned menu dims the map');
        // A press and drag on the map (not a tap: the party stands near enemies, and a tap there starts a fight) must not close a pinned menu.
        await page.mouse.move(1100, 300); await page.mouse.down(); await page.mouse.move(1100, 360, { steps: 4 }); await page.mouse.up(); await sleep(200);
        if (!(await shown(page, '#drawer'))) throw new Error('a press on the map closed a pinned menu');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-pinned.png` : '/dev/null' }).catch(() => {});
        await page.click('#drawer-pin'); await sleep(300);
        const c2 = await rectOf(page, '#gl');
        if (c2.w !== c2.vw) throw new Error('the canvas is not full width');
        await closeMenu(page);
      });
      await run.do('a reaction question folds the menu; after it the menu stays away until the die is tapped, which returns it to the same place (M2)', async () => {
        await openMenu(page, 'turns');
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync({ ...h.state, prompt: { waiting: true } }); });
        await waitShown(page, '#drawer', false);
        await page.evaluate(() => { const h = window.hextable; h.drawer.sync(h.state); });
        await sleep(700);
        if (await shown(page, '#drawer')) throw new Error('the menu came back by itself after the question');
        await page.click('#btn-menu'); await waitShown(page, '#drawer');
        if ((await page.evaluate(() => document.getElementById('drawer').dataset.path)) !== 'turns') throw new Error('the menu did not come back where it was');
        await closeMenu(page);
      });
      await run.do('in a fight the tracker lists the turns in the engine\'s order, top to bottom, with initiative and the turn marked', async () => {
        await page.evaluate(async () => { document.getElementById('dm-auto').checked = false; const h = window.hextable, S = h.state, foe = Object.values(S.entities).find((e) => e.side === 'foe' && !e.hidden); const { gridOf } = await import('./shared/grid.js'); const G = gridOf(window.hextable.state.map), reach = Math.max(6, 1 + Math.min(...Object.values(window.hextable.state.entities).filter((e) => e.side === 'party' && e.hp > 0 && e.pos).map((e) => G.dist(foe.pos, e.pos)))); h.act({ type: 'startEncounter', center: foe.pos, radius: reach }); });   /* wide enough to hold the nearest hero: a fight with none in range is refused (#771) */
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
        if ((await page.$eval('#tab-turns .mr-name', (e) => e.textContent.trim())) !== 'Turns' || (await page.textContent('#drawer-title')) !== 'Turns') throw new Error('the place is not called Turns in a fight');
        if ((await page.$eval('#tab-turns .mr-sym', (e) => e.dataset.sym)) !== 'turns') throw new Error('in a fight Turns does not wear the crossed swords');
        if (!/^Round 1 · .+'s turn$/.test(await page.$eval('#sum-turns', (e) => e.textContent.trim()))) throw new Error('the place does not say whose turn it is');
        await page.screenshot({ path: process.env.SMOKE_SHOTS ? `${process.env.SMOKE_SHOTS}/drawer-turns-${phone ? 'phone' : 'wide'}.png` : '/dev/null' }).catch(() => {});
      });
      await run.do('a tap on a row selects that creature, and on a phone closes the drawer; the turn line opens it again', async () => {
        const id = await state(page, (S) => S.encounter.order.at(-1).id);
        if (phone) await page.tap(`#tr-list li[data-id="${id}"] .tr-main`); else await page.click(`#tr-list li[data-id="${id}"] .tr-main`);
        await wait(page, (i) => window.hextable.state && document.querySelector('#c-name')?.textContent === window.hextable.state.entities[i].name, id);
        if (phone) await waitShown(page, '#drawer', false);
        else { await closeMenu(page); }
        // The fight starts at a foe with the party far off, so "The party has fallen" can be up by now (it comes when the beats are still): put it aside, it is not what this step is about.
        if (await shown(page, '#df .df-card')) { await page.click('#df [data-df="aside"]'); await waitShown(page, '#df .df-card', false); }
        await page.click('#turn-text'); await waitShown(page, '#drawer'); await waitShown(page, '#tracker');
        await closeMenu(page);
      });
      await run.do('an order made in Arrange survives a reload', async () => {
        await page.evaluate(() => window.hextable.drawer.open('settings/arrange'));
        await page.click('#arrange .arr-row[data-key="settings"] [data-move="1"]'); await page.click('#arrange .arr-row[data-key="chars"] [data-move="1"]');
        await page.reload(); await waitShown(page, '#lobby'); await playSolo(page); await sleep(400);
        const order = await page.evaluate(() => window.hextable.drawer.order.join());
        if (order !== 'turns,chars,dice,log,dm,settings') throw new Error(`after a reload the order is ${order}`);
        await page.click('#btn-menu'); await waitShown(page, '#menu-arc');
        const arc = await page.$$eval('#arc .arc-b', (x) => x.map((b) => (b.dataset.place.startsWith('c:') ? 'c' : b.dataset.place)));
        if (arc[0] !== 'turns' || arc[1] !== 'c' || arc.at(-1) !== 'settings') throw new Error(`the arc after a reload: ${arc}`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => { localStorage.removeItem('hextable.menuOrder'); localStorage.removeItem('hextable.menuHidden'); });
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
        await openMenu(phone, []); const b = phone.locator('#arc .arc-b:has-text("Play as")').first();
        await b.click(); await closeMenu(phone);
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

// A phone on its side is 390 high: the menu must still be reachable and tappable, and the token stays on the screen.
async function drawerLandscape(browser, url) {
  await scenario('drawer at 844x390 with touch', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter);
      const boxOf = (sel) => page.evaluate((x) => { const r = document.querySelector(x).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
      await run.do('the token is on the screen and at least 44 px, with the dock gone', async () => {
        const t = await boxOf('#btn-menu');
        if (t.t < 0 || t.b > 390 || t.l < 0 || t.r > 844 || t.w < 44 || t.h < 44) throw new Error(`the token is at ${JSON.stringify(t)}`);
        if (await page.$('#dock')) throw new Error('the dock is still in the page');
      });
      await run.do('the arc opens in the corner: every symbol is on the screen, at least 44 px, and none is under the token; a symbol opens its screen', async () => {
        await page.tap('#btn-menu'); await waitShown(page, '#menu-arc');
        await sleep(1200);
        const syms = await page.$$eval('#arc .arc-b', (x) => x.map((e) => { const r = e.getBoundingClientRect(); return { k: e.dataset.place, t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, w: r.width }; }));
        if (syms.length < 5) throw new Error(`symbols: ${JSON.stringify(syms)}`);
        const tok = await boxOf('#btn-menu');
        for (const r of syms) {
          if (r.h < 44 || r.w < 44) throw new Error(`symbol ${r.k} is ${r.w} x ${r.h}`);
          if (r.l < 0 || r.t < 0 || r.r > 844 || r.b > 390) throw new Error(`symbol ${r.k} is off the screen: ${JSON.stringify(r)}`);
          if (r.l < tok.r && r.r > tok.l && r.b > tok.t && r.t < tok.b) throw new Error(`symbol ${r.k} is under the token: ${JSON.stringify([r, tok])}`);
        }
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/menu-arc-landscape.png` }).catch(() => {});
        await page.tap('#arc [data-place="turns"]'); await waitShown(page, '#drawer'); await sleep(1200);
        const dr = await boxOf('#drawer');
        if (dr.h < 300) throw new Error(`the menu is only ${dr.h} high`);
        const rows = await page.$$eval('#menu-root .menu-row:not([hidden]), #menu-root .pr', (x) => x.map((e) => { const r = e.getBoundingClientRect(); return { k: e.dataset.go || e.dataset.id, h: r.height, w: r.width }; }));
        for (const r of rows) if (r.h < 44 || r.w < 44) throw new Error(`the strip's ${r.k} is ${r.w} x ${r.h}`);
        const lv = await boxOf('#menu-levels');
        if (lv.l < tok.r && lv.r > tok.l && lv.b > tok.t + 1) throw new Error(`the screen runs under the token: ${JSON.stringify([lv, tok])}`);
      });
      await run.do('Settings is reached by taps, one setting changes, and closing leaves the token where it was', async () => {
        await openMenu(page, 'settings/menu');
        await page.selectOption('#set-motion', 'appear');
        if ((await page.evaluate(() => document.body.dataset.menuMotion)) !== 'appear') throw new Error('the motion setting did not take');
        await page.selectOption('#set-motion', 'slide');
        await closeMenu(page);
        await sleep(300);
        const t = await boxOf('#btn-menu');
        if (t.t < 0 || t.b > 390) throw new Error(`the token is off the screen: ${JSON.stringify(t)}`);
      });
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
