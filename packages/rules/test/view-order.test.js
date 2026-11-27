// A player's events come in one fixed field order whatever was withheld on the way (#779; the leak of #748).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };

// JavaScript writes an integer-like key first, ascending, whatever order it was set in; that is the order sorted keys come out in.
const INT = /^(0|[1-9]\d*)$/;
const expectedOrder = (keys) => [...keys.filter((k) => INT.test(k)).sort((a, b) => a - b), ...keys.filter((k) => !INT.test(k)).sort()];
function unsorted(v, path = "") {
  if (v === null || typeof v !== "object") return null;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = unsorted(v[i], `${path}[${i}]`); if (r) return r; } return null; }
  const keys = Object.keys(v), want = expectedOrder(keys);
  if (keys.join("\u0000") !== want.join("\u0000")) return `${path || "(event)"}: ${keys.join(",")}`;
  for (const k of keys) { const r = unsorted(v[k], `${path}.${k}`); if (r) return r; }
  return null;
}

function playFight(seed, visit) {
  const s = newGame(seed);
  let res = apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM);
  assert.ok(res.ok);
  visit(s, res.events);
  for (let i = 0; i < 5000 && s.encounter; i++) {
    const id = current(s);
    res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok);
    visit(s, res.events);
  }
  return s;
}

test("an event rebuilt with a field withheld has the same key order as the one with nothing withheld", () => {
  const s = newGame(5);
  const pc = Object.keys(s.entities).find((id) => s.entities[id].side === "party");
  const foe = Object.keys(s.entities).find((id) => s.entities[id].side !== "party");
  assert.ok(pc && foe);
  // The same effectEnd twice: in the second a creature the party does not know of shares the spell (`unseen`), so `why` is rebuilt.
  const base = { type: "effectEnd", why: "it ran out", targets: [pc], fx: "fx1", name: "Bless", conc: true, lasts: 10, source: pc };
  const plain = viewEvents([structuredClone(base)], s, PLAYER);
  const withheld = viewEvents([{ ...structuredClone(base), targets: [pc, foe], unseen: [foe] }], s, PLAYER);
  assert.equal(plain.length, 1);
  assert.equal(withheld.length, 1);
  const a = Object.keys(plain[0]), b = Object.keys(withheld[0]);
  const shared = a.filter((k) => b.includes(k));
  assert.ok(shared.includes("why") && shared.includes("targets"));
  assert.deepEqual(shared, b.filter((k) => a.includes(k)));
  assert.equal(unsorted(plain[0]), null);
  assert.equal(unsorted(withheld[0]), null);
});

test("every event a player is sent in a scripted fight has sorted keys at every depth", () => {
  let seen = 0;
  playFight(7, (s, events) => {
    for (const ev of viewEvents(events, s, PLAYER)) { seen++; assert.equal(unsorted(JSON.parse(JSON.stringify(ev))), null); assert.equal(unsorted(ev), null); }
  });
  assert.ok(seen > 20, `only ${seen} events were sent`);
});

test("the DM's events are the engine's own, untouched", () => {
  playFight(7, (s, events) => {
    const before = JSON.stringify(events);
    assert.equal(viewEvents(events, s, DM), events);
    viewEvents(events, s, PLAYER);                      // building a player's copy changes nothing in the original
    assert.equal(JSON.stringify(events), before);
    assert.equal(JSON.stringify(viewEvents(events, s, DM)), before);
  });
});
