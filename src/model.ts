import type { SrcKind } from "./paths";

/** An asset after resolution: a real location plus real media properties. */
export type PreparedAsset = {
  id: string;
  formatId: string;
  name: string;
  /** Absolute URL written into the timeline — file:// or remote http(s). */
  url: string;
  /** Relative URL from the export's folder, when the file sits alongside it. */
  relUrl?: string;
  uid: string;
  absPath?: string;
  kind: SrcKind;
  exists: boolean;
  /** Full length of the source media in frames. */
  durationFrames: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number;
  audioRate: number;
  isImage: boolean;
  bytes?: number;
  /** Set when the file was copied next to the export. */
  copiedTo?: string;
  note?: string;
};

export type PreparedClip = {
  asset: PreparedAsset;
  name: string;
  from: number;
  durationInFrames: number;
  startFrom: number;
  /** 0 = primary storyline, >0 above it, <0 below it. */
  lane: number;
};

export type PreparedFormat = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export type PreparedTimeline = {
  name: string;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  formats: PreparedFormat[];
  sequenceFormatId: string;
  assets: PreparedAsset[];
  clips: PreparedClip[];
  /** FCPXML document version. FCP refuses anything newer than it supports. */
  fcpxmlVersion: string;
  warnings: string[];
};
