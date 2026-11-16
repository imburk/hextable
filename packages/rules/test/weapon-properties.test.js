// Weapon properties in the SRD 5.2 weapons section (issue #435), and what the engine does with each, through apply().
// Step 1 of the job: these tests show TODAY's behaviour, property by property. Later commits change the ones for Heavy,
// Loading and Two-Handed to the SRD's rule and leave the rest as they are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
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
const bytes = (s) => JSON.stringify(s);
// Play `actions` as the DM with history kept; then undo them all (the state is byte for byte the start), redo them
// (byte for byte the end) and replay them on a copy of the start (the same events and the same end). Returns the events.
function exact(s, actions) {
  const h = createHistory(), start = bytes(s), copy = structuredClone(s), out = [];
  for (const a of actions) {
    const before = mark(s), r = apply(s, a, DM);
    assert.ok(r.ok, r.error);
    h.record(before, s, describeStep(a, r.events, before, s));
    out.push(r.events);
  }
  const end = bytes(s);
  for (let i = 0; i < actions.length; i++) assert.ok(h.undo(s));
  assert.equal(bytes(s), start, "undone");
  for (let i = 0; i < actions.length; i++) assert.ok(h.redo(s));
  assert.equal(bytes(s), end, "redone");
  const again = actions.map((a) => { const r = apply(copy, a, DM); assert.ok(r.ok, r.error); return r.events; });
  assert.deepEqual(again, out, "replayed events");
  assert.equal(bytes(copy), end, "replayed state");
  return out;
}
// A refused action says why in a sentence and leaves the state as it was.
function refused(s, action, re) {
  const before = bytes(s), r = apply(s, action, DM);
  assert.equal(r.ok, false, "refused");
  assert.match(r.error, re);
  assert.match(r.error, /^[A-Z].*[.!]$/, "a plain sentence");
  assert.equal(bytes(s), before, "nothing changed");
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

test("Heavy: Disadvantage with a Melee weapon below Strength 13, or a Ranged one below Dexterity 13 (SRD, Properties, Heavy)", () => {
  const s = field(sheet(WEAK, ["greatsword"]));                      // Strength 8
  const r = roll(ok(swing(s, "greatsword")));
  assert.equal(r.mode, "dis");
  assert.deepEqual(r.why, ["Heavy weapon, Strength 8"]);
  assert.equal(r.rolls.length, 2, "two dice, the lower taken");
  const t = field(sheet(CLUMSY, ["longbow"]), { gap: 3 });          // Dexterity 8
  const q = roll(ok(swing(t, "longbow")));
  assert.equal(q.mode, "dis");
  assert.deepEqual(q.why, ["Heavy weapon, Dexterity 8"]);
});

test("Heavy: the right score for the kind, and 13 is enough", () => {
  assert.equal(roll(ok(swing(field(sheet(STRONG, ["greatsword"])), "greatsword"))).mode, "normal", "Strength 16 with a Melee weapon");
  assert.equal(roll(ok(swing(field(sheet(CLUMSY, ["greatsword"])), "greatsword"))).mode, "normal", "Dexterity does not matter to a Melee weapon");
  assert.equal(roll(ok(swing(field(sheet(WEAK, ["longbow"]), { gap: 3 }), "longbow"))).mode, "normal", "Strength does not matter to a Ranged weapon");
  assert.equal(roll(ok(swing(field(sheet({ ...WEAK, str: 13 }, ["greatsword"])), "greatsword"))).mode, "normal", "Strength 13 is enough");
  assert.equal(roll(ok(swing(field(sheet({ ...WEAK, str: 12 }, ["greatsword"])), "greatsword"))).mode, "dis", "Strength 12 is not");
  assert.equal(roll(ok(swing(field(sheet(WEAK, ["longsword"])), "longsword"))).mode, "normal", "a weapon without the property");
});

test("Heavy: it cancels an Advantage, and a Disadvantage already there does not double", () => {
  const s = field(sheet(WEAK, ["greatsword"]));
  s.entities[s.foe].cond.prone = {};                                 // a Melee attack on a Prone target has Advantage
  const r = roll(ok(swing(s, "greatsword")));
  assert.equal(r.mode, "normal");
  const t = field(sheet(CLUMSY, ["longbow"]), { gap: 31 });          // 155 ft, past the longbow's 150: long range, and Dexterity 8
  const q = roll(ok(swing(t, "longbow")));
  assert.equal(q.mode, "dis");
  assert.deepEqual(q.why.sort(), ["Heavy weapon, Dexterity 8", "long range"]);
});

test("Heavy: a thrown Javelin and a Dagger are not Heavy; undo, redo and replay are exact", () => {
  const s = field(sheet(WEAK, ["greatsword", "javelin"]));
  const out = exact(s, [{ type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, { type: "attack", actor: "hero", target: s.foe, attack: "javelin" }]);
  assert.equal(roll({ events: out[0] }).mode, "dis");
  assert.equal(roll({ events: out[1] }).mode, "normal");
});

test("Light (today, not built): there is no Bonus Action attack with a second Light weapon", () => {
  const rec = derive(sheet(STRONG, ["shortsword", "dagger"])).record;
  assert.ok(rec.attacks.every((a) => a.time !== "bonus"), "no attack is offered as a Bonus Action");
});

test("Loading: one shot from a Loading weapon for each action, whatever Extra Attack gives (SRD, Properties, Loading)", () => {
  const s = field(sheet(STRONG, ["light-crossbow", "longsword"]), { gap: 1 });     // Fighter 5: two attacks with the Attack action
  const shoot = { type: "attack", actor: "hero", target: s.foe, attack: "light-crossbow" };
  ok(apply(s, shoot, DM));
  assert.equal(s.encounter.budget.attacks[0][0].left, 1, "the second attack of the action is still there");
  refused(s, shoot, /Light Crossbow is a Loading weapon: it fires one piece of ammunition each time .* uses an action/);
  assert.equal(s.encounter.budget.attacks[0][0].left, 1, "and was not spent by the refusal");
  ok(apply(s, { ...shoot, attack: "longsword" }, DM));             // the other attack of the action goes on another weapon
  assert.equal(s.encounter.budget.attacks, undefined);
});

test("Loading: a new action (Action Surge) fires again; the turn after does too", () => {
  const s = field(sheet(STRONG, ["light-crossbow"]), { gap: 3 });
  const shoot = { type: "attack", actor: "hero", target: s.foe, attack: "light-crossbow" };
  ok(apply(s, shoot, DM));
  delete s.encounter.budget.attacks;                                  // the first action's other attack is used or given up,
  s.encounter.budget.action = 1;                                      // and a second action comes, as Action Surge gives
  ok(apply(s, shoot, DM));
  assert.deepEqual(s.encounter.budget.loaded, ["action:light-crossbow"], "the new action cleared the old mark");
  refused(s, shoot, /Loading weapon/);
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  for (let i = 0; i < 6 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(s.encounter.budget.loaded, undefined, "a new turn has a new budget");
  ok(apply(s, shoot, DM));
});

test("Loading: a weapon without the property is not held to it, and a refusal is exact under undo, redo and replay", () => {
  const s = field(sheet(STRONG, ["longbow", "light-crossbow"]), { gap: 3 });
  const bow = { type: "attack", actor: "hero", target: s.foe, attack: "longbow" };
  const out = exact(s, [bow, bow, { type: "endTurn", actor: "hero" }]);
  assert.equal(out[1].find((e) => e.type === "attack").name, "Longbow", "two arrows in one action");
  const t = field(sheet(STRONG, ["light-crossbow"]), { gap: 3 });
  const xb = { type: "attack", actor: "hero", target: t.foe, attack: "light-crossbow" };
  exact(t, [xb, { type: "endTurn", actor: "hero" }]);
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

test("Two-Handed: a Shield takes a hand, so a Two-Handed weapon is refused with a sentence and nothing changes (SRD, Properties, Two-Handed)", () => {
  const s = field(sheet(STRONG, ["greatsword", "longsword", "longbow", "shortsword"], { shield: true }));
  assert.equal(s.entities.hero.shield, true, "the sheet records the Shield");
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, /^Greatsword is a Two-Handed weapon and needs both hands, and Fi carries a Shield\. Attack with another weapon, or put the Shield away\.$/);
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "longbow" }, /Longbow is a Two-Handed weapon/);
  assert.ok(s.encounter.budget.action === 1 && !s.encounter.budget.attacks, "no action was spent");
  const out = exact(s, [{ type: "attack", actor: "hero", target: s.foe, attack: "longsword" }, { type: "attack", actor: "hero", target: s.foe, attack: "shortsword" }]);
  assert.equal(out.length, 2, "One-handed weapons are fine with a Shield");
});

test("Two-Handed: without a Shield it is allowed; a Light Crossbow and a Heavy Crossbow count too", () => {
  ok(swing(field(sheet(STRONG, ["greatsword"])), "greatsword"));
  ok(swing(field(sheet(STRONG, ["light-crossbow"]), { gap: 3 }), "light-crossbow"));
  const s = field(sheet(STRONG, ["light-crossbow"], { shield: true }), { gap: 3 });
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "light-crossbow" }, /Light Crossbow is a Two-Handed weapon/);
});

test("Two-Handed: a Lance is one-handed while mounted, so a Shield may stay on", () => {
  const s = field(sheet(STRONG, ["lance"], { shield: true }), { gap: 2 });
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "lance" }, /Lance is a Two-Handed weapon/);
  const horse = makeEntity({ name: "Warhorse", hp: 19, ac: 11, speed: 60, size: "large", abil: { str: 18, dex: 12, con: 13, int: 2, wis: 12, cha: 7 }, attacks: [] }, { id: "horse", kind: "npc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.horse = horse;
  s.entities.hero.riding = { on: "horse", controlled: true, size: "large" };
  horse.rider = "hero";
  ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "lance" }, DM));
});

test("Two-Handed: what the sheet does not say is left to the DM (no hands are recorded)", () => {
  const rec = derive(sheet(STRONG, ["greatsword", "longsword"])).record;
  assert.equal(rec.hands, undefined);
  assert.equal(rec.weapons, undefined, "the weapons are the ones carried, any of which may be used: not what is held");
  // A Greatsword and a Longsword are both on the sheet, and the engine lets either be swung: it cannot know which is in hand.
  const s = field(sheet(STRONG, ["greatsword", "longsword"]));
  ok(swing(s, "greatsword"));
  ok(swing(s, "longsword"));
});

test("Versatile (already right): the two-handed damage is its own attack, offered only without a Shield", () => {
  const free = derive(sheet(STRONG, ["longsword"])).record.attacks.find((a) => a.id === "longsword-two-handed");
  assert.equal(free.damage, "1d10+3");
  assert.equal(derive(sheet(STRONG, ["longsword"], { shield: true })).record.attacks.find((a) => a.id === "longsword-two-handed"), undefined);
});
