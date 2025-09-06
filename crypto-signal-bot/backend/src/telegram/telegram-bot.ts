// Enhanced Telegram Signal Bot with Crypto Payment Integration
// File: crypto-signal-bot/backend/src/telegram/telegram-bot.ts

import TelegramBot from 'node-telegram-bot-api';
import { Prediction } from '../scanner/index';
import { CryptoPaymentHandler } from '../payments/crypto-handler';

export interface TelegramUser {
  chatId: number;
  username?: string;
  subscriptionTier: 'basic' | 'premium' | 'trial';
  subscriptionExpiry: Date;
  isActive: boolean;
  joinedAt: Date;
  totalSignalsReceived: number;
}

export class TelegramSignalBot {
  private bot: TelegramBot;
  private subscribers: Map<number, TelegramUser> = new Map();
  private cryptoPayments: CryptoPaymentHandler;
  private sentSignals: Set<string> = new Set(); // Prevent duplicate signals

  constructor(token: string, cryptoPayments: CryptoPaymentHandler) {
    this.bot = new TelegramBot(token, { polling: true });
    this.cryptoPayments = cryptoPayments;
    this.setupCommands();
    this.setupCallbacks();
  }

  private setupCommands() {
    // Start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.sendWelcomeMessage(chatId);
    });

    // Subscribe command
    this.bot.onText(/\/subscribe/, (msg) => {
      const chatId = msg.chat.id;
      this.sendSubscriptionOptions(chatId);
    });

    // Status command
    this.bot.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      this.sendUserStatus(chatId);
    });

    // Help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.sendHelpMessage(chatId);
    });

    // Stats command
    this.bot.onText(/\/stats/, (msg) => {
      const chatId = msg.chat.id;
      this.sendStatsMessage(chatId);
    });
  }

  private setupCallbacks() {
    this.bot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data;

      if (!chatId || !data) return;

      try {
        switch (data) {
          case 'sub_basic':
            await this.handleSubscription(chatId, 'basic');
            break;
          case 'sub_premium':
            await this.handleSubscription(chatId, 'premium');
            break;
          case 'trial_premium':
            await this.handleFreeTrial(chatId);
            break;
          case 'payment_usdt':
            await this.createCryptoPayment(chatId, 'premium', 'USDT-TRC20');
            break;
          case 'payment_btc':
            await this.createCryptoPayment(chatId, 'premium', 'BTC');
            break;
          case 'show_stats':
            await this.sendDetailedStats(chatId);
            break;
        }
      } catch (error) {
        console.error('Callback error:', error);
        await this.bot.sendMessage(chatId, '? An error occurred. Please try again.');
      }

      // Answer callback query
      await this.bot.answerCallbackQuery(callbackQuery.id);
    });
  }

  private sendWelcomeMessage(chatId: number) {
    const message = `
?? **Welcome to WatchDOG Signal Bot!**

Professional crypto trading signals powered by advanced AI analysis of 100+ symbols across 8 timeframes.

**?? Our Track Record:**
• 74.8% average confidence
• Real-time market analysis
• Risk management included
• 24/7 automated scanning

**?? Subscription Plans:**

?? **Basic Plan - $19.99/month**
• 65-85% confidence signals
• 3-5 signals daily
• Basic market analysis
• Entry/exit recommendations

?? **Premium Plan - $49.99/month**
• 86%+ confidence signals (highest quality)
• Priority delivery (like our 87% NMRUSDT signal!)
• Advanced market analysis with profit scores
• Position sizing recommendations
• Risk management alerts

?? **FREE 7-Day Premium Trial Available!**

**?? Payment:** Crypto only (USDT, BTC, ETH, BNB)
• Low fees with USDT (TRC20)
• Instant activation
• Secure & anonymous

Ready to start? Type /subscribe ??
    `;

    this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  private sendSubscriptionOptions(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '?? 7-Day Free Trial', callback_data: 'trial_premium' }
        ],
        [
          { text: '?? Basic ($19.99)', callback_data: 'sub_basic' },
          { text: '?? Premium ($49.99)', callback_data: 'sub_premium' }
        ],
        [
          { text: '?? View Sample Signals', callback_data: 'show_stats' }
        ]
      ]
    };

    const message = `
**Choose Your WatchDOG Plan:**

?? **FREE TRIAL** - 7 days of premium signals
?? **BASIC** - Quality signals for consistent profits  
?? **PREMIUM** - Our highest confidence signals (86%+)

**Current Premium Signal Example:**
NMRUSDT LONG - 87% confidence, 87% profit score
*This is the quality you get with premium!*

?? **Start with free trial to test our accuracy!**
    `;

    this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleFreeTrial(chatId: number) {
    // Add 7-day trial
    this.addSubscriber(chatId, 'trial', 7);
    
    const message = `
?? **7-Day Premium Trial Activated!**

You now have access to our highest quality signals (86%+ confidence) for the next 7 days.

**What to expect:**
• 2-5 premium signals daily
• Advanced market analysis
• Position sizing recommendations
• Real-time notifications

**First signals coming your way soon!** ??

After your trial, you can subscribe to continue receiving premium signals. We're confident you'll love the quality! ??
    `;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  private async handleSubscription(chatId: number, tier: 'basic' | 'premium') {
    const priceUSD = tier === 'basic' ? 19.99 : 49.99;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '?? USDT (TRC20) - Recommended', callback_data: `pay_${tier}_usdt` }
        ],
        [
          { text: '? Bitcoin (BTC)', callback_data: `pay_${tier}_btc` },
          { text: '? Ethereum (ETH)', callback_data: `pay_${tier}_eth` }
        ],
        [
          { text: '?? BNB (BSC)', callback_data: `pay_${tier}_bnb` }
        ]
      ]
    };

    const message = `
?? **${tier.toUpperCase()} Subscription - $${priceUSD}**

**Choose your payment method:**

?? **USDT (TRC20) - RECOMMENDED**
• Lowest fees (~$1)
• 1-3 minute confirmation
• Most stable option

? **Bitcoin (BTC)**
• Higher fees ($5-20)
• 10-30 minute confirmation

? **Ethereum (ETH)**  
• High gas fees ($10-50)
• 2-5 minute confirmation

?? **BNB (BSC)**
• Low fees (~$0.50)
• 1-3 minute confirmation

?? **We recommend USDT (TRC20) for fastest, cheapest payment!**
    `;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async createCryptoPayment(chatId: number, tier: 'basic' | 'premium', currency: string) {
    try {
      const paymentMessage = await this.cryptoPayments.createPayment(chatId, tier);
      await this.bot.sendMessage(chatId, paymentMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Payment creation error:', error);
      await this.bot.sendMessage(chatId, '? Payment creation failed. Please try again.');
    }
  }

  public async sendSignal(prediction: Prediction) {
    // Prevent duplicate signals
    const signalId = `${prediction.symbol}-${prediction.direction}-${prediction.confidence}`;
    if (this.sentSignals.has(signalId)) return;
    this.sentSignals.add(signalId);

    // Clean old signal IDs (keep last 100)
    if (this.sentSignals.size > 100) {
      const signalsArray = Array.from(this.sentSignals);
      this.sentSignals.clear();
      signalsArray.slice(-50).forEach(id => this.sentSignals.add(id));
    }

    const tier = prediction.confidence >= 86 ? 'premium' : 'basic';
    const subscribers = Array.from(this.subscribers.values())
      .filter(user => this.hasAccess(user, prediction));

    if (subscribers.length === 0) return;

    const message = this.formatSignalMessage(prediction, tier);

    // Send to all eligible subscribers
    const sendPromises = subscribers.map(async (user) => {
      try {
        await this.bot.sendMessage(user.chatId, message, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true 
        });
        
        // Update user stats
        user.totalSignalsReceived++;
        
      } catch (error) {
        console.error(`Failed to send signal to user ${user.chatId}:`, error);
      }
    });

    await Promise.all(sendPromises);
    console.log(`Sent ${tier} signal for ${prediction.symbol} to ${subscribers.length} subscribers`);
  }

  private hasAccess(user: TelegramUser, prediction: Prediction): boolean {
    // Check subscription status
    if (new Date() > user.subscriptionExpiry) return false;

    // Trial and Premium: Get 86%+ signals
    if (user.subscriptionTier === 'trial' || user.subscriptionTier === 'premium') {
      return prediction.confidence >= 86;
    }

    // Basic tier: 65-85% confidence
    if (user.subscriptionTier === 'basic') {
      return prediction.confidence >= 65 && prediction.confidence < 86;
    }

    return false;
  }

  private formatSignalMessage(prediction: Prediction, tier: 'basic' | 'premium'): string {
    const emoji = prediction.direction === 'long' ? '??' : '??';
    const tierEmoji = tier === 'premium' ? '??' : '??';
    
    let message = `
${tierEmoji} **${tier.toUpperCase()} SIGNAL** ${emoji}

**${prediction.symbol}** ${prediction.direction.toUpperCase()}
**Confidence:** ${prediction.confidence}%
**Profit Score:** ${prediction.profitabilityScore}%

**?? Market Analysis:**
Trend: ${prediction.marketState?.trend?.toUpperCase() || 'N/A'}
Volatility: ${prediction.marketState?.volatility?.toUpperCase() || 'N/A'}
Strength: ${((prediction.marketState?.strength || 0) * 100).toFixed(0)}%

**? Duration:** ${Math.round((prediction.estimatedRunMs || 0) / (1000 * 60))} minutes
    `;

    if (tier === 'premium' && prediction.positionSizing) {
      message += `
**?? Position Sizing:**
• Suggested Size: ${prediction.positionSizing.suggestedSize}%
• Max Risk: ${prediction.positionSizing.maxRisk}%
• Kelly Fraction: ${prediction.positionSizing.kellyFraction}

**?? For $100 portfolio:**
• Risk: $${(prediction.positionSizing.maxRisk).toFixed(2)}
• Position: $${(prediction.positionSizing.suggestedSize).toFixed(2)}
      `;
    }

    message += `
**?? Risk Management:**
• Never risk more than 2% per trade
• Use proper stop losses
• Trading carries risk of loss

*Powered by WatchDOG AI Scanner*
    `;

    return message;
  }

  public addSubscriber(chatId: number, tier: 'basic' | 'premium' | 'trial', durationDays: number = 30) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    this.subscribers.set(chatId, {
      chatId,
      subscriptionTier: tier,
      subscriptionExpiry: expiryDate,
      isActive: true,
      joinedAt: new Date(),
      totalSignalsReceived: 0
    });

    console.log(`Added subscriber ${chatId} with ${tier} tier for ${durationDays} days`);
  }

  public async sendMessage(chatId: number, message: string) {
    try {
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error(`Failed to send message to ${chatId}:`, error);
    }
  }

  private sendUserStatus(chatId: number) {
    const user = this.subscribers.get(chatId);
    
    if (!user) {
      this.bot.sendMessage(chatId, '? No active subscription found. Type /subscribe to get started!');
      return;
    }

    const daysLeft = Math.max(0, Math.ceil((user.subscriptionExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    
    const message = `
?? **Your WatchDOG Status**

**Subscription:** ${user.subscriptionTier.toUpperCase()}
**Status:** ${user.isActive ? '? Active' : '? Inactive'}
**Days Remaining:** ${daysLeft}
**Signals Received:** ${user.totalSignalsReceived}
**Member Since:** ${user.joinedAt.toDateString()}

${daysLeft < 3 ? '?? **Subscription expiring soon!** Type /subscribe to renew.' : ''}
    `;

    this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  private sendHelpMessage(chatId: number) {
    const message = `
?? **WatchDOG Help**

**Commands:**
/start - Welcome message
/subscribe - View subscription options
/status - Check your subscription
/help - This help message
/stats - View signal statistics

**Signal Types:**
?? Basic (65-85% confidence)
?? Premium (86%+ confidence)

**Payment:**
?? USDT (TRC20) - Recommended
? Bitcoin, ? Ethereum, ?? BNB

**Support:**
For issues, contact @YourSupportUsername

**Risk Warning:**
Trading crypto carries risk. Never invest more than you can afford to lose.
    `;

    this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  public getSubscriberCount(): { total: number, basic: number, premium: number, trial: number } {
    const activeUsers = Array.from(this.subscribers.values())
      .filter(user => user.isActive && new Date() <= user.subscriptionExpiry);

    return {
      total: activeUsers.length,
      basic: activeUsers.filter(u => u.subscriptionTier === 'basic').length,
      premium: activeUsers.filter(u => u.subscriptionTier === 'premium').length,
      trial: activeUsers.filter(u => u.subscriptionTier === 'trial').length
    };
  }
}