# Yuanshu one-line installer (must stay ASCII only)
# Why ASCII: this file is meant to be piped straight into `iex` on any Windows
# PowerShell, where a no-BOM UTF-8 file gets decoded as ANSI and non-ASCII bytes
# turn into garbage. Keep every line here ASCII; product name in Chinese lives in
# install-all.ps1, which is downloaded as a file and therefore may use UTF-8+BOM.
# Usage: irm https://gitee.com/linxinyu520xue/yuanshu/raw/main/install-lite.ps1 | iex
$ErrorActionPreference = "Stop"
$u = "https://gitee.com/linxinyu520xue/yuanshu/raw/main/install-all.ps1"
$d = Join-Path $env:TEMP "piw-install-all.ps1"
Invoke-RestMethod $u -OutFile $d
Write-Host ""
Write-Host "Downloaded installer -> $d" -ForegroundColor Cyan
& $d @args
