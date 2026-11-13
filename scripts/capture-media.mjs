// Captures the README pictures from the starter scenario: docs/media/*.png and a short GIF.
// Usage: PORT=8104 node scripts/capture-media.mjs   (the table server must already be running on PORT;
// needs global playwright and ffmpeg). Not part of `npm test`.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs/media');
const TMP = process.env.FRAMES || '/tmp/hextable-frames';
const URL_ = `http://localhost:${process.env.PORT || 8080}/`;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const { chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ARGS });
const errors = [];

async function open(viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_);
  await page.click('#lobby-solo');
  await page.waitForFunction(() => window.hextable && Object.keys(window.hextable.state.entities).length > 3);
  await sleep(2500);
  return page;
}
const act = (page, a) => page.evaluate((x) => window.hextable.act(x), a);

// 1. Phone screenshot, then desktop screenshot of the same opening scene.
let page = await open({ width: 390, height: 844 }, true);
for (let i = 0; i < 4; i++) {                                 // walking up to the goblins starts the fight
  await page.evaluate((i) => { const h = window.hextable, me = h.state.entities.fighter.pos; h.act({ type: 'move', actor: 'fighter', to: { q: me.q + 2, r: me.r - 1 + (i % 2), z: me.z } }); }, i);
  await sleep(700);
}
for (let i = 0; i < 10; i++) {                                // the goblins' opening turns play out
  await sleep(1000);
  await page.evaluate(() => window.hextable.timeline.skip());
}
await page.screenshot({ path: join(OUT, 'phone.png') });
await page.context().close();

// 2. Desktop: the screenshot is taken in the fight; frames for the GIF on the way.
page = await open({ width: 1280, height: 800 });
let n = 0;
const frame = async (count = 1, gap = 0) => { for (let i = 0; i < count; i++) { await page.screenshot({ path: join(TMP, `f${String(n++).padStart(3, '0')}.png`) }); if (gap) await sleep(gap); } };
const info = () => page.evaluate(() => { const S = window.hextable.state; return { enc: S.encounter ? { turn: S.encounter.order[S.encounter.turn]?.id, round: S.encounter.round } : null, ents: Object.fromEntries(Object.values(S.entities).map((e) => [e.id, { pos: e.pos, hp: e.hp, side: e.side }])) }; });

await frame(2, 150);                                          // roaming, standing still
for (let i = 0; i < 4; i++) {                                 // the fighter walks toward the goblins
  const s = await info(); const me = s.ents.fighter.pos;
  await act(page, { type: 'move', actor: 'fighter', to: { q: me.q + 2, r: me.r - 1 + (i % 2), z: me.z } });
  await sleep(250); await frame(2, 220);
}
const s0 = await info();
console.log('fighter at', JSON.stringify(s0.ents.fighter.pos));
const foe = s0.ents.m1.pos;
if (!(await info()).enc) await act(page, { type: 'startEncounter', center: foe });   // the hex arena appears (walking up usually starts it)
await sleep(300); await frame(5, 220);
let shot = false;
// Party turns: move next to a goblin and attack; monsters play themselves.
for (let guard = 0; guard < 12; guard++) {
  const s = await info();
  if (!s.enc) break;
  const who = s.enc.turn;
  if (s.ents[who]?.side !== 'party') { await sleep(500); await frame(2, 300); continue; }
  const target = Object.entries(s.ents).filter(([, e]) => e.side === 'foe' && e.hp > 0)[0][0];
  if (who === 'fighter') {
    if (!shot) { await sleep(1200); await page.screenshot({ path: join(OUT, 'desktop.png') }); shot = true; }
    const t = s.ents[target].pos; const me = s.ents[who].pos;
    await act(page, { type: 'move', actor: who, to: { q: t.q - 1, r: t.r, z: t.z } });
    await sleep(300); await frame(3, 250);
    const e = await page.evaluate(() => window.hextable.state.entities.fighter);
    await act(page, { type: 'attack', actor: who, target, attack: e.attacks.find((a) => a.type === 'melee').id });
    await sleep(500); await frame(6, 250);
    break;
  }
  await act(page, { type: 'endTurn', actor: who });
  await sleep(300); await frame(2, 200);
}
console.log('frames', n, 'page errors', errors.length, errors.slice(0, 3));
await browser.close();

// 3. Assemble the GIF: 800 px wide, 5 frames a second, one shared palette.
const fps = Number(process.env.FPS || 4);
const step = Math.max(1, Math.ceil(n / 30));                  // keep about 30 frames so the file stays small
execSync(`${FFMPEG} -y -loglevel error -framerate ${fps} -i ${TMP}/f%03d.png -vf "select='not(mod(n\\,${step}))',setpts=N/(${fps}*TB),scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ${OUT}/hextable.gif`, { stdio: 'inherit' });
console.log(readdirSync(OUT).join(' '));
if (errors.length) process.exitCode = 1;
