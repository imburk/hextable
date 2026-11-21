// The create-character screen's pure parts (#603): who is trained in what (agreeing with derive.js), what a class feature does and when, the class resource,
// the heads-up lines, and the item texts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'buildparts-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const P = await import(pathToFileURL(join(tmp, 'buildparts.js')));
const { CONTENT } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));
const { derive, featuresOf, classOf } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { armourTrained } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));

const sheet = (cls, level = 5, extra = {}) => ({ name: 'T', class: cls, level, abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 10 }, skills: [], ...extra });

test('weaponTrained agrees with derive for every class and every weapon', () => {
  for (const c of Object.values(CONTENT.classes)) {
    const words = P.weaponWords(c);
    for (const w of Object.values(CONTENT.weapons)) {
      const d = derive({ ...sheet(c.id, 1), weapons: [w.id] }), why = d.why.attacks[w.id] ?? d.why.attacks[`${w.id}-thrown`];
      if (!why) continue;
      assert.equal(why.includes('not proficient'), !P.weaponTrained(w, words), `${c.id} with ${w.id}`);
    }
  }
});

test('a Monk is trained in Simple weapons and Light martial ones, and in no armour; a class with armour training lists it', () => {
  const monk = CONTENT.classes.monk, words = P.weaponWords(monk);
  assert.ok(P.weaponTrained(CONTENT.weapons.shortsword, words) && P.weaponTrained(CONTENT.weapons.dagger, words));
  assert.ok(!P.weaponTrained(CONTENT.weapons.longsword, words) && !P.weaponTrained(CONTENT.weapons.greatsword, words));
  assert.match(P.trainLine(monk, armourTrained(monk), words), /Armour: none · Shields: no/);
  assert.match(P.trainLine(CONTENT.classes.fighter, armourTrained(CONTENT.classes.fighter), P.weaponWords(CONTENT.classes.fighter)), /Armour: light, medium, heavy · Shields: yes/);
});

test('the resource of a Monk is Focus Points, read from the data: its count, its rest, and what spends it', () => {
  const s = sheet('monk'), d = derive(s), res = P.resourcesOf(featuresOf(s), d.record.feats);
  assert.equal(res.length, 1);
  const [r] = res;
  assert.equal(r.title, 'Focus Points'); assert.equal(r.max, 5); assert.equal(r.recharge, 'short');
  assert.equal(r.alias, "Monk's Focus: your chi");
  assert.deepEqual(r.spenders.map((f) => f.id).sort(), ['flurry-of-blows', 'patient-defense', 'step-of-the-wind', 'stunning-strike']);
  assert.equal(P.costText(r, r.spenders[0]), '1 Focus Point');
});

test('another class gets its own resource from its own data (Sorcery Points) and a class with none gets none', () => {
  const s = sheet('sorcerer'), res = P.resourcesOf(featuresOf(s), derive(s).record.feats);
  assert.ok(res.every((r) => r.spenders.length > 0));
  assert.equal(P.resourcesOf(featuresOf(sheet('wizard')), derive(sheet('wizard')).record.feats).length, 0);
});

test('each feature says when it is used; passive ones say Always on', () => {
  const f = (id, cls = 'monk') => CONTENT.classes[cls].features.find((x) => x.id === id);
  assert.equal(P.featureWhen(f('flurry-of-blows')), 'Bonus Action');
  assert.equal(P.featureWhen(f('deflect-attacks')), 'Reaction');
  assert.equal(P.featureWhen(f('extra-attack')), 'Attack action');
  assert.equal(P.featureWhen(f('uncanny-metabolism')), 'Roll Initiative');
  assert.equal(P.featureWhen(f('unarmored-defense')), 'Always on');
  assert.equal(P.featureWhen(f('martial-arts')), 'Always on');
});

test('features are grouped by what they do, and the resource and what spends it are not listed twice', () => {
  const s = sheet('monk'), entries = featuresOf(s), res = P.resourcesOf(entries, derive(s).record.feats), groups = P.groupedFeatures(entries, res);
  const names = Object.fromEntries(groups.map(([g, l]) => [g, l.map((f) => f.id)]));
  assert.ok(names.Attacks.includes('martial-arts') && names.Attacks.includes('extra-attack'));
  assert.ok(names.Defence.includes('unarmored-defense') && names.Defence.includes('deflect-attacks'));
  const all = groups.flatMap(([, l]) => l.map((f) => f.id));
  assert.ok(!all.includes('monks-focus') && !all.includes('flurry-of-blows'));
  assert.equal(new Set(all).size, all.length);
});

test('what turns off with armour is read from the data: a Monk has three features; a Fighter has none', () => {
  assert.deepEqual(P.bareFeatures(featuresOf(sheet('monk'))).sort(), ['Martial Arts', 'Unarmored Defense', 'Unarmored Movement']);
  assert.deepEqual(P.bareFeatures(featuresOf(sheet('fighter'))), []);
});

test('the heads-up lines: untrained armour, a Strength it needs, Stealth, an untrained Shield, a weapon without training', () => {
  const monk = CONTENT.classes.monk, words = P.weaponWords(monk), trained = { armour: armourTrained(monk), weapons: words };
  const base = { armour: CONTENT.armour['plate-armor'], shield: true, weapons: [CONTENT.weapons.longsword], abil: { str: 10 }, trained, caster: false, bare: ['Martial Arts'] };
  const lines = P.headsUp(base);
  assert.ok(lines.includes('Disadvantage on every Strength and Dexterity roll'));
  assert.ok(lines.some((l) => /Speed .* ft: Plate Armor needs Strength 15/.test(l)));
  assert.ok(lines.includes('Disadvantage on Stealth checks') && lines.includes('The Shield gives no AC (not trained)'));
  assert.ok(lines.includes('Martial Arts is off') && lines.includes('No Proficiency Bonus or Weapon Mastery with the Longsword'));
  assert.ok(P.headsUp({ ...base, caster: true }).includes('Cannot cast spells'));
  // An untrained Shield alone costs the same as untrained armour.
  const sh = P.headsUp({ ...base, armour: null, weapons: [], caster: true });
  assert.ok(sh.includes('Cannot cast spells') && sh.includes('Disadvantage on every Strength and Dexterity roll') && sh.includes('The Shield gives no AC (not trained)'), sh.join('|'));
  assert.deepEqual(P.headsUp({ ...base, armour: null, shield: false, weapons: [CONTENT.weapons.shortsword] }), []);
});

test('item texts: every property and mastery in the data has our own words, and armour says AC, Strength, Stealth and don/doff', () => {
  const props = new Set(Object.values(CONTENT.weapons).flatMap((w) => w.properties)), masteries = new Set(Object.values(CONTENT.weapons).map((w) => w.mastery));
  for (const p of props) assert.ok(P.PROP_TEXT[p], `property ${p}`);
  for (const m of masteries) assert.ok(P.MASTERY_TEXT[m], `mastery ${m}`);
  const dagger = P.weaponLines(CONTENT.weapons.dagger).join(' ');
  assert.match(dagger, /Finesse/); assert.match(dagger, /Range 20 feet; up to 60 feet/); assert.match(dagger, /Mastery .*Nick/);
  const plate = P.armourLines(CONTENT.armour['plate-armor']).join(' ');
  assert.match(plate, /Armor Class 18/); assert.match(plate, /Strength is 15/); assert.match(plate, /Stealth/); assert.match(plate, /10 minutes to put on and 5 to take off/);
  assert.match(P.armourLines(CONTENT.armour.shield).join(' '), /\+2 Armor Class/);
});

test('attack rows fold a Bonus Action twin into its base row, and the cost sentences carry the numbers', () => {
  const rows = P.attackRows(derive({ ...sheet('monk'), weapons: ['shortsword'] }).record.attacks);
  assert.deepEqual(rows.map((r) => r.id), ['shortsword', 'unarmed-strike']);
  assert.equal(P.weaponCost(0, 3), 'No Proficiency Bonus on the attack roll: +0 instead of +3 \u00b7 no Weapon Mastery');
  assert.match(P.armourCost(CONTENT.armour['chain-mail'], true), /can.t cast spells/);
  assert.equal(P.armourCost(CONTENT.armour.shield, false), 'No AC bonus without training \u00b7 Disadvantage on Strength and Dexterity rolls');
  assert.match(P.armourCost(CONTENT.armour.shield, true), /can.t cast spells/);
  assert.match(P.armourNoTrainLines(CONTENT.armour['plate-armor'], true)[0], /Disadvantage on every Strength and Dexterity D20 Test.*can.t cast spells/);
  assert.match(P.weaponNoTrainLines()[0], /no Weapon Mastery|no Weapon Mastery property/);
  assert.ok(classOf(sheet('monk')));
});
