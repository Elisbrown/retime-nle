import type { Clip } from "../src/types";

/** Single source of truth: import in both your composition and your export call. */
export const clips: Clip[] = [
  { src: "/footage/intro.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "/footage/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
  { src: "/footage/outro.mp4", from: 240, durationInFrames: 60, name: "Outro" },
];

export const fps = 30;
export const compositionId = "demo-timeline";
