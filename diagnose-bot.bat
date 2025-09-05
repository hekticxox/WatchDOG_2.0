@echo off
echo ?? Diagnosing Crypto Signal Bot Issues...
echo.

echo Checking if Node.js processes are running...
tasklist | findstr node.exe
if %errorlevel% neq 0 (
    echo ? No Node.js processes found
) else (
    echo ? Node.js processes detected
)

echo.
echo Testing API connection...
curl -s http://localhost:8000/api/health
if %errorlevel% neq 0 (
    echo ? API not responding on port 8000
    echo.
    echo ?? Starting backend server...
    start powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Hektic\source\repos\WatchDOG\crypto-signal-bot\backend'; npx ts-node src/index.ts"
    echo ? Server starting... Please wait 10 seconds then refresh your dashboard
) else (
    echo ? API is responding
)

echo.
echo ?? Quick fixes:
echo 1. Click "?? Test API" button in your dashboard
echo 2. If red error, wait 10 seconds and try again
echo 3. Click "?? Clean Duplicates" after API is green
echo.
pause