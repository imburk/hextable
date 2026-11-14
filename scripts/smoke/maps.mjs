
import { sleep, scenario, wait, state, waitShown, open, playSolo, closePanels, openTab, selectAndMove, calm } from './lib.mjs';

// ---------- stock maps ----------
// The DM starts on a stock map from the editor's Map file tool (two taps: the second confirms), and a
// character walks on it. Then every other stock map is loaded with the same action, as a page error would show.
async function stockMaps(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('open the lobby and play solo', async () => { await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter); });
      await run.do('pick the dungeon under Map file > Stock map and start on it', async () => {
        await closePanels(page);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        await page.click('#dm-edit'); await waitShown(page, '#editor');
        await page.click('#ed-tools [data-tool="file"]');
        await waitShown(page, '#ed-stock');
        await page.selectOption('#ed-stock', 'dungeon');
        await page.click('#ed-stockgo');                       // the first tap only arms it
        if ((await state(page, (S) => S.map.id)) === 'dungeon') throw new Error('one tap changed the map');
        await page.click('#ed-stockgo');
        await wait(page, () => window.hextable.state.map.id === 'dungeon');
        const bad = await state(page, (S) => Object.values(S.entities).filter((e) => e.side !== 'party').length);
        if (bad) throw new Error('creatures from the old map are still there');
        await page.click('#ed-done'); await waitShown(page, '#editor', false);
      });
      await run.do('a character walks on the dungeon', async () => {
        const start = await state(page, (S) => S.entities.fighter.pos);
        await sleep(400);
        const pos = await selectAndMove(page, touch, 'fighter', 'Brenna');
        if (pos.q === start.q && pos.r === start.r) throw new Error('the character is where it was');
      });
      await run.do('every stock map loads and the party stands on it', async () => {
        const ids = await page.evaluate(async () => {
          const { STOCK_MAPS } = await import('./shared/content/maps/index.js'), out = [];
          for (const m of STOCK_MAPS) {
            const r = await window.hextable.act({ type: 'loadMap', map: structuredClone(m.map) });
            const S = window.hextable.state;
            out.push([m.id, S.map.id, Object.values(S.entities).every((e) => S.map.levels.some((l) => l.tiles[`${e.pos.q},${e.pos.r}`]))]);
          }
          return out;
        });
        for (const [want, got, stands] of ids) if (want !== got || !stands) throw new Error(`${want}: got map ${got}, standing ${stands}`);
      });
    } finally { await ctx.close(); }
  });
}


// ---------- the editor on squares (docs/specs/square-grid.md, S10) ----------
// The DM picks the grid for a new map, loads a picture with a drawn 20 by 15 grid of 5 ft squares (made here on a canvas: 100 pixels
// to a square, a 60 pixel margin, a room with a gap for a door), aligns the editor's squares to it by tapping two corners, fills the
// floor, traces the room's walls and the door on square corners, paints, builds stairs on a diagonal, leaves the editor and walks a
// character in by the door. Every edit goes through the engine; the checks read the map back from the game state.
const PX = 100, MARGIN = 60, COLS = 20, ROWS = 15;
const FEET_PER_PX = 5 / PX;
const makePicture = (page) => page.evaluate(([P, M, C, R]) => {
  const cv = document.createElement('canvas'); cv.width = C * P + 2 * M; cv.height = R * P + 2 * M;
  const g = cv.getContext('2d'); g.fillStyle = '#e2d6ba'; g.fillRect(0, 0, cv.width, cv.height);
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`; g.fillRect(rnd() * cv.width, rnd() * cv.height, 4, 4); }
  g.fillStyle = '#78788a';
  for (let i = 0; i <= C; i++) g.fillRect(M + i * P - 1, M, 3, R * P);
  for (let j = 0; j <= R; j++) g.fillRect(M, M + j * P - 1, C * P, 3);
  g.fillStyle = '#1e1e28';
  const wall = (a, b, c, d) => g.fillRect(M + Math.min(a, c) * P - 5, M + Math.min(b, d) * P - 5, Math.abs(c - a) * P + 10, Math.abs(d - b) * P + 10);
  wall(6, 4, 13, 4); wall(13, 4, 13, 10); wall(6, 10, 13, 10); wall(6, 7, 6, 10); wall(6, 4, 6, 6);
  return cv.toDataURL('image/png').split(',')[1];
}, [PX, MARGIN, COLS, ROWS]);

async function squareEditor(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, vw = opts.viewport.width, DIST = touch ? 46 : 38;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const ev = (f, a) => page.evaluate(f, a);
      const tap = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
      const map = () => state(page, (S) => S.map);
      const lvl = async () => (await map()).levels[0];
      const panelTop = () => ev(() => document.querySelector('#editor').getBoundingClientRect().top);
      const screen = (p, z = 0) => ev(([x, y, z0]) => window.hextable.R.screenPoint(x, y, z0), [p[0], p[1], z]);
      // The camera over a point of the map (feet), in the strip above the editor, still.
      const frame = async (fx, fy, dist) => {
        const top = await panelTop();
        await ev(([x, y, d]) => { const R = window.hextable.R; R.cam.x = x * Math.sqrt(3) / 5; R.cam.z = y * Math.sqrt(3) / 5; R.cam.goal = null; R.cam.dist = d; R.cam.yaw = 0; }, [fx, fy, dist]);
        let last = '';
        for (let i = 0; i < 40; i++) {
          const d = await ev(([x0, y0, tx, ty]) => { const R = window.hextable.R, p = R.planePoint(tx, ty, 0); return p && [x0 - p[0], y0 - p[1]]; }, [fx, fy, vw / 2, top / 2]);
          if (d && Math.hypot(...d) > 0.3) await ev(([dx, dy]) => { const R = window.hextable.R; R.cam.x += dx * Math.sqrt(3) / 5; R.cam.z += dy * Math.sqrt(3) / 5; R.cam.goal = null; }, d);
          const now = await ev(([x, y]) => JSON.stringify(window.hextable.R.screenPoint(x, y, 0)), [fx, fy]);
          if (now === last) return;
          last = now; await sleep(150);
        }
      };
      const tapPoint = async (p, dx = 1, dy = -1) => {
        const s = await screen(p), top = await panelTop();
        if (!s || s.y < 4 || s.y > top - 4 || s.x < 4 || s.x > vw - 4) throw new Error(`the point ${p} is not on the map above the editor (${JSON.stringify(s)})`);
        await tap(s.x + dx, s.y + dy); await sleep(300);
      };
      // A tap that must show its effect: a pointer tap now and then does not reach the page, so if `fn` is not true a moment after, tap once more.
      const tapWait = async (p, fn, arg, dx = 1, dy = -1) => {
        await tapPoint(p, dx, dy);
        try { await wait(page, fn, arg, 1500); } catch { await tapPoint(p, dx, dy); await wait(page, fn, arg, 6000); }
      };
      const tool = (t) => page.click(`#ed-tools [data-tool="${t}"]`);
      const twice = async (sel) => { await page.click(sel); await page.click(sel); };
      // Where the picture's grid line `i` (across) or `j` (down) is, in feet, from the picture as the game holds it.
      const lineX = (im, i) => im.origin[0] + (MARGIN + i * PX + 0.5) * (im.feet[0] / (COLS * PX + 2 * MARGIN));
      const lineY = (im, j) => im.origin[1] + (MARGIN + j * PX + 0.5) * (im.feet[1] / (ROWS * PX + 2 * MARGIN));
      const onGrid = (v) => 2.5 + 5 * Math.round((v - 2.5) / 5);
      let aligned = null;        // the picture, once aligned
      const corner = (i, j) => [onGrid(lineX(aligned, i)), onGrid(lineY(aligned, j))];
      const middle = (i, j) => { const c = corner(i, j); return [c[0] + 2.5, c[1] + 2.5]; };          // the middle of the square south-east of corner (i, j)
      const cellAt = (i, j) => { const m = middle(i, j); return { q: Math.round(m[0] / 5), r: Math.round(m[1] / 5) }; };

      await run.do('open the lobby, play solo and open the editor', async () => {
        await open(page, url); await playSolo(page); await wait(page, () => window.hextable.state.entities.fighter);
        await closePanels(page);
        await openTab(page, 'dm'); await waitShown(page, '#dm');
        await page.click('#dm-edit'); await waitShown(page, '#editor');
        await tool('file'); await waitShown(page, '#ed-new-square');
      });
      await run.do('a new map asks for its grid: hexes make a hex map, squares a square map and the editor says so', async () => {
        if (!(await ev(() => document.querySelector('#ed-new-square').compareDocumentPosition(document.querySelector('#ed-new-hex')) & Node.DOCUMENT_POSITION_FOLLOWING))) throw new Error('squares are not listed first');
        await page.click('#ed-new-hex');
        if ((await state(page, (S) => S.map.id)) === 'new-map') throw new Error('one tap made a new map');
        await page.click('#ed-new-hex');
        await wait(page, () => window.hextable.state.map.id === 'new-map' && window.hextable.state.map.grid === 'hex');
        if ((await ev(() => document.querySelector('#ed-grid').textContent)) !== 'Grid: hexes') throw new Error('the editor does not say hexes');
        if ((await ev(() => document.querySelector('#ed-brush [data-b="1"]').textContent)) !== '7 hexes') throw new Error('the hex brush changed');
        await twice('#ed-new-square');
        await wait(page, () => window.hextable.state.map.grid === 'square');
        const m = await map(), n = Object.keys(m.levels[0].tiles).length;
        if (m.format !== 2 || m.cellFeet !== 5 || n !== 49) throw new Error(`the new square map is format ${m.format}, ${m.cellFeet} ft, ${n} tiles`);
        if ((await ev(() => document.querySelector('#ed-grid').textContent)) !== 'Grid: squares') throw new Error('the editor does not say squares');
        if (!/squares/.test(await ev(() => document.querySelector('#ed-gridnote').textContent))) throw new Error('the Map file tool does not name the grid');
        if (await ev(() => [...document.querySelectorAll('#ed-opts button')].some((b) => b.id === 'ed-grid-change'))) throw new Error('there is a way to change the grid');
      });
      await run.do('load the test picture as the level background', async () => {
        await tool('level');
        await page.setInputFiles('#ed-bgfile', { name: 'squares.png', mimeType: 'image/png', buffer: Buffer.from(await makePicture(page), 'base64') });
        await wait(page, () => !!window.hextable.state.map.levels[0].image, null, 15000);
        await wait(page, () => window.hextable.R.hasPicture(window.hextable.state.map.levels[0].id), null, 15000);
        await waitShown(page, '#ed-align');
        if (await ev(() => !document.querySelector('#ed-bgscale').hidden)) throw new Error('Set scale is offered on squares');
      });
      await run.do('Align to grid: two corners tapped a little off, and the picture lines lie on the square edges within a pixel', async () => {
        const im0 = await lvl().then((l) => l.image), k = im0.feet[0] / (COLS * PX + 2 * MARGIN);
        const at = (i, j) => [im0.origin[0] + (MARGIN + i * PX + 0.5) * k, im0.origin[1] + (MARGIN + j * PX + 0.5) * k];
        const [across, down] = touch ? [3, 2] : [6, 4], c1 = at(2, 2), c2 = at(2 + across, 2 + down);       // a phone shows less of the map: a shorter run of squares keeps both corners clear of its buttons
        await page.click('#ed-align');
        await frame((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, DIST);
        await tapPoint(c1, 2, -1); await tapPoint(c2, -2, 1);
        await waitShown(page, '#ed-alignask');
        await page.fill('#ed-acols', String(across)); await page.fill('#ed-arows', String(down));
        await page.click('#ed-alignok');
        await wait(page, (w) => Math.abs(window.hextable.state.map.levels[0].image.feet[0] - w) < 0.01, (COLS * PX + 2 * MARGIN) * FEET_PER_PX, 20000);
        aligned = (await lvl()).image;
        const wantH = (ROWS * PX + 2 * MARGIN) * FEET_PER_PX;
        if (Math.abs(aligned.feet[1] - wantH) > 0.01) throw new Error(`the picture is ${aligned.feet} ft; wanted ${(COLS * PX + 2 * MARGIN) * FEET_PER_PX} by ${wantH}`);
        // On screen, at the camera's default distance: the picture's first and last lines against the square corners they should lie on.
        await frame(...corner(COLS / 2, ROWS / 2), 18);
        let worst = 0;
        for (const [i, j] of [[0, 0], [COLS, 0], [0, ROWS], [COLS, ROWS], [10, 7]]) {
          const a = await screen([lineX(aligned, i), lineY(aligned, j)]), b = await screen(corner(i, j));
          if (a && b) worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
        }
        if (worst > 1) throw new Error(`a picture line is ${worst.toFixed(2)} screen pixels off a square edge`);
        const feetOff = Math.max(...[0, COLS].map((i) => Math.abs(lineX(aligned, i) - onGrid(lineX(aligned, i)))), ...[0, ROWS].map((j) => Math.abs(lineY(aligned, j) - onGrid(lineY(aligned, j)))));
        if (feetOff > 0.02) throw new Error(`a picture line is ${feetOff} ft off the grid`);
      });
      await run.do('Fill floor lays a tile on every square of the picture and none on its margin', async () => {
        await tool('trace'); await waitShown(page, '#ed-fill');
        await page.click('#ed-fill');
        await wait(page, ([c, r]) => Object.keys(window.hextable.state.map.levels[0].tiles).length >= c * r, [COLS, ROWS]);
        const tiles = (await lvl()).tiles;
        for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) { const c = cellAt(i, j); if (!tiles[`${c.q},${c.r}`]) throw new Error(`no floor at ${c.q},${c.r}`); }
        const first = cellAt(0, 0), last = cellAt(COLS - 1, ROWS - 1);
        const stray = Object.keys(tiles).filter((k) => { const [q, r] = k.split(',').map(Number); return q < first.q - 1 || q > last.q + 1 || r < first.r - 1 || r > last.r + 1; });
        if (stray.length) throw new Error(`floor outside the picture's grid: ${stray}`);
        if (!(await ev(() => /squares/.test(document.getElementById('toast').textContent)))) throw new Error('the toast does not speak of squares');
      });
      await run.do('trace the room with the Wall tool: points snap to the square corners', async () => {
        await frame(...middle(7, 6), DIST);
        const room = [[6, 7], [6, 9], [10, 9], [10, 4], [6, 4], [6, 6]];         // a room of 4 by 5 squares, with the gap for the door on its west side (a phone shows no more)
        for (const [n, [i, j]] of room.entries()) await tapWait(corner(i, j), (len) => window.hextable.ED.traceLine.length === len, n + 1);
        await tapPoint(corner(6, 6), 0, 0);           // the last point again ends the line
        await wait(page, () => window.hextable.state.map.walls.length === 5);
        const want = room.map(([i, j]) => corner(i, j)), walls = (await map()).walls;
        walls.forEach((w, n) => {
          for (const [got, exp] of [[w.a, want[n]], [w.b, want[n + 1]]]) if (Math.hypot(got[0] - exp[0], got[1] - exp[1]) > 0.005) throw new Error(`wall ${n} ends at ${got}, not the corner ${exp}`);
        });
        for (const w of walls) for (const v of [...w.a, ...w.b]) if (Math.abs(((v - 2.5) / 5) - Math.round((v - 2.5) / 5)) > 1e-6) throw new Error(`wall point ${v} is not on a square corner`);
      });
      await run.do('trace the door across the gap: it stands on a square side (edge), not on a free line', async () => {
        await page.click('#ed-tmodes [data-tmode="door"]');
        await tapWait(corner(6, 6), () => window.hextable.ED.traceLine.length === 1);
        await tapPoint(corner(6, 7));
        await wait(page, () => window.hextable.state.map.objects.length === 1);
        const d = (await map()).objects[0], c = cellAt(5, 6);
        if (d.seg || d.edge !== 0 || d.at.q !== c.q || d.at.r !== c.r) throw new Error(`the door is ${JSON.stringify(d)}; wanted edge 0 of ${c.q},${c.r}`);
      });
      await run.do('paint with the 3 by 3 brush and a stroke, then build stairs on a diagonal', async () => {
        await tool('paint'); await page.click('#ed-terrain [data-t="forest"]');
        if ((await ev(() => document.querySelector('#ed-brush [data-b="1"]').textContent)) !== '3 by 3') throw new Error('the brush is not labelled in squares');
        await page.click('#ed-brush [data-b="1"]');
        await frame(...middle(16, 8), DIST);
        await tapWait(middle(16, 8), () => Object.values(window.hextable.state.map.levels[0].tiles).filter((t) => t.t === 'forest').length === 9, null, 0, 0);
        await page.click('#ed-brush [data-b="0"]');
        await tool('height'); await page.click('#ed-hmode [data-hm="up"]');
        await frame(...middle(7, 6), DIST);
        const top = cellAt(9, 7), foot = cellAt(6, 4);
        for (let k = 1; k <= 3; k++) await tapWait(middle(9, 7), ([c, h]) => window.hextable.state.map.levels[0].tiles[`${c.q},${c.r}`]?.h === h, [top, 2.5 * k], 0, 0);
        await page.click('#ed-hmode [data-hm="stairs"]');
        await tapWait(middle(6, 4), () => !!window.hextable.ED.pending, null, 0, 0);
        await tapPoint(middle(9, 7), 0, 0);
        await wait(page, (c) => window.hextable.state.map.levels[0].tiles[`${c.q + 1},${c.r + 1}`]?.h === 2.5, foot, 8000);
        const t = (await lvl()).tiles, steps = [1, 2].map((n) => t[`${foot.q + n},${foot.r + n}`]?.h);
        if (steps.join() !== '2.5,5') throw new Error(`the diagonal steps are ${steps}`);
      });
      await run.do('leave the editor: the shut door stops a character, and once it is open she walks in', async () => {
        await page.click('#ed-done'); await waitShown(page, '#editor', false);
        const out = cellAt(5, 6), inside = cellAt(7, 6), door = (await map()).objects[0].id;
        await ev((c) => window.hextable.act({ type: 'move', actor: 'fighter', to: c }), out);
        await wait(page, (c) => { const p = window.hextable.state.entities.fighter.pos; return p.q === c.q && p.r === c.r; }, out, 15000); await calm(page);
        await ev((c) => window.hextable.act({ type: 'move', actor: 'fighter', to: c }), inside); await calm(page); await sleep(300);
        const p = await state(page, (S) => S.entities.fighter.pos);
        if (p.q !== out.q || p.r !== out.r) throw new Error('the character got through a shut door');
        await ev((id) => window.hextable.act({ type: 'setObject', object: id, state: 'open' }), door);
        await wait(page, () => window.hextable.state.map.objects[0].state === 'open');
        await page.click('#party button:has-text("Brenna")');
        await frame(...middle(6, 6), 22);
        const s = await ev((c) => window.hextable.R.screenOf({ q: c.q, r: c.r, z: 0 }), inside);
        await tap(s.x, s.y);
        await wait(page, (c) => { const q = window.hextable.state.entities.fighter.pos; return q.q === c.q && q.r === c.r; }, inside, 15000);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=maps.
export default async function (browser, url) {
  await stockMaps(browser, url, 'stock maps at 1280x800', { viewport: { width: 1280, height: 800 } });
  await stockMaps(browser, url, 'stock maps at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await squareEditor(browser, url, 'the editor on squares at 1280x800', { viewport: { width: 1280, height: 800 } });
  await squareEditor(browser, url, 'the editor on squares at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
