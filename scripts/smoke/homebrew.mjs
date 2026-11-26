import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sleep, scenario, wait, shown, waitShown, open, closeMenu, openTab, calm, panelTab, rowOf, spawnNear, spotsFor, seeded, playSolo, ROOT, chip, chipPick, openMenu, tapDie } from './lib.mjs';

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

// ---------- a feature that asks for a skill or a tool, the client side (issue #543, docs/specs/homebrew-subclasses.md addition C, DEBT T96) ----------
// A solo game with an invented pack ("quill-folk": an Order of the Quill for the cleric, three features that lend proficiency for a time: any skill for Channel Divinity,
// a tool from two, a fixed skill). The cleric's Features tab has a row for each that asks; the card holds a menu of the eighteen skills (or two buttons for the tools) and
// the Use button waits for the pick; the use sends `choice`, an effect starts that holds the real skill, nothing is handed to the DM, and the sheet shows the lent skill
// (its bonus, "lent", and a line saying what lent it) and the lent tool. The card fits the screen. Run on a phone with touch and at desktop size.
function quillPack() {
  const lend = (scope) => ({ modifier: { on: 'check', op: 'proficient', scope } });
  const f = (id, name, grants, extra = {}) => ({ id: `hb-quill-folk-${id}`, name, level: 3, tier: 'auto', checked: false, text: `${name}, in the pack's own words.`, grants, ...extra });
  const act = (steps, more = {}) => ({ action: { time: 'action', target: { self: true }, duration: '10 minutes', effects: steps, ...more } });
  const order = { id: 'hb-quill-folk-order-of-the-quill', name: 'Order of the Quill', class: 'cleric', source: 'homebrew:quill-folk', checked: false, text: 'Scribes of a hushed archive.', features: [
    f('quill-any', 'Quill Any', act([lend({ skill: 'chosen' })], { cost: { resource: 'channel-divinity' }, choice: { of: 'skill' } })),
    f('quill-tool', 'Quill Tool', act([lend({ tool: 'chosen' })], { choice: { of: 'tool', from: ['thieves-tools', 'herbalism-kit'] } }), { uses: { max: 2, recharge: 'long' } }),
    f('quill-fixed', 'Quill Fixed', act([lend({ skill: 'history' })], { duration: '1 hour' }), { uses: { max: 1, recharge: 'long' } })] };
  return JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'quill-folk', name: 'Quill Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for the smoke test.' }, subclasses: [order] });
}
const ILSE = { name: 'Ilse', class: 'cleric', level: 5, subclass: 'hb-quill-folk-order-of-the-quill', abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ['religion', 'history'], choices: { 'divine-order': 'protector' },
  armour: 'chain-mail', shield: true, weapons: ['mace'], spells: ['guidance', 'sacred-flame', 'bless', 'cure-wounds'] };

export async function choiceSolo(browser, url, label, opts, tag) {
  await scenario(label, async (run) => {
    const touch = !!opts.hasTouch, ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const tap = (sel) => (touch ? page.locator(sel).tap() : page.click(sel));
      const fits = async (sel) => { const b = await page.$eval(sel, (x) => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; }); if (b[0] < 0 || b[1] > b[4] + 1 || b[2] < 0 || b[3] > b[5] + 1) throw new Error(`${sel} does not fit the screen: ${JSON.stringify(b)}`); };
      const noSideways = (sel) => page.$eval(sel, (e) => ({ sx: e.scrollWidth, cx: e.clientWidth })).then((m) => { if (m.sx > m.cx + 1) throw new Error(`${sel} overflows sideways: ${JSON.stringify(m)}`); });
      const hero = () => page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Ilse').id);
      const lentParts = () => page.evaluate(() => (window.hextable.state.effects ?? []).flatMap((fx) => (fx.parts ?? []).filter((p) => p.modifier?.op === 'proficient').map((p) => p.modifier.scope)));
      const toastText = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden && t.getClientRects().length ? t.textContent : ''; });
      const feat = async (name) => { await panelTab(page, 'features'); await tap(`#ap-features [data-row]:has-text("${name}")`); await waitShown(page, '#cp .cp-card'); };

      await run.do('the pack is added and a cleric of the Order of the Quill joins; her Features tab has a row for each feature that asks', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'autoEngage', value: false }));
        await openTab(page, 'dm'); await waitShown(page, '#pm-open'); await page.click('#pm-open'); await waitShown(page, '#pm');
        await page.setInputFiles('#pm-file', file('quill-folk.json', quillPack())); await waitShown(page, '#pm-review');
        await page.click('#pm-go'); await waitShown(page, '.pm-pack[data-pack="quill-folk"]');
        await page.click('#pm .pm-close'); await waitShown(page, '#pm', false); await closeMenu(page);
        await page.evaluate((sheet) => window.hextable.act({ type: 'setSheet', sheet }), ILSE);
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ilse'), null, 10000);
        await chip(page, 'Ilse'); await wait(page, () => !document.querySelector('#card').hidden && /Ilse/.test(document.querySelector('#c-name').textContent));
        await panelTab(page, 'features');
        const rows = await page.$$eval('#ap-features [data-row]', (l) => l.map((x) => x.textContent));
        for (const n of ['Quill Any', 'Quill Tool', 'Quill Fixed']) if (!rows.some((t) => t.includes(n))) throw new Error(`no row for ${n}: ${rows.join(' | ')}`);
      });
      await run.do('Quill Any: the card holds a menu of the skills and Use waits for the pick; the menu shows what each would be', async () => {
        await feat('Quill Any');
        await fits('#cp .cp-card');
        if (!(await page.$eval('#cp-use', (b) => b.disabled))) throw new Error('Use is open before a skill is chosen');
        const opts2 = await page.$$eval('#cp-choice option', (o) => o.map((x) => [x.value, x.textContent]));
        if (opts2.length !== 19) throw new Error(`options: ${opts2.length}`);
        const arcana = opts2.find(([v]) => v === 'arcana')?.[1], hist = opts2.find(([v]) => v === 'history')?.[1];
        if (arcana !== 'Arcana +1, +4 with it' || hist !== 'History +4 (already proficient)') throw new Error(`${arcana} | ${hist}`);
        const small = await page.$eval('#cp-choice', (x) => x.getBoundingClientRect().height < 40);
        if (small) throw new Error('the menu is too small to touch');
        await shot(page, `choice-card-any-${tag}`);
        if (await toastText()) throw new Error(`a toast floats over the card: ${await toastText()}`);
      });
      await run.do('choosing Arcana and using it sends the pick: an effect holds the real skill, the Channel Divinity use is spent, and the DM is handed nothing', async () => {
        const id = await hero(), before = await page.evaluate((i) => window.hextable.state.entities[i].uses['channel-divinity'], id), tl = await page.evaluate(() => window.hextable.state.timeline.length);
        await page.selectOption('#cp-choice', 'arcana');
        await wait(page, () => !document.querySelector('#cp-use').disabled);
        if (!/Quill Any: Arcana/.test(await page.textContent('#cp-use'))) throw new Error(await page.textContent('#cp-use'));
        await shot(page, `choice-card-picked-${tag}`);
        await tap('#cp-use');
        await wait(page, () => (window.hextable.state.effects ?? []).some((fx) => fx.parts?.some((p) => p.modifier?.op === 'proficient')), null, 10000);
        const parts = await lentParts();
        if (JSON.stringify(parts) !== JSON.stringify([{ skill: 'arcana' }])) throw new Error(`the effect: ${JSON.stringify(parts)}`);
        const types = await page.evaluate((n) => window.hextable.state.timeline.slice(n).map((e) => e.type), tl);
        if (types.includes('manual')) throw new Error(`the DM was handed it: ${types}`);
        if (await page.evaluate((i) => window.hextable.state.entities[i].uses['channel-divinity'], id) !== before - 1) throw new Error('Channel Divinity was not spent');
        if (await shown(page, '#cp')) throw new Error('the card stayed open after the use');
      });
      await run.do('the sheet shows Arcana as lent with its bonus (+4), says what lent it, and Perception is as it was', async () => {
        await calm(page);
        await openMenu(page, 'sheet'); await waitShown(page, '#sheet-body');
        const arcana = await page.textContent('#sheet-body [data-skill="arcana"]'), perc = await page.textContent('#sheet-body [data-skill="perception"]');
        if (!/arcana \+4 · lent/.test(arcana)) throw new Error(`Arcana: ${arcana}`);
        if (/lent/.test(perc) || !/perception \+3/.test(perc)) throw new Error(`Perception: ${perc}`);
        if (await page.$eval('#sheet-body [data-skill="arcana"]', (b) => !b.classList.contains('prof'))) throw new Error('a lent skill is not marked as one the creature is proficient in');
        const line = await page.textContent('#sheet-lent');
        if (!/Arcana \(Quill Any/.test(line) || !/10 minutes/.test(line)) throw new Error(line);
        await noSideways('#sheet-body');
        await page.$eval('#sheet-body [data-skill="arcana"]', (x) => x.scrollIntoView({ block: 'center' }));
        await shot(page, `choice-sheet-${tag}`);
        await closeMenu(page);
      });
      await run.do('Quill Tool: two buttons, none chosen; Use waits; choosing the herbalism kit and using it lends the tool', async () => {
        await feat('Quill Tool');
        await fits('#cp .cp-card');
        const names = await page.$$eval('#cp [data-choice]', (b) => b.map((x) => x.dataset.choice));
        if (names.join() !== 'thieves-tools,herbalism-kit') throw new Error(names.join());
        if (!(await page.$eval('#cp-use', (b) => b.disabled)) || (await page.$$eval('#cp [data-choice][aria-pressed="true"]', (b) => b.length))) throw new Error('something is chosen before the player chose it');
        if (await page.$$eval('#cp [data-choice]', (b) => b.some((x) => x.getBoundingClientRect().height < 40))) throw new Error('a button is too small to touch');
        await tap('#cp [data-choice="herbalism-kit"]');
        await wait(page, () => !document.querySelector('#cp-use').disabled && document.querySelector('#cp [data-choice="herbalism-kit"]').getAttribute('aria-pressed') === 'true');
        await shot(page, `choice-card-tool-${tag}`);
        await tap('#cp-use');
        await wait(page, () => (window.hextable.state.effects ?? []).some((fx) => fx.parts?.some((p) => p.modifier?.scope?.tool === 'herbalism-kit')), null, 10000);
        await calm(page);
        await openMenu(page, 'sheet'); await waitShown(page, '#sheet-body');
        const line = await page.textContent('#sheet-lent');
        if (!/Herbalism kit \(Quill Tool/.test(line) || !/Arcana \(Quill Any/.test(line)) throw new Error(line);
        await closeMenu(page);
      });
      await run.do('a fixed feature is still one tap: no card opens and its effect starts at once', async () => {
        await panelTab(page, 'features');
        await tap('#ap-features [data-row]:has-text("Quill Fixed")');
        await wait(page, () => (window.hextable.state.effects ?? []).some((fx) => fx.parts?.some((p) => p.modifier?.scope?.skill === 'history')), null, 10000);
        if (await shown(page, '#cp')) throw new Error('a card opened for a feature that asks for nothing');
      });
    } finally { await ctx.close(); }
  });
}

const KINDS_PACK = readFileSync(new URL('../../packages/rules/test/fixtures/reader-kinds-pack.json', import.meta.url), 'utf8');
async function tierLineOf(doc) {                                          // what the manager should say, worked out from the reader's own tiers
  const { readEntry } = await import(pathToFileURL(`${ROOT}packages/rules/src/content/reader.js`));
  const n = { auto: 0, assist: 0, manual: 0 };
  for (const m of doc.monsters) n[readEntry('monster', m).tier]++;
  return `Monsters by tier: ${n.auto} auto, ${n.assist} assist, ${n.manual} manual`;
}
const SEEN_NAMES = /Cinderjaw|Gloomwing|Hollow Reaver|Pack Tactics|Ember Memory/i;     // what only a monster's data would say
async function hoardPack() {                                              // a feat, a weapon, a piece of armour and an object, made from SRD entries (the numbers the check looks for are the entries' own)
  const { CONTENT } = await import(pathToFileURL(`${ROOT}packages/rules/src/content/index.js`));
  const mk = (c, id, name) => Object.assign(structuredClone(c), { id, name, source: 'homebrew:hoard', checked: false });
  const doc = { format: 'hextable-pack', v: 1, pack: { id: 'hoard', name: 'Hoard', version: 1, license: 'CC0', attribution: 'Written for the smoke test.' },
    feats: [mk(CONTENT.feats.alert, 'hb-hoard-sharp-eyes', 'Sharp Eyes')], weapons: [mk(CONTENT.weapons.club, 'hb-hoard-bright-club', 'Bright Club')],
    armour: [mk(CONTENT.armour['padded-armor'], 'hb-hoard-quilt', 'Fine Quilt')], objects: [mk(CONTENT.objects['secret-door'], 'hb-hoard-oak-gate', 'Oak Gate')] };
  return { text: JSON.stringify(doc), doc };
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
        if (n !== 19) throw new Error(`${n} entries`);
        const empty = await host.$$eval('#pm-review .pm-entry[data-entry]', (l) => l.filter((d) => d.querySelectorAll('.pm-line').length < 3 || !d.querySelector('.pm-tier')).length);
        if (empty) throw new Error(`${empty} entries without a reading`);
        const t = await host.textContent('#pm-review');
        if (!/17 auto, 1 assist, 1 manual/.test(t) || !/Licence: CC0, by the author/.test(t) || !/Attribution: Written for the Hextable tests/.test(t)) throw new Error(t.slice(0, 400));
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
        if (!/19 spells/.test(l)) throw new Error(l);
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
        await chipPick(player, 'Play as Ven', 'click');
        await wait(host, (v) => !!window.hextable.state.entities[v].owner, ven);
        await calm(player);
      });
      await run.do('on the sheet the spell shows with its pack, and its reading opens', async () => {
        await openTab(player, 'sheet');       // the sheet is the last section of the character's page (M10): the helper opens it
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
        await openTab(player, 'sheet');       // the sheet is the last section of the character's page (M10): the helper opens it
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
        await tapDie(player, false);
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
        if (!/Monsters \(3\)/.test(t) || !t.includes(await tierLineOf(JSON.parse(KINDS_PACK)))) throw new Error(`counts: ${t.slice(0, 500)}`);
        const rows = await host.$$eval('#pm-review .pm-monster', (l) => l.map((d) => ({ open: d.open, lines: d.querySelectorAll('.pm-line').length, tier: !!d.querySelector('.pm-tier'), h: d.querySelector('summary').getBoundingClientRect().height })));
        if (rows.length !== 3 || rows.some((r) => r.open || r.lines || !r.tier)) throw new Error(`rows ${JSON.stringify(rows)}`);
        if (rows.some((r) => r.h < 43.5)) throw new Error(`a row is under 44px tall: ${JSON.stringify(rows)}`);
        await host.evaluate(() => document.querySelector('#pm-review').scrollIntoView());
        const vh = await host.evaluate(() => innerHeight), gb = await (await host.$('#pm-go')).boundingBox();
        if (gb.y < 0 || gb.y + gb.height > vh) throw new Error(`Add is not on the screen with the review's top (y ${gb.y}, screen ${vh})`);
        await host.click('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] summary');       // a tap on the row opens it
        await wait(host, () => document.querySelectorAll('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] .pm-line').length > 20);
        const open = await host.textContent('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"]');
        const doc = JSON.parse(KINDS_PACK), m = doc.monsters.find((x) => x.id === 'hb-rk-cinderjaw');         // the numbers come from the pack's own data
        const title = await host.textContent('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] summary .pm-name');
        if (!title.includes(m.name)) throw new Error(`the row's title: ${title}`);
        if (!new RegExp(`Armor Class\\D{0,12}${m.ac}\\b`).test(open) || !new RegExp(`Hit Points\\D{0,12}${m.hp}\\b`).test(open)) throw new Error(`no AC ${m.ac} or HP ${m.hp}: ${open.slice(0, 400)}`);
        if (!(await host.$('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] h5:has-text("The DM does these by hand")'))) throw new Error('no block of what the DM does by hand');
        await shot(host, `homebrew-monster-review-${tag}`);
      });
      await run.do('the DM adds it: the pack\'s card has Monsters (3), tiers, and the reading; the player holds nothing of it', async () => {
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="rk"]');
        const card = '.pm-pack[data-pack="rk"]';
        const t = await host.textContent(card);
        if (!/3 monsters/.test(t) || !t.includes(await tierLineOf(JSON.parse(KINDS_PACK))) || !/Monsters \(3\)/.test(t)) throw new Error(t.slice(0, 400));
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
      await run.do('a weapon, a piece of armour and an object have readings in the review and on the card (no tier for the first two)', async () => {
        await openManager();
        const { text, doc } = await hoardPack();
        await choose('hoard.json', text);
        const w = doc.weapons[0], a = doc.armour[0], o = doc.objects[0];
        const want = [['weapon', 'hb-hoard-bright-club', w.name, w.damage], ['armour', 'hb-hoard-quilt', a.name, String(a.ac)], ['object', 'hb-hoard-oak-gate', o.name, String(o.dc)]];
        const check = async (root, where) => {
          const h = await host.textContent(root);
          if (/could not place|cannot read this kind back/.test(h)) throw new Error(`${where}: says the reader cannot read a kind`);
          for (const [kind, id, name, num] of want) {
            const row = `${root} .pm-${kind}[data-entry="${id}"]`;
            if (!(await host.$(row))) throw new Error(`${where}: no ${kind} row`);
            if (!(await host.textContent(`${row} summary .pm-name`)).includes(name)) throw new Error(`${where}: the ${kind} row's title`);
            if (kind !== 'object' && await host.$(`${row} summary .pm-tier`)) throw new Error(`${where}: the ${kind} has a tier pill`);
            if (await host.$(`${row} .pm-line`)) throw new Error(`${where}: the ${kind} row is open or not lazy`);
            await host.click(`${row} summary`);
            await wait(host, (r) => document.querySelectorAll(`${r} .pm-line`).length > 0, row);
            if (!new RegExp(`\\b${num}\\b`).test(await host.textContent(row))) throw new Error(`${where}: the ${kind} reading lacks ${num} from the pack`);
          }
        };
        await check('#pm-review', 'review');
        if (!(await host.$('#pm-review .pm-feat[data-entry="hb-hoard-sharp-eyes"] .pm-tier'))) throw new Error('a feat has no tier pill');
        await host.evaluate(() => document.querySelector('#pm-review .pm-weapon').scrollIntoView());
        await shot(host, `homebrew-weapon-review-${tag}`);
        await host.evaluate(() => document.querySelector('#pm-review .pm-armour').scrollIntoView());
        await shot(host, `homebrew-armour-review-${tag}`);
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="hoard"]');
        const card = '.pm-pack[data-pack="hoard"]';
        await host.evaluate((c) => document.querySelectorAll(`${c} details.pm-entries`).forEach((d) => { d.open = true; }), card);
        await check(card, 'card');
        const t = await host.textContent(card);
        if (!/Feats by tier/.test(t) || /Weapons by tier|Armour by tier/.test(t)) throw new Error(`tier lines: ${t.slice(0, 300)}`);
        await host.evaluate((c) => document.querySelector(`${c} .pm-object`).scrollIntoView(), card);
        await shot(host, `homebrew-object-card-${tag}`);
        await closeManager();
      });
    } finally { await hostCtx.close(); await playerCtx.close(); }
  });
}

// ---------- homebrew in a solo game (issue #424, DEBT T51) ----------
// The player is the DM and every hero. The pack manager is on the DM tab; packs are kept in this browser (`hextable.solo.packs`) and checked again each time the
// game opens. Add the sample pack (a storage that is full refuses it first, and says so), read an entry, give a character a homebrew spell and cast it; reload: the
// pack is listed and the spell casts. Remove is refused while the character holds the spell and works after. Then the stored packs are damaged by hand: the game must
// open, say what it dropped, and raise no page error. The game's seed is the pass's own (SMOKE_SEED=<n> replays one); every spot is asked of the engine (`spawnNear`).
async function solo(browser, url, label0, opts, tag) {
  const seed = process.env.SMOKE_SEED ? Number(process.env.SMOKE_SEED) : Math.floor(Math.random() * 1e9);
  await scenario(`${label0} (seed ${seed})`, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const had = process.env.SMOKE_SEED; process.env.SMOKE_SEED = String(seed); seeded(ctx); if (had === undefined) delete process.env.SMOKE_SEED; else process.env.SMOKE_SEED = had;
      const page = await ctx.newPage();
      run.watch(page);
      const KEY = 'hextable.solo.packs';
      const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
      const openManager = async () => {
        if (!(await shown(page, '#pm'))) { await openTab(page, 'dm'); await waitShown(page, '#pm-open'); await page.click('#pm-open'); await waitShown(page, '#pm'); }
      };
      const closeManager = async () => { if (await shown(page, '#pm')) { await page.click('#pm .pm-close'); await waitShown(page, '#pm', false); } };
      const choose = async (name, text) => { await page.setInputFiles('#pm-file', file(name, text)); await waitShown(page, '#pm-review'); };
      const reload = async () => {
        await page.reload(); await waitShown(page, '#lobby');
        if (!/Continue/.test(await page.textContent('#lobby-solo'))) throw new Error('the lobby does not offer the saved game');
        await page.click('#lobby-solo');
        await wait(page, () => window.hextable?.state?.entities);
        await sleep(400); await calm(page);
      };
      const summary = async () => { await openTab(page, 'dm'); await waitShown(page, '#pm-summary'); return page.textContent('#pm-summary'); };
      const dropped = async (shotName) => { await openManager(); const t = await page.$$eval('#pm .pm-refusal', (l) => l.map((x) => x.textContent).join('\n')); if (shotName) await shot(page, shotName); await closeManager(); await closeMenu(page); return t; };
      let ven;

      await run.do('a solo game opens, and its DM tab has the pack manager', async () => {
        await open(page, url); await playSolo(page);
        await page.evaluate(() => { const h = window.hextable; h.act({ type: 'setting', key: 'autoEngage', value: false }); h.act({ type: 'setting', key: 'diceThrow', value: 'auto' }); });
        await calm(page);
        await openTab(page, 'dm');
        if (!(await shown(page, '#dm-packs')) || !(await shown(page, '#pm-open'))) throw new Error('the pack manager is not on the DM tab of a solo game');
        const t = await page.textContent('#pm-summary');
        if (!/None in this game yet/.test(t)) throw new Error(t);
        await shot(page, `homebrew-solo-tab-${tag}`);
        await closeMenu(page);
      });
      await run.do('a bad file and a file past the size limit are refused here, and nothing is kept', async () => {
        await openManager();
        await choose('broken.json', BAD);
        const t = await page.textContent('#pm-review');
        if (!/checker refused/i.test(t) || !/nothing was kept/.test(t) || await page.$('#pm-go')) throw new Error(t.slice(0, 300));
        await choose('huge.json', ' '.repeat(600 * 1024));
        if (!/not read/.test(await page.textContent('#pm-review'))) throw new Error('the large file was read');
        if (await stored()) throw new Error('something was kept');
      });
      await run.do('the DM sees readings, monsters among them, before anything is added', async () => {
        await choose('reader-kinds.json', KINDS_PACK);
        const t = await page.textContent('#pm-review');
        if (!/Monsters \(3\)/.test(t) || !t.includes(await tierLineOf(JSON.parse(KINDS_PACK)))) throw new Error(`no monster readings: ${t.slice(0, 400)}`);
        await page.click('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] summary');
        await wait(page, () => document.querySelectorAll('#pm-review .pm-monster[data-entry="hb-rk-cinderjaw"] .pm-line').length > 20);
        await shot(page, `homebrew-solo-monster-${tag}`);
        await choose('sample-pack.json', SAMPLE);
        const n = await page.$$eval('#pm-review .pm-entry[data-entry]', (l) => l.length);
        if (n !== 19) throw new Error(`${n} entries`);
        const t2 = await page.textContent('#pm-review');
        if (!/17 auto, 1 assist, 1 manual/.test(t2) || !/Add to this game/.test(await page.textContent('#pm-go'))) throw new Error(t2.slice(0, 300));
        await page.evaluate(() => { const d = document.querySelector('#pm-review .pm-entry[data-entry]'); d.open = true; d.querySelector('.pm-try-btn').click(); });
        await wait(page, () => /damage|hit|missed|target/i.test(document.querySelector('#pm-review .pm-try')?.textContent ?? ''));
        await shot(page, `homebrew-solo-review-${tag}`);
      });
      await run.do('a browser that cannot keep the pack: the pack is not added, and the player is told', async () => {
        await page.evaluate((k) => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (key, v) { if (key === k) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, key, v); }; }, KEY);
        await page.click('#pm-go');
        await wait(page, () => /storage is full or turned off/.test(document.querySelector('#pm .pm-refusal')?.textContent ?? ''));
        await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
        if (await stored()) throw new Error('something was kept');
        if (await page.$('.pm-pack[data-pack="sample"]')) throw new Error('the pack is listed');
        if ((await page.evaluate(() => window.hextable.state.packs.length)) !== 0) throw new Error('the game names the pack');
        if (await page.evaluate(() => window.hextable.packs.installed)) throw new Error('an overlay was installed');
        await shot(page, `homebrew-solo-full-${tag}`);
      });
      await run.do('Add to this game: listed, kept in the browser, named in the game, and installed', async () => {
        await page.click('#pm-go');
        await waitShown(page, '.pm-pack[data-pack="sample"]');
        const l = await page.textContent('.pm-pack[data-pack="sample"]');
        if (!/19 spells/.test(l)) throw new Error(l);
        const kept = JSON.parse(await stored());
        if (kept.length !== 1 || kept[0].id !== 'sample' || !kept[0].data?.spells) throw new Error('not kept');
        const st = await page.evaluate(() => ({ named: window.hextable.state.packs.map((p) => p.id), built: window.hextable.packs.built, installed: window.hextable.packs.installed }));
        if (st.named.join() !== 'sample' || st.built.join() !== 'sample' || !st.installed) throw new Error(JSON.stringify(st));
        await shot(page, `homebrew-solo-manager-${tag}`);
        await closeManager(); await closeMenu(page);
      });
      await run.do('the DM gives a hero the spell, and casting it at a foe resolves', async () => {
        await page.evaluate(() => window.hextable.act({ type: 'setSheet', sheet: { name: 'Ven', class: 'wizard', level: 2, abilities: { str: 10, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], weapons: ['quarterstaff'], spells: ['hb-sample-ember-dart', 'fire-bolt', 'magic-missile', 'hb-sample-jarring-note'] } }));
        await wait(page, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Ven'), null, 10000).catch(async () => { throw new Error(`no Ven: toast "${await page.evaluate(() => document.getElementById('toast')?.textContent)}"`); });
        ven = await page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Ven').id);
        const foe = await spawnNear(page, 'goblin-warrior', { near: ven, min: 2, sightFrom: ven, range: 40, name: 'Target' });
        await calm(page);
        await page.evaluate((f) => { const h = window.hextable; if (!h.state.encounter) h.act({ type: 'startEncounter', center: h.state.entities[f].pos, radius: 40 }); }, foe);
        await wait(page, () => window.hextable.state.encounter);
        for (let i = 0; i < 30; i++) {                                     // the turns go by until it is Ven's: the foe's own are the monster AI's, a hero's the DM's
          const cur = await page.evaluate(() => { const S = window.hextable.state; return S.encounter.order[S.encounter.turn].id; });
          if (cur === ven) break;
          if (cur !== foe) await page.evaluate((c) => window.hextable.act({ type: 'endTurn', actor: c }), cur);
          await sleep(cur === foe ? 700 : 150); await calm(page);
        }
        await wait(page, (v) => { const S = window.hextable.state; return S.encounter?.order[S.encounter.turn]?.id === v; }, ven).catch(() => { throw new Error('it never became Ven\'s turn'); });
        await sleep(300); await calm(page);
        await page.evaluate((v) => window.hextable.select(v), ven);
        await calm(page);
        const pos = await page.evaluate((f) => window.hextable.state.entities[f].pos, foe);
        await panelTab(page, 'spells');
        await page.click(rowOf('spells', 'Ember Dart'));
        await wait(page, () => window.hextable.mode.kind === 'spell').catch(async () => { throw new Error(`no spell mode: ${JSON.stringify(await page.evaluate(() => window.hextable.mode))}`); });
        await page.evaluate(([h, i]) => window.hextable.R.onTap({ hex: h, id: i }), [pos, foe]);
        await tapDie(page, false);
        await calm(page);
        await openTab(page, 'log');
        await wait(page, () => /Ember Dart/.test(document.querySelector('#log-list')?.textContent ?? ''), null, 10000).catch(async () => {
          throw new Error(`the cast did not reach the log: mode ${JSON.stringify(await page.evaluate(() => window.hextable.mode))}; toast "${await page.evaluate(() => document.getElementById('toast')?.textContent)}"; log ${(await page.evaluate(() => document.querySelector('#log-list')?.textContent))?.slice(-300)}`);
        });
        const log = await page.evaluate(() => [...document.querySelectorAll('#log-list .lg-line')].map((l) => l.textContent).join('\n'));
        if (!/Ven attacks Target( behind [a-z ]+)? with Ember Dart: .*(Miss|Hit|damage)/i.test(log)) throw new Error(`the cast did nothing: ${log.slice(-300)}`);
        await shot(page, `homebrew-solo-cast-${tag}`);
        await closeMenu(page);
      });
      await run.do('reload: the pack is still listed, installed, and the spell still casts', async () => {
        await reload();
        const st = await page.evaluate(() => ({ named: window.hextable.state.packs.map((p) => p.id), built: window.hextable.packs.built, installed: window.hextable.packs.installed, missing: !!document.querySelector('.hb-missing') }));
        if (st.named.join() !== 'sample' || st.built.join() !== 'sample' || !st.installed) throw new Error(JSON.stringify(st));
        const sum = await summary();
        if (!/1 of 4: Sample Pack \(version 1\)/.test(sum) || /could not be loaded/.test(sum)) throw new Error(sum);
        await openManager();
        if (!(await shown(page, '.pm-pack[data-pack="sample"]'))) throw new Error('the pack is not listed');
        await closeManager(); await closeMenu(page);
        // Ven cast before the reload, so her Action is spent and in a fight M4 shows only what can be used now (R29): no Cast group. The DM ends the fight,
        // and out of it every spell is listed and says why it cannot be cast: Ember Dart must be there and castable.
        if (await page.evaluate(() => !!window.hextable.state.encounter)) {
          await page.evaluate(() => window.hextable.act({ type: 'endEncounter' }));
          await wait(page, () => !window.hextable.state.encounter, null, 10000).catch(() => { throw new Error('the fight did not end'); });
          await calm(page);
        }
        await page.evaluate((v) => window.hextable.select(v), ven);
        await panelTab(page, 'spells');
        await page.waitForSelector(rowOf('spells', 'Ember Dart'), { state: 'visible', timeout: 8000 });
        const off = await page.getAttribute(rowOf('spells', 'Ember Dart'), 'aria-disabled');
        if (off !== 'false') throw new Error(`Ember Dart is listed but greyed after the reload: ${(await page.textContent(rowOf('spells', 'Ember Dart')))?.slice(0, 200)}`);
        // the engine, with the overlay the page installed from storage, still takes the cast (asked on a copy, as `spawnNear` asks about a spawn)
        const { spots } = await spotsFor(page, 'goblin-warrior', { near: ven, min: 2, sightFrom: ven, range: 40 });
        if (!spots.length) throw new Error('no hex near Ven takes a foe');
        const cast = await page.evaluate(async ([v, at]) => {
          const { apply } = await import('./shared/engine.js');
          const S = structuredClone({ ...window.hextable.state, timeline: [] }), DM = { role: 'dm', userId: 'local' };
          if (S.encounter) apply(S, { type: 'endEncounter' }, DM);                    // Ven used her action this turn before the reload: ask outside the fight
          const sp = apply(S, { type: 'spawn', monster: 'goblin-warrior', at, name: 'Second' }, DM);
          if (!sp.ok) return { ok: false, error: sp.error };
          const r = apply(S, { type: 'cast', actor: v, spell: 'hb-sample-ember-dart', targets: [sp.events.find((x) => x.type === 'spawned').id] }, DM);
          return { ok: r.ok, error: r.error };
        }, [ven, spots[0]]);
        if (!cast.ok) throw new Error(`the cast was refused after the reload: ${cast.error}`);
        await shot(page, `homebrew-solo-reload-${tag}`);
      });
      await run.do('Remove is refused while the hero holds the spell, and says where; the pack stays', async () => {
        await openManager();
        const card = '.pm-pack[data-pack="sample"]';
        await page.click(`${card} .pm-remove`); await page.click(`${card} .pm-remove`);
        await wait(page, () => !!document.querySelector('#pm .pm-refusal'));
        const t = await page.textContent('#pm .pm-refusal');
        if (!/in use/i.test(t) || !/Ven/.test(t) || !/hb-sample-/.test(t)) throw new Error(t.slice(0, 300));
        if (!(await shown(page, card)) || JSON.parse(await stored()).length !== 1) throw new Error('the pack went anyway');
        await shot(page, `homebrew-solo-blocked-${tag}`);
        await closeManager(); await closeMenu(page);
      });
      await run.do('once the hero is gone, Remove works: the pack, the browser\'s copy and the overlay go', async () => {
        await page.evaluate((v) => { const h = window.hextable; if (h.state.encounter) h.act({ type: 'endEncounter' }); h.act({ type: 'remove', actor: v }); }, ven);
        await wait(page, (v) => !window.hextable.state.entities[v], ven);
        await openManager();
        const card = '.pm-pack[data-pack="sample"]';
        await page.click(`${card} .pm-remove`); await page.click(`${card} .pm-remove`);
        await wait(page, () => !document.querySelector('.pm-pack[data-pack="sample"]')).catch(async () => { throw new Error(`still there: ${(await page.textContent('#pm .pm-refusal').catch(() => 'no refusal'))?.slice(0, 300)}`); });
        if ((await stored()) !== '[]') throw new Error(`the browser still holds ${await stored()}`);
        const st = await page.evaluate(() => ({ named: window.hextable.state.packs.length, installed: window.hextable.packs.installed, built: window.hextable.packs.built.length }));
        if (st.named || st.installed || st.built) throw new Error(JSON.stringify(st));
        await closeManager(); await closeMenu(page);
      });
      // What storage may hold is not trusted: each damaged form below is put in by hand, then the page is reloaded.
      const damaged = async (name, value, want) => {
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, value]);
        await reload();
        const sum = await summary();
        if (!/could not be loaded/.test(sum)) throw new Error(`${name}: the summary says nothing: ${sum}`);
        const t = await dropped(`homebrew-solo-${name}-${tag}`);
        if (!want.test(t)) throw new Error(`${name}: the reason is not given: ${t.slice(0, 300)}`);
        if (await page.evaluate(() => window.hextable.state.packs.length || window.hextable.packs.installed)) throw new Error(`${name}: a pack was used`);
        return t;
      };
      await run.do('stored packs that are nonsense: the game opens and says what was dropped', async () => {
        await damaged('nonsense', 'nonsense {{', /not readable/);
        await damaged('notalist', '{"a":1}', /not a list/);
        await damaged('toolarge', 'x'.repeat(1100 * 1024), /it was not read/);
      });
      await run.do('a stored pack that fails the checks is dropped; nothing in it is used', async () => {
        const rec = await page.evaluate(async (text) => { const { hashOf } = await import('./shared/content/packs.js'); const data = JSON.parse(text); data.spells[0].name = 'Forged'; return { id: data.pack.id, version: data.pack.version, hash: '0'.repeat(64), data }; }, SAMPLE);
        await damaged('badhash', JSON.stringify([rec]), /sample.*hash/i);
        const lie = await page.evaluate(async (text) => { const { hashOf } = await import('./shared/content/packs.js'); const data = JSON.parse(text); data.spells[0].effects = 'a string'; return { id: data.pack.id, version: data.pack.version, hash: hashOf(data), data }; }, SAMPLE);
        await damaged('failscheck', JSON.stringify([lie]), /sample/);
      });
      await run.do('a good stored pack is used; if the browser loses it, the saved game opens without it and says so', async () => {
        const rec = await page.evaluate(async (text) => { const { hashOf } = await import('./shared/content/packs.js'); const data = JSON.parse(text); return { id: data.pack.id, version: data.pack.version, hash: hashOf(data), data }; }, SAMPLE);
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify([rec])]);
        await reload();
        if (!/1 of 4: Sample Pack/.test(await summary()) || /could not be loaded/.test(await summary())) throw new Error(await summary());
        await closeMenu(page);
        await page.evaluate(() => window.hextable.act({ type: 'setting', key: 'pace', value: 'instant' }));         // any action: the game is kept with the pack named in it
        await wait(page, () => JSON.parse(localStorage.getItem('hextable.solo')).packs.length === 1);
        await page.evaluate((k) => localStorage.removeItem(k), KEY);
        await reload();
        const sum = await summary();
        if (!/could not be loaded/.test(sum)) throw new Error(sum);
        const t = await dropped(`homebrew-solo-lost-${tag}`);
        if (!/sample.*no longer has it, so the game opens without it/.test(t.replace(/\s+/g, ' '))) throw new Error(t.slice(0, 300));
        if (await page.evaluate(() => window.hextable.state.packs.length)) throw new Error('the game still names the pack');
      });
      await run.do('a pack dropped at load stays in the browser through a later add; its Remove deletes it; reload: gone', async () => {
        const rec = await page.evaluate(async (text) => { const data = JSON.parse(text); return { id: data.pack.id, version: data.pack.version, hash: '0'.repeat(64), data }; }, SAMPLE);
        const ids = async () => JSON.parse((await stored()) ?? '[]').map((p) => p.id).sort().join();
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify([rec])]);
        await reload();
        await openManager();
        const node = '#pm .pm-dropped[data-dropped="sample"]';
        if (!(await shown(page, node)) || !/hash/i.test(await page.textContent(node))) throw new Error(`the dropped pack is not listed with its reason: ${(await page.textContent('#pm')).slice(0, 300)}`);
        const bb = await (await page.$(`${node} .pm-discard`)).boundingBox();
        if (bb.height < 43.5) throw new Error(`Remove is ${bb.height}px tall`);
        await shot(page, `homebrew-solo-dropped-${tag}`);
        await choose('hoard.json', (await hoardPack()).text);
        await page.click('#pm-go');
        await waitShown(page, '.pm-pack[data-pack="hoard"]');
        if (await ids() !== 'hoard,sample') throw new Error(`after the add the browser holds: ${await ids()}`);
        if (!(await shown(page, node))) throw new Error('the dropped pack went from the list after an add');
        await closeManager(); await closeMenu(page);
        await reload();
        await openManager();
        if (!(await shown(page, node)) || !(await shown(page, '.pm-pack[data-pack="hoard"]'))) throw new Error('after the reload the dropped pack or the new one is not listed');
        await page.click(`${node} .pm-discard`); await page.click(`${node} .pm-discard`);
        await wait(page, () => !document.querySelector('#pm .pm-dropped'));
        if (await ids() !== 'hoard') throw new Error(`after Remove the browser holds: ${await ids()}`);
        await shot(page, `homebrew-solo-dropped-removed-${tag}`);
        await closeManager(); await closeMenu(page);
        await reload();
        if (/could not be loaded/.test(await summary()) || await ids() !== 'hoard') throw new Error(`after the reload: ${await summary()}, ${await ids()}`);
      });
    } finally { await ctx.close(); }
  });
}

// ---------- homebrew subclasses, the client side (issue #512, docs/specs/homebrew-subclasses.md, B5) ----------
// A DM hosts and a player joins. An invented pack ("ember-folk": an Oath of the Ember for the paladin, a College of Embers for the bard). Before the pack is on the
// table, a paladin whose sheet names the oath is made: the header says "subclass not loaded" on both screens, the DM's sheet says why and the player is told nothing
// of the DM's note. The DM reads the pack in the manager (subclasses listed with readings and tiers) and adds it; Refresh from sheet brings the oath in. The build sheet's
// Subclass list holds the SRD subclass and the table's, of that class only. The import report names the homebrew subclass the importer matched. A player's page that loses
// the pack says "subclass not loaded" again, with no page error. Run twice: DM at desktop size with a phone player, then the other way round.
function emberSubclassPack() {
  const f = (id, name, level, tier, text, extra = {}) => ({ id: `hb-ember-folk-${id}`, name, level, tier, checked: false, text, ...extra });
  const oath = { id: 'hb-ember-folk-oath-of-the-ember', name: 'Oath of the Ember', class: 'paladin', source: 'homebrew:ember-folk', checked: false, text: 'Paladins sworn to keep a hearth-fire burning.',
    spells: { 3: ['burning-hands', 'shield-of-faith'] },
    features: [f('kindle', 'Kindle', 3, 'auto', 'Spend Channel Divinity to wreathe one foe in sparks: Advantage on attack rolls against it for 1 minute.',
      { grants: { action: { time: 'bonus', cost: { resource: 'channel-divinity' }, duration: '1 minute', target: { creature: { range: [30, 30] } }, effects: [{ modifier: { on: 'attack.roll', op: 'advantage', against: 'target' }, to: 'caster' }] } } }),
      f('hearth-vow', 'Hearth Vow', 7, 'manual', 'A vow the DM keeps track of.')] };
  const college = { id: 'hb-ember-folk-college-of-embers', name: 'College of Embers', class: 'bard', source: 'homebrew:ember-folk', checked: false, text: 'Bards who sing by firelight.',
    features: [f('ash-song', 'Ash Song', 3, 'manual', 'A song the DM judges.')] };
  return JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'ember-folk', name: 'Ember Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for the smoke test.' }, subclasses: [oath, college] });
}
const OATH = 'hb-ember-folk-oath-of-the-ember';
const TAVIN = { name: 'Orsolya', class: 'paladin', level: 5, subclass: OATH, abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 14 }, skills: ['athletics', 'persuasion'], choices: { 'fighting-style': 'defense' } };
const EMBER_FIXTURE = fileURLToPath(new URL('../../packages/rules/test/fixtures/fgxml-paladin-ember.xml', import.meta.url));

export async function subclassTable(browser, url, label, hostOpts, playerOpts, tag) {
  await scenario(label, async (run) => {
    const hostCtx = await browser.newContext(hostOpts), playerCtx = await browser.newContext(playerOpts);
    try {
      const host = await hostCtx.newPage(), player = await playerCtx.newPage();
      run.watch(host, ' (DM)'); run.watch(player, ' (player)');
      const got = [];
      let inject = null;
      await player.routeWebSocket(/\/ws$/, (ws) => { const up = ws.connectToServer(); ws.onMessage((m) => up.send(m)); up.onMessage((m) => ws.send(m)); inject = (text) => ws.send(text); });
      player.on('websocket', (ws) => ws.on('framereceived', (f) => got.push(String(f.payload))));
      const idOf = (page) => page.evaluate(() => Object.values(window.hextable.state.entities).find((e) => e.name === 'Orsolya')?.id ?? null);
      const sub = (page) => page.textContent('#c-sub');
      // not `chip`: that is lib.mjs's, which this calls (a local `chip` called itself and never returned)
      const pickOrsolya = async (page) => { await closeMenu(page); await chip(page, 'Orsolya'); await wait(page, () => !document.querySelector('#card').hidden && /Orsolya/.test(document.querySelector('#c-name').textContent)); };
      const noSideways = async (page, sel) => { await sleep(500); return page.$eval(sel, (e) => ({ sx: e.scrollWidth, cx: e.clientWidth, r: e.getBoundingClientRect().right, iw: innerWidth })).then((m) => { if (m.sx > m.cx + 1 || m.r > m.iw + 1) throw new Error(`${sel} overflows sideways: ${JSON.stringify(m)}`); }); };
      const openManager = async () => { if (!(await shown(host, '#pm'))) { await openTab(host, 'dm'); await host.click('#pm-open'); await waitShown(host, '#pm'); } };
      const shot = (page, name) => (process.env.SMOKE_SHOTS ? page.screenshot({ path: `${process.env.SMOKE_SHOTS}/${name}.png` }) : null);

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
        await closeMenu(host);
      });
      await run.do('a paladin whose subclass the table does not have is made: both headers say "subclass not loaded", the DM\'s sheet says why, the player is not told the DM\'s note', async () => {
        await host.evaluate((sheet) => window.hextable.act({ type: 'setSheet', sheet }), TAVIN);
        await wait(host, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Orsolya'), null, 10000).catch(async () => { throw new Error(`no Orsolya: ${await host.evaluate(() => document.getElementById('toast')?.textContent)}`); });
        await wait(player, () => Object.values(window.hextable.state.entities).some((e) => e.name === 'Orsolya'), null, 10000);
        await pickOrsolya(host); await pickOrsolya(player);
        for (const [who, page] of [['DM', host], ['player', player]]) if (!/Level 5 Paladin \(subclass not loaded\)/.test(await sub(page))) throw new Error(`${who}'s header: ${await sub(page)}`);
        await openMenu(host, 'sheet'); await waitShown(host, '#sheet-body');
        const t = await host.textContent('#sheet-subclass-missing');
        if (!t.includes(OATH) || !/is not loaded at this table/.test(t)) throw new Error(t);
        await noSideways(host, '#sheet-body');
        await shot(host, `subclass-missing-dm-${tag}`);
        await closeMenu(host);
        if (/is not loaded at this table/.test(await player.evaluate(() => document.body.innerText))) throw new Error('the player was shown the DM\'s note');
        if (got.some((f) => /is not loaded at this table/.test(f))) throw new Error('the DM\'s note was sent to the player');
        await shot(player, `subclass-missing-player-${tag}`);
      });
      await run.do('the manager reads the pack: subclasses listed with a reading and a tier each, then Add', async () => {
        await openManager();
        await host.setInputFiles('#pm-file', { name: 'ember-folk.json', mimeType: 'application/json', buffer: Buffer.from(emberSubclassPack()) }); await waitShown(host, '#pm-review');
        const t = await host.textContent('#pm-review');
        if (!/Holds 2 subclasses/.test(t) || !/Subclasses \(2\)/.test(t) || !/Paladin subclass · 2 features: 1 auto, 1 manual/.test(t) || !/Bard subclass · 1 feature: 1 manual/.test(t)) throw new Error(t.slice(0, 500));
        if (/not read/.test(t)) throw new Error(`a subclass is listed as not read: ${t.slice(0, 400)}`);
        const names = await host.$$eval('#pm-review .pm-entry.pm-subclass[data-entry] .pm-name', (l) => l.map((n) => n.textContent));
        if (names.length !== 2 || !names.some((n) => /Oath of the Ember/.test(n)) || !names.some((n) => /College of Embers/.test(n))) throw new Error(`entries: ${names.join(' | ')}`);
        await host.evaluate(() => document.querySelector('#pm-review .pm-entry.pm-subclass[data-entry]').open = true);
        const r = await host.textContent('#pm-review .pm-entry.pm-subclass[data-entry]');
        if (!/Kindle/.test(r) || !/Hearth Vow/.test(r) || !/The DM does this|DM/.test(r)) throw new Error(`the reading: ${r.slice(0, 500)}`);
        await noSideways(host, '#pm .pm-body');
        await shot(host, `subclass-review-${tag}`);
        await host.click('#pm-go');
        await waitShown(host, '.pm-pack[data-pack="ember-folk"]');
        await wait(player, () => window.hextable.packs.built.includes('ember-folk'), null, 10000);
        const l = await host.textContent('.pm-pack[data-pack="ember-folk"]');
        if (!/2 subclasses/.test(l)) throw new Error(l);
        await host.evaluate(() => { const d = document.querySelector('.pm-pack[data-pack="ember-folk"] details.pm-entries'); if (d) d.open = true; });
        await shot(host, `subclass-manager-${tag}`);
        const pp = await player.evaluate(() => window.hextable.packs.built);
        if (!pp.includes('ember-folk')) throw new Error('the player did not build the pack');
        await host.click('#pm .pm-close'); await waitShown(host, '#pm', false); await closeMenu(host);
      });
      await run.do('Refresh from sheet brings the oath in: the DM\'s note is gone and both headers name it', async () => {
        await pickOrsolya(host); await openMenu(host, 'sheet'); await waitShown(host, '#sheet-body');
        const back = await host.textContent('#sheet-subclass-missing');
        if (!/the table has it again/.test(back) || !/Refresh from sheet/.test(back)) throw new Error(`with the pack back and the record not remade: ${back}`);
        await host.click('#sheet-refresh');
        await wait(host, () => /Paladin \(Oath of the Ember\)/.test(document.querySelector('#c-sub').textContent), null, 10000);
        await wait(player, () => !document.querySelector('#card').hidden && /Paladin \(Oath of the Ember\)/.test(document.querySelector('#c-sub').textContent), null, 10000);
        if (await shown(host, '#sheet-subclass-missing')) throw new Error('the note stayed');
        const t = await host.textContent('#sheet-body');
        if (!/Kindle/.test(t)) throw new Error('the oath\'s feature is not on the sheet');
        await closeMenu(host);
      });
      await run.do('the build sheet\'s Subclass list: the SRD subclass and the table\'s of this class (not the bard\'s), names as text, the chosen one explained', async () => {
        await pickOrsolya(host); await openTab(host, 'dm'); await host.click('#qe-edit'); await waitShown(host, '#qb');
        const opts = await host.$$eval('#qb-subclass option', (l) => l.map((o) => [o.value, o.textContent]));
        const want = [['', 'Choose a subclass'], ['devotion', 'Oath of Devotion'], [OATH, 'Oath of the Ember (homebrew)']];
        if (JSON.stringify(opts) !== JSON.stringify(want)) throw new Error(`the list: ${JSON.stringify(opts)}`);
        if (await host.$eval('#qb-subclass', (s) => s.value) !== OATH) throw new Error('the character\'s own subclass is not the selected one');
        const note = await host.textContent('#qb-subclass-note');
        if (!/from the pack ember-folk/.test(note) || !/hearth-fire/.test(note)) throw new Error(note);
        await noSideways(host, '#qb');
        const bb = await (await host.$('#qb-subclass')).boundingBox();
        if (bb.height < 30) throw new Error(`the list is ${bb.height}px tall`);
        await shot(host, `subclass-build-edit-${tag}`);
        await host.click('#qb-close'); await waitShown(host, '#qb', false);
        await host.click('#qb-add'); await waitShown(host, '#qb');
        await host.selectOption('#qb-class', 'bard'); await host.selectOption('#qb-levelsel', '3');
        const bard = await host.$$eval('#qb-subclass option', (l) => l.map((o) => o.textContent));
        if (JSON.stringify(bard) !== JSON.stringify(['Choose a subclass', 'College of Lore', 'College of Embers (homebrew)'])) throw new Error(`the bard's list: ${JSON.stringify(bard)}`);
        await host.selectOption('#qb-subclass', 'hb-ember-folk-college-of-embers');
        await wait(host, () => /College of Embers/.test(document.querySelector('#qb-subclass-note')?.textContent ?? '') || /Bards who sing/.test(document.querySelector('#qb-subclass-note')?.textContent ?? ''));
        await shot(host, `subclass-build-new-${tag}`);
        await host.click('#qb-close'); await waitShown(host, '#qb', false); await closeMenu(host);
      });
      await run.do('the import report names the homebrew subclass the importer matched, before anything changes', async () => {
        const before = await host.evaluate(() => Object.keys(window.hextable.state.entities).length);
        await openTab(host, 'dm'); await waitShown(host, '#dm-qe .fgi-open');
        await host.evaluate(() => { document.querySelector('#fgi-file').value = ''; });
        await host.setInputFiles('#fgi-file', EMBER_FIXTURE); await waitShown(host, '#fgi-summary');
        const t = await host.textContent('#fgi-homebrew-subclass');
        if (!/matched the table's homebrew subclass Oath of the Ember \(pack ember-folk\)/.test(t)) throw new Error(t);
        const sum = await host.textContent('#fgi-summary');
        if (sum.includes('hb-ember-folk') || !/\(Oath of the Ember\)/.test(sum) || !/a homebrew subclass: Oath of the Ember/.test(sum)) throw new Error(sum.slice(0, 500));
        if (await shown(host, '#fgi-adjustments') && /subclass/i.test(await host.textContent('#fgi-adjustments'))) throw new Error('a stand-in is listed beside the match');
        await noSideways(host, '#fgi');
        await shot(host, `subclass-import-${tag}`);
        if (await host.evaluate(() => Object.keys(window.hextable.state.entities).length) !== before) throw new Error('the table changed before the DM confirmed');
        await host.click('#fgi-cancel'); await waitShown(host, '#fgi', false); await closeMenu(host);
      });
      await run.do('a player\'s page that loses the pack says "subclass not loaded" again, with no page error, and the pack coming back names the oath', async () => {
        if (!inject) throw new Error('the player\'s socket is not routed');
        const lastPacks = [...got].reverse().find((f) => /"t":"packs"/.test(f));
        if (!lastPacks) throw new Error('the player was sent no packs message');
        await pickOrsolya(player);
        inject(JSON.stringify({ t: 'packs', packs: [] }));
        await wait(player, () => /Paladin \(subclass not loaded\)/.test(document.querySelector('#c-sub').textContent), null, 10000).catch(async () => { throw new Error(`header: ${await sub(player)}`); });
        await shot(player, `subclass-lost-player-${tag}`);
        inject(lastPacks);
        await wait(player, () => window.hextable.packs.built.includes('ember-folk'), null, 10000);
        await wait(player, () => /Paladin \(Oath of the Ember\)/.test(document.querySelector('#c-sub').textContent), null, 10000).catch(async () => { throw new Error(`header after: ${await sub(player)}`); });
      });
    } finally { await hostCtx.close(); await playerCtx.close(); }
  });
}

export default async function (browser, url) {
  await solo(browser, url, 'homebrew solo: on a phone, with touch', PHONE, 'phone');
  await solo(browser, url, 'homebrew solo: at desktop size', DESKTOP, 'desktop');
  await table(browser, url, 'homebrew: the DM at desktop size, a phone player', DESKTOP, PHONE, 'desktop');
  await table(browser, url, 'homebrew: the DM on a phone, a desktop player', PHONE, DESKTOP, 'phone');
  await subclassTable(browser, url, 'homebrew subclasses: the DM at desktop size, a phone player', DESKTOP, PHONE, 'desktop');
  await subclassTable(browser, url, 'homebrew subclasses: the DM on a phone, a desktop player', PHONE, DESKTOP, 'phone');
  await choiceSolo(browser, url, 'a feature that asks for a skill or a tool: on a phone, with touch', PHONE, 'phone');
  await choiceSolo(browser, url, 'a feature that asks for a skill or a tool: at desktop size', DESKTOP, 'desktop');
}
