/**
 * Seeded PRNG (Mulberry32) + Box-Muller standard-normal generator.
 * Small, fast, and reproducible — ideal for Monte Carlo simulations in the browser.
 */

export type RandomFn = () => number;
export type NormalFn = () => number;

export function mulberry32(seed: number): RandomFn {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform — returns a function that produces standard normal variates
 * (mean 0, std 1) from the given uniform PRNG. Caches the second variate for efficiency.
 */
export function makeNormal(rand: RandomFn): NormalFn {
  let spare: number | null = null;
  return function () {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = 0;
    let u2 = 0;
    // Avoid log(0)
    while (u1 === 0) u1 = rand();
    while (u2 === 0) u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    spare = z1;
    return z0;
  };
}
