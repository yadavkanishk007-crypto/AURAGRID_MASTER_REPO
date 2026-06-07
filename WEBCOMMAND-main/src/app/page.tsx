"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import NodeCard from "@/components/NodeCard";
import WarningModal from "@/components/WarningModal";
import AlertToast from "@/components/AlertToast";
import FooterSlider from "@/components/FooterSlider";
import dynamic from "next/dynamic";
import AmberWarningBanner from "@/components/AmberWarningBanner";
import CanvasTooltip from "@/components/CanvasTooltip";

const TopologyCanvas = dynamic(() => import("@/components/TopologyCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", background: "#09090b", color: "#71717a" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid rgba(249, 115, 22, 0.15)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "12px" }} />
      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Loading Spatial Topology Canvas...</span>
    </div>
  )
});

import { useGridTelemetry } from "@/hooks/useGridTelemetry";
import { useGridForecast } from "@/hooks/useGridForecast";
import { getApiBaseUrl } from "@/utils/api";
import { supabase } from "@/utils/supabase";
import { formatToISTShort } from "@/utils/date";

// Helper to parse clean node name from field worker emails
function parseNodeNameFromEmail(email: string): string {
  if (!email) return "";
  const localPart = email.split("@")[0];
  if (!localPart || !localPart.includes(".")) return "";
  const parts = localPart.split(".");
  if (parts.length < 2) return "";
  
  // Second part onwards is the node name
  const nodeRaw = parts.slice(1).join(".");
  return nodeRaw
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface ChartItem {
  label: string;
  value: number;
  color: string;
}

function drawSvgBarChart(data: ChartItem[]) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const height = 50;
  const width = 280;
  const barWidth = 35;
  const gap = 25;
  
  return (
    <svg width="100%" height={height + 15} viewBox={`0 0 ${width} ${height + 15}`} style={{ overflow: "visible" }}>
      {data.map((item, idx) => {
        const x = idx * (barWidth + gap) + 20;
        const barHeight = (item.value / maxVal) * height;
        const y = height - barHeight;
        
        return (
          <g key={item.label}>
            {/* Bar */}
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={item.color}
              rx="3"
              style={{ transition: "all 0.5s ease" }}
            />
            {/* Value label */}
            <text
              x={x + barWidth / 2}
              y={y - 4}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="8px"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {Math.round(item.value)}
            </text>
            {/* Label */}
            <text
              x={x + barWidth / 2}
              y={height + 11}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="7px"
              fontFamily="sans-serif"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function renderModelBehaviorChart(waveletApproxData: number[], waveletDetailData: number[], combinedData: number[], maxCap: number, nodeName: string) {
  const padSeries = (arr: number[]) => {
    const defaultVals = [100, 150, 180, 200, 220, 250, 280, 310, 340, 370, 400, 450];
    const out = [...arr];
    while (out.length < 12) {
      out.push(out[out.length - 1] ?? defaultVals[out.length] ?? 100);
    }
    return out.slice(0, 12);
  };

  const waveletApprox = padSeries(waveletApproxData);
  const waveletDetail = padSeries(waveletDetailData);
  const combined = padSeries(combinedData);

  const maxVal = Math.max(...waveletApprox, ...waveletDetail, ...combined, maxCap) * 1.15 || 1000;
  const minVal = Math.min(...waveletApprox, ...waveletDetail, ...combined, 0);
  const range = (maxVal - minVal) || 1;

  const width = 450;
  const height = 150;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 20;

  const getX = (idx: number) => paddingLeft + (idx / 11) * (width - paddingLeft - paddingRight);
  const getY = (val: number) => height - paddingBottom - ((val - minVal) / range) * (height - paddingTop - paddingBottom);

  const getLinePath = (data: number[]) => {
    return data.map((val, idx) => `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(val)}`).join(" ");
  };

  const waveletApproxPath = getLinePath(waveletApprox);
  const waveletDetailPath = getLinePath(waveletDetail);
  const combinedPath = getLinePath(combined);
  const limitY = getY(maxCap);

  return (
    <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "8px", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fff" }}>Cumulative Model Behavior</span>
          <span style={{ fontSize: "0.65rem", color: "#f97316", marginLeft: "8px", fontWeight: 600 }}>({nodeName})</span>
        </div>
        
        <div style={{ display: "flex", gap: "10px", fontSize: "0.55rem", fontWeight: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "8px", height: "8px", position: "relative" }}>
              <span style={{ width: "8px", height: "1.5px", background: "#f97316" }} />
              <span style={{ position: "absolute", width: "3.5px", height: "3.5px", background: "#f97316", borderRadius: "50%", border: "0.5px solid #fff" }} />
            </span>
            <span style={{ color: "#cbd5e1" }}>Wavelet Combined</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "2px", background: "#eab308" }} />
            <span style={{ color: "#cbd5e1" }}>Wavelet Detail (GA)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "2px", background: "#71717a", strokeDasharray: "2,2" }} />
            <span style={{ color: "#cbd5e1" }}>Wavelet Approx (Trend)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "2px", borderTop: "2px dashed #ef4444" }} />
            <span style={{ color: "#ef4444" }}>Limit</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <defs>
            <filter id="neon-glow-forecast" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="pulsing-wave-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.25">
                <animate attributeName="stopOpacity" values="0.25;0.08;0.25" dur="3s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
            const val = minVal + p * range;
            const y = getY(val);
            return (
              <g key={idx}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <text x={paddingLeft - 6} y={y + 3} textAnchor="end" fill="#71717a" fontSize="7px" fontFamily="monospace">
                  {Math.round(val).toLocaleString()}
                </text>
              </g>
            );
          })}

          {Array.from({ length: 12 }, (_, i) => {
            const x = getX(i);
            return (
              <g key={i}>
                <line x1={x} y1={paddingTop} x2={x} y2={height - paddingBottom} stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
                {i % 2 === 0 && (
                  <text x={x} y={height - paddingBottom + 9} textAnchor="middle" fill="#71717a" fontSize="7px" fontFamily="monospace">
                    {i + 1}h
                  </text>
                )}
              </g>
            );
          })}

          <line x1={paddingLeft} y1={limitY} x2={width - paddingRight} y2={limitY} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3,3" />

          <path d={waveletApproxPath} fill="none" stroke="#71717a" strokeWidth="1.2" strokeDasharray="2,2" style={{ transition: "d 0.5s ease" }} />
          <path d={waveletDetailPath} fill="none" stroke="#eab308" strokeWidth="1.2" style={{ transition: "d 0.5s ease" }} />
          
          {/* Glowing outline for combined path */}
          <path d={combinedPath} fill="none" stroke="#f97316" strokeWidth="4.0" filter="url(#neon-glow-forecast)" opacity="0.3" style={{ transition: "d 0.5s ease" }} />

          {/* Main solid line for combined path */}
          <path d={combinedPath} fill="none" stroke="#f97316" strokeWidth="1.8" style={{ transition: "d 0.5s ease" }} />

          {/* Circular markers at point coordinates */}
          {combined.map((val, idx) => (
            <circle
              key={idx}
              cx={getX(idx)}
              cy={getY(val)}
              r="2.8"
              fill="#f97316"
              stroke="#fff"
              strokeWidth="0.8"
              style={{ transition: "all 0.5s ease" }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function renderMultiObjectiveChart(optData: any, isStationary: boolean) {
  const width = 300;
  const height = 150;
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 20;

  if (isStationary || !optData) {
    return (
      <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fff", marginBottom: "8px", flexShrink: 0 }}>Multi-Objective GA Optimization</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.04)", padding: "16px", textAlign: "center" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#eab308", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>GA Solver Standby</span>
          <span style={{ fontSize: "0.62rem", color: "#a1a1aa", lineHeight: "1.3" }}>Stationary signal stream detected. Running Wavelet Regression track directly.</span>
        </div>
      </div>
    );
  }

  let paretoPoints: { rmse: number; latency: number }[] = optData.pareto_points || [];

  if (paretoPoints.length === 0) {
    paretoPoints = Array.from({ length: 25 }, (_, i) => {
      const rmse = 400 + i * 15 + Math.sin(i * 1.5) * 10;
      const latency = Math.max(1.0, 9 - i * 0.3 - Math.sin(i * 1.5) * 1.2);
      return { rmse, latency };
    });
  }

  const rmseValues = paretoPoints.map(p => p.rmse);
  const latValues = paretoPoints.map(p => p.latency);

  const minR = Math.min(...rmseValues, optData.objective_a_rmse || 0);
  const maxR = Math.max(...rmseValues, optData.objective_a_rmse || 100);
  const minL = Math.min(...latValues, optData.objective_b_latency || 0);
  const maxL = Math.max(...latValues, optData.objective_b_latency || 12);

  const rangeR = (maxR - minR) || 1.0;
  const rangeL = (maxL - minL) || 1.0;

  const getX = (r: number) => paddingLeft + ((r - minR) / rangeR) * (width - paddingLeft - paddingRight);
  const getY = (l: number) => height - paddingBottom - ((l - minL) / rangeL) * (height - paddingTop - paddingBottom);

  const bestR = optData.objective_a_rmse || minR + rangeR * 0.3;
  const bestL = optData.objective_b_latency || minL + rangeL * 0.2;

  const bestX = getX(bestR);
  const bestY = getY(bestL);

  const sortedPareto = [...paretoPoints].sort((a, b) => a.rmse - b.rmse);
  const frontierPath = sortedPareto.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${getX(pt.rmse)} ${getY(pt.latency)}`).join(" ");

  return (
    <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "6px", height: "100%", minHeight: 0, boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fff" }}>Pareto Frontier Search</span>
          <div style={{ display: "flex", gap: "6px", fontSize: "0.55rem", fontWeight: 600 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#f97316" }} />
              <span style={{ color: "#cbd5e1" }}>Best</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#52525b" }} />
              <span style={{ color: "#cbd5e1" }}>Solvers</span>
            </div>
          </div>
        </div>
        <span style={{ fontSize: "0.53rem", color: "#64748b", marginTop: "1px", lineHeight: "1.2" }}>GA balancing accuracy (RMSE) against early warning trigger speed (Latency).</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: "#a1a1aa", background: "rgba(255,255,255,0.02)", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
        <span>Optimal Error: <strong style={{ color: "#f97316" }}>{bestR.toFixed(1)} MW</strong></span>
        <span>Optimal Latency: <strong style={{ color: "#f97316" }}>{bestL.toFixed(1)}h</strong></span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

          <text x={(width + paddingLeft - paddingRight) / 2} y={height - 2} textAnchor="middle" fill="#71717a" fontSize="6px" fontWeight="600">
            Ensemble RMSE Error (MW)
          </text>

          <text x={8} y={height / 2} textAnchor="middle" transform={`rotate(-90 8 ${height / 2})`} fill="#71717a" fontSize="6px" fontWeight="600">
            Latency (h)
          </text>

          {/* Draw Y-axis ticks */}
          {[0, 0.5, 1.0].map((p) => {
            const val = minL + p * rangeL;
            const y = getY(val);
            return (
              <g key={p}>
                <line x1={paddingLeft - 3} y1={y} x2={paddingLeft} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
                <text x={paddingLeft - 5} y={y + 2} textAnchor="end" fill="#52525b" fontSize="5px" fontFamily="monospace">
                  {val.toFixed(1)}h
                </text>
              </g>
            );
          })}

          {/* Draw X-axis ticks */}
          {[0, 0.5, 1.0].map((p) => {
            const val = minR + p * rangeR;
            const x = getX(val);
            return (
              <g key={p}>
                <line x1={x} y1={height - paddingBottom} x2={x} y2={height - paddingBottom + 3} stroke="rgba(255,255,255,0.1)" strokeWidth="0.8" />
                <text x={x} y={height - paddingBottom + 8} textAnchor="middle" fill="#52525b" fontSize="5px" fontFamily="monospace">
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Pareto Frontier dashed trade-off curve */}
          <path d={frontierPath} fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" style={{ transition: "all 0.5s ease" }} />

          {paretoPoints.map((pt, idx) => {
            const cx = getX(pt.rmse);
            const cy = getY(pt.latency);
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="2"
                fill="#52525b"
                opacity="0.6"
              />
            );
          })}

          {/* Pulsating outer radar ring */}
          <circle
            cx={bestX}
            cy={bestY}
            r="6"
            fill="none"
            stroke="#f97316"
            strokeWidth="1.2"
          >
            <animate attributeName="r" values="3;10;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.05;1" dur="2s" repeatCount="indefinite" />
          </circle>
          
          {/* Inner core selected solver point */}
          <circle
            cx={bestX}
            cy={bestY}
            r="3.5"
            fill="#f97316"
            stroke="#fff"
            strokeWidth="1.0"
          >
            <animate attributeName="r" values="3.5;4.5;3.5" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  );
}

export default function Home() {
  // --- Hydration Guard ---
  const [mounted, setMounted] = useState(false);

  // --- Auth & Profile States ---
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);

  // --- Core States ---
  const [isOffline, setIsOffline] = useState(false);
  const [lookAheadHour, setLookAheadHour] = useState(0);
  const [baseTime] = useState(new Date());
  
  // Interactive Search & Status Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sidebarTab, setSidebarTab] = useState<"substations" | "audit" | "create-user" | "directory" | "forecaster">("substations");
  const [selectedNodeGraph, setSelectedNodeGraph] = useState<string>("");

  // User Directory States
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([]);
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Create User Form States
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Tooltip tracking state
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    nodeName: string | null;
    x: number;
    y: number;
  }>({ visible: false, nodeName: null, x: 0, y: 0 });

  // Set mounted true on client asynchronously
  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  // --- Auth Session Guard & Profile Fetch ---
  useEffect(() => {
    if (!mounted) return;

    const checkSession = async () => {
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

        if (!profile || profile.role === "field_worker") {
          console.warn("Unauthorized access: Sign out and redirect to login portal.");
          await supabase.auth.signOut();
          window.location.href = "/login";
          return;
        }

        setUserEmail(session.user.email || "");
        setUserProfile(profile);
        setLoadingAuth(false);
      } catch (err) {
        console.error("Session verification failure:", err);
        window.location.href = "/login";
      }
    };

    checkSession();
  }, [mounted]);

  // --- 1. Custom Hook for real-time telemetry, websockets, and polling fallbacks ---
  const {
    historicalData,
    gridFrequency,
    nodesConfig,
    connectionsConfig,
    activeCity,
    setActiveCity,
    isCityLocked,
    supportedCities,
    setHistoricalData,
    setGridFrequency
  } = useGridTelemetry(mounted && !loadingAuth, isOffline, baseTime);

  const handleCityChange = async (cityId: string) => {
    if (isCityLocked) return;
    const apiBase = getApiBaseUrl();
    if (!apiBase || isOffline) {
      setActiveCity(cityId);
      return;
    }
    try {
      console.log("Switching active operational city context to:", cityId);
      const response = await fetch(`${apiBase}/api/settings/city`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityId })
      });
      if (response.ok) {
        setActiveCity(cityId);
      } else {
        console.error("Failed to switch city context on backend, falling back locally");
        setActiveCity(cityId);
      }
    } catch (err) {
      console.error("Error calling settings switch endpoint, falling back locally:", err);
      setActiveCity(cityId);
    }
  };

  // --- 2. Custom Hook for REST forecast ensemble calculators and warning modal logic ---
  const {
    activeNodes,
    systemState,
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
  } = useGridForecast({
    mounted: mounted && !loadingAuth,
    isOffline,
    lookAheadHour,
    historicalData,
    baseTime,
    nodesConfig,
    connectionsConfig,
    setGridFrequency,
    setHistoricalData,
    activeCity
  });

  const nodeNames = Object.keys(activeNodes);
  const activeSelectedNode = selectedNodeGraph || worstNodeName || nodeNames[0] || "";

  const handleToggleAgenticSwitch = async () => {
    const nextVal = !agenticSwitchEnabled;
    setAgenticSwitchEnabled(nextVal);
    const apiBase = getApiBaseUrl();
    if (!apiBase || isOffline) return;
    try {
      await fetch(`${apiBase}/api/settings/agentic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextVal, city_id: activeCity })
      });
      console.log("AI Agentic Switch toggled successfully to:", nextVal);
    } catch (err) {
      console.error("Error toggling AI Agentic Switch on backend:", err);
    }
  };

  // --- 3. Real-Time Audit Log Subscription ---
  useEffect(() => {
    if (loadingAuth || isOffline || !activeCity) return;
    
    // Fetch recent audit logs
    supabase
      .from("audit_logs")
      .select("*, profiles(email)")
      .eq("city_id", activeCity)
      .order("timestamp", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (data) setAuditLogs(data);
        if (error) console.error("Error loading audit logs:", error);
      });

    // Real-time subscription to city audit logs
    const channel = supabase
      .channel(`audit_logs_realtime_${activeCity}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
          filter: `city_id=eq.${activeCity}`
        },
        async (payload) => {
          let newLog = payload.new;
          if (newLog.performed_by) {
            const { data } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", newLog.performed_by)
              .single();
            if (data) {
              newLog = { ...newLog, profiles: { email: data.email } };
            }
          }
          setAuditLogs(prev => [newLog, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadingAuth, isOffline, activeCity]);

  // --- 4. Fetch User Directory ---
  const fetchDirectoryUsers = async () => {
    setDirectoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) {
        setDirectoryUsers(data);
      }
      if (error) {
        console.error("Error loading directory users:", error);
      }
    } catch (err) {
      console.error("Failed fetching directory users:", err);
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => {
    if (loadingAuth || isOffline) return;
    if (sidebarTab === "directory") {
      fetchDirectoryUsers();
    }
  }, [loadingAuth, isOffline, sidebarTab, activeCity]);

  // Handle administrator logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Handle user credentials creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreateLoading(true);

    if (!newEmail || !newPassword) {
      setCreateError("Both email and password are required.");
      setCreateLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active administrator session detected.");
      }

      const response = await fetch(`${getApiBaseUrl()}/api/admin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email: newEmail, password: newPassword })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "User creation failed.");
      }

      setCreateSuccess(`Successfully created user: ${newEmail}`);
      setNewEmail("");
      setNewPassword("");
      fetchDirectoryUsers();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create user credentials.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Hover node tooltip details
  function handleHoverNode(nodeName: string | null, clientX: number, clientY: number) {
    if (!nodeName) {
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    const container = document.querySelector(".spatial-canvas-container");
    if (container) {
      const bounds = container.getBoundingClientRect();
      setTooltip({
        visible: true,
        nodeName: nodeName,
        x: clientX - bounds.left + 15,
        y: clientY - bounds.top + 15
      });
    }
  }

  // Loading skeleton screen
  if (!mounted || loadingAuth) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#09090b", justifyContent: "center", alignItems: "center", fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid rgba(249, 115, 22, 0.2)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "15px" }}>Establishing Secure SCADA Session...</div>
        <style jsx>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Target hour representation IST format
  const targetTimeStr = formatToISTShort(new Date(baseTime.getTime() + lookAheadHour * 60 * 60 * 1000)) + " IST";

  // --- Dynamic SCADA KPI summary calculations ---
  const activeNodeNames = Object.keys(activeNodes);
  const totalNodesCount = activeNodeNames.length;
  
  let totalGridLoad = 0;
  let criticalCount = 0;
  let vulnerableCount = 0;
  let stableCount = 0;

  activeNodeNames.forEach(name => {
    const data = activeNodes[name];
    if (data) {
      totalGridLoad += data.calculatedLoadTarget || 0;
      const status = (isOffline ? "OFFLINE" : (data.status || "STABLE")) as string;
      if (status === "CRITICAL_CASCADE_RISK" || status === "ISOLATED") {
        criticalCount++;
      } else if (status === "VULNERABLE" || status === "WARNING") {
        vulnerableCount++;
      } else if (status === "STABLE") {
        stableCount++;
      }
    }
  });

  const activeAlerts = criticalCount + vulnerableCount;
  const gridHealthPct = totalNodesCount > 0 
    ? Math.round((stableCount / totalNodesCount) * 100) 
    : 100;

  // Filter nodes array based on search query and status filter
  const filteredNodeNames = activeNodeNames.filter(nodeName => {
    const matchesSearch = nodeName.toLowerCase().includes(searchQuery.toLowerCase());
    const data = activeNodes[nodeName];
    const status = (isOffline ? "OFFLINE" : (data?.status || "STABLE")) as string;
    
    let matchesStatus = true;
    if (statusFilter === "CRITICAL") {
      matchesStatus = status === "CRITICAL_CASCADE_RISK" || status === "ISOLATED";
    } else if (statusFilter === "VULNERABLE") {
      matchesStatus = status === "VULNERABLE" || status === "WARNING";
    } else if (statusFilter === "STABLE") {
      matchesStatus = status === "STABLE";
    }
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>

      {/* 1. Header component */}
      <Header
        isOffline={isOffline}
        usingLocalFallback={usingLocalFallback}
        gridFrequency={gridFrequency}
        onToggleConnection={() => setIsOffline(!isOffline)}
        activeCity={activeCity}
        supportedCities={supportedCities}
        onCityChange={handleCityChange}
        isCityLocked={isCityLocked}
        userEmail={userEmail}
        onLogout={handleLogout}
        agenticSwitchEnabled={agenticSwitchEnabled}
        onToggleAgenticSwitch={handleToggleAgenticSwitch}
      />

      {/* Amber Warning Banner */}
      <AmberWarningBanner
        visible={systemState === "VULNERABLE"}
        worstNodeName={worstNodeName}
        targetTimeStr={targetTimeStr}
      />

      {/* 2. Main split screen panel */}
      <main className="main-container" style={sidebarTab === "forecaster" ? { height: "calc(100vh - 60px)" } : undefined}>

        {/* 2.1 Left Sidebar Console */}
        {sidebarTab !== "forecaster" && (
          <aside className="sidebar-console">

          {/* Global Status Card */}
          <section className="system-state-section">
            <div className="sidebar-title">Global Status</div>
            <div className={`system-state-indicator state-${systemState.toLowerCase().replace(/_/g, "-")}`} style={{ marginTop: "0.5rem" }}>
              <span className="system-state-title">System State</span>
              <span className="system-state-value">{systemState.replace(/_/g, " ")}</span>
            </div>
            
            {/* Dynamic SCADA KPI summary dashboard */}
            {mounted && Object.keys(activeNodes).length > 0 && (
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Active Load</span>
                  <span className="kpi-value">{Math.round(totalGridLoad).toLocaleString()} MW</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Grid Alerts</span>
                  <span className={`kpi-value ${activeAlerts > 0 ? "alert-active" : ""}`}>
                    {activeAlerts}
                  </span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Grid Health</span>
                  <span className={`kpi-value ${gridHealthPct === 100 ? "stable-active" : ""}`}>
                    {gridHealthPct}%
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Console Tab Section */}
          <section style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", gap: "0.5rem" }}>
            
            {/* Sidebar Tab Bar */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "4px", marginBottom: "4px", gap: "8px" }}>
              <button
                onClick={() => setSidebarTab("substations")}
                style={{
                  background: "none",
                  border: "none",
                  color: sidebarTab === "substations" ? "#f97316" : "#94a3b8",
                  fontWeight: sidebarTab === "substations" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "substations" ? "2px solid #f97316" : "none",
                  outline: "none"
                }}
              >
                Substations
              </button>
              <button
                onClick={() => setSidebarTab("audit")}
                style={{
                  background: "none",
                  border: "none",
                  color: sidebarTab === "audit" ? "#f97316" : "#94a3b8",
                  fontWeight: sidebarTab === "audit" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "audit" ? "2px solid #f97316" : "none",
                  outline: "none"
                }}
              >
                Audit Log
              </button>
              <button
                onClick={() => setSidebarTab("directory")}
                style={{
                  background: "none",
                  border: "none",
                  color: sidebarTab === "directory" ? "#f97316" : "#94a3b8",
                  fontWeight: sidebarTab === "directory" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "directory" ? "2px solid #f97316" : "none",
                  outline: "none"
                }}
              >
                Directory
              </button>
              <button
                onClick={() => setSidebarTab("create-user")}
                style={{
                  background: "none",
                  border: "none",
                  color: sidebarTab === "create-user" ? "#f97316" : "#94a3b8",
                  fontWeight: sidebarTab === "create-user" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "create-user" ? "2px solid #f97316" : "none",
                  outline: "none"
                }}
              >
                Credentials
              </button>
              <button
                onClick={() => setSidebarTab("forecaster")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: "none",
                  outline: "none"
                }}
              >
                Forecaster
              </button>
            </div>

            {/* TAB 1: Substations List */}
            {sidebarTab === "substations" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, overflow: "hidden" }}>
                <div className="sidebar-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Node Telemetry</span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    {filteredNodeNames.length} shown
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0.1rem 0" }}>
                  <div className="search-container">
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search substations by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="filter-chips">
                    {(["ALL", "STABLE", "VULNERABLE", "CRITICAL"] as const).map((filter) => (
                      <button
                        key={filter}
                        className={`filter-chip ${statusFilter === filter ? "active" : ""}`}
                        onClick={() => setStatusFilter(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="node-health-list" style={{ marginTop: "0.25rem", overflowY: "auto", flex: 1 }}>
                  {filteredNodeNames.map((nodeName) => {
                    const nodeMeta = nodesConfig.find((n) => n.name === nodeName);
                    const liveData = activeNodes[nodeName] || {
                      calculatedLoadTarget: nodeMeta?.initial_volume ?? 500.0,
                      capacityRateOfChangeDelta: 0,
                      status: "STABLE" as const,
                      maxCapacity: nodeMeta?.max_capacity ?? 1000.0
                    };

                    const cardStatus = isOffline ? "OFFLINE" : liveData.status;
                    const minCap = nodeMeta?.min_capacity ?? 20.0;
                    const maxCap = liveData.maxCapacity ?? nodeMeta?.max_capacity ?? 1000.0;
                    const cardId = nodeMeta ? nodeMeta.name.replace(/\s+/g, "") : nodeName.replace(/\s+/g, "");

                    return (
                      <NodeCard
                        key={cardId}
                        id={cardId}
                        name={nodeName}
                        calculatedLoadTarget={liveData.calculatedLoadTarget}
                        capacityRateOfChangeDelta={liveData.capacityRateOfChangeDelta}
                        status={cardStatus}
                        minCapacity={minCap}
                        maxCapacity={maxCap}
                        volumeHistory={(historicalData[nodeName]?.volume) || []}
                        loadHistory={(historicalData[nodeName]?.load) || []}
                      />
                    );
                  })}

                  {Object.keys(activeNodes).length === 0 && (
                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      Awaiting substation telemetry sync...
                    </div>
                  )}

                  {Object.keys(activeNodes).length > 0 && filteredNodeNames.length === 0 && (
                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      No substations match search / filter.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Real-time Audit Logs Stream */}
            {sidebarTab === "audit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }}>Real-time Audit Stream</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{auditLogs.length} events logged (IST)</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1, paddingRight: "4px" }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: "8px 10px",
                        background: log.event_type === "NODE_CASCADE" ? "rgba(239, 68, 68, 0.05)" : log.event_type === "AGENTIC_PROTECTIVE_TRIP" ? "rgba(16, 185, 129, 0.05)" : "rgba(30, 41, 59, 0.4)",
                        border: `1px solid ${log.event_type === "NODE_CASCADE" ? "rgba(239, 68, 68, 0.2)" : log.event_type === "AGENTIC_PROTECTIVE_TRIP" ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.05)"}`,
                        borderRadius: "6px",
                        fontSize: "0.7rem",
                        lineHeight: "1.4"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{
                          fontWeight: 700,
                          color: log.event_type === "NODE_CASCADE" ? "#f87171" : log.event_type === "AGENTIC_PROTECTIVE_TRIP" ? "#34d399" : "#818cf8",
                          fontSize: "0.6rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>
                          {log.event_type.replace(/_/g, " ")}
                        </span>
                        <span style={{ color: "#64748b", fontSize: "0.6rem" }}>
                          {formatToISTShort(log.timestamp)}
                        </span>
                      </div>
                      
                      <div style={{ color: "#e2e8f0", marginBottom: "2px" }}>
                        {log.action_taken}
                      </div>
                      
                      {log.node_name && (
                        <div style={{ color: "#94a3b8", fontSize: "0.65rem" }}>
                          Node: <strong style={{ color: "#cbd5e1" }}>{log.node_name}</strong>
                        </div>
                      )}
                      
                      {log.profiles?.email && (
                        <div style={{ color: "#64748b", fontSize: "0.65rem", textAlign: "right", marginTop: "2px" }}>
                          By: {log.profiles.email}
                        </div>
                      )}
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <div style={{ padding: "2rem", textAlign: "center", color: "#64748b", fontSize: "0.75rem" }}>
                      No audit events recorded for this city.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: User Directory */}
            {sidebarTab === "directory" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }}>User Directory</span>
                  <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                    {directoryUsers.length} total
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", margin: "0.1rem 0" }}>
                  <div className="search-container">
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search users by email or role..."
                      value={directorySearch}
                      onChange={(e) => setDirectorySearch(e.target.value)}
                    />
                  </div>
                </div>

                {directoryLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "20px", height: "20px", border: "2px solid rgba(249, 115, 22, 0.2)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Loading Directory...</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1, paddingRight: "4px" }}>
                    {directoryUsers
                      .filter(user => {
                        const emailMatches = user.email.toLowerCase().includes(directorySearch.toLowerCase());
                        const roleMatches = user.role.toLowerCase().includes(directorySearch.toLowerCase());
                        const nodeMatches = parseNodeNameFromEmail(user.email).toLowerCase().includes(directorySearch.toLowerCase());
                        return emailMatches || roleMatches || nodeMatches;
                      })
                      .map((user) => {
                        const assignedNode = parseNodeNameFromEmail(user.email);
                        const isSuperAdmin = user.role === "super_admin";
                        const isCityAdmin = user.role === "command_centre_admin";
                        const isFieldWorker = user.role === "field_worker";
                        
                        let roleColor = "#94a3b8";
                        let roleBg = "rgba(148, 163, 184, 0.08)";
                        if (isSuperAdmin) {
                          roleColor = "#818cf8";
                          roleBg = "rgba(129, 140, 248, 0.1)";
                        } else if (isCityAdmin) {
                          roleColor = "#38bdf8";
                          roleBg = "rgba(56, 189, 248, 0.1)";
                        } else if (isFieldWorker) {
                          roleColor = "#34d399";
                          roleBg = "rgba(52, 211, 153, 0.1)";
                        }

                        return (
                          <div
                            key={user.id}
                            style={{
                              padding: "8px 10px",
                              background: "rgba(30, 41, 59, 0.4)",
                              border: "1px solid rgba(255, 255, 255, 0.05)",
                              borderRadius: "6px",
                              fontSize: "0.7rem",
                              lineHeight: "1.4",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, color: "#f8fafc", wordBreak: "break-all", marginRight: "4px" }}>
                                {user.email}
                              </span>
                              <span style={{
                                color: roleColor,
                                background: roleBg,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.55rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                                whiteSpace: "nowrap"
                              }}>
                                {user.role.replace(/_/g, " ")}
                              </span>
                            </div>
                            
                            <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.65rem", marginTop: "2px" }}>
                              <span>
                                City: <strong style={{ color: "#94a3b8", textTransform: "capitalize" }}>{user.city_id || "Global (All)"}</strong>
                              </span>
                              <span>
                                Registered: {formatToISTShort(user.created_at)}
                              </span>
                            </div>

                            {assignedNode && (
                              <div style={{ fontSize: "0.65rem", color: "#94a3b8", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.1)", borderRadius: "4px", padding: "4px 8px", marginTop: "2px" }}>
                                Assigned Substation: <strong style={{ color: "#cbd5e1" }}>{assignedNode}</strong>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {directoryUsers.length === 0 && (
                      <div style={{ padding: "2rem", textAlign: "center", color: "#64748b", fontSize: "0.75rem" }}>
                        No profiles recorded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: User Credentials Management Form */}
            {sidebarTab === "create-user" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px", background: "rgba(30, 41, 59, 0.2)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)", overflowY: "auto", flex: 1 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f8fafc", marginBottom: "4px" }}>Create Access Credentials</div>
                <p style={{ fontSize: "0.68rem", color: "#94a3b8", margin: "0 0 8px 0", lineHeight: "1.4" }}>
                  {userProfile?.role === "super_admin" 
                    ? "Generate city command admins ({cityname}@auragrid.org) or field workers ({city_abbrev}.{node}@auragrid.org)." 
                    : `Generate field worker accounts for your city partition (must prefix email with '${activeCity === "bengaluru" ? "blr" : activeCity === "delhi" ? "del" : activeCity === "pune" ? "pn" : activeCity === "bhopal" ? "bp" : activeCity === "lucknow" ? "lu" : "jh"}.').`}
                </p>
                
                <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. jh.civilline_grid@auragrid.org"
                      disabled={createLoading}
                      style={{
                        background: "#121214",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "#fff",
                        fontSize: "0.75rem",
                        outline: "none",
                        width: "100%",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>Access Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={createLoading}
                      style={{
                        background: "#121214",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        color: "#fff",
                        fontSize: "0.75rem",
                        outline: "none",
                        width: "100%",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>

                  {createError && (
                    <div style={{ fontSize: "0.7rem", color: "#f87171", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "6px 10px", borderRadius: "6px", lineHeight: "1.3" }}>
                      {createError}
                    </div>
                  )}

                  {createSuccess && (
                    <div style={{ fontSize: "0.7rem", color: "#34d399", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "6px 10px", borderRadius: "6px", lineHeight: "1.3" }}>
                      {createSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={createLoading}
                    style={{
                      background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "#fff",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: createLoading ? "default" : "pointer",
                      boxShadow: "0 4px 10px rgba(249, 115, 22, 0.2)",
                      marginTop: "5px"
                    }}
                  >
                    {createLoading ? "Creating Credentials..." : "Generate Credentials"}
                  </button>
                </form>
              </div>
            )}



          </section>

        </aside>
        )}

        {/* 2.2 Right Spatial Canvas Container */}
        <section className="spatial-canvas-container" style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>

          {sidebarTab === "forecaster" ? (
            /* Full-Bleed Analytics Dashboard */
            <div className="dashboard-scrollable-content" style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "16px", overflow: "hidden", background: "#09090b", fontFamily: "'Outfit', sans-serif", height: "100%", boxSizing: "border-box" }}>
              
              {/* Custom Webkit scrollbar for premium theme */}
              <style jsx>{`
                .node-forecast-scroll-container::-webkit-scrollbar,
                .forecaster-right-scroll-container::-webkit-scrollbar {
                  width: 6px;
                }
                .node-forecast-scroll-container::-webkit-scrollbar-track,
                .forecaster-right-scroll-container::-webkit-scrollbar-track {
                  background: rgba(255, 255, 255, 0.02);
                  border-radius: 3px;
                }
                .node-forecast-scroll-container::-webkit-scrollbar-thumb,
                .forecaster-right-scroll-container::-webkit-scrollbar-thumb {
                  background: rgba(255, 255, 255, 0.12);
                  border-radius: 3px;
                  transition: background 0.2s ease;
                }
                .node-forecast-scroll-container::-webkit-scrollbar-thumb:hover,
                .forecaster-right-scroll-container::-webkit-scrollbar-thumb:hover {
                  background: rgba(249, 115, 22, 0.5);
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>

              {/* Header with Navigation switcher inline */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: 0 }}>Advanced Wavelet Forecaster Diagnostic Deck</h2>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "2px 0 0 0" }}>Real-time machine learning analytics and failure propagation mapping.</p>
                  </div>
                  {modeActivated && (
                    <span style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: modeActivated === "NEURO_EVOLUTIONARY_GA" ? "rgba(249, 115, 22, 0.1)" : "rgba(113, 113, 122, 0.1)",
                      color: modeActivated === "NEURO_EVOLUTIONARY_GA" ? "#f97316" : "#a1a1aa",
                      border: `1px solid ${modeActivated === "NEURO_EVOLUTIONARY_GA" ? "rgba(249, 115, 22, 0.2)" : "rgba(113, 113, 122, 0.2)"}`
                    }}>
                      {modeActivated.replace(/_/g, " ")}
                    </span>
                  )}
                </div>

                {/* Dashboard Header Tabs switcher */}
                <div style={{ display: "flex", gap: "8px", background: "#18181b", padding: "4px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {(["substations", "audit", "directory", "create-user", "forecaster"] as const).map((tab) => {
                    const isActive = sidebarTab === tab;
                    const labels: Record<string, string> = {
                      substations: "Substations",
                      audit: "Audit Log",
                      directory: "Directory",
                      "create-user": "Credentials",
                      forecaster: "Forecaster"
                    };
                    return (
                      <button
                        key={tab}
                        onClick={() => setSidebarTab(tab)}
                        style={{
                          background: isActive ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "none",
                          border: "none",
                          color: isActive ? "#fff" : "#94a3b8",
                          fontWeight: isActive ? 700 : 500,
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          outline: "none",
                          transition: "all 0.2s ease",
                          boxShadow: isActive ? "0 2px 8px rgba(249, 115, 22, 0.3)" : "none"
                        }}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dashboard Content Grid */}
              <div style={{ display: "flex", gap: "20px", flex: 1, minHeight: 0 }}>
                
                {/* Left Column (Stats & Progress Bars) */}
                <div style={{ width: "320px", minWidth: "320px", display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
                  
                  {/* Validation Stats */}
                  <div style={{ background: "#121214", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "10px", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc" }}>Subsystem Validation Stats</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.72rem", fontFamily: "monospace" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "4px" }}>
                        <span style={{ color: "#64748b" }}>Stationarity Status</span>
                        <span style={{ color: stationarityTests?.stationary ? "#10b981" : "#eab308", fontWeight: 700 }}>
                          {stationarityTests?.stationary ? "STATIONARY" : "NON-STATIONARY"}
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "4px" }}>
                        <span style={{ color: "#64748b" }}>ADF p-value</span>
                        <span style={{ color: "#cbd5e1" }}>
                          {stationarityTests?.p_value !== undefined ? stationarityTests.p_value.toFixed(4) : "0.0000"} 
                          <span style={{ color: "#64748b" }}> (t={stationarityTests?.t_statistic_adf !== undefined ? stationarityTests.t_statistic_adf.toFixed(2) : "0.00"})</span>
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "4px" }}>
                        <span style={{ color: "#64748b" }}>PP p-value</span>
                        <span style={{ color: "#cbd5e1" }}>
                          {stationarityTests?.t_statistic_pp !== undefined ? stationarityTests.t_statistic_pp.toFixed(4) : "0.0000"}
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "4px" }}>
                        <span style={{ color: "#64748b" }}>GA Objective A (RMSE)</span>
                        <span style={{ color: "#cbd5e1" }}>
                          {multiObjectiveOptimization?.objective_a_rmse !== undefined ? multiObjectiveOptimization.objective_a_rmse.toFixed(4) : "0.0000"}
                        </span>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b" }}>GA Objective B (Latency)</span>
                        <span style={{ color: "#cbd5e1" }}>
                          {multiObjectiveOptimization?.objective_b_latency !== undefined ? multiObjectiveOptimization.objective_b_latency.toFixed(2) + " h" : "0.00 h"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Substation Load Comparison (Progress Bars) */}
                  <div style={{ background: "#121214", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "10px", flex: 1, minHeight: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f8fafc", flexShrink: 0 }}>Substation Load Forecasts</div>
                    <div className="node-forecast-scroll-container" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "4px" }}>
                      {Object.keys(activeNodes).map((nodeName) => {
                        const nodeData = activeNodes[nodeName];
                        const load = nodeData?.calculatedLoadTarget ?? 0;
                        const max = nodeData?.maxCapacity ?? 1000;
                        const pct = Math.min(100, Math.max(0, (load / max) * 100));
                        const isSelected = activeSelectedNode === nodeName;
                        
                        return (
                          <div
                            key={nodeName}
                            onClick={() => setSelectedNodeGraph(nodeName)}
                            style={{
                              cursor: "pointer",
                              padding: "6px 8px",
                              borderRadius: "8px",
                              border: isSelected ? "1px solid rgba(249, 115, 22, 0.4)" : "1px solid transparent",
                              background: isSelected ? "rgba(249, 115, 22, 0.04)" : "none",
                              transition: "all 0.2s ease"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#cbd5e1", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 600 }}>{nodeName}</span>
                              <span>{Math.round(load).toLocaleString()} / {Math.round(max).toLocaleString()} MW ({Math.round(pct)}%)</span>
                            </div>
                            <div style={{ height: "8px", width: "100%", background: "#18181b", borderRadius: "4px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                              <div style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: pct > 85 ? "#ef4444" : pct > 60 ? "#eab308" : "#10b981",
                                borderRadius: "4px",
                                transition: "width 0.4s ease-in-out"
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column (Matrices + Graphs) */}
                <div className="forecaster-right-scroll-container" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", height: "100%", overflowY: "auto", paddingRight: "4px" }}>
                  
                  {/* Matrices Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", height: "340px", minHeight: "340px", flexShrink: 0 }}>
                    
                    {/* Confusion Matrix Heatmap & Graph */}
                    {(() => {
                      if (!confusionMatrixMetrics) {
                        return (
                          <div style={{ background: "#121214", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", color: "#64748b" }}>
                            <div style={{ width: "30px", height: "30px", border: "2px solid rgba(249, 115, 22, 0.2)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Calculating Confusion Matrix...</span>
                          </div>
                        );
                      }

                      const tp = confusionMatrixMetrics?.true_positives ?? 0;
                      const fp = confusionMatrixMetrics?.false_positives ?? 0;
                      const fn = confusionMatrixMetrics?.false_negatives ?? 0;
                      const tn = confusionMatrixMetrics?.true_negatives ?? 0;
                      const totalCM = tp + fp + fn + tn || 1;
                      
                      const tpOpacity = Math.max(0.1, Math.min(0.85, tp / totalCM + 0.15));
                      const fpOpacity = Math.max(0.1, Math.min(0.85, fp / totalCM + 0.15));
                      const fnOpacity = Math.max(0.1, Math.min(0.85, fn / totalCM + 0.15));
                      const tnOpacity = Math.max(0.1, Math.min(0.85, tn / totalCM + 0.15));
                      
                      const cmChartData = [
                        { label: "TP", value: tp, color: "#f97316" },
                        { label: "FP", value: fp, color: "#eab308" },
                        { label: "FN", value: fn, color: "#ef4444" },
                        { label: "TN", value: tn, color: "#10b981" }
                      ];

                      return (
                        <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "8px", height: "100%", boxSizing: "border-box" }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f8fafc", flexShrink: 0 }}>Forecast Confusion Matrix</div>
                          <div style={{ gridTemplateColumns: "1fr 1fr", display: "grid", gap: "8px", textAlign: "center", flex: 1, margin: "4px 0" }}>
                            <div style={{ padding: "8px 4px", background: `rgba(249, 115, 22, ${tpOpacity})`, border: "1px solid rgba(249, 115, 22, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: tpOpacity > 0.4 ? "#fff" : "#f97316", fontWeight: 700 }}>TP</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{tp}</div>
                              <div style={{ fontSize: "0.55rem", color: tpOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Correct Alert</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(234, 179, 8, ${fpOpacity})`, border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: fpOpacity > 0.4 ? "#fff" : "#eab308", fontWeight: 700 }}>FP</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{fp}</div>
                              <div style={{ fontSize: "0.55rem", color: fpOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>False Alarm</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(239, 68, 68, ${fnOpacity})`, border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: fnOpacity > 0.4 ? "#fff" : "#ef4444", fontWeight: 700 }}>FN</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{fn}</div>
                              <div style={{ fontSize: "0.55rem", color: fnOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Missed breach</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(16, 185, 129, ${tnOpacity})`, border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: tnOpacity > 0.4 ? "#fff" : "#10b981", fontWeight: 700 }}>TN</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{tn}</div>
                              <div style={{ fontSize: "0.55rem", color: tnOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Correct Safe</div>
                            </div>
                          </div>
                          <div style={{ marginTop: "auto", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.03)", flexShrink: 0, display: "flex", alignItems: "flex-end" }}>
                            {drawSvgBarChart(cmChartData)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Failure Matrix Heatmap & Graph */}
                    {(() => {
                      if (!failureMatrixMetrics) {
                        return (
                          <div style={{ background: "#121214", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", color: "#64748b" }}>
                            <div style={{ width: "30px", height: "30px", border: "2px solid rgba(249, 115, 22, 0.2)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Analyzing Failure Modes...</span>
                          </div>
                        );
                      }

                      const acc = failureMatrixMetrics?.accurate ?? 0;
                      const lag = failureMatrixMetrics?.phase_lag ?? 0;
                      const bias = failureMatrixMetrics?.scale_bias ?? 0;
                      const comp = failureMatrixMetrics?.composite ?? 0;
                      const totalFM = acc + lag + bias + comp || 1;
                      
                      const accOpacity = Math.max(0.1, Math.min(0.85, acc / totalFM + 0.15));
                      const lagOpacity = Math.max(0.1, Math.min(0.85, lag / totalFM + 0.15));
                      const biasOpacity = Math.max(0.1, Math.min(0.85, bias / totalFM + 0.15));
                      const compOpacity = Math.max(0.1, Math.min(0.85, comp / totalFM + 0.15));
                      
                      const fmChartData = [
                        { label: "Accurate", value: acc, color: "#10b981" },
                        { label: "Phase Lag", value: lag, color: "#f97316" },
                        { label: "Scale Bias", value: bias, color: "#eab308" },
                        { label: "Composite", value: comp, color: "#ef4444" }
                      ];

                      return (
                        <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "8px", height: "100%", boxSizing: "border-box" }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f8fafc", flexShrink: 0 }}>Prediction Failure Mode Matrix</div>
                          <div style={{ gridTemplateColumns: "1fr 1fr", display: "grid", gap: "8px", textAlign: "center", flex: 1, margin: "4px 0" }}>
                            <div style={{ padding: "8px 4px", background: `rgba(16, 185, 129, ${accOpacity})`, border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: accOpacity > 0.4 ? "#fff" : "#10b981", fontWeight: 700 }}>Accurate</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{acc}</div>
                              <div style={{ fontSize: "0.55rem", color: accOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Accurate</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(249, 115, 22, ${lagOpacity})`, border: "1px solid rgba(249, 115, 22, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: lagOpacity > 0.4 ? "#fff" : "#f97316", fontWeight: 700 }}>Phase Lag</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{lag}</div>
                              <div style={{ fontSize: "0.55rem", color: lagOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Timing Error</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(234, 179, 8, ${biasOpacity})`, border: "1px solid rgba(234, 179, 8, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: biasOpacity > 0.4 ? "#fff" : "#eab308", fontWeight: 700 }}>Scale Bias</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{bias}</div>
                              <div style={{ fontSize: "0.55rem", color: biasOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Amplitude Error</div>
                            </div>
                            <div style={{ padding: "8px 4px", background: `rgba(239, 68, 68, ${compOpacity})`, border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ fontSize: "0.55rem", color: compOpacity > 0.4 ? "#fff" : "#ef4444", fontWeight: 700 }}>Composite</div>
                              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff", margin: "2px 0" }}>{comp}</div>
                              <div style={{ fontSize: "0.55rem", color: compOpacity > 0.4 ? "#cbd5e1" : "#71717a" }}>Double Error</div>
                            </div>
                          </div>
                          <div style={{ marginTop: "auto", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.03)", flexShrink: 0, display: "flex", alignItems: "flex-end" }}>
                            {drawSvgBarChart(fmChartData)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Cascading Propagation Matrix Heatmap & Graph */}
                    {(() => {
                      const cascadeKeys = Object.keys(cascadingMatrixMetrics || {}).slice(0, 3);
                      if (cascadeKeys.length === 0) {
                        return (
                          <div style={{ background: "#121214", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", color: "#64748b" }}>
                            <div style={{ width: "30px", height: "30px", border: "2px solid rgba(249, 115, 22, 0.2)", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Initializing Cascade Matrix...</span>
                          </div>
                        );
                      }
                      
                      const cascadeChartData = cascadeKeys.map(src => {
                        const targets = cascadingMatrixMetrics[src] || {};
                        const maxProb = Math.max(...Object.keys(targets).map(t => t === src ? 0 : targets[t]), 0);
                        const shortLabel = src.replace(" Hydro Hub", "").replace(" Residential", "").replace(" Industrial", "").replace(" Substation", "");
                        return {
                          label: shortLabel.substring(0, 8),
                          value: maxProb,
                          color: maxProb > 80 ? "#ef4444" : maxProb > 40 ? "#f97316" : "#10b981"
                        };
                      });

                      return (
                        <div style={{ background: "#121214", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: "8px", height: "100%", boxSizing: "border-box" }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#f8fafc", flexShrink: 0 }}>Cascading Propagation Matrix (N x N)</div>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.6rem", flex: 1, justifyContent: "center", margin: "4px 0" }}>
                            {/* Target Node Headers */}
                            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: "4px", textAlign: "center", fontWeight: "bold", color: "#94a3b8" }}>
                              <div style={{ textAlign: "left" }}>Src \ Tgt</div>
                              {cascadeKeys.map(k => (
                                <div key={k} style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                  {k.replace(" Hydro Hub", "").replace(" Residential", "").replace(" Industrial", "").replace(" Substation", "").substring(0, 8)}
                                </div>
                              ))}
                            </div>
                            
                            {/* Rows */}
                            {cascadeKeys.map(srcKey => (
                              <div key={srcKey} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: "4px", alignItems: "center" }}>
                                {/* Source Node Label */}
                                <div style={{ fontWeight: "bold", color: "#e2e8f0", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                  {srcKey.replace(" Hydro Hub", "").replace(" Residential", "").replace(" Industrial", "").replace(" Substation", "").substring(0, 8)}
                                </div>
                                
                                {/* Cells */}
                                {cascadeKeys.map(tgtKey => {
                                  const prob = cascadingMatrixMetrics[srcKey]?.[tgtKey] ?? 0;
                                  const cellBg = prob === 0 ? "rgba(255, 255, 255, 0.02)" : `rgba(239, 68, 68, ${Math.max(0.08, prob / 100 * 0.8)})`;
                                  const cellBorder = prob === 0 ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(239, 68, 68, 0.2)";
                                  
                                  return (
                                    <div
                                      key={tgtKey}
                                      style={{
                                        padding: "8px 2px",
                                        background: cellBg,
                                        border: cellBorder,
                                        borderRadius: "6px",
                                        textAlign: "center",
                                        fontWeight: 700,
                                        fontSize: "0.7rem",
                                        color: prob > 0 ? "#fff" : "#71717a"
                                      }}
                                    >
                                      {prob > 0 ? `${prob}%` : "0%"}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          
                          <div style={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 600, flexShrink: 0 }}>Max Cascade Risk propagation:</div>
                          <div style={{ padding: "2px 0", marginTop: "auto", flexShrink: 0 }}>
                            {drawSvgBarChart(cascadeChartData)}
                          </div>
                        </div>
                      );
                    })()}

                  </div>

                  {/* Cumulative & Multi-Objective Graphs Section */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px", height: "240px", minHeight: "240px", flexShrink: 0 }}>
                    {(() => {
                      const selNode = activeNodes[activeSelectedNode];
                      const waveletApprox = selNode?.waveletApproxSeries || [];
                      const waveletDetail = selNode?.waveletDetailSeries || [];
                      const combined = selNode?.combinedSeries || [];
                      const cap = selNode?.maxCapacity || 1000;
                      return renderModelBehaviorChart(waveletApprox, waveletDetail, combined, cap, activeSelectedNode);
                    })()}
                    
                    {renderMultiObjectiveChart(multiObjectiveOptimization, stationarityTests?.stationary)}
                  </div>

                </div>
              </div>

              {/* Inline Horizon Slider at the bottom of full-bleed dashboard */}
              <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px", marginTop: "4px", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    <span style={{ width: "6px", height: "6px", backgroundColor: "#f97316", borderRadius: "50%", boxShadow: "0 0 8px #f97316" }} />
                    <span>FORECAST HORIZON CONTROL (LOOK-AHEAD: {lookAheadHour} HOURS)</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#cbd5e1", fontWeight: 500 }}>
                    Target Hour IST: <span style={{ color: "#f97316", fontWeight: 700 }}>{targetTimeStr}</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={lookAheadHour}
                  onChange={(e) => setLookAheadHour(parseInt(e.target.value))}
                  disabled={modalState.visible}
                  className="forecast-slider-input"
                  id="forecast-slider"
                  style={{ width: "100%" }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.65rem", color: "#cbd5e1", fontWeight: 500, marginTop: "2px" }}>
                  <span>0h (Now)</span>
                  <span>1h</span>
                  <span>2h</span>
                  <span>3h</span>
                  <span>4h</span>
                  <span>5h</span>
                  <span>6h</span>
                  <span>7h</span>
                  <span>8h</span>
                  <span>9h</span>
                  <span>10h</span>
                  <span>11h</span>
                  <span>12h (Future)</span>
                </div>
              </div>

            </div>
          ) : (
            /* Normal Map Canvas View */
            <>
              <TopologyCanvas
                activeNodes={activeNodes}
                isOffline={isOffline}
                onHoverNode={handleHoverNode}
                activeCity={activeCity}
              />

              {/* Interactive Mouse Tooltip */}
              <CanvasTooltip
                visible={tooltip.visible}
                nodeName={tooltip.nodeName}
                x={tooltip.x}
                y={tooltip.y}
                activeNodes={activeNodes}
                historicalData={historicalData}
              />
            </>
          )}

        </section>

      </main>

      {/* 3. Bottom Zone Component (Look-Ahead Controller) */}
      {sidebarTab !== "forecaster" && (
        <FooterSlider
          lookAheadHour={lookAheadHour}
          disabled={modalState.visible}
          onHourChange={setLookAheadHour}
        />
      )}

      {/* 4. Fixed Toast alert panel (slides in bottom-left during breach) */}
      <AlertToast
        visible={systemState === "CRITICAL_CASCADE_RISK"}
        exposureVector={exposureVector}
        timestamp={targetTimeStr}
      />

      {/* 5. Supabase Database trigger warning modal overlay */}
      <WarningModal
        visible={modalState.visible}
        nodeName={modalState.nodeName}
        breachMetric={modalState.breachMetric}
        timestamp={modalState.timestamp}
        exposureVector={modalState.exposureVector}
        onAcknowledge={handleCloseModal}
      />

    </div>
  );
}
