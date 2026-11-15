// The feedback report (docs/specs/feedback.md) is built only from what this client showed or sent. The client imports the rules as ./shared,
// so the test lays the two side by side in a temporary folder, as tracker.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'feedback-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { LINE_KINDS, createRecorder, createScrubber, actionArgs, buildReport, fitReport, gather, REPORT_MAX, LOG_LINES, ACTIONS } = await import(pathToFileURL(join(tmp, 'feedback.js')));
const { REPORT } = await import(pathToFileURL(join(here, '../../server/src/feedback.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const FACTS = { build: 'state-v1', mode: 'solo', role: 'dm', renderer: 'gl', theme: 'classic', grid: 'hex', viewport: { w: 390, h: 844 }, touch: true, ua: 'UA', lang: 'en', fight: { on: false }, character: null, map: 'valley' };

test("the log keeps the last 30 shown lines, as shown, and never talk", () => {
  const rec = createRecorder();
  for (let i = 0; i < 40; i++) rec.shown([`line ${i}`, '', 'combat'], 'attack');
  rec.shown(['Someone: “a secret plan”', '', 'talk'], 'attack');
  rec.shown(null, 'attack');
  rec.shown(['a line of a type nobody classified', '', 'combat'], 'brandNewEvent');
  const log = rec.log();
  assert.equal(log.length, LOG_LINES);
  assert.equal(log[0], 'line 10');
  assert.equal(log.at(-1), 'line 39');
  assert.ok(!log.some((l) => /secret/.test(l)));
});

test("an action keeps only its type and short ids, words and numbers; typed text and documents are dropped", () => {
  assert.deepEqual(actionArgs({ type: 'move', actor: 'pc1', to: { q: 1, r: -2, z: 0 }, name: 'Gandalf the Grey', text: 'hello there', map: { levels: [] } }), { actor: 'pc1', to: { q: 1, r: -2, z: 0 } });
  assert.deepEqual(actionArgs({ type: 'cast', actor: 'pc1', spell: 'fire-bolt', targets: ['m1', 'm2'], note: 'x' }), { actor: 'pc1', spell: 'fire-bolt', targets: ['m1', 'm2'] });
  assert.deepEqual(actionArgs({ type: 'say', text: 'a typed sentence', actor: 'a name with spaces' }), {});
  const rec = createRecorder();
  for (let i = 0; i < 20; i++) rec.sent({ type: 'endTurn', actor: `pc${i}` });
  assert.equal(rec.actions().length, ACTIONS);
  assert.equal(rec.sent({ type: 'a typed type' }).type, 'other');
});

test("a report passes the server's allow-list, with and without context, and is cut to fit 24 KB oldest first", () => {
  const rec = createRecorder();
  for (let i = 0; i < 30; i++) rec.shown([`${i} ${'€'.repeat(299)}`, '', 'combat'], 'attack');      // three bytes a letter: 30 long lines are far over the cap
  for (let i = 0; i < 15; i++) rec.sent({ type: 'move', actor: 'pc1', to: { q: i, r: i } });
  rec.error('Oops', 'app.js:12');
  const full = buildReport({ comment: 'x'.repeat(2000), kind: 'bug', include: true }, FACTS, rec);
  assert.equal(REPORT(full), null);
  assert.ok(new TextEncoder().encode(JSON.stringify(full)).length <= REPORT_MAX);
  assert.ok(full.context.log.length < 30);
  assert.ok(full.context.log.at(-1).startsWith('29 '), 'the newest lines are kept');
  const bare = buildReport({ comment: ' hi ', kind: 'idea', include: false }, FACTS, rec);
  assert.equal(bare.context, undefined);
  assert.equal(bare.comment, 'hi');
  assert.equal(REPORT(bare), null);
  assert.equal(fitReport({ ...bare }).comment, 'hi');
});

test("what is gathered from a player's own view holds no seed, no names of people and nothing that names the table", async () => {
  const S = view(newGame(7), { role: 'player', userId: 'pat' });
  const fighter = Object.values(S.entities).find((e) => e.kind === 'pc');
  const T = { solo: false, you: { role: 'player', userId: 'pat', name: 'Patricia Secretname', code: 'ABC123' } };
  const win = { innerWidth: 390, innerHeight: 844, navigator: { userAgent: 'UA', maxTouchPoints: 1 }, document: { documentElement: { lang: 'en-GB' }, querySelector: () => null } };
  const f = gather(() => ({ S, T, selId: fighter.id, themeId: 'classic', renderer: 'gl', mine: () => true }), win);
  assert.equal(f.mode, 'table'); assert.equal(f.role, 'player'); assert.equal(f.touch, true);
  assert.equal(f.character.cls, fighter.cls); assert.equal(f.character.level, fighter.level);
  assert.equal('code' in f, false);
  const r = buildReport({ comment: 'hello', kind: 'bug', include: true }, f, createRecorder());
  assert.equal(REPORT(r), null);
  assert.equal('table' in r, false);
  const text = JSON.stringify(r);
  for (const bad of ['Patricia', 'Secretname', 'ABC123', 'pat', 'rng', 'seed', fighter.name]) assert.ok(!text.includes(bad), `the report holds ${bad}`);
});

test("names are scrubbed from every line: monikers, party characters, other creatures; regex characters and names inside words are safe", () => {
  const S = { entities: {
    a: { id: 'a', kind: 'pc', side: 'party', name: 'Brenna', cls: 'Fighter', ownerName: 'Al' },
    b: { id: 'b', kind: 'pc', side: 'party', name: 'Pip.*(', cls: 'Rogue', ownerName: 'a+b(c' },
    g: { id: 'g', kind: 'monster', side: 'foe', name: 'Goblin Warrior 1', tpl: 'goblin-warrior' },
    f: { id: 'f', kind: 'monster', side: 'foe', name: 'Fangsworth', tpl: 'goblin-warrior' },
    d: { id: 'd', kind: 'monster', side: 'foe', name: 'Goblin Warrior Dmitri', tpl: 'goblin-warrior' },
    n: { id: 'n', kind: 'monster', side: 'foe', name: 'Goblin Warrior 12', tpl: 'goblin-warrior' },
  } };
  const T = { solo: false, you: { name: 'Al' }, lobby: { members: [{ name: 'Player-Secret-Moniker' }], pending: [] } };
  const sc = createScrubber((tpl) => (tpl === 'goblin-warrior' ? 'Goblin Warrior' : null));
  sc.learn({ S, T });
  const t = sc.text.bind(sc);
  assert.equal(t('Player-Secret-Moniker now plays Brenna.'), 'Player 2 now plays Hero 1 (Fighter).'.replace('Player 2', t('Player-Secret-Moniker')));
  assert.ok(!/Secret|Brenna/.test(t('Player-Secret-Moniker now plays Brenna.')));
  assert.equal(t('Al raises an Alert; the Almanac is Almost there'), `${t('Al')} raises an Alert; the Almanac is Almost there`);     // inside words: untouched
  assert.match(t('Al raises an Alert'), /^Player \d raises an Alert$/);
  assert.match(t('Pip.*( takes 3 damage. a+b(c waves.'), /^Hero 2 \(Rogue\) takes 3 damage\. Player \d waves\.$/);
  assert.equal(t('Goblin Warrior 1 hits Brenna'), 'Goblin Warrior 1 hits Hero 1 (Fighter)');                 // a content name is kept
  assert.equal(t('Goblin Warrior Dmitri bites'), 'a creature bites', 'a content name with a typed name after it is not kept');
  assert.equal(t('Goblin Warrior 12 bites'), 'Goblin Warrior 12 bites');
  assert.equal(t('Fangsworth bites'), 'a creature bites');                                                   // anything else is not
  assert.equal(t("Brenna's wolf"), "Hero 1 (Fighter)'s wolf");
  assert.equal(t('Hero 1 (Fighter) stays'), 'Hero 1 (Fighter) stays', 'a placeholder is not scrubbed again');
});

test("a recorder scrubs lines, answers and errors, and never keeps chat, notes, handouts, scenes or who plays whom", () => {
  const sc = createScrubber(); sc.learn({ S: { entities: { a: { id: 'a', kind: 'pc', side: 'party', name: 'Brenna', cls: 'Fighter' } } }, T: {} });
  const rec = createRecorder({ scrub: (x) => sc.text(x) });
  for (const type of ['say', 'note', 'privateNote', 'claimed', 'released', 'checkAsked', 'chronicle', 'handoutShown', 'sceneStart', 'sceneNpc']) rec.shown(['Brenna: words', '', 'explore'], type);
  rec.shown(['Brenna attacks.', '', 'combat'], 'attack');
  const e = rec.sent({ type: 'move', actor: 'pc1' }); rec.answer(e, "refused: Brenna can't go there");
  rec.error('Brenna broke it', 'app.js:1');
  assert.deepEqual(rec.log(), ['Hero 1 (Fighter) attacks.']);
  assert.equal(rec.actions()[0].answer, "refused: Hero 1 (Fighter) can't go there");
  assert.equal(rec.errors()[0].message, 'Hero 1 (Fighter) broke it');
});

test("whose turn it is, as the viewer sees it: mine, someone else's or unseen", () => {
  const base = { entities: { a: { id: 'a', kind: 'pc' } }, map: { id: 'valley' } };
  const f = (slot) => gather(() => ({ S: { ...base, encounter: { round: 2, turn: 0, order: [slot] } }, T: { solo: true, you: { role: 'dm' } }, selId: 'a', themeId: 'classic', renderer: 'gl', mine: (e) => e?.id === 'a' }), { innerWidth: 1, innerHeight: 1, navigator: {}, document: { querySelector: () => null } }).fight;
  assert.deepEqual(f({ id: 'a' }), { on: true, round: 2, turn: 'mine' });
  assert.equal(f({ id: 'b' }).turn, 'other');
  assert.equal(f({ someone: true }).turn, 'unseen');
});

test("the build stamp reads aloud in local time, and the report's build token is short", async () => {
  const { buildLine, buildId, validStamp } = await import(pathToFileURL(join(tmp, 'feedback.js')));
  const b = { commit: 'c1d5069abcdef', when: '2026-11-15T11:13:26Z', pr: 354, source: 'pages' };
  assert.equal(buildLine(b, 'UTC'), 'Build 15 Nov 2026, 11:13 (after change #354, c1d5069)');
  assert.equal(buildLine(b, 'Asia/Tokyo'), 'Build 15 Nov 2026, 20:13 (after change #354, c1d5069)');
  assert.equal(buildLine({ commit: 'c1d5069', when: '2026-11-15T11:13:26Z' }, 'UTC'), 'Build 15 Nov 2026, 11:13 (c1d5069)');
  assert.equal(buildLine({ commit: 'c1d5069' }), 'Build (c1d5069)');
  assert.equal(buildLine({ commit: 'no', when: 'never' }), '');
  assert.equal(buildLine(null), '');
  assert.equal(buildId(b), 'c1d5069 2026-11-15T11:13:26Z #354');
  assert.equal(validStamp({ nothing: 1 }), false);
  const r = buildReport({ comment: 'x', kind: 'bug', include: false }, { ...FACTS, build: buildId(b) }, createRecorder());
  assert.equal(REPORT(r), null);
});

test("every kind of line the log can draw is classified, and typed text never gets into a report", async () => {
  const { readFileSync } = await import('node:fs');
  const typesIn = (file, from) => { const src = readFileSync(join(here, '..', file), 'utf8'); const start = src.indexOf(from); assert.ok(start > 0, `${file}: ${from}`); const body = src.slice(start, src.indexOf('\n  }\n', start) > 0 && file !== 'app.js' ? src.indexOf('\n  }\n', start) : src.indexOf('\nfunction floatOf', start)); return [...body.matchAll(/case '([A-Za-z]+)'/g)].map((m) => m[1]); };
  const drawn = new Set([...typesIn('app.js', 'function words(ev)'), ...typesIn('handouts.js', 'function describe(ev)'), ...typesIn('scenes.js', 'function describe(ev)')]);
  assert.ok(drawn.size > 60, `read ${drawn.size} line kinds`);
  const missing = [...drawn].filter((t) => !Object.hasOwn(LINE_KINDS, t));
  assert.deepEqual(missing, [], `classify these line kinds in LINE_KINDS (feedback.js) and in docs/specs/feedback.md: ${missing.join(', ')}`);
  const stale = Object.keys(LINE_KINDS).filter((t) => !drawn.has(t));
  assert.deepEqual(stale, [], `LINE_KINDS lists kinds the log no longer draws: ${stale.join(', ')}`);
  assert.ok(Object.values(LINE_KINDS).every((v) => ['engine', 'fixed', 'typed'].includes(v)));
  const doc = readFileSync(join(here, '../../../docs/specs/feedback.md'), 'utf8');
  for (const [t, how] of Object.entries(LINE_KINDS)) assert.ok(doc.includes(`\`${t}\``), `docs/specs/feedback.md does not list ${t}`);
  // What each class does in the recorder (one recorder a type: the log keeps only the last 30)
  for (const [t, how] of Object.entries(LINE_KINDS)) {
    const rec = createRecorder();
    rec.shown([`TYPED-${t}`, '', 'explore'], t);
    assert.deepEqual(rec.log(), how === 'engine' ? [`TYPED-${t}`] : how === 'fixed' ? [t === 'undone' ? 'Taken back.' : 'Done again.'] : [], t);
  }
});

test("placeholders are numbered once: a name seen again keeps its number", () => {
  const sc = createScrubber();
  const S = { entities: { a: { id: 'a', kind: 'pc', side: 'party', name: 'Brenna', cls: 'Fighter' }, b: { id: 'b', kind: 'pc', side: 'party', name: 'Pip', cls: 'Rogue' } } };
  for (let i = 0; i < 5; i++) sc.learn({ S, T: {} });
  assert.equal(sc.text('Brenna and Pip'), 'Hero 1 (Fighter) and Hero 2 (Rogue)');
});
