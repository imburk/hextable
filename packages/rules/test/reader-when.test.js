// The situations a `when` can name, and what the engine does with each (docs/specs/homebrew.md, Decision 6; #430).
// A `when` tag is judged (true or false) or cannot be (the engine says "cannot tell"). A step it cannot judge is handed to the DM; a modifier it
// cannot judge is skipped without a word. Which tags are judged depends on where they are asked, so this test PLAYS every tag in every place
// through `apply()`, with an invented entry installed directly, and holds the reader's tables (reader.js `JUDGED_*`) and its sentences equal to what
// the engine did. If the engine learns to judge a tag, or stops, this fails until the reading is changed; the reader cannot drift from it again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, SPELLS } from '../src/content/index.js';
import { HOOKS, TAGS } from '../src/content/schema.js';
import { spellProfile } from '../src/effects.js';
import { apply, current } from '../src/engine.js';
import { newGame } from '../src/scenario.js';
import { JUDGED_ADVANTAGE_IF, JUDGED_STEP, JUDGED_STEP_AFTER_ATTACK, readEntry } from '../src/content/reader.js';

const DM = { role: 'dm', userId: 'dm' };

// ---------- a scene ----------
// The wizard (a caster with spare slots), the fighter beside it, a goblin two hexes away, the cleric a long way off. Everyone has Hit Points to spare.
function scene() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== 'party') delete s.entities[id];
  apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM);
  const at = (id, q, r) => apply(s, { type: 'place', actor: id, to: { q, r } }, DM);
  at('wizard', 0, 0); at('fighter', 0, 1); at('cleric', 6, 4); at('rogue', 6, 5);
  Object.assign(s.entities.wizard, { slots: { 1: 9 }, slotsMax: { 1: 9 } });
  const M = s.entities[apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: 2, r: 0 } }, DM).events[0].id];
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return { s, W: s.entities.wizard, F: s.entities.fighter, M };
}
const fight = (s) => assert.ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) apply(s, { type: 'endTurn', actor: current(s) }, DM); assert.equal(current(s), id); };
let n = 0;
// An invented spell, installed where the engine looks spells up (the way durations.test.js does).
function learn(s, who, over) {
  const def = { ...structuredClone(CONTENT.spells['fire-bolt']), id: `hb-when-${++n}`, name: `Probe ${n}`, higher: undefined, level: 1, range: 60, ...over };
  SPELLS[def.id] = spellProfile(def);
  s.entities[who].spells.push(def.id);
  return def;
}
const handed = (r) => r.events.filter((e) => e.type === 'manual' && /cannot judge/.test(e.text));
const spell = (effects, target = { creature: {} }) => ({ target, effects, duration: 'instant', concentration: false, time: 'action' });

// ---------- a step's `when` ----------
function stepPlay(tag, place) {
  const { s, M } = scene();
  const step = { damage: '1d4', type: 'fire', when: [tag] };
  const effects = place === 'top' ? [step] : [{ attack: 'ranged', kind: 'spell', onHit: [step], onMiss: [{ ...step }] }];
  const def = learn(s, 'wizard', spell(effects));
  fight(s); turnOf(s, 'wizard');
  const r = apply(s, { type: 'cast', actor: 'wizard', spell: def.id, target: M.id }, DM);
  assert.ok(r.ok, r.error);
  return handed(r).length > 0;
}

test('a step\'s `when`: the engine judges exactly the tags the reader says, at the top and below an attack', () => {
  for (const tag of TAGS) {
    assert.equal(!stepPlay(tag, 'top'), JUDGED_STEP.includes(tag), `${tag} at the top of a spell`);
    assert.equal(!stepPlay(tag, 'attack'), JUDGED_STEP_AFTER_ATTACK.includes(tag), `${tag} under an attack's hit or miss`);
  }
});

test('a save\'s `advantageIf`: the engine judges exactly the tags the reader says', () => {
  for (const tag of TAGS) {
    const { s, M } = scene();
    const def = learn(s, 'wizard', spell([{ save: 'dex', dc: 10, advantageIf: [tag], onFail: [{ damage: '1d4', type: 'fire' }] }]));
    fight(s); turnOf(s, 'wizard');
    const r = apply(s, { type: 'cast', actor: 'wizard', spell: def.id, target: M.id }, DM);
    assert.ok(r.ok, r.error);
    const told = r.events.some((e) => e.type === 'manual' && /may have Advantage/.test(e.text));
    assert.equal(!told, JUDGED_ADVANTAGE_IF.includes(tag), tag);
  }
});
