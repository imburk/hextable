import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as lib from './lib.mjs';
import { sleep, scenario, wait, shown, waitShown, open, playSolo, closeMenu, openTab, openMenu } from './lib.mjs';

// ---------- the feedback button (docs/specs/feedback.md) ----------
// M3 took the floating icon off the clean screen: the button is the row "Help and feedback" of the menu's Table list (the menu folds away when it opens the panel); the panel opens, takes a comment, shows what will be sent
// (no player name, no table code), sends with Ctrl+Enter, and the server stored one line; at a table the report carries only a hash.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/feedback-${name}.png` }).catch(() => {}) : null);
const stored = () => { const f = join(lib.dataDir, 'feedback.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

// Open Table in the menu, press Help and feedback (the menu folds away), and wait for the panel.
const openFb = async (page) => { await openMenu(page, 'table'); await page.click('#fb-btn'); await waitShown(page, '#fb-panel'); await waitShown(page, '#drawer', false); };

async function soloPass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const phone = opts.viewport.width < 900;
    const ctx = await browser.newContext(opts);
    try {
      await ctx.grantPermissions?.([]).catch(() => {});
      const page = await ctx.newPage();
      run.watch(page);
      const posted = [];
      page.on('request', (r) => { if (r.method() === 'POST' && /\/feedback$/.test(r.url())) posted.push(r.postData()); });
      await run.do('the lobby has no floating icon; About opens the menu, and Setup beside it has Help and feedback', async () => {
        await open(page, url);
        await waitShown(page, '#splash', false, 3000);
        if (await shown(page, '#fb-btn')) throw new Error('an icon floats over the lobby');
        await page.click('#lobby-about'); await waitShown(page, '#drawer');
        await page.click('#tab-settings'); await waitShown(page, '#settings'); await page.locator('#fb-btn').scrollIntoViewIfNeeded(); await waitShown(page, '#fb-btn');
        await shot(page, `lobby-${phone ? 'phone' : 'wide'}`);
        await closeMenu(page);
      });
      await run.do('solo: nothing of feedback is on the clean screen; the row is in the menu, inside the drawer', async () => {
        await playSolo(page);
        await wait(page, () => window.hextable.timeline.busy() === false, null, 15000).catch(() => {});
        await waitShown(page, '#btn-menu');
        if (await shown(page, '#fb-btn')) throw new Error('the feedback button is on the clean screen');
        if (!(await page.evaluate(() => !!document.getElementById('fb-btn').closest('#settings #set-sec-help')))) throw new Error('the button is not in Setup, under Help and about');
        await shot(page, `solo-${phone ? 'phone' : 'wide'}`);
      });
      await run.do('About shows a build line a person can read aloud, and the feedback report carries the same build', async () => {
        await openTab(page, 'about');
        await waitShown(page, '#about');
        await wait(page, () => !!document.getElementById('ab-build'), null, 5000).catch(() => { throw new Error('About has no build line'); });
        const line = await page.textContent('#ab-build');
        if (!/^Build \d{1,2} \w{3} \d{4}, \d\d:\d\d/.test(line)) throw new Error(`the build line: ${line}`);
        const b = await page.evaluate(async () => (await fetch('./build.json')).json());
        if (!line.includes(b.commit)) throw new Error(`the line ${line} does not name commit ${b.commit}`);
        await closeMenu(page);
        await openFb(page);
        const r = JSON.parse(await page.textContent('#fb-preview'));
        if (!r.build.startsWith(b.commit)) throw new Error(`the report's build: ${r.build}`);
        await page.keyboard.press('Escape');
      });
      await run.do('it has a visible focus state and is reachable by keyboard', async () => {
        await openMenu(page, 'table');
        await page.keyboard.press('Shift');                 // a keyboard has been used: the focus ring is the keyboard's
        await page.focus('#fb-btn');
        const ring = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('fb-btn')); return `${s.outlineStyle} ${s.outlineWidth}`; });
        if (/^none/.test(ring) || /^auto 0px|^solid 0px/.test(ring)) throw new Error(`no focus ring: ${ring}`);
        if ((await page.getAttribute('#fb-btn', 'aria-label')) !== 'Send feedback') throw new Error('no accessible name');
        await closeMenu(page);
      });
      await run.do('it opens a panel with the comment, kinds, the tick and the disclosure; the preview holds the shown log and no name', async () => {
        await openFb(page);
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'fb-text') throw new Error('focus did not go to the text box');
        if ((await page.$$('#fb-kinds input')).length !== 3) throw new Error('kinds');
        if (!(await page.isChecked('#fb-inc'))) throw new Error('"Include what just happened" is not on by default');
        await page.click('#fb-see summary');
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
        if ((await page.evaluate(() => document.activeElement?.id)) !== 'btn-menu') throw new Error('focus did not return to the token (the menu row it came from had folded away)');
        await openFb(page);
        if ((await page.inputValue('#fb-text')) !== 'first line\nsecond line') throw new Error('the draft was lost');
      });
      await run.do('typing does not trigger game shortcuts (m opens the drawer)', async () => {
        await page.type('#fb-text', ' mmm');
        if (await shown(page, '#drawer')) throw new Error('a typed m opened the drawer');
      });
      await run.do('Ctrl+Enter sends it, the thank-you has a reference, and the server stored one line', async () => {
        const before = stored().length;
        await page.fill('#fb-text', 'The smoke test says hello');
        await page.click('#fb-see summary').catch(() => {});
        await page.focus('#fb-text');
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
        // What was sent is exactly what was shown: the thank-you's copy of the frozen report is the body of the POST, field by field.
        const shownReport = JSON.parse(await page.evaluate(() => document.getElementById('fb-sent-pre').textContent));
        if (JSON.stringify(shownReport) !== JSON.stringify(l.report)) throw new Error(`the POST differs from what was shown: ${JSON.stringify(shownReport).slice(0, 200)} vs ${JSON.stringify(l.report).slice(0, 200)}`);
        if (posted.length !== 1 || JSON.stringify(JSON.parse(posted[0])) !== JSON.stringify(shownReport)) throw new Error('the request body is not the shown report');
        await page.click('#fb-done-close'); await waitShown(page, '#fb-panel', false);
        if ((await page.inputValue('#fb-text')) !== '') throw new Error('the draft was kept after sending');
      });
      await run.do('what was sent holds the actions this page sent and no page errors', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'endTurn', actor: 'nobody' }));      // an action the engine refuses
        await sleep(200);
        await openFb(page);
        const r = JSON.parse(await page.textContent('#fb-preview'));
        const a = r.context.actions.at(-1);
        if (!a || a.type !== 'endTurn' || !/^refused: /.test(a.answer)) throw new Error(`the action and its answer: ${JSON.stringify(r.context.actions)}`);
        if (r.context.errors.length) throw new Error(`page errors: ${JSON.stringify(r.context.errors)}`);
        await page.keyboard.press('Escape');
      });
      await run.do('while a reaction question is up the panel is hidden, and it comes back after', async () => {
        await openFb(page);
        await page.evaluate(() => { const m = document.getElementById('rp'); m.hidden = false; });
        if (await shown(page, '#fb-panel')) throw new Error('the panel is over the reaction question');
        await page.evaluate(() => { document.getElementById('rp').hidden = true; });
        await waitShown(page, '#fb-panel');
        await page.keyboard.press('Escape');
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
        if (await shown(page, '#fb-btn')) throw new Error('the feedback button is on the clean screen at a table');
        await shot(page, 'table-phone');
      });
      await run.do('the DM claims a character: the "now plays" line does not carry the moniker into a report', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'claim', entity: 'fighter', user: 'u-other', userName: 'Other-Moniker' }));
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.ownerName === 'Other-Moniker'));
        await sleep(300);
        await openFb(page);
        await page.fill('#fb-text', 'Claimed');
        await page.click('#fb-see summary');
        await sleep(300);
        const txt = await page.textContent('#fb-preview');
        if (/Smoke Hostname|Other-Moniker/i.test(txt)) throw new Error('a moniker is in the preview');
        await page.keyboard.press('Escape');
      });
      await run.do('the preview has no table code, hash or name; Send stores a table report', async () => {
        await openFb(page);
        await page.fill('#fb-text', 'Table report');
        await page.click('#fb-see summary');
        const txt = await page.textContent('#fb-preview');
        if (txt.includes(code)) throw new Error('the table code is in the preview');
        if (/Smoke Hostname/i.test(txt)) throw new Error('the player name is in the preview');
        const r = JSON.parse(txt);
        if (r.mode !== 'table' || 'table' in r) throw new Error(`table facts: ${r.mode} ${r.table}`);
        await shot(page, 'table-panel-phone');
        await page.click('#fb-send'); await waitShown(page, '#fb-done');
        const l = stored().at(-1);
        if (l.report.comment !== 'Table report' || l.report.mode !== 'table') throw new Error('stored line');
        const line = JSON.stringify(l);
        if (line.includes(code) || /Smoke Hostname/i.test(line)) throw new Error('the stored line holds the code or the name');
        await page.click('#fb-done-close');
      });
      await run.do('on the desktop the row is in the menu at a table too, and nothing floats', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Other DM'); await host.click('#lobby-host');
        await wait(host, () => window.hextable?.state?.entities);
        if (await shown(host, '#fb-btn')) throw new Error('the feedback button is on the clean screen');
        await openMenu(host, 'table'); await waitShown(host, '#fb-btn'); await closeMenu(host);
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
