@echo off
chcp 65001 >nul
title CS EP1 - Server Transaksi Stok
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terpasang. Jalankan INSTALL.bat dulu.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Package belum terpasang. Menjalankan INSTALL dulu...
  call INSTALL.bat
)

if not exist ".next" (
  echo Build belum ada. Membuild aplikasi...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build gagal.
    pause
    exit /b 1
  )
)

echo ========================================
echo   SERVER SEDANG BERJALAN
echo ========================================
echo.
echo Di komputer INI buka:
echo   http://localhost:3000
echo.
echo Dari komputer LAIN buka:
echo   http://%COMPUTERNAME%:3000
echo.
echo Login contoh: admin / admin123
echo.
echo JANGAN TUTUP jendela ini selama aplikasi dipakai.
echo Tekan Ctrl+C untuk menghentikan server.
echo ========================================
echo.

call npm run start:lan
pause
