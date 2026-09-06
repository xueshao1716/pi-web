@echo off
rem pi-web 8787 one-click restart (double-click to run)
title pi-web 8787 restart
cd /d D:\pi-web

echo [1/3] stopping old process...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo [2/3] starting new process...
start "pi-web-8787" /min node server.mjs

echo [3/3] waiting for ready...
timeout /t 10 /nobreak >nul
curl -s -m 5 http://127.0.0.1:8787/api/health
echo.
echo Done! Refresh http://localhost:8787 in browser.
echo (After frontend code changes, run "npx vite build" in frontend/ first)
pause
