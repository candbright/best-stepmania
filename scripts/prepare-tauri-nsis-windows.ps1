# Populates %LOCALAPPDATA%\tauri\NSIS so `npm run tauri build` skips NSIS downloads
# (fixes "timeout: global" when GitHub is slow or blocked).
#
# Optional: set TAURI_GITHUB_MIRROR to a prefix, e.g. https://ghfast.top/  (mirror + original URL without scheme dup)
# Optional: pass -NsisZipPath and -UtilsDllPath to use files you downloaded in a browser.

param(
    [string]$NsisZipPath = "",
    [string]$UtilsDllPath = ""
)

$ErrorActionPreference = "Stop"

$nsisZipUrl = "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip"
$utilsUrl = "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"

function Apply-Mirror([string]$url) {
    $m = $env:TAURI_GITHUB_MIRROR
    if (-not $m) { return $url }
    # e.g. TAURI_GITHUB_MIRROR=https://ghproxy.com  ->  https://ghproxy.com/https://github.com/...
    return ($m.TrimEnd("/") + "/" + $url)
}

$base = Join-Path $env:LOCALAPPDATA "tauri"
$nsisDir = Join-Path $base "NSIS"
$staging = Join-Path $base "nsis-3.11"
$utilsDestDir = Join-Path $nsisDir "Plugins\x86-unicode\additional"
$utilsDest = Join-Path $utilsDestDir "nsis_tauri_utils.dll"

New-Item -ItemType Directory -Force -Path $base | Out-Null

if (Test-Path $nsisDir) {
    Write-Host "Removing existing $nsisDir"
    Remove-Item -Recurse -Force $nsisDir
}
if (Test-Path $staging) {
    Remove-Item -Recurse -Force $staging
}

$zipTemp = Join-Path $env:TEMP "tauri-nsis-3.11.zip"
if ($NsisZipPath) {
    if (-not (Test-Path $NsisZipPath)) { throw "NSIS zip not found: $NsisZipPath" }
    Copy-Item -Force $NsisZipPath $zipTemp
} else {
    $u = Apply-Mirror $nsisZipUrl
    Write-Host "Downloading NSIS toolchain..."
    Write-Host "  $u"
    & curl.exe -fL --connect-timeout 120 --max-time 1200 -o $zipTemp $u
    if ($LASTEXITCODE -ne 0) { throw "curl failed to download NSIS zip (exit $LASTEXITCODE)" }
}

Write-Host "Extracting NSIS..."
Expand-Archive -LiteralPath $zipTemp -DestinationPath $base -Force
Remove-Item -Force $zipTemp -ErrorAction SilentlyContinue

if (-not (Test-Path $staging)) {
    throw "Expected folder after extract: $staging (check zip layout)"
}

Rename-Item -Path $staging -NewName "NSIS"

New-Item -ItemType Directory -Force -Path $utilsDestDir | Out-Null
if ($UtilsDllPath) {
    if (-not (Test-Path $UtilsDllPath)) { throw "Utils DLL not found: $UtilsDllPath" }
    Copy-Item -Force $UtilsDllPath $utilsDest
} else {
    $u2 = Apply-Mirror $utilsUrl
    Write-Host "Downloading nsis_tauri_utils.dll..."
    Write-Host "  $u2"
    & curl.exe -fL --connect-timeout 120 --max-time 600 -o $utilsDest $u2
    if ($LASTEXITCODE -ne 0) { throw "curl failed to download nsis_tauri_utils.dll (exit $LASTEXITCODE)" }
}

$probe = @(
    (Join-Path $nsisDir "makensis.exe"),
    (Join-Path $nsisDir "Bin\makensis.exe")
)
$found = $probe | Where-Object { Test-Path $_ }
if (-not $found) {
    throw "makensis.exe not found under $nsisDir (unexpected zip layout)"
}

Write-Host "Done. NSIS is ready at:"
Write-Host "  $nsisDir"
Write-Host "Run: npm run tauri build"
