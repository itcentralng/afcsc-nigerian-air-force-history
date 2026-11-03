#!/usr/bin/env bash
# ------------------------------------------------------------------
# Downloads every photo and film used by
#   https://aneke-hall-of-fame.netlify.app
# into ~/Desktop/hof-media/assets/..., then zips it as
#   ~/Desktop/hof-media.zip
#
# Needs only what macOS already has (bash, curl, grep, zip).
#
# How to run on a Mac:
#   1. Save this file to your Downloads folder.
#   2. Open Terminal and run:   bash ~/Downloads/get-hall-of-fame-media.sh
#   3. When it finishes, upload ~/Desktop/hof-media.zip.
#      (If the zip is too large to upload, upload the assets/video
#       folder separately from the rest.)
# Safe to run again: files already downloaded are skipped.
# ------------------------------------------------------------------
set -u
SITE="https://aneke-hall-of-fame.netlify.app"
OUT="$HOME/Desktop/hof-media"
mkdir -p "$OUT" && cd "$OUT" || exit 1

echo "Reading the list of media from $SITE ..."
page=$(curl -sfL "$SITE/") || { echo "Could not reach $SITE. Check your internet connection."; exit 1; }
paths=$(printf '%s' "$page" | grep -oE 'assets/[A-Za-z0-9_./%-]+\.(jpe?g|png|webp|gif|svg|mp4|webm|mov|mp3|m4a|wav|pdf|vtt)' | sort -u)
total=$(printf '%s\n' "$paths" | grep -c .)
echo "Found $total files. Downloading (videos can take a while)..."
echo

ok=0; skip=0; fail=0; n=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  n=$((n+1))
  if [ -s "$p" ]; then skip=$((skip+1)); continue; fi
  mkdir -p "$(dirname "$p")"
  if curl -sfL --retry 3 -o "$p.part" "$SITE/$p"; then
    mv "$p.part" "$p"; ok=$((ok+1)); echo "[$n/$total] ok    $p"
  else
    rm -f "$p.part"; fail=$((fail+1)); echo "[$n/$total] FAIL  $p"
  fi
done <<< "$paths"

echo
echo "Downloaded $ok, already had $skip, failed $fail (of $total)."
echo "Zipping..."
rm -f "$HOME/Desktop/hof-media.zip"
zip -qr "$HOME/Desktop/hof-media.zip" assets
size=$(du -h "$HOME/Desktop/hof-media.zip" | cut -f1)
echo "Done: $HOME/Desktop/hof-media.zip ($size)"
[ "$fail" -gt 0 ] && echo "Some files failed. Run the script again to retry just those."
