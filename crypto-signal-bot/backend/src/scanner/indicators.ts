// file: backend/src/scanner/indicators.ts
// Role: Calculate technical indicators for multiple timeframes
// Requirements: Support all major indicators (RSI, MACD, EMA, SMA, Bollinger Bands, etc.)

import { RSI, MACD, EMA, SMA, BollingerBands, Stochastic, ADX } from 'technicalindicators';
import { IndicatorFeature } from './score';

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorWeights {
  RSI: number;
  MACD: number;
  EMA: number;
  SMA: number;
  BB: number; // Bollinger Bands
  STOCH: number; // Stochastic
  ADX: number;
  VOLUME: number;
}

export const DEFAULT_WEIGHTS: IndicatorWeights = {
  RSI: 1.0,
  MACD: 1.2,
  EMA: 0.8,
  SMA: 0.6,
  BB: 1.0,
  STOCH: 0.9,
  ADX: 1.1,
  VOLUME: 0.7
};

export class IndicatorCalculator {
  private weights: IndicatorWeights;

  constructor(weights: IndicatorWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  // Calculate all major indicators for given OHLCV data and timeframe
  // Return array of IndicatorFeature with direction signals
  calculateIndicators(data: OHLCV[], timeframe: string): IndicatorFeature[] {
    if (data.length < 50) return []; // Need sufficient data

    const features: IndicatorFeature[] = [];
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    try {
      // RSI Analysis
      const rsi = RSI.calculate({ values: closes, period: 14 });
      if (rsi.length > 0) {
        const currentRsi = rsi[rsi.length - 1];
        features.push({
          name: 'RSI',
          timeframe,
          direction: this.getRsiDirection(currentRsi),
          weight: this.weights.RSI,
          strength: this.getRsiStrength(currentRsi)
        });
      }

      // MACD Analysis
      const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      if (macd.length > 1) {
        const current = macd[macd.length - 1];
        const previous = macd[macd.length - 2];
        features.push({
          name: 'MACD',
          timeframe,
          direction: this.getMacdDirection(current, previous),
          weight: this.weights.MACD,
          strength: this.getMacdStrength(current)
        });
      }

      // EMA Analysis (multiple periods)
      const ema20 = EMA.calculate({ values: closes, period: 20 });
      const ema50 = EMA.calculate({ values: closes, period: 50 });
      if (ema20.length > 0 && ema50.length > 0) {
        const currentPrice = closes[closes.length - 1];
        const currentEma20 = ema20[ema20.length - 1];
        const currentEma50 = ema50[ema50.length - 1];
        
        features.push({
          name: 'EMA_20',
          timeframe,
          direction: currentPrice > currentEma20 ? 'long' : 'short',
          weight: this.weights.EMA,
          strength: Math.abs(currentPrice - currentEma20) / currentPrice
        });

        features.push({
          name: 'EMA_50',
          timeframe,
          direction: currentPrice > currentEma50 ? 'long' : 'short',
          weight: this.weights.EMA * 0.8,
          strength: Math.abs(currentPrice - currentEma50) / currentPrice
        });

        // EMA Crossover
        features.push({
          name: 'EMA_CROSS',
          timeframe,
          direction: currentEma20 > currentEma50 ? 'long' : 'short',
          weight: this.weights.EMA * 1.5,
          strength: Math.abs(currentEma20 - currentEma50) / currentEma50
        });
      }

      // Bollinger Bands
      const bb = BollingerBands.calculate({
        values: closes,
        period: 20,
        stdDev: 2
      });
      if (bb.length > 0) {
        const current = bb[bb.length - 1];
        const currentPrice = closes[closes.length - 1];
        features.push({
          name: 'BB',
          timeframe,
          direction: this.getBollingerDirection(currentPrice, current),
          weight: this.weights.BB,
          strength: this.getBollingerStrength(currentPrice, current)
        });
      }

      // Stochastic
      const stoch = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
      });
      if (stoch.length > 0) {
        const current = stoch[stoch.length - 1];
        features.push({
          name: 'STOCH',
          timeframe,
          direction: this.getStochasticDirection(current),
          weight: this.weights.STOCH,
          strength: this.getStochasticStrength(current)
        });
      }

      // Volume Analysis
      if (volumes.length >= 20) {
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;
        
        if (volumeRatio > 1.5) { // Volume spike
          features.push({
            name: 'VOLUME',
            timeframe,
            direction: closes[closes.length - 1] > closes[closes.length - 2] ? 'long' : 'short',
            weight: this.weights.VOLUME,
            strength: Math.min(volumeRatio - 1, 2) / 2 // Cap at 3x volume
          });
        }
      }

    } catch (error) {
      console.error(`Error calculating indicators for ${timeframe}:`, error);
    }

    return features;
  }

  private getRsiDirection(rsi: number): 'long' | 'short' | null {
    if (rsi < 30) return 'long'; // Oversold
    if (rsi > 70) return 'short'; // Overbought
    return null; // Neutral
  }

  private getRsiStrength(rsi: number): number {
    if (rsi < 30) return (30 - rsi) / 30;
    if (rsi > 70) return (rsi - 70) / 30;
    return 0;
  }

  private getMacdDirection(current: any, previous: any): 'long' | 'short' | null {
    // MACD crossover and histogram analysis
    const macdCross = current.MACD > current.signal && previous.MACD <= previous.signal;
    const macdCrossDown = current.MACD < current.signal && previous.MACD >= previous.signal;
    
    if (macdCross) return 'long';
    if (macdCrossDown) return 'short';
    
    // Histogram momentum
    if (current.histogram > 0 && current.histogram > previous.histogram) return 'long';
    if (current.histogram < 0 && current.histogram < previous.histogram) return 'short';
    
    return null;
  }

  private getMacdStrength(current: any): number {
    return Math.min(Math.abs(current.histogram) / Math.abs(current.MACD), 1);
  }

  private getBollingerDirection(price: number, bb: any): 'long' | 'short' | null {
    if (price <= bb.lower) return 'long'; // Price at lower band
    if (price >= bb.upper) return 'short'; // Price at upper band
    return null;
  }

  private getBollingerStrength(price: number, bb: any): number {
    const bandWidth = bb.upper - bb.lower;
    if (price <= bb.lower) return (bb.lower - price) / bandWidth;
    if (price >= bb.upper) return (price - bb.upper) / bandWidth;
    return 0;
  }

  private getStochasticDirection(stoch: any): 'long' | 'short' | null {
    if (stoch.k < 20 && stoch.k > stoch.d) return 'long'; // Oversold with momentum
    if (stoch.k > 80 && stoch.k < stoch.d) return 'short'; // Overbought with momentum
    return null;
  }

  private getStochasticStrength(stoch: any): number {
    if (stoch.k < 20) return (20 - stoch.k) / 20;
    if (stoch.k > 80) return (stoch.k - 80) / 20;
    return 0;
  }

  updateWeights(newWeights: Partial<IndicatorWeights>) {
    this.weights = { ...this.weights, ...newWeights };
  }
}

// Export function for backward compatibility
export function calculateIndicators(data: OHLCV[], timeframe: string): IndicatorFeature[] {
  const calculator = new IndicatorCalculator();
  return calculator.calculateIndicators(data, timeframe);
}

// Copilot: Add more sophisticated indicator analysis
// TODO: Implement Ichimoku, ADX, CCI, OBV, VWAP
// TODO: Add multi-timeframe confluence detection
// TODO: Implement custom composite indicators