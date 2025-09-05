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
  riskRewardRatio?: number; // Add optional risk/reward ratio
  // Enhanced market context
  marketState?: MarketState;
  orderBookData?: OrderBookData;
  volumeAnalysis?: VolumeAnalysis;
  profitabilityScore?: number; // 0-100 Overall profitability for beginners
  // Add target zones for better entry/exit points
  targetZones?: {
    entryZone: {
      min: number;
      max: number;
      current: number;
      distanceFromEntry: number; // % away from ideal entry
    };
    stopLoss: number;
    takeProfit: number[];
    supportLevels: number[];
    resistanceLevels: number[];
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
  private cardCounts: Map<string, number> = new Map(); // symbol -> count
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
    
    // Load existing card counts on startup
    this.loadCardCounts();
  }

  async start() {
    console.log('?? Starting market scanner...');
    
    try {
      // Test exchange connection with retry
      let connected = false;
      for (let i = 0; i < 3; i++) {
        connected = await this.exchangeClient.testConnection();
        if (connected) break;
        console.log(`Connection attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      if (!connected) {
        throw new Error('Failed to connect to exchange after 3 attempts');
      }

      // Connect to websocket feeds
      await this.wsManager.connect();
      
      // Subscribe to top symbols
      const symbols = await this.getTopFuturesSymbols();
      console.log(`?? Subscribing to ${symbols.length} symbols: ${symbols.slice(0, 5).join(', ')}...`);
      
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

      // Run initial scan after a short delay to let WebSocket connections establish
      setTimeout(async () => {
        await this.runScan();
      }, 5000);
      
      console.log('? Market scanner started successfully');
      
    } catch (error) {
      console.error("? Failed to start market scanner:", error);
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
    
    // Final cleanup
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
      
      // Clean up any duplicate predictions
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
          
          // More lenient stopping condition - scan more symbols even when slots are full
          if (this.activePredictions.size >= this.maxActivePredictions) {
            const predictions = Array.from(this.activePredictions.values());
            const lowestConfidence = Math.min(...predictions.map(p => p.confidence));
            
            // Only stop scanning if:
            // 1. We've processed at least 15 symbols AND
            // 2. Lowest confidence is very high (87%+) AND
            // 3. We haven't found any new predictions in the last 5 symbols
            const shouldStop = symbolsProcessed >= 15 && 
                              lowestConfidence > 87 && 
                              newPredictions === 0 && 
                              symbolsProcessed % 5 === 0;
            
            if (shouldStop) {
              console.log(`?? Stopping scan after ${symbolsProcessed} symbols - all slots filled with very high confidence (lowest: ${lowestConfidence}%)`);
              break;
            }
          }
          
          // Continue scanning until we've processed at least 25 symbols
          // This ensures we always scan a good portion of the market
          if (symbolsProcessed >= 25 && this.activePredictions.size >= this.maxActivePredictions) {
            const predictions = Array.from(this.activePredictions.values());
            const lowestConfidence = Math.min(...predictions.map(p => p.confidence));
            
            if (lowestConfidence > 82) {
              console.log(`? Completed comprehensive scan of ${symbolsProcessed} symbols (lowest confidence: ${lowestConfidence}%)`);
              break;
            }
          }
          
        } catch (error) {
          console.error(`? Error scanning symbol ${symbol}:`, error);
          this.errorCount++;
        }
      }
      
      // Final cleanup to ensure no duplicates
      this.cleanupDuplicatePredictions();
      
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
    let trendStrength = 0;
    
    // Get market data for all timeframes
    for (const timeframe of this.timeframes) {
      try {
        // Try websocket data first, fallback to REST
        let ohlcvData = this.wsManager.getKlineData(symbol, timeframe, 100);
        
        if (ohlcvData.length < 50) {
          // Fallback to REST API
          const ccxtData = await this.exchangeClient.getOHLCV(symbol, timeframe, 100);
          if (ccxtData.length > 0) {
            ohlcvData = this.exchangeClient.convertOHLCV(ccxtData);
            
            // Store this data in websocket manager for future use
            ohlcvData.forEach(candle => {
              this.wsManager.simulateMarketData(symbol, timeframe, candle);
            });
          }
        }
        
        if (ohlcvData.length >= 50) {
          // Calculate indicators for this timeframe
          const timeframeFeatures = this.indicatorCalculator.calculateIndicators(ohlcvData, timeframe);
          features.push(...timeframeFeatures);
          
          // Calculate trend strength for higher timeframes
          if (['1h', '2h', '4h'].includes(timeframe)) {
            const tfTrendStrength = this.calculateTrendStrength(ohlcvData);
            trendStrength = Math.max(trendStrength, tfTrendStrength);
          }
        }
      } catch (error) {
        console.error(`? Error getting data for ${symbol} ${timeframe}:`, error);
      }
    }
    
    if (features.length === 0) {
      return false; // No data available
    }
    
    // More lenient filtering - process more symbols
    const agreementScore = this.getTimeframeAgreementScore(features);
    
    // Only skip if BOTH trend and agreement are very weak
    if (trendStrength < 0.3 && agreementScore < 0.6) {
      return false; // Skip only very weak signals
    }
    
    // Compute aggregate score
    const result = computeScore(features, cardCount);
    
    // More flexible score requirements - ESPECIALLY for longs in bear markets
    let minScore = 2.0;
    
    // Lower threshold for strong trends or high agreement
    if (trendStrength > 1.0 || agreementScore > 0.8) {
      minScore = 1.8;
    }
    
    // Even lower for very strong signals
    if (trendStrength > 2.0 && agreementScore > 0.9) {
      minScore = 1.5;
    }
    
    // SPECIAL: Lower threshold for LONG signals in bear markets
    if (result.score > 0) { // Long signal
      minScore = Math.min(minScore, 1.6); // Allow longs with lower scores
      console.log(`?? Found potential LONG signal for ${symbol} with score ${result.score.toFixed(2)} (threshold: ${minScore})`);
    }
    
    if (Math.abs(result.score) >= minScore) {
      const direction = result.score > 0 ? 'long' : 'short';
      const timeframesAgreement = this.getAgreementTimeframes(features, direction);
      const estimatedRunMs = estimateRunDuration(Math.abs(result.score), timeframesAgreement);
      
      // Check duration constraints (30m to 4h)
      const minDuration = 30 * 60 * 1000; // 30 minutes
      const maxDuration = 4 * 60 * 60 * 1000; // 4 hours
      
      if (estimatedRunMs >= minDuration && estimatedRunMs <= maxDuration) {
        const confidence = this.calculateConfidence(result.score, result.indicatorCount, features);
        
        // Check if we should create this prediction
        if (await this.shouldCreatePrediction(symbol, confidence)) {
          return await this.createPrediction(symbol, direction, result, estimatedRunMs, cardCount, features);
        }
      }
    }
    
    return false;
  }

  private async shouldCreatePrediction(symbol: string, confidence: number): Promise<boolean> {
    // Normalize the symbol for comparison (remove slashes and convert to uppercase)
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    
    // Don't create duplicate predictions for the same symbol (check both formats)
    const existingPrediction = Array.from(this.activePredictions.values())
      .find(p => {
        const existingNormalized = p.symbol.replace('/', '').toUpperCase();
        return existingNormalized === normalizedSymbol || 
               p.symbol === symbol ||
               p.symbol === normalizedSymbol;
      });
    
    if (existingPrediction) {
      console.log(`?? Skipping ${symbol} - duplicate prediction already exists (${existingPrediction.symbol})`);
      return false;
    }

    // Dynamic confidence threshold based on market conditions
    const marketVolatility = await this.calculateMarketVolatility();
    const dynamicMinConfidence = marketVolatility > 0.5 ? 50 : 40; // Higher threshold in volatile markets
    
    if (confidence < dynamicMinConfidence) {
      return false;
    }

    // If we have slots available, create the prediction
    if (this.activePredictions.size < this.maxActivePredictions) {
      return true;
    }

    // If slots are full, use more aggressive replacement strategy
    const predictions = Array.from(this.activePredictions.values());
    predictions.sort((a, b) => a.confidence - b.confidence);
    const lowestConfidence = predictions[0].confidence;
    
    // More aggressive replacement - require only 5% improvement instead of 10%
    return confidence > lowestConfidence + 5;
  }

  private async createPrediction(
    symbol: string, 
    direction: 'long' | 'short', 
    scoreResult: any, 
    estimatedRunMs: number,
    cardCount: number,
    features: IndicatorFeature[]
  ) {
    // Enhanced market analysis
    const marketState = await this.analyzeMarketState(symbol);
    const orderBookData = await this.analyzeOrderBook(symbol);
    
    // Get OHLCV data for comprehensive analysis
    let targetZones = null;
    let volumeAnalysis = null;
    
    try {
      const recentData = this.wsManager.getKlineData(symbol, '1h', 100);
      if (recentData.length >= 50) {
        targetZones = this.calculateTargetZones(recentData, direction);
        volumeAnalysis = this.analyzeVolume(recentData);
      }
    } catch (error) {
      console.log(`?? Could not calculate enhanced analysis for ${symbol}:`, error);
    }

    // Enhanced risk-reward analysis with market context
    const riskRewardRatio = this.calculateRiskReward(features, direction);
    const confidence = this.calculateConfidence(scoreResult.score, scoreResult.indicatorCount, features);
    
    // Calculate profitability score for beginners
    const profitabilityScore = this.calculateProfitabilityScore(
      confidence,
      marketState,
      orderBookData,
      volumeAnalysis || undefined, // This should now work
      riskRewardRatio
    );

    // Enhanced filtering with market context
    if (targetZones && targetZones.entryZone.distanceFromEntry > 5) {
      console.log(`?? Skipping ${symbol} - entry zone too far away (${targetZones.entryZone.distanceFromEntry.toFixed(1)}%)`);
      return false;
    }
    
    // More lenient R/R requirements for high-probability setups
    const minRiskReward = profitabilityScore > 80 ? 1.5 : 2.0;
    if (riskRewardRatio < minRiskReward) {
      console.log(`?? Skipping ${symbol} - poor risk/reward ratio: ${riskRewardRatio.toFixed(2)} (min: ${minRiskReward})`);
      return false;
    }

    // Market state validation
    if (marketState.confidence < 30) {
      console.log(`?? Skipping ${symbol} - uncertain market state (confidence: ${marketState.confidence}%)`);
      return false;
    }

    // Double-check for duplicates before creating
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const existingPrediction = Array.from(this.activePredictions.values())
      .find(p => p.symbol.replace('/', '').toUpperCase() === normalizedSymbol);
    
    if (existingPrediction) {
      console.log(`?? Preventing duplicate creation for ${symbol} - already exists: ${existingPrediction.symbol}`);
      return false;
    }

    // Remove lowest confidence prediction if at capacity
    if (this.activePredictions.size >= this.maxActivePredictions) {
      const predictions = Array.from(this.activePredictions.values());
      predictions.sort((a, b) => (a.profitabilityScore || a.confidence) - (b.profitabilityScore || b.confidence));
      const lowest = predictions[0];
      
      // Only replace if new prediction is significantly better
      if (profitabilityScore <= (lowest.profitabilityScore || lowest.confidence) + 10) {
        console.log(`?? Skipping ${symbol} - not significantly better than existing predictions`);
        return false;
      }
      
      this.activePredictions.delete(lowest.id);
      console.log(`?? Replaced prediction ${lowest.id} (${lowest.profitabilityScore || lowest.confidence}%) with higher profitability signal`);
    }

    const now = new Date();
    const timestamp = now.getTime();
    const randomSuffix = Math.random().toString(36).substring(2, 5);
    
    const prediction: Prediction = {
      id: `${normalizedSymbol}-${timestamp}-${randomSuffix}`,
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
      riskRewardRatio,
      marketState,
      orderBookData,
      volumeAnalysis: volumeAnalysis || undefined, // Fix: Ensure this is undefined if null
      profitabilityScore,
      targetZones
    };

    this.activePredictions.set(prediction.id, prediction);
    
    // Update card count using normalized symbol
    const newCardCount = cardCount + (direction === 'long' ? 1 : -1);
    this.cardCounts.set(normalizedSymbol, newCardCount);
    
    // Save to database
    await this.predictionManager.savePrediction(prediction);
    await this.predictionManager.updateSymbolCardCount(normalizedSymbol, direction);
    
    const durationMins = Math.round(estimatedRunMs / (1000 * 60));
    const entryInfo = targetZones ? 
      ` Entry: $${targetZones.entryZone.min.toFixed(4)}-$${targetZones.entryZone.max.toFixed(4)}` : '';
    
    console.log(`?? Created ${direction.toUpperCase()} prediction for ${symbol} (${confidence}% confidence, ${profitabilityScore}% profit score, ${marketState.trend} market, ${durationMins}min${entryInfo})`);
    
    return true;
  }

  // Enhanced support/resistance calculation with entry zones
  private calculateTargetZones(ohlcvData: OHLCV[], direction: 'long' | 'short'): any {
    if (ohlcvData.length < 50) return null;
    
    const closes = ohlcvData.map(d => d.close);
    const highs = ohlcvData.map(d => d.high);
    const lows = ohlcvData.map(d => d.low);
    const currentPrice = closes[closes.length - 1];
    
    // Find pivot points for support/resistance
    const supportLevels = this.findSupportLevels(lows, closes);
    const resistanceLevels = this.findResistanceLevels(highs, closes);
    
    // Calculate optimal entry zone based on direction
    let entryZone;
    let stopLoss;
    let takeProfit: number[] = [];
    
    if (direction === 'long') {
      // For longs: entry near support, target resistance
      const nearestSupport = supportLevels
        .filter(level => level < currentPrice)
        .sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b))[0];
      
      const targetResistance = resistanceLevels
        .filter(level => level > currentPrice)
        .sort((a, b) => a - b);
      
      entryZone = {
        min: nearestSupport || currentPrice * 0.98, // 2% below if no support found
        max: currentPrice * 1.005, // Small buffer above current
        current: currentPrice,
        distanceFromEntry: nearestSupport ? 
          ((currentPrice - nearestSupport) / nearestSupport * 100) : 2
      };
      
      stopLoss = nearestSupport ? nearestSupport * 0.995 : currentPrice * 0.95; // 0.5% below support or 5% below current
      takeProfit = targetResistance.slice(0, 3); // Up to 3 resistance levels
      
      // If no resistance levels found, create targets based on Fibonacci levels
      if (takeProfit.length === 0) {
        takeProfit = [
          currentPrice * 1.02, // 2%
          currentPrice * 1.05, // 5%
          currentPrice * 1.08  // 8%
        ];
      }
      
    } else {
      // For shorts: entry near resistance, target support
      const nearestResistance = resistanceLevels
        .filter(level => level > currentPrice)
        .sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b))[0];
      
      const targetSupport = supportLevels
        .filter(level => level < currentPrice)
        .sort((a, b) => b - a);
      
      entryZone = {
        min: currentPrice * 0.995, // Small buffer below current
        max: nearestResistance || currentPrice * 1.02, // 2% above if no resistance found
        current: currentPrice,
        distanceFromEntry: nearestResistance ? 
          ((nearestResistance - currentPrice) / currentPrice * 100) : 2
      };
      
      stopLoss = nearestResistance ? nearestResistance * 1.005 : currentPrice * 1.05; // 0.5% above resistance or 5% above current
      takeProfit = targetSupport.slice(0, 3); // Up to 3 support levels
      
      // If no support levels found, create targets based on Fibonacci levels
      if (takeProfit.length === 0) {
        takeProfit = [
          currentPrice * 0.98, // -2%
          currentPrice * 0.95, // -5%
          currentPrice * 0.92  // -8%
        ];
      }
    }
    
    return {
      entryZone,
      stopLoss,
      takeProfit,
      supportLevels: supportLevels.slice(0, 5), // Top 5 support levels
      resistanceLevels: resistanceLevels.slice(0, 5) // Top 5 resistance levels
    };
  }

  private findSupportLevels(lows: number[], closes: number[]): number[] {
    const levels: number[] = [];
    const lookback = 10;
    
    // Find swing lows
    for (let i = lookback; i < lows.length - lookback; i++) {
      const currentLow = lows[i];
      let isSwingLow = true;
      
      // Check if it's a local minimum
      for (let j = i - lookback; j <= i + lookback; j++) {
        if (j !== i && lows[j] <= currentLow) {
          isSwingLow = false;
          break;
        }
      }
      
      if (isSwingLow) {
        levels.push(currentLow);
      }
    }
    
    // Add recent significant levels (psychological levels)
    const currentPrice = closes[closes.length - 1];
    const roundNumbers = this.findPsychologicalLevels(currentPrice);
    levels.push(...roundNumbers.filter(level => level < currentPrice));
    
    // Remove duplicates and sort
    return [...new Set(levels)]
      .sort((a, b) => b - a) // Descending order
      .filter(level => level > currentPrice * 0.8); // Only levels within 20% below
  }

  private findResistanceLevels(highs: number[], closes: number[]): number[] {
    const levels: number[] = [];
    const lookback = 10;
    
    // Find swing highs
    for (let i = lookback; i < highs.length - lookback; i++) {
      const currentHigh = highs[i];
      let isSwingHigh = true;
      
      // Check if it's a local maximum
      for (let j = i - lookback; j <= i + lookback; j++) {
        if (j !== i && highs[j] >= currentHigh) {
          isSwingHigh = false;
          break;
        }
      }
      
      if (isSwingHigh) {
        levels.push(currentHigh);
      }
    }
    
    // Add recent significant levels (psychological levels)
    const currentPrice = closes[closes.length - 1];
    const roundNumbers = this.findPsychologicalLevels(currentPrice);
    levels.push(...roundNumbers.filter(level => level > currentPrice));
    
    // Remove duplicates and sort
    return [...new Set(levels)]
      .sort((a, b) => a - b) // Ascending order
      .filter(level => level < currentPrice * 1.2); // Only levels within 20% above
  }

  private findPsychologicalLevels(currentPrice: number): number[] {
    const levels: number[] = [];
    const magnitude = Math.pow(10, Math.floor(Math.log10(currentPrice)));
    
    // Round numbers based on price magnitude
    if (currentPrice < 1) {
      // For prices < $1, use 0.1, 0.25, 0.5, 0.75, 1.0
      const baseNumbers = [0.1, 0.25, 0.5, 0.75, 1.0];
      baseNumbers.forEach(base => {
        levels.push(base);
        levels.push(base * 10);
      });
    } else if (currentPrice < 100) {
      // For prices $1-$100, use whole numbers and half numbers
      for (let i = 1; i <= 200; i += (i < 10 ? 1 : i < 50 ? 5 : 10)) {
        levels.push(i);
      }
    } else {
      // For prices > $100, use round hundreds/thousands
      const step = magnitude / 10;
      for (let i = step; i <= currentPrice * 2; i += step) {
        levels.push(i);
      }
    }
    
    return levels.filter(level => 
      level >= currentPrice * 0.5 && level <= currentPrice * 2
    );
  }

  // Enhanced confidence calculation with volatility adjustment
  private calculateConfidence(score: number, indicatorCount: number, features: IndicatorFeature[]): number {
    // Base confidence on score magnitude (more conservative)
    const baseConfidence = Math.min(Math.abs(score) * 6, 50);
    
    // Bonus for indicator count
    const indicatorBonus = Math.min(indicatorCount * 1.2, 12);
    
    // Bonus for indicator strength
    const avgStrength = features.reduce((sum, f) => sum + (f.strength || 0), 0) / features.length;
    const strengthBonus = avgStrength * 8;
    
    // Bonus for timeframe agreement
    const timeframeAgreement = this.getTimeframeAgreementScore(features);
    const agreementBonus = timeframeAgreement * 15;
    
    // Bonus for higher timeframe signals
    const htfBonus = this.getHigherTimeframeBonus(features);
    
    // Volume confirmation bonus
    const volumeBonus = this.getVolumeConfirmationBonus(features);
    
    // Market momentum bonus
    const momentumBonus = this.getMarketMomentumBonus(features);
    
    // Historical success bonus (placeholder - could use actual ML model predictions)
    const historyBonus = 3;
    
    // SPECIAL: Extra bonus for LONG signals in bear markets (counter-trend trading)
    let contrarianBonus = 0;
    const longFeatures = features.filter(f => f.direction === 'long').length;
    const shortFeatures = features.filter(f => f.direction === 'short').length;
    
    if (score > 0 && shortFeatures > longFeatures) {
      // Long signal in predominantly bearish environment - add bonus for courage!
      contrarianBonus = 8;
      console.log(`?? Adding contrarian bonus for LONG signal: +${contrarianBonus}%`);
    }
    
    const totalConfidence = baseConfidence + indicatorBonus + strengthBonus + 
                           agreementBonus + htfBonus + volumeBonus + momentumBonus + 
                           historyBonus + contrarianBonus;
    
    return Math.min(Math.max(totalConfidence, 5), 95); // Increased max to 95%
  }

  private getVolumeConfirmationBonus(features: IndicatorFeature[]): number {
    const volumeFeatures = features.filter(f => f.name === 'VOLUME');
    if (volumeFeatures.length > 0) {
      const avgVolumeStrength = volumeFeatures.reduce((sum, f) => sum + (f.strength || 0), 0) / volumeFeatures.length;
      return avgVolumeStrength * 5; // Up to 5% bonus for volume confirmation
    }
    return 0;
  }

  private getMarketMomentumBonus(features: IndicatorFeature[]): number {
    // Count strong momentum indicators (RSI extremes, MACD crosses)
    const momentumIndicators = features.filter(f => 
      (f.name === 'RSI' && (f.strength || 0) > 0.7) ||
      (f.name === 'MACD' && (f.strength || 0) > 0.6)
    );
    
    return Math.min(momentumIndicators.length * 2, 8); // Up to 8% bonus
  }

  private getHigherTimeframeBonus(features: IndicatorFeature[]): number {
    const higherTimeframes = ['1h', '2h', '4h'];
    const htfFeatures = features.filter(f => higherTimeframes.includes(f.timeframe) && f.direction);
    
    // More bonus for agreement on higher timeframes
    if (htfFeatures.length >= 3) return 8;
    if (htfFeatures.length >= 2) return 5;
    if (htfFeatures.length >= 1) return 2;
    return 0;
  }

  private getTimeframeAgreementScore(features: IndicatorFeature[]): number {
    const directionCounts: Record<string, Record<string, number>> = {}; // timeframe -> direction -> count
    
    features.forEach(f => {
      if (!f.direction) return;
      
      if (!directionCounts[f.timeframe]) {
        directionCounts[f.timeframe] = { long: 0, short: 0 };
      }
      
      directionCounts[f.timeframe][f.direction]++;
    });
    
    // Calculate agreement score (higher timeframes weighted more)
    const timeframeWeights: Record<string, number> = {
      '1m': 0.3, '3m': 0.5, '5m': 0.7, '15m': 1.0,
      '30m': 1.3, '1h': 1.7, '2h': 2.2, '4h': 3.0
    };
    
    let totalAgreement = 0;
    let maxPossible = 0;
    
    Object.entries(directionCounts).forEach(([tf, counts]) => {
      const weight = timeframeWeights[tf] || 1.0;
      const maxCount = Math.max(counts.long, counts.short);
      const totalCount = counts.long + counts.short;
      
      if (totalCount > 0) {
        const agreement = maxCount / totalCount;
        totalAgreement += agreement * weight * totalCount; // Also weight by number of indicators
        maxPossible += weight * totalCount;
      }
    });
    
    return maxPossible > 0 ? totalAgreement / maxPossible : 0;
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

  private cleanupExpiredPredictions() {
    const now = new Date();
    const expiredIds: string[] = [];
    
    for (const [id, prediction] of this.activePredictions.entries()) {
      if (new Date(prediction.expiresAt) <= now) {
        expiredIds.push(id);
      }
    }
    
    // Process expired predictions
    if (expiredIds.length > 0) {
      console.log(`? Processing ${expiredIds.length} expired predictions`);
      
      expiredIds.forEach(async (id) => {
        const prediction = this.activePredictions.get(id);
        if (prediction) {
          this.activePredictions.delete(id);
          
          // Calculate final outcome
          await this.calculatePredictionOutcome(prediction);
          
          console.log(`? Prediction ${id} expired`);
        }
      });
    }
  }

  private async calculatePredictionOutcome(prediction: Prediction) {
    try {
      // Get current price (in production, you'd get the exact price at expiration)
      const currentPrice = await this.exchangeClient.getCurrentPrice(prediction.symbol);
      
      if (currentPrice !== null) {
        // Get entry price (price when prediction was created)
        const entryData = this.wsManager.getKlineData(prediction.symbol, '1m', 1);
        const entryPrice = entryData.length > 0 ? entryData[0].close : currentPrice;
        
        // Calculate PnL based on direction
        let pnlPercent = 0;
        if (prediction.direction === 'long') {
          pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
        
        // Save outcome
        await this.predictionManager.savePredictionOutcome({
          predictionId: prediction.id,
          pnlPercent,
          closedAt: new Date().toISOString(),
          actualDuration: Date.now() - new Date(prediction.createdAt).getTime()
        });
        
        const outcome = pnlPercent > 0 ? '?' : '?';
        console.log(`${outcome} Prediction ${prediction.symbol} ${prediction.direction}: ${pnlPercent.toFixed(2)}%`);
      }
    } catch (error) {
      console.error(`? Error calculating outcome for prediction ${prediction.id}:`, error);
    }
  }

  private async getTopFuturesSymbols(): Promise<string[]> {
    try {
      return await this.exchangeClient.getTopFuturesSymbols(50);
    } catch (error) {
      console.error('? Error fetching top futures symbols:', error);
      
      // Fallback to hardcoded list
      return [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
        'SOL/USDT', 'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT',
        'LINK/USDT', 'UNI/USDT', 'LTC/USDT', 'BCH/USDT', 'ATOM/USDT',
        'FIL/USDT', 'TRX/USDT', 'ETC/USDT', 'XLM/USDT', 'VET/USDT'
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
    } else {
      console.log('? Scan already in progress, cannot force rescan');
    }
  }

  // Force cleanup duplicates - can be called externally
  forceCleanupDuplicates(): number {
    const beforeCount = this.activePredictions.size;
    this.cleanupDuplicatePredictions();
    const afterCount = this.activePredictions.size;
    const removedCount = beforeCount - afterCount;
    
    if (removedCount > 0) {
      // Emit update after cleanup
      this.emit('predictions-update', Array.from(this.activePredictions.values()));
    }
    
    return removedCount;
  }

  // Health check method
  isHealthy(): boolean {
    const now = Date.now();
    const lastScanTime = this.lastSuccessfulScan ? new Date(this.lastSuccessfulScan).getTime() : 0;
    const timeSinceLastScan = now - lastScanTime;
    
    return (
      this.status.isRunning &&
      timeSinceLastScan < 120000 && // Less than 2 minutes since last scan
      this.errorCount < 10 // Less than 10 errors total
    );
  }

  // Get performance metrics
  getMetrics() {
    return {
      uptime: Date.now() - this.startTime,
      errorCount: this.errorCount,
      successfulScans: this.status.lastScan ? 1 : 0,
      activePredictions: this.activePredictions.size,
      cardCountsLoaded: this.cardCounts.size,
      isHealthy: this.isHealthy()
    };
  }

  // Add trend strength analysis to improve signal quality
  private calculateTrendStrength(ohlcvData: OHLCV[]): number {
    if (ohlcvData.length < 20) return 0;
    
    const recent = ohlcvData.slice(-20);
    const closes = recent.map(d => d.close);
    
    // Calculate trend using linear regression
    const n = closes.length;
    const x = Array.from({length: n}, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = closes.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * closes[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = this.calculateCorrelation(x, closes);
    
    // Strong trend if correlation > 0.7 and significant slope
    return Math.abs(correlation) > 0.7 ? Math.abs(slope) * 100 : 0;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Add method to clean up duplicate predictions
  private cleanupDuplicatePredictions() {
    const symbolMap = new Map<string, Prediction[]>();
    
    // Group predictions by normalized symbol
    for (const prediction of this.activePredictions.values()) {
      const normalizedSymbol = prediction.symbol.replace('/', '').toUpperCase();
      if (!symbolMap.has(normalizedSymbol)) {
        symbolMap.set(normalizedSymbol, []);
      }
      symbolMap.get(normalizedSymbol)!.push(prediction);
    }
    
    // Remove duplicates, keeping only the highest confidence one
    let removedCount = 0;
    for (const [symbol, predictions] of symbolMap.entries()) {
      if (predictions.length > 1) {
        // Sort by confidence descending
        predictions.sort((a, b) => b.confidence - a.confidence);
        
        // Keep the highest confidence, remove the rest
        for (let i = 1; i < predictions.length; i++) {
          this.activePredictions.delete(predictions[i].id);
          removedCount++;
          console.log(`?? Removed duplicate prediction ${predictions[i].id} for ${symbol} (kept higher confidence: ${predictions[0].confidence}%)`);
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`? Cleaned up ${removedCount} duplicate predictions`);
    }
  }

  private calculateRiskReward(features: IndicatorFeature[], direction: 'long' | 'short'): number {
    // Calculate based on support/resistance levels and volatility
    const supportResistance = this.calculateSupportResistance(features);
    const volatility = features.reduce((sum, f) => sum + (f.strength || 0), 0) / features.length;
    
    // Higher volatility = higher potential reward but also higher risk
    const baseRR = 2.0 + (volatility * 2); // Base 2:1, up to 4:1 with high volatility
    
    // Adjust based on timeframe agreement (more agreement = better R/R)
    const agreementScore = this.getTimeframeAgreementScore(features);
    const agreementMultiplier = 1 + (agreementScore * 0.5);
    
    return Math.min(baseRR * agreementMultiplier, 5.0); // Cap at 5:1
  }

  private calculateSupportResistance(features: IndicatorFeature[]): number {
    // Simple support/resistance based on Bollinger Bands and EMA positions
    const bbFeatures = features.filter(f => f.name === 'BB');
    const emaFeatures = features.filter(f => f.name.startsWith('EMA'));
    
    let srScore = 1.0;
    
    // Strong support/resistance if price is at BB levels
    if (bbFeatures.length > 0) {
      const avgBBStrength = bbFeatures.reduce((sum, f) => sum + (f.strength || 0), 0) / bbFeatures.length;
      srScore += avgBBStrength;
    }
    
    // EMA confluence adds to support/resistance
    if (emaFeatures.length >= 2) {
      srScore += 0.5; // Multiple EMA confluence
    }
    
    return Math.min(srScore, 2.0);
  }

  private async calculateMarketVolatility(): Promise<number> {
    try {
      // Get BTC data as market volatility indicator
      const btcData = this.wsManager.getKlineData('BTC/USDT', '1h', 24);
      if (btcData.length < 24) return 0.3; // Default moderate volatility
      
      // Calculate 24h price changes
      const priceChanges = btcData.slice(1).map((candle, i) => 
        Math.abs((candle.close - btcData[i].close) / btcData[i].close)
      );
      
      // Average volatility over 24h
      const avgVolatility = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
      
      return avgVolatility;
    } catch (error) {
      console.error('Error calculating market volatility:', error);
      return 0.3; // Default
    }
  }

  // Advanced market state detection
  private async analyzeMarketState(symbol: string): Promise<MarketState> {
    try {
      const ohlcvData = this.wsManager.getKlineData(symbol, '1h', 50);
      if (ohlcvData.length < 20) {
        return { trend: 'neutral', strength: 0.5, volatility: 'medium', momentum: 'steady', confidence: 50 };
      }

      const closes = ohlcvData.map(d => d.close);
      const highs = ohlcvData.map(d => d.high);
      const lows = ohlcvData.map(d => d.low);
      const volumes = ohlcvData.map(d => d.volume);

      // Trend analysis using multiple EMAs
      const ema20 = this.calculateEMA(closes, 20);
      const ema50 = this.calculateEMA(closes, 50);
      const currentPrice = closes[closes.length - 1];
      const ema20Current = ema20[ema20.length - 1];
      const ema50Current = ema50[ema50.length - 1];

      // Determine trend
      let trend: 'bull' | 'bear' | 'neutral' = 'neutral';
      let strength = 0.5;

      if (currentPrice > ema20Current && ema20Current > ema50Current) {
        trend = 'bull';
        strength = Math.min((currentPrice - ema50Current) / ema50Current * 10, 1);
      } else if (currentPrice < ema20Current && ema20Current < ema50Current) {
        trend = 'bear';
        strength = Math.min((ema50Current - currentPrice) / ema50Current * 10, 1);
      }

      // Volatility analysis
      const atr = this.calculateATR(ohlcvData.slice(-14));
      const avgPrice = closes.reduce((sum, price) => sum + price, 0) / closes.length;
      const volatilityRatio = atr / avgPrice;
      
      let volatility: 'low' | 'medium' | 'high' = 'medium';
      if (volatilityRatio < 0.02) volatility = 'low';
      else if (volatilityRatio > 0.05) volatility = 'high';

      // Momentum analysis
      const recentPrices = closes.slice(-5);
      const olderPrices = closes.slice(-10, -5);
      const recentAvg = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
      const olderAvg = olderPrices.reduce((sum, p) => sum + p, 0) / olderPrices.length;
      
      let momentum: 'accelerating' | 'steady' | 'decelerating' = 'steady';
      const momentumChange = (recentAvg - olderAvg) / olderAvg;
      
      if (trend === 'bull' && momentumChange > 0.01) momentum = 'accelerating';
      else if (trend === 'bear' && momentumChange < -0.01) momentum = 'accelerating';
      else if (Math.abs(momentumChange) < 0.005) momentum = 'steady';
      else momentum = 'decelerating';

      // Confidence based on multiple factors
      const confidence = Math.min(strength * 100 + (momentum === 'accelerating' ? 20 : 0), 95);

      return { trend, strength, volatility, momentum, confidence };

    } catch (error) {
      console.error(`Error analyzing market state for ${symbol}:`, error);
      return { trend: 'neutral', strength: 0.5, volatility: 'medium', momentum: 'steady', confidence: 50 };
    }
  }

  // Order book analysis (simulated for now - would need real order book data)
  private async analyzeOrderBook(symbol: string): Promise<OrderBookData> {
    try {
      // In a real implementation, you would fetch actual order book data
      // For now, we'll simulate based on volume and price action
      const ohlcvData = this.wsManager.getKlineData(symbol, '1m', 10);
      if (ohlcvData.length < 5) {
        return { bidDepth: 50, askDepth: 50, spread: 0.001, imbalance: 0, liquidityScore: 0.5 };
      }

      const volumes = ohlcvData.map(d => d.volume);
      const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
      const currentVolume = volumes[volumes.length - 1];
      
      // Simulate order book imbalance based on price movement and volume
      const priceChanges = ohlcvData.slice(1).map((candle, i) => 
        (candle.close - ohlcvData[i].close) / ohlcvData[i].close
      );
      const avgPriceChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
      
      // More volume + positive price change = more buying pressure
      const imbalance = (currentVolume / avgVolume - 1) * Math.sign(avgPriceChange) * 100;
      
      const liquidityScore = Math.min(currentVolume / avgVolume / 2, 1);
      const spread = Math.abs(avgPriceChange) * 100; // Simulated spread
      
      return {
        bidDepth: 50 + imbalance,
        askDepth: 50 - imbalance,
        spread,
        imbalance,
        liquidityScore
      };

    } catch (error) {
      console.error(`Error analyzing order book for ${symbol}:`, error);
      return { bidDepth: 50, askDepth: 50, spread: 0.001, imbalance: 0, liquidityScore: 0.5 };
    }
  }

  // Advanced volume analysis
  private analyzeVolume(ohlcvData: OHLCV[]): VolumeAnalysis {
    if (ohlcvData.length < 20) {
      return {
        currentVolume: 0,
        averageVolume: 0,
        volumeRatio: 1,
        volumeTrend: 'stable',
        buyVsSellVolume: 0,
        volumeProfile: 'neutral'
      };
    }

    const volumes = ohlcvData.map(d => d.volume);
    const currentVolume = volumes[volumes.length - 1];
    const averageVolume = volumes.slice(0, -1).reduce((sum, v) => sum + v, 0) / (volumes.length - 1);
    const volumeRatio = currentVolume / averageVolume;

    // Volume trend analysis
    const recentVolumes = volumes.slice(-5);
    const olderVolumes = volumes.slice(-10, -5);
    const recentAvgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
    const olderAvgVolume = olderVolumes.reduce((sum, v) => sum + v, 0) / olderVolumes.length;
    
    let volumeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentAvgVolume > olderAvgVolume * 1.2) volumeTrend = 'increasing';
    else if (recentAvgVolume < olderAvgVolume * 0.8) volumeTrend = 'decreasing';

    // Buy vs Sell pressure analysis (simplified)
    const priceChanges = ohlcvData.slice(1).map((candle, i) => 
      (candle.close - ohlcvData[i].close) / ohlcvData[i].close
    );
    const volumeWeightedPressure = priceChanges.reduce((sum, change, i) => 
      sum + change * volumes[i + 1], 0
    ) / volumes.slice(1).reduce((sum, v) => sum + v, 0);

    // Volume profile analysis
    let volumeProfile: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
    if (volumeTrend === 'increasing' && volumeWeightedPressure > 0) volumeProfile = 'accumulation';
    else if (volumeTrend === 'increasing' && volumeWeightedPressure < 0) volumeProfile = 'distribution';

    return {
      currentVolume,
      averageVolume,
      volumeRatio,
      volumeTrend,
      buyVsSellVolume: volumeWeightedPressure * 100,
      volumeProfile
    };
  }

  // Calculate profitability score for beginners
  private calculateProfitabilityScore(
    confidence: number,
    marketState: MarketState,
    orderBookData: OrderBookData,
    volumeAnalysis: VolumeAnalysis | undefined, // Fix: Make this parameter optional
    riskRewardRatio: number
  ): number {
    let score = confidence * 0.3; // Base confidence weight

    // Market state bonus
    if (marketState.trend !== 'neutral') {
      score += marketState.strength * 30; // Strong trend bonus
      if (marketState.momentum === 'accelerating') score += 15;
    }

    // Order book bonus
    if (Math.abs(orderBookData.imbalance) > 20) score += 10; // Strong order flow
    score += orderBookData.liquidityScore * 10; // Liquidity bonus

    // Volume bonus - handle undefined case
    if (volumeAnalysis) {
      if (volumeAnalysis.volumeRatio > 1.5) score += 15; // High volume
      if (volumeAnalysis.volumeProfile === 'accumulation') score += 10;
    }

    // Risk/reward bonus
    score += Math.min(riskRewardRatio * 5, 20); // Up to 20 points for good R/R

    // Volatility adjustment (lower for beginners)
    if (marketState.volatility === 'high') score -= 10;
    else if (marketState.volatility === 'low') score += 5;

    return Math.min(Math.max(score, 0), 100);
  }

  // Helper methods
  private calculateEMA(prices: number[], period: number): number[] {
    const ema = [];
    const multiplier = 2 / (period + 1);
    ema[0] = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }

    return ema;
  }

  private calculateATR(ohlcvData: OHLCV[]): number {
    if (ohlcvData.length < 2) return 0;

    const trValues = [];
    for (let i = 1; i < ohlcvData.length; i++) {
      const high = ohlcvData[i].high;
      const low = ohlcvData[i].low;
      const prevClose = ohlcvData[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trValues.push(tr);
    }

    return trValues.reduce((sum, tr) => sum + tr, 0) / trValues.length;
  }
}