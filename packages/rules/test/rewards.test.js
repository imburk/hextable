// The rewards of a fight: XP and loot (docs/specs/table-ui.md, Decision 4, E4 to E9).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, up } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { levelForXp, xpFor } from "../src/rewards.js";
import { newGame } from "../src/scenario.js";
import { diff, snapshot } from "../src/patch.js";
import { playerView, view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (res) => { assert.ok(res.ok, res.error); return res; };
const no = (res, re) => { assert.equal(res.ok, false); assert.match(res.error, re); return res; };
const pcs = (s) => Object.values(s.entities).filter((e) => e.kind === "pc");
const foesIn = (s) => s.encounter.order.map((o) => s.entities[o.id]).filter((e) => e.side === "foe");

// Win a fight by the DM's hand: every foe in it takes as much damage as it has Hit Points.
function win(s, { hide } = {}) {
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  const foes = foesIn(s), events = [];
  if (hide) s.entities[hide].hiding = { dc: 30 };               // one foe hides by Stealth (set directly for the test)
  for (const f of foes) if (s.encounter) events.push(...ok(apply(s, { type: "harm", actor: f.id, amount: f.hp }, DM)).events);
  assert.equal(s.encounter, null, "the fight is won");
  return { foes, events };
}
const sum = (foes) => foes.reduce((n, f) => n + CONTENT.monsters[f.tpl].xp, 0);

test("the Character Advancement table is pack data, linted; a monster must carry its XP", () => {
  assert.deepEqual(CONTENT.advancement.levels.map((r) => r.xp), [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]);
  assert.deepEqual(CONTENT.advancement.levels.map((r) => r.prof), [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
  assert.deepEqual([xpFor(1), xpFor(4), xpFor(20), levelForXp(0), levelForXp(899), levelForXp(900), levelForXp(400000)], [0, 2700, 355000, 1, 2, 3, 20]);
  assert.deepEqual(lintPack(PACKS[0]), []);
  const bad = structuredClone(CONTENT.advancement); bad.levels[3].xp = 100;
  assert.ok(lintPack({ ...PACKS[0], advancement: bad }).some((p) => p.startsWith("advancement:")));
  const { xp, ...noXp } = CONTENT.monsters.wolf; void xp;
  assert.ok(lintPack({ pack: PACKS[0].pack, monsters: [noXp] }).some((p) => /xp must be/.test(p)));
});

test("a party character carries XP: its level's threshold at the start, kept across a new sheet", () => {
  const s = newGame(5);
  for (const e of pcs(s)) assert.equal(e.xp, xpFor(e.level));
  assert.deepEqual([s.conclusion, s.settings.conclusion, s.settings.xpShare], [null, "dm", "split"]);
  assert.equal(s.entities.m1.xp, undefined, "a monster's XP is the pack's, not carried");
});

test("a won fight makes a conclusion from the pack's XP, for the DM only, and players see that one waits", () => {
  const s = newGame(5);
  const { foes, events } = win(s);
  const c = s.conclusion;
  assert.ok(c && !c.published);
  assert.deepEqual(events.filter((e) => e.type === "conclusionReady"), [{ type: "conclusionReady", fight: c.fight }]);
  assert.equal(c.result, "victory");
  assert.equal(c.where, "The valley");
  assert.deepEqual(c.foes.map((f) => f.id).sort(), foes.map((f) => f.id).sort());
  assert.ok(c.foes.every((f) => f.counts), "the defeated count");
  assert.equal(c.xp.base, sum(foes));
  const alive = pcs(s).filter((e) => !e.dead);
  for (const e of alive) assert.equal(c.xp.per[e.id], Math.floor(sum(foes) / alive.length));
  // Players: a marker, nothing more; the event that made it is not theirs.
  assert.deepEqual(playerView(s).conclusion, { id: c.id, fight: c.fight, pending: true });
  assert.deepEqual(viewEvents(events, s, PAT).filter((e) => /conclusion/.test(e.type)), []);
  assert.deepEqual(view(s, DM).conclusion, c);
});

test("conclusion edits: foes counted, bonus lines with reasons, shares, loot; each is checked, a refused one changes nothing", () => {
  const s = newGame(5);
  const { foes } = win(s);
  const party = s.conclusion.party, [a, b] = party;
  const edit = (e, ctx = DM) => apply(s, { type: "conclusion", edit: e }, ctx);
  ok(edit({ foes: { [foes[0].id]: false } }));
  assert.equal(s.conclusion.xp.base, sum(foes) - CONTENT.monsters[foes[0].tpl].xp);
  const r = ok(edit({ bonus: [{ amount: 50, reason: "Freed the prisoner" }] }));
  assert.deepEqual(r.events, [{ type: "conclusionEdited", fight: s.conclusion.fight }]);
  assert.deepEqual(s.conclusion.xp.bonus.map((x) => [x.amount, x.reason]), [[50, "Freed the prisoner"]]);
  const each = Math.floor((s.conclusion.xp.base + 50) / party.length);
  assert.equal(s.conclusion.xp.per[a], each);
  ok(edit({ per: { [b]: 7 } }));
  ok(edit({ foes: { [foes[0].id]: true } }));
  assert.equal(s.conclusion.xp.per[b], 7, "a share set by hand stays as set");
  assert.equal(s.conclusion.xp.per[a], Math.floor((sum(foes) + 50) / party.length));
  ok(edit({ per: { [b]: null } }));
  assert.equal(s.conclusion.xp.per[b], s.conclusion.xp.per[a], "null gives it back to the engine");
  ok(edit({ loot: { add: [{ name: "Shortbow", to: a }, { name: "gp", qty: 35, from: "Goblin Warrior 1" }, { name: "Rope" }] } }));
  const [bow, gold, rope] = s.conclusion.loot;
  assert.deepEqual([bow.name, bow.qty, bow.to, gold.qty, gold.from, gold.to], ["Shortbow", 1, a, 35, "Goblin Warrior 1", null]);
  ok(edit({ loot: { remove: [rope.id], assign: { [gold.id]: b } } }));
  assert.deepEqual(s.conclusion.loot.map((l) => [l.name, l.to]), [["Shortbow", a], ["gp", b]]);

  const whole = JSON.stringify(s);
  for (const [bad, re] of [
    [{ foes: { nobody: true } }, /not in the fight/],
    [{ foes: { [foes[0].id]: "yes" } }, /true or false/],
    [{ bonus: [{ amount: 10 }] }, /reason/],
    [{ bonus: [{ amount: -5, reason: "x" }] }, /whole number/],
    [{ bonus: Array.from({ length: 21 }, () => ({ amount: 1, reason: "r" })) }, /at most 20/],
    [{ per: { m1: 5 } }, /not in the fight/],
    [{ per: { [a]: 1.5 } }, /whole number/],
    [{ loot: { add: [{ name: "x".repeat(61) }] } }, /at most 60/],
    [{ loot: { add: [{ name: "Rope", qty: 0 }] } }, /quantity/],
    [{ loot: { add: [{ name: "Rope", to: "m1" }] } }, /character who was in the fight/],
    [{ loot: { remove: ["l999"] } }, /No such loot/],
    [{ loot: { add: Array.from({ length: 39 }, () => ({ name: "Coin" })) } }, /At most 40/],
    [{ loot: { add: [{ name: "Rope" }], assign: { l999: a } } }, /No such loot/],
    [{ xp: 5 }, /no "xp"/],
  ]) { no(edit(bad), re); assert.equal(JSON.stringify(s), whole, JSON.stringify(bad)); }
  no(edit({ bonus: [] }, PAT), /Only the DM can settle the rewards/);
  no(apply(s, { type: "conclusion", publish: true, skip: true }, DM), /one of them/);
  assert.equal(JSON.stringify(s), whole);
});

test("publish: XP into each character's total, loot into gear, the record and a public chronicle; levelReady at a threshold", () => {
  const s = newGame(5);
  win(s);
  const [a, b] = s.conclusion.party;
  s.entities[a].xp = 290;                                       // 10 short of level 2
  ok(apply(s, { type: "conclusion", edit: { bonus: [{ amount: 100, reason: "Freed the prisoner" }], loot: { add: [{ name: "Shortbow", to: a }, { name: "Arrow", qty: 20, to: b }, { name: "gp", qty: 35 }] } } }, DM));
  const per = { ...s.conclusion.xp.per }, beforeB = s.entities[b].xp;
  const r = ok(apply(s, { type: "conclusion", publish: true }, DM));
  assert.equal(s.entities[a].xp, 290 + per[a]);
  assert.equal(s.entities[b].xp, beforeB + per[b]);
  assert.ok(r.events.some((e) => e.type === "xp" && e.id === a && e.amount === per[a] && e.total === 290 + per[a]));
  assert.deepEqual(r.events.filter((e) => e.type === "levelReady"), [{ type: "levelReady", id: a, level: levelForXp(290 + per[a]) }]);
  assert.equal(s.entities[a].level, 1, "levelling up stays the DM's action");
  assert.ok(s.entities[a].gear.includes("Shortbow"));
  assert.ok(s.entities[b].gear.includes("Arrow x20"));
  assert.deepEqual(r.events.filter((e) => e.type === "gear").map((e) => [e.id, e.item, e.why]), [[a, "Shortbow", "loot"], [b, "Arrow x20", "loot"]]);
  const rec = r.events.find((e) => e.type === "conclusion");
  assert.equal(rec.fight, s.conclusion.fight);
  const chron = r.events.find((e) => e.type === "chronicle");
  assert.deepEqual([chron.public, chron.tags, chron.title], [true, ["fight"], "A fight at The valley: won"]);
  assert.match(chron.text, /Found: Shortbow, Arrow x20, gp x35/);
  assert.ok(s.timeline.some((e) => e.type === "conclusion") && s.timeline.some((e) => e.type === "chronicle" && e.tags.includes("fight")));
  assert.equal(s.conclusion.published, true);
  no(apply(s, { type: "conclusion", publish: true }, DM), /no rewards waiting/);
  // What players see now: the published shape.
  const pv = playerView(s).conclusion;
  assert.equal(pv.published, true);
  assert.deepEqual(pv.xp, { bonus: [{ amount: 100, reason: "Freed the prisoner" }], per });
  assert.equal(pv.loot.length, 3);
  assert.equal(pv.xp.base, undefined);
  assert.ok(pv.foes.every((f) => f.xp === undefined && f.tpl === undefined));
  const seen = viewEvents(r.events, s, PAT);
  assert.deepEqual(seen.map((e) => e.type).sort(), ["chronicle", "conclusion", "gear", "gear", "levelReady", ...seen.filter((e) => e.type === "xp").map(() => "xp")].sort());
});

test("skip clears the conclusion; under the settings it is published at once, or none is made; defeat and stalemate make none", () => {
  let s = newGame(5);
  win(s);
  const r = ok(apply(s, { type: "conclusion", skip: true }, DM));
  assert.equal(s.conclusion, null);
  assert.deepEqual(viewEvents(r.events, s, PAT), [{ type: "conclusionSkipped", fight: r.events[0].fight }]);
  no(apply(s, { type: "conclusion", skip: true }, DM), /no rewards waiting/);

  s = newGame(5);
  ok(apply(s, { type: "setting", key: "conclusion", value: "auto" }, DM));
  ok(apply(s, { type: "setting", key: "xpShare", value: "full" }, DM));
  const xp0 = s.entities.fighter.xp, { foes } = win(s);
  assert.equal(s.conclusion.published, true);
  assert.equal(s.entities.fighter.xp, xp0 + sum(foes), "full: each gets the whole amount");

  s = newGame(5);
  ok(apply(s, { type: "setting", key: "conclusion", value: "off" }, DM));
  win(s);
  assert.equal(s.conclusion, null);
  no(apply(s, { type: "setting", key: "conclusion", value: "maybe" }, DM), /can be/);

  s = newGame(5);
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  for (const e of pcs(s)) { if (!s.encounter) break; e.hp = 0; e.cond.stable = {}; }
  ok(apply(s, { type: "harm", actor: "fighter", amount: 999 }, DM));
  assert.equal(s.encounter, null);
  assert.equal(s.timeline.findLast((e) => e.type === "encounterEnd").result, "defeat");
  assert.equal(s.conclusion, null, "defeat makes no conclusion");
});

test("a dead character's share starts at 0, and the living divide it", () => {
  const s = newGame(5);
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  ok(apply(s, { type: "setHp", actor: "rogue", hp: 0 }, DM));
  ok(apply(s, { type: "harm", actor: "rogue", amount: 999 }, DM));
  assert.ok(s.entities.rogue.dead);
  const foes = foesIn(s);
  for (const f of foes) if (s.encounter) ok(apply(s, { type: "harm", actor: f.id, amount: f.hp }, DM));
  const alive = s.conclusion.party.filter((id) => !s.entities[id].dead);
  assert.equal(s.conclusion.xp.per.rogue, 0);
  for (const id of alive) assert.equal(s.conclusion.xp.per[id], Math.floor(sum(foes) / alive.length));
});

test("every conclusion action is undoable exactly", () => {
  const s = newGame(5), h = createHistory();
  win(s);
  for (const action of [
    { type: "conclusion", edit: { bonus: [{ amount: 10, reason: "Clever" }], loot: { add: [{ name: "Rope", to: "fighter" }] } } },
    { type: "conclusion", publish: true },
  ]) {
    const before = mark(s), was = JSON.stringify(s);
    const res = ok(apply(s, action, DM));
    h.record(before, s, describeStep(action, res.events, before, s));
    const after = JSON.stringify(s);
    h.undo(s);
    assert.equal(JSON.stringify(s), was);
    h.redo(s);
    assert.equal(JSON.stringify(s), after);
  }
  assert.deepEqual(h.list(), ["The rewards were given out", "The rewards were changed"]);
});

test("leaks: before publishing players learn no XP figure, no loot and no count of hidden foes; after it, no hidden foe", () => {
  const s = newGame(5);
  const hidden = "m4";
  const before = snapshot(playerView(s));
  const { events } = win(s, { hide: hidden });
  assert.ok(s.conclusion.foes.some((f) => f.id === hidden && f.counts));
  const name = s.entities[hidden].name;
  const edits = ok(apply(s, { type: "conclusion", edit: { bonus: [{ amount: 75, reason: "Secret bonus" }], loot: { add: [{ name: "Cursed amulet", to: "fighter" }] } } }, DM)).events;
  // The view, the patch from before the fight, and the events.
  const pv = playerView(s), patch = diff(before, snapshot(pv), pv);
  const told = JSON.stringify({ c: pv.conclusion, patch: patch.top?.conclusion ?? null, ev: viewEvents([...events, ...edits], s, PAT) });
  for (const secret of ["Secret bonus", "Cursed amulet", "\"xp\"", "\"per\"", "\"base\"", "\"foes\"", "\"loot\""]) assert.ok(!told.includes(secret), `leaked before publishing: ${secret}`);
  assert.deepEqual(pv.conclusion, { id: s.conclusion.id, fight: s.conclusion.fight, pending: true });
  // Publish: the hidden wolf is neither listed nor named, live or in the record.
  const pub = ok(apply(s, { type: "conclusion", publish: true }, DM)).events;
  const after = JSON.stringify({ c: playerView(s).conclusion, ev: viewEvents(pub, s, PAT), tl: viewEvents(s.timeline, s, PAT) });
  assert.ok(!after.includes(`"${hidden}"`), "no id of the hidden foe");
  assert.ok(!after.includes(name), "no name of the hidden foe");
  assert.equal(playerView(s).conclusion.foes.length, s.conclusion.foes.length - 1);
  assert.ok(after.includes("Secret bonus"), "the bonus the DM published is theirs now");
});

test("gear events reach players for their own creatures, with why; another creature's never", () => {
  const s = newGame(5);
  ok(apply(s, { type: "claim", entity: "rogue", user: "pat", userName: "Pat" }, PAT));
  const mine = ok(apply(s, { type: "give", actor: "rogue", item: "Rope" }, DM)).events;
  assert.deepEqual(viewEvents(mine, s, PAT), [{ type: "gear", id: "rogue", item: "Rope", why: "dm" }]);
  ok(apply(s, { type: "reveal", actor: "m1", hidden: true }, DM));
  const theirs = ok(apply(s, { type: "give", actor: "m1", item: "Key" }, DM)).events;
  assert.deepEqual(viewEvents(theirs, s, PAT), []);
});

test("migration 18 to 19: XP from each character's level, no conclusion, the two settings; a damaged conclusion is dropped", () => {
  const s = newGame(5);
  s.version = 18;
  for (const e of pcs(s)) delete e.xp;
  s.entities.fighter.level = 5;
  delete s.conclusion; delete s.settings.conclusion; delete s.settings.xpShare;
  migrate(s);
  assert.equal(s.version, VERSION);
  assert.ok(VERSION >= 19);                   // 20 since magic items (#189)
  assert.equal(s.entities.fighter.xp, 6500);
  assert.equal(s.entities.rogue.xp, xpFor(s.entities.rogue.level));
  assert.equal(s.entities.m1.xp, undefined);
  assert.deepEqual([s.conclusion, s.settings.conclusion, s.settings.xpShare], [null, "dm", "split"]);
  const again = JSON.stringify(s);
  migrate(s);
  assert.equal(JSON.stringify(s), again, "safe to run twice");
  const t = newGame(5);
  win(t);
  const good = structuredClone(t.conclusion);
  migrate(t);
  assert.deepEqual(t.conclusion, good, "a whole conclusion is kept");
  t.conclusion.loot = "lots";
  migrate(t);
  assert.equal(t.conclusion, null);
  assert.ok(pcs(t).every((e) => up(e) || e.dead || e.hp === 0));
});
