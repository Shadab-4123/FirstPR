#!/usr/bin/env bash
# Turn the recording from record-demo.mjs into docs/demo.gif: trimmed to the moment
# the page has content, 800 px wide (GitHub shows README images at ~880 px), 12 fps.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../../docs" && pwd)"
TRIM=$(cat "$DIR/.demo-video/trim")
ffmpeg -v error -y -ss "$TRIM" -i "$DIR/.demo-video/demo.webm" \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$DIR/demo.gif"
echo "wrote $DIR/demo.gif ($(du -h "$DIR/demo.gif" | cut -f1))"
