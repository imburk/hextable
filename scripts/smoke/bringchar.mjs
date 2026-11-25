// Bring a character (#757 part 2): a player at a hosted table brings a character (built now, then one kept in My characters) and the DM reads it, sets the level range,
// ticks that the history was looked at and admits it; the second offer is declined. 1280x800 DM, 390x844 touch player. Screenshots go to SMOKE_SHOTS when it is set.
import { fileURLToPath } from 'node:url';
import { sleep, scenario, wait, waitShown, open, openMenu, fighterBasics } from './lib.mjs';

const shot = async (page, name, still = 900) => { if (!process.env.SMOKE_SHOTS) return; await sleep(still); await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }); };

export default async function bringchar(browser, url) {
  await scenario('bringchar: a player brings a character, the DM admits one and declines one', async (run) => {
    const dmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const plCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      let code;

      await run.do('host a table, join from the phone, the DM lets the player in', async () => {
        await open(dm, url); await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url); await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
      });

      await run.do('the DM\'s setup has the rule (own-trusted) with its words, and no level range', async () => {
        await openMenu(dm, 'dm');
        await wait(dm, () => document.querySelector('#dm-characters')?.value === 'own-trusted');
        const t = await dm.textContent('#dm-characters-text');
        if (!/tick that you have looked at its history/.test(t)) throw new Error(`the rule's words: ${t}`);
        if (!/No level range/.test(await dm.textContent('#dm-level-set'))) throw new Error('setup does not say there is no range');
      });

      await run.do('the player sees Bring a character and builds one from My characters; it is sent as an offer and the menu says Waiting for the DM', async () => {
        await wait(pl, () => window.hextable.drawer.isOpen && window.hextable.drawer.arc);
        await waitShown(pl, '#pick-bring');
        if ((await pl.textContent('#bring-open')) !== 'Bring a character') throw new Error('no Bring a character');
        await pl.tap('#bring-open');
        await waitShown(pl, '#mychars'); await waitShown(pl, '#mc-bring-note');
        await pl.tap('#mc-new'); await waitShown(pl, '#qb');
        await pl.fill('#qb-name', 'Brought Bran'); await pl.selectOption('#qb-class', 'fighter'); await pl.selectOption('#qb-levelsel', '3');
        await fighterBasics(pl);
        await wait(pl, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0);
        await pl.tap('#qb-save');
        await waitShown(pl, '#bring-wait');
        const t = await pl.textContent('#bring-wait');
        if (!/Waiting for the DM/.test(t) || !/Brought Bran, level 3 Fighter\./.test(t)) throw new Error(`waiting says ${t}`);
        await shot(pl, 'bringchar-waiting-phone');
      });

      await run.do('the DM sees the offer: name, level and class, Read the sheet, no Admit until a range is set and the tick is made', async () => {
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm-table .offer');
        const row = await dm.textContent('#dm-table .offer .offer-head');
        if (!/Smoke Player offered Brought Bran, level 3 Fighter$/.test(row)) throw new Error(`the offer says ${row}`);
        await dm.click('#dm-table .offer summary');
        const sheet = await dm.textContent('#dm-table .offer-sheet dl');
        if (!/\d+ Hit Points/.test(sheet) || !/History/.test(sheet)) throw new Error(`the sheet reads ${sheet}`);
        if (!/Set a level range/.test(await dm.textContent('#dm-table .offer-held'))) throw new Error('the held message is not shown');
        if (!(await dm.isDisabled('#dm-table .offer [data-admit]'))) throw new Error('Admit is on with no range');
        await shot(dm, 'bringchar-dm-offer-wide');
      });

      await run.do('the DM sets the levels 1 to 5; Admit stays off until "I\'ve looked at its history" is ticked', async () => {
        await dm.selectOption('#dm-table .offer [data-end="max"]', '5');
        await dm.click('#dm-table .offer [data-set-level]');
        await wait(dm, () => window.hextable.state.settings.level?.max === 5);
        await wait(dm, () => !document.querySelector('#dm-table .offer-held'));
        if (!(await dm.isDisabled('#dm-table .offer [data-admit]'))) throw new Error('Admit is on without the tick');
        if (!(await dm.isChecked('#dm-table .offer [data-tick]').then((c) => !c))) throw new Error('the tick is already on');
        await dm.fill('#dm-table .offer [data-note]', 'welcome');
        await dm.check('#dm-table .offer [data-tick]');
        await wait(dm, () => !document.querySelector('#dm-table .offer [data-admit]').disabled);
        // an update of the table does not take the tick or the note away
        await dm.evaluate(() => window.hextable.act({ type: 'setClock', t: 2 })).catch(() => {});
        await sleep(500);
        if (!(await dm.isChecked('#dm-table .offer [data-tick]')) || (await dm.inputValue('#dm-table .offer [data-note]')) !== 'welcome') throw new Error('the tick or the note was lost on an update');
      });

      await run.do('Admit: the player controls the character, the DM\'s row goes, the player\'s section goes', async () => {
        await dm.click('#dm-table .offer [data-admit]');
        await wait(pl, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Brought Bran' && e.owner));
        await wait(dm, () => !document.querySelector('#dm-table .offer') && !document.querySelector('#dm-table .nochar'));
        await waitShown(pl, '#menu-pick', false);
        const lvl = await pl.evaluate(() => Object.values(window.hextable.state.entities).find((x) => x.name === 'Brought Bran').level);
        if (lvl !== 3) throw new Error(`level ${lvl}`);
        const n = await dm.evaluate(() => (window.hextable.state.offers ?? []).length);
        if (n) throw new Error('the offer is still held');
      });

      await run.do('a second offer, from My characters: the DM declines it with a note; the row goes and the player still sees Waiting', async () => {
        const id = await dm.evaluate(() => Object.values(window.hextable.state.entities).find((x) => x.name === 'Brought Bran').id);
        await dm.evaluate((i) => window.hextable.act({ type: 'release', entity: i }), id);
        await wait(pl, () => !Object.values(window.hextable.state.entities).some((e) => e.name === 'Brought Bran' && e.owner));
        await wait(pl, () => window.hextable.drawer.isOpen);
        await waitShown(pl, '#bring-open');
        await pl.tap('#bring-open'); await waitShown(pl, '#mc-list');
        await pl.tap('#mychars .mc-row button:has-text("Offer to the DM")');
        await waitShown(pl, '#bring-wait');
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm-table .offer');
        await dm.fill('#dm-table .offer [data-note]', 'not this one');
        await dm.click('#dm-table .offer [data-decline]');
        await wait(dm, () => !document.querySelector('#dm-table .offer'));
        if ((await dm.evaluate(() => (window.hextable.state.offers ?? []).length)) !== 0) throw new Error('the offer is still held');
        if (await dm.evaluate(() => Object.values(window.hextable.state.entities).some((e) => e.name === 'Brought Bran' && e.owner))) throw new Error('a declined character was seated');
        await sleep(500);
        await waitShown(pl, '#bring-wait');
      });

      await run.do('a third offer, from a Fantasy Grounds file: the player reads it, sees the review, saves and offers it; the DM sees the offer', async () => {
        await wait(pl, () => window.hextable.drawer.isOpen); await waitShown(pl, '#bring-again');
        await pl.tap('#bring-again'); await waitShown(pl, '#mc-list'); await waitShown(pl, '#mc-fg');
        const before = await pl.evaluate(() => JSON.parse(localStorage.getItem('hextable.characters')).length);
        const [chooser] = await Promise.all([pl.waitForEvent('filechooser'), pl.tap('#mc-fg')]);
        await chooser.setFiles(fileURLToPath(new URL('../../packages/rules/test/fixtures/fgxml-cleric.xml', import.meta.url)));
        await waitShown(pl, '#fgi-bring');
        await waitShown(pl, '#fgi-bring #fgi-summary');
        if (/Only the DM can import/.test(await pl.textContent('#fgi-bring'))) throw new Error('the DM-only note is shown to a player');
        if (!/offers it to the DM/.test(await pl.textContent('#fgi-bring #fgi-bring-note'))) throw new Error('the bring note is missing');
        if (!(await pl.textContent('#fgi-bring')).includes('Not on the sheet')) throw new Error('no review of what was not read');
        const noX = await pl.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        if (!noX) throw new Error('the review scrolls sideways on the phone');
        await shot(pl, 'bringchar-import-review-phone');
        await pl.tap('#fgi-bring #fgi-add');
        await waitShown(pl, '#bring-wait'); await waitShown(pl, '#fgi-bring', false);
        const kept = await pl.evaluate(() => JSON.parse(localStorage.getItem('hextable.characters')).map((f) => [f.sheet.name, f.born.how]));
        if (kept.length !== before + 1 || !kept.some(([, how]) => how === 'imported-fgxml')) throw new Error(`My characters holds ${JSON.stringify(kept)}`);
        await openMenu(dm, 'dm'); await waitShown(dm, '#dm-table .offer');
        const row = await dm.textContent('#dm-table .offer .offer-head');
        if (!/Smoke Player offered .+, level \d+ Cleric$/.test(row)) throw new Error(`the offer says ${row}`);
        await shot(dm, 'bringchar-dm-offer-import');
      });
    } finally { await dmCtx.close(); await plCtx.close(); }
  });
}
