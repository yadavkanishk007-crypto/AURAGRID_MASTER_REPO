import sys
import os
import json
import math
import random
from typing import Dict, List, Any

# Ensure parent directory is in PYTHONPATH so app imports work
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.core.config import settings

def generate_synthetic_history(node_name: str, days: int = 30) -> List[float]:
    """
    Generates 30 days of hourly historical load telemetry (720 steps)
    simulating realistic grid load behaviors.
    """
    history = []
    
    # Get node properties
    node_info = next((n for n in settings.nodes if n.name == node_name), None)
    base = node_info.initial_volume * 0.1 if node_info else 50.0
    amplitude = node_info.amplitude if node_info else 15.0
    
    random.seed(hash(node_name))
    
    for step in range(days * 24):
        hour = step % 24
        day_of_week = (step // 24) % 7
        
        # 1. Daily cycle component (morning and evening peaks)
        cycle_24 = math.sin(2 * math.pi * (hour - 6) / 24)
        cycle_12 = 0.4 * math.sin(4 * math.pi * (hour - 9) / 24)
        
        # 2. Weekly cycle component
        weekly_factor = 1.0
        if day_of_week >= 5: # Saturday/Sunday
            if "Industrial" in node_name or (node_info and node_info.voltage_class >= 400):
                weekly_factor = 0.70  # office parks/heavy plants shutdown
            else:
                weekly_factor = 1.05  # slightly higher residential load
        
        # 3. Fluctuation and noise
        noise = random.normalvariate(0, 3.0)
        
        load = (base + amplitude * (cycle_24 + cycle_12)) * weekly_factor + noise
        history.append(max(1.0, round(load, 2)))
        
    return history


def train_fourier_arima(history: List[float]) -> Dict[str, float]:
    """
    Fits a Fourier seasonal cycle model representing daily consumer schedules.
    Uses analytical projection (Fourier coefficients) in pure Python.
    """
    n = len(history)
    beta_0 = sum(history) / n
    
    # Harmonics
    a1, b1, a2, b2 = 0.0, 0.0, 0.0, 0.0
    
    for t, y in enumerate(history):
        hour = t % 24
        # 1st harmonic (24h period)
        a1 += y * math.sin(2 * math.pi * hour / 24)
        b1 += y * math.cos(2 * math.pi * hour / 24)
        # 2nd harmonic (12h period)
        a2 += y * math.sin(4 * math.pi * hour / 24)
        b2 += y * math.cos(4 * math.pi * hour / 24)
        
    # Scale coefficients
    a1 = (2.0 / n) * a1
    b1 = (2.0 / n) * b1
    a2 = (2.0 / n) * a2
    b2 = (2.0 / n) * b2
    
    return {
        "beta_0": round(beta_0, 4),
        "a1": round(a1, 4),
        "b1": round(b1, 4),
        "a2": round(a2, 4),
        "b2": round(b2, 4)
    }


def train_autoregressive_lstm(history: List[float]) -> Dict[str, Any]:
    """
    Fits a 12-lag autoregressive model representing LSTM sequence projections.
    Uses a standard Gradient Descent optimization loop in pure Python.
    """
    # Lag size k = 12
    k = 12
    weights = [0.05] * k
    intercept = sum(history) / len(history)
    
    # Scale learning rate and epochs
    lr = 0.00005
    epochs = 50 # Reduced from 150 to make training extremely fast for all 270+ nodes
    
    # Create sliding sequence windows
    samples = []
    for i in range(k, len(history)):
        x = history[i-k:i]
        y = history[i]
        samples.append((x, y))
        
    # Run gradient descent training loop
    for epoch in range(epochs):
        for x, y in samples:
            pred = intercept + sum(w * xv for w, xv in zip(weights, x))
            error = pred - y
            
            # Update parameters
            intercept -= lr * error
            for d in range(k):
                weights[d] -= lr * error * x[d]
                
    return {
        "intercept": round(intercept, 4),
        "weights": [round(w, 4) for w in weights]
    }


def main():
    print(f"Initializing Dynamic Model Training Pipeline for {settings.city_name}...")
    weights_db = {}
    
    nodes = [node.name for node in settings.nodes]
    print(f"Total nodes to train: {len(nodes)}")
    
    for idx, node in enumerate(nodes):
        if (idx + 1) % 50 == 0 or idx == 0 or idx == len(nodes) - 1:
            print(f" -> Training node {idx + 1}/{len(nodes)}: {node}")
        
        # 1. Generate historical records
        history = generate_synthetic_history(node)
        
        # 2. Fit Fourier model
        arima_params = train_fourier_arima(history)
        
        # 3. Fit Autoregressive model
        lstm_params = train_autoregressive_lstm(history)
        
        weights_db[node] = {
            "arima": arima_params,
            "lstm": lstm_params
        }
        
    # Output to app/core/grid_weights.json
    output_dir = os.path.join(os.path.dirname(__file__), "app", "core")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "grid_weights.json")
    
    with open(output_path, "w") as f:
        json.dump(weights_db, f, indent=2)
        
    print(f"\n=======================================================")
    print(f"Model training SUCCESS. {len(nodes)} node parameters saved to: {output_path}")
    print(f"=======================================================")


if __name__ == "__main__":
    main()
