"use client";

import React from "react";

interface SparklineProps {
  volumeData: number[];
  loadData: number[];
  status: string;
}

export default function Sparkline({ volumeData, loadData, status }: SparklineProps) {
  if (!volumeData || volumeData.length === 0) return null;
  const safeLoadData = loadData && loadData.length > 0 ? loadData : volumeData.map(v => v * 0.8);

  const width = 320;
  const height = 35;

  const allVals = [...volumeData, ...safeLoadData];
  const minVal = Math.min(...allVals) * 0.95;
  const maxVal = Math.max(...allVals) * 1.05;
  const range = maxVal - minVal || 1;

  // Map Volume coordinates
  const volumePoints = volumeData.map((val, idx) => {
    const x = (idx / (volumeData.length - 1)) * width;
    const y = height - ((val - minVal) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  // Map Load coordinates
  const loadPoints = safeLoadData.map((val, idx) => {
    const x = (idx / (safeLoadData.length - 1)) * width;
    const y = height - ((val - minVal) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const areaPoints = [
    `0,${height}`,
    ...volumePoints,
    `${width},${height}`
  ].join(" ");

  const volumeLinePath = volumePoints.join(" L ");
  const loadLinePath = loadPoints.join(" L ");

  let statusColor = "var(--color-stable)"; // default operational green for stable volume
  if (status === "CRITICAL_CASCADE_RISK" || status === "ISOLATED") {
    statusColor = "var(--color-critical)";
  } else if (status === "VULNERABLE" || status === "WARNING") {
    statusColor = "var(--color-vulnerable)";
  } else if (status === "OFFLINE") {
    statusColor = "var(--color-offline)";
  }

  // Load line is rendered as a glowing secondary color
  const loadColor = "#eab308"; // caution yellow/amber

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`grad-${status}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={statusColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor={statusColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Shaded Area under Volume */}
      <polygon points={areaPoints} fill={`url(#grad-${status})`} />
      
      {/* Volume Polyline */}
      <path 
        d={`M ${volumeLinePath}`} 
        fill="none" 
        stroke={statusColor} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* Load Polyline (Dashed) */}
      <path 
        d={`M ${loadLinePath}`} 
        fill="none" 
        stroke={loadColor} 
        strokeWidth="1" 
        strokeDasharray="3, 3"
        strokeLinecap="round" 
        strokeLinejoin="round" 
        opacity="0.85"
      />
    </svg>
  );
}
