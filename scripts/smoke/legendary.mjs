import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, tapAt, onCanvas } from './lib.mjs';

// ---------- legendary actions: the DM's screen (docs/specs/legendary.md, stage L4a) ----------
// A DM and a player at a table with an adult green dragon, "Verdigris", in a fight. After a turn the table waits for the dragon's windows: the DM plays them
// with one tap each and answers a Legendary Resistance question with one tap; the player sees the events and "Waiting for the DM", nothing else.
// Run twice: the DM on a wide screen with the player on a phone, then the other way round (the phone as DM, with touch).
const WIDE = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const shot = async (page, name) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/legendary-${name}.png` }); };

async function legendary(browser, url, dmOpts, playerOpts, label) {
  await scenario(`legendary actions: ${label}`, async (run) => {
    const dmCtx = await browser.newContext(dmOpts), plCtx = await browser.newContext(playerOpts);
    const phoneDM = !!dmOpts.hasTouch;
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      let code, drake;
      const idle = (p) => wait(p, () => window.hextable.waiting === 0, null, 20000);
      const tapIt = (loc) => (phoneDM ? loc.tap() : loc.click());

      await run.do('host a table, a player joins', async () => {
        await open(dm, url);
        await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url);
        await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(dm, 'dm'); await waitShown(dm, '#dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
        await closeMenu(dm);
      });

      await run.do('the DM turns the windows on, a dragon joins and a fight begins', async () => {
        drake = await dm.evaluate(() => {
          const h = window.hextable, S = h.state;
          document.getElementById('dm-auto').checked = false;
          h.act({ type: 'setting', key: 'autoEngage', value: false });
          h.act({ type: 'setting', key: 'legendaryWindows', value: true });
          h.act({ type: 'setting', key: 'legendaryResistance', value: true });
          return null;
        });
        // One dragon, beside the fighter: where it fits is tried in turn (the valley's trees are not the same each time).
        for (const [dq, dr] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, -3], [-3, 3]]) {
          await dm.evaluate(([a, b]) => { const f = window.hextable.state.entities.fighter.pos; window.hextable.act({ type: 'spawn', monster: 'adult-green-dragon', at: { q: f.q + a, r: f.r + b }, name: 'Verdigris' }); }, [dq, dr]);
          await sleep(600); await idle(dm);
          if (await dm.evaluate(() => Object.values(window.hextable.state.entities).some((e) => e.name === 'Verdigris'))) break;
        }
        drake = await state(dm, (S) => Object.values(S.entities).find((e) => e.name === 'Verdigris').id);
        await dm.evaluate(() => { const h = window.hextable; h.act({ type: 'startEncounter', center: h.state.entities.fighter.pos }); });
        await wait(dm, () => window.hextable.state.encounter, null, 20000); await idle(dm);
      });

      // Ends turns until the table waits between two turns.
      const toWindow = async () => {
        for (let i = 0; i < 40; i++) {
          if (await state(dm, (S) => !!S.encounter?.between)) return;
          const cur = await state(dm, (S) => S.encounter.order[S.encounter.turn].id);
          await dm.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle(dm);
        }
        throw new Error('no window opened');
      };

      await run.do('after a turn the DM sees the window and the player only "Waiting for the DM"', async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        const txt = await dm.$eval('#lg', (e) => e.innerText);
        if (!/Verdigris/.test(txt) || !/Legendary 3\/3/.test(txt) || !/Mind Invasion/.test(txt) || !/Pounce/.test(txt) || !/Skip/.test(txt) || !/Done/.test(txt)) throw new Error(`the window does not say what it should: ${txt}`);
        const boxes = await dm.$$eval('#lg button', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.height, r.left, r.right, r.bottom]; }));
        const vw = await dm.evaluate(() => [innerWidth, innerHeight]);
        if (boxes.some((b) => b[0] < 56)) throw new Error(`a button is under 56 px: ${JSON.stringify(boxes)}`);
        if (boxes.some((b) => b[1] < 0 || b[2] > vw[0] || b[3] > vw[1] + 1)) throw new Error(`a button is off screen: ${JSON.stringify(boxes)} in ${vw}`);
        await wait(pl, () => /Waiting for the DM/.test(document.querySelector('#turn-text').textContent));
        const got = await state(pl, (S) => S.encounter.between);
        if (got !== true) throw new Error(`the player was sent more than "waiting": ${JSON.stringify(got)}`);
        if (await shown(pl, '#lg')) throw new Error('the player was shown the window');
        const plTxt = await pl.evaluate(() => document.body.innerText);
        if (/Legendary \d|Verdigris's|Mind Invasion|Pounce/.test(plTxt)) throw new Error('the player can read what the window offers');
        await shot(dm, 'window-dm'); await shot(pl, 'window-player');
      });

      await run.do('one tap on a manual option spends the use and the player sees the event', async () => {
        await tapIt(dm.locator('#lg .lg-opt[data-opt="mind-invasion"]'));
        await wait(dm, (id) => window.hextable.state.entities[id].legend.acts >= 1 || !window.hextable.state.encounter.between, drake);
        await wait(dm, () => !window.hextable.state.encounter.between);
        await waitShown(dm, '#lg', false);
        await wait(pl, () => !window.hextable.state.encounter.between);
        await wait(pl, () => !/Waiting for the DM/.test(document.querySelector('#turn-text').textContent));
      });

      // A tap on the map at a creature's place or a hex, on the canvas and not under the window.
      const tapSpot = async (pos, what) => {
        await dm.evaluate((p) => window.hextable.R.focus('fighter', true), pos); await sleep(700);
        const pt = await dm.evaluate((p) => window.hextable.R.screenOf(p), pos);
        if (!pt || !(await onCanvas(dm, pt.x, pt.y))) throw new Error(`${what} is not on the map to tap at ${JSON.stringify(pt)}`);
        await tapAt(dm, phoneDM, pt.x, pt.y);
      };

      await run.do('Pounce arms the aim bar: the destination first, then the target, then Send sends one action', async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="pounce"]'));
        await wait(dm, () => window.hextable.mode.kind === 'legendary');
        await waitShown(dm, '#hint');
        const hint1 = await dm.$eval('#hint-text', (e) => e.textContent);
        if (!/Pounce.*where/.test(hint1)) throw new Error(`the aim bar does not ask for the destination: ${hint1}`);
        if (await state(dm, (S) => !S.encounter.between)) throw new Error('the window closed on arming');
        await shot(dm, 'aim-move');
        // A free place two hexes from the fighter (inside Rend's reach), the nearest to the dragon.
        const where = await state(dm, (S, id) => {
          const f = S.entities.fighter.pos, d = S.entities[id].pos, dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
          const taken = Object.values(S.entities).map((e) => e.pos);
          const ring = []; for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) { const p = { q: f.q + q, r: f.r + r, z: f.z }; if (dist(p, f) === 2 && !taken.some((t) => t.q === p.q && t.r === p.r)) ring.push(p); }
          return ring.sort((a, b) => dist(a, d) - dist(b, d))[0];
        }, drake);
        await tapSpot(where, 'the destination');
        await wait(dm, () => window.hextable.mode.to);
        await wait(dm, () => /tap a target/.test(document.querySelector('#hint-text').textContent));
        await tapSpot(await state(dm, () => window.hextable.state.entities.fighter.pos), 'the fighter');
        await wait(dm, () => window.hextable.mode.target === 'fighter');
        await waitShown(dm, '#lg .lg-go');
        await shot(dm, 'aim-send');
        await tapIt(dm.locator('#lg .lg-go'));
        await wait(dm, ([id, w]) => { const q = window.hextable.state.entities[id].pos; return q.q === w.q && q.r === w.r; }, [drake, where]);
        const moved = await state(dm, (S, id) => S.entities[id].pos, drake);
        if (moved.q !== where.q || moved.r !== where.r) throw new Error(`the dragon did not move where it was sent: ${JSON.stringify(moved)} vs ${JSON.stringify(where)}`);
        if ((await dm.evaluate(() => window.hextable.mode.kind)) === 'legendary') throw new Error('the aim bar stayed armed after Send');
      });

      await run.do('Noxious Miasma aims at a spot and Send; Cancel puts the bar back', async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="noxious-miasma"]'));
        await wait(dm, () => window.hextable.mode.kind === 'legendary');
        await tapIt(dm.locator('#lg [data-do="cancel"]'));
        await wait(dm, () => window.hextable.mode.kind !== 'legendary');
        await waitShown(dm, '#lg .lg-opt');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="noxious-miasma"]'));
        await tapSpot(await state(dm, () => window.hextable.state.entities.fighter.pos), 'the spot');
        await wait(dm, () => window.hextable.mode.hex);
        await shot(dm, 'aim-area');
        await tapIt(dm.locator('#lg .lg-go'));
        await wait(dm, () => !window.hextable.state.encounter.between);      // paid and done: the dragon's own turn has begun, which gives its uses back
      });
    } finally { await plCtx.close(); await dmCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=legendary.
export default async function (browser, url) {
  await legendary(browser, url, WIDE, PHONE, 'a wide DM, a phone player');
  await legendary(browser, url, PHONE, WIDE, 'a phone DM, a wide player');
}
