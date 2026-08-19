# ============================================================
#  pi-web 一键安装（极简版，双引擎）
#  只需要 Node 一个软件，其余全自动：
#  下载源码 → 装 pi 引擎 → 装 dsh 引擎 → 模型模板 → 令牌 → 后台启动
#  用法（任意 Windows PowerShell，一条命令，先下载再执行，零报错）：
#    irm https://gitee.com/linxinyu520xue/pi-web/raw/main/install.ps1 -OutFile $env:TEMP\piw.ps1; & $env:TEMP\piw.ps1
#  指定目录：& $env:TEMP\piw.ps1 -InstallDir D:\pi-web
#  （irm | iex 管道也可用，但 PS5.1 下会显示一行无害 BOM 报错）
#  界面美化 v2（2026-08）——与 install-all 同风格
# ============================================================
# ── 安装目录：可用 -InstallDir 指定，否则交互询问（回车=默认用户目录）──
param([string]$InstallDir = "")

$ErrorActionPreference = 'Stop'
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
  H ('  ║  ' + (PadTo '一键安装 · 极简版（pi + dsh 双引擎一次就位）' $UI_W) + '  ║') $UI.H
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

$MIRROR = 'https://npmmirror.com/mirrors'
$NODE_VER = 'v22.22.3'
$ZIP = "$env:TEMP\pi-web.zip"

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

# 1. Node.js（唯一需要装的东西）
Step 1 3 '运行时 · Node.js'
if (Get-Command node -ErrorAction SilentlyContinue) {
  Ok ('Node 已就绪  (' + (node -v) + ')')
} else {
  Info '未检测到 Node.js，下载安装 ...'
  curl.exe -sL -o "$env:TEMP\node.msi" "$MIRROR/node/$NODE_VER/node-$NODE_VER-x64.msi"
  if (-not (Test-Path "$env:TEMP\node.msi")) { Err 'Node 下载失败！'; exit 1 }
  Start-Process msiexec -ArgumentList '/i', "$env:TEMP\node.msi", '/qn' -Wait
  Ok 'Node 安装完成'
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

# 2. 下载 pi-web 源码（zip 方式，不需要 Git；GitHub 直连失败自动切镜像）
Step 2 3 '获取 pi-web 源码'
if (Test-Path "$DEST\server.mjs") {
  Ok ("已存在安装目录 $DEST")
} else {
  Info '下载源码（Gitee → GitHub → 镜像依次尝试）...'
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
  if (-not $downloaded) { Err '源码下载失败（GitHub 与镜像均不可达，请检查网络）'; exit 1 }
  $EX = "$env:TEMP\pi-web-extract"
  Remove-Item "$EX" -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path "$ZIP" -DestinationPath "$EX" -Force
  $SRC = Get-ChildItem "$EX" -Directory | Select-Object -First 1
  if (Test-Path $DEST) { Remove-Item $DEST -Recurse -Force }
  Move-Item -Path $SRC.FullName -Destination $DEST
  Remove-Item "$EX" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$ZIP" -Force -ErrorAction SilentlyContinue
  Ok '源码就绪'
}

# 3. 一键安装 + 启动（自动装 pi 引擎、模型模板、令牌、后台启动）
Step 3 3 '安装并启动'
Dim 'pi/dsh 引擎全局包装到哪里？（回车=默认 C 盘，或输入如 D:\npm-global）'
$NPM_ANS = Read-Host '  →'
if ($NPM_ANS.Trim()) {
  $NPM_DIR = $NPM_ANS.Trim()
  npm config set prefix "$NPM_DIR" | Out-Null
  $p = [Environment]::GetEnvironmentVariable('Path','User')
  $p = ($p -split ';' | Where-Object { $_ -and $_ -ne "$NPM_DIR" }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', "$NPM_DIR;$p", 'User')
  $env:Path = "$NPM_DIR;$env:Path"
  Ok ("npm 全局目录已设为 $NPM_DIR")
}

Push-Location "$DEST"
node setup.mjs --install

# dsh 引擎（DeepSeek Harness）：与 pi 同镜像逻辑
H '     ─ dsh 引擎（DeepSeek Harness）' $UI.Info
if (Get-Command dsh -ErrorAction SilentlyContinue) {
  Ok ('dsh 已就绪  (' + (& dsh --version 2>$null) + ')')
} else {
  $reg = npm config get registry 2>$null
  if ($reg -match 'registry\.npmmirror\.com') { npm i -g @deepseek-ai/dsh 2>&1 | Out-Null }
  else { npm i -g @deepseek-ai/dsh --registry=https://registry.npmmirror.com 2>&1 | Out-Null }
  if (Get-Command dsh -ErrorAction SilentlyContinue) {
    Ok ('dsh 安装完成  (' + (& dsh --version 2>$null) + ')')
  } else {
    Err 'dsh 安装失败，请手动执行：npm i -g @deepseek-ai/dsh'
  }
}
Pop-Location

# ── 完成 ──
H '' ''
H ('  ╔' + ('═' * ($UI_W + 4)) + '╗') $UI.C
H ('  ║  ' + (PadTo '安装完成 ✅  pi-web 已就位' $UI_W) + '  ║') $UI.Ok
H ('  ╚' + ('═' * ($UI_W + 4)) + '╝') $UI.C
H '' ''
KeyVal '访问地址' "http://127.0.0.1:8787"
$TOK = Get-Content "$DEST\.token" -Raw -ErrorAction SilentlyContinue
if ($TOK) { KeyVal '访问令牌' $TOK.Trim() } else { KeyVal '访问令牌' ("见 $DEST\.token 文件") }
KeyVal '引擎就位' 'pi（工作台主引擎）+ dsh（DeepSeek Harness 执行臂）'
H '' ''
H '  ── 配置 API 密钥（必做，否则模型不可用）───────────────' $UI.Warn
Info '1) 获取密钥: https://platform.deepseek.com → API Keys → 创建，复制 sk- 开头密钥'
Dim '2) 新建文件 ~/.pi/agent/auth.json，内容：'
H '       { "deepseek": { "type": "api_key", "key": "sk-你的密钥" } }' $UI.Dim
Info ('3) 重启服务: taskkill /F /IM node.exe ，然后 cd ' + $DEST + ' && node server.mjs')
Info '4) 刷新 http://127.0.0.1:8787 即可对话（默认模型 deepseek-v4-flash 官方直连兜底）'
Info 'dsh 工作台: 运行 dsh web 打开（默认 http://127.0.0.1:3080，首次启动弹窗引导填 key）'
Dim '        装完打开 pi-web 引导弹窗勾选「同时配置到 dsh」可一次配好两个引擎'
Dim '更多模型商（小米/阿里/火山等）: 模型清单见 ~/.pi/agent/models-store.json'
Dim '停止服务: taskkill /F /IM node.exe'
H '' ''
