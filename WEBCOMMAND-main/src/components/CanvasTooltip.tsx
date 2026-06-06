import React from "react";
import { NODES_CONFIG, NodeData } from "@/utils/gridSimulation";
import Sparkline from "@/components/Sparkline";

interface CanvasTooltipProps {
  visible: boolean;
  nodeName: string | null;
  x: number;
  y: number;
  activeNodes: Record<string, NodeData>;
  historicalData: Record<string, { volume: number[]; load: number[] }>;
}

/**
 * Spatial canvas tooltip popover component to overlay detailed telemetry and trends onto hovered nodes.
 */
export default function CanvasTooltip({
  visible,
  nodeName,
  x,
  y,
  activeNodes,
  historicalData
}: CanvasTooltipProps) {
  const isHubNode = nodeName ? nodeName in NODES_CONFIG : false;
  const hubData = nodeName ? activeNodes[nodeName] : null;
  const hubConfig = nodeName ? NODES_CONFIG[nodeName as keyof typeof NODES_CONFIG] : null;
  const hubHistory = nodeName ? historicalData[nodeName] : null;

  const tooltipStatus = hubData?.status === "CRITICAL_CASCADE_RISK" ? "CRITICAL_CASCADE_RISK"
    : hubData?.status === "VULNERABLE" ? "VULNERABLE"
      : hubData?.status === "OFFLINE" ? "OFFLINE"
        : "STABLE";

  return (
    <div
      className="canvas-tooltip"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        opacity: visible && nodeName ? 1 : 0,
        visibility: visible && nodeName ? "visible" : "hidden",
        pointerEvents: "none",
        display: "flex",
        minWidth: isHubNode ? "220px" : "160px"
      }}
    >
      <span className="tooltip-node-name">{nodeName || ""}</span>
      {isHubNode ? (
        <>
          <div className="tooltip-row">
            <span>Projected Vol:</span>
            <span className="tooltip-val">{(hubData?.calculatedLoadTarget || 0).toLocaleString()} MW</span>
          </div>
          <div className="tooltip-row">
            <span>Status:</span>
            <span className="tooltip-val" style={{
              color: hubData?.status === "CRITICAL_CASCADE_RISK" ? "var(--color-critical)"
                : hubData?.status === "VULNERABLE" ? "var(--color-vulnerable)"
                  : hubData?.status === "OFFLINE" ? "var(--color-offline)"
                    : "var(--color-stable)"
            }}>
              {hubData?.status?.replace(/_/g, " ") || "STABLE"}
            </span>
          </div>
          <div className="tooltip-row">
            <span>Max Capacity:</span>
            <span className="tooltip-val">{hubConfig?.max || 0} MW</span>
          </div>
          <div className="tooltip-row">
            <span>Min Capacity:</span>
            <span className="tooltip-val">{hubConfig?.min || 0} MW</span>
          </div>
          {/* Sparkline: 24-hour volume & load trend */}
          {hubHistory && hubHistory.volume.length > 0 && (
            <div style={{
              marginTop: "0.4rem",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: "0.4rem"
            }}>
              <div style={{ fontSize: "0.6rem", color: "var(--text-secondary)", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                24h Trend
              </div>
              <div style={{ height: "40px", width: "100%" }}>
                <Sparkline
                  volumeData={hubHistory.volume}
                  loadData={hubHistory.load}
                  status={tooltipStatus}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="tooltip-row">
            <span>Type:</span>
            <span className="tooltip-val" style={{ color: "#f97316" }}>Distribution Substation</span>
          </div>
          <div className="tooltip-row" style={{ color: "var(--text-secondary)", fontSize: "0.7rem", marginTop: "0.2rem" }}>
            <span>See popup for full details</span>
          </div>
        </>
      )}
    </div>
  );
}
