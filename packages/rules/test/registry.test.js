// The content registry: a table's homebrew added into the lookups for one call (docs/specs/homebrew.md, task B4).
// The homebrew here is invented for these tests, made of existing steps.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as INDEX from "../src/content/index.js";
import { CONTENT, HOMEBREW_LOOKUPS, MONSTER_ACTIONS, MONSTERS, SPELLS } from "../src/content/index.js";
import { HOMEBREW_KINDS, install, installed, loadPack, overlayOf, PackError, uninstall, using } from "../src/content/registry.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { barriers } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };

// Every lookup object the registry may write to, and a picture of it: identity, keys in order.
const TARGETS = [...new Set(Object.values(HOMEBREW_LOOKUPS).flatMap((l) => l.map(([t]) => t)))];
const picture = () => TARGETS.map((t) => [t, Object.keys(t).join("\n")]);
const BEFORE = picture();
const unchanged = () => {
  const now = picture();
  assert.equal(now.length, BEFORE.length);
  now.forEach(([t, keys], i) => { assert.equal(t, BEFORE[i][0], "same object"); assert.equal(keys, BEFORE[i][1], "same keys in the same order"); });
};

const spell = (pack, name, over = {}) => ({
  id: `hb-${pack}-${name}`, name: "Cinder Lash", source: `homebrew:${pack}`, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "A lash of embers.", ...over,
});
const monster = (pack, name) => ({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: `hb-${pack}-${name}`, name: "Cinderling", source: `homebrew:${pack}`, checked: false, text: "A small ember spirit." });
const doc = (id, lists) => ({ format: "hextable-pack", v: 1, pack: { id, name: id, version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const EMBER = doc("ember-folk", { spells: [spell("ember-folk", "cinder-lash")], monsters: [monster("ember-folk", "cinderling")] });
const FROST = doc("frost-kin", { spells: [spell("frost-kin", "rime-bolt", { name: "Rime Bolt", effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "2d8", type: "cold" }] }] })] });
const loaded = (d) => { const r = loadPack(d); assert.ok(r.ok, r.problems?.join("; ")); return r.pack; };
const LASH = "hb-ember-folk-cinder-lash", RIME = "hb-frost-kin-rime-bolt", CINDER = "hb-ember-folk-cinderling";

// The wizard knows `spells`, in a fight on its turn, with a goblin warrior two hexes away.
function duel(spells, seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 4 }, slotsMax: { 1: 4 } });
  s.entities.wizard.spells.push(...spells);
  const r = apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM);
  for (let i = 0; i < 20 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(current(s), "wizard");
  return { s, goblin: r.events[0].id };
}

test("with no overlay, the lookups are the module's own objects, unchanged", () => {
  unchanged();
  assert.equal(installed(), null);
  for (const kind of HOMEBREW_KINDS) assert.equal(HOMEBREW_LOOKUPS[kind][0][0], CONTENT[kind]);
  assert.ok(HOMEBREW_LOOKUPS.spells.some(([t]) => t === SPELLS));
  assert.ok(HOMEBREW_LOOKUPS.monsters.some(([t]) => t === MONSTERS) && HOMEBREW_LOOKUPS.monsters.some(([t]) => t === MONSTER_ACTIONS));
});

test("every lookup content/index.js exports keyed by a homebrew kind's ids is one the registry writes to", () => {
  for (const kind of HOMEBREW_KINDS) {
    const ids = Object.keys(CONTENT[kind]).join("\n");
    const keyed = [CONTENT[kind], ...Object.values(INDEX)].filter((x) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length && Object.keys(x).join("\n") === ids);
    for (const t of keyed) assert.ok(HOMEBREW_LOOKUPS[kind].some(([x]) => x === t), `a lookup keyed by ${kind} ids is missing from HOMEBREW_LOOKUPS`);
  }
});

test("a homebrew spell cast inside using runs its steps, and the game replays byte for byte in the same overlay", () => {
  const ov = overlayOf([loaded(EMBER)]);
  const play = () => {
    const { s, goblin } = duel([LASH]);
    const before = s.entities[goblin].hp;
    const r = using(ov, () => apply(s, { type: "cast", actor: "wizard", spell: LASH, targets: [goblin] }, DM));
    assert.ok(r.ok, r.error);
    assert.deepEqual(r.events.map((e) => e.type), ["cast", "save", "damage"]);
    assert.equal(r.events[0].name, "Cinder Lash");
    assert.equal(r.events[2].dtype, "fire");
    assert.equal(s.entities[goblin].hp, Math.max(0, before - r.events[2].amount));
    assert.equal(s.entities.wizard.slots[1], 3, "a slot is spent");
    const shown = using(ov, () => JSON.stringify([view(s, PLAYER), viewEvents(r.events, s, PLAYER)]));
    return JSON.stringify(s) + shown + JSON.stringify(r);
  };
  assert.equal(play(), play());
  unchanged();
});

test("outside using a homebrew id does not exist, and a cast of it is refused changing nothing", () => {
  const ov = overlayOf([loaded(EMBER)]);
  using(ov, () => { assert.ok(SPELLS[LASH] && CONTENT.spells[LASH] && MONSTERS[CINDER] && MONSTER_ACTIONS[CINDER]); });
  for (const t of TARGETS) { assert.equal(Object.hasOwn(t, LASH), false); assert.equal(Object.hasOwn(t, CINDER), false); }
  const { s, goblin } = duel([LASH]);
  const was = JSON.stringify(s);
  const r = apply(s, { type: "cast", actor: "wizard", spell: LASH, targets: [goblin] }, DM);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s), was);
  assert.equal(apply(s, { type: "spawn", monster: CINDER, at: { q: 3, r: 0 } }, DM).ok, false);
  assert.equal(JSON.stringify(s), was);
});

test("a homebrew monster spawns inside using with its own copy of its actions", () => {
  const ov = overlayOf([loaded(EMBER)]);
  const { s } = duel([]);
  const r = using(ov, () => apply(s, { type: "spawn", monster: CINDER, at: { q: -2, r: 0 } }, DM));
  assert.ok(r.ok, r.error);
  const e = s.entities[r.events[0].id];
  assert.match(e.name, /^Cinderling/);
  assert.equal(e.tpl, CINDER);
  unchanged();
});

test("two overlays used in turn never see each other's ids", () => {
  const a = overlayOf([loaded(EMBER)]), b = overlayOf([loaded(FROST)]);
  for (let i = 0; i < 3; i++) {
    using(a, () => { assert.ok(SPELLS[LASH]); assert.equal(SPELLS[RIME], undefined); assert.equal(CONTENT.spells[RIME], undefined); });
    using(b, () => { assert.ok(SPELLS[RIME]); assert.equal(SPELLS[LASH], undefined); assert.equal(MONSTERS[CINDER], undefined); });
  }
  // Two tables, interleaved: each casts its own spell; the other's is refused.
  const ta = duel([LASH, RIME]), tb = duel([LASH, RIME]);
  assert.ok(using(a, () => apply(ta.s, { type: "cast", actor: "wizard", spell: LASH, targets: [ta.goblin] }, DM)).ok);
  assert.equal(using(b, () => apply(tb.s, { type: "cast", actor: "wizard", spell: LASH, targets: [tb.goblin] }, DM)).ok, false);
  assert.ok(using(b, () => apply(tb.s, { type: "cast", actor: "wizard", spell: RIME, targets: [tb.goblin] }, DM)).ok);
  unchanged();
  // Both packs on one table: both play.
  using(overlayOf([loaded(FROST), loaded(EMBER)]), () => { assert.ok(SPELLS[LASH] && SPELLS[RIME]); });
  unchanged();
});

test("a throw inside using takes every id out again, leaving the lookups exactly as they were", () => {
  const ov = overlayOf([loaded(EMBER), loaded(FROST)]);
  assert.throws(() => using(ov, () => { assert.ok(SPELLS[LASH]); throw new Error("boom"); }), /boom/);
  unchanged();
  assert.equal(installed(), null);
  // A throw from deep inside the engine, the same.
  const { s } = duel([LASH]);
  assert.throws(() => using(ov, () => { apply(s, { type: "spawn", monster: CINDER, at: { q: -2, r: 0 } }, DM); null.x; }), TypeError);
  unchanged();
  // And the next call installs it again as before.
  assert.ok(using(ov, () => !!SPELLS[LASH]));
});

test("using the same overlay again inside itself is a no-op; another overlay inside is refused", () => {
  const a = overlayOf([loaded(EMBER)]), b = overlayOf([loaded(FROST)]);
  using(a, () => {
    assert.equal(using(a, () => SPELLS[LASH].name), "Cinder Lash");
    assert.ok(SPELLS[LASH], "the inner call leaves the outer one's ids in place");
    assert.throws(() => using(b, () => 1), /do not nest/);
    assert.equal(SPELLS[RIME], undefined);
    assert.ok(SPELLS[LASH]);
  });
  unchanged();
});

test("an async or generator function, or a promise returned, is refused and nothing stays installed", () => {
  const ov = overlayOf([loaded(EMBER)]);
  let ran = false;
  assert.throws(() => using(ov, async () => { ran = true; }), /synchronous/);
  assert.throws(() => using(ov, function* () { ran = true; }), /synchronous/);
  assert.equal(ran, false, "refused before it runs");
  assert.throws(() => using(ov, () => Promise.resolve(SPELLS[LASH])), /promise/);
  unchanged();
  assert.throws(() => using({}, () => 1), /not an overlay/);
  assert.throws(() => using(ov, "x"), /synchronous/);
});

test("an id that is an SRD id, has no pack prefix, or is already in the rules is refused", () => {
  const bad = (lists, re, id = "ember-folk") => { const r = loadPack(doc(id, lists)); assert.equal(r.ok, false); assert.match(r.problems.join("\n"), re); };
  bad({ spells: [spell("ember-folk", "x", { id: "fire-bolt" })] }, /hb-ember-folk-/);
  bad({ spells: [spell("frost-kin", "x")] }, /hb-ember-folk-/);
  bad({ spells: [spell("srd52", "x")] }, /SRD pack/, "srd52");
  bad({ spells: [spell("ember-folk", "x", { checked: true })] }, /not checked/);
  bad({ spells: [spell("ember-folk", "x", { level: "one" })] }, /spells\/hb-ember-folk-x/);       // the linter's own sentence
  bad({ classes: [] }, /cannot be homebrew/);
  bad({ spells: {} }, /must be a list/);
  assert.equal(loadPack({ ...EMBER, format: "other" }).ok, false);
  assert.equal(loadPack("{ not json").ok, false);
  assert.equal(loadPack({ ...EMBER, spells: [{ ...spell("ember-folk", "x"), f() {} }] }).ok, false, "a function is not data");
  assert.match(loadPack('{"format":"hextable-pack","v":1,"__proto__":{"x":1}}').problems.join(), /__proto__/);
  // A depth bomb is refused in bounded time, with no stack overflow.
  let deep = { damage: "1d4", type: "fire" };
  for (let i = 0; i < 10000; i++) deep = { save: "dex", onFail: [deep] };
  assert.match(loadPack({ ...EMBER, spells: [spell("ember-folk", "deep", { effects: [deep] })] }).problems.join(), /deeper/);
  // The same pack twice, and an id already in a lookup (put there by hand, as old tests do), are refused.
  assert.throws(() => overlayOf([loaded(EMBER), loaded(EMBER)]), (e) => e instanceof PackError && /twice/.test(e.message));
  const p = loaded(EMBER), ov = overlayOf([p]);
  SPELLS[LASH] = { stray: true };
  try {
    assert.throws(() => overlayOf([p]), /already in the rules/);
    assert.throws(() => using(ov, () => 1), /already in the rules/);
    assert.deepEqual(SPELLS[LASH], { stray: true }, "the refusal changed nothing");
  } finally { delete SPELLS[LASH]; }
  unchanged();
  assert.throws(() => overlayOf([doc("ember-folk", { spells: [spell("ember-folk", "x", { id: "fire-bolt" })] })]), PackError);
});

test("a loaded pack is a frozen copy: changing the document afterwards changes nothing", () => {
  const d = structuredClone(EMBER), p = loaded(d);
  d.spells[0].effects[0].onFail[0].damage = "10d10";
  const ov = overlayOf([p]);
  using(ov, () => {
    assert.equal(CONTENT.spells[LASH].effects[0].onFail[0].damage, "3d6");
    assert.ok(Object.isFrozen(SPELLS[LASH]) && Object.isFrozen(CONTENT.spells[LASH].effects[0]));
    assert.equal(SPELLS[LASH].def, CONTENT.spells[LASH], "the profile's def is the entry, as for SRD spells");
  });
  // Built once: the same loaded pack gives the same profile object every time.
  const first = using(ov, () => SPELLS[LASH]);
  assert.equal(using(overlayOf([p]), () => SPELLS[LASH]), first);
  // Packs in another order give the same keys in the same order.
  const order = (packs) => using(overlayOf(packs), () => Object.keys(SPELLS).slice(-2).join());
  assert.equal(order([loaded(EMBER), loaded(FROST)]), order([loaded(FROST), loaded(EMBER)]));
});

test("something written into a lookup during using is reported, and the lookups are restored", () => {
  const ov = overlayOf([loaded(EMBER)]);
  try {
    assert.throws(() => using(ov, () => { SPELLS["stray-write"] = {}; }), /changed during the call/);
  } finally { delete SPELLS["stray-write"]; }
  unchanged();
});

test("the registry module is pure: no I/O, clock or randomness", () => {
  const src = readFileSync(new URL("../src/content/registry.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of [/Math\.random/, /Date\b/, /performance\./, /from ['"]node:/, /\bprocess\./, /\bfetch\(/, /setTimeout|setInterval/]) assert.doesNotMatch(src, bad);
});

// ---------- caches built from content (finding of B4, DEBT P31, fixed in #380) ----------
// walls.js `barriers(map)` keeps what blocks, beside the map, under a signature of the walls and of each object's
// id, def, state and place. Until #380 the signature had the def's id but not which def it named, so a read of the
// same map outside the overlay (or under an older version of the pack) was kept and given back inside it. Now it
// holds a number for the def object itself (none outside the overlay), so no answer crosses an overlay or outlives
// a changed def; sight.js, vision.js and view.js key their caches on `barriers(map).sig`, so they follow it.
test("barriers() never gives back an answer from across an overlay or from a changed def (was the FINDING of #379)", () => {
  const thing = { id: "hb-ember-folk-ember-wall", name: "Ember wall", kind: "thing", source: "homebrew:ember-folk", tier: "auto", checked: false,
    states: { up: { name: "burning", blocks: ["move", "sight"] } }, initial: "up", use: [], text: "A wall of embers." };
  const ov = overlayOf([loaded(doc("ember-folk", { objects: [thing] }))]);
  const fresh = () => { const s = newGame(5); s.map.objects.push({ id: "o-hb", def: thing.id, state: "up", level: s.map.levels[0].id, at: { q: 1, r: 0 } }); return s; };
  const solid = (s, B) => B.solid(s.map.levels[0].id, { q: 1, r: 0 });
  // Read inside the overlay on a fresh map: the thing fills its hex, as it should.
  const a = fresh();
  assert.equal(using(ov, () => solid(a, barriers(a.map))), true);
  // Read outside first (where the def is unknown), then inside, on the same map: inside is worked out again.
  const b = fresh();
  const outside = barriers(b.map);
  assert.equal(solid(b, outside), false);
  const later = using(ov, () => barriers(b.map));
  assert.notEqual(later, outside, "the answer from outside the overlay is not reused inside it");
  assert.equal(solid(b, later), true, "inside the overlay the homebrew thing blocks");
  // And the other way: an answer made inside is not kept after using ends.
  assert.equal(solid(a, barriers(a.map)), false, "outside the overlay the unknown thing does not block");
  // Inside again, the overlay's answer is the cached one (nothing changed since it was made: the cache still works).
  const again = using(ov, () => barriers(b.map));
  assert.equal(using(ov, () => barriers(b.map)), again, "the same overlay and map give back the cached answer");
  // A new version of the pack (the thing no longer blocks) is a new def: the old answer is not given back under it.
  const v2 = overlayOf([loaded(doc("ember-folk", { objects: [{ ...thing, states: { up: { name: "embers", blocks: [] } } }] }))]);
  assert.equal(using(ov, () => solid(b, barriers(b.map))), true);
  assert.equal(using(v2, () => solid(b, barriers(b.map))), false, "the changed def is read, not the old answer");
  // What the players are sent follows. Under the los rule the fighter, alone, is walled in by six homebrew doors that
  // block sight, one on each side of its hex: inside the overlay the player is sent almost nothing, outside (where the
  // def is unknown) the valley. Before #380 the first answer was given back in both, whichever came first.
  const sightSent = (first) => {
    const c = newGame(5), f = c.entities.fighter.pos;
    apply(c, { type: "setting", key: "sight", value: "los" }, DM);
    for (const id of Object.keys(c.entities)) if (c.entities[id].side === "party" && id !== "fighter") delete c.entities[id];
    const door = { ...thing, id: "hb-ember-folk-ember-door", kind: "door" };
    const ov2 = overlayOf([loaded(doc("ember-folk", { objects: [door] }))]);
    for (let e = 0; e < 6; e++) c.map.objects.push({ id: `d${e}`, def: door.id, state: "up", level: c.map.levels[0].id, at: { q: f.q, r: f.r }, edge: e });
    const sent = () => JSON.stringify(view(c, PLAYER).sight);
    const inside = () => using(ov2, sent);
    return first === "inside" ? { inside: inside(), outside: sent() } : { outside: sent(), inside: inside() };
  };
  const x = sightSent("outside"), y = sightSent("inside");
  assert.ok(x.inside.length < x.outside.length / 10, "walled in by its doors inside the overlay");
  assert.equal(x.inside, y.inside, "inside, the same whichever was asked first");
  assert.equal(x.outside, y.outside, "outside, the same whichever was asked first");
});

// ---------- an overlay kept installed: install and uninstall (B7, the page) ----------
test("install puts the ids in and uninstall takes them out, leaving the lookups exactly as they were", () => {
  const a = overlayOf([loaded(EMBER)]);
  try {
    install(a);
    assert.equal(installed(), a);
    assert.equal(SPELLS[LASH].name, "Cinder Lash");
    assert.ok(MONSTERS[CINDER] && CONTENT.spells[LASH]);
    uninstall(a);
    assert.equal(installed(), null);
    assert.equal(SPELLS[LASH], undefined);
    unchanged();
    install(a); uninstall(a); unchanged();              // and again
  } finally { if (installed() === a) uninstall(a); }
});

test("a second install is refused, the same overlay or another, and changes nothing", () => {
  const a = overlayOf([loaded(EMBER)]), b = overlayOf([loaded(FROST)]);
  install(a);
  try {
    assert.throws(() => install(a), /already installed/);
    assert.throws(() => install(b), /uninstall it first/);
    assert.equal(installed(), a);
    assert.ok(SPELLS[LASH]); assert.equal(SPELLS[RIME], undefined);
  } finally { uninstall(a); }
  unchanged();
  install(b); assert.ok(SPELLS[RIME]); assert.equal(SPELLS[LASH], undefined); uninstall(b); unchanged();
});

test("install and uninstall refuse what is not an overlay, and uninstall refuses the wrong one or one nobody installed", () => {
  const a = overlayOf([loaded(EMBER)]), b = overlayOf([loaded(FROST)]);
  assert.throws(() => install({}), /not an overlay/);
  assert.throws(() => uninstall({}), /not an overlay/);
  assert.throws(() => uninstall(a), /not the one installed/);
  install(a);
  try { assert.throws(() => uninstall(b), /not the one installed/); assert.ok(SPELLS[LASH]); } finally { uninstall(a); }
  assert.throws(() => uninstall(a), /not the one installed/);
  // an overlay that using installed is not install's to take out
  using(a, () => assert.throws(() => uninstall(a), /not the one installed/));
  unchanged();
});

test("using while an overlay is installed: the same overlay runs as a no-op re-entry and leaves it installed, another is refused", () => {
  const a = overlayOf([loaded(EMBER)]), b = overlayOf([loaded(FROST)]);
  install(a);
  try {
    assert.equal(using(a, () => SPELLS[LASH].name), "Cinder Lash");
    assert.ok(SPELLS[LASH], "the ids stay after using returns");
    assert.throws(() => using(b, () => 1), /do not nest/);
    assert.equal(installed(), a);
  } finally { uninstall(a); }
  unchanged();
  assert.equal(using(b, () => SPELLS[RIME].name), "Rime Bolt", "after uninstall, using works for any overlay again");
  unchanged();
});

test("an id already in a lookup refuses install, and nothing is left behind", () => {
  const a = overlayOf([loaded(EMBER)]);
  install(a);
  const same = overlayOf([loaded(EMBER)]);           // built while `a` is installed, so its ids are not refused as clashes
  uninstall(a);
  SPELLS[LASH] = { id: "planted" };
  try {
    assert.throws(() => install(same), /already in the rules/);
    assert.equal(installed(), null);
    assert.equal(MONSTERS[CINDER], undefined, "no other id of the overlay was left in");
  } finally { delete SPELLS[LASH]; }
  unchanged();
});

test("a key written into a lookup while installed is reported by uninstall, and the lookups are put back", () => {
  const a = overlayOf([loaded(EMBER)]);
  install(a);
  SPELLS["stray-key"] = { id: "stray-key" };
  assert.throws(() => uninstall(a), /changed while installed/);
  assert.equal(installed(), null);
  assert.equal(SPELLS["stray-key"], undefined);
  unchanged();
});

test("a game plays through install as it does through using: a homebrew spell cast while installed resolves, and replays the same", () => {
  const a = overlayOf([loaded(EMBER)]);
  const run = () => { const { s, goblin } = duel([LASH]); const r = apply(s, { type: "cast", actor: "wizard", spell: LASH, at: undefined, targets: [goblin] }, DM); return { ok: r.ok, error: r.error, state: JSON.stringify(s) }; };
  const viaUsing = using(a, run);
  install(a);
  let kept; try { kept = run(); } finally { uninstall(a); }
  assert.equal(kept.ok, viaUsing.ok, kept.error);
  assert.equal(kept.state, viaUsing.state);
  unchanged();
});
