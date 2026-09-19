# Tutorial 3 — Premiere / Resolve handoff workflow

Goal: round-trip a Remotion timeline into a desktop NLE.

1. Export with an explicit project id:

```bash
node ./dist/cli.js --manifest ./example/timeline.json --format premiere --id demo-timeline --out ./example/demo-timeline.xml
node ./dist/cli.js --manifest ./example/timeline.json --format otio --id demo-timeline --out ./example/demo-timeline.otio
```

2. Premiere: `File > Import`, select `demo-timeline.xml`. Verify clip order and `<in>/<out>` against `manifest-format.md` (`startFrom` maps to source in-point).

3. Resolve: `File > Import > Timeline`, select `demo-timeline.otio`. Media is referenced by `target_url` (`ExternalReference.1`); relink to your local `static/` folder if media shows offline.

4. If frames drift: confirm the NLE sequence timebase equals your manifest `fps`, and that `from`/`durationInFrames` are integers. Non-integer fps is fine, but frame counts must stay integral (`validateTimeline`, `src/export.ts:4`).
