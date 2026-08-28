<#
.SYNOPSIS
  Reverts install-autoupdate.ps1 — removes only this extension's entry
  from the Chrome ExtensionInstallForcelist policy, leaving any other
  entries in that list completely untouched.
#>

$ErrorActionPreference = 'Stop'

$ExtId   = 'mlglbiijpicamhlhddapgigojlfkgpmf'
$KeyPath = 'HKCU:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist'

if (-not (Test-Path $KeyPath)) {
    Write-Host "Nothing to do — $KeyPath doesn't exist."
    exit 0
}

$existing = Get-ItemProperty -Path $KeyPath -ErrorAction SilentlyContinue
$reservedNames = @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')
$removed = 0
$remaining = 0

if ($existing) {
    foreach ($prop in $existing.PSObject.Properties) {
        if ($reservedNames -contains $prop.Name) { continue }
        if ($prop.Value -like "$ExtId;*") {
            Remove-ItemProperty -Path $KeyPath -Name $prop.Name
            $removed++
        } else {
            $remaining++
        }
    }
}

if ($removed -eq 0) {
    Write-Host "No entry for this extension was found — nothing removed."
} else {
    Write-Host "Removed $removed entry(ies) for Image Batch Downloader."
}

if ($remaining -eq 0) {
    Remove-Item -Path $KeyPath
    Write-Host "ExtensionInstallForcelist is now empty and was removed."
} else {
    Write-Host "$remaining other entry(ies) in ExtensionInstallForcelist left untouched."
}

Write-Host ""
Write-Host "Restart Chrome for this to take effect. The extension will remain installed"
Write-Host "as a regular (non-managed) extension until you remove it from chrome://extensions."
