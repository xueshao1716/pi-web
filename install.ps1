# ============================================================
#  pi-web 一键安装脚本（Windows 全新电脑）
#  检测缺什么装什么：Node → Git → pi 引擎 → pi-web → 启动
#  用法：复制本文件内容保存为 install.ps1，然后执行：
#        powershell -ExecutionPolicy Bypass -File install.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$MIRROR = 'https://npmmirror.com/mirrors'   # 国内镜像（快）
$NODE_VER = 'v22.22.3'
$GIT_VER = 'v2.53.0.windows.1'

Write-Host ''
Write-Host '======================================' -ForegroundColor Cyan
Write-Host '  pi-web 一键安装（小语 AI 工作台）  ' -ForegroundColor Cyan
Write-Host '======================================' -ForegroundColor Cyan

# 1. Node.js
Write-Host ''
Write-Host '[1/6] 检查 Node.js ...' -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host "  已有 Node $((node -v))" -ForegroundColor Green
} else {
  Write-Host '  未安装，下载安装中 ...'
  curl.exe -sL -o "$env:TEMP\node.msi" "$MIRROR/node/$NODE_VER/node-$NODE_VER-x64.msi"
  if (-not (Test-Path "$env:TEMP\node.msi")) { Write-Host '  下载失败！' -ForegroundColor Red; exit 1 }
  Start-Process msiexec -ArgumentList '/i', "$env:TEMP\node.msi", '/qn' -Wait
  Write-Host '  Node 安装完成' -ForegroundColor Green
}

# 2. Git
Write-Host ''
Write-Host '[2/6] 检查 Git ...' -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Host "  已有 Git $((git --version | Select-Object -First 1))" -ForegroundColor Green
} else {
  Write-Host '  未安装，下载安装中 ...'
  curl.exe -sL -o "$env:TEMP\git.exe" "$MIRROR/git-for-windows/$GIT_VER/Git-2.53.0-64-bit.exe"
  if (-not (Test-Path "$env:TEMP\git.exe")) { Write-Host '  下载失败！' -ForegroundColor Red; exit 1 }
  Start-Process "$env:TEMP\git.exe" -ArgumentList '/VERYSILENT', '/NORESTART', '/SP-' -Wait
  Write-Host '  Git 安装完成' -ForegroundColor Green
}

# 3. 刷新 PATH（不重开终端也能用）
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

# 4. pi 引擎
Write-Host ''
Write-Host '[3/6] 检查 pi 引擎 ...' -ForegroundColor Yellow
if (Get-Command pi -ErrorAction SilentlyContinue) {
  Write-Host "  已有 pi $((pi --version))" -ForegroundColor Green
} else {
  Write-Host '  安装 pi 引擎 ...'
  npm i -g --registry=https://registry.npmmirror.com @earendil-works/pi-coding-agent
  Write-Host '  pi 引擎安装完成' -ForegroundColor Green
}

# 5. 克隆 pi-web
Write-Host ''
Write-Host '[4/6] 获取 pi-web 源码 ...' -ForegroundColor Yellow
if (-not (Test-Path "$HOME\pi-web")) {
  git clone https://github.com/xueshao1716/pi-web.git "$HOME\pi-web"
} else {
  Write-Host '  已存在 ~/pi-web，执行更新' -ForegroundColor Green
  Push-Location "$HOME\pi-web"; git pull; Pop-Location
}

# 6. 一键安装 + 启动
Write-Host ''
Write-Host '[5/6] 初始化配置 ...' -ForegroundColor Yellow
Push-Location "$HOME\pi-web"
node setup.mjs --install
Pop-Location

Write-Host ''
Write-Host '[6/6] 完成！' -ForegroundColor Green
Write-Host '  访问地址: http://127.0.0.1:8787' -ForegroundColor Cyan
Write-Host '  令牌文件: ~/pi-web/.token' -ForegroundColor Cyan
Write-Host '  最后一步：编辑 ~/.pi/agent/auth.json 填入你的 API 密钥（如 deepseek），重启服务即可使用模型'
Write-Host '  停止服务: taskkill /F /IM node.exe'
Write-Host ''
