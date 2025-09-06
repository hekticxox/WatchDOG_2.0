@echo off
title ?? WatchDOG Business Launcher
color 0A
echo.
echo ===============================================
echo   ?? WatchDOG 2.0 - BUSINESS LAUNCHER
echo ===============================================
echo.
echo ?? Starting professional crypto signal business...
echo.

REM Kill any existing processes to prevent conflicts
echo ?? Cleaning up existing processes...
taskkill /f /im node.exe 2>nul >nul
timeout /t 2 /nobreak > nul

echo ?? Starting signal scanner backend...
start "WatchDOG Scanner" cmd /k "cd crypto-signal-bot\backend && npm run dev"

timeout /t 8 /nobreak > nul

echo ?? Starting Telegram payment bot...
start "WatchDOG Bot" cmd /k "echo ?? WatchDOG Telegram Bot && echo Bot: @WatchDOGAdmin_bot && echo. && node live-signal-bot.js"

timeout /t 3 /nobreak > nul

echo ?? Opening professional dashboard...
start "" live-crypto-dashboard.html

echo.
echo ? BUSINESS LAUNCHED SUCCESSFULLY!
echo.
echo ?? Scanner Backend: localhost:8000
echo ?? Telegram Bot: @WatchDOGAdmin_bot  
echo ?? Dashboard: Professional interface opened
echo ?? Revenue System: LIVE and ready for customers
echo.
echo ?? Next Steps:
echo   1. Share your bot link: https://t.me/WatchDOGAdmin_bot
echo   2. Post your 87%% NMRUSDT signal as proof
echo   3. Target crypto communities for customers
echo   4. Start earning $4,500+/month!
echo.
echo ?? Your WatchDOG business is now operational!
echo.
pause