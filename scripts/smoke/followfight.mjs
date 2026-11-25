import { scenario, wait, state, shown, waitShown, open, calm } from './lib.mjs';
import { mkdirSync } from 'node:fs';

// ---------- the party follows by default; a fight asks to bring the others in (issue #671, playability PB-2) ----------
// Solo at 1280x800 and at 390x844 with touch. A new game has the heroes after the first following it, so the walk toward the goblins takes all
// four into the fight. With one hero left standing apart, "Bring the others in?" shows once the fight starts; one tap sends `joinFight` and the
// hero is in the turn order; "Not now" puts it off for that fight. SMOKE_SHOTS=<dir> saves screenshots.

// A slow machine (CI is about 3x slower than a laptop; swiftshader draws every frame of the Initiative dice) needs far longer than a laptop's two seconds to play a fight's start out.
// These waits end the moment their condition holds; the limit only says how long a game that is really stuck is given.
const PLAYED = 60000;

const inFight = (page, id) => state(page, (S, i) => !!S.encounter?.order.some((o) => o.id === i), id);
// Walk the first hero toward the goblins, a step at a time, until the fight starts.
const walkIn = (page, id) => page.evaluate((who) => {
  const h = window.hextable;
  for (let i = 0; i < 20 && !h.state.encounter; i++) h.act({ type: 'move', actor: who, to: { q: 2, r: -1, z: 0 } });
  // A random valley may wall the walk off (rock, water; about 1 map in 70). A fight called where the goblins are would hold no hero and is refused (#771), so the
  // answer is 'walled' and a step that is about the walk itself takes another valley.
  return h.state.encounter ? 'walked' : 'walled';
}, id);

// The question's button rect, once it is on screen: a turn passing re-lays the screen out and the question may be between two frames of that (`boundingBox` is null then).
const box = async (page, sel) => { for (let t0 = Date.now(); Date.now() - t0 < PLAYED; ) { const b = await page.locator(sel).boundingBox().catch(() => null); if (b) return b; await waitShown(page, '#join', true, PLAYED); } throw new Error(`${sel} has no box`); };

// A tap on a button of the question. The Initiative or attack dice are laid over the screen while the monsters roll, and a tap that lands on them is not a tap on the button (it was
// tried every 4 s for a minute under a 4x CPU throttle): tap only when the button is the topmost thing at its centre, and look again after a short wait when it is not.
const tap = async (page, sel) => {
  for (let t0 = Date.now(); Date.now() - t0 < PLAYED && (await shown(page, '#join')); ) {
    const on = await page.evaluate((q) => { const b = document.querySelector(q), r = b.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === b || b.contains(t)); }, sel).catch(() => false);
    if (on) await page.click(sel, { timeout: 4000, force: true }).catch(() => {}); else await new Promise((r) => setTimeout(r, 100));
  }
};

// The rogue stops following: it stays where it started, nine hexes from where the fight will be, just outside its arena and in reach of it.
const apart = (page) => page.evaluate(() => window.hextable.act({ type: 'follow', actor: 'rogue', leader: null }));

async function pass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const tag = opts.hasTouch ? 'phone' : 'wide', dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const shot = (page, n) => (dir ? page.screenshot({ path: `${dir}/followfight-${n}-${tag}.png` }).catch(() => {}) : null);
    // Each run is a new browser context: the browser keeps the last solo game, and Continue would take it up.
    const ctxs = [];
    const fresh = async () => {
      for (const c of ctxs.splice(0)) await c.close();      // the last game's page keeps playing its fight (dice, monsters' turns) and takes CPU a slow machine has not got
      const ctx = await browser.newContext(opts); ctxs.push(ctx);
      const page = await ctx.newPage(); run.watch(page);
      await open(page, url);
      if (process.env.SMOKE_CPU) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SMOKE_CPU) });      // SMOKE_CPU=4: a slow machine, as CI is
      await page.click('#lobby-solo'); await wait(page, () => window.hextable?.state?.entities?.fighter);
      return page;
    };
    try {
      let page = await fresh();
      await run.do('a new game starts with the party following the first hero', async () => {
        const f = await state(page, (S) => Object.values(S.entities).filter((x) => x.side === 'party').map((x) => [x.id, x.follow ?? null]));
        const lead = f[0][0];
        if (f[0][1] !== null || f.slice(1).some(([, l]) => l !== lead)) throw new Error(`follow: ${JSON.stringify(f)}`);
      });
      await run.do('one walk toward the goblins takes all four into the fight, and nothing asks', async () => {
        let how = await walkIn(page, 'fighter');
        // The step is about one walk taking the party in: a valley that walled the walk off is not that, so take another.
        for (let tries = 0; how !== 'walked' && tries < 8; tries++) { page = await fresh(); how = await walkIn(page, 'fighter'); }
        if (how !== 'walked') throw new Error('no fight started by a walk');
        await calm(page, PLAYED);
        for (const id of ['fighter', 'rogue', 'cleric', 'wizard']) if (!(await inFight(page, id))) throw new Error(`${id} is not in the fight`);
        if (await shown(page, '#join')) throw new Error('"Bring the others in?" shown with everyone in');
        await shot(page, 'all-in');
      });

      // A fight needs the first hero in it. When a random valley walls the walk off (about 1 game in 70 on a quiet runner), no fight starts: one called where the
      // goblins alone stand is refused (#771; before, it ended at once as a defeat, seen on CI at 390x844, #767). So a step about the question takes a new valley,
      // as the first step does.
      const apartFight = async () => {
        let how;
        for (let tries = 0; tries < 8; tries++) { page = await fresh(); await apart(page); how = await walkIn(page, 'fighter'); if (how === 'walked') return; }
        throw new Error(`no fight started by a walk (${how})`);
      };
      await run.do('with the rogue standing apart, the fight starts and asks "Bring the others in?"', async () => {
        await apartFight();
        await wait(page, () => window.hextable.timeline && window.hextable.waiting === 0, null, PLAYED);
        if (await inFight(page, 'rogue')) throw new Error(`the rogue is in already: ${await state(page, (S) => JSON.stringify([S.entities.rogue.pos, S.entities.rogue.follow, S.entities.fighter.pos, S.encounter.center, S.encounter.order.map((o) => o.id)]))}`);
        await waitShown(page, '#join', true, PLAYED);
        const t = await page.textContent('#join-text');
        if (!/Bring the others in\?/.test(t) || !/Pip/.test(t)) throw new Error(`asks: ${t}`);
        const b = await box(page, '#join-yes'), vp = page.viewportSize();
        if (b.x < 0 || b.y < 0 || b.x + b.width > vp.width || b.y + b.height > vp.height) throw new Error(`the button is off screen: ${JSON.stringify(b)}`);
        if (opts.hasTouch && (b.height < 44 || b.width < 44)) throw new Error(`the touch target is ${b.width}x${b.height}`);
        // M4: no dock; the token strip owns the bottom of the screen and the question sits above it (and above the turn line when that is shown)
        // The turn line grows (quick actions, a second row) when the turn passes to a hero and the question follows in the same frame (`--turn-h`, a
        // ResizeObserver), so both rects are read in one synchronous call, and only once they have held still for two frames.
        const over = await page.evaluate(async () => {
          const rects = () => ['join', 'btn-menu', 'turnline'].map((i) => { const el = document.getElementById(i); return el && !el.hidden && getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect().toJSON() : null; });
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          let last = '', still = 0, bad = '';
          for (let i = 0; i < 180 && still < 2; i++) {
            await frame();
            const [j, ...others] = rects(), now = JSON.stringify([j, ...others]);
            still = now === last ? still + 1 : 0; last = now;
            if (!j) { still = 0; continue; }
            bad = others.map((d, k) => (d && j.bottom > d.top + 1 && j.left < d.right && j.right > d.left ? ['#btn-menu', '#turnline'][k] : '')).filter(Boolean).join(' ');
          }
          return still >= 2 ? bad && `${bad} ${last}` : `never settled ${last}`;
        });
        if (over) throw new Error(`the question sits over ${over}`);
        await shot(page, 'ask');
      });
      await run.do('one tap brings the rogue in, rolls Initiative, and the question goes', async () => {
        // The dock and the turn line change height as turns pass, so the button can still be moving when a click is tried: try again until one takes (`force`: Playwright's own "stable" check never passed on a throttled CPU although the rects held still; a click that lands is the one handler, and none is tried once the question is gone).
        await tap(page, '#join-yes');
        await wait(page, () => window.hextable.state.encounter.order.some((o) => o.id === 'rogue'), null, PLAYED).catch(async () => {
          throw new Error(`the rogue did not join: ${await page.evaluate(() => JSON.stringify({ pos: window.hextable.state.entities.rogue.pos, fp: window.hextable.state.entities.fighter.pos, c: window.hextable.state.encounter.center, join: !document.querySelector('#join').hidden, log: [...document.querySelectorAll('#log-list li')].slice(-4).map((l) => l.textContent) }))}`);
        });
        await waitShown(page, '#join', false, PLAYED);
        await calm(page, PLAYED);
        await shot(page, 'joined');
      });

      await run.do('"Not now" puts the question off for this fight', async () => {
        await apartFight();
        await wait(page, () => window.hextable.timeline && window.hextable.waiting === 0, null, PLAYED);
        await waitShown(page, '#join', true, PLAYED);      // the fight's start plays out first (the Initiative dice); a slow machine took longer than the default 5 s
        // The question rides above the dock, and the dock changes height as the monsters' turns go by and the selected hero changes, so on a loaded machine the
        // button can still be moving when a click is tried: try again until it takes (a click that lands is the one `join-no` handler, so it cannot double; `force` as above).
        await tap(page, '#join-no');
        await waitShown(page, '#join', false, PLAYED);
        if (await inFight(page, 'rogue')) throw new Error('the rogue joined anyway');
      });
    } finally { for (const c of ctxs) await c.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=followfight.
export default async function (browser, url) {
  await pass(browser, url, 'follow by default and bring the others in at 1280x800', { viewport: { width: 1280, height: 800 } });
  await pass(browser, url, 'follow by default and bring the others in at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
