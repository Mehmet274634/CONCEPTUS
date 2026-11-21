@echo off
chcp 65001 >nul
title CONCEPTUS - Yerel Coklu-Ajan Fikir Evrim Paneli
cd /d "%~dp0"

if not exist "node_modules" (
  echo [CONCEPTUS] Bagimliliklar kuruluyor...
  call npm install
)

if not exist "dist\index.html" (
  echo [CONCEPTUS] Arayuz derleniyor...
  call npm run build
)

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3847/api/providers' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [CONCEPTUS] Zaten calisiyor, tarayici aciliyor...
  start "" http://127.0.0.1:3847
  exit /b 0
)

echo.
echo ============================================================
echo   CONCEPTUS baslatiliyor: http://127.0.0.1:3847
echo   Kapatmak icin bu pencereyi kapatabilir veya Ctrl+C yap.
echo ============================================================
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3847"
call npm run start
pause
