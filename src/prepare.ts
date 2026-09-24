import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PreparedAsset, PreparedClip, PreparedFormat, PreparedTimeline } from "./model";
import { resolveSrc, toFileUrl, toRelativeUrl, uniqueTarget } from "./paths";
import { guessFromExtension, isImage, probeMedia } from "./probe";
import { packLanes, validateTimeline } from "./layout";
import { secondsToFrames } from "./rational";
import type { AssetMode, Clip } from "./types";

export { validateTimeline };

export type PrepareOptions = {
  compositionId?: string;
  width?: number;
  height?: number;
  assetRoot?: string;
  publicDir?: string;
  pathMap?: Array<[string, string]>;
  /** Defaults to "link". */
  assets?: AssetMode;
  /** Where copies go. Defaults to `<out basename>_assets` next to the export. */
  assetsDir?: string;
  /** "auto" copies files at or below this size. Defaults to 100 MB. */
  maxCopyBytes?: number;
  /** Destination of the export, used for relative URLs and the default assets dir. */
  outPath?: string;
  /** Read real media properties with ffprobe. Defaults to true. */
  probe?: boolean;
  /** FCPXML document version: "1.9" for FCP 10.4.9+, "1.10" (default) for 10.6+. */
  fcpxmlVersion?: string;
};

export const DEFAULT_MAX_COPY_BYTES = 100 * 1024 * 1024;

/**
 * FCP matches `FFVideoFormat…` names against its own presets, so only use one
 * for a size it actually knows. Vertical and odd sizes stay unnamed.
 */
const STANDARD_SIZES = new Map<string, string>([
  ["1920x1080", "1080"],
  ["1280x720", "720"],
  ["3840x2160", "2160"],
  ["4096x2160", "2160"],
  ["720x576", "576"],
  ["720x480", "480"],
]);

const formatName = (width: number, height: number, fps: number): string => {
  const key = STANDARD_SIZES.get(`${width}x${height}`);
  if (!key) return "";
  const rate = Number.isInteger(fps) ? String(fps) : fps.toFixed(2).replace(".", "");
  return `FFVideoFormat${key}p${rate}`;
};

/** Stable, lowercase uid. FCP reserves all-uppercase-hex strings for itself. */
const uidFor = (key: string): string => {
  const h = crypto.createHash("md5").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/**
 * Resolve every clip source to a real location, read its media properties, and
 * lay the clips out into lanes. When `assets` is "copy" or "auto" this also
 * copies files next to the export.
 */
export const prepareTimeline = (
  clips: Clip[],
  fps: number,
  opts: PrepareOptions = {},
): PreparedTimeline => {
  validateTimeline(clips, fps);
  const warnings: string[] = [];
  const mode: AssetMode = opts.assets ?? "link";
  const maxCopyBytes = opts.maxCopyBytes ?? DEFAULT_MAX_COPY_BYTES;
  const outDir = opts.outPath ? path.dirname(path.resolve(opts.outPath)) : process.cwd();
  const assetsDir =
    opts.assetsDir ??
    (opts.outPath
      ? path.join(
          outDir,
          `${path.basename(opts.outPath, path.extname(opts.outPath))}_assets`,
        )
      : path.join(outDir, "assets"));

  // Longest read from each source, so an asset is never shorter than its clips.
  const neededFrames = new Map<string, number>();
  for (const c of clips) {
    const needed = (c.startFrom ?? 0) + c.durationInFrames;
    neededFrames.set(c.src, Math.max(neededFrames.get(c.src) ?? 0, needed));
  }

  const order: string[] = [];
  for (const c of clips) if (!order.includes(c.src)) order.push(c.src);

  const taken = new Set<string>();
  const assetsBySrc = new Map<string, PreparedAsset>();
  const formats: PreparedFormat[] = [];
  let nextId = 1;
  const idOf = () => `r${nextId++}`;

  // r1 is always the sequence format; asset formats follow.
  const sequenceFormat: PreparedFormat = {
    id: idOf(),
    name: "retime-sequence",
    width: opts.width ?? 0,
    height: opts.height ?? 0,
  };
  formats.push(sequenceFormat);

  const formatFor = (width: number, height: number): string => {
    const hit = formats.find((f) => f.width === width && f.height === height);
    if (hit) return hit.id;
    const f: PreparedFormat = { id: idOf(), name: formatName(width, height, fps), width, height };
    formats.push(f);
    return f.id;
  };

  for (const src of order) {
    const resolved = resolveSrc(src, {
      assetRoot: opts.assetRoot,
      publicDir: opts.publicDir,
      pathMap: opts.pathMap,
    });

    const probed =
      opts.probe !== false && resolved.exists && resolved.localPath
        ? probeMedia(resolved.localPath)
        : null;
    const guess = guessFromExtension(src);
    const image = isImage(src);

    if (resolved.kind === "unresolved") {
      warnings.push(`${src}: ${resolved.reason ?? "could not be resolved"}`);
    } else if (!resolved.exists && resolved.kind === "file") {
      warnings.push(
        `${src}: no file found — the timeline will point at ${resolved.absPath} and import offline`,
      );
    } else if (opts.probe !== false && !probed && resolved.kind === "file") {
      warnings.push(`${src}: could not read media properties (is ffprobe installed?)`);
    }

    let absPath = resolved.absPath;
    let localPath = resolved.localPath;
    let copiedTo: string | undefined;
    const bytes = resolved.bytes;
    const shouldCopy =
      resolved.kind === "file" &&
      resolved.exists &&
      (mode === "copy" || (mode === "auto" && (bytes ?? 0) <= maxCopyBytes));

    if (shouldCopy && localPath) {
      try {
        fs.mkdirSync(assetsDir, { recursive: true });
        const target = path.join(
          assetsDir,
          uniqueTarget(assetsDir, path.basename(localPath), taken),
        );
        fs.copyFileSync(localPath, target);
        copiedTo = target;
        localPath = target;
        absPath = target;
      } catch (err) {
        warnings.push(`${src}: copy failed (${(err as Error).message}); linking in place instead`);
      }
    } else if (mode === "auto" && resolved.kind === "file" && resolved.exists) {
      warnings.push(
        `${src}: ${(bytes ?? 0) > maxCopyBytes ? "over the copy threshold" : "not copied"} — linked at ${absPath}`,
      );
    }

    const width = probed?.width ?? opts.width ?? 1920;
    const height = probed?.height ?? opts.height ?? 1080;
    const needed = neededFrames.get(src) ?? 1;
    const probedFrames = probed?.durationSeconds
      ? secondsToFrames(probed.durationSeconds, fps)
      : 0;
    const durationFrames = Math.max(probedFrames, needed);
    if (probedFrames && probedFrames < needed) {
      warnings.push(
        `${src}: clips read up to frame ${needed} but the file is only ${probedFrames} frames long`,
      );
    }

    const url =
      resolved.kind === "remote"
        ? src
        : absPath
          ? toFileUrl(absPath)
          : src;
    const relUrl =
      resolved.kind === "file" &&
      absPath &&
      opts.outPath &&
      (copiedTo || absPath.startsWith(`${outDir}${path.sep}`))
        ? toRelativeUrl(outDir, absPath)
        : undefined;

    const hasVideo = probed ? probed.hasVideo : guess.hasVideo;
    const hasAudio = probed ? probed.hasAudio : guess.hasAudio;

    const asset: PreparedAsset = {
      id: "",
      formatId: "",
      name: path.basename(localPath ?? absPath ?? src).replace(/\.[^.]+$/, "") || src,
      url,
      relUrl,
      uid: uidFor(resolved.localPath ?? resolved.absPath ?? src),
      absPath,
      kind: resolved.kind,
      exists: resolved.exists,
      durationFrames,
      width,
      height,
      hasVideo,
      hasAudio,
      audioChannels: probed?.audioChannels ?? (hasAudio ? 2 : 0),
      audioRate: probed?.audioRate ?? (hasAudio ? 48000 : 0),
      isImage: image,
      bytes,
      copiedTo,
      note: resolved.reason,
    };
    assetsBySrc.set(src, asset);
  }

  // Sequence dimensions: explicit, else the first real video asset, else 1080p.
  const firstVideo = order
    .map((s) => assetsBySrc.get(s)!)
    .find((a) => a.hasVideo && a.width && a.height);
  sequenceFormat.width = opts.width ?? firstVideo?.width ?? 1920;
  sequenceFormat.height = opts.height ?? firstVideo?.height ?? 1080;
  sequenceFormat.name = formatName(sequenceFormat.width, sequenceFormat.height, fps);

  // Assign resource ids after the formats they reference.
  for (const src of order) {
    const a = assetsBySrc.get(src)!;
    a.formatId = a.hasVideo ? formatFor(a.width, a.height) : sequenceFormat.id;
  }
  for (const src of order) {
    assetsBySrc.get(src)!.id = idOf();
  }

  // Lanes: explicit hints win; the rest are packed so nothing overlaps in a lane.
  const prepared: PreparedClip[] = clips.map((c, i) => ({
    asset: assetsBySrc.get(c.src)!,
    name: c.name ?? `Clip ${i + 1}`,
    from: c.from,
    durationInFrames: c.durationInFrames,
    startFrom: c.startFrom ?? 0,
    lane: c.lane ?? Number.NaN,
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

  const totalFrames = prepared.reduce((m, c) => Math.max(m, c.from + c.durationInFrames), 0);

  return {
    name: opts.compositionId ?? "retime-timeline",
    fps,
    width: sequenceFormat.width,
    height: sequenceFormat.height,
    totalFrames,
    formats,
    sequenceFormatId: sequenceFormat.id,
    assets: order.map((s) => assetsBySrc.get(s)!),
    clips: prepared,
    fcpxmlVersion: opts.fcpxmlVersion ?? "1.10",
    warnings,
  };
};
