# API reference

Two entry points:

- `retime-nle` (`src/index.ts`) — framework-free core: codecs, validation, CLI helpers. No `react`/`remotion` required.
- `retime-nle/react` (`src/react.ts`) — `ReTimeTrack`, `ReTimeExportButtons`. Requires the `react` peer (`remotion` for the track, `@remotion/player` for the Player slot).

## `exportTimeline(clips, fps, format, compositionId?, options?)`

`src/export.ts:19`. Validates, then dispatches to a codec. Returns `string` (XML text or OTIO JSON text). Throws on invalid input. `options` (`TimelineOptions`: `{ width?, height? }`, default 1920x1080) sets the FCPXML `<format>` resource; other formats ignore it.

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

- `toFcpxml(clips, fps, compositionId, opts?)` — FCPXML 1.10 with a `<resources>` block (one `<format>`, one `<asset>` per unique `src`, each carrying a `<media-rep kind="original-media" src="…">` child) and `<asset-clip ref="…">` entries in the spine. Times as `frames/fps` rationals (`12/30s`), XML-escaped names/paths. `opts.width/height` default to 1920x1080.
- `toPremiereXml(clips, fps, compositionId)` — xmeml v4 with `<timebase>fps</timebase>`, per-clip `<start>/<end>/<in>/<out>` in frames.
- `toOtio(clips, fps, compositionId)` — `Timeline.1` JSON with one Video `Track.1`, `RationalTime.1` values, `ExternalReference.1` URLs.

Clips are sorted by `from` before serializing.

## React entry (`retime-nle/react`)

```tsx
import { ReTimeExportButtons, ReTimeTrack } from "retime-nle/react";
```

- `ReTimeTrack({ clips, renderClip? })` (`src/Timeline.tsx:15`) — renders one Remotion `Sequence` per clip.
- `ReTimeExportButtons({ clips, fps, compositionId? })` (`src/controls.tsx:27`) — client-side download buttons for all three formats. Drop into Player `renderCustomControls` (see `player-integration.md`).
