// Companions, stage C1 (docs/specs/companions.md): the bond, control through the master, the DM's `bond`
// and `companion` actions, vanishing, and what players are sent of it.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { apply, current, ownerOf, vanish, BOND_MAX } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents, viewReactions } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { gridOf } from "../src/grid.js";
import { aiStep } from "../src/ai.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
// Refused, with these words, and the game exactly as it was.
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
// A free cell near a position, where a creature can be added.
function spot(s, near, n = 0, r = 2) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok) out.push(h);
  return out[n];
}
// The valley with two players: u1 plays Brenna (fighter), u2 plays Pip (rogue). A wolf beside Brenna.
function table(grid) {
  const s = newGame(5, grid ? { grid } : {});
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  const wolf = ok(apply(s, { type: "spawn", monster: "wolf", name: "Greyjaw", at: spot(s, s.entities.fighter.pos) }, DM)).events[0].id;
  return { s, wolf };
}
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
const moveTo = (s, id) => { const G = gridOf(s.map); return G.range(s.entities[id].pos, 2).find((h) => apply(structuredClone(s), { type: "move", actor: id, to: h }, DM).ok && (h.q !== s.entities[id].pos.q || h.r !== s.entities[id].pos.r)); };

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a player moves a wolf the DM bonded to their character, and not another player's${on}`, () => {
    const { s, wolf } = table(grid);
    refused(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, U1, /isn't yours to control/);
    const r = bond(s, wolf, "fighter");
    assert.deepEqual(r.events.find((e) => e.type === "bonded"), { type: "bonded", id: wolf, to: "fighter", kind: "pet", side: "party" });
    const w = s.entities[wolf];
    assert.equal(w.side, "party");
    assert.equal(w.owner, null, "a companion has no player of its own");
    assert.equal(ownerOf(s, w), "u1");
    ok(apply(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, U1));
    refused(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, U2, /Greyjaw isn't yours to control/);
    // The player still has one character: claiming another is refused as before.
    refused(s, { type: "claim", entity: "cleric", user: "u1" }, U1, /already have a character/);
  });

  test(`releasing the master hands the wolf to the DM, and claiming gives it back${on}`, () => {
    const { s, wolf } = table(grid);
    bond(s, wolf, "fighter");
    ok(apply(s, { type: "release", entity: "fighter" }, U1));
    assert.equal(ownerOf(s, s.entities[wolf]), null);
    refused(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, U1, /isn't yours/);
    ok(apply(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, DM));
    ok(apply(s, { type: "claim", entity: "fighter", user: "u2", userName: "Bo" }, DM));
    assert.equal(ownerOf(s, s.entities[wolf]), "u2", "it goes with whoever plays its master");
    ok(apply(s, { type: "release", entity: "rogue" }, DM));
    ok(apply(s, { type: "release", entity: "fighter" }, DM));
    ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
    ok(apply(s, { type: "move", actor: wolf, to: moveTo(s, wolf) }, U1));
    // A companion is never claimed itself, by a player or the DM.
    refused(s, { type: "claim", entity: wolf, user: "u2" }, U2, /already taken/);
    refused(s, { type: "claim", entity: wolf, user: "u2" }, DM, /goes with Brenna's player/);
  });

  test(`a noAttack creature's attack is refused and the state is unchanged${on}`, () => {
    const { s, wolf } = table(grid);
    bond(s, wolf, "fighter", { kind: "familiar", noAttack: true });
    const gob = s.entities.m1;
    s.entities[wolf].pos = { ...spot(s, gob.pos, 0, 1), z: 0 };
    refused(s, { type: "attack", actor: wolf, target: "m1", attack: "bite" }, U1, /Greyjaw can't attack/);
    refused(s, { type: "act", actor: wolf, action: "bite", target: "m1" }, U1, /Greyjaw can't attack/);
    refused(s, { type: "attack", actor: wolf, target: "m1", attack: "bite" }, DM, /can't attack/);
    assert.equal(s.encounter, null, "no fight started");
    // A creature that can't attack makes no Opportunity Attack either.
    assert.deepEqual(viewReactions(s, U1), {});
    // The same wolf without the bond attacks.
    bond(s, wolf, null);
    ok(apply(s, { type: "attack", actor: wolf, target: "m1", attack: "bite" }, DM));
  });

  test(`a familiar at 0 Hit Points vanishes, leaving what it carried; a DM-bonded Zombie dies${on}`, () => {
    const { s } = table(grid);
    const owl = ok(apply(s, { type: "spawn", monster: "owl", name: "Hoot", at: spot(s, s.entities.wizard.pos) }, DM)).events[0].id;
    const zed = ok(apply(s, { type: "spawn", monster: "zombie", name: "Shambles", at: spot(s, s.entities.wizard.pos, 1) }, DM)).events[0].id;
    bond(s, owl, "wizard", { kind: "familiar", noAttack: true });
    bond(s, zed, "wizard", { kind: "undead" });
    assert.equal(s.entities[owl].bond.at0, "vanish");
    assert.equal(s.entities[zed].bond.at0, "dies");
    s.entities[owl].gear = ["silver bell", "note"];
    const at = { ...s.entities[owl].pos };
    const count = () => s.map.objects.reduce((n, o) => n + (o.contents?.length ?? 0), 0) + Object.values(s.entities).reduce((n, e) => n + (e.gear?.length ?? 0), 0);
    const items = count();
    const r = ok(apply(s, { type: "harm", actor: owl, amount: 5 }, DM));
    assert.equal(s.entities[owl], undefined);
    const v = r.events.find((e) => e.type === "vanished");
    assert.deepEqual(v, { type: "vanished", id: owl, name: "Hoot", why: "hp0", seen: true, party: true });
    const pile = s.map.objects.find((o) => o.def === "pile" && o.at.q === at.q && o.at.r === at.r);
    assert.deepEqual(pile.contents.map((x) => x.name), ["silver bell", "note"]);
    assert.equal(count(), items, "nothing it carried is lost or made twice");
    // Players are told it vanished and why: it was theirs.
    assert.deepEqual(viewEvents(r.events, s, U1).find((e) => e.type === "vanished"), { type: "vanished", id: owl, name: "Hoot", why: "hp0" });
    ok(apply(s, { type: "harm", actor: zed, amount: 40 }, DM));
    assert.equal(s.entities[zed].dead, true, "the Zombie stays, dead");
    assert.ok(s.entities[zed].bond);
  });

  test(`a companion that vanishes on its own turn passes the turn on; one later in the order leaves it${on}`, () => {
    const { s, wolf } = table(grid);
    bond(s, wolf, "fighter", { kind: "summon" });
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snik", at: spot(s, s.entities.fighter.pos, 2) }, DM));
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 3 }, DM));
    assert.ok(s.encounter.order.some((o) => o.id === wolf));
    // Play turns until it is the wolf's.
    for (let i = 0; i < 20 && current(s) !== wolf; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), wolf);
    const n = s.encounter.order.length, i = s.encounter.turn, next = s.encounter.order[(i + 1) % n].id;
    const r = ok(apply(s, { type: "harm", actor: wolf, amount: 50 }, DM));
    assert.ok(r.events.some((e) => e.type === "vanished" && e.why === "hp0"));
    assert.equal(s.encounter.order.length, n - 1);
    assert.ok(!s.encounter.order.some((o) => o.id === wolf));
    assert.equal(current(s), next, "the next creature's turn");
    assert.ok(r.events.some((e) => e.type === "turn" && e.id === next));
  });
}

test("its master's death, its leash and a dismissal end it too; each says why", () => {
  const { s, wolf } = table();
  bond(s, wolf, "fighter", { kind: "steed" });
  s.entities[wolf].bond.ends = ["masterDies"];
  s.entities.fighter.dead = true;
  const r = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.equal(r.events.find((e) => e.type === "vanished")?.why, "master");
  const t2 = table();
  bond(t2.s, t2.wolf, "fighter", { kind: "servant" });
  t2.s.entities[t2.wolf].bond.leash = 60;
  ok(apply(t2.s, { type: "place", actor: t2.wolf, to: { q: 4, r: 4 } }, DM));
  assert.ok(t2.s.entities[t2.wolf], "within 60 ft it stays");
  const far = ok(apply(t2.s, { type: "place", actor: t2.wolf, to: { q: 8, r: -6 } }, DM));
  assert.equal(far.events.find((e) => e.type === "vanished")?.why, "leash");
  const t3 = table(), ev = [];
  bond(t3.s, t3.wolf, "fighter", { kind: "familiar" });
  vanish(t3.s, t3.s.entities[t3.wolf], "dismissed", ev);
  assert.equal(ev.at(-1).why, "dismissed");
  assert.equal(t3.s.entities[t3.wolf], undefined);
});

test("its own lasting effects end when it vanishes; another's effect on it loses only that part", () => {
  const { s, wolf } = table();
  bond(s, wolf, "cleric", { kind: "familiar" });
  s.entities.cleric.slots[1] = 2; if (!s.entities.cleric.spells.includes("bless")) s.entities.cleric.spells.push("bless");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["fighter", wolf] }, DM));
  const fx = s.effects.find((x) => x.spell === "bless");
  ok(apply(s, { type: "harm", actor: wolf, amount: 99 }, DM));
  assert.ok(s.effects.includes(fx), "Bless goes on for Brenna");
  assert.ok(fx.parts.filter((p) => p.target === wolf).every((p) => p.ended));
  assert.ok(fx.parts.some((p) => p.target === "fighter" && !p.ended));
});

test("a foe's bonded wolf sends no bond to a player; its bonding and vanishing are told as plain sight allows", () => {
  const { s, wolf } = table();
  const mage = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Gob Mage", at: spot(s, s.entities.m1.pos) }, DM)).events[0].id;
  s.entities[wolf].hp = 7919;
  const r = bond(s, wolf, mage, { kind: "familiar" });
  assert.equal(s.entities[wolf].side, "foe");
  assert.deepEqual(viewEvents(r.events, s, U1), [], "players are not told a foe has a companion");
  const pv = view(s, U1);
  assert.ok(pv.entities[wolf], "the wolf is seen");
  assert.equal(pv.entities[wolf].bond, undefined);
  assert.ok(!json(pv).includes("7919") && !json(pv).includes('"bond"') && !json(pv).includes(`"to":"${mage}"`));
  const label = describeStep({ type: "bond", actor: wolf, to: mage }, r.events, mark(s), s);
  assert.equal(label.shown, null, "the undo label says nothing to players");
  // Seen, it vanishes in plain sight: players are told that much and no more.
  const gone = ok(apply(s, { type: "harm", actor: wolf, amount: 9999 }, DM));
  const seen = viewEvents(gone.events, s, U1).filter((e) => e.type === "vanished");
  assert.deepEqual(seen, [{ type: "vanished", id: wolf }]);
  // A hidden one vanishing is told to nobody but the DM, live or from the record.
  const t2 = table(), m2 = t2.s.entities.m1.id;
  bond(t2.s, t2.wolf, m2, { kind: "familiar" });
  ok(apply(t2.s, { type: "reveal", actor: t2.wolf, hidden: true }, DM));
  const hid = ok(apply(t2.s, { type: "harm", actor: t2.wolf, amount: 9999 }, DM));
  assert.ok(hid.events.some((e) => e.type === "vanished" && !e.seen));
  assert.ok(!json(viewEvents(hid.events, t2.s, U1)).includes(t2.wolf));
  assert.ok(!json(viewEvents(t2.s.timeline, t2.s, U1)).includes(t2.wolf), "nor from the record");
});

test("a foe's familiar with canary numbers, through a whole AI-played fight, leaks no bond, fx or master to a player", () => {
  for (const grid of [null, "square"]) {
    const { s, wolf } = table(grid);
    const mage = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Gob Mage", at: spot(s, s.entities.fighter.pos, 1, 3) }, DM)).events[0].id;
    bond(s, wolf, mage, { kind: "familiar" });
    Object.assign(s.entities[wolf], { hp: 7919, maxHp: 7919 });
    s.entities[wolf].bond.leash = 9997;
    const sent = [json(view(s, U1))];
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 4 }, DM));
    for (let i = 0; i < 80 && s.encounter; i++) {
      const id = current(s), e = s.entities[id];
      const step = e.side === "party" ? { type: "endTurn", actor: id } : aiStep(s, id) ?? { type: "endTurn", actor: id };
      let r = apply(s, step, DM);
      if (!r.ok) r = apply(s, { type: "endTurn", actor: id }, DM);
      sent.push(json(viewEvents(r.events, s, U1)), json(view(s, U1)));
    }
    const all = sent.join("\n");
    for (const n of [7919, 9997]) assert.ok(!new RegExp(`[^0-9.]${n}[^0-9.]`).test(all), `${n} reached a player`);
    for (const bad of ['"bond"', `"to":"${mage}"`, '"leash"', '"after"', '"familiar"']) assert.ok(!all.includes(bad), `${bad} reached a player`);
  }
});

test("the DM's bond: what it refuses changes nothing, and players can't bond at all", () => {
  const { s, wolf } = table();
  refused(s, { type: "bond", actor: wolf, to: "fighter" }, U1, /Only the DM/);
  refused(s, { type: "bond", actor: wolf, to: "m99" }, DM, /No such creature/);
  refused(s, { type: "bond", actor: wolf, to: wolf }, DM, /its own companion/);
  refused(s, { type: "bond", actor: "rogue", to: "fighter" }, DM, /player's character/);
  refused(s, { type: "bond", actor: wolf, to: "fighter", kind: "dragon" }, DM, /kind can be/);
  refused(s, { type: "bond", actor: wolf, to: "fighter", turn: "after" }, DM, /not built yet/);
  refused(s, { type: "bond", actor: wolf, to: "fighter", orders: "command" }, DM, /not built yet/);
  refused(s, { type: "bond", actor: wolf, to: "fighter", at0: "explodes" }, DM, /vanish, dies/);
  refused(s, { type: "bond", actor: wolf, to: null }, DM, /no one's companion/);
  refused(s, { type: "companion", actor: wolf, auto: true }, DM, /no one's companion/);
  ok(apply(s, { type: "reveal", actor: wolf, hidden: true }, DM));
  refused(s, { type: "bond", actor: wolf, to: "fighter" }, DM, /hidden from the party/);
  ok(apply(s, { type: "reveal", actor: wolf, hidden: false }, DM));
  bond(s, wolf, "fighter");
  refused(s, { type: "bond", actor: wolf, to: "cleric" }, DM, /already Brenna's companion/);
  refused(s, { type: "bond", actor: "m1", to: wolf }, DM, /companion itself/);
  refused(s, { type: "bond", actor: wolf, to: null, kind: "pet" }, DM, /nothing else/);
  // In a fight a creature does not change sides.
  const t = table();
  ok(apply(t.s, { type: "startEncounter", center: t.s.entities.fighter.pos, radius: 3 }, DM));
  refused(t.s, { type: "bond", actor: t.wolf, to: "fighter" }, DM, /on its master's side/);
  // The cap.
  assert.equal(BOND_MAX, 20);
  const c = table();
  for (let i = 0; i < BOND_MAX; i++) {
    const id = `x${i}`;
    c.s.entities[id] = { ...structuredClone(c.s.entities[c.wolf]), id, side: "party", bond: { to: "cleric", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false } };
  }
  refused(c.s, { type: "bond", actor: c.wolf, to: "cleric" }, DM, /20 companions already/);
});

test("a player naming a creature they do not know of in a bond hears what an id that is nothing gets", () => {
  const { s, wolf } = table();
  ok(apply(s, { type: "reveal", actor: "m2", hidden: true }, DM));
  const a = apply(structuredClone(s), { type: "bond", actor: wolf, to: "m2" }, U1), b = apply(structuredClone(s), { type: "bond", actor: wolf, to: "m99" }, U1);
  assert.deepEqual(a, b);
  const c = apply(structuredClone(s), { type: "companion", actor: "m2", auto: true }, U1), d = apply(structuredClone(s), { type: "companion", actor: "m99", auto: true }, U1);
  assert.deepEqual(c, d);
  assert.equal(c.error, "No such creature.");
});

test("freeing a companion: it stays, on its side, the DM's; removing a master frees its companions", () => {
  const { s, wolf } = table();
  bond(s, wolf, "fighter");
  const r = bond(s, wolf, null);
  assert.deepEqual(r.events, [{ type: "unbonded", id: wolf, from: "fighter" }]);
  assert.deepEqual(viewEvents(r.events, s, U2), [{ type: "unbonded", id: wolf, from: "fighter" }]);
  assert.equal(s.entities[wolf].side, "party");
  assert.equal(ownerOf(s, s.entities[wolf]), null);
  s.entities[wolf].gear = ["rope"];
  const t = table();
  const m = ok(apply(t.s, { type: "spawn", monster: "goblin-warrior", at: spot(t.s, t.s.entities.m1.pos) }, DM)).events[0].id;
  bond(t.s, t.wolf, m);
  const rm = ok(apply(t.s, { type: "remove", actor: m }, DM));
  assert.ok(rm.events.some((e) => e.type === "unbonded" && e.id === t.wolf));
  assert.equal(t.s.entities[t.wolf].bond, undefined);
  assert.deepEqual(s.entities[wolf].gear, ["rope"], "freeing takes nothing off it");
});

test("the companion's controller sets whether the engine plays it; only the party hears of it", () => {
  const { s, wolf } = table();
  bond(s, wolf, "fighter");
  const r = ok(apply(s, { type: "companion", actor: wolf, auto: true }, U1));
  assert.equal(s.entities[wolf].bond.auto, true);
  assert.deepEqual(viewEvents(r.events, s, U2), [{ type: "companion", id: wolf, auto: true }]);
  refused(s, { type: "companion", actor: wolf, auto: false }, U2, /isn't yours/);
  refused(s, { type: "companion", actor: wolf, auto: "yes" }, U1, /Say whether/);
  assert.equal(describeStep({ type: "companion", actor: wolf, auto: true }, r.events, mark(s), s).label, "Greyjaw was left to the engine to play");
});

test("a companion's reactions are its master's player's to set and to answer", () => {
  const { s, wolf } = table();
  bond(s, wolf, "fighter");
  ok(apply(s, { type: "reactions", actor: wolf, set: { "opportunity-attack": "ask" } }, U1));
  assert.deepEqual(viewReactions(s, U1), { [wolf]: { "opportunity-attack": "ask" } });
  assert.deepEqual(viewReactions(s, U2), {});
  refused(s, { type: "reactions", actor: wolf, set: { "opportunity-attack": "never" } }, U2, /isn't yours/);
});

test("labels name bonds in plain words; players hear only of the party's", () => {
  const { s, wolf } = table();
  const before = mark(s), r = bond(s, wolf, "fighter");
  assert.deepEqual(describeStep({ type: "bond", actor: wolf, to: "fighter" }, r.events, before, s), { label: "Greyjaw became Brenna's companion", shown: "Greyjaw became Brenna's companion" });
  const b2 = mark(s), r2 = bond(s, wolf, null);
  assert.equal(describeStep({ type: "bond", actor: wolf, to: null }, r2.events, b2, s).label, "Greyjaw was freed from Brenna");
});

test("undo and redo give back exactly what a vanishing took, and the same actions replay the same", () => {
  const play = () => {
    const { s, wolf } = table();
    const h = createHistory();
    const step = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); return r; };
    step({ type: "bond", actor: wolf, to: "fighter", kind: "familiar" });
    s.entities[wolf].gear = ["bell"];
    step({ type: "startEncounter", center: s.entities.fighter.pos, radius: 3 });
    const pre = json(s);
    step({ type: "harm", actor: wolf, amount: 99 });
    const post = json(s);
    h.undo(s);
    assert.equal(json(s), pre);
    h.redo(s);
    assert.equal(json(s), post);
    return post;
  };
  assert.equal(play(), play());
});

test("an old table loads unchanged but for its version", () => {
  const s = newGame(5);
  s.version = 22;
  const was = structuredClone(s);
  migrate(s);
  assert.equal(VERSION, 23);
  assert.equal(s.version, 23);
  assert.equal(json({ ...s, version: 22 }), json(was));
  const again = json(s);
  migrate(s);
  assert.equal(json(s), again, "migrating twice changes nothing");
});

// Control goes through the master: a new `.owner` comparison anywhere in the rules would bypass it
// (docs/specs/companions.md, Risks). These are the uses there are, each read for what it is.
test("nothing in the rules reads `.owner` to decide control, but ownerOf", () => {
  const src = new URL("../src/", import.meta.url);
  const files = ["engine.js", "view.js", "history.js", "reactions.js", "scenes.js", "ai.js", ...readdirSync(new URL("engine/", src)).map((f) => `engine/${f}`)];
  const KNOWN = {
    "engine/shared.js": 3,       // ownerOf itself
    "engine/dm.js": 6,           // claim and release: who sits at a player's character
    "engine/companions.js": 1,   // a creature with a player of its own is not made a companion
    "engine/sheets.js": 1,       // a character remade keeps its player
    "engine/characters.js": 1,   // likewise
    "history.js": 1,             // a rewind keeps who holds which character
    "scenes.js": 3,              // scene lines and asking for a check: a player's own character (reported, #311)
  };
  for (const f of files) {
    const n = (readFileSync(new URL(f, src), "utf8").match(/\.owner\b/g) ?? []).length;
    assert.equal(n, KNOWN[f] ?? 0, `${f} reads .owner ${n} times`);
  }
});

// ---------- review of #313 ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  test(`walking away from a creature that can't attack sets off nothing, in both directions${on} (B1)`, () => {
    for (const party of [true, false]) {
      const { s, wolf } = table(grid);
      const mage = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Gob Mage", at: spot(s, s.entities.m1.pos) }, DM)).events[0].id;
      bond(s, wolf, party ? "fighter" : mage, { kind: "familiar", noAttack: true });
      // A creature of the other side right beside it, a fight on, and that creature walks off.
      const other = ok(apply(s, { type: "spawn", monster: party ? "goblin-warrior" : "wolf", name: "Walker", at: spot(s, s.entities[wolf].pos, 0, 1) }, DM)).events[0].id;
      if (!party) { s.entities[other].side = "party"; }
      ok(apply(s, { type: "startEncounter", center: s.entities[wolf].pos, radius: 5 }, DM));
      for (let i = 0; i < 30 && current(s) !== other; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
      assert.equal(current(s), other);
      const G = gridOf(s.map), from = s.entities[wolf].pos;
      const to = G.range(s.entities[other].pos, 3).find((h) => G.dist(h, from) >= 3 && apply(structuredClone(s), { type: "move", actor: other, to: h }, DM).ok);
      assert.ok(to, "somewhere to walk to");
      const r = ok(apply(s, { type: "move", actor: other, to }, DM));
      assert.ok(!r.events.some((e) => e.type === "attack" || e.type === "reaction"), "no Opportunity Attack");
      assert.equal(s.entities[other].pos.q, to.q);
    }
  });
}

test("a companion the party could not see leaves its gear on a pile players are never sent; with or without gear, their view is an unseen death's (M1)", () => {
  const run = (bonded, gear) => {
    const { s, wolf } = table();
    const mage = s.entities.m1.id;
    if (bonded) bond(s, wolf, mage, { kind: "familiar" });
    else s.entities[wolf].hp = 1;
    s.entities[wolf].gear = gear ? ["Ring of Secret Name"] : [];
    ok(apply(s, { type: "reveal", actor: wolf, hidden: true }, DM));
    const before = json(view(s, U1)), r = ok(apply(s, { type: "harm", actor: wolf, amount: 9999 }, DM));
    return { s, wolf, r, before, after: json(view(s, U1)), events: json(viewEvents(r.events, s, U1)), tl: json(viewEvents(s.timeline, s, U1)) };
  };
  const withGear = run(true, true), bare = run(true, false), plain = run(false, false);
  assert.equal(withGear.after, withGear.before, "nothing in the player's view changed");
  assert.ok(!withGear.after.includes("Secret Name") && !withGear.tl.includes("Secret Name"));
  assert.equal(withGear.events, "[]");
  // The gear is kept, marked, and stays the DM's after the pass that opens piles.
  const pile = withGear.s.map.objects.find((o) => o.def === "pile" && o.by === withGear.wolf);
  assert.equal(pile.left, true);
  assert.deepEqual(pile.contents.map((x) => x.name), ["Ring of Secret Name"]);
  ok(apply(withGear.s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(withGear.s.map.objects.includes(pile) && pile.by === withGear.wolf, "still marked after another action");
  assert.ok(withGear.r.events.some((e) => e.type === "manual" && e.partial && /only you see/.test(e.text)), "the DM is told where it is");
  // A gearless vanish and an unbonded unseen kill look the same to players: events, view, record.
  assert.equal(bare.events, plain.events);
  assert.equal(bare.after, plain.after);
  assert.equal(bare.tl, plain.tl);
});

test("players are told what befell their own companion before it vanished, and the undo label is theirs (M2)", () => {
  const { s, wolf } = table();
  bond(s, wolf, "fighter", { kind: "familiar" });
  s.entities[wolf].gear = ["bell"];
  const before = mark(s), r = ok(apply(s, { type: "harm", actor: wolf, amount: 50 }, DM));
  const seen = viewEvents(r.events, s, U2).map((e) => e.type);
  assert.deepEqual(seen, ["damage", "died", "object", "vanished"]);
  const label = describeStep({ type: "harm", actor: wolf, amount: 50 }, r.events, before, s);
  assert.equal(label.shown, "Greyjaw took damage");
  // A foe's seen familiar: the hit and its death as for any foe they see, without numbers they would not get.
  const t = table();
  bond(t.s, t.wolf, t.s.entities.m1.id, { kind: "familiar" });
  const f = viewEvents(ok(apply(t.s, { type: "harm", actor: t.wolf, amount: 50 }, DM)).events, t.s, U1);
  assert.deepEqual(f.map((e) => e.type), ["damage", "died", "vanished"]);
  assert.equal(f[0].hp, 0);
  assert.equal(f[0].health, "dead");
});

test("a creature that can't attack can't cast a spell with an attack roll either, and nothing changes (M3)", () => {
  const { s, wolf } = table();
  bond(s, wolf, "wizard", { kind: "familiar", noAttack: true });
  Object.assign(s.entities[wolf], { spells: ["fire-bolt", "light"], castAbil: "int" });
  refused(s, { type: "cast", actor: wolf, spell: "fire-bolt", target: "m1" }, DM, /can't attack, and Fire Bolt makes an attack roll/);
});

test("flags naming a vanished creature go with it (L2); a grapple it held ends and other conditions lose its name (L3)", () => {
  const { s, wolf } = table();
  bond(s, wolf, s.entities.m1.id, { kind: "familiar" });
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
  s.encounter.flags[`hit:${wolf}:fighter`] = true;
  s.encounter.flags[`attacked:${wolf}`] = true;
  s.entities.fighter.cond.grappled = { source: wolf };
  s.entities.fighter.cond.frightened = { source: wolf };
  const r = ok(apply(s, { type: "harm", actor: wolf, amount: 999 }, DM));
  assert.ok(!Object.keys(s.encounter?.flags ?? {}).some((k) => k.includes(wolf)));
  assert.equal(s.entities.fighter.cond.grappled, undefined);
  assert.deepEqual(s.entities.fighter.cond.frightened, {});
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.cond === "grappled"));
  assert.ok(!json(s.entities).includes(wolf));
});

test("a foe's companion gives no XP unless the DM ticks it (L5)", () => {
  const { s, wolf } = table();
  bond(s, wolf, s.entities.m1.id, { kind: "undead" });
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
  for (const e of Object.values(s.entities)) if (e.side === "foe" && s.encounter) ok(apply(s, { type: "harm", actor: e.id, amount: 999 }, DM));
  const foes = s.conclusion.foes;
  assert.equal(foes.find((f) => f.id === wolf).counts, false);
  assert.ok(foes.filter((f) => f.id !== wolf).every((f) => f.counts));
});

test("a part that was to end with the vanished creature's turn ends with it (L7)", () => {
  const { s, wolf } = table();
  bond(s, wolf, "cleric", { kind: "familiar" });
  s.effects = [{ id: "fx77", name: "Mark", spell: null, source: "cleric", conc: false, lasts: "special", until: null,
    parts: [{ target: "fighter", cond: "frightened", ends: { on: "turnEnd", who: wolf } }, { target: "rogue", cond: "prone" }] }];
  ok(apply(s, { type: "harm", actor: wolf, amount: 999 }, DM));
  const fx = s.effects.find((x) => x.id === "fx77");
  assert.ok(fx.parts[0].ended);
  assert.ok(!fx.parts[1].ended, "the rest goes on");
});

// ---------- re-review of #313 ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  test(`a companion the party could not see vanishes leaving what it did to them as an unseen death would: same events, view and record${on} (N1)`, async () => {
    const { startEffect } = await import("../src/durations.js");
    const run = (bonded) => {
      const { s, wolf } = table(grid);
      if (bonded) bond(s, wolf, s.entities.m1.id, { kind: "familiar" });
      s.entities.fighter.cond.grappled = { source: wolf };
      s.entities.fighter.cond.frightened = { source: wolf };
      // A lasting effect of its own, without Concentration, on a party member; and a part of another's that ends with its turn.
      const fx = startEffect(s, { name: "Blindness", spell: null, source: wolf, conc: false, duration: "1 minute" });
      fx.parts.push({ target: "rogue", cond: "blinded" }); s.entities.rogue.cond.blinded = { source: wolf, effect: fx.id };
      const fy = startEffect(s, { name: "Mark", spell: null, source: "m1", conc: false, duration: "1 minute" });
      fy.parts.push({ target: "cleric", cond: "prone", ends: { on: "turnEnd", who: wolf } }); s.entities.cleric.cond.prone = { effect: fy.id };
      ok(apply(s, { type: "reveal", actor: wolf, hidden: true }, DM));
      const r = ok(apply(s, { type: "harm", actor: wolf, amount: 9999 }, DM));
      ok(apply(s, { type: "advanceTime", minutes: 0.5 }, DM));
      return { s, r, ev: [U1, U2].map((u) => json(viewEvents(r.events, s, u))), view: [U1, U2].map((u) => json(view(s, u))), tl: json(viewEvents(s.timeline, s, U1)) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.ev, B.ev);
    assert.deepEqual(A.ev, ["[]", "[]"]);
    assert.deepEqual(A.view, B.view);
    assert.equal(A.tl, B.tl);
    assert.ok(A.s.entities.fighter.cond.grappled, "the grapple is left for the DM");
    assert.ok(A.r.events.some((e) => e.type === "manual" && e.partial && /left as it was/.test(e.text) && /Blindness/.test(e.text) && /Grappled/.test(e.text)), "the DM is told what is left");
    assert.ok(!json(A.view).includes(A.s.timeline.find((e) => e.type === "vanished").id), "no id of it reaches a player");
  });
}

test("the end of a lasting effect whose caster players do not know of names neither the caster nor why", () => {
  const { s, wolf } = table();
  ok(apply(s, { type: "reveal", actor: wolf, hidden: true }, DM));
  const ev = [{ type: "effectEnd", fx: "fx9", name: "Blindness", source: wolf, targets: ["fighter"], why: "Greyjaw went down", conc: true }];
  assert.deepEqual(viewEvents(ev, s, U1), [{ type: "effectEnd", fx: "fx9", name: "Blindness", conc: true, targets: ["fighter"] }]);
  const mine = [{ ...ev[0], source: "cleric", why: "Odessa ended it" }];
  assert.equal(viewEvents(mine, s, U1)[0].why, "Odessa ended it");
  const thing = [{ ...ev[0], source: null, why: "the fight ended" }];
  assert.equal(viewEvents(thing, s, U1)[0].why, "the fight ended", "an effect of no creature keeps its words");
});
