# ============================================================
#  pi-web 全自动安装（一条命令搞定所有依赖）
#  自动检查/安装：git → Node.js → pi 引擎 → 源码 → 令牌 → 启动
#  用法：powershell -ExecutionPolicy Bypass -File install-all.ps1
# ============================================================
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
$DEST = Join-Path $HOME 'pi-web'
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

# ── 步骤 4/5：pi 引擎 + 令牌 + 模型清单（setup.mjs --install）──
Write-Host ''
Write-Host '[4/5] 安装 pi 引擎并初始化 ...' -ForegroundColor Yellow
Push-Location $DEST
node setup.mjs --install
Pop-Location

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
Write-Host "  访问令牌: 见 $DEST\.token 文件" -ForegroundColor Cyan
Write-Host '  最后一步: 编辑 ~/.pi/agent/auth.json 填入 API 密钥（如 deepseek）' -ForegroundColor Yellow
Write-Host '  停止服务: taskkill /F /IM node.exe' -ForegroundColor Gray
Write-Host ''
