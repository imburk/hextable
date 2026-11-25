// Heroism and Regenerate, job 2 of issue #726 (DEBT "a turn-start trigger outside a zone"). SRD 5.2.1, Heroism: "A willing creature you touch is imbued with
// bravery. Until the spell ends, the creature is immune to the Frightened condition and gains Temporary Hit Points equal to your spellcasting ability modifier
// at the start of each of its turns." Regenerate: "A creature you touch regains 4d8 + 15 Hit Points. For the duration, the target regains 1 Hit Point at the start
// of each of its turns, and any severed body parts regrow after 2 minutes." A step `eachTurn` and a modifier on the hook `condition`
// (docs/specs/rules-expansion.md, "Build notes: Heroism and Regenerate").
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { condition } from "../src/engine/rolls.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { playerView } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const bard = { name: "Bo", class: "bard", level: 13, subclass: "lore", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["persuasion", "performance", "insight"], spells: ["heroism", "regenerate", "bless"] };

// A bard of level 13 (Pat's; Charisma 18, so +4) on open grass beside the valley's fighter, with a goblin a few hexes off.
function table(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.entities.bo = makeEntity(derive(bard).record, { id: "bo", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities.bo.sheet = structuredClone(bard);
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 0 } }, DM)).events[0].id;
  return { s, g };
}
const cast = (s, spell, extra) => ok(apply(s, { type: "cast", actor: "bo", spell, ...extra }, DM));
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
// End turns until it is `id`'s turn, returning every event on the way (the start of that turn included).
function until(s, id, guard = 40) {
  const out = [];
  for (let i = 0; i < guard && current(s) !== id; i++) out.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(current(s), id);
  return out;
}
// One whole round: to `id`'s turn, through it, and round to its next turn start (the events are those of that start).
const round = (s, id) => { until(s, id); ok(apply(s, { type: "endTurn", actor: id }, DM)); return until(s, id); };
const live = (s, spell) => s.effects.find((fx) => fx.spell === spell);

test("the entries: Heroism is auto, Regenerate is assist, and the linter takes the new steps", () => {
  const h = SPELLS.heroism.def, r = SPELLS.regenerate.def;
  assert.deepEqual(h.effects, [{ modifier: { on: "condition", op: "immune", scope: { condition: "frightened" } } }, { eachTurn: [{ tempHp: "+0", addMod: true }] }]);
  assert.equal(h.tier, "auto");
  assert.equal(r.tier, "assist");
  assert.ok(r.effects.some((x) => "manual" in x), "the limbs are the DM's");
  for (const d of [h, r]) assert.deepEqual(lintEntry("spells", d, { strict: false }), []);
  const lint = (def, effects, extra = {}) => lintEntry("spells", { ...structuredClone(def), effects, ...extra }, { strict: false });
  // eachTurn: heal, tempHp or manual, one to four, in a spell that lasts, not in one another.
  assert.ok(lint(h, [{ eachTurn: [{ damage: "1d4", type: "fire" }] }]).some((p) => /eachTurn/.test(p)));
  assert.ok(lint(h, [{ eachTurn: [] }]).some((p) => /eachTurn/.test(p)));
  assert.ok(lint(h, [{ eachTurn: [{ eachTurn: [{ heal: "+1" }] }] }]).some((p) => /eachTurn/.test(p)));
  assert.ok(lint(h, [{ eachTurn: [{ heal: "+1" }] }], { duration: "instant", concentration: false }).some((p) => /lasts/.test(p)));
  assert.ok(lint(h, [{ eachTurn: [{ heal: "+1" }], when: ["target.prone"] }]).some((p) => /when/.test(p)));
  assert.deepEqual(lint(h, [{ eachTurn: [{ heal: "+1" }, { tempHp: "1d4" }, { manual: "x" }] }], { tier: "assist" }), []);
  // The condition hook: one shape, a modifier step.
  const mod = (modifier) => lint(h, [{ modifier }]);
  const IMM = { on: "condition", op: "immune", scope: { condition: "frightened" } };
  assert.deepEqual(mod(IMM), []);
  for (const bad of [{ ...IMM, op: "advantage" }, { on: "condition", op: "immune" }, { ...IMM, scope: { condition: "wet" } }, { ...IMM, scope: { condition: "frightened", skill: "stealth" } }, { ...IMM, uses: 1 }]) {
    assert.ok(mod(bad).some((p) => /condition/.test(p)), json(bad));
  }
});

test("Heroism: Temporary Hit Points equal to the spellcasting modifier at the start of each of its turns, and immunity to Frightened", () => {
  const { s } = table();
  const r0 = cast(s, "heroism", { target: "fighter", slot: 1 });
  assert.ok(r0.events.some((e) => e.type === "effectStart" && e.name === "Heroism"));
  assert.ok(!r0.events.some((e) => e.type === "manual" && !e.partial), "nothing is handed to the DM");
  assert.equal(s.entities.fighter.tempHp ?? 0, 0, "nothing at the cast: the first comes at the start of its next turn");
  const ev = [...fight(s).events, ...until(s, "fighter")];
  const f = s.entities.fighter;
  assert.equal(f.tempHp, 4, "Charisma 18 is +4");
  assert.ok(ev.some((e) => e.type === "tempHp" && e.id === "fighter" && e.amount === 4), json(ev.filter((e) => e.type === "tempHp")));
  // Damage takes the Temporary Hit Points first; the next turn gives them again (they do not add up).
  ok(apply(s, { type: "harm", actor: "fighter", amount: 3 }, DM));
  assert.equal(f.tempHp, 1);
  const hp = f.hp;
  round(s, "fighter");
  assert.equal(f.tempHp, 4);
  assert.equal(f.hp, hp);
  // Immune to Frightened: the DM is refused, and the engine's own way of giving it (a spell, a monster's action) puts nothing on and says so.
  const r = apply(s, { type: "condition", actor: "fighter", condition: "frightened" }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /immune to Frightened/);
  const ev2 = [];
  condition(s, f, "frightened", ev2);
  assert.ok(!f.cond.frightened);
  assert.deepEqual(ev2, [{ type: "note", id: "fighter", text: "Immune to Frightened" }]);
});

test("Heroism upcast reaches one more creature, each with its own turn-start Hit Points; the bard's Concentration ending ends it", () => {
  const { s } = table();
  const r = cast(s, "heroism", { targets: ["fighter", "bo"], slot: 2 });
  assert.ok(r.events.some((e) => e.type === "effectStart"));
  fight(s);
  until(s, "fighter");
  assert.equal(s.entities.fighter.tempHp, 4);
  until(s, "bo");
  assert.equal(s.entities.bo.tempHp, 4);
  // Lost Concentration ends the spell: no more Hit Points at a turn start. Those already given stay (SRD "Temporary Hit Points").
  s.entities.fighter.tempHp = 0;
  ok(apply(s, { type: "harm", actor: "bo", amount: 1 }, DM));
  const fx = live(s, "heroism");
  if (fx) { ok(apply(s, { type: "endEffect", effect: fx.id }, DM)); }
  assert.ok(!live(s, "heroism"));
  round(s, "fighter");
  assert.equal(s.entities.fighter.tempHp ?? 0, 0);
});

test("a Frightened creature that is then given Heroism is not affected by it while the spell lasts, and has it again after", () => {
  const { s } = table();
  ok(apply(s, { type: "condition", actor: "fighter", condition: "frightened" }, DM));
  assert.ok(s.entities.fighter.cond.frightened);
  cast(s, "heroism", { target: "fighter", slot: 1 });
  assert.ok(s.entities.fighter.cond.frightened, "the condition is not taken off");
  const fx = live(s, "heroism");
  ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
  assert.ok(s.entities.fighter.cond.frightened);
});

test("Regenerate: 4d8+15 at the cast, 1 Hit Point at the start of each of its turns, and the limbs go to the DM", () => {
  const { s } = table();
  const f = s.entities.fighter;
  ok(apply(s, { type: "setHp", actor: "fighter", hp: 5 }, DM));
  const r = cast(s, "regenerate", { target: "fighter", slot: 7 });
  const healed = r.events.find((e) => e.type === "heal");
  assert.ok(healed.amount >= 19 && healed.amount <= 47);
  assert.ok(r.events.some((e) => e.type === "manual" && /severed body parts/.test(e.text)), "an honest manual note for the regrowth");
  const after = f.hp;
  fight(s);
  const ev = round(s, "fighter");
  assert.ok(ev.some((e) => e.type === "heal" && e.target === "fighter" && e.amount === 1), json(ev.filter((e) => e.type === "heal")));
  const hp = f.hp;
  round(s, "fighter");
  assert.equal(f.hp, Math.min(f.maxHp, hp + 1));
});

test("Regenerate wakes a creature at 0 Hit Points at the start of its turn, before its Death Saving Throw", () => {
  const { s } = table();
  cast(s, "regenerate", { target: "fighter", slot: 7 });
  const f = s.entities.fighter;
  fight(s);
  ok(apply(s, { type: "harm", actor: "fighter", amount: f.hp }, DM));
  assert.equal(f.hp, 0);
  assert.ok(!f.dead);
  const ev = round(s, "fighter");
  assert.ok(f.hp >= 1, "it is up");
  assert.ok(!ev.some((e) => e.type === "deathSave" || e.type === "death"), "no Death Saving Throw was needed");
  assert.ok(ev.some((e) => e.type === "heal" && e.target === "fighter" && e.amount === 1));
});

test("outside a fight there are no turns, so nothing runs", () => {
  const { s } = table();
  cast(s, "heroism", { target: "fighter", slot: 1 });
  ok(apply(s, { type: "rest", actor: "bo", kind: "short" }, DM));
  assert.equal(s.entities.fighter.tempHp ?? 0, 0, "no turns outside a fight");
});

test("a player is not sent what the part runs, nor its caster's modifier, even when the caster is hidden", () => {
  const { s, g } = table();
  cast(s, "heroism", { target: "fighter", slot: 1 });
  const fx = playerView(s, PAT).effects.find((x) => x.spell === "heroism");
  assert.ok(fx, "the party sees its own spell");
  assert.ok(!json(fx).includes("healMod") && fx.parts.every((p) => p.turn === undefined), json(fx));
  // The same effect from a hidden foe, on a party creature: the party sees it on its own creature, never whose it is, and never what it runs.
  ok(apply(s, { type: "reveal", actor: g, hidden: true }, DM));
  live(s, "heroism").source = g;
  const fx2 = playerView(s, PAT).effects.find((x) => x.spell === "heroism");
  assert.ok(fx2 && fx2.source === undefined, "no source");
  assert.ok(!json(fx2).includes(g) && !json(fx2).includes("healMod") && fx2.parts.every((p) => p.turn === undefined), json(fx2));
});

test("a condition a spell makes its creature immune to has no effect while the spell lasts, as under an aura", () => {
  const { s } = table();
  const f = s.entities.fighter;
  ok(apply(s, { type: "condition", actor: "fighter", condition: "grappled" }, DM));
  assert.equal(speedOf(s, f), 0, "Grappled: Speed 0");
  const fx = { id: "fxi", name: "Free Action", spell: "free-action", source: "bo", conc: false, lasts: "1 hour", until: null, parts: [{ target: "fighter", modifier: { on: "condition", op: "immune", scope: { condition: "grappled" } } }] };
  s.effects.push(fx);
  assert.ok(speedOf(s, f) > 0, "its Speed is its own while it is immune");
  assert.ok(f.cond.grappled, "the condition is not taken off");
  fx.parts[0].ended = true;
  assert.equal(speedOf(s, f), 0, "back when the part ends");
});

test("a caster with no spellcasting bonus gives no Temporary Hit Points, and a lower number does not lower what the creature has", () => {
  const { s } = table();
  s.entities.bo.abil.cha = 8;                         // -1
  cast(s, "heroism", { target: "fighter", slot: 1 });
  s.entities.fighter.tempHp = 6;
  s.entities.fighter.tempFx = undefined;
  fight(s);
  until(s, "fighter");
  assert.equal(s.entities.fighter.tempHp, 6, "kept: it never gets fewer");
});

test("undo, redo and a replay give the same state", () => {
  const { s } = table();
  const acts = [{ type: "cast", actor: "bo", spell: "regenerate", target: "fighter", slot: 7 }, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }];
  const start = json(s), h = createHistory();
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); }
  for (let i = 0; i < 12 && s.encounter; i++) { const a = { type: "endTurn", actor: current(s) }, b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); acts.push(a); }
  const end = json(s);
  for (let i = 0; i < acts.length; i++) h.undo(s);
  assert.equal(json(s), start, "undo");
  for (let i = 0; i < acts.length; i++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
});
