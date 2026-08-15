# ============================================================
#  pi-web 全自动安装（一条命令搞定 pi + dsh + pi-web）
#  自动检查/安装：git → Node.js → pi 引擎 → dsh 引擎 → 源码 → 令牌 → 启动
#  用法（任意 Windows PowerShell，一条命令）：
#    irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install-all.ps1 | iex
#  或本地：powershell -ExecutionPolicy Bypass -File install-all.ps1
#  选安装目录（不装 C 盘）：回车默认用户目录，或输入如 D:\pi-web；
#    也可 powershell -File install-all.ps1 -InstallDir D:\pi-web
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

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host '  pi-web 全自动安装（小语 AI 工作台）' -ForegroundColor Cyan
Write-Host '====================================' -ForegroundColor Cyan

# ── 刷新 PATH 工具函数（装完软件后立即生效，不用重启终端）──
function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
}

# ── 步骤 1/5：git ──
Write-Host ''
Write-Host '[1/5] 检查 git ...' -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
  $gv = git --version 2>$null
  Write-Host "  已有 git $gv" -ForegroundColor Green
} else {
  Write-Host '  未安装 git，尝试用 winget 安装 ...'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
    if (Get-Command git -ErrorAction SilentlyContinue) {
      Write-Host '  git 安装完成' -ForegroundColor Green
    } else {
      Write-Host '  git 安装后未生效，请手动安装：https://git-scm.com/download/win' -ForegroundColor Red
      Write-Host '  继续尝试（后续步骤不依赖 git，将改用 zip 下载）' -ForegroundColor Yellow
    }
  } else {
    Write-Host '  系统无 winget，请手动安装 git：https://git-scm.com/download/win' -ForegroundColor Red
    Write-Host '  继续尝试（后续步骤不依赖 git，将改用 zip 下载）' -ForegroundColor Yellow
  }
}

# ── 步骤 2/5：Node.js（唯一硬依赖）──
Write-Host ''
Write-Host '[2/5] 检查 Node.js ...' -ForegroundColor Yellow
$NODE_VER = 'v22.22.3'
$MIRROR = 'https://npmmirror.com/mirrors'
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nv = node -v
  $major = [int]($nv -replace '^v','' -split '\.')[0]
  if ($major -ge 20) {
    Write-Host "  已有 Node $nv" -ForegroundColor Green
  } else {
    Write-Host "  Node $nv 版本过低（需 >=20），重新安装 ..." -ForegroundColor Yellow
    $env:NODE_SKIP = $true
  }
} else {
  Write-Host '  未安装 Node.js，正在下载安装 ...'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or $env:NODE_SKIP) {
  $nodeMsi = "$env:TEMP\node-install.msi"
  Write-Host "  下载 Node $NODE_VER（国内镜像）..."
  curl.exe -sL --connect-timeout 8 --max-time 300 -o $nodeMsi "$MIRROR/node/$NODE_VER/node-$NODE_VER-x64.msi"
  if (-not (Test-Path $nodeMsi) -or (Get-Item $nodeMsi).Length -lt 10MB) {
    Write-Host '  Node 下载失败（网络问题）！' -ForegroundColor Red
    Write-Host '  请手动下载安装：https://nodejs.org/zh-cn/download' -ForegroundColor Yellow
    exit 1
  }
  Write-Host '  安装 Node（静默）...'
  Start-Process msiexec -ArgumentList '/i', $nodeMsi, '/qn' -Wait
  Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue
  Refresh-Path
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "  Node $((node -v)) 安装完成" -ForegroundColor Green
  } else {
    Write-Host '  Node 安装后未生效，请重启终端再试' -ForegroundColor Red
    exit 1
  }
}

# ── 步骤 3/5：获取 pi-web 源码（git 优先，失败切 zip）──
Write-Host ''
Write-Host '[3/5] 获取 pi-web 源码 ...' -ForegroundColor Yellow
if (Test-Path (Join-Path $DEST 'server.mjs')) {
  Write-Host "  已存在 $DEST" -ForegroundColor Green
} else {
  $cloned = $false
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host '  用 git clone（Gitee 国内源）...'
    # cmd /c 包装：git 进度走 stderr，避免 PowerShell 误判为错误中断
    cmd /c "git clone --depth 1 https://gitee.com/linxinyu520xue/pi-web.git `"$DEST`" 2>nul"
    if (Test-Path (Join-Path $DEST 'server.mjs')) { $cloned = $true }
  }  if (-not $cloned) {
    Write-Host '  改用 zip 下载（Gitee）...'
    $zip = "$env:TEMP\pi-web.zip"
    curl.exe -sL --connect-timeout 8 --max-time 120 -o $zip 'https://gitee.com/linxinyu520xue/pi-web/repository/archive/main.zip'
    if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 100KB) {
      Write-Host '  源码下载失败！' -ForegroundColor Red
      exit 1
    }
    Expand-Archive -Path $zip -DestinationPath "$env:TEMP\pi-web-extract" -Force
    $src = Get-ChildItem "$env:TEMP\pi-web-extract" -Directory | Select-Object -First 1
    Move-Item -Path $src.FullName -Destination $DEST
    Remove-Item $zip, "$env:TEMP\pi-web-extract" -Force -Recurse -ErrorAction SilentlyContinue
  }
  if (Test-Path (Join-Path $DEST 'server.mjs')) {
    Write-Host '  源码就绪' -ForegroundColor Green
  } else {
    Write-Host '  源码获取失败，请检查网络' -ForegroundColor Red
    exit 1
  }
}

# ── 步骤 4/5：pi 引擎 + dsh 引擎 + 令牌 + 模型清单（setup.mjs --install）──
Write-Host ''
Write-Host '[4/5] 安装 pi + dsh 引擎并初始化 ...' -ForegroundColor Yellow
Push-Location $DEST
node setup.mjs --install
Pop-Location

# ── dsh 引擎（DeepSeek Harness）：npm 一条命令，与 pi 同镜像逻辑 ──
Write-Host ''
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
    Write-Host '  提示：首次 headless 派单时 dsh 会自动初始化 profile 并引导配置模型' -ForegroundColor Gray
  } else {
    Write-Host '  dsh 安装失败，请手动执行：npm i -g @deepseek-ai/dsh' -ForegroundColor Red
  }
}

# ── 步骤 5/5：确认服务 ──
Write-Host ''
Write-Host '[5/5] 确认服务状态 ...' -ForegroundColor Yellow
Start-Sleep -Seconds 3
$port = if ($env:PI_WEB_PORT) { $env:PI_WEB_PORT } else { '8787' }
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) {
    Write-Host "  服务运行中: http://127.0.0.1:$port" -ForegroundColor Green
  }
} catch {
  Write-Host "  服务未响应，请稍后手动启动：cd $DEST && node server.mjs" -ForegroundColor Yellow
}

# ── 完成 ──
Write-Host ''
Write-Host '====================================' -ForegroundColor Cyan
Write-Host '  安装完成！' -ForegroundColor Green
Write-Host '====================================' -ForegroundColor Cyan
Write-Host "  访问地址: http://127.0.0.1:$port" -ForegroundColor Cyan
Write-Host "  源码目录: $DEST" -ForegroundColor Cyan
$TOK = Get-Content "$DEST\.token" -Raw -ErrorAction SilentlyContinue
if ($TOK) { Write-Host "  访问令牌: $($TOK.Trim())" -ForegroundColor Green } else { Write-Host "  访问令牌: 见 $DEST\.token 文件" -ForegroundColor Cyan }
Write-Host '  引擎就位: pi（工作台主引擎）+ dsh（DeepSeek Harness 执行臂）' -ForegroundColor Cyan
Write-Host ''
Write-Host '  ── 配置 API 密钥（必做，否则模型不可用）──' -ForegroundColor Yellow
Write-Host '  1) 获取密钥: 打开 https://platform.deepseek.com → API Keys → 创建，复制 sk- 开头密钥' -ForegroundColor Cyan
Write-Host '  2) 创建文件 ~/.pi/agent/auth.json（记事本新建），内容：' -ForegroundColor Cyan
Write-Host '     {' -ForegroundColor Gray
Write-Host '       "deepseek": { "type": "api_key", "key": "sk-你的密钥" }' -ForegroundColor Gray
Write-Host '     }' -ForegroundColor Gray
Write-Host '  3) 重启服务: taskkill /F /IM node.exe ，然后 cd ~\pi-web && node server.mjs' -ForegroundColor Cyan
Write-Host '  4) 刷新 http://127.0.0.1:8787 即可对话（默认模型 deepseek-v4-flash 官方直连兜底）' -ForegroundColor Cyan
Write-Host '  dsh 工作台: 运行 dsh web 打开（默认 http://127.0.0.1:3080，首次启动弹窗引导填 key）' -ForegroundColor Cyan
Write-Host '            装完打开 pi-web 引导弹窗勾选「同时配置到 dsh」可一次配好两个引擎' -ForegroundColor Gray
Write-Host '  更多模型商（小米/阿里/火山等）: 模型清单见 ~/.pi/agent/models-store.json' -ForegroundColor Gray
Write-Host '  停止服务: taskkill /F /IM node.exe' -ForegroundColor Gray
Write-Host ''
