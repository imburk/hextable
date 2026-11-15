import { sleep, scenario, wait, state, open, playSolo, calm, closePanels, waitShown, onCanvas, openTab } from './lib.mjs';
import { squareRoom } from '../../packages/rules/test/fixtures/square-room.js';

// ---------- keyboard movement, the follow camera and key maps (docs/specs/keyboard.md, #357) ----------
// Desktop (1280x800): typing "wasd" in the lobby's name field moves nothing; on the hex valley W walks four single steps, each the
// neighbour keys.js chooses for the view, and the view turns to face the way walked; a held key walks at a steady pace and stops at
// once on release; Shift held turns the view and sends nothing; Space centres on the walker and faces its way again; a textarea takes
// "wasd" as text; in a fight a key's step spends movement as a click on the same hex does (the click is made after an undo). On
// square-room: W D S A walk round a square, W and D together step on the diagonal, and W into the north wall is refused, shown, and
// ends the walk. Settings lists the keys. A phone (390x844, touch) plays as before and Settings still lays out.

const MAP = squareRoom();
const yawNow = (page) => page.evaluate(() => window.hextable.R.cameraAngles().yaw);
const posOf = (page, id) => state(page, (S, i) => S.entities[i].pos, id);
const same = (a, b) => a.q === b.q && a.r === b.r;
const keysMod = (page) => page.evaluate(() => import('./keys.js').then((m) => Object.keys(m).length));
// The neighbour keys.js chooses for these keys at the camera's yaw now (the page's own module, as the app uses it).
const expected = (page, id, f, r) => page.evaluate(async ([i, f0, r0]) => {
  const K = await import('./keys.js'), R = window.hextable.R, e = window.hextable.state.entities[i], d = K.stepFor(R.G, R.cameraAngles().yaw, f0, r0);
  return { q: e.pos.q + d.dq, r: e.pos.r + d.dr };
}, [id, f, r]);
async function press(page, key, id) {
  const from = await posOf(page, id);
  await page.keyboard.press(key);
  await wait(page, ([i, f]) => { const p = window.hextable.state.entities[i].pos; return p.q !== f.q || p.r !== f.r; }, [id, from], 4000)
    .catch(() => { throw new Error(`${key} did not move ${id} from ${JSON.stringify(from)}`); });
  await calm(page);
  return posOf(page, id);
}
const blur = (page) => page.evaluate(() => document.activeElement?.blur?.());
const faceAlong = (page, d) => page.evaluate(async (d0) => { const K = await import('./keys.js'), R = window.hextable.R; R.face(K.yawFacing(R.G, d0[0], d0[1]), true); }, d);

async function desktop(browser, url) {
  await scenario('keyboard movement (desktop 1280x800)', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = (n) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/keys-${n}.png` }).catch(() => {}) : null);
      const act = async (a) => { await page.evaluate((x) => window.hextable.act(x), a); await calm(page); };
      let id = 'fighter';

      await run.do('typing "wasd" into the lobby name field types it and nothing else happens', async () => {
        await open(page, url);
        await page.click('#lobby-name'); await page.keyboard.type('wasd');
        if ((await page.inputValue('#lobby-name')) !== 'wasd') throw new Error(`the name field holds "${await page.inputValue('#lobby-name')}"`);
        await page.fill('#lobby-name', '');
        await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        if (await keysMod(page) < 5) throw new Error('keys.js did not load');
        await act({ type: 'setting', key: 'autoEngage', value: false });
        await closePanels(page);
        await page.evaluate((i) => window.hextable.select(i), id);
        await calm(page); await blur(page);
      });

      // A direction on the valley with 12 open hexes in a line from the fighter, so the walks below meet nothing.
      const dir = await page.evaluate(async (i) => {
        const S = window.hextable.state, e = S.entities[i], { moveOptions } = await import('./shared/engine.js'), opts = [...moveOptions(S, e).values()];
        const open1 = (q, r) => opts.some((o) => o.canStop && o.h.q === q && o.h.r === r) && !Object.values(S.entities).some((x) => x.id !== i && x.pos.q === q && x.pos.r === r);
        return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].find(([dq, dr]) => [1, 2, 3, 4, 5, 6, 7, 8].every((k) => open1(e.pos.q + dq * k, e.pos.r + dr * k))) ?? null;
      }, id);
      if (!dir) throw new Error('no open line on the valley for the fighter');

      await run.do('hexes: four presses of W walk four steps, each the neighbour keys.js names for the view, and the view turns to face them', async () => {
        await page.evaluate(() => { window.hextable.R.face(0.4, true); });         // a view not on a grid direction: the first W must pick by the rule
        for (let n = 0; n < 4; n++) {
          if (n === 1) await faceAlong(page, dir);
          const want = await expected(page, id, 1, 0), got = await press(page, 'w', id);
          if (!same(got, want)) throw new Error(`step ${n + 1}: walked to ${JSON.stringify(got)}, keys.js says ${JSON.stringify(want)}`);
        }
        const r = await page.evaluate(async (d0) => { const K = await import('./keys.js'), R = window.hextable.R; return { yaw: R.cameraAngles().yaw, want: K.yawFacing(R.G, d0[0], d0[1]) }; }, dir);
        if (Math.abs(Math.atan2(Math.sin(r.yaw - r.want), Math.cos(r.yaw - r.want))) > 0.05) throw new Error(`the view faces ${r.yaw.toFixed(2)}, the way walked is ${r.want.toFixed(2)}`);
        await shot('1-walked');
      });

      await run.do('S walks back the way it came: four steps back to the start of the line', async () => {
        for (let n = 0; n < 4; n++) await press(page, 's', id);
      });

      await run.do('a held key walks at a steady pace and stops at once on release', async () => {
        await faceAlong(page, dir);
        const from = await posOf(page, id);
        await page.keyboard.down('w'); await sleep(1100); await page.keyboard.up('w');
        const at = await posOf(page, id);
        await sleep(400); await calm(page);
        const end = await posOf(page, id); await sleep(800);
        const later = await posOf(page, id);
        const steps = Math.abs(end.q - from.q) + Math.abs(end.r - from.r) - (Math.abs(dir[0] + dir[1]) === 0 ? Math.abs(end.q - from.q) : 0);
        const n = Math.max(Math.abs(end.q - from.q), Math.abs(end.r - from.r));
        if (n < 2 || n > 7) throw new Error(`held 1.1 s: ${n} steps (${steps})`);
        const after = Math.max(Math.abs(end.q - at.q), Math.abs(end.r - at.r));
        if (after > 1) throw new Error(`${after} steps after the release`);
        if (!same(end, later)) throw new Error('it kept walking');
        for (let k = 0; k < n; k++) await press(page, 's', id);       // back to the start
      });

      await run.do('Shift held: A and W turn and tilt the view and nothing is sent', async () => {
        const before = await page.evaluate(() => { window.__S = window.hextable.state; return window.hextable.R.cameraAngles(); });
        await page.keyboard.down('Shift'); await page.keyboard.down('a'); await sleep(450); await page.keyboard.up('a');
        await page.keyboard.down('w'); await sleep(500); await page.keyboard.up('w'); await page.keyboard.up('Shift');
        await sleep(300);
        const r = await page.evaluate(() => ({ cam: window.hextable.R.cameraAngles(), same: window.__S === window.hextable.state }));
        if (!r.same) throw new Error('the state changed: something was sent');
        if (!(r.cam.yaw > before.yaw + 0.15)) throw new Error(`Shift+A turned the view from ${before.yaw.toFixed(2)} to ${r.cam.yaw.toFixed(2)}`);
        if (!(r.cam.pitch < before.pitch - 0.04) && before.pitch > 0.5) throw new Error(`Shift+W tilted from ${before.pitch.toFixed(2)} to ${r.cam.pitch.toFixed(2)}`);
        if (!(r.cam.turns > before.turns)) throw new Error('the look was not counted as a manual turn');
      });

      await run.do('Space centres on the walker and faces its last way again, and does not scroll the page', async () => {
        await page.evaluate(() => { const R = window.hextable.R; R.cam.x += 12; R.cam.goal = null; });
        await page.keyboard.press('Space');
        await wait(page, () => window.hextable.R.cam.goal === null && window.hextable.R.cam.yawGoal == null, null, 6000).catch(() => {});
        const r = await page.evaluate(async ([i, d0]) => {
          const K = await import('./keys.js'), R = window.hextable.R, a = R.actors.get(i);
          return { dx: Math.hypot(R.cam.x - a.x, R.cam.z - a.z), yaw: R.cameraAngles().yaw, want: K.yawFacing(R.G, d0[0], d0[1]), scroll: window.scrollY + document.scrollingElement.scrollTop };
        }, [id, dir]);
        if (r.dx > 0.3) throw new Error(`the view is ${r.dx.toFixed(2)} units from the walker`);
        if (Math.abs(Math.atan2(Math.sin(r.yaw - r.want), Math.cos(r.yaw - r.want))) > 0.05) throw new Error('the view does not face the way last walked');
        if (r.scroll) throw new Error('the page scrolled');
      });

      await run.do('a textarea (a stand-in for the feedback panel) takes "wasd" as text and nothing moves; Ctrl+W-like chords are the browser\'s', async () => {
        const from = await posOf(page, id);
        await page.evaluate(() => { const t = document.createElement('textarea'); t.id = 'kb-probe'; t.style.cssText = 'position:fixed;left:10px;top:120px;z-index:99'; document.body.append(t); t.focus(); });
        await page.keyboard.type('wasd '); await sleep(500);
        const v = await page.inputValue('#kb-probe');
        await page.evaluate(() => document.getElementById('kb-probe').remove());
        if (v !== 'wasd ') throw new Error(`the textarea holds "${v}"`);
        await page.keyboard.down('Alt'); await page.keyboard.press('w'); await page.keyboard.up('Alt'); await sleep(400);
        if (!same(await posOf(page, id), from)) throw new Error('the fighter moved');
      });

      await run.do('Settings lists the keys of the preset, and the preset is kept on this device', async () => {
        await openTab(page, 'settings');
        await page.click('#set-keys-show');
        await waitShown(page, '#set-keys-list');
        const t = await page.textContent('#set-keys-list');
        if (!/Walk forward/.test(t) || !/Escape/.test(t)) throw new Error(`the list reads ${t.slice(0, 120)}`);
        await page.selectOption('#set-keys', 'arrows');
        if (!/Up/.test(await page.textContent('#set-keys-list'))) throw new Error('the list did not change with the preset');
        await shot('2-settings');
        await page.selectOption('#set-keys', 'default');
        await closePanels(page); await blur(page);
      });

      await run.do('in a fight a key\'s step spends movement exactly as a click on the same hex does', async () => {
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        const here = await posOf(page, id);
        await act({ type: 'spawn', monster: 'goblin-minion', at: { q: here.q - dir[0] * 5, r: here.r - dir[1] * 5 } });      // behind, out of the way: a fight needs a foe
        await act({ type: 'startEncounter', center: here, radius: 8 });
        if (!(await state(page, (S) => !!S.encounter))) throw new Error('no fight started');
        for (let i = 0; i < 20; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === id) break;
          await act({ type: 'endTurn', actor: cur });
        }
        if ((await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id)) !== id) throw new Error('never the fighter\'s turn');
        await page.evaluate((i) => window.hextable.select(i), id); await calm(page); await blur(page);
        await faceAlong(page, dir);
        const before = await state(page, (S) => S.encounter.budget.move);
        const want = await expected(page, id, 1, 0);
        const byKey = await press(page, 'w', id);
        const keyMove = await state(page, (S) => S.encounter.budget.move);
        const toast = await page.textContent('#toast');
        if (!same(byKey, want)) throw new Error(`the key walked to ${JSON.stringify(byKey)}`);
        if (!(keyMove < before)) throw new Error(`movement ${before} -> ${keyMove}`);
        if (!/Move \d+ ft left/.test(toast)) throw new Error(`the toast reads "${toast}"`);
        await page.keyboard.press('Control+z');
        await wait(page, ([i, w]) => { const p = window.hextable.state.entities[i].pos; return p.q !== w.q || p.r !== w.r; }, [id, byKey], 4000).catch(async () => { throw new Error(`Ctrl+Z did not take the step back: ${await page.textContent('#toast')}`); });
        await calm(page);
        await page.evaluate((i) => { const R = window.hextable.R; window.hextable.select(i); R.focus(i, true); R.face(R.cameraAngles().yaw + Math.PI / 2, true); }, id);      // side on, so the pawn does not stand in front of the hex
        await sleep(400);
        const pt = await page.evaluate((h) => window.hextable.R.screenOf({ ...h, z: 0 }), want);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error('the hex is not on the map to click');
        await page.evaluate(() => { const R = window.hextable.R; window.__tap = R.onTap; window.__hits = []; R.onTap = (h) => { window.__hits.push(h); window.__tap(h); }; });
        await page.mouse.click(pt.x, pt.y);
        await sleep(300);
        const hits = await page.evaluate(() => { window.hextable.R.onTap = window.__tap; return window.__hits; });
        if (!hits.length || !same(hits[0].hex, want)) throw new Error(`the click at ${Math.round(pt.x)},${Math.round(pt.y)} reported ${JSON.stringify(hits)}, not ${JSON.stringify(want)}`);
        await wait(page, ([i, w]) => { const p = window.hextable.state.entities[i].pos; return p.q === w.q && p.r === w.r; }, [id, want], 4000).catch(async () => { throw new Error(`the click did not move there: ${await page.textContent('#toast')} ${JSON.stringify(await posOf(page, id))} want ${JSON.stringify(want)}`); });
        await calm(page);
        const clickMove = await state(page, (S) => S.encounter.budget.move);
        if (clickMove !== keyMove) throw new Error(`a click left ${clickMove} ft, the key ${keyMove} ft`);
        await act({ type: 'endEncounter' }).catch(() => {});
      });

      await run.do('squares: on square-room W D S A walk round a square, W and D together step on the diagonal', async () => {
        await page.evaluate((map) => window.hextable.act({ type: 'loadMap', map }), MAP);
        await wait(page, () => window.hextable.state.map.id === 'square-room' && window.hextable.R.G.kind === 'square');
        await calm(page);
        id = await state(page, (S) => Object.values(S.entities).find((e) => e.kind === 'pc').id);
        await act({ type: 'place', actor: id, to: { q: 7, r: 7 } });
        await page.evaluate((i) => window.hextable.select(i), id); await calm(page); await blur(page);
        await page.evaluate(() => window.hextable.R.face(0, true));
        const path = [];
        for (const k of ['w', 'd', 's', 'a']) { await faceAlong(page, [0, -1]); path.push(await press(page, k, id)); }
        const want = [[7, 6], [8, 6], [8, 7], [7, 7]];
        if (path.some((p, i) => p.q !== want[i][0] || p.r !== want[i][1])) throw new Error(`walked ${JSON.stringify(path.map((p) => [p.q, p.r]))}`);
        await faceAlong(page, [0, -1]);
        await page.evaluate(() => new Promise((done) => {          // both keys down, then up 120 ms later by the page's own clock (a busy machine must not stretch the hold)
          const k = (type, code, key) => dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
          k('keydown', 'KeyW', 'w'); k('keydown', 'KeyD', 'd');
          setTimeout(() => { k('keyup', 'KeyD', 'd'); k('keyup', 'KeyW', 'w'); done(); }, 120);
        }));
        await calm(page); await sleep(300);
        const p = await posOf(page, id);
        if (p.q !== 8 || p.r !== 6) throw new Error(`W and D went to ${p.q},${p.r}, not the diagonal 8,6`);
        await shot('3-squares');
      });

      await run.do('squares: W into the north wall is refused, shown as today, and the held key sends nothing more', async () => {
        await act({ type: 'place', actor: id, to: { q: 4, r: 0 } });
        await page.evaluate((i) => window.hextable.select(i), id); await calm(page); await blur(page);
        await faceAlong(page, [0, -1]);
        await page.evaluate(() => { window.__S = window.hextable.state; });
        await page.keyboard.down('w');
        await waitShown(page, '#toast', true, 3000).catch(() => { throw new Error('no refusal was shown'); });
        await sleep(1200);
        await page.keyboard.up('w');
        const r = await page.evaluate(() => ({ same: window.__S === window.hextable.state, toast: document.getElementById('toast').textContent }));
        if (!r.same) throw new Error('the state changed');
        if (!/can't|nothing|wall/i.test(r.toast)) throw new Error(`the toast reads "${r.toast}"`);
      });
    } finally { await ctx.close(); }
  });
}

async function classic(browser, url) {
  await scenario('keyboard movement on the classic renderer (?renderer=gl)', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('W walks one step to the neighbour keys.js names, and Space runs without an error', async () => {
        await open(page, `${url}?renderer=gl`); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter && window.hextable.R.constructor.name === 'Renderer');
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));
        await closePanels(page); await page.evaluate(() => window.hextable.select('fighter')); await calm(page); await blur(page);
        const want = await expected(page, 'fighter', 1, 0);
        const free = await state(page, (S, w) => !Object.values(S.entities).some((e) => e.pos.q === w.q && e.pos.r === w.r), want);
        const got = free ? await press(page, 'w', 'fighter') : null;
        if (free && !same(got, want)) throw new Error(`walked to ${JSON.stringify(got)}, keys.js says ${JSON.stringify(want)}`);
        await page.evaluate(() => { window.hextable.R.rotate(1); });
        await page.keyboard.press('Space'); await sleep(1500);
        const r = await page.evaluate(async (w) => { const K = await import('./keys.js'), R = window.hextable.R, S = window.hextable.state, e = S.entities.fighter;
          return { yaw: R.cameraAngles().yaw, moved: e.pos.q === w.q && e.pos.r === w.r }; }, want);
        if (free && !r.moved) throw new Error('not where it walked');
      });
    } finally { await ctx.close(); }
  });
}

async function phone(browser, url) {
  await scenario('keyboard movement leaves the phone as it was (390x844, touch)', async (run) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('play solo; Settings shows the keys control inside the drawer\'s width', async () => {
        await open(page, url); await playSolo(page);
        await wait(page, () => window.hextable.state.entities.fighter);
        await openTab(page, 'settings');
        const r = await page.evaluate(() => { const s = document.getElementById('set-keys').getBoundingClientRect(), d = document.getElementById('drawer').getBoundingClientRect(); return { s: s.right, d: d.right, w: document.documentElement.scrollWidth }; });
        if (r.s > r.d + 1 || r.w > 391) throw new Error(`the control reaches ${r.s} in a drawer to ${r.d}; the page is ${r.w} wide`);
        if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/keys-4-phone.png` }).catch(() => {});
        await closePanels(page);
      });
    } finally { await ctx.close(); }
  });
}

export default async function (browser, url) {
  await desktop(browser, url);
  await classic(browser, url);
  await phone(browser, url);
}
