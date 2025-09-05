# Crypto Signal Bot - Development Guide

## Quick Start with GitHub Copilot

This project is designed to work seamlessly with GitHub Copilot. Each file contains specific prompts and TODO comments that Copilot can expand into full implementations.

## File-by-File Copilot Instructions

### Backend Files

#### 1. `backend/src/scanner/score.ts`
- **Status**: ? Base implementation provided
- **Copilot Task**: Expand `computeScore()` with more sophisticated algorithms
- **Prompt**: "Add unit tests and optimize the co-occurrence bonus calculation"

#### 2. `backend/src/scanner/index.ts`
- **Status**: ?? Scaffolded, needs Copilot expansion
- **Key TODOs for Copilot**:
  - Implement `runScan()` method
  - Add WebSocket integration
  - Implement REST fallback for market data
  - Add error handling and rate limiting

#### 3. `backend/src/scanner/indicators.ts`
- **Status**: ? Comprehensive implementation
- **Copilot Task**: Add more indicators (Ichimoku, CCI, OBV, VWAP)
- **Prompt**: "Add Ichimoku cloud analysis and volume-weighted average price (VWAP) calculation"

#### 4. `backend/src/ingest/websocket.ts` (To Create)
```typescript
// file: backend/src/ingest/websocket.ts
// Role: Manage WebSocket connections to Binance/Bybit for real-time market data
// Requirements: Handle kline streams, connection management, error recovery
```

#### 5. `backend/src/db/predictions.ts` (To Create)
```typescript
// file: backend/src/db/predictions.ts
// Role: Database operations for predictions and outcomes
// Requirements: CRUD operations, outcome tracking, card count persistence
```

#### 6. `backend/src/api/websocket.ts` (To Create)
```typescript
// file: backend/src/api/websocket.ts
// Role: WebSocket server for frontend communication
// Requirements: Real-time prediction updates, scanner status broadcasts
```

### Frontend Files

#### 1. `frontend/src/components/PredictionCard.tsx`
- **Status**: ? Complete implementation
- **Copilot Task**: Add mini sparkline chart
- **Prompt**: "Implement a mini SVG sparkline chart showing recent price movement"

#### 2. `frontend/src/pages/Home.tsx`
- **Status**: ? Complete layout and logic
- **Copilot Task**: Enhance WebSocket handling
- **Prompt**: "Add reconnection logic and better error handling for WebSocket connection"

#### 3. `frontend/src/stores/predictions.ts` (To Create)
```typescript
// file: frontend/src/stores/predictions.ts
// Role: Zustand store for prediction state management
// Requirements: Real-time updates, sorting, filtering, persistence
```

### ML Service Files

#### 1. `ml/main.py`
- **Status**: ? Complete FastAPI service
- **Copilot Task**: Enhance feature engineering
- **Prompt**: "Add more sophisticated feature engineering and hyperparameter tuning for LightGBM"

## Step-by-Step Copilot Usage

### Phase 1: Complete Backend Core (30 minutes)

1. **Create WebSocket Manager**
   ```typescript
   // Paste this in: backend/src/ingest/websocket.ts
   // Create a WebSocket manager for Binance futures that maintains kline streams for multiple symbols and timeframes. Include connection pooling and automatic reconnection.
   ```

2. **Create Database Layer**
   ```typescript
   // Paste this in: backend/src/db/predictions.ts
   // Create Prisma/PostgreSQL operations for saving predictions, updating outcomes, and tracking card counts per symbol. Include migration scripts.
   ```

3. **Complete Scanner Integration**
   - Open `backend/src/scanner/index.ts`
   - Place cursor after `// TODO: Copilot should expand this to:`
   - Let Copilot expand the market data fetching logic

### Phase 2: Frontend Enhancement (20 minutes)

1. **Add State Management**
   ```typescript
   // Paste this in: frontend/src/stores/predictions.ts
   // Create a Zustand store for managing prediction state with WebSocket integration, optimistic updates, and local caching.
   ```

2. **Enhance UI Components**
   - Open `frontend/src/components/PredictionCard.tsx`
   - Find the sparkline placeholder
   - Let Copilot implement the mini chart

### Phase 3: ML Integration (15 minutes)

1. **Connect ML to Backend**
   ```typescript
   // Paste this in: backend/src/ml/client.ts
   // Create an HTTP client for communicating with the ML service to fetch updated weights and trigger training.
   ```

2. **Enhance Model Training**
   - Open `ml/main.py`
   - Find the feature engineering section
   - Ask Copilot to add more sophisticated features

## Key Copilot Prompts to Use

### For Technical Indicators
```
"Add calculation for Ichimoku Cloud components (Tenkan-sen, Kijun-sen, Senkou Span A/B, Chikou Span) with proper signal generation"
```

### For WebSocket Management
```
"Create a robust WebSocket manager with connection pooling, automatic reconnection, rate limiting, and symbol subscription management for Binance futures"
```

### For Database Operations
```
"Create comprehensive database models and operations for predictions, outcomes, symbol statistics, and indicator weights using Prisma ORM"
```

### For UI Enhancements
```
"Add beautiful loading states, error boundaries, and responsive design improvements using Tailwind CSS and Framer Motion"
```

### For ML Improvements
```
"Enhance the LightGBM model with feature selection, cross-validation, hyperparameter optimization using Optuna, and ensemble methods"
```

## Configuration Files Needed

Create these files and let Copilot fill them:

### Backend Config
```typescript
// backend/src/config/index.ts
// Create configuration management for API keys, database URLs, rate limits, and feature flags
```

### Frontend Config
```typescript
// frontend/src/config/index.ts
// Create environment-based configuration for API endpoints, WebSocket URLs, and feature toggles
```

### Docker Configs
```yaml
# backend/.env.example
# Create example environment variables for all required configuration
```

## Testing Strategy

### Unit Tests (Copilot Prompts)
```typescript
// backend/src/scanner/__tests__/score.test.ts
// Create comprehensive unit tests for the scoring algorithm with edge cases and performance benchmarks
```

```typescript
// frontend/src/components/__tests__/PredictionCard.test.tsx
// Create React Testing Library tests for PredictionCard component with various prediction states
```

### Integration Tests
```typescript
// backend/src/__tests__/integration/scanner.test.ts
// Create integration tests for the complete scanning pipeline with mocked exchange data
```

## Performance Optimization

### Backend Optimization
- Add Redis caching for market data
- Implement connection pooling for database
- Add rate limiting and request queuing

### Frontend Optimization
- Add virtual scrolling for large prediction lists
- Implement service worker for offline capability
- Add performance monitoring

## Security Considerations

- API key management and rotation
- Rate limiting and DDoS protection
- Input validation and sanitization
- WebSocket authentication

## Next Steps After Setup

1. **Test with Paper Trading**: Implement paper trading mode
2. **Add More Exchanges**: Extend to Bybit, FTX, etc.
3. **Advanced ML**: Add deep learning models
4. **Mobile App**: Create React Native companion
5. **Backtesting**: Add historical performance analysis

## Troubleshooting Common Issues

1. **WebSocket Connection Issues**: Check firewall and proxy settings
2. **Database Connection**: Verify PostgreSQL is running and accessible
3. **Rate Limiting**: Implement exponential backoff
4. **Memory Usage**: Monitor for memory leaks in long-running scans

This guide should give you and Copilot everything needed to build a professional-grade crypto signal bot!