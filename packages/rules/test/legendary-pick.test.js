// Legendary actions, stage L3a: legendaryPick and the "By themselves" switch (docs/specs/legendary.md, Decision 8; test 13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, current } from "../src/engine.js";
import { legendaryPick } from "../src/ai.js";
import { newGame } from "../src/scenario.js";
import { playerView, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const end = (s) => apply(s, { type: "endTurn", actor: current(s) }, DM);
const clone = (s) => structuredClone(s);

// The party and one legendary monster "Verdigris" `dq` hexes from the fighter, the fight begun and a window open after a party creature's turn (as legendary-option.test.js).
function window(seed = 5, { monster = "adult-green-dragon", dq = 3, dr = 0, hard = true } = {}) {
  const s = newGame(seed);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  ok(s, { type: "setting", key: "legendaryWindows", value: true });
  const f = s.entities.fighter.pos;
  if (!apply(s, { type: "spawn", monster, at: { q: f.q + dq, r: f.r + dr }, name: "Verdigris" }, DM).ok) return { s, open: false };   // no room there: the sweep goes on
  ok(s, { type: "startEncounter", center: f });
  if (hard) for (const e of Object.values(s.entities)) if (e.side === "party") e.hp = e.maxHp = 900;
  for (let i = 0; i < 30 && !s.encounter?.between && s.encounter; i++) { assert.ok((s.encounter.between ? apply(s, { type: "legendary", done: true }, DM) : end(s)).ok); }
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  return { s, d, f, open: !!s.encounter?.between };
}

test("13: same state, same pick; every pick is accepted by apply() on a copy (1,000 seeded states)", () => {
  const monsters = ["adult-green-dragon", "adult-red-dragon", "lich", "adult-bronze-dragon", "tarrasque"];
  const seen = new Set();
  let picks = 0, skips = 0;
  for (let n = 0; n < 1000; n++) {
    const monster = monsters[n % monsters.length];
    const { s, d, open } = window(n + 1, { monster, dq: 2 + (n % 7), dr: (n % 5) - 2 });
    if (!open || !s.encounter.between.offered.includes(d.id)) { skips++; continue; }
    const before = clone(s);
    const a = legendaryPick(s, d.id), b = legendaryPick(s, d.id);
    assert.deepStrictEqual(a, b, `seed ${n + 1} ${monster}: two picks differ`);
    assert.deepStrictEqual(s, before, "picking changed the game");
    if (a === null) { skips++; continue; }
    picks++; seen.add(`${monster}:${a.option}`);
    const { why, ...action } = a;
    assert.equal(typeof why, "string"); assert.ok(why.length > 0);
    const opt = d.legendary.actions.options.find((o) => o.id === a.option);
    assert.ok(opt && !opt.manual, `${monster}: a manual option was picked`);
    assert.ok(d.hp > 0);
    const r = apply(clone(s), action, DM);
    assert.ok(r.ok, `seed ${n + 1} ${monster} ${JSON.stringify(action)}: ${r.error}`);
  }
  assert.ok(picks > 300, `most states give a pick (${picks}, ${skips} skips)`);
  assert.ok(seen.size >= 5, `a variety of picks: ${[...seen].join(", ")}`);
});

test("13: the order: an `again` option first, then an area catching two, then the attack (after the move)", () => {
  // Green dragon: Noxious Miasma has `again`, so it comes before Pounce.
  const far = window(5), g = far.s, gd = far.d;
  gd.pos = { ...gd.pos, q: far.f.q + 5 };                          // well out of reach: a few hexes of open ground off
  assert.equal(legendaryPick(g, gd.id).option, "noxious-miasma");
  // Once it has been taken (and so barred until its next turn) the attack is left, and it moves in first (three hexes off, Pounce reaches 5 feet).
  gd.legend.again["noxious-miasma"] = true;
  const p = legendaryPick(g, gd.id);
  assert.equal(p.option, "pounce"); assert.ok(p.to, "it moves up first"); assert.ok(p.target);
  assert.ok(apply(clone(g), { ...p, why: undefined }, DM).ok);
  // Beside a foe it needs no move.
  const near = window(5, { dq: 3 }), nd = near.d;
  nd.legend.again["noxious-miasma"] = true;
  const q = legendaryPick(near.s, nd.id);
  assert.equal(q.option, "pounce"); assert.equal(q.to, undefined);
  // Bronze: Thunderclap (an area, not limited) is picked over Pounce only when it catches two foes.
  const b = window(5, { monster: "adult-bronze-dragon", dq: 3 });
  const bd = b.d, foes = Object.values(b.s.entities).filter((e) => e.side === "party");
  const keep = foes.slice(0, 2);                                  // two foes beside it, the rest set aside from the count
  for (const e of foes) if (!keep.includes(e)) e.hp = 0;
  keep[0].pos = { ...bd.pos, q: bd.pos.q - 6 }; keep[1].pos = { ...bd.pos, q: bd.pos.q - 6, r: bd.pos.r + 1 };      // side by side, out of the sphere's reach of the dragon itself
  const two = legendaryPick(b.s, bd.id);
  assert.equal(two.option, "thunderclap", JSON.stringify(two));
  keep[1].hp = 0; keep[0].pos = { ...bd.pos, q: bd.pos.q - 2 };      // one foe, beside it: the attack
  const one = legendaryPick(b.s, bd.id);
  assert.equal(one?.option, "pounce", JSON.stringify(one));
});

test("13: never a manual option, never a creature at 0 Hit Points, a skip when nothing is legal", () => {
  const { s, d } = window(5, { monster: "adult-red-dragon", dq: 3 });
  assert.ok(legendaryPick(s, d.id));
  const all = d.legendary.actions.options;
  d.legendary.actions.options = all.filter((o) => o.manual);       // only the DM's options left
  assert.equal(legendaryPick(s, d.id), null);
  d.legendary.actions.options = all;
  d.legend.acts = d.legendary.actions.uses;                        // no use left
  assert.equal(legendaryPick(s, d.id), null);
  d.legend.acts = 0;
  s.encounter.between.done.push(d.id);                             // already taken
  assert.equal(legendaryPick(s, d.id), null);
  s.encounter.between.done = [];
  const hp = d.hp; d.hp = 0;
  assert.equal(legendaryPick(s, d.id), null);
  d.hp = hp;
  assert.equal(legendaryPick(s, "fighter"), null, "a creature the window does not offer");
  assert.ok(legendaryPick(s, d.id));
  delete s.encounter.between;
  assert.equal(legendaryPick(s, d.id), null, "no window");
});

test("13: `legendarySet { self }`: the DM only, true or false only, round-trips; a player is sent nothing of it", () => {
  const { s, d } = window(5);
  const before = clone(s);
  for (const bad of [1, "yes", null]) {
    const r = apply(s, { type: "legendarySet", actor: d.id, set: { self: bad } }, DM);
    assert.equal(r.ok, false); assert.match(r.error, /self is true or false/);
  }
  const pl = apply(s, { type: "legendarySet", actor: d.id, set: { self: true } }, { role: "player", userId: "pat" });
  assert.equal(pl.ok, false); assert.match(pl.error, /Only the DM/);
  assert.deepStrictEqual(s, before, "refusals changed nothing");
  const r = ok(s, { type: "legendarySet", actor: d.id, set: { self: true } });
  assert.deepEqual(r.events, [{ type: "legendarySet", id: d.id, set: { self: true } }]);
  assert.equal(d.legend.self, true);
  ok(s, { type: "legendarySet", actor: d.id, set: { self: false, acts: 1 } });
  assert.equal(d.legend.self, false); assert.equal(d.legend.acts, 1);
  ok(s, { type: "legendarySet", actor: d.id, set: { self: true } });
  // What a player is sent: the creature (a foe) has no `legend` or `self`, and the event is dropped.
  const PAT = { role: "player", userId: "pat" };
  const foe = JSON.stringify(playerView(s, PAT).entities[d.id] ?? null);
  assert.ok(!foe.includes('"self"') && !foe.includes('"legend'), "a foe is sent with neither `legend` nor `self`");
  assert.deepEqual(viewEvents(r.events, s, PAT), [], "the event is dropped for a player");
});
