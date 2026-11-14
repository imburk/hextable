import { sleep, scenario, wait, state, shown, waitShown, open } from './lib.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

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
  for (const k of ['athletics', 'perception']) await page.check(`#qb-skill-${k}`);
  const style = await page.$('#qb-choice-fighting-style'); if (style) await page.selectOption('#qb-choice-fighting-style', 'defense');
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
        await page.uncheck('#qb-skill-perception'); await page.check('#qb-skill-survival');
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
      } finally { await ctx2.close(); }
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  const wide = { viewport: { width: 1280, height: 800 } }, phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  await pass(browser, url, 'my characters on hexes at 1280x800', wide, 'hex');
  await pass(browser, url, 'my characters on squares at 390x844 with touch', phone, 'square');
  await pass(browser, url, 'my characters on hexes at 390x844 with touch', phone, 'hex');
  await pass(browser, url, 'my characters on squares at 1280x800', wide, 'square');
}
