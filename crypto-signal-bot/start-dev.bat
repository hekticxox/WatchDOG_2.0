@echo off
echo Starting Crypto Signal Bot Development Environment...
echo.

echo Starting PostgreSQL and Redis with Docker...
docker-compose up -d postgres redis
if %errorlevel% neq 0 (
    echo Error starting Docker services. Make sure Docker is running.
    pause
    exit /b %errorlevel%
)

echo.
echo Waiting for databases to be ready...
timeout /t 10 /nobreak > nul

echo.
echo Starting Backend Service...
cd /d "%~dp0backend"
start "Backend" cmd /k "npm run dev"

echo.
echo Starting Frontend Service...
cd /d "%~dp0frontend"
start "Frontend" cmd /k "npm start"

echo.
echo Starting ML Service...
cd /d "%~dp0ml"
start "ML Service" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

echo.
echo All services starting up...
echo.
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:8000
echo ML Service: http://localhost:8001
echo.
echo Check the individual command windows for logs.
echo.
pause