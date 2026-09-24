#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { extensionFor } from "./export";
import { exportProject } from "./node";
import { DEFAULT_MAX_COPY_BYTES } from "./prepare";
import type { AssetMode, ExportFormat, TimelineManifest } from "./types";

const argv = process.argv.slice(2);

const getArg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
};

const getAll = (name: string): string[] => {
  const out: string[] = [];
  const pref = `--${name}=`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[++i]);
    else if (argv[i].startsWith(pref)) out.push(argv[i].slice(pref.length));
  }
  return out;
};

const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

const USAGE = `retime-nle (alias: retime) — NLE timeline exporter for Remotion

Usage: retime-nle --manifest ./timeline.json [--format fcpxml|premiere|otio] [options]

  Timeline
    --manifest PATH   TimelineManifest JSON (required)
    --format FORMAT   fcpxml (default) | premiere | otio
    --all-formats     Write all three formats
    --fps N           Override manifest fps
    --id NAME         Project/sequence name
    --out PATH        Output file (default: <manifestDir>/<id>.<ext>)
    --width N         Sequence width (default: the first video asset's real width)
    --height N        Sequence height (default: the first video asset's real height)

  Assets
    --assets MODE     link (default) | copy | auto
                      link: reference files where they are, by absolute path
                      copy: copy everything next to the export (portable)
                      auto: copy light files, link heavy ones
    --assets-dir DIR  Where copies go (default: <out basename>_assets)
    --max-copy-mb N   Size limit for 'auto' (default: ${Math.round(DEFAULT_MAX_COPY_BYTES / 1024 / 1024)})
    --asset-root DIR  Directory relative srcs resolve against (default: manifest folder)
    --public-dir DIR  Remotion public/ folder, for staticFile() srcs
    --path-map A=B    Rewrite resolved paths from prefix A to prefix B (repeatable)
    --no-probe        Skip ffprobe; fall back to filename-based guesses
    --fcpxml-version  1.9 (FCP 10.4.9+) | 1.10 (default, FCP 10.6+)

  Reporting
    --strict          Exit non-zero if any asset file is missing
    --json            Print a machine-readable asset report
    --quiet           Only print errors
    --help, -h        Print this help`;

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const main = (): void => {
  if (hasFlag("help") || argv.includes("-h") || argv.length === 0) {
    console.log(USAGE);
    return;
  }
  const manifestPath = getArg("manifest");
  if (!manifestPath) fail(USAGE);

  const formats: ExportFormat[] = hasFlag("all-formats")
    ? ["fcpxml", "premiere", "otio"]
    : [(getArg("format") ?? "fcpxml") as ExportFormat];
  for (const f of formats) {
    if (!["fcpxml", "premiere", "otio"].includes(f)) fail(`Unknown format: ${f}`);
  }

  const resolvedManifest = path.resolve(manifestPath!);
  let manifest: TimelineManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(resolvedManifest, "utf8")) as TimelineManifest;
  } catch (err) {
    return fail(`Could not read manifest ${resolvedManifest}: ${(err as Error).message}`);
  }
  const manifestDir = path.dirname(resolvedManifest);

  const fps = Number(getArg("fps") ?? manifest.fps);
  const id = getArg("id") ?? manifest.compositionId ?? "retime-timeline";
  const widthArg = getArg("width");
  const heightArg = getArg("height");
  const assets = (getArg("assets") ?? "link") as AssetMode;
  if (!["link", "copy", "auto"].includes(assets)) fail(`Unknown --assets mode: ${assets}`);

  const pathMap = getAll("path-map").map((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) fail(`--path-map expects FROM=TO, got: ${pair}`);
    return [pair.slice(0, idx), pair.slice(idx + 1)] as [string, string];
  });

  const quiet = hasFlag("quiet");
  const report: Record<string, unknown>[] = [];
  let exitCode = 0;

  for (const format of formats) {
    const outPath =
      formats.length === 1
        ? (getArg("out") ?? path.join(manifestDir, `${id}.${extensionFor(format)}`))
        : path.join(
            getArg("out") ? path.dirname(path.resolve(getArg("out")!)) : manifestDir,
            `${id}.${extensionFor(format)}`,
          );

    let result;
    try {
      result = exportProject(manifest.clips, fps, {
        format,
        compositionId: id,
        outPath,
        width: widthArg !== undefined ? Number(widthArg) : manifest.width,
        height: heightArg !== undefined ? Number(heightArg) : manifest.height,
        assetRoot: getArg("asset-root") ?? manifest.assetRoot ?? manifestDir,
        publicDir: getArg("public-dir") ?? manifest.publicDir,
        pathMap,
        assets,
        assetsDir: getArg("assets-dir"),
        maxCopyBytes: getArg("max-copy-mb")
          ? Number(getArg("max-copy-mb")) * 1024 * 1024
          : undefined,
        probe: !hasFlag("no-probe"),
        fcpxmlVersion: getArg("fcpxml-version"),
        strict: hasFlag("strict"),
      });
    } catch (err) {
      return fail(`${format}: ${(err as Error).message}`);
    }

    if (!quiet) {
      console.log(
        `Wrote ${outPath} (${format}, ${manifest.clips.length} clips @ ${fps}fps, ${result.timeline.width}x${result.timeline.height})`,
      );
      for (const asset of result.timeline.assets) {
        const mark = asset.kind === "remote" ? "remote" : asset.exists ? "ok" : "MISSING";
        const where = asset.copiedTo ?? asset.absPath ?? asset.url;
        console.log(`  [${mark}] ${asset.name} -> ${where}`);
      }
      for (const w of result.warnings) console.warn(`  ! ${w}`);
    }
    if (result.missing.length > 0) exitCode = hasFlag("strict") ? 1 : exitCode;
    report.push({
      format,
      out: outPath,
      width: result.timeline.width,
      height: result.timeline.height,
      clips: manifest.clips.length,
      assets: result.timeline.assets.map((a) => ({
        name: a.name,
        src: a.url,
        path: a.absPath,
        exists: a.exists,
        bytes: a.bytes,
        copiedTo: a.copiedTo,
        durationFrames: a.durationFrames,
        width: a.width,
        height: a.height,
      })),
      missing: result.missing,
      warnings: result.warnings,
    });
  }

  if (hasFlag("json")) console.log(JSON.stringify(report, null, 2));
  process.exit(exitCode);
};

main();
