# ⚡ AuraGrid

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100.0%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Run%20%26%20Build-4285F4?logo=google-cloud&logoColor=white)](https://cloud.google.com/run)

> **State-of-the-art Real-time Smart Grid Forecasting & Ingestion Engine.**  
> **Designed specifically for lower-tier and higher-tier Indian cities to optimize power distribution and prevent cascading failures.**  
> Solely Designed and Engineered by **Kanishk Yadav**, Lead Engineer and Developer.

---

## 📋 Table of Contents
- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Multi-Tier Indian Grid Topology & Testing](#-multi-tier-indian-grid-topology--testing)
- [Local Setup & Installation](#-local-setup--installation)
- [Google Cloud Deployment](#-google-cloud-deployment)
- [Credits & Authorship](#-credits--authorship)

---

## 🔍 Project Overview

**AuraGrid** is an advanced telemetry ingestion, forecasting, and simulation platform engineered specifically to handle the unique challenges of electrical distribution networks across **lower-tier (Tier-2/Tier-3) and higher-tier (Tier-1) Indian cities**. 

Indian power grids experience highly dynamic load variations, ranging from rapid industrial surges in manufacturing hubs to fluctuating household demands. AuraGrid combines a dual-model time-series forecasting ensemble with a compartment mass-balance filter to prevent cascading outages and blackouts across interconnected substations.

To validate the engine under real-world conditions, the platform was successfully **tested and calibrated using the Bengaluru BESCOM Network topology**.

---

## 🏛️ System Architecture

AuraGrid's data flow is structured to handle concurrent forecasting calculations, live database synchronization, and low-latency client broadcasts:

```mermaid
graph TD
    %% Styling
    classDef client fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef server fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef engine fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff;
    classDef db fill:#ec4899,stroke:#be185d,stroke-width:2px,color:#fff;

    %% Nodes
    subgraph UI ["Client Dashboard (Frontend UI)"]
        DASH["Interactive Control Panel"]:::client
        WS_C["WS Telemetry Client"]:::client
        ALERTS["Real-time Alert Modal"]:::client
    end

    subgraph API ["FastAPI Backend Server"]
        WS_M["WebSocket Connection Manager"]:::server
        T_STORE["In-Memory Telemetry Store"]:::server
        T_DAEMON["Telemetry Daemon Loop (2s ticks)"]:::server
        REST["REST API Endpoints (/forecast, /nodes/default)"]:::server
    end

    subgraph COMP ["AuraGrid Inference & Simulation Engine"]
        ENS["LSTM + ARIMA Ensemble"]:::engine
        MBF["Compartment Mass-Balance Filter"]:::engine
    end

    subgraph DATA ["Data Layer"]
        SUPA[("Supabase Postgres Database")]:::db
    end

    %% Connections
    DASH -->|POST /forecast| REST
    WS_C <-->|ws/telemetry| WS_M
    WS_M <--> T_STORE
    T_DAEMON -->|Tick Simulation| T_STORE
    T_STORE -->|Sync State| SUPA
    REST -->|Execute| COMP
    COMP -->|Predict / Simulate| ENS
    ENS -->|Predict Load| MBF
    MBF -->|Return Volumes & Status| REST
```

---

## ✨ Key Features

*   **📈 Adaptive Time-Series Ensemble**:
    *   Integrates deep learning **LSTM** models (using 12-lag autoregressive weight matrices) with **ARIMA** models (utilizing Fourier seasonal cycle projections).
    *   Generates a weighted ensemble load prediction: $L_t = 0.6 \cdot LSTM + 0.4 \cdot ARIMA$.
    *   Robust against high volatility load signatures characteristic of lower-tier Indian cities with irregular industrial schedules.
*   **🛡️ Cascading Failure Prevention**:
    *   Simulates grid flows using a Compartment Mass-Balance Filter to calculate node volumes over a 12-to-24 hour horizon.
    *   Detects boundary violations and automatically flags and **isolates** failed nodes (severing connections to prevent cascading network failures across municipal limits).
*   **⚡ Real-Time Streaming (WebSockets)**:
    *   Features a persistent background Telemetry Ingestion Daemon ticking every 2 seconds.
    *   Broadcasts live grid health, log volumes, and alerts to all connected WebSockets.
*   **💾 Supabase Sync & Row Level Security (RLS)**:
    *   Supports dynamic synchronization between local storage, in-memory configurations, and Supabase database tables.
    *   Leverages database RLS policies allowing clients to read raw telemetry while routing writes securely through the backend.

---

## 🗺️ Multi-Tier Indian Grid Topology & Testing

AuraGrid is configurable for different cities via environment settings. The reference deployment was calibrated and tested against a three-node transmission cycle representing typical municipal hubs (using BESCOM coordinates):

| Calibrated Node | Typology Category | Capacity Limits (Min / Max) | Role in Indian Grids |
| :--- | :--- | :--- | :--- |
| **Sharavathi Hydro Hub** | Generation Hub | 20.0 / 1500.0 Units | Hydro/Thermal Generation Plant supplying municipal grids. |
| **Koramangala Residential** | Consumer Hub | 20.0 / 1000.0 Units | High volatility residential consumer load (tested on BESCOM). |
| **Whitefield Industrial** | Industrial Hub | 20.0 / 1200.0 Units | Heavy load industrial manufacturing zone with peak shifting. |

---

## ⚙️ Local Setup & Installation

### 1. Requirements
*   Python 3.10 or 3.11
*   Supabase Account (Database instance)

### 2. Standard Installation

```bash
# Clone the repository
git clone <your-repository-url>
cd AURAGRID

# Set up the virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 3. Configuration

You can customize AuraGrid for any Indian city (e.g., Delhi, Pune, Patna, Lucknow) using environment variables. 

Create a `.env` file at the root of the repository:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
GRID_APP_NAME="AuraGrid Utility Telemetry Service"
GRID_CITY_NAME="Pune Grid (MSEDCL Network)" # Example configuration for Tier-2/Tier-1 Pune
```

### 4. Running the Server

Launch the ASGI server with hot reloading enabled:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Interactive API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Control Dashboard: [http://localhost:8000/static/index.html](http://localhost:8000/static/index.html)

---

## 🚢 Google Cloud Deployment

AuraGrid is optimized for deployment to **Google Cloud Run** using containerized Docker environments. 

For complete documentation regarding gcloud configuration, WSL (Windows Subsystem for Linux) setup, building with Cloud Build, and secure secret management, read the dedicated [GCP Deployment Walkthrough](file:///e:/AURAGRID/GCP_DEPLOYMENT_WALKTHROUGH.md).

---

## 💎 Credits & Authorship

AuraGrid is designed, engineered, and developed from the ground up solely by:

**Kanishk Yadav**  
*Lead Engineer & Developer*  

All system components, from mathematical forecasting models to real-time streaming architectures, are proprietary works.
