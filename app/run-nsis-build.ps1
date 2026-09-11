$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$workspaceRoot = if ($env:PI_WORKSPACE) { $env:PI_WORKSPACE } else { 'D:\pi-workspace' }
$cacheRoot = Join-Path $workspaceRoot '.build-cache'
New-Item -ItemType Directory -Force -Path (Join-Path $cacheRoot 'cargo'), (Join-Path $cacheRoot 'cargo-home'), (Join-Path $cacheRoot 'gradle'), (Join-Path $cacheRoot 'npm'), (Join-Path $cacheRoot 'tmp') | Out-Null
$env:CARGO_TARGET_DIR = Join-Path $cacheRoot 'cargo'
$env:CARGO_HOME = Join-Path $cacheRoot 'cargo-home'
$env:GRADLE_USER_HOME = Join-Path $cacheRoot 'gradle'
$env:npm_config_cache = Join-Path $cacheRoot 'npm'
$env:TEMP = Join-Path $cacheRoot 'tmp'
$env:TMP = Join-Path $cacheRoot 'tmp'
$log = Join-Path $dir 'tauri-build.log'
$exitFile = Join-Path $dir 'tauri-build.exit'
$bundleDir = Join-Path $cacheRoot 'cargo\release\bundle\nsis'
$deliverDir = Join-Path $workspaceRoot '交付\元枢桌面客户端'
Remove-Item $log, $exitFile -Force -ErrorAction SilentlyContinue
$command = 'Set-Location -LiteralPath ''' + $dir + '''; & .\node_modules\.bin\tauri.cmd build --bundles nsis --ci *> ''' + $log + '''; $code=$LASTEXITCODE; if ($code -eq 0) { $bundle=Get-ChildItem -LiteralPath ''' + $bundleDir + ''' -Filter *.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($bundle) { New-Item -ItemType Directory -Force -Path ''' + $deliverDir + ''' | Out-Null; Copy-Item -LiteralPath $bundle.FullName -Destination ''' + $deliverDir + ''' -Force } }; [IO.File]::WriteAllText(''' + $exitFile + ''', $code.ToString())'
$p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$command -WindowStyle Hidden -PassThru
Write-Output ("STARTED PID=" + $p.Id)
