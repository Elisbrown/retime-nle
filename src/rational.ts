/** Exact rational time math. FCPXML rejects times that are not multiples of the frame duration. */

export type Rational = { n: number; d: number };

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
};

export const reduce = ({ n, d }: Rational): Rational => {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};

/** Common NTSC rates, keyed by their decimal approximation. */
const NTSC: Array<[number, Rational]> = [
  [23.976, { n: 1001, d: 24000 }],
  [29.97, { n: 1001, d: 30000 }],
  [47.952, { n: 1001, d: 48000 }],
  [59.94, { n: 1001, d: 60000 }],
  [119.88, { n: 1001, d: 120000 }],
];

/**
 * Duration of one frame, in seconds, as an exact rational.
 * Integer rates use FCP's own convention (30fps -> 100/3000s).
 */
export const frameDurationOf = (fps: number): Rational => {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid fps: ${fps}`);
  for (const [approx, r] of NTSC) {
    if (Math.abs(fps - approx) < 0.01) return r;
  }
  if (Number.isInteger(fps)) return { n: 100, d: fps * 100 };
  // Fall back to a best rational approximation (continued fractions).
  let [h1, h2, k1, k2] = [1, 0, 0, 1];
  let x = fps;
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(x);
    [h1, h2] = [a * h1 + h2, h1];
    [k1, k2] = [a * k1 + k2, k1];
    if (Math.abs(h1 / k1 - fps) < 1e-9 || k1 > 1e6) break;
    const frac = x - a;
    if (frac < 1e-9) break;
    x = 1 / frac;
  }
  return { n: k1, d: h1 };
};

/** True fps as a rational (inverse of the frame duration). */
export const fpsRationalOf = (fps: number): Rational => {
  const fd = frameDurationOf(fps);
  return { n: fd.d, d: fd.n };
};

/** FCPXML time string for a frame count, e.g. "5s" or "1001/30000s". */
export const timeString = (frames: number, fd: Rational): string => {
  if (!Number.isFinite(frames)) throw new Error(`Invalid frame count: ${frames}`);
  const { n, d } = reduce({ n: Math.round(frames) * fd.n, d: fd.d });
  return d === 1 ? `${n}s` : `${n}/${d}s`;
};

/** FCPXML frameDuration string, kept unreduced to match FCP's own output. */
export const frameDurationString = (fd: Rational): string => `${fd.n}/${fd.d}s`;

/** Seconds -> frames, rounded to the nearest frame. */
export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.max(0, Math.round(seconds * fps));

/** Premiere's <rate> pair: an integer timebase plus an NTSC flag. */
export const premiereRate = (fps: number): { timebase: number; ntsc: boolean } => {
  for (const [approx] of NTSC) {
    if (Math.abs(fps - approx) < 0.01) return { timebase: Math.round(approx), ntsc: true };
  }
  return { timebase: Math.round(fps), ntsc: false };
};
