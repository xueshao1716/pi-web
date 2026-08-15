# pi-web one-line installer (ASCII only)
# Downloads the full installer then runs it as a file (BOM+param safe).
# Usage: irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install-lite.ps1 | iex
$ErrorActionPreference = "Stop"
$u = "https://gitee.com/linxinyu520xue/pi-web/raw/main/install-all.ps1"
$d = Join-Path $env:TEMP "piw-install-all.ps1"
Invoke-RestMethod $u -OutFile $d
Write-Host ""
Write-Host "Downloaded installer -> $d" -ForegroundColor Cyan
& $d @args
