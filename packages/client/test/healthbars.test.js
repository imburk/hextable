// Health bars over creatures (docs/specs/one-token-menu.md, Decision 7a, stage M7): what the bar over a creature shows, from the viewer's
// role, the creature's side, the table's rule and this device's preference. `barFor` is pure; the pictures are the smoke pass `healthbars`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), client = join(here, '..'), tmp = mkdtempSync(join(tmpdir(), 'healthbars-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['three-build.js', 'floors.js']) cpSync(join(client, f), join(tmp, f));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const { barFor, hpFraction } = await import(pathToFileURL(join(tmp, 'three-build.js')).href);

// What a player is sent of a foe: a word, never the numbers. The party's records carry the numbers.
const foe = (health) => ({ side: 'foe', hp: health === 'down' || health === 'dead' ? 0 : 1, health, dead: health === 'dead' });
const pc = (hp, maxHp) => ({ side: 'party', hp, maxHp, health: 'healthy' });

test('a bloodied foe is half, with a notch; healthy is full and down is empty, with none', () => {
  assert.deepEqual(barFor(foe('healthy')), { show: true, frac: 1, notch: false });
  assert.deepEqual(barFor(foe('bloodied')), { show: true, frac: 0.5, notch: true });
  assert.deepEqual(barFor(foe('down')), { show: true, frac: 0, notch: false });
  assert.deepEqual(barFor(foe('dead')), { show: true, frac: 0, notch: false });
  assert.equal(hpFraction(foe('bloodied')), 0.5, 'the 0.45 guess is gone');
});

test('the party bars are exact, whatever the table rule; at 0 the bar is empty', () => {
  for (const foeHealth of ['rough', 'hidden']) {
    assert.deepEqual(barFor(pc(7, 20), { foeHealth }), { show: true, frac: 0.35, notch: false });
    assert.deepEqual(barFor(pc(0, 20), { foeHealth }), { show: true, frac: 0, notch: false });
  }
});

test('Hidden: a player sees no bar over a foe, but the party and the DM are unchanged', () => {
  assert.equal(barFor(foe('bloodied'), { foeHealth: 'hidden' }).show, false);
  assert.equal(barFor(foe('healthy'), { foeHealth: 'hidden' }).show, false);
  assert.equal(barFor(pc(5, 10), { foeHealth: 'hidden' }).show, true);
  assert.deepEqual(barFor({ side: 'foe', hp: 9, maxHp: 30 }, { dm: true, foeHealth: 'hidden' }), { show: true, frac: 0.3, notch: false });
});

test('the DM always sees exact bars for foes, never a notch', () => {
  for (const foeHealth of ['rough', 'hidden']) assert.deepEqual(barFor({ side: 'foe', hp: 15, maxHp: 30 }, { dm: true, foeHealth }), { show: true, frac: 0.5, notch: false });
  assert.equal(barFor({ side: 'foe', hp: 29, maxHp: 30 }, { dm: true }).frac, 29 / 30);
});

test('the preference: never draws nothing; in a fight draws only while one runs; always is the default', () => {
  for (const e of [foe('healthy'), pc(5, 10)]) {
    assert.equal(barFor(e, { pref: 'never', fight: true }).show, false);
    assert.equal(barFor(e, { pref: 'fight', fight: false }).show, false);
    assert.equal(barFor(e, { pref: 'fight', fight: true }).show, true);
    assert.equal(barFor(e, { fight: false }).show, true);
  }
  assert.equal(barFor({ side: 'foe', hp: 5, maxHp: 10 }, { dm: true, pref: 'never' }).show, false, 'the DM chose Never on this device');
});

test('a foe record that carries numbers (a viewer sent them) is still read as the word for a player', () => {
  assert.deepEqual(barFor({ side: 'foe', hp: 4, maxHp: 10 }), { show: true, frac: 0.5, notch: true });
});
