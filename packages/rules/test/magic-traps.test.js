// A magical object's save (#927): Magic Resistance gives Advantage on the Fire-Casting Statue's save and not on a mundane trap's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);

// An open stone floor with the given objects on it; the fighter is Pat's and stands at -2,0.
function floor(objects = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(8);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  return s;
}

const MR = { id: "magic-resistance", name: "Magic Resistance", modifiers: [{ on: "save", op: "advantage", magic: true }] };
const thing = (id, def, q, r) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial });
const saveOf = (def, resistant) => {
  const s = floor([thing("t", def, 1, 0)]);
  if (resistant) s.entities.fighter.feats = [...(s.entities.fighter.feats ?? []), MR];
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT));
  return { save: r.events.find((e) => e.type === "save"), notes: r.events.filter((e) => e.type === "manual" && e.unsure !== undefined) };
};

test("the Fire-Casting Statue is marked magical, and no other sample trap is", () => {
  assert.equal(CONTENT.objects["fire-casting-statue"].magic, true);
  assert.deepEqual(Object.values(CONTENT.objects).filter((o) => o.magic).map((o) => o.id), ["fire-casting-statue"]);
  assert.deepEqual(lintPack(PACKS[0]), []);
});

test("a creature with Magic Resistance has Advantage on the statue's save", () => {
  const { save, notes } = saveOf("fire-casting-statue", true);
  assert.equal(save.mode, "adv");
  assert.ok(save.why.includes("Magic Resistance"), save.why);
  assert.deepEqual(notes, []);
});

test("and none on a mundane trap's save, with no note either", () => {
  for (const def of ["collapsing-roof", "falling-net"]) {
    const { save, notes } = saveOf(def, true);
    assert.equal(save.mode, undefined, def);
    assert.deepEqual(notes, [], def);
  }
});

test("a creature without the trait has none on the statue's save", () => {
  assert.equal(saveOf("fire-casting-statue", false).save.mode, undefined);
});

test("a homebrew object may say it is magical, and a non-boolean is refused", () => {
  const def = { ...structuredClone(CONTENT.objects["falling-net"]), id: "rune-net", source: "Homebrew" };
  assert.deepEqual(lintPack({ ...PACKS[0], objects: [{ ...def, magic: true }] }).filter((p) => p.includes("magic")), []);
  assert.ok(lintPack({ ...PACKS[0], objects: [{ ...def, magic: "yes" }] }).some((p) => p.includes("`magic` is true or false")));
});
