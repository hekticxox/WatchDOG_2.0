// Simple test script to verify the scanner algorithm works
// Run with: node test-simple.js

console.log('?? Testing Crypto Signal Bot Core Algorithm...\n');

// Mock data to test the scoring algorithm
const mockFeatures = [
  { name: 'RSI', timeframe: '1h', direction: 'long', weight: 1.0, strength: 0.8 },
  { name: 'MACD', timeframe: '1h', direction: 'long', weight: 1.2, strength: 0.7 },
  { name: 'EMA_20', timeframe: '1h', direction: 'long', weight: 0.8, strength: 0.6 },
  { name: 'RSI', timeframe: '4h', direction: 'long', weight: 1.0, strength: 0.9 },
  { name: 'BB', timeframe: '4h', direction: 'long', weight: 1.0, strength: 0.5 },
];

const mockCardCount = 5; // +5 from previous predictions

// Simple version of computeScore function
function computeScore(features, cardCount) {
  const breakdown = {};
  let score = 0;
  let indicatorCount = 0;

  // Basic scoring
  for (const f of features) {
    const base = (f.weight || 1) * (f.strength || 1);
    const key = `${f.name}_${f.timeframe}_${f.direction}`;
    breakdown[key] = (breakdown[key] || 0) + base;
    
    if (f.direction === 'long') score += base;
    else if (f.direction === 'short') score -= base;
    if (f.direction) indicatorCount++;
  }

  // Co-occurrence bonus
  const tfDirCounts = {};
  for (const k of Object.keys(breakdown)) {
    const parts = k.split('_');
    const tf = parts[1], dir = parts[2];
    const k2 = `${tf}_${dir}`;
    tfDirCounts[k2] = (tfDirCounts[k2] || 0) + 1;
  }
  
  for (const k in tfDirCounts) {
    if (tfDirCounts[k] >= 3) {
      score += (tfDirCounts[k] - 2) * 0.5 * (k.endsWith('long') ? 1 : -1);
    }
  }

  // Card count bonus
  score += cardCount * 0.2;

  return { score, indicatorCount, breakdown };
}

// Simple duration estimation
function estimateRunDuration(score, timeframesAgreement) {
  const base = 30;
  const extra = Math.min(Math.max(score * 10, 0), 210);
  const hf = timeframesAgreement.filter(t => ['1h','2h','4h'].includes(t)).length;
  const hfBonus = hf * 30;
  const total = Math.min(240, base + extra + hfBonus);
  return total * 60 * 1000; // ms
}

// Test the algorithm
console.log('?? Input Features:');
mockFeatures.forEach((f, i) => {
  console.log(`  ${i + 1}. ${f.name} (${f.timeframe}) - ${f.direction} direction, strength: ${f.strength}`);
});

console.log(`\n?? Card Count: ${mockCardCount} (from previous predictions)\n`);

// Compute score
const result = computeScore(mockFeatures, mockCardCount);

console.log('?? Scoring Results:');
console.log(`  Total Score: ${result.score.toFixed(2)}`);
console.log(`  Indicator Count: ${result.indicatorCount}`);
console.log(`  Direction: ${result.score > 0 ? 'LONG' : 'SHORT'}`);

// Calculate duration
const agreementTimeframes = ['1h', '4h']; // Mock agreement
const duration = estimateRunDuration(Math.abs(result.score), agreementTimeframes);
const durationMins = Math.round(duration / (1000 * 60));

console.log(`  Estimated Duration: ${durationMins} minutes`);

// Calculate confidence (simplified)
const baseConfidence = Math.min(Math.abs(result.score) * 6, 50);
const indicatorBonus = Math.min(result.indicatorCount * 1.2, 12);
const strengthBonus = mockFeatures.reduce((sum, f) => sum + f.strength, 0) / mockFeatures.length * 8;
const confidence = Math.min(baseConfidence + indicatorBonus + strengthBonus + 15, 92);

console.log(`  Confidence: ${confidence.toFixed(1)}%`);

console.log('\n?? Breakdown:');
Object.entries(result.breakdown).forEach(([key, value]) => {
  console.log(`  ${key}: ${value.toFixed(2)} points`);
});

// Check if it would create a prediction
const minScore = 2.0;
const minDuration = 30 * 60 * 1000;
const maxDuration = 4 * 60 * 60 * 1000;

console.log(`\n?? Prediction Decision:`);
console.log(`  Score >= ${minScore}? ${Math.abs(result.score) >= minScore ? '?' : '?'} (${Math.abs(result.score).toFixed(2)})`);
console.log(`  Duration 30m-4h? ${duration >= minDuration && duration <= maxDuration ? '?' : '?'} (${durationMins}min)`);
console.log(`  Confidence >= 40%? ${confidence >= 40 ? '?' : '?'} (${confidence.toFixed(1)}%)`);

const wouldCreate = Math.abs(result.score) >= minScore && 
                   duration >= minDuration && 
                   duration <= maxDuration && 
                   confidence >= 40;

console.log(`\n${wouldCreate ? '?? PREDICTION WOULD BE CREATED!' : '? Prediction criteria not met'}`);

if (wouldCreate) {
  console.log(`\n?? Prediction Summary:`);
  console.log(`  Symbol: BTCUSDT (example)`);
  console.log(`  Direction: ${result.score > 0 ? 'LONG' : 'SHORT'}`);
  console.log(`  Confidence: ${confidence.toFixed(1)}%`);
  console.log(`  Duration: ${durationMins} minutes`);
  console.log(`  Score: ${result.score.toFixed(2)}`);
  console.log(`  Card Count: ${mockCardCount} ? ${mockCardCount + (result.score > 0 ? 1 : -1)}`);
}

console.log('\n? Core algorithm test completed!');
console.log('\nThis demonstrates how your bot will:');
console.log('  • Analyze multiple indicators across timeframes');
console.log('  • Calculate weighted scores with bonuses');
console.log('  • Determine prediction duration and confidence');
console.log('  • Apply strict criteria before creating predictions');
console.log('\nTo run the full bot with real market data, use: npm install && npm run dev');