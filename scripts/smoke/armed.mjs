
import { sleep, scenario, wait, state, shown, open, playSolo, settle, tapAt, onCanvas, closePanels, panelTab, placeBeside } from './lib.mjs';

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
        const nearId = await page.evaluate(() => {
          document.getElementById('dm-auto').checked = false;
          return Object.values(window.hextable.state.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden)[0].id;
        });
        await placeBeside(page, lo, nearId);
        const setup = await page.evaluate(([LO, NEAR]) => {
          const h = window.hextable, S = h.state;
          const foes = Object.values(S.entities).filter((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
          const near = S.entities[NEAR];
          const lo = h.state.entities[LO];
          const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
          const farthest = foes.slice().sort((a, b) => dist(b.pos, lo.pos) - dist(a.pos, lo.pos))[0];
          h.act({ type: 'startEncounter', center: near.pos });
          return { foe: near.id, far: farthest.id, d: dist(farthest.pos, lo.pos) };
        }, [lo, nearId]);
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

// An area aim locks on the first tap or click (issue #456): before it hover previews, after it hover changes nothing, a tap on another
// hex moves the lock, Cast casts at the locked hex, Cancel drops the lock. The wizard casts Burning Hands in a fight.
async function aimLock(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-${n}.png` }); };
      const view = () => page.evaluate(() => { const m = window.hextable.mode; return { kind: m.kind, aim: m.aim ?? null, pinned: !!m.pinned, area: [...window.hextable.R.hl.area].sort().join(' '), hint: document.getElementById('hint-text').textContent }; });
      const tapHex = async (h) => {
        await page.evaluate(async (t) => {          // the hex in the middle of the map, clear of the panels
          const G = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, w = G.toWorld(t);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, h);
        await sleep(600);
        const pt = await page.evaluate((t) => window.hextable.R.screenOf(t), h);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`hex ${JSON.stringify(h)} is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      // A pointer moving about: a mouse over the map and then the Cast button; on touch nothing hovers, so the hover is sent as the renderer would.
      const wander = async (hexes) => {
        if (!touch) { await page.mouse.move(300, 300); await page.mouse.move(640, 420, { steps: 5 }); const b = await page.locator('#hint-go').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); }
        await page.evaluate((hs) => { for (const h of hs) window.hextable.R.onHover(h); }, hexes);
        await sleep(200);
      };
      let wiz, a, b, c;

      await run.do('a fight on the wizard\'s turn; Burning Hands armed: no aim yet, hover previews', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const foe = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: foe.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000).catch(async (e) => { throw new Error(`waiting stuck: ${await page.evaluate(() => JSON.stringify([window.hextable.waiting, !!window.hextable.armed, window.hextable.state.encounter?.turn]))}`); });
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === 'wizard') break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, () => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === 'wizard'; }, null, 20000).catch(async () => { throw new Error(`no turn for the wizard: ${await page.evaluate(() => { const S = window.hextable.state; return JSON.stringify([S.encounter?.order.map((o) => o.id), S.encounter?.turn, S.timeline.slice(-3).map((e) => e.type), document.getElementById('toast')?.textContent]); })}`); });
        await closePanels(page);
        await page.click('#party button:has-text("Tavin")');
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:burning-hands"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'burning-hands');
        wiz = await state(page, (S) => S.entities.wizard.pos);
        a = { q: wiz.q + 2, r: wiz.r }; b = { q: wiz.q, r: wiz.r + 2 }; c = { q: wiz.q - 2, r: wiz.r + 2 };
        const v = await view();
        if (v.aim || v.pinned) throw new Error(`armed with an aim already: ${JSON.stringify(v)}`);
        if (!/tap a hex to aim/i.test(v.hint)) throw new Error(`before a tap the hint says "${v.hint}"`);
        await page.evaluate((h) => window.hextable.R.onHover(h), a);
        const w = await view();
        if (!w.aim || w.aim.q !== a.q || w.pinned || !w.area) throw new Error(`hover did not preview: ${JSON.stringify(w)}`);
      });

      await run.do('the first tap locks the aim; the pointer going to Cast (and over other hexes) changes nothing', async () => {
        await tapHex(a);
        const v = await view();
        if (!v.pinned || v.aim?.q !== a.q || v.aim?.r !== a.r) throw new Error(`the tap did not lock at ${JSON.stringify(a)}: ${JSON.stringify(v)}`);
        if (!/Aimed: tap another \w+ to move it, or Cast/.test(v.hint)) throw new Error(`after the tap the hint says "${v.hint}"`);
        await shot('1-locked');
        await wander([b, c, wiz]);
        const w = await view();
        if (w.aim?.q !== a.q || w.aim?.r !== a.r || w.area !== v.area || w.hint !== v.hint) throw new Error(`the aim moved after the lock: ${JSON.stringify([v, w])}`);
        await shot('2-pointer-at-cast');
      });

      await run.do('a tap on another hex moves the lock there, still locked; Cast casts at that hex', async () => {
        await tapHex(b);
        const v = await view();
        if (!v.pinned || v.aim?.q !== b.q || v.aim?.r !== b.r) throw new Error(`the second tap did not move the lock to ${JSON.stringify(b)}: ${JSON.stringify(v)}`);
        await wander([a]);
        if ((await view()).aim?.r !== b.r) throw new Error('hover moved the second lock');
        const n = await state(page, (S) => S.timeline.length);
        await (touch ? page.locator('#hint-go').tap() : page.click('#hint-go'));
        await wait(page, (k) => window.hextable.state.timeline.length > k, n, 15000);
        const ev = await page.evaluate((k) => window.hextable.state.timeline.slice(k).find((e) => e.type === 'cast'), n);
        const at = ev?.hex ?? ev?.at ?? ev?.target;
        if (!ev) throw new Error('Cast sent no cast event');
        if (at && (at.q !== b.q || at.r !== b.r)) throw new Error(`cast at ${JSON.stringify(at)}, locked at ${JSON.stringify(b)}`);
        if ((await view()).kind === 'spell') throw new Error('still armed after Cast');
      });

      await run.do('arm again: the lock is gone; tap then Cancel drops it and a new arming starts unlocked', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'endTurn', actor: 'wizard' }));
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === 'wizard') break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, () => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === 'wizard'; }, null, 20000).catch(async () => { throw new Error(`no turn for the wizard: ${await page.evaluate(() => { const S = window.hextable.state; return JSON.stringify([S.encounter?.order.map((o) => o.id), S.encounter?.turn, S.timeline.slice(-3).map((e) => e.type), document.getElementById('toast')?.textContent]); })}`); });
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:burning-hands"]');
        await wait(page, () => window.hextable.mode.kind === 'spell');
        await tapHex(a);
        if (!(await view()).pinned) throw new Error('no lock on the tap');
        await (touch ? page.locator('#hint-cancel').tap() : page.click('#hint-cancel'));
        await wait(page, () => window.hextable.mode.kind !== 'spell');
        await page.click('#ap-spells [data-row="spell:burning-hands"]');
        await wait(page, () => window.hextable.mode.kind === 'spell');
        const v = await view();
        if (v.pinned || v.aim) throw new Error(`a new arming starts with the old lock: ${JSON.stringify(v)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Flurry of Blows (issue #614): the strikes it grants are armed for the player, the panel and the hint say how many are left, a Focus Point
// spent is said, and a tap on a foe makes them (not the Spear, which reaches first). A level 5 monk with a Spear beside an ogre: Attack with
// the Unarmed Strike (the Attack action), use Flurry of Blows, tap the foe twice.
async function flurry(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const click = (loc) => (touch ? loc.tap() : loc.click());
      const snap = () => state(page, (S, [i, f]) => { const b = S.encounter.budget; return { tl: S.timeline.length, focus: S.entities[i].uses['monks-focus'], bonus: b.bonus, action: b.action, left: b.bonusAttacks?.left ?? 0, hp: S.entities[f].hp, mode: window.hextable.mode.kind, flurry: !!window.hextable.mode.flurry, hint: document.getElementById('hint-text')?.textContent, hintShown: !document.getElementById('hint').hidden }; }, [lo, foe]);
      const strikes = (n) => page.evaluate((k) => window.hextable.state.timeline.slice(k).filter((e) => e.type === 'attack').map((e) => e.name), n);
      const tapFoe = async () => {
        await page.evaluate(async (i) => {
          const H = (await import('./shared/grid.js')).gridOf(window.hextable.state.map), R = window.hextable.R, w = H.toWorld(window.hextable.state.entities[i].pos);
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 22;
        }, foe);
        await settle(page, foe);
        const pt = await page.evaluate((i) => window.hextable.R.screenOf(window.hextable.state.entities[i].pos), foe);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`the foe is not on screen where a tap can reach it: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
      };
      let lo, foe;

      await run.do('a level 5 monk with a Spear beside an ogre, in a fight, on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Lo', class: 'monk', level: 5, subclass: 'open-hand', abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, skills: ['acrobatics', 'insight'], weapons: ['spear'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Lo'));
        lo = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Lo').id);
        const before = await state(page, (S) => Object.keys(S.entities));
        await page.evaluate(async () => {          // the first open hex that takes an ogre, found on a copy
          document.getElementById('dm-auto').checked = false;
          const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js'), h = window.hextable, S = h.state, G = gridOf(S.map);
          const p = Object.values(S.entities).find((e) => e.name === 'Lo').pos;
          for (const t of G.range(p, 8)) {
            if (G.dist(p, t) < 4) continue;
            if (apply(structuredClone({ ...S, timeline: [] }), { type: 'spawn', monster: 'ogre', name: 'Brute', at: { q: t.q, r: t.r } }, { role: 'dm', userId: 'dm' }).ok) { h.act({ type: 'spawn', monster: 'ogre', name: 'Brute', at: { q: t.q, r: t.r } }); return; }
          }
        });
        await wait(page, (b) => Object.keys(window.hextable.state.entities).some((k) => !b.includes(k)), before).catch(async () => { throw new Error(`the ogre was not made: toast "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); });
        foe = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Brute').id);
        await placeBeside(page, lo, foe);
        await page.evaluate((f) => window.hextable.act({ type: 'startEncounter', center: window.hextable.state.entities[f].pos }), foe);
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
        await panelTab(page, 'attacks');
      });

      await run.do('Attack with the Unarmed Strike: one strike, the Action spent', async () => {
        const a = await snap();
        await click(page.locator('#ap-attacks [data-row="atk:unarmed-strike"]'));
        await wait(page, () => window.hextable.mode.kind === 'attack' && window.hextable.mode.id === 'unarmed-strike');
        await tapFoe();
        await wait(page, (n) => window.hextable.state.timeline.length > n, a.tl, 15000);
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 20000);
        const names = await strikes(a.tl), b = await snap();
        if (names.join() !== 'Unarmed Strike') throw new Error(`the Attack action struck with ${names}`);
        if (b.action !== a.action - 1) throw new Error(`Action ${a.action} -> ${b.action}`);
      });

      await run.do('use Flurry of Blows: a Focus Point spent and said, the Unarmed Strike armed with a hint, the row says Flurry: 2 left', async () => {
        const a = await snap();
        await panelTab(page, 'features').catch(() => { throw new Error('the Features tab did not open'); });
        await click(page.locator('#ap-features [data-row="feat:flurry-of-blows"]'));
        await wait(page, (n) => window.hextable.state.timeline.length > n, a.tl, 15000).catch(async (e) => { throw new Error(`Flurry was not sent: ${JSON.stringify(await snap())} toast "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}" row ${await page.locator('#ap-features [data-row="feat:flurry-of-blows"]').getAttribute('class')}`); });
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 20000).catch(() => { throw new Error('the table did not settle after Flurry'); });
        const b = await snap();
        if (b.focus !== a.focus - 1) throw new Error(`Focus Points ${a.focus} -> ${b.focus}`);
        if (b.bonus !== a.bonus - 1 || b.left !== 2) throw new Error(`Flurry did not spend the Bonus Action and grant two strikes: ${JSON.stringify([a, b])}`);
        if (b.mode !== 'attack' || !b.flurry) throw new Error(`the strike is not armed: ${JSON.stringify(b)}`);
        if (!b.hintShown || !/Flurry of Blows: 2 Unarmed Strikes\. Tap a foe\./.test(b.hint)) throw new Error(`the hint says "${b.hint}"`);
        const said = await page.evaluate((n) => { const ev = window.hextable.state.timeline.slice(n).find((e) => e.type === 'std'); return ev ? window.hextable.describe(ev) : null; }, a.tl);      // the log's words for the event
        if (!said || said !== `Flurry of Blows: 1 Focus Point spent (${b.focus} left).`) throw new Error(`the log says "${said}"`);
        // armed on a phone, the panel folds away so the map can be tapped: the row is read from the page, not clicked
        await page.evaluate(() => document.getElementById('ap-tab-attacks').click());
        await wait(page, () => document.getElementById('ap-tab-attacks').getAttribute('aria-selected') === 'true');
        const row = await page.evaluate(() => document.querySelector('#ap-attacks [data-row="atk:unarmed-strike"]')?.textContent ?? '');
        if (!/Flurry: 2 left/.test(row)) throw new Error(`the Unarmed Strike row says "${row}"`);
      });

      await run.do('tap the foe twice: two Unarmed Strikes on the Bonus Action, re-armed between, no Spear', async () => {
        const a = await snap();
        await tapFoe();
        await wait(page, (n) => window.hextable.state.timeline.length > n, a.tl, 15000);
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 20000);
        const mid = await snap();
        if (mid.left !== 1 || mid.mode !== 'attack' || !/Flurry of Blows: 1 Unarmed Strike\. Tap a foe\./.test(mid.hint)) throw new Error(`after one strike: ${JSON.stringify(mid)}`);
        await tapFoe();
        await wait(page, (n) => window.hextable.state.timeline.length > n, mid.tl, 15000);
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 20000);
        const b = await snap(), names = await strikes(a.tl);
        if (names.join() !== 'Unarmed Strike,Unarmed Strike') throw new Error(`the taps struck with ${names}`);
        if (b.left !== 0 || b.action !== a.action) throw new Error(`budget after Flurry: ${JSON.stringify([a, b])}`);
        if (b.focus !== a.focus || b.mode === 'attack' && b.flurry) throw new Error(`the strike is still armed or a Focus Point went: ${JSON.stringify(b)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=armed.
export default async function (browser, url) {
  await armed(browser, url, 'armed features at 1280x800', { viewport: { width: 1280, height: 800 } });
  await armed(browser, url, 'armed features at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await aimLock(browser, url, 'aim lock at 1280x800', { viewport: { width: 1280, height: 800 } });
  await aimLock(browser, url, 'aim lock at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await flurry(browser, url, 'Flurry of Blows at 1280x800', { viewport: { width: 1280, height: 800 } });
  await flurry(browser, url, 'Flurry of Blows at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
