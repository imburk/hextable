
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, openTab, calm } from './lib.mjs';

// ---------- defeat ----------
// The party has fallen (packages/client/defeat.js): dying is not defeat, so no card while anyone is still rolling; the card when every
// character is dead or stable; the DM's choices; a reload shows it again; rewinding brings the party back standing.
async function defeat(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      const cardUp = () => shown(page, '#df');
      let pcs;
      await run.do('a fight starts and every character is brought to 0 Hit Points', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        pcs = await page.evaluate(() => {
          const h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          h.act({ type: 'startEncounter', center: foe.pos, radius: 40 });       // wide, so the whole party is in it
          const ids = Object.values(h.state.entities).filter((e) => e.side === 'party' && e.kind === 'pc' && e.hp > 0).map((e) => e.id);
          for (const id of ids) h.act({ type: 'harm', actor: id, amount: h.state.entities[id].hp });
          return ids;
        });
        await calm(page);
        const now = await state(page, (S, ids) => ({ fight: !!S.encounter, hp: ids.map((i) => S.entities[i].hp), dead: ids.map((i) => S.entities[i].dead) }), pcs);
        if (!now.fight || now.hp.some((h) => h !== 0) || now.dead.some(Boolean)) throw new Error(`not all dying: ${JSON.stringify(now)}`);
        if (await cardUp()) throw new Error('the card is up while the party is only dying');
      });
      await run.do('death saves roll turn by turn and there is still no card', async () => {
        await page.evaluate(() => { window.hextable.played.length = 0; });
        for (let i = 0; i < 40; i++) {
          if (await page.evaluate(() => window.hextable.played.some((p) => p.type === 'deathSave'))) break;
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id ?? null);
          if (!cur) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(page);
        }
        if (!(await page.evaluate(() => window.hextable.played.some((p) => p.type === 'deathSave')))) throw new Error('no Death Saving Throw was rolled');
        const left = await state(page, (S, ids) => ids.filter((i) => !S.entities[i].dead && S.entities[i].hp <= 0 && !S.entities[i].cond.stable).length, pcs);
        if (left > 0 && (await cardUp())) throw new Error('the card is up while someone is still dying');
        await openTab(page, 'log');
        const text = await page.textContent('#log-list');
        if (!/Death Save/.test(text)) throw new Error('the log shows no Death Save');
        await closeMenu(page);
      });
      await run.do('the card comes only when the last one has died', async () => {
        for (let k = 0; k < pcs.length; k++) {
          const id = pcs[k];
          for (let n = 0; n < 8; n++) {
            const e = await state(page, (S, i) => ({ dead: S.entities[i].dead, hp: S.entities[i].hp, over: !S.encounter }), id);
            if (e.dead || e.over) break;
            if (k === pcs.length - 1 && n === 0 && (await cardUp())) throw new Error('the card is up before the last character fell');
            await page.evaluate(([i, hp]) => window.hextable.act({ type: 'harm', actor: i, amount: Math.max(1, hp) }), [id, e.hp]);
            await calm(page);
          }
        }
        await waitShown(page, '#df');
        const t = await page.textContent('#df-title');
        if (t.trim() !== 'The party has fallen.') throw new Error(`title: ${t}`);
        const rows = await page.$$eval('#df .df-who li', (l) => l.map((x) => x.textContent));
        if (rows.length !== pcs.length || !rows.every((r) => /died|down, stable/.test(r))) throw new Error(`rows: ${rows}`);
        if (/!/.test(await page.textContent('#df'))) throw new Error('an exclamation mark on the card');
        await shot('defeat-card');
      });
      await run.do('the card fits the screen, its buttons are big enough, and the map around it is still the map', async () => {
        const m = await page.evaluate(() => {
          const c = document.querySelector('.df-card').getBoundingClientRect();
          const small = [...document.querySelectorAll('#df button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent);
          return { c: { l: c.left, r: c.right, t: c.top, b: c.bottom }, w: innerWidth, h: innerHeight, small, off: document.querySelector('#df').style.pointerEvents, probe: document.elementFromPoint(4, innerHeight / 2)?.id };
        });
        if (m.c.l < 0 || m.c.r > m.w || m.c.t < 0 || m.c.b > m.h) throw new Error(`the card is off the screen: ${JSON.stringify(m.c)}`);
        if (m.small.length) throw new Error(`buttons under 44 px: ${m.small}`);
        if (m.probe !== 'gl') throw new Error(`a tap beside the card would hit ${m.probe}, not the map`);
        const btns = await page.$$eval('#df .df-choice button', (b) => b.map((x) => [x.textContent, x.disabled]));
        if (btns.length !== 3 || btns[0][0] !== 'Try the fight again' || btns[0][1] || btns[1][0] !== 'Go back to the last rest' || btns[2][0] !== 'Carry on') throw new Error(`choices: ${JSON.stringify(btns)}`);
        if (!btns[1][1]) throw new Error('"go back to the last rest" is offered with no rest to go back to');
        if (!/No rest to go back to/.test(await page.textContent('#df .df-choice.off p'))) throw new Error('the greyed choice does not say why');
      });
      await run.do('with another theme and the menu open, closed or pinned the card and the menu do not fight', async () => {
        await openTab(page, 'settings');
        await page.selectOption('#set-theme', 'sunlit');
        const front = () => page.evaluate(() => { const c = document.querySelector('.df-card').getBoundingClientRect(); return { inside: !!document.elementFromPoint(c.left + c.width / 2, c.top + 30)?.closest('#df'), r: c.right, l: c.left, w: innerWidth, dr: document.getElementById('drawer').getBoundingClientRect().left, dl: document.getElementById('drawer').getBoundingClientRect().right }; });
        let f = await front();
        if (touch && f.inside) throw new Error('the card is in front of the open menu, which the person asked for');
        await closeMenu(page);
        if (!(await front()).inside) throw new Error('the card is hidden once the menu is closed');
        if (!touch) {
          await openTab(page, 'turns');
          await page.evaluate(() => window.hextable.drawer.setPin(true));
          await sleep(500);
          f = await front();
          if (f.r > f.dr + 1) throw new Error(`the card runs under the pinned menu: ${JSON.stringify(f)}`);
          await shot('defeat-pinned');
          await page.evaluate(() => window.hextable.drawer.setPin(false));
          await closeMenu(page);
        }
      });
      await run.do('the card can be put aside and brought back', async () => {
        await tap(page, '#df .df-x');
        await waitShown(page, '#df', false); await waitShown(page, '#df-chip');
        await tap(page, '#df-chip');
        await waitShown(page, '#df'); await waitShown(page, '#df-chip', false);
      });
      await run.do('a reload while the party is down shows the card again', async () => {
        await page.reload();
        await waitShown(page, '#lobby');
        await playSolo(page);       // the solo game is kept in this browser
        await waitShown(page, '#df');
      });
      await run.do('carry on closes the card and changes nothing; the DM tab brings it back', async () => {
        const before = await state(page, (S) => JSON.stringify(S));
        await tap(page, '#df .df-choice button:has-text("Carry on")');
        await waitShown(page, '#df', false);
        if ((await state(page, (S) => JSON.stringify(S))) !== before) throw new Error('carrying on changed the table');
        await openTab(page, 'dm');
        await waitShown(page, '#dm-fallen-open');
        await page.click('#dm-fallen-open');
        await waitShown(page, '#df');
        await closeMenu(page);
      });
      await run.do('try the fight again asks first, then brings the party back standing', async () => {
        await tap(page, '#df .df-choice button:has-text("Try the fight again")');
        await wait(page, () => /Undo brings it back/.test(document.querySelector('#df .df-sure')?.textContent ?? ''));
        const same = await state(page, (S) => S.entities && Object.values(S.entities).filter((e) => e.kind === 'pc').every((e) => e.dead || e.hp <= 0));
        if (!same) throw new Error('the table moved before the DM agreed');
        await tap(page, '#df [data-df="yes"]');
        await waitShown(page, '#df', false);
        const now = await state(page, (S) => ({ fight: !!S.encounter, up: Object.values(S.entities).filter((e) => e.kind === 'pc' && !e.dead && e.hp > 0).length }));
        if (now.fight || now.up !== pcs.length) throw new Error(`not standing, before the fight: ${JSON.stringify(now)}`);      // the pin is the table just before initiative was called
        await openTab(page, 'log');
        if (!/took the table back to the start of the fight/.test(await page.textContent('#log-list'))) throw new Error('the log does not say so');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=defeat.
export default async function (browser, url) {
  await defeat(browser, url, 'defeat at 1280x800', { viewport: { width: 1280, height: 800 } });
  await defeat(browser, url, 'defeat at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
