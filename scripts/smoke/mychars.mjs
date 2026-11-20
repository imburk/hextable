import { sleep, scenario, wait, state, shown, waitShown, open } from './lib.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { validate } from '../../packages/rules/src/derive.js';
import { rollScores } from '../../packages/rules/src/scores.js';
import { keyedRng } from '../../packages/rules/src/rng.js';

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
        await page.fill('#qb-name', name); await page.selectOption('#qb-class', 'fighter');
        for (const k of ['athletics', 'perception']) await page.check(`#qb-skill-${k}`);
        const style = await page.$('#qb-choice-fighting-style'); if (style) await page.selectOption('#qb-choice-fighting-style', 'defense');
      };
      const saveable = () => wait(page, () => document.querySelector('#qb-save') && !document.querySelector('#qb-save').disabled && document.querySelectorAll('#qb-problems li').length === 0);
      const fresh = async () => { await tap('#lobby-party > summary').catch(() => {}); if (!(await shown(page, '#lobby-mychars'))) await tap('#lobby-party > summary'); await tap('#lobby-mychars'); await waitShown(page, '#mychars'); await tap('#mc-new'); await waitShown(page, '#qb'); };
      const val = (sel) => page.inputValue(sel);
      const txt = (sel) => text(page, sel);

      await run.do('the score section offers four ways to make the scores, each button at least 44 px, and opens on "Enter by hand"', async () => {
        await open(page, url, { grid }); await fresh();
        const ids = await page.$$eval('.sc-method', (b) => b.map((x) => `${x.id}:${x.textContent}:${x.getAttribute('aria-pressed')}`));
        if (ids.join() !== 'qb-method-standard:Standard array:false,qb-method-pointcost:Point cost:false,qb-method-roll:Roll:false,qb-method-hand:Enter by hand:true') throw new Error(`methods: ${ids}`);
        const small = await heightOk(page, '#qb-scores button'); if (small.length) throw new Error(`small buttons: ${small}`);
        if (!(await page.$('#qb-abil-str'))) throw new Error('no typed boxes');
        await shot('1-hand');
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
        await tap('#qb-suggest');
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
        await saveable(); await shot('3-pointcost', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const s = (await sheets()).at(-1);
        if (s.scores.method !== 'pointcost' || s.scores.base.con !== 14 || validate(s).length) throw new Error(`sheet ${JSON.stringify(s.scores)} ${validate(s)}`);
      });

      await run.do('roll: the rule first (every score, once; the higher stands), then the dice; six rolls, each can be rolled again once, the page says what the DM sees', async () => {
        await tap('#mc-new'); await waitShown(page, '#qb'); await fill('Rolla Kerr'); await tap('#qb-method-roll');
        if (!/No score may be rolled again/.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        await page.selectOption('#qb-rule-reroll', 'each'); await page.selectOption('#qb-rule-result', 'higher');
        if (!/Every score may be rolled again, once\. The higher of the two stands/.test(await txt('#qb-rule-text'))) throw new Error(await txt('#qb-rule-text'));
        await shot('4a-roll-rule', '#qb-scores');
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
        await saveable(); await shot('4-roll', '#qb-scores');
        await page.click('#qb-save'); await waitShown(page, '#qb', false);
        const s = (await sheets()).at(-1);
        if (s.scores.method !== 'roll' || s.scores.by !== 'device' || JSON.stringify(s.scores.rule) !== '{"reroll":"each","result":"higher"}' || validate(s).length) throw new Error(`sheet ${JSON.stringify(s.scores)} ${validate(s)}`);
        if (JSON.stringify(s.scores.rolls[0].dice) !== JSON.stringify(first[0]) || JSON.stringify(s.scores.rolls[1].dice) !== JSON.stringify(first[1])) throw new Error('the dice on the sheet are not the dice rolled');
        if (await page.evaluate(() => localStorage.getItem('hextable.scoreroll'))) throw new Error('the kept roll was not used up by saving');
        if (!/Rolled on a device/.test(await text(page, '.mc-row:last-child .mc-scores'))) throw new Error(await text(page, '.mc-row:last-child .mc-scores'));
      });

      await run.do('opening the saved roll again: the same dice, no roll button, and no roll can be rolled again', async () => {
        await tap('.mc-row:last-child [id^="mc-edit-"]'); await waitShown(page, '#qb');
        if ((await page.getAttribute('#qb-method-roll', 'aria-pressed')) !== 'true') throw new Error('it did not open on its method');
        if (await page.$('#qb-roll')) throw new Error('a saved roll offers a new roll');
        if (await page.$('[id^="qb-reroll-"]')) throw new Error('a saved roll can be rolled again');
        if (!/saved with these rolls/.test(await txt('#qb-noreroll-1'))) throw new Error(await txt('#qb-noreroll-1'));
        await shot('5-edit', '#qb-scores');
        await page.click('#qb-cancel');
      });

      await run.do('a roll made and not saved stays on the device: closing the panel is not a new roll; "below 10" lets only a low score be rolled again', async () => {
        await tap('#mc-new'); await waitShown(page, '#qb'); await tap('#qb-method-roll');
        await page.selectOption('#qb-rule-reroll', 'below'); if ((await val('#qb-rule-below')) !== '10') throw new Error('below defaults to 10');
        await tap('#qb-roll'); await waitShown(page, '#qb-chips');
        const open = await page.$$eval('[id^="qb-reroll-"]', (b) => b.map((x) => +x.id.slice(10)));
        const lows = first.map(topOf).flatMap((n, i) => (n < 10 ? [i] : []));
        if (open.join() !== lows.join()) throw new Error(`rerollable ${open}, expected ${lows} of ${first.map(topOf)}`);
        const why = await page.$$eval('[id^="qb-noreroll-"]', (e) => e.map((x) => x.textContent)); if (why.length + open.length !== 6 || why.some((w) => !/is not below 10/.test(w))) throw new Error(`reasons: ${why}`);
        await page.click('#qb-cancel'); await tap('#mc-new'); await waitShown(page, '#qb'); await tap('#qb-method-roll');
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
}
