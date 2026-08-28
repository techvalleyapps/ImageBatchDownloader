<#
.SYNOPSIS
  OPTIONAL: force-installs Image Batch Downloader via a Chrome policy
  registry key, so it installs silently and keeps itself updated forever
  without the Chrome Web Store.

.DESCRIPTION
  This is NOT required to use the extension — "Load unpacked" (see the
  README) works fine on its own, it just doesn't auto-update. Only run this
  if you specifically want silent auto-update.

  Trade-offs, so you know what this does before running it:
    - Chrome will show a permanent "Managed by your organization" banner.
      This is a side effect of setting ANY Chrome policy key, even one you
      set yourself — there's no way around it with this mechanism.
    - The extension becomes force-installed: you can't disable or remove it
      from chrome://extensions. To undo, run uninstall-autoupdate.ps1.

  Safety: ExtensionInstallForcelist is a *list* — other software (or you,
  for a different extension) may already have entries under it. This
  script only ever ADDS one new numbered value at the next free slot; it
  never touches, renumbers, or removes anything already there. Running it
  twice is safe — it detects our entry is already present and does nothing.

  Scope: HKCU (current Windows user only) — no admin rights needed.
#>

$ErrorActionPreference = 'Stop'

$ExtId     = 'mlglbiijpicamhlhddapgigojlfkgpmf'
$UpdateUrl = 'https://raw.githubusercontent.com/techvalleyapps/ImageBatchDownloader/main/update.xml'
$KeyPath   = 'HKCU:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist'
$EntryValue = "$ExtId;$UpdateUrl"

if (-not (Test-Path $KeyPath)) {
    New-Item -Path $KeyPath -Force | Out-Null
    Write-Host "Created $KeyPath"
}

$existing = Get-ItemProperty -Path $KeyPath -ErrorAction SilentlyContinue
$reservedNames = @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')
$existingNames = @()
$alreadyPresent = $false

if ($existing) {
    foreach ($prop in $existing.PSObject.Properties) {
        if ($reservedNames -contains $prop.Name) { continue }
        $existingNames += $prop.Name
        if ($prop.Value -eq $EntryValue) { $alreadyPresent = $true }
    }
}

if ($alreadyPresent) {
    Write-Host "Already installed — an ExtensionInstallForcelist entry for this extension already exists. Nothing changed."
    exit 0
}

$nextIndex = 1
$numericExisting = $existingNames | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ }
if ($numericExisting.Count -gt 0) {
    $nextIndex = ($numericExisting | Measure-Object -Maximum).Maximum + 1
}

New-ItemProperty -Path $KeyPath -Name "$nextIndex" -Value $EntryValue -PropertyType String -Force | Out-Null

Write-Host "Added ExtensionInstallForcelist entry #$nextIndex for Image Batch Downloader."
Write-Host "Existing entries (untouched): $($existingNames.Count)"
Write-Host ""
Write-Host "Restart Chrome (fully quit, not just close the window) for it to take effect."
Write-Host "Chrome will silently install the extension and check $UpdateUrl periodically for updates."
Write-Host ""
Write-Host "To undo this later, run uninstall-autoupdate.ps1."
