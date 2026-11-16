// E23 (#372) and hidden information (docs/specs/hidden-information.md, sections 3 and 5): a hostile cast by a creature
// the DM has hidden, that lands and then starts the fight. Players learn what the existing rules give them for an unseen
// caster (section 3: an event whose actor is Hidden is dropped; the damage and saves of their own creatures are theirs)
// and for a fight starting (section 5: it reveals everyone in it, `revealed` first; the order names a Seen creature by
// its id alone), and nothing more: before the fight's start no event a player is sent, live or read back from the
// record, names the caster, its name or where it stands, nor whose lasting effect it is. Twin runs: two worlds that
// differ only in the hidden caster's name and sheet give every player the same events. On hexes and the square room.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents, view } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, PLAYERS, GRIDS, SPOTS, json, ok } from "./e23-kit.js";

const { apply } = E;
const K = kit({ apply, current: E.current, makeEntity: E.makeEntity, derive, newGame, squareRoom });
const NAMES = ["Vex", "Zed"];
function world(grid, name) {
  const s = K.table(grid, { hidden: true });
  s.entities.mage.name = name;
  if (name === "Zed") { s.entities.mage.skillBonus = { ...(s.entities.mage.skillBonus ?? {}), stealth: 9 }; s.entities.mage.maxHp += 7; s.entities.mage.hp += 7; }
  return s;
}
// What a player is sent of the cast: the events before the fight's start, without the fight's own reveal.
const castPart = (evs) => { const i = evs.findIndex((e) => e.type === "encounterStart"); return evs.slice(0, i).filter((e) => !(e.type === "revealed" && e.id === "mage")); };

for (const grid of GRIDS) {
  test(`${grid}: a hidden caster's cast that starts the fight tells players what an unseen caster's spell tells them, then the fight`, () => {
    for (const name of ["attack", "conc", "area", "item"]) {
      const runs = NAMES.map((n) => { const s = world(grid, n), tl = s.timeline.length, r = ok(apply(s, K.CASTS[name](grid), DM)); return { s, r, tl }; });
      for (const u of PLAYERS) {
        const live = runs.map(({ s, r }) => viewEvents(r.events, s, u));
        const told = runs.map(({ s, tl }) => viewEvents(s.timeline.slice(tl), s, u));
        assert.deepEqual(castPart(live[0]), castPart(live[1]), `${name}: the same for ${u.userId} in both worlds`);
        assert.deepEqual(castPart(told[0]).map(({ t, ...e }) => e), castPart(live[0]), `${name}: the record tells ${u.userId} the same`);
        for (const [i, evs] of [...live, ...told].entries()) {
          const text = json(castPart(evs)), n = NAMES[i % 2], at = SPOTS[grid].mage;
          assert.ok(!text.includes('"mage"') && !text.includes(n), `${name}: nothing names the caster before the fight: ${text}`);
          assert.ok(!text.includes(json({ q: at.q, r: at.r })), `${name}: nor where it stands`);
          for (const e of castPart(evs)) {
            assert.ok(!["cast", "attack", "concentration", "item"].includes(e.type) || e.actor === undefined && e.id === undefined, `${name}: no ${e.type} of the caster`);
            assert.equal(e.source, undefined, `${name}: no source`);
            assert.equal(e.by, undefined, `${name}: no by`);
          }
          // The fight's start reveals it, as every fight does, first in the batch; its order entry is its id alone.
          assert.deepEqual(evs[0], i < 2 ? { type: "revealed", id: "mage" } : { t: evs[0].t, type: "revealed", id: "mage" });
          assert.deepEqual(evs.find((e) => e.type === "encounterStart").order.find((o) => o.id === "mage"), { id: "mage" });
        }
      }
      // After the fight starts the caster is known: the view names it as it names any creature in a fight.
      for (const { s } of runs) assert.ok(view(s, PLAYERS[0]).entities.mage, "Seen once the fight starts");
    }
  });

  test(`${grid}: the same caster not hidden: its cast is told as any seen creature's (the difference the twin hides is real)`, () => {
    const s = K.table(grid), r = ok(apply(s, K.CASTS.attack(grid), DM));
    const evs = viewEvents(r.events, s, PLAYERS[0]);
    assert.ok(castPart(evs).some((e) => e.type === "cast" && e.actor === "mage"));
    assert.ok(castPart(evs).some((e) => e.type === "attack" && e.actor === "mage"));
  });
}
