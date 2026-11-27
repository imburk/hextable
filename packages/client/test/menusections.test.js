// M5 of docs/specs/one-token-menu.md, checked on the page itself (index.html is the menu's structure): DM tools is a list of seven screens with every
// DM control inside one of them, Setup is the seven sections of Decision 4d in their order, and Log and chat has a Say box. A control that falls out of
// its screen would be on no screen at all, since a screen's sections are hidden until its row is tapped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const between = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, `${from} ... ${to}`); return html.slice(a, b); };
const dm = between('<section id="dm" class="tabpanel"', '<section id="settings" class="tabpanel"');
const setup = between('<section id="settings" class="tabpanel"', '<section id="about" class="tabpanel"');

const DM_SCREENS = [['fight', 'Undo and the fight'], ['creatures', 'Creatures'], ['map', 'Map, sight and light'], ['rules', 'Table rules'], ['time', 'Party and time'], ['scenes', 'Scenes and handouts'], ['file', 'Table file']];

test('DM tools lists the seven screens of Decision 4d, then all of them on one page', () => {
  const rows = [...dm.matchAll(/class="menu-row" data-sec="([\w-]+)"><span class="mr-name">([^<]+)<\/span><span class="mr-sum">([^<]*)</g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(rows.map((r) => [r[0], r[1]]), [...DM_SCREENS, ['all', 'All tools on one page']]);
  for (const r of rows) assert.ok(r[2].length > 10, `${r[1]} says what it holds`);
  const screens = [...dm.matchAll(/<div class="sec-screen" id="dm-sec-([\w-]+)" data-sec="([\w-]+)" data-title="([^"]+)" hidden>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(screens, DM_SCREENS.map(([k, t]) => [k, k, t]), 'one screen for each row, with the row\'s name as its heading, hidden until chosen');
});

test('every DM control is on one of the screens; only what waits for the DM is above the list', () => {
  const index = dm.indexOf('<ul id="dm-index"'), first = dm.indexOf('<div class="sec-screen"');
  assert.ok(index > 0 && first > index);
  const top = [...dm.slice(0, index).matchAll(/ id="([\w-]+)"/g)].map((m) => m[1]);
  for (const id of top) assert.ok(/^(dm|dm-table|dm-fallen|dm-fallen-open|dm-rewards|dm-rewards-open)$/.test(id), `${id} is above the list of screens`);
  // After the last screen closes, nothing but the panel's own end.
  const tail = dm.slice(dm.lastIndexOf('</div>') + 6).trim();
  assert.equal(tail, '</section>', 'no section sits outside the screens, where it would always show');
  // The ids the rest of the app and the smoke passes hold on to are all still there, each once.
  const ids = ['dm-undo', 'dm-redo', 'dm-start', 'dm-end', 'dm-auto', 'dm-pace', 'dm-dice-throw', 'dm-conclusion', 'dm-xpshare', 'dm-engage', 'dm-engage-range', 'dm-passive', 'dm-vertical', 'dm-cover',
    'dm-creature-cover', 'dm-climb', 'dm-square', 'dm-sight', 'dm-unseen-turns', 'dm-ambient', 'dm-torch', 'dm-march', 'dm-spawn', 'dm-hidden', 'dm-cond', 'dm-place', 'dm-hide', 'dm-fly', 'dm-size', 'dm-rest',
    'dm-rest-all', 'dm-refresh-party', 'dm-scene', 'dm-handouts', 'dm-packs', 'dm-qe', 'dm-chron', 'chron-list', 'dm-places', 'dm-leave', 'dm-export', 'dm-new', 'dm-edit', 'dm-stock', 'dm-stock-go', 'dm-chars'];
  for (const id of ids) assert.equal(dm.split(` id="${id}"`).length - 1, 1, `#${id}`);
});

test('a rule of the table is on Table rules, and what runs a fight on Undo and the fight', () => {
  const screen = (k) => { const a = dm.indexOf(`id="dm-sec-${k}"`), b = dm.indexOf('<div class="sec-screen"', a + 1); return dm.slice(a, b < 0 ? undefined : b); };
  for (const id of ['dm-dice-throw', 'dm-conclusion', 'dm-xpshare', 'dm-engage', 'dm-cover', 'dm-climb', 'dm-square']) assert.ok(screen('rules').includes(`id="${id}"`), `#${id} is a table rule`);
  for (const id of ['dm-undo', 'dm-redo', 'dm-start', 'dm-end', 'dm-auto', 'dm-pace']) assert.ok(screen('fight').includes(`id="${id}"`), `#${id} runs the fight`);
  for (const id of ['dm-spawn', 'dm-place', 'dm-chars', 'dm-qe']) assert.ok(screen('creatures').includes(`id="${id}"`), `#${id} is about creatures`);
  for (const id of ['dm-edit', 'dm-sight', 'dm-ambient', 'dm-places']) assert.ok(screen('map').includes(`id="${id}"`), `#${id} is about the map`);
});

test('Setup is the seven sections of Decision 4d, in their order, with the controls it had', () => {
  const heads = [...setup.matchAll(/<section id="([\w-]+)"[^>]*><h3>([^<]+)<\/h3>/g)].map((m) => m[2]);
  assert.deepEqual(heads, ['Display and controls', 'Dice', 'The menu', 'Characters and packs', 'The table\'s rules', 'Help and about', 'Leave the table']);
  for (const id of ['set-theme', 'set-floors', 'set-cutaway', 'set-caves', 'set-look-note', 'set-cam', 'set-token', 'set-motion', 'set-side', 'set-pin', 'set-pin-row', 'set-pin-note', 'set-paneltab', 'set-dm-box',
    'dm-dice-monsters', 'set-table-box', 'pace-table', 'set-rules', 'btn-leave']) assert.equal(setup.split(` id="${id}"`).length - 1, 1, `#${id}`);
  assert.ok(setup.indexOf('id="btn-leave"') > setup.indexOf('Leave the table</h3>'), 'leaving is the last section, apart from the rest');
});

test('Log and chat has a Say box above the private note, and the clock at its head', () => {
  const log = between('<section id="log" class="tabpanel"', '<section id="dicepanel" class="tabpanel"');      // M10: Handouts is a section inside Log and chat, so the panel ends at the next one
  const at = (s) => { const i = log.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('id="log-clock"') < at('id="log-list"') && at('id="log-list"') < at('id="say-form"') && at('id="say-form"') < at('id="note-form"'));
  assert.match(log, /<select id="say-as" aria-label="Say as">/);
  assert.match(log, /<input id="say-text" maxlength="500"/, 'a line is at most what the engine takes (SCENE_LIMITS.say)');
});

test('Waiting for you heads the first level and holds the DM\'s to-do tray (M6)', () => {
  const root = between('<nav id="menu-root"', '<nav id="menu-table"');
  const at = (x) => { const i = root.indexOf(x); assert.ok(i >= 0, x); return i; };
  assert.ok(at('id="menu-waiting"') < at('id="waiting-list"') && at('id="waiting-list"') < at('id="todo-mount"') && at('id="todo-mount"') < at('id="party"'));
  assert.match(root, /<section id="menu-waiting" aria-labelledby="waiting-title" hidden>/, 'not shown until something waits');
  assert.equal(html.split(' id="todo-mount"').length - 1, 1);
});
