export type ExportFormat = "fcpxml" | "premiere" | "otio";

export type Clip = {
  /**
   * Where the media lives. Anything a Remotion project produces works:
   * `staticFile()` output ("/footage/intro.mp4"), a Studio URL
   * ("http://localhost:3000/static-abc/intro.mp4"), a path relative to the
   * manifest, or an absolute path.
   */
  src: string;
  /** Start on the timeline, in frames. */
  from: number;
  durationInFrames: number;
  name?: string;
  /** Offset into the source asset, in frames. Defaults to 0. */
  startFrom?: number;
  /**
   * Lane/track hint. 0 is the primary storyline, positive numbers stack above
   * it, negative numbers below (audio). Omit to have overlaps laid out
   * automatically.
   */
  lane?: number;
};

export type TimelineManifest = {
  fps: number;
  clips: Clip[];
  compositionId?: string;
  /** Sequence width. Defaults to the first video asset's real width, else 1920. */
  width?: number;
  /** Sequence height. Defaults to the first video asset's real height, else 1080. */
  height?: number;
  /** Directory relative clip srcs resolve against. Defaults to the manifest's folder. */
  assetRoot?: string;
  /** Remotion `public/` directory, for `staticFile()` srcs. */
  publicDir?: string;
};

/**
 * How assets are referenced by the exported timeline.
 *
 * - `link` — reference every file where it already is, by absolute path.
 * - `copy` — copy every file next to the export and reference it relatively,
 *   so the export folder is self-contained and portable.
 * - `auto` — copy anything under the size threshold, link the heavy ones.
 */
export type AssetMode = "link" | "copy" | "auto";
