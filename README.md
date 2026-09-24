# retime-nle — Remotion Timeline Exporter for Final Cut Pro, Premiere Pro & OpenTimelineIO

[![npm version](https://img.shields.io/npm/v/retime-nle.svg)](https://www.npmjs.com/package/retime-nle)
[![license: MIT](https://img.shields.io/npm/l/retime-nle.svg)](https://github.com/Elisbrown/retime-nle/blob/main/LICENSE)
[![node >= 18](https://img.shields.io/node/v/retime-nle.svg)](https://github.com/Elisbrown/retime-nle)

Export a [Remotion](https://github.com/remotion-dev/remotion) video timeline to a professional NLE in one step: **Final Cut Pro (FCPXML `.fcpxml`)**, **Adobe Premiere Pro (XML `.xml`)**, or **OpenTimelineIO (OTIO `.otio`, DaVinci Resolve compatible)**.

Declare your timeline once as a `Clip[]` array, render it with Remotion, and export the same data everywhere. No fork of Remotion Studio. No background server. No AST parsing.

## Contents

- [Features](#features)
- [Install](#install)
- [Quickstart](#quickstart)
- [Export formats](#export-formats)
- [Core idea](#core-idea)
- [Usage](#usage)
  - [CLI](#cli)
  - [Programmatic export](#programmatic-export)
  - [Remotion render component](#remotion-render-component)
  - [Player export buttons](#player-export-buttons)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Credits](#credits)
- [Author](#author)
- [License](#license)

## Features

- **Three NLE formats** from one timeline: FCPXML 1.10, Premiere xmeml v5, OTIO `Timeline.1` JSON.
- **Media that actually links**: every `src` — `staticFile()` value, Studio URL, relative or absolute path — is resolved to an absolute `file://` URL, checked on disk, and reported. Missing files are named instead of silently importing as red frames.
- **Assets travel with the edit**: `--assets copy` bundles everything next to the timeline, `--assets auto` copies the light files and links the heavy ones by path.
- **Real media properties**: with `ffprobe` on `PATH`, durations, frame size and audio layout come from the files, so a vertical project stays vertical.
- **Multi-track aware**: overlapping clips become connected clips on their own lanes, audio-only sources sit below the storyline, and holes become explicit gaps.
- **Single source of truth**: the same `Clip[]` drives the Remotion render and every export, so edits and XML can never drift apart.
- **Zero-dependency core**: the `retime-nle` entry and CLI run on plain Node 18+ — no React needed.
- **Remotion-ready React entry** (`retime-nle/react`): `ReTimeTrack` wraps clips in Remotion `Sequence`s; `ReTimeExportButtons` drops into `@remotion/player` custom controls for in-browser downloads.
- **Validated input**: frame-accurate integer checks with clear errors before anything is written.

## Install

```bash
npm install retime-nle
```

Requirements: Node.js 18+. React 18+, `remotion` 4+, and `@remotion/player` 4+ are peer dependencies only for the `retime-nle/react` entry (see [installation](docs/installation.md)).

## Quickstart

CLI — export the bundled sample manifest to all three formats:

```bash
npx -p retime-nle retime-nle --manifest ./example/timeline.json --all-formats --public-dir ./public
```

Every run prints where each asset resolved to:

```text
Wrote ./example/demo-timeline.fcpxml (fcpxml, 3 clips @ 30fps, 1080x1920)
  [ok] intro -> /Users/me/promo/public/footage/intro.mp4
  [MISSING] outro -> /Users/me/promo/public/footage/outro.mp4
```

Code — export from any Node script:

```ts
import { exportProject } from "retime-nle";
import type { Clip } from "retime-nle";

const clips: Clip[] = [
  { src: "/footage/intro.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "/footage/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
];

const { text, missing } = exportProject(clips, 30, {
  format: "fcpxml",
  compositionId: "demo-timeline",
  publicDir: "./public",
  assets: "auto",
  outPath: "./out/nle/demo.fcpxml",
});
```

## Export formats

| Format | Flag | Extension | Opens in |
| --- | --- | --- | --- |
| Final Cut Pro XML | `fcpxml` | `.fcpxml` | Final Cut Pro |
| Premiere Pro XML | `premiere` | `.xml` | Premiere Pro |
| OpenTimelineIO | `otio` | `.otio` | DaVinci Resolve, OTIO tools |

Times are serialized as frame-exact `frames/fps` rationals (FCPXML), frame counts (Premiere), and `RationalTime` values (OTIO). Clips are sorted by `from` before serializing. Details: [api-reference](docs/api-reference.md).

## Core idea

```text
Clip[]  --->  ReTimeTrack (Remotion render)
        --->  exportTimeline() (FCPXML / Premiere / OTIO)
        --->  CLI manifest JSON (same shape)
```

If render and export disagree, two different arrays were passed. Keep one `clips.ts` module (see `example/clips.ts`) and import it everywhere.

## Usage

New here? Start with [Using retime-nle in your Remotion project](docs/remotion-project-guide.md) — install, `clips.ts`, composition wiring, export, NLE handoff.

### CLI

```bash
retime-nle --manifest ./timeline.json --format fcpxml|premiere|otio [--fps 30] [--out ./out.timeline] [--id my-comp]
retime-nle --help
```

The `retime` command is shipped as a convenience alias. Full flag reference: [cli-reference](docs/cli-reference.md). Manifest schema: [manifest-format](docs/manifest-format.md).

### Assets

```bash
retime-nle --manifest ./timeline.json --assets link   # reference files in place (default)
retime-nle --manifest ./timeline.json --assets copy   # bundle everything next to the export
retime-nle --manifest ./timeline.json --assets auto --max-copy-mb 100
```

`auto` is the answer to "ship the whole project, or at least paths for the heavy
stuff": graphics, stings and voice-over are copied beside the timeline, and
multi-gigabyte masters are linked by absolute path. Full behavior, including
`--path-map` for render-farm-to-edit-suite path rewriting: [assets](docs/assets.md).

### Programmatic export

```ts
import { exportProject } from "retime-nle";              // Node: resolves + checks media
import { exportTimeline, extensionFor, mimeFor } from "retime-nle"; // browser-safe
```

Signatures and error cases: [api-reference](docs/api-reference.md).

### Remotion render component

```tsx
import { ReTimeTrack } from "retime-nle/react";
import { clips } from "./clips";

export const MyComp: React.FC = () => <ReTimeTrack clips={clips} />;
```

Each clip becomes a Remotion `Sequence` with matching `from`/`durationInFrames`. Pass `renderClip` to customize per-clip rendering.

### Player export buttons

```tsx
import { ReTimeExportButtons } from "retime-nle/react";

<Player
  controls
  renderCustomControls={() => (
    <ReTimeExportButtons clips={clips} fps={30} compositionId="demo" />
  )}
  {...playerProps}
/>
```

Pure client-side `Blob` download — no server round-trip. Full example: `example/player-usage.tsx`. Setup guide: [player-integration](docs/player-integration.md), [tutorial](docs/tutorials/02-player-buttons.md).

## Repository layout

```text
retime-nle/
  README.md
  LICENSE
  package.json
  tsconfig.json
  src/
    types.ts       # Clip, TimelineManifest, ExportFormat, AssetMode
    model.ts       # PreparedTimeline: resolved assets, lanes, formats
    paths.ts       # src resolution, file:// URLs, path mapping
    probe.ts       # ffprobe media properties
    prepare.ts     # resolve + probe + copy assets -> PreparedTimeline
    rational.ts    # exact frame-duration time math
    layout.ts      # validation, lane packing
    codecs.ts      # toFcpxml, toPremiereXml, toOtio
    export.ts      # browser-safe exportTimeline, extensionFor, mimeFor
    node.ts        # exportProject (resolves media, writes the file)
    cli.ts         # bin: retime-nle (alias: retime)
    index.ts       # public core entry (retime-nle)
    react.ts       # public React entry (retime-nle/react)
    Timeline.tsx   # ReTimeTrack (Remotion Sequence wrapper)
    controls.tsx   # ReTimeExportButtons (Player custom controls)
  example/
    timeline.json      # sample manifest
    clips.ts           # shared Clip[] source of truth
    player-usage.tsx   # Player + renderCustomControls example
  docs/
    installation.md
    remotion-project-guide.md
    quickstart.md
    manifest-format.md
    cli-reference.md
    player-integration.md
    api-reference.md
    troubleshooting.md
    publishing.md
    publishing.md
    tutorials/
      01-first-export.md
      02-player-buttons.md
      03-premiere-workflow.md
```

## Documentation

- [Installation](docs/installation.md) — npm, peers per entry point, build scripts
- [Using retime-nle in your Remotion project](docs/remotion-project-guide.md) — consumer end-to-end guide
- [Quickstart](docs/quickstart.md) — first export in minutes
- [Assets](docs/assets.md) — how sources are resolved, copy vs link, relinking
- [Manifest format](docs/manifest-format.md) — `Clip` / `TimelineManifest` schema and validation rules
- [CLI reference](docs/cli-reference.md) — flags, defaults, exit cases
- [Player integration](docs/player-integration.md) — `renderCustomControls` wiring
- [API reference](docs/api-reference.md) — core + React entries, codecs
- [Troubleshooting](docs/troubleshooting.md) — common errors
- [Publishing](docs/publishing.md) — release checklist for maintainers
- Tutorials: [first export](docs/tutorials/01-first-export.md) · [player buttons](docs/tutorials/02-player-buttons.md) · [Premiere/Resolve handoff](docs/tutorials/03-premiere-workflow.md)

## Credits

- **Sunyin Elisbrown** — author and maintainer ([@Elisbrown](https://github.com/Elisbrown)).
- **[Remotion](https://github.com/remotion-dev/remotion)** — the React video framework this package integrates with (`Sequence`, `Player`, `renderCustomControls`).
- **[OpenTimelineIO](https://opentimeline.io/)** — the open interchange format behind the `.otio` export.

## Author

Sunyin Elisbrown — <sunyinelisbrown@gmail.com> — [github.com/Elisbrown](https://github.com/Elisbrown). Issues: [github.com/Elisbrown/retime-nle/issues](https://github.com/Elisbrown/retime-nle/issues).

## License

MIT — see [LICENSE](LICENSE).
