/**
 * Deterministic pseudo-random numbers.
 *
 * Every scrap of scatter in the course - window lights, crack patterns, crate
 * stacks, tree placement - runs off one of these instead of Math.random, so the
 * city is byte-for-byte the same on every load and on every headset. It also
 * means the headless course test measures the same world the player drives.
 */

/** mulberry32: small, fast, good enough for scenery. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Uniform in [lo, hi). */
  next.range = (lo, hi) => lo + next() * (hi - lo);
  /** Integer in [lo, hi]. */
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  /** True with probability p. */
  next.chance = (p) => next() < p;
  /** One entry of an array. */
  next.pick = (list) => list[Math.floor(next() * list.length)];
  /** Symmetric jitter around zero. */
  next.jitter = (amount) => (next() * 2 - 1) * amount;
  return next;
}

/** Hash a string into a seed, so modules can name their own streams. */
export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
