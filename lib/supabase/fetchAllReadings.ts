import type { SupabaseClient } from "@supabase/supabase-js";
import type { SensorReading } from "@/lib/types";

// PostgREST silently caps every response at 1,000 rows. A plain
// .select("*") therefore returns only the oldest/newest 1,000 readings and
// the pins/charts look "stale". This pages through with .range() instead.
const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

export interface FetchReadingsOptions {
  ascending?: boolean;
  deviceId?: string;
  metric?: string;
  since?: string;
}

export async function fetchAllReadings(
  supabase: SupabaseClient<any, any, any>,
  { ascending = false, deviceId, metric, since }: FetchReadingsOptions = {},
): Promise<SensorReading[]> {
  const rows: SensorReading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let query = supabase.from("sensor_readings").select("*");
    if (deviceId) query = query.eq("device_id", deviceId);
    if (metric) query = query.eq("metric", metric);
    if (since) query = query.gte("recorded_at", since);
    const { data, error } = await query
      .order("recorded_at", { ascending })
      .order("id", { ascending })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("fetchAllReadings failed:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as SensorReading[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}