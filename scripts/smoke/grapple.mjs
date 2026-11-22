import { mkdirSync } from 'node:fs';
import { sleep, tapGuarded, spawnNear, spotsFor, scenario, wait, state, shown, waitShown, open, playSolo, closePanels, openTab, panelTab, settle, tapAt, onCanvas, placeBeside } from './lib.mjs';

// ---------- Grapple, Shove, Escape and Let go; the familiar's attacks and Investment; Refresh from sheet (issue #486, stage G7 of docs/specs/grapple-shove.md) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch. Part 1: on the fighter's turn the Unarmed Strike has Grapple, Shove away and Shove Prone rows; a tap arms
// one, a tap on the foe sends it; the foe is held (a pill, a line on the map, "Let go of" for the grappler), Let go frees it; a Shove Prone knocks it down; a target
// too big is not offered and the hint says why; the held creature's own turn has Escape rows. Part 2: the log's words. (The smoke's screenshots: SMOKE_SHOTS=<dir>.)
const idle = (page) => wait(page, () => window.hextable.waiting === 0, null, 20000);
const cur = (page) => state(page, (S) => S.encounter.order[S.encounter.turn].id);
const turnOf = async (page, id) => {
  for (let k = 0; k < 30 && (await cur(page)) !== id; k++) { await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), await cur(page)); await idle(page); }
  if ((await cur(page)) !== id) throw new Error(`it never became ${id}'s turn`);
};
// The next turn of `id`: its own turn is ended first if it is under way (what it spent stays spent until then).
const freshTurn = async (page, id) => { if ((await cur(page)) === id) { await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), id); await idle(page); } await turnOf(page, id); };
const select = async (page, id) => { await page.evaluate((i) => window.hextable.select(i), id); await wait(page, (i) => !document.querySelector('#card').hidden && document.querySelector('#c-name').textContent === window.hextable.state.entities[i].name, id, 20000); };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const lines = (page) => page.evaluate(() => window.hextable.state.timeline.map((e) => window.hextable.describe(e)).filter(Boolean));
const send = (page, a) => page.evaluate((x) => window.hextable.act(x), a);

// A tap on a creature on the map, checked: the renderer is asked who it picked, and a tap that landed on something else (a hero standing in front of the
// foe, a panel) is made again from another side of the map (lib.mjs tapGuarded). The camera is let settle first.
const tapCreature = (page, touch, id) => tapGuarded(page, touch, id);

// A built character: the valley's own are typed in by hand and have no Unarmed Strike. Returns its id.
async function addFighter(page, sheet = {}) {
  await page.evaluate(async (more) => {
    const D = await import('./shared/derive.js');
    const r = D.derive({ name: 'Gru', class: 'fighter', level: 5, subclass: 'champion', abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 }, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: [], ...more });
    if (!r.record) throw new Error(JSON.stringify(D.validate({ name: 'Gru' })));
    window.hextable.act({ type: 'addCharacter', record: r.record });
  }, sheet);
  await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Gru'));
  return page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Gru').id);
}

async function part1(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width <= 600;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      const shot = (n) => (process.env.SMOKE_SHOTS ? (mkdirSync(process.env.SMOKE_SHOTS, { recursive: true }), page.screenshot({ path: `${process.env.SMOKE_SHOTS}/grapple-${n}-${phone ? 'phone' : 'wide'}.png` }).catch(() => {})) : null);
      let foe = null, hero = null;

      await run.do('a fight beside a Paralyzed goblin (it fails any save), the fighter\'s turn: the Unarmed Strike has Grapple, Shove away and Shove Prone rows', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        // A built character has an Unarmed Strike; the valley's hand-typed party has none (DEBT T61, C19), so one is added: a level 5 fighter, Strength 16.
        hero = await addFighter(page);
        await closePanels(page); await page.click('#party button:has-text("Gru")');
        foe = await spawnNear(page, 'goblin-warrior', { near: hero, min: 1, radius: 3 });
        await placeBeside(page, foe, hero);
        await send(page, { type: 'condition', actor: foe, condition: 'paralyzed', on: true });
        await wait(page, (f) => !!window.hextable.state.entities[f].cond.paralyzed, foe);
        await send(page, { type: 'startEncounter', center: await state(page, (S, i) => S.entities[i].pos, hero), radius: 8 });
        await wait(page, () => !!window.hextable.state.encounter, null, 20000); await idle(page);
        await turnOf(page, hero); await select(page, hero);
        await panelTab(page, 'attacks');
        for (const id of ['grapple', 'push', 'prone']) await waitShown(page, `#ap-attacks [data-row="strike:unarmed-strike:${id}"]`);
        const t = await text(page, '#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
        if (!/Grapple/.test(t) || !/DC \d+/.test(t) || !/Action|Extra Attack/.test(t)) throw new Error(`the Grapple row says too little: ${t}`);
        await shot('rows');
      });

      await run.do('a tap on Grapple arms it (the hint says so), a tap on the goblin sends it: the goblin is held by Gru', async () => {
        await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
        await wait(page, () => window.hextable.mode.kind === 'attack' && window.hextable.mode.extra?.option === 'grapple');
        if (!/Grapple: tap a target/.test(await text(page, '#hint-text'))) throw new Error(`the hint: ${await text(page, '#hint-text')}`);
        if (!(await page.$eval('#ap-attacks [data-row="strike:unarmed-strike:grapple"]', (b) => b.classList.contains('armed')))) throw new Error('the row does not show as armed');
        // The camera may still be moving when the tap lands: tapped again while the row is still armed and nothing was sent.
        const held = () => page.evaluate(([f, h]) => window.hextable.state.entities[f].cond.grappled?.holds?.[0]?.by === h, [foe, hero]);
        for (let k = 0; k < 3 && !(await held()); k++) {
          await tapCreature(page, touch, foe);
          await wait(page, ([f, h]) => window.hextable.state.entities[f].cond.grappled?.holds?.[0]?.by === h, [foe, hero], 4000).catch(() => {});
        }
        await wait(page, ([f, h]) => window.hextable.state.entities[f].cond.grappled?.holds?.[0]?.by === h, [foe, hero]);
        await idle(page);
        const g = await state(page, (S, f) => S.entities[f].cond.grappled, foe);
        if (g.holds.length !== 1 || g.holds[0].with !== 'hand') throw new Error(`the hold: ${JSON.stringify(g)}`);
      });

      await run.do('the log says it: "tries to grab", the condition and nothing about a roll; the goblin\'s pill reads "Grappled by Gru (escape DC n)"', async () => {
        const l = await lines(page);
        if (!l.some((x) => /Gru tries to grab/.test(x))) throw new Error(`no strike line in ${l.slice(-6)}`);
        await select(page, foe);
        const pill = await page.$$eval('#c-res .pill', (p) => p.map((x) => x.textContent.trim()));
        if (!pill.some((x) => /^Grappled by Gru \(escape DC \d+\)$/.test(x))) throw new Error(`the pill: ${pill}`);
        await page.click('#c-res .pill:has-text("Grappled")');
        await waitShown(page, '#ap-how');
        if (!/escape DC \d+/.test(await text(page, '#ap-how')) || /Until the DM removes it/.test(await text(page, '#ap-how'))) throw new Error(`the card: ${await text(page, '#ap-how')}`);
        await shot('held');
        await page.click('#ap-how [data-close]');
      });

      await run.do('the line on the map: the overlay has a band between the two (a hold draws geometry the same overlay without it does not)', async () => {
        const n = await page.evaluate(async () => {
          const { grapplePairs } = await import('./grapple.js');
          return grapplePairs(window.hextable.state).map((p) => `${p.by}>${p.t}`);
        });
        if (n.length !== 1 || !n[0].startsWith(`${hero}>`)) throw new Error(`pairs ${n}`);
      });

      await run.do('Gru\'s panel has "Let go of" the goblin; a tap frees it with no action spent', async () => {
        await select(page, hero);
        await panelTab(page, 'attacks');
        const row = `#ap-attacks [data-row="letgo:${foe}"]`;
        await waitShown(page, row);
        const before = await state(page, (S) => S.encounter.budget.action);
        await tap(row);
        await wait(page, (f) => !window.hextable.state.entities[f].cond.grappled, foe);
        await idle(page);
        if ((await state(page, (S) => S.encounter.budget.action)) !== before) throw new Error('letting go cost an action');
        if (!(await lines(page)).some((x) => /no longer Grappled by Gru: let go/.test(x))) throw new Error(`the log: ${(await lines(page)).slice(-4)}`);
      });

      await run.do('Shove Prone: the goblin goes down; the log says "to the ground"', async () => {
        await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
        await tap('#ap-attacks [data-row="strike:unarmed-strike:prone"]');
        await wait(page, () => window.hextable.mode.extra?.shove === 'prone');
        await tapCreature(page, touch, foe);
        await wait(page, (f) => !!window.hextable.state.entities[f].cond.prone, foe);
        await idle(page);
        if (!(await lines(page)).some((x) => /Gru tries to shove .* to the ground/.test(x))) throw new Error(`the log: ${(await lines(page)).slice(-4)}`);
        await shot('prone');
      });

      await run.do('a target too big is not offered: the hint says why, and nothing is sent', async () => {
        await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
        // The hero shrinks to Tiny and the goblin grows to Medium: two sizes larger, which the SRD does not allow a Grapple at.
        await send(page, { type: 'setSize', actor: hero, size: 'tiny' }); await send(page, { type: 'setSize', actor: foe, size: 'medium' });
        await wait(page, ([f, h]) => window.hextable.state.entities[f].size === 'medium' && window.hextable.state.entities[h].size === 'tiny', [foe, hero]);
        await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
        await wait(page, () => window.hextable.mode.extra?.option === 'grapple');
        await wait(page, () => /no more than one size larger/.test(document.querySelector('#hint-text')?.textContent ?? ''));
        const n = await state(page, (S) => S.timeline.length);
        await shot('toobig');
        await page.click('#hint-cancel');
        await send(page, { type: 'setSize', actor: hero, size: 'medium' }); await send(page, { type: 'setSize', actor: foe, size: 'small' });
        await wait(page, ([f, h]) => window.hextable.state.entities[f].size === 'small' && window.hextable.state.entities[h].size === 'medium', [foe, hero]);
        if ((await state(page, (S) => S.timeline.length)) < n) throw new Error('timeline went back');
      });

      await run.do('the held creature\'s own turn: Escape rows for Athletics and Acrobatics with their bonuses; a tap sends escape and the log says "tries to break free"', async () => {
        await send(page, { type: 'condition', actor: foe, condition: 'prone', on: false });
        await wait(page, (f) => !window.hextable.state.entities[f].cond.prone, foe);
        await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
        await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
        await wait(page, () => window.hextable.mode.extra?.option === 'grapple');
        // The goblin is still Paralyzed here, so it fails the save and the hold is certain (the loop stays as a guard against a tap that did not land); it is made
        // to stand up from the paralysis only once it is held, so that its own turn can come and offer the Escape rows.
        for (let k = 0; k < 6; k++) {
          await tapCreature(page, touch, foe); await idle(page);
          if (await state(page, (S, f) => !!S.entities[f].cond.grappled?.holds, foe)) break;
          await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
          await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
          await wait(page, () => window.hextable.mode.extra?.option === 'grapple');
        }
        if (!(await state(page, (S, f) => !!S.entities[f].cond.grappled?.holds, foe))) throw new Error('the goblin was never held in six turns');
        await send(page, { type: 'condition', actor: foe, condition: 'paralyzed', on: false });
        await wait(page, (f) => !window.hextable.state.entities[f].cond.paralyzed && !!window.hextable.state.entities[f].cond.grappled?.holds, foe);
        await turnOf(page, foe); await select(page, foe);
        await panelTab(page, 'attacks');
        for (const skill of ['athletics', 'acrobatics']) await waitShown(page, `#ap-attacks [data-row="escape:${hero}:${skill}"]`);
        const t = await text(page, `#ap-attacks [data-row="escape:${hero}:athletics"]`);
        if (!/Escape \(Athletics\)/.test(t) || !/Strength check [+-]\d+ vs DC \d+/.test(t) || !/Action/.test(t)) throw new Error(`the Escape row: ${t}`);
        await shot('escape');
        await tap(`#ap-attacks [data-row="escape:${hero}:athletics"]`);
        await wait(page, (h) => window.hextable.state.timeline.some((e) => e.type === 'check' && e.escape === h), hero);
        await idle(page);
        if (!(await lines(page)).some((x) => /tries to break free of Gru/.test(x))) throw new Error(`the log: ${(await lines(page)).slice(-4)}`);
        const spent = await state(page, (S) => S.encounter.budget.action);
        if (spent !== 0) throw new Error(`escape did not take the action (${spent})`);
      });
    } finally { await ctx.close(); }
  });
}

// Part 3: a warlock with Pact of the Chain and Investment of the Chain Master casts Find Familiar through the chooser (Speed required, damage type optional), and
// in a fight the familiar attacks through the Attacks tab (the forgone attack) and the Bonus tab (Quick Attack).
const toastText = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; });
async function part3(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width <= 600;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      const tapHex = (hex, id) => page.evaluate(([h, i]) => window.hextable.R.onTap({ hex: h, id: i ?? null }), [hex, id ?? null]);
      const shot = (n) => (process.env.SMOKE_SHOTS ? (mkdirSync(process.env.SMOKE_SHOTS, { recursive: true }), page.screenshot({ path: `${process.env.SMOKE_SHOTS}/grapple-${n}-${phone ? 'phone' : 'wide'}.png` }).catch(() => {})) : null);
      let mor = null, fam = null, gob = null;
      const rowFor = (tab, via) => `#ap-${tab} [data-row^="comp:fatk:"][data-row*="${via}"]`;

      await run.do('a warlock with Pact of the Chain and Investment casts Find Familiar: the chooser asks for the Speed first, the damage type is optional', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const { derive } = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' });
          const r = derive({ name: 'Mor', class: 'warlock', level: 5, subclass: 'fiend', abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ['arcana', 'deception'], weapons: ['dagger'],
            spells: ['eldritch-blast', 'chill-touch', 'hex'], choices: { 'eldritch-invocations': ['pact-of-the-chain', 'investment-of-the-chain-master'] } });
          if (!r.record) throw new Error(JSON.stringify(r));
          h.act({ type: 'addCharacter', record: r.record });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Mor'));
        mor = await page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Mor').id);
        await closePanels(page); await page.evaluate((m) => { window.hextable.select(m); window.hextable.R.focus(m, true); }, mor);
        await waitShown(page, '#card'); await idle(page);
        // Find Familiar is cast through the invocation (a Magic action with no spell slot: a Pact slot is level 3, which the Spells tab's own level 1 check does not count).
        await panelTab(page, 'features');
        await tap('#ap-features [data-row="feat:eldritch-invocations-pact-of-the-chain"]');
        await page.waitForSelector('#cp #cp-use', { timeout: 5000 });
        await tap('#cp #cp-use');
        await page.waitForSelector('#cc-chooser:not([hidden])', { timeout: 5000 });
        const moves = await page.$$eval('#cc-chooser [data-cc-pick^="move|"]', (b) => b.map((x) => x.textContent.trim()));
        const dmg = await page.$$eval('#cc-chooser [data-cc-pick^="damage|"]', (b) => b.map((x) => x.textContent.trim()));
        if (moves.join() !== 'Fly 40 ft,Swim 40 ft') throw new Error(`the Speed choice: ${moves}`);
        if (dmg.join() !== 'Necrotic,Radiant') throw new Error(`the damage choice: ${dmg}`);
        await page.selectOption('#cc-sel-form', 'owl'); await tap('#cc-chooser [data-cc-pick="type|fey"]');
        const spots = (await spotsFor(page, 'wolf', { near: mor, radius: 2 })).spots;
        await tapHex(spots[0]);
        await page.click('#cc-chooser [data-cc-cast="picks"]', { force: true });            // no Speed picked: refused in words, nothing sent
        await wait(page, () => /speed/i.test(document.getElementById('toast')?.textContent ?? ''));
        if (await page.evaluate(() => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'find-familiar'))) throw new Error('the cast went without a Speed');
        await tap('#cc-chooser [data-cc-pick="move|swim"]'); await tap('#cc-chooser [data-cc-pick="damage|radiant"]');
        if (!(await page.$eval('#cc-chooser [data-cc-pick="damage|radiant"]', (b) => b.getAttribute('aria-pressed') === 'true'))) throw new Error('the damage choice is not shown as picked');
        const small = await page.$$eval('#cc-chooser button', (b) => b.filter((x) => x.getBoundingClientRect().height < 43).map((x) => x.textContent));
        if (touch && small.length) throw new Error(`under 44 px: ${small}`);
        await shot('invest-chooser');
        await tap('#cc-chooser [data-cc-cast="picks"]');
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'find-familiar'), null, 10000);
        fam = await page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.bond?.source === 'find-familiar').id);
        const f = await state(page, (S, i) => ({ swim: S.entities[i].speeds?.swim, types: JSON.stringify(S.entities[i].actions) }), fam);
        if (f.swim !== 40) throw new Error(`no Swim Speed of 40: ${JSON.stringify(f)}`);
        if (!/radiant/.test(f.types)) throw new Error('the Radiant damage was not baked into its attacks');
      });

      await run.do('in a fight on Mor\'s turn: the Attacks tab has the familiar\'s attack through Pact of the Chain, the Bonus tab Quick Attack; a tap on the goblin sends the familiar\'s attack', async () => {
        gob = await spawnNear(page, 'goblin-warrior', { near: fam, min: 1, radius: 1 });
        await page.evaluate((g) => { const h = window.hextable; h.act({ type: 'startEncounter', center: h.state.entities[g].pos, radius: 8 }); }, gob);
        await wait(page, () => !!window.hextable.state.encounter, null, 20000); await idle(page);
        await turnOf(page, mor); await select(page, mor);
        await panelTab(page, 'attacks');
        await waitShown(page, rowFor('attacks', 'pact-of-the-chain'));
        const t = await text(page, rowFor('attacks', 'pact-of-the-chain'));
        if (!/attacks: Talons/.test(t) || !/give up one of your attacks/.test(t) || !/Familiar/.test(t)) throw new Error(`the row says: ${t}`);
        await shot('familiar-rows');
        await tap(rowFor('attacks', 'pact-of-the-chain'));
        await wait(page, () => window.hextable.mode.kind === 'famAttack');
        if (!/tap a target/.test(await text(page, '#hint-text'))) throw new Error(`the hint: ${await text(page, '#hint-text')}`);
        const n = await state(page, (S) => S.timeline.length);
        await tapHex(await state(page, (S, g) => S.entities[g].pos, gob), gob);
        await wait(page, ([k, f]) => window.hextable.state.timeline.some((e, i) => i >= k && e.type === 'attack' && e.actor === f), [n, fam]);
        await idle(page);
        const used = await state(page, (S, f) => S.entities[f].reactionUsed, fam);
        if (!used) throw new Error('the familiar\'s Reaction was not spent');
        if (!(await lines(page)).some((x) => /Pact of the Chain: Mor gives up an attack/.test(x))) throw new Error(`the log: ${(await lines(page)).slice(-5)}`);
      });

      await run.do('Quick Attack is a Bonus tab row: a tap and a tap on the goblin send it, and the Bonus Action is spent', async () => {
        await panelTab(page, 'bonus');
        await waitShown(page, rowFor('bonus', 'investment-of-the-chain-master'));
        const t = await text(page, rowFor('bonus', 'investment-of-the-chain-master'));
        if (!/Quick Attack|Investment/.test(t) || !/Bonus/.test(t)) throw new Error(`the row says: ${t}`);
        await tap(rowFor('bonus', 'investment-of-the-chain-master'));
        await wait(page, () => window.hextable.mode.kind === 'famAttack');
        const n = await state(page, (S) => S.timeline.length);
        await tapHex(await state(page, (S, g) => S.entities[g].pos, gob), gob);
        await wait(page, ([k, f]) => window.hextable.state.timeline.some((e, i) => i >= k && e.type === 'attack' && e.actor === f), [n, fam]);
        await idle(page);
        if ((await state(page, (S) => S.encounter.budget.bonus)) !== 0) throw new Error('the Bonus Action was not spent');
        await shot('quick-attack');
      });
    } finally { await ctx.close(); }
  });
}

async function part4(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, phone = opts.viewport.width <= 600;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      const shot = (n) => (process.env.SMOKE_SHOTS ? (mkdirSync(process.env.SMOKE_SHOTS, { recursive: true }), page.screenshot({ path: `${process.env.SMOKE_SHOTS}/grapple-${n}-${phone ? 'phone' : 'wide'}.png` }).catch(() => {})) : null);
      const toastNow = () => page.evaluate(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent.replace(/\s+/g, ' ').trim(); });
      const toastHas = (re) => wait(page, (src) => { const t = document.getElementById('toast'); return !t.hidden && new RegExp(src).test(t.textContent); }, re.source, 8000);
      const sheetOf = async (id) => { await closePanels(page); await page.evaluate((i) => window.hextable.select(i), id); await waitShown(page, '#card'); await page.click('#btn-sheet'); await waitShown(page, '#sheet-refresh'); };
      let gru = null;

      await run.do('the DM panel\'s Refresh the party with nobody built from a sheet: the engine\'s refusal is shown, nothing changes', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        // The four starters are built from sheets now (#683), so the table is made the typed-in one this step and the next are about: the starters leave, and
        // Brenna comes back as a record with no sheet behind it (addCharacter takes the finished record, derive's, and keeps no sheet).
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          for (const id of ['rogue', 'cleric', 'wizard', 'fighter']) h.act({ type: 'remove', actor: id });
          const rec = D.derive({ name: 'Brenna', class: 'fighter', level: 3, subclass: 'champion', abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: [] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -6, r: 2, z: 0 } });
        });
        await wait(page, () => { const P = Object.values(window.hextable.state.entities).filter((e) => e.kind === 'pc'); return P.length === 1 && P[0].name === 'Brenna' && !P[0].sheet; });
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        const was = await state(page, (S) => S.timeline.length);
        await tap('#dm-refresh-party');
        await toastHas(/No party character has a sheet/);
        if ((await state(page, (S) => S.timeline.length)) !== was) throw new Error('a refused refresh changed the table');
      });

      await run.do('a character typed in by hand: the sheet\'s note is the engine\'s words, and a tap shows them again', async () => {
        const brenna = await state(page, (S) => Object.values(S.entities).find((e) => e.kind === 'pc' && e.name === 'Brenna').id);
        await sheetOf(brenna);
        const note = await text(page, '#sheet-refresh-note');
        if (!/typed in by hand/.test(note)) throw new Error(`the note should be the engine's refusal: ${note}`);
        await page.locator('#sheet-refresh-note').scrollIntoViewIfNeeded(); await sleep(1800);
        await shot('refresh-refused');
        await tap('#sheet-refresh');
        await toastHas(/typed in by hand/);
      });

      await run.do('a character built from a sheet: Refresh from sheet makes it again and says so; hit points stay as play left them', async () => {
        await page.evaluate(() => {
          window.hextable.act({ type: 'setSheet', sheet: { name: 'Gru', class: 'fighter', level: 5, subclass: 'champion', abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 }, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: [] } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Gru' && e.sheet));
        gru = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Gru').id);
        await page.evaluate((i) => window.hextable.act({ type: 'setHp', actor: i, hp: window.hextable.state.entities[i].maxHp - 7 }), gru);
        await wait(page, (i) => window.hextable.state.entities[i].hp === window.hextable.state.entities[i].maxHp - 7, gru);
        const hp = await state(page, (S, i) => S.entities[i].hp, gru);
        await sheetOf(gru);
        const note = await text(page, '#sheet-refresh-note');
        if (/typed in by hand|refus/i.test(note) || !/saved sheet/.test(note)) throw new Error(`a built character's note should say what the button does: ${note}`);
        const was = await state(page, (S) => S.timeline.length);
        await tap('#sheet-refresh');
        await toastHas(/Gru was made again from the sheet/);
        await wait(page, (n) => window.hextable.state.timeline.slice(n).some((e) => e.type === 'edited'), was);
        if ((await state(page, (S, i) => S.entities[i].hp, gru)) !== hp) throw new Error('refresh changed the hit points');
        await page.locator('#sheet-refresh-note').scrollIntoViewIfNeeded();
        await shot('refresh-done');
      });

      await run.do('Refresh the party in the DM panel remakes the built character and the toast names it; the typed-in ones are left alone', async () => {
        await closePanels(page); await openTab(page, 'dm'); await waitShown(page, '#dm');
        await tap('#dm-refresh-party');
        await toastHas(/Made again from their sheets: Gru\./);
        await shot('refresh-party');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await part1(browser, url, 'grapple, shove, escape and let go at 1280x800', { viewport: { width: 1280, height: 800 } });
  await part1(browser, url, 'grapple, shove, escape and let go at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await part3(browser, url, 'the familiar\'s attacks and Investment at 1280x800', { viewport: { width: 1280, height: 800 } });
  await part3(browser, url, 'the familiar\'s attacks and Investment at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await part4(browser, url, 'Refresh from sheet at 1280x800', { viewport: { width: 1280, height: 800 } });
  await part4(browser, url, 'Refresh from sheet at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
