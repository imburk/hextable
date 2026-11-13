// Scenes (task M11 of docs/specs/maps-and-objects.md): a mode of the table for conversation, with
// NPCs whose notes only the DM sees, a transcript everyone hears, checks asked for and rolled
// against a DC the DM keeps, and lines written to the chronicle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_TYPES, apply, recall } from "../src/engine.js";
import { assetRefs } from "../src/handouts.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { applyPatch, diff, snapshot } from "../src/patch.js";
import { newGame } from "../src/scenario.js";
import { SCENE_LIMITS } from "../src/scenes.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm-user" };
const PAT = { role: "player", userId: "pat" }, SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); return r; };
const asset = (n) => `asset${String(n).padStart(4, "0")}xxxxxxxxxxxx`;
const sent = (s, events, who) => JSON.stringify([view(s, who), viewEvents(events, s, who)]);

function table() {
  const s = newGame(3);
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "claim", entity: "rogue", user: "sam", userName: "Sam" }, SAM));
  return s;
}

test("the DM starts a scene, brings in an NPC with private notes, and players see the scene but never the notes", () => {
  const s = table();
  assert.equal(s.scene, null);
  assert.equal(view(s, PAT).scene, null);
  const start = ok(apply(s, { type: "scene", scene: { title: "The mayor's study", image: asset(1) } }, DM));
  assert.deepEqual(start.events, [{ type: "sceneStart", scene: "sc1", title: "The mayor's study" }]);
  assert.deepEqual(viewEvents(start.events, s, PAT), start.events);
  const add = ok(apply(s, { type: "sceneNpc", npc: { name: "Mayor Ostrin", portrait: asset(2), notes: "SECRET-zq: he paid the goblins" } }, DM));
  assert.deepEqual(s.scene.present, [{ id: "npc1", name: "Mayor Ostrin", portrait: asset(2), notes: "SECRET-zq: he paid the goblins" }]);
  assert.deepEqual(view(s, PAT).scene, { id: "sc1", title: "The mayor's study", image: asset(1), present: [{ id: "npc1", name: "Mayor Ostrin", portrait: asset(2) }], open: true });
  assert.deepEqual(viewEvents(add.events, s, PAT), [{ type: "sceneNpc", scene: "sc1", npc: "npc1", name: "Mayor Ostrin", change: "added" }]);
  assert.equal(sent(s, add.events, PAT).includes("SECRET-zq"), false);
  // Changing only the notes tells players nothing at all.
  const quiet = ok(apply(s, { type: "sceneNpc", npc: { id: "npc1", notes: "SECRET2-zq: and he lies" } }, DM));
  assert.deepEqual(viewEvents(quiet.events, s, PAT), []);
  assert.equal(describeStep({ type: "sceneNpc", npc: { id: "npc1", notes: "x" } }, quiet.events, s, s).shown, null);
  // A new face is told.
  const face = ok(apply(s, { type: "sceneNpc", npc: { id: "npc1", portrait: asset(3) } }, DM));
  assert.equal(viewEvents(face.events, s, PAT)[0].change, "edited");
  assert.equal(s.scene.present[0].notes, "SECRET2-zq: and he lies", "an edit keeps what it was not given");
  // The files players may fetch: the scene's picture and the portraits in it, and no more.
  assert.deepEqual([...assetRefs(view(s, PAT))].sort(), [asset(1), asset(3)]);
  const gone = ok(apply(s, { type: "sceneNpc", npc: { id: "npc1" }, remove: true }, DM));
  assert.deepEqual(viewEvents(gone.events, s, PAT), [{ type: "sceneNpc", scene: "sc1", npc: "npc1", name: "Mayor Ostrin", change: "removed" }]);
  assert.deepEqual([...assetRefs(view(s, PAT))], [asset(1)]);
  ok(apply(s, { type: "scene", scene: { image: null } }, DM));
  assert.equal(s.scene.title, "The mayor's study");
  assert.deepEqual([...assetRefs(view(s, PAT))], []);
  const end = ok(apply(s, { type: "endScene" }, DM));
  assert.deepEqual(viewEvents(end.events, s, PAT), [{ type: "sceneEnd", scene: "sc1", title: "The mayor's study" }]);
  assert.equal(s.scene, null);
  ok(apply(s, { type: "scene", scene: { title: "Later" } }, DM));
  assert.equal(s.scene.id, "sc2", "a new scene, a new id");
});

test("the transcript: everyone hears it; a player speaks as their own character or out of character, the DM as any NPC", () => {
  const s = table();
  ok(apply(s, { type: "scene", scene: { title: "Tavern" } }, DM));
  ok(apply(s, { type: "sceneNpc", npc: { name: "Barkeep" } }, DM));
  const pat = ok(apply(s, { type: "say", as: "fighter", text: "We want a room." }, PAT));
  assert.deepEqual(pat.events, [{ type: "say", from: "pat", as: "fighter", name: s.entities.fighter.name, text: "We want a room.", scene: "sc1", line: 1 }]);
  for (const who of [PAT, SAM, { role: "player" }]) assert.deepEqual(viewEvents(pat.events, s, who), pat.events);
  const npc = ok(apply(s, { type: "say", as: "npc1", text: "Two silver." }, DM));
  assert.equal(npc.events[0].name, "Barkeep");
  const ooc = ok(apply(s, { type: "say", as: null, text: "brb", userName: "Sam" }, SAM));
  assert.deepEqual(ooc.events[0], { type: "say", from: "sam", as: null, name: "Sam", text: "brb", scene: "sc1", line: 3 });
  assert.equal(ok(apply(s, { type: "say", text: "Roll for it." }, DM)).events[0].name, "DM");
  // Refusals: another player's character, an NPC, a monster, a made-up id; all the same answer, and nothing changes.
  const before = JSON.stringify(s);
  const answers = ["rogue", "npc1", "m1", "nobody"].map((as) => no(apply(s, { type: "say", as, text: "I am someone else" }, PAT)).error);
  assert.deepEqual(new Set(answers), new Set(["You can speak only as your own character."]));
  no(apply(s, { type: "say", as: "fighter", text: "" }, PAT), /Say something/);
  no(apply(s, { type: "say", as: "fighter", text: "x".repeat(SCENE_LIMITS.say + 1) }, PAT), /at most/);
  no(apply(s, { type: "say", text: "hi" }, { role: "player" }), /Join/);
  no(apply(s, { type: "say", as: "npc9", text: "Who?" }, DM), /Nobody/);
  assert.equal(JSON.stringify(s), before);
  // Kept on the timeline, in order, for the DM and for an AI that reads it.
  assert.deepEqual(recall(s, { types: ["say"] }).map((e) => e.line), [1, 2, 3, 4]);
  // A line said with no scene going on is still heard, with no scene and no line number.
  ok(apply(s, { type: "endScene" }, DM));
  const after = ok(apply(s, { type: "say", as: "fighter", text: "Onward." }, PAT));
  assert.equal("scene" in after.events[0] || "line" in after.events[0], false);
});

test("checks on request: the player asks, the DM rolls against a DC the players never see", () => {
  const s = table();
  ok(apply(s, { type: "scene", scene: { title: "Interview" } }, DM));
  const ask = ok(apply(s, { type: "askCheck", actor: "fighter", skill: "insight" }, PAT));
  assert.deepEqual(ask.events, [{ type: "checkAsked", actor: "fighter", skill: "insight", by: "pat" }]);
  assert.deepEqual(viewEvents(ask.events, s, PAT), ask.events, "the asker sees their request");
  assert.deepEqual(viewEvents(ask.events, s, SAM), [], "nobody else does");
  no(apply(s, { type: "askCheck", actor: "rogue", skill: "insight" }, PAT), /your own/);
  no(apply(s, { type: "askCheck", actor: "fighter", skill: "juggling" }, PAT), /Unknown skill/);
  no(apply(s, { type: "check", actor: "fighter", skill: "insight", dc: 15 }, PAT), /Only the DM sets a DC/);
  const roll = ok(apply(s, { type: "check", actor: "fighter", skill: "insight", dc: 37 }, DM));
  assert.equal(roll.events[0].dc, 37);
  for (const who of [PAT, SAM]) {
    const [told] = viewEvents(roll.events, s, who);
    assert.equal("dc" in told || "success" in told, false);
    assert.equal(sent(s, roll.events, who).includes('"dc"'), false);
  }
});

test("one tap to the chronicle: a stretch of the transcript, or a typed line, becomes a chronicle entry players do not see", () => {
  const s = table();
  ok(apply(s, { type: "scene", scene: { title: "Interview" } }, DM));
  ok(apply(s, { type: "sceneNpc", npc: { name: "Mayor", notes: "guilty" } }, DM));
  ok(apply(s, { type: "say", as: "fighter", text: "Who paid the goblins?" }, PAT));
  ok(apply(s, { type: "say", as: "npc1", text: "I did. Gold from the mill." }, DM));
  ok(apply(s, { type: "say", as: null, text: "lol", userName: "Pat" }, PAT));
  const res = ok(apply(s, { type: "sceneChronicle", title: "The mayor confessed", lines: [1, 2], text: "The party will go to the mill." }, DM));
  const entry = res.events[0];
  assert.equal(entry.type, "chronicle");
  assert.equal(entry.text, `${s.entities.fighter.name}: Who paid the goblins?\nMayor: I did. Gold from the mill.\n\nThe party will go to the mill.`);
  assert.deepEqual(entry.tags, ["scene"]);
  assert.equal(entry.scene, "sc1");
  assert.deepEqual(viewEvents(res.events, s, PAT), []);
  assert.equal(recall(s, { types: ["chronicle"] }).at(-1).title, "The mayor confessed");
  assert.equal(describeStep({ type: "sceneChronicle", title: "The mayor confessed" }, res.events, s, s).shown, null);
  // Out of character lines are marked so; a typed line alone; shared with players when asked.
  const ooc = ok(apply(s, { type: "sceneChronicle", title: "Aside", lines: [3, 3] }, DM));
  assert.equal(ooc.events[0].text, "(Pat, out of character): lol");
  const pub = ok(apply(s, { type: "sceneChronicle", title: "Known to all", text: "The mill is east.", public: true }, DM));
  assert.equal(viewEvents(pub.events, s, PAT).length, 1);
  // After the scene, its lines by its id.
  ok(apply(s, { type: "endScene" }, DM));
  ok(apply(s, { type: "sceneChronicle", title: "Later", scene: "sc1", lines: [2, 2] }, DM));
  // Refusals change nothing.
  const before = JSON.stringify(s);
  no(apply(s, { type: "sceneChronicle", title: "Mine", text: "x" }, PAT), /Only the DM/);
  no(apply(s, { type: "sceneChronicle", title: "", text: "x" }, DM), /title/);
  no(apply(s, { type: "sceneChronicle", title: "Nothing" }, DM), /Pick lines/);
  no(apply(s, { type: "sceneChronicle", title: "Bad", scene: "sc1", lines: [5, 2] }, DM), /Pick from/);
  no(apply(s, { type: "sceneChronicle", title: "Gone", scene: "sc1", lines: [50, 60] }, DM), /not in the record/);
  no(apply(s, { type: "sceneChronicle", title: "No scene", lines: [1, 2] }, DM), /no scene/);
  assert.equal(JSON.stringify(s), before);
});

test("scene actions are the DM's, are checked, and a refused one changes nothing", () => {
  const s = table();
  const before = JSON.stringify(s);
  no(apply(s, { type: "scene", scene: { title: "Mine" } }, PAT), /Only the DM/);
  no(apply(s, { type: "endScene" }, DM), /no scene/);
  no(apply(s, { type: "sceneNpc", npc: { name: "X" } }, DM), /no scene/);
  no(apply(s, { type: "scene", scene: { title: "" } }, DM), /title/);
  no(apply(s, { type: "scene" }, DM), /record/);
  no(apply(s, { type: "scene", scene: { title: "x".repeat(SCENE_LIMITS.title + 1) } }, DM), /at most/);
  no(apply(s, { type: "scene", scene: { title: "Path", image: "../../etc/passwd" } }, DM), /file/);
  assert.equal(JSON.stringify(s), before);
  ok(apply(s, { type: "scene", scene: { title: "Hall" } }, DM));
  const mid = JSON.stringify(s);
  no(apply(s, { type: "endScene" }, PAT), /Only the DM/);
  no(apply(s, { type: "sceneNpc", npc: { name: "Me" } }, PAT), /Only the DM/);
  no(apply(s, { type: "sceneNpc", npc: { name: "" } }, DM), /name/);
  no(apply(s, { type: "sceneNpc", npc: { name: "Face", portrait: "http://evil/x.png" } }, DM), /file/);
  no(apply(s, { type: "sceneNpc", npc: { name: "Ghost", notes: "x".repeat(SCENE_LIMITS.notes + 1) } }, DM), /at most/);
  no(apply(s, { type: "sceneNpc", npc: { id: "npc7", name: "Who" } }, DM), /Nobody/);
  no(apply(s, { type: "sceneNpc", npc: {}, remove: true }, DM), /Say who/);
  assert.equal(JSON.stringify(s), mid);
  for (let i = 0; i < SCENE_LIMITS.present; i++) ok(apply(s, { type: "sceneNpc", npc: { name: `N${i}` } }, DM));
  no(apply(s, { type: "sceneNpc", npc: { name: "One too many" } }, DM), /at most/);
});

test("a fight ends the scene, whether the DM starts it or the party walks up to an enemy; a scene cannot start during one", () => {
  const s = table();
  ok(apply(s, { type: "scene", scene: { title: "Parley" } }, DM));
  const fight = ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 6 }, DM));
  assert.equal(s.scene, null);
  const types = fight.events.map((e) => e.type);
  assert.ok(types.indexOf("sceneEnd") >= 0 && types.indexOf("sceneEnd") < types.indexOf("encounterStart"), `${types}`);
  assert.equal(fight.events.find((e) => e.type === "sceneEnd").why, "a fight began");
  no(apply(s, { type: "scene", scene: { title: "Mid-fight" } }, DM), /End the fight/);
  ok(apply(s, { type: "endEncounter" }, DM));
  // Nothing is locked in a scene: the party can walk, and walking up to the goblins starts a fight.
  ok(apply(s, { type: "scene", scene: { title: "On the road" } }, DM));
  const g = s.entities.m1;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: g.pos.q - 4, r: g.pos.r, z: 0 } }, DM));
  if (!s.encounter) ok(apply(s, { type: "move", actor: "fighter", to: { q: g.pos.q - 2, r: g.pos.r, z: 0 } }, PAT));
  assert.ok(s.encounter, "the fight began");
  assert.equal(s.scene, null);
});

test("undo labels for every scene action, never with what was said or an NPC's notes", () => {
  const s = table();
  const h = createHistory();
  const step = (action, who = DM) => { const before = mark(s); const res = ok(apply(s, action, who)); const label = describeStep(action, res.events, before, s); h.record(before, s, label); return label; };
  assert.equal(step({ type: "scene", scene: { title: "The study" } }).label, "A scene began: The study");
  assert.equal(step({ type: "scene", scene: { title: "The study, later" } }).label, "The scene was changed");
  assert.deepEqual(step({ type: "sceneNpc", npc: { name: "Ostrin", notes: "NOTE-zq" } }), { label: "Ostrin joined the scene", shown: "Ostrin joined the scene" });
  assert.equal(step({ type: "sceneNpc", npc: { id: "npc1", notes: "NOTE2-zq" } }).shown, null);
  assert.equal(step({ type: "say", as: "npc1", text: "WORDS-zq" }).label, "Ostrin spoke");
  assert.equal(step({ type: "say", as: null, text: "WORDS2-zq", userName: "Pat" }, PAT).label, "Something was said out of character");
  assert.equal(step({ type: "askCheck", actor: "fighter", skill: "insight" }, PAT).shown, null, "a request is between the asker and the DM");
  assert.equal(step({ type: "sceneChronicle", title: "Learned", lines: [1, 2] }).shown, null);
  assert.equal(step({ type: "sceneNpc", npc: { id: "npc1" }, remove: true }).label, "Ostrin left the scene");
  assert.equal(step({ type: "endScene" }).label, "The scene ended");
  assert.ok(h.list().every((l) => !/zq/.test(l)));
  for (const type of ["scene", "endScene", "sceneNpc", "say", "askCheck", "sceneChronicle"]) assert.ok(ACTION_TYPES.includes(type));
  // Undo takes the scene back step by step, to none at all.
  while (h.list().length) h.undo(s);
  assert.equal(s.scene, null);
  assert.equal(recall(s, { types: ["say"] }).length, 0);
});

test("a saved table from before scenes has none going on", () => {
  const s = newGame(3);
  delete s.scene; s.version = 12;
  const old = JSON.parse(JSON.stringify(s));
  migrate(old);
  assert.equal(old.scene, null);
  assert.equal(old.version, VERSION, "scenes came with version 13; reactions made it 14");
  ok(apply(old, { type: "scene", scene: { title: "After" } }, DM));
  migrate(old);
  assert.equal(old.scene.title, "After", "migrating again keeps it");
  assert.equal(view(old, PAT).scene.title, "After");
});

// Property: over a long random sequence of scene actions by the DM and players, an NPC's notes and
// any DC never reach a player: not in their view, their patches, their events, the record, or the
// labels of undo steps; refused actions change nothing; and the files a player may fetch are
// exactly the scene's picture and portraits (with the rest of what they are sent).
test("over many random scene actions, nothing private reaches a player", () => {
  let seed = 4242;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % n; };
  const players = [PAT, SAM, { role: "player", userId: "kim" }];
  const s = table();
  const h = createHistory({ limit: 1000 });
  const secrets = new Set();
  const clients = new Map();
  let n = 0, refused = 0, notesEdits = 0, dcs = 0, undos = 0;
  const checkAll = (step, events, shown) => {
    for (const p of players) {
      const v = view(s, p), evs = viewEvents(events, s, p), rec = viewEvents(recall(s, { limit: Infinity }), s, p);
      const wire = JSON.parse(JSON.stringify(v)), prev = clients.get(p.userId);
      let patch = null;
      if (prev) { patch = diff(prev.snap, snapshot(wire), wire); applyPatch(prev.state, JSON.parse(JSON.stringify(patch))); assert.deepEqual(prev.state, wire, `step ${step}: patches diverged`); }
      clients.set(p.userId, { state: prev ? prev.state : structuredClone(wire), snap: snapshot(wire) });
      const text = JSON.stringify([v, evs, rec, patch, shown]);
      for (const x of secrets) assert.ok(!text.includes(x), `step ${step}: ${p.userId} was sent ${x}`);
      assert.ok(!text.includes('"notes"'), `step ${step}: a notes field reached ${p.userId}`);
      // A check against the DM's DC: the roll, never the DC or whether it was met, live or from the record.
      for (const e of [...evs, ...rec]) if (e.type === "check") assert.ok(!("dc" in e) && !("success" in e), `step ${step}: a check's DC or outcome reached ${p.userId}`);
      // Asking for a check is between the asker and the DM.
      for (const e of evs) if (e.type === "checkAsked") assert.equal(e.by, p.userId);
      // A scene that is not open is no scene at all to a player.
      if (!s.scene?.open) assert.equal(v.scene, null, `step ${step}`);
      for (const e of [...evs, ...rec]) assert.ok(!("prep" in e), `step ${step}: an event of a scene not open reached ${p.userId}`);
      // Files: exactly the open scene's picture and portraits (no handouts or level pictures here).
      const sc = s.scene?.open ? s.scene : null;
      const expected = new Set([...(sc?.image ? [sc.image] : []), ...(sc?.present ?? []).map((x) => x.portrait).filter(Boolean)]);
      assert.deepEqual([...assetRefs(v)].sort(), [...expected].sort(), `step ${step}`);
    }
  };
  for (let step = 0; step < 500; step++) {
    const npcs = s.scene?.present.map((p) => p.id) ?? [];
    const anyNpc = () => npcs[rnd(npcs.length)];
    let action, who = DM;
    switch (rnd(12)) {
      case 0: action = { type: "scene", scene: { title: `Scene ${step}`, ...(rnd(2) ? { image: asset(step) } : {}), ...(rnd(3) === 0 ? { open: !s.scene?.open } : {}) } }; break;
      case 1: action = rnd(4) === 0 && { type: "endScene" }; break;
      case 2: { n++; const notes = `NOTE-${n}-zq`; secrets.add(notes); action = { type: "sceneNpc", npc: { name: `Npc${n}`, notes, ...(rnd(2) ? { portrait: asset(5000 + n) } : {}) } }; break; }
      case 3: { n++; const notes = `NOTE-${n}-zq`; secrets.add(notes); notesEdits++; action = npcs.length && { type: "sceneNpc", npc: { id: anyNpc(), notes } }; break; }
      case 4: action = npcs.length && rnd(3) === 0 && { type: "sceneNpc", npc: { id: anyNpc() }, remove: true }; break;
      case 5: action = { type: "say", as: npcs.length && rnd(2) ? anyNpc() : null, text: `dm line ${step}` }; break;
      case 6: who = players[rnd(3)]; action = { type: "say", as: ["fighter", "rogue", "wizard", "m1", "npc1", null][rnd(6)], text: `player line ${step}`, userName: who.userId }; break;
      case 7: who = players[rnd(3)]; action = { type: "askCheck", actor: ["fighter", "rogue"][rnd(2)], skill: ["insight", "persuasion", "juggling"][rnd(3)] }; break;
      case 8: dcs++; action = { type: "check", actor: ["fighter", "rogue"][rnd(2)], skill: "insight", dc: 1 + rnd(40) }; break;
      case 9: action = { type: "sceneChronicle", title: `Learned ${step}`, ...(s.scene?.said ? { lines: [1, s.scene.said] } : { text: "typed" }) }; break;
      case 10: if (h.list().length && rnd(2)) { const u = h.undo(s); undos++; checkAll(step, [], u.shown); } continue;
      case 11: action = rnd(5) === 0 && { type: "startEncounter", center: s.entities.fighter.pos, radius: 3 }; if (s.encounter) action = { type: "endEncounter" }; break;
    }
    if (!action) continue;
    const before = mark(s), text0 = JSON.stringify(s);
    const res = apply(s, action, who);
    // A player speaks only as their own character, or out of character: never as another's character, a monster or an NPC.
    if (action.type === "say" && who !== DM) {
      const mine = action.as === null || s.entities[action.as]?.owner === who.userId;
      assert.equal(res.ok, mine, `step ${step}: ${who.userId} speaking as ${action.as} was ${res.ok ? "allowed" : "refused"}`);
      if (res.ok) assert.equal(res.events[0].as, action.as);
    }
    if (!res.ok) { refused++; assert.equal(JSON.stringify(s), text0, `step ${step}: a refused ${action.type} changed the state`); continue; }
    const label = describeStep(action, res.events, before, s);
    h.record(before, s, label);
    checkAll(step, res.events, label.shown);
  }
  assert.ok(refused > 30 && notesEdits > 20 && dcs > 20 && undos > 10, `the sequence exercised enough (${refused} refused, ${notesEdits} notes edits, ${dcs} DCs, ${undos} undos)`);
});

test("a scene the DM prepares, or steps out of, is nothing to the players until it is opened", () => {
  const s = table();
  const h = createHistory({ limit: 100 });
  const all = [];
  const act = (a, who = DM, shown = false) => {
    const before = mark(s), r = ok(apply(s, a, who)), label = describeStep(a, r.events, before, s);
    h.record(before, s, label); all.push(...r.events);
    if (!shown) assert.equal(label.shown, null, `${a.type} while prepared shows no undo label`);
    return r;
  };
  const secrets = ["Ambush at Dawn", "Gorlak the Traitor", "Wears the stolen ring", "Removed Rival", asset(7), asset(8)];
  const hidden = () => {
    for (const p of [PAT, SAM]) {
      const v = view(s, p), text = JSON.stringify([v, viewEvents(all, s, p), viewEvents(recall(s, { limit: Infinity }), s, p)]);
      assert.equal(v.scene, null);
      assert.equal(assetRefs(v).size, 0, "no file of a prepared scene may be fetched");
      for (const x of secrets) assert.ok(!text.includes(x), `${x} reached ${p.userId}`);
    }
  };
  act({ type: "scene", scene: { title: "Thrown Away", open: false } });
  act({ type: "endScene" });
  act({ type: "scene", scene: { title: "Ambush at Dawn", image: asset(7), open: false } });
  act({ type: "sceneNpc", npc: { name: "Removed Rival" } });
  act({ type: "sceneNpc", npc: { name: "Gorlak the Traitor", notes: "Wears the stolen ring", portrait: asset(8) } });
  act({ type: "sceneNpc", npc: { id: "npc1" }, remove: true });
  secrets.push("Thrown Away");
  act({ type: "scene", scene: { title: "Ambush at Dawn" } });
  assert.ok(all.every((e) => e.prep === true), "every event of a prepared scene is marked");
  hidden();
  // Nobody speaks in a scene that is not open: not as an NPC in it, and a line has no number.
  no(apply(s, { type: "say", as: "npc2", text: "Hah" }, DM), /Nobody of that name/);
  assert.equal(ok(apply(s, { type: "say", as: "fighter", text: "hm" }, PAT)).events[0].line, undefined);
  // The same refusal for a player guessing the prepared NPC's id as for an id that is nothing.
  assert.equal(apply(s, { type: "say", as: "npc2", text: "x" }, PAT).error, apply(s, { type: "say", as: "npc99", text: "x" }, PAT).error);
  // A fight leaves a prepared scene alone; the table cannot go into it during one, but the DM can keep preparing.
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 3 }, DM));
  assert.equal(s.scene.title, "Ambush at Dawn");
  no(apply(s, { type: "scene", scene: { open: true } }, DM), /End the fight/);
  ok(apply(s, { type: "sceneNpc", npc: { id: "npc2", notes: "Wears the stolen ring" } }, DM));
  ok(apply(s, { type: "endEncounter" }, DM));
  hidden();
  // Open: now the players are sent the scene as it stands, and still never the notes or the one who left.
  const r = act({ type: "scene", scene: { open: true } }, DM, true);
  assert.deepEqual(viewEvents(r.events, s, PAT), [{ type: "sceneStart", scene: s.scene.id, title: "Ambush at Dawn" }]);
  // Ids are given on opening, so neither the scene thrown away nor the NPC taken out leaves a gap.
  assert.equal(s.scene.id, "sc1");
  const v = view(s, PAT);
  assert.deepEqual(v.scene.present, [{ id: "npc1", name: "Gorlak the Traitor", portrait: asset(8) }]);
  const rec = JSON.stringify(viewEvents(recall(s, { limit: Infinity }), s, PAT));
  assert.ok(!rec.includes("Removed Rival") && !rec.includes("stolen ring"), "the record of the preparation stays the DM's");
  // Stepping out to the map: players are told it was set aside, and nothing after.
  const out = ok(apply(s, { type: "scene", scene: { open: false } }, DM));
  assert.deepEqual(viewEvents(out.events, s, SAM), [{ type: "sceneEnd", scene: "sc1", title: "Ambush at Dawn", why: "set aside" }]);
  const later = ok(apply(s, { type: "sceneNpc", npc: { name: "Second Twist" } }, DM));
  assert.deepEqual(viewEvents(later.events, s, SAM), []);
  assert.equal(view(s, SAM).scene, null);
  const ended = ok(apply(s, { type: "endScene" }, DM));
  assert.deepEqual(viewEvents(ended.events, s, SAM), [], "ending a scene not open tells the players nothing");
});

test("line numbers stay right under undo and redo, and a long scene is capped", () => {
  const s = table();
  const h = createHistory({ limit: 100 });
  const act = (a, who = DM) => { const before = mark(s), r = ok(apply(s, a, who)); h.record(before, s, describeStep(a, r.events, before, s)); return r; };
  act({ type: "scene", scene: { title: "Tavern" } });
  act({ type: "sceneNpc", npc: { name: "Barkeep" } });
  const lines = [1, 2, 3].map((i) => act({ type: "say", as: "fighter", text: `l${i}` }, PAT).events[0].line);
  assert.deepEqual(lines, [1, 2, 3]);
  const at3 = JSON.stringify(s);
  h.undo(s);
  assert.equal(s.scene.said, 2);
  assert.equal(recall(s, { types: ["say"], limit: Infinity }).length, 2);
  h.redo(s);
  assert.equal(JSON.stringify(s), at3, "redo puts the line back exactly");
  h.undo(s); h.undo(s);
  assert.equal(act({ type: "say", as: "npc1", text: "Again" }).events[0].line, 2, "a line said after an undo takes the number freed");
  assert.equal(h.listRedo().length, 0);
  const said = recall(s, { types: ["say"], limit: Infinity });
  assert.deepEqual(said.map((e) => e.line), [1, 2]);
  // The cap on lines in one scene.
  s.scene.said = SCENE_LIMITS.said;
  no(apply(s, { type: "say", as: null, text: "one more" }, DM), /gone on long enough/);
});

test("a game with scenes replays exactly from its seed", () => {
  const actions = [
    [{ type: "scene", scene: { title: "Parley" } }, DM],
    [{ type: "sceneNpc", npc: { name: "Envoy", notes: "lying" } }, DM],
    [{ type: "say", as: "fighter", text: "We come in peace." }, PAT],
    [{ type: "askCheck", actor: "fighter", skill: "insight" }, PAT],
    [{ type: "check", actor: "fighter", skill: "insight", dc: 14 }, DM],
    [{ type: "say", as: "npc1", text: "Of course." }, DM],
    [{ type: "sceneChronicle", title: "The parley", lines: [1, 2] }, DM],
    [{ type: "scene", scene: { open: false } }, DM],
    [{ type: "startEncounter", center: null, radius: 3 }, DM],
  ];
  const play = () => {
    const s = table(), evs = [];
    actions[8][0].center = s.entities.fighter.pos;
    for (const [a, who] of actions) evs.push(ok(apply(s, structuredClone(a), who)).events);
    return JSON.stringify([s, evs]);
  };
  assert.equal(play(), play());
});
