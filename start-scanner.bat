@echo off
echo ?? Starting Crypto Signal Bot Scanner...
echo.

cd /d "C:\Users\Hektic\source\repos\WatchDOG\crypto-signal-bot\backend"

echo Checking Node.js...
node --version
echo.

echo Starting scanner with ts-node...
npx ts-node src/index.ts

pause