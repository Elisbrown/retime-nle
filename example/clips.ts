import type { Clip } from "../src/types";

/** Single source of truth: import in both your composition and your export call. */
export const clips: Clip[] = [
  { src: "static/intro.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "static/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
  { src: "static/outro.mp4", from: 240, durationInFrames: 60, name: "Outro" },
];

export const fps = 30;
export const compositionId = "demo-timeline";
