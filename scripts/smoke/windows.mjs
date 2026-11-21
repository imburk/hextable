// Several game windows in one browser, each its own seat (#625): the table session belongs to the window, a solo save has one writer.
import { mkdirSync } from 'node:fs';
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, openTab, selectAndMove } from './lib.mjs';

const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const seat = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('hextable.session') ?? 'null'));
const fits = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; }, sel);

async function table(browser, url) {
  await scenario('windows: a DM and a player in two windows of one browser, each its own seat', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const dm = await ctx.newPage(), pl = await ctx.newPage();
      run.watch(dm, ' (dm window)'); run.watch(pl, ' (player window)');
      let code, plSeat, id, name;

      await run.do('the first window hosts a table', async () => {
        await open(dm, url);
        await dm.fill('#lobby-name', 'Window DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
      });

      await run.do('a new window has no seat: it offers Rejoin as the last used, or Join as someone else (also on a phone-sized screen)', async () => {
        await open(pl, url);
        await waitShown(pl, '#lobby-remember'); await waitShown(pl, '#lobby-else');
        if (await seat(pl)) throw new Error('the new window was given the other window\'s seat');
        const rejoin = await text(pl, '#lobby-rejoin');
        if (rejoin !== `Rejoin ${code} as Window DM`) throw new Error(`the rejoin button says "${rejoin}"`);
        await pl.setViewportSize({ width: 390, height: 844 });
        for (const sel of ['#lobby-rejoin', '#lobby-else', '#lobby-forget']) if (!(await fits(pl, sel))) throw new Error(`${sel} does not fit a phone-sized screen`);
        if (await pl.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('the join screen scrolls sideways on a phone');
        await pl.setViewportSize({ width: 1280, height: 800 });
      });

      await run.do('Join as someone else asks the DM, who lets the window in', async () => {
        await pl.click('#lobby-else');
        if ((await pl.inputValue('#lobby-code')) !== code) throw new Error('the code was not filled in');
        await pl.fill('#lobby-name', 'Window Player'); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent)).catch(async (e) => { throw new Error(`no wait message: "${await text(pl, '#lobby-msg')}" ${e.message.split('\n')[0]}`); });
        await openTab(dm, 'dm').catch((e) => { throw new Error(`openTab: ${e.message.split('\n')[0]}`); });
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false).catch(async (e) => { throw new Error(`still in the lobby: "${await text(pl, '#lobby-msg')}" ${e.message.split('\n')[0]}`); });
        await wait(pl, () => window.hextable.state?.entities?.fighter).catch((e) => { throw new Error(`no state after let in: ${e.message.split('\n')[0]}`); });
        // The DM's drawer is left open: both windows render in software on one machine, and the DM has nothing more to tap.
        plSeat = await seat(pl);
        const dmSeat = await seat(dm);
        if (!plSeat || plSeat.token === dmSeat.token) throw new Error('the two windows share a seat');
        if (dmSeat.code !== code) throw new Error('the DM window lost its seat');
      });

      await run.do('both act: the player takes a character and moves it, the DM changes another and the player sees it', async () => {
        const b = pl.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await pl.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(dm, (i) => !!window.hextable.state.entities[i].owner, id);
        const pos = await selectAndMove(pl, false, id, name);
        await wait(dm, ([i, p]) => { const q = window.hextable.state.entities[i].pos; return q.q === p.q && q.r === p.r && q.z === p.z; }, [id, pos]);
        const other = await dm.evaluate((i) => Object.values(window.hextable.state.entities).find((e) => e.id !== i && e.maxHp > 2 && !e.owner && e.side === 'party')?.id, id);
        await dm.evaluate((o) => window.hextable.act({ type: 'setHp', actor: o, hp: 2 }), other);
        await wait(pl, (o) => window.hextable.state.entities[o].hp === 2, other);
      });

      await run.do('reloading either window keeps its own seat', async () => {
        const owner = await state(pl, (S, i) => S.entities[i].owner, id);
        await pl.reload(); await waitShown(pl, '#lobby-remember');
        if (!(await text(pl, '#lobby-table')).includes('This window remembers')) throw new Error(`the player window says: ${await text(pl, '#lobby-table')}`);
        if (await shown(pl, '#lobby-else')) throw new Error('a window with its own seat was offered someone else');
        await pl.click('#lobby-rejoin');
        await wait(pl, () => window.hextable?.state?.entities);
        if ((await seat(pl)).token !== plSeat.token) throw new Error('the player window changed seat');
        if ((await state(pl, (S, i) => S.entities[i].owner, id)) !== owner) throw new Error('the player no longer owns the character');
        await dm.reload(); await waitShown(dm, '#lobby-remember');
        await dm.click('#lobby-rejoin');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        if (!(await dm.evaluate(() => !!document.querySelector('#dm-table')))) throw new Error('the DM window is no longer the DM');
      });

      await run.do('a dropped connection reconnects each window on its own, to its own seat', async () => {
        await pl.evaluate(() => window.hextable.dropSocket()); await dm.evaluate(() => window.hextable.dropSocket());
        // The DM keeps acting until its connection is back (an action sent while it is down is refused, not queued); the player must then see it, on its own seat.
        let seen = false;
        for (let i = 0; i < 40 && !seen; i++) {
          await dm.evaluate((c) => window.hextable.act({ type: 'setHp', actor: c, hp: 1 }), id);
          seen = await pl.evaluate((c) => window.hextable.state.entities[c].hp === 1, id);
          if (!seen) await sleep(500);
        }
        if (!seen) throw new Error('the player did not see the DM act after the connection came back');
        if ((await seat(pl)).token !== plSeat.token) throw new Error('the player window changed seat after reconnecting');
        if (!(await state(pl, (S, i) => !!S.entities[i].owner, id))) throw new Error('the player lost the character');
      });
    } finally { await ctx.close(); }
  });
}

async function solo(browser, url) {
  await scenario('windows: a second window never writes the solo save the first is playing', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const a = await ctx.newPage(), b = await ctx.newPage(), c = await ctx.newPage();
      for (const [p, w] of [[a, ' (first)'], [b, ' (second)'], [c, ' (third)']]) run.watch(p, w);
      const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.entities?.fighter?.hp, 'hextable.solo');
      const hp = (page) => state(page, (S) => S.entities.fighter.hp);

      await run.do('the first window plays solo and saves', async () => {
        await open(a, url); await playSolo(a);
        await wait(a, () => window.hextable.state.entities.fighter);
        await a.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 5 }));
        await wait(a, () => JSON.parse(localStorage.getItem('hextable.solo') ?? 'null')?.entities?.fighter?.hp === 5);
      });

      await run.do('the second window is told the game is open elsewhere and starts nothing', async () => {
        await open(b, url); await b.click('#lobby-solo');
        await waitShown(b, '#solo-busy');
        for (const sel of ['#solo-busy-read', '#solo-busy-copy']) if (!(await shown(b, sel))) throw new Error(`${sel} is not offered`);
        if (await state(b, (S) => S)) throw new Error('a game was started in the second window');
      });

      await run.do('Open read-only shows the game, refuses changes and follows the first window', async () => {
        await b.click('#solo-busy-read');
        await wait(b, () => window.hextable.state?.entities?.fighter);
        await waitShown(b, '#readonly-bar');
        if ((await hp(b)) !== 5) throw new Error('the read-only window does not show the saved game');
        await b.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 1 }));
        await waitShown(b, '#toast'); if (!/read-only/i.test(await text(b, '#toast'))) throw new Error(`the refusal says: ${await text(b, '#toast')}`);
        await sleep(200);
        if ((await saved(a)) !== 5 || (await hp(b)) !== 5) throw new Error('the read-only window changed the save');
        await a.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 4 }));
        await wait(b, () => window.hextable.state.entities.fighter.hp === 4, null, 10000);
      });

      await run.do('the read-only window is framed on all four edges with a label, and the playing window is not (1280x800 and 390x844)', async () => {
        const dir = process.env.SMOKE_SHOTS ?? '/tmp/smoke-windows'; mkdirSync(dir, { recursive: true });
        const check = async (page, size) => {
          await page.setViewportSize(size); await sleep(300);
          const f = await page.evaluate(() => {
            const fr = document.getElementById('readonly-frame'), bar = document.getElementById('readonly-bar'), cs = getComputedStyle(fr), r = fr.getBoundingClientRect(), br = bar.getBoundingClientRect();
            const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
            const edge = [[2, innerHeight / 2], [innerWidth - 3, innerHeight / 2], [innerWidth / 2, 2], [innerWidth / 2, innerHeight - 3]].map(([x, y]) => document.elementFromPoint(x, y)?.id);
            return { shown: !fr.hidden && r.width === innerWidth && r.height === innerHeight, shadow: cs.boxShadow, pe: cs.pointerEvents, label: bar.textContent, barOnTop: !!top && bar.contains(top), barFits: br.left >= 0 && br.right <= innerWidth && br.top >= 0, edge, dmTab: !!document.getElementById('tab-dm') && document.getElementById('tab-dm').getClientRects().length > 0, undo: document.getElementById('btn-undo').getClientRects().length > 0 };
          });
          if (!f.shown) throw new Error(`${size.width}: the frame does not cover the screen`);
          if (!/6px/.test(f.shadow)) throw new Error(`${size.width}: the frame has no 6 px edge (${f.shadow})`);
          if (f.pe !== 'none') throw new Error('the frame would block taps');
          if (f.edge.includes('readonly-frame')) throw new Error('a tap on the edge would hit the frame');
          if (!/Read-only: another window is playing this game/.test(f.label) || !f.barOnTop || !f.barFits) throw new Error(`${size.width}: the label is not visible on top (${f.label})`);
          if (f.dmTab || f.undo) throw new Error('DM or editing controls are still shown in the read-only window');
          await page.screenshot({ path: `${dir}/readonly-${size.width}x${size.height}.png` });
        };
        await check(b, { width: 1280, height: 800 });
        await check(b, { width: 390, height: 844 });
        await b.setViewportSize({ width: 1280, height: 800 });
        await a.screenshot({ path: `${dir}/playing-1280x800.png` });
        if (await a.evaluate(() => { const f = document.getElementById('readonly-frame'); return !f.hidden || document.body.classList.contains('readonly') || !document.getElementById('readonly-bar').hidden; })) throw new Error('the playing window shows the read-only frame');
      });

      await run.do('Make a copy plays on a save of its own and leaves the first window\'s alone', async () => {
        await open(c, url); await c.click('#lobby-solo');
        await waitShown(c, '#solo-busy'); await c.click('#solo-busy-copy');
        await wait(c, () => window.hextable.state?.entities?.fighter);
        if ((await hp(c)) !== 4) throw new Error('the copy did not start from the game');
        if (await shown(c, '#readonly-bar')) throw new Error('a copy is read-only');
        await c.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 2 }));
        await wait(c, () => Object.keys(localStorage).some((k) => k.startsWith('hextable.solo.copy.') && !k.endsWith('.pins') && JSON.parse(localStorage.getItem(k)).entities.fighter.hp === 2));
        if ((await saved(a)) !== 4 || (await hp(a)) !== 4) throw new Error('the copy changed the first window\'s game');
      });

      await run.do('reloading the copy window goes on with the copy, with no offer', async () => {
        await c.reload(); await waitShown(c, '#lobby');
        await c.click('#lobby-solo');
        await wait(c, () => window.hextable.state?.entities?.fighter);
        if (await shown(c, '#solo-busy')) throw new Error('the copy window was offered a copy of its own game');
        if ((await hp(c)) !== 2) throw new Error('the copy window lost its game');
      });

      await run.do('reloading the first window takes its game back with no offer', async () => {
        await a.reload(); await waitShown(a, '#lobby', true, 15000); await a.click('#lobby-solo');
        await wait(a, () => window.hextable.state?.entities?.fighter, null, 20000);
        if (await shown(a, '#solo-busy')) throw new Error('the first window was refused its own game after a reload');
        if ((await hp(a)) !== 4) throw new Error('the first window lost its game');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) { await table(browser, url); await solo(browser, url); }
