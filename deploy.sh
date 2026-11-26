#!/usr/bin/env bash
# Build the plugin, copy it into test-vault, and reload it in Obsidian.
#
# Usage: ./deploy.sh [--version <version>]
#
# --version sets the version in the deployed manifest.json, and only there: `./deploy.sh --version 0.1.9-beta.1`.
# Between releases main's manifest.json keeps the last stable version, because Obsidian's store reads it, so a plain
# deploy runs as that version: What's new then leaves out the beta's notes, and BRAT may offer the published beta as an
# update. Deploy as the beta you are testing to see what its readers see.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DEST="$(pwd)/test-vault/.obsidian/plugins/orbis-reader"
VERSION=""

usage() {
    echo "Usage: $0 [--version <version>]   e.g. --version 0.1.9-beta.1" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --version) [ $# -ge 2 ] || usage; VERSION="$2"; shift 2 ;;
        --version=*) VERSION="${1#--version=}"; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1" >&2; usage ;;
    esac
done

# Checked before the build, so a typo costs nothing: a release's version, or a beta's.
if [ -n "$VERSION" ] && ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
    echo "Not a version: $VERSION (expected 0.2.0 or 0.2.0-beta.1)" >&2
    exit 1
fi

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

if [ -n "$VERSION" ]; then
    sed -E 's/("version"[[:space:]]*:[[:space:]]*)"[^"]*"/\1"'"$VERSION"'"/' "$DEST/manifest.json" > "$DEST/manifest.json.tmp"
    mv -f "$DEST/manifest.json.tmp" "$DEST/manifest.json"
    if ! grep -q "\"version\": *\"$VERSION\"" "$DEST/manifest.json"; then
        echo "Could not set the version in $DEST/manifest.json." >&2
        exit 1
    fi
    echo "Deployed as version $VERSION."
fi

# Touch timestamps so Obsidian sees all files as newer than its last load.
# cp preserves the source mtime; without this, CSS edits made before the
# deploy would carry a stale timestamp and Obsidian skips reloading them.
touch "$DEST/main.js" "$DEST/manifest.json" "$DEST/styles.css"

obsidian plugin:reload id=orbis-reader
echo "Done. Plugin reloaded in Obsidian."
