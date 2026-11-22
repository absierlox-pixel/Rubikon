@echo off
chcp 65001 >nul
setlocal
title Rubikon Server + Auto Tunnel
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не установлен. Скачай с https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Установка зависимостей...
  call npm install
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости через npm install.
    pause
    exit /b 1
  )
)

node tunnel.js
echo.
pause
