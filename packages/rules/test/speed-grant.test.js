// A speed the DM grants with `setSpeed` survives the creature being remade from its sheet (issue #451, DEBT T65): the grant is
// recorded on the creature, `speedSet`, and laid over what the sheet gives. Nothing is inferred from the sheet's difference.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const fighter = (more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["greatsword"], ...more });
const bytes = (s) => JSON.stringify(s);

function field(sh) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sh);
  return s;
}
const set = (s, mode, feet, hover) => ok(apply(s, { type: "setSpeed", actor: "hero", mode, feet, ...(hover ? { hover } : {}) }, DM));
const mine = (s) => { const e = s.entities.hero; return { speed: e.speed, speeds: e.speeds, hover: e.hover, speedSet: e.speedSet }; };
const GRANT = { speed: 40, speeds: { fly: 60 }, hover: true, speedSet: { walk: 40, fly: 60, hover: true } };
const granted = (sh) => { const s = field(sh); set(s, "walk", 40); set(s, "fly", 60, true); return s; };

test("setSpeed records the grant: one key per way, 0 for one taken away, a sheet's own value clears its key, an empty record goes", () => {
  const s = field(fighter({ items: [{ id: "i1", item: "ring-of-swimming", equipped: true }] }));
  assert.equal(s.entities.hero.speeds.swim, 40);
  assert.equal(s.entities.hero.speedSet, undefined, "nothing recorded until the DM sets something");
  set(s, "walk", 40); set(s, "fly", 60, true); set(s, "swim", 0);
  assert.deepEqual(s.entities.hero.speedSet, { walk: 40, fly: 60, hover: true, swim: 0 });
  set(s, "swim", 40);
  assert.deepEqual(s.entities.hero.speedSet, { walk: 40, fly: 60, hover: true }, "back to the Ring's 40: the key goes");
  set(s, "fly", 60);
  assert.deepEqual(s.entities.hero.speedSet, { walk: 40, fly: 60 }, "no hover now");
  assert.equal(s.entities.hero.hover, undefined);
  set(s, "fly", 0); set(s, "walk", 30);
  assert.equal(s.entities.hero.speedSet, undefined, "the sheet's own values: an empty record is deleted");
  assert.equal("speedSet" in s.entities.hero, false);
});

test("a creature with no sheet keeps the record as set", () => {
  const s = newGame(3);
  const id = Object.keys(s.entities).find((k) => s.entities[k].side !== "party");
  ok(apply(s, { type: "setSpeed", actor: id, mode: "walk", feet: s.entities[id].speed }, DM));
  assert.deepEqual(s.entities[id].speedSet, { walk: s.entities[id].speed });
});

for (const [name, action, swim] of [
  ["shield", () => ({ type: "shield", actor: "hero", on: false }), false],
  ["equip", () => ({ type: "equip", actor: "hero", item: "i1", on: true }), true],
  ["a level-up", () => ({ type: "levelUp", actor: "hero", sheet: fighter({ level: 6, items: [{ id: "i1", item: "ring-of-swimming" }] }) }), false],
  ["setSheet (the same sheet)", () => ({ type: "setSheet", actor: "hero", sheet: fighter({ items: [{ id: "i1", item: "ring-of-swimming" }] }) }), false],
  ["setSheet (a sheet that gives more Speed)", () => ({ type: "setSheet", actor: "hero", sheet: fighter({ speed: 35, items: [{ id: "i1", item: "ring-of-swimming", equipped: true }] }) }), true],
]) {
  test(`a DM's fly 60 with hover and walk 40 survive ${name}; undo, redo and replay are exact`, () => {
    const s = granted(fighter({ items: [{ id: "i1", item: "ring-of-swimming" }] }));
    const h = createHistory(), start = bytes(s), copy = structuredClone(s), a = action();
    const b = mark(s), r = ok(apply(s, a, DM));
    h.record(b, s, describeStep(a, r.events, b, s));
    assert.deepEqual(mine(s), { ...GRANT, speeds: { ...GRANT.speeds, ...(swim ? { swim: 40 } : {}) } });
    const end = bytes(s);
    assert.ok(h.undo(s)); assert.equal(bytes(s), start, "undone");
    assert.ok(h.redo(s)); assert.equal(bytes(s), end, "redone");
    ok(apply(copy, a, DM)); assert.equal(bytes(copy), end, "replayed");
  });
}

test("Long Rest and a Short Rest that completes an attunement keep the grant", () => {
  const s = granted(fighter({ items: [{ id: "i1", item: "ring-of-protection", equipped: true }] }));
  ok(apply(s, { type: "attune", actor: "hero", item: "i1" }, DM));
  const ac = s.entities.hero.ac;
  ok(apply(s, { type: "shortRest", ids: ["hero"] }, DM));
  assert.equal(s.entities.hero.ac, ac + 1, "the character was remade");
  assert.deepEqual(mine(s), GRANT);
  ok(apply(s, { type: "rest" }, DM));
  assert.deepEqual(mine(s), GRANT);
});

test("a sheet that changes Speed: without a grant the sheet wins, with the DM's walk the DM wins", () => {
  const s = field(fighter()), t = field(fighter());
  set(t, "walk", 45);
  for (const x of [s, t]) ok(apply(x, { type: "setSheet", actor: "hero", sheet: fighter({ speed: 35 }) }, DM));
  assert.equal(s.entities.hero.speed, derive(fighter({ speed: 35 })).record.speed);
  assert.equal(t.entities.hero.speed, 45);
});

test("the DM taking away a sheet-given way of moving survives a remake; setting it back clears the record", () => {
  const s = field(fighter({ items: [{ id: "i1", item: "ring-of-swimming", equipped: true }] }));
  set(s, "swim", 0);
  assert.equal(s.entities.hero.speeds.swim, undefined);
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
  assert.equal(s.entities.hero.speeds.swim, undefined, "still taken away");
  assert.deepEqual(s.entities.hero.speedSet, { swim: 0 });
  set(s, "swim", 40);
  assert.equal(s.entities.hero.speedSet, undefined);
  ok(apply(s, { type: "shield", actor: "hero", on: true }, DM));
  assert.equal(s.entities.hero.speeds.swim, 40);
});

test("a creature with no record is remade exactly as before; a refused setSpeed changes nothing", () => {
  const s = field(fighter());
  const plain = field(fighter());
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM)); ok(apply(plain, { type: "shield", actor: "hero", on: false }, DM));
  assert.equal(bytes(s), bytes(plain));
  const before = bytes(s);
  for (const a of [{ mode: "walk", feet: 42 }, { mode: "jump", feet: 30 }, { mode: "fly", feet: -5 }, { mode: "walk", feet: 305 }]) {
    const r = apply(s, { type: "setSpeed", actor: "hero", ...a }, DM);
    assert.equal(r.ok, false); assert.equal(bytes(s), before);
  }
  const r = apply(s, { type: "setSpeed", actor: "hero", mode: "walk", feet: 40 }, { role: "player", userId: "pat" });
  assert.equal(r.ok, false); assert.equal(bytes(s), before);
});

test("players are sent no speedSet", () => {
  const s = granted(fighter());
  assert.ok(s.entities.hero.speedSet);
  const v = view(s, { role: "player", userId: "pat" });
  assert.equal(v.entities.hero?.speedSet, undefined);
  assert.equal(v.entities.hero?.speeds?.fly, 60, "the speeds themselves are sent as before");
});

test("a grant made while in a form is not recorded (it ends with the form, as on main)", () => {
  const s = granted(fighter());
  s.entities.hero.form = { block: "x", name: "Wolf", fx: "x", kept: {}, absent: [] };
  ok(apply(s, { type: "setSpeed", actor: "hero", mode: "swim", feet: 30 }, DM));
  assert.deepEqual(s.entities.hero.speedSet, GRANT.speedSet);
});

test("speedSet does not reach players through a master's pocket dimension; the DM's view has it", () => {
  const s = granted(fighter());
  const id = Object.keys(s.entities).length && ok(apply(s, { type: "spawn", monster: "wolf", at: { q: 2, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  ok(apply(s, { type: "setSpeed", actor: id, mode: "fly", feet: 60 }, DM));
  assert.deepEqual(s.entities[id].speedSet, { fly: 60 });
  s.entities.hero.pocket = { [id]: s.entities[id] };            // as the pocket dimension holds a familiar
  delete s.entities[id];
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, { role: "player", userId: "pat" }));
  for (const who of [{ role: "player", userId: "pat" }, { role: "player", userId: "kim" }, { role: "spectator", userId: "sp" }, { role: "player" }]) {
    const v = view(s, who);
    assert.equal(JSON.stringify(v).includes("speedSet"), false, JSON.stringify(who));
  }
  assert.equal(view(s, { role: "player", userId: "pat" }).entities.hero.pocket[id].speeds.fly, 60, "the party's own pocket is still sent");
  assert.ok(JSON.stringify(view(s, DM)).includes("speedSet"));
});

test("a malformed stored speedSet is discarded when setSpeed records, and when a remake lays it over", () => {
  for (const bad of ["abc", [1, 2], { fly: -5, walk: 40, swim: 7, jump: 30, hover: 1 }]) {
    const s = field(fighter());
    s.entities.hero.speedSet = structuredClone(bad);
    set(s, "climb", 20);
    assert.deepEqual(s.entities.hero.speedSet, bad && bad.walk === 40 ? { walk: 40, climb: 20 } : { climb: 20 }, JSON.stringify(bad));
    const t = field(fighter());
    t.entities.hero.speedSet = structuredClone(bad);
    ok(apply(t, { type: "shield", actor: "hero", on: false }, DM));
    assert.equal(t.entities.hero.speed, bad.walk === 40 ? 40 : 30);
    assert.equal(JSON.stringify(t.entities.hero.speedSet ?? null).includes("-5"), false);
  }
});
