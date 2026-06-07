export function getApiBaseUrl(): string {
  // 1. Check if configured in environment
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl;
  }

  // 2. Client-side dynamic derivation
  if (typeof window !== "undefined") {
    const host = window.location.host;
    const protocol = window.location.protocol;

    // Cloud Run URL mapping:
    // e.g. webcommand_center-689922962048.asia-south1.run.app -> auragrid-backend-689922962048.asia-south1.run.app
    if (host.includes("run.app")) {
      if (host.includes("webcommand-center")) {
        return `${protocol}//${host.replace("webcommand-center", "auragrid-backend")}`;
      }
      if (host.includes("webcommand-centre")) {
        return `${protocol}//${host.replace("webcommand-centre", "auragrid-backend")}`;
      }
      if (host.includes("webcommand_center")) {
        return `${protocol}//${host.replace("webcommand_center", "auragrid-backend")}`;
      }
      if (host.includes("webcommand_centre")) {
        return `${protocol}//${host.replace("webcommand_centre", "auragrid-backend")}`;
      }
    }

    // Localhost fallback
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      return `http://${window.location.hostname}:8000`;
    }
  }

  return "";
}
