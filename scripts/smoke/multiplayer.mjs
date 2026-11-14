
import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, selectAndMove, diceDuel } from './lib.mjs';

// ---------- multiplayer ----------
async function multiplayer(browser, url) {
  await scenario('multiplayer: host on a desktop, a phone joins', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let code;

      await run.do('host a table', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM');
        await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
      });

      await run.do('join from the phone and wait to be let in', async () => {
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player');
        await phone.fill('#lobby-code', code);
        await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        const s = await state(phone, (S) => S);
        if (s) throw new Error('the phone was given a game before being let in');
      });

      await run.do('the DM lets the phone in', async () => {
        await openTab(host, 'dm');
        await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
      });

      let id, name;
      await run.do('the phone claims a character', async () => {
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(phone, (i) => !!window.hextable.state.entities[i].owner, id);
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });

      await run.do('the phone moves it and the DM sees it move', async () => {
        const pos = await selectAndMove(phone, true, id, name);
        await wait(host, ([i, p]) => { const q = window.hextable.state.entities[i].pos; return q.q === p.q && q.r === p.r && q.z === p.z; }, [id, pos]);
      });

      await run.do("dice: the phone throws its attack and the DM sees the dice; a monster's d20 is not shown to the phone", async () => {
        const { pc, foe } = await diceDuel(host, phone, id);
        const n = await host.evaluate(() => window.hextable.state.encounter.budget.action);
        await phone.evaluate(([p, f]) => { const e = window.hextable.state.entities[p]; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
        await waitShown(phone, '#dice-tray');
        await sleep(300);
        if ((await host.evaluate(() => window.hextable.state.encounter.budget.action)) !== n) throw new Error('the attack was applied before the throw');
        await phone.locator('#dice-tray .dt-throw').tap();
        await wait(host, (k) => window.hextable.state.encounter.budget.action === k - 1, n, 15000);
        await wait(host, (p) => window.hextable.thrown.some((g) => g.type === 'attack' && g.side === 'party' && g.dice.some((d) => d.sides === 20)), pc, 15000);
        // The monster attacks the phone's character, its dice thrown for the DM.
        await wait(host, () => window.hextable.waiting === 0, null, 20000);
        await wait(phone, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {           // on round the order to the foe's turn
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
          if (cur === foe) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(host, () => window.hextable.waiting === 0, null, 20000);
        }
        const sent = await host.evaluate(async ([p, f]) => {
          const S = window.hextable.state;
          if (S.encounter.order[S.encounter.turn].id !== f) return 'not its turn';
          const def = S.entities[f].actions?.find((a) => JSON.stringify(a.effects ?? []).includes('"melee"'));
          window.hextable.act(def ? { type: 'act', actor: f, action: def.id, target: p } : { type: 'attack', actor: f, target: p, attack: S.entities[f].attacks[0].id });
          return 'sent';
        }, [pc, foe]);
        if (sent === 'sent') {
          await wait(host, (f) => window.hextable.thrown.some((g) => g.type === 'attack' && g.side === 'foe'), foe, 15000);
          await wait(phone, () => window.hextable.waiting === 0, null, 20000);
          await sleep(500);
        }
        const leaked = await phone.evaluate(() => window.hextable.thrown.filter((g) => (g.type === 'initiative' ? g.ids.some((i) => window.hextable.state.entities[i]?.side !== 'party') : g.side !== 'party' && g.dice.some((d) => d.sides === 20))).map((g) => g.label));
        if (leaked.length) throw new Error(`the phone was shown a monster's d20: ${leaked.join(', ')}`);
        if (sent !== 'sent') throw new Error(`the monster could not attack: ${sent}`);
      });
    } finally { await phoneCtx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=multiplayer.
export default async function (browser, url) {
  await multiplayer(browser, url);
}
