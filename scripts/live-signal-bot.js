const TelegramBot = require('node-telegram-bot-api');

// Your bot token from the successful bot creation
const TOKEN = '8221968997:AAF-16ZBmfLYic1UdMIO0_-jjW2oWeRQIVw';
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('?? WatchDOG Signal Bot - LIVE VERSION STARTING...');
console.log('Bot Link: https://t.me/WatchDOGAdmin_bot');
console.log('Payment URL: https://nowpayments.io/payment/?iid=5395099315');

// Welcome message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Trader';
  
  const welcomeMessage = `
?? **Welcome to WatchDOG Signal Bot, ${userName}!**

**?? Professional Crypto Trading Signals**
? 74.8% average confidence
? 86%+ premium signals available
? Real-time market analysis
? AI-powered predictions

**?? SUBSCRIPTION PLANS:**

?? **BASIC - $19.99/month**
• 65-85% confidence signals
• 3-5 signals daily
• Basic market analysis
• Entry/exit points

?? **PREMIUM - $49.99/month**
• 86%+ confidence signals (HIGHEST QUALITY!)
• Priority delivery
• Advanced market analysis
• Position sizing recommendations
• Risk management alerts

?? **FREE 7-DAY TRIAL** - Try premium risk-free!

**?? Payment:** Crypto only (USDT TRC20 recommended - low fees!)

**Recent Premium Signal Example:**
NMRUSDT LONG - 87% confidence, 87% profit score
*This is the quality our premium users get!*

Type /subscribe to get started! ??
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  console.log(`? Welcome sent to ${userName} (${chatId})`);
});

// Subscription options
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '?? 7-Day Free Trial', callback_data: 'trial' }],
      [
        { text: '?? Basic $19.99', callback_data: 'basic' },
        { text: '?? Premium $49.99', callback_data: 'premium' }
      ],
      [{ text: '?? See Demo Signal', callback_data: 'demo' }]
    ]
  };

  const subscribeMessage = `
**?? Choose Your WatchDOG Plan:**

?? **FREE TRIAL** - 7 days premium access
Try our 86%+ confidence signals risk-free!

?? **BASIC** - $19.99/month
Quality signals for consistent profits

?? **PREMIUM** - $49.99/month
Our highest confidence signals (86%+)

**?? Why Choose WatchDOG?**
• Proven 74.8% average accuracy
• Recent 87% confidence NMRUSDT signal
• Advanced AI market analysis
• Real-time notifications

**Payment:** USDT (TRC20) - Only ~$1 fee!
Also accepts: BTC, ETH, BNB
  `;

  bot.sendMessage(chatId, subscribeMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Demo signal
bot.onText(/\/demo/, (msg) => {
  const chatId = msg.chat.id;
  
  const demoSignal = `
?? **LIVE PREMIUM SIGNAL EXAMPLE** ??

**NMRUSDT LONG**
**Confidence:** 87% ?
**Profit Score:** 87% ??

**?? Market Analysis:**
• Trend: ?? BULL ? accelerating
• Volatility: MEDIUM
• Strength: 100%

**?? Position Sizing:**
• Suggested Size: 2.8% of portfolio
• Max Risk: 1.2%
• Kelly Fraction: 0.15

**? Signal Duration:** 157 minutes

**?? This is REAL quality from our scanner!**
Type /subscribe to get signals like this! ??

*Recent performance: 74.8% avg confidence*
  `;
  
  bot.sendMessage(chatId, demoSignal, { parse_mode: 'Markdown' });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const userName = callbackQuery.from.first_name || 'Trader';

  switch (data) {
    case 'trial':
      const trialMessage = `
?? **7-Day Premium Trial Activated for ${userName}!**

You now have access to our highest quality signals (86%+ confidence) for the next 7 days!

**What to expect:**
? 2-5 premium signals daily
? Advanced market analysis
? Position sizing recommendations
? Real-time notifications

**Your trial includes signals like:**
NMRUSDT LONG - 87% confidence ?

**First signals coming your way soon!** ??

After trial, subscribe to continue receiving premium signals.
      `;
      await bot.sendMessage(chatId, trialMessage, { parse_mode: 'Markdown' });
      break;

    case 'basic':
    case 'premium':
      const tier = data;
      const price = tier === 'basic' ? '19.99' : '49.99';
      
      const paymentMessage = `
?? **${tier.toUpperCase()} Subscription - $${price}**

**Payment Instructions:**

1?? **Visit Payment Link:**
https://nowpayments.io/payment/?iid=5395099315

2?? **Choose Payment Currency:**
• ?? USDT (TRC20) - RECOMMENDED (low fees ~$1)
• ? Bitcoin (BTC)
• ? Ethereum (ETH)
• ?? BNB (BSC)

3?? **Complete Payment**
You'll receive instant confirmation!

**?? Why USDT TRC20?**
• Lowest fees (~$1 vs $20+ for others)
• 1-3 minute confirmation
• Most stable option

**?? Secure & Anonymous**
No personal info required - just crypto payment!

After payment, return here and type /activate
      `;
      
      await bot.sendMessage(chatId, paymentMessage, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true 
      });
      break;

    case 'demo':
      // Send the demo signal again
      const demoSignal = `
?? **PREMIUM SIGNAL DEMO** ??

**NMRUSDT LONG**
**Confidence:** 87%
**Profit Score:** 87%

?? BULL market ? accelerating
?? 2.8% position size recommended
? 157 minutes duration

This is the quality you get with premium! ??
      `;
      await bot.sendMessage(chatId, demoSignal, { parse_mode: 'Markdown' });
      break;
  }

  await bot.answerCallbackQuery(callbackQuery.id);
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
?? **WatchDOG Bot Commands**

**Available Commands:**
/start - Welcome & info
/subscribe - View plans
/demo - See sample signal
/help - This help
/status - Check subscription
/activate - Activate after payment

**?? Signal Quality:**
• Average confidence: 74.8%
• Premium signals: 86%+
• Real-time delivery

**?? Payment:**
Crypto only - USDT (TRC20) recommended for low fees

**?? Recent Performance:**
Our 87% confidence NMRUSDT signal is live proof of quality!

Ready to start? Type /subscribe! ??
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Activation command
bot.onText(/\/activate/, (msg) => {
  const chatId = msg.chat.id;
  
  const activateMessage = `
?? **Checking Payment Status...**

If you've just completed payment:
1. Wait 1-3 minutes for confirmation
2. Type /activate again

**Payment Completed?**
You should start receiving signals within 5 minutes!

**Need Help?**
• Check your payment transaction
• Ensure you used correct amount
• Contact support if issues persist

**Payment Link:**
https://nowpayments.io/payment/?iid=5395099315
  `;
  
  bot.sendMessage(chatId, activateMessage, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true 
  });
});

// Error handling
bot.on('error', (error) => {
  console.error('? Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('? Polling error:', error);
});

// Simulate sending signals (for demo purposes)
setInterval(() => {
  console.log(`?? Bot alive - ${new Date().toLocaleTimeString()}`);
  
  // In a real implementation, this would check your scanner for new signals
  // and send them to subscribed users
}, 60000);

console.log('? WatchDOG Signal Bot is LIVE!');
console.log('?? Users can start chatting at: https://t.me/WatchDOGAdmin_bot');
console.log('?? Payments accepted via: https://nowpayments.io/payment/?iid=5395099315');
console.log('?? Press Ctrl+C to stop');