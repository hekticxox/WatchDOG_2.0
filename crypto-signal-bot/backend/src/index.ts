// file: backend/src/index.ts
// Role: Main application entry point
// Requirements: Initialize services, start scanner, handle graceful shutdown

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { MarketScanner } from './scanner/index';
import { WebSocketManager } from './ingest/websocket';
import { PredictionManager } from './db/predictions';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const wsManager = new WebSocketManager('binance');
const predictionManager = new PredictionManager();
const scanner = new MarketScanner(wsManager, predictionManager);

// Store WebSocket connections
const clients = new Set<any>();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('?? Client connected to WebSocket');
  clients.add(ws);

  // Send current predictions immediately
  const activePredictions = scanner.getActivePredictions();
  ws.send(JSON.stringify({
    type: 'predictions-update',
    predictions: activePredictions
  }));

  // Send scanner status
  const status = scanner.getStatus();
  ws.send(JSON.stringify({
    type: 'scanner-status',
    status
  }));

  ws.on('close', () => {
    console.log('? Client disconnected from WebSocket');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('?? WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast updates to all connected clients
function broadcastToClients(data: any) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending to client:', error);
        clients.delete(client);
      }
    }
  });
}

// Scanner event handlers
scanner.on('predictions-update', (predictions) => {
  console.log(`?? Broadcasting ${predictions.length} predictions to ${clients.size} clients`);
  broadcastToClients({
    type: 'predictions-update',
    predictions
  });
});

scanner.on('scanner-status', (status) => {
  broadcastToClients({
    type: 'scanner-status',
    status
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scanner: scanner.getStatus(),
    clients: clients.size,
    predictions: scanner.getActivePredictions().length
  });
});

app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = scanner.getActivePredictions();
    res.json(predictions);
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/predictions/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const history = await predictionManager.getPredictionHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching prediction history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await predictionManager.getAllSymbolStats();
    const successRate = await predictionManager.getSuccessRate();
    
    res.json({
      symbolStats: stats,
      overallSuccessRate: successRate,
      activePredictions: scanner.getActivePredictions().length,
      scannerMetrics: scanner.getMetrics()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/scan', async (req, res) => {
  try {
    console.log('?? Manual scan requested via API');
    await scanner.forceRescan();
    res.json({ 
      message: 'Scan initiated', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error initiating scan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cleanup-duplicates', async (req, res) => {
  try {
    console.log('?? Manual duplicate cleanup requested via API');
    const removedCount = scanner.forceCleanupDuplicates();
    res.json({ 
      message: 'Duplicate cleanup completed', 
      removedCount,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/symbols/:symbol/card-count', (req, res) => {
  try {
    const symbol = req.params.symbol;
    const cardCount = scanner.getCardCount(symbol);
    res.json({ symbol, cardCount });
  } catch (error) {
    console.error('Error fetching card count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Express error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('?? Received SIGINT, shutting down gracefully...');
  
  // Stop scanner
  await scanner.stop();
  
  // Close WebSocket connections
  clients.forEach(client => {
    client.close();
  });
  
  // Close server
  server.close(() => {
    console.log('? Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('?? Received SIGTERM, shutting down gracefully...');
  
  await scanner.stop();
  
  server.close(() => {
    console.log('? Server closed');
    process.exit(0);
  });
});

// Start the application
async function startApplication() {
  try {
    console.log('?? Starting Crypto Signal Bot...');
    
    // Start the scanner
    await scanner.start();
    
    // Start the HTTP server
    const port = process.env.PORT || 8000;
    server.listen(port, () => {
      console.log(`? Server running on port ${port}`);
      console.log(`?? WebSocket server ready for connections`);
      console.log(`?? Health check: http://localhost:${port}/api/health`);
      console.log(`?? Live Dashboard: Open live-crypto-dashboard.html in your browser`);
    });
    
  } catch (error) {
    console.error('? Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();