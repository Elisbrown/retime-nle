# Troubleshooting

- `Unknown format: X` — `--format` must be `fcpxml`, `premiere`, or `otio` (case-sensitive).
- `Clip N: missing src` / `invalid from` / `invalid durationInFrames` — thrown by `validateTimeline` (`src/export.ts:4`). `from` must be an integer `>= 0`; `durationInFrames` an integer `> 0`.
- `Invalid fps` — `--fps` or `manifest.fps` must be a finite number `> 0`. Non-integer fps (e.g. `29.97`) is accepted; frame fields must still be integers.
- CLI prints usage and exits 1 — `--manifest` was omitted.
- Custom controls don't appear — `Player` needs the `controls` prop; `renderCustomControls` only renders in the controls bar.
- Downloaded filename looks wrong — it is `${compositionId}.${extensionFor(format)}`; pass `--id` (CLI) or `compositionId` (button) explicitly.
- Remotion types missing at build — `src/remotion-shim.d.ts` stubs `remotion`/`@remotion/player` so `npm run build` works without installing them. Install the real packages in your app project.
