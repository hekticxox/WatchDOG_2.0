# ?? WatchDOG 2.0 Setup Guide

## Quick Start (Recommended)

### 1. Download & Extract
```bash
git clone https://github.com/hekticxox/WatchDOG_2.0.git
cd WatchDOG_2.0
```

### 2. Install Dependencies
```bash
cd crypto-signal-bot/backend
npm install
cd ../../
```

### 3. Launch Business
```bash
# Windows
scripts/launch-business.bat

# The script will automatically:
# ? Start the signal scanner
# ? Launch the Telegram bot
# ? Open the professional dashboard
```

## Configuration

### Telegram Bot Setup
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Save your bot token
4. Update `live-signal-bot.js` with your token

### Payment Integration
1. Sign up at [NOWPayments](https://nowpayments.io)
2. Get your API key
3. Configure in the payment system

## Components

### ?? Signal Scanner (`crypto-signal-bot/`)
- Professional TypeScript backend
- Real-time market analysis
- WebSocket connections to exchanges
- Advanced technical indicators

### ?? Telegram Bot (`scripts/live-signal-bot.js`)
- Customer subscription management
- Crypto payment processing
- Signal delivery system
- Revenue tracking

### ?? Dashboards (`dashboards/`)
- **Live Dashboard**: Real-time signal monitoring
- **Demo Dashboard**: Customer demonstration tool

## Production Deployment

### Option 1: Local Server
```bash
scripts/launch-business.bat
```

### Option 2: Docker (Recommended for scale)
```bash
cd crypto-signal-bot
docker-compose up -d
```

### Option 3: Cloud Deployment
- Deploy to DigitalOcean, AWS, or Heroku
- Use environment variables for configuration
- Set up SSL certificates for HTTPS

## Troubleshooting

### Bot Not Responding
1. Check your bot token is correct
2. Ensure no other bot instances are running
3. Verify internet connectivity

### Scanner Issues
1. Check if port 8000 is available
2. Verify Node.js 18+ is installed
3. Check exchange API connectivity

### Payment Problems
1. Verify NOWPayments API key
2. Check cryptocurrency network status
3. Review transaction logs

## Support

- **Documentation**: `/docs` folder
- **Telegram**: [@WatchDOGSupport](https://t.me/WatchDOGSupport)
- **Issues**: Create GitHub issues for bugs

## Next Steps

1. **Customize Branding**: Update bot messages and dashboard
2. **Add More Pairs**: Expand symbol list in scanner
3. **Marketing**: Share your bot in crypto communities
4. **Scale**: Deploy to cloud for 24/7 operation

**?? Goal: Start earning $4,500+/month with professional crypto signals!**