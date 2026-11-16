// Content read at load time (docs/PATH-TO-0.2.md, "Direct reads of content, and what the registry (B4) must do").
// The registry (content/registry.js) adds a table's homebrew into the lookups for the length of one call, so a read
// made when a module loads sees the SRD only, for ever: a homebrew id is never in what it built. The lines that do
// that today are listed here; a new one fails this test. If it must read content once, build it on each call or
// rebuild it when packs change, and say so in the pull request.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const NAMES = new Set(["CONTENT", "SPELLS", "MONSTERS", "MONSTER_ACTIONS", "PREGENS"]);
// file, then the line as written (trimmed). Six are the Fantasy Grounds importer's name maps, which should only
// ever map to SRD entries; two are the DM's lists in the client, which B7 must rebuild when packs change.
const KNOWN = new Set([
  "packages/rules/src/import-fgxml.js: for (const c of Object.values(CONTENT.classes)) { classByKey.set(norm(c.id), c); classByKey.set(norm(c.name), c); }",
  "packages/rules/src/import-fgxml.js: for (const s of Object.values(CONTENT.spells)) { spellByKey.set(norm(s.id), s); spellByKey.set(norm(s.name), s); }",
  "packages/rules/src/import-fgxml.js: for (const w of Object.values(CONTENT.weapons)) { weaponByKey.set(norm(w.name), w); weaponByKey.set(singular(norm(w.name)), w); }",
  "packages/rules/src/import-fgxml.js: for (const a of Object.values(CONTENT.armour)) {",
  "packages/rules/src/import-fgxml.js: for (const d of Object.values(CONTENT.items)) { itemByKey.set(norm(d.name), d); itemByKey.set(norm(d.id), d); }",
  "packages/rules/src/import-fgxml.js: for (const f of Object.values(CONTENT.feats)) { featByKey.set(norm(f.name), f); featByKey.set(norm(f.id), f); }",
  "packages/client/app.js: $('dm-cond').innerHTML = Object.values(CONTENT.conditions).map((c) => `<option value=\"${c.id}\">${esc(c.name)}</option>`).join('');",
]);

// ---------- a small scanner: which uses of the names are not inside any function ----------
const KEYWORDS_BEFORE_PAREN = new Set(["if", "for", "while", "switch", "catch", "with", "return", "typeof", "await", "in", "of", "new", "delete", "void", "case", "do", "else", "yield"]);
const REGEX_AFTER = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);
const ID_START = /[A-Za-z_$]/, ID_PART = /[A-Za-z0-9_$]/;

export function loadTimeReads(src) {
  const out = new Set();
  // frames: { t: '{' | '(' | '[' | '${' | '=>', fn, before } ; `before` is the token before a '('
  const frames = [];
  const last = { closed: null };
  let fnDepth = 0, line = 1, prev = null, prev2 = null, skipStatement = false, i = 0;
  const push = (f) => { frames.push(f); if (f.fn) fnDepth++; };
  // A use is kept with the innermost frame until that frame closes: one inside a parameter list (a default,
  // evaluated at call time) is dropped then; any other is passed outwards, and kept when no frame is left.
  const pop = (params = false) => {
    const f = frames.pop();
    if (f?.fn) fnDepth--;
    if (f && !params) for (const n of f.hits ?? []) record(n);
    return f;
  };
  const record = (n) => (frames.length ? (frames.at(-1).hits ??= []).push(n) : out.add(n));
  const fnLike = (f) => !!f && !KEYWORDS_BEFORE_PAREN.has(f.before ?? "") && (f.before === "function" || ID_START.test(f.before ?? "") || f.before2 === "function");
  const next = () => { let j = i; while (/\s/.test(src[j] ?? "")) j++; return src.slice(j, j + 2); };
  const endArrows = () => { while (frames.at(-1)?.t === "=>") pop(); };
  const tok = (t) => { prev2 = prev; prev = t; };
  const regexOk = () => prev === null || (/^[^\w$)\]}]/.test(prev) && prev !== "++" && prev !== "--") || REGEX_AFTER.has(prev);
  const skipString = (q) => { i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; else if (src[i] === "\n") line++; i++; } i++; };
  // In a template literal: scan to its end, or to a `${`, which opens a frame.
  const template = () => {
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") line++;
      if (c === "`") { i++; tok("`"); return; }
      if (c === "$" && src[i + 1] === "{") { i += 2; push({ t: "${", fn: false }); prev = "{"; return; }
      i++;
    }
  };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === "'" || c === '"') { skipString(c); tok("str"); continue; }
    if (c === "`") { i++; template(); continue; }
    if (c === "/" && regexOk()) {
      i++; let cls = false;
      while (i < src.length && (cls || src[i] !== "/")) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
      i++; while (ID_PART.test(src[i] ?? "")) i++;
      tok("re"); continue;
    }
    if (ID_START.test(c)) {
      let j = i; while (j < src.length && ID_PART.test(src[j])) j++;
      const w = src.slice(i, j); i = j;
      if (frames.length === 0 && (w === "import" || (w === "export" && /^\s*(\{|\*)/.test(src.slice(i))))) skipStatement = true;
      if (NAMES.has(w) && prev !== "." && fnDepth === 0 && !skipStatement) record(line);
      tok(w); continue;
    }
    if (/[0-9]/.test(c)) { while (/[0-9a-zA-Z_.]/.test(src[i] ?? "")) i++; tok("num"); continue; }
    if (c === "=" && d === ">") {
      i += 2; tok("=>");
      let j = i; while (/\s/.test(src[j] ?? "")) j++;
      if (src[j] !== "{") push({ t: "=>", fn: true });
      continue;
    }
    if (c === "(" || c === "[") { push({ t: c, fn: false, before: prev, before2: prev2 }); i++; tok(c); continue; }
    if (c === "{") {
      const after = prev;
      // A function's body: after `=>`, or after `)` closing the parameters of `function f(...)` or a method `f(...)`.
      const fn = after === "=>" || (after === ")" && fnLike(last.closed));
      push({ t: "{", fn }); i++; tok("{"); continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      endArrows();
      const top = frames.at(-1);
      i++;
      const params = c === ")" && top?.t === "(" && (next() === "=>" || (next()[0] === "{" && fnLike(top)));
      const f = pop(params);
      if (f?.t === "${") { template(); continue; }
      if (c === ")") last.closed = f;
      tok(c); continue;
    }
    if (c === "," || c === ";") {
      endArrows();
      if (c === ";" && frames.length === 0) skipStatement = false;
      i++; tok(c); continue;
    }
    // Any other punctuator, longest first is not needed: only their being "not a value" matters for regexes.
    let j = i + 1; while (j < src.length && /[=+\-*%&|^!<>?:~.]/.test(src[j]) && /[=+\-*%&|^!<>?:~.]/.test(c)) j++;
    tok(src.slice(i, j)); i = j;
  }
  // `open`: frames left open at the end; anything but 0 means the scanner lost its place in this file.
  return Object.assign([...out].sort((a, b) => a - b), { open: frames.length });
}

function files(dir, keep) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!["node_modules", "test", "vendor", "srd52", "maps"].includes(f)) walk(p); } else if (p.endsWith(".js") && keep(p)) out.push(p); } };
  walk(dir);
  return out.sort();
}

test("the scanner tells a read at load time from a read inside a function", () => {
  const src = [
    "import { CONTENT, SPELLS } from './content/index.js';",            // 1 import: no
    "export { CONTENT };",                                                // 2 re-export: no
    "const a = Object.keys(CONTENT.spells);",                             // 3 yes
    "export const f = (id) => CONTENT.spells[id];",                       // 4 no
    "export function g(x = SPELLS) { return CONTENT.items[x]; }",          // 5 the default is evaluated at call time: no
    "for (const m of Object.values(MONSTERS)) {",                         // 6 yes
    "  list.push(PREGENS[m.id]);",                                        // 7 yes: a top-level loop's body
    "}",
    "const re = /[(]{/g, s = `${CONTENT.x}`;",                            // 9 yes, after a regex with brackets
    "const h = { get(k) { return SPELLS[k]; }, n: (a, b) =>",             // 10 no
    "  MONSTERS[a] ?? b, m: MONSTER_ACTIONS };",                          // 11 yes (m: ...), the arrow ended at the comma
    "if (x) { y = SPELLS; }",                                              // 12 yes
    "class K { m() { return CONTENT; } }",                                // 13 no
    "const t = `a ${(() => SPELLS)()} b`; x.CONTENT;",                    // 14 no: inside an arrow; a property
  ].join("\n");
  assert.deepEqual([...loadTimeReads(src)], [3, 6, 7, 9, 11, 12]);
  assert.equal(loadTimeReads(src).open, 0);
  assert.deepEqual([...loadTimeReads("const x = 1;\nconst y = { a: [CONTENT.spells] };")], [2], "a read nested in brackets at the top level");
});

test("content is read at load time outside content/index.js only on the known lines", () => {
  const all = [
    ...files(join(REPO, "packages/rules/src"), (p) => !p.endsWith(join("content", "index.js"))),
    ...files(join(REPO, "packages/client"), () => true),
    ...files(join(REPO, "packages/server/src"), () => true),
  ];
  assert.ok(all.length > 50);
  const found = new Set();
  for (const f of all) {
    const src = readFileSync(f, "utf8"), lines = src.split("\n");
    const reads = loadTimeReads(src);
    assert.equal(reads.open, 0, `the scanner lost its place in ${f}`);
    for (const n of reads) found.add(`${relative(REPO, f).split("\\").join("/")}: ${lines[n - 1].trim()}`);
  }
  assert.deepEqual([...found].filter((x) => !KNOWN.has(x)), [], "a new line reads content when its module loads");
  assert.deepEqual([...KNOWN].filter((x) => !found.has(x)), [], "a known line has gone or changed: take it off the list");
});
