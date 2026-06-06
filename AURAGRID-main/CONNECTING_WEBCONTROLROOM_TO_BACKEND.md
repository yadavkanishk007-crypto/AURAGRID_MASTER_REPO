# 🔗 Connecting Web Control Room to Production Backend

This document details how to connect the **Next.js Web Control Room Dashboard** to the live **AuraGrid production backend** hosted on Google Cloud Run and the Supabase database instance.

---

## 🌐 Production Endpoints

*   **FastAPI Backend URL:** `https://auragrid-backend-689922962048.asia-south1.run.app`
*   **Secure WebSocket URL:** `wss://auragrid-backend-689922962048.asia-south1.run.app/api/ws/telemetry`
*   **Supabase Database URL:** `https://vufihzoqihpglreolfmc.supabase.co`

---

## ⚙️ Step 1: Configure Environment Variables on Vercel or GCP

When deploying the Next.js frontend to **Vercel** or **Google Cloud**, set the following environment variables in the deployment dashboard (or add them to `.env.local` for local frontend testing):

```env
# Point the frontend to the live FastAPI backend for prediction slider changes
NEXT_PUBLIC_API_URL=https://auragrid-backend-689922962048.asia-south1.run.app

# Establish the live telemetry push channel (WSS is required on HTTPS websites)
NEXT_PUBLIC_WS_URL=wss://auragrid-backend-689922962048.asia-south1.run.app/api/ws/telemetry

# Set Supabase connection details (Read-only access via Row Level Security)
NEXT_PUBLIC_SUPABASE_URL=https://vufihzoqihpglreolfmc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Zmloem9xaWhwZ2xyZW9sZm1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY4MzI2MSwiZXhwIjoyMDk1MjU5MjYxfQ.5Y0PhuvFxu6VpgLvHhDtSwvRVBoCOyqR7KnxecLzCHw
```

> [!IMPORTANT]
> **HTTPS Security constraint (WS vs WSS):**
> Because Vercel and GCP Cloud Run deploy the Next.js frontend over a secure `https://` connection, standard browsers will block unsecure WebSocket connections (`ws://`). You **must** use `wss://` (WebSocket Secure) for the `NEXT_PUBLIC_WS_URL` configuration to prevent browser security blocking.

---

## 🛡️ Step 2: Verification of Backend Integration Capabilities

The FastAPI backend has been updated to include full compatibility layers for all frontend routes:

### 1. CORS Verification (Cross-Origin Resource Sharing)
*   The FastAPI backend uses `CORSMiddleware` configured with `allow_origins=["*"]`. 
*   **Result:** The Next.js frontend running on Vercel (e.g. `*.vercel.app`) can query the backend directly from the user's browser without encountering CORS policy blocks.

### 2. Supported Routes Checklist
The backend now implements the exact routes expected by the Next.js codebase:

| Endpoint | Method | Purpose | Source File |
| :--- | :--- | :--- | :--- |
| `/api/nodes/default` | `GET` | Pulls default node configurations and default historical maps | `app/api/endpoints.py` |
| `/api/v1/predict/cascade-horizon` | `POST` | Models grid time-travel slider forecasts (0–12 hours look-ahead) | `app/api/endpoints.py` |
| `/api/v1/government/telemetry` | `GET` | Simulates real-time SLDC frequency/voltage waves (3s ticks) | `app/api/endpoints.py` |
| `/api/ws/telemetry` | `WS` | Establishes low-latency WebSocket live updates channel | `app/api/endpoints.py` |

---

## 🧪 Step 3: Local Integration Smoke Tests

To verify that the Next.js Web Control Room communicates successfully before deploying:

1.  Run the Next.js development server locally:
    ```bash
    npm run dev
    ```
2.  Open your browser console (`F12`) and go to the Network tab.
3.  Change the footer slider:
    *   Verify a successful `200 OK` from `POST https://auragrid-backend-689922962048.asia-south1.run.app/api/v1/predict/cascade-horizon?horizon=X`.
4.  Confirm the telemetry stream status:
    *   Verify the WS connection to `wss://auragrid-backend-689922962048.asia-south1.run.app/api/ws/telemetry` status is `101 Switching Protocols` and messages are streaming.
