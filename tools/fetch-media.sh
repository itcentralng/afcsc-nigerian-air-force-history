#!/usr/bin/env bash
# Downloads every photo and film that data/content.js refers to from the
# original Netlify site into ./assets, keeping the same folder structure.
# Files already on disk are skipped, so it is safe to run again.
#
#   bash tools/fetch-media.sh
#
# Needs only bash, grep and curl (all built into macOS and most Linux).
# On Windows, run it from Git Bash, or copy the assets folder over from a Mac.
set -u
cd "$(dirname "$0")/.."
BASE="${1:-https://aneke-hall-of-fame.netlify.app}"

paths=$(grep -oE 'assets/[A-Za-z0-9_./%-]+\.(jpe?g|png|webp|gif|mp4|webm|mov|mp3)' data/content.js | sort -u)
total=$(printf '%s\n' "$paths" | grep -c .)
ok=0; skip=0; fail=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  if [ -s "$p" ]; then skip=$((skip+1)); continue; fi
  mkdir -p "$(dirname "$p")"
  if curl -sfL --retry 2 -o "$p.part" "$BASE/$p"; then
    mv "$p.part" "$p"; ok=$((ok+1)); echo "ok    $p"
  else
    rm -f "$p.part"; fail=$((fail+1)); echo "FAIL  $p"
  fi
done <<< "$paths"
echo
echo "$total files referenced: $ok downloaded, $skip already present, $fail failed."
