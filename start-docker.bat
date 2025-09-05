@echo off
echo ?? Starting Crypto Signal Bot with Docker
echo This will run everything without needing Node.js installed locally
echo.

echo Checking if Docker is running...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ? Docker is not installed or not running
    echo Please install Docker Desktop from: https://docker.com/get-started
    pause
    exit /b 1
)

echo.
echo ?? Building and starting all services...
cd /d "%~dp0crypto-signal-bot"

echo Building images...
docker-compose build

echo Starting services...
docker-compose up -d

echo.
echo ? Services starting up!
echo.
echo ?? Access points:
echo   Frontend Dashboard: http://localhost:3000
echo   Backend API:        http://localhost:8000/api/health
echo   ML Service:         http://localhost:8001
echo.
echo ?? To view logs:
echo   docker-compose logs -f backend
echo   docker-compose logs -f frontend
echo.
echo ?? To stop all services:
echo   docker-compose down
echo.
pause