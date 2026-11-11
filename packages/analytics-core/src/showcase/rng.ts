// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Small helpers over a seeded generator (mulberry32 only; no unseeded randomness, no clock reads).

export interface Rand {
  next: () => number;
  /** floor(x + u): unbiased integer rounding of a non-negative expectation. */
  stochastic: (x: number) => number;
  /** 1 +/- spread, uniform. */
  noise: (spread: number) => number;
  poisson: (lambda: number) => number;
  weighted: <T>(items: readonly T[], weights: readonly number[]) => T;
  int: (min: number, max: number) => number;
  chance: (p: number) => boolean;
}

export function makeRand(next: () => number): Rand {
  const stochastic = (x: number): number => Math.floor(Math.max(0, x) + next());
  const noise = (spread: number): number => 1 - spread + 2 * spread * next();
  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= next();
    } while (p > limit);
    return k - 1;
  };
  const weighted = <T>(items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const chance = (p: number): boolean => next() < p;
  return { next, stochastic, noise, poisson, weighted, int, chance };
}
