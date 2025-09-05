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
  // Copilot: implement a weighted scoring algorithm:
  // - group by timeframe and direction
  // - sum base weights * strength
  // - if >=3 indicators agree in same timeframe add +bonus
  // - subtract opposite sums
  // - include cardCount as additional prior (each +1 means +0.2 points)
  const breakdown: Record<string, number> = {};
  let score = 0;
  let indicatorCount = 0;

  // naive baseline, Copilot should optimize/expand:
  for (const f of features) {
    const base = (f.weight ?? 1) * (f.strength ?? 1);
    const key = `${f.name}_${f.timeframe}_${f.direction}`;
    breakdown[key] = (breakdown[key] ?? 0) + base;
    if (f.direction === 'long') score += base;
    else if (f.direction === 'short') score -= base;
    if (f.direction) indicatorCount++;
  }

  // co-occurrence bonus:
  const tfDirCounts: Record<string, number> = {};
  for (const k of Object.keys(breakdown)) {
    const parts = k.split('_'); // name_timeframe_direction
    const tf = parts[1], dir = parts[2];
    const k2 = `${tf}_${dir}`;
    tfDirCounts[k2] = (tfDirCounts[k2] ?? 0) + 1;
  }
  for (const k in tfDirCounts) {
    if (tfDirCounts[k] >= 3) {
      // bonus magnitude depends on count
      score += (tfDirCounts[k] - 2) * 0.5 * (k.endsWith('long') ? 1 : -1);
    }
  }

  // include card count (the +1/-1 historical board occurrences)
  score += cardCount * 0.2;

  return { score, indicatorCount, breakdown };
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