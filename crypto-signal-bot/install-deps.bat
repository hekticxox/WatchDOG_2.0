@echo off
echo Installing Crypto Signal Bot Dependencies...
echo.

echo Installing Backend Dependencies...
cd /d "%~dp0backend"
call npm install
if %errorlevel% neq 0 (
    echo Error installing backend dependencies
    pause
    exit /b %errorlevel%
)

echo.
echo Installing Frontend Dependencies...
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    echo Error installing frontend dependencies
    pause
    exit /b %errorlevel%
)

echo.
echo Installing ML Service Dependencies...
cd /d "%~dp0ml"
call pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Error installing ML dependencies
    pause
    exit /b %errorlevel%
)

echo.
echo All dependencies installed successfully!
echo.
echo Next steps:
echo 1. Copy backend\.env.example to backend\.env and configure
echo 2. Run start-dev.bat to start all services
echo.
pause