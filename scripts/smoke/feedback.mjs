import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as lib from './lib.mjs';
import { sleep, scenario, wait, shown, waitShown, open, playSolo, closeMenu, openTab } from './lib.mjs';

// ---------- the feedback button (docs/specs/feedback.md) ----------
// The icon is on every view and clear of the controls at both sizes; the panel opens, takes a comment, shows what will be sent
// (no player name, no table code), sends with Ctrl+Enter, and the server stored one line; at a table the report carries only a hash.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/feedback-${name}.png` }).catch(() => {}) : null);
const stored = () => { const f = join(lib.dataDir, 'feedback.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

// Rectangles of what the icon must keep clear of, those that are on screen.
const CLEAR = ['#top', '#order', '#hint', '#cam', '#dock', '#drawer.open', '#dice-tray', '#toast', '#rp', '#lobby-card button', '#lobby-card input', '#lobby-card summary', '#lobby-card select'];
async function overlaps(page) {
  return page.evaluate((sels) => {
    const b = document.getElementById('fb-btn').getBoundingClientRect(), hit = [];
    if (b.width === 0) return ['the button is not on screen'];
    if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) hit.push('outside the screen');
    for (const s of sels) for (const e of document.querySelectorAll(s)) {
      if (e.hidden || !e.getClientRects().length || (e.checkVisibility && !e.checkVisibility())) continue;
      const r = e.getBoundingClientRect();
      // #top and #dock span the width but are click-through except for their children, so test the children
      const parts = s === '#top' || s === '#dock' || s === '#order' ? [...e.querySelectorAll('button, #status, li, #card, #party')].map((x) => x.getBoundingClientRect()) : [r];
      for (const q of parts) if (q.width && q.height && b.left < q.right && b.right > q.left && b.top < q.bottom && b.bottom > q.top) hit.push(`${s} ${Math.round(q.left)},${Math.round(q.top)} ${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    return hit;
  }, CLEAR);
}

async function soloPass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const phone = opts.viewport.width < 900;
    const ctx = await browser.newContext(opts);
    try {
      await ctx.grantPermissions?.([]).catch(() => {});
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('the lobby has the icon, clear of the lobby card', async () => {
        await open(page, url);
        await waitShown(page, '#splash', false, 3000);
        await waitShown(page, '#fb-btn');
        await shot(page, `lobby-${phone ? 'phone' : 'wide'}`);
        const hit = await overlaps(page);
        if (hit.length) throw new Error(`the icon is over: ${hit.join('; ')}`);
      });
      await run.do('solo: the icon is clear of the action panel, drawer, tracker and dice', async () => {
        await playSolo(page);
        await wait(page, () => window.hextable.timeline.busy() === false, null, 15000).catch(() => {});
        await waitShown(page, '#btn-menu');
        const hit = await overlaps(page);
        if (hit.length) throw new Error(`the icon is over: ${hit.join('; ')}`);
        await shot(page, `solo-${phone ? 'phone' : 'wide'}`);
      });
      await run.do('it has a visible focus state and is reachable by keyboard', async () => {
        await page.focus('#fb-btn');
        const ring = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('fb-btn')); return `${s.outlineStyle} ${s.outlineWidth}`; });
        if (/^none/.test(ring) || /^auto 0px|^solid 0px/.test(ring)) throw new Error(`no focus ring: ${ring}`);
        if ((await page.getAttribute('#fb-btn', 'aria-label')) !== 'Send feedback') throw new Error('no accessible name');
      });
      await run.do('it opens a panel with the comment, kinds, the tick and the disclosure; the preview holds the shown log and no name', async () => {
        await page.click('#fb-btn'); await waitShown(page, '#fb-panel');
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'fb-text') throw new Error('focus did not go to the text box');
        if ((await page.$$('#fb-kinds input')).length !== 3) throw new Error('kinds');
        if (!(await page.isChecked('#fb-inc'))) throw new Error('"Include what just happened" is not on by default');
        await page.click('#fb-see summary');
        const hit = await overlaps(page);                      // the panel may cover the map, but not hide the button's own place
        await shot(page, `panel-${phone ? 'phone' : 'wide'}`);
        const txt = await page.textContent('#fb-preview');
        const r = JSON.parse(txt);
        if (r.mode !== 'solo' || r.role !== 'dm' || r.table !== undefined) throw new Error(`facts: ${txt.slice(0, 300)}`);
        if (r.viewport.w !== opts.viewport.width) throw new Error('viewport');
        if (r.touch !== !!opts.hasTouch) throw new Error(`touch ${r.touch}`);
        if (!r.context || !Array.isArray(r.context.log) || r.context.character === undefined) throw new Error('no context');
        await page.uncheck('#fb-inc');
        await wait(page, () => !JSON.parse(document.getElementById('fb-preview').textContent).context);
        await page.check('#fb-inc');
      });
      await run.do('Enter makes a new line; the draft survives closing the panel; Escape closes and returns focus', async () => {
        await page.fill('#fb-text', '');
        await page.type('#fb-text', 'first line');
        await page.keyboard.press('Enter');
        await page.type('#fb-text', 'second line');
        if ((await page.inputValue('#fb-text')) !== 'first line\nsecond line') throw new Error('Enter did not make a new line');
        if ((await page.$$('#fb-done:not([hidden])')).length) throw new Error('Enter sent it');
        await page.keyboard.press('Escape'); await waitShown(page, '#fb-panel', false);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'fb-btn') throw new Error('focus did not return');
        await page.click('#fb-btn'); await waitShown(page, '#fb-panel');
        if ((await page.inputValue('#fb-text')) !== 'first line\nsecond line') throw new Error('the draft was lost');
      });
      await run.do('typing does not trigger game shortcuts (m opens the drawer)', async () => {
        await page.type('#fb-text', ' mmm');
        if (await shown(page, '#drawer')) throw new Error('a typed m opened the drawer');
      });
      await run.do('Ctrl+Enter sends it, the thank-you has a reference, and the server stored one line', async () => {
        const before = stored().length;
        await page.fill('#fb-text', 'The smoke test says hello');
        await page.keyboard.press('Control+Enter');
        await waitShown(page, '#fb-done');
        const thanks = await page.textContent('#fb-thanks');
        const ref = /FB-[0-9A-F]{6}/.exec(thanks)?.[0];
        if (!ref) throw new Error(`no reference: ${thanks}`);
        const now = stored();
        if (now.length !== before + 1) throw new Error(`${now.length - before} lines stored`);
        const l = now.at(-1);
        if (l.ref !== ref || l.report.comment !== 'The smoke test says hello' || l.report.mode !== 'solo') throw new Error(`the stored line: ${JSON.stringify(l).slice(0, 200)}`);
        await shot(page, `thanks-${phone ? 'phone' : 'wide'}`);
        await page.click('#fb-done-close'); await waitShown(page, '#fb-panel', false);
        if ((await page.inputValue('#fb-text')) !== '') throw new Error('the draft was kept after sending');
      });
      await run.do('what was sent holds the actions this page sent and no page errors', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'endTurn', actor: 'nobody' }));      // an action the engine refuses
        await sleep(200);
        await page.click('#fb-btn'); await waitShown(page, '#fb-panel');
        const r = JSON.parse(await page.textContent('#fb-preview'));
        const a = r.context.actions.at(-1);
        if (!a || a.type !== 'endTurn' || !/^refused: /.test(a.answer)) throw new Error(`the action and its answer: ${JSON.stringify(r.context.actions)}`);
        if (r.context.errors.length) throw new Error(`page errors: ${JSON.stringify(r.context.errors)}`);
        await page.keyboard.press('Escape');
      });
      await run.do('while a reaction question is up the icon is hidden', async () => {
        await page.evaluate(() => { const m = document.getElementById('rp'); m.hidden = false; });
        if (await shown(page, '#fb-btn')) throw new Error('the icon is over the reaction question');
        await page.evaluate(() => { document.getElementById('rp').hidden = true; });
        await waitShown(page, '#fb-btn');
      });
    } finally { await ctx.close(); }
  });
}

async function tablePass(browser, url) {
  await scenario('feedback at a table: the report holds a hash and no code, no name', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await ctx.newPage(), host = await wide.newPage();
      run.watch(page); run.watch(host);
      let code;
      await run.do('host a table (named Smoke Hostname) on the phone', async () => {
        await open(page, url);
        await page.fill('#lobby-name', 'Smoke Hostname');
        await page.click('#lobby-host');
        await wait(page, () => window.hextable?.state?.entities);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        await wait(page, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await page.evaluate(() => document.querySelector('#dm-table code').textContent);
        await closeMenu(page);
        await waitShown(page, '#fb-btn');
        const hit = await overlaps(page);
        if (hit.length) throw new Error(`the icon is over: ${hit.join('; ')}`);
        await shot(page, 'table-phone');
      });
      await run.do('the preview has a table hash and neither the code nor the name; Send stores a table report', async () => {
        await page.click('#fb-btn'); await waitShown(page, '#fb-panel');
        await page.fill('#fb-text', 'Table report');
        await page.click('#fb-see summary');
        await wait(page, () => { try { return !!JSON.parse(document.getElementById('fb-preview').textContent).table; } catch { return false; } });
        const txt = await page.textContent('#fb-preview');
        if (txt.includes(code)) throw new Error('the table code is in the preview');
        if (/Smoke Hostname/i.test(txt)) throw new Error('the player name is in the preview');
        const r = JSON.parse(txt);
        if (r.mode !== 'table' || !/^[0-9a-f]{12}$/.test(r.table)) throw new Error(`table facts: ${r.mode} ${r.table}`);
        await shot(page, 'table-panel-phone');
        await page.click('#fb-send'); await waitShown(page, '#fb-done');
        const l = stored().at(-1);
        if (l.report.comment !== 'Table report' || l.report.mode !== 'table') throw new Error('stored line');
        const line = JSON.stringify(l);
        if (line.includes(code) || /Smoke Hostname/i.test(line)) throw new Error('the stored line holds the code or the name');
        await page.click('#fb-done-close');
      });
      await run.do('on the desktop the icon is clear at a table too', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Other DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        await waitShown(host, '#fb-btn');
        const hit = await overlaps(host);
        if (hit.length) throw new Error(`the icon is over: ${hit.join('; ')}`);
        await shot(host, 'table-wide');
      });
    } finally { await ctx.close(); await wide.close(); }
  });
}

export default async function (browser, url) {
  await soloPass(browser, url, 'feedback: solo on a desktop', { viewport: { width: 1280, height: 800 } });
  await soloPass(browser, url, 'feedback: solo on a phone, with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await tablePass(browser, url);
}
