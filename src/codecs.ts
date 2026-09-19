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

export const toFcpxml = (
  clips: Clip[],
  fps: number,
  compositionId = "retime-timeline",
): string => {
  const sorted = [...clips].sort((a, b) => a.from - b.from);
  const totalFrames = sorted.reduce(
    (m, c) => Math.max(m, c.from + c.durationInFrames),
    0,
  );
  const spine = sorted
    .map((c, i) => {
      const offset = framesToSec(c.from, fps);
      const duration = framesToSec(c.durationInFrames, fps);
      const start = framesToSec(c.startFrom ?? 0, fps);
      const name = escapeXml(c.name ?? `Clip ${i + 1}`);
      const src = escapeXml(c.src);
      return `        <clip name="${name}" offset="${offset}" duration="${duration}" start="${start}" src="${src}"/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.10">
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
