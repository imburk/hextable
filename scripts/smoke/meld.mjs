import { sleep, scenario, wait, state, open, playSolo, calm, closePanels, panelTab, tapAt, onCanvas, settle, viewStill } from './lib.mjs';

// ---------- a creature merged with stone, drawn as such (issue #827, for Meld into Stone, #826) ----------
// A level 5 cleric with Meld into Stone beside a long wall. After the cast (sent straight to the engine) the token is no longer at the cleric's space: it is a faint marker
// sunk at the wall point, labelled "(in the stone)"; a tap on it selects it. Its page is one row, Step out (and its spells on itself), and the status block says "Melded into stone".
// Step out brings it back to its space, and in a fight the row is greyed, with the engine's reason, out of its turn. 1280x800 and 390x844 with touch.
const act = async (page, a) => { const r = await page.evaluate((x) => window.hextable.act(x), a); await calm(page); return r; };
const rowsOf = (page) => page.$$eval('#ap-body [data-row]', (b) => b.map((x) => x.dataset.row));

async function run(browser, url, label, opts) {
  await scenario(label, async (r) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      r.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-meld-${n}.png` }); };
      let id, pos, wall;

      await r.do('a level 5 cleric with Meld into Stone beside a wall', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
        await act(page, { type: 'setting', key: 'autoEngage', value: false });
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Tor', class: 'cleric', level: 5, abilities: { str: 12, dex: 10, con: 14, int: 10, wis: 17, cha: 12 }, skills: ['medicine', 'religion'], spells: ['meld-into-stone'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Tor'));
        id = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Tor').id);
        pos = await state(page, (S, i) => S.entities[i].pos, id);
        wall = await page.evaluate(async (p) => {
          const h = window.hextable, level = h.state.map.levels[0].id, G = (await import('./shared/grid.js')).gridOf(h.state.map), c = G.center(p);
          h.act({ type: 'mapEdit', ops: [{ op: 'wall', wall: { id: 'meld-wall', kind: 'wall', level, a: [c[0] + 5, c[1] - 30], b: [c[0] + 5, c[1] + 30] } }] });
          return { level, x: c[0] + 5, y: c[1] };
        }, pos);
        await wait(page, () => window.hextable.state.map.walls.some((w) => w.id === 'meld-wall'));
        await page.evaluate((i) => window.hextable.select(i), id);
        await settle(page, id);
      });

      await r.do('before the cast the token stands at its space', async () => {
        const v = await page.evaluate(async ([i]) => { const h = window.hextable, a = (h.R.inner ?? h.R).actors.get(i), G = (await import('./shared/grid.js')).gridOf(h.state.map), w = G.toWorld(h.state.entities[i].pos); return { melded: !!a.melded, dx: Math.hypot(a.x - w.x, a.z - w.z) }; }, [id]);
        if (v.melded || v.dx > 0.05) throw new Error(`before: ${JSON.stringify(v)}`);
      });

      let before;
      await r.do('cast Meld into Stone at the wall: the cleric is melded and the token sinks to a faint marker at the wall point, off its space', async () => {
        before = await page.evaluate((i) => { const R = window.hextable.R.inner ?? window.hextable.R, a = R.actors.get(i); return a.y; }, id);
        await act(page, { type: 'cast', actor: id, spell: 'meld-into-stone', slot: 3, wall: { level: wall.level, x: wall.x, y: wall.y } });
        await wait(page, (i) => !!window.hextable.state.entities[i].melded, id).catch(async () => { throw new Error(`no meld; toast: ${await page.evaluate(() => document.getElementById('toast')?.textContent)}`); });
        await sleep(700);
        const v = await page.evaluate(async ([i]) => {
          const h = window.hextable, R = h.R.inner ?? h.R, a = R.actors.get(i), G = (await import('./shared/grid.js')).gridOf(h.state.map), w = G.toWorld(h.state.entities[i].pos);
          return { melded: !!a.melded, dx: Math.hypot(a.x - w.x, a.z - w.z), y: a.y, label: a.el.textContent, op: a.el.style.opacity, cls: a.el.classList.contains('melded') };
        }, [id]);
        if (!v.melded || !v.cls) throw new Error(`not drawn as melded: ${JSON.stringify(v)}`);
        if (!(v.y < before - 0.3)) throw new Error(`the token did not sink: ${before} -> ${v.y}`);
        if (!(v.dx > 0.3)) throw new Error(`the marker is still at the old space (${v.dx})`);
        if (!/in the stone/.test(v.label) || Number(v.op) >= 1) throw new Error(`label ${JSON.stringify(v)}`);
        await shot('melded');
      });

      await r.do('a tap on the marker selects the cleric (another creature was selected)', async () => {
        const other = await state(page, (S, i) => Object.values(S.entities).find((e) => e.side === 'party' && e.id !== i).id, id);
        await page.evaluate((o) => window.hextable.select(o), other);
        await closePanels(page);
        await viewStill(page);
        const pt = await page.evaluate((i) => { const R = window.hextable.R.inner ?? window.hextable.R; return R.screenOfPawn(i, 0.4); }, id);
        if (!pt || !(await onCanvas(page, pt.x, pt.y))) throw new Error(`the marker is not on the canvas: ${JSON.stringify(pt)}`);
        await tapAt(page, touch, pt.x, pt.y);
        await wait(page, () => /Tor/.test(document.getElementById('c-name')?.textContent ?? '') || true);
        const name = await page.evaluate(() => document.getElementById('c-name')?.textContent ?? '');
        if (!/Tor/.test(name)) { await sleep(400); const n2 = await page.evaluate(() => document.getElementById('c-name')?.textContent ?? ''); if (!/Tor/.test(n2)) throw new Error(`the selected creature is "${n2}"`); }
        if (!(await state(page, (S, i) => !!S.entities[i].melded, id))) throw new Error('the tap changed it');
      });

      await r.do('the page is one row, Step out, with no other action; the status says Melded into stone', async () => {
        await panelTab(page, 'stone');
        const rows = await rowsOf(page);
        if (rows[0] !== 'unmeld' || rows.some((x) => /^(attack|dodge|dash|disengage|hide|search|spell:meld)/.test(x))) throw new Error(`rows: ${rows.join()}`);
        const head = await page.evaluate(() => document.getElementById('c-res').textContent);
        if (!/Melded into stone/.test(head)) throw new Error(`header: ${head}`);
        const bars = await page.$$eval('#ap-body .ap-bar', (b) => b.filter((x) => !x.closest('[hidden]')).map((x) => x.dataset.sec));
        if (bars.some((x) => ['attacks', 'move', 'defend', 'explore', 'items'].includes(x))) throw new Error(`bars: ${bars.join()}`);
        await shot('panel');
      });

      await r.do('Step out: the cleric is out of the stone at its space and the token stands again', async () => {
        await (touch ? page.locator('#ap-stone [data-row="unmeld"]').tap() : page.click('#ap-stone [data-row="unmeld"]'));
        await wait(page, (i) => !window.hextable.state.entities[i].melded, id);
        await calm(page); await sleep(900);
        const v = await page.evaluate(async ([i]) => {
          const h = window.hextable, R = h.R.inner ?? h.R, a = R.actors.get(i), G = (await import('./shared/grid.js')).gridOf(h.state.map), p = h.state.entities[i].pos, w = G.toWorld(p);
          return { melded: !!a.melded, dx: Math.hypot(a.x - w.x, a.z - w.z), y: a.y, p, cls: a.el.classList.contains('melded') };
        }, [id]);
        if (v.melded || v.cls || v.dx > 0.1 || !(v.y > before - 0.1)) throw new Error(`after: ${JSON.stringify(v)} (was ${before})`);
        if (v.p.q !== pos.q || v.p.r !== pos.r) throw new Error(`came out at ${JSON.stringify(v.p)}, not ${JSON.stringify(pos)}`);
      });

      await r.do('in a fight, out of its turn: Step out is greyed with the engine\'s reason, and does nothing', async () => {
        await act(page, { type: 'cast', actor: id, spell: 'meld-into-stone', slot: 3, wall: { level: wall.level, x: wall.x, y: wall.y } });
        await wait(page, (i) => !!window.hextable.state.entities[i].melded, id);
        await act(page, { type: 'spawn', monster: 'goblin-warrior', at: { q: pos.q + 6, r: pos.r } });
        await act(page, { type: 'startEncounter', center: pos, radius: 9 });
        let cur = await state(page, (S) => S.encounter.order[S.encounter.turn]?.id);
        if (cur === id) { await act(page, { type: 'endTurn', actor: id }); }
        await page.evaluate((i) => window.hextable.select(i), id);
        await panelTab(page, 'stone');
        const g = await page.$eval('#ap-stone [data-row="unmeld"]', (b) => ({ off: b.getAttribute('aria-disabled'), text: b.textContent.replace(/\s+/g, ' ') }));
        const turn = await state(page, (S, i) => S.encounter.order[S.encounter.turn]?.id === i, id);
        if (!turn && (g.off !== 'true' || !/turn/.test(g.text))) throw new Error(`the row out of turn: ${JSON.stringify(g)}`);
        if (!turn) { await page.click('#ap-stone [data-row="unmeld"]').catch(() => {}); await sleep(300); if (!(await state(page, (S, i) => !!S.entities[i].melded, id))) throw new Error('a greyed Step out sent'); }
      });
    } finally { await ctx.close(); }
  });
}

export default async function meld(browser, url) {
  await run(browser, url, 'a melded creature (desktop 1280x800)', { viewport: { width: 1280, height: 800 } });
  await run(browser, url, 'a melded creature (phone 390x844, touch)', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
