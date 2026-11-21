import { scenario, wait, open, playSolo, closePanels, waitShown, openTab, fighterBasics } from './lib.mjs';

// ---------- rolled Hit Points (#638): level up a fighter at a table that rolls them, at both sizes ----------
// The DM's setting is a select of its own (full width, 44 px at least); the level-up screen says the game rolls and its button says so; one tap rolls the new
// level; the log carries the die for everyone; the sheet keeps the roll and the Hit Points are the roll plus Constitution (+2 here) over the level 1 maximum (12).
const SHEET = { name: 'Rolla', class: 'fighter', level: 1, abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 8 }, skills: ['athletics', 'perception'],
  choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', weapons: ['longsword'] };
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);

async function pass(browser, url, label, opts, touch) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
      let id;
      await run.do('open solo play, turn on rolled Hit Points in the DM tab, add a level 1 fighter', async () => {
        await open(page, url); await playSolo(page); await closePanels(page);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.selectOption('#dm-hp-method', 'rolled');
        await wait(page, () => window.hextable.state.settings.hpMethod === 'rolled');
        const h = await page.$eval('#dm-hp-method', (e) => Math.round(e.getBoundingClientRect().height));
        if (h < 44) throw new Error(`the select is ${h} px high`);
        if (!(await page.isVisible('#dm-hp-low'))) throw new Error('the low-roll choice is not shown at a rolled table');
        await shot(page, `rolledhp-${touch ? 'phone' : 'desktop'}-1-setting`);
        await page.evaluate((sheet) => window.hextable.act({ type: 'setSheet', sheet }), SHEET);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Rolla'));
        id = await page.evaluate(() => { const e = Object.values(window.hextable.state.entities).find((x) => x.name === 'Rolla'); window.hextable.select(e.id); return e.id; });
        const hp = await page.evaluate((i) => window.hextable.state.entities[i].maxHp, id);
        if (hp !== 12) throw new Error(`level 1 is ${hp}, not the die's maximum plus Constitution`);
      });
      await run.do('the level-up screen says the game rolls, and the button says so', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await wait(page, () => !document.getElementById('qb-levelup')?.disabled);
        await tap('#qb-levelup'); await waitShown(page, '#qb');
        const save = await page.$eval('#qb-save', (e) => e.textContent);
        if (save !== 'Roll hit points and level up to 2') throw new Error(`the button says "${save}"`);
        await tap('#qb-acc-bar-hp'); await waitShown(page, '#qb-hp-roll');      // the Hit points section, in the screen's own pick-row layout
        const row = await page.$eval('#qb-hp-roll', (e) => e.textContent);
        if (!/Roll hit points/.test(row) || !/d10/.test(row)) throw new Error(`the row says "${row}"`);
        if (!(await page.isVisible('#qb-hp-roll .ibtn'))) throw new Error('no i button for the rule');
        const small = await page.$$eval('#qb-hp-roll .ibtn, #qb-save', (es) => es.some((e) => e.getBoundingClientRect().height < 30));
        if (small) throw new Error('a control is too small to tap');
        const clipped = await page.$eval('#qb-hp-roll .l2.one', (e) => e.scrollWidth > e.clientWidth + 1);      // the summary is one line with an ellipsis: it must fit
        if (clipped) throw new Error(`the row's summary is clipped: "${await page.$eval('#qb-hp-roll .l2.one', (e) => e.textContent)}"`);
        await shot(page, `rolledhp-${touch ? 'phone' : 'desktop'}-2-levelup`);
      });
      await run.do('one tap rolls the level: the sheet keeps the roll, the Hit Points follow, the log shows the die', async () => {
        await tap('#qb-save');
        await wait(page, (i) => window.hextable.state.entities[i].level === 2, id).catch(async () => { throw new Error(`no level 2; the screen says: ${await page.evaluate(() => document.querySelector('#qb-problems')?.textContent + ' | ' + document.getElementById('toast')?.textContent)}`); });
        const r = await page.evaluate((i) => { const e = window.hextable.state.entities[i]; return { rolls: e.sheet.hpRolls, max: e.maxHp }; }, id);
        const roll = r.rolls?.fighter?.[0];
        if (!(Number.isInteger(roll) && roll >= 1 && roll <= 10 && r.rolls.fighter.length === 1)) throw new Error(`rolls ${JSON.stringify(r.rolls)}`);
        if (r.max !== 12 + Math.max(1, roll + 2)) throw new Error(`Hit Points ${r.max} for a roll of ${roll}`);
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'hpRolled' && e.levels?.length === 1)).catch(() => { throw new Error('no hpRolled in the timeline'); });
        // The log's own words for the event (the log pane builds lazily; describe is the smoke's window onto them): every die, for everyone.
        const line = await page.evaluate(() => { const e = window.hextable.state.timeline.find((x) => x.type === 'hpRolled'); return window.hextable.describe(e); });
        if (!/^Rolla rolls Hit Points: Fighter 2: \d+ of d10 = \d+\. \+\d+ in all\.$/.test(line ?? '')) throw new Error(`the log says "${line}"`);
        await shot(page, `rolledhp-${touch ? 'phone' : 'desktop'}-3-rolled`);
      });

      const toastText = () => page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
      const hpIds = () => page.evaluate(() => Object.values(window.hextable.state.entities).filter((e) => e.sheet?.name === 'Pending').map((e) => e.id));
      await run.do('edit: a character with levels not rolled yet gets Roll hit points; a refused roll leaves the button alive; a roll goes through and closes the screen', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.selectOption('#dm-hp-method', 'fixed'); await wait(page, () => window.hextable.state.settings.hpMethod === 'fixed');
        await page.evaluate((sheet) => window.hextable.act({ type: 'setSheet', sheet: { ...sheet, name: 'Pending', level: 3, subclass: 'champion' } }), SHEET);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.sheet?.name === 'Pending'));
        const [pid] = await hpIds();
        await page.selectOption('#dm-hp-method', 'rolled'); await wait(page, () => window.hextable.state.settings.hpMethod === 'rolled');
        await page.evaluate((i) => window.hextable.select(i), pid);
        await tap('#qe-edit'); await waitShown(page, '#qb');
        await waitShown(page, '#qb-roll-hp');
        const save = await page.$eval('#qb-save', (e) => e.textContent);
        if (save !== 'Save changes') throw new Error(`the edit button says "${save}"`);
        // The table goes back to fixed under the open screen: the engine refuses the roll, and the buttons must not stay dead.
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'hpMethod', value: 'fixed' }));
        await tap('#qb-roll-hp');
        await wait(page, () => !document.getElementById('qb-roll-hp')?.disabled && !document.getElementById('qb-save')?.disabled, null, 9000).catch(() => { throw new Error('the Roll hit points or Save button stayed disabled after a refused roll'); });
        if (await page.evaluate((i) => !!window.hextable.state.entities[i].sheet.hpRolls, pid)) throw new Error('a refused roll wrote rolls');
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'hpMethod', value: 'rolled' }));
        await wait(page, () => window.hextable.state.settings.hpMethod === 'rolled');
        await tap('#qb-roll-hp');
        await wait(page, (i) => window.hextable.state.entities[i].sheet.hpRolls?.fighter?.length === 2, pid);
        await wait(page, () => document.getElementById('qb')?.hidden !== false, null, 6000).catch(() => { throw new Error('the screen did not close after the roll'); });
      });
      await run.do('add above level 1 at a rolled table: the label says so, the Hit points section is there, and saving rolls every level after the first', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await tap('#qb-add'); await waitShown(page, '#qb');
        await page.fill('#qb-name', 'Added'); await page.selectOption('#qb-class', 'fighter'); await page.selectOption('#qb-levelsel', '3'); await fighterBasics(page);
        await wait(page, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0).catch(async () => { throw new Error(`Save is not ready: ${await page.evaluate(() => [...document.querySelectorAll('#qb-problems li, #qb-save-why')].map((e) => e.textContent).join(' | '))}`); });
        const save = await page.$eval('#qb-save', (e) => e.textContent);
        if (save !== 'Roll hit points and add to the table') throw new Error(`the add button says "${save}"`);
        if (!(await page.$('#qb-acc-bar-hp'))) throw new Error('no Hit points section when adding above level 1');
        await tap('#qb-save');
        await wait(page, () => /Hit points rolled: \d+, \d+/.test(document.getElementById('toast')?.textContent ?? ''), null, 6000).catch(async () => { throw new Error(`the toast says "${await toastText()}"`); });
        const r = await page.evaluate(() => { const e = Object.values(window.hextable.state.entities).find((x) => x.sheet?.name === 'Added'); return e && e.sheet.hpRolls.fighter.length; });
        if (r !== 2) throw new Error(`the new character has ${r} rolls`);
      });
      await run.do('a fixed table: no Hit points section, the plain labels, no roll button', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.selectOption('#dm-hp-method', 'fixed'); await wait(page, () => window.hextable.state.settings.hpMethod === 'fixed');
        if (await page.isVisible('#dm-hp-low')) throw new Error('the low-roll choice is shown at a fixed table');
        await tap('#qb-add'); await waitShown(page, '#qb');
        await page.selectOption('#qb-levelsel', '3');
        if (await page.$('#qb-acc-bar-hp') || await page.$('#qb-roll-hp')) throw new Error('a Hit points section or roll button at a fixed table');
        const add = await page.$eval('#qb-save', (e) => e.textContent);
        if (add !== 'Add to the table') throw new Error(`the add button says "${add}"`);
        await tap('#qb-cancel');
        await page.evaluate(() => { const e = Object.values(window.hextable.state.entities).find((x) => x.sheet?.name === 'Added'); window.hextable.select(e.id); });
        await tap('#qb-levelup'); await waitShown(page, '#qb');
        const up = await page.$eval('#qb-save', (e) => e.textContent);
        if (up !== 'Level up to 4') throw new Error(`the level-up button says "${up}"`);
        if (await page.$('#qb-acc-bar-hp')) throw new Error('a Hit points section on a fixed level-up');
        await tap('#qb-cancel');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await pass(browser, url, 'rolled hit points at 1280x800 with a mouse', { viewport: { width: 1280, height: 800 } }, false);
  await pass(browser, url, 'rolled hit points at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);
}
