import { parseVendorTime } from "@/lib/parseLocalTime";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPressureDevice } from "@/lib/xyt/client";

/**
 * Pulls live readings from the XYT pressure-sensor platform
 * (111.19.141.81:8089) and writes them into this project's own Supabase
 * `devices`/`sensor_readings` tables.
 *
 * Auth here is a plain appkey/secret pair — see lib/xyt/client.ts for why
 * there's no login/token flow to worry about, unlike the groundwater well.
 *
 * DEVICE_IDS below are the 4 currently-installed pressure sensors' XYT
 * device IDs, confirmed from the old dev PC's working PHP
 * (pressuresensorControlleradmin.php's getDeviceName mapping) — these are
 * also already the `external_device_id` values seeded in supabase/seed.ts.
 * Pressure Sensor 5 (233614972) is left out: seed.ts marks it "offline"
 * and the old code's device-name map didn't include it either, so it may
 * not be provisioned on the XYT platform yet — add it here once confirmed.
 *
 * CONFIRMED (2026-09-09, real response) — the online flag and the numeric
 * reading both live inside `data`, not at the top level: `data.status` is
 * "在线"/"离线" (Chinese for online/offline, not English), and the reading
 * is `data.currentValue`. `data.receiveTime` ("YYYY-MM-DD HH:mm:ss") is
 * the sensor's own real last-upload time — used as recorded_at below
 * instead of "now", so a stale sensor actually shows as stale rather than
 * looking freshly synced every time this route runs.
 *
 * BATTERY (added 2026-09-21, corrected same day): `data.power` is battery
 * VOLTAGE in volts, NOT a 0-100 percentage — confirmed from live values
 * (3.64V-3.67V across all 4 sensors), which matches the nominal ~3.6V of
 * the ER-series lithium thionyl chloride (LiSOCl2) batteries used in these
 * pressure sensors (see the field-visit notes on ER34615-2+HPC
 * replacements).
 *
 * An earlier version of this route wrote the raw voltage straight into
 * battery_pct, which showed as a misleading "3.65%" (near dead). The next
 * version tried converting voltage to a 0-100% using an assumed 3.0V-3.6V
 * curve — but that guess was checked against the old swimproject3.com
 * site's own battery reading for the same sensor at the same time, and it
 * didn't match (old site: 51%, guessed conversion: 100%). Since the real
 * conversion formula the old site uses isn't known, guessing a third
 * formula would just produce another wrong number. So this now stores the
 * RAW VOLTAGE, unconverted — battery_pct holds a value like 3.65, meant to
 * be read as volts (the UI labels it "V", not "%"). Honest and unconverted
 * beats confidently wrong.
 */

const PRESSURE_EXTERNAL_IDS = ["233614968", "233614969", "233614970", "233614971"];

const XYT_ONLINE_VALUE = "在线";

/**
 * XYT sends "YYYY-MM-DD HH:mm:ss" with no timezone marker. `new Date()`
 * parses that space-separated form inconsistently across environments, so
 * convert it to the "T"-separated form first (same approach as the dtuip
 * route's parseDtuipTimestamp) and fall back to "now" if it's missing or
 * unparseable.
 */
function parseXytTimestamp(raw: string | null | undefined): string {
  return (parseVendorTime(raw) ?? new Date()).toISOString();
}

export async function GET() {
  const supabase = createAdminClient();
  const results: Array<{ label: string; ok: boolean; detail: string }> = [];

  for (const externalId of PRESSURE_EXTERNAL_IDS) {
    const { data: deviceRow, error: lookupError } = await supabase
      .from("devices")
      .select("id")
      .eq("external_device_id", externalId)
      .maybeSingle();

    if (lookupError || !deviceRow) {
      results.push({
        label: `pressure/${externalId}`,
        ok: false,
        detail: `Device row not found (external_device_id="${externalId}"): ${lookupError?.message ?? "no matching row"}`,
      });
      continue;
    }

    let xytResponse;
    try {
      xytResponse = await getPressureDevice(externalId);
    } catch (err) {
      results.push({
        label: `pressure/${externalId}`,
        ok: false,
        detail: err instanceof Error ? err.message : "Unknown error fetching from XYT",
      });
      continue;
    }

    const rawData = xytResponse.data;
    if (!rawData) {
      results.push({ label: `pressure/${externalId}`, ok: false, detail: `No "data" object in response: ${JSON.stringify(xytResponse).slice(0, 500)}` });
      continue;
    }

    const isOnline = rawData.status === XYT_ONLINE_VALUE;
    const recordedAt = parseXytTimestamp(rawData.receiveTime);

    const rawVoltage = Number(rawData.power);
    const batteryVoltage = Number.isFinite(rawVoltage) ? rawVoltage : null;

    // rssi (2026-09-22): XytDeviceData has always had this field (see
    // lib/xyt/client.ts) but nothing ever stored it — the devices table
    // had no column for it until now. Real signal-strength data was
    // sitting in every sync response, just discarded.
    const rawRssi = Number(rawData.rssi);
    const rssi = Number.isFinite(rawRssi) ? rawRssi : null;

    await supabase
      .from("devices")
      .update({
        status: isOnline ? "online" : "offline",
        last_update: recordedAt,
        battery_pct: batteryVoltage, // holds raw volts, not a percentage — see note above
        rssi,
      })
      .eq("id", deviceRow.id);

    const value = Number(rawData.currentValue);
    if (Number.isNaN(value)) {
      results.push({
        label: `pressure/${externalId}`,
        ok: false,
        detail: `No numeric "currentValue" field in response — raw data: ${JSON.stringify(rawData).slice(0, 500)}`,
      });
      continue;
    }

    const { error: insertError } = await supabase.from("sensor_readings").upsert(
      {
        device_id: deviceRow.id,
        metric: "pressure",
        value,
        unit: "bar",
        recorded_at: recordedAt,
      },
      { onConflict: "device_id,metric,recorded_at", ignoreDuplicates: true },
    );

    results.push({
      label: `pressure/${externalId}`,
      ok: !insertError,
      detail: insertError
        ? insertError.message
        : `${value} bar (${isOnline ? "online" : "offline"}, battery=${
            batteryVoltage != null ? `${batteryVoltage.toFixed(2)}V` : "unknown"
          })`,
    });
  }

  return NextResponse.json({ syncedAt: new Date().toISOString(), results });
}