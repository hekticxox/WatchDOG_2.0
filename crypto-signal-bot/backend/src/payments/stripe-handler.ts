// Payment Processing with Stripe
// File: crypto-signal-bot/backend/src/payments/stripe-handler.ts

import Stripe from 'stripe';
import { TelegramSignalBot } from '../telegram/telegram-bot';

export class PaymentHandler {
  private stripe: Stripe;
  private telegramBot: TelegramSignalBot;

  constructor(stripeSecretKey: string, telegramBot: TelegramSignalBot) {
    this.stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    this.telegramBot = telegramBot;
  }

  public async createSubscription(chatId: number, tier: 'basic' | 'premium') {
    const priceId = tier === 'basic' 
      ? process.env.STRIPE_BASIC_PRICE_ID 
      : process.env.STRIPE_PREMIUM_PRICE_ID;

    try {
      // Create customer
      const customer = await this.stripe.customers.create({
        metadata: {
          telegram_chat_id: chatId.toString(),
          subscription_tier: tier
        }
      });

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN}/cancel`,
        metadata: {
          telegram_chat_id: chatId.toString(),
          subscription_tier: tier
        }
      });

      return session.url;
    } catch (error) {
      console.error('Stripe subscription creation failed:', error);
      throw error;
    }
  }

  public async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handleSubscriptionCreated(session: Stripe.Checkout.Session) {
    const chatId = parseInt(session.metadata?.telegram_chat_id || '0');
    const tier = session.metadata?.subscription_tier as 'basic' | 'premium';

    if (chatId && tier) {
      this.telegramBot.addSubscriber(chatId, tier, 30);
      
      // Send confirmation message
      const message = `
?? **Subscription Activated!**

Thank you for subscribing to WatchDOG ${tier.toUpperCase()} signals!

You'll now receive ${tier === 'premium' ? '86%+' : '65-85%'} confidence trading signals.

First signals coming your way soon! ??
      `;
      
      // Note: You'd need to add this method to TelegramSignalBot
      // this.telegramBot.sendMessage(chatId, message);
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    // Extend subscription for existing users
    console.log('Payment succeeded for invoice:', invoice.id);
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const customer = await this.stripe.customers.retrieve(subscription.customer as string);
    
    if (customer && !customer.deleted) {
      const chatId = parseInt(customer.metadata?.telegram_chat_id || '0');
      
      if (chatId) {
        // Deactivate user subscription
        // You'd implement this in TelegramSignalBot
        console.log(`Subscription canceled for chat ID: ${chatId}`);
      }
    }
  }
}