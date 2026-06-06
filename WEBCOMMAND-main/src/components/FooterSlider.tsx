"use client";

import React from "react";

interface FooterSliderProps {
  lookAheadHour: number;
  disabled: boolean;
  onHourChange: (hour: number) => void;
}

export default function FooterSlider({
  lookAheadHour,
  disabled,
  onHourChange
}: FooterSliderProps) {
  return (
    <footer className="bottom-slider-zone">
      <div className="slider-header">
        <div className="slider-label">
          <span className="slider-label-pulse" />
          <span>FORECAST HORIZON CONTROL (LOOK-AHEAD: {lookAheadHour} HOURS)</span>
        </div>
        <div style={{ fontSize: "0.7rem", color: "#cbd5e1", fontWeight: 500 }}>
          Interactive Time-Travel Simulation Controller
        </div>
      </div>

      {/* Slider input element matching Section 1.3 */}
      <input
        type="range"
        min="0"
        max="12"
        step="1"
        value={lookAheadHour}
        onChange={(e) => onHourChange(parseInt(e.target.value))}
        disabled={disabled} // Lock slider if modal alert is active or system offline
        className="forecast-slider-input"
        id="forecast-slider"
      />

      <div className="slider-ticks-container">
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
    </footer>
  );
}
