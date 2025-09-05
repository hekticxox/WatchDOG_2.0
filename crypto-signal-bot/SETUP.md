# Crypto Signal Bot - Setup Instructions

## ?? Quick Setup Guide

### Prerequisites
- Node.js (v18 or higher)
- Python (v3.8 or higher)
- Docker Desktop (for databases)

### Option 1: Automated Setup (Windows)

1. **Install Dependencies**
   ```cmd
   install-deps.bat
   ```

2. **Configure Environment**
   ```cmd
   copy backend\.env.example backend\.env
   ```
   Edit `backend\.env` with your API keys (optional for testing)

3. **Start Development Environment**
   ```cmd
   start-dev.bat
   ```

### Option 2: Manual Setup

#### Backend Setup
```bash
cd crypto-signal-bot/backend
npm install
npm run build
```

#### Frontend Setup
```bash
cd crypto-signal-bot/frontend
npm install
npm start
```

#### ML Service Setup
```bash
cd crypto-signal-bot/ml
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

#### Database Setup
```bash
docker-compose up -d postgres redis
```

### Option 3: Full Docker Setup
```bash
docker-compose up -d
```

## ?? Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Frontend (3000): Change in package.json or kill existing process
   - Backend (8000): Change PORT in .env file
   - ML Service (8001): Change port in start command

2. **Database Connection Issues**
   - Ensure Docker is running
   - Check postgres and redis containers: `docker ps`
   - Restart containers: `docker-compose restart postgres redis`

3. **Missing API Keys**
   - The bot works without API keys using public data
   - For production, add Binance API keys to `.env`

4. **PowerShell Issues**
   - Use Command Prompt instead
   - Or use the provided .bat files

### Development Commands

```bash
# Backend
cd backend
npm run dev          # Start with hot reload
npm run build        # Build TypeScript
npm run start        # Start production build

# Frontend
cd frontend
npm start            # Start development server
npm run build        # Build for production

# ML Service
cd ml
python main.py       # Start FastAPI server
```

## ?? System Architecture

```
???????????????????    ???????????????????    ???????????????????
?    Frontend     ?    ?     Backend     ?    ?   ML Service   ?
?   React + TS    ??????   Node.js + TS  ??????  Python + API  ?
?   Port: 3000    ?    ?   Port: 8000    ?    ?   Port: 8001   ?
???????????????????    ???????????????????    ???????????????????
         ?                       ?                       ?
         ?                       ?                       ?
         ?              ???????????????????              ?
         ?              ?   PostgreSQL    ?              ?
         ?              ?   Port: 5432    ?              ?
         ?              ???????????????????              ?
         ?                       ?                       ?
         ?                       ?                       ?
         ?              ???????????????????              ?
         ????????????????     Redis       ????????????????
                        ?   Port: 6379    ?
                        ???????????????????
```

## ?? Testing the Bot

1. **Check Health Status**
   - Backend: http://localhost:8000/api/health
   - ML Service: http://localhost:8001/

2. **View Dashboard**
   - Frontend: http://localhost:3000

3. **Force a Scan**
   - POST to: http://localhost:8000/api/scan

4. **Check Logs**
   - Backend: Check console output
   - Frontend: Check browser console
   - ML: Check Python console

## ?? Environment Variables

Create `backend/.env` from `.env.example`:

```env
# Required
DATABASE_URL=postgresql://postgres:password@localhost:5432/crypto_signals
REDIS_URL=redis://localhost:6379

# Optional (for production)
BINANCE_API_KEY=your_api_key
BINANCE_SECRET=your_secret

# Scanning Configuration
MAX_ACTIVE_PREDICTIONS=10
SCAN_INTERVAL_MS=30000
MIN_CONFIDENCE_THRESHOLD=50
```

## ?? Expected Behavior

1. **Scanner starts** and connects to Binance
2. **Market data flows** in real-time
3. **Indicators calculate** across all timeframes
4. **Predictions generate** when thresholds met
5. **Frontend updates** with live predictions
6. **Countdown timers** show time remaining
7. **ML service** learns from outcomes

## ?? First Run Notes

- Initial scan may take 30-60 seconds
- Predictions appear when significant signals found
- Card counts start at 0 and build over time
- Confidence improves as ML model learns

Enjoy your professional crypto signal bot! ????