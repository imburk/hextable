// Dispel Magic, job 5 of issue #726. SRD 5.2.1: "Choose one creature, object, or magical effect within range. Any ongoing spell of level 3
// or lower on the target ends. For each ongoing spell of level 4 or higher on the target, make an ability check using your spellcasting
// ability (DC 10 plus that spell's level). On a successful check, the spell ends. Using a Higher-Level Spell Slot. You automatically end a
// spell on the target if the spell's level is equal to or less than the level of the spell slot you use." It is a `dispel` step, and a
// spell's lasting effect keeps the level it was cast at (docs/specs/rules-expansion.md, "Build notes: Dispel Magic").
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { dispel } from "../src/engine/rolls.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const wizard = { name: "Wyn", class: "wizard", level: 13, subclass: "evoker", abilities: { str: 10, dex: 14, con: 12, int: 18, wis: 12, cha: 10 }, skills: ["arcana", "history"],
  spells: ["dispel-magic", "hold-person", "mage-armor", "light", "haste", "bless", "death-ward", "fire-bolt"] };
const cleric = { name: "Pia", class: "cleric", level: 13, subclass: "life", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 18, cha: 10 }, skills: ["insight", "medicine"], spells: ["death-ward", "bless", "hold-person", "heroism"] };

// Wyn the wizard (Pat's) and Pia the cleric on open grass, the valley's fighter beside them, and a bandit 10 feet off.
function table(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.settings.strikeFirst = "all";
  for (const [id, sheet, q] of [["wyn", wizard, 0], ["pia", cleric, -1]]) {
    s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q, r: 0, z: 0 } });
    s.entities[id].sheet = structuredClone(sheet);
  }
  s.entities.fighter.pos = { q: -1, r: 1, z: 0 };
  const b = ok(apply(s, { type: "spawn", monster: "bandit", at: { q: 2, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[b], { hp: 500, maxHp: 500 });
  return { s, b };
}
const cast = (s, actor, spell, more) => apply(s, { type: "cast", actor, spell, ...more }, DM);
const fxOf = (s, spell) => s.effects.find((x) => x.spell === spell);
const turnOf = (s, id) => { for (let i = 0; s.encounter && i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };
const dispelAt = (s, target, slot) => { if (s.encounter && current(s) === "wyn" && s.encounter.budget.action === 0) ok(apply(s, { type: "endTurn", actor: "wyn" }, DM)); turnOf(s, "wyn"); return ok(cast(s, "wyn", "dispel-magic", { target, ...(slot ? { slot } : {}) })); };

test("the entry: a dispel step, assist, and the linter holds its two numbers", () => {
  const def = SPELLS["dispel-magic"].def;
  assert.deepEqual(def.effects, [{ dispel: 3, dc: 10 }]);
  assert.equal(def.tier, "assist");
  assert.deepEqual(lintEntry("spells", def, { strict: false }), []);
  const lint = (step) => lintEntry("spells", { ...structuredClone(def), effects: [step] }, { strict: false });
  for (const bad of [{ dispel: true, dc: 10 }, { dispel: 3 }, { dispel: 10, dc: 10 }, { dispel: 3, dc: 0 }, { dispel: -1, dc: 10 }]) assert.ok(lint(bad).some((p) => /dispel/.test(p)), json(bad));
});

test("a lasting spell keeps the level it was cast at: the slot's, the spell's own, 0 for a cantrip", () => {
  const { s, b } = table();
  ok(cast(s, "wyn", "light", { target: "wyn" }));
  ok(cast(s, "wyn", "mage-armor", { target: "wyn" }));
  ok(cast(s, "pia", "bless", { targets: ["pia", "fighter", "wyn"], slot: 4 }));
  assert.equal(fxOf(s, "light").level, 0);
  assert.equal(fxOf(s, "mage-armor").level, 1);
  assert.equal(fxOf(s, "bless").level, 4);
  void b;
  // It is the DM's and the engine's to know: a player's view of an effect has no level.
  const mine = view(s, PAT).effects;
  assert.ok(mine.length >= 3);
  for (const fx of mine) assert.equal(fx.level, undefined);
});

test("spells of level 3 or lower on the target end, each whole; a slot is spent; what is not a spell stays", () => {
  let held = 0;
  for (let seed = 1; seed <= 20 && !held; seed++) {
    const { s, b } = table(seed);
    ok(cast(s, "pia", "hold-person", { target: b }));
    if (!s.entities[b].cond.paralyzed) continue;
    held++;
    const slots = s.entities.wyn.slots[3];
    const r = dispelAt(s, b);
    assert.equal(s.entities[b].cond.paralyzed, undefined, "Hold Person ended");
    assert.equal(fxOf(s, "hold-person"), undefined);
    assert.equal(s.entities.wyn.slots[3], slots - 1);
    assert.ok(r.events.some((e) => e.type === "effectEnd" && e.name === "Hold Person" && e.why === "it was dispelled"));
    assert.ok(r.events.some((e) => e.type === "note" && e.id === b && e.text === "Dispel Magic: 1 spell ends"));
    assert.ok(!r.events.some((e) => e.type === "check"), "no check for a level 2 spell");
  }
  assert.ok(held, "some bandit was held");
  // Three spells on Wyn (a cantrip, level 1, and Bless on three creatures): all end, and Bless ends on the others too.
  const { s } = table();
  ok(cast(s, "wyn", "light", { target: "wyn" }));
  ok(cast(s, "wyn", "mage-armor", { target: "wyn" }));
  ok(cast(s, "pia", "bless", { targets: ["pia", "fighter", "wyn"] }));
  const r = dispelAt(s, "wyn");
  assert.deepEqual(s.effects, []);
  assert.equal(s.entities.wyn.light, undefined);
  assert.ok(r.events.some((e) => e.type === "note" && e.text === "Dispel Magic: 3 spells end"));
  assert.deepEqual(r.events.find((e) => e.type === "effectEnd" && e.name === "Bless").targets.sort(), ["fighter", "pia", "wyn"]);
});

test("nothing on the target: the slot is spent and the table is told no spell ends", () => {
  const { s } = table();
  const slots = s.entities.wyn.slots[3];
  const r = dispelAt(s, "fighter");
  assert.equal(s.entities.wyn.slots[3], slots - 1);
  assert.deepEqual(r.events.filter((e) => e.type === "note").map((e) => e.text), ["Dispel Magic: no spell ends"]);
});

test("a spell of level 4 or higher: a check with the spellcasting ability against DC 10 plus its level, and it ends on a success", () => {
  const seen = { yes: 0, no: 0 };
  for (let seed = 1; seed <= 40 && !(seen.yes && seen.no); seed++) {
    const { s } = table(seed);
    ok(cast(s, "pia", "death-ward", { target: "fighter" }));
    ok(cast(s, "wyn", "mage-armor", { target: "fighter" }), "a level 1 spell beside it");
    const r = dispelAt(s, "fighter");
    const checks = r.events.filter((e) => e.type === "check");
    assert.equal(checks.length, 1, "one check, for the level 4 spell only");
    const c = checks[0];
    assert.deepEqual([c.id, c.ability, c.dc, c.bonus, c.what], ["wyn", "int", 14, 4, "Dispel Magic"], "Intelligence 18, no Proficiency Bonus");
    assert.equal(c.success, c.total >= 14);
    assert.equal(!!fxOf(s, "death-ward"), !c.success);
    assert.equal(fxOf(s, "mage-armor"), undefined, "the level 1 spell ends either way");
    assert.ok(r.events.some((e) => e.type === "note" && e.text === `Dispel Magic: ${c.success ? "2 spells end" : "1 spell ends"}`));
    // The caster's player is sent the roll and not the DC.
    const mine = viewEvents(r.events, s, PAT).find((e) => e.type === "check");
    assert.equal(mine.dc, undefined);
    assert.equal(mine.total, c.total);
    seen[c.success ? "yes" : "no"]++;
  }
  assert.ok(seen.yes && seen.no, "both outcomes were seen");
});

test("a higher slot ends spells up to its level outright, and a spell cast with a higher slot counts at that level", () => {
  const { s } = table();
  ok(cast(s, "pia", "death-ward", { target: "fighter" }));
  const r = dispelAt(s, "fighter", 4);
  assert.ok(!r.events.some((e) => e.type === "check"));
  assert.equal(fxOf(s, "death-ward"), undefined);
  // Bless cast with a level 5 slot: a level 3 Dispel Magic rolls against DC 15, a level 5 one ends it.
  const t2 = table();
  ok(cast(t2.s, "pia", "bless", { targets: ["pia", "fighter"], slot: 5 }));
  const r2 = dispelAt(t2.s, "fighter");
  assert.equal(r2.events.find((e) => e.type === "check").dc, 15);
  const t3 = table();
  ok(cast(t3.s, "pia", "bless", { targets: ["pia", "fighter"], slot: 5 }));
  const r3 = dispelAt(t3.s, "fighter", 5);
  assert.ok(!r3.events.some((e) => e.type === "check"));
  assert.equal(fxOf(t3.s, "bless"), undefined);
});

test("a spell on another creature is not touched, nor one its caster only concentrates on", () => {
  const { s } = table();
  ok(cast(s, "pia", "bless", { targets: ["fighter"] }));
  dispelAt(s, "wyn");
  dispelAt(s, "pia");                                    // Pia concentrates on Bless; it is on the fighter, not on her
  assert.ok(fxOf(s, "bless"));
  dispelAt(s, "fighter");
  assert.equal(fxOf(s, "bless"), undefined);
});

test("a spell the DM applies (no part put on anyone) is on those it was aimed at; one that took hold on another is not on a creature that saved", () => {
  // Heroism is `manual`: the engine times it and puts nothing on its target.
  assert.equal(SPELLS.heroism.def.tier, "manual", "if Heroism is built, use another manual spell that lasts here");
  const { s } = table();
  ok(cast(s, "pia", "heroism", { target: "fighter" }));
  assert.deepEqual(fxOf(s, "heroism").aimed, ["fighter"]);
  assert.deepEqual(fxOf(s, "heroism").parts, []);
  dispelAt(s, "wyn");
  assert.ok(fxOf(s, "heroism"), "not on Wyn");
  const r = dispelAt(s, "fighter");
  assert.equal(fxOf(s, "heroism"), undefined);
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.name === "Heroism"));
  // Hold Person at two bandits with a level 3 slot: where one saved and one did not, the spell is on the held one only.
  let split = 0;
  for (let seed = 1; seed <= 60 && !split; seed++) {
    const t2 = table(seed), s2 = t2.s;
    const b2 = ok(apply(s2, { type: "spawn", monster: "bandit", at: { q: 2, r: 1 } }, DM)).events[0].id;
    Object.assign(s2.entities[b2], { hp: 500, maxHp: 500 });
    ok(cast(s2, "pia", "hold-person", { targets: [t2.b, b2], slot: 3 }));
    const held = [t2.b, b2].filter((id) => s2.entities[id].cond.paralyzed);
    if (held.length !== 1) continue;
    split++;
    const free = [t2.b, b2].find((id) => id !== held[0]);
    assert.deepEqual(fxOf(s2, "hold-person").aimed.sort(), [t2.b, b2].sort());
    dispelAt(s2, free);
    assert.ok(s2.entities[held[0]].cond.paralyzed, "Dispel Magic on the one that saved ends nothing");
    dispelAt(s2, held[0]);
    assert.equal(s2.entities[held[0]].cond.paralyzed, undefined);
  }
  assert.ok(split, "some cast held one bandit and not the other");
});

test("a feature's effect is no spell: Rage stays", () => {
  const { s } = table();
  s.effects.push({ id: "fxr", name: "Rage", spell: null, feature: "rage", source: "fighter", conc: false, lasts: "10 minutes", parts: [{ target: "fighter", modifier: { on: "damage.dealt", op: "add", value: 2 } }], until: { clock: s.clock + 10 } });
  const r = dispelAt(s, "fighter");
  assert.equal(s.effects.length, 1);
  assert.ok(r.events.some((e) => e.type === "note" && e.text === "Dispel Magic: no spell ends"));
});

test("a caster whose spellcasting ability the engine does not know: the check is handed to the DM", () => {
  const { s, b } = table();
  ok(cast(s, "pia", "death-ward", { target: "fighter" }));
  const ev = [];
  dispel(s, s.entities.fighter, { dispel: 3, dc: 10 }, ev, { actor: b, src: { name: "Unravel" } });
  assert.ok(fxOf(s, "death-ward"), "left for the DM");
  assert.ok(ev.some((e) => e.type === "manual" && /DC 14/.test(e.text) && /Death Ward/.test(e.text)));
});

test("a table saved before version 31: its spell effects get the spell's own level", () => {
  assert.equal(VERSION, 31);
  const { s } = table();
  ok(cast(s, "pia", "death-ward", { target: "fighter" }));
  ok(cast(s, "pia", "bless", { targets: ["pia"], slot: 3 }));
  const old = structuredClone(s);
  old.version = 30;
  for (const fx of old.effects) delete fx.level;
  old.effects.push({ id: "fxh", name: "Homebrew Hex", spell: "hb-not-in-the-pack", source: "pia", conc: false, lasts: "1 hour", parts: [], until: null });
  migrate(old);
  assert.equal(old.version, 31);
  assert.deepEqual(old.effects.map((fx) => fx.level), [4, 1, undefined], "the slot Bless was cast with is not known: its own level");
});

test("undo, redo and a replay give the same state", () => {
  const { s } = table();
  const acts = [{ type: "cast", actor: "pia", spell: "death-ward", target: "fighter" }, { type: "cast", actor: "wyn", spell: "mage-armor", target: "fighter" },
    { type: "cast", actor: "wyn", spell: "dispel-magic", target: "fighter" }, { type: "cast", actor: "wyn", spell: "dispel-magic", target: "fighter", slot: 5 }];
  const start = json(s), h = createHistory();
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); }
  const end = json(s);
  for (let i = 0; i < acts.length; i++) h.undo(s);
  assert.equal(json(s), start, "undo");
  for (let i = 0; i < acts.length; i++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
});
