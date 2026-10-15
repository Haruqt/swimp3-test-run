import { createClient } from "@/lib/supabase/server";
import { SensorMetricTable, type SensorGroup, type SensorRow } from "@/components/hub/SensorMetricTable";
import { SummaryCard, ListIcon, SignalIcon } from "@/components/hub/SummaryCard";
import type { Device, SensorReading } from "@/lib/types";
import { fetchLatestReadings } from "@/lib/supabase/fetchLatestReadings";

export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<string, string> = {
  flow: "Flow",
  flow_total: "Flow Total",
  pressure: "Pipeline Pressure",
};

export default async function SmartWaterMeterPage() {
  const supabase = createClient();
  const [{ data: deviceData }, { data: readingData }] = await Promise.all([
    supabase.from("devices").select("*").eq("group_type", "smart_water_meter"),
    fetchLatestReadings(supabase, { perSeries: 1 }).then((data) => ({ data })),
  ]);

  const devices = (deviceData as Device[] | null) ?? [];
  const readings = (readingData as SensorReading[] | null) ?? [];
  const online = devices.filter((d) => d.status === "online").length;

  const rows: SensorRow[] = [];
  for (const d of devices) {
    const latestByMetric = new Map<string, SensorReading>();
    for (const r of readings) {
      if (r.device_id !== d.id) continue;
      if (!latestByMetric.has(r.metric)) latestByMetric.set(r.metric, r);
    }
    for (const [metric, reading] of latestByMetric.entries()) {
      rows.push({
        deviceId: d.id,
        metric,
        sensorName: `${d.name} — ${METRIC_LABELS[metric] ?? metric}`,
        unit: reading.unit ?? "",
        value: Number(reading.value),
        status: d.status === "online" ? "optimal" : d.status === "stale" ? "warning" : "critical",
        deviceStatus: d.status,
        lastUpdate: reading.recorded_at,
      });
    }
  }

  const groups: SensorGroup[] = [{ key: "meters", label: "Smart Water Meters", rows }];

  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">
        Smart Water Meter — Device Management
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Total Devices" value={devices.length} gradient="from-sky-500 to-indigo-500" icon={<ListIcon />} />
        <SummaryCard label="Online Devices" value={online} gradient="from-amber-500 to-orange-500" icon={<SignalIcon />} />
      </div>

      <div className="mt-8">
        <SensorMetricTable groups={groups} exportPrefix="smart-water-meters" />
      </div>
    </div>
  );
}