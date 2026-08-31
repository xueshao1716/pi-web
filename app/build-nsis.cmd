@echo off
cd /d D:\pi-web\app
call npx tauri build --bundles nsis --verbose > tauri-build.log 2>&1
echo %ERRORLEVEL% > tauri-build.exit
