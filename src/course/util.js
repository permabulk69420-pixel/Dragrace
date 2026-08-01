/**
 * Small helpers shared by the course builders.
 *
 * Everything in the world is laid out from a seeded generator, so a given build
 * is byte-for-byte reproducible: the same lamp post ends up in the same place
 * every run, which matters when you are tuning a corner and want the scenery to
 * stay put between reloads.
 */

/** Mulberry32 - tiny, fast, good enough for scattering scenery. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Uniform in [lo, hi). */
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  /** Integer in [lo, hi]. */
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  /** Random element of an array. */
  rng.pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  /** True with probability p. */
  rng.chance = (p) => rng() < p;
  /** Symmetric jitter about zero. */
  rng.jitter = (amount) => (rng() * 2 - 1) * amount;
  return rng;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Wrap a value into [0, range). */
export function wrap(v, range) {
  const m = v % range;
  return m < 0 ? m + range : m;
}

/** Shortest signed difference on a loop of the given length. */
export function loopDelta(from, to, range) {
  let d = wrap(to - from, range);
  if (d > range / 2) d -= range;
  return d;
}
