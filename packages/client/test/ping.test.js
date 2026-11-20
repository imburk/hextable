// The client's side of a ping (#599): its colour, which cell a press means, and the marks drawn. The client imports the rules as ./shared, so the
// test lays the two side by side in a temporary folder, as allowance.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'ping-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { pingColor, cellAtPoint, createPings, PING_MS } = await imp('ping.js');
const { newGame } = await imp('shared/scenario.js');

test('colour: the DM is gold, a player has their character\'s, anyone else a steady hue of their own', () => {
  const s = newGame(5), pc = Object.values(s.entities).find((e) => e.side === 'party');
  pc.owner = 'pat'; pc.look = { ...(pc.look ?? {}), color: '#123456' };
  assert.equal(pingColor(s, 'dm'), '#e0b040');
  assert.equal(pingColor(s, 'pat'), '#123456');
  assert.equal(pingColor(s, 'kim'), pingColor(s, 'kim'));
  assert.notEqual(pingColor(s, 'kim'), pingColor(s, 'lee'));
  assert.match(pingColor(null, 'x'), /^hsl\(/);
});

test('cell: the highest floor that is really there wins; a point on no cell is null', () => {
  const s = newGame(5), l = s.map.levels[0], [k] = Object.keys(l.tiles), [q, r] = k.split(',').map(Number), z = l.z + (l.tiles[k].h ?? 0);
  assert.deepEqual(cellAtPoint(s, () => ({ q, r }), 10, 10), { q, r, z });
  assert.equal(cellAtPoint(s, () => ({ q: 9999, r: 9999 }), 10, 10), null);
  assert.equal(cellAtPoint(s, () => null, 10, 10), null);
  assert.equal(cellAtPoint({}, () => ({ q, r }), 1, 1), null);
});

// Just enough of a page for the marks.
function fakeDoc() {
  const mk = () => { const el = { children: [], style: { setProperty(k, v) { this[k] = v; } }, className: '', attrs: {}, text: '', removed: false,
    append(...c) { this.children.push(...c); }, remove() { this.removed = true; }, setAttribute(k, v) { this.attrs[k] = v; } };
    Object.defineProperty(el, 'textContent', { set(v) { el.text = v; }, get() { return el.text; } }); return el; };
  return { createElement: mk, host: mk() };
}

test('a ping stays three seconds, follows the renderer, and a renderer that cannot place it draws nothing', () => {
  const d = fakeDoc(); let t = 0, frames = []; let at = { x: 10, y: 20 };
  const P = createPings({ screenOf: () => at, host: d.host, doc: d, now: () => t, raf: (f) => frames.push(f) });
  const m = P.ping({ at: { q: 1, r: 2, z: 0 }, name: 'Pat', color: '#abc' });
  assert.equal(P.count(), 1);
  assert.equal(m.el.children[1].text, 'Pat');
  assert.equal(m.el.style['--ping-color'], '#abc');
  assert.match(m.el.style.transform, /10px, 20px/);
  t = 1000; at = { x: 30, y: 40 }; frames.shift()();
  assert.match(m.el.style.transform, /30px, 40px/);
  at = null; t = 1500; frames.shift()();
  assert.equal(m.el.style.display, 'none');
  t = PING_MS; frames.shift()();
  assert.equal(m.el.removed, true); assert.equal(P.count(), 0); assert.equal(frames.length, 0);
});

test('the ring starts where the press is, and stop() takes it away', () => {
  const d = fakeDoc(), P = createPings({ screenOf: () => null, host: d.host, doc: d });
  P.start(12, 34, 1000);
  const ring = d.host.children[0];
  assert.deepEqual([ring.style.left, ring.style.top, ring.style['--hold-ms']], ['12px', '34px', '1000ms']);
  P.stop(); assert.equal(ring.removed, true);
});
