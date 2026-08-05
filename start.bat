@echo off
cd /d %~dp0
rem 工作空间根目录（部署环境指定；留空则按 config.mjs 兜底规则）
set PI_WEB_CWD=D:\pi-workspace
echo 启动 pi-web 服务 (cwd=%PI_WEB_CWD%)...
node server.mjs
pause
