/**
 * Timeline elements beyond media clips: text, captions, markers, transitions,
 * and the per-clip adjustments (level, opacity, transform) an NLE can edit.
 */

/** A value that is either constant or keyframed along the clip. */
export type Animated<T> = T | Array<{ at: number; value: T }>;

export type Point = { x: number; y: number };

export type TextStyle = {
  /** PostScript or family name, e.g. "Helvetica Neue". */
  font?: string;
  /** Points, in a 1080-high frame. */
  fontSize?: number;
  /** "Regular", "Bold", "Italic", … */
  fontFace?: string;
  /** "#RRGGBB", "#RRGGBBAA", or "r g b a" with 0–1 components. */
  color?: string;
  backgroundColor?: string;
  alignment?: "left" | "center" | "right" | "justified";
  lineSpacing?: number;
  bold?: boolean;
  italic?: boolean;
};

export type TitleElement = {
  /** The text itself. Newlines are kept. */
  text: string;
  from: number;
  durationInFrames: number;
  /** Name shown on the clip in the NLE. Defaults to the first line of `text`. */
  name?: string;
  lane?: number;
  style?: TextStyle;
  /**
   * Offset from frame center, in the composition's pixels. Right and down are
   * positive, matching how the layout reads in Remotion.
   */
  position?: Point;
  opacity?: Animated<number>;
};

export type CaptionElement = {
  text: string;
  from: number;
  durationInFrames: number;
  /** BCP-47 tag used for the caption role and the .srt sidecar. */
  language?: string;
};

export type MarkerElement = {
  name: string;
  from: number;
  durationInFrames?: number;
  kind?: "standard" | "chapter" | "todo" | "completed";
};

export type TransitionElement = {
  from: number;
  durationInFrames: number;
  /** Only the cross dissolve maps cleanly to every NLE. */
  kind?: "cross-dissolve";
  name?: string;
};

export type ClipAdjustments = {
  /** Audio level in dB. 0 is unity; keyframes give you a real level curve. */
  gainDb?: Animated<number>;
  /** 0–1. */
  opacity?: Animated<number>;
  /** Offset from frame center, in composition pixels. */
  position?: Animated<Point>;
  /** 1 = 100%. */
  scale?: Animated<number>;
  /** FCP role and Premiere track hint: "dialogue", "music", "effects". */
  role?: "dialogue" | "music" | "effects" | string;
};

export const isKeyframed = <T>(v: Animated<T> | undefined): v is Array<{ at: number; value: T }> =>
  Array.isArray(v);

export const constantOf = <T>(v: Animated<T> | undefined): T | undefined =>
  v === undefined ? undefined : isKeyframed(v) ? v[0]?.value : v;

export const keyframesOf = <T>(v: Animated<T> | undefined): Array<{ at: number; value: T }> => {
  if (v === undefined) return [];
  return isKeyframed(v) ? [...v].sort((a, b) => a.at - b.at) : [{ at: 0, value: v }];
};

/** "#RRGGBB" | "#RRGGBBAA" | "r g b a" -> FCP's "r g b a" with 0–1 components. */
export const toFcpColor = (color: string | undefined, fallback = "1 1 1 1"): string => {
  if (!color) return fallback;
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex) || /^[0-9a-f]{8}$/i.test(hex)) {
    const parts = [0, 2, 4, 6]
      .slice(0, hex.length === 8 ? 4 : 3)
      .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    if (parts.length === 3) parts.push(1);
    return parts.map((n) => Number(n.toFixed(6))).join(" ");
  }
  if (/^[\d.\s]+$/.test(color.trim())) {
    const parts = color.trim().split(/\s+/).map(Number);
    while (parts.length < 4) parts.push(1);
    return parts.slice(0, 4).join(" ");
  }
  return fallback;
};

/** "#RRGGBB" -> {r,g,b} 0–255, for xmeml generators. */
export const toRgb255 = (color: string | undefined): { r: number; g: number; b: number } => {
  const fcp = toFcpColor(color, "1 1 1 1").split(" ").map(Number);
  return {
    r: Math.round((fcp[0] ?? 1) * 255),
    g: Math.round((fcp[1] ?? 1) * 255),
    b: Math.round((fcp[2] ?? 1) * 255),
  };
};

export const dbToLinear = (db: number): number => 10 ** (db / 20);

/** Seconds -> SRT timestamp. */
export const srtTime = (frames: number, fps: number): string => {
  const total = frames / fps;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
};

export const toSrt = (captions: CaptionElement[], fps: number): string =>
  captions
    .slice()
    .sort((a, b) => a.from - b.from)
    .map((c, i) =>
      [
        i + 1,
        `${srtTime(c.from, fps)} --> ${srtTime(c.from + c.durationInFrames, fps)}`,
        c.text,
        "",
      ].join("\n"),
    )
    .join("\n");
