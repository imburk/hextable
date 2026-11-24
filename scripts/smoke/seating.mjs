// Seating (#756): a player at a hosted table with no character is shown "Pick who you play"; "Play as" takes two taps; the DM sees "has no character"
// with a way to the Who plays whom list, and the line goes once the player has one. Screenshots go to SMOKE_SHOTS when it is set.
import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openMenu } from './lib.mjs';

const shot = async (page, name, still = 900) => { if (!process.env.SMOKE_SHOTS) return; await sleep(still); await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }); };

export default async function seating(browser, url) {
  await scenario('seating: a player picks who they play, the DM sees the line go', async (run) => {
    const dmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const plCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      let code, id, name;

      await run.do('host a table and join from the phone', async () => {
        await open(dm, url); await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url); await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
      });

      await run.do('the DM lets the player in', async () => {
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
      });

      await run.do('the player\'s menu opens on Pick who you play, with a row for each free character and the DM line', async () => {
        await wait(pl, () => window.hextable.drawer.isOpen && window.hextable.drawer.arc);
        await waitShown(pl, '#menu-pick');
        const got = await pl.evaluate(() => ({ head: document.getElementById('pick-title').textContent, rows: [...document.querySelectorAll('#pick-list button')].map((b) => b.textContent), note: document.querySelector('#menu-pick .note').textContent, free: Object.values(window.hextable.state.entities).filter((e) => e.kind === 'pc' && !e.owner).length }));
        if (got.head !== 'Pick who you play' || !got.rows.length || got.rows.length !== got.free || !got.rows.every((r) => r.startsWith('Play as ')) || got.note !== 'Or ask the DM to give you one') throw new Error(`the section is wrong: ${JSON.stringify(got)}`);
        name = got.rows[0].replace('Play as ', '');
        id = await pl.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await shot(pl, 'seating-pick-phone');
      });

      await run.do('the DM sees "has no character" with Give a character, which opens Who plays whom', async () => {
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm-table .nochar');
        const t = await dm.textContent('#dm-table .nochar');
        if (!/Smoke Player has no character/.test(t)) throw new Error(`the line says ${t}`);
        await dm.click('#dm-table .nochar button:has-text("Give a character")');
        await waitShown(dm, '#dm-chars'); await sleep(900);
        await shot(dm, 'seating-dm-wide');
      });

      await run.do('one tap only arms Play as; the second claims', async () => {
        const b = pl.locator(`#pick-list button[data-pick="${id}"]`);
        await b.tap();
        if (!/^Tap again to play /.test(await b.textContent())) throw new Error('the first tap did not ask for a second');
        if (await state(pl, (S, i) => !!S.entities[i].owner, id).catch(() => false)) throw new Error('one tap claimed');
        await b.tap();
        await wait(pl, (i) => !!window.hextable.state.entities[i].owner, id);
        await wait(dm, (i) => !!window.hextable.state.entities[i].owner, id);
        await waitShown(pl, '#menu-pick', false);
      });

      await run.do('the DM\'s line goes and the list shows the claim', async () => {
        await openMenu(dm, 'dm');
        await wait(dm, () => !document.querySelector('#dm-table .nochar'));
        const sel = await dm.evaluate((n) => { const l = [...document.querySelectorAll('#dm-chars label.assign')].find((x) => x.firstChild.textContent === n); return l ? l.querySelector('select').selectedOptions[0].textContent : null; }, name);
        if (sel !== 'Smoke Player') throw new Error(`Who plays whom shows ${sel} for ${name}`);
      });

      await run.do('after they let go, the menu opens on the pick again; closed, it stays closed', async () => {
        await closeMenu(pl);
        await dm.evaluate((i) => window.hextable.act({ type: 'release', entity: i }), id);
        await wait(pl, () => window.hextable.drawer.arc);
        await waitShown(pl, '#menu-pick');
        await closeMenu(pl);
        await dm.evaluate(() => window.hextable.act({ type: 'setClock', t: 1 })).catch(() => {});
        await sleep(800);
        if (await pl.evaluate(() => window.hextable.drawer.isOpen)) throw new Error('the menu opened again with nothing changed');
      });
    } finally { await dmCtx.close(); await plCtx.close(); }
  });
}
