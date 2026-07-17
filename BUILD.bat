@echo off
chcp 65001 >nul
title CS EP1 - Build Ulang
cd /d "%~dp0"

echo Membuild ulang aplikasi...
call npm run build
if errorlevel 1 (
  echo Build gagal.
  pause
  exit /b 1
)
echo Build selesai. Jalankan START-SERVER.bat
pause
