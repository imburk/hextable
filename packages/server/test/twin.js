// The twin-world harness for hidden information (architecture review R4, umbrella #617).
//
//   twin(scenario, hidden)
//
// runs one scripted scenario in two worlds, each a real table on a real `createTables()` with in-memory connections, that
// differ only in one thing the players may not know of, and asserts that every player was sent exactly the same bytes in
// both: every message, in order (welcome, lobby, full views, patches, events, errors, history), so the sequence numbers and
// the message counts too. The DM is exempt: the DM's stream is recorded and may differ.
//
// The scenario (the same object for both worlds):
//   players   names of the players, default ["Pat", "Sam"]. They are seated, and approved by the DM, in this order.
//   seed      the table's seed, default 5.
//   grid      "square" for the square valley.
//   tables    () => the options for createTables (assets, world store...), called once for each world.
//   setup(w)  runs in both worlds once everyone is seated; use w.act("dm", {...}) or w.t.state to prepare the table.
//   steps     what happens next, in order. A step is
//               { by: "Pat", act: {...} }      an action sent as that player ("dm" for the DM)
//               { by: "Pat", send: {...} }     any message (sync, history, undo, redo ...)
//               { by: "dm", act, allowError }  a DM step that is allowed to be refused
//               { by, act: (w) => ({...}) }    the action made when its turn comes (for an id the setup made)
//               (w) => ...                     code run in both worlds (it may use w.act, w.say, w.t.state)
//   mask      (w) => [strings]: ids a world makes at random (picture ids...) that are told as <mask:n>, n by their order in the list
//   final     default true: when the steps are done every player asks for a full sync and for the record, so the
//             patches they were sent are also checked against what a fresh view says.
//
// `hidden` is the one thing that differs, one of:
//   (w) => ...                      run in the hidden world only, after setup and before the steps, or where setup calls w.putIn().
//   { hide(w), plain(w), at }       `hide` runs in the hidden world and `plain` in the plain one (for what the hidden
//                                   thing costs both worlds equally, like a counter); both after `at` steps (default 0).
// The table's dice are put back after it runs, so a spawn that rolled does not change the dice the script sees.
// A hidden thing that must not be told of by an id counter (T11: ids share one counter) belongs after everything the
// script makes, or is paired with a `plain` that burns the same counter.
//
// Fails with the first difference: which player, which message, after which step, and the path inside it.
// `twinRun` does not assert; it returns { plain, hidden, diffs } for a test of the harness itself.
import assert from "node:assert/strict";
import { createTables } from "../src/tables.js";

const own = (v) => v !== null && typeof v === "object";

// ---- the diff ----
// The first path at which two parsed JSON values differ, and what each has there.
export function firstDifference(a, b, path = "") {
  if (Object.is(a, b)) return null;
  if (!own(a) || !own(b) || Array.isArray(a) !== Array.isArray(b)) return { path: path || "(whole message)", a, b };
  if (Array.isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = i >= a.length || i >= b.length ? { path: `${path}[${i}]`, a: a[i], b: b[i] } : firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = k in a && k in b ? firstDifference(a[k], b[k], path ? `${path}.${k}` : k) : { path: path ? `${path}.${k}` : k, a: a[k], b: b[k] };
    if (d) return d;
  }
  return null;
}
const show = (v) => (v === undefined ? "(absent)" : (JSON.stringify(v) ?? String(v)).slice(0, 300));
const what = (step) => (step === null ? "seating" : step.label);

// Compare two worlds' streams for each player. Returns a list of { who, ... } differences, empty when they agree.
export function diffStreams(plain, hidden, players) {
  const diffs = [];
  for (const who of players) {
    const a = plain.streams[who], b = hidden.streams[who];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i]?.text === b[i]?.text) continue;
      const m = a[i] && b[i] ? firstDifference(JSON.parse(a[i].text), JSON.parse(b[i].text)) : null;
      diffs.push({
        who, index: i, plainCount: a.length, hiddenCount: b.length, step: what(a[i]?.step ?? b[i]?.step ?? null),
        path: m?.path ?? (a[i] ? "(the plain world sent a message the hidden one did not)" : "(the hidden world sent a message the plain one did not)"),
        plainMsg: a[i]?.text.slice(0, 240) ?? "(none)", hiddenMsg: b[i]?.text.slice(0, 240) ?? "(none)",
        plain: m ? show(m.a) : a[i] ? show(JSON.parse(a[i].text)) : "(no message)", hidden: m ? show(m.b) : b[i] ? show(JSON.parse(b[i].text)) : "(no message)",
      });
      break;       // the first difference of a player; what follows is noise
    }
  }
  return diffs;
}
export function describe(diffs) {
  return diffs.map((d) => `${d.who} was not sent the same in both worlds.\n` +
    `  first difference: message #${d.index + 1} (the plain world sent ${d.plainCount} messages in all, the hidden one ${d.hiddenCount}), at ${d.step}\n` +
    `  path:   ${d.path}\n  plain:  ${d.plain}\n  hidden: ${d.hidden}\n  that message in the plain world:  ${d.plainMsg}\n  that message in the hidden world: ${d.hiddenMsg}`).join("\n");
}

// ---- one world ----
function fakeMember(tables, onSend) {
  const conn = { send(m) { onSend(JSON.stringify(m)); } };
  const session = tables.connect(conn);
  return { session, say: (m) => session.receive(m) };
}

// Run the scenario in one world. `hide` is the hidden thing's function for this world (or null).
function runWorld(scenario, variant) {
  const names = scenario.players ?? ["Pat", "Sam"];
  const tables = createTables({ seed: () => scenario.seed ?? 5, ...(scenario.tables?.() ?? {}) });
  const streams = { dm: [] }, raw = { dm: [] };
  let step = null;
  const mark = (who) => (text) => { streams[who].push({ text, step }); raw[who].push(JSON.parse(text)); };
  for (const n of names) { streams[n] = []; raw[n] = []; }
  const members = { dm: fakeMember(tables, mark("dm")) };
  members.dm.say({ t: "host", name: "Dana", ...(scenario.grid && { grid: scenario.grid }) });
  const last = (who, t) => raw[who].findLast((m) => m.t === t);
  const code = last("dm", "welcome").code;
  const ids = { dm: last("dm", "welcome").userId }, tokens = [last("dm", "welcome").token];
  for (const n of names) {
    members[n] = fakeMember(tables, mark(n));
    members[n].say({ t: "join", code, name: n });
    ids[n] = last(n, "welcome").userId; tokens.push(last(n, "welcome").token);
    members.dm.say({ t: "approve", userId: ids[n], ok: true });
  }
  const w = {
    tables, code, ids, names, variant, members, streams, raw,
    get t() { return tables.get(code); },
    get state() { return tables.get(code).state; },
    last, dm: members.dm,
    say: (by, msg) => members[by].say(msg),
    // Send an action; the error text (if refused) is returned, so a script can see what a player was told.
    act(by, action) {
      const n = raw[by].length;
      members[by].say({ t: "act", action });
      return raw[by].slice(n).find((m) => m.t === "error")?.error;
    },
    // A DM action that must be accepted.
    must(action) { const err = w.act("dm", action); assert.equal(err, undefined, `the DM's ${action.type} was refused: ${err}`); },
  };
  // What a script changed in the state directly (not through an action) is not a change the server saw: count it, as an action
  // would, so the shared view is built again, and send everyone a full view, in both worlds.
  function settle() {
    w.t.seq = (w.t.seq ?? 0) + 1;
    for (const n of ["dm", ...names]) members[n].say({ t: "sync" });
  }
  const hide = (fn) => {
    // Both worlds sync here, so the extra messages are the same in both.
    const had = w.state.rng;
    fn?.(w);
    w.state.rng = had;
    settle();
  };
  const hidden = typeof scenario.__hidden === "function" ? { hide: scenario.__hidden } : scenario.__hidden ?? {};
  const mine = variant === "hidden" ? hidden.hide : hidden.plain;
  const at = hidden.at ?? 0;
  const labelOf = (s, i) => (typeof s === "function" ? `step ${i + 1} (a function)` : `step ${i + 1} (${s.by ?? "dm"} ${s.act ? `act ${JSON.stringify(s.act).slice(0, 120)}` : `send ${JSON.stringify(s.send).slice(0, 120)}`})`);
  let putIn = false;
  const putInNow = () => { putIn = true; const was = step; step = { label: "the hidden thing being put in" }; hide(mine); step = was; };
  // A setup that needs the hidden thing in at a point of its own (before a fight starts, say) calls w.putIn() there.
  w.putIn = () => { assert.ok(!putIn, "the hidden thing was already put in"); putInNow(); };
  step = { label: "setup" };
  scenario.setup?.(w);
  settle();
  const steps = scenario.steps ?? [];
  for (let i = 0; i <= steps.length; i++) {
    if (i === at && !putIn) putInNow();
    if (i === steps.length) break;
    let s = steps[i];
    if (typeof s?.act === "function") s = { ...s, act: s.act(w) };
    if (typeof s?.send === "function") s = { ...s, send: s.send(w) };
    step = { label: labelOf(s, i) };
    if (typeof s === "function") { s(w); settle(); continue; }
    const by = s.by ?? "dm";
    assert.ok(members[by], `step ${i + 1}: there is no ${by}`);
    if (s.act) {
      const err = w.act(by, s.act);
      if (by === "dm" && err !== undefined && !s.allowError) assert.fail(`step ${i + 1}: the DM's ${s.act.type} was refused (${err}); say allowError if that is meant`);
    } else members[by].say(s.send);
  }
  if (scenario.final !== false) {
    step = { label: "the final sync and record" };
    for (const n of names) { members[n].say({ t: "sync" }); members[n].say({ t: "history", limit: 200 }); }
    members.dm.say({ t: "sync" });
  }
  // The world's own ids, codes and tokens are random; every world is told in the same words.
  const swaps = [[code, "<code>"], ...Object.entries(ids).map(([n, id]) => [id, `<id:${n}>`]), ...tokens.map((tk, i) => [tk, `<token:${i}>`])];
  const masks = (scenario.mask?.(w) ?? []).map((m, i) => [m, `<mask:${i}>`]);
  swaps.push(...masks);
  const norm = (text) => swaps.reduce((s, [from, to]) => s.split(from).join(to), text);
  for (const k of Object.keys(streams)) streams[k] = streams[k].map((x) => ({ ...x, text: norm(x.text) }));
  return { streams, raw, names, w };
}

export function twinRun(scenario, hidden) {
  const sc = { ...scenario, __hidden: hidden };
  const plain = runWorld(sc, "plain"), hid = runWorld(sc, "hidden");
  return { plain, hidden: hid, diffs: diffStreams(plain, hid, plain.names) };
}

// Assert that no player can tell the worlds apart.
export function twin(scenario, hidden) {
  const { plain, hidden: hid, diffs } = twinRun(scenario, hidden);
  if (diffs.length) assert.fail(`twin: ${describe(diffs)}`);
  // A twin that proves nothing is a failure: the players must have been sent something to compare.
  for (const n of plain.names) assert.ok(plain.streams[n].length > 3, `twin: ${n} was sent next to nothing, so there is nothing to compare`);
  return { plain, hidden: hid };
}
