#!/bin/bash
# Copy a site directory (a BLOCKFORM01 attempt's site/) into data/ and verify every file against its SHA256SUMS; the
# previous data/ is replaced only after the new copy verifies. Usage: tools/sync-data.sh <site dir>
set -euo pipefail
src="${1:?usage: tools/sync-data.sh <site dir>}"
here="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$src/index.json" ] && [ -f "$src/SHA256SUMS" ] || { echo "$src is not a site directory" >&2; exit 1; }
rm -rf "$here/data.new"
mkdir -p "$here/data.new"
cp -r "$src"/. "$here/data.new/"
(cd "$here/data.new" && sha256sum --quiet -c SHA256SUMS)
rm -rf "$here/data"
mv "$here/data.new" "$here/data"
echo "data/ <- $src ($(du -sh "$here/data" | cut -f1))"
