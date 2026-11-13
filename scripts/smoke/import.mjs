import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario, wait, state, shown, waitShown, open, playSolo, closePanels, openTab } from './lib.mjs';

// ---------- import from Fantasy Grounds ----------
// The DM picks a synthetic export (packages/rules/test/fixtures). The report is shown before anything changes; errors are
// shown plainly; a refused sheet shows the engine's words; on confirm the character joins and the report goes to the chronicle.
async function importFg(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    const tmp = mkdtempSync(join(tmpdir(), 'hextable-fgi-'));
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const fixture = (n) => fileURLToPath(new URL(`../packages/rules/test/fixtures/${n}`, import.meta.url));
      const count = () => state(page, (S) => Object.keys(S.entities).length);
      const pickFile = async (path) => {
        await page.evaluate(() => { document.querySelector('#fgi-file').value = ''; });      // what the button does before it opens the picker
        await page.setInputFiles('#fgi-file', path);
        await waitShown(page, '#fgi');
      };
      const openDM = async () => {
        await closePanels(page);
        if (!(await shown(page, '#dm'))) await openTab(page, 'dm');
        await waitShown(page, '#dm');
      };
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${n}-${touch ? 'phone' : 'desktop'}.png` }); };
      let before;

      await run.do('the DM panel offers the import and the file picker is wired', async () => {
        await open(page, url); await playSolo(page);
        await openDM();
        await waitShown(page, '#dm-qe .fgi-open');
        before = await count();
      });

      await run.do('a file that is not XML is refused plainly', async () => {
        const bad = join(tmp, 'notes.xml'); writeFileSync(bad, 'this is not a character, just words');
        await pickFile(bad);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/not readable XML|does not look like/i.test(t)) throw new Error(`error text: ${t}`);
        if (await count() !== before) throw new Error('the table changed');
      });

      await run.do('XML that is not a Fantasy Grounds character is refused plainly', async () => {
        const bad = join(tmp, 'other.xml'); writeFileSync(bad, '<?xml version="1.0"?><root><thing/></root>');
        await pickFile(bad);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/Fantasy Grounds/i.test(t)) throw new Error(`error text: ${t}`);
      });

      await run.do('a file that is too large is refused plainly', async () => {
        const big = join(tmp, 'big.xml'); writeFileSync(big, Buffer.alloc(6_500_000, 'a'));
        await pickFile(big);
        const t = await page.$eval('#fgi-error', (e) => e.textContent);
        if (!/too large/i.test(t)) throw new Error(`error text: ${t}`);
        await page.click('#fgi-close'); await waitShown(page, '#fgi', false);
      });

      await run.do('a real export shows its report before anything changes', async () => {
        await pickFile(fixture('fgxml-cleric.xml'));
        await waitShown(page, '#fgi-summary');
        const txt = await page.$eval('#fgi', (e) => e.innerText);
        for (const want of ['Mira Testwell', 'Divine Order', 'Sparkly Footwork', 'Destroy Undead', 'Fireball', 'Ring of Invented Warding', 'Nothing has been changed yet']) if (!txt.includes(want)) throw new Error(`the report does not show ${want}`);
        if (/\[Zed\]|Zed/.test(txt)) throw new Error("the player's name was shown");
        if (await count() !== before) throw new Error('the table changed before the DM confirmed');
        const m = await page.$eval('#fgi', (e) => ({ w: e.getBoundingClientRect().right, iw: innerWidth, sh: e.scrollHeight, ch: e.clientHeight, sx: e.scrollWidth, cx: e.clientWidth }));
        if (m.w > m.iw + 1 || m.sx > m.cx + 1) throw new Error(`the panel overflows sideways: ${JSON.stringify(m)}`);
        if (!(await page.$eval('#fgi', (e) => getComputedStyle(e).overflowY === 'auto'))) throw new Error('the panel does not scroll');
        const foot = await page.$eval('#fgi-add', (b) => { const r = b.getBoundingClientRect(); return [r.bottom, innerHeight, r.height]; });
        if (foot[0] > foot[1] || foot[2] < 40) throw new Error(`the confirm button is not reachable: ${JSON.stringify(foot)}`);
        await shot('import-report');
        await page.evaluate(() => document.querySelector('#fgi').scrollTo(0, 99999)); await shot('import-report-end');
      });

      await run.do('the engine refuses a replace: its words are shown and nothing is lost', async () => {
        // Select a character, open the import, then lose that character before confirming.
        await page.click('#fgi-close');
        await closePanels(page);
        const target = await page.evaluate(() => { const h = window.hextable, e = Object.values(h.state.entities).find((x) => x.kind === 'pc' && x.abil); h.select(e.id); return e.id; });
        await openDM(); await pickFile(fixture('fgxml-cleric.xml'));
        await waitShown(page, '#fgi-replace');
        await page.evaluate((id) => window.hextable.act({ type: 'remove', actor: id }), target);
        await wait(page, (id) => !window.hextable.state.entities[id], target);
        before = await count();
        if (!(await shown(page, '#fgi'))) await pickFile(fixture('fgxml-cleric.xml'));
        await (touch ? page.locator('#fgi-replace').tap() : page.click('#fgi-replace'));
        await waitShown(page, '#fgi-refused');
        const t = await page.$eval('#fgi-refused', (e) => e.textContent);
        if (t.length < 5) throw new Error('no refusal text');
        if (await count() !== before) throw new Error('a refused import changed the table');
        if (!(await shown(page, '#fgi-add:not([disabled])'))) throw new Error('the DM cannot try again');
      });

      await run.do('confirming adds the character and keeps the report in the chronicle', async () => {
        await (touch ? page.locator('#fgi-add').tap() : page.click('#fgi-add'));
        await waitShown(page, '#fgi', false);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Mira Testwell' && e.sheet?.class === 'cleric'));
        await wait(page, () => window.hextable.state.timeline.some((e) => e.type === 'chronicle' && /Mira Testwell/.test(e.title) && /Divine Order/.test(e.text) && !e.public));
        const sheet = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Mira Testwell').sheet);
        if (sheet.subclass !== 'life' || sheet.level !== 5) throw new Error(`sheet: ${JSON.stringify(sheet).slice(0, 200)}`);
      });
    } finally { await ctx.close(); rmSync(tmp, { recursive: true, force: true }); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=import.
export default async function (browser, url) {
  await importFg(browser, url, 'import from Fantasy Grounds at 1280x800', { viewport: { width: 1280, height: 800 } });
  await importFg(browser, url, 'import from Fantasy Grounds at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
