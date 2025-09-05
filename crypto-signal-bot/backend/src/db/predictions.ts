// file: backend/src/db/predictions.ts
// Role: Database operations for predictions and outcomes
// Requirements: CRUD operations, outcome tracking, card count persistence

import { Prediction } from '../scanner/index';

export interface PredictionOutcome {
  predictionId: string;
  pnlPercent: number;
  closedAt: string;
  actualDuration: number;
}

export interface SymbolStats {
  symbol: string;
  cardCount: number;
  totalPredictions: number;
  successfulPredictions: number;
  averageConfidence: number;
  lastUpdated: string;
}

export class PredictionManager {
  private predictions: Map<string, Prediction> = new Map();
  private outcomes: Map<string, PredictionOutcome> = new Map();
  private symbolStats: Map<string, SymbolStats> = new Map();

  constructor() {
    // In production, this would connect to PostgreSQL via Prisma
    console.log('PredictionManager initialized');
  }

  async savePrediction(prediction: Prediction): Promise<void> {
    try {
      // Store prediction in memory (in production: save to PostgreSQL)
      this.predictions.set(prediction.id, prediction);
      
      // Update symbol stats
      await this.updateSymbolStats(prediction.symbol, prediction);
      
      console.log(`Saved prediction ${prediction.id} for ${prediction.symbol}`);
    } catch (error) {
      console.error('Error saving prediction:', error);
      throw error;
    }
  }

  async getPrediction(id: string): Promise<Prediction | null> {
    return this.predictions.get(id) || null;
  }

  async getActivePredictions(): Promise<Prediction[]> {
    const now = new Date();
    const active = Array.from(this.predictions.values()).filter(
      p => new Date(p.expiresAt) > now
    );
    return active;
  }

  async savePredictionOutcome(outcome: PredictionOutcome): Promise<void> {
    try {
      // Store outcome in memory (in production: save to PostgreSQL)
      this.outcomes.set(outcome.predictionId, outcome);
      
      // Update the prediction with the outcome
      const prediction = this.predictions.get(outcome.predictionId);
      if (prediction) {
        prediction.finalOutcome = {
          pnlPercent: outcome.pnlPercent,
          closedAt: outcome.closedAt
        };
        this.predictions.set(prediction.id, prediction);
        
        // Update symbol stats
        await this.updateSymbolStatsWithOutcome(prediction.symbol, outcome);
      }
      
      console.log(`Saved outcome for prediction ${outcome.predictionId}: ${outcome.pnlPercent}%`);
    } catch (error) {
      console.error('Error saving prediction outcome:', error);
      throw error;
    }
  }

  async getSymbolCardCount(symbol: string): Promise<number> {
    const stats = this.symbolStats.get(symbol);
    return stats?.cardCount || 0;
  }

  async updateSymbolCardCount(symbol: string, direction: 'long' | 'short'): Promise<void> {
    const stats = this.symbolStats.get(symbol) || {
      symbol,
      cardCount: 0,
      totalPredictions: 0,
      successfulPredictions: 0,
      averageConfidence: 0,
      lastUpdated: new Date().toISOString()
    };

    stats.cardCount += direction === 'long' ? 1 : -1;
    stats.lastUpdated = new Date().toISOString();
    
    this.symbolStats.set(symbol, stats);
  }

  async getSymbolStats(symbol: string): Promise<SymbolStats | null> {
    return this.symbolStats.get(symbol) || null;
  }

  async getAllSymbolStats(): Promise<SymbolStats[]> {
    return Array.from(this.symbolStats.values());
  }

  async getSuccessRate(): Promise<number> {
    const totalOutcomes = this.outcomes.size;
    if (totalOutcomes === 0) return 0;

    const successfulOutcomes = Array.from(this.outcomes.values()).filter(
      outcome => outcome.pnlPercent > 0
    ).length;

    return (successfulOutcomes / totalOutcomes) * 100;
  }

  async getPredictionHistory(limit: number = 100): Promise<Prediction[]> {
    const predictions = Array.from(this.predictions.values());
    return predictions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getCompletedPredictionsForTraining(): Promise<Prediction[]> {
    return Array.from(this.predictions.values()).filter(p => p.finalOutcome);
  }

  private async updateSymbolStats(symbol: string, prediction: Prediction): Promise<void> {
    const stats = this.symbolStats.get(symbol) || {
      symbol,
      cardCount: 0,
      totalPredictions: 0,
      successfulPredictions: 0,
      averageConfidence: 0,
      lastUpdated: new Date().toISOString()
    };

    stats.totalPredictions++;
    
    // Update average confidence
    const allPredictions = Array.from(this.predictions.values()).filter(p => p.symbol === symbol);
    const totalConfidence = allPredictions.reduce((sum, p) => sum + p.confidence, 0);
    stats.averageConfidence = totalConfidence / allPredictions.length;
    
    stats.lastUpdated = new Date().toISOString();
    this.symbolStats.set(symbol, stats);
  }

  private async updateSymbolStatsWithOutcome(symbol: string, outcome: PredictionOutcome): Promise<void> {
    const stats = this.symbolStats.get(symbol);
    if (!stats) return;

    if (outcome.pnlPercent > 0) {
      stats.successfulPredictions++;
    }

    stats.lastUpdated = new Date().toISOString();
    this.symbolStats.set(symbol, stats);
  }

  // Cleanup old predictions (keep memory usage reasonable)
  async cleanup(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep last 7 days

    let deletedCount = 0;
    for (const [id, prediction] of this.predictions.entries()) {
      if (new Date(prediction.createdAt) < cutoffDate) {
        this.predictions.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} old predictions`);
    }
  }
}