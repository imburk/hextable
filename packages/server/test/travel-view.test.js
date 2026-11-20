// Travel W4 (docs/specs/travel.md, Decision 12; build row W4), through the table server: with the party split, every player is sent the place
// in play, a player whose characters are parked is marked `watching`, what each is sent as a patch comes to what a full sync gives them,
// in-character talk of a parked group stays at its place, and no word of a world a player was not given reaches one.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { assetRefs } from "../../rules/src/handouts.js";
import { createReceiver } from "../../rules/src/patch.js";
import { view } from "../../rules/src/view.js";
import { createAssets } from "../src/assets.js";
import { createTables, worldAssets } from "../src/tables.js";
import { riverPack } from "../../rules/test/fixtures/world-pack.js";

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function client(tables) {
  const got = [], raw = [], c = { got, raw };
  c.receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.session = tables.connect({
    send(m) {
      const text = JSON.stringify(m);
      raw.push(text);
      const msg = JSON.parse(text);
      if (msg.t !== "update") return void got.push(msg);
      const u = c.receiver.receive(msg);
      if (u) got.push({ t: "update", events: u.events, state: structuredClone(u.state) });
    },
  });
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t) });
}
function seatedWithWorld() {
  const dir = mkdtempSync(join(tmpdir(), "hextable-w4-"));
  dirs.push(dir);
  const assets = createAssets({ dir });
  const tables = createTables({ seed: () => 5, ...worldAssets(() => assets) });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const join_ = (name) => {
    const p = client(tables);
    p.say({ t: "join", code, name });
    dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
    return p;
  };
  const pat = join_("Pat"), sam = join_("Sam");
  dm.say({ t: "world", pack: riverPack() });
  assert.equal(dm.last("error")?.world, undefined, dm.last("error")?.error);
  const t = tables.get(code);
  for (const id of ["fighter", "rogue"]) t.state.entities[id].owner = pat.last("welcome").userId;
  for (const id of ["cleric", "wizard"]) t.state.entities[id].owner = sam.last("welcome").userId;
  const act = (c, action) => { const n = c.got.length; c.say({ t: "act", action }); return c.got.slice(n).find((m) => m.t === "error"); };
  assert.equal(act(dm, { type: "loadMap", node: "keep", entry: "gate" }), undefined);
  // The tavern in play with the fighter and the rogue; the cleric and the wizard stay at the keep, parked.
  assert.equal(act(dm, { type: "loadMap", node: "tavern", entry: "door", who: ["fighter", "rogue"] }), undefined);
  for (const c of [dm, pat, sam]) c.say({ t: "sync" });
  return { tables, t, dm, pat, sam, act, assets };
}
const IDS = ['"river-country"', '"p-keep"', '"p-port"', '"p-tavern"', '"keep-map"', '"tavern-map"', '"road-table"', '"road"', '"port"', '"continent"', "Wolves on the road", "forest-road"];

test("with the party split, each player is sent the place in play; a watcher is marked, and a patch comes to what a sync gives", () => {
  const { t, dm, pat, sam, act } = seatedWithWorld();
  const p = pat.last("update").state, s = sam.last("update").state;
  assert.equal(p.watching, undefined);
  assert.equal(s.watching.mode, "live");
  assert.equal(s.map.id, p.map.id, "the same map");
  assert.deepEqual(Object.keys(s.entities).sort(), Object.keys(p.entities).sort(), "the same creatures");
  assert.deepEqual(Object.keys(s.away).sort(), ["cleric", "wizard"]);
  assert.deepEqual(Object.keys(p.away).sort(), ["cleric", "wizard"]);
  assert.deepEqual(s.atlas.markers.map((m) => m.ids.length).sort(), [2, 2]);
  // Patches: the clock moves, a line is said, the DM cuts to the keep and back; then what each has comes to what a sync gives.
  assert.equal(act(dm, { type: "advanceTime", minutes: 7 }), undefined);
  assert.equal(act(pat, { type: "say", as: "fighter", text: "Ale for the road" }), undefined);
  assert.equal(act(dm, { type: "goTo", node: "keep" }), undefined);
  assert.equal(act(dm, { type: "goTo", node: "tavern" }), undefined);
  for (const c of [pat, sam]) {
    const had = structuredClone(c.receiver.state);
    c.say({ t: "sync" });
    const fresh = c.last("update").state;
    const differ = [...new Set([...Object.keys(had), ...Object.keys(fresh)])].filter((k) => JSON.stringify(had[k]) !== JSON.stringify(fresh[k]));
    assert.deepEqual(differ, [], "the patches kept their copy as a fresh view gives it (the keys that differ)");
  }
  assert.equal(sam.last("update").state.watching.mode, "live");
  assert.equal(t.state.place, "tavern");
});

test("in-character talk of the parked group stays at its place; the table's talk and the place in play's go to all", () => {
  const { dm, pat, sam, act } = seatedWithWorld();
  const heard = (c, text) => c.raw.some((x) => x.includes(text));
  assert.equal(act(sam, { type: "say", as: "cleric", text: "KEEPWORDS" }), undefined);
  assert.equal(act(pat, { type: "say", as: "fighter", text: "TAVERNWORDS" }), undefined);
  assert.equal(act(pat, { type: "say", as: null, text: "OOCWORDS" }), undefined);
  assert.ok(heard(sam, "KEEPWORDS") && heard(dm, "KEEPWORDS") && !heard(pat, "KEEPWORDS"));
  for (const c of [dm, pat, sam]) assert.ok(heard(c, "TAVERNWORDS") && heard(c, "OOCWORDS"));
  // Asked for again from the record, the same.
  pat.say({ t: "history", types: ["say"] });
  assert.ok(!JSON.stringify(pat.last("history")).includes("KEEPWORDS"));
  sam.say({ t: "history", types: ["say"] });
  assert.ok(JSON.stringify(sam.last("history")).includes("KEEPWORDS"));
});

test("no id of the world and none of a place nobody has been to reaches a player; they may fetch the pictures of the places they know", () => {
  const { t, dm, pat, sam, act } = seatedWithWorld();
  assert.equal(act(dm, { type: "advanceTime", minutes: 30 }), undefined);
  for (const c of [pat, sam]) for (const k of IDS) assert.ok(!c.raw.some((x) => x.includes(k)), `${k} reached a player`);
  const ctx = { role: "player", userId: pat.last("welcome").userId };
  const files = assetRefs(view(t.state, ctx));
  assert.ok(files.has(t.world.assets.a1.id), "the continent's picture, now that the party stands under it");
  assert.ok(files.has(t.world.assets.a2.id), "and the port city's, the place above the tavern");
  // A guessed place is refused the same, as an action over the wire.
  const err = act(pat, { type: "goTo", node: "pl9" });
  assert.match(err.error, /There is no such place/);
  assert.equal(act(pat, { type: "goTo", node: "keep" }).error, err.error);
});

test("a table that has not got a world sends its players what it always did", () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-w4-"));
  dirs.push(dir);
  const tables = createTables({ seed: () => 5, ...worldAssets(() => createAssets({ dir })) });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const p = client(tables);
  p.say({ t: "join", code: dm.last("welcome").code, name: "Pat" });
  dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  p.say({ t: "sync" });
  const state = p.last("update").state;
  for (const k of ["atlas", "away", "watching"]) assert.equal(state[k], undefined);
});
