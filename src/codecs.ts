import type { PreparedAsset, PreparedClip, PreparedTimeline } from "./model";
import { frameDurationOf, frameDurationString, premiereRate, timeString } from "./rational";

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Strip characters XML 1.0 forbids outright. */
const clean = (s: string): string => escapeXml(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));

type SpineItem =
  | { type: "gap"; from: number; durationInFrames: number; children: PreparedClip[] }
  | { type: "clip"; clip: PreparedClip; children: PreparedClip[] };

/**
 * Primary storyline plus gaps covering every hole, with off-lane clips attached
 * to whatever the spine holds at their start frame.
 */
const buildSpine = (timeline: PreparedTimeline): SpineItem[] => {
  const primary = timeline.clips
    .filter((c) => c.lane === 0)
    .sort((a, b) => a.from - b.from);
  const items: SpineItem[] = [];
  let cursor = 0;
  for (const clip of primary) {
    if (clip.from > cursor) {
      items.push({ type: "gap", from: cursor, durationInFrames: clip.from - cursor, children: [] });
    }
    items.push({ type: "clip", clip, children: [] });
    cursor = Math.max(cursor, clip.from + clip.durationInFrames);
  }
  if (items.length === 0 || cursor < timeline.totalFrames) {
    items.push({
      type: "gap",
      from: cursor,
      durationInFrames: Math.max(1, timeline.totalFrames - cursor),
      children: [],
    });
  }

  const startOf = (item: SpineItem) => (item.type === "gap" ? item.from : item.clip.from);
  const endOf = (item: SpineItem) =>
    item.type === "gap"
      ? item.from + item.durationInFrames
      : item.clip.from + item.clip.durationInFrames;

  for (const clip of timeline.clips) {
    if (clip.lane === 0) continue;
    const host =
      items.find((i) => startOf(i) <= clip.from && clip.from < endOf(i)) ??
      items[items.length - 1];
    host.children.push(clip);
  }
  for (const item of items) item.children.sort((a, b) => a.lane - b.lane || a.from - b.from);
  return items;
};

const assetElement = (asset: PreparedAsset, fps: number, indent: string): string => {
  const fd = frameDurationOf(fps);
  const attrs: string[] = [
    `id="${asset.id}"`,
    `name="${clean(asset.name)}"`,
    `uid="${asset.uid}"`,
    `start="0s"`,
    `duration="${asset.isImage ? "0s" : timeString(asset.durationFrames, fd)}"`,
    `hasVideo="${asset.hasVideo ? 1 : 0}"`,
  ];
  if (asset.hasVideo) {
    attrs.push(`format="${asset.formatId}"`, `videoSources="1"`);
  }
  if (asset.hasAudio) {
    attrs.push(
      `hasAudio="1"`,
      `audioSources="1"`,
      `audioChannels="${asset.audioChannels || 2}"`,
      `audioRate="${asset.audioRate || 48000}"`,
    );
  }
  const src = asset.relUrl ?? asset.url;
  return `${indent}<asset ${attrs.join(" ")}>
${indent}  <media-rep kind="original-media" src="${clean(src)}"/>
${indent}</asset>`;
};

const clipElement = (
  clip: PreparedClip,
  fps: number,
  indent: string,
  offsetFrames: number,
  children = "",
): string => {
  const fd = frameDurationOf(fps);
  const common = [
    `ref="${clip.asset.id}"`,
    `name="${clean(clip.name)}"`,
    `offset="${timeString(offsetFrames, fd)}"`,
    `duration="${timeString(clip.durationInFrames, fd)}"`,
  ];
  if (clip.lane !== 0) common.unshift(`lane="${clip.lane}"`);

  // Stills are <video> elements; timed media is <asset-clip>.
  if (clip.asset.isImage) {
    const attrs = [...common, `start="0s"`];
    return children
      ? `${indent}<video ${attrs.join(" ")}>\n${children}\n${indent}</video>`
      : `${indent}<video ${attrs.join(" ")}/>`;
  }
  const attrs = [...common, `start="${timeString(clip.startFrom, fd)}"`];
  if (clip.asset.hasVideo) attrs.push(`format="${clip.asset.formatId}"`, `tcFormat="NDF"`);
  if (clip.asset.hasAudio) attrs.push(`audioRole="dialogue"`);
  return children
    ? `${indent}<asset-clip ${attrs.join(" ")}>\n${children}\n${indent}</asset-clip>`
    : `${indent}<asset-clip ${attrs.join(" ")}/>`;
};

export const toFcpxml = (timeline: PreparedTimeline): string => {
  const fd = frameDurationOf(timeline.fps);
  const formats = timeline.formats
    .map((f) => {
      const name = f.name ? ` name="${clean(f.name)}"` : "";
      return `    <format id="${f.id}"${name} frameDuration="${frameDurationString(fd)}" width="${f.width}" height="${f.height}" colorSpace="1-1-1"/>`;
    })
    .join("\n");
  const assets = timeline.assets.map((a) => assetElement(a, timeline.fps, "    ")).join("\n");

  const spine = buildSpine(timeline)
    .map((item) => {
      const hostFrom = item.type === "gap" ? item.from : item.clip.from;
      const hostStart = item.type === "gap" ? 0 : item.clip.startFrom;
      const children = item.children
        .map((child) =>
          clipElement(child, timeline.fps, "              ", hostStart + (child.from - hostFrom)),
        )
        .join("\n");
      if (item.type === "gap") {
        const attrs = `name="Gap" offset="${timeString(item.from, fd)}" start="0s" duration="${timeString(item.durationInFrames, fd)}"`;
        return children
          ? `            <gap ${attrs}>\n${children}\n            </gap>`
          : `            <gap ${attrs}/>`;
      }
      return clipElement(item.clip, timeline.fps, "            ", item.clip.from, children);
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="${timeline.fcpxmlVersion}">
  <resources>
${formats}
${assets}
  </resources>
  <library>
    <event name="${clean(timeline.name)}">
      <project name="${clean(timeline.name)}">
        <sequence format="${timeline.sequenceFormatId}" duration="${timeString(timeline.totalFrames, fd)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
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

// ── Premiere / Final Cut 7 XML (xmeml) ───────────────────────────────────────

const rateXml = (fps: number, indent: string): string => {
  const { timebase, ntsc } = premiereRate(fps);
  return `${indent}<rate>\n${indent}  <timebase>${timebase}</timebase>\n${indent}  <ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc>\n${indent}</rate>`;
};

const fileXml = (
  asset: PreparedAsset,
  fps: number,
  indent: string,
  seen: Set<string>,
): string => {
  const id = `file-${asset.id}`;
  if (seen.has(id)) return `${indent}<file id="${id}"/>`;
  seen.add(id);
  const media = [
    asset.hasVideo
      ? `${indent}    <video>
${indent}      <samplecharacteristics>
${rateXml(fps, `${indent}        `)}
${indent}        <width>${asset.width}</width>
${indent}        <height>${asset.height}</height>
${indent}        <anamorphic>FALSE</anamorphic>
${indent}        <pixelaspectratio>square</pixelaspectratio>
${indent}        <fielddominance>none</fielddominance>
${indent}      </samplecharacteristics>
${indent}    </video>`
      : "",
    asset.hasAudio
      ? `${indent}    <audio>
${indent}      <samplecharacteristics>
${indent}        <depth>16</depth>
${indent}        <samplerate>${asset.audioRate || 48000}</samplerate>
${indent}      </samplecharacteristics>
${indent}      <channelcount>${asset.audioChannels || 2}</channelcount>
${indent}    </audio>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${indent}<file id="${id}">
${indent}  <name>${clean(asset.name)}</name>
${indent}  <pathurl>${clean(asset.url)}</pathurl>
${rateXml(fps, `${indent}  `)}
${indent}  <duration>${asset.durationFrames}</duration>
${indent}  <media>
${media}
${indent}  </media>
${indent}</file>`;
};

export const toPremiereXml = (timeline: PreparedTimeline): string => {
  const seenFiles = new Set<string>();
  const videoLanes = [...new Set(timeline.clips.filter((c) => c.lane >= 0).map((c) => c.lane))].sort(
    (a, b) => a - b,
  );
  const audioLanes = [...new Set(timeline.clips.filter((c) => c.lane < 0).map((c) => c.lane))].sort(
    (a, b) => b - a,
  );

  // Every A/V clip also needs an audio clipitem, one per video track.
  type Entry = { clip: PreparedClip; videoId?: string; audioId?: string };
  const entries: Entry[] = [];
  let counter = 0;
  for (const clip of timeline.clips) {
    const entry: Entry = { clip };
    counter++;
    if (clip.asset.hasVideo) entry.videoId = `clipitem-v${counter}`;
    if (clip.asset.hasAudio) entry.audioId = `clipitem-a${counter}`;
    entries.push(entry);
  }

  const linkXml = (entry: Entry, indent: string): string => {
    const links: string[] = [];
    if (entry.videoId) {
      links.push(
        `${indent}<link>\n${indent}  <linkclipref>${entry.videoId}</linkclipref>\n${indent}  <mediatype>video</mediatype>\n${indent}</link>`,
      );
    }
    if (entry.audioId) {
      links.push(
        `${indent}<link>\n${indent}  <linkclipref>${entry.audioId}</linkclipref>\n${indent}  <mediatype>audio</mediatype>\n${indent}</link>`,
      );
    }
    return links.join("\n");
  };

  const clipitem = (
    entry: Entry,
    kind: "video" | "audio",
    indent: string,
  ): string => {
    const { clip } = entry;
    const id = kind === "video" ? entry.videoId! : entry.audioId!;
    const sourceTrack =
      kind === "audio"
        ? `${indent}  <sourcetrack>\n${indent}    <mediatype>audio</mediatype>\n${indent}    <trackindex>1</trackindex>\n${indent}  </sourcetrack>`
        : `${indent}  <sourcetrack>\n${indent}    <mediatype>video</mediatype>\n${indent}    <trackindex>1</trackindex>\n${indent}  </sourcetrack>`;
    return `${indent}<clipitem id="${id}">
${indent}  <masterclipid>masterclip-${clip.asset.id}</masterclipid>
${indent}  <name>${clean(clip.name)}</name>
${indent}  <enabled>TRUE</enabled>
${indent}  <duration>${clip.asset.durationFrames}</duration>
${rateXml(timeline.fps, `${indent}  `)}
${indent}  <start>${clip.from}</start>
${indent}  <end>${clip.from + clip.durationInFrames}</end>
${indent}  <in>${clip.startFrom}</in>
${indent}  <out>${clip.startFrom + clip.durationInFrames}</out>
${fileXml(clip.asset, timeline.fps, `${indent}  `, seenFiles)}
${sourceTrack}
${linkXml(entry, `${indent}  `)}
${indent}</clipitem>`;
  };

  const videoTracks = videoLanes
    .map((lane) => {
      const items = entries
        .filter((e) => e.clip.lane === lane && e.videoId)
        .map((e) => clipitem(e, "video", "          "))
        .join("\n");
      return `        <track>
${items}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>`;
    })
    .join("\n");

  // Audio from A/V clips goes on its own track per video lane, then audio-only lanes.
  const audioTrackSources: PreparedClip[][] = [
    ...videoLanes.map((lane) => timeline.clips.filter((c) => c.lane === lane && c.asset.hasAudio)),
    ...audioLanes.map((lane) => timeline.clips.filter((c) => c.lane === lane && c.asset.hasAudio)),
  ].filter((group) => group.length > 0);

  const audioTracks = audioTrackSources
    .map((group) => {
      const items = group
        .map((clip) => entries.find((e) => e.clip === clip)!)
        .filter((e) => e.audioId)
        .map((e) => clipitem(e, "audio", "          "))
        .join("\n");
      return `        <track premiereTrackType="Stereo">
${items}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>`;
    })
    .join("\n");

  const { timebase, ntsc } = premiereRate(timeline.fps);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="sequence-1">
    <name>${clean(timeline.name)}</name>
    <duration>${timeline.totalFrames}</duration>
${rateXml(timeline.fps, "    ")}
    <timecode>
${rateXml(timeline.fps, "      ")}
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>${ntsc ? "DF" : "NDF"}</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
${rateXml(timeline.fps, "            ")}
            <width>${timeline.width}</width>
            <height>${timeline.height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
          </samplecharacteristics>
        </format>
${videoTracks}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
${audioTracks}
      </audio>
    </media>
  </sequence>
</xmeml>
`.replace(/^\s*\n/gm, "");
};

// ── OpenTimelineIO ───────────────────────────────────────────────────────────

export const toOtio = (timeline: PreparedTimeline): string => {
  const rate = timeline.fps;
  const time = (frames: number) => ({
    OTIO_SCHEMA: "RationalTime.1",
    rate,
    value: frames,
  });
  const range = (start: number, duration: number) => ({
    OTIO_SCHEMA: "TimeRange.1",
    start_time: time(start),
    duration: time(duration),
  });

  const lanes = [...new Set(timeline.clips.map((c) => c.lane))].sort((a, b) => b - a);
  const tracks = lanes.map((lane) => {
    const clips = timeline.clips
      .filter((c) => c.lane === lane)
      .sort((a, b) => a.from - b.from);
    const children: unknown[] = [];
    let cursor = 0;
    for (const c of clips) {
      if (c.from > cursor) {
        children.push({
          OTIO_SCHEMA: "Gap.1",
          name: "Gap",
          source_range: range(0, c.from - cursor),
        });
      }
      children.push({
        OTIO_SCHEMA: "Clip.1",
        name: c.name,
        source_range: range(c.startFrom, c.durationInFrames),
        media_reference: {
          OTIO_SCHEMA: "ExternalReference.1",
          name: c.asset.name,
          target_url: c.asset.url,
          available_range: range(0, c.asset.durationFrames),
        },
        metadata: { retime: { timeline_start: c.from, source: c.asset.absPath ?? c.asset.url } },
      });
      cursor = c.from + c.durationInFrames;
    }
    return {
      OTIO_SCHEMA: "Track.1",
      name: lane >= 0 ? `V${lane + 1}` : `A${-lane}`,
      kind: lane >= 0 ? "Video" : "Audio",
      children,
    };
  });

  return `${JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: timeline.name,
      global_start_time: time(0),
      metadata: {
        retime: { fps: timeline.fps, width: timeline.width, height: timeline.height },
      },
      tracks: { OTIO_SCHEMA: "Stack.1", name: timeline.name, children: tracks },
    },
    null,
    2,
  )}\n`;
};
