import { createClient } from "@/lib/supabase/server";
import { SensorHistoryChart } from "@/components/hub/SensorHistoryChart";
import { BackButton } from "@/components/hub/BackButton";
import type { SensorReading } from "@/lib/types";
import { fetchAllReadings } from "@/lib/supabase/fetchAllReadings";

export const dynamic = "force-dynamic";

/**
 * Real per-sensor history — the "pick a date range, see a chart" view the
 * old site had per sensor (Chart/Table tabs, time range buttons), pulling
 * every stored reading for this one device+metric combination instead of
 * just the 3 sparklines on the main dashboard.
 */
export default async function SensorHistoryPage({
  searchParams,
}: {
  searchParams: { device?: string; metric?: string; name?: string };
}) {
  const { device, metric, name } = searchParams;

  if (!device || !metric) {
    return (
      <div className="p-8">
        <p className="text-mist/60">
          Missing device or metric — open this page via a "History" link from a sensor table.
        </p>
      </div>
    );
  }

  const supabase = createClient();
  const readings = await fetchAllReadings(supabase, { deviceId: device, metric, ascending: true });
  const unit = readings[0]?.unit ?? "";
  const points = readings.map((r) => ({ recorded_at: r.recorded_at, value: Number(r.value) }));

  return (
    <div className="p-8">
      <BackButton />
      <h1 className="mt-2 font-display text-2xl font-semibold text-mist">
        History for: {name ?? metric}
      </h1>
      <p className="mt-1 text-sm text-mist/50">{points.length} reading(s) on record</p>

      <div className="mt-6 rounded-xl bg-white/5 p-6">
        <SensorHistoryChart points={points} unit={unit} />
      </div>
    </div>
  );
}