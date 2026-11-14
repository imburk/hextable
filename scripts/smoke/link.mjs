import { sleep, scenario, wait, shown, waitShown, open, closeMenu, openTab } from './lib.mjs';

// ---------- the connection dot (issue #246) ----------
// A DM on a desktop and a phone player at one table. The address says ?link=fast, which shortens the link thresholds (linkquality.js,
// LINK_FAST) so the pass does not sleep for long; the rules of the judgement are the same. Every wait below is on a real condition.
const dotState = (page) => page.evaluate(() => { const b = document.querySelector('#link-dot'); return b && !b.hidden ? b.dataset.state : null; });
const waitDot = (page, want, timeout = 15000) => wait(page, (w) => { const b = document.querySelector('#link-dot'); return !!b && !b.hidden && b.dataset.state === w; }, want, timeout);
// What the DM's tracker row for the phone's character shows: the state class of its dot, or null.
const rowDot = (page, id) => page.evaluate((i) => { const d = document.querySelector(`#tr-list li[data-id="${i}"] .tr-link .ld`); return d ? ['good', 'shaky', 'lost'].find((s) => d.classList.contains(`ld-${s}`)) : null; }, id);
const waitRow = (page, id, want, timeout = 15000) => wait(page, ([i, w]) => { const d = document.querySelector(`#tr-list li[data-id="${i}"] .tr-link .ld`); return !!d && d.classList.contains(`ld-${w}`); }, [id, want], timeout);
// Screenshots for a person to look at: written where SMOKE_SHOTS says (the workflow uploads them on failure), else nowhere.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
// Does the dot keep clear of the round card, the initiative strip and the menu button?
const overlaps = (page) => page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect(), dot = r('#link-dot');
  const hit = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return ['#status', '#btn-menu', '#order', '#btn-undo'].filter((s) => hit(dot, r(s)));
});

async function link(browser, url) {
  await scenario('link: the dots at a table show good, change when the phone is cut off, and recover', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      const at = `${url}?link=fast`;
      let code, id;

      await run.do('a solo game has no dot', async () => {
        const solo = await hostCtx.newPage();
        run.watch(solo, ' (solo)');
        await open(solo, at);
        await solo.click('#lobby-solo');
        await wait(solo, () => window.hextable?.state?.entities);
        await sleep(1500);                                      // several ping intervals at the fast setting
        if (await shown(solo, '#link-dot')) throw new Error('a dot was shown in a solo game');
        await solo.close();
      });

      await run.do('host a table; the phone joins, is let in and plays a character', async () => {
        await open(host, at);
        await host.fill('#lobby-name', 'Smoke DM');
        await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, at);
        await phone.fill('#lobby-name', 'Smoke Player');
        await phone.fill('#lobby-code', code);
        await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await closeMenu(host);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        const b = phone.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });

      await run.do('both top bars show a good dot, and the DM sees the phone\'s as good in the tracker', async () => {
        await waitDot(host, 'good'); await waitDot(phone, 'good');
        await wait(host, () => !!window.hextable.links?.size);   // the phone has reported
        await openTab(host, 'turns');
        await waitRow(host, id, 'good');
        const label = await host.locator('#link-dot').getAttribute('aria-label');
        if (!/^Connection good/.test(label)) throw new Error(`the dot's label is "${label}"`);
        if (!(await host.locator(`#tr-list li[data-id="${id}"] .tr-link .ld`).getAttribute('aria-label')).includes('Smoke Player')) throw new Error("the tracker's dot does not name the player");
        await closeMenu(host);
      });

      await run.do('at 390x844 the dot covers neither the round card, the menu button nor the strip; a tap says why in words', async () => {
        const bad = await overlaps(phone);
        if (bad.length) throw new Error(`the dot overlaps ${bad.join(', ')}`);
        await phone.tap('#link-dot');
        await waitShown(phone, '#link-note');
        const said = await phone.locator('#link-note').textContent();
        if (!/Connected/.test(said)) throw new Error(`the note says "${said}"`);
        await shot(phone, 'link-good-note');
        await phone.tap('#link-dot');
        await waitShown(phone, '#link-note', false);
      });

      await run.do('cut the phone off: its own dot goes lost and says it is reconnecting or offline', async () => {
        if ((await dotState(phone)) !== 'good') throw new Error('the phone was not good before being cut off');
        await phoneCtx.setOffline(true);
        await phone.evaluate(() => window.hextable.dropSocket());          // an offline browser may keep an open socket for a while: drop it
        await waitDot(phone, 'lost');
        await phone.tap('#link-dot');
        await wait(phone, () => /offline|Reconnecting, attempt \d/.test(document.querySelector('#link-note').textContent));
        await shot(phone, 'link-lost-note');
        await phone.tap('#link-dot');
      });

      await run.do("the DM's view of the phone changes to lost", async () => {
        await openTab(host, 'turns');
        await waitRow(host, id, 'lost');
        if (!(await host.locator(`#tr-list li[data-id="${id}"] .tr-link .ld-word`).textContent()).includes('Lost')) throw new Error('no word beside the lost dot');
        await shot(host, 'link-dm-lost');
        if ((await dotState(host)) !== 'good') throw new Error("the DM's own dot should still be good");
      });

      await run.do('restore the connection: the phone recovers and so does the DM\'s view of it', async () => {
        await phoneCtx.setOffline(false);
        await waitDot(phone, 'good', 30000);
        await waitRow(host, id, 'good', 30000);
        await closeMenu(host);
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=link.
export default link;
