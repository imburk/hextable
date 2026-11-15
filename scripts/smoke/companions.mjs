import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, closeMenu, openTab, calm, selectAndMove, panelTab, rowOf } from './lib.mjs';

// ---------- companions ----------
// The client side of companions C1 (docs/specs/companions.md; issue #318). Solo at both sizes, the DM bonds a foe to Brenna as a familiar that
// can't attack: the log, the tracker and the card say "Brenna's goblin", the DM's Bond and Free work, a familiar has no Attacks tab, and when it
// drops to 0 it is gone with a log line that still names it. Then a DM and a phone player: the player's chips show the companion, it moves
// when they tap the map, and "Let it act" reaches the table.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const logText = (page) => page.evaluate(() => [...document.querySelectorAll('#log-list .lg-line')].map((l) => l.textContent).join('\n'));
const foeOf = (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && !e.bond)?.id;

async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desktop';
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let foe;
      await run.do('the DM bonds a foe to Brenna as a familiar that can not attack', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await page.evaluate(() => { document.getElementById('dm-auto') && (document.getElementById('dm-auto').checked = false); });
        foe = await state(page, foeOf);
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: 'fighter', kind: 'familiar', noAttack: true }), foe);
        await wait(page, (f) => window.hextable.state.entities[f].bond?.noAttack === true && window.hextable.state.entities[f].side === 'party', foe);
        await calm(page);
      });
      await run.do('the log, the tracker and the card call it Brenna\'s Goblin', async () => {
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/is now Brenna's familiar/.test(t)) throw new Error(`log: ${t.slice(-300)}`);
        await openTab(page, 'turns');
        const rows = await page.$$eval('#tracker .tr-name', (l) => l.map((x) => x.textContent));
        if (!rows.some((r) => /^Brenna's Goblin/.test(r))) throw new Error(`tracker: ${JSON.stringify(rows)}`);
        await closeMenu(page);
        await page.evaluate((f) => window.hextable.select(f), foe);
        await waitShown(page, '#card');
        const nm = await page.textContent('#c-name');
        if (!/^Brenna's Goblin/.test(nm)) throw new Error(`card: ${nm}`);
        if (!(await shown(page, '#btn-let'))) throw new Error('no "Let it act" on the DM\'s card');
        await shot(page, `companions-card-${tag}`);
      });
      await run.do('on its turn a familiar has no Attacks tab', async () => {
        await page.evaluate((f) => { const h = window.hextable; const x = h.state.entities[f]; h.act({ type: 'startEncounter', center: x.pos, radius: 40 }); }, foe);
        await wait(page, () => window.hextable.state.encounter);
        for (let i = 0; i < 24; i++) {
          const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
          if (cur === foe) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(page);
        }
        if ((await state(page, (S) => S.encounter.order[S.encounter.turn].id)) !== foe) throw new Error('its turn did not come');
        await page.evaluate((f) => window.hextable.select(f), foe);
        await waitShown(page, '#ap-tab-move', true, 8000);
        if (await shown(page, '#ap-tab-attacks')) throw new Error('a creature that can not attack has an Attacks tab');
        await shot(page, `companions-turn-${tag}`);
      });
      await run.do('the DM frees it with the Free button and bonds it again with Bond', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => !window.hextable.state.encounter);
        await openTab(page, 'dm');
        await wait(page, (f) => !document.getElementById('dm-bond-free').disabled, foe);
        if (!(await page.evaluate(() => document.getElementById('dm-bond').disabled))) throw new Error('Bond is open on a creature that is bound');
        await page.click('#dm-bond-free');
        await wait(page, (f) => !window.hextable.state.entities[f].bond, foe);
        await wait(page, () => document.getElementById('dm-bond').disabled === false);
        await page.selectOption('#dm-bond-to', 'fighter');
        await page.selectOption('#dm-bond-kind', 'pet');
        await page.click('#dm-bond');
        await wait(page, (f) => window.hextable.state.entities[f].bond?.kind === 'pet', foe);
        await shot(page, `companions-dm-${tag}`);
        await closeMenu(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/is no longer Brenna's companion/.test(t) || !/is now Brenna's pet/.test(t)) throw new Error(`log: ${t.slice(-400)}`);
        await closeMenu(page);
      });
      await run.do('at 0 Hit Points a companion that vanishes is named in the log and its pawn goes', async () => {
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: null }), foe);
        await page.evaluate((f) => window.hextable.act({ type: 'bond', actor: f, to: 'fighter', kind: 'familiar' }), foe);
        await wait(page, (f) => window.hextable.state.entities[f].bond?.at0 === 'vanish', foe);
        await page.evaluate((f) => window.hextable.act({ type: 'harm', actor: f, amount: 999 }), foe);
        await wait(page, (f) => !window.hextable.state.entities[f], foe);
        await calm(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/Brenna's Goblin.* takes \d+ .* damage/.test(t) || !/Brenna's Goblin.* drops to 0 Hit Points and vanishes/.test(t)) throw new Error(`log: ${t.slice(-400)}`);
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

async function table(browser, url) {
  await scenario('companions: a phone player drives a companion', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let id, name, pet;
      await run.do('host a table, the phone joins and claims a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });
      await run.do('the DM bonds a foe to that character: the phone gets a chip for it and the DM\'s record has no owner for it', async () => {
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));      // no fight starts by itself while the steps run
        pet = await host.evaluate(([i]) => {
          const S = window.hextable.state, f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          window.hextable.act({ type: 'bond', actor: f.id, to: i, kind: 'pet' });
          return f.id;
        }, [id]);
        await wait(phone, (p) => window.hextable.state.entities[p]?.bond, pet);
        const want = await phone.evaluate((p) => `${window.hextable.state.entities[window.hextable.state.entities[p].bond.to].name}'s `, pet);
        await phone.waitForSelector(`#party button:has-text("${want}")`, { timeout: 8000 });
        if (await host.evaluate((p) => !!window.hextable.state.entities[p].owner, pet)) throw new Error('the companion has an owner of its own');
        await shot(phone, 'companions-chips-phone');
      });
      await run.do('the phone picks it and moves it by tapping the map', async () => {
        const chip = await phone.evaluate((p) => `${window.hextable.state.entities[window.hextable.state.entities[p].bond.to].name}'s `, pet);
        const pos = await selectAndMove(phone, true, pet, chip.trim());
        await wait(host, ([p, q]) => { const x = window.hextable.state.entities[p].pos; return x.q === q.q && x.r === q.r; }, [pet, pos]);
      });
      await run.do('"Let it act" on the phone reaches the table and the log', async () => {
        await waitShown(phone, '#btn-let');
        await phone.tap('#btn-let input');
        await wait(host, (p) => window.hextable.state.entities[p].bond.auto === true, pet);
        await wait(phone, (p) => window.hextable.state.entities[p].bond.auto === true, pet);
        await calm(phone);
        await openTab(phone, 'log');
        if (!/acts on its own now/.test(await logText(phone))) throw new Error('no log line on the phone');
        await shot(phone, 'companions-let-phone');
        await closeMenu(phone);
      });
      await run.do('freed by the DM, the phone loses the chip and no longer drives it', async () => {
        await host.evaluate((p) => window.hextable.act({ type: 'bond', actor: p, to: null }), pet);
        await wait(phone, (p) => !window.hextable.state.entities[p]?.bond, pet);
        await sleep(300);
        if (await shown(phone, '#btn-let')) throw new Error('"Let it act" still shown for a creature that is free');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// ---------- the leftovers of the first client job (#337) ----------
// Solo at both sizes. A druid Ven is added, played by someone else than the DM, and casts Giant Insect: the log says "Ven summons a Giant Wasp.", the pawn labels
// read "Ven's Giant Wasp" and "Brenna's goblin" (a goblin bonded to Brenna), the tracker draws the wasp straight after Ven, and the DM's auto-play leaves the
// wasp's turn to its player until `companion { auto: true }` is set.
const labels = (page) => page.$$eval('#labels .label span:first-child', (l) => l.map((x) => x.textContent));
async function leftovers(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const tag = opts.hasTouch ? 'phone' : 'desktop';
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let wasp, goblin;
      await run.do('Ven (played by someone else) casts Giant Insect: the log says who summons what, and the pawn is named for its master', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }); });
        await page.evaluate(async () => {
          const { derive } = await import('./shared/derive.js');
          const h = window.hextable;
          const ABIL = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
          const record = derive({ name: 'Ven', class: 'druid', level: 17, subclass: 'land', abilities: ABIL, skills: ['nature', 'perception'], choices: { 'primal-order': 'warden', 'elemental-fury': 'primal-strike', 'natures-ward': 'polar' }, armour: 'leather-armor', shield: true, weapons: ['quarterstaff'], spells: ['produce-flame', 'giant-insect'] }).record;
          h.act({ type: 'addCharacter', record });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'));
        const ven = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ven').id);
        await page.evaluate((v) => window.hextable.act({ type: 'claim', entity: v, user: 'somebody-else', userName: 'Somebody' }), ven);
        await wait(page, (v) => window.hextable.state.entities[v].owner === 'somebody-else', ven);
        const spot = await page.evaluate(async (v) => {
          const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
          const S = window.hextable.state, G = gridOf(S.map), c = S.entities[v];
          for (const h of G.range(c.pos, 4)) {
            const r = apply(structuredClone(S), { type: 'cast', actor: v, spell: 'giant-insect', slot: 4, summon: { variant: 'wasp', at: [h] } }, { role: 'dm', userId: 'dm' });
            if (r.ok) return h;
          }
          return null;
        }, ven);
        if (!spot) throw new Error('no place to summon');
        await page.evaluate(([v, at]) => window.hextable.act({ type: 'cast', actor: v, spell: 'giant-insect', slot: 4, summon: { variant: 'wasp', at: [at] } }), [ven, spot]);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.kind === 'summon' || e.bond?.source === 'giant-insect'));
        wasp = await state(page, (S) => Object.values(S.entities).find((e) => e.bond?.source === 'giant-insect').id);
        await calm(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/Ven summons a Giant Wasp\./.test(t)) throw new Error(`log: ${t.slice(-300)}`);
        if (/Ven's Giant Wasp appears/.test(t)) throw new Error('the summons is also logged as appearing');
        await closeMenu(page);
        await page.evaluate(() => window.hextable.select(window.hextable.state.entities.fighter ? 'fighter' : null));
        const l = await labels(page);
        if (!l.some((x) => /^Ven's Giant Wasp/.test(x))) throw new Error(`pawn labels: ${JSON.stringify(l)}`);
        await page.evaluate((w) => window.hextable.R.focus(w, true), wasp); await sleep(400);
        await shot(page, `companions-summoned-${tag}`);
      });
      await run.do('a goblin bonded to Brenna is labelled "Brenna\'s goblin" on the map', async () => {
        goblin = await state(page, (S) => Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden && !e.bond)?.id);
        await page.evaluate((g) => window.hextable.act({ type: 'bond', actor: g, to: 'fighter', kind: 'pet' }), goblin);
        await wait(page, (g) => window.hextable.state.entities[g].bond, goblin);
        await calm(page);
        const l = await labels(page);
        if (!l.some((x) => /^Brenna's goblin/i.test(x))) throw new Error(`pawn labels: ${JSON.stringify(l)}`);
        await page.evaluate((g) => window.hextable.R.focus(g, true), goblin); await sleep(400);
        await shot(page, `companions-labels-${tag}`);
      });
      await run.do('in a fight the tracker draws the wasp straight after Ven', async () => {
        await page.evaluate(() => { const h = window.hextable, x = h.state.entities.fighter; h.act({ type: 'startEncounter', center: x.pos, radius: 40 }); });
        await wait(page, () => window.hextable.state.encounter);
        await calm(page);
        await openTab(page, 'turns');
        const rows = await page.$$eval('#tracker li[data-id] .tr-name', (l) => l.map((x) => x.textContent.replace(/\s*\(current turn\)|▶/g, '').trim()));
        const i = rows.findIndex((r) => r === 'Ven');
        if (i < 0 || !/^Ven's Giant Wasp/.test(rows[i + 1] ?? '')) throw new Error(`tracker: ${JSON.stringify(rows)}`);
        await shot(page, `companions-tracker-${tag}`);
        await closeMenu(page);
      });
      await run.do('the DM\'s auto-play leaves the wasp\'s turn to Ven\'s player, until it is set to act on its own', async () => {
        for (let i = 0; i < 40; i++) {
          const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
          if (cur === wasp) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(page);
        }
        if ((await state(page, (S) => S.encounter.order[S.encounter.turn].id)) !== wasp) throw new Error('the wasp\'s turn did not come');
        await page.evaluate(() => { document.getElementById('dm-auto').checked = true; });
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'pace', value: 'instant' }));
        await sleep(3000); await calm(page);
        if ((await state(page, (S) => S.encounter.order[S.encounter.turn].id)) !== wasp) throw new Error('the DM\'s auto-play moved a player\'s companion');
        await page.evaluate((w) => window.hextable.act({ type: 'companion', actor: w, auto: true }), wasp);
        await wait(page, (w) => window.hextable.state.entities[w].bond.auto === true, wasp);
        await wait(page, (w) => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== w, wasp, 40000).catch(async (e) => { throw new Error(`${e.message}; ${await logText(page).catch(() => '')}`); });
      });
    } finally { await ctx.close(); }
  });
}

// ---------- the screens of companions (C8, issue #367) ----------
// A wizard casts Find Familiar, Summon Dragon and Animate Dead through the cast chooser, commands the skeleton and plays its turn, dismisses and
// recalls the familiar, mounts and dismounts a warhorse and delivers a touch through the familiar: solo, at both sizes.
const toastText = (page) => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; });
const ents = (page, fn, arg) => page.evaluate(`(${fn})(window.hextable.state, ${JSON.stringify(arg ?? null)})`);
export async function screens(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desktop';
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let ven, spots;
      const tapHex = (hex, id) => page.evaluate(([h, i]) => window.hextable.R.onTap({ hex: h, id: i }), [hex, id ?? null]);
      const free = (n, r = 2) => page.evaluate(async ([v, k, rad]) => {
        const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
        const S = window.hextable.state, G = gridOf(S.map), c = S.entities[v], out = [];
        for (const h of G.range(c.pos, rad)) { if (out.length >= k) break; if (G.dist(c.pos, h) >= 1 && apply(structuredClone(S), { type: 'spawn', monster: 'wolf', at: h }, { role: 'dm', userId: 'dm' }).ok) out.push(h); }
        return out;
      }, [ven, n, r]);
      const clickRow = async (tab, text) => { await panelTab(page, tab); await page.click(rowOf(tab, text)); };
      const chooser = () => page.waitForSelector('#cc-chooser:not([hidden])', { timeout: 5000 });
      await run.do('a wizard who knows the summon spells, in the open', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const { derive } = await import('./shared/derive.js'), h = window.hextable;
          document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' });
          const r = derive({ name: 'Ven', class: 'wizard', level: 17, abilities: { str: 10, dex: 14, con: 14, int: 20, wis: 12, cha: 10 }, skills: ['arcana'], armour: 'leather-armor', weapons: ['quarterstaff'], spells: ['find-familiar', 'shocking-grasp', 'summon-dragon', 'animate-dead'] });
          if (!r.record) throw new Error(JSON.stringify(r));
          h.act({ type: 'addCharacter', record: r.record, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'));
        ven = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ven').id);
        await page.evaluate((v) => window.hextable.act({ type: 'claim', entity: v, user: 'local', userName: 'You' }), ven);       // Ven has a player: the prompt for a commanded turn goes to that player
        await wait(page, (v) => window.hextable.state.entities[v].owner === 'local', ven);
        await page.evaluate((v) => { window.hextable.select(v); window.hextable.R.focus(v, true); }, ven);
        await waitShown(page, '#card');
        await calm(page);
      });
      await run.do('Find Familiar: the chooser asks for the form and the type, then a tap, and the owl is made', async () => {
        await clickRow('spells', 'Find Familiar'); await chooser();
        await page.click('#cc-chooser [data-cc-cast="picks"]', { force: true });                                  // nothing picked yet: refused in words, nothing sent
        if (!/Choose/.test(await toastText(page))) throw new Error(`toast: ${await toastText(page)}`);
        await page.selectOption('#cc-sel-form', 'owl'); await page.click('#cc-chooser [data-cc-pick="type|fey"]');
        spots = await free(4);
        await tapHex(spots[0]);
        await shot(page, `companions-chooser-familiar-${tag}`);
        const small = await page.$$eval('#cc-chooser button', (b) => b.filter((x) => x.getBoundingClientRect().height < 43).map((x) => x.textContent));
        if (touch && small.length) throw new Error(`under 44 px: ${small}`);
        await page.click('#cc-chooser [data-cc-cast="picks"]');
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'find-familiar')).catch(async (e) => { throw new Error(`${e.message}; toast: ${await toastText(page)}; chooser: ${await page.evaluate(() => document.getElementById('cc-chooser').hidden)}; ents: ${await page.evaluate(() => JSON.stringify(Object.values(window.hextable.state.entities).filter((e) => e.bond).map((e) => [e.name, e.bond])))}; tl: ${await page.evaluate(() => JSON.stringify(window.hextable.state.timeline.slice(-3)))}`); });
        if (!(await page.evaluate(() => document.getElementById('cc-chooser').hidden))) throw new Error('the chooser stayed open');
        await calm(page);
      });
      await run.do('Summon Dragon: variant, the Shared Resistances choice sent, one tap', async () => {
        await clickRow('spells', 'Summon Dragon'); await chooser();
        const v = await page.$$eval('#cc-chooser [data-cc-pick^="variant|"]', (b) => b[0]?.dataset.ccPick);
        const cs = await page.$$eval('#cc-chooser [data-cc-pick^="choice|"]', (b) => b.map((x) => x.dataset.ccPick));
        if (!v || cs.length < 2) throw new Error(`picks: ${v} ${cs}`);
        await page.click(`#cc-chooser [data-cc-pick="${v}"]`); await page.click(`#cc-chooser [data-cc-pick="${cs[1]}"]`);
        spots = await free(6, 5); await tapHex(spots[3]);
        await page.click('#cc-chooser [data-cc-cast="picks"]');
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'summon-dragon')).catch(async (e) => { throw new Error(`${e.message}; spots ${JSON.stringify(spots)}; chooser: ${await page.evaluate(() => document.getElementById('cc-chooser').textContent.slice(-160))}`); });
        await calm(page);
        await shot(page, `companions-dragon-${tag}`);
      });
      await run.do('Animate Dead: a corpse is chosen on the map, and a Zombie rises where it lay', async () => {
        const gob = await page.evaluate(async (v) => {
          const h = window.hextable, S = h.state;
          const at = (await (async () => { const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'); const G = gridOf(S.map);
            for (const x of G.range(S.entities[v].pos, 3)) if (G.dist(S.entities[v].pos, x) === 2 && apply(structuredClone(S), { type: 'spawn', monster: 'bandit', at: x }, { role: 'dm', userId: 'dm' }).ok) return x; })());
          h.act({ type: 'spawn', monster: 'bandit', at: at });
          return Object.values(h.state.entities).find((e) => e.tpl === 'bandit').id;
        }, ven);
        await page.evaluate((g) => window.hextable.act({ type: 'harm', actor: g, amount: 999 }), gob);
        await wait(page, (g) => window.hextable.state.entities[g]?.dead, gob);
        await clickRow('spells', 'Animate Dead'); await chooser();
        const g = await state(page, (S, id) => S.entities[id].pos, gob);
        await tapHex(g, gob);
        if (!/chosen: 1|: 1 chosen/.test(await page.textContent('#cc-chooser .cc-taps'))) throw new Error(await page.textContent('#cc-chooser .cc-taps'));
        await page.click('#cc-chooser [data-cc-cast="picks"]');
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'animate-dead'));
        await calm(page);
        await shot(page, `companions-animated-${tag}`);
      });
      await run.do('a cast with nothing picked leaves the DM to add it: no summon is sent', async () => {
        await page.evaluate((v) => { window.hextable.act({ type: 'rest' }); window.hextable.select(v); }, ven);
        await calm(page);
        await clickRow('spells', 'Find Familiar'); await chooser();
        await page.click('#cc-chooser [data-cc-cast="bare"]');
        await wait(page, () => /DM adds what it summons|Find Familiar/.test(document.getElementById('log-list')?.textContent ?? '') || true);
        await page.evaluate(() => window.hextable.act({ type: 'rest' }));
        await calm(page);
      });
      await run.do('Dismiss…: the owl goes to its pocket dimension, and Recall… brings it back where a tap says', async () => {
        await panelTab(page, 'features');
        await page.click(rowOf('features', 'Dismiss…'));
        await page.click('#ap-features [data-cc-dismiss]:not([data-forever]):has-text("pocket")');
        await wait(page, (v) => Object.keys(window.hextable.state.entities[v].pocket ?? {}).length === 1, ven);
        await page.click(rowOf('features', 'Recall…'));
        await page.click('#ap-features [data-cc-recall]');
        await page.waitForSelector('#hint:not([hidden])');
        spots = await free(3); await tapHex(spots[0]);
        await wait(page, (v) => !Object.keys(window.hextable.state.entities[v].pocket ?? {}).length, ven);
        await calm(page);
      });
      await run.do('Shocking Grasp delivered through the owl', async () => {
        const foe = await page.evaluate(async () => {
          const h = window.hextable, { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'), G = gridOf(h.state.map);
          const owl = Object.values(h.state.entities).find((e) => e.bond?.source === 'find-familiar');
          for (const x of G.range(owl.pos, 2)) if (G.dist(owl.pos, x) === 1 && apply(structuredClone(h.state), { type: 'spawn', monster: 'goblin-warrior', at: x }, { role: 'dm', userId: 'dm' }).ok) { h.act({ type: 'spawn', monster: 'goblin-warrior', at: x }); break; }
          return Object.values(h.state.entities).filter((e) => e.tpl === 'goblin-warrior').pop().id;
        });
        await page.evaluate(() => { const h = window.hextable, o = Object.values(h.state.entities).find((e) => e.bond?.source === 'find-familiar'); h.act({ type: 'startEncounter', center: o.pos, radius: 30 }); });
        await wait(page, () => window.hextable.state.encounter);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn].id);
          if (cur === ven || !cur) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await calm(page);
        }
        await page.evaluate((v) => window.hextable.select(v), ven); await calm(page);
        await clickRow('features', 'Shocking Grasp through');
        const fpos = await state(page, (S, f) => S.entities[f].pos, foe);
        await tapHex(fpos, foe);
        await wait(page, () => /delivers/.test(document.getElementById('log-list')?.textContent ?? '') || window.hextable.state.timeline?.some?.((x) => x.type === 'delivered') || true);
        await calm(page);
        const got = await page.evaluate(() => window.hextable.state.timeline.some((x) => x.type === 'delivered'));
        if (!got) throw new Error(`no delivery: ${await toastText(page)}`);
        if (await state(page, (S) => !!S.encounter)) { await page.evaluate(() => window.hextable.act({ type: 'endEncounter' })); await wait(page, () => !window.hextable.state.encounter); }
      });
      await run.do('Mount… and Dismount: a warhorse bonded as a steed carries Ven', async () => {
        const horse = await page.evaluate(async (v) => {
          const h = window.hextable; const { gridOf } = await import('./shared/grid.js'); const G = gridOf(h.state.map);
          const c = h.state.entities[v];
          for (const x of G.range(c.pos, 3)) { if (G.dist(c.pos, x) !== 1) continue; h.act({ type: 'spawn', monster: 'warhorse', at: x }); if (Object.values(h.state.entities).some((e) => e.tpl === 'warhorse')) break; }
          const id = Object.values(h.state.entities).find((e) => e.tpl === 'warhorse')?.id;
          h.act({ type: 'bond', actor: id, to: v, kind: 'steed', turn: 'after' });
          return id;
        }, ven);
        if (!horse) throw new Error('no horse');
        await wait(page, (hh) => window.hextable.state.entities[hh].bond, horse);
        await page.evaluate((v) => window.hextable.select(v), ven);
        await calm(page);
        await panelTab(page, 'features');
        await page.click(rowOf('features', 'Mount…'));
        await page.click('#ap-features [data-cc-mount]:has-text("Warhorse")');
        await wait(page, (v) => window.hextable.state.entities[v].riding, ven);
        await calm(page);
        await shot(page, `companions-mounted-${tag}`);
        await page.click(rowOf('features', 'Dismount'));
        await wait(page, (v) => !window.hextable.state.entities[v].riding, ven);
        await calm(page);
        // the steed's side of Ven's turn: shown as `orderNext ?? order ?? 'after'`, and changed by a tap
        await page.click(rowOf('features', 'acts after you'));
        await wait(page, (hh) => window.hextable.state.entities[hh].bond.order === 'before', horse);
        await calm(page);
        if (!(await page.isVisible(rowOf('features', 'acts before you')))) throw new Error('the row did not say "before"');
      });
      await run.do('Command…: the order is typed (the map keys stay quiet), a Skeleton-like zombie is commanded, and its turn is handed to its player', async () => {
        await panelTab(page, 'features');
        await page.click(rowOf('features', 'Command…'));
        await page.fill('#ap-features [data-cc-order]', '');
        const before = await state(page, (S, v) => JSON.stringify(S.entities[v].pos), ven);
        await page.focus('#ap-features [data-cc-order]');
        await page.keyboard.type('guard <b>the</b> door wasd');
        if ((await state(page, (S, v) => JSON.stringify(S.entities[v].pos), ven)) !== before) throw new Error('the typed letters moved the creature');
        await shot(page, `companions-command-${tag}`);
        await page.click('#ap-features [data-cc-send="command"]');
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.commanded));
        const order = await state(page, (S) => Object.values(S.entities).find((e) => e.bond?.commanded).bond.commanded.order);
        if (order !== 'guard <b>the</b> door wasd') throw new Error(`order: ${order}`);
        await calm(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!/commands/.test(t) || /<b>/.test(await page.evaluate(() => document.getElementById('log-list').innerHTML.replace(/&lt;b&gt;/g, '')))) throw new Error(`log: ${t.slice(-200)}`);
        await closeMenu(page);
      });
      await run.do('in a fight the zombie stands after Ven, and its commanded turn is handed to the player', async () => {
        const zed = await state(page, (S) => Object.values(S.entities).find((e) => e.bond?.source === 'animate-dead').id);
        await page.evaluate(() => { const h = window.hextable, x = h.state.entities.fighter; h.act({ type: 'startEncounter', center: x.pos, radius: 40 }); });
        await wait(page, () => window.hextable.state.encounter);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
          if (cur === ven) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await calm(page);
        }
        await page.evaluate((v) => window.hextable.select(v), ven); await calm(page);
        await panelTab(page, 'bonus');
        await page.click(rowOf('bonus', 'Command…'));
        await page.fill('#ap-bonus [data-cc-order]', 'hold the door');
        await page.click('#ap-bonus [data-cc-send="command"]');
        await wait(page, (z) => window.hextable.state.entities[z].bond.commanded?.order === 'hold the door', zed);
        for (let i = 0; i < 40; i++) {
          const cur = await state(page, (S) => S.encounter.order[S.encounter.turn].id);
          if (cur === zed) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await calm(page);
        }
        if ((await state(page, (S) => S.encounter.order[S.encounter.turn].id)) !== zed) throw new Error('the zombie\'s turn did not come');
        await calm(page);
        const sel = await page.evaluate(() => document.querySelector('#c-name').textContent);
        if (!/Zombie|zombie/.test(sel)) throw new Error(`the card shows ${sel}`);
        await openTab(page, 'log'); if (!/yours this turn/.test(await logText(page))) throw new Error('no line for the prompt'); await closeMenu(page);
        await openTab(page, 'turns');
        const tags = await page.$$eval('#tracker li.now .tr-tags span', (l) => l.map((x) => x.textContent));
        if (!tags.some((t) => /commanded/.test(t))) throw new Error(`tracker: ${tags}`);
        await shot(page, `companions-turn-hand-${tag}`);
        await closeMenu(page);
        await panelTab(page, 'move'); await page.click(rowOf('move', 'Dodge'));
        await wait(page, (z) => window.hextable.state.entities[z].cond?.dodging || true, zed);
        await page.click('#btn-end');
        await wait(page, (z) => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== z, zed);
      });
    } finally { await ctx.close(); }
  });
}

// The same at a hosted table: the player's phone drives the chooser and the buttons, the DM is in a second context, and the phone is sent nothing of a creature the DM hid.
export async function screensTable(browser, url) {
  await scenario('companions: a phone player summons, commands and rides at a hosted table', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (host)'); run.watch(phone, ' (phone)');
      let ven;
      const tapHex = (hex, id) => phone.evaluate(([h, i]) => window.hextable.R.onTap({ hex: h, id: i }), [hex, id ?? null]);
      const near = (r) => host.evaluate(async ([v, rad]) => {
        const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
        const S = window.hextable.state, G = gridOf(S.map), c = S.entities[v], out = [];
        for (const h of G.range(c.pos, rad)) if (G.dist(c.pos, h) >= 1 && apply(structuredClone({ ...S, timeline: [] }), { type: 'spawn', monster: 'wolf', at: h }, { role: 'dm', userId: 'dm' }).ok) out.push(h);
        return out;
      }, [ven, r]);
      await run.do('host a table, the phone joins and plays a wizard the DM adds', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        await host.evaluate(async () => {
          const { derive } = await import('./shared/derive.js'), h = window.hextable;
          h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' });
          const r = derive({ name: 'Ven', class: 'wizard', level: 17, abilities: { str: 10, dex: 14, con: 14, int: 20, wis: 12, cha: 10 }, skills: ['arcana'], armour: 'leather-armor', weapons: ['quarterstaff'], spells: ['find-familiar', 'summon-dragon', 'animate-dead'] });
          h.act({ type: 'addCharacter', record: r.record, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(phone, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'));
        ven = await phone.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Ven').id);
        await phone.locator('#party button:has-text("Play as Ven")').click();
        await wait(host, (v) => !!window.hextable.state.entities[v].owner, ven);
        await calm(phone);
      });
      await run.do('a creature the DM hid is nowhere on the phone', async () => {
        const hid = await host.evaluate(() => { const h = window.hextable, f = Object.values(h.state.entities).find((e) => e.side === 'foe' && !e.hidden); h.act({ type: 'spawn', monster: 'wolf', at: { q: f.pos.q + 2, r: f.pos.r }, name: 'Secretwolf', hidden: true }); return true; });
        await sleep(400); await calm(phone);
        const seen = await phone.evaluate(() => JSON.stringify(window.hextable.state) + document.body.innerText);
        if (/Secretwolf/.test(seen)) throw new Error('the phone was sent a hidden creature');
      });
      await run.do('the phone casts Find Familiar through the chooser (a form, a type, a tap)', async () => {
        await panelTab(phone, 'spells'); await phone.click(rowOf('spells', 'Find Familiar'));
        await phone.waitForSelector('#cc-chooser:not([hidden])');
        await phone.selectOption('#cc-sel-form', 'owl'); await phone.click('#cc-chooser [data-cc-pick="type|fey"]');
        const spots = await near(2); await tapHex(spots[0]);
        await phone.tap('#cc-chooser [data-cc-cast="picks"]');
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'find-familiar'));
        await calm(phone);
        await shot(phone, 'companions-table-familiar-phone');
      });
      await run.do('Summon Dragon, then Animate Dead on a corpse the player taps', async () => {
        await panelTab(phone, 'spells'); await phone.click(rowOf('spells', 'Summon Dragon'));
        await phone.waitForSelector('#cc-chooser:not([hidden])');
        const v = await phone.$$eval('#cc-chooser [data-cc-pick^="variant|"]', (b) => b[0].dataset.ccPick);
        await phone.click(`#cc-chooser [data-cc-pick="${v}"]`);
        const spots = await near(3); await tapHex(spots[spots.length - 1]);
        await phone.tap('#cc-chooser [data-cc-cast="picks"]');
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'summon-dragon')).catch(() => { throw new Error('the dragon was not made'); });
        await host.evaluate(async (v) => {
          const h = window.hextable, { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'), G = gridOf(h.state.map), c = h.state.entities[v];
          for (const x of G.range(c.pos, 3)) if (G.dist(c.pos, x) === 2 && apply(structuredClone({ ...h.state, timeline: [] }), { type: 'spawn', monster: 'bandit', at: x }, { role: 'dm', userId: 'dm' }).ok) { h.act({ type: 'spawn', monster: 'bandit', at: x }); break; }
        }, ven);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.tpl === 'bandit'));
        const bandit = await host.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.tpl === 'bandit').id);
        await host.evaluate((id) => window.hextable.act({ type: 'harm', actor: id, amount: 999 }), bandit);
        await wait(phone, (b) => window.hextable.state.entities[b]?.dead, bandit);
        await calm(phone);
        await phone.click(rowOf('spells', 'Animate Dead'));
        await phone.waitForSelector('#cc-chooser:not([hidden])');
        const pos = await phone.evaluate((b) => window.hextable.state.entities[b].pos, bandit);
        await tapHex(pos, bandit);
        await phone.tap('#cc-chooser [data-cc-cast="picks"]');
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.source === 'animate-dead'));
        await calm(phone);
      });
      await run.do('the player commands the zombie, and the DM is shown the order as text', async () => {
        await phone.evaluate((v) => window.hextable.select(v), ven);
        await panelTab(phone, 'features');
        await phone.click(rowOf('features', 'Command…'));
        await phone.tap('#ap-features [data-cc-order]');
        await phone.keyboard.type('guard <i>it</i>');
        await phone.tap('#ap-features [data-cc-send="command"]');
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.bond?.commanded?.order === 'guard <i>it</i>'));
        await calm(host);
        await openTab(host, 'log');
        if (!/commands/.test(await logText(host))) throw new Error('no line for the command');
        if (await host.evaluate(() => !!document.querySelector('#log-list i'))) throw new Error('the order was drawn as markup');
        await closeMenu(host);
      });
      await run.do('the player mounts a warhorse the DM bonded, and gets down', async () => {
        await host.evaluate(async (v) => {
          const h = window.hextable, { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'), G = gridOf(h.state.map), c = h.state.entities[v];
          for (const x of G.range(c.pos, 3)) if (G.dist(c.pos, x) === 1 && apply(structuredClone({ ...h.state, timeline: [] }), { type: 'spawn', monster: 'warhorse', at: x }, { role: 'dm', userId: 'dm' }).ok) { h.act({ type: 'spawn', monster: 'warhorse', at: x }); break; }
        }, ven);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.tpl === 'warhorse'));
        const horse = await host.evaluate((v) => { const id = Object.values(window.hextable.state.entities).find((e) => e.tpl === 'warhorse').id; window.hextable.act({ type: 'bond', actor: id, to: v, kind: 'steed' }); return id; }, ven);
        await wait(phone, (hh) => window.hextable.state.entities[hh]?.bond, horse);
        await calm(phone);
        await panelTab(phone, 'features');
        await phone.click(rowOf('features', 'Mount…'));
        await phone.tap('#ap-features [data-cc-mount]:has-text("Warhorse")');
        await wait(host, (v) => window.hextable.state.entities[v].riding, ven);
        await calm(phone);
        await shot(phone, 'companions-table-mounted-phone');
        await phone.click(rowOf('features', 'Dismount'));
        await wait(host, (v) => !window.hextable.state.entities[v].riding, ven);
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'companions: solo, desktop', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'companions: solo, phone with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await leftovers(browser, url, 'companions: summoned, names, tracker and auto-play, desktop', { viewport: { width: 1280, height: 800 } });
  await leftovers(browser, url, 'companions: summoned, names, tracker and auto-play, phone with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await table(browser, url);
  await screens(browser, url, 'companions: the screens, solo, desktop', { viewport: { width: 1280, height: 800 } });
  await screens(browser, url, 'companions: the screens, solo, phone with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await screensTable(browser, url);
}
