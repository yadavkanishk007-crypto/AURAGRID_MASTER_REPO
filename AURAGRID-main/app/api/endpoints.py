import asyncio
import datetime
import logging
import math
import random
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.engine import simulate_grid_dynamics, telemetry_store

logger = logging.getLogger("AuraGrid.Endpoints")
router = APIRouter()

# --- Pydantic Schemas for Requests and Responses ---

class CapacityBounds(BaseModel):
    min: float = Field(..., description="Minimum utility volume threshold")
    max: float = Field(..., description="Maximum utility volume threshold")

class ForecastRequest(BaseModel):
    initial_volumes: Optional[Dict[str, float]] = Field(
        None, 
        description="Current volume of each utility node. Defaults to system configuration."
    )
    historical_loads: Optional[Dict[str, List[float]]] = Field(
        None, 
        description="Historical load series (X_t) for each node. Defaults to synthetic history."
    )
    connections: Optional[Dict[str, Dict[str, float]]] = Field(
        None, 
        description="Flow efficiency matrix k_ij. Defaults to configuration."
    )
    capacities: Optional[Dict[str, CapacityBounds]] = Field(
        None, 
        description="Capacity limits for each node. Defaults to configuration thresholds."
    )
    forecast_horizon: int = Field(
        12, 
        ge=0, 
        le=24, 
        description="Forecast step horizon (in hours)"
    )
    base_hour: Optional[int] = Field(
        None, 
        ge=0, 
        le=23, 
        description="Base hour of day (0-23) for seasonal wave alignment."
    )

class NodeResult(BaseModel):
    lstm_prediction: float = Field(..., description="Final step mock LSTM prediction")
    arima_prediction: float = Field(..., description="Final step mock ARIMA prediction")
    ensemble_prediction: float = Field(..., description="Weighted ensemble prediction (0.6*LSTM + 0.4*ARIMA)")
    projected_volume: float = Field(..., description="Final step mass-balance volume projection")
    status: str = Field(..., description="Node operational status: NORMAL, WARNING, or ISOLATED")

class ForecastResponse(BaseModel):
    forecast_horizon: int = Field(..., description="Forecast steps simulated")
    results: Dict[str, NodeResult] = Field(..., description="Final state results per node")
    cascade_triggered: bool = Field(..., description="Flag indicating if any cascading failure occurred")
    isolated_nodes: List[str] = Field(..., description="List of nodes that were isolated during simulation")
    volume_history: Dict[str, List[float]] = Field(..., description="Hourly volume tracking history")
    load_history: Dict[str, List[float]] = Field(..., description="Hourly forecasted load tracking history")


# --- WebSocket Client Connection Manager ---

class ConnectionManager:
    """
    Manages active WebSocket connections for streaming live grid telemetry updates.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New telemetry client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Telemetry client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Connection might be dead/stale, will clean up on error
                pass

manager = ConnectionManager()


# Bridge TelemetryStore updates to connected WebSockets
def handle_telemetry_broadcast(city_id: str, state: dict):
    """
    Synchronous callback registered to the TelemetryStore.
    Schedules WebSocket broadcast in the active event loop.
    """
    message = {"city_id": city_id, **state}
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            loop.create_task(manager.broadcast(message))
    except RuntimeError:
        # Fallback if update is triggered from another thread context
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)
        except Exception:
            pass

# Register callback
telemetry_store.register_listener(handle_telemetry_broadcast)


# --- JWT Authentication Dependency ---
def get_current_profile_from_token(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing or invalid authorization token")
    token = authorization.split(" ")[1]
    
    from supabase import create_client
    url = settings.supabase_url
    # Verify token by fetching user from Supabase using anon key
    client = create_client(url, settings.supabase_key)
    try:
        user_resp = client.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Unauthorized: Invalid token")
        
        # Query the profile for this user
        profile_resp = client.table("profiles").select("*").eq("id", user_resp.user.id).execute()
        if not profile_resp.data or len(profile_resp.data) == 0:
            raise HTTPException(status_code=403, detail="Forbidden: User profile not found")
        
        return profile_resp.data[0]
    except Exception as e:
        logger.error(f"Auth token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Unauthorized: Verification failed")


# --- API Routes ---

@router.get("/nodes/default")
def get_default_configuration(city_id: str = "bengaluru"):
    """
    Retrieves the default configuration parameters for a specific city.
    """
    city_config = settings.all_cities.get(city_id.lower().strip())
    if not city_config:
        raise HTTPException(status_code=400, detail=f"Unsupported city: {city_id}")
        
    default_history = {}
    for node in city_config.nodes:
        base = node.initial_volume * 0.1
        default_history[node.name] = [
            round(base + math.sin(i / 12 * 2 * math.pi) * node.amplitude * 0.5, 2)
            for i in range(12)
        ]
    
    return {
        "nodes": [node.dict() for node in city_config.nodes],
        "connections": [conn.dict() for conn in city_config.connections],
        "historical_loads": default_history,
        "city": city_config.id
    }


@router.post("/forecast", response_model=ForecastResponse)
async def run_forecast_simulation(payload: ForecastRequest, city_id: str = "bengaluru"):
    """
    Ingests utility telemetry, executes the parallel forecasting ensemble (LSTM+ARIMA)
    and routes volumes through the Compartment Mass-Balance Filter.
    Updates the live TelemetryStore state in real-time as a side-effect.
    """
    city_config = settings.all_cities.get(city_id.lower().strip())
    if not city_config:
        raise HTTPException(status_code=400, detail=f"Unsupported city: {city_id}")
        
    # 1. Resolve inputs
    initial_v = payload.initial_volumes or {node.name: node.initial_volume for node in city_config.nodes}
    
    default_history = {}
    for node in city_config.nodes:
        base = node.initial_volume * 0.1
        default_history[node.name] = [
            round(base + math.sin(i / 12 * 2 * math.pi) * node.amplitude * 0.5, 2)
            for i in range(12)
        ]
    history = payload.historical_loads or default_history
    
    if payload.connections:
        conn_map = payload.connections
    else:
        conn_map = {}
        for node in city_config.nodes:
            conn_map[node.name] = {}
        for conn in city_config.connections:
            if conn.source not in conn_map:
                conn_map[conn.source] = {}
            conn_map[conn.source][conn.target] = conn.efficiency
            
    if payload.capacities:
        caps = {
            node_name: {"min": bounds.min, "max": bounds.max}
            for node_name, bounds in payload.capacities.items()
        }
    else:
        caps = {
            node.name: {"min": node.min_capacity, "max": node.max_capacity}
            for node in city_config.nodes
        }
        
    b_hour = payload.base_hour
    if b_hour is None:
        from datetime import datetime, timezone, timedelta
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        b_hour = datetime.now(ist_tz).hour
        
    # Synchronize custom telemetry parameters into the live TelemetryStore
    if payload.initial_volumes is not None:
        telemetry_store.update_constants(
            city_id=city_id,
            volumes=initial_v,
            capacities=caps,
            connections=conn_map
        )
        
    # 2. Run simulation
    try:
        results = await simulate_grid_dynamics(
            initial_volumes=initial_v,
            historical_loads=history,
            connections=conn_map,
            capacities=caps,
            forecast_horizon=payload.forecast_horizon,
            base_hour=b_hour,
            city_id=city_id
        )
        return results
    except Exception as e:
        logger.error(f"Failed simulation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Grid simulation failed: {str(e)}")


# --- WebSocket Endpoint ---

@router.websocket("/ws/telemetry")
async def websocket_telemetry_stream(websocket: WebSocket, city_id: str = "bengaluru"):
    """
    Subscribes UI clients to real-time grid volume and load updates for a specific city.
    """
    await manager.connect(websocket)
    
    # Send the current city state immediately upon connection
    await websocket.send_json({"city_id": city_id, **telemetry_store.get_state(city_id)})
    
    try:
        while True:
            # Keep connection alive; accept messages (like reset triggers) from client if needed
            data = await websocket.receive_text()
            if data == "reset":
                telemetry_store.reset_to_defaults(sync_db=True, target_city_id=city_id)
                # Broadcast the reset state
                await manager.broadcast({"city_id": city_id, **telemetry_store.get_state(city_id)})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket client error for city {city_id}: {str(e)}")
        manager.disconnect(websocket)


# --- Next.js Web Control Room Compatibility Endpoints ---

class CascadeRequest(BaseModel):
    network_id: str
    timestamp_utc: str
    historical_telemetry_stream: List[float]
    structural_link_coefficients: List[float]
    active_nodes_in_partition: int

@router.post("/v1/predict/cascade-horizon")
async def predict_cascade_horizon(payload: CascadeRequest, horizon: int = 0, city_id: str = "bengaluru"):
    """
    Compatibility endpoint for the Next.js control room slider time-travel.
    Calculates cascade forecast metrics matching the frontend's expected schema.
    """
    try:
        city_config = settings.all_cities.get(city_id.lower().strip())
        if not city_config:
            raise HTTPException(status_code=400, detail=f"Unsupported city: {city_id}")
            
        # Parse timestamp
        try:
            base_time = datetime.datetime.fromisoformat(payload.timestamp_utc.replace("Z", "+00:00"))
        except Exception:
            base_time = datetime.datetime.now(datetime.timezone.utc)
            
        future_time = base_time + datetime.timedelta(hours=horizon)
        
        # Build dynamic configurations dictionary for all active nodes
        configs = {}
        for idx, node in enumerate(city_config.nodes):
            # Find downstream target via connections
            downstream = ""
            conn = next((c for c in city_config.connections if c.source == node.name), None)
            if conn:
                downstream = conn.target
            elif len(city_config.nodes) > 1:
                downstream = city_config.nodes[(idx + 1) % len(city_config.nodes)].name
            else:
                downstream = node.name
                
            configs[node.name] = {
                "min": node.min_capacity,
                "max": node.max_capacity,
                "growth": node.growth,
                "amplitude": node.amplitude,
                "idx": idx,
                "downstream": downstream
            }
            
        response_data = []
        
        for name, config in configs.items():
            # Extract base load from stream
            stream = payload.historical_telemetry_stream
            base_load = stream[config["idx"]] if len(stream) > config["idx"] else (city_config.nodes[config["idx"]].initial_volume if config["idx"] < len(city_config.nodes) else 500.0)
            
            # Forecast calculations
            growth_val = config["growth"] * horizon
            diurnal_val = math.sin((horizon / 4.0) * math.pi) * config["amplitude"] * 0.85
            cascade_index = (horizon - 6) * 45.0 if horizon > 6 else 0.0
            calculated_load = base_load + growth_val + diurnal_val + cascade_index
            calculated_load = max(0.0, round(calculated_load, 2))
            
            # Calculate rate delta
            if horizon == 0:
                delta = 0.0
            else:
                prev_h = horizon - 1
                prev_growth = config["growth"] * prev_h
                prev_diurnal = math.sin((prev_h / 4.0) * math.pi) * config["amplitude"] * 0.85
                prev_cascade = (prev_h - 6) * 45.0 if prev_h > 6 else 0.0
                prev_load = base_load + prev_growth + prev_diurnal + prev_cascade
                delta = calculated_load - prev_load
                delta = round(delta, 2)
                
            # State evaluation
            if calculated_load >= config["max"]:
                status = "CRITICAL_CASCADE_RISK"
            elif calculated_load >= config["max"] * 0.88 or calculated_load <= config["min"] * 1.5:
                status = "VULNERABLE"
            else:
                status = "STABLE"
                
            is_anomaly = status in ["VULNERABLE", "CRITICAL_CASCADE_RISK"]
            
            response_data.append({
                "node_id": name,
                "system_state_evaluation": status,
                "forecast_horizon_metrics": {
                    "calculated_peak_load_target": calculated_load,
                    "capacity_rate_of_change_delta": delta,
                    "system_structural_limit": config["max"]
                },
                "propagation_path_alert": {
                    "is_anomaly_detected": is_anomaly,
                    "predicted_breach_timestamp": future_time.isoformat(),
                    "primary_downstream_exposure_vector": config["downstream"]
                }
            })
            
        return response_data
    except Exception as e:
        logger.error(f"Cascade horizon prediction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v1/government/telemetry")
async def get_government_telemetry(city_id: str = "bengaluru"):
    """
    Compatibility endpoint for the Next.js control room SLDC polling.
    """
    try:
        city_config = settings.all_cities.get(city_id.lower().strip())
        if not city_config:
            raise HTTPException(status_code=400, detail=f"Unsupported city: {city_id}")
            
        now = datetime.datetime.now(datetime.timezone.utc)
        phi = now.second / 60.0
        
        freq = 50.0 + math.sin(phi * 4.0 * math.pi) * 0.03 + random.uniform(-0.015, 0.015)
        
        active_telemetry = []
        for idx, node in enumerate(city_config.nodes):
            phase_offset = (idx / len(city_config.nodes)) * 2.0 * math.pi
            # Simulate real-time fluctuated active power
            val = max(node.min_capacity, node.initial_volume + math.sin(phi * 2.0 * math.pi + phase_offset) * node.amplitude * 1.2 + random.uniform(-8.0, 8.0))
            
            # Simple status check
            status = "NORMAL"
            if val >= node.max_capacity:
                status = "ISOLATED"
            elif val >= node.max_capacity * 0.88 or val <= node.min_capacity * 1.5:
                status = "WARNING"
                
            active_telemetry.append({
                "node_name": node.name,
                "voltage_class": f"{node.voltage_class}kV",
                "active_power_mw": round(val, 2),
                "reactive_power_mvar": round(val * 0.12, 2),
                "power_factor": round(0.92 + random.uniform(-0.02, 0.02), 3),
                "load_status": status
            })
            
        # Determine center name dynamically
        city_lower = city_config.id
        if "pune" in city_lower:
            center_name = "Maharashtra State Load Despatch Centre (SLDC) - Pune"
        elif "delhi" in city_lower:
            center_name = "Delhi State Load Despatch Centre (SLDC)"
        elif "bhopal" in city_lower:
            center_name = "Madhya Pradesh State Load Despatch Centre (SLDC) - Bhopal"
        elif "lucknow" in city_lower:
            center_name = "Uttar Pradesh State Load Despatch Centre (SLDC) - Lucknow"
        elif "jhansi" in city_lower:
            center_name = "Jhansi Grid (UPPCL Network) SLDC"
        else:
            center_name = "Karnataka State Load Despatch Centre (SLDC)"
            
        return {
            "sldc_metadata": {
                "center_name": center_name,
                "grid_frequency_hz": round(freq, 3),
                "system_voltage_kv": round(400.0 + random.uniform(-2.0, 2.0), 2),
                "recorded_at": now.isoformat()
            },
            "active_telemetry": active_telemetry
        }
    except Exception as e:
        logger.error(f"SLDC telemetry generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class CitySwitchRequest(BaseModel):
    city: str

@router.post("/settings/city")
async def switch_active_city(payload: CitySwitchRequest):
    """
    Resets grid variables and configuration settings for a specific city back to default.
    """
    city_name = payload.city.strip().lower()
    supported = ["bengaluru", "delhi", "pune", "bhopal", "lucknow", "jhansi"]
    if city_name not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported city: {city_name}. Must be one of {supported}")
        
    try:
        # 1. Reset dynamic settings back to original defaults in Supabase for this city
        telemetry_store.reset_to_defaults(sync_db=True, target_city_id=city_name)
        
        # 2. Sync memory store configuration
        telemetry_store.sync_from_database(target_city_id=city_name)
        
        # 3. Broadcast refreshed telemetry stream for this city
        await manager.broadcast({"city_id": city_name, **telemetry_store.get_state(city_name)})
        
        logger.info(f"Database settings and state reset successfully for city: {city_name}")
        return {
            "status": "success",
            "active_city": city_name,
            "city_name": settings.all_cities[city_name].display_name,
            "node_count": len(settings.all_cities[city_name].nodes),
            "connection_count": len(settings.all_cities[city_name].connections)
        }
    except Exception as e:
        logger.error(f"Operational reset failed for city {city_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reset city execution error: {str(e)}")

@router.get("/settings/cities")
def get_supported_cities():
    """
    Lists metadata and centering bounds for all supported Indian cities.
    """
    return {
        "cities": [
            {"id": "bengaluru", "name": "Bengaluru (BESCOM)", "center": [12.955, 77.64]},
            {"id": "delhi", "name": "Delhi (DTL)", "center": [28.7041, 77.1025]},
            {"id": "pune", "name": "Pune (MSETCL)", "center": [18.5204, 73.8567]},
            {"id": "bhopal", "name": "Bhopal (MPPTCL)", "center": [23.2599, 77.4126]},
            {"id": "lucknow", "name": "Lucknow (UPPTCL)", "center": [26.8467, 80.9462]},
            {"id": "jhansi", "name": "Jhansi (UPPCL)", "center": [25.4484, 78.5685]}
        ]
    }


# --- User Creation Administration Endpoint ---

class CreateUserRequest(BaseModel):
    email: str
    password: str

@router.post("/admin/create-user")
async def create_user_endpoint(
    payload: CreateUserRequest,
    current_profile: dict = Depends(get_current_profile_from_token)
):
    """
    Creates authentication credentials for administrators and field workers.
    Enforces format validations and city-wide administrative boundaries.
    """
    role = current_profile.get("role")
    creator_city = current_profile.get("city_id")
    
    if role not in ["super_admin", "command_centre_admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Only administrators can create credentials")
        
    email = payload.email.strip().lower()
    if not email.endswith("@auragrid.org"):
        raise HTTPException(status_code=400, detail="Invalid domain: Credentials must end with @auragrid.org")
        
    local_part = email.split("@")[0]
    
    # Enforce formatting rules
    if local_part == "admin":
        if role != "super_admin":
            raise HTTPException(status_code=403, detail="Forbidden: Only super admin can create super admin credentials")
    elif "." not in local_part:
        # Command Centre Admin (e.g. jhansi@auragrid.org)
        if role != "super_admin":
            raise HTTPException(status_code=403, detail="Forbidden: Only super admin can create command centre admins")
    else:
        # Field Worker (e.g. jh.civilline_grid@auragrid.org)
        if role == "command_centre_admin":
            city_prefix = local_part.split(".")[0]
            # Map prefix
            prefix_to_city = {
                "blr": "bengaluru",
                "del": "delhi",
                "pn": "pune",
                "bp": "bhopal",
                "lu": "lucknow",
                "jh": "jhansi"
            }
            mapped_city = prefix_to_city.get(city_prefix)
            if mapped_city != creator_city:
                raise HTTPException(status_code=403, detail=f"Forbidden: You can only create workers for your city ({creator_city}) using prefix {city_prefix}")

    from supabase import create_client
    admin_client = create_client(settings.supabase_url, settings.supabase_key)
    try:
        # Create user in Auth
        new_user = admin_client.auth.admin.create_user({
            "email": email,
            "password": payload.password,
            "email_confirm": True
        })
        
        # Log this user creation to public.audit_logs
        try:
            admin_client.table("audit_logs").insert({
                "city_id": creator_city or "bengaluru",
                "event_type": "USER_MANAGEMENT",
                "action_taken": f"Admin ({current_profile['email']}) created user credentials for: {email}",
                "performed_by": current_profile["id"]
            }).execute()
        except Exception as ex:
            logger.error(f"Failed to log audit entry for user creation: {ex}")
            
        return {
            "status": "success",
            "user_id": new_user.user.id,
            "email": new_user.user.email
        }
    except Exception as e:
        logger.error(f"Admin auth user creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"User creation failed: {str(e)}")
