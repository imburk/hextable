import { sleep, scenario, wait, state, open, playSolo, settle, onCanvas, closePanels, panelTab, chip, placeBeside, tapDie, waitShown, choiceView } from './lib.mjs';

// ---------- the d20 confirms (#750, docs/specs/one-token-menu.md "Amendment: the d20 confirms") ----------
// A cleric with Bless (up to three creatures) and two friends beside her. Armed, the die's ring is dashed and pulses (steady under reduced motion), its spoken name is
// "Confirm Bless", the aim bar has no Go button, and a note at the top says "No target yet: tap one, then the die." (the die does nothing). A tap on a friend and another
// choose two ("2 of 3 targets", nothing sent); a double-tap on one takes it off ("1 of 3 targets"); the die (a tap on a phone, Enter on a computer) sends the cast with what is chosen.
// Part 2 (#750): a wizard with Magic Missile and slots 0 / 2 / 1 arms it; there is no menu in the aim bar, the sheet opens at the Cast section with the levels at its top: the ones that can be used are
// highlighted (the chosen one filled and ticked), the spent one is greyed and says why in words; a tap on it only says so; a tap on another level moves the choice.
async function run1(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-dieconfirm-${n}.png` }); };
      const view = () => page.evaluate(() => ({
        note: document.getElementById('aim-note').hidden ? '' : document.getElementById('aim-note').textContent,
        hint: document.getElementById('hint-text').textContent, goShown: !document.getElementById('hint-go').hidden,
        label: document.getElementById('btn-menu').getAttribute('aria-label'), waiting: document.getElementById('btn-menu').classList.contains('waiting'),
        picked: [...(window.hextable.mode.picked ?? [])], kind: window.hextable.mode.kind }));
      const casts = () => state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
      // Looked at from above, no pawn stands between the camera and another: the tap lands on the one looked up.
      const pointOf = async (id) => {
        await page.evaluate((i) => { const R = window.hextable.R; R.focus(i, true); const c = (R.inner ?? R).cam; c.pitch = 1.45; c.dist = 14; }, id);
        await settle(page, id);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), id);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`${id} is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        return pt;
      };
      let cleric, fen, rae;
      // A double-tap is two taps within DOUBLE_MS (350 ms) of each other, measured in the page when each is handled. Two awaited page.touchscreen.tap / mouse.click calls
      // are two round trips, and on a slow runner they land further apart than that (#892). So all four events (down, up, down, up) go to the browser through CDP in one
      // burst, nothing awaited between them: it handles them in order, back to back. The page notes when each tap arrived, so a failure can say what the gap was.
      let cdp = null;
      const dbl = async (pt) => {
        cdp ??= await ctx.newCDPSession(page);
        await page.evaluate(() => { window.__taps = []; if (!window.__tapWatch) { window.__tapWatch = true; addEventListener('pointerup', () => window.__taps.push(Math.round(performance.now())), true); } });
        const ev = touch
          ? [['touchStart', 'touchPoint'], ['touchEnd'], ['touchStart', 'touchPoint'], ['touchEnd']].map(([type, pts]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts ? [{ x: pt.x, y: pt.y }] : [] }))
          : [['mousePressed'], ['mouseReleased'], ['mousePressed'], ['mouseReleased']].map(([type], i) => cdp.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: i < 2 ? 1 : 2 }));
        await Promise.all(ev);
      };
      const tapGap = () => page.evaluate(() => window.__taps ?? []);
      const gone = async (what) => { const v = await view(), t = await tapGap(); return `${what}: picked ${JSON.stringify(v.picked)}, note ${JSON.stringify(v.note)}, the two taps arrived at ${JSON.stringify(t)} ms (gap ${t.length === 2 ? t[1] - t[0] : 'unknown'}, limit 350)`; };
      const dblWait = async (n, what) => { try { await wait(page, (k) => window.hextable.mode.picked?.length === k, n); } catch (err) { throw new Error(`${await gone(what)}; ${err.message}`); } };
      const tapOn = (pt) => (touch ? page.touchscreen.tap(pt.x, pt.y) : page.mouse.click(pt.x, pt.y));

      await run.do('a cleric with Bless and two friends beside her', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const mk = (name, cls, spells, at) => h.act({ type: 'addCharacter', record: D.derive({ name, class: cls, level: 3, abilities: { str: 12, dex: 12, con: 14, int: 10, wis: 16, cha: 10 }, skills: [], spells }).record, at });
          mk('Cleo', 'cleric', ['bless'], { q: -4, r: 3, z: 0 }); mk('Fen', 'fighter', [], { q: -3, r: 3, z: 0 }); mk('Rae', 'rogue', [], { q: -4, r: 2, z: 0 });
        });
        await wait(page, () => ['Cleo', 'Fen', 'Rae'].every((n) => Object.values(window.hextable.state.entities).some((e) => e.name === n)));
        [cleric, fen, rae] = await Promise.all(['Cleo', 'Fen', 'Rae'].map((n) => state(page, (S, k) => Object.values(S.entities).find((e) => e.name === k).id, n)));
        await placeBeside(page, fen, cleric); await placeBeside(page, rae, cleric);
        await closePanels(page);
        await chip(page, 'Cleo');
        const v = await view();
        if (v.waiting || v.label !== 'Menu') throw new Error(`the die waits before anything is armed: ${JSON.stringify(v)}`);
      });

      await run.do('Bless armed: the die waits (dashed ring, "Confirm Bless"), no Go button, the note says no target yet, and the die does nothing', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:bless"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'bless');
        await wait(page, () => document.getElementById('btn-menu').classList.contains('waiting'));
        const v = await view(), n = await casts();
        if (v.label !== 'Confirm Bless' || v.goShown || v.note !== 'No target yet: tap one, then the die.') throw new Error(`armed: ${JSON.stringify(v)}`);
        const ring = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#btn-menu .tk-wait')), d = getComputedStyle(document.querySelector('#btn-menu .tk-disc')); return { shown: c.display !== 'none', dash: c.strokeDasharray, anim: c.animationName, discDash: d.strokeDasharray }; });
        if (!ring.shown || ring.dash === 'none' || ring.discDash !== 'none' || ring.anim !== 'tk-wait') throw new Error(`the waiting ring: ${JSON.stringify(ring)}`);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const still = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#btn-menu .tk-wait')); return { shown: c.display !== 'none', anim: c.animationName }; });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        if (!still.shown || still.anim !== 'none') throw new Error(`under reduced motion the ring is ${JSON.stringify(still)}`);
        const box = await page.locator('#btn-menu').boundingBox();
        if (box.width < 44 || box.height < 44) throw new Error(`the die is ${box.width}x${box.height}`);
        await shot('1-armed');
        if (touch) await tapDie(page, true); else await page.keyboard.press('Enter');
        await sleep(400);
        const w = await view();
        if ((await casts()) !== n || w.kind !== 'spell' || w.note !== 'No target yet: tap one, then the die.') throw new Error(`with none chosen the confirm did something: ${JSON.stringify(w)}`);
      });

      await run.do('two taps choose two ("2 of 3 targets") and send nothing; a double-tap takes one off ("1 of 3 targets")', async () => {
        await closePanels(page);                                   // Bless has a level to choose (a higher slot adds a target), so the sheet stayed open at its choices (#750 part 2): the map is next
        await tapOn(await pointOf(fen)); await wait(page, () => window.hextable.mode.picked?.length === 1);
        await tapOn(await pointOf(rae)); await wait(page, () => window.hextable.mode.picked?.length === 2);
        const n = await casts(), v = await view();
        if (v.note !== '2 of 3 targets' || v.picked.join() !== `${fen},${rae}`) throw new Error(`two chosen: ${JSON.stringify(v)}`);
        await shot('2-two-chosen');
        await sleep(500);                                          // a pause: the next taps are a pair of their own
        await dbl(await pointOf(fen));
        await dblWait(1, 'a double-tap takes one off');
        const w = await view();
        if (w.note !== '1 of 3 targets' || w.picked.join() !== rae || w.label !== 'Confirm Bless' || (await casts()) !== n) throw new Error(`one taken off: ${JSON.stringify(w)}`);
        await sleep(500);
        await dbl(await pointOf(fen));                             // a double-tap on one that is not chosen chooses it once
        await dblWait(2, 'a double-tap on a new target');
        if ((await view()).picked.join() !== `${rae},${fen}`) throw new Error(`a double-tap on a new target: ${JSON.stringify(await view())}`);
        await sleep(500);
        await dbl(await pointOf(fen));
        await dblWait(1, 'the second double-tap');
        if ((await view()).note !== '1 of 3 targets') throw new Error('the second double-tap did not take it off');
      });

      await run.do(touch ? 'the die confirms with what is chosen (one of three): Bless is cast on one creature' : 'Enter confirms with what is chosen (one of three): Bless is cast on one creature', async () => {
        const n = await casts();
        if (touch) await tapDie(page, true); else await page.keyboard.press('Enter');
        await wait(page, (k) => window.hextable.state.timeline.filter((e) => e.type === 'cast').length > k, n, 15000);
        const ev = await state(page, (S) => S.timeline.filter((e) => e.type === 'cast').at(-1));
        if (ev.spell !== 'bless' || (ev.targets ?? []).join() !== rae) throw new Error(`the cast: ${JSON.stringify(ev)}`);
        await wait(page, () => window.hextable.mode.kind === 'move' && !document.getElementById('btn-menu').classList.contains('waiting'));
        const v = await view();
        if (v.label !== 'Menu' || v.note !== '') throw new Error(`after the confirm: ${JSON.stringify(v)}`);
        await shot('3-cast');
      });

      await run.do('choices on the sheet: Magic Missile armed with slots 0 / 2 / 1 opens the Cast section at its choices, usable levels highlighted, the spent one greyed with its reason', async () => {
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ivo', class: 'wizard', level: 3, abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['magic-missile'] }).record;
          rec.slots = { 1: 0, 2: 2, 3: 1 };
          h.act({ type: 'addCharacter', record: rec, at: { q: -5, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ivo'));
        await closePanels(page);
        await chip(page, 'Ivo');
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:magic-missile"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'magic-missile');
        await waitShown(page, '#ap-choices');
        const v = await choiceView(page, 'slot');
        if (v.old || !v.inDrawer || v.pane !== 'ap-spells' || v.first !== 'ap-choices' || v.all.map((o) => o.v).join() !== '1,2,3' || v.usable.join() !== '2,3' || v.on !== '2') throw new Error(`the levels on the sheet: ${JSON.stringify(v)}`);
        const spent = v.all[0];
        if (!spent.off || spent.why !== 'No level 1 spell slot left.' || !spent.label.includes(spent.why)) throw new Error(`the spent level says: ${JSON.stringify(spent)}`);
        if (touch && v.minH < 44) throw new Error(`the choices are ${v.minH}px high on touch`);
        const look = await page.evaluate(() => [...document.querySelectorAll('#ap-choices [data-ch="slot"]')].map((b) => { const c = getComputedStyle(b); return { v: b.dataset.v, style: c.borderTopStyle, w: c.borderTopWidth, bg: c.backgroundColor }; }));
        const [off, on, use] = look;
        if (off.style !== 'dashed' || use.style !== 'solid' || use.w !== '2px' || on.bg === use.bg || on.bg === off.bg) throw new Error(`highlighted, chosen and greyed look the same: ${JSON.stringify(look)}`);
        const die = await page.evaluate(() => { const el = document.getElementById('btn-menu'), r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { ok: top === el || el.contains(top), r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; });
        if (!die.ok) throw new Error(`the sheet covers the die: ${JSON.stringify(die)}`);
        await shot('4-choices');
        await page.click('#ap-choices [data-ch="slot"][data-v="1"]', { force: true });      // aria-disabled: a tap on it is allowed and only says why
        await wait(page, () => /No level 1 spell slot left/.test(document.getElementById('toast').textContent));
        if ((await choiceView(page, 'slot')).on !== '2') throw new Error('a tap on a greyed level changed the choice');
        await page.click('#ap-choices [data-ch="slot"][data-v="3"]');
        await wait(page, () => window.hextable.mode.slot === 3 && /up to 5/.test(document.getElementById('hint-text').textContent));
        const w = await choiceView(page, 'slot');
        if (w.on !== '3' || w.usable.join() !== '2,3' || !(await page.evaluate(() => !document.getElementById('drawer').hidden))) throw new Error(`level 3 chosen: ${JSON.stringify(w)}`);
        await shot('5-level-3');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=dieconfirm.
export default async function (browser, url) {
  await run1(browser, url, 'the d20 confirms, with the keyboard, at 1280x800', { viewport: { width: 1280, height: 800 } });
  await run1(browser, url, 'the d20 confirms, with a tap, at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
