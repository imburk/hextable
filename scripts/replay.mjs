#!/usr/bin/env node
// Replays a table's action journal (#659; packages/server/src/journal.js) through apply() and says whether it comes out the same.
//
//   node scripts/replay.mjs <snapshot.json> <journal.jsonl> [<journal.jsonl> ...] [--quiet] [--strict]
//
// The snapshot is the state the first journal file begins from (ABC123.journal.000007.snapshot.json, beside it). Each line holds the action,
// who sent it and a hash of the whole state after it; the script applies the lines in order, under the table's homebrew, and stops at the
// first line whose result differs: a different state hash, a dice counter that does not match, or an action the engine now refuses. That
// line is where a bug report diverges (or where the rules changed since the game was played).
// A file that follows an undo, a redo, a rewind, a loaded pack or world, or someone joining begins from a snapshot of its own; when the
// state we hold is not the one it begins from, the script starts again from that snapshot (found beside the file) and says so.
// What the hash does not check: the state in full, but of the timeline only its length, its first entry and its last 20 entries, so a change
// in the middle of a long timeline that leaves those alone goes unseen (the engine only appends to it).
// The timeline is cut to the cap in a file's header after each action that can be undone, as the server does.
// A last line cut short by a crash is a note, not a failure. `--strict` also fails (exit 1) when a file starts again from its own snapshot
// because lines were lost (the journal's own write failed: its header says `lost`), which a replay cannot otherwise tell from an undo.
// The snapshot and journal hold the table's whole state, dice key, DM notes and homebrew included: keep them private, as you would the
// table's save, and never attach them to a public issue. This script says so each time it runs.
// Exit status: 0 the journal replays exactly, 1 it diverges or cannot be read, 2 wrong use.
//
//   node scripts/replay.mjs --crash <bundle.json> [--data <folder>]
//
// Replays a crash bundle (packages/server/src/crashes.js, DATA_DIR/crashes/<time>-<table>.json): the journal file the bundle names, up to the
// line it names, from its snapshot (both found in --data, by default the folder above the bundle's), then runs the bundle's action as the
// server did and says whether it still throws. Exit status: 1 it still throws (the bug is there), 0 it no longer throws (the engine now
// answers or refuses it), 2 wrong use, 3 the point could not be reached (files missing, or the journal differs from the bundle's hash).
// The bundle's action has any player text over 200 characters cut, so a crash that needed the whole text may not reproduce; the bundle says
// where it cut (`cut`). A bundle, its snapshot and its journal are private: never attach them to a public issue.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { apply } from "../packages/rules/src/engine.js";
import { vetPacks } from "../packages/rules/src/content/packs.js";
import { overlayOf, using } from "../packages/rules/src/content/registry.js";
import { diceOf, hashState } from "../packages/server/src/journal.js";
import { undoable } from "../packages/rules/src/history.js";
import { capTimeline } from "../packages/rules/src/timeline.js";

const USAGE_CRASH = "Usage: node scripts/replay.mjs --crash <bundle.json> [--data <folder with the journal files>]";
const USAGE = "Usage: node scripts/replay.mjs <snapshot.json> <journal.jsonl> [<journal.jsonl> ...] [--quiet] [--strict]";
const PRIVATE = "keep these files private: a snapshot holds the whole table state (dice key, DM notes, homebrew packs, player names), like the table's own save; never attach one to a public issue.";
const MARKERS = new Set(["undo", "redo", "rewind", "break"]);

function overlayFor(snap) {
  if (!snap.packs?.length) return overlayOf([]);
  const v = vetPacks(snap.packs);
  if (!v.ok) throw new Error(`the snapshot's packs do not load: ${v.problems.slice(0, 3).join("; ")}`);
  return v.overlay;
}

// snapshot: the parsed snapshot. journals: [{ name, text, loadSnapshot?(name) }]. Returns { ok, lines, restarts, notes, diverged? }.
export function replayGame(snapshot, journals) {
  const notes = [];
  let cap = null, lost = 0, snap = snapshot, state = structuredClone(snap.state), overlay = overlayFor(snap), applied = 0, restarts = 0;
  if (hashState(state) !== snap.hash) return { ok: false, lines: 0, restarts, notes, diverged: { file: "(snapshot)", n: 0, why: "the snapshot's state does not match its own hash (the file was changed or damaged)" } };
  const stop = (file, n, why, extra = {}) => ({ ok: false, lines: applied, restarts, notes, diverged: { file, n, why, ...extra } });
  for (const [ji, j] of journals.entries()) {
    let lineNo = 0;
    const seen = new Set();
    const rows = j.text.split("\n").filter(Boolean);
    for (const [ri, raw] of rows.entries()) {
      lineNo++;
      let line;
      try { line = JSON.parse(raw); }
      catch {
        if (ji === journals.length - 1 && ri === rows.length - 1) { notes.push(`${j.name}: the last line is cut short (a crash while writing); replayed up to it`); break; }
        return stop(j.name, lineNo, "the line is not JSON (a write cut short by a crash is expected only at the very end of the last file)");
      }
      if (line.k === "act" && seen.has(line.n)) { notes.push(`${j.name} line ${line.n}: written twice (a shutdown redid it); the repeat is skipped`); continue; }
      if (line.k === "act") seen.add(line.n);
      if (line.k === "open") {
        cap = Number.isInteger(line.cap) ? line.cap : null;
        if (line.why === "lost") lost++;
        const own = j.loadSnapshot?.(line.snapshot);
        if (hashState(state) === line.h) {                                 // the file picks up exactly where the state is
          if (own?.hash === line.h) { snap = own; overlay = overlayFor(own); }       // but its members and packs are its own
          continue;
        }
        if (!own) return stop(j.name, lineNo, `the file begins from a state we do not hold, and its snapshot ${line.snapshot} cannot be read`);
        snap = own; state = structuredClone(own.state); overlay = overlayFor(own); restarts++;
        if (hashState(state) !== own.hash) return stop(j.name, lineNo, `${line.snapshot} does not match its own hash`);
        notes.push(`${j.name}: restarted from ${line.snapshot}${line.why ? ` (${line.why})` : ""}`);
      } else if (line.k === "act") {
        if (diceOf(state) !== line.d0) return stop(j.name, line.n, `the dice stand at ${JSON.stringify(diceOf(state))} before this line, the journal says ${JSON.stringify(line.d0)}`, { type: line.action?.type });
        let action = structuredClone(line.action);
        if (action?.userName?.$member !== undefined) {
          const name = snap.members?.[action.userName.$member];
          if (name === undefined) return stop(j.name, line.n, "the action names a member the snapshot does not hold", { type: action.type });
          action.userName = name;
        }
        if (line.lossy) notes.push(`${j.name} line ${line.n}: ${line.lossy.join(", ")} was not journalled; the result may differ for that reason`);
        let res;
        try { res = using(overlay, () => apply(state, action, { role: line.role, userId: line.uid })); }
        catch (err) { return stop(j.name, line.n, `apply() threw: ${err.message}`, { type: action?.type }); }
        if (!res.ok) return stop(j.name, line.n, `apply() refused an action the server accepted: ${res.error}`, { type: action?.type });
        applied++;
        if (cap !== null && undoable(action)) capTimeline(state.timeline, cap);
        if (diceOf(state) !== line.d1) return stop(j.name, line.n, `the dice stand at ${JSON.stringify(diceOf(state))} after this line, the journal says ${JSON.stringify(line.d1)}`, { type: action?.type });
        const h = hashState(state);
        if (h !== line.h) return stop(j.name, line.n, `the state differs after this line (hash ${h}, journal ${line.h})`, { type: action?.type });
      } else if (MARKERS.has(line.k)) {
        notes.push(`${j.name} line ${line.n ?? lineNo}: ${line.k}${line.why ? ` (${line.why})` : ""}: the next file begins from its own snapshot`);
      }
    }
  }
  return { ok: true, lines: applied, restarts, lost, notes, state, overlay, snap };
}

// An action as a journal line or a bundle holds it, with a `{ $member }` name turned back into the member's name.
function nameBack(action, snap) {
  const a = structuredClone(action);
  if (a?.userName?.$member !== undefined) {
    const name = snap.members?.[a.userName.$member];
    if (name === undefined) delete a.userName; else a.userName = name;
  }
  return a;
}

// bundle: the parsed bundle. read(name) -> the text of a file beside the journal, or null. Returns { reached, why?, crashed?, error?, result?, notes }.
export function replayCrash(bundle, read) {
  const notes = [];
  const j = bundle?.journal;
  if (!j || typeof j.file !== "string" || typeof j.snapshot !== "string" || !Number.isInteger(j.line)) return { reached: false, why: "the bundle holds no journal position (no journal was open, or the crash was not an action)", notes };
  const snapText = read(j.snapshot), logText = read(j.file);
  if (snapText === null) return { reached: false, why: `the snapshot ${j.snapshot} is not there (the journal keeps the last few files only)`, notes };
  if (logText === null) return { reached: false, why: `the journal ${j.file} is not there`, notes };
  let snapshot;
  try { snapshot = JSON.parse(snapText); } catch { return { reached: false, why: `${j.snapshot} cannot be read`, notes }; }
  // The lines up to the one the bundle names: the header has no number, and a closing line after it (written later) is dropped.
  const rows = logText.split("\n").filter(Boolean);
  const kept = [];
  let last = 0;
  for (const raw of rows) {
    let row; try { row = JSON.parse(raw); } catch { kept.push(raw); continue; }
    if (row.n === undefined || row.n <= j.line) { kept.push(raw); if (row.n !== undefined) last = Math.max(last, row.n); }
  }
  if (last < j.line) notes.push(`the journal on disk ends at line ${last}, the bundle says ${j.line} (the last lines were not written before the server stopped); the state may be earlier than the crash's`);
  let r;
  try { r = replayGame(snapshot, [{ name: j.file, text: kept.join("\n") + "\n", loadSnapshot: (n) => { const t = read(String(n)); try { return t === null ? null : JSON.parse(t); } catch { return null; } } }]); }
  catch (e) { return { reached: false, why: `cannot replay: ${e.message}`, notes }; }
  notes.push(...r.notes);
  if (!r.ok) return { reached: false, why: `the journal diverges before the crash: ${r.diverged.file} line ${r.diverged.n}: ${r.diverged.why}`, notes };
  if (typeof bundle.hash === "string" && hashState(r.state) !== bundle.hash) notes.push("the state reached does not match the bundle's hash; the journal or the rules differ from the crash's, so the result may not mean the same");
  const action = nameBack(bundle.action, r.snap);
  if (bundle.cut?.length) notes.push(`the bundle cut text from the action (${bundle.cut.slice(0, 5).join(", ")}); a crash that needed it may not reproduce`);
  try {
    const res = using(r.overlay, () => apply(r.state, action, { role: bundle.role, userId: bundle.uid }));
    return { reached: true, crashed: false, result: res.ok ? "the engine accepts it" : `the engine refuses it: ${res.error}`, notes };
  } catch (err) { return { reached: true, crashed: true, error: err, notes }; }
}

function mainCrash(argv, out, err) {
  const take = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const bundlePath = take("--crash");
  if (!bundlePath || bundlePath.startsWith("--")) { err(USAGE_CRASH); return 2; }
  const dir = take("--data") ?? join(dirname(bundlePath), "..");
  let bundle;
  try { bundle = JSON.parse(readFileSync(bundlePath, "utf8")); } catch (e) { err(`cannot read ${bundlePath}: ${e.message}`); return 3; }
  const read = (name) => { try { return readFileSync(join(dir, basename(String(name))), "utf8"); } catch { return null; } };
  const r = replayCrash(bundle, read);
  for (const n of r.notes) out(`note: ${n}`);
  out(`warning: ${PRIVATE}`);
  if (!r.reached) { err(`cannot reach the crash: ${r.why}`); return 3; }
  const a = bundle.action?.type ?? "?";
  if (r.crashed) { out(`still crashes: ${a} throws ${r.error?.name ?? "Error"}: ${String(r.error?.message ?? r.error).slice(0, 200)}`); out(String(r.error?.stack ?? "").split("\n").slice(1, 5).join("\n")); return 1; }
  out(`does not crash now: ${a}: ${r.result}`);
  return 0;
}

export function main(argv, out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`)) {
  if (argv.includes("--crash")) return mainCrash(argv, out, err);
  const quiet = argv.includes("--quiet"), strict = argv.includes("--strict"), args = argv.filter((a) => !a.startsWith("--"));
  if (args.length < 2) { err(USAGE); return 2; }
  let snapshot, journals;
  try {
    snapshot = JSON.parse(readFileSync(args[0], "utf8"));
    journals = args.slice(1).map((p) => ({ name: basename(p), text: readFileSync(p, "utf8"), loadSnapshot: (name) => { try { return JSON.parse(readFileSync(join(dirname(p), basename(String(name))), "utf8")); } catch { return null; } } }));
  } catch (e) { err(`cannot read: ${e.message}`); return 1; }
  let r;
  try { r = replayGame(snapshot, journals); } catch (e) { err(`cannot replay: ${e.message}`); return 1; }
  if (!quiet) for (const n of r.notes) out(`note: ${n}`);
  out(`warning: ${PRIVATE}`);
  if (r.ok && strict && r.lost) { err(`--strict: ${r.lost} file${r.lost === 1 ? " starts" : "s start"} again from a snapshot because the journal lost lines (its header says \"lost\"); the replay is not complete`); return 1; }
  if (r.ok) { out(`ok: ${r.lines} action${r.lines === 1 ? "" : "s"} replayed, every state hash matches${r.restarts ? ` (${r.restarts} restart${r.restarts === 1 ? "" : "s"} from a snapshot)` : ""}`); return 0; }
  const d = r.diverged;
  err(`diverged after ${r.lines} action${r.lines === 1 ? "" : "s"}: ${d.file} line ${d.n}${d.type ? ` (${d.type})` : ""}: ${d.why}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
