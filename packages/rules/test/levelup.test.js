// Characters keep their sheet in the game and are made again from it: setSheet and levelUp.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { SHEETS } from "./fixtures/sheets.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const fighter = (level, more = {}) => ({ ...SHEETS.fighter, level, ...(level >= 3 ? { subclass: "champion" } : {}), ...more });

test("setSheet adds a built character to the party; validation problems are refused in plain words", () => {
  const s = newGame(3);
  no(apply(s, { type: "setSheet", sheet: { ...SHEETS.fighter, skills: [] } }, DM), /can't be played yet. A level 1 Fighter chooses 2 skills/);
  no(apply(s, { type: "setSheet", sheet: { ...SHEETS.fighter, owner: "pat" } }, DM), /"owner" is not something a sheet has/);
  no(apply(s, { type: "setSheet", sheet: SHEETS.fighter }, PAT), /Only the DM/);
  const id = ok(apply(s, { type: "setSheet", sheet: fighter(2) }, DM)).events.find((x) => x.type === "spawned").id;
  const e = s.entities[id];
  assert.deepEqual([e.name, e.level, e.maxHp, e.ac, e.uses["action-surge"], e.hd, e.side, e.kind], ["Brenna", 2, 20, 18, 1, 2, "party", "pc"]);
  assert.equal(e.sheet.level, 2);
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  assert.equal(view(s, PAT).entities[id].sheet.class, "fighter", "a player is sent their own sheet");
});

test("levelUp keeps who plays it, where it is, damage taken and what it has spent", () => {
  const s = newGame(3);
  const id = ok(apply(s, { type: "setSheet", sheet: fighter(4) }, DM)).events.find((x) => x.type === "spawned").id;
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  const e = s.entities[id], pos = { ...e.pos };
  e.hp -= 10; e.uses["second-wind"] = 1; e.uses["action-surge"] = 0; e.hd = 3; e.cond.poisoned = {};
  no(apply(s, { type: "levelUp", actor: id, sheet: fighter(6) }, DM), /must be level 5/);
  no(apply(s, { type: "levelUp", actor: id, sheet: { ...fighter(5), class: "rogue" } }, DM), /keeps the class/);
  ok(apply(s, { type: "levelUp", actor: id, sheet: fighter(5) }, DM));
  const f = s.entities[id];
  assert.equal(f.owner, "pat");
  assert.deepEqual(f.pos, pos);
  assert.equal(f.maxHp, 44); assert.equal(f.hp, 34, "10 damage still taken");
  assert.equal(f.features.extraAttack, 1);
  assert.equal(f.uses["second-wind"], 1, "Second Wind: 3 uses, 2 spent");
  assert.equal(f.uses["action-surge"], 0);
  assert.equal(f.hd, 4, "one Hit Point Die spent of five");
  assert.ok(f.cond.poisoned);
  assert.equal(f.sheet.level, 5);
  assert.equal(f.prof, 3);
});

test("levelUp is refused in a fight and for a character typed in by hand; setSheet re-makes either", () => {
  const s = newGame(3);
  no(apply(s, { type: "levelUp", actor: "fighter", sheet: fighter(2) }, DM), /typed in by hand/);
  // A hand-typed pregen can be given a sheet: it becomes a built character.
  ok(apply(s, { type: "setSheet", actor: "fighter", sheet: fighter(1) }, DM));
  assert.equal(s.entities.fighter.sheet.level, 1);
  assert.ok(s.entities.fighter.feats.some((x) => x.id === "second-wind"));
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
  no(apply(s, { type: "levelUp", actor: "fighter", sheet: fighter(2) }, DM), /middle of a fight/);
});

