
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { squareRoom } from '../../packages/rules/test/fixtures/square-room.js';
import { sleep, scenario, wait, open, playSolo, closePanels, tapAt } from './lib.mjs';

// ---------- vendored Three.js (R10) ----------
// A normal page load fetches nothing under vendor/. Then, in the page, the vendored module is imported (gzipped by the
// server), a WebGLRenderer on an offscreen canvas draws a cube, and GLTFLoader and SkeletonUtils import.
async function threePass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const asked = [], got = [];
      page.on('request', (r) => asked.push(r.url()));
      page.on('response', (r) => { if (r.url().includes('/vendor/')) got.push({ url: r.url(), enc: r.headers()['content-encoding'], vary: r.headers()['vary'], status: r.status() }); });
      // The library is fetched by a page that draws (the default since R14 step 1, #348; the only one since step 2, #355). A page that chose
      // the renderer that draws nothing (`?renderer=none`) still fetches nothing under vendor/: this was the check for the old renderer's page.
      await run.do('a page and a solo game on ?renderer=none fetch nothing under vendor/', async () => {
        await open(page, `${url}?renderer=none`); await playSolo(page); await sleep(1000);
        const v = asked.filter((u) => u.includes('/vendor/'));
        if (v.length) throw new Error(`the page fetched ${v.join(', ')}`);
      });
      await run.do('a normal page load and a solo game load the library and draw with the Three.js renderer', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three' && window.hextable.state.entities.fighter, null, 30000);
        if (!asked.some((u) => u.endsWith('/vendor/three/three.module.js'))) throw new Error('the default page did not fetch the library');
        if (await page.evaluate(() => !document.getElementById('gl-status').hidden)) throw new Error('the loading message is still up');
      });
      await run.do('while the library loads the table says so; if it cannot load, a message says that, offers nothing else, and the table still plays', async () => {
        const ctx2 = await browser.newContext(opts);
        try {
          const p2 = await ctx2.newPage();
          p2.on('pageerror', (e) => run.problems.push(`page error: ${e.message}`));
          p2.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) run.problems.push(`console error: ${m.text()}`); });      // the blocked library is the point of this step
          let hold = true; await p2.route('**/vendor/**', async (route) => { while (hold) await sleep(100); route.continue(); });
          await open(p2, url); await playSolo(p2);
          await wait(p2, () => !document.getElementById('gl-status').hidden && /Loading the 3D view/.test(document.getElementById('gl-status-text').textContent), null, 10000);
          hold = false; await wait(p2, () => window.hextable.R.kind === 'three' && document.getElementById('gl-status').hidden, null, 30000);
          await p2.unroute('**/vendor/**'); await p2.route('**/vendor/**', (route) => route.abort());
          await p2.goto(url); await playSolo(p2);
          await wait(p2, () => document.getElementById('gl-status').classList.contains('failed'), null, 15000);
          const msg = await p2.evaluate(() => document.getElementById('gl-status-text').textContent);
          if (!/could not be loaded/.test(msg)) throw new Error(`the failure message reads: ${msg}`);
          if (await p2.evaluate(() => !!document.getElementById('gl-status-classic') || document.querySelector('#gl-status button'))) throw new Error('the failure message offers a button: there is no other renderer to offer');
          if ((await p2.evaluate(() => window.hextable.R.kind)) !== null) throw new Error('a renderer holds the canvas');
          await wait(p2, () => window.hextable.state.entities.fighter, null, 20000);      // the rest of the table is there
          await p2.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));
        } finally { await ctx2.close(); }
      });
      await run.do('a device with no WebGL 2 sees a message in place of the picture, no page error, and the table still plays (R14 step 2)', async () => {
        const ctx3 = await browser.newContext(opts);
        try {
          const p3 = await ctx3.newPage(); run.watch(p3);
          await ctx3.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...a) { return kind === 'webgl2' ? null : g.call(this, kind, ...a); }; });
          await open(p3, url); await playSolo(p3);
          await wait(p3, () => document.getElementById('gl-status').classList.contains('failed') && /WebGL 2/.test(document.getElementById('gl-status-text').textContent), null, 15000);
          if ((await p3.evaluate(() => window.hextable.R.kind)) !== null) throw new Error('a renderer holds the canvas');
          const asked = await p3.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/vendor/')));
          if (asked.length) throw new Error(`the page fetched ${asked.join(', ')} though the picture cannot start`);
          await wait(p3, () => window.hextable.state.entities.fighter, null, 20000);
          await p3.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));
          if (process.env.SMOKE_SHOTS) await p3.screenshot({ path: join(process.env.SMOKE_SHOTS, `three-no-webgl2-${opts.hasTouch ? 'phone' : 'desk'}.png`) }).catch(() => {});
        } finally { await ctx3.close(); }
      });
      await run.do('the vendored module loads, draws a cube on an offscreen canvas, GLTFLoader and SkeletonUtils import', async () => {
        const r = await page.evaluate(async () => (await import('/three-check.js')).checkThree());
        if (!/^\d+$/.test(String(r.revision))) throw new Error(`revision: ${JSON.stringify(r)}`);
        if (r.pixel[0] < 200 || !(r.drawCalls >= 1)) throw new Error(`result: ${JSON.stringify(r)}`);
        console.log(`       three r${r.revision}, webgl2 ${r.webgl2}, middle pixel ${r.pixel}, ${r.drawCalls} draw call(s)`);
      });
      await run.do('the vendored files came over gzipped', async () => {
        const want = ['three.module.js', 'three.core.js', 'GLTFLoader.js', 'SkeletonUtils.js', 'BufferGeometryUtils.js'];
        for (const f of want) {
          const r = got.find((g) => g.url.endsWith('/' + f));
          if (!r) throw new Error(`${f} was not requested`);
          if (r.status !== 200 || r.enc !== 'gzip' || !/accept-encoding/i.test(r.vary ?? '')) throw new Error(`${f}: ${JSON.stringify(r)}`);
        }
        // and the server sends it plain to a client that does not accept gzip
        const plain = await fetch(url + 'vendor/three/three.module.js', { headers: { 'accept-encoding': 'identity' } });
        if (plain.headers.get('content-encoding')) throw new Error('identity request got a content-encoding');
      });
    } finally { await ctx.close(); }
  });
}

// ---------- real shadows (R15) ----------
// On the Three.js renderer: the default is on for a computer or tablet and off for a phone; the Settings control and the page event switch it;
// with it on the picture differs from the picture with it off by a patch of floor (not by the whole screen), on a hex map and on a square one;
// and the sun's pass is not redrawn while nothing moves. Screenshots go to SMOKE_SHOTS.
async function pixelsApart(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = (u) => createImageBitmap(new Blob([Uint8Array.from(atob(u), (c) => c.charCodeAt(0))], { type: 'image/png' }));      // not fetch(data:): the page's policy refuses it
    const [p, q] = [await load(x), await load(y)], cv = new OffscreenCanvas(p.width, p.height), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(p, 0, 0); const A = g.getImageData(0, 0, p.width, p.height).data; g.clearRect(0, 0, p.width, p.height); g.drawImage(q, 0, 0); const B = g.getImageData(0, 0, p.width, p.height).data;
    let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) n++;
    return { n, of: p.width * p.height };
  }, [a.toString('base64'), b.toString('base64')]);
}
async function threeShadows(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = touch ? 'phone' : 'desk', shots = process.env.SMOKE_SHOTS, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const stats = () => page.evaluate(() => window.hextable.R.stats());
      const set = async (v) => { await page.evaluate((x) => { const e = document.getElementById('set-shadows'); e.value = x; e.dispatchEvent(new Event('change')); }, v); await sleep(500); };
      await run.do('the default is on for a computer and off for a phone; the Settings control, stored, switches it; the address wins', async () => {
        await open(page, `${url}?renderer=three`); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three' && window.hextable.state.entities.fighter, null, 20000);
        await sleep(800);
        let st = await stats();
        if (st.shadows !== !touch || st.shadowMode !== 'auto') throw new Error(`by default: ${JSON.stringify(st)}`);
        await set('on'); st = await stats();
        if (!st.shadows || st.shadowSize !== (touch ? 1024 : 2048)) throw new Error(`On: ${JSON.stringify(st)}`);
        if ((await page.evaluate(() => localStorage.getItem('hextable.shadows'))) !== '"on"') throw new Error('On was not stored');
        await set('off'); st = await stats();
        if (st.shadows || st.shadowSize !== 0) throw new Error(`Off: ${JSON.stringify(st)}`);
        await page.goto(`${url}?renderer=three&shadows=on`); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three' && window.hextable.state.entities.fighter, null, 20000);
        if (!(await stats()).shadows) throw new Error('?shadows=on did not win over the stored Off');
        if (!(await page.evaluate(() => document.getElementById('set-shadows').disabled))) throw new Error('the control is not off while the address sets the shadows');
      });
      for (const grid of ['hex', 'square']) {
        await run.do(`${grid}: shadows on differ from shadows off by a patch of floor, and the sun's pass rests while nothing moves`, async () => {
          if (grid === 'square') { await page.evaluate((m) => window.hextable.act({ type: 'loadMap', map: m }), squareRoom()); await wait(page, () => window.hextable.state.map.grid === 'square'); }
          else { await page.evaluate(() => window.hextable.ED.stock('dungeon')); await wait(page, () => window.hextable.state.map.id === 'dungeon'); }
          await closePanels(page); await sleep(1200);
          await page.evaluate(() => { const h = window.hextable, pc = Object.values(h.state.entities).find((e) => e.kind === 'pc'); h.R.focus(pc.id, true); h.R.rotate(0.3); h.R.zoom(0.7); });
          await sleep(1500);
          const clip = await page.evaluate(() => { const r = document.getElementById('gl').getBoundingClientRect(); return { x: 0, y: 0, width: Math.floor(r.width), height: Math.floor(r.height * 0.55) }; });      // the upper part: the action panel covers the rest on a phone
          await set('on'); await sleep(1800);
          const on = await page.screenshot({ clip }), before = await stats();
          await sleep(1500);
          const after = await stats();
          if (after.shadowPasses !== before.shadowPasses) throw new Error(`the sun's pass was drawn ${after.shadowPasses - before.shadowPasses} more times with nothing moving`);
          if (!(before.shadowPasses >= 1 && before.shadowCalls >= 1)) throw new Error(`no pass was drawn: ${JSON.stringify(before)}`);
          await set('off'); await sleep(1800);
          const off = await page.screenshot({ clip });
          const d = await pixelsApart(page, on, off), frac = d.n / d.of;
          console.log(`       ${grid} ${tag}: ${d.n} of ${d.of} pixels differ (${(frac * 100).toFixed(1)} %); sun's pass ${before.shadowCalls} draw calls, ${before.shadowPasses} passes; frame ms on ${before.frameMs.toFixed(1)}, off ${(await stats()).frameMs.toFixed(1)} (software GL: comparable only)`);
          if (shots) { await writeFile(join(shots, `shadows-${grid}-${tag}-on.png`), on); await writeFile(join(shots, `shadows-${grid}-${tag}-off.png`), off); }
          if (!(frac > 0.002)) throw new Error(`shadows on and off look alike (${d.n} pixels)`);
          if (!(frac < 0.35)) throw new Error(`shadows changed ${(frac * 100).toFixed(0)} % of the screen`);
        });
      }
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=three.
// ---------- the edge of a fight (#305) ----------
// Hexes and squares, a computer and a phone with touch (`three` runs the hexes, `square` the squares; the classic renderer's runs went with it, R14 step 2, #355). Before a fight there is no edge; when it starts the default look dims
// everything outside the arena and draws no glowing edge; a move out of it is refused with the rule in words and the border cells nearest the
// tap flash (in either look); the Settings control (stored per device) brings the glowing edge back; when the fight ends the edge is gone.
// Screenshots go to SMOKE_SHOTS.
export async function arenaEdge(browser, url, label, { grid, ...opts }) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, tag = `${grid}-${touch ? 'phone' : 'desk'}`, shots = process.env.SMOKE_SHOTS, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage(); run.watch(page);
      const R = (fn, arg) => page.evaluate(`((a) => { const R = window.hextable.R.inner ?? window.hextable.R; return (${fn})(R, a); })(${JSON.stringify(arg ?? null)})`);
      const act = async (a) => { await page.evaluate((x) => window.hextable.act(x), a); await sleep(350); await wait(page, () => window.hextable.waiting === 0 && !window.hextable.timeline.busy(), null, 20000); };
      const shot = async (n) => { if (shots) await page.screenshot({ path: join(shots, `arena-edge-${tag}-${n}.png`) }); };
      await run.do('open a solo game and wait for the renderer', async () => {
        await open(page, url, { grid }); await playSolo(page);
        await wait(page, () => window.hextable.R.kind === 'three', null, 30000);
        await act({ type: 'setting', key: 'autoEngage', value: false });
        if (grid === 'square') { await act({ type: 'loadMap', map: squareRoom() }); await wait(page, () => window.hextable.state.map.id === 'square-room'); }
        await sleep(800); await shot('1-before');
        if (await R((r) => r.edge.n) !== 0) throw new Error('an edge is drawn with no fight');
      });
      await run.do('Settings has the control, set to the dimmed look by default', async () => {
        const v = await page.evaluate(() => document.getElementById('set-arena-edge')?.value);
        if (v !== 'dim') throw new Error(`the control reads ${v}`);
      });
      await run.do('a fight starts: no glowing edge in the default look', async () => {
        const S = await page.evaluate(() => window.hextable.state), party = Object.values(S.entities).filter((e) => e.side === 'party');
        let c = party[0].pos;
        if (grid === 'square') {
          let i = 0; for (const p of party) await act({ type: 'place', actor: p.id, to: { q: 5 + i++, r: 7, z: 0 } });
          await act({ type: 'spawn', monster: 'goblin-warrior', at: { q: 10, r: 8 } }); c = { q: 7, r: 7 };
        }
        await act({ type: 'startEncounter', center: { q: c.q, r: c.r }, radius: 3 });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await sleep(2500); await shot('2-fight-dim');
        const n = await R((r) => r.edge.n);
        if (n !== 0) throw new Error(`the default look draws an edge (${n} vertices)`);
      });
      await run.do('a move out of the arena is refused with the rule in words, and the nearest border cells flash', async () => {
        await wait(page, () => { const S = window.hextable.state, id = S.encounter?.order[S.encounter.turn]?.id; return S.entities[id]?.side === 'party'; }, null, 60000);
        await sleep(1200);
        await page.evaluate(() => { const S = window.hextable.state; window.hextable.select(S.encounter.order[S.encounter.turn].id); });      // selecting may move the view: do it before looking
        await sleep(800);
        const findCell = () => page.evaluate(() => {
          const H = window.hextable, S = H.state, ent = S.entities[S.encounter.order[S.encounter.turn].id], lv = S.map.levels[0]; let best = null;
          for (let dq = -9; dq <= 9; dq++) for (let dr = -9; dr <= 9; dr++) {
            const q = ent.pos.q + dq, r = ent.pos.r + dr, k = `${q},${r}`; if (!lv.tiles[k] || S.encounter.arena[k]) continue;
            const p = H.R.screenOf({ q, r, z: ent.pos.z ?? 0 }); if (!p || p.x < 20 || p.y < 170 || p.x > innerWidth - 80 || p.y > innerHeight - 20 || document.elementFromPoint(p.x, p.y)?.id !== 'gl') continue;
            const d = Math.hypot(dq, dr); if (!best || d < best.d) best = { d, p, id: ent.id };
          }
          return best && { x: best.p.x, y: best.p.y };
        });
        // A cell outside the arena must be on screen to be tapped, and on a phone the arena can fill the view: when none shows, the view is widened
        // through the renderer's own zoom (the camera settles) and the cells are looked for again.
        let t = await findCell();
        for (let k = 0; !t && k < 6; k++) { await page.evaluate(() => (window.hextable.R.inner ?? window.hextable.R).zoom(1.3)); await sleep(1200); t = await findCell(); }
        if (!t) throw new Error('no hex outside the arena is on screen to tap');
        await sleep(500); t = (await findCell()) ?? t;                 // the view has stopped: take the cell's place now
        // The flash lasts 1.1 s of the renderer's clock, and a loaded machine can take longer than that to get from the tap to the check below: hold it
        // (as the screenshot below does) from before the tap, so what is checked is that a refused move lit the cells, not that the check was quick.
        await page.evaluate(() => { const R = window.hextable.R.inner ?? window.hextable.R; window.__pin = setInterval(() => { if (R.flashAt !== null) R.flashAt = R.now - 0.12; }, 16); });
        await sleep(300); await tapAt(page, touch, t.x, t.y);
        await wait(page, () => /arena is locked/i.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden, null, 5000);
        const txt = await page.evaluate(() => document.getElementById('toast').textContent);
        if (!/until the fight ends/.test(txt) || !/lit area/.test(txt)) throw new Error(`the toast says: ${txt}`);
        const f = await R((r) => ({ n: r.flash.n, at: r.flashAt }));
        if (!(f.n > 0) || f.at === null) throw new Error(`no flash: ${JSON.stringify(f)}`);
        await sleep(400); await shot('3-refused-flash'); await page.evaluate(() => clearInterval(window.__pin));
        await wait(page, () => (window.hextable.R.inner ?? window.hextable.R).flashAt === null, null, 5000);       // and it goes out by itself
      });
      await run.do('the Settings control, stored, brings the glowing edge back and the other choice takes it away', async () => {
        const set = async (v) => { await page.evaluate((x) => { const e = document.getElementById('set-arena-edge'); e.value = x; e.dispatchEvent(new Event('change')); }, v); await sleep(600); };
        await set('edge'); await wait(page, () => (window.hextable.R.inner ?? window.hextable.R).edge.n > 0, null, 5000); await sleep(1500); await shot('4-fight-edge');
        const stored = await page.evaluate(() => localStorage.getItem('hextable.arenaEdge'));
        if (stored !== '"edge"') throw new Error(`stored: ${stored}`);
        await set('dim'); if (await R((r) => r.edge.n) !== 0) throw new Error('the edge is still drawn after choosing the dimmed look');
      });
      await run.do('the fight ends: the lighting returns and no edge is left', async () => {
        await act({ type: 'endEncounter' }); await wait(page, () => !window.hextable.state.encounter, null, 8000); await sleep(2500); await shot('5-after');
        if (await R((r) => r.edge.n) !== 0) throw new Error('an edge is drawn after the fight');
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await threePass(browser, url, 'three: the vendored library at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeShadows(browser, url, 'three: real shadows at 1280x800', { viewport: { width: 1280, height: 800 } });
  await threeShadows(browser, url, 'three: real shadows at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const D = { viewport: { width: 1280, height: 800 } }, P = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  await arenaEdge(browser, url, 'arena edge: hexes, 1280x800', { ...D, grid: 'hex' });
  await arenaEdge(browser, url, 'arena edge: hexes, 390x844 with touch', { ...P, grid: 'hex' });
}
