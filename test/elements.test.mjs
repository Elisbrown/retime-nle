import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { exportProject } = await import(path.join(here, "..", "dist", "index.js"));

const publicDir = path.join(here, "fixtures", "public");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "retime-el-"));

const media = [{ src: "/footage/main.mp4", from: 0, durationInFrames: 180, name: "Master" }];

const timeline = {
  clips: [
    ...media,
    {
      src: "/audio/vo.wav",
      from: 3,
      durationInFrames: 120,
      name: "VO C01",
      role: "dialogue",
      gainDb: 0,
    },
    {
      src: "/audio/vo.wav",
      from: 0,
      durationInFrames: 180,
      name: "Music",
      role: "music",
      // Ducked under the voice-over, exactly like the Remotion mix.
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
      style: { font: "Anton", fontSize: 96, color: "#F5F0E6", alignment: "center", bold: true },
      position: { x: 0, y: -300 },
    },
    { text: "Real butchers.\nPremium cuts.", from: 75, durationInFrames: 75 },
  ],
  captions: [
    { text: "Stop scrolling.", from: 3, durationInFrames: 60 },
    { text: "Look at that marbling.", from: 63, durationInFrames: 60, language: "es" },
  ],
  markers: [
    { name: "C01 HOOK", from: 0, kind: "chapter" },
    { name: "Fix the grade here", from: 90, kind: "todo" },
  ],
  transitions: [{ from: 75, durationInFrames: 15 }],
};

test("fcpxml carries titles as editable text with style and position", () => {
  const { text } = exportProject(timeline, 30, { publicDir });
  assert.match(text, /<effect id="r\d+" name="Basic Title" uid="[^"]*Basic Title\.moti"\/>/);
  assert.match(text, /<title ref="r\d+" lane="\d+"[^>]*name="Stop scrolling"/);
  assert.match(text, /<text-style ref="ts1">Stop scrolling<\/text-style>/);
  assert.match(text, /font="Anton" fontSize="96" fontFace="Bold" fontColor="0\.960784 0\.941176 0\.901961 1"/);
  // Remotion's y points down, Final Cut's points up.
  assert.match(text, /name="Position"[^>]*value="0 300"/);
});

test("multi-line title text survives", () => {
  const { text } = exportProject(timeline, 30, { publicDir });
  assert.match(text, /Real butchers\.\nPremium cuts\./);
});

test("captions are embedded with a language role and written as an .srt", () => {
  const dir = tmp();
  const out = path.join(dir, "promo.fcpxml");
  const { text, srtPath } = exportProject(timeline, 30, { publicDir, outPath: out });
  assert.match(text, /<caption lane="\d+"[^>]*role="iTT\?captionFormat=ITT\.en"/);
  assert.match(text, /role="iTT\?captionFormat=ITT\.es"/);
  assert.equal(srtPath, path.join(dir, "promo.srt"));
  const srt = fs.readFileSync(srtPath, "utf8");
  assert.match(srt, /1\n00:00:00,100 --> 00:00:02,100\nStop scrolling\./);
});

test("markers come across, chapter and to-do kinds included", () => {
  const { text } = exportProject(timeline, 30, { publicDir });
  assert.match(text, /<chapter-marker start="0s" duration="1\/30s" value="C01 HOOK"\/>/);
  assert.match(text, /<marker start="3s" duration="1\/30s" value="Fix the grade here" completed="0"\/>/);
});

test("constant and keyframed audio levels both reach fcpxml", () => {
  const { text } = exportProject(timeline, 30, { publicDir });
  assert.match(text, /<adjust-volume amount="0dB"\/>/);
  assert.match(text, /<adjust-volume>\s*<param name="amount">/);
  assert.match(text, /<keyframe time="[^"]+" value="-22dB"\/>/);
});

test("a cross dissolve lands in the spine at the cut", () => {
  const { text } = exportProject(timeline, 30, { publicDir });
  assert.match(text, /<transition name="Cross Dissolve" offset="5\/2s" duration="1\/2s">/);
  assert.match(text, /<filter-video ref="r\d+" name="Cross Dissolve"\/>/);
});

test("titles stack above the media lanes, captions above the titles", () => {
  const { timeline: prepared } = exportProject(timeline, 30, { publicDir });
  const topMedia = Math.max(...prepared.clips.map((c) => c.lane));
  assert.ok(prepared.titles.every((t) => t.lane > topMedia));
  assert.ok(prepared.captions.every((c) => c.lane > Math.max(...prepared.titles.map((t) => t.lane))));
});

test("premiere gets text generators, markers, level keyframes and a transition", () => {
  const { text } = exportProject(timeline, 30, { publicDir, format: "premiere" });
  assert.match(text, /<generatoritem id="title-1">/);
  assert.match(text, /<parameterid>str<\/parameterid>\s*<name>Text<\/name>\s*<value>Stop scrolling<\/value>/);
  assert.match(text, /<effectid>audiolevels<\/effectid>/);
  assert.match(text, /<keyframe>\s*<when>3<\/when>/);
  assert.match(text, /<effectid>Cross Dissolve<\/effectid>/);
  // Titles double as markers so the text is never lost in translation.
  assert.match(text, /<name>Stop scrolling<\/name>\s*<in>0<\/in>/);
});

test("otio keeps title text in a generator reference and markers on the stack", () => {
  const { text } = exportProject(timeline, 30, { publicDir, format: "otio" });
  const otio = JSON.parse(text);
  const titles = otio.tracks.children.find((t) => t.name === "Titles");
  assert.equal(titles.children[0].media_reference.OTIO_SCHEMA, "GeneratorReference.1");
  assert.equal(titles.children[0].media_reference.parameters.text, "Stop scrolling");
  assert.equal(otio.tracks.markers[0].name, "C01 HOOK");
  assert.equal(otio.metadata.retime.captions.length, 2);
  const music = otio.tracks.children
    .flatMap((t) => t.children)
    .find((c) => c.name === "Music");
  assert.equal(music.effects[0].effect_name, "Gain");
});

test("a plain clip array still works and produces no element sections", () => {
  const { timeline: prepared } = exportProject(media, 30, { publicDir });
  assert.deepEqual(
    [prepared.titles.length, prepared.captions.length, prepared.markers.length],
    [0, 0, 0],
  );
});

test("clip-level transform and opacity become adjustable in fcpxml", () => {
  const clips = [
    {
      src: "/footage/main.mp4",
      from: 0,
      durationInFrames: 60,
      position: { x: 100, y: 50 },
      scale: 1.2,
      opacity: [
        { at: 0, value: 0 },
        { at: 15, value: 1 },
      ],
    },
  ];
  const { text } = exportProject(clips, 30, { publicDir });
  assert.match(text, /<adjust-transform position="100 -50" scale="1\.2 1\.2"\/>/);
  assert.match(text, /<adjust-opacity>\s*<param name="amount">/);
});
