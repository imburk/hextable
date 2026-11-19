import { scenario, wait, sleep, open, playSolo, calm, placeBeside, spawnNear, tapAt, closePanels } from './lib.mjs';

// ---------- creature models (docs/specs/renderer.md, Decision 4 and R12) ----------
// The starter pack (packages/client/themes.js) draws the four heroes, goblins, skeletons and an ogre with glTF models from /models/, and the wolf as a
// pawn. Checked here, in a real page: nothing under /models/ is fetched by the lobby, with `?models=off`, or for a creature that is not on the table
// (an ogre's file waits for an ogre); each creature is the model its theme names; a strike, a walk, a hit and a fall play their clips and go back to idle;
// a Large creature fills its three hexes and a person is five feet tall; a tap on a model picks its creature (a finger on a phone); no page error.
// The pawn is what is drawn while a model loads, which is the first thing the pass sees before the files arrive.
const EXPECT = { fighter: 'barbarian', rogue: 'rogue', cleric: 'knight', wizard: 'mage', m1: 'goblin', m2: 'goblin', m3: 'goblin', m5: 'skeleton', m6: 'skeleton' };
// The page's renderer (`R.inner` while the stand-in holds it). The page's policy forbids eval, so the helper is put there before the page's own scripts run.
const HELP = () => { window.__R = () => window.hextable.R.inner ?? window.hextable.R; };
const asked = (page) => { const urls = []; page.on('request', (r) => { const m = /\/(models\/[^?#]+|vendor\/three\/GLTFLoader\.js)$/.exec(r.url()); if (m) urls.push(m[1]); }); return urls; };

async function models(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts, { pace: 'flow' });      // at `instant` nothing is played (a creature just is where it ends)
    await ctx.addInitScript(HELP);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const urls = asked(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/models-${touch ? 'phone' : 'desktop'}-${n}.png` }); };
      await run.do('the lobby fetches no model and no glTF loader', async () => {
        await open(page, url);
        await sleep(600);
        if (urls.some((u) => u.startsWith('models/') || u.includes('GLTFLoader'))) throw new Error(`fetched before a creature was drawn: ${urls.join(', ')}`);
      });
      await run.do('the valley: pawns at first, then each creature is the model its theme names; the wolf stays a pawn', async () => {
        await playSolo(page);
        await page.evaluate(() => { const h = window.hextable; h.dice.show = 'off'; h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); });
        await wait(page, (want) => { const R1 = window.__R(); return Object.entries(want).every(([id, m]) => R1.actors.get(id)?.pup?.id === m); }, EXPECT, 30000);
        const got = await page.evaluate(() => { const R1 = window.__R(); return { wolf: !!R1.actors.get("m4")?.pup, n: R1.actors.size }; });
        if (got.wolf) throw new Error('the wolf has no model in the pack and was given one');
        if (urls.some((u) => /Big_Orc/.test(u))) throw new Error('the ogre\'s file was fetched with no ogre on the table');
        for (const f of ['kaykit-adventurers/Knight.glb', 'kaykit-rig-medium/Rig_Medium.glb', 'quaternius-monsters/Blob_Orc.glb', 'kaykit-skeletons/Skeleton_Minion.glb']) if (!urls.includes(`models/${f}`)) throw new Error(`${f} was not fetched: ${urls.join(', ')}`);
        if (new Set(urls).size !== urls.length - urls.filter((u, i) => urls.indexOf(u) !== i).length) throw new Error('a file was fetched twice');
        await page.evaluate(() => { const R1 = window.__R(); R1.focus('fighter', true); R1.zoom(0.6); });
        await calm(page); await sleep(800);
        await shot('1-valley');
      });
      await run.do('a person stands five feet tall and a goblin is as wide as a hex at most', async () => {
        const feet = await page.evaluate(() => {
          const R1 = window.__R(), U = Math.sqrt(3) / 5, f = (id) => { const p = R1.actors.get(id).pup; return { w: p.scale * p.entry.dim.w / U, h: p.scale * p.entry.dim.h / U }; };
          return { hero: f('fighter'), goblin: f('m1') };
        });
        if (Math.abs(feet.hero.h - 5) > 0.05) throw new Error(`a hero is ${feet.hero.h.toFixed(2)} ft tall`);
        if (feet.goblin.w > 5.05 || feet.goblin.h > 5.05) throw new Error(`a goblin is ${JSON.stringify(feet.goblin)} ft`);
      });
      await run.do('a walk plays the run clip and ends in idle', async () => {
        const seen = await page.evaluate(async () => {
          const h = window.hextable, R1 = window.__R(), a = R1.actors.get('cleric'), from = h.state.entities.cleric.pos;
          // The first goal that the engine takes (a hex may be held for a moment by something else): try a few.
          for (const [dq, dr] of [[-2, 1], [2, -1], [-1, 2], [1, -2], [-2, 0]]) {
            h.act({ type: 'move', actor: 'cleric', to: { q: from.q + dq, r: from.r + dr } });
            const now = h.state.entities.cleric.pos;
            if (now.q !== from.q || now.r !== from.r) break;
          }
          const clips = [], t0 = performance.now();
          while (performance.now() - t0 < 4000) { if (clips.at(-1) !== a.pup.curKey) clips.push(a.pup.curKey); if (a.pup.base === 'idle' && !a.way.length && performance.now() - t0 > 300) break; await new Promise((x) => setTimeout(x, 40)); }
          return { clips, moved: h.state.entities.cleric.pos.q !== from.q || h.state.entities.cleric.pos.r !== from.r };
        });
        if (!seen.moved) throw new Error('the cleric did not move');
        if (!seen.clips.includes('run')) throw new Error(`it did not run: ${seen.clips.join(', ')}`);
        if (seen.clips.at(-1) !== 'idle') throw new Error(`it did not end idle: ${seen.clips.join(', ')}`);
      });
      await run.do('a strike: the hero plays its attack clip, turns to the goblin, and goes back to idle', async () => {
        await placeBeside(page, 'fighter', 'm1');
        // The first blow of a table at peace starts the fight, and then the fighter must have the turn: swing whenever it is the fighter's (or nobody's), end the
        // party's other turns, and let the goblins' play. The clip is looked for as it plays.
        await page.evaluate(() => { const p = window.__R().actors.get('fighter').pup, once = p.once.bind(p); window.__beats = []; const A = window.__R().actors.get('fighter'), T = window.__R().actors.get('m1'); p.once = (b) => { window.__beats.push(b); if (b === 'attack') window.__aim = { face: A.face, want: Math.atan2(T.x - A.x, T.z - A.z) }; return once(b); }; });      // every clip asked of it is written down: a frame can miss a short one
        try {
          await wait(page, () => {
            const h = window.hextable, S = h.state, cur = S.encounter?.order[S.encounter.turn]?.id, now = performance.now();
            if (window.__beats.includes('attack')) return true;
            if (now - (window.__tryAt ?? 0) > 600 && h.waiting === 0 && !h.timeline.busy()) {
              window.__tryAt = now;
              if (S.entities.fighter.hp < 7) h.act({ type: 'setHp', actor: 'fighter', hp: 12 });      // the goblins are not to win this
              if (!S.encounter || cur === 'fighter') h.act({ type: 'attack', actor: 'fighter', target: 'm1', attack: 'longsword' });
              else if (S.entities[cur]?.side === 'party') h.act({ type: 'endTurn', actor: cur });
            }
            return false;
          }, null, 40000);
        } catch { throw new Error(`the attack did not play: ${await page.evaluate(() => JSON.stringify({ beats: window.__beats, toast: document.getElementById('toast')?.textContent ?? '', turn: window.hextable.state.encounter?.order[window.hextable.state.encounter.turn]?.id }))}`); }
        const aim = await page.evaluate(() => window.__aim);
        if (Math.abs(Math.atan2(Math.sin(aim.face - aim.want), Math.cos(aim.face - aim.want))) > 0.05) throw new Error(`it did not turn to the goblin: ${JSON.stringify(aim)}`);
        await wait(page, () => { const p = window.__R().actors.get('fighter').pup; return !p.shot && p.curKey === 'idle'; }, null, 4000);
        await shot('2-after-strike');
      });
      await run.do('a goblin that is brought to 0 falls and holds its fall; when it is brought back it gets up (the fall played backwards) and idles', async () => {
        await calm(page);
        await page.evaluate(() => { const p = window.__R().actors.get('m1').pup, go = p.go.bind(p); window.__goes = []; p.go = (b, o) => { window.__goes.push(b); return go(b, o); }; });
        const r = await page.evaluate(() => { const h = window.hextable, R1 = window.__R(); h.act({ type: 'setHp', actor: 'm1', hp: 0 }); h.act({ type: 'harm', actor: 'm1', amount: 1 }); const p = R1.actors.get('m1').pup; return { base: p.base, cur: p.curKey, hp: h.state.entities.m1.hp, dead: h.state.entities.m1.dead }; });
        if (r.base !== 'die' && !(await page.evaluate(() => window.__R().actors.get('m1').pup.base === 'die'))) throw new Error(`it did not fall: ${JSON.stringify(r)}`);
        await sleep(900);
        const held = await page.evaluate(() => { const p = window.__R().actors.get('m1').pup; return { base: p.base, cur: p.curKey, goes: window.__goes }; });
        if (held.base !== 'die' || held.cur !== 'die' || !held.goes.includes('die')) throw new Error(`the fall did not play and hold: ${JSON.stringify(held)}`);
        await shot('3-fallen');
        await page.evaluate(() => { window.hextable.act({ type: 'setHp', actor: 'm1', hp: 4 }); });
        await wait(page, () => window.__goes.includes('stand'), null, 5000);
        await wait(page, () => { const p = window.__R().actors.get('m1').pup; return p.base === 'idle' && !p.shot && p.curKey === 'idle'; }, null, 5000);
      });
      await run.do('an ogre fills three hexes: 9 ft across at most, 10 ft tall at most, and its file is fetched when it appears', async () => {
        const id = await spawnNear(page, 'ogre', { near: 'fighter', radius: 9, min: 3 });
        await wait(page, (i) => !!window.__R().actors.get(i)?.pup, id, 20000);
        const o = await page.evaluate((i) => {
          const R1 = window.__R(), U = Math.sqrt(3) / 5, a = R1.actors.get(i), p = a.pup, e = window.hextable.state.entities[i];
          return { id: p.id, w: p.scale * p.entry.dim.w / U, h: p.scale * p.entry.dim.h / U, hexes: e.size === 'large' ? 3 : 0, k: a.k };
        }, id);
        if (o.id !== 'ogre') throw new Error(`the ogre is drawn as ${o.id}`);
        if (o.w > 9.05 || o.h > 10.05 || o.w < 7) throw new Error(`the ogre is ${o.w.toFixed(1)} ft across and ${o.h.toFixed(1)} ft tall`);
        if (!urls.includes('models/quaternius-monsters/Big_Orc.glb')) throw new Error('the ogre\'s file was not fetched');
        await page.evaluate((i) => { const R1 = window.__R(); R1.focus(i, true); R1.zoom(0.7); }, id);
        await calm(page); await sleep(1000);
        await shot('4-ogre');
      });
      await run.do('a tap on a hero\'s model picks that hero', async () => {
        await closePanels(page);
        await page.evaluate(() => { const R1 = window.__R(); R1.focus('rogue', true); R1.zoom(0.6); });
        await calm(page); await sleep(1200);
        const p = await page.evaluate(() => window.__R().screenOfPawn('rogue', 0.8));
        if (!p) throw new Error('the rogue is not on screen');
        await page.evaluate(() => { window.__tapped = null; const R1 = window.__R(), orig = R1.onTap; R1.onTap = (h) => { window.__tapped = h?.id ?? null; orig(h); }; });
        await tapAt(page, touch, p.x, p.y);
        await wait(page, () => window.__tapped !== null, null, 3000);
        const got = await page.evaluate(() => window.__tapped);
        if (got !== 'rogue') throw new Error(`a tap on the rogue's model picked ${got}`);
      });
    } finally { await ctx.close(); }
  });
}

// `?models=off` is a page that draws pawns and fetches nothing of the models (the way to turn them off for a bug report).
async function off(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(HELP);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const urls = asked(page);
      await run.do('with ?models=off every creature is a pawn and nothing of the models is fetched', async () => {
        await open(page, `${url}?models=off`); await playSolo(page);
        await wait(page, () => window.__R().actors.size >= 10);
        await sleep(1500);
        const models = await page.evaluate(() => [...window.__R().actors.values()].filter((a) => a.pup).length);
        if (models) throw new Error(`${models} creatures have models`);
        if (urls.length) throw new Error(`fetched: ${urls.join(', ')}`);
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=models.
export default async function (browser, url) {
  await models(browser, url, 'creature models at 1280x800', { viewport: { width: 1280, height: 800 } });
  await models(browser, url, 'creature models at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await off(browser, url, 'models off at 1280x800', { viewport: { width: 1280, height: 800 } });
}
