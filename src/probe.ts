import { spawnSync } from "node:child_process";

export type MediaInfo = {
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels?: number;
  audioRate?: number;
  /** Frames per second reported by the container, when it has a video stream. */
  fps?: number;
};

const cache = new Map<string, MediaInfo | null>();
let ffprobeChecked = false;
let ffprobeBin: string | null = null;

/** Locate ffprobe once: $FFPROBE_PATH, then PATH. */
export const ffprobePath = (): string | null => {
  if (ffprobeChecked) return ffprobeBin;
  ffprobeChecked = true;
  const candidates = [process.env.FFPROBE_PATH, "ffprobe"].filter(Boolean) as string[];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
    if (!r.error && r.status === 0) {
      ffprobeBin = bin;
      return ffprobeBin;
    }
  }
  return null;
};

const parseRate = (value: unknown): number | undefined => {
  if (typeof value !== "string") return undefined;
  const [n, d] = value.split("/").map(Number);
  if (!Number.isFinite(n)) return undefined;
  if (d === undefined) return n;
  if (!d) return undefined;
  return n / d;
};

/** Read real media metadata. Returns null when ffprobe is unavailable or fails. */
export const probeMedia = (absPath: string): MediaInfo | null => {
  const hit = cache.get(absPath);
  if (hit !== undefined) return hit;

  const bin = ffprobePath();
  if (!bin) {
    cache.set(absPath, null);
    return null;
  }
  const r = spawnSync(
    bin,
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", absPath],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error || r.status !== 0 || !r.stdout) {
    cache.set(absPath, null);
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    cache.set(absPath, null);
    return null;
  }
  const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const durationSeconds =
    Number(parsed.format?.duration) ||
    Number(video?.duration) ||
    Number(audio?.duration) ||
    undefined;

  const info: MediaInfo = {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    width: video?.width ? Number(video.width) : undefined,
    height: video?.height ? Number(video.height) : undefined,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    audioChannels: audio?.channels ? Number(audio.channels) : undefined,
    audioRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    fps: video ? parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate) : undefined,
  };
  cache.set(absPath, info);
  return info;
};

const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|mxf|prores|mpg|mpeg|m2ts|ts)$/i;
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|aif|aiff|flac|ogg|opus)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|tif|tiff|bmp|heic)$/i;

/** Best guess at stream layout from the filename, used when ffprobe is absent. */
export const guessFromExtension = (src: string): MediaInfo => {
  if (AUDIO_EXT.test(src)) return { hasVideo: false, hasAudio: true };
  if (IMAGE_EXT.test(src)) return { hasVideo: true, hasAudio: false };
  if (VIDEO_EXT.test(src)) return { hasVideo: true, hasAudio: true };
  return { hasVideo: true, hasAudio: true };
};

export const isImage = (src: string): boolean => IMAGE_EXT.test(src);
