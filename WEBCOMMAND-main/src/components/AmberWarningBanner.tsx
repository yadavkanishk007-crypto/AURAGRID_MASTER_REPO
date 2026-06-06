import React from "react";

interface AmberWarningBannerProps {
  visible: boolean;
  worstNodeName: string;
  targetTimeStr: string;
}

/**
 * System warning banner triggered when the grid enters a vulnerable (Amber) operational state.
 */
export default function AmberWarningBanner({
  visible,
  worstNodeName,
  targetTimeStr
}: AmberWarningBannerProps) {
  if (!visible) return null;

  return (
    <div className="amber-warning-banner">
      <span className="banner-pulse-amber" />
      <span>
        ⚠️ <strong>SYSTEM WARNING:</strong> Amber Warning Level. Operational limits approaching boundary safety thresholds in{" "}
        <strong>{worstNodeName || "Koramangala Residential"}</strong> at {targetTimeStr} UTC.
      </span>
    </div>
  );
}
