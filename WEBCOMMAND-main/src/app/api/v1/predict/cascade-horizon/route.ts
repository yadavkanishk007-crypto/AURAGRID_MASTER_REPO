import { NextResponse } from "next/server";

// Hardcoded configurations matching src/utils/gridSimulation.ts
const NODES_CONFIG = {
  "Sharavathi Hydro Hub": {
    initial: 800.0,
    max: 1500.0,
    min: 20.0,
    growth: 65.0,
    amplitude: 80.0
  },
  "Koramangala Residential": {
    initial: 500.0,
    max: 1000.0,
    min: 20.0,
    growth: 45.0,
    amplitude: 120.0
  },
  "Whitefield Industrial": {
    initial: 650.0,
    max: 1200.0,
    min: 20.0,
    growth: 55.0,
    amplitude: 100.0
  }
};

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const horizonStr = searchParams.get("horizon");
    const horizon = horizonStr ? parseInt(horizonStr, 10) : 0;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Allow fallback if empty
    }

    const {
      historical_telemetry_stream = [],
      timestamp_utc = new Date().toISOString()
    } = body;

    const baseTime = new Date(timestamp_utc);
    const responseArray = [];

    // Map input stream indices: 0 -> Sharavathi, 1 -> Koramangala, 2 -> Whitefield
    const nodeNames = [
      "Sharavathi Hydro Hub",
      "Koramangala Residential",
      "Whitefield Industrial"
    ];

    let overallState: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" = "STABLE";

    // First pass to determine overall system state
    const nodesEvaluation = nodeNames.map((nodeName, idx) => {
      const config = NODES_CONFIG[nodeName as keyof typeof NODES_CONFIG];
      const baseLoad = (historical_telemetry_stream && typeof historical_telemetry_stream[idx] === "number")
        ? historical_telemetry_stream[idx]
        : config.initial;

      const growthVal = config.growth * horizon;
      const diurnalVal = Math.sin((horizon / 4) * Math.PI) * config.amplitude * 0.85;
      
      let cascadeIndex = 0;
      if (horizon > 6) {
        cascadeIndex = (horizon - 6) * 45.0;
      }

      const calculatedLoad = baseLoad + growthVal + diurnalVal + cascadeIndex;

      let status: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" = "STABLE";
      if (calculatedLoad >= config.max) {
        status = "CRITICAL_CASCADE_RISK";
        overallState = "CRITICAL_CASCADE_RISK";
      } else if (calculatedLoad >= config.max * 0.88 || calculatedLoad <= config.min * 1.5) {
        status = "VULNERABLE";
        if (overallState !== "CRITICAL_CASCADE_RISK") {
          overallState = "VULNERABLE";
        }
      }

      // Calculate delta rate of change
      let delta = 0.0;
      if (horizon === 0) {
        // Return a mock small fluctuation rate of change for look-ahead 0
        delta = (Math.random() - 0.5) * 8.0;
      } else {
        const prevHour = Math.max(0, horizon - 1);
        const prevGrowth = config.growth * prevHour;
        const prevDiurnal = Math.sin((prevHour / 4) * Math.PI) * config.amplitude * 0.85;
        const prevCascade = prevHour > 6 ? (prevHour - 6) * 45.0 : 0.0;
        const prevLoad = baseLoad + prevGrowth + prevDiurnal + prevCascade;
        delta = calculatedLoad - prevLoad;
      }

      return {
        nodeName,
        calculatedLoad,
        delta,
        status,
        max: config.max
      };
    });

    // Populate response array matching WebDesign.md contract (Section 2.2)
    for (const node of nodesEvaluation) {
      let exposure = "Koramangala Residential";
      if (node.nodeName === "Sharavathi Hydro Hub") {
        exposure = "Koramangala Residential";
      } else if (node.nodeName === "Koramangala Residential") {
        exposure = "Whitefield Industrial";
      } else {
        exposure = "Sharavathi Hydro Hub";
      }

      const breachTime = new Date(baseTime.getTime() + horizon * 60 * 60 * 1000).toISOString();

      responseArray.push({
        node_id: node.nodeName,
        system_state_evaluation: node.status,
        forecast_horizon_metrics: {
          calculated_peak_load_target: parseFloat(node.calculatedLoad.toFixed(2)),
          capacity_rate_of_change_delta: parseFloat(node.delta.toFixed(2)),
          system_structural_limit: node.max
        },
        propagation_path_alert: {
          is_anomaly_detected: node.status === "CRITICAL_CASCADE_RISK",
          predicted_breach_timestamp: breachTime,
          primary_downstream_exposure_vector: exposure
        }
      });
    }

    return NextResponse.json(responseArray);
  } catch (error: any) {
    console.error("Error in mock prediction API route:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
