<#
.SYNOPSIS
  Maintainer-only: packs extension/ into a signed .crx and a plain .zip,
  ready to attach to a GitHub Release.

.DESCRIPTION
  Uses the repo's retained signing-key.pem (NEVER committed — see .gitignore)
  so the extension ID stays identical across every release. Requires Chrome
  to be installed locally.

  Output goes to release/ImageBatchDownloader.crx and
  release/ImageBatchDownloader.zip — upload BOTH to the GitHub Release under
  those exact filenames, since the download page and update.xml both link to
  the "latest release" alias URL for those fixed names.

.EXAMPLE
  ./scripts/build-crx.ps1
#>

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$extDir     = Join-Path $repoRoot 'extension'
$keyPath    = Join-Path $repoRoot 'signing-key.pem'
$releaseDir = Join-Path $repoRoot 'release'

if (-not (Test-Path $keyPath)) {
    Write-Error "signing-key.pem not found at $keyPath — this file is intentionally not committed to git. Restore it from your local secure backup, or if this is truly the first build, remove this check and re-run once to generate a fresh key (this will change the extension ID)."
}

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    Write-Error "Could not find chrome.exe in any of the usual install locations. Edit this script to point at yours."
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Write-Host "Packing extension with chrome.exe..."
& $chrome --pack-extension="$extDir" --pack-extension-key="$keyPath" | Out-Null

# chrome.exe --pack-extension writes <extDir>.crx next to the extension folder
$producedCrx = Join-Path $repoRoot 'extension.crx'
if (-not (Test-Path $producedCrx)) {
    Write-Error "Expected $producedCrx but it wasn't created — check the chrome.exe output above."
}

$finalCrx = Join-Path $releaseDir 'ImageBatchDownloader.crx'
Move-Item -Force $producedCrx $finalCrx
Write-Host "Wrote $finalCrx"

$finalZip = Join-Path $releaseDir 'ImageBatchDownloader.zip'
if (Test-Path $finalZip) { Remove-Item $finalZip }
Compress-Archive -Path (Join-Path $extDir '*') -DestinationPath $finalZip
Write-Host "Wrote $finalZip"

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Bump ""version"" in extension/manifest.json if you haven't already."
Write-Host "  2. Create a GitHub Release (tag matching the new version) and attach"
Write-Host "     both files from release/ under their exact current names —"
Write-Host "     ImageBatchDownloader.crx and ImageBatchDownloader.zip."
Write-Host "  3. Update the version=""...""  attribute in update.xml to match, and"
Write-Host "     commit it to main (its URL never changes, only its content)."
