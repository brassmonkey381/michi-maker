/**
 * A SMALL SEEDED RANDOM SOURCE for the planners.
 *
 * Variety without chaos: a story binder built from seed "abc" comes out the same every time, and
 * one built from seed "abd" comes out different. That is what lets a seeded shelf of binders each
 * have its own cover arrangement and page rhythm, while a rebuild reproduces exactly the binder it
 * replaces. mulberry32: tiny, fast, and good enough for picking layouts. Not for anything secret.
 *
 * Pure and dependency-free so `node --test` can exercise it.
 */
export interface SeededRandom {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [0, n). n <= 0 gives 0. */
  int(n: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** One of the items; undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined;
  /** True with probability p (default one half). */
  chance(p?: number): boolean;
}

/** Fold any string or number into a 32-bit seed (FNV-1a). */
export function seedOf(input: string | number): number {
  const s = typeof input === 'number' ? String(input) : input;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededRandom(seed: string | number): SeededRandom {
  let a = seedOf(seed) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => (n <= 0 ? 0 : Math.floor(next() * n)),
    range: (lo, hi) => lo + (hi - lo) * next(),
    pick: (items) => (items.length ? items[Math.floor(next() * items.length)] : undefined),
    chance: (p = 0.5) => next() < p,
  };
}
