import { join } from 'node:path';
import { scenario, wait, state, shown, waitShown, open, playSolo, settle, tapAt, onCanvas, closePanels, openTab, panelTab } from './lib.mjs';

// ---------- class features that need a choice (#170) ----------
// A cleric uses Divine Spark in each of its three modes, a druid takes a form and leaves it, a sorcerer
// casts with one Metamagic option and the Sorcery Points go down. Every control is driven by tapping.
async function classes(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const ids = {};
      const A = { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 16 };
      const sheets = {
        Cleo: { name: 'Cleo', class: 'cleric', level: 14, subclass: 'life', abilities: A, skills: ['insight', 'religion'], choices: {}, spells: [] },
        Dru: { name: 'Dru', class: 'druid', level: 14, subclass: 'land', abilities: A, skills: ['nature', 'perception'], choices: {}, spells: [] },
        Sorsha: { name: 'Sorsha', class: 'sorcerer', level: 15, subclass: 'draconic', abilities: { ...A, cha: 18 }, skills: ['arcana', 'insight'],
          choices: { metamagic: ['careful', 'quickened'], 'metamagic-10': ['heightened', 'transmuted'], 'elemental-affinity': 'fire' }, spells: ['fire-bolt', 'fireball', 'hold-person', 'haste', 'burning-hands'] },
      };
      const uses = (n, f) => state(page, (S, a) => S.entities[a[0]].uses[a[1]], [ids[n], f]);
      const pick = async (n) => { await closePanels(page); await tap(page, `#party button:has-text("${n}")`); await wait(page, (i) => window.hextable.state.entities[i] && !document.querySelector('#card').hidden, ids[n]); };
      // The Features tab holds a row for each class feature; the spell buttons and Metamagic are still in the tab with id `all` (T4b's).
      const feat = async (name) => { await panelTab(page, 'features'); await tap(page, `#ap-features [data-row]:has-text("${name}")`); };
      const spellsTab = async () => { await panelTab(page, 'all'); };
      const tapCreature = async (target) => {
        await settle(page, target);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), target);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('the target is off screen or under a panel');
        await tapAt(page, touch, pt.x, pt.y);
      };
      const newest = (since) => state(page, (S, n) => S.timeline.slice(n).map((e) => e.type), since);

      await run.do('a level 14 cleric, a level 14 druid and a level 15 sorcerer join the party', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async (sh) => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          let q = 0;
          for (const s of Object.values(sh)) { const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s))); h.act({ type: 'addCharacter', record: r.record, at: { q: -3 + q++, r: 4, z: 0 } }); }
        }, sheets);
        for (const n of Object.keys(sheets)) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n); ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n); }
      });

      await run.do('the cleric offers Divine Spark with a chooser of its three modes', async () => {
        await pick('Cleo');
        await feat('Divine Spark');
        await waitShown(page, '#cp .cp-card');
        const modes = await page.$$eval('#cp .cp-mode', (b) => b.map((x) => x.dataset.mode));
        if (modes.join() !== 'heal,radiant,necrotic') throw new Error(`modes: ${modes}`);
        const box = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[3] || box[2] > box[4]) throw new Error(`the panel does not fit: ${JSON.stringify(box)}`);
        const small = await page.$$eval('#cp .cp-mode', (b) => b.some((x) => x.getBoundingClientRect().height < 40));
        if (small) throw new Error('a mode button is too small to touch');
        await tap(page, '#cp-close'); await waitShown(page, '#cp', false);
      });

      for (const [mode, what] of [['heal', 'an ally'], ['radiant', 'a goblin'], ['necrotic', 'a goblin']]) {
        await run.do(`Divine Spark in ${mode} mode: armed with the mode, then a tap on ${what} sends it`, async () => {
          const target = what === 'an ally' ? ids.Dru : await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden).id);
          if (what !== 'an ally') await page.evaluate(([f, c]) => { const h = window.hextable; const S = h.state, e = S.entities[c]; h.act({ type: 'place', actor: f, to: { q: e.pos.q + 1, r: e.pos.r - 1 } }); }, [target, ids.Cleo]);
          const before = await uses('Cleo', 'channel-divinity'), tl = await state(page, (S) => S.timeline.length);
          await pick('Cleo'); await feat('Divine Spark');
          await tap(page, `#cp .cp-mode[data-mode="${mode}"]`);
          await wait(page, () => window.hextable.mode.kind === 'feature');
          const m = await page.evaluate(() => window.hextable.mode.extra?.mode); if (m !== mode) throw new Error(`armed with mode ${m}`);
          await tapCreature(target);
          await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['channel-divinity'] < b, [ids.Cleo, before]);
          const types = await newest(tl);
          if (types.includes('manual')) throw new Error(`the DM was handed it: ${types}`);
          if (!types.some((t) => t !== 'std')) throw new Error(`nothing happened beyond the announcement: ${types}`);
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), ids.Cleo).catch(() => {});
        });
      }

      await run.do('the druid takes a form from the list the engine offers, and the card and the sheet say so', async () => {
        await pick('Dru');
        await feat('Wild Shape');
        await waitShown(page, '#cp .cp-card');
        const forms = await page.$$eval('#cp-form option', (o) => o.map((x) => x.value));
        const bad = await page.evaluate(async (f) => { const { CONTENT } = await import('./shared/content/index.js'); return f.filter((id) => CONTENT.monsters[id].type !== 'beast' || CONTENT.monsters[id].cr > 1); }, forms);
        if (forms.length < 20 || !forms.includes('wolf') || bad.length) throw new Error(`forms: ${forms.length}, outside the druid's limits: ${bad}`);
        await page.selectOption('#cp-form', 'wolf');
        const before = await uses('Dru', 'wild-shape');
        await tap(page, '#cp-use');
        await wait(page, (i) => window.hextable.state.entities[i].form, ids.Dru);
        if (await uses('Dru', 'wild-shape') !== before - 1) throw new Error('the use was not spent');
        const form = await state(page, (S, i) => S.entities[i].form, ids.Dru);
        if ((form.block ?? form) !== 'wolf') throw new Error(`form: ${JSON.stringify(form)}`);
        if (!/Wolf form/.test(await page.$eval('#c-res', (x) => x.textContent))) throw new Error('the card does not say the druid is a wolf');
        await closePanels(page); await tap(page, '#btn-sheet'); await waitShown(page, '#sheet-form');
        if (!/form of a Wolf/.test(await page.$eval('#sheet-form', (x) => x.textContent))) throw new Error('the sheet banner');
        await tap(page, '#sheet [data-leave-form]');
        await wait(page, (i) => !window.hextable.state.entities[i].form, ids.Dru);
        if (await shown(page, '#sheet-form')) throw new Error('the banner stayed after leaving the form');
      });

      await run.do('a refusal is shown in the panel with the choice kept; a form is changed and left from the bar', async () => {
        await pick('Dru');
        await feat('Wild Shape'); await page.selectOption('#cp-form', 'brown-bear'); await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        if (!/room/.test(await page.$eval('#cp-err', (x) => x.textContent))) throw new Error('the engine\'s refusal is not in the panel');
        if ((await page.$eval('#cp-form', (x) => x.value)) !== 'brown-bear') throw new Error('the choice was not kept');
        await page.selectOption('#cp-form', 'boar'); await tap(page, '#cp-use');
        await wait(page, (i) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === 'boar', ids.Dru);
        await pick('Dru');
        await panelTab(page, 'features');
        if (!/Boar/.test(await page.$eval('#ap-features', (x) => x.textContent))) throw new Error('the Features tab does not say the druid is a boar');
        if (!/Boar/.test(await page.$eval('#c-res', (x) => x.textContent))) throw new Error('the status line does not say the druid is a boar');
        if (!(await state(page, (S, i) => S.entities[i].attacks.some((a) => /Gore|Tusk/i.test(a.name)), ids.Dru))) throw new Error('the creature has no attack of the form');       // Attacks is a fight tab; the fight smoke below lists them
        await feat('Wild Shape');
        if (!/Boar/.test(await page.$eval('#cp-form-now', (x) => x.textContent))) throw new Error('the panel does not say which form');
        await page.selectOption('#cp-form', 'panther'); await tap(page, '#cp-use');
        await wait(page, (i) => (window.hextable.state.entities[i].form?.block ?? window.hextable.state.entities[i].form) === 'panther', ids.Dru);
        await pick('Dru'); await feat('Wild Shape'); await tap(page, '#cp-leave');
        await wait(page, (i) => !window.hextable.state.entities[i].form, ids.Dru);
      });

      await run.do('the sorcerer casts Fire Bolt with Quickened Spell: the Metamagic panel shows the cost, the points go down', async () => {
        const foe = await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden).id);
        await page.evaluate(([f, c]) => { const h = window.hextable, e = h.state.entities[c]; h.act({ type: 'place', actor: f, to: { q: e.pos.q + 1, r: e.pos.r - 1 } }); }, [foe, ids.Sorsha]);
        // A goblin beside her: the fight starts now, and her first action waits for her turn.
        await page.evaluate((c) => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[c].pos }), ids.Sorsha);
        for (let k = 0; k < 40; k++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (!cur || cur === ids.Sorsha) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        const before = await uses('Sorsha', 'font-of-magic');
        await pick('Sorsha');
        await spellsTab(); await tap(page, '#actions button:has-text("Metamagic")');
        await waitShown(page, '#cp .cp-card');
        const opts = await page.$$eval('#cp [data-meta]', (b) => b.map((x) => x.dataset.meta));
        if (opts.join() !== 'careful,quickened,heightened,transmuted') throw new Error(`the options known: ${opts}`);
        await page.selectOption('#cp-spell', 'fire-bolt');
        const off = await page.$$eval('#cp [data-meta]', (b) => b.filter((x) => x.disabled).map((x) => x.dataset.meta).join());
        if (off !== 'careful,heightened') throw new Error(`a cantrip with an attack roll: Careful and Heightened should be greyed out, not: ${off}`);
        await tap(page, '#cp [data-meta="quickened"]');
        const extra = await page.$$eval('#cp [data-meta]', (b) => b.filter((x) => x.disabled).map((x) => x.dataset.meta).join());
        if (!/transmuted/.test(extra)) throw new Error(`one option a spell: the others should be greyed out: ${extra}`);
        const note = await page.$eval('#cp .cp-note', (x) => x.textContent);
        if (!new RegExp(`${before} Sorcery Points left; this costs 2, leaving ${before - 2}`).test(note)) throw new Error(`the note: ${note}`);
        await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'spell');
        if (!/Quickened: 2 SP/.test(await page.$eval('#hint-text', (x) => x.textContent))) throw new Error('the hint does not carry the Metamagic');
        const tl = await state(page, (S) => S.timeline.length);
        await tapCreature(foe);
        try { await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['font-of-magic'] === b - 2, [ids.Sorsha, before], 25000); }
        catch { throw new Error(`the cast did not go through; ${await page.evaluate(([f, c]) => { const h = window.hextable, S = h.state; return JSON.stringify([S.entities[f].pos, S.entities[f].hp, S.entities[c].pos, S.encounter?.order[S.encounter.turn]?.id === c, h.R.screenOf(S.entities[f].pos)]); }, [foe, ids.Sorsha])} toast: "${await page.$eval('#toast', (x) => x.hidden ? '' : x.textContent)}", points ${await uses('Sorsha', 'font-of-magic')} of ${before}, mode ${await page.evaluate(() => window.hextable.mode.kind)}`); }
        const types = await newest(tl);
        if (!types.includes('cast')) throw new Error(`no cast: ${types}`);
      });

      await run.do('Font of Magic: spending a slot for points, and a refusal in the engine\'s words when it is over the maximum', async () => {
        await page.evaluate(() => { if (window.hextable.state.encounter) window.hextable.act({ type: 'endEncounter' }); });       // the last cast may already have won it (the dice are not fixed)
        await wait(page, () => !window.hextable.state.encounter && window.hextable.waiting === 0, null, 25000);
        await pick('Sorsha');
        await panelTab(page, 'features'); await page.waitForSelector('#ap-features [data-row]:has-text("Font of Magic")', { timeout: 20000 });
        await feat('Font of Magic');
        await waitShown(page, '#cp .cp-card');
        await tap(page, '#cp [data-how="spend"]'); await tap(page, '#cp [data-level="3"]');
        await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        if (!/more than 15 points/.test(await page.$eval('#cp-err', (x) => x.textContent))) throw new Error('refusal not shown');
        const slots = await state(page, (S, i) => S.entities[i].slots[3], ids.Sorsha), pts = await uses('Sorsha', 'font-of-magic');
        await tap(page, '#cp [data-how="make"]'); await tap(page, '#cp [data-level="3"]');
        await tap(page, '#cp-use');
        await wait(page, ([i, n]) => window.hextable.state.entities[i].slots[3] === n + 1, [ids.Sorsha, slots]);
        if (await uses('Sorsha', 'font-of-magic') !== pts - 5) throw new Error('a level 3 slot should cost 5 points');
        await pick('Sorsha'); await feat('Font of Magic');
        await tap(page, '#cp [data-how="spend"]'); await tap(page, '#cp [data-level="1"]'); await tap(page, '#cp-use');
        await wait(page, ([i, n]) => window.hextable.state.entities[i].uses['font-of-magic'] === n + 1, [ids.Sorsha, pts - 5]);
      });

      await run.do('a paladin and a bard join once the fight is over', async () => {
        await page.evaluate(() => { if (window.hextable.state.encounter) window.hextable.act({ type: 'endEncounter' }); });       // the last cast may already have won it (the dice are not fixed)
        await wait(page, () => !window.hextable.state.encounter, null, 20000);
        sheets.Pala = { name: 'Pala', class: 'paladin', level: 13, subclass: 'devotion', abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, skills: ['athletics', 'persuasion'], choices: {}, spells: [] };
        sheets.Bardo = { name: 'Bardo', class: 'bard', level: 13, subclass: 'lore', abilities: { ...A, cha: 18 }, skills: ['arcana', 'history', 'performance'], choices: {}, spells: [] };
        await page.evaluate(async (sh) => {
          const D = await import('./shared/derive.js'), h = window.hextable; let q = 0;
          for (const s of [sh.Pala, sh.Bardo]) { const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s))); h.act({ type: 'addCharacter', record: r.record, at: { q: -3 + q++, r: 5, z: 0 } }); }
        }, sheets);
        for (const n of ['Pala', 'Bardo']) { await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n); ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n); }
      });

      await run.do('Lay On Hands: a refused condition shows in the panel, then the pool pays for the Hit Points', async () => {
        await pick('Pala');
        await feat('Lay On Hands');
        await waitShown(page, '#cp .cp-card');
        await page.fill('#cp-amount', '5');
        await tap(page, '#cp [data-cure="poisoned"]');
        await tap(page, '#cp-use');
        await waitShown(page, '#cp-err');
        const err = await page.$eval('#cp-err', (x) => x.textContent);
        if (!/not poisoned|does not|isn't/i.test(err)) throw new Error(`the refusal: ${err}`);
        if (!(await page.$eval('#cp [data-cure="poisoned"]', (x) => x.checked)) || (await page.$eval('#cp-amount', (x) => x.value)) !== '5') throw new Error('the choice was not kept');
        const before = await uses('Pala', 'lay-on-hands');
        await tap(page, '#cp [data-cure="poisoned"]'); await tap(page, '#cp-use');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['lay-on-hands'] === b - 5, [ids.Pala, before], 25000);
      });

      await run.do('Divine Intervention: the cleric picks a spell from the list and casts it with no slot', async () => {
        await pick('Cleo');
        await feat('Divine Intervention');
        await waitShown(page, '#cp .cp-card');
        const spells = await page.$$eval('#cp-spell option', (o) => o.map((x) => x.value));
        if (spells.length < 5 || !spells.includes('cure-wounds')) throw new Error(`the list: ${spells}`);
        await page.selectOption('#cp-spell', 'cure-wounds');
        await tap(page, '#cp-use');
        await wait(page, () => window.hextable.mode.kind === 'spell' && /no spell slot/.test(document.getElementById('hint-text').textContent));
        const before = await uses('Cleo', 'divine-intervention'), slots = await state(page, (S, i) => JSON.stringify(S.entities[i].slots), ids.Cleo);
        await tapCreature(ids.Pala);
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['divine-intervention'] === b - 1, [ids.Cleo, before], 25000);
        if ((await state(page, (S, i) => JSON.stringify(S.entities[i].slots), ids.Cleo)) !== slots) throw new Error('a spell slot was spent');
      });

      await run.do('Bardic Inspiration: arm it and tap an ally', async () => {
        await pick('Bardo');
        const before = await uses('Bardo', 'bardic-inspiration');
        await feat('Bardic Inspiration');
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapCreature(ids.Pala);
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['bardic-inspiration'] === b - 1, [ids.Bardo, before], 25000);
        await pick('Bardo'); await tap(page, '#btn-sheet'); await waitShown(page, '#sheet-reactions');
        const rx = await page.$$eval('#sheet-reactions [data-rx-set]', (e) => e.map((x) => x.dataset.rxSet));
        if (!rx.includes('countercharm')) throw new Error(`reactions on the bard's sheet: ${rx}`);
      });

      await run.do('the DM\'s Short Rest offers Sorcerous Restoration, and the points come back', async () => {
        const pts = await uses('Sorsha', 'font-of-magic');
        if (pts >= 15) throw new Error('the sorcerer has spent no points to get back');
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await tap(page, '#dm-short-rest');
        await waitShown(page, `#sr-restore-${ids.Sorsha}`);
        await page.check(`#sr-restore-${ids.Sorsha}`);
        await tap(page, '#dm-short-go');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].uses['font-of-magic'] > b, [ids.Sorsha, pts], 25000);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=classes.
export default async function (browser, url) {
  await classes(browser, url, 'class controls at 1280x800', { viewport: { width: 1280, height: 800 } });
  await classes(browser, url, 'class controls at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
