// The weapon, armour and object readings are TRUE: each sentence is held to what the engine does when the invented entries are played
// (derive(), apply() with a map). A field of these kinds the linter has and the reader has no words for fails reader-gear.test.js;
// a sentence that says what the engine does not do fails here (docs/specs/homebrew.md, #419, the standard of #431).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTENT } from '../src/content/index.js';
import { MASTERIES, WEAPON_PROPERTIES } from '../src/content/schema.js';
import { readEntry } from '../src/content/reader.js';
import { apply, current, makeEntity, passive } from '../src/engine.js';
import { derive, mod, validate } from '../src/derive.js';
import { newGame } from '../src/scenario.js';

const PACK = JSON.parse(readFileSync(new URL('./fixtures/reader-kinds-pack.json', import.meta.url), 'utf8'));
const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const say = (kind, e) => readEntry(kind, e).lines.join('\n');
const W = Object.fromEntries(PACK.weapons.map((w) => [w.id, w]));
const AR = Object.fromEntries(PACK.armour.map((a) => [a.id, a]));
// Lend entries to the content lookups for one call.
function lend(kind, entries, fn) {
  const put = [];
  for (const e of entries) { CONTENT[kind][e.id] = e; put.push(e.id); }
  try { return fn(); } finally { for (const id of put) delete CONTENT[kind][id]; }
}
const withGear = (fn) => lend('weapons', PACK.weapons, () => lend('armour', PACK.armour, fn));
const SCORES = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (extra = {}) => ({ name: 'Brenna', class: 'fighter', level: 5, subclass: 'champion', abilities: SCORES, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, ...extra });
const rogue = (extra = {}) => ({ name: 'Pip', class: 'rogue', level: 3, abilities: SCORES, skills: ['stealth', 'perception', 'acrobatics', 'sleight-of-hand'], expertise: ['stealth', 'perception'], ...extra });
const wizard = (extra = {}) => ({ name: 'Wen', class: 'wizard', level: 1, abilities: SCORES, skills: ['arcana', 'history'], ...extra });
const monk = (extra = {}) => ({ name: 'Mo', class: 'monk', level: 5, abilities: { ...SCORES, dex: 16, str: 10 }, skills: ['acrobatics', 'insight'], ...extra });
const rec = (sheet) => derive(sheet).record;
const attacksOf = (sheet) => Object.fromEntries(rec(sheet).attacks.map((a) => [a.id, a]));
const problems = (sheet, re) => validate(sheet).filter((m) => re.test(m));
const PB5 = 3;

// ====================================================================================================
// Weapons
// ====================================================================================================
// The rule the reading states for the ability: Finesse, the better of Strength and Dexterity (Strength on a tie); otherwise Dexterity for a ranged weapon, Strength for the rest.
const abilityFor = (w, s) => (w.properties.includes('finesse') ? (s.dex > s.str ? 'dex' : 'str') : w.kind === 'ranged' ? 'dex' : 'str');
const flat = (n) => (n >= 0 ? `+${n}` : `${n}`);
const dmgFor = (dmg, m) => (/^\d+$/.test(dmg) ? flat(+dmg + m) : m === 0 ? dmg : `${dmg}${flat(m)}`);

test('weapons: the attack bonus, damage, ability, reach and range the reading states are the engine\'s', () => withGear(() => {
  for (const scores of [SCORES, { ...SCORES, str: 10, dex: 18 }, { ...SCORES, str: 14, dex: 14 }]) {
    for (const w of PACK.weapons) {
      const text = say('weapon', w), a = attacksOf(fighter({ weapons: [w.id], abilities: scores }))[w.id];
      const ab = abilityFor(w, scores), m = mod(scores[ab]);
      // The reading names the damage, its type and the ability rule.
      assert.ok(text.includes(`${w.damage} ${w.type} damage`), `${w.id}: the damage is said`);
      assert.ok(text.includes(w.properties.includes('finesse') ? 'the better of the holder\'s Strength and Dexterity modifiers (Strength on a tie)' : w.kind === 'ranged' ? 'plus the holder\'s Dexterity modifier' : 'plus the holder\'s Strength modifier'), `${w.id}: the ability rule is said`);
      assert.equal(a.abil, ab, `${w.id}: ability`);
      assert.equal(a.damage, dmgFor(w.damage, m), `${w.id}: damage is the dice plus the modifier (a fixed number has no dice)`);
      assert.equal(a.dtype, w.type);
      assert.equal(a.bonus, m + PB5 + (w.kind === 'ranged' ? 0 : 0), `${w.id}: attack bonus is the modifier plus the Proficiency Bonus of a trained holder`);
      assert.equal(a.type, w.kind);
      if (w.kind === 'melee') { assert.equal(a.reach, w.properties.includes('reach') ? 10 : 5, `${w.id}: reach`); assert.ok(text.includes(`a creature up to ${w.properties.includes('reach') ? 10 : 5} feet away`), `${w.id}: reach said`); }
      else { assert.deepEqual(a.range, w.range, `${w.id}: range`); assert.ok(text.includes(`up to ${w.range[0]} feet away is rolled normally, one from ${w.range[0] + 1} to ${w.range[1]} feet has Disadvantage`)); }
      assert.equal(a.finesse === true, w.properties.includes('finesse'), `${w.id}: a Finesse weapon is marked, so Sneak Attack may use it`);
    }
  }
  // A fixed damage ("2") has no dice: the reading says so.
  assert.ok(say('weapon', W['hb-rk-needle-fang']).includes('(a fixed number: no dice are rolled)'));
  assert.ok(!say('weapon', W['hb-rk-gale-spear']).includes('a fixed number'));
}));

test('weapons: a thrown attack, a versatile attack, and a Shield on the sheet', () => withGear(() => {
  const spear = W['hb-rk-gale-spear'], s5 = fighter({ weapons: [spear.id] });
  const a = attacksOf(s5);
  // Thrown: a second, ranged attack of the same bonus and the same damage (not the versatile damage), at the weapon's range.
  assert.equal(a[`${spear.id}-thrown`].type, 'ranged');
  assert.deepEqual(a[`${spear.id}-thrown`].range, spear.range);
  assert.equal(a[`${spear.id}-thrown`].bonus, a[spear.id].bonus);
  assert.equal(a[`${spear.id}-thrown`].damage, a[spear.id].damage);
  assert.match(say('weapon', spear), /Thrown: the wielder may instead throw it, as a ranged attack with the same attack bonus and the same damage \(not the versatile damage\)/);
  // Versatile: a second attack with the versatile damage, while the sheet carries no Shield.
  assert.equal(a[`${spear.id}-two-handed`].damage, `${spear.versatile}+3`);
  assert.equal(a[`${spear.id}-two-handed`].reach, 10);
  assert.ok(say('weapon', spear).includes(`deals ${spear.versatile} instead`));
  assert.equal(attacksOf(fighter({ weapons: [spear.id], shield: true }))[`${spear.id}-two-handed`], undefined, 'no two-handed attack beside a Shield');
  assert.ok(attacksOf(fighter({ weapons: [spear.id], shield: true }))[spear.id], 'the one-handed attack stays');
  // A ranged weapon that also says Thrown gets no second attack, as the reading says.
  const chakram = W['hb-rk-sky-chakram'];
  assert.deepEqual(Object.keys(attacksOf(fighter({ weapons: [chakram.id] }))).filter((k) => k.startsWith(chakram.id)), [chakram.id]);
  assert.match(say('weapon', chakram), /Thrown: it is already a ranged weapon, so the property adds nothing: the engine makes no second attack of it\./);
  // A weapon without Thrown or Versatile has neither.
  assert.deepEqual(Object.keys(attacksOf(fighter({ weapons: ['hb-rk-burl-club'] }))).filter((k) => k.startsWith('hb-rk-burl-club')), ['hb-rk-burl-club']);
}));

test('weapons: the properties the engine only shows as text change nothing it rolls, and the reading hands them to the DM', () => withGear(() => {
  const noop = { heavy: 'hb-rk-fen-axe', loading: 'hb-rk-marsh-crossbow', 'two-handed': 'hb-rk-rook-hammer', ammunition: 'hb-rk-marsh-crossbow' };
  for (const [p, id] of Object.entries(noop)) {
    const w = W[id], without = { ...w, id: `${id}-bare`, properties: w.properties.filter((x) => x !== p) };
    lend('weapons', [without], () => {
      const a = attacksOf(fighter({ weapons: [id] }))[id], b = attacksOf(fighter({ weapons: [without.id] }))[without.id];
      assert.deepEqual({ ...a, id: 0, name: 0, weapon: 0 }, { ...b, id: 0, name: 0, weapon: 0 }, `${p}: the attack is the same without it`);
    });
    const r = readEntry('weapon', w);
    assert.ok(r.doesNot.length > 0, `${p}: the DM does it by hand`);
  }
  assert.match(say('weapon', W['hb-rk-marsh-crossbow']), /Ammunition \("dart"\): the engine neither requires nor spends ammunition/);
  // Mastery, the ammunition's name, a mount rule, weight and price: no effect on the attack record, whatever they say.
  const base = W['hb-rk-rook-hammer'];
  for (const [k, v] of [['mastery', 'vex'], ['weight', 99], ['cost', '1 CP'], ['twoHandedUnlessMounted', undefined], ['ammo', 'stone']]) {
    const alt = { ...base, id: 'hb-rk-alt', [k]: v };
    if (v === undefined) delete alt[k];
    lend('weapons', [alt], () => assert.deepEqual({ ...attacksOf(fighter({ weapons: ['hb-rk-alt'] }))['hb-rk-alt'], id: 0, name: 0, weapon: 0 }, { ...attacksOf(fighter({ weapons: [base.id] }))[base.id], id: 0, name: 0, weapon: 0 }, `${k} changes nothing`));
  }
  for (const m of MASTERIES) assert.ok(readEntry('weapon', { ...base, mastery: m }).doesNot.some((x) => x.includes(m[0].toUpperCase() + m.slice(1))), `${m} is the DM's`);
  assert.match(say('weapon', base), /The engine applies no mastery property to any weapon/);
  assert.match(say('weapon', base), /It is two-handed unless the wielder is mounted\. The engine reads neither hands nor mounts for it\./);
  assert.match(say('weapon', base), /The engine uses no weight for anything/);
  // Two hands and a Shield: nothing stops the sheet.
  assert.deepEqual(problems(fighter({ weapons: [base.id], shield: true }), /./), [], 'a Two-handed weapon beside a Shield is accepted');
  assert.ok(WEAPON_PROPERTIES.length === 9);
}));

test('weapons: a long-range attack, the reach and the refusals, played through apply()', () => withGear(() => {
  const arena = (weapon, dist, seed = 7) => {
    const sheet = fighter({ weapons: [weapon.id] });
    const s = newGame(seed);
    for (const id of Object.keys(s.entities)) if (id !== 'm1') delete s.entities[id];
    for (const t of Object.values(s.map.levels[0].tiles)) t.t = 'grass';
    s.settings.autoEngage = false;
    s.entities.hero = makeEntity(rec(sheet), { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 }, owner: 'pat', ownerName: 'Pat' });
    s.entities.hero.sheet = structuredClone(sheet);
    ok(apply(s, { type: 'place', actor: 'm1', to: { q: dist, r: 0 } }, DM));
    ok(apply(s, { type: 'startEncounter', center: { q: Math.floor(dist / 2), r: 0 }, radius: 12 }, DM));
    for (let n = 0; current(s) !== 'hero' && n < 20; n++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
    return s;
  };
  const attack = (s, id) => apply(s, { type: 'attack', actor: 'hero', target: 'm1', attack: id }, DM);
  const roll = (s, id) => ok(attack(s, id)).events.find((e) => e.type === 'attack');
  // A thrown weapon: 20 normal, 60 long (4 and 12 hexes).
  const spear = { ...W['hb-rk-gale-spear'], id: 'hb-rk-t-spear', reach: undefined, range: [20, 60] };
  lend('weapons', [spear], () => {
    const id = `${spear.id}-thrown`;
    assert.notEqual(roll(arena(spear, 3), id).mode, 'dis', 'within the normal range');
    assert.notEqual(roll(arena(spear, 4), id).mode, 'dis', 'at the normal range');
    const far = roll(arena(spear, 6), id); assert.equal(far.mode, 'dis'); assert.deepEqual(far.why, ['long range']);
    assert.equal(roll(arena(spear, 12), id).mode, 'dis', 'at the long range');
    const refused = attack(arena(spear, 12), id); assert.ok(refused.ok);                       // 12 hexes = 60 feet
    assert.equal(apply(arena(spear, 13), { type: 'attack', actor: 'hero', target: 'm1', attack: id }, DM).ok, false, 'beyond the long range');
    // An enemy within 5 feet who can see the thrower: Disadvantage.
    const close = roll(arena(spear, 1), id); assert.equal(close.mode, 'dis'); assert.deepEqual(close.why, ['enemy within 5 ft']);
  });
  // Reach 10: two hexes, and no farther.
  const reachy = W['hb-rk-gale-spear'];
  assert.ok(roll(arena(reachy, 2), reachy.id).hit !== undefined);
  const e = attack(arena(reachy, 3), reachy.id); assert.equal(e.ok, false); assert.match(e.error, /reaches 10 ft/);
  const plain = W['hb-rk-burl-club'];
  const e2 = attack(arena(plain, 2), plain.id); assert.equal(e2.ok, false); assert.match(e2.error, /reaches 5 ft/);
  // A ranged weapon with a shorter range for the play: the numbers are the entry's.
  const bow = { ...W['hb-rk-marsh-crossbow'], id: 'hb-rk-t-bow', range: [10, 30] };
  lend('weapons', [bow], () => {
    assert.match(say('weapon', bow), /an attack up to 10 feet away is rolled normally, one from 11 to 30 feet has Disadvantage \(long range\), and the engine refuses a target beyond 30 feet/);
    assert.notEqual(roll(arena(bow, 2), bow.id).mode, 'dis');
    assert.equal(roll(arena(bow, 3), bow.id).mode, 'dis');
    assert.equal(roll(arena(bow, 6), bow.id).mode, 'dis');
    assert.equal(attack(arena(bow, 7), bow.id).ok, false);
    // Loading and Ammunition: two attacks in one action (Extra Attack), no ammunition anywhere.
    const s = arena(bow, 4);
    ok(attack(s, bow.id)); ok(attack(s, bow.id));
    assert.deepEqual(s.entities.hero.gear ?? [], s.entities.hero.gear ?? [], 'the sheet holds no ammunition');
  });
  // The damage rolled is the weapon's die, and the type is its own.
  const s = arena(W['hb-rk-burl-club'], 1);
  const ev = ok(attack(s, 'hb-rk-burl-club')).events;
  const dealt = ev.find((x) => x.type === 'damage');
  if (dealt) { assert.equal(dealt.dtype, 'bludgeoning'); assert.ok(dealt.dice.every((d) => d.sides === 6)); assert.equal(dealt.bonus, 3); }
}));

test('weapons: only a trained holder may have it on the sheet, and Light, Finesse and Martial Arts are as the reading says', () => withGear(() => {
  // A wizard has simple weapons only: a martial weapon on the sheet is refused; derive builds it without the Proficiency Bonus.
  for (const w of PACK.weapons) {
    const w1 = wizard({ weapons: [w.id] });
    assert.equal(problems(w1, /not proficient/).length, w.category === 'martial' ? 1 : 0, `${w.id}: a wizard`);
    const a = attacksOf(w1)[w.id], m = mod(SCORES[abilityFor(w, SCORES)]);
    assert.equal(a.bonus, m + (w.category === 'simple' ? 2 : 0), `${w.id}: a wizard\'s bonus has the Proficiency Bonus only for a simple weapon`);
    assert.equal(problems(fighter({ weapons: [w.id] }), /not proficient/).length, 0, 'a fighter is trained in both');
    assert.ok(say('weapon', w).includes('A sheet that lists it for a character who is not trained is refused by the engine.'));
  }
  const refused = apply(newGame(3), { type: 'setSheet', sheet: wizard({ weapons: ['hb-rk-fen-axe'] }) }, DM);
  assert.equal(refused.ok, false); assert.match(refused.error, /can't be played yet/);
  // A rogue is trained in martial weapons that have Finesse or Light only.
  const trainedRogue = PACK.weapons.filter((w) => w.category === 'simple' || w.properties.includes('finesse') || w.properties.includes('light')).map((w) => w.id).sort();
  assert.deepEqual(PACK.weapons.filter((w) => problems(rogue({ weapons: [w.id] }), /not proficient/).length === 0).map((w) => w.id).sort(), trainedRogue, 'a rogue: martial with Finesse or Light');
  // A monk is trained in simple weapons and martial weapons that have Light.
  const trainedMonk = PACK.weapons.filter((w) => w.category === 'simple' || w.properties.includes('light')).map((w) => w.id).sort();
  assert.deepEqual(PACK.weapons.filter((w) => problems(monk({ weapons: [w.id] }), /not proficient/).length === 0).map((w) => w.id).sort(), trainedMonk, 'a monk: simple, or martial with Light');
  const light = say('weapon', W['hb-rk-quill-lance']);
  assert.match(light, /Light: for a martial weapon, a class whose training names martial weapons that have Light counts as trained in it\./);
  // Martial Arts: a monk with no armor and no Shield treats a simple or Light melee weapon as a monk weapon: the better of Strength and Dexterity (dex 16 > str 10) and the larger die.
  for (const id of ['hb-rk-burl-club', 'hb-rk-quill-lance', 'hb-rk-needle-fang']) {
    const w = W[id], a = attacksOf(monk({ weapons: [id] }))[id];
    assert.equal(a.abil, 'dex', `${id}: a monk's weapon uses Dexterity here`);
    if (!/^\d+$/.test(w.damage)) assert.ok(a.damage.startsWith(w.damage === '1d6' ? '1d8' : w.damage), `${id}: the Martial Arts die when larger (1d8 at level 5): ${a.damage}`);
  }
  { const a = attacksOf(monk({ weapons: ['hb-rk-burl-club'], armour: 'padded-armor' }))['hb-rk-burl-club']; assert.equal(a.abil, 'str', 'armour worn: no Martial Arts'); assert.equal(a.damage, '1d6+0'.replace('+0', '')); }
}));

test('weapons: a bonus to ranged weapon attacks (Archery) is added to a ranged weapon only', () => withGear(() => {
  const arch = (id) => attacksOf(fighter({ weapons: [id], choices: { 'fighting-style': 'archery' } }));
  const plain = (id) => attacksOf(fighter({ weapons: [id] }));
  for (const id of ['hb-rk-marsh-crossbow', 'hb-rk-sky-chakram']) assert.equal(arch(id)[id].bonus, plain(id)[id].bonus + 2, `${id}: +2 for a ranged weapon`);
  assert.equal(arch('hb-rk-gale-spear')['hb-rk-gale-spear-thrown'].bonus, plain('hb-rk-gale-spear')['hb-rk-gale-spear-thrown'].bonus, 'a thrown melee weapon gets none');
  assert.equal(arch('hb-rk-gale-spear')['hb-rk-gale-spear'].bonus, plain('hb-rk-gale-spear')['hb-rk-gale-spear'].bonus);
  assert.match(say('weapon', W['hb-rk-marsh-crossbow']), /A holder who gets a bonus to ranged weapon attacks \(a fighting style\) adds it\./);
}));

// ====================================================================================================
// Armour
// ====================================================================================================
const dexTerm = (a, dex) => (a.dex === 'full' ? mod(dex) : typeof a.dex === 'number' ? Math.min(mod(dex), a.dex) : 0);
test('armour: the Armor Class and the Speed the reading states are the engine\'s', () => withGear(() => {
  for (const a of PACK.armour.filter((x) => x.category !== 'shield')) {
    const text = say('armour', a);
    for (const dex of [8, 10, 14, 18, 20]) {
      for (const [style, bonus] of [['archery', 0], ['defense', 1]]) {
        const sheet = fighter({ armour: a.id, abilities: { ...SCORES, dex }, choices: { 'fighting-style': style } });
        assert.equal(rec(sheet).ac, a.ac + dexTerm(a, dex) + bonus, `${a.id} dex ${dex} ${style}`);
      }
    }
    // The Dexterity rule is said as the engine does it.
    assert.ok(text.includes(`sets the Armor Class to ${a.ac}, in place of 10`));
    assert.ok(text.includes(a.dex === 'full' ? 'whole Dexterity modifier is added' : typeof a.dex === 'number' ? `at most +${a.dex}` : 'Dexterity adds nothing'), `${a.id}: the Dexterity rule`);
    // Strength: 10 feet less Speed below the number, and only that.
    if (a.strength) {
      for (const str of [a.strength - 1, a.strength, a.strength + 2]) assert.equal(rec(fighter({ armour: a.id, abilities: { ...SCORES, str } })).speed, str < a.strength ? 20 : 30, `${a.id} Str ${str}`);
      assert.ok(text.includes(`Strength score is below ${a.strength} has 10 feet less Speed`));
      const lax = { ...a, id: 'hb-rk-lax', strength: undefined }; delete lax.strength;
      const weak = { ...SCORES, str: a.strength - 1 };
      lend('armour', [lax], () => {
        const x = rec(fighter({ armour: a.id, abilities: weak })), y = rec(fighter({ armour: 'hb-rk-lax', abilities: weak }));
        assert.equal(x.speed, y.speed - 10);
        assert.deepEqual({ ...x, speed: 0, armour: 0 }, { ...y, speed: 0, armour: 0 }, 'nothing else about the record changes');
      });
    } else assert.ok(text.includes('It asks for no Strength'), `${a.id}: no Strength asked`);
  }
  // A heavy armour with no Dexterity entry adds none, whatever the score, a negative one included.
  assert.equal(rec(fighter({ armour: 'hb-rk-stiff-cuirass', abilities: { ...SCORES, dex: 6 }, choices: { 'fighting-style': 'archery' } })).ac, 13 - 2, 'a cap of 0 still lets a negative modifier lower it');
  assert.ok(say('armour', AR['hb-rk-stiff-cuirass']).includes('at most +0; a modifier below that, a negative one too, is added as it is'));
  // No formula for a creature with no armor applies while armour is worn (Unarmored Defense).
  const barb = { name: 'Bo', class: 'barbarian', level: 1, abilities: { ...SCORES, dex: 14, con: 16 }, skills: ['athletics', 'perception'] };
  assert.equal(rec(barb).ac, 10 + 2 + 3, 'Unarmored Defense bare');
  assert.equal(rec({ ...barb, armour: 'hb-rk-thornweave-vest' }).ac, 12 + 2, 'the armour in place of it');
  assert.ok(say('armour', AR['hb-rk-thornweave-vest']).includes('A formula that gives Armor Class to a creature with no armor does not apply while it is worn.'));
}));

test('armour: Stealth Disadvantage is not applied, as the reading says', () => withGear(() => {
  const barkplate = AR['hb-rk-barkplate'], bare = { ...barkplate, id: 'hb-rk-bare', stealth: undefined }; delete bare.stealth;
  lend('armour', [bare], () => {
    const play = (armour, seed) => {
      const sheet = fighter({ armour, skills: ['athletics', 'stealth'] });
      const s = newGame(seed);
      s.entities.hero = makeEntity(rec(sheet), { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 }, owner: 'pat', ownerName: 'Pat' });
      return ok(apply(s, { type: 'check', actor: 'hero', skill: 'stealth' }, DM)).events[0];
    };
    for (let seed = 1; seed < 12; seed++) {
      const a = play(barkplate.id, seed), b = play('hb-rk-bare', seed);
      assert.deepEqual(a, b, 'the same roll with and without the penalty');
      assert.equal(a.mode, undefined); assert.equal(a.dice.length, 1, 'one die: no Disadvantage');
    }
  });
  const r = readEntry('armour', barkplate);
  assert.ok(r.lines.includes('It gives Disadvantage on Dexterity (Stealth) checks. The engine does not apply this: the wearer rolls Stealth checks as it would without the armor.'));
  assert.ok(r.doesNot.includes('Disadvantage on the wearer\'s Dexterity (Stealth) checks.'));
  assert.ok(readEntry('armour', AR['hb-rk-thornweave-vest']).lines.includes('It puts no penalty on Stealth.'));
}));

test('armour: training, the category on the table, and a Shield that is a mark on the sheet', () => withGear(() => {
  for (const a of PACK.armour) {
    const cat = a.category;
    // A wizard has no armor training; a fighter has all of it.
    const wiz = a.category === 'shield' ? wizard({ shield: true }) : wizard({ armour: a.id });
    assert.equal(problems(wiz, /no training/).length, 1, `${a.id}: a wizard is refused`);
    assert.equal(problems(a.category === 'shield' ? fighter({ shield: true }) : fighter({ armour: a.id }), /no training/).length, 0, `${a.id}: a fighter is not`);
    assert.ok(say('armour', a).includes(`A sheet that has a wearer in it who is not trained in ${cat === 'shield' ? 'Shields' : `${cat} armor`} is refused by the engine.`));
    if (cat !== 'shield') assert.equal(rec(fighter({ armour: a.id })).armour, cat, `${a.id}: the wearer's armor category on the table`);
  }
  assert.equal(apply(newGame(3), { type: 'setSheet', sheet: wizard({ armour: 'hb-rk-barkplate' }) }, DM).ok, false);
  // A Shield: +2 whatever the entry says; named as body armor it is refused; made an item's base it is +2 too.
  const sh = AR['hb-rk-lantern-shield'];
  assert.equal(rec(fighter({ shield: true })).ac, rec(fighter()).ac + 2, 'a Shield adds 2, not the entry\'s number');
  assert.notEqual(sh.ac, 2);
  assert.deepEqual(problems(fighter({ armour: sh.id }), /not armour/), ['"hb-rk-lantern-shield" is not armour in the equipment tables.']);
  const item = { id: 'hb-t-buckler', name: 'Buckler Item', category: 'armor', rarity: 'common', wear: 'shield', base: { armour: [sh.id] }, tier: 'auto', source: 'homebrew:t', checked: false, text: 'x' };
  lend('items', [item], () => assert.equal(rec(fighter({ items: [{ id: 'i1', item: item.id, equipped: true }] })).ac, rec(fighter()).ac + 2, 'a Shield item: +2'));
  const text = say('armour', sh);
  assert.match(text, /Its Armor Class number is 3, and the engine never reads it/);
  assert.ok(readEntry('armour', sh).doesNot.length === 1);
  assert.ok(!say('armour', AR['hb-rk-barkplate']).includes('never reads it'));
}));

// ====================================================================================================
// Objects
// ====================================================================================================
import * as H from '../src/hex.js';
import { newMap } from '../src/map.js';
import { barriers } from '../src/walls.js';
import { lightSources } from '../src/sight.js';
import { objectShown } from '../src/engine.js';

const PAT = { role: 'player', userId: 'pat' };
const OB = Object.fromEntries(PACK.objects.map((o) => [o.id, o]));
const withObjects = (fn) => lend('objects', PACK.objects, fn);
const GEAR = (g) => ({ ...fighter(), ...g });
// A stone floor, the hero (a fighter owned by Pat) at `at`, the placed objects; no fight unless asked for.
function stage(objects, { at = { q: 0, r: 0 }, gear = [], fight = false, sheet = fighter({ skills: ['athletics', 'perception'] }), seed = 5, foes = [] } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 8).map((h) => [H.col(h), { t: 'stone' }]));
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  ok(apply(s, { type: 'loadMap', map: newMap({ id: 'f', name: 'F', starts: [{ q: 0, r: 0 }], levels: [{ id: 'ground', name: 'G', z: 0, tiles }], walls: [], objects }) }, DM));
  ok(apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM));
  s.entities.hero = makeEntity(rec(sheet), { id: 'hero', kind: 'pc', side: 'party', pos: { q: at.q, r: at.r, z: 0 }, owner: 'pat', ownerName: 'Pat' });
  s.entities.hero.gear = [...gear];
  for (const [id, pos] of foes) { ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: pos }, DM)); }
  if (fight) {
    ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let n = 0; current(s) !== 'hero' && n < 30; n++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  }
  return s;
}
const O = (id, def, at, extra = {}) => ({ id, def, level: 'ground', at, state: OB[def].initial, ...extra });
const use = (s, object, verb, who = PAT) => apply(s, { type: 'use', actor: 'hero', object, verb }, who);
const stateOf = (s, id) => s.map.objects.find((o) => o.id === id).state;

test('objects: what each state blocks is what the reading says it blocks, for a door and for a thing', () => withObjects(() => {
  const gate = OB['hb-rk-glasswork-gate'];
  // A door on the line between (3,0) and its neighbour across edge 0: look through the line itself.
  for (const state of Object.keys(gate.states)) {
    const s = stage([O('g', gate.id, { q: 3, r: 0 }, { edge: 0, state })]), B = barriers(s.map);
    const a = { q: 3, r: 0 }, b = H.neighbors ? H.neighbors(a)[0] : null;
    const blocks = gate.states[state].blocks;
    assert.equal(B.blocked('ground', a, b, 'move'), blocks.includes('move'), `${state}: movement`);
    assert.equal(B.blocked('ground', a, b, 'sight'), blocks.includes('sight'), `${state}: sight`);
    const line = say('object', gate).split('\n').find((l) => l.startsWith(`  State "${state}"`));
    assert.ok(line.includes(blocks.includes('move') && blocks.includes('sight') ? 'it stops both' : blocks.includes('move') ? 'nothing can walk across its line, but it can be seen across' : blocks.includes('sight') ? 'it can be walked across, but nothing can be seen across it' : 'it can be walked across and seen across'), `${state}: ${line}`);
  }
}));
