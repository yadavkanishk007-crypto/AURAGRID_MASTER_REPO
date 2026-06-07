import { useState, useEffect } from "react";
import { getApiBaseUrl } from "@/utils/api";
import { supabase } from "@/utils/supabase";

export interface NodeConfigMetadata {
  name: string;
  initial_volume: number;
  max_capacity: number;
  min_capacity: number;
  growth: number;
  amplitude: number;
  latitude: number;
  longitude: number;
  voltage_class: number;
}

export interface ConnectionConfigMetadata {
  source: string;
  target: string;
  efficiency: number;
}

/**
 * Custom hook to manage the real-time power grid telemetry state, Time-Series logs, and frequency feeds.
 * Integrates user session fetching, locks city context for city admins, and appends city parameters to endpoints.
 */
export function useGridTelemetry(mounted: boolean, isOffline: boolean, baseTime: Date) {
  const [historicalData, setHistoricalData] = useState<Record<string, { volume: number[]; load: number[] }>>({});
  const [gridFrequency, setGridFrequency] = useState(50.0);
  const [nodesConfig, setNodesConfig] = useState<NodeConfigMetadata[]>([]);
  const [connectionsConfig, setConnectionsConfig] = useState<ConnectionConfigMetadata[]>([]);
  
  // Default values
  const [activeCity, setActiveCity] = useState("bengaluru");
  const [isCityLocked, setIsCityLocked] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [supportedCities, setSupportedCities] = useState<any[]>([
    {"id": "bengaluru", "name": "Bengaluru (BESCOM)", "center": [12.955, 77.64]},
    {"id": "delhi", "name": "Delhi (DTL)", "center": [28.7041, 77.1025]},
    {"id": "pune", "name": "Pune (MSETCL)", "center": [18.5204, 73.8567]},
    {"id": "bhopal", "name": "Bhopal (MPPTCL)", "center": [23.2599, 77.4126]},
    {"id": "lucknow", "name": "Lucknow (UPPTCL)", "center": [26.8467, 80.9462]},
    {"id": "jhansi", "name": "Jhansi (UPPCL)", "center": [25.4484, 78.5685]}
  ]);

  // --- Fetch User profile and lock city context ---
  useEffect(() => {
    if (!mounted) return;

    const checkAuthAndProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = "/login";
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
          if (profile.role === "command_centre_admin" && profile.city_id) {
            console.log(`Locking active city to command admin city context: ${profile.city_id}`);
            setActiveCity(profile.city_id);
            setIsCityLocked(true);
            
            // Filter cities list to only show assigned city
            const filtered = supportedCities.filter(c => c.id === profile.city_id);
            if (filtered.length > 0) {
              setSupportedCities(filtered);
            }
          }
        }
      } catch (err) {
        console.error("Auth profile check failed:", err);
      }
    };

    checkAuthAndProfile();
  }, [mounted]);

  // --- Fetch supported cities list (for super admin) ---
  useEffect(() => {
    if (!mounted || isCityLocked) return;
    const fetchCities = async () => {
      const pollUrl = getApiBaseUrl();
      if (!pollUrl) return;
      try {
        const res = await fetch(`${pollUrl}/api/settings/cities`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.cities) {
            setSupportedCities(data.cities);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch supported cities list.", err);
      }
    };
    fetchCities();
  }, [mounted, isCityLocked]);

  // --- Immediate Live Ingestion on Mount / Reload / City Change ---
  useEffect(() => {
    if (!mounted) return;

    if (isOffline) {
      const defaultNodes: NodeConfigMetadata[] = [
        {
          name: "Sharavathi Hydro Hub",
          initial_volume: 800.0,
          max_capacity: 1500.0,
          min_capacity: 20.0,
          growth: 65.0,
          amplitude: 80.0,
          latitude: 12.9716,
          longitude: 77.5946,
          voltage_class: 400
        },
        {
          name: "Koramangala Residential",
          initial_volume: 500.0,
          max_capacity: 1000.0,
          min_capacity: 20.0,
          growth: 45.0,
          amplitude: 120.0,
          latitude: 12.9352,
          longitude: 77.6244,
          voltage_class: 110
        },
        {
          name: "Whitefield Industrial",
          initial_volume: 650.0,
          max_capacity: 1200.0,
          min_capacity: 20.0,
          growth: 55.0,
          amplitude: 100.0,
          latitude: 12.9698,
          longitude: 77.7499,
          voltage_class: 220
        }
      ];

      const defaultConnections: ConnectionConfigMetadata[] = [
        { source: "Sharavathi Hydro Hub", target: "Koramangala Residential", efficiency: 0.15 },
        { source: "Koramangala Residential", target: "Whitefield Industrial", efficiency: 0.12 },
        { source: "Whitefield Industrial", target: "Sharavathi Hydro Hub", efficiency: 0.08 }
      ];

      setNodesConfig(defaultNodes);
      setConnectionsConfig(defaultConnections);

      const defaultHistory: Record<string, { volume: number[]; load: number[] }> = {};
      defaultNodes.forEach(node => {
        const vols = Array(24).fill(0).map((_, i) => {
          const t = i % 24;
          const diurnal = Math.sin(2 * Math.PI * (t - 6) / 24) * node.amplitude * 0.5;
          return Math.round(node.initial_volume * 0.8 + diurnal);
        });
        const loads = vols.map(v => parseFloat((v * 0.8).toFixed(2)));
        defaultHistory[node.name] = { volume: vols, load: loads };
      });
      setHistoricalData(defaultHistory);
      return;
    }

    const fetchInitialTelemetry = async () => {
      const pollUrl = getApiBaseUrl();
      if (!pollUrl) {
        console.log("NEXT_PUBLIC_API_URL is empty; skipping initial telemetry reload fetch.");
        return;
      }
      try {
        console.log("Fetching initial live telemetry configuration for active city:", activeCity);
        const url = `${pollUrl}/api/nodes/default?city_id=${activeCity}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();

          if (data && data.nodes) {
            setNodesConfig(data.nodes);
          }
          if (data && data.connections) {
            setConnectionsConfig(data.connections);
          }
          
          // Only update local active city if it matches context
          if (data && data.city && !isCityLocked) {
            setActiveCity(data.city);
          }

          // Clear historical data to prevent overlapping layout keys
          setHistoricalData({});

          if (data && data.historical_loads) {
            setHistoricalData(prev => {
              const updated = { ...prev };
              Object.keys(data.historical_loads).forEach(nodeName => {
                const liveHistory = data.historical_loads[nodeName];
                if (Array.isArray(liveHistory)) {
                  const base = { volume: [], load: [] };
                  const vols = Array(24).fill(0);
                  const loads = Array(24).fill(0);

                  const count = liveHistory.length;
                  for (let i = 0; i < count; i++) {
                    const idx = vols.length - count + i;
                    if (idx >= 0 && idx < vols.length) {
                      vols[idx] = liveHistory[i];
                      loads[idx] = parseFloat((liveHistory[i] * 0.8).toFixed(2));
                    }
                  }
                  updated[nodeName] = { volume: vols, load: loads };
                }
              });
              return updated;
            });
          }
        }
      } catch (error: any) {
        console.warn("Failed to fetch initial telemetry on reload.", error);
      }
    };

    fetchInitialTelemetry();
  }, [mounted, isOffline, activeCity, isCityLocked]);

  // --- Continuous Real-time Ingestion Ticker (2s HTTP fetch poll to government/telemetry) ---
  useEffect(() => {
    if (!mounted || isOffline) return;

    console.log(`Starting continuous real-time telemetry fetching for ${activeCity} every 2 seconds...`);

    const interval = setInterval(async () => {
      const apiBase = getApiBaseUrl();
      if (!apiBase) {
        console.log("NEXT_PUBLIC_API_URL is empty; skipping continuous telemetry poll.");
        return;
      }
      try {
        const url = `${apiBase}/api/v1/government/telemetry?city_id=${activeCity}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();

          // Update Grid Frequency
          if (data.sldc_metadata?.grid_frequency_hz) {
            setGridFrequency(data.sldc_metadata.grid_frequency_hz);
          }

          // Slide the historical streams with the new SLDC geocoded entries
          if (Array.isArray(data.active_telemetry)) {
            setHistoricalData(prev => {
              const nextHistory = { ...prev };

              data.active_telemetry.forEach((item: { node_name: string; active_power_mw: number; reactive_power_mvar: number }) => {
                const nodeName = item.node_name;
                const history = prev[nodeName] || { volume: [], load: [] };

                const newVols = history.volume.length > 0 ? [...history.volume] : Array(24).fill(0);
                const newLoads = history.load.length > 0 ? [...history.load] : Array(24).fill(0);

                if (newVols.length >= 24) newVols.shift();
                if (newLoads.length >= 24) newLoads.shift();

                const activePower = item.active_power_mw;
                const activeLoad = parseFloat((item.reactive_power_mvar / 0.15).toFixed(2));

                newVols.push(activePower);
                newLoads.push(activeLoad);

                nextHistory[nodeName] = { volume: newVols, load: newLoads };
              });

              return nextHistory;
            });
          }
        }
      } catch (error: any) {
        console.warn("Failed fetching from government telemetry API.", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [mounted, isOffline, activeCity]);

  return {
    historicalData,
    gridFrequency,
    nodesConfig,
    connectionsConfig,
    activeCity,
    setActiveCity,
    isCityLocked,
    userRole,
    supportedCities,
    setHistoricalData,
    setGridFrequency
  };
}
