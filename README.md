# AURAGRID Master Repository

This is the main hub for AURAGRID — an end-to-end smart grid platform designed to handle the unpredictable power dynamics of Indian cities.

## What's Inside

### [AURAGRID-main](./AURAGRID-main)
The backend engine. This is where the heavy lifting happens.

**What it does:**
- Ingests real-time telemetry from grid sensors and substations
- Runs dual forecasting models to predict load patterns across the network
- Applies compartment mass-balance filters to detect and prevent cascading failures
- Syncs everything with Supabase and pushes updates over WebSocket

**Built with:**
- FastAPI for the REST/WebSocket server
- Python for the forecasting logic and grid simulation
- Google Cloud Run for deployment

**Key folders:**
- `models/` — Time-series forecasting ensemble and grid state models
- `api/` — FastAPI endpoints and WebSocket handlers
- `ingestion/` — Telemetry collection and normalization
- `mobile_app/` — Flutter mobile client for field operators

### [WEBCOMMAND-main](./WEBCOMMAND-main)
The command center dashboard. Where operators see everything and control the grid.

**What it does:**
- Real-time visualization of grid topology and power flows
- Live monitoring of substations, transformers, and load distribution
- Command execution interface to control grid infrastructure
- Historical data analysis and performance reports
- Alert system for anomalies and potential failures

**Built with:**
- TypeScript/React for the frontend (the visual stuff)
- WebSocket clients pulling live data from the AURAGRID backend
- Designed to be responsive and work on tablets in control rooms

**Live system:** [https://webcommand-center-689922962048.asia-south1.run.app](https://webcommand-center-689922962048.asia-south1.run.app)

## Tech Stack

- **Backend:** Python, FastAPI, Supabase
- **Frontend:** TypeScript, React, HTML/CSS
- **Infrastructure:** Google Cloud (Run, Build)
- **Mobile:** Flutter
- **Core Processing:** C++ (performance-critical forecasting kernels), CMake

## Why This Project?

Indian power grids are notoriously complex. Load swings from industrial facilities can hit sudden and hard. Household demand fluctuates unpredictably. One cascading failure in a substation can black out entire neighborhoods.

AURAGRID was built to:
1. See problems coming before they happen (forecasting)
2. Understand how failures propagate through the network (compartment modeling)
3. Give operators the data and tools to make fast decisions (WEBCOMMAND)
4. Reach field teams quickly (mobile app)

The platform was tested and calibrated against the Bengaluru BESCOM network topology to validate performance in real-world conditions.

## Getting Started

### For Backend Development
```bash
cd AURAGRID-main
# Check the README there for setup instructions
```

### For Frontend Development
```bash
cd WEBCOMMAND-main
# Check the README there for setup instructions
```

## Project Structure

```
AURAGRID_MASTER_REPO/
├── AURAGRID-main/          # Backend: forecasting engine + API server
│   ├── models/             # ML models and grid state management
│   ├── api/                # FastAPI application
│   ├── ingestion/          # Telemetry pipeline
│   └── mobile_app/         # Flutter mobile application
│
└── WEBCOMMAND-main/        # Frontend: web dashboard + command center
    ├── src/                # React components and pages
    ├── public/             # Static assets
    └── package.json        # Dependencies
```

## How It Works (The Quick Version)

1. **Data In:** Grid sensors send telemetry to AURAGRID's ingestion pipeline
2. **Processing:** The forecasting engine runs time-series models on incoming data
3. **State Update:** Grid state gets updated and stored in Supabase
4. **Broadcast:** Changes are pushed to connected WebSocket clients in real-time
5. **Visualization:** WEBCOMMAND renders the live grid state on operator dashboards
6. **Commands:** Operators use WEBCOMMAND to send control signals back to the grid
7. **Execution:** Commands get queued and executed across substations

## Deployment

Both components are deployed on Google Cloud:
- **AURAGRID backend** runs on Cloud Run with automatic scaling
- **WEBCOMMAND frontend** runs on Cloud Run as a static app
- **Database** is hosted on Supabase

Details in each component's README.

## Development Notes

- The codebase is intentionally modular — backend and frontend can be developed independently
- Each major component (AURAGRID-main and WEBCOMMAND-main) has its own README with detailed setup
- Telemetry formats are standardized through the ingestion pipeline
- WebSocket protocol is defined in both backend and frontend

## License

This repository doesn't currently have a license specified. Check individual component READMEs for any licensing information.

---

**Built by:** Kanishk Yadav

For detailed technical information, documentation, and contribution guidelines, see the READMEs in each component directory.
