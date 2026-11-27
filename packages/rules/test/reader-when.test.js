// The situations a `when` can name, and what the engine does with each (docs/specs/homebrew.md, Decision 6; #430).
// A `when` tag is judged (true or false) or cannot be (the engine says "cannot tell"). A step it cannot judge is handed to the DM; a modifier it
// cannot judge is skipped without a word. Which tags are judged depends on where they are asked, so this test PLAYS every tag in every place
// through `apply()`, with an invented entry installed directly, and holds the reader's tables (reader.js `JUDGED_*`) and its sentences equal to what
// the engine did. If the engine learns to judge a tag, or stops, this fails until the reading is changed; the reader cannot drift from it again.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { CONTENT, SPELLS } from '../src/content/index.js';
import { HOOKS, TAGS } from '../src/content/schema.js';
import { speedOf } from '../src/modifiers.js';
import { spellProfile } from '../src/effects.js';
import { apply, current } from '../src/engine.js';
import { newGame } from '../src/scenario.js';
import { HOOK_WORDS, JUDGED_ADVANTAGE_IF, JUDGED_ON, JUDGED_SOMETIMES, JUDGED_STEP, JUDGED_STEP_AFTER_ATTACK, NEVER_TRUE, ON_FAIL_JUDGED, SELF_TAG_WORDS, TAG_WORDS, readEntry } from '../src/content/reader.js';

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
  const def = { ...structuredClone(CONTENT.spells['fire-bolt']), id: `hb-when-${++n}`, name: `Probe ${n}`, higher: undefined, roll: undefined, level: 1, range: 60, ...over };
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

// ---------- a modifier's `when` ----------
// The modifier is put on the creature directly (the way a built character's feature is: modifiers.js `sources`), and one roll of its hook is played.
// "Applied" is what the roll shows: the number the modifier adds shows in the event, so a run with the modifier is compared with a run without it.
const BONUS = 7;
const wear = (e, m) => { e.feats = [...(e.feats ?? []), { name: 'Probe', modifiers: [m] }]; };
// The tags a scene can make true, and how, once the fight is on and it is the actor's turn. The attacker is `atk`, the one attacked or acted on `tgt`.
const MAKE = {
  'target.prone': (c) => { c.tgt.cond.prone = {}; },
  'target.unconscious': (c) => { c.tgt.cond.unconscious = {}; },
  'target.fiendOrUndead': (c) => { c.tgt.type = 'fiend'; },
  'attacker.unseen': (c) => { c.tgt.cond.blinded = {}; },              // the target cannot see the attacker
  'target.unseen': (c) => { c.atk.cond.blinded = {}; },                // the attacker cannot see the target
  'attack.advantage': (c) => { c.tgt.cond.prone = {}; },
  'attack.disadvantage': (c) => { c.atk.cond.poisoned = {}; },
  'ally.adjacentToTarget': (c) => c.ally(),
  'target.ally': (c) => { c.tgt.side = c.atk.side; },                  // the target on the attacker's own side (the default scene has them on two)
  // The target held by the attacker (docs/specs/grapple-shove.md, Decision 2), with a range the scene's gaps never pass.
  'target.grappledBySelf': (c) => { c.tgt.cond.grappled = { source: c.atk.id, holds: [{ by: c.atk.id, with: 'hand', escape: 10, range: 60 }] }; },
};
const probes = [
  ...['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => ({ id: `probe-${a}`, name: `Probe ${a}`, target: { creature: { reach: 60 } }, effects: [{ save: a, dc: 10, onFail: [{ damage: '1d4', type: 'fire' }] }] })),
  { id: 'probe-hard', name: 'Probe Hard', target: { creature: { reach: 60 } }, effects: [{ save: 'wis', dc: 22, onFail: [{ damage: '1d4', type: 'fire' }] }] },
  { id: 'probe-hit', name: 'Probe Hit', target: { creature: { reach: 60 } }, effects: [{ damage: '1d4', type: 'fire' }] },
];
// The ways an attack can be made, each of which asks a hook for what it holds: a character's own attack from its sheet (`attack`), a creature's action
// (`act`), a spell attack, and an Opportunity Attack.
export const PATHS = ['sheet', 'steps', 'spell', 'opportunity'];
// Plays one roll of `hook` and returns what shows of the modifier in it. `how`: { path, ranged, gap, abil } for the attack hooks.
function play(hook, tag, withMod, how = {}) {
  const { s, W, F, M } = scene();
  const R = s.entities.rogue;
  apply(s, { type: 'place', actor: M.id, to: { q: how.gap ?? 1, r: 0 } }, DM);
  apply(s, { type: 'place', actor: 'cleric', to: { q: -1, r: 1 } }, DM);
  M.actions.push(...probes);
  M.ac = 1;
  const attackHook = ['attack.roll', 'attack.received', 'damage.dealt'].includes(hook) || hook === 'opportunity';
  const sidesFor = hook === 'opportunity' ? 'opportunity' : hook.startsWith('spell.') ? 'spell' : null;
  const path = how.path ?? 'sheet';
  // Who attacks and who is attacked, in each way an attack can be made; the modifier is on whoever the hook is about.
  const sides = { sheet: [F, M], steps: [M, F], spell: [W, M], opportunity: [F, M] }[sidesFor ?? path];
  const [atk, tgt] = attackHook || sidesFor ? sides : [M, hook === 'concentration' ? s.entities.cleric : F];
  const holder = attackHook || sidesFor ? (hook === 'attack.received' ? tgt : atk) : tgt;
  const actor = atk;
  F.ac = 1;
  // The Opportunity Attack hook asks about nobody but the one who may make it: the tags that name the target are made true on that creature.
  const ctx = { atk: actor, tgt: hook === 'opportunity' ? F : tgt, ally: () => {
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => ({ q: tgt.pos.q + dq, r: tgt.pos.r + dr }));
    for (const to of near) {
      if (actor.side === 'party') { if (apply(s, { type: 'place', actor: 'rogue', to }, DM).ok) return; }
      else { const r = apply(s, { type: 'spawn', monster: 'goblin-warrior', at: to }, DM); if (r.ok) { const g = s.entities[r.events[0].id]; g.hp = g.maxHp = 500; return; } }
    }
    assert.fail('no room for an ally');
  } };
  void R;
  if (tag === 'check.proficient') F.skills = ['perception'];
  if (tag === 'check.unskilled') { F.skills = (F.skills ?? []).filter((k) => k !== 'perception'); if (F.skillBonus) delete F.skillBonus.perception; }   // #732: the check below is Perception
  if (how.abil) F.attacks[0].abil = how.abil;
  const put = () => { if (withMod) wear(holder, { on: hook, op: hook === 'damage.taken' ? 'immune' : hook === 'opportunity' ? 'autoFail' : 'add', ...(hook === 'damage.taken' || hook === 'opportunity' ? {} : { value: how.onFail ? '1d20' : BONUS }), ...(how.onFail ? { onFail: true } : {}), when: [tag] }); };
  const setUp = () => { MAKE[tag]?.(ctx); put(); };
  const bonusOf = (r) => { assert.ok(r.ok, r.error); return r.events.find((e) => e.type === 'attack').bonus; };
  if (hook === 'spell.attack') { fight(s); turnOf(s, 'wizard'); setUp(); return bonusOf(apply(s, { type: 'cast', actor: 'wizard', spell: 'fire-bolt', target: M.id }, DM)); }
  if (hook === 'spell.dc') {
    const def = learn(s, 'wizard', spell([{ save: 'wis', onFail: [{ damage: '1d4', type: 'fire' }] }]));
    fight(s); turnOf(s, 'wizard'); setUp();
    const r = apply(s, { type: 'cast', actor: 'wizard', spell: def.id, target: M.id }, DM); assert.ok(r.ok, r.error);
    return r.events.find((e) => e.type === 'save').dc;
  }
  if (hook === 'opportunity') { fight(s); turnOf(s, M.id); setUp(); const r = apply(s, { type: 'move', actor: M.id, to: { q: 4, r: 0 } }, DM); assert.ok(r.ok, r.error); return r.events.some((e) => e.type === 'attack' && e.actor === 'fighter') ? 'attacked' : 'let go'; }
  if (hook === 'initiative') { MAKE[tag]?.(ctx); put(); const r = apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 10 }, DM); return r.events.find((e) => e.type === 'encounterStart').order.find((o) => o.id === 'fighter').init; }
  if (hook === 'save.death') {
    F.hp = 0; F.cond.unconscious = {}; F.death = { s: 0, f: 0 };
    fight(s); MAKE[tag]?.(ctx); put();
    for (let i = 0; i < 40; i++) { const r = apply(s, { type: 'endTurn', actor: current(s) }, DM); const d = r.events?.find((e) => e.type === 'deathSave'); if (d) return d.bonus; }
    return 'no death save';
  }
  fight(s);
  if (hook === 'speed') { turnOf(s, 'fighter'); setUp(); apply(s, { type: 'endTurn', actor: 'fighter' }, DM); turnOf(s, 'fighter'); return s.encounter.budget.move; }
  if (hook === 'check' && tag === 'check.escape') {
    // A check made to escape a grapple is the `escape` action's: the fighter held by the goblin, escaping on its turn.
    turnOf(s, 'fighter'); setUp(); F.cond.grappled = { source: M.id, holds: [{ by: M.id, with: 'probe-hit', escape: 10, range: 60 }] };
    const r = apply(s, { type: 'escape', actor: 'fighter', skill: 'athletics' }, DM); return r.ok ? r.events.find((e) => e.type === 'check').bonus : `refused: ${r.error}`;
  }
  if (hook === 'check') { turnOf(s, 'fighter'); setUp(); const r = apply(s, { type: 'check', actor: 'fighter', skill: 'perception' }, DM); return r.ok ? r.events.find((e) => e.type === 'check').bonus : `refused: ${r.error}`; }
  if (hook === 'concentration') {
    turnOf(s, 'cleric');
    const r0 = apply(s, { type: 'cast', actor: 'cleric', spell: 'shield-of-faith', target: 'cleric' }, DM); assert.ok(r0.ok, r0.error);
    turnOf(s, M.id); setUp();
    const r = apply(s, { type: 'act', actor: M.id, action: 'probe-hit', target: 'cleric' }, DM);
    if (!r.ok) return `refused: ${r.error}`;
    return r.events.find((e) => e.type === 'concentration')?.bonus ?? 'no concentration save';
  }
  if (attackHook) {
    if (path === 'sheet') { turnOf(s, 'fighter'); setUp(); const r = apply(s, { type: 'attack', actor: 'fighter', target: M.id, attack: how.ranged ? 'javelin-thrown' : 'longsword' }, DM);
      return hook === 'damage.dealt' ? (assert.ok(r.ok, r.error), r.events.find((e) => e.type === 'damage')?.amount) : bonusOf(r); }
    if (path === 'steps') {
      turnOf(s, M.id); setUp();
      const r = apply(s, { type: 'act', actor: M.id, action: how.ranged ? 'shortbow' : 'scimitar', target: 'fighter' }, DM);
      return hook === 'damage.dealt' ? (assert.ok(r.ok, r.error), r.events.find((e) => e.type === 'damage')?.amount) : bonusOf(r);
    }
    if (path === 'spell') {
      turnOf(s, 'wizard'); setUp(); const r = apply(s, { type: 'cast', actor: 'wizard', spell: 'fire-bolt', target: M.id }, DM);
      return hook === 'damage.dealt' ? (assert.ok(r.ok, r.error), r.events.find((e) => e.type === 'damage')?.amount) : bonusOf(r);
    }
    if (path === 'opportunity') {
      turnOf(s, M.id); setUp(); const r = apply(s, { type: 'move', actor: M.id, to: { q: 4, r: 0 } }, DM);
      assert.ok(r.ok, r.error);
      const ev = r.events.find((e) => e.type === 'attack' && e.actor === 'fighter');
      return hook === 'damage.dealt' ? r.events.find((e) => e.type === 'damage' && e.by === 'fighter')?.amount : ev?.bonus;
    }
  }
  // The rest are rolls made against or by `holder`, with the goblin acting on it.
  turnOf(s, M.id); setUp();
  const act = hook === 'ac' ? { action: how.ranged ? 'shortbow' : 'scimitar' } : hook === 'damage.taken' ? { action: 'probe-hit' } : { action: `probe-${hook.startsWith('save.') ? hook.slice(5) : 'wis'}` };
  const r = apply(s, { type: 'act', actor: M.id, target: holder.id, ...act }, DM);
  if (!r.ok) return `refused: ${r.error}`;
  if (hook === 'ac') return r.events.find((e) => e.type === 'attack').ac;
  if (hook === 'damage.taken') return r.events.find((e) => e.type === 'damage')?.amount ?? 'none';
  return r.events.find((e) => e.type === 'save').bonus;
}

// The hooks `play` drives through `apply()`: one roll of each, a goblin or a character acting.
const PLAYED = ['attack.roll', 'attack.received', 'damage.dealt', 'ac', 'save', 'save.wis', 'check', 'damage.taken', 'speed', 'initiative', 'concentration', 'save.death',
  'spell.attack', 'spell.dc', 'opportunity'];
const ATTACK_HOOKS = ['attack.roll', 'attack.received', 'damage.dealt'];
// How each tag is made true: the ways an attack is made that give it a chance to hold. A tag that holds in none can never take effect.
function combos(tag, hook) {
  if (hook === 'ac') return [{ path: 'steps', ranged: ['ranged', 'beyond5', 'long.range'].includes(tag), gap: tag === 'beyond5' ? 6 : tag === 'long.range' ? 7 : tag === 'ranged' ? 3 : 1 }];
  if (!ATTACK_HOOKS.includes(hook)) return [{}];
  if (tag === 'ranged') return [{ path: 'sheet', ranged: true, gap: 3 }, { path: 'steps', ranged: true }];
  if (tag === 'beyond5') return [{ path: 'sheet', ranged: true, gap: 6 }];
  if (tag === 'long.range') return [{ path: 'sheet', ranged: true, gap: 7 }];
  if (tag === 'attack.str') return [{ path: 'sheet', abil: 'str' }, { path: 'steps' }];
  if (tag === 'attack.spell' || tag === 'spell.cantrip') return [{ path: 'spell', gap: 3 }];
  if (tag === 'attack.opportunity') return [{ path: 'opportunity' }];
  return [{ path: 'sheet' }, { path: 'steps' }];
}
const shows = (hook, tag, how) => {
  const a = play(hook, tag, false, how), b = play(hook, tag, true, how);
  assert.ok(a !== undefined && !String(a).startsWith('refused') && a !== 'none', `${hook} ${tag}: the roll was played (${a})`);
  return a !== b;
};

test('a modifier\'s `when`: at each hook the engine applies exactly the tags the reader says (played through apply)', () => {
  for (const hook of PLAYED) {
    for (const tag of TAGS) {
      const applied = combos(tag, hook).map((how) => shows(hook, tag, how));
      const judged = [...(JUDGED_ON[hook] ?? []), ...(JUDGED_SOMETIMES[hook] ?? [])].includes(tag) && !(NEVER_TRUE[hook] ?? []).includes(tag);
      assert.equal(applied.some(Boolean), judged, `${hook} with ${tag}: the engine ${applied.some(Boolean) ? 'applied' : 'did not apply'} it, the reader says ${judged ? 'it can' : 'it never will'}`);
    }
  }
});

test('some tags are judged only for a character\'s own attack: the sheet\'s attack applies them, a creature\'s action does not', () => {
  for (const [hook, tags] of Object.entries(JUDGED_SOMETIMES)) {
    for (const tag of tags) {
      const [sheet, steps] = [{ path: 'sheet', ranged: tag === 'ranged', gap: tag === 'ranged' ? 3 : 1, abil: tag === 'attack.str' ? 'str' : undefined }, { path: 'steps', ranged: tag === 'ranged' }];
      assert.equal(shows(hook, tag, sheet), true, `${hook} ${tag} on a character's attack`);
      assert.equal(shows(hook, tag, steps), false, `${hook} ${tag} on a creature's action`);
    }
  }
});

test('the other hooks: the Fly Speed, a roll that failed, the Hit Point maximum, and the two nothing reads', () => {
  // `speed.fly` asks with nothing but the creature itself (modifiers.js speedOf): only `self.notIncapacitated` can be judged.
  for (const tag of TAGS) {
    const speeds = [false, true].map((withMod) => { const { s, F } = scene(); F.speeds = { fly: 30 }; if (withMod) wear(F, { on: 'speed.fly', op: 'set', value: 60, when: [tag] }); return speedOf(s, F, 'fly'); });
    assert.equal(speeds[0] !== speeds[1], JUDGED_ON['speed.fly'].includes(tag), `speed.fly with ${tag}`);
  }
  // A modifier that adds dice only to a roll that failed is asked again once the roll has failed, with the creature alone: only ON_FAIL_JUDGED can hold.
  // Played on a saving throw (every tag can be made true there) and on an attack roll (an Unconscious creature cannot attack, so that one is left out).
  for (const tag of TAGS) {
    const save = (withMod) => {
      const { s, F, M } = scene();
      M.actions.push(...probes);
      if (withMod) wear(F, { on: 'save', op: 'add', value: '1d20', onFail: true, when: [tag] });
      fight(s); turnOf(s, M.id);
      MAKE[tag]?.({ atk: M, tgt: F, ally: () => {} });
      const r = apply(s, { type: 'act', actor: M.id, action: 'probe-hard', target: 'fighter' }, DM);
      assert.ok(r.ok, r.error);
      const v = r.events.find((e) => e.type === 'save');
      assert.ok(v.rescued || (!v.success && v.total >= 2), `the save must fail where a die could turn it (${v.total})`);
      return !!v.rescued;
    };
    assert.equal(save(true), ON_FAIL_JUDGED.includes(tag), `a failed saving throw lifted with ${tag}`);
    if (tag === 'target.unconscious') continue;
    const attack = (withMod) => {
      const { s, F, M } = scene();
      apply(s, { type: 'place', actor: M.id, to: { q: 1, r: 0 } }, DM); M.ac = 25;
      if (withMod) wear(F, { on: 'attack.roll', op: 'add', value: '1d20', onFail: true, when: [tag] });
      fight(s); turnOf(s, 'fighter');
      if (tag === 'target.prone') F.cond.prone = {};
      if (tag === 'target.fiendOrUndead') F.type = 'fiend';
      const r = apply(s, { type: 'attack', actor: 'fighter', target: M.id, attack: 'longsword' }, DM);
      assert.ok(r.ok, r.error);
      const a = r.events.find((e) => e.type === 'attack');
      assert.ok(a.rescued || (a.nat > 1 && a.nat < 20 && !a.hit), `the roll must be a plain miss (${a.nat})`);
      return !!a.rescued;
    };
    assert.equal(attack(true), ON_FAIL_JUDGED.includes(tag) && JUDGED_ON['attack.roll'].includes(tag), `a failed attack roll lifted with ${tag}`);
  }
  // `hp.max`: the Hit Point maximum changes when the modifier is put on, whatever its `when` says. `carry`: nothing asks for it.
  { const { s, W, M } = scene();
    const def = learn(s, 'wizard', spell([{ modifier: { on: 'hp.max', op: 'add', value: 5, when: ['target.prone'] }, ends: { on: 'turnEnd' } }]));
    def.duration = '1 minute'; SPELLS[def.id] = spellProfile({ ...def, duration: '1 minute' });
    fight(s); turnOf(s, 'wizard'); const before = M.maxHp;
    const r = apply(s, { type: 'cast', actor: 'wizard', spell: def.id, target: M.id }, DM);
    assert.ok(r.ok, r.error); assert.equal(M.maxHp, before + 5, 'the target is not Prone, and its maximum still rose'); void W; }
  for (const f of ['engine/rolls.js', 'engine/resolve.js', 'engine/features.js', 'engine/world.js', 'engine/movement.js', 'engine/shared.js', 'modifiers.js', 'effects.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /modifiers\([^)]*'carry'/, `${f} asks nobody for carrying capacity`);
    assert.doesNotMatch(src, /modifiers\([^)]*'hp\.max'/, `${f} asks nobody for a Hit Point maximum`);
  }
  // `d20` is asked in one place, with the creature alone, only for the dice an `onFail` modifier adds (read from the code: no apply() rolls it alone).
  assert.match(readFileSync(new URL('../src/engine/rolls.js', import.meta.url), 'utf8'), /modifiers\(s, t, 'd20', \{ target: t \}, ''\)\.rescue/);
});

test('every hook is in the reader\'s table, and every tag in each place is either judged or said not to be', () => {
  assert.deepEqual(Object.keys(JUDGED_ON).sort(), [...HOOKS].sort());
  for (const [hook, tags] of Object.entries(JUDGED_ON)) for (const t of tags) assert.ok(TAGS.includes(t), `${hook}: ${t}`);
  for (const t of Object.keys(SELF_TAG_WORDS)) assert.ok(TAGS.includes(t));
  assert.deepEqual(JUDGED_STEP.filter((t) => !TAGS.includes(t)), []);
});

// ---------- what the reading says ----------
const SPELL = { id: 'hb-when-read', name: 'Reading Probe', source: 'homebrew:when', level: 2, school: 'abjuration', classes: ['wizard'], time: 'action', range: 30, components: ['v', 's'],
  duration: '1 minute', concentration: false, ritual: false, tier: 'auto', checked: false, text: 'Invented for the reader tests.', target: { creature: {} } };
const readSpell = (effects) => readEntry('spell', { ...SPELL, effects });
const has = (r, re) => r.lines.some((l) => re.test(l));

test('a step\'s reading says whether the engine can tell each tag, and is consistent with the tier and the DM\'s list', () => {
  for (const tag of TAGS) for (const place of ['top', 'attack']) {
    const step = { damage: '1d4', type: 'fire', when: [tag] };
    const r = readSpell(place === 'top' ? [step] : [{ attack: 'ranged', kind: 'spell', onHit: [step] }]);
    const judged = (place === 'top' ? JUDGED_STEP : JUDGED_STEP_AFTER_ATTACK).includes(tag);
    assert.equal(has(r, /The engine cannot tell whether/), !judged, `${tag} ${place}: ${r.lines.join(' / ')}`);
    assert.equal(r.doesNot.some((l) => /^Deciding whether/.test(l)), !judged, `${tag} ${place}: handed to the DM`);
    assert.equal(r.tier, 'auto');
    assert.equal(has(r, /^Tier: auto, but the engine hands the parts listed for the DM to the DM/), !judged, `${tag} ${place}: the tier sentence`);
    assert.equal(has(r, /^Tier: auto\. The engine rolls and applies all of this/), judged, `${tag} ${place}: the tier sentence`);
  }
});

test('a modifier\'s reading says "the engine never applies this" for exactly the tags that cannot take effect at its hook', () => {
  for (const hook of HOOKS.filter((h) => !['hp.max', 'carry'].includes(h))) for (const tag of TAGS) {
    const r = readSpell([{ modifier: { on: hook, op: 'add', value: 1, when: [tag] }, ends: { on: 'turnEnd' } }]);
    const dead = !(JUDGED_ON[hook].includes(tag)) || (NEVER_TRUE[hook] ?? []).includes(tag);
    assert.equal(has(r, /The engine never applies this/), dead, `${hook} ${tag}: ${r.lines.join(' / ')}`);
    assert.equal(has(r, /^Tier: auto, but the engine never applies the parts said above never to take effect/), dead, `${hook} ${tag}: the tier sentence`);
    if (!dead) assert.equal(has(r, /^Tier: auto\. The engine rolls and applies all of this/) || has(r, /only for (a character's attack|the damage of an attack a character makes)/), true, `${hook} ${tag}`);
  }
});

