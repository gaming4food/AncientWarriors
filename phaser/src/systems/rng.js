// systems/rng.js — deterministic RNG utilities. Engine-independent.
// Unity port: a small Rng class wrapping System.Random or a xorshift.

export function createRng(seed = Date.now() >>> 0) {
  let s = seed >>> 0;
  const next = () => {
    // xorshift32 — identical results reproducible in C#
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    float: next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted(weights) {           // weights: array of numbers, returns index
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
      return weights.length - 1;
    },
  };
}
