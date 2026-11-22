// The DM's to-do tray (#675; docs/specs/dm-todo.md): what is only the DM's is sent to no player, in any message.
// Two worlds that differ in one thing players may not know of (a hidden monster whose abilities the DM runs, so it has a "You run" card; a
// note the engine kept for the DM about a player's own creature that is named for nothing the creature has), the same script, every player
// sent the same bytes. And the caster of a spell that waits on the DM is told its name and nothing else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { twin } from "./twin.js";
import { typed } from "../../rules/test/fixtures/typed.js";

const byName = (w, name) => Object.values(w.state.entities).find((e) => e.name === name);
const base = (w) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  w.must({ type: "setting", key: "autoEngage", value: false });
  typed(s, "wizard");                       // hand-typed, as when this was written: a built wizard's Mage Armor is the engine's own (#672), and this needs one the DM settles
  Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat" });
  s.entities.wizard.spells.push("mage-armor");
};
const SCRIPT = [
  { by: "Pat", act: { type: "move", actor: "wizard", to: { q: -7, r: 3 } }, allowError: true },
  { by: "dm", act: { type: "todoDone", all: true }, allowError: true },
  { by: "Pat", act: { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] } },
];

test("todo: a hidden monster with Spellcasting makes a card for the DM and the players are sent the same bytes", () => {
  const burn = (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 8, r: -6 }, name: "Burnt", hidden: true }); };
  const { hidden } = twin({ players: ["Pat", "Sam"], setup: base, steps: SCRIPT },
    { hide: (w) => { w.must({ type: "spawn", monster: "mage", at: { q: 8, r: -6 }, name: "Burnt", hidden: true }); assert.ok(w.state.todo.cards.some((c) => c.kind === "run")); }, plain: burn });
  assert.ok(hidden.raw.Pat.some((m) => (m.state?.waiting ?? m.patch?.waiting ?? []).some((x) => x.name === "Mage Armor")), "Pat was sent the waiting list");
  // (Not the word "Spellcasting" itself: the built starters carry it on their own sheets since #672. The twin already proves the bytes are the same.)
  for (const who of ["Pat", "Sam"]) { const all = JSON.stringify(hidden.raw[who]); assert.ok(!all.includes("Burnt") && !/"kind":"run"/.test(all), `${who} was told of the monster or its card`); }
});

test("todo: a DM-only note about a player's creature is sent to no player; only a spell of its own makes the caster's line", () => {
  const { hidden } = twin({ players: ["Pat", "Sam"], setup: base, steps: SCRIPT },
    { hide: (w) => { w.state.todo = { n: 1, cards: [{ n: 1, t: 0, kind: "manual", actor: "wizard", name: "Secret trap", text: "DM words nobody else may read", ids: ["wizard"], partial: true }] }; }, plain: () => {} });
  for (const who of ["Pat", "Sam"]) {
    const all = JSON.stringify(hidden.raw[who]);
    assert.ok(!all.includes("Secret trap") && !all.includes("DM words"), `${who} was sent the note`);
    assert.ok(!/"todo"/.test(all), `${who} was sent the tray`);
  }
});

test("todo: the caster is told only the name of the spell, and Sam, who does not play her, nothing", () => {
  const { plain } = twin({ players: ["Pat", "Sam"], setup: base, steps: SCRIPT }, { hide: () => {}, plain: () => {} });
  const waiting = (who) => plain.raw[who].map((m) => m.state?.waiting ?? m.patch?.waiting).filter(Boolean).flat();
  assert.deepEqual([...new Set(waiting("Pat").map((x) => x.name))], ["Mage Armor"]);
  assert.deepEqual(waiting("Sam"), []);
  assert.ok(!/"cards"/.test(JSON.stringify(plain.raw.Pat)), "no card was sent");
});

test("todo: setAc on a foe the party can see tells no player its number, by event, view or patch", () => {
  const goblin = (w) => Object.values(w.state.entities).find((e) => e.side === "foe");
  twin({ players: ["Pat", "Sam"],
    setup(w) { base(w); w.must({ type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 3 }, name: "Seen" }); },
    steps: [{ by: "Pat", act: { type: "move", actor: "wizard", to: { q: -7, r: 3 } }, allowError: true }] },
  { hide: (w) => w.must({ type: "setAc", actor: goblin(w).id, ac: 23 }), plain: (w) => w.must({ type: "setAc", actor: goblin(w).id, ac: 21 }) });
});
