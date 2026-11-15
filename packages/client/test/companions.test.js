// The screens of companions (companions.js, issue #367): what the cast chooser asks for and sends, the rows and pickers of a master's companions, and
// that nothing is drawn from a creature the view did not send. The client imports the rules as ./shared, so the test lays the two side by side in a
// temporary folder, as tracker.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'companions-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const C = await import(pathToFileURL(join(tmp, 'companions.js')));
const { trackerRows, rowHTML } = await import(pathToFileURL(join(tmp, 'tracker.js')));
const { apply, makeEntity } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { derive } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' }, PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function table() {
  const s = newGame(5);
  s.settings.autoEngage = false;
  const d = derive({ name: 'Ven', class: 'wizard', level: 17, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 }, skills: [], armour: 'leather-armor', weapons: ['quarterstaff'], spells: ['find-familiar', 'summon-dragon', 'animate-dead', 'shocking-grasp'] });
  const f = s.entities.fighter.pos;
  s.entities.ven = makeEntity(d.record, { id: 'ven', kind: 'pc', side: 'party', pos: { q: f.q + 1, r: f.r, z: 0 } });
  ok(apply(s, { type: 'claim', entity: 'ven', user: 'pat', userName: 'Pat' }, PAT));
  return s;
}
const none = () => '';

test('the plan of Find Familiar: a form, a type, one space; Summon Dragon: a variant and the damage choice; Animate Dead: corpses', () => {
  const s = table(), ven = s.entities.ven;
  const f = C.summonPlan(s, ven, 'find-familiar', 1);
  assert.deepEqual(f.choices.map((c) => c.key), ['type', 'form']);
  assert.ok(f.choices[1].options.some((o) => o.v === 'owl'));
  assert.deepEqual(f.taps, { kind: 'points', count: 1, note: '' });
  const d = C.summonPlan(s, ven, 'summon-dragon', 5);
  assert.ok(d.choices.some((c) => c.key === 'variant') && d.choices.some((c) => c.key === 'choice' && c.extra));
  const a = C.summonPlan(s, ven, 'animate-dead', 3);
  assert.equal(a.taps.kind, 'corpses');
  assert.equal(a.taps.max, 1);
  assert.equal(C.summonPlan(s, ven, 'animate-dead', 5).taps.max, 5);
  assert.equal(C.summonPlan(s, ven, 'shocking-grasp', 0), null);
});

test('the cast it sends: picks make a summon, nothing picked leaves `summon` out (never null), Summon Dragon always carries its choice', () => {
  const s = table(), ven = s.entities.ven;
  const f = C.summonPlan(s, ven, 'find-familiar', 1), m = { actor: 'ven', slot: 1, pick: { form: 'owl', type: 'fey' }, at: [{ q: 3, r: 4 }], ids: [] };
  assert.equal(C.summonMissing(f, m), '');
  assert.deepEqual(C.summonAction(f, m), { type: 'cast', actor: 'ven', spell: 'find-familiar', summon: { form: 'owl', type: 'fey', at: [{ q: 3, r: 4 }] } });
  const bare = C.summonAction(f, { ...m, pick: {}, at: [] }, { bare: true });
  assert.ok(!('summon' in bare), 'no summon key at all');
  const d = C.summonPlan(s, ven, 'summon-dragon', 5), dm = { actor: 'ven', slot: 5, pick: { variant: d.choices[0].options[0].v }, at: [{ q: 1, r: 1 }], ids: [] };
  const act = C.summonAction(d, dm);
  assert.ok(typeof act.choice === 'string' && act.choice, 'the choice is sent although none was tapped');
  assert.ok(!('slot' in act), 'the spell\'s own level sends no slot');
  assert.equal(C.summonAction(d, { ...dm, slot: 6 }).slot, 6);
  const a = C.summonPlan(s, ven, 'animate-dead', 3);
  assert.match(C.summonMissing(a, { pick: {}, at: [], ids: [] }), /corpse/);
  assert.deepEqual(C.summonAction(a, { actor: 'ven', slot: 3, pick: {}, at: [], ids: ['bandit1'] }).summon, { ids: ['bandit1'] });
  // the engine takes what the chooser builds
  const t = structuredClone(s);
  const free = [...Array(8).keys()].map((i) => ({ q: t.entities.ven.pos.q, r: t.entities.ven.pos.r + 1 + (i % 2), z: 0 })).concat([{ q: t.entities.ven.pos.q - 1, r: t.entities.ven.pos.r }]);
  let sent = null;
  for (const h of free) { const a2 = C.summonAction(f, { ...m, at: [h] }); const r = apply(structuredClone(t), a2, PAT); if (r.ok) { sent = r; break; } }
  assert.ok(sent, 'a cast built by the chooser is accepted');
});

test('the rows grey with the engine\'s words, and the order\'s text is escaped wherever it is drawn', () => {
  const s = table();
  const owl = ok(apply(s, { type: 'cast', actor: 'ven', spell: 'find-familiar', slot: 1, summon: { form: 'owl', type: 'fey', at: [(() => { for (const h of [{ q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 0, r: -1 }, { q: 2, r: 0 }]) { const p = { q: s.entities.ven.pos.q + h.q, r: s.entities.ven.pos.r + h.r }; if (apply(structuredClone(s), { type: 'cast', actor: 'ven', spell: 'find-familiar', slot: 1, summon: { form: 'owl', type: 'fey', at: [p] } }, PAT).ok) return p; } })()] } }, PAT)).events.find((e) => e.type === 'summoned').id;
  const rows = C.companionRows(s, s.entities.ven, (a) => (a.type === 'dismiss' ? 'Nope, in the engine\'s words.' : ''));
  const dis = rows.features.find((r) => r.op === 'dismiss');
  assert.equal(dis.why, 'Nope, in the engine\'s words.');
  assert.ok(rows.features.find((r) => r.op === 'auto') && !rows.features.find((r) => r.op === 'command'), 'a familiar takes no commands');
  // an order with markup is shown as text
  s.entities[owl].bond.orders = 'command'; s.entities[owl].bond.standing = '<img src=x onerror=alert(1)>';
  const html = C.pickerHtml(s, s.entities.ven, { op: 'command', actor: 'ven', draft: '"><script>x</script>' }, none);
  assert.ok(!/<img|<script/.test(html), html);
  assert.match(html, /&lt;img/);
  // the steed's side shows `orderNext ?? order ?? 'after'`
  const horse = s.entities[owl]; horse.bond.turn = 'after'; horse.bond.order = 'after'; horse.bond.orderNext = 'before';
  assert.equal(C.sideOf(horse), 'before');
  delete horse.bond.orderNext; assert.equal(C.sideOf(horse), 'after'); delete horse.bond.order; assert.equal(C.sideOf(horse), 'after');
});

test('a player\'s screen shows nothing of a creature the view did not send', () => {
  const s = table();
  const foe = Object.values(s.entities).find((e) => e.side === 'foe');
  const spot = { q: foe.pos.q + 1, r: foe.pos.r };
  const ghost = ok(apply(s, { type: 'spawn', monster: 'wolf', at: spot, name: 'Secretwolf', hidden: true }, DM)).events.find((e) => e.type === 'spawned').id;
  ok(apply(s, { type: 'bond', actor: ghost, to: foe.id, kind: 'pet' }, DM));
  const v = view(s, 'pat');
  assert.ok(!JSON.stringify(v).includes('Secretwolf'), 'the view holds nothing of it');
  const ven = v.entities.ven;
  const rows = C.companionRows(v, ven, none), html = C.pickerHtml(v, ven, { op: 'mount', actor: 'ven' }, none) + C.pickerHtml(v, ven, { op: 'dismiss', actor: 'ven' }, none);
  assert.ok(!JSON.stringify(rows).includes('Secretwolf') && !html.includes('Secretwolf'));
  assert.ok(!C.mountCandidates(v, ven).some((c) => c.id === ghost));
  assert.ok(trackerRows(v, { dm: false }).every((r) => !r.e || r.e.id !== ghost));
});

test('a ridden mount is drawn with its rider in the tracker, with no turn of its own', () => {
  const s = table();
  ok(apply(s, { type: 'spawn', monster: 'warhorse', at: { q: s.entities.ven.pos.q, r: s.entities.ven.pos.r + 1 } }, DM));
  const horse = Object.values(s.entities).find((e) => e.tpl === 'warhorse').id;
  ok(apply(s, { type: 'bond', actor: horse, to: 'ven', kind: 'steed' }, DM));
  ok(apply(s, { type: 'mount', actor: 'ven', mount: horse }, DM));
  const rows = trackerRows(s, { dm: true });
  const i = rows.findIndex((r) => r.e?.id === 'ven');
  assert.equal(rows[i + 1].e.id, horse, 'the steed stands under its rider outside a fight');
  const html = rowHTML(s, rows[i], { dm: true });
  assert.match(html, /Riding/);
  assert.match(rowHTML(s, rows[i + 1], { dm: true }), /Companion of Ven/);
});
