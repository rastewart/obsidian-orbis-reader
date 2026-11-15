$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$dest = "$PSScriptRoot\test-vault\.obsidian\plugins\orbis-reader"

Write-Host "Building..."
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. Nothing copied."; exit 1 }

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }

Write-Host "Copying to $dest..."
Copy-Item -Force main.js       "$dest\main.js"
Copy-Item -Force manifest.json "$dest\manifest.json"
Copy-Item -Force styles.css    "$dest\styles.css"

# Touch timestamps so Obsidian sees all files as newer than its last load.
# Copy-Item preserves the source LastWriteTime; without this, CSS edits made
# before the deploy would carry a stale timestamp and Obsidian skips reloading them.
$now = [DateTime]::Now
"$dest\main.js", "$dest\manifest.json", "$dest\styles.css" | ForEach-Object {
    (Get-Item $_).LastWriteTime = $now
}

obsidian plugin:reload id=orbis-reader
Write-Host "Done. Plugin reloaded in Obsidian."
