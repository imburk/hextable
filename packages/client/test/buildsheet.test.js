// The build screen's pure part: how many options a feature that picks from a list allows (`pickLimit`), a number
// (Metamagic) or by the class table (Eldritch Invocations, #232). The client imports the rules as ./shared, so the test lays
// the two side by side in a temporary folder, as actionpanel.test.js does. Not looked at in a browser.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'buildsheet-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { pickLimit } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));
const { featuresOf } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));

const of = (sheet, id) => featuresOf(sheet).find((x) => x.f.id === id && !x.option);
test('pickLimit: the Invocations column for a warlock, a plain number for Metamagic', () => {
  const wl = (level) => ({ name: 'Mor', class: 'warlock', level, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } });
  assert.deepEqual([1, 2, 5, 7, 9, 12, 15, 18].map((l) => pickLimit(of(wl(l), 'eldritch-invocations'))), [1, 3, 5, 6, 7, 8, 9, 10]);
  assert.equal(pickLimit(of({ name: 'Jed', class: 'sorcerer', level: 2, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } }, 'metamagic')), 2);
});
