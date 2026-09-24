# Manifest format

The CLI reads a JSON `TimelineManifest` (`src/types.ts:12`):

```ts
type Clip = {
  src: string;              // asset path or URL — see docs/assets.md
  from: number;             // timeline start, integer frames, >= 0
  durationInFrames: number; // integer frames, > 0
  name?: string;            // defaults to "Clip N"
  startFrom?: number;       // source in-point in frames, defaults to 0
  lane?: number;            // 0 = primary storyline, >0 above, <0 audio below
};

type TimelineManifest = {
  fps: number;
  clips: Clip[];
  compositionId?: string;   // defaults to "retime-timeline"
  width?: number;           // sequence width, defaults to the first video asset's real width
  height?: number;          // sequence height, defaults to its real height
  assetRoot?: string;       // directory relative srcs resolve against
  publicDir?: string;       // Remotion public/ folder, for staticFile() srcs
};
```

Example (`example/timeline.json`):

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

Validation (`src/export.ts:4`, `validateTimeline`):

- `fps` must be finite and `> 0`
- every clip needs non-empty `src`
- `from` must be an integer `>= 0`
- `durationInFrames` must be an integer `> 0`

`src` accepts `staticFile()` values, Studio URLs, relative paths and absolute
paths; the exporter resolves each one and reports what it could not find. See
[assets](assets.md).

Overlapping clips are laid out automatically — the first gets the primary
storyline, the rest become connected clips above it, and audio-only sources go
below. Set `lane` explicitly to override.

Tip: keep one `clips.ts` in your Remotion project and import it in both your composition and your export script so render and NLE output cannot drift.
