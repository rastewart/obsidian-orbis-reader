# Build the plugin, copy it into test-vault, and reload it in Obsidian.
#
# Usage: .\deploy.ps1 [-Version <version>]
#
# -Version sets the version in the deployed manifest.json, and only there: `.\deploy.ps1 -Version 0.1.9-beta.1`.
# Between releases main's manifest.json keeps the last stable version, because Obsidian's store reads it, so a plain
# deploy runs as that version: What's new then leaves out the beta's notes, and BRAT may offer the published beta as an
# update. Deploy as the beta you are testing to see what its readers see.
# CmdletBinding makes an unknown parameter an error. Without it, PowerShell puts one in $args and the script runs on.
[CmdletBinding()]
param([string]$Version = '')

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$dest = "$PSScriptRoot\test-vault\.obsidian\plugins\orbis-reader"

# Checked before the build, so a typo costs nothing: a release's version, or a beta's.
if ($Version -and $Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$') {
    Write-Host "Not a version: $Version (expected 0.2.0 or 0.2.0-beta.1)"
    exit 1
}

Write-Host "Building..."
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. Nothing copied."; exit 1 }

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }

Write-Host "Copying to $dest..."
Copy-Item -Force main.js       "$dest\main.js"
Copy-Item -Force manifest.json "$dest\manifest.json"
Copy-Item -Force styles.css    "$dest\styles.css"

if ($Version) {
    $manifest = "$dest\manifest.json"
    $text = [IO.File]::ReadAllText($manifest)
    $text = $text -replace '("version"\s*:\s*)"[^"]*"', ('${1}"' + $Version + '"')
    if ($text -notmatch ('"version"\s*:\s*"' + [regex]::Escape($Version) + '"')) {
        Write-Host "Could not set the version in $manifest."
        exit 1
    }
    # WriteAllText writes UTF-8 without a byte order mark, which Obsidian's JSON reading would trip on.
    [IO.File]::WriteAllText($manifest, $text)
    Write-Host "Deployed as version $Version."
}

# Touch timestamps so Obsidian sees all files as newer than its last load.
# Copy-Item preserves the source LastWriteTime; without this, CSS edits made
# before the deploy would carry a stale timestamp and Obsidian skips reloading them.
$now = [DateTime]::Now
"$dest\main.js", "$dest\manifest.json", "$dest\styles.css" | ForEach-Object {
    (Get-Item $_).LastWriteTime = $now
}

obsidian plugin:reload id=orbis-reader
Write-Host "Done. Plugin reloaded in Obsidian."
