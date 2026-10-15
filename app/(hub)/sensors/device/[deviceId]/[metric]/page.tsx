import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeviceDetailView } from "@/components/hub/DeviceDetailView";
import type { Device, SensorReading } from "@/lib/types";
import { BackButton } from "@/components/hub/BackButton";
import { fetchAllReadings } from "@/lib/supabase/fetchAllReadings";

export const dynamic = "force-dynamic";

/**
 * The full-page device detail view — what the old site's blue "Check"
 * button opened for a device (Basic Information, a date-range table, a
 * location map, and a graph). Linked from SensorMetricTable's "🔍 Check"
 * action column on the Pressure Sensors / Smart Water Meter pages.
 */
export default async function DeviceDetailPage({
  params,
  searchParams,
}: {
  params: { deviceId: string; metric: string };
  searchParams: { name?: string };
}) {
  const supabase = createClient();

  const [{ data: deviceData }, { data: readingData }] = await Promise.all([
    supabase.from("devices").select("*").eq("id", params.deviceId).maybeSingle(),
    fetchAllReadings(supabase, { deviceId: params.deviceId, metric: params.metric }).then((data) => ({ data })),
  ]);

  const device = deviceData as Device | null;
  if (!device) notFound();

  const readings = (readingData as SensorReading[] | null) ?? [];
  const sensorName = searchParams.name ?? device.name ?? "Sensor";

  return (
    <div>
      <div className="px-8 pt-6">
        <BackButton />
      </div>
      <DeviceDetailView device={device} readings={readings} metric={params.metric} sensorName={sensorName} />
    </div>
  );
}