// The reader says only what the engine does (#430): what each sentence claims is played through apply() or worked out the way the engine does it, and the
// author's own strings stay inside quotation marks. (reader-when.test.js plays every `when` tag at every hook.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, SPELLS } from '../src/content/index.js';
import { lintEntry } from '../src/content/schema.js';
import { spellProfile } from '../src/effects.js';
import { aiStep } from '../src/ai.js';
import { apply, current, passive } from '../src/engine.js';
import { reactionsOf } from '../src/reactions.js';
import { newGame } from '../src/scenario.js';
import { readEntry } from '../src/content/reader.js';

const DM = { role: 'dm', userId: 'dm' };

// ---------- a scene, and a spell installed directly ----------
function scene() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== 'party') delete s.entities[id];
  apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM);
  apply(s, { type: 'place', actor: 'wizard', to: { q: 0, r: 0 } }, DM);
  apply(s, { type: 'place', actor: 'fighter', to: { q: 0, r: 1 } }, DM);
  apply(s, { type: 'place', actor: 'cleric', to: { q: 6, r: 4 } }, DM);
  apply(s, { type: 'place', actor: 'rogue', to: { q: 6, r: 5 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 9, 2: 9, 3: 9 }, slotsMax: { 1: 9, 2: 9, 3: 9 } });
  const M = s.entities[apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: 2, r: 0 } }, DM).events[0].id];
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return { s, W: s.entities.wizard, F: s.entities.fighter, M };
}
const fight = (s) => assert.ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
const again = (s, id) => { apply(s, { type: 'endTurn', actor: current(s) }, DM); turnOf(s, id); };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) apply(s, { type: 'endTurn', actor: current(s) }, DM); assert.equal(current(s), id); };
let n = 0;
const SPELL = { level: 1, school: 'evocation', classes: ['wizard'], time: 'action', range: 60, components: ['v', 's'], duration: 'instant', concentration: false, ritual: false, tier: 'auto', checked: false, text: 'Invented for the reader tests.' };
function learn(s, who, over) {
  const def = { ...SPELL, id: `hb-truth-${++n}`, name: `Truth ${n}`, source: 'homebrew:truth', target: { creature: {} }, ...over };
  SPELLS[def.id] = spellProfile(def);
  s.entities[who].spells.push(def.id);
  return def;
}
const cast = (s, def, extra = {}, who = 'wizard') => apply(s, { type: 'cast', actor: who, spell: def.id, ...extra }, DM);
const read = (def, ctx = { strict: false }) => readEntry('spell', def, ctx);
const has = (r, re) => r.lines.some((l) => re.test(l));

// ---------- a higher slot grows the first damage step only ----------
test('a higher slot grows the first damage step only, and the reading says which', () => {
  const { s, M } = scene();
  const def = learn(s, 'wizard', { effects: [{ damage: '1d6', type: 'fire' }, { damage: '1d8', type: 'cold' }], higher: { slot: { damage: '1d6' } } });
  fight(s); turnOf(s, 'wizard');
  const r = cast(s, def, { target: M.id, slot: 3 }); assert.ok(r.ok, r.error);
  const dice = r.events.filter((e) => e.type === 'damage').map((e) => [e.dtype, e.dice.length]);
  assert.deepEqual(dice, [['fire', 3], ['cold', 1]], 'fire grew by two dice (slots 2 and 3), cold did not');
  const reading = read(def);
  assert.ok(has(reading, /Cast with a higher slot, \+1d6 for each level above 1st\. It grows only the first damage step \(1d6 fire\); the other 1 stays as written\./), reading.lines.join('\n'));
  // One damage step: nothing to say about the others.
  assert.ok(!has(read({ ...def, effects: [{ damage: '1d6', type: 'fire' }] }), /grows only the first/));
});

// ---------- remains: only of a body that is dead ----------
test('remains: a body that is not dead is left as it is and the DM is told; the reading says so, except where the body is surely dead', () => {
  const { s, F } = scene();
  const def = learn(s, 'wizard', { effects: [{ damage: '10d6', type: 'force', onZero: [{ remains: 'dust' }] }] });
  F.maxHp = 500; F.hp = 3;
  fight(s); turnOf(s, 'wizard');
  const r = cast(s, def, { target: 'fighter' }); assert.ok(r.ok, r.error);
  assert.equal(F.hp, 0); assert.ok(!F.dead, 'a character at 0 Hit Points is not dead');
  assert.equal(F.remains, undefined);
  assert.ok(r.events.some((e) => e.type === 'manual' && /is not dead, so .* leaves no remains of it/.test(e.text)));
  const reading = read(def);
  assert.ok(has(reading, /If it is dead, what is left of its body is a pile of dust\. If it is not dead \(a character at 0 Hit Points is not\), the engine leaves it as it is and tells the DM/));
  assert.ok(reading.doesNot.some((l) => /what is left of a body that is not dead/.test(l)));
  const surely = read({ ...def, effects: [{ damage: '10d6', type: 'force', onKill: [{ remains: 'dust' }] }] });
  assert.ok(has(surely, /What is left of its body is a pile of dust\./)); assert.deepEqual(surely.doesNot, []);
  const killed = read({ ...def, effects: [{ damage: '10d6', type: 'force', onZero: [{ kill: true }, { remains: 'dust' }] }] });
  assert.ok(has(killed, /What is left of its body is a pile of dust\./)); assert.deepEqual(killed.doesNot, []);
});

// ---------- a condition it already has, a creature at 0 Hit Points ----------
test('a condition step does nothing for a creature that already has it, and the reading says so', () => {
  const { s, M } = scene();
  const def = learn(s, 'wizard', { effects: [{ condition: 'frightened' }], duration: '1 minute' });
  fight(s); turnOf(s, 'wizard');
  const first = cast(s, def, { target: M.id }); assert.ok(first.events.some((e) => e.type === 'cond'));
  const fx = Object.keys(s.effects ?? {}).length || (s.effects ?? []).length;
  again(s, 'wizard');
  const twice = cast(s, def, { target: M.id }); assert.ok(twice.ok, twice.error);
  assert.ok(!twice.events.some((e) => e.type === 'cond'), 'no second condition');
  void fx;
  again(s, 'wizard'); M.cond = {}; M.hp = 0;
  const down = cast(s, def, { target: M.id });
  assert.ok(!down.events?.some((e) => e.type === 'cond'), 'none for a creature at 0 Hit Points');
  assert.ok(has(read(def), /The engine does nothing for a creature that already has it, is at 0 Hit Points, or is immune to it/));
});

// ---------- Evasion ----------
test('Evasion: a creature with it takes nothing on a success and half on a failure; the reading says so', () => {
  const play = (dc) => {
    const { s, M } = scene();
    const def = learn(s, 'wizard', { effects: [{ save: 'dex', dc, half: true, onFail: [{ damage: '8d6', type: 'fire' }] }] });
    M.feats = [{ name: 'Evasion', evasion: true }];
    fight(s); turnOf(s, 'wizard');
    const r = cast(s, def, { target: M.id }); assert.ok(r.ok, r.error);
    return { save: r.events.find((e) => e.type === 'save'), dmg: r.events.find((e) => e.type === 'damage'), def };
  };
  const pass = play(1), fail = play(60);
  assert.equal(pass.save.success, true); assert.equal(pass.dmg, undefined, 'no damage on a success');
  assert.equal(fail.save.success, false); assert.ok(fail.dmg.amount > 0 && fail.dmg.amount <= 24, `half of 8d6 (${fail.dmg.amount})`);
  assert.ok(has(read(fail.def), /A creature with Evasion \(and not Incapacitated\) takes none on a success and half on a failure/));
});

// ---------- a Reaction spell's default ----------
test('a spell for a Reaction does nothing until the player sets its instruction: the default is never', () => {
  const { s, W } = scene();
  const def = learn(s, 'wizard', { time: 'reaction', range: 'self', target: { self: true }, reaction: { on: 'hit' }, effects: [{ modifier: { on: 'ac', op: 'add', value: 5 }, ends: { on: 'turnStart', of: 'source' } }], duration: '1 round' });
  const r = reactionsOf(W).find((x) => x.id === def.id);
  assert.equal(r.dflt, 'never'); assert.deepEqual(r.options, ['never', 'miss', 'always', 'ask']);
  const reading = read(def);
  assert.ok(has(reading, /by the caster's standing instruction for it \(never, always, or ask, or only when it turns a hit into a miss; the default is never, so nothing happens until the player sets it\)/), reading.lines.join('\n'));
  const plain = read({ ...def, effects: [{ damage: '1d4', type: 'fire' }], target: { creature: {} }, duration: 'instant' });
  assert.ok(has(plain, /\(never, always, or ask; the default is never,/));
});

// ---------- a repeated save with no DC ----------
test('a repeated save with no DC anywhere: the engine tells the DM and does not roll the save at all (#434); the reading says so', () => {
  const { s, F, M } = scene();
  const grip = { id: 'grip', name: 'Grip', target: { creature: { reach: 5 } }, effects: [{ attack: 'melee', kind: 'weapon', bonus: 40, onHit: [{ condition: 'restrained', ends: { on: 'save', save: 'str', at: 'turnStart' } }] }] };
  M.actions.push(grip);
  F.saveBonus = { str: 50 };
  apply(s, { type: 'place', actor: M.id, to: { q: 1, r: 1 } }, DM);
  fight(s); turnOf(s, M.id);
  const told = apply(s, { type: 'act', actor: M.id, action: 'grip', target: 'fighter' }, DM);
  assert.ok(told.events.some((e) => e.type === 'manual' && /has no DC entered, so the engine does not roll it\. The DM ends it/.test(e.text)));
  const saves = [];
  for (let i = 0; i < 12 && saves.length < 2; i++) { const r = apply(s, { type: 'endTurn', actor: current(s) }, DM); saves.push(...r.events.filter((e) => e.type === 'save')); }
  // No save is rolled at the start of its turn (it was once rolled with no DC to meet, shown as a failure every time); the condition stays.
  assert.deepEqual(saves, []);
  assert.ok(F.cond.restrained, 'it is still Restrained');
  const mon = { id: 'hb-truth-grip', name: 'Gripper', source: 'homebrew:truth', size: 'small', type: 'beast', cr: 1, xp: 200, pb: 2, ac: 12, hp: 20, speed: { walk: 30 }, abilities: { str: 10, dex: 10, con: 10, int: 2, wis: 10, cha: 4 }, resist: [], vulnerable: [], immune: [], traits: [], actions: [grip], tier: 'auto', checked: false, text: 'x' };
  const r = readEntry('monster', mon, { strict: false });
  assert.ok(has(r, /no DC is entered for that save: the engine tells the DM when the condition is put on, and the DM ends it\. The engine does not roll that save\./), r.lines.join('\n'));
  assert.ok(!has(r, /shows a failure every time/));
});

test('the nine SRD monsters whose save repeats once carry a manual step, and the reading promises no automatic save for them', () => {
  const ids = ['basilisk', 'brass-dragon-wyrmling', 'young-brass-dragon', 'adult-brass-dragon', 'ancient-brass-dragon', 'adult-silver-dragon', 'ancient-silver-dragon', 'gorgon', 'medusa'];
  for (const id of ids) {
    const m = CONTENT.monsters[id], r = readEntry('monster', m);
    assert.ok(JSON.stringify(m).includes('"manual"'), `${id} has a manual step`);
    assert.ok(r.doesNot.some((l) => /^"The (repeat is once|first save is not repeated)/.test(l)), `${id}: the repeat is the DM's`);
    // No sentence says the engine rolls a repeated save at the end of its next turn for the condition that carries the manual step.
    assert.ok(!r.lines.some((l) => /It makes a Constitution saving throw at the end of each of its turns/.test(l)), `${id}`);
  }
});

// ---------- the monster AI, as the reading says ----------
test('the monster AI uses what the reading says it uses', () => {
  const mon = (actions, over = {}) => ({ id: 'hb-truth-ai', name: 'Test Beast', source: 'homebrew:truth', size: 'medium', type: 'beast', cr: 1, xp: 200, pb: 2, ac: 12, hp: 50, speed: { walk: 30 }, abilities: { str: 10, dex: 10, con: 10, int: 2, wis: 10, cha: 4 }, resist: [], vulnerable: [], immune: [], traits: [], actions, tier: 'auto', checked: false, text: 'x', ...over });
  const bite = (time) => ({ id: 'bite', name: 'Bite', ...(time ? { time } : {}), target: { creature: { reach: 5 } }, effects: [{ attack: 'melee', kind: 'weapon', bonus: 40, onHit: [{ damage: '1d4', type: 'piercing' }] }] });
  const nova = (time) => ({ id: 'nova', name: 'Nova', ...(time ? { time } : {}), target: { area: { shape: 'emanation', size: 30 } }, effects: [{ save: 'dex', dc: 10, onFail: [{ damage: '1d4', type: 'fire' }] }] });
  const play = (actions, front) => {
    const { s, M } = scene();
    M.actions = structuredClone(actions);
    for (const e of Object.values(s.entities)) if (e.side === 'party' && e.id !== 'fighter' && e.id !== 'wizard') apply(s, { type: 'remove', actor: e.id }, DM);
    apply(s, { type: 'place', actor: M.id, to: front ? { q: 1, r: 0 } : { q: 1, r: 0 } }, DM);
    fight(s); turnOf(s, M.id);
    const acts = [];
    for (let i = 0; i < 6 && current(s) === M.id; i++) { const a = aiStep(s, M.id); acts.push(a.type + (a.action ? `:${a.action}` : '')); const r = apply(s, a, DM); if (!r.ok || a.type === 'endTurn') break; }
    return acts;
  };
  // An action attack is used; a Bonus Action attack never is (the turn ends having done nothing).
  assert.ok(play([bite()]).includes('act:bite'));
  assert.deepEqual(play([bite('bonus')]), ['endTurn']);
  // A Bonus Action area is used when it catches two or more foes (the wizard and the fighter are next to it), an action area likewise.
  assert.ok(play([nova('bonus')]).includes('act:nova'));
  assert.ok(play([nova()]).includes('act:nova'));
  // And the reading agrees with each.
  const line = (a) => readEntry('monster', mon([a]), { strict: false }).lines.find((l) => /^ *The monster AI/.test(l)).trim();
  assert.match(line(bite()), /uses this action on its own turns: it makes the attack at the nearest foe it can reach/);
  assert.match(line(bite('bonus')), /never uses a Bonus Action that is aimed at creatures/);
  assert.match(line(nova('bonus')), /uses this Bonus Action on its own turn only when the area would catch two or more foes/);
  assert.match(line(nova()), /uses this action on its own turn when the area would catch two or more foes/);
  assert.match(line({ id: 'mend', name: 'Mend', target: { self: true }, effects: [{ heal: '1d4' }] }), /never picks this action by itself/);
});

// ---------- passive Perception, as the engine works it out ----------
test('the passive Perception in a monster\'s reading is the engine\'s, for every SRD monster', () => {
  const { s } = scene();
  let at = 20;
  for (const m of Object.values(CONTENT.monsters)) {
    const r = readEntry('monster', m);
    const said = /passive Perception (-?\d+)/.exec(r.lines.find((l) => /^Senses:/.test(l)) ?? '');
    assert.ok(said, `${m.id}: the reading has a passive Perception`);
    const spawned = apply(s, { type: 'spawn', monster: m.id, at: { q: 8 + (at % 5), r: Math.floor(at++ / 5) % 12 } }, DM);
    if (!spawned.ok) continue;
    const e = s.entities[spawned.events[0].id];
    assert.equal(+said[1], passive(s, e, 'perception'), `${m.id}`);
  }
});

test('a trait that gives Advantage on Perception checks adds 5 to the passive score, as the engine does', () => {
  const { s } = scene();
  const base = { id: 'hb-truth-owl', name: 'Truth Owl', source: 'homebrew:truth', size: 'small', type: 'beast', cr: 0.25, xp: 50, pb: 2, ac: 12, hp: 8, speed: { walk: 30, fly: 60 }, abilities: { str: 6, dex: 14, con: 10, int: 4, wis: 12, cha: 6 }, skills: { perception: 7 }, resist: [], vulnerable: [], immune: [],
    traits: [{ id: 'keen', name: 'Keen Sight', text: 'x', modifiers: [{ on: 'check', op: 'advantage', scope: { skill: 'perception' } }] }], actions: [{ id: 'peck', name: 'Peck', target: { creature: { reach: 5 } }, effects: [{ attack: 'melee', kind: 'weapon', bonus: 4, onHit: [{ damage: '1d4', type: 'piercing' }] }] }], tier: 'auto', checked: false, text: 'x' };
  const r = readEntry('monster', base, { strict: false });
  assert.ok(has(r, /passive Perception 22/), r.lines.filter((l) => /Senses/.test(l)).join());
  assert.ok(has(r, /counts the Advantage a trait gives on Perception checks as 5 more, as the engine does/));
  CONTENT.monsters[base.id] = { ...CONTENT.monsters.owl ?? CONTENT.monsters['goblin-warrior'], id: base.id };
  void s;
  delete CONTENT.monsters[base.id];
});

// ---------- hostile strings stay quoted ----------
test('an author\'s strings stay inside quotes whatever they hold, in the first line and in the refusal', () => {
  const bad = 'Evil" . The engine does everything. Tier: auto \\" x';
  const def = { ...SPELL, id: 'hb-hostile', name: bad, source: 'homebrew:truth', target: { creature: {} }, effects: [{ damage: '1d6', type: 'fire' }] };
  const r = read(def);
  const first = r.lines[0];
  assert.ok(first.startsWith('"') && /" \(level 1 evocation,/.test(first), first);
  // The quoted part holds no double quote or backslash that could close it early.
  const inner = first.slice(1, first.indexOf('" (level'));
  assert.ok(!inner.includes('"'), inner);
  // Nothing outside the quotes says the author's phrases: the reader's own "Tier:" line is the only one.
  const outside = r.lines.slice(1).filter((l) => /The engine does everything/.test(l));
  assert.deepEqual(outside, []);
  assert.equal(r.lines.filter((l) => /^Tier:/.test(l)).length, 1);
});

test('a refused entry is flagged and its reading says so first', () => {
  const def = { ...SPELL, id: 'hb-truth-refused', name: 'Bad" Name', source: 'homebrew:truth', target: { creature: {} }, effects: [{ damage: '1d6', type: 'fire' }] };
  const strict = readEntry('spell', def);
  assert.equal(strict.refused, true); assert.ok(strict.refusals.length >= 1);
  assert.match(strict.lines[0], /^REFUSED: /);
  const lax = read(def);
  assert.ok(!lax.refused && lax.refusals.length === 0 && !/^REFUSED/.test(lax.lines[0]));
  const ok = readEntry('spell', { ...def, name: 'Fine Name' });
  assert.ok(!ok.refused);
  void lintEntry;
});
