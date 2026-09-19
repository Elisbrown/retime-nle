# Manifest format

The CLI reads a JSON `TimelineManifest` (`src/types.ts:12`):

```ts
type Clip = {
  src: string;              // asset path or URL, e.g. "static/intro.mp4"
  from: number;             // timeline start, integer frames, >= 0
  durationInFrames: number; // integer frames, > 0
  name?: string;            // defaults to "Clip N"
  startFrom?: number;       // source in-point in frames, defaults to 0
};

type TimelineManifest = {
  fps: number;
  clips: Clip[];
  compositionId?: string;   // defaults to "retime-timeline"
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

Tip: keep one `clips.ts` in your Remotion project and import it in both your composition and your export script so render and NLE output cannot drift.
