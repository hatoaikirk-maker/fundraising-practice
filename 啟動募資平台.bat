@echo off
chcp 65001 >nul
rem Start the fundraising site on this computer: http://localhost:3000
rem Data is kept in data\site (first run prints the admin password in this window).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Please install Node.js 20+ from https://nodejs.org/ then run again.
  pause
  exit /b 1
)
set DATA_DIR=data\site
start "" http://localhost:3000
node server.js
pause
