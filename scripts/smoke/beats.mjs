
import { scenario, wait, state, shown, open, playSolo, calm, setPace } from './lib.mjs';

// ---------- beats in the renderer (R4) ----------
// At pace `wait` a door opens over time and a goblin falls over time (the renderer's tweens are seen part way, then at their end);
// at `instant` both are at their end state the moment the update is shown. A skip ends what is easing. Nothing is left half played.
async function beats(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts, { pace: 'wait' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      let door, pc;
      await run.do('start on the stock dungeon with a hero on a door, and a goblin to fall', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { window.hextable.dice.show = 'off'; });
        await setPace(page, 'instant');
        await page.evaluate(() => window.hextable.ED.stock('dungeon'));
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
        const ids = await page.evaluate(() => {
          const h = window.hextable, S = h.state, o = S.map.objects.find((x) => x.def === 'door-wooden' && x.state === 'open');
          const pcId = Object.values(S.entities).find((e) => e.kind === 'pc').id;
          h.act({ type: 'place', actor: pcId, to: { q: o.at.q, r: o.at.r } });
          h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: o.at.q + 1, r: o.at.r } });
          return { door: o.id, pc: pcId, goblin: Object.values(h.state.entities).find((e) => e.side === 'foe')?.id };
        });
        door = ids.door; pc = ids.pc;
        await page.evaluate((i) => { window.__door = i.door; window.__goblin = i.goblin; }, ids);
        if (!ids.goblin) throw new Error('no goblin to fall');
        await calm(page);
      });
      await run.do('at wait a door closes over time and a goblin falls over time', async () => {
        await setPace(page, 'wait');
        const g = await page.evaluate(() => window.__goblin);
        // The tweens start inside the update, so they are read in the same breath as the action; then the time they take is measured.
        const door0 = await page.evaluate(([p, d]) => {
          const h = window.hextable; window.__t0 = performance.now(); h.act({ type: 'use', actor: p, object: d, verb: 'close' });
          const x = (h.R.inner ?? h.R).doors.get(d);
          return { tw: !!x.tw, v: x.v, goal: x.goal };
        }, [pc, door]);
        if (!door0.tw || door0.v === door0.goal) throw new Error(`the door did not start to swing: ${JSON.stringify(door0)}`);
        await wait(page, (d) => !(window.hextable.R.inner ?? window.hextable.R).doors.get(d).tw, door, 5000);
        const took = await page.evaluate(() => performance.now() - window.__t0);
        if (took < 400) throw new Error(`the door swung in ${Math.round(took)} ms`);
        const end = await page.evaluate((d) => { const x = (window.hextable.R.inner ?? window.hextable.R).doors.get(d); return { v: x.v, goal: x.goal }; }, door);
        if (end.v !== end.goal || end.v !== 0) throw new Error(`the door did not end shut: ${JSON.stringify(end)}`);
        await calm(page);
        const fall0 = await page.evaluate((id) => {
          const h = window.hextable; window.__t0 = performance.now(); h.act({ type: 'harm', actor: id, amount: 99 });
          const a = (h.R.inner ?? h.R).actors.get(id);
          return { falling: !!a.tiltTw, tilt: a.tiltNow };
        }, g);
        if (!fall0.falling || fall0.tilt > 0.3) throw new Error(`the goblin did not start to fall: ${JSON.stringify(fall0)}`);
        await wait(page, (id) => { const a = (window.hextable.R.inner ?? window.hextable.R).actors.get(id); return window.hextable.state.entities[id].dead && !a.tiltTw && !a.dying; }, g, 8000);
        const t2 = await page.evaluate(() => performance.now() - window.__t0), tilt = await page.evaluate((id) => (window.hextable.R.inner ?? window.hextable.R).actors.get(id).tiltNow, g);
        if (t2 < 500 || Math.abs(tilt - 1.45) > 0.01) throw new Error(`the goblin fell in ${Math.round(t2)} ms and lies at ${tilt}`);
      });
      await run.do('a skip brings a running swing and fall to their end at once', async () => {
        await calm(page);
        const r = await page.evaluate(([p, d]) => {
          const h = window.hextable; h.act({ type: 'use', actor: p, object: d, verb: 'open' });
          const x = (h.R.inner ?? h.R).doors.get(d), before = { tw: !!x.tw, v: x.v, goal: x.goal, busy: h.timeline.busy() };
          h.timeline.skip();
          return { before, after: { tw: !!x.tw, v: x.v, goal: x.goal, busy: h.timeline.busy() } };
        }, [pc, door]);
        if (!r.before.tw) throw new Error(`the door did not start to swing: ${JSON.stringify(r)}`);
        const after = r.after;
        if (after.tw || after.v !== after.goal) throw new Error(`a skip left the door half way: ${JSON.stringify(after)}`);
      });
      await run.do('at instant the same changes show at once', async () => {
        await setPace(page, 'instant');
        const r = await page.evaluate(([p, d]) => {
          const h = window.hextable; h.act({ type: 'use', actor: p, object: d, verb: 'close' });
          const x = (h.R.inner ?? h.R).doors.get(d);
          return { tw: !!x.tw, v: x.v, goal: x.goal };
        }, [pc, door]);
        if (r.tw || r.v !== r.goal) throw new Error(`at instant the door was not at once: ${JSON.stringify(r)}`);
        const f = await page.evaluate(([d]) => {
          const h = window.hextable, o = h.state.map.objects.find((x) => x.id === d);
          const n = Object.keys(h.state.entities).length;
          for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1]]) { if (Object.keys(h.state.entities).length > n) break; h.act({ type: 'spawn', monster: 'goblin-warrior', at: { q: o.at.q + dq, r: o.at.r + dr } }); }
          const id = Object.values(h.state.entities).filter((e) => e.side === 'foe' && !e.dead).at(-1).id;
          h.act({ type: 'harm', actor: id, amount: 99 });
          const a = (h.R.inner ?? h.R).actors.get(id);
          return { dead: h.state.entities[id].dead, tilt: a.tiltNow, tw: !!a.tiltTw, dying: !!a.dying };
        }, [door]);
        if (!f.dead || f.tw || f.dying || Math.abs(f.tilt - 1.45) > 0.01) throw new Error(`at instant the goblin did not fall at once: ${JSON.stringify(f)}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=beats.
export default async function (browser, url) {
  await beats(browser, url, 'beats at 1280x800', { viewport: { width: 1280, height: 800 } });
  await beats(browser, url, 'beats at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
