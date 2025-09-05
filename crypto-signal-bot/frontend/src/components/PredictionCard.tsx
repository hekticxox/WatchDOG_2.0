// file: frontend/src/components/PredictionCard.tsx
// Role: Show coin name, direction (long/short), estimated timeframe, small color-coded indicator legend, indicator count, confidence %, and countdown timer.
// Requirements:
//  - Clean colorful UI, Tailwind classes
//  - Small colored chips for indicator counts (green positive, red negative, amber neutral)
//  - shows a mini sparkline for the symbol (use lightweight svg)

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, Target, Zap } from 'lucide-react';

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

interface PredictionCardProps {
  prediction: Prediction;
  onExpire?: (id: string) => void;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expires = new Date(prediction.expiresAt).getTime();
      const remaining = Math.max(0, expires - now);
      setTimeLeft(remaining);
      
      if (remaining === 0 && onExpire) {
        onExpire(prediction.id);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [prediction.expiresAt, prediction.id, onExpire]);

  const formatTimeLeft = (ms: number): string => {
    const minutes = Math.floor(ms / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'text-green-500';
    if (confidence >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getIndicatorColor = (count: number): string => {
    if (count >= 8) return 'bg-green-500 text-white';
    if (count >= 4) return 'bg-yellow-500 text-black';
    return 'bg-gray-500 text-white';
  };

  const getCardCountColor = (count: number): string => {
    if (count > 5) return 'bg-green-100 text-green-800 border-green-300';
    if (count < -5) return 'bg-red-100 text-red-800 border-red-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const directionIcon = prediction.direction === 'long' ? TrendingUp : TrendingDown;
  const directionColor = prediction.direction === 'long' ? 'text-green-500' : 'text-red-500';
  const borderColor = prediction.direction === 'long' ? 'border-green-200' : 'border-red-200';
  const bgColor = prediction.direction === 'long' ? 'bg-green-50' : 'bg-red-50';

  const DirectionIcon = directionIcon;

  return (
    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} p-4 shadow-lg hover:shadow-xl transition-all duration-300`}>
      {/* Header with Symbol and Direction */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-bold text-gray-900">{prediction.symbol}</h3>
          <div className={`flex items-center space-x-1 ${directionColor}`}>
            <DirectionIcon size={20} />
            <span className="font-semibold uppercase text-sm">{prediction.direction}</span>
          </div>
        </div>
        
        {/* Card Count Badge */}
        <div className={`px-2 py-1 rounded-full text-xs font-semibold border ${getCardCountColor(prediction.cardCount)}`}>
          {prediction.cardCount > 0 ? `+${prediction.cardCount}` : prediction.cardCount}
        </div>
      </div>

      {/* Confidence Circle and Stats */}
      <div className="flex items-center justify-between mb-3">
        {/* Confidence Circle */}
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              className="text-gray-200"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - prediction.confidence / 100)}`}
              className={getConfidenceColor(prediction.confidence)}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-bold ${getConfidenceColor(prediction.confidence)}`}>
              {Math.round(prediction.confidence)}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 ml-4 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 text-gray-600">
              <Zap size={14} />
              <span className="text-xs">Indicators</span>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${getIndicatorColor(prediction.indicatorCount)}`}>
              {prediction.indicatorCount}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 text-gray-600">
              <Target size={14} />
              <span className="text-xs">Score</span>
            </div>
            <span className="text-xs font-semibold text-gray-900">
              {prediction.score.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex items-center justify-between bg-white rounded-lg p-2 border">
        <div className="flex items-center space-x-2 text-gray-600">
          <Clock size={16} />
          <span className="text-sm font-medium">Time Left</span>
        </div>
        <div className="text-lg font-mono font-bold text-gray-900">
          {formatTimeLeft(timeLeft)}
        </div>
      </div>

      {/* Indicator Breakdown (small text, color-coded) */}
      <div className="mt-3 pt-2 border-t border-gray-200">
        <div className="flex flex-wrap gap-1">
          {Object.entries(prediction.indicatorsHit).slice(0, 6).map(([indicator, value]) => (
            <span
              key={indicator}
              className={`px-2 py-1 rounded text-xs font-medium ${
                value > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
              title={`${indicator}: ${value.toFixed(2)}`}
            >
              {indicator.split('_')[0]}
            </span>
          ))}
          {Object.keys(prediction.indicatorsHit).length > 6 && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
              +{Object.keys(prediction.indicatorsHit).length - 6} more
            </span>
          )}
        </div>
      </div>

      {/* Mini Sparkline Placeholder */}
      <div className="mt-2 h-8 bg-gray-100 rounded flex items-center justify-center">
        <span className="text-xs text-gray-500">Chart Placeholder</span>
        {/* Copilot: Implement mini sparkline chart here using SVG or canvas */}
      </div>

      {/* Final Outcome (if available) */}
      {prediction.finalOutcome && (
        <div className={`mt-2 p-2 rounded text-sm ${
          prediction.finalOutcome.pnlPercent > 0 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          <span className="font-semibold">
            {prediction.finalOutcome.pnlPercent > 0 ? '?' : '?'} 
            {prediction.finalOutcome.pnlPercent.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default PredictionCard;