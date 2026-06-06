import logging
from typing import Dict, List, Tuple, Any, Optional
from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger("AuraGrid.Database")

# Initialize client lazily or when requested
_client: Optional[Client] = None

def get_supabase_client() -> Optional[Client]:
    global _client
    if _client is not None:
        return _client
        
    url = settings.supabase_url
    key = settings.supabase_key
    
    if not url or not key:
        logger.warning("Supabase credentials not configured. Running in local in-memory fallback mode.")
        return None
        
    try:
        _client = create_client(url, key)
        logger.info("Supabase client initialized successfully.")
        return _client
    except Exception as e:
        logger.error(f"Error initializing Supabase client: {str(e)}")
        return None

def check_db_connection() -> bool:
    client = get_supabase_client()
    if not client:
        return False
    try:
        # Perform simple query to verify connection
        client.table("nodes").select("name").limit(1).execute()
        return True
    except Exception as e:
        logger.error(f"Supabase connection check failed: {str(e)}")
        return False

def wipe_grid_tables(city_id: Optional[str] = None) -> bool:
    """
    Cleans up nodes, connections, telemetry logs, and alerts from Supabase, filtered by city_id if provided.
    """
    client = get_supabase_client()
    if not client:
        return False
    try:
        if city_id:
            logger.info(f"Wiping database tables for city: {city_id}...")
            try:
                client.table("connections").delete().eq("city_id", city_id).execute()
            except Exception as e:
                logger.warning(f"Error wiping connections for {city_id}: {e}")
            try:
                client.table("telemetry_logs").delete().eq("city_id", city_id).execute()
            except Exception as e:
                logger.warning(f"Error wiping telemetry_logs for {city_id}: {e}")
            try:
                client.table("nodes").delete().eq("city_id", city_id).execute()
            except Exception as e:
                logger.warning(f"Error wiping nodes for {city_id}: {e}")
            try:
                client.table("alerts").delete().eq("city_id", city_id).execute()
            except Exception as e:
                logger.warning(f"Error wiping alerts for {city_id}: {e}")
        else:
            logger.info("Wiping all database tables...")
            try:
                client.table("connections").delete().neq("source", "").execute()
            except Exception as e:
                logger.warning(f"Error wiping connections table: {e}")
            try:
                client.table("telemetry_logs").delete().neq("node_name", "").execute()
            except Exception as e:
                logger.warning(f"Error wiping telemetry_logs table: {e}")
            try:
                client.table("nodes").delete().neq("name", "").execute()
            except Exception as e:
                logger.warning(f"Error wiping nodes table: {e}")
            try:
                client.table("alerts").delete().neq("node_name", "").execute()
            except Exception as e:
                logger.warning(f"Error wiping alerts table: {e}")
        return True
    except Exception as e:
        logger.error(f"Failed to wipe grid tables: {str(e)}")
        return False

async def seed_default_grid():
    client = get_supabase_client()
    if not client:
        return
        
    try:
        for city_id, city_config in settings.all_cities.items():
            # Check if nodes table has entries for this city
            resp = client.table("nodes").select("name").eq("city_id", city_id).execute()
            
            db_names = {row["name"] for row in resp.data} if (resp.data and len(resp.data) > 0) else set()
            settings_names = {node.name for node in city_config.nodes}
            
            # Seed if empty or counts/names do not match configured nodes
            if not resp.data or len(resp.data) < len(settings_names) or db_names != settings_names:
                logger.info(f"Database out of sync or missing config for city {city_id}. Initiating seeding...")
                
                wipe_grid_tables(city_id)
                    
                nodes_to_insert = [
                    {
                        "city_id": city_id,
                        "name": node.name,
                        "initial_volume": node.initial_volume,
                        "max_capacity": node.max_capacity,
                        "min_capacity": node.min_capacity,
                        "current_volume": node.initial_volume,
                        "status": "NORMAL"
                    }
                    for node in city_config.nodes
                ]
                
                # Insert in chunks of 50 to avoid request size limitations
                chunk_size = 50
                for i in range(0, len(nodes_to_insert), chunk_size):
                    chunk = nodes_to_insert[i:i+chunk_size]
                    client.table("nodes").insert(chunk).execute()
                logger.info(f"Successfully seeded {len(nodes_to_insert)} nodes for {city_id}.")
                
                connections_to_insert = [
                    {
                        "city_id": city_id,
                        "source": conn.source,
                        "target": conn.target,
                        "efficiency": conn.efficiency
                    }
                    for conn in city_config.connections
                ]
                
                for i in range(0, len(connections_to_insert), chunk_size):
                    chunk = connections_to_insert[i:i+chunk_size]
                    client.table("connections").insert(chunk).execute()
                logger.info(f"Successfully seeded {len(connections_to_insert)} connections for {city_id}.")
                
            else:
                logger.info(f"Database already contains {len(resp.data)} matching nodes for city {city_id}. Skipping seeding.")
                
    except Exception as e:
        logger.error(f"Failed to seed defaults into Supabase: {str(e)}")


def fetch_grid_config(city_id: str) -> Optional[Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]]:
    """
    Fetches the grid configuration (nodes and connections) for a specific city from Supabase.
    Returns (nodes, connections) or None if error/unconfigured.
    """
    client = get_supabase_client()
    if not client:
        return None
        
    try:
        nodes_resp = client.table("nodes").select("*").eq("city_id", city_id).execute()
        connections_resp = client.table("connections").select("*").eq("city_id", city_id).execute()
        return nodes_resp.data, connections_resp.data
    except Exception as e:
        logger.error(f"Failed to fetch grid configuration for city {city_id} from Supabase: {str(e)}")
        return None

def save_telemetry_tick(city_id: str, volumes: Dict[str, float], statuses: Dict[str, str], loads: Dict[str, float]) -> bool:
    """
    Saves a telemetry tick for a specific city to Supabase in batch.
    """
    client = get_supabase_client()
    if not client:
        return False
        
    try:
        # Update each node's status and current volume
        for node_name, vol in volumes.items():
            status = statuses.get(node_name, "NORMAL")
            client.table("nodes").update({
                "current_volume": vol,
                "status": status
            }).eq("city_id", city_id).eq("name", node_name).execute()
            
        logs_to_insert = [
            {
                "city_id": city_id,
                "node_name": node_name,
                "volume": vol,
                "load": loads.get(node_name, 0.0)
            }
            for node_name, vol in volumes.items()
        ]
        
        # Batch insert telemetry logs in chunks of 50
        chunk_size = 50
        for i in range(0, len(logs_to_insert), chunk_size):
            chunk = logs_to_insert[i:i+chunk_size]
            client.table("telemetry_logs").insert(chunk).execute()
            
        return True
    except Exception as e:
        logger.error(f"Failed to save telemetry tick for city {city_id} to Supabase: {str(e)}")
        return False

def update_grid_config_in_db(city_id: str, volumes: Dict[str, float], capacities: Dict[str, Dict[str, float]], connections: Dict[str, Dict[str, float]]) -> bool:
    """
    Updates the grid constants for a specific city in Supabase when custom configuration is set.
    """
    client = get_supabase_client()
    if not client:
        return False
        
    try:
        # Update nodes
        for node_name, vol in volumes.items():
            caps = capacities.get(node_name, {"min": 20.0, "max": 1000.0})
            client.table("nodes").update({
                "initial_volume": vol,
                "current_volume": vol,
                "min_capacity": caps.get("min", 20.0),
                "max_capacity": caps.get("max", 1000.0),
                "status": "NORMAL"
            }).eq("city_id", city_id).eq("name", node_name).execute()
            
        # Update connections
        for src, targets in connections.items():
            for tgt, eff in targets.items():
                client.table("connections").update({
                    "efficiency": eff
                }).eq("city_id", city_id).eq("source", src).eq("target", tgt).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to update grid configuration for city {city_id} in Supabase: {str(e)}")
        return False

def reset_grid_config_in_db(city_id: str) -> bool:
    """
    Resets nodes and connections configurations for a specific city in Supabase to original settings defaults.
    """
    client = get_supabase_client()
    if not client:
        return False
        
    city_config = settings.all_cities.get(city_id)
    if not city_config:
        logger.error(f"Cannot reset DB config: City {city_id} not configured.")
        return False
        
    try:
        # Update nodes to default configurations
        for node in city_config.nodes:
            client.table("nodes").update({
                "initial_volume": node.initial_volume,
                "current_volume": node.initial_volume,
                "min_capacity": node.min_capacity,
                "max_capacity": node.max_capacity,
                "status": "NORMAL"
            }).eq("city_id", city_id).eq("name", node.name).execute()
            
        # Update connections to default efficiencies
        for conn in city_config.connections:
            client.table("connections").update({
                "efficiency": conn.efficiency
            }).eq("city_id", city_id).eq("source", conn.source).eq("target", conn.target).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to reset grid configuration for city {city_id} in Supabase: {str(e)}")
        return False

def fetch_recent_logs(city_id: str, node_names: List[str], limit: int = 24) -> Optional[Tuple[Dict[str, List[float]], Dict[str, List[float]]]]:
    """
    Loads recent historical load and volume data from telemetry_logs table for given nodes and city.
    Returns (volume_history, load_history) or None.
    """
    client = get_supabase_client()
    if not client:
        return None
        
    try:
        # Fetch logs for all requested nodes for this city.
        resp = client.table("telemetry_logs")\
            .select("node_name, volume, load, timestamp")\
            .eq("city_id", city_id)\
            .order("timestamp", desc=True)\
            .limit(limit * len(node_names))\
            .execute()
            
        if not resp.data:
            return None
            
        # Group records by node_name
        logs_by_node = {name: [] for name in node_names}
        for row in resp.data:
            node = row["node_name"]
            if node in logs_by_node:
                logs_by_node[node].append(row)
                
        volume_hist = {}
        load_hist = {}
        
        for node, rows in logs_by_node.items():
            # Sort chronologically
            rows_sorted = sorted(rows, key=lambda x: x["timestamp"])
            volume_hist[node] = [r["volume"] for r in rows_sorted]
            load_hist[node] = [r["load"] for r in rows_sorted]
            
        return volume_hist, load_hist
    except Exception as e:
        logger.error(f"Failed to fetch recent telemetry logs for city {city_id} from Supabase: {str(e)}")
        return None
