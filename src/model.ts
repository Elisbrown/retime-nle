import type {
  Animated,
  CaptionElement,
  ClipAdjustments,
  MarkerElement,
  Point,
  TitleElement,
  TransitionElement,
} from "./elements";
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
  gainDb?: Animated<number>;
  opacity?: Animated<number>;
  position?: Animated<Point>;
  scale?: Animated<number>;
  role?: ClipAdjustments["role"];
  markers?: MarkerElement[];
};

/** A text block, resolved to a lane and a style id. */
export type PreparedTitle = TitleElement & {
  id: string;
  name: string;
  styleId: string;
  lane: number;
};

export type PreparedCaption = CaptionElement & {
  id: string;
  styleId: string;
  language: string;
  lane: number;
};

export type PreparedTransition = TransitionElement & { id: string };

/** Generator/transition resources the timeline references. */
export type PreparedEffect = {
  id: string;
  name: string;
  uid: string;
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
  titles: PreparedTitle[];
  captions: PreparedCaption[];
  markers: MarkerElement[];
  transitions: PreparedTransition[];
  effects: PreparedEffect[];
  titleEffectId?: string;
  transitionEffectId?: string;
  /** FCPXML document version. FCP refuses anything newer than it supports. */
  fcpxmlVersion: string;
  warnings: string[];
};
