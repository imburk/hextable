// About says what the law asks it to say, word for word. Each statement is compared with its source, so a change to LICENSE, the
// vendored Three.js licence, the version or (not that it will) the SRD's own legal page shows here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SRD_ATTRIBUTION, HEXTABLE_LICENCE, THREE_LICENCE, GAME_VERSION, FONTS, MODEL_PACKS, aboutHTML, linked } from '../about.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ').trim();

test('the SRD attribution is the statement the SRD asks for, as its Legal Information page gives it', () => {
  const srd = flat(read('reference/srd52/srd52-flow.txt').slice(0, 2500));
  const from = srd.indexOf('This work includes material'), to = srd.indexOf('legalcode.') + 'legalcode.'.length;
  assert.ok(from > 0 && to > from, 'the statement is on the SRD page');
  assert.equal(SRD_ATTRIBUTION, srd.slice(from, to));
});

test("Hextable's licence and Three.js's are the files that ship, and the version is the package's", () => {
  assert.equal(flat(HEXTABLE_LICENCE.text), flat(read('LICENSE')));
  assert.equal(flat(THREE_LICENCE.text), flat(read('packages/client/vendor/three/LICENSE')));
  assert.equal(GAME_VERSION, JSON.parse(read('package.json')).version);
  assert.match(read('packages/client/vendor/README.md'), /r187/);
  assert.match(THREE_LICENCE.name, /r187/);
});

test('every font the page loads is credited', () => {
  const page = decodeURIComponent(read('packages/client/index.html').match(/fonts\.googleapis\.com\/css2\?([^"]+)"/)[1]);
  const loaded = [...page.matchAll(/family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, ' ')).sort();
  assert.deepEqual(FONTS.map((f) => f.name).sort(), loaded);
});

test('the page says it as text, with the addresses as links and nothing from outside escaped into markup', () => {
  const html = aboutHTML({ stateVersion: 18, tableVersion: 17 });
  assert.ok(html.includes('id="ab-srd-text"') && html.includes('href="https://www.dndbeyond.com/srd"'));
  assert.ok(flat(html.replace(/<[^>]+>/g, '')).includes(SRD_ATTRIBUTION.replace('https://www.dndbeyond.com/srd.', 'https://www.dndbeyond.com/srd.')));
  assert.ok(html.includes('state version 18') && html.includes('version 17'));
  assert.equal(MODEL_PACKS.length === 0, html.includes('None yet'));
  assert.equal(linked('<b>x</b> http://a.b/c.'), '&lt;b&gt;x&lt;/b&gt; <a href="http://a.b/c" target="_blank" rel="noopener noreferrer">http://a.b/c</a>.');
});
