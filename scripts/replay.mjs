#!/usr/bin/env node
// Replays a table's action journal (#659; packages/server/src/journal.js) through apply() and says whether it comes out the same.
//
//   node scripts/replay.mjs <snapshot.json> <journal.jsonl> [<journal.jsonl> ...] [--quiet]
//
// The snapshot is the state the first journal file begins from (ABC123.journal.000007.snapshot.json, beside it). Each line holds the action,
// who sent it and a hash of the whole state after it; the script applies the lines in order, under the table's homebrew, and stops at the
// first line whose result differs: a different state hash, a dice counter that does not match, or an action the engine now refuses. That
// line is where a bug report diverges (or where the rules changed since the game was played).
// A file that follows an undo, a redo, a rewind, a loaded pack or world, or someone joining begins from a snapshot of its own; when the
// state we hold is not the one it begins from, the script starts again from that snapshot (found beside the file) and says so.
// The snapshot and journal hold the table's whole state, dice key included: keep them private, as you would the table's save.
// Exit status: 0 the journal replays exactly, 1 it diverges or cannot be read, 2 wrong use.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { apply } from "../packages/rules/src/engine.js";
import { vetPacks } from "../packages/rules/src/content/packs.js";
import { overlayOf, using } from "../packages/rules/src/content/registry.js";
import { diceOf, hashState } from "../packages/server/src/journal.js";

const USAGE = "Usage: node scripts/replay.mjs <snapshot.json> <journal.jsonl> [<journal.jsonl> ...] [--quiet]";
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
  let snap = snapshot, state = structuredClone(snap.state), overlay = overlayFor(snap), applied = 0, restarts = 0;
  if (hashState(state) !== snap.hash) return { ok: false, lines: 0, restarts, notes, diverged: { file: "(snapshot)", n: 0, why: "the snapshot's state does not match its own hash (the file was changed or damaged)" } };
  const stop = (file, n, why, extra = {}) => ({ ok: false, lines: applied, restarts, notes, diverged: { file, n, why, ...extra } });
  for (const j of journals) {
    let lineNo = 0;
    for (const raw of j.text.split("\n")) {
      if (!raw) continue;
      lineNo++;
      let line;
      try { line = JSON.parse(raw); } catch { return stop(j.name, lineNo, "the line is not JSON (a write cut short by a crash is expected only at the very end of a file)"); }
      if (line.k === "open") {
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
        if (diceOf(state) !== line.d1) return stop(j.name, line.n, `the dice stand at ${JSON.stringify(diceOf(state))} after this line, the journal says ${JSON.stringify(line.d1)}`, { type: action?.type });
        const h = hashState(state);
        if (h !== line.h) return stop(j.name, line.n, `the state differs after this line (hash ${h}, journal ${line.h})`, { type: action?.type });
      } else if (MARKERS.has(line.k)) {
        notes.push(`${j.name} line ${line.n ?? lineNo}: ${line.k}${line.why ? ` (${line.why})` : ""}: the next file begins from its own snapshot`);
      }
    }
  }
  return { ok: true, lines: applied, restarts, notes };
}

export function main(argv, out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`)) {
  const quiet = argv.includes("--quiet"), args = argv.filter((a) => !a.startsWith("--"));
  if (args.length < 2) { err(USAGE); return 2; }
  let snapshot, journals;
  try {
    snapshot = JSON.parse(readFileSync(args[0], "utf8"));
    journals = args.slice(1).map((p) => ({ name: basename(p), text: readFileSync(p, "utf8"), loadSnapshot: (name) => { try { return JSON.parse(readFileSync(join(dirname(p), basename(String(name))), "utf8")); } catch { return null; } } }));
  } catch (e) { err(`cannot read: ${e.message}`); return 1; }
  let r;
  try { r = replayGame(snapshot, journals); } catch (e) { err(`cannot replay: ${e.message}`); return 1; }
  if (!quiet) for (const n of r.notes) out(`note: ${n}`);
  if (r.ok) { out(`ok: ${r.lines} action${r.lines === 1 ? "" : "s"} replayed, every state hash matches${r.restarts ? ` (${r.restarts} restart${r.restarts === 1 ? "" : "s"} from a snapshot)` : ""}`); return 0; }
  const d = r.diverged;
  err(`diverged after ${r.lines} action${r.lines === 1 ? "" : "s"}: ${d.file} line ${d.n}${d.type ? ` (${d.type})` : ""}: ${d.why}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
