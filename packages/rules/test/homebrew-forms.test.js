// A homebrew monster cannot be a form (#402): not for a `summon` step with `forms`, not for Wild Shape. The DM's own
// `spawn` of it is unaffected, and with no pack installed nothing changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { apply, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { spellProfile } from "../src/effects.js";
import { HOMEBREW_FORM, isHomebrew } from "../src/summons.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const SAME = HOMEBREW_FORM;

const hb = (name, base, over = {}) => ({ ...structuredClone(CONTENT.monsters[base]), id: `hb-ember-folk-${name}`, name: `Ember ${name}`, source: "homebrew:ember-folk", checked: false, text: "An ember beast.", ...over });
const OWLET = "hb-ember-folk-owlet", WOLFLING = "hb-ember-folk-wolfling", ASH = "hb-ember-folk-ash-sprite";
const PACK = { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "ember-folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
  monsters: [hb("owlet", "owl"), hb("wolfling", "wolf"), hb("ash-sprite", "owl", { type: "fey" })] };
const loaded = () => { const r = loadPack(PACK); assert.ok(r.ok, r.problems?.join("; ")); return r.pack; };
const OV = () => overlayOf([loaded()]);

function wizardTable() {
  const s = newGame(5);
  s.settings.autoEngage = false;
  s.entities.wizard.spells.push("find-familiar");
  ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
  return s;
}
// A space that works for an SRD form, found by trying the neighbours with the control cast on a copy.
function spot(s) {
  const p = s.entities.wizard.pos;
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) {
    const at = { q: p.q + dq, r: p.r + dr }, c = structuredClone(s);
    if (apply(c, { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fey", at: [at] } }, PAT).ok) return at;
  }
  assert.fail("no free space");
}
const cast = (s, form, at, ctx = PAT) => apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form, type: "fey", at: [at] } }, ctx);

test("Find Familiar with a homebrew Beast of Challenge Rating 0: refused for a player and for the DM, the state unchanged", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    assert.ok(CONTENT.monsters[OWLET] && isHomebrew(CONTENT.monsters[OWLET]) && !isHomebrew(CONTENT.monsters.owl));
    for (const ctx of [PAT, DM]) {
      const was = JSON.stringify(s), r = cast(s, OWLET, at, ctx);
      assert.equal(r.ok, false);
      assert.equal(r.error, SAME);
      assert.equal(JSON.stringify(s), was, "a rejected action changes nothing");
    }
    // An SRD form still works in the same overlay.
    const r = cast(s, "owl", at);
    ok(r);
    assert.equal(s.entities[r.events.find((e) => e.type === "summoned").id].tpl, "owl");
  });
});

test("a homebrew monster of the wrong type or rating is refused with the same sentence, not by a message that names it", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    for (const id of [WOLFLING, ASH]) {
      const was = JSON.stringify(s), r = cast(s, id, at);
      assert.equal(r.error, SAME);
      assert.equal(JSON.stringify(s), was);
    }
  });
});

test("a type-and-rating filter does not offer a homebrew monster: the choices the player is sent hold the filter only", () => {
  const ov = OV(), s = wizardTable();
  using(ov, () => {
    // What the player is sent about the spell is the filter only, never a list of ids.
    assert.deepEqual(spellProfile(CONTENT.spells["find-familiar"]).summon.forms, { type: "beast", cr: 0 });
    const sent = JSON.stringify(view(s, PAT));
    for (const id of [OWLET, WOLFLING, ASH, "Ember owlet"]) assert.equal(sent.includes(id), false, `${id} is not in the player's view`);
    const ids = Object.keys(CONTENT.monsters).filter((id) => CONTENT.monsters[id].type === "beast" && CONTENT.monsters[id].cr === 0 && !isHomebrew(CONTENT.monsters[id]));
    assert.ok(ids.includes("owl") && !ids.includes(OWLET));
  });
});

test("the DM's spawn of the same homebrew monster still works", () => {
  const ov = OV(), s = wizardTable();
  const r = using(ov, () => apply(s, { type: "spawn", monster: OWLET, at: { q: 3, r: 3 } }, DM));
  ok(r);
  assert.equal(s.entities[r.events[0].id].tpl, OWLET);
});

// ---------- Wild Shape ----------
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = { name: "Ven", class: "druid", level: 2, abilities: A, skills: ["nature", "perception"], choices: { "primal-order": "warden" },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
function druidField() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(druid).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const shape = (s, form, ctx) => apply(s, { type: "feature", actor: "hero", feature: "wild-shape", form }, ctx);

test("Wild Shape into a homebrew Beast a level-2 druid could otherwise become is refused, the state unchanged", () => {
  const ov = OV(), s = druidField();
  using(ov, () => {
    for (const ctx of [PAT, DM]) for (const id of [WOLFLING, OWLET, ASH]) {
      const was = JSON.stringify(s), r = shape(s, id, ctx);
      assert.equal(r.ok, false);
      assert.equal(r.error, SAME, id);
      assert.equal(JSON.stringify(s), was);
    }
    ok(shape(s, "wolf", PAT));
    assert.equal(s.entities.hero.form.block, "wolf");
  });
});

test("with no pack installed nothing changes: SRD forms work, an unknown id is refused as before", () => {
  const s = wizardTable(), at = spot(s);
  assert.equal(cast(s, OWLET, at).error, "Choose a form Find Familiar can take.");
  ok(cast(s, "owl", at));
  const d = druidField();
  assert.equal(shape(d, WOLFLING, PAT).error, "No such creature.");
  ok(shape(d, "wolf", PAT));
  assert.ok(!isHomebrew(null) && !isHomebrew({}) && !isHomebrew({ source: "SRD 5.2.1" }));
});
