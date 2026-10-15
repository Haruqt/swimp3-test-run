import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSensorsByDeviceId } from "@/lib/dtuip/client";
import { getWellSensorsViaOAuth } from "@/lib/dtuip-well-oauth/client";

/**
 * Pulls live Groundwater Well sensor data and writes it into this
 * project's own Supabase `sensor_readings` table.
 *
 * TWO possible sources, tried in order:
 *
 * 1. lib/dtuip-well-oauth/client.ts — the SAME app.dtuip.com OAuth backend
 *    already working for the Reservoir (added 2026-09-22, once it turned
 *    out the Well is the same Holykell account as the Reservoir, just a
 *    different device). No CAPTCHA, no manual token, self-renewing —
 *    tried first because if it works, the recurring "token expired" 401s
 *    from source 2 go away for good.
 * 2. lib/dtuip/client.ts — the original front.dtuip.com client with a
 *    manually-bootstrapped bearer token (DTUIP_BOOTSTRAP_TOKEN /
 *    app_settings). Kept as a fallback in case app.dtuip.com doesn't
 *    actually expose this device the same way it exposes the Reservoir —
 *    this was never confirmed against the real API before handing it
 *    over, since this environment has no network access to dtuip.com.
 *
 * Whichever source succeeds first is used; if BOTH fail, the response
 * reports both errors so it's clear which one(s) need attention.
 *
 * DEVICE_ID/USER_ID below are this account's dashboard IDs for the
 * Groundwater Well (Cauayan City, Isabela group, serial M8091G4NJ67LK54N)
 * — confirmed from a captured screenshot of the dashboard, not guessed.
 */

const USER_ID = "93443";
const WELL_DEVICE_ID = "254718";
const WELL_EXTERNAL_DEVICE_ID = "GWWELL-01"; // must match the devices table row used by dashboard-data/route.ts

// oauth (app.dtuip.com) sends lowercase sensor names, matching the
// Reservoir's convention; legacy (front.dtuip.com) sends Title Case
// ("PH", "Temperature of PH", ...) — normalized to lowercase before this
// lookup runs, so one map covers both sources.
const SENSOR_NAME_TO_METRIC: Record<string, string> = {
  ph: "ph",
  "temperature of ph": "temperature_ph",
  conductivity: "conductivity",
  tds: "tds",
  salinity: "salinity",
  "temperature of tds": "temperature_tds",
  "level sensor": "level",
};

// Same real units used for the Reservoir (app/api/sync/dtuip-reservoir) —
// used as a fallback when a source doesn't send its own unit (the OAuth
// backend doesn't; the legacy one does).
const METRIC_UNITS: Record<string, string> = {
  ph: "pH",
  temperature_ph: "°C",
  conductivity: "mS/cm",
  tds: "mg/L",
  salinity: "ppt",
  temperature_tds: "°C",
  level: "m",
};

/**
 * Handles both known timestamp shapes: the legacy client's
 * "YYYY/MM/DD HH:mm:ss" (confirmed real: "2026/09/07 19:02:37") and
 * whatever ISO-ish format the OAuth backend sends (matching the
 * Reservoir's `updateDate`). Falls back to "now" if missing/unparseable.
 */
function parseDtuipTimestamp(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const isoish = raw.replace(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})$/, "$1-$2-$3T$4");
  const parsed = new Date(isoish);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

interface NormalizedReading {
  metric: string;
  value: number;
  unit: string;
  recordedAt: string;
}

// Always run on request — never prerender this at build time or cache its response.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  const { data: deviceRow, error: deviceLookupError } = await supabase
    .from("devices")
    .select("id")
    .eq("external_device_id", WELL_EXTERNAL_DEVICE_ID)
    .maybeSingle();

  if (deviceLookupError || !deviceRow) {
    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        error: `Ground Water Well device row not found (external_device_id="${WELL_EXTERNAL_DEVICE_ID}"): ${deviceLookupError?.message ?? "no matching row"}`,
      },
      { status: 500 },
    );
  }
  const wellDeviceId = deviceRow.id;

  let readings: NormalizedReading[] = [];
  let source: "oauth" | "legacy" | null = null;
  let oauthError: string | null = null;
  let legacyError: string | null = null;

  // --- Try 1: app.dtuip.com OAuth (no manual token) -----------------
  try {
    const { sensors, globalTime } = await getWellSensorsViaOAuth();
    const parsed: NormalizedReading[] = [];
    for (const sensor of sensors) {
      const key = String(sensor.sensorName ?? "").trim().toLowerCase();
      const metric = SENSOR_NAME_TO_METRIC[key];
      if (!metric) continue;
      const value = Number(sensor.value);
      if (Number.isNaN(value)) continue;
      parsed.push({
        metric,
        value,
        unit: METRIC_UNITS[metric] ?? "",
        recordedAt: parseDtuipTimestamp(sensor.updateDate ?? globalTime),
      });
    }
    if (parsed.length === 0) {
      throw new Error("OAuth response had no sensors matching SENSOR_NAME_TO_METRIC — response shape may differ from the Reservoir's");
    }
    readings = parsed;
    source = "oauth";
  } catch (err) {
    oauthError = err instanceof Error ? err.message : "Unknown OAuth error";
  }

  // --- Try 2: legacy front.dtuip.com bearer token, only if OAuth failed ---
  if (!source) {
    try {
      const sensors = await getSensorsByDeviceId(USER_ID, WELL_DEVICE_ID);
      const parsed: NormalizedReading[] = [];
      for (const sensor of sensors) {
        const metric = SENSOR_NAME_TO_METRIC[String(sensor.sensorName ?? "").trim().toLowerCase()];
        if (!metric || sensor.value == null) continue;
        const value = Number(sensor.value);
        if (Number.isNaN(value)) continue;
        parsed.push({
          metric,
          value,
          unit: sensor.unit || METRIC_UNITS[metric] || "",
          recordedAt: parseDtuipTimestamp(sensor.updateDateTime),
        });
      }
      readings = parsed;
      source = "legacy";
    } catch (err) {
      legacyError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  if (!source) {
    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        error: `Both well sync sources failed. OAuth (app.dtuip.com): ${oauthError}. Legacy token (front.dtuip.com): ${legacyError}`,
      },
      { status: 502 },
    );
  }

  const results: Array<{ label: string; ok: boolean; detail: string }> = [];
  for (const reading of readings) {
    const { error } = await supabase.from("sensor_readings").upsert(
      {
        device_id: wellDeviceId,
        metric: reading.metric,
        value: reading.value,
        unit: reading.unit,
        recorded_at: reading.recordedAt,
      },
      { onConflict: "device_id,metric,recorded_at", ignoreDuplicates: true },
    );
    results.push({
      label: `well/${reading.metric}`,
      ok: !error,
      detail: error ? error.message : `${reading.value} ${reading.unit} (via ${source})`,
    });
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    source,
    // Surfaced even on success so it's visible from the browser response
    // (not just server console) whenever the primary OAuth path silently
    // fell back to the legacy bearer-token client — tells us WHY without
    // needing terminal/log access.
    oauthAttempt: oauthError ? { ok: false, error: oauthError } : { ok: true },
    results,
  });
}