@echo off
rem 元枢 8787 safe restart (double-click to run)
title 元枢 8787 restart
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restart-pi-web.ps1"
if errorlevel 1 pause
