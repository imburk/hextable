import { beats } from './beats.mjs';
import { join } from 'node:path';
import { sleep, scenario, wait, state, open, playSolo, tapAt, closePanels, selectAndMove } from './lib.mjs';

// ---------- the Three.js renderer at parity (R11) ----------
// `?renderer=three` against the default renderer, for the same state and the same camera, on the valley, the stock dungeon and the stock
// cave: where a hex is on the screen (`screenOf`), which hex a tap picks, the plane questions and the axes agree to a pixel or two; the
// game plays on the Three.js renderer (a tap moves a character, a fight starts and ends). Frame times from `stats()` are printed for
// both (software GL here: they only compare the two). SMOKE_SHOTS=<dir> saves a screenshot of each renderer on each map.
const PARITY_PX = 1.5;
async function measureView(page, touch) {
  const info = await page.evaluate(() => {
    const h = window.hextable, R = h.R, S = h.state, pc = Object.values(S.entities).find((e) => e.kind === 'pc'), z = pc.pos.z ?? 0;
    const hexes = []; for (let dq = -4; dq <= 4; dq++) for (let dr = -4; dr <= 4; dr++) hexes.push({ q: pc.pos.q + dq, r: pc.pos.r + dr, z });
    const W = innerWidth, Hh = innerHeight, pts = [];
    for (const fx of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) pts.push([Math.round(W * fx), Math.round(Hh * fy)]);
    return {
      hexes, pts, canvas: pts.map(([x, y]) => document.elementFromPoint(x, y)?.id === 'gl'),
      screen: hexes.map((hx) => R.screenOf(hx)), plane: pts.map(([x, y]) => [R.planeHex(x, y, 0), R.planePoint(x, y, 0), R.planePoint(x, y, 10)]),
      point: [[0, 0, 0], [10, 10, 0], [30, -20, 10]].map((a) => R.screenPoint(...a)), axes: R.screenAxes(),
    };
  });
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
function compareViews(gl, th) {
  const worst = { screen: 0, plane: 0, point: 0, axes: 0 }, bad = [];
  const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : a === b ? 0 : 1e9);
  gl.screen.forEach((a, i) => { const d = dist(a, th.screen[i]); worst.screen = Math.max(worst.screen, d); if (d > PARITY_PX) bad.push(`screenOf ${JSON.stringify(gl.hexes[i])}: ${JSON.stringify(a)} vs ${JSON.stringify(th.screen[i])}`); });
  gl.point.forEach((a, i) => { const d = dist(a, th.point[i]); worst.point = Math.max(worst.point, d); if (d > PARITY_PX) bad.push(`screenPoint ${i}: ${JSON.stringify(a)} vs ${JSON.stringify(th.point[i])}`); });
  gl.plane.forEach((a, i) => {
    const b = th.plane[i];
    if (JSON.stringify(a[0]) !== JSON.stringify(b[0])) bad.push(`planeHex at ${gl.pts[i]}: ${JSON.stringify(a[0])} vs ${JSON.stringify(b[0])}`);
    for (const k of [1, 2]) { const d = a[k] && b[k] ? Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) : a[k] === b[k] ? 0 : 1e9; worst.plane = Math.max(worst.plane, d); if (d > 0.05) bad.push(`planePoint(${k}) at ${gl.pts[i]}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`); }
  });
  for (const k of ['right', 'up']) for (let j = 0; j < 2; j++) { const d = Math.abs(gl.axes[k][j] - th.axes[k][j]); worst.axes = Math.max(worst.axes, d); if (d > 1e-3) bad.push(`screenAxes ${k}: ${JSON.stringify(gl.axes)} vs ${JSON.stringify(th.axes)}`); }
  let same = 0, n = 0;
  gl.picks.forEach((a, i) => { if (a === 'ui') return; n++; if (JSON.stringify(a) === JSON.stringify(th.picks[i])) same++; else bad.push(`pick at ${gl.pts[i]}: ${JSON.stringify(a)} vs ${JSON.stringify(th.picks[i])}`); });
  return { worst, same, n, bad };
}
async function threeParity(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, shots = process.env.SMOKE_SHOTS, tag = touch ? 'phone' : 'desk', pages = {}, ctxs = [];
    try {
      for (const kind of ['gl', 'three']) {
        const ctx = await browser.newContext(opts); ctxs.push(ctx);
        await ctx.addInitScript(() => { let s = 12345; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; });      // the valley's trees are drawn from a random seed per game
        const page = await ctx.newPage(); run.watch(page, ` (${kind})`); pages[kind] = page;
      }
      await run.do('both renderers load the valley, the Three.js one from vendor/ and only on request', async () => {
        const asked = { gl: [], three: [] };
        for (const k of ['gl', 'three']) pages[k].on('request', (r) => { if (r.url().includes('/vendor/')) asked[k].push(r.url()); });
        await open(pages.gl, url); await playSolo(pages.gl);
        await open(pages.three, `${url}?renderer=three`); await playSolo(pages.three);
        await wait(pages.three, () => window.hextable.R.kind === 'three', null, 20000);
        if (asked.gl.length) throw new Error(`the default renderer fetched ${asked.gl.join(', ')}`);
        if (!asked.three.some((u) => u.endsWith('three.module.js'))) throw new Error('the Three.js renderer did not load the library');
      });
      const valley = await pages.gl.evaluate(() => structuredClone(window.hextable.state.map));
      for (const map of ['valley', 'dungeon', 'cave']) {
        await run.do(`${map}: screenOf, picking, plane questions and axes agree; screenshots; frame times`, async () => {
          for (const k of ['gl', 'three']) {
            const pg = pages[k];
            if (map !== 'valley') { await pg.evaluate((m) => window.hextable.ED.stock(m), map); await wait(pg, (m) => window.hextable.state.map.id === m, map); }
            else await pg.evaluate((m) => window.hextable.act({ type: 'loadMap', map: m }), valley);      // the same valley in both: Three.js draws on Math.random (its ids), so the two pages' random valleys can differ
            await closePanels(pg);
            await pg.evaluate(() => { const h = window.hextable, pc = Object.values(h.state.entities).find((e) => e.kind === 'pc'); h.R.focus(pc.id, true); h.R.rotate(0.3); h.R.zoom(0.8); h.R.inset = 90; });
            await sleep(900);
          }
          const view = {};
          for (const k of ['gl', 'three']) { await pages[k].evaluate(() => window.hextable.R.focus(Object.values(window.hextable.state.entities).find((e) => e.kind === 'pc').id, true)); await sleep(500); view[k] = await measureView(pages[k], touch); }
          const r = compareViews(view.gl, view.three);
          console.log(`       ${map}: worst screenOf ${r.worst.screen.toFixed(2)} px, screenPoint ${r.worst.point.toFixed(2)} px, planePoint ${r.worst.plane.toFixed(3)} ft-units, axes ${r.worst.axes.toExponential(1)}; ${r.same}/${r.n} picks the same`);
          const st = {};
          for (const k of ['gl', 'three']) { await sleep(1200); st[k] = await pages[k].evaluate(() => { const R = window.hextable.R; return R.stats(); }); }
          console.log(`       ${map} ${tag} frame ms (software GL, median): gl ${st.gl.frameMs.toFixed(1)} (${st.gl.drawCalls} calls), three ${st.three.frameMs.toFixed(1)} (${st.three.drawCalls} calls)`);
          if (shots) for (const k of ['gl', 'three']) await pages[k].screenshot({ path: join(shots, `${map}-${tag}-${k}.png`) });
          if (r.bad.length) throw new Error(`${r.bad.length} differences, first: ${r.bad.slice(0, 3).join(' | ')}`);
          if (r.n < 6) throw new Error(`only ${r.n} points could be tapped on the canvas`);
        });
      }
    } finally { for (const c of ctxs) await c.close(); }
  });
  await scenario(`${label}: the game plays on the Three.js renderer`, async (run) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      await run.do('load with ?renderer=three and tap a character across the map', async () => {
        await open(page, `${url}?renderer=three`); await playSolo(page);
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
  await beats(browser, `${url}?renderer=three`, `${label}: doors and falls on the Three.js renderer`, opts);
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=three-parity.
export default async function (browser, url) {
  await threeParity(browser, url, 'three-parity at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeParity(browser, url, 'three-parity at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
