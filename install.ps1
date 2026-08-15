# ============================================================
#  pi-web 一键安装（极简版，双引擎）
#  只需要 Node 一个软件，其余全自动：
#  下载源码 → 装 pi 引擎 → 装 dsh 引擎 → 模型模板 → 令牌 → 后台启动
#  用法（任意 Windows PowerShell，一条命令）：
#    irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install.ps1 | iex
#  或本地：powershell -ExecutionPolicy Bypass -File install.ps1
#  选安装目录（不装 C 盘）：回车默认用户目录，或输入如 D:\pi-web；
#    也可 powershell -File install.ps1 -InstallDir D:\pi-web
# ============================================================
# ── 安装目录：可用 -InstallDir 指定，否则交互询问（回车=默认用户目录）──
param([string]$InstallDir = "")
if ($InstallDir -and $InstallDir.Trim()) {
  $DEST = $InstallDir.Trim()
} else {
  $DEST = Join-Path $HOME 'pi-web'
  $ans = Read-Host "  安装到哪个目录？（回车=默认 $DEST，或输入如 D:\pi-web）"
  if ($ans.Trim()) { $DEST = $ans.Trim() }
}

$ErrorActionPreference = 'Stop'
$MIRROR = 'https://npmmirror.com/mirrors'
$NODE_VER = 'v22.22.3'
$ZIP = "$env:TEMP\pi-web.zip"

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
if (Test-Path "$DEST\server.mjs") {
  Write-Host "  已存在 $DEST" -ForegroundColor Green
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
  $EX = "$env:TEMP\pi-web-extract"
  Remove-Item "$EX" -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path "$ZIP" -DestinationPath "$EX" -Force
  $SRC = Get-ChildItem "$EX" -Directory | Select-Object -First 1
  if (Test-Path $DEST) { Remove-Item $DEST -Recurse -Force }
  Move-Item -Path $SRC.FullName -Destination $DEST
  Remove-Item "$EX" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$ZIP" -Force -ErrorAction SilentlyContinue
  Write-Host '  源码就绪' -ForegroundColor Green
}

# 3. 一键安装 + 启动（自动装 pi 引擎、模型模板、令牌、后台启动）
Write-Host ''
Write-Host '[3/3] 安装并启动 ...' -ForegroundColor Yellow
# ── 可选：pi/dsh 引擎的 npm 全局包也装到其他盘（默认 C 盘）──
$NPM_ANS = Read-Host "  pi/dsh 引擎全局包装到哪个盘？（回车=默认 C 盘，或输入如 D:
pm-global）"
if ($NPM_ANS.Trim()) {
  $NPM_DIR = $NPM_ANS.Trim()
  npm config set prefix "$NPM_DIR"
  $p = [Environment]::GetEnvironmentVariable('Path','User')
  $p = ($p -split ';' | Where-Object { $_ -and $_ -ne "$NPM_DIR" }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', "$NPM_DIR;$p", 'User')
  $env:Path = "$NPM_DIR;$env:Path"
  Write-Host "  ✅ npm 全局目录已设为 $NPM_DIR（pi/dsh 将装到这里）" -ForegroundColor Green
}

Push-Location "$DEST"
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
$TOK = Get-Content "$DEST\.token" -Raw -ErrorAction SilentlyContinue
if ($TOK) { Write-Host "  访问令牌: $($TOK.Trim())" -ForegroundColor Green } else { Write-Host "  令牌文件: $DEST\.token" -ForegroundColor Cyan }
Write-Host '  引擎就位: pi（工作台主引擎）+ dsh（DeepSeek Harness 执行臂）' -ForegroundColor Cyan
Write-Host ''
Write-Host '  ── 配置 API 密钥（必做，否则模型不可用）──' -ForegroundColor Yellow
Write-Host '  1) 获取密钥: 打开 https://platform.deepseek.com → API Keys → 创建，复制 sk- 开头密钥' -ForegroundColor Cyan
Write-Host '  2) 创建文件 ~/.pi/agent/auth.json（记事本新建），内容：' -ForegroundColor Cyan
Write-Host '     {' -ForegroundColor Gray
Write-Host '       "deepseek": { "type": "api_key", "key": "sk-你的密钥" }' -ForegroundColor Gray
Write-Host '     }' -ForegroundColor Gray
Write-Host '  3) 重启服务: taskkill /F /IM node.exe ，然后 cd $DEST && node server.mjs' -ForegroundColor Cyan
Write-Host '  4) 刷新 http://127.0.0.1:8787 即可对话（默认模型 deepseek-v4-flash 官方直连兜底）' -ForegroundColor Cyan
Write-Host '  dsh 工作台: 运行 dsh web 打开（默认 http://127.0.0.1:3080，首次启动弹窗引导填 key）' -ForegroundColor Cyan
Write-Host '            装完打开 pi-web 引导弹窗勾选「同时配置到 dsh」可一次配好两个引擎' -ForegroundColor Gray
Write-Host '  更多模型商（小米/阿里/火山等）: 模型清单见 ~/.pi/agent/models-store.json' -ForegroundColor Gray
Write-Host '  停止服务: taskkill /F /IM node.exe' -ForegroundColor Gray
Write-Host ''
