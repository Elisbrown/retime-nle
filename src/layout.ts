import type { Clip } from "./types";

export const validateTimeline = (clips: Clip[], fps: number): void => {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid fps: ${fps}`);
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error("Timeline has no clips");
  }
  for (const [i, c] of clips.entries()) {
    if (!c || !c.src) throw new Error(`Clip ${i}: missing src`);
    if (!Number.isInteger(c.from) || c.from < 0) {
      throw new Error(`Clip ${i}: invalid from=${c.from}`);
    }
    if (!Number.isInteger(c.durationInFrames) || c.durationInFrames <= 0) {
      throw new Error(`Clip ${i}: invalid durationInFrames=${c.durationInFrames}`);
    }
    if (c.startFrom !== undefined && (!Number.isInteger(c.startFrom) || c.startFrom < 0)) {
      throw new Error(`Clip ${i}: invalid startFrom=${c.startFrom}`);
    }
  }
};

/**
 * Pack clips into lanes so no two clips in a lane overlap.
 * `step` is +1 for video lanes (0, 1, 2…) and -1 for audio (-1, -2…).
 */
export const packLanes = (
  clips: Array<{ from: number; durationInFrames: number }>,
  step: 1 | -1,
  startLane: number,
): number[] => {
  const ends: number[] = [];
  const lanes: number[] = [];
  const order = clips
    .map((c, i) => ({ i, from: c.from, end: c.from + c.durationInFrames }))
    .sort((a, b) => a.from - b.from || a.end - b.end);
  for (const item of order) {
    let slot = ends.findIndex((end) => end <= item.from);
    if (slot === -1) {
      slot = ends.length;
      ends.push(0);
    }
    ends[slot] = item.end;
    lanes[item.i] = startLane + slot * step;
  }
  return lanes;
};

/** Small, dependency-free hash used for uids when node:crypto is unavailable. */
export const hashString = (input: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, "0");
  return `${hex}${hex}`.slice(0, 32);
};

export const uuidFrom = (hex32: string): string =>
  `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
