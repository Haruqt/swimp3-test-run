import { createClient } from "@/lib/supabase/server";
import { SensorMetricTable, type SensorGroup, type SensorRow } from "@/components/hub/SensorMetricTable";
import { SummaryCard, ListIcon, SignalIcon, GaugeIcon } from "@/components/hub/SummaryCard";
import type { Device, SensorReading } from "@/lib/types";
import { fetchLatestReadings } from "@/lib/supabase/fetchLatestReadings";

export const dynamic = "force-dynamic";

export default async function PressureSensorsPage() {
  const supabase = createClient();
  const [{ data: deviceData }, { data: readingData }] = await Promise.all([
    supabase.from("devices").select("*").eq("group_type", "pressure"),
    fetchLatestReadings(supabase, { perSeries: 1 }).then((data) => ({ data: data.filter((r) => r.metric === "pressure") })),
  ]);

  const devices = (deviceData as Device[] | null) ?? [];
  const readings = (readingData as SensorReading[] | null) ?? [];
  const online = devices.filter((d) => d.status === "online").length;

  const rows: SensorRow[] = devices.map((d) => {
    const reading = readings.find((r) => r.device_id === d.id);
    return {
      deviceId: d.id,
      metric: "pressure",
      sensorName: d.name ?? "Sensor",
      unit: reading?.unit ?? "bar",
      value: reading ? Number(reading.value) : 0,
      // Pressure doesn't have a shared safe-range in waterQualityDSS (it's
      // per-device, calibrated on-site) — connectivity is the meaningful
      // status here, so color by that instead of a fake optimal/critical.
      status: !reading ? "unknown" : d.status === "online" ? "optimal" : "critical",
      deviceStatus: d.status,
      lastUpdate: reading?.recorded_at ?? "",
    };
  });

  const groups: SensorGroup[] = [{ key: "pressure", label: "Pressure Sensors", rows }];

  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">
        Pressure Sensor — Device Management
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Total Devices" value={devices.length} gradient="from-sky-500 to-indigo-500" icon={<ListIcon />} />
        <SummaryCard label="Online Devices" value={online} gradient="from-amber-500 to-orange-500" icon={<SignalIcon />} />
      </div>

      <div className="mt-8">
        <SensorMetricTable groups={groups} exportPrefix="pressure-sensors" />
      </div>
    </div>
  );
}