import { sleep, scenario, wait, state, shown, waitShown, open, openTab, playSolo, openSec, fighterBasics } from './lib.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { validate } from '../../packages/rules/src/derive.js';
import { rollScores } from '../../packages/rules/src/scores.js';
import { keyedRng } from '../../packages/rules/src/rng.js';
import { CONTENT } from '../../packages/rules/src/content/index.js';

// ---------- My characters and the lobby's party step (docs/specs/portable-characters.md, "Build note: My characters", issue #308) ----------
// At 1280x800 and at 390x844 with touch, on hexes and on squares, from the lobby: the party step offers 1 to 6 places, each a starter or one of
// My characters or "Create new..."; Create new opens the build screen above the lobby and returns with the character saved and chosen; a new
// solo game has exactly that party; Continue and New game still work; My characters renames, duplicates, exports, imports and deletes (two taps);
// a file that fails says why and changes nothing; a browser whose storage throws still plays. SMOKE_SHOTS=<dir> saves screenshots.

const KEY = 'hextable.characters';
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), KEY);
const inView = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }, sel);
const noSideways = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e.scrollWidth <= e.clientWidth + 1; }, sel);
const topAt = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 5, r.top + 40)); return !!t && !!t.closest(s); }, sel);
const pcs = (page) => state(page, (S) => Object.values(S.entities).filter((e) => e.kind === 'pc').map((e) => ({ id: e.id, name: e.name, level: e.level, sheet: !!e.sheet, pos: `${e.pos.q},${e.pos.r}` })));

// Build a level `level` fighter in the open build screen and save it.
async function buildFighter(page, name, level) {
  await waitShown(page, '#qb');
  await page.fill('#qb-name', name);
  await page.selectOption('#qb-class', 'fighter');
  await page.selectOption('#qb-levelsel', String(level));
  await fighterBasics(page);
  await wait(page, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0);
  await page.click('#qb-save');
}

async function pass(browser, url, label, opts, grid) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'wide'}`;
    const dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n, pg = page) => (dir ? pg.screenshot({ path: `${dir}/mychars-${n}-${tag}.png` }).catch(() => {}) : null);
      const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));

      await run.do('the lobby has a party step: four starters by default, 1 to 6 places', async () => {
        await open(page, url, { grid });
        if (!/Solo party \(4\)/.test(await text(page, '#lobby-party-sum'))) throw new Error(`summary says ${await text(page, '#lobby-party-sum')}`);
        await tap('#lobby-party > summary'); await waitShown(page, '#lobby-slots');
        const counts = await page.$$eval('#lobby-party-count option', (o) => o.map((x) => x.value).join());
        if (counts !== '1,2,3,4,5,6') throw new Error(`counts ${counts}`);
        const picks = await page.$$eval('#lobby-slots select', (s) => s.map((x) => x.value).join());
        if (picks !== 'starter:fighter,starter:rogue,starter:cleric,starter:wizard') throw new Error(`picks ${picks}`);
        if (!(await noSideways(page, '#lobby-card'))) throw new Error('the lobby card scrolls sideways');
        await shot('1-party');
      });

      await run.do('a fifth place has no starter left and says so; a starter in use is not offered twice', async () => {
        await page.selectOption('#lobby-party-count', '5');
        const msg = await text(page, '#lobby-party-msg');
        if (!/Character 5/.test(msg)) throw new Error(`no reason shown: "${msg}"`);
        const off = await page.$eval('#lobby-slot-4 option[value="starter:fighter"]', (o) => [o.disabled, o.textContent]);
        if (!off[0] || !/already in the party/.test(off[1])) throw new Error(`starter offered twice: ${off}`);
        const full = await page.$eval('#lobby-slot-0 option[value="__new"]', (o) => o.disabled);
        if (full) throw new Error('Create new is off with room to spare');
        // Solo cannot start with a place empty.
        await tap('#lobby-solo');
        await wait(page, () => /not ready/.test(document.getElementById('lobby-msg').textContent));
        if (!(await shown(page, '#lobby'))) throw new Error('the game started with an empty place');
      });

      await run.do('a new Druid or Cleric starts with no spell chosen: Prepared 0 of 4, only the always-prepared spell ticked and greyed, Save says what is missing (#637)', async () => {
        await page.selectOption('#lobby-slot-4', '__new'); await waitShown(page, '#qb');
        for (const [cls, always] of [['druid', ['speak-with-animals']], ['cleric', []]]) {
          await page.selectOption('#qb-class', cls);
          await wait(page, () => document.querySelector('#qb-spell-counts'));
          const got = await page.evaluate(() => ({ counts: document.querySelector('#qb-spell-counts').textContent,
            ticked: [...document.querySelectorAll('#qb input[id^="qb-spell-"]:checked')].map((i) => ({ id: i.id.slice(9), off: i.disabled, label: i.parentElement.textContent })),
            problems: [...document.querySelectorAll('#qb-problems li')].map((l) => l.textContent), saveOff: document.querySelector('#qb-save').disabled }));
          if (!/Prepared spells 0 of 4/.test(got.counts)) throw new Error(`${cls}: counts say "${got.counts}"`);
          if (got.ticked.map((t) => t.id).join() !== always.join()) throw new Error(`${cls}: ticked ${got.ticked.map((t) => t.id)}, want ${always}`);
          if (got.ticked.some((t) => !t.off || !/always prepared/.test(t.label))) throw new Error(`${cls}: a ticked spell is not the greyed always-prepared one: ${JSON.stringify(got.ticked)}`);
          if (!got.saveOff || !got.problems.some((x) => /chooses 2 skills/.test(x))) throw new Error(`${cls}: Save does not say what is missing: ${got.problems}`);
        }
        await tap('#qb-startover'); await tap('#qb-startover');         // the draft is not kept for the next step
        await tap('#qb-close'); await waitShown(page, '#qb', false);
      });

      await run.do('Create new opens the build screen above the lobby; Save returns to the lobby with the character saved and chosen', async () => {
        await page.selectOption('#lobby-slot-4', '__new');
        await waitShown(page, '#qb');
        if (!(await topAt(page, '#qb'))) throw new Error('the build screen is under the lobby');
        if (!/Save to My characters/.test(await text(page, '#qb-save'))) throw new Error(`button says ${await text(page, '#qb-save')}`);
        await shot('2-build');
        await buildFighter(page, 'Tessa Vale', 3);
        await waitShown(page, '#qb', false);
        if ((await page.inputValue('#lobby-slot-4')).slice(0, 5) !== 'mine:') throw new Error(`slot 5 holds ${await page.inputValue('#lobby-slot-4')}`);
        if (!/Tessa Vale/.test(await text(page, '#lobby-party-sum'))) throw new Error(`summary: ${await text(page, '#lobby-party-sum')}`);
        const s = await stored(page);
        if (s.length !== 1 || s[0].sheet.name !== 'Tessa Vale' || s[0].born.level !== 3 || s[0].born.by !== 'self' || s[0].format !== 'hextable-character') throw new Error(`stored ${JSON.stringify(s).slice(0, 200)}`);
        if (!(await shown(page, '#lobby'))) throw new Error('the lobby is gone');
        if (await shown(page, '#lobby-party-msg')) throw new Error(`still complaining: ${await text(page, '#lobby-party-msg')}`);
      });

      await run.do('a new solo game has that party: the four starters and the new character, each on its own place, sheet kept', async () => {
        await tap('#lobby-solo');
        await wait(page, () => window.hextable?.state?.entities);
        const p = await pcs(page);
        if (p.map((x) => x.name).join() !== 'Brenna,Pip,Odessa,Tavin,Tessa Vale') throw new Error(`party ${p.map((x) => x.name)}`);
        if (new Set(p.map((x) => x.pos)).size !== 5) throw new Error('two heroes share a place');
        const t = p[4]; if (t.level !== 3 || !t.sheet) throw new Error(`Tessa: ${JSON.stringify(t)}`);
        const g = await state(page, (S) => S.map.grid ?? 'hex');
        if (g !== grid) throw new Error(`the valley is on ${g}`);
        await shot('3-game');
      });

      await run.do('Continue keeps that game; New game (two taps) starts another with the remembered party', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'chronicle', title: 'Smoke mark' }));        // a game is kept once it has had an action
        await wait(page, () => localStorage.getItem('hextable.solo'));
        await page.reload(); await waitShown(page, '#lobby');
        if (!/continue/i.test(await text(page, '#lobby-solo'))) throw new Error(`solo button says ${await text(page, '#lobby-solo')}`);
        await tap('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities);
        if ((await pcs(page)).length !== 5) throw new Error('Continue lost the party');
        await page.reload(); await waitShown(page, '#lobby');
        await tap('#lobby-new');
        if (!(await shown(page, '#lobby')) || /again/i.test(await text(page, '#lobby-solo'))) throw new Error('one tap started a game');
        await tap('#lobby-new');
        await wait(page, () => window.hextable?.state?.entities && Object.values(window.hextable.state.entities).filter((e) => e.kind === 'pc').length === 5);
        if (!(await pcs(page)).some((x) => x.name === 'Tessa Vale')) throw new Error('the remembered party was not used');
      });

      await run.do('the menu\'s New game in a running game also starts with the chosen party', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'chronicle', title: 'Second mark' }));
        await wait(page, () => JSON.stringify(window.hextable.state).includes('Second mark'));
        await page.click('#btn-menu'); await waitShown(page, '#menu-new');
        await tap('#menu-new'); await tap('#menu-new');
        await wait(page, () => !JSON.stringify(window.hextable.state).includes('Second mark'));
        if (!(await pcs(page)).some((x) => x.name === 'Tessa Vale') || (await pcs(page)).length !== 5) throw new Error('the party was lost');
      });

      await run.do('My characters: the list, the note about clearing site data, and a panel that fits the screen', async () => {
        await page.reload(); await waitShown(page, '#lobby');
        await tap('#lobby-party > summary').catch(() => {});
        if (!(await shown(page, '#lobby-mychars'))) await tap('#lobby-party > summary');
        await tap('#lobby-mychars'); await waitShown(page, '#mychars');
        if (!/Clearing the browser's site data deletes them/.test(await page.$eval('#mychars', (e) => e.textContent))) throw new Error('no note about site data');
        if ((await page.$$('#mc-list .mc-row')).length !== 1) throw new Error('the list is not one long');
        if (!(await topAt(page, '#mychars'))) throw new Error('the panel is under the lobby');
        if (!(await inView(page, '#mychars')) || !(await noSideways(page, '#mychars'))) throw new Error('the panel does not fit');
        const small = await page.$$eval('#mychars button', (b) => b.filter((x) => x.getClientRects().length && x.getBoundingClientRect().height < 40).map((x) => x.textContent));
        if (small.length) throw new Error(`small buttons: ${small}`);
        const lv = await text(page, '.mc-row small'); if (!/Fighter 3, created at level 3/.test(lv)) throw new Error(`level line: ${lv}`);
        await shot('4-list');
      });

      await run.do('Rename and Edit keep a record of which fields changed, never their values', async () => {
        await tap('.mc-row [id^="mc-rename-"]');
        await page.fill('.mc-rename input', 'Tessa Vale the Bold'); await page.keyboard.press('Enter');
        await wait(page, () => /the Bold/.test(document.querySelector('.mc-row strong')?.textContent ?? ''));
        await tap('.mc-row [id^="mc-edit-"]'); await waitShown(page, '#qb');
        if (!(await topAt(page, '#qb'))) throw new Error('the build screen is under the panels');
        await openSec(page, 'skills'); await page.uncheck('#qb-skill-perception'); await page.check('#qb-skill-survival');
        await wait(page, () => !document.querySelector('#qb-save').disabled);
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const f = (await stored(page))[0];
        const fields = f.edits.map((e) => e.fields.join('+')).join();
        if (fields !== 'name,skills') throw new Error(`edits: ${JSON.stringify(f.edits)}`);
        if (JSON.stringify(f.edits).includes('survival') || JSON.stringify(f.edits).includes('Bold')) throw new Error('an edit holds a value');
        if (!f.edits.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.at))) throw new Error('an edit has no date');
        if (f.born.level !== 3) throw new Error('born changed');
      });

      let exported = null;
      await run.do('Duplicate makes a different character; Export gives a character file', async () => {
        await tap('.mc-row [id^="mc-dup-"]');
        await wait(page, () => document.querySelectorAll('#mc-list .mc-row').length === 2);
        const s = await stored(page); if (s[0].cid === s[1].cid || !/\(copy\)$/.test(s[1].sheet.name) || s[1].edits.length) throw new Error(`copy: ${JSON.stringify(s[1]).slice(0, 160)}`);
        const [dl] = await Promise.all([page.waitForEvent('download'), tap('.mc-row:first-child [id^="mc-export-"]')]);
        if (!/\.hextable-character\.json$/.test(dl.suggestedFilename())) throw new Error(`file name ${dl.suggestedFilename()}`);
        exported = readFileSync(await dl.path(), 'utf8');
        const o = JSON.parse(exported);
        if (o.format !== 'hextable-character' || o.v !== 1 || o.cid !== s[0].cid || o.born.level !== 3 || o.sheet.name !== 'Tessa Vale the Bold') throw new Error(`file ${exported.slice(0, 200)}`);
      });

      await run.do('Delete takes two taps', async () => {
        await tap('.mc-row:last-child [id^="mc-del-"]');
        if ((await page.$$('#mc-list .mc-row')).length !== 2) throw new Error('one tap deleted');
        await tap('.mc-row:last-child [id^="mc-del-"]');
        await wait(page, () => document.querySelectorAll('#mc-list .mc-row').length === 1);
        if ((await stored(page)).length !== 1) throw new Error('storage still holds the copy');
      });

      // A second device: a fresh context has no storage.
      const ctx2 = await browser.newContext({ ...opts, acceptDownloads: true });
      try {
        const two = await ctx2.newPage();
        run.watch(two);
        const imp = (name, body) => two.setInputFiles('#mc-file', { name, mimeType: 'application/json', buffer: Buffer.from(body) });
        await run.do('the file imports on a second device and its sheet is the same', async () => {
          await open(two, url, { grid });
          await two.click('#lobby-party > summary'); await two.click('#lobby-mychars'); await waitShown(two, '#mychars');
          if (!(await shown(two, '#mc-empty'))) throw new Error('a fresh device is not empty');
          await imp('tessa.hextable-character.json', exported);
          await wait(two, () => document.querySelectorAll('#mc-list .mc-row').length === 1);
          const a = JSON.parse(exported), b = (await stored(two))[0];
          if (JSON.stringify(a.sheet) !== JSON.stringify(b.sheet) || a.cid !== b.cid || JSON.stringify(a.edits) !== JSON.stringify(b.edits) || a.born.level !== b.born.level) throw new Error(`differs: ${JSON.stringify(b).slice(0, 200)}`);
          await imp('again.json', exported);
          await wait(two, () => /already in My characters/.test(document.getElementById('mc-msg').textContent));
          if ((await stored(two)).length !== 1) throw new Error('the same character was added twice');
        });
        await run.do('a file that fails says why and changes nothing', async () => {
          const o = JSON.parse(exported);
          const cases = [
            ['not JSON', 'this is not json', /not JSON/],
            ['wrong format', JSON.stringify({ ...o, format: 'other' }), /not a Hextable character file/],
            ['unknown field', JSON.stringify({ ...o, cid: 'AAAAAAAAAAAAAAAAAAAAAA', extra: 1 }), /field it should not: "extra"/],
            ['level 25', JSON.stringify({ ...o, cid: 'BBBBBBBBBBBBBBBBBBBBBB', sheet: { ...o.sheet, level: 25 } }), /level/i],
            ['a spell that is not in the SRD', JSON.stringify({ ...o, cid: 'CCCCCCCCCCCCCCCCCCCCCC', sheet: { ...o.sheet, spells: ['wish-of-the-owner'] } }), /cannot be played/],
            ['a bad id', JSON.stringify({ ...o, cid: 'x' }), /cid/],
            ['too big', JSON.stringify({ ...o, cid: 'DDDDDDDDDDDDDDDDDDDDDD', pad: 'x'.repeat(100000) }), /over 96 KB/],
          ];
          for (const [name, body, want] of cases) {
            await imp('bad.json', body);
            await wait(two, (m) => document.getElementById('mc-msg').textContent.length > 0 && document.getElementById('mc-msg').dataset.n !== m, name).catch(() => {});
            await sleep(150);
            const said = await text(two, '#mc-msg');
            if (!/was not imported|over 96 KB/.test(said) || !want.test(said)) throw new Error(`${name}: "${said.slice(0, 200)}"`);
            if ((await stored(two)).length !== 1) throw new Error(`${name} changed the list`);
          }
          await shot('5-bad-file', two);
        });
        await run.do('a browser whose storage throws still shows the lobby and starts a solo game with the starters', async () => {
          const ctx3 = await browser.newContext(opts);
          try {
            const p3 = await ctx3.newPage();
            run.watch(p3);
            await p3.addInitScript((k) => { const get = Storage.prototype.getItem, set = Storage.prototype.setItem; Storage.prototype.getItem = function (x) { if (x === k) throw new Error('blocked'); return get.call(this, x); }; Storage.prototype.setItem = function (x, v) { if (x === k) throw new Error('full'); return set.call(this, x, v); }; }, KEY);
            await open(p3, url, { grid });
            await p3.click('#lobby-party > summary'); await waitShown(p3, '#lobby-party-store');
            if (!/would not let the page read/.test(await text(p3, '#lobby-party-store'))) throw new Error(`note: ${await text(p3, '#lobby-party-store')}`);
            await p3.click('#lobby-mychars'); await p3.click('#mc-new'); await waitShown(p3, '#qb');
            await buildFighter(p3, 'Nobody Saved', 1);
            await wait(p3, () => /would not keep the change/.test(document.querySelector('#qb-problems')?.textContent ?? ''));
            await p3.click('#qb-cancel'); await p3.click('#mc-close');
            await p3.click('#lobby-solo'); await wait(p3, () => window.hextable?.state?.entities);
            if ((await pcs(p3)).length !== 4) throw new Error('the starters did not play');
          } finally { await ctx3.close(); }
        });

        // The start flow says where you are, has a Back, and keeps what was filled in (issue #556, docs/specs/start-page.md).
        await run.do('start flow: every page is titled, Back is a labelled 44 px button, a build in progress and the front page survive Back and a reload', async () => {
          const ctx4 = await browser.newContext(opts);
          try {
            const p = await ctx4.newPage();
            run.watch(p);
            const tp = (sel) => (touch ? p.tap(sel) : p.click(sel));
            const h44 = (sel) => p.$eval(sel, (e) => e.getBoundingClientRect().height >= 43.5);
            const draft = () => p.evaluate(() => JSON.parse(localStorage.getItem('hextable.draft') ?? 'null'));
            const sh = (n) => (dir ? p.screenshot({ path: `${dir}/startflow-${n}-${tag}.png` }).catch(() => {}) : null);
            await open(p, url, { grid });
            if ((await text(p, '#lobby-where')) !== 'Start a game' || (await shown(p, '#lobby-back'))) throw new Error('the front page does not say where it is');
            await tp('#lobby-party > summary'); await waitShown(p, '#lobby-back');
            if ((await text(p, '#lobby-where')) !== 'New solo game › Party') throw new Error(`party title: ${await text(p, '#lobby-where')}`);
            if (!/^← Back/.test(await text(p, '#lobby-back')) || !(await h44('#lobby-back'))) throw new Error('lobby Back is not a labelled 44 px button');
            await sh('1-party');
            await tp('#lobby-back'); await waitShown(p, '#lobby-back', false);
            if ((await text(p, '#lobby-where')) !== 'Start a game') throw new Error('Back did not return to the front page');
            await tp('#lobby-party > summary'); await tp('#lobby-mychars'); await waitShown(p, '#mychars');
            if ((await text(p, '#mc-title')) !== 'New solo game › Characters') throw new Error(`mychars title: ${await text(p, '#mc-title')}`);
            if (!/^← Back/.test(await text(p, '#mc-close')) || !(await h44('#mc-close'))) throw new Error('My characters Back is not a labelled 44 px button');
            await tp('#mc-new'); await waitShown(p, '#qb');
            if ((await text(p, '#qb-title')) !== 'New solo game › Characters › New character') throw new Error(`build title: ${await text(p, '#qb-title')}`);
            if (!/^← Back to Characters/.test(await text(p, '#qb-close')) || !(await h44('#qb-close'))) throw new Error('build Back is not a labelled 44 px button');
            // the colour: swatches and a box in the page, never the browser's own colour dialog; every target 44 px
            if (await p.$('#qb input[type="color"]')) throw new Error('the build screen still uses the browser colour dialog');
            const sw = await p.$$eval('#qb .qb-swatch:not([hidden])', (b) => b.map((x) => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }));
            if (sw.length < 8 || sw.some(([w, h]) => w < 43.5 || h < 43.5)) throw new Error(`swatches: ${JSON.stringify(sw)}`);
            await tp('#qb-color-8e5ba6');
            if ((await p.getAttribute('#qb-color-8e5ba6', 'aria-checked')) !== 'true') throw new Error('the swatch is not marked chosen');
            await tp('#qb-color-more'); await waitShown(p, '#qb-color-hex');
            await p.fill('#qb-color-hex', 'nope'); await wait(p, () => /Type a colour/.test(document.querySelector('#qb-color-note').textContent));
            if ((await p.getAttribute('#qb-color-8e5ba6', 'aria-checked')) !== 'true') throw new Error('a bad colour changed the choice');
            await p.fill('#qb-color-hex', '12AB34'); await wait(p, () => document.querySelector('#qb-color .qb-swatch.on')?.dataset.color === '#12ab34');
            await sh('2-colour');
            await p.fill('#qb-name', 'Dara Flint'); await p.selectOption('#qb-class', 'fighter'); await p.selectOption('#qb-levelsel', '3');
            await wait(p, () => document.querySelector('#qb-draft'));
            if (!(await draft())?.build?.new) throw new Error('nothing was kept as a draft');
            await tp('#qb-close'); await waitShown(p, '#qb', false);
            await tp('#mc-new'); await waitShown(p, '#qb');
            if ((await p.inputValue('#qb-name')) !== 'Dara Flint' || (await p.inputValue('#qb-levelsel')) !== '3') throw new Error('Back lost what was filled in');
            if (!/Picked up where you left off/.test(await text(p, '#qb-draft-note'))) throw new Error('the sheet does not say it picked up a draft');
            await sh('3-restored');
            await p.reload(); await waitShown(p, '#lobby');
            await tp('#lobby-party > summary'); await tp('#lobby-mychars'); await tp('#mc-new'); await waitShown(p, '#qb');
            if ((await p.inputValue('#qb-name')) !== 'Dara Flint') throw new Error('a reload lost the draft');
            if ((await p.evaluate(() => document.querySelector('.qb-swatch.on')?.dataset.color)) !== '#12ab34') throw new Error('the colour was lost');
            await tp('#qb-startover'); await tp('#qb-startover'); await wait(p, () => document.querySelector('#qb-name').value === '');
            if ((await draft())?.build?.new) throw new Error('Start over left the draft');
            // saving keeps the colour as a #rrggbb and clears the draft
            await buildFighter(p, 'Dara Flint', 1);
            await waitShown(p, '#qb', false);
            if ((await draft())?.build?.new) throw new Error('saving left the draft');
            if (!/^#[0-9a-f]{6}$/.test((await stored(p)).at(-1)?.sheet?.look?.color ?? '')) throw new Error('the saved colour is not #rrggbb');
            await tp('#mc-close'); await waitShown(p, '#mychars', false);
            // the front page: name and code survive a reload; Start over clears them and leaves My characters alone
            await p.fill('#lobby-name', 'Isaac'); await p.fill('#lobby-code', 'KX7Q2M');
            await p.reload(); await waitShown(p, '#lobby');
            if ((await p.inputValue('#lobby-name')) !== 'Isaac' || (await p.inputValue('#lobby-code')) !== 'KX7Q2M') throw new Error('a reload lost the front page');
            await waitShown(p, '#lobby-startover'); await sh('4-front-draft');
            await tp('#lobby-startover'); await tp('#lobby-startover'); await wait(p, () => document.querySelector('#lobby-name').value === '' && document.querySelector('#lobby-code').value === '');
            if ((await stored(p)).length !== 1) throw new Error('Start over touched My characters');
            if ((await draft()) !== null) throw new Error('Start over left a draft');
          } finally { await ctx4.close(); }
        });
      } finally { await ctx2.close(); }
    } finally { await ctx.close(); }
  });
}


// ---------- ability scores in the build screen (docs/specs/ability-scores.md, #557) ----------
// Four ways to make the scores: standard array (with the class suggestion), point cost (steppers, 27 points), roll (rule, dice, rerolls, placing, what the DM sees)
// and by hand (what was typed is kept). The dice here are fixed by a key the page is given instead of a random one, so the rolls are known and checked against
// the rules package; the sheet that is saved must pass validate, carry its record, and be refused for a score typed over it.
const FIXED = Array.from({ length: 32 }, (_, i) => i), FIXED_HEX = FIXED.map((x) => x.toString(16).padStart(2, '0')).join('');
const first = rollScores({ rng: keyedRng(FIXED_HEX) }).sets.map((s) => s.faces);          // what Roll gives the page, in order; a reroll gives first[0]
const topOf = (f) => f.reduce((a, b) => a + b, 0) - Math.min(...f);
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const heightOk = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 43).map((e) => e.id || e.textContent));

async function scoresPass(browser, url, label, opts, grid) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'wide'}`;
    const dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      await ctx.addInitScript((bytes) => { const real = crypto.getRandomValues.bind(crypto); crypto.getRandomValues = (a) => (a instanceof Uint8Array && a.length === 32 ? (a.set(bytes), a) : real(a)); }, FIXED);
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n, at = null) => { if (!dir) return; if (at) await page.$eval(at, (e) => e.scrollIntoView({ block: 'start' })).catch(() => {}); await page.screenshot({ path: `${dir}/scores-${n}-${tag}.png` }).catch(() => {}); };
      const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
      const sheets = () => stored(page).then((l) => l.map((f) => f.sheet));
      const fill = async (name) => {
        await openSec(page, 'who'); await page.fill('#qb-name', name); await page.selectOption('#qb-class', 'fighter');
        await fighterBasics(page); await openSec(page, 'scores');
      };
      const saveable = () => wait(page, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0);
      const fresh = async () => { await tap('#lobby-party > summary').catch(() => {}); if (!(await shown(page, '#lobby-mychars'))) await tap('#lobby-party > summary'); await tap('#lobby-mychars'); await waitShown(page, '#mychars'); await tap('#mc-new'); await waitShown(page, '#qb'); await openSec(page, 'scores'); };
      const val = (sel) => page.inputValue(sel);
      const txt = (sel) => text(page, sel);
      const clean = async (what) => { const s = await txt('#qb-scores'); if (/\bnull\b|undefined|NaN/.test(s)) throw new Error(`${what}: stray words in the score section: ${s.slice(0, 120)}`); };

      await run.do('the score section offers four ways to make the scores, each button at least 44 px, and opens on "Enter by hand"', async () => {
        await open(page, url, { grid }); await fresh();
        const ids = await page.$$eval('.sc-method', (b) => b.map((x) => `${x.id}:${x.textContent}:${x.getAttribute('aria-pressed')}`));
        if (ids.join() !== 'qb-method-standard:Standard array:false,qb-method-pointcost:Point cost:false,qb-method-roll:Roll:false,qb-method-hand:Enter by hand:true') throw new Error(`methods: ${ids}`);
        const small = await heightOk(page, '#qb-scores button'); if (small.length) throw new Error(`small buttons: ${small}`);
        if (!(await page.$('#qb-abil-str'))) throw new Error('no typed boxes');
        await clean('hand'); await shot('1-hand');
      });

      await run.do('what is typed by hand is kept when another way is chosen and comes back with "Enter by hand"', async () => {
        await page.fill('#qb-abil-str', '14');
        await tap('#qb-method-standard'); await waitShown(page, '#qb-std-str');
        if (await shown(page, '#qb-abil-str')) throw new Error('typed boxes still shown');
        await tap('#qb-method-hand'); await waitShown(page, '#qb-abil-str');
        if ((await val('#qb-abil-str')) !== '14') throw new Error(`typed score lost: ${await val('#qb-abil-str')}`);
      });

      await run.do('standard array: nothing placed blocks Save and says so; the class suggestion places the SRD\'s numbers; a number is used once', async () => {
        await tap('#qb-method-standard'); await fill('Std Stan');
        if (!/Place all six numbers \(6 still to place\)/.test(await txt('#qb-problems'))) throw new Error(`problems: ${await txt('#qb-problems')}`);
        if (!(await page.$eval('#qb-save', (b) => b.disabled))) throw new Error('Save is on with nothing placed');
        await tap('#qb-suggest');
        const got = await page.$$eval('[id^="qb-std-"]', (s) => s.map((x) => x.value).join());
        if (got !== '15,14,13,8,10,12') throw new Error(`suggestion for a Fighter: ${got}`);
        await page.selectOption('#qb-std-cha', '15');                       // 15 is on STR: it moves
        if ((await val('#qb-std-str')) !== '' || (await val('#qb-std-cha')) !== '15') throw new Error('a number was used twice');
        await tap('#qb-suggest'); await clean('standard');
        if (!/Used 6 of 6 numbers/.test(await txt('#qb-sc-line'))) throw new Error(await txt('#qb-sc-line'));
      });

      await run.do('the background: Soldier +2 STR and +1 DEX shows in the rows, caps nothing here, and the saved sheet has the record and passes validate', async () => {
        await page.selectOption('#qb-bg', 'soldier'); await page.selectOption('#qb-bg-plus2', 'str'); await page.selectOption('#qb-bg-plus1', 'dex');
        const fin = await page.$$eval('[id^="qb-final-"]', (o) => o.map((x) => x.textContent).join());
        if (fin !== '17,15,13,8,10,12') throw new Error(`final scores ${fin}`);
        if ((await txt('#qb-bg-plus-str')) !== '+2' || (await txt('#qb-bg-plus-dex')) !== '+1') throw new Error('the +n beside the rows is missing');
        if ((await page.$$eval('#qb-bg-plus2 option', (o) => o.map((x) => x.value).join())) !== ',str,dex,con') throw new Error('Soldier offers more than its three abilities');
        await page.selectOption('#qb-bg-plus1', 'str');                      // the same ability twice: the +2 is cleared
        if (!/Choose which abilities the background raises/.test(await txt('#qb-problems'))) throw new Error('an unfinished background is not said');
        await page.selectOption('#qb-bg-plus2', 'str'); await page.selectOption('#qb-bg-plus1', 'dex');
        await saveable(); await shot('2-standard', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const s = (await sheets()).at(-1);
        if (s.scores.method !== 'standard' || JSON.stringify(s.scores.background) !== '{"id":"soldier","abilities":{"str":2,"dex":1}}' || s.abilities.str !== 17) throw new Error(`sheet ${JSON.stringify(s)}`);
        if (validate(s).length) throw new Error(`validate: ${validate(s)}`);
        if (validate({ ...s, abilities: { ...s.abilities, str: 18 } }).every((m) => !/no longer match/.test(m))) throw new Error('a score typed over the record is accepted');
        if (!/Standard array\. Soldier: \+2 STR, \+1 DEX/.test(await text(page, '.mc-scores'))) throw new Error(`list line: ${await text(page, '.mc-scores')}`);
      });

      await run.do('point cost: steppers from 8, the cost line, the plus off at 15 and when the points run out; Save keeps the record', async () => {
        await tap('#mc-new'); await waitShown(page, '#qb'); await fill('Pointy Pip'); await tap('#qb-method-pointcost');
        if (!/27 points, 0 spent, 27 left/.test(await txt('#qb-sc-line'))) throw new Error(await txt('#qb-sc-line'));
        if (!(await page.$eval('#qb-pc-str-minus', (b) => b.disabled))) throw new Error('minus is on at 8');
        for (const a of ['str', 'dex', 'con']) for (let i = 0; i < 7; i++) await tap(`#qb-pc-${a}-plus`);
        if ((await txt('#qb-pc-str')) !== '15' || !(await page.$eval('#qb-pc-str-plus', (b) => b.disabled))) throw new Error('15 is not the top');
        if (!/27 points, 27 spent, 0 left.*No points left/.test(await txt('#qb-sc-line'))) throw new Error(await txt('#qb-sc-line'));
        if (!(await page.$eval('#qb-pc-int-plus', (b) => b.disabled))) throw new Error('a score can be raised with no points left');
        await tap('#qb-pc-con-minus'); await tap('#qb-pc-int-plus'); await tap('#qb-pc-int-plus');        // con 14 frees 2 points: int 8 to 9 (1) and 10 (1)
        if ((await txt('#qb-pc-int')) !== '10') throw new Error(`int ${await txt('#qb-pc-int')}`);
        await page.selectOption('#qb-bg', 'soldier'); await page.selectOption('#qb-bg-mode', 'all');
        const fin = await page.$$eval('[id^="qb-final-"]', (o) => o.map((x) => x.textContent).join());
        if (fin !== '16,16,15,10,8,8') throw new Error(`final ${fin}`);
        await clean('pointcost'); await saveable(); await shot('3-pointcost', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const s = (await sheets()).at(-1);
        if (s.scores.method !== 'pointcost' || s.scores.base.con !== 14 || validate(s).length) throw new Error(`sheet ${JSON.stringify(s.scores)} ${validate(s)}`);
      });

      await run.do('roll: the rule first (every score, once; the higher stands), then the dice; six rolls, each can be rolled again once, the page says what the DM sees', async () => {
        await tap('#mc-new'); await waitShown(page, '#qb'); await fill('Rolla Kerr'); await tap('#qb-method-roll');
        if (!/No score may be rolled again/.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        await page.selectOption('#qb-rule-reroll', 'each'); await page.selectOption('#qb-rule-result', 'higher');
        if (!/Every score may be rolled again, once\. The higher of the two stands/.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        await clean('roll, before'); await shot('4a-roll-rule', '#qb-scores');
        await tap('#qb-roll'); await waitShown(page, '#qb-chips');
        const scores = await page.$$eval('.sc-chip', (c) => c.map((x) => +x.dataset.score));
        if (scores.join() !== first.map(topOf).join()) throw new Error(`rolled ${scores}, the rules package says ${first.map(topOf)}`);
        const reroll = await page.$$eval('[id^="qb-reroll-"]', (b) => b.length); if (reroll !== 6) throw new Error(`${reroll} reroll buttons under "every score, once"`);
        if (!/Roll the dice first|Place all six/.test(await txt('#qb-problems'))) throw new Error('Save is not held for placing');
        await tap('#qb-reroll-0'); await wait(page, () => !document.querySelector('#qb-reroll-0'));
        const c0 = await txt('#qb-chip-0'); if (!/rolled again/.test(c0)) throw new Error(`chip 0: ${c0}`);
        const want = Math.max(topOf(first[0]), topOf(first[0]));                  // the reroll is the same dice again here; the higher of two equal scores
        if ((await page.$eval('#qb-chip-0', (c) => +c.dataset.score)) !== want) throw new Error('the standing score is wrong');
        if (!/rolled again already/.test(await txt('#qb-noreroll-0'))) throw new Error('no reason on a rerolled chip');
        for (const [i, a] of ABIL.entries()) await page.selectOption(`#qb-place-${a}`, String(i));
        const placed = await page.$$eval('[id^="qb-place-"]', (s) => s.map((x) => x.options.length).join());
        if (placed !== '2,2,2,2,2,2') throw new Error(`a rolled score is offered twice: ${placed}`);
        if (!/What the DM sees: Rolled on the player's device on \d+ \w+ 2026, under the rule "Every score may be rolled again, once\. The higher of the two stands\." \(set on that device\)/.test(await txt('#qb-dm-line'))) throw new Error(await txt('#qb-dm-line'));
        if (!/Not witnessed: the table did not roll these/.test(await txt('#qb-dm-line'))) throw new Error('"not witnessed" is not said');
        const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('hextable.scoreroll'))); if (!kept || kept.rolls.length !== 6 || !kept.rolls[0].again) throw new Error('the unsaved roll is not kept on the device');
        await clean('roll, after'); await saveable(); await shot('4-roll', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const s = (await sheets()).at(-1);
        if (s.scores.method !== 'roll' || s.scores.by !== 'device' || JSON.stringify(s.scores.rule) !== '{"reroll":"each","result":"higher"}' || validate(s).length) throw new Error(`sheet ${JSON.stringify(s.scores)} ${validate(s)}`);
        if (JSON.stringify(s.scores.rolls[0].dice) !== JSON.stringify(first[0]) || JSON.stringify(s.scores.rolls[1].dice) !== JSON.stringify(first[1])) throw new Error('the dice on the sheet are not the dice rolled');
        if (await page.evaluate(() => localStorage.getItem('hextable.scoreroll'))) throw new Error('the kept roll was not used up by saving');
        if (!/Rolled on a device/.test(await text(page, '.mc-row:last-child .mc-scores'))) throw new Error(await text(page, '.mc-row:last-child .mc-scores'));
      });

      await run.do('opening the saved roll again: the same dice, no roll button, and no roll can be rolled again', async () => {
        await tap('.mc-row:last-child [id^="mc-edit-"]'); await waitShown(page, '#qb'); await openSec(page, 'scores');
        if ((await page.getAttribute('#qb-method-roll', 'aria-pressed')) !== 'true') throw new Error('it did not open on its method');
        if (await page.$('#qb-roll')) throw new Error('a saved roll offers a new roll');
        if (await page.$('[id^="qb-reroll-"]')) throw new Error('a saved roll can be rolled again');
        if (!/saved with these rolls/.test(await txt('#qb-noreroll-1'))) throw new Error(await txt('#qb-noreroll-1'));
        await shot('5-edit', '#qb-scores');
        await page.click('#qb-cancel');
      });

      await run.do('a roll made and not saved stays on the device: closing the panel is not a new roll; "below 10" lets only a low score be rolled again', async () => {
        await tap('#mc-new'); await waitShown(page, '#qb'); await openSec(page, 'scores'); await tap('#qb-method-roll');
        await page.selectOption('#qb-rule-reroll', 'below'); if ((await val('#qb-rule-below')) !== '10') throw new Error('below defaults to 10');
        await tap('#qb-roll'); await waitShown(page, '#qb-chips');
        const open = await page.$$eval('[id^="qb-reroll-"]', (b) => b.map((x) => +x.id.slice(10)));
        const lows = first.map(topOf).flatMap((n, i) => (n < 10 ? [i] : []));
        if (open.join() !== lows.join()) throw new Error(`rerollable ${open}, expected ${lows} of ${first.map(topOf)}`);
        const why = await page.$$eval('[id^="qb-noreroll-"]', (e) => e.map((x) => x.textContent)); if (why.length + open.length !== 6 || why.some((w) => !/is not below 10/.test(w))) throw new Error(`reasons: ${why}`);
        await page.click('#qb-cancel'); await tap('#mc-new'); await waitShown(page, '#qb'); await openSec(page, 'scores'); await tap('#qb-method-roll');
        if (await page.$('#qb-roll')) throw new Error('closing the panel gave a new roll');
        const again = await page.$$eval('.sc-chip', (c) => c.map((x) => +x.dataset.score)); if (again.join() !== first.map(topOf).join()) throw new Error('not the same roll');
        await page.click('#qb-cancel');
      });

      await run.do('the DM sees the line in the sheet of a rolled character in the game', async () => {
        await page.evaluate(() => localStorage.removeItem('hextable.scoreroll'));
        const cid = (await stored(page)).at(-1).cid;
        await page.click('#mc-close');
        await page.selectOption('#lobby-slot-0', `mine:${cid}`);
        await tap('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities);
        await page.evaluate(() => { const S = window.hextable.state, e = Object.values(S.entities).find((x) => x.name === 'Rolla Kerr'); window.hextable.select(e.id); });
        await tap('#btn-sheet'); await waitShown(page, '#sheet-body');
        const line = await page.evaluate(() => document.getElementById('sheet-scores-line')?.textContent ?? '');
        const who = await page.$eval('#sheet-body h2', (h) => h.textContent);
        if (who !== 'Rolla Kerr') throw new Error(`the sheet is ${who}'s`);
        if (!/Rolled on the player's device/.test(line)) throw new Error(`no line for the DM: "${line}"`);
        await page.$eval('#sheet-scores-line', (e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
        await shot('6-dm-sheet');
      });

      await run.do('a level-up shows how the scores were made and offers no way to change them', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await wait(page, () => !document.getElementById('qb-levelup')?.disabled);
        await tap('#qb-levelup'); await waitShown(page, '#qb'); await openSec(page, 'scores');
        const line = await txt('#qb-sc-line');
        if (!/^Rolled on a device, \d+ \w+ 2026\. A level-up does not change them/.test(line)) throw new Error(`line: ${line}`);
        if (await page.$('.sc-method') || await page.$('#qb-roll') || await page.$('[id^="qb-reroll-"]')) throw new Error('a level-up offers to change the scores');
        await clean('level-up'); await shot('7-levelup', '#qb-scores');
        await page.click('#qb-cancel');
      });
    } finally { await ctx.close(); }
  });
}

// ---------- untrained armour and the scroll card in the build screen (#566) ----------
// Armour the class has no training in is greyed in the Armour list (a wizard: all of it, and the Shield), with a line saying why; a fighter's is not.
// A spell's text comes up in a parchment card after 3 s of hover (nothing before), after a 500 ms touch press (and the press does not tick the spell),
// or on focus plus the I key; Escape, moving away or a tap elsewhere hides it; at 390x844 it is inside the screen.
async function scrollPass(browser, url, label, opts, grid) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'wide'}`;
    const dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (dir ? page.screenshot({ path: `${dir}/scroll-${n}-${tag}.png` }).catch(() => {}) : null);
      const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
      const card = () => page.evaluate(() => { const c = document.querySelector('#scrolltip'); if (!c) return null; const r = c.getBoundingClientRect(); return { text: c.querySelector('p')?.textContent, title: c.querySelector('b')?.textContent, sub: c.querySelector('small')?.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom, vw: document.documentElement.clientWidth, vh: innerHeight }; });
      const gone = () => wait(page, () => !document.querySelector('#scrolltip'));
      const SP = 'fire-bolt', ROW = `.opt:has(#qb-spell-${SP}) > label`, want = CONTENT.spells[SP];
      const inside = (c) => c.l >= 0 && c.t >= 0 && c.r <= c.vw && c.b <= c.vh;
      await open(page, url, { grid });
      await tap('#lobby-party > summary').catch(() => {}); if (!(await shown(page, '#lobby-mychars'))) await tap('#lobby-party > summary');
      await tap('#lobby-mychars'); await waitShown(page, '#mychars'); await tap('#mc-new'); await waitShown(page, '#qb');

      await run.do('a wizard\'s armour is trained-first: none is trained, so the rest sits behind a counted disclosure; opened, each is greyed with a Not proficient chip and what it costs; the Shield too', async () => {
        await page.selectOption('#qb-class', 'wizard'); await openSec(page, 'gear');
        if (!(await page.isChecked('#qb-armour-none')) || await page.$eval('#qb-armour-none', (e) => e.disabled)) throw new Error('None is not choosable');
        if (await page.$('#qb-armour-plate-armor')) throw new Error('the untrained armour is listed before the disclosure is opened');
        const label = await text(page, '#qb-armour-more'); if (!/^Show armour you are not proficient with \(\d+\)/.test(label)) throw new Error(`disclosure: ${label}`);
        await tap('#qb-armour-more'); await waitShown(page, '#qb-armour-plate-armor');
        const rows = await page.$$eval('#qb-acc-sec-gear .opt:has(input[name="qb-armour"])', (l) => l.map((r) => [r.querySelector('input').id, r.querySelector('input').disabled, /Not proficient/.test(r.textContent), /Disadvantage on Strength and Dexterity rolls/.test(r.textContent)]));
        const bad = rows.filter(([id, off, np, cost]) => id !== 'qb-armour-none' && !(off && np && cost)); if (bad.length || rows.length < 5) throw new Error(`armour rows: ${JSON.stringify(rows)}`);
        const sh = await page.$eval('#qb-shield', (e) => [e.disabled, /Not proficient/.test(e.closest('.opt').textContent)]); if (!sh[0] || !sh[1]) throw new Error('the Shield is not greyed and marked');
        if (!/Wizard training\./.test(await text(page, '#qb-acc-sec-gear .pk-lead')) || !/Shields: no/.test(await text(page, '#qb-acc-sec-gear .pk-lead'))) throw new Error('the training line is missing');
        if (!(await page.isChecked('#qb-armour-none'))) throw new Error('the armour choice changed');
        await shot('1-armour');
      });

      await run.do('a fighter\'s armour is not greyed, and has no disclosure for it', async () => {
        await openSec(page, 'who'); await page.selectOption('#qb-class', 'fighter'); await openSec(page, 'gear');
        if (await page.$('#qb-armour-more') || await page.$('#qb-acc-sec-gear .chip.np') || await page.$eval('#qb-shield', (e) => e.disabled)) throw new Error('a fighter has something greyed');
        await page.check('#qb-armour-plate-armor'); await page.check('#qb-shield');
        await openSec(page, 'who'); await page.selectOption('#qb-class', 'wizard'); await openSec(page, 'gear');
        if (!(await page.isChecked('#qb-armour-none')) || !(await page.$('#qb-armour-more'))) throw new Error('the wizard\'s list is not back to trained-first');
      });

      await run.do('a monk\'s gear says armour or a Shield turns off Unarmored Defense, Martial Arts and Unarmored Movement, and lists untrained weapons behind a count', async () => {
        await openSec(page, 'who'); await page.selectOption('#qb-class', 'monk'); await page.selectOption('#qb-levelsel', '5'); await openSec(page, 'gear');
        const note = await text(page, '#qb-bare-note'); if (!/Armour or a Shield turns off/.test(note) || !/Martial Arts/.test(note) || !/Unarmored Defense/.test(note) || !/Unarmored Movement/.test(note)) throw new Error(`monk note: ${note}`);
        if (!/Show weapons you are not proficient with \(\d+\)/.test(await text(page, '#qb-weapons-more'))) throw new Error('no counted weapons disclosure');
        if (await page.$('#qb-weapon-longsword')) throw new Error('an untrained weapon is listed before the disclosure is opened');
        await tap('#qb-weapons-more'); await waitShown(page, '#qb-weapon-longsword');
        const l = await page.$eval('#qb-weapon-longsword', (e) => [e.disabled, /Not proficient/.test(e.closest('.opt').textContent), /No Proficiency Bonus on the attack roll: [+\u2212]\d+ instead of \+\d+/.test(e.closest('.opt').textContent)]);
        if (!l[0] || !l[1] || !l[2]) throw new Error(`longsword row: ${l}`);
        await page.check('#qb-weapon-shortsword'); await wait(page, () => /Shortsword/.test(document.querySelector('#qb-attacks')?.textContent ?? '') || !!document.querySelector('#qb-weapon-shortsword:checked'));
        await shot('1b-monk-gear');
        await openSec(page, 'who'); await page.selectOption('#qb-class', 'wizard'); await openSec(page, 'gear');
      });

      await run.do(touch ? 'a 500 ms press on a spell shows its scroll card inside the screen, does not tick the spell, and a tap elsewhere hides it' : 'hovering a spell shows nothing before 3 s, then its scroll card; Escape and moving away hide it', async () => {
        await openSec(page, 'spells');
        await page.$eval(ROW, (e) => e.scrollIntoView({ block: 'center' }));
        const sel = ROW;
        if (!touch) {
          await page.hover(sel); await sleep(2500);
          if (await card()) throw new Error('the card came up before 3 s');
          await wait(page, () => document.querySelector('#scrolltip'));
          let c = await card();
          if (c.text !== want.text || c.title !== want.name || !/^Cantrip · /.test(c.sub)) throw new Error(`card: ${JSON.stringify(c)}`);
          if (!inside(c)) throw new Error(`card outside the screen: ${JSON.stringify(c)}`);
          if (!(await page.evaluate(() => getComputedStyle(document.querySelector('#scrolltip')).backgroundImage.includes('gradient')))) throw new Error('the card has no parchment');
          await shot('2-hover'); await page.keyboard.press('Escape'); await gone();
          await page.hover(sel); await sleep(300); await page.mouse.move(5, 5); await sleep(3300);
          if (await card()) throw new Error('moving away did not stop the card');
          await page.hover(sel); await wait(page, () => document.querySelector('#scrolltip')); await page.mouse.move(5, 5); await gone();
        } else {
          const cdp = await ctx.newCDPSession(page);
          const at = await page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; });
          const pt = [{ x: at[0], y: at[1], id: 1 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }); await sleep(250);
          if (await card()) throw new Error('the card came up before the press was held');
          await sleep(450);
          const c = await card(); if (!c) throw new Error('no card after a 500 ms press');
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
          if (c.text !== want.text || !inside(c)) throw new Error(`card: ${JSON.stringify(c)}`);
          if (await page.isChecked(`#qb-spell-${SP}`)) throw new Error('the press ticked the spell');
          if (!(await card())) throw new Error('lifting the finger hid the card');
          await shot('2-press');
          await page.touchscreen.tap(370, 30); await gone();       // blank space: a tap near a button is snapped to the button by the browser
          await tap(sel); if (!(await page.isChecked(`#qb-spell-${SP}`))) throw new Error('a plain tap no longer ticks the spell');
          await tap(sel); if (await page.isChecked(`#qb-spell-${SP}`)) throw new Error('a second tap did not untick');
        }
      });

      await run.do('focus and the I key show the card; Escape hides it; a feature\'s option has one too', async () => {
        await page.focus(`#qb-spell-${SP}`); await page.keyboard.press('i');
        const c = await card(); if (!c || c.text !== want.text) throw new Error(`key card: ${JSON.stringify(c)}`);
        await page.keyboard.press('Escape'); await gone();
        if (await page.isChecked(`#qb-spell-${SP}`)) throw new Error('the I key ticked the spell');
        await openSec(page, 'who'); await page.selectOption('#qb-class', 'sorcerer'); await page.selectOption('#qb-levelsel', '2'); await openSec(page, 'choices');
        const opt = await page.$('#qb [data-option]');
        if (opt) {
          await page.focus('#qb [data-option] input'); await page.keyboard.press('i');
          const o = await card(); if (!o || !o.text) throw new Error('an option has no card'); await page.keyboard.press('Escape'); await gone();
        }
      });
    } finally { await ctx.close(); }
  });
}

// ---------- the build screen rolls through the table in a game (#578) ----------
// In a solo game (the player is the DM) the table's rule is said in its words, Roll sends rollAbilityScores and the six scores are the game's own dice, only the scores
// the rule allows can be rolled again (a reroll is an action too), a sheet saved from it carries by: 'table' and the event's number, the sheet validates, and the panel
// reopened shows the kept roll. The DM's three controls for the rule are looked at on the way: shown, no sideways scroll, every control at least 44 px on a phone.
async function gamePass(browser, url, label, opts, grid) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'wide'}`;
    const dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n, at = null, block = 'start') => { if (!dir) return; if (at) await page.$eval(at, (e, b) => e.scrollIntoView({ block: b }), block).catch(() => {}); await page.screenshot({ path: `${dir}/game-${n}-${tag}.png` }).catch(() => {}); };
      const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
      const txt = (sel) => text(page, sel);
      const rolls = () => state(page, (S) => (S.scoreRolls.local ?? S.scoreRolls.dm)?.sets ?? null);
      const settings = (S) => S.settings;

      await run.do('the DM\'s three controls for rolled scores are on screen, in words, fit the width and are big enough to touch', async () => {
        await open(page, url, { grid }); await playSolo(page);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.$eval('#dm-score-reroll', (e) => e.scrollIntoView({ block: 'center' }));
        const box = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const sel = ['dm-score-reroll', 'dm-score-below', 'dm-score-result'].map((id) => ({ id, w: Math.round(r(id).width), h: Math.round(r(id).height), shown: document.getElementById(id).getClientRects().length > 0, right: Math.round(r(id).right) })); return { sel, iw: innerWidth }; });
        await shot('1-dm-controls-none', '#dm-score-reroll', 'center');
        const reroll = box.sel[0]; if (!reroll.shown) throw new Error('the reroll control is not shown');
        if (box.sel[1].shown || box.sel[2].shown) throw new Error('"below" and "result" show while the rule is none');
        for (const x of box.sel.filter((y) => y.shown)) if (x.h < (touch ? 43 : 20) || x.right > box.iw + 1) throw new Error(`${x.id}: ${x.w}x${x.h}, right edge ${x.right} of ${box.iw}`);
        if (!/no score may be rolled again/i.test(await txt('#dm-score-text'))) throw new Error(`rule text: ${await txt('#dm-score-text')}`);
        await page.selectOption('#dm-score-reroll', 'below');
        await wait(page, () => window.hextable.state.settings.scoreReroll === 'below');
        if (!(await shown(page, '#dm-score-below')) || !(await shown(page, '#dm-score-result'))) throw new Error('below and result are not offered once the rule is "below"');
        await page.selectOption('#dm-score-below', '11'); await page.selectOption('#dm-score-result', 'higher');
        await wait(page, () => window.hextable.state.settings.scoreRerollBelow === 11 && window.hextable.state.settings.scoreRerollResult === 'higher');
        const after = await page.evaluate(() => { const out = []; for (const id of ['dm-score-reroll', 'dm-score-below', 'dm-score-result']) { const e = document.getElementById(id), r = e.getBoundingClientRect(); out.push({ id, h: Math.round(r.height), right: Math.round(r.right), shown: e.getClientRects().length > 0 }); } return { out, iw: innerWidth, sideways: document.getElementById('dm-score-text').closest('.panel, #drawer, aside')?.scrollWidth > (document.getElementById('dm-score-text').closest('.panel, #drawer, aside')?.clientWidth ?? 0) + 1 }; });
        for (const x of after.out) if (!x.shown || x.h < (touch ? 43 : 20) || x.right > after.iw + 1) throw new Error(`${x.id}: ${JSON.stringify(x)}`);
        if (after.sideways) throw new Error('the DM panel scrolls sideways');
        if (!/rolled again, once/.test(await txt('#dm-score-text')) || !/higher/i.test(await txt('#dm-score-text')) || (await page.$eval('#dm-score-below', (e) => e.value)) !== '11') throw new Error(`rule text: ${await txt('#dm-score-text')}`);
        await shot('2-dm-controls-below', '#dm-score-reroll', 'center');
      });

      await run.do('in the game the sheet says the table\'s rule, and Roll sends the action: the six scores are the game\'s dice', async () => {
        await tap('#qb-add'); await waitShown(page, '#qb'); await openSec(page, 'scores');
        await tap('#qb-method-roll');
        if (!/^This table: A score below 11 may be rolled again, once\. The higher of the two stands\./.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        if (await page.$('#qb-rule-reroll')) throw new Error('the device\'s rule choices are offered in a game');
        await shot('3-before-roll', '#qb-scores');
        await tap('#qb-roll'); await waitShown(page, '#qb-chips');
        const sets = await rolls(); if (!sets || sets.length !== 6) throw new Error('the game holds no roll');
        const top = (d) => d.reduce((a, b) => a + b, 0) - Math.min(...d);
        const chips = await page.$$eval('.sc-chip', (c) => c.map((x) => +x.dataset.score));
        if (chips.join() !== sets.map((x) => top(x.dice)).join()) throw new Error(`chips ${chips}, game ${sets.map((x) => top(x.dice))}`);
        if (!/^Rolled at the table \(event 1\)\./.test(await txt('#qb-rule-text')) && !/Rolled at the table \(event 1\)/.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        if (await page.$('#qb-roll')) throw new Error('a roll button is still offered beside a roll');
        const open = await page.$$eval('[id^="qb-reroll-"]', (b) => b.map((x) => +x.id.slice(10)));
        const low = chips.flatMap((n, i) => (n < 11 ? [i] : []));
        if (open.join() !== low.join()) throw new Error(`rerollable ${open}, the rule (below 11) allows ${low} of ${chips}`);
        await shot('4-rolled', '#qb-scores');
      });

      await run.do('a score the rule allows is rolled again through the table, once; the sheet shows the result that stands', async () => {
        const before = await rolls(), top = (d) => d.reduce((a, b) => a + b, 0) - Math.min(...d);
        const i = (await page.$$eval('[id^="qb-reroll-"]', (b) => b.map((x) => +x.id.slice(10))))[0];
        if (i === undefined) { console.log('smoke: no score below 11 was rolled (nothing to roll again)'); return; }
        await tap(`#qb-reroll-${i}`); await wait(page, (n) => !document.querySelector(`#qb-reroll-${n}`) && /rolled again/.test(document.getElementById(`qb-chip-${n}`)?.textContent ?? ''), i);
        const after = await rolls();
        if (!after[i].again || JSON.stringify(after[i].dice) !== JSON.stringify(before[i].dice)) throw new Error('the game did not keep the reroll beside the first roll');
        const want = Math.max(top(after[i].dice), top(after[i].again));
        if ((await page.$eval(`#qb-chip-${i}`, (c) => +c.dataset.score)) !== want) throw new Error(`stands ${await page.$eval(`#qb-chip-${i}`, (c) => c.dataset.score)}, the rule says ${want}`);
        if (!/rolled again already/.test(await txt(`#qb-noreroll-${i}`))) throw new Error(await txt(`#qb-noreroll-${i}`));
      });

      await run.do('placed and saved: by table, the event\'s number, the rule it was rolled under; the sheet validates; the DM line says so', async () => {
        await openSec(page, 'who'); await page.fill('#qb-name', 'Tabel Roe'); await page.selectOption('#qb-class', 'fighter');
        await fighterBasics(page); await openSec(page, 'scores');
        for (const [i, a] of ABIL.entries()) await page.selectOption(`#qb-place-${a}`, String(i));
        const line = await txt('#qb-dm-line'); if (!/Rolled at the table \(event \d+\), under the rule "A score below 11/.test(line) || /Not witnessed/.test(line) || /More rerolls/.test(line)) throw new Error(line);
        await wait(page, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0);
        await shot('5-saving', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const e = await state(page, (S) => Object.values(S.entities).find((x) => x.name === 'Tabel Roe')?.sheet ?? null);
        if (!e) throw new Error('no character was made'); const r = e.scores;
        if (r.method !== 'roll' || r.by !== 'table' || !Number.isInteger(r.at) || validate(e).length) throw new Error(`sheet ${JSON.stringify(r)} ${validate(e)}`);
        if (r.rule.reroll !== 'below' || r.rule.below !== 11 || r.rule.result !== 'higher') throw new Error(`rule ${JSON.stringify(r.rule)}`);
        const sets = await rolls(); if (JSON.stringify(r.rolls.map((x) => x.dice)) !== JSON.stringify(sets.map((x) => x.dice))) throw new Error('the dice on the sheet are not the game\'s');
        if (await page.evaluate(() => localStorage.getItem('hextable.scoreroll'))) throw new Error('a table roll was kept on the device');
      });

      await run.do('a new character in the same game is shown the kept roll, not a new roll button (the DM may roll a fresh set)', async () => {
        await tap('#qb-add'); await waitShown(page, '#qb'); await openSec(page, 'scores'); await tap('#qb-method-roll');
        if (await page.$('#qb-roll')) throw new Error('a kept roll is offered a new roll button');
        const sets = await rolls(), top = (d) => d.reduce((a, b) => a + b, 0) - Math.min(...d);
        const chips = await page.$$eval('.sc-chip', (c) => c.map((x) => +x.dataset.score));
        if (chips.length !== 6 || chips.some((n, i) => n < 3 || n > 18) || !sets) throw new Error(`chips ${chips}`);
        if (!(await page.$('#qb-roll-fresh'))) throw new Error('the DM is not offered a fresh set');
        await shot('6-kept', '#qb-scores');
        // The event's number is the game's roll counter: it moves on by one for each roll AND each reroll, so what the fresh set is called depends on whether the step before
        // found a score to roll again (none below 11 is about a one-in-four draw). Read the counter first and wait for the next number, never for a fixed range.
        const seq = await state(page, (S) => S.scoreRolls['#seq']);
        await tap('#qb-roll-fresh'); await wait(page, (n) => window.hextable.state.scoreRolls['#seq'] === n, seq + 1);
        const fresh = await rolls(); if (JSON.stringify(fresh) === JSON.stringify(sets)) throw new Error('the fresh set is the old one');
        await wait(page, (n) => document.querySelectorAll('.sc-chip').length === 6 && !document.querySelector('#qb-roll-fresh')?.disabled && new RegExp(`event ${n}\\b`).test(document.getElementById('qb-rule-text').textContent), seq + 1);
        await page.click('#qb-cancel');
      });

      await run.do('a table that allows no reroll offers none, and says why on each score', async () => {
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await page.selectOption('#dm-score-reroll', 'none'); await wait(page, () => window.hextable.state.settings.scoreReroll === 'none');
        await tap('#qb-add'); await waitShown(page, '#qb'); await openSec(page, 'scores'); await tap('#qb-method-roll');
        if (await page.$('[id^="qb-reroll-"]')) throw new Error('a reroll is offered where the table allows none');
        const why = await page.$$eval('[id^="qb-noreroll-"]', (e) => e.map((x) => x.textContent)); if (why.length !== 6 || why.some((w) => !/does not allow/.test(w))) throw new Error(`reasons: ${why}`);
        await page.click('#qb-cancel');
      });

      await run.do('after a reload and Continue the kept roll is found again with its event number, and no Roll button is offered', async () => {
        const sets = await rolls(); const was = await page.evaluate(() => window.hextable.state.scoreRolls['#seq']);
        await wait(page, () => localStorage.getItem('hextable.solo'));
        await page.reload(); await waitShown(page, '#lobby');
        await tap('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities);
        await openTab(page, 'dm'); await waitShown(page, '#tab-dm');
        await tap('#qb-add'); await waitShown(page, '#qb'); await openSec(page, 'scores'); await tap('#qb-method-roll');
        if (await page.$('#qb-roll')) throw new Error('a Roll button after a reload, beside a kept roll');
        const chips = await page.$$eval('.sc-chip', (c) => c.length); if (chips !== 6) throw new Error(`${chips} chips`);
        if (!new RegExp(`Rolled at the table \\(event ${was}\\)`).test(await txt('#qb-rule-text'))) throw new Error(`${await txt('#qb-rule-text')} (the game's counter is ${was})`);
        if (JSON.stringify(await rolls()) !== JSON.stringify(sets)) throw new Error('the roll changed');
        await shot('7-after-reload', '#qb-scores');
        await page.click('#qb-cancel');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  const wide = { viewport: { width: 1280, height: 800 } }, phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  await pass(browser, url, 'my characters on hexes at 1280x800', wide, 'hex');
  await pass(browser, url, 'my characters on squares at 390x844 with touch', phone, 'square');
  await pass(browser, url, 'my characters on hexes at 390x844 with touch', phone, 'hex');
  await pass(browser, url, 'my characters on squares at 1280x800', wide, 'square');
  await scoresPass(browser, url, 'ability scores in the build screen on hexes at 1280x800', wide, 'hex');
  await scoresPass(browser, url, 'ability scores in the build screen on squares at 390x844 with touch', phone, 'square');
  await gamePass(browser, url, 'ability scores rolled at the table in a game at 1280x800', wide, 'hex');
  await gamePass(browser, url, 'ability scores rolled at the table in a game at 390x844 with touch', phone, 'square');
  await scrollPass(browser, url, 'untrained armour and the scroll card in the build screen on hexes at 1280x800', wide, 'hex');
  await scrollPass(browser, url, 'untrained armour and the scroll card in the build screen on squares at 390x844 with touch', phone, 'square');
}
