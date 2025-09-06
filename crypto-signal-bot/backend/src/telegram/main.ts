// Main Integration File - Connect Scanner to Telegram Bot
// File: crypto-signal-bot/backend/src/telegram/main.ts

import { TelegramSignalBot } from './telegram-bot';
import { CryptoPaymentHandler } from '../payments/crypto-handler';
import { scanMarkets } from '../scanner/index';
import { Prediction } from '../scanner/index';

export class WatchDogTelegramService {
  private telegramBot: TelegramSignalBot;
  private cryptoPayments: CryptoPaymentHandler;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize crypto payment handler
    this.cryptoPayments = new CryptoPaymentHandler(
      process.env.NOWPAYMENTS_API_KEY || '',
      process.env.NOWPAYMENTS_SECRET || '',
      this.telegramBot
    );

    // Initialize telegram bot
    this.telegramBot = new TelegramSignalBot(
      process.env.TELEGRAM_BOT_TOKEN || '',
      this.cryptoPayments
    );

    console.log('?? WatchDOG Telegram Service initialized');
  }

  public async start() {
    if (this.isRunning) {
      console.log('Service already running');
      return;
    }

    this.isRunning = true;
    console.log('?? Starting WatchDOG Telegram Signal Service...');

    // Start continuous scanning
    this.startScanning();

    // Add startup message
    this.logServiceStatus();
  }

  private startScanning() {
    // Scan every 5 minutes
    this.scanInterval = setInterval(async () => {
      try {
        console.log('?? Running market scan...');
        
        // Run your existing scanner
        const predictions = await scanMarkets();
        
        // Filter for high-quality signals
        const qualitySignals = predictions.filter(p => 
          p.confidence >= 65 && 
          p.profitabilityScore >= 60
        );

        console.log(`Found ${qualitySignals.length} quality signals`);

        // Send each signal to appropriate subscribers
        for (const prediction of qualitySignals) {
          await this.telegramBot.sendSignal(prediction);
          
          // Small delay between signals to avoid spam
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error('Scan error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    console.log('?? Market scanning started (5-minute intervals)');
  }

  public stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    console.log('?? WatchDOG Telegram Service stopped');
  }

  public getStats() {
    const subscribers = this.telegramBot.getSubscriberCount();
    
    return {
      isRunning: this.isRunning,
      subscribers,
      uptime: process.uptime(),
      lastScan: new Date().toISOString()
    };
  }

  private logServiceStatus() {
    const stats = this.getStats();
    
    console.log(`
?? **WatchDOG Telegram Service Status**
????????????????????????????????????
?? Status: ${stats.isRunning ? '? RUNNING' : '? STOPPED'}
?? Subscribers: ${stats.subscribers.total}
   ?? Basic: ${stats.subscribers.basic}
   ?? Premium: ${stats.subscribers.premium}
   ?? Trial: ${stats.subscribers.trial}
? Uptime: ${Math.floor(stats.uptime / 60)} minutes
?? Scan Interval: 5 minutes
?? Payment Method: Crypto (USDT, BTC, ETH, BNB)
????????????????????????????????????
    `);
  }

  // Manual scan trigger for testing
  public async manualScan() {
    console.log('?? Manual scan triggered...');
    
    try {
      const predictions = await scanMarkets();
      const qualitySignals = predictions.filter(p => 
        p.confidence >= 65 && 
        p.profitabilityScore >= 60
      );

      console.log(`Manual scan found ${qualitySignals.length} quality signals`);
      
      for (const prediction of qualitySignals) {
        await this.telegramBot.sendSignal(prediction);
      }

      return qualitySignals;
    } catch (error) {
      console.error('Manual scan error:', error);
      throw error;
    }
  }
}

// Environment variable validation
function validateEnvironment() {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'NOWPAYMENTS_API_KEY',
    'BINANCE_API_KEY',
    'BINANCE_SECRET_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('? Missing required environment variables:', missing);
    process.exit(1);
  }
}

// Main startup function
export async function startWatchDogService() {
  validateEnvironment();
  
  const service = new WatchDogTelegramService();
  await service.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n?? Shutting down WatchDOG service...');
    service.stop();
    process.exit(0);
  });

  return service;
}

// Auto-start if this file is run directly
if (require.main === module) {
  startWatchDogService().catch(console.error);
}