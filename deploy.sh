#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DEST="$(pwd)/test-vault/.obsidian/plugins/orbis-reader"

echo "Building..."
if ! pnpm build; then
    echo "Build failed. Nothing copied."
    exit 1
fi

mkdir -p "$DEST"

echo "Copying to $DEST..."
cp -f main.js       "$DEST/main.js"
cp -f manifest.json "$DEST/manifest.json"
cp -f styles.css    "$DEST/styles.css"

# Touch timestamps so Obsidian sees all files as newer than its last load.
# cp preserves the source mtime; without this, CSS edits made before the
# deploy would carry a stale timestamp and Obsidian skips reloading them.
touch "$DEST/main.js" "$DEST/manifest.json" "$DEST/styles.css"

obsidian plugin:reload id=orbis-reader
echo "Done. Plugin reloaded in Obsidian."
