import { sleep, scenario, wait, state, open, playSolo, calm, tapAt, onCanvas, closePanels, panelTab } from './lib.mjs';
import { squareRoom } from '../../packages/rules/test/fixtures/square-room.js';

// ---------- squares drawn by the default renderer (docs/specs/square-grid.md, S9a) ----------
// The engine's square-room fixture is loaded through the game's own loadMap action, as the DM of a solo game (there is no UI for choosing
// the grid yet). Then: the squares are drawn and floored (four-sided cells, one to a tile); every tap, through the renderer's own screen
// position of a point of a square, lands on the square under it, near its corners too; a Large creature is drawn on its four squares and
// a tap on any of them picks it; a character walks along a diagonal by taps; in a fight the highlight is exactly the squares the engine
// says can be stopped on (5 along a diagonal at Speed 30) and is painted on screen, and a tap on one moves there; a cone is aimed and the
// squares lit are the squares the engine reports. Desktop, and a phone with touch. SMOKE_SHOTS=<dir> saves screenshots.

const MAP = squareRoom();

// The colour on screen at a point of the page, by a screenshot of a few pixels read back in the page.
async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x: Math.max(0, Math.round(x) - 1), y: Math.max(0, Math.round(y) - 1), width: 3, height: 3 } });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data, n = d.length / 4;
    let r = 0, gr = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
    return [r / n, gr / n, b / n];
  }, png.toString('base64'));
}
// How warm, against grey: the highlights are tinted yellow or orange, the floor is not.
const warm = ([r, , b]) => r - b;

async function squares(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/square-${n}-${touch ? 'phone' : 'desktop'}.png` }).catch(() => {}) : null);
      const act = async (a) => { await page.evaluate((x) => window.hextable.act(x), a); await calm(page); };
      const pos = (id) => state(page, (S, i) => S.entities[i].pos, id);
      // The camera over a square, still: wait until the screen point of its middle is the same twice running.
      const look = async (q, r, dist = 18, yaw = 0.5) => {
        await page.evaluate(([q0, r0, d, y]) => { const R = window.hextable.R, w = R.G.toWorld({ q: q0, r: r0 }); R.cam.x = w.x; R.cam.z = w.z; R.cam.goal = null; R.cam.dist = d; R.cam.yaw = y; }, [q, r, dist, yaw]);
        let last = '';
        for (let i = 0; i < 40; i++) {
          const now = await page.evaluate(([q0, r0]) => JSON.stringify(window.hextable.R.screenOf({ q: q0, r: r0, z: 0 })), [q, r]);
          if (now === last) return;
          last = now; await sleep(120);
        }
      };
      // Where a point of a square is on screen (the renderer's own function): its middle, or `k` of the way from the middle to a corner (dq, dr in -1..1).
      const where = (q, r, dq = 0, dr = 0, k = 0) => page.evaluate(([q0, r0, a, b, f]) => window.hextable.R.screenPoint(5 * q0 + a * f * 2.5, 5 * r0 + b * f * 2.5, 0), [q, r, dq, dr, k]);
      const mid = async (q, r, what) => {
        await look(q, r);
        const p = await page.evaluate(([q0, r0]) => window.hextable.R.screenOf({ q: q0, r: r0, z: 0 }), [q, r]);
        if (!p) throw new Error(`${what} is behind the camera`);
        return p;
      };
      // What the renderer reports for a tap: `pass` lets the app go on and act on it, otherwise the tap is only recorded.
      const listen = (pass) => page.evaluate((p) => { const R = window.hextable.R; R.__tap ??= R.onTap; window.__hits = []; R.onTap = (h) => { window.__hits.push(h); if (p) R.__tap(h); }; }, pass);
      const unlisten = () => page.evaluate(() => { const R = window.hextable.R; if (R.__tap) R.onTap = R.__tap; });
      // Tap a point with a real pointer and return what the renderer said was under it.
      const tapPoint = async (p, what) => {
        if (!p || p.x < 4 || p.y < 4 || p.x > opts.viewport.width - 60 || !(await onCanvas(page, p.x, p.y))) {      // the camera buttons run down the right edge
          const under = p && await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.id || e.className || e.tagName : null; }, [p.x, p.y]);
          throw new Error(`${what} is not on the map where a tap can reach it: ${JSON.stringify(p)} under ${under}`);
        }
        await page.evaluate(() => { window.__hits = []; });
        await tapAt(page, touch, p.x, p.y);
        await wait(page, () => window.__hits.length > 0, null, 3000).catch(() => { throw new Error(`a tap on ${what} reported nothing`); });
        return page.evaluate(() => window.__hits[0]);
      };
      const sameCell = (hit, q, r) => !!hit?.hex && hit.hex.q === q && hit.hex.r === r;
      const turnOf = async (id) => {
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === id) break;
          await act({ type: 'endTurn', actor: cur });
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, id, 20000);
      };
      const choose = async (name) => {
        await closePanels(page);
        await page.click(`#party button:has-text("${name}")`);
        await wait(page, () => document.querySelector('#card') && !document.querySelector('#card').hidden);
      };

      await run.do('load square-room as the DM of a solo game: the renderer reads it as squares and floors it with one four-sided cell to a tile', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await page.evaluate((map) => { window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }); window.hextable.act({ type: 'loadMap', map }); }, MAP);
        await wait(page, () => window.hextable.state.map.id === 'square-room' && window.hextable.R.G.kind === 'square' && window.hextable.R.floorData.length > 0);
        await calm(page);
        const r = await page.evaluate(() => {
          const R = window.hextable.R, S = window.hextable.state, cells = R.floorData.flatMap((f) => f.patches.flatMap((p) => p.cells));
          const tiles = S.map.levels.flatMap((l) => Object.keys(l.tiles)).length;
          const corners = R.G.corners({ q: 5, r: 5 }).map(([x, y]) => R.screenPoint(x, y, 0));
          return { kind: R.G.kind, grid: S.map.grid, cells: cells.length, tiles, fours: cells.every((c) => c.poly.length === 4), corners };
        });
        if (r.grid !== 'square' || r.kind !== 'square') throw new Error(`the map is ${r.grid} and the renderer draws ${r.kind}`);
        if (r.cells !== r.tiles || !r.fours) throw new Error(`${r.cells} floor cells for ${r.tiles} tiles; all four-sided: ${r.fours}`);
        const c = r.corners;
        if (c.some((p) => !p)) throw new Error('a corner of a square is behind the camera');
        const turn = c.map((p, i) => { const a = c[(i + 1) % 4], b = c[(i + 2) % 4]; return (a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x); });
        if (!(turn.every((t) => t > 0) || turn.every((t) => t < 0))) throw new Error(`the four corners of a square do not make a convex quadrilateral on screen: ${JSON.stringify(c)}`);
        await closePanels(page);
        await look(4, 4, 22);
        await shot('1-room');
      });

      await run.do('each tap lands on the square under it: the middle of 5,5, a point near each of its four corners, and just over its east side', async () => {
        await listen(false);
        const hit = await tapPoint(await mid(5, 5, '5,5'), 'the middle of 5,5');
        if (!sameCell(hit, 5, 5)) throw new Error(`a tap on the middle of 5,5 picked ${JSON.stringify(hit?.hex)}`);
        for (const [dq, dr] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
          const h = await tapPoint(await where(5, 5, dq, dr, 0.8), `the corner (${dq}, ${dr}) of 5,5`);
          if (!sameCell(h, 5, 5)) throw new Error(`a tap near the corner (${dq}, ${dr}) of 5,5 picked ${JSON.stringify(h?.hex)}`);
        }
        const h2 = await tapPoint(await where(5, 5, 1, 0, 1.25), 'just over the east side of 5,5');
        if (!sameCell(h2, 6, 5)) throw new Error(`a tap just over the east side of 5,5 picked ${JSON.stringify(h2?.hex)}, not 6,5`);
        await unlisten();
      });

      await run.do('a Large creature fills 2 by 2 squares: drawn in the middle of the four, and a tap on any of them picks it', async () => {
        await act({ type: 'spawn', monster: 'ogre', at: { q: 9, r: 9 } });
        const ogre = await state(page, (S) => Object.values(S.entities).find((e) => e.size === 'large').id);
        const r = await page.evaluate((id) => {
          const R = window.hextable.R, a = R.actors.get(id), want = [[9, 9], [10, 9], [9, 10], [10, 10]].map(([q, r0]) => R.G.toWorld({ q, r: r0 }));
          return { x: a.x - want.reduce((s, w) => s + w.x, 0) / 4, z: a.z - want.reduce((s, w) => s + w.z, 0) / 4, k: a.k };
        }, ogre);
        if (Math.abs(r.x) > 0.01 || Math.abs(r.z) > 0.01) throw new Error(`the Large pawn is ${r.x.toFixed(2)}, ${r.z.toFixed(2)} drawing units from the middle of its four squares`);
        if (!(r.k >= 2)) throw new Error(`the Large pawn is drawn at ${r.k} times a Medium one: too small for 2 by 2 squares`);
        await listen(false);
        for (const [q, r0] of [[9, 9], [10, 9], [9, 10], [10, 10]]) {
          await look(9.5, 9.5, touch ? 26 : 16);                          // over the middle of the four squares, so the far ones are clear of the panels
          const h = await tapPoint(await where(q, r0, q === 9 ? -1 : 1, r0 === 9 ? -1 : 1, 0.8), `the Large creature's square ${q},${r0}`);   // the corner of the square away from the pawn's middle
          if (h.id !== ogre) throw new Error(`a tap on its square ${q},${r0} picked ${h.id ?? 'nobody'}, not the ogre`);
          if (!sameCell(h, q, r0) && !(h.hex.q === 9 && h.hex.r === 9)) throw new Error(`a tap on its square ${q},${r0} reported the square ${JSON.stringify(h.hex)}`);
        }
        await unlisten();
        await look(9.5, 9.5, touch ? 26 : 16); await shot('2-large');
        await act({ type: 'remove', actor: ogre });
      });

      await run.do('walk the fighter along a diagonal by tapping 3,3 then 4,4, 5,5 and 6,6: each tap lands on its square and moves her there', async () => {
        await act({ type: 'place', actor: 'fighter', to: { q: 2, r: 2, z: 0 } });
        for (const [id, q] of [['rogue', 0], ['cleric', 1], ['wizard', 2]]) await act({ type: 'place', actor: id, to: { q, r: 14, z: 0 } });
        await choose('Brenna');
        await listen(true);
        for (let k = 1; k <= 4; k++) {
          const q = 2 + k;
          await page.click('#party button:has-text("Brenna")');             // still the one selected
          const hit = await tapPoint(await mid(q, q, `${q},${q}`), `the middle of ${q},${q}`);
          if (!sameCell(hit, q, q)) throw new Error(`the tap on the middle of ${q},${q} picked ${JSON.stringify(hit?.hex)}`);
          await wait(page, (qq) => { const e = window.hextable.state.entities.fighter; return e.pos.q === qq && e.pos.r === qq; }, q, 6000)
            .catch(async () => { throw new Error(`after the tap on ${q},${q} she stands at ${JSON.stringify(await pos('fighter'))}`); });
          await calm(page);
        }
        await unlisten();
        await shot('3-walked');
      });

      await run.do('a fight on the square room: the arena is a 13 by 13 block, and it is the fighter\'s turn at 2,2 with her whole Speed', async () => {
        await act({ type: 'place', actor: 'fighter', to: { q: 2, r: 2, z: 0 } });
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await act({ type: 'spawn', monster: 'goblin-warrior', at: { q: 13, r: 13 } });
        await act({ type: 'place', actor: 'wizard', to: { q: 4, r: 11, z: 0 } });
        await act({ type: 'startEncounter', center: { q: 7, r: 7 }, radius: 6 });
        await turnOf('fighter');
        const a = await state(page, (S) => ({ arena: Object.keys(S.encounter.arena).length, move: S.encounter.budget.move }));
        if (a.arena !== 169) throw new Error(`the arena is ${a.arena} squares, not 13 by 13`);
        if (a.move !== 30) throw new Error(`her movement is ${a.move}, not 30`);
        await choose('Brenna');
        await page.evaluate(() => window.hextable.R.settle());
        await wait(page, () => window.hextable.R.edge.n > 0, null, 5000);
        await look(5, 5, 22); await shot('4-fight');
      });

      await run.do('the highlight is exactly the squares the engine says she can stop on; 7,7 (5 along the diagonal) is in it, 8,8 is not', async () => {
        await wait(page, () => window.hextable.R.hl.move.length > 0, null, 5000);
        const r = await page.evaluate(async () => {
          const { moveOptions } = await import('./shared/engine.js'), S = window.hextable.state, e = S.entities.fighter, R = window.hextable.R;
          const want = [...moveOptions(S, e)].filter(([, v]) => v.canStop).map(([k]) => k).sort(), got = [...R.hl.move].sort();
          return { want: want.length, got: got.length, extra: got.filter((k) => !want.includes(k)).slice(0, 5), missing: want.filter((k) => !got.includes(k)).slice(0, 5), has77: got.includes('7,7'), has88: got.includes('8,8') };
        });
        if (r.want < 20 || r.extra.length || r.missing.length || r.want !== r.got) throw new Error(`engine ${r.want} squares, highlighted ${r.got}; lit but not reachable ${r.extra}; reachable but not lit ${r.missing}`);
        if (!r.has77 || r.has88) throw new Error(`7,7 highlighted: ${r.has77}; 8,8 highlighted: ${r.has88}`);
      });

      await run.do('a reachable square is painted on screen as a highlight and an unreachable one is not', async () => {
        const lit = await mid(7, 7, '7,7'), pl = await pixel(page, lit.x, lit.y);
        const off = await mid(8, 8, '8,8'), pn = await pixel(page, off.x, off.y);
        if (warm(pl) < warm(pn) + 12) throw new Error(`7,7 reads ${pl.map(Math.round)} and 8,8 ${pn.map(Math.round)} on screen: no highlight painted on 7,7`);
      });

      await run.do('a tap on the highlighted 7,7 moves her there along the diagonal, and what is left is under one square', async () => {
        await page.click('#party button:has-text("Brenna")');
        await listen(true);
        const hit = await tapPoint(await mid(7, 7, '7,7'), 'the middle of 7,7');
        if (!sameCell(hit, 7, 7)) throw new Error(`the tap on the middle of 7,7 picked ${JSON.stringify(hit?.hex)}`);
        await wait(page, () => { const e = window.hextable.state.entities.fighter; return e.pos.q === 7 && e.pos.r === 7; }, null, 8000)
          .catch(async () => { throw new Error(`after a tap on 7,7 she stands at ${JSON.stringify(await pos('fighter'))}`); });
        await unlisten();
        await calm(page);
        const left = await state(page, (S) => S.encounter.budget.move);
        if (!(left >= 0 && left < 5)) throw new Error(`after 5 squares along a diagonal her movement left is ${left}, not under one square`);
      });

      await run.do('the wizard aims Burning Hands east and then along a diagonal: the squares lit are the squares the engine reports for the cone, and they are painted', async () => {
        await turnOf('wizard');
        await choose('Tavin');
        await panelTab(page, 'all');
        await page.click('#ap-all button:has-text("Burning Hands")');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'burning-hands');
        const w = await pos('wizard');
        const aim = async (dq, dr) => {
          const target = { q: w.q + dq, r: w.r + dr };
          await listen(true);
          await tapPoint(await mid(target.q, target.r, `the aim ${target.q},${target.r}`), `the aim ${target.q},${target.r}`);
          await unlisten();
          await wait(page, (t) => { const m = window.hextable.mode.aim; return m && m.q === t.q && m.r === t.r; }, target, 4000)
            .catch(async () => { throw new Error(`the aim is ${JSON.stringify(await page.evaluate(() => window.hextable.mode.aim))}, not ${JSON.stringify(target)}`); });
          await wait(page, () => window.hextable.R.hl.area.length > 0, null, 4000);
          return page.evaluate(async (t) => {
            const { areaHexes } = await import('./shared/engine.js'), { SPELLS } = await import('./shared/content/index.js'), S = window.hextable.state, R = window.hextable.R;
            return { want: areaHexes(S, S.entities.wizard, SPELLS['burning-hands'], t).map((h) => `${h.q},${h.r}`).sort(), got: [...R.hl.area].sort() };
          }, target);
        };
        const east = await aim(3, 0);
        if (east.want.length < 5 || east.want.join() !== east.got.join()) throw new Error(`the engine's cone is ${east.want}, the lit squares ${east.got}`);
        const [cq, cr] = east.want[east.want.length >> 1].split(',').map(Number);
        const lit = await mid(cq, cr, 'a cone square'), pl = await pixel(page, lit.x, lit.y);
        const off = await mid(w.q - 3, w.r - 3, 'a square outside the cone'), pn = await pixel(page, off.x, off.y);
        if (warm(pl) < warm(pn) + 12) throw new Error(`a cone square reads ${pl.map(Math.round)} and one outside ${pn.map(Math.round)} on screen: the cone is not painted`);
        await shot('5-cone');
        const diag = await aim(2, -2);
        if (diag.want.length < 4 || diag.want.join() !== diag.got.join()) throw new Error(`aimed on the diagonal, the engine's cone is ${diag.want}, the lit squares ${diag.got}`);
        await page.click('#hint-cancel');
        await wait(page, () => window.hextable.mode.kind === 'move');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=square.
export default async function (browser, url) {
  await squares(browser, url, 'squares at 1280x800', { viewport: { width: 1280, height: 800 } });
  await squares(browser, url, 'squares at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
