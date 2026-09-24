import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = await import(path.join(here, "..", "dist", "index.js"));
const { exportProject, exportTimeline } = pkg;

const publicDir = path.join(here, "fixtures", "public");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "retime-"));

const baseClips = [
  { src: "/footage/intro clip.mp4", from: 0, durationInFrames: 90, name: "Intro" },
  { src: "/footage/main.mp4", from: 90, durationInFrames: 150, name: "Main", startFrom: 12 },
];

test("fcpxml links assets with absolute, percent-encoded file URLs", () => {
  const { text, timeline, missing } = exportProject(baseClips, 30, { publicDir });
  assert.equal(missing.length, 0);
  assert.match(text, /<!DOCTYPE fcpxml>/);
  assert.match(text, /src="file:\/\/[^"]*intro%20clip\.mp4"/);
  assert.ok(timeline.assets.every((a) => a.exists));
});

test("sequence format comes from the real media, not a 1080p guess", () => {
  const { text, timeline } = exportProject(baseClips, 30, { publicDir });
  assert.equal(timeline.width, 1080);
  assert.equal(timeline.height, 1920);
  assert.match(text, /<format id="r1"[^>]*width="1080" height="1920"/);
});

test("assets declare audio layout when the file has audio", () => {
  const { text } = exportProject(baseClips, 30, { publicDir });
  assert.match(text, /hasAudio="1" audioSources="1" audioChannels="\d+" audioRate="\d+"/);
  // main.mp4 is video-only, so it must not claim audio.
  const mainAsset = text.split("\n").find((l) => l.includes("main"));
  assert.ok(mainAsset && !mainAsset.includes("hasAudio"));
});

test("asset duration reflects the real file, not just the clip range", () => {
  const { timeline } = exportProject(baseClips, 30, { publicDir });
  const intro = timeline.assets.find((a) => a.name.includes("intro"));
  assert.ok(intro.durationFrames >= 120, `expected ~120 frames, got ${intro.durationFrames}`);
});

test("Remotion Studio URLs and relative paths resolve the same way", () => {
  const clips = [
    {
      src: "http://localhost:3000/static-9f8a7b/footage/main.mp4",
      from: 0,
      durationInFrames: 30,
    },
  ];
  const { missing, timeline } = exportProject(clips, 30, { publicDir });
  assert.equal(missing.length, 0);
  assert.match(timeline.assets[0].url, /footage\/main\.mp4$/);
});

test("a missing file still exports, with an absolute path to relink and a warning", () => {
  const clips = [{ src: "/footage/nope.mp4", from: 0, durationInFrames: 30 }];
  const { text, missing, warnings } = exportProject(clips, 30, { publicDir });
  assert.equal(missing.length, 1);
  assert.match(warnings.join(" "), /no file found/);
  assert.match(text, /src="file:\/\/\/[^"]*nope\.mp4"/);
});

test("strict mode refuses to write a timeline with missing media", () => {
  assert.throws(
    () => exportProject([{ src: "/nope.mp4", from: 0, durationInFrames: 30 }], 30, { publicDir, strict: true }),
    /Missing asset files/,
  );
});

test("copy mode bundles assets next to the export and links them relatively", () => {
  const dir = tmp();
  const out = path.join(dir, "demo.fcpxml");
  const { text, copied } = exportProject(baseClips, 30, { publicDir, outPath: out, assets: "copy" });
  assert.equal(copied.length, 2);
  assert.ok(fs.existsSync(path.join(dir, "demo_assets", "intro clip.mp4")));
  assert.match(text, /src="\.\/demo_assets\/intro%20clip\.mp4"/);
});

test("auto mode copies light assets and leaves heavy ones linked in place", () => {
  const dir = tmp();
  const out = path.join(dir, "demo.fcpxml");
  const { timeline } = exportProject(baseClips, 30, {
    publicDir,
    outPath: out,
    assets: "auto",
    maxCopyBytes: 20 * 1024,
  });
  const copied = timeline.assets.filter((a) => a.copiedTo);
  const linked = timeline.assets.filter((a) => !a.copiedTo);
  assert.ok(linked.length >= 1, "expected at least one heavy asset to stay linked");
  for (const a of copied) assert.ok(a.bytes <= 20 * 1024);
  for (const a of linked) assert.match(a.url, /^file:\/\//);
});

test("path-map rewrites resolved paths for another machine", () => {
  const { text, timeline, missing } = exportProject(baseClips, 30, {
    publicDir,
    pathMap: [[publicDir, "/Volumes/Media/project/public"]],
  });
  assert.match(text, /file:\/\/\/Volumes\/Media\/project\/public\/footage\/main\.mp4/);
  // The rewrite is cosmetic: the local files are still found and probed.
  assert.equal(missing.length, 0);
  assert.equal(timeline.width, 1080);
});

test("overlapping clips become connected clips on their own lanes", () => {
  const clips = [
    { src: "/footage/main.mp4", from: 0, durationInFrames: 120, name: "Base" },
    { src: "/footage/intro clip.mp4", from: 30, durationInFrames: 30, name: "Overlay" },
  ];
  const { text } = exportProject(clips, 30, { publicDir });
  assert.match(text, /<asset-clip lane="1"[^>]*name="Overlay"[^>]*offset="1s"/);
  assert.ok(text.indexOf("<asset-clip lane=") > text.indexOf('name="Base"'));
});

test("audio-only clips land below the storyline", () => {
  const clips = [
    { src: "/footage/main.mp4", from: 0, durationInFrames: 120, name: "Base" },
    { src: "/audio/vo.wav", from: 0, durationInFrames: 120, name: "VO" },
  ];
  const { text, timeline } = exportProject(clips, 30, { publicDir });
  assert.equal(timeline.clips.find((c) => c.name === "VO").lane, -1);
  assert.match(text, /<asset-clip lane="-1"[^>]*name="VO"/);
});

test("gaps in the timeline are explicit", () => {
  const clips = [
    { src: "/footage/main.mp4", from: 0, durationInFrames: 30 },
    { src: "/footage/main.mp4", from: 90, durationInFrames: 30 },
  ];
  const { text } = exportProject(clips, 30, { publicDir });
  assert.match(text, /<gap name="Gap" offset="1s" start="0s" duration="2s"\/>/);
});

test("stills export as video elements with a zero-length asset", () => {
  const clips = [{ src: "/footage/logo.png", from: 0, durationInFrames: 60, name: "Logo" }];
  const { text } = exportProject(clips, 30, { publicDir });
  assert.match(text, /<video ref="r\d+" name="Logo"/);
  assert.match(text, /duration="0s" hasVideo="1"/);
});

test("29.97 fps uses NTSC frame durations and frame-aligned times", () => {
  const { text } = exportProject(baseClips, 29.97, { publicDir });
  assert.match(text, /frameDuration="1001\/30000s"/);
  assert.match(text, /offset="3003\/1000s"/); // 90 frames * 1001/30000
});

test("the fcpxml version can be pinned for older Final Cut releases", () => {
  const { text } = exportProject(baseClips, 30, { publicDir, fcpxmlVersion: "1.9" });
  assert.match(text, /<fcpxml version="1.9">/);
});

test("premiere xml is structurally valid xmeml with linkable file paths", () => {
  const { text } = exportProject(baseClips, 30, { publicDir, format: "premiere" });
  assert.match(text, /<!DOCTYPE xmeml>/);
  assert.match(text, /<rate>\s*<timebase>30<\/timebase>\s*<ntsc>FALSE<\/ntsc>\s*<\/rate>/);
  assert.match(text, /<pathurl>file:\/\/[^<]*intro%20clip\.mp4<\/pathurl>/);
  assert.match(text, /<samplecharacteristics>[\s\S]*<width>1080<\/width>/);
  // Each file is defined once, then referenced by id.
  const defs = text.match(/<file id="file-r\d+">/g) ?? [];
  const refs = text.match(/<file id="file-r\d+"\/>/g) ?? [];
  assert.equal(defs.length, 2);
  assert.ok(refs.length >= 1);
});

test("otio carries absolute media URLs, gaps and per-lane tracks", () => {
  const clips = [
    { src: "/footage/main.mp4", from: 0, durationInFrames: 30 },
    { src: "/footage/main.mp4", from: 90, durationInFrames: 30 },
    { src: "/audio/vo.wav", from: 0, durationInFrames: 120, name: "VO" },
  ];
  const { text } = exportProject(clips, 30, { publicDir, format: "otio" });
  const otio = JSON.parse(text);
  const tracks = otio.tracks.children;
  assert.deepEqual(
    tracks.map((t) => t.kind),
    ["Video", "Audio"],
  );
  const video = tracks[0].children;
  assert.equal(video[1].OTIO_SCHEMA, "Gap.1");
  assert.match(video[0].media_reference.target_url, /^file:\/\//);
});

test("the browser export path still works without touching the filesystem", () => {
  const text = exportTimeline(baseClips, 30, "fcpxml", "demo", { width: 1080, height: 1920 });
  assert.match(text, /<fcpxml version="1.10">/);
  assert.match(text, /src="\/footage\/intro clip\.mp4"|src="\/footage\/intro%20clip\.mp4"/);
});
