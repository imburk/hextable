import { sleep, scenario, wait, shown, waitShown, open, closeMenu, openTab, calm, settle, onCanvas, tapAt } from './lib.mjs';

// ---------- the movement an Opportunity Attack gave, at the table (issue #536, DEBT T93; docs/specs/homebrew-subclasses.md, "Build notes: H") ----------
// A DM hosts and a player joins. The DM adds an invented pack (the "Oath of the Hollow Bell": `triggers.opportunityHit`), the DM makes a paladin of it and the player plays it.
// A goblin beside the paladin walks away on the DM's order and the paladin's Opportunity Attack hits (a goblin is tried again until it does). Then, with the DM's auto-play
// ON, the pass checks what each side sees and does:
//   the player: the movement is offered at once (Move up to N ft, Don't move), the reach is shaded, a tap before Move spends nothing, a tap after it moves and provokes nothing,
//   the DM: the auto-play does not end the goblin's turn (it waits, with a visible line and a button that gives the movement up for the player), and once the movement is spent,
//   given up by the player or given up by the DM the foes go on by themselves.
// Run twice: the DM at desktop size with a phone player, then the other way round. Screenshots go to SMOKE_SHOTS when it is set.
const raw = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
// A picture once the toasts of the set-up (a fight ended, a note) have gone, so that the bar under test is not hidden behind one.
const shot = async (page, name) => { if (!process.env.SMOKE_SHOTS) return; await wait(page, () => document.getElementById('toast').hidden, null, 6000).catch(() => {}); await sleep(300); await raw(page, name); };
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const P = 'bell-needle-folk', OATH = `hb-${P}-oath-of-the-hollow-bell`;
const PACK = JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: P, name: 'Bell and Needle Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for the smoke test.' },
  subclasses: [{ id: OATH, name: 'Oath of the Hollow Bell', class: 'paladin', source: `homebrew:${P}`, checked: false, text: 'Sworn to the bell.',
    features: [{ id: `hb-${P}-bell-chase`, name: 'Bell chase', level: 3, tier: 'auto', checked: false, text: 'When its Opportunity Attack hits, the holder may move up to half its Speed, provoking nothing.', grants: { triggers: { opportunityHit: { move: 'half' } } } }] }] });
const SHEET = { name: 'Sir Bell', class: 'paladin', level: 5, subclass: OATH, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, skills: ['athletics', 'religion'],
  choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'], spells: ['bless', 'cure-wounds'] };

async function table(browser, url, label, hostOpts, playerOpts, tag) {
  await scenario(label, async (run) => {
    const hostCtx = await browser.newContext(hostOpts), playerCtx = await browser.newContext(playerOpts);
    try {
      const dm = await hostCtx.newPage(), pl = await playerCtx.newPage();
      run.watch(dm, ' (DM)'); run.watch(pl, ' (player)');
      const touch = !!playerOpts.hasTouch;
      let bell = null;
      const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
      const hintOf = (page) => page.evaluate(() => { const h = document.getElementById('hint'); return h.hidden ? '' : h.textContent; });
      const turnOf = (page) => page.evaluate(() => { const S = window.hextable.state; return S.encounter ? S.encounter.order[S.encounter.turn].id : null; });
      const flag = (page) => page.evaluate(() => window.hextable.state.encounter?.flags?.['rmove:' + Object.values(window.hextable.state.entities).find((e) => e.name === 'Sir Bell').id] ?? 0);
      const asked = (page) => page.evaluate(() => !!(window.hextable.state.prompt || window.hextable.state.pending));
      const idle = (page) => calm(page, 20000);
      const botsOff = () => dm.evaluate(() => { document.getElementById('dm-auto').checked = false; });
      const botsOn = () => dm.evaluate(() => { const c = document.getElementById('dm-auto'); c.checked = true; c.dispatchEvent(new Event('change')); });
      const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b && { x: b.x, y: b.y, w: b.width, h: b.height, iw: innerWidth, ih: innerHeight }; }, sel);

      await run.do('the DM hosts, the player joins and is let in', async () => {
        await open(dm, url);
        await dm.fill('#lobby-name', 'Smoke DM'); await dm.click('#lobby-host');
        await wait(dm, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await dm.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(pl, url);
        await pl.fill('#lobby-name', 'Smoke Player'); await pl.fill('#lobby-code', code); await pl.click('#lobby-join');
        await wait(pl, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(dm, 'dm');
        await dm.click('#dm-table button:has-text("Let in")');
        await waitShown(pl, '#lobby', false);
        await wait(pl, () => window.hextable.state?.entities?.fighter);
        await closeMenu(dm);
      });
      await run.do('the DM adds the invented oath and makes a paladin of it; the player plays her', async () => {
        await openTab(dm, 'dm'); await dm.click('#pm-open'); await waitShown(dm, '#pm');
        await dm.setInputFiles('#pm-file', { name: 'bell.json', mimeType: 'application/json', buffer: Buffer.from(PACK) }); await waitShown(dm, '#pm-review');
        await dm.click('#pm-go');
        await wait(pl, (p) => window.hextable.packs.built.includes(p), P, 10000);
        await dm.click('#pm .pm-close'); await waitShown(dm, '#pm', false); await closeMenu(dm);
        await dm.evaluate((sheet) => window.hextable.act({ type: 'setSheet', sheet }), SHEET);
        await wait(pl, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Sir Bell'), null, 10000);
        bell = await pl.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Sir Bell').id);
        await pl.locator('#party button:has-text("Play as Sir Bell")').click();
        await wait(dm, (b) => !!window.hextable.state.entities[b].owner, bell);
        await botsOff();
        const feat = await dm.evaluate((b) => window.hextable.state.entities[b].feats.some((f) => f.triggers?.opportunityHit), bell);
        if (!feat) throw new Error('the paladin has no Bell chase: the oath did not load');
      });

      // One try: a goblin beside Sir Bell, a fight, the goblin's turn, the goblin walks off, and Sir Bell's Opportunity Attack may hit. Returns the goblin's id when it did.
      let tries = 0;
      const attempt = async () => {
        tries++;
        if (await dm.evaluate(() => !!window.hextable.state.encounter)) { await dm.evaluate(() => window.hextable.act({ type: 'endEncounter' })); await wait(dm, () => !window.hextable.state.encounter, null, 10000); await idle(dm); }
        const found = await dm.evaluate(async (b) => {
          const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
          const S = window.hextable.state, G = gridOf(S.map), me = S.entities[b], DM = { role: 'dm', userId: 'dm' };
          const why = [];
          for (const h of G.range(me.pos, 1)) {
            if (G.dist(me.pos, h) !== 1) continue;
            const c = structuredClone({ ...S, timeline: [] });
            const r = apply(c, { type: 'spawn', monster: 'goblin-warrior', at: h, name: 'Gob' }, DM);
            if (!r.ok) { why.push(`spawn: ${r.error}`); continue; }
            const gid = r.events.find((x) => x.type === 'spawned').id;
            // where it can walk to that is away from Sir Bell (not beside her): asked of the engine in a fight begun on the copy
            // The spawn itself may have begun the fight on the copy (a foe appearing beside a party member with autoEngage on): then there is nothing to start.
            if (S.encounter || !c.encounter) { const f = apply(c, { type: 'startEncounter', center: me.pos, radius: 6 }, DM); if (!f.ok) { why.push(`fight: ${f.error} (the table had one: ${!!S.encounter})`); continue; } }
            for (let i = 0; i < 30 && c.encounter.order[c.encounter.turn].id !== gid; i++) apply(c, { type: 'endTurn', actor: c.encounter.order[c.encounter.turn].id }, DM);
            for (const d of G.range(h, 3)) {
              if (G.dist(me.pos, d) < 2) continue;
              const k = structuredClone(c);
              const m = apply(k, { type: 'move', actor: gid, to: d }, DM); if (m.ok) return { at: h, to: d }; why.push(`move: ${m.error}`);
            }
          }
          return { why: [...new Set(why)].slice(0, 6) };
        }, bell);
        if (!found.at) throw new Error(`no hex beside Sir Bell takes a goblin that can walk away from her on this map: ${found.why.join(' | ')}`);
        await dm.evaluate(([at]) => window.hextable.act({ type: 'spawn', monster: 'goblin-warrior', at, name: 'Gob' }), [found.at]);
        await wait(dm, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Gob' && e.hp > 0));
        const gob = await dm.evaluate(() => Object.values(window.hextable.state.entities).filter((e) => e.name === 'Gob' && e.hp > 0).pop().id);
        await dm.evaluate(([c]) => window.hextable.act({ type: 'startEncounter', center: c, radius: 6 }), [await dm.evaluate((b) => window.hextable.state.entities[b].pos, bell)]);
        await wait(dm, () => !!window.hextable.state.encounter);
        await idle(dm);
        for (let i = 0; i < 40 && (await turnOf(dm)) !== gob; i++) { await dm.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), await turnOf(dm)); await idle(dm); }
        if ((await turnOf(dm)) !== gob) throw new Error('the goblin\'s turn did not come');
        // the goblin is a fresh foe each try: it is not the DM's page that sees the allowance when it hits, the table does; read the flag on the DM's page
        await dm.evaluate(([g, to]) => window.hextable.act({ type: 'move', actor: g, to }), [gob, found.to]);
        await idle(dm); await idle(pl);
        return (await flag(dm)) > 0 ? gob : null;
      };
      const arrive = async () => {
        let gob = null;
        for (let i = 0; i < 10 && !gob; i++) gob = await attempt();
        if (!gob) throw new Error(`Sir Bell's Opportunity Attack did not hit in ${tries} tries`);
        return gob;
      };

      // The place beside Sir Bell to tap, as the screen has it now (the camera may still be moving: ask again just before a tap).
      const pickSpot = () => pl.evaluate(async (b) => {
          const { reachOf } = await import('./allowance.js'), { gridOf, parse } = await import('./shared/grid.js');
          const S = window.hextable.state, e = S.entities[b], G = gridOf(S.map);
          const keys = reachOf(S, e);
          const at = keys.map(parse);            // the places with their heights: a tap is aimed at the surface, not at the height Sir Bell stands at
          const hex = at.filter((h) => G.dist(e.pos, h) === 1).map((h) => ({ h, p: window.hextable.R.screenOf({ q: h.q, r: h.r, z: h.z }) })).find((x) => x.p && x.p.x > 5 && x.p.y > 120 && x.p.x < innerWidth - 5 && x.p.y < innerHeight - 220);
          return hex ? { q: hex.h.q, r: hex.h.r, x: hex.p.x, y: hex.p.y, n: keys.length } : { n: keys.length };
      }, bell);

      let gob;
      await run.do('the goblin walks away, the Opportunity Attack hits: the player is offered the movement at once and Sir Bell is selected', async () => {
        gob = await arrive();
        await wait(pl, () => !document.getElementById('hint').hidden && /Move up to/.test(document.getElementById('hint-go').textContent), null, 8000);
        const h = await hintOf(pl);
        if (!/Sir Bell may move up to 15 ft, provoking no Opportunity Attacks\./.test(h)) throw new Error(`the offer: ${h}`);
        const go = await text(pl, '#hint-go'), no = await text(pl, '#hint-cancel');
        if (go !== 'Move up to 15 ft (Bell chase)' || no !== "Don't move") throw new Error(`the buttons: ${go} | ${no}`);
        for (const sel of ['#hint-go', '#hint-cancel']) { const b = await box(pl, sel); if (b.h < 43.5 || b.x < 0 || b.x + b.w > b.iw) throw new Error(`${sel} is ${JSON.stringify(b)}`); }
        const hb = await box(pl, '#hint'); if (hb.x < 0 || hb.x + hb.w > hb.iw + 1) throw new Error(`the bar overflows: ${JSON.stringify(hb)}`);
        await shot(pl, `allowance-offer-player-${tag}`);
      });
      await run.do('the DM\'s auto-play is switched on and waits: the goblin keeps its turn, and the DM sees who is waited for with a button to give it up', async () => {
        const spent0 = await dm.evaluate(() => JSON.stringify(window.hextable.state.encounter.budget));
        await botsOn();
        await dm.evaluate((g) => window.hextable.select(g), gob);                      // the DM looks at the goblin, not at Sir Bell: the waiting line, not the offer
        await sleep(5000);                                                           // the auto-play acts 0.8 s after the picture is still, and again after each step: several steps fit in this
        if ((await turnOf(dm)) !== gob || (await dm.evaluate(() => JSON.stringify(window.hextable.state.encounter.budget))) !== spent0) throw new Error('the auto-play played the goblin\'s turn while Sir Bell held movement');
        if ((await flag(dm)) !== 15) throw new Error(`the allowance is ${await flag(dm)}`);
        await wait(dm, () => /Waiting for Sir Bell to move \(15 ft\)/.test(document.getElementById('hint').textContent), null, 5000);
        if ((await text(dm, '#hint-go')) !== 'Give it up' || !(await shown(dm, '#hint-go'))) throw new Error(`the DM's button: ${await text(dm, '#hint-go')}`);
        if (await shown(dm, '#hint-cancel')) throw new Error('the DM has a Cancel with nothing to cancel');
        await shot(dm, `allowance-waiting-dm-${tag}`);
        await dm.evaluate((b) => window.hextable.select(b), bell);                     // the DM looks at Sir Bell: the offer itself, saying the foes wait
        await wait(dm, () => /Sir Bell may move up to 15 ft.*The foes wait for this\./.test(document.getElementById('hint').textContent), null, 5000);
        await shot(dm, `allowance-offer-dm-${tag}`);
        await dm.evaluate((g) => window.hextable.select(g), gob);
      });
      await run.do('a tap on the map before Move spends nothing and says why; Move arms it and the reach is shaded', async () => {
        const pos0 = await pl.evaluate((b) => window.hextable.state.entities[b].pos, bell);
        await settle(pl, bell);
        const spot = await pickSpot();
        if (!spot.n) throw new Error('the reach is empty');
        if (spot.x === undefined) throw new Error(`no place beside Sir Bell to tap on screen (reach ${spot.n})`);
        if (!(await onCanvas(pl, spot.x, spot.y))) throw new Error(`the place is under something: ${JSON.stringify(spot)}`);
        await tapAt(pl, touch, spot.x, spot.y);
        await sleep(400);
        const t = await text(pl, '#toast');
        await raw(pl, `allowance-tap-before-move-player-${tag}`);
        if (!/Press Move up to 15 ft first, or Don't move\./.test(t)) throw new Error(`no word before Move: ${t}`);
        if (JSON.stringify(await pl.evaluate((b) => window.hextable.state.entities[b].pos, bell)) !== JSON.stringify(pos0) || (await flag(pl)) !== 15) throw new Error('the tap spent the movement');
        await (touch ? pl.locator('#hint-go').tap() : pl.click('#hint-go'));
        await wait(pl, () => /tap a shaded place to move, up to 15 ft/.test(document.getElementById('hint').textContent));
        if (await shown(pl, '#hint-go')) throw new Error('Move stays on the bar once pressed');
        if (JSON.stringify(await pl.evaluate(() => window.hextable.mode)) !== '{"kind":"owed"}') throw new Error('the Move button did not arm');
        const shaded = await pl.evaluate(() => window.hextable.R.hl?.move?.length ?? -1);
        if (shaded < 3) throw new Error(`${shaded} places are shaded for the movement`);
        await shot(pl, `allowance-armed-player-${tag}`);
        spot.pos0 = pos0; run.spot = spot;
      });
      await run.do('a tap on a shaded place moves Sir Bell and provokes nothing; the DM\'s auto-play still waits for what is left', async () => {
        await settle(pl, bell);
        const { x, y, q, r } = await pickSpot();
        if (q !== run.spot.q || r !== run.spot.r) throw new Error('the place beside Sir Bell changed');
        await tapAt(pl, touch, x, y);
        await wait(dm, (b) => window.hextable.state.encounter.flags['rmove:' + b] < 15, bell, 8000).catch(async () => { throw new Error(`flag ${await flag(dm)}, at ${JSON.stringify(await dm.evaluate((b) => window.hextable.state.entities[b].pos, bell))}, wanted ${q},${r}, toast: ${await text(pl, '#toast')}, mode ${JSON.stringify(await pl.evaluate(() => window.hextable.mode))}`); });
        await idle(pl); await idle(dm);
        const pos = await dm.evaluate((b) => window.hextable.state.entities[b].pos, bell);
        if (pos.q !== q || pos.r !== r) throw new Error(`Sir Bell is at ${JSON.stringify(pos)}, not ${q},${r}`);
        await sleep(2000);
        const left = await flag(dm);                                                  // a hex may cost more than 5 ft (rough ground): what the engine kept is what is offered
        if (!(left > 0 && left < 15) || (await turnOf(dm)) !== gob) throw new Error(`the auto-play went on with ${left} ft of movement left`);
        await wait(pl, (n) => document.getElementById('hint').textContent.includes(`up to ${n} ft`), left, 5000);
        await wait(dm, (n) => document.getElementById('hint').textContent.includes(`Waiting for Sir Bell to move (${n} ft)`), left, 5000);
        await shot(pl, `allowance-left-player-${tag}`);
      });
      await run.do('Don\'t move gives the rest up: the offer goes and the foes go on by themselves', async () => {
        await (touch ? pl.locator('#hint-cancel').tap() : pl.click('#hint-cancel'));
        await wait(dm, (b) => !window.hextable.state.encounter.flags['rmove:' + b], bell, 8000);
        await wait(pl, () => !/move up to/.test(document.getElementById('hint').textContent), null, 5000);
        await wait(dm, (g) => { const S = window.hextable.state; return !S.encounter || S.encounter.order[S.encounter.turn].id !== g; }, gob, 20000);
        await idle(dm); await idle(pl);
      });
      await run.do('the DM\'s button gives it up for the player, and the foes go on', async () => {
        await botsOff();
        gob = await arrive();
        await wait(pl, () => /Move up to/.test(document.getElementById('hint-go').textContent), null, 8000);
        await botsOn();
        await dm.evaluate((g) => window.hextable.select(g), gob);
        await wait(dm, () => /Waiting for Sir Bell to move/.test(document.getElementById('hint').textContent), null, 5000);
        const b = await box(dm, '#hint-go'); if (b.h < 43.5 || b.x < 0 || b.x + b.w > b.iw) throw new Error(`the DM's button is ${JSON.stringify(b)}`);
        await (hostOpts.hasTouch ? dm.locator('#hint-go').tap() : dm.click('#hint-go'));
        await wait(pl, (g) => !window.hextable.state.encounter.flags['rmove:' + Object.values(window.hextable.state.entities).find((e) => e.name === 'Sir Bell').id], gob, 8000);
        await wait(pl, () => !/move up to/.test(document.getElementById('hint').textContent), null, 5000);
        await wait(dm, (g) => { const S = window.hextable.state; return !S.encounter || S.encounter.order[S.encounter.turn].id !== g; }, gob, 20000);
        await shot(dm, `allowance-after-dm-${tag}`);
      });
      await run.do('with the auto-play off the DM sees no waiting line, and a foe\'s own turn is not held up when nobody holds anything', async () => {
        await botsOff();
        if (/Waiting for/.test(await hintOf(dm))) throw new Error('a waiting line with no auto-play');
        if (await asked(pl)) throw new Error('a question is open');
      });
    } finally { await hostCtx.close(); await playerCtx.close(); }
  });
}

export default async function (browser, url) {
  await table(browser, url, 'allowance: a DM at desktop size, a phone player with touch', DESKTOP, PHONE, 'dm-desktop');
  await table(browser, url, 'allowance: a DM on a phone with touch, a desktop player', PHONE, DESKTOP, 'dm-phone');
}
