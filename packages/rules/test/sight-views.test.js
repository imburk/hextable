// Views by sight (task S7 of docs/specs/sight.md): the table rule `sight` ('rooms', 'los', 'light'),
// the party seeing as one, remembered tiles and things, region reveal by line of sight, targeting.
// The property tests at the end play long random games with several players and check, after every
// action, that nothing the party cannot see reaches a player in any form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current, moveOptions, rollMode } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { applyPatch, diff, snapshot } from "../src/patch.js";
import { newGame } from "../src/scenario.js";
import { canSee, inViewOf } from "../src/sight.js";
import { concealed } from "../src/space.js";
import { view, viewEvents } from "../src/view.js";
import { partyView, seesPlace } from "../src/vision.js";
import { edgeSegment, objectHexes } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" }, LEE = { role: "player", userId: "lee" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });
const E = 5 / (2 * Math.sqrt(3));

// The crypt: a hall to the west (q below 2) and a vault to the east behind a wall at x = 12.5 with
// a door in it at row 0, each its own region. A pillar stands in the hall at -2,-2 and a curtain
// hangs across the south of it. The vault is dark but for a brazier. A pressure plate lies hidden in the hall.
const TILES = H.range({ q: 0, r: 0 }, 8).filter((h) => Math.abs(h.r) <= 5);
const westOf = (h) => 5 * (h.q + h.r / 2) < 12.5;
function crypt({ rule = "los", vaultLight = "dark", seed = 7 } = {}) {
  const tiles = Object.fromEntries(TILES.map((h) => [H.col(h), { t: "stone" }]));
  const walls = [{ id: "wn", level: "ground", a: [12.5, -100], b: [12.5, -E], kind: "wall" }, { id: "ws", level: "ground", a: [12.5, E], b: [12.5, 100], kind: "wall" },
    { id: "cur", level: "ground", a: [-30, 21], b: [0, 21], kind: "curtain" },
    ...[0, 1, 2, 3, 4, 5].map((i) => { const [a, b] = edgeSegment({ q: -2, r: -2 }, i); return { id: `p${i}`, level: "ground", a, b, kind: "wall" }; })];
  const map = newMap({ id: "crypt", name: "The crypt", starts: [{ q: -6, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls,
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 2, r: 0 }, edge: 0, state: "closed" },
      { id: "brazier", def: "brazier", level: "ground", at: { q: 5, r: -2 }, state: "lit" },
      { id: "plate", def: "pressure-plate", level: "ground", at: { q: -4, r: 2 }, state: "hidden" }],
    regions: [{ id: "hall", name: "The hall", level: "ground", hexes: TILES.filter(westOf).map(H.col) },
      { id: "vault", name: "The vault", level: "ground", hexes: TILES.filter((h) => !westOf(h)).map(H.col), ...(vaultLight ? { light: vaultLight } : {}) }] });
  const s = newGame(seed);
  ok(apply(s, { type: "loadMap", map }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, user] of [["fighter", "pat"], ["rogue", "kim"], ["cleric", "lee"]]) apply(s, { type: "claim", entity: id, user, userName: user }, { role: "player", userId: user });
  for (const [id, q, r] of [["fighter", -5, 0], ["rogue", -6, 1], ["cleric", -6, 0], ["wizard", -5, -1]]) s.entities[id].pos = at(q, r);
  if (rule !== "rooms") ok(apply(s, { type: "setting", key: "sight", value: rule }, DM));
  const add = (q, r, name) => s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r }, name }, DM)).events[0].id];
  return { s, add };
}
const sent = (s, res, who = PAT) => JSON.stringify([view(s, who), viewEvents(res?.events ?? [], s, who)]);

test("the default is rooms, which is today's behaviour; los and light are opt-in table rules", () => {
  const s = newGame(3);
  assert.equal(s.settings.sight, "rooms");
  assert.equal("sight" in view(s, PAT), false);
  assert.equal(apply(s, { type: "setting", key: "sight", value: "fog" }, DM).error, "That setting can be: rooms, los, light.");
  assert.equal(apply(s, { type: "setting", key: "sight", value: "los" }, PAT).error, "Only the DM can change table settings.");
  const { s: c, add } = crypt({ rule: "rooms" }), behind = add(-1, -3, "Behind");
  assert.ok(view(c, PAT).entities[behind.id], "rooms: everything in a revealed room is visible, around pillars too");
  assert.equal(c.map.seen, undefined, "and nothing is remembered");
});

test("los: a goblin that walks behind a pillar leaves the player's messages, and comes back into them", () => {
  const { s, add } = crypt();
  inLine(s);
  const gob = add(1, -1, "Zorg");
  assert.ok(view(s, PAT).entities[gob.id]);
  const hide = ok(apply(s, { type: "move", actor: gob.id, to: at(1, -2) }, DM));      // in the pillar's shadow from the whole party
  assert.equal(inViewOf(s.map, s.entities.fighter, gob), false);
  for (const who of [PAT, KIM, LEE]) assert.equal(sent(s, hide, who).includes("Zorg") || sent(s, hide, who).includes(`"${gob.id}"`), false);
  // A guessed id answers as one that does not exist, and changes nothing.
  const before = JSON.stringify(s);
  assert.deepEqual(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "javelin" }, PAT), apply(s, { type: "attack", actor: "fighter", target: "m999", attack: "javelin" }, PAT));
  assert.equal(JSON.stringify(s), before);
  // Back in view: sent again, and its path only where the party could see it.
  const back = ok(apply(s, { type: "move", actor: gob.id, to: at(1, 0) }, DM));
  assert.ok(view(s, PAT).entities[gob.id]);
  const moved = viewEvents(back.events, s, PAT).find((e) => e.type === "moved");
  assert.ok(moved.path.every((h) => s.entities.fighter && ["fighter", "rogue", "cleric", "wizard"].some((id) => inViewOf(s.map, s.entities[id], h))));
});

test("the party sees as one: a goblin seen by one member is sent to every player, and can be targeted by another at a penalty", () => {
  const { s, add } = crypt();
  ok(apply(s, { type: "place", actor: "rogue", to: at(-3, 5) }, DM));        // south of the curtain
  const gob = add(-5, 5, "Kesh");
  assert.equal(inViewOf(s.map, s.entities.fighter, gob), false);       // the curtain is between the fighter and the goblin
  assert.equal(inViewOf(s.map, s.entities.rogue, gob), true);
  for (const who of [PAT, KIM, LEE]) assert.ok(view(s, who).entities[gob.id]);
  assert.deepEqual(rollMode(s, s.entities.fighter, gob, { type: "ranged", range: [30, 120], bonus: 5 }).dis, ["target out of sight"]);
  ok(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "javelin" }, PAT));
  // The same goblin, with the rogue moved away, is gone for everyone.
  ok(apply(s, { type: "place", actor: "rogue", to: at(-6, 1) }, DM));
  for (const who of [PAT, KIM, LEE]) assert.equal(view(s, who).entities[gob.id], undefined);
});

test("los: a region is revealed when the party has a line of sight into it, and the door is remembered as it was seen", () => {
  const { s, add } = crypt();
  const lurk = add(5, 0, "Vlim");
  assert.equal(s.map.regions.find((r) => r.id === "vault").revealed, undefined);
  ok(apply(s, { type: "place", actor: "fighter", to: at(2, 0) }, DM));
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  ok(apply(s, { type: "move", actor: "fighter", to: at(-4, 0) }, PAT));          // steps back: still sees through the open door
  assert.equal(s.map.regions.find((r) => r.id === "vault").revealed, true);
  assert.deepEqual(s.map.seen.objects.door, "open");
  // Out of sight of the door, a goblin shuts it. The players still see it open, and are told nothing.
  behindCurtain(s);
  const door = (who) => view(s, who).map.objects.find((o) => o.id === "door");
  assert.ok(!seesDoor(s), "nobody can see the door from there");
  ok(apply(s, { type: "place", actor: lurk.id, to: at(3, 0) }, DM));
  const shut = ok(apply(s, { type: "use", actor: lurk.id, object: "door", verb: "close" }, DM));
  assert.equal(door(PAT).state, "open");
  assert.deepEqual(viewEvents(shut.events, s, PAT), []);
  ok(apply(s, { type: "place", actor: "fighter", to: at(0, 0) }, DM));
  assert.equal(door(PAT).state, "closed");
});
// Everyone in a line west of the pillar: from there 0,-2 to 3,-2 are in its shadow.
const inLine = (s) => { for (const [id, q] of [["fighter", -3], ["rogue", -4], ["cleric", -5], ["wizard", -6]]) ok(apply(s, { type: "place", actor: id, to: at(q, -2) }, DM)); };
// Everyone to the south of the curtain, from where nobody can see the door.
const behindCurtain = (s) => { for (const [id, q] of [["fighter", -5], ["rogue", -6], ["cleric", -7], ["wizard", -8]]) ok(apply(s, { type: "place", actor: id, to: at(q, 5) }, DM)); };
test("los: a region is revealed from across the room, as soon as it can be seen; under rooms only from beside it", () => {
  for (const rule of ["rooms", "los"]) {
    const { s, add } = crypt({ rule }), gob = add(6, 0, "Farsight");
    const res = ok(apply(s, { type: "setObject", object: "door", state: "open" }, DM));        // the party stands 7 hexes back
    const vault = s.map.regions.find((r) => r.id === "vault");
    if (rule === "rooms") { assert.equal(vault.revealed, undefined); continue; }
    assert.equal(vault.revealed, true);
    assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type), ["object", "region"]);
    assert.ok(view(s, PAT).entities[gob.id], "and the goblin in the doorway's line is seen");
  }
});
const seesDoor = (s) => ["fighter", "rogue", "cleric", "wizard"].some((id) => objectHexes(s.map.objects[0]).some((h) => seesPlace(s, s.entities[id], at(h.q, h.r), "los")));

test("light: a dark vault is sent as it is lit, and what has been seen stays on the map, dimmed", () => {
  const { s, add } = crypt({ rule: "light" });
  ok(apply(s, { type: "mapEdit", ops: [{ op: "object", object: { id: "brazier", def: "brazier", level: "ground", at: { q: 5, r: -2 }, state: "out" } }] }, DM));
  const gob = add(6, 2, "Dusk");
  ok(apply(s, { type: "place", actor: "fighter", to: at(2, 0) }, DM));
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  const v = view(s, PAT), vault = (vv) => Object.keys(vv.map.levels[0].tiles).filter((k) => !westOf(H.parse(k)));
  assert.equal(s.map.regions.find((r) => r.id === "vault").revealed, true);
  assert.deepEqual(vault(v), [], "revealed by sight, but nothing in it is lit");
  assert.equal(v.entities[gob.id], undefined);
  assert.equal(JSON.stringify(v).includes("Dusk"), false);
  assert.ok(v.map.regions.find((r) => r.id === "vault").hexes.every((k) => westOf(H.parse(k)) || v.map.levels[0].tiles[k]));
  // A torch: the fighter walks in, and the vault is discovered by torchlight.
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: at(4, 1) }, PAT));
  const lit = view(s, PAT);
  assert.ok(vault(lit).length > 10);
  assert.ok(lit.entities[gob.id], "the goblin is in the torchlight");
  assert.ok(lit.sight.light.ground, "dim and dark places in view are marked");
  for (const k of vault(lit)) assert.ok(s.map.seen.tiles.ground.includes(k));
  // Walk out again: the tiles stay as remembered, the goblin goes, and `now` says what is in view.
  ok(apply(s, { type: "move", actor: "fighter", to: at(-3, 0) }, PAT));
  const after = view(s, PAT);
  assert.deepEqual(vault(after), vault(lit));
  assert.equal(after.entities[gob.id], undefined);
  assert.ok(vault(lit).some((k) => !after.sight.now.ground.includes(k)));
  // The DM can make the party forget.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "forget" }] }, DM));
  const forgot = view(s, PAT);
  assert.deepEqual(Object.keys(forgot.map.levels[0].tiles).filter((k) => !forgot.sight.now.ground.includes(k)), [], "only what is in view now");
});

test("light: Darkvision, Blindness and Invisibility decide what the party sees", () => {
  const { s, add } = crypt({ rule: "light", vaultLight: null });
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] }, DM));
  const gob = add(-2, 1, "Murk");
  assert.equal(view(s, PAT).entities[gob.id], undefined, "nobody sees in the dark");
  s.entities.wizard.senses = { darkvision: 60 };
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(view(s, PAT).entities[gob.id], "the wizard does");
  ok(apply(s, { type: "condition", actor: gob.id, condition: "invisible" }, DM));
  assert.equal(view(s, PAT).entities[gob.id], undefined);
  ok(apply(s, { type: "condition", actor: gob.id, condition: "invisible", on: false }, DM));
  ok(apply(s, { type: "condition", actor: "wizard", condition: "blinded" }, DM));
  assert.equal(view(s, PAT).entities[gob.id], undefined);
  assert.equal(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "javelin" }, PAT).error, "No such creature.");
});

test("los: things are sent only once seen, and their events only while in view", () => {
  const { s } = crypt();
  const brazier = (who) => view(s, who).map.objects.find((o) => o.id === "brazier");
  assert.equal(brazier(PAT), undefined, "the vault is unrevealed");
  ok(apply(s, { type: "place", actor: "fighter", to: at(2, 0) }, DM));
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  assert.equal(brazier(PAT)?.state, "lit");
  behindCurtain(s);
  const out = ok(apply(s, { type: "setObject", object: "brazier", state: "out" }, DM));
  assert.equal(brazier(PAT).state, "lit", "as last seen");
  assert.deepEqual(viewEvents(out.events, s, PAT), []);
  assert.deepEqual(apply(s, { type: "use", actor: "fighter", object: "plate", verb: "x" }, PAT), apply(s, { type: "use", actor: "fighter", object: "nothing", verb: "x" }, PAT));
});

test("the rules and the monster AI play the same whatever the view rule; players are not told an unseen creature's turn", () => {
  const play = (rule) => {
    const { s, add } = crypt({ rule });
    inLine(s);
    const gob = add(2, -2, "Same"), log = [];
    ok(apply(s, { type: "startEncounter", center: at(-1, -2), radius: 6 }, DM));
    for (let i = 0; i < 40 && s.encounter; i++) {
      const id = current(s), turnShown = view(s, PAT).encounter.turn;
      if (id === gob.id && rule === "los" && !view(s, PAT).entities[gob.id]) assert.equal(turnShown, -1);
      const step = s.entities[id].side === "party" ? { type: "endTurn", actor: id } : aiStep(s, id) ?? { type: "endTurn", actor: id };
      const res = apply(s, step, DM);
      log.push([step, res.ok, res.events.map((e) => e.type)]);
      if (!res.ok) apply(s, { type: "endTurn", actor: id }, DM);
    }
    return log;
  };
  assert.deepEqual(play("los"), play("rooms"));
});

test("an area's hexes are told only where the players are sent the tiles", () => {
  const { s, add } = crypt({ rule: "light" });
  ok(apply(s, { type: "setObject", object: "brazier", state: "out" }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: at(2, 0) }, DM));
  ok(apply(s, { type: "use", actor: "wizard", object: "door", verb: "open" }, DM));
  add(4, 0, "Ember");
  ok(apply(s, { type: "startEncounter", center: at(2, 0), radius: 6 }, DM));
  while (current(s) !== "wizard") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 3, r: 0 } }, DM));
  const cast = res.events.find((e) => e.type === "cast"), told = viewEvents(res.events, s, PAT).find((e) => e.type === "cast");
  const sentCols = new Set(view(s, PAT).map.levels.flatMap((l) => Object.keys(l.tiles)));
  assert.ok(cast.hexes.some((h) => !sentCols.has(H.col(h))), "the cone reaches into the dark vault");
  assert.deepEqual(told.hexes, cast.hexes.filter((h) => sentCols.has(H.col(h))).map((h) => ({ q: h.q, r: h.r })));
});

test("the party's view is kept until something it depends on changes", () => {
  const { s, add } = crypt({ rule: "light" });
  const gob = add(1, -1, "Cache"), first = partyView(s);
  assert.equal(partyView(s), first);
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  ok(apply(s, { type: "chronicle", title: "Nothing to see" }, DM));
  assert.equal(partyView(s), first, "time passing and the chronicle change nothing anyone sees");
  const changes = [
    { type: "move", actor: "fighter", to: at(-4, 0) }, { type: "place", actor: gob.id, to: at(0, 2) }, { type: "setLight", actor: "rogue", item: "torch" },
    { type: "setObject", object: "door", state: "open" }, { type: "condition", actor: "cleric", condition: "blinded" }, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dim" } }] },
  ];
  let last = first;
  for (const action of changes) {
    ok(apply(s, action, DM));
    assert.notEqual(partyView(s), last, `${action.type} must rebuild it`);
    last = partyView(s);
  }
});

// ---------- property tests ----------
// A seeded dice for choosing actions (the game's own dice are the state's).
function chooser(seed) { let x = seed >>> 0; return (n) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; }; }
const PARTY = ["fighter", "rogue", "cleric", "wizard"];
const PLAYERS = [PAT, KIM, LEE];
const owner = { fighter: PAT, rogue: KIM, cleric: LEE, wizard: DM };
const NAMES = ["Zorgax", "Keshtel", "Vlimmer", "Drossik"];
const up = (e) => !e.dead && e.hp > 0;

// What the party can see by the rule, worked out directly (no flood, no cache of vision.js): the oracle.
function oracle(s) {
  const rule = s.settings.sight, eyes = PARTY.map((id) => s.entities[id]).filter((e) => e && up(e));
  const creatures = new Set();
  for (const c of Object.values(s.entities)) {
    if (c.side === "party" || concealed(s.map, c)) continue;
    if (rule === "rooms" || eyes.some((v) => (rule === "los" ? inViewOf(s.map, v, c) : canSee(s, v, c) !== "no"))) creatures.add(c.id);
  }
  const places = new Set();
  if (rule !== "rooms") for (const l of s.map.levels) for (const k in l.tiles) {
    const h = H.parse(k), p = at(h.q, h.r, l.z + (l.tiles[k].h ?? 0));
    if (eyes.some((v) => seesPlace(s, v, p, rule))) places.add(`${l.id}|${k}`);
  }
  return { rule, creatures, places };
}
// One random action: by a player for their own character, or by the DM.
function randomAction(s, pick) {
  const monsters = Object.values(s.entities).filter((e) => e.side !== "party" && !e.dead);
  const any = (list) => list[pick(list.length)];
  const hexes = TILES;
  const roll = pick(100);
  if (s.encounter && roll < 30) {
    const id = current(s), e = s.entities[id];
    if (e?.side !== "party") return [aiStep(s, id) ?? { type: "endTurn", actor: id }, DM];
    if (pick(3) === 0) return [{ type: "endTurn", actor: id }, owner[id]];
  }
  if (roll < 40) {
    const id = any(PARTY), e = s.entities[id], opts = [...moveOptions(s, e).values()].filter((o) => o.canStop);
    if (opts.length) return [{ type: "move", actor: id, to: any(opts).h }, owner[id]];
  }
  if (roll < 52 && monsters.length) {
    const m = any(monsters), opts = [...moveOptions(s, m).values()].filter((o) => o.canStop);
    if (opts.length) return [{ type: "move", actor: m.id, to: any(opts).h }, DM];
  }
  if (roll < 57 && monsters.length) return [{ type: "place", actor: any(monsters).id, to: any(hexes) }, DM];
  if (roll < 60) return [{ type: "setLight", actor: any([...PARTY, ...monsters.map((m) => m.id)]), item: any(["torch", "candle", null]) }, DM];
  if (roll < 64) return [{ type: "setObject", object: any(["door", "brazier"]), state: any(["open", "closed", "lit", "out"]) }, DM];
  if (roll < 67) return [{ type: "use", actor: any(PARTY), object: "door", verb: any(["open", "close"]) }, PAT];
  if (roll < 70 && monsters.length) return [{ type: "hide", actor: any(monsters).id }, DM];
  if (roll < 73) return [{ type: "search", actor: "rogue" }, KIM];
  if (roll < 75) return [{ type: "hide", actor: "rogue" }, KIM];
  if (roll < 78) return [{ type: "condition", actor: any([...PARTY, ...monsters.map((m) => m.id)]), condition: any(["blinded", "invisible"]), on: pick(2) === 0 }, DM];
  if (roll < 81) return [{ type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: any(["bright", "dim", "dark", null]) } }] }, DM];
  if (roll < 83) return [{ type: "setting", key: "sight", value: any(["los", "light", "light", "los", "rooms"]) }, DM];
  if (roll < 86 && monsters.length < 4) return [{ type: "spawn", monster: "goblin-warrior", at: any(hexes), name: NAMES[monsters.length], hidden: pick(4) === 0 }, DM];
  if (roll < 89 && !s.encounter) return [{ type: "startEncounter", center: s.entities.fighter.pos, radius: 8 }, DM];
  if (roll < 91 && s.encounter) return [{ type: "endEncounter" }, DM];
  if (roll < 94 && monsters.length) return [{ type: "attack", actor: "fighter", target: any(monsters).id, attack: "javelin" }, PAT];
  if (roll < 96) return [{ type: "revealRegion", region: "vault" }, DM];
  if (roll < 97) return [{ type: "mapEdit", ops: [{ op: "forget" }] }, DM];
  return [{ type: "advanceTime", minutes: 1 }, DM];
}

// Play `steps` random actions and check every message to every player after each one.
function playChecked(seed, steps, { startRule = "los" } = {}) {
  const pick = chooser(seed);
  const { s } = crypt({ rule: startRule, seed });
  const clients = new Map(PLAYERS.map((p) => [p.userId, null]));
  const knownAt = [];                                           // per timeline entry: the creatures the party could see then
  const wasSeen = new Map();                                    // thing id -> the states it has had while the party saw a tile it touches
  const placesEver = new Set();
  let checked = 0, hiddenChecks = 0;
  const visit = (res) => {
    const o = oracle(s);
    for (const p of o.places) placesEver.add(p);
    const note = (ob) => (wasSeen.get(ob.id) ?? wasSeen.set(ob.id, new Set()).get(ob.id)).add(ob.state);
    for (const ob of s.map.objects) if (o.rule === "rooms" || objectHexes(ob).some((h) => o.places.has(`${ob.level}|${H.col(h)}`))) note(ob);
    // A door is known as it stands once a tile beside it is sent (the region revealed, the tile remembered).
    const sentTiles = view(s, PAT).map.levels.flatMap((l) => Object.keys(l.tiles).map((k) => `${l.id}|${k}`));
    for (const ob of s.map.objects) if (ob.edge !== undefined && !s.map.seen?.objects?.[ob.id] && objectHexes(ob).some((h) => sentTiles.includes(`${ob.level}|${H.col(h)}`))) note(ob);
    while (knownAt.length < s.timeline.length) knownAt.push(new Set(o.creatures));
    const unseen = Object.values(s.entities).filter((e) => e.side !== "party" && !o.creatures.has(e.id));
    for (const who of PLAYERS) {
      const v = view(s, who), evs = viewEvents(res.events, s, who), history = viewEvents(s.timeline.slice(-60), s, who);
      const text = JSON.stringify([v, evs, history]);
      for (const e of unseen) {
        assert.equal(text.includes(`"${e.id}"`), false, `seed ${seed}: ${e.id} (${e.name}) reached ${who.userId} under ${o.rule}`);
        assert.equal(text.includes(e.name), false, `seed ${seed}: ${e.name} reached ${who.userId} under ${o.rule}`);
        hiddenChecks++;
      }
      assert.equal(text.includes('"unseen"'), false);
      // Patches: what a client has, built from every patch, is exactly the fresh view.
      const wire = JSON.parse(JSON.stringify(v)), prev = clients.get(who.userId);
      if (prev) { applyPatch(prev.state, JSON.parse(JSON.stringify(diff(prev.snap, snapshot(wire), wire)))); assert.deepEqual(prev.state, wire, `seed ${seed}: patches diverged`); }
      clients.set(who.userId, { state: prev ? prev.state : structuredClone(wire), snap: snapshot(wire) });
      if (o.rule === "rooms") continue;
      // Places and things: never one the party has not made out.
      for (const l of v.map.levels) for (const k in l.tiles) {
        if (o.rule === "light") assert.ok(placesEver.has(`${l.id}|${k}`), `seed ${seed}: tile ${k} sent unseen`);
      }
      for (const ob of v.map.objects) assert.ok(wasSeen.get(ob.id)?.has(ob.state), `seed ${seed}: ${ob.id} sent as ${ob.state}, never seen so`);
      const sentCols = new Set(v.map.levels.flatMap((l) => Object.keys(l.tiles)));
      for (const ev of evs) {
        for (const h of ev.hexes ?? []) assert.ok(sentCols.has(H.col(h)), `seed ${seed}: ${ev.type} names hex ${H.col(h)}, not sent`);
        if (["object", "triggered", "noticed"].includes(ev.type)) { const obj = s.map.objects.find((x) => x.id === ev.object); assert.ok(objectHexes(obj).some((h) => o.places.has(`${obj.level}|${H.col(h)}`)), `seed ${seed}: event about ${ev.object} out of view`); }
        if (ev.type === "moved" && s.entities[ev.id]?.side !== "party") for (const h of ev.path) assert.ok([...o.places].some((p) => p.endsWith(`|${H.col(h)}`)), `seed ${seed}: path through ${H.col(h)} out of view`);
      }
    }
    // A guessed id: the same answer as one that does not exist, and nothing changes.
    if (unseen.length && checked % 3 === 0) {
      const e = unseen[checked % unseen.length], before = JSON.stringify(s);
      for (const [type, extra] of [["attack", { attack: "javelin" }], ["move", { to: at(0, 0) }]]) {
        const key = type === "attack" ? "target" : "actor";
        const real = apply(s, { type, actor: "fighter", ...extra, [key]: e.id }, PAT), fake = apply(s, { type, actor: "fighter", ...extra, [key]: "m9999" }, PAT);
        assert.deepEqual(real, fake, `seed ${seed}: guessing ${e.id} gave something away`);
      }
      assert.equal(JSON.stringify(s), before);
    }
    checked++;
  };
  visit({ events: [] });
  let seenGrows = 0, fights = 0;
  const rulesSeen = new Set();
  for (let i = 0; i < steps; i++) {
    const [action, ctx] = randomAction(s, pick);
    const had = JSON.stringify(s.map.seen?.tiles ?? {}).length;
    const res = apply(s, action, ctx);
    if (!res.ok) continue;
    rulesSeen.add(s.settings.sight); if (action.type === "startEncounter") fights++;
    if (!(action.type === "mapEdit" && action.ops[0].op === "forget")) assert.ok(JSON.stringify(s.map.seen?.tiles ?? {}).length >= had, "memory only grows, but by the DM");
    if (JSON.stringify(s.map.seen?.tiles ?? {}).length > had) seenGrows++;
    visit(res);
  }
  // The record, read at the end: an entry names only creatures the party could see when it happened.
  for (const who of PLAYERS) s.timeline.forEach((entry, i) => {
    for (const e of viewEvents([entry], s, who)) for (const id of [e.id, e.actor, e.target, ...(e.targets ?? [])]) {
      if (typeof id === "string" && s.entities[id]?.side !== "party" && s.entities[id]) assert.ok(knownAt[i]?.has(id), `seed ${seed}: entry ${i} (${entry.type}) names ${id}, unseen then`);
    }
  });
  if (process.env.SIGHT_STATS) console.log(JSON.stringify({ seed, checked, hiddenChecks, seenGrows, rules: [...rulesSeen], fights }));
  return { checked, hiddenChecks, seenGrows };
}

for (const seed of [1, 2, 3, 4]) {
  test(`property: over a long random game (seed ${seed}) nothing the party cannot see reaches any player`, () => {
    const r = playChecked(seed, 220, { startRule: seed % 2 ? "los" : "light" });
    assert.ok(r.checked > 120, `only ${r.checked} actions went through`);
    assert.ok(r.hiddenChecks > 100, `only ${r.hiddenChecks} unseen creatures were checked`);
  });
}
