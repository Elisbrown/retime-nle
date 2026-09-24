# Elements: what crosses over, and how

A Remotion composition is React code. An NLE timeline is clips, keyframes and
effects from the editor's own library. Everything your project holds as *data*
can become editable data in the NLE; everything it computes as *code* can only
arrive as pixels. This page is the map between the two.

## What each format can carry

| Element | Final Cut (FCPXML) | Premiere (xmeml) | Resolve (OTIO) |
| --- | --- | --- | --- |
| Media clips, in/out, lanes | editable | editable | editable |
| Audio level, constant | `<adjust-volume>` | `audiolevels` filter | metadata only |
| Audio level, keyframed | real keyframes | real keyframes | metadata only |
| Opacity | `<adjust-opacity>` | `opacity` filter | metadata only |
| Position / scale | `<adjust-transform>` | — | metadata only |
| Text | `<title>` — editable text, font, size, colour, position | legacy text generator + marker | generator reference + marker |
| Captions | `<caption>` with a language role | `.srt` sidecar | `.srt` sidecar + metadata |
| Markers | `<marker>` / `<chapter-marker>` | sequence markers | `Marker.2` |
| Cross dissolve | `<transition>` | `<transitionitem>` | metadata |
| Bespoke animation | — | — | — |

Two honest caveats:

- **Premiere cannot read FCPXML.** It reads the legacy FCP7 XML, whose text
  generators current Premiere versions import inconsistently. That is why every
  title is also written as a marker and every caption as an `.srt`: the text
  reaches the editor even when the generator does not.
- **OTIO does not standardize generic effects.** A level curve written there is
  a note to the editor, not a guarantee of the mix. If the mix has to be exact
  in Resolve, render a stem and reference that instead. The exporter warns when
  a timeline with keyframed levels is written as OTIO.

## Declaring elements

```ts
import { exportProject } from "retime-nle";

exportProject(
  {
    clips: [
      { src: "out/master.mp4", from: 0, durationInFrames: 900, name: "Master" },
      {
        src: "public/audio/vo/c01.mp3",
        from: 3,
        durationInFrames: 120,
        name: "VO C01",
        role: "dialogue",
        lane: -1,
      },
      {
        src: "public/audio/music.mp3",
        from: 0,
        durationInFrames: 900,
        name: "Music",
        role: "music",
        lane: -2,
        // The ducking curve, as level keyframes.
        gainDb: [
          { at: 0, value: -12 },
          { at: 3, value: -22 },
          { at: 123, value: -22 },
          { at: 129, value: -12 },
        ],
      },
    ],
    titles: [
      {
        text: "Stop scrolling",
        from: 0,
        durationInFrames: 75,
        style: { font: "Oswald", fontSize: 104, color: "#FBF7EE", bold: true },
        position: { x: 0, y: -300 },
      },
    ],
    captions: [{ text: "Stop scrolling.", from: 3, durationInFrames: 60 }],
    markers: [{ name: "C01 HOOK", from: 0, kind: "chapter" }],
    transitions: [{ from: 75, durationInFrames: 15 }],
  },
  30,
  { format: "fcpxml", publicDir: "./public", outPath: "./out/nle/promo.fcpxml" },
);
```

A plain `Clip[]` still works everywhere a `TimelineInput` does.

### Coordinates and units

- `position` is an offset from the frame centre in composition pixels, with
  **down positive**, matching how a Remotion layout reads. Final Cut's y axis
  points up; the exporter flips it for you.
- `gainDb` is decibels, not Remotion's linear `volume`. Convert with
  `20 * log10(volume)`, and treat `0` as silence.
- Keyframe `at` values are frames from the start of the clip, not the timeline.
- `lane` 0 is the primary storyline, positive lanes stack above it, negative
  lanes are audio below it. Leave it off and overlaps are packed automatically.

## Titles and the Motion template

Final Cut titles are Motion templates. A `<title>` references one by uid, and
the exporter defaults to the stock Basic Title:

```
.../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti
```

If your install reports a different path, the titles import as a missing
effect. Export any Final Cut project that contains a title, read the `<effect>`
resource out of it, and pass that uid with `--title-uid` or `titleEffectUid`.

## The doubled-output rule

Never let a rendered file and the elements it already contains both play. If
your master was rendered with the text burned in and you also export titles,
the editor sees the text twice; if you export audio stems, the master's baked
mix doubles them. Two ways out:

- Render a **clean plate** — the same composition with the text layers off —
  and use that as the media, with the titles on top.
- Or mute the master's audio (the exporter can set it to −96 dB) and leave the
  burned-in text as the visual, treating the titles as a later step.

The same rule is why an isolated overlay render must replace, not accompany,
the region it was rendered from.

## What cannot cross over

Springs, per-frame `interpolate()`, highlight boxes drawing on, masks, blurs,
`@remotion/effects`, canvas and three.js. There is no timeline representation
for code that runs per frame — Remotion's own OpenTimelineIO skill reaches the
same conclusion and either renders those regions or reports them as excluded.
The faithful path is a transparent ProRes 4444 render of that layer over its
exact active interval, placed above the native clips. It can be retimed,
repositioned and reordered in the NLE; it cannot be re-animated.
