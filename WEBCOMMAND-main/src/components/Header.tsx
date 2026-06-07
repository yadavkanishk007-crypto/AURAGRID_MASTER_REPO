"use client";

import React from "react";

interface HeaderProps {
  isOffline: boolean;
  usingLocalFallback: boolean;
  gridFrequency?: number;
  onToggleConnection: () => void;
  activeCity?: string;
  supportedCities?: any[];
  onCityChange?: (cityId: string) => void;
  isCityLocked?: boolean;
  userEmail?: string;
  onLogout?: () => void;
  agenticSwitchEnabled?: boolean;
  onToggleAgenticSwitch?: () => void;
}

export default function Header({
  isOffline,
  usingLocalFallback,
  gridFrequency,
  onToggleConnection,
  activeCity,
  supportedCities,
  onCityChange,
  isCityLocked = false,
  userEmail,
  onLogout,
  agenticSwitchEnabled = false,
  onToggleAgenticSwitch
}: HeaderProps) {
  return (
    <header className="header-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px" }}>
      <div className="logo-container" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <img src="/logo.png" alt="AURAGRID Logo" width="24" height="24" style={{ width: "24px", height: "24px", borderRadius: "6px" }} />
        <h1 className="logo-text" style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700 }}>National Grid Authority - Control Room</h1>
        
        {supportedCities && supportedCities.length > 0 && onCityChange && (
          <div className="city-selector-container" style={{ display: "inline-flex", alignItems: "center" }}>
            <select
              value={activeCity}
              disabled={isCityLocked}
              onChange={(e) => onCityChange(e.target.value)}
              style={{
                background: "#18181b",
                color: isCityLocked ? "#a1a1aa" : "#f4f4f5",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                outline: "none",
                cursor: isCityLocked ? "not-allowed" : "pointer",
                fontFamily: "'Outfit', sans-serif",
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                opacity: isCityLocked ? 0.75 : 1
              }}
              title={isCityLocked ? "City selector is locked for command centre administrators." : "Select grid operational city partition."}
            >
              {supportedCities.map(city => (
                <option key={city.id} value={city.id} style={{ background: "#18181b" }}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>
        )}

        
        {/* RLS Ingest Security Badge */}
        <span className="security-rls-badge" title="Database security: Select operations connect using anon public key. Direct inserts/updates are restricted.">
          <span className="security-rls-pulse" />
          <span>Secure Monitoring (Read-Only)</span>
        </span>

        {/* Live Grid Frequency Telemetry */}
        {gridFrequency && !isOffline && (
          <span style={{
            fontSize: "0.65rem",
            background: Math.abs(50.0 - gridFrequency) > 0.04 ? "#fef3c7" : "#dcfce7",
            color: Math.abs(50.0 - gridFrequency) > 0.04 ? "#b45309" : "#15803d",
            border: Math.abs(50.0 - gridFrequency) > 0.04 ? "1px solid rgba(217, 119, 6, 0.2)" : "1px solid rgba(22, 163, 74, 0.2)",
            padding: "2px 8px",
            borderRadius: "4px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }} title="Real-time Indian Power Grid frequency. Nominal operating target is 50.00 Hz.">
            <span style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: Math.abs(50.0 - gridFrequency) > 0.04 ? "#b45309" : "#15803d",
              boxShadow: Math.abs(50.0 - gridFrequency) > 0.04 ? "0 0 6px #b45309" : "0 0 6px #15803d",
            }} />
            <span>GRID FREQ: {gridFrequency.toFixed(3)} Hz</span>
          </span>
        )}
      </div>

      <div className="developer-controls" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        {userEmail && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: "0.75rem", color: "#e2e8f0", fontWeight: 600 }}>{userEmail}</span>
            <span style={{ fontSize: "0.6rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Administrator</span>
          </div>
        )}

        {/* Outage Toggle resilient Button */}
        <button
          onClick={onToggleConnection}
          className={`btn-toggle-connection ${isOffline ? "offline-mode" : ""}`}
          title="Toggle simulated connection dropouts"
          style={{ padding: "4px 8px", fontSize: "0.7rem" }}
        >
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: "2px" }}>
            <path d="M12 21l-12-18h24z" />
          </svg>
          <span>{isOffline ? "Connect API" : "Disconnect API"}</span>
        </button>

        {/* AI Agentic Switch Toggle Button */}
        {!isOffline && onToggleAgenticSwitch && (
          <button
            onClick={onToggleAgenticSwitch}
            className={`btn-toggle-agentic ${agenticSwitchEnabled ? "agentic-active" : ""}`}
            title="Toggle AI Agentic Switch for proactive cascading protective trips"
            style={{
              padding: "4px 8px",
              fontSize: "0.7rem",
              background: agenticSwitchEnabled ? "rgba(16, 185, 129, 0.12)" : "rgba(30, 41, 59, 0.4)",
              color: agenticSwitchEnabled ? "#34d399" : "#94a3b8",
              border: `1px solid ${agenticSwitchEnabled ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)"}`,
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s ease"
            }}
          >
            <span style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor: agenticSwitchEnabled ? "#34d399" : "#94a3b8",
              boxShadow: agenticSwitchEnabled ? "0 0 6px #34d399" : "none",
            }} />
            <span>AI Agentic Switch: {agenticSwitchEnabled ? "ENABLED" : "DISABLED"}</span>
          </button>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)";
            }}
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
