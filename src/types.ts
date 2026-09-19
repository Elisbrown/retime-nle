export type ExportFormat = "fcpxml" | "premiere" | "otio";

export type Clip = {
  src: string;
  from: number;
  durationInFrames: number;
  name?: string;
  /** Offset into the source asset, in frames. Defaults to 0. */
  startFrom?: number;
};

export type TimelineManifest = {
  fps: number;
  clips: Clip[];
  compositionId?: string;
  /** Frame width for the FCPXML <format> resource. Defaults to 1920. */
  width?: number;
  /** Frame height for the FCPXML <format> resource. Defaults to 1080. */
  height?: number;
};
