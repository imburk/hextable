// The chooser panels of the caster classes at levels 7 to 15 (#302, DEBT C16): their pure part, in classes.js. What the panels send is what the engine took in
// #232 (`empower`, `overchannel`, `repel`, `via`, `prey`, Hurl Through Hell's `slot`); the test builds the action as a panel does and applies it. The client
// imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as actionpanel.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'classes-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const C = await import(pathToFileURL(join(tmp, 'classes.js')));
const { apply, current, makeEntity } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { derive } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { SPELLS } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const hero = (sheet) => { const s = newGame(7); for (const id of Object.keys(s.entities)) delete s.entities[id]; s.entities.hero = makeEntity(derive(sheet).record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 }, owner: 'u1' }); return s; };
const foe = (s, at, id) => ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at }, DM)).events[0].id;
const fight = (s) => { ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM)); for (let i = 0; i < 20 && current(s) !== 'hero'; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM)); assert.equal(current(s), 'hero'); return s; };
const rowsOf = (s, id = 'hero') => Object.fromEntries(C.chooserButtons(s, s.entities[id]).map((b) => [b.feature, b]));

const WIZ = { name: 'Wyn', class: 'wizard', level: 14, subclass: 'evoker', abilities: { str: 8, dex: 14, con: 14, int: 20, wis: 10, cha: 10 }, skills: ['arcana', 'history'],
  spells: ['fire-bolt', 'fireball', 'magic-missile', 'scorching-ray', 'shield', 'cone-of-cold', 'sleep'] };
const WL = { name: 'Mor', class: 'warlock', level: 15, subclass: 'fiend', abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ['arcana', 'deception'], spells: ['eldritch-blast'],
  choices: { 'eldritch-invocations': ['agonizing-blast-eldritch-blast', 'repelling-blast-eldritch-blast', 'armor-of-shadows', 'fiendish-vigor', 'gift-of-the-depths', 'eldritch-spear-eldritch-blast', 'pact-of-the-chain'],
    'fiendish-resilience': 'fire', 'mystic-arcanum': 'circle-of-death', 'mystic-arcanum-7': 'finger-of-death', 'mystic-arcanum-8': 'dominate-monster' } };
const RNG = { name: 'Ash', class: 'ranger', level: 11, subclass: 'hunter', abilities: { str: 10, dex: 18, con: 14, int: 10, wis: 16, cha: 8 }, skills: ['stealth', 'survival', 'perception'], weapons: ['longbow', 'shortsword'], spells: ['hunters-mark'] };

test('the sheets of these tests are whole', () => {
  for (const sh of [WIZ, WL, RNG]) { const d = derive(sh); assert.ok(d.record, JSON.stringify(d)); }
});

test('the chooser rows: an evoker has one for Empowered Evocation and one for Overchannel, a warlock one for each Repelling Blast, Hurl Through Hell and each free cast, a ranger one for the Prey', () => {
  const w = rowsOf(hero(WIZ));
  assert.equal(w['empowered-evocation']?.kind, 'evoker'); assert.equal(w['overchannel']?.kind, 'evoker');
  assert.match(w['overchannel'].sub, /first use is free/); assert.match(w['empowered-evocation'].sub, /Adds \+5 to one damage roll of a Evocation spell/);
  const l = rowsOf(hero(WL));
  assert.equal(l['eldritch-invocations-repelling-blast-eldritch-blast'].kind, 'repel');
  assert.equal(l['hurl-through-hell'].kind, 'hurl');
  assert.equal(l['eldritch-invocations-armor-of-shadows'].kind, 'free');
  assert.equal(l['eldritch-invocations-armor-of-shadows'].sub, 'Cast free, as often as you like · on yourself', 'at will: not "null left"');
  assert.equal(l['mystic-arcanum-circle-of-death'].sub, 'Cast free · 1 left');
  assert.equal(l['contact-patron'].kind, 'free');
  const r = rowsOf(hero(RNG));
  assert.equal(r['superior-hunters-prey']?.kind, 'prey');
  for (const sh of [WIZ, WL, RNG]) for (const f of derive(sh).record.feats) if (C.needsChoice(f)) assert.ok(C.kindOf(f));
});

test('Overchannel: free the first time since a Long Rest, then one more die of Necrotic per slot level each time; the panel reads what the engine counts', () => {
  const s = hero(WIZ), e = s.entities.hero, f = e.feats.find((x) => x.overchannel);
  assert.deepEqual(C.overchannelCost(e, f, 3), { free: true, n: 0, text: 'The first use since a Long Rest is free.' });
  foe(s, { q: 2, r: 0 }); fight(s);
  const send = { type: 'cast', actor: 'hero', spell: 'fireball', hex: { q: 2, r: 0 }, overchannel: true, slot: 3 };
  const r1 = ok(apply(s, send, DM));
  assert.ok(r1.events.some((x) => x.type === 'note' && /Overchannel/.test(x.text)));
  assert.equal(e.uses['overchannel'], 1);
  const c = C.overchannelCost(e, f, 3);
  assert.equal(c.free, false); assert.equal(c.dice, '6d12'); assert.match(c.text, /2d12 Necrotic damage for each level of the slot \(6d12 at level 3\)/);
});

test('the evoker panel offers a spell only where a feature applies: Empowered Evocation for Evocation on the Wizard list, Overchannel for a damaging spell of level 1 to 5', () => {
  const e = hero(WIZ).entities.hero, by = Object.fromEntries(C.evokerSpells(e).map((x) => [x.sp.id, x]));
  assert.ok(by['fireball'].empower && by['fireball'].over);
  assert.ok(by['fire-bolt'].empower && !by['fire-bolt'].over, 'a cantrip: Empowered, not Overchannel');
  assert.ok(!by['shield'] && !by['sleep'], 'no damage, no offer');
  assert.ok(by['magic-missile'].rolls >= 1);
  assert.ok(by['cone-of-cold'].over, 'level 5 is the most');
  assert.equal(C.slotsFor(e, SPELLS.fireball, 5).includes(3), true);
  assert.equal(C.slotsFor(e, SPELLS.fireball, 5).includes(6), false);
});

test('Empowered Evocation: the panel sends `empower` as the engine takes it (false, or the roll from 0)', () => {
  const s = hero(WIZ); foe(s, { q: 3, r: 0 }); fight(s);
  const r = ok(apply(s, { type: 'cast', actor: 'hero', spell: 'fireball', hex: { q: 3, r: 0 }, empower: 0, slot: 3 }, DM));
  assert.ok(r.events.some((x) => x.type === 'note' && /Empowered Evocation: \+5 damage/.test(x.text)));
});

test('Repelling Blast: `repel` in steps of 5 up to the feature\'s feet', () => {
  const s = hero(WL), e = s.entities.hero, f = e.feats.find((x) => x.repel);
  assert.deepEqual(f.repel, { spell: 'eldritch-blast', feet: 10 });
  const g = foe(s, { q: 3, r: 0 }); fight(s);
  const r = ok(apply(s, { type: 'cast', actor: 'hero', spell: 'eldritch-blast', target: g, repel: 10 }, DM));
  assert.ok(r.events.some((x) => x.type === 'cast'));
  const bad = apply(s, { type: 'cast', actor: 'hero', spell: 'eldritch-blast', target: g, repel: 15 }, DM);
  assert.equal(bad.ok, false);
});

test('Superior Hunter\'s Prey: the row is greyed until Hunter\'s Mark is on a creature in a fight, on the ranger\'s turn, once a turn; the choices are creatures within 30 ft of the mark', () => {
  const s = hero(RNG), e = s.entities.hero, f = e.feats.find((x) => x.markSpread);
  assert.match(C.preyWhy(s, e, f), /used in a fight/);
  const a = foe(s, { q: 3, r: 0 }), b = foe(s, { q: 4, r: 1 }), far = foe(s, { q: -6, r: 0 });
  fight(s);
  assert.match(C.preyWhy(s, e, f), /no creature marked by Hunter's Mark/);
  assert.match(rowsOf(s)['superior-hunters-prey'].why, /no creature marked/);
  ok(apply(s, { type: 'cast', actor: 'hero', spell: 'hunters-mark', target: a }, DM));
  assert.deepEqual(C.markedBy(s, e, f), [a]);
  assert.equal(C.preyWhy(s, e, f), '');
  const near = C.preyCandidates(s, e, f).map((m) => m.x.id);
  assert.ok(near.includes(b) && !near.includes(a) && !near.includes('hero'));
  assert.ok(!near.includes(far), 'a creature more than 30 ft from the mark is not offered');
  const atk = e.attacks.find((x) => !x.spell).id;
  const r = ok(apply(s, { type: 'attack', actor: 'hero', target: a, attack: atk, prey: b }, DM));
  assert.ok(r.events.length);
  if (s.encounter.flags[`prey:hero`]) assert.match(C.preyWhy(s, e, f), /already used Superior Hunter's Prey this turn/);
});

test('Hurl Through Hell: a use left means no slot; with it spent the panel names a Pact Magic slot and the engine takes `slot`', () => {
  const s = hero(WL), e = s.entities.hero, f = e.feats.find((x) => x.id === 'hurl-through-hell');
  assert.equal(C.kindOf(f), 'hurl');
  assert.equal(C.usesLeft(e, f), 1);
  const bad = apply(s, { type: 'feature', actor: 'hero', feature: 'hurl-through-hell', target: 'x', slot: 5 }, DM);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /has a use of Hurl Through Hell left|slot restores it only once/);
});

test('free casts: Armor of Shadows is cast on the caster only (target: the caster), through `via`', () => {
  const s = hero(WL), e = s.entities.hero, f = e.feats.find((x) => x.id === 'eldritch-invocations-armor-of-shadows');
  assert.deepEqual(C.freeSpells(f).map((x) => x.id), ['mage-armor']);
  const r = ok(apply(s, { type: 'cast', actor: 'hero', spell: 'mage-armor', via: f.id, target: 'hero' }, DM));
  assert.ok(r.events.some((x) => x.type === 'cast' && x.via));
  const m = e.feats.find((x) => x.id === 'mystic-arcanum-circle-of-death');
  assert.equal(C.freeSub(m, 1), 'Cast free · 1 left');
});
