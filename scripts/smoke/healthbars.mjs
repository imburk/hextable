import { sleep, scenario, wait, open, closeMenu, openTab, openMenu, waitShown, diceDuel, calm } from './lib.mjs';

// ---------- health bars over creatures (docs/specs/one-token-menu.md, Decision 7a, stage M7) ----------
// A DM and a player at a table, a fight with a bloodied foe. For each table rule (Rough, Hidden) and each device preference (Always, In a
// fight, Never): the bar over the foe and over the player's character, as the player and as the DM see them, on both a desktop and a phone.
// Rough: the foe's bar is half with a notch for a player; the DM's is exact (no notch). Hidden: no bar over the foe for a player (nor in the
// tracker), the DM still sees it. The party's bars are exact everywhere. SMOKE_SHOTS=<dir> saves a screenshot of each.
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

// The bar over a creature, read from its label on the page: { shown, width, notch }, or null when there is no label.
const barOf = (page, name) => page.evaluate((nm) => {
  const el = [...document.querySelectorAll('#labels .label')].find((l) => l.firstChild?.textContent === nm);
  if (!el) return null;
  const bar = el.querySelector('.bar');
  return { shown: !bar.hidden && getComputedStyle(bar).display !== 'none', width: Math.round(parseFloat(bar.firstElementChild.style.width)), notch: bar.classList.contains('notch') };
}, name);
const setPref = (page, v) => page.evaluate((x) => { const s = document.getElementById('set-bars'); s.value = x; s.dispatchEvent(new Event('change')); }, v);
// Whether the foe's row in the Turns screen (opened and closed here) shows its health; throws when there is no such row.
const trackerFoeHp = async (page, id, shotName) => {
  await openMenu(page, 'turns'); await sleep(400);
  const r = await page.evaluate((i) => { const hp = document.querySelector(`#tracker li[data-id="${i}"] .tr-hp`), li = document.querySelector(`#tracker li[data-id="${i}"]`); return { row: !!li, shown: !!hp && getComputedStyle(hp).display !== 'none' }; }, id);
  if (shotName && process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/bars-${shotName}.png` }).catch(() => {});
  await closeMenu(page);
  if (!r.row) throw new Error('the foe has no row in the tracker');
  return r.shown;
};

async function table(browser, url, label, dmSize, plSize) {
  await scenario(label, async (run) => {
    const dmCtx = await browser.newContext({ viewport: SIZES[dmSize], hasTouch: dmSize === 'phone', isMobile: dmSize === 'phone' });
    const plCtx = await browser.newContext({ viewport: SIZES[plSize], hasTouch: plSize === 'phone', isMobile: plSize === 'phone' });
    try {
      const dm = await dmCtx.newPage(), pl = await plCtx.newPage();
      run.watch(dm, ' (dm)'); run.watch(pl, ' (player)');
      const shot = (p, n) => (process.env.SMOKE_SHOTS ? p.screenshot({ path: `${process.env.SMOKE_SHOTS}/bars-${n}.png` }).catch(() => {}) : null);
      let code, pc, foe, foeName, pcName;
      await run.do('host a table, a player joins and claims a character', async () => {
        await open(dm, url); await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => window.hextable?.state?.entities);
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url); await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(dm, 'dm'); await waitShown(dm, '#dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
        await closeMenu(dm);
        await openMenu(pl, []); const b = pl.locator('#arc .arc-b:has-text("Play as")').first();
        pc = (await b.getAttribute('data-place')).slice(2);
        await b.click(); await closeMenu(pl);
        await wait(pl, (i) => !!window.hextable.state.entities[i].owner, pc);
        await wait(dm, (i) => !!window.hextable.state.entities[i].owner, pc);
      });
      await run.do('a fight beside a foe the player sees, the foe bloodied at 40 percent', async () => {
        ({ foe } = await diceDuel(dm, pl, pc));
        await dm.evaluate((f) => { const e = window.hextable.state.entities[f]; window.hextable.act({ type: 'setHp', actor: f, hp: Math.max(1, Math.min(Math.floor(e.maxHp / 2), Math.round(e.maxHp * 0.4))) }); }, foe);
        await wait(pl, (f) => window.hextable.state.entities[f]?.health === 'bloodied', foe);
        await calm(pl); await calm(dm);
        foeName = await dm.evaluate((f) => window.hextable.state.entities[f].name, foe);
        pcName = await dm.evaluate((p) => window.hextable.state.entities[p].name, pc);
        const pct = await dm.evaluate((f) => { const e = window.hextable.state.entities[f]; return Math.round(e.hp / e.maxHp * 100); }, foe);
        if (pct === 50) throw new Error('the foe is at exactly half; the DM and the notch could not be told apart');
      });
      const expect = async (who, page, nm, want, what) => {
        await sleep(450);       // the width eases for .3 s
        const got = await barOf(page, nm);
        if (!got) throw new Error(`${who}: no label for ${what}`);
        if (got.shown !== want.shown) throw new Error(`${who}: the bar over ${what} ${got.shown ? 'is' : 'is not'} shown, want ${want.shown ? 'shown' : 'not shown'}`);
        if (want.shown && Math.abs(got.width - want.width) > 1) throw new Error(`${who}: the bar over ${what} is ${got.width}%, want ${want.width}%`);
        if (want.shown && got.notch !== want.notch) throw new Error(`${who}: the bar over ${what} ${got.notch ? 'has' : 'has no'} notch`);
      };
      const exact = async (page, id) => page.evaluate((i) => { const e = window.hextable.state.entities[i]; return Math.round(e.hp / e.maxHp * 100); }, id);
      const dmFoe = await exact(dm, foe), pcPct = await exact(pl, pc);

      await run.do('Rough, Always: the player sees a half bar with a notch over the foe; the DM sees the exact bar; the party is exact', async () => {
        await expect('player', pl, foeName, { shown: true, width: 50, notch: true }, 'the foe');
        await expect('dm', dm, foeName, { shown: true, width: dmFoe, notch: false }, 'the foe');
        await expect('player', pl, pcName, { shown: true, width: pcPct, notch: false }, 'its character');
        await expect('dm', dm, pcName, { shown: true, width: pcPct, notch: false }, 'the character');
        await shot(pl, `${plSize}-player-rough`); await shot(dm, `${dmSize}-dm-rough`);
      });

      await run.do('Hidden: the player sees no bar over the foe and nothing of its health in the tracker; the DM sees all, and the party stays exact', async () => {
        await dm.evaluate(() => { const s = document.getElementById('dm-foe-health'); s.value = 'hidden'; s.dispatchEvent(new Event('change')); });
        await wait(pl, () => window.hextable.state.settings.foeHealth === 'hidden');
        await calm(pl);
        await expect('player', pl, foeName, { shown: false }, 'the foe');
        await expect('player', pl, pcName, { shown: true, width: pcPct, notch: false }, 'its character');
        await expect('dm', dm, foeName, { shown: true, width: dmFoe, notch: false }, 'the foe');
        if (await trackerFoeHp(pl, foe, `${plSize}-player-turns-hidden`)) throw new Error('the player\'s tracker still shows the foe\'s health');
        if (!(await trackerFoeHp(dm, foe, `${dmSize}-dm-turns-hidden`))) throw new Error('the DM\'s tracker lost the foe\'s health');
        await shot(pl, `${plSize}-player-hidden`); await shot(dm, `${dmSize}-dm-hidden`);
        await dm.evaluate(() => { const s = document.getElementById('dm-foe-health'); s.value = 'rough'; s.dispatchEvent(new Event('change')); });
        await wait(pl, () => window.hextable.state.settings.foeHealth === 'rough'); await calm(pl);
        await expect('player', pl, foeName, { shown: true, width: 50, notch: true }, 'the foe');
      });

      await run.do('the device preference: Never draws none, In a fight draws them in a fight and not after it, Always draws them again', async () => {
        await setPref(pl, 'never'); await setPref(dm, 'never');
        await expect('player', pl, foeName, { shown: false }, 'the foe'); await expect('player', pl, pcName, { shown: false }, 'its character');
        await expect('dm', dm, foeName, { shown: false }, 'the foe');
        await shot(pl, `${plSize}-player-never`);
        await setPref(pl, 'fight'); await setPref(dm, 'fight');
        await expect('player', pl, foeName, { shown: true, width: 50, notch: true }, 'the foe');
        await expect('dm', dm, foeName, { shown: true, width: dmFoe, notch: false }, 'the foe');
        await dm.evaluate(() => window.__still ? window.__still({ type: 'endEncounter' }) : window.hextable.act({ type: 'endEncounter' }));
        await wait(pl, () => !window.hextable.state.encounter); await calm(pl);
        await expect('player', pl, foeName, { shown: false }, 'the foe'); await expect('player', pl, pcName, { shown: false }, 'its character');
        await setPref(pl, 'always'); await setPref(dm, 'always');
        await expect('player', pl, pcName, { shown: true, width: pcPct, notch: false }, 'its character');
        await expect('player', pl, foeName, { shown: true, width: 50, notch: true }, 'the foe');
        await shot(pl, `${plSize}-player-after`);
      });
    } finally { await dmCtx.close(); await plCtx.close(); }
  });
}

export default async function (browser, url) {
  await table(browser, url, 'health bars: the DM on a desktop, a player on a phone', 'desktop', 'phone');
  await table(browser, url, 'health bars: the DM on a phone, a player on a desktop', 'phone', 'desktop');
}
