@echo off
chcp 65001 >nul
rem Start the practice platform on this computer: http://localhost:3000
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Please install Node.js 20+ from https://nodejs.org/ then run again.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
