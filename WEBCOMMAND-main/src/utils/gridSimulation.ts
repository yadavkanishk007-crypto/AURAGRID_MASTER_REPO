export interface NodeData {
  calculatedLoadTarget: number;
  capacityRateOfChangeDelta: number;
  maxCapacity: number;
  status: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE";
  waveletApproxSeries?: number[];
  waveletDetailSeries?: number[];
  combinedSeries?: number[];
}

// Fallback legacy configurations for safety
export const NODES_CONFIG = {
  "Sharavathi Hydro Hub": {
    id: "Sharavathi",
    name: "Sharavathi Hydro Hub",
    type: "Generation",
    min: 20.0,
    max: 1500.0,
    initial: 800.0,
    growth: 65.0,
    amplitude: 80.0
  },
  "Koramangala Residential": {
    id: "Koramangala",
    name: "Koramangala Residential",
    type: "Consumer",
    min: 20.0,
    max: 1000.0,
    initial: 500.0,
    growth: 45.0,
    amplitude: 120.0
  },
  "Whitefield Industrial": {
    id: "Whitefield",
    name: "Whitefield Industrial",
    type: "Industrial",
    min: 20.0,
    max: 1200.0,
    initial: 650.0,
    growth: 55.0,
    amplitude: 100.0
  }
};

// Computes local LSTM/ARIMA ensemble cascade calculations (Dynamic Fallback Mode)
export function runDynamicLocalForecastFallback(
  lookAheadHour: number,
  nodesConfig: any[],
  connectionsConfig: any[],
  latestLoads: Record<string, number>,
  secondLatestLoads: Record<string, number>
): {
  activeNodes: Record<string, NodeData>;
  globalState: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE";
  worstNode: string;
  exposure: string;
} {
  const fallbackNodes: Record<string, NodeData> = {};
  let fallbackGlobal: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE" = "STABLE";
  let worstNode = "";
  let exposure = "";

  for (const node of nodesConfig) {
    const name = node.name;
    const maxCapacity = node.max_capacity ?? 1000.0;
    const minCapacity = node.min_capacity ?? 20.0;
    const growth = node.growth ?? 30.0;
    const amplitude = node.amplitude ?? 80.0;

    // Derived from passed telemetry if available, else initial base
    const baseLoad = latestLoads[name] ?? node.initial_volume;
    
    const growthVal = growth * lookAheadHour;
    const diurnalVal = Math.sin((lookAheadHour / 4) * Math.PI) * amplitude * 0.85;
    
    let cascadeIndex = 0;
    if (lookAheadHour > 6) {
      cascadeIndex = (lookAheadHour - 6) * 45.0;
    }

    const calculatedLoad = baseLoad + growthVal + diurnalVal + cascadeIndex;

    let delta = 0;
    if (lookAheadHour === 0) {
      const prevLoad = secondLatestLoads[name] ?? baseLoad;
      delta = baseLoad - prevLoad;
    } else {
      const prevHour = Math.max(0, lookAheadHour - 1);
      const prevGrowth = growth * prevHour;
      const prevDiurnal = Math.sin((prevHour / 4) * Math.PI) * amplitude * 0.85;
      const prevCascade = prevHour > 6 ? (prevHour - 6) * 45.0 : 0;
      const prevCalculatedLoad = baseLoad + prevGrowth + prevDiurnal + prevCascade;
      delta = calculatedLoad - prevCalculatedLoad;
    }

    let status: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE" = "STABLE";
    if (calculatedLoad >= maxCapacity) {
      status = "CRITICAL_CASCADE_RISK";
      fallbackGlobal = "CRITICAL_CASCADE_RISK";
      worstNode = name;
    } else if (calculatedLoad >= maxCapacity * 0.88 || calculatedLoad <= minCapacity * 1.5) {
      status = "VULNERABLE";
      if (fallbackGlobal !== "CRITICAL_CASCADE_RISK") {
        fallbackGlobal = "VULNERABLE";
      }
    }

    // Populate mock curves for time-series charting
    const waveletApproxSeries: number[] = [];
    const waveletDetailSeries: number[] = [];
    const combinedSeries: number[] = [];
    for (let h = 1; h <= 12; h++) {
      const gVal = growth * h;
      const dVal = Math.sin((h / 4) * Math.PI) * amplitude * 0.85;
      const cIndex = h > 6 ? (h - 6) * 45.0 : 0;
      
      const waveletApprox = baseLoad + gVal;
      const waveletDetail = dVal + cIndex;
      const combined = waveletApprox + waveletDetail;
      
      waveletApproxSeries.push(parseFloat(waveletApprox.toFixed(2)));
      waveletDetailSeries.push(parseFloat(waveletDetail.toFixed(2)));
      combinedSeries.push(parseFloat(Math.max(5.0, combined).toFixed(2)));
    }

    fallbackNodes[name] = {
      calculatedLoadTarget: parseFloat(calculatedLoad.toFixed(2)),
      capacityRateOfChangeDelta: parseFloat(delta.toFixed(2)),
      maxCapacity: maxCapacity,
      status: status,
      waveletApproxSeries,
      waveletDetailSeries,
      combinedSeries
    };
  }

  // Find downstream exposure target of worstNode
  if (worstNode) {
    const conn = connectionsConfig.find(c => c.source === worstNode);
    if (conn) {
      exposure = conn.target;
    } else if (nodesConfig.length > 1) {
      // Find index
      const idx = nodesConfig.findIndex(n => n.name === worstNode);
      exposure = nodesConfig[(idx + 1) % nodesConfig.length].name;
    } else {
      exposure = worstNode;
    }
  } else if (nodesConfig.length > 0) {
    exposure = nodesConfig[0].name;
  }

  return {
    activeNodes: fallbackNodes,
    globalState: fallbackGlobal,
    worstNode,
    exposure
  };
}

// Deprecated old fallback function for back-compatibility
export function runLocalForecastFallback(
  lookAheadHour: number,
  latestLoads?: Record<string, number>,
  secondLatestLoads?: Record<string, number>
): {
  activeNodes: Record<string, NodeData>;
  globalState: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE";
  worstNode: string;
  exposure: string;
} {
  const nodesArr = Object.keys(NODES_CONFIG).map(k => ({
    name: k,
    initial_volume: NODES_CONFIG[k as keyof typeof NODES_CONFIG].initial,
    max_capacity: NODES_CONFIG[k as keyof typeof NODES_CONFIG].max,
    min_capacity: NODES_CONFIG[k as keyof typeof NODES_CONFIG].min,
    growth: NODES_CONFIG[k as keyof typeof NODES_CONFIG].growth,
    amplitude: NODES_CONFIG[k as keyof typeof NODES_CONFIG].amplitude
  }));
  const connsArr = [
    { source: "Sharavathi Hydro Hub", target: "Koramangala Residential", efficiency: 0.15 },
    { source: "Koramangala Residential", target: "Whitefield Industrial", efficiency: 0.12 },
    { source: "Whitefield Industrial", target: "Sharavathi Hydro Hub", efficiency: 0.08 }
  ];
  return runDynamicLocalForecastFallback(
    lookAheadHour,
    nodesArr,
    connsArr,
    latestLoads ?? {},
    secondLatestLoads ?? {}
  );
}
