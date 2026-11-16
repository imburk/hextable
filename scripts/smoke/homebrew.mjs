import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sleep, scenario, wait, shown, waitShown, open, closeMenu, openTab, calm, panelTab, rowOf, spawnNear, ROOT } from './lib.mjs';

// ---------- homebrew packs, the client side (issue #404, docs/specs/homebrew.md, row B7) ----------
// A DM hosts and a player joins on a second screen. The DM reads the sample pack in the pack manager and adds it, a bad file is refused locally and
// nothing is sent, the player sees a homebrew spell on the sheet and in the spell list, casts it and it resolves. A second pack holds a monster:
// the DM spawns it and the player's page (what it kept and every frame it was sent) holds nothing of its stats. Remove is refused while the monster
// is on the table, with where it is, and works once it is gone. A page that loses a pack while the state still names its spell shows a placeholder, not an error.
// The map: a hosted table's game takes the server's random seed, which this pass cannot set, so the DM loads the valley of a seed of the pass's own (SMOKE_SEED=<n>
// replays one; the seed is in the label of each run). Every spot a creature is put at, and the foe the player casts at, is asked of the engine on this map: it must
// take a spawn there, and for the foe, a cast from the player's character must be allowed (in range, in sight). Run twice: the DM at desktop size with a phone player, then the other way round.
const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const SAMPLE = readFileSync(new URL('../../packages/rules/test/fixtures/sample-pack.json', import.meta.url), 'utf8');
const BAD = JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'broken', name: 'Broken', version: 1, license: 'CC0', attribution: 'x' }, spells: [{ id: 'hb-broken-zap', name: 'Zap' }] });
const file = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
const MARK = 'SECRETSTATSMARK', CLAW = 'Zzyzx Claw';

async function monsterPack() {
  const { CONTENT } = await import(pathToFileURL(`${ROOT}packages/rules/src/content/index.js`));
  const m = structuredClone(CONTENT.monsters['goblin-warrior']);
  Object.assign(m, { id: 'hb-ember-folk-cinderling', name: 'Cinderling', source: 'homebrew:ember-folk', checked: false, text: MARK, hp: 77 });
  m.actions[0].name = CLAW;
  return JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'ember-folk', name: 'Ember Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for the smoke test.' }, monsters: [m] });
}

const KINDS_PACK = readFileSync(new URL('../../packages/rules/test/fixtures/reader-kinds-pack.json', import.meta.url), 'utf8');
const SEEN_NAMES = /Cinderjaw|Gloomwing|Hollow Reaver|Pack Tactics|Ember Memory/i;     // what only a monster's data would say
async function hoardPack() {                                              // a pack of kinds the reader cannot read yet, made from two SRD entries
  const { CONTENT } = await import(pathToFileURL(`${ROOT}packages/rules/src/content/index.js`));
  const feat = Object.assign(structuredClone(CONTENT.feats.alert), { id: 'hb-hoard-sharp-eyes', name: 'Sharp Eyes', source: 'homebrew:hoard', checked: false });
  const item = Object.assign(structuredClone(CONTENT.items.defender), { id: 'hb-hoard-bright-blade', name: 'Bright Blade', source: 'homebrew:hoard', checked: false });
  return JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'hoard', name: 'Hoard', version: 1, license: 'CC0', attribution: 'Written for the smoke test.' }, feats: [feat], items: [item] });
}

async function table(browser, url, label0, hostOpts, playerOpts, tag) {
  const seed = process.env.SMOKE_SEED ? Number(process.env.SMOKE_SEED) : Math.floor(Math.random() * 1e9);
  const label = `${label0} (seed ${seed})`;
  await scenario(label, async (run) => {
    const hostCtx = await browser.newContext(hostOpts), playerCtx = await browser.newContext(playerOpts);
    try {
      const host = await hostCtx.newPage(), player = await playerCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(player, ' (player)');
      const sent = [], got = [];
      let inject = null;                                                  // sends a frame to the player's page as if the table had
      await player.routeWebSocket(/\/ws$/, (ws) => { const up = ws.connectToServer(); ws.onMessage((m) => up.send(m)); up.onMessage((m) => ws.send(m)); inject = (text) => ws.send(text); });
      host.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
      player.on('websocket', (ws) => ws.on('framereceived', (f) => got.push(String(f.payload))));
      const packFrames = () => sent.filter((f) => /"t":"pack"/.test(f)).length;
      const tapHex = (hex, id) => player.evaluate(([h, i]) => window.hextable.R.onTap({ hex: h, id: i ?? null }), [hex, id ?? null]);
      let ven;
      // The hexes near Ven where the engine takes a spawn of `tpl` (and, with `cast`, lets Ven cast that spell at it), nearest first; the DM page's own engine and state.
      const spots = (tpl, cast) => host.evaluate(async ([v, t, sp]) => {
        const { apply } = await import('./shared/engine.js'), { gridOf } = await import('./shared/grid.js');
        const S = window.hextable.state, G = gridOf(S.map), c = S.entities[v], DM = { role: 'dm', userId: 'dm' }, out = [];
        for (const h of G.range(c.pos, 6)) {
          if (G.dist(c.pos, h) < 2) continue;
          const clone = structuredClone({ ...S, timeline: [] });
          const r = apply(clone, { type: 'spawn', monster: t, at: h }, DM);
          if (!r.ok) continue;
          if (sp && !apply(clone, { type: 'cast', actor: v, spell: sp, targets: [r.events.find((x) => x.type === 'spawned').id] }, DM).ok) continue;
          out.push(h);
        }
        return out.sort((a, b) => G.dist(c.pos, a) - G.dist(c.pos, b));
      }, [ven, tpl, cast ?? null]);
      const toast = () => host.evaluate(() => document.getElementById('toast')?.textContent ?? '');
      const openManager = async () => {
        if (!(await shown(host, '#pm'))) { await openTab(host, 'dm'); await host.click('#pm-open'); await waitShown(host, '#pm'); }
      };
      const closeManager = async () => { if (await shown(host, '#pm')) { await host.click('#pm .pm-close'); await waitShown(host, '#pm', false); } };
      const choose = async (name, text) => { await host.setInputFiles('#pm-file', file(name, text)); await waitShown(host, '#pm-review'); };

      await run.do('the DM hosts, the player joins and is let in', async () => {
        await open(host, url);
        await host.fill('#lobby-name', 'Smoke DM'); await host.click('#lobby-host');
        await wait(host, () => document.querySelector('#dm-table code')?.textContent.length === 6);
        const code = await host.evaluate(() => document.querySelector('#dm-table code').textContent);
        await open(player, url);
        await player.fill('#lobby-name', 'Smoke Player'); await player.fill('#lobby-code', code); await player.click('#lobby-join');
        await wait(player, () => /waiting for the DM/i.test(document.querySelector('#lobby-msg').textContent));
        await openTab(host, 'dm');
        await host.click('#dm-table button:has-text("Let in")');
        await waitShown(player, '#lobby', false);
        await wait(player, () => window.hextable.state?.entities?.fighter);
        await host.evaluate(() => { const h = window.hextable; h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); });
        await host.evaluate(async (n) => { const { newGame } = await import('./shared/scenario.js'); window.hextable.act({ type: 'loadMap', map: newGame(n).map }); }, seed);
        await sleep(600); await calm(host); await calm(player);
        await closeMenu(host);
      });
      await run.do('a bad file shows the checker\'s sentences and nothing is sent', async () => {
        await openManager();
        await choose('broken.json', BAD);
        const t = await host.textContent('#pm-review');
        if (!/checker refused/i.test(t) || !/nothing was sent/.test(t)) throw new Error(`review: ${t.slice(0, 300)}`);
        if (await host.$('#pm-go')) throw new Error('a refused file has an Add button');
        if (!(await host.$$eval('#pm-review .pm-refusal li', (l) => l.length))) throw new Error('no sentences listed');
        await sleep(300);
        if (packFrames()) throw new Error('a pack message was sent for a refused file');
        await shot(host, `homebrew-refused-${tag}`);
      });
      await run.do('a file past the size limit is refused without being read', async () => {
        await choose('huge.json', ' '.repeat(600 * 1024));
        const t = await host.textContent('#pm-review');
        if (!/not read/.test(t)) throw new Error(t.slice(0, 200));
        if (packFrames()) throw new Error('sent');
      });
      await run.do('the sample pack is read back: a reading and a tier for each entry, counts, the licence', async () => {
        await choose('sample-pack.json', SAMPLE);
        const n = await host.$$eval('#pm-review .pm-entry[data-entry]', (l) => l.length);
        if (n !== 17) throw new Error(`${n} entries`);
        const empty = await host.$$eval('#pm-review .pm-entry[data-entry]', (l) => l.filter((d) => d.querySelectorAll('.pm-line').length < 3 || !d.querySelector('.pm-tier')).length);
        if (empty) throw new Error(`${empty} entries without a reading`);
        const t = await host.textContent('#pm-review');
        if (!/16 auto, 0 assist, 1 manual/.test(t) || !/Licence: CC0, by the author/.test(t) || !/Attribution: Written for the Hextable tests/.test(t)) throw new Error(t.slice(0, 400));
        if (!/Add to this table/.test(await host.textContent('#pm-go'))) throw new Error('no Add');
        const vh = await host.evaluate(() => innerHeight), gb = await (await host.$('#pm-go')).boundingBox();
        if (gb.y + gb.height > vh) { await host.evaluate(() => document.querySelector('#pm-review').scrollIntoView()); }
        const gb2 = await (await host.$('#pm-go')).boundingBox();
        if (gb2.y < 0 || gb2.y + gb2.height > vh) throw new Error(`Add is not on the screen with the review's top (y ${gb2.y}, screen ${vh})`);
        await host.evaluate(() => document.querySelector('#pm-review .pm-entry[data-entry]').open = true);
        await shot(host, `homebrew-review-${tag}`);
      });
      await run.do('Try it on a spell in the review says what a cast did', async () => {
        await host.evaluate(() => { const d = document.querySelector('#pm-review .pm-entry[data-entry]'); d.open = true; d.querySelector('.pm-try-btn').click(); });
        await wait(host, () => /damage|hit|missed|target/i.test(document.querySelector('#pm-review .pm-try')?.textContent ?? ''));
      });
      await run.do('Add to this table: the pack is listed, and the player holds the spells', async () => {
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="sample"]');
        await wait(player, () => window.hextable.packs.built.includes('sample'));
        const l = await host.textContent('.pm-pack[data-pack="sample"]');
        if (!/17 spells/.test(l)) throw new Error(l);
        await shot(host, `homebrew-manager-${tag}`);
      });
      await run.do('the same file again says the table has it; a lower version is no update', async () => {
        await choose('again.json', SAMPLE);
        if (await host.$('#pm-go')) throw new Error('Add offered for a pack the table has');
        const t = await host.textContent('#pm-review .pm-why');
        if (!/already has exactly this pack/.test(t)) throw new Error(t);
        await host.click('#pm-review .pm-cancel');
      });
      await run.do('Try it on an installed spell, with the DM page\'s overlay out and back in', async () => {
        await host.evaluate(() => { const d = document.querySelector('.pm-pack[data-pack="sample"] .pm-entries'); d.open = true; const e = d.querySelector('.pm-entry'); e.open = true; e.querySelector('.pm-try-btn').click(); });
        await wait(host, () => /damage|hit|missed|target/i.test(document.querySelector('.pm-pack[data-pack="sample"] .pm-try')?.textContent ?? ''));
        if (!(await host.evaluate(() => !!window.hextable.packs.installed))) throw new Error('the overlay was not put back');
        await closeManager();
      });
      await run.do('the DM gives a character the spell with the sheet action, and the player plays it', async () => {
        await host.evaluate(async () => {
          const h = window.hextable;
          h.act({ type: 'setSheet', sheet: { name: 'Ven', class: 'wizard', level: 2, abilities: { str: 10, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], weapons: ['quarterstaff'], spells: ['hb-sample-ember-dart', 'fire-bolt', 'magic-missile', 'hb-sample-jarring-note'] } });
        });
        await wait(player, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'), null, 10000).catch(async () => { throw new Error(`no Ven: ${await host.evaluate(() => document.getElementById('toast')?.textContent)}`); });
        ven = await player.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Ven').id);
        await player.locator('#party button:has-text("Play as Ven")').click();
        await wait(host, (v) => !!window.hextable.state.entities[v].owner, ven);
        await calm(player);
      });
      await run.do('on the sheet the spell shows with its pack, and its reading opens', async () => {
        await player.evaluate(() => window.hextable.drawer.open('sheet'));
        await waitShown(player, '#sheet-body');
        const row = await player.textContent('#sheet-body tr:has(.hb-read)');
        if (!/Ember Dart/.test(row) || !/homebrew: Sample Pack/.test(row)) throw new Error(row);
        const bb = await (await player.$('#sheet-body .hb-read')).boundingBox();
        if (bb.height < 43.5) throw new Error(`the Reading button is ${bb.height}px tall`);
        await player.click('#sheet-body .hb-read >> nth=0');
        await waitShown(player, '#pm');
        const t = await player.textContent('#pm');
        if (!/1d10 fire damage/.test(t) || !/Tier/.test(t)) throw new Error(t.slice(0, 300));
        if (await player.$('#pm #pm-file')) throw new Error('the player was shown the manager');
        await shot(player, `homebrew-reading-${tag}`);
        await player.click('#pm .pm-close');
        await shot(player, `homebrew-sheet-${tag}`);
        await closeMenu(player);
      });
      await run.do('a pack the page loses while the state names its spell: a placeholder on the sheet, no page error, and it comes back', async () => {
        if (!inject) throw new Error('the player\'s socket is not routed');
        const lastPacks = [...got].reverse().find((f) => /"t":"packs"/.test(f));
        if (!lastPacks) throw new Error('the player was sent no packs message');
        await player.evaluate(() => window.hextable.drawer.open('sheet'));
        await waitShown(player, '#sheet-body');
        inject(JSON.stringify({ t: 'packs', packs: [] }));
        await wait(player, () => !!document.querySelector('#sheet-body .hb-missing'));
        const t = await player.textContent('#sheet-body .hb-missing');
        if (!/homebrew spell this page does not have yet/.test(t) || !/hb-sample-ember-dart/.test(t)) throw new Error(t);
        await shot(player, `homebrew-missing-${tag}`);
        inject(lastPacks);                                                   // the list is back: the page asks for the data again and redraws
        await wait(player, () => !document.querySelector('#sheet-body .hb-missing') && !!document.querySelector('#sheet-body .hb-read'), null, 10000);
        await closeMenu(player);
      });
      await run.do('in the spell list the homebrew spells are rows', async () => {
        await panelTab(player, 'spells');
        await player.waitForSelector(rowOf('spells', 'Ember Dart'), { state: 'visible', timeout: 8000 });
        await player.waitForSelector(rowOf('spells', 'Jarring Note'), { state: 'visible', timeout: 3000 });
        await shot(player, `homebrew-spells-${tag}`);
      });
      let foe;
      await run.do('the player casts it at a foe and it resolves', async () => {
        const at = (await spots('goblin-warrior', 'hb-sample-ember-dart'))[0];
        if (!at) throw new Error('no hex on this map where a foe can stand and Ven can cast at it');
        await host.evaluate((hex) => window.hextable.act({ type: 'spawn', monster: 'goblin-warrior', at: hex, name: 'Target' }), at);
        await wait(player, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Target')).catch(async () => { throw new Error(`the foe was not put at ${JSON.stringify(at)}: ${await toast()}`); });
        const target = await player.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Target'));
        foe = target.id;
        await calm(player);
        await host.evaluate(([f]) => { const h = window.hextable; if (!h.state.encounter) h.act({ type: 'startEncounter', center: h.state.entities[f].pos, radius: 40 }); }, [foe]);
        await wait(host, () => window.hextable.state.encounter);
        for (let i = 0; i < 24; i++) {                                     // the turns go by until it is Ven's
          const cur = await host.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
          if (cur === ven) break;
          await host.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await calm(host);
        }
        await calm(player);
        const where = () => host.evaluate((v) => { const S = window.hextable.state; return `turn ${S.encounter?.order[S.encounter.turn]?.id}, Ven ${v}, mode ${JSON.stringify(window.hextable.mode)}`; }, ven);
        await wait(host, (v) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === v; }, ven).catch(async () => { throw new Error(`it never became Ven's turn: ${await where()}`); });
        await sleep(400); await calm(player);
        await panelTab(player, 'spells').catch(async (e) => { throw new Error(`no spells tab: ${await where()}: ${e.message.split('\n')[0]}`); });
        await player.click(rowOf('spells', 'Ember Dart'));
        await wait(player, () => window.hextable.mode.kind === 'spell').catch(async () => { throw new Error(`no spell mode: ${await where()}`); });
        await tapHex(target.pos, foe);
        await calm(player);
        await openTab(player, 'log');
        await wait(player, () => /Ember Dart/.test(document.querySelector('#log-list')?.textContent ?? ''), null, 10000).catch(async () => {
          throw new Error(`mode ${JSON.stringify(await player.evaluate(() => window.hextable.mode))}; log ${(await player.evaluate(() => document.querySelector('#log-list')?.textContent))?.slice(-300)}`);
        });
        const log = await player.evaluate(() => [...document.querySelectorAll('#log-list .lg-line')].map((l) => l.textContent).join('\n'));
        if (!/Ember Dart/.test(log) || !/Ven attacks Target( behind [a-z ]+)? with Ember Dart: .*(Miss|Hit|damage)/i.test(log)) throw new Error(`the cast did nothing: ${log.slice(-300)}`);
        await closeMenu(player);
      });
      await run.do('a pack with a monster: the DM adds it and spawns the monster', async () => {
        await host.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
        await wait(host, () => !window.hextable.state.encounter);
        await openManager();
        await choose('ember-folk.json', await monsterPack());
        if (!/1 monster/.test(await host.textContent('#pm-review'))) throw new Error('the monster is not counted');
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="ember-folk"]');
        await closeManager();
        await openTab(host, 'dm');
        await wait(host, () => !!document.querySelector('#dm-spawn [data-monster="hb-ember-folk-cinderling"]'));
        await host.click('#dm-spawn [data-monster="hb-ember-folk-cinderling"]');
        await wait(host, () => window.hextable.mode.kind === 'spawn');
        const at = (await spots('hb-ember-folk-cinderling'))[0];
        if (!at) throw new Error('no hex on this map where the monster can stand');
        await host.evaluate((hex) => window.hextable.R.onTap({ hex, id: null }), at);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.tpl === 'hb-ember-folk-cinderling')).catch(async () => { throw new Error(`no spawn at ${JSON.stringify(at)}: ${await toast()} ${JSON.stringify(await host.evaluate(() => window.hextable.mode))}`); });
      });
      await run.do('the player\'s page holds nothing of the monster: not in what it kept, not in a frame, not in the state', async () => {
        await sleep(500); await calm(player);
        const kept = JSON.stringify(await player.evaluate(() => window.hextable.packs));
        const frames = got.join('\n'), st = await player.evaluate(() => JSON.stringify(window.hextable.state));
        for (const [what, text] of [['what the page kept', kept], ['a frame it received', frames], ['its state', st]]) {
          if (new RegExp(`${MARK}|${CLAW}|Zzyzx`, 'i').test(text)) throw new Error(`${what} has the monster's stats`);
        }
        if (/"monsters":\s*\[\s*\{/.test(frames)) throw new Error('a frame carried a monster list');
        if (await player.evaluate(() => !!document.querySelector('#dm-spawn [data-monster^="hb-"]'))) throw new Error('the player has the DM\'s monster list');
        if (!/ember-folk/.test(kept)) throw new Error('the page did not get the pack list');
      });
      await run.do('Remove is refused while the monster is on the table, and says where', async () => {
        await openManager();
        const card = '.pm-pack[data-pack="ember-folk"]';
        await host.click(`${card} .pm-remove`); await host.click(`${card} .pm-remove`);
        await wait(host, () => !!document.querySelector('#pm .pm-refusal'));
        const t = await host.textContent('#pm .pm-refusal');
        if (!/in use/i.test(t) || !/hb-ember-folk-cinderling/.test(t)) throw new Error(t.slice(0, 300));
        if (!(await shown(host, card))) throw new Error('the pack went anyway');
        await shot(host, `homebrew-blocked-${tag}`);
      });
      await run.do('once the monster is gone, Remove works, and the monster button and the player\'s data go', async () => {
        await host.evaluate(() => { const h = window.hextable, m = Object.values(h.state.entities).find((e) => e.tpl === 'hb-ember-folk-cinderling'); h.act({ type: 'remove', actor: m.id }); });
        await wait(host, () => !Object.values(window.hextable.state.entities).some((e) => e.tpl === 'hb-ember-folk-cinderling')).catch(async () => { throw new Error(`not removed: ${await host.evaluate(() => document.getElementById('toast')?.textContent)}`); });
        const card = '.pm-pack[data-pack="ember-folk"]';
        await host.click(`${card} .pm-remove`); await host.click(`${card} .pm-remove`);
        await wait(host, () => !document.querySelector('.pm-pack[data-pack="ember-folk"]')).catch(async () => { throw new Error(`still there: ${(await host.textContent('#pm .pm-refusal').catch(() => 'no refusal'))?.slice(0, 300)}`); });
        await wait(player, () => !window.hextable.packs.built.includes('ember-folk') && window.hextable.packs.built.includes('sample'));
        if (await host.$('#dm-spawn [data-monster="hb-ember-folk-cinderling"]')) throw new Error('the monster button stayed');
        await closeManager();
      });
      await run.do('removing the sample pack while the character holds its spells is refused too', async () => {
        await openManager();
        const card = '.pm-pack[data-pack="sample"]';
        await host.click(`${card} .pm-remove`); await host.click(`${card} .pm-remove`);
        await wait(host, () => !!document.querySelector('#pm .pm-refusal'));
        if (!/in use/i.test(await host.textContent('#pm .pm-refusal'))) throw new Error('no blockers');
        await closeManager();
      });
      await run.do('monster readings: the review shows a collapsed row for each monster, with its tier, and the reading opens', async () => {
        await openManager();
        await choose('reader-kinds.json', KINDS_PACK);
        const t = await host.textContent('#pm-review');
        if (!/Monsters \(3\)/.test(t) || !/Monsters by tier: 0 auto, 2 assist, 1 manual/.test(t)) throw new Error(`counts: ${t.slice(0, 500)}`);
        const rows = await host.$$eval('#pm-review .pm-monster', (l) => l.map((d) => ({ open: d.open, lines: d.querySelectorAll('.pm-line').length, tier: !!d.querySelector('.pm-tier'), h: d.querySelector('summary').getBoundingClientRect().height })));
        if (rows.length !== 3 || rows.some((r) => r.open || r.lines || !r.tier)) throw new Error(`rows ${JSON.stringify(rows)}`);
        if (rows.some((r) => r.h < 43.5)) throw new Error(`a row is under 44px tall: ${JSON.stringify(rows)}`);
        await host.evaluate(() => document.querySelector('#pm-review').scrollIntoView());
        const vh = await host.evaluate(() => innerHeight), gb = await (await host.$('#pm-go')).boundingBox();
        if (gb.y < 0 || gb.y + gb.height > vh) throw new Error(`Add is not on the screen with the review's top (y ${gb.y}, screen ${vh})`);
        await host.click('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] summary');       // a tap on the row opens it
        await wait(host, () => document.querySelectorAll('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] .pm-line').length > 20);
        const open = await host.textContent('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"]');
        if (!/Cinderjaw Hound \(Large, monstrosity/.test(open) || !/The DM does these by hand/.test(open) || !/Moving it by its burrow speed/.test(open)) throw new Error(open.slice(0, 400));
        await shot(host, `homebrew-monster-review-${tag}`);
      });
      await run.do('the DM adds it: the pack\'s card has Monsters (3), tiers, and the reading; the player holds nothing of it', async () => {
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="rk"]');
        const card = '.pm-pack[data-pack="rk"]';
        const t = await host.textContent(card);
        if (!/3 monsters/.test(t) || !/Monsters by tier: 0 auto, 2 assist, 1 manual/.test(t) || !/Monsters \(3\)/.test(t)) throw new Error(t.slice(0, 400));
        await host.click(`${card} details.pm-entries >> text=Monsters (3)`);
        await host.click(`${card} .pm-monster[data-entry="hb-rk-hollow-reaver"] summary`);
        await wait(host, (c) => document.querySelectorAll(`${c} .pm-monster[data-entry="hb-rk-hollow-reaver"] .pm-line`).length > 10, card);
        await host.evaluate((c) => document.querySelector(`${c} .pm-monster[data-entry="hb-rk-hollow-reaver"]`).scrollIntoView(), card);
        await shot(host, `homebrew-monster-card-${tag}`);
        await sleep(500); await calm(player);
        await wait(player, () => window.hextable.packs.built.includes('rk'));
        const kept = JSON.stringify(await player.evaluate(() => window.hextable.packs)), st = await player.evaluate(() => JSON.stringify(window.hextable.state));
        for (const [what, text] of [['what the page kept', kept], ['a frame it received', got.join('\n')], ['its state', st]]) if (SEEN_NAMES.test(text)) throw new Error(`${what} has the monsters' data`);
        if (await player.evaluate(() => !!document.querySelector('.pm-monster, #dm-packs .pm-pack') || !!document.querySelector('#pm .pm-monster'))) throw new Error('the player\'s page built a monster row');
        // the monster is on the table's page for the DM: it can be spawned, in sight of nobody in particular
        const id = await spawnNear(host, 'hb-rk-cinderjaw', { near: ven, min: 2, name: 'Hound' });
        if (!id) throw new Error('no spawn');
        await host.evaluate((i) => window.hextable.act({ type: 'remove', actor: i }), id);
        await wait(host, (i) => !window.hextable.state.entities[i], id);
        await closeManager();
      });
      await run.do('kinds the reader cannot read are listed by name with one honest line, in the review and on the card', async () => {
        await openManager();
        await choose('hoard.json', await hoardPack());
        const r = await host.textContent('#pm-review');
        if (!/Items \(1\)/.test(r) || !/Feats \(1\)/.test(r) || !/Bright Blade/.test(r) || !/Sharp Eyes/.test(r)) throw new Error(r.slice(0, 400));
        if ((r.match(/The game cannot read this kind back yet; you are adding it unread\./g) ?? []).length !== 2) throw new Error(`the honest line: ${r.slice(0, 600)}`);
        if (await host.$('#pm-review .pm-plain .pm-line')) throw new Error('an unread entry got a reading');
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="hoard"]');
        const card = '.pm-pack[data-pack="hoard"]';
        await host.evaluate((c) => document.querySelectorAll(`${c} details.pm-unread`).forEach((d) => { d.open = true; }), card);
        const t = await host.textContent(card);
        if (!/Bright Blade/.test(t) || !/Sharp Eyes/.test(t) || !/you are adding it unread/.test(t)) throw new Error(t.slice(0, 400));
        await shot(host, `homebrew-unread-${tag}`);
        await closeManager();
      });
    } finally { await hostCtx.close(); await playerCtx.close(); }
  });
}

export default async function (browser, url) {
  await table(browser, url, 'homebrew: the DM at desktop size, a phone player', DESKTOP, PHONE, 'desktop');
  await table(browser, url, 'homebrew: the DM on a phone, a desktop player', PHONE, DESKTOP, 'phone');
}
