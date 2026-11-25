import { sleep, scenario, wait, state, open, playSolo, closePanels, panelTab, tapGuarded, placeBeside, chip, tapDie } from './lib.mjs';

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
        await chip(page, 'Ven');
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
        await tapDie(page, false);
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

// Magic Weapon on an ally who carries two weapons: tapping the ally lists the ally's weapons (not the caster's), the choice made there is kept, Cast puts the
// spell on that weapon, and a recast on the same weapon is not refused for the weapon being magic already (MUST 1 of the review of #669).
async function ally(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const shot = async (n) => { if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${touch ? 'phone' : 'desktop'}-imbue-ally-${n}.png` }); };
      let wyn, pip;
      await run.do('a wizard with Magic Weapon and a paladin ally (Bramwell) with a Longsword and a Mace, in a fight on the wizard\'s turn', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(async () => {
          const D = await import('./shared/derive.js'), h = window.hextable;
          const w = D.derive({ name: 'Wyn', class: 'wizard', level: 3, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['fire-bolt', 'magic-weapon'] }).record;
          const p = D.derive({ name: 'Bramwell', class: 'paladin', level: 1, abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, skills: ['athletics', 'religion'],
            choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', weapons: ['longsword', 'mace'] }).record;
          h.act({ type: 'addCharacter', record: w, at: { q: -4, r: 3, z: 0 } });
          h.act({ type: 'addCharacter', record: p, at: { q: -3, r: 3, z: 0 } });
        });
        await wait(page, () => ['Wyn', 'Bramwell'].every((n) => Object.values(window.hextable.state.entities).some((e) => e.name === n)));
        [wyn, pip] = await state(page, (S) => ['Wyn', 'Bramwell'].map((n) => Object.values(S.entities).find((e) => e.name === n).id));
        await placeBeside(page, pip, wyn);
        await page.evaluate(() => { document.getElementById('dm-auto').checked = false; const S = window.hextable.state; const f = Object.values(S.entities).find((e) => e.side === 'foe' && e.hp > 0); window.hextable.act({ type: 'startEncounter', center: f.pos, radius: 14 }); });
        await wait(page, () => window.hextable.state.encounter, null, 8000);
        await wait(page, () => window.hextable.waiting === 0, null, 20000);
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === wyn) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, wyn, 20000);
        await closePanels(page);
        await chip(page, 'Wyn');
      });

      const cast = async (pick) => {
        await panelTab(page, 'spells');
        await page.click('#ap-spells [data-row="spell:magic-weapon"]');
        await wait(page, () => window.hextable.mode.kind === 'spell' && window.hextable.mode.id === 'magic-weapon');
        await tapGuarded(page, touch, pip);
        await wait(page, () => window.hextable.mode.holder, null, 5000).catch(async (err) => { throw new Error(`${err.message.split('\\n')[0]}: mode ${await page.evaluate(() => JSON.stringify(window.hextable.mode))}, toast ${await page.evaluate(() => document.getElementById('toast')?.textContent)}, hint ${await page.evaluate(() => document.getElementById('hint').textContent)}, at ${await page.evaluate(([x, y]) => JSON.stringify([window.hextable.state.entities[x].pos, window.hextable.state.entities[y].pos, window.hextable.state.entities[y].name]), [wyn, pip])}`); });
        const v = await page.evaluate(() => { const sel = document.getElementById('hint-pick'); return { shown: !sel.hidden && sel.getClientRects().length > 0, options: [...sel.options].map((o) => o.value), hint: document.getElementById('hint').textContent }; });
        if (!v.shown || !v.options.some((o) => o.startsWith('longsword')) || !v.options.includes('mace')) throw new Error(`the ally's weapon menu: ${JSON.stringify(v)}`);
        await page.selectOption('#hint-pick', pick);
        // Cast and Cancel, wrapped or not, stay on screen and nothing (the chat bubble) sits over them.
        const hit = await page.evaluate(() => ['hint-pick', 'btn-menu', 'hint-cancel'].map((id) => { const el = document.getElementById(id), r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { id, ok: r.width > 0 && r.x >= 0 && r.right <= window.innerWidth && (top === el || el.contains(top)), r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], top: top?.id || top?.tagName }; }));
        if (hit.some((x) => !x.ok)) throw new Error(`the hint controls are clipped or covered: ${JSON.stringify(hit)}`);
        await shot(`menu-${pick}`);
        await tapDie(page, false);
        await wait(page, (w) => (window.hextable.state.effects ?? []).some((fx) => fx.name === 'Magic Weapon' && fx.parts.some((p) => p.imbue && !p.ended && p.imbue.weapon === w)), pick, 10000);
      };
      await run.do('tapping the ally lists the ally\'s two weapons; choosing the Mace and Cast puts Magic Weapon on the Mace only', async () => {
        await cast('mace');
        const rows = await state(page, (S, id) => { const e = S.entities[id]; return e.attacks.filter((a) => a.weapon).map((a) => a.id); }, pip);
        if (!rows.includes('mace')) throw new Error(`the ally's records: ${rows}`);
        const fx = await state(page, (S) => (S.effects ?? []).filter((f) => f.name === 'Magic Weapon' && f.parts.some((p) => !p.ended)).length);
        if (fx !== 1) throw new Error(`${fx} Magic Weapon effects`);
      });
      await run.do('the next turn, a recast on the Longsword moves it: one effect, on the Longsword, and the Mace is plain again', async () => {
        for (let i = 0; i < 30; i++) {
          const cur = await state(page, (S) => S.encounter?.order[S.encounter.turn]?.id);
          if (cur === wyn && i > 0) break;
          await page.evaluate((x) => window.hextable.act({ type: 'endTurn', actor: x }), cur);
          await wait(page, () => window.hextable.waiting === 0, null, 20000);
        }
        await wait(page, (i) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === i; }, wyn, 20000);
        await closePanels(page);
        await chip(page, 'Wyn');
        await cast('longsword');
        const on = await state(page, (S) => (S.effects ?? []).filter((f) => f.name === 'Magic Weapon' && f.parts.some((p) => p.imbue && !p.ended)).flatMap((f) => f.parts.filter((p) => p.imbue && !p.ended).map((p) => p.imbue.weapon)));
        if (on.join() !== 'longsword') throw new Error(`Magic Weapon is on ${on}`);
        await shot('after');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=imbue.
export default async function (browser, url) {
  await imbue(browser, url, 'a weapon a spell changes at 1280x800', { viewport: { width: 1280, height: 800 } });
  await imbue(browser, url, 'a weapon a spell changes at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ally(browser, url, 'Magic Weapon on an ally with two weapons at 1280x800', { viewport: { width: 1280, height: 800 } });
  await ally(browser, url, 'Magic Weapon on an ally with two weapons at 390x844 with touch', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
