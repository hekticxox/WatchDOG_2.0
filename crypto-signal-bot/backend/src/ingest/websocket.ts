// file: backend/src/ingest/websocket.ts
// Role: Manage WebSocket connections to exchanges for real-time market data
// Requirements: Handle kline streams, connection management, error recovery

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KlineData {
  symbol: string;
  timeframe: string;
  data: OHLCV[];
}

export class WebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private dataStore: Map<string, Map<string, OHLCV[]>> = new Map(); // symbol -> timeframe -> data
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly maxDataPoints = 200; // Keep last 200 candles per timeframe
  private readonly reconnectDelay = 5000;

  constructor(private readonly exchange: 'binance' | 'bybit' = 'binance') {
    super();
  }

  async connect() {
    console.log('Connecting to WebSocket feeds...');
    // For now, we'll simulate connections - in production, connect to actual exchange WebSockets
    this.emit('connected');
  }

  subscribeToSymbol(symbol: string, timeframes: string[]) {
    // Initialize data storage for symbol
    if (!this.dataStore.has(symbol)) {
      this.dataStore.set(symbol, new Map());
    }

    const symbolData = this.dataStore.get(symbol)!;
    
    // Initialize each timeframe
    timeframes.forEach(tf => {
      if (!symbolData.has(tf)) {
        symbolData.set(tf, []);
      }
    });

    // In production, this would create actual WebSocket subscriptions
    console.log(`Subscribed to ${symbol} for timeframes: ${timeframes.join(', ')}`);
  }

  getKlineData(symbol: string, timeframe: string, limit: number = 100): OHLCV[] {
    const symbolData = this.dataStore.get(symbol);
    if (!symbolData) return [];

    const data = symbolData.get(timeframe) || [];
    return data.slice(-limit); // Return last N candles
  }

  // Simulate receiving market data (in production, this would be real WebSocket data)
  simulateMarketData(symbol: string, timeframe: string, ohlcv: OHLCV) {
    const symbolData = this.dataStore.get(symbol);
    if (!symbolData) return;

    const data = symbolData.get(timeframe);
    if (!data) return;

    // Add new candle and maintain size limit
    data.push(ohlcv);
    if (data.length > this.maxDataPoints) {
      data.shift(); // Remove oldest
    }

    this.emit('kline-update', { symbol, timeframe, data: [ohlcv] });
  }

  private reconnect(connectionKey: string) {
    const existingTimer = this.reconnectTimers.get(connectionKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      console.log(`Reconnecting WebSocket for ${connectionKey}...`);
      // Implement reconnection logic
      this.reconnectTimers.delete(connectionKey);
    }, this.reconnectDelay);

    this.reconnectTimers.set(connectionKey, timer);
  }

  disconnect() {
    // Close all connections
    for (const [key, ws] of this.connections.entries()) {
      ws.close();
      this.connections.delete(key);
    }

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    console.log('All WebSocket connections closed');
  }

  isConnected(): boolean {
    return this.connections.size > 0;
  }

  getConnectedSymbols(): string[] {
    return Array.from(this.dataStore.keys());
  }
}