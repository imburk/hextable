import { sleep, scenario, wait, state, open, playSolo, closePanels, panelTab } from './lib.mjs';

// ---------- a weapon a spell changes (docs/specs/on-hit.md, stage O4; #666) ----------
// A level 1 druid with Shillelagh, a Quarterstaff and a Club (two weapons fit). Armed, the hint bar asks which weapon (a thumb-sized control on touch); cast on the
// Quarterstaff, the Attacks tab shows its changed numbers (Wisdom and a d8, Force or Bludgeoning) and the Club's are as they were.
async function imbue(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-imbue-${n}.png` }); };
      let ven;
      await run.do('a level 1 druid in a fight on her turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const rec = D.derive({ name: 'Ven', class: 'druid', level: 1, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ['nature', 'perception'],
            choices: { 'primal-order': 'warden' }, armour: 'leather-armor', weapons: ['quarterstaff', 'club'], spells: ['shillelagh'] }).record;
          h.act({ type: 'addCharacter', record: rec, at: { q: -4, r: 3, z: 0 } });
        });
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'));
        ven = await state(page, (S) => Object.values(S.entities).find((e) => e.name === 'Ven').id);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === ven) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, ven, 20000);
        await closePanels(page);
        await page.click('#party button:has-text("Ven")');
      });

      await run.do('before: the Quarterstaff rolls Strength (+2 to hit)', async () => {
        await panelTab(page, 'attacks');
        const sub = await page.textContent('#ap-attacks [data-row="atk:quarterstaff-two-handed"]');
        if (!/\+2 to hit/.test(sub) || /force/i.test(sub)) throw new Error(`before: ${sub}`);
        await shot('1-before');
      });

      await run.do('armed: the hint bar asks which weapon, and the control is thumb-sized on touch', async () => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:shillelagh"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'shillelagh');
        const v = await page.evaluate(() => { const sel = document.getElementById('hint-pick'), r = sel.getBoundingClientRect(); return { shown: !sel.hidden && sel.getClientRects().length > 0, options: [...sel.options].map((o) => o.value), h: r.height, text: sel.selectedOptions[0]?.textContent }; });
        if (!v.shown || v.options.join() !== 'quarterstaff,club') throw new Error(`weapon menu: ${JSON.stringify(v)}`);
        if (touch && v.h < 44) throw new Error(`the menu is ${v.h}px high on touch`);
        await shot('2-weapon-menu');
      });

      await run.do('cast on the Quarterstaff: Wisdom, a d8, Force or Bludgeoning in the Attacks tab; the Club is unchanged', async () => {
        await page.selectOption('#hint-pick', 'quarterstaff');
        await page.click('#hint-go');
        await wait(page, () => (window.hextable.state.effects ?? []).some((fx) => fx.name === 'Shillelagh'), null, 10000);
        await sleep(300);
        await panelTab(page, 'attacks');
        const staff = await page.textContent('#ap-attacks [data-row="atk:quarterstaff-two-handed"]'), club = await page.textContent('#ap-attacks [data-row="atk:club"]');
        if (!/\+5 to hit/.test(staff) || !/1d8\+3 bludgeoning or force/.test(staff)) throw new Error(`staff: ${staff}`);
        if (!/\+2 to hit/.test(club) || /force/i.test(club)) throw new Error(`club: ${club}`);
        await shot('3-after');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=imbue.
export default async function (browser, url) {
  await imbue(browser, url, 'a weapon a spell changes at 1280x800', { viewport: { width: 1280, height: 800 } });
  await imbue(browser, url, 'a weapon a spell changes at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
