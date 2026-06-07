import { useState, useEffect, useCallback, useRef } from "react";
import { runDynamicLocalForecastFallback, NodeData } from "@/utils/gridSimulation";
import { getApiBaseUrl } from "@/utils/api";
import { formatToIST } from "@/utils/date";

interface GridForecastProps {
  mounted: boolean;
  isOffline: boolean;
  lookAheadHour: number;
  historicalData: Record<string, { volume: number[]; load: number[] }>;
  baseTime: Date;
  nodesConfig: any[];
  connectionsConfig: any[];
  setGridFrequency?: React.Dispatch<React.SetStateAction<number>>;
  setHistoricalData?: React.Dispatch<React.SetStateAction<Record<string, { volume: number[]; load: number[] }>>>;
  activeCity: string;
}

interface ForecastMetric {
  calculated_peak_load_target: number;
  capacity_rate_of_change_delta: number;
  system_structural_limit: number;
  wavelet_approx_series?: number[];
  wavelet_detail_series?: number[];
  combined_series?: number[];
}

interface PropagationAlert {
  primary_downstream_exposure_vector: string;
}

interface ForecastNode {
  node_id: string;
  forecast_horizon_metrics: ForecastMetric;
  system_state_evaluation: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE";
  propagation_path_alert: PropagationAlert;
}

/**
 * Custom hook to manage the grid forecasting slider lifecycle and mock fallback logic.
 * Encapsulates forecasting REST queries, warning modal triggers, state indicators, and sandbox tickers.
 */
export function useGridForecast({
  mounted,
  isOffline,
  lookAheadHour,
  historicalData,
  baseTime,
  nodesConfig,
  connectionsConfig,
  setGridFrequency,
  setHistoricalData,
  activeCity
}: GridForecastProps) {
  const [activeNodes, setActiveNodes] = useState<Record<string, NodeData>>({});
  const [systemState, setSystemState] = useState<"STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE">("STABLE");
  const [worstNodeName, setWorstNodeName] = useState("");
  const [exposureVector, setExposureVector] = useState("Koramangala Residential");
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [modeActivated, setModeActivated] = useState<string>("WAVELET_REGRESSION");
  const [stationarityTests, setStationarityTests] = useState<any>(null);
  const [multiObjectiveOptimization, setMultiObjectiveOptimization] = useState<any>(null);
  const [confusionMatrixMetrics, setConfusionMatrixMetrics] = useState<any>(null);
  const [failureMatrixMetrics, setFailureMatrixMetrics] = useState<any>(null);
  const [cascadingMatrixMetrics, setCascadingMatrixMetrics] = useState<any>(null);
  const [agenticSwitchEnabled, setAgenticSwitchEnabled] = useState(false);

  const [modalState, setModalState] = useState<{
    visible: boolean;
    nodeName: string;
    breachMetric: string;
    timestamp: string;
    exposureVector: string;
    acknowledgedHours: Record<number, boolean>;
  }>({
    visible: false,
    nodeName: "",
    breachMetric: "",
    timestamp: "",
    exposureVector: "",
    acknowledgedHours: {}
  });

  // Keep a mutable ref of acknowledgedHours to avoid redundant trigger dependencies in effects
  const acknowledgedHoursRef = useRef(modalState.acknowledgedHours);
  useEffect(() => {
    acknowledgedHoursRef.current = modalState.acknowledgedHours;
  }, [modalState.acknowledgedHours]);

  const runLocalForecastFallbackHook = useCallback(() => {
    if (nodesConfig.length === 0) return;

    const latestLoads: Record<string, number> = {};
    const secondLatestLoads: Record<string, number> = {};

    nodesConfig.forEach(node => {
      const name = node.name;
      const history = historicalData[name] || { volume: [], load: [] };
      const volHistory = history.volume || [];
      latestLoads[name] = volHistory[volHistory.length - 1] || node.initial_volume;
      secondLatestLoads[name] = volHistory[volHistory.length - 2] || latestLoads[name];
    });

    const results = runDynamicLocalForecastFallback(
      lookAheadHour,
      nodesConfig,
      connectionsConfig,
      latestLoads,
      secondLatestLoads
    );
    
    setActiveNodes(results.activeNodes);
    setSystemState(results.globalState);
    setWorstNodeName(results.worstNode);
    setExposureVector(results.exposure);
    
    // Set mock fallback analytics matrices
    setConfusionMatrixMetrics({
      true_positives: results.globalState === "CRITICAL_CASCADE_RISK" ? 2 : 0,
      false_positives: 0,
      false_negatives: 0,
      true_negatives: nodesConfig.length - (results.globalState === "CRITICAL_CASCADE_RISK" ? 2 : 0)
    });
    setFailureMatrixMetrics({
      accurate: Math.max(0, nodesConfig.length - Math.max(1, Math.floor(lookAheadHour / 3))),
      phase_lag: Math.max(0, Math.floor(lookAheadHour / 4)),
      scale_bias: Math.max(0, Math.floor(lookAheadHour / 6)),
      composite: Math.max(0, Math.floor(lookAheadHour / 8))
    });
    
    const mockCascading: Record<string, Record<string, number>> = {};
    nodesConfig.forEach(src => {
      mockCascading[src.name] = {};
      nodesConfig.forEach(tgt => {
        if (src.name === tgt.name) {
          mockCascading[src.name][tgt.name] = 0;
        } else {
          mockCascading[src.name][tgt.name] = Math.min(95, Math.floor(Math.random() * 40) + lookAheadHour * 3);
        }
      });
    });
    setCascadingMatrixMetrics(mockCascading);

    // Warning Modal popup trigger check exactly on breach transition
    if (results.globalState === "CRITICAL_CASCADE_RISK") {
      const hasAck = acknowledgedHoursRef.current[lookAheadHour];
      if (!hasAck) {
        const data = results.activeNodes[results.worstNode];
        const nodeMeta = nodesConfig.find(n => n.name === results.worstNode);
        const maxLimit = nodeMeta ? nodeMeta.max_capacity : 1000;
        setModalState(prev => ({
          ...prev,
          visible: true,
          nodeName: results.worstNode,
          breachMetric: `Volume: ${data?.calculatedLoadTarget.toLocaleString()} MW (Max limit: ${maxLimit} MW)`,
          timestamp: `${formatToIST(new Date(baseTime.getTime() + lookAheadHour * 60 * 60 * 1000))} IST`,
          exposureVector: results.exposure
        }));
      }
    } else {
      // Automatically reset acknowledgment for this look-ahead hour when status returns below critical
      setModalState(prev => {
        if (prev.acknowledgedHours[lookAheadHour]) {
          const nextAcks = { ...prev.acknowledgedHours };
          delete nextAcks[lookAheadHour];
          return { ...prev, acknowledgedHours: nextAcks };
        }
        return prev;
      });
    }
  }, [lookAheadHour, historicalData, baseTime, nodesConfig, connectionsConfig]);

  // --- Real-Time REST Ingestion Fetch Loop ---
  useEffect(() => {
    if (!mounted || nodesConfig.length === 0) return;

    if (isOffline) {
      runLocalForecastFallbackHook();
      setUsingLocalFallback(true);
      return;
    }

    const triggerForecasterAPI = async () => {
      const apiBase = getApiBaseUrl();
      if (!apiBase) {
        console.log("NEXT_PUBLIC_API_URL is empty; skipping forecaster API call.");
        return;
      }
      try {
        // Collect current load telemetry to dispatch
        const telemetryStream = nodesConfig.map(node => {
          const name = node.name;
          const history = historicalData[name] || { volume: [], load: [] };
          const volHistory = history.volume || [];
          return volHistory[volHistory.length - 1] || node.initial_volume;
        });

        // Exact Request JSON Schema
        const requestPayload = {
          network_id: "BESCOM_Bengaluru_Grid",
          timestamp_utc: new Date().toISOString(),
          historical_telemetry_stream: telemetryStream,
          structural_link_coefficients: connectionsConfig.map(c => c.efficiency),
          active_nodes_in_partition: nodesConfig.length
        };

        const response = await fetch(`${apiBase}/api/v1/predict/cascade-horizon?horizon=${lookAheadHour}&city_id=${activeCity}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          throw new Error(`API error code: ${response.status}`);
        }

        const responseBody = await response.json();

        // Map Outbound Response Schema
        const mappedNodes: Record<string, NodeData> = {};
        let parsedGlobalState: typeof systemState = "STABLE";
        let worstNode = "";
        let exposure = "Koramangala Residential";

        // Support array response
        if (Array.isArray(responseBody)) {
          setModeActivated("WAVELET_REGRESSION");
          setStationarityTests(null);
          setMultiObjectiveOptimization(null);
          setConfusionMatrixMetrics(null);
          const nodesList = responseBody as ForecastNode[];
          for (const item of nodesList) {
            const name = item.node_id;
            mappedNodes[name] = {
              calculatedLoadTarget: item.forecast_horizon_metrics.calculated_peak_load_target,
              capacityRateOfChangeDelta: item.forecast_horizon_metrics.capacity_rate_of_change_delta,
              maxCapacity: item.forecast_horizon_metrics.system_structural_limit,
              status: item.system_state_evaluation,
              waveletApproxSeries: item.forecast_horizon_metrics.wavelet_approx_series,
              waveletDetailSeries: item.forecast_horizon_metrics.wavelet_detail_series,
              combinedSeries: item.forecast_horizon_metrics.combined_series
            };
            if (item.system_state_evaluation === "CRITICAL_CASCADE_RISK") {
              parsedGlobalState = "CRITICAL_CASCADE_RISK";
              worstNode = name;
              exposure = item.propagation_path_alert.primary_downstream_exposure_vector;
            } else if (item.system_state_evaluation === "VULNERABLE" && parsedGlobalState !== "CRITICAL_CASCADE_RISK") {
              parsedGlobalState = "VULNERABLE";
            }
          }
        } else if (responseBody && typeof responseBody === "object") {
          const resObj = responseBody as any;
          if (resObj.mode_activated) setModeActivated(resObj.mode_activated);
          if (resObj.stationarity_tests) setStationarityTests(resObj.stationarity_tests);
          if (resObj.multi_objective_optimization) setMultiObjectiveOptimization(resObj.multi_objective_optimization);
          if (resObj.confusion_matrix_metrics) setConfusionMatrixMetrics(resObj.confusion_matrix_metrics);
          if (resObj.failure_matrix_metrics) setFailureMatrixMetrics(resObj.failure_matrix_metrics);
          if (resObj.cascading_matrix_metrics) setCascadingMatrixMetrics(resObj.cascading_matrix_metrics);
          if (resObj.agentic_switch_enabled !== undefined) setAgenticSwitchEnabled(resObj.agentic_switch_enabled);

          const nodesObj = responseBody as Record<string, ForecastNode>;
          for (const name of Object.keys(nodesObj)) {
            const item = nodesObj[name];
            if (item && item.forecast_horizon_metrics) {
              mappedNodes[name] = {
                calculatedLoadTarget: item.forecast_horizon_metrics.calculated_peak_load_target,
                capacityRateOfChangeDelta: item.forecast_horizon_metrics.capacity_rate_of_change_delta,
                maxCapacity: item.forecast_horizon_metrics.system_structural_limit,
                status: item.system_state_evaluation,
                waveletApproxSeries: item.forecast_horizon_metrics.wavelet_approx_series,
                waveletDetailSeries: item.forecast_horizon_metrics.wavelet_detail_series,
                combinedSeries: item.forecast_horizon_metrics.combined_series
              };
              if (item.system_state_evaluation === "CRITICAL_CASCADE_RISK") {
                parsedGlobalState = "CRITICAL_CASCADE_RISK";
                worstNode = name;
                exposure = item.propagation_path_alert.primary_downstream_exposure_vector;
              } else if (item.system_state_evaluation === "VULNERABLE" && parsedGlobalState !== "CRITICAL_CASCADE_RISK") {
                parsedGlobalState = "VULNERABLE";
              }
            }
          }
        }

        if (Object.keys(mappedNodes).length > 0) {
          setActiveNodes(mappedNodes);
          setSystemState(parsedGlobalState);
          setWorstNodeName(worstNode);
          setExposureVector(exposure);
          setUsingLocalFallback(false);

          // Alert dialog trigger triggers exactly on breach transition
          if (parsedGlobalState === "CRITICAL_CASCADE_RISK") {
            const hasAck = acknowledgedHoursRef.current[lookAheadHour];
            if (!hasAck) {
              setModalState(prev => ({
                ...prev,
                visible: true,
                nodeName: worstNode,
                breachMetric: `Volume: ${mappedNodes[worstNode]?.calculatedLoadTarget.toLocaleString()} MW (Max limit: ${mappedNodes[worstNode]?.maxCapacity} MW)`,
                timestamp: `${formatToIST(new Date(baseTime.getTime() + lookAheadHour * 60 * 60 * 1000))} IST`,
                exposureVector: exposure
              }));
            }
          } else {
            // Reset acknowledgment if state is no longer critical
            setModalState(prev => {
              if (prev.acknowledgedHours[lookAheadHour]) {
                const nextAcks = { ...prev.acknowledgedHours };
                delete nextAcks[lookAheadHour];
                return { ...prev, acknowledgedHours: nextAcks };
              }
              return prev;
            });
          }
        } else {
          runLocalForecastFallbackHook();
        }
      } catch {
        // Fallback Client Simulation since the API is offline
        runLocalForecastFallbackHook();
        setUsingLocalFallback(true);
      }
    };

    triggerForecasterAPI();
  }, [lookAheadHour, isOffline, historicalData, mounted, baseTime, nodesConfig, connectionsConfig, activeCity, runLocalForecastFallbackHook]);

  // --- Real-time Local Simulation Ticker (Sandbox Fallback Mode) ---
  useEffect(() => {
    if (!mounted || isOffline || !usingLocalFallback) return;

    console.log(`Engaging Government Telemetry API integration for fallback ${activeCity} (3s fetch poll)...`);

    const interval = setInterval(async () => {
      const apiBase = getApiBaseUrl();
      if (!apiBase) {
        console.log("NEXT_PUBLIC_API_URL is empty; skipping local sandbox telemetry fetch.");
        return;
      }
      try {
        const res = await fetch(`${apiBase}/api/v1/government/telemetry?city_id=${activeCity}`);
        if (!res.ok) throw new Error("SLDC telemetry stream failed");

        const data = await res.json();

        // Update Grid Frequency
        if (data.sldc_metadata?.grid_frequency_hz && setGridFrequency) {
          setGridFrequency(data.sldc_metadata.grid_frequency_hz);
        }

        // Slide the historical streams with the new SLDC geocoded entries
        if (Array.isArray(data.active_telemetry) && setHistoricalData) {
          setHistoricalData(prev => {
            const nextHistory: Record<string, { volume: number[]; load: number[] }> = {};

            data.active_telemetry.forEach((item: { node_name: string; active_power_mw: number; reactive_power_mvar: number }) => {
              const nodeName = item.node_name;
              const history = prev[nodeName] || { volume: [], load: [] };

              const newVols = [...(history.volume || [])];
              const newLoads = [...(history.load || [])];
              if (newVols.length >= 24) newVols.shift();
              if (newLoads.length >= 24) newLoads.shift();

              const activePower = item.active_power_mw;
              const activeLoad = parseFloat((item.reactive_power_mvar / 0.15).toFixed(2));

              newVols.push(activePower);
              newLoads.push(activeLoad);

              nextHistory[nodeName] = { volume: newVols, load: newLoads };
            });

            return { ...prev, ...nextHistory };
          });
        }
      } catch {
        console.warn("Failed fetching from government telemetry API. Falling back to inner wave harmonics.");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mounted, isOffline, usingLocalFallback, activeCity, setGridFrequency, setHistoricalData]);

  // Close Popup alert trigger acknowledgment
  function handleCloseModal() {
    setModalState(prev => ({
      ...prev,
      visible: false,
      acknowledgedHours: {
        ...prev.acknowledgedHours,
        [lookAheadHour]: true
      }
    }));
  }

  // Derive systemState based on isOffline configuration to avoid sync effect loops
  const computedSystemState = isOffline ? ("OFFLINE" as const) : systemState;

  return {
    activeNodes,
    systemState: computedSystemState,
    worstNodeName,
    exposureVector,
    usingLocalFallback,
    modalState,
    handleCloseModal,
    modeActivated,
    stationarityTests,
    multiObjectiveOptimization,
    confusionMatrixMetrics,
    failureMatrixMetrics,
    cascadingMatrixMetrics,
    agenticSwitchEnabled,
    setAgenticSwitchEnabled
  };
}
