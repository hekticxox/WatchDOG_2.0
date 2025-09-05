// file: backend/src/ingest/exchange.ts
// Role: Exchange API client for REST fallback and symbol data
// Requirements: Rate limiting, error handling, top symbols fetching

import ccxt from 'ccxt';

export interface ExchangeSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  volume24h: number;
  price: number;
  isActive: boolean;
}

export class ExchangeClient {
  private exchange: any; // Use any instead of ccxt.Exchange
  private lastRequestTime: number = 0;
  private readonly minRequestInterval = 100; // 100ms between requests

  constructor(exchangeName: 'binance' | 'bybit' = 'binance') {
    // Initialize exchange (using public API only for now)
    if (exchangeName === 'binance') {
      this.exchange = new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        sandbox: false,
        options: {
          defaultType: 'future', // Use futures
        },
      });
    } else {
      this.exchange = new ccxt.bybit({
        apiKey: process.env.BYBIT_API_KEY,
        secret: process.env.BYBIT_SECRET,
        sandbox: false,
      });
    }
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  async getTopFuturesSymbols(limit: number = 50): Promise<string[]> {
    try {
      await this.rateLimit();
      
      // Get all futures markets
      const markets = await this.exchange.loadMarkets();
      
      // Filter for USDT perpetual futures
      const futuresMarkets = Object.values(markets).filter((market: any) => 
        market.type === 'swap' && 
        market.quote === 'USDT' && 
        market.active &&
        !market.symbol.includes('1000') // Exclude leveraged tokens
      );

      // Get 24h ticker data to sort by volume
      const tickers = await this.exchange.fetchTickers();
      
      // Combine market info with ticker data and sort by volume
      const symbolsWithVolume = futuresMarkets
        .map((market: any) => ({
          symbol: market.symbol,
          volume: tickers[market.symbol]?.quoteVolume || 0
        }))
        .filter(item => item.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, limit)
        .map(item => item.symbol);

      console.log(`Fetched top ${symbolsWithVolume.length} futures symbols`);
      return symbolsWithVolume;
      
    } catch (error) {
      console.error('Error fetching top futures symbols:', error);
      
      // Fallback to hardcoded list
      return [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
        'SOL/USDT', 'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT',
        'LINK/USDT', 'UNI/USDT', 'LTC/USDT', 'BCH/USDT', 'ATOM/USDT',
        'FIL/USDT', 'TRX/USDT', 'ETC/USDT', 'XLM/USDT', 'VET/USDT'
      ];
    }
  }

  async getOHLCV(symbol: string, timeframe: string, limit: number = 100): Promise<any[]> {
    try {
      await this.rateLimit();
      
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      return ohlcv;
      
    } catch (error) {
      console.error(`Error fetching OHLCV for ${symbol} ${timeframe}:`, error);
      return [];
    }
  }

  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      await this.rateLimit();
      
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker.last;
      
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    }
  }

  // Convert CCXT OHLCV format to our OHLCV interface
  convertOHLCV(ccxtData: any[]): import('../ingest/websocket').OHLCV[] {
    return ccxtData.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));
  }

  // Normalize symbol format for internal use
  normalizeSymbol(symbol: string): string {
    // Convert from CCXT format (BTC/USDT) to exchange format (BTCUSDT)
    return symbol.replace('/', '');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.exchange.loadMarkets();
      console.log(`Successfully connected to ${this.exchange.name}`);
      return true;
    } catch (error) {
      console.error(`Failed to connect to ${this.exchange.name}:`, error);
      return false;
    }
  }
}