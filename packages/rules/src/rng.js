// Seeded dice. The generator state lives in game state, so every game is replayable.
//
// Two kinds of `rng` (docs/specs/hidden-information.md, section 7):
// - `{ key, n }`: a 256-bit key (64 hex digits) and a counter. Roll n is word n mod 16 of ChaCha20
//   block floor(n / 16) (RFC 8439, nonce zero). Seeing rolls tells nothing of the key or of other
//   rolls. The key is made by the host (the table server), never by the rules, and is never sent
//   to a player.
// - an integer: Mulberry32, as every game before state version 16 rolled. Kept so that old games
//   and tests replay exactly; it has 32 bits of state and can be worked out from what it rolls,
//   so the server re-keys a table that still has one.
const MASK = 0xffffffff;
const KEY_HEX = /^[0-9a-f]{64}$/;
const rotl = (x, n) => (x << n) | (x >>> (32 - n));
function quarter(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) | 0; x[d] = rotl(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) | 0; x[b] = rotl(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) | 0; x[d] = rotl(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) | 0; x[b] = rotl(x[b] ^ x[c], 7);
}
const keyWords = (hex) => Array.from({ length: 8 }, (_, i) => {
  const b = (j) => parseInt(hex.substr(i * 8 + j * 2, 2), 16);
  return (b(0) | (b(1) << 8) | (b(2) << 16) | (b(3) << 24)) >>> 0;
});
// The ChaCha20 block function: 16 words (unsigned 32-bit) for this key, block counter and nonce.
export function chachaBlock(hex, counter, nonce = [0, 0, 0]) {
  const init = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...keyWords(hex), counter >>> 0, ...nonce.map((w) => w >>> 0)];
  const x = init.slice();
  for (let i = 0; i < 10; i++) {
    quarter(x, 0, 4, 8, 12); quarter(x, 1, 5, 9, 13); quarter(x, 2, 6, 10, 14); quarter(x, 3, 7, 11, 15);
    quarter(x, 0, 5, 10, 15); quarter(x, 1, 6, 11, 12); quarter(x, 2, 7, 8, 13); quarter(x, 3, 4, 9, 14);
  }
  return x.map((w, i) => ((w + init[i]) & MASK) >>> 0);
}
// A fresh keyed rng, from 64 hex digits the host made (crypto.randomBytes(32)).
export function keyedRng(hex) {
  if (typeof hex !== 'string' || !KEY_HEX.test(hex)) throw new Error('A dice key is 64 hex digits.');
  return { key: hex, n: 0 };
}
export const isKeyed = (rng) => !!rng && typeof rng === 'object' && typeof rng.key === 'string' && KEY_HEX.test(rng.key) && Number.isSafeInteger(rng.n) && rng.n >= 0;
// The last block made, so that sixteen rolls in a row make one block. Only a cache: the output
// depends on nothing but the key and the counter.
let last = { key: null, block: -1, words: null };
function keyed(rng) {
  const block = Math.floor(rng.n / 16);
  if (last.key !== rng.key || last.block !== block) {
    // Past 2^32 blocks the rest of the counter goes in the first nonce word.
    last = { key: rng.key, block, words: chachaBlock(rng.key, block % 4294967296, [Math.floor(block / 4294967296), 0, 0]) };
  }
  const w = last.words[rng.n % 16];
  rng.n++;
  return w / 4294967296;
}

export function rand(state) {
  if (isKeyed(state.rng)) return keyed(state.rng);
  // A state with no seed is a player's view of the game, not the game. Rolling on one
  // would quietly use seed 0 and produce dice that look real, so refuse instead.
  if (!Number.isInteger(state.rng)) throw new Error('This game state has no dice seed; only the full state can roll.');
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const die = (state, sides) => 1 + Math.floor(rand(state) * sides);

// "2d6+3", "1d4", "5". crit doubles the dice, not the modifier (SRD 5.2).
export function roll(state, expr, { crit = false } = {}) {
  const m = /^(?:(\d+)d(\d+))?\s*([+-]?\s*\d+)?$/.exec(String(expr).trim());
  if (!m) throw new Error(`Bad dice expression: ${expr}`);
  const n = (m[1] ? +m[1] : 0) * (crit ? 2 : 1), sides = +m[2] || 0;
  const bonus = m[3] ? +m[3].replace(/\s/g, '') : 0;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(die(state, sides));
  return { total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + bonus), rolls, bonus, dice: rolls.map((value) => ({ sides, value })) };
}

// The faces a roll showed, for its event, so a client can draw the dice (docs/specs/dice.md):
// { dice: [{ sides, value, drop?, neg? }], bonus }. The used faces, negated where `neg`, plus
// `bonus` add up to the number the roll made, before anything clamps, halves or resists it.
// `drop` is the d20 that Advantage or Disadvantage set aside; `neg` a die taken off (Bane).
export const d20Faces = (r1, r2, used) => (r2 === null || r2 === undefined ? [{ sides: 20, value: r1 }]
  : [{ sides: 20, value: r1, ...(used === r1 ? {} : { drop: true }) }, { sides: 20, value: r2, ...(used === r1 ? { drop: true } : {}) }]);
export const negate = (dice) => dice.map((d) => ({ ...d, neg: true }));
// What the used faces add up to.
export const faceSum = (dice = []) => dice.reduce((a, d) => a + (d.drop ? 0 : d.neg ? -d.value : d.value), 0);
