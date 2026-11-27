import { sleep, scenario, waitShown, open, playSolo, closePanels, openTab } from './lib.mjs';

// #738: while the map editor is open its bar stands clear of the token and its undo and redo arrows. Every control of the bar, at its centre, is
// what a tap there reaches (elementFromPoint), not the token, a chip or anything else.
const SIZES = [['1280x800', { viewport: { width: 1280, height: 800 } }], ['390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['2560x1440', { viewport: { width: 2560, height: 1440 } }]];

export default async function editorbar(browser, url) {
  for (const [name, opts] of SIZES) {
    await scenario(`editor bar clear of the token at ${name}`, async (run) => {
      const ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => { try { if (localStorage.getItem('hextable.seen.ring') === null) localStorage.setItem('hextable.seen.ring', 'true'); } catch { /* storage unavailable */ } });
      const page = await ctx.newPage();
      run.watch(page);
      try {
        await run.do('open the editor', async () => {
          await open(page, url); await playSolo(page); await closePanels(page);
          await openTab(page, 'dm'); await waitShown(page, '#dm');
          await page.click('#dm-edit'); await waitShown(page, '#editor');
          await sleep(500);
        });
        await run.do('every visible control of the bar is on top at its centre, and the token and chips are not over the bar', async () => {
          const bad = await page.evaluate(() => {
            const ed = document.getElementById('editor'), out = [], eb = ed.getBoundingClientRect();
            for (const el of ed.querySelectorAll('button, select, input')) {
              const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[hidden]')) continue;
              if (r.bottom <= eb.top || r.top >= eb.bottom || r.right <= eb.left || r.left >= eb.right) continue;       // scrolled out of the bar
              const x = r.left + r.width / 2, y = Math.min(Math.max(r.top + r.height / 2, eb.top + 1), eb.bottom - 1);
              if (y < r.top || y > r.bottom) continue;
              const top = document.elementFromPoint(x, y);
              if (top !== el && !el.contains(top) && !(top && top.closest('label') === el.closest('label') && top.closest('label'))) out.push(`${el.id || el.textContent.trim().slice(0, 20)} under ${top?.id || top?.tagName}`);
            }
            const over = (id) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left < eb.right && r.right > eb.left && r.top < eb.bottom && r.bottom > eb.top; };
            for (const id of ['btn-menu', 'chips']) if (over(id)) out.push(`${id} overlaps the bar`);
            return out;
          });
          if (bad.length) throw new Error(bad.join('; '));
        });
      } finally { await ctx.close(); }
    });
  }
}
