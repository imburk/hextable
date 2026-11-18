import { mkdirSync } from 'node:fs';
import { sleep, spawnNear, scenario, wait, state, shown, waitShown, open, playSolo, closePanels, panelTab, settle, tapAt, onCanvas, placeBeside } from './lib.mjs';

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

// A tap on a creature on the map: the camera is let settle, and a creature under a panel is not tapped.
async function tapCreature(page, touch, id) {
  for (let k = 0; k < 6; k++) {
    await settle(page, id);
    const pt = await page.evaluate((i) => { const e = window.hextable.state.entities[i]; return window.hextable.R.screenOf(e.pos); }, id);
    if (pt && pt.x > 5 && pt.y > 5 && (await onCanvas(page, pt.x, pt.y))) { await tapAt(page, touch, pt.x, pt.y); return; }
    await page.evaluate((i) => window.hextable.R.focus?.(window.hextable.state.entities[i].pos), id);
    await sleep(300);
  }
  throw new Error(`could not tap ${id} on the map`);
}

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
        await tapCreature(page, touch, foe);
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
        await send(page, { type: 'condition', actor: foe, condition: 'paralyzed', on: false });
        await send(page, { type: 'condition', actor: foe, condition: 'prone', on: false });
        await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
        await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
        await wait(page, () => window.hextable.mode.extra?.option === 'grapple');
        // The goblin is no longer Paralyzed, so a failed save is a matter of luck: Grapple until it is held (a turn each), at most six times.
        for (let k = 0; k < 6; k++) {
          await tapCreature(page, touch, foe); await idle(page);
          if (await state(page, (S, f) => !!S.entities[f].cond.grappled?.holds, foe)) break;
          await freshTurn(page, hero); await select(page, hero); await panelTab(page, 'attacks');
          await tap('#ap-attacks [data-row="strike:unarmed-strike:grapple"]');
          await wait(page, () => window.hextable.mode.extra?.option === 'grapple');
        }
        if (!(await state(page, (S, f) => !!S.entities[f].cond.grappled?.holds, foe))) throw new Error('the goblin was never held in six turns');
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

export default async function (browser, url) {
  await part1(browser, url, 'grapple, shove, escape and let go at 1280x800', { viewport: { width: 1280, height: 800 } });
  await part1(browser, url, 'grapple, shove, escape and let go at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
