import { NextResponse } from "next/server";

// Hardcoded configs matching src/utils/gridSimulation.ts
const NODES_CONFIG = {
  "Sharavathi Hydro Hub": { initial: 800.0, max: 1500.0, min: 20.0, amplitude: 80.0 },
  "Koramangala Residential": { initial: 500.0, max: 1000.0, min: 20.0, amplitude: 120.0 },
  "Whitefield Industrial": { initial: 650.0, max: 1200.0, min: 20.0, amplitude: 100.0 }
};

export async function GET() {
  try {
    const step = Math.floor(Date.now() / 3000) % 60; // 3-minute wave cycle (60 steps)
    const wavePhase = (step / 60) * 2 * Math.PI;

    // Simulate standard Indian Power Grid grid frequency in Hz (typically fluctuating around 49.95 - 50.05 Hz)
    const frequencyHz = 50.0 + (Math.sin(wavePhase * 2) * 0.03) + ((Math.random() - 0.5) * 0.015);
    
    // Simulate system voltage in kV
    const systemVoltageKv = 400.0 + (Math.sin(wavePhase) * 2.5) + ((Math.random() - 0.5) * 0.5);

    const activeTelemetry = Object.keys(NODES_CONFIG).map(nodeName => {
      const config = NODES_CONFIG[nodeName as keyof typeof NODES_CONFIG];
      
      // Calculate staggered phase offsets for nodes
      let nodePhase = wavePhase;
      if (nodeName === "Koramangala Residential") nodePhase += Math.PI / 4;
      if (nodeName === "Whitefield Industrial") nodePhase += Math.PI / 2;

      const testWave = Math.sin(nodePhase) * config.amplitude * 2.8;
      const randomNoise = (Math.random() - 0.5) * 12.0;

      // Base load drift to occasionally sweep towards capacity breach
      const baseDrift = config.initial + (config.max - config.initial) * 0.42;
      let simulatedVol = baseDrift + testWave + randomNoise;

      // Restrict within physical limits
      simulatedVol = Math.min(config.max * 1.05, Math.max(config.min, simulatedVol));
      const simulatedLoad = simulatedVol * (0.8 + (Math.random() - 0.5) * 0.08);

      let status = "NORMAL";
      if (simulatedVol >= config.max) {
        status = "ISOLATED";
      } else if (simulatedVol >= config.max * 0.88 || simulatedVol <= config.min * 1.5) {
        status = "WARNING";
      }

      // Stagger voltage class
      const voltsClass = nodeName === "Sharavathi Hydro Hub" ? "400kV" : "220kV";

      return {
        node_name: nodeName,
        voltage_class: voltsClass,
        active_power_mw: parseFloat(simulatedVol.toFixed(2)),
        reactive_power_mvar: parseFloat((simulatedLoad * 0.15).toFixed(2)),
        power_factor: parseFloat((0.92 + Math.abs(Math.sin(wavePhase) * 0.06)).toFixed(3)),
        load_status: status
      };
    });

    return NextResponse.json({
      sldc_metadata: {
        center_name: "Karnataka State Load Despatch Centre (SLDC)",
        grid_frequency_hz: parseFloat(frequencyHz.toFixed(3)),
        system_voltage_kv: parseFloat(systemVoltageKv.toFixed(2)),
        recorded_at: new Date().toISOString()
      },
      active_telemetry: activeTelemetry
    });
  } catch (error: any) {
    console.error("Error generating government telemetry:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
