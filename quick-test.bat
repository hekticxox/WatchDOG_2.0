@echo off
echo ?? Quick Test - Crypto Signal Bot Scanner
echo.

REM Navigate to correct directory
cd /d "%~dp0crypto-signal-bot\backend"

echo Checking if dependencies are installed...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error installing dependencies
        pause
        exit /b %errorlevel%
    )
)

echo.
echo ?? Starting Quick Scanner Test (2 minutes)
echo This will show you live crypto signal predictions.
echo.

call npx ts-node src/test-scanner.ts

echo.
echo Test completed. Press any key to exit.
pause