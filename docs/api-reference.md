# API reference

Two entry points:

- `retime-nle` (`src/index.ts`) — framework-free core: codecs, validation, CLI helpers. No `react`/`remotion` required.
- `retime-nle/react` (`src/react.ts`) — `ReTimeTrack`, `ReTimeExportButtons`. Requires the `react` peer (`remotion` for the track, `@remotion/player` for the Player slot).

## `exportProject(clips, fps, options?)` — Node

`src/node.ts`. The one to use in a script or render pipeline: resolves every
`src` to a real file, reads its properties with `ffprobe`, optionally copies
assets next to the export, serializes, and writes the file when `outPath` is
set.

```ts
import { exportProject } from "retime-nle";

const { text, missing, warnings, timeline } = exportProject(clips, 30, {
  format: "fcpxml",          // "fcpxml" | "premiere" | "otio"
  compositionId: "promo",
  publicDir: "./public",     // where staticFile() srcs live
  assetRoot: "./out",        // where relative srcs live
  assets: "auto",            // "link" | "copy" | "auto"
  maxCopyBytes: 50 * 1024 * 1024,
  pathMap: [["/render", "/Volumes/Edit"]],
  outPath: "./out/nle/promo.fcpxml",
  strict: true,              // throw if any asset is missing
});
```

Returns `{ text, outPath, timeline, warnings, missing, copied }`. `timeline` is
the resolved model (assets with real durations, sizes, lanes) if you want to
report on it yourself. Asset behavior: [assets](assets.md).

## `prepareTimeline(clips, fps, options?)` — Node

Same resolution step without serializing. Returns a `PreparedTimeline`.

## `exportTimeline(clips, fps, format, compositionId?, options?)`

`src/export.ts`. Filesystem-free: validates, lays clips out into lanes, and
serializes with the srcs exactly as given. This is what the browser buttons use.
In Node prefer `exportProject`, which resolves and checks the media — a `src`
passed through here must already be a URL the NLE can open.

```ts
import { exportTimeline } from "retime-nle";

exportTimeline(clips, 30, "fcpxml", "demo-timeline"); // .fcpxml XML
exportTimeline(clips, 30, "premiere", "demo-timeline"); // Premiere .xml
exportTimeline(clips, 30, "otio", "demo-timeline"); // .otio JSON
```

## `validateTimeline(clips, fps)`

`src/export.ts:4`. Throws `Invalid fps`, `Clip N: missing src`, `invalid from`, or `invalid durationInFrames`.

## `extensionFor(format)` / `mimeFor(format)`

`src/export.ts:31`. Used by both CLI default output path and browser download names.

## Codecs

`src/codecs.ts`:

All three take a `PreparedTimeline` (from `prepareTimeline` or `buildTimeline`):

- `toFcpxml(timeline)` — FCPXML 1.10 with a DOCTYPE, one `<format>` per distinct
  frame size, one `<asset>` per source (with `uid`, real duration, video/audio
  attributes and a `<media-rep>` URL), explicit `<gap>` elements, connected
  clips on lanes, and `<video>` elements for stills. Times are exact rationals
  derived from the frame duration, so 29.97 stays frame-aligned.
- `toPremiereXml(timeline)` — xmeml v5: `<rate><timebase>/<ntsc></rate>`,
  sequence `<samplecharacteristics>`, `<file>` defined once then referenced by
  id, `<pathurl>` as a `file://` URL, and linked video/audio clipitems.
- `toOtio(timeline)` — `Timeline.1` JSON, one `Track.1` per lane (Video above,
  Audio below), `Gap.1` fillers, and `ExternalReference.1` with
  `available_range` from the real media.

## React entry (`retime-nle/react`)

```tsx
import { ReTimeExportButtons, ReTimeTrack } from "retime-nle/react";
```

- `ReTimeTrack({ clips, renderClip? })` (`src/Timeline.tsx:15`) — renders one Remotion `Sequence` per clip.
- `ReTimeExportButtons({ clips, fps, compositionId? })` (`src/controls.tsx:27`) — client-side download buttons for all three formats. Drop into Player `renderCustomControls` (see `player-integration.md`).
