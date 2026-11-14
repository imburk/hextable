import { mkdirSync } from 'node:fs';
import { scenario, settle, tapAt, onCanvas, wait, state, waitShown, open, playSolo, closePanels, panelTab } from './lib.mjs';

// ---------- the action panel's Items tab (docs/specs/table-ui.md, T4b and E18) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch. A built fighter carries two Potions of Healing, a Wand of Magic Missiles and a Staff of Striking (a hand-typed
// creature holds names only). The Items tab lists a Use row for each use with the engine's reason when it is greyed, the gear with Wield and Attune, and the light.
// A potion asks whom it is for when someone is within 5 ft and heals them; the wand cannot be used until it is held, then spends a charge; Attune is chosen for the next
// Short Rest; Light a torch is the DM's; in a fight the gear buttons are greyed with the engine's words and a tap on one sends nothing. Screenshots go to /tmp/items-tab/.
const SHOTS = '/tmp/items-tab';
const ITEMS = [{ id: 'i1', item: 'potion-of-healing' }, { id: 'i2', item: 'potion-of-healing' }, { id: 'i3', item: 'wand-of-magic-missiles' }, { id: 'i4', item: 'staff-of-striking' }];
const SHEET = { name: 'Orla', class: 'fighter', level: 5, subclass: 'champion', abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ['athletics', 'perception'],
  choices: { 'fighting-style': 'defense' }, weapons: ['longbow'], items: ITEMS };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const idle = (page) => wait(page, () => window.hextable.waiting === 0, null, 20000);
const cur = (page) => state(page, (S) => S.encounter.order[S.encounter.turn].id);

async function items(browser, url, label, opts, tag) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      mkdirSync(SHOTS, { recursive: true });
      const tap = (sel, force = false) => (touch ? page.locator(sel).tap({ force }) : page.click(sel, { force }));      // a greyed row is aria-disabled, which the driver counts as not enabled: forced
      const shot = (name) => page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` });
      const hero = () => state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Orla').id);
      const sheetOf = async () => state(page, (S) => { const e = Object.values(S.entities).find((x) => x.name === 'Orla'); return { hp: e.hp, items: e.sheet.items, attuning: e.sheet.attuning ?? null, light: e.light ?? null }; });
      const turnOf = async (id) => {
        for (let k = 0; k < 30 && (await cur(page)) !== id; k++) { await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), await cur(page)); await idle(page); }
        if ((await cur(page)) !== id) throw new Error(`it never became ${id}'s turn`);
      };
      const raise = async () => { if ((await page.getAttribute('#ap-grip', 'aria-expanded')) !== 'true') await tap('#ap-grip'); };

      await run.do('a built fighter with items joins the party beside the rogue and is selected; the Items tab is drawn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await closePanels(page);
        await page.evaluate((sh) => window.hextable.act({ type: 'setSheet', sheet: sh }), SHEET);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Orla'));
        const id = await hero();
        await page.evaluate((i) => window.hextable.act({ type: 'place', actor: i, to: { q: -6, r: 3 } }), id);
        await wait(page, (i) => window.hextable.state.entities[i].pos.q === -6, id);
        await page.evaluate((i) => window.hextable.select(i), id);
        await wait(page, () => document.querySelector('#c-name').textContent === 'Orla');
        await panelTab(page, 'items');
      });

      await run.do('Use rows: Drink is ready, the wand and the staff are greyed and say why on screen; Carried lists the gear; the light is the DM\'s', async () => {
        await waitShown(page, '#ap-items [data-row="item:i1:0"]');
        const rows = await page.$$eval('#ap-items [data-row]', (r) => r.map((x) => ({ id: x.dataset.row, off: x.getAttribute('aria-disabled'), why: x.querySelector('.ap-why')?.textContent ?? '', t: x.textContent.replace(/\s+/g, ' ').trim() })));
        const by = Object.fromEntries(rows.map((r) => [r.id, r]));
        if (by['item:i1:0']?.off !== 'false' || !/Drink/.test(by['item:i1:0'].t) || !/Bonus/.test(by['item:i1:0'].t)) throw new Error(`Drink: ${JSON.stringify(by['item:i1:0'])}`);
        if (by['item:i3:0']?.off !== 'true' || !/must be held to be used/.test(by['item:i3:0'].why) || !/7 \/ 7/.test(by['item:i3:0'].t)) throw new Error(`wand: ${JSON.stringify(by['item:i3:0'])}`);
        if (by['item:i4:0']?.off !== 'true' || !by['item:i4:0'].why) throw new Error(`staff: ${JSON.stringify(by['item:i4:0'])}`);
        if (!by.light || !/Light a torch/.test(by.light.t)) throw new Error(`light: ${JSON.stringify(by.light)}`);
        const gear = await page.$$eval('#ap-items [data-gear]', (g) => g.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
        if (!gear.some((g) => /Wand of Magic Missiles.*Not held.*Wield/.test(g)) || !gear.some((g) => /Staff of Striking.*Needs attunement.*Attune/.test(g)) || !gear.some((g) => /Potion of Healing.*Carried/.test(g))) throw new Error(`gear: ${gear.join(' | ')}`);
        await raise(); await shot('1-items'); 
      });

      await run.do('a tap on a greyed row shows its reason and sends nothing', async () => {
        const before = JSON.stringify((await sheetOf()).items);
        await tap('#ap-items [data-row="item:i3:0"]', true);
        await waitShown(page, '#toast');
        if (!/must be held/.test(await text(page, '#toast'))) throw new Error(`toast: ${await text(page, '#toast')}`);
        if (JSON.stringify((await sheetOf()).items) !== before) throw new Error('a greyed row changed the sheet');
      });

      await run.do('Drink with the rogue within 5 ft asks whom; Cancel changes nothing; choosing the rogue heals them and uses one potion up', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'rogue', hp: 3 }));
        await wait(page, () => window.hextable.state.entities.rogue.hp === 3);
        await tap('#ap-items [data-row="item:i1:0"]');
        await waitShown(page, '#ap-items .ap-pick');
        const names = await page.$$eval('#ap-items .ap-pick button', (b) => b.map((x) => x.textContent.trim()));
        if (!names.includes('Orla') || names.length < 3 || !names.includes('Cancel')) throw new Error(`picker: ${names}`);
        await shot('2-picker');
        await tap('#ap-items [data-pick-cancel]');
        await waitShown(page, '#ap-items .ap-pick', false);
        if ((await sheetOf()).items.length !== 4) throw new Error('Cancel used a potion');
        await tap('#ap-items [data-row="item:i1:0"]');
        await waitShown(page, '#ap-items .ap-pick');
        await tap('#ap-items [data-pick="rogue"]');
        await wait(page, () => window.hextable.state.entities.rogue.hp > 3);
        await idle(page);
        if ((await sheetOf()).items.some((x) => x.id === 'i1') !== false || (await sheetOf()).items.length !== 3) throw new Error('the potion was not used up');
        await waitShown(page, '#ap-items [data-row="item:i1:0"]', false);
      });

      await run.do('Wield the wand: its row is ready (a spell is armed, not greyed for lacking a target) and shows 7 / 7', async () => {
        await tap('#ap-items [data-gact="equip:i3"]');
        await wait(page, () => window.hextable.state.entities && Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').sheet.items.find((x) => x.id === 'i3').equipped === true);
        await wait(page, () => document.querySelector('#ap-items [data-row="item:i3:0"]')?.getAttribute('aria-disabled') === 'false');
        if (!/7 \/ 7/.test(await text(page, '#ap-items [data-row="item:i3:0"]'))) throw new Error('charges');
        if (!(await page.$eval('#ap-items [data-gear="i3"]', (e) => /Held/.test(e.textContent)))) throw new Error('the wand is not shown held');
      });

      await run.do('Attune on the staff is chosen for the next Short Rest and can be cancelled; Wield the staff; the light is lit by the DM', async () => {
        await tap('#ap-items [data-gact="attune:i4"]');
        await wait(page, () => Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').sheet.attuning?.item === 'i4');
        await wait(page, () => /Attuning at the next Short Rest/.test(document.querySelector('#ap-items [data-gear="i4"]')?.textContent ?? ''));
        await shot('3-attuning');
        await tap('#ap-items [data-gact="attune:i4"]');
        await wait(page, () => !Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').sheet.attuning);
        await tap('#ap-items [data-gact="attune:i4"]');
        await wait(page, () => Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').sheet.attuning?.item === 'i4');
        await tap('#ap-items [data-row="light"]');
        await wait(page, () => !!Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').light);
        await wait(page, () => /Put out the torch/.test(document.querySelector('#ap-items [data-row="light"]')?.textContent ?? ''));
      });

      await run.do('the log tells of the potion, the wand, the wielding and the attuning', async () => {
        await page.evaluate(() => window.hextable.drawer.open('log'));
        await waitShown(page, '#log-list');
        const log = await page.textContent('#log-list');
        await closePanels(page);
        for (const re of [/uses Potion of Healing: Drink on /, /readies Wand of Magic Missiles/, /will attune to Staff of Striking at the next Short Rest/]) if (!re.test(log)) throw new Error(`the log lacks ${re}: ${log.replace(/\s+/g, " ").slice(-700)}`);
      });

      await run.do('in a fight, out of turn: every use is greyed "It isn\'t Orla\'s turn", the gear buttons are greyed with the engine\'s words and a tap sends nothing', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }));
        await wait(page, () => !!window.hextable.state.encounter);
        const id = await hero();
        if ((await cur(page)) === id) await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), id);
        await idle(page);
        await page.evaluate((i) => window.hextable.select(i), id);                      // the card follows the turn
        await wait(page, () => document.querySelector('#c-name').textContent === 'Orla' && document.querySelector('#card').dataset.situation === 'wait');
        await panelTab(page, 'items');
        await wait(page, () => document.querySelector('#ap-items [data-gact="equip:i4"]')?.getAttribute('aria-disabled') === 'true');
        if (!/in the middle of a fight/.test(await text(page, '#ap-items')) || !/It isn't Orla's turn/.test(await text(page, '#ap-items [data-row="item:i2:0"]'))) throw new Error(`no reasons on screen: ${await text(page, '#ap-items')}`);
        const before = JSON.stringify((await sheetOf()).items);
        await tap('#ap-items [data-gact="equip:i4"]', true);
        await waitShown(page, '#toast');
        if (!/in the middle of a fight/.test(await text(page, '#toast'))) throw new Error(`toast: ${await text(page, '#toast')}`);
        if (JSON.stringify((await sheetOf()).items) !== before) throw new Error('a greyed button changed the sheet');
        await raise(); await shot('4-fight');
      });

      await run.do('on her own turn Drink is ready as a Bonus Action; Drink on herself spends it and the potion; the use rows grey with the engine\'s reason', async () => {
        const id = await hero();
        await turnOf(id);
        await page.evaluate((i) => window.hextable.select(i), id);
        await wait(page, () => document.querySelector('#c-name').textContent === 'Orla' && document.querySelector('#card').dataset.situation === 'turn');
        await panelTab(page, 'items');
        await wait(page, () => document.querySelector('#ap-items [data-row="item:i2:0"]')?.getAttribute('aria-disabled') === 'false');
        await tap('#ap-items [data-row="item:i2:0"]');
        await waitShown(page, '#ap-items .ap-pick');
        await tap('#ap-items [data-pick="self"]');
        await wait(page, () => !Object.values(window.hextable.state.entities).find((e) => e.name === 'Orla').sheet.items.some((x) => x.id === 'i2'));
        await idle(page);
        if ((await state(page, () => window.hextable.state.encounter.budget.bonus)) !== 0) throw new Error('the Bonus Action was not spent');
        await shot('5-own-turn');
      });

      await run.do('the Magic Missile wand: a tap offers the levels, level 2 arms it, a tap on a goblin and Cast send `use` with the aim and the level; 2 charges are spent and darts land', async () => {
        const id = await hero(), charges = () => state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Orla').sheet.items.find((x) => x.id === 'i3').charges ?? 7);
        await wait(page, () => document.querySelector('#ap-items [data-row="item:i3:0"]')?.getAttribute('aria-disabled') === 'false');
        const goblin = await state(page, (S) => Object.values(S.entities).find((e) => e.side !== 'party' && !e.dead).id);
        await tap('#ap-items [data-row="item:i3:0"]');
        await waitShown(page, '#ap-items [data-lvl="2"]');
        await shot('6-levels');
        await tap('#ap-items [data-lvl="2"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.item?.level === 2);
        await waitShown(page, '#hint');
        await page.evaluate((i) => window.hextable.R.focus(i, true), goblin);
        await settle(page, goblin);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), goblin);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('the goblin is off screen or under a panel');
        await tapAt(page, touch, pt.x, pt.y);
        await shot('7-armed');
        await waitShown(page, '#hint-go');
        await tap('#hint-go');
        await wait(page, () => window.hextable.mode.kind === 'move');
        await idle(page);
        if ((await charges()) !== 5) throw new Error(`charges ${await charges()}`);
        const cast = await state(page, (S) => S.timeline.some((e) => e.type === 'cast' && e.item === 'Wand of Magic Missiles'));
        if (!cast) throw new Error('no cast from the wand in the timeline');
        await page.evaluate((i) => window.hextable.select(i), id);
        await wait(page, () => /5 \/ 7/.test(document.querySelector('#ap-items [data-row="item:i3:0"]')?.textContent ?? ''));
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=items.
export default async function (browser, url) {
  await items(browser, url, 'action panel Items tab at 1280x800', { viewport: { width: 1280, height: 800 } }, 'desktop');
  await items(browser, url, 'action panel Items tab at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'phone');
}
