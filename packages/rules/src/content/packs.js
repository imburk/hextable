// What a game says about the homebrew packs it needs, and how to tell that the packs installed are those
// (docs/specs/homebrew.md, Decision 3 "Where the pack is stored", row H5, task B5; build notes #390).
//
// `state.packs` is a list of `{ id, version, hash }`: ids, versions and hashes only, never pack data. The data lives
// with the table (the server) and is installed through the registry (registry.js). This module is pure, synchronous and
// has no Node-only import: the rules run in the browser too. No I/O, no clock, no randomness.
import { HOMEBREW_LIMITS } from './schema.js';

// The same pattern as a pack id in the registry and the linter (lowercase letters and digits, single hyphens), with the
// length of a name: the id is also the prefix of every id in the pack (`hb-<pack id>-<kebab>`).
const PACK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HASH = /^[0-9a-f]{64}$/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));

// ---------- SHA-256 (FIPS 180-4), in plain JavaScript ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

// The SHA-256 of a string (as its UTF-8 bytes), as 64 lowercase hex letters.
export function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const n = data.length, total = Math.ceil((n + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(data); m[n] = 0x80;
  const view = new DataView(m.buffer);
  view.setUint32(total - 8, Math.floor((n * 8) / 0x100000000));     // the length in bits, as 64 bits, high word first
  view.setUint32(total - 4, (n * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64), rotr = (x, k) => (x >>> k) | (x << (32 - k));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------- the hash of a pack ----------
// The canonical JSON of a value: object keys sorted at every depth (by code unit), no whitespace, lists in their order,
// strings and numbers as `JSON.stringify` writes them. A key whose value is undefined is left out, as JSON leaves it.
// Recursive: it is for a pack that passed the budget (depth 16), and refuses anything that is not plain data.
export function canonical(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new TypeError('canonical: a number JSON cannot hold'); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  if (plain(v)) return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  throw new TypeError('canonical: not plain data');
}

// SHA-256 of the canonical JSON of a pack document, as 64 lowercase hex letters. The same pack in any key order
// has the same hash. The server stores it beside the pack and in `state.packs`.
export const hashOf = (pack) => sha256(canonical(pack));

// ---------- what a state may say ----------
// The sentence a `state.packs` list is refused with, or null when it is whole: a list of at most `HOMEBREW_LIMITS.packs`
// records `{ id, version, hash }` and nothing else, ids in the pack pattern and not repeated, versions whole numbers
// of 1 or more, hashes 64 lowercase hex letters.
export function packsProblem(list) {
  if (!Array.isArray(list)) return 'The packs must be a list.';
  if (list.length > HOMEBREW_LIMITS.packs) return `A table can have at most ${HOMEBREW_LIMITS.packs} packs.`;
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i], at = `Pack ${i + 1}`;
    if (!plain(p)) return `${at} must be a record with an id, a version and a hash.`;
    for (const k of Object.keys(p)) if (!['id', 'version', 'hash'].includes(k)) return `${at} has "${k}": a pack is named by its id, version and hash only.`;
    if (typeof p.id !== 'string' || !PACK_ID.test(p.id) || p.id.length > HOMEBREW_LIMITS.name) return `${at}: the id must be lowercase letters and digits with single hyphens, at most ${HOMEBREW_LIMITS.name} letters.`;
    if (seen.has(p.id)) return `The pack "${p.id}" is listed twice.`;
    seen.add(p.id);
    if (!Number.isInteger(p.version) || p.version < 1) return `The pack "${p.id}": the version must be a whole number of 1 or more.`;
    if (typeof p.hash !== 'string' || !HASH.test(p.hash)) return `The pack "${p.id}": the hash must be 64 lowercase hex letters.`;
  }
  return null;
}

// A clean copy of a list `packsProblem` accepts, in the order given.
export const copyPacks = (list) => list.map((p) => ({ id: p.id, version: p.version, hash: p.hash }));

// Whether the packs installed are exactly the packs a state names. Both are lists of `{ id, version, hash }` (the
// installed ones as the server keeps them, with their data left out). True when ids, versions and hashes all agree;
// otherwise a plain sentence naming the first difference, looking at the state's packs by id first, then at any
// installed pack the state does not name. The order of either list does not matter.
export function packsMatch(statePacks, overlayPacks) {
  const bad = packsProblem(statePacks) ?? packsProblem(overlayPacks);
  if (bad) return `The packs cannot be compared: ${bad}`;
  const byId = (list) => new Map(list.map((p) => [p.id, p]));
  const have = byId(overlayPacks), need = byId(statePacks);
  for (const id of [...need.keys()].sort()) {
    const n = need.get(id), h = have.get(id);
    if (!h) return `The game needs the pack "${id}" (version ${n.version}), which is not installed.`;
    if (h.version !== n.version) return `The game needs version ${n.version} of the pack "${id}", but version ${h.version} is installed.`;
    if (h.hash !== n.hash) return `The pack "${id}" is installed at version ${h.version} but its contents are not the ones the game was played with (the hashes differ).`;
  }
  for (const id of [...have.keys()].sort()) if (!need.has(id)) return `The pack "${id}" is installed, but the game does not name it.`;
  return true;
}

// ---------- what a player is sent of a pack (docs/specs/homebrew.md, Decision 5; moved from the server, #428) ----------
// What a member who is not the DM is sent of a pack: the pack's id, name and version and these lists. Never monsters. A new kind of
// homebrew is withheld from players until it is added here on purpose.
export const PLAYER_PACK_KINDS = ['spells', 'items', 'feats', 'weapons', 'armour', 'objects'];

// One pack as a player may know it: id, name, version, the lists above, and no `dmNotes` at any depth.
function withoutNotes(x) {
  if (Array.isArray(x)) return x.map(withoutNotes);
  if (x === null || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (k !== 'dmNotes') out[k] = withoutNotes(v);
  return out;
}
export function packForPlayer(data) {
  const out = { id: data.pack.id, name: data.pack.name, version: data.pack.version ?? 1 };
  for (const k of PLAYER_PACK_KINDS) out[k] = withoutNotes(data[k] ?? []);
  return out;
}

// The filtered copy of a pack that passed the check, and its hash: `{ data, hash }`. The hash a player is given is the hash of this
// copy, never of the whole pack: a hash of content they are not sent would be a fingerprint of it. Pure; the caller keeps the result.
export function forPlayers(pack) {
  const data = packForPlayer(pack);
  return { data, hash: hashOf(data) };
}

// ---------- a spell that summons a homebrew creature (moved from the server, #428) ----------
export const HOMEBREW_SUMMON_SENTENCE = 'A homebrew spell cannot summon a homebrew creature yet; it can summon creatures from the standard rules.';

// Does any spell of this pack summon a creature that comes from a homebrew pack, at any depth: a `summon` step naming a pack monster,
// or a `forms` list holding one? Until the owner rules on what a player is sent of a summoned homebrew creature, such a pack is refused.
// (A `forms` filter by type and challenge rating is not looked at: DEBT T48.) One iterative walk over the loaded, budgeted document.
export function summonsHomebrew(data) {
  const hb = (x) => typeof x === 'string' && x.startsWith('hb-');
  const stack = (Array.isArray(data?.spells) ? data.spells : []).map((sp) => sp?.effects);
  while (stack.length) {
    const x = stack.pop();
    if (Array.isArray(x)) { for (const y of x) stack.push(y); continue; }
    if (x === null || typeof x !== 'object') continue;
    if (hb(x.summon) || (Array.isArray(x.forms) && x.forms.some(hb))) return true;
    for (const k of Object.keys(x)) stack.push(x[k]);
  }
  return false;
}
