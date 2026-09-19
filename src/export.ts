import { toFcpxml, toOtio, toPremiereXml } from "./codecs";
import type { Clip, ExportFormat } from "./types";

export const validateTimeline = (clips: Clip[], fps: number): void => {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Invalid fps: ${fps}`);
  }
  for (const [i, c] of clips.entries()) {
    if (!c.src) throw new Error(`Clip ${i}: missing src`);
    if (!Number.isInteger(c.from) || c.from < 0) {
      throw new Error(`Clip ${i}: invalid from=${c.from}`);
    }
    if (!Number.isInteger(c.durationInFrames) || c.durationInFrames <= 0) {
      throw new Error(`Clip ${i}: invalid durationInFrames=${c.durationInFrames}`);
    }
  }
};

export const exportTimeline = (
  clips: Clip[],
  fps: number,
  format: ExportFormat,
  compositionId = "retime-timeline",
): string => {
  validateTimeline(clips, fps);
  if (format === "otio") return toOtio(clips, fps, compositionId);
  if (format === "premiere") return toPremiereXml(clips, fps, compositionId);
  return toFcpxml(clips, fps, compositionId);
};

export const extensionFor = (format: ExportFormat): string =>
  format === "premiere" ? "xml" : format === "otio" ? "otio" : "fcpxml";

export const mimeFor = (format: ExportFormat): string =>
  format === "otio" ? "application/json" : "application/xml";
