import asyncio
import datetime
import json
import logging
import math
import os
import random
import threading
from typing import Dict, List, Tuple, Any, Callable, Set, Optional

from app.core.config import settings

logger = logging.getLogger("AuraGrid.Engine")

# --- Production Weight Loader ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_WEIGHTS = {}

def train_city_weights_inline(city_name_clean: str, weights_path: str):
    """
    Runs a fast training pipeline for the selected city and saves parameters to a JSON file.
    """
    logger.info(f"Initiating inline Wavelet Approx/Detail model training pipeline for city: {city_name_clean.upper()}...")
    weights_db = {}
    
    try:
        from train_models import generate_synthetic_history, train_wavelet_approx, train_wavelet_detail
        for node in settings.nodes:
            history = generate_synthetic_history(node.name)
            approx_params = train_wavelet_approx(history)
            detail_params = train_wavelet_detail(history)
            weights_db[node.name] = {
                "wavelet_approx": approx_params,
                "wavelet_detail": detail_params
            }
        
        with open(weights_path, "w") as f:
            json.dump(weights_db, f, indent=2)
        logger.info(f"Inline model training SUCCESS. Node weights saved to: {weights_path}")
    except Exception as e:
        logger.error(f"Failed inline model training for {city_name_clean}: {str(e)}")

def load_weights_for_city(city_name_raw: str):
    """
    Loads city-specific weights. Triggers training if weights are missing.
    """
    global MODEL_WEIGHTS
    city_clean = city_name_raw.lower().split()[0] # e.g. "pune" from "pune" or "Pune Grid..."
    weights_path = os.path.join(BASE_DIR, f"grid_weights_{city_clean}.json")
    
    if city_clean == "bengaluru":
        weights_path = os.path.join(BASE_DIR, "grid_weights.json")
        
    if not os.path.exists(weights_path):
        train_city_weights_inline(city_clean, weights_path)
        
    if os.path.exists(weights_path):
        try:
            with open(weights_path, "r") as f:
                MODEL_WEIGHTS = json.load(f)
            logger.info(f"Loaded trained grid model weights for {city_clean} from: {weights_path}")
        except Exception as e:
            logger.error(f"Failed to load trained model weights for {city_clean}: {str(e)}")
            MODEL_WEIGHTS = {}
    else:
        logger.warning(f"No weights file found for {city_clean}. Running default baseline cycles.")
        MODEL_WEIGHTS = {}

# Initialize with initial city
load_weights_for_city(os.getenv("GRID_CITY_NAME", "Bengaluru"))



# --- Neuro-Evolutionary Wavelet Forecaster Subsystems ---

def stationarity_test(history: List[float]) -> Tuple[float, float, float, bool]:
    """
    Performs Augmented Dickey-Fuller (ADF) and Phillips-Perron (PP) mimic bounds testing.
    Returns: (p_value, t_adf, t_pp, is_stationary)
    """
    N = len(history)
    if N < 5:
        return 0.5, 0.0, 0.0, False

    # Differenced series: Y_t = X_t - X_{t-1}
    Y = [history[i] - history[i-1] for i in range(1, N)]
    # Lagged levels: Z_t = X_{t-1}
    Z = [history[i-1] for i in range(1, N)]
    
    M = len(Y)
    
    # Simple linear regression: Y_t = c + gamma * Z_t + error
    mean_Z = sum(Z) / M
    mean_Y = sum(Y) / M
    
    var_Z = sum((z - mean_Z) ** 2 for z in Z)
    if var_Z < 1e-9:
        return 1.0, 0.0, 0.0, False
        
    cov_ZY = sum((Z[i] - mean_Z) * (Y[i] - mean_Y) for i in range(M))
    
    gamma = cov_ZY / var_Z
    c = mean_Y - gamma * mean_Z
    
    residuals = [Y[i] - (c + gamma * Z[i]) for i in range(M)]
    
    df = M - 2
    if df <= 0:
        return 1.0, 0.0, 0.0, False
        
    rss = sum(e ** 2 for e in residuals)
    s2 = rss / df
    
    se_gamma = math.sqrt(s2 / var_Z) if s2 > 0 else 1e-9
    t_adf = gamma / se_gamma
    
    # Phillips-Perron lag-1 Newey-West correction
    gamma_0 = sum(e ** 2 for e in residuals) / M
    gamma_1 = sum(residuals[i] * residuals[i-1] for i in range(1, M)) / M
    
    sigma2_pp = gamma_0 + gamma_1
    if sigma2_pp <= 0:
        sigma2_pp = max(1e-9, gamma_0)
        
    se_pp = math.sqrt(sigma2_pp / var_Z)
    t_pp = gamma / se_pp
    
    # Convert t-statistic to p-value using Dickey-Fuller critical values (with constant)
    def t_to_p(t):
        if t <= -3.43:
            return max(1e-5, 0.01 * math.exp(t - (-3.43)))
        elif t <= -2.86:
            return 0.01 + 0.04 * (t - (-3.43)) / (-2.86 - (-3.43))
        elif t <= -2.57:
            return 0.05 + 0.05 * (t - (-2.86)) / (-2.57 - (-2.86))
        elif t <= 0.0:
            return 0.10 + 0.90 * (t - (-2.57)) / (0.0 - (-2.57))
        else:
            return min(1.0, 1.0 - 0.9 * math.exp(-t))
            
    p_adf = t_to_p(t_adf)
    p_pp = t_to_p(t_pp)
    
    p_value = min(p_adf, p_pp)
    is_stationary = p_value < 0.05
    
    return p_value, t_adf, t_pp, is_stationary


def wavelet_decompose(history: List[float]) -> Tuple[List[float], List[float]]:
    """
    Decomposes the history series X_t into:
    - Approximation At: Low-pass (rolling average of window 4)
    - Detail D_t: High-pass (X_t - A_t)
    """
    N = len(history)
    A = []
    for i in range(N):
        window = history[max(0, i-3):i+1]
        A.append(sum(window) / len(window))
        
    D = [history[i] - A[i] for i in range(N)]
    return A, D


def forecast_approximation(A: List[float], horizon: int, base_hour: int, amplitude: float = 30.0) -> List[float]:
    N = len(A)
    slope = (A[-1] - A[0]) / (N - 1) if N > 1 else 0.0
    
    A_pred = []
    for h in range(1, horizon + 1):
        t = (base_hour + h) % 24
        cycle_24 = math.sin(2 * math.pi * (t - 6) / 24)
        cycle_12 = 0.4 * math.sin(4 * math.pi * (t - 9) / 24)
        diurnal_effect = amplitude * (cycle_24 + cycle_12)
        
        val = A[-1] + slope * h + diurnal_effect
        A_pred.append(val)
    return A_pred


def fit_ar2_on_detail(D: List[float]) -> Tuple[float, float]:
    """
    Fits an AR(2) model on the detail series D_t using OLS regression:
    D_t = phi_1 * D_{t-1} + phi_2 * D_{t-2}
    """
    N = len(D)
    if N < 5:
        return 0.5, 0.0
        
    a = sum(D[i-1]**2 for i in range(2, N))
    b = sum(D[i-1] * D[i-2] for i in range(2, N))
    c = sum(D[i-2]**2 for i in range(2, N))
    
    d = sum(D[i-1] * D[i] for i in range(2, N))
    e = sum(D[i-2] * D[i] for i in range(2, N))
    
    det = a * c - b * b
    if abs(det) < 1e-9:
        return 0.5, 0.0
        
    phi_1 = (c * d - b * e) / det
    phi_2 = (a * e - b * d) / det
    
    phi_1 = max(-1.5, min(1.5, phi_1))
    phi_2 = max(-0.9, min(0.9, phi_2))
    
    return phi_1, phi_2


def forecast_detail_ar2(D: List[float], horizon: int, phi_1: float, phi_2: float) -> List[float]:
    D_pred = []
    D_padded = list(D)
    if len(D_padded) < 2:
        D_padded = [0.0, 0.0] + D_padded
        
    for h in range(1, horizon + 1):
        prev1 = D_pred[-1] if len(D_pred) >= 1 else D_padded[-1]
        prev2 = D_pred[-2] if len(D_pred) >= 2 else (D_padded[-1] if len(D_pred) >= 1 else D_padded[-2])
        
        val = phi_1 * prev1 + phi_2 * prev2
        D_pred.append(val)
    return D_pred


def run_ga_mutation_loop(
    history: List[float],
    A_pred: List[float],
    D_pred: List[float],
    horizon: int,
    max_capacity: float,
    base_hour: int = 0,
    amplitude: float = 30.0
) -> Tuple[List[float], float, float]:
    """
    Executes a Multi-Objective Genetic Algorithm to optimize detail adjustments delta.
    Objectives:
    - Objective A: Minimize RMSE on a historical validation window
    - Objective B: Minimize Anomaly Detection Latency (detecting breach >= 0.85 * max_capacity)
    Returns: (best_delta, rmse, latency)
    """
    N = len(history)
    H = horizon
    
    val_size = min(H, max(1, N - 3))
    if val_size <= 0:
        val_size = 1
        
    train_hist = history[:-val_size] if N > val_size else history
    val_actual = history[-val_size:] if N > val_size else history
    
    train_A, train_D = wavelet_decompose(train_hist)
    
    amp = amplitude
    
    val_base_hour = (base_hour - val_size) % 24
    train_A_pred = []
    for h in range(1, val_size + 1):
        t = (val_base_hour + h) % 24
        cycle_24 = math.sin(2 * math.pi * (t - 6) / 24)
        cycle_12 = 0.4 * math.sin(4 * math.pi * (t - 9) / 24)
        diurnal_effect = amp * (cycle_24 + cycle_12)
        slope = (train_A[-1] - train_A[0]) / (len(train_A) - 1) if len(train_A) > 1 else 0.0
        train_A_pred.append(train_A[-1] + slope * h + diurnal_effect)
        
    phi_1, phi_2 = fit_ar2_on_detail(train_D)
    train_D_pred = forecast_detail_ar2(train_D, val_size, phi_1, phi_2)
    
    pop_size = 30
    generations = 10
    mutation_rate = 0.2
    
    population = []
    for _ in range(pop_size):
        ind = [random.uniform(-10.0, 10.0) for _ in range(H)]
        population.append(ind)
        
    def evaluate_individual(ind: List[float]) -> Tuple[float, float]:
        val_delta = ind[:val_size]
        if len(val_delta) < val_size:
            val_delta = val_delta + [0.0] * (val_size - len(val_delta))
            
        val_pred = []
        for i in range(val_size):
            p = train_A_pred[i] + train_D_pred[i] + val_delta[i]
            val_pred.append(max(5.0, p))
            
        rmse = math.sqrt(sum((val_actual[i] - val_pred[i])**2 for i in range(val_size)) / val_size)
        
        # Threshold scaled for load levels (approximately 15% of max volume capacity)
        threshold = 0.85 * (max_capacity * 0.15)
        latency = H + 1
        for h in range(H):
            p = A_pred[h] + D_pred[h] + ind[h]
            p = max(5.0, p)
            if p >= threshold:
                latency = h + 1
                break
                
        if latency == H + 1:
            smoothness = sum(abs(d) for d in ind) / H
            latency = float(H + 1 + smoothness)
            
        return rmse, float(latency)

    for gen in range(generations):
        scores = [evaluate_individual(ind) for ind in population]
        
        rmses = [s[0] for s in scores]
        latencies = [s[1] for s in scores]
        
        min_rmse, max_rmse = min(rmses), max(rmses)
        min_lat, max_lat = min(latencies), max(latencies)
        
        range_rmse = (max_rmse - min_rmse) if max_rmse > min_rmse else 1.0
        range_lat = (max_lat - min_lat) if max_lat > min_lat else 1.0
        
        next_pop = []
        for _ in range(pop_size):
            t_candidates = random.sample(list(zip(population, scores)), 3)
            w = random.uniform(0.1, 0.9)
            
            best_cand = None
            best_fit = float('inf')
            for ind, (rmse, lat) in t_candidates:
                norm_rmse = (rmse - min_rmse) / range_rmse
                norm_lat = (lat - min_lat) / range_lat
                fit = w * norm_rmse + (1 - w) * norm_lat
                if fit < best_fit:
                    best_fit = fit
                    best_cand = ind
            next_pop.append(list(best_cand))
            
        for i in range(0, pop_size, 2):
            if i + 1 < pop_size and random.random() < 0.8:
                c1 = []
                c2 = []
                for j in range(H):
                    beta = random.random()
                    v1 = beta * next_pop[i][j] + (1 - beta) * next_pop[i+1][j]
                    v2 = (1 - beta) * next_pop[i][j] + beta * next_pop[i+1][j]
                    c1.append(max(-15.0, min(15.0, v1)))
                    c2.append(max(-15.0, min(15.0, v2)))
                next_pop[i] = c1
                next_pop[i+1] = c2
                
        for i in range(pop_size):
            if random.random() < mutation_rate:
                for j in range(H):
                    if random.random() < 0.3:
                        next_pop[i][j] += random.gauss(0.0, 2.0)
                        next_pop[i][j] = max(-15.0, min(15.0, next_pop[i][j]))
                        
        population = next_pop

    scores = [evaluate_individual(ind) for ind in population]
    rmses = [s[0] for s in scores]
    latencies = [s[1] for s in scores]
    
    min_rmse, max_rmse = min(rmses), max(rmses)
    min_lat, max_lat = min(latencies), max(latencies)
    
    range_rmse = (max_rmse - min_rmse) if max_rmse > min_rmse else 1.0
    range_lat = (max_lat - min_lat) if max_lat > min_lat else 1.0
    
    best_ind = population[0]
    best_dist = float('inf')
    best_rmse, best_latency = scores[0][0], scores[0][1]
    
    for idx, ind in enumerate(population):
        r, l = scores[idx]
        norm_r = (r - min_rmse) / range_rmse
        norm_l = (l - min_lat) / range_lat
        dist = math.sqrt(norm_r**2 + norm_l**2)
        if dist < best_dist:
            best_dist = dist
            best_ind = ind
            best_rmse = r
            best_latency = l
            
    return best_ind, best_rmse, best_latency, scores


def sanitize_history(history: List[float], default_val: float = 50.0) -> List[float]:
    out = []
    for x in history:
        if x is None or math.isnan(x) or math.isinf(x):
            out.append(default_val)
        else:
            out.append(x)
    return out


def clean_float(val: Any, default_val: float = 0.0) -> float:
    if val is None or math.isnan(val) or math.isinf(val):
        return default_val
    try:
        return float(val)
    except Exception:
        return default_val


def neuro_evolutionary_wavelet_forecast(
    node_name: str,
    history: List[float],
    horizon: int,
    base_hour: int
) -> Dict[str, Any]:
    """
    Executes the complete stationarity switch, wavelet decomposition, 
    and forecasting loop for a node.
    """
    node_info = next((n for n in settings.nodes if n.name == node_name), None)
    max_capacity = node_info.max_capacity if node_info else 1000.0
    amplitude = node_info.amplitude if node_info else 30.0
    
    if not history:
        history = [50.0] * 12
    history = sanitize_history(history, default_val=max_capacity * 0.1)
    
    p_value, t_adf, t_pp, is_stationary = stationarity_test(history)
    A, D = wavelet_decompose(history)
    
    # Check if pre-trained weights are available for this node
    weights = MODEL_WEIGHTS.get(node_name)
    
    A_pred = []
    D_pred = []
    
    if weights and "wavelet_approx" in weights:
        approx = weights["wavelet_approx"]
        for h in range(1, horizon + 1):
            t = (base_hour + h) % 24
            val = (
                approx["beta_0"] +
                approx["a1"] * math.sin(2 * math.pi * t / 24) +
                approx["b1"] * math.cos(2 * math.pi * t / 24) +
                approx["a2"] * math.sin(4 * math.pi * t / 24) +
                approx["b2"] * math.cos(4 * math.pi * t / 24)
            )
            A_pred.append(round(clean_float(val, max_capacity * 0.1), 2))
    else:
        A_pred = forecast_approximation(A, horizon, base_hour, amplitude)
        
    if weights and "wavelet_detail" in weights:
        detail_params = weights["wavelet_detail"]
        intercept = detail_params["intercept"]
        ar_weights = detail_params["weights"]
        
        last_12_D = list(D)
        if len(last_12_D) < 12:
            last_12_D = [0.0] * (12 - len(last_12_D)) + last_12_D
        else:
            last_12_D = last_12_D[-12:]
            
        for h in range(1, horizon + 1):
            val = intercept + sum(w * d for w, d in zip(ar_weights, last_12_D))
            D_pred.append(clean_float(val, 0.0))
            last_12_D = last_12_D[1:] + [val]
    else:
        phi_1, phi_2 = fit_ar2_on_detail(D)
        D_pred = forecast_detail_ar2(D, horizon, phi_1, phi_2)
    
    mode_activated = "WAVELET_REGRESSION"
    delta = [0.0] * horizon
    rmse = 0.0
    latency = float(horizon + 1)
    final_scores = []
    
    if not is_stationary:
        mode_activated = "NEURO_EVOLUTIONARY_GA"
        delta, rmse, latency, final_scores = run_ga_mutation_loop(history, A_pred, D_pred, horizon, max_capacity, base_hour, amplitude)
        
    predicted_load = []
    for h in range(horizon):
        val = A_pred[h] + D_pred[h] + delta[h]
        val = clean_float(val, max_capacity * 0.1)
        predicted_load.append(max(5.0, round(val, 2)))
        
    wavelet_approx_pred = [round(clean_float(val, max_capacity * 0.1), 2) for val in A_pred]
    wavelet_detail_pred = [round(clean_float(D_pred[h] + delta[h], 0.0), 2) for h in range(horizon)]
    
    return {
        "mode_activated": mode_activated,
        "stationarity_tests": {
            "p_value": round(clean_float(p_value, 0.5), 4),
            "t_statistic_adf": round(clean_float(t_adf, 0.0), 4),
            "t_statistic_pp": round(clean_float(t_pp, 0.0), 4),
            "stationary": bool(is_stationary)
        },
        "multi_objective_optimization": {
            "objective_a_rmse": round(clean_float(rmse, 0.0), 4),
            "objective_b_latency": round(clean_float(latency, 0.0), 2),
            "pareto_points": [{"rmse": round(clean_float(s[0], 0.0), 4), "latency": round(clean_float(s[1], 0.0), 2)} for s in final_scores]
        },
        "wavelet_approx_predictions": wavelet_approx_pred,
        "wavelet_detail_predictions": wavelet_detail_pred,
        "predicted_load_vectors": predicted_load
    }


def wavelet_approx_forecast(node_name: str, base_hour: int, horizon: int) -> float:
    """
    Wrapper mapping the new Wavelet Forecaster's approximation (low-pass) component.
    """
    history = [50.0] * 12
    for city_id in telemetry_store.load_histories:
        if node_name in telemetry_store.load_histories[city_id]:
            history = telemetry_store.load_histories[city_id][node_name]
            break
            
    res = neuro_evolutionary_wavelet_forecast(node_name, history, horizon + 1, base_hour)
    return res["wavelet_approx_predictions"][-1]


def wavelet_detail_forecast(node_name: str, history: List[float], horizon: int) -> float:
    """
    Wrapper mapping the new Wavelet Forecaster's detail (high-pass) component.
    """
    from datetime import datetime, timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    base_hour = datetime.now(ist_tz).hour
    
    res = neuro_evolutionary_wavelet_forecast(node_name, history, horizon + 1, base_hour)
    return res["wavelet_detail_predictions"][-1]


# --- Concurrency & Mass-Balance Simulators ---

async def simulate_grid_dynamics(
    initial_volumes: Dict[str, float],
    historical_loads: Dict[str, List[float]],
    connections: Dict[str, Dict[str, float]],
    capacities: Dict[str, Dict[str, float]],
    forecast_horizon: int,
    base_hour: int,
    city_id: str = "bengaluru"
) -> Dict[str, Any]:
    """
    Runs step-by-step forecasting and mass-balance simulation over the forecast horizon.
    Optimized to run synchronously to avoid ThreadPoolExecutor overhead for hundreds of nodes.
    """
    nodes = list(initial_volumes.keys())
    current_v = {k: v for k, v in initial_volumes.items()}
    active_connections = {
        src: {tgt: val for tgt, val in targets.items()}
        for src, targets in connections.items()
    }
    
    volume_history = {node: [current_v[node]] for node in nodes}
    load_history = {node: [] for node in nodes}
    node_statuses = {node: "NORMAL" for node in nodes}
    isolated_nodes = []
    cascade_triggered = False
    
    for step in range(1, forecast_horizon + 1):
        step_loads = {}
        
        # Calculate Neuro-Evolutionary Wavelet predictions for all nodes
        for node in nodes:
            hist = historical_loads.get(node, [])
            if load_history[node]:
                hist = hist + [load_history[node][-1]]
                
            res = neuro_evolutionary_wavelet_forecast(node, hist, step, base_hour)
            detail_val = res["wavelet_detail_predictions"][-1]
            approx_val = res["wavelet_approx_predictions"][-1]
            combined_val = res["predicted_load_vectors"][-1]
            
            step_loads[node] = {
                "wavelet_detail": detail_val,
                "wavelet_approx": approx_val,
                "wavelet_combined": combined_val
            }
            load_history[node].append(ensemble_val)
            
        new_v = {}
        for i in nodes:
            if node_statuses[i] == "ISOLATED":
                new_v[i] = current_v[i] - step_loads[i]["ensemble"]
            else:
                # Add nominal generation for generation hubs (volts >= 220, e.g. 400kV)
                # Let's check the node config
                city_config = settings.all_cities.get(city_id.lower())
                node_info = next((n for n in city_config.nodes if n.name == i), None) if city_config else None
                generation = 0.0
                if node_info and node_info.voltage_class >= 400:
                    generation = 200.0
                elif node_info and node_info.voltage_class >= 220:
                    generation = 80.0
                    
                inlet = sum(
                    active_connections.get(j, {}).get(i, 0.0) * current_v[j]
                    for j in nodes if j != i
                )
                outlet = sum(
                    active_connections.get(i, {}).get(j, 0.0) * current_v[i]
                    for j in nodes if j != i
                )
                new_v[i] = current_v[i] + (inlet - outlet - step_loads[i]["ensemble"] + generation)
                
            new_v[i] = max(0.0, round(new_v[i], 2))
            
        for i in nodes:
            if node_statuses[i] == "ISOLATED":
                volume_history[i].append(new_v[i])
                continue
                
            limits = capacities.get(i, {"min": 20.0, "max": 1000.0})
            v_val = new_v[i]
            
            if v_val < limits["min"] or v_val > limits["max"]:
                node_statuses[i] = "ISOLATED"
                cascade_triggered = True
                isolated_nodes.append(i)
                
                # Cut connections
                for j in nodes:
                    if i in active_connections:
                        active_connections[i][j] = 0.0
                    if j in active_connections:
                        active_connections[j][i] = 0.0
            
            volume_history[i].append(new_v[i])
            current_v[i] = new_v[i]
            
    results = {}
    for node in nodes:
        if forecast_horizon == 0:
            results[node] = {
                "wavelet_detail_prediction": 0.0,
                "wavelet_approx_prediction": 0.0,
                "wavelet_combined_prediction": 0.0,
                "projected_volume": current_v[node],
                "status": "NORMAL"
            }
        else:
            results[node] = {
                "wavelet_detail_prediction": step_loads[node]["wavelet_detail"],
                "wavelet_approx_prediction": step_loads[node]["wavelet_approx"],
                "wavelet_combined_prediction": step_loads[node]["wavelet_combined"],
                "projected_volume": current_v[node],
                "status": "ISOLATED" if node in isolated_nodes else node_statuses[node]
            }

    return {
        "forecast_horizon": forecast_horizon,
        "results": results,
        "cascade_triggered": cascade_triggered,
        "isolated_nodes": isolated_nodes,
        "volume_history": volume_history,
        "load_history": load_history
    }


# --- Production-Grade Telemetry Store ---

class TelemetryStore:
    def __init__(self):
        self.lock = threading.Lock()
        self.listeners: Set[Callable[[str, Dict[str, Any]], None]] = set()
        self.reset_to_defaults(sync_db=False)

    def reset_to_defaults(self, sync_db: bool = True, target_city_id: Optional[str] = None):
        with self.lock:
            cities_to_reset = [target_city_id] if target_city_id else list(settings.all_cities.keys())
            
            if not hasattr(self, 'volumes'):
                self.volumes = {}
                self.capacities = {}
                self.connections = {}
                self.load_histories = {}
                self.statuses = {}
                self.cascade_triggered = {}
                self.isolated_nodes = {}
                self.volume_log = {}
                self.load_log = {}
                
            for city_id in cities_to_reset:
                city_config = settings.all_cities.get(city_id)
                if not city_config:
                    continue
                    
                self.volumes[city_id] = {node.name: node.initial_volume for node in city_config.nodes}
                self.capacities[city_id] = {
                    node.name: {"min": node.min_capacity, "max": node.max_capacity}
                    for node in city_config.nodes
                }
                self.connections[city_id] = {node.name: {n2.name: 0.0 for n2 in city_config.nodes} for node in city_config.nodes}
                for conn in city_config.connections:
                    if conn.source in self.connections[city_id] and conn.target in self.connections[city_id][conn.source]:
                        self.connections[city_id][conn.source][conn.target] = conn.efficiency
                        
                self.load_histories[city_id] = {node.name: [node.initial_volume * 0.1] * 12 for node in city_config.nodes}
                self.statuses[city_id] = {node.name: "NORMAL" for node in city_config.nodes}
                self.cascade_triggered[city_id] = False
                self.isolated_nodes[city_id] = []
                
                self.volume_log[city_id] = {node.name: [node.initial_volume] for node in city_config.nodes}
                self.load_log[city_id] = {node.name: [node.initial_volume * 0.1] for node in city_config.nodes}
        
        if sync_db and target_city_id:
            try:
                from app.core.database import reset_grid_config_in_db
                reset_grid_config_in_db(target_city_id)
            except Exception as e:
                logger.error(f"Failed to reset DB config for city {target_city_id}: {str(e)}")

    def sync_from_database(self, target_city_id: Optional[str] = None):
        cities_to_sync = [target_city_id] if target_city_id else list(settings.all_cities.keys())
        for city_id in cities_to_sync:
            try:
                from app.core.database import fetch_grid_config, fetch_recent_logs
                config = fetch_grid_config(city_id)
                if config:
                    db_nodes, db_connections = config
                    with self.lock:
                        if city_id not in self.volumes:
                            self.reset_to_defaults(sync_db=False, target_city_id=city_id)
                            
                        for node_data in db_nodes:
                            name = node_data["name"]
                            if name in self.volumes[city_id]:
                                self.volumes[city_id][name] = node_data["current_volume"]
                                self.capacities[city_id][name] = {
                                    "min": node_data["min_capacity"],
                                    "max": node_data["max_capacity"]
                                }
                                self.statuses[city_id][name] = node_data["status"]
                        
                        self.isolated_nodes[city_id] = [name for name, status in self.statuses[city_id].items() if status == "ISOLATED"]
                        self.cascade_triggered[city_id] = len(self.isolated_nodes[city_id]) > 0
                        
                        # Reset all connections to 0
                        for src in self.connections[city_id]:
                            for tgt in self.connections[city_id][src]:
                                self.connections[city_id][src][tgt] = 0.0
                                
                        # Update connections
                        for conn_data in db_connections:
                            src = conn_data["source"]
                            tgt = conn_data["target"]
                            eff = conn_data["efficiency"]
                            if src in self.isolated_nodes[city_id] or tgt in self.isolated_nodes[city_id]:
                                eff = 0.0
                            if src in self.connections[city_id] and tgt in self.connections[city_id][src]:
                                self.connections[city_id][src][tgt] = eff
                    logger.info(f"Synced TelemetryStore configurations for city {city_id} from Supabase.")
                
                # Fetch recent logs
                nodes = list(self.volumes[city_id].keys())
                logs = fetch_recent_logs(city_id, nodes, limit=24)
                if logs:
                    vol_hist, load_hist = logs
                    with self.lock:
                        for node in nodes:
                            if node in vol_hist and vol_hist[node]:
                                self.volume_log[city_id][node] = sanitize_history(vol_hist[node], default_val=500.0)
                            if node in load_hist and load_hist[node]:
                                clean_load_hist = sanitize_history(load_hist[node], default_val=50.0)
                                self.load_log[city_id][node] = clean_load_hist
                                self.load_histories[city_id][node] = clean_load_hist[-12:]
                                if len(self.load_histories[city_id][node]) < 12:
                                    pad = 12 - len(self.load_histories[city_id][node])
                                    self.load_histories[city_id][node] = [self.load_histories[city_id][node][0] if self.load_histories[city_id][node] else 50.0] * pad + self.load_histories[city_id][node]
                    logger.info(f"Synced TelemetryStore history logs for city {city_id} from Supabase.")
            except Exception as e:
                logger.error(f"Error during TelemetryStore database sync for city {city_id}: {str(e)}")

    def get_state(self, city_id: str) -> Dict[str, Any]:
        with self.lock:
            if city_id not in self.volumes:
                self.reset_to_defaults(sync_db=False, target_city_id=city_id)
                
            return {
                "volumes": dict(self.volumes[city_id]),
                "statuses": dict(self.statuses[city_id]),
                "connections": {src: dict(targets) for src, targets in self.connections[city_id].items()},
                "capacities": dict(self.capacities[city_id]),
                "cascade_triggered": self.cascade_triggered[city_id],
                "isolated_nodes": list(self.isolated_nodes[city_id]),
                "volume_log": {node: list(vals[-24:]) for node, vals in self.volume_log[city_id].items()},
                "load_log": {node: list(vals[-24:]) for node, vals in self.load_log[city_id].items()}
            }

    def update_constants(self, city_id: str, volumes: Dict[str, float], capacities: Dict[str, Dict[str, float]], connections: Dict[str, Dict[str, float]]):
        with self.lock:
            if city_id not in self.volumes:
                self.reset_to_defaults(sync_db=False, target_city_id=city_id)
                
            for node in self.volumes[city_id]:
                if node in volumes:
                    self.volumes[city_id][node] = volumes[node]
                if node in capacities:
                    self.capacities[city_id][node] = capacities[node]
                self.statuses[city_id][node] = "NORMAL"
            
            for src in self.connections[city_id]:
                if src in connections:
                    for tgt in self.connections[city_id][src]:
                        if tgt in connections[src]:
                            self.connections[city_id][src][tgt] = connections[src][tgt]
                            
            self.cascade_triggered[city_id] = False
            self.isolated_nodes[city_id] = []

        try:
            from app.core.database import update_grid_config_in_db
            update_grid_config_in_db(city_id, self.volumes[city_id], self.capacities[city_id], self.connections[city_id])
        except Exception as e:
            logger.error(f"Failed to update constants in DB for city {city_id}: {str(e)}")

    def register_listener(self, callback: Callable[[str, Dict[str, Any]], None]):
        self.listeners.add(callback)

    def unregister_listener(self, callback: Callable[[str, Dict[str, Any]], None]):
        self.listeners.discard(callback)

    def _broadcast(self, city_id: str, state: Dict[str, Any]):
        for listener in self.listeners:
            try:
                listener(city_id, state)
            except Exception as e:
                logger.error(f"Error broadcasting state for city {city_id}: {str(e)}")

    def tick_simulation(self):
        cities = list(settings.all_cities.keys())
        for city_id in cities:
            try:
                self.tick_simulation_for_city(city_id)
            except Exception as e:
                logger.error(f"Failed simulation tick for city {city_id}: {str(e)}")

    def tick_simulation_for_city(self, city_id: str):
        with self.lock:
            if city_id not in self.volumes:
                self.reset_to_defaults(sync_db=False, target_city_id=city_id)
                
            from datetime import datetime, timezone, timedelta
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            hour = datetime.now(ist_tz).hour
            
            city_config = settings.all_cities.get(city_id)
            if not city_config:
                return
                
            nodes = list(self.volumes[city_id].keys())
            
            current_loads = {}
            for node in nodes:
                base = wavelet_approx_forecast(node, hour, 0)
                fluctuation = random.uniform(-4.0, 4.0)
                current_loads[node] = max(5.0, round(base + fluctuation, 2))
                
                self.load_histories[city_id][node].append(current_loads[node])
                self.load_histories[city_id][node] = self.load_histories[city_id][node][-12:]
                self.load_log[city_id][node].append(current_loads[node])

            new_v = {}
            for i in nodes:
                if self.statuses[city_id][i] == "ISOLATED":
                    new_v[i] = self.volumes[city_id][i] - current_loads[i]
                else:
                    node_info = next((n for n in city_config.nodes if n.name == i), None)
                    generation = 0.0
                    if node_info and node_info.voltage_class >= 400:
                        generation = 200.0
                    elif node_info and node_info.voltage_class >= 220:
                        generation = 80.0
                        
                    inlet = sum(
                        self.connections[city_id].get(j, {}).get(i, 0.0) * self.volumes[city_id][j]
                        for j in nodes if j != i
                    )
                    outlet = sum(
                        self.connections[city_id].get(i, {}).get(j, 0.0) * self.volumes[city_id][i]
                        for j in nodes if j != i
                    )
                    new_v[i] = self.volumes[city_id][i] + (inlet - outlet - current_loads[i] + generation)
                
                new_v[i] = max(0.0, round(new_v[i], 2))

            for i in nodes:
                if self.statuses[city_id][i] == "ISOLATED":
                    new_v[i] = max(0.0, round(new_v[i], 2))
                    self.volume_log[city_id][i].append(new_v[i])
                    continue
                
                limits = self.capacities[city_id][i]
                v_val = new_v[i]
                
                if v_val < limits["min"] or v_val > limits["max"]:
                    self.statuses[city_id][i] = "ISOLATED"
                    self.cascade_triggered[city_id] = True
                    if i not in self.isolated_nodes[city_id]:
                        self.isolated_nodes[city_id].append(i)
                    logger.warning(f"CRITICAL: {i} breached limits ({v_val} units). Node ISOLATED in city {city_id}.")
                    
                    # Log NODE_CASCADE to audit_logs table in Supabase
                    try:
                        from app.core.database import get_supabase_client
                        client = get_supabase_client()
                        if client:
                            client.table("audit_logs").insert({
                                "city_id": city_id,
                                "event_type": "NODE_CASCADE",
                                "node_name": i,
                                "action_taken": f"Node isolated automatically due to volume boundary breach: current volume {v_val} MW exceeds thresholds"
                            }).execute()
                    except Exception as ex:
                        logger.error(f"Failed to save NODE_CASCADE audit log for city {city_id}, node {i}: {str(ex)}")
                    
                    for j in nodes:
                        if i in self.connections[city_id]:
                            self.connections[city_id][i][j] = 0.0
                        if j in self.connections[city_id]:
                            self.connections[city_id][j][i] = 0.0
                
                self.volumes[city_id][i] = new_v[i]
                self.volume_log[city_id][i].append(self.volumes[city_id][i])

        try:
            from app.core.database import save_telemetry_tick
            save_telemetry_tick(city_id, self.volumes[city_id], self.statuses[city_id], current_loads)
        except Exception as e:
            logger.error(f"Failed to save telemetry tick to DB for city {city_id}: {str(e)}")
                
        self._broadcast(city_id, self.get_state(city_id))


# Singleton telemetry store
telemetry_store = TelemetryStore()


async def telemetry_daemon_loop():
    logger.info("Telemetry Ingestion Daemon started.")
    try:
        while True:
            await asyncio.sleep(2.0)
            await asyncio.to_thread(telemetry_store.tick_simulation)
    except asyncio.CancelledError:
        logger.info("Telemetry Ingestion Daemon stopped.")
    except Exception as e:
        logger.error(f"Telemetry Ingestion Daemon failed: {str(e)}")
