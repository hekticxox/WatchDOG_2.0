// file: frontend/src/pages/Home.tsx
// Role: Main dashboard showing up to 10 prediction cards, scanner status, and controls
// Requirements: Grid layout, real-time updates via WebSocket, colorful Tailwind styling

import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Settings, RefreshCw } from 'lucide-react';
import PredictionCard from '../components/PredictionCard';

interface Prediction {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  score: number;
  indicatorsHit: Record<string, number>;
  indicatorCount: number;
  confidence: number;
  estimatedRunMs: number;
  createdAt: string;
  expiresAt: string;
  cardCount: number;
  finalOutcome?: { pnlPercent: number; closedAt: string };
}

interface ScannerStatus {
  isRunning: boolean;
  lastScan: string;
  symbolsScanned: number;
  activePredictions: number;
  totalPredictions: number;
  successRate: number;
}

const Home: React.FC = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>({
    isRunning: false,
    lastScan: '',
    symbolsScanned: 0,
    activePredictions: 0,
    totalPredictions: 0,
    successRate: 0
  });
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    // Copilot: Implement WebSocket connection for real-time updates
    // Connect to backend WebSocket, listen for prediction updates
    // Handle connection status and reconnection logic
    
    const connectWebSocket = () => {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'predictions-update') {
            setPredictions(data.predictions.sort((a: Prediction, b: Prediction) => 
              b.confidence - a.confidence
            ));
          }
          
          if (data.type === 'scanner-status') {
            setScannerStatus(data.status);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };

      return ws;
    };

    const ws = connectWebSocket();

    return () => {
      ws.close();
    };
  }, []);

  const handlePredictionExpire = (id: string) => {
    setPredictions(prev => prev.filter(p => p.id !== id));
  };

  const handleRefreshPredictions = async () => {
    // Copilot: Implement manual refresh from REST API
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/predictions`);
      const data = await response.json();
      setPredictions(data.sort((a: Prediction, b: Prediction) => b.confidence - a.confidence));
    } catch (error) {
      console.error('Error refreshing predictions:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Activity className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Crypto Signal Bot</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                {wsConnected ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-500" />
                )}
                <span className={`text-sm font-medium ${
                  wsConnected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefreshPredictions}
                className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
              
              {/* Settings Button */}
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Scanner Status */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Scanner Status</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      scannerStatus.isRunning ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      scannerStatus.isRunning ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {scannerStatus.isRunning ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Scan</span>
                  <span className="text-sm text-gray-900">
                    {scannerStatus.lastScan ? new Date(scannerStatus.lastScan).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Symbols Scanned</span>
                  <span className="text-sm font-semibold text-gray-900">{scannerStatus.symbolsScanned}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Predictions</span>
                  <span className="text-sm font-semibold text-blue-600">{scannerStatus.activePredictions}/10</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Predictions</span>
                  <span className="text-sm font-semibold text-gray-900">{scannerStatus.totalPredictions}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Success Rate</span>
                  <span className={`text-sm font-semibold ${
                    scannerStatus.successRate >= 60 ? 'text-green-600' : 
                    scannerStatus.successRate >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {scannerStatus.successRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {predictions.filter(p => p.direction === 'long').length}
                  </div>
                  <div className="text-sm text-green-700">Long Signals</div>
                </div>
                
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {predictions.filter(p => p.direction === 'short').length}
                  </div>
                  <div className="text-sm text-red-700">Short Signals</div>
                </div>
              </div>
              
              <div className="mt-4 text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {predictions.length > 0 ? (predictions.reduce((acc, p) => acc + p.confidence, 0) / predictions.length).toFixed(1) : '0'}%
                </div>
                <div className="text-sm text-blue-700">Avg Confidence</div>
              </div>
            </div>
          </div>

          {/* Main Content - Prediction Cards */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Active Predictions ({predictions.length}/10)
              </h2>
              
              {predictions.length === 0 && (
                <div className="text-gray-500 text-sm">
                  Waiting for scanner to find signals...
                </div>
              )}
            </div>

            {/* Predictions Grid */}
            {predictions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {predictions.map((prediction) => (
                  <PredictionCard
                    key={prediction.id}
                    prediction={prediction}
                    onExpire={handlePredictionExpire}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Predictions</h3>
                <p className="text-gray-500">
                  The scanner is looking for profitable signals. Check back soon!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;