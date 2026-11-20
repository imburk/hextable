// Review R3 (#617): a refused action, and one that throws, leave the game byte-identical. A short seeded fuzz: random action shapes
// (well-formed and not) from random creatures and roles, against fresh games with and without a fight. Only 5 % of such actions succeed,
// which is the point: this plays the refusal paths, where an engine once changed the game before it refused. Bounded by a time budget
// (FUZZ_MS, default 4000 ms) and a cap on actions, so CI cannot run long; the sequence is seeded, so a failure is reproduced by the
// action it prints. HEXTABLE_STRESS=full runs 60,000 actions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, ACTION_TYPES, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { SPELLS, MONSTERS } from "../src/content/index.js";

const FIELDS = 'actor slot node item to spell ids target take sheet choice id spare cure targets spend form condition make slots shove order skill shape mode index feet dc at via summon size level who leader kind hex here for entry state pin on object monster key end z set mount minutes how hidden damageType bonus base auto attack amount x value user title option light length from entity action ability which verb uses turn text tags side revealed restore region recover reach radius prompt pos orders name march init hp feature effect dtype dex center caster add'.split(' ');
let seed = 1;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DM = { role: 'dm', userId: 'dm' };
const spells = Object.keys(SPELLS), monsters = Object.keys(MONSTERS);
const CONDS = ['prone', 'poisoned', 'blinded', 'grappled', 'restrained', 'unconscious', 'invisible', 'stunned', 'paralyzed', 'frightened', 'charmed'];
const SKILLS = ['athletics', 'stealth', 'perception', 'arcana'];
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function fresh(k) {
  const s = newGame(100 + k, k % 3 === 0 ? { grid: 'square' } : {});
  const ids = Object.keys(s.entities);
  for (const id of ids.slice(0, 4)) if (s.entities[id].side === 'party') apply(s, { type: 'claim', entity: id, user: pick(['u1', 'u2']), userName: 'P' }, DM);
  for (let i = 0; i < 4; i++) apply(s, { type: 'spawn', monster: pick(['goblin-warrior', 'wolf', 'ogre', 'skeleton', 'bandit', 'giant-spider', 'mage']), at: { q: -6 + Math.floor(rnd() * 5), r: 2 + Math.floor(rnd() * 4) - 2 } }, DM);
  if (rnd() < 0.7) apply(s, { type: 'startEncounter', center: { q: -6, r: 2 }, radius: 8 }, DM);
  return s;
}
function value(s, f) {
  const ents = Object.keys(s.entities), e = s.entities[pick(ents)];
  const pos = () => { const b = e?.pos ?? { q: 0, r: 0 }; return { q: b.q + Math.floor(rnd() * 7) - 3, r: b.r + Math.floor(rnd() * 7) - 3, ...(rnd() < 0.2 ? { z: Math.floor(rnd() * 3) * 5 } : {}) }; };
  const any = () => pick([0, 1, 2, 3, -1, 5, 20, 1e9, 0.5, true, false, null, 'x', '', 'all', {}, [], 'fight', 'rest']);
  switch (f) {
    case 'actor': case 'target': case 'entity': case 'who': case 'leader': case 'mount': case 'caster': case 'on': case 'spare': case 'id': case 'from':
      return rnd() < 0.9 ? pick(ents) : any();
    case 'targets': case 'ids': return rnd() < 0.9 ? Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(ents)) : any();
    case 'to': return rnd() < 0.7 ? pos() : rnd() < 0.5 ? pick(ents) : any();
    case 'at': case 'hex': case 'center': case 'pos': case 'here': return rnd() < 0.9 ? pos() : any();
    case 'spell': { const own = e?.spells ?? []; return rnd() < 0.6 && own.length ? pick(own) : pick(spells); }
    case 'slot': case 'level': return pick([1, 1, 2, 3, 4, 0, 9, 10, -1, '1']);
    case 'attack': { const at = e?.attacks ?? []; return at.length && rnd() < 0.8 ? (pick(at).id ?? pick(at).name) : any(); }
    case 'action': { const ac = e?.actions ?? []; return ac.length && rnd() < 0.8 ? (pick(ac).id ?? pick(ac).name) : any(); }
    case 'item': { const g = e?.gear ?? e?.items ?? []; return Array.isArray(g) && g.length && rnd() < 0.8 ? (pick(g).id ?? pick(g)) : any(); }
    case 'feature': { const fs = Object.keys(e?.features ?? e?.uses ?? {}); return fs.length && rnd() < 0.8 ? pick(fs) : pick(['secondWind', 'rage', 'wildShape', 'channelDivinity', 'x']); }
    case 'monster': return pick(monsters);
    case 'condition': return rnd() < 0.9 ? pick(CONDS) : any();
    case 'skill': return pick(SKILLS); case 'ability': return pick(ABIL);
    case 'hp': case 'amount': case 'feet': case 'dc': case 'minutes': case 'radius': case 'size': case 'bonus': case 'init': case 'dex': case 'value': case 'z':
      return rnd() < 0.8 ? Math.floor(rnd() * 40) - 5 : any();
    case 'key': return pick(['autoEngage', 'sight', 'diceThrow', 'strikeFirst', 'unseenTurns', 'away', 'x']);
    case 'take': return pick([null, 'shield', 'opportunity', 'x']);
    case 'prompt': return s.pending?.n ?? any();
    case 'user': return pick(['u1', 'u2', 'u3']);
    default: return any();
  }
}
const COMMON = ['move', 'attack', 'cast', 'act', 'endTurn', 'dash', 'use', 'feature', 'equip', 'give', 'pass', 'drop', 'pickUp', 'mount', 'dismount', 'hide', 'search', 'check', 'escape', 'levelUp', 'rest', 'shortRest', 'condition', 'setHp', 'harm', 'place', 'react', 'follow', 'formation', 'bond', 'command', 'attune', 'shield', 'editCharacter', 'setSize', 'remove', 'reveal', 'endEffect', 'secondWind', 'stand', 'disengage', 'dodge', 'stepAway', 'stepBack'];

test("fuzz: a refused action, or one that throws, leaves the game byte-identical", () => {
  const MAX = process.env.HEXTABLE_STRESS === "full" ? 60000 : 20000, BUDGET = Number(process.env.FUZZ_MS ?? 4000), t0 = Date.now();
  let refused = 0, okN = 0, thrown = 0, i = 0, s = fresh(0), k = 0;
  const bad = [];
  for (; i < MAX && Date.now() - t0 < BUDGET && bad.length === 0; i++) {
    if (i % 400 === 0) s = fresh(++k);
    const type = rnd() < 0.5 ? pick(COMMON) : pick(ACTION_TYPES);
    if (["loadMap", "mapEdit", "worldIndex", "setPacks"].includes(type)) continue;
    const a = { type }, cur = current(s);
    if (rnd() < 0.85) a.actor = rnd() < 0.6 && cur ? cur : value(s, "actor");
    const n = Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) { const f = pick(FIELDS); if (f !== "type" && f !== "map" && f !== "ops" && f !== "packs") a[f] = value(s, f); }
    if (["attack", "cast", "act", "harm", "mend", "condition", "setHp"].includes(type) && rnd() < 0.8) a.target = value(s, "target");
    if (type === "cast" && rnd() < 0.9) { const c = s.entities[a.actor]; a.spell = c?.spells?.length && rnd() < 0.8 ? pick(c.spells) : pick(spells); if (rnd() < 0.5) a.slot = pick([1, 2, 3]); if (rnd() < 0.5) a.at = value(s, "at"); if (rnd() < 0.4) a.targets = value(s, "targets"); }
    if (type === "attack" && rnd() < 0.9) a.attack = value({ ...s, entities: { x: s.entities[a.actor] ?? {} } }, "attack");
    if (type === "move" && rnd() < 0.9) a.to = value(s, "at");
    const ctx = rnd() < 0.6 ? DM : { role: "player", userId: pick(["u1", "u2"]) };
    const before = JSON.stringify(s);
    let r = null, how = "";
    try { r = apply(s, structuredClone(a), ctx); } catch (err) { thrown++; how = `threw ${String(err.message).slice(0, 100)}`; }
    if (r?.ok) { okN++; continue; }
    if (r) { refused++; how = `refused: ${r.error}`; }
    if (JSON.stringify(s) !== before) { bad.push(`${how} | ${ctx.role} ${JSON.stringify(a).slice(0, 300)}`); }
  }
  assert.deepEqual(bad, [], `a refused or thrown action changed the game (after ${i} actions, seed run ${k})`);
  assert.ok(refused > 500, `the fuzz refused only ${refused} of ${i} actions: it is not playing the refusal paths`);
  console.log(`# fuzz: ${i} actions, ${okN} ok, ${refused} refused, ${thrown} thrown, ${Date.now() - t0} ms`);
});

// The case the review (1a) found by fuzz: a cleric casts a creature-aimed spell at a creature added after the fight began (outside it).
// The cast used to set the Magic-action flag before it refused. Nothing may change, and a later cast on a target in the fight must still work.
test("a cast refused as 'outside the battle' leaves the game and the Magic-action flag as they were", () => {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  const ok = (r) => { assert.ok(r.ok, r.error); return r; };
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  const p = s.entities.cleric.pos;
  const near = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: p.q + 2, r: p.r } }, DM)).events[0].id;
  ok(apply(s, { type: "startEncounter", center: { q: p.q, r: p.r }, radius: 3 }, DM));
  const far = ok(apply(s, { type: "spawn", monster: "skeleton", at: { q: p.q + 6, r: p.r } }, DM)).events[0].id;
  for (let i = 0; i < 30 && current(s) !== "cleric"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const before = JSON.stringify(s);
  const r = apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: far }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /outside the battle/);
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.encounter.flags["magic:cleric"], undefined);
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: near }, DM));
});
