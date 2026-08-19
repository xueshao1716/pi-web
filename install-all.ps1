# ============================================================
#  pi-web 全自动安装（一条命令搞定 pi + dsh + pi-web）
#  自动检查/安装：git → Node.js → pi 引擎 → dsh 引擎 → 源码 → 令牌 → 启动
#  用法（任意 Windows PowerShell，一条命令，先下载再执行，零报错）：
#    irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install-all.ps1 -OutFile $env:TEMP\piw.ps1; & $env:TEMP\piw.ps1
#  指定目录：& $env:TEMP\piw.ps1 -InstallDir D:\pi-web
#  （irm | iex 管道也可用，但 PS5.1 下会显示一行无害 BOM 报错）
#  界面美化 v2（2026-08）——框线横幅 / 步骤卡片 / 状态图标 / 对齐完成面
# ============================================================
# ── 安装目录：可用 -InstallDir 指定，否则交互询问（回车=默认用户目录）──
param([string]$InstallDir = "")

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# ══════════════════════════════════════════════════════════════
#  UI 辅助（干净安装界面，PS5.1 兼容，零外部依赖）
# ══════════════════════════════════════════════════════════════
$UI = @{ C='DarkCyan'; T='Cyan'; H='White'; Ok='Green'; Err='Red'; Warn='Yellow'; Dim='DarkGray'; Info='Cyan' }
function H  { param($s,$c) Write-Host $s -ForegroundColor $c }
function W  { param($s) Write-Host ('   ' + $s) }
function Line { H ('  ' + ('─' * 54)) $UI.C }
$UI_W = 46   # 横幅内容显示宽度（半角列，中文计 2）
function TextWidth { param($s) $w=0; foreach($ch in [char[]]$s){ if([int]$ch -gt 0x2E80){$w+=2}else{$w+=1} }; return $w }
function PadTo { param($s,$len) return ($s + (' ' * [Math]::Max(0,($len - (TextWidth $s))))) }
function Banner {
  H '' ''
  $bar = '═' * ($UI_W + 4)
  H ('  ╔' + $bar + '╗') $UI.C
  H ('  ║  ' + (PadTo 'pi-web · 小语 AI 工作台' $UI_W) + '  ║') $UI.T
  H ('  ║  ' + (PadTo '一键安装 · 全自动（pi + dsh 双引擎一次就位）' $UI_W) + '  ║') $UI.H
  H ('  ╚' + $bar + '╝') $UI.C
  H '' ''
}
function Step { param($n,$total,$name)
  H '' ''
  Line
  H ("  ── 步骤 {0}/{1} · {2} " + ('─' * [Math]::Max(2,(38 - $name.Length)))) $UI.T
  Line
}
function Ok   { param($s) H ('  ✔  ' + $s) $UI.Ok }
function Err  { param($s) H ('  ✖  ' + $s) $UI.Err }
function Warn { param($s) H ('  ⚠  ' + $s) $UI.Warn }
function Info { param($s) H ('     ' + $s) $UI.Info }
function Dim  { param($s) H ('     ' + $s) $UI.Dim }
function KeyVal { param($k,$v) H ('  ' + (PadTo $k 14) + ': ' + $v) $UI.Info }

# ── 刷新 PATH 工具函数（装完软件后立即生效，不用重启终端）──
function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
}

Banner

# ── 安装目录选择 ──
if ($InstallDir -and $InstallDir.Trim()) {
  $DEST = $InstallDir.Trim()
} else {
  $DEST = Join-Path $HOME 'pi-web'
  Dim ('安装目录（回车=默认：' + $DEST + '，或输入如 D:\pi-web）')
  $ans = Read-Host '  →'
  if ($ans.Trim()) { $DEST = $ans.Trim() }
}
Dim ('目标目录: ' + $DEST)

# ── 步骤 1/5：git ──
Step 1 5 '运行时 · git'
if (Get-Command git -ErrorAction SilentlyContinue) {
  Ok ('git 已就绪  (' + (git --version 2>$null) + ')')
} else {
  Warn '未检测到 git（仅用于拉取源码，装不上也有 zip 兜底）'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Info '用 winget 安装 git ...'
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent | Out-Null
    Refresh-Path
    if (Get-Command git -ErrorAction SilentlyContinue) { Ok ('git 安装完成  (' + (git --version 2>$null) + ')') }
    else { Warn 'git 安装后未生效，改走 zip 下载源码（不影响）' }
  } else {
    Warn '系统无 winget，改走 zip 下载源码（不影响）'
  }
}

# ── 步骤 2/5：Node.js（唯一硬依赖）──
Step 2 5 '运行时 · Node.js'
$NODE_VER = 'v22.22.3'
$MIRROR = 'https://npmmirror.com/mirrors'
if (Get-Command node -ErrorAction SilentlyContinue) {
  $nv = node -v
  $major = [int]($nv -replace '^v','' -split '\.')[0]
  if ($major -ge 20) { Ok ('Node 已就绪  (' + $nv + ')') }
  else { Warn ('Node ' + $nv + ' 版本过低（需>=20），重新安装'); $env:NODE_SKIP = $true }
} else {
  Info '未检测到 Node.js，开始下载安装 ...'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or $env:NODE_SKIP) {
  $nodeMsi = "$env:TEMP\node-install.msi"
  Info ('下载 Node ' + $NODE_VER + '（国内镜像）...')
  curl.exe -sL --connect-timeout 8 --max-time 300 -o $nodeMsi "$MIRROR/node/$NODE_VER/node-$NODE_VER-x64.msi"
  if (-not (Test-Path $nodeMsi) -or (Get-Item $nodeMsi).Length -lt 10MB) {
    Err 'Node 下载失败（网络问题）！'
    Warn '请手动安装：https://nodejs.org/zh-cn/download'
    exit 1
  }
  Info '静默安装 Node ...'
  Start-Process msiexec -ArgumentList '/i', $nodeMsi, '/qn' -Wait
  Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue
  Refresh-Path
  if (Get-Command node -ErrorAction SilentlyContinue) { Ok ('Node 安装完成  (' + (node -v) + ')') }
  else { Err 'Node 安装后未生效，请重启终端再试'; exit 1 }
}

# ── 步骤 3/5：获取 pi-web 源码（git 优先，失败切 zip）──
Step 3 5 '获取 pi-web 源码'
if (Test-Path (Join-Path $DEST 'server.mjs')) {
  Ok ('已存在安装目录 ' + $DEST)
} else {
  $cloned = $false
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Info '用 git clone（Gitee 国内源）...'
    # cmd /c 包装：git 进度走 stderr，避免 PowerShell 误判为错误中断
    cmd /c "git clone --depth 1 https://gitee.com/linxinyu520xue/pi-web.git `"$DEST`" 2>nul"
    if (Test-Path (Join-Path $DEST 'server.mjs')) { $cloned = $true }
  }
  if (-not $cloned) {
    Info '改用 zip 下载（Gitee）...'
    $zip = "$env:TEMP\pi-web.zip"
    curl.exe -sL --connect-timeout 8 --max-time 120 -o $zip 'https://gitee.com/linxinyu520xue/pi-web/repository/archive/main.zip'
    if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 100KB) { Err '源码下载失败！'; exit 1 }
    Expand-Archive -Path $zip -DestinationPath "$env:TEMP\pi-web-extract" -Force
    $src = Get-ChildItem "$env:TEMP\pi-web-extract" -Directory | Select-Object -First 1
    Move-Item -Path $src.FullName -Destination $DEST
    Remove-Item $zip, "$env:TEMP\pi-web-extract" -Force -Recurse -ErrorAction SilentlyContinue
  }
  if (Test-Path (Join-Path $DEST 'server.mjs')) { Ok '源码就绪' }
  else { Err '源码获取失败，请检查网络'; exit 1 }
}

# ── 步骤 4/5：pi 引擎 + dsh 引擎 + 令牌 + 模型清单（setup.mjs --install）──
Step 4 5 'pi 引擎 · 初始化'

# ── 可选：pi/dsh 引擎的 npm 全局包也装到其他盘（默认 C 盘）──
Dim 'pi/dsh 引擎全局包装到哪里？（回车=默认 C 盘，或输入如 D:\npm-global）'
$NPM_ANS = Read-Host '  →'
if ($NPM_ANS.Trim()) {
  $NPM_DIR = $NPM_ANS.Trim()
  npm config set prefix "$NPM_DIR" | Out-Null
  $p = [Environment]::GetEnvironmentVariable('Path','User')
  $p = ($p -split ';' | Where-Object { $_ -and $_ -ne "$NPM_DIR" }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', "$NPM_DIR;$p", 'User')
  $env:Path = "$NPM_DIR;$env:Path"
  Ok ('npm 全局目录已设为 ' + $NPM_DIR)
}

Push-Location $DEST
node setup.mjs --install
Pop-Location

# ── dsh 引擎（DeepSeek Harness）：npm 一条命令，与 pi 同镜像逻辑 ──
H '     ─ dsh 引擎（DeepSeek Harness）' $UI.Info
if (Get-Command dsh -ErrorAction SilentlyContinue) {
  Ok ('dsh 已就绪  (' + (& dsh --version 2>$null) + ')')
} else {
  $reg = npm config get registry 2>$null
  if ($reg -match 'registry\.npmmirror\.com') { npm i -g @deepseek-ai/dsh 2>&1 | Out-Null }
  else { npm i -g @deepseek-ai/dsh --registry=https://registry.npmmirror.com 2>&1 | Out-Null }
  if (Get-Command dsh -ErrorAction SilentlyContinue) {
    Ok ('dsh 安装完成  (' + (& dsh --version 2>$null) + ')')
    Dim '提示：首次 headless 派单时 dsh 会自动初始化 profile 并引导配置模型'
  } else {
    Err 'dsh 安装失败，请手动执行：npm i -g @deepseek-ai/dsh'
  }
}

# ── 步骤 5/5：确认服务 ──
Step 5 5 '确认服务状态'
Start-Sleep -Seconds 3
$port = if ($env:PI_WEB_PORT) { $env:PI_WEB_PORT } else { '8787' }
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) { Ok ("服务运行中  http://127.0.0.1:$port") }
} catch {
  Warn ("服务未响应，稍后手动启动：cd $DEST && node server.mjs")
}

# ── 完成 ──
H '' ''
H ('  ╔' + ('═' * ($UI_W + 4)) + '╗') $UI.C
H ('  ║  ' + (PadTo '安装完成 ✅  pi-web 已就位' $UI_W) + '  ║') $UI.Ok
H ('  ╚' + ('═' * ($UI_W + 4)) + '╝') $UI.C
H '' ''
KeyVal '访问地址' ("http://127.0.0.1:$port")
KeyVal '源码目录' $DEST
$TOK = Get-Content "$DEST\.token" -Raw -ErrorAction SilentlyContinue
if ($TOK) { KeyVal '访问令牌' $TOK.Trim() } else { KeyVal '访问令牌' ("见 $DEST\.token 文件") }
KeyVal '引擎就位' 'pi（工作台主引擎）+ dsh（DeepSeek Harness 执行臂）'
H '' ''
H '  ── 配置 API 密钥（必做，否则模型不可用）───────────────' $UI.Warn
Info ('1) 获取密钥: https://platform.deepseek.com → API Keys → 创建，复制 sk- 开头密钥')
Dim ('2) 新建文件 ~/.pi/agent/auth.json，内容：')
H '       { "deepseek": { "type": "api_key", "key": "sk-你的密钥" } }' $UI.Dim
Info ('3) 重启服务: taskkill /F /IM node.exe ，然后 cd ' + $DEST + ' && node server.mjs')
Info '4) 刷新 http://127.0.0.1:8787 即可对话（默认模型 deepseek-v4-flash 官方直连兜底）'
Info 'dsh 工作台: 运行 dsh web 打开（默认 http://127.0.0.1:3080，首次启动弹窗引导填 key）'
Dim '        装完打开 pi-web 引导弹窗勾选「同时配置到 dsh」可一次配好两个引擎'
Dim '更多模型商（小米/阿里/火山等）: 模型清单见 ~/.pi/agent/models-store.json'
Dim '停止服务: taskkill /F /IM node.exe'
H '' ''
