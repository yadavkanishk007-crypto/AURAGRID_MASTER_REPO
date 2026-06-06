"use client";

import React from "react";
import Sparkline from "./Sparkline";

interface NodeCardProps {
  id: string;
  name: string;
  calculatedLoadTarget: number;
  capacityRateOfChangeDelta: number;
  status: string;
  minCapacity: number;
  maxCapacity: number;
  volumeHistory: number[];
  loadHistory: number[];
}

export default function NodeCard({
  id,
  name,
  calculatedLoadTarget,
  capacityRateOfChangeDelta,
  status,
  minCapacity,
  maxCapacity,
  volumeHistory,
  loadHistory
}: NodeCardProps) {
  const isIsolated = status === "ISOLATED" || status === "CRITICAL_CASCADE_RISK";
  const isWarning = status === "VULNERABLE" || status === "WARNING";
  const isOffline = status === "OFFLINE";

  // Class styling maps
  const statusClass = isOffline ? "offline" : isIsolated ? "isolated" : isWarning ? "vulnerable" : "stable";
  const statusLabel = isOffline ? "OFFLINE" : isIsolated ? "ISOLATED" : isWarning ? "WARNING" : "NORMAL";

  const percentUsed = Math.min(100, Math.max(0, (calculatedLoadTarget / maxCapacity) * 100));

  return (
    <div className={`node-card ${statusClass}`} id={`card-${id}`}>
      <div className="node-card-header">
        <span className="node-name">{name}</span>
        <span className={`node-status-badge badge-${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Dynamic Progress Bar Gauge (Section 1.1) */}
      <div className="volume-gauge-container">
        <div className="gauge-header">
          <span className="gauge-label">Capacity Utilization</span>
          <span className="gauge-value">{percentUsed.toFixed(0)}%</span>
        </div>
        <div className="gauge-bar-track">
          {/* Min capacity threshold marker */}
          <div 
            className="gauge-marker marker-min" 
            style={{ left: `${(minCapacity / maxCapacity) * 100}%` }}
            title={`Min Limit: ${minCapacity} MW`}
          />
          {/* Current Ingestion Load progress fill */}
          <div 
            className={`gauge-bar-fill fill-${statusClass}`}
            style={{ width: `${percentUsed}%` }}
          />
          {/* Max capacity threshold marker (at 100% of safety limit) */}
          <div 
            className="gauge-marker marker-max" 
            style={{ left: "90%" }}
            title={`Max Safety Limit: ${maxCapacity} MW`}
          />
        </div>
        <div className="gauge-footer-labels">
          <span>Min: {minCapacity} MW</span>
          <span>Max: {maxCapacity} MW</span>
        </div>
      </div>

      <div className="node-metrics">
        <div className="metric-box">
          <span className="metric-label">Ingestion Volume</span>
          <span className="metric-value">
            {calculatedLoadTarget.toLocaleString()} MW
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Rate Delta (ΔV)</span>
          {capacityRateOfChangeDelta > 0 ? (
            <span className="metric-value metric-delta delta-up">
              ▲ +{capacityRateOfChangeDelta.toFixed(1)} MW/h
            </span>
          ) : capacityRateOfChangeDelta < 0 ? (
            <span className="metric-value metric-delta delta-down">
              ▼ {capacityRateOfChangeDelta.toFixed(1)} MW/h
            </span>
          ) : (
            <span className="metric-value metric-delta delta-zero">
              • 0.0 MW/h
            </span>
          )}
        </div>
      </div>

      {/* Sparkline dual volume-load charts render */}
      <div className="sparkline-container" id={`sparkline-${id}`}>
        <Sparkline 
          volumeData={volumeHistory} 
          loadData={loadHistory} 
          status={statusClass === "isolated" ? "CRITICAL_CASCADE_RISK" : statusClass === "vulnerable" ? "VULNERABLE" : statusClass === "offline" ? "OFFLINE" : "STABLE"} 
        />
      </div>
    </div>
  );
}
