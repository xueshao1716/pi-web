@echo off
setlocal
set "APP_DIR=%~dp0"
if not defined PI_WORKSPACE set "PI_WORKSPACE=D:\pi-workspace"
set "BUILD_CACHE=%PI_WORKSPACE%\.build-cache"
if not exist "%BUILD_CACHE%\cargo" mkdir "%BUILD_CACHE%\cargo"
if not exist "%BUILD_CACHE%\cargo-home" mkdir "%BUILD_CACHE%\cargo-home"
if not exist "%BUILD_CACHE%\gradle" mkdir "%BUILD_CACHE%\gradle"
if not exist "%BUILD_CACHE%\npm" mkdir "%BUILD_CACHE%\npm"
if not exist "%BUILD_CACHE%\tmp" mkdir "%BUILD_CACHE%\tmp"
set "CARGO_TARGET_DIR=%BUILD_CACHE%\cargo"
set "CARGO_HOME=%BUILD_CACHE%\cargo-home"
set "GRADLE_USER_HOME=%BUILD_CACHE%\gradle"
set "npm_config_cache=%BUILD_CACHE%\npm"
set "TEMP=%BUILD_CACHE%\tmp"
set "TMP=%BUILD_CACHE%\tmp"
cd /d "%APP_DIR%"
call npm.cmd run tauri -- build --bundles nsis --ci > tauri-build.log 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" (
  if not exist "%PI_WORKSPACE%\交付\元枢桌面客户端" mkdir "%PI_WORKSPACE%\交付\元枢桌面客户端"
  copy /y "%BUILD_CACHE%\cargo\release\bundle\nsis\*.exe" "%PI_WORKSPACE%\交付\元枢桌面客户端\" > nul
)
echo %EXIT_CODE% > tauri-build.exit
exit /b %EXIT_CODE%
