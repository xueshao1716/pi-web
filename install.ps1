# ============================================================
#  pi-web 一键安装（极简版，双引擎）
#  只需要 Node 一个软件，其余全自动：
#  下载源码 → 装 pi 引擎 → 装 dsh 引擎 → 模型模板 → 令牌 → 后台启动
#  用法（任意 Windows PowerShell，一条命令）：
#    irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install.ps1 | iex
#  或本地：powershell -ExecutionPolicy Bypass -File install.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$MIRROR = 'https://npmmirror.com/mirrors'
$NODE_VER = 'v22.22.3'
$ZIP = "$HOME\Downloads\pi-web.zip"

Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host '  pi-web 一键安装（小语 AI 工作台）' -ForegroundColor Cyan
Write-Host '====================================' -ForegroundColor Cyan

# 1. Node.js（唯一需要装的东西）
Write-Host ''
Write-Host '[1/3] 检查 Node.js ...' -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host "  已有 Node $((node -v))" -ForegroundColor Green
} else {
  Write-Host '  下载安装 Node.js ...'
  curl.exe -sL -o "$env:TEMP\node.msi" "$MIRROR/node/$NODE_VER/node-$NODE_VER-x64.msi"
  if (-not (Test-Path "$env:TEMP\node.msi")) { Write-Host '  Node 下载失败！' -ForegroundColor Red; exit 1 }
  Start-Process msiexec -ArgumentList '/i', "$env:TEMP\node.msi", '/qn' -Wait
  Write-Host '  Node 安装完成' -ForegroundColor Green
  # 刷新 PATH
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

# 2. 下载 pi-web 源码（zip 方式，不需要 Git；GitHub 直连失败自动切镜像）
Write-Host ''
Write-Host '[2/3] 获取 pi-web 源码 ...' -ForegroundColor Yellow
if (Test-Path "$HOME\pi-web\server.mjs") {
  Write-Host '  已存在 ~/pi-web' -ForegroundColor Green
} else {
  Write-Host '  下载源码（GitHub zip，失败自动切镜像）...'
  $ZIP_URLS = @(
    'https://gitee.com/linxinyu520xue/pi-web/repository/archive/main.zip',
    'https://github.com/xueshao1716/pi-web/archive/refs/heads/main.zip',
    'https://ghproxy.net/https://github.com/xueshao1716/pi-web/archive/refs/heads/main.zip',
    'https://gh-proxy.com/https://github.com/xueshao1716/pi-web/archive/refs/heads/main.zip'
  )
  $downloaded = $false
  foreach ($u in $ZIP_URLS) {
    curl.exe -sL --connect-timeout 8 --max-time 60 -o "$ZIP" $u
    if ((Test-Path "$ZIP") -and ((Get-Item "$ZIP").Length -gt 100000)) { $downloaded = $true; break }
  }
  if (-not $downloaded) { Write-Host '  源码下载失败（GitHub 与镜像均不可达，请检查网络）' -ForegroundColor Red; exit 1 }
  Expand-Archive -Path "$ZIP" -DestinationPath "$HOME" -Force
  Move-Item -Path "$HOME\pi-web-main" -Destination "$HOME\pi-web" -ErrorAction SilentlyContinue
  if (-not (Test-Path "$HOME\pi-web\server.mjs")) {
    # 如果已存在 pi-web 目录，先删再移
    if (Test-Path "$HOME\pi-web") { Remove-Item "$HOME\pi-web" -Recurse -Force }
    Move-Item -Path "$HOME\pi-web-main" -Destination "$HOME\pi-web"
  }
  Remove-Item "$ZIP" -Force -ErrorAction SilentlyContinue
  Write-Host '  源码就绪' -ForegroundColor Green
}

# 3. 一键安装 + 启动（自动装 pi 引擎、模型模板、令牌、后台启动）
Write-Host ''
Write-Host '[3/3] 安装并启动 ...' -ForegroundColor Yellow
Push-Location "$HOME\pi-web"
node setup.mjs --install

# dsh 引擎（DeepSeek Harness）：与 pi 同镜像逻辑
Write-Host '  安装 dsh 引擎（DeepSeek Harness）...' -ForegroundColor Yellow
if (Get-Command dsh -ErrorAction SilentlyContinue) {
  Write-Host "  已有 dsh $(& dsh --version 2>$null)" -ForegroundColor Green
} else {
  $reg = npm config get registry 2>$null
  if ($reg -match 'registry\.npmmirror\.com') {
    npm i -g @deepseek-ai/dsh 2>&1 | Out-Null
  } else {
    npm i -g @deepseek-ai/dsh --registry=https://registry.npmmirror.com 2>&1 | Out-Null
  }
  if (Get-Command dsh -ErrorAction SilentlyContinue) {
    Write-Host "  dsh $(& dsh --version 2>$null) 安装完成" -ForegroundColor Green
  } else {
    Write-Host '  dsh 安装失败，请手动执行：npm i -g @deepseek-ai/dsh' -ForegroundColor Red
  }
}
Pop-Location

Write-Host ''
Write-Host '完成！' -ForegroundColor Green
Write-Host '  访问地址: http://127.0.0.1:8787' -ForegroundColor Cyan
Write-Host '  令牌文件: ~/pi-web/.token' -ForegroundColor Cyan
Write-Host '  引擎就位: pi（工作台主引擎）+ dsh（DeepSeek Harness 执行臂）' -ForegroundColor Cyan
Write-Host '  最后一步: 编辑 ~/.pi/agent/auth.json 填入你的 API 密钥（如 deepseek）'
Write-Host '  停止服务: taskkill /F /IM node.exe'
Write-Host ''
