// The `shield` action (issue #449): putting a Shield away or taking it up. SRD 5.2, Armor table: "Shield (Utilize Action to Don or Doff)".
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const fighter = (more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["greatsword"], ...more });
const bytes = (s) => JSON.stringify(s);

function field(sh, { fight = true } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sh);
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: 1 });
  s.foe = foe;
  if (fight) {
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 6 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), "hero");
  }
  return s;
}
function exact(s, actions) {
  const h = createHistory(), start = bytes(s), copy = structuredClone(s), out = [];
  for (const a of actions) { const b = mark(s), r = apply(s, a, DM); assert.ok(r.ok, r.error); h.record(b, s, describeStep(a, r.events, b, s)); out.push(r.events); }
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
function refused(s, action, re, ctx = DM) {
  const before = bytes(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, "refused");
  assert.match(r.error, re);
  assert.equal(bytes(s), before, "nothing changed, byte for byte");
}
const swing = (s) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, DM);

test("Greatsword and Shield in a fight: refused, then Shield away (the action), next turn the Greatsword; AC down by the Shield's 2; back on", () => {
  const s = field(fighter());
  const ac = s.entities.hero.ac;
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, /put the Shield away first \(Put Shield away/);
  const turn = [{ type: "shield", actor: "hero", on: false }];
  const out = exact(s, turn);
  assert.deepEqual(out[0].find((e) => e.type === "shield"), { type: "shield", id: "hero", on: false });
  const h = s.entities.hero;
  assert.equal(h.ac, ac - 2); assert.equal(h.shield, undefined); assert.equal(h.sheet.shieldStowed, true); assert.equal(h.sheet.shield, true);
  assert.equal(s.encounter.budget.action, 0, "the action is spent");
  refused(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, /already used an action/);
  refused(s, { type: "shield", actor: "hero", on: true }, /already used an action/);
  // next turn
  for (let i = 0; i < 12; i++) { ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (current(s) === "hero") break; }
  assert.equal(current(s), "hero");
  const o2 = exact(s, [{ type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }]);
  assert.ok(o2[0].some((e) => e.type === "attack"));
  for (let i = 0; i < 12; i++) { ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (current(s) === "hero") break; }
  exact(s, [{ type: "shield", actor: "hero", on: true }]);
  assert.equal(s.entities.hero.ac, ac); assert.equal(s.entities.hero.shield, true); assert.equal(s.entities.hero.sheet.shieldStowed, undefined);
  assert.equal(s.entities.hero.hp, s.entities.hero.maxHp);
});

test("refusals change nothing: same state as asked, not its turn, no Shield, hand-typed, a player of another, bad input", () => {
  const s = field(fighter());
  refused(s, { type: "shield", actor: "hero", on: true }, /already holds a Shield/);
  refused(s, { type: "shield", actor: "hero" }, /true or false/);
  refused(s, { type: "shield", actor: "hero", on: "yes" }, /true or false/);
  refused(s, { type: "shield", actor: "nobody", on: false }, /./);
  refused(s, { type: "shield", actor: "hero", on: false }, /controller|control|belong|yours|not your/i, { role: "player", userId: "stranger" });
  const bare = field(fighter({ shield: undefined }));
  refused(bare, { type: "shield", actor: "hero", on: false }, /has no Shield/);
  refused(bare, { type: "shield", actor: "hero", on: true }, /has no Shield/);
  const typed = field(fighter()); delete typed.entities.hero.sheet;
  refused(typed, { type: "shield", actor: "hero", on: false }, /typed in by hand/);
  // not its turn
  const t = field(fighter());
  ok(apply(t, { type: "endTurn", actor: "hero" }, DM));
  refused(t, { type: "shield", actor: "hero", on: false }, /isn't Fi's turn/);
  // already put away
  const u = field(fighter());
  ok(apply(u, { type: "shield", actor: "hero", on: false }, DM));
  u.encounter.budget.action = 1;
  refused(u, { type: "shield", actor: "hero", on: false }, /no Shield in hand/);
  // incapacitated, down
  const c = field(fighter()); c.entities.hero.cond.stunned = {};
  refused(c, { type: "shield", actor: "hero", on: false }, /can't act/);
});

test("no training with a Shield: taking it up is allowed, and it is then worn untrained; a wizard sheet with a stowed Shield", () => {
  const sh = { name: "Wy", class: "wizard", level: 1, abilities: A, skills: ["arcana", "history"], weapons: [], shield: true, shieldStowed: true };
  const s = field(sh, { fight: false });
  assert.equal(derive(sh).record.shield, undefined);
  ok(apply(s, { type: "shield", actor: "hero", on: true }, DM));
  assert.deepEqual(s.entities.hero.untrained, ["Shield"]);
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
  assert.equal(s.entities.hero.untrained, undefined);
});

test("out of a fight it is free and needs no turn; no encounter, no budget", () => {
  const s = field(fighter(), { fight: false });
  const ac = s.entities.hero.ac;
  exact(s, [{ type: "shield", actor: "hero", on: false }, { type: "shield", actor: "hero", on: true }]);
  assert.equal(s.entities.hero.ac, ac);
  assert.ok(!s.encounter);
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
  assert.equal(s.entities.hero.ac, ac - 2);
  // the owner too
  s.entities.hero.owner = "p1";
  ok(apply(s, { type: "shield", actor: "hero", on: true }, { role: "player", userId: "p1" }));
});

test("a saved character without the new field is unchanged; the field is checked", () => {
  const a = derive(fighter()), b = derive(fighter({ shieldStowed: undefined }));
  assert.equal(JSON.stringify(a.record), JSON.stringify(b.record));
  assert.equal(a.record.shield, true);
  assert.deepEqual(validate(fighter()), []);
});

test("a magic Shield +1 toggles its equipped; attuned stays; AC follows", () => {
  const sh = fighter({ shield: undefined, items: [{ id: "i1", item: "shield-plus-1", equipped: true }] });
  const s = field(sh);
  const ac = s.entities.hero.ac;
  const out = exact(s, [{ type: "shield", actor: "hero", on: false }]);
  const ev = out[0].find((e) => e.type === "shield");
  assert.equal(ev.on, false); assert.equal(ev.key, "i1");
  assert.equal(s.entities.hero.sheet.items[0].equipped, undefined);
  assert.equal(s.entities.hero.ac, ac - 3);
  refused(s, { type: "shield", actor: "hero", on: true }, /already used an action/);
  s.encounter.budget.action = 1;
  ok(apply(s, { type: "shield", actor: "hero", on: true, item: "i1" }, DM));
  assert.equal(s.entities.hero.sheet.items[0].equipped, true); assert.equal(s.entities.hero.ac, ac);
  s.encounter.budget.action = 1;
  refused(s, { type: "shield", actor: "hero", on: true, item: "i1" }, /already holds/);
  s.encounter.budget.action = 1;
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
  s.encounter.budget.action = 1;
  refused(s, { type: "shield", actor: "hero", on: true, item: "i9" }, /no such Shield/);
});

test("what players are sent: the event for a creature they see, the item only for their own; nothing for a hidden one", () => {
  const PAT = { role: "player", userId: "pat" };
  const mine = field(fighter({ shield: undefined, items: [{ id: "i1", item: "shield-plus-1", equipped: true }] }), { fight: false });
  const r = ok(apply(mine, { type: "shield", actor: "hero", on: false }, DM));
  assert.deepEqual(viewEvents(r.events, mine, PAT).find((e) => e.type === "shield"), { type: "shield", id: "hero", on: false, key: "i1", item: "Shield +1" });
  // a foe's: seen, only that it went away
  const foe = field(fighter({ shield: undefined, items: [{ id: "i1", item: "shield-plus-1", equipped: true }] }), { fight: false });
  foe.entities.hero.side = "foe";
  const r2 = ok(apply(foe, { type: "shield", actor: "hero", on: false }, DM));
  assert.deepEqual(viewEvents(r2.events, foe, PAT).filter((e) => e.type === "shield"), [{ type: "shield", id: "hero", on: false }]);
  // a hidden one: nothing at all
  const hid = field(fighter(), { fight: false });
  hid.entities.hero.side = "foe"; hid.entities.hero.hidden = true;
  assert.equal(view(hid, PAT).entities.hero, undefined, "it is hidden");
  const r3 = ok(apply(hid, { type: "shield", actor: "hero", on: false }, DM));
  assert.deepEqual(viewEvents(r3.events, hid, PAT), []);
});

test("validate: shieldStowed is true and only with a Shield; a stowed Shield needs no training and counts for no AC", () => {
  const problems = (sh) => validate(sh);
  assert.deepEqual(problems(fighter({ shieldStowed: true })), []);
  assert.match(problems(fighter({ shieldStowed: false })).join(" "), /shieldStowed/);
  assert.match(problems(fighter({ shield: undefined, shieldStowed: true })).join(" "), /shieldStowed/);
  assert.equal(derive(fighter({ shieldStowed: true })).record.ac, derive(fighter({ shield: undefined })).record.ac);
});

test("remaking from the sheet keeps stealthNoted, away and vanished; the entity differs only by the Shield", () => {
  const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  const s = field(fighter(), { fight: false });
  Object.assign(s.entities.hero, { stealthNoted: true, away: { how: "skip", by: "dm" }, vanished: true });
  const keep = (e) => ({ stealthNoted: e.stealthNoted, away: e.away, vanished: e.vanished });
  const want = keep(s.entities.hero);
  const before = structuredClone(s.entities.hero);
  ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
  assert.deepEqual(diff(before, s.entities.hero), ["ac", "sheet", "shield"]);
  assert.deepEqual(keep(s.entities.hero), want);
  ok(apply(s, { type: "shield", actor: "hero", on: true }, DM));
  ok(apply(s, { type: "shortRest", actor: "hero" }, DM));
  assert.deepEqual(keep(s.entities.hero), want);
  const m = field(fighter({ shield: undefined, items: [{ id: "i1", item: "shield-plus-1" }] }), { fight: false });
  Object.assign(m.entities.hero, { stealthNoted: true, away: { how: "skip", by: "dm" }, vanished: true });
  ok(apply(m, { type: "equip", actor: "hero", item: "i1" }, DM));
  assert.deepEqual(keep(m.entities.hero), want);
});
