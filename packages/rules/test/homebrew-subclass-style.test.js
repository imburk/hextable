// Homebrew subclasses, addition B of docs/specs/homebrew-subclasses.md: a subclass feature offers a Fighting Style, and one of its options is a Fighting Style feat
// of the same pack. The oath is invented for this test ("Oath of the Low Tide", a pack "tide-wardens"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintPack } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "tide-wardens", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists, id = P) => ({ format: "hextable-pack", v: 1, pack: { id, name: id, version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feat = (n, name, over = {}) => ({ id: hb(n), name, category: "fighting-style", prerequisite: { feature: "fighting-style" }, tier: "auto", source: SRC, checked: false, text: `${name}, in the pack's own words.`, grants: { armouredAc: 1 }, ...over });
const REEF = feat("reef-guard", "Reef Guard"), SHALLOWS = feat("shallows-shot", "Shallows Shot", { grants: { rangedAttack: 1 } });
const option = (f, over = {}) => ({ id: f.id, name: f.name, tier: f.tier, text: f.text, feat: f.id, ...over });
const stance = (options, more = {}) => ({ id: hb("tide-stance"), name: "Tide Stance", level: 3, tier: "assist", checked: false, text: "Choose a Fighting Style feat from those the oath keeps.", options, ...more });
const sub = (features, over = {}) => ({ id: hb("oath-of-the-low-tide"), name: "Oath of the Low Tide", class: "paladin", source: SRC, checked: false, text: "Paladins who guard the harbour at ebb.", features, ...over });
const OPTIONS = [option(REEF), option(SHALLOWS), { id: "defense", name: "Defense", tier: "auto", text: "+1 to Armor Class while wearing armour.", feat: "defense" }];
const OATH = sub([stance(OPTIONS)]);
const full = (over = {}) => doc({ feats: [REEF, SHALLOWS], subclasses: [OATH], ...over });
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const TIDE = pack(full()), ON = overlayOf([TIDE]);
const SUB = hb("oath-of-the-low-tide"), FEATURE = hb("tide-stance");

// ---------- the characters ----------
const A = { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 };
const paladin = (pick, over = {}) => ({ name: "Brann Saltwick", class: "paladin", level: 3, subclass: SUB, abilities: A, skills: ["athletics", "persuasion"], armour: "chain-mail", weapons: ["longsword"],
  choices: { "fighting-style": "defense", ...(pick === undefined ? {} : { [FEATURE]: pick }) }, ...over });
const said = (sheet) => using(ON, () => validate(sheet));
const lintOf = (d) => lintPack(d, { strict: true });
const refused = (problems, re) => { assert.ok(problems.some((m) => re.test(m)), `no problem matched ${re}: ${problems.join(" | ")}`); };

// ---------- the gate ----------
test("a pack feat that is a Fighting Style feat may be an option of a subclass feature, with an SRD style beside it", () => {
  assert.deepEqual(lintOf(full()), []);
  assert.equal(TIDE.ids.feats?.length ?? 2, 2);
  // The SRD style alone is as it was.
  assert.deepEqual(lintOf(doc({ subclasses: [sub([stance([OPTIONS[2], { ...OPTIONS[2], id: "archery", name: "Archery", feat: "archery", text: "+2 to ranged attacks." }])])] })), []);
});

test("each refusal says what is wrong with the feat", () => {
  refused(lintOf(doc({ feats: [SHALLOWS], subclasses: [OATH] })), /option hb-tide-wardens-reef-guard names the feat "hb-tide-wardens-reef-guard", which is not a feat of this pack: add it to the pack's feats/);
  refused(lintOf(doc({ subclasses: [OATH] })), /which is not a feat of this pack/);
  const general = feat("reef-guard", "Reef Guard", { category: "general", prerequisite: undefined });
  refused(lintOf(full({ feats: [general, SHALLOWS] })), /which is not a Fighting Style feat \(its category is general\): an option can only be one/);
  const other = { ...option(REEF), id: "hb-other-pack-reef-guard", feat: "hb-other-pack-reef-guard" };
  refused(lintOf(doc({ feats: [REEF, SHALLOWS], subclasses: [sub([stance([other, OPTIONS[1]])])] })), /names the feat "hb-other-pack-reef-guard" of another pack: an option can only be a feat of this same pack/);
  refused(lintOf(full({ feats: [{ ...REEF, increase: { from: ["str"], points: 1, max: 20 } }, SHALLOWS] })), /gives ability points, skills or spells to choose: an option gives only what the feat's `grants` give/);
  refused(lintOf(full({ feats: [{ ...REEF, proficiencies: { n: 1 } }, SHALLOWS] })), /gives ability points, skills or spells to choose/);
  refused(lintOf(full({ feats: [{ ...REEF, prerequisite: { level: 4 } }, SHALLOWS] })), /has a level or ability prerequisite: an option is not checked against one/);
  refused(lintOf(full({ feats: [{ ...REEF, name: "Reef Warden" }, SHALLOWS] })), /has another name or tier than the feat Reef Warden/);
  refused(lintOf(full({ feats: [{ ...REEF, tier: "assist" }, SHALLOWS] })), /has another name or tier than the feat Reef Guard/);
  refused(lintOf(doc({ feats: [REEF, SHALLOWS], subclasses: [sub([stance([{ ...option(REEF), id: hb("other-id") }, OPTIONS[1]])])] })), /an option that is a feat has the feat's id and no grants of its own/);
  refused(lintOf(doc({ feats: [REEF, SHALLOWS], subclasses: [sub([stance([{ ...option(REEF), grants: { rangedAttack: 1 } }, OPTIONS[1]])])] })), /an option that is a feat has the feat's id and no grants of its own/);
});

test("the one-entry gate (lintEntry): another pack is refused, this pack's feat is told apart only when the pack's feats are given", () => {
  const ctx = { pack: P };
  const other = { ...option(REEF), id: "hb-other-pack-reef-guard", feat: "hb-other-pack-reef-guard" };
  const bad = lintEntry("subclasses", sub([stance([other, OPTIONS[1]])]), ctx);
  assert.ok(bad.some((m) => /of another pack/.test(m)), bad.join(" | "));
  assert.deepEqual(lintEntry("subclasses", OATH, ctx), [], "with no list of the pack's feats it cannot tell, and lets it pass (as a spell id is)");
  assert.deepEqual(lintEntry("subclasses", OATH, { ...ctx, feats: [REEF, SHALLOWS] }), []);
  assert.ok(lintEntry("subclasses", OATH, { ...ctx, feats: [SHALLOWS] }).some((m) => /not a feat of this pack/.test(m)));
  assert.ok(lintEntry("subclasses", OATH, { ...ctx, feats: [{ ...REEF, category: "origin" }, SHALLOWS] }).some((m) => /not a Fighting Style feat/.test(m)));
});

// ---------- derive ----------
test("a sheet that picks the pack's feat is valid, and derive gives what the feat grants", () => {
  using(ON, () => {
    assert.deepEqual(validate(paladin(hb("reef-guard"))), []);
    const reef = derive(paladin(hb("reef-guard"))), base = derive(paladin("defense"));
    assert.equal(reef.record.ac, base.record.ac, "the pack's feat gives the +1 to Armor Class as Defense does");
    assert.ok(reef.record.feats.some((f) => f.id === `${FEATURE}-${hb("reef-guard")}`), "it is a feature of the record, as an SRD style option is");
    assert.ok(!reef.record.feats.some((f) => f.id === `${FEATURE}-defense`));
    const bare = derive(paladin(hb("shallows-shot"))).record;
    assert.ok(bare.ac < base.record.ac, "another pick gives no Armor Class");
    assert.ok(bare.feats.some((f) => f.id === `${FEATURE}-${hb("shallows-shot")}`));
  });
});

test("validate: a missing pick, an off-list pick and another pack's feat each have a sentence", () => {
  assert.deepEqual(said(paladin()), ["Choose an option for Tide Stance: Reef Guard, Shallows Shot, Defense."]);
  assert.deepEqual(said(paladin(hb("nothing"))), [`Tide Stance has no option "${hb("nothing")}".`]);
  assert.deepEqual(said(paladin("hb-other-pack-reef-guard")), [`Tide Stance has no option "hb-other-pack-reef-guard".`]);
  assert.deepEqual(said(paladin("archery")), [`Tide Stance has no option "archery".`], "an SRD style the feature does not list is off the list");
  assert.deepEqual(said(paladin("defense")), [], "an SRD style the feature does list is fine");
  assert.equal(said(paladin([hb("reef-guard")])).length, 1, "a list for a feature that takes one option is not a pick");
});

test("the pack away: the subclass and its feature are absent, nothing throws, and an SRD sheet is not changed", () => {
  const sheet = paladin(hb("reef-guard"));
  const away = derive(sheet).record;
  assert.ok(!away.feats.some((f) => String(f.id).startsWith("hb-")));
  const srd = paladin("defense", { subclass: "devotion" });
  assert.deepEqual(validate(srd), []);
  assert.equal(json(using(ON, () => derive(srd))), json(derive(srd)), "with the pack lent, an SRD oath derives as before");
});

// ---------- the reading and what a player is sent ----------
test("the reader says the option is a feat of the same pack, and does not call it unknown", () => {
  using(ON, () => {
    const r = readEntry("subclasses", CONTENT.subclasses[SUB], { pack: P, feats: [REEF, SHALLOWS] });
    const text = r.lines.join("\n");
    assert.match(text, /It is the Fighting Style feat "hb-tide-wardens-reef-guard" of the same pack, read as its own entry: the character gets what that feat grants, and nothing else of it\./);
    assert.match(text, /It is the feat "?Defense"?: the character gets what that feat grants/);
    assert.deepEqual(r.problems, []);
    assert.equal(r.refused, false);
    const gone = readEntry("subclasses", OATH, { pack: P, feats: [SHALLOWS] });
    assert.equal(gone.refused, true);
    assert.match(gone.refusals.join(" "), /not a feat of this pack/);
  });
  // A player's copy of the pack holds the feat and the option as written.
  const { data: mine } = forPlayers(full());
  assert.equal(json(mine.subclasses[0].features[0].options[0]), json(OPTIONS[0]));
  assert.ok(mine.feats.some((f) => f.id === hb("reef-guard")));
});

// ---------- in a game ----------
test("setSheet in a game: the pick makes the character, a missing pick is refused, a game replays and refreshes", () => {
  using(ON, () => {
    const s = newGame(5, { party: [{ sheet: paladin(hb("reef-guard")) }] }), t = newGame(5, { party: [{ sheet: paladin(hb("reef-guard")) }] });
    assert.equal(json(s), json(t), "a game replays");
    const before = json(s);
    no(apply(s, { type: "setSheet", sheet: paladin() }, DM), /Choose an option for Tide Stance/);
    assert.equal(json(s), before, "a refused action changes nothing");
    const made = ok(apply(s, { type: "setSheet", sheet: paladin(hb("shallows-shot"), { name: "Brann the Younger" }) }, DM));
    const id = Object.keys(s.entities).find((k) => s.entities[k].name === "Brann the Younger");
    assert.ok(id, `the new character is in the game (${JSON.stringify(made.events?.map((e) => e.type))})`);
    assert.equal(s.entities[id].sheet.choices[FEATURE], hb("shallows-shot"));
    ok(apply(s, { type: "refresh", id }, DM));
    assert.equal(s.entities[id].sheet.choices[FEATURE], hb("shallows-shot"));
    const pc = s.entities.pc1;
    assert.ok(pc.feats.some((f) => f.id === `${FEATURE}-${hb("reef-guard")}`), "the first character has the feat's feature");
    assert.equal(pc.ac, derive(paladin("defense")).record.ac, "and its Armor Class is the +1 of the feat");
  });
});
