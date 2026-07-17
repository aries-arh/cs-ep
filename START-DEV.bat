@echo off
chcp 65001 >nul
title CS EP1 - Mode Development
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terpasang. Jalankan INSTALL.bat dulu.
  pause
  exit /b 1
)

if not exist "node_modules" call npm install

echo Mode development (hot reload).
echo Buka: http://localhost:3000
echo Dari LAN: http://%COMPUTERNAME%:3000
echo.
call npm run dev:lan
pause
