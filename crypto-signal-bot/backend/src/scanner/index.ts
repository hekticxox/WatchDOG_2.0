// file: backend/src/scanner/index.ts
// Role: Continuously scan exchange market data, compute features, call computeScore(), and manage active predictions.
// Requirements:
//  - Use websocket candle store if available, fallback to REST for missing history
//  - Only create a prediction if estimated run is between 30m and 4h.
//  - Max 10 active predictions at any time. If slots full, only replace if new confidence > existing lowest.

import { computeScore, estimateRunDuration, IndicatorFeature } from './score';
import { IndicatorCalculator, OHLCV } from './indicators';
import { WebSocketManager } from '../ingest/websocket';
import { PredictionManager } from '../db/predictions';
import { ExchangeClient } from '../ingest/exchange';
import { EventEmitter } from 'events';

export interface MarketState {
  trend: 'bull' | 'bear' | 'neutral';
  strength: number; // 0-1 scale
  volatility: 'low' | 'medium' | 'high';
  momentum: 'accelerating' | 'steady' | 'decelerating';
  confidence: number; // 0-100
}

export interface OrderBookData {
  bidDepth: number;
  askDepth: number;
  spread: number;
  imbalance: number; // Positive = more buyers, Negative = more sellers
  liquidityScore: number; // 0-1 scale
}

export interface VolumeAnalysis {
  currentVolume: number;
  averageVolume: number;
  volumeRatio: number; // current/average
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  buyVsSellVolume: number; // Positive = more buying pressure
  volumeProfile: 'accumulation' | 'distribution' | 'neutral';
}

export interface Prediction {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  score: number;
  indicatorsHit: Record<string, number>;
  indicatorCount: number;
  confidence: number;
  estimatedRunMs: number;
  createdAt: string;
  expiresAt: string;
  cardCount: number;
  riskRewardRatio?: number;
  marketState?: MarketState;
  orderBookData?: OrderBookData;
  volumeAnalysis?: VolumeAnalysis;
  profitabilityScore?: number;
  targetZones?: {
    entryZone: {
      min: number;
      max: number;
      current: number;
      distanceFromEntry: number;
    };
    stopLoss: number;
    takeProfit: number[];
    supportLevels: number[];
    resistanceLevels: number[];
  };
  positionSizing?: {
    suggestedSize: number;
    maxRisk: number;
    kellyFraction: number;
  };
  finalOutcome?: { pnlPercent: number; closedAt: string };
}

export interface ScannerStatus {
  isRunning: boolean;
  lastScan: string;
  symbolsScanned: number;
  activePredictions: number;
  totalPredictions: number;
  successRate: number;
  errorCount: number;
  uptime: number;
}

export class MarketScanner extends EventEmitter {
  private activePredictions: Map<string, Prediction> = new Map();
  private cardCounts: Map<string, number> = new Map();
  private scanInterval?: NodeJS.Timeout;
  private readonly maxActivePredictions = 10;
  private readonly timeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h'];
  private indicatorCalculator: IndicatorCalculator;
  private exchangeClient: ExchangeClient;
  private status: ScannerStatus;
  private isScanning = false;
  private startTime: number;
  private errorCount = 0;
  private lastSuccessfulScan: string = '';
  
  constructor(
    private wsManager: WebSocketManager,
    private predictionManager: PredictionManager
  ) {
    super();
    this.indicatorCalculator = new IndicatorCalculator();
    this.exchangeClient = new ExchangeClient('binance');
    this.startTime = Date.now();
    this.status = {
      isRunning: false,
      lastScan: '',
      symbolsScanned: 0,
      activePredictions: 0,
      totalPredictions: 0,
      successRate: 0,
      errorCount: 0,
      uptime: 0
    };
    
    this.loadCardCounts();
  }

  async start() {
    console.log('?? Starting market scanner...');
    
    try {
      // Test exchange connection
      const connected = await this.exchangeClient.testConnection();
      if (!connected) {
        throw new Error('Failed to connect to exchange');
      }

      // Connect to websocket feeds
      await this.wsManager.connect();
      
      // Subscribe to top symbols
      const symbols = await this.getTopFuturesSymbols();
      console.log(`?? Subscribing to ${symbols.length} symbols...`);
      
      symbols.forEach(symbol => {
        this.wsManager.subscribeToSymbol(symbol, this.timeframes);
      });

      this.status.isRunning = true;
      
      // Start scanning interval
      this.scanInterval = setInterval(async () => {
        if (!this.isScanning) {
          await this.runScan();
        }
      }, 30000); // 30 seconds

      // Run initial scan
      setTimeout(async () => {
        await this.runScan();
      }, 5000);
      
      console.log('? Market scanner started successfully');
      
    } catch (error) {
      console.error('? Failed to start market scanner:', error);
      this.status.isRunning = false;
      throw error;
    }
  }

  async stop() {
    console.log('?? Stopping market scanner...');
    
    this.status.isRunning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    this.wsManager.disconnect();
    await this.predictionManager.cleanup();
    
    console.log('? Market scanner stopped');
  }

  private async runScan() {
    if (this.isScanning) {
      console.log('? Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    const scanStartTime = Date.now();
    
    try {
      console.log('?? Running market scan...');
      
      // Clean up expired predictions first
      this.cleanupExpiredPredictions();
      this.cleanupDuplicatePredictions();
      
      // Get symbols to scan
      const symbols = await this.getTopFuturesSymbols();
      let symbolsProcessed = 0;
      let newPredictions = 0;
      
      for (const symbol of symbols) {
        try {
          const wasCreated = await this.scanSymbol(symbol);
          if (wasCreated) newPredictions++;
          symbolsProcessed++;
          
          // Stop if we have enough high-quality predictions
          if (this.activePredictions.size >= this.maxActivePredictions && symbolsProcessed >= 30) {
            console.log(`?? Stopping scan after ${symbolsProcessed} symbols - slots filled`);
            break;
          }
          
        } catch (error) {
          console.error(`? Error scanning symbol ${symbol}:`, error);
          this.errorCount++;
        }
      }
      
      // Update status
      this.status.lastScan = new Date().toISOString();
      this.status.symbolsScanned = symbolsProcessed;
      this.status.activePredictions = this.activePredictions.size;
      this.status.successRate = await this.predictionManager.getSuccessRate();
      this.status.errorCount = this.errorCount;
      this.status.uptime = Date.now() - this.startTime;
      this.lastSuccessfulScan = this.status.lastScan;
      
      // Emit updates
      this.emit('predictions-update', Array.from(this.activePredictions.values()));
      this.emit('scanner-status', this.status);
      
      const scanDuration = Date.now() - scanStartTime;
      console.log(`? Scan completed in ${scanDuration}ms. Processed ${symbolsProcessed} symbols, created ${newPredictions} new predictions.`);
      
    } catch (error) {
      console.error('? Error in market scan:', error);
      this.errorCount++;
      this.status.errorCount = this.errorCount;
    } finally {
      this.isScanning = false;
    }
  }

  private async scanSymbol(symbol: string): Promise<boolean> {
    const cardCount = this.cardCounts.get(symbol) || 0;
    const features: IndicatorFeature[] = [];
    
    // Get market data for all timeframes
    for (const timeframe of this.timeframes) {
      try {
        let ohlcvData = this.wsManager.getKlineData(symbol, timeframe, 100);
        
        if (ohlcvData.length < 50) {
          const ccxtData = await this.exchangeClient.getOHLCV(symbol, timeframe, 100);
          if (ccxtData.length > 0) {
            ohlcvData = this.exchangeClient.convertOHLCV(ccxtData);
            ohlcvData.forEach(candle => {
              this.wsManager.simulateMarketData(symbol, timeframe, candle);
            });
          }
        }
        
        if (ohlcvData.length >= 50) {
          const timeframeFeatures = this.indicatorCalculator.calculateIndicators(ohlcvData, timeframe);
          features.push(...timeframeFeatures);
        }
      } catch (error) {
        console.error(`? Error getting data for ${symbol} ${timeframe}:`, error);
      }
    }
    
    if (features.length === 0) {
      return false;
    }
    
    // Compute score
    const result = computeScore(features, cardCount);
    
    // Simple threshold - can be made more sophisticated later
    // **ADJUSTED: More realistic thresholds for actual trading**
    const minScore = 2.8; // Reduced from 3.5 to be less strict
    const minConfidence = 65; // Reduced from 70 to allow more signals
    
    if (Math.abs(result.score) >= minScore) {
      const direction = result.score > 0 ? 'long' : 'short';
      const timeframesAgreement = this.getAgreementTimeframes(features, direction);
      const estimatedRunMs = estimateRunDuration(Math.abs(result.score), timeframesAgreement);
      
      // Check duration constraints
      const minDuration = 30 * 60 * 1000; // 30 minutes
      const maxDuration = 4 * 60 * 60 * 1000; // 4 hours
      
      if (estimatedRunMs >= minDuration && estimatedRunMs <= maxDuration) {
        const confidence = this.calculateConfidence(result.score, result.indicatorCount, features);
        
        // **NEW: Higher confidence requirement**
        if (confidence >= minConfidence && await this.shouldCreatePrediction(symbol, confidence)) {
          return await this.createPrediction(symbol, direction, result, estimatedRunMs, cardCount, features);
        }
      }
    }
    
    return false;
  }

  private calculateConfidence(score: number, indicatorCount: number, features: IndicatorFeature[]): number {
    // Base confidence on score magnitude
    let baseConfidence = Math.min(Math.abs(score) * 10, 50);
    
    // Bonus for indicator count
    const indicatorBonus = Math.min(indicatorCount * 2, 20);
    
    // Bonus for timeframe agreement
    const agreementScore = this.getTimeframeAgreementScore(features);
    const agreementBonus = agreementScore * 25;
    
    const totalConfidence = baseConfidence + indicatorBonus + agreementBonus;
    
    return Math.min(Math.max(totalConfidence, 10), 95);
  }

  private getTimeframeAgreementScore(features: IndicatorFeature[]): number {
    const directionCounts: Record<string, Record<string, number>> = {};
    
    features.forEach(f => {
      if (!f.direction) return;
      
      if (!directionCounts[f.timeframe]) {
        directionCounts[f.timeframe] = { long: 0, short: 0 };
      }
      
      directionCounts[f.timeframe][f.direction]++;
    });
    
    let totalAgreement = 0;
    let totalTimeframes = 0;
    
    Object.entries(directionCounts).forEach(([tf, counts]) => {
      const totalCount = counts.long + counts.short;
      if (totalCount > 0) {
        const maxCount = Math.max(counts.long, counts.short);
        const agreement = maxCount / totalCount;
        totalAgreement += agreement;
        totalTimeframes++;
      }
    });
    
    return totalTimeframes > 0 ? totalAgreement / totalTimeframes : 0;
  }

  private getAgreementTimeframes(features: IndicatorFeature[], direction: 'long' | 'short'): string[] {
    const tfCounts: Record<string, number> = {};
    
    features.forEach(f => {
      if (f.direction === direction) {
        tfCounts[f.timeframe] = (tfCounts[f.timeframe] || 0) + 1;
      }
    });
    
    return Object.entries(tfCounts)
      .filter(([_, count]) => count >= 2)
      .map(([tf, _]) => tf);
  }

  private async shouldCreatePrediction(symbol: string, confidence: number): Promise<boolean> {
    // Simple duplicate check
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const existingPrediction = Array.from(this.activePredictions.values())
      .find(p => p.symbol.replace('/', '').toUpperCase() === normalizedSymbol);
    
    if (existingPrediction) {
      return false;
    }

    // **NEW: Balance check to prevent extreme bias**
    const currentPredictions = Array.from(this.activePredictions.values());
    const longCount = currentPredictions.filter(p => p.direction === 'long').length;
    const shortCount = currentPredictions.filter(p => p.direction === 'short').length;
    
    // If we have 7+ of one direction and 0-1 of the other, require very high confidence
    const isImbalanced = (longCount >= 7 && shortCount <= 1) || (shortCount >= 7 && longCount <= 1);
    if (isImbalanced && confidence < 85) {
      console.log(`?? Rejecting signal due to portfolio imbalance (L:${longCount}, S:${shortCount}, conf:${confidence})`);
      return false;
    }

    // Minimum confidence threshold
    if (confidence < 65) { // Reduced from 70
      return false;
    }

    // If slots available, create it
    if (this.activePredictions.size < this.maxActivePredictions) {
      return true;
    }

    // If slots full, only replace if significantly better
    const predictions = Array.from(this.activePredictions.values());
    predictions.sort((a, b) => a.confidence - b.confidence);
    const lowestConfidence = predictions[0].confidence;
    
    return confidence > lowestConfidence + 15; // Increased from 10
  }

  private async createPrediction(
    symbol: string, 
    direction: 'long' | 'short', 
    scoreResult: any, 
    estimatedRunMs: number,
    cardCount: number,
    features: IndicatorFeature[]
  ): Promise<boolean> {
    
    // **IMPROVED: Real market state analysis instead of hardcoded**
    const marketState: MarketState = await this.analyzeMarketState(symbol, features);

    const confidence = this.calculateConfidence(scoreResult.score, scoreResult.indicatorCount, features);
    
    // **NEW: Trend alignment check to prevent dangerous counter-trend trades**
    if (!this.isTrendAligned(direction, marketState)) {
      console.log(`?? Skipping ${direction} ${symbol} - counter-trend (market: ${marketState.trend})`);
      return false;
    }

    // Remove lowest confidence prediction if at capacity
    if (this.activePredictions.size >= this.maxActivePredictions) {
      const predictions = Array.from(this.activePredictions.values());
      predictions.sort((a, b) => a.confidence - b.confidence);
      const lowest = predictions[0];
      this.activePredictions.delete(lowest.id);
    }

    const now = new Date();
    const timestamp = now.getTime();
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    
    const prediction: Prediction = {
      id: `${normalizedSymbol}-${timestamp}`,
      symbol: normalizedSymbol,
      direction,
      score: scoreResult.score,
      indicatorsHit: scoreResult.breakdown,
      indicatorCount: scoreResult.indicatorCount,
      confidence,
      estimatedRunMs,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + estimatedRunMs).toISOString(),
      cardCount,
      riskRewardRatio: this.calculateRiskReward(direction, marketState),
      marketState,
      profitabilityScore: this.calculateProfitabilityScore(confidence, marketState, direction)
    };

    this.activePredictions.set(prediction.id, prediction);
    
    // Update card count
    const newCardCount = cardCount + (direction === 'long' ? 1 : -1);
    this.cardCounts.set(normalizedSymbol, newCardCount);
    
    // Save to database
    await this.predictionManager.savePrediction(prediction);
    await this.predictionManager.updateSymbolCardCount(normalizedSymbol, direction);
    
    const durationMins = Math.round(estimatedRunMs / (1000 * 60));
    console.log(`?? Created ${direction.toUpperCase()} prediction for ${symbol} (${confidence}% confidence, ${durationMins}min, trend: ${marketState.trend})`);
    
    return true;
  }

  // **NEW: Real market state analysis**
  private async analyzeMarketState(symbol: string, features: IndicatorFeature[]): Promise<MarketState> {
    try {
      // Get recent price data
      const recentData = this.wsManager.getKlineData(symbol, '1h', 24) || 
                        await this.exchangeClient.getOHLCV(symbol, '1h', 24);
      
      if (recentData.length < 10) {
        return {
          trend: 'neutral',
          strength: 0.5,
          volatility: 'medium',
          momentum: 'steady',
          confidence: 30
        };
      }

      const closes = recentData.map(d => d.close);
      const currentPrice = closes[closes.length - 1];
      const priceChange24h = (currentPrice - closes[0]) / closes[0];
      
      // Determine trend
      let trend: 'bull' | 'bear' | 'neutral' = 'neutral';
      if (priceChange24h > 0.02) trend = 'bull';
      else if (priceChange24h < -0.02) trend = 'bear';

      // Calculate volatility
      const returns = closes.slice(1).map((close, i) => (close - closes[i]) / closes[i]);
      const volatility = Math.sqrt(returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length);
      
      let volLevel: 'low' | 'medium' | 'high' = 'medium';
      if (volatility < 0.01) volLevel = 'low';
      else if (volatility > 0.03) volLevel = 'high';

      // Determine momentum
      const recentReturns = returns.slice(-6);
      const avgRecentReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
      
      let momentum: 'accelerating' | 'steady' | 'decelerating' = 'steady';
      if (Math.abs(avgRecentReturn) > volatility * 0.5) {
        momentum = 'accelerating';
      } else if (Math.abs(avgRecentReturn) < volatility * 0.2) {
        momentum = 'decelerating';
      }

      // Calculate strength and confidence
      const strength = Math.min(Math.abs(priceChange24h) * 10, 1);
      const directionAgreement = this.getDirectionAgreement(features);
      const confidence = Math.min(50 + directionAgreement * 50, 95);

      return {
        trend,
        strength,
        volatility: volLevel,
        momentum,
        confidence
      };

    } catch (error) {
      console.error(`? Error analyzing market state for ${symbol}:`, error);
      return {
        trend: 'neutral',
        strength: 0.5,
        volatility: 'medium',
        momentum: 'steady',
        confidence: 30
      };
    }
  }

  // **NEW: Check if signal aligns with trend**
  private isTrendAligned(direction: 'long' | 'short', marketState: MarketState): boolean {
    // Allow neutral trend trades
    if (marketState.trend === 'neutral') return true;
    
    // Strong trend alignment requirement
    if (marketState.strength > 0.6) {
      return (direction === 'long' && marketState.trend === 'bull') ||
             (direction === 'short' && marketState.trend === 'bear');
    }
    
    // Weak trends allow both directions
    return true;
  }

  // **NEW: Calculate direction agreement**
  private getDirectionAgreement(features: IndicatorFeature[]): number {
    const longCount = features.filter(f => f.direction === 'long').length;
    const shortCount = features.filter(f => f.direction === 'short').length;
    const totalCount = longCount + shortCount;
    
    if (totalCount === 0) return 0;
    
    const maxCount = Math.max(longCount, shortCount);
    return maxCount / totalCount;
  }

  // **NEW: Smart risk/reward calculation**
  private calculateRiskReward(direction: 'long' | 'short', marketState: MarketState): number {
    let baseRR = 2.0;
    
    // Adjust based on trend alignment
    if ((direction === 'long' && marketState.trend === 'bull') ||
        (direction === 'short' && marketState.trend === 'bear')) {
      baseRR += 0.5; // Trend-following bonus
    }
    
    // Adjust for volatility
    if (marketState.volatility === 'high') baseRR += 0.3;
    else if (marketState.volatility === 'low') baseRR -= 0.2;
    
    return Math.max(1.5, Math.min(baseRR, 4.0));
  }

  // **NEW: Improved profitability score**
  private calculateProfitabilityScore(confidence: number, marketState: MarketState, direction: 'long' | 'short'): number {
    let score = confidence * 0.7; // Base from confidence
    
    // Trend alignment bonus
    const trendAligned = this.isTrendAligned(direction, marketState);
    if (trendAligned && marketState.trend !== 'neutral') {
      score += 15;
    } else if (!trendAligned) {
      score -= 20; // Heavy penalty for counter-trend
    }
    
    // Market strength bonus
    score += marketState.strength * 10;
    
    // Momentum bonus
    if (marketState.momentum === 'accelerating') score += 5;
    else if (marketState.momentum === 'decelerating') score -= 5;
    
    return Math.max(10, Math.min(score, 95));
  }

  private cleanupExpiredPredictions() {
    const now = new Date();
    const expiredIds: string[] = [];
    
    for (const [id, prediction] of this.activePredictions.entries()) {
      if (new Date(prediction.expiresAt) <= now) {
        expiredIds.push(id);
      }
    }
    
    expiredIds.forEach(id => {
      this.activePredictions.delete(id);
    });
    
    if (expiredIds.length > 0) {
      console.log(`? Removed ${expiredIds.length} expired predictions`);
    }
  }

  private cleanupDuplicatePredictions() {
    const symbolMap = new Map<string, Prediction[]>();
    
    for (const prediction of this.activePredictions.values()) {
      const normalizedSymbol = prediction.symbol.replace('/', '').toUpperCase();
      if (!symbolMap.has(normalizedSymbol)) {
        symbolMap.set(normalizedSymbol, []);
      }
      symbolMap.get(normalizedSymbol)!.push(prediction);
    }
    
    let removedCount = 0;
    for (const [symbol, predictions] of symbolMap.entries()) {
      if (predictions.length > 1) {
        predictions.sort((a, b) => b.confidence - a.confidence);
        
        for (let i = 1; i < predictions.length; i++) {
          this.activePredictions.delete(predictions[i].id);
          removedCount++;
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`?? Cleaned up ${removedCount} duplicate predictions`);
    }
  }

  private async getTopFuturesSymbols(): Promise<string[]> {
    try {
      // **IMPROVED: Try to get more symbols from exchange**
      return await this.exchangeClient.getTopFuturesSymbols(100); // Increased from 50
    } catch (error) {
      console.error('? Error fetching symbols:', error);
      
      // **EXPANDED: Much larger fallback list with 65+ diverse symbols**
      return [
        // Major Cryptocurrencies (Top 10)
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
        'SOL/USDT', 'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT',
        
        // DeFi & Layer 1 Blockchains
        'LINK/USDT', 'UNI/USDT', 'AAVE/USDT', 'ATOM/USDT', 'NEAR/USDT',
        'FTM/USDT', 'ALGO/USDT', 'ONE/USDT', 'VET/USDT', 'ICP/USDT',
        
        // Layer 2 & Scaling Solutions
        'MATIC/USDT', 'LRC/USDT', 'OP/USDT', 'ARB/USDT', 'IMX/USDT',
        'MASK/USDT', 'CRO/USDT', 'FTT/USDT', 'HT/USDT', 'KCS/USDT',
        
        // Meme & Community Coins
        'SHIB/USDT', 'PEPE/USDT', 'FLOKI/USDT', 'BONK/USDT', 'WIF/USDT',
        'MEME/USDT', 'DEGEN/USDT', 'BRETT/USDT', 'MOG/USDT', 'POPCAT/USDT',
        
        // AI & Gaming Tokens
        'FET/USDT', 'AGIX/USDT', 'RNDR/USDT', 'TAO/USDT', 'OCEAN/USDT',
        'AXS/USDT', 'SAND/USDT', 'MANA/USDT', 'ENJ/USDT', 'GALA/USDT',
        
        // Traditional Finance & Stablecoins
        'LTC/USDT', 'BCH/USDT', 'ETC/USDT', 'XLM/USDT', 'TRX/USDT',
        'XMR/USDT', 'ZEC/USDT', 'DASH/USDT', 'EOS/USDT', 'IOTA/USDT',
        
        // New & Emerging Projects
        'SUI/USDT', 'APT/USDT', 'SEI/USDT', 'TIA/USDT', 'PYTH/USDT',
        'JTO/USDT', 'WEN/USDT', 'JUPITER/USDT', 'DRIFT/USDT', 'RAY/USDT',
        
        // Additional High-Volume Pairs
        'HBAR/USDT', 'QNT/USDT', 'FLOW/USDT', 'ICP/USDT', 'THETA/USDT',
        'CHZ/USDT', 'MANA/USDT', 'ALICE/USDT', 'TLM/USDT', 'WIN/USDT'
      ];
    }
  }

  private async loadCardCounts() {
    try {
      const stats = await this.predictionManager.getAllSymbolStats();
      stats.forEach(stat => {
        this.cardCounts.set(stat.symbol, stat.cardCount);
      });
      
      console.log(`?? Loaded card counts for ${stats.length} symbols`);
    } catch (error) {
      console.error('? Error loading card counts:', error);
    }
  }

  // Public methods for external access
  getActivePredictions(): Prediction[] {
    return Array.from(this.activePredictions.values());
  }

  getStatus(): ScannerStatus {
    return { 
      ...this.status,
      uptime: Date.now() - this.startTime,
      activePredictions: this.activePredictions.size 
    };
  }

  getCardCount(symbol: string): number {
    return this.cardCounts.get(symbol) || 0;
  }

  async forceRescan(): Promise<void> {
    if (!this.isScanning) {
      console.log('?? Force rescan requested');
      await this.runScan();
    }
  }

  forceCleanupDuplicates(): number {
    const beforeCount = this.activePredictions.size;
    this.cleanupDuplicatePredictions();
    const afterCount = this.activePredictions.size;
    const removedCount = beforeCount - afterCount;
    
    if (removedCount > 0) {
      this.emit('predictions-update', Array.from(this.activePredictions.values()));
    }
    
    return removedCount;
  }

  getMetrics() {
    return {
      uptime: Date.now() - this.startTime,
      errorCount: this.errorCount,
      activePredictions: this.activePredictions.size,
      cardCountsLoaded: this.cardCounts.size,
      isHealthy: this.status.isRunning && this.errorCount < 10
    };
  }
}