$ErrorActionPreference = 'Stop'
$dir = 'D:\pi-web\app'
$log = Join-Path $dir 'tauri-build.log'
$exitFile = Join-Path $dir 'tauri-build.exit'
Remove-Item $log, $exitFile -Force -ErrorAction SilentlyContinue
$command = 'Set-Location -LiteralPath ''D:\pi-web\app''; & .\node_modules\.bin\tauri.cmd build --bundles nsis --verbose *> ''D:\pi-web\app\tauri-build.log''; [IO.File]::WriteAllText(''D:\pi-web\app\tauri-build.exit'', $LASTEXITCODE.ToString())'
$p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',$command -WindowStyle Hidden -PassThru
Write-Output ("STARTED PID=" + $p.Id)
