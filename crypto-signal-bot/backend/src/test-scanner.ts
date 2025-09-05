// file: backend/src/test-scanner.ts
// Role: Simple test script to verify scanner functionality
// Run with: npx ts-node src/test-scanner.ts

import { MarketScanner } from './scanner/index';
import { WebSocketManager } from './ingest/websocket';
import { PredictionManager } from './db/predictions';

async function testScanner() {
  console.log('?? Testing Crypto Signal Bot Scanner...\n');

  try {
    // Initialize components
    const wsManager = new WebSocketManager('binance');
    const predictionManager = new PredictionManager();
    const scanner = new MarketScanner(wsManager, predictionManager);

    // Set up event listeners
    scanner.on('predictions-update', (predictions: any[]) => {
      console.log(`?? Predictions Update: ${predictions.length} active predictions`);
      predictions.forEach((p: any, i: number) => {
        const timeLeft = Math.round((new Date(p.expiresAt).getTime() - Date.now()) / (1000 * 60));
        console.log(`  ${i + 1}. ${p.symbol} ${p.direction.toUpperCase()} - ${p.confidence}% confidence, ${timeLeft}min left`);
      });
      console.log('');
    });

    scanner.on('scanner-status', (status: any) => {
      console.log(`?? Scanner Status:`);
      console.log(`  Running: ${status.isRunning ? '?' : '?'}`);
      console.log(`  Last Scan: ${status.lastScan || 'Never'}`);
      console.log(`  Symbols Scanned: ${status.symbolsScanned}`);
      console.log(`  Active Predictions: ${status.activePredictions}/10`);
      console.log(`  Success Rate: ${status.successRate.toFixed(1)}%`);
      console.log(`  Errors: ${status.errorCount}`);
      console.log(`  Uptime: ${Math.round(status.uptime / 1000)}s`);
      console.log('');
    });

    // Start scanner
    console.log('?? Starting scanner...');
    await scanner.start();

    // Let it run for 2 minutes
    console.log('? Running scanner for 2 minutes...');
    setTimeout(async () => {
      console.log('?? Stopping scanner...');
      await scanner.stop();

      // Show final results
      const finalPredictions = scanner.getActivePredictions();
      const metrics = scanner.getMetrics();
      
      console.log('\n?? Final Results:');
      console.log(`Total Predictions Created: ${finalPredictions.length}`);
      console.log(`Scanner Health: ${metrics.isHealthy ? '? Healthy' : '? Unhealthy'}`);
      console.log(`Total Errors: ${metrics.errorCount}`);
      console.log(`Card Counts Loaded: ${metrics.cardCountsLoaded}`);
      
      if (finalPredictions.length > 0) {
        console.log('\nActive Predictions:');
        finalPredictions.forEach((p, i) => {
          console.log(`${i + 1}. ${p.symbol} ${p.direction} (${p.confidence}% confidence)`);
        });
      }

      console.log('\n? Test completed successfully!');
      process.exit(0);
    }, 120000); // 2 minutes

    // Force a scan after 10 seconds
    setTimeout(async () => {
      console.log('?? Forcing manual scan...');
      await scanner.forceRescan();
    }, 10000);

  } catch (error) {
    console.error('? Test failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n?? Test interrupted by user');
  process.exit(0);
});

// Run the test
testScanner();