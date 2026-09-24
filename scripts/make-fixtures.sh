#!/usr/bin/env bash
# Generates the small media files the test suite probes. Requires FFmpeg.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/test/fixtures/public"

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo "make-fixtures: FFmpeg is required to build the test fixtures (ffmpeg + ffprobe on PATH)." >&2
  exit 1
fi

mkdir -p "$out/footage" "$out/audio"

# A 9x16 clip with audio, deliberately named with a space to exercise URL encoding.
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=1080x1920:rate=30:duration=4 \
  -f lavfi -i sine=frequency=440:duration=4 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$out/footage/intro clip.mp4"

# Video-only, longer, for startFrom and asset-duration checks.
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=1080x1920:rate=30:duration=6 \
  -c:v libx264 -pix_fmt yuv420p "$out/footage/main.mp4"

# Audio-only, to check lane placement below the storyline.
ffmpeg -loglevel error -y -f lavfi -i sine=frequency=220:duration=8 "$out/audio/vo.wav"

# A still, to check <video> elements and zero-length assets.
ffmpeg -loglevel error -y -f lavfi -i color=c=red:size=1080x1920 -frames:v 1 "$out/footage/logo.png"

echo "make-fixtures: wrote fixtures to test/fixtures/public"
