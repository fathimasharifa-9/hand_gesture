@echo off
title REACH Connection Doctor
cd /d "%~dp0"
echo ===================================================
echo Starting REACH Connection Doctor...
echo ===================================================
call npm run doctor
echo.
pause
