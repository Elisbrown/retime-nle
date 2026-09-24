import type { Animated, MarkerElement, Point } from "./elements";
import { dbToLinear, isKeyframed, keyframesOf, toFcpColor, toRgb255 } from "./elements";
import type {
  PreparedCaption,
  PreparedClip,
  PreparedTimeline,
  PreparedTitle,
  PreparedTransition,
} from "./model";
import type { PreparedAsset } from "./model";
import { frameDurationOf, frameDurationString, premiereRate, timeString } from "./rational";

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Strip characters XML 1.0 forbids outright. */
const clean = (s: string): string =>
  escapeXml(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));

const indentBy = (text: string, indent: string): string =>
  text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => `${indent}${l}`)
    .join("\n");

// ── FCPXML ───────────────────────────────────────────────────────────────────

type SpineItem =
  | { type: "gap"; from: number; durationInFrames: number; children: Child[]; markers: MarkerElement[] }
  | { type: "clip"; clip: PreparedClip; children: Child[]; markers: MarkerElement[] };

type Child =
  | { kind: "clip"; clip: PreparedClip }
  | { kind: "title"; title: PreparedTitle }
  | { kind: "caption"; caption: PreparedCaption };

/**
 * Primary storyline plus gaps covering every hole. Everything off the primary
 * lane — overlapping video, audio, titles, captions — attaches to whatever the
 * spine holds at its start frame, which is how Final Cut models connected
 * clips.
 */
const buildSpine = (timeline: PreparedTimeline): SpineItem[] => {
  const primary = timeline.clips.filter((c) => c.lane === 0).sort((a, b) => a.from - b.from);
  const items: SpineItem[] = [];
  let cursor = 0;
  for (const clip of primary) {
    if (clip.from > cursor) {
      items.push({
        type: "gap",
        from: cursor,
        durationInFrames: clip.from - cursor,
        children: [],
        markers: [],
      });
    }
    items.push({ type: "clip", clip, children: [], markers: [] });
    cursor = Math.max(cursor, clip.from + clip.durationInFrames);
  }
  if (items.length === 0 || cursor < timeline.totalFrames) {
    items.push({
      type: "gap",
      from: cursor,
      durationInFrames: Math.max(1, timeline.totalFrames - cursor),
      children: [],
      markers: [],
    });
  }

  const startOf = (item: SpineItem) => (item.type === "gap" ? item.from : item.clip.from);
  const endOf = (item: SpineItem) =>
    item.type === "gap"
      ? item.from + item.durationInFrames
      : item.clip.from + item.clip.durationInFrames;
  const hostFor = (from: number): SpineItem =>
    items.find((i) => startOf(i) <= from && from < endOf(i)) ?? items[items.length - 1];

  for (const clip of timeline.clips) {
    if (clip.lane === 0) continue;
    hostFor(clip.from).children.push({ kind: "clip", clip });
  }
  for (const title of timeline.titles) hostFor(title.from).children.push({ kind: "title", title });
  for (const caption of timeline.captions) {
    hostFor(caption.from).children.push({ kind: "caption", caption });
  }
  for (const marker of timeline.markers) hostFor(marker.from).markers.push(marker);

  const childLane = (c: Child) =>
    c.kind === "clip" ? c.clip.lane : c.kind === "title" ? c.title.lane : c.caption.lane;
  const childFrom = (c: Child) =>
    c.kind === "clip" ? c.clip.from : c.kind === "title" ? c.title.from : c.caption.from;
  for (const item of items) {
    item.children.sort((a, b) => childLane(a) - childLane(b) || childFrom(a) - childFrom(b));
    item.markers.sort((a, b) => a.from - b.from);
  }
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
  if (asset.hasVideo) attrs.push(`format="${asset.formatId}"`, `videoSources="1"`);
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

/** A keyframed or constant parameter, in the clip's own time base. */
const paramElement = (
  name: string,
  value: Animated<number> | Animated<Point> | undefined,
  format: (v: any) => string,
  clipStart: number,
  fps: number,
  indent: string,
): string => {
  if (value === undefined) return "";
  const fd = frameDurationOf(fps);
  const frames = keyframesOf(value as Animated<number>);
  const keys = frames
    .map(
      (k) =>
        `${indent}  <keyframe time="${timeString(clipStart + k.at, fd)}" value="${format(k.value)}"/>`,
    )
    .join("\n");
  return `${indent}<param name="${name}">\n${keys}\n${indent}</param>`;
};

const adjustmentElements = (clip: PreparedClip, fps: number, indent: string): string => {
  const out: string[] = [];
  const fmtNumber = (v: number) => String(Number(v.toFixed(4)));
  const fmtPoint = (v: Point) => `${Number(v.x.toFixed(4))} ${Number((-v.y).toFixed(4))}`;

  if (clip.gainDb !== undefined) {
    out.push(
      isKeyframed(clip.gainDb)
        ? `${indent}<adjust-volume>\n${paramElement(
            "amount",
            clip.gainDb,
            (v: number) => `${fmtNumber(v)}dB`,
            clip.startFrom,
            fps,
            `${indent}  `,
          )}\n${indent}</adjust-volume>`
        : `${indent}<adjust-volume amount="${fmtNumber(clip.gainDb as number)}dB"/>`,
    );
  }
  if (clip.opacity !== undefined) {
    out.push(
      isKeyframed(clip.opacity)
        ? `${indent}<adjust-opacity>\n${paramElement(
            "amount",
            clip.opacity,
            fmtNumber,
            clip.startFrom,
            fps,
            `${indent}  `,
          )}\n${indent}</adjust-opacity>`
        : `${indent}<adjust-opacity amount="${fmtNumber(clip.opacity as number)}"/>`,
    );
  }
  if (clip.position !== undefined || clip.scale !== undefined) {
    const staticPosition =
      clip.position !== undefined && !isKeyframed(clip.position)
        ? ` position="${fmtPoint(clip.position as Point)}"`
        : "";
    const staticScale =
      clip.scale !== undefined && !isKeyframed(clip.scale)
        ? ` scale="${fmtNumber(clip.scale as number)} ${fmtNumber(clip.scale as number)}"`
        : "";
    const params = [
      isKeyframed(clip.position)
        ? paramElement("position", clip.position, fmtPoint, clip.startFrom, fps, `${indent}  `)
        : "",
      isKeyframed(clip.scale)
        ? paramElement(
            "scale",
            clip.scale,
            (v: number) => `${fmtNumber(v)} ${fmtNumber(v)}`,
            clip.startFrom,
            fps,
            `${indent}  `,
          )
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    out.push(
      params
        ? `${indent}<adjust-transform${staticPosition}${staticScale}>\n${params}\n${indent}</adjust-transform>`
        : `${indent}<adjust-transform${staticPosition}${staticScale}/>`,
    );
  }
  return out.join("\n");
};

const markerElements = (
  markers: MarkerElement[],
  hostFrom: number,
  hostStart: number,
  fps: number,
  indent: string,
): string => {
  const fd = frameDurationOf(fps);
  return markers
    .map((m) => {
      const start = timeString(hostStart + (m.from - hostFrom), fd);
      const duration = timeString(Math.max(1, m.durationInFrames ?? 1), fd);
      const attrs = `start="${start}" duration="${duration}" value="${clean(m.name)}"`;
      if (m.kind === "chapter") return `${indent}<chapter-marker ${attrs}/>`;
      if (m.kind === "todo") return `${indent}<marker ${attrs} completed="0"/>`;
      if (m.kind === "completed") return `${indent}<marker ${attrs} completed="1"/>`;
      return `${indent}<marker ${attrs}/>`;
    })
    .join("\n");
};

const titleElement = (title: PreparedTitle, timeline: PreparedTimeline, indent: string): string => {
  const fd = frameDurationOf(timeline.fps);
  const style = title.style ?? {};
  const styleAttrs = [
    `font="${clean(style.font ?? "Helvetica")}"`,
    `fontSize="${style.fontSize ?? 63}"`,
    `fontFace="${clean(style.fontFace ?? (style.bold ? "Bold" : "Regular"))}"`,
    `fontColor="${toFcpColor(style.color)}"`,
    `alignment="${style.alignment ?? "center"}"`,
  ];
  if (style.italic) styleAttrs.push(`italic="1"`);
  if (style.bold) styleAttrs.push(`bold="1"`);
  if (style.lineSpacing !== undefined) styleAttrs.push(`lineSpacing="${style.lineSpacing}"`);
  if (style.backgroundColor) {
    styleAttrs.push(`backgroundColor="${toFcpColor(style.backgroundColor, "0 0 0 0")}"`);
  }

  // Basic Title's position parameter. FCP's y axis points up; ours points down.
  const position = title.position
    ? `${indent}  <param name="Position" key="9999/999166631/999166633/1/100/101" value="${Number(
        title.position.x.toFixed(4),
      )} ${Number((-title.position.y).toFixed(4))}"/>\n`
    : "";

  return `${indent}<title ref="${timeline.titleEffectId}" lane="${title.lane}" offset="${timeString(
    title.from,
    fd,
  )}" name="${clean(title.name)}" start="0s" duration="${timeString(title.durationInFrames, fd)}">
${position}${indent}  <text>
${indent}    <text-style ref="${title.styleId}">${clean(title.text)}</text-style>
${indent}  </text>
${indent}  <text-style-def id="${title.styleId}">
${indent}    <text-style ${styleAttrs.join(" ")}/>
${indent}  </text-style-def>
${indent}</title>`;
};

const captionElement = (caption: PreparedCaption, fps: number, indent: string): string => {
  const fd = frameDurationOf(fps);
  const role = `iTT?captionFormat=ITT.${caption.language}`;
  return `${indent}<caption lane="${caption.lane}" offset="${timeString(
    caption.from,
    fd,
  )}" name="${clean(caption.text.split("\n")[0].slice(0, 40))}" start="0s" duration="${timeString(
    caption.durationInFrames,
    fd,
  )}" role="${clean(role)}">
${indent}  <text placement="bottom">
${indent}    <text-style ref="${caption.styleId}">${clean(caption.text)}</text-style>
${indent}  </text>
${indent}  <text-style-def id="${caption.styleId}">
${indent}    <text-style font="Helvetica" fontSize="20" fontFace="Regular" fontColor="1 1 1 1" backgroundColor="0 0 0 0.6" alignment="center"/>
${indent}  </text-style-def>
${indent}</caption>`;
};

const clipElement = (
  clip: PreparedClip,
  fps: number,
  indent: string,
  offsetFrames: number,
  inner = "",
): string => {
  const fd = frameDurationOf(fps);
  const common = [
    `ref="${clip.asset.id}"`,
    `name="${clean(clip.name)}"`,
    `offset="${timeString(offsetFrames, fd)}"`,
    `duration="${timeString(clip.durationInFrames, fd)}"`,
  ];
  if (clip.lane !== 0) common.unshift(`lane="${clip.lane}"`);

  if (clip.asset.isImage) {
    const attrs = [...common, `start="0s"`];
    return inner
      ? `${indent}<video ${attrs.join(" ")}>\n${inner}\n${indent}</video>`
      : `${indent}<video ${attrs.join(" ")}/>`;
  }
  const attrs = [...common, `start="${timeString(clip.startFrom, fd)}"`];
  if (clip.asset.hasVideo) attrs.push(`format="${clip.asset.formatId}"`, `tcFormat="NDF"`);
  if (clip.asset.hasAudio) attrs.push(`audioRole="${clean(clip.role ?? "dialogue")}"`);
  return inner
    ? `${indent}<asset-clip ${attrs.join(" ")}>\n${inner}\n${indent}</asset-clip>`
    : `${indent}<asset-clip ${attrs.join(" ")}/>`;
};

const transitionElement = (
  transition: PreparedTransition,
  timeline: PreparedTimeline,
  indent: string,
): string => {
  const fd = frameDurationOf(timeline.fps);
  return `${indent}<transition name="${clean(transition.name ?? "Cross Dissolve")}" offset="${timeString(
    transition.from,
    fd,
  )}" duration="${timeString(transition.durationInFrames, fd)}">
${indent}  <filter-video ref="${timeline.transitionEffectId}" name="Cross Dissolve"/>
${indent}</transition>`;
};

export const toFcpxml = (timeline: PreparedTimeline): string => {
  const fd = frameDurationOf(timeline.fps);
  const formats = timeline.formats
    .map((f) => {
      const name = f.name ? ` name="${clean(f.name)}"` : "";
      return `    <format id="${f.id}"${name} frameDuration="${frameDurationString(
        fd,
      )}" width="${f.width}" height="${f.height}" colorSpace="1-1-1"/>`;
    })
    .join("\n");
  const assets = timeline.assets.map((a) => assetElement(a, timeline.fps, "    ")).join("\n");
  const effects = timeline.effects
    .map((e) => `    <effect id="${e.id}" name="${clean(e.name)}" uid="${clean(e.uid)}"/>`)
    .join("\n");

  const spineItems = buildSpine(timeline);
  const parts: Array<{ from: number; xml: string }> = [];

  for (const item of spineItems) {
    const hostFrom = item.type === "gap" ? item.from : item.clip.from;
    const hostStart = item.type === "gap" ? 0 : item.clip.startFrom;
    const childIndent = "              ";
    const children = item.children
      .map((child) => {
        if (child.kind === "clip") {
          return clipElement(
            child.clip,
            timeline.fps,
            childIndent,
            hostStart + (child.clip.from - hostFrom),
            adjustmentElements(child.clip, timeline.fps, `${childIndent}  `),
          );
        }
        if (child.kind === "title") {
          return titleElement(
            { ...child.title, from: hostStart + (child.title.from - hostFrom) },
            timeline,
            childIndent,
          );
        }
        return captionElement(
          { ...child.caption, from: hostStart + (child.caption.from - hostFrom) },
          timeline.fps,
          childIndent,
        );
      })
      .join("\n");

    const markers = markerElements(item.markers, hostFrom, hostStart, timeline.fps, childIndent);

    if (item.type === "gap") {
      const attrs = `name="Gap" offset="${timeString(item.from, fd)}" start="0s" duration="${timeString(
        item.durationInFrames,
        fd,
      )}"`;
      const inner = [children, markers].filter(Boolean).join("\n");
      parts.push({
        from: item.from,
        xml: inner ? `            <gap ${attrs}>\n${inner}\n            </gap>` : `            <gap ${attrs}/>`,
      });
      continue;
    }
    const inner = [
      adjustmentElements(item.clip, timeline.fps, childIndent),
      children,
      markers,
    ]
      .filter(Boolean)
      .join("\n");
    parts.push({
      from: item.clip.from,
      xml: clipElement(item.clip, timeline.fps, "            ", item.clip.from, inner),
    });
  }

  for (const transition of timeline.transitions) {
    parts.push({ from: transition.from, xml: transitionElement(transition, timeline, "            ") });
  }
  parts.sort((a, b) => a.from - b.from);
  const spine = parts.map((p) => p.xml).join("\n");

  const resources = [formats, assets, effects].filter(Boolean).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="${timeline.fcpxmlVersion}">
  <resources>
${resources}
  </resources>
  <library>
    <event name="${clean(timeline.name)}">
      <project name="${clean(timeline.name)}">
        <sequence format="${timeline.sequenceFormatId}" duration="${timeString(
          timeline.totalFrames,
          fd,
        )}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
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
  return `${indent}<rate>\n${indent}  <timebase>${timebase}</timebase>\n${indent}  <ntsc>${
    ntsc ? "TRUE" : "FALSE"
  }</ntsc>\n${indent}</rate>`;
};

const fileXml = (asset: PreparedAsset, fps: number, indent: string, seen: Set<string>): string => {
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

/** Audio level or opacity as a Premiere filter, keyframed when the value is. */
const premiereFilter = (
  kind: "audiolevels" | "opacity",
  value: Animated<number>,
  convert: (v: number) => number,
  indent: string,
): string => {
  const spec =
    kind === "audiolevels"
      ? {
          name: "Audio Levels",
          id: "audiolevels",
          category: "audiolevels",
          type: "audiolevels",
          media: "audio",
          param: "level",
          paramName: "Level",
          min: 0,
          max: 3.98107,
        }
      : {
          name: "Opacity",
          id: "opacity",
          category: "motion",
          type: "motion",
          media: "video",
          param: "opacity",
          paramName: "opacity",
          min: 0,
          max: 100,
        };
  const keys = keyframesOf(value);
  const body = isKeyframed(value)
    ? keys
        .map(
          (k) =>
            `${indent}        <keyframe>\n${indent}          <when>${k.at}</when>\n${indent}          <value>${Number(
              convert(k.value).toFixed(6),
            )}</value>\n${indent}        </keyframe>`,
        )
        .join("\n")
    : `${indent}        <value>${Number(convert(keys[0].value).toFixed(6))}</value>`;
  return `${indent}<filter>
${indent}  <effect>
${indent}    <name>${spec.name}</name>
${indent}    <effectid>${spec.id}</effectid>
${indent}    <effectcategory>${spec.category}</effectcategory>
${indent}    <effecttype>${spec.type}</effecttype>
${indent}    <mediatype>${spec.media}</mediatype>
${indent}    <pproBypass>false</pproBypass>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>${spec.param}</parameterid>
${indent}      <name>${spec.paramName}</name>
${indent}      <valuemin>${spec.min}</valuemin>
${indent}      <valuemax>${spec.max}</valuemax>
${body}
${indent}    </parameter>
${indent}  </effect>
${indent}</filter>`;
};

/**
 * Text as a legacy FCP7 text generator. Premiere's importer maps these to a
 * title clip; how completely it does so varies by version, which is why the
 * same text is also written as a marker and, for captions, as a .srt sidecar.
 */
const generatorItemXml = (
  title: PreparedTitle,
  timeline: PreparedTimeline,
  indent: string,
): string => {
  const style = title.style ?? {};
  const rgb = toRgb255(style.color);
  const alignment = style.alignment === "left" ? 0 : style.alignment === "right" ? 2 : 1;
  return `${indent}<generatoritem id="${title.id}">
${indent}  <name>${clean(title.name)}</name>
${indent}  <duration>${title.durationInFrames}</duration>
${rateXml(timeline.fps, `${indent}  `)}
${indent}  <start>${title.from}</start>
${indent}  <end>${title.from + title.durationInFrames}</end>
${indent}  <in>0</in>
${indent}  <out>${title.durationInFrames}</out>
${indent}  <alphatype>straight</alphatype>
${indent}  <effect>
${indent}    <name>Text</name>
${indent}    <effectid>Text</effectid>
${indent}    <effectcategory>Text</effectcategory>
${indent}    <effecttype>generator</effecttype>
${indent}    <mediatype>video</mediatype>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>str</parameterid>
${indent}      <name>Text</name>
${indent}      <value>${clean(title.text)}</value>
${indent}    </parameter>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>fontname</parameterid>
${indent}      <name>Font</name>
${indent}      <value>${clean(style.font ?? "Helvetica")}</value>
${indent}    </parameter>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>fontsize</parameterid>
${indent}      <name>Size</name>
${indent}      <valuemin>0</valuemin>
${indent}      <valuemax>1000</valuemax>
${indent}      <value>${style.fontSize ?? 63}</value>
${indent}    </parameter>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>fontcolor</parameterid>
${indent}      <name>Font Color</name>
${indent}      <value>
${indent}        <alpha>255</alpha>
${indent}        <red>${rgb.r}</red>
${indent}        <green>${rgb.g}</green>
${indent}        <blue>${rgb.b}</blue>
${indent}      </value>
${indent}    </parameter>
${indent}    <parameter authoringApp="PremierePro">
${indent}      <parameterid>alignment</parameterid>
${indent}      <name>Alignment</name>
${indent}      <valuemin>0</valuemin>
${indent}      <valuemax>2</valuemax>
${indent}      <value>${alignment}</value>
${indent}    </parameter>
${indent}  </effect>
${indent}</generatoritem>`;
};

const premiereMarkers = (timeline: PreparedTimeline, indent: string): string =>
  [
    ...timeline.markers,
    ...timeline.clips.flatMap((c) => c.markers ?? []),
    // Titles double as markers so the text survives even if the generator does not.
    ...timeline.titles.map((t) => ({
      name: t.name,
      from: t.from,
      durationInFrames: t.durationInFrames,
    })),
  ]
    .sort((a, b) => a.from - b.from)
    .map(
      (m) =>
        `${indent}<marker>\n${indent}  <comment></comment>\n${indent}  <name>${clean(
          m.name,
        )}</name>\n${indent}  <in>${m.from}</in>\n${indent}  <out>${
          m.durationInFrames ? m.from + m.durationInFrames : -1
        }</out>\n${indent}</marker>`,
    )
    .join("\n");

export const toPremiereXml = (timeline: PreparedTimeline): string => {
  const seenFiles = new Set<string>();
  const videoLanes = [...new Set(timeline.clips.filter((c) => c.lane >= 0).map((c) => c.lane))].sort(
    (a, b) => a - b,
  );
  const audioLanes = [...new Set(timeline.clips.filter((c) => c.lane < 0).map((c) => c.lane))].sort(
    (a, b) => b - a,
  );

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

  const linkXml = (entry: Entry, indent: string): string =>
    [
      entry.videoId
        ? `${indent}<link>\n${indent}  <linkclipref>${entry.videoId}</linkclipref>\n${indent}  <mediatype>video</mediatype>\n${indent}</link>`
        : "",
      entry.audioId
        ? `${indent}<link>\n${indent}  <linkclipref>${entry.audioId}</linkclipref>\n${indent}  <mediatype>audio</mediatype>\n${indent}</link>`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

  const clipitem = (entry: Entry, kind: "video" | "audio", indent: string): string => {
    const { clip } = entry;
    const id = kind === "video" ? entry.videoId! : entry.audioId!;
    const sourceTrack = `${indent}  <sourcetrack>\n${indent}    <mediatype>${kind}</mediatype>\n${indent}    <trackindex>1</trackindex>\n${indent}  </sourcetrack>`;
    const filters = [
      kind === "audio" && clip.gainDb !== undefined
        ? premiereFilter("audiolevels", clip.gainDb, dbToLinear, `${indent}  `)
        : "",
      kind === "video" && clip.opacity !== undefined
        ? premiereFilter("opacity", clip.opacity, (v) => v * 100, `${indent}  `)
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const markers = (clip.markers ?? [])
      .map(
        (m) =>
          `${indent}  <marker>\n${indent}    <comment></comment>\n${indent}    <name>${clean(
            m.name,
          )}</name>\n${indent}    <in>${m.from - clip.from + clip.startFrom}</in>\n${indent}    <out>-1</out>\n${indent}  </marker>`,
      )
      .join("\n");
    return [
      `${indent}<clipitem id="${id}">`,
      `${indent}  <masterclipid>masterclip-${clip.asset.id}</masterclipid>`,
      `${indent}  <name>${clean(clip.name)}</name>`,
      `${indent}  <enabled>TRUE</enabled>`,
      `${indent}  <duration>${clip.asset.durationFrames}</duration>`,
      rateXml(timeline.fps, `${indent}  `),
      `${indent}  <start>${clip.from}</start>`,
      `${indent}  <end>${clip.from + clip.durationInFrames}</end>`,
      `${indent}  <in>${clip.startFrom}</in>`,
      `${indent}  <out>${clip.startFrom + clip.durationInFrames}</out>`,
      fileXml(clip.asset, timeline.fps, `${indent}  `, seenFiles),
      sourceTrack,
      filters,
      markers,
      linkXml(entry, `${indent}  `),
      `${indent}</clipitem>`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const transitionItems = (lane: number, indent: string): string =>
    lane !== 0
      ? ""
      : timeline.transitions
          .map(
            (t) => `${indent}<transitionitem>
${indent}  <start>${t.from}</start>
${indent}  <end>${t.from + t.durationInFrames}</end>
${indent}  <alignment>center</alignment>
${rateXml(timeline.fps, `${indent}  `)}
${indent}  <effect>
${indent}    <name>Cross Dissolve</name>
${indent}    <effectid>Cross Dissolve</effectid>
${indent}    <effectcategory>Dissolve</effectcategory>
${indent}    <effecttype>transition</effecttype>
${indent}    <mediatype>video</mediatype>
${indent}    <wipecode>0</wipecode>
${indent}    <wipeaccuracy>100</wipeaccuracy>
${indent}    <startratio>0</startratio>
${indent}    <endratio>1</endratio>
${indent}    <reverse>FALSE</reverse>
${indent}  </effect>
${indent}</transitionitem>`,
          )
          .join("\n");

  const videoTracks = videoLanes
    .map((lane) => {
      const items = entries
        .filter((e) => e.clip.lane === lane && e.videoId)
        .map((e) => clipitem(e, "video", "          "))
        .join("\n");
      return [
        `        <track>`,
        items,
        transitionItems(lane, "          "),
        `          <enabled>TRUE</enabled>`,
        `          <locked>FALSE</locked>`,
        `        </track>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  // Titles ride on a track of their own, above the media.
  const titleTrack =
    timeline.titles.length > 0
      ? `        <track>
${timeline.titles.map((t) => generatorItemXml(t, timeline, "          ")).join("\n")}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>`
      : "";

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

  const { ntsc } = premiereRate(timeline.fps);
  const markers = premiereMarkers(timeline, "    ");
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
${titleTrack}
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
${markers}
  </sequence>
</xmeml>
`.replace(/^\s*\n/gm, "");
};

// ── OpenTimelineIO ───────────────────────────────────────────────────────────

export const toOtio = (timeline: PreparedTimeline): string => {
  const rate = timeline.fps;
  const time = (frames: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: frames });
  const range = (start: number, duration: number) => ({
    OTIO_SCHEMA: "TimeRange.1",
    start_time: time(start),
    duration: time(duration),
  });
  const markersOf = (items: MarkerElement[], origin: number) =>
    items.map((m) => ({
      OTIO_SCHEMA: "Marker.2",
      name: m.name,
      color: m.kind === "chapter" ? "GREEN" : "RED",
      marked_range: range(m.from - origin, Math.max(1, m.durationInFrames ?? 1)),
    }));

  const lanes = [...new Set(timeline.clips.map((c) => c.lane))].sort((a, b) => b - a);
  const mediaTracks = lanes.map((lane) => {
    const clips = timeline.clips.filter((c) => c.lane === lane).sort((a, b) => a.from - b.from);
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
      const effects = [];
      if (c.gainDb !== undefined) {
        effects.push({
          OTIO_SCHEMA: "Effect.1",
          name: "Gain",
          effect_name: "Gain",
          metadata: { retime: { gain_db: c.gainDb } },
        });
      }
      if (c.opacity !== undefined) {
        effects.push({
          OTIO_SCHEMA: "Effect.1",
          name: "Opacity",
          effect_name: "Opacity",
          metadata: { retime: { opacity: c.opacity } },
        });
      }
      children.push({
        OTIO_SCHEMA: "Clip.1",
        name: c.name,
        source_range: range(c.startFrom, c.durationInFrames),
        effects,
        markers: markersOf(c.markers ?? [], c.from - c.startFrom),
        media_reference: {
          OTIO_SCHEMA: "ExternalReference.1",
          name: c.asset.name,
          target_url: c.asset.url,
          available_range: range(0, c.asset.durationFrames),
        },
        metadata: {
          retime: {
            timeline_start: c.from,
            source: c.asset.absPath ?? c.asset.url,
            role: c.role,
          },
        },
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

  // Titles keep their text in a generator reference, on a track of their own.
  const titleTrack =
    timeline.titles.length > 0
      ? [
          {
            OTIO_SCHEMA: "Track.1",
            name: "Titles",
            kind: "Video",
            children: (() => {
              const children: unknown[] = [];
              let cursor = 0;
              for (const t of [...timeline.titles].sort((a, b) => a.from - b.from)) {
                if (t.from > cursor) {
                  children.push({
                    OTIO_SCHEMA: "Gap.1",
                    name: "Gap",
                    source_range: range(0, t.from - cursor),
                  });
                }
                children.push({
                  OTIO_SCHEMA: "Clip.1",
                  name: t.name,
                  source_range: range(0, t.durationInFrames),
                  media_reference: {
                    OTIO_SCHEMA: "GeneratorReference.1",
                    name: t.name,
                    generator_kind: "Text",
                    parameters: { text: t.text, style: t.style ?? {}, position: t.position ?? null },
                    available_range: range(0, t.durationInFrames),
                  },
                  metadata: { retime: { timeline_start: t.from, lane: t.lane } },
                });
                cursor = t.from + t.durationInFrames;
              }
              return children;
            })(),
          },
        ]
      : [];

  return `${JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: timeline.name,
      global_start_time: time(0),
      metadata: {
        retime: {
          fps: timeline.fps,
          width: timeline.width,
          height: timeline.height,
          captions: timeline.captions.map((c) => ({
            text: c.text,
            from: c.from,
            durationInFrames: c.durationInFrames,
            language: c.language,
          })),
          transitions: timeline.transitions,
        },
      },
      tracks: {
        OTIO_SCHEMA: "Stack.1",
        name: timeline.name,
        children: [...mediaTracks, ...titleTrack],
        markers: markersOf(timeline.markers, 0),
      },
    },
    null,
    2,
  )}\n`;
};
