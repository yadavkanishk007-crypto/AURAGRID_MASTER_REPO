import os
import re
import csv
import math
import logging
import xml.etree.ElementTree as ET
from typing import List, Tuple, Dict
from pydantic import BaseModel, Field
from dotenv import load_dotenv

logger = logging.getLogger("AuraGrid.Config")

# Load environment variables from .env file
load_dotenv()

class NodeConfig(BaseModel):
    name: str
    initial_volume: float = Field(..., description="Initial volume capacity of the node")
    max_capacity: float = Field(..., description="Maximum threshold capacity of the node before failure")
    min_capacity: float = Field(0.0, description="Minimum threshold capacity of the node before failure")
    growth: float = Field(20.0, description="Forecasted growth factor per hour")
    amplitude: float = Field(50.0, description="Forecasted wave amplitude")
    latitude: float = Field(0.0, description="Latitude coordinate")
    longitude: float = Field(0.0, description="Longitude coordinate")
    voltage_class: int = Field(66, description="Voltage class in kV")

class ConnectionConfig(BaseModel):
    source: str
    target: str
    efficiency: float = Field(..., description="Flow coefficient k_ij from source to target")

def normalize_division_name(name: str) -> str:
    if not name:
        return ""
    n = re.sub(r'[^A-Z0-9]', '', name.upper().strip())
    
    if n in ["CBPURA", "CHIKKABALLAPURA", "CHIKKABALAPURA"]:
        return "CHIKKABALAPURA"
    if n in ["CHINTAMANI", "CHINTHAMANI"]:
        return "CHINTHAMANI"
    if n in ["HEBBALA", "HEBBAL"]:
        return "HEBBAL"
    if n in ["HSRLAYOUT", "HSR"]:
        return "HSRLAYOUT"
    if n in ["INDIRANAGAR", "INDIRANAGARA"]:
        return "INDIRANAGARA"
    if n in ["JAYANAGAR", "JAYANAGARA"]:
        return "JAYANAGARA"
    if n in ["KANAKPURA", "KANAKAPURA"]:
        return "KANAKAPURA"
    if n in ["RRNAGAR", "RAJARAJESHWARINAGAR"]:
        return "RRNAGAR"
    if n in ["RAMNAGARA", "RAMANAGARA"]:
        return "RAMANAGARA"
    
    return n

def get_js_hash(name: str) -> int:
    h = 0
    for char in name.upper():
        h = (h << 5) - h + ord(char)
        h = h & 0xFFFFFFFF
        if h & 0x80000000:
            h = h - 0x100000000
    return h

def parse_kml_division_centroids(kml_path: str) -> Dict[str, Tuple[float, float]]:
    centroids = {}
    if not os.path.exists(kml_path):
        logger.warning(f"KML boundary file not found at: {kml_path}. Falling back to default coordinate space.")
        return centroids
    try:
        tree = ET.parse(kml_path)
        root = tree.getroot()
        
        # Helper to strip namespace from tags
        def strip_ns(tag):
            return tag.split('}', 1)[1] if '}' in tag else tag

        def traverse(node):
            if strip_ns(node.tag) == 'Placemark':
                name = ""
                # Search for DivisionName
                for child in node.iter():
                    tag_local = strip_ns(child.tag)
                    if tag_local == 'SimpleData' and child.attrib.get('name') == 'DivisionName':
                        name = child.text or ""
                        break
                
                # Fallback to name tag if not found
                if not name:
                    name_node = node.find('.//{http://www.opengis.net/kml/2.2}name')
                    if name_node is not None:
                        name = name_node.text or ""

                # Extract coordinates
                coords_node = node.find('.//{http://www.opengis.net/kml/2.2}coordinates')
                if coords_node is not None and coords_node.text:
                    coord_text = coords_node.text.strip()
                    points = []
                    for triplet in coord_text.split():
                        parts = triplet.split(',')
                        if len(parts) >= 2:
                            try:
                                lon = float(parts[0])
                                lat = float(parts[1])
                                points.append((lon, lat))
                            except ValueError:
                                pass
                    if points:
                        total_lon = sum(p[0] for p in points)
                        total_lat = sum(p[1] for p in points)
                        cnt = len(points)
                        centroids[normalize_division_name(name)] = (total_lat / cnt, total_lon / cnt)
            for child in node:
                traverse(child)

        traverse(root)
        logger.info(f"Loaded {len(centroids)} division centroids from KML.")
    except Exception as e:
        logger.error(f"Error parsing KML boundaries: {str(e)}")
    return centroids

def load_substations_from_csv(csv_path: str, centroids: Dict[str, Tuple[float, float]]) -> List[NodeConfig]:
    nodes = []
    if not os.path.exists(csv_path):
        logger.error(f"Substations CSV file not found at: {csv_path}")
        return nodes
    try:
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader) # skip header
            seen_names = set()
            for row in reader:
                if len(row) < 6:
                    continue
                zone = row[1]
                district = row[2]
                taluk = row[3]
                name = row[4].strip()
                volts_str = row[5].strip()
                
                if not name:
                    continue
                    
                # Parse volts
                try:
                    volts = int(re.search(r'\d+', volts_str).group())
                except Exception:
                    volts = 66 # Default voltage class

                # Ensure unique name to prevent Supabase constraint conflict
                original_name = name
                suffix_index = 1
                while name in seen_names:
                    name = f"{original_name} ({volts} kV)"
                    if name in seen_names:
                        name = f"{original_name} ({volts} kV - {suffix_index})"
                        suffix_index += 1
                seen_names.add(name)

                # Determine coordinates
                possible_names = [taluk, name, district]
                matched_norm = ""
                for raw in possible_names:
                    norm = normalize_division_name(raw)
                    if norm in centroids:
                        matched_norm = norm
                        break
                        
                if not matched_norm:
                    for raw in possible_names:
                        if not raw:
                            continue
                        up = raw.upper().strip()
                        for norm_key in centroids:
                            if up in norm_key or norm_key in up:
                                matched_norm = norm_key
                                break
                        if matched_norm:
                            break
                            
                if not matched_norm:
                    keys = list(centroids.keys())
                    if keys:
                        h = get_js_hash(name + (taluk or ""))
                        matched_norm = keys[abs(h) % len(keys)]
                
                base_coord = centroids[matched_norm] if matched_norm in centroids else (12.9716, 77.5946)
                
                # Deterministic jitter to prevent overlay conflicts
                h = get_js_hash(name)
                jitter_lat = ((abs(h) % 1000) / 1000.0 - 0.5) * 0.05
                jitter_lng = ((abs(h >> 3) % 1000) / 1000.0 - 0.5) * 0.05
                
                lat = base_coord[0] + jitter_lat
                lng = base_coord[1] + jitter_lng
                
                # Dynamic capacity properties by voltage class
                if volts >= 400:
                    init_vol = 800.0
                    max_cap = 1500.0
                    growth = 65.0
                    amp = 80.0
                elif volts >= 220:
                    init_vol = 500.0
                    max_cap = 1000.0
                    growth = 45.0
                    amp = 120.0
                else:
                    init_vol = 200.0
                    max_cap = 400.0
                    growth = 20.0
                    amp = 50.0
                    
                nodes.append(NodeConfig(
                    name=name,
                    initial_volume=init_vol,
                    max_capacity=max_cap,
                    min_capacity=20.0,
                    growth=growth,
                    amplitude=amp,
                    latitude=lat,
                    longitude=lng,
                    voltage_class=volts
                ))
        logger.info(f"Loaded {len(nodes)} nodes dynamically from CSV.")
    except Exception as e:
        logger.error(f"Error loading substations CSV: {str(e)}")
    return nodes

def generate_proximity_connections(nodes: List[NodeConfig]) -> List[ConnectionConfig]:
    connections = []
    if not nodes:
        return connections
        
    ht_nodes = [n for n in nodes if n.voltage_class >= 220]
    lt_nodes = [n for n in nodes if n.voltage_class < 220]
    
    # 1. Connect high-voltage nodes to nearest and second-nearest high-voltage nodes
    for idx, sub in enumerate(ht_nodes):
        neighbors = []
        for other in ht_nodes:
            if other.name == sub.name:
                continue
            dist = math.sqrt((other.latitude - sub.latitude)**2 + (other.longitude - sub.longitude)**2)
            neighbors.append((dist, other.name))
            
        neighbors.sort(key=lambda x: x[0])
        
        # Connect nearest HT
        if len(neighbors) > 0:
            connections.append(ConnectionConfig(source=sub.name, target=neighbors[0][1], efficiency=0.15))
        # Connect 2nd nearest HT
        if len(neighbors) > 1:
            connections.append(ConnectionConfig(source=sub.name, target=neighbors[1][1], efficiency=0.12))
            
    # 2. Connect low-voltage nodes to nearest high-voltage node and nearest low-voltage node
    for sub in lt_nodes:
        # Nearest HT
        nearest_ht = None
        min_ht_dist = float('inf')
        for ht in ht_nodes:
            dist = math.sqrt((ht.latitude - sub.latitude)**2 + (ht.longitude - sub.longitude)**2)
            if dist < min_ht_dist:
                min_ht_dist = dist
                nearest_ht = ht
                
        if nearest_ht:
            connections.append(ConnectionConfig(source=sub.name, target=nearest_ht.name, efficiency=0.10))
            
        # Nearest LT (within 0.05 degrees)
        nearest_lt = None
        min_lt_dist = float('inf')
        for other in lt_nodes:
            if other.name == sub.name:
                continue
            dist = math.sqrt((other.latitude - sub.latitude)**2 + (other.longitude - sub.longitude)**2)
            if dist < min_lt_dist:
                min_lt_dist = dist
                nearest_lt = other
                
        if nearest_lt and min_lt_dist < 0.05:
            connections.append(ConnectionConfig(source=sub.name, target=nearest_lt.name, efficiency=0.08))
            
    logger.info(f"Generated {len(connections)} proximity connections dynamically.")
    return connections


class CityGridData(BaseModel):
    id: str
    display_name: str
    nodes: List[NodeConfig]
    connections: List[ConnectionConfig]

# Class settings definition
class Settings(BaseModel):
    app_name: str = "AuraGrid Utility Telemetry Service"
    city_name: str = "Bengaluru Grid (BESCOM Network)"
    version: str = "1.2.0"
    debug: bool = os.getenv("GRID_DEBUG", "True").lower() == "true"
    
    # Supabase credentials
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")

    # Loaded dynamically
    nodes: List[NodeConfig] = []
    connections: List[ConnectionConfig] = []
    
    # Concurrent Multi-City data
    all_cities: Dict[str, CityGridData] = {}

# Global settings instance
settings = Settings()

def parse_city_grid_config(city_id: str) -> CityGridData:
    """
    Parses a specific city's CSV and KML configurations and returns a CityGridData instance.
    """
    city = city_id.lower().strip()
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "data"))
    
    # Default file mapping
    csv_file = "Bengaluru Electrical Substations.csv"
    kml_file = "division_boundry_map.kml"
    display_name = "Bengaluru Grid (BESCOM Network)"
    
    if "pune" in city:
        csv_file = "pune_substations.csv"
        kml_file = "pune_boundary.kml"
        display_name = "Pune Grid (MSETCL Network)"
    elif "delhi" in city:
        csv_file = "delhi_substations.csv"
        kml_file = "delhi_boundary.kml"
        display_name = "Delhi Grid (DTL Network)"
    elif "bhopal" in city:
        csv_file = "bhopal_substations.csv"
        kml_file = "bhopal_boundary.kml"
        display_name = "Bhopal Grid (MPPTCL Network)"
    elif "lucknow" in city:
        csv_file = "lucknow_substations.csv"
        kml_file = "lucknow_boundary.kml"
        display_name = "Lucknow Grid (UPPTCL Network)"
    elif "jhansi" in city:
        csv_file = "jhansi_substations.csv"
        kml_file = "jhansi_boundary.kml"
        display_name = "Jhansi Grid (UPPCL Network)"
        
    csv_path = os.path.join(data_dir, csv_file)
    kml_path = os.path.join(data_dir, kml_file)
    
    # Fallbacks to Bengaluru defaults if files do not exist
    if not os.path.exists(csv_path):
        logger.warning(f"City CSV {csv_file} not found. Falling back to default Bengaluru data.")
        csv_path = os.path.join(data_dir, "Bengaluru Electrical Substations.csv")
        display_name = "Bengaluru Grid (BESCOM Network)"
        city = "bengaluru"
    if not os.path.exists(kml_path):
        logger.warning(f"City KML {kml_file} not found. Falling back to default Bengaluru boundaries.")
        kml_path = os.path.join(data_dir, "division_boundry_map.kml")
        display_name = "Bengaluru Grid (BESCOM Network)"
        city = "bengaluru"
        
    # Run dynamic parser
    division_centroids = parse_kml_division_centroids(kml_path)
    dynamic_nodes = load_substations_from_csv(csv_path, division_centroids)
    dynamic_connections = generate_proximity_connections(dynamic_nodes)
    
    return CityGridData(
        id=city,
        display_name=display_name,
        nodes=dynamic_nodes,
        connections=dynamic_connections
    )

def reload_grid_config(city_name_raw: str):
    """
    Dynamically switches the active city context for legacy single-city compatibility.
    """
    config = parse_city_grid_config(city_name_raw)
    settings.city_name = config.display_name
    settings.app_name = f"AuraGrid {config.id.capitalize()} Utility Telemetry Service"
    settings.nodes = config.nodes
    settings.connections = config.connections
    logger.info(f"Switched legacy grid settings to {config.display_name} ({len(config.nodes)} nodes, {len(config.connections)} connections)")

def load_all_cities_config():
    """
    Loads configurations for all supported cities.
    """
    supported = ["bengaluru", "delhi", "pune", "bhopal", "lucknow", "jhansi"]
    for city in supported:
        try:
            settings.all_cities[city] = parse_city_grid_config(city)
            logger.info(f"Loaded config for city: {city} ({len(settings.all_cities[city].nodes)} nodes)")
        except Exception as e:
            logger.error(f"Failed to load grid config for city {city}: {str(e)}")

# Initialize all cities and legacy default config on module load
load_all_cities_config()
initial_city = os.getenv("GRID_CITY_NAME", "Bengaluru")
reload_grid_config(initial_city)

