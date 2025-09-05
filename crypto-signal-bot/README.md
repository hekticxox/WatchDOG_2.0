# Crypto Signal Bot

A professional crypto trading signal bot with ML-powered predictions, real-time market scanning, and a beautiful web interface.

## Features

- ? Real-time market scanning across all major timeframes
- ? Point-based scoring system with indicator co-occurrence
- ? Max 10 active predictions (30min - 4hr duration)
- ? Card counting system (+1/-1 per symbol)
- ? ML-powered indicator weight optimization
- ? Beautiful React + Tailwind UI
- ? WebSocket real-time updates
- ? Confidence scoring and countdown timers

## Tech Stack

- **Frontend**: React (TypeScript) + Tailwind CSS + Recharts
- **Backend**: Node.js (TypeScript) + Express + WebSocket
- **Data**: PostgreSQL + Redis (Pub/Sub)
- **ML**: Python FastAPI + LightGBM/scikit-learn
- **Exchange**: Binance/Bybit WebSocket + CCXT
- **Deployment**: Docker + docker-compose

## Quick Start

```bash
# Clone and setup
git clone <repo>
cd crypto-signal-bot

# Start all services
docker-compose up -d

# Access frontend
open http://localhost:3000
```

## Architecture

- `backend/` - Node.js scanner, API, WebSocket server
- `frontend/` - React UI with prediction cards
- `ml/` - Python ML training service
- `docker-compose.yml` - Full stack orchestration

## Development

See individual README files in each directory for detailed setup instructions.