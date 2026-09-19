#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { exportTimeline, extensionFor } from "./export";
import type { ExportFormat, TimelineManifest } from "./types";

const getArg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
};

const USAGE = `retime-nle (alias: retime) — NLE timeline exporter for Remotion

Usage: retime-nle --manifest ./timeline.json --format fcpxml|premiere|otio [--fps 30] [--out ./out.timeline] [--id my-comp] [--width 1920] [--height 1080]

  --manifest  Path to TimelineManifest JSON (required)
  --format    fcpxml (default) | premiere | otio
  --fps       Override manifest fps
  --out       Output path (default: <manifestDir>/<id>.<ext>)
  --id        Timeline/project name (default: manifest compositionId)
  --width     Frame width for FCPXML <format> (default: manifest width or 1920)
  --height    Frame height for FCPXML <format> (default: manifest height or 1080)
  --help, -h  Print this help`;

const main = (): void => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const manifestPath = getArg("manifest");
  const format = (getArg("format") ?? "fcpxml") as ExportFormat;
  if (!manifestPath) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!["fcpxml", "premiere", "otio"].includes(format)) {
    console.error(`Unknown format: ${format}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(path.resolve(manifestPath), "utf8");
  const manifest = JSON.parse(raw) as TimelineManifest;
  const fps = Number(getArg("fps") ?? manifest.fps);
  const id = getArg("id") ?? manifest.compositionId ?? "retime-timeline";
  const width = getArg("width") !== undefined ? Number(getArg("width")) : manifest.width;
  const height = getArg("height") !== undefined ? Number(getArg("height")) : manifest.height;
  const out =
    getArg("out") ??
    path.join(path.dirname(path.resolve(manifestPath)), `${id}.${extensionFor(format)}`);
  const text = exportTimeline(manifest.clips, fps, format, id, { width, height });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), text, "utf8");
  console.log(`Wrote ${out} (${format}, ${manifest.clips.length} clips @ ${fps}fps)`);
};

main();
