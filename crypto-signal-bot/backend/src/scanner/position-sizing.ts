// file: backend/src/scanner/position-sizing.ts
// Role: Calculate optimal position sizes based on confidence and risk
// Requirements: Kelly Criterion, volatility adjustment, max risk per trade

export interface PositionSizing {
  confidence: number;
  suggestedSize: number; // Percentage of portfolio
  maxRisk: number; // Maximum risk percentage
  kellyFraction: number;
  volatilityAdjusted: number;
}

export class PositionSizingCalculator {
  private readonly maxRiskPerTrade = 0.02; // 2% max risk per trade
  private readonly maxPositionSize = 0.10; // 10% max position size

  calculatePositionSize(
    confidence: number,
    riskRewardRatio: number,
    volatility: number,
    winRate: number = 0.6 // Default 60% win rate
  ): PositionSizing {
    // Kelly Criterion: f = (bp - q) / b
    // where b = odds (risk/reward), p = win probability, q = loss probability
    const winProbability = Math.min(confidence / 100, 0.95); // Cap at 95%
    const lossProbability = 1 - winProbability;
    const odds = riskRewardRatio;

    const kellyFraction = (odds * winProbability - lossProbability) / odds;
    
    // Adjust for volatility (reduce size in high volatility)
    const volatilityMultiplier = Math.max(0.5, 1 - volatility);
    const volatilityAdjusted = kellyFraction * volatilityMultiplier;
    
    // Apply conservative scaling (use 25% of Kelly)
    const conservativeKelly = Math.max(0, volatilityAdjusted * 0.25);
    
    // Cap at maximum position size
    const suggestedSize = Math.min(conservativeKelly, this.maxPositionSize);
    
    // Calculate max risk for this trade
    const maxRisk = Math.min(suggestedSize / riskRewardRatio, this.maxRiskPerTrade);

    return {
      confidence,
      suggestedSize: Math.round(suggestedSize * 1000) / 10, // Round to 0.1%
      maxRisk: Math.round(maxRisk * 1000) / 10,
      kellyFraction: Math.round(kellyFraction * 1000) / 10,
      volatilityAdjusted: Math.round(volatilityAdjusted * 1000) / 10
    };
  }

  // Calculate portfolio heat (total risk across all positions)
  calculatePortfolioHeat(activePredictions: any[]): number {
    return activePredictions.reduce((totalRisk, prediction) => {
      const positionSize = this.calculatePositionSize(
        prediction.confidence,
        prediction.riskRewardRatio || 2.5,
        0.3 // Default volatility
      );
      return totalRisk + positionSize.maxRisk;
    }, 0);
  }

  // Suggest whether to take a new position based on portfolio heat
  shouldTakePosition(
    newPredictionRisk: number,
    currentPortfolioHeat: number,
    maxPortfolioHeat: number = 0.15 // 15% max total portfolio risk
  ): boolean {
    return (currentPortfolioHeat + newPredictionRisk) <= maxPortfolioHeat;
  }
}