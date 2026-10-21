@echo off
REM Rebuild dist/ (published by GitHub Pages on push).
REM Pass --watch to keep rebuilding on file changes.
cd /d "%~dp0"
node build.js %*
