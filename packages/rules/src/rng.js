// Seeded dice. The generator state lives in game state, so every game is replayable.
export function rand(state) {
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
  return { total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + bonus), rolls, bonus };
}
