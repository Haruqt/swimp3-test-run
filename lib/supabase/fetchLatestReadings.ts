import type { SupabaseClient } from "@supabase/supabase-js";
import type { SensorReading } from "@/lib/types";
import { fetchAllReadings } from "@/lib/supabase/fetchAllReadings";

// Pages that only need "the newest N readings of every sensor" (dashboard,
// sensor tables, the public map) should NOT download the whole readings
// table on every visit. This asks Postgres for the newest `perSeries` rows
// of each (device, metric) pair through the `latest_readings()` SQL function
// (see the 2026-10-14 migration in supabase/schema.sql).
//
// A sensor that went offline months ago still keeps its newest rows, because
// the cap is per sensor, not a time window.
//
// If the SQL function has not been created yet, this falls back to the old
// full-table paging so the site keeps working (slower) instead of breaking.

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export async function fetchLatestReadings(
  supabase: SupabaseClient<any, any, any>,
  { perSeries = 200, ascending = false }: { perSeries?: number; ascending?: boolean } = {},
): Promise<SensorReading[]> {
  const rows: SensorReading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .rpc("latest_readings", { n_per_series: perSeries })
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (page === 0) {
        console.warn(`latest_readings() unavailable (${error.message}) — falling back to full paging. Run the 2026-10-14 migration in supabase/schema.sql.`);
        return fetchAllReadings(supabase, { ascending });
      }
      console.error("fetchLatestReadings failed mid-way:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as SensorReading[]));
    if (data.length < PAGE_SIZE) break;
  }
  return ascending ? rows.reverse() : rows;
}