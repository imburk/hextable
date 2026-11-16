// Weapon properties in the SRD 5.2 weapons section (issue #435), and what the engine does with each, through apply().
// Step 1 of the job: these tests show TODAY's behaviour, property by property. Later commits change the ones for Heavy,
// Loading and Two-Handed to the SRD's rule and leave the rest as they are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const sheet = (abilities, weapons, more = {}) => ({ name: "Fi", class: "fighter", level: more.level ?? 5, ...((more.level ?? 5) >= 3 ? { subclass: "champion" } : {}), abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons, ...more });
const STRONG = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const WEAK = { str: 8, dex: 16, con: 14, int: 10, wis: 8, cha: 8 };       // Strength below 13, Dexterity 13 or more
const CLUMSY = { str: 16, dex: 8, con: 14, int: 10, wis: 8, cha: 8 };     // Dexterity below 13

// A fighter beside (or `gap` hexes from) a hard-to-kill goblin, in a fight, on the fighter's turn.
function field(sh, { gap = 1, foeAc = 1 } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: foeAc });
  s.foe = foe;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 6 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), "hero");
  s.entities[foe].pos = { q: gap, r: 0, z: 0 };         // moved after the fight began, so far shots can be tried
  return s;
}
const swing = (s, attack, target = s.foe) => apply(s, { type: "attack", actor: "hero", target, attack }, DM);
const roll = (r) => r.events.find((e) => e.type === "attack");

test("Ammunition (today): a ranged attack with the property needs no ammunition and nothing is counted", () => {
  const s = field(sheet(STRONG, ["longbow"]), { gap: 3 });
  const before = JSON.stringify(s.entities.hero);
  assert.ok(!/arrow|ammo/i.test(before), "the character carries no ammunition at all");
  ok(swing(s, "longbow"));
  ok(swing(s, "longbow"));                                          // Extra Attack: a second shot, still no ammunition
  assert.ok(!/arrow|ammo/i.test(JSON.stringify(s.entities.hero)), "nothing was spent");
});

test("Finesse (already right): the better of Strength and Dexterity, the same modifier for attack and damage", () => {
  const a = derive(sheet(WEAK, ["rapier"])).record.attacks.find((x) => x.id === "rapier");
  assert.equal(a.abil, "dex");
  assert.equal(a.finesse, true);
  assert.equal(a.damage, "1d8+3", "the Dexterity modifier in the damage as in the attack");
  const b = derive(sheet(STRONG, ["rapier"])).record.attacks.find((x) => x.id === "rapier");
  assert.equal(b.abil, "str", "Strength 16 beats Dexterity 14");
});

test("Heavy (today): no Disadvantage for Strength 8 with a Greatsword, nor Dexterity 8 with a Longbow", () => {
  const s = field(sheet(WEAK, ["greatsword"]));
  const r = roll(ok(swing(s, "greatsword")));
  assert.equal(r.mode, "normal");
  assert.deepEqual(r.why, []);
  const t = field(sheet(CLUMSY, ["longbow"]), { gap: 3 });
  const q = roll(ok(swing(t, "longbow")));
  assert.equal(q.mode, "normal");
});

test("Light (today, not built): there is no Bonus Action attack with a second Light weapon", () => {
  const rec = derive(sheet(STRONG, ["shortsword", "dagger"])).record;
  assert.ok(rec.attacks.every((a) => a.time !== "bonus"), "no attack is offered as a Bonus Action");
});

test("Loading (today): a Loading weapon fires on every attack Extra Attack gives", () => {
  const s = field(sheet(STRONG, ["light-crossbow"]), { gap: 3 });
  ok(swing(s, "light-crossbow"));
  ok(swing(s, "light-crossbow"));                                   // the second shot of the same action
  assert.equal(s.encounter.budget.attacks, undefined, "both attacks of the action went on the crossbow");
});

test("Range (already right): Disadvantage beyond normal range, refused beyond long range", () => {
  const near = field(sheet(STRONG, ["shortbow"]), { gap: 17 });        // 85 ft: past 80, within 320
  assert.equal(roll(ok(swing(near, "shortbow"))).mode, "dis");
  const far = field(sheet(STRONG, ["shortbow"]), { gap: 65 });         // 325 ft
  assert.equal(swing(far, "shortbow").ok, false);
});

test("Reach (already right): a Glaive reaches 10 feet and not 15", () => {
  assert.equal(derive(sheet(STRONG, ["glaive"])).record.attacks.find((a) => a.id === "glaive").reach, 10);
  const s = field(sheet(STRONG, ["glaive"]), { gap: 2 });
  ok(swing(s, "glaive"));
  const t = field(sheet(STRONG, ["glaive"]), { gap: 3 });
  assert.equal(swing(t, "glaive").ok, false);
});

test("Thrown (already right): a second, ranged attack with the same ability", () => {
  const rec = derive(sheet(STRONG, ["javelin"])).record.attacks;
  const t = rec.find((a) => a.id === "javelin-thrown");
  assert.equal(t.type, "ranged");
  assert.equal(t.abil, rec.find((a) => a.id === "javelin").abil);
  assert.deepEqual(t.range, [30, 120]);
});

test("Two-Handed (today): a Greatsword is swung from behind a Shield, and with a second weapon in hand", () => {
  const rec = derive(sheet(STRONG, ["greatsword", "longsword"], { shield: true })).record;
  assert.equal(rec.shield, true, "the sheet records a Shield");
  const s = field(sheet(STRONG, ["greatsword", "longsword"], { shield: true }));
  ok(swing(s, "greatsword"));                                       // two hands on a Greatsword, and a Shield
  assert.equal(rec.hands, undefined, "the sheet does not record what is in each hand");
});

test("Versatile (already right): the two-handed damage is its own attack, offered only without a Shield", () => {
  const free = derive(sheet(STRONG, ["longsword"])).record.attacks.find((a) => a.id === "longsword-two-handed");
  assert.equal(free.damage, "1d10+3");
  assert.equal(derive(sheet(STRONG, ["longsword"], { shield: true })).record.attacks.find((a) => a.id === "longsword-two-handed"), undefined);
});
