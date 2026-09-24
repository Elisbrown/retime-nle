# Using retime-nle in your Remotion project

End-to-end guide for someone who ran `npm install retime-nle` inside their own Remotion project (created with `create-video` or similar). Assumes Remotion 4+, React 18+, Node 18+.

## 1. Install

```bash
cd your-remotion-project
npm install retime-nle
```

What you get:

- `retime-nle` — framework-free core (`exportTimeline`, manifest types). No extra peers.
- `retime-nle/react` — `ReTimeTrack`, `ReTimeExportButtons`. Uses your project's existing `react`, `remotion`, `@remotion/player`.
- `retime-nle` / `retime` binaries — the CLI (`npx retime-nle --help`).

## 2. Declare the timeline once (`src/retime/clips.ts`)

```ts
import type { Clip } from "retime-nle";

export const fps = 30;
export const compositionId = "demo-timeline";

export const clips: Clip[] = [
  { src: "/footage/intro.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "/footage/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
  { src: "/footage/outro.mp4", from: 240, durationInFrames: 60, name: "Outro" },
];
```

Rules (enforced by `validateTimeline`):

- `from`: integer frames, `>= 0`. `durationInFrames`: integer frames, `> 0`.
- `src`: where the media lives. Use the `staticFile()` value (`/footage/intro.mp4`), a path relative to the manifest, or an absolute path — the exporter resolves it to an absolute `file://` URL and tells you if the file is not there. Pass `--public-dir ./public` so `staticFile()` srcs resolve. See [assets](assets.md).
- `startFrom` (optional): in-point into the source file, in frames. Defaults to `0`.

Field reference: [manifest-format](manifest-format.md). A ready-made example lives in the package repo at `example/clips.ts`.

## 3. Render it in your composition

```tsx
// src/MyComp.tsx
import { ReTimeTrack } from "retime-nle/react";
import { clips } from "./retime/clips";

export const MyComp: React.FC = () => <ReTimeTrack clips={clips} />;
```

Match your composition to the timeline or render and export will disagree:

- Composition `fps` = the same `fps` you export with.
- Composition `durationInFrames` = `max(from + durationInFrames)` over all clips (300 in the example above).
- To customize per-clip rendering, pass `renderClip={(clip, i) => …}`.

## 4. Export the NLE timeline

Pick CLI or code — both read the same `clips` array, so output is identical.

**Option A — CLI with a manifest file.** Save the manifest next to the clips module (`src/retime/timeline.json`, same shape as `TimelineManifest`):

```json
{
  "fps": 30,
  "compositionId": "demo-timeline",
  "clips": [
    { "src": "static/intro.mp4", "from": 0, "durationInFrames": 90, "name": "Intro" },
    { "src": "static/main.mp4", "from": 90, "durationInFrames": 150, "name": "Main", "startFrom": 12 },
    { "src": "static/outro.mp4", "from": 240, "durationInFrames": 60, "name": "Outro" }
  ]
}
```

```bash
npx retime-nle --manifest ./src/retime/timeline.json --public-dir ./public --all-formats --out ./out/nle/demo.fcpxml --strict
```

Flag details: [cli-reference](cli-reference.md).

**Option B — export from code** (e.g. a Remotion render script or post-render step):

```ts
import { exportProject } from "retime-nle";
import { clips, fps, compositionId } from "./retime/clips";

const { missing } = exportProject(clips, fps, {
  format: "fcpxml",
  compositionId,
  publicDir: "./public",
  assets: "auto",
  outPath: "./out/nle/demo.fcpxml",
});
if (missing.length) console.warn("Offline media:", missing);
```

## 5. Optional: in-browser export buttons (Player preview)

If you preview compositions with `@remotion/player`, add download buttons to the controls bar (full example in the package repo at `example/player-usage.tsx`):

```tsx
import { Player } from "@remotion/player";
import { ReTimeExportButtons } from "retime-nle/react";
import { clips, fps, compositionId } from "./retime/clips";

<Player
  component={MyComp}
  durationInFrames={300}
  compositionWidth={1920}
  compositionHeight={1080}
  fps={fps}
  controls
  renderCustomControls={() => (
    <ReTimeExportButtons clips={clips} fps={fps} compositionId={compositionId} />
  )}
/>
```

`controls` must be set or the slot never renders. The buttons download `<compositionId>.fcpxml` / `.xml` / `.otio` client-side. Setup notes: [player-integration](player-integration.md).

Stock Remotion Studio has no third-party menu slot — for Studio workflows use the CLI (Option A) or a code step (Option B).

## 6. Hand off to the NLE

- **Premiere Pro**: `File > Import`, select the `.xml`. Check clip order and in/out points against `startFrom`.
- Media that has moved since export: relink in the NLE, or re-export with `--path-map OLD=NEW`.
- **DaVinci Resolve**: `File > Import > Timeline`, select the `.otio`; relink offline media to your local assets folder.
- **Final Cut Pro**: import the `.fcpxml`.

If frames drift, confirm the NLE sequence timebase equals your `fps`. Walkthrough: [tutorials/03-premiere-workflow](tutorials/03-premiere-workflow.md).

## Troubleshooting

- `Clip N: missing src / invalid from / invalid durationInFrames` — fix the offending clip; frames must be integers.
- Buttons invisible — `Player` needs the `controls` prop.
- Wrong filename — set `compositionId` (button prop) or `--id` (CLI).

More: [troubleshooting](troubleshooting.md).
