# AuraGrid Control Room - Database & UI Integration Specifications

This document outlines the database tables, schema models, and real-time subscription details to help the web/app designer build the control room visualization and telemetry charts accurately.

---

## 1. Network Topology (Nodes & Connections)

The grid consists of three primary nodes connected in a transmission cycle. Your UI layout/canvas should map these coordinates:

*   **Sharavathi Hydro Hub** (Generation Node)
*   **Koramangala Residential** (Consumer Node)
*   **Whitefield Industrial** (Industrial Node)

### Node Specifications (`public.nodes` table)
Each node has active capacities and thresholds that dictate its visual state:

| Field Name | Type | Description | UI/Design Mapping |
| :--- | :--- | :--- | :--- |
| `name` | `TEXT` | Unique identifier of the node. | Display name in card headers. |
| `current_volume` | `DOUBLE` | Current real-time load/volume capacity. | Dynamic bar/arc gauge value. |
| `max_capacity` | `DOUBLE` | Upper safety boundary limit. | Critical threshold markers on gauges. |
| `min_capacity` | `DOUBLE` | Lower safety boundary limit. | Minimum threshold markers on gauges. |
| `status` | `TEXT` | Operational status: `'NORMAL'` or `'ISOLATED'`. | **NORMAL**: Green/Emerald theme.<br>**ISOLATED**: Red/Crimson pulsing border. |

### Connection Specifications (`public.connections` table)
Defines grid lines (transmission paths) connecting the hubs:

| Field Name | Type | Description | UI/Design Mapping |
| :--- | :--- | :--- | :--- |
| `source` | `TEXT` | Source node name. | Start point coordinate of path. |
| `target` | `TEXT` | Target node name. | End point coordinate of path. |
| `efficiency` | `DOUBLE` | Flow coefficient efficiency ($k_{ij}$). | **Stroke Width/Speed**: Map higher efficiency values to thicker lines or faster particle animation flows on canvas. |

---

## 2. Real-Time Telemetry & Alerts

The control room must listen to two separate streams to display operational trends and warnings.

### Historical Charts (`public.telemetry_logs` table)
Stores historical records. Pull the last 24 records per node to render live line charts showing **Volume** and **Load** over time.
*   `timestamp`: Time marker.
*   `node_name`: Target node.
*   `volume`: Recorded volume.
*   `load`: Ingestion load.

### Real-Time Warning Modal (`public.alerts` table)
This table acts as a real-time event pipeline. The UI must subscribe to the stream of this table. When a new record arrives, display a modal dialog:

*   **Trigger**: Insert of a new row where `resolved = FALSE`.
*   **Severity Levels**:
    *   `WARNING`: Amber warning banner.
    *   `CRITICAL_CASCADE_RISK`: Crimson critical modal, lock user sliders, display "CASCADE BREACH DETECTED".
*   **Modal Information**: Should show `node_name`, the alert `message`, and the `timestamp`.

---

## 3. Client Security (Row Level Security - RLS)

> [!IMPORTANT]
> **Data Write/Read Boundaries**
> *   **Read Operations (`SELECT`)**: Client UI dashboards connect using the public `anon` key. They have full read access to select configuration parameters and stream tables.
> *   **Write Operations (`INSERT`/`UPDATE`)**: The client UI must **not** perform direct inserts/updates to the database tables. Any grid interactions (e.g., sliding a controller to change volume) must send a request to the FastAPI server endpoint (e.g. `POST /api/forecast`), which processes calculations and updates Supabase using the backend `service_role` key.
