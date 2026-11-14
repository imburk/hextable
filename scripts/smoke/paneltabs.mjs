import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closePanels, panelTab } from './lib.mjs';

// ---------- the action panel's Attacks, Bonus, Move and Features tabs (docs/specs/table-ui.md, Decision 6, task T4a) ----------
// Solo as the DM at 1280x800 and at 390x844 with touch. Exploring: a healing shortcut goes to the Features row. In a fight: the fighter's
// Attacks (a row arms, Cancel puts it down), Move (the speed left, Dash spends it, a greyed row writes its reason on screen and a tap on it only
// shows the toast), Bonus (Second Wind, then the reason there is no Bonus Action left), Features (pips); a rogue with no Bonus Action to
// offer; a cleric's Bonus spell and the spell tab; another's turn (greyed with the reason); a monster's `actions` and a flyer's Higher/Lower, selected by the DM.
// In the compact height no row may be cut through the middle.
const idle = (page) => wait(page, () => window.hextable.waiting === 0, null, 20000);
const cur = (page) => state(page, (S) => S.encounter.order[S.encounter.turn].id);
const turnOf = async (page, id) => {
  for (let k = 0; k < 30 && (await cur(page)) !== id; k++) { await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), await cur(page)); await idle(page); }
  if ((await cur(page)) !== id) throw new Error(`it never became ${id}'s turn`);
};
const select = async (page, id) => { await page.evaluate((i) => window.hextable.select(i), id); await wait(page, (i) => !document.querySelector('#card').hidden && document.querySelector('#c-name').textContent === window.hextable.state.entities[i].name, id, 20000); };
// No row of the open pane is cut through the middle by the pane's bottom edge (or its top, scrolled to the start: nothing there).
const whole = async (page, pane) => {
  const cut = await page.$eval(pane, (el) => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll('.ap-row')].filter((r) => { const q = r.getBoundingClientRect(); return q.height && q.top < b.bottom - 1 && q.bottom > b.bottom + 1; }).map((r) => r.dataset.row); });
  if (cut.length) throw new Error(`rows cut through the middle at the bottom of ${pane}: ${cut}`);
};
// Every greyed row of the pane writes its reason on screen, where it can be read (not only in a title).
const reasons = (page, pane) => page.$$eval(`${pane} [aria-disabled="true"]`, (rows) => rows.map((r) => { const w = r.querySelector('.ap-why'); const q = w?.getBoundingClientRect(); return { row: r.dataset.row, why: w?.textContent.trim() ?? '', seen: !!q && q.width > 0 && q.height > 0 }; }));
const visit = async (page, tab) => { await panelTab(page, tab); await whole(page, `#ap-${tab}`); };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());

async function tabs(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      let fly = null;

      await run.do('exploring, a hurt fighter is offered Second Wind, and the shortcut lands on its Features row', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await closePanels(page); await page.click('#party button:has-text("Brenna")');
        await page.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 3 }));
        await wait(page, () => window.hextable.state.entities.fighter.hp === 3);
        await panelTab(page, 'explore');
        await waitShown(page, '#ap-explore [data-row="heal:secondWind"]');
        await tap('#ap-explore [data-row="heal:secondWind"]');
        await wait(page, () => document.querySelector('#ap-tab-features')?.getAttribute('aria-selected') === 'true' && document.activeElement?.dataset.row === 'feat:secondWind');
        await page.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 12 }));
        await wait(page, () => window.hextable.state.entities.fighter.hp === 12);
      });

      await run.do('a fight, the fighter\'s turn: Attacks opens first with her longsword as a row, rows whole in the compact height', async () => {
        await page.evaluate(() => {
          const h = window.hextable;
          h.act({ type: 'spawn', monster: 'animated-flying-sword', at: { q: 2, r: -2 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.tpl === 'animated-flying-sword'));
        fly = await state(page, (S) => Object.values(S.entities).find((e) => e.tpl === 'animated-flying-sword').id);
        await page.evaluate(() => window.hextable.act({ type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }));
        await wait(page, () => !!window.hextable.state.encounter, null, 20000); await idle(page);
        await turnOf(page, 'fighter'); await select(page, 'fighter');
        await wait(page, () => document.querySelector('#ap-tabs [aria-selected="true"]')?.dataset.tab === 'attacks', null, 20000);
        await waitShown(page, '#ap-attacks', true, 15000);
        const t = await text(page, '#ap-attacks [data-row="atk:longsword"]');
        if (!/Longsword/.test(t) || !/to hit/.test(t) || !/reach 5 ft/.test(t) || !/Action/.test(t)) throw new Error(`the attack row says too little: ${t}`);
        if (await shown(page, '#actions')) throw new Error('the old bar is showing');
        await whole(page, '#ap-attacks');
      });

      await run.do('tapping an attack row arms it, the hint says so (the panel steps aside on a phone), Cancel puts it down', async () => {
        await tap('#ap-attacks [data-row="atk:longsword"]');
        await wait(page, () => window.hextable.mode.kind === 'attack' && window.hextable.mode.id === 'longsword');
        await waitShown(page, '#hint');
        if (!/Longsword: /.test(await text(page, '#hint-text'))) throw new Error('no hint');
        if (!(await page.$eval('#ap-attacks [data-row="atk:longsword"]', (b) => b.classList.contains('armed')))) throw new Error('the row does not show as armed');
        await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move' && !document.querySelector('#card').hasAttribute('data-collapsed'));
        if (await page.$eval('#ap-attacks [data-row="atk:longsword"]', (b) => b.classList.contains('armed'))) throw new Error('the row still shows as armed');
      });

      await run.do('Move: the speed left, Dash spends the action, the greyed rows say why on screen and a tap on one sends nothing', async () => {
        await visit(page, 'move');
        if (!/Speed left 30 ft/.test(await text(page, '#ap-move .ap-speed'))) throw new Error(`no speed meter: ${await text(page, '#ap-move')}`);
        for (const id of ['dash', 'disengage', 'dodge', 'hide', 'search']) if (!(await page.$(`#ap-move [data-row="${id}"]`))) throw new Error(`no ${id} row`);
        await tap('#ap-move [data-row="dash"]');
        await wait(page, () => window.hextable.state.encounter.budget.dashes === 1 && window.hextable.state.encounter.budget.action === 0); await idle(page);
        await wait(page, () => /Speed left 60 ft/.test(document.querySelector('#ap-move .ap-speed')?.textContent ?? ''));
        const r = await reasons(page, '#ap-move');
        const dodge = r.find((x) => x.row === 'dodge');
        if (!dodge || !dodge.seen || !/already used an action/.test(dodge.why)) throw new Error(`Dodge does not say why on screen: ${JSON.stringify(r)}`);
        if (r.some((x) => !x.seen || !x.why)) throw new Error(`a greyed row has no reason on screen: ${JSON.stringify(r.filter((x) => !x.seen || !x.why))}`);
        const n = await state(page, (S) => S.timeline.length);
        await page.evaluate(() => { document.querySelector('#ap-move [data-row="dodge"]').click(); });
        await waitShown(page, '#toast');
        if (!/already used an action/.test(await text(page, '#toast'))) throw new Error('the tap on a greyed row did not show its reason');
        await sleep(300);
        if ((await state(page, (S) => S.timeline.length)) !== n) throw new Error('a greyed row sent something');
        await whole(page, '#ap-move');
      });

      await run.do('Bonus: Second Wind is there, tapping it heals; then no Bonus Action is left and the tab says why', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 4 }));
        await wait(page, () => window.hextable.state.entities.fighter.hp === 4);
        await visit(page, 'bonus');
        await waitShown(page, '#ap-bonus [data-row="feat:secondWind"]');
        if ((await page.getAttribute('#ap-bonus [data-row="feat:secondWind"]', 'aria-disabled')) !== 'false') throw new Error('Second Wind is greyed with hit points missing and a Bonus Action to spend');
        const left = await state(page, (S) => S.entities.fighter.uses.secondWind);
        await tap('#ap-bonus [data-row="feat:secondWind"]');
        await wait(page, (n) => window.hextable.state.entities.fighter.uses.secondWind === n - 1 && window.hextable.state.entities.fighter.hp > 4, left); await idle(page);
        await wait(page, () => /No Bonus Action/.test(document.querySelector('#ap-bonus')?.textContent ?? ''));
        const r = await reasons(page, '#ap-bonus');
        if (!r.length || r.some((x) => !x.seen || !/Bonus Action/.test(x.why))) throw new Error(`rows are not greyed with the reason: ${JSON.stringify(r)}`);
        await whole(page, '#ap-bonus');
      });

      await run.do('Features: Second Wind shows its pips and how it comes back', async () => {
        await visit(page, 'features');
        const t = await text(page, '#ap-features [data-row="feat:secondWind"]');
        if (!/1 \/ 2/.test(t) || !/Back on a Short Rest/.test(t) || !/Bonus/.test(t)) throw new Error(`pips or recharge text missing: ${t}`);
      });

      await run.do('a rogue with nothing that costs a Bonus Action: the Bonus tab says so', async () => {
        await turnOf(page, 'rogue'); await select(page, 'rogue');
        await visit(page, 'bonus');
        if (!/Nothing this creature has costs a Bonus Action/.test(await text(page, '#ap-bonus'))) throw new Error(`the tab says: ${await text(page, '#ap-bonus')}`);
        await visit(page, 'move'); await visit(page, 'attacks');
      });

      await run.do('a cleric: Healing Word is on Bonus, the spell tab holds her spells, arming a spell works from either', async () => {
        await turnOf(page, 'cleric'); await select(page, 'cleric');
        await visit(page, 'bonus');
        await waitShown(page, '#ap-bonus [data-row="spell:healing-word"]');
        await tap('#ap-bonus [data-row="spell:healing-word"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'healing-word');
        await waitShown(page, '#hint'); await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move' && !document.querySelector('#card').hasAttribute('data-collapsed'));
        await panelTab(page, 'all');
        if (!/Sacred Flame/.test(await text(page, '#actions'))) throw new Error('the spell tab does not list her spells');
        if (!/^Spells$/.test(await text(page, '#ap-tab-all'))) throw new Error('the spell tab is not labelled Spells');
      });

      await run.do('on another\'s turn every Features row is greyed with the reason written on screen', async () => {
        await select(page, 'fighter');
        await wait(page, () => document.querySelector('#ap-tabs [aria-selected="true"]')?.dataset.tab === 'reactions');
        await visit(page, 'features');
        const r = await reasons(page, '#ap-features');
        if (!r.length || r.some((x) => !x.seen || !/isn't .+ turn/.test(x.why))) throw new Error(`reasons: ${JSON.stringify(r)}`);
      });

      await run.do('the DM selects a monster on its turn: its actions are under Attacks, and a tap arms or sends', async () => {
        const foe = await state(page, (S) => S.encounter.order.map((o) => o.id).find((i) => S.entities[i].side === 'foe' && S.entities[i].actions?.length && S.entities[i].tpl !== 'animated-flying-sword'));
        await turnOf(page, foe); await select(page, foe);
        await wait(page, () => document.querySelector('#ap-tabs [aria-selected="true"]')?.dataset.tab === 'attacks');
        await waitShown(page, '#ap-attacks');
        const names = await state(page, (S, i) => S.entities[i].actions.map((a) => a.id), foe);
        const have = await page.$$eval('#ap-attacks [data-row]', (b) => b.map((x) => x.dataset.row));
        if (names.join() !== have.map((x) => x.replace(/^act:/, '')).join()) throw new Error(`the actions ${names} are not the rows ${have}`);
        await whole(page, '#ap-attacks');
        const first = have.find((x) => !/multiattack/i.test(x));
        await tap(`#ap-attacks [data-row="${first}"]`);
        await wait(page, () => ['action'].includes(window.hextable.mode.kind) || window.hextable.mode.kind === 'move');
        if ((await state(page, () => window.hextable.mode.kind)) === 'action') { await waitShown(page, '#hint'); await page.click('#hint-cancel'); await wait(page, () => window.hextable.mode.kind === 'move'); }
      });

      await run.do('a flyer: Higher and Lower on the Move tab change the height the next move ends at', async () => {
        await turnOf(page, fly); await select(page, fly);
        await visit(page, 'move');
        await waitShown(page, '#ap-move [data-row="fly-up"]');
        const before = await text(page, '#ap-move [data-row="fly-up"]');
        await tap('#ap-move [data-row="fly-up"]');
        await wait(page, (b) => document.querySelector('#ap-move [data-row="fly-up"]')?.textContent.replace(/\s+/g, ' ').trim() !== b, before);
        if (!/Fly at 10 ft/.test(await text(page, '#ap-move [data-row="fly-up"]')) || !/Lower/.test(await text(page, '#ap-move [data-row="fly-down"]'))) throw new Error(`fly rows: ${await text(page, '#ap-move')}`);
        await tap('#ap-move [data-row="fly-down"]');
        await wait(page, () => /On the ground/.test(document.querySelector('#ap-move [data-row="fly-down"]')?.textContent ?? ''));
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=paneltabs.
export default async function (browser, url) {
  await tabs(browser, url, 'action panel tabs at 1280x800', { viewport: { width: 1280, height: 800 } });
  await tabs(browser, url, 'action panel tabs at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
