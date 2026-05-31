@echo off
REM Rebuild dist/ for FTP deployment to jakepercy.com.
REM Pass --watch to keep rebuilding on file changes.
cd /d "%~dp0"
node build.js %*
