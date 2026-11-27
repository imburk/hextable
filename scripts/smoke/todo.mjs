import { scenario, wait, calm, state, shown, open, playSolo, closeMenu, openTab, waitShown, sleep, openMenu, spawnNear } from './lib.mjs';

// ---------- the DM's to-do tray (#675) ----------
// A manual note becomes a card on the DM's screen with the nearest tools and Done; the menu button counts the open cards; the cards survive a
// reload; a monster whose abilities the engine does not run gets a "You run" card; the caster is told only that their spell waits for the DM.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const RIA = async (page) => page.evaluate(async () => {
  const D = await import('./shared/derive.js'), h = window.hextable;
  const rec = D.derive({ name: 'Ria', class: 'wizard', level: 3, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['mage-armor', 'fire-bolt'] }).record;
  h.act({ type: 'addCharacter', record: rec, at: { q: -3, r: 3, z: 0 } });
});
// The one Mage Armor is handed to the DM for: a character typed in with no `acBase` (the built starters have one, so the engine puts the spell on them itself, #683).
const TAVIN = async (page) => page.evaluate(async () => {
  const { PREGENS } = await import('./shared/content/index.js'), h = window.hextable;
  h.act({ type: 'remove', actor: 'wizard' });                 // the built Tavin leaves; the pack's own record (no `acBase`) takes the name
  h.act({ type: 'addCharacter', record: PREGENS.wizard, at: { q: -2, r: 3, z: 0 } });
});
const tavinId = (page) => state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Tavin' && !e.sheet)?.id);
const riaId = (page) => state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ria')?.id);
const cards = (page) => state(page, (S) => (S.todo?.cards ?? []).map((c) => [c.kind, c.name, c.n]));
const badge = (page) => page.evaluate(() => { const b = document.getElementById('menu-badge'); return b.hidden ? 0 : Number(b.textContent); });
const tap = (page, touch, sel) => (touch ? page.tap(sel) : page.click(sel));

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'wide', ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      let ria;
      await run.do('a wizard casts Mage Armor: a card, a badge on the menu button, a toast, and no card before it', async () => {
        await open(page, url); await playSolo(page); await closeMenu(page);
        if ((await cards(page)).length) throw new Error('cards before anything happened');
        await calm(page);      // act() is dropped while beats play (app.js skipping(): a tap skips them instead), so every send below waits for a still timeline (slow under load)
        await RIA(page);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        ria = await riaId(page);
        // Ria is built, so the engine puts Mage Armor on her itself; a typed-in character it cannot, so Tavin is added that way and the spell is handed to the DM.
        await calm(page); await TAVIN(page);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Tavin' && !e.sheet));
        const tav = await tavinId(page);
        await calm(page);
        await page.evaluate(([i, t]) => window.hextable.act({ type: 'cast', actor: i, spell: 'mage-armor', targets: [t] }), [ria, tav]);
        await wait(page, () => window.hextable.state.todo?.cards?.some((c) => c.name === 'Mage Armor'));
        await wait(page, () => !document.getElementById('menu-badge').hidden);
        if ((await badge(page)) !== 1) throw new Error(`badge ${await badge(page)}`);
        await shot(page, `todo-${tag}-badge`);
      });
      await run.do('the badge says what it counts (title and aria-label), a long press shows it, and DM tools has a "Waiting for you" row that opens the menu\'s first level (#844)', async () => {
        const say = '1 waiting: a to-do card (Mage Armor)';
        const got = await page.evaluate(() => ['menu-badge', 'dm-badge'].map((id) => [document.getElementById(id).title, document.getElementById(id).getAttribute('aria-label')]));
        for (const [t, a] of got) if (t !== say || a !== say) throw new Error(`badge words: ${JSON.stringify(got)}`);
        if (touch) {
          const box = await page.locator('#menu-badge').boundingBox();
          const cdp = await ctx.newCDPSession(page);
          const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
          await sleep(800);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await wait(page, (w) => document.getElementById('toast').textContent === w && !document.getElementById('toast').hidden, say);
          if (await page.evaluate(() => document.body.classList.contains('drawer-open'))) throw new Error('the long press opened the menu');
        }
        await openMenu(page, ['dm']); await waitShown(page, '#dm-waiting');
        const row = await page.textContent('#dm-waiting');
        if (!/Waiting for you \(1\)/.test(row) || !/a to-do card \(Mage Armor\)/.test(row)) throw new Error(`row: ${row}`);
        const first = await page.evaluate(() => document.querySelector('#dm > :first-child button')?.id);
        if (first !== 'dm-waiting') throw new Error(`first row is ${first}`);
        await shot(page, `todo-${tag}-dmrow`);
        await tap(page, touch, '#dm-waiting');
        await waitShown(page, '#todo-mount');
        await closeMenu(page);
      });
      await run.do('the DM tab starts with the card: the note, Ria, the tools, and Done', async () => {
        await openMenu(page, []); await waitShown(page, '#todo-mount');      // M6: the tray is under "Waiting for you" on the first level
        const t = await page.textContent('#todo-mount');
        if (!/Mage Armor/.test(t) || !/Ria/.test(t) || !/Tavin/.test(t) || t.indexOf('Tavin') > t.lastIndexOf('Ria')) throw new Error(`card text: ${t}`);
        for (const w of ['Place', 'Damage', 'Heal', 'Condition', 'AC', 'Done']) if (!(await page.locator(`#todo-mount button:text-is("${w}")`).count())) throw new Error(`no ${w} button`);
        const small = await page.evaluate(() => [...document.querySelectorAll('#todo-mount button')].filter((b) => b.getBoundingClientRect().height < 40).map((b) => b.textContent));
        if (touch && small.length) throw new Error(`buttons under 40px: ${small}`);
        await shot(page, `todo-${tag}-card`);
      });
      await run.do('AC: the tool sets Ria to 15 in one step from the card', async () => {
        await page.click(`#todo-mount [data-id="${ria}"] [data-tool="ac"]`);
        await waitShown(page, '#todo-mount [data-f="ac"]');
        await page.fill('#todo-mount [data-f="ac"]', '15');
        await shot(page, `todo-${tag}-ac`);
        await page.click('#todo-mount [data-go="acSet"]');
        await wait(page, (i) => window.hextable.state.entities[i].ac === 15, ria);
      });
      await run.do('Damage, Heal and Condition from the card change Ria', async () => {
        const hp = () => state(page, (S, i) => S.entities[i].hp, ria);
        const was = await hp();
        await page.click(`#todo-mount [data-id="${ria}"] [data-tool="harm"]`); await page.fill('#todo-mount [data-f="n"]', '2'); await page.click('#todo-mount [data-go="harm"]');
        await wait(page, ([i, h]) => window.hextable.state.entities[i].hp === h - 2, [ria, was]);
        await page.click(`#todo-mount [data-id="${ria}"] [data-tool="mend"]`); await page.fill('#todo-mount [data-f="n"]', '1'); await page.click('#todo-mount [data-go="mend"]');
        await wait(page, ([i, h]) => window.hextable.state.entities[i].hp === h - 1, [ria, was]);
        await page.click(`#todo-mount [data-id="${ria}"] [data-tool="cond"]`); await page.selectOption('#todo-mount [data-f="cond"]', 'prone'); await page.click('#todo-mount [data-go="condOn"]');
        await wait(page, (i) => window.hextable.state.entities[i].cond.prone, ria);
        await page.click(`#todo-mount [data-id="${ria}"] [data-tool="cond"]`); await page.selectOption('#todo-mount [data-f="cond"]', 'prone'); await page.click('#todo-mount [data-go="condOff"]');
        await wait(page, (i) => !window.hextable.state.entities[i].cond.prone, ria);
      });
      await run.do('a reload finds the card still open, with the badge; Done takes it away and the badge goes', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        await page.click('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities);
        await sleep(300);
        if (!(await cards(page)).some((c) => c[1] === 'Mage Armor')) throw new Error('the card did not survive the reload');
        await wait(page, () => !document.getElementById('menu-badge').hidden);
        await openMenu(page, []); await waitShown(page, '#todo-mount');      // M6: the tray is under "Waiting for you" on the first level
        await tap(page, touch, '#todo-mount [data-done]');
        await wait(page, () => !(window.hextable.state.todo?.cards ?? []).some((c) => c.name === 'Mage Armor'));
        await wait(page, () => document.getElementById('menu-badge').hidden);
        await waitShown(page, '#todo-mount', false);
      });
      await run.do('a Mage added gets a "You run: Spellcasting" card', async () => {
        await closeMenu(page);
        await calm(page);      // act() is dropped while beats play (a tap skips them instead): the reload's own beats must be done
        await spawnNear(page, 'mage', { near: 'fighter' });          // a hex the map takes a mage on (a fixed offset can be a wall on a random map)
        await wait(page, () => window.hextable.state.todo?.cards?.some((c) => c.kind === 'run'));
        await openMenu(page, []); await waitShown(page, '#todo-mount');      // M6: the tray is under "Waiting for you" on the first level
        const t = await page.textContent('#todo-mount');
        if (!/You run: Spellcasting/.test(t)) throw new Error(`card text: ${t}`);
        await shot(page, `todo-${tag}-run`);
        await tap(page, touch, '#todo-mount [data-done]');
        await wait(page, () => !(window.hextable.state.todo?.cards ?? []).length);
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

async function players(browser, url) {
  await scenario('the caster is told that the DM has something to apply, and never sees the card', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      await run.do('host a table, let a phone in, add Ria and let the phone play her', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await RIA(host);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        await closeMenu(host);
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ria'));
        await openMenu(phone, []); const b = phone.locator('#arc .arc-b:has-text("Play as Ria")');
        await b.click(); await closeMenu(phone);
        const id = await riaId(host);
        await wait(phone, (i) => !!window.hextable.state.entities[i].owner, id);
      });
      const id = await riaId(host);
      await run.do('the phone casts Mage Armor: the phone says it waits for the DM, in words that carry nothing of the DM\'s note', async () => {
        await TAVIN(host);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Tavin' && !e.sheet));
        const tav = await tavinId(host);
        await calm(phone); await calm(host);      // the phone's act() is dropped while the host's remove and add are still playing there
        await phone.evaluate(([i, t]) => window.hextable.act({ type: 'cast', actor: i, spell: 'mage-armor', targets: [t] }), [id, tav]);
        await wait(host, () => window.hextable.state.todo?.cards?.some((c) => c.name === 'Mage Armor'));
        await wait(phone, () => !document.getElementById('todo-wait').hidden);
        const line = await phone.textContent('#todo-wait');
        if (!/Mage Armor/.test(line) || !/waiting for the DM/.test(line)) throw new Error(`line: ${line}`);
        const dump = await phone.evaluate(() => JSON.stringify(window.hextable.state));
        if (/"todo"/.test(dump)) throw new Error('the phone was sent the tray');
        const box = await phone.evaluate(() => { const r = document.getElementById('todo-wait').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
        if (box.l < 0 || box.r > box.w) throw new Error(`the line is off screen: ${JSON.stringify(box)}`);
        await shot(phone, 'todo-player-waiting');
      });
      await run.do('the DM sees a badge and the card; setting AC and Done clears the phone\'s line', async () => {
        await wait(host, () => !document.getElementById('menu-badge').hidden);
        await openMenu(host, []); await waitShown(host, '#todo-mount');
        await shot(host, 'todo-host-card');
        await host.click(`#todo-mount [data-id="${id}"] [data-tool="ac"]`); await host.fill('#todo-mount [data-f="ac"]', '14'); await host.click('#todo-mount [data-go="acSet"]');
        await wait(phone, (i) => window.hextable.state.entities[i].ac === 14, id);
        await host.click('#todo-mount [data-done]');
        await wait(phone, () => document.getElementById('todo-wait').hidden);
        await wait(host, () => document.getElementById('menu-badge').hidden);
        if (await shown(phone, '#todo-mount')) throw new Error('the phone has a tray');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=todo.
export default async function (browser, url) {
  await solo(browser, url, 'to-do tray at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await solo(browser, url, 'to-do tray at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } });
  await players(browser, url);
}
