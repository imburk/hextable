// A player offers a character and the DM admits or declines it (docs/specs/portable-characters.md, A4, A5, P4; issue #757 part 1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_TYPES, apply } from "../src/engine.js";
import { pregens } from "../src/content/srd52/pregens.js";
import { createHistory, describeStep, mark, undoable } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { STATE_FIELDS } from "../src/view-fields.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, SAM = { role: "player", userId: "sam" };
const sheet = (name = "Kerrin", level = 1) => ({ ...structuredClone(pregens[0].sheet), name, level, ...(level >= 3 ? { subclass: "champion" } : {}) });
const fresh = () => newGame(5);
const bytes = (s) => JSON.stringify(s);
const run = (s, ctx, a) => apply(s, a, ctx);
const ok = (s, ctx, a) => { const r = run(s, ctx, a); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
// A refused action changes nothing: the whole state is the same bytes after it.
const refused = (s, ctx, a, re) => { const before = bytes(s), r = run(s, ctx, a); assert.equal(r.ok, false, `${a.type} was accepted`); assert.match(r.error, re); assert.equal(bytes(s), before, "a refused action changed the game"); return r; };
const open = (s, range = { min: 1, max: 5 }) => ok(s, DM, { type: "setting", key: "level", value: range });
const mine = (s, user) => Object.values(s.entities).filter((e) => e.owner === user);

test("the settings: characters defaults to own-trusted, level is a range, and only the DM sets them", () => {
  const s = fresh();
  assert.equal(s.settings.characters, undefined, "absent means own-trusted");
  for (const v of ["own", "new", "own-trusted"]) ok(s, DM, { type: "setting", key: "characters", value: v });
  refused(s, DM, { type: "setting", key: "characters", value: "everyone" }, /can be/);
  refused(s, PAT, { type: "setting", key: "characters", value: "own" }, /Only the DM/);
  refused(s, PAT, { type: "setting", key: "level", value: 3 }, /Only the DM/);
  ok(s, DM, { type: "setting", key: "level", value: 3 });
  assert.deepEqual(s.settings.level, { min: 3, max: 3 });
  ok(s, DM, { type: "setting", key: "level", value: { min: 2, max: 6 } });
  assert.deepEqual(s.settings.level, { min: 2, max: 6 });
  for (const v of [0, 21, 2.5, "3", { min: 5, max: 2 }, { min: 1 }, { min: 1, max: 2, x: 1 }, null]) refused(s, DM, { type: "setting", key: "level", value: v }, /level range/);
  assert.deepEqual(s.settings.level, { min: 2, max: 6 });
});

test("offer: a player's sheet waits for the DM; offering again replaces it; the DM is told and nobody else", () => {
  const s = fresh();
  const r = ok(s, PAT, { type: "offer", sheet: sheet("Kerrin") });
  assert.deepEqual(s.offers.map((o) => [o.user, o.sheet.name]), [["pat", "Kerrin"]]);
  assert.equal(Object.values(s.entities).some((e) => e.name === "Kerrin"), false, "an offer is not a character");
  assert.deepEqual(r.events.map((e) => [e.type, e.user, e.name, e.level]), [["offered", "pat", "Kerrin", 1]]);
  assert.match(r.events[0].held, /level range/, "the DM is told it is held until a range is set");
  ok(s, SAM, { type: "offer", sheet: sheet("Ysolde") });
  const again = ok(s, PAT, { type: "offer", sheet: sheet("Kerrin II") });
  assert.equal(again.events[0].replaced, true);
  assert.deepEqual(s.offers.map((o) => [o.user, o.sheet.name]), [["sam", "Ysolde"], ["pat", "Kerrin II"]]);
  open(s);
  assert.equal(ok(s, SAM, { type: "offer", sheet: sheet("Ysolde") }).events[0].held, undefined);
  for (const ev of r.events) assert.deepEqual(viewEvents([ev], s, { userId: "sam" }), [], "a player is sent nothing of an offer");
  assert.deepEqual(viewEvents(r.events, s, { role: "dm", userId: "dm" }), r.events);
});

test("offer: refused for the DM, a stranger, a table of new characters, a player with a character, a bad sheet; nothing changes", () => {
  const s = fresh();
  refused(s, DM, { type: "offer", sheet: sheet() }, /setSheet/);
  refused(s, { role: "player" }, { type: "offer", sheet: sheet() }, /Join the table/);
  refused(s, PAT, { type: "offer", sheet: { ...sheet(), level: 99 } }, /can't be offered/);
  refused(s, PAT, { type: "offer", sheet: { ...sheet(), loot: 1 } }, /can't be offered/);
  refused(s, PAT, { type: "offer" }, /can't be offered/);
  s.entities.fighter.owner = "pat";
  refused(s, PAT, { type: "offer", sheet: sheet() }, /already have a character/);
  s.entities.fighter.owner = null;
  ok(s, DM, { type: "setting", key: "characters", value: "new" });
  refused(s, PAT, { type: "offer", sheet: sheet() }, /does not take characters/);
  ok(s, DM, { type: "setting", key: "characters", value: "own" });
  for (let i = 0; i < 12; i++) ok(s, { role: "player", userId: `p${i}` }, { type: "offer", sheet: sheet(`N${i}`) });
  refused(s, PAT, { type: "offer", sheet: sheet() }, /can't take an offer right now/);
  assert.doesNotMatch(run(s, PAT, { type: "offer", sheet: sheet() }).error, /many|waiting|other/i, "the refusal says nothing of other players' offers");
  ok(s, { role: "player", userId: "p3" }, { type: "offer", sheet: sheet("Again") });
  assert.equal(s.offers.length, 12);
});

test("admit under own-trusted: held without a level range, needs the tick, then the player has the character", () => {
  const s = fresh();
  ok(s, PAT, { type: "offer", sheet: sheet("Kerrin") });
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /Set a level range/);
  open(s);
  refused(s, DM, { type: "admit", user: "pat" }, /Tick that you have looked/);
  refused(s, DM, { type: "admit", user: "pat", ack: "yes" }, /Tick that you have looked/);
  refused(s, PAT, { type: "admit", user: "pat", ack: true }, /Only the DM/);
  const r = ok(s, DM, { type: "admit", user: "pat", userName: "Pat", ack: true });
  const made = mine(s, "pat");
  assert.equal(made.length, 1);
  assert.equal(made[0].name, "Kerrin"); assert.equal(made[0].kind, "pc"); assert.equal(made[0].side, "party"); assert.equal(made[0].ownerName, "Pat");
  assert.deepEqual(made[0].sheet.name, "Kerrin", "it keeps its sheet, as setSheet does");
  assert.deepEqual(s.offers, [], "the offer is answered");
  assert.deepEqual(r.events.filter((e) => ["spawned", "claimed", "admitted"].includes(e.type)).map((e) => e.type), ["spawned", "claimed", "admitted"]);
  const seen = viewEvents(r.events, s, { userId: "sam" });
  assert.ok(seen.some((e) => e.type === "spawned") && !seen.some((e) => e.type === "admitted" || e.type === "offered"), "players are told of a new hero, not of how it came");
});

test("admit under own: no tick is asked for; under new it is refused", () => {
  const s = fresh();
  ok(s, DM, { type: "setting", key: "characters", value: "own" }); open(s);
  ok(s, PAT, { type: "offer", sheet: sheet() });
  ok(s, DM, { type: "admit", user: "pat" });
  assert.equal(mine(s, "pat").length, 1);
  ok(s, SAM, { type: "offer", sheet: sheet("Ysolde") });
  ok(s, DM, { type: "setting", key: "characters", value: "new" });
  refused(s, DM, { type: "admit", user: "sam" }, /new characters only/);
});

test("admit refuses, and changes nothing: nothing offered, a second character, a thirteenth, a level above the range, a sheet that does not validate", () => {
  const s = fresh(); open(s, { min: 2, max: 3 });
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /Nothing has been offered/);
  refused(s, DM, { type: "admit", ack: true }, /Admit it for a player/);
  refused(s, DM, { type: "admit", user: "__proto__", ack: true }, /Nothing has been offered/);
  refused(s, DM, { type: "admit", user: "u".repeat(65), ack: true }, /Admit it for a player/);
  ok(s, PAT, { type: "offer", sheet: sheet("Tall", 4) });
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /level 4, above .*2 to 3/);
  refused(s, DM, { type: "admit", user: "pat", ack: true, sheet: sheet("Other", 2) }, /not the character that was offered/);
  ok(s, PAT, { type: "offer", sheet: sheet("Fit", 3) });
  s.entities.fighter.owner = "pat";                      // it took a character some other way after offering
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /already has a character/);
  s.entities.fighter.owner = null;
  s.offers[0].sheet.level = 99;                          // a sheet that has gone bad in the saved game
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /can't be played/);
  s.offers[0].sheet.level = 3;
  let n = Object.values(s.entities).filter((e) => e.kind === "pc").length;
  for (; n < 12; n++) s.entities[`x${n}`] = { ...structuredClone(s.entities.fighter), id: `x${n}`, owner: null };
  refused(s, DM, { type: "admit", user: "pat", ack: true }, /twelve characters/);
  assert.equal(s.offers.length, 1);
});

test("admit with no stored offer takes the sheet in the action, as the server composes it; below the range it is let in and the DM told", () => {
  const s = fresh(); open(s, { min: 3, max: 5 });
  refused(s, DM, { type: "admit", user: "sam", ack: true }, /Nothing has been offered/);
  const r = ok(s, DM, { type: "admit", user: "sam", sheet: sheet("Ysolde", 1), ack: true });
  assert.equal(mine(s, "sam")[0].name, "Ysolde");
  assert.ok(r.events.some((e) => e.type === "manual" && /below/.test(e.text)));
  assert.equal(r.events.find((e) => e.type === "admitted").below, 3);
});

test("decline: the DM answers an offer; the note is cut to 80 letters; players cannot", () => {
  const s = fresh();
  ok(s, PAT, { type: "offer", sheet: sheet() });
  refused(s, PAT, { type: "decline", user: "pat" }, /Only the DM/);
  refused(s, DM, { type: "decline", user: "sam" }, /Nothing has been offered/);
  refused(s, DM, { type: "decline", user: "pat", note: 5 }, /note/);
  const r = ok(s, DM, { type: "decline", user: "pat", note: `  ${"x".repeat(200)}  ` });
  assert.deepEqual(s.offers, []);
  assert.equal(r.events[0].type, "declined"); assert.equal(r.events[0].note.length, 80);
  assert.deepEqual(viewEvents(r.events, s, { userId: "pat" }), []);
  ok(s, PAT, { type: "offer", sheet: sheet() });                 // and the player may offer again
});

test("a pending offer is never in what a player is sent; the DM's state has it", () => {
  const s = fresh();
  assert.equal(STATE_FIELDS.offers, "withheld");
  ok(s, PAT, { type: "offer", sheet: sheet("Secretly Kerrin") });
  const dmView = view(s, { role: "dm", userId: "dm" });
  assert.equal(dmView.offers.length, 1);
  for (const who of ["pat", "sam"]) {
    const v = view(s, { role: "player", userId: who });
    assert.equal(Object.hasOwn(v, "offers"), false);
    assert.ok(!bytes(v).includes("Secretly Kerrin"), "the offered name is in a player's view");
  }
  assert.equal(bytes(view(s, { role: "player", userId: "sam" })), bytes(view(Object.assign(fresh(), { settings: s.settings }), { role: "player", userId: "sam" })), "the same view as a table with no offer");
});

test("history: offers and refusals are not undone and tell players nothing; an admission can be undone and gives the offer back", () => {
  for (const t of ["offer", "decline", "admit"]) assert.ok(ACTION_TYPES.includes(t));
  assert.equal(undoable({ type: "offer" }), false); assert.equal(undoable({ type: "decline" }), false); assert.equal(undoable({ type: "admit" }), true);
  const s = fresh(), h = createHistory();
  const go = (ctx, a) => { const b = mark(s), r = ok(s, ctx, a); const d = describeStep(a, r.events, b, s); if (undoable(a)) h.record(b, s, d); return d; };
  go(DM, { type: "setting", key: "level", value: 5 });
  assert.deepEqual(go(PAT, { type: "offer", sheet: sheet("Kerrin") }), { label: "Kerrin was offered", shown: null });
  const was = bytes(s);
  const d = go(DM, { type: "admit", user: "pat", ack: true });
  assert.equal(d.label, "Kerrin was admitted to the table");
  h.undo(s);
  assert.equal(bytes(s), was, "undone to the offer, byte for byte");
  assert.deepEqual(go(DM, { type: "decline", user: "pat" }), { label: "An offered character was declined", shown: null });
});

test("an old save with no offers list loads, takes an offer and admits it", () => {
  const s = fresh(); delete s.offers;
  assert.equal(Object.hasOwn(s, "offers"), false);
  open(s);
  ok(s, PAT, { type: "offer", sheet: sheet() });
  ok(s, DM, { type: "admit", user: "pat", ack: true });
  assert.equal(mine(s, "pat").length, 1);
  const old = fresh(); old.offers = "junk";
  ok(old, PAT, { type: "offer", sheet: sheet() });
  assert.equal(old.offers.length, 1);
});
