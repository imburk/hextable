import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, openMenu, tapAt, onCanvas } from './lib.mjs';

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
    // #906: what was sent and answered, and every toast, kept from the start, so a step that times out can say why.
    for (const c of [dmCtx, plCtx]) await c.addInitScript(() => {
      const wire = (window.__wire = []), keep = (x) => { wire.push(x); if (wire.length > 40) wire.shift(); };
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); keep({ out: m.t, a: m.action ? [m.action.type, m.action.actor, m.action.option ?? m.action.skip ?? m.action.done ?? ''].join(' ') : undefined }); } catch { /* not ours */ } return send.call(this, d); };
      const Real = window.WebSocket;
      window.WebSocket = class extends Real { constructor(...a) { super(...a); this.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); keep({ in: m.t, ...(m.error ? { error: m.error } : {}), ...(m.events ? { ev: m.events.map((x) => x.type + (x.option ? ':' + x.option : '')).slice(-12) } : {}) }); } catch { /* not ours */ } }); } };
      window.__toasts = [];
      addEventListener('DOMContentLoaded', () => { const t = document.querySelector('#toast'); if (t) new MutationObserver(() => window.__toasts.push(t.textContent ?? '')).observe(t, { childList: true, characterData: true, subtree: true, attributes: true }); });
    });
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      const dump = (p) => p.evaluate(() => { const h = window.hextable, S = h.state; return JSON.stringify({ waiting: h.waiting, busy: h.timeline.busy(), mode: h.mode?.kind, pending: S.pending ? { reactor: S.pending.ask?.reactor ?? S.pending.reactor, type: S.pending.action?.type, keys: Object.keys(S.pending) } : null, between: S.encounter?.between, turn: S.encounter?.order?.[S.encounter.turn]?.id, acts: Object.values(S.entities).filter((e) => e.legend).map((e) => [e.id, e.legend.acts, e.legend.self]), rp: !document.querySelector('#rp')?.hidden ? document.querySelector('#rp')?.innerText.slice(0, 160) : '', toasts: (window.__toasts ?? []).filter((t, i, a) => t && t !== a[i - 1]).slice(-8), wire: (window.__wire ?? []).slice(-16) }); });
      const explained = (fn) => async () => { try { await fn(); } catch (err) { throw new Error(`${err.message.slice(0, 400)} -- DM ${await dump(dm).catch(() => '?')} -- player ${await dump(pl).catch(() => '?')}`); } };
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
        // #906: a toast ("To do: ...") can lie over the spot for a few seconds: wait for the map to be under it, and say what covers it if it never is.
        let pt = null;
        for (let i = 0; i < 16; i++) { pt = await dm.evaluate((p) => window.hextable.R.screenOf(p), pos); if (pt && (await onCanvas(dm, pt.x, pt.y))) break; await sleep(500); }
        if (!pt || !(await onCanvas(dm, pt.x, pt.y))) throw new Error(`${what} is not on the map to tap at ${JSON.stringify(pt)}, under ${await dm.evaluate((q) => { const el = q && document.elementFromPoint(q.x, q.y); return el ? `${el.tagName}#${el.id}.${el.className}`.slice(0, 80) : 'nothing'; }, pt)}`);
        await tapAt(dm, phoneDM, pt.x, pt.y);
      };

      await run.do('Pounce arms the aim bar: the destination first, then the target, then Send sends one action', explained(async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="pounce"]'));
        await wait(dm, () => window.hextable.mode.kind === 'legendary');
        await waitShown(dm, '#hint');
        const hint1 = await dm.$eval('#hint-text', (e) => e.textContent);
        if (!/Pounce.*where/.test(hint1)) throw new Error(`the aim bar does not ask for the destination: ${hint1}`);
        if (await state(dm, (S) => !S.encounter.between)) throw new Error('the window closed on arming');
        await shot(dm, 'aim-move');
        const start = await state(dm, (S, id) => S.entities[id].pos, drake);
        // A place the engine accepts for the move (the dragon is Huge: it needs room), within two hexes of the fighter and the nearest to the dragon.
        const where = await dm.evaluate(async (id) => {
          const { apply } = await import('./shared/engine.js'), S = window.hextable.state;
          const f = S.entities.fighter.pos, d = S.entities[id].pos, dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
          const ring = []; for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) { const p = { q: f.q + q, r: f.r + r, z: f.z }; if (dist(p, f) <= 2 && dist(p, f) >= 1) ring.push(p); }
          ring.sort((a, b) => dist(a, d) - dist(b, d));
          return ring.find((p) => apply(structuredClone({ ...S, timeline: [] }), { type: 'legendary', actor: id, option: 'pounce', to: p, target: 'fighter' }, { role: 'dm', userId: 'dm' }).ok) ?? null;
        }, drake);
        if (!where) throw new Error('no place the dragon could pounce from');
        await tapSpot(where, 'the destination');
        await wait(dm, () => window.hextable.mode.to);
        await wait(dm, () => /tap a target/.test(document.querySelector('#hint-text').textContent));
        await tapSpot(await state(dm, () => window.hextable.state.entities.fighter.pos), 'the fighter');
        await wait(dm, () => window.hextable.mode.target === 'fighter');
        await waitShown(dm, '#lg .lg-go');
        await shot(dm, 'aim-send');
        await idle(dm); await wait(dm, () => !window.hextable.timeline.busy());
        await tapIt(dm.locator('#lg .lg-go'));
        try { await wait(dm, ([id, p]) => { const q = window.hextable.state.entities[id].pos; return q.q !== p.q || q.r !== p.r; }, [drake, start]); }
        catch (err) { throw new Error(`${err.message.slice(0, 80)} -- ${await dm.evaluate(() => JSON.stringify({ err: document.querySelector('#lg .lg-err')?.textContent, hint: document.querySelector('#hint-text')?.textContent, mode: window.hextable.mode, toast: document.body.innerText.slice(-200) }))}`); }      // it moved (an Opportunity Attack may stop it short of the place)
        if ((await dm.evaluate(() => window.hextable.mode.kind)) === 'legendary') throw new Error('the aim bar stayed armed after Send');
      }));

      await run.do('Noxious Miasma aims at a spot and Send; Cancel puts the bar back', explained(async () => {
        await toWindow();
        await waitShown(dm, '#lg');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="noxious-miasma"]'));
        await wait(dm, () => window.hextable.mode.kind === 'legendary');
        await tapIt(dm.locator('#lg [data-do="cancel"]'));
        await wait(dm, () => window.hextable.mode.kind !== 'legendary');
        await waitShown(dm, '#lg .lg-opt');
        await tapIt(dm.locator('#lg .lg-opt[data-opt="noxious-miasma"]'));
        // A spot the engine accepts (the valley is not the same each time: the fighter's own place can be out of the dragon's sight or range), the fighter's first.
        const spot = await dm.evaluate(async (id) => {
          const { apply } = await import('./shared/engine.js'), S = window.hextable.state, f = S.entities.fighter.pos;
          const ring = [f]; for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if ((q || r) && Math.abs(q) + Math.abs(r) + Math.abs(q + r) <= 4) ring.push({ q: f.q + q, r: f.r + r, z: f.z });
          return ring.find((p) => apply(structuredClone({ ...S, timeline: [] }), { type: 'legendary', actor: id, option: 'noxious-miasma', hex: p }, { role: 'dm', userId: 'dm' }).ok) ?? null;
        }, drake);
        if (!spot) throw new Error('no spot the engine accepts for Noxious Miasma near the fighter');
        await tapSpot(spot, 'the spot');
        await wait(dm, () => window.hextable.mode.hex);
        // #895: the DM's selected creature down (the Pounce before can drop the fighter) and an update arriving while the aim is armed must not put the aim down.
        const hp0 = await state(dm, (S) => ({ fighter: S.entities.fighter.hp, rogue: S.entities.rogue.hp }));
        await dm.evaluate(() => window.hextable.act({ type: 'setHp', actor: 'fighter', hp: 0 }));
        await wait(dm, () => window.hextable.state.entities.fighter.hp === 0);
        await dm.evaluate((hp) => window.hextable.act({ type: 'setHp', actor: 'rogue', hp: Math.max(1, hp - 1) }), hp0.rogue);
        await wait(dm, (hp) => window.hextable.state.entities.rogue.hp !== hp || hp <= 1, hp0.rogue); await idle(dm);
        if ((await dm.evaluate(() => window.hextable.mode.kind)) !== 'legendary' || !(await dm.evaluate(() => window.hextable.mode.hex))) throw new Error('an update while the selected creature is down put the aim down');
        await waitShown(dm, '#lg .lg-go');
        await shot(dm, 'aim-area');
        await idle(dm); await wait(dm, () => !window.hextable.timeline.busy());      // a tap while the beats still play only skips them (legendary.js, as every control): wait for the picture to be still
        await tapIt(dm.locator('#lg .lg-go'));
        try { await wait(dm, () => !window.hextable.state.encounter.between); }      // paid and done: the dragon's own turn has begun, which gives its uses back
        catch (err) { throw new Error(`${err.message.slice(0, 80)} -- ${await dm.evaluate((p) => JSON.stringify({ spot: p, err: document.querySelector('#lg .lg-err')?.textContent, hint: document.querySelector('#hint-text')?.textContent, mode: window.hextable.mode, toast: document.querySelector('#toast')?.textContent, hp: [window.hextable.state.entities.fighter?.hp, window.hextable.state.entities.rogue?.hp], between: window.hextable.state.encounter?.between, acts: Object.values(window.hextable.state.entities).filter((e) => e.legend).map((e) => [e.id, e.legend.acts, e.pos]), turn: window.hextable.state.encounter?.order?.[window.hextable.state.encounter.turn]?.id }), spot)}`); }
        await dm.evaluate((hp) => { const h = window.hextable; h.act({ type: 'setHp', actor: 'fighter', hp: Math.max(hp.fighter, 1) }); h.act({ type: 'setHp', actor: 'rogue', hp: hp.rogue }); }, hp0); await idle(dm);      // back as they were (the fighter at least up), for the steps after
      }));

      await run.do('a failed save asks for Legendary Resistance: the card, one tap, a success; the player is told nothing of it', async () => {
        await toWindow();
        await dm.evaluate((id) => { const h = window.hextable; h.act({ type: 'reactions', actor: id, set: { 'legendary-resistance': 'ask' } }); h.act({ type: 'save', who: id, ability: 'wis', dc: 40 }); }, drake);
        await waitShown(dm, '#rp .rp-lr');
        const txt = await dm.$eval('#rp', (e) => e.innerText);
        if (!/Verdigris/.test(txt) || !/DC 40/.test(txt) || !/\d of 3 left/.test(txt) || !/Use it/.test(txt) || !/Let it fail/.test(txt)) throw new Error(`the card does not say what it should: ${txt}`);
        const btn = await dm.$$eval('#rp button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
        if (btn.some((h) => h < 56)) throw new Error(`an answer is under 56 px: ${btn}`);
        if (await shown(dm, '#lg')) throw new Error('the window stayed over the question');
        await shot(dm, 'resistance-card');
        await waitShown(pl, '#rp-wait');
        const plTxt = await pl.evaluate(() => document.body.innerText);
        if (/Legendary|Resistance/i.test(plTxt)) throw new Error(`the player can read what the question is: ${plTxt.slice(0, 300)}`);
        await sleep(700);
        await tapIt(dm.locator('#rp .rp-take'));
        await waitShown(dm, '#rp', false);
        await wait(dm, (id) => window.hextable.state.entities[id].legend.resisted >= 1 && !window.hextable.state.pending, drake);
        await wait(pl, () => document.querySelector('#rp-wait').hidden);
        await waitShown(dm, '#lg');
      });

      await run.do('the pick leads the bar; By themselves plays the window with no tap, Suggest waits, Off sends nothing', explained(async () => {
        const auto = (on) => dm.evaluate((v) => { const c = document.getElementById('dm-auto'); c.checked = v; c.dispatchEvent(new Event('change')); }, on);
        const idleStill = async () => { await idle(dm); await wait(dm, () => !window.hextable.timeline.busy()); };
        await waitShown(dm, '#lg');
        // The pick: marked first, its words under it, one button; the other options stay.
        const row = await dm.$eval('#lg .lg-row', (r) => ({ pick: r.querySelector('.lg-pick')?.innerText ?? '', first: r.children[1]?.className, opts: r.querySelectorAll('.lg-opt').length }));
        if (!/\u25b8/.test(row.pick) || !/Do it/.test(row.pick) || !/\./.test(row.pick)) throw new Error(`the pick row does not say what it should: ${JSON.stringify(row)}`);
        if (row.first !== 'lg-pick' || row.opts < 3) throw new Error(`the pick is not first or the options are gone: ${JSON.stringify(row)}`);
        const bh = await dm.$eval('#lg .lg-take', (b) => b.getBoundingClientRect().height);
        if (bh < 56) throw new Error(`Do it is under 56 px: ${bh}`);
        await shot(dm, 'pick');
        // The switch, sent from DM tools.
        await dm.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await dm.evaluate((id) => window.hextable.act({ type: 'legendarySet', actor: id, set: { self: true } }), drake);
        await wait(dm, (id) => window.hextable.state.entities[id].legend.self === true, drake);
        await dm.evaluate(() => { window.__toasts = []; new MutationObserver(() => window.__toasts.push(document.querySelector('#toast')?.textContent ?? '')).observe(document.querySelector('#toast'), { childList: true, characterData: true, subtree: true, attributes: true }); });
        // Off: nothing is sent, and the bar is there for the DM.
        await idleStill(); await sleep(2500);
        if (!(await state(dm, (S) => !!S.encounter.between))) throw new Error('the window was played with Run monsters automatically off');
        await waitShown(dm, '#lg');
        // On: it plays by itself after the pause, with no tap, and the bar does not open.
        // #906: the window played is gone. Not "no window at all": a Pounce that kills makes the dying creatures' turns end at once, each opening the next
        // window, which plays by itself too, so the table can be between two turns at every look.
        const w0 = await state(dm, (S) => JSON.stringify(S.encounter.between));
        await auto(true);
        await wait(dm, (w) => { const b = window.hextable.state.encounter?.between; return !b || JSON.stringify(b) !== w; }, w0, 20000);
        if (!(await dm.evaluate(() => window.__toasts.some((t) => /^Verdigris: /.test(t))))) throw new Error(`no toast said what was done: ${await dm.evaluate(() => JSON.stringify(window.__toasts))}`);
        await auto(false); await idleStill();
        // Suggest, on: nothing is sent while a creature set to Suggest is still to choose.
        await toWindow();
        await dm.evaluate((id) => window.hextable.act({ type: 'legendarySet', actor: id, set: { self: false } }), drake);
        await wait(dm, (id) => window.hextable.state.entities[id].legend.self === false, drake);
        await auto(true); await idleStill(); await sleep(2500);
        if (!(await state(dm, (S) => !!S.encounter.between))) throw new Error('a creature on Suggest was played by itself');
        await waitShown(dm, '#lg');
        await auto(false);
        await dm.evaluate((id) => window.hextable.act({ type: 'legendarySet', actor: id, set: { self: false } }), drake);
      }));

      await run.do("Turns counts the dragon's uses; DM tools has its switches and the two table settings", async () => {
        // The settings wait for the window to close (nothing but its own actions is accepted meanwhile); a dying creature's turn can open the next one, so Done is tapped until the table moves on.
        for (let i = 0; i < 8 && (await state(dm, (S) => !!S.encounter?.between)); i++) { await waitShown(dm, '#lg'); await tapIt(dm.locator('#lg [data-done]')); await sleep(500); await idle(dm); }
        if (await state(dm, (S) => !!S.encounter?.between)) throw new Error('Done did not close the window');
        await openTab(dm, 'turns');
        await wait(dm, (id) => { const lg = window.hextable.state.entities[id].legend; return [...document.querySelectorAll('#tracker .tr-leg')].some((x) => x.textContent === `Legendary ${3 - lg.acts}/3 \u00b7 Resistance ${3 - lg.resisted}/3`); }, drake);      // what the dragon's own record says
        if (await pl.evaluate(() => document.querySelectorAll('#tracker .tr-leg').length)) throw new Error('a player was shown the counters');
        await shot(dm, 'turns');
        await closeMenu(dm);
        await openMenu(dm, 'dm/creatures');
        await waitShown(dm, '#dm-legendary .lg-cr');
        if (!/Only when it matters|Ask me every time/.test(await dm.$eval('#dm-legendary', (e) => e.innerText))) throw new Error('the Legendary Resistance instruction is not offered');
        await dm.selectOption('#dm-legendary [data-lg-rx]', 'never');
        await wait(dm, (id) => window.hextable.state.entities[id].reactions?.['legendary-resistance'] === 'never', drake);
        await dm.locator('#dm-legendary [data-lg-set="show"]').check();
        await wait(dm, (id) => window.hextable.state.entities[id].legend.show === true, drake);
        await shot(dm, 'creatures');
        await closeMenu(dm);
        await openMenu(dm, 'dm/rules');
        if (!(await dm.$eval('#dm-legendary-windows', (c) => c.checked)) || !(await dm.$eval('#dm-legendary-resistance', (c) => c.checked))) throw new Error('the table settings do not show as on');
        await dm.locator('#dm-legendary-resistance').uncheck();
        await wait(dm, () => window.hextable.state.settings.legendaryResistance === false);
        await closeMenu(dm);
        // A player sees the dragon's uses now that the DM shows them, and the setting that changed is sent as it is.
        await wait(pl, (id) => window.hextable.state.entities[id].legend?.max === 3, drake);
      });
    } finally { await plCtx.close(); await dmCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=legendary.
export default async function (browser, url) {
  await legendary(browser, url, WIDE, PHONE, 'a wide DM, a phone player');
  await legendary(browser, url, PHONE, WIDE, 'a phone DM, a wide player');
}
