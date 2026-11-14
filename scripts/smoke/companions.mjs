import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, openTab, calm, selectAndMove } from './lib.mjs';

// ---------- companions ----------
// The client side of companions C1 (docs/specs/companions.md; issue #318). Solo at both sizes, the DM bonds a foe to Brenna as a familiar that
// can't attack: the log, the tracker and the card say "Brenna's goblin", the DM's Bond and Free work, a familiar has no Attacks tab, and when it
// drops to 0 it is gone with a log line that still names it. Then a DM and a phone player: the player's chips show the companion, it moves
// when they tap the map, and "Let it act" reaches the table.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const logText = (page) => page.evaluate(() => [...document.querySelectorAll('#log-list .lg-line')].map((l) => l.textContent).join('\n'));
const foeOf = (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && !e.bond)?.id;

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desktop';
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let foe;
      await run.do('the DM bonds a foe to Brenna as a familiar that can not attack', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await page.evaluate(() => { document.getElementById('dm-auto') && (document.getElementById('dm-auto').checked = false); });
        foe = await state(page, foeOf);
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: 'fighter', kind: 'familiar', noAttack: true }), foe);
        await wait(page, (f) => window.hextable.state.entities[f].bond?.noAttack === true && window.hextable.state.entities[f].side === 'party', foe);
        await calm(page);
      });
      await run.do('the log, the tracker and the card call it Brenna\'s Goblin', async () => {
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/is now Brenna's familiar/.test(t)) throw new Error(`log: ${t.slice(-300)}`);
        await openTab(page, 'turns');
        const rows = await page.$$eval('#tracker .tr-name', (l) => l.map((x) => x.textContent));
        if (!rows.some((r) => /^Brenna's Goblin/.test(r))) throw new Error(`tracker: ${JSON.stringify(rows)}`);
        await closeMenu(page);
        await page.evaluate((f) => window.hextable.select(f), foe);
        await waitShown(page, '#card');
        const nm = await page.textContent('#c-name');
        if (!/^Brenna's Goblin/.test(nm)) throw new Error(`card: ${nm}`);
        if (!(await shown(page, '#btn-let'))) throw new Error('no "Let it act" on the DM\'s card');
        await shot(page, `companions-card-${tag}`);
      });
      await run.do('on its turn a familiar has no Attacks tab', async () => {
        await page.evaluate((f) => { const h = window.hextable; const x = h.state.entities[f]; h.act({ type: 'startEncounter', center: x.pos, radius: 40 }); }, foe);
        await wait(page, () => window.hextable.state.encounter);
        for (let i = 0; i < 24; i++) {
          const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
          if (cur === foe) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(page);
        }
        if ((await state(page, (S) => S.encounter.order[S.encounter.turn].id)) !== foe) throw new Error('its turn did not come');
        await page.evaluate((f) => window.hextable.select(f), foe);
        await waitShown(page, '#ap-tab-move', true, 8000);
        if (await shown(page, '#ap-tab-attacks')) throw new Error('a creature that can not attack has an Attacks tab');
        await shot(page, `companions-turn-${tag}`);
      });
      await run.do('the DM frees it with the Free button and bonds it again with Bond', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => !window.hextable.state.encounter);
        await openTab(page, 'dm');
        await wait(page, (f) => !document.getElementById('dm-bond-free').disabled, foe);
        if (!(await page.evaluate(() => document.getElementById('dm-bond').disabled))) throw new Error('Bond is open on a creature that is bound');
        await page.click('#dm-bond-free');
        await wait(page, (f) => !window.hextable.state.entities[f].bond, foe);
        await wait(page, () => document.getElementById('dm-bond').disabled === false);
        await page.selectOption('#dm-bond-to', 'fighter');
        await page.selectOption('#dm-bond-kind', 'pet');
        await page.click('#dm-bond');
        await wait(page, (f) => window.hextable.state.entities[f].bond?.kind === 'pet', foe);
        await shot(page, `companions-dm-${tag}`);
        await closeMenu(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/is no longer Brenna's companion/.test(t) || !/is now Brenna's pet/.test(t)) throw new Error(`log: ${t.slice(-400)}`);
        await closeMenu(page);
      });
      await run.do('at 0 Hit Points a companion that vanishes is named in the log and its pawn goes', async () => {
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: null }), foe);
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: 'fighter', kind: 'familiar' }), foe);
        await wait(page, (f) => window.hextable.state.entities[f].bond?.at0 === 'vanish', foe);
        await page.evaluate((f) => window.hextable.act({ type: 'harm', actor: f, amount: 999 }), foe);
        await wait(page, (f) => !window.hextable.state.entities[f], foe);
        await calm(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/Brenna's Goblin.* takes \d+ .* damage/.test(t) || !/Brenna's Goblin.* drops to 0 Hit Points and vanishes/.test(t)) throw new Error(`log: ${t.slice(-400)}`);
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

async function table(browser, url) {
  await scenario('companions: a phone player drives a companion', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let id, name, pet;
      await run.do('host a table, the phone joins and claims a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });
      await run.do('the DM bonds a foe to that character: the phone gets a chip for it and the DM\'s record has no owner for it', async () => {
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));      // no fight starts by itself while the steps run
        pet = await host.evaluate(([i]) => {
          const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          window.hextable.act({ type: 'bond', actor: f.id, to: i, kind: 'pet' });
          return f.id;
        }, [id]);
        await wait(phone, (p) => window.hextable.state.entities[p]?.bond, pet);
        const want = await phone.evaluate((p) => `${window.hextable.state.entities[window.hextable.state.entities[p].bond.to].name}'s `, pet);
        await phone.waitForSelector(`#party button:has-text("${want}")`, { timeout: 8000 });
        if (await host.evaluate((p) => !!window.hextable.state.entities[p].owner, pet)) throw new Error('the companion has an owner of its own');
        await shot(phone, 'companions-chips-phone');
      });
      await run.do('the phone picks it and moves it by tapping the map', async () => {
        const chip = await phone.evaluate((p) => `${window.hextable.state.entities[window.hextable.state.entities[p].bond.to].name}'s `, pet);
        const pos = await selectAndMove(phone, true, pet, chip.trim());
        await wait(host, ([p, q]) => { const x = window.hextable.state.entities[p].pos; return x.q === q.q && x.r === q.r; }, [pet, pos]);
      });
      await run.do('"Let it act" on the phone reaches the table and the log', async () => {
        await waitShown(phone, '#btn-let');
        await phone.tap('#btn-let input');
        await wait(host, (p) => window.hextable.state.entities[p].bond.auto === true, pet);
        await wait(phone, (p) => window.hextable.state.entities[p].bond.auto === true, pet);
        await calm(phone);
        await openTab(phone, 'log');
        if (!/acts on its own now/.test(await logText(phone))) throw new Error('no log line on the phone');
        await shot(phone, 'companions-let-phone');
        await closeMenu(phone);
      });
      await run.do('freed by the DM, the phone loses the chip and no longer drives it', async () => {
        await host.evaluate((p) => window.hextable.act({ type: 'bond', actor: p, to: null }), pet);
        await wait(phone, (p) => !window.hextable.state.entities[p]?.bond, pet);
        await sleep(300);
        if (await shown(phone, '#btn-let')) throw new Error('"Let it act" still shown for a creature that is free');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'companions: solo, desktop', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'companions: solo, phone with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await table(browser, url);
}
