# CLI reference

Built file: `dist/cli.js` (from `src/cli.ts`). Binary names: `retime-nle`, alias `retime`.

## Usage

```bash
retime-nle --manifest ./timeline.json [--format fcpxml|premiere|otio] [options]
```

Supports both `--flag value` and `--flag=value`.

### Timeline

| Flag | Default | Meaning |
| --- | --- | --- |
| `--manifest` | — (required) | Path to `TimelineManifest` JSON |
| `--format` | `fcpxml` | `fcpxml`, `premiere`, or `otio` |
| `--all-formats` | off | Write all three formats |
| `--fps` | `manifest.fps` | Override the manifest fps |
| `--id` | `manifest.compositionId ?? "retime-timeline"` | Project/sequence name |
| `--out` | `<manifestDir>/<id>.<ext>` | Output file; parent dirs are created |
| `--width` / `--height` | the first video asset's real size | Sequence dimensions |

### Assets

| Flag | Default | Meaning |
| --- | --- | --- |
| `--assets` | `link` | `link`, `copy`, or `auto` — see [assets](assets.md) |
| `--assets-dir` | `<out basename>_assets` | Where copies go |
| `--max-copy-mb` | `100` | Size limit for `auto` |
| `--asset-root` | manifest folder | Directory relative srcs resolve against |
| `--public-dir` | — | Remotion `public/` folder, for `staticFile()` srcs |
| `--path-map A=B` | — | Rewrite resolved path prefix A to B (repeatable) |
| `--no-probe` | off | Skip `ffprobe`; guess stream layout from filenames |
| `--fcpxml-version` | `1.10` | `1.9` for Final Cut 10.4.9–10.5, `1.10` for 10.6+ |

### Reporting

| Flag | Meaning |
| --- | --- |
| `--strict` | Exit 1 if any asset file is missing |
| `--json` | Print a machine-readable asset report |
| `--quiet` | Errors only |
| `--help`, `-h` | Print usage |

Extensions: `premiere` -> `.xml`, `otio` -> `.otio`, else `.fcpxml`.

## Example

```bash
retime-nle \
  --manifest ./src/retime/timeline.json \
  --format fcpxml \
  --public-dir ./public \
  --assets auto --max-copy-mb 50 \
  --out ./out/nle/promo.fcpxml \
  --strict
```

```text
Wrote ./out/nle/promo.fcpxml (fcpxml, 10 clips @ 30fps, 1080x1920)
  [ok] intro -> /Users/me/promo/out/nle/promo_assets/intro.mp4
  [ok] master -> /Users/me/promo/out/master.mp4
  ! master: over the copy threshold — linked at /Users/me/promo/out/master.mp4
```

Exit cases:

- missing `--manifest` -> usage, exit 1
- unknown `--format` / `--assets` -> message, exit 1
- invalid JSON, bad fps, or bad clip -> error from `validateTimeline`, exit 1
- `--strict` with any missing asset -> exit 1
