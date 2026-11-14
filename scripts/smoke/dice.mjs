import { join } from 'node:path';
import { sleep, scenario, wait, state, shown, waitShown, open, closeMenu, openTab, diceDuel } from './lib.mjs';

// ---------- dice on the screen (PR #117) ----------
// A DM (desktop) and a player (`opts`: desktop or phone). The player's dice are thrown in the table's default
// way: an attack and its damage, a save the DM's spell makes them roll, a skill check. For each, the dice shown
// on the player's screen are the faces in the events that player was sent, and add up to their number. Then the
// player is audited: no die from a roll the player was not told the number of (a monster's attack, save or
// initiative; damage a monster rolled that was changed on the way). Under `throw`, the tray sits clear of
// the action bar, and when nothing is in the air the dice canvas is gone and the action bar takes the touch.
async function dice(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctx = await browser.newContext(opts);
    try {
      const host = await hostCtx.newPage(), me = await ctx.newPage();
      run.watch(host, ' (host)'); run.watch(me, ' (player)');
      const touch = !!opts.hasTouch;
      let pc, foe;
      const idle = () => Promise.all([wait(host, () => window.hextable.waiting === 0, null, 20000), wait(me, () => window.hextable.waiting === 0, null, 20000)]);
      // What each page was sent, read off its WebSocket (a player's state has no timeline of its own).
      const got = { host: [], me: [], other: [] };
      const tap = (page, key) => page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m.t === 'update' && m.events) got[key].push(...m.events); else if (m.t !== 'update' && m.t !== 'lobby') got.other = [...(got.other ?? []).slice(-4), String(f.payload).slice(0, 200)]; } catch { /* not JSON */ } }));
      tap(host, 'host'); tap(me, 'me');
      // The faces of every group thrown on the player's page against the events that player was sent. Returns what is wrong.
      const audit = async (page) => {
        const S = await page.evaluate(() => ({ ents: Object.fromEntries(Object.values(window.hextable.state.entities).map((e) => [e.id, e.side])), thrown: window.hextable.thrown }));
        const bad = [], mine = (id) => S.ents[id] === 'party', events = got.me;
        const sum = (e) => (e.dice ?? []).filter((d) => !d.drop).reduce((a, d) => a + (d.neg ? -d.value : d.value), 0) + (e.bonus ?? 0);
        for (const e of events) {
          if (e.type === 'encounterStart' && e.order.some((o) => o.dice && !mine(o.id))) bad.push('a monster\'s initiative came with dice');
          if (!e.dice) continue;
          const n = ['damage', 'heal', 'tempHp'].includes(e.type) ? (e.rolled ?? e.amount) : e.total ?? e.roll ?? e.init;
          if (sum(e) !== n) bad.push(`${e.type}: faces make ${sum(e)}, the event says ${n}`);
          if (['attack', 'save', 'check', 'concentration', 'deathSave'].includes(e.type) && !mine(e.actor ?? e.id)) bad.push(`${e.type} by ${e.actor ?? e.id} came with dice to a player`);
        }
        for (const g of S.thrown) {
          if (g.type === 'initiative' || !g.dice?.length || /more rolls/.test(g.label)) continue;
          if (!events.some((e) => e.dice && JSON.stringify(e.dice) === JSON.stringify(g.dice))) bad.push(`shown dice with no event: ${g.label} ${JSON.stringify(g.dice)}`);
        }
        return bad;
      };
      const groups = (page, type) => page.evaluate((ty) => window.hextable.thrown.filter((g) => g.type === ty).length, type);

      await run.do('host, join, let in, claim a character', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Dice DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6, null, 30000);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(me, url);
        await me.fill('#lobby-name', 'Dice Player'); await me.fill('#lobby-code', code); await me.click('#lobby-join');
        await wait(me, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent), null, 30000);
        await openTab(host, 'dm'); await waitShown(host, '#dm');
        await host.click('#dm-table button:has-text("Let in")');
        await wait(me, () => window.hextable.state?.entities?.fighter, null, 30000);
        await closeMenu(host);
        const b = me.locator('#party button:has-text("Play as")').first();
        const name = (await b.textContent()).replace('Play as ', '').trim();
        pc = await me.evaluate((n) => Object.values(window.hextable.state.entities).find((e) => e.name === n).id, name);
        await (touch ? b.tap() : b.click());
        await wait(host, (i) => !!window.hextable.state.entities[i].owner, pc);
      });

      await run.do('a fight; the player attacks: the d20 and the damage are shown and match the events', async () => {
        ({ foe } = await diceDuel(host, me, pc));
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }));
        await wait(me, () => window.hextable.state.settings.diceThrow === 'auto');
        const n = await me.evaluate(() => window.hextable.thrown.length);
        // Hit for certain: the faces are the engine's, so make the hit sure by making the foe easy to hit.
        await host.evaluate((f) => { window.hextable.act({ type: 'setHp', actor: f, hp: window.hextable.state.entities[f].maxHp }); }, foe);
        for (let i = 0; i < 8 && !(await me.evaluate((k) => window.hextable.thrown.slice(k).some((g) => g.type === 'attack'), n)); i++) {
          await me.evaluate(([p, f]) => { const S = window.hextable.state, e = S.entities[p]; if (S.encounter?.order[S.encounter.turn]?.id !== p) return; window.hextable.act({ type: 'attack', actor: p, target: f, attack: e.attacks.find((a) => a.type === 'melee').id }); }, [pc, foe]);
          await sleep(800); await idle();
          if (!(await me.evaluate((k) => window.hextable.thrown.slice(k).some((g) => g.type === 'attack'), n))) {
            const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
            await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
          }
        }
        if (!(await groups(me, 'attack'))) throw new Error('the player was shown no attack roll');
        const atk = await me.evaluate(() => window.hextable.thrown.find((g) => g.type === 'attack'));
        if (!atk.dice.some((d) => d.sides === 20)) throw new Error('an attack roll without a d20');
        const bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
        const hit = got.me.some((e) => e.type === 'attack' && e.hit && e.actor === pc);
        if (hit && !(await groups(me, 'damage'))) throw new Error('a hit, and no damage dice shown');
        if (!got.me.some((e) => e.type === 'attack' && e.dice)) throw new Error('the player\'s own attack came with no dice');
        // #236: every throw has a title that says who and what for, from the event; the renderer's camera is readable for the dice to lie in its plane.
        const pcName = await me.evaluate((p) => window.hextable.state.entities[p].name, pc);
        if (!atk.label.startsWith(`${pcName}: `) || !/ attack$/.test(atk.label)) throw new Error(`the attack's title is "${atk.label}"`);
        const dmg = await me.evaluate(() => window.hextable.thrown.find((g) => g.type === 'damage'));
        if (dmg && !/ damage$/.test(dmg.label)) throw new Error(`the damage's title is "${dmg.label}"`);
        const cam = await me.evaluate(() => window.hextable.R.cameraAngles());
        if (!(Number.isFinite(cam.yaw) && cam.pitch >= 0.45 && cam.pitch <= 1.45)) throw new Error(`the camera reads ${JSON.stringify(cam)}`);
      });

      await run.do('a monster\'s save carries no dice to the player (the DM sees them); the player\'s own skill check is shown and matches', async () => {
        const sentAfter = async (page, k, type) => { for (let i = 0; i < 150; i++) { if (got[page].slice(k).some((e) => e.type === type && e.dice)) return true; await sleep(100); } return false; };
        // Odessa joins the fight beside a goblin still on its feet (the player's blow may have killed the first); on her turn the DM has her cast Sacred Flame at it.
        const target = await host.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.dead && !e.hidden)?.id);
        if (!target) throw new Error('no goblin left standing to cast at');
        await host.evaluate(async (f) => {
          const h = window.hextable, at = h.state.entities[f].pos;
          for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
            h.act({ type: 'place', actor: 'cleric', to: { q: at.q + dq, r: at.r + dr } });
            await new Promise((r) => setTimeout(r, 300));
            const c = h.state.entities.cleric.pos;
            if (Math.max(Math.abs(c.q - at.q), Math.abs(c.r - at.r), Math.abs(c.q + c.r - at.q - at.r)) === 1) break;
          }
        }, target);
        await idle();
        for (let i = 0; i < 30; i++) {
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id; });
          if (cur === 'cleric') break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur); await idle();
        }
        const k = got.host.length, km = got.me.length;
        await host.evaluate((f) => window.hextable.act({ type: 'cast', actor: 'cleric', spell: 'sacred-flame', target: f }), target);
        if (!(await sentAfter('host', k, 'save'))) throw new Error(`the DM was sent no save with dice; toast "${await host.evaluate(() => document.getElementById('toast')?.textContent ?? '')}"`);
        await idle();
        if (got.me.slice(km).some((e) => e.type === 'save' && e.dice)) throw new Error('a monster\'s save came with dice to the player');
        if (!got.me.slice(km).some((e) => e.type === 'save')) throw new Error('the player was told nothing of the save');
        let bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
        await host.evaluate(() => window.hextable.act({ type: 'endEncounter' })); await idle();
        const n = got.me.length;
        await me.evaluate((p) => window.hextable.act({ type: 'check', actor: p, skill: 'athletics' }), pc);
        if (!(await sentAfter('me', n, 'check'))) throw new Error('the player was sent no check with its dice');
        await idle();
        if (!(await groups(me, 'check'))) throw new Error('the check was not shown as dice');
        const chk = await me.evaluate(() => window.hextable.thrown.find((g) => g.type === 'check'));
        if (!/^[^:]+: Athletics check$/.test(chk.label)) throw new Error(`the check's title is "${chk.label}"`);
        bad = await audit(me); if (bad.length) throw new Error(bad.join('; '));
      });

      await run.do('nothing is left on the screen: no dice canvas, and the action panel takes a touch', async () => {
        await idle();
        if (await shown(me, '#dice')) throw new Error('the dice canvas is still over the screen with nothing in the air');
        await me.click(`#party button:has-text("${await me.evaluate((p) => window.hextable.state.entities[p].name, pc)}")`).catch(() => {});
        const r = await me.evaluate(() => {
          const bar = document.getElementById('ap-body'), b = bar && [...bar.querySelectorAll('[data-row], #actions button')].find((x) => x.getClientRects().length);
          if (!b) return { none: true };
          const q = b.getBoundingClientRect(), top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return { ok: !top || b.contains(top) || top === b, over: top && (top.id || top.className || top.tagName) };
        });
        if (!r.none && !r.ok) throw new Error(`the action panel is covered by ${r.over}`);
      });

      await run.do('under throw the tray is on screen and clear of the action panel', async () => {
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'throw' }));
        await wait(me, () => window.hextable.state.settings.diceThrow === 'throw');
        await me.evaluate((p) => window.hextable.act({ type: 'check', actor: p, skill: 'athletics' }), pc);
        await waitShown(me, '#dice-tray');
        const r = await me.evaluate(() => {
          const t = document.getElementById('dice-tray').getBoundingClientRect(), b = document.getElementById('ap-body').getBoundingClientRect();
          return { t: [t.left, t.top, t.right, t.bottom], b: [b.left, b.top, b.right, b.bottom], w: innerWidth, h: innerHeight, shown: b.height > 0 };
        });
        if (r.t[0] < 0 || r.t[2] > r.w || r.t[1] < 0 || r.t[3] > r.h) throw new Error(`the tray is off screen: ${JSON.stringify(r)}`);
        if (r.shown && r.t[3] > r.b[1] && r.t[1] < r.b[3] && r.t[2] > r.b[0] && r.t[0] < r.b[2]) throw new Error(`the tray covers the action panel: ${JSON.stringify(r)}`);
        await (touch ? me.locator('#dice-tray .dt-throw').tap() : me.click('#dice-tray .dt-throw'));
        await wait(me, () => window.hextable.thrown.some((g) => g.type === 'check'), null, 15000);
        await me.evaluate(() => window.hextable.dice.skip());
        await idle();
        await host.evaluate(() => window.hextable.act({ type: 'setting', key: 'diceThrow', value: 'auto' }));
      });
    } finally { await ctx.close(); await hostCtx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=dice.
export default async function (browser, url) {
  await dice(browser, url, 'dice: a desktop player', { viewport: { width: 1280, height: 800 } });
  await dice(browser, url, 'dice: a phone player', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}
