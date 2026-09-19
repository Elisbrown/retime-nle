# Tutorial 1 — First export (CLI)

Goal: generate your first `.fcpxml` from JSON in under 5 minutes.

1. Install and build:

```bash
cd retime
npm install
npm run build
```

2. Look at `example/timeline.json` (see `docs/manifest-format.md` for field rules).

3. Export:

```bash
node ./dist/cli.js --manifest ./example/timeline.json --format fcpxml --out ./example/out.fcpxml
```

Expected output:

```text
Wrote ./example/out.fcpxml (fcpxml, 3 clips @ 30fps)
```

4. Open `example/out.fcpxml` and confirm your three `<clip>` rows with `offset`/`duration` values.

5. Repeat for the other formats:

```bash
node ./dist/cli.js --manifest ./example/timeline.json --format premiere --out ./example/out.xml
node ./dist/cli.js --manifest ./example/timeline.json --format otio --out ./example/out.otio
```

Next: `02-player-buttons.md` to trigger the same export from the browser.
