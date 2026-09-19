# Quickstart

1. Build:

```bash
cd retime
npm install
npm run build
```

2. Export the sample manifest in all three formats:

```bash
node ./dist/cli.js --manifest ./example/timeline.json --format fcpxml --out ./example/out.fcpxml
node ./dist/cli.js --manifest ./example/timeline.json --format premiere --out ./example/out.xml
node ./dist/cli.js --manifest ./example/timeline.json --format otio --out ./example/out.otio
```

3. Use the same data in code:

```ts
import { exportTimeline } from "./dist/export";

const clips = [
  { src: "static/intro.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "static/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
];

console.log(exportTimeline(clips, 30, "otio", "demo"));
```

Next: `manifest-format.md` for the JSON shape, `player-integration.md` for the browser button.
