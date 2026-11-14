import { mkdirSync } from 'node:fs';
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closePanels, panelTab, settle, tapAt, onCanvas } from './lib.mjs';

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
        if (await shown(page, '#ap-spells')) throw new Error('the Spells tab is showing in front of the Attacks');
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
        await panelTab(page, 'spells');
        if (!/Sacred Flame/.test(await text(page, '#ap-spells'))) throw new Error('the spell tab does not list her spells');
        if (!/^Spells$/.test(await text(page, '#ap-tab-spells'))) throw new Error('the spell tab is not labelled Spells');
        if (await page.$('#ap-tab-all, #ap-all, #actions')) throw new Error('the old tab or bar is still in the page');
      });

      await run.do('the Spells tab: the slot strip stays whatever the sort, the sort is remembered, the filters combine', async () => {
        await visit(page, 'spells');
        const rows = () => page.$$eval('#ap-spells [data-row]', (b) => b.map((x) => x.dataset.row.replace(/^spell:/, '')));
        const strip = async (why) => {
          const r = await page.$eval('#ap-spells .ap-slots', (el) => { const q = el.getBoundingClientRect(), p = el.closest("#ap-spells").getBoundingClientRect(); return { txt: el.textContent.replace(/\s+/g, ' ').trim(), inside: q.height > 0 && q.top >= p.top - 1 && q.bottom <= p.bottom + 1 }; });
          if (!/Level 1/.test(r.txt) || !/2 of 2/.test(r.txt) || !r.inside) throw new Error(`the slot strip (${why}): ${JSON.stringify(r)}`);
        };
        await strip('level sort');
        for (const sort of ['name', 'school', 'time', 'level']) { await page.selectOption('#ap-spells [data-sort]', sort); await wait(page, (v) => document.querySelector('#ap-spells [data-sort]')?.value === v, sort); await strip(`${sort} sort`); }
        await page.selectOption('#ap-spells [data-sort]', 'name');
        await wait(page, () => localStorage.getItem('hextable.spellSort') === '"name"');
        if ((await rows()).join() !== 'cure-wounds,healing-word,sacred-flame,shield-of-faith') throw new Error(`by name: ${await rows()}`);
        await visit(page, 'move'); await visit(page, 'spells');
        if ((await page.$eval('#ap-spells [data-sort]', (x) => x.value)) !== 'name') throw new Error('the sort was not kept');
        await page.selectOption('#ap-spells [data-sort]', 'level');
        await tap('#ap-spells [data-filters]'); await waitShown(page, '#ap-spells .ap-filters');
        await tap('#ap-spells [data-f="level:cantrip"]'); await wait(page, () => document.querySelectorAll('#ap-spells [data-row]').length === 1);
        if ((await rows()).join() !== 'sacred-flame') throw new Error(`Cantrips: ${await rows()}`);
        await tap('#ap-spells [data-f="level:cantrip"]'); await tap('#ap-spells [data-f="level:prepared"]');
        await wait(page, () => document.querySelectorAll('#ap-spells [data-row]').length === 3);
        await tap('#ap-spells [data-f="kind:healing"]');
        await wait(page, () => document.querySelectorAll('#ap-spells [data-row]').length === 2);
        if ((await rows()).sort().join() !== 'cure-wounds,healing-word') throw new Error(`Prepared and Healing: ${await rows()}`);
        await tap('#ap-spells [data-f="cast:Bonus"]'); await wait(page, () => document.querySelectorAll('#ap-spells [data-row]').length === 1);
        if ((await rows()).join() !== 'healing-word') throw new Error(`Prepared, Healing and Bonus: ${await rows()}`);
        await tap('#ap-spells [data-f="can"]');
        await wait(page, () => /Filters \(4\)/.test(document.querySelector('#ap-spells [data-filters]').textContent));
        await tap('#ap-spells [data-clear]'); await wait(page, () => document.querySelectorAll('#ap-spells [data-row]').length === 4);
        await tap('#ap-spells [data-filters]'); await wait(page, () => !document.querySelector('#ap-spells .ap-filters'));
        await whole(page, '#ap-spells');
      });

      await run.do('a spell armed from the Spells tab collapses the panel on a phone, and Cancel brings it back', async () => {
        const narrow = await page.evaluate(() => matchMedia('(max-width: 600px)').matches);
        await visit(page, 'spells');
        await tap('#ap-spells [data-row="spell:sacred-flame"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'sacred-flame');
        await wait(page, (n) => document.querySelector('#card').hasAttribute('data-collapsed') === n, narrow);
        await waitShown(page, '#hint'); await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move' && !document.querySelector('#card').hasAttribute('data-collapsed'));
        await waitShown(page, '#ap-spells [data-row="spell:sacred-flame"]');
        await page.screenshot({ path: `/tmp/t4b/spells-${touch ? 'phone' : 'desktop'}.png` });
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

// ---------- the martial classes' choices in the panel (docs/specs/table-ui.md, "The martial classes in the action panel", #294) ----------
// A level 14 barbarian, a level 14 rogue, a level 15 monk and a level 13 fighter in a fight, solo as the DM. Brutal Strike (greyed until Reckless Attack, then
// chosen on a card, the attack armed with it and sent), Intimidating Presence's list of creatures, Cunning Strike's dice and its limit, the Focus Point rows,
// Self-Restoration's choice when the turn ends with two conditions, the standing instructions that are not Reactions, and the log's words for a reroll and a
// floored d20. Screenshots are left in /tmp/martial-screens. It runs at 1280x800 here and at 390x844 with touch from classes.mjs, so each file stays inside the time of its pass.
export async function martial(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, size = touch ? 'phone' : 'desktop';
    mkdirSync('/tmp/martial-screens', { recursive: true });
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      const shot = (n) => page.screenshot({ path: `/tmp/martial-screens/${size}-${n}.png` });
      const ids = {};
      const ev = (fn, a) => page.evaluate(fn, a);
      const sinceTl = () => state(page, (S) => S.timeline.length);
      const newest = (n) => state(page, (S, k) => S.timeline.slice(k), n);
      const card = async (why) => {                                        // the card is open, whole on screen, and its buttons are large enough to touch
        await waitShown(page, '#cp .cp-card');
        const box = await page.$eval('#cp .cp-card', (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; });
        if (box[0] < 0 || box[1] > box[4] || box[2] < 0 || box[3] > box[5]) throw new Error(`the card does not fit (${why}): ${JSON.stringify(box)}`);
        const small = await page.$$eval('#cp button', (b) => b.filter((x) => x.getBoundingClientRect().height < 40).map((x) => x.textContent));
        if (small.length) throw new Error(`a button is too small to touch (${why}): ${small}`);
      };
      const tapCreature = async (target) => {
        await settle(page, target);
        const pt = await ev((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), target);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('the target is off screen or under a panel');
        await tapAt(page, touch, pt.x, pt.y);
      };
      // A goblin next to `who`, in the fight, on the free hex around it that shows furthest from it on the screen (one behind its pawn cannot be tapped); returns its id.
      const foeBeside = async (who) => {
        await settle(page, who);
        const before = await state(page, (S) => Object.keys(S.entities));
        const around = await ev((i) => {
          const h = window.hextable, e = h.state.entities[i], me = h.R.screenOf(e.pos);
          return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => { const at = { q: e.pos.q + dq, r: e.pos.r + dr }, p = h.R.screenOf({ ...at, z: e.pos.z }); return { at, d: p ? Math.hypot(p.x - me.x, p.y - me.y) - (p.y > innerHeight * 0.55 ? 1000 : 0) - (p.y < 120 ? 1000 : 0) : -9999 }; }).sort((a, b) => b.d - a.d).map((x) => x.at);
        }, who);
        for (const at of around) {
          await ev((a) => window.hextable.act({ type: 'spawn', monster: 'goblin-warrior', at: a }), at);
          await idle(page);
          const made = await state(page, (S, b) => Object.keys(S.entities).filter((k) => !b.includes(k)), before);
          if (made.length) { await ev((i) => window.hextable.act({ type: 'setHp', actor: i, hp: window.hextable.state.entities[i].maxHp }), made[0]); return made[0]; }
        }
        throw new Error('no free hex beside the character');
      };
      const isIn = async (fighter) => state(page, (S, i) => !!S.encounter && S.encounter.order.some((o) => o.id === i), fighter);

      await run.do('four martial characters join the party and a fight starts', async () => {
        await open(page, url); await playSolo(page);
        await ev(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          const A = { str: 18, dex: 16, con: 14, int: 10, wis: 14, cha: 10 };
          const sheets = [
            { name: 'Ur', class: 'barbarian', level: 14, subclass: 'berserker', abilities: A, skills: ['athletics', 'survival', 'perception'], weapons: ['greataxe', 'shortbow'], choices: {}, spells: [] },
            { name: 'Sly', class: 'rogue', level: 14, subclass: 'thief', abilities: A, skills: ['stealth', 'perception', 'acrobatics', 'deception'], expertise: ['stealth', 'perception', 'acrobatics', 'deception'], weapons: ['rapier', 'shortbow'], gear: ["Poisoner's Kit"], choices: {}, spells: [] },
            { name: 'Lo', class: 'monk', level: 15, subclass: 'open-hand', abilities: { ...A, str: 10 }, skills: ['acrobatics', 'insight'], weapons: ['quarterstaff'], choices: {}, spells: [] },
            { name: 'Fi', class: 'fighter', level: 13, subclass: 'champion', abilities: A, skills: ['athletics', 'perception'], weapons: ['longsword'], choices: {}, spells: [] },
          ];
          const spots = [{ q: -3, r: 4 }, { q: -2, r: 4 }, { q: -1, r: 4 }, { q: 0, r: 4 }, { q: -4, r: 5 }, { q: -3, r: 5 }, { q: -2, r: 5 }, { q: -1, r: 5 }, { q: 0, r: 5 }, { q: 1, r: 4 }, { q: -4, r: 4 }];
          const nap = (ms) => new Promise((r) => setTimeout(r, ms));
          for (const s of sheets) {
            const r = D.derive(s); if (!r.record) throw new Error(JSON.stringify(D.validate(s)));
            for (const at of spots) {
              if (Object.values(h.state.entities).some((e) => e.pos && e.pos.q === at.q && e.pos.r === at.r)) continue;
              h.act({ type: 'addCharacter', record: r.record, at: { ...at, z: 0 } }); await nap(300);
              if (Object.values(h.state.entities).some((e) => e.name === s.name)) break;
            }
          }
        });
        for (const n of ['Ur', 'Sly', 'Lo', 'Fi']) {
          await wait(page, (nm) => Object.values(window.hextable.state.entities).some((e) => e.name === nm), n);
          ids[n] = await state(page, (S, nm) => Object.values(S.entities).find((e) => e.name === nm).id, n);
        }
        await ev(() => window.hextable.act({ type: 'startEncounter', center: { q: -2, r: 4 }, radius: 8 }));
        await wait(page, () => !!window.hextable.state.encounter, null, 20000); await idle(page);
        for (const n of Object.keys(ids)) if (!(await isIn(ids[n]))) throw new Error(`${n} is not in the fight`);
      });

      await run.do('Brutal Strike: its row is greyed until Reckless Attack, and says so on screen', async () => {
        await turnOf(page, ids.Ur); await select(page, ids.Ur);
        await visit(page, 'attacks');
        const rows = await page.$$eval('#ap-attacks [data-row]', (b) => b.map((x) => x.dataset.row));
        if (rows.join() !== 'atk:greataxe,strike:greataxe,atk:shortbow') throw new Error(`attack rows: ${rows}`);
        const r = (await reasons(page, '#ap-attacks')).find((x) => x.row === 'strike:greataxe');
        if (!r || !r.seen || !/needs Reckless Attack this turn/.test(r.why)) throw new Error(`no reason on screen: ${JSON.stringify(r)}`);
        await shot('1-brutal-greyed');
        const n = await sinceTl();
        await page.evaluate(() => { document.querySelector('#ap-attacks [data-row="strike:greataxe"]').click(); });
        await waitShown(page, '#toast');
        await sleep(200);
        if ((await sinceTl()) !== n || (await shown(page, '#cp .cp-card'))) throw new Error('a greyed row opened a card or sent something');
      });

      await run.do('Brutal Strike: after Reckless Attack the card offers the four options, the attack is armed with the one chosen and sent with it', async () => {
        await ev((u) => window.hextable.act({ type: 'feature', actor: u, feature: 'reckless-attack' }), ids.Ur); await idle(page);
        await wait(page, (u) => window.hextable.state.encounter.flags[`reckless-attack:${u}`], ids.Ur);
        const foe = await foeBeside(ids.Ur);
        await visit(page, 'attacks');
        await tap('#ap-attacks [data-row="strike:greataxe"]'); await card('Brutal Strike');
        const opts4 = await page.$$eval('#cp [data-brutal]', (b) => b.map((x) => x.dataset.brutal));
        if (opts4.join() !== 'forceful-blow,hamstring-blow,staggering-blow,sundering-blow') throw new Error(`options: ${opts4}`);
        await shot('2-brutal-card');
        await tap('#cp [data-brutal="hamstring-blow"]');
        await wait(page, () => document.querySelector('#cp [data-brutal="hamstring-blow"]')?.getAttribute('aria-pressed') === 'true');
        await tap('#cp-use'); await waitShown(page, '#cp', false);
        await wait(page, () => window.hextable.mode.kind === 'attack' && window.hextable.mode.extra?.brutal === 'hamstring-blow');
        await waitShown(page, '#hint');
        if (!/with Hamstring Blow/.test(await text(page, '#hint'))) throw new Error(`the hint: ${await text(page, '#hint')}`);
        const collapsed = await page.evaluate(() => matchMedia('(max-width: 600px)').matches);
        await wait(page, (c) => document.querySelector('#card').hasAttribute('data-collapsed') === c, collapsed);
        await shot('3-brutal-armed');
        const n = await sinceTl();
        await tapCreature(foe);
        await wait(page, (i) => window.hextable.state.encounter.flags[`brutal:${i}`] === true, ids.Ur, 20000); await idle(page);
        const types = (await newest(n)).map((e) => e.type);
        if (!types.includes('attack')) throw new Error(`no attack: ${types}`);
        if ((await state(page, () => window.hextable.mode.kind)) !== 'move') throw new Error('the attack stays armed');
      });

      await run.do('Intimidating Presence: a card lists the creatures within 30 ft, "All foes" picks them, and the use goes out to them', async () => {
        await select(page, ids.Ur); await foeBeside(ids.Ur);          // the goblin struck above may be down
        await visit(page, 'features');
        await tap('#ap-features [data-row="feat:intimidating-presence"]'); await card('Intimidating Presence');
        await tap('#cp-foes');
        await wait(page, () => document.querySelectorAll('#cp [data-pick]:checked').length >= 1);
        await shot('4-intimidating');
        const picked = await page.$$eval('#cp [data-pick]:checked', (b) => b.map((x) => x.dataset.pick));
        const n = await sinceTl();
        await tap('#cp-use'); await waitShown(page, '#cp', false);
        await wait(page, (u) => window.hextable.state.entities[u].uses['intimidating-presence'] === 0, ids.Ur, 20000); await idle(page);
        const saves = (await newest(n)).filter((e) => e.type === 'save').map((e) => e.id);
        if (!picked.every((i) => saves.includes(i))) throw new Error(`picked ${picked}, saves ${saves}`);
      });

      await run.do('Cunning Strike: the card shows the dice, stops at two effects, greys the gear and hiding it lacks, and the attack goes with the picks', async () => {
        await ev((u) => window.hextable.act({ type: 'endTurn', actor: u }), ids.Ur); await idle(page);
        await turnOf(page, ids.Sly); await select(page, ids.Sly);
        const foe = await foeBeside(ids.Sly);
        await visit(page, 'attacks');
        await waitShown(page, '#ap-attacks [data-row="strike:rapier"]');
        await shot('5-rogue-attacks');
        await tap('#ap-attacks [data-row="strike:rapier"]'); await card('Cunning Strike');
        await tap('#cp [data-cunning="poison"] input'); await tap('#cp [data-cunning="trip"] input');
        await wait(page, () => /2 of 7 dice spent/.test(document.querySelector('#cp .cp-card').textContent));
        const off = await page.$$eval('#cp .cp-opt.off', (b) => b.map((x) => `${x.dataset.cunning}: ${x.textContent.replace(/\s+/g, ' ').trim()}`));
        if (!off.some((x) => /^withdraw: .*Only 2 effects an attack/.test(x)) || !off.some((x) => /^stealth-attack: .*made while hidden/.test(x))) throw new Error(`greyed options: ${off}`);
        await shot('6-cunning-card');
        await tap('#cp-use'); await waitShown(page, '#cp', false);
        await wait(page, () => (window.hextable.mode.extra?.cunning ?? []).join() === 'poison,trip');
        const n = await sinceTl();
        await tapCreature(foe);
        try { await wait(page, (k) => window.hextable.state.timeline.slice(k).some((e) => e.type === 'attack'), n, 12000); }
        catch (err) { await shot('fail'); throw new Error(`no attack was sent (toast: "${await page.$eval('#toast', (x) => x.textContent).catch(() => '')}", mode: ${JSON.stringify(await state(page, () => window.hextable.mode))}, turn: ${await cur(page)}): ${err.message.split('\n')[0]}`); }
        await idle(page);
      });

      await run.do('the monk: the Focus Point rows say what they spend, and a turn that ends with two conditions asks which Self-Restoration ends', async () => {
        await ev((u) => window.hextable.act({ type: 'endTurn', actor: u }), ids.Sly); await idle(page);
        await turnOf(page, ids.Lo); await select(page, ids.Lo);
        await visit(page, 'features');
        const t = await text(page, '#ap-features [data-row="feat:patient-defense"]');
        if (!/Spend 1 Focus Point: Disengage and Dodge/.test(t)) throw new Error(`Patient Defense: ${t}`);
        if (!/Disengage and Dash/.test(await text(page, '#ap-features [data-row="feat:step-of-the-wind"]'))) throw new Error('Step of the Wind');
        await shot('7-monk-features');
        for (const c of ['charmed', 'frightened']) {
          await ev(([u, k]) => window.hextable.act({ type: 'condition', actor: u, condition: k, on: true }), [ids.Lo, c]); await idle(page);
          await wait(page, ([u, k]) => window.hextable.state.entities[u].cond[k], [ids.Lo, c]);
        }
        const n = await sinceTl();
        await tap('#btn-end'); await card('Self-Restoration');
        const conds = await page.$$eval('#cp [data-cure]', (b) => b.map((x) => x.dataset.cure));
        if (!conds.includes('charmed') || !conds.includes('frightened') || conds.some((c) => !['charmed', 'frightened', 'poisoned'].includes(c))) throw new Error(`conditions offered: ${conds}`);
        await shot('8-cure-card');
        await tap('#cp [data-cure="frightened"]'); await waitShown(page, '#cp', false);
        await wait(page, (u) => !window.hextable.state.entities[u].cond.frightened, ids.Lo, 20000); await idle(page);
        if (!(await state(page, (S, u) => !!S.entities[u].cond.charmed, ids.Lo))) throw new Error('both ended');
        const types = (await newest(n)).map((e) => e.type);
        if (types.includes('manual')) throw new Error(`the DM was handed the choice: ${types}`);
      });

      await run.do('another\'s turn: the fighter\'s Reactions tab lists Indomitable apart from the Reactions, and setting it is sent', async () => {
        if ((await cur(page)) === ids.Fi) { await ev((u) => window.hextable.act({ type: 'endTurn', actor: u }), ids.Fi); await idle(page); }          // the Reactions tab is for another's turn
        await select(page, ids.Fi);
        await panelTab(page, 'reactions');
        await waitShown(page, '#ap-reactions [data-rx-group="free"]');
        const g = await text(page, '#ap-reactions [data-rx-group="free"]');
        if (!/not Reactions/.test(g) || !/does nothing until you set it to Always/.test(g) || !/Indomitable/.test(g)) throw new Error(`the free group: ${g}`);
        if (await page.$('#ap-reactions .rx:not(.rx-free) [data-rx-set="indomitable"]')) throw new Error('Indomitable is listed among the Reactions');
        await shot('9-reactions-free');
        await page.selectOption('#ap-rx-indomitable', 'always');
        await wait(page, (u) => window.hextable.state.entities[u].reactions?.indomitable === 'always', ids.Fi);
        await wait(page, () => /Spends a use when it applies/.test(document.querySelector('#ap-reactions [data-rx-group="free"]')?.textContent ?? ''));
        await panelTab(page, 'features');
        if (!/Standing instruction: Always/.test(await text(page, '#ap-features [data-row="feat:indomitable"]'))) throw new Error('the Features row does not say what it is set to');
      });

      await run.do('the log says a save was rolled again and a d20 was floored', async () => {
        const words = await page.evaluate((u) => {
          const h = window.hextable;
          return [
            h.describe({ type: 'save', id: u, abil: 'wis', dc: 16, roll: 15, total: 17, success: true, reroll: { name: 'Indomitable', was: 3, add: 13 } }),
            h.describe({ type: 'check', id: u, ability: 'dex', skill: 'stealth', roll: 10, total: 18, floor: { name: 'Reliable Talent', value: 10, was: 4 } }),
          ];
        }, ids.Fi);
        if (!/Indomitable: rolled again, the first roll was 3 and \+13 is added/.test(words[0])) throw new Error(`save: ${words[0]}`);
        if (!/Reliable Talent: the d20 showed 4 and counts as 10/.test(words[1])) throw new Error(`check: ${words[1]}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=paneltabs.
export default async function (browser, url) {
  await tabs(browser, url, 'action panel tabs at 1280x800', { viewport: { width: 1280, height: 800 } });
  await tabs(browser, url, 'action panel tabs at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await martial(browser, url, 'martial classes in the action panel at 1280x800', { viewport: { width: 1280, height: 800 } });
}
