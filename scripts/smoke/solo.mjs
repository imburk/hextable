
import { sleep, scenario, wait, state, waitShown, open, playSolo, tapAt, onCanvas, closeMenu, closePanels, openTab, selectAndMove, diceDuel } from './lib.mjs';

// ---------- solo ----------
async function solo(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const dump = () => state(page, (S) => JSON.stringify(S));

      await run.do('open the lobby and play solo', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
      });

      let before, moved, start;
      await run.do('move a character by tapping the map', async () => {
        before = await dump();
        start = await state(page, (S) => S.entities.fighter.pos);
        moved = await selectAndMove(page, touch, 'fighter', 'Brenna');
        const now = await state(page, (S) => ({ pos: S.entities.fighter.pos, tl: S.timeline.length }));
        if (now.pos.q === start.q && now.pos.r === start.r) throw new Error('the character is where it was');
      });

      await run.do('undo the move with the Undo button', async () => {
        await closePanels(page);
        await wait(page, () => { const b = document.getElementById('btn-undo'); return !b.hidden && !b.disabled; });
        await page.click('#btn-undo');
        await wait(page, (p) => { const q = window.hextable.state.entities.fighter.pos; return q.q === p.q && q.r === p.r; }, start);
        const after = await dump();
        if (after !== before) throw new Error('undo did not give back exactly the game as it was');
      });

      await run.do('open and close the tracker', async () => {
        await openTab(page, 'turns');
        const rows = await page.evaluate(() => document.querySelectorAll('#tr-list li').length);
        if (rows < 4) throw new Error(`the tracker lists ${rows} characters, expected the party`);
        await closeMenu(page);
      });

      // Before the fight on purpose: a character who is down after the fight cannot roll a check ("X is down"),
      // so rolling after it would depend on the dice. Here the party is whole, whatever the seed.
      await run.do('open the character sheet and roll a skill', async () => {
        await closePanels(page);
        await page.click('#party button:has-text("Brenna")');
        await page.click('#btn-sheet');
        await waitShown(page, '#sheet');
        const n = await state(page, (S) => S.timeline.length);
        await page.click('#sheet-body [data-skill="athletics"]');
        try { await wait(page, (k) => window.hextable.state.timeline.length > k && window.hextable.state.timeline.at(-1).type === 'check', n); }
        catch { throw new Error(`the skill roll did not happen; the game said: "${await page.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`); }
        await closeMenu(page);
      });

      await run.do('start a fight in the middle of the field', async () => {
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#dm-start');
        await wait(page, () => window.hextable.mode.kind === 'encounter');
        await closePanels(page);
        // Look at the middle of the field, far enough out that party and monsters are both in the arena.
        const pt = await page.evaluate(async () => {
          const H = await import('./shared/hex.js'), R = window.hextable.R, w = H.toWorld({ q: -1, r: 1 });
          R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = 30;
          await new Promise((r) => setTimeout(r, 600));
          return R.screenOf({ q: -1, r: 1, z: 0 });
        });
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('could not find the middle of the field on screen');
        await tapAt(page, touch, pt.x, pt.y);
        await wait(page, () => !!window.hextable.state.encounter);
        const n = await state(page, (S) => S.encounter.order.length);
        if (n < 5) throw new Error(`only ${n} creatures are in the fight`);
      });

      await run.do('play the fight to the end of round 1', async () => {
        const deadline = Date.now() + 120000;
        let monsterTurns = 0, last = '';
        for (;;) {
          const s = await state(page, (S) => S.encounter && ({ round: S.encounter.round, turn: S.encounter.turn, cur: S.encounter.order[S.encounter.turn]?.id, kind: S.entities[S.encounter.order[S.encounter.turn]?.id]?.kind, name: S.entities[S.encounter.order[S.encounter.turn]?.id]?.name }));
          if (!s) throw new Error('the fight ended before round 2');
          if (s.round >= 2) break;
          if (Date.now() > deadline) throw new Error(`still in round ${s.round} after two minutes (turn of ${s.name})`);
          const key = `${s.round}/${s.turn}`;
          if (key !== last) { last = key; if (s.kind === 'npc') monsterTurns++; }
          if (s.kind === 'pc') {
            await closePanels(page);
            await page.click(`#party button:has-text("${s.name}")`);
            await waitShown(page, '#btn-end');
            await page.click('#btn-end');
          }
          await sleep(250);
        }
        if (!monsterTurns) throw new Error('no monster took a turn');
      });

      await run.do('open the DM panel and end the fight', async () => {
        await closePanels(page);
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#dm-end');
        await wait(page, () => window.hextable.state.encounter === null);
        await closeMenu(page);
      });

      await run.do('open the map editor, paint one tile and leave it', async () => {
        await closePanels(page);
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#dm-edit');
        await waitShown(page, '#editor');
        await page.waitForSelector('#ed-terrain button', { state: 'attached' });
        await sleep(500);
        // Find a tile on screen that the editor panel does not cover, and a terrain it is not already.
        const target = await page.evaluate(async () => {
          const H = await import('./shared/hex.js'), R = window.hextable.R, S = window.hextable.state;
          const lv = S.map.levels.find((l) => l.z === 0) ?? S.map.levels[0];
          const terrains = [...document.querySelectorAll('#ed-terrain button')].map((b) => b.dataset.t);
          const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
          for (let y = h * 0.2; y < h * 0.9; y += 24) for (let x = w * 0.15; x < w * 0.85; x += 24) {
            if (document.elementFromPoint(x, y)?.id !== 'gl') continue;
            const hex = R.planeHex(x, y, lv.z), tile = hex && lv.tiles[H.col(hex)];
            if (tile) return { x, y, col: H.col(hex), level: lv.id, was: tile.t, terrain: terrains.find((t) => t !== tile.t) };
          }
          return null;
        });
        if (!target) throw new Error('found no tile to paint on screen');
        await page.click(`#ed-terrain button[data-t="${target.terrain}"]`);
        await tapAt(page, touch, target.x, target.y);
        await wait(page, (t) => window.hextable.state.map.levels.find((l) => l.id === t.level).tiles[t.col].t === t.terrain, target);
        await page.click('#ed-done');
        await waitShown(page, '#editor', false);
        const still = await state(page, (S, t) => S.map.levels.find((l) => l.id === t.level).tiles[t.col].t, target);
        if (still !== target.terrain) throw new Error('the painted tile did not stay');
      });

      await run.do('open quick entry and close it', async () => {
        await closePanels(page);
        await openTab(page, 'dm');
        await waitShown(page, '#dm');
        await page.click('#qe-add');
        await waitShown(page, '#qe');
        await page.click('#qe-close');
        await waitShown(page, '#qe', false);
        await closePanels(page);
      });

      await run.do('dice: under diceThrow "throw" an armed attack is not applied until it is thrown', async () => {
        await closePanels(page);
        const { pc, foe } = await diceDuel(page, page);
        const before = await state(page, (S) => ({ tl: S.timeline.length, action: S.encounter.budget.action }));
        await page.evaluate(([p, f]) => { const e = window.hextable.state.entities[p]; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
        await waitShown(page, '#dice-tray');
        await sleep(400);
        const armed = await state(page, (S) => ({ tl: S.timeline.length, action: S.encounter.budget.action }));
        if (armed.tl !== before.tl || armed.action !== before.action) throw new Error('the attack was applied before the throw');
        if (touch) await page.locator('#dice-tray .dt-throw').tap(); else await page.click('#dice-tray .dt-throw');
        await waitShown(page, '#dice', true);
        await wait(page, ([p, n]) => window.hextable.state.timeline.length > n && window.hextable.state.timeline.some((e, i) => i >= n && e.type === 'attack' && e.actor === p), [pc, before.tl], 15000);
        if ((await state(page, (S) => S.encounter.budget.action)) !== before.action - 1) throw new Error('the throw did not spend the action');
        await page.evaluate(() => { window.hextable.dice.skip(); window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); window.hextable.act({ type: 'endEncounter' }); });
        await wait(page, () => window.hextable.waiting === 0 && !window.hextable.state.encounter, null, 15000);
      });

      // Last, because it replaces the map: the stock maps are drawn as rooms with a cut-away and as a cave (docs/specs/renderer.md).
      await run.do('the stock dungeon is drawn with a cut-away that follows the camera, and the stock cave as a cave', async () => {
        const load = async (id) => { await page.evaluate((m) => window.hextable.ED.stock(m), id); await wait(page, (m) => window.hextable.state.map.id === m, id); await sleep(400); };
        await load('dungeon');
        const walls = await page.evaluate(async () => {
          const R = window.hextable.R, seen = new Set(); R.cam.pitch = 0.95;
          for (const yaw of [0.5, 2.1, 3.6, 5.2]) { R.cam.yaw = yaw; await new Promise((r) => setTimeout(r, 250)); seen.add(R.cutSig); }
          return { levels: R.floorData.length, faces: R.floorData.reduce((n, l) => n + l.walls.length, 0), built: R.wallMesh.n, cuts: seen.size };
        });
        if (!walls.levels || !walls.faces || !walls.built) throw new Error(`the dungeon's walls were not built: ${JSON.stringify(walls)}`);
        if (walls.cuts < 2) throw new Error(`the cut-away did not change as the camera went round: ${JSON.stringify(walls)}`);
        await load('cave');
        const cave = await page.evaluate(() => { const R = window.hextable.R; return { levels: R.floorData.length, built: R.terrain.n, cells: R.floorData.reduce((n, l) => n + l.patches.reduce((m, p) => m + p.cells.length, 0), 0) }; });
        if (cave.levels !== 1 || cave.cells < 100 || cave.built < 5000) throw new Error(`the cave was not built: ${JSON.stringify(cave)}`);
      });

    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=solo.
export default async function (browser, url) {
  await solo(browser, url, 'solo at 1280x800', { viewport: { width: 1280, height: 800 } });
  await solo(browser, url, 'solo at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
