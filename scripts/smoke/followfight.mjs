import { scenario, wait, state, shown, waitShown, open, calm } from './lib.mjs';
import { mkdirSync } from 'node:fs';

// ---------- the party follows by default; a fight asks to bring the others in (issue #671, playability PB-2) ----------
// Solo at 1280x800 and at 390x844 with touch. A new game has the heroes after the first following it, so the walk toward the goblins takes all
// four into the fight. With one hero left standing apart, "Bring the others in?" shows once the fight starts; one tap sends `joinFight` and the
// hero is in the turn order; "Not now" puts it off for that fight. SMOKE_SHOTS=<dir> saves screenshots.

const inFight = (page, id) => state(page, (S, i) => !!S.encounter?.order.some((o) => o.id === i), id);
// Walk the first hero toward the goblins, a step at a time, until the fight starts.
const walkIn = (page, id) => page.evaluate((who) => {
  const h = window.hextable;
  for (let i = 0; i < 20 && !h.state.encounter; i++) h.act({ type: 'move', actor: who, to: { q: 2, r: -1, z: 0 } });
  // A random valley may wall the walk off (rock, water): the fight is called where the goblins are, as the DM would.
  if (!h.state.encounter) h.act({ type: 'startEncounter', center: { q: 2, r: -1 } });
  return !!h.state.encounter;
}, id);

// The rogue stops following: it stays where it started, nine hexes from where the fight will be, just outside its arena and in reach of it.
const apart = (page) => page.evaluate(() => window.hextable.act({ type: 'follow', actor: 'rogue', leader: null }));

async function pass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const tag = opts.hasTouch ? 'phone' : 'wide', dir = process.env.SMOKE_SHOTS; if (dir) mkdirSync(dir, { recursive: true });
    const shot = (page, n) => (dir ? page.screenshot({ path: `${dir}/followfight-${n}-${tag}.png` }).catch(() => {}) : null);
    // Each run is a new browser context: the browser keeps the last solo game, and Continue would take it up.
    const ctxs = [];
    const fresh = async () => {
      const ctx = await browser.newContext(opts); ctxs.push(ctx);
      const page = await ctx.newPage(); run.watch(page);
      await open(page, url);
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
        if (!(await walkIn(page, 'fighter'))) throw new Error('no fight started');
        await calm(page);
        for (const id of ['fighter', 'rogue', 'cleric', 'wizard']) if (!(await inFight(page, id))) throw new Error(`${id} is not in the fight`);
        if (await shown(page, '#join')) throw new Error('"Bring the others in?" shown with everyone in');
        await shot(page, 'all-in');
      });

      page = await fresh();
      await run.do('with the rogue standing apart, the fight starts and asks "Bring the others in?"', async () => {
        await apart(page);
        if (!(await walkIn(page, 'fighter'))) throw new Error('no fight started');
        await wait(page, () => window.hextable.timeline && window.hextable.waiting === 0);
        if (await inFight(page, 'rogue')) throw new Error(`the rogue is in already: ${await state(page, (S) => JSON.stringify([S.entities.rogue.pos, S.entities.rogue.follow, S.entities.fighter.pos, S.encounter.center, S.encounter.order.map((o) => o.id)]))}`);
        await waitShown(page, '#join');
        const t = await page.textContent('#join-text');
        if (!/Bring the others in\?/.test(t) || !/Pip/.test(t)) throw new Error(`asks: ${t}`);
        const b = await page.locator('#join-yes').boundingBox(), vp = page.viewportSize();
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
            bad = others.map((d, k) => (d && j.bottom > d.top + 1 && j.left < d.right && j.right > d.left ? ['#btn-menu', '#turnline'][k] : '')).filter(Boolean).join(' ');
          }
          return still >= 2 ? bad && `${bad} ${last}` : `never settled ${last}`;
        });
        if (over) throw new Error(`the question sits over ${over}`);
        await shot(page, 'ask');
      });
      await run.do('one tap brings the rogue in, rolls Initiative, and the question goes', async () => {
        await page.click('#join-yes');
        await wait(page, () => window.hextable.state.encounter.order.some((o) => o.id === 'rogue')).catch(async () => {
          throw new Error(`the rogue did not join: ${await page.evaluate(() => JSON.stringify({ pos: window.hextable.state.entities.rogue.pos, fp: window.hextable.state.entities.fighter.pos, c: window.hextable.state.encounter.center, join: !document.querySelector('#join').hidden, log: [...document.querySelectorAll('#log-list li')].slice(-4).map((l) => l.textContent) }))}`);
        });
        await waitShown(page, '#join', false);
        await calm(page);
        await shot(page, 'joined');
      });

      page = await fresh();
      await run.do('"Not now" puts the question off for this fight', async () => {
        await apart(page);
        await walkIn(page, 'fighter');
        await wait(page, () => window.hextable.timeline && window.hextable.waiting === 0, null, 20000);
        await waitShown(page, '#join', true, 20000);      // the fight's start plays out first (the Initiative dice); a slow machine took longer than the default 5 s
        // The question rides above the dock, and the dock changes height as the monsters' turns go by and the selected hero changes, so on a loaded machine the
        // button can still be moving when a click is tried: try again until it takes (a click that lands is the one `join-no` handler, so it cannot double).
        for (let i = 0; i < 6 && (await shown(page, '#join')); i++) await page.click('#join-no', { timeout: 4000 }).catch(() => {});
        await waitShown(page, '#join', false);
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
