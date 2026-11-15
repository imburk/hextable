// Companions, amendments A3 and A4 (docs/specs/companions.md, "Amendments of 14 November"): a foe's companions
// count toward a fight's XP like any foe, seen or unseen, killed or vanished, once; and the cap of 30 per master.
// With twin runs against an unbonded creature, and undo, redo and replay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, BOND_MAX } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { gridOf } from "../src/grid.js";
import { CONTENT } from "../src/content/index.js";
import { SUMMON_MOST } from "../src/content/schema.js";
import { makeEntity } from "../src/engine/sheets.js";
import { derive } from "../src/derive.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
function spot(s, near, n = 0, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out[n];
}
const spawn = (s, monster, at, name) => ok(apply(s, { type: "spawn", monster, at, ...(name ? { name } : {}) }, DM)).events.find((e) => e.type === "spawned").id;
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
const hide = (s, id) => ok(apply(s, { type: "reveal", actor: id, hidden: true }, DM));
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  return s;
}
const seenBy = (s, results) => [U1, U2].map((u) => ({ ev: results.map((r) => json(viewEvents(r.events, s, u))), view: json(view(s, u)), tl: json(viewEvents(s.timeline, s, u)) }));
const shares = (s) => [U1, U2].map((u) => json(view(s, u).conclusion?.xp));

// A hidden mage outside the fight; its companion (or, unbonded, the same wolf) in it, hidden from the party or
// not, with a goblin (`more`) or alone. The fight is won by killing every foe in it, the wolf first; then the DM
// publishes the rewards.
function fight(grid, { bonded, kind, hidden, more = true }) {
  const s = table(grid), f = s.entities.fighter, out = [], live = [];
  // `live`: what each player is sent of each action, at the time, as the server sends it.
  out.push = (...rs) => { for (const r of rs) live.push([U1, U2].map((u) => json(viewEvents(r.events, s, u)))); return Array.prototype.push.apply(out, rs); };
  if (hidden) s.settings.sight = "light";
  const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
  hide(s, mage);
  const pet = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Grey Pet");
  if (more) spawn(s, "goblin-warrior", spot(s, f.pos, 4, 2), "Gob");
  if (bonded) bond(s, pet, mage, { kind });
  out.push(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
  // The fight's start shows what is in the arena, and the DM can't hide a creature in it: unseen is the party
  // blinded, under the sight rule that follows the party's eyes.
  if (hidden) for (const p of Object.values(s.entities).filter((e) => e.side === "party")) out.push(ok(apply(s, { type: "condition", actor: p.id, condition: "blinded" }, DM)));
  const order = s.encounter.order.map((o) => o.id);
  assert.ok(!order.includes(mage) && order.includes(pet));
  const foes = [pet, ...order.filter((id) => id !== pet && s.entities[id].side === "foe")];
  for (const id of foes) if (s.encounter) out.push(ok(apply(s, { type: "harm", actor: id, amount: 999 }, DM)));
  assert.equal(s.encounter, null, "the fight is won");
  const conc = structuredClone(s.conclusion);
  out.push(ok(apply(s, { type: "conclusion", publish: true }, DM)));
  return { s, pet, conc, out, live, seen: seenBy(s, out), seq: s.seq };
}
const counted = (c) => c.foes.filter((f) => f.counts);

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a hidden foe's companion killed unseen leaves a husk that counts as an unbonded twin's death: players get the same, XP shares equal${on}`, () => {
    const A = fight(grid, { bonded: true, kind: "summon", hidden: true }), B = fight(grid, { bonded: false, hidden: true });
    assert.ok(A.s.entities[A.pet].vanished, "a husk");
    assert.deepEqual(A.seen, B.seen, "players' events, views and record");
    assert.equal(A.seq, B.seq);
    assert.deepEqual(shares(A.s), shares(B.s));
    assert.deepEqual(A.conc.xp, B.conc.xp);
    assert.equal(A.conc.foes.filter((f) => f.id === A.pet).length, 1);
    assert.ok(A.conc.foes.find((f) => f.id === A.pet).counts);
  });

  test(`a bonded foe that dies where the party sees it counts as an unbonded twin does: players get the same, XP shares equal${on}`, () => {
    const A = fight(grid, { bonded: true, kind: "undead", hidden: false }), B = fight(grid, { bonded: false, hidden: false });
    assert.ok(A.s.entities[A.pet].dead && A.s.entities[A.pet].bond, "dead, and still bonded");
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    assert.deepEqual(shares(A.s), shares(B.s));
    assert.deepEqual(A.conc.xp, B.conc.xp);
  });

  test(`a bonded foe the party sees vanish counts once, as its unbonded twin's death does, and the DM can untick it${on}`, () => {
    const A = fight(grid, { bonded: true, kind: "summon", hidden: false }), B = fight(grid, { bonded: false, hidden: false });
    assert.equal(A.s.entities[A.pet], undefined, "it vanished");
    assert.deepEqual(shares(A.s), shares(B.s), "the same XP shares");
    assert.deepEqual(A.conc.xp, B.conc.xp);
    assert.deepEqual(counted(A.conc).map((f) => f.id), counted(B.conc).map((f) => f.id), "the same foes, each once");
    const gone = A.conc.foes.find((f) => f.id === A.pet);
    assert.deepEqual(gone, { id: A.pet, name: "Grey Pet", tpl: "wolf", xp: CONTENT.monsters.wolf.xp, counts: true, gone: true, shown: "Grey Pet" });
    // The party saw it vanish, so its card names it, as it names the twin's corpse.
    for (const u of [U1, U2]) assert.deepEqual(view(A.s, u).conclusion.foes, view(B.s, u).conclusion.foes);
    const said = (s) => s.timeline.find((e) => e.type === "chronicle" && e.tags?.includes("fight")).text;
    assert.equal(said(A.s), said(B.s));
    // The last foe in the fight: the fight ends before it vanishes, so it is counted among the fight's creatures, once.
    const L = fight(grid, { bonded: true, kind: "summon", hidden: false, more: false }), M = fight(grid, { bonded: false, hidden: false, more: false });
    assert.equal(L.s.entities[L.pet], undefined);
    assert.deepEqual(L.conc.foes.map((f) => [f.id, f.counts]), M.conc.foes.map((f) => [f.id, f.counts]));
    assert.deepEqual(shares(L.s), shares(M.s));
    // Before publishing, the DM may untick it like any foe.
    const s = table(grid), f = s.entities.fighter;
    const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
    const pet = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Grey Pet");
    bond(s, pet, mage, { kind: "summon" });
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    const foes = s.encounter.order.map((o) => o.id).filter((id) => s.entities[id].side === "foe");
    for (const id of [pet, ...foes.filter((x) => x !== pet)]) if (s.encounter) ok(apply(s, { type: "harm", actor: id, amount: 999 }, DM));
    const base = s.conclusion.xp.base;
    refused(s, { type: "conclusion", edit: { foes: { [pet]: false } } }, U1, /Only the DM/);
    ok(apply(s, { type: "conclusion", edit: { foes: { [pet]: false } } }, DM));
    assert.equal(s.conclusion.xp.base, base - CONTENT.monsters.wolf.xp);
  });

  test(`undo and redo give back exactly what a seen vanish, an unseen one and their XP did, and the same actions replay the same${on}`, () => {
    const build = () => {
      const s = table(grid), f = s.entities.fighter;
      s.settings.sight = "light";
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
      hide(s, mage);
      const pet = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Grey Pet"), imp = spawn(s, "wolf", spot(s, f.pos, 2, 2), "Imp");
      spawn(s, "goblin-warrior", spot(s, f.pos, 4, 2), "Gob");
      bond(s, pet, mage, { kind: "summon" }); bond(s, imp, mage, { kind: "familiar" });
      return { s, pet, imp };
    };
    const { s, pet, imp } = build();
    const party = Object.values(s.entities).filter((e) => e.side === "party").map((e) => e.id);
    const acts = [
      { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 },
      { type: "harm", actor: pet, amount: 999 },                                         // seen: it vanishes, the fight keeps it
      ...party.map((id) => ({ type: "condition", actor: id, condition: "blinded" })),
      { type: "harm", actor: imp, amount: 999 },                                         // unseen: a husk
    ];
    const h = createHistory(), states = [json(s)], done = [];
    const step = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
    for (const a of acts) step(a);
    assert.deepEqual(s.encounter.gone.map((g) => g.id), [pet]);
    assert.ok(s.entities[imp].vanished);
    for (const id of s.encounter.order.map((o) => o.id)) if (s.encounter && s.entities[id].side === "foe" && !s.entities[id].dead) step({ type: "harm", actor: id, amount: 999 });
    assert.equal(s.encounter, null);
    const once = (id) => s.conclusion.foes.filter((f) => f.id === id);
    assert.equal(once(pet).length, 1); assert.equal(once(imp).length, 1);
    assert.ok(once(pet)[0].counts && once(imp)[0].counts);
    step({ type: "conclusion", edit: { foes: { [imp]: false } } });
    step({ type: "conclusion", publish: true });
    assert.ok(s.timeline.some((e) => e.type === "conclusion" && e.foes.some((f) => f.id === pet && f.gone && f.counts)));
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build().s;
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
  });
}

test("a summon block with XP 0 stays 0 when it counts", () => {
  const s = table(null), f = s.entities.fighter;
  const ABIL = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
  const sheet = { name: "Mira", class: "druid", level: 17, subclass: "land", abilities: ABIL, skills: ["nature", "perception"],
    choices: { "primal-order": "warden", "elemental-fury": "primal-strike", "natures-ward": "polar" },
    armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "giant-insect"] };
  const G = gridOf(s.map);
  const far = [...G.range(f.pos, 9)].find((h) => G.dist(h, f.pos) === 9 && apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok);
  s.entities.mage = makeEntity(derive(sheet).record, { id: "mage", kind: "npc", side: "foe", pos: { ...far, z: 0 } });
  const at = spot(s, f.pos, 3, 3, "giant-spider");
  const id = ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 5, summon: { variant: "spider", at: [at] } }, DM)).events.find((e) => e.type === "summoned").id;
  ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
  const foes = s.encounter.order.map((o) => o.id).filter((x) => s.entities[x].side === "foe");
  assert.ok(foes.includes(id) && !foes.includes("mage"));
  for (const x of [id, ...foes.filter((y) => y !== id)]) if (s.encounter) ok(apply(s, { type: "harm", actor: x, amount: 999 }, DM));
  const c = s.conclusion, insect = c.foes.find((x) => x.id === id);
  assert.equal(insect.counts, true);
  assert.equal(insect.xp, 0);
  assert.equal(c.xp.base, c.foes.filter((x) => x.id !== id).reduce((n, x) => n + x.xp, 0));
});

test("the cap is 30 companions per master, one constant and one refusal for the DM's bond and a spell's summon (A4)", () => {
  assert.equal(BOND_MAX, 30);
  assert.equal(BOND_MAX, SUMMON_MOST, "a summon step never makes more than a master may have");
  const s = table(null), f = s.entities.fighter;
  const wolf = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Greyjaw");
  for (let i = 0; i < BOND_MAX - 1; i++) {
    const id = `x${i}`;
    s.entities[id] = { ...structuredClone(s.entities[wolf]), id, pos: { q: 40 + i, r: 40, z: 0 }, bond: { to: "cleric", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false } };
  }
  const full = structuredClone(s);
  bond(s, wolf, "cleric");                          // the 30th
  const other = spawn(full, "wolf", spot(full, f.pos, 3, 2), "Snow");
  bond(full, other, "cleric");
  const r = refused(full, { type: "bond", actor: wolf, to: "cleric" }, DM, /can have at most 30 companions\./);
  assert.match(r.error, new RegExp(`^${full.entities.cleric.name} can have at most 30 companions\\.$`));
  // A husk does not take room.
  full.entities.x0.vanished = "hp0"; full.entities.x0.dead = true; delete full.entities.x0.bond;
  bond(full, wolf, "cleric");
});

// ---------- review of #330: the last foe to fall (M1), and a foe in a form (M2) ----------

const drop = (evJson, type) => JSON.stringify(JSON.parse(evJson).filter((e) => e.type !== type));
const chronicle = (s) => s.timeline.find((e) => e.type === "chronicle" && e.tags?.includes("fight")).text;

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`the last foe to fall, vanishing where the party sees it, is on the card and in the chronicle as its unbonded twin's corpse is${on} (M1)`, () => {
    const A = fight(grid, { bonded: true, kind: "summon", hidden: false, more: false }), B = fight(grid, { bonded: false, hidden: false, more: false });
    assert.equal(A.s.entities[A.pet], undefined, "it vanished");
    assert.equal(A.s.settings.conclusion ?? "dm", "dm", "the DM reviews first: the conclusion is made before it vanishes and published after");
    for (const u of [U1, U2]) {
      assert.deepEqual(view(A.s, u).conclusion, view(B.s, u).conclusion, "the card");
      assert.ok(view(A.s, u).conclusion.foes.some((f) => f.id === A.pet && f.name === "Grey Pet" && f.counts));
      assert.ok(!json(view(A.s, u)).includes('"gone"') && !json(view(A.s, u)).includes('"shown"'), "neither gone nor shown reaches a player");
    }
    assert.equal(chronicle(A.s), chronicle(B.s));
    assert.match(chronicle(A.s), /Beaten: Grey Pet\./);
    assert.equal(A.seq, B.seq);
    // What players are sent, action by action, differs only by the `vanished` they saw (and the twin's corpse on the map).
    assert.deepEqual(A.live.map((p) => p.map((e) => drop(e, "vanished"))), B.live);
    assert.ok(A.live.flat().some((e) => JSON.parse(e).some((x) => x.type === "vanished" && x.id === A.pet)));
    const tl = (s) => [U1, U2].map((u) => JSON.parse(json(viewEvents(s.timeline, s, u))).filter((e) => e.type === "conclusion" || e.type === "chronicle" || e.type === "xp"));
    assert.deepEqual(tl(A.s), tl(B.s), "the record of the rewards");
  });

  test(`the last foe to fall unseen stays off the card and out of the chronicle, as its unbonded twin does${on} (M1)`, () => {
    const A = fight(grid, { bonded: true, kind: "summon", hidden: true, more: false }), B = fight(grid, { bonded: false, hidden: true, more: false });
    assert.ok(A.s.entities[A.pet].vanished, "a husk");
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    for (const u of [U1, U2]) assert.ok(!view(A.s, u).conclusion.foes.some((f) => f.id === A.pet));
    assert.equal(chronicle(A.s), chronicle(B.s));
  });

  test(`a foe in Wild Shape that vanishes where the party sees it is named on the card and in the chronicle as the Beast it showed${on} (M2)`, () => {
    const run = (last) => {
      const s = table(grid), f = s.entities.fighter, out = [];
      const sheet = { name: "Mira the Druid", class: "druid", level: 5, subclass: "land", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 },
        skills: ["nature", "perception"], choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame"] };
      const boss = spawn(s, "goblin-warrior", spot(s, f.pos, 4, 2), "Boss");
      s.entities.mira = makeEntity(derive(sheet).record, { id: "mira", kind: "npc", side: "foe", pos: { ...spot(s, f.pos, 1, 2), z: 0 } });
      out.push(ok(apply(s, { type: "feature", actor: "mira", feature: "wild-shape", form: "wolf" }, DM)));
      assert.ok(s.entities.mira.form, "in a form");
      bond(s, "mira", boss, { kind: "pet" });
      s.entities.mira.bond.ends = ["masterDies"];
      out.push(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
      const shownName = view(s, U1).entities.mira.name;
      assert.notEqual(shownName, "Mira the Druid");
      const foes = s.encounter.order.map((o) => o.id).filter((id) => s.entities[id].side === "foe" && id !== "mira" && id !== boss);
      // Its master dies first (it vanishes in the fight) or last (after the fight's end).
      for (const id of last ? [...foes, boss] : [boss, ...foes]) if (s.encounter) out.push(ok(apply(s, { type: "harm", actor: id, amount: 999 }, DM)));
      assert.equal(s.encounter, null);
      assert.equal(s.entities.mira, undefined, "it vanished");
      out.push(ok(apply(s, { type: "conclusion", publish: true }, DM)));
      return { s, out, shownName };
    };
    for (const last of [false, true]) {
      const { s, out, shownName } = run(last);
      const dmFoe = s.timeline.find((e) => e.type === "conclusion").foes.find((x) => x.id === "mira");
      assert.equal(dmFoe.name, "Mira the Druid", "the DM's record keeps its name");
      for (const u of [U1, U2]) {
        const sent = json(view(s, u)) + json(viewEvents(s.timeline, s, u)) + out.map((r) => json(viewEvents(r.events, s, u))).join("");
        assert.ok(!sent.includes("Mira"), `nothing a player gets names it${last ? " (last)" : ""}`);
        assert.ok(view(s, u).conclusion.foes.some((x) => x.id === "mira" && x.name === shownName));
      }
      assert.match(chronicle(s), new RegExp(`Beaten: .*${shownName}`));
      assert.ok(!chronicle(s).includes("Mira"));
    }
  });
}
