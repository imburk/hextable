import { beats } from './beats.mjs';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { squareRoom } from '../../packages/rules/test/fixtures/square-room.js';
import { sleep, scenario, wait, state, open, playSolo, tapAt, onCanvas as onCanvasAt, closePanels, selectAndMove } from './lib.mjs';

// ---------- the Three.js renderer: camera, picking and squares (R11; the one renderer since R14 step 2, #355) ----------
// Until R14 step 2 this pass ran the hand-written renderer beside the Three.js one and compared them. That renderer is gone, so what it
// agreed with is kept in two ways, on the valley, the stock dungeon, the stock cave and the engine's square-room fixture (S9b: a map on
// squares; there a Large creature, a fight, the highlights and the arena too):
//   1. Agreement with the numbers the hand-written renderer gave for the same state and camera, recorded just before it was deleted
//      (three-parity.golden.json, `probeView` below): where a hex is on the screen (`screenOf`), which hex a tap picks, the plane questions and
//      the axes, to a pixel or two. A camera or picking change that is meant to move them means recording the file again
//      (`PARITY_RECORD=scripts/smoke/three-parity.golden.json SMOKE_ONLY=three-parity npm run smoke` writes what the Three.js renderer says now and
//      compares nothing); one that is not meant to is what this catches. The file's first recording came from the hand-written renderer.
//   2. Checks that need no reference, which the old comparison could not make: `screenPoint` and `planePoint` undo each other, the
//      axes are the way the plane moves under a finger, and (on squares) a Large pawn stands on its four squares and taps on it pick it.
// The game plays on the Three.js renderer (a tap moves a character, a fight starts and ends). Frame times from `stats()` are printed
// (software GL here). SMOKE_SHOTS=<dir> saves a screenshot of each map.
const PARITY_PX = 1.5;
const RECORD = process.env.PARITY_RECORD ? {} : null;
const GOLDEN = JSON.parse(await readFile(new URL('./three-parity.golden.json', import.meta.url), 'utf8'));
const HEX_AT = [[0, 0], [1, 0], [0, 1], [-1, 1], [-2, 1], [2, -2], [3, -1], [-3, 2], [0, -3], [4, 0], [-4, -1], [1, 3]];       // hexes round the character, as offsets
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
// What the page's renderer says about the view: a fixed set of questions and 15 taps, small enough to keep as a record. Exported for the
// script that records the golden file (it needs only the renderer's interface, so it can be asked of any renderer).
export async function probeView(page, touch) {
  const info = await page.evaluate((HEX_AT) => {
    const h = window.hextable, R = h.R, S = h.state, pc = Object.values(S.entities).find((e) => e.kind === 'pc'), z = pc.pos.z ?? 0;
    const hexes = HEX_AT.map(([dq, dr]) => ({ q: pc.pos.q + dq, r: pc.pos.r + dr, z }));
    const W = innerWidth, Hh = innerHeight, all = [];
    for (const fx of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) all.push([Math.round(W * fx), Math.round(Hh * fy)]);
    const pts = all.filter((_, i) => i % 2 === 0), rd = (v) => Math.round(v * 100) / 100, xy = (p) => p && { x: rd(p.x), y: rd(p.y) }, pair = (p) => p && [rd(p[0]), rd(p[1])];
    // the two views of one thing must undo each other: a point to the screen and back to the plane
    const UNIT = Math.sqrt(3) / 5, w = (R.inner ?? R).G.toWorld(pc.pos), fx0 = w.x / UNIT, fy0 = w.z / UNIT;       // the character's own place, in feet: near the view, wherever the map is
    const feet = [[fx0, fy0, z], [fx0 + 10, fy0 + 10, z], [fx0 + 30, fy0 - 20, z + 10]], trip = feet.map(([x, y, f]) => { const s = R.screenPoint(x, y, f), p = s && R.planePoint(s.x, s.y, f); return !s ? null : p ? Math.hypot(p[0] - x, p[1] - y) : 1e9; }).filter((d) => d !== null);       // a point behind the camera has no place on the screen: it is left out
    // and the axes are the way the plane moves under a finger: right along the screen's x, up along its y
    const c = [Math.round(W / 2), Math.round(Hh / 2)], p0 = R.planePoint(c[0], c[1], 0), dir = (p) => { const d = [p[0] - p0[0], p[1] - p0[1]], l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l]; };
    const ax = R.screenAxes(), mx = dir(R.planePoint(c[0] + 20, c[1], 0)), my = dir(R.planePoint(c[0], c[1] - 20, 0));
    return {
      hexes, pts, canvas: pts.map(([x, y]) => document.elementFromPoint(x, y)?.id === 'gl'), trip: trip.length ? Math.max(...trip) : 1e9,
      axisErr: Math.max(Math.hypot(mx[0] - ax.right[0], mx[1] - ax.right[1]), Math.hypot(my[0] - ax.up[0], my[1] - ax.up[1])),
      screen: hexes.map((hx) => xy(R.screenOf(hx))), plane: pts.map(([x, y]) => [R.planeHex(x, y, 0), pair(R.planePoint(x, y, 0)), pair(R.planePoint(x, y, 10))]),
      point: [[0, 0, 0], [10, 10, 0], [30, -20, 10]].map((a) => xy(R.screenPoint(...a))), axes: { right: ax.right.map(rd), up: ax.up.map(rd) },
    };
  }, HEX_AT);
  const picks = [];
  await page.evaluate(() => { const R = window.hextable.R; window.__tap = R.onTap; window.__hit = null; R.onTap = (hit) => { window.__hit = hit; }; });
  for (let i = 0; i < info.pts.length; i++) {
    if (!info.canvas[i]) { picks.push('ui'); continue; }
    await page.evaluate(() => { window.__hit = null; });
    await tapAt(page, touch, ...info.pts[i]);
    picks.push(await page.evaluate(() => window.__hit && { hex: window.__hit.hex, id: window.__hit.id }));
  }
  await page.evaluate(() => { window.hextable.R.onTap = window.__tap; });
  return { ...info, picks };
}
// The view against what was recorded, and against itself.
function compareViews(gold, th) {
  const worst = { screen: 0, plane: 0, point: 0, axes: 0 }, bad = [];
  const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : a === b ? 0 : 1e9);
  gold.screen.forEach((a, i) => { const d = dist(a, th.screen[i]); worst.screen = Math.max(worst.screen, d); if (d > PARITY_PX) bad.push(`screenOf ${JSON.stringify(gold.hexes[i])}: ${JSON.stringify(a)} recorded, ${JSON.stringify(th.screen[i])} now`); });
  gold.point.forEach((a, i) => { const d = dist(a, th.point[i]); worst.point = Math.max(worst.point, d); if (d > PARITY_PX) bad.push(`screenPoint ${i}: ${JSON.stringify(a)} recorded, ${JSON.stringify(th.point[i])} now`); });
  gold.plane.forEach((a, i) => {
    const b = th.plane[i];
    if (JSON.stringify(a[0]) !== JSON.stringify(b[0])) bad.push(`planeHex at ${gold.pts[i]}: ${JSON.stringify(a[0])} recorded, ${JSON.stringify(b[0])} now`);
    for (const k of [1, 2]) { const d = a[k] && b[k] ? Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) : a[k] === b[k] ? 0 : 1e9; worst.plane = Math.max(worst.plane, d); if (d > 0.05) bad.push(`planePoint(${k}) at ${gold.pts[i]}: ${JSON.stringify(a[k])} recorded, ${JSON.stringify(b[k])} now`); }
  });
  for (const k of ['right', 'up']) for (let j = 0; j < 2; j++) { const d = Math.abs(gold.axes[k][j] - th.axes[k][j]); worst.axes = Math.max(worst.axes, d); if (d > 1e-2) bad.push(`screenAxes ${k}: ${JSON.stringify(gold.axes)} recorded, ${JSON.stringify(th.axes)} now`); }
  let same = 0, n = 0;
  gold.picks.forEach((a, i) => { if (a === 'ui' || th.picks[i] === 'ui') return; n++; if (JSON.stringify(a) === JSON.stringify(th.picks[i])) same++; else bad.push(`pick at ${gold.pts[i]}: ${JSON.stringify(a)} recorded, ${JSON.stringify(th.picks[i])} now`); });
  if (th.trip > 0.05) bad.push(`screenPoint then planePoint is ${th.trip.toFixed(3)} from where it began`);
  if (th.axisErr > 0.02) bad.push(`the axes differ from the way the plane moves under a finger by ${th.axisErr.toFixed(3)}`);
  return { worst, same, n, bad };
}
// A valley that is the same on every run: the page's own is made from Math.random, which the library's start-up also draws on.
const fixedValley = (page) => page.evaluate(async () => {
  const { newGame } = await import('./shared/scenario.js'), g = newGame(777), h = window.hextable;
  h.act({ type: 'loadMap', map: g.map });
  for (const e of Object.values(g.entities)) if (e.kind === 'pc' && h.state.entities[e.id]) h.act({ type: 'place', actor: e.id, to: { q: e.pos.q, r: e.pos.r, z: e.pos.z ?? 0 } });
});
// The maps' views, for `threeParity` and for the script that records the golden file: the same steps, whatever renderer the page holds.
export async function showMap(pg, map) {
  if (map === 'square') { await pg.evaluate((m) => window.hextable.act({ type: 'loadMap', map: m }), squareRoom()); await wait(pg, () => window.hextable.state.map.grid === 'square'); }
  else if (map !== 'valley') { await pg.evaluate((m) => window.hextable.ED.stock(m), map); await wait(pg, (m) => window.hextable.state.map.id === m, map); }
  else await fixedValley(pg);
  await closePanels(pg);
  await pg.evaluate(() => { const h = window.hextable, pc = Object.values(h.state.entities).find((e) => e.kind === 'pc'); h.R.focus(pc.id, true); h.R.rotate(0.3); h.R.zoom(0.8); h.R.inset = 90; });
  await sleep(900);
}
export const MAPS = ['valley', 'dungeon', 'cave', 'square'];
// The square fight: an ogre (a Large creature) on four squares, a fight in a room, highlights, and the camera on the ogre. Then nine taps, on the
// ogre's four squares and elsewhere, recorded as the hex each picked and whether it was the ogre. Both are exported for the recording script.
export async function squareFightSetup(page) {
  await page.evaluate(async () => { const h = window.hextable; document.getElementById('dm-auto').checked = false; h.act({ type: 'spawn', monster: 'ogre', at: { q: 9, r: 9 } }); h.act({ type: 'startEncounter', center: { q: 7, r: 7 }, radius: 6 }); });
  await wait(page, () => !!window.hextable.state.encounter && window.hextable.waiting === 0, null, 20000);
  const ogre = await page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.size === 'large').id);
  await page.evaluate(() => { const R = window.hextable.R; R.settle(); R.setHighlights({ move: ['6,5', '7,5', '7,6', '8,8'], area: ['4,4', '5,4', '4,5'], targets: [], allies: [], selected: 'fighter', turn: 'fighter' }); const c = R.inner ?? R, w = c.G.toWorld({ q: 9, r: 9 }), v = c.G.toWorld({ q: 10, r: 10 }); c.cam.x = (w.x + v.x) / 2; c.cam.z = (w.z + v.z) / 2; c.cam.goal = null; c.cam.dist = innerWidth < 600 ? 26 : 16; c.cam.yaw = 0.5; });
  await sleep(1200);
  return ogre;
}
export async function squareTaps(page, touch, width, ogre) {
  const pts = await page.evaluate(() => { const R = window.hextable.R; return [[9, 9, -1, -1], [10, 9, 1, -1], [9, 10, -1, 1], [10, 10, 1, 1], [5, 5, 0, 0], [5, 5, 0.9, 0.9], [5, 5, 0.9, -0.9], [6, 5, -0.97, 0], [8, 8, 0, 0]].map(([q, r, a, b]) => [q, r, R.screenPoint(5 * q + a * 0.8 * 2.5, 5 * r + b * 0.8 * 2.5, 0)]); });
  await page.evaluate(() => { const R = window.hextable.R; window.__tap = R.onTap; window.__hit = null; R.onTap = (hit) => { window.__hit = hit; }; });
  const hits = [];
  for (const [q, r, p] of pts) {
    if (!p || p.x < 4 || p.y < 4 || p.x > width - 60 || !(await onCanvasAt(page, p.x, p.y))) { hits.push('ui'); continue; }
    await page.evaluate(() => { window.__hit = null; });
    await tapAt(page, touch, p.x, p.y);
    hits.push(await page.evaluate(() => window.__hit && { hex: window.__hit.hex, id: window.__hit.id }));
  }
  await page.evaluate(() => { window.hextable.R.onTap = window.__tap; });
  return { hits, named: hits.map((h) => (h === 'ui' || !h ? h : { hex: h.hex, ogre: h.id === ogre })) };      // the ogre's id is the game's, so it is recorded as "the ogre"
}
async function threeParity(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, shots = process.env.SMOKE_SHOTS, tag = touch ? 'phone' : 'desk', ctx = await browser.newContext(opts);
    try {
      await ctx.addInitScript(() => { try { localStorage.setItem('hextable.arenaEdge', JSON.stringify('edge')); } catch { /* storage unavailable */ } });      // these passes look for the glowing edge (#305: the default look has none)
      await ctx.addInitScript(() => { let s = 12345; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; });      // the valley's trees are drawn from a random seed per game
      const page = await ctx.newPage(); run.watch(page);
      await run.do('the Three.js renderer loads the valley from vendor/', async () => {
        const asked = [];
        page.on('request', (r) => { if (r.url().includes('/vendor/')) asked.push(r.url()); });
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three', null, 20000);
        if (!asked.some((u) => u.endsWith('three.module.js'))) throw new Error('the Three.js renderer did not load the library');
      });
      for (const map of MAPS) {
        await run.do(`${map}: screenOf, picking, plane questions and axes are what was recorded and undo each other; screenshot; frame times`, async () => {
          await showMap(page, map);
          await page.evaluate(() => window.hextable.R.focus(Object.values(window.hextable.state.entities).find((e) => e.kind === 'pc').id, true)); await sleep(500);
          const view = await probeView(page, touch), gold = GOLDEN[`${tag}/${map}`];
          if (RECORD) { RECORD[`${tag}/${map}`] = view; return; }
          if (!gold) throw new Error(`three-parity.golden.json has no record for ${tag}/${map}`);
          const r = compareViews(gold, view);
          console.log(`       ${map}: worst screenOf ${r.worst.screen.toFixed(2)} px, screenPoint ${r.worst.point.toFixed(2)} px, planePoint ${r.worst.plane.toFixed(3)} ft-units, axes ${r.worst.axes.toExponential(1)}; ${r.same}/${r.n} picks the same; round trip ${view.trip.toExponential(1)}, axes by finger ${view.axisErr.toExponential(1)}`);
          await sleep(1200); const st = await page.evaluate(() => window.hextable.R.stats());
          console.log(`       ${map} ${tag} frame ms (software GL, median): three ${st.frameMs.toFixed(1)} (${st.drawCalls} calls)`);
          if (shots) await page.screenshot({ path: join(shots, `${map}-${tag}-three.png`) });
          if (r.bad.length) throw new Error(`${r.bad.length} differences, first: ${r.bad.slice(0, 3).join(' | ')}`);
          if (r.n < 6) throw new Error(`only ${r.n} points could be tapped on the canvas`);
        });
      }
      await run.do('square: a Large creature, a fight and the highlights are on the same squares as recorded, and every tap on the ogre picks it', async () => {
        const ogre = await squareFightSetup(page);
        const th = await page.evaluate((id) => { const R = window.hextable.R.inner, a = R.actors.get(id), want = [[9, 9], [10, 9], [9, 10], [10, 10]].map(([q, r]) => R.G.toWorld({ q, r })); return { edge: R.edge.n, kind: window.hextable.R.kind, dx: a.x - want.reduce((s, w) => s + w.x, 0) / 4, dz: a.z - want.reduce((s, w) => s + w.z, 0) / 4, k: a.k, overlay: R.overlay.n, terrain: R.terrain.n }; }, ogre);
        if (th.kind !== 'three') throw new Error(`the renderer is ${th.kind}`);
        if (!(th.edge > 0)) throw new Error('no arena edge was drawn on the square map');
        if (Math.abs(th.dx) > 0.01 || Math.abs(th.dz) > 0.01) throw new Error(`the Large pawn is ${th.dx.toFixed(2)}, ${th.dz.toFixed(2)} drawing units from the middle of its four squares`);
        if (!(th.k >= 2)) throw new Error(`the Large pawn is drawn at ${th.k} times a Medium one: too small for 2 by 2 squares`);
        // four-sided tiles: the outline the renderer builds every cell from has four corners, and the terrain holds no more than a square's
        // prisms or floors take (a hex's would need more: 6 + 6 + 6 triangles of fan, rim and side where a square's take 2 + 8 + 8)
        const sides = await page.evaluate(async () => { const { Builder } = await import('./three-build.js'); return new Builder(window.hextable.R.inner.G).shape.length; });
        if (sides !== 4) throw new Error(`a cell's outline has ${sides} corners in the Three.js renderer on a square map`);
        const { hits, named } = await squareTaps(page, touch, opts.viewport.width, ogre);
        const gold = GOLDEN[`${tag}/square-fight`];
        if (RECORD) { RECORD[`${tag}/square-fight`] = { hits: named, view: await probeView(page, touch) }; return; }
        if (!gold) throw new Error(`three-parity.golden.json has no record for ${tag}/square-fight`);
        let seen = 0;
        gold.hits.forEach((a, i) => { if (a === 'ui' || named[i] === 'ui') return; seen++; if (JSON.stringify(a) !== JSON.stringify(named[i])) throw new Error(`tap ${i}: ${JSON.stringify(a)} recorded, ${JSON.stringify(named[i])} now`); });
        for (let i = 0; i < 4; i++) if (hits[i] !== 'ui' && hits[i]?.id !== ogre) throw new Error(`a tap on the ogre's square ${i} picked ${JSON.stringify(hits[i])} in Three.js`);
        if (seen < 4) throw new Error(`only ${seen} of the taps could reach the canvas`);
        console.log(`       square fight: ${seen} taps picked as recorded; the ogre is ${th.k}x wide on its four squares; arena edge ${th.edge} vertices`);
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: join(process.env.SMOKE_SHOTS, `square-fight-${tag}-three.png`) });
        const view = await probeView(page, touch), r = compareViews(gold.view, view);
        console.log(`       square fight: worst screenOf ${r.worst.screen.toFixed(2)} px, ${r.same}/${r.n} picks the same`);
        if (r.bad.length) throw new Error(`${r.bad.length} differences, first: ${r.bad.slice(0, 3).join(' | ')}`);
      });
    } finally { await ctx.close(); }
  });
  await scenario(`${label}: the game plays on the Three.js renderer`, async (run) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
        await ctx.addInitScript(() => { try { localStorage.setItem('hextable.arenaEdge', JSON.stringify('edge')); } catch { /* storage unavailable */ } });      // these passes look for the glowing edge (#305: the default look has none)
    try {
      const page = await ctx.newPage(); run.watch(page);
      await run.do('load the game and tap a character across the map', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three', null, 20000);
        await wait(page, () => window.hextable.state.entities.fighter);
        const start = await state(page, (S) => S.entities.fighter.pos);
        const to = await selectAndMove(page, touch, 'fighter', 'Brenna');
        if (to.q === start.q && to.r === start.r) throw new Error('the character did not move');
      });
      await run.do('a fight starts, the arena curtain is drawn, a goblin falls, the fight ends', async () => {
        await closePanels(page);
        await page.evaluate(() => { const h = window.hextable, f = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0); h.act({ type: 'startEncounter', center: f.pos }); });
        await wait(page, () => !!window.hextable.state.encounter);
        await wait(page, () => window.hextable.R.inner.edge.n > 0, null, 5000);
        const id = await page.evaluate(() => { const h = window.hextable, f = Object.values(h.state.entities).find((e) => e.side === 'foe' && e.hp > 0); h.act({ type: 'harm', actor: f.id, amount: 99 }); return f.id; });
        await wait(page, (i) => window.hextable.state.entities[i].dead, id);
        await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(page, () => window.hextable.state.encounter === null);
        await sleep(300);
      });
    } finally { await ctx.close(); }
  });
  // shadows off: this pass is about when things happen, and with software GL the sun's pass makes a frame three or four times as long on a computer, which the timing steps feel.
  // The same function runs in the `beats` pass; it is kept here as well because CI's matrix (.github/workflows/smoke.yml) has `three-parity` and not `beats`.
  await beats(browser, `${url}?shadows=off`, `${label}: doors and falls on the Three.js renderer`, opts);
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=three-parity.
export default async function (browser, url) {
  await threeParity(browser, url, 'three-parity at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeParity(browser, url, 'three-parity at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  if (RECORD) { await writeFile(process.env.PARITY_RECORD, `{\n${Object.entries(RECORD).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`); console.log(`       recorded ${Object.keys(RECORD).length} views in ${process.env.PARITY_RECORD}`); }
}
