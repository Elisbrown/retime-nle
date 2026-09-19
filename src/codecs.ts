import type { Clip } from "./types";

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const framesToSec = (frames: number, fps: number): string => {
  const v = frames / fps;
  return Number.isInteger(v) ? `${v}s` : `${frames}/${fps}s`;
};

/**
 * Rational frame duration for the FCPXML <format> element.
 * Integer fps -> "1/30s". Non-integer (e.g. 29.97) -> closest p/q approximation.
 */
const fpsToFrameDuration = (fps: number): string => {
  if (Number.isInteger(fps) && fps > 0) return `1/${fps}s`;
  // Approximate fps as fpsNum/fpsDen; one frame lasts fpsDen/fpsNum seconds.
  let fpsNum = 1;
  let fpsDen = Math.round(fps);
  let bestErr = Math.abs(fps - fpsNum / fpsDen);
  for (let d = 1; d <= 100000; d++) {
    const n = Math.round(fps * d);
    if (n < 1) continue;
    const err = Math.abs(fps - n / d);
    if (err < bestErr) {
      bestErr = err;
      fpsNum = n;
      fpsDen = d;
      if (err === 0) break;
    }
  }
  return `${fpsDen}/${fpsNum}s`;
};

export type FcpxmlOptions = {
  /** Frame width for the <format> resource. Defaults to 1920. */
  width?: number;
  /** Frame height for the <format> resource. Defaults to 1080. */
  height?: number;
};

export const toFcpxml = (
  clips: Clip[],
  fps: number,
  compositionId = "retime-timeline",
  opts: FcpxmlOptions = {},
): string => {
  const sorted = [...clips].sort((a, b) => a.from - b.from);
  const totalFrames = sorted.reduce(
    (m, c) => Math.max(m, c.from + c.durationInFrames),
    0,
  );
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;

  // One <asset> per unique source, in order of first appearance.
  // Asset duration covers the furthest frame any clip reads from it.
  const assetIds = new Map<string, string>();
  const assetDurations = new Map<string, number>();
  for (const c of sorted) {
    if (!assetIds.has(c.src)) {
      assetIds.set(c.src, `r${assetIds.size + 2}`);
    }
    const needed = (c.startFrom ?? 0) + c.durationInFrames;
    assetDurations.set(c.src, Math.max(assetDurations.get(c.src) ?? 0, needed));
  }
  const assets = [...assetIds.entries()]
    .map(([src, id]) => {
      const name = escapeXml(src.split(/[\\/]/).pop() || src);
      return `    <asset id="${id}" name="${name}" src="${escapeXml(src)}" start="0s" duration="${framesToSec(assetDurations.get(src) ?? 0, fps)}" hasVideo="1" hasAudio="1" format="r1"/>`;
    })
    .join("\n");

  const spine = sorted
    .map((c, i) => {
      const offset = framesToSec(c.from, fps);
      const duration = framesToSec(c.durationInFrames, fps);
      const start = framesToSec(c.startFrom ?? 0, fps);
      const name = escapeXml(c.name ?? `Clip ${i + 1}`);
      return `        <asset-clip ref="${assetIds.get(c.src)}" name="${name}" offset="${offset}" start="${start}" duration="${duration}"/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${height}p${fps}" frameDuration="${fpsToFrameDuration(fps)}" width="${width}" height="${height}"/>
${assets}
  </resources>
  <library>
    <event name="${escapeXml(compositionId)}">
      <project name="${escapeXml(compositionId)}">
        <sequence format="r1" duration="${framesToSec(totalFrames, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
};

export const toPremiereXml = (
  clips: Clip[],
  fps: number,
  compositionId = "retime-timeline",
): string => {
  const sorted = [...clips].sort((a, b) => a.from - b.from);
  const items = sorted
    .map((c, i) => {
      const name = escapeXml(c.name ?? `Clip ${i + 1}`);
      const src = escapeXml(c.src);
      return `        <clipitem id="clip-${i + 1}">
          <name>${name}</name>
          <file><pathurl>${src}</pathurl></file>
          <start>${c.from}</start>
          <end>${c.from + c.durationInFrames}</end>
          <in>${c.startFrom ?? 0}</in>
          <out>${(c.startFrom ?? 0) + c.durationInFrames}</out>
        </clipitem>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmeml version="4">
  <sequence id="${escapeXml(compositionId)}">
    <name>${escapeXml(compositionId)}</name>
    <timebase>${fps}</timebase>
    <media>
      <video>
        <track>
${items}
        </track>
      </video>
    </media>
  </sequence>
</xmeml>
`;
};

export const toOtio = (
  clips: Clip[],
  fps: number,
  compositionId = "retime-timeline",
): string => {
  const sorted = [...clips].sort((a, b) => a.from - b.from);
  const time = (frames: number) => ({
    OTIO_SCHEMA: "RationalTime.1",
    rate: fps,
    value: frames,
  });
  const otio = {
    OTIO_SCHEMA: "Timeline.1",
    name: compositionId,
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          kind: "Video",
          children: sorted.map((c, i) => ({
            OTIO_SCHEMA: "Clip.1",
            name: c.name ?? `Clip ${i + 1}`,
            source_range: {
              OTIO_SCHEMA: "TimeRange.1",
              start_time: time(c.startFrom ?? 0),
              duration: time(c.durationInFrames),
            },
            available_range: {
              OTIO_SCHEMA: "TimeRange.1",
              start_time: time(0),
              duration: time((c.startFrom ?? 0) + c.durationInFrames + 960),
            },
            metadata: { retime_from: c.from, retime_src: c.src },
            media_reference: {
              OTIO_SCHEMA: "ExternalReference.1",
              target_url: c.src,
            },
          })),
        },
      ],
    },
  };
  return JSON.stringify(otio, null, 2);
};
