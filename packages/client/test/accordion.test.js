// M10 of docs/specs/one-token-menu.md (Decision 4d, R21, R27): one accordion for every page with sections. The page as written (index.html) marks the pages
// and their sections; accordion.js makes the bars and works out where the closed bars of a pinned page go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barRows, gridPlan } from '../accordion.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../drawer.css', import.meta.url), 'utf8') + readFileSync(new URL('../actionpanel.css', import.meta.url), 'utf8');
// The groups of a character's page, read from actionpanel.js as written (it imports the rules as ./shared, which only the built page has).
const GROUP_ORDER = (() => { const m = readFileSync(new URL('../actionpanel.js', import.meta.url), 'utf8').match(/export const GROUP_ORDER = (\{[^;]+\});/); assert.ok(m); return JSON.parse(m[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":')); })();
const panel = (id) => { const a = html.indexOf(`<section id="${id}" class="tabpanel"`); assert.ok(a >= 0, id); const b = html.indexOf('class="tabpanel"', a + 30); return html.slice(a, b < 0 ? undefined : b); };
const secs = (src) => [...src.matchAll(/<section id="([\w-]+)" data-sec="([\w-]+)" data-tip="([^"]*)"( hidden)?><h3>([^<]+)<\/h3>/g)].map((m) => ({ id: m[1], sec: m[2], tip: m[3], title: m[5] }));

test('Setup, Log and chat and DM tools are marked as pages with sections; the other screens are one list', () => {
  for (const id of ['settings', 'log', 'dm']) assert.match(panel(id), /^<section id="[\w-]+" class="tabpanel"[^>]* data-acc[ >]/, `#${id} is an accordion`);
  for (const id of ['tracker', 'dicepanel', 'about']) assert.doesNotMatch(panel(id).split('>')[0], /data-acc/, `#${id} has no sections`);
});

test('every section of Setup has a bar: a name for the path and a line that says what it holds', () => {
  const list = secs(panel('settings'));
  assert.deepEqual(list.map((s) => s.sec), ['display', 'dice', 'menu', 'chars', 'rules', 'help', 'leave']);
  for (const s of list) assert.ok(s.tip.length > 10 && s.tip.length < 60, `${s.title}: a tip of one line ("${s.tip}")`);
});

test('Log and chat is Handouts (hidden until there are any), the log, and Talk; it opens on the log', () => {
  const log = panel('log'), list = secs(log);
  assert.deepEqual(list.map((s) => [s.sec, s.title]), [['handouts', 'Handouts'], ['log', 'Log'], ['talk', 'Talk']]);
  assert.match(log, /<section id="handouts" data-sec="handouts"[^>]* hidden>/);
  assert.match(log, /data-acc-first="log"/);
  const at = (x) => { const i = log.indexOf(x); assert.ok(i >= 0, x); return i; };
  assert.ok(at('data-sec="log"') < at('id="log-list"') && at('id="log-list"') < at('data-sec="talk"') && at('data-sec="talk"') < at('id="say-form"') && at('id="say-form"') < at('id="note-form"'));
  assert.ok(at('id="handouts-list"') < at('data-sec="log"'));
  assert.equal(html.includes('id="btn-handouts"'), false, 'Handouts is no place of its own');
  assert.match(html, /id="tab-log"[^>]*>.*<b id="ho-badge" hidden>/, 'the Log symbol carries the handouts\' badge (question 27)');
});

test('closed bars are shared out over as few rows as hold them, as even as they go', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10].map((n) => barRows(n)), [[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2], [3, 3, 3], [3, 3, 2, 2]]);
  for (let n = 1; n <= 14; n++) { const r = barRows(n); assert.equal(r.reduce((a, b) => a + b, 0), n); assert.ok(Math.max(...r) <= 3 && Math.max(...r) - Math.min(...r) <= 1, `${n}: ${r}`); }
});

test('a pinned page: the bars before the open section are above it, those after it below, and it has a row to itself', () => {
  for (const state of ['fight', 'free']) {
    const ids = [...GROUP_ORDER[state], 'sheet'];
    for (const open of ids) {
      const p = gridPlan(ids, open), at = ids.indexOf(open);
      assert.equal(p.pinned, true);
      assert.equal(p.rows.filter((r) => r === 'open').length, 1);
      assert.equal(p.rows.indexOf('open'), p.before, 'the open section comes after every row of the bars before it');
      assert.equal(p.before, barRows(at).length); assert.equal(p.after, barRows(ids.length - at - 1).length);
      assert.equal(p.span[open], 6, 'the open section is as wide as the page');
      for (const id of ids) assert.ok([2, 3, 6].includes(p.span[id]), `${id} takes a third, a half or the whole of a row`);
      // every row of bars is full: the spans of the bars before (and after) add up to whole rows of 6
      const sum = (l) => l.reduce((n, id) => n + p.span[id], 0);
      assert.equal(sum(ids.slice(0, at)), 6 * p.before); assert.equal(sum(ids.slice(at + 1)), 6 * p.after);
    }
    // a phone's page (about 420 px under the compact status block) holds every bar at 44 px and 6 px apart with 120 px left for the open section, whichever is open
    for (const open of ids) { const p = gridPlan(ids, open); assert.ok(420 - (p.rows.length - 1) * 50 - 44 >= 120, `${state}, ${open} open: ${p.rows.length} rows`); }
  }
});

test('with none open nothing is pinned: every bar has a row of its own, with its tip', () => {
  const p = gridPlan(['explore', 'heal', 'sheet'], '');
  assert.equal(p.pinned, false); assert.deepEqual(p.rows, ['bar', 'bar', 'bar']); assert.deepEqual(p.span, { explore: 6, heal: 6, sheet: 6 });
  assert.equal(gridPlan(['explore'], 'gone').pinned, false, 'a section that is not shown is not open');
});

test('a pinned page never squeezes its open section under 120 px, and a bar is never under 44 px', () => {
  assert.match(css, /\.acc-sec\.open \{ flex: 1 0 164px;/, 'the open section of Setup, Log and DM tools: its 44 px bar and 120 px');
  assert.match(readFileSync(new URL('../actionpanel.js', import.meta.url), 'utf8'), /minmax\(164px, 1fr\)/, 'the open section of a character\'s page');
  for (const m of css.matchAll(/\.(?:acc|ap)-bar[^{]*\{[^}]*min-height: (\d+)px/g)) assert.ok(Number(m[1]) >= 44, m[0]);
});
