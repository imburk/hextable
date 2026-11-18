import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, calm, spawnNear } from './lib.mjs';

// ---------- the stand-in (docs/specs/ai-casting.md, stage AC2; issue #490; DEBT T20 (1)) ----------
// A character set aside under the table rule `standIn` is played by the DM's screen with the AI: its turn starts, the log says "<name> is played by the
// stand-in.", and the DM's page sends the steps (a cast, a blow or a move) until the turn ends. A character that is not set aside is NOT played: its turn
// waits for its player or the DM's hand, and so does a stand-in while the DM has turned "Run monsters automatically" off.
// Solo at desktop size and at phone size with touch; then a hosted table, a DM on a desktop and a phone player who plays Tavin and takes a break: the
// stand-in's steps come from the DM's page only (the player's page sends nothing for Tavin), the player sees the same log line and the cast, and when the
// player comes back their turn waits for them again. The map is the valley of a seed of the pass's own where it matters (see homebrew.mjs): every place is
// asked of the engine on that map, and each foe is spawned where Tavin has a line to it.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const logText = (page) => page.evaluate(() => [...document.querySelectorAll('#log-list .lg-line')].map((l) => l.textContent).join('\n'));
const turnOf = (page) => page.evaluate(() => { const S = window.hextable.state; return S.encounter ? S.encounter.order[S.encounter.turn].id : null; });
const STAND = /Tavin is played by the stand-in\./, ASIDE = /Tavin steps away: the stand-in plays Tavin's turns\./;

// Ends the turn of every character that is not the one we wait for (the DM's Skip turn), until it is `id`'s turn; monsters play themselves. Returns when it is.
async function toTurn(dm, id, all = false) {
  // Monsters play at 800 ms a step, so a round takes a while: wait by the clock, not by the count.
  for (const t0 = Date.now(); Date.now() - t0 < 150000;) {
    await calm(dm, 20000);
    // The DM tends the party between turns so a long fight does not lose it: this pass is about who plays Tavin, not about surviving zombies.
    await dm.evaluate(() => { const h = window.hextable; for (const e of Object.values(h.state.entities)) if (e.kind === 'pc' && !e.dead && e.hp < e.maxHp) h.act({ type: 'mend', actor: e.id, amount: e.maxHp }); });
    const cur = await turnOf(dm);
    if (cur === id) return;
    // A character that is not `id` and is not set aside is ended by the DM's hand; monsters and stand-ins play themselves (`all`: with auto-play off, everyone's is).
    if (cur && (await dm.evaluate(([c, every]) => { const e = window.hextable.state.entities[c]; return every || (e.kind === 'pc' && !e.away); }, [cur, all]))) await dm.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
    else await sleep(400);
  }
  const why = await dm.evaluate(() => { const S = window.hextable.state, c = S.encounter?.order[S.encounter.turn].id, e = S.entities[c]; return JSON.stringify({ c, hp: e?.hp, hidden: e?.hidden, pending: S.pending ? Object.keys(S.pending) : null, prompt: !!document.querySelector('#prompt:not([hidden])'), auto: document.getElementById('dm-auto').checked, waiting: window.hextable.waiting, busy: window.hextable.timeline.busy(), budget: S.encounter?.budget, toast: document.getElementById('toast')?.textContent, log: window.hextable.played.slice(-6).map((x) => x.type) }); });
  throw new Error(`it did not become ${id}'s turn (it is ${await turnOf(dm)}'s): ${why}`);
}

// The foe is put where Tavin has a line to it and can cast at it (Fire Bolt reaches 120 ft); the fight starts around the party.
async function setFight(dm) {
  await dm.evaluate(() => { const h = window.hextable; h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); h.act({ type: 'setting', key: 'away', value: 'standIn' }); });
  await calm(dm);
  // Zombies: slow to kill and weak, so the fight lasts as many rounds as the steps need and the party is not lost.
  const foes = [];
  for (let i = 0; i < 3; i++) foes.push(await spawnNear(dm, 'zombie', { near: 'wizard', sightFrom: 'wizard', min: 4, radius: 10, range: 60, name: `Smoke Zombie ${i + 1}` }));
  // A small arena (hexes): the party and the zombies, as few of the valley's own creatures as the map allows, so the party is not lost before the steps are checked.
  await dm.evaluate(async (f) => { const { gridOf } = await import('./shared/grid.js'); const h = window.hextable, G = gridOf(h.state.map), w = h.state.entities.wizard.pos; h.act({ type: 'startEncounter', center: w, radius: Math.max(4, ...f.map((x) => G.dist(w, h.state.entities[x].pos) + 2)) }); }, foes);
  await wait(dm, () => window.hextable.state.encounter);
  return foes;
}

async function solo(browser, url, label, opts, tag) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('a fight with zombies in Tavin\'s sight; "Run monsters automatically" is on', async () => {
        await open(page, url); await page.click('#lobby-solo');
        await wait(page, () => window.hextable.state?.entities?.wizard);
        await calm(page);
        await setFight(page);
        if (!(await page.isChecked('#dm-auto'))) throw new Error('"Run monsters automatically" is off at the start');
      });
      await run.do('a character that is not set aside is not played: Tavin\'s turn waits for its player', async () => {
        await toTurn(page, 'wizard');
        await calm(page);
        await sleep(2600);                                       // longer than the pause before an AI step
        if ((await turnOf(page)) !== 'wizard') throw new Error('the turn moved on without anyone playing Tavin');
        const left = await state(page, (S) => S.encounter.budget);
        if (left.action !== 1 || left.move !== undefined && left.move < 0) throw new Error(`Tavin's turn was spent: ${JSON.stringify(left)}`);
        if (STAND.test(await logText(page))) throw new Error('the log says Tavin is played by the stand-in');
      });
      await run.do('the DM sets Tavin aside under standIn on its turn: the log says so and the screen plays the rest of the turn', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'stepAway', actor: 'wizard' }));
        await wait(page, () => window.hextable.state.entities.wizard.away?.how === 'standIn');
        await wait(page, () => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== 'wizard', null, 30000);
        await calm(page);
        await openTab(page, 'log');
        const t = await logText(page);
        if (!ASIDE.test(t)) throw new Error(`no "steps away" line in the log: ${t.slice(-400)}`);
        const after = t.slice(t.search(ASIDE) + 20);
        if (!/Tavin (casts|attacks|moves|uses|dashes)/.test(after)) throw new Error(`the log shows nothing Tavin did after being set aside: ${after.slice(0, 400)}`);
        await shot(page, `standin-solo-${tag}-log`);
        await closeMenu(page);
      });
      const count = async () => (await logText(page)).split('Tavin is played by the stand-in.').length - 1;
      await run.do('set aside under another how, a turn is the engine\'s and the screen plays nothing for it', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'stepAway', actor: 'wizard', how: 'dodge' }));
        await wait(page, () => window.hextable.state.entities.wizard.away?.how === 'dodge');
        const was = await count(), round = await state(page, (S) => S.encounter.round), sentBefore = await page.evaluate(() => window.hextable.acted ?? null);
        await toTurn(page, 'fighter');
        await wait(page, (r) => window.hextable.state.encounter.round > r || window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id === 'fighter', round);
        if ((await count()) !== was) throw new Error('the stand-in line came for a turn set aside under dodge');
        void sentBefore;
      });
      await run.do('with "Run monsters automatically" off a stand-in waits; turned on, it plays', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'stepAway', actor: 'wizard', how: 'standIn' }));
        await wait(page, () => window.hextable.state.entities.wizard.away?.how === 'standIn');
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await toTurn(page, 'wizard', true);
        await calm(page);
        await sleep(2600);
        if ((await turnOf(page)) !== 'wizard') throw new Error('the stand-in played with auto-play off');
        if ((await state(page, (S) => S.encounter.budget.action)) !== 1) throw new Error('the stand-in spent its action with auto-play off');
        await openTab(page, 'log');
        if (!STAND.test(await logText(page))) throw new Error('no "is played by the stand-in" line when its turn began');
        await shot(page, `standin-solo-${tag}-waiting`);
        await closeMenu(page);
        await page.evaluate(() => { const c = document.getElementById('dm-auto'); c.checked = true; c.dispatchEvent(new Event('change')); });
        await wait(page, () => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== 'wizard', null, 30000);
      });
    } finally { await ctx.close(); }
  });
}

async function hosted(browser, url) {
  const seed = process.env.SMOKE_SEED ? Number(process.env.SMOKE_SEED) : Math.floor(Math.random() * 1e9);
  await scenario(`stand-in at a hosted table: a DM on a desktop plays Tavin for a phone player who took a break (seed ${seed})`, async (run) => {
    const hostCtx = await browser.newContext(DESKTOP), phoneCtx = await browser.newContext(PHONE);
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(phone, ' (phone)');
      const sent = { host: [], phone: [] };
      const track = (page, who) => page.on('websocket', (ws) => ws.on('framesent', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'act') sent[who].push(m.action); } catch { /* not JSON */ } }));
      track(host, 'host'); track(phone, 'phone');
      const forTavin = (who) => sent[who].filter((a) => a.actor === 'wizard' && a.type !== 'stepAway' && a.type !== 'stepBack' && a.type !== 'mend');
      let code;
      await run.do('the DM hosts, the phone joins and plays Tavin', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url);
        await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(phone, '#lobby', false);
        await wait(phone, () => window.hextable.state?.entities?.wizard);
        await host.evaluate(async (n) => { const { newGame } = await import('./shared/scenario.js'); window.hextable.act({ type: 'loadMap', map: newGame(n).map }); }, seed);
        await sleep(600); await calm(host); await calm(phone);
        await closeMenu(host);
        await phone.locator('#party button:has-text("Play as Tavin")').tap();
        await wait(host, () => !!window.hextable.state.entities.wizard.owner);
      });
      await run.do('a fight with zombies in Tavin\'s sight; it is the phone player\'s turn to play Tavin', async () => {
        await setFight(host);
        await wait(phone, () => window.hextable.state.encounter);
        await toTurn(host, 'wizard');
        await calm(host); await calm(phone);
        await sleep(2600);
        if ((await turnOf(host)) !== 'wizard') throw new Error('Tavin\'s turn was played for a player who is present');
        if (forTavin('host').length) throw new Error(`the DM's page sent a step for Tavin: ${JSON.stringify(forTavin('host'))}`);
        await shot(phone, 'standin-hosted-phone-present');
      });
      await run.do('the phone takes a break (its own button is not built yet, so the step is the one its page would send): the DM\'s page plays Tavin, the phone\'s sends nothing', async () => {
        await phone.evaluate(() => window.hextable.act({ type: 'stepAway', actor: 'wizard' }));
        await wait(host, () => window.hextable.state.entities.wizard.away?.how === 'standIn');
        await wait(host, () => window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id !== 'wizard', null, 30000);
        await calm(host); await calm(phone);
        if (!forTavin('host').length) throw new Error('the DM\'s page sent nothing for Tavin');
        if (forTavin('phone').length) throw new Error(`the player's page sent a step for Tavin: ${JSON.stringify(forTavin('phone'))}`);
        await openTab(host, 'log');
        const dmLog = await logText(host);
        await closeMenu(host);
        if (!ASIDE.test(dmLog)) throw new Error(`the DM's log has no "steps away" line: ${dmLog.slice(-300)}`);
        await openTab(phone, 'log');
        const pl = await logText(phone);
        if (!ASIDE.test(pl) || !/Tavin (casts|attacks|moves|uses|dashes)/.test(pl.slice(pl.search(ASIDE)))) throw new Error(`the player's log does not show the stand-in at work: ${pl.slice(-300)}`);
        await shot(phone, 'standin-hosted-phone-log');
        await shot(host, 'standin-hosted-dm');
        await closeMenu(phone);
      });
      await run.do('the player comes back: their next turn waits for them, and the DM\'s page does not play it', async () => {
        await phone.evaluate(() => window.hextable.act({ type: 'stepBack', actor: 'wizard' }));
        await wait(host, () => !window.hextable.state.entities.wizard.away);
        const before = forTavin('host').length;
        await toTurn(host, 'wizard');
        await calm(host); await calm(phone);
        await sleep(2600);
        if ((await turnOf(host)) !== 'wizard') throw new Error('Tavin\'s turn was played after the player came back');
        if (forTavin('host').length !== before) throw new Error('the DM\'s page sent a step for Tavin after the player came back');
        await shot(phone, 'standin-hosted-phone-back');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'stand-in, solo at desktop size', DESKTOP, 'desktop');
  await solo(browser, url, 'stand-in, solo at phone size with touch', PHONE, 'phone');
  await hosted(browser, url);
}
