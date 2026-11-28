// Legendary actions, stage L1d: what players are sent (docs/specs/legendary.md, Decision 9, test 12 without Legendary Resistance) and lair XP (Decision 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { playerView, view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const end = (s) => apply(s, { type: "endTurn", actor: current(s) }, DM);

// The party and the adult green dragon "Verdigris" three hexes from the fighter, a fight begun and a window open after a party creature's turn.
function window(seed = 5) {
  const s = newGame(seed);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  ok(s, { type: "setting", key: "legendaryWindows", value: true });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster: "adult-green-dragon", at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  ok(s, { type: "startEncounter", center: f });
  for (const e of Object.values(s.entities)) if (e.side === "party") e.hp = e.maxHp = 900;
  for (let i = 0; i < 30 && !s.encounter.between; i++) assert.ok(end(s).ok);
  assert.ok(s.encounter.between, "a window is open");
  return { s, d: Object.values(s.entities).find((e) => e.name === "Verdigris"), f };
}
const take = (s, d, f) => ok(s, { type: "legendary", actor: d.id, option: "pounce", to: { q: f.q + 1, r: f.r }, target: "fighter" });

test("12: the legendary event is sent as an act is: who and the option's name, never `after`", () => {
  const { s, d, f } = window();
  const r = take(s, d, f);
  const ev = r.events.find((e) => e.type === "legendary");
  assert.ok(ev.after, "the engine's event says whose turn it followed");
  const sent = viewEvents(r.events, s, PAT).filter((e) => e.type === "legendary");
  assert.deepEqual(sent, [{ type: "legendary", actor: d.id, name: "Pounce" }]);
  assert.ok(!JSON.stringify(viewEvents(r.events, s, PAT)).includes(ev.after), "and nothing else names whose turn it was");
});

test("12: the window's own events and the DM's counters are never sent to a player", () => {
  const { s, d } = window();
  const opened = [{ type: "legendaryWindow", after: "fighter", offered: [d.id] }, { type: "legendarySkip", actor: d.id }, { type: "legendarySet", id: d.id, set: { acts: 1, show: true } }];
  assert.deepEqual(viewEvents(opened, s, PAT), []);
  const r = ok(s, { type: "legendary", actor: d.id, skip: true });
  assert.ok(r.events.some((e) => e.type === "legendarySkip"));
  assert.deepEqual(viewEvents(r.events, s, PAT).filter((e) => /^legendary/.test(e.type)), []);
  const r2 = ok(s, { type: "legendarySet", actor: d.id, set: { acts: 1 } });
  assert.deepEqual(viewEvents(r2.events, s, PAT).filter((e) => /^legendary/.test(e.type)), []);
});

test("12: a creature the party does not know of is not named by its legendary event", () => {
  const { s, d, f } = window();
  const r = take(s, d, f);
  s.entities[d.id].hidden = true;                  // the DM hides it again after the fact: it is one the party does not know of
  assert.deepEqual(viewEvents(r.events, s, PAT).filter((e) => e.type === "legendary"), []);
});

test("12: the option's history label is shown as an act's is, and not at all for a creature the party does not know of", () => {
  const { s, d, f } = window();
  const before = mark(s), a = { type: "legendary", actor: d.id, option: "pounce", to: { q: f.q + 1, r: f.r }, target: "fighter" };
  const r = ok(s, a);
  const step = describeStep(a, r.events, before, s);
  assert.equal(step.label, "Verdigris: Pounce");
  assert.equal(step.shown, "Verdigris: Pounce");
  s.entities[d.id].hidden = true;
  const hid = describeStep(a, r.events, before, s);
  assert.equal(hid.label, "Verdigris: Pounce", "the DM's label is whole");
  assert.equal(hid.shown, null, "players are told nothing");
  const h = createHistory();
  h.record(before, s, hid);
  assert.deepEqual(h.list(), ["Verdigris: Pounce"]);
});

test("9: a foe's record carries nothing of legendary or legend; with `show` it carries legend { left, max } only", () => {
  const { s, d } = window();
  const foe = () => playerView(s).entities[d.id];
  const raw = JSON.stringify(foe());
  assert.ok(!/legend/.test(raw), "nothing by default");
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 1 } });
  assert.equal(JSON.stringify(foe()), raw, "uses spent move nothing the players are sent");
  ok(s, { type: "legendarySet", actor: d.id, set: { lair: true } });
  assert.equal(JSON.stringify(foe()), raw, "nor does the lair mark");
  ok(s, { type: "legendarySet", actor: d.id, set: { lair: false, show: true } });
  assert.deepEqual(foe().legend, { left: 2, max: 3 });
  assert.ok(!("legendary" in foe()) && !/resisted|again|lair|show/.test(JSON.stringify(foe())), "only the count");
  ok(s, { type: "legendarySet", actor: d.id, set: { lair: true } });
  assert.deepEqual(foe().legend, { left: 3, max: 4 }, "the lair's number applies");
  assert.ok(!/legend/.test(JSON.stringify(view(s, PAT).entities[d.id]).replace(/"legend":\{"left":\d,"max":\d\}/, "")), "view() sends the same");
});

test("9: `between` is sent as true and nothing else", () => {
  const { s } = window();
  const enc = playerView(s).encounter;
  assert.equal(enc.between, true);
  assert.ok(!JSON.stringify(enc).includes("offered") && !JSON.stringify(enc).includes("after"));
});

test("1: a legendary creature marked in its lair is worth its lair XP when the fight is won", () => {
  const win = (lair) => {
    const s = newGame(5);
    ok(s, { type: "setting", key: "conclusion", value: "dm" });
    const f = s.entities.fighter.pos;
    const id = ok(s, { type: "spawn", monster: "adult-green-dragon", at: { q: f.q + 3, r: f.r }, name: "Verdigris" }).events[0].id;
    if (lair) ok(s, { type: "legendarySet", actor: id, set: { lair: true } });
    ok(s, { type: "startEncounter", center: f, radius: 30 });
    for (const e of Object.values(s.entities).filter((x) => x.side === "foe")) if (s.encounter) ok(s, { type: "harm", actor: e.id, amount: e.hp });
    assert.equal(s.encounter, null);
    return s.conclusion.foes.find((x) => x.id === id).xp;
  };
  const m = CONTENT.monsters["adult-green-dragon"];
  assert.equal(win(false), m.xp);
  assert.equal(win(true), m.legendary.lair.xp);
  assert.notEqual(m.xp, m.legendary.lair.xp);
});
