@echo off
chcp 65001 >nul
title CS EP1 - Install Aplikasi
cd /d "%~dp0"

echo ========================================
echo   CS EP1 Transaksi Stok - INSTALL
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terpasang.
  echo.
  echo 1. Download Node.js LTS dari https://nodejs.org
  echo 2. Install, centang "Add to PATH"
  echo 3. Tutup jendela ini, lalu jalankan lagi INSTALL.bat
  echo.
  pause
  exit /b 1
)

echo Node.js:
node -v
echo npm:
npm -v
echo.

echo [1/3] Menginstall package...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install gagal.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [2/3] Membuat file .env ...
  (
    echo DATABASE_URL="file:./dev.db"
    echo JWT_SECRET=cs-ep1-secret-%RANDOM%%RANDOM%
    echo LOW_STOCK_THRESHOLD=10
  ) > .env
) else (
  echo [2/3] File .env sudah ada, dilewati.
)

echo [3/3] Menyiapkan database...
if exist "prisma\dev.db" (
  echo Database sudah ada - hanya generate Prisma Client.
  call npx prisma generate
) else (
  call npm run db:setup
)

echo.
echo ========================================
echo   INSTALL SELESAI
echo ========================================
echo Selanjutnya double-klik:  START-SERVER.bat
echo.
pause
