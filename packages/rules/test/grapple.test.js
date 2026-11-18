// The Grapple option of the Unarmed Strike and the hold it puts on (issue #466, stage G2 of docs/specs/grapple-shove.md; DEBT T61).
// SRD 5.2 "Unarmed Strike", Grapple: "The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has
// the Grappled condition. The DC for the saving throw and any escape attempts equals 8 plus your Strength modifier and Proficiency
// Bonus. This grapple is possible only if the target is no more than one size larger than you and if you have a hand free to grab it."
// "Grappling": one grapple per hand; ending a grapple (an escape check with the action, the grappler Incapacitated, the distance past
// the grapple's range, a release at any time with no action). "Grappled": Speed 0, Disadvantage on attack rolls against any target
// other than the grappler. Grappler feat: Punch and Grab, Attack Advantage.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, rollMode } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { describeStep, mark } from "../src/history.js";
import { speedOf } from "../src/modifiers.js";
import { CONTENT } from "../src/content/index.js";
import { OPPORTUNITY, OPPORTUNITY_GRAPPLE, grappleInstead } from "../src/reactions.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const fighter = (abilities, weapons = [], more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons, ...more });
const STR16 = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const GRAPPLER = { feats: [{ id: "grappler", at: "ability-score-improvement-4", abilities: { str: 1 } }] };
const GRAB = { type: "attack", actor: "hero", attack: "unarmed-strike", option: "grapple" };
const fails = (e) => { e.saveBonus = { str: -40, dex: -40 }; };            // the save cannot succeed
const resists = (e) => { e.saveBonus = { str: 40, dex: 40 }; };            // the save cannot fail
const refused = (s, action, re, ctx = DM) => { const before = JSON.stringify(s), r = apply(s, action, ctx); assert.equal(r.ok, false, "should have been refused"); assert.match(r.error, re); assert.equal(JSON.stringify(s), before, "a refusal changes nothing"); };
const turnOf = (s, id) => { for (let i = 0; i < 12 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

// A hero (built from `sheet`) at 0,0 and a goblin beside it on grass, a fight begun and the hero's turn. `foes`: how many goblins
// (at 1,0, then 0,1 and -1,1). `ally`: a second built character at 1,-1, beside the first goblin.
function field(sheet, { fight = true, foes = 1, ally = null } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  if (ally) s.entities.ally = makeEntity(derive(ally).record, { id: "ally", kind: "pc", side: "party", pos: { q: 1, r: -1, z: 0 } });
  s.foes = [];
  for (const at of [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }].slice(0, foes)) {
    const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events.find((e) => e.type === "spawned").id;
    Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 });
    fails(s.entities[id]);
    s.foes.push(id);
  }
  s.foe = s.foes[0];
  if (fight) { ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, "hero"); }
  return s;
}
const grapple = (s, target = s.foe, more = {}) => apply(s, { ...GRAB, target, ...more }, DM);
const HOLD = { by: "hero", with: "hand", escape: 14, range: 5 };

test("a failed save: the target is Grappled with Speed 0, and the hold says who, with what, its escape DC and its range", () => {
  const s = field(fighter(STR16));
  const r = ok(grapple(s));
  const t = s.entities[s.foe];
  assert.deepEqual(t.cond.grappled, { source: "hero", holds: [HOLD] });
  assert.equal(speedOf(s, t), 0);
  const types = r.events.map((e) => e.type);
  assert.ok(!types.includes("attack"), "no attack roll");
  assert.ok(types.indexOf("strikeOption") < types.indexOf("save") && types.indexOf("save") < types.indexOf("cond"), types.join());
  assert.deepEqual(r.events.find((e) => e.type === "strikeOption"), { type: "strikeOption", actor: "hero", target: s.foe, option: "grapple" });
  assert.equal(r.events.find((e) => e.type === "save").dc, 14);
  assert.deepEqual(r.events.find((e) => e.type === "cond"), { type: "cond", id: s.foe, cond: "grappled", by: "hero" });
  assert.ok(!r.events.some((e) => e.type === "manual" && /Nothing ends it/.test(e.text)), "the engine ends it now");
  assert.equal(s.encounter.budget.attacks[0][0].left, 1, "one attack of the Attack action spent");
});

test("a successful save: no hold; a target two sizes larger is refused; one already held by the same grappler is refused", () => {
  const s = field(fighter(STR16));
  resists(s.entities[s.foe]);
  ok(grapple(s));
  assert.equal(s.entities[s.foe].cond.grappled, undefined);
  fails(s.entities[s.foe]);
  ok(grapple(s));
  refused(s, { ...GRAB, target: s.foe }, /already grappling/);
  const t = field(fighter(STR16));
  t.entities[t.foe].size = "huge";
  refused(t, { ...GRAB, target: t.foe }, /no more than one size larger/);
  t.entities[t.foe].size = "large";
  ok(grapple(t));
  assert.ok(t.entities[t.foe].cond.grappled);
});

test("two grapplers on one creature: the second adds a hold; letting go of one leaves the other, and `source` follows the first left", () => {
  const s = field(fighter(STR16), { ally: fighter(STR16) });
  ok(grapple(s));
  turnOf(s, "ally");
  const r = ok(apply(s, { ...GRAB, actor: "ally", target: s.foe }, DM));
  const g = s.entities[s.foe].cond.grappled;
  assert.deepEqual(g.holds.map((h) => h.by), ["hero", "ally"]);
  assert.equal(g.source, "hero");
  assert.ok(r.events.some((e) => e.type === "hold" && e.id === s.foe && e.by === "ally"));
  assert.ok(!r.events.some((e) => e.type === "cond"), "the condition was already there");
  const l = ok(apply(s, { type: "letGo", actor: "hero", target: s.foe }, DM));
  assert.deepEqual(l.events.filter((e) => e.type === "holdEnd" || e.type === "condEnd"), [{ type: "holdEnd", id: s.foe, by: "hero", why: "released" }]);
  assert.deepEqual(s.entities[s.foe].cond.grappled, { source: "ally", holds: [{ ...HOLD, by: "ally" }] });
  const m = ok(apply(s, { type: "letGo", actor: "ally", target: s.foe }, DM));
  assert.deepEqual(m.events.find((e) => e.type === "condEnd"), { type: "condEnd", id: s.foe, cond: "grappled", by: "ally", why: "released" });
  assert.equal(s.entities[s.foe].cond.grappled, undefined);
});

test("letGo needs no action and no turn, in a fight or out of one; it is refused for a creature it does not hold", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  const b = JSON.stringify(s.encounter.budget);
  turnOf(s, s.foe);
  ok(apply(s, { type: "letGo", actor: "hero", target: s.foe }, DM));
  assert.equal(s.entities[s.foe].cond.grappled, undefined);
  refused(s, { type: "letGo", actor: "hero", target: s.foe }, /isn't grappling/);
  turnOf(s, "hero");
  assert.notEqual(JSON.stringify(s.encounter.budget), b, "a new turn");
  const t = field(fighter(STR16), { fight: false });
  t.entities[t.foe].cond.grappled = { source: "hero", holds: [HOLD] };
  ok(apply(t, { type: "letGo", actor: "hero", target: t.foe }, DM));
  assert.equal(t.entities[t.foe].cond.grappled, undefined);
});

test("escape: Athletics or Acrobatics against the escape DC, with the action in a fight; the better skill when none is named", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  turnOf(s, s.foe);
  const foe = s.entities[s.foe];
  foe.skillBonus = { athletics: -40, acrobatics: -40 };
  const r = ok(apply(s, { type: "escape", actor: s.foe, skill: "athletics" }, DM));
  const ck = r.events.find((e) => e.type === "check");
  assert.equal(ck.skill, "athletics"); assert.equal(ck.escape, "hero"); assert.equal(ck.dc, 14); assert.equal(ck.success, false);
  assert.ok(foe.cond.grappled, "a failed escape changes nothing but the spent action");
  assert.equal(s.encounter.budget.action, 0);
  refused(s, { type: "escape", actor: s.foe }, /action/);
  turnOf(s, "hero"); turnOf(s, s.foe);
  foe.skillBonus = { athletics: -5, acrobatics: 40 };
  const e = ok(apply(s, { type: "escape", actor: s.foe }, DM));
  assert.equal(e.events.find((x) => x.type === "check").skill, "acrobatics", "the better chance");
  assert.deepEqual(e.events.find((x) => x.type === "condEnd"), { type: "condEnd", id: s.foe, cond: "grappled", by: "hero", why: "escaped" });
  assert.equal(foe.cond.grappled, undefined);
  refused(s, { type: "escape", actor: s.foe }, /isn't Grappled/);
});

test("escape out of a fight costs nothing; by Athletics; a creature held by two names which; not on another's turn in a fight", () => {
  const s = field(fighter(STR16), { fight: false, ally: fighter(STR16) });
  const foe = s.entities[s.foe];
  foe.cond.grappled = { source: "hero", holds: [HOLD, { ...HOLD, by: "ally" }] };
  foe.skillBonus = { athletics: 40, acrobatics: -40 };
  refused(s, { type: "escape", actor: s.foe }, /more than one/);
  refused(s, { type: "escape", actor: s.foe, from: "nobody" }, /isn't held by/);
  refused(s, { type: "escape", actor: s.foe, from: "hero", skill: "stealth" }, /Athletics.*Acrobatics/);
  const r = ok(apply(s, { type: "escape", actor: s.foe, from: "ally" }, DM));
  assert.equal(r.events.find((e) => e.type === "check").skill, "athletics");
  assert.deepEqual(foe.cond.grappled, { source: "hero", holds: [HOLD] });
  assert.ok(r.events.some((e) => e.type === "holdEnd" && e.why === "escaped" && e.by === "ally"));
  const t = field(fighter(STR16));
  ok(grapple(t));
  refused(t, { type: "escape", actor: t.foe }, /isn't .*turn/);
});

test("the grappler knocked Unconscious ends the hold (incapacitated)", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  const r = ok(apply(s, { type: "harm", actor: "hero", amount: 999 }, DM));
  assert.equal(s.entities[s.foe].cond.grappled, undefined);
  assert.deepEqual(r.events.find((e) => e.type === "condEnd" && e.cond === "grappled"), { type: "condEnd", id: s.foe, cond: "grappled", by: "hero", why: "incapacitated" });
  const t = field(fighter(STR16));
  ok(grapple(t));
  ok(apply(t, { type: "condition", actor: "hero", condition: "stunned", on: true }, DM));
  assert.equal(t.entities[t.foe].cond.grappled, undefined, "any condition that includes Incapacitated");
});

test("the held creature taken 30 ft away ends the hold (distance); within the range it holds", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  const r = ok(apply(s, { type: "place", actor: s.foe, to: { q: 6, r: 0 } }, DM));
  assert.equal(s.entities[s.foe].cond.grappled, undefined);
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.why === "distance"));
  const t = field(fighter(STR16));
  ok(grapple(t));
  ok(apply(t, { type: "place", actor: t.foe, to: { q: 0, r: -1 } }, DM));
  assert.ok(t.entities[t.foe].cond.grappled, "still beside the grappler");
});

test("a creature that holds another may move and Dash: it drags what it holds (G3 removes G2's refusal; the drag is in grapple-drag.test.js)", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  ok(apply(s, { type: "feature", actor: "hero", feature: "action-surge" }, DM));
  ok(apply(s, { type: "dash", actor: "hero" }, DM));
  ok(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 0 } }, DM));
  assert.ok(s.entities[s.foe].cond.grappled, "still held");
  assert.ok(s.entities[s.foe].pos.q <= -1, "dragged along");
});

test("a follower that holds a creature stays where it is when the column walks, and its hold does not end (M3)", () => {
  const s = field(fighter(STR16), { fight: false, ally: fighter(STR16) });
  ok(apply(s, { type: "follow", actor: "ally", leader: "hero" }, DM));
  s.entities[s.foe].cond.grappled = { source: "ally", holds: [{ ...HOLD, by: "ally" }] };
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, DM));
  assert.deepEqual(s.entities.ally.pos, { q: 1, r: -1, z: 0 });
  assert.ok(!r.events.some((e) => e.type === "moved" && e.id === "ally"));
  assert.deepEqual(s.entities[s.foe].cond.grappled.holds.map((h) => h.by), ["ally"]);
  assert.equal(s.entities.ally.follow, "hero", "it still follows");
});

test("a grappler that teleports away ends its hold, and the note says it teleported, not that the engine does not drag (L1)", () => {
  const s = newGame(7);
  s.settings.autoEngage = false;
  const w = s.entities.wizard;
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => ({ q: w.pos.q + dq, r: w.pos.r + dr }))
    .find((h) => !Object.values(s.entities).some((o) => o.pos.q === h.q && o.pos.r === h.r));
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot }, DM)).events.find((e) => e.type === "spawned").id;
  if (!w.spells.includes("misty-step")) w.spells.push("misty-step");
  w.slots = { ...w.slots, 2: 3 }; w.slotsMax = { ...w.slotsMax, 2: 3 };
  s.entities[gob].cond.grappled = { source: "wizard", holds: [{ ...HOLD, by: "wizard" }] };
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: w.pos.q - 5, r: w.pos.r } }, DM));
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "wizard" && e.teleport), r.events.map((e) => e.type).join());
  assert.equal(s.entities[gob].cond.grappled, undefined);
  assert.ok(r.events.some((e) => e.type === "note" && /teleported away/.test(e.text)));
  assert.ok(!r.events.some((e) => /does not drag/.test(e.text ?? "")));
});

test("the DM placing the grappler away: the note says how far apart they are (L1)", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  const r = ok(apply(s, { type: "place", actor: "hero", to: { q: -5, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "note" && /more than 5 ft apart, so the grapple ended/.test(e.text)));
  assert.ok(!r.events.some((e) => /does not drag/.test(e.text ?? "")));
});

test("a held creature that dies is held no more: the hold ends and the hand is free (M1)", () => {
  const s = field(fighter(STR16), { foes: 3 });
  ok(grapple(s, s.foes[0]));
  const r = ok(apply(s, { type: "harm", actor: s.foes[0], amount: 9999 }, DM));
  assert.ok(s.entities[s.foes[0]].dead);
  assert.equal(s.entities[s.foes[0]].cond.grappled, undefined);
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.id === s.foes[0] && e.cond === "grappled" && e.why === "released"));
  ok(grapple(s, s.foes[1]));
  ok(apply(s, { type: "feature", actor: "hero", feature: "action-surge" }, DM));
  // The safety net: a corpse still marked as held (as the record could be between two passes) fills no hand.
  s.entities[s.foes[0]].cond.grappled = { source: "hero", holds: [HOLD] };
  ok(grapple(s, s.foes[2]));
  assert.ok(s.entities[s.foes[2]].cond.grappled);
  assert.equal(s.entities[s.foes[0]].cond.grappled, undefined, "and the after-pass ends it");
});

test("a Shield can't be taken up with both hands holding creatures (L2)", () => {
  const sheet = fighter(STR16, ["longsword"], { shield: true, shieldStowed: true }), s = field(sheet, { foes: 2 });
  s.entities.hero.sheet = structuredClone(sheet);                   // a built character keeps its sheet, which `shield` changes
  assert.ok(!s.entities.hero.shield);
  ok(grapple(s, s.foes[0])); ok(grapple(s, s.foes[1]));
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  refused(s, { type: "shield", actor: "hero", on: true }, /no hand free for a Shield: it is holding .* and .*\. Let go first/);
  ok(apply(s, { type: "letGo", actor: "hero", target: s.foes[1] }, DM));
  ok(apply(s, { type: "shield", actor: "hero", on: true }, DM));
  assert.ok(s.entities.hero.shield);
});

test("a held creature that is Prone can't stand: its Speed is 0", () => {
  const s = field(fighter(STR16));
  ok(grapple(s));
  s.entities[s.foe].cond.prone = {};
  turnOf(s, s.foe);
  refused(s, { type: "stand", actor: s.foe }, /Speed of 0|Speed is 0/);
});

test("the history names a Grapple and a Shove for what they are (L3)", () => {
  const s = field(fighter(STR16));
  const name = s.entities[s.foe].name;
  const label = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); return describeStep(a, r.events, before, s).label; };
  assert.equal(label({ ...GRAB, target: s.foe }), `Fi grappled ${name}`);
  assert.equal(label({ type: "attack", actor: "hero", attack: "unarmed-strike", option: "shove", shove: "prone", target: s.foe }), `Fi shoved ${name}`);
});

test("a second hold by a grappler the party does not know of: the `hold` event reaches them without who", () => {
  const s = field(fighter(STR16), { foes: 2 });
  ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
  const [g1, g2] = s.foes.map((id) => s.entities[id]);
  s.entities.hero.cond.grappled = { source: g1.id, holds: [{ by: g1.id, with: "hand", escape: 12, range: 5 }] };
  g2.attacks = [{ id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 4, damage: "+1", dtype: "bludgeoning", reach: 5, abil: "str", dc: 12 }];
  fails(s.entities.hero);
  turnOf(s, g2.id);
  g2.hidden = true;
  const r = ok(apply(s, { ...GRAB, actor: g2.id, target: "hero" }, DM));
  assert.ok(r.events.some((e) => e.type === "hold" && e.by === g2.id), "the DM has who");
  const seen = viewEvents(r.events, s, U1);
  assert.deepEqual(seen.find((e) => e.type === "hold"), { type: "hold", id: "hero" });
  assert.ok(!JSON.stringify(seen).includes(g2.id));
});

test("the grappler pushed away ends the hold; the other grappler's stays", () => {
  const s = field(fighter(STR16), { ally: fighter(STR16) });
  ok(grapple(s));
  turnOf(s, "ally");
  ok(apply(s, { ...GRAB, actor: "ally", target: s.foe }, DM));
  fails(s.entities.hero);
  const r = ok(apply(s, { type: "attack", actor: "ally", attack: "unarmed-strike", option: "shove", shove: "push", target: "hero" }, DM));
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "hero"));
  assert.ok(r.events.some((e) => e.type === "holdEnd" && e.by === "hero" && e.why === "distance"), r.events.map((e) => e.type).join());
  assert.deepEqual(s.entities[s.foe].cond.grappled.holds.map((h) => h.by), ["ally"]);
});

test("the grappler leaving the map ends its hold only (gone)", () => {
  const s = field(fighter(STR16), { fight: false, ally: fighter(STR16) });
  s.entities[s.foe].cond.grappled = { source: "hero", holds: [HOLD, { ...HOLD, by: "ally" }] };
  const r = ok(apply(s, { type: "remove", actor: "hero" }, DM));
  assert.ok(r.events.some((e) => e.type === "holdEnd" && e.by === "hero" && e.why === "gone"));
  assert.deepEqual(s.entities[s.foe].cond.grappled, { source: "ally", holds: [{ ...HOLD, by: "ally" }] });
});

test("hands: two holds take both, a third is refused; a Shield takes one; a greatsword or a Versatile two-handed attack is refused while holding", () => {
  const s = field(fighter(STR16), { foes: 3 });
  ok(grapple(s, s.foes[0]));
  ok(grapple(s, s.foes[1]));
  refused(s, { ...GRAB, target: s.foes[2] }, /no hand free/);
  ok(apply(s, { type: "letGo", actor: "hero", target: s.foes[0] }, DM));
  assert.equal(s.entities[s.foes[0]].cond.grappled, undefined);
  const t = field(fighter(STR16, ["longsword"], { shield: true }), { foes: 2 });
  assert.ok(t.entities.hero.shield);
  ok(grapple(t, t.foes[0]));
  refused(t, { ...GRAB, target: t.foes[1] }, /no hand free.*Shield/);
  const g = field(fighter(STR16, ["greatsword", "longsword"]));
  ok(grapple(g));
  refused(g, { type: "attack", actor: "hero", attack: "greatsword", target: g.foe }, /both hands.*holding/);
  refused(g, { type: "attack", actor: "hero", attack: "longsword-two-handed", target: g.foe }, /both hands.*holding/);
  ok(apply(g, { type: "attack", actor: "hero", attack: "longsword", target: g.foe }, DM));
  ok(apply(g, { type: "letGo", actor: "hero", target: g.foe }, DM));
  ok(apply(g, { type: "endTurn", actor: "hero" }, DM));
  turnOf(g, "hero");
  ok(apply(g, { type: "attack", actor: "hero", attack: "greatsword", target: g.foe }, DM));
});

test("Grappled: Disadvantage on attack rolls against anyone but the grappler; the Grappler feat's Advantage against a creature it holds", () => {
  const s = field(fighter(STR16, [], GRAPPLER), { ally: fighter(STR16) });
  ok(grapple(s));
  const foe = s.entities[s.foe], bite = { type: "melee", bonus: 4, range: [5, 5] };
  assert.deepEqual(rollMode(s, foe, s.entities.hero, bite).dis, []);
  assert.deepEqual(rollMode(s, foe, s.entities.ally, bite).dis, ["attacker grappled"]);
  const fist = s.entities.hero.attacks.find((a) => a.id === "unarmed-strike");
  assert.deepEqual(rollMode(s, s.entities.hero, foe, fist).adv, ["Grappler"]);
  assert.deepEqual(rollMode(s, s.entities.ally, foe, s.entities.ally.attacks.find((a) => a.id === "unarmed-strike")).adv, [], "only the grappler's own");
  // A Grappled condition with no holds (the DM's, or a monster action's with only a `source`): as before holds, the DM applies it
  // (the condition's `also` says so), and the engine gives nothing (fix round 1 of #468, M2).
  foe.cond.grappled = {};
  assert.deepEqual(rollMode(s, foe, s.entities.ally, bite).dis, []);
  foe.cond.grappled = { source: "hero" };
  assert.deepEqual(rollMode(s, foe, s.entities.ally, bite).dis, []);
  assert.deepEqual(rollMode(s, s.entities.hero, foe, fist).adv, [], "nor the Grappler's Advantage");
});

test("Punch and Grab: a hit with the Damage option grapples too, once a turn, from the Attack action only, and only for the Grappler", () => {
  const s = field(fighter(STR16, [], GRAPPLER), { foes: 2 });
  const hit = (target, more = {}) => apply(s, { type: "attack", actor: "hero", attack: "unarmed-strike", target, grab: true, ...more }, DM);
  s.entities[s.foes[0]].ac = 99;
  const miss = ok(hit(s.foes[0]));
  assert.equal(miss.events.find((e) => e.type === "attack").hit, false);
  assert.equal(s.entities[s.foes[0]].cond.grappled, undefined);
  assert.ok(!s.encounter.flags["grab:hero"], "a miss does not use it");
  const r = ok(hit(s.foes[1]));
  const types = r.events.map((e) => e.type);
  assert.ok(types.indexOf("attack") < types.indexOf("damage") && types.indexOf("damage") < types.indexOf("strikeOption") && types.indexOf("strikeOption") < types.indexOf("save"), types.join());
  assert.deepEqual(s.entities[s.foes[1]].cond.grappled, { source: "hero", holds: [HOLD] }, "Strength 17 with the feat: 8 + 3 + 3");
  ok(apply(s, { type: "feature", actor: "hero", feature: "action-surge" }, DM));
  s.entities[s.foes[0]].ac = 1;
  refused(s, { type: "attack", actor: "hero", attack: "unarmed-strike", target: s.foes[0], grab: true }, /once a turn/);
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  refused(s, { type: "attack", actor: "hero", attack: "unarmed-strike", target: s.foes[0], grab: true, option: "grapple" }, /Damage option/);
  refused(s, { type: "attack", actor: "hero", attack: "unarmed-strike", target: s.foes[0], grab: "yes" }, /grab: true/);
  ok(hit(s.foes[0]));
  assert.ok(s.entities[s.foes[0]].cond.grappled, "a new turn, a new grab");
  const t = field(fighter(STR16));
  refused(t, { type: "attack", actor: "hero", attack: "unarmed-strike", target: t.foe, grab: true }, /Grappler feat/);
});

test("an old save's Grappled with no holds is left alone by the after-pass, and escaping it is refused", () => {
  const s = field(fighter(STR16));
  const foe = s.entities[s.foe];
  foe.cond.grappled = { source: "hero" };
  ok(apply(s, { type: "place", actor: s.foe, to: { q: 6, r: 0 } }, DM));
  assert.deepEqual(foe.cond.grappled, { source: "hero" });
  turnOf(s, s.foe);
  refused(s, { type: "escape", actor: s.foe }, /no escape DC in the game; the DM ends it/);
  // A Grapple on it: the DM's grapple is not taken over, and the DM is told.
  const t = field(fighter(STR16));
  t.entities[t.foe].cond.grappled = {};
  const r = ok(grapple(t));
  assert.deepEqual(t.entities[t.foe].cond.grappled, {});
  assert.ok(r.events.some((e) => e.type === "manual" && /the engine does not keep/.test(e.text)));
});

test("what a player is sent: `heldBy` on the held creature, a monster's escape DC never, the party's own escape DC", () => {
  const s = field(fighter(STR16), { ally: fighter(STR16) });
  ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
  ok(grapple(s));
  let v = view(s, U1);
  assert.deepEqual(v.entities[s.foe].heldBy, ["hero"], "a goblin they see");
  assert.deepEqual(v.entities[s.foe].cond, { grappled: true });
  // The hero held by the goblin (a monster's grapple, as G4 will put on), and the ally held by the hero.
  s.entities.hero.cond.grappled = { source: s.foe, holds: [{ by: s.foe, with: "bite", escape: 13, range: 5, escapeDis: true }] };
  s.entities.ally.cond.grappled = { source: "hero", holds: [HOLD] };
  v = view(s, U1);
  assert.deepEqual(v.entities.hero.heldBy, [s.foe]);
  assert.deepEqual(v.entities.hero.cond.grappled.holds, [{ by: s.foe, with: "bite", range: 5 }], "no monster number");
  assert.equal(v.entities.ally.cond.grappled.holds[0].escape, 14, "the party's own number");
  assert.ok(!JSON.stringify(v).includes('"escape":13'));
  // The escape check: the total and the result, the DC only for the party's own grapple.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  s.entities.hero.skillBonus = { athletics: 40 };
  const r = ok(apply(s, { type: "escape", actor: "hero" }, DM));
  const ck = viewEvents(r.events, s, U1).find((e) => e.type === "check");
  assert.equal(ck.dc, undefined); assert.equal(ck.success, true); assert.equal(typeof ck.total, "number");
  turnOf(s, "ally");
  s.entities.ally.skillBonus = { athletics: 40 };
  const q = ok(apply(s, { type: "escape", actor: "ally" }, DM));
  assert.equal(viewEvents(q.events, s, U1).find((e) => e.type === "check").dc, 14);
  // A grappler they do not know of is 'someone', in the view and in the events.
  s.entities.ally.cond.grappled = { source: s.foe, holds: [{ by: s.foe, with: "bite", escape: 13, range: 5 }] };
  s.entities[s.foe].hidden = true;
  v = view(s, U1);
  assert.deepEqual(v.entities.ally.heldBy, ["someone"]);
  assert.ok(!JSON.stringify(v).includes(s.foe));
  const l = ok(apply(s, { type: "letGo", actor: s.foe, target: "ally" }, DM));
  const seen = viewEvents(l.events, s, U1);
  assert.deepEqual(seen.find((e) => e.type === "condEnd"), { type: "condEnd", id: "ally", cond: "grappled", why: "released" });
});

test("the Grappled condition's data: the Disadvantage is a modifier for holds and `also` is as before; the Grappler feat gives the Advantage", () => {
  const g = CONTENT.conditions.grappled;
  assert.deepEqual(g.modifiers[1], { on: "attack.roll", op: "disadvantage", when: ["target.notGrappler"] });
  // Kept word for word as before holds (fix round 1 of #468, M2): a Grappled condition with no holds is the DM's to apply.
  assert.equal(g.also, "It has Disadvantage on attack rolls against anyone but its grappler. The grappler can drag or carry it, but each foot of that movement costs the grappler 1 extra foot unless the grappled creature is Tiny or two or more sizes smaller.");
  assert.deepEqual(CONTENT.feats.grappler.grants.modifiers, [{ on: "attack.roll", op: "advantage", when: ["target.grappledBySelf"] }]);
});

test("the same seed gives the same grapple, and a Monk's Flurry strike may grapple", () => {
  const run = () => { const s = field(fighter(STR16)); s.entities[s.foe].saveBonus = { str: 0, dex: 0 }; return JSON.stringify(grapple(s).events); };
  assert.equal(run(), run());
  const monk = { name: "Mo", class: "monk", level: 5, subclass: "open-hand", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, skills: ["acrobatics", "insight"], weapons: [] };
  const s = field(monk);
  ok(apply(s, { type: "feature", actor: "hero", feature: "flurry-of-blows" }, DM));
  ok(grapple(s));
  assert.equal(s.entities[s.foe].cond.grappled.holds[0].escape, 14, "Dexterous Attacks: the DC from Dexterity");
  assert.equal(s.encounter.budget.bonusAttacks.left, 1);
});

test("a Grappled condition the DM puts on is as before holds: the DM is told the Disadvantage, and the engine applies none (M2)", () => {
  const s = field(fighter(STR16));
  const foe = s.entities[s.foe];
  const r = ok(apply(s, { type: "condition", actor: s.foe, condition: "grappled", on: true }, DM));
  const m = r.events.find((e) => e.type === "manual");
  // The text main sent before G2, word for word.
  assert.equal(m.text, `${foe.name} is Grappled. The engine applies what it can; the DM applies the rest: It has Disadvantage on attack rolls against anyone but its grappler. The grappler can drag or carry it, but each foot of that movement costs the grappler 1 extra foot unless the grappled creature is Tiny or two or more sizes smaller. Nothing ends it yet: the DM removes it.`);
  turnOf(s, s.foe);
  const atk = ok(apply(s, { type: "act", actor: s.foe, action: foe.actions.find((x) => !x.multiattack && x.target?.creature).id, target: "hero" }, DM)).events.find((e) => e.type === "attack");
  assert.equal(atk.mode, "normal");
  // A hold the engine keeps is told nothing of the sort: it applies the Disadvantage itself.
  const t = field(fighter(STR16));
  const g = ok(grapple(t));
  assert.ok(!g.events.some((e) => e.type === "manual"), g.events.filter((e) => e.type === "manual").map((e) => e.text).join());
});

// ---------- stage G6: Grapple as an Opportunity Attack (issue #482; docs/specs/grapple-shove.md, Decision 10, Q1) ----------
// SRD "Opportunity Attacks": "make one melee attack with a weapon or an Unarmed Strike" when a creature leaves your reach; the Grapple option
// is an option of the Unarmed Strike, and a Grappled creature has Speed 0, so a mover grappled by it goes no further.
// A hold put on directly, so the test does not depend on a save.
const hold = (s, id, by) => { (s.entities[id].cond.grappled ??= { source: by, holds: [] }).holds.push({ by, with: "hand", escape: 14, range: 5 }); };
// The hero is Ann's and asks about its Opportunity Attack; a fight is on and it is the goblin's turn. Returns the state and the move away.
function leaving(sheet = fighter(STR16), { when = "ask", foes = 1, size = null } = {}) {
  const s = field(sheet, { foes });
  ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
  if (when) ok(apply(s, { type: "reactions", actor: "hero", set: { [OPPORTUNITY]: when } }, U1));
  if (size) s.entities[s.foe].size = size;
  turnOf(s, s.foe);
  return { s, away: { type: "move", actor: s.foe, to: { q: 3, r: 0 } } };
}
const react = (s, take, ctx = U1) => apply(s, { type: "react", prompt: s.pending?.n, take }, ctx);

test("G6: a creature that asks is offered Grapple instead as a third answer, and taking it stops the mover where it was with Speed 0 applied at once", () => {
  const { s, away } = leaving();
  const from = structuredClone(s.entities[s.foe].pos), move = s.encounter.budget.move;
  const r = ok(apply(s, away, DM));
  const asked = r.events.find((e) => e.type === "reactionAsked");
  assert.ok(asked, "Ann is asked");
  assert.deepEqual(asked.ask.options, [{ reaction: OPPORTUNITY, name: "Opportunity Attack" }, { reaction: OPPORTUNITY_GRAPPLE, name: "Grapple instead" }]);
  assert.deepEqual(view(s, U1).prompt.options.map((o) => o.reaction), [OPPORTUNITY, OPPORTUNITY_GRAPPLE], "and she is sent it");
  const t = react(s, OPPORTUNITY_GRAPPLE);
  ok(t);
  const types = t.events.map((e) => e.type);
  assert.ok(!types.includes("attack"), "no attack roll: the Grapple option takes the place of the damage");
  assert.ok(!types.includes("moved"), "the mover did not move");
  assert.ok(types.indexOf("reaction") < types.indexOf("strikeOption") && types.indexOf("strikeOption") < types.indexOf("save") && types.indexOf("save") < types.indexOf("cond"), types.join());
  const foe = s.entities[s.foe];
  assert.deepEqual(foe.pos, from, "stopped where it was");
  assert.deepEqual(foe.cond.grappled, { source: "hero", holds: [HOLD] });
  assert.equal(speedOf(s, foe), 0);
  assert.equal(s.entities.hero.reactionUsed, true, "it cost the Reaction");
  assert.equal(s.encounter.budget.move, move, "and none of the mover's movement");
  assert.ok(t.events.some((e) => e.type === "note" && /can't go on/.test(e.text)));
  const seen = viewEvents(t.events, s, U1).map((e) => e.type);
  assert.ok(seen.includes("strikeOption") && seen.includes("cond"));
  // Move again: Speed 0.
  refused(s, away, /Speed is 0/);
});

test("G6: taking the damage instead, or a save that succeeds, leaves the mover walking on as before", () => {
  const a = leaving();
  ok(apply(a.s, a.away, DM));
  const dmg = ok(react(a.s, OPPORTUNITY));
  assert.ok(dmg.events.some((e) => e.type === "attack" && e.actor === "hero"));
  assert.deepEqual(a.s.entities[a.s.foe].pos, { q: 3, r: 0, z: 0 }, "it walked on");
  const b = leaving();
  resists(b.s.entities[b.s.foe]);
  ok(apply(b.s, b.away, DM));
  const r = ok(react(b.s, OPPORTUNITY_GRAPPLE));
  assert.ok(r.events.some((e) => e.type === "save" && e.success === true));
  assert.equal(b.s.entities[b.s.foe].cond.grappled, undefined);
  assert.deepEqual(b.s.entities[b.s.foe].pos, { q: 3, r: 0, z: 0 }, "the save held: it walks on");
  assert.equal(b.s.entities.hero.reactionUsed, true, "the Reaction is spent either way");
});

test("G6: it is offered only when asking, and only where the engine would take it", () => {
  const goblin = (s) => s.entities[s.foe];
  // Always: the damage, no question, as before. Never: nothing.
  for (const when of ["always", "never"]) {
    const { s, away } = leaving(fighter(STR16), { when });
    const r = ok(apply(s, away, DM));
    assert.ok(!r.events.some((e) => e.type === "reactionAsked"));
    assert.ok(!r.events.some((e) => e.type === "strikeOption"));
    assert.equal(r.events.some((e) => e.type === "attack" && e.actor === "hero"), when === "always");
  }
  const offered = (s) => (ok(apply(s, { type: "move", actor: s.foe, to: { q: 3, r: 0 } }, DM)).events.find((e) => e.type === "reactionAsked")?.ask.options.map((o) => o.reaction) ?? []);
  // Two sizes larger: refused by the engine, so not offered.
  assert.deepEqual(offered(leaving(fighter(STR16), { size: "huge" }).s), [OPPORTUNITY]);
  assert.deepEqual(offered(leaving(fighter(STR16), { size: "large" }).s), [OPPORTUNITY, OPPORTUNITY_GRAPPLE]);
  // No hand free: a Shield and a hold take both.
  const full = leaving(fighter(STR16, [], { shield: true }), { foes: 1 });
  assert.equal(grappleInstead(full.s, full.s.entities.hero, goblin(full.s))?.id, "unarmed-strike", "a Shield takes one hand");
  const other = ok(apply(full.s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: -1 } }, DM)).events.find((e) => e.type === "spawned").id;
  hold(full.s, other, "hero");
  full.s.entities.hero.shield = { name: "Shield", ac: 2 };
  assert.equal(grappleInstead(full.s, full.s.entities.hero, goblin(full.s)), null, "a Shield and a hold: no hand free");
  // Already held by it, a dead target, and a creature that plays from actions (no Unarmed Strike).
  hold(full.s, full.s.foe, "hero");
  assert.equal(grappleInstead(full.s, full.s.entities.hero, goblin(full.s)), null);
  assert.equal(grappleInstead(full.s, goblin(full.s), full.s.entities.hero), null, "a pack monster has no Unarmed Strike");
});

test("G6: the same mover with a Reaction already spent is asked nothing; the answer to a question that is not offered is refused", () => {
  const { s, away } = leaving(fighter(STR16), { size: "huge" });
  ok(apply(s, away, DM));
  const before = JSON.stringify(s);
  const r = react(s, OPPORTUNITY_GRAPPLE);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s), before, "a refusal changes nothing");
});

test("G6, DEBT T74: a monster's Opportunity Attack that grapples stops the mover where it was, as the Grapple option does", () => {
  // An ankheg (Large; its Bite grapples a Large or smaller creature, escape DC 13) beside the hero, who walks away.
  for (let seed = 1; seed < 60; seed++) {
    const s = newGame(seed);
    for (const id of Object.keys(s.entities)) delete s.entities[id];
    for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
    s.settings.autoEngage = false;
    s.entities.hero = makeEntity(derive(fighter(STR16)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
    const g = ok(apply(s, { type: "spawn", monster: "ankheg", at: { q: 1, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
    Object.assign(s.entities[g], { hp: 900, maxHp: 900 });
    s.entities.hero.hp = s.entities.hero.maxHp = 900; s.entities.hero.ac = 1;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    turnOf(s, "hero");
    const r = apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, DM);
    if (!r.ok || !r.events.some((e) => e.type === "cond" && e.cond === "grappled")) continue;
    assert.deepEqual(s.entities.hero.pos, { q: 0, r: 0, z: 0 }, "stopped where it was");
    assert.equal(s.entities.hero.cond.grappled.holds[0].by, g);
    assert.ok(!r.events.some((e) => e.type === "moved"), "no step was taken");
    assert.ok(r.events.some((e) => e.type === "note" && /can't go on/.test(e.text)));
    assert.ok(s.encounter.budget.move > 0, "its movement is not spent either");
    return;
  }
  assert.fail("no seed made the Bite hit");
});

test("a condition two grapplers share (`whileHeld`) keeps as `source` one that still holds, when the first lets go or is Incapacitated (the Low of #481's review)", () => {
  const s = field(fighter(STR16), { ally: fighter(STR16) });
  const t = s.entities[s.foe];
  t.cond.grappled = { source: "hero", holds: [{ by: "hero", with: "hand", escape: 14, range: 5 }, { by: "ally", with: "hand", escape: 14, range: 5 }] };
  t.cond.restrained = { source: "hero", grapples: ["hero", "ally"] };
  ok(apply(s, { type: "letGo", actor: "hero", target: s.foe }, DM));
  assert.deepEqual(t.cond.restrained, { source: "ally", grapples: ["ally"] });
  assert.equal(t.cond.grappled.source, "ally");
  // settleHolds: the first of three is knocked out; the condition's source moves to the next that holds.
  const u = field(fighter(STR16), { ally: fighter(STR16) });
  const x = u.entities[u.foe];
  x.cond.grappled = { source: "hero", holds: [{ by: "hero", with: "hand", escape: 14, range: 5 }, { by: "ally", with: "hand", escape: 14, range: 5 }] };
  x.cond.restrained = { source: "hero", grapples: ["hero", "ally"] };
  ok(apply(u, { type: "condition", actor: "hero", condition: "unconscious", on: true }, DM));
  assert.deepEqual(x.cond.restrained, { source: "ally", grapples: ["ally"] });
});
