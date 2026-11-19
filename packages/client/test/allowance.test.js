// The client's side of the movement an Opportunity Attack gave (issue #536, DEBT T93; docs/specs/homebrew-subclasses.md, "Build notes: H"): who holds it, the places it
// reaches, the words, and whom the DM's auto-play waits for. The oath is invented for this test (the "Oath of the Hollow Bell", a pack "bell-needle-folk").
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as grapple.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'allowance-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { owedFeet, offerOf, offers, waitingFor, reachOf, moveLabel, forgoLabel, offerWords, waitWords, giveUpLabel } = await imp('allowance.js');
const { apply, current, makeEntity, moveOptions } = await imp('shared/engine.js');
const { derive } = await imp('shared/derive.js');
const { newGame } = await imp('shared/scenario.js');
const { loadPack, overlayOf, using } = await imp('shared/content/registry.js');
const { view } = await imp('shared/view.js');

const DM = { role: 'dm', userId: 'dm' }, PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const P = 'bell-needle-folk', hb = (n) => `hb-${P}-${n}`;
const BELL = { id: hb('oath-of-the-hollow-bell'), name: 'Oath of the Hollow Bell', class: 'paladin', source: `homebrew:${P}`, checked: false, text: 'Sworn to the bell.',
  features: [{ id: hb('bell-chase'), name: 'Bell chase', level: 3, tier: 'auto', checked: false, text: 'The bell chase, in the pack\'s own words.', grants: { triggers: { opportunityHit: { move: 'half' } } } }] };
const loaded = loadPack({ format: 'hextable-pack', v: 1, pack: { id: P, name: 'Bell and Needle Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for a test.' }, subclasses: [BELL] });
assert.ok(loaded.ok, (loaded.problems ?? []).join('; '));
const ON = overlayOf([loaded.pack]);
const SHEET = { name: 'Sir Bell', class: 'paladin', level: 5, subclass: hb('oath-of-the-hollow-bell'), abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, skills: ['athletics', 'religion'],
  choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'], spells: ['bless', 'cure-wounds'] };

// The hero (Sir Bell, claimed by Pat) at 0,0 on grass; Gob beside it, Bo on its other side; 300 Hit Points and Armor Class 1 each, so that only a natural 1 misses.
// Gob walks off on its turn until the hero's Opportunity Attack hits: the hero then holds 15 feet.
function held() {
  for (let seed = 1; seed < 80; seed++) {
    const s = newGame(seed);
    for (const id of Object.keys(s.entities)) delete s.entities[id];
    for (const t of Object.values(s.map.levels[0].tiles)) t.t = 'grass';
    s.settings.autoEngage = false;
    s.entities.hero = makeEntity(derive(SHEET).record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
    s.entities.hero.sheet = structuredClone(SHEET);
    ok(apply(s, { type: 'claim', entity: 'hero', user: 'pat', userName: 'Pat' }, PAT));
    for (const [key, at, name] of [['gob', { q: 1, r: 0 }, 'Gob'], ['bo', { q: -1, r: 0 }, 'Bo']]) {
      s[key] = ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at, name }, DM)).events[0].id;
      Object.assign(s.entities[s[key]], { hp: 300, maxHp: 300, ac: 1 });
    }
    ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 6 }, DM));
    for (let i = 0; i < 60 && current(s) !== s.gob; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
    ok(apply(s, { type: 'move', actor: s.gob, to: { q: 3, r: 0 } }, DM));
    if (s.encounter.flags['rmove:hero']) return s;
  }
  throw new Error('no seed gave a hit');
}
const using0 = (fn) => using(ON, fn);

test('the allowance is read from the fight\'s flags, for a player and for the DM', () => {
  using0(() => {
    const s = held();
    assert.equal(owedFeet(s, 'hero'), 15);
    assert.equal(owedFeet(s, 'gob'), 0);
    const pv = view(s, PAT);
    assert.equal(owedFeet(pv, 'hero'), 15, 'a player is sent the flag of their own creature');
    const o = offerOf(pv, pv.entities.hero);
    assert.deepEqual(o, { id: 'hero', name: 'Sir Bell', feet: 15, feature: 'Bell chase' });
    assert.deepEqual(offers(pv), [o]);
    assert.equal(offerOf(pv, pv.entities[s.gob]), null, 'the mover holds none');
  });
});

test('no offer on its own turn, when down, or when none is left; a foe\'s is not an offer', () => {
  using0(() => {
    const s = held();
    const own = structuredClone(s); own.encounter.turn = own.encounter.order.findIndex((o) => o.id === 'hero');
    assert.equal(offerOf(own, own.entities.hero), null, 'on its own turn the flag is not for the allowance');
    const down = structuredClone(s); Object.assign(down.entities.hero, { hp: 0, cond: { ...down.entities.hero.cond, unconscious: true } });
    assert.equal(offerOf(down, down.entities.hero), null);
    const none = structuredClone(s); delete none.encounter.flags['rmove:hero'];
    assert.deepEqual(offers(none), []);
    const foe = structuredClone(s); foe.encounter.flags[`rmove:${s.bo}`] = 15;
    assert.deepEqual(offers(foe).map((o) => o.id), ['hero'], 'a foe\'s is the DM\'s to play');
    const bad = structuredClone(s); bad.encounter.flags['rmove:hero'] = 'x';
    assert.equal(offerOf(bad, bad.entities.hero), null);
  });
});

test('the reach is what the engine lets the move reach: no further than the feet, and every place it names is accepted by `move`', () => {
  using0(() => {
    const s = held();
    const pv = view(s, PAT), reach = reachOf(pv, pv.entities.hero);
    assert.ok(reach.length > 0);
    const hero = s.entities.hero;
    const own = new Set(reachOf(s, hero));
    assert.deepEqual([...own].sort(), [...reach].sort(), 'the same from the player\'s view and from the whole state');
    // never further than 15 feet (three steps) from where it stands
    const far = moveOptions({ ...s, encounter: { ...s.encounter, turn: s.encounter.order.findIndex((o) => o.id === 'hero'), budget: { move: 30, dashes: -1, free: true } } }, hero);
    assert.ok([...far.keys()].filter((k) => far.get(k).canStop).length > reach.length, 'a bigger budget reaches more, so the feet are what limits it');
    for (const k of reach) {
      const node = moveOptions({ ...s, encounter: { ...s.encounter, turn: s.encounter.order.findIndex((o) => o.id === 'hero'), budget: { move: 15, dashes: -1, diagonals: 0, free: true } } }, hero).get(k);
      const probe = structuredClone(s);
      const r = apply(probe, { type: 'move', actor: 'hero', to: node.h }, PAT);
      assert.ok(r.ok, `${k}: ${r.error}`);
      assert.equal(r.events.some((x) => x.type === 'reaction' || (x.type === 'attack' && x.opportunity)), false, 'provokes nothing');
    }
    // a place one step past what it has is not in the list, and the engine refuses it
    const spent = structuredClone(s); ok(apply(spent, { type: 'move', actor: 'hero', to: { q: 1, r: 0 } }, PAT));
    assert.equal(owedFeet(spent, 'hero'), 10);
    assert.ok(reachOf(spent, spent.entities.hero).length < reach.length, 'what is left reaches less');
    assert.equal(reachOf({ ...s, encounter: { ...s.encounter, flags: {} } }, hero).length, 0, 'none held, no reach');
  });
});

test('whom the DM\'s auto-play waits for, and that it stops waiting when the movement is spent or given up', () => {
  using0(() => {
    const s = held(), opts = { offline: () => false };
    assert.deepEqual(waitingFor(s, opts).map((o) => o.id), ['hero']);
    assert.deepEqual(waitingFor(s, { offline: () => true }).map((o) => o.id), ['hero'], 'a player who is offline is waited for: a lost link never acts by itself');
    const spent = structuredClone(s);
    ok(apply(spent, { type: 'move', actor: 'hero', to: { q: 1, r: 0 } }, PAT)); ok(apply(spent, { type: 'move', actor: 'hero', to: { q: 2, r: 0 } }, PAT)); ok(apply(spent, { type: 'move', actor: 'hero', to: { q: 2, r: 1 } }, PAT));
    assert.deepEqual(waitingFor(spent, opts), [], 'all spent');
    const forgone = structuredClone(s);
    no(apply(forgone, { type: 'forgoMove', actor: 'bo' }, PAT));
    ok(apply(forgone, { type: 'forgoMove', actor: 'hero' }, PAT));
    assert.deepEqual(waitingFor(forgone, opts), [], 'given up');
    const byDm = structuredClone(s); ok(apply(byDm, { type: 'forgoMove', actor: 'hero' }, DM));
    assert.deepEqual(waitingFor(byDm, opts), [], 'the DM may give it up for them');
  });
});
const no = (r) => { assert.equal(r.ok, false); return r; };

test('the words: the offer, the armed offer, the wait, and the buttons', () => {
  const o = { id: 'hero', name: 'Sir Bell', feet: 15, feature: 'Bell chase' };
  assert.equal(moveLabel(o), 'Move up to 15 ft (Bell chase)');
  assert.equal(forgoLabel, "Don't move");
  assert.equal(offerWords(o), 'Sir Bell may move up to 15 ft, provoking no Opportunity Attacks.');
  assert.match(offerWords(o, { armed: true }), /^Sir Bell: tap a shaded place to move, up to 15 ft\./);
  assert.match(offerWords(o, { waiting: true }), /The foes wait for this\.$/);
  assert.equal(waitWords([o]), 'Waiting for Sir Bell to move (15 ft). The foes go on when it is spent or given up.');
  assert.equal(waitWords([o, { ...o, name: 'Zaa', feet: 10 }]), 'Waiting for Sir Bell and Zaa to move (15 ft and 10 ft). The foes go on when it is spent or given up.');
  assert.equal(giveUpLabel([o]), 'Give it up');
  assert.equal(giveUpLabel([o, o]), 'Give them up');
});
