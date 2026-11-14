// Fighter features at levels 7 to 15 (SRD 5.2.1) and the engine parts they use: a failed save
// rolled again for a use (Indomitable, by standing instruction), a modifier a missed attack gives
// against its target (Studied Attacks), three attacks with the Attack action, a second Fighting
// Style and a Critical Hit on 18 to 20.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { modifiers } from "../src/modifiers.js";
import { lintRecord } from "../src/content/schema.js";
import { reactionsOf } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const fighter = (level, more = {}) => ({ name: "Fi", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense", ...(level >= 7 ? { "additional-fighting-style": "archery" } : {}) }, armour: "chain-mail", weapons: ["longsword", "longbow"], ...more });
const feat = (level, id) => derive(fighter(level)).record.feats.find((f) => f.id === id);
const barb = { name: "Vor", class: "barbarian", level: 14, subclass: "berserker", abilities: { str: 20, dex: 12, con: 14, int: 8, wis: 10, cha: 8 }, skills: ["athletics", "survival", "perception"], weapons: ["greataxe"] };

function field(level, { foeAc = null } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "rogue") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -4, r: 0 } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  s.foe2 = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 1 } }, DM)).events[0].id;
  for (const id of [s.foe, s.foe2]) { s.entities[id].hp = s.entities[id].maxHp = 500; if (foeAc !== null) s.entities[id].ac = foeAc; }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s, target, attack = "longsword") => apply(s, { type: "attack", actor: "hero", target, attack }, DM);

// An enemy barbarian who makes the fighter save: Intimidating Presence, Wisdom DC 8 + 5 + 5 = 18.
function frightener(level) {
  const s = field(level);
  s.entities.vor = makeEntity(derive(barb).record, { id: "vor", kind: "npc", side: "foe", pos: { q: -1, r: 0, z: 0 } });
  fight(s); turnOf(s, "vor");
  return s;
}
const scare = (s) => apply(s, { type: "feature", actor: "vor", feature: "intimidating-presence", targets: ["hero"] }, DM);

test("the fighter's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  const at = (l) => derive(fighter(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["additional-fighting-style", 7], ["indomitable", 9], ["tactical-master", 9], ["heroic-warrior", 10], ["two-extra-attacks", 11], ["studied-attacks", 13], ["superior-critical", 15]]) {
    assert.ok(!at(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(at(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(fighter(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(fighter(l)).record), [], `record ${l}`); }
  assert.deepEqual(feat(9, "indomitable").reroll, { cost: "indomitable", add: 9 }, "a bonus equal to the Fighter level");
  assert.equal(feat(12, "indomitable").uses.max, 1);
  assert.equal(feat(13, "indomitable").uses.max, 2);
  assert.equal(feat(17, "indomitable").uses.max, 3);
  // Tactical Master and Heroic Warrior wait on Weapon Mastery and Heroic Inspiration: manual, granting nothing.
  for (const id of ["tactical-master", "heroic-warrior"]) { const f = feat(15, id); assert.equal(f.tier, "manual"); assert.equal(f.action, undefined); }
});

test("Indomitable: a failed save is rolled again with the Fighter level added, the new roll stands, and a use is spent", () => {
  let checked = 0;
  for (let seed = 1; seed < 200 && checked < 3; seed++) {
    const s = frightener(9), e = s.entities.hero;
    s.rng = seed * 7919;
    const saves = ok(scare(s)).events.filter((x) => x.type === "save" && x.id === "hero");
    assert.equal(saves.length, 1, "one save event");
    const sv = saves[0];
    assert.equal(sv.dc, 18);
    if (!sv.reroll) continue;
    checked++;
    assert.equal(sv.reroll.name, "Indomitable"); assert.equal(sv.reroll.add, 9);
    assert.equal(sv.total, sv.roll + sv.bonus + 9, "the new roll plus the bonus and the Fighter level");
    assert.equal(sv.success, sv.total >= 18);
    assert.equal(!!e.cond.frightened, !sv.success, "the new roll stands");
    assert.equal(e.uses.indomitable, 0);
    assert.ok(sv.reroll.was + sv.bonus < 18, "the first roll had failed");
  }
  assert.ok(checked >= 3, "rerolls seen");
});

test("Indomitable: not on a success, not where even a 20 could not succeed, not with an instruction of never, and back on a Long Rest", () => {
  // A success: nothing spent.
  for (let seed = 1; seed < 100; seed++) {
    const s = frightener(9);
    s.rng = seed * 7919;
    const sv = ok(scare(s)).events.find((x) => x.type === "save" && x.id === "hero");
    if (sv.success && !sv.reroll) { assert.equal(s.entities.hero.uses.indomitable, 1); break; }
  }
  // A DC no new roll could reach: the use is kept.
  const s = frightener(9), e = s.entities.hero;
  s.entities.vor.feats.find((f) => f.id === "intimidating-presence").action.effects[0].dc = 40;
  const sv = ok(scare(s)).events.find((x) => x.type === "save" && x.id === "hero");
  assert.ok(!sv.success && !sv.reroll);
  assert.equal(e.uses.indomitable, 1);
  // Never: the save stands.
  const t = frightener(9);
  assert.ok(reactionsOf(t.entities.hero).some((r) => r.id === "indomitable" && r.kind === "free" && r.dflt === "always"));
  ok(apply(t, { type: "reactions", actor: "hero", set: { indomitable: "never" } }, DM));
  for (let seed = 1; seed < 40; seed++) {
    const u = structuredClone(t);
    u.rng = seed * 7919;
    const x = ok(scare(u)).events.find((y) => y.type === "save" && y.id === "hero");
    assert.ok(!x.reroll);
    assert.equal(u.entities.hero.uses.indomitable, 1);
  }
  // Level 8: none.
  assert.ok(!derive(fighter(8)).record.feats.some((f) => f.reroll));
  // Spent uses come back on a Long Rest, not a Short one.
  const r = field(13);
  r.entities.hero.uses.indomitable = 0;
  ok(apply(r, { type: "shortRest" }, DM));
  assert.equal(r.entities.hero.uses.indomitable, 0);
  ok(apply(r, { type: "rest" }, DM));
  assert.equal(r.entities.hero.uses.indomitable, 2);
});

test("Studied Attacks: after a miss, Advantage on the next attack roll against that creature, used once, ending after the fighter's next turn", () => {
  const s = field(13, { foeAc: 40 });
  fight(s); turnOf(s, "hero");
  const r = ok(swing(s, s.foe));
  assert.equal(r.events.find((x) => x.type === "attack").hit, false);
  const e = s.entities.hero, sit = (id) => ({ attacker: e, target: s.entities[id], ranged: false });
  assert.deepEqual(modifiers(s, e, "attack.roll", sit(s.foe)).advantage, ["Studied Attacks"]);
  assert.deepEqual(modifiers(s, e, "attack.roll", sit(s.foe2)).advantage, [], "only against the creature it missed");
  s.entities[s.foe].ac = 40;
  // The next attack roll against it has Advantage and uses it up (and, missing, studies it again).
  const r2 = ok(swing(s, s.foe)).events.find((x) => x.type === "attack");
  assert.equal(r2.mode, "adv"); assert.ok(r2.why.includes("Studied Attacks"));
  assert.equal((s.effects ?? []).filter((fx) => fx.name === "Studied Attacks").length, 1, "the first is used, a new one from the second miss");
  // One left unused ends at the end of the fighter's next turn.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.deepEqual(modifiers(s, e, "attack.roll", sit(s.foe)).advantage, ["Studied Attacks"], "kept through the end of this turn");
  turnOf(s, "hero");
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.deepEqual(modifiers(s, e, "attack.roll", sit(s.foe)).advantage, [], "gone after the next turn");
  // Level 12: nothing after a miss.
  const t = field(12, { foeAc: 40 });
  fight(t); turnOf(t, "hero"); ok(swing(t, t.foe));
  assert.ok(!(t.effects ?? []).some((fx) => fx.name === "Studied Attacks"));
});

test("Two Extra Attacks: three attacks with the Attack action at level 11, two at 10", () => {
  for (const [level, n] of [[10, 2], [11, 3]]) {
    const s = field(level);
    fight(s); turnOf(s, "hero");
    for (let i = 0; i < n; i++) ok(swing(s, s.foe));
    no(swing(s, s.foe), /already used an action/);
  }
});

test("Additional Fighting Style: a second, different Fighting Style feat at level 7", () => {
  const r = derive(fighter(7)).record;
  assert.equal(r.attacks.find((a) => a.id === "longbow").bonus, 2 + 3 + 2, "Archery's +2 with the second style");
  assert.equal(r.ac, 17, "Defense from the first still holds");
  assert.deepEqual(validate(fighter(7, { choices: { "fighting-style": "archery", "additional-fighting-style": "archery" } })), ["Additional Fighting Style must be a different Fighting Style."]);
  assert.equal(derive(fighter(6, { choices: { "fighting-style": "defense", "additional-fighting-style": "archery" } })).record.attacks.find((a) => a.id === "longbow").bonus, 2 + 3, "not before level 7");
});

test("Superior Critical: a weapon attack scores a Critical Hit on 18 to 20 from level 15", () => {
  assert.equal(derive(fighter(14)).record.critOn, 19);
  assert.equal(derive(fighter(15)).record.critOn, 18);
  let seen = false;
  for (let seed = 1; seed < 400 && !seen; seed++) {
    const s = field(15, { foeAc: 30 });
    s.rng = seed * 7919;
    fight(s); turnOf(s, "hero");
    const a = ok(swing(s, s.foe)).events.find((x) => x.type === "attack");
    if (a.nat !== 18) continue;
    seen = true;
    assert.equal(a.hit, true, "18 hits against Armor Class 30");
    assert.equal(a.crit, true);
  }
  assert.ok(seen, "a natural 18 was rolled");
});
