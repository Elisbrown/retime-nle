# Troubleshooting

- `Unknown format: X` — `--format` must be `fcpxml`, `premiere`, or `otio` (case-sensitive).
- `Clip N: missing src` / `invalid from` / `invalid durationInFrames` — thrown by `validateTimeline` (`src/export.ts:4`). `from` must be an integer `>= 0`; `durationInFrames` an integer `> 0`.
- `Invalid fps` — `--fps` or `manifest.fps` must be a finite number `> 0`. Non-integer fps (e.g. `29.97`) is accepted; frame fields must still be integers.
- CLI prints usage and exits 1 — `--manifest` was omitted.
- Custom controls don't appear — `Player` needs the `controls` prop; `renderCustomControls` only renders in the controls bar.
- Downloaded filename looks wrong — it is `${compositionId}.${extensionFor(format)}`; pass `--id` (CLI) or `compositionId` (button) explicitly.
- Final Cut Pro: `No declaration for attribute "src" of element "clip"` — you are on retime-nle 0.1.0, whose FCPXML put `src` on `<clip>`. Upgrade to 0.1.2+, which emits `<resources>` + `<asset-clip ref="…">` per the FCPXML DTD.
- Final Cut Pro: `No declaration for attribute "src" of element "asset"` — same cause on 0.1.1, which put `src` on `<asset>`. Upgrade to 0.1.2+, which nests the path in `<media-rep kind="original-media" src="…">` inside each asset.
- FCP import shows the wrong frame size — set `--width`/`--height` (CLI) or `width`/`height` (manifest / `exportTimeline` options). Defaults are 1920x1080.
- Remotion types missing at build — `src/remotion-shim.d.ts` stubs `remotion`/`@remotion/player` so `npm run build` works without installing them. Install the real packages in your app project.
