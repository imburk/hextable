#!/usr/bin/env node
// Checks a world pack with the table's own checks (docs/specs/travel.md, Decision 2 and "The screens"; build row W3). No dependency.
//
//   npm run world -- <world.json> [--pack <homebrew.json> ...]
//   node scripts/world.mjs <world.json> [--pack <homebrew.json> ...]
//
// `--pack` lends a homebrew pack's monsters to the check, as a table that holds that pack would (an encounter table may name
// them). This is the only place with I/O: it reads the files it is given (each after checking its size, before parsing) and
// prints plain text. It holds no check of its own: the world is `loadWorld` (the budget, then the linter) and a homebrew pack is
// the registry's `loadPack`. Exit status: 0 when the world can be imported, 1 when it has problems, 2 when used wrongly.
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadPack, overlayOf, using } from "../packages/rules/src/content/registry.js";
import { HOMEBREW_LIMITS } from "../packages/rules/src/content/schema.js";
import { indexOf, loadWorld, storedWorld, WORLD_LIMITS } from "../packages/rules/src/worldpack.js";

const USAGE = `Usage:
  npm run world -- <world.json> [--pack <homebrew.json> ...]
                         check a world pack as a table imports it; --pack lends a homebrew pack's monsters to the check
Exit status: 0 it can be imported, 1 problems found, 2 wrong use.`;
const out = (s = "") => process.stdout.write(`${s}\n`);
const err = (s = "") => process.stderr.write(`${s}\n`);
const usage = (why) => { if (why) err(why); err(USAGE); return 2; };
const problems = (list) => { for (const p of list) err(`problem: ${p}`); return 1; };

// The file's text, or a problem. Its size is read first; a file over the limit is never opened.
function load(path, most) {
  let size;
  try { const st = statSync(path); if (!st.isFile()) return { problems: [`${path}: is not a file`] }; size = st.size; }
  catch (e) { return { problems: [`${path}: cannot be read (${e.code ?? e.message})`] }; }
  if (size > most) return { problems: [`${path}: is ${size} bytes; the most is ${most}`] };
  try { return { text: readFileSync(path, "utf8") }; } catch (e) { return { problems: [`${path}: cannot be read (${e.code ?? e.message})`] }; }
}

export function main(argv) {
  const worlds = [], packs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pack") { if (!argv[i + 1]) return usage("--pack needs a file"); packs.push(argv[++i]); }
    else if (argv[i].startsWith("--")) return usage(`unknown option ${String(argv[i]).slice(0, 40)}`);
    else worlds.push(argv[i]);
  }
  if (worlds.length !== 1) return usage("give one world file");
  const loaded = [];
  for (const p of packs) {
    const f = load(p, 2 * HOMEBREW_LIMITS.packBytes);
    if (f.problems) return problems(f.problems);
    const r = loadPack(f.text);
    if (!r.ok) return problems(r.problems.map((x) => `${p}: ${x}`));
    loaded.push(r.pack);
  }
  let overlay;
  try { overlay = overlayOf(loaded); } catch (e) { return problems(e.problems ?? [e.message]); }
  const f = load(worlds[0], 2 * WORLD_LIMITS.bytes);
  if (f.problems) return problems(f.problems);
  const r = using(overlay, () => loadWorld(f.text));
  if (!r.ok) return problems(r.problems);
  const p = r.pack, pictures = Object.keys(p.assets ?? {});
  const index = indexOf(storedWorld(p, Object.fromEntries(pictures.map((k) => [k, k]))), r.hash);
  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  out(`${p.world.name} (version ${p.world.version}): ok`);
  out(`  ${count(p.nodes?.length ?? 0, "place")}, ${count(Object.keys(p.maps ?? {}).length, "battle map")}, ${count(p.routes?.length ?? 0, "route")}, ${count(p.tables?.length ?? 0, "encounter table")}, ${count(pictures.length, "picture")}`);
  out(`  ${Buffer.byteLength(f.text)} bytes of ${WORLD_LIMITS.bytes}; the index the game keeps is ${Buffer.byteLength(JSON.stringify(index))} bytes`);
  out(`  hash ${r.hash}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on("error", (e) => { if (e.code !== "EPIPE") throw e; process.exit(process.exitCode ?? 0); });
  process.exitCode = main(process.argv.slice(2));
}
