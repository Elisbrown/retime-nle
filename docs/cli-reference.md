# CLI reference

Built file: `dist/cli.js` (from `src/cli.ts:17`). Binary names: `retime-nle` (alias: `retime`) (`package.json`).

## Usage

```bash
node ./dist/cli.js --manifest ./timeline.json --format fcpxml|premiere|otio [--fps 30] [--out ./out.timeline] [--id my-comp]
```

Supports both `--flag value` and `--flag=value`.

| Flag | Required | Default | Meaning |
| --- | --- | --- | --- |
| `--manifest` | yes | — | Path to `TimelineManifest` JSON |
| `--format` | no | `fcpxml` | `fcpxml`, `premiere`, or `otio` |
| `--fps` | no | `manifest.fps` | Overrides manifest fps |
| `--id` | no | `manifest.compositionId ?? "retime-timeline"` | Output timeline/project name |
| `--width` | no | `manifest.width ?? 1920` | Frame width for the FCPXML `<format>` resource |
| `--height` | no | `manifest.height ?? 1080` | Frame height for the FCPXML `<format>` resource |
| `--out` | no | `<manifestDir>/<id>.<ext>` | Output path; parent dirs created |

Extensions (`src/export.ts:31`, `extensionFor`): `premiere` -> `.xml`, `otio` -> `.otio`, else `.fcpxml`.

Exit cases:

- missing `--manifest` -> prints usage, exit 1
- unknown `--format` -> `Unknown format: X`, exit 1
- invalid JSON, bad fps, or bad clip -> throws from `validateTimeline`

`package.json` shortcut (fcpxml sample only):

```bash
npm run export:sample
```
