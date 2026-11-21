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
  return !!h.state.encounter;
}, id);

// The rogue stops following and stands well back (out of the arena the fight will have, in reach of it).
const apart = (page) => page.evaluate(() => { const h = window.hextable; h.act({ type: 'follow', actor: 'rogue', leader: null }); h.act({ type: 'place', actor: 'rogue', to: { q: -9, r: 4, z: 0 } }); });

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
        if (await inFight(page, 'rogue')) throw new Error('the rogue is in already');
        await waitShown(page, '#join');
        const t = await page.textContent('#join-text');
        if (!/Bring the others in\?/.test(t) || !/Pip/.test(t)) throw new Error(`asks: ${t}`);
        const b = await page.locator('#join-yes').boundingBox(), vp = page.viewportSize();
        if (b.x < 0 || b.y < 0 || b.x + b.width > vp.width || b.y + b.height > vp.height) throw new Error(`the button is off screen: ${JSON.stringify(b)}`);
        if (opts.hasTouch && (b.height < 44 || b.width < 44)) throw new Error(`the touch target is ${b.width}x${b.height}`);
        const d = await page.locator('#dock').boundingBox(), j = await page.locator('#join').boundingBox();
        if (j.y + j.height > d.y + 1) throw new Error('the question sits over the dock');
        await shot(page, 'ask');
      });
      await run.do('one tap brings the rogue in, rolls Initiative, and the question goes', async () => {
        await page.click('#join-yes');
        await wait(page, () => window.hextable.state.encounter.order.some((o) => o.id === 'rogue'));
        await waitShown(page, '#join', false);
        await calm(page);
        await shot(page, 'joined');
      });

      page = await fresh();
      await run.do('"Not now" puts the question off for this fight', async () => {
        await apart(page);
        await walkIn(page, 'fighter');
        await waitShown(page, '#join');
        await page.click('#join-no');
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
