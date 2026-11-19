#!/usr/bin/env node
// A small command-line tool for homebrew packs (docs/specs/homebrew.md, Decision 7 and 8, task B12). No dependency.
//
//   node scripts/hb.mjs lint   <pack.json>
//   node scripts/hb.mjs read   <pack.json>
//   node scripts/hb.mjs dryrun <pack.json> [--seed n] [--level n] [--slot n] [--runs n] [--events]
//
// This is the only place with I/O: it reads the one file it is given (after checking its size, before parsing) and prints
// plain text. It holds no check of its own: `lint` is the registry's `loadPack`, `read` is the reader's `readEntry` and
// `dryrun` is `dryRun`. Exit status: 0 when all is well, 1 when the pack has problems, 2 when the command was used wrongly.
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dryRun } from "../packages/rules/src/content/dryrun.js";
import { READ_KINDS, readEntry } from "../packages/rules/src/content/reader.js";
import { loadPack } from "../packages/rules/src/content/registry.js";
import { HOMEBREW_LIMITS } from "../packages/rules/src/content/schema.js";

const USAGE = `Usage:
  node scripts/hb.mjs lint   <pack.json>     check a pack with the table's own checks
  node scripts/hb.mjs read   <pack.json>     say in words what each entry of a pack does (spells, monsters, items, feats,
                                             weapons, armour and objects)
  node scripts/hb.mjs dryrun <pack.json> [--seed n] [--level n] [--slot n] [--runs n] [--events]
                                             cast each spell in a small game of its own
Exit status: 0 all well, 1 problems found, 2 wrong use.`;
const VALUE = { "--seed": "seed", "--level": "level", "--slot": "slot", "--runs": "runs" };

const out = (s = "") => process.stdout.write(`${s}\n`);
const err = (s = "") => process.stderr.write(`${s}\n`);
const usage = (why) => { if (why) err(why); err(USAGE); return 2; };
const problems = (list) => { for (const p of list) err(`problem: ${p}`); return 1; };

// The file's text, or a problem. Its size is read first; a file over the pack limit is never opened.
function load(path) {
  let size;
  try { const st = statSync(path); if (!st.isFile()) return { problems: [`${path}: is not a file`] }; size = st.size; }
  catch (e) { return { problems: [`${path}: cannot be read (${e.code ?? e.message})`] }; }
  if (size > HOMEBREW_LIMITS.packBytes) return { problems: [`${path}: is ${size} bytes; a pack may be at most ${HOMEBREW_LIMITS.packBytes} bytes`] };
  try { return { text: readFileSync(path, "utf8") }; } catch (e) { return { problems: [`${path}: cannot be read (${e.code ?? e.message})`] }; }
}

function options(args) {
  const o = {}, files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--events") o.events = true;
    else if (VALUE[a]) {
      const v = args[++i];
      if (!/^\d{1,10}$/.test(v ?? "")) return { bad: `${a} needs a whole number` };
      o[VALUE[a]] = Number(v);
    } else if (a.startsWith("--")) return { bad: `unknown option ${a}` };
    else files.push(a);
  }
  return { o, files };
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  if (!["lint", "read", "dryrun"].includes(cmd)) return usage(cmd ? `unknown command "${String(cmd).slice(0, 40)}"` : "");
  const { o, files, bad } = options(rest);
  if (bad) return usage(bad);
  if (files.length !== 1) return usage("give one pack file");
  if (cmd !== "dryrun" && Object.keys(o).length) return usage(`${cmd} takes no options`);
  const f = load(files[0]);
  if (f.problems) return problems(f.problems);
  const checked = loadPack(f.text);                       // the registry's check: budget, strict lint, ids, the work ceiling
  if (!checked.ok) return problems(checked.problems);
  const pack = JSON.parse(f.text), spells = Array.isArray(pack.spells) ? pack.spells : [];
  if (cmd === "lint") {
    const kinds = Object.keys(pack).filter((k) => Array.isArray(pack[k]) && pack[k].length).map((k) => `${pack[k].length} ${k}`);
    out(`${pack.pack?.name ?? pack.pack?.id}: ok (${kinds.join(", ") || "no entries"})`);
    return 0;
  }
  // `read` reads every kind of entry a pack can hold, in the order of READ_KINDS (a pack names armour "armour", subclasses "subclasses", the rest with an s).
  const listOf = (k) => (k === "armour" ? "armour" : k.endsWith("s") ? `${k}es` : `${k}s`);
  const readable = READ_KINDS.flatMap((k) => (Array.isArray(pack[listOf(k)]) ? pack[listOf(k)].map((e) => [k, e]) : []));
  if (cmd === "read" ? !readable.length : !spells.length) { err("problem: the pack has no " + (cmd === "read" ? "spells, monsters, items, feats, weapons, armour, objects or subclasses to read" : "spells to try")); return 1; }
  let bads = 0;
  if (cmd === "read") {
    for (const [kind, e] of readable) {
      const r = readEntry(kind, e);
      out(`${r.title} [${r.tier ?? "no tier"}]`);
      for (const l of r.lines) out(`  ${l}`);
      for (const d of r.doesNot) out(`  The DM does: ${d}`);
      if (r.text) out(`  Author's text: "${r.text}"`);
      for (const p of r.problems) { err(`problem: ${e.id}: ${p}`); bads++; }
      out();
    }
    return bads ? 1 : 0;
  }
  for (const e of spells) {
    const r = dryRun("spell", e, { pack, ...o });
    if (!r.ok) { for (const p of r.problems) err(`problem: ${e.id}: ${p}`); bads++; continue; }
    out(`== ${r.name} (seed ${r.seed})`);
    out(r.summary.text);
    if (o.events) for (const ev of r.events) out(`  ${JSON.stringify(ev)}`);
    out();
  }
  return bads ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; process.exit(process.exitCode ?? 0); });   // `| head` closes the pipe: not an error
  process.exitCode = main(process.argv.slice(2));
}
