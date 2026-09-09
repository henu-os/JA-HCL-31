@echo off
title JEEVIKA ERP v2 - Launcher
color 0A

echo =====================================================
echo           JEEVIKA ERP v2 - LAUNCHER
echo =====================================================
echo.

:: Kill any existing process on port 3000 (Frontend)
echo [0/3] Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [1/3] Starting C# Backend API (http://localhost:5002)...
start "JEEVIKA ERP Backend API" cmd /k "cd /d %~dp0Backend && dotnet run"

echo.
echo [2/3] Starting Frontend HTTP Server (http://localhost:3000)...
start "JEEVIKA ERP Frontend" cmd /k "cd /d %~dp0 && node serve.js"

echo.
echo Waiting 4 seconds for servers to initialize...
timeout /t 4 /nobreak >nul

echo.
echo [3/3] Opening JEEVIKA ERP in Web Browser...
start "" "http://localhost:3000/login.html"

echo.
echo =====================================================
echo JEEVIKA ERP v2 Launched Successfully!
echo Frontend    : http://localhost:3000
echo Backend API : http://localhost:5002
echo Swagger UI  : http://localhost:5002/swagger
echo =====================================================
echo.
pause
