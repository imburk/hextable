// Helpers for the tests of #372 (docs/specs/table-ui.md, E23: a DM's hostile cast at a party member lands, then the
// fight starts; and the re-review of #368, N1 to N4). A table on the hex valley or the square room with the starter party
// claimed (the fighter by u1, the cleric by u2, the wizard by u3) and the DM's casters: a wizard (`mage`) with Fire Bolt,
// Fireball, Hold Person, Magic Missile and a Wand of Magic Missiles, and a cleric (`priest`) with Sacred Flame.
// `kit(M)` takes the rules modules, so the same tables are built by main's code (the recorded fixtures) and by this
// branch's: M = { apply, current, makeEntity, derive, newGame, squareRoom }.
import assert from "node:assert/strict";

export const DM = { role: "dm", userId: "dm" };
export const U1 = { role: "player", userId: "u1" }, U2 = { role: "player", userId: "u2" }, U3 = { role: "player", userId: "u3" };
export const PLAYERS = [U1, U2, U3];
export const GRIDS = ["hex", "square"];
export const json = (x) => JSON.stringify(x);
export const ok = (r) => { assert.ok(r.ok, r.error); return r; };
// Places on each map: the party in a loose group, the casters a little way off (inside the arena a fight round them makes).
export const SPOTS = {
  hex: { fighter: { q: -8, r: 3 }, rogue: { q: -7, r: 3 }, cleric: { q: -4, r: 2 }, wizard: { q: -8, r: 5 }, mage: { q: -2, r: 3 }, priest: { q: -3, r: 5 }, far: { q: 6, r: -2 } },
  square: { fighter: { q: 1, r: 12 }, rogue: { q: 2, r: 12 }, cleric: { q: 6, r: 6 }, wizard: { q: 3, r: 12 }, mage: { q: 7, r: 12 }, priest: { q: 6, r: 10 }, far: { q: 13, r: 1 } },
};
const A = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
export const MAGE = { name: "Vex", class: "wizard", level: 5, subclass: "evoker", abilities: A, skills: ["arcana", "history"], weapons: ["dagger"],
  spells: ["fire-bolt", "burning-hands", "fireball", "hold-person", "magic-missile"], items: [{ id: "w", item: "wand-of-magic-missiles", equipped: true }] };
export const PRIEST = { name: "Orsk", class: "cleric", level: 5, subclass: "life", abilities: { ...A, int: 10, wis: 16 }, skills: ["medicine", "religion"], weapons: ["mace"], spells: ["sacred-flame"] };
// A party wizard who can answer a spell: Shield and Counterspell.
export const WARD = { name: "Ilsa", class: "wizard", level: 5, subclass: "evoker", abilities: A, skills: ["arcana", "history"], weapons: ["dagger"], spells: ["fire-bolt", "shield", "counterspell"] };

export function kit(M) {
  const { apply, current, makeEntity, derive, newGame, squareRoom } = M;
  const caster = (s, id, sheet, pos, side = "foe") => {
    s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "npc", side, pos: { ...pos, z: 0 } });
    s.entities[id].sheet = structuredClone(sheet);
    return id;
  };
  // `autoEngage` (default on, as a new game has it), `hidden`: the mage hidden by the DM, `ward`: the party wizard made
  // a Shield and Counterspell caster (`reactions` its standing instructions).
  // `strikeFirst` (#585; a new game has it off): the table rule under which a hostile cast lands first. These tables have
  // it as `autoEngage` is unless told, so they play as before #585; the replayed scripts (e23-scenarios.js) ask for it off.
  function table(grid, { seed = 5, autoEngage = true, hidden = false, ward = null, strikeFirst = autoEngage } = {}) {
    const s = newGame(seed);
    if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
    for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
    for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...SPOTS[grid][id], z: 0 };
    if (ward) {
      const w = s.entities.wizard;
      s.entities.wizard = makeEntity(derive(WARD).record, { id: "wizard", kind: "pc", side: "party", pos: w.pos });
      s.entities.wizard.sheet = structuredClone(WARD);
    }
    for (const e of Object.values(s.entities)) if (e.side === "party") e.hp = e.maxHp = 200;
    ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
    ok(apply(s, { type: "claim", entity: "cleric", user: "u2", userName: "Bo" }, U2));
    ok(apply(s, { type: "claim", entity: "wizard", user: "u3", userName: "Cy" }, U3));
    if (ward) ok(apply(s, { type: "reactions", actor: "wizard", set: ward }, U3));
    caster(s, "mage", MAGE, SPOTS[grid].mage);
    caster(s, "priest", PRIEST, SPOTS[grid].priest);
    if (hidden) ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
    if (!autoEngage) ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
    if (strikeFirst !== (s.settings.strikeFirst === true)) ok(apply(s, { type: "setting", key: "strikeFirst", value: strikeFirst }, DM));
    return s;
  }
  // The hostile casts the tests use, by name.
  const CASTS = {
    save: () => ({ type: "cast", actor: "priest", spell: "sacred-flame", target: "fighter" }),
    attack: () => ({ type: "cast", actor: "mage", spell: "fire-bolt", target: "fighter" }),
    area: (grid) => ({ type: "cast", actor: "mage", spell: "fireball", slot: 3, hex: SPOTS[grid].fighter }),
    conc: () => ({ type: "cast", actor: "mage", spell: "hold-person", slot: 2, target: "fighter" }),
    item: () => ({ type: "use", actor: "mage", item: "w", target: "fighter" }),
  };
  // Every turn to the end of a round or `n` actions: each creature ends its turn.
  const endTurns = (s, n) => { for (let i = 0; i < n && s.encounter; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };
  return { table, caster, CASTS, endTurns };
}
