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
    logger.info(f"Initiating inline ARIMA/LSTM model training pipeline for city: {city_name_clean.upper()}...")
    weights_db = {}
    
    try:
        from train_models import generate_synthetic_history, train_fourier_arima, train_autoregressive_lstm
        for node in settings.nodes:
            history = generate_synthetic_history(node.name)
            arima_params = train_fourier_arima(history)
            lstm_params = train_autoregressive_lstm(history)
            weights_db[node.name] = {
                "arima": arima_params,
                "lstm": lstm_params
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



# --- Fitted ARIMA and LSTM Inference Engines ---

def arima_forecast(node_name: str, base_hour: int, horizon: int) -> float:
    """
    ARIMA baseline using a fitted Fourier seasonal cycle if weights are loaded.
    Falls back to a dynamic seasonal baseline.
    """
    t = (base_hour + horizon) % 24
    
    # 1. Check if trained model weights exist for this node
    if node_name in MODEL_WEIGHTS:
        params = MODEL_WEIGHTS[node_name]["arima"]
        beta_0 = params["beta_0"]
        a1, b1 = params["a1"], params["b1"]
        a2, b2 = params["a2"], params["b2"]
        
        # Calculate fitted Fourier cycle projection
        forecast = beta_0 + (
            a1 * math.sin(2 * math.pi * t / 24) +
            b1 * math.cos(2 * math.pi * t / 24) +
            a2 * math.sin(4 * math.pi * t / 24) +
            b2 * math.cos(4 * math.pi * t / 24)
        )
        return max(1.0, round(forecast, 2))
        
    # 2. Fallback to dynamic seasonal cycle from config
    node_info = next((n for n in settings.nodes if n.name == node_name), None)
    base = node_info.initial_volume * 0.1 if node_info else 50.0
    amplitude = node_info.amplitude if node_info else 15.0
    
    cycle_24 = math.sin(2 * math.pi * (t - 6) / 24)
    cycle_12 = 0.4 * math.sin(4 * math.pi * (t - 9) / 24)
    
    forecasted_load = base + amplitude * (cycle_24 + cycle_12)
    return max(1.0, round(forecasted_load, 2))


def lstm_forecast(node_name: str, history: List[float], horizon: int) -> float:
    """
    LSTM sequence forecasting using a fitted 12-lag autoregressive weight matrix.
    Falls back to a trend slope simulation.
    """
    if not history:
        history = [50.0] * 12
        
    # 1. Check if trained weights exist for this node
    if node_name in MODEL_WEIGHTS:
        params = MODEL_WEIGHTS[node_name]["lstm"]
        intercept = params["intercept"]
        weights = params["weights"]
        
        # Pad history if shorter than 12 lags
        if len(history) < 12:
            history = [history[0]] * (12 - len(history)) + history
            
        recent_x = history[-12:]
        # Run OLS autoregressive projection
        forecast = intercept + sum(w * xv for w, xv in zip(weights, recent_x))
        
        random.seed(hash(node_name) + horizon)
        noise = random.normalvariate(0, 1.5 * math.sqrt(horizon + 1))
        return max(1.0, round(forecast + noise, 2))
        
    # 2. Fallback to dynamic trend slope simulation
    n = len(history)
    if n >= 2:
        span = min(n, 4)
        recent = history[-span:]
        slope = (recent[-1] - recent[0]) / (span - 1) if span > 1 else 0.0
    else:
        slope = 0.5
    
    node_info = next((n for n in settings.nodes if n.name == node_name), None)
    vol = node_info.amplitude * 0.05 if node_info else 3.0
    
    last_val = history[-1]
    projected = last_val + (slope * horizon)
    
    random.seed(hash(node_name) + horizon)
    noise = random.normalvariate(0, vol * math.sqrt(horizon + 1))
    forecasted_load = projected + noise
    return max(1.0, round(forecasted_load, 2))


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
        
        # Calculate ARIMA and LSTM predictions synchronously for all nodes
        for node in nodes:
            hist = historical_loads.get(node, [])
            if load_history[node]:
                hist = hist + [load_history[node][-1]]
                
            lstm_val = lstm_forecast(node, hist, step)
            arima_val = arima_forecast(node, base_hour, step)
            ensemble_val = round(0.6 * lstm_val + 0.4 * arima_val, 2)
            
            step_loads[node] = {
                "lstm": lstm_val,
                "arima": arima_val,
                "ensemble": ensemble_val
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
                "lstm_prediction": 0.0,
                "arima_prediction": 0.0,
                "ensemble_prediction": 0.0,
                "projected_volume": current_v[node],
                "status": "NORMAL"
            }
        else:
            results[node] = {
                "lstm_prediction": step_loads[node]["lstm"],
                "arima_prediction": step_loads[node]["arima"],
                "ensemble_prediction": step_loads[node]["ensemble"],
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
                                self.volume_log[city_id][node] = vol_hist[node]
                            if node in load_hist and load_hist[node]:
                                self.load_log[city_id][node] = load_hist[node]
                                self.load_histories[city_id][node] = load_hist[node][-12:]
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
                base = arima_forecast(node, hour, 0)
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
