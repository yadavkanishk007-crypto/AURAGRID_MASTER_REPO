"use client";

import React from "react";

interface WarningModalProps {
  visible: boolean;
  nodeName: string;
  breachMetric: string;
  timestamp: string;
  exposureVector: string;
  onAcknowledge: () => void;
}

export default function WarningModal({
  visible,
  nodeName,
  breachMetric,
  timestamp,
  exposureVector,
  onAcknowledge
}: WarningModalProps) {
  return (
    <div className={`modal-overlay ${visible ? "active" : ""}`}>
      <div className="alert-modal">
        <div className="modal-header">
          <div className="modal-header-icon">⚠️</div>
          <div className="modal-title">CASCADE BREACH DETECTED</div>
        </div>
        <div className="modal-body">
          <p>A critical threshold breach has propagated through the municipal power routing vectors. Supabase timeseries telemetry stream records an anomalous load ingestion cascade.</p>
          <div className="modal-data-table">
            <div className="modal-data-row">
              <span className="modal-data-label">Trigger Node</span>
              <span className="modal-data-val alert-node">{nodeName}</span>
            </div>
            <div className="modal-data-row">
              <span className="modal-data-label">Breach Metric</span>
              <span className="modal-data-val">{breachMetric}</span>
            </div>
            <div className="modal-data-row">
              <span className="modal-data-label">Simulated Timestamp</span>
              <span className="modal-data-val">{timestamp}</span>
            </div>
            <div className="modal-data-row">
              <span className="modal-data-label">Downstream Exposure</span>
              <span className="modal-data-val" style={{ color: "#ef4444" }}>{exposureVector}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onAcknowledge} className="btn-modal-close">
            Acknowledge Alert
          </button>
        </div>
      </div>
    </div>
  );
}
