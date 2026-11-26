import { sleep, scenario, wait, state, open, playSolo, calm, closePanels, panelTab, settle, onCanvas, tapAt, viewStill } from './lib.mjs';
import { newMap } from '../../packages/rules/src/map.js';
import * as H from '../../packages/rules/src/hex.js';

// ---------- the Leap row (#818, for the engine's `leap` action, #813) ----------
// A flat stone field. The fighter stands at (-3, 0). Outside a fight: the Move tab's Leap row says "Up to N ft"; a tap arms it (the words say so), Escape and a second tap
// on the row put it down; the next tap on a hex 10 ft away sends `leap` and the fighter is there; a hex beyond its reach is refused in the engine's words and nobody moves.
// In a fight: a standing leap of one hex costs 5 ft of movement and the meter drops; after 10 ft of walking a 15 ft leap is made. 1280x800 and 390x844 with touch.
const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 7).map((h) => [H.col(h), { t: 'stone' }]));
const MAP = newMap({ id: 'leap-smoke', name: 'The leaping field', starts: [{ q: -1, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: ground }] });
const ID = 'fighter';
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const act = async (page, a) => { const r = await page.evaluate((x) => window.hextable.act(x), a); await calm(page); return r; };
const posOf = (page) => state(page, (S, i) => S.entities[i].pos, ID);
const left = (page) => state(page, (S) => S.encounter?.budget?.move ?? null);
const hint = (page) => page.evaluate(() => (document.getElementById('hint').hidden ? '' : document.getElementById('hint-text').textContent));
const tab = (page) => state(page, (S) => (S.encounter ? 'move' : 'explore'));
const rowText = async (page) => page.$eval(`#ap-${await tab(page)} [data-row="leap"]`, (e) => e.textContent.replace(/\s+/g, ' ')).catch(() => '');

// Tap a free hex `n` steps from the fighter (a direction that is on the canvas and empty); returns the hex.
async function tapHex(page, touch, n, skip = 0) {
  await closePanels(page);
  for (const [di, d] of DIRS.entries()) {
    if (di < skip) continue;
    await settle(page, ID); await viewStill(page);
    const pt = await page.evaluate(([i, v, k]) => { const S = window.hextable.state, e = S.entities[i], q = e.pos.q + v[0] * k, r = e.pos.r + v[1] * k;
      if (Object.values(S.entities).some((o) => o.pos && o.pos.q === q && o.pos.r === r)) return null;
      const p = window.hextable.R.screenOf({ q, r, z: e.pos.z }); return p && { q, r, x: p.x, y: p.y }; }, [ID, d, n]);
    if (!pt || pt.x < 5 || pt.y < 5 || !(await onCanvas(page, pt.x, pt.y))) continue;
    await tapAt(page, touch, pt.x, pt.y);
    return { q: pt.q, r: pt.r, di };
  }
  throw new Error(`no free hex ${n} steps away could be tapped`);
}
// Outside a fight the rows past the first four are under Explore's "More".
const more = (page) => page.evaluate(() => { const d = document.querySelector('#ap-explore details.ap-more'); if (d && !d.open) d.open = true; });
const armLeap = async (page, touch) => {
  const g = await tab(page);
  await panelTab(page, g);
  await more(page);
  const sel = `#ap-${g} [data-row="leap"]`;
  await (touch ? page.locator(sel).tap({ timeout: 5000 }) : page.click(sel, { timeout: 5000 }));
  await wait(page, () => window.hextable.mode.kind === 'leap');
};

// Leap `n` hexes: arm, tap a free hex that far; if the engine refuses that hex (a creature there) arm again and try the next side. Returns where it came down.
async function leapOver(page, touch, n) {
  const from = await posOf(page);
  for (let skip = 0; skip < 6; skip++) {
    if ((await page.evaluate(() => window.hextable.mode.kind)) !== 'leap') await armLeap(page, touch);
    const at = await tapHex(page, touch, n, skip);
    const moved = await wait(page, ([i, f]) => { const p = window.hextable.state.entities[i].pos; return p.q !== f.q || p.r !== f.r; }, [ID, from], 2500).then(() => true, () => false);
    if (moved) { await calm(page); return at; }
    skip = at.di;
  }
  throw new Error(`no hex ${n} steps away took the leap`);
}

export default async function leap(browser, url) {
  for (const [label, opts] of [['the Leap row (desktop 1280x800)', { viewport: { width: 1280, height: 800 } }], ['the Leap row (phone 390x844, touch)', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    await scenario(label, async (run) => {
      const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
      try {
        const page = await ctx.newPage();
        run.watch(page);
        let str = 15;

        await run.do('the Move tab has a Leap row that says how far, in feet', async () => {
          await open(page, url); await playSolo(page);
          await page.evaluate(() => { document.getElementById('dm-auto').checked = false; });
          await act(page, { type: 'setting', key: 'autoEngage', value: false });
          await act(page, { type: 'loadMap', map: MAP });
          await act(page, { type: 'place', actor: ID, to: { q: -3, r: 0 } });
          await page.evaluate((i) => window.hextable.select(i), ID); await calm(page);
          str = await state(page, (S, i) => S.entities[i].abil.str, ID);
          await panelTab(page, await tab(page));
          const t = await rowText(page), want = Math.floor(str / 5) * 5;
          if (!/Leap/.test(t) || !new RegExp(`Up to ${want} ft`).test(t)) throw new Error(`the Leap row: "${t}" (Strength ${str})`);
          if (await page.$('#ap-explore [data-row="leap-jump"]')) throw new Error('a Jump row is shown to a creature with no Jump');
        });

        await run.do('a tap arms Leap (words on screen); Escape puts it down; a second tap on the row puts it down too', async () => {
          await armLeap(page, touch);
          await closePanels(page);
          if (!/leap/i.test(await hint(page))) throw new Error(`no words for the armed leap: "${await hint(page)}"`);
          await page.keyboard.press('Escape');
          await wait(page, () => window.hextable.mode.kind === 'move');
          await armLeap(page, touch);
          const g = await tab(page);
          await panelTab(page, g);
          await more(page);
  const sel = `#ap-${g} [data-row="leap"]`;
          if (!(await page.$(sel))) throw new Error(`no Leap row while armed: ${await page.$$eval('#ap-body [data-row]', (b) => b.map((x) => x.dataset.row).join())} mode ${await page.evaluate(() => window.hextable.mode.kind)}`);
          await (touch ? page.locator(sel).tap() : page.click(sel, { timeout: 4000 }));
          await wait(page, () => window.hextable.mode.kind === 'move');
        });

        await run.do('a hex 10 ft away: the fighter leaps there and no turn or movement is spent', async () => {
          const from = await posOf(page), at = await leapOver(page, touch, 2);
          if (await state(page, (S) => !!S.encounter)) throw new Error('a leap outside a fight started one');
          if (await page.evaluate(() => window.hextable.mode.kind) !== 'move') throw new Error('the leap stayed armed after the tap');
          if (from.q === at.q && from.r === at.r) throw new Error('it did not move');
        });

        await run.do('a hex beyond its reach: the engine refuses in its own words on the toast and nobody moves', async () => {
          await armLeap(page, touch);
          const from = await posOf(page);
          await tapHex(page, touch, Math.floor(str / 5) + 1);
          await wait(page, () => /Too far/.test(document.getElementById('toast')?.textContent ?? ''));
          const now = await posOf(page);
          if (now.q !== from.q || now.r !== from.r) throw new Error('it moved on a refused leap');
        });

        await run.do('in a fight: a standing leap of 5 ft costs 5 ft of movement and the meter drops; after walking 10 ft, a 15 ft leap is made', async () => {
          await act(page, { type: 'place', actor: ID, to: { q: -3, r: 0 } });
          await act(page, { type: 'spawn', monster: 'goblin-warrior', at: { q: 6, r: 0 } });
          await act(page, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 });
          for (let i = 0; i < 20; i++) {
            const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
            if (cur === ID) break;
            await act(page, { type: 'endTurn', actor: cur });
          }
          await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, ID);
          const m0 = await left(page);
          await leapOver(page, touch, 1);
          const m1 = await left(page);
          if (m1 !== m0 - 5) throw new Error(`movement went ${m0} -> ${m1}, not -5`);
          // walk 10 ft, then the running start is there
          const p = await posOf(page);
          let walked = false;
          for (const d of DIRS) { await act(page, { type: 'move', actor: ID, to: { q: p.q + d[0] * 2, r: p.r + d[1] * 2 } }); if ((await left(page)) <= m1 - 10) { walked = true; break; } }
          if (!walked) throw new Error('could not walk 10 ft');
          await calm(page);
          const m2 = await left(page);
          if (m2 < 15) { throw new Error(`only ${m2} ft left for a 15 ft leap`); }
          await panelTab(page, await tab(page));
          const t = await rowText(page);
          if (!new RegExp(`Up to ${Math.min(Math.floor(str / 5) * 5, m2)} ft`).test(t)) throw new Error(`the row in a fight with a running start: "${t}"`);
          await closePanels(page);
          await leapOver(page, touch, 3);
          const m3 = await left(page);
          if (m3 !== m2 - 15) throw new Error(`a 15 ft leap cost ${m2 - m3}, not 15`);
        });
      } finally { await ctx.close(); }
    });
  }
}
