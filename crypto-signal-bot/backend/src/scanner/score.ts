// file: backend/src/scanner/score.ts
// Purpose: compute aggregate point score for symbol across many indicators & timeframes.
// Input: features: { [indicatorAtTimeframe:string]: {value:number, hit:boolean} }
// Output: { score:number, indicatorCount:number, breakdown: Record<string,number> }

/**
 * Example behavior:
 * - For each indicator hit add its base weight.
 * - If several indicators agree in same direction at same timeframe add a co-occurrence bonus.
 * - Subtract points from opposite-direction indicators.
 * - Add +1 / -1 to the "card count" every time a prediction is placed (external incrementer).
 */

export type IndicatorFeature = {
  name: string; // "RSI"
  timeframe: string; // "1h"
  direction: 'long'|'short'|null; // null if neutral
  weight?: number; // optional base weight
  strength?: number; // 0-1 representing how strongly the indicator signals
}

export function computeScore(features: IndicatorFeature[], cardCount: number): {
  score: number;
  indicatorCount: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let longScore = 0;
  let shortScore = 0;
  let indicatorCount = 0;

  // Calculate directional scores separately for better balance
  for (const f of features) {
    if (!f.direction) continue;
    
    const base = (f.weight ?? 1) * (f.strength ?? 1);
    const key = `${f.name}_${f.timeframe}_${f.direction}`;
    breakdown[key] = base;
    
    if (f.direction === 'long') {
      longScore += base;
    } else if (f.direction === 'short') {
      shortScore += base;
    }
    
    indicatorCount++;
  }

  // **NEW: Balance enforcement to prevent extreme bias**
  const rawScore = longScore - shortScore;
  const maxImbalance = Math.max(longScore, shortScore) * 0.7; // Max 70% imbalance
  
  let balancedScore = rawScore;
  if (Math.abs(rawScore) > maxImbalance) {
    balancedScore = rawScore > 0 ? maxImbalance : -maxImbalance;
    console.log(`?? Score balanced: ${rawScore.toFixed(2)} ? ${balancedScore.toFixed(2)}`);
  }

  // **NEW: Higher threshold for better quality**
  const minIndicators = 3;
  if (indicatorCount < minIndicators) {
    balancedScore = 0; // Require minimum confluence
  }

  // Co-occurrence bonus (enhanced)
  const tfDirCounts: Record<string, number> = {};
  for (const k of Object.keys(breakdown)) {
    const parts = k.split('_');
    const tf = parts[1], dir = parts[2];
    const k2 = `${tf}_${dir}`;
    tfDirCounts[k2] = (tfDirCounts[k2] ?? 0) + 1;
  }

  for (const k in tfDirCounts) {
    if (tfDirCounts[k] >= 3) {
      const bonus = (tfDirCounts[k] - 2) * 0.3; // Reduced bonus
      balancedScore += bonus * (k.endsWith('long') ? 1 : -1);
    }
  }

  // **NEW: Card count penalty for extreme bias**
  const cardPenalty = Math.abs(cardCount) > 5 ? Math.abs(cardCount) * 0.1 : 0;
  const cardContribution = cardCount * 0.15 - cardPenalty;
  
  const finalScore = balancedScore + cardContribution;

  return { 
    score: finalScore, 
    indicatorCount, 
    breakdown: {
      ...breakdown,
      '_longTotal': longScore,
      '_shortTotal': shortScore,
      '_rawScore': rawScore,
      '_cardContribution': cardContribution
    }
  };
}

export function estimateRunDuration(score: number, timeframesAgreement: string[]): number {
  // score roughly maps to minutes: higher score ? longer run
  // base 30 minutes min, cap 4 hours (240 min)
  const base = 30;
  const extra = Math.min(Math.max(score * 10, 0), 210); // score 0->210
  // if multiple higher timeframes (1h/2h/4h) agree, extend duration
  const hf = timeframesAgreement.filter(t => ['1h','2h','4h'].includes(t)).length;
  const hfBonus = hf * 30; // each high timeframe adds 30m
  const total = Math.min(240, base + extra + hfBonus);
  return total * 60 * 1000; // ms
}