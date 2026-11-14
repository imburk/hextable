
import { sleep, scenario, open, playSolo } from './lib.mjs';

// ---------- vendored Three.js (R10) ----------
// A normal page load fetches nothing under vendor/. Then, in the page, the vendored module is imported (gzipped by the
// server), a WebGLRenderer on an offscreen canvas draws a cube, and GLTFLoader and SkeletonUtils import.
async function threePass(browser, url, label, opts) {
  await scenario(label, async (run) => {
    const ctx = await browser.newContext(opts);
    try {
      const page = await ctx.newPage();
      run.watch(page);
      const asked = [], got = [];
      page.on('request', (r) => asked.push(r.url()));
      page.on('response', (r) => { if (r.url().includes('/vendor/')) got.push({ url: r.url(), enc: r.headers()['content-encoding'], vary: r.headers()['vary'], status: r.status() }); });
      await run.do('a normal page load and a solo game fetch nothing under vendor/', async () => {
        await open(page, url); await playSolo(page); await sleep(1000);
        const v = asked.filter((u) => u.includes('/vendor/'));
        if (v.length) throw new Error(`the page fetched ${v.join(', ')}`);
      });
      await run.do('the vendored module loads, draws a cube on an offscreen canvas, GLTFLoader and SkeletonUtils import', async () => {
        const r = await page.evaluate(async () => (await import('/three-check.js')).checkThree());
        if (!/^\d+$/.test(String(r.revision))) throw new Error(`revision: ${JSON.stringify(r)}`);
        if (r.pixel[0] < 200 || !(r.drawCalls >= 1)) throw new Error(`result: ${JSON.stringify(r)}`);
        console.log(`       three r${r.revision}, webgl2 ${r.webgl2}, middle pixel ${r.pixel}, ${r.drawCalls} draw call(s)`);
      });
      await run.do('the vendored files came over gzipped', async () => {
        const want = ['three.module.js', 'three.core.js', 'GLTFLoader.js', 'SkeletonUtils.js', 'BufferGeometryUtils.js'];
        for (const f of want) {
          const r = got.find((g) => g.url.endsWith('/' + f));
          if (!r) throw new Error(`${f} was not requested`);
          if (r.status !== 200 || r.enc !== 'gzip' || !/accept-encoding/i.test(r.vary ?? '')) throw new Error(`${f}: ${JSON.stringify(r)}`);
        }
        // and the server sends it plain to a client that does not accept gzip
        const plain = await fetch(url + 'vendor/three/three.module.js', { headers: { 'accept-encoding': 'identity' } });
        if (plain.headers.get('content-encoding')) throw new Error('identity request got a content-encoding');
      });
    } finally { await ctx.close(); }
  });
}

// Registered in scripts/smoke.mjs as SMOKE_ONLY=three.
export default async function (browser, url) {
  await threePass(browser, url, 'three: the vendored library at 1280x800', { viewport: { width: 1280, height: 800 } });
}
