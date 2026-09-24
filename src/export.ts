import { toFcpxml, toOtio, toPremiereXml } from "./codecs";
import { hashString, packLanes, uuidFrom, validateTimeline } from "./layout";
import type { PreparedAsset, PreparedClip, PreparedFormat, PreparedTimeline } from "./model";
import { guessFromExtension, isImage } from "./probe";
import { prepareElements } from "./prepare-elements";
import type { Clip, ExportFormat, TimelineInput } from "./types";

export { validateTimeline };

export type TimelineOptions = {
  /** Sequence width. Defaults to 1920. */
  width?: number;
  /** Sequence height. Defaults to 1080. */
  height?: number;
  /** FCPXML document version: "1.9" for FCP 10.4.9+, "1.10" (default) for 10.6+. */
  fcpxmlVersion?: string;
  /** Override the Motion template titles reference. */
  titleEffectUid?: string;
  /** BCP-47 tag for captions that do not carry one. Defaults to "en". */
  captionLanguage?: string;
};

/**
 * Build a timeline from clips exactly as given — no filesystem access.
 *
 * Used in the browser and as the base for the Node path. Srcs are written out
 * unchanged, so pass URLs an NLE can actually open (absolute `file://` URLs,
 * or paths relative to where the export will be saved). In Node, prefer
 * `exportProject()`, which resolves and checks them for you.
 */
export const buildTimeline = (
  input: Clip[] | TimelineInput,
  fps: number,
  compositionId = "retime-timeline",
  options: TimelineOptions = {},
): PreparedTimeline => {
  const timelineInput: TimelineInput = Array.isArray(input) ? { clips: input } : input;
  const clips = timelineInput.clips;
  validateTimeline(clips, fps);
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;

  const neededFrames = new Map<string, number>();
  const order: string[] = [];
  for (const c of clips) {
    const needed = (c.startFrom ?? 0) + c.durationInFrames;
    neededFrames.set(c.src, Math.max(neededFrames.get(c.src) ?? 0, needed));
    if (!order.includes(c.src)) order.push(c.src);
  }

  const sequenceFormat: PreparedFormat = {
    id: "r1",
    name: `FFVideoFormat${height}p${Number.isInteger(fps) ? fps : fps.toFixed(2)}`,
    width,
    height,
  };
  const formats: PreparedFormat[] = [sequenceFormat];
  let nextId = 2;

  const assets = order.map((src): PreparedAsset => {
    const guess = guessFromExtension(src);
    const image = isImage(src);
    const name = (src.split(/[\\/]/).pop() ?? src).replace(/\.[^.]+$/, "");
    return {
      id: "",
      formatId: sequenceFormat.id,
      name,
      url: src,
      uid: uuidFrom(hashString(src)),
      kind: /^https?:/i.test(src) ? "remote" : "file",
      exists: false,
      durationFrames: neededFrames.get(src) ?? 1,
      width,
      height,
      hasVideo: guess.hasVideo,
      hasAudio: guess.hasAudio,
      audioChannels: guess.hasAudio ? 2 : 0,
      audioRate: guess.hasAudio ? 48000 : 0,
      isImage: image,
    };
  });
  for (const a of assets) a.id = `r${nextId++}`;

  const bySrc = new Map(order.map((src, i) => [src, assets[i]]));
  const prepared: PreparedClip[] = clips.map((c, i) => ({
    asset: bySrc.get(c.src)!,
    name: c.name ?? `Clip ${i + 1}`,
    from: c.from,
    durationInFrames: c.durationInFrames,
    startFrom: c.startFrom ?? 0,
    lane: c.lane ?? Number.NaN,
    gainDb: c.gainDb,
    opacity: c.opacity,
    position: c.position,
    scale: c.scale,
    role: c.role,
    markers: c.markers,
  }));
  const autoVideo = prepared.filter((c) => Number.isNaN(c.lane) && c.asset.hasVideo);
  const autoAudio = prepared.filter((c) => Number.isNaN(c.lane) && !c.asset.hasVideo);
  packLanes(autoVideo, 1, 0).forEach((lane, i) => {
    autoVideo[i].lane = lane;
  });
  packLanes(autoAudio, -1, -1).forEach((lane, i) => {
    autoAudio[i].lane = lane;
  });
  prepared.sort((a, b) => a.from - b.from || a.lane - b.lane);

  const topVideoLane = prepared.reduce((m, c) => Math.max(m, c.lane), 0);
  const elements = prepareElements(timelineInput, options, topVideoLane, () => `r${nextId++}`);
  const ends = [
    ...prepared.map((c) => c.from + c.durationInFrames),
    ...elements.titles.map((t) => t.from + t.durationInFrames),
    ...elements.captions.map((c) => c.from + c.durationInFrames),
  ];

  return {
    name: compositionId,
    fps,
    width,
    height,
    totalFrames: ends.reduce((m, e) => Math.max(m, e), 0),
    formats,
    sequenceFormatId: sequenceFormat.id,
    assets,
    clips: prepared,
    ...elements,
    fcpxmlVersion: options.fcpxmlVersion ?? "1.10",
    warnings: [],
  };
};

export const serializeTimeline = (
  timeline: PreparedTimeline,
  format: ExportFormat,
): string => {
  if (format === "otio") return toOtio(timeline);
  if (format === "premiere") return toPremiereXml(timeline);
  return toFcpxml(timeline);
};

/** Serialize clips straight to an NLE format, without touching the filesystem. */
export const exportTimeline = (
  clips: Clip[] | TimelineInput,
  fps: number,
  format: ExportFormat,
  compositionId = "retime-timeline",
  options: TimelineOptions = {},
): string => serializeTimeline(buildTimeline(clips, fps, compositionId, options), format);

export const extensionFor = (format: ExportFormat): string =>
  format === "premiere" ? "xml" : format === "otio" ? "otio" : "fcpxml";

export const mimeFor = (format: ExportFormat): string =>
  format === "otio" ? "application/json" : "application/xml";
