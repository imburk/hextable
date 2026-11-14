
import { sleep, scenario, wait, state, shown, open, playSolo, settle, tapAt, onCanvas, closePanels, panelTab } from './lib.mjs';

// ---------- armed class features ----------
// Stunning Strike, a row of the Features tab (packages/client/actionpanel.js, features.js): arm it, then tap a creature. A monk
// is added beside a goblin and the fight started; `touch` taps with a finger. Arm and cancel sends nothing; arm and
// tap a creature out of reach is sent and refused by the engine, spending nothing; arm and tap the goblin sends it.
async function armed(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const btn = () => page.locator('#ap-features [data-row="feat:stunning-strike"]');
      const snap = () => state(page, (S, i) => ({ tl: S.timeline.length, focus: S.entities[i]?.uses?.['monks-focus'], hint: document.getElementById('hint-text')?.textContent }), lo);
      const tapEntity = async (id) => {
        await page.evaluate(async (i) => {          // put it in the middle of the map, clear of the panels
          const H = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, w = H.toWorld(window.hextable.state.entities[i].pos);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, id);
        await settle(page, id);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), id);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`${id} is not on screen where a tap can reach it: ${JSON.stringify(pt)} under ${await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.id || e.className || e.tagName : null; }, [pt?.x ?? 0, pt?.y ?? 0])}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      let foe, far, lo;

      await run.do('a level 5 monk beside a goblin, in a fight, on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Lo', class: 'monk', level: 5, subclass: 'open-hand', abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, skills: ['acrobatics', 'insight'], weapons: ['quarterstaff'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Lo'));
        lo = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Lo').id);
        const setup = await page.evaluate((LO) => {
          const h = window.hextable, S = h.state;
          document.getElementById('dm-auto').checked = false;
          const foes = Object.values(S.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          const near = foes[0];
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: LO, to: { q: near.pos.q + dq, r: near.pos.r + dr } });
            const p = h.state.entities[LO].pos, d = Math.max(Math.abs(p.q - near.pos.q), Math.abs(p.r - near.pos.r), Math.abs(p.q + p.r - near.pos.q - near.pos.r));
            if (d === 1) break;
          }
          const lo = h.state.entities[LO];
          const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
          const farthest = foes.slice().sort((a, b) => dist(b.pos, lo.pos) - dist(a.pos, lo.pos))[0];
          h.act({ type: 'startEncounter', center: near.pos });
          return { foe: near.id, far: farthest.id, d: dist(farthest.pos, lo.pos) };
        }, lo);
        foe = setup.foe; far = setup.far;
        if (setup.d < 2) throw new Error('no creature out of reach to tap');
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === lo) break;
          await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, lo, 20000);
        await closePanels(page);
        await page.click('#party button:has-text("Lo")');
        await page.evaluate(async (a) => {          // both creatures in view
          const H = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, S = window.hextable.state;
          const m = (p, q) => ({ q: (p.q + q.q) / 2, r: (p.r + q.r) / 2 });
          const w = H.toWorld(m(S.entities[a[1]].pos, S.entities[a[0]].pos)); R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, [far, lo]);
        await panelTab(page, 'features');
        await btn().waitFor({ state: 'visible', timeout: 5000 });
      });

      await run.do('arm Stunning Strike, then cancel: armed, hint shown, nothing sent', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature' && window.hextable.mode.id === 'stunning-strike');
        if (!/Stunning Strike: tap a creature/.test((await snap()).hint ?? '')) throw new Error('no hint to tap a creature');
        if (!/armed/.test(await btn().getAttribute('class'))) throw new Error('the button does not show as armed');
        await (touch ? page.locator('#hint-cancel').tap() : page.click('#hint-cancel'));
        await wait(page, () => window.hextable.mode.kind !== 'feature');
        await sleep(300);
        const b = await snap();
        if (b.tl !== a.tl || b.focus !== a.focus) throw new Error('arming and cancelling changed the game');
        if (/armed/.test(await btn().getAttribute('class'))) throw new Error('the button still shows as armed');
      });

      await run.do('arm and tap a creature out of reach: refused, nothing spent, disarmed', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapEntity(far);
        await wait(page, () => window.hextable.mode.kind !== 'feature');
        await sleep(500);
        const b = await snap();
        if (b.tl !== a.tl || b.focus !== a.focus) throw new Error(`a refused feature changed the game: ${JSON.stringify([a, b])}`);
        const toast = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
        if (!toast.trim()) throw new Error('the player was not told why it was refused');
      });

      await run.do('arm and tap the goblin: sent, a Focus Point spent, the save shown', async () => {
        const a = await snap();
        await (touch ? btn().tap() : btn().click());
        await wait(page, () => window.hextable.mode.kind === 'feature');
        await tapEntity(foe);
        await wait(page, (n) => window.hextable.state.timeline.length > n, a.tl, 15000);
        const r = await page.evaluate(([n, i]) => { const S = window.hextable.state; const ev = S.timeline.slice(n); return { types: ev.map((e) => e.type), save: ev.find((e) => e.type === 'save'), focus: S.entities[i].uses['monks-focus'] }; }, [a.tl, lo]);
        if (!r.save) throw new Error(`no save came of it: ${r.types}`);
        if (r.focus !== a.focus - 1) throw new Error(`Focus Points ${a.focus} -> ${r.focus}`);
        if ((await state(page, () => window.hextable.mode.kind)) === 'feature') throw new Error('still armed after sending');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=armed.
export default async function (browser, url) {
  await armed(browser, url, 'armed features at 1280x800', { viewport: { width: 1280, height: 800 } });
  await armed(browser, url, 'armed features at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
