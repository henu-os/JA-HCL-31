@echo off
title JEEVIKA ERP 2.0 — Desktop Host Launcher
color 0B

echo =====================================================
echo       JEEVIKA ERP 2.0 — DESKTOP HOST LAUNCHER
echo =====================================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists in Desktop folder
if not exist "node_modules\electron" (
    echo [Setup] Installing Electron desktop dependencies...
    npm install
    if errorlevel 1 (
        echo [Error] Failed to install Electron dependencies.
        pause
        exit /b 1
    )
)

echo [0/2] Cleaning up any existing backend processes...
taskkill /f /im JeevikaERP.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5002 "') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [1/2] Building .NET Backend...
cd /d "%~dp0..\Backend"
dotnet build -c Debug
if errorlevel 1 (
    echo [Error] .NET build failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Launching JEEVIKA ERP Desktop Host...
cd /d "%~dp0"
npm start

