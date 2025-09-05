@echo off
echo ?? Testing Crypto Signal Bot Scanner
echo.

echo Setting up environment...
cd /d "%~dp0backend"

echo.
echo Installing dependencies if needed...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error installing dependencies
        pause
        exit /b %errorlevel%
    )
)

echo.
echo Compiling TypeScript...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo TypeScript compilation errors found
    pause
    exit /b %errorlevel%
)

echo.
echo ?? Starting scanner test...
echo This will run for 2 minutes and show you live predictions.
echo Press Ctrl+C to stop early.
echo.
call npx ts-node src/test-scanner.ts

pause