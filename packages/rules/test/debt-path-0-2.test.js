// Two facts docs/PATH-TO-0.2.md found by reading (#380, part D; docs/DEBT.md C17, T34).
// These tests pinned the gaps. When a gap is fixed, flip its assertions (T34 was, in #404; C17 (editCharacter) was, in #476).
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

// `editCharacter` (engine/characters.js) once carried a shorter list of play state than `remake` (engine/sheets.js): tempHp,
// tempFx, follow, march, light, hiding and hidden were dropped. Since #476 both use one list (`carryPlay`, sheets.js), and a
// character who hid stays hidden through an edit.
test("DEBT C17 fixed (#476): editCharacter keeps what remake keeps, hiding among it", () => {
  const s = newGame(5);
  ok(apply(s, { type: "setting", key: "sight", value: "light" }, DM));
  const r = s.entities.rogue;
  // The rogue as play leaves it: Temporary Hit Points, following the fighter in marching order, holding a light,
  // and hidden (the Hide action's record). `hidden` is the DM's flag; a party member never carries it (below).
  const play = { tempHp: 5, tempFx: "fx1", follow: "fighter", march: 1, light: { bright: 20, dim: 20 }, hiding: { dc: 18 }, hidden: true };
  Object.assign(r, structuredClone(play));
  const goblin = Object.values(s.entities).find((e) => e.side === "foe");
  const before = canSee(s, goblin, r);
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: structuredClone(PREGENS.rogue) }, DM));
  const after = s.entities.rogue;
  for (const [k, v] of Object.entries(play)) assert.deepEqual(after[k], v, `${k} is kept`);
  // The rogue stays hidden: the goblin that could not see it still cannot.
  assert.equal(before, "no", "hiding, the goblin could not see the rogue");
  assert.equal(canSee(s, goblin, after), "no", "after the edit it is still hidden from the goblin");
});

test("editCharacter's kept `hidden` sends players nothing they were not sent: a character is never hidden from them", () => {
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
  assert.equal(s.entities.rogue.hidden, true, "(since #476 the flag is kept through the edit, as `remake` keeps it)");
  assert.equal(sent(), true, "and after the edit players are sent the rogue, as before it: nothing becomes visible that was not");
});

// The DM's "Add a monster" buttons were made once, when app.js first ran; since #404 (B7) one function builds them from MONSTERS as it is
// now, and it is called again when the table's packs change, so a homebrew monster can be added.
test("DEBT T34 fixed (#404): the client's Add a monster list is built again when the packs change", () => {
  const src = readFileSync(new URL("../../client/app.js", import.meta.url), "utf8");
  const at = src.indexOf("function buildSpawn() {");
  assert.ok(at > 0, "the function that makes the buttons");
  assert.match(src.slice(at, at + 600), /Object\.entries\(MONSTERS\)/, "it reads MONSTERS when it runs");
  assert.match(src.slice(at, at + 600), /\$\('dm-spawn'\)\.replaceChildren/, "it fills #dm-spawn");
  assert.match(src, /initPacks\(\{[^]*?changed: \(\) => \{\s*buildSpawn\(\)/, "and it runs again when the packs change");
  assert.equal(src.split("\n").filter((l) => l.includes("'dm-spawn'")).length, 1, "nothing else fills the list");
});
