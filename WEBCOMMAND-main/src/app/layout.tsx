import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuraGrid Municipal Control Room - Spatial Telemetry Dashboard",
  description: "High-fidelity real-time telemetry streaming and cascade breach forecasting system for BESCOM Bengaluru grid partitions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
