// #374, Part B1 (the re-review of #373, L1): a party creature whose own senses find a hiding foe (Blindsight within
// range sees it whatever it does; Truesight sees the Invisible, and hiding is the Invisible condition against its
// enemies) may react to it again, as on main before #373, but finds it first: the foe stops hiding (`unhidden`, why
// `found`, by the reactor) before the reaction, so the party is told before anything is done against it. A creature
// the DM has hidden, and a hiding one nobody in the party can sense, still get no reaction from the party. Twin runs: the
// same table with the reaction set `never` sends every player the same events and view up to the reveal (the first
// event a player gets that names the foe), and, where nothing reveals it, the same events and view throughout.
// Hex valley and the square room.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents, view, viewPrompt } from "../src/view.js";
import { findFor, sensesFor, seesFor } from "../src/engine/resolve.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, U1, PLAYERS, GRIDS, SPOTS, json, ok } from "./e23-kit.js";

const { apply, current } = E;
const K = kit({ apply, current, makeEntity: E.makeEntity, derive, newGame, squareRoom });
const AWAY = { hex: { q: -4, r: 3 }, square: { q: 2, r: 9 } };          // three cells from where the goblin starts

// The starter party (the fighter is u1's) and a goblin beside the fighter, in a fight, on the goblin's turn.
// `senses`: the fighter's; `oa`: the fighter's standing instruction for the Opportunity Attack; `how`: what the goblin is
// (`hiding` from the Hide action, `hidden` by the DM, or neither).
function field(grid, { senses = {}, oa = "always", how = "hiding", seed = 5 } = {}) {
  const s = K.table(grid, { seed, autoEngage: false });
  for (const id of ["mage", "priest"]) ok(apply(s, { type: "remove", actor: id }, DM));
  s.entities.rogue.pos = { ...SPOTS[grid].cleric, q: SPOTS[grid].cleric.q + 1, z: 0 };
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: SPOTS[grid].rogue }, DM));
  const gob = Object.keys(s.entities).find((id) => s.entities[id].name.startsWith("Goblin"));
  s.entities[gob].hp = s.entities[gob].maxHp = 300;
  s.entities.fighter.senses = { ...s.entities.fighter.senses, ...senses };
  if (oa !== "always") ok(apply(s, { type: "reactions", actor: "fighter", set: { "opportunity-attack": oa } }, U1));
  ok(apply(s, { type: "startEncounter", center: SPOTS[grid].fighter, radius: 9 }, DM));
  for (let i = 0; i < 20 && current(s) !== gob; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), gob);
  if (how === "hiding") s.entities[gob].hiding = { dc: 30 };
  if (how === "hidden") s.entities[gob].hidden = true;
  return { s, gob };
}
const go = (grid, gob) => ({ type: "move", actor: gob, to: AWAY[grid] });
const oaOf = (r, gob) => r.events.filter((e) => e.type === "reaction" && e.reaction === "opportunity-attack" && e.against === gob);
// A player's view with the fighter's own standing instructions taken out (the one thing the twins differ in by design).
const strip = (v) => { if (v.entities?.fighter) delete v.entities.fighter.reactions; if (v.reactions) delete v.reactions.fighter; return v; };
// What each player is told, event by event, up to (not including) the first that names the goblin: the reveal.
function before(r, s, u, gob) {
  const evs = viewEvents(r.events, s, u), at = evs.findIndex((e) => json(e).includes(`"${gob}"`));
  return json(at < 0 ? evs : evs.slice(0, at));
}

for (const grid of GRIDS) {
  for (const [sense, senses] of [["Blindsight", { blindsight: 60 }], ["Truesight", { truesight: 60 }]]) {
    test(`${grid}: a fighter with ${sense} finds a hiding goblin leaving its reach, then makes its Opportunity Attack`, () => {
      const { s, gob } = field(grid, { senses });
      assert.equal(seesFor(s, s.entities.fighter, s.entities[gob]), false, "the party does not know of it yet");
      assert.equal(sensesFor(s, s.entities.fighter, s.entities[gob]), true, "but the fighter's senses find it");
      const r = ok(apply(s, go(grid, gob), DM));
      const found = r.events.findIndex((e) => e.type === "unhidden" && e.id === gob && e.why === "found" && e.by === "fighter");
      const re = r.events.findIndex((e) => e.type === "reaction" && e.reaction === "opportunity-attack" && e.id === "fighter");
      assert.ok(found >= 0 && re > found, `found first, then the Opportunity Attack: ${json(r.events.map((e) => e.type))}`);
      assert.ok(r.events.some((e) => e.type === "attack" && e.actor === "fighter" && e.opportunity));
      assert.equal(s.entities[gob].hiding, undefined);
      // Every player is told it was found before the reaction; the reaction is never about a creature it was not told of.
      for (const u of PLAYERS) {
        const evs = viewEvents(r.events, s, u);
        const a = evs.findIndex((e) => e.type === "unhidden" && e.id === gob), b = evs.findIndex((e) => e.type === "reaction");
        assert.ok(a >= 0 && b > a, `${u.userId}: ${json(evs.map((e) => e.type))}`);
      }
    });

    test(`${grid}: twin runs with ${sense}: Opportunity Attack always and never send every player the same until the reveal`, () => {
      const A = field(grid, { senses }), B = field(grid, { senses, oa: "never" });
      assert.deepEqual(PLAYERS.map((u) => json(strip(view(A.s, u)))), PLAYERS.map((u) => json(strip(view(B.s, u)))), "the tables look the same");
      const ra = ok(apply(A.s, go(grid, A.gob), DM)), rb = ok(apply(B.s, go(grid, B.gob), DM));
      assert.equal(oaOf(ra, A.gob).length, 1);
      assert.equal(oaOf(rb, B.gob).length, 0);
      for (const u of PLAYERS) assert.equal(before(ra, A.s, u, A.gob), before(rb, B.s, u, B.gob), u.userId);
    });
  }

  test(`${grid}: with Opportunity Attack ask, the fighter's player is asked (no \`by\`, no word to the others), then the answer finds it first`, () => {
    const { s, gob } = field(grid, { senses: { blindsight: 60 }, oa: "ask" });
    const r = ok(apply(s, go(grid, gob), DM));
    assert.ok(s.pending && r.events.some((e) => e.type === "reactionAsked"), json(r.events.map((e) => e.type)));
    assert.equal(s.entities[gob].hiding?.dc, 30, "the game waits as it was: still hiding");
    const q = viewPrompt(s, U1);
    assert.equal(q.trigger, "leave");
    assert.equal(q.by, undefined, "the question does not name what the party is not told of");
    for (const u of PLAYERS.slice(1)) assert.equal(viewPrompt(s, u), null, `${u.userId} is not told the table waits`);
    for (const u of PLAYERS) assert.ok(!json(viewEvents(r.events, s, u)).includes(`"${gob}"`), u.userId);
    const r2 = ok(apply(s, { type: "react", prompt: q.n, take: "opportunity-attack" }, U1));
    const found = r2.events.findIndex((e) => e.type === "unhidden" && e.id === gob && e.by === "fighter");
    const re = r2.events.findIndex((e) => e.type === "reaction" && e.reaction === "opportunity-attack");
    assert.ok(found >= 0 && re > found, json(r2.events.map((e) => e.type)));
  });

  for (const [what, opts] of [["DM-hidden, Blindsight", { senses: { blindsight: 60 }, how: "hidden" }], ["hiding, no special sense", { how: "hiding" }]]) {
    test(`${grid}: a goblin ${what}: no Opportunity Attack, and every player is sent what a fighter set to never is sent`, () => {
      const A = field(grid, opts), B = field(grid, { ...opts, oa: "never" });
      assert.equal(sensesFor(A.s, A.s.entities.fighter, A.s.entities[A.gob]), false);
      const ra = ok(apply(A.s, go(grid, A.gob), DM)), rb = ok(apply(B.s, go(grid, B.gob), DM));
      assert.equal(oaOf(ra, A.gob).length, 0, json(ra.events.map((e) => e.type)));
      assert.ok(!A.s.pending);
      for (const u of PLAYERS) {
        assert.equal(json(viewEvents(ra.events, A.s, u)), json(viewEvents(rb.events, B.s, u)), u.userId);
        assert.equal(json(strip(view(A.s, u))), json(strip(view(B.s, u))), u.userId);
      }
    });
  }

  test(`${grid}: Counterspell: a party wizard with Blindsight finds a hiding caster casting with no Verbal component, then counters`, () => {
    // Called the way counterWindow calls it, on a caster whose casting gives no Verbal component away.
    const s = K.table(grid, { ward: { counterspell: "always" } });
    s.entities.wizard.senses = { ...s.entities.wizard.senses, blindsight: 60 };
    s.entities.mage.pos = { ...s.entities.wizard.pos, q: s.entities.wizard.pos.q + 2, z: 0 };
    s.entities.mage.hiding = { dc: 30 };
    const w = s.entities.wizard, m = s.entities.mage, ev = [];
    assert.equal(seesFor(s, w, m), false);
    assert.equal(sensesFor(s, w, m), true);
    findFor(s, w, m, ev);
    assert.deepEqual(ev, [{ type: "unhidden", id: "mage", why: "found", by: "wizard" }]);
    assert.equal(seesFor(s, w, m), true, "now the party knows of it");
    // Without the sense: nothing found, nothing changed.
    const t = K.table(grid, { ward: { counterspell: "always" } });
    t.entities.mage.pos = { ...t.entities.wizard.pos, q: t.entities.wizard.pos.q + 2, z: 0 };
    t.entities.mage.hiding = { dc: 30 };
    const ev2 = [];
    findFor(t, t.entities.wizard, t.entities.mage, ev2);
    assert.deepEqual(ev2, []);
    assert.equal(t.entities.mage.hiding.dc, 30);
    assert.equal(sensesFor(t, t.entities.wizard, t.entities.mage), false);
  });

  test(`${grid}: a foe's reactions are unchanged: a foe with Blindsight against a hiding party member`, () => {
    const { s, gob } = field(grid, { how: "none" });
    const g = s.entities[gob], f = s.entities.fighter;
    g.senses = { ...g.senses, blindsight: 60 };
    f.hiding = { dc: 30 };
    assert.equal(sensesFor(s, g, f), seesFor(s, g, f), "sensesFor adds nothing for a foe");
    const ev = [];
    findFor(s, g, f, ev);
    assert.deepEqual(ev, []);
    assert.ok(f.hiding);
  });
}

// #374, Part B2 (the re-review of #373, L2): the Shield question for a hit by an attacker the party does not know of
// names neither the attacker nor its weapon; the total and the Armor Class are kept. A seen attacker's weapon is named.
for (const grid of GRIDS) {
  test(`${grid}: B2, Shield ask: an unseen attacker's weapon is not named in the question`, () => {
    const U3 = PLAYERS[2];
    for (const hidden of [true, false]) {
      let asked = null;
      for (let seed = 1; seed <= 40 && !asked; seed++) {
        const s = K.table(grid, { seed, hidden, ward: { shield: "ask", counterspell: "never" } });
        ok(apply(s, { type: "cast", actor: "mage", spell: "fire-bolt", target: "wizard" }, DM));
        if (s.pending?.ask.trigger === "hit") asked = { s, q: viewPrompt(s, U3), dm: viewPrompt(s, DM) };
      }
      assert.ok(asked, `hidden ${hidden}: a hit that asks`);
      const { q, dm } = asked;
      assert.equal(typeof q.total, "number");
      assert.equal(typeof q.ac, "number");
      if (hidden) {
        assert.equal(q.by, undefined);
        assert.equal(q.attack, undefined, json(q));
        assert.equal(dm.attack, undefined, "not kept in the question at all");
      } else {
        assert.equal(q.by, "mage");
        assert.equal(q.attack, "Fire Bolt");
      }
    }
  });
}

// Fix round 1 of #378. M1: the finding is made only when the reaction is taken; `never` and `ask` declined send every
// player the same, the foe stays hiding, and the order of the fight is the same. When it is taken, nothing earlier in the
// action is sent that `never` would not send. L2: asking changes nothing. L3: the recorded question is the live one.
const answer = (s, take) => ok(apply(s, { type: "react", prompt: s.pending.n, take }, s.pending.ask.reactor === "wizard" ? PLAYERS[2] : U1));
const all = (r, s) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), strip(view(s, u))]));
// The reviewer's repro 1: Blindsight 10, so the goblin ends its move out of the sense's range.
function oaRun(grid, oa, take) {
  const { s, gob } = field(grid, { senses: { blindsight: 10 }, oa });
  let r = ok(apply(s, go(grid, gob), DM));
  if (s.pending) r = answer(s, take);
  return { s, r, gob };
}
// The reviewer's repro 2: the hiding mage's wand (no components: nothing to see being cast) hurts the wizard, who has
// Hellish Rebuke and Blindsight 60; an E23 cast, so the fight starts after it.
function rebukeRun(grid, how, take) {
  const s = K.table(grid, { seed: 5, ward: { shield: "never", counterspell: "never" } });
  s.entities.wizard.spells.push("hellish-rebuke");
  s.entities.wizard.senses = { ...s.entities.wizard.senses, blindsight: 60 };
  ok(apply(s, { type: "reactions", actor: "wizard", set: { "hellish-rebuke": how } }, PLAYERS[2]));
  s.entities.mage.hiding = { dc: 30 };
  let r = ok(apply(s, { type: "use", actor: "mage", item: "w", target: "wizard" }, DM));
  const asked = !!s.pending;
  if (s.pending) r = answer(s, take);
  return { s, r, asked };
}
const order = (s) => json(s.encounter?.order.map((o) => o.id) ?? null);
const stripW = (v) => { strip(v); const w = v.entities?.wizard; if (w) delete w.reactions; if (v.reactions) delete v.reactions.wizard; return v; };
const allW = (r, s) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), stripW(view(s, u))]));

for (const grid of GRIDS) {
  test(`${grid}: M1, Opportunity Attack asked and declined is never: the goblin stays hiding, every player is sent the same`, () => {
    const A = oaRun(grid, "never"), B = oaRun(grid, "ask", null);
    assert.ok(A.s.entities[A.gob].hiding && B.s.entities[B.gob].hiding, "still hiding in both");
    assert.deepEqual(all(B.r, B.s), all(A.r, A.s));
    for (const u of PLAYERS.slice(1)) assert.deepEqual(viewEvents(B.r.events, B.s, u), [], u.userId);
  });

  test(`${grid}: M1, Opportunity Attack taken: found with the reaction, and nothing before it that never does not send`, () => {
    for (const [oa, take] of [["always"], ["ask", "opportunity-attack"]]) {
      const N = oaRun(grid, "never"), T = oaRun(grid, oa, take);
      assert.equal(oaOf(T.r, T.gob).length, 1, oa);
      for (const u of PLAYERS) {
        const evs = viewEvents(T.r.events, T.s, u), at = evs.findIndex((e) => e.type === "unhidden" && e.id === T.gob);
        assert.ok(at >= 0 && evs[at + 1]?.type === "reaction", `${oa} ${u.userId}: ${json(evs.map((e) => e.type))}`);
        assert.deepEqual(evs.slice(0, at), viewEvents(N.r.events, N.s, u), `${oa} ${u.userId}: what came before is what never sends`);
      }
    }
    // Inside the sense's range at the end, `never` finds it too (the end of the action, as on main); the walk before
    // the finding is then told as never tells it, the goblin's own path.
    const N = field(grid, { senses: { blindsight: 60 }, oa: "never" }), T = field(grid, { senses: { blindsight: 60 } });
    const rn = ok(apply(N.s, go(grid, N.gob), DM)), rt = ok(apply(T.s, go(grid, T.gob), DM));
    assert.ok(!N.s.entities[N.gob].hiding && rn.events.some((e) => e.type === "unhidden" && e.why === "found"), "never: found at the end");
    for (const u of PLAYERS) {
      const evs = viewEvents(rt.events, T.s, u), at = evs.findIndex((e) => e.type === "unhidden");
      assert.ok(evs.slice(0, at).every((e) => e.type === "moved" && e.id === T.gob), `${u.userId}: ${json(evs.map((e) => e.type))}`);
      assert.ok(viewEvents(rn.events, N.s, u).some((e) => e.type === "moved" && e.id === N.gob), u.userId);
    }
  });

  test(`${grid}: M1, Hellish Rebuke asked and declined is never; taken, the wand's lines stay unsent`, () => {
    const A = rebukeRun(grid, "never"), B = rebukeRun(grid, "ask", null);
    assert.ok(B.asked);
    assert.deepEqual(allW(B.r, B.s), allW(A.r, A.s), "every player, events and view");
    assert.equal(order(B.s), order(A.s), "the same order of the fight");
    for (const [how, take] of [["always"], ["ask", "hellish-rebuke"]]) {
      const T = rebukeRun(grid, how, take);
      assert.ok(T.r.events.some((e) => e.type === "reaction" && e.reaction === "hellish-rebuke"), how);
      for (const u of PLAYERS) {
        const evs = viewEvents(T.r.events, T.s, u), at = evs.findIndex((e) => e.type === "reaction");
        const never = viewEvents(A.r.events, A.s, u);
        assert.ok(!evs.some((e) => e.type === "item" || (e.type === "cast" && e.actor === "mage")), `${how} ${u.userId}: ${json(evs.map((e) => e.type))}`);
        assert.deepEqual(evs.slice(0, at), never.slice(0, at), `${how} ${u.userId}: what came before is what never sends`);
      }
    }
  });

  test(`${grid}: L2, asking whether the senses find it changes nothing; L3, the recorded question is the live one`, () => {
    for (const rule of ["rooms", "los", "light"]) {
      const { s, gob } = field(grid, { senses: { blindsight: 60 } });
      s.settings.sight = rule;
      const before = json(s);
      sensesFor(s, s.entities.fighter, s.entities[gob]);
      assert.equal(json(s), before, rule);
    }
    const { s, gob } = field(grid, { senses: { blindsight: 60 }, oa: "ask" });
    const r = ok(apply(s, go(grid, gob), DM));
    const live = viewEvents(r.events, s, U1).find((e) => e.type === "reactionAsked");
    assert.ok(live && live.ask?.by === undefined, json(live));
    assert.equal(s.pending.ask.by, undefined, "the question itself does not name it");
    answer(s, "opportunity-attack");
    // In the record the question comes before the finding (view.js tells an introduction first in any list it is given,
    // so a long slice read at once puts the `unhidden` at its head: DEBT W36).
    const tl = s.timeline, q0 = tl.findIndex((e) => e.type === "reactionAsked"), f0 = tl.findIndex((e) => e.type === "unhidden" && e.id === gob);
    assert.ok(q0 >= 0 && f0 > q0, json(tl.map((e) => e.type)));
    const rec = viewEvents(tl.slice(q0, q0 + 1), s, U1), q = 0;
    assert.equal(rec[q].ask?.by, undefined, json(rec[q]));
  });
}
