import { pathToFileURL } from 'node:url';
import { placeBeside, scenario, wait, state, shown, waitShown, open, playSolo, closePanels, panelTab, ROOT } from './lib.mjs';

// ---------- features that cost a spell slot, priced Wild Shape forms, a slot for any caster (#522, DEBT T86 and T88) ----------
// A homebrew pack invented for this pass ("Lantern Folk": an Oath of the Lantern for a paladin and a Circle of the Store for a druid) is kept in the browser the way the pack manager
// keeps one (`hextable.solo.packs`), so the game opens with it. The paladin uses a feature that costs a slot on itself (a level chosen on a card, a higher slot adding dice), one that
// is aimed at a goblin (armed with the slot, a tap sends it), one a slot restores (Hurl Through Hell's card for a creature that is not Pact Magic's), and then has no slot left: its row is
// greyed with the engine's words. The druid's Wild Shape card prices the circle's elemental forms in the circle's own pool, shows how many are left, and marks a form it cannot pay as not
// available, with the reason, while the beasts stay as they were. Names hold a "&" to see that what the cards draw is escaped. Run at desktop size and at phone size with touch;
// SMOKE_SHOTS=<dir> keeps a screenshot of each card. The tap on the goblin goes through the renderer's own handler (`R.onTap`), as homebrew.mjs does; the camera and picking are other passes'.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const KEY = 'hextable.solo.packs';

const P = 'lantern-folk', hb = (n) => `hb-${P}-${n}`;
const feature = (id, name, level, grants, more = {}) => ({ id: hb(id), name, level, tier: 'auto', checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: `homebrew:${P}`, checked: false, text: 'Sworn to keep a lamp lit.', features });
const MEND = { action: { time: 'bonus', target: { self: true }, effects: [{ heal: '1d8' }], cost: { slot: 1, higher: { heal: '1d8' } } } };
const FLARE = { action: { time: 'action', target: { creature: { range: [30, 30] } }, effects: [{ damage: '2d6', type: 'radiant' }], cost: { slot: 2, higher: { damage: '1d6' } } } };
const RELIGHT = { action: { time: 'bonus', target: { self: true }, effects: [{ tempHp: '2d4' }], orSlot: true } };
const DOC = {
  format: 'hextable-pack', v: 1, pack: { id: P, name: 'Lantern Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for a smoke test.' },
  subclasses: [
    sub('oath-of-the-lantern', 'Oath of the Lantern', 'paladin', [
      feature('lantern-mend', 'Mend & Mind', 3, MEND), feature('lantern-flare', 'Lantern Flare', 3, FLARE, { uses: { max: 2, recharge: 'long' } }),
      feature('lantern-relight', 'Relight', 3, RELIGHT, { uses: { max: 1, recharge: 'long' } })]),
    sub('circle-of-the-store', 'Circle of the Store', 'druid', [
      feature('ember-store', 'Ember & Store', 3, undefined, { tier: 'manual', uses: { max: 3, recharge: 'long' } }),
      feature('store-shape', 'Store Shape', 3, { formOf: { of: 'wild-shape', maxCr: 2, types: ['elemental'], cost: { resource: hb('ember-store') } } })]),
  ],
};
const SHEETS = {
  Wick: { name: 'Wick', class: 'paladin', level: 9, subclass: hb('oath-of-the-lantern'), abilities: { str: 16, dex: 10, con: 14, int: 12, wis: 14, cha: 16 }, skills: ['athletics', 'religion'],
    choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'], spells: ['bless', 'cure-wounds', 'aid'] },
  Ven: { name: 'Ven', class: 'druid', level: 6, subclass: hb('circle-of-the-store'), abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ['nature', 'perception'],
    choices: { 'primal-order': 'warden' }, armour: 'leather-armor', shield: true, weapons: ['quarterstaff'], spells: ['produce-flame', 'cure-wounds'] },
};

async function slotforms(browser, url, label, opts, tag) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const { hashOf } = await import(pathToFileURL(`${ROOT}packages/rules/src/content/packs.js`));
      await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }, [KEY, JSON.stringify([{ id: P, version: 1, hash: hashOf(DOC), data: DOC }])]);
      const page = await ctx.newPage();
      run.watch(page);
      const ids = {};
      const mine = (n) => ids[n];
      const slots = (n) => state(page, (S, i) => S.entities[i].slots, mine(n));
      const uses = (n, f) => state(page, (S, a) => S.entities[a[0]].uses[a[1]], [mine(n), f]);
      const hp = (i) => state(page, (S, x) => S.entities[x].hp, i);
      const tl = () => state(page, (S) => S.timeline.length);
      const since = (k) => state(page, (S, n) => S.timeline.slice(n), k);
      const pick = async (n) => { await closePanels(page); await tap(page, `#party button:has-text("${n}")`); await wait(page, (i) => window.hextable.state.entities[i] && !document.querySelector('#card').hidden, mine(n)); };
      const row = (name) => `#ap-features [data-row]:has-text("${name}")`;
      const feat = async (name) => { await panelTab(page, 'features'); await tap(page, row(name)); };
      const card = async () => { await waitShown(page, '#cp .cp-card'); };
      // The card must be inside the screen and its buttons big enough to touch.
      const fits = async (what) => {
        const b = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
        if (b[0] < 0 || b[1] > b[4] || b[2] < 0 || b[3] > b[5]) throw new Error(`${what}: the card does not fit the screen: ${JSON.stringify(b)}`);
        const small = await page.$$eval('#cp .cp-card button', (l) => l.filter((x) => x.getBoundingClientRect().height < 40).map((x) => x.textContent));
        if (small.length) throw new Error(`${what}: too small to touch: ${small}`);
      };
      const tapOn = (id) => page.evaluate((i) => { const e = window.hextable.state.entities[i]; window.hextable.R.onTap({ hex: { q: e.pos.q, r: e.pos.r }, id: i }); }, id);

      await run.do('a paladin of the invented oath and a druid of the invented circle join the party; the game opened with the pack', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async (sh) => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          let q = 0;
          for (const s of Object.values(sh)) { const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s))); h.act({ type: 'addCharacter', record: r.record, at: { q: -3 + q++, r: 4, z: 0 } }); }
        }, SHEETS);
        for (const n of Object.keys(SHEETS)) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n); ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n); }
      });

      await run.do('the Features row of Mend & Mind says it spends a slot, the lowest level and what a higher slot adds; the name is as written', async () => {
        await pick('Wick'); await panelTab(page, 'features');
        const t = await page.$eval(row('Mend & Mind'), (x) => x.innerText);
        if (!/Mend & Mind/.test(t) || !/spends a spell slot \(level 1\+\)/.test(t) || !/\+1d8 healing per level above 1/.test(t)) throw new Error(`the row says: ${t}`);
        if (await page.$eval(row('Mend & Mind'), (x) => x.getAttribute('aria-disabled')) !== 'false') throw new Error('the row is greyed with slots left');
        const f = await page.$eval(row('Lantern Flare'), (x) => x.innerText);
        if (!/spends a spell slot \(level 2\+\)/.test(f) || !/\+1d6 damage per level above 2/.test(f) || !/2 \/ 2/.test(f)) throw new Error(`the Flare row says: ${f}`);
        await shot(page, `slotforms-row-${tag}`);
      });

      await run.do('the card lists the levels at or above the lowest with a slot left, with what each adds; a level 3 slot is chosen and spent, and the use goes through the engine', async () => {
        const before = await slots('Wick'), n = await tl();
        await tap(page, row('Mend & Mind')); await card();
        if (await page.$eval('#cp-title', (x) => x.textContent) !== 'Mend & Mind') throw new Error('the title is not the name as written');
        const levels = await page.$$eval('#cp [data-level]', (b) => b.map((x) => [Number(x.dataset.level), x.textContent]));
        const want = Object.entries(before).filter(([, c]) => c > 0).map(([l]) => Number(l));
        if (levels.map((l) => l[0]).join() !== want.join()) throw new Error(`levels ${levels.map((l) => l[0])}, slots ${JSON.stringify(before)}`);
        if (!levels.find((l) => l[0] === 3)?.[1].includes('+2d8 healing')) throw new Error(`level 3 does not say what it adds: ${JSON.stringify(levels)}`);
        if (levels.find((l) => l[0] === 1)?.[1].includes('+')) throw new Error('the lowest level adds something');
        if ((await page.$$eval('#cp [data-level][aria-pressed="true"]', (b) => b.map((x) => x.dataset.level))).join() !== '1') throw new Error('the lowest level is not chosen first');
        await fits('Mend'); await shot(page, `slotforms-mend-${tag}`);
        await tap(page, '#cp [data-level="3"]');
        if ((await page.$$eval('#cp [data-level][aria-pressed="true"]', (b) => b.map((x) => x.dataset.level))).join() !== '3') throw new Error('level 3 is not chosen');
        await tap(page, '#cp-use');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].slots[3] < b, [mine('Wick'), before[3]]);
        const after = await slots('Wick');
        if (after[3] !== before[3] - 1 || after[1] !== before[1] || after[2] !== before[2]) throw new Error(`slots ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
        const ev = await since(n);
        if (!ev.some((e) => /spent a level 3 spell slot/.test(e.action ?? ''))) throw new Error(`no event for the slot: ${JSON.stringify(ev.map((e) => e.type))}`);
        if (await shown(page, '#cp')) throw new Error('the card stayed open');
      });

      await run.do('Lantern Flare is aimed: the card arms it with the chosen slot, and a tap on a goblin sends it with `slot`', async () => {
        const goblin = await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden).id);
        await placeBeside(page, goblin, mine('Wick'));
        const before = await slots('Wick'), hp0 = await hp(goblin), f0 = await uses('Wick', hb('lantern-flare'));
        await pick('Wick'); await feat('Lantern Flare'); await card();
        const lv = await page.$$eval('#cp [data-level]', (b) => b.map((x) => Number(x.dataset.level)));
        if (lv.includes(1)) throw new Error(`the Flare's lowest level is 2, the card offers ${lv}`);
        await fits('Flare'); await shot(page, `slotforms-flare-${tag}`);
        const pickLevel = lv.includes(3) && before[3] > 0 ? 3 : lv[0];
        await tap(page, `#cp [data-level="${pickLevel}"]`);
        if (!/Choose target/.test(await page.textContent('#cp-use'))) throw new Error('an aimed feature does not say it chooses a target');
        await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'feature');
        const x = await page.evaluate(() => window.hextable.mode.extra?.slot); if (x !== pickLevel) throw new Error(`armed with slot ${x}, chose ${pickLevel}`);
        const n = await tl();
        await tapOn(goblin);
        await wait(page, ([i, l, b]) => window.hextable.state.entities[i].slots[l] < b, [mine('Wick'), pickLevel, before[pickLevel]]);
        const ev = await since(n);
        if (!ev.some((e) => e.type === 'damage' || e.type === 'save')) throw new Error(`the Flare did nothing: ${JSON.stringify(ev.map((e) => e.type))}`);
        if (!(await hp(goblin) < hp0)) throw new Error('the goblin was not hurt');
        if (await uses('Wick', hb('lantern-flare')) !== f0 - 1) throw new Error('the feature\'s own use was not spent');
      });

      await run.do('Relight, a use a slot restores: with its use spent, the card lists the paladin\'s spell slots, and the slot chosen restores it', async () => {
        await pick('Wick'); await feat('Relight'); await card();
        if (!/1 use left/.test(await page.textContent('#cp .cp-card'))) throw new Error('the card does not say a use is left');
        await tap(page, '#cp-use'); await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapOn(mine('Wick'));
        await wait(page, (i) => window.hextable.state.entities[i].uses['hb-lantern-folk-lantern-relight'] === 0, mine('Wick'));
        const before = await slots('Wick');
        await pick('Wick'); await feat('Relight'); await card();
        const levels = await page.$$eval('#cp [data-level]', (b) => b.map((x) => Number(x.dataset.level)));
        const want = Object.entries(before).filter(([, c]) => c > 0).map(([l]) => Number(l));
        if (levels.join() !== want.join() || levels.length < 2) throw new Error(`the card lists ${levels}, the paladin has ${JSON.stringify(before)}`);
        if (!/Spell slot to spend/.test(await page.textContent('#cp [data-part="slot"]'))) throw new Error('the card does not name a spell slot');
        await fits('Relight'); await shot(page, `slotforms-relight-${tag}`);
        await tap(page, '#cp [data-level="2"]'); await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapOn(mine('Wick'));
        await wait(page, ([i, b]) => window.hextable.state.entities[i].slots[2] < b, [mine('Wick'), before[2]]);
      });

      await run.do('with no slot left the row is greyed with the engine\'s words, and a tap on it opens no card', async () => {
        await closePanels(page);
        for (let k = 0; k < 12 && Object.values(await slots('Wick')).some((c) => c > 0); k++) {
          await page.evaluate((i) => window.hextable.act({ type: 'feature', actor: i, feature: 'hb-lantern-folk-lantern-mend' }), mine('Wick'));
          await wait(page, () => true); await new Promise((r) => setTimeout(r, 120));
        }
        if (Object.values(await slots('Wick')).some((c) => c > 0)) throw new Error('the slots were not used up');
        await pick('Wick'); await panelTab(page, 'features');
        const t = await page.$eval(row('Mend & Mind'), (x) => x.innerText);
        if (!/has no spell slot of level 1 or higher left for Mend & Mind\./.test(t)) throw new Error(`the row says: ${t}`);
        if (await page.$eval(row('Mend & Mind'), (x) => x.getAttribute('aria-disabled')) !== 'true') throw new Error('the row is not greyed');
        await shot(page, `slotforms-noslot-${tag}`);
        await page.$eval(row('Mend & Mind'), (x) => x.click());               // Playwright will not click an aria-disabled button; a person's tap lands all the same
        await new Promise((r) => setTimeout(r, 300));
        if (await shown(page, '#cp .cp-card')) throw new Error('a card opened for a feature that cannot be paid');
      });

      await run.do('Wild Shape prices the circle\'s elemental forms in the circle\'s pool, with the count left, and the beasts stay as they were', async () => {
        await pick('Ven'); await feat('Wild Shape'); await card();
        const opts2 = await page.$$eval('#cp-form option', (o) => o.map((x) => [x.value, x.textContent]));
        const az = opts2.find((o) => o[0] === 'azer-sentinel'), wolf = opts2.find((o) => o[0] === 'wolf');
        if (!az || !wolf) throw new Error(`forms: ${opts2.length}`);
        if (!/1 use of Ember & Store \(3 left\)/.test(az[1])) throw new Error(`the Azer Sentinel option says: ${az[1]}`);
        if (!/1 use of Wild Shape \(\d left\)/.test(wolf[1])) throw new Error(`the Wolf option says: ${wolf[1]}`);
        await page.selectOption('#cp-form', 'azer-sentinel');
        const price = await page.textContent('#cp-form-price');
        if (price !== 'Costs 1 use of Ember & Store; Ven has 3 left.') throw new Error(`price: ${price}`);
        await fits('Wild Shape'); await shot(page, `slotforms-form-${tag}`);
        const ws = await uses('Ven', 'wild-shape'), em = await uses('Ven', hb('ember-store'));
        await tap(page, '#cp-use');
        await wait(page, (i) => window.hextable.state.entities[i].form, mine('Ven'));
        if (await uses('Ven', hb('ember-store')) !== em - 1 || await uses('Ven', 'wild-shape') !== ws) throw new Error('the price was not paid from the circle\'s pool');
      });

      await run.do('a form it cannot pay is marked not available with the engine\'s reason, its button is off, and a beast is still offered and taken', async () => {
        for (const f of ['magmin', 'azer-sentinel']) {            // the other two uses of the pool, a form changed for each
          await pick('Ven'); await feat('Wild Shape'); await card();
          await page.selectOption('#cp-form', f); await tap(page, '#cp-use');
          await wait(page, ([i, g]) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === g, [mine('Ven'), f]);
        }
        if (await uses('Ven', hb('ember-store')) !== 0) throw new Error(`the pool: ${await uses('Ven', hb('ember-store'))}`);
        await pick('Ven'); await feat('Wild Shape'); await card();
        const first = await page.$eval('#cp-form', (x) => x.value), ok0 = await page.$eval('#cp-form option:checked', (x) => x.dataset.ok);
        if (ok0 !== 'true') throw new Error(`the form chosen first is not one that can be paid: ${first}`);
        await page.selectOption('#cp-form', 'magmin');
        const opt = await page.$eval('#cp-form option[value="magmin"]', (x) => x.textContent);
        if (!/not available/.test(opt)) throw new Error(`the option says: ${opt}`);
        const why = await page.textContent('#cp-form-price');
        if (why !== 'Not available: Ven has 0 uses of Ember & Store left; the form of a Magmin costs 1.') throw new Error(`reason: ${why}`);
        if (!(await page.$eval('#cp-use', (x) => x.disabled))) throw new Error('the button is not off for a form that cannot be paid');
        await fits('Wild Shape, pool empty'); await shot(page, `slotforms-form-empty-${tag}`);
        await page.selectOption('#cp-form', 'wolf');
        if (await page.$eval('#cp-use', (x) => x.disabled)) throw new Error('the button stayed off for a beast');
        if (!/Wild Shape/.test(await page.textContent('#cp-form-price'))) throw new Error('a beast is not priced in Wild Shape');
        const ws = await uses('Ven', 'wild-shape');
        await tap(page, '#cp-use');
        await wait(page, (i) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === 'wolf', mine('Ven'));
        if (await uses('Ven', 'wild-shape') !== ws - 1) throw new Error('the beast did not cost a use of Wild Shape');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await slotforms(browser, url, 'slot-cost features, priced forms and a slot for any caster at desktop size', DESKTOP, 'desktop');
  await slotforms(browser, url, 'slot-cost features, priced forms and a slot for any caster at phone size with touch', PHONE, 'phone');
}
