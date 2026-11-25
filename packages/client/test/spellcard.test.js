// The spell card (#787): what it says, where it goes, and the markup callers use. The page parts (hover, press, keys) are the `spellcard` smoke pass.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'spellcard-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
await imp('shared/engine.js');
const { cardModel, placeClear, spellAttrs, decorateLine, rangeWords, durationWords, componentWords, HOVER_MS } = await imp('spellcard.js');
const { CONTENT } = await imp('shared/content/index.js');

test('a levelled spell: header, facts, text, the reading and higher levels', () => {
  const m = cardModel('fireball');
  assert.equal(m.name, 'Fireball'); assert.equal(m.meta, 'Level 3 Evocation');
  assert.deepEqual(m.facts, [['Casting time', '1 action'], ['Range', '150 feet'], ['Components', 'V, S, M'], ['Duration', 'Instantaneous']]);
  assert.equal(m.text, CONTENT.spells.fireball.text);
  assert.match(m.tierText, /^The game applies most; the DM applies: /);
  assert.ok(m.lines.some((l) => /Dexterity saving throw/.test(l.text)));
  assert.ok(m.lines.every((l) => !/^"|^Components:|^Tier:/.test(l.text)));
  assert.ok(m.higher.length && /higher slot/.test(m.higher[0]));
  assert.deepEqual(m.notes, []);
});
test('concentration and cantrips', () => {
  const m = cardModel('moonbeam');
  assert.deepEqual(m.tags, ['Concentration']); assert.equal(m.facts[3][1], 'Concentration, up to 1 minute');
  assert.equal(cardModel('prestidigitation').meta, 'Transmutation cantrip');
});
test('the tier in words', () => {
  assert.equal(cardModel('prestidigitation').tierText, 'The DM applies it.');
  assert.deepEqual(cardModel('prestidigitation').lines, []);
  const auto = Object.keys(CONTENT.spells).find((id) => CONTENT.spells[id].tier === 'auto');
  assert.equal(cardModel(auto).tierText, 'The game applies all of it.');
});
test('a ritual says so; every pack spell makes a card without throwing', () => {
  const rit = Object.keys(CONTENT.spells).find((id) => CONTENT.spells[id].ritual);
  assert.ok(cardModel(rit).tags.includes('Ritual'));
  for (const id of Object.keys(CONTENT.spells)) { const m = cardModel(id); assert.ok(m.known && m.name && m.tierText, id); }
});
test('a spell this page does not have gets a name and nothing else', () => {
  const m = cardModel('hb-x-nothing');
  assert.equal(m.known, false); assert.equal(m.text, ''); assert.deepEqual(m.facts, []);
});
test('words for range, components, duration', () => {
  assert.equal(rangeWords('self'), 'Self'); assert.equal(rangeWords('touch'), 'Touch'); assert.equal(rangeWords(5), '5 feet'); assert.equal(rangeWords(5280), '1 mile'); assert.equal(rangeWords(2640000), '500 miles');
  assert.equal(componentWords(['v', 's']), 'V, S'); assert.equal(durationWords('until dispelled', false), 'Until dispelled');
});
test('the card stays inside the screen and clear of the die', () => {
  const vw = 390, vh = 844, die = { left: 160, right: 230, top: 760, bottom: 830 };
  const row = { left: 10, right: 380, top: 640, bottom: 690 };
  const p = placeClear(row, 340, 500, vw, vh, die);
  assert.ok(p.left >= 12 && p.left + p.width <= vw - 12);
  assert.ok(p.top + Math.min(500, p.maxH) <= die.top, 'above the die');
  assert.ok(p.top >= 12);
  const q = placeClear({ left: 10, right: 380, top: 100, bottom: 150 }, 340, 200, vw, vh, die);
  assert.ok(q.top >= 150 && q.top + 200 <= die.top, 'below a row high on the screen, still clear');
  assert.deepEqual(placeClear(row, 340, 100, vw, vh, null), placeClear(row, 340, 100, vw, vh));
});
test('markup for callers', () => {
  assert.equal(spellAttrs('fireball'), ' data-spellcard="fireball"');
  assert.equal(spellAttrs('a"b'), ' data-spellcard="a&quot;b"');
  assert.equal(decorateLine('Ana casts Fireball.', 'fireball'), 'Ana casts <span class="sc-name" data-spellcard="fireball" tabindex="0">Fireball</span>.');
  assert.equal(decorateLine('Ana hits.', 'fireball'), 'Ana hits.');
  assert.ok(HOVER_MS < 1000);
});
test('the log keeps the spell of a cast, so its name can open the card', async () => {
  const L = await imp('logview.js');
  const m = L.createLog();
  const e = L.add(m, { type: 'cast', actor: 'a', spell: 'fireball', name: 'Fireball', t: 1 }, ['Ana casts Fireball.', '']);
  assert.equal(e.spell, 'fireball');
  assert.equal(L.add(m, { type: 'move', t: 2 }, ['Ana moves.', '']).spell, null);
  const h = L.html(L.view(m, {}), { isOpen: () => true });
  assert.match(h, /<span class="sc-name" data-spellcard="fireball"/);
});
test('the action panel row of a spell carries its id', async () => {
  const src = (await import('node:fs')).readFileSync(join(tmp, 'actionpanel.js'), 'utf8');
  assert.match(src, /spellAttrs\(r\.spell\)/);
});
