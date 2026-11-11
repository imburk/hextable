/**
 * Seeded random numbers. The rules engine never calls Math.random: every roll
 * comes from an Rng so a session can be replayed exactly from its seed.
 */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
}

/** mulberry32: small, fast, and good enough for dice. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Roll one die with the given number of sides: an integer from 1 to sides. */
export function rollDie(rng: Rng, sides: number): number {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`A die needs a whole number of sides, got ${sides}`);
  }
  return Math.floor(rng.next() * sides) + 1;
}
