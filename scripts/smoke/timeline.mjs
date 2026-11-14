
import { sleep, scenario, wait, state, shown, waitShown, open, playSolo, tapAt, onCanvas, closeMenu, openTab, calm, setPace } from './lib.mjs';

// ---------- timeline and pace ----------
// At pace `wait` (the default of a table with no setting): a goblin's attack, damage and fall play in order and the player's
// controls wake after them; a tap skips; the shown state stays behind the table's until its beat. Setup runs at `instant`.
// Starts a fight with `pc` beside a foe and turns until it is the foe's turn. Leaves the page at instant pace.
async function foeTurn(page, hp) {
  await setPace(page, 'instant');
  const ids = await page.evaluate((hp0) => {
    const h = window.hextable;
    document.getElementById('dm-auto').checked = false;
    if (h.state.encounter) h.act({ type: 'endEncounter' });
    const alive = (e) => e.hp > 0 && !e.dead;
    const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && alive(e) && !e.hidden && (e.attacks?.length || e.actions?.length));
    // The whole party is made well first (setHp brings back the dead too): this pass is about beats, and a run of hits on earlier steps
    // must not leave the party fallen, which puts a card over the map and ends the fight when the strike lands.
    for (const e of Object.values(h.state.entities)) if (e.kind === 'pc' && (e.dead || e.hp < e.maxHp)) h.act({ type: 'setHp', actor: e.id, hp: e.maxHp });
    const pc = Object.values(h.state.entities).find((e) => e.kind === 'pc' && alive(e));
    h.act({ type: 'setHp', actor: pc.id, hp: hp0 ?? pc.maxHp });
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
      h.act({ type: 'place', actor: pc.id, to: { q: foe.pos.q + dq, r: foe.pos.r + dr } });
      const p = h.state.entities[pc.id].pos;
      if (Math.max(Math.abs(p.q - foe.pos.q), Math.abs(p.r - foe.pos.r), Math.abs(p.q + p.r - foe.pos.q - foe.pos.r)) === 1) break;
    }
    h.act({ type: 'startEncounter', center: foe.pos });
    return { pc: pc.id, foe: foe.id };
  }, hp);
  await calm(page);
  for (let i = 0; i < 20; i++) {
    const cur = await page.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id; });
    if (cur === ids.foe) return ids;
    await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
    await calm(page);
  }
  throw new Error('it never became the foe\'s turn');
}
// What a foe does to hit a hero: one of its actions, or its first attack (runs in the page).
const strike = ([pcId, foeId]) => {
  const S = window.hextable.state, f = S.entities[foeId];
  const def = f.actions?.find((a) => JSON.stringify(a.effects ?? []).includes('"melee"'));
  window.hextable.act(def ? { type: 'act', actor: foeId, action: def.id, target: pcId } : { type: 'attack', actor: foeId, target: pcId, attack: f.attacks[0].id });
};
// The foe attacks the hero. Reads, in the same breath, what the screen says (the table's state is final, the shown one is not);
// then waits for stillness and returns the beats that played, with their times.
async function strikeAndWatch(page, { pc, foe }) {
  const at = await page.evaluate(() => performance.now());
  const now = await page.evaluate(([pcId, foeId, src]) => {
    (0, eval)(`(${src})`)([pcId, foeId]);
    const h = window.hextable;
    return { busy: h.timeline.busy(), waiting: !document.getElementById('pace-wait').hidden, shown: h.timeline.shown().entities[pcId].hp, real: h.state.entities[pcId].hp };
  }, [pc, foe, strike.toString()]);
  await calm(page);
  const beats = await page.evaluate((n) => window.hextable.played.filter((x) => x.t >= n), at);
  return { now, beats, still: await page.evaluate(() => ({ busy: window.hextable.timeline.busy(), waiting: !document.getElementById('pace-wait').hidden })) };
}

async function pacing(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts, { pace: 'wait' });
    try {
      const page = await ctx.newPage();
      run.watch(page);
      await run.do('play solo at the default pace', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { window.hextable.dice.show = 'off'; });        // the dice are not what this pass is about
        if ((await page.evaluate(() => window.hextable.pace())) !== 'wait') throw new Error('the pace is not wait');
        await openTab(page, 'log');
        // On a phone the drawer is a modal that covers the map and takes Escape (it closes first). The log was only looked at: put the
        // drawer away, or the steps below tap a scrim instead of the map and press Escape at the drawer (the cause of "Escape did not skip").
        await closeMenu(page);
      });
      let ids;
      await run.do('a goblin hits: attack, damage and the fall play in order before the controls wake', async () => {
        for (let i = 0; i < 40; i++) {
          ids = await foeTurn(page, 1);
          await setPace(page, 'wait');
          const r = await strikeAndWatch(page, ids);
          const types = r.beats.map((x) => x.type), hit = types.includes('damage');
          if (!hit) { if (!types.includes('attack') || r.still.busy) throw new Error(`a miss did not play and settle: ${types}`); continue; }
          const t = (k) => r.beats.find((x) => x.type === k);
          if (!r.now.busy || !r.now.waiting) throw new Error('no "…" and no wait while the beats start');
          if (r.now.real >= 1 || r.now.shown !== 1) throw new Error(`the screen is not behind the table: table ${r.now.real}, shown ${r.now.shown}`);
          if (t('attack').hp !== 1) throw new Error('the hit points drained with the attack');
          if (!(t('damage').hp < 1)) throw new Error('the hit points did not drain with the damage');
          if (!(t('damage').t - t('attack').t >= 450)) throw new Error(`the damage came ${Math.round(t('damage').t - t('attack').t)} ms after the strike`);
          const order = types.filter((k) => ['attack', 'damage', 'down', 'idle'].includes(k)).join();
          if (!/^attack,damage(,down)?,idle$/.test(order)) throw new Error(`out of order: ${types}`);
          if (r.still.busy || r.still.waiting) throw new Error('the controls did not wake');
          return;
        }
        throw new Error('the goblin missed forty times');
      });
      await run.do('a tap on the map skips the beats and does not act', async () => {
        ids = await foeTurn(page, null);
        await setPace(page, 'wait');
        await page.evaluate(strike, [ids.pc, ids.foe]);
        if (!(await page.evaluate(() => window.hextable.timeline.busy()))) throw new Error('nothing is playing');
        const before = await state(page, (S) => JSON.stringify([S.entities, S.encounter?.turn]));
        const pt = await page.evaluate(() => { const h = window.hextable; const e = Object.values(h.state.entities).find((x) => x.kind === 'pc'); const p = h.R.screenOf({ q: e.pos.q + 2, r: e.pos.r, z: e.pos.z }); return p; });
        await sleep(60);
        // The point must be bare map and clear of every creature (a tap on one selects it, and a DM's tap on a foe can attack). The old
        // fallback (the middle, 120 px down) lands on the turn-order strip on a phone, and a tap there opens the drawer.
        let canvasPt = (pt && await onCanvas(page, pt.x, pt.y)) ? pt : null;
        canvasPt ??= await page.evaluate(() => {
          const h = window.hextable, at = Object.values(h.state.entities).map((e) => h.R.screenOf(e.pos)).filter(Boolean);
          // Bare map with room round it: the corner chips and the turn strip sit at the edges, and a tap on their rim opens the drawer.
          const bare = (x, y) => [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]].every(([dx, dy]) => document.elementFromPoint(x + dx, y + dy)?.id === 'gl');
          for (let y = 150; y < innerHeight - 20; y += 30) for (let x = 40; x < innerWidth - 40; x += 30) {
            if (bare(x, y) && at.every((p) => Math.hypot(p.x - x, p.y - y) > 80)) return { x, y };
          }
          return null;
        });
        if (!canvasPt) throw new Error('no bare map to tap');
        // A slow machine can stretch a tap past the renderer's limit for one, so a tap that was not taken is made again.
        // A card can come up over the map when the beats end (the party fallen, the rewards): a tap made again would land on its buttons, so
        // a repeat is made only while the point is still bare map.
        for (let k = 0; k < 4 && (await page.evaluate(() => window.hextable.timeline.busy())) && (k === 0 || await onCanvas(page, canvasPt.x, canvasPt.y)); k++) { await tapAt(page, touch, canvasPt.x, canvasPt.y); await sleep(150); }
        if (await page.evaluate(() => window.hextable.timeline.busy())) {
          const d = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { at: `${e?.tagName}#${e?.id}.${e?.className}`, body: document.body.className, active: document.activeElement?.id, hp: Object.values(window.hextable.state.entities).filter((q) => q.kind === 'pc').map((q) => q.hp).join('/'), enc: !!window.hextable.state.encounter }; }, [canvasPt.x, canvasPt.y]);
          throw new Error(`the tap did not skip (tapped ${Math.round(canvasPt.x)},${Math.round(canvasPt.y)}): ${JSON.stringify(d)}`);
        }
        const after = await state(page, (S) => JSON.stringify([S.entities, S.encounter?.turn]));
        if (before !== after) {
          // Say what changed, so a failure on a machine we cannot look at names it.
          const [b, a] = [JSON.parse(before), JSON.parse(after)], changed = [];
          for (const id of new Set([...Object.keys(b[0]), ...Object.keys(a[0])])) for (const k of new Set([...Object.keys(b[0][id] ?? {}), ...Object.keys(a[0][id] ?? {})])) if (JSON.stringify(b[0][id]?.[k]) !== JSON.stringify(a[0][id]?.[k])) changed.push(`${id}.${k}: ${JSON.stringify(b[0][id]?.[k])} -> ${JSON.stringify(a[0][id]?.[k])}`);
          if (b[1] !== a[1]) changed.push(`turn ${b[1]} -> ${a[1]}`);
          throw new Error(`the tap acted as well as skipped: ${changed.join('; ').slice(0, 600)}`);
        }
        if (await shown(page, '#pace-wait')) throw new Error('"…" is still showing');
      });
      await run.do('Escape skips too, and a button tap skips without acting', async () => {
        await calm(page);
        // A tap on a character can open its sheet, and on a phone the drawer is a modal that takes Escape and closes first (as it
        // should: drawer.js). This step is about Escape with nothing open over the map, so the drawer is put away first.
        await closeMenu(page);
        await page.evaluate(([pc, foe]) => window.hextable.act({ type: 'endTurn', actor: window.hextable.state.encounter.order[window.hextable.state.encounter.turn].id }), [ids.pc, ids.foe]);
        if (!(await page.evaluate(() => window.hextable.timeline.busy()))) throw new Error('nothing is playing');
        await page.keyboard.press('Escape');
        if (await page.evaluate(() => window.hextable.timeline.busy())) throw new Error('Escape did not skip');
      });
      await run.do('pace instant plays at once, as before', async () => {
        await setPace(page, 'instant');
        await page.evaluate(() => { const S = window.hextable.state; const c = S.encounter.order[S.encounter.turn].id; window.hextable.act({ type: 'endTurn', actor: c }); });
        if (await page.evaluate(() => window.hextable.timeline.busy())) throw new Error('beats are playing at instant');
      });
      await run.do('the pace control in Settings sets this device\'s pace', async () => {
        await openTab(page, 'settings');
        await page.selectOption('#pace-pick', 'flow');
        if ((await page.evaluate(() => window.hextable.pace())) !== 'flow') throw new Error('flow was not chosen');
        await page.selectOption('#pace-pick', '');
        if ((await page.evaluate(() => window.hextable.pace())) !== 'wait') throw new Error('the default is not wait');
        await closeMenu(page);
      });
    } finally { await ctx.close(); }
  });
}

// The monster AI runs in the DM's browser and waits for the picture; a phone player is not held up by it.
async function pacingTable(browser, url) {
  await scenario('timeline: a DM and a phone player', async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } }, { pace: 'wait' });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { pace: 'wait' });
    try {
      const host = await hostCtx.newPage(), phone = await phoneCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(phone, ' (phone)');
      let code, id;
      await run.do('the DM hosts, the phone joins and plays a character', async () => {
        await open(host, url); await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6, null, 20000);
        code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(phone, url); await phone.fill('#lobby-name', 'Smoke Player'); await phone.fill('#lobby-code', code); await phone.click('#lobby-join');
        await wait(phone, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(phone, () => window.hextable.state?.entities?.fighter);
        await closeMenu(host);
        const b = phone.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        id = await phone.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await b.click();
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, id);
      });
      await run.do('a fight is started at instant pace on the DM and the phone', async () => {
        await setPace(host, 'instant'); await setPace(phone, 'instant');
        await host.evaluate((pc) => {
          const h = window.hextable, alive = (e) => e.hp > 0 && !e.dead;
          const foe = Object.values(h.state.entities).find((e) => e.side === 'foe' && alive(e) && !e.hidden);
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: pc, to: { q: foe.pos.q + dq, r: foe.pos.r + dr } });
            const p = h.state.entities[pc].pos;
            if (Math.max(Math.abs(p.q - foe.pos.q), Math.abs(p.r - foe.pos.r), Math.abs(p.q + p.r - foe.pos.q - foe.pos.r)) === 1) break;
          }
          h.act({ type: 'startEncounter', center: foe.pos });
        }, id);
        await wait(phone, () => !!window.hextable.state.encounter);
      });
      await run.do('at wait, the DM\'s monsters act only once the picture is still; the phone follows without being held up', async () => {
        await setPace(host, 'wait'); await setPace(phone, 'wait');
        await host.evaluate(() => { document.getElementById('dm-auto').checked = true; });
        // Put the turn on a monster: end the turns of the heroes with the DM's controls (at wait, one at a time).
        const turnOf = (p) => p.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id ?? null; });
        // Every update with a monster's doing in it must arrive while nothing is playing: the AI waited for the picture.
        await host.evaluate(() => {
          const h = window.hextable, tl = h.timeline, push = tl.push; h.pushes = [];
          tl.push = (state, events, meta) => { h.pushes.push({ npc: events.some((e) => (e.type === 'attack' || e.type === 'moved' || e.type === 'turn') && (e.actor ?? e.id) && state.entities[e.actor ?? e.id]?.kind === 'npc' && e.type !== 'turn'), busy: tl.busy() }); return push(state, events, meta); };
        });
        for (let i = 0; i < 12; i++) {
          const cur = await turnOf(host);
          if (!cur) break;
          const mineNow = await host.evaluate((c) => window.hextable.state.entities[c].kind === 'pc', cur);
          if (mineNow) { await calm(host); await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); }
          await sleep(700);
        }
        await sleep(2500);
        const pushes = await host.evaluate(() => window.hextable.pushes);
        if (!pushes.some((x) => x.npc)) throw new Error('no monster acted');
        if (pushes.some((x) => x.npc && x.busy)) throw new Error(`a monster acted while the picture was playing: ${JSON.stringify(pushes)}`);
        await calm(host); await calm(phone);
        const same = await Promise.all([host, phone].map((p) => p.evaluate(() => JSON.stringify([window.hextable.state.encounter?.round, window.hextable.state.encounter?.turn, ...Object.values(window.hextable.state.entities).filter((e) => e.side === 'party').map((e) => [e.id, e.hp, e.pos.q, e.pos.r])]))));
        if (same[0] !== same[1]) throw new Error('the phone and the DM disagree once both are still');
      });
    } finally { await hostCtx.close(); await phoneCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=timeline.
export default async function (browser, url) {
  await pacing(browser, url, 'timeline at 1280x800', { viewport: { width: 1280, height: 800 } });
  await pacing(browser, url, 'timeline at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await pacingTable(browser, url);
}
