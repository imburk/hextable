import { sleep, scenario, wait, state, open, playSolo, closePanels, panelTab } from './lib.mjs';

// ---------- the spell card (#787) ----------
// A wizard with Fireball, Magic Missile and Prestidigitation. In the Spells group: the mouse rests on a row and the card comes up (computer), or a finger is held on it (phone, 500 ms,
// through the browser's own touch events); the card names the spell, says what the game does, never casts, stays inside the screen and does not cover the die; Escape or a tap elsewhere
// closes it; on a computer the I key on a focused row opens it too.
async function run1(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-spellcard-${n}.png` }); };
      const casts = () => state(page, (S) => S.timeline.filter((e) => e.type === 'cast').length);
      const cardView = () => page.evaluate(() => {
        const c = document.getElementById('spellcard'); if (!c) return null;
        const r = c.getBoundingClientRect(), d = document.getElementById('btn-menu').getBoundingClientRect(), top = document.elementFromPoint(d.x + d.width / 2, d.y + d.height / 2);
        return { text: c.innerText, r: { l: r.left, t: r.top, r: r.right, b: r.bottom }, vw: document.documentElement.clientWidth, vh: window.innerHeight,
          overlapsDie: r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top, dieOnTop: top === document.getElementById('btn-menu') || document.getElementById('btn-menu').contains(top) };
      });
      const row = (id) => `#ap-spells [data-row="spell:${id}"]`;
      const hold = async (sel) => {
        await (await page.$(sel)).scrollIntoViewIfNeeded();
        const bb = await (await page.$(sel)).boundingBox();
        const on = await page.evaluate(([x, y, q]) => !!document.elementFromPoint(x, y)?.closest(q), [bb.x + 30, bb.y + 12, sel]);
        if (!on) throw new Error(`the row ${sel} is not where a finger can reach it: ${JSON.stringify(bb)}`);
        if (!touch) { await page.mouse.move(bb.x + 30, bb.y + 12); return; }
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 30, y: bb.y + 12 }] });
        await sleep(800);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };

      await run.do('a wizard with Fireball, Magic Missile and Prestidigitation, the Spells group open', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          h.act({ type: 'addCharacter', record: D.derive({ name: 'Wiz', class: 'wizard', level: 5, abilities: { str: 10, dex: 12, con: 14, int: 16, wis: 10, cha: 10 }, skills: [], spells: ['fireball', 'magic-missile', 'prestidigitation'] }).record, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Wiz'));
        await closePanels(page);
        await page.evaluate(() => { const h = window.hextable; h.select(Object.values(h.state.entities).find((e) => e.name === 'Wiz').id); });
        await panelTab(page, 'spells');
        const has = await page.evaluate(() => ['fireball', 'magic-missile', 'prestidigitation'].map((i) => !!document.querySelector(`#ap-spells [data-row="spell:${i}"][data-spellcard="${i}"]`)));
        if (has.includes(false)) throw new Error(`rows without the card's mark: ${has}`);
      });

      await run.do(touch ? 'a held finger on Fireball opens its card and casts nothing' : 'the mouse resting on Fireball opens its card and casts nothing', async () => {
        const n = await casts();
        await hold(row('fireball'));
        await wait(page, () => !!document.getElementById('spellcard'));
        const v = await cardView();
        if (!/Fireball/.test(v.text) || !/Level 3 Evocation/.test(v.text) || !/Casting time\s*1 action/.test(v.text) || !/What the game does/.test(v.text) || !/The game applies most; the DM applies/.test(v.text) || !/At higher levels/.test(v.text)) throw new Error(`the card: ${v.text}`);
        if (v.r.l < 0 || v.r.t < 0 || v.r.r > v.vw || v.r.b > v.vh) throw new Error(`the card is off the screen: ${JSON.stringify(v)}`);
        if (v.overlapsDie || !v.dieOnTop) throw new Error(`the card covers the die: ${JSON.stringify(v)}`);
        if ((await casts()) !== n) throw new Error('the card cast the spell');
        await shot('1-fireball');
      });

      await run.do('Escape closes the card', async () => {
        await page.keyboard.press('Escape');
        await wait(page, () => !document.getElementById('spellcard'));
      });

      await run.do('a manual spell says the DM applies it', async () => {
        await hold(row('prestidigitation'));
        await wait(page, () => !!document.getElementById('spellcard'));
        const v = await cardView();
        if (!/Prestidigitation/.test(v.text) || !/The DM applies it\./.test(v.text) || !/Transmutation cantrip/.test(v.text)) throw new Error(`the card: ${v.text}`);
        if (v.overlapsDie) throw new Error('the card covers the die');
        await shot('2-prestidigitation');
      });

      await run.do('a tap elsewhere closes it', async () => {
        await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
        await wait(page, () => !document.getElementById('spellcard'));
      });

      if (!touch) {
        await run.do('the I key on a focused row opens the card, and I again closes it', async () => {
          await page.focus(row('magic-missile'));
          await page.keyboard.press('i');
          await wait(page, () => /Magic Missile/.test(document.getElementById('spellcard')?.innerText ?? ''));
          await page.keyboard.press('i');
          await wait(page, () => !document.getElementById('spellcard'));
          if ((await casts()) !== 0) throw new Error('a key cast a spell');
        });
      }

      await run.do('a click on the row still casts (the card is only a reading)', async () => {
        await page.click(row('magic-missile'));
        await wait(page, () => window.hextable.mode.kind === 'spell' || window.hextable.state.timeline.some((e) => e.type === 'cast'));
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=spellcard.
export default async function (browser, url) {
  await run1(browser, url, 'the spell card, with the mouse, at 1280x800', { viewport: { width: 1280, height: 800 } });
  await run1(browser, url, 'the spell card, with a long press, at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
