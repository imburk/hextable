// A table's homebrew, as lookups the engine already reads (docs/specs/homebrew.md, Decision 3, row H4, task B4).
//
// `loadPack(data)` checks one homebrew pack and builds what its entries add to each lookup, once: spell profiles,
// monster records and actions (content/index.js, HOMEBREW_LOOKUPS). `overlayOf(packs)` puts a table's packs
// together and refuses ids that collide. `using(overlay, fn)` adds the overlay's ids INTO the same objects every
// read site uses (CONTENT.spells, SPELLS, MONSTERS, MONSTER_ACTIONS and the rest) for the length of `fn`, and takes
// them out in a `finally`: the objects keep their identity, their own keys and their key order. No read site changes
// (docs/PATH-TO-0.2.md, "Direct reads of content, and what the registry (B4) must do").
//
// The overlay is a hidden global while `fn` runs. It is safe because `fn` is synchronous and single-threaded: no
// other table's call can run in between. So `using` refuses an async or generator function and a result that is a
// promise, and refuses a second, different overlay while one is installed (the same overlay again is a no-op).
//
// Pure: no I/O, no clock, no randomness. What `using` changes is a registry of derived lookups, never game state.
import { budget, HOMEBREW_LIMITS, lintPack } from './schema.js';
import { HOMEBREW_LOOKUPS, SRD_PACK_ID } from './index.js';

export const HOMEBREW_KINDS = Object.keys(HOMEBREW_LOOKUPS);
const PACK_KEYS = ['format', 'v', 'pack', ...HOMEBREW_KINDS];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export class PackError extends Error {
  constructor(problems) { super(`The homebrew was refused: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}`); this.problems = problems; }
}

// ---------- checking one pack ----------
// ===== SEAM for job B1 (budget, strict mode; docs/specs/homebrew.md, Decision 2, task B1) =====
// The budget runs on the document as given, before it is copied (a copy of a depth bomb would overflow the stack):
// one iterative walk, bounded by HOMEBREW_LIMITS, refusing prototype keys, functions and anything not plain data.
function budgetHomebrew(raw) {
  return budget(raw, HOMEBREW_LIMITS);
}
// The lint runs on the plain copy, the same data that is then built and played: strict, so every key is in its kind's
// list, every id carries the pack's prefix (an SRD id is named as one), the source is `homebrew:<pack id>` and nothing
// claims `checked: true`. The SRD ids are this module's own lookups (`HOMEBREW_LOOKUPS[kind][0]` is `CONTENT[kind]`).
const SRD_IDS = { pack: SRD_PACK_ID, ...Object.fromEntries(HOMEBREW_KINDS.map((k) => [k, HOMEBREW_LOOKUPS[k][0][0]])) };
function lintHomebrew(data) {
  try { return lintPack(data, { strict: true, srd: SRD_IDS }); } catch (err) { return [`pack: could not be checked (${err.message})`]; }
}
// ===== end of the B1 seam =====

const LOADED = new WeakMap();                 // a loaded pack -> its built lookups (cached: built once per pack)

function deepFreeze(root) {
  const stack = [root];
  while (stack.length) {
    const x = stack.pop();
    if (x === null || typeof x !== 'object' || Object.isFrozen(x)) continue;
    Object.freeze(x);
    for (const k of Object.keys(x)) stack.push(x[k]);
  }
  return root;
}

// Checks one homebrew pack (a JSON text or the parsed object) and builds what it adds to each lookup.
// Returns { ok: true, pack } with a frozen record { id, version, name, ids } to pass to `overlayOf`, or
// { ok: false, problems: [sentences] }. The caller (B5) keeps the result, one per pack and hash, so the
// checking and the spell profiles are done once, not on every call.
export function loadPack(input) {
  let data;
  try { data = typeof input === 'string' ? JSON.parse(input) : input; } catch (err) { return { ok: false, problems: [`pack: is not JSON (${err.message})`] }; }
  const over = budgetHomebrew(data);
  if (over.length) return { ok: false, problems: over };
  try { data = structuredClone(data); }                    // a plain copy: no getters, no functions, nothing the caller can change later
  catch (err) { return { ok: false, problems: [`pack: is not plain data (${err.message})`] }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problems: ['pack: is not a pack document'] };
  const problems = [];
  if (data.format !== 'hextable-pack' || data.v !== 1) problems.push('pack: format must be "hextable-pack", v 1');
  for (const k of Object.keys(data)) if (!PACK_KEYS.includes(k)) problems.push(`pack: "${k}" cannot be homebrew (the kinds are ${HOMEBREW_KINDS.join(', ')})`);
  for (const k of HOMEBREW_KINDS) if (data[k] !== undefined && !Array.isArray(data[k])) problems.push(`${k}: must be a list`);
  if (problems.length) return { ok: false, problems };
  const id = data.pack?.id;
  if (id === SRD_PACK_ID) return { ok: false, problems: [`pack: "${id}" is the SRD pack's id`] };
  const lint = lintHomebrew(data);
  if (lint.length) return { ok: false, problems: lint };
  // Every id carries the pack's prefix (Decision 1), so it can never be an SRD id or another pack's.
  const prefix = `hb-${id}-`;
  for (const kind of HOMEBREW_KINDS) for (const e of data[kind] ?? []) {
    if (typeof e.id !== 'string' || !e.id.startsWith(prefix) || !ID.test(e.id.slice(prefix.length))) problems.push(`${kind}/${e.id}: a homebrew id is "${prefix}" and a kebab-case name`);
    if (e.checked === true) problems.push(`${kind}/${e.id}: homebrew is not checked against any rulebook (checked: false)`);
  }
  if (problems.length) return { ok: false, problems };
  deepFreeze(data);
  // What the pack adds: [target, id, value] for every lookup of every entry, in kind and list order.
  const ops = [];
  try {
    for (const kind of HOMEBREW_KINDS) for (const e of data[kind] ?? []) for (const [target, make] of HOMEBREW_LOOKUPS[kind]) ops.push([target, e.id, deepFreeze(make(e))]);
  } catch (err) { return { ok: false, problems: [`pack: an entry could not be built (${err.message})`] }; }
  const pack = Object.freeze({ id, version: data.pack.version ?? 1, name: data.pack.name, ids: Object.freeze(HOMEBREW_KINDS.flatMap((k) => (data[k] ?? []).map((e) => e.id))) });
  LOADED.set(pack, ops);
  return { ok: true, pack };
}

// ---------- a table's overlay ----------
const OVERLAYS = new WeakMap();              // an overlay -> { ops, ids: Set }
let active = null;                            // the overlay installed now, if any

// The overlay for a table's packs: loaded packs (from `loadPack`), or pack documents, which are loaded here
// (and throw PackError if refused). Packs are put in order of their ids, so two callers holding the same packs
// in another order build the same lookups in the same key order. Throws PackError on two packs of one id or an
// id that is already in the lookups (an SRD id).
export function overlayOf(packs = []) {
  if (!Array.isArray(packs)) throw new PackError(['packs: must be a list']);
  const loaded = packs.map((p) => {
    if (LOADED.has(p)) return p;
    const r = loadPack(p);
    if (!r.ok) throw new PackError(r.problems);
    return r.pack;
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const problems = [], ids = new Set(), ops = [];
  const mine = active ? OVERLAYS.get(active).ids : null;
  for (let i = 0; i < loaded.length; i++) if (i && loaded[i].id === loaded[i - 1].id) problems.push(`pack: "${loaded[i].id}" is on the table twice`);
  for (const p of loaded) for (const op of LOADED.get(p)) {
    const [target, id] = op;
    if (Object.hasOwn(target, id) && !mine?.has(id)) problems.push(`${id}: is already in the rules`);
    ops.push(op); ids.add(id);
  }
  if (problems.length) throw new PackError([...new Set(problems)]);
  const overlay = Object.freeze({ packs: Object.freeze(loaded.map((p) => p.id)) });
  OVERLAYS.set(overlay, { ops, ids });
  return overlay;
}

// The overlay installed now, or null. For tests and assertions; the engine never needs it.
export const installed = () => active;

const ASYNC = new Set(['AsyncFunction', 'AsyncGeneratorFunction', 'GeneratorFunction']);
const thenable = (x) => x !== null && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function';

// Runs `fn()` with the overlay's ids in the lookups, and returns what it returns. Every id is taken out again
// however `fn` ends (a throw included). Refuses (throws, changing nothing): something that is not an overlay; an
// async or generator `fn`; a different overlay while one is installed; an id that is already in a lookup. If `fn`
// returns a promise, the ids are taken out and `using` throws: the rest of an async call would run without them.
export function using(overlay, fn) {
  const o = OVERLAYS.get(overlay);
  if (!o) throw new TypeError('using: not an overlay (make one with overlayOf)');
  if (typeof fn !== 'function' || ASYNC.has(fn.constructor?.name)) throw new TypeError('using: fn must be a plain synchronous function');
  if (active === overlay) return settle(fn());                                     // re-entered: already installed
  if (active) throw new Error("using: another table's homebrew is installed; overlays do not nest");
  for (const [target, id] of o.ops) if (Object.hasOwn(target, id)) throw new Error(`using: "${id}" is already in the rules`);
  const targets = [...new Set(o.ops.map(([t]) => t))], sizes = targets.map((t) => Object.keys(t).length);
  let result, i = 0;
  active = overlay;
  try {
    for (; i < o.ops.length; i++) { const [target, id, value] = o.ops[i]; target[id] = value; }
    result = fn();
  } finally {
    for (let j = i - 1; j >= 0; j--) delete o.ops[j][0][o.ops[j][1]];
    active = null;
  }
  if (targets.some((t, k) => Object.keys(t).length !== sizes[k])) throw new Error('using: the content lookups were changed during the call');
  return settle(result);
}
function settle(result) {
  if (thenable(result)) {
    Promise.resolve(result).catch(() => {});                                       // refused, not left unhandled
    throw new TypeError('using: fn returned a promise; homebrew is installed for synchronous calls only');
  }
  return result;
}
