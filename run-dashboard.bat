@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

set PORT=8899
start "Conflict Dashboard Server" cmd /k "cd /d "%~dp0" && set PORT=%PORT% && node server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%

endlocal
