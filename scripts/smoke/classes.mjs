import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { martial } from './paneltabs.mjs';
import { scenario, sleep, wait, state, shown, waitShown, open, playSolo, settle, tapAt, onCanvas, closePanels, openTab, panelTab } from './lib.mjs';

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
      // The Features tab holds a row for each class feature; the spells and Metamagic are rows of the Spells tab.
      const feat = async (name) => { await panelTab(page, 'features'); await tap(page, `#ap-features [data-row]:has-text("${name}")`); };
      const spellsTab = async () => { await panelTab(page, 'spells'); };
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
        if (!(await state(page, (S, i) => (S.entities[i].actions ?? S.entities[i].attacks ?? []).some((a) => /Gore|Tusk/i.test(a.name)), ids.Dru))) throw new Error('the creature has no attack of the form');       // Attacks is a fight tab; the fight smoke below lists them
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
        await spellsTab(); await tap(page, '#ap-spells [data-row="metamagic"]');
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

// ---------- caster classes at levels 7 to 15 (#302, DEBT C16 and C10) ----------
// A level 14 wizard (Empowered Evocation, Overchannel, Arcane Recovery), a level 15 warlock (Repelling Blast, Armor of Shadows, Mystic Arcanum, Hurl Through Hell) and a
// level 11 ranger (Superior Hunter's Prey): each chooser is opened by tapping its row, the choice is made on the card, and what the engine did is read from the timeline.
// Then the DM's Short Rest brings slots back, and the build screen's invocation list is looked at. Screenshots are left in /tmp/caster-screens.
export async function casters(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, size = touch ? 'phone' : 'desktop', tap = (page, sel) => (touch ? page.locator(sel).tap() : page.click(sel));
    mkdirSync('/tmp/caster-screens', { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => page.screenshot({ path: `/tmp/caster-screens/${size}-${n}.png` });
      const ids = {};
      const step = (name, fn) => run.do(name, async () => { try { await fn(); } catch (e) { await page.screenshot({ path: `/tmp/caster-screens/${size}-failed.png` }).catch(() => {}); throw e; } });
      const A = { str: 10, dex: 14, con: 14, int: 10, wis: 14, cha: 10 };
      const sheets = {
        Wyn: { name: 'Wyn', class: 'wizard', level: 14, subclass: 'evoker', abilities: { ...A, int: 20 }, skills: ['arcana', 'history'], choices: {}, spells: ['fire-bolt', 'fireball', 'magic-missile', 'shield'] },
        Mor: { name: 'Mor', class: 'warlock', level: 15, subclass: 'fiend', abilities: { ...A, cha: 18 }, skills: ['arcana', 'deception'], spells: ['eldritch-blast'],
          choices: { 'eldritch-invocations': ['agonizing-blast-eldritch-blast', 'repelling-blast-eldritch-blast', 'armor-of-shadows', 'fiendish-vigor', 'eldritch-spear-eldritch-blast'],
            'fiendish-resilience': 'fire', 'mystic-arcanum': 'circle-of-death', 'mystic-arcanum-7': 'finger-of-death', 'mystic-arcanum-8': 'dominate-monster' } },
        Ash: { name: 'Ash', class: 'ranger', level: 11, subclass: 'hunter', abilities: { ...A, dex: 18, wis: 16 }, skills: ['stealth', 'survival', 'perception'], weapons: ['longbow', 'shortsword'], choices: {}, spells: ['hunters-mark'] },
      };
      const ev = (fn, a) => page.evaluate(fn, a);
      // A dice tray (an Initiative roll for a goblin that joined) can sit over the controls for a moment: wait until the one to tap is on top.
      const onTop = async (sel) => {
        const loc = page.locator(sel).first();
        for (let k = 0; k < 80; k++) {
          await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          const box = await loc.boundingBox().catch(() => null);
          if (box && (await loc.evaluate((el, [x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (el === t || el.contains(t)); }, [box.x + box.width / 2, box.y + box.height / 2]).catch(() => false))) return;
          await sleep(250);
        }
        await page.screenshot({ path: `/tmp/caster-screens/${size}-failed.png` });
        throw new Error(`${sel} stayed covered`);
      };
      const pick = async (n) => { await closePanels(page); await onTop(`#party button:has-text("${n}")`); await tap(page, `#party button:has-text("${n}")`); await waiting((i) => window.hextable.state.entities[i] && !document.querySelector('#card').hidden, ids[n], 8000); };
      const feat = async (name) => { await panelTab(page, 'features'); for (let k = 0; k < 4; k++) { await onTop(`#ap-features [data-row]:has-text("${name}")`); await tap(page, `#ap-features [data-row]:has-text("${name}")`); if (await waitShown(page, '#cp .cp-card', true, 2500).then(() => true, () => false)) return; }   // a tap while the list is still scrolling can miss
        await waitShown(page, '#cp .cp-card'); };
      const card = async (why) => {                                        // the card is open, whole on screen, and its buttons are large enough to touch
        await waitShown(page, '#cp .cp-card');
        const box = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[4] || box[2] < 0 || box[3] > box[5]) throw new Error(`the card does not fit (${why}): ${JSON.stringify(box)}`);
        const small = await page.$$eval('#cp button', (b) => b.filter((x) => x.getBoundingClientRect().height < 40).map((x) => x.textContent));
        if (small.length) throw new Error(`a button is too small to touch (${why}): ${small}`);
      };
      // When a wait runs out: what the page said meanwhile (the toast and the hint), so a failure reads as a cause.
      const said = () => page.evaluate(() => `toast "${document.getElementById('toast')?.textContent ?? ''}", hint "${document.getElementById('hint-text')?.textContent ?? ''}", last events ${JSON.stringify(window.hextable.state.timeline.slice(-4).map((e) => [e.type, e.text ?? e.spell ?? e.error ?? '']))}`);
      const waiting = async (fn, arg, timeout = 15000) => { try { await wait(page, fn, arg, timeout); } catch (e) { await page.screenshot({ path: `/tmp/caster-screens/${size}-failed.png` }); throw new Error(`${String(e.message).split('\n')[0]}: ${await said()}`); } };
      const tl = () => state(page, (S) => S.timeline.length);
      const since = (n) => state(page, (S, k) => S.timeline.slice(k), n);
      const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
      const tapCreature = async (target) => {
        await settle(page, target);
        let pt = null;
        for (let k = 0; k < 40; k++) {                                       // a dice tray (an Initiative roll) may cover it for a moment
          pt = await ev((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), target);
          if (pt && (await onCanvas(page, pt.x, pt.y))) break;
          await sleep(250);
        }
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) { await page.screenshot({ path: `/tmp/caster-screens/${size}-failed.png` }); throw new Error(`the target is off screen or under a panel: ${JSON.stringify(pt)}`); }
        await tapAt(page, touch, pt.x, pt.y);
      };
      // A goblin next to `who`, on the free hex around it that shows furthest from it on the screen (one behind its pawn cannot be tapped); returns its id.
      const foeBeside = async (who, hp = 500) => {
        await settle(page, who);
        const before = await state(page, (S) => Object.keys(S.entities));
        const around = await ev((i) => {
          const h = window.hextable, e = h.state.entities[i], me = h.R.screenOf(e.pos);
          return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => { const at = { q: e.pos.q + dq, r: e.pos.r + dr }, p = h.R.screenOf({ ...at, z: e.pos.z }); return { at, d: p ? Math.hypot(p.x - me.x, p.y - me.y) - (p.y > innerHeight * 0.55 ? 1000 : 0) - (p.y < 120 ? 1000 : 0) : -9999 }; }).sort((a, b) => b.d - a.d).map((x) => x.at);
        }, who);
        for (const at of around) {
          await ev((a) => window.hextable.act({ type: 'spawn', monster: 'goblin-warrior', at: a }), at);
          try { await wait(page, (b) => Object.keys(window.hextable.state.entities).length > b.length, before, 3000); break; } catch { /* the hex was taken */ }
        }
        const now = await state(page, (S, b) => Object.keys(S.entities).filter((i) => !b.includes(i)), before);
        if (!now.length) throw new Error('no goblin could be placed');
        return now[0];
      };

      await step('a level 14 wizard, a level 15 warlock and a level 11 ranger join the party', async () => {
        await open(page, url); await playSolo(page);
        await ev(() => { document.getElementById('dm-auto').checked = false; });
        let q = 0;
        for (const n of Object.keys(sheets)) {                              // one at a time: an action sent while another is still being answered is dropped
          await ev(async ([sh, at]) => {
            const D = await import('./shared/derive.js'), r = D.derive(sh);
            if (!r.record) throw new Error(JSON.stringify(D.validate(sh)));
            window.hextable.act({ type: 'addCharacter', record: r.record, at });
          }, [sheets[n], { q: -3 + q++, r: 4, z: 0 }]);
          await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n, 15000);
          ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n);
        }
      });

      const calmNow = () => wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 30000);
      const idle = async () => { await calmNow(); await sleep(500); await calmNow(); };        // an action sent while the beats play is dropped (they start a moment after the state changes)
      const cur = () => state(page, (S) => S.encounter.order[S.encounter.turn].id);
      const turnOf = async (id) => {
        for (let k = 0; k < 30 && (await cur()) !== id; k++) { await ev((c) => window.hextable.act({ type: 'endTurn', actor: c }), await cur()); await idle(); }
        if ((await cur()) !== id) throw new Error(`it never became ${id}'s turn`);
      };
      await step('a fight starts with the three in it', async () => {
        await idle();
        await ev(() => window.hextable.act({ type: 'startEncounter', center: { q: -2, r: 4 }, radius: 8 }));
        await waiting(() => !!window.hextable.state.encounter, null, 20000); await idle();
        for (const n of Object.keys(sheets)) if (!(await state(page, (S, i) => S.encounter.order.some((o) => o.id === i), ids[n]))) throw new Error(`${n} is not in the fight`);
        await turnOf(ids.Wyn); await pick('Wyn');
      });

      await step('the wizard\'s Overchannel card: the first use is free, the slot and the roll are chosen, and the card fits the screen', async () => {
        await pick('Wyn');
        await feat('Overchannel');
        await card('evoker');
        await page.selectOption('#cp-spell', 'fireball');
        await card('evoker with a slot');
        const parts = await page.$$eval('#cp [data-part]', (x) => x.map((p) => p.dataset.part));
        if (parts.join() !== 'slot,empower,overchannel') throw new Error(`parts: ${parts}`);
        const text = await page.$eval('#cp [data-part=overchannel]', (x) => x.textContent);
        if (!/first use since a Long Rest is free/.test(text)) throw new Error(`cost: ${text}`);
        const spells = await page.$$eval('#cp-spell option', (o) => o.map((x) => x.value));
        if (!['fireball', 'fire-bolt', 'magic-missile'].every((x) => spells.includes(x)) || spells.includes('shield')) throw new Error(`spells: ${spells}`);
        await shot('evoker');
      });

      await step('Fireball with Overchannel and Empowered Evocation: armed with both, a tap on a goblin sends it, the use is counted', async () => {
        const g = await foeBeside(ids.Wyn);
        ids.g1 = g;
        await page.selectOption('#cp-spell', 'fireball');
        await tap(page, '#cp [data-part=slot] [data-level="3"]');
        await tap(page, '#cp [data-empower="0"]');
        await page.check('#cp-over');
        await tap(page, '#cp-use');
        await waitShown(page, '#hint');
        const hint = await page.$eval('#hint-text', (x) => x.textContent);
        if (!/Overchannel/.test(hint)) throw new Error(`the hint does not say it: ${hint}`);
        const n = await tl();
        await tapCreature(g);
        await waitShown(page, '#hint-go');                                   // an area: the tap aims it, Cast sends it
        await tap(page, '#hint-go');
        await waiting((i) => window.hextable.state.entities[i].uses?.overchannel === 1, ids.Wyn);
        const evs = await since(n), notes = evs.filter((e) => e.type === 'note').map((e) => e.text).join(' | ');
        if (!/Overchannel: Fireball deals its maximum damage/.test(notes)) throw new Error(`notes: ${notes}`);
        if (!/Empowered Evocation: \+5 damage/.test(notes)) throw new Error(`notes: ${notes}`);
        if (!evs.some((e) => e.type === 'dice' || e.type === 'damage')) throw new Error('no damage rolled');
        await shot('evoker-cast');
      });

      await step('the next Overchannel costs dice of Necrotic damage per slot level, and the card says so', async () => {
        await closePanels(page); await pick('Wyn');
        await feat('Overchannel');
        await page.selectOption('#cp-spell', 'fireball');
        const text = await page.$eval('#cp [data-part=overchannel]', (x) => x.textContent);
        if (!/2d12 Necrotic damage for each level of the slot/.test(text)) throw new Error(`cost: ${text}`);
        await page.selectOption('#cp-spell', 'fire-bolt');
        const off = await page.$eval('#cp-over', (x) => x.disabled);
        if (!off) throw new Error('Overchannel is offered for a cantrip');
        await tap(page, '#cp-close'); await waitShown(page, '#cp', false);
      });

      await step('Armor of Shadows casts at will on the warlock alone, Mystic Arcanum shows its use', async () => {
        await turnOf(ids.Mor);
        await closePanels(page); await pick('Mor');
        await panelTab(page, 'features');
        const rows = await page.$$eval('#ap-features [data-row]', (r) => r.map((x) => x.textContent.replace(/\s+/g, ' ')));
        const arcanum = rows.find((x) => /Circle of Death/.test(x));
        if (!arcanum || !/1 \/ 1/.test(arcanum) || /null|undefined/.test(rows.join())) throw new Error(`rows: ${rows.join(' || ')}`);
        if (!rows.some((x) => /Armor of Shadows/.test(x) && !/\d \/ \d/.test(x))) throw new Error('an at-will cast has no count to show');
        await feat('Armor of Shadows');
        await card('free');
        const note = await page.$eval('#cp .cp-note', (x) => x.textContent);
        if (!/As often as you like/.test(note) || !/Mor only/.test(note)) throw new Error(`note: ${note}`);
        const n = await tl();
        await tap(page, '#cp-use');
        await wait(page, (k) => window.hextable.state.timeline.slice(k).some((e) => e.type === 'cast' && e.spell === 'mage-armor' && e.via), n, 15000);
      });

      await step('the warlock\'s Repelling Blast: the distance is chosen on a card and the cantrip is armed with it', async () => {
        for (let k = 0; k < 5 && (await cur()) === ids.Mor; k++) {              // the turn of Armor of Shadows is over (an action sent while the beats play is dropped: send again)
          await idle(); await ev((c) => window.hextable.act({ type: 'endTurn', actor: c }), ids.Mor);
          await wait(page, (m) => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== m, ids.Mor, 6000).catch(() => {});
        }
        await turnOf(ids.Mor);
        ids.g4 = await foeBeside(ids.Mor);
        await pick('Mor');
        await feat('Repelling Blast');
        await card('repel');
        await shot('repel');
        await tap(page, '#cp [data-feet="5"]');
        await tap(page, '#cp-use');
        await waitShown(page, '#hint');
        const hint = await page.$eval('#hint-text', (x) => x.textContent);
        if (!/Repelling Blast.*: 5 ft/.test(hint)) throw new Error(`hint: ${hint}`);
        const n = await tl();
        await tapCreature(ids.g4);
        await waitShown(page, '#hint-go', true, 4000).catch(() => {});       // several beams: Cast sends them at the creatures tapped
        if (await shown(page, '#hint-go')) await tap(page, '#hint-go');
        await waiting((k) => window.hextable.state.timeline.slice(k).some((e) => e.type === 'cast' && e.spell === 'eldritch-blast'), n);
      });

      await step('a fight: Hurl Through Hell is armed from its card and the engine\'s words show when no attack has hit', async () => {
        await closePanels(page);
        await turnOf(ids.Mor);
        const target = await foeBeside(ids.Mor);
        await pick('Mor');
        await feat('Hurl Through Hell');
        await card('hurl');
        await shot('hurl');
        await tap(page, '#cp-use');
        await waitShown(page, '#hint');
        await tapCreature(target);
        await wait(page, () => /follows a hit|not hit/.test(document.querySelector('#toast')?.textContent ?? ''), null, 8000);
      });

      await step('Superior Hunter\'s Prey: greyed with the engine\'s words until a creature is marked, then the card offers who takes the damage and arms the attack', async () => {
        await turnOf(ids.Ash);
        ids.g2 = await foeBeside(ids.Ash);
        ids.g3 = await foeBeside(ids.g2);
        await pick('Ash');
        await panelTab(page, 'features');
        const row = await text('#ap-features [data-row]:has-text("Superior Hunter")');
        if (!/no creature marked/.test(row)) throw new Error(`row: ${row}`);
        await shot('prey-grey');
        const mark = await state(page, (S, ids2) => !!S.entities[ids2[0]] && !S.entities[ids2[0]].dead, [ids.g2]);
        if (!mark) throw new Error('the goblin to mark is gone');
        await ev(([a, g]) => window.hextable.act({ type: 'cast', actor: a, spell: 'hunters-mark', target: g }), [ids.Ash, ids.g2]);
        await waiting((a) => window.hextable.state.effects?.some((x) => x.source === a && x.spell === 'hunters-mark'), ids.Ash);
        await panelTab(page, 'features');
        const now = await text('#ap-features [data-row]:has-text("Superior Hunter")');
        if (/no creature marked/.test(now)) throw new Error(`still greyed: ${now}`);
        await feat('Superior Hunter');
        await card('prey');
        const who = await page.$$eval('#cp-prey option', (o) => o.map((x) => x.value));
        if (!who.includes(ids.g3) || who.includes(ids.g2)) throw new Error(`who: ${who}`);
        await shot('prey');
        await tap(page, '#cp-use');
        await waitShown(page, '#hint');
        const n = await tl();
        await tapCreature(ids.g2);
        await wait(page, (k) => window.hextable.state.timeline.slice(k).some((e) => e.type === 'attack'), n, 15000);
        const evs = await since(n);
        if (evs.some((e) => e.type === 'damage' && e.target === ids.g2) && !evs.some((e) => e.type === 'note' && /Superior Hunter's Prey/.test(e.text))) throw new Error('the mark hit, but no damage went to the second creature');
      });
      await step('the fight is over', async () => {
        await ev(() => { if (window.hextable.state.encounter) window.hextable.act({ type: 'endEncounter' }); });
        await wait(page, () => !window.hextable.state.encounter, null, 20000); await idle();
      });

      await step('the wizard spent slots: the DM\'s Short Rest offers Arcane Recovery, and the chosen slot comes back', async () => {
        const before = await state(page, (S, i) => S.entities[i].slots[3], ids.Wyn);
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await tap(page, '#dm-short-rest');
        await waitShown(page, `#dm-short-box [data-recover="${ids.Wyn}"]`);
        await shot('rest');
        await tap(page, `#dm-short-box [data-recover="${ids.Wyn}"] [data-level="3"] [data-step="1"]`);
        const sum = await page.$eval(`#dm-short-box [data-recover="${ids.Wyn}"] .cp-rest-sum`, (x) => x.textContent);
        if (!/3 of 7 levels/.test(sum)) throw new Error(`sum: ${sum}`);
        await tap(page, '#dm-short-go');
        await wait(page, ([i, b]) => window.hextable.state.entities[i].slots[3] === b + 1, [ids.Wyn, before], 25000);
        const used = await state(page, (S, i) => S.entities[i].uses['arcane-recovery'], ids.Wyn);
        if (used !== 0) throw new Error(`Arcane Recovery uses: ${used}`);
      });

      await step('the build screen: the invocation list counts to the Invocations column, shows each prerequisite and stops at the limit', async () => {
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await tap(page, '#qb-add'); await waitShown(page, '#qb');
        await page.selectOption('#qb-class', 'warlock');
        await page.selectOption('#qb-levelsel', '5');
        const count5 = await text('#count-eldritch-invocations');
        if (count5 !== '0 of 5 chosen') throw new Error(`level 5: ${count5}`);
        const gated = await page.$$eval('#choice-eldritch-invocations [data-option]', (l) => l.filter((x) => /Needs Warlock level/.test(x.textContent)).map((x) => [x.dataset.option, x.querySelector('input').disabled]));
        if (!gated.length || gated.some(([, off]) => !off)) throw new Error(`prerequisites: ${JSON.stringify(gated)}`);
        await page.selectOption('#qb-levelsel', '15');
        const count15 = await text('#count-eldritch-invocations');
        if (count15 !== '0 of 9 chosen') throw new Error(`level 15: ${count15}`);
        const free = await page.$$eval('#choice-eldritch-invocations input:not(:disabled)', (b) => b.map((x) => x.id));
        for (const id of free.slice(0, 9)) { await page.check(`#${id}`); }
        const full = await text('#count-eldritch-invocations');
        const left = await page.$$eval('#choice-eldritch-invocations input:not(:disabled):not(:checked)', (b) => b.length);
        if (full !== '9 of 9 chosen' || left) throw new Error(`at the limit: ${full}, ${left} still open`);
        await page.fill('#qb-name', 'Builder');
        await shot('build-invocations');
        const box = await page.$eval('#qb', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
        if (box[0] < -1 || box[1] > box[2] + 1) throw new Error(`the build screen does not fit: ${box}`);
      });

      await step('the build screen: a feat is chosen for each place, and its ability points are placed', async () => {
        const places = await page.$$eval('#qb-feats-pick [data-at]', (b) => b.map((x) => x.dataset.at));
        if (!places.includes('ability-score-improvement-4') || !places.includes('background')) throw new Error(`places: ${places}`);
        await page.selectOption('#feat-ability-score-improvement-4-id', 'ability-score-improvement');
        await page.selectOption('#feat-ability-score-improvement-4-a1', 'cha');
        await page.selectOption('#feat-ability-score-improvement-4-a2', 'con');
        await page.selectOption('#feat-background-id', 'skilled');
        await wait(page, () => !!document.querySelector('#feat-background input[id*="-skill-"]'), null, 5000);
        await shot('build-feats');
        const probs = await page.$$eval('#qb-problems li', (l) => l.map((x) => x.textContent));
        if (!probs.some((p) => /Skilled/.test(p) || /skill/i.test(p)) && probs.length) throw new Error(`problems: ${probs}`);
        const skills = await page.$$eval('#feat-background input[id*="-skill-"]:not(:disabled)', (b) => b.slice(0, 3).map((x) => x.id));
        for (const id of skills) await page.check(`#${id}`);
        const after = await page.$$eval('#qb-problems li', (l) => l.map((x) => x.textContent));
        const stillFeat = after.filter((p) => /feat|Skilled|Ability Score Improvement/i.test(p));
        if (stillFeat.length) throw new Error(`feat problems: ${stillFeat}`);
        await tap(page, '#qb-close'); await waitShown(page, '#qb', false);
      });

    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=classes.
export default async function (browser, url) {
  await classes(browser, url, 'class controls at 1280x800', { viewport: { width: 1280, height: 800 } });
  await classes(browser, url, 'class controls at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await martial(browser, url, 'martial classes in the action panel at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });     // the steps are in paneltabs.mjs
}
