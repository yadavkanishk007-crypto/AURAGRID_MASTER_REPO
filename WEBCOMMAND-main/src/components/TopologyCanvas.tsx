"use client";

import React, { useRef, useEffect, useState } from "react";
import { kml } from "@tmcw/togeojson";

const CITY_MAP_CONFIGS: Record<string, {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  southWest: [number, number];
  northEast: [number, number];
  principalHubs: Record<string, { name: string; lat: number; lng: number; max: number }>;
  principalConnections: Array<{ source: string; target: string; efficiency: number }>;
}> = {
  bengaluru: {
    center: [12.955, 77.64],
    zoom: 12,
    minZoom: 11,
    maxZoom: 15,
    southWest: [12.75, 77.15],
    northEast: [13.15, 77.95],
    principalHubs: {
      "Hoody": { name: "Hoody", lat: 12.9716, lng: 77.5946, max: 1500 },
      "Koramangala": { name: "Koramangala", lat: 12.9352, lng: 77.6244, max: 1000 },
      "SRS Peenya": { name: "SRS Peenya", lat: 12.9784, lng: 77.5348, max: 1000 }
    },
    principalConnections: [
      { source: "Hoody", target: "Koramangala", efficiency: 0.15 },
      { source: "Koramangala", target: "SRS Peenya", efficiency: 0.12 },
      { source: "SRS Peenya", target: "Hoody", efficiency: 0.08 }
    ]
  },
  delhi: {
    center: [28.6304, 77.2177],
    zoom: 11,
    minZoom: 10,
    maxZoom: 15,
    southWest: [28.30, 76.70],
    northEast: [28.95, 77.50],
    principalHubs: {
      "Dwarka Hub": { name: "Dwarka Hub", lat: 28.5889, lng: 77.0578, max: 1500 },
      "Okhla Hub": { name: "Okhla Hub", lat: 28.5284, lng: 77.2721, max: 1000 },
      "Rohini Hub": { name: "Rohini Hub", lat: 28.7158, lng: 77.1137, max: 1000 }
    },
    principalConnections: [
      { source: "Dwarka Hub", target: "Okhla Hub", efficiency: 0.15 },
      { source: "Okhla Hub", target: "Rohini Hub", efficiency: 0.12 },
      { source: "Rohini Hub", target: "Dwarka Hub", efficiency: 0.08 }
    ]
  },
  pune: {
    center: [18.5204, 73.8567],
    zoom: 12,
    minZoom: 10,
    maxZoom: 15,
    southWest: [18.30, 73.60],
    northEast: [18.75, 74.15],
    principalHubs: {
      "Hinjawadi Hub": { name: "Hinjawadi Hub", lat: 18.5913, lng: 73.7389, max: 1500 },
      "Hadapsar Hub": { name: "Hadapsar Hub", lat: 18.5089, lng: 73.9261, max: 1000 },
      "Shivajinagar Hub": { name: "Shivajinagar Hub", lat: 18.5308, lng: 73.8549, max: 1000 }
    },
    principalConnections: [
      { source: "Hinjawadi Hub", target: "Hadapsar Hub", efficiency: 0.15 },
      { source: "Hadapsar Hub", target: "Shivajinagar Hub", efficiency: 0.12 },
      { source: "Shivajinagar Hub", target: "Hinjawadi Hub", efficiency: 0.08 }
    ]
  },
  bhopal: {
    center: [23.2599, 77.4126],
    zoom: 12,
    minZoom: 10,
    maxZoom: 15,
    southWest: [23.05, 77.15],
    northEast: [23.45, 77.65],
    principalHubs: {
      "Govindpura Hub": { name: "Govindpura Hub", lat: 23.2512, lng: 77.4589, max: 1500 },
      "Kolar road Hub": { name: "Kolar road Hub", lat: 23.1784, lng: 77.4182, max: 1000 },
      "Bairagarh Hub": { name: "Bairagarh Hub", lat: 23.2847, lng: 77.3458, max: 1000 }
    },
    principalConnections: [
      { source: "Govindpura Hub", target: "Kolar road Hub", efficiency: 0.15 },
      { source: "Kolar road Hub", target: "Bairagarh Hub", efficiency: 0.12 },
      { source: "Bairagarh Hub", target: "Govindpura Hub", efficiency: 0.08 }
    ]
  },
  lucknow: {
    center: [26.8467, 80.9462],
    zoom: 12,
    minZoom: 10,
    maxZoom: 15,
    southWest: [26.60, 80.70],
    northEast: [27.10, 81.20],
    principalHubs: {
      "Gomti nagar Hub": { name: "Gomti nagar Hub", lat: 26.8624, lng: 81.0024, max: 1500 },
      "Charbagh Hub": { name: "Charbagh Hub", lat: 26.8312, lng: 80.9238, max: 1000 },
      "Aliganj Hub": { name: "Aliganj Hub", lat: 26.8856, lng: 80.9412, max: 1000 }
    },
    principalConnections: [
      { source: "Gomti nagar Hub", target: "Charbagh Hub", efficiency: 0.15 },
      { source: "Charbagh Hub", target: "Aliganj Hub", efficiency: 0.12 },
      { source: "Aliganj Hub", target: "Gomti nagar Hub", efficiency: 0.08 }
    ]
  },
  jhansi: {
    center: [25.4484, 78.5685],
    zoom: 13,
    minZoom: 11,
    maxZoom: 16,
    southWest: [25.30, 78.40],
    northEast: [25.60, 78.70],
    principalHubs: {
      "Civil lines Hub": { name: "Civil lines Hub", lat: 25.4544, lng: 78.5721, max: 1500 },
      "Sadar bazar Hub": { name: "Sadar bazar Hub", lat: 25.4344, lng: 78.5645, max: 1000 },
      "Sipri bazaar Hub": { name: "Sipri bazaar Hub", lat: 25.4462, lng: 78.5489, max: 1000 }
    },
    principalConnections: [
      { source: "Civil lines Hub", target: "Sadar bazar Hub", efficiency: 0.15 },
      { source: "Sadar bazar Hub", target: "Sipri bazaar Hub", efficiency: 0.12 },
      { source: "Sipri bazaar Hub", target: "Civil lines Hub", efficiency: 0.08 }
    ]
  }
};

interface TopologyCanvasProps {
  activeNodes: Record<string, {
    calculatedLoadTarget: number;
    capacityRateOfChangeDelta: number;
    maxCapacity: number;
    status: "STABLE" | "VULNERABLE" | "CRITICAL_CASCADE_RISK" | "OFFLINE";
  }>;
  isOffline: boolean;
  onHoverNode: (nodeName: string | null, clientX: number, clientY: number) => void;
  activeCity?: string;
}


// ---------------- Helper Utility Functions ----------------

// Compute mathematical centroid of KML division polygon coordinates
function getPolygonCentroid(coordinates: any): [number, number] {
  let totalLng = 0;
  let totalLat = 0;
  let count = 0;

  const points: [number, number][] = [];
  const flatten = (arr: any) => {
    if (!arr) return;
    if (typeof arr[0] === "number" && typeof arr[1] === "number") {
      points.push(arr as [number, number]);
    } else if (Array.isArray(arr)) {
      for (const item of arr) {
        flatten(item);
      }
    }
  };

  flatten(coordinates);

  for (const [lng, lat] of points) {
    if (!isNaN(lng) && !isNaN(lat)) {
      totalLng += lng;
      totalLat += lat;
      count++;
    }
  }

  if (count === 0) return [12.9716, 77.5946]; // Default central Bengaluru coordinate
  return [totalLat / count, totalLng / count];
}

// Normalize division names between CSV and KML files
function normalizeDivisionName(name: string): string {
  if (!name) return "";
  const n = name.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
  
  if (n === "CBPURA" || n === "CHIKKABALLAPURA" || n === "CHIKKABALAPURA") return "CHIKKABALAPURA";
  if (n === "CHINTAMANI" || n === "CHINTHAMANI") return "CHINTHAMANI";
  if (n === "HEBBALA" || n === "HEBBAL") return "HEBBAL";
  if (n === "HSRLAYOUT" || n === "HSR") return "HSRLAYOUT";
  if (n === "INDIRANAGAR" || n === "INDIRANAGARA") return "INDIRANAGARA";
  if (n === "JAYANAGAR" || n === "JAYANAGARA") return "JAYANAGARA";
  if (n === "KANAKPURA" || n === "KANAKAPURA") return "KANAKAPURA";
  if (n === "RRNAGAR" || n === "RAJARAJESHWARINAGAR") return "RRNAGAR";
  if (n === "RAMNAGARA" || n === "RAMANAGARA") return "RAMANAGARA";
  
  return n;
}

// Clean CSV row parser supporting quoted strings and commas
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
}

// Parse high tension and low tension CSV stats
function parseLineStats(csvText: string): Record<string, any> {
  const stats: Record<string, any> = {};
  if (!csvText) return stats;

  const rows = parseCSV(csvText);
  rows.forEach((row, i) => {
    if (i === 0 || row.length < 12) return;
    const divName = row[1];
    if (!divName) return;

    const normName = normalizeDivisionName(divName);
    const ohTotal = parseFloat(row[4]) || 0;
    const ugTotal = parseFloat(row[7]) || 0;
    const abTotal = parseFloat(row[10]) || 0;
    const totalLength = parseFloat(row[11]) || 0;

    stats[normName] = {
      division: divName.trim(),
      ohTotal,
      ugTotal,
      abTotal,
      totalLength
    };
  });

  return stats;
}

// Parse substations database
function parseSubstations(csvText: string): any[] {
  const subs: any[] = [];
  if (!csvText) return subs;

  const rows = parseCSV(csvText);
  const seenNames = new Set<string>();
  rows.forEach((row, i) => {
    if (i === 0 || row.length < 5) return;
    const zone = row[1];
    const district = row[2];
    const taluk = row[3];
    let name = row[4]?.trim() || "";
    const volts = row[5]?.trim() || "";
    const voltsVal = parseInt(volts) || 66;
    const commission = row[6] || "N/A";

    if (!name) return;

    // Ensure unique name to match backend Supabase unique name logic
    const originalName = name;
    let suffixIndex = 1;
    while (seenNames.has(name)) {
      name = `${originalName} (${voltsVal} kV)`;
      if (seenNames.has(name)) {
        name = `${originalName} (${voltsVal} kV - ${suffixIndex})`;
        suffixIndex += 1;
      }
    }
    seenNames.add(name);

    subs.push({
      zone: zone?.trim(),
      district: district?.trim(),
      taluk: taluk?.trim(),
      name: name,
      volts: volts ? `${volts} kV` : "66 kV",
      voltsVal: voltsVal,
      commission: commission?.trim()
    });
  });

  return subs;
}

export default function TopologyCanvas({
  activeNodes,
  isOffline,
  onHoverNode,
  activeCity
}: TopologyCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletLibRef = useRef<any>(null);

  const cityKey = (activeCity || "bengaluru").toLowerCase();
  const cityConfig = CITY_MAP_CONFIGS[cityKey] || CITY_MAP_CONFIGS.bengaluru;

  // Mutable references to current principal hubs and connections derived from the active city
  const controlHubsRef = useRef<any>(JSON.parse(JSON.stringify(cityConfig.principalHubs)));
  const connectionLinksRef = useRef<any[]>(JSON.parse(JSON.stringify(cityConfig.principalConnections)));

  // Sync refs when city changes
  useEffect(() => {
    controlHubsRef.current = JSON.parse(JSON.stringify(cityConfig.principalHubs));
    connectionLinksRef.current = JSON.parse(JSON.stringify(cityConfig.principalConnections));
  }, [activeCity, cityConfig]);

  // References to dynamic Leaflet objects to update color states without re-initializing map
  const markersRef = useRef<Record<string, any>>({});
  const flowLinesRef = useRef<any[]>([]);
  const backLinesRef = useRef<any[]>([]);

  // Toggle map layers state
  const [layers, setLayers] = useState({
    divisions: true,
    sections: false,
    substations: true,
    htLines: true,
    ltLines: true
  });

  const [substationsCount, setSubstationsCount] = useState(0);

  // Layer references for toggling
  const divisionLayerRef = useRef<any>(null);
  const sectionLayerRef = useRef<any>(null);
  const substationsGroupRef = useRef<any>(null);
  const htLinesGroupRef = useRef<any>(null);
  const ltLinesGroupRef = useRef<any>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let mapInstance: any = null;
    let isDestroyed = false;

    // Load Leaflet dynamically to prevent Next.js SSR crashes
    import("leaflet").then((L) => {
      if (isDestroyed || !mapContainerRef.current) return;

      // Skip initialization if the container is already handled by Leaflet to prevent StrictMode errors
      if ((mapContainerRef.current as any)._leaflet_id) {
        console.warn("Leaflet container already initialized. Skipping duplicate setup.");
        return;
      }

      leafletLibRef.current = L;

      // Fix default Leaflet icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png"
      });

      // Bounding box strictly covering the active city metro area
      const southWest = L.latLng(cityConfig.southWest[0], cityConfig.southWest[1]);
      const northEast = L.latLng(cityConfig.northEast[0], cityConfig.northEast[1]);
      const bounds = L.latLngBounds(southWest, northEast);

      // 1. Initialize map view centered in active city with boundary locking
      mapInstance = L.map(mapContainerRef.current!, {
        zoomControl: false,
        attributionControl: false,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0
      }).setView(cityConfig.center, cityConfig.zoom);
      mapRef.current = mapInstance;

      // 2. Add Tile Layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: cityConfig.maxZoom,
        minZoom: cityConfig.minZoom,
        bounds: bounds
      }).addTo(mapInstance);

      // Add simple custom zoom controls pinned top-right
      L.control.zoom({ position: "topright" }).addTo(mapInstance);

      // Dismiss tooltip on background map click
      mapInstance.on("click", () => {
        onHoverNode(null, 0, 0);
      });

      // 5. Load and Render KML boundaries, CSV substations, and HT/LT line networks
      loadAllGridData(L, mapInstance);
    });

    return () => {
      isDestroyed = true;
      
      // Remove map instance exactly once
      const activeMap = mapRef.current || mapInstance;
      if (activeMap) {
        try {
          activeMap.remove();
        } catch (err) {
          console.warn("Leaflet map removal error:", err);
        }
        mapRef.current = null;
      }
      
      if (mapContainerRef.current) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, [activeCity]);

  // Fetch boundaries and database statistics dynamically to geocode and draw overlays
  async function loadAllGridData(L: any, map: any) {
    try {
      // Clear references to prevent accumulation and out-of-bounds errors on reload
      flowLinesRef.current = [];
      backLinesRef.current = [];
      markersRef.current = {};

      const centroids: Record<string, [number, number]> = {};

      let boundaryFile = "/data/division_boundry_map.kml";
      let sectionFile = "/data/section_boundris.kml";
      let substationsFile = "/data/Bengaluru Electrical Substations.csv";
      let htFile = "/data/high tension lines data.csv";
      let ltFile = "/data/low tension lines data.csv";

      if (cityKey !== "bengaluru") {
        boundaryFile = `/data/${cityKey}_boundary.kml`;
        sectionFile = ""; // Section boundary only exists for Bengaluru
        substationsFile = `/data/${cityKey}_substations.csv`;
        htFile = `/data/${cityKey}_ht_lines.csv`;
        ltFile = `/data/${cityKey}_lt_lines.csv`;
      }

      // 1. Fetch and parse Division Boundaries (KML)
      const divRes = await fetch(boundaryFile);
      if (mapRef.current !== map) return;
      if (divRes.ok) {
        const text = await divRes.text();
        if (mapRef.current !== map) return;
        const dom = new DOMParser().parseFromString(text, "text/xml");
        const geojson = kml(dom);

        geojson.features.forEach((feature: any) => {
          const rawName = feature.properties?.DivisionName || feature.properties?.name || "";
          if (rawName) {
            const centroid = getPolygonCentroid(feature.geometry.coordinates);
            const normName = normalizeDivisionName(rawName);
            centroids[normName] = centroid;
          }
        });

        divisionLayerRef.current = L.geoJSON(geojson, {
          style: {
            color: "#52525b", // Crisp Zinc-600 dark gray boundary for white map visibility
            weight: 1.8,
            fillColor: "#27272a",
            fillOpacity: 0.03
          }
        });
        
        if (layers.divisions) {
          divisionLayerRef.current.addTo(map);
        }
      }

      // 2. Fetch and parse Section Boundaries (KML)
      if (sectionFile) {
        const secRes = await fetch(sectionFile);
        if (mapRef.current !== map) return;
        if (secRes.ok) {
          const text = await secRes.text();
          if (mapRef.current !== map) return;
          const dom = new DOMParser().parseFromString(text, "text/xml");
          const geojson = kml(dom);

          sectionLayerRef.current = L.geoJSON(geojson, {
            style: {
              color: "#a1a1aa", // Lighter Zinc-400 dashed boundary for sections
              weight: 1.0,
              dashArray: "3, 6",
              fillColor: "transparent",
              fillOpacity: 0
            }
          });

          if (layers.sections) {
            sectionLayerRef.current.addTo(map);
          }
        }
      }

      // 3. Fetch CSV assets in parallel
      const [htRes, ltRes, subRes] = await Promise.all([
        fetch(htFile),
        fetch(ltFile),
        fetch(substationsFile)
      ]);
      if (mapRef.current !== map) return;

      const htText = htRes.ok ? await htRes.text() : "";
      const ltText = ltRes.ok ? await ltRes.text() : "";
      const subText = subRes.ok ? await subRes.text() : "";
      if (mapRef.current !== map) return;

      const htStats = parseLineStats(htText);
      const ltStats = parseLineStats(ltText);
      const substations = parseSubstations(subText);

      // 4. Map coordinates dynamically for all substations
      const geolocatedSubs = substations.map(sub => {
        const possibleNames = [sub.taluk, sub.name, sub.district];
        let matchedNormName = "";
        
        for (const rawName of possibleNames) {
          const norm = normalizeDivisionName(rawName);
          if (centroids[norm]) {
            matchedNormName = norm;
            break;
          }
        }
        
        if (!matchedNormName) {
          for (const rawName of possibleNames) {
            const up = (rawName || "").toUpperCase().trim();
            for (const normKey of Object.keys(centroids)) {
              if (up.includes(normKey) || normKey.includes(up)) {
                matchedNormName = normKey;
                break;
              }
            }
            if (matchedNormName) break;
          }
        }

        if (!matchedNormName) {
          const keys = Object.keys(centroids);
          if (keys.length > 0) {
            let hash = 0;
            const keyStr = ((sub.name || "") + (sub.taluk || "")).toUpperCase();
            for (let i = 0; i < keyStr.length; i++) {
              hash = keyStr.charCodeAt(i) + ((hash << 5) - hash);
            }
            matchedNormName = keys[Math.abs(hash) % keys.length];
          }
        }

        const baseCoord = matchedNormName ? centroids[matchedNormName] : cityConfig.center;
        
        let hash = 0;
        const subName = (sub.name || "").toUpperCase();
        for (let i = 0; i < subName.length; i++) {
          hash = subName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const jitterLat = ((Math.abs(hash) % 1000) / 1000 - 0.5) * 0.05;
        const jitterLng = (((Math.abs(hash >> 3) % 1000) / 1000 - 0.5) * 0.05);

        return {
          ...sub,
          lat: baseCoord[0] + jitterLat,
          lng: baseCoord[1] + jitterLng,
          divisionKey: matchedNormName
        };
      });

      // 5. Draw dynamic substations circle layers
      setSubstationsCount(geolocatedSubs.length);
      drawSubstations(L, map, geolocatedSubs);

      // 6. Draw principal connection flow links dynamically
      Object.keys(controlHubsRef.current).forEach(hubName => {
        const sub = geolocatedSubs.find(s => s.name === hubName);
        if (sub) {
          controlHubsRef.current[hubName].lat = sub.lat;
          controlHubsRef.current[hubName].lng = sub.lng;
        }
      });

      connectionLinksRef.current.forEach(conn => {
        const p1 = controlHubsRef.current[conn.source];
        const p2 = controlHubsRef.current[conn.target];
        if (!p1 || !p2) return;

        const pathCoords = [[p1.lat, p1.lng], [p2.lat, p2.lng]] as [number, number][];

        const backLine = L.polyline(pathCoords, {
          color: "rgba(30, 41, 59, 0.45)",
          weight: 4 + conn.efficiency * 20,
          opacity: 0.8
        }).addTo(map);
        backLinesRef.current.push(backLine);

        const flowLine = L.polyline(pathCoords, {
          color: "var(--color-stable)",
          weight: 2 + conn.efficiency * 16,
          dashArray: "8, 15",
          className: "leaflet-flow-path"
        }).addTo(map);

        const svgEl = flowLine.getElement() as SVGElement;
        if (svgEl) {
          const duration = (4.0 / conn.efficiency) * 0.1;
          svgEl.style.animation = `flow-run ${duration}s infinite linear`;
        }

        flowLinesRef.current.push(flowLine);
      });

      // 7. Connect high-voltage grids (HT sequential meshes)
      drawHTLines(L, map, geolocatedSubs, centroids, htStats);
      
      // 8. Connect low-voltage grids (LT radial meshes)
      drawLTLines(L, map, geolocatedSubs, centroids, ltStats);

    } catch (err) {
      console.error("Error dynamically loading municipal spatial telemetry grid:", err);
    }
  }

  // Draw substations from geocoded collection
  function drawSubstations(L: any, map: any, subs: any[]) {
    if (mapRef.current !== map || !map || !map._container) return;
    substationsGroupRef.current = L.layerGroup();

    subs.forEach(sub => {
      const isHighVoltage = sub.voltsVal >= 220;
      const isPrincipal = Object.keys(controlHubsRef.current).includes(sub.name);
      
      const color = "var(--color-stable)"; 
      const fillColor = "rgba(16, 185, 129, 0.95)";
      const radius = isPrincipal ? 10 : (isHighVoltage ? 8 : 6);
      const weight = isPrincipal ? 2.0 : (isHighVoltage ? 1.5 : 1.2);
      
      const circle = L.circleMarker([sub.lat, sub.lng], {
        radius: radius,
        weight: weight,
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.9,
        className: isPrincipal ? `spatial-hub-marker-${sub.name.replace(/\s+/g, "-")}` : (isHighVoltage ? "substation-marker-high" : "substation-marker-medium")
      });

      const nodeTypeLabel = isPrincipal ? "Generation Hub" : (isHighVoltage ? "Transmission Core" : "Distribution Substation");
      const voltsLabel = `${sub.voltsVal} kV`;

      // Show styled Leaflet popup AND trigger the canvas detail overlay on hover
      circle.bindPopup(`
        <div id="hub-popup-${sub.name.replace(/\s+/g, "-")}" style="font-family: 'Outfit', sans-serif; background: #121214; color: #f4f4f5; border: 1.5px solid ${color}; padding: 10px 12px; border-radius: 8px; font-size: 11px; min-width: 180px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          <strong style="color: ${color}; display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; text-transform: uppercase;">${sub.name}</strong>
          <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px;">
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Type:</b> ${nodeTypeLabel}</span>
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Voltage Class:</b> ${voltsLabel}</span>
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Ingestion Load:</b> <span id="popup-load-${sub.name.replace(/\s+/g, "-")}">—</span> MW</span>
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Utilisation:</b> <span id="popup-util-${sub.name.replace(/\s+/g, "-")}">—</span>%</span>
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Status:</b> <span id="popup-status-${sub.name.replace(/\s+/g, "-")}" style="font-weight:600;">STABLE</span></span>
            <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Taluk/Division:</b> ${sub.taluk || "N/A"}</span>
          </div>
        </div>
      `, { offset: [0, -4], closeButton: false });

      // Hover → show custom canvas detail overlay with substation name
      circle.on("mouseover", (e: any) => {
        circle.openPopup();
        const rect = map.getContainer().getBoundingClientRect();
        const clientX = e.originalEvent?.clientX ?? (rect.left + e.containerPoint.x);
        const clientY = e.originalEvent?.clientY ?? (rect.top + e.containerPoint.y);
        onHoverNode(sub.name, clientX, clientY);
      });

      circle.on("mouseout", () => {
        circle.closePopup();
        onHoverNode(null, 0, 0);
      });

      // Register marker in markersRef
      markersRef.current[sub.name] = circle;

      substationsGroupRef.current.addLayer(circle);
    });

    if (layers.substations) {
      substationsGroupRef.current.addTo(map);
    }
  }

  // Draw High Tension sequential connection lines and bind CSV stats
  function drawHTLines(L: any, map: any, subs: any[], centroids: Record<string, [number, number]>, htStats: Record<string, any>) {
    if (mapRef.current !== map || !map || !map._container) return;
    htLinesGroupRef.current = L.layerGroup();

    const htNodes = subs.filter(s => s.voltsVal >= 220);
    const allHT = htNodes;
    const drawnSet = new Set<string>();

    allHT.forEach(sub => {
      let nearest: any = null;
      let minDistance = Infinity;

      allHT.forEach(other => {
        if (other.name === sub.name) return;
        const d = Math.pow(other.lat - sub.lat, 2) + Math.pow(other.lng - sub.lng, 2);
        if (d < minDistance) {
          minDistance = d;
          nearest = other;
        }
      });

      if (nearest) {
        const key = [sub.name, nearest.name].sort().join("_");
        if (!drawnSet.has(key)) {
          drawnSet.add(key);

          const coords = [[sub.lat, sub.lng], [nearest.lat, nearest.lng]] as [number, number][];
          const stats = htStats[sub.divisionKey] || htStats[nearest.divisionKey] || { totalLength: 10, ohTotal: 5, ugTotal: 5, division: sub.taluk || "Transmission Core" };

          const line = L.polyline(coords, {
            color: "#f43f5e",
            weight: 3.2,
            opacity: 0.8,
            dashArray: "8, 12",
            className: "leaflet-ht-path"
          });

          bindLinePopup(line, stats, "High Tension Transmission Link", "#f43f5e");
          htLinesGroupRef.current.addLayer(line);
        }
      }

      let secondNearest: any = null;
      let secondMinDistance = Infinity;

      allHT.forEach(other => {
        if (other.name === sub.name) return;
        const d = Math.pow(other.lat - sub.lat, 2) + Math.pow(other.lng - sub.lng, 2);
        if (d > minDistance && d < secondMinDistance) {
          secondMinDistance = d;
          secondNearest = other;
        }
      });

      if (secondNearest && secondMinDistance < 0.08) {
        const key = [sub.name, secondNearest.name].sort().join("_");
        if (!drawnSet.has(key)) {
          drawnSet.add(key);

          const coords = [[sub.lat, sub.lng], [secondNearest.lat, secondNearest.lng]] as [number, number][];
          const stats = htStats[sub.divisionKey] || { totalLength: 10, ohTotal: 5, ugTotal: 5, division: sub.taluk || "Transmission Link" };

          const line = L.polyline(coords, {
            color: "#f43f5e",
            weight: 2.2,
            opacity: 0.6,
            dashArray: "8, 15",
            className: "leaflet-ht-path-minor"
          });

          bindLinePopup(line, stats, "Transmission Grid Mesh Poly-Link", "#f43f5e");
          htLinesGroupRef.current.addLayer(line);
        }
      }
    });

    if (layers.htLines) {
      htLinesGroupRef.current.addTo(map);
    }
  }

  // Draw Low Tension radial distribution feeder links
  function drawLTLines(L: any, map: any, subs: any[], centroids: Record<string, [number, number]>, ltStats: Record<string, any>) {
    if (mapRef.current !== map || !map || !map._container) return;
    ltLinesGroupRef.current = L.layerGroup();

    const ltNodes = subs.filter(s => s.voltsVal < 220);
    const htNodes = subs.filter(s => s.voltsVal >= 220);
    const allHT = htNodes;
    const drawnSet = new Set<string>();

    ltNodes.forEach(ltSub => {
      let nearestHT: any = null;
      let minHTDistance = Infinity;

      allHT.forEach(ht => {
        const d = Math.pow(ht.lat - ltSub.lat, 2) + Math.pow(ht.lng - ltSub.lng, 2);
        if (d < minHTDistance) {
          minHTDistance = d;
          nearestHT = ht;
        }
      });

      if (nearestHT) {
        const coords = [[ltSub.lat, ltSub.lng], [nearestHT.lat, nearestHT.lng]] as [number, number][];
        const stats = ltStats[ltSub.divisionKey] || { totalLength: 5, ohTotal: 3, ugTotal: 2, division: ltSub.taluk || "Distribution Hub" };

        const line = L.polyline(coords, {
          color: "#eab308",
          weight: 1.6,
          opacity: 0.7,
          dashArray: "4, 8",
          className: "leaflet-lt-path"
        });

        bindLinePopup(line, stats, "Low Tension Step-Down Feeder Link", "#eab308");
        ltLinesGroupRef.current.addLayer(line);
      }

      let nearestLT: any = null;
      let minLTDistance = Infinity;

      ltNodes.forEach(other => {
        if (other.name === ltSub.name) return;
        const d = Math.pow(other.lat - ltSub.lat, 2) + Math.pow(other.lng - ltSub.lng, 2);
        if (d < minLTDistance) {
          minLTDistance = d;
          nearestLT = other;
        }
      });

      if (nearestLT && minLTDistance < 0.02) {
        const key = [ltSub.name, nearestLT.name].sort().join("_");
        if (!drawnSet.has(key)) {
          drawnSet.add(key);

          const coords = [[ltSub.lat, ltSub.lng], [nearestLT.lat, nearestLT.lng]] as [number, number][];
          const stats = ltStats[ltSub.divisionKey] || { totalLength: 5, ohTotal: 3, ugTotal: 2, division: ltSub.taluk || "Distribution Mesh" };

          const line = L.polyline(coords, {
            color: "#a1a1aa",
            weight: 1.2,
            opacity: 0.5,
            dashArray: "3, 6"
          });

          bindLinePopup(line, stats, "Low Tension Local Distribution Mesh", "#a1a1aa");
          ltLinesGroupRef.current.addLayer(line);
        }
      }
    });

    if (layers.ltLines) {
      ltLinesGroupRef.current.addTo(map);
    }
  }

  // Bind custom structured details window popup to vector paths
  function bindLinePopup(line: any, stats: any, gridType: string, themeColor: string) {
    line.bindPopup(`
      <div style="font-family: 'Outfit', sans-serif; background: #121214; color: #f4f4f5; border: 1.5px solid ${themeColor}; padding: 10px 12px; border-radius: 8px; font-size: 11px; min-width: 180px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
        <strong style="color: ${themeColor}; display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${gridType}</strong>
        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px;">
          <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Division:</b> ${stats.division || "Unknown"}</span>
          <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Total Division Grid:</b> ${stats.totalLength.toFixed(3)} km</span>
          <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Overhead (OH) Total:</b> ${stats.ohTotal.toFixed(3)} km</span>
          <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Underground (UG) Total:</b> ${stats.ugTotal.toFixed(3)} km</span>
          <span style="color: #a1a1aa;"><b style="color: #e4e4e7;">Aerial Bundled (AB):</b> ${(stats.abTotal || 0).toFixed(3)} km</span>
        </div>
      </div>
    `, { offset: [0, 0], closeButton: false });
  }

  // Coordinate visual color updates on state change (REST forecasting sliders)
  useEffect(() => {
    if (!mapRef.current || !leafletLibRef.current) return;
    const L = leafletLibRef.current;

    // 1. Update Substation markers color-coded state dynamically
    Object.keys(markersRef.current).forEach(hubName => {
      const marker = markersRef.current[hubName];
      const data = activeNodes[hubName];
      const status = isOffline ? "OFFLINE" : (data?.status || "STABLE");

      let color = "var(--color-stable)";
      if (status === "CRITICAL_CASCADE_RISK") {
        color = "var(--color-critical)";
      } else if (status === "VULNERABLE") {
        color = "var(--color-vulnerable)";
      } else if (status === "OFFLINE") {
        color = "var(--color-offline)";
      }

      // Check if it's one of our principal hubs to keep green baseline glow
      const isPrincipal = Object.keys(controlHubsRef.current).includes(hubName);
      
      marker.setStyle({
        color: color,
        fillColor: color
      });

      // --- Live popup content refresh ---
      const loadVal = data?.calculatedLoadTarget || 0;
      const maxCap = data?.maxCapacity || (isPrincipal ? controlHubsRef.current[hubName].max : 400);
      const utilPct = Math.min(100, (loadVal / maxCap) * 100).toFixed(1);
      
      const voltageClass = maxCap >= 1500 ? "400 kV" : (maxCap >= 1000 ? "220 kV" : "66 kV");
      const nodeTypeLabel = maxCap >= 1500 ? "Generation Hub" : (maxCap >= 1000 ? "Transmission Core" : "Distribution Substation");
      
      const statusLabel = status.replace(/_/g, " ");
      const statusColor = status === "CRITICAL_CASCADE_RISK" ? "#ef4444"
        : status === "VULNERABLE" ? "#f59e0b"
        : status === "OFFLINE" ? "#64748b"
        : "#10b981";

      const popupHtml = `
        <div id="hub-popup-${hubName.replace(/\s+/g, "-")}" style="font-family:'Outfit',sans-serif;background:#121214;color:#f4f4f5;border:1.5px solid ${statusColor};padding:10px 12px;border-radius:8px;font-size:11px;min-width:200px;box-shadow:0 4px 20px rgba(0,0,0,0.5);">
          <strong style="color:${statusColor};display:block;margin-bottom:6px;font-size:13px;font-weight:700;text-transform:uppercase;">${hubName}</strong>
          <div style="display:flex;flex-direction:column;gap:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Type:</b> ${nodeTypeLabel}</span>
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Voltage Class:</b> ${voltageClass}</span>
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Ingestion Load:</b> ${loadVal.toLocaleString()} MW</span>
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Utilisation:</b> ${utilPct}%</span>
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Status:</b> <span style="color:${statusColor};font-weight:600;">${statusLabel}</span></span>
            <span style="color:#a1a1aa;"><b style="color:#e4e4e7;">Max Capacity:</b> ${maxCap.toLocaleString()} MW</span>
          </div>
        </div>`;

      const popup = marker.getPopup();
      if (popup) {
        popup.setContent(popupHtml);
      }

      // Add pulse scaling class if critical cascade risk is triggered
      const circleEl = marker.getElement();
      if (circleEl) {
        if (status === "CRITICAL_CASCADE_RISK") {
          circleEl.classList.add("node-pulse-critical");
        } else {
          circleEl.classList.remove("node-pulse-critical");
        }
      }
    });

    // 2. Update Connection vector link colors and particle speed offset keyframes
    flowLinesRef.current.forEach((flowLine, idx) => {
      const conn = connectionLinksRef.current[idx];
      if (!conn) return;

      const sNode = activeNodes[conn.source];
      const tNode = activeNodes[conn.target];

      const sStatus = isOffline ? "OFFLINE" : (sNode?.status || "STABLE");
      const tStatus = isOffline ? "OFFLINE" : (tNode?.status || "STABLE");

      let strokeColor = "var(--color-stable)";
      let modifier = 1.0;

      if (sStatus === "OFFLINE" || tStatus === "OFFLINE") {
        strokeColor = "var(--color-offline)";
        modifier = 0.0; // Freeze flows
      } else if (sStatus === "CRITICAL_CASCADE_RISK" || tStatus === "CRITICAL_CASCADE_RISK") {
        strokeColor = "var(--color-critical)";
        modifier = 0.3; // Cascade risk moves vectors super quick
      } else if (sStatus === "VULNERABLE" || tStatus === "VULNERABLE") {
        strokeColor = "var(--color-vulnerable)";
        modifier = 0.65;
      }

      flowLine.setStyle({ color: strokeColor });

      const svgEl = flowLine.getElement() as SVGElement;
      if (svgEl) {
        if (modifier === 0) {
          svgEl.style.animation = "none";
        } else {
          const duration = ((4.0 / conn.efficiency) * 0.1) * modifier;
          svgEl.style.animation = `flow-run ${duration}s infinite linear`;
        }
      }
    });
  }, [activeNodes, isOffline]);

  // Handle GIS Layers Toggles
  function handleLayerToggle(layerName: "divisions" | "sections" | "substations" | "htLines" | "ltLines") {
    const updated = { ...layers, [layerName]: !layers[layerName] };
    setLayers(updated);

    if (!mapRef.current) return;
    const map = mapRef.current;

    if (layerName === "divisions" && divisionLayerRef.current) {
      if (updated.divisions) map.addLayer(divisionLayerRef.current);
      else map.removeLayer(divisionLayerRef.current);
    } else if (layerName === "sections" && sectionLayerRef.current) {
      if (updated.sections) map.addLayer(sectionLayerRef.current);
      else map.removeLayer(sectionLayerRef.current);
    } else if (layerName === "substations" && substationsGroupRef.current) {
      if (updated.substations) map.addLayer(substationsGroupRef.current);
      else map.removeLayer(substationsGroupRef.current);
    } else if (layerName === "htLines" && htLinesGroupRef.current) {
      if (updated.htLines) map.addLayer(htLinesGroupRef.current);
      else map.removeLayer(htLinesGroupRef.current);
    } else if (layerName === "ltLines" && ltLinesGroupRef.current) {
      if (updated.ltLines) map.addLayer(ltLinesGroupRef.current);
      else map.removeLayer(ltLinesGroupRef.current);
    }
  }

  const utilityLabel = activeCity === "delhi" ? "DTL"
    : activeCity === "pune" ? "MSETCL"
    : activeCity === "bhopal" ? "MPPTCL"
    : activeCity === "lucknow" ? "UPPTCL"
    : activeCity === "jhansi" ? "UPPCL"
    : "BESCOM";

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Map Bounding canvas Container */}
      <div
        ref={mapContainerRef}
        id="auragrid-leaflet-map"
        style={{ width: "100%", height: "100%", background: "#cbd5e1" }}
      />

      {/* Dynamic Map Layers Selector Overlay Panel */}
      <div
        className="canvas-legend"
        style={{ top: "1.25rem", left: "1.25rem", right: "auto", display: "flex", flexDirection: "column", gap: "0.4rem" }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="legend-title">GIS Grid Layers</div>
        
        <label className="legend-item" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={layers.divisions}
            onChange={() => handleLayerToggle("divisions")}
            style={{ cursor: "pointer" }}
          />
          <span>{utilityLabel} Division Boundaries</span>
        </label>
        
        {activeCity === "bengaluru" && (
          <label className="legend-item" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={layers.sections}
              onChange={() => handleLayerToggle("sections")}
              style={{ cursor: "pointer" }}
            />
            <span>{utilityLabel} Section Boundaries</span>
          </label>
        )}
        
        <label className="legend-item" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={layers.substations}
            onChange={() => handleLayerToggle("substations")}
            style={{ cursor: "pointer" }}
          />
          <span className="legend-color" style={{ backgroundColor: "#f97316", width: "8px", height: "8px", display: "inline-block", borderRadius: "50%" }} />
          <span>Substations ({substationsCount} nodes)</span>
        </label>

        <label className="legend-item" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={layers.htLines}
            onChange={() => handleLayerToggle("htLines")}
            style={{ cursor: "pointer" }}
          />
          <span style={{ borderBottom: "2px dashed #f43f5e", width: "15px", height: "0", display: "inline-block", marginRight: "2px" }} />
          <span>HT Transmission Lines (&ge;220kV)</span>
        </label>

        <label className="legend-item" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={layers.ltLines}
            onChange={() => handleLayerToggle("ltLines")}
            style={{ cursor: "pointer" }}
          />
          <span style={{ borderBottom: "1.5px dashed #eab308", width: "15px", height: "0", display: "inline-block", marginRight: "2px" }} />
          <span>LT Distribution Lines (&lt;220kV)</span>
        </label>
      </div>
    </div>
  );
}
