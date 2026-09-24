# Assets: how clips find their media

An NLE timeline is only useful if every clip points at a file the editor can
open. This is the part that silently goes wrong, so `retime-nle` resolves,
checks and reports every source before it writes anything.

## What a `src` may look like

All of these work, because the exporter normalizes them:

| `src` | Resolved against |
| --- | --- |
| `/footage/intro.mp4` (a `staticFile()` value) | `--public-dir` |
| `http://localhost:3000/static-9f8a7b/footage/intro.mp4` (Studio/Player URL) | `--public-dir` |
| `out/v1_final.mp4` | `--asset-root`, then the manifest's folder |
| `/Users/me/Movies/v1_final.mp4` | used as-is |
| `https://cdn.example.com/intro.mp4` | left remote — FCPXML 1.9+ downloads it |
| `blob:…`, `data:…` | reported as unusable; nothing can link to them |

Resolved local files are written as absolute, percent-encoded `file://` URLs
(`file:///Users/me/Movies/my%20clip.mp4`). A bare filename is *not* enough: Final
Cut resolves `src` as a URL relative to the `.fcpxml` document, so an export
sitting in `out/nle/` cannot see a file in `out/`.

## Three ways to hand over the media

```bash
retime-nle --manifest timeline.json --assets link   # default
retime-nle --manifest timeline.json --assets copy
retime-nle --manifest timeline.json --assets auto --max-copy-mb 100
```

- **link** — reference each file where it already is. Nothing is duplicated.
  Best when the editor is on the same machine or the same mounted volume.
- **copy** — copy every asset into `<out basename>_assets/` beside the export
  and reference it relatively. The export folder becomes self-contained: zip it,
  send it, it opens anywhere.
- **auto** — copy anything at or below `--max-copy-mb`, link the rest. Graphics,
  stings and voice-over travel with the project; multi-gigabyte camera masters
  stay where they are and are linked by absolute path, ready to relink.

## Checking before you import

Every run prints one line per asset:

```text
Wrote out/nle/v1.fcpxml (fcpxml, 10 clips @ 30fps, 1080x1920)
  [ok] v1_cut-lineup_en_9x16 -> /Users/me/promo/out/v1_cut-lineup_en_9x16.mp4
  [MISSING] b-roll -> /Users/me/promo/public/footage/b-roll.mp4
```

`--strict` turns a missing file into a non-zero exit, which is what you want in
a render script. `--json` prints the same information as a report you can diff.

A missing file is still written into the timeline as an absolute path, so the
clip imports offline and can be relinked in place rather than disappearing.

## Media properties

When `ffprobe` is on `PATH` (or `FFPROBE_PATH` is set) each asset is probed for
duration, dimensions, channel count and sample rate. That is what lets the
export declare the real sequence size — a 1080x1920 vertical project stays
vertical instead of being conformed to 1920x1080 — and gives Final Cut the
audio attributes it needs to bring a relinked clip online. Without ffprobe the
exporter falls back to filename-based guesses and says so.

## Moving between machines

Render on Linux, edit on a Mac? Rewrite the path prefix at export time:

```bash
retime-nle --manifest timeline.json \
  --path-map /srv/renders=/Volumes/Renders
```

`--path-map` can be repeated. It only rewrites what goes into the file; the
existence check still runs against the local path.
