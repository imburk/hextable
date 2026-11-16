// Two facts docs/PATH-TO-0.2.md found by reading, shown as they are today (#380, part D; docs/DEBT.md C17, T33).
// These tests pin the gaps; they do not fix them. When a gap is fixed, flip its assertions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { apply } from "../src/engine.js";
import { PREGENS } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";
import { canSee } from "../src/sight.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// `editCharacter` (engine/characters.js) remakes a creature from a record and carries over a shorter list of play
// state than `remake` (engine/sheets.js) does: tempHp, tempFx, follow, march, light, hiding and hidden are dropped.
test("GAP (DEBT C17): editCharacter drops seven fields of play state that remake keeps, hiding among them", () => {
  const s = newGame(5);
  ok(apply(s, { type: "setting", key: "sight", value: "light" }, DM));
  const r = s.entities.rogue;
  // The rogue as play leaves it: Temporary Hit Points, following the fighter in marching order, holding a light,
  // and hidden (the Hide action's record). `hidden` is the DM's flag; a party member never carries it (below).
  Object.assign(r, { tempHp: 5, tempFx: "fx1", follow: "fighter", march: 1, light: { bright: 20, dim: 20 }, hiding: { dc: 18 }, hidden: true });
  const goblin = Object.values(s.entities).find((e) => e.side === "foe");
  const before = canSee(s, goblin, r);
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: structuredClone(PREGENS.rogue) }, DM));
  const after = s.entities.rogue;
  for (const k of ["tempHp", "tempFx", "follow", "march", "light", "hiding", "hidden"]) assert.equal(after[k], undefined, `GAP: ${k} is dropped`);
  // What it means today: the rogue comes out of hiding with no event saying so, and a foe that could not see it may now.
  assert.equal(before, "no", "hiding, the goblin could not see the rogue");
  assert.notEqual(canSee(s, goblin, after), "no", "GAP: after the edit it is no longer hidden from the goblin");
});

test("editCharacter's dropped `hidden` sends players nothing they were not sent: a character is never hidden from them", () => {
  // The DM cannot hide a party member, and a player's character cannot become anyone's companion (which is the only
  // way a creature changes side), so no character reaches editCharacter with `hidden`. Even forced into the state,
  // a party member's `hidden` hides nothing from players (space.js `concealed` is for creatures not of the party).
  const s = newGame(5);
  assert.match(apply(s, { type: "reveal", actor: "rogue", hidden: true }, DM).error, /party member can't be hidden/);
  const goblin = Object.values(s.entities).find((e) => e.side === "foe");
  assert.match(apply(s, { type: "bond", actor: "rogue", to: goblin.id }, DM).error, /player's character and can't be a companion/);
  const pat = { role: "player", userId: "nobody" };
  const sent = () => !!view(s, pat).entities?.rogue;
  assert.equal(sent(), true, "players are sent the rogue");
  s.entities.rogue.hidden = true;
  assert.equal(sent(), true, "a forced `hidden` on a party member does not take it out of what players are sent");
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: structuredClone(PREGENS.rogue) }, DM));
  assert.equal(s.entities.rogue.hidden, undefined);
  assert.equal(sent(), true, "and after the edit players are sent the rogue, as before it: nothing becomes visible that was not");
});

// The DM's "Add a monster" buttons are made once, when app.js is first run, from MONSTERS as it is then: a homebrew
// monster added later (by the registry's `using`) is never a button until B7 builds the list again.
test("GAP (DEBT T33): the client's Add a monster list is built once at load", () => {
  const src = readFileSync(new URL("../../client/app.js", import.meta.url), "utf8").split("\n");
  const at = src.findIndex((l) => l.startsWith("for (const [id, m] of Object.entries(MONSTERS)) {"));
  assert.ok(at > 0, "the loop that makes the buttons");
  assert.match(src[at + 3], /\$\('dm-spawn'\)\.append\(b\)/, "it fills #dm-spawn");
  // At the top level of the module (column 0: app.js indents every body), so it runs once, when the page loads.
  assert.match(src[at], /^for /, "GAP: not inside any function, so nothing builds it again");
  // And nothing else adds to #dm-spawn.
  assert.equal(src.filter((l) => l.includes("'dm-spawn'")).length, 1, "GAP: the only place the list is made");
});
