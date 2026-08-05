@echo off
cd /d %~dp0
rem 工作空间根目录：默认 %USERPROFILE%\pi-workspace；可改用环境变量 PI_WEB_CWD 覆盖
if not defined PI_WEB_CWD set PI_WEB_CWD=%USERPROFILE%\pi-workspace
if not exist "%PI_WEB_CWD%" mkdir "%PI_WEB_CWD%"
echo 启动 pi-web 服务 (cwd=%PI_WEB_CWD%)...
node server.mjs
pause
