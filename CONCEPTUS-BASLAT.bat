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

node bin\conceptus.mjs
pause
