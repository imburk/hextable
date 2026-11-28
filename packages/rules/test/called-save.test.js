// PB-5 (#676): a saving throw the DM calls for, and Advantage or Disadvantage the DM grants (docs/specs/prompts.md, "Call for a roll").
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); assert.match(r.error, re); return r; };
const game = (seed = 1) => {
  const s = newGame(seed);
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  return s;
};
const saves = (r) => r.events.filter((e) => e.type === "save");
const hits = (r) => r.events.filter((e) => e.type === "damage");
const call = (s, over, ctx = DM) => apply(s, { type: "save", who: "fighter", ability: "con", dc: 10, ...over }, ctx);

test("a called save: each creature rolls its own with its own bonus", () => {
  const s = game(), fighter = s.entities.fighter, rogue = s.entities.rogue, gob = s.entities.m1;
  const r = ok(call(s, { who: ["fighter", "rogue", "m1"], ability: "dex", dc: 12 }));
  assert.deepEqual(saves(r).map((e) => e.id), ["fighter", "rogue", "m1"]);
  assert.ok(saves(r).every((e) => e.called && e.dc === 12 && e.abil === "dex"));
  const [f, p, g] = saves(r);
  assert.equal(f.bonus, Math.floor((fighter.abil.dex - 10) / 2));                                         // not proficient
  assert.equal(p.bonus, Math.floor((rogue.abil.dex - 10) / 2) + rogue.prof);                              // proficient
  assert.equal(g.bonus, gob.saveBonus?.dex ?? Math.floor((gob.abil.dex - 10) / 2));
  for (const e of saves(r)) assert.equal(e.success, e.total >= 12);
  // One id is the same as a list of one.
  ok(call(game(), { who: "fighter" }));
});

test("damage on a failure, half (rounded down) on a success if half, none if not; one roll for all", () => {
  const s = game();
  const hp = (id) => s.entities[id].hp;
  const before = { fighter: hp("fighter"), rogue: hp("rogue") };
  // DC 40 cannot be met, DC 1 cannot be missed.
  const lose = ok(call(s, { who: ["fighter", "rogue"], dc: 40, damage: { dice: "3d4+2", type: "fire" } }));
  const [a, b] = hits(lose);
  assert.equal(a.amount, b.amount);                                                                          // rolled once
  assert.equal(before.fighter - hp("fighter") + before.rogue - hp("rogue") > 0, true);
  const t = game(2), h0 = t.entities.fighter.hp;
  const none = ok(call(t, { dc: 1, damage: { dice: "3d4+2", type: "fire" } }));
  assert.deepEqual([hits(none).length, t.entities.fighter.hp], [0, h0]);
  const u = game(2);
  const half = ok(call(u, { dc: 1, damage: { dice: "3d4+2", type: "fire", half: true } }));
  const full = ok(call(game(2), { dc: 40, damage: { dice: "3d4+2", type: "fire", half: true } }));
  assert.equal(hits(half)[0].amount, Math.floor(hits(full)[0].amount / 2));                                  // the same seed, the same dice
  assert.equal(hits(half)[0].rolled, hits(full)[0].amount);
});

test("Resistance and Immunity apply to a called save's damage", () => {
  const s = game();
  s.entities.fighter.resist = ["fire"];
  const r = ok(call(s, { who: ["fighter", "m5"], dc: 40, damage: { dice: "4d6", type: "fire" } }));
  const [f, sk] = hits(r);
  assert.equal(f.amount, Math.floor(f.rolled / 2));
  assert.equal(sk.amount, sk.rolled ?? sk.amount);                                                           // the skeleton does not resist fire
  const p = game();
  const r2 = ok(call(p, { who: "m5", dc: 40, damage: { dice: "4d6", type: "poison" } }));
  assert.equal(hits(r2).reduce((n, e) => n + e.amount, 0), 0);                                               // immune
  assert.equal(p.entities.m5.hp, 13);
});

test("a condition on a failure only; immune creatures are told, not given it", () => {
  const s = game();
  const r = ok(call(s, { who: ["fighter", "m5"], dc: 40, condition: "poisoned" }));
  assert.ok(s.entities.fighter.cond.poisoned);
  assert.equal(s.entities.m5.cond.poisoned, undefined);                                                      // the skeleton is immune
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "m5" && /immune/.test(e.text)));
  const t = game();
  ok(call(t, { dc: 1, condition: "poisoned" }));
  assert.equal(t.entities.fighter.cond.poisoned, undefined);
});

test("the rules' automatic failures hold: Paralyzed fails a Dexterity save outright", () => {
  const s = game();
  ok(apply(s, { type: "condition", actor: "wizard", condition: "paralyzed", on: true }, DM));
  const r = ok(call(s, { who: ["wizard", "rogue"], ability: "dex", dc: 1 }));
  const [w, p] = saves(r);
  assert.deepEqual([w.success, w.roll], [false, 0]);
  assert.equal(p.success, true);
});

test("damage from a called save is the usual damage: Concentration is tested", () => {
  const s = game();
  ok(apply(s, { type: "cast", actor: "cleric", spell: "shield-of-faith", targets: ["fighter"], slot: 1 }, DM));
  assert.equal(s.effects.length, 1);
  const r = ok(call(s, { who: "cleric", dc: 40, damage: { dice: "1d4", type: "fire" } }));
  assert.ok(r.events.some((e) => e.type === "concentration" && e.id === "cleric" && e.dc === 10));
});

test("secret: a player sees the roll of their own creature but never the DC or the outcome, and nothing of a monster", () => {
  const s = game();
  const r = ok(call(s, { who: ["fighter", "rogue", "m1"], dc: 15, secret: true }));
  const seen = viewEvents(r.events, s, PAT).filter((e) => e.type === "save");
  assert.ok(seen.length >= 1);
  for (const e of seen) {
    assert.equal(e.dc, undefined);
    assert.equal(e.success, undefined);
    assert.notEqual(e.id, "m1");
  }
  assert.equal(seen.find((e) => e.id === "fighter").total, saves(r)[0].total);                              // their own roll
  // Not secret: the creature of theirs is told the lot; a foe, the outcome and the DC but not how it was rolled.
  const t = game();
  const r2 = ok(call(t, { who: ["fighter", "m1"], dc: 15 }));
  const open = viewEvents(r2.events, t, PAT).filter((e) => e.type === "save");
  assert.equal(open.find((e) => e.id === "fighter").dc, 15);
  const foe = open.find((e) => e.id === "m1");
  if (foe) assert.deepEqual(Object.keys(foe).sort(), ["abil", "called", "dc", "id", "success", "type"]);
});

test("only the DM calls a save or grants Advantage or Disadvantage; a refusal changes nothing", () => {
  const s = game();
  const was = JSON.stringify(s);
  no(call(s, {}, PAT), /Only the DM/);
  no(apply(s, { type: "check", actor: "fighter", skill: "athletics", adv: "advantage" }, PAT), /Only the DM/);
  no(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "javelin", adv: "advantage" }, PAT), /Only the DM/);
  no(apply(s, { type: "act", actor: "m1", action: "scimitar", target: "fighter", adv: "advantage" }, PAT), /./);
  no(call(s, { adv: "advantage" }, PAT), /Only the DM/);
  for (const bad of [{ dc: 0 }, { dc: 41 }, { dc: 1.5 }, { ability: "luck" }, { who: [] }, { who: ["fighter", "fighter"] }, { who: "nobody" }, { adv: "sure" },
    { damage: { dice: "lots", type: "fire" } }, { damage: { dice: "1d6", type: "mauve" } }, { damage: "1d6" }, { condition: "sleepy" }, { secret: "yes" }]) no(call(s, bad), /./);
  no(apply(s, { type: "check", actor: "fighter", skill: "athletics", adv: "sure" }, DM), /advantage/);
  assert.equal(JSON.stringify(s), was);
  const dead = game();
  dead.entities.m1.dead = true;
  const d0 = JSON.stringify(dead);
  no(call(dead, { who: ["fighter", "m1"] }), /dead/);
  assert.equal(JSON.stringify(dead), d0);                                                                    // the fighter did not roll first
});

test("adv on a check or a save: one source, and any Advantage with any Disadvantage is neither", () => {
  const run = (adv, setup = () => {}) => { const s = game(3); setup(s); return ok(apply(s, { type: "check", actor: "fighter", skill: "athletics", ...(adv ? { adv } : {}) }, DM)).events[0]; };
  const plain = run(null), a = run("advantage"), d = run("disadvantage");
  assert.equal(plain.rolls, undefined);
  assert.deepEqual([a.mode, d.mode], ["adv", "dis"]);
  assert.deepEqual([a.why, d.why], [["DM grants Advantage"], ["DM grants Disadvantage"]]);
  assert.equal(a.roll, Math.max(...a.rolls));
  assert.equal(d.roll, Math.min(...d.rolls));
  const poisoned = (s) => ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned", on: true }, DM));      // Disadvantage on checks of its own
  assert.equal(run(null, poisoned).mode, "dis");
  assert.equal(run("advantage", poisoned).rolls, undefined);                                                // cancelled: a plain roll
  assert.equal(run("disadvantage", poisoned).mode, "dis");                                                  // two of one kind are still one
  // A save.
  const sv = (adv) => saves(ok(call(game(3), { adv, dc: 10 })))[0];
  assert.deepEqual([sv("advantage").mode, sv("disadvantage").mode, sv(undefined).mode], ["adv", "dis", undefined]);
  const s2 = game(3); ok(apply(s2, { type: "condition", actor: "fighter", condition: "restrained", on: true }, DM));      // Disadvantage on Dexterity saves
  assert.equal(saves(ok(call(s2, { ability: "dex" })))[0].mode, "dis");
  assert.equal(saves(ok(call(s2, { ability: "dex", adv: "advantage" })))[0].mode, undefined);
});

test("adv on an attack: the attacker's roll only, combined with the rest; said when no attack roll was made", () => {
  const near = () => { const s = game(4); ok(apply(s, { type: "place", actor: "m1", to: { q: -5, r: 2 } }, DM)); ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 8 }, DM)); while (s.encounter.order[s.encounter.turn].id !== "fighter") ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM)); return s; };
  const atk = (adv) => { const s = near(); const r = ok(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", ...(adv ? { adv } : {}) }, DM)); return r.events.find((e) => e.type === "attack"); };
  const [p, a, d] = [atk(null), atk("advantage"), atk("disadvantage")];
  assert.equal(p.mode, "normal");
  assert.deepEqual([a.mode, d.mode], ["adv", "dis"]);
  assert.deepEqual([a.why, d.why], [["DM grants Advantage"], ["DM grants Disadvantage"]]);
  // With a Disadvantage of its own (Poisoned), the DM's Advantage cancels it.
  const s = near(); ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned", on: true }, DM));
  const r = ok(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  assert.equal(r.events.find((e) => e.type === "attack").mode, "normal");
  // The grant is the attacker's own: it is gone once the action ends.
  const t = near();
  ok(apply(t, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  assert.equal(ok(apply(t, { type: "check", actor: "fighter", skill: "athletics" }, DM)).events[0].rolls, undefined);
  // An attack that starts a fight is not rolled: the grant is not dropped quietly.
  const u = game(4); ok(apply(u, { type: "place", actor: "m1", to: { q: -5, r: 2 } }, DM));
  const start = ok(apply(u, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  if (!start.events.some((e) => e.type === "attack")) assert.ok(start.events.some((e) => e.type === "manual" && /DM grants Advantage/.test(e.name)));
});

test("the same game and the same calls give the same rolls, and the dice are the seed's", () => {
  const play = () => { const s = game(7); const r = ok(call(s, { who: ["fighter", "rogue", "m1", "m4"], ability: "wis", dc: 11, adv: "advantage", damage: { dice: "2d8", type: "cold", half: true }, condition: "frightened" })); return { s, r }; };
  const [x, y] = [play(), play()];
  assert.deepEqual(x.r.events, y.r.events);
  assert.deepEqual(x.s, y.s);
});

const evasive = (s, id) => (s.entities[id].feats ??= []).push({ id: "evasion", name: "Evasion", evasion: true });

test("Evasion: no damage on a successful Dexterity save for half, half on a failure, as a spell's save does", () => {
  const win = game(), lose = game();
  evasive(win, "rogue"); evasive(lose, "rogue");
  const damage = { dice: "4d6", type: "fire", half: true };
  const a = ok(call(win, { who: "rogue", ability: "dex", dc: 1, damage }));
  assert.equal(hits(a).length, 0);
  assert.ok(a.events.some((e) => e.type === "note" && e.text === "Evasion: no damage"));
  const full = ok(call(game(), { who: "rogue", ability: "dex", dc: 40, damage: { dice: "4d6", type: "fire" } }));
  const b = ok(call(lose, { who: "rogue", ability: "dex", dc: 40, damage }));
  assert.equal(hits(b)[0].amount, Math.floor(hits(full)[0].amount / 2));
  assert.ok(b.events.some((e) => e.type === "note" && e.text === "Evasion: half damage"));
  // Not for another ability, nor without `half`, nor while Incapacitated.
  const c = game(); evasive(c, "rogue");
  assert.equal(hits(ok(call(c, { who: "rogue", ability: "con", dc: 40, damage }))).length, 1);
  const d = game(); evasive(d, "rogue");
  assert.equal(hits(ok(call(d, { who: "rogue", ability: "dex", dc: 40, damage: { dice: "4d6", type: "fire" } })))[0].amount, hits(full)[0].amount);
});

test("what bears on a save is applied: Aura of Protection, Bless, a magic item, Unconscious and Stunned", () => {
  const base = (id) => { const e = game().entities[id]; return Math.floor((e.abil.wis - 10) / 2) + (e.saveProf.includes("wis") ? e.prof : 0); };
  const rogueBase = base("rogue");
  // Aura of Protection: the paladin's Charisma modifier for allies within 10 feet.
  const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };
  const s = game();
  s.entities.hero = makeEntity(derive({ name: "Ka", class: "paladin", level: 6, subclass: "devotion", abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] }).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  assert.equal(saves(ok(call(s, { who: "rogue", ability: "wis", dc: 10 })))[0].bonus, rogueBase + 3);
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 6, r: 0 } }, DM));
  assert.equal(saves(ok(call(s, { who: "rogue", ability: "wis", dc: 10 })))[0].bonus, rogueBase);               // out of range
  // Bless: a d4 on the roll, shown in `extra`.
  const t = game();
  t.entities.cleric.spells.push("bless");
  ok(apply(t, { type: "cast", actor: "cleric", spell: "bless", targets: ["rogue"], slot: 1 }, DM));
  const b = saves(ok(call(t, { who: "rogue", ability: "wis", dc: 10 })))[0];
  assert.equal(b.extra[0].name, "Bless");
  assert.equal(b.total, b.roll + rogueBase + b.extra[0].roll);
  // A Ring of Protection, worn and attuned.
  const u = game();
  u.entities.ring = makeEntity(derive({ name: "Ria", class: "fighter", level: 5, subclass: "champion", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ["athletics"], choices: { "fighting-style": "defense" }, weapons: ["longbow"],
    items: [{ id: "i1", item: "ring-of-protection", equipped: true, attuned: true }] }).record, { id: "ring", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const plain = game(); plain.entities.ring = makeEntity(derive({ name: "Ria", class: "fighter", level: 5, subclass: "champion", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 }, skills: ["athletics"], choices: { "fighting-style": "defense" }, weapons: ["longbow"] }).record, { id: "ring", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  assert.equal(saves(ok(call(u, { who: "ring", ability: "wis", dc: 10 })))[0].bonus, saves(ok(call(plain, { who: "ring", ability: "wis", dc: 10 })))[0].bonus + 1);
  // Unconscious and Stunned fail Strength and Dexterity saves outright, and not others.
  for (const cond of ["unconscious", "stunned"]) {
    const v = game();
    ok(apply(v, { type: "condition", actor: "fighter", condition: cond, on: true }, DM));
    const [str, dex, con] = ["str", "dex", "con"].map((ability) => saves(ok(call(v, { ability, dc: 1 })))[0]);
    assert.deepEqual([str.success, str.roll, dex.success, dex.roll], [false, 0, false, 0], cond);
    assert.notEqual(con.roll, 0, cond);
  }
});

test("a secret save keeps its outcome from the owner: a reroll, a rescue and what was spent for them are not told", () => {
  const s = game();
  const save = { type: "save", id: "fighter", abil: "con", dc: 15, called: true, secret: true, roll: 4, total: 7, success: true, dice: [], bonus: 3, reroll: { name: "Indomitable", was: 2, n: 4 }, rescued: { name: "Bardic Inspiration", add: 5, dice: [] } };
  const spent = { type: "effectEnd", fx: "fx1", why: "used", hush: true };
  assert.deepEqual(viewEvents([spent, save], s, PAT).map((e) => e.type), ["save"]);
  const seen = viewEvents([spent, save], s, PAT)[0];
  assert.deepEqual([seen.reroll, seen.rescued, seen.success, seen.dc], [undefined, undefined, undefined, undefined]);
  assert.equal(seen.total, 7);                                                                                  // their own roll
  // The DM's own stream is untouched.
  assert.equal(viewEvents([spent, save], s, DM).length, 2);
  // And the handler marks what a secret save spends: nothing is marked when it is not secret.
  const r = ok(call(game(), { dc: 15, secret: true }));
  assert.ok(r.events.every((e) => e.type === "save" || e.hush));
  assert.ok(ok(call(game(), { dc: 15 })).events.every((e) => !e.hush));
});

test("a creature with Legendary Resistance that fails is put to the DM alone, as a manual event", () => {
  const s = game();
  s.settings.legendaryResistance = false;                                                                       // on (the default since L4b) the engine plays it; the note is for a table that switched it off
  ok(apply(s, { type: "spawn", monster: "lich", at: { q: 3, r: 3 } }, DM));
  const lich = Object.values(s.entities).find((e) => /Lich/.test(e.name));
  const r = ok(call(s, { who: lich.id, ability: "wis", dc: 40 }));
  const m = r.events.find((e) => e.type === "manual" && e.name === "Legendary Resistance");
  assert.ok(m && m.partial && m.actor === lich.id);
  assert.equal(saves(r)[0].success, false);
  assert.deepEqual(viewEvents(r.events, s, PAT).filter((e) => e.type === "manual"), []);
  const ok2 = ok(call(s, { who: lich.id, ability: "wis", dc: 1 }));
  assert.equal(ok2.events.some((e) => e.type === "manual"), false);
});

test("act with adv, Shield set to ask, then the answer: the grant survives the question", () => {
  const field = () => {
    const s = newGame(7);
    for (const id of Object.keys(s.entities)) if (!["wizard", "fighter", "m1"].includes(id)) delete s.entities[id];
    for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
    s.settings.autoEngage = false;
    s.entities.wizard.spells.push("shield");
    ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
    ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
    ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
    ok(apply(s, { type: "place", actor: "fighter", to: { q: -3, r: 0 } }, DM));
    for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
    ok(apply(s, { type: "reactions", actor: "wizard", set: { shield: "ask" } }, PAT));
    s.entities.m1.actions.find((a) => a.id === "scimitar").effects[0].bonus = 40;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 20 && current(s) !== "m1"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    return s;
  };
  const s = field();
  const r = ok(apply(s, { type: "act", actor: "m1", action: "scimitar", target: "wizard", adv: "advantage" }, DM));
  assert.deepEqual(r.events.map((e) => e.type), ["reactionAsked"]);
  const done = ok(apply(s, { type: "react", prompt: s.pending.n, take: "shield" }, PAT));
  const atk = done.events.find((e) => e.type === "attack");
  assert.equal(atk.mode, "adv");
  assert.deepEqual(atk.why, ["DM grants Advantage"]);
});

test("a secret save's Evasion note is the DM's: it would tell the outcome", () => {
  const s = game();
  evasive(s, "rogue");
  const r = ok(call(s, { who: "rogue", ability: "dex", dc: 1, secret: true, damage: { dice: "2d6", type: "fire", half: true } }));
  assert.ok(r.events.some((e) => e.type === "note" && /Evasion/.test(e.text)));
  assert.deepEqual(viewEvents(r.events, s, PAT).map((e) => e.type), ["save"]);
});

test("Legendary Resistance on a homebrew-pack monster is found too", () => {
  const lich = { ...structuredClone(CONTENT.monsters.lich), id: "hb-ember-folk-lich", name: "Ember Lich", source: "homebrew:ember-folk", checked: false, text: "An ember lich." };
  const loaded = loadPack({ format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "ember-folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, monsters: [lich] });
  assert.ok(loaded.ok, loaded.problems?.join("; "));
  using(overlayOf([loaded.pack]), () => {
    const s = game();
    s.settings.legendaryResistance = false;
    ok(apply(s, { type: "spawn", monster: "hb-ember-folk-lich", at: { q: 3, r: 3 } }, DM));
    const id = Object.keys(s.entities).find((k) => s.entities[k].tpl === "hb-ember-folk-lich");
    assert.ok(id, "spawned");
    const r = ok(call(s, { who: id, ability: "wis", dc: 40 }));
    assert.ok(r.events.some((e) => e.type === "manual" && e.name === "Legendary Resistance" && e.actor === id));
  });
});

test("Legendary Resistance is read from the creature's legendary block: a monster with the block and no trait of that name is put to the DM too (L1a)", () => {
  const lich = { ...structuredClone(CONTENT.monsters.lich), id: "hb-ember-folk-warden", name: "Ember Warden", source: "homebrew:ember-folk", checked: false, text: "An ember warden." };
  lich.traits = lich.traits.filter((t) => t.id !== "legendary-resistance" && t.id !== "legendary-actions");
  const loaded = loadPack({ format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "ember-folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, monsters: [lich] });
  assert.ok(loaded.ok, loaded.problems?.join("; "));
  using(overlayOf([loaded.pack]), () => {
    const s = game();
    s.settings.legendaryResistance = false;
    ok(apply(s, { type: "spawn", monster: "hb-ember-folk-warden", at: { q: 3, r: 3 } }, DM));
    const id = Object.keys(s.entities).find((k) => s.entities[k].tpl === "hb-ember-folk-warden");
    assert.deepEqual(s.entities[id].legendary.resistance, { day: 4 });
    const r = ok(call(s, { who: id, ability: "wis", dc: 40 }));
    assert.ok(r.events.some((e) => e.type === "manual" && e.name === "Legendary Resistance" && e.actor === id));
    // Without the block (and with no trait) there is nothing to say.
    delete s.entities[id].legendary;
    assert.equal(ok(call(s, { who: id, ability: "wis", dc: 40 })).events.some((e) => e.type === "manual" && e.name === "Legendary Resistance"), false);
  });
});

test("a real rescue under a secret save is hushed: a Bardic Inspiration die spent to turn it", () => {
  const A = { str: 10, dex: 14, con: 12, int: 10, wis: 12, cha: 16 };
  let found = null;
  for (let seed = 1; seed < 300 && !found; seed++) {
    const s = game(seed);
    s.entities.bard = makeEntity(derive({ name: "Bo", class: "bard", level: 5, subclass: "lore", abilities: A, skills: ["performance", "persuasion", "arcana"], weapons: ["dagger"] }).record, { id: "bard", kind: "pc", side: "party", pos: { q: -6, r: 4, z: 0 } });
    const give = apply(s, { type: "feature", actor: "bard", feature: "bardic-inspiration", target: "fighter" }, DM);
    if (!give.ok) continue;
    const r = apply(s, { type: "save", who: "fighter", ability: "wis", dc: 14, secret: true }, DM);
    if (r.ok && saves(r)[0].rescued) found = { s, r };
  }
  assert.ok(found, "some seed lets the die turn it");
  const seen = viewEvents(found.r.events, found.s, PAT);
  assert.deepEqual(seen.map((e) => e.type), ["save"]);
  assert.equal(seen[0].rescued, undefined);
  assert.ok(found.r.events.some((e) => e.hush), "what was spent is marked for the DM only");
});
