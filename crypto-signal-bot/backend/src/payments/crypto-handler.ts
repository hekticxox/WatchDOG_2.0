// Crypto Payment Processing with CoinPayments/NOWPayments
// File: crypto-signal-bot/backend/src/payments/crypto-handler.ts

import crypto from 'crypto';
import axios from 'axios';
import { TelegramSignalBot } from '../telegram/telegram-bot';

export interface CryptoPayment {
  paymentId: string;
  chatId: number;
  amount: number;
  currency: string; // USDT, BTC, ETH, etc.
  tier: 'basic' | 'premium';
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  address?: string;
  txHash?: string;
  createdAt: Date;
  expiresAt: Date;
}

export class CryptoPaymentHandler {
  private telegramBot: TelegramSignalBot;
  private apiKey: string;
  private secretKey: string;
  private pendingPayments: Map<string, CryptoPayment> = new Map();

  // Pricing in USDT
  private readonly PRICING = {
    basic: 19.99,
    premium: 49.99,
    trial: 0 // 7-day free trial
  };

  // Supported currencies with their contract addresses
  private readonly SUPPORTED_CURRENCIES = {
    'USDT-TRC20': { symbol: 'USDT', network: 'TRC20', decimals: 6 },
    'USDT-ERC20': { symbol: 'USDT', network: 'ERC20', decimals: 6 },
    'BTC': { symbol: 'BTC', network: 'BTC', decimals: 8 },
    'ETH': { symbol: 'ETH', network: 'ETH', decimals: 18 },
    'BNB': { symbol: 'BNB', network: 'BSC', decimals: 18 }
  };

  constructor(apiKey: string, secretKey: string, telegramBot: TelegramSignalBot) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.telegramBot = telegramBot;
    
    // Check payments every 30 seconds
    setInterval(() => this.checkPendingPayments(), 30000);
  }

  public async createPayment(chatId: number, tier: 'basic' | 'premium'): Promise<string> {
    const paymentId = this.generatePaymentId();
    const amount = this.PRICING[tier];
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    try {
      // Create payment with NOWPayments API
      const response = await axios.post('https://api.nowpayments.io/v1/payment', {
        price_amount: amount,
        price_currency: 'USD',
        pay_currency: 'USDTTRC20', // Default to USDT TRC20 for low fees
        order_id: paymentId,
        order_description: `WatchDOG ${tier.toUpperCase()} Signal Subscription`,
        success_url: `${process.env.DOMAIN}/payment-success`,
        cancel_url: `${process.env.DOMAIN}/payment-cancel`
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      const payment: CryptoPayment = {
        paymentId,
        chatId,
        amount,
        currency: 'USDT-TRC20',
        tier,
        status: 'pending',
        address: response.data.pay_address,
        createdAt: new Date(),
        expiresAt
      };

      this.pendingPayments.set(paymentId, payment);
      
      return this.formatPaymentMessage(payment, response.data);

    } catch (error) {
      console.error('Payment creation failed:', error);
      throw new Error('Failed to create crypto payment');
    }
  }

  private formatPaymentMessage(payment: CryptoPayment, paymentData: any): string {
    return `
?? **WatchDOG ${payment.tier.toUpperCase()} Subscription Payment**

**Amount:** $${payment.amount} USD
**Pay with:** ${payment.currency}
**Payment expires:** ${payment.expiresAt.toLocaleString()}

**?? Payment Instructions:**

1?? **Send exactly:** \`${paymentData.pay_amount}\` ${payment.currency}

2?? **To address:** 
\`${paymentData.pay_address}\`

3?? **Network:** TRC20 (Tron)

**?? Important:**
• Send EXACT amount shown above
• Use TRC20 network only (low fees ~$1)
• Payment expires in 30 minutes
• Confirmation takes 1-3 minutes

**?? Recommended Wallets:**
• Trust Wallet
• MetaMask  
• TronLink
• Binance

After payment, you'll receive instant confirmation! ??

*Payment ID: ${payment.paymentId}*
    `;
  }

  public async checkPaymentStatus(paymentId: string): Promise<CryptoPayment | null> {
    try {
      const response = await axios.get(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
        headers: { 'x-api-key': this.apiKey }
      });

      const payment = this.pendingPayments.get(paymentId);
      if (!payment) return null;

      if (response.data.payment_status === 'confirmed') {
        payment.status = 'confirmed';
        payment.txHash = response.data.outcome_amount;
        
        // Activate subscription
        await this.activateSubscription(payment);
        
        // Remove from pending
        this.pendingPayments.delete(paymentId);
      }

      return payment;
    } catch (error) {
      console.error('Payment status check failed:', error);
      return null;
    }
  }

  private async checkPendingPayments() {
    for (const [paymentId, payment] of this.pendingPayments) {
      // Check if expired
      if (new Date() > payment.expiresAt) {
        payment.status = 'expired';
        this.pendingPayments.delete(paymentId);
        continue;
      }

      // Check status
      await this.checkPaymentStatus(paymentId);
    }
  }

  private async activateSubscription(payment: CryptoPayment) {
    try {
      // Add subscriber to telegram bot
      this.telegramBot.addSubscriber(payment.chatId, payment.tier, 30);

      // Send confirmation message
      const message = `
?? **Payment Confirmed!**

Your WatchDOG ${payment.tier.toUpperCase()} subscription is now active!

**? What's included:**
${payment.tier === 'premium' ? `
• 86%+ confidence signals (highest quality)
• Priority signal delivery
• Advanced market analysis
• Position sizing recommendations
• Risk management alerts
` : `
• 65-85% confidence signals
• 3-5 signals daily
• Basic market analysis
• Entry/exit points
`}

**?? First signals coming your way soon!**

Transaction: \`${payment.txHash}\`
      `;

      await this.telegramBot.sendMessage(payment.chatId, message);
      
    } catch (error) {
      console.error('Subscription activation failed:', error);
    }
  }

  private generatePaymentId(): string {
    return 'WD_' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  // Alternative payment options
  public getPaymentOptions(): string {
    return `
?? **Choose Your Payment Method**

**?? Recommended: USDT (TRC20)**
• Lowest fees (~$1)
• Fastest confirmation (1-3 minutes)
• Most stable

**? Other Options:**
• Bitcoin (BTC) - Higher fees, slower
• Ethereum (ETH) - High gas fees
• BNB (BSC) - Low fees alternative

**?? Popular Wallets:**
• Trust Wallet ?
• MetaMask
• Binance App
• Coinbase Wallet

Select your preferred payment method below! ??
    `;
  }
}