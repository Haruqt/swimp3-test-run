import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReservoirSensors } from "@/lib/dtuip-reservoir/client";

/**
 * Pulls live Groundwater Reservoir data from app.dtuip.com (device 254722)
 * and writes it into Supabase. This device was previously believed to be
 * mock/demo-only data (see supabase/seed.ts's comments) — it's real,
 * confirmed from a recovered IronPython DSS script off the old dev PC that
 * hardcodes its exact device ID and OAuth credentials.
 *
 * GWRES-01 already exists as a devices row (added in seed.ts for the
 * mock-data version of this device) — this route just starts writing real
 * data to that same row/id instead of relying on the seeded mock rows.
 *
 * Same metric-key convention as the Well (ph/temperature_ph/conductivity/
 * tds/salinity/temperature_tds/level) so the water-quality DSS engine in
 * lib/waterQualityDSS.ts can run against either device identically.
 */

const RESERVOIR_EXTERNAL_DEVICE_ID = "GWRES-01";

const SENSOR_NAME_TO_METRIC: Record<string, string> = {
  ph: "ph",
  "temperature of ph": "temperature_ph",
  conductivity: "conductivity",
  tds: "tds",
  salinity: "salinity",
  "temperature of tds": "temperature_tds",
  "level sensor": "level",
};

// The Reservoir's API (unlike the Well's) doesn't send a unit alongside
// each value — sensor_readings.unit is NOT NULL, so every insert failed
// with "null value in column unit" until this was added. Same real units
// as the Well/DSS thresholds for the same metrics.
const METRIC_UNITS: Record<string, string> = {
  ph: "pH",
  temperature_ph: "°C",
  conductivity: "mS/cm",
  tds: "mg/L",
  salinity: "ppt",
  temperature_tds: "°C",
  level: "m",
};

function parseReservoirTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// Always run on request — never prerender this at build time or cache its response.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const results: Array<{ label: string; ok: boolean; detail: string }> = [];

  const { data: deviceRow, error: lookupError } = await supabase
    .from("devices")
    .select("id")
    .eq("external_device_id", RESERVOIR_EXTERNAL_DEVICE_ID)
    .maybeSingle();

  if (lookupError || !deviceRow) {
    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        error: `Reservoir device row not found (external_device_id="${RESERVOIR_EXTERNAL_DEVICE_ID}"): ${lookupError?.message ?? "no matching row"}`,
      },
      { status: 500 },
    );
  }

  let sensors, globalTime;
  try {
    ({ sensors, globalTime } = await getReservoirSensors());
  } catch (err) {
    return NextResponse.json(
      { syncedAt: new Date().toISOString(), error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }

  await supabase
    .from("devices")
    .update({ status: "online", last_update: parseReservoirTimestamp(globalTime) })
    .eq("id", deviceRow.id);

  for (const sensor of sensors) {
    const key = (sensor.sensorName ?? "").trim().toLowerCase();
    const metric = SENSOR_NAME_TO_METRIC[key];
    if (!metric) {
      results.push({ label: `reservoir/${sensor.sensorName}`, ok: false, detail: "Unmapped sensor name — add it to SENSOR_NAME_TO_METRIC" });
      continue;
    }

    const value = Number(sensor.value);
    if (Number.isNaN(value)) {
      results.push({ label: `reservoir/${metric}`, ok: false, detail: `Non-numeric reading: "${sensor.value}"` });
      continue;
    }

    // upsert + ignoreDuplicates, not insert: the Reservoir's API often
    // returns the same reading (same value, same updateDate) on back-to-
    // back syncs when the sensor hasn't actually produced a new point yet.
    // A plain insert() throws "duplicate key value violates unique
    // constraint sensor_readings_device_metric_time_key" every single time
    // that happens (real unique constraint on device_id+metric+recorded_at
    // — see supabase/schema.sql's note near the bottom for how to add it
    // if it's ever missing). Upserting with ignoreDuplicates just silently
    // skips the no-op instead of erroring.
    const { error } = await supabase
      .from("sensor_readings")
      .upsert(
        {
          device_id: deviceRow.id,
          metric,
          value,
          unit: METRIC_UNITS[metric] ?? "",
          recorded_at: parseReservoirTimestamp(sensor.updateDate ?? globalTime),
        },
        { onConflict: "device_id,metric,recorded_at", ignoreDuplicates: true },
      );

    results.push({
      label: `reservoir/${metric}`,
      ok: !error,
      detail: error ? error.message : `${value}`,
    });
  }

  return NextResponse.json({ syncedAt: new Date().toISOString(), results });
}