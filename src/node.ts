import * as fs from "node:fs";
import * as path from "node:path";
import { serializeTimeline } from "./export";
import type { PreparedTimeline } from "./model";
import { prepareTimeline } from "./prepare";
import type { PrepareOptions } from "./prepare";
import { extensionFor } from "./export";
import { toSrt } from "./elements";
import type { Clip, ExportFormat, TimelineInput } from "./types";

export type ExportProjectOptions = PrepareOptions & {
  format?: ExportFormat;
  /** Throw instead of warning when an asset cannot be found. */
  strict?: boolean;
  /**
   * Write captions as a `.srt` next to the export. Defaults to true whenever
   * the timeline has captions — Premiere and Resolve import SRT reliably,
   * while only FCPXML carries captions inline.
   */
  srt?: boolean;
};

export type ExportProjectResult = {
  text: string;
  outPath?: string;
  timeline: PreparedTimeline;
  warnings: string[];
  missing: string[];
  copied: Array<{ from: string; to: string }>;
  /** Path of the .srt sidecar, when one was written. */
  srtPath?: string;
};

/**
 * Resolve every asset, read its real properties, optionally copy files next to
 * the export, and serialize the timeline. Writes the file when `outPath` is set.
 */
export const exportProject = (
  input: Clip[] | TimelineInput,
  fps: number,
  options: ExportProjectOptions = {},
): ExportProjectResult => {
  const format = options.format ?? "fcpxml";
  const timeline = prepareTimeline(input, fps, options);
  const missing = timeline.assets
    .filter((a) => a.kind !== "remote" && !a.exists)
    .map((a) => a.absPath ?? a.url);
  if (options.strict && missing.length > 0) {
    throw new Error(`Missing asset files:\n  ${missing.join("\n  ")}`);
  }
  const text = serializeTimeline(timeline, format);
  let srtPath: string | undefined;
  if (options.outPath) {
    const resolved = path.resolve(options.outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, text, "utf8");
    if (timeline.captions.length > 0 && options.srt !== false) {
      srtPath = path.join(
        path.dirname(resolved),
        `${path.basename(resolved, path.extname(resolved))}.srt`,
      );
      fs.writeFileSync(srtPath, toSrt(timeline.captions, fps), "utf8");
    }
  }
  return {
    text,
    outPath: options.outPath ? path.resolve(options.outPath) : undefined,
    timeline,
    warnings: timeline.warnings,
    missing,
    copied: timeline.assets
      .filter((a) => a.copiedTo)
      .map((a) => ({ from: a.url, to: a.copiedTo! })),
    srtPath,
  };
};

export { prepareTimeline, extensionFor };
export type { PrepareOptions };
