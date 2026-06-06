"use client";

import React from "react";

interface AlertToastProps {
  visible: boolean;
  exposureVector: string;
  timestamp: string;
}

export default function AlertToast({
  visible,
  exposureVector,
  timestamp
}: AlertToastProps) {
  return (
    <div className={`fixed-alert-toast ${visible ? "visible" : ""}`}>
      <div className="alert-toast-title">
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Critical Cascade Risk Identified
      </div>
      <div className="alert-toast-msg">
        ⚠️ CRITICAL CASCADE RISK IDENTIFIED IN {exposureVector} AT {timestamp} UTC
      </div>
    </div>
  );
}
