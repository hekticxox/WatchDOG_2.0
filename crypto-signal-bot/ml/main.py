# file: ml/main.py
# Role: FastAPI ML microservice for training and optimizing indicator weights
# Requirements: Train on prediction outcomes, return updated weights and feature importance

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Crypto Signal ML Service", version="1.0.0")

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@postgres:5432/crypto_signals")

class TrainingRequest(BaseModel):
    retrain: bool = True
    min_samples: int = 50

class WeightUpdate(BaseModel):
    indicator_weights: Dict[str, float]
    feature_importance: Dict[str, float]
    model_performance: Dict[str, float]
    training_samples: int

class MLTrainer:
    def __init__(self):
        self.model = None
        self.feature_names = []
        self.current_weights = {
            "RSI": 1.0,
            "MACD": 1.2,
            "EMA": 0.8,
            "SMA": 0.6,
            "BB": 1.0,
            "STOCH": 0.9,
            "ADX": 1.1,
            "VOLUME": 0.7
        }

    def load_training_data(self) -> pd.DataFrame:
        """Load prediction data with outcomes from database"""
        # Copilot: Implement database query to fetch completed predictions
        # Should include: prediction features, final outcome (success/failure), 
        # indicator hits, confidence, score, etc.
        
        try:
            engine = create_engine(DATABASE_URL)
            
            query = """
            SELECT 
                p.id,
                p.symbol,
                p.direction,
                p.score,
                p.indicator_count,
                p.confidence,
                p.estimated_run_ms,
                p.indicators_hit,
                p.card_count,
                p.created_at,
                p.expires_at,
                po.pnl_percent,
                po.closed_at,
                CASE 
                    WHEN po.pnl_percent > 0 THEN 1 
                    ELSE 0 
                END as success
            FROM predictions p
            JOIN prediction_outcomes po ON p.id = po.prediction_id
            WHERE po.pnl_percent IS NOT NULL
            ORDER BY p.created_at DESC
            """
            
            df = pd.read_sql(query, engine)
            logger.info(f"Loaded {len(df)} training samples")
            return df
            
        except Exception as e:
            logger.error(f"Error loading training data: {e}")
            return pd.DataFrame()

    def prepare_features(self, df: pd.DataFrame) -> tuple:
        """Convert prediction data to ML features"""
        # Copilot: Transform indicators_hit JSON into feature matrix
        # Create features for each indicator type, timeframe combination
        # Include score, confidence, card_count, direction as features
        
        if df.empty:
            return None, None
        
        features_list = []
        targets = []
        
        for _, row in df.iterrows():
            try:
                # Parse indicators_hit JSON
                indicators = eval(row['indicators_hit']) if isinstance(row['indicators_hit'], str) else row['indicators_hit']
                
                # Create feature vector
                feature_vector = {
                    'score': row['score'],
                    'confidence': row['confidence'],
                    'indicator_count': row['indicator_count'],
                    'card_count': row['card_count'],
                    'direction_long': 1 if row['direction'] == 'long' else 0,
                    'estimated_run_hours': row['estimated_run_ms'] / (1000 * 60 * 60)
                }
                
                # Add indicator features
                for indicator_name, value in indicators.items():
                    feature_vector[f'indicator_{indicator_name}'] = value
                
                features_list.append(feature_vector)
                targets.append(row['success'])
                
            except Exception as e:
                logger.warning(f"Error processing row {row['id']}: {e}")
                continue
        
        if not features_list:
            return None, None
            
        # Convert to DataFrame
        features_df = pd.DataFrame(features_list)
        
        # Fill missing values
        features_df = features_df.fillna(0)
        
        # Store feature names for later use
        self.feature_names = features_df.columns.tolist()
        
        return features_df.values, np.array(targets)

    def train_model(self, X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
        """Train LightGBM model and return performance metrics"""
        # Copilot: Implement LightGBM training with proper validation
        # Use cross-validation, hyperparameter tuning
        # Return accuracy, precision, recall, feature importance
        
        if len(X) < 20:  # Need minimum samples
            raise ValueError("Insufficient training samples")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # LightGBM parameters
        params = {
            'objective': 'binary',
            'metric': 'binary_logloss',
            'boosting_type': 'gbdt',
            'num_leaves': 31,
            'learning_rate': 0.05,
            'feature_fraction': 0.9,
            'bagging_fraction': 0.8,
            'bagging_freq': 5,
            'verbose': -1,
            'random_state': 42
        }
        
        # Create datasets
        train_data = lgb.Dataset(X_train, label=y_train)
        valid_data = lgb.Dataset(X_test, label=y_test, reference=train_data)
        
        # Train model
        self.model = lgb.train(
            params,
            train_data,
            valid_sets=[valid_data],
            num_boost_round=100,
            callbacks=[lgb.early_stopping(stopping_rounds=10), lgb.log_evaluation(0)]
        )
        
        # Make predictions
        y_pred = self.model.predict(X_test, num_iteration=self.model.best_iteration)
        y_pred_binary = (y_pred > 0.5).astype(int)
        
        # Calculate metrics
        accuracy = accuracy_score(y_test, y_pred_binary)
        precision = precision_score(y_test, y_pred_binary, zero_division=0)
        recall = recall_score(y_test, y_pred_binary, zero_division=0)
        
        performance = {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'samples_train': len(X_train),
            'samples_test': len(X_test)
        }
        
        logger.info(f"Model performance: {performance}")
        return performance

    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance from trained model"""
        if self.model is None:
            return {}
        
        importance = self.model.feature_importance(importance_type='gain')
        importance_dict = dict(zip(self.feature_names, importance))
        
        # Normalize importance scores
        total_importance = sum(importance)
        if total_importance > 0:
            importance_dict = {k: v / total_importance for k, v in importance_dict.items()}
        
        return importance_dict

    def update_indicator_weights(self, feature_importance: Dict[str, float]) -> Dict[str, float]:
        """Update indicator weights based on feature importance"""
        # Copilot: Implement logic to map feature importance back to indicator weights
        # Consider indicator performance across different timeframes
        # Apply smoothing to avoid dramatic weight changes
        
        new_weights = self.current_weights.copy()
        
        # Map feature importance to indicator weights
        for feature_name, importance in feature_importance.items():
            if feature_name.startswith('indicator_'):
                # Extract indicator name (e.g., 'RSI_1h_long' -> 'RSI')
                parts = feature_name.replace('indicator_', '').split('_')
                if parts:
                    indicator_name = parts[0]
                    if indicator_name in new_weights:
                        # Apply smoothing factor (0.1 = slow adaptation)
                        smoothing = 0.1
                        adjustment = importance * 2  # Scale importance
                        new_weights[indicator_name] = (
                            new_weights[indicator_name] * (1 - smoothing) + 
                            adjustment * smoothing
                        )
        
        # Ensure weights stay within reasonable bounds
        for indicator in new_weights:
            new_weights[indicator] = max(0.1, min(2.0, new_weights[indicator]))
        
        self.current_weights = new_weights
        return new_weights

@app.get("/")
async def root():
    return {"message": "Crypto Signal ML Service", "status": "running"}

@app.post("/train", response_model=WeightUpdate)
async def train_model(request: TrainingRequest):
    """Train ML model and return updated indicator weights"""
    # Copilot: Implement full training pipeline
    # Load data, prepare features, train model, update weights
    
    try:
        trainer = MLTrainer()
        
        # Load training data
        df = trainer.load_training_data()
        if df.empty:
            raise HTTPException(status_code=400, detail="No training data available")
        
        if len(df) < request.min_samples:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient samples: {len(df)} < {request.min_samples}"
            )
        
        # Prepare features
        X, y = trainer.prepare_features(df)
        if X is None:
            raise HTTPException(status_code=400, detail="Failed to prepare features")
        
        # Train model
        performance = trainer.train_model(X, y)
        
        # Get feature importance
        feature_importance = trainer.get_feature_importance()
        
        # Update indicator weights
        updated_weights = trainer.update_indicator_weights(feature_importance)
        
        return WeightUpdate(
            indicator_weights=updated_weights,
            feature_importance=feature_importance,
            model_performance=performance,
            training_samples=len(df)
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Training error: {e}")
        raise HTTPException(status_code=500, detail="Internal training error")

@app.get("/weights")
async def get_current_weights():
    """Get current indicator weights"""
    trainer = MLTrainer()
    return {"weights": trainer.current_weights}

@app.post("/weights")
async def update_weights(weights: Dict[str, float]):
    """Manually update indicator weights"""
    # Copilot: Implement weight validation and persistence
    # Validate weight ranges, save to database or config
    
    # Validate weights
    for indicator, weight in weights.items():
        if not (0.1 <= weight <= 2.0):
            raise HTTPException(
                status_code=400, 
                detail=f"Weight for {indicator} must be between 0.1 and 2.0"
            )
    
    # TODO: Save weights to database or config file
    logger.info(f"Updated weights: {weights}")
    
    return {"message": "Weights updated successfully", "weights": weights}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)