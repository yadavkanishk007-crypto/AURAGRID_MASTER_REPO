"use client";

import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import NodeCard from "@/components/NodeCard";
import WarningModal from "@/components/WarningModal";
import AlertToast from "@/components/AlertToast";
import FooterSlider from "@/components/FooterSlider";
import TopologyCanvas from "@/components/TopologyCanvas";
import AmberWarningBanner from "@/components/AmberWarningBanner";
import CanvasTooltip from "@/components/CanvasTooltip";

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
  const [sidebarTab, setSidebarTab] = useState<"substations" | "audit" | "create-user" | "directory">("substations");

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
    handleCloseModal
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
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0b0f19", justifyContent: "center", alignItems: "center", fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ width: "40px", height: "40px", border: "3px solid rgba(99, 102, 241, 0.2)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
      />

      {/* Amber Warning Banner */}
      <AmberWarningBanner
        visible={systemState === "VULNERABLE"}
        worstNodeName={worstNodeName}
        targetTimeStr={targetTimeStr}
      />

      {/* 2. Main split screen panel */}
      <main className="main-container">

        {/* 2.1 Left Sidebar Console */}
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
                  color: sidebarTab === "substations" ? "#6366f1" : "#94a3b8",
                  fontWeight: sidebarTab === "substations" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "substations" ? "2px solid #6366f1" : "none",
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
                  color: sidebarTab === "audit" ? "#6366f1" : "#94a3b8",
                  fontWeight: sidebarTab === "audit" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "audit" ? "2px solid #6366f1" : "none",
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
                  color: sidebarTab === "directory" ? "#6366f1" : "#94a3b8",
                  fontWeight: sidebarTab === "directory" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "directory" ? "2px solid #6366f1" : "none",
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
                  color: sidebarTab === "create-user" ? "#6366f1" : "#94a3b8",
                  fontWeight: sidebarTab === "create-user" ? 700 : 500,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderBottom: sidebarTab === "create-user" ? "2px solid #6366f1" : "none",
                  outline: "none"
                }}
              >
                Credentials
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
                        background: log.event_type === "NODE_CASCADE" ? "rgba(239, 68, 68, 0.05)" : "rgba(30, 41, 59, 0.4)",
                        border: `1px solid ${log.event_type === "NODE_CASCADE" ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)"}`,
                        borderRadius: "6px",
                        fontSize: "0.7rem",
                        lineHeight: "1.4"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{
                          fontWeight: 700,
                          color: log.event_type === "NODE_CASCADE" ? "#f87171" : "#818cf8",
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
                    <div style={{ width: "20px", height: "20px", border: "2px solid rgba(99, 102, 241, 0.2)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
                        background: "#0b0f19",
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
                        background: "#0b0f19",
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
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px",
                      color: "#fff",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: createLoading ? "default" : "pointer",
                      boxShadow: "0 4px 10px rgba(99, 102, 241, 0.2)",
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

        {/* 2.2 Right Spatial Canvas Container */}
        <section className="spatial-canvas-container" style={{ flex: 1, display: "flex", position: "relative" }}>

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

        </section>

      </main>

      {/* 3. Bottom Zone Component (Look-Ahead Controller) */}
      <FooterSlider
        lookAheadHour={lookAheadHour}
        disabled={modalState.visible || isOffline}
        onHourChange={setLookAheadHour}
      />

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
