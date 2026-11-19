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
const { SPELLS, CONTENT } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));
const { loadPack, overlayOf, using } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));
const AP = await import(pathToFileURL(join(tmp, 'actionpanel.js')));

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

test('Arcane Recovery on the Short Rest: spent slots up to level 5 and half the level, as `recover` takes them', () => {
  const s = hero(WIZ), e = s.entities.hero;
  assert.equal(C.recoverOf(e).rows.length, 0, 'nothing spent: nothing to recover');
  e.slots[1] -= 2; e.slots[3] -= 1; e.slots[6] -= 1;
  const r = C.recoverOf(e);
  assert.equal(r.most, 7); assert.deepEqual(r.rows, [{ level: 1, spent: 2 }, { level: 3, spent: 1 }], 'level 6 is over the feature\'s limit');
  const levels = C.recoverLevels(r, { 1: 2, 3: 1 });
  assert.deepEqual(levels, [1, 1, 3]);
  assert.deepEqual(C.recoverLevels(r, { 1: 9, 3: 9 }), [1, 1, 3], 'no more than is spent');
  assert.deepEqual(C.recoverLevels({ ...r, most: 2 }, { 1: 2, 3: 1 }), [1, 1], 'no more than half the level in all');
  const before = { 1: e.slots[1], 3: e.slots[3] };
  ok(apply(s, { type: 'shortRest', ids: ['hero'], recover: { hero: levels } }, DM));
  assert.equal(e.slots[1], before[1] + 2); assert.equal(e.slots[3], before[3] + 1);
  assert.equal(C.recoverOf(e), null, 'once a Long Rest: the use is spent');
});

test('Natural Recovery: the druid has the same row', () => {
  const s = hero({ name: 'Dru', class: 'druid', level: 14, subclass: 'land', abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 18, cha: 10 }, skills: ['nature', 'perception'], spells: [] }), e = s.entities.hero;
  e.slots[2] -= 1;
  const r = C.recoverOf(e);
  assert.equal(r.f.name, 'Natural Recovery'); assert.deepEqual(r.rows, [{ level: 2, spent: 1 }]);
});

// ---------- a feature that costs a spell slot, priced Wild Shape forms, `orSlot` for any caster (#522, DEBT T86 and T88) ----------
// The subclasses are invented for this test: an Oath of the Lantern (paladin) with a feature for each shape of a slot cost, and three circles of druids whose forms are priced.
const P = 'lantern-folk', hb = (n) => `hb-${P}-${n}`;
const doc = (lists) => ({ format: 'hextable-pack', v: 1, pack: { id: P, name: 'Lantern Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for a test.' }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), level, tier: 'auto', checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: `homebrew:${P}`, checked: false, text: 'Sworn to keep a lamp lit.', features });
const MEND = { action: { time: 'bonus', target: { self: true }, effects: [{ heal: '1d8' }], cost: { slot: 1, higher: { heal: '1d8' } } } };
const FLARE = { action: { time: 'action', target: { creature: { range: [30, 30] } }, effects: [{ damage: '2d6', type: 'radiant' }], cost: { slot: 2, higher: { damage: '1d6' } } } };
const WARD = { action: { time: 'bonus', target: { self: true }, effects: [{ tempHp: '1d6' }], cost: { resource: 'channel-divinity', slot: 1, higher: { tempHp: '1d6' } } } };
const VOLLEY = { action: { time: 'action', target: { creature: { range: [30, 30] } }, effects: [{ damage: '1d4', type: 'fire' }], cost: { slot: 1, higher: { times: 1 } } } };
const RELIGHT = { action: { time: 'bonus', target: { self: true }, effects: [{ tempHp: '2d4' }], orSlot: true } };
const PLAIN = { action: { time: 'bonus', target: { self: true }, effects: [{ heal: '1d4' }] } };
const LANTERN = sub('oath-of-the-lantern', 'Oath of the Lantern', 'paladin', [
  feature('lantern-mend', 3, MEND), feature('lantern-flare', 3, FLARE, { uses: { max: 2, recharge: 'long' } }), feature('lantern-ward', 3, WARD),
  feature('lantern-volley', 3, VOLLEY), feature('lantern-relight', 3, RELIGHT, { uses: { max: 1, recharge: 'long' } }), feature('lantern-plain', 3, PLAIN)]);
const circle = (id, name, features) => sub(id, name, 'druid', features);
const STORE = circle('circle-of-the-store', 'Circle of the Store', [feature('ember-store', 3, undefined, { tier: 'manual', uses: { max: 3, recharge: 'long' } }),
  feature('store-shape', 3, { formOf: { of: 'wild-shape', maxCr: 2, types: ['elemental'], cost: { resource: hb('ember-store') } } })]);
const TWO = circle('circle-of-the-two', 'Circle of the Two', [feature('twofold-shape', 3, { formOf: { of: 'wild-shape', maxCr: 2, types: ['elemental'], cost: { resource: 'wild-shape', n: 2 } } })]);
const EVERY = circle('circle-of-the-every', 'Circle of the Every', [feature('every-store', 3, undefined, { tier: 'manual', uses: { max: 2, recharge: 'long' } }),
  feature('every-shape', 3, { formOf: { of: 'wild-shape', cost: { resource: hb('every-store') } } })]);
// #525: the four elementals by name, priced in a pool of their own (a beast is Wild Shape's); elementals up to CR 2 by a rating of their own.
const NAMED = circle('circle-of-the-named', 'Circle of the Named', [feature('named-store', 3, undefined, { tier: 'manual', uses: { max: 2, recharge: 'long' } }),
  feature('named-shape', 3, { formOf: { of: 'wild-shape', forms: ['air-elemental', 'fire-elemental'], cost: { resource: hb('named-store') } } })]);
const RATED = circle('circle-of-the-rated', 'Circle of the Rated', [feature('rated-shape', 3, { formOf: { of: 'wild-shape', types: ['elemental'], typesMaxCr: 2 } })]);
const built = loadPack(doc({ subclasses: [LANTERN, STORE, TWO, EVERY, NAMED, RATED] })); assert.ok(built.ok, (built.problems ?? []).join('; '));
const ON = overlayOf([built.pack]);
const A = { str: 16, dex: 10, con: 14, int: 12, wis: 16, cha: 16 };
const paladin = (level = 9) => ({ name: 'Sir Wick', class: 'paladin', level, subclass: hb('oath-of-the-lantern'), abilities: A, skills: ['athletics', 'religion'], choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'], spells: ['bless', 'cure-wounds', 'aid'] });
const druid = (level, circleId) => ({ name: 'Ven', class: 'druid', level, subclass: hb(circleId), abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ['nature', 'perception'],
  choices: { 'primal-order': 'warden' }, armour: 'leather-armor', shield: true, weapons: ['quarterstaff'], spells: ['produce-flame', 'cure-wounds'] });
const homebrew = (sheet, fn) => using(ON, () => fn(hero(sheet)));
const feat = (s, id) => s.entities.hero.feats.find((f) => f.id === id);

test('a feature with a spell slot cost has a chooser: its row says it spends a slot, the lowest level, what a higher one adds and the uses left', () => {
  homebrew(paladin(), (s) => {
    const rows = rowsOf(s);
    assert.equal(rows[hb('lantern-mend')].kind, 'slot');
    assert.equal(rows[hb('lantern-mend')].sub, 'Bonus Action · spends a spell slot (level 1+) · +1d8 healing per level above 1');
    assert.equal(rows[hb('lantern-flare')].sub, 'Action · spends a spell slot (level 2+) · +1d6 damage per level above 2 · 2 left');
    assert.equal(rows[hb('lantern-ward')].sub, 'Bonus Action · spends a spell slot (level 1+) · +1d6 Temporary Hit Points per level above 1 · 2 Channel divinity left');
    assert.equal(rows[hb('lantern-volley')].sub, 'Action · spends a spell slot (level 1+) · 1 more damage roll per level above 1');
    for (const id of ['lantern-mend', 'lantern-flare', 'lantern-ward', 'lantern-volley']) assert.equal(rows[hb(id)].why, '', id);
    assert.equal(rows[hb('lantern-relight')].kind, 'hurl', 'a use a slot restores is Hurl Through Hell\'s chooser');
    assert.equal(rows[hb('lantern-plain')], undefined, 'a feature with no slot cost is a plain button, as before');
    for (const f of s.entities.hero.feats) if (C.needsChoice(f)) assert.ok(C.kindOf(f));
    assert.equal(C.kindOf(feat(s, 'lay-on-hands')), 'pool'); assert.equal(C.slotAim(feat(s, 'lay-on-hands')), null);
  });
});

test('the Features tab row of the feature says the same (the sub line features.js leaves out for a chooser)', () => {
  homebrew(paladin(), (s) => {
    const row = AP.featureRows(s, s.entities.hero).find((r) => r.id === `feat:${hb('lantern-mend')}`);
    assert.equal(row.kind, 'chooser'); assert.equal(row.sub, C.slotSub(s.entities.hero, feat(s, hb('lantern-mend'))));
    assert.equal(row.why, '');
    assert.equal(AP.featureRows(s, s.entities.hero).find((r) => r.id === 'feat:lay-on-hands').sub, '', 'the rows of other choosers are as they were');
  });
});

test('the levels offered are those at or above the lowest with a slot left, and every one is taken by the engine as `slot`; one below the lowest is not offered', () => {
  homebrew(paladin(), (s) => {
    const e = s.entities.hero;
    assert.deepEqual(C.slotLevels(e, 1), [1, 2, 3].filter((l) => (e.slots[l] ?? 0) > 0));
    assert.deepEqual(C.slotLevels(e, 2), C.slotLevels(e, 1).filter((l) => l >= 2));
    e.hp = 1;
    for (const l of C.slotLevels(e, 1)) {
      const t = structuredClone(s), before = t.entities.hero.slots[l];
      const r = ok(using(ON, () => apply(t, { type: 'feature', actor: 'hero', feature: hb('lantern-mend'), slot: l }, DM)));
      assert.equal(t.entities.hero.slots[l], before - 1, `level ${l} was spent`);
      assert.ok(r.events.some((x) => x.type === 'heal'));
    }
    const t = structuredClone(s);
    assert.equal(using(ON, () => apply(t, { type: 'feature', actor: 'hero', feature: hb('lantern-flare'), target: 'x', slot: 1 }, DM)).ok, false, 'a slot below the lowest is refused');
  });
});

test('what a higher slot adds is worked out per level, in the words of the spell vocabulary', () => {
  assert.equal(C.higherText({ heal: '1d8' }, 1), '+1d8 healing');
  assert.equal(C.higherText({ heal: '1d8' }, 3), '+3d8 healing');
  assert.equal(C.higherText({ damage: '1d6', tempHp: '2d4' }, 2), '+2d6 damage, +4d4 Temporary Hit Points');
  assert.equal(C.higherText({ times: 1 }, 2), '2 more damage rolls');
  assert.equal(C.higherText({ value: 2 }, 3), '+6 to its number');
  assert.equal(C.higherText(undefined, 2), '');
});

test('with no slot left the row is greyed with the engine\'s reason, and so is one whose pool is empty', () => {
  homebrew(paladin(), (s) => {
    const e = s.entities.hero;
    for (const l of Object.keys(e.slots)) e.slots[l] = 0;
    const rows = rowsOf(s);
    assert.equal(rows[hb('lantern-mend')].why, 'Sir Wick has no spell slot of level 1 or higher left for Lantern mend.');
    const r = using(ON, () => apply(structuredClone(s), { type: 'feature', actor: 'hero', feature: hb('lantern-mend') }, DM));
    assert.equal(r.ok, false); assert.equal(r.error, rows[hb('lantern-mend')].why, 'the words are the engine\'s own');
    // only a level above the lowest is gone: level 2 is the flare's lowest, and a creature with slots of level 1 only cannot use it
    for (const l of Object.keys(e.slots)) e.slots[l] = l === '1' ? 2 : 0;
    assert.equal(rowsOf(s)[hb('lantern-flare')].why, 'Sir Wick has no spell slot of level 2 or higher left for Lantern flare.');
    assert.equal(rowsOf(s)[hb('lantern-mend')].why, '');
    // the pool: Channel Divinity
    for (const l of Object.keys(e.slots)) e.slots[l] = 2;
    e.uses['channel-divinity'] = 0; e.uses[hb('lantern-flare')] = 0;
    assert.equal(rowsOf(s)[hb('lantern-ward')].why, 'Sir Wick has no uses of Channel Divinity left.');
    assert.equal(rowsOf(s)[hb('lantern-flare')].why, 'Sir Wick has no uses of Lantern flare left.');
  });
});

test('a priced form says what it costs and what is left in its own pool, and the words for one that cannot be paid are the engine\'s', () => {
  using(ON, () => {
    const s = hero(druid(6, 'circle-of-the-store')), e = s.entities.hero, wild = feat(s, 'wild-shape'), mon = (id) => CONTENT.monsters[id];
    assert.deepEqual(wild.action.form.cost, { resource: hb('ember-store'), n: 1, types: ['elemental'] });
    const az = C.formPrice(e, wild, mon('azer-sentinel')), wolf = C.formPrice(e, wild, mon('wolf'));
    assert.deepEqual([az.priced, az.pool, az.n, az.left, az.ok, az.text], [true, 'Ember store', 1, 3, true, '1 use of Ember store']);
    assert.deepEqual([wolf.priced, wolf.pool, wolf.n, wolf.left, wolf.ok, wolf.text], [false, 'Wild Shape', 1, e.uses['wild-shape'], true, '1 use of Wild Shape'], 'a form the circle does not price is the class\'s');
    assert.ok(C.formsFor(wild).some((m) => m.id === 'azer-sentinel') && C.formsFor(wild).some((m) => m.id === 'wolf'));
    // each pool empty in turn: the card's reason is the engine's sentence
    for (const [pool, form] of [[hb('ember-store'), 'azer-sentinel'], ['wild-shape', 'wolf']]) {
      const t = structuredClone(s); t.entities.hero.uses[pool] = 0;
      const p = C.formPrice(t.entities.hero, feat(t, 'wild-shape'), mon(form)), r = apply(t, { type: 'feature', actor: 'hero', feature: 'wild-shape', form }, DM);
      assert.equal(p.ok, false, form); assert.equal(r.ok, false); assert.equal(r.error, p.why, form);
    }
    // a pool of the SRD Wild Shape is not touched by a priced form: the beasts are still available with the circle's pool empty
    const t = structuredClone(s); t.entities.hero.uses[hb('ember-store')] = 0;
    assert.equal(C.formPrice(t.entities.hero, feat(t, 'wild-shape'), mon('wolf')).ok, true);
    ok(apply(t, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: 'wolf' }, DM));
  });
});

test('a price of two uses of Wild Shape itself, and a price on every form (no types)', () => {
  using(ON, () => {
    const s = hero(druid(6, 'circle-of-the-two')), e = s.entities.hero, wild = feat(s, 'wild-shape'), mon = (id) => CONTENT.monsters[id];
    e.uses['wild-shape'] = 1;
    const az = C.formPrice(e, wild, mon('azer-sentinel'));
    assert.deepEqual([az.n, az.left, az.ok, az.text], [2, 1, false, '2 uses of Wild Shape']);
    assert.equal(az.why, 'Ven has 1 use of Wild Shape left; the form of an Azer Sentinel costs 2.');
    assert.equal(apply(structuredClone(s), { type: 'feature', actor: 'hero', feature: 'wild-shape', form: 'azer-sentinel' }, DM).error, az.why);
    assert.equal(C.formPrice(e, wild, mon('wolf')).ok, true);
    const v = hero(druid(6, 'circle-of-the-every')), ev = v.entities.hero, wv = feat(v, 'wild-shape');
    assert.deepEqual([C.formPrice(ev, wv, CONTENT.monsters.wolf).priced, C.formPrice(ev, wv, CONTENT.monsters.wolf).pool], [true, 'Every store'], 'with no types every form is priced');
    ev.uses[hb('every-store')] = 0;
    assert.equal(C.formPrice(ev, wv, CONTENT.monsters.wolf).why, 'Ven has 0 uses of Every store left; the form of a Wolf costs 1.');
  });
});

test('a price on named forms alone prices exactly those forms, as shapeShift does, and the card lists the named forms', () => {
  using(ON, () => {
    const s = hero(druid(8, 'circle-of-the-named')), e = s.entities.hero, wild = feat(s, 'wild-shape'), mon = (id) => CONTENT.monsters[id];
    assert.deepEqual(wild.action.form.cost, { resource: hb('named-store'), n: 1, forms: ['air-elemental', 'fire-elemental'] }, 'no `types`: the price is not every form\'s');
    // the card prices as the engine does, for a beast (Wild Shape's), a named form (the pool) and a form not named (not offered)
    const wolf = C.formPrice(e, wild, mon('wolf')), fire = C.formPrice(e, wild, mon('fire-elemental'));
    assert.deepEqual([wolf.priced, wolf.pool, wolf.ok], [false, 'Wild Shape', true], 'a beast is not marked unavailable by a price on named forms');
    assert.deepEqual([fire.priced, fire.pool, fire.n, fire.text], [true, 'Named store', 1, '1 use of Named store']);
    const ids = C.formsFor(wild).map((m) => m.id);
    assert.ok(ids.includes('fire-elemental') && ids.includes('air-elemental') && ids.includes('wolf'), 'the named forms are listed, at their rating above the class\'s');
    assert.equal(ids.includes('earth-elemental'), false); assert.equal(ids.includes('azer-sentinel'), false, 'an elemental that is not named');
    // the pool empty: the named form is not available with the engine's sentence, the beast is
    const t = structuredClone(s); t.entities.hero.uses[hb('named-store')] = 0;
    const p = C.formPrice(t.entities.hero, feat(t, 'wild-shape'), mon('fire-elemental')), r = apply(t, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: 'fire-elemental' }, DM);
    assert.equal(p.ok, false); assert.equal(r.ok, false); assert.equal(r.error, p.why);
    assert.equal(C.formPrice(t.entities.hero, feat(t, 'wild-shape'), mon('wolf')).ok, true);
    ok(apply(t, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: 'wolf' }, DM));
    // every form the card lists is one the engine takes (a fresh creature each), and the card lists nothing the engine refuses for rating or type
    for (const id of ids) { const u = structuredClone(s); assert.equal(apply(u, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: id }, DM).ok, true, id); }
    // a monster the client has no content for (a table's pack monster): listed by its id, and the engine decides
    const w2 = structuredClone(wild); w2.action.form.forms = [...w2.action.form.forms, 'hb-elsewhere-ember-wisp']; w2.action.form.cost.forms = [...w2.action.form.cost.forms, 'hb-elsewhere-ember-wisp'];
    const stub = C.formsFor(w2).find((m) => m.id === 'hb-elsewhere-ember-wisp');
    assert.ok(stub); assert.equal(stub.name, 'hb-elsewhere-ember-wisp'); assert.equal(C.formPrice(e, w2, stub).priced, true, 'a named form is priced by its name');
    assert.equal(C.formsFor(w2).at(-1).id, 'hb-elsewhere-ember-wisp', 'listed last');
  });
});

test('an added type with a rating of its own is listed up to that rating, and not above it', () => {
  using(ON, () => {
    const s = hero(druid(8, 'circle-of-the-rated')), wild = feat(s, 'wild-shape'), ids = C.formsFor(wild).map((m) => m.id);
    assert.deepEqual(wild.action.form.typeMaxCr, { elemental: 2 });
    assert.ok(ids.includes('azer-sentinel') && ids.includes('gargoyle') && ids.includes('wolf'));
    assert.equal(ids.includes('fire-elemental'), false, 'CR 5 is above the elementals\' own rating');
    for (const id of ids) { const u = structuredClone(s); assert.equal(apply(u, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: id }, DM).ok, true, id); }
    for (const id of ['fire-elemental', 'goblin-warrior']) { const u = structuredClone(s); assert.equal(apply(u, { type: 'feature', actor: 'hero', feature: 'wild-shape', form: id }, DM).ok, false, id); }
  });
});

test('an SRD druid\'s forms are not priced: its price is the feature\'s own use, as before', () => {
  const s = hero({ ...druid(6, 'x'), subclass: 'land' }), e = s.entities.hero, wild = feat(s, 'wild-shape');
  assert.equal(wild.action.form.cost, undefined);
  const p = C.formPrice(e, wild, CONTENT.monsters.wolf);
  assert.deepEqual([p.priced, p.n, p.ok], [false, 1, true]);
});

test('Hurl Through Hell\'s slot choice is for any caster: a paladin with a use spent lists its spell slots, a warlock its Pact Magic slot, and the engine takes `slot`', () => {
  homebrew(paladin(), (s) => {
    const e = s.entities.hero, f = feat(s, hb('lantern-relight'));
    assert.equal(C.kindOf(f), 'hurl');
    assert.deepEqual(C.slotLevels(e), [1, 2, 3].filter((l) => (e.slots[l] ?? 0) > 0));
    e.uses[hb('lantern-relight')] = 0;
    const lv = C.slotLevels(e).at(-1), before = e.slots[lv], r = ok(apply(s, { type: 'feature', actor: 'hero', feature: hb('lantern-relight'), slot: lv }, DM));
    assert.equal(e.slots[lv], before - 1); assert.ok(r.events.some((x) => /restored with a level \d spell slot/.test(x.action ?? '')));
  });
  const w = hero(WL).entities.hero; assert.equal(w.pact, true);
  assert.deepEqual(C.slotLevels(w), Object.keys(w.slots).map(Number).filter((l) => w.slots[l] > 0).sort((a, b) => a - b));
});
