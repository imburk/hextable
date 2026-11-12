// Handouts, notes to one player and level backgrounds (task M9 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, recall } from "../src/engine.js";
import { assetRefs, HANDOUT_LIMITS, shownTo } from "../src/handouts.js";
import { lintMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm-user" };
const PAT = { role: "player", userId: "pat" };
const SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); return r; };
const asset = (n) => `asset${String(n).padStart(4, "0")}xxxxxxxxxxxx`;     // the shape of a server id
const sent = (s, events, who) => JSON.stringify([view(s, who), viewEvents(events, s, who)]);

test("the DM makes, shows, hides and removes a handout; players get only what is shown to them", () => {
  const s = newGame(3);
  assert.deepEqual(s.handouts, []);
  const made = ok(apply(s, { type: "handout", handout: { title: "The rune wall", text: "Speak, friend", asset: asset(1) } }, DM));
  assert.deepEqual(s.handouts, [{ id: "h1", title: "The rune wall", text: "Speak, friend", asset: asset(1), shown: [] }]);
  assert.deepEqual(viewEvents(made.events, s, PAT), []);
  assert.deepEqual(view(s, PAT).handouts, []);

  const shown = ok(apply(s, { type: "showHandout", handout: "h1", to: ["pat"] }, DM));
  assert.deepEqual(view(s, PAT).handouts, [{ id: "h1", title: "The rune wall", text: "Speak, friend", asset: asset(1) }]);
  assert.deepEqual(view(s, SAM).handouts, []);
  assert.deepEqual(viewEvents(shown.events, s, PAT), [{ type: "handoutShown", handout: "h1", title: "The rune wall" }]);
  assert.deepEqual(viewEvents(shown.events, s, SAM), []);
  assert.ok(!JSON.stringify(view(s, PAT)).includes("shown"), "a player is not told who else has it");

  ok(apply(s, { type: "showHandout", handout: "h1", to: "all" }, DM));
  assert.equal(view(s, SAM).handouts.length, 1);
  no(apply(s, { type: "hideHandout", handout: "h1", from: ["sam"] }, DM), /everyone/);
  ok(apply(s, { type: "hideHandout", handout: "h1" }, DM));
  assert.deepEqual([view(s, PAT).handouts, view(s, SAM).handouts], [[], []]);
  ok(apply(s, { type: "showHandout", handout: "h1", to: ["pat", "sam"] }, DM));
  ok(apply(s, { type: "hideHandout", handout: "h1", from: ["sam"] }, DM));
  assert.deepEqual(s.handouts[0].shown, ["pat"]);

  ok(apply(s, { type: "handout", handout: { id: "h1", text: "" , asset: asset(1) } }, DM));
  assert.deepEqual(s.handouts[0], { id: "h1", title: "The rune wall", asset: asset(1), shown: ["pat"] }, "an edit keeps who has it");
  ok(apply(s, { type: "removeHandout", handout: "h1" }, DM));
  assert.deepEqual(s.handouts, []);
});

test("handout actions are the DM's, are checked, and a refused one changes nothing", () => {
  const s = newGame(3);
  ok(apply(s, { type: "handout", handout: { title: "Letter", text: "Meet me" } }, DM));
  const before = JSON.stringify(s);
  no(apply(s, { type: "handout", handout: { title: "Mine", text: "x" } }, PAT), /Only the DM/);
  no(apply(s, { type: "showHandout", handout: "h1", to: "all" }, PAT), /Only the DM/);
  no(apply(s, { type: "removeHandout", handout: "h1" }, PAT), /Only the DM/);
  no(apply(s, { type: "handout", handout: { title: "", text: "x" } }, DM), /title/);
  no(apply(s, { type: "handout", handout: { title: "x".repeat(HANDOUT_LIMITS.title + 1), text: "x" } }, DM), /at most/);
  no(apply(s, { type: "handout", handout: { title: "Long", text: "x".repeat(HANDOUT_LIMITS.text + 1) } }, DM), /at most/);
  no(apply(s, { type: "handout", handout: { title: "Nothing" } }, DM), /picture or some text/);
  no(apply(s, { type: "handout", handout: { title: "Path", asset: "../../etc/passwd" } }, DM), /file/);
  no(apply(s, { type: "handout", handout: { id: "h9", title: "Ghost", text: "x" } }, DM), /No such handout/);
  no(apply(s, { type: "showHandout", handout: "h1", to: [] }, DM));
  no(apply(s, { type: "showHandout", handout: "h1", to: ["bad id!"] }, DM));
  no(apply(s, { type: "showHandout", handout: "h1", to: "pat" }, DM));
  no(apply(s, { type: "showHandout", handout: "nope", to: "all" }, DM), /No such handout/);
  assert.equal(JSON.stringify(s), before);
  for (let i = 1; i < HANDOUT_LIMITS.handouts; i++) ok(apply(s, { type: "handout", handout: { title: `H${i}`, text: "x" } }, DM));
  no(apply(s, { type: "handout", handout: { title: "One too many", text: "x" } }, DM), /at most/);
});

test("a note goes from the DM to one player or from a player to the DM, and reaches no one else", () => {
  const s = newGame(3);
  const toPat = ok(apply(s, { type: "note", to: "pat", text: "Only you smell smoke." }, DM));
  assert.deepEqual(toPat.events, [{ type: "privateNote", from: "dm", to: "pat", text: "Only you smell smoke." }]);
  assert.deepEqual(viewEvents(toPat.events, s, PAT), toPat.events);
  assert.deepEqual(viewEvents(toPat.events, s, SAM), []);
  assert.deepEqual(viewEvents(toPat.events, s, { role: "player" }), [], "a viewer with no id gets nothing");
  const fromSam = ok(apply(s, { type: "note", to: "dm", text: "I pocket the ring." }, SAM));
  assert.deepEqual(fromSam.events, [{ type: "privateNote", from: "sam", to: "dm", text: "I pocket the ring." }]);
  assert.deepEqual(viewEvents(fromSam.events, s, PAT), []);
  assert.equal(viewEvents(fromSam.events, s, SAM).length, 1);
  // Kept on the timeline for the DM; a player reading the record sees only their own.
  assert.equal(recall(s, { types: ["privateNote"] }).length, 2);
  assert.deepEqual(viewEvents(recall(s, {}), s, PAT).filter((e) => e.type === "privateNote").map((e) => e.text), ["Only you smell smoke."]);
  // Refusals
  no(apply(s, { type: "note", to: "pat", text: "psst" }, SAM), /DM only/);
  no(apply(s, { type: "note", to: "dm", text: "" }, PAT), /Write something/);
  no(apply(s, { type: "note", to: "dm", text: "x".repeat(HANDOUT_LIMITS.note + 1) }, PAT), /at most/);
  no(apply(s, { type: "note", to: "dm", text: "hi" }, { role: "player" }), /Join/);
  no(apply(s, { type: "note", to: "dm", text: "to myself" }, DM), /Pick a player/);
  no(apply(s, { type: "note", text: "nobody" }, DM), /Pick a player/);
  // The note the engine already had (a rest's "note" event) is a different event and still public.
  assert.equal(recall(s, { types: ["note"] }).length, 0);
});

// A two-level map: the valley, and a cellar with a background picture in a room nobody has seen.
function withCellar() {
  const s = newGame(3);
  const tiles = Object.fromEntries([[30, 0], [31, 0], [30, 1]].map(([q, r]) => [`${q},${r}`, { t: "stone" }]));
  ok(apply(s, { type: "mapEdit", ops: [
    { op: "level", level: { id: "cellar", name: "Cellar", z: -20, tiles, image: { asset: asset(77), feet: [40, 30], origin: [250, -10] } } },
    { op: "region", region: { id: "crypt", name: "Crypt", level: "cellar", hexes: Object.keys(tiles) } },
  ] }, DM));
  return s;
}

test("a level's background picture is linted, edited with the level op, and sent only with a level the player is sent", () => {
  const s = withCellar();
  assert.deepEqual(s.map.levels[1].image, { asset: asset(77), feet: [40, 30], origin: [250, -10] });
  assert.ok(!sent(s, [], PAT).includes(asset(77)), "an unseen level's picture is not mentioned");
  assert.ok(!assetRefs(view(s, PAT)).has(asset(77)));
  assert.ok(assetRefs(view(s, DM)).has(asset(77)));
  ok(apply(s, { type: "revealRegion", region: "crypt", revealed: true }, DM));
  assert.deepEqual(view(s, PAT).map.levels.find((l) => l.id === "cellar").image, { asset: asset(77), feet: [40, 30], origin: [250, -10] });
  assert.ok(assetRefs(view(s, PAT)).has(asset(77)));
  // Edits: leave it, change it, take it away; a bad one is refused whole.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "cellar", name: "Old cellar" } }] }, DM));
  assert.equal(s.map.levels[1].image.asset, asset(77));
  for (const image of [{ asset: "../x", feet: [1, 1], origin: [0, 0] }, { asset: asset(1), feet: [0, 10], origin: [0, 0] }, { asset: asset(1), feet: [10, 10] },
    { asset: asset(1), feet: [10, 10], origin: [0, 0], src: "http://evil" }, "pic.png", [1, 2]]) {
    no(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "cellar", image } }] }, DM), /background/);
  }
  assert.equal(s.map.levels[1].image.asset, asset(77));
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "cellar", image: null } }] }, DM));
  assert.equal(s.map.levels[1].image, undefined);
  assert.ok(!assetRefs(view(s, PAT)).has(asset(77)));
  const doc = structuredClone(s.map); doc.levels[0].image = { asset: asset(2), feet: [100, 100], origin: [-50, -50] };
  assert.deepEqual(lintMap(doc), []);
});

test("a saved table from before handouts gets an empty list", () => {
  const s = newGame(3);
  delete s.handouts;
  const old = JSON.parse(JSON.stringify(s));
  migrate(old);
  assert.deepEqual(old.handouts, []);
  ok(apply(old, { type: "handout", handout: { title: "After", text: "works" } }, DM));
  migrate(old);
  assert.equal(old.handouts.length, 1, "migrating again keeps them");
});

// Property: over a long random sequence of handout, note and reveal actions, nothing private to one
// player, or to the DM, reaches another player: not in their view, not in their events, not in the record.
test("over many random actions, handouts and notes never reach a player they were not meant for", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % n; };
  const players = [PAT, SAM, { role: "player", userId: "kim" }];
  const s = withCellar();
  const secrets = new Map();          // handout id -> the words only those shown it may see
  const noteFor = new Map();          // note text -> the user ids it is between
  let n = 0;
  for (let step = 0; step < 400; step++) {
    const live = s.handouts.map((h) => h.id), pickH = () => live[rnd(live.length)];
    const someone = () => players[rnd(players.length)].userId;
    let action, who = DM;
    switch (rnd(8)) {
      case 0: case 1: {
        n++;
        const words = [`title-${n}-zq`, `text-${n}-zq`, asset(1000 + n)];
        action = { type: "handout", handout: { title: words[0], text: words[1], asset: words[2] } };
        break;
      }
      case 2: action = live.length && { type: "showHandout", handout: pickH(), to: rnd(4) === 0 ? "all" : [someone(), ...(rnd(2) ? [someone()] : [])] }; break;
      case 3: action = live.length && { type: "hideHandout", handout: pickH(), ...(rnd(2) ? { from: [someone()] } : {}) }; break;
      case 4: action = live.length && rnd(3) === 0 && { type: "removeHandout", handout: pickH() }; break;
      case 5: { const to = someone(), text = `note-${step}-to-${to}-zq`; noteFor.set(text, [to]); action = { type: "note", to, text }; break; }
      case 6: { who = players[rnd(players.length)]; const text = `note-${step}-from-${who.userId}-zq`; noteFor.set(text, [who.userId]); action = { type: "note", to: "dm", text }; break; }
      case 7: action = { type: "revealRegion", region: "crypt", revealed: !s.map.regions.find((r) => r.id === "crypt").revealed }; break;
    }
    if (!action) continue;
    const res = apply(s, action, who);
    if (res.ok && action.type === "handout") { const h = s.handouts.at(-1); secrets.set(h.id, [h.title, h.text, h.asset]); }
    if (!res.ok) continue;
    for (const p of players) {
      const v = view(s, p), text = sent(s, res.events, p);
      const mine = new Set(s.handouts.filter((h) => shownTo(h, p.userId)).map((h) => h.id));
      assert.deepEqual(v.handouts.map((h) => h.id), s.handouts.filter((h) => mine.has(h.id)).map((h) => h.id));
      assert.ok(v.handouts.every((h) => !("shown" in h)));
      for (const h of s.handouts) if (!mine.has(h.id)) for (const w of secrets.get(h.id)) assert.ok(!text.includes(w), `step ${step}: ${p.userId} was sent ${w}`);
      // A note's text reaches the player only if it is to or from them.
      const record = JSON.stringify(viewEvents(recall(s, { limit: Infinity }), s, p));
      for (const [t, between] of noteFor) {
        if (between.includes(p.userId)) continue;
        assert.ok(!text.includes(t) && !record.includes(t), `step ${step}: ${p.userId} was sent ${t}`);
      }
      // The files a player may fetch are exactly those of handouts shown to them and pictures of levels they are sent.
      const refs = assetRefs(v), cellar = s.map.regions.find((r) => r.id === "crypt").revealed;
      const expected = new Set([...s.handouts.filter((h) => mine.has(h.id)).map((h) => h.asset), ...(cellar && s.map.levels[1].image ? [s.map.levels[1].image.asset] : [])]);
      assert.deepEqual([...refs].sort(), [...expected].sort(), `step ${step}`);
    }
  }
  assert.ok(n > 20 && noteFor.size > 50, `the sequence exercised enough (${n} handouts, ${noteFor.size} notes)`);
});
