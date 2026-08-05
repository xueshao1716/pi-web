@echo off
cd /d %~dp0
rem 工作空间根目录：默认 %USERPROFILE%\pi-workspace；可改用环境变量 PI_WEB_CWD 覆盖
if not defined PI_WEB_CWD set PI_WEB_CWD=%USERPROFILE%\pi-workspace
if not exist "%PI_WEB_CWD%" mkdir "%PI_WEB_CWD%"
rem 默认模型：deepseek-v4-flash（稳定）
if not defined PI_WEB_MODEL set PI_WEB_MODEL=deepseek/deepseek-v4-flash
echo 启动 pi-web 服务 (cwd=%PI_WEB_CWD%, model=%PI_WEB_MODEL%)...
node server.mjs
pause
