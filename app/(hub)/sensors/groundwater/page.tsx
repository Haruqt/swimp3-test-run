import { createClient } from "@/lib/supabase/server";
import { evaluateMetric } from "@/lib/waterQualityDSS";
import { SensorMetricTable, type SensorGroup, type SensorRow } from "@/components/hub/SensorMetricTable";
import { SummaryCard, ListIcon, SignalIcon, DropletIcon, GaugeIcon } from "@/components/hub/SummaryCard";
import type { Device, SensorReading } from "@/lib/types";
import { fetchLatestReadings } from "@/lib/supabase/fetchLatestReadings";

export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<string, string> = {
  ph: "PH",
  temperature: "Temperature",
  temperature_ph: "Temperature of PH",
  temperature_tds: "Temperature of TDS",
  conductivity: "Conductivity",
  tds: "TDS",
  salinity: "Salinity",
  level: "Level",
  turbidity: "Turbidity",
  chlorine: "Chlorine",
};

function buildRows(device: Device | undefined, readings: SensorReading[]): SensorRow[] {
  if (!device) return [];
  const latestByMetric = new Map<string, SensorReading>();
  for (const r of readings) {
    if (r.device_id !== device.id) continue;
    if (!latestByMetric.has(r.metric)) latestByMetric.set(r.metric, r);
  }
  return Array.from(latestByMetric.entries()).map(([metric, reading]) => {
    const evaluated = evaluateMetric(metric, Number(reading.value));
    return {
      deviceId: device.id,
      metric,
      sensorName: METRIC_LABELS[metric] ?? metric,
      unit: evaluated.unit || reading.unit || "",
      value: Number(reading.value),
      status: evaluated.status,
      deviceStatus: device.status,
      lastUpdate: reading.recorded_at,
    };
  });
}

export default async function GroundwaterPage() {
  const supabase = createClient();
  const [{ data: deviceData }, { data: readingData }] = await Promise.all([
    supabase.from("devices").select("*").in("group_type", ["groundwater_well", "groundwater_reservoir"]),
    fetchLatestReadings(supabase, { perSeries: 1 }).then((data) => ({ data })),
  ]);

  const devices = (deviceData as Device[] | null) ?? [];
  const readings = (readingData as SensorReading[] | null) ?? [];
  const wellDevice = devices.find((d) => d.group_type === "groundwater_well");
  const reservoirDevice = devices.find((d) => d.group_type === "groundwater_reservoir");

  const wellRows = buildRows(wellDevice, readings);
  const reservoirRows = buildRows(reservoirDevice, readings);
  const allRows = [...wellRows, ...reservoirRows];
  const onlineCount = allRows.filter((r) => r.deviceStatus === "online").length;

  const groups: SensorGroup[] = [
    { key: "well", label: "Groundwater Monitoring Well", rows: wellRows },
    { key: "reservoir", label: "Groundwater Reservoir", rows: reservoirRows },
  ];

  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">
        Groundwater Monitoring — Device Management
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Well Sensors" value={wellRows.length} gradient="from-sky-500 to-indigo-500" icon={<DropletIcon />} />
        <SummaryCard label="Reservoir Sensors" value={reservoirRows.length} gradient="from-emerald-500 to-teal-500" icon={<DropletIcon />} />
        <SummaryCard label="Online Sensors" value={onlineCount} gradient="from-amber-500 to-orange-500" icon={<SignalIcon />} />
        <SummaryCard label="Total Sensors" value={allRows.length} gradient="from-pink-500 to-rose-600" icon={<ListIcon />} />
      </div>

      <div className="mt-8">
        <SensorMetricTable groups={groups} exportPrefix="groundwater-sensors" />
      </div>
    </div>
  );
}