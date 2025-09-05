@echo off
echo ?? Starting Crypto Signal Bot - Simple Version
echo.

echo Stopping any existing containers...
docker-compose down

echo.
echo Starting just the databases (this should work)...
docker-compose up -d postgres redis

echo.
echo Waiting for databases to start...
timeout /t 15 /nobreak > nul

echo.
echo ? Databases are running!
echo.
echo ?? Your options now:
echo 1. Install Node.js to run the full bot
echo 2. View the algorithm demo in crypto-signal-bot-test.html
echo 3. Use the databases for when you get Node.js working
echo.
echo ?? The algorithm demo shows exactly how your bot will work!
echo.
pause